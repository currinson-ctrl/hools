const GRAPH_VERSION = "v21.0";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function isFacebookConfigured(): boolean {
  return Boolean(process.env.FACEBOOK_PAGE_ID && process.env.FACEBOOK_PAGE_ACCESS_TOKEN);
}

async function graphPost(
  path: string,
  params: Record<string, string>
): Promise<Record<string, unknown>> {
  const res = await fetch(`https://graph.facebook.com/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Error de la API de Facebook: ${JSON.stringify(data)}`);
  }
  return data;
}

/**
 * Publica en la pagina de Facebook de la marca. Con imagen se sube como
 * foto (mas alcance) y el enlace va dentro del texto, que Facebook convierte
 * en enlace automaticamente; sin imagen se publica como enlace normal, que
 * genera la tarjeta de vista previa del articulo.
 */
export async function postToFacebook(
  message: string,
  link: string,
  imageUrl?: string | null
): Promise<string> {
  const pageId = getEnv("FACEBOOK_PAGE_ID");
  const accessToken = getEnv("FACEBOOK_PAGE_ACCESS_TOKEN");

  if (imageUrl) {
    const data = await graphPost(`${pageId}/photos`, {
      url: imageUrl,
      caption: `${message}\n\n${link}`,
      access_token: accessToken,
    });
    const id = (data.post_id || data.id) as string | undefined;
    if (!id) throw new Error(`Facebook no devolvio id de publicacion: ${JSON.stringify(data)}`);
    return id;
  }

  const data = await graphPost(`${pageId}/feed`, {
    message,
    link,
    access_token: accessToken,
  });
  const id = data.id as string | undefined;
  if (!id) throw new Error(`Facebook no devolvio id de publicacion: ${JSON.stringify(data)}`);
  return id;
}
