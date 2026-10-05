// HTML del boletín, pensado para correo: tablas, estilos en línea y 640 px.
//
// Sigue la «Brand Style Guide» de LAIA: Laia Red + Dark Blue sobre fondo
// claro gris-blanco, degradado rojo solo para llamar la atención (portada,
// «Lectura LAIA», el dato, botones), Mandau en titulares y números, Poppins
// en el resto, esquinas redondeadas, botones con borde redondeado y siempre
// una barra azul oscuro al final con logo | web | «A European Company».
//
// Gmail y Outlook ignoran casi todo el CSS moderno, así que todo va en línea;
// los degradados llevan siempre un color de fondo plano de respaldo.

import { brand, competitors, agenda } from "../config.mjs";

const C = brand.colors;
const H = brand.fontHead;
const B = brand.fontBody;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmtDate = (d) => `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
const shortDate = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
const brandOf = (key) => competitors.find((b) => b.key === key);

// Fondo con degradado Laia y respaldo plano para los clientes que no lo pintan.
const redBg = `background-color:${C.red};background-image:${brand.gradient};`;

function pill(text, { bg = C.ink, color = C.white, border = bg } = {}) {
  return `<span style="display:inline-block;background:${bg};color:${color};border:1px solid ${border};font:600 10px/1 ${B};letter-spacing:.06em;text-transform:uppercase;padding:5px 10px;border-radius:14px;">${esc(text)}</span>`;
}

function impactPill(n) {
  if (n >= 3) return pill("Impacto alto", { bg: C.red });
  if (n === 2) return pill("Impacto medio", { bg: C.white, color: C.ink, border: C.ink });
  return "";
}

// Llamada a la acción en formato botón (guía: Poppins Semi-Bold, borde fino,
// esquinas redondeadas). `solid` = relleno con el degradado.
function button(item, solid = false) {
  const style = solid
    ? `${redBg}color:${C.white};border:1px solid ${C.red};`
    : `background:${C.white};color:${C.red};border:1px solid ${C.red};`;
  return `<a href="${esc(item.link)}" style="${style}display:inline-block;font:600 13px/1 ${B};text-decoration:none;padding:10px 18px;border-radius:16px;">Leer en ${esc(item.source || "la fuente")} &rarr;</a>`;
}

const dateTag = (d) => `<span style="font:400 12px ${B};color:${C.grey};">&nbsp;&nbsp;${shortDate(d)}</span>`;

function lectura(text, strong = false) {
  if (!text) return "";
  const box = strong
    ? `${redBg}border-radius:8px;padding:14px 16px;`
    : `background:${C.soft};border-left:3px solid ${C.red};border-radius:0 8px 8px 0;padding:12px 14px;`;
  const label = strong ? C.white : C.red;
  const body = strong ? C.white : C.ink;
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:16px;"><tr><td style="${box}">
      <div style="font:700 10px/1 ${B};letter-spacing:.14em;text-transform:uppercase;color:${label};margin-bottom:6px;">Lectura ${esc(brand.name)}</div>
      <div style="font:400 14px/1.5 ${B};color:${body};">${esc(text)}</div>
    </td></tr></table>`;
}

// Título de sección como los de la guía: titular en Mandau, una palabra en
// Laia Red, y una línea fina roja a la derecha.
function sectionTitle(kicker, title, highlight = "") {
  return `<tr><td class="px" style="padding:36px 32px 14px;">
    <div style="font:300 12px/1 ${B};letter-spacing:.18em;text-transform:uppercase;color:${C.grey};">${esc(kicker)}</div>
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:8px;"><tr>
      <td class="st" style="font:700 24px/1.15 ${H};letter-spacing:-.01em;color:${C.ink};white-space:nowrap;padding-right:14px;">${esc(title)}${
        highlight ? ` <span style="color:${C.red};">${esc(highlight)}</span>` : ""
      }</td>
      <td class="st-rule" width="100%" valign="middle"><div style="height:1px;background:${C.red};font-size:0;line-height:0;">&nbsp;</div></td>
    </tr></table>
  </td></tr>`;
}

// Corchetes de esquina (⌜ ⌟) que enmarcan los titulares en los diseños LAIA.
const corner = (pos) =>
  `<div style="width:18px;height:18px;${pos === "tl" ? "border-top:2px solid #FFFFFF;border-left:2px solid #FFFFFF;" : "border-bottom:2px solid #FFFFFF;border-right:2px solid #FFFFFF;margin-left:auto;"}font-size:0;line-height:0;">&nbsp;</div>`;

