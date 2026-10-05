#!/usr/bin/env node
// Genera (y opcionalmente envía) una edición del boletín Radar AV de LAIA.
//
//   node laia-newsletter/generate.mjs               → solo si hoy toca (2.º/4.º viernes)
//   node laia-newsletter/generate.mjs --force       → genera hoy aunque no toque
//   node laia-newsletter/generate.mjs --send        → además lo envía por correo
//   node laia-newsletter/generate.mjs --fixture f.json  → sin red: usa una edición ya redactada
//
// La edición se guarda en laia-newsletter/ediciones/AAAA-MM-DD.html y la
// ruta se escribe en la salida estándar (la usa el workflow).

import { mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { competitors, sectorFeeds, sectorQueries, sendFridays } from "./config.mjs";
import { bingNewsUrl, collect, fetchOgImage, googleNewsUrl } from "./lib/feeds.mjs";
import { selectCandidates } from "./lib/select.mjs";
import { curate } from "./lib/curate.mjs";
import { renderNewsletter, fmtDate } from "./lib/render.mjs";
import { isSendDay, previousSendDay } from "./lib/schedule.mjs";
import { sendEmail } from "./lib/send.mjs";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined);
const log = (...a) => console.error(...a);

function setOutput(name, value) {
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `${name}=${value}\n`);
}

function sources() {
  const list = [];
  for (const b of competitors) {
    for (const q of b.queries) {
      list.push({ label: `Google News · ${b.name}`, url: googleNewsUrl(q), brand: b.key });
      list.push({ label: `Bing News · ${b.name}`, url: bingNewsUrl(q), brand: b.key });
    }
    list.push({ label: `Google News ES · ${b.name}`, url: googleNewsUrl(`"${b.name.replace(/ \(.*\)/, "")}"`, "es"), brand: b.key });
  }
  for (const q of sectorQueries) {
    list.push({ label: `Google News · sector`, url: googleNewsUrl(q, /[áéíóú]/.test(q) ? "es" : "en") });
  }
  for (const f of sectorFeeds) list.push({ label: f.name, url: f.url, name: f.name });
  return list;
}

async function main() {
  const today = opt("--date") ? new Date(`${opt("--date")}T08:00:00Z`) : new Date();
  if (!flag("--force") && !flag("--fixture") && !isSendDay(today, sendFridays)) {
    log(`Hoy (${today.toISOString().slice(0, 10)}) no toca boletín: sale el ${sendFridays.join(".º y ")}.º viernes de cada mes.`);
    setOutput("generated", "false");
    return;
  }

  const until = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const since = previousSendDay(today, sendFridays);
  const period = `del ${fmtDate(since)} al ${fmtDate(new Date(until - 86400000))}`;

  let edition;
  let note;
  let numberOverride;
  if (opt("--fixture")) {
    const fx = JSON.parse(readFileSync(opt("--fixture"), "utf8"));
    const revive = (n) => n && { ...n, date: new Date(n.date) };
    edition = { ...fx.edition, destacada: revive(fx.edition.destacada), noticias: fx.edition.noticias.map(revive), radar: fx.edition.radar.map(revive), dato: revive(fx.edition.dato) };
    note = fx.note;
    if (fx.number !== undefined) numberOverride = fx.number;
    if (fx.since) since.setTime(new Date(fx.since));
  } else {
    log(`Recogiendo noticias ${period}…`);
    const items = await collect(sources(), { log });
    const candidates = selectCandidates(items, since, until);
    log(`${items.length} items descargados → ${candidates.length} candidatas tras el filtro.`);
    if (!candidates.length) throw new Error("No hay ninguna candidata: revisa las fuentes (¿bloqueo de red?).");
    edition = await curate(candidates, period, { log });
    // Imagen para la destacada si el feed no la traía.
    if (edition.destacada && !edition.destacada.image) edition.destacada.image = await fetchOgImage(edition.destacada.link);
  }

  const outDir = join(here, "ediciones");
  mkdirSync(outDir, { recursive: true });
  const stamp = today.toISOString().slice(0, 10);
  const previous = readdirSync(outDir).filter((f) => /^\d{4}-\d{2}-\d{2}\.html$/.test(f) && f < `${stamp}.html`);
  const number = numberOverride ?? previous.length + 1;
  const html = renderNewsletter(edition, { number, date: today, since, until, note });
  const file = opt("--out") || join(outDir, `${stamp}.html`);
  writeFileSync(file, html);
  log(`Edición n.º ${number} guardada en ${file}`);
  log(`Asunto: ${edition.asunto}`);
  setOutput("generated", "true");
  setOutput("file", file);

  if (flag("--send")) {
    const to = (process.env.LAIA_NEWSLETTER_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!to.length) throw new Error("Falta LAIA_NEWSLETTER_TO (destinatarios separados por comas)");
    const id = await sendEmail({ to, subject: edition.asunto, html });
    log(`Enviado a ${to.length} destinatario(s). Id de Resend: ${id}`);
  }
  console.log(file);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
