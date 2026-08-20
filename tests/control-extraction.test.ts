import assert from "node:assert/strict";
import test from "node:test";
import { buildControlExtractionPlan, controlRefreshStatus, mergeControlBatches, validateGroundedControls } from "../lib/control-extraction";
import { validateControlBoardForPublication } from "../lib/control-boards";
import { __test__ as officialSourceParsers } from "../lib/official-control-sources";

const source = {
  title: "Official rule",
  version: "Current",
  urls: ["https://example.gov/rule"],
  sourceHash: "abc123",
  sourceText: "Section 1. The organization must document incident response procedures.",
  controls: null,
  scope: "Test controls",
  refreshCadenceDays: 365
};

test("preflight reports every configured paid extraction batch", () => {
  const plan = buildControlExtractionPlan("RULE", source, [
    { label: "First", prompt: "Extract section 1" },
    { label: "Second", prompt: "Extract section 2" }
  ]);
  assert.equal(plan.method, "grounded-ai");
  assert.equal(plan.requestCount, 4);
  assert.deepEqual(plan.batchLabels, ["First", "Second"]);
  assert.ok(plan.estimatedInputTokens > 0);
});

test("annual refresh status detects due and changed base controls", () => {
  const current = controlRefreshStatus({
    currentSourceHash: "new",
    baselineSourceHash: "old",
    baselineRetrievedAt: "2025-01-01T00:00:00.000Z",
    refreshCadenceDays: 365,
    now: new Date("2026-01-02T00:00:00.000Z")
  });
  assert.equal(current.hasBaseControl, true);
  assert.equal(current.sourceChanged, true);
  assert.equal(current.refreshDue, true);
  assert.equal(current.refreshDueAt, "2026-01-01T00:00:00.000Z");
});

test("grounded controls require an exact quote and allowlisted source URL", () => {
  const control = {
    id: "1",
    standard: "RULE",
    category: "Incident response",
    requirement: "Document incident response procedures.",
    risk_level: "High",
    source_url: source.urls[0],
    source_section: "Section 1",
    source_quote: "The organization must document incident response procedures.",
    extraction_batch: "First"
  };
  const batch = { label: "First", prompt: "Extract", requiredIdentifiers: ["1"] };
  assert.equal(validateGroundedControls({ controls: [control], standardKey: "RULE", sourceText: source.sourceText, sourceUrls: source.urls, batch }).length, 1);
  assert.throws(() => validateGroundedControls({ controls: [{ ...control, source_quote: "Invented requirement" }], standardKey: "RULE", sourceText: source.sourceText, sourceUrls: source.urls, batch }), /exact source quote/);
  assert.throws(() => validateGroundedControls({ controls: [control], standardKey: "RULE", sourceText: source.sourceText, sourceUrls: source.urls, batch: { ...batch, requiredIdentifiers: ["2"] } }), /incomplete/);
});

test("grounded quote matching tolerates source typography without accepting paraphrases", () => {
  const batch = { label: "First", prompt: "Extract" };
  const control = {
    id: "1",
    standard: "RULE",
    category: "Incident response",
    requirement: "Document the response.",
    risk_level: "High",
    source_url: source.urls[0],
    source_section: "Section 1",
    source_quote: "The organization must maintain a \"tested\" incident-response plan.",
    extraction_batch: "First"
  };
  const sourceText = "The organization must maintain a \u201ctested\u201d incident\u2011response plan.";
  assert.equal(validateGroundedControls({ controls: [control], standardKey: "RULE", sourceText, sourceUrls: source.urls, batch }).length, 1);
  assert.throws(() => validateGroundedControls({ controls: [{ ...control, source_quote: "The organization should probably maintain a tested plan." }], standardKey: "RULE", sourceText, sourceUrls: source.urls, batch }), /exact source quote/);
});

