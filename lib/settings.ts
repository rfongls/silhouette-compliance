import crypto from "node:crypto";
import { prisma } from "@/lib/prisma";

export type AIProvider = "anthropic" | "openai" | "deepseek" | "openai-compatible";

export const SETTING_KEYS = {
  aiProvider: "aiProvider",
  aiModel: "aiModel",
  aiBaseUrl: "aiBaseUrl",
  aiApiKey: "aiApiKey",
  anthropicModel: "anthropicModel"
} as const;

export type AIKeyStatus = "missing" | "stored" | "verified";

type AIKeyVerification = {
  provider: AIProvider;
  keyFingerprint: string;
  verifiedAt: string;
};

const providerDefaults: Record<AIProvider, { model: string; baseUrl: string }> = {
  anthropic: { model: "claude-3-5-sonnet-latest", baseUrl: "" },
  openai: { model: "gpt-5.6-terra", baseUrl: "https://api.openai.com/v1/responses" },
  deepseek: { model: "deepseek-chat", baseUrl: "https://api.deepseek.com/chat/completions" },
  "openai-compatible": { model: "gpt-4o-mini", baseUrl: "" }
};

function validProvider(value: string): value is AIProvider {
  return value === "anthropic" || value === "openai" || value === "deepseek" || value === "openai-compatible";
}

export async function getSetting(key: string, fallback = "") {
  const setting = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null);
  return setting?.value || fallback;
}

export async function getAnthropicModel() {
  const config = await getAIConfig();
  return config.model;
}

export async function setSetting(key: string, value: string) {
  return prisma.appSetting.upsert({
    where: { key },
    create: { key, value },
    update: { value }
  });
}

function secretKey() {
  const secret = process.env.ADMIN_SECRET_ENCRYPTION_KEY || process.env.AUTH_SECRET || process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error("ADMIN_SECRET_ENCRYPTION_KEY or AUTH_SECRET is required to store API keys");
  return crypto.createHash("sha256").update(secret).digest();
}

export function encryptSecret(value: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", secretKey(), iv);
  const encrypted = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), encrypted.toString("base64")].join(":");
}

export function decryptSecret(value: string) {
  const [iv, tag, encrypted] = value.split(":");
  if (!iv || !tag || !encrypted) return "";
  const decipher = crypto.createDecipheriv("aes-256-gcm", secretKey(), Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(encrypted, "base64")), decipher.final()]).toString("utf8");
}

function envKeyFor(provider: AIProvider) {
  if (provider === "anthropic") return process.env.ANTHROPIC_API_KEY || "";
  if (provider === "openai") return process.env.OPENAI_API_KEY || "";
  if (provider === "deepseek") return process.env.DEEPSEEK_API_KEY || "";
  return process.env.AI_API_KEY || "";
}

function envModelFor(provider: AIProvider) {
  if (process.env.AI_MODEL) return process.env.AI_MODEL;
  if (provider === "anthropic") return process.env.ANTHROPIC_MODEL || providerDefaults.anthropic.model;
  if (provider === "openai") return process.env.OPENAI_MODEL || providerDefaults.openai.model;
  if (provider === "deepseek") return process.env.DEEPSEEK_MODEL || providerDefaults.deepseek.model;
  return providerDefaults["openai-compatible"].model;
}

function envBaseUrlFor(provider: AIProvider) {
  if (process.env.AI_BASE_URL) return process.env.AI_BASE_URL;
  if (provider === "deepseek") return process.env.DEEPSEEK_BASE_URL || providerDefaults.deepseek.baseUrl;
  if (provider === "openai") return process.env.OPENAI_BASE_URL || providerDefaults.openai.baseUrl;
  return providerDefaults[provider].baseUrl;
}

function normalizedBaseUrl(provider: AIProvider, value: string) {
  if (provider === "openai") {
    return providerDefaults.openai.baseUrl;
  }
  return value;
}

function providerApiKeySetting(provider: AIProvider) {
  return `${SETTING_KEYS.aiApiKey}:${provider}`;
}

function providerVerificationSetting(provider: AIProvider) {
  return `${SETTING_KEYS.aiApiKey}:verification:${provider}`;
}

function keyFingerprint(apiKey: string) {
  return crypto.createHash("sha256").update(apiKey).digest("hex");
}

async function getKeyVerification(provider: AIProvider, apiKey: string): Promise<AIKeyVerification | null> {
  if (!apiKey) return null;
  const raw = await getSetting(providerVerificationSetting(provider), "");
  if (!raw) return null;
  try {
    const verification = JSON.parse(raw) as AIKeyVerification;
    if (verification.provider !== provider || verification.keyFingerprint !== keyFingerprint(apiKey)) return null;
    return verification;
  } catch {
    return null;
  }
}

export async function getAIConfig() {
  const storedProvider = await getSetting(SETTING_KEYS.aiProvider, process.env.AI_PROVIDER || "anthropic");
  const provider: AIProvider = validProvider(storedProvider) ? storedProvider : "anthropic";
  const legacyModel = await getSetting(SETTING_KEYS.anthropicModel, "");
  const model = await getSetting(SETTING_KEYS.aiModel, legacyModel || envModelFor(provider));
  const configuredBaseUrl = await getSetting(SETTING_KEYS.aiBaseUrl, envBaseUrlFor(provider));
  const baseUrl = normalizedBaseUrl(provider, configuredBaseUrl);
  const encrypted = await getSetting(providerApiKeySetting(provider), "") || await getSetting(SETTING_KEYS.aiApiKey, "");
  const apiKey = encrypted ? decryptSecret(encrypted) : envKeyFor(provider);
  return { provider, model, baseUrl, apiKey };
}

export async function getAIConfigForAdmin() {
  const config = await getAIConfig();
  const verification = await getKeyVerification(config.provider, config.apiKey);
  return {
    provider: config.provider,
    model: config.model,
    baseUrl: config.baseUrl,
    hasApiKey: Boolean(config.apiKey),
    keyStatus: (!config.apiKey ? "missing" : verification ? "verified" : "stored") as AIKeyStatus,
    keyVerifiedAt: verification?.verifiedAt || null
  };
}

export async function markAIKeyVerified(provider: AIProvider, apiKey: string, verifiedAt: string) {
  const verification: AIKeyVerification = {
    provider,
    keyFingerprint: keyFingerprint(apiKey),
    verifiedAt
  };
  await setSetting(providerVerificationSetting(provider), JSON.stringify(verification));
}

export async function markAIKeyUnverified(provider: AIProvider) {
  await setSetting(providerVerificationSetting(provider), "");
}

export async function setAIConfig(input: { provider: AIProvider; model: string; baseUrl?: string; apiKey?: string }) {
  await Promise.all([
    setSetting(SETTING_KEYS.aiProvider, input.provider),
    setSetting(SETTING_KEYS.aiModel, input.model),
    setSetting(SETTING_KEYS.aiBaseUrl, input.baseUrl || "")
  ]);
  if (input.apiKey?.trim()) await setSetting(providerApiKeySetting(input.provider), encryptSecret(input.apiKey.trim()));
}
