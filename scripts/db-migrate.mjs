/*
 * Aplica las migraciones (`prisma migrate deploy`) reintentando mientras la
 * base no responda.
 *
 * Neon apaga la base del plan gratuito cuando lleva unos minutos sin nadie
 * conectado, y tarda unos segundos en volver a arrancar cuando alguien llama.
 * Prisma se rinde a los 5 segundos, asi que un despliegue que pilla la base
 * dormida muere con P1001 antes de compilar nada, aunque no haya ni un fallo
 * en el codigo. Pasa sobre todo aqui porque el cron rastrea cada 3 horas: casi
 * cualquier despliegue cae en medio de una siesta.
 *
 * Solo se reintenta P1001 ("no se llega al servidor"). Una migracion que falla
 * de verdad, o unas credenciales mal, revientan a la primera — que es justo lo
 * que se quiere: esperar cuatro veces a un error que no se va a arreglar solo
 * unicamente alarga el build.
 */

import { spawnSync } from "node:child_process";

const ESPERAS_MS = [2000, 4000, 8000, 16000];

for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
  const res = spawnSync("npx", ["prisma", "migrate", "deploy"], {
    encoding: "utf8",
  });

  process.stdout.write(res.stdout ?? "");
  process.stderr.write(res.stderr ?? "");

  if (res.error) {
    console.error(`No se ha podido ejecutar prisma: ${res.error.message}`);
    process.exit(1);
  }

  if (res.status === 0) {
    process.exit(0);
  }

  const inalcanzable = `${res.stdout ?? ""}${res.stderr ?? ""}`.includes("P1001");
  const ultimo = intento === ESPERAS_MS.length;

  if (!inalcanzable || ultimo) {
    process.exit(res.status ?? 1);
  }

  const espera = ESPERAS_MS[intento];
  console.log(
    `\nLa base no responde todavia (P1001), probablemente arrancando. ` +
      `Reintento ${intento + 2}/${ESPERAS_MS.length + 1} en ${espera / 1000}s...\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, espera));
}
