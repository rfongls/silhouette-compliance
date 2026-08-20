import Anthropic from "@anthropic-ai/sdk";
import { sanitizeForExport } from "@/lib/sanitize";
import { getAIConfig, markAIKeyUnverified } from "@/lib/settings";

export type ModelUsage = { inputTokens?: number; outputTokens?: number };
type JsonCallOptions = { schemaName?: string; schema?: Record<string, unknown> };

class AIProviderRequestError extends Error {
  status: number;

  constructor(label: string, status: number) {
    const message = status === 401
      ? `${label} rejected the configured API key. An administrator must replace and verify it in Analysis Settings.`
      : status === 403
        ? `${label} denied this request. Check the API key project permissions and selected model access.`
        : status === 429
          ? `${label} rate limit or quota was reached. Check provider usage and billing before retrying.`
          : `${label} request failed (HTTP ${status}).`;
    super(message);
    this.name = "AIProviderRequestError";
    this.status = status;
  }
}

function extractJson(raw: string) {
  const objStart = raw.indexOf("{");
  const arrStart = raw.indexOf("[");
  const start = arrStart >= 0 && (objStart < 0 || arrStart < objStart) ? arrStart : objStart;
  const endChar = start === arrStart ? "]" : "}";
  const end = raw.lastIndexOf(endChar);
  if (start < 0 || end < start) throw new Error("Model did not return JSON");
  return JSON.parse(raw.slice(start, end + 1));
}

async function callAnthropic(system: string, prompt: string, apiKey: string, model: string) {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: prompt }]
  });
  const text = msg.content.map((part) => part.type === "text" ? part.text : "").join("\n");
  return { json: sanitizeForExport(extractJson(text)), usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens } };
}

async function callOpenAICompatible(system: string, prompt: string, apiKey: string, model: string, baseUrl: string) {
  if (!baseUrl) throw new Error("AI base URL is required for this provider");
  const res = await fetch(baseUrl, {
    method: "POST",
    headers: {
      "authorization": `Bearer ${apiKey}`,
      "content-type": "application/json"
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      messages: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ]
    })
  });
  if (!res.ok) throw new AIProviderRequestError("AI provider", res.status);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return {
    json: sanitizeForExport(extractJson(text)),
    usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens }
  };
}

function responseOutputText(data: any) {
  if (typeof data?.output_text === "string") return data.output_text;
  for (const item of data?.output || []) {
    for (const content of item?.content || []) {
      if (content?.type === "output_text" && typeof content.text === "string") return content.text;
    }
  }
  return "";
}

async function callOpenAIResponses(system: string, prompt: string, apiKey: string, model: string, baseUrl: string, options?: JsonCallOptions) {
  const endpoint = baseUrl || "https://api.openai.com/v1/responses";
  const res = await fetch(endpoint, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      store: false,
      input: [
        { role: "system", content: system },
        { role: "user", content: prompt }
      ],
      ...(options?.schema ? {
        text: {
          format: {
            type: "json_schema",
            name: options.schemaName || "structured_response",
            strict: true,
            schema: options.schema
          }
        }
      } : {})
    })
  });
  if (!res.ok) throw new AIProviderRequestError("OpenAI", res.status);
  const data = await res.json();
  const text = responseOutputText(data);
  if (!text) throw new Error("OpenAI response did not contain output text");
  return {
    json: sanitizeForExport(extractJson(text)),
    usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }
  };
}

export async function callAIJson(system: string, prompt: string, options?: JsonCallOptions): Promise<{ json: unknown; usage: ModelUsage }> {
  const config = await getAIConfig();
  if (!config.apiKey) throw new Error(`${config.provider} API key is not configured`);
  try {
    if (config.provider === "anthropic") return await callAnthropic(system, prompt, config.apiKey, config.model);
    if (config.provider === "openai") return await callOpenAIResponses(system, prompt, config.apiKey, config.model, config.baseUrl, options);
    return await callOpenAICompatible(system, prompt, config.apiKey, config.model, config.baseUrl);
  } catch (error) {
    const status = error instanceof AIProviderRequestError
      ? error.status
      : typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 0;
    if (status === 401) await markAIKeyUnverified(config.provider).catch(() => undefined);
    throw error;
  }
}

export const callAnthropicJson = callAIJson;
