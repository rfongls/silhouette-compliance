import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { callAnthropicJson } from "@/lib/analysis/anthropic";
import { EXTRA_CB_BATCHES } from "@/lib/analysis/prompts";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const { industry, standardKey } = await req.json();
  const batches = EXTRA_CB_BATCHES[String(standardKey)] || [];
  if (!batches.length) return NextResponse.json({ error: "No batch prompts configured for standard" }, { status: 400 });
  const controls: unknown[] = [];
  for (const batch of batches) {
    const { json } = await callAnthropicJson("Fetch current authoritative compliance controls. Return JSON array only. No em dashes.", batch.prompt);
    if (Array.isArray(json)) controls.push(...json);
  }
  const latest = await prisma.controlBoard.findFirst({ where: { industry: String(industry), standardKey: String(standardKey) }, orderBy: { version: "desc" } });
  const board = await prisma.controlBoard.create({ data: { industry: String(industry), standardKey: String(standardKey), version: (latest?.version || 0) + 1, status: "DRAFT", controls: controls as any, controlCount: controls.length } });
  return NextResponse.json({ board });
}
