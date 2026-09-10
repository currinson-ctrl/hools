import { prisma } from "./db";
import { fetchActiveProducts } from "./shopify";

export interface NewsletterProduct {
  title: string;
  handle: string;
  price: string;
  /** Precio tachado. Solo cuando la prenda esta rebajada de verdad. */
  priceBefore: string | null;
  imageUrl: string;
  blurb: string;
}

// Catalogo de respaldo: se usa SOLO si la consulta de productos a Shopify
// falla (tipicamente porque a la app le falta el scope read_products). Es
// una copia a mano del catalogo, asi que envejece: el precio de aqui puede
// dejar de ser el de la tienda sin que nadie se entere. Por eso, cuando se
// entra por este camino, buildWeeklyNewsletter lo marca (productFallback) y
// el panel avisa antes de que el correo salga con un precio viejo.
// Ultima revision contra la tienda: 2026-09-10. The Classic esta a 50,00 €
// (rebajado desde 64,95 €); el resto de polos, a 64,95 €.
const FALLBACK_PRODUCTS: NewsletterProduct[] = [
  {
    title: "The Classic",
    handle: "the-classic",
    price: "50,00 €",
    priceBefore: "64,95 €",
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-negro-rayas-amarillas-lifestyle-hombre_jpg.jpg?v=1767896424",
    blurb: "Polo negro con detalles amarillos. Estética 70–90, algodón pesado, hecho en Portugal.",
  },
  {
    title: "The Corner",
    handle: "the-corner",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-corner-azul-marino-modelo-detalle.png?v=1770660649",
    blurb: "Azul marino con rayas blancas. Terrace clásico de los que no caducan.",
  },
  {
    title: "Away",
    handle: "away",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-the-corner-azul-marino-frontal.png?v=1770660742",
    blurb: "Azul marino pensado para los días fuera de casa.",
  },
  {
    title: "Trasferta",
    handle: "trasferta",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-terrace-the-corner-azul-marino-detalle-cuello.png?v=1770671313",
    blurb: "Lo que los tifosi llaman viajar a campo ajeno con un único objetivo.",
  },
  {
    title: "The Beat",
    handle: "the-beat",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-ska-the-beat-verde-frontal.png?v=1770671519",
    blurb: "Verde con cuadros ska. Para los que llevan el ritmo también fuera del estadio.",
  },
  {
    title: "The Streetlight",
    handle: "the-streetlight",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/hools-polo-ska-the-streetlight-granate-frontal.png?v=1770671743",
    blurb: "Granate con ajedrezado ska en cuello y mangas. Setentero hasta la médula.",
  },
  {
    title: "The Boleyn",
    handle: "boleyn",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/terrace_bolyen11_02822141-5850-4ca6-906f-d9c2e04ff396.jpg?v=1788419945",
    blurb: "Celeste con rayas granate. Claret and blue, de las combinaciones que se reconocen sin nombrarlas.",
  },
  {
    title: "The Rudeboy",
    handle: "rudeboy",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/ska_rudeboy11_dc5f003e-5de1-45aa-874c-eff804862e11.jpg?v=1788420066",
    blurb: "Verde oliva con banda ajedrezada granate. El damero no es estampado: es el uniforme.",
  },
  {
    title: "The Tangerine",
    handle: "tangerine",
    price: "64,95 €",
    priceBefore: null,
    imageUrl:
      "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/terrace_tangerine12_ab373abc-5346-4b64-b221-e5cb9ebfee61.jpg?v=1788419934",
    blurb: "Verde oscuro con naranja. El naranja tiene su propia historia en las gradas.",
  },
];

// Prenda fijada a mano, por encima de la rotacion semanal. Existe para las
// ofertas: una rebaja de verdad merece el hueco mas de una semana, y el copy
// puede hablar de ella en vez del texto de siempre.
//
// Para volver a la rotacion normal basta con poner esto a null. Y aunque a
// nadie se le ocurra, el correo no se queda anunciando una oferta muerta: el
// copy de oferta solo se usa si la prenda sigue teniendo precio tachado (lo
// dice la tienda), y si no, la seccion vuelve sola a su texto normal.
const FEATURED_OVERRIDE: {
  handle: string;
  eyebrow: string;
  hook: string;
  cta: string;
} | null = {
  handle: "the-classic",
  eyebrow: "La prenda de la semana · Oferta",
  hook: "El polo que más sale de casa. Esta semana, 15 € menos.",
  cta: "Llévatelo por 50 €",
};

