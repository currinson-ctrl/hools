import type { Category } from "@prisma/client";
import { CATEGORY_HASHTAGS } from "./sources";

/**
 * Tope de hashtags por publicacion. Cuatro es la linea que hemos fijado para
 * todo lo que sale de aqui (tuit, pie de Instagram, texto de Facebook): mas
 * hashtags no traen mas alcance, pero si hacen que el pie parezca spam.
 */
export const MAX_HASHTAGS = 4;

// Un hashtag: almohadilla + letras/numeros/guion bajo (con acentos y ñ).
const HASHTAG_RE = /#[\p{L}\p{N}_]+/gu;

// Palabras del titular que no sirven para decidir si un hashtag es
// especifico de la noticia (articulos, preposiciones y demas relleno).
const STOPWORDS = new Set([
  "ano", "anos", "ante", "aqui", "asi", "aun", "cada", "como", "con", "contra",
  "cuando", "del", "desde", "donde", "dos", "ella", "ellos", "entre", "era",
  "esa", "ese", "eso", "esta", "este", "esto", "fue", "hace", "hacia", "han",
  "hasta", "hoy", "las", "les", "los", "mas", "muy", "nos", "para", "pero",
  "por", "que", "quien", "segun", "ser", "sin", "sobre", "son", "sus", "tan",
  "tiene", "todo", "tras", "una", "unas", "uno", "unos", "van",
]);

function normalize(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase();
}

/**
 * Palabras del titular con suficiente peso como para reconocerlas dentro de
 * un hashtag (nombres de club, ciudad, competicion...).
 */
function titleKeywords(title: string): string[] {
  return normalize(title)
    .split(/[^a-z0-9]+/)
    // Tres letras es el minimo util: deja pasar siglas y nombres cortos
    // (ska, psg, dux) sin colar el relleno, que ya va en STOPWORDS.
    .filter((word) => word.length >= 3 && !STOPWORDS.has(word));
}

/**
 * Cuanto vale un hashtag cuando hay que dejar fuera a los demas. De mejor a
 * peor:
 *
 *   2. Los que hablan de ESTA noticia (el club, la ciudad o la competicion del
 *      titular): son los que la hacen encontrable de verdad.
 *   1. Los curados a mano para la categoria en CATEGORY_HASHTAGS: identifican
 *      la cuenta aunque la noticia no aporte ninguno propio.
 *   0. El resto (los genericos que suelta el modelo), por orden de aparicion.
 */
function scoreHashtag(tag: string, curated: Set<string>, keywords: string[]): number {
  const plain = normalize(tag).slice(1);
  if (keywords.some((word) => plain.includes(word))) return 2;
  if (curated.has(normalize(tag))) return 1;
  return 0;
}

/**
 * Deja como mucho MAX_HASHTAGS hashtags en un texto, quedandose con los
 * mejores (ver scoreHashtag) y borrando los demas. Los que sobreviven
 * conservan su sitio y su forma original; los repetidos cuentan una sola vez.
 *
 * Es idempotente y no toca nada si el texto ya cumple, asi que se puede
 * llamar tanto al generar el borrador como justo antes de publicar.
 */
export function limitHashtags(
  text: string,
  options: { category?: Category | null; title?: string; max?: number } = {}
): string {
  if (!text) return text;

  const max = options.max ?? MAX_HASHTAGS;
  const matches = [...text.matchAll(HASHTAG_RE)];
  if (matches.length <= max) return text;

  const curated = new Set(
    (options.category ? CATEGORY_HASHTAGS[options.category] : []).map(normalize)
  );
  const keywords = titleKeywords(options.title ?? "");

  // Primero se quitan los repetidos: solo la primera aparicion entra en el
  // reparto de plazas, las demas se borran siempre.
  const seen = new Set<string>();
  const candidates: Array<{ index: number; length: number; score: number }> = [];
  const dropped: Array<{ index: number; length: number }> = [];
  for (const match of matches) {
    const tag = match[0];
    const index = match.index ?? 0;
    const key = normalize(tag);
    if (seen.has(key)) {
      dropped.push({ index, length: tag.length });
      continue;
    }
    seen.add(key);
    candidates.push({ index, length: tag.length, score: scoreHashtag(tag, curated, keywords) });
  }

  // Mejor puntuacion primero y, a igualdad, el que aparecia antes.
  const kept = new Set(
    [...candidates]
      .sort((a, b) => b.score - a.score || a.index - b.index)
      .slice(0, max)
      .map((c) => c.index)
  );
  for (const candidate of candidates) {
    if (!kept.has(candidate.index)) dropped.push({ index: candidate.index, length: candidate.length });
  }

  // Se borran de atras hacia delante para que los indices sigan valiendo.
  let result = text;
  for (const { index, length } of dropped.sort((a, b) => b.index - a.index)) {
    result = result.slice(0, index) + result.slice(index + length);
  }

  return tidy(result);
}

/**
 * Recoge los huecos que dejan los hashtags borrados: espacios dobles, lineas
 * que se quedan vacias y el sobrante del final.
 */
function tidy(text: string): string {
  return text
    .split("\n")
    .map((line) => line.replace(/[ \t]{2,}/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .replace(/\n+$/g, "")
    .trim();
}
