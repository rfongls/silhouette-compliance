import assert from "node:assert/strict";
import test from "node:test";
import { buildControlExtractionPlan, controlRefreshStatus, mergeControlBatches, validateGroundedControls } from "../lib/control-extraction";
import { validateControlBoardForPublication } from "../lib/control-boards";

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
