import Parser from "rss-parser";
import type { Category, Source } from "@prisma/client";
import { CATEGORY_HASHTAGS, CATEGORY_IMAGE_HINT } from "./sources";
import { buildArticleHtml } from "./article-html";

export { escapeHtml } from "./article-html";
import { translateToSpanish } from "./translate";
import { searchRelatedImage } from "./image-search";
import { findMentionedGroups, linkMentionedGroups, type KnownGroup } from "./groups";

// Cuantas noticias nuevas se quieren sacar de CADA fuente en cada pasada. El
// objetivo es tener donde elegir en la cola de revision sin acabar con
// cincuenta pendientes: con varias fuentes activas, 3 por fuente ya da
// margen para descartar y quedarse con lo mejor.
export const TARGET_ITEMS_PER_SOURCE = 3;

// Cuantos candidatos se miran como mucho por fuente para llegar a ese
// objetivo. Hace falta margen porque el filtro de tema descarta bastantes
// (ver translateToSpanish: "ante la duda, descartala"), y cada descarte
// cuesta igualmente una llamada a Claude.
const MAX_CANDIDATES_PER_SOURCE = 9;

// Presupuesto de tiempo por fuente. Los articulos son largos (mas tokens =
// mas tiempo de generacion) y Vercel puede cortar la funcion a los 60s, asi
// que si una fuente ya lleva mucho intentando llegar al objetivo, se corta y
// lo que quede se recoge en la siguiente pasada (no se pierde, ver
// aggregate.ts). Las fuentes corren en paralelo, o sea que esto acota el
// reloj de pared del rastreo entero, no la suma de todas.
const SOURCE_TIME_BUDGET_MS = 30_000;

const parser = new Parser({
  timeout: 15_000,
  headers: { "User-Agent": "HoolsBrandBot/1.0 (+https://hoolsbrand.com)" },
});

export interface DraftArticle {
  guid: string;
  originalUrl: string;
  originalTitle: string;
  title: string;
  excerpt: string;
  tweetText: string;
  igCaption: string | null;
  imageUrl: string | null;
  // Fotos adicionales aparte de imageUrl (solo lo rellenan fuentes que
  // puedan traer varias, como una cuenta de X con un tuit multi-foto).
  extraImageUrls?: string[];
  // mp4 del tuit de origen, si lo trae (solo fuentes de X).
  videoUrl?: string | null;
  tags: string;
  category: Category;
}

const MAX_SOURCE_CHARS = 2000; // texto original que se le pasa a Claude como punto de partida
const MAX_TWEET_CHARS = 280;

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, max - 1).trimEnd() + "…";
}

function isHttpUrl(value: string): boolean {
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch {
    return false;
  }
}

// Hosts que sirven iconos/avatares genericos en vez de fotos reales del
// contenido (ej. el icono generico que Reddit incrusta en el HTML de los
// posts de solo texto). Si la imagen extraida viene de aqui, se trata como
// si no hubiera imagen para que entre en juego la busqueda de respaldo.
const NON_CONTENT_IMAGE_HOSTS = [
  "redditstatic.com",
  "styles.redditmedia.com",
  "emoji.redditmedia.com",
];

function isRealContentImage(url: string): boolean {
  if (!isHttpUrl(url)) return false;
  try {
    const host = new URL(url).hostname;
    return !NON_CONTENT_IMAGE_HOSTS.some((blocked) => host.endsWith(blocked));
  } catch {
    return false;
  }
}

export type FeedItem = Parser.Item & {
  id?: string;
  "content:encoded"?: string;
  "media:content"?: { $?: { url?: string } } | { $?: { url?: string } }[];
};

function extractImage(item: FeedItem): string | null {
  const enclosure = item.enclosure as { url?: string } | undefined;
  if (enclosure?.url && isRealContentImage(enclosure.url)) return enclosure.url;

  const mediaContent = item["media:content"];
  const mediaUrl = Array.isArray(mediaContent)
    ? mediaContent[0]?.$?.url
    : mediaContent?.$?.url;
  if (mediaUrl && isRealContentImage(mediaUrl)) return mediaUrl;

  const html = item["content:encoded"] || item.content || "";
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (match && isRealContentImage(match[1])) return match[1];

  return null;
}

