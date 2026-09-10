import { buildWeeklyNewsletter } from "@/lib/newsletter";
import { isTestEmailConfigured } from "@/lib/email";
import { sendNewsletterTestAction } from "../actions";

export const dynamic = "force-dynamic";

export default async function NewsletterPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const newsletter = await buildWeeklyNewsletter();
  const canSendTest = isTestEmailConfigured();

  if (!newsletter) {
    return (
      <div>
        {query.error && <div className="banner error">{query.error}</div>}
        <h1 style={{ fontSize: 18, marginBottom: 16 }}>Resumen semanal</h1>
        <div className="empty">
          Aún no hay artículos publicados con los que montar el resumen.
        </div>
      </div>
    );
  }

  return (
    <div>
      {query.notice && <div className="banner">{query.notice}</div>}
      {query.error && <div className="banner error">{query.error}</div>}

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
            <strong>Shopify Email</strong> (Shopify Admin → Apps) →{" "}
            <strong>Crear correo electrónico</strong>, audiencia «Suscriptores de email».
          </li>
          <li>
            <strong>Asunto:</strong> <code>{newsletter.subject}</code>
            <br />
            <strong>Vista previa:</strong> <code>{newsletter.previewText}</code>
          </li>
          <li>
            Empieza con una plantilla <strong>en blanco</strong>, añade una sección de{" "}
            <strong>HTML personalizado</strong> y pega ahí la <strong>primera</strong> caja de
            abajo (la del bloque de HTML).
          </li>
          <li>
            El <strong>enlace de baja</strong> es obligatorio y lo pone el editor en su pie.
            Comprueba en la vista previa que aparece <strong>una sola vez</strong>: si sale
            duplicado, es que has pegado la caja equivocada.
          </li>
          <li>
            Envíate una <strong>prueba desde Klaviyo</strong> antes del envío real: reescribe parte
            del HTML, así que lo que valida el botón de aquí arriba no es exactamente lo que sale.
          </li>
        </ol>
        <div className="meta" style={{ marginTop: 10 }}>
          Contenido de esta semana: {newsletter.articleTitles.join(" · ")} — Prenda:{" "}
          {newsletter.productTitle} (rota automáticamente cada semana)
        </div>
      </div>

      <div className="card">
        <h3>Verlo en tu bandeja antes de enviarlo</h3>
        {canSendTest ? (
          <>
            <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6 }}>
              Se manda este mismo correo a una dirección tuya, sin tocar la lista de
              suscriptores. Es lo único que la vista previa de aquí abajo no puede
              enseñarte: cómo lo recorta Gmail de verdad, y cómo se ve en el móvil.
            </p>
            <form action={sendNewsletterTestAction} style={{ marginTop: 12 }}>
              <label htmlFor="to">Dirección para la prueba</label>
              <input type="email" id="to" name="to" required placeholder="tu@correo.com" />
              <button type="submit" style={{ marginTop: 10 }}>
                Enviar prueba
              </button>
            </form>
            <p className="meta" style={{ marginTop: 10 }}>
              Llega con <code>[PRUEBA]</code> delante del asunto, y en el pie verás en rojo
              dónde pondrá Shopify el enlace de baja.
            </p>
          </>
        ) : (
          <p style={{ margin: "8px 0 0", fontSize: 14, lineHeight: 1.6 }}>
            Para poder mandarte una prueba desde aquí falta la clave de Resend. Crea una
            cuenta gratuita en <code>resend.com</code>, genera una API key y ponla como{" "}
            <code>RESEND_API_KEY</code> en las variables de entorno de Vercel. Mientras
            tanto, la prueba se hace desde el propio editor de Shopify Email, con el botón
            «Enviar prueba» (paso 4).
          </p>
        )}
      </div>

      <div className="card">
        <h3>HTML del email — para el bloque de HTML personalizado</h3>
        <p style={{ margin: "8px 0 10px", fontSize: 14, lineHeight: 1.6 }}>
          <strong>Esta es la normal.</strong> Va dentro de una sección de HTML personalizado, en el
          editor de Shopify Email. Sin cabecera de documento y sin línea de baja, porque de las dos
          cosas ya se encarga el editor — si pegas aquí la otra caja, el correo sale con el pie de
          baja duplicado.
        </p>
        <textarea
          readOnly
          defaultValue={newsletter.htmlFragment}
          style={{ width: "100%", height: 180, fontFamily: "monospace", fontSize: 11 }}
        />
      </div>

      <div className="card">
        <h3>HTML del email — documento completo</h3>
        <p style={{ margin: "8px 0 10px", fontSize: 14, lineHeight: 1.6 }}>
          Para <strong>«Crear con código»</strong>, donde el correo es el documento entero. Trae
          ya las dos variables que Shopify exige ahí: <code>{"{{ unsubscribe_link }}"}</code> en el
          enlace de baja del pie y <code>{"{{ open_tracking_block }}"}</code> para medir aperturas.
          Sin ellas, el editor no deja llegar a la pantalla de envío.
        </p>
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
