interface ShopifyGraphQLResponse<T> {
  data?: T;
  errors?: Array<{ message: string }>;
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

  // Si el unico problema es que Shopify no pudo descargar la imagen (host
  // lento/caido, timeout), no debe bloquear todo el articulo: se reintenta
  // sin imagen en vez de perder el texto por un fallo ajeno a nosotros.
  const isImageFailure = (msg: string) =>
    /image/i.test(msg) && /(failed to download|timeout|could not|invalid)/i.test(msg);

  if (userErrors.length && input.imageUrl && userErrors.every((e) => isImageFailure(e.message))) {
    console.error(
      "La imagen no se pudo descargar en Shopify, publicando sin imagen:",
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
