import { buildSystemPrompt, buildUserPrompt } from "@/lib/analysis/prompts";
import { callAnthropicJson, type ModelUsage } from "@/lib/analysis/anthropic";
import { defaultStandards } from "@/lib/analysis/standards";
import { sanitizeForExport } from "@/lib/sanitize";

export type AssessInput = { orgName?: string; industry: string; standards?: string[]; documents: { name: string; text: string }[]; controls: unknown[]; boardCite?: string };

export async function runGapAnalysis(input: AssessInput): Promise<{ result: any; usage: ModelUsage }> {
  const standards = input.standards?.length ? input.standards : defaultStandards(input.industry);
  const text = input.documents.map((d) => `FILE: ${d.name}\n${d.text}`).join("\n\n---\n\n");
  const scope = { industry: input.industry, standards };
  const system = buildSystemPrompt(scope);
  const prompt = buildUserPrompt({ orgName: input.orgName, fileNames: input.documents.map((d) => d.name), text, scope, controls: input.controls, boardCite: input.boardCite });
  const { json, usage } = await callAnthropicJson(system, prompt);
  return { result: normalizeResult(json, input.orgName), usage };
}

export function normalizeResult(raw: unknown, fallbackOrg?: string) {
  const r = sanitizeForExport(raw) as any;
  const score = Number(r.compliance_score ?? r.score ?? 0);
  const posture = r.overall_posture || (score >= 85 ? "Compliant" : score >= 50 ? "Partially Compliant" : "Non-Compliant");
  r.organization_name = r.organization_name || fallbackOrg || "Unknown Organization";
  r.compliance_score = Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : 0;
  r.overall_posture = posture;
  r.findings = Array.isArray(r.findings) ? r.findings : [];
  r.remediation_roadmap = r.remediation_roadmap || { phases: [] };
  return r;
}

export function demoAssessment(orgName = "Kalihi Palama Health Center", industry = "health-center") {
  return normalizeResult({
    organization_name: orgName,
    document_type: "Incident Response Plan",
    document_name: `${orgName} - Incident Response Plan`,
    entity_type: "CE",
    overall_posture: "Partially Compliant",
    compliance_score: 74,
    score_breakdown: { hipaa: { score: 72, controls_reviewed: 22, controls_met: 12, controls_partial: 8, controls_failed: 2 }, nist: { score: 76, controls_reviewed: 18, controls_met: 10, controls_partial: 7, controls_failed: 1 } },
    posture_summary: "Core response structure exists; testing, reporting, and evidence retention need tightening.",
    counts: { total: 4, critical: 0, high: 1, medium: 3, low: 0 },
    findings: [
      { control_id: "164.308(a)(6)", control_name: "Security incident procedures", standards: ["HIPAA"], requirement: "Identify and respond to suspected security incidents", status: "Partial", risk_level: "High", evidence: "Incident roles are named but escalation timelines are incomplete", finding: "Reporting timelines and external notification triggers are not fully defined" },
      { control_id: "IR-6", control_name: "Incident reporting", standards: ["NIST"], requirement: "Report incidents to appropriate authorities", status: "Partial", risk_level: "Medium", evidence: "Internal reporting is described", finding: "External reporting authorities and timing are incomplete" },
      { control_id: "IR-3", control_name: "Incident response testing", standards: ["NIST"], requirement: "Test incident response capability", status: "No", risk_level: "Medium", evidence: "Not addressed", finding: "No tabletop or test cadence is documented" },
      { control_id: "164.316(b)(2)", control_name: "Documentation retention", standards: ["HIPAA"], requirement: "Retain required documentation for six years", status: "Yes", risk_level: "Low", evidence: "Policy states six-year retention", finding: "Retention requirement is addressed" }
    ],
    remediation_roadmap: { phases: [
      { name: "Immediate", timeframe: "Within 30 days", color: "critical", items: [{ number: 1, title: "Define notification triggers", description: "Add OCR, patient, partner, and law enforcement notification triggers with owners and clocks", references: ["164.308(a)(6)"] }] },
      { name: "Stabilize", timeframe: "31-60 days", color: "high", items: [{ number: 1, title: "Run tabletop", description: "Conduct and document a breach tabletop exercise", references: ["IR-3"] }] },
      { name: "Operationalize", timeframe: "61-90 days", color: "medium", items: [{ number: 1, title: "Evidence binder", description: "Create a repeatable incident evidence and decision log", references: ["164.316(b)(2)"] }] },
      { name: "Sustain", timeframe: "Quarterly", color: "low", items: [{ number: 1, title: "Quarterly review", description: "Review incidents, lessons learned, and contact lists every quarter", references: ["IR-8"] }] }
    ] },
    _demo: true,
    _industry: industry
  }, orgName);
}
