import Anthropic from "@anthropic-ai/sdk";
import { sanitizeForExport } from "@/lib/sanitize";
import { getAIConfig } from "@/lib/settings";

export type ModelUsage = { inputTokens?: number; outputTokens?: number };

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
  if (!res.ok) throw new Error(`AI provider request failed: ${res.status} ${await res.text()}`);
  const data = await res.json();
  const text = data.choices?.[0]?.message?.content || "";
  return {
    json: sanitizeForExport(extractJson(text)),
    usage: { inputTokens: data.usage?.prompt_tokens, outputTokens: data.usage?.completion_tokens }
  };
}

export async function callAnthropicJson(system: string, prompt: string): Promise<{ json: unknown; usage: ModelUsage }> {
  const config = await getAIConfig();
  if (!config.apiKey) throw new Error(`${config.provider} API key is not configured`);
  if (config.provider === "anthropic") return callAnthropic(system, prompt, config.apiKey, config.model);
  return callOpenAICompatible(system, prompt, config.apiKey, config.model, config.baseUrl);
}
