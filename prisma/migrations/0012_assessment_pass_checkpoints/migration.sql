CREATE TABLE "AssessmentPassCheckpoint" (
  "id" TEXT NOT NULL,
  "assessmentId" TEXT NOT NULL,
  "passKey" TEXT NOT NULL,
  "controlBatch" INTEGER NOT NULL,
  "evidenceChunk" INTEGER NOT NULL,
  "evaluations" JSONB NOT NULL,
  "inputTokens" INTEGER NOT NULL DEFAULT 0,
  "outputTokens" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "AssessmentPassCheckpoint_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "AssessmentPassCheckpoint_assessmentId_fkey"
    FOREIGN KEY ("assessmentId") REFERENCES "Assessment"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "AssessmentPassCheckpoint_assessmentId_passKey_key"
  ON "AssessmentPassCheckpoint"("assessmentId", "passKey");

CREATE INDEX "AssessmentPassCheckpoint_assessmentId_createdAt_idx"
  ON "AssessmentPassCheckpoint"("assessmentId", "createdAt");
