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

export async function postTweet(
  text: string,
  link: string,
  imageUrl?: string | null
): Promise<string> {
  const client = getClient();
  const status = `${text}\n\n${link}`;

  let mediaId: string | null = null;
  if (imageUrl) {
    try {
      const response = await fetch(imageUrl);
      if (response.ok) {
        const mimeType = response.headers.get("content-type") || "image/jpeg";
        const buffer = Buffer.from(await response.arrayBuffer());
        mediaId = await client.v1.uploadMedia(buffer, { mimeType });
      }
    } catch (err) {
      console.error("No se pudo adjuntar la imagen al tuit:", err);
    }
  }

  const { data } = mediaId
    ? await client.v2.tweet({ text: status, media: { media_ids: [mediaId] } })
    : await client.v2.tweet(status);
  return data.id;
}
