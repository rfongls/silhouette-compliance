import type { NormalizedControl } from "@/lib/control-boards";

export type ControlExtractionBatch = {
  label: string;
  prompt: string;
  requiredIdentifiers?: string[];
};

export type ControlSourceSnapshot = {
  title: string;
  version: string;
  urls: string[];
  sourceHash: string;
  sourceText: string | null;
  controls: NormalizedControl[] | null;
  scope: string;
  refreshCadenceDays: number;
};

export type ControlExtractionPlan = {
  standardKey: string;
  sourceTitle: string;
  sourceVersion: string;
  sourceUrls: string[];
  sourceHash: string;
  sourceScope: string;
  refreshCadenceDays: number;
  method: "deterministic" | "grounded-ai";
  batchLabels: string[];
  requestCount: number;
  estimatedInputTokens: number;
  deterministicControlCount: number;
};

export const CONTROL_EXTRACTION_MAX_ATTEMPTS = 2;

export const CONTROL_EXTRACTION_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    controls: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          id: { type: "string" },
          standard: { type: "string" },
          category: { type: "string" },
          requirement: { type: "string" },
          risk_level: { type: "string", enum: ["Critical", "High", "Medium", "Low"] },
          source_url: { type: "string" },
          source_section: { type: "string" },
          source_quote: { type: "string" },
          extraction_batch: { type: "string" }
        },
        required: ["id", "standard", "category", "requirement", "risk_level", "source_url", "source_section", "source_quote", "extraction_batch"]
      }
    },
  },
  required: ["controls"]
} as const;

function collapsed(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function groundedComparable(value: string) {
  return collapsed(value
    .normalize("NFKC")
    .replace(/[\u200B-\u200D\uFEFF]/g, "")
    .replace(/[\u2018\u2019\u201A\u201B]/g, "'")
    .replace(/[\u201C\u201D\u201E\u201F]/g, "\"")
    .replace(/[\u2010-\u2015\u2212]/g, "-"));
}

function includesOfficialIdentifier(control: NormalizedControl, identifier: string) {
  const location = groundedComparable(`${control.id} ${control.source_section || ""}`);
  const escaped = identifier.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^0-9A-Z])${escaped}(?=$|[^0-9])`, "i").test(location);
}

export function buildControlExtractionPlan(
  standardKey: string,
  source: ControlSourceSnapshot,
  batches: ControlExtractionBatch[]
): ControlExtractionPlan {
  const deterministicControlCount = source.controls?.length || 0;
  if (!deterministicControlCount && (!source.sourceText || !batches.length)) {
    throw new Error("No complete grounded extraction plan is configured for this standard.");
  }
  const promptCharacters = batches.reduce((total, batch) => total + batch.prompt.length, 0) * CONTROL_EXTRACTION_MAX_ATTEMPTS;
  const sourceCharacters = (source.sourceText?.length || 0) * batches.length * CONTROL_EXTRACTION_MAX_ATTEMPTS;
  return {
    standardKey,
    sourceTitle: source.title,
    sourceVersion: source.version,
    sourceUrls: source.urls,
    sourceHash: source.sourceHash,
    sourceScope: source.scope,
    refreshCadenceDays: source.refreshCadenceDays,
    method: deterministicControlCount ? "deterministic" : "grounded-ai",
    batchLabels: deterministicControlCount ? [] : batches.map((batch) => batch.label),
    requestCount: deterministicControlCount ? 0 : batches.length * CONTROL_EXTRACTION_MAX_ATTEMPTS,
    estimatedInputTokens: deterministicControlCount ? 0 : Math.ceil((promptCharacters + sourceCharacters) / 4),
    deterministicControlCount
  };
}

export function controlRefreshStatus(input: {
  currentSourceHash: string;
  baselineSourceHash?: string | null;
  baselineRetrievedAt?: Date | string | null;
  refreshCadenceDays: number;
  now?: Date;
}) {
  const now = input.now || new Date();
  const retrievedAt = input.baselineRetrievedAt ? new Date(input.baselineRetrievedAt) : null;
  const dueAt = retrievedAt
    ? new Date(retrievedAt.getTime() + input.refreshCadenceDays * 24 * 60 * 60 * 1000)
    : null;
  return {
    hasBaseControl: Boolean(input.baselineSourceHash),
    sourceChanged: Boolean(input.baselineSourceHash && input.baselineSourceHash !== input.currentSourceHash),
    refreshDue: !dueAt || dueAt.getTime() <= now.getTime(),
    refreshDueAt: dueAt?.toISOString() || null
  };
}

export function buildGroundedControlPrompt(input: {
  standardKey: string;
  batch: ControlExtractionBatch;
  source: ControlSourceSnapshot;
}) {
  return `${input.batch.prompt.replace(/Fetch current authoritative text first\.?/gi, "")}

