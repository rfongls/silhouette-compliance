import crypto from "node:crypto";
import { PutObjectCommand, S3Client, DeleteObjectCommand } from "@aws-sdk/client-s3";

function keyBytes() {
  const raw = process.env.SRA_EVIDENCE_ENCRYPTION_KEY || "";
  const buf = Buffer.from(raw, "base64");
  if (buf.length === 32) return buf;
  return crypto.createHash("sha256").update(raw || "dev-only-change-me").digest();
}

export function parseEvidence(filename: string, text: string) {
  const lower = filename.toLowerCase();
  if (lower.endsWith(".json")) return JSON.parse(text);
  if (lower.endsWith(".csv")) {
    const [head, ...rows] = text.split(/\r?\n/).filter(Boolean);
    const cols = head.split(",").map((c) => c.trim());
    return rows.map((row) => Object.fromEntries(row.split(",").map((cell, i) => [cols[i] || `col_${i}`, cell.trim()])));
  }
  if (lower.endsWith(".xml")) return { xmlText: text.slice(0, 200000) };
  return { text: text.slice(0, 200000) };
}

export function encryptEvidence(bytes: Buffer) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", keyBytes(), iv);
  const encrypted = Buffer.concat([cipher.update(bytes), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([Buffer.from("SIL1"), iv, tag, encrypted]);
}

function s3() {
  const endpoint = process.env.S3_ENDPOINT;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  const region = process.env.S3_REGION || "auto";
  if (!endpoint || !accessKeyId || !secretAccessKey || !process.env.S3_BUCKET) return null;
  return new S3Client({ endpoint, region, forcePathStyle: true, credentials: { accessKeyId, secretAccessKey } });
}

export async function putEncryptedEvidence(accountId: string, engagementId: string, filename: string, bytes: Buffer) {
  const client = s3();
  if (!client) throw new Error("S3-compatible evidence storage is not configured");
  const storageKey = `${accountId}/${engagementId}/${Date.now()}-${filename.replace(/[^a-z0-9._-]/gi, "_")}.enc`;
  await client.send(new PutObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: storageKey, Body: encryptEvidence(bytes), ContentType: "application/octet-stream" }));
  return storageKey;
}

export async function deleteEvidenceBlob(storageKey?: string | null) {
  if (!storageKey) return;
  const client = s3();
  if (!client) return;
  await client.send(new DeleteObjectCommand({ Bucket: process.env.S3_BUCKET!, Key: storageKey }));
}
