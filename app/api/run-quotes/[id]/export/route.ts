import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildNetworkGapDeck, buildNetworkGapJson, buildNetworkGapReport } from "@/lib/exports/gap";
import { prisma } from "@/lib/prisma";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const format = new URL(req.url).searchParams.get("format") || "report";
  const quote = await prisma.runQuote.findFirst({
    where: { id: params.id, accountId: guard.session.user.accountId, module: "irp", assessmentScope: "network" },
    select: { networkResult: true }
  });
  if (!quote?.networkResult) return NextResponse.json({ error: "Network report not found" }, { status: 404 });
  if (format === "json") return new NextResponse(buildNetworkGapJson(quote.networkResult), { headers: { "content-type": "application/json" } });
  if (format === "deck") return new NextResponse(buildNetworkGapDeck(quote.networkResult), { headers: { "content-type": "text/html; charset=utf-8" } });
  return new NextResponse(buildNetworkGapReport(quote.networkResult), { headers: { "content-type": "text/html; charset=utf-8" } });
}
