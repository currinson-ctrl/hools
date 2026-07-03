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

  // Se rastrean todas las fuentes a la vez (cada una ya traduce sus propias
  // noticias con cierto paralelismo interno) para no acercarnos al limite
  // de 60s de las funciones serverless de Vercel (plan Hobby).
  const perSource = await Promise.all(
    sources.map(async (source) => ({
      source,
      ...(await fetchDraftsForSource(source)),
    }))
  );

  const results: Array<{
    source: string;
    fetched: number;
    created: number;
    error: string | null;
  }> = [];

  for (const { source, drafts, error } of perSource) {
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
