-- CreateEnum
CREATE TYPE "SourceType" AS ENUM ('RSS', 'X_ACCOUNT');

-- AlterTable
ALTER TABLE "Source" ADD COLUMN     "type" "SourceType" NOT NULL DEFAULT 'RSS',
ADD COLUMN     "externalId" TEXT,
ADD COLUMN     "lastFetchedId" TEXT;
