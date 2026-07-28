import { prisma } from "@/lib/db";
import { addGroupAction, toggleGroupAction } from "../actions";

export default async function GroupsPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const groups = await prisma.group.findMany({ orderBy: { name: "asc" } });

  return (
    <div>
      {query.error && <div className="banner error">{query.error}</div>}

      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Grupos de afición</h1>
      <p className="excerpt" style={{ marginBottom: 16 }}>
        Cuando el nombre (o un alias) de un grupo aparezca en una noticia, se
        enlaza en el artículo del blog y se menciona (@handle) en el tuit. El
        handle lo verificas tú a mano — el sistema nunca adivina cuál es la
        cuenta oficial.
      </p>

      {groups.map((group) => (
        <div className="card" key={group.id}>
          <div className="meta">{group.active ? "activo" : "pausado"}</div>
          <h3>{group.name}</h3>
          <div className="excerpt">@{group.handle}</div>
          {group.aliases && <div className="excerpt">Alias: {group.aliases}</div>}
          <div className="row">
            <form action={toggleGroupAction}>
              <input type="hidden" name="id" value={group.id} />
              <button type="submit">{group.active ? "Pausar" : "Activar"}</button>
            </form>
          </div>
        </div>
      ))}

      <div className="card">
        <h3>Añadir grupo</h3>
        <form action={addGroupAction}>
          <label htmlFor="name">Nombre del grupo</label>
          <input type="text" id="name" name="name" placeholder="Frente Atlético" required />

          <label htmlFor="handle">@handle oficial en X (verificado por ti)</label>
          <input type="text" id="handle" name="handle" placeholder="FrenteAtletico" required />

          <label htmlFor="aliases">Alias / variantes del nombre (opcional, separados por comas)</label>
          <input type="text" id="aliases" name="aliases" placeholder="Frente Atletico, F. Atlético" />

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
