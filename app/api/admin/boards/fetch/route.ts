import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { callAnthropicJson } from "@/lib/analysis/anthropic";
import { EXTRA_CB_BATCHES } from "@/lib/analysis/prompts";
import { normalizeControlImport, standardBelongsToIndustry } from "@/lib/control-boards";
import { fetchOfficialControlSource } from "@/lib/official-control-sources";
import { prisma } from "@/lib/prisma";
import { getAIConfigForAdmin } from "@/lib/settings";

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const { industry: rawIndustry, standardKey: rawStandardKey } = await req.json();
  const industry = String(rawIndustry || "");
  const standardKey = String(rawStandardKey || "");
  if (!standardBelongsToIndustry(industry, standardKey)) return NextResponse.json({ error: "Selected standard is not configured for this domain." }, { status: 400 });
  let source: Awaited<ReturnType<typeof fetchOfficialControlSource>>;
  try {
    source = await fetchOfficialControlSource(standardKey);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  let controls = source.controls || [];
  if (!controls.length) {
    const aiConfig = await getAIConfigForAdmin();
    if (!aiConfig.hasApiKey) return NextResponse.json({ error: "This official source requires grounded AI extraction. Add the provider API key under Analysis Settings, or upload reviewed controls manually." }, { status: 400 });
    const batch = EXTRA_CB_BATCHES[standardKey]?.[0];
    if (!batch || !source.sourceText) return NextResponse.json({ error: "No grounded extraction workflow is configured for this standard." }, { status: 400 });
    if (source.sourceText.length > 500000) return NextResponse.json({ error: "Official source is too large for grounded extraction. Download and review it, then use manual JSON upload." }, { status: 413 });
    const { json } = await callAnthropicJson(
      "Extract compliance controls only from the supplied official source text. Do not use memory or outside knowledge. Return a JSON array only with id, standard, category, requirement, and risk_level. No em dashes.",
      `${batch.prompt.replace(/Fetch current authoritative text first\.?/gi, "")}\n\nOFFICIAL SOURCE TEXT:\n${source.sourceText}`
    );
    controls = normalizeControlImport(json, standardKey);
  }
  controls = normalizeControlImport(controls, standardKey);
  const latest = await prisma.controlBoard.findFirst({ where: { industry, standardKey }, orderBy: { version: "desc" } });
  const board = await prisma.controlBoard.create({
    data: {
      industry,
      standardKey,
      version: (latest?.version || 0) + 1,
      status: "DRAFT",
      controls,
      controlCount: controls.length,
      sourceTitle: source.title,
      sourceVersion: source.version,
      sourceUrls: source.urls,
      sourceHash: source.sourceHash,
      retrievedAt: source.retrievedAt
    }
  });
  return NextResponse.json({ board });
}
