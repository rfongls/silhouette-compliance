import crypto from "node:crypto";
import pdf from "pdf-parse/lib/pdf-parse.js";
import type { NormalizedControl } from "@/lib/control-boards";
import { humanizeControlText } from "@/lib/sanitize";

type SourceFormat = "nist-oscal" | "csf-oscal" | "html" | "xml" | "pdf";

type SourceDefinition = {
  title: string;
  version: string;
  urls?: string[];
  resolveUrls?: () => Promise<string[]>;
  format: SourceFormat;
  scope: string;
  refreshCadenceDays: number;
  transformText?: (value: string) => string;
};

const ECFR_TITLES_URL = "https://www.ecfr.gov/api/versioner/v1/titles.json";

async function resolveCurrentHipaaUrl() {
  const metadata = JSON.parse((await retrieve(ECFR_TITLES_URL)).toString("utf8"));
  const title = metadata?.titles?.find((item: { number?: number }) => item.number === 45);
  const date = String(title?.up_to_date_as_of || title?.latest_issue_date || "");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error("The eCFR API did not return a current Title 45 issue date.");
  return [`https://www.ecfr.gov/api/versioner/v1/full/${date}/title-45.xml?part=164`];
}

const SOURCES: Record<string, SourceDefinition> = {
  NIST: {
    title: "NIST SP 800-53 Rev. 5 OSCAL Catalog",
    version: "Revision 5.1.1",
    urls: ["https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/SP800-53/rev5/json/NIST_SP-800-53_rev5_catalog.json"],
    format: "nist-oscal",
    scope: "SP 800-53 Rev. 5 access control, audit, contingency planning, incident response, risk assessment, and system integrity families",
    refreshCadenceDays: 365
  },
  HIPAA: {
    title: "Electronic Code of Federal Regulations, 45 CFR Part 164",
    version: "Current eCFR issue",
    resolveUrls: resolveCurrentHipaaUrl,
    format: "xml",
    scope: "HIPAA Security Rule safeguards and Privacy Rule requirements in 45 CFR Part 164",
    refreshCadenceDays: 365
  },
  HITECH: {
    title: "HITECH Act, Public Law 111-5, Title XIII",
    version: "Public Law 111-5",
    urls: ["https://www.govinfo.gov/content/pkg/PLAW-111publ5/html/PLAW-111publ5.htm"],
    format: "html",
    scope: "HITECH privacy, security, breach notification, enforcement, and related incident response requirements",
    refreshCadenceDays: 365,
    transformText: hitechStatutoryText
  },
  EP: {
    title: "CMS Emergency Preparedness Rule",
    version: "Current CMS guidance",
    urls: ["https://www.cms.gov/medicare/health-safety-standards/quality-safety-oversight-emergency-preparedness/emergency-preparedness-rule"],
    format: "html",
    scope: "CMS Emergency Preparedness Rule planning, communications, continuity, training, testing, and documentation requirements",
    refreshCadenceDays: 365
  },
  CSF: {
    title: "NIST Cybersecurity Framework 2.0 OSCAL Catalog",
    version: "CSF 2.0",
    urls: ["https://raw.githubusercontent.com/usnistgov/oscal-content/main/nist.gov/CSF/v2.0/json/NIST_CSF_v2.0_catalog.json"],
    format: "csf-oscal",
    scope: "All NIST Cybersecurity Framework 2.0 functions, categories, and subcategory outcomes",
    refreshCadenceDays: 365
  },
  SP80066: {
    title: "NIST SP 800-66 Rev. 2, Implementing the HIPAA Security Rule",
    version: "Revision 2, February 2024",
    urls: ["https://nvlpubs.nist.gov/nistpubs/SpecialPublications/NIST.SP.800-66r2.pdf"],
    format: "pdf",
    scope: "HIPAA Security Rule implementation activities, descriptions, mappings, and sample questions",
    refreshCadenceDays: 365
  }
};

