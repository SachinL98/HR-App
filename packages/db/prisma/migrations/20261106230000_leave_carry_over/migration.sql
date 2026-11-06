-- Leave carry-over and monthly accrual, set per leave type.
ALTER TABLE "LeaveType" ADD COLUMN "carryOverMax" DECIMAL(4,1) NOT NULL DEFAULT 0,
ADD COLUMN "carryOverExpiryMonths" INTEGER,
ADD COLUMN "accrual" TEXT NOT NULL DEFAULT 'upfront';
