import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { getAIConfigForAdmin, setAIConfig, type AIProvider } from "@/lib/settings";

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

  await setAIConfig({ provider: nextProvider as AIProvider, model, baseUrl, apiKey });
  return NextResponse.json({ aiConfig: await getAIConfigForAdmin() });
}
