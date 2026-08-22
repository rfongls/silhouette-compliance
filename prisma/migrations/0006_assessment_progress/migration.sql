ALTER TABLE "Assessment"
  ADD COLUMN "progressStage" TEXT,
  ADD COLUMN "progressMessage" TEXT,
  ADD COLUMN "progressCurrent" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "progressTotal" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "progressUpdatedAt" TIMESTAMP(3);
