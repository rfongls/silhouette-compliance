import { EntKind } from "@prisma/client";
import { env } from "@/lib/env";
import { centsForKind, kindFromModule } from "@/lib/stripe";

export type QuoteModule = "irp" | "sra" | "proposal";

export type QuoteInput = {
  module: QuoteModule;
  orgCount?: number;
  orgNames?: string[];
  documents?: { name?: string; text?: string; orgName?: string }[];
  text?: string;
  analysisPasses?: number;
  analysisRequestCount?: number;
};

export type QuoteEstimate = {
  module: QuoteModule;
  kind: EntKind;
  orgNames: string[];
  orgCount: number;
  documentCount: number;
  charCount: number;
  estimatedInputTokens: number;
  estimatedOutputTokens: number;
  estimatedModelCostCents: number;
  customerAmountCents: number;
  marginCents: number;
  marginPercent: number;
  charCountByOrg: Record<string, number>;
  maxCharsPerOrg: number;
  characterLimitPerOrg: number;
  costLimitCents: number;
  withinGuard: boolean;
  warning?: string;
};

function numberEnv(name: string, fallback: number) {
  const value = Number(env(name, String(fallback)));
  return Number.isFinite(value) ? value : fallback;
}

function moduleOutputBuffer(module: QuoteModule) {
  if (module === "sra") return numberEnv("QUOTE_SRA_OUTPUT_TOKENS", 12000);
  if (module === "proposal") return numberEnv("QUOTE_PROPOSAL_OUTPUT_TOKENS", 10000);
  return numberEnv("QUOTE_IRP_OUTPUT_TOKENS", 8000);
}

export function irpCharacterLimitPerOrg() {
  return Math.max(1000, numberEnv("IRP_MAX_CHARS_PER_ORG", 2000000));
}

export function irpCharacterLimitPerDocument() {
  return Math.max(1000, numberEnv("IRP_MAX_CHARS_PER_DOCUMENT", 2000000));
}

export function normalizeOrgCount(value: unknown) {
  const count = Math.ceil(Number(value || 1));
  return Math.max(1, Math.min(100, Number.isFinite(count) ? count : 1));
}

export function normalizeOrgNames(value: unknown, fallbackCount = 1) {
  const names = Array.isArray(value)
    ? value.map((name) => String(name || "").trim()).filter(Boolean)
    : [];
  if (names.length) return names.slice(0, 100);
  return Array.from({ length: normalizeOrgCount(fallbackCount) }, (_, index) => `Organization ${index + 1}`);
}

export function quoteFunding(orgCount: number, availableCredits: number, isAdmin: boolean) {
  const required = normalizeOrgCount(orgCount);
  if (isAdmin) return { creditsApplied: 0, creditsToPurchase: 0 };
  const creditsApplied = Math.min(required, Math.max(0, Math.floor(availableCredits || 0)));
  return { creditsApplied, creditsToPurchase: required - creditsApplied };
}

export function estimateRunQuote(input: QuoteInput): QuoteEstimate {
  const module = input.module;
  const kind = kindFromModule(module);
  const orgNames = module === "irp" ? normalizeOrgNames(input.orgNames, input.orgCount) : normalizeOrgNames([], 1);
  const orgCount = module === "irp" ? orgNames.length : 1;
  const documents = Array.isArray(input.documents) ? input.documents : [];
  const documentText = documents.map((doc) => String(doc.text || "")).join("\n\n");
  const text = documentText || String(input.text || "");
  const charCount = text.length;
  const documentCount = documents.length || (text ? 1 : 0);
  const charsPerToken = Math.max(1, numberEnv("QUOTE_CHARS_PER_TOKEN", 4));
  const promptOverheadTokens = numberEnv("QUOTE_PROMPT_OVERHEAD_TOKENS", 6000);
  const analysisPasses = module === "irp"
    ? Math.max(1, Math.ceil(input.analysisPasses || numberEnv("QUOTE_IRP_ANALYSIS_PASSES", 4)))
    : 1;
  const analysisRequestCount = module === "irp"
    ? Math.max(analysisPasses, Math.ceil(input.analysisRequestCount || analysisPasses))
    : 1;
  const estimatedInputTokens = Math.ceil(charCount / charsPerToken) * analysisPasses + promptOverheadTokens * analysisRequestCount;
  const estimatedOutputTokens = moduleOutputBuffer(module) * Math.max(orgCount, analysisRequestCount);
  const inputPerMillionCents = numberEnv("QUOTE_INPUT_1M_CENTS", 300);
  const outputPerMillionCents = numberEnv("QUOTE_OUTPUT_1M_CENTS", 1500);
  const estimatedModelCostCents = Math.ceil(
    (estimatedInputTokens * inputPerMillionCents + estimatedOutputTokens * outputPerMillionCents) / 1_000_000
  );
  const customerAmountCents = centsForKind(kind) * orgCount;
  const marginCents = customerAmountCents - estimatedModelCostCents;
  const marginPercent = customerAmountCents > 0 ? Math.round((marginCents / customerAmountCents) * 1000) / 10 : 0;
  const characterLimitPerOrg = module === "irp" ? irpCharacterLimitPerOrg() : numberEnv("QUOTE_MAX_DOCUMENT_CHARS", 240000);
  const charCountByOrg = documents.reduce<Record<string, number>>((counts, document) => {
    const orgName = module === "irp" ? String(document.orgName || orgNames[0] || "Organization 1") : "engagement";
    counts[orgName] = (counts[orgName] || 0) + String(document.text || "").length;
    return counts;
  }, {});
  if (!documents.length && text) charCountByOrg[module === "irp" ? orgNames[0] : "engagement"] = text.length;
  const maxCharsPerOrg = Math.max(0, ...Object.values(charCountByOrg));
  const maxCharsPerDocument = Math.max(0, ...documents.map((document) => String(document.text || "").length));
  const characterLimitPerDocument = module === "irp" ? irpCharacterLimitPerDocument() : characterLimitPerOrg;
  const maxProviderCostRatio = Math.min(1, Math.max(0.01, numberEnv("QUOTE_MAX_PROVIDER_COST_RATIO", 0.5)));
  const costLimitCents = Math.floor(customerAmountCents * maxProviderCostRatio);
  const withinGuard = estimatedModelCostCents <= costLimitCents && maxCharsPerOrg <= characterLimitPerOrg && maxCharsPerDocument <= characterLimitPerDocument;
  const warning = maxCharsPerDocument > characterLimitPerDocument
    ? `One file exceeds the ${characterLimitPerDocument.toLocaleString("en-US")} character file-size guard. No text will be truncated.`
    : maxCharsPerOrg > characterLimitPerOrg
    ? `One organization exceeds the ${characterLimitPerOrg.toLocaleString("en-US")} character processing limit. No text will be truncated.`
    : estimatedModelCostCents > costLimitCents
      ? "Estimated provider cost exceeds the configured 50% processing-cost ceiling."
      : undefined;

  return {
    module,
    kind,
    orgNames,
    orgCount,
    documentCount,
    charCount,
    estimatedInputTokens,
    estimatedOutputTokens,
    estimatedModelCostCents,
    customerAmountCents,
    marginCents,
    marginPercent,
    charCountByOrg,
    maxCharsPerOrg,
    characterLimitPerOrg,
    costLimitCents,
    withinGuard,
    warning
  };
}

export function quoteExpiresAt() {
  return new Date(Date.now() + numberEnv("QUOTE_TTL_MINUTES", 60) * 60 * 1000);
}
