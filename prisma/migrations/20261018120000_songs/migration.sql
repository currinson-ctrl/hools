-- Canciones de «Aprende con Carlota». Escrita para poder ejecutarse dos veces
-- sin romperse (ver scripts/db-migrate.mjs).

-- CreateTable
CREATE TABLE IF NOT EXISTS "Song" (
    "id" TEXT NOT NULL,
    "topic" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "sections" JSONB NOT NULL,
    "styles" TEXT NOT NULL,
    "youtubeTitle" TEXT NOT NULL,
    "youtubeDescription" TEXT NOT NULL,
    "audio" BYTEA,
    "hasAudio" BOOLEAN NOT NULL DEFAULT false,
    "audioError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Song_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "Song_createdAt_idx" ON "Song"("createdAt");
