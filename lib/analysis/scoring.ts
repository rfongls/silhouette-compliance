import { z } from "zod";
import { callAnthropicJson, type ModelUsage } from "@/lib/analysis/anthropic";
import { buildControlEvaluationPrompt, buildSystemPrompt, type AnalysisScope } from "@/lib/analysis/prompts";
import type { NormalizedControl } from "@/lib/control-boards";

export const IRP_CONTROL_BATCH_SIZE = 20;
export const IRP_EVIDENCE_CHUNK_CHARS = 60000;

export type EvidenceDocument = { name: string; text: string };
type Status = "Yes" | "Partial" | "No";

const responseSchema = z.object({
  evaluations: z.array(z.object({
    control_id: z.string(),
    standard: z.string(),
    status: z.enum(["Yes", "Partial", "No"]),
    evidence_quote: z.string().default(""),
    finding: z.string().default("")
  }))
});

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, " ").trim().toLocaleLowerCase();
}

export function validateEvidenceStatus(status: Status, quote: string, evidenceText: string): Status {
  if (status === "No") return "No";
  const normalizedQuote = normalizeWhitespace(quote);
  return normalizedQuote && normalizeWhitespace(evidenceText).includes(normalizedQuote) ? status : "No";
}

function batches<T>(rows: T[], size: number) {
  return Array.from({ length: Math.ceil(rows.length / size) }, (_, index) => rows.slice(index * size, (index + 1) * size));
}

export function chunkEvidenceDocuments(documents: EvidenceDocument[]) {
  return documents.flatMap((document) => {
    if (!document.text.length) return [];
    const chunks: { name: string; chunk: number; text: string }[] = [];
    for (let start = 0, chunk = 1; start < document.text.length; chunk += 1) {
      let end = Math.min(document.text.length, start + IRP_EVIDENCE_CHUNK_CHARS);
      if (end < document.text.length) {
        const boundary = document.text.lastIndexOf("\n", end);
        if (boundary > start + Math.floor(IRP_EVIDENCE_CHUNK_CHARS * 0.75)) end = boundary + 1;
      }
      chunks.push({ name: document.name, chunk, text: document.text.slice(start, end) });
      start = end;
    }
    return chunks;
  });
}

function controlKey(standard: string, id: string) {
  return `${standard.trim().toLocaleUpperCase()}::${id.trim().toLocaleUpperCase()}`;
}

function statusRank(status: Status) {
  return status === "Yes" ? 2 : status === "Partial" ? 1 : 0;
}

function posture(score: number) {
  if (score >= 85) return "Compliant";
  if (score >= 50) return "Partially Compliant";
  return "Non-Compliant";
}

export function calculateComplianceScore(statuses: Status[]) {
  if (!statuses.length) return 0;
  const points = statuses.reduce((total, status) => total + (status === "Yes" ? 1 : status === "Partial" ? 0.5 : 0), 0);
  return Math.round((points / statuses.length) * 100);
}

function roadmap(findings: any[]) {
  const phases = [
    { name: "Immediate", timeframe: "Within 30 days", color: "critical", risks: new Set(["Critical"]) },
    { name: "Stabilize", timeframe: "31-60 days", color: "high", risks: new Set(["High"]) },
    { name: "Operationalize", timeframe: "61-90 days", color: "medium", risks: new Set(["Medium"]) },
    { name: "Sustain", timeframe: "Quarterly", color: "low", risks: new Set(["Low"]) }
  ];
  return {
    phases: phases.map((phase) => ({
      name: phase.name,
      timeframe: phase.timeframe,
      color: phase.color,
      items: findings.filter((finding) => finding.status !== "Yes" && phase.risks.has(finding.risk_level)).map((finding, index) => ({
        number: index + 1,
        title: `${finding.control_id} remediation`,
        description: finding.finding,
        references: [finding.control_id]
      }))
    }))
  };
}

export function scoringPassCount(controlCount: number, maxCharsPerOrg: number) {
  return Math.max(1, Math.ceil(controlCount / IRP_CONTROL_BATCH_SIZE)) * Math.max(1, Math.ceil(maxCharsPerOrg / IRP_EVIDENCE_CHUNK_CHARS));
}

