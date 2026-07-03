import { standardLabels } from "@/lib/analysis/standards";

export type AnalysisScope = { industry: string; standards: string[] };

export const EXTRA_CB_BATCHES: Record<string, { label: string; prompt: string }[]> = {
  PCIDSS: [
    { label: "PCI DSS Batch 1/3 - Network & Data Protection", prompt: "Return all PCI DSS v4.0.1 sub-requirements for Requirements 1-4. Each element: {id,standard,category,requirement,risk_level}. Fetch current authoritative text first. Return JSON array only." },
    { label: "PCI DSS Batch 2/3 - Vulnerability & Access", prompt: "Return all PCI DSS v4.0.1 sub-requirements for Requirements 5-8. Each element: {id,standard,category,requirement,risk_level}. Fetch current authoritative text first. Return JSON array only." },
    { label: "PCI DSS Batch 3/3 - Physical, Monitoring & Policy", prompt: "Return all PCI DSS v4.0.1 sub-requirements for Requirements 9-12, including incident response. Each element: {id,standard,category,requirement,risk_level}. Return JSON array only." }
  ],
  HIPAA: [{ label: "HIPAA Security, Privacy, Breach", prompt: "Return HIPAA Security Rule, Privacy Rule, and Breach Notification controls relevant to incident response planning. Include CFR identifiers. Return JSON array only." }],
  NIST: [{ label: "NIST IR/CP/RA/AC/AU/SI", prompt: "Return NIST SP 800-53 Rev. 5 controls relevant to incident response, contingency planning, risk assessment, access control, audit, and system integrity. Return JSON array only." }],
  HITECH: [{ label: "HITECH Enforcement", prompt: "Return HITECH breach notification and enforcement requirements relevant to incident response planning. Return JSON array only." }],
  GLBA: [{ label: "GLBA Safeguards Rule", prompt: "Return all required FTC GLBA Safeguards Rule information security program elements. Return JSON array only." }],
  NYDFS: [{ label: "NYDFS 23 NYCRR 500", prompt: "Return NYDFS 23 NYCRR Part 500 cybersecurity program, governance, control, and incident response requirements. Return JSON array only." }],
  SOX: [{ label: "SOX ITGC", prompt: "Return SOX IT general controls and COSO entity-level controls relevant to financial reporting integrity. Return JSON array only." }],
  SOC2: [{ label: "SOC 2 TSC", prompt: "Return AICPA SOC 2 Trust Services Criteria common criteria and category criteria controls. Return JSON array only." }],
  FERPA: [{ label: "FERPA", prompt: "Return FERPA requirements for education records privacy, consent, disclosure, recordkeeping, and safeguards. Return JSON array only." }],
  FISMA: [{ label: "FISMA / RMF", prompt: "Return FISMA requirements expressed through NIST RMF and statutory reporting obligations. Return JSON array only." }],
  NIST171: [{ label: "NIST 800-171", prompt: "Return NIST SP 800-171 Rev. 2 requirements across all 14 families. Return JSON array only." }],
  CMMC: [{ label: "CMMC 2.0", prompt: "Return CMMC 2.0 Level 1 and Level 2 practices with identifiers. Return JSON array only." }],
  CJIS: [{ label: "CJIS", prompt: "Return FBI CJIS Security Policy requirements across policy areas 1-13. Return JSON array only." }],
  IEC62443: [{ label: "IEC 62443", prompt: "Return IEC 62443 foundational, program, and component controls for IACS/OT. Return JSON array only." }],
  NIST82: [{ label: "NIST 800-82", prompt: "Return NIST SP 800-82 Rev. 3 OT security controls and ICS-specific guidance. Return JSON array only." }],
  NERCCIP: [{ label: "NERC CIP", prompt: "Return NERC CIP requirements CIP-002 through CIP-014. Return JSON array only." }],
  CCPA: [{ label: "CCPA / CPRA", prompt: "Return CCPA/CPRA consumer rights and business obligations. Return JSON array only." }],
  ISO27001: [{ label: "ISO 27001:2022", prompt: "Return ISO/IEC 27001:2022 Annex A controls A.5 through A.8. Return JSON array only." }],
  CSF: [{ label: "NIST CSF 2.0", prompt: "Return NIST Cybersecurity Framework 2.0 outcomes relevant to the selected industry. Return JSON array only." }]
};

