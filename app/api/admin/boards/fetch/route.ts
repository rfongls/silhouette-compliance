import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { callAnthropicJson } from "@/lib/analysis/anthropic";
import { EXTRA_CB_BATCHES } from "@/lib/analysis/prompts";
import { standardBelongsToIndustry } from "@/lib/control-boards";
import { prisma } from "@/lib/prisma";
import { getAIConfigForAdmin } from "@/lib/settings";

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const { industry: rawIndustry, standardKey: rawStandardKey } = await req.json();
  const industry = String(rawIndustry || "");
  const standardKey = String(rawStandardKey || "");
  if (!standardBelongsToIndustry(industry, standardKey)) return NextResponse.json({ error: "Selected standard is not configured for this domain." }, { status: 400 });
  const aiConfig = await getAIConfigForAdmin();
  if (!aiConfig.hasApiKey) return NextResponse.json({ error: "AI provider API key is not configured. Add the Anthropic/provider key under Analysis Settings before fetching controls, or upload controls manually." }, { status: 400 });
  const batches = EXTRA_CB_BATCHES[standardKey] || [];
  if (!batches.length) return NextResponse.json({ error: "No batch prompts configured for standard" }, { status: 400 });
  const controls: unknown[] = [];
  for (const batch of batches) {
    const { json } = await callAnthropicJson("Fetch current authoritative compliance controls. Return JSON array only. No em dashes.", batch.prompt);
    if (Array.isArray(json)) controls.push(...json);
  }
  const latest = await prisma.controlBoard.findFirst({ where: { industry, standardKey }, orderBy: { version: "desc" } });
  const board = await prisma.controlBoard.create({ data: { industry, standardKey, version: (latest?.version || 0) + 1, status: "DRAFT", controls: controls as any, controlCount: controls.length } });
  return NextResponse.json({ board });
}
