import Anthropic from "@anthropic-ai/sdk";
import { sanitizeForExport } from "@/lib/sanitize";
import { getAIConfig, markAIKeyUnverified } from "@/lib/settings";

export type ModelUsage = { inputTokens?: number; outputTokens?: number };
type JsonCallOptions = { schemaName?: string; schema?: Record<string, unknown> };

export type AIProviderFailureEvidence = {
  provider: string;
  model: string;
  httpStatus: number | null;
  code: string | null;
  requestId: string | null;
  retriable: boolean;
  attempts: number;
  stage: "provider_request" | "provider_response";
};

export class AIProviderRequestError extends Error {
  evidence: AIProviderFailureEvidence;

  constructor(label: string, evidence: AIProviderFailureEvidence) {
    const status = evidence.httpStatus || 0;
    const message = status === 401
      ? `${label} rejected the configured API key. An administrator must replace and verify it in Analysis Settings.`
      : status === 403
        ? `${label} denied this request. Check the API key project permissions and selected model access.`
        : status === 429
          ? `${label} rate limit or quota was reached. Check provider usage and billing before retrying.`
          : `${label} request failed (HTTP ${status}).`;
    super(message);
    this.name = "AIProviderRequestError";
    this.evidence = evidence;
  }
}

export function providerFailureEvidence(error: unknown): AIProviderFailureEvidence | null {
  return error instanceof AIProviderRequestError ? error.evidence : null;
}

export function isRetriableProviderFailure(status: number, code?: string | null) {
  const normalizedCode = (code || "").toLowerCase();
  if (normalizedCode === "credit_balance_exhausted" || normalizedCode === "insufficient_quota" || normalizedCode === "invalid_api_key") return false;
  return status === 408 || status === 409 || status === 429 || status >= 500;
}

function safeProviderError(data: any) {
  return {
    code: typeof data?.error?.code === "string" ? data.error.code.slice(0, 120) : null,
    type: typeof data?.error?.type === "string" ? data.error.type.slice(0, 120) : null
  };
}

async function providerHttpError(response: Response, label: string, provider: string, model: string) {
  const data = await response.json().catch(() => null);
  const detail = safeProviderError(data);
  return new AIProviderRequestError(label, {
    provider,
    model,
    httpStatus: response.status,
    code: detail.code || detail.type,
    requestId: response.headers.get("x-request-id") || response.headers.get("request-id"),
    retriable: isRetriableProviderFailure(response.status, detail.code || detail.type),
    attempts: 1,
    stage: "provider_request"
  });
}

function invalidProviderResponse(label: string, provider: string, model: string, requestId: string | null, code: string) {
  return new AIProviderRequestError(label, {
    provider,
    model,
    httpStatus: 200,
    code,
    requestId,
    retriable: true,
    attempts: 1,
    stage: "provider_response"
  });
}

async function retryProviderCall<T>(call: () => Promise<T>, provider: string, model: string): Promise<T> {
  const maxAttempts = 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await call();
    } catch (error) {
      const existing = providerFailureEvidence(error);
      const inferredStatus = typeof error === "object" && error && "status" in error ? Number(error.status) || null : null;
      const evidence: AIProviderFailureEvidence = existing
        ? { ...existing, attempts: attempt }
        : {
            provider,
            model,
            httpStatus: inferredStatus,
            code: typeof error === "object" && error && "name" in error ? String(error.name).slice(0, 120) : "network_error",
            requestId: typeof error === "object" && error && "request_id" in error ? String(error.request_id).slice(0, 200) : null,
            retriable: inferredStatus ? isRetriableProviderFailure(inferredStatus) : true,
            attempts: attempt,
            stage: "provider_request"
          };
      if (!evidence.retriable || attempt === maxAttempts) throw new AIProviderRequestError("AI provider", evidence);
      await new Promise((resolve) => setTimeout(resolve, 400 * (2 ** (attempt - 1))));
    }
  }
  throw new Error("AI provider retry loop ended unexpectedly");
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
  try {
    return { json: sanitizeForExport(extractJson(text)), usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens } };
  } catch {
    throw invalidProviderResponse("Anthropic", "anthropic", model, null, "invalid_json_response");
  }
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
  if (!res.ok) throw await providerHttpError(res, "AI provider", "openai-compatible", model);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  try {
    return {
      json: sanitizeForExport(extractJson(text)),
      usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens }
    };
  } catch {
    throw invalidProviderResponse("AI provider", "openai-compatible", model, res.headers.get("x-request-id"), "invalid_json_response");
  }
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
  if (!res.ok) throw await providerHttpError(res, "OpenAI", "openai", model);
  const data = await res.json();
  const text = responseOutputText(data);
  const requestId = res.headers.get("x-request-id");
  if (!text) throw invalidProviderResponse("OpenAI", "openai", model, requestId, "missing_output_text");
  try {
    return {
      json: sanitizeForExport(extractJson(text)),
      usage: { inputTokens: data.usage?.input_tokens, outputTokens: data.usage?.output_tokens }
    };
  } catch {
    throw invalidProviderResponse("OpenAI", "openai", model, requestId, "invalid_json_response");
  }
}

export async function callAIJson(system: string, prompt: string, options?: JsonCallOptions): Promise<{ json: unknown; usage: ModelUsage }> {
  const config = await getAIConfig();
  if (!config.apiKey) throw new Error(`${config.provider} API key is not configured`);
  try {
    if (config.provider === "anthropic") return await retryProviderCall(() => callAnthropic(system, prompt, config.apiKey, config.model), config.provider, config.model);
    if (config.provider === "openai") return await retryProviderCall(() => callOpenAIResponses(system, prompt, config.apiKey, config.model, config.baseUrl, options), config.provider, config.model);
    return await retryProviderCall(() => callOpenAICompatible(system, prompt, config.apiKey, config.model, config.baseUrl), config.provider, config.model);
  } catch (error) {
    const status = error instanceof AIProviderRequestError
      ? error.evidence.httpStatus || 0
      : typeof error === "object" && error && "status" in error
        ? Number(error.status)
        : 0;
    if (status === 401) await markAIKeyUnverified(config.provider).catch(() => undefined);
    throw error;
  }
}

export const callAnthropicJson = callAIJson;
