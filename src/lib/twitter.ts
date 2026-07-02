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

export async function postTweet(text: string, link: string): Promise<string> {
  const client = getClient();
  const status = `${text}\n\n${link}`;
  const { data } = await client.v2.tweet(status);
  return data.id;
}
