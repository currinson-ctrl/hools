const GRAPH_VERSION = "v21.0";

function getEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Falta la variable de entorno ${name}`);
  return value;
}

export function isInstagramConfigured(): boolean {
  return Boolean(process.env.INSTAGRAM_ACCESS_TOKEN && process.env.INSTAGRAM_USER_ID);
}

async function graphPost(path: string, params: Record<string, string>): Promise<Record<string, unknown>> {
  const res = await fetch(`https://graph.instagram.com/${GRAPH_VERSION}/${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
  const data = (await res.json()) as Record<string, unknown>;
  if (!res.ok) {
    throw new Error(`Error de la API de Instagram: ${JSON.stringify(data)}`);
  }
  return data;
}

// El contenedor de media tarda un poco en procesar la imagen antes de poder
// publicarlo: se consulta su estado con un pequeño backoff en vez de
// publicar a ciegas justo despues de crearlo.
async function waitUntilReady(containerId: string, accessToken: string): Promise<void> {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = (await res.json()) as { status_code?: string };
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error("Instagram no pudo procesar la imagen del contenedor");
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
}

/**
 * Publica una foto en el feed de Instagram (proceso en dos pasos de la
 * Instagram API: crear el contenedor de media y luego publicarlo).
 * Instagram exige imagen siempre, no hay publicaciones solo de texto.
 */
export async function postToInstagram(caption: string, imageUrl: string): Promise<string> {
  const accessToken = getEnv("INSTAGRAM_ACCESS_TOKEN");
  const userId = getEnv("INSTAGRAM_USER_ID");

  const container = await graphPost(`${userId}/media`, {
    image_url: imageUrl,
    caption,
    access_token: accessToken,
  });
  const containerId = container.id as string | undefined;
  if (!containerId) {
    throw new Error(`Instagram no devolvio un id de contenedor: ${JSON.stringify(container)}`);
  }

  await waitUntilReady(containerId, accessToken);

  const published = await graphPost(`${userId}/media_publish`, {
    creation_id: containerId,
    access_token: accessToken,
  });
  const mediaId = published.id as string | undefined;
  if (!mediaId) {
    throw new Error(`Instagram no devolvio un id de publicacion: ${JSON.stringify(published)}`);
  }
  return mediaId;
}
