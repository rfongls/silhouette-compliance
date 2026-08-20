CREATE TABLE "ControlExtractionCheckpoint" (
  "id" TEXT NOT NULL,
  "runId" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "standardKey" TEXT NOT NULL,
  "sourceHash" TEXT NOT NULL,
  "batchKey" TEXT NOT NULL,
  "controls" JSONB NOT NULL,
  "controlCount" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "ControlExtractionCheckpoint_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ControlExtractionCheckpoint_runId_standardKey_batchKey_key"
  ON "ControlExtractionCheckpoint"("runId", "standardKey", "batchKey");

CREATE INDEX "ControlExtractionCheckpoint_industry_standardKey_sourceHash_idx"
  ON "ControlExtractionCheckpoint"("industry", "standardKey", "sourceHash");
