import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { buildNetworkGapDeck, buildNetworkGapJson, buildNetworkGapReport } from "@/lib/exports/gap";
import { prisma } from "@/lib/prisma";
import { buildPortableIrpReport } from "@/lib/report-import";
import { slugify } from "@/lib/sanitize";

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const format = new URL(req.url).searchParams.get("format") || "report";
  const quote = await prisma.runQuote.findFirst({
    where: { id: params.id, accountId: guard.session.user.accountId, module: "irp", reportDeletedAt: null },
    select: { assessmentScope: true, parentOrgName: true, reportAssessmentIds: true, networkResult: true }
  });
  if (!quote) return NextResponse.json({ error: "Report not found" }, { status: 404 });
  if (format === "package") {
    const assessmentIds = Array.isArray(quote.reportAssessmentIds) ? quote.reportAssessmentIds.map(String) : [];
    const rows = assessmentIds.length ? await prisma.assessment.findMany({
      where: { id: { in: assessmentIds }, accountId: guard.session.user.accountId, status: "DELIVERED" },
      select: { id: true, orgName: true, result: true }
    }) : [];
    const byId = new Map(rows.map((row) => [row.id, row]));
    const assessments = assessmentIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row?.result)).map((row) => ({
      orgName: row.orgName || "Organization",
      result: row.result as Record<string, unknown>
    }));
    if (!assessments.length && !quote.networkResult) return NextResponse.json({ error: "Report not found" }, { status: 404 });
    const reportPackage = buildPortableIrpReport({
      scope: quote.assessmentScope === "network" ? "network" : "self",
      parentOrgName: quote.parentOrgName,
      assessments,
      networkReport: quote.networkResult as Record<string, unknown> | null
    });
    const filename = `${slugify(quote.parentOrgName || assessments[0]?.orgName || "silhouette-irp")}-report-package.json`;
    return new NextResponse(JSON.stringify(reportPackage, null, 2), { headers: {
      "content-type": "application/json",
      "content-disposition": `attachment; filename="${filename}"`
    } });
  }
  if (!quote.networkResult || quote.assessmentScope !== "network") return NextResponse.json({ error: "Network report not found" }, { status: 404 });
  if (format === "json") return new NextResponse(buildNetworkGapJson(quote.networkResult), { headers: { "content-type": "application/json" } });
  if (format === "deck") return new NextResponse(buildNetworkGapDeck(quote.networkResult), { headers: { "content-type": "text/html; charset=utf-8" } });
  return new NextResponse(buildNetworkGapReport(quote.networkResult), { headers: { "content-type": "text/html; charset=utf-8" } });
}
