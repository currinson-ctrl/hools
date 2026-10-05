// Las marcas se escriben en MAYÚSCULAS en todo el boletín (PTZOPTICS, AVER,
// POLY...). Claude ya lo hace por instrucción; esto lo garantiza aunque se
// le escape alguna, y vale también para ediciones redactadas a mano.
//
// Solo toca textos visibles, nunca enlaces: una URL en mayúsculas dejaría
// de funcionar.

const BRANDS = [
  /ptz ?optics/gi,
  /\bAVer\b/g, // sensible a mayúsculas: «aver» en minúscula es otra palabra
  /\bavonic\b/gi,
  /\blogitech\b/gi,
  /\bPoly\b/g, // sensible a mayúsculas: no tocar «polymer», «poly-»...
  /\bkeenfinity\b/gi,
  /\blaia\b/gi,
];

export function brandCase(text) {
  if (typeof text !== "string") return text;
  return BRANDS.reduce((t, re) => t.replace(re, (m) => m.toUpperCase()), text);
}

const TEXT_FIELDS = ["asunto", "portada", "editorial", "titulo", "resumen", "lectura_laia", "texto", "source"];

/** Devuelve la edición con las marcas en mayúsculas en todos sus textos. */
export function applyBrandCase(edition) {
  const fix = (obj) => {
    if (!obj || typeof obj !== "object") return obj;
    const out = { ...obj };
    for (const k of TEXT_FIELDS) if (k in out) out[k] = brandCase(out[k]);
    return out;
  };
  return {
    ...fix(edition),
    destacada: fix(edition.destacada),
    noticias: (edition.noticias || []).map(fix),
    radar: (edition.radar || []).map(fix),
    dato: fix(edition.dato),
    tendencia: fix(edition.tendencia),
  };
}
