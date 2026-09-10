import { extractLead } from "./article-html";

interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
}

// Cualquier fallo al procesar la imagen (descarga, timeout, formato invalido,
// o demasiados megapixeles) no debe bloquear el articulo entero: se reintenta
// sin imagen en vez de perder el texto por un problema ajeno a nosotros.
function isImageFailure(msg: string): boolean {
  return (
    /image/i.test(msg) &&
    /(failed to download|upload failed|timeout|could not|invalid|pixel limit|too large|exceeds)/i.test(
      msg
    )
  );
}

interface ArticleCreateResponse {
  articleCreate: {
    article: { id: string; handle: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

interface ArticleDeleteResponse {
  articleDelete: {
    deletedArticleId: string | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

interface ArticleUpdateResponse {
  articleUpdate: {
    article: { id: string; handle: string } | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

const ARTICLE_CREATE_MUTATION = /* GraphQL */ `
  mutation CreateArticle($article: ArticleCreateInput!) {
    articleCreate(article: $article) {
      article {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const ARTICLE_DELETE_MUTATION = /* GraphQL */ `
  mutation DeleteArticle($id: ID!) {
    articleDelete(id: $id) {
      deletedArticleId
      userErrors {
        field
        message
      }
    }
  }
`;

const ARTICLE_UPDATE_MUTATION = /* GraphQL */ `
  mutation UpdateArticle($id: ID!, $article: ArticleUpdateInput!) {
    articleUpdate(id: $id, article: $article) {
      article {
        id
        handle
      }
      userErrors {
        field
        message
      }
    }
  }
`;

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

// Las apps del Dev Dashboard de Shopify (desde 2026) ya no exponen un token
// fijo: hay que canjear el Client ID + Client Secret por un access token de
// corta duracion (~24h) en cada uso, via el grant "client_credentials".
// https://shopify.dev/docs/apps/build/authentication-authorization/access-tokens/client-credentials-grant
async function getAccessToken(domain: string): Promise<string> {
  const clientId = getEnv("SHOPIFY_CLIENT_ID");
  const clientSecret = getEnv("SHOPIFY_CLIENT_SECRET");

  const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");

  const res = await fetch(`https://${domain}/admin/oauth/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${basicAuth}`,
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  if (!res.ok) {
    throw new Error(`Shopify OAuth token respondio ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) {
    throw new Error("Shopify OAuth token: respuesta sin access_token");
  }
  return json.access_token;
}

/**
 * Permiso de la app que hace falta para cada campo de la Admin API que este
 * proyecto usa. Shopify contesta a un scope que falta con un escueto "Access
 * denied for <campo> field", que no dice cual es ni donde se arregla.
 */
const SCOPE_BY_FIELD: Record<string, string> = {
  stagedUploadsCreate: "write_files",
  fileCreate: "write_files",
  files: "read_files",
  articleCreate: "write_content",
  articleUpdate: "write_content",
  articleDelete: "write_content",
  products: "read_products",
};

/**
 * Traduce los errores de la Admin API a algo accionable. El caso que importa
 * es el permiso que falta: se nombra el scope y donde se añade, en vez de
 * dejar al revisor con el mensaje crudo de Shopify.
 */
function describeShopifyErrors(messages: string[]): string {
  const denied = messages
    .map((m) => /Access denied for (\w+)/.exec(m)?.[1])
    .filter((field): field is string => Boolean(field));

  if (!denied.length) return `Shopify GraphQL error: ${messages.join("; ")}`;

  const scopes = [...new Set(denied.map((f) => SCOPE_BY_FIELD[f]).filter(Boolean))];
  const varios = scopes.length > 1;
  const queja = scopes.length
    ? `A tu app de Shopify le ${varios ? "faltan los permisos" : "falta el permiso"} ${scopes.join(" y ")}`
    : `Tu app de Shopify no tiene permiso para ${[...new Set(denied)].join(", ")}`;

  return (
    `${queja}. ${varios ? "Añádelos" : "Añádelo"} a los scopes de la app en el Dev ` +
    `Dashboard de Shopify y vuelve a intentarlo: el token se renueva solo, no hay ` +
    `que desplegar nada.`
  );
}

async function shopifyAdminRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const domain = getEnv("SHOPIFY_STORE_DOMAIN");
  const token = await getAccessToken(domain);
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2026-04";

  const res = await fetch(
    `https://${domain}/admin/api/${apiVersion}/graphql.json`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Shopify-Access-Token": token,
      },
      body: JSON.stringify({ query, variables }),
    }
  );

  if (!res.ok) {
    throw new Error(`Shopify Admin API respondio ${res.status}: ${await res.text()}`);
  }

  const json = (await res.json()) as ShopifyGraphQLResponse<T>;
  if (json.errors?.length) {
    throw new Error(describeShopifyErrors(json.errors.map((e) => e.message)));
  }
  if (!json.data) {
    throw new Error("Shopify GraphQL: respuesta sin data");
  }
  return json.data;
}

export interface PublishArticleInput {
  title: string;
  bodyHtml: string;
  tags: string[];
  imageUrl?: string | null;
}

/**
 * Shopify usa `summary` para mostrar el articulo en el listado del blog y
 * como meta description; sin el, el tema recorta el cuerpo a lo bruto. Se
 * toma la entradilla, que es la frase escrita justo para eso, y solo se
 * recae en el primer parrafo si el articulo no la trae (los publicados antes
 * de maquetar el blog).
 */
function buildSummary(bodyHtml: string): string {
  const source =
    extractLead(bodyHtml) ??
    /<p[^>]*>([\s\S]*?)<\/p>/i.exec(bodyHtml)?.[1] ??
    bodyHtml;
  const text = source.replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
  return text.length <= 155 ? text : text.slice(0, 154).trimEnd() + "…";
}

export interface PublishArticleResult {
  shopifyArticleId: string;
  handle: string;
}

/**
 * Sin sufijo de plantilla, Shopify renderiza el articulo con la plantilla de
 * serie del tema (que recorta la imagen destacada a un banner) en vez de con
 * la editorial de Hools. Es facil no darse cuenta porque el sufijo del blog no
 * lo heredan sus articulos: hay que ponerlo articulo a articulo.
 */
function articleTemplateSuffix(): string | null {
  const suffix = process.env.SHOPIFY_ARTICLE_TEMPLATE_SUFFIX;
  if (suffix === undefined) return "hools-editorial";
  return suffix.trim() || null;
}

async function createArticle(
  input: PublishArticleInput,
  blogId: string,
  includeImage: boolean
): Promise<ArticleCreateResponse["articleCreate"]> {
  const data = await shopifyAdminRequest<ArticleCreateResponse>(
    ARTICLE_CREATE_MUTATION,
    {
      article: {
        blogId,
        title: input.title,
        body: input.bodyHtml,
        summary: buildSummary(input.bodyHtml),
        author: { name: "Hools" },
        tags: input.tags,
        isPublished: true,
        templateSuffix: articleTemplateSuffix(),
        ...(includeImage && input.imageUrl
          ? { image: { url: input.imageUrl, altText: input.title } }
          : {}),
      },
    }
  );
  return data.articleCreate;
}

export async function publishArticleToShopify(
  input: PublishArticleInput
): Promise<PublishArticleResult> {
  const blogId = getEnv("SHOPIFY_BLOG_ID");

  let { article, userErrors } = await createArticle(input, blogId, true);

  if (userErrors.length && input.imageUrl && userErrors.every((e) => isImageFailure(e.message))) {
    console.error(
      "La imagen no se pudo procesar en Shopify, publicando sin imagen:",
      userErrors.map((e) => e.message).join("; ")
    );
    ({ article, userErrors } = await createArticle(input, blogId, false));
  }

  if (userErrors.length) {
    throw new Error(
      `Shopify articleCreate userErrors: ${userErrors.map((e) => e.message).join("; ")}`
    );
  }
  if (!article) {
    throw new Error("Shopify articleCreate no devolvio el articulo creado");
  }

  return { shopifyArticleId: article.id, handle: article.handle };
}

export interface UpdateArticleInput {
  title?: string;
  bodyHtml?: string;
  imageUrl?: string | null;
}

async function updateArticle(
  shopifyArticleId: string,
  input: UpdateArticleInput,
  includeImage: boolean
): Promise<ArticleUpdateResponse["articleUpdate"]> {
  const data = await shopifyAdminRequest<ArticleUpdateResponse>(ARTICLE_UPDATE_MUTATION, {
    id: shopifyArticleId,
    article: {
      // Se reenvia en cada actualizacion a proposito: asi los articulos que se
      // publicaron sin sufijo (y salieron con la plantilla de serie) quedan
      // reparados al pasar por el remaquetado o por una edicion.
      templateSuffix: articleTemplateSuffix(),
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.bodyHtml !== undefined
        ? { body: input.bodyHtml, summary: buildSummary(input.bodyHtml) }
        : {}),
      ...(includeImage && input.imageUrl
        ? { image: { url: input.imageUrl, ...(input.title ? { altText: input.title } : {}) } }
        : {}),
    },
  });
  return data.articleUpdate;
}

export async function updateArticleOnShopify(
  shopifyArticleId: string,
  input: UpdateArticleInput
): Promise<void> {
  let { userErrors } = await updateArticle(shopifyArticleId, input, true);

  if (userErrors.length && input.imageUrl && userErrors.every((e) => isImageFailure(e.message))) {
    console.error(
      "La imagen no se pudo procesar en Shopify al actualizar, se guarda sin cambiar la imagen:",
      userErrors.map((e) => e.message).join("; ")
    );
    ({ userErrors } = await updateArticle(shopifyArticleId, input, false));
  }

  if (userErrors.length) {
    throw new Error(
      `Shopify articleUpdate userErrors: ${userErrors.map((e) => e.message).join("; ")}`
    );
  }
}

export async function deleteArticleFromShopify(shopifyArticleId: string): Promise<void> {
  const data = await shopifyAdminRequest<ArticleDeleteResponse>(ARTICLE_DELETE_MUTATION, {
    id: shopifyArticleId,
  });

  const { userErrors } = data.articleDelete;
  const alreadyGone = userErrors.some((e) =>
    /not found|does not exist|no existe/i.test(e.message)
  );
  if (userErrors.length && !alreadyGone) {
    throw new Error(
      `Shopify articleDelete userErrors: ${userErrors.map((e) => e.message).join("; ")}`
    );
  }
}

interface ProductsResponse {
  products: {
    nodes: Array<{
      title: string;
      handle: string;
      description: string;
      isGiftCard: boolean;
      featuredMedia: { preview: { image: { url: string } | null } | null } | null;
      priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
      compareAtPriceRange: {
        minVariantCompareAtPrice: { amount: string; currencyCode: string } | null;
      };
    }>;
  };
}

const PRODUCTS_QUERY = /* GraphQL */ `
  query NewsletterProducts {
    products(first: 12, query: "status:active", sortKey: CREATED_AT) {
      nodes {
        title
        handle
        description
        isGiftCard
        featuredMedia {
          preview {
            image {
              url
            }
          }
        }
        priceRangeV2 {
          minVariantPrice {
            amount
            currencyCode
          }
        }
        compareAtPriceRange {
          minVariantCompareAtPrice {
            amount
            currencyCode
          }
        }
      }
    }
  }
`;

function formatPrice(amount: string): string {
  return `${Number(amount).toFixed(2).replace(".", ",")} €`;
}

function isOnSale(p: {
  priceRangeV2: { minVariantPrice: { amount: string } };
  compareAtPriceRange: { minVariantCompareAtPrice: { amount: string } | null };
}): boolean {
  const before = p.compareAtPriceRange.minVariantCompareAtPrice;
  if (!before) return false;
  return Number(before.amount) > Number(p.priceRangeV2.minVariantPrice.amount);
}

/**
 * Productos activos de la tienda para el resumen semanal. Requiere el scope
 * read_products en la app: si la app solo tiene scopes de contenido, la
 * llamada falla y quien llama debe usar su catalogo de respaldo.
 */
export async function fetchActiveProducts(): Promise<
  Array<{
    title: string;
    handle: string;
    price: string;
    priceBefore: string | null;
    imageUrl: string;
    blurb: string;
  }>
> {
  const data = await shopifyAdminRequest<ProductsResponse>(PRODUCTS_QUERY, {});
  return data.products.nodes
    // La seccion del correo es "la prenda de la semana": la tarjeta regalo es
    // un producto activo con foto y precio, y colarse ahi la dejaria como
    // recomendacion de vestuario.
    .filter((p) => !p.isGiftCard && p.featuredMedia?.preview?.image?.url)
    .map((p) => ({
      title: p.title,
      handle: p.handle,
      price: formatPrice(p.priceRangeV2.minVariantPrice.amount),
      // Precio tachado. Shopify solo lo trae cuando la prenda esta rebajada
      // de verdad (compare-at por encima del precio), asi que el correo
      // anuncia la oferta mientras exista y deja de hacerlo cuando termine,
      // sin que nadie tenga que acordarse de quitarlo.
      priceBefore: isOnSale(p) ? formatPrice(p.compareAtPriceRange.minVariantCompareAtPrice!.amount) : null,
      imageUrl: p.featuredMedia!.preview!.image!.url,
      blurb: p.description.length > 160 ? p.description.slice(0, 159).trimEnd() + "…" : p.description,
    }));
}

// ---------------------------------------------------------------------------
// Subida de fotos y videos a los Archivos de Shopify
//
// Las noticias escritas a mano traen el material desde el ordenador, no desde
// una URL de un feed. Todo lo que publica el sistema consume la foto y el
// video como URL publica (Shopify descarga la imagen del articulo; X se baja
// el mp4 para adjuntarlo; Instagram le pide a Meta que lo descargue), y el
// panel corre en serverless, sin disco donde guardarlos. Asi que el archivo
// se sube a los Archivos de la propia tienda y se usa la URL de su CDN.
//
// El archivo NO pasa por el servidor del panel: este modulo solo firma el
// destino de subida (createStagedUpload), y el navegador sube ahi
// directamente. Es lo que permite subir un video de 80 MB desde una funcion
// de Vercel, que corta cualquier peticion de mas de 4,5 MB.
//
// Requiere el scope write_files en la app de Shopify.
// ---------------------------------------------------------------------------

const STAGED_UPLOADS_MUTATION = /* GraphQL */ `
  mutation StageUpload($input: [StagedUploadInput!]!) {
    stagedUploadsCreate(input: $input) {
      stagedTargets {
        url
        resourceUrl
        parameters {
          name
          value
        }
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_CREATE_MUTATION = /* GraphQL */ `
  mutation CreateFile($files: [FileCreateInput!]!) {
    fileCreate(files: $files) {
      files {
        id
        fileStatus
      }
      userErrors {
        field
        message
      }
    }
  }
`;

const FILE_STATUS_QUERY = /* GraphQL */ `
  query FileStatus($id: ID!) {
    node(id: $id) {
      ... on MediaImage {
        fileStatus
        fileErrors {
          message
        }
        image {
          url
        }
      }
      ... on Video {
        fileStatus
        fileErrors {
          message
        }
        preview {
          image {
            url
          }
        }
        sources {
          url
          mimeType
          format
          height
        }
      }
    }
  }
`;

interface StagedUploadsResponse {
  stagedUploadsCreate: {
    stagedTargets: Array<{
      url: string;
      resourceUrl: string;
      parameters: Array<{ name: string; value: string }>;
    }>;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

interface FileCreateResponse {
  fileCreate: {
    files: Array<{ id: string; fileStatus: string }> | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

interface FileStatusResponse {
  node: {
    fileStatus: string;
    fileErrors: Array<{ message: string }>;
    image?: { url: string } | null;
    preview?: { image: { url: string } | null } | null;
    sources?: Array<{ url: string; mimeType: string; format: string; height: number }> | null;
  } | null;
}

export function isShopifyConfigured(): boolean {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN &&
      process.env.SHOPIFY_CLIENT_ID &&
      process.env.SHOPIFY_CLIENT_SECRET
  );
}

export type UploadKind = "image" | "video";

export interface StagedUploadTarget {
  /** URL a la que el navegador sube el archivo (un POST multipart). */
  url: string;
  /** Referencia del archivo ya subido, con la que se registra en la tienda. */
  resourceUrl: string;
  /** Campos firmados que deben ir ANTES del archivo en el formulario. */
  parameters: Array<{ name: string; value: string }>;
}

/**
 * Pide a Shopify un destino de subida firmado. Lo consume el navegador, que
 * es quien sube el archivo: aqui solo viaja el nombre, el tipo y el tamaño.
 */
export async function createStagedUpload(input: {
  filename: string;
  mimeType: string;
  fileSize: number;
  kind: UploadKind;
}): Promise<StagedUploadTarget> {
  const data = await shopifyAdminRequest<StagedUploadsResponse>(STAGED_UPLOADS_MUTATION, {
    input: [
      {
        filename: input.filename,
        mimeType: input.mimeType,
        // Los videos van por su propio canal de subida (se transcodifican
        // despues); las fotos entran como archivo suelto de la tienda.
        resource: input.kind === "video" ? "VIDEO" : "FILE",
        httpMethod: "POST",
        fileSize: String(input.fileSize),
      },
    ],
  });

  const { stagedTargets, userErrors } = data.stagedUploadsCreate;
  if (userErrors.length) {
    throw new Error(
      `Shopify stagedUploadsCreate: ${userErrors.map((e) => e.message).join("; ")}`
    );
  }
  const target = stagedTargets[0];
  if (!target) throw new Error("Shopify stagedUploadsCreate no devolvio destino de subida");
  return target;
}

/**
 * Registra en los Archivos de la tienda un archivo ya subido al destino
 * firmado. Devuelve su id: Shopify lo procesa en segundo plano (una foto
 * tarda segundos, un video puede tardar minutos), asi que la URL definitiva
 * se pregunta despues con getUploadedFile.
 */
export async function createShopifyFile(input: {
  resourceUrl: string;
  filename: string;
  kind: UploadKind;
}): Promise<string> {
  const data = await shopifyAdminRequest<FileCreateResponse>(FILE_CREATE_MUTATION, {
    files: [
      {
        originalSource: input.resourceUrl,
        contentType: input.kind === "video" ? "VIDEO" : "IMAGE",
        alt: input.filename,
      },
    ],
  });

  const { files, userErrors } = data.fileCreate;
  if (userErrors.length) {
    throw new Error(`Shopify fileCreate: ${userErrors.map((e) => e.message).join("; ")}`);
  }
  const file = files?.[0];
  if (!file) throw new Error("Shopify fileCreate no devolvio el archivo creado");
  return file.id;
}

export interface UploadedFile {
  ready: boolean;
  /** URL publica de la foto, o del mp4 del video. Solo cuando ready. */
  url: string | null;
  /** Miniatura del video (Shopify la saca de un fotograma). Solo videos. */
  previewUrl: string | null;
}

/**
 * Estado de un archivo subido. Mientras Shopify lo procesa devuelve
 * `ready: false` y quien llama vuelve a preguntar; si el procesado falla,
 * lanza con el motivo que da Shopify.
 */
export async function getUploadedFile(fileId: string): Promise<UploadedFile> {
  const data = await shopifyAdminRequest<FileStatusResponse>(FILE_STATUS_QUERY, { id: fileId });
  const node = data.node;
  if (!node) return { ready: false, url: null, previewUrl: null };

  if (node.fileStatus === "FAILED") {
    throw new Error(
      `Shopify no pudo procesar el archivo: ${
        node.fileErrors.map((e) => e.message).join("; ") || "sin detalle"
      }`
    );
  }

  if (node.image?.url) {
    return { ready: true, url: node.image.url, previewUrl: null };
  }

  const source = pickVideoSource(node.sources ?? []);
  if (source) {
    return {
      ready: true,
      url: source.url,
      previewUrl: node.preview?.image?.url ?? null,
    };
  }

  return { ready: false, url: null, previewUrl: null };
}

/**
 * De las versiones que genera Shopify al transcodificar un video se elige el
 * mp4 mas grande hasta 1080p: es el formato que aceptan tanto X como
 * Instagram, y por encima de 1080 solo se gana peso (X corta a 512 MB) sin
 * que se note en un movil.
 */
function pickVideoSource(
  sources: Array<{ url: string; mimeType: string; format: string; height: number }>
): { url: string } | null {
  const mp4s = sources.filter(
    (s) => s.mimeType === "video/mp4" || s.format?.toLowerCase() === "mp4"
  );
  const candidates = mp4s.length ? mp4s : sources;
  if (!candidates.length) return null;

  const upTo1080 = candidates.filter((s) => (s.height ?? 0) <= 1080);
  const pool = upTo1080.length ? upTo1080 : candidates;
  return pool.reduce((best, s) => ((s.height ?? 0) > (best.height ?? 0) ? s : best));
}
