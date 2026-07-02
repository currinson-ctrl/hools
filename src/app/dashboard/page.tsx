import Link from "next/link";
import { prisma } from "@/lib/db";
import { ArticleStatus } from "@prisma/client";
import { CATEGORY_LABEL } from "@/lib/sources";
import { approveArticleAction, rejectArticleAction } from "./actions";

const STATUS_LABEL: Record<ArticleStatus, string> = {
  PENDING: "Pendientes",
  APPROVED: "Aprobados",
  REJECTED: "Rechazados",
  PUBLISHED: "Publicados",
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; error?: string }>;
}) {
  const params = await searchParams;
  const status = (params.status as ArticleStatus) || "PENDING";
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

      <h1 style={{ fontSize: 18, marginBottom: 16 }}>{STATUS_LABEL[status]}</h1>

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
                <form action={approveArticleAction}>
                  <input type="hidden" name="id" value={article.id} />
                  <input type="hidden" name="returnTo" value={returnTo} />
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
          </div>
        </div>
      ))}
    </div>
  );
}
