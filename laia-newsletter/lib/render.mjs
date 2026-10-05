// HTML del boletín, pensado para correo: tablas, estilos en línea y 640 px.
//
// Gmail y Outlook ignoran casi todo el CSS moderno (flex, grid, variables),
// así que aquí no se usa; los colores salen de config.mjs como literales.

import { brand, competitors, agenda } from "../config.mjs";

const C = brand.colors;
const F = brand.font;
const MONTHS = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

const esc = (s = "") =>
  String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

export const fmtDate = (d) => `${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]} de ${d.getUTCFullYear()}`;
const shortDate = (d) => `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()].slice(0, 3)}`;
const brandOf = (key) => competitors.find((b) => b.key === key);

function badge(text, bg, color = "#FFFFFF") {
  return `<span style="display:inline-block;background:${bg};color:${color};font:700 10px/1 ${F};letter-spacing:.08em;text-transform:uppercase;padding:5px 8px;border-radius:3px;">${esc(text)}</span>`;
}

function impactBadge(n) {
  if (n >= 3) return badge("Impacto alto", "#FDE8E8", "#B42318");
  if (n === 2) return badge("Impacto medio", "#FEF3E2", "#B54708");
  return "";
}

function readMore(item, color = C.accent) {
  return `<a href="${esc(item.link)}" style="color:${color};font:700 13px/1.4 ${F};text-decoration:none;">Leer en ${esc(item.source || "la fuente")} &rarr;</a>`;
}

function lecturaLaia(text) {
  if (!text) return "";
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-top:14px;"><tr>
    <td style="background:${C.accentSoft};border-left:4px solid ${C.accent};padding:12px 14px;border-radius:0 4px 4px 0;">
      <div style="font:800 10px/1 ${F};letter-spacing:.12em;text-transform:uppercase;color:${C.accent};margin-bottom:6px;">Lectura ${esc(brand.name)}</div>
      <div style="font:400 14px/1.5 ${F};color:${C.text};">${esc(text)}</div>
    </td></tr></table>`;
}

function sectionTitle(kicker, title) {
  return `<tr><td class="px" style="padding:34px 32px 12px;">
    <div style="font:800 11px/1 ${F};letter-spacing:.16em;text-transform:uppercase;color:${C.accent};">${esc(kicker)}</div>
    <div style="font:800 22px/1.25 ${F};color:${C.ink};margin-top:8px;">${esc(title)}</div>
  </td></tr>`;
}

function logo() {
  if (brand.logoUrl) {
    return `<img src="${esc(brand.logoUrl)}" alt="${esc(brand.name)}" height="40" style="display:block;height:40px;width:auto;border:0;">`;
  }
  return `<span style="font:900 30px/1 ${F};letter-spacing:.18em;color:#FFFFFF;">${esc(brand.name)}</span>`;
}

function thermometer(edition) {
  const all = [edition.destacada, ...edition.noticias].filter(Boolean);
  const cells = competitors
    .map((b) => {
      const n = all.filter((x) => x.marca === b.key).length;
      const label = n === 0 ? "En calma" : n === 1 ? "Activo" : "Muy activo";
      const dots = [0, 1, 2].map((i) => `<span style="color:${i < Math.min(n, 3) ? b.color : C.line};">&#9679;</span>`).join("");
      return `<td width="20%" valign="top" style="padding:0 4px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="background:${C.card};border-top:4px solid ${b.color};border-radius:4px;padding:12px 6px;text-align:center;">
          <div class="therm-name" style="font:800 12px/1.2 ${F};color:${C.ink};">${esc(b.name)}</div>
          <div style="font:900 26px/1 ${F};color:${n ? b.color : C.muted};margin:8px 0 4px;">${n}</div>
          <div style="font:400 13px/1 ${F};letter-spacing:2px;">${dots}</div>
          <div class="therm-label" style="font:700 10px/1 ${F};color:${C.muted};text-transform:uppercase;letter-spacing:.06em;margin-top:6px;">${label}</div>
        </td></tr></table></td>`;
    })
    .join("");
  return `<tr><td class="px" style="padding:24px 28px 0;">
    <div style="font:800 11px/1 ${F};letter-spacing:.16em;text-transform:uppercase;color:${C.muted};padding:0 4px 10px;">Termómetro de la competencia</div>
    <table class="therm" role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${cells}</tr></table>
  </td></tr>`;
}

