import { Prisma } from "@prisma/client";

export async function deleteStoredReportPackage(
  tx: Prisma.TransactionClient,
  quoteId: string,
  accountId: string
) {
  const quote = await tx.runQuote.findFirst({
    where: {
      id: quoteId,
      accountId,
      module: "irp",
      status: "CONSUMED",
      reportDeletedAt: null
    },
    select: { id: true, reportAssessmentIds: true }
  });
  if (!quote) return false;

  const assessmentIds = Array.isArray(quote.reportAssessmentIds)
    ? quote.reportAssessmentIds.map(String)
    : [];

  const updated = await tx.runQuote.updateMany({
    where: {
      id: quote.id,
      accountId,
      module: "irp",
      status: "CONSUMED",
      reportDeletedAt: null
    },
    data: {
      reportAssessmentIds: [],
      networkResult: Prisma.DbNull,
      networkGeneratedAt: null,
      reportRecipient: null,
      reportEmailStatus: "DELETED",
      reportEmailId: null,
      reportEmailSentAt: null,
      reportEmailError: null,
      reportDeletedAt: new Date()
    }
  });
  if (updated.count !== 1) return false;

  for (const assessmentId of assessmentIds) {
    const remainingReferences = await tx.runQuote.count({
      where: {
        accountId,
        module: "irp",
        reportDeletedAt: null,
        id: { not: quote.id },
        reportAssessmentIds: { array_contains: [assessmentId] }
      }
    });
    if (remainingReferences === 0) {
      await tx.assessment.deleteMany({ where: { id: assessmentId, accountId } });
    }
  }

  return true;
}
