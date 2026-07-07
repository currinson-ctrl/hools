interface OpenverseResult {
  url?: string;
}

interface OpenverseResponse {
  results?: OpenverseResult[];
}

/**
 * Busca una foto de stock con licencia libre relacionada con la consulta,
 * via la API publica de Openverse (sin necesidad de clave de API). Se usa
 * como respaldo cuando la fuente RSS original no trae ninguna imagen.
 * Devuelve null si no encuentra nada o si falla la peticion, sin lanzar
 * error (no debe bloquear la creacion del articulo).
 */
export async function searchRelatedImage(
  query: string,
  exclude?: string | null
): Promise<string | null> {
  try {
    const url = `https://api.openverse.org/v1/images/?q=${encodeURIComponent(
      query
    )}&page_size=5&license_type=commercial&mature=false`;

    const res = await fetch(url, {
      headers: { "User-Agent": "HoolsBrandBot/1.0 (+https://hoolsbrand.com)" },
    });
    if (!res.ok) return null;

    const json = (await res.json()) as OpenverseResponse;
    const match = json.results?.find(
      (r) => typeof r.url === "string" && r.url.length > 0 && r.url !== exclude
    );
    return match?.url ?? null;
  } catch (err) {
    console.error("Fallo al buscar imagen relacionada en Openverse:", err);
    return null;
  }
}
