import { Category, SourceType, type Source } from "@prisma/client";
import { prisma } from "./db";

/**
 * Noticias escritas a mano en el panel (/dashboard/nueva).
 *
 * Todo articulo cuelga de una Source, asi que las manuales cuelgan de esta,
 * que no es un feed: su "feedUrl" es un marcador que no se lee nunca y nace
 * pausada para que el rastreo la ignore aunque alguien la active por error
 * (ver runAggregation, que solo lee las activas). Se oculta del listado de
 * fuentes: no hay nada que configurar en ella.
 */
export const MANUAL_SOURCE_FEED_URL = "manual://hools";
export const MANUAL_SOURCE_NAME = "Redacción Hools";

export function isManualSource(source: Pick<Source, "feedUrl">): boolean {
  return source.feedUrl === MANUAL_SOURCE_FEED_URL;
}

/** Prefijo del guid de las noticias manuales, para reconocerlas de un vistazo. */
export const MANUAL_GUID_PREFIX = "manual:";

export function isManualArticle(article: { guid: string }): boolean {
  return article.guid.startsWith(MANUAL_GUID_PREFIX);
}

/**
 * Devuelve la fuente de las noticias manuales, creandola la primera vez. No
 * se siembra en prisma/seed.ts para que exista igual en instalaciones que ya
 * estaban corriendo antes de que hubiera formulario manual.
 */
export async function getManualSource(): Promise<Source> {
  const existing = await prisma.source.findUnique({
    where: { feedUrl: MANUAL_SOURCE_FEED_URL },
  });
  if (existing) return existing;

  return prisma.source.create({
    data: {
      name: MANUAL_SOURCE_NAME,
      feedUrl: MANUAL_SOURCE_FEED_URL,
      type: SourceType.RSS,
      category: Category.AFICION,
      active: false,
    },
  });
}