export function buildSystemPrompt(scope: AnalysisScope) {
  const epActive = scope.standards.includes("EP");
  if (scope.industry !== "health-center") return buildGenericSystemPrompt(scope);
  return "You are a senior healthcare compliance auditor specializing in NIST SP 800-53, HIPAA, HITECH" +
    (epActive ? ", and CMS Emergency Preparedness (EP Rule, 81 FR 63860) across all 21 CMS provider types" : "") +
    ". You evaluate policy documents against compliance controls and produce structured JSON output only." +
    " For each control you evaluate, you must record the actual status: Yes if the document addresses it, Partial if partially addressed, No if not addressed." +
    " A well-written policy document will have many Yes controls - record them all." +
    " CRITICAL JSON RULES: (1) Never use em dashes (use plain hyphens). (2) All string values must be valid JSON. (3) No trailing commas. (4) Organization names with special characters must be included as-is in UTF-8. (5) Never include unescaped newlines or tabs inside JSON string values." +
    "\n\nCRITICAL RESEARCH REQUIREMENT: These standards change frequently. Before producing any finding, you MUST fetch the current authoritative text from official sources. Do not rely on training data alone." +
    "\n\nMANDATORY FETCHES before analysis:" +
    "\n- NIST controls: https://csrc.nist.gov/projects/cprt/catalog#/cprt/framework/version/SP_800_53_5_1_0/home" +
    "\n- HIPAA CFR text: https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164" +
    "\n- HIPAA Security Rule: https://www.hhs.gov/hipaa/for-professionals/security/index.html" +
    "\n- HIPAA Breach Notification: https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html" +
    "\n- HITECH penalties: https://www.hhs.gov/hipaa/for-professionals/compliance-enforcement/civil-money-penalties/index.html" +
    (epActive ? "\n- CMS EP Rule overview: https://www.cms.gov/medicare/health-safety-standards/quality-safety-oversight-emergency-preparedness/emergency-preparedness-rule" : "") +
    "\n\nNever abbreviate organization names. Never use em dashes anywhere. Always respond with complete valid JSON only.";
}

function buildGenericSystemPrompt(scope: AnalysisScope) {
  const stds = standardLabels(scope.industry, scope.standards).join(", ");
  return "You are a senior compliance auditor for the selected industry, specializing in: " + (stds || "the selected standards") + "." +
    " You evaluate policy and procedure documents against applicable compliance controls and produce structured JSON output only." +
    " For each control you evaluate, record status Yes, Partial, or No. A well-written document will have many Yes controls - record them all." +
    "\n\nCRITICAL RESEARCH REQUIREMENT: Fetch current authoritative text for each standard from its official source before producing findings." +
    "\n\nCRITICAL JSON RULES: Never use em dashes; use plain hyphens. Return valid JSON only, no markdown, no preamble.";
}

export function buildUserPrompt(input: { orgName?: string; fileNames: string[]; text: string; scope: AnalysisScope; controls: unknown[]; boardCite?: string }) {
  const tags = input.scope.standards.length ? input.scope.standards : ["CONTROL"];
  const sb = tags.map((tag) => `    "${tag.toLowerCase()}": { "score": 0, "controls_reviewed": 0, "controls_met": 0, "controls_partial": 0, "controls_failed": 0 }`).join(",\n");
  const schema = `{
  "organization_name": "The actual org name extracted from the document",
  "document_type": "Incident Response Plan or policy type",
  "document_name": "[organization_name] - [document_type]",
  "entity_type": "CE or BA or Unknown",
  "overall_posture": "Compliant or Partially Compliant or Non-Compliant",
  "compliance_score": 0,
  "score_breakdown": {
${sb}
  },
  "posture_summary": "1-2 sentence summary under 150 chars",
  "counts": { "total": 0, "critical": 0, "high": 0, "medium": 0, "low": 0 },
  "findings": [{ "control_id": "IR-4", "control_name": "short name", "standards": ["${tags[0]}"], "requirement": "under 120 chars", "status": "Yes or Partial or No", "risk_level": "Critical or High or Medium or Low", "evidence": "specific text or Not addressed", "finding": "under 180 chars" }],
  "remediation_roadmap": { "phases": [{ "name": "Immediate", "timeframe": "Within 30 days", "color": "critical", "items": [{ "number": 1, "title": "short action", "description": "specific action", "references": ["IR-6"] }] }] }
}`;
  return `Evaluate this document against these standards: ${standardLabels(input.scope.industry, tags).join("; ")}.
Board cite: ${input.boardCite || "No published board cite"}
Controls to apply: ${JSON.stringify(input.controls).slice(0, 12000)}
Organization label supplied by customer: ${input.orgName || "not supplied"}
Files: ${input.fileNames.join(", ")}

Rules: evaluate ONLY the listed standards; include Yes, Partial, and No controls; calculate compliance_score as Yes=1, Partial=0.5, No=0; produce exactly 4 remediation phases with 5 items each where possible; never use em dashes.

Return ONLY a JSON object with this structure:
${schema}

DOCUMENT TEXT:
${input.text.slice(0, 120000)}`;
}
