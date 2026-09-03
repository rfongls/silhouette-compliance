import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildGapExecutivePdf, buildGapFindingsPdf, buildGapPptx } from "@/lib/exports/documents";
import { buildPdfPackage } from "@/lib/exports/pdf-package";
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
  if (!new Set(["report", "deck"]).has(format)) return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  const result = a.result as any;
  const name = slugify(String(result?.organization_name || "organization"));
  if (format === "deck") {
    const deck = await buildGapPptx(result);
    return new Response(new Uint8Array(deck), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}-irp-gap-analysis.pptx"`,
      "cache-control": "private, no-store"
    } });
  }
  const [executiveReport, detailedFindings] = await Promise.all([
    buildGapExecutivePdf(result),
    buildGapFindingsPdf(result)
  ]);
  const reportPackage = await buildPdfPackage([
    { name: `${name}-irp-executive-report.pdf`, data: executiveReport },
    { name: `${name}-irp-detailed-findings.pdf`, data: detailedFindings }
  ]);
  return new Response(new Uint8Array(reportPackage), { headers: {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${name}-irp-report-package.zip"`,
    "cache-control": "private, no-store"
  } });
}