function featured(item) {
  if (!item) return "";
  const b = brandOf(item.marca);
  const img = item.image
    ? `<tr><td><a href="${esc(item.link)}"><img src="${esc(item.image)}" alt="" width="576" style="display:block;width:100%;max-width:576px;height:auto;border:0;border-radius:6px 6px 0 0;"></a></td></tr>`
    : `<tr><td style="background:${b?.color || C.accent};height:8px;line-height:8px;font-size:0;border-radius:6px 6px 0 0;">&nbsp;</td></tr>`;
  return `${sectionTitle("La noticia de la quincena", "En portada")}
  <tr><td class="px" style="padding:0 32px;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.card};border-radius:6px;box-shadow:0 1px 3px rgba(14,26,43,.08);">
      ${img}
      <tr><td style="padding:22px 24px 24px;">
        <div>${b ? badge(b.name, b.color) : ""} ${item.categoria ? badge(item.categoria, C.ink) : ""}</div>
        <a href="${esc(item.link)}" style="text-decoration:none;"><div style="font:800 24px/1.25 ${F};color:${C.ink};margin:14px 0 10px;">${esc(item.titulo)}</div></a>
        <div style="font:400 15px/1.6 ${F};color:${C.text};">${esc(item.resumen)}</div>
        ${lecturaLaia(item.lectura_laia)}
        <div style="margin-top:16px;">${readMore(item)} <span style="font:400 12px ${F};color:${C.muted};">&middot; ${shortDate(item.date)}</span></div>
      </td></tr>
    </table>
  </td></tr>`;
}

function newsCard(item, color) {
  return `<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:12px;background:${C.card};border-radius:4px;box-shadow:0 1px 2px rgba(14,26,43,.06);"><tr>
    <td width="4" style="background:${color};border-radius:4px 0 0 4px;font-size:0;">&nbsp;</td>
    <td style="padding:16px 18px;">
      <div>${item.categoria ? badge(item.categoria, C.paper, C.ink) : ""} ${impactBadge(item.impacto)}</div>
      <a href="${esc(item.link)}" style="text-decoration:none;"><div style="font:800 17px/1.3 ${F};color:${C.ink};margin:10px 0 6px;">${esc(item.titulo)}</div></a>
      <div style="font:400 14px/1.55 ${F};color:${C.text};">${esc(item.resumen)}</div>
      ${lecturaLaia(item.lectura_laia)}
      <div style="margin-top:12px;">${readMore(item, color)} <span style="font:400 12px ${F};color:${C.muted};">&middot; ${shortDate(item.date)}</span></div>
    </td></tr></table>`;
}

function byBrand(edition) {
  const blocks = competitors
    .map((b) => {
      const items = edition.noticias.filter((n) => n.marca === b.key);
      const isFeatured = edition.destacada?.marca === b.key;
      const body = items.length
        ? items.map((n) => newsCard(n, b.color)).join("")
        : `<div style="font:italic 400 14px/1.5 ${F};color:${C.muted};padding:2px 0 14px;">${
            isFeatured ? "Su gran movimiento de la quincena está en portada." : "Sin movimientos relevantes en el mercado AV esta quincena."
          }</div>`;
      return `<tr><td class="px" style="padding:10px 32px 4px;">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="margin-bottom:10px;"><tr>
          <td style="font:900 15px/1 ${F};color:${b.color};text-transform:uppercase;letter-spacing:.1em;padding-bottom:8px;border-bottom:2px solid ${b.color};">${esc(b.name)}</td>
        </tr></table>
        ${body}
      </td></tr>`;
    })
    .join("");
  return sectionTitle("Marca a marca", "Qué ha hecho la competencia") + blocks;
}

