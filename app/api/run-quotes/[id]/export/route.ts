import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildNetworkFindingsPdf, buildNetworkGapPdf, buildNetworkGapPptx } from "@/lib/exports/documents";
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
  const quote = await prisma.runQuote.findFirst({
    where: { id: params.id, accountId: guard.session.user.accountId, module: "irp", reportDeletedAt: null },
    select: { assessmentScope: true, parentOrgName: true, preparedBy: true, reportAssessmentIds: true, networkResult: true }
  });
  if (!quote) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (!new Set(["report", "deck"]).has(format)) return NextResponse.json({ error: "Unsupported export format" }, { status: 400 });
  if (!quote.networkResult || quote.assessmentScope !== "network") return NextResponse.json({ error: "Network report not found" }, { status: 404 });
  const networkResult = {
    ...(quote.networkResult as Record<string, unknown>),
    prepared_by: (quote.networkResult as Record<string, unknown>).prepared_by || quote.preparedBy || "Silhouette LLC"
  };
  const name = slugify(String(quote.parentOrgName || "network"));
  if (format === "deck") {
    const deck = await buildNetworkGapPptx(networkResult, { profile });
    return new Response(new Uint8Array(deck), { headers: {
      "content-type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      "content-disposition": `attachment; filename="${name}-network-irp-gap-analysis${profile === "internal" ? "-internal-qa" : ""}.pptx"`,
      "cache-control": "private, no-store"
    } });
  }
  const assessmentIds = Array.isArray(quote.reportAssessmentIds) ? quote.reportAssessmentIds.map(String) : [];
  const storedAssessments = assessmentIds.length ? await prisma.assessment.findMany({
    where: { id: { in: assessmentIds }, accountId: guard.session.user.accountId },
    select: { id: true, orgName: true, result: true }
  }) : [];
  const assessmentsById = new Map(storedAssessments.map((assessment) => [assessment.id, assessment]));
  const assessments = assessmentIds
    .map((id) => assessmentsById.get(id))
    .filter((assessment): assessment is NonNullable<typeof assessment> => Boolean(assessment?.result))
    .map((assessment) => ({ orgName: assessment.orgName || "Organization", result: assessment.result }));
  if (assessments.length !== assessmentIds.length || !assessments.length) {
    return NextResponse.json({ error: "One or more organization reports are unavailable for the detailed findings package" }, { status: 409 });
  }
  const [executiveReport, detailedFindings] = await Promise.all([
    buildNetworkGapPdf(networkResult, { profile }),
    buildNetworkFindingsPdf(networkResult, assessments, { profile })
  ]);
  const reportPackage = await buildPdfPackage([
    { name: `${name}-network-irp-executive-report${profile === "internal" ? "-internal-qa" : ""}.pdf`, data: executiveReport },
    { name: `${name}-network-irp-${profile === "internal" ? "internal-control-matrix" : "customer-findings"}.pdf`, data: detailedFindings }
  ]);
  return new Response(new Uint8Array(reportPackage), { headers: {
    "content-type": "application/zip",
    "content-disposition": `attachment; filename="${name}-network-irp-${profile === "internal" ? "internal-qa" : "customer"}-report-package.zip"`,
    "cache-control": "private, no-store"
  } });
}