test("required CFR sections accept official identifier prefixes and source-section citations", () => {
  const sourceText = "164.308 Administrative safeguards. 164.310 Physical safeguards.";
  const controls = [
    {
      id: "45-CFR-164.308(a)(1)(i)",
      standard: "HIPAA",
      category: "Administrative safeguards",
      requirement: "Implement security management processes.",
      risk_level: "High",
      source_url: source.urls[0],
      source_section: "45 CFR 164.308(a)(1)(i)",
      source_quote: "164.308 Administrative safeguards.",
      extraction_batch: "HIPAA Security"
    },
    {
      id: "HIPAA-PHYSICAL-1",
      standard: "HIPAA",
      category: "Physical safeguards",
      requirement: "Implement physical safeguards.",
      risk_level: "High",
      source_url: source.urls[0],
      source_section: "45 CFR \u00a7 164.310",
      source_quote: "164.310 Physical safeguards.",
      extraction_batch: "HIPAA Security"
    }
  ];
  assert.equal(validateGroundedControls({
    controls,
    standardKey: "HIPAA",
    sourceText,
    sourceUrls: source.urls,
    batch: { label: "HIPAA Security", prompt: "Extract", requiredIdentifiers: ["164.308", "164.310"] }
  }).length, 2);
  assert.throws(() => validateGroundedControls({
    controls,
    standardKey: "HIPAA",
    sourceText,
    sourceUrls: source.urls,
    batch: { label: "HIPAA Security", prompt: "Extract", requiredIdentifiers: ["164.312"] }
  }), /164\.312/);
});

test("grounded batches reject duplicate ids with conflicting requirements before checkpointing", () => {
  const batch = { label: "CMS Emergency Preparedness", prompt: "Extract" };
  const base = {
    id: "Purpose",
    standard: "EP",
    category: "Emergency planning",
    requirement: "Maintain an emergency plan.",
    risk_level: "Critical",
    source_url: source.urls[0],
    source_section: "Purpose",
    source_quote: "The organization must document incident response procedures.",
    extraction_batch: batch.label
  };
  assert.throws(() => validateGroundedControls({
    controls: [base, { ...base, requirement: "Maintain a communication plan." }],
    standardKey: "EP",
    sourceText: source.sourceText,
    sourceUrls: source.urls,
    batch
  }), /duplicate id Purpose/);
});

test("official markup parsing decodes numeric XML entities before grounded extraction", () => {
  assert.equal(officialSourceParsers.readableMarkup("<P>&#167; 164.308 &#x2014; Security &amp; Privacy</P>"), "\u00a7 164.308 \u2014 Security & Privacy");
});

test("batch merging rejects conflicting versions of the same control", () => {
  const base = { id: "1", standard: "RULE", category: "IR", requirement: "Requirement one", risk_level: "High" };
  assert.equal(mergeControlBatches([[base], [base]]).length, 1);
  assert.throws(() => mergeControlBatches([[base], [{ ...base, requirement: "Different requirement" }]]), /Conflicting extracted requirements/);
});

test("publication requires an approved priority and category for every control", () => {
  const valid = { id: "IR-4", standard: "NIST", category: "Incident Response", requirement: "Handle incidents.", risk_level: "Critical" };
  assert.equal(validateControlBoardForPublication([valid]).length, 1);
  assert.throws(() => validateControlBoardForPublication([{ ...valid, category: "" }]), /needs a category/);
  assert.throws(() => validateControlBoardForPublication([{ ...valid, risk_level: "Urgent" }]), /invalid priority/);
});

test("CSF OSCAL parsing emits every nested subcategory outcome", () => {
  const raw = JSON.stringify({ catalog: { groups: [{
    id: "RS",
    title: "RESPOND",
    controls: [{
      id: "RS.MA",
      title: "Incident Management",
      controls: [
        { id: "RS.MA-01", parts: [{ prose: "The incident response plan is executed." }] },
        { id: "RS.MA-02", parts: [{ prose: "Incident reports are triaged and validated." }] }
      ]
    }]
  }] } });
  const controls = officialSourceParsers.csfControls(raw);
  assert.deepEqual(controls.map((control) => control.id), ["RS.MA-01", "RS.MA-02"]);
  assert.ok(controls.every((control) => control.standard === "CSF" && control.risk_level === "Critical"));
});

test("HITECH parsing excludes unrelated statute text and keeps sections 13400 through 13424", () => {
  const text = [
    "Table of contents SEC. 13400 definitions SEC. 13424 studies",
    "Unrelated appropriations",
    "SEC. 13400 DEFINITIONS actual statute SEC. 13401 APPLICATION SEC. 13424 STUDIES final requirement SEC. 14001 NEXT TITLE"
  ].join(" ");
  const scoped = officialSourceParsers.hitechStatutoryText(text);
  assert.match(scoped, /^SEC\. 13400 DEFINITIONS/);
  assert.match(scoped, /SEC\. 13424 STUDIES final requirement/);
  assert.doesNotMatch(scoped, /Unrelated appropriations|SEC\. 14001/);
});