function radar(items) {
  if (!items?.length) return "";
  const rows = items
    .map(
      (n, i) => `<tr><td valign="top" style="padding:12px 12px 12px 0;font:900 20px/1 ${F};color:${C.accent};width:28px;">${String(i + 1).padStart(2, "0")}</td>
      <td style="padding:12px 0;border-bottom:1px solid ${C.line};">
        <a href="${esc(n.link)}" style="text-decoration:none;font:700 15px/1.35 ${F};color:${C.ink};">${esc(n.titulo)}</a>
        <div style="font:400 13px/1.5 ${F};color:${C.muted};margin-top:4px;">${esc(n.resumen)} <span style="white-space:nowrap;">&middot; ${esc(n.source)}</span></div>
      </td></tr>`
    )
    .join("");
  return `${sectionTitle("Radar del sector", "Más allá de la competencia directa")}
  <tr><td class="px" style="padding:0 32px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0">${rows}</table></td></tr>`;
}

function datoYTendencia(edition) {
  const { dato, tendencia } = edition;
  if (!dato && !tendencia) return "";
  const datoCell = dato
    ? `<td class="stack" valign="top" width="${tendencia ? "42%" : "100%"}" style="background:${C.accent};border-radius:6px;padding:22px;">
        <div style="font:800 10px/1 ${F};letter-spacing:.14em;text-transform:uppercase;color:rgba(255,255,255,.85);">El dato</div>
        <div style="font:900 40px/1.05 ${F};color:#FFFFFF;margin:12px 0 8px;">${esc(dato.cifra)}</div>
        <div style="font:400 13px/1.45 ${F};color:#FFFFFF;">${esc(dato.texto)}</div>
        <div style="margin-top:10px;"><a href="${esc(dato.link)}" style="font:700 12px ${F};color:#FFFFFF;">Fuente: ${esc(dato.source)}</a></div>
      </td>`
    : "";
  const tendCell = tendencia
    ? `<td class="stack" valign="top" style="background:${C.ink};border-radius:6px;padding:22px;">
        <div style="font:800 10px/1 ${F};letter-spacing:.14em;text-transform:uppercase;color:${C.accent};">La tendencia</div>
        <div style="font:800 18px/1.3 ${F};color:#FFFFFF;margin:12px 0 8px;">${esc(tendencia.titulo)}</div>
        <div style="font:400 14px/1.55 ${F};color:#C9D3DF;">${esc(tendencia.texto)}</div>
      </td>`
    : "";
  return `<tr><td class="px" style="padding:30px 32px 0;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
    ${datoCell}${dato && tendencia ? '<td class="gap" width="12" style="font-size:0;">&nbsp;</td>' : ""}${tendCell}
  </tr></table></td></tr>`;
}

function agendaBlock(today) {
  const upcoming = agenda
    .map((e) => ({ ...e, s: new Date(`${e.start}T00:00:00Z`), e: new Date(`${e.end}T23:59:59Z`) }))
    .filter((e) => e.e >= today)
    .sort((a, b) => a.s - b.s)
    .slice(0, 3);
  if (!upcoming.length) return "";
  const rows = upcoming
    .map((e) => {
      const days = Math.ceil((e.s - today) / 86400000);
      const when = days <= 0 ? "¡Ahora!" : `${days}`;
      return `<td class="stack" valign="top" style="padding:0 6px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td style="border:1px solid ${C.line};border-radius:6px;padding:16px;background:${C.card};">
        <div style="font:900 30px/1 ${F};color:${C.accent};">${when}</div>
        <div style="font:700 10px/1 ${F};letter-spacing:.1em;text-transform:uppercase;color:${C.muted};margin:4px 0 10px;">${days > 0 ? "días" : ""}</div>
        <div style="font:800 15px/1.2 ${F};color:${C.ink};">${esc(e.name)}</div>
        <div style="font:400 13px/1.4 ${F};color:${C.muted};">${esc(e.place)} &middot; ${shortDate(e.s)}–${shortDate(new Date(`${e.end}T00:00:00Z`))}</div>
      </td></tr></table></td>`;
    })
    .join("");
  return `${sectionTitle("Agenda", "Cuenta atrás")}
  <tr><td class="px" style="padding:0 26px;"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>${rows}</tr></table></td></tr>`;
}

