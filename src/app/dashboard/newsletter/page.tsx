import { buildWeeklyNewsletter } from "@/lib/newsletter";

export const dynamic = "force-dynamic";

export default async function NewsletterPage() {
  const newsletter = await buildWeeklyNewsletter();

  if (!newsletter) {
    return (
      <div>
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>Resumen semanal</h1>
        <div className="empty">
          Aún no hay artículos publicados con los que montar el resumen.
        </div>
      </div>
    );
  }

  return (
    <div>
      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Resumen semanal</h1>

      {newsletter.productFallback && (
        <div className="card" style={{ borderLeft: "4px solid #c0392b" }}>
          <h3>⚠ El precio de la prenda no viene de la tienda</h3>
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6 }}>
            No se han podido leer los productos de Shopify, así que la prenda y su precio
            salen del catálogo de respaldo escrito a mano en <code>src/lib/newsletter.ts</code>,
            que puede estar desfasado. <strong>Comprueba el precio en la tienda antes de
            enviar el correo.</strong>
          </p>
          <p className="meta" style={{ marginTop: 8 }}>Motivo: {newsletter.productFallback}</p>
        </div>
      )}

      <div className="card">
        <h3>Cómo enviarlo (5 minutos)</h3>
        <ol style={{ margin: "8px 0 0 18px", lineHeight: 1.8, fontSize: 14 }}>
          <li>
            Shopify Admin → <strong>Marketing → Crear campaña → Shopify Email</strong>, audiencia
            «Suscriptores de email».
          </li>
          <li>
            <strong>Asunto:</strong> <code>{newsletter.subject}</code>
            <br />
            <strong>Vista previa:</strong> <code>{newsletter.previewText}</code>
          </li>
          <li>
            Pega el HTML de abajo en un bloque de HTML personalizado (o reconstruye los bloques con
            el editor usando la vista previa como guía).
          </li>
          <li>
            Sustituye la línea <code>{"{{ unsubscribe }}"}</code> por el bloque de baja del editor
            (obligatorio) y envíate una <strong>prueba</strong> antes del envío real.
          </li>
        </ol>
        <div className="meta" style={{ marginTop: 10 }}>
          Contenido de esta semana: {newsletter.articleTitles.join(" · ")} — Prenda:{" "}
          {newsletter.productTitle} (rota automáticamente cada semana)
        </div>
      </div>

      <div className="card">
        <h3>HTML del email (copiar todo)</h3>
        <textarea
          readOnly
          defaultValue={newsletter.html}
          style={{ width: "100%", height: 180, fontFamily: "monospace", fontSize: 11 }}
        />
      </div>

      <div className="card">
        <h3>Vista previa</h3>
        <iframe
          srcDoc={newsletter.html}
          title="Vista previa del resumen semanal"
          style={{ width: "100%", height: 1200, border: "1px solid #ddd", background: "#fff" }}
        />
      </div>
    </div>
  );
}
