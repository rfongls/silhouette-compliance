import { callAnthropicJson } from "@/lib/analysis/anthropic";
import { sanitizeForExport } from "@/lib/sanitize";

export function demoSraFindings(industry = "health-center") {
  const common = [
    { id: "SRA-001", title: "MFA not enforced for privileged access", area: "Identity & Access", evidence: "Entra export", rating: "High", aiDrafted: true, desc: "Privileged users can access sensitive systems without enforced MFA.", rec: "Enforce MFA for all privileged and remote access paths." },
    { id: "SRA-002", title: "Patch cadence lacks evidence", area: "Vulnerability", evidence: "Scanner export", rating: "Medium", aiDrafted: true, desc: "Critical patches are tracked inconsistently across assets.", rec: "Define patch SLAs and retain remediation evidence." },
    { id: "SRA-003", title: "Incident exercise not documented", area: "Governance", evidence: "Policy review", rating: "Medium", aiDrafted: true, desc: "The organization has no recent tabletop record.", rec: "Run and document an annual tabletop exercise." }
  ];
  if (industry === "manufacturing") common[0].title = "IT/OT remote access lacks MFA";
  return common;
}

export async function draftSraFindings(input: { industry: string; evidence: unknown[]; inventory: unknown }) {
  const prompt = `Draft security risk assessment findings from parsed infrastructure evidence. Human approval is required later. Return JSON array only with {id,title,area,evidence,rating,aiDrafted,desc,rec}. Never include patient data. Industry: ${input.industry}. Inventory: ${JSON.stringify(input.inventory).slice(0, 8000)} Evidence: ${JSON.stringify(input.evidence).slice(0, 24000)}`;
  const { json, usage } = await callAnthropicJson("You draft SRA findings from infrastructure/config evidence only. Return valid JSON only. No em dashes.", prompt);
  return { findings: sanitizeForExport(Array.isArray(json) ? json : demoSraFindings(input.industry)), usage };
}

export async function draftRoadmap(findings: unknown[]) {
  const prompt = `Generate a 30/60/90 day remediation roadmap from approved findings. Return JSON array with {window,owner,items}. No em dashes. Findings: ${JSON.stringify(findings).slice(0, 16000)}`;
  const { json, usage } = await callAnthropicJson("You produce concise security remediation roadmaps. Return valid JSON only.", prompt);
  return { roadmap: sanitizeForExport(Array.isArray(json) ? json : buildRoadmap(findings as any[])), usage };
}

export function buildRoadmap(findings: any[]) {
  const high = findings.filter((f) => f.rating === "High");
  const med = findings.filter((f) => f.rating === "Medium");
  const low = findings.filter((f) => f.rating === "Low");
  return [
    { window: "0-30 days", owner: "Executive sponsor / IT", items: (high.length ? high : findings).map((f) => f.rec).slice(0, 5) },
    { window: "31-60 days", owner: "Security / Operations", items: (med.length ? med : findings).map((f) => f.rec).slice(0, 5) },
    { window: "61-90 days", owner: "Leadership / Compliance", items: (low.length ? low : findings).map((f) => f.rec).slice(0, 5).concat(["Update risk register status"]) }
  ];
}
