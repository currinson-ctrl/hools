// Primer filtro, sin IA: fechas, duplicados, productos de consumo y marca.
//
// Claude hace luego la criba fina, pero aquí se quita el ruido barato para
// mandarle pocas candidatas y buenas (cuestan dinero y empeoran su criterio
// si son demasiadas).

import { competitors, excludePatterns, maxCandidates } from "../config.mjs";

// Palabras que hacen que una noticia SIN marca vigilada merezca el radar.
const SECTOR_RELEVANT =
  /(ptz|video ?conferenc|videoconferencia|meeting room|sala de reuniones|teams rooms|zoom rooms|video ?bar|auto[- ]?tracking|ndi|hybrid classroom|aula híbrida|pro ?av|avixa|ise 20|infocomm|unified communications|ucc|audio conferencing|ceiling mic|beamforming)/i;

export function detectBrand(text) {
  for (const b of competitors) {
    if (b.match.test(text) && (!b.context || b.context.test(text))) return b.key;
  }
  return null;
}

export function isExcluded(text) {
  return excludePatterns.some((r) => r.test(text));
}

function normTitle(t) {
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9 ]+/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 2)
    .slice(0, 9)
    .join(" ");
}

/**
 * Deja las candidatas del periodo [since, until), con marca detectada o
 * relevantes para el sector, sin repetidas ni de consumo.
 */
export function selectCandidates(items, since, until) {
  const seenLinks = new Set();
  const seenTitles = new Set();
  const out = [];
  for (const it of items) {
    if (!it.title || !it.link) continue;
    if (it.date && (it.date < since || it.date >= until)) continue;
    if (!it.date) continue; // sin fecha no se puede saber si es de esta quincena
    const text = `${it.title} ${it.summary}`;
    if (isExcluded(it.title)) continue;
    const brand = detectBrand(text);
    if (!brand && !SECTOR_RELEVANT.test(text)) continue;
    const key = normTitle(it.title);
    if (seenLinks.has(it.link) || seenTitles.has(key)) continue;
    seenLinks.add(it.link);
    seenTitles.add(key);
    out.push({ ...it, brand });
  }
  // Primero las de marca vigilada, luego las más recientes.
  out.sort((a, b) => (b.brand ? 1 : 0) - (a.brand ? 1 : 0) || b.date - a.date);
  return out.slice(0, maxCandidates).map((c, i) => ({ id: `n${i + 1}`, ...c }));
}