function header(meta) {
  return `<tr><td class="px" style="padding:26px 32px 22px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td valign="middle"><a href="${esc(brand.website)}"><img src="${esc(meta.asset(brand.logos.color))}" alt="${esc(brand.name)} · ${esc(brand.slogan)}" height="58" style="display:block;height:58px;width:auto;border:0;"></a></td>
      <td valign="middle" align="right">
        <div style="font:700 22px/1 ${H};color:${C.red};letter-spacing:-.01em;">${esc(brand.newsletterName)}</div>
        <div style="font:300 12px/1.5 ${B};color:${C.ink};margin-top:6px;">N.º ${meta.number} &middot; ${fmtDate(meta.date)}</div>
      </td>
    </tr></table>
  </td></tr>`;
}

function hero(edition, period) {
  return `<tr><td class="px" style="padding:0 32px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="${redBg}border-radius:8px;padding:26px 26px 24px;">
      ${corner("tl")}
      <div style="padding:6px 14px 0;">
        <div style="font:300 12px/1.4 ${B};letter-spacing:.16em;text-transform:uppercase;color:#FFFFFF;opacity:.9;">Quincena ${period}</div>
        <div class="hero" style="font:700 32px/1.1 ${H};letter-spacing:-.015em;color:#FFFFFF;margin:12px 0 12px;">${esc(edition.portada)}</div>
        ${edition.editorial ? `<div style="font:300 15px/1.55 ${B};color:#FFFFFF;">${esc(edition.editorial)}</div>` : ""}
      </div>
      <div style="padding-top:8px;">${corner("br")}</div>
    </td></tr></table>
  </td></tr>`;
}

function thermometer(edition) {
  const all = [edition.destacada, ...edition.noticias].filter(Boolean);
  const cells = competitors
    .map((b) => {
      const n = all.filter((x) => x.marca === b.key).length;
      const label = n === 0 ? "En calma" : n === 1 ? "Activo" : "Muy activo";
      const dots = [0, 1, 2].map((i) => `<span style="color:${i < Math.min(n, 3) ? C.red : C.line};">&#9679;</span>`).join("");
      return `<td width="20%" valign="top" style="padding:0 4px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="background:${C.white};border-radius:8px;padding:14px 6px 12px;text-align:center;">
          <div class="therm-name" style="font:600 12px/1.2 ${B};color:${C.ink};">${esc(b.name)}</div>
          <div style="font:700 30px/1 ${H};color:${n ? C.red : C.grey};margin:8px 0 4px;">${n}</div>
          <div style="font:400 12px/1 ${B};letter-spacing:2px;">${dots}</div>
          <div class="therm-label" style="font:600 9px/1 ${B};color:${C.grey};text-transform:uppercase;letter-spacing:.06em;margin-top:7px;">${label}</div>
        </td></tr></table></td>`;
    })
    .join("");
  return `${sectionTitle("Actividad de la quincena", "Termómetro de la", "competencia")}
  <tr><td class="px" style="padding:0 28px;">
    <table class="therm" role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cells}</tr></table>
  </td></tr>`;
}

function featured(item) {
  if (!item) return "";
  const b = brandOf(item.marca);
  const img = item.image
    ? `<tr><td style="padding:10px 10px 0;"><a href="${esc(item.link)}"><img src="${esc(item.image)}" alt="" width="556" style="display:block;width:100%;max-width:556px;height:auto;border:0;border-radius:8px;"></a></td></tr>`
    : "";
  return `${sectionTitle("La noticia de la quincena", "En", "portada")}
  <tr><td class="px" style="padding:0 32px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.white};border-radius:8px;">
      ${img}
      <tr><td style="padding:22px 24px 24px;">
        <div>${b ? pill(b.name) : ""} ${item.categoria ? pill(item.categoria, { bg: C.white, color: C.ink, border: C.line }) : ""}</div>
        <a href="${esc(item.link)}" style="text-decoration:none;"><div style="font:700 25px/1.15 ${H};letter-spacing:-.01em;color:${C.ink};margin:14px 0 10px;">${esc(item.titulo)}</div></a>
        <div style="font:400 15px/1.55 ${B};color:${C.ink};">${esc(item.resumen)}</div>
        ${lectura(item.lectura_laia, true)}
        <div style="margin-top:18px;">${button(item, true)}${dateTag(item.date)}</div>
      </td></tr>
    </table>
  </td></tr>`;
}

