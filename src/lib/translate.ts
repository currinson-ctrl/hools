import Anthropic from "@anthropic-ai/sdk";
import type { Category } from "@prisma/client";

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

export interface TranslatedArticle {
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

// Criterio estricto de relevancia por categoria: el blog es sobre cultura
// ultra/casual y desplazamientos, no un agregador generico de noticias de
// futbol. Se le da a Claude para que descarte lo que no encaje de verdad.
const CATEGORY_FOCUS: Record<Category, string> = {
  AFICION:
    "Cultura ULTRA y ambiente de aficion: tifos, mosaicos, coreografias, pancartas y banderas, cantos, rivalidades entre aficiones, quedadas y fiestas de hinchas, cultura de grada en general. NO vale: cronicas de partidos, resultados, fichajes, tacticas, lesiones, ruedas de prensa, o cualquier noticia generica de futbol que solo mencione de pasada a la aficion.",
  VIAJES:
    "Desplazamientos y viajes MASIVOS de aficionados a partidos fuera de casa: logistica de esos viajes, incidentes o anecdotas en el desplazamiento, aficiones que se mueven en gran numero, previas centradas en el propio viaje. NO vale: horarios, resultados o cronicas de partidos que no traten specificamente del desplazamiento o viaje de los aficionados.",
  MODA:
    "Moda casual y terrace fashion: marcas, prendas, estilo asociado a la cultura de las gradas (casuals). NO vale: moda generica sin relacion con el mundo del futbol/casual.",
};

/**
 * Filtra y, si encaja, genera un titular + articulo completo en español de
 * España a partir del original (normalmente en ingles). El blog es sobre
 * cultura ultra/casual y desplazamientos, no noticias de futbol genericas,
 * asi que primero se le pide a Claude que decida si el tema encaja de
 * verdad en la categoria; si no encaja, o si falla la llamada (red, limite
 * de uso, respuesta no valida), se descarta el item devolviendo null en vez
 * de publicar contenido fuera de tema.
 */
export async function translateToSpanish(input: {
  originalTitle: string;
  snippet: string;
  category: Category;
}): Promise<TranslatedArticle | null> {
  try {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 900,
      messages: [
        {
          role: "user",
          content: `Eres redactor de un blog español muy especializado en cultura ULTRA/casual del fútbol (marca Hools): ambiente de aficion, tifos, mosaicos, banderas, desplazamientos masivos de hinchas, fiestas de grada, moda casual. NO es un blog generico de noticias de futbol.

Primero decide si la siguiente noticia encaja de verdad en esta categoria (${input.category}): ${CATEGORY_FOCUS[input.category]}

Se estricto: ante la duda, descartala.

Titular original: "${input.originalTitle}"
Fragmento original: "${input.snippet}"

Si NO encaja, responde SOLO con este JSON, sin texto adicional: {"relevant": false}

Si SI encaja, escribe un ARTICULO COMPLETO Y ORIGINAL en español de España, de entre 300 y 450 palabras, en 4-6 parrafos. No traduzcas ni resumas el original: usalo solo como punto de partida, y desarrolla tu propio contenido con contexto, trasfondo y análisis. No copies frases del original. Tono periodístico natural, directo, como si lo hubieras escrito tú desde cero. Responde SOLO con este JSON, sin texto adicional ni bloques de codigo (el cuerpo con los parrafos separados por \\n\\n):
{"relevant": true, "title": "titular en español, breve", "body": "parrafo 1\\n\\nparrafo 2\\n\\nparrafo 3..."}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJson(raw)) as {
      relevant?: boolean;
      title?: string;
      body?: string;
    };

    if (!parsed.relevant) return null;
    if (!parsed.title || !parsed.body) {
      throw new Error("Respuesta sin los campos esperados");
    }
    return { title: parsed.title, body: parsed.body };
  } catch (err) {
    console.error("Fallo al traducir/filtrar con Claude, se descarta el item:", err);
    return null;
  }
}
