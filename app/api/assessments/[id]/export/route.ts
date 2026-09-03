import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildGapDeck } from "@/lib/exports/gap";
import { buildGapPdf, buildGapPptx } from "@/lib/exports/documents";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/sanitize";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "report";
  const a = await prisma.assessment.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId } });
  if (!a?.result) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  if (!new Set(["report", "deck", "presentation"]).has(format)) return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  const result = a.result as any;
  const name = slugify(String(result?.organization_name || "organization"));
  if (format === "presentation") {
    return new NextResponse(buildGapDeck(result), { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "private, no-store" } });
  }
  if (format === "deck") {
    const deck = await buildGapPptx(result);
    return new Response(new Uint8Array(deck), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}-irp-gap-analysis.pptx"`,
      "cache-control": "private, no-store"
    } });
  }
  const report = await buildGapPdf(result);
  return new Response(new Uint8Array(report), { headers: {
    "content-type": "application/pdf",
    "content-disposition": `attachment; filename="${name}-irp-gap-analysis.pdf"`,
    "cache-control": "private, no-store"
  } });
}
