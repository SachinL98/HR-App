-- Two-factor sign-in, password changes and emailed one-time links.
ALTER TABLE "User" ADD COLUMN "mfaSecretEnc" BYTEA,
ADD COLUMN "mfaRecoveryHashes" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN "mfaLastStep" INTEGER,
ADD COLUMN "passwordChangedAt" TIMESTAMP(3);

CREATE TABLE "UserToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "kind" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "UserToken_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "UserToken_tokenHash_key" ON "UserToken"("tokenHash");
CREATE INDEX "UserToken_userId_kind_idx" ON "UserToken"("userId", "kind");
ALTER TABLE "UserToken" ADD CONSTRAINT "UserToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
