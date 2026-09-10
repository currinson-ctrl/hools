// Envio del correo de PRUEBA del resumen semanal.
//
// El envio de verdad no pasa por aqui: la lista de suscriptores vive en
// Shopify y sale por Shopify Email (Marketing > Crear campaña). Esto existe
// solo para ver como queda el correo en una bandeja real antes de montar la
// campaña, que es lo unico que la vista previa del panel no puede enseñar:
// Gmail y Outlook recortan CSS que el navegador si pinta.
//
// Se usa Resend por HTTP directo, sin SDK: es una peticion con una clave.

const RESEND_ENDPOINT = "https://api.resend.com/emails";

// Remitente de serie de Resend, que funciona sin verificar ningun dominio.
// Con el dominio de la tienda verificado en Resend se puede poner algo como
// "The Away End <hola@hoolsbrand.com>" en NEWSLETTER_TEST_FROM.
const DEFAULT_FROM = "The Away End (prueba) <onboarding@resend.dev>";

export function isTestEmailConfigured(): boolean {
  return Boolean(process.env.RESEND_API_KEY);
}

/**
 * En el correo real, la herramienta de envio (Shopify Email) sustituye la
 * etiqueta de baja por el enlace. Aqui no hay Shopify que lo haga, asi que la
 * etiqueta llegaria literal a la bandeja; se cambia por un aviso visible para
 * que la prueba recuerde que ese enlace tiene que salir en el envio real.
 *
 * Se aceptan las dos sintaxis, la de Shopify Email y la de Klaviyo, para que
 * cambiar de herramienta no deje etiquetas viejas a la vista.
 */
function fillUnsubscribePlaceholder(html: string): string {
  return html.replace(
    /\{[{%]\s*unsubscribe(_link)?\s*[}%]\}/g,
    '<span style="color:#c0392b;">[aquí pone Shopify el enlace de baja]</span>'
  );
}

/**
 * Manda el resumen semanal a una direccion. Devuelve el id del envio en
 * Resend, util cuando el correo no aparece y hay que mirarlo en su panel.
 */
export async function sendTestNewsletter(
  to: string,
  subject: string,
  html: string
): Promise<string> {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Falta la variable de entorno RESEND_API_KEY");

  const res = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      from: process.env.NEWSLETTER_TEST_FROM || DEFAULT_FROM,
      to: [to],
      subject: `[PRUEBA] ${subject}`,
      html: fillUnsubscribePlaceholder(html),
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    message?: string;
    name?: string;
  };

  if (!res.ok) {
    throw new Error(describeResendError(res.status, json.name, json.message));
  }
  return json.id || "(sin id)";
}

/**
 * Traduce los dos errores con los que se tropieza de verdad. Resend contesta
 * con un texto en ingles que no dice donde se arregla, y el segundo caso
 * (cuenta sin dominio verificado) parece un fallo del panel cuando no lo es.
 */
function describeResendError(status: number, name?: string, message?: string): string {
  const crudo = message || name || `HTTP ${status}`;

  if (status === 401 || status === 403) {
    return (
      `Resend rechaza la clave (${crudo}). Revisa RESEND_API_KEY en las ` +
      `variables de entorno de Vercel y vuelve a desplegar.`
    );
  }
  if (/testing emails|own email address|verify a domain/i.test(crudo)) {
    return (
      `Resend solo deja enviar a tu propia dirección mientras no verifiques un ` +
      `dominio: usa el correo con el que creaste la cuenta de Resend, o verifica ` +
      `hoolsbrand.com en Resend y pon el remitente en NEWSLETTER_TEST_FROM. (${crudo})`
    );
  }
  return `Resend no pudo enviar la prueba: ${crudo}`;
}
