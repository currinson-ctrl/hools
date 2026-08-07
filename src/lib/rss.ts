import Parser from "rss-parser";
import type { Category, Source } from "@prisma/client";
import { CATEGORY_HASHTAGS, CATEGORY_IMAGE_HINT } from "./sources";
import { buildArticleHtml } from "./article-html";

export { escapeHtml } from "./article-html";
import { translateToSpanish } from "./translate";
import { searchRelatedImage } from "./image-search";
import { findMentionedGroups, linkMentionedGroups, type KnownGroup } from "./groups";

// Cuantas traducciones lanzar en paralelo por fuente. Vercel (plan Hobby)
// corta la funcion a los 60s, asi que preferimos varias llamadas a la vez
// en vez de una por una.
const TRANSLATE_CONCURRENCY = 6;

// Tope de items nuevos a procesar por fuente en cada pasada. Los articulos
// ahora son mas largos (mas tokens = mas tiempo de generacion), asi que hay
// que acotar el peor caso para no superar el limite de 60s de Vercel; si
// una fuente acumula mas noticias nuevas que esto, el resto se recogen en
// la siguiente pasada del cron (no se pierden, solo se retrasan).
export const MAX_ITEMS_PER_SOURCE = 4;

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

async function mapWithConcurrency<T, R>(
  items: T[],
  limit: number,
  fn: (item: T) => Promise<R>
): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const current = nextIndex++;
      results[current] = await fn(items[current]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, () => worker())
  );
  return results;
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
 * A partir de los candidatos ya parseados, descarta los que ya existen
 * (segun el set de guids conocidos, calculado una sola vez para todas las
 * fuentes) y traduce/genera como maximo MAX_ITEMS_PER_SOURCE de los nuevos.
 */
export async function buildDraftsFromCandidates(
  candidates: FeedCandidate[],
  source: Pick<Source, "name" | "category">,
  existingGuids: Set<string>,
  knownGroups: KnownGroup[] = []
): Promise<DraftArticle[]> {
  const newCandidates = candidates
    .filter((c) => !existingGuids.has(c.guid))
    .slice(0, MAX_ITEMS_PER_SOURCE);

  const drafts = await mapWithConcurrency(newCandidates, TRANSLATE_CONCURRENCY, (c) =>
    buildDraft(c.item, source, knownGroups)
  );

  return drafts.filter((d): d is DraftArticle => d !== null);
}
