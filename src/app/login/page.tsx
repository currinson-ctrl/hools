export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string; error?: string }>;
}) {
  const params = await searchParams;
  const next = params.next || "/dashboard";
  const hasError = params.error === "1";

  return (
    <div className="login-wrap">
      <h1 style={{ fontSize: 18, marginBottom: 4 }}>Hools Blog</h1>
      <p className="meta" style={{ marginBottom: 20 }}>
        Cola de revisión de noticias — acceso privado
      </p>
      {hasError && <div className="banner error">Contraseña incorrecta.</div>}
      <form action="/api/login" method="POST">
        <input type="hidden" name="next" value={next} />
        <label htmlFor="password">Contraseña</label>
        <input type="password" id="password" name="password" autoFocus required />
        <div className="row">
          <button className="primary" type="submit">
            Entrar
          </button>
        </div>
      </form>
    </div>
  );
}