export async function buildDraft(
  item: FeedItem,
  source: Pick<Source, "name" | "category">,
  knownGroups: KnownGroup[] = [],
  /**
   * Fotos aparte de la destacada, cuando la fuente puede traer varias (un
   * tuit multi-foto). Se maquetan como galeria dentro del texto.
   */
  extraImageUrls: string[] = []
): Promise<DraftArticle | null> {
  const originalUrl = item.link;
  if (!originalUrl || !isHttpUrl(originalUrl)) return null;

  const originalTitle = stripHtml(item.title || "(sin titulo)");
  const guid = item.guid || item.id || originalUrl;

  const rawSnippet =
    item.contentSnippet || stripHtml(item.content || item.summary || "");
  const snippet = truncate(stripHtml(rawSnippet), MAX_SOURCE_CHARS);

  const translated = await translateToSpanish({
    originalTitle,
    snippet,
    // Solo como respaldo: si el modelo devuelve una categoria que no
    // reconocemos, se queda la de la fuente.
    category: source.category,
  });
  if (!translated) {
    console.log(`Descartada por no encajar en el tema: "${originalTitle}"`);
    return null;
  }
  const { title: esTitle, body: esBody } = translated;

  // La categoria sale del contenido de la noticia, no de la fuente. La de la
  // fuente sigue existiendo (organiza el catalogo y sirve de respaldo), pero
  // una fuente generalista trae noticias de las tres, y heredar la suya metia
  // los desplazamientos en la pestaña de aficion.
  const category = translated.category;
  if (category !== source.category) {
    console.log(
      `"${originalTitle}": la fuente es ${source.category} pero el contenido es ${category}`
    );
  }

  // Grupos de aficion mencionados en la noticia (curados a mano en
  // /dashboard/groups, nunca adivinados): se enlazan en el articulo y se
  // mencionan en el tuit.
  const mentionedGroups = findMentionedGroups(
    `${originalTitle} ${snippet} ${esTitle} ${esBody}`,
    knownGroups
  );

  const excerpt = buildArticleHtml({
    lead: translated.lead,
    sections: translated.sections,
    pullQuote: translated.pullQuote,
    facts: translated.facts,
    galleryImageUrls: extraImageUrls,
    sourceName: source.name,
    sourceUrl: originalUrl,
    rotationKey: guid,
    decorate: (html) => linkMentionedGroups(html, mentionedGroups),
  });

  const hashtags = CATEGORY_HASHTAGS[category].join(" ");
  const mentions = mentionedGroups.map((g) => `@${g.handle}`).join(" ");
  const secondLine = [mentions, hashtags].filter(Boolean).join(" ");
  const tweetText = truncate(
    `${esTitle}\n\n${secondLine}`,
    MAX_TWEET_CHARS - 24 // deja hueco para el enlace que se añade al publicar
  );

  let imageUrl = extractImage(item);
  if (!imageUrl) {
    const hint = CATEGORY_IMAGE_HINT[category];
    console.log(`Sin imagen propia para "${originalTitle}", buscando en Openverse...`);
    imageUrl =
      (await searchRelatedImage(`${originalTitle} ${hint}`)) ??
      (await searchRelatedImage(hint));
    console.log(
      imageUrl
        ? `Imagen de respaldo encontrada para "${originalTitle}": ${imageUrl}`
        : `Openverse no devolvio ninguna imagen para "${originalTitle}"`
    );
  }

  return {
    guid,
    originalUrl,
    originalTitle,
    title: esTitle,
    excerpt,
    tweetText,
    igCaption: translated.igCaption,
    imageUrl,
    tags: [category, source.name].join(","),
    category,
  };
}

/** Lo que deja una fuente en una pasada del rastreo. */
export interface DraftBatch {
  /** Noticias ya escritas, listas para guardar (como mucho TARGET_ITEMS_PER_SOURCE). */
  drafts: DraftArticle[];
  /**
   * Candidatos que el filtro de tema ha tumbado. Se apuntan en SkippedItem
   * para no volver a pasarlos por Claude en cada pasada.
   */
  skippedGuids: string[];
  /**
   * Candidatos nuevos que ni se han llegado a mirar, porque ya se habia
   * alcanzado el objetivo (o el tope de intentos/tiempo). No se pierden: se
   * recogen en la siguiente pulsada de "Buscar noticias ahora".
   */
  pending: number;
}

