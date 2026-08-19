import { prisma } from "@/lib/db";
import { clearSkippedItemsAction, retrySkippedItemAction } from "../actions";

// Cuantas se enseñan. Las mas recientes primero, que son las que explican el
// ultimo "0 noticias nuevas".
const PAGE_SIZE = 100;

/**
 * Lo que el filtro de tema ha descartado. Es la respuesta a "en la fuente veo
 * noticias publicadas pero el rastreo me dice 0": aqui se ve, una por una,
 * que items ha mirado y ha decidido que no encajan en el blog, con su enlace
 * al original para poder comprobarlo.
 *
 * Cada descarte se puede devolver a la cola de examen (si el filtro se paso
 * de estricto), y la lista entera se puede vaciar despues de tocar el
 * criterio del filtro.
 */
export default async function SkippedPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const params = await searchParams;
  const returnTo = "/dashboard/skipped";

  const [items, total] = await Promise.all([
    prisma.skippedItem.findMany({
      include: { source: true },
      orderBy: { createdAt: "desc" },
      take: PAGE_SIZE,
    }),
    prisma.skippedItem.count(),
  ]);

  return (
    <div>
      {params.error && <div className="banner error">{params.error}</div>}
      {params.notice && <div className="banner ok">{params.notice}</div>}

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>Descartadas por tema ({total})</h1>
        {total > 0 && (
          <form action={clearSkippedItemsAction}>
            <input type="hidden" name="returnTo" value={returnTo} />
            <button
              type="submit"
              title="Vacía la lista entera. Todas estas noticias se volverán a examinar en el próximo rastreo (y se volverán a descartar si el filtro sigue diciendo lo mismo)"
            >
              Vaciar la lista
            </button>
          </form>
        )}
      </div>

      <div className="card">
        <div className="excerpt">
          Estas noticias sí se han leído de las fuentes: el filtro de tema las ha
          mirado y ha decidido que no son de cultura ultra, desplazamientos ni moda
          casual. Se guardan aquí para no volver a examinarlas (antes se
          re-examinaban en cada rastreo y tapaban a las que venían detrás) y para que
          puedas comprobar si el filtro se está pasando de estricto. Si alguna sí
          valía, devuélvela con «Volver a examinarla».
        </div>
      </div>

      {items.length === 0 && (
        <div className="empty">
          Todavía no se ha descartado nada por tema.
        </div>
      )}

      {items.map((item) => (
        <div className="card" key={item.id}>
          <div className="meta">
            <span className="pill">fuera de tema</span>
            {item.source?.name ?? "fuente eliminada"} ·{" "}
            {new Date(item.createdAt).toLocaleString("es-ES")}
          </div>
          <h3>{item.originalTitle}</h3>
          <div className="excerpt">
            <a href={item.originalUrl} target="_blank" rel="noreferrer">
              {item.originalUrl}
            </a>
          </div>
          <div className="row">
            <form action={retrySkippedItemAction}>
              <input type="hidden" name="id" value={item.id} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                title="Quita esta noticia de la lista: el próximo rastreo la volverá a examinar"
              >
                Volver a examinarla
              </button>
            </form>
          </div>
        </div>
      ))}
    </div>
  );
}
