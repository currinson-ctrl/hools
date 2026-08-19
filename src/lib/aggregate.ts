import { prisma } from "./db";
import { harvestFeedCandidates, parseFeedCandidates, AGGREGATION_BUDGET_MS } from "./rss";
import {
  commitAccountCursor,
  harvestAccountCandidates,
  parseAccountCandidates,
} from "./twitter-source";
import { parseAliases, type KnownGroup } from "./groups";

/** Motivo con el que se anota un item descartado. De momento solo hay uno. */
export const SKIP_REASON_OFF_TOPIC = "OFF_TOPIC";

export interface AggregationSourceResult {
  source: string;
  /** Items que traia la fuente en esta lectura. */
  read: number;
  /** De esos, cuantos no se habian visto nunca. */
  fresh: number;
  /** De los nuevos, cuantos se han llegado a examinar en esta pasada. */
  examined: number;
  /** Noticias nuevas guardadas en la cola. */
  created: number;
  /** Examinados y descartados por no encajar en el tema del blog. */
  offTopic: number;
  /** Examinados pero fallidos (no cuentan como vistos: se reintentan). */
  failed: number;
  /** Nuevos que se han quedado sin mirar por cupo o por tiempo. */
  left: number;
  /** Ejemplo de fallo de item, para poder enseñar algo concreto. */
  itemError: string | null;
  /** Fallo de la fuente entera (feed caido, token de X, etc.). */
  error: string | null;
  /**
   * Solo cuentas de X: la lectura ha venido llena, asi que la cuenta publica
   * mas rapido de lo que se lee y puede haber tuits que no lleguen nunca.
   */
  mayBeMissingTweets: boolean;
}

export interface AggregationResult {
  sourcesProcessed: number;
  createdTotal: number;
  /** Suma de descartes por tema: la explicacion mas habitual de un "0". */
  offTopicTotal: number;
  /** Suma de items que fallaron al procesarse. Esto SI es un problema. */
  failedTotal: number;
  /** Suma de items nuevos que se han quedado para la proxima pasada. */
  leftTotal: number;
  /** Items nuevos encontrados en todas las fuentes. */
  freshTotal: number;
  /** Fuentes que no se han podido leer siquiera. */
  sourcesWithError: number;
  /** Cuentas de X que publican mas rapido de lo que se leen. */
  sourcesMaybeMissingTweets: string[];
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
 *
 * Devuelve el detalle de lo que ha pasado con cada fuente —cuanto se ha
 * leido, cuanto era nuevo, cuanto se ha descartado por tema, cuanto ha
 * fallado y cuanto queda pendiente— porque un "0 noticias nuevas" a secas no
 * se puede interpretar: no distingue entre "no habia nada", "habia y no
 * encaja" y "no he podido ni mirarlo".
 */
export async function runAggregation(): Promise<AggregationResult> {
  const deadline = Date.now() + AGGREGATION_BUDGET_MS;
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
        const { candidates, username, newestId, pageFull, error } =
          await parseAccountCandidates(source);
        return { source, candidates, username, newestId, pageFull, error };
      }
      const { candidates, error } = await parseFeedCandidates(source);
      return {
        source,
        candidates,
        username: null as string | null,
        newestId: null as string | null,
        pageFull: false,
        error,
      };
    })
  );

  // 2. Una unica consulta a la base para saber que guids ya se han visto, en
  // vez de una consulta por fuente (menos ida y vuelta a Postgres). "Visto"
  // son las dos cosas: lo que ya esta en la cola/publicado, y lo que se
  // descarto por tema en pasadas anteriores. Sin lo segundo, cada pasada
  // volvia a examinar (y a pagar) los mismos descartes y nunca bajaba mas
  // por el feed.
  const allGuids = parsed.flatMap((p) => p.candidates.map((c) => c.guid));
  const [existingRows, skippedRows] = allGuids.length
    ? await Promise.all([
        prisma.article.findMany({ where: { guid: { in: allGuids } }, select: { guid: true } }),
        prisma.skippedItem.findMany({ where: { guid: { in: allGuids } }, select: { guid: true } }),
      ])
    : [[] as { guid: string }[], [] as { guid: string }[]];
  const seenGuids = new Set([...existingRows, ...skippedRows].map((r) => r.guid));

  // 3. Examinar los items nuevos de cada fuente, todas en paralelo y dentro
  // del presupuesto de tiempo comun.
  const perSource = await Promise.all(
    parsed.map(async ({ source, candidates, username, newestId, pageFull, error }) => ({
      source,
      error,
      newestId,
      pageFull,
      harvest: error
        ? null
        : source.type === "X_ACCOUNT"
          ? await harvestAccountCandidates(
              candidates as Awaited<ReturnType<typeof parseAccountCandidates>>["candidates"],
              username!,
              source,
              seenGuids,
              knownGroups,
              deadline
            )
          : await harvestFeedCandidates(
              candidates as Awaited<ReturnType<typeof parseFeedCandidates>>["candidates"],
              source,
              seenGuids,
              knownGroups,
              deadline
            ),
    }))
  );

  const results: AggregationSourceResult[] = [];

  for (const { source, harvest, error, newestId, pageFull } of perSource) {
    let created = 0;
    let offTopic = 0;
    let failed = 0;
    let itemError: string | null = null;
    const skips: { guid: string; originalUrl: string; originalTitle: string }[] = [];

    for (const item of harvest?.outcomes ?? []) {
      if (item.outcome.status === "off-topic") {
        offTopic += 1;
        skips.push({
          guid: item.guid,
          originalUrl: item.originalUrl,
          originalTitle: item.originalTitle,
        });
        continue;
      }

      if (item.outcome.status === "failed") {
        failed += 1;
        itemError = itemError ?? item.outcome.message;
        continue;
      }

      const draft = item.outcome.draft;
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

    // Los descartes por tema se anotan para no volver a examinarlos. Los
    // fallos no: esos tienen que poder reintentarse.
    if (skips.length) {
      await prisma.skippedItem.createMany({
        data: skips.map((s) => ({ ...s, sourceId: source.id, reason: SKIP_REASON_OFF_TOPIC })),
        skipDuplicates: true,
      });
    }

    // El cursor de una cuenta de X solo avanza si la tanda entera ha quedado
    // resuelta. Si algo se ha quedado sin mirar o ha fallado, se deja donde
    // estaba para poder volver a leer esos tuits.
    if (source.type === "X_ACCOUNT" && harvest && harvest.left === 0 && failed === 0) {
      await commitAccountCursor(source, newestId);
    }

    results.push({
      source: source.name,
      read: parsed.find((p) => p.source.id === source.id)?.candidates.length ?? 0,
      fresh: harvest?.fresh ?? 0,
      examined: harvest?.examined ?? 0,
      created,
      offTopic,
      failed,
      left: harvest?.left ?? 0,
      itemError,
      error,
      mayBeMissingTweets: source.type === "X_ACCOUNT" && pageFull,
    });
  }

  const sum = (pick: (r: AggregationSourceResult) => number) =>
    results.reduce((total, r) => total + pick(r), 0);

  return {
    sourcesProcessed: sources.length,
    createdTotal: sum((r) => r.created),
    offTopicTotal: sum((r) => r.offTopic),
    failedTotal: sum((r) => r.failed),
    leftTotal: sum((r) => r.left),
    freshTotal: sum((r) => r.fresh),
    sourcesWithError: results.filter((r) => r.error).length,
    sourcesMaybeMissingTweets: results.filter((r) => r.mayBeMissingTweets).map((r) => r.source),
    results,
  };
}