Extract only requirements that are explicitly supported by the supplied official source text.
Return every in-scope requirement for this batch in an object with a controls array. Do not summarize multiple separately identified requirements into one control.
Each control must contain exactly: id, standard, category, requirement, risk_level, source_url, source_section, source_quote, extraction_batch.
- standard must be ${input.standardKey}.
- id must use the exact official control or section identifier. For CFR requirements, begin with the CFR section and paragraph (for example, 164.308(a)(1)(i)); do not create generic sequential IDs.
- source_url must be one of the supplied official source URLs.
- source_section must identify the source heading, CFR section, control family, or equivalent location.
- source_quote must be one contiguous, exact supporting quote copied from the supplied source text. Do not paraphrase, ellipsize, add words, or omit words inside the quote.
- extraction_batch must be ${JSON.stringify(input.batch.label)}.
- risk_level is the Silhouette IRP scoring priority, not a claim that the publisher assigned a score. Use Critical for requirements whose absence can directly prevent required incident reporting, command, containment, continuity, or recovery; High for core risk analysis, detection, escalation, testing, access, evidence, and third-party response duties; Medium for supporting governance and operational requirements; Low for supplemental or tangential IRP requirements. An administrator must review these priorities before publication.
- If a requested requirement is not present in the supplied source, do not invent it.

OFFICIAL_SOURCE_URLS_JSON:
${JSON.stringify(input.source.urls)}

OFFICIAL_SOURCE_TEXT:
${input.source.sourceText}`;
}

export function validateGroundedControls(input: {
  controls: NormalizedControl[];
  standardKey: string;
  sourceText: string;
  sourceUrls: string[];
  batch: ControlExtractionBatch;
}) {
  if (!input.controls.length) throw new Error(`${input.batch.label} returned no controls.`);
  const normalizedSource = groundedComparable(input.sourceText);
  for (const control of input.controls) {
    if (control.standard !== input.standardKey) {
      throw new Error(`${input.batch.label} returned control ${control.id} with standard ${control.standard || "missing"}.`);
    }
    if (!control.source_quote || !normalizedSource.includes(groundedComparable(control.source_quote))) {
      throw new Error(`${input.batch.label} returned control ${control.id} without an exact source quote.`);
    }
    if (!control.source_url || !input.sourceUrls.includes(control.source_url)) {
      throw new Error(`${input.batch.label} returned control ${control.id} with an unapproved source URL.`);
    }
    if (!control.source_section) {
      throw new Error(`${input.batch.label} returned control ${control.id} without a source section.`);
    }
    if (control.extraction_batch !== input.batch.label) {
      throw new Error(`${input.batch.label} returned control ${control.id} with the wrong extraction batch.`);
    }
  }
  const missingIdentifiers = (input.batch.requiredIdentifiers || []).filter((identifier) =>
    !input.controls.some((control) => includesOfficialIdentifier(control, identifier))
  );
  if (missingIdentifiers.length) {
    throw new Error(`${input.batch.label} is incomplete. Missing required identifiers: ${missingIdentifiers.join(", ")}.`);
  }
  return input.controls;
}

export function mergeControlBatches(batches: NormalizedControl[][]) {
  const merged = new Map<string, NormalizedControl>();
  for (const controls of batches) {
    for (const control of controls) {
      const key = `${control.standard.toLocaleUpperCase()}:${control.id.toLocaleUpperCase()}`;
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, control);
        continue;
      }
      if (collapsed(existing.requirement) !== collapsed(control.requirement)) {
        throw new Error(`Conflicting extracted requirements were returned for ${control.standard} ${control.id}.`);
      }
    }
  }
  return [...merged.values()];
}
