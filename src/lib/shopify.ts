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

export interface PublishArticleResult {
  shopifyArticleId: string;
  handle: string;
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
        author: { name: "Hools" },
        tags: input.tags,
        isPublished: true,
        ...(includeImage && input.imageUrl ? { image: { url: input.imageUrl } } : {}),
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
      ...(input.title !== undefined ? { title: input.title } : {}),
      ...(input.bodyHtml !== undefined ? { body: input.bodyHtml } : {}),
      ...(includeImage && input.imageUrl ? { image: { url: input.imageUrl } } : {}),
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
