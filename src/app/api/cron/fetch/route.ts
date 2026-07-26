import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildDraftsFromCandidates, parseFeedCandidates } from "@/lib/rss";
import { buildDraftsFromAccountCandidates, parseAccountCandidates } from "@/lib/twitter-source";

export const dynamic = "force-dynamic";
// El plan Hobby normalmente limita a 60s, pero con Fluid Compute algunos
// proyectos permiten mas: se pide 280s (por debajo del limite duro de 300s
// de Pro) y si Vercel lo recorta a 60 no pasa nada, el codigo ya esta
// pensado para funcionar tambien dentro de ese margen mas estricto.
export const maxDuration = 280;

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

  // 1. Descargar y parsear todas las fuentes a la vez (rapido, sin tocar la
  // base ni llamar a Claude/Openverse todavia). Las fuentes RSS se parsean
  // como feed; las cuentas de X se leen via su API (de pago, por eso
  // cachean cursores en el propio Source, ver twitter-source.ts).
  const parsed = await Promise.all(
    sources.map(async (source) => {
      if (source.type === "X_ACCOUNT") {
        const { candidates, username, error } = await parseAccountCandidates(source);
        return { source, candidates, username, error };
      }
      const { candidates, error } = await parseFeedCandidates(source);
      return { source, candidates, username: null as string | null, error };
    })
  );

  // 2. Una unica consulta a la base para saber que guids ya existen, en vez
  // de una consulta por fuente (menos ida y vuelta a Postgres).
  const allGuids = parsed.flatMap((p) => p.candidates.map((c) => c.guid));
  const existingRows = (allGuids.length
    ? await prisma.article.findMany({
        where: { guid: { in: allGuids } },
        select: { guid: true },
      })
    : []) as { guid: string }[];
  const existingGuids = new Set(existingRows.map((r) => r.guid));

  // 3. Generar (traducir) solo los items nuevos, acotados por fuente, todas
  // las fuentes en paralelo.
  const perSource = await Promise.all(
    parsed.map(async ({ source, candidates, username, error }) => ({
      source,
      error,
      drafts: error
        ? []
        : source.type === "X_ACCOUNT"
          ? await buildDraftsFromAccountCandidates(
              candidates as Awaited<ReturnType<typeof parseAccountCandidates>>["candidates"],
              username!,
              source,
              existingGuids
            )
          : await buildDraftsFromCandidates(
              candidates as Awaited<ReturnType<typeof parseFeedCandidates>>["candidates"],
              source,
              existingGuids
            ),
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
