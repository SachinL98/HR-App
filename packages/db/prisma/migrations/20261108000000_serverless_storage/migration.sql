-- Files kept in the database (for hosts without a writable disk) and shared sign-in lockout counters.
CREATE TABLE "FileBlob" (
  "fileId" UUID NOT NULL,
  "tenantId" UUID NOT NULL,
  "data" BYTEA NOT NULL,
  CONSTRAINT "FileBlob_pkey" PRIMARY KEY ("fileId")
);
ALTER TABLE "FileBlob" ADD CONSTRAINT "FileBlob_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "File"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "LoginThrottle" (
  "key" TEXT NOT NULL,
  "fails" INTEGER NOT NULL DEFAULT 0,
  "round" INTEGER NOT NULL DEFAULT 0,
  "lockedUntil" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "LoginThrottle_pkey" PRIMARY KEY ("key")
);