/**
 * Genera noticias de una fuente hasta juntar TARGET_ITEMS_PER_SOURCE, en vez
 * de procesar un numero fijo de candidatos y quedarse con lo que sobreviva.
 * Es la diferencia entre "mira 4 y a ver" (que con el filtro de tema se
 * quedaba muchas veces en 0-1 por fuente) y "traeme 3 buenas".
 *
 * Va por rondas del tamaño de lo que falta, todas las de una ronda en
 * paralelo: si el filtro no descarta nada, es una sola ronda y tarda lo mismo
 * que antes; solo se encadenan mas rondas cuando de verdad hacen falta.
 */
export async function buildUntilTarget<T>(
  candidates: T[],
  guidOf: (candidate: T) => string,
  build: (candidate: T) => Promise<DraftArticle | null>
): Promise<DraftBatch> {
  const deadline = Date.now() + SOURCE_TIME_BUDGET_MS;
  const limit = Math.min(candidates.length, MAX_CANDIDATES_PER_SOURCE);
  const drafts: DraftArticle[] = [];
  const skippedGuids: string[] = [];
  let looked = 0;

  while (looked < limit && drafts.length < TARGET_ITEMS_PER_SOURCE) {
    // Solo se comprueba el reloj entre rondas: una ronda ya empezada se
    // termina siempre, para no tirar articulos ya pagados a medio escribir.
    if (looked > 0 && Date.now() >= deadline) break;

    const missing = TARGET_ITEMS_PER_SOURCE - drafts.length;
    const round = candidates.slice(looked, Math.min(looked + missing, limit));
    looked += round.length;

    const built = await Promise.all(round.map(build));
    built.forEach((draft, i) => {
      if (draft) drafts.push(draft);
      else skippedGuids.push(guidOf(round[i]));
    });
  }

  return { drafts, skippedGuids, pending: candidates.length - looked };
}

export interface FeedCandidate {
  item: FeedItem;
  guid: string;
}

/**
 * Solo descarga y parsea el feed (rapido, sin tocar la base ni llamar a
 * Claude/Openverse). Se separa de la generacion de borradores para poder
 * hacer UNA sola consulta de deduplicacion para todas las fuentes a la vez
 * en vez de una por fuente (con varias fuentes en paralelo, cada consulta
 * suya a Postgres se suma y puede acercar la funcion al limite de tiempo).
 */
export async function parseFeedCandidates(
  source: Pick<Source, "feedUrl">
): Promise<{ candidates: FeedCandidate[]; error: string | null }> {
  try {
    const feed = await parser.parseURL(source.feedUrl);
    const items = (feed.items || []) as FeedItem[];
    const candidates = items
      .map((item) => {
        const originalUrl = item.link;
        if (!originalUrl || !isHttpUrl(originalUrl)) return null;
        const guid = item.guid || item.id || originalUrl;
        return { item, guid };
      })
      .filter((c): c is FeedCandidate => c !== null);
    return { candidates, error: null };
  } catch (err) {
    return {
      candidates: [],
      error: err instanceof Error ? err.message : "Error desconocido al leer el feed",
    };
  }
}

/**
 * A partir de los candidatos ya parseados, descarta los que ya conocemos
 * (segun el set de guids conocidos —articulos y descartes previos—, calculado
 * una sola vez para todas las fuentes) y escribe noticias de los nuevos hasta
 * llegar al objetivo por fuente.
 */
export async function buildDraftsFromCandidates(
  candidates: FeedCandidate[],
  source: Pick<Source, "name" | "category">,
  existingGuids: Set<string>,
  knownGroups: KnownGroup[] = []
): Promise<DraftBatch> {
  const newCandidates = candidates.filter((c) => !existingGuids.has(c.guid));

  return buildUntilTarget(
    newCandidates,
    (c) => c.guid,
    (c) => buildDraft(c.item, source, knownGroups)
  );
}
