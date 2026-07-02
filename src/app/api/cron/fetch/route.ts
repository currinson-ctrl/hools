import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { fetchDraftsForSource } from "@/lib/rss";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const sources = await prisma.source.findMany({ where: { active: true } });

  const results: Array<{
    source: string;
    fetched: number;
    created: number;
    error: string | null;
  }> = [];

  for (const source of sources) {
    const { drafts, error } = await fetchDraftsForSource(source);
    let created = 0;

    for (const draft of drafts) {
      const exists = await prisma.article.findUnique({
        where: { guid: draft.guid },
        select: { id: true },
      });
      if (exists) continue;

      await prisma.article.create({
        data: {
          sourceId: source.id,
          category: draft.category,
          guid: draft.guid,
          originalUrl: draft.originalUrl,
          originalTitle: draft.originalTitle,
          title: draft.title,
          excerpt: draft.excerpt,
          tweetText: draft.tweetText,
          imageUrl: draft.imageUrl,
          tags: draft.tags,
        },
      });
      created += 1;
    }

    results.push({ source: source.name, fetched: drafts.length, created, error });
  }

  return NextResponse.json({
    sourcesProcessed: sources.length,
    createdTotal: results.reduce((sum, r) => sum + r.created, 0),
    results,
  });
}
