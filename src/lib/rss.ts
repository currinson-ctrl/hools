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

// Tope de ARTICULOS NUEVOS por fuente y pasada. Escribir un articulo es lo
// caro (mas tokens = mas tiempo), asi que es lo que hay que acotar para no
// superar el limite de tiempo de Vercel.
export const MAX_ARTICLES_PER_SOURCE = 4;

// Tope de items EXAMINADOS por fuente y pasada. Descartar un item fuera de
// tema es barato (Claude responde {"relevant": false} y punto), asi que se
// pueden mirar muchos mas de los que se escriben.
//
// Antes habia un unico tope de 4 que contaba las dos cosas juntas, y ahi
// estaba el fallo gordo: si los cuatro primeros items nuevos del feed eran
// fuera de tema, la pasada terminaba con cero noticias sin haber llegado a
// mirar la quinta — que podia ser justo la que se veia publicada en la web
// de la fuente. Y como los descartes no se guardaban, la siguiente pasada
// volvia a tropezar con los mismos cuatro.
export const MAX_EXAMINED_PER_SOURCE = 24;

// Margen de tiempo del rastreo completo. Se reparte entre todas las fuentes
// (van en paralelo): cuando se agota, cada fuente deja de examinar items
// nuevos y devuelve lo que lleve, en vez de que Vercel corte la funcion a
// medias y se pierda la pasada entera.
export const AGGREGATION_BUDGET_MS = Number(process.env.AGGREGATION_BUDGET_MS || 200_000);

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

/**
 * Que ha pasado con un item. Los tres casos se tratan distinto mas arriba:
 * el borrador se guarda, el descarte por tema se anota para no volver a
 * mirarlo, y el fallo NO se anota (se reintenta en la siguiente pasada).
 */
export type DraftOutcome =
  | { status: "draft"; draft: DraftArticle }
  | { status: "off-topic" }
  | { status: "failed"; message: string };

export async function buildDraft(
  item: FeedItem,
  source: Pick<Source, "name" | "category">,
  knownGroups: KnownGroup[] = [],
  /**
   * Fotos aparte de la destacada, cuando la fuente puede traer varias (un
   * tuit multi-foto). Se maquetan como galeria dentro del texto.
   */
  extraImageUrls: string[] = []
): Promise<DraftOutcome> {
  const originalUrl = item.link;
  if (!originalUrl || !isHttpUrl(originalUrl)) {
    return { status: "failed", message: "El item no trae un enlace valido" };
  }

  const originalTitle = stripHtml(item.title || "(sin titulo)");
  const guid = item.guid || item.id || originalUrl;

  const rawSnippet =
    item.contentSnippet || stripHtml(item.content || item.summary || "");
  const snippet = truncate(stripHtml(rawSnippet), MAX_SOURCE_CHARS);

  const outcome = await translateToSpanish({
    originalTitle,
    snippet,
    // Solo como respaldo: si el modelo devuelve una categoria que no
    // reconocemos, se queda la de la fuente.
    category: source.category,
  });
  if (outcome.status === "off-topic") {
    console.log(`Descartada por no encajar en el tema: "${originalTitle}"`);
    return outcome;
  }
  if (outcome.status === "failed") {
    console.error(`No se ha podido procesar "${originalTitle}": ${outcome.message}`);
    return outcome;
  }
  const translated = outcome.article;
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
    status: "draft",
    draft: {
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
    },
  };
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

/** Que le ha pasado a un item concreto de una fuente, con su identidad. */
export interface CandidateOutcome {
  guid: string;
  originalUrl: string;
  originalTitle: string;
  outcome: DraftOutcome;
}

/** Lo que ha dado de si una fuente en una pasada. */
export interface SourceHarvest {
  /** Items nuevos que traia la fuente (ni publicados ni descartados antes). */
  fresh: number;
  /** De esos, cuantos se han llegado a examinar en esta pasada. */
  examined: number;
  outcomes: CandidateOutcome[];
  /** Nuevos que se han quedado sin mirar: se cogen en la siguiente pasada. */
  left: number;
  /** Por que se ha parado antes de mirarlos todos (null = se miraron todos). */
  stoppedBy: "articulos" | "examinados" | "tiempo" | null;
}

/**
 * Recorre los candidatos nuevos de una fuente en tandas, hasta que se llena
 * el cupo de articulos, se llega al tope de examinados o se acaba el tiempo.
 *
 * La clave es que el cupo cuenta ARTICULOS ESCRITOS, no items mirados: un
 * item fuera de tema no consume cupo, asi que la pasada sigue bajando por el
 * feed hasta encontrar algo que valga. Antes se cortaba a los 4 primeros
 * items nuevos, hubieran dado articulos o no, y por eso una fuente que
 * acababa de publicar cuatro cosas fuera de tema devolvia cero pasada tras
 * pasada.
 *
 * Es generico porque lo usan igual las fuentes RSS y las cuentas de X.
 */
export async function harvestCandidates<T>(
  candidates: T[],
  options: {
    meta: (candidate: T) => Pick<CandidateOutcome, "guid" | "originalUrl" | "originalTitle">;
    build: (candidate: T) => Promise<DraftOutcome>;
    /** Instante (Date.now()) a partir del cual ya no se empiezan tandas nuevas. */
    deadline: number;
  }
): Promise<SourceHarvest> {
  const outcomes: CandidateOutcome[] = [];
  let examined = 0;
  let drafted = 0;
  let stoppedBy: SourceHarvest["stoppedBy"] = null;

  while (examined < candidates.length) {
    if (drafted >= MAX_ARTICLES_PER_SOURCE) {
      stoppedBy = "articulos";
      break;
    }
    if (examined >= MAX_EXAMINED_PER_SOURCE) {
      stoppedBy = "examinados";
      break;
    }
    if (Date.now() >= options.deadline) {
      stoppedBy = "tiempo";
      break;
    }

    // La tanda puede pasarse del cupo de articulos (si los seis de golpe
    // encajan salen seis en vez de cuatro): no se tiran, que ya estan
    // escritos y pagados.
    const size = Math.min(
      TRANSLATE_CONCURRENCY,
      candidates.length - examined,
      MAX_EXAMINED_PER_SOURCE - examined
    );
    const batch = candidates.slice(examined, examined + size);
    examined += size;

    const results = await Promise.all(
      batch.map(async (candidate) => ({
        ...options.meta(candidate),
        outcome: await options.build(candidate),
      }))
    );
    outcomes.push(...results);
    drafted += results.filter((r) => r.outcome.status === "draft").length;
  }

  return {
    fresh: candidates.length,
    examined,
    outcomes,
    left: candidates.length - examined,
    stoppedBy,
  };
}

/**
 * A partir de los candidatos ya parseados, descarta los ya vistos (segun el
 * set de guids conocidos —publicados y descartados—, calculado una sola vez
 * para todas las fuentes) y examina los nuevos dentro del cupo de la pasada.
 */
export async function harvestFeedCandidates(
  candidates: FeedCandidate[],
  source: Pick<Source, "name" | "category">,
  seenGuids: Set<string>,
  knownGroups: KnownGroup[] = [],
  deadline: number = Date.now() + AGGREGATION_BUDGET_MS
): Promise<SourceHarvest> {
  const fresh = candidates.filter((c) => !seenGuids.has(c.guid));

  return harvestCandidates(fresh, {
    deadline,
    meta: (c) => ({
      guid: c.guid,
      originalUrl: c.item.link || "",
      originalTitle: stripHtml(c.item.title || "(sin titulo)"),
    }),
    build: (c) => buildDraft(c.item, source, knownGroups),
  });
}
