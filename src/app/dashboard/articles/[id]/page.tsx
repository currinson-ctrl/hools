import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/sources";
import { isInstagramConfigured } from "@/lib/instagram";
import { isFacebookConfigured } from "@/lib/facebook";
import {
  approveArticleAction,
  regenerateImageAction,
  rejectArticleAction,
  republishTweetAction,
  unpublishArticleAction,
  updateArticleAction,
} from "../../actions";
import { isTwitterConfigured } from "@/lib/twitter";

// Publicar (Shopify + X + Instagram; un video de story tarda en procesarse)
// puede superar los 60s por defecto; mismo margen que /dashboard.
export const maxDuration = 280;

export default async function ArticleReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string; notice?: string; tweetStale?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const article = await prisma.article.findUnique({
    where: { id },
    include: { source: true },
  });
  if (!article) notFound();

  const returnTo = `/dashboard/articles/${id}`;

  // El tuit vivo lleva el texto de tweetedText; si tweetText ya no coincide,
  // lo editado esta guardado pero todavia no se ve en X.
  const tweetOutOfSync = Boolean(article.tweetId) && article.tweetText !== article.tweetedText;
  const tweetPending = article.status === "PUBLISHED" && !article.tweetId;

  return (
    <div>
      {query.saved && <div className="banner ok">Cambios guardados.</div>}
      {query.notice && <div className="banner ok">{query.notice}</div>}
      {query.error && <div className="banner error">{query.error}</div>}
      {query.tweetStale && (
        <div className="banner error">
          El texto se guardó, pero el tuit ya publicado en X sigue mostrando el texto anterior: X no
          permite editar un tuit. Usa «Actualizar el tuit en X» más abajo para reemplazarlo.
        </div>
      )}

      <div className="meta">
        <span className="pill">{CATEGORY_LABEL[article.category]}</span>
        {article.source.name} · estado: {article.status}
      </div>

      <form action={updateArticleAction}>
        <input type="hidden" name="id" value={article.id} />

        <label htmlFor="title">Título</label>
        <input type="text" id="title" name="title" defaultValue={article.title} required />

        <label htmlFor="excerpt">Contenido (HTML) — resumen propio + cita + enlace a la fuente</label>
        <textarea id="excerpt" name="excerpt" defaultValue={article.excerpt} required />

        <label htmlFor="imageUrl">Imagen (URL, opcional)</label>
        <input type="url" id="imageUrl" name="imageUrl" defaultValue={article.imageUrl || ""} />
        {article.imageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={article.imageUrl}
            alt=""
            style={{ maxWidth: 240, borderRadius: 8, marginTop: 8, display: "block" }}
          />
        )}

        {article.videoUrl && (
          <div className="meta" style={{ marginTop: 8 }}>
            🎬 El tuit de origen trae vídeo —{" "}
            <a href={article.videoUrl} target="_blank" rel="noreferrer">
              verlo
            </a>{" "}
            (se publicará en X, y en Instagram si eliges «Reel» o «Story»)
          </div>
        )}

        {article.extraImageUrls && (
          <>
            <label>Fotos adicionales (se adjuntan también al tuit)</label>
            <div className="row" style={{ flexWrap: "wrap" }}>
              {article.extraImageUrls.split(",").map((url) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={url}
                  src={url}
                  alt=""
                  style={{ maxWidth: 120, borderRadius: 8, display: "block" }}
                />
              ))}
            </div>
          </>
        )}

        <label htmlFor="tweetText">Texto del tuit</label>
        <textarea id="tweetText" name="tweetText" defaultValue={article.tweetText} />
        {article.tweetId && (
          <div className="meta">
            Este artículo ya tiene un tuit publicado. Guardar aquí no lo cambia (X no deja editar
            tuits): hay que reemplazarlo desde «Actualizar el tuit en X», al final de la página.
          </div>
        )}

        <label htmlFor="igCaption">
          Pie de foto de Instagram (si se deja vacío, se usa el texto del tuit)
        </label>
        <textarea id="igCaption" name="igCaption" defaultValue={article.igCaption || ""} />

        <div className="row">
          <button className="primary" type="submit">
            Guardar cambios
          </button>
          <a className="btn" href={article.originalUrl} target="_blank" rel="noreferrer">
            Ver noticia original
          </a>
        </div>
      </form>

      <form
        action={regenerateImageAction}
        className="row"
        style={{ marginTop: 12, alignItems: "center" }}
      >
        <input type="hidden" name="id" value={article.id} />
        <input
          type="text"
          name="imageHint"
          placeholder="Contexto extra para la búsqueda (ej. Hard Rock Stadium Miami England fans)"
          style={{ flex: 1 }}
        />
        <button className="btn" type="submit">
          Buscar otra foto
        </button>
      </form>

      {article.status === "PENDING" && (
        <div className="row" style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <form action={approveArticleAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            {isFacebookConfigured() && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                <input type="checkbox" name="publishFacebook" defaultChecked />
                También en Facebook
              </label>
            )}
            {isInstagramConfigured() && (
              <label style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                Instagram:
                <select
                  name="instagramMode"
                  defaultValue={article.videoUrl ? "reel" : article.imageUrl ? "post" : "none"}
                >
                  <option value="none">No publicar</option>
                  {article.imageUrl && <option value="post">Publicación (foto)</option>}
                  {article.videoUrl && <option value="reel">Reel (vídeo, con texto)</option>}
                  {(article.videoUrl || article.imageUrl) && (
                    <option value="story">Story{article.videoUrl ? " (vídeo)" : " (foto)"}</option>
                  )}
                </select>
              </label>
            )}
            <button className="primary" type="submit">
              Aprobar y publicar en Shopify + X
            </button>
          </form>
          <form action={rejectArticleAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="returnTo" value="/dashboard?status=PENDING" />
            <button className="danger" type="submit">
              Rechazar
            </button>
          </form>
        </div>
      )}

      {article.status === "PUBLISHED" && (
        <div style={{ marginTop: 20 }}>
          <div className="banner ok">
            Publicado. Handle de Shopify: {article.shopifyHandle}
            {article.tweetId && <> · Tuit: {article.tweetId}</>}
            {article.instagramMediaId && <> · Instagram: {article.instagramMediaId}</>}
            {article.facebookPostId && <> · Facebook: {article.facebookPostId}</>}
          </div>
          {isTwitterConfigured() && (
            <div
              style={{
                marginTop: 12,
                border: "1px solid var(--border)",
                borderRadius: 8,
                padding: 12,
              }}
            >
              <strong>{tweetPending ? "Publicar el tuit en X" : "Actualizar el tuit en X"}</strong>
              {tweetPending ? (
                <p className="meta">
                  El artículo salió en el blog, pero el tuit no llegó a publicarse. Puedes lanzarlo
                  ahora con el texto de arriba.
                </p>
              ) : (
                <p className="meta">
                  X no permite editar un tuit publicado, así que se borra el actual y se publica uno
                  nuevo con el texto guardado. El tuit cambia de enlace y pierde los likes, RTs y
                  respuestas que tuviera.
                </p>
              )}
              {tweetOutOfSync && (
                <details style={{ marginBottom: 8 }}>
                  <summary className="meta">Ver el texto que hay ahora mismo en X</summary>
                  <pre style={{ whiteSpace: "pre-wrap", margin: "8px 0 0" }}>
                    {article.tweetedText}
                  </pre>
                </details>
              )}
              {!tweetPending && !tweetOutOfSync && (
                <p className="meta">El tuit publicado ya coincide con el texto guardado.</p>
              )}
              <form action={republishTweetAction}>
                <input type="hidden" name="id" value={article.id} />
                <button className={tweetOutOfSync || tweetPending ? "primary" : "btn"} type="submit">
                  {tweetPending ? "Publicar tuit ahora" : "Borrar y volver a publicar el tuit"}
                </button>
              </form>
            </div>
          )}

          <form action={unpublishArticleAction} style={{ marginTop: 12 }}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
            <button className="danger" type="submit">
              Eliminar de Shopify
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
