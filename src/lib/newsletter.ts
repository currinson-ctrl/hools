import { prisma } from "./db";
import { fetchActiveProducts } from "./shopify";

export interface NewsletterProduct {
  title: string;
  handle: string;
  price: string;
  imageUrl: string;
  blurb: string;
}

// Catalogo de respaldo: se usa SOLO si la consulta de productos a Shopify
// falla (tipicamente porque a la app le falta el scope read_products). Es
// una copia a mano del catalogo, asi que envejece: el precio de aqui puede
// dejar de ser el de la tienda sin que nadie se entere. Por eso, cuando se
// entra por este camino, buildWeeklyNewsletter lo marca (productFallback) y
// el panel avisa antes de que el correo salga con un precio viejo.
// Ultima revision contra la tienda: 2026-08-27, todos los polos a 64,95 €.
const FALLBACK_PRODUCTS: NewsletterProduct[] = [
  {
    title: "The Classic",
    handle: "the-classic",
    price: "64,95 €",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-negro-rayas-amarillas-lifestyle-hombre_jpg.jpg?v=1767896424",
    blurb: "Polo negro con detalles amarillos. Estética 70–90, algodón pesado, hecho en Portugal.",
  },
  {
    title: "The Corner",
    handle: "the-corner",
    price: "64,95 €",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-corner-azul-marino-modelo-detalle.png?v=1770660649",
    blurb: "Azul marino con rayas blancas. Terrace clásico de los que no caducan.",
  },
  {
    title: "Away",
    handle: "away",
    price: "64,95 €",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-the-corner-azul-marino-frontal.png?v=1770660742",
    blurb: "Azul marino pensado para los días fuera de casa.",
  },
  {
    title: "Trasferta",
    handle: "trasferta",
    price: "64,95 €",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-the-corner-azul-marino-detalle-cuello.png?v=1770671313",
    blurb: "Lo que los tifosi llaman viajar a campo ajeno con un único objetivo.",
  },
  {
    title: "The Beat",
    handle: "the-beat",
    price: "64,95 €",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-ska-the-beat-verde-frontal.png?v=1770671519",
    blurb: "Verde con cuadros ska. Para los que llevan el ritmo también fuera del estadio.",
  },
  {
    title: "The Streetlight",
    handle: "the-streetlight",
    price: "64,95 €",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-ska-the-streetlight-granate-frontal.png?v=1770671743",
    blurb: "Granate con ajedrezado ska en cuello y mangas. Setentero hasta la médula.",
  },
];

const UTM = "utm_source=newsletter&utm_medium=email&utm_campaign=resumen-semanal";

