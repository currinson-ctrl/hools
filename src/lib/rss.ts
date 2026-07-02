import Parser from "rss-parser";
import type { Category, Source } from "@prisma/client";
import { CATEGORY_HASHTAGS } from "./sources";

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
  imageUrl: string | null;
  tags: string;
  category: Category;
}

const MAX_EXCERPT_CHARS = 480;
const MAX_TWEET_CHARS = 280;

function stripHtml(input: string): string {
  return input
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
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

type FeedItem = Parser.Item & {
  id?: string;
  "content:encoded"?: string;
  "media:content"?: { $?: { url?: string } } | { $?: { url?: string } }[];
};

function extractImage(item: FeedItem): string | null {
  const enclosure = item.enclosure as { url?: string } | undefined;
  if (enclosure?.url && isHttpUrl(enclosure.url)) return enclosure.url;

  const mediaContent = item["media:content"];
  const mediaUrl = Array.isArray(mediaContent)
    ? mediaContent[0]?.$?.url
    : mediaContent?.$?.url;
  if (mediaUrl && isHttpUrl(mediaUrl)) return mediaUrl;

  const html = item["content:encoded"] || item.content || "";
  const match = /<img[^>]+src=["']([^"']+)["']/i.exec(html);
  if (match && isHttpUrl(match[1])) return match[1];

  return null;
}

function buildDraft(
  item: FeedItem,
  source: Pick<Source, "name" | "category">
): DraftArticle | null {
  const originalUrl = item.link;
  if (!originalUrl || !isHttpUrl(originalUrl)) return null;

  const originalTitle = stripHtml(item.title || "(sin titulo)");
  const guid = item.guid || item.id || originalUrl;

  const rawSnippet =
    item.contentSnippet || stripHtml(item.content || item.summary || "");
  const snippet = truncate(stripHtml(rawSnippet), MAX_EXCERPT_CHARS);

  const safeSnippet = escapeHtml(snippet);
  const safeSourceName = escapeHtml(source.name);
  const safeUrl = escapeHtml(originalUrl);

  const excerpt = [
    `<p>${safeSnippet}</p>`,
    `<p><em>Fuente: <a href="${safeUrl}" target="_blank" rel="noopener noreferrer nofollow">${safeSourceName}</a></em></p>`,
  ].join("\n");

  const hashtags = CATEGORY_HASHTAGS[source.category].join(" ");
  const tweetText = truncate(
    `${originalTitle}\n\n${hashtags}`,
    MAX_TWEET_CHARS - 24 // deja hueco para el enlace que se añade al publicar
  );

  return {
    guid,
    originalUrl,
    originalTitle,
    title: originalTitle,
    excerpt,
    tweetText,
    imageUrl: extractImage(item),
    tags: [source.category, source.name].join(","),
    category: source.category,
  };
}

export async function fetchDraftsForSource(
  source: Pick<Source, "name" | "category" | "feedUrl">
): Promise<{ drafts: DraftArticle[]; error: string | null }> {
  try {
    const feed = await parser.parseURL(source.feedUrl);
    const drafts = (feed.items || [])
      .map((item) => buildDraft(item as FeedItem, source))
      .filter((d): d is DraftArticle => d !== null);
    return { drafts, error: null };
  } catch (err) {
    return {
      drafts: [],
      error: err instanceof Error ? err.message : "Error desconocido al leer el feed",
    };
  }
}
