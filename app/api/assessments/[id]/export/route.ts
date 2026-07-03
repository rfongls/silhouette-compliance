import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildGapDeck, buildGapJson, buildGapReport } from "@/lib/exports/gap";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "report";
  const a = await prisma.assessment.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId } });
  if (!a?.result) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  if (format === "json") return new NextResponse(buildGapJson(a.result), { headers: { "content-type": "application/json" } });
  if (format === "deck") return new NextResponse(buildGapDeck(a.result), { headers: { "content-type": "text/html; charset=utf-8" } });
  return new NextResponse(buildGapReport(a.result), { headers: { "content-type": "text/html; charset=utf-8" } });
}
