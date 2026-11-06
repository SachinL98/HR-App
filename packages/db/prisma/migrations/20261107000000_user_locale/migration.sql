-- Each person can pick their language (English, Sinhala or Tamil).
ALTER TABLE "User" ADD COLUMN "locale" TEXT;
