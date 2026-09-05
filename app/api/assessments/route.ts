import { NextResponse } from "next/server";
import { requireSession } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import { assessmentFailureReason, assessmentFailureSupport } from "@/lib/assessment-failure";

export async function GET(req: Request) {
  const guard = await requireSession("customer");
  if ("response" in guard) return guard.response;
  const params = new URL(req.url).searchParams;
  const quoteId = params.get("quoteId")?.trim();
  const runningOnly = params.get("status") === "RUNNING";
  const recoverableOnly = params.get("status") === "RECOVERABLE";
  const assessments = await prisma.assessment.findMany({
    where: {
      accountId: guard.session.user.accountId,
      ...(runningOnly ? { status: "RUNNING" as const, updatedAt: { gte: new Date(Date.now() - 6 * 60 * 60 * 1000) } } : {}),
      ...(recoverableOnly ? { status: { in: ["FAILED" as const, "REFUNDED" as const] }, recoveryDismissedAt: null, updatedAt: { gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } } : {}),
      ...(quoteId ? { ledger: { is: { quoteId } } } : {})
    },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: {
      id: true,
      orgId: true,
      orgName: true,
      preparedBy: true,
      industry: true,
      createdAt: true,
      updatedAt: true,
      score: true,
      posture: true,
      status: true,
      boardCite: true,
      boardSnapshot: true,
      refineUsed: true,
      progressStage: true,
      progressMessage: true,
      progressCurrent: true,
      progressTotal: true,
      progressUpdatedAt: true,
      failureProvider: true,
      failureHttpStatus: true,
      failureCode: true,
      failureRequestId: true,
      failureRetriable: true,
      failureAttempts: true,
      failureStage: true,
      failedAt: true,
      recoveryDismissedAt: true,
      ...(quoteId ? { result: true } : {}),
      ledger: { select: { quoteId: true } },
      _count: { select: { checkpoints: true } }
    }
  });
  const quote = quoteId ? await prisma.runQuote.findFirst({
    where: { id: quoteId, accountId: guard.session.user.accountId },
    select: { id: true, assessmentScope: true, parentOrgName: true, preparedBy: true, networkResult: true, networkGeneratedAt: true }
  }) : null;
  return NextResponse.json({
    assessments: assessments.map(({ ledger, boardSnapshot, _count, ...assessment }) => ({
      ...assessment,
      quoteId: ledger?.quoteId || null,
      failureReason: assessment.failureCode ? assessmentFailureReason(assessment) : null,
      failureSupport: assessment.failureCode ? assessmentFailureSupport(assessment) : null,
      canResume: !assessment.recoveryDismissedAt && (assessment.status === "FAILED" || assessment.status === "REFUNDED"),
      checkpointCount: _count.checkpoints,
      resumeMode: _count.checkpoints ? "CONTINUE" : "RETRY",
      resumeStandards: Array.isArray(boardSnapshot)
        ? boardSnapshot.map((row) => row && typeof row === "object" && "standardKey" in row ? String(row.standardKey) : "").filter(Boolean)
        : []
    })),
    networkReport: quote?.networkResult && typeof quote.networkResult === "object"
      ? { ...(quote.networkResult as Record<string, unknown>), prepared_by: (quote.networkResult as Record<string, unknown>).prepared_by || quote.preparedBy || "Silhouette LLC" }
      : null,
    network: quote ? { quoteId: quote.id, assessmentScope: quote.assessmentScope, parentOrgName: quote.parentOrgName, preparedBy: quote.preparedBy, generatedAt: quote.networkGeneratedAt } : null
  });
}
