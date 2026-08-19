-- CreateTable
CREATE TABLE "SkippedItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "guid" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "originalTitle" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkippedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkippedItem_guid_key" ON "SkippedItem"("guid");

-- CreateIndex
CREATE INDEX "SkippedItem_createdAt_idx" ON "SkippedItem"("createdAt");

-- AddForeignKey
ALTER TABLE "SkippedItem" ADD CONSTRAINT "SkippedItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
