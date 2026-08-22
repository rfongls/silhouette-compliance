import { z } from "zod";
import { callAnthropicJson, type ModelUsage } from "@/lib/analysis/anthropic";
import { buildControlEvaluationPrompt, buildSystemPrompt, type AnalysisScope } from "@/lib/analysis/prompts";
import type { NormalizedControl } from "@/lib/control-boards";

export const IRP_CONTROL_BATCH_SIZE = 20;
export const IRP_EVIDENCE_CHUNK_CHARS = 60000;

export type EvidenceDocument = { name: string; text: string };
export type AnalysisProgress = {
  completed: number;
  total: number;
  controlBatch: number;
  controlBatches: number;
  evidenceChunk: number;
  evidenceChunks: number;
  message: string;
};
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

export const SCORING_POLICY_VERSION = "hierarchical-risk-v1";
export const PRIORITY_WEIGHTS = { Critical: 4, High: 3, Medium: 2, Low: 1 } as const;

type ScoredControl = {
  status: Status;
  risk_level: string;
  category?: string;
};

function statusPoints(status: Status) {
  return status === "Yes" ? 1 : status === "Partial" ? 0.5 : 0;
}

export function normalizePriority(value: string): keyof typeof PRIORITY_WEIGHTS {
  const normalized = value.trim().toLocaleLowerCase();
  if (normalized === "critical") return "Critical";
  if (normalized === "high") return "High";
  if (normalized === "low") return "Low";
  return "Medium";
}

export function controlPriorityWeight(value: string) {
  return PRIORITY_WEIGHTS[normalizePriority(value)];
}

export function calculateWeightedComplianceScore(rows: ScoredControl[]) {
  if (!rows.length) return 0;
  const possible = rows.reduce((total, row) => total + controlPriorityWeight(row.risk_level), 0);
  const earned = rows.reduce((total, row) => total + statusPoints(row.status) * controlPriorityWeight(row.risk_level), 0);
  return possible ? Math.round((earned / possible) * 100) : 0;
}

export function calculateStandardComplianceScore(rows: ScoredControl[]) {
  if (!rows.length) return { score: 0, categories: {}, priority_tiers: {} };
  const byCategory = new Map<string, ScoredControl[]>();
  const byPriority = new Map<keyof typeof PRIORITY_WEIGHTS, ScoredControl[]>();
  for (const row of rows) {
    const category = row.category?.trim() || "General";
    byCategory.set(category, [...(byCategory.get(category) || []), row]);
    const priority = normalizePriority(row.risk_level);
    byPriority.set(priority, [...(byPriority.get(priority) || []), row]);
  }
  const categories = Object.fromEntries([...byCategory.entries()].map(([category, controls]) => {
    return [category, {
      score: calculateWeightedComplianceScore(controls),
      controls_reviewed: controls.length
    }];
  }));
  const priorityTiers = Object.fromEntries([...byPriority.entries()].map(([priority, controls]) => [
    priority.toLocaleLowerCase(),
    {
      score: calculateComplianceScore(controls.map((control) => control.status)),
      weight: PRIORITY_WEIGHTS[priority],
      controls_reviewed: controls.length
    }
  ]));
  const tiers = Object.values(priorityTiers);
  const possible = tiers.reduce((total, tier) => total + tier.weight, 0);
  const earned = tiers.reduce((total, tier) => total + tier.score * tier.weight, 0);
  return { score: possible ? Math.round(earned / possible) : 0, categories, priority_tiers: priorityTiers };
}

export function calculateOverallComplianceScore(standardScores: number[]) {
  if (!standardScores.length) return 0;
  return Math.round(standardScores.reduce((total, standardScore) => total + standardScore, 0) / standardScores.length);
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
  onProgress?: (progress: AnalysisProgress) => void | Promise<void>;
}) {
  const chunks = chunkEvidenceDocuments(input.documents);
  if (!chunks.length) throw new Error("No readable policy text was supplied for this organization.");
  const system = buildSystemPrompt(input.scope);
  const best = new Map<string, { status: Status; quote: string; document: string; finding: string }>();
  const usage: Required<ModelUsage> = { inputTokens: 0, outputTokens: 0 };
  const controlBatches = batches(input.controls, IRP_CONTROL_BATCH_SIZE);
  const total = controlBatches.length * chunks.length;
  let completed = 0;

  for (const [controlBatchIndex, controlBatch] of controlBatches.entries()) {
    for (const [evidenceChunkIndex, evidenceChunk] of chunks.entries()) {
      if (completed === 0) {
        await input.onProgress?.({
          completed,
          total,
          controlBatch: controlBatchIndex + 1,
          controlBatches: controlBatches.length,
          evidenceChunk: evidenceChunkIndex + 1,
          evidenceChunks: chunks.length,
          message: `Analyzing policy segment ${evidenceChunkIndex + 1} of ${chunks.length} against control batch ${controlBatchIndex + 1} of ${controlBatches.length}.`
        });
      }
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
      completed += 1;
      await input.onProgress?.({
        completed,
        total,
        controlBatch: controlBatchIndex + 1,
        controlBatches: controlBatches.length,
        evidenceChunk: evidenceChunkIndex + 1,
        evidenceChunks: chunks.length,
        message: `Analyzed policy segment ${evidenceChunkIndex + 1} of ${chunks.length} against control batch ${controlBatchIndex + 1} of ${controlBatches.length}.`
      });
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
      priority_weight: controlPriorityWeight(control.risk_level),
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
    const weighted = calculateStandardComplianceScore(rows);
    const priorities = Object.fromEntries(Object.keys(PRIORITY_WEIGHTS).map((priority) => [
      priority.toLocaleLowerCase(),
      rows.filter((row) => normalizePriority(row.risk_level) === priority).length
    ]));
    return [standard.toLocaleLowerCase(), {
      score: weighted.score,
      controls_reviewed: rows.length,
      controls_met: met,
      controls_partial: partial,
      controls_failed: failed,
      priority_counts: priorities,
      priority_tier_scores: weighted.priority_tiers,
      category_scores: weighted.categories
    }];
  }));
  const met = findings.filter((row) => row.status === "Yes").length;
  const partial = findings.filter((row) => row.status === "Partial").length;
  const standardScores = Object.values(scoreBreakdown).map((standard) => standard.score);
  const score = calculateOverallComplianceScore(standardScores);
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
      scoring_policy_version: SCORING_POLICY_VERSION,
      scoring_summary: {
        selected_standards: input.scope.standards.length,
        points_possible: input.scope.standards.length * 100,
        points_earned: standardScores.reduce((total, standardScore) => total + standardScore, 0),
        overall_score: score,
        standard_weighting: "Each selected standard contributes equally to the overall 100-point score."
      },
      posture_summary: `${met} of ${findings.length} controls were fully evidenced; ${partial} were partially evidenced and ${findings.length - met - partial} were not evidenced.`,
      counts,
      findings,
      remediation_roadmap: roadmap(findings),
      scoring_method: "Server-calculated hierarchical risk score: Yes=1, Partial=0.5, No=0; controls are averaged inside approved Critical, High, Medium, and Low priority tiers; present tiers are combined at weights 4, 3, 2, and 1 so raw control counts cannot make a lower-priority tier dominate a higher-priority tier; each selected standard is normalized to 100 points and selected standard scores are averaged equally into the overall 100-point score."
    },
    usage
  };
}
