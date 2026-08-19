ALTER TABLE "ControlBoard"
  ADD COLUMN "sourceTitle" TEXT,
  ADD COLUMN "sourceVersion" TEXT,
  ADD COLUMN "sourceUrls" JSONB,
  ADD COLUMN "sourceHash" TEXT,
  ADD COLUMN "retrievedAt" TIMESTAMP(3),
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "reviewNotes" TEXT;

ALTER TABLE "Assessment"
  ADD COLUMN "boardSnapshot" JSONB,
  ADD COLUMN "modelProvider" TEXT,
  ADD COLUMN "modelName" TEXT,
  ADD COLUMN "promptVersion" TEXT,
  ADD COLUMN "documentCount" INTEGER,
  ADD COLUMN "sourceCharCount" INTEGER,
  ADD COLUMN "documentHashes" JSONB,
  ADD COLUMN "sourceSetHash" TEXT,
  ADD COLUMN "phiAttested" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "phiAttestedAt" TIMESTAMP(3),
  ADD COLUMN "dataHandlingFlags" JSONB,
  ADD COLUMN "reviewStatus" TEXT NOT NULL DEFAULT 'AI_DRAFT',
  ADD COLUMN "reviewedBy" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3);

CREATE INDEX "Assessment_accountId_orgId_sourceSetHash_status_idx"
  ON "Assessment"("accountId", "orgId", "sourceSetHash", "status");

ALTER TABLE "RunQuote" ADD COLUMN "sourceDigest" TEXT;
