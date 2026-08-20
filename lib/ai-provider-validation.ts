import type { AIProvider } from "@/lib/settings";

type VerificationInput = {
  provider: AIProvider;
  apiKey: string;
  baseUrl?: string;
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
