ALTER TABLE "Assessment"
ADD COLUMN "recoveryDismissedAt" TIMESTAMP(3);

CREATE INDEX "Assessment_accountId_status_recoveryDismissedAt_idx"
ON "Assessment"("accountId", "status", "recoveryDismissedAt");
