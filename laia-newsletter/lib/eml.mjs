// Correo listo para enviar desde el buzón de cada uno (.eml).
//
// Lleva el boletín como cuerpo HTML con los logos incrustados (cid:), una
// versión en texto plano y, si existe, el PDF adjunto. La cabecera
// X-Unsent: 1 hace que Outlook (Windows y Mac) lo abra como BORRADOR: se
// rellena «Para», se revisa y se pulsa Enviar, y sale desde tu propia cuenta.

import { randomBytes } from "node:crypto";

const b64 = (buf) => buf.toString("base64").replace(/.{76}/g, "$&\r\n");
const encWord = (s) => `=?UTF-8?B?${Buffer.from(s, "utf8").toString("base64")}?=`;
const boundary = (tag) => `----=_${tag}_${randomBytes(8).toString("hex")}`;

function textFromHtml(html) {
  return html
    .replace(/<style[\s\S]*?<\/style>|<head[\s\S]*?<\/head>/gi, "")
    .replace(/<a [^>]*href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/gi, (_, href, t) => `${t.replace(/<[^>]+>/g, "").trim()} (${href})`)
    .replace(/<(br|\/div|\/tr|\/p)[^>]*>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&middot;/g, "·")
    .replace(/&rarr;/g, "→")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*/g, "\n\n")
    .trim();
}

/**
 * html: con las imágenes como src="cid:<nombre>".
 * images: [{ name, data: Buffer }]   pdf: { name, data: Buffer } | null
 */
export function buildEml({ subject, html, images, pdf = null, from = "", to = "" }) {
  const mixed = boundary("mixed");
  const related = boundary("related");
  const alt = boundary("alt");
  const L = [];
  L.push("X-Unsent: 1");
  if (from) L.push(`From: ${from}`);
  L.push(`To: ${to}`);
  L.push(`Subject: ${encWord(subject)}`);
  L.push("MIME-Version: 1.0");
  L.push(`Content-Type: multipart/mixed; boundary="${mixed}"`, "");
  L.push(`--${mixed}`, `Content-Type: multipart/related; boundary="${related}"`, "");
  L.push(`--${related}`, `Content-Type: multipart/alternative; boundary="${alt}"`, "");
  L.push(`--${alt}`, "Content-Type: text/plain; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(Buffer.from(textFromHtml(html), "utf8")));
  L.push(`--${alt}`, "Content-Type: text/html; charset=UTF-8", "Content-Transfer-Encoding: base64", "", b64(Buffer.from(html, "utf8")));
  L.push(`--${alt}--`, "");
  for (const img of images) {
    L.push(
      `--${related}`,
      `Content-Type: image/png; name="${img.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-ID: <${img.name}>`,
      `Content-Disposition: inline; filename="${img.name}"`,
      "",
      b64(img.data)
    );
  }
  L.push(`--${related}--`, "");
  if (pdf) {
    L.push(
      `--${mixed}`,
      `Content-Type: application/pdf; name="${pdf.name}"`,
      "Content-Transfer-Encoding: base64",
      `Content-Disposition: attachment; filename="${pdf.name}"`,
      "",
      b64(pdf.data)
    );
  }
  L.push(`--${mixed}--`, "");
  return L.join("\r\n");
}
