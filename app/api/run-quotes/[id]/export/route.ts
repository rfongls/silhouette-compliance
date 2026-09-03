import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildNetworkGapPdf, buildNetworkGapPptx } from "@/lib/exports/documents";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/sanitize";

export const runtime = "nodejs";

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
  const name = slugify(String(quote.parentOrgName || "network"));
  if (format === "deck") {
    const deck = await buildNetworkGapPptx(quote.networkResult);
    return new Response(new Uint8Array(deck), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}-network-irp-gap-analysis.pptx"`,
      "cache-control": "private, no-store"
    } });
  }
  const report = await buildNetworkGapPdf(quote.networkResult);
  return new Response(new Uint8Array(report), { headers: {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${name}-network-irp-gap-analysis.pdf"`,
    "cache-control": "private, no-store"
  } });
}
