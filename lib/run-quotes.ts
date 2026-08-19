import { EntKind } from "@prisma/client";
import { env } from "@/lib/env";
import { centsForKind, kindFromModule } from "@/lib/stripe";

export type QuoteModule = "irp" | "sra" | "proposal";

export type QuoteInput = {
  module: QuoteModule;
  orgCount?: number;
  orgNames?: string[];
  documents?: { name?: string; text?: string }[];
  text?: string;
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
  const estimatedInputTokens = Math.ceil(charCount / charsPerToken) + promptOverheadTokens;
  const estimatedOutputTokens = moduleOutputBuffer(module);
  const inputPerMillionCents = numberEnv("QUOTE_INPUT_1M_CENTS", 300);
  const outputPerMillionCents = numberEnv("QUOTE_OUTPUT_1M_CENTS", 1500);
  const estimatedModelCostCents = Math.ceil(
    (estimatedInputTokens * inputPerMillionCents + estimatedOutputTokens * outputPerMillionCents) / 1_000_000
  );
  const customerAmountCents = centsForKind(kind) * orgCount;
  const marginCents = customerAmountCents - estimatedModelCostCents;
  const marginPercent = customerAmountCents > 0 ? Math.round((marginCents / customerAmountCents) * 1000) / 10 : 0;
  const minMarginPercent = numberEnv("QUOTE_MIN_MARGIN_PERCENT", 75);
  const maxDocumentChars = numberEnv("QUOTE_MAX_DOCUMENT_CHARS", 180000);
  const withinGuard = marginPercent >= minMarginPercent && charCount <= maxDocumentChars;
  const warning = charCount > maxDocumentChars
    ? "Document set is larger than the current processing guard."
    : marginPercent < minMarginPercent
      ? "Estimated provider cost is too close to the configured customer price."
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
    withinGuard,
    warning
  };
}

export function quoteExpiresAt() {
  return new Date(Date.now() + numberEnv("QUOTE_TTL_MINUTES", 60) * 60 * 1000);
}
