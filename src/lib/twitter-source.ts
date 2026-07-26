import { TwitterApi } from "twitter-api-v2";
import type { Source } from "@prisma/client";
import { prisma } from "./db";
import { buildDraft, MAX_ITEMS_PER_SOURCE, type DraftArticle, type FeedItem } from "./rss";

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
  imageUrl: string | null;
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
      "media.fields": ["url", "type", "preview_image_url"],
    });

    const candidates: AccountCandidate[] = timeline.tweets.map((tweet) => {
      const media = timeline.includes.medias(tweet);
      const photo = media.find((m) => m.type === "photo" && m.url);
      const thumbnail = media.find((m) => m.preview_image_url);
      return {
        guid: `x:${tweet.id}`,
        tweetId: tweet.id,
        text: tweet.text,
        imageUrl: photo?.url || thumbnail?.preview_image_url || null,
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
  existingGuids: Set<string>
): Promise<DraftArticle[]> {
  const newCandidates = candidates
    .filter((c) => !existingGuids.has(c.guid))
    .slice(0, MAX_ITEMS_PER_SOURCE);

  const drafts = await Promise.all(
    newCandidates.map((c) => {
      const item: FeedItem = {
        link: `https://x.com/${username}/status/${c.tweetId}`,
        guid: c.guid,
        title: c.text,
        content: c.text,
        contentSnippet: c.text,
        enclosure: c.imageUrl ? { url: c.imageUrl } : undefined,
      };
      return buildDraft(item, source);
    })
  );

  return drafts.filter((d): d is DraftArticle => d !== null);
}
