-- CreateEnum
CREATE TYPE "BoardStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'ARCHIVED');
CREATE TYPE "AssessStatus" AS ENUM ('PENDING', 'RUNNING', 'DELIVERED', 'FAILED', 'REFUNDED');
CREATE TYPE "EntKind" AS ENUM ('ASSESSMENT_CREDIT', 'SRA_CREDIT', 'PROPOSAL_CREDIT');
CREATE TYPE "EntStatus" AS ENUM ('ACTIVE', 'EXPIRED', 'CANCELED');
CREATE TYPE "SraStage" AS ENUM ('SCOPE', 'INVENTORY', 'EVIDENCE', 'FINDINGS', 'ROADMAP', 'REPORT');
CREATE TYPE "SraStatus" AS ENUM ('ACTIVE', 'DELIVERED', 'ARCHIVED');

CREATE TABLE "User" (
  "id" TEXT NOT NULL,
  "name" TEXT,
  "email" TEXT,
  "emailVerified" TIMESTAMP(3),
  "image" TEXT,
  "role" TEXT NOT NULL DEFAULT 'customer',
  "accountId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Account" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "type" TEXT NOT NULL,
  "provider" TEXT NOT NULL,
  "providerAccountId" TEXT NOT NULL,
  "refresh_token" TEXT,
  "access_token" TEXT,
  "expires_at" INTEGER,
  "token_type" TEXT,
  "scope" TEXT,
  "id_token" TEXT,
  "session_state" TEXT,
  CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
  "id" TEXT NOT NULL,
  "sessionToken" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "VerificationToken" (
  "identifier" TEXT NOT NULL,
  "token" TEXT NOT NULL,
  "expires" TIMESTAMP(3) NOT NULL
);

CREATE TABLE "ControlBoard" (
  "id" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "standardKey" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" "BoardStatus" NOT NULL,
  "controls" JSONB NOT NULL,
  "controlCount" INTEGER NOT NULL,
  "publishedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ControlBoard_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UsageLedger" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "assessmentId" TEXT,
  "orgsBilled" INTEGER,
  "amountCents" INTEGER,
  "inputTokens" INTEGER,
  "outputTokens" INTEGER,
  "stripeRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "UsageLedger_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Assessment" (
  "id" TEXT NOT NULL,
  "orgId" TEXT NOT NULL,
  "orgName" TEXT,
  "accountId" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "status" "AssessStatus" NOT NULL,
  "score" INTEGER,
  "posture" TEXT,
  "result" JSONB,
  "boardCite" TEXT,
  "refineUsed" BOOLEAN NOT NULL DEFAULT false,
  "ledgerId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Assessment_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Entitlement" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "kind" "EntKind" NOT NULL,
  "status" "EntStatus" NOT NULL DEFAULT 'ACTIVE',
  "balance" INTEGER,
  "renewsAt" TIMESTAMP(3),
  "stripeRef" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "Entitlement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SraEngagement" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "orgName" TEXT NOT NULL,
  "industry" TEXT NOT NULL,
  "stage" "SraStage" NOT NULL DEFAULT 'SCOPE',
  "status" "SraStatus" NOT NULL DEFAULT 'ACTIVE',
  "scope" JSONB,
  "inventory" JSONB,
  "findings" JSONB,
  "roadmap" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "SraEngagement_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SraEvidence" (
  "id" TEXT NOT NULL,
  "engagementId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "filename" TEXT,
  "parsed" JSONB,
  "storageKey" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SraEvidence_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "Account_provider_providerAccountId_key" ON "Account"("provider", "providerAccountId");
CREATE UNIQUE INDEX "Session_sessionToken_key" ON "Session"("sessionToken");
CREATE UNIQUE INDEX "VerificationToken_token_key" ON "VerificationToken"("token");
CREATE UNIQUE INDEX "VerificationToken_identifier_token_key" ON "VerificationToken"("identifier", "token");
CREATE INDEX "ControlBoard_industry_standardKey_status_idx" ON "ControlBoard"("industry", "standardKey", "status");
CREATE UNIQUE INDEX "UsageLedger_assessmentId_key" ON "UsageLedger"("assessmentId");
CREATE INDEX "UsageLedger_accountId_kind_status_idx" ON "UsageLedger"("accountId", "kind", "status");
CREATE INDEX "UsageLedger_stripeRef_idx" ON "UsageLedger"("stripeRef");
CREATE UNIQUE INDEX "Assessment_ledgerId_key" ON "Assessment"("ledgerId");
CREATE INDEX "Assessment_accountId_createdAt_idx" ON "Assessment"("accountId", "createdAt");
CREATE INDEX "Assessment_accountId_status_idx" ON "Assessment"("accountId", "status");
CREATE INDEX "Entitlement_accountId_kind_idx" ON "Entitlement"("accountId", "kind");
CREATE INDEX "SraEngagement_accountId_status_idx" ON "SraEngagement"("accountId", "status");
CREATE INDEX "SraEvidence_engagementId_idx" ON "SraEvidence"("engagementId");
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Assessment" ADD CONSTRAINT "Assessment_ledgerId_fkey" FOREIGN KEY ("ledgerId") REFERENCES "UsageLedger"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "SraEvidence" ADD CONSTRAINT "SraEvidence_engagementId_fkey" FOREIGN KEY ("engagementId") REFERENCES "SraEngagement"("id") ON DELETE CASCADE ON UPDATE CASCADE;
