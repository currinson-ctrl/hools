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
  summary: string;
}

function extractJson(raw: string): string {
  return raw
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/i, "")
    .trim();
}

/**
 * Genera un titular + resumen en español de España a partir del original
 * (normalmente en ingles), con tono editorial propio en vez de traduccion
 * literal. Si falla (red, limite de uso, respuesta no valida) devuelve el
 * original sin traducir para no bloquear la agregacion de esa noticia.
 */
export async function translateToSpanish(input: {
  originalTitle: string;
  snippet: string;
}): Promise<TranslatedSummary> {
  try {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 400,
      messages: [
        {
          role: "user",
          content: `Eres redactor de un blog español sobre afición futbolística, desplazamientos de hinchas y moda casual (marca Hools). Reescribe en español de España, con tono periodístico natural y directo, la siguiente noticia. No la traduzcas palabra por palabra: adapta el estilo como si la escribieras tú mismo, en 2-3 frases para el resumen.

Titular original: "${input.originalTitle}"
Resumen original: "${input.snippet}"

Responde SOLO con JSON valido, sin texto adicional ni bloques de codigo, con este formato exacto:
{"title": "titular en español, breve", "summary": "resumen en español, 2-3 frases"}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJson(raw)) as { title?: string; summary?: string };

    if (!parsed.title || !parsed.summary) {
      throw new Error("Respuesta sin los campos esperados");
    }
    return { title: parsed.title, summary: parsed.summary };
  } catch (err) {
    console.error("Fallo al traducir con Claude, se usa el original:", err);
    return { title: input.originalTitle, summary: input.snippet };
  }
}
