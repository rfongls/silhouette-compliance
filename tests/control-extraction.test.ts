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
  assert.equal(plan.requestCount, 2);
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
