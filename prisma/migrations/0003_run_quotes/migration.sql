CREATE TABLE "RunQuote" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "module" TEXT NOT NULL,
  "kind" "EntKind" NOT NULL,
  "orgNames" JSONB,
  "orgCount" INTEGER NOT NULL DEFAULT 1,
  "documentCount" INTEGER NOT NULL DEFAULT 0,
  "charCount" INTEGER NOT NULL DEFAULT 0,
  "estimatedInputTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedOutputTokens" INTEGER NOT NULL DEFAULT 0,
  "estimatedModelCostCents" INTEGER NOT NULL DEFAULT 0,
  "customerAmountCents" INTEGER NOT NULL DEFAULT 0,
  "marginCents" INTEGER NOT NULL DEFAULT 0,
  "withinGuard" BOOLEAN NOT NULL DEFAULT true,
  "status" TEXT NOT NULL DEFAULT 'QUOTED',
  "stripeRef" TEXT,
  "acceptedAt" TIMESTAMP(3),
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "RunQuote_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "RunQuote_accountId_module_status_idx" ON "RunQuote"("accountId", "module", "status");
CREATE INDEX "RunQuote_stripeRef_idx" ON "RunQuote"("stripeRef");

ALTER TABLE "UsageLedger" ADD COLUMN "quoteId" TEXT;
CREATE INDEX "UsageLedger_quoteId_idx" ON "UsageLedger"("quoteId");
