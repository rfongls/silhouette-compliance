import { z } from "zod";
import { callAnthropicJson, type ModelUsage } from "@/lib/analysis/anthropic";
import { buildControlEvaluationPrompt, buildSystemPrompt, type AnalysisScope } from "@/lib/analysis/prompts";
import { IRP_CAPABILITY_BUCKETS, IRP_SCORING_PROFILE_VERSION, profileIrpControls, type ProfiledControl } from "@/lib/analysis/scoring-profile";
import { buildActionableRoadmapItem } from "@/lib/analysis/remediation";
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

export type AnalysisCheckpointEvaluation = {
  key: string;
  status: Status;
  quote: string;
  document: string;
  finding: string;
};

export type AnalysisPassCheckpoint = {
  passKey: string;
  controlBatch: number;
  evidenceChunk: number;
  evaluations: AnalysisCheckpointEvaluation[];
  inputTokens: number;
  outputTokens: number;
};

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

export const SCORING_POLICY_VERSION = "bucketed-capability-v2";
export const PRIORITY_WEIGHTS = { Critical: 4, High: 3, Medium: 2, Low: 1 } as const;

type ScoredControl = {
  status: Status;
  risk_level: string;
  category?: string;
};

type BucketedScoredControl = ScoredControl & {
  bucket_id: string;
  bucket_label: string;
  capability: string;
  essential: boolean;
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

function mergeCheckpointEvaluations(
  best: Map<string, Omit<AnalysisCheckpointEvaluation, "key">>,
  evaluations: AnalysisCheckpointEvaluation[]
) {
  for (const { key, ...candidate } of evaluations) {
    const current = best.get(key);
    if (!current || statusRank(candidate.status) > statusRank(current.status)) best.set(key, candidate);
  }
}

export function calculateBucketedComplianceScore(rows: BucketedScoredControl[]) {
  if (!rows.length) return { score: 0, points_earned: 0, points_possible: 100, buckets: {} };
  const activeDefinitions = IRP_CAPABILITY_BUCKETS.filter((bucket) => rows.some((row) => row.bucket_id === bucket.id));
  const activeConfiguredPoints = activeDefinitions.reduce((total, bucket) => total + bucket.points, 0);
  const bucketScores = Object.fromEntries(activeDefinitions.map((bucket) => {
    const bucketRows = rows.filter((row) => row.bucket_id === bucket.id);
    const byCapability = new Map<string, BucketedScoredControl[]>();
    for (const row of bucketRows) {
      const capability = row.capability.trim() || bucket.label;
      byCapability.set(capability, [...(byCapability.get(capability) || []), row]);
    }
    const capabilities = Object.fromEntries([...byCapability.entries()].map(([capability, controls]) => [capability, {
      score: calculateWeightedComplianceScore(controls),
      controls_reviewed: controls.length
    }]));
    const capabilityScores = Object.values(capabilities).map((capability) => capability.score);
    let bucketScore = capabilityScores.length
      ? Math.round(capabilityScores.reduce((total, capabilityScore) => total + capabilityScore, 0) / capabilityScores.length)
      : 0;
    const essentialControls = bucketRows.filter((row) => row.essential);
    if (essentialControls.some((row) => row.status === "No")) bucketScore = Math.min(bucketScore, 50);
    else if (essentialControls.some((row) => row.status === "Partial")) bucketScore = Math.min(bucketScore, 75);
    const pointsPossible = activeConfiguredPoints ? (bucket.points / activeConfiguredPoints) * 100 : 0;
    const pointsEarned = pointsPossible * (bucketScore / 100);
    return [bucket.id, {
      label: bucket.label,
      description: bucket.description,
      score: bucketScore,
      points_possible: Number(pointsPossible.toFixed(1)),
      points_earned: Number(pointsEarned.toFixed(1)),
      controls_reviewed: bucketRows.length,
      essential_controls: essentialControls.length,
      capabilities
    }];
  }));
  const pointsEarned = Object.values(bucketScores).reduce((total, bucket) => total + bucket.points_earned, 0);
  return {
    score: Math.round(pointsEarned),
    points_earned: Number(pointsEarned.toFixed(1)),
    points_possible: 100,
    buckets: bucketScores
  };
}

export function consolidateRemediationFindings(controlResults: any[]) {
  const groups = new Map<string, any[]>();
  for (const result of controlResults.filter((row) => row.status !== "Yes")) {
    const key = `${result.bucket_id}::${String(result.capability || result.bucket_label).trim().toLocaleLowerCase()}`;
    groups.set(key, [...(groups.get(key) || []), result]);
  }
  return [...groups.values()].map((rows, index) => {
    const noCount = rows.filter((row) => row.status === "No").length;
    const partialCount = rows.length - noCount;
    const riskLevel = rows.reduce<keyof typeof PRIORITY_WEIGHTS>((highest, row) => (
      controlPriorityWeight(row.risk_level) > controlPriorityWeight(highest) ? normalizePriority(row.risk_level) : highest
    ), "Low");
    const capability = rows[0].capability || rows[0].bucket_label;
    const controlIds = rows.map((row) => row.control_id);
    const standards = [...new Set(rows.flatMap((row) => row.standards || []).map(String))];
    const summary = [
      noCount ? `${noCount} control${noCount === 1 ? "" : "s"} not evidenced` : "",
      partialCount ? `${partialCount} control${partialCount === 1 ? "" : "s"} partially evidenced` : ""
    ].filter(Boolean).join(" and ");
    return {
      control_id: rows.length === 1 ? rows[0].control_id : `${String(rows[0].bucket_id).toLocaleUpperCase()}-${index + 1}`,
      control_ids: controlIds,
      control_count: rows.length,
      control_name: capability,
      capability,
      bucket_id: rows[0].bucket_id,
      bucket_label: rows[0].bucket_label,
      standards,
      requirement: rows.length === 1 ? rows[0].requirement : `${capability} requirements mapped from ${rows.length} applicable controls.`,
      status: noCount ? "No" : "Partial",
      risk_level: riskLevel,
      priority_weight: PRIORITY_WEIGHTS[riskLevel],
      evidence: rows.filter((row) => row.evidence_quote).slice(0, 3).map((row) => row.evidence).join(" | ") || "Not addressed",
      finding: `${summary} for ${capability}. Review the mapped controls and add specific policy language or supporting evidence.`,
      mapped_controls: rows.map((row) => ({
        control_id: row.control_id,
        standards: row.standards,
        requirement: row.requirement,
        status: row.status,
        risk_level: row.risk_level,
        evidence: row.evidence
      }))
    };
  });
}

function remediationPriority(a: any, b: any) {
  const priority = { Critical: 4, High: 3, Medium: 2, Low: 1 } as Record<string, number>;
  const riskDifference = (priority[b.risk_level] || 0) - (priority[a.risk_level] || 0);
  if (riskDifference) return riskDifference;
  const statusDifference = (b.status === "No" ? 1 : 0) - (a.status === "No" ? 1 : 0);
  if (statusDifference) return statusDifference;
  const controlDifference = Number(b.control_count || b.control_ids?.length || 1) - Number(a.control_count || a.control_ids?.length || 1);
  if (controlDifference) return controlDifference;
  const standardDifference = Number(b.standards?.length || 0) - Number(a.standards?.length || 0);
  if (standardDifference) return standardDifference;
  return String(a.control_id || "").localeCompare(String(b.control_id || ""));
}

export function buildRemediationRoadmap(findings: any[]) {
  const phases = [
    { name: "Immediate", timeframe: "Within 30 days", color: "critical", risks: new Set(["Critical"]) },
    { name: "Stabilize", timeframe: "31-60 days", color: "high", risks: new Set(["High"]) },
    { name: "Operationalize", timeframe: "61-90 days", color: "medium", risks: new Set(["Medium"]) },
    { name: "Sustain", timeframe: "Quarterly", color: "low", risks: new Set(["Low"]) }
  ];
  const selected = findings
    .filter((finding) => finding.status !== "Yes")
    .sort(remediationPriority)
    .slice(0, 5);
  return {
    phases: phases.map((phase) => ({
      name: phase.name,
      timeframe: phase.timeframe,
      color: phase.color,
      items: selected
        .filter((finding) => phase.risks.has(finding.risk_level))
        .map((finding) => buildActionableRoadmapItem(finding, selected.indexOf(finding) + 1))
    })).filter((phase) => phase.items.length)
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
  completedPasses?: AnalysisPassCheckpoint[];
  onCheckpoint?: (checkpoint: AnalysisPassCheckpoint) => void | Promise<void>;
}) {
  const profile = profileIrpControls(input.controls);
  const profiledControls = profile.controls;
  const chunks = chunkEvidenceDocuments(input.documents);
  if (!chunks.length) throw new Error("No readable policy text was supplied for this organization.");
  const system = buildSystemPrompt(input.scope);
  const best = new Map<string, { status: Status; quote: string; document: string; finding: string }>();
  const usage: Required<ModelUsage> = { inputTokens: 0, outputTokens: 0 };
  const controlBatches = batches(profiledControls, IRP_CONTROL_BATCH_SIZE);
  const total = controlBatches.length * chunks.length;
  const completedPasses = new Map(
    (input.completedPasses || [])
      .filter((checkpoint) =>
        checkpoint.controlBatch >= 1 &&
        checkpoint.controlBatch <= controlBatches.length &&
        checkpoint.evidenceChunk >= 1 &&
        checkpoint.evidenceChunk <= chunks.length &&
        checkpoint.passKey === `${checkpoint.controlBatch}:${checkpoint.evidenceChunk}`
      )
      .map((checkpoint) => [checkpoint.passKey, checkpoint])
  );
  for (const checkpoint of completedPasses.values()) {
    mergeCheckpointEvaluations(best, checkpoint.evaluations);
    usage.inputTokens += checkpoint.inputTokens || 0;
    usage.outputTokens += checkpoint.outputTokens || 0;
  }
  let completed = completedPasses.size;

  await input.onProgress?.({
    completed,
    total,
    controlBatch: 0,
    controlBatches: controlBatches.length,
    evidenceChunk: 0,
    evidenceChunks: chunks.length,
    message: completed
      ? `Resuming with ${completed} of ${total} analysis passes already checkpointed.`
      : `Starting ${total} analysis passes.`
  });

  for (const [controlBatchIndex, controlBatch] of controlBatches.entries()) {
    for (const [evidenceChunkIndex, evidenceChunk] of chunks.entries()) {
      const passKey = `${controlBatchIndex + 1}:${evidenceChunkIndex + 1}`;
      if (completedPasses.has(passKey)) continue;
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
      const checkpointEvaluations: AnalysisCheckpointEvaluation[] = [];
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
        checkpointEvaluations.push({ key, ...candidate });
      }
      const checkpoint: AnalysisPassCheckpoint = {
        passKey,
        controlBatch: controlBatchIndex + 1,
        evidenceChunk: evidenceChunkIndex + 1,
        evaluations: checkpointEvaluations,
        inputTokens: response.usage.inputTokens || 0,
        outputTokens: response.usage.outputTokens || 0
      };
      await input.onCheckpoint?.(checkpoint);
      completedPasses.set(passKey, checkpoint);
      mergeCheckpointEvaluations(best, checkpointEvaluations);
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

  const controlResults = profiledControls.map((control: ProfiledControl) => {
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
      finding: evaluation.finding,
      bucket_id: control.bucket_id,
      bucket_label: control.bucket_label,
      capability: control.capability,
      essential: control.essential
    };
  });

  const findings = consolidateRemediationFindings(controlResults);

  const scoreBreakdown = Object.fromEntries(input.scope.standards.map((standard) => {
    const rows = controlResults.filter((finding) => finding.standards.includes(standard));
    const met = rows.filter((row) => row.status === "Yes").length;
    const partial = rows.filter((row) => row.status === "Partial").length;
    const failed = rows.filter((row) => row.status === "No").length;
    const weighted = calculateStandardComplianceScore(rows);
    const bucketed = calculateBucketedComplianceScore(rows);
    const priorities = Object.fromEntries(Object.keys(PRIORITY_WEIGHTS).map((priority) => [
      priority.toLocaleLowerCase(),
      rows.filter((row) => normalizePriority(row.risk_level) === priority).length
    ]));
    return [standard.toLocaleLowerCase(), {
      score: bucketed.score,
      controls_reviewed: rows.length,
      controls_met: met,
      controls_partial: partial,
      controls_failed: failed,
      priority_counts: priorities,
      priority_tier_scores: weighted.priority_tiers,
      category_scores: weighted.categories,
      bucket_scores: bucketed.buckets
    }];
  }));
  const met = controlResults.filter((row) => row.status === "Yes").length;
  const partial = controlResults.filter((row) => row.status === "Partial").length;
  const bucketedScore = calculateBucketedComplianceScore(controlResults);
  const score = bucketedScore.score;
  const counts = {
    total: controlResults.length,
    findings: findings.length,
    critical: findings.filter((row) => row.risk_level.toLocaleLowerCase() === "critical").length,
    high: findings.filter((row) => row.risk_level.toLocaleLowerCase() === "high").length,
    medium: findings.filter((row) => row.risk_level.toLocaleLowerCase() === "medium").length,
    low: findings.filter((row) => row.risk_level.toLocaleLowerCase() === "low").length
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
      scoring_profile_version: IRP_SCORING_PROFILE_VERSION,
      bucket_scores: bucketedScore.buckets,
      scoring_summary: {
        selected_standards: input.scope.standards.length,
        points_possible: bucketedScore.points_possible,
        points_earned: bucketedScore.points_earned,
        overall_score: score,
        bucket_weighting: "Applicable controls are grouped into fixed IRP capability buckets whose available points normalize to 100.",
        standard_weighting: "Selected-standard scores are secondary alignment views and are not added again to the overall score.",
        source_controls: input.controls.length,
        applicable_controls: controlResults.length,
        excluded_controls: profile.excludedCount
      },
      posture_summary: `${met} of ${controlResults.length} applicable controls were fully evidenced; ${partial} were partially evidenced and ${controlResults.length - met - partial} were not evidenced across ${Object.keys(bucketedScore.buckets).length} scored capability buckets.`,
      counts,
      findings,
      control_results: controlResults,
      remediation_roadmap: buildRemediationRoadmap(findings),
      scoring_method: "Server-calculated bucketed IRP readiness score: applicable controls are grouped into curated capability buckets; Yes=1, Partial=0.5, and No=0 with Critical, High, Medium, and Low weights of 4, 3, 2, and 1; capabilities contribute equally inside each bucket; bucket point budgets normalize to 100; missing essential controls cap their bucket at 50 and partial essential controls cap it at 75. Standards remain separate alignment views without duplicate contribution to the overall score."
    },
    usage
  };
}
