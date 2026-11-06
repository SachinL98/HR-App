-- Approval cover while away, and subscribable calendar feeds.
CREATE TABLE "Delegation" (
    "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "fromId" UUID NOT NULL, "toId" UUID NOT NULL,
    "startsOn" DATE NOT NULL, "endsOn" DATE NOT NULL, "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Delegation_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Delegation_tenantId_toId_endsOn_idx" ON "Delegation"("tenantId", "toId", "endsOn");

CREATE TABLE "CalendarFeed" (
    "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "memberId" UUID NOT NULL, "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarFeed_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "CalendarFeed_memberId_key" ON "CalendarFeed"("memberId");
CREATE UNIQUE INDEX "CalendarFeed_tokenHash_key" ON "CalendarFeed"("tokenHash");
