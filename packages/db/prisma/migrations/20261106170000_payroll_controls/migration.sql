-- Who prepared, approved and released each pay run, and a history of every salary change.
ALTER TABLE "PayrollRun" ADD COLUMN "createdById" UUID,
ADD COLUMN "submittedById" UUID,
ADD COLUMN "submittedAt" TIMESTAMP(3),
ADD COLUMN "approvedAt" TIMESTAMP(3),
ADD COLUMN "finalizedById" UUID;

CREATE TABLE "SalaryChange" (
    "id" UUID NOT NULL,
    "tenantId" UUID NOT NULL,
    "memberId" UUID NOT NULL,
    "changedById" UUID NOT NULL,
    "payGroupId" UUID NOT NULL,
    "basicEnc" BYTEA NOT NULL,
    "componentsEnc" BYTEA NOT NULL,
    "taxProfile" JSONB,
    "effectiveFrom" DATE NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SalaryChange_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SalaryChange_tenantId_memberId_createdAt_idx" ON "SalaryChange"("tenantId", "memberId", "createdAt");
ALTER TABLE "SalaryChange" ADD CONSTRAINT "SalaryChange_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
