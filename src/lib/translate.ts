import Anthropic from "@anthropic-ai/sdk";

const MODEL = "claude-haiku-4-5-20251001";

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export interface TranslatedSummary {
  title: string;
  /** Cuerpo del articulo ya con parrafos separados por saltos de linea dobles. */
  body: string;
}

function extractJson(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Genera un titular + articulo completo en español de España a partir del
 * original (normalmente en ingles), con tono editorial propio: no es un
 * resumen corto ni una traduccion literal, sino una pieza original de
 * varios parrafos inspirada en el tema (contexto, trasfondo, analisis desde
 * la optica de aficion/ultras, desplazamientos o moda casual), usando el
 * titular y fragmento original solo como punto de partida. Si falla (red,
 * limite de uso, respuesta no valida) devuelve el original sin traducir
 * para no bloquear la agregacion de esa noticia.
 */
export async function translateToSpanish(input: {
  originalTitle: string;
  snippet: string;
}): Promise<TranslatedSummary> {
  try {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 1200,
      messages: [
        {
          role: "user",
          content: `Eres redactor de un blog español sobre afición futbolística, desplazamientos de hinchas y moda casual (marca Hools). A partir del siguiente titular y fragmento (normalmente en ingles), escribe un ARTICULO COMPLETO Y ORIGINAL en español de España, de entre 300 y 450 palabras, en 4-6 parrafos.

No traduzcas ni resumas el original: usalo solo como punto de partida del tema, y desarrolla tu propio contenido con contexto, trasfondo y análisis relacionado con la cultura de aficion, desplazamientos de hinchas o moda casual segun corresponda. No copies frases del original. Tono periodístico natural, directo, como si lo hubieras escrito tú desde cero.

Titular original: "${input.originalTitle}"
Fragmento original: "${input.snippet}"

Responde SOLO con JSON valido, sin texto adicional ni bloques de codigo, con este formato exacto (el cuerpo con los parrafos separados por \\n\\n):
{"title": "titular en español, breve", "body": "parrafo 1\\n\\nparrafo 2\\n\\nparrafo 3..."}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJson(raw)) as { title?: string; body?: string };

    if (!parsed.title || !parsed.body) {
      throw new Error("Respuesta sin los campos esperados");
    }
    return { title: parsed.title, body: parsed.body };
  } catch (err) {
    console.error("Fallo al traducir con Claude, se usa el original:", err);
    return { title: input.originalTitle, body: input.snippet };
  }
}
