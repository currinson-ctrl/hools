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
    throw new Error(`Shopify GraphQL error: ${json.errors.map((e) => e.message).join("; ")}`);
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
      featuredMedia: { preview: { image: { url: string } | null } | null } | null;
      priceRangeV2: { minVariantPrice: { amount: string; currencyCode: string } };
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
      }
    }
  }
`;

/**
 * Productos activos de la tienda para el resumen semanal. Requiere el scope
 * read_products en la app: si la app solo tiene scopes de contenido, la
 * llamada falla y quien llama debe usar su catalogo de respaldo.
 */
export async function fetchActiveProducts(): Promise<
  Array<{ title: string; handle: string; price: string; imageUrl: string; blurb: string }>
> {
  const data = await shopifyAdminRequest<ProductsResponse>(PRODUCTS_QUERY, {});
  return data.products.nodes
    .filter((p) => p.featuredMedia?.preview?.image?.url)
    .map((p) => ({
      title: p.title,
      handle: p.handle,
      price: `${Number(p.priceRangeV2.minVariantPrice.amount).toFixed(2).replace(".", ",")} €`,
      imageUrl: p.featuredMedia!.preview!.image!.url,
      blurb: p.description.length > 160 ? p.description.slice(0, 159).trimEnd() + "…" : p.description,
    }));
}

// ---------------------------------------------------------------------------
// Subida de fotos a los Archivos de Shopify
//
// Las noticias escritas a mano en el panel traen la foto desde el ordenador,
// no desde una URL de un feed. Shopify solo acepta imagenes por URL publica
// (tanto en articleCreate como en articleUpdate), y el panel corre en
// serverless (sin disco persistente donde guardarlas), asi que el fichero se
// sube a los Archivos de la propia tienda y se usa la URL de su CDN. Requiere
// el scope write_files en la app.
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
        ... on MediaImage {
          image {
            url
          }
        }
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
        id
        fileStatus
        fileErrors {
          message
        }
        image {
          url
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
    files: Array<{ id: string; fileStatus: string; image?: { url: string } | null }> | null;
    userErrors: Array<{ field: string[] | null; message: string }>;
  };
}

interface FileStatusResponse {
  node: {
    id: string;
    fileStatus: string;
    fileErrors: Array<{ message: string }>;
    image: { url: string } | null;
  } | null;
}

export function isShopifyConfigured(): boolean {
  return Boolean(
    process.env.SHOPIFY_STORE_DOMAIN &&
      process.env.SHOPIFY_CLIENT_ID &&
      process.env.SHOPIFY_CLIENT_SECRET
  );
}

/**
 * Sube una imagen a los Archivos de Shopify y devuelve su URL publica de CDN,
 * lista para usarse como imagen destacada del articulo.
 *
 * Shopify procesa la imagen en segundo plano: recien creada esta en estado
 * UPLOADED y todavia no tiene URL, asi que hay que preguntar por ella hasta
 * que pase a READY. El sondeo es corto a proposito (unos segundos): si la
 * tienda tarda mas, se devuelve null y quien llama guarda la noticia sin
 * foto en vez de bloquear el formulario.
 */
export async function uploadImageToShopifyFiles(file: {
  bytes: ArrayBuffer;
  filename: string;
  mimeType: string;
}): Promise<string | null> {
  const staged = await shopifyAdminRequest<StagedUploadsResponse>(STAGED_UPLOADS_MUTATION, {
    input: [
      {
        filename: file.filename,
        mimeType: file.mimeType,
        resource: "FILE",
        httpMethod: "POST",
        fileSize: String(file.bytes.byteLength),
      },
    ],
  });

  if (staged.stagedUploadsCreate.userErrors.length) {
    throw new Error(
      `Shopify stagedUploadsCreate: ${staged.stagedUploadsCreate.userErrors
        .map((e) => e.message)
        .join("; ")}`
    );
  }

  const target = staged.stagedUploadsCreate.stagedTargets[0];
  if (!target) throw new Error("Shopify stagedUploadsCreate no devolvio destino de subida");

  // El orden importa: los parametros firmados van antes del fichero.
  const form = new FormData();
  for (const param of target.parameters) form.append(param.name, param.value);
  form.append("file", new Blob([file.bytes], { type: file.mimeType }), file.filename);

  const uploadRes = await fetch(target.url, { method: "POST", body: form });
  if (!uploadRes.ok) {
    throw new Error(
      `La subida de la imagen a Shopify respondio ${uploadRes.status}: ${(
        await uploadRes.text()
      ).slice(0, 300)}`
    );
  }

  const created = await shopifyAdminRequest<FileCreateResponse>(FILE_CREATE_MUTATION, {
    files: [
      {
        originalSource: target.resourceUrl,
        contentType: "IMAGE",
        alt: file.filename,
      },
    ],
  });

  if (created.fileCreate.userErrors.length) {
    throw new Error(
      `Shopify fileCreate: ${created.fileCreate.userErrors.map((e) => e.message).join("; ")}`
    );
  }

  const createdFile = created.fileCreate.files?.[0];
  if (!createdFile) throw new Error("Shopify fileCreate no devolvio el archivo creado");
  if (createdFile.image?.url) return createdFile.image.url;

  for (let attempt = 0; attempt < 10; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    const status = await shopifyAdminRequest<FileStatusResponse>(FILE_STATUS_QUERY, {
      id: createdFile.id,
    });
    const node = status.node;
    if (!node) continue;
    if (node.fileStatus === "FAILED") {
      throw new Error(
        `Shopify no pudo procesar la imagen: ${
          node.fileErrors.map((e) => e.message).join("; ") || "sin detalle"
        }`
      );
    }
    if (node.image?.url) return node.image.url;
  }

  return null;
}
