import { TwitterApi } from "twitter-api-v2";
import type { Source } from "@prisma/client";
import { prisma } from "./db";
import {
  buildDraft,
  buildUntilTarget,
  type DraftArticle,
  type DraftBatch,
  type FeedItem,
} from "./rss";
import type { KnownGroup } from "./groups";

// Maximo de fotos que admite un tuit en la API de X.
const MAX_TWEET_IMAGES = 4;

// Cuantos tuits se piden del timeline de una cuenta en cada pasada (la API
// admite de 5 a 100). Tiene que ser bastante mayor que el objetivo de
// noticias por fuente: entre los que ya estan en la cola y los que tumba el
// filtro de tema, con una ventana pequeña una cuenta activa se quedaba en
// una o ninguna noticia por rastreo. Cada pasada es UNA llamada, asi que lo
// que encarece subirlo es el numero de tuits leidos, no el de peticiones.
const MAX_RESULTS = 20;

function getBearerClient(): TwitterApi | null {
  const token = process.env.TWITTER_BEARER_TOKEN;
  if (!token) return null;
  return new TwitterApi(token);
}

export function isTwitterReadConfigured(): boolean {
  return Boolean(process.env.TWITTER_BEARER_TOKEN);
}

export interface AccountCandidate {
  guid: string;
  tweetId: string;
  text: string;
  // Todas las fotos adjuntas al tuit, en orden (puede estar vacio).
  imageUrls: string[];
  // mp4 del tuit si lleva video (la miniatura va en imageUrls).
  videoUrl: string | null;
}

type SourceForAccount = Pick<Source, "id" | "feedUrl" | "externalId" | "lastFetchedId">;

/**
 * Lee los tuits recientes (sin RT ni respuestas) de la cuenta de X guardada
 * en source.feedUrl (el @handle, sin arroba). Cachea en la propia fuente el
 * id numerico de usuario para no repetir la busqueda por username en cada
 * pasada (es una llamada de pago).
 *
 * OJO con el cursor: aqui NO se toca. Se devuelve el newestId y es
 * aggregate.ts quien decide si adelantarlo, porque solo es seguro hacerlo
 * cuando se ha procesado todo lo que trae esta ventana (ver
 * advanceAccountCursor).
 */
export async function parseAccountCandidates(
  source: SourceForAccount
): Promise<{
  candidates: AccountCandidate[];
  username: string;
  newestId: string | null;
  error: string | null;
}> {
  const username = source.feedUrl.replace(/^@/, "").trim();
  const client = getBearerClient();
  if (!client) {
    return {
      candidates: [],
      username,
      newestId: null,
      error: "Falta configurar TWITTER_BEARER_TOKEN",
    };
  }

  try {
    let userId = source.externalId;
    if (!userId) {
      const user = await client.v2.userByUsername(username);
      if (!user.data) {
        return {
          candidates: [],
          username,
          newestId: null,
          error: `Cuenta de X no encontrada: @${username}`,
        };
      }
      userId = user.data.id;
      await prisma.source.update({ where: { id: source.id }, data: { externalId: userId } });
    }

    const timeline = await client.v2.userTimeline(userId, {
      exclude: ["retweets", "replies"],
      max_results: MAX_RESULTS,
      since_id: source.lastFetchedId || undefined,
      "tweet.fields": ["attachments"],
      expansions: ["attachments.media_keys"],
      "media.fields": ["url", "type", "preview_image_url", "variants"],
    });

    const candidates: AccountCandidate[] = timeline.tweets.map((tweet) => {
      const media = timeline.includes.medias(tweet);
      const photos = media
        .filter((m) => m.type === "photo" && m.url)
        .map((m) => m.url as string);
      const thumbnail = media.find((m) => m.preview_image_url)?.preview_image_url;
      // De un tuit con video se guarda el mp4 de mayor bitrate (los feeds
      // HLS .m3u8 no le valen a la API de Instagram).
      const videoUrl =
        media
          .find((m) => m.type === "video" || m.type === "animated_gif")
          ?.variants?.filter((v) => v.content_type === "video/mp4" && v.url)
          .sort((a, b) => (b.bit_rate ?? 0) - (a.bit_rate ?? 0))[0]?.url ?? null;
      return {
        guid: `x:${tweet.id}`,
        tweetId: tweet.id,
        text: tweet.text,
        imageUrls: photos.length ? photos : thumbnail ? [thumbnail] : [],
        videoUrl,
      };
    });

    return {
      candidates,
      username,
      newestId: timeline.meta.newest_id ?? null,
      error: null,
    };
  } catch (err) {
    return {
      candidates: [],
      username,
      newestId: null,
      error: err instanceof Error ? err.message : "Error desconocido al leer la cuenta de X",
    };
  }
}

/**
 * Adelanta el cursor since_id de una cuenta de X.
 *
 * Solo hay que llamarlo cuando NO ha quedado atraso en la ventana leida.
 * El timeline viene del mas nuevo al mas viejo, asi que lo que se deja sin
 * procesar es siempre lo mas antiguo de la tanda: si el cursor saltara al
 * tuit mas nuevo, esos quedarian por debajo y no se volverian a pedir NUNCA
 * (es exactamente lo que hacia antes, y por eso "Buscar noticias ahora" se
 * saltaba dias enteros de publicaciones de una cuenta activa).
 *
 * Mientras quede atraso, el cursor se queda donde estaba y la siguiente
 * pasada vuelve a leer la misma ventana: sale una peticion, y los tuits ya
 * vistos se descartan al momento por guid (los publicados como Article, los
 * fuera de tema como SkippedItem), sin gastar ni una llamada a Claude.
 */
export async function advanceAccountCursor(
  source: Pick<Source, "id" | "lastFetchedId">,
  newestId: string | null
): Promise<void> {
  if (!newestId || newestId === source.lastFetchedId) return;
  await prisma.source.update({
    where: { id: source.id },
    data: { lastFetchedId: newestId },
  });
}

/**
 * A partir de los candidatos ya leidos, descarta los que ya conocemos y
 * escribe noticias de los nuevos hasta llegar a TARGET_ITEMS_PER_SOURCE,
 * reutilizando el mismo pipeline de redaccion/formato que las fuentes RSS.
 */
export async function buildDraftsFromAccountCandidates(
  candidates: AccountCandidate[],
  username: string,
  source: Pick<Source, "name" | "category">,
  existingGuids: Set<string>,
  knownGroups: KnownGroup[] = []
): Promise<DraftBatch> {
  const newCandidates = candidates.filter((c) => !existingGuids.has(c.guid));

  return buildUntilTarget(
    newCandidates,
    (c) => c.guid,
    async (c): Promise<DraftArticle | null> => {
      const [mainImage, ...extraImages] = c.imageUrls;
      const item: FeedItem = {
        link: `https://x.com/${username}/status/${c.tweetId}`,
        guid: c.guid,
        title: c.text,
        content: c.text,
        contentSnippet: c.text,
        enclosure: mainImage ? { url: mainImage } : undefined,
      };
      const draft = await buildDraft(item, source, knownGroups, extraImages);
      if (!draft) return draft;
      return {
        ...draft,
        videoUrl: c.videoUrl,
        ...(extraImages.length ? { extraImageUrls: extraImages } : {}),
      };
    }
  );
}