const ALLOWED_HOSTS = new Set([
  "raw.githubusercontent.com",
  "www.ecfr.gov",
  "www.govinfo.gov",
  "www.cms.gov",
  "nvlpubs.nist.gov"
]);
const MAX_SOURCE_BYTES = 15_000_000;
export const CONTROL_BOARD_BUILD_VERSION = "irp-control-library-v3";

function sourceHash(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function oscalParameterValue(parameter: any) {
  const explicit = Array.isArray(parameter?.values) ? parameter.values.find(Boolean) : null;
  if (explicit) return String(explicit);
  const choices = Array.isArray(parameter?.select?.choice) ? parameter.select.choice.filter(Boolean) : [];
  if (choices.length) return choices.map(String).join(" or ");
  const label = (parameter?.props || []).find((prop: any) => prop?.name === "label")?.value;
  return label ? `organization-defined ${String(label).toLocaleLowerCase()}` : "organization-defined value";
}

function oscalParameters(...collections: any[][]) {
  return new Map(collections.flat().filter(Boolean).map((parameter: any) => [String(parameter.id || "").toLocaleLowerCase(), oscalParameterValue(parameter)]));
}

function oscalProse(value: unknown, parameters: Map<string, string>) {
  const resolved = String(value || "").replace(/\{\{\s*insert:\s*param,\s*([^}]+)\}\}/gi, (_match, id) => (
    parameters.get(String(id).trim().toLocaleLowerCase()) || "organization-defined value"
  ));
  return humanizeControlText(resolved);
}

function textFromParts(parts: any[], parameters = new Map<string, string>()): string {
  return humanizeControlText((parts || [])
    .flatMap((part) => [oscalProse(part?.prose, parameters), textFromParts(part?.parts || [], parameters)])
    .filter(Boolean)
    .join(" "));
}

function nistControls(raw: string): NormalizedControl[] {
  const parsed = JSON.parse(raw);
  const groups = parsed?.catalog?.groups || [];
  const catalogParameters = parsed?.catalog?.params || [];
  const relevantFamilies = new Set(["ac", "au", "cp", "ir", "ra", "si"]);
  return groups
    .filter((group: any) => relevantFamilies.has(String(group?.id || "").toLocaleLowerCase()))
    .flatMap((group: any) => (group.controls || []).map((control: any) => {
      const parameters = oscalParameters(catalogParameters, group.params || [], control.params || []);
      const statements = (control.parts || []).filter((part: any) => String(part?.name || "").toLocaleLowerCase() === "statement");
      return {
        id: String(control.id || "").toLocaleUpperCase(),
        standard: "NIST",
        category: String(group.title || group.id || ""),
        requirement: [control.title, textFromParts(statements.length ? statements : control.parts || [], parameters)].filter(Boolean).join(": "),
        risk_level: ({ ir: "Critical", cp: "High", au: "High", ra: "High", si: "High", ac: "Medium" } as Record<string, string>)[String(group.id || "").toLocaleLowerCase()] || "Medium"
      };
    }))
    .filter((control: NormalizedControl) => control.id && control.requirement);
}

function csfPriority(id: string) {
  const prefix = id.slice(0, 2).toLocaleUpperCase();
  if (prefix === "RS" || prefix === "RC") return "Critical";
  if (prefix === "PR" || prefix === "DE") return "High";
  return "Medium";
}

function csfControls(raw: string): NormalizedControl[] {
  const parsed = JSON.parse(raw);
  const functions = parsed?.catalog?.groups || [];
  return functions.flatMap((fn: any) => (fn.controls || []).flatMap((category: any) => {
    const outcomes = Array.isArray(category.controls) && category.controls.length ? category.controls : [category];
    return outcomes.map((outcome: any) => ({
      id: String(outcome.id || "").toLocaleUpperCase(),
      standard: "CSF",
      category: [fn.title || fn.id, category.title || category.id].filter(Boolean).join(": "),
      requirement: textFromParts(outcome.parts || []) || String(outcome.title || ""),
      risk_level: csfPriority(String(outcome.id || ""))
    }));
  })).filter((control: NormalizedControl) => control.id && control.requirement);
}

