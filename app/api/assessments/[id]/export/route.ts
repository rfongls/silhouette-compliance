import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildGapExecutivePdf, buildGapFindingsPdf, buildGapPptx } from "@/lib/exports/documents";
import { buildPdfPackage } from "@/lib/exports/pdf-package";
import { prisma } from "@/lib/prisma";
import { slugify } from "@/lib/sanitize";
import { canAccessReportProfile, parseReportProfile } from "@/lib/report-profile";

export const runtime = "nodejs";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const url = new URL(req.url);
  const format = url.searchParams.get("format") || "report";
  const profile = parseReportProfile(url.searchParams.get("profile"));
  if (!profile) return NextResponse.json({ error: "Unsupported report profile" }, { status: 400 });
  if (!canAccessReportProfile(profile, guard.session.user.role)) return NextResponse.json({ error: "Administrator access is required for internal reports" }, { status: 403 });
  const a = await prisma.assessment.findFirst({ where: { id: params.id, accountId: guard.session.user.accountId } });
  if (!a?.result) return NextResponse.json({ error: "Assessment not found" }, { status: 404 });
  if (!new Set(["report", "deck"]).has(format)) return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  const result: any = {
    ...(a.result as Record<string, unknown>),
    prepared_by: (a.result as Record<string, unknown>).prepared_by || a.preparedBy || "Silhouette LLC"
  };
  const name = slugify(String(result?.organization_name || "organization"));
  if (format === "deck") {
    const deck = await buildGapPptx(result, { profile });
    return new Response(new Uint8Array(deck), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}-irp-gap-analysis${profile === "internal" ? "-internal-qa" : ""}.pptx"`,
      "cache-control": "private, no-store"
    } });
  }
  const [executiveReport, detailedFindings] = await Promise.all([
    buildGapExecutivePdf(result, { profile }),
    buildGapFindingsPdf(result, { profile })
  ]);
  const reportPackage = await buildPdfPackage([
    { name: `${name}-irp-executive-report${profile === "internal" ? "-internal-qa" : ""}.pdf`, data: executiveReport },
    { name: `${name}-irp-${profile === "internal" ? "internal-control-matrix" : "customer-findings"}.pdf`, data: detailedFindings }
  ]);
  return new Response(new Uint8Array(reportPackage), { headers: {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${name}-irp-${profile === "internal" ? "internal-qa" : "customer"}-report-package.zip"`,
    "cache-control": "private, no-store"
  } });
}
