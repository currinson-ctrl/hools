import Link from "next/link";

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div>
      <div className="topbar">
        <div className="brand">Hools Blog</div>
        <nav className="tabs">
          <Link className="tab" href="/dashboard?status=PENDING">
            Pendientes
          </Link>
          <Link className="tab" href="/dashboard?status=PUBLISHED">
            Publicados
          </Link>
          <Link className="tab" href="/dashboard?status=REJECTED">
            Rechazados
          </Link>
          <Link className="tab" href="/dashboard/skipped">
            Descartadas
          </Link>
          <Link className="tab" href="/dashboard/sources">
            Fuentes
          </Link>
          <Link className="tab" href="/dashboard/groups">
            Grupos
          </Link>
          <Link className="tab" href="/dashboard/newsletter">
            Newsletter
          </Link>
        </nav>
        <form action="/api/logout" method="POST">
          <button type="submit">Salir</button>
        </form>
      </div>
      <div className="page">{children}</div>
    </div>
  );
}
