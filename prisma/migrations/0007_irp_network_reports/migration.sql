ALTER TABLE "RunQuote"
ADD COLUMN "assessmentScope" TEXT NOT NULL DEFAULT 'self',
ADD COLUMN "parentOrgName" TEXT,
ADD COLUMN "networkResult" JSONB,
ADD COLUMN "networkGeneratedAt" TIMESTAMP(3);
