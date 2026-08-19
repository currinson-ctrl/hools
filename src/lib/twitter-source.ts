import { TwitterApi } from "twitter-api-v2";
import type { Source } from "@prisma/client";
import { prisma } from "./db";
import {
  AGGREGATION_BUDGET_MS,
  buildDraft,
  harvestCandidates,
  type DraftOutcome,
  type FeedItem,
  type SourceHarvest,
} from "./rss";
import type { KnownGroup } from "./groups";

// Maximo de fotos que admite un tuit en la API de X.
const MAX_TWEET_IMAGES = 4;

// Minimo permitido por la API de X para el timeline de un usuario (no se
// puede pedir menos). Mantenerlo bajo ademas ayuda a no gastar de mas del
// saldo de pago-por-uso.
const MAX_RESULTS = 5;

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
 * id numerico de usuario y el cursor since_id para no repetir llamadas de
 * pago innecesarias en cada pasada del cron.
 */
export async function parseAccountCandidates(
  source: SourceForAccount
): Promise<{
  candidates: AccountCandidate[];
  username: string;
  /** Tuit mas nuevo de la tanda; solo se guarda como cursor si se resuelven todos. */
  newestId: string | null;
  /**
   * La tanda ha venido llena (MAX_RESULTS tuits), señal de que la cuenta
   * publica mas rapido de lo que se lee y puede haber tuits mas antiguos que
   * no se han devuelto. Como la API entrega los mas NUEVOS a partir del
   * cursor y el cursor avanza, esos se quedan atras para siempre. No se puede
   * evitar sin leer mas tuits (mas gasto), asi que al menos se avisa.
   */
  pageFull: boolean;
  error: string | null;
}> {
  const username = source.feedUrl.replace(/^@/, "").trim();
  const client = getBearerClient();
  if (!client) {
    return {
      candidates: [],
      username,
      newestId: null,
      pageFull: false,
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
          pageFull: false,
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

    // El cursor NO se mueve aqui. Antes se adelantaba al tuit mas nuevo nada
    // mas leer el timeline, asi que todo lo que la pasada no llegase a
    // procesar (por cupo, por tiempo o por un fallo de Claude) quedaba detras
    // del since_id y no se volvia a leer nunca. Ahora lo guarda el agregador,
    // y solo si de verdad se ha resuelto toda la tanda.
    return {
      candidates,
      username,
      newestId: timeline.meta.newest_id ?? null,
      pageFull: timeline.tweets.length >= MAX_RESULTS,
      error: null,
    };
  } catch (err) {
    return {
      candidates: [],
      username,
      newestId: null,
      pageFull: false,
      error: err instanceof Error ? err.message : "Error desconocido al leer la cuenta de X",
    };
  }
}

/**
 * Adelanta el cursor since_id de una cuenta de X. Solo debe llamarse cuando
 * la pasada ha resuelto todos los tuits de la tanda (publicados o descartados
 * por tema): si queda alguno sin mirar o alguno ha fallado, mover el cursor
 * lo perderia para siempre.
 */
export async function commitAccountCursor(
  source: Pick<Source, "id" | "lastFetchedId">,
  newestId: string | null
): Promise<void> {
  if (!newestId || newestId === source.lastFetchedId) return;
  await prisma.source.update({ where: { id: source.id }, data: { lastFetchedId: newestId } });
}

/**
 * A partir de los candidatos ya leidos, descarta los ya vistos y examina los
 * nuevos dentro del cupo de la pasada, reutilizando el mismo pipeline de
 * filtro/redaccion que las fuentes RSS.
 */
export async function harvestAccountCandidates(
  candidates: AccountCandidate[],
  username: string,
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
      originalUrl: `https://x.com/${username}/status/${c.tweetId}`,
      originalTitle: c.text,
    }),
    build: async (c): Promise<DraftOutcome> => {
      const [mainImage, ...extraImages] = c.imageUrls;
      const item: FeedItem = {
        link: `https://x.com/${username}/status/${c.tweetId}`,
        guid: c.guid,
        title: c.text,
        content: c.text,
        contentSnippet: c.text,
        enclosure: mainImage ? { url: mainImage } : undefined,
      };
      const outcome = await buildDraft(item, source, knownGroups, extraImages);
      if (outcome.status !== "draft") return outcome;
      return {
        status: "draft",
        draft: {
          ...outcome.draft,
          videoUrl: c.videoUrl,
          ...(extraImages.length ? { extraImageUrls: extraImages } : {}),
        },
      };
    },
  });
}
