import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { normalizeControlImport, standardBelongsToIndustry } from "@/lib/control-boards";
import { prisma } from "@/lib/prisma";

export async function POST(req: Request) {
  const guard = await requireSession("admin");
  if ("response" in guard) return guard.response;
  const body = await req.json().catch(() => ({}));
  const industry = String(body.industry || "");
  const standardKey = String(body.standardKey || "");
  if (!standardBelongsToIndustry(industry, standardKey)) return NextResponse.json({ error: "Selected standard is not configured for this domain." }, { status: 400 });

  let controls: ReturnType<typeof normalizeControlImport>;
  try {
    controls = normalizeControlImport(body.controlsJson ?? body.controls);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message }, { status: 400 });
  }

  const latest = await prisma.controlBoard.findFirst({ where: { industry, standardKey }, orderBy: { version: "desc" } });
  const board = await prisma.controlBoard.create({
    data: {
      industry,
      standardKey,
      version: (latest?.version || 0) + 1,
      status: "DRAFT",
      controls,
      controlCount: controls.length
    }
  });
  return NextResponse.json({ board });
}
