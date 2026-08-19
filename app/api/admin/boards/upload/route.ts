import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { normalizeControlImport, standardBelongsToIndustry } from "@/lib/control-boards";
import { prisma } from "@/lib/prisma";
import crypto from "node:crypto";

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const industry = String(body.industry || "");
  const standardKey = String(body.standardKey || "");
  if (!standardBelongsToIndustry(industry, standardKey)) return NextResponse.json({ error: "Selected standard is not configured for this domain." }, { status: 400 });

  let controls: ReturnType<typeof normalizeControlImport>;
  try {
    controls = normalizeControlImport(body.controlsJson ?? body.controls, standardKey);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }
  const sourceTitle = String(body.sourceTitle || "").trim();
  const sourceVersion = String(body.sourceVersion || "").trim();
  const sourceUrls = Array.isArray(body.sourceUrls)
    ? body.sourceUrls.map((value: unknown) => String(value).trim()).filter(Boolean)
    : String(body.sourceUrls || "").split(/[\r\n,]+/).map((value: string) => value.trim()).filter(Boolean);
  const reviewNotes = String(body.reviewNotes || "").trim();
  if (!sourceTitle || !sourceVersion || !sourceUrls.length || !reviewNotes) {
    return NextResponse.json({ error: "Source title, source version, at least one source URL, and review notes are required." }, { status: 400 });
  }

  const latest = await prisma.controlBoard.findFirst({ where: { industry, standardKey }, orderBy: { version: "desc" } });
  const board = await prisma.controlBoard.create({
    data: {
      industry,
      standardKey,
      version: (latest?.version || 0) + 1,
      status: "DRAFT",
      controls,
      controlCount: controls.length,
      sourceTitle,
      sourceVersion,
      sourceUrls,
      sourceHash: crypto.createHash("sha256").update(JSON.stringify(controls)).digest("hex"),
      retrievedAt: new Date(),
      reviewNotes
    }
  });
  return NextResponse.json({ board });
}
