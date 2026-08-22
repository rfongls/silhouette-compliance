import type { ModelUsage } from "@/lib/analysis/anthropic";
import { defaultStandards } from "@/lib/analysis/standards";
import { scoreControlSet, type AnalysisProgress } from "@/lib/analysis/scoring";
import type { NormalizedControl } from "@/lib/control-boards";
import { demoOrgName } from "@/lib/demo";
import { sanitizeForExport } from "@/lib/sanitize";

export type AssessInput = { orgName?: string; industry: string; standards?: string[]; documents: { name: string; text: string }[]; controls: NormalizedControl[]; boardCite?: string; onProgress?: (progress: AnalysisProgress) => void | Promise<void> };

export async function runGapAnalysis(input: AssessInput): Promise<{ result: any; usage: ModelUsage }> {
  const standards = input.standards?.length ? input.standards : defaultStandards(input.industry);
  const scope = { industry: input.industry, standards };
  const { result, usage } = await scoreControlSet({ orgName: input.orgName || "Unknown Organization", scope, controls: input.controls, documents: input.documents, boardCite: input.boardCite || "", onProgress: input.onProgress });
  return { result: normalizeResult(result, input.orgName), usage };
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

export function demoAssessment(_orgName = "", industry = "health-center") {
  const safeOrgName = demoOrgName(industry);
  return normalizeResult({
    organization_name: safeOrgName,
    document_type: "Incident Response Plan",
    document_name: "JCHC-Incident-Response-Plan-v3.2-2026.pdf",
    entity_type: "CE",
    overall_posture: "Partially Compliant",
    compliance_score: 71,
    score_breakdown: {
      hipaa: { score: 68, controls_reviewed: 26, controls_met: 15, controls_partial: 8, controls_failed: 3 },
      nist: { score: 74, controls_reviewed: 21, controls_met: 13, controls_partial: 6, controls_failed: 2 }
    },
    posture_summary: "Johnson Community Health Center has a credible incident response structure with defined roles, severity levels, response phases, and recovery authority. The most significant gaps are incomplete regulatory notification procedures, a three-year records retention period, and the absence of a required exercise and corrective-action cadence.",
    counts: { total: 8, critical: 0, high: 3, medium: 3, low: 0 },
    findings: [
      { control_id: "164.308(a)(6)(i)", control_name: "Security incident procedures", standards: ["HIPAA"], requirement: "Implement policies and procedures to address security incidents", status: "Yes", risk_level: "High", evidence: "Section 7 defines identification, containment, eradication, recovery, and closure procedures.", finding: "The policy establishes a complete core incident-response lifecycle." },
      { control_id: "164.308(a)(6)(ii)", control_name: "Response and reporting", standards: ["HIPAA"], requirement: "Identify, respond to, mitigate, and document security incidents", status: "Partial", risk_level: "High", evidence: "Section 8 states that notification timing will follow applicable legal and contractual requirements.", finding: "Regulatory clocks, decision criteria, responsible contacts, and after-hours escalation procedures are not enumerated." },
      { control_id: "164.316(b)(2)(i)", control_name: "Documentation retention", standards: ["HIPAA"], requirement: "Retain required HIPAA documentation for six years", status: "No", risk_level: "High", evidence: "Section 12 states that incident records are retained for three years.", finding: "The stated three-year retention period does not satisfy the six-year HIPAA documentation requirement." },
      { control_id: "IR-4", control_name: "Incident handling", standards: ["NIST"], requirement: "Implement incident handling for preparation, detection, analysis, containment, eradication, and recovery", status: "Yes", risk_level: "Critical", evidence: "Sections 6 through 10 define activation, response phases, evidence handling, and return-to-operation approval.", finding: "The plan provides a usable handling process and clear operational authority." },
      { control_id: "IR-3", control_name: "Incident response testing", standards: ["NIST"], requirement: "Test the incident response capability at an organization-defined frequency", status: "No", risk_level: "Medium", evidence: "Section 11 says exercises may be scheduled based on available resources.", finding: "A mandatory exercise frequency, scenario scope, responsible owner, and success criteria are not defined." },
      { control_id: "IR-6", control_name: "Incident reporting", standards: ["NIST"], requirement: "Report incident information to defined personnel and authorities within defined time periods", status: "Partial", risk_level: "Medium", evidence: "Section 6 requires immediate internal reporting to the Service Desk or Privacy Office.", finding: "Internal reporting is clear, but external recipients and time limits are not documented." },
      { control_id: "IR-8", control_name: "Incident response plan maintenance", standards: ["NIST"], requirement: "Review, update, communicate, and protect the incident response plan", status: "Partial", risk_level: "Medium", evidence: "Section 12 requires annual review and review after material changes.", finding: "The review trigger is documented, but version distribution, acknowledgment, and superseded-copy handling are not addressed." },
      { control_id: "AU-9", control_name: "Protection of audit information", standards: ["NIST"], requirement: "Protect audit information and tools from unauthorized access, modification, and deletion", status: "Partial", risk_level: "Low", evidence: "Section 9 records the collector, date, source, and storage location for evidence.", finding: "Evidence logging is addressed, but access restrictions and integrity validation for retained evidence are not defined." }
    ],
    remediation_roadmap: { phases: [
      { name: "Immediate", timeframe: "Within 30 days", color: "critical", items: [
        { number: 1, title: "Correct records retention", description: "Revise the policy and records schedule to retain required HIPAA documentation for at least six years.", references: ["164.316(b)(2)(i)"] },
        { number: 2, title: "Publish a notification matrix", description: "Document notification triggers, decision owners, regulatory clocks, external recipients, and after-hours contacts.", references: ["164.308(a)(6)(ii)", "IR-6"] }
      ] },
      { name: "Stabilize", timeframe: "31 to 60 days", color: "high", items: [
        { number: 1, title: "Establish the exercise program", description: "Set a required tabletop cadence, scenario rotation, participants, success criteria, and after-action deliverables.", references: ["IR-3"] }
      ] },
      { name: "Operationalize", timeframe: "61 to 90 days", color: "medium", items: [
        { number: 1, title: "Formalize evidence protection", description: "Define access controls, integrity checks, chain-of-custody triggers, and secure evidence repositories.", references: ["AU-9"] },
        { number: 2, title: "Track corrective actions", description: "Assign owners and due dates to after-action items and report overdue actions to the Compliance Committee.", references: ["IR-8"] }
      ] },
      { name: "Sustain", timeframe: "Quarterly", color: "low", items: [
        { number: 1, title: "Review response readiness", description: "Review contact lists, lessons learned, exercise results, and plan distribution each quarter.", references: ["IR-8"] }
      ] }
    ] },
    data_handling: { message: "This fictional demonstration uses a fixed policy sample and does not upload, transmit, or retain customer content." },
    control_board: { citation: "HIPAA Security Rule and NIST SP 800-53 Rev. 5 demonstration control set" },
    _demo: true,
    _industry: industry
  }, safeOrgName);
}
