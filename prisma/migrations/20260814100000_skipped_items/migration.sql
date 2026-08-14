-- CreateTable
CREATE TABLE "SkippedItem" (
    "id" TEXT NOT NULL,
    "guid" TEXT NOT NULL,
    "sourceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkippedItem_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "SkippedItem_guid_key" ON "SkippedItem"("guid");

-- AddForeignKey
ALTER TABLE "SkippedItem" ADD CONSTRAINT "SkippedItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE CASCADE ON UPDATE CASCADE;