function readableMarkup(raw: string) {
  return raw
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, "\"")
    .replace(/&#x([0-9a-f]+);/gi, (_match, value) => String.fromCodePoint(Number.parseInt(value, 16)))
    .replace(/&#([0-9]+);/g, (_match, value) => String.fromCodePoint(Number.parseInt(value, 10)))
    .replace(/\s+/g, " ")
    .trim();
}

function hitechStatutoryText(value: string) {
  const start = value.lastIndexOf("SEC. 13400");
  const finalSection = value.lastIndexOf("SEC. 13424");
  const end = finalSection >= 0 ? value.indexOf("SEC. ", finalSection + 10) : -1;
  if (start < 0 || finalSection < 0) throw new Error("The official HITECH statute no longer matches the reviewed section boundaries.");
  return value.slice(start, end > finalSection ? end : finalSection + 20_000).trim();
}

async function retrieve(url: string) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !ALLOWED_HOSTS.has(parsed.hostname)) throw new Error("Control source is not allowlisted.");
  const response = await fetch(url, {
    cache: "no-store",
    headers: { "User-Agent": "Silhouette-Compliance/1.0 (+https://silhouettellc.com)" },
    signal: AbortSignal.timeout(30_000)
  });
  if (!response.ok) throw new Error(`Official control source returned ${response.status}: ${url}`);
  const length = Number(response.headers.get("content-length") || 0);
  if (length > MAX_SOURCE_BYTES) throw new Error("Official control source exceeds the retrieval size guard.");
  const raw = Buffer.from(await response.arrayBuffer());
  if (raw.byteLength > MAX_SOURCE_BYTES) throw new Error("Official control source exceeds the retrieval size guard.");
  return raw;
}

async function extractSourceText(format: SourceFormat, raw: Buffer) {
  if (format === "pdf") return (await pdf(raw)).text.replace(/\s+/g, " ").trim();
  return readableMarkup(raw.toString("utf8"));
}

export async function fetchOfficialControlSource(standardKey: string) {
  const source = SOURCES[standardKey];
  if (!source) throw new Error("No allowlisted public source is configured for this standard. Upload a reviewed control JSON file with source provenance instead.");
  const urls = source.resolveUrls ? await source.resolveUrls() : source.urls || [];
  if (!urls.length) throw new Error("The official control source did not resolve any documents.");
  const rawDocuments = await Promise.all(urls.map(retrieve));
  const deterministic = source.format === "nist-oscal" || source.format === "csf-oscal";
  const sourceDocuments = deterministic ? rawDocuments.map((raw) => raw.toString("utf8")) : await Promise.all(rawDocuments.map((raw) => extractSourceText(source.format, raw)));
  const transformedDocuments = source.transformText ? sourceDocuments.map(source.transformText) : sourceDocuments;
  const combined = transformedDocuments.join("\n\n");
  const resolvedVersion = standardKey === "HIPAA"
    ? `eCFR issue ${urls[0].match(/full\/(\d{4}-\d{2}-\d{2})\//)?.[1] || "current"}`
    : source.version;
  const controls = source.format === "nist-oscal"
    ? nistControls(sourceDocuments[0])
    : source.format === "csf-oscal"
      ? csfControls(sourceDocuments[0])
      : null;
  return {
    title: source.title,
    version: resolvedVersion,
    urls,
    format: source.format,
    scope: source.scope,
    refreshCadenceDays: source.refreshCadenceDays,
    sourceHash: sourceHash(`${CONTROL_BOARD_BUILD_VERSION}\n${combined}`),
    retrievedAt: new Date(),
    controls,
    sourceText: deterministic ? null : transformedDocuments.join("\n\n")
  };
}

export const __test__ = { csfControls, hitechStatutoryText, nistControls, readableMarkup };
