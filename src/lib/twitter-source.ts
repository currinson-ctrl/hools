import { TwitterApi } from "twitter-api-v2";
import type { Source } from "@prisma/client";
import { prisma } from "./db";
import { buildDraft, MAX_ITEMS_PER_SOURCE, type DraftArticle, type FeedItem } from "./rss";
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
): Promise<{ candidates: AccountCandidate[]; username: string; error: string | null }> {
  const username = source.feedUrl.replace(/^@/, "").trim();
  const client = getBearerClient();
  if (!client) {
    return { candidates: [], username, error: "Falta configurar TWITTER_BEARER_TOKEN" };
  }

  try {
    let userId = source.externalId;
    if (!userId) {
      const user = await client.v2.userByUsername(username);
      if (!user.data) {
        return { candidates: [], username, error: `Cuenta de X no encontrada: @${username}` };
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

    const newestId = timeline.meta.newest_id;
    if (newestId && newestId !== source.lastFetchedId) {
      await prisma.source.update({ where: { id: source.id }, data: { lastFetchedId: newestId } });
    }

    return { candidates, username, error: null };
  } catch (err) {
    return {
      candidates: [],
      username,
      error: err instanceof Error ? err.message : "Error desconocido al leer la cuenta de X",
    };
  }
}

/**
 * A partir de los candidatos ya leidos, descarta los que ya existen y genera
 * (traduce) como maximo MAX_ITEMS_PER_SOURCE de los nuevos, reutilizando el
 * mismo pipeline de traduccion/formato que las fuentes RSS.
 */
export async function buildDraftsFromAccountCandidates(
  candidates: AccountCandidate[],
  username: string,
  source: Pick<Source, "name" | "category">,
  existingGuids: Set<string>,
  knownGroups: KnownGroup[] = []
): Promise<DraftArticle[]> {
  const newCandidates = candidates
    .filter((c) => !existingGuids.has(c.guid))
    .slice(0, MAX_ITEMS_PER_SOURCE);

  const drafts = await Promise.all(
    newCandidates.map(async (c): Promise<DraftArticle | null> => {
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
    })
  );

  return drafts.filter((d): d is DraftArticle => d !== null);
}
