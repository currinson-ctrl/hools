-- AlterTable
ALTER TABLE "Article" ADD COLUMN     "tweetedText" TEXT;

-- Los articulos ya publicados antes de esta columna se tuitearon con el
-- tweetText que tienen guardado, asi que se marcan como sincronizados para no
-- avisar de un desfase que no existe.
UPDATE "Article" SET "tweetedText" = "tweetText" WHERE "tweetId" IS NOT NULL;
