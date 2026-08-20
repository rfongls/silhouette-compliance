import crypto from "node:crypto";
import type { NormalizedControl } from "@/lib/control-boards";

type SourceDefinition = {
  title: string;
  version: string;
  urls: string[];
  format: "oscal" | "html";
  scope: string;
  refreshCadenceDays: number;
};

const SOURCES: Record<string, SourceDefinition> = {
  NIST: {
    title: "NIST SP 800-53 Rev. 5 OSCAL Catalog",
    version: "Revision 5.1.1",
    urls: ["https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json"],
    format: "oscal",
    scope: "SP 800-53 Rev. 5 access control, audit, contingency planning, incident response, risk assessment, and system integrity families",
    refreshCadenceDays: 365
  },
  HIPAA: {
    title: "HHS HIPAA Security and Privacy Rules",
    version: "Current HHS guidance",
    urls: [
      "https://www.hhs.gov/hipaa/for-professionals/security/laws-regulations/index.html",
      "https://www.hhs.gov/hipaa/for-professionals/privacy/laws-regulations/index.html"
    ],
    format: "html",
    scope: "HIPAA Security Rule safeguards and Privacy Rule requirements defined by the reviewed extraction manifests",
    refreshCadenceDays: 365
  },
  HITECH: {
    title: "HHS HITECH Act and Breach Notification Guidance",
    version: "Current HHS guidance",
    urls: [
      "https://www.hhs.gov/hipaa/for-professionals/special-topics/hitech-act-enforcement-interim-final-rule/index.html",
      "https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html"
    ],
    format: "html",
    scope: "HITECH breach notification and enforcement requirements relevant to incident response planning",
    refreshCadenceDays: 365
  },
  EP: {
    title: "CMS Emergency Preparedness Rule",
    version: "Current CMS guidance",
    urls: ["https://www.cms.gov/medicare/health-safety-standards/quality-safety-oversight-emergency-preparedness/emergency-preparedness-rule"],
    format: "html",
    scope: "CMS Emergency Preparedness Rule planning, communications, continuity, training, testing, and documentation requirements",
    refreshCadenceDays: 365
  }
};

const ALLOWED_HOSTS = new Set(["raw.githubusercontent.com", "www.hhs.gov", "www.cms.gov"]);
const MAX_SOURCE_BYTES = 15_000_000;
export const CONTROL_BOARD_BUILD_VERSION = "irp-control-library-v2";

function sourceHash(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function textFromParts(parts: any[]): string {
  return (parts || []).flatMap((part) => [part?.prose, textFromParts(part?.parts || [])]).filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

function nistControls(raw: string): NormalizedControl[] {
  const parsed = JSON.parse(raw);
  const groups = parsed?.catalog?.groups || [];
  const relevantFamilies = new Set(["ac", "au", "cp", "ir", "ra", "si"]);
  return groups
    .filter((group: any) => relevantFamilies.has(String(group?.id || "").toLocaleLowerCase()))
    .flatMap((group: any) => (group.controls || []).map((control: any) => ({
      id: String(control.id || "").toLocaleUpperCase(),
      standard: "NIST",
      category: String(group.title || group.id || ""),
      requirement: [control.title, textFromParts(control.parts || [])].filter(Boolean).join(": "),
      risk_level: ({ ir: "Critical", cp: "High", au: "High", ra: "High", si: "High", ac: "Medium" } as Record<string, string>)[String(group.id || "").toLocaleLowerCase()] || "Medium"
    })))
    .filter((control: NormalizedControl) => control.id && control.requirement);
}

function readableHtml(raw: string) {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

async function retrieve(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) throw new Error("Control source is not allowlisted.");
  const response = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(30_000) });
  if (!response.ok) throw new Error(`Official control source returned ${response.status}: ${url}`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_SOURCE_BYTES) throw new Error("Official control source exceeds the retrieval size guard.");
  const raw = await response.text();
  if (Buffer.byteLength(raw, "utf8") > MAX_SOURCE_BYTES) throw new Error("Official control source exceeds the retrieval size guard.");
  return raw;
}

export async function fetchOfficialControlSource(standardKey: string) {
  const source = SOURCES[standardKey];
  if (!source) throw new Error("No allowlisted public source is configured for this standard. Upload a reviewed control JSON file with source provenance instead.");
  const rawDocuments = await Promise.all(source.urls.map(retrieve));
  const sourceDocuments = source.format === "html" ? rawDocuments.map(readableHtml) : rawDocuments;
  const combined = sourceDocuments.map((document, index) => `${source.urls[index]}\n${document}`).join("\n\n");
  return {
    ...source,
    sourceHash: sourceHash(`${CONTROL_BOARD_BUILD_VERSION}\n${combined}`),
    retrievedAt: new Date(),
    controls: source.format === "oscal" ? nistControls(rawDocuments[0]) : null,
    sourceText: source.format === "html" ? sourceDocuments.join("\n\n") : null
  };
}