function newsCard(item) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px;background:${C.white};border-radius:8px;"><tr>
    <td style="padding:18px 20px;">
      <div>${item.categoria ? pill(item.categoria, { bg: C.white, color: C.ink, border: C.line }) : ""} ${impactPill(item.impacto)}</div>
      <a href="${esc(item.link)}" style="text-decoration:none;"><div style="font:700 18px/1.2 ${H};letter-spacing:-.01em;color:${C.ink};margin:12px 0 6px;">${esc(item.titulo)}</div></a>
      <div style="font:400 14px/1.55 ${B};color:${C.ink};">${esc(item.resumen)}</div>
      ${lectura(item.lectura_laia)}
      <div style="margin-top:14px;">${button(item)}${dateTag(item.date)}</div>
    </td></tr></table>`;
}

function byBrand(edition) {
  const blocks = competitors
    .map((b) => {
      const items = edition.noticias.filter((n) => n.marca === b.key);
      const isFeatured = edition.destacada?.marca === b.key;
      const body = items.length
        ? items.map(newsCard).join("")
        : `<div style="font:300 14px/1.5 ${B};color:${C.grey};padding:0 0 14px;">${
            isFeatured ? "Su gran movimiento de la quincena está en portada." : "Sin movimientos relevantes en el mercado AV esta quincena."
          }</div>`;
      return `<tr><td class="px" style="padding:8px 32px 4px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px;"><tr>
          <td style="white-space:nowrap;padding-right:12px;"><span style="color:${C.red};font:700 14px/1 ${H};">&#9632;</span> <span style="font:700 16px/1 ${H};color:${C.ink};text-transform:uppercase;letter-spacing:.06em;">${esc(b.name)}</span></td>
          <td width="100%" valign="middle"><div style="height:1px;background:${C.line};font-size:0;line-height:0;">&nbsp;</div></td>
        </tr></table>
        ${body}
      </td></tr>`;
    })
    .join("");
  return sectionTitle("Marca a marca", "Qué ha hecho la", "competencia") + blocks;
}

function datoYTendencia(edition) {
  const { dato, tendencia } = edition;
  if (!dato && !tendencia) return "";
  const datoCell = dato
    ? `<td class="stack" valign="top" width="${tendencia ? "42%" : "100%"}" style="${redBg}border-radius:8px;padding:22px;">
        <div style="font:300 11px/1 ${B};letter-spacing:.16em;text-transform:uppercase;color:#FFFFFF;">El dato</div>
        <div style="font:700 44px/1 ${H};letter-spacing:-.02em;color:#FFFFFF;margin:14px 0 10px;">${esc(dato.cifra)}</div>
        <div style="font:400 13px/1.45 ${B};color:#FFFFFF;">${esc(dato.texto)}</div>
        <div style="margin-top:12px;"><a href="${esc(dato.link)}" style="font:600 12px ${B};color:#FFFFFF;">Fuente: ${esc(dato.source)}</a></div>
      </td>`
    : "";
  const tendCell = tendencia
    ? `<td class="stack" valign="top" style="background:${C.ink};border-radius:8px;padding:22px;">
        <div style="font:300 11px/1 ${B};letter-spacing:.16em;text-transform:uppercase;color:${C.grey};">La tendencia</div>
        <div style="font:700 19px/1.2 ${H};color:#FFFFFF;margin:14px 0 8px;">${esc(tendencia.titulo)}</div>
        <div style="font:300 14px/1.55 ${B};color:${C.soft};">${esc(tendencia.texto)}</div>
      </td>`
    : "";
  return `<tr><td class="px" style="padding:32px 32px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
    ${datoCell}${dato && tendencia ? '<td class="gap" width="12" style="font-size:0;">&nbsp;</td>' : ""}${tendCell}
  </tr></table></td></tr>`;
}

function radar(items) {
  if (!items?.length) return "";
  const rows = items
    .map(
      (n, i) => `<tr><td valign="top" style="padding:14px 14px 14px 0;font:700 22px/1 ${H};color:${C.red};width:30px;">${String(i + 1).padStart(2, "0")}</td>
      <td style="padding:14px 0;border-bottom:1px solid ${C.line};">
        <a href="${esc(n.link)}" style="text-decoration:none;font:700 16px/1.25 ${H};color:${C.ink};">${esc(n.titulo)}</a>
        <div style="font:400 13px/1.5 ${B};color:${C.grey};margin-top:4px;">${esc(n.resumen)} <span style="white-space:nowrap;">&middot; ${esc(n.source)}</span></div>
      </td></tr>`
    )
    .join("");
  return `${sectionTitle("Radar del sector", "Más allá de la", "competencia")}
  <tr><td class="px" style="padding:0 32px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>`;
}

