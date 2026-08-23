ALTER TABLE "RunQuote"
  ADD COLUMN "creditsApplied" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "creditsToPurchase" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "reportRecipient" TEXT,
  ADD COLUMN "reportAssessmentIds" JSONB,
  ADD COLUMN "reportEmailStatus" TEXT NOT NULL DEFAULT 'PENDING',
  ADD COLUMN "reportEmailId" TEXT,
  ADD COLUMN "reportEmailSentAt" TIMESTAMP(3),
  ADD COLUMN "reportEmailError" TEXT;
