import { redirect, notFound } from "next/navigation";
import { auth } from "@/auth";
import { IrpReportBundle } from "@/components/IrpReportBundle";
import { Nav } from "@/components/Nav";
import { prisma } from "@/lib/prisma";
import { isAdminSession } from "@/lib/view-role";

export default async function IrpReportsPage({ params }: { params: { quoteId: string } }) {
  const session = await auth();
  if (!session?.user?.accountId) redirect("/signin");
  const isAdmin = isAdminSession(session);
  const quote = await prisma.runQuote.findFirst({ where: { id: params.quoteId, accountId: session.user.accountId, module: "irp", reportDeletedAt: null } });
  if (!quote) notFound();
  const assessmentIds = Array.isArray(quote.reportAssessmentIds) ? quote.reportAssessmentIds.map(String) : [];
  const rows = assessmentIds.length ? await prisma.assessment.findMany({
    where: { id: { in: assessmentIds }, accountId: session.user.accountId, status: "DELIVERED" },
    select: { id: true, orgName: true, result: true }
  }) : [];
  const byId = new Map(rows.map((row) => [row.id, row]));
  const assessments = assessmentIds.map((id) => byId.get(id)).filter((row): row is NonNullable<typeof row> => Boolean(row?.result)).map((row) => ({ assessmentId: row.id, orgName: row.orgName || "Organization", result: row.result }));
  if (!assessments.length && !quote.networkResult) notFound();

  return <main><Nav/><section className="wrap">
    <div className="mono">Assessment history</div>
    <h1 style={{ fontFamily: "EB Garamond", fontSize: 44, margin: "8px 0 22px" }}>{quote.parentOrgName || assessments[0]?.orgName || "IRP"} reports</h1>
    <IrpReportBundle assessments={assessments} networkReport={quote.networkResult} quoteId={quote.id} demo={false} isAdmin={isAdmin} historyView/>
  </section></main>;
}