/**
 * meta: { number, date (Date del envío), since, until, note? }
 */
export function renderNewsletter(edition, meta) {
  const period = `${shortDate(meta.since)} – ${shortDate(new Date(meta.until - 86400000))}`;
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light only">
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
  }
</style>
<title>${esc(edition.asunto)}</title></head>
<body style="margin:0;padding:0;background:${C.paper};">
<div style="display:none;max-height:0;overflow:hidden;">${esc(edition.editorial || edition.portada)}</div>
<table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:${C.paper};"><tr><td align="center" style="padding:24px 8px;">
<table role="presentation" width="640" cellspacing="0" cellpadding="0" style="width:100%;max-width:640px;background:${C.paper};">

  <tr><td class="px" style="background:${C.ink};border-radius:8px 8px 0 0;padding:26px 32px 0;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr>
      <td valign="middle">${logo()}</td>
      <td valign="middle" align="right" style="font:700 11px/1.5 ${F};color:#C9D3DF;letter-spacing:.08em;text-transform:uppercase;">
        <span style="color:${C.accent};">${esc(brand.newsletterName)}</span> &middot; N.º ${meta.number}<br>${fmtDate(meta.date)}
      </td>
    </tr></table>
  </td></tr>
  <tr><td class="px" style="background:${C.ink};padding:34px 32px 34px;">
    <div style="height:4px;width:56px;background:${C.accent};font-size:0;line-height:0;">&nbsp;</div>
    <div class="hero" style="font:900 32px/1.15 ${F};color:#FFFFFF;margin:18px 0 14px;">${esc(edition.portada)}</div>
    ${edition.editorial ? `<div style="font:400 16px/1.6 ${F};color:#C9D3DF;">${esc(edition.editorial)}</div>` : ""}
    <div style="font:700 11px/1 ${F};color:#8394A8;letter-spacing:.1em;text-transform:uppercase;margin-top:20px;">Quincena ${period} &middot; ${esc(brand.tagline)}</div>
  </td></tr>
  <tr><td style="background:${C.accent};height:6px;line-height:6px;font-size:0;">&nbsp;</td></tr>
  ${meta.note ? `<tr><td class="px" style="padding:16px 32px 0;"><div style="background:#FFF7E0;border:1px solid #F5D77A;border-radius:4px;padding:10px 14px;font:400 13px/1.5 ${F};color:#7A5B00;">${esc(meta.note)}</div></td></tr>` : ""}

  ${thermometer(edition)}
  ${featured(edition.destacada)}
  ${byBrand(edition)}
  ${datoYTendencia(edition)}
  ${radar(edition.radar)}
  ${agendaBlock(meta.date)}

  <tr><td class="px" style="padding:40px 32px 8px;"><div style="height:1px;background:${C.line};font-size:0;">&nbsp;</div></td></tr>
  <tr><td class="px" style="padding:12px 32px 36px;text-align:center;">
    <div style="font:900 16px/1 ${F};letter-spacing:.18em;color:${C.ink};">${esc(brand.name)}</div>
    <div style="font:400 12px/1.6 ${F};color:${C.muted};margin-top:10px;">
      ${esc(brand.newsletterName)} es un boletín interno de ${esc(brand.name)} que se elabora automáticamente cada quincena<br>
      a partir de prensa AV especializada y buscadores de noticias. Los resúmenes y la «Lectura ${esc(brand.name)}»<br>
      son orientativos: contrasta con la fuente antes de usarlos con clientes.
    </div>
    <div style="margin-top:12px;"><a href="${esc(brand.website)}" style="font:700 12px ${F};color:${C.accent};text-decoration:none;">${esc(brand.website.replace(/^https?:\/\//, ""))}</a></div>
  </td></tr>

</table></td></tr></table>
</body></html>`;
}
