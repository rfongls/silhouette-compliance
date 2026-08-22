import pdf from "pdf-parse/lib/pdf-parse.js";
import { irpCharacterLimitPerDocument } from "@/lib/run-quotes";

export const MAX_POLICY_PDF_BYTES = 20_000_000;

export class PolicyDocumentError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "PolicyDocumentError";
  }
}

export function validatePolicyPdfBuffer(input: Buffer, maxBytes = MAX_POLICY_PDF_BYTES) {
  if (!input.byteLength) throw new PolicyDocumentError("The selected PDF is empty.", 400);
  if (input.byteLength > maxBytes) {
    throw new PolicyDocumentError(`PDF files may not exceed ${Math.floor(maxBytes / 1_000_000)} MB.`, 413);
  }
  if (!input.subarray(0, Math.min(input.byteLength, 1024)).includes(Buffer.from("%PDF-"))) {
    throw new PolicyDocumentError("The selected file is not a valid PDF document.", 415);
  }
}

export function normalizeExtractedPolicyText(value: string) {
  return value
    .replace(/\u0000/g, "")
    .replace(/\r\n?/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{4,}/g, "\n\n\n")
    .trim();
}

export async function extractPolicyPdfText(input: Buffer) {
  validatePolicyPdfBuffer(input);
  let parsed;
  try {
    parsed = await pdf(input);
  } catch {
    throw new PolicyDocumentError("The PDF could not be read. It may be damaged, encrypted, or password protected.", 422);
  }
  const text = normalizeExtractedPolicyText(parsed.text || "");
  if (!text) {
    throw new PolicyDocumentError("The PDF contains no extractable text. Export it with selectable text or run OCR before uploading it.", 422);
  }
  const characterLimit = irpCharacterLimitPerDocument();
  if (text.length > characterLimit) {
    throw new PolicyDocumentError(`The extracted PDF exceeds the ${characterLimit.toLocaleString("en-US")} character file-size guard. No text was truncated.`, 413);
  }
  return { text, pages: parsed.numpages || null };
}
