#!/usr/bin/env node
// Genera (y opcionalmente envía) una edición del boletín Radar AV de LAIA.
//
//   node laia-newsletter/generate.mjs               → solo si hoy toca (2.º/4.º viernes)
//   node laia-newsletter/generate.mjs --force       → genera hoy aunque no toque
//   node laia-newsletter/generate.mjs --send        → además lo envía por correo
//   node laia-newsletter/generate.mjs --pdf         → además genera el PDF (necesita Chrome/Chromium)
//   node laia-newsletter/generate.mjs --eml         → además un .eml para enviarlo desde tu propio correo
//   node laia-newsletter/generate.mjs --fixture f.json  → sin red: usa una edición ya redactada
//
// La edición se guarda en laia-newsletter/ediciones/AAAA-MM-DD.html (con los
// logos dentro, así que se puede descargar y abrir en cualquier sitio) y, con
// --pdf, también AAAA-MM-DD.pdf. La ruta se escribe en la salida estándar.

import { mkdirSync, readdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { brand, competitors, sectorFeeds, sectorQueries, sendFridays } from "./config.mjs";
import { bingNewsUrl, collect, fetchOgImage, googleNewsUrl } from "./lib/feeds.mjs";
import { selectCandidates } from "./lib/select.mjs";
import { curate } from "./lib/curate.mjs";
import { renderNewsletter, fmtDate } from "./lib/render.mjs";
import { isSendDay, previousSendDay } from "./lib/schedule.mjs";
import { sendEmail } from "./lib/send.mjs";
import { buildEml } from "./lib/eml.mjs";

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

// Imprime el HTML a PDF con Chrome sin interfaz. Chrome viene instalado en
// los runners de GitHub (ubuntu-latest); en local, CHROME_PATH lo indica.
function printPdf(htmlFile) {
  const candidates = [process.env.CHROME_PATH, "google-chrome", "google-chrome-stable", "chromium", "chromium-browser"].filter(Boolean);
  const out = htmlFile.replace(/\.html$/, "") + ".pdf";
  for (const bin of candidates) {
    try {
      execFileSync(
        bin,
        ["--headless=new", "--disable-gpu", "--no-sandbox", "--no-pdf-header-footer", "--hide-scrollbars", `--print-to-pdf=${out}`, `file://${resolve(htmlFile)}`],
        { stdio: "ignore", timeout: 60000 }
      );
      if (existsSync(out)) {
        log(`PDF guardado en ${out}`);
        return out;
      }
    } catch {}
  }
  log("No se ha podido generar el PDF (¿falta Chrome? define CHROME_PATH). Sigue sin él.");
  return null;
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
  const file = opt("--out") || join(outDir, `${stamp}.html`);
  const assetsDir = join(here, "assets");
  const publicAssets = (process.env.LAIA_ASSETS_URL || "").replace(/\/$/, "");
  const meta = { number, date: today, since, until, note };
  // La copia archivada enlaza los logos con ruta relativa (se ve al abrirla
  // desde el repo); el correo los lleva adjuntos en línea (cid:) o desde
  // LAIA_ASSETS_URL si existe una URL pública.
  // La versión archivada/descargable lleva los logos dentro (data:), para que
  // se vea igual al abrirla desde cualquier ordenador, sin conexión ni repo.
  const html = renderNewsletter(edition, {
    ...meta,
    asset: (name) => `data:image/png;base64,${readFileSync(join(assetsDir, name)).toString("base64")}`,
  });
  writeFileSync(file, html);
  let pdf = null;
  if (flag("--pdf")) pdf = printPdf(file);
  log(`Edición n.º ${number} guardada en ${file}`);
  log(`Asunto: ${edition.asunto}`);
  setOutput("generated", "true");
  setOutput("file", file);
  if (pdf) setOutput("pdf", pdf);

  // HTML del correo: logos como imágenes en línea (cid:), salvo que haya una
  // URL pública para ellos. Lo usan el envío automático y el .eml.
  const logos = Object.values(brand.logos);
  const emailHtml = publicAssets ? html : renderNewsletter(edition, { ...meta, asset: (name) => `cid:${name}` });
  const pdfName = `Radar-AV-LAIA-${stamp}.pdf`;

  if (flag("--eml")) {
    const eml = file.replace(/\.html$/, "") + ".eml";
    writeFileSync(
      eml,
      buildEml({
        subject: edition.asunto,
        html: emailHtml,
        images: publicAssets ? [] : logos.map((name) => ({ name, data: readFileSync(join(assetsDir, name)) })),
        pdf: pdf ? { name: pdfName, data: readFileSync(pdf) } : null,
      })
    );
    log(`Correo listo para enviar desde tu buzón: ${eml}`);
    setOutput("eml", eml);
  }

  if (flag("--send")) {
    const to = (process.env.LAIA_NEWSLETTER_TO || "").split(",").map((s) => s.trim()).filter(Boolean);
    if (!to.length) throw new Error("Falta LAIA_NEWSLETTER_TO (destinatarios separados por comas)");
    const attachments = publicAssets
      ? []
      : logos.map((name) => ({ filename: name, content: readFileSync(join(assetsDir, name)).toString("base64"), content_id: name }));
    // El PDF va como adjunto normal, para guardarlo o reenviarlo.
    if (pdf) attachments.push({ filename: pdfName, content: readFileSync(pdf).toString("base64") });
    const id = await sendEmail({ to, subject: edition.asunto, html: emailHtml, attachments });
    log(`Enviado a ${to.length} destinatario(s). Id de Resend: ${id}`);
  }
  console.log(file);
}

main().catch((e) => {
  console.error(`ERROR: ${e.message}`);
  process.exit(1);
});
