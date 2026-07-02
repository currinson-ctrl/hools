import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { CATEGORY_LABEL } from "@/lib/sources";
import { approveArticleAction, rejectArticleAction, updateArticleAction } from "../../actions";

export default async function ArticleReviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ saved?: string; error?: string }>;
}) {
  const { id } = await params;
  const query = await searchParams;

  const article = await prisma.article.findUnique({
    where: { id },
    include: { source: true },
  });
  if (!article) notFound();

  const returnTo = `/dashboard/articles/${id}`;

  return (
    <div>
      {query.saved && <div className="banner ok">Cambios guardados.</div>}
      {query.error && <div className="banner error">{query.error}</div>}

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

        <label htmlFor="tweetText">Texto del tuit</label>
        <textarea id="tweetText" name="tweetText" defaultValue={article.tweetText} />

        <div className="row">
          <button className="primary" type="submit">
            Guardar cambios
          </button>
          <a className="btn" href={article.originalUrl} target="_blank" rel="noreferrer">
            Ver noticia original
          </a>
        </div>
      </form>

      {article.status === "PENDING" && (
        <div className="row" style={{ marginTop: 20, borderTop: "1px solid var(--border)", paddingTop: 16 }}>
          <form action={approveArticleAction}>
            <input type="hidden" name="id" value={article.id} />
            <input type="hidden" name="returnTo" value={returnTo} />
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
        <div className="banner ok" style={{ marginTop: 20 }}>
          Publicado. Handle de Shopify: {article.shopifyHandle}
          {article.tweetId && <> · Tuit: {article.tweetId}</>}
        </div>
      )}
    </div>
  );
}