export async function scoreControlSet(input: {
  orgName: string;
  scope: AnalysisScope;
  controls: NormalizedControl[];
  documents: EvidenceDocument[];
  boardCite: string;
}) {
  const chunks = chunkEvidenceDocuments(input.documents);
  if (!chunks.length) throw new Error("No readable policy text was supplied for this organization.");
  const system = buildSystemPrompt(input.scope);
  const best = new Map<string, { status: Status; quote: string; document: string; finding: string }>();
  const usage: Required<ModelUsage> = { inputTokens: 0, outputTokens: 0 };

  for (const controlBatch of batches(input.controls, IRP_CONTROL_BATCH_SIZE)) {
    for (const evidenceChunk of chunks) {
      const prompt = buildControlEvaluationPrompt({
        orgName: input.orgName,
        scope: input.scope,
        controls: controlBatch,
        evidenceChunk,
        boardCite: input.boardCite
      });
      const response = await callAnthropicJson(system, prompt);
      usage.inputTokens += response.usage.inputTokens || 0;
      usage.outputTokens += response.usage.outputTokens || 0;
      const parsed = responseSchema.parse(response.json);
      for (const evaluation of parsed.evaluations) {
        const key = controlKey(evaluation.standard, evaluation.control_id);
        const expected = controlBatch.find((control) => controlKey(control.standard, control.id) === key);
        if (!expected) continue;
        const quote = evaluation.evidence_quote.trim();
        const status = validateEvidenceStatus(evaluation.status, quote, evidenceChunk.text);
        const candidate = {
          status,
          quote: status === "No" ? "" : quote,
          document: status === "No" ? "" : evidenceChunk.name,
          finding: evaluation.finding.trim() || (status === "No" ? "Requirement was not evidenced in the submitted policies." : "Requirement is evidenced in the submitted policies.")
        };
        const current = best.get(key);
        if (!current || statusRank(candidate.status) > statusRank(current.status)) best.set(key, candidate);
      }
    }
  }

  const findings = input.controls.map((control) => {
    const evaluation = best.get(controlKey(control.standard, control.id)) || {
      status: "No" as const,
      quote: "",
      document: "",
      finding: "The model did not return a valid evaluation for this control; it is treated as not evidenced."
    };
    return {
      control_id: control.id,
      control_name: control.category || control.id,
      standards: [control.standard],
      requirement: control.requirement,
      status: evaluation.status,
      risk_level: control.risk_level,
      evidence: evaluation.status === "No" ? "Not addressed" : `${evaluation.document}: \"${evaluation.quote}\"`,
      evidence_document: evaluation.document,
      evidence_quote: evaluation.quote,
      finding: evaluation.finding
    };
  });

  const scoreBreakdown = Object.fromEntries(input.scope.standards.map((standard) => {
    const rows = findings.filter((finding) => finding.standards.includes(standard));
    const met = rows.filter((row) => row.status === "Yes").length;
    const partial = rows.filter((row) => row.status === "Partial").length;
    const failed = rows.filter((row) => row.status === "No").length;
    const score = calculateComplianceScore(rows.map((row) => row.status));
    return [standard.toLocaleLowerCase(), { score, controls_reviewed: rows.length, controls_met: met, controls_partial: partial, controls_failed: failed }];
  }));
  const met = findings.filter((row) => row.status === "Yes").length;
  const partial = findings.filter((row) => row.status === "Partial").length;
  const score = calculateComplianceScore(findings.map((finding) => finding.status));
  const gaps = findings.filter((row) => row.status !== "Yes");
  const counts = {
    total: findings.length,
    critical: gaps.filter((row) => row.risk_level.toLocaleLowerCase() === "critical").length,
    high: gaps.filter((row) => row.risk_level.toLocaleLowerCase() === "high").length,
    medium: gaps.filter((row) => row.risk_level.toLocaleLowerCase() === "medium").length,
    low: gaps.filter((row) => row.risk_level.toLocaleLowerCase() === "low").length
  };

  return {
    result: {
      organization_name: input.orgName,
      document_type: "Incident Response Plan",
      document_name: `${input.orgName} - Incident Response Plan`,
      entity_type: "Unknown",
      overall_posture: posture(score),
      compliance_score: score,
      score_breakdown: scoreBreakdown,
      posture_summary: `${met} of ${findings.length} controls were fully evidenced; ${partial} were partially evidenced and ${findings.length - met - partial} were not evidenced.`,
      counts,
      findings,
      remediation_roadmap: roadmap(findings),
      scoring_method: "Server-calculated: Yes=1, Partial=0.5, No=0; all published controls remain in the denominator."
    },
    usage
  };
}