// Etiqueta de baja, en la sintaxis de la herramienta que envia. El correo sale
// por Shopify Email, cuya etiqueta es {{ unsubscribe }} (Klaviyo, si algun dia
// se cambia, usa {% unsubscribe %}).
//
// Solo hace falta en el documento completo. Por la ruta normal —pegar el
// correo recortado en un bloque de HTML personalizado— el enlace de baja lo
// pone el propio editor en su pie, y esta etiqueta no se usa.
//
// El enlace de baja es obligatorio: sin el, el envio incumple la ley y dispara
// las quejas por spam. Comprueba siempre en la vista previa que aparece, y una
// sola vez.
// Fotos de cabecera. Rotan por semana igual que la prenda: con una sola, la
// cabecera es fija; añadiendo mas, va cambiando sin tocar nada mas.
//
// Requisitos, que no son capricho:
//
// - JPG o PNG. Nada de SVG: Gmail no lo pinta y la cabecera saldria en blanco
//   (ya paso con el fondo de la cabecera). HEIC tampoco lo abre ningun cliente
//   de correo.
// - Apaisada y de proporcion parecida entre unas y otras. La cabecera se ve a
//   600px de ancho como mucho, y en movil a unos 350; si una foto es mucho mas
//   alta que las demas, la altura del correo baila de una semana a otra. La que
//   hay ahora es 1248x832 (3:2), que es una buena referencia.
// - Que se lea en pequeño. En el movil esto se ve a un tercio de tamaño: una
//   foto de grupo a lo lejos no se distingue, un plano medio si.
//
// Se suben en Shopify (Contenido > Archivos) y aqui se pega la URL del CDN.
//
// El alt no es un tramite: cuando el cliente de correo bloquea las imagenes
// —lo hace siempre en la carpeta de spam, y a menudo con remitentes nuevos— es
// lo unico que se lee en el hueco de la cabecera.
const HEADER_IMAGES: Array<{ url: string; alt: string }> = [
  {
    url: "https://cdn.shopify.com/s/files/1/0988/6364/5011/files/theclassic_den_1.jpg?v=1789028749",
    alt: "Grada cantando de noche, con el polo The Classic de Hools en primer plano",
  },
];

const UNSUBSCRIBE_TAG = "{{ unsubscribe }}";

const DEFAULT_EYEBROW = "La prenda de la semana";
const DEFAULT_CTA = "Ver en la tienda";

