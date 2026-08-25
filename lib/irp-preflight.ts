import { verifyAIKey } from "@/lib/ai-provider-validation";
import { documentSetIntegrity, groupDocumentsByOrg, type IntegrityDocument } from "@/lib/document-integrity";
import { getAIConfig, markAIKeyVerified } from "@/lib/settings";

export type IrpPreflightResult = {
  passed: true;
  checkedAt: string;
  checks: string[];
  provider: string;
  model: string;
  maxCharsPerOrg: number;
};

export function validateIrpDocuments(documents: IntegrityDocument[], orgNames: string[]) {
  if (!documents.length || documents.every((document) => !document.text.trim())) {
    throw new Error("At least one document text payload is required.");
  }
  const groupedDocuments = groupDocumentsByOrg(documents, orgNames);
  let maxCharsPerOrg = 0;
  for (const [orgName, rows] of groupedDocuments) {
    const integrity = documentSetIntegrity(rows);
    if (integrity.duplicateHashes.length) {
      throw new Error(`Duplicate file content was submitted more than once for ${orgName}. Remove the duplicate and start the run again.`);
    }
    maxCharsPerOrg = Math.max(maxCharsPerOrg, integrity.charCount);
  }
  return { groupedDocuments, maxCharsPerOrg };
}

export async function verifyIrpProvider() {
  const config = await getAIConfig();
  if (!config.apiKey?.trim()) throw new Error("The configured AI provider does not have an API key.");
  if (!config.model?.trim()) throw new Error("The configured AI provider does not have a model selected.");
  const verification = await verifyAIKey({ provider: config.provider, apiKey: config.apiKey, baseUrl: config.baseUrl });
  await markAIKeyVerified(config.provider, config.apiKey, verification.verifiedAt);
  return { ...config, verifiedAt: verification.verifiedAt };
}

export function irpPreflightResult(input: {
  provider: string;
  model: string;
  verifiedAt: string;
  maxCharsPerOrg: number;
}): IrpPreflightResult {
  return {
    passed: true,
    checkedAt: input.verifiedAt,
    provider: input.provider,
    model: input.model,
    maxCharsPerOrg: input.maxCharsPerOrg,
    checks: [
      "Organization and document mapping",
      "Duplicate content detection",
      "Published control-board integrity",
      "Processing-size and cost guard",
      "Live AI provider credential"
    ]
  };
}
