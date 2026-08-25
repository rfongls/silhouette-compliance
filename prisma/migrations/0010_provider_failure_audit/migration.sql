ALTER TABLE "Assessment"
  ADD COLUMN "failureProvider" TEXT,
  ADD COLUMN "failureModel" TEXT,
  ADD COLUMN "failureHttpStatus" INTEGER,
  ADD COLUMN "failureCode" TEXT,
  ADD COLUMN "failureRequestId" TEXT,
  ADD COLUMN "failureRetriable" BOOLEAN,
  ADD COLUMN "failureAttempts" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "failureStage" TEXT,
  ADD COLUMN "failedAt" TIMESTAMP(3);

ALTER TABLE "RunQuote"
  ADD COLUMN "preflight" JSONB,
  ADD COLUMN "preflightAt" TIMESTAMP(3);