function stripHtml(input: string): string {
  return input.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function truncate(input: string, max: number): string {
  if (input.length <= max) return input;
  return input.slice(0, max - 1).trimEnd() + "…";
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

// Numero de semana ISO, para rotar el producto destacado sin repetir dos
// semanas seguidas y sin necesitar estado en la base.
function isoWeek(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export interface WeeklyNewsletter {
  subject: string;
  previewText: string;
  html: string;
  articleTitles: string[];
  productTitle: string;
  /**
   * Motivo por el que la prenda (y su precio) salen del catalogo de respaldo
   * en vez de la tienda, o null si vienen de Shopify y estan al dia.
   */
  productFallback: string | null;
}

export async function buildWeeklyNewsletter(): Promise<WeeklyNewsletter | null> {
  const articles = await prisma.article.findMany({
    where: { status: "PUBLISHED", shopifyHandle: { not: null } },
    orderBy: { publishedAt: "desc" },
    take: 3,
  });
  if (!articles.length) return null;

  let products = FALLBACK_PRODUCTS;
  let productFallback: string | null = null;
  try {
    const fromApi = await fetchActiveProducts();
    if (fromApi.length) products = fromApi;
    else productFallback = "Shopify no devolvio ningun producto activo con imagen.";
  } catch (error) {
    // Sin datos de la tienda se rota sobre el catalogo fijo, pero el motivo
    // no se pierde: es lo que separa "el precio esta al dia" de "el precio
    // es el que alguien copio a mano hace meses".
    productFallback = error instanceof Error ? error.message : String(error);
    console.error("Newsletter: no se pudieron leer los productos de Shopify:", productFallback);
  }
  const product = products[isoWeek(new Date()) % products.length];

  const publicDomain = process.env.SHOPIFY_PUBLIC_DOMAIN || "www.hoolsbrand.com";
  const blogHandle = process.env.SHOPIFY_BLOG_HANDLE || "the-away-end";

  const articleBlocks = articles
    .map((article) => {
      const url = `https://${publicDomain}/blogs/${blogHandle}/${article.shopifyHandle}?${UTM}`;
      const summary = truncate(stripHtml(article.excerpt.split("</p>")[0] || ""), 150);
      const image = article.imageUrl
        ? `<img src="${escapeHtml(article.imageUrl)}" alt="" width="536" style="width:100%; height:auto; display:block; border:0;">`
        : "";
      return `
  <tr>
    <td style="padding:28px 32px 0 32px;">
      <a href="${url}" style="text-decoration:none;">
        ${image}
        <div style="font-family:Georgia, serif; font-size:20px; font-weight:bold; color:#111111; padding-top:12px; line-height:1.3;">${escapeHtml(article.title)}</div>
      </a>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#555555; padding-top:6px;">${escapeHtml(summary)}</div>
      <div style="padding-top:8px;">
        <a href="${url}" style="font-family:Arial, Helvetica, sans-serif; font-size:13px; font-weight:bold; color:#111111;">Leer la crónica →</a>
      </div>
    </td>
  </tr>`;
    })
    .join("\n");

  const productUrl = `https://${publicDomain}/products/${product.handle}?${UTM}`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Away End — Resumen semanal</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f2;">

<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f2;">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-collapse:collapse;">

  <!-- CABECERA: collage del blog con la caja crema, como en la web -->
  <tr>
    <td background="https://cdn.shopify.com/s/files/1/0988/6364/5011/files/collage-imagenes-terrace.png?v=1771096753"
        bgcolor="#14130f"
        style="background-image:url('https://cdn.shopify.com/s/files/1/0988/6364/5011/files/collage-imagenes-terrace.png?v=1771096753'); background-size:cover; background-position:center; background-color:#14130f; padding:52px 24px;"
        align="center">
      <table role="presentation" width="440" cellpadding="0" cellspacing="0" style="max-width:440px; width:90%; background-color:#f7f4ec;">
        <tr>
          <td style="padding:26px 28px 28px 28px; text-align:center;">
            <div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#3a3a3a; letter-spacing:2px; text-transform:uppercase;">
              Terrace Culture&nbsp;|&nbsp;<em style="font-style:italic; font-weight:bold;">Return to the Origins</em>
            </div>
            <div style="font-family:Georgia, 'Times New Roman', serif; font-size:34px; color:#1c1c1c; padding-top:14px; line-height:1.1;">The Away</div>
            <div style="font-family:Georgia, 'Times New Roman', serif; font-size:56px; color:#1c1c1c; line-height:1; letter-spacing:2px;">END</div>
            <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; color:#444444; padding-top:14px; line-height:1.5;">
              La historia que se escribe en el sector visitante.
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- INTRO -->
  <tr>
    <td style="padding:28px 32px 8px 32px; font-family:Arial, Helvetica, sans-serif; font-size:15px; line-height:1.6; color:#333333;">
      <div style="font-size:11px; color:#999999; letter-spacing:3px; text-transform:uppercase; padding-bottom:10px;">El resumen semanal</div>
      Lo que ha pasado esta semana en las gradas — y una prenda de la casa.
    </td>
  </tr>

${articleBlocks}

  <!-- SEPARADOR -->
  <tr>
    <td style="padding:32px 32px 0 32px;">
      <div style="border-top:2px solid #111111;"></div>
    </td>
  </tr>

  <!-- PRODUCTO -->
  <tr>
    <td style="padding:24px 32px 0 32px;">
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#999999; letter-spacing:3px; text-transform:uppercase; padding-bottom:12px;">La prenda de la semana</div>
      <a href="${productUrl}" style="text-decoration:none;">
        <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" width="536" style="width:100%; height:auto; display:block; border:0;">
        <div style="font-family:Georgia, serif; font-size:22px; font-weight:bold; color:#111111; padding-top:12px;">${escapeHtml(product.title)}</div>
      </a>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#555555; padding-top:6px;">${escapeHtml(product.blurb)}</div>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:bold; color:#111111; padding-top:8px;">${escapeHtml(product.price)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
        <tr>
          <td style="background-color:#111111; padding:12px 28px;">
            <a href="${productUrl}" style="font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#ffffff; text-decoration:none; letter-spacing:1px;">VER EN LA TIENDA</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>

  <!-- PIE -->
  <tr>
    <td style="padding:36px 32px 28px 32px; text-align:center;">
      <div style="font-family:Georgia, serif; font-size:14px; font-style:italic; color:#111111;">Return to the Origins</div>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#999999; padding-top:10px;">
        <a href="https://${publicDomain}?${UTM}" style="color:#999999;">hoolsbrand.com</a>
        &nbsp;·&nbsp;
        <a href="https://${publicDomain}/blogs/${blogHandle}?${UTM}" style="color:#999999;">The Away End</a>
      </div>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#bbbbbb; padding-top:12px;">
        Recibes este correo por ser parte de Hools. {{ unsubscribe }}
      </div>
    </td>
  </tr>

</table>

</td></tr>
</table>

</body>
</html>
`;

  return {
    subject: `${truncate(articles[0].title, 60)} — la semana en The Away End`,
    previewText: "3 crónicas de las gradas + la prenda de la semana",
    html,
    articleTitles: articles.map((a) => a.title),
    productTitle: product.title,
    productFallback,
  };
}
