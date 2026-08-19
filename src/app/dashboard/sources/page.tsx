import { prisma } from "@/lib/db";
import { Category, SourceType } from "@prisma/client";
import { CATEGORY_LABEL } from "@/lib/sources";
import {
  addSourceAction,
  resetAccountCursorAction,
  switchSourceTypeAction,
  toggleSourceAction,
} from "../actions";

export default async function SourcesPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string; notice?: string }>;
}) {
  const query = await searchParams;
  const sources = await prisma.source.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      {query.error && <div className="banner error">{query.error}</div>}
      {query.notice && <div className="banner ok">{query.notice}</div>}

      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Fuentes</h1>

      {sources.map((source) => (
        <div className="card" key={source.id}>
          <div className="meta">
            <span className="pill">{CATEGORY_LABEL[source.category]}</span>
            <span className="pill">
              {source.type === SourceType.X_ACCOUNT ? "Cuenta de X" : "RSS"}
            </span>
            {source.active ? "activa" : "pausada"}
          </div>
          <h3>{source.name}</h3>
          <div className="excerpt">
            {source.type === SourceType.X_ACCOUNT ? `@${source.feedUrl}` : source.feedUrl}
            {source.type === SourceType.X_ACCOUNT && (
              <>
                <br />
                {source.lastFetchedId
                  ? `Leyendo solo lo posterior al tuit ${source.lastFetchedId}`
                  : "Sin cursor: leerá sus tuits más recientes"}
              </>
            )}
          </div>
          {source.type === SourceType.RSS && !source.feedUrl.startsWith("http") && (
            <div className="banner error" style={{ marginTop: 8 }}>
              Esto no es una URL de feed: como fuente RSS no lee nada. Si es una
              cuenta de X, conviértela con el botón de abajo.
            </div>
          )}
          <div className="row">
            <form action={toggleSourceAction}>
              <input type="hidden" name="id" value={source.id} />
              <button type="submit">{source.active ? "Pausar" : "Activar"}</button>
            </form>
            {source.type === SourceType.RSS && !source.feedUrl.startsWith("http") && (
              <form action={switchSourceTypeAction}>
                <input type="hidden" name="id" value={source.id} />
                <button type="submit">Convertir en cuenta de X</button>
              </form>
            )}
            {source.type === SourceType.X_ACCOUNT && source.lastFetchedId && (
              <form action={resetAccountCursorAction}>
                <input type="hidden" name="id" value={source.id} />
                <button
                  type="submit"
                  title="Olvida por dónde iba y vuelve a leer los últimos tuits de la cuenta. Úsalo si ves publicaciones en X que el rastreo no ha traído: lo que ya esté en la cola no se duplica"
                >
                  Volver a leer sus últimos tuits
                </button>
              </form>
            )}
          </div>
        </div>
      ))}

      <div className="card">
        <h3>Añadir fuente</h3>
        <form action={addSourceAction}>
          <label htmlFor="name">Nombre</label>
          <input type="text" id="name" name="name" required />

          <label htmlFor="type">Tipo de fuente</label>
          <select id="type" name="type" defaultValue={SourceType.RSS}>
            <option value={SourceType.RSS}>Feed RSS/Atom</option>
            <option value={SourceType.X_ACCOUNT}>Cuenta de X (Twitter)</option>
          </select>

          <label htmlFor="feedUrl">URL del feed (RSS) o @handle (cuenta de X)</label>
          <input type="text" id="feedUrl" name="feedUrl" required />

          <label htmlFor="category">Categoría</label>
          <select id="category" name="category" defaultValue={Category.AFICION}>
            <option value={Category.AFICION}>{CATEGORY_LABEL.AFICION}</option>
            <option value={Category.VIAJES}>{CATEGORY_LABEL.VIAJES}</option>
            <option value={Category.MODA}>{CATEGORY_LABEL.MODA}</option>
          </select>

          <div className="row">
            <button className="primary" type="submit">
              Añadir
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
