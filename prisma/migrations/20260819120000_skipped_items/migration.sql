-- Tabla de items descartados por el filtro de tema.
--
-- Va escrita a la defensiva (IF NOT EXISTS y demas) porque puede encontrarse
-- la tabla ya creada: una rama anterior que atacaba este mismo problema
-- (claude/news-panel-search-issue-yshuz9, migracion 20260814100000) llego a
-- aplicar en la base compartida una version reducida de SkippedItem, con solo
-- id/guid/sourceId/createdAt. Esa rama nunca se fusiono, asi que la migracion
-- no esta en el repo, pero la tabla si esta en la base. Un CREATE TABLE seco
-- reventaba ahi con 42P07 ("relation already exists") y dejaba la migracion
-- marcada como fallida, bloqueando todos los despliegues siguientes.
--
-- Asi que esto sirve para los dos estados posibles de la base: crear la tabla
-- entera si no existe, o completar la reducida si ya estaba.

-- CreateTable
CREATE TABLE IF NOT EXISTS "SkippedItem" (
    "id" TEXT NOT NULL,
    "sourceId" TEXT,
    "guid" TEXT NOT NULL,
    "originalUrl" TEXT NOT NULL,
    "originalTitle" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SkippedItem_pkey" PRIMARY KEY ("id")
);

-- Columnas que le faltan a la version reducida. Se anaden opcionales, se
-- rellenan y solo entonces se ponen obligatorias, que es la unica forma de
-- anadir una columna NOT NULL a una tabla que ya tiene filas.
ALTER TABLE "SkippedItem" ADD COLUMN IF NOT EXISTS "originalUrl" TEXT;
ALTER TABLE "SkippedItem" ADD COLUMN IF NOT EXISTS "originalTitle" TEXT;
ALTER TABLE "SkippedItem" ADD COLUMN IF NOT EXISTS "reason" TEXT;

-- Las filas heredadas solo guardaban el guid (servian de marca de "ya visto"),
-- asi que no hay titular ni enlace que recuperar: se dejan identificadas.
UPDATE "SkippedItem"
SET "originalTitle" = COALESCE(NULLIF("originalTitle", ''), '(descartada por una version anterior)'),
    "originalUrl" = COALESCE("originalUrl", ''),
    "reason" = COALESCE(NULLIF("reason", ''), 'OFF_TOPIC')
WHERE "originalTitle" IS NULL OR "originalUrl" IS NULL OR "reason" IS NULL;

ALTER TABLE "SkippedItem" ALTER COLUMN "originalUrl" SET NOT NULL;
ALTER TABLE "SkippedItem" ALTER COLUMN "originalTitle" SET NOT NULL;
ALTER TABLE "SkippedItem" ALTER COLUMN "reason" SET NOT NULL;

-- En la version reducida sourceId era obligatorio y borraba en cascada. Aqui
-- es opcional y se pone a NULL: perder la fuente no debe borrar el registro de
-- lo que ya se habia mirado.
ALTER TABLE "SkippedItem" ALTER COLUMN "sourceId" DROP NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "SkippedItem_guid_key" ON "SkippedItem"("guid");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "SkippedItem_createdAt_idx" ON "SkippedItem"("createdAt");

-- AddForeignKey
ALTER TABLE "SkippedItem" DROP CONSTRAINT IF EXISTS "SkippedItem_sourceId_fkey";
ALTER TABLE "SkippedItem" ADD CONSTRAINT "SkippedItem_sourceId_fkey" FOREIGN KEY ("sourceId") REFERENCES "Source"("id") ON DELETE SET NULL ON UPDATE CASCADE;
