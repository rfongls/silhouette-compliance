import Anthropic from "@anthropic-ai/sdk";
import { sanitizeForExport } from "@/lib/sanitize";

export type ModelUsage = { inputTokens?: number; outputTokens?: number };

function extractJson(raw: string) {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("Model did not return a JSON object");
  return JSON.parse(raw.slice(start, end + 1));
}

export async function callAnthropicJson(system: string, prompt: string): Promise<{ json: unknown; usage: ModelUsage }> {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error("ANTHROPIC_API_KEY is not configured");
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const msg = await client.messages.create({
    model: process.env.ANTHROPIC_MODEL || "claude-3-5-sonnet-latest",
    max_tokens: 16000,
    system,
    messages: [{ role: "user", content: prompt }]
  });
  const text = msg.content.map((part) => part.type === "text" ? part.text : "").join("\n");
  return { json: sanitizeForExport(extractJson(text)), usage: { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens } };
}
