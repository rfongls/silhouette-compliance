import type { AIProvider } from "@/lib/settings";

type VerificationInput = {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
};

type ReadinessInput = VerificationInput & {
  model: string;
};

export class AIKeyVerificationError extends Error {
  status: number;

  constructor(message: string, status = 400) {
    super(message);
    this.name = "AIKeyVerificationError";
    this.status = status;
  }
}

function verificationRequest(input: VerificationInput): { url: string; headers: Record<string, string> } {
  if (input.provider === "openai") {
    return {
      url: "https://api.openai.com/v1/models",
      headers: { authorization: `Bearer ${input.apiKey}` }
    };
  }

  if (input.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/models?limit=1",
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": input.apiKey
      }
    };
  }

  if (input.provider === "deepseek") {
    return {
      url: "https://api.deepseek.com/models",
      headers: { authorization: `Bearer ${input.apiKey}` }
    };
  }

  if (!input.baseUrl) {
    throw new AIKeyVerificationError("A base URL is required before this provider can be verified.");
  }

  const endpoint = new URL(input.baseUrl);
  const versionPrefix = endpoint.pathname.match(/^\/v\d+/)?.[0] || "";
  endpoint.pathname = `${versionPrefix}/models`;
  endpoint.search = "";
  endpoint.hash = "";
  return {
    url: endpoint.toString(),
    headers: { authorization: `Bearer ${input.apiKey}` }
  };
}

export function providerVerificationError(provider: AIProvider, status: number) {
  const label = provider === "openai-compatible" ? "AI provider" : provider === "openai" ? "OpenAI" : provider === "anthropic" ? "Anthropic" : "DeepSeek";
  if (status === 401) return `${label} rejected the API key. Replace it with an active API key from the provider account.`;
  if (status === 403) return `${label} accepted the credential but denied access. Check the key's project and permissions.`;
  if (status === 429) return `${label} rate-limited the verification request. Wait briefly, then test the key again.`;
  return `${label} could not verify the API key (HTTP ${status}).`;
}

function providerLabel(provider: AIProvider) {
  if (provider === "openai-compatible") return "AI provider";
  if (provider === "openai") return "OpenAI";
  if (provider === "anthropic") return "Anthropic";
  return "DeepSeek";
}

function readinessRequest(input: ReadinessInput): { url: string; headers: Record<string, string>; body: string } {
  const prompt = "Reply with OK.";
  if (input.provider === "openai") {
    return {
      url: "https://api.openai.com/v1/responses",
      headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ model: input.model, store: false, input: prompt, max_output_tokens: 16 })
    };
  }
  if (input.provider === "anthropic") {
    return {
      url: "https://api.anthropic.com/v1/messages",
      headers: {
        "anthropic-version": "2023-06-01",
        "x-api-key": input.apiKey,
        "content-type": "application/json"
      },
      body: JSON.stringify({ model: input.model, max_tokens: 8, messages: [{ role: "user", content: prompt }] })
    };
  }
  if (!input.baseUrl) throw new AIKeyVerificationError("A base URL is required before this provider can be tested.");
  return {
    url: input.baseUrl,
    headers: { authorization: `Bearer ${input.apiKey}`, "content-type": "application/json" },
    body: JSON.stringify({ model: input.model, max_tokens: 8, messages: [{ role: "user", content: prompt }] })
  };
}

async function readinessError(response: Response, provider: AIProvider) {
  const data = await response.json().catch(() => null);
  const code = String(data?.error?.code || data?.error?.type || "").toLowerCase();
  const label = providerLabel(provider);
  if (code === "credit_balance_exhausted" || code === "insufficient_quota" || code === "billing_hard_limit_reached") {
    return `${label} account balance is exhausted. An administrator must restore provider credits before assessments can run.`;
  }
  if (response.status === 401 || code === "invalid_api_key") {
    return `${label} rejected the API key. Replace it with an active key from the provider account.`;
  }
  if (response.status === 403) return `${label} denied access to the selected model. Check project permissions and model access.`;
  if (response.status === 429) return `${label} is currently rate-limited. Wait for the provider limit to reset before running an assessment.`;
  if (response.status === 400) return `${label} rejected the selected model or readiness request. Verify the configured model name and access.`;
  return `${label} could not complete an operational readiness check (HTTP ${response.status}).`;
}

export async function verifyAIKey(input: VerificationInput) {
  const apiKey = input.apiKey.trim();
  if (!apiKey) throw new AIKeyVerificationError("Enter an API key before verifying it.");

  let request: ReturnType<typeof verificationRequest>;
  try {
    request = verificationRequest({ ...input, apiKey });
  } catch (error) {
    if (error instanceof AIKeyVerificationError) throw error;
    throw new AIKeyVerificationError("The provider base URL is invalid.");
  }

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "GET",
      headers: request.headers,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000)
    });
  } catch {
    throw new AIKeyVerificationError("The provider could not be reached. Check the base URL and try again.", 503);
  }

  if (!response.ok) {
    throw new AIKeyVerificationError(providerVerificationError(input.provider, response.status), response.status);
  }

  return { verifiedAt: new Date().toISOString() };
}

export async function verifyAIProviderReadiness(input: ReadinessInput) {
  const apiKey = input.apiKey.trim();
  const model = input.model.trim();
  if (!apiKey) throw new AIKeyVerificationError("Enter an API key before testing the provider.");
  if (!model) throw new AIKeyVerificationError("Select a model before testing the provider.");

  let request: ReturnType<typeof readinessRequest>;
  try {
    request = readinessRequest({ ...input, apiKey, model });
  } catch (error) {
    if (error instanceof AIKeyVerificationError) throw error;
    throw new AIKeyVerificationError("The provider readiness request could not be prepared.");
  }

  let response: Response;
  try {
    response = await fetch(request.url, {
      method: "POST",
      headers: request.headers,
      body: request.body,
      cache: "no-store",
      signal: AbortSignal.timeout(30_000)
    });
  } catch {
    throw new AIKeyVerificationError("The provider could not be reached for an operational readiness check.", 503);
  }
  if (!response.ok) throw new AIKeyVerificationError(await readinessError(response, input.provider), response.status);
  return { verifiedAt: new Date().toISOString() };
}
