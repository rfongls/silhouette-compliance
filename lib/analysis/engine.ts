import type { ModelUsage } from "@/lib/analysis/anthropic";
import { defaultStandards } from "@/lib/analysis/standards";
import { scoreControlSet, type AnalysisPassCheckpoint, type AnalysisProgress } from "@/lib/analysis/scoring";
import type { NormalizedControl } from "@/lib/control-boards";
import { sanitizeForExport } from "@/lib/sanitize";

export { demoAssessment } from "@/lib/analysis/irp-demo";

export type AssessInput = { orgName?: string; industry: string; standards?: string[]; documents: { name: string; text: string }[]; controls: NormalizedControl[]; boardCite?: string; onProgress?: (progress: AnalysisProgress) => void | Promise<void>; completedPasses?: AnalysisPassCheckpoint[]; onCheckpoint?: (checkpoint: AnalysisPassCheckpoint) => void | Promise<void> };

export async function runGapAnalysis(input: AssessInput): Promise<{ result: any; usage: ModelUsage }> {
  const standards = input.standards?.length ? input.standards : defaultStandards(input.industry);
  const scope = { industry: input.industry, standards };
  const { result, usage } = await scoreControlSet({ orgName: input.orgName || "Unknown Organization", scope, controls: input.controls, documents: input.documents, boardCite: input.boardCite || "", onProgress: input.onProgress, completedPasses: input.completedPasses, onCheckpoint: input.onCheckpoint });
  return { result: normalizeResult(result, input.orgName), usage };
}

export function normalizeResult(raw: unknown, fallbackOrg?: string) {
  const r = sanitizeForExport(raw) as any;
  const score = Number(r.compliance_score ?? r.score ?? 0);
  const posture = r.overall_posture || (score >= 85 ? "Compliant" : score >= 50 ? "Partially Compliant" : "Non-Compliant");
  r.organization_name = fallbackOrg || r.organization_name || "Unknown Organization";
  r.compliance_score = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  r.overall_posture = posture;
  r.findings = Array.isArray(r.findings) ? r.findings : [];
  r.remediation_roadmap = r.remediation_roadmap || { phases: [] };
  return r;
}
