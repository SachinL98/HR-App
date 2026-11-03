-- AlterTable
ALTER TABLE "Tenant" ADD COLUMN     "themeAccent" TEXT NOT NULL DEFAULT '#14B8A6',
ADD COLUMN     "themeMode" TEXT NOT NULL DEFAULT 'system',
ADD COLUMN     "themePrimary" TEXT NOT NULL DEFAULT '#3B3FD8',
ADD COLUMN     "themeRadius" TEXT NOT NULL DEFAULT 'md';
