/*
 * Aplica las migraciones (`prisma migrate deploy`) con dos redes de seguridad:
 * la base dormida y una migracion que quedo marcada como fallida.
 *
 * 1. BASE DORMIDA (P1001). Neon apaga la base del plan gratuito cuando lleva
 *    unos minutos sin nadie conectado, y tarda unos segundos en volver a
 *    arrancar cuando alguien llama. Prisma se rinde a los 5 segundos, asi que
 *    un despliegue que pilla la base dormida muere con P1001 antes de compilar
 *    nada, aunque no haya ni un fallo en el codigo.
 *
 * 2. MIGRACION FALLIDA (P3009). Si una migracion peta a medias, Prisma la deja
 *    apuntada como fallida y a partir de ahi se niega a aplicar NADA MAS: todos
 *    los despliegues siguientes mueren igual, aunque el fallo original ya este
 *    corregido. Hay que decirle explicitamente que la de por revertida
 *    (`migrate resolve --rolled-back`) antes de volver a intentarlo.
 *
 *    Paso por aqui de verdad: una rama anterior aplico en la base compartida
 *    una version reducida de la tabla SkippedItem y nunca se fusiono, asi que
 *    la migracion que la crea de nuevo se encontro la tabla puesta, murio con
 *    42P07 y dejo la base bloqueada. Desde una cuenta de Vercel no hay forma
 *    comoda de correr el comando de recuperacion a mano, asi que lo hace este
 *    script y lo cuenta bien alto en el log.
 *
 *    Esto obliga a una regla al escribir migraciones: tienen que poder
 *    ejecutarse dos veces sin romperse (IF NOT EXISTS y similares), porque
 *    despues de recuperarse se reintentan enteras.
 *
 * Lo que NO se reintenta es un fallo de verdad (SQL invalido, credenciales
 * mal): revienta a la primera, que es justo lo que se quiere.
 */

import { spawnSync } from "node:child_process";

const ESPERAS_MS = [2000, 4000, 8000, 16000];

function prisma(args) {
  const res = spawnSync("npx", ["prisma", ...args], { encoding: "utf8" });
  process.stdout.write(res.stdout ?? "");
  process.stderr.write(res.stderr ?? "");
  if (res.error) {
    console.error(`No se ha podido ejecutar prisma: ${res.error.message}`);
    process.exit(1);
  }
  return { status: res.status ?? 1, salida: `${res.stdout ?? ""}${res.stderr ?? ""}` };
}

/** "The `20260819120000_skipped_items` migration started at ... failed" */
function migracionFallida(salida) {
  return salida.match(/The `([^`]+)` migration started at [^\n]*failed/)?.[1] ?? null;
}

// Solo se intenta recuperar una vez: si despues de darla por revertida vuelve
// a fallar, es un fallo real y tiene que verse.
let recuperada = false;

for (let intento = 0; intento <= ESPERAS_MS.length; intento++) {
  const { status, salida } = prisma(["migrate", "deploy"]);

  if (status === 0) {
    process.exit(0);
  }

  if (salida.includes("P3009") && !recuperada) {
    const nombre = migracionFallida(salida);
    if (nombre) {
      console.log(
        `\nLa migracion "${nombre}" quedo marcada como fallida en un despliegue ` +
          `anterior y esta bloqueando el resto. Se marca como revertida para ` +
          `volver a aplicarla desde cero...\n`
      );
      const resuelta = prisma(["migrate", "resolve", "--rolled-back", nombre]);
      if (resuelta.status === 0) {
        recuperada = true;
        continue; // sin espera: la base responde, solo estaba bloqueada
      }
      console.error(`No se ha podido desbloquear "${nombre}".`);
    }
    process.exit(status);
  }

  const inalcanzable = salida.includes("P1001");
  const ultimo = intento === ESPERAS_MS.length;

  if (!inalcanzable || ultimo) {
    process.exit(status);
  }

  const espera = ESPERAS_MS[intento];
  console.log(
    `\nLa base no responde todavia (P1001), probablemente arrancando. ` +
      `Reintento ${intento + 2}/${ESPERAS_MS.length + 1} en ${espera / 1000}s...\n`,
  );
  await new Promise((resolve) => setTimeout(resolve, espera));
}
