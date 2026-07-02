-- CreateEnum
CREATE TYPE "Category" AS ENUM ('AFICION', 'VIAJES', 'MODA');

-- CreateEnum
CREATE TYPE "ArticleStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED', 'PUBLISHED');

-- CreateTable
CREATE TABLE "Source" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "feedUrl" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Source_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Article" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "category" "Category" NOT NULL,
    "guid" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "originalTitle" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "excerpt" TEXT NOT NULL,
    "tweetText" TEXT NOT NULL,
    "imageUrl" TEXT,
    "tags" TEXT NOT NULL,
    "status" "ArticleStatus" NOT NULL DEFAULT 'PENDING',
    "shopifyArticleId" TEXT,
    "shopifyHandle" TEXT,
    "tweetId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Article_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Source_feedUrl_key" ON "Source"("feedUrl");

-- CreateIndex
CREATE UNIQUE INDEX "Article_guid_key" ON "Article"("guid");

-- CreateIndex
CREATE INDEX "Article_status_idx" ON "Article"("status");

-- AddForeignKey
ALTER TABLE "Article" ADD CONSTRAINT "Article_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