// Ojo al meter esto en un href: los & tienen que salir como &amp;, o el HTML
// es invalido. Los navegadores y los clientes de correo lo perdonan, asi que
// la vista previa engaña; el validador de Shopify no, y rechaza el correo
// entero con un error por cada enlace. De ahi que todos los href pasen por
// escapeHtml, que es quien hace esa conversion.
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
  /** Documento completo, para una plantilla HTML. */
  html: string;
  /** Solo el contenido, para el bloque HTML de un editor visual. */
  htmlFragment: string;
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
  // La prenda fijada gana a la rotacion, pero solo si sigue existiendo en el
  // catalogo que se acaba de leer: si se retira de la tienda, el correo vuelve
  // a la rotacion en vez de quedarse sin seccion.
  const pinned = FEATURED_OVERRIDE
    ? products.find((p) => p.handle === FEATURED_OVERRIDE.handle)
    : undefined;
  const product = pinned || products[isoWeek(new Date()) % products.length];

  // El copy de oferta solo se usa si la prenda esta rebajada de verdad. Si la
  // rebaja termina, esto se apaga solo y la seccion vuelve a su texto normal,
  // en vez de anunciar un descuento que ya no existe.
  const promo = pinned && product.priceBefore ? FEATURED_OVERRIDE : null;
  const eyebrow = promo ? promo.eyebrow : DEFAULT_EYEBROW;
  const cta = promo ? promo.cta : DEFAULT_CTA;

  // Misma rotacion semanal que la prenda. Si algun dia la lista se queda
  // vacia, la cabecera se queda sin foto pero el correo sigue saliendo: mejor
  // eso que un hueco roto con el icono de imagen partida.
  const headerImage = HEADER_IMAGES.length
    ? HEADER_IMAGES[isoWeek(new Date()) % HEADER_IMAGES.length]
    : null;

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
      <a href="${escapeHtml(url)}" style="text-decoration:none;">
        ${image}
        <div style="font-family:Georgia, serif; font-size:20px; font-weight:bold; color:#111111; padding-top:12px; line-height:1.3;">${escapeHtml(article.title)}</div>
      </a>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#555555; padding-top:6px;">${escapeHtml(summary)}</div>
      <div style="padding-top:8px;">
        <a href="${escapeHtml(url)}" style="font-family:Arial, Helvetica, sans-serif; font-size:13px; font-weight:bold; color:#111111;">Leer la crónica →</a>
      </div>
    </td>
  </tr>`;
    })
    .join("\n");

  const productUrl = `https://${publicDomain}/products/${product.handle}?${UTM}`;

  // El correo se entrega de dos maneras, porque la herramienta de envio
  // admite las dos y no sirve la misma:
  //
  //   html          Documento completo. Para una plantilla HTML, donde el
  //                 correo es el documento entero.
  //   htmlFragment  Solo el contenido. Para el bloque HTML del editor de
  //                 arrastrar y soltar de Klaviyo, que envuelve lo que le
  //                 pegues en su propio documento y le añade su pie con el
  //                 enlace de baja. Ahi un documento completo quedaria
  //                 anidado dentro de otro, y la linea de baja saldria dos
  //                 veces: la de Klaviyo y la nuestra.
  const buildBody = (withUnsubscribe: boolean) => `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f2;">
<tr><td align="center" style="padding:24px 12px;">

<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px; width:100%; background-color:#ffffff; border-collapse:collapse;">

  <!-- CABECERA: collage del blog y la caja crema.
       El collage va como <img> de verdad, no como background-image de CSS:
       el Gmail del movil descarta los fondos CSS (y el atributo background
       de <td> tampoco es fiable), asi que la cabecera llegaba como un
       rectangulo negro, el color de respaldo.

       El precio de hacerlo bien es que la caja crema queda DEBAJO del
       collage y no encima: superponer texto sobre una imagen en un correo
       exige VML para Outlook, y en cuanto un cliente no lo pinta el texto
       se cae encima de la foto o desaparece. Debajo se ve igual en todas
       partes. -->
  ${
    headerImage
      ? `<tr>
    <td bgcolor="#14130f" style="background-color:#14130f; font-size:0; line-height:0;">
      <img src="${escapeHtml(headerImage.url)}"
           alt="${escapeHtml(headerImage.alt)}" width="600"
           style="width:100%; max-width:600px; height:auto; display:block; border:0;">
    </td>
  </tr>`
      : ""
  }
  <tr>
    <td bgcolor="#14130f"
        style="background-color:#14130f; padding:32px 24px 40px 24px;"
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
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:12px; color:#999999; letter-spacing:3px; text-transform:uppercase; padding-bottom:12px;">${escapeHtml(eyebrow)}</div>
      <a href="${escapeHtml(productUrl)}" style="text-decoration:none;">
        <img src="${escapeHtml(product.imageUrl)}" alt="${escapeHtml(product.title)}" width="536" style="width:100%; height:auto; display:block; border:0;">
        <div style="font-family:Georgia, serif; font-size:22px; font-weight:bold; color:#111111; padding-top:12px;">${escapeHtml(product.title)}</div>
      </a>
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#555555; padding-top:6px;">${escapeHtml(product.blurb)}</div>
      ${promo ? `<div style="font-family:Arial, Helvetica, sans-serif; font-size:14px; line-height:1.6; color:#111111; font-weight:bold; padding-top:8px;">${escapeHtml(promo.hook)}</div>` : ""}
      <div style="font-family:Arial, Helvetica, sans-serif; font-size:16px; font-weight:bold; color:#111111; padding-top:8px;">${
        product.priceBefore
          ? `<span style="color:#999999; font-weight:normal; text-decoration:line-through;">${escapeHtml(product.priceBefore)}</span>&nbsp;&nbsp;`
          : ""
      }${escapeHtml(product.price)}</div>
      <table role="presentation" cellpadding="0" cellspacing="0" style="margin-top:14px;">
        <tr>
          <td style="background-color:#111111; padding:12px 28px;">
            <a href="${escapeHtml(productUrl)}" style="font-family:Arial, Helvetica, sans-serif; font-size:14px; font-weight:bold; color:#ffffff; text-decoration:none; letter-spacing:1px; text-transform:uppercase;">${escapeHtml(cta)}</a>
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
        <a href="${escapeHtml(`https://${publicDomain}?${UTM}`)}" style="color:#999999;">hoolsbrand.com</a>
        &nbsp;·&nbsp;
        <a href="${escapeHtml(`https://${publicDomain}/blogs/${blogHandle}?${UTM}`)}" style="color:#999999;">The Away End</a>
      </div>
      ${
        withUnsubscribe
          ? `<div style="font-family:Arial, Helvetica, sans-serif; font-size:11px; color:#bbbbbb; padding-top:12px;">
        Recibes este correo por ser parte de Hools. ${UNSUBSCRIBE_TAG}
      </div>`
          : ""
      }
    </td>
  </tr>

</table>

</td></tr>
</table>
`;

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>The Away End — Resumen semanal</title>
</head>
<body style="margin:0; padding:0; background-color:#f4f4f2;">
${buildBody(true)}
</body>
</html>
`;

  const htmlFragment = buildBody(false).trim();

  return {
    subject: `${truncate(articles[0].title, 60)} — la semana en The Away End`,
    // El texto de vista previa es lo que decide si el correo se abre, asi que
    // cuando hay oferta la anuncia ahi, con el precio que manda la tienda.
    previewText: promo
      ? `3 crónicas de las gradas + ${product.title} rebajado a ${product.price}`
      : "3 crónicas de las gradas + la prenda de la semana",
    html,
    htmlFragment,
    articleTitles: articles.map((a) => a.title),
    productTitle: product.title,
    productFallback,
  };
}