function agendaBlock(today) {
  const upcoming = agenda
    .map((e) => ({ ...e, s: new Date(`${e.start}T00:00:00Z`), e: new Date(`${e.end}T23:59:59Z`) }))
    .filter((e) => e.e >= today)
    .sort((a, b) => a.s - b.s)
    .slice(0, 3);
  if (!upcoming.length) return "";
  const cells = upcoming
    .map((e) => {
      const days = Math.ceil((e.s - today) / 86400000);
      return `<td class="stack" valign="top" style="padding:0 6px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="background:${C.white};border-radius:8px;padding:18px;">
        <div style="font:700 36px/1 ${H};letter-spacing:-.02em;color:${C.red};">${days > 0 ? days : "¡Ya!"}</div>
        <div style="font:300 11px/1 ${B};letter-spacing:.14em;text-transform:uppercase;color:${C.grey};margin:6px 0 12px;">${days > 0 ? "días" : "en marcha"}</div>
        <div style="font:700 16px/1.2 ${H};color:${C.ink};">${esc(e.name)}</div>
        <div style="font:400 13px/1.4 ${B};color:${C.grey};">${esc(e.place)} &middot; ${shortDate(e.s)}–${shortDate(new Date(`${e.end}T00:00:00Z`))}</div>
      </td></tr></table></td>`;
    })
    .join("");
  return `${sectionTitle("Agenda", "Cuenta", "atrás")}
  <tr><td class="px" style="padding:0 26px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cells}</tr></table></td></tr>`;
}

// Barra azul oscuro obligatoria al pie: logo | web | «A European Company».
function footer(meta) {
  return `<tr><td class="px" style="padding:34px 32px 18px;">
    <div style="font:300 12px/1.6 ${B};color:${C.grey};text-align:center;">
      ${esc(brand.newsletterName)} es un boletín interno de ${esc(brand.name)} que se elabora automáticamente cada quincena a partir de prensa AV especializada y buscadores de noticias. Los resúmenes y la «Lectura ${esc(brand.name)}» son orientativos: contrasta con la fuente antes de usarlos con clientes.
    </div>
  </td></tr>
  <tr><td style="background:${C.ink};border-radius:0 0 8px 8px;padding:16px 28px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td valign="middle" width="33%"><img src="${esc(meta.asset(brand.logos.white))}" alt="${esc(brand.name)}" height="26" style="display:block;height:26px;width:auto;border:0;"></td>
      <td valign="middle" align="center" width="34%"><a href="${esc(brand.website)}" style="font:400 12px ${B};color:#FFFFFF;text-decoration:none;">${esc(brand.website.replace(/^https?:\/\//, ""))}</a></td>
      <td valign="middle" align="right" width="33%" style="font:400 12px ${B};color:#FFFFFF;">${esc(brand.signature)}</td>
    </tr></table>
  </td></tr>`;
}

/**
 * meta: { number, date (Date del envío), since, until, note?, asset(nombre) → URL de la imagen }
 */
export function renderNewsletter(edition, meta) {
  const period = `${shortDate(meta.since)} – ${shortDate(new Date(meta.until - 86400000))}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
<title>${esc(edition.asunto)}</title>
<link href="https://fonts.googleapis.com/css2?family=Poppins:wght@300;400;600;700&display=swap" rel="stylesheet">
<style>
  /* Solo para móviles; los clientes que ignoran <style> ven la versión de 640 px. */
  @media (max-width: 520px) {
    .px { padding-left: 16px !important; padding-right: 16px !important; }
    .therm td { padding-left: 1px !important; padding-right: 1px !important; }
    .therm-name { font-size: 10px !important; }
    .therm-label { font-size: 8px !important; letter-spacing: 0 !important; }
    .stack { display: block !important; width: auto !important; margin-bottom: 12px; }
    .gap { display: none !important; }
    .hero { font-size: 26px !important; }
    .st { white-space: normal !important; font-size: 21px !important; padding-right: 0 !important; }
    .st-rule { display: none !important; }
  }
</style></head>
<body style="margin:0;padding:0;background-color:${C.soft};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(edition.editorial || edition.portada)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background-color:${C.soft};"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background-color:${C.soft};background-image:linear-gradient(180deg, #FFFFFF 0%, ${C.soft} 340px);border-radius:8px;">

  ${header(meta)}
  ${hero(edition, period)}
  ${meta.note ? `<tr><td class="px" style="padding:16px 32px 0;"><div style="background:${C.white};border:1px dashed ${C.grey};border-radius:8px;padding:10px 14px;font:400 13px/1.5 ${B};color:${C.ink};">${esc(meta.note)}</div></td></tr>` : ""}
  ${thermometer(edition)}
  ${featured(edition.destacada)}
  ${byBrand(edition)}
  ${datoYTendencia(edition)}
  ${radar(edition.radar)}
  ${agendaBlock(meta.date)}
  ${footer(meta)}

</table></td></tr></table>
</body></html>`;
}
