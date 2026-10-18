-- Se quita el generador de canciones de «Aprende con Carlota»: se ha llevado al
-- repositorio de Prórroga Ilustrada, que es donde se hacen los vídeos. La tabla
-- solo servía para eso. Se deja la migración que la creó (ya aplicada en la base)
-- y esta la borra; IF EXISTS para poder ejecutarse dos veces (ver scripts/db-migrate.mjs).

-- DropTable
DROP TABLE IF EXISTS "Song";
