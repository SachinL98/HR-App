-- Onboarding and offboarding checklists, and documents kept on a person's profile.
CREATE TABLE "ChecklistTemplate" (
    "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL,
    "items" JSONB NOT NULL, "archived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChecklistTemplate_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChecklistTemplate_tenantId_idx" ON "ChecklistTemplate"("tenantId");

CREATE TABLE "Checklist" (
    "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "memberId" UUID NOT NULL, "name" TEXT NOT NULL, "kind" TEXT NOT NULL,
    "startedById" UUID NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Checklist_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Checklist_tenantId_memberId_idx" ON "Checklist"("tenantId", "memberId");
ALTER TABLE "Checklist" ADD CONSTRAINT "Checklist_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ChecklistTask" (
    "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "checklistId" UUID NOT NULL, "title" TEXT NOT NULL, "who" TEXT NOT NULL,
    "assigneeId" UUID, "dueDate" DATE, "position" INTEGER NOT NULL, "doneAt" TIMESTAMP(3), "doneById" UUID,
    CONSTRAINT "ChecklistTask_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ChecklistTask_tenantId_assigneeId_doneAt_idx" ON "ChecklistTask"("tenantId", "assigneeId", "doneAt");
ALTER TABLE "ChecklistTask" ADD CONSTRAINT "ChecklistTask_checklistId_fkey" FOREIGN KEY ("checklistId") REFERENCES "Checklist"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "MemberDocument" (
    "id" UUID NOT NULL, "tenantId" UUID NOT NULL, "memberId" UUID NOT NULL, "title" TEXT NOT NULL, "kind" TEXT NOT NULL,
    "fileId" UUID NOT NULL, "visibleToMember" BOOLEAN NOT NULL DEFAULT true, "uploadedById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberDocument_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "MemberDocument_tenantId_memberId_idx" ON "MemberDocument"("tenantId", "memberId");
ALTER TABLE "MemberDocument" ADD CONSTRAINT "MemberDocument_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
