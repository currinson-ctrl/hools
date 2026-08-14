import { prisma } from "./db";
import { buildDraftsFromCandidates, parseFeedCandidates } from "./rss";
import {
  advanceAccountCursor,
  buildDraftsFromAccountCandidates,
  parseAccountCandidates,
} from "./twitter-source";
import { parseAliases, type KnownGroup } from "./groups";

export interface AggregationSourceResult {
  source: string;
  fetched: number;
  created: number;
  /** Candidatos nuevos que se han quedado para la siguiente pasada. */
  pending: number;
  error: string | null;
}

export interface AggregationResult {
  sourcesProcessed: number;
  createdTotal: number;
  /** Fuentes que aun tienen material nuevo sin mirar. */
  sourcesWithPending: number;
  results: AggregationSourceResult[];
}

/**
 * El rastreo completo: lee todas las fuentes activas y deja las noticias
 * nuevas en la cola de revision (PENDING).
 *
 * Vive aqui y no en la ruta HTTP porque tiene dos entradas: el endpoint
 * /api/cron/fetch (que llama el workflow de GitHub) y el boton "Buscar
 * noticias ahora" del dashboard, que lo ejecuta en el mismo proceso en vez de
 * pegarse una llamada HTTP a si mismo.
 */
export async function runAggregation(): Promise<AggregationResult> {
  const sources = await prisma.source.findMany({ where: { active: true } });
  const groupRows = await prisma.group.findMany({ where: { active: true } });
  const knownGroups: KnownGroup[] = groupRows.map((g) => ({
    name: g.name,
    aliases: parseAliases(g.aliases),
    handle: g.handle,
  }));

  // 1. Descargar y parsear todas las fuentes a la vez (rapido, sin tocar la
  // base ni llamar a Claude/Openverse todavia). Las fuentes RSS se parsean
  // como feed; las cuentas de X se leen via su API (de pago, por eso
  // cachean cursores en el propio Source, ver twitter-source.ts).
  const parsed = await Promise.all(
    sources.map(async (source) => {
      if (source.type === "X_ACCOUNT") {
        const { candidates, username, newestId, error } = await parseAccountCandidates(source);
        return { source, candidates, username, newestId, error };
      }
      const { candidates, error } = await parseFeedCandidates(source);
      return {
        source,
        candidates,
        username: null as string | null,
        newestId: null as string | null,
        error,
      };
    })
  );

  // 2. Una unica consulta a la base para saber que guids ya conocemos, en vez
  // de una consulta por fuente (menos ida y vuelta a Postgres). Cuentan tanto
  // los que ya son noticia como los que el filtro de tema tumbo en pasadas
  // anteriores: releer una fuente es barato, pero volver a pasar por Claude
  // lo que ya se descarto una vez no.
  const allGuids = parsed.flatMap((p) => p.candidates.map((c) => c.guid));
  const [existingRows, skippedRows] = allGuids.length
    ? await Promise.all([
        prisma.article.findMany({
          where: { guid: { in: allGuids } },
          select: { guid: true },
        }),
        prisma.skippedItem.findMany({
          where: { guid: { in: allGuids } },
          select: { guid: true },
        }),
      ])
    : [[] as { guid: string }[], [] as { guid: string }[]];
  const existingGuids = new Set(
    [...existingRows, ...skippedRows].map((r) => r.guid)
  );

  // 3. Escribir noticias solo de los items nuevos, hasta el objetivo por
  // fuente, todas las fuentes en paralelo.
  const perSource = await Promise.all(
    parsed.map(async ({ source, candidates, username, newestId, error }) => {
      const batch = error
        ? { drafts: [], skippedGuids: [], pending: 0 }
        : source.type === "X_ACCOUNT"
          ? await buildDraftsFromAccountCandidates(
              candidates as Awaited<ReturnType<typeof parseAccountCandidates>>["candidates"],
              username!,
              source,
              existingGuids,
              knownGroups
            )
          : await buildDraftsFromCandidates(
              candidates as Awaited<ReturnType<typeof parseFeedCandidates>>["candidates"],
              source,
              existingGuids,
              knownGroups
            );
      return { source, error, newestId, ...batch };
    })
  );

  const results: AggregationSourceResult[] = [];

  for (const { source, drafts, skippedGuids, pending, newestId, error } of perSource) {
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
          igCaption: draft.igCaption,
          imageUrl: draft.imageUrl,
          extraImageUrls: draft.extraImageUrls?.length ? draft.extraImageUrls.join(",") : null,
          videoUrl: draft.videoUrl ?? null,
          tags: draft.tags,
        },
      });
      created += 1;
    }

    // Los descartados por tema se apuntan para no reescribirlos en cada
    // pasada (skipDuplicates porque dos fuentes pueden traer el mismo item).
    if (skippedGuids.length) {
      await prisma.skippedItem.createMany({
        data: skippedGuids.map((guid) => ({ guid, sourceId: source.id })),
        skipDuplicates: true,
      });
    }

    // El cursor de las cuentas de X solo avanza cuando esta ventana se ha
    // mirado entera. Si ha quedado atraso, se deja donde estaba para poder
    // volver a por el en la siguiente pasada (ver advanceAccountCursor).
    if (source.type === "X_ACCOUNT" && !error && pending === 0) {
      await advanceAccountCursor(source, newestId);
    }

    results.push({ source: source.name, fetched: drafts.length, created, pending, error });
  }

  return {
    sourcesProcessed: sources.length,
    createdTotal: results.reduce((sum, r) => sum + r.created, 0),
    sourcesWithPending: results.filter((r) => r.pending > 0).length,
    results,
  };
}
