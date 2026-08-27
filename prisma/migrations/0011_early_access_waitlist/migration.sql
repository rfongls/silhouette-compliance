CREATE TABLE "early_access_interests" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "name" TEXT,
    "provider" TEXT NOT NULL,
    "providerAccountId" TEXT NOT NULL,
    "providerUsername" TEXT,
    "status" TEXT NOT NULL DEFAULT 'seen',
    "notifyRequested" BOOLEAN NOT NULL DEFAULT false,
    "notifyRequestedAt" TIMESTAMP(3),
    "firstSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "early_access_interests_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "early_access_interests_provider_providerAccountId_key"
ON "early_access_interests"("provider", "providerAccountId");

CREATE INDEX "early_access_interests_email_idx"
ON "early_access_interests"("email");

CREATE INDEX "early_access_interests_status_lastSeenAt_idx"
ON "early_access_interests"("status", "lastSeenAt");
