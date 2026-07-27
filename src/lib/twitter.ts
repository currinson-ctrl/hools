import { TwitterApi } from "twitter-api-v2";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

function getClient(): TwitterApi {
  return new TwitterApi({
    appKey: getEnv("TWITTER_API_KEY"),
    appSecret: getEnv("TWITTER_API_SECRET"),
    accessToken: getEnv("TWITTER_ACCESS_TOKEN"),
    accessSecret: getEnv("TWITTER_ACCESS_SECRET"),
  });
}

export function isTwitterConfigured(): boolean {
  return Boolean(
    process.env.TWITTER_API_KEY &&
      process.env.TWITTER_API_SECRET &&
      process.env.TWITTER_ACCESS_TOKEN &&
      process.env.TWITTER_ACCESS_SECRET
  );
}

// Maximo de imagenes que admite un tuit en la API de X.
const MAX_TWEET_IMAGES = 4;

type MediaIds = [string] | [string, string] | [string, string, string] | [string, string, string, string];

function toMediaIds(ids: string[]): MediaIds {
  switch (ids.length) {
    case 1:
      return [ids[0]];
    case 2:
      return [ids[0], ids[1]];
    case 3:
      return [ids[0], ids[1], ids[2]];
    default:
      return [ids[0], ids[1], ids[2], ids[3]];
  }
}

export async function postTweet(
  text: string,
  link: string,
  imageUrls?: (string | null | undefined)[] | null
): Promise<string> {
  const client = getClient();
  const status = `${text}\n\n${link}`;

  const urls = (imageUrls || [])
    .filter((url): url is string => Boolean(url))
    .slice(0, MAX_TWEET_IMAGES);

  const mediaIds: string[] = [];
  for (const url of urls) {
    try {
      const response = await fetch(url);
      if (!response.ok) continue;
      const mimeType = response.headers.get("content-type") || "image/jpeg";
      const buffer = Buffer.from(await response.arrayBuffer());
      mediaIds.push(await client.v1.uploadMedia(buffer, { mimeType }));
    } catch (err) {
      console.error("No se pudo adjuntar una imagen al tuit:", err);
    }
  }

  const { data } = mediaIds.length
    ? await client.v2.tweet({ text: status, media: { media_ids: toMediaIds(mediaIds) } })
    : await client.v2.tweet(status);
  return data.id;
}
