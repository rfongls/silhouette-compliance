import assert from "node:assert/strict";
import test from "node:test";
import { normalizeExtractedPolicyText, PolicyDocumentError, validatePolicyPdfBuffer } from "../lib/policy-documents";

test("policy PDF validation requires a PDF signature", () => {
  assert.doesNotThrow(() => validatePolicyPdfBuffer(Buffer.from("%PDF-1.7\nexample")));
  assert.throws(
    () => validatePolicyPdfBuffer(Buffer.from("not a pdf")),
    (error: unknown) => error instanceof PolicyDocumentError && error.status === 415
  );
});

test("policy PDF validation rejects oversized files without truncation", () => {
  assert.throws(
    () => validatePolicyPdfBuffer(Buffer.from("%PDF-1.7\ncontent"), 5),
    (error: unknown) => error instanceof PolicyDocumentError && error.status === 413
  );
});

test("extracted policy text is normalized without removing content", () => {
  const source = "Policy heading\r\n\r\nControl one\u0000\r\n    \r\nControl two";
  const normalized = normalizeExtractedPolicyText(source);
  assert.equal(normalized, "Policy heading\n\nControl one\n\nControl two");
  assert.match(normalized, /Control one/);
  assert.match(normalized, /Control two/);
});
