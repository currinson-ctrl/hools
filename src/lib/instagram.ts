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

// El contenedor de media tarda un poco en procesar la imagen/video antes de
// poder publicarlo: se consulta su estado con un pequeño backoff en vez de
// publicar a ciegas justo despues de crearlo. Un video tarda bastante mas
// que una foto, de ahi que los intentos sean configurables.
async function waitUntilReady(
  containerId: string,
  accessToken: string,
  attempts = 5,
  delayMs = 1500
): Promise<void> {
  for (let attempt = 0; attempt < attempts; attempt++) {
    const res = await fetch(
      `https://graph.instagram.com/${GRAPH_VERSION}/${containerId}?fields=status_code&access_token=${accessToken}`
    );
    const data = (await res.json()) as { status_code?: string };
    if (data.status_code === "FINISHED") return;
    if (data.status_code === "ERROR") {
      throw new Error("Instagram no pudo procesar el contenido del contenedor");
    }
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }
}

async function publishContainer(containerId: string, userId: string, accessToken: string): Promise<string> {
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

  return publishContainer(containerId, userId, accessToken);
}

/**
 * Publica un reel: video con pie de foto, que ademas aparece en la cuadricula
 * del perfil (share_to_feed). Instagram tarda bastante mas en procesar un
 * reel que una foto, de ahi la espera larga.
 */
export async function postReelToInstagram(
  caption: string,
  videoUrl: string,
  coverImageUrl?: string | null
): Promise<string> {
  const accessToken = getEnv("INSTAGRAM_ACCESS_TOKEN");
  const userId = getEnv("INSTAGRAM_USER_ID");

  const container = await graphPost(`${userId}/media`, {
    media_type: "REELS",
    video_url: videoUrl,
    caption,
    share_to_feed: "true",
    access_token: accessToken,
    ...(coverImageUrl ? { cover_url: coverImageUrl } : {}),
  });
  const containerId = container.id as string | undefined;
  if (!containerId) {
    throw new Error(`Instagram no devolvio un id de contenedor: ${JSON.stringify(container)}`);
  }

  await waitUntilReady(containerId, accessToken, 30, 4000);

  return publishContainer(containerId, userId, accessToken);
}

/**
 * Publica una story de Instagram con el video del tuit (preferido) o, si no
 * hay video, con la imagen de portada. Las stories de la API no llevan pie
 * de texto (Instagram lo ignora), asi que solo se envia el medio.
 */
export async function postStoryToInstagram(media: {
  videoUrl?: string | null;
  imageUrl?: string | null;
}): Promise<string> {
  const accessToken = getEnv("INSTAGRAM_ACCESS_TOKEN");
  const userId = getEnv("INSTAGRAM_USER_ID");

  const params: Record<string, string> = {
    media_type: "STORIES",
    access_token: accessToken,
  };
  if (media.videoUrl) {
    params.video_url = media.videoUrl;
  } else if (media.imageUrl) {
    params.image_url = media.imageUrl;
  } else {
    throw new Error("Una story necesita un video o una imagen");
  }

  const container = await graphPost(`${userId}/media`, params);
  const containerId = container.id as string | undefined;
  if (!containerId) {
    throw new Error(`Instagram no devolvio un id de contenedor: ${JSON.stringify(container)}`);
  }

  // Los videos tardan en procesarse mucho mas que las fotos.
  await waitUntilReady(containerId, accessToken, media.videoUrl ? 20 : 5, 3000);

  return publishContainer(containerId, userId, accessToken);
}
