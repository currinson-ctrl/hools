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

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

async function shopifyAdminRequest<T>(
  query: string,
  variables: Record<string, unknown>
): Promise<T> {
  const domain = getEnv("SHOPIFY_STORE_DOMAIN");
  const token = getEnv("SHOPIFY_ADMIN_ACCESS_TOKEN");
  const apiVersion = process.env.SHOPIFY_API_VERSION || "2025-01";

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

export async function publishArticleToShopify(
  input: PublishArticleInput
): Promise<PublishArticleResult> {
  const blogId = getEnv("SHOPIFY_BLOG_ID");

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
        ...(input.imageUrl ? { image: { url: input.imageUrl } } : {}),
      },
    }
  );

  const { article, userErrors } = data.articleCreate;
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
