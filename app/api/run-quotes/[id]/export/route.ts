import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildNetworkGapDeck, buildNetworkGapReport } from "@/lib/exports/gap";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const format = new URL(req.url).searchParams.get("format") || "report";
  const quote = await prisma.runQuote.findFirst({
    where: { id: params.id, accountId: guard.session.user.accountId, module: "irp", reportDeletedAt: null },
    select: { assessmentScope: true, parentOrgName: true, reportAssessmentIds: true, networkResult: true }
  });
  if (!quote) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (!new Set(["report", "deck"]).has(format)) return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  if (!quote.networkResult || quote.assessmentScope !== "network") return NextResponse.json({ error: "Network report not found" }, { status: 404 });
  if (format === "deck") return new NextResponse(buildNetworkGapDeck(quote.networkResult), { headers: { "content-type": "text/html; charset=utf-8" } });
  return new NextResponse(buildNetworkGapReport(quote.networkResult), { headers: { "content-type": "text/html; charset=utf-8" } });
}
