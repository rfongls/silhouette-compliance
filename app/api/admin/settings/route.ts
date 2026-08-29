import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { AIKeyVerificationError, verifyAIProviderReadiness } from "@/lib/ai-provider-validation";
import { getAIConfig, getAIConfigForAdmin, markAIKeyUnverified, markAIKeyVerified, setAIConfig, type AIProvider } from "@/lib/settings";

const providers = new Set(["anthropic", "openai", "deepseek", "openai-compatible"]);

function validModel(value: string) {
  return /^[a-zA-Z0-9._:-]{3,120}$/.test(value);
}

function validBaseUrl(value: string) {
  return !value || /^https:\/\/[^\s/$.?#].[^\s]*$/i.test(value);
}

export async function GET() {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  return NextResponse.json({ aiConfig: await getAIConfigForAdmin() });
}

export async function PATCH(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;

  const { provider, model: modelRaw, baseUrl: baseUrlRaw, apiKey: apiKeyRaw } = await req.json();
  const nextProvider = String(provider || "");
  const model = String(modelRaw || "").trim();
  const baseUrl = String(baseUrlRaw || "").trim();
  const apiKey = String(apiKeyRaw || "").trim();
  if (!providers.has(nextProvider)) return NextResponse.json({ error: "Invalid provider" }, { status: 400 });
  if (!validModel(model)) return NextResponse.json({ error: "Invalid model name" }, { status: 400 });
  if (!validBaseUrl(baseUrl)) return NextResponse.json({ error: "Invalid base URL" }, { status: 400 });

  const typedProvider = nextProvider as AIProvider;
  if (apiKey) {
    try {
      const verification = await verifyAIProviderReadiness({ provider: typedProvider, apiKey, baseUrl, model });
      await setAIConfig({ provider: typedProvider, model, baseUrl, apiKey });
      await markAIKeyVerified(typedProvider, apiKey, verification.verifiedAt);
    } catch (error) {
      const message = error instanceof AIKeyVerificationError ? error.message : "The API key could not be verified.";
      const status = error instanceof AIKeyVerificationError && error.status >= 400 && error.status < 500 ? 400 : 502;
      return NextResponse.json({ error: message }, { status });
    }
  } else {
    await setAIConfig({ provider: typedProvider, model, baseUrl });
  }
  return NextResponse.json({ aiConfig: await getAIConfigForAdmin() });
}

export async function POST() {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;

  const config = await getAIConfig();
  if (!config.apiKey) return NextResponse.json({ error: "No API key is stored for this provider." }, { status: 400 });
  try {
    const verification = await verifyAIProviderReadiness(config);
    await markAIKeyVerified(config.provider, config.apiKey, verification.verifiedAt);
    return NextResponse.json({ aiConfig: await getAIConfigForAdmin() });
  } catch (error) {
    await markAIKeyUnverified(config.provider).catch(() => undefined);
    const message = error instanceof AIKeyVerificationError ? error.message : "The API key could not be verified.";
    const status = error instanceof AIKeyVerificationError && error.status >= 400 && error.status < 500 ? 400 : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
