import crypto from "node:crypto";

export type IntegrityDocument = { name: string; text: string; orgName: string };

function digest(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

export function documentHash(document: Pick<IntegrityDocument, "text">) {
  return digest(document.text);
}

export function documentSetIntegrity(documents: IntegrityDocument[]) {
  const hashes = documents.map(documentHash);
  const duplicateHashes = [...new Set(hashes.filter((hash, index) => hashes.indexOf(hash) !== index))];
  return {
    hashes,
    duplicateHashes,
    sourceSetHash: digest([...hashes].sort().join("\n")),
    charCount: documents.reduce((sum, document) => sum + document.text.length, 0)
  };
}

export function quoteSourceDigest(documents: IntegrityDocument[]) {
  return digest(documents.map((document) => `${document.orgName}:${documentHash(document)}`).sort().join("\n"));
}

export function assessmentFingerprint(sourceSetHash: string, boardSnapshot: unknown, promptVersion: string) {
  return digest(`${sourceSetHash}\n${JSON.stringify(boardSnapshot)}\n${promptVersion}`);
}

export function groupDocumentsByOrg(documents: IntegrityDocument[], orgNames: string[]) {
  const requested = new Set(orgNames);
  const groups = new Map<string, IntegrityDocument[]>(orgNames.map((name) => [name, []]));
  for (const document of documents) {
    if (!requested.has(document.orgName)) throw new Error(`Document references an unknown organization: ${document.orgName}`);
    groups.get(document.orgName)!.push(document);
  }
  const empty = orgNames.filter((name) => !groups.get(name)?.some((document) => document.text.trim()));
  if (empty.length) throw new Error(`Upload at least one readable policy for: ${empty.join(", ")}`);
  return groups;
}
