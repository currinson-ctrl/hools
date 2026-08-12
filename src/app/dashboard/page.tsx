import Link from "next/link";
import { prisma } from "@/lib/db";
import { ArticleStatus } from "@prisma/client";
import { CATEGORY_LABEL } from "@/lib/sources";
import { isInstagramConfigured } from "@/lib/instagram";
import { isFacebookConfigured } from "@/lib/facebook";
import {
  approveArticleAction,
  backfillPublishedArticlesAction,
  cleanupOffTopicAction,
  fetchNowAction,
  fixTitlesAction,
  rejectArticleAction,
  restructurePublishedArticlesAction,
  unpublishArticleAction,
} from "./actions";

// Igual que /api/cron/fetch: si Fluid Compute lo permite, mejor tener
// margen (el rastreo y la limpieza llaman a Claude varias veces).
export const maxDuration = 280;

const STATUS_LABEL: Record<ArticleStatus, string> = {
  PENDING: "Pendientes",
  APPROVED: "Aprobados",
  REJECTED: "Rechazados",
  PUBLISHED: "Publicados",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string; notice?: string }>;
}) {
  const params = await searchParams;
  const requested = params.status as ArticleStatus | undefined;
  const status: ArticleStatus =
    requested && requested in STATUS_LABEL ? requested : "PENDING";
  const returnTo = `/dashboard?status=${status}`;

  const articles = await prisma.article.findMany({
    where: { status },
    include: { source: true },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <div>
      {params.error && <div className="banner error">{params.error}</div>}
      {params.notice && <div className="banner ok">{params.notice}</div>}

      <div className="row" style={{ justifyContent: "space-between", marginBottom: 16 }}>
        <h1 style={{ fontSize: 18, margin: 0 }}>{STATUS_LABEL[status]}</h1>
        <div className="row" style={{ gap: 8 }}>
          {status === "PENDING" && (
            <>
              <form action={fetchNowAction}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <button
                  className="primary"
                  type="submit"
                  title="Lee ahora mismo todas las fuentes activas y añade a esta cola las noticias que no estuvieran ya. Tarda un rato: hay que leer las fuentes y escribir cada noticia nueva"
                >
                  Buscar noticias ahora
                </button>
              </form>
              <form action={cleanupOffTopicAction}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" title="Rechaza las pendientes que no sean de aficion/ultras/desplazamientos/moda casual">
                  Limpiar fuera de tema
                </button>
              </form>
            </>
          )}
          {status !== "REJECTED" && (
            <form action={fixTitlesAction}>
              <input type="hidden" name="status" value={status} />
              <input type="hidden" name="returnTo" value={returnTo} />
              <button
                type="submit"
                title="Repasa los titulares de esta pestaña que caen en el 'cuando' o se pasan de largo: les quita el 'cuando' y, si aún así no cumplen, los reescribe con lo que cuenta el artículo. En los publicados también los cambia en Shopify (la URL no cambia). Va por tandas: púlsalo hasta que no queden"
              >
                Arreglar titulares
              </button>
            </form>
          )}
          {status === "PUBLISHED" && (
            <>
              <form action={restructurePublishedArticlesAction}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" title="Remaqueta los artículos ya publicados con la estructura nueva: entradilla, ladillos, cita destacada, galería y cierre de tienda. Va por tandas: púlsalo hasta que no queden">
                  Remaquetar publicados
                </button>
              </form>
              <form action={backfillPublishedArticlesAction}>
                <input type="hidden" name="returnTo" value={returnTo} />
                <button type="submit" title="Añade a los artículos ya publicados el cierre con enlace a la tienda, y rellena en Shopify el resumen y el texto alternativo de la imagen">
                  Añadir cierre de tienda a los publicados
                </button>
              </form>
            </>
          )}
        </div>
      </div>

      {articles.length === 0 && (
        <div className="empty">
          No hay artículos {STATUS_LABEL[status].toLowerCase()} ahora mismo.
          {status === "PENDING" && (
            <>
              <br />
              Se rellenan automáticamente cuando corre el cron de agregación (o dispáralo
              manualmente contra <code>/api/cron/fetch</code>).
            </>
          )}
        </div>
      )}

      {articles.map((article) => (
        <div className="card" key={article.id}>
          <div className="meta">
            <span className="pill">{CATEGORY_LABEL[article.category]}</span>
            {article.source.name} · {new Date(article.createdAt).toLocaleString("es-ES")}
          </div>
          <h3>{article.title}</h3>
          <div
            className="excerpt"
            dangerouslySetInnerHTML={{ __html: article.excerpt }}
          />
          {article.status === "PUBLISHED" && (
            <div className="meta" style={{ marginTop: 8 }}>
              {article.shopifyHandle && (
                <>
                  Publicado en Shopify (handle: {article.shopifyHandle}){" "}
                </>
              )}
              {article.tweetId && <>· Tuit publicado</>}
              {article.instagramMediaId && <> · Instagram publicado</>}
              {article.facebookPostId && <> · Facebook publicado</>}
            </div>
          )}
          <div className="row">
            <Link className="btn" href={`/dashboard/articles/${article.id}`}>
              Ver / editar
            </Link>
            <a className="btn" href={article.originalUrl} target="_blank" rel="noreferrer">
              Fuente original
            </a>
            {status === "PENDING" && (
              <>
                <form action={approveArticleAction} className="row" style={{ alignItems: "center" }}>
                  <input type="hidden" name="id" value={article.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  {isInstagramConfigured() && (
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      Instagram:
                      <select
                        name="instagramMode"
                        defaultValue={article.videoUrl ? "reel" : article.imageUrl ? "post" : "none"}
                      >
                        <option value="none">No</option>
                        {article.imageUrl && <option value="post">Publicación</option>}
                        {article.videoUrl && <option value="reel">Reel</option>}
                        {(article.videoUrl || article.imageUrl) && (
                          <option value="story">Story{article.videoUrl ? " (vídeo)" : ""}</option>
                        )}
                      </select>
                    </label>
                  )}
                  {isFacebookConfigured() && (
                    <label style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <input type="checkbox" name="publishFacebook" defaultChecked />
                      Facebook
                    </label>
                  )}
                  <button className="primary" type="submit">
                    Aprobar y publicar
                  </button>
                </form>
                <form action={rejectArticleAction}>
                  <input type="hidden" name="id" value={article.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
                  <button className="danger" type="submit">
                    Rechazar
                  </button>
                </form>
              </>
            )}
            {status === "PUBLISHED" && (
              <form action={unpublishArticleAction}>
                <input type="hidden" name="id" value={article.id} />
                <input type="hidden" name="returnTo" value={returnTo} />
                <button className="danger" type="submit">
                  Eliminar de Shopify
                </button>
              </form>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}
