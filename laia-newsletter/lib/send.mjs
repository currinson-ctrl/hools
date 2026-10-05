// Envío por Resend (HTTP directo, sin SDK), igual que la prueba del resumen
// de Hools en src/lib/email.ts.

export async function sendEmail({ to, subject, html, attachments = [] }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error("Falta RESEND_API_KEY");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      from: process.env.LAIA_NEWSLETTER_FROM || "Radar AV <onboarding@resend.dev>",
      // Los destinatarios van en copia oculta para no exponer la lista.
      to: [to[0]],
      bcc: to.slice(1),
      subject,
      html,
      // Imágenes en línea: cada una con content_id = el nombre usado en cid:
      ...(attachments.length ? { attachments } : {}),
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Resend: HTTP ${res.status} ${JSON.stringify(body)}`);
  return body.id;
}
