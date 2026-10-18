import Anthropic from "@anthropic-ai/sdk";

/**
 * Generador de canciones infantiles para el canal «Aprende con Carlota».
 *
 * Dos pasos, separados a proposito:
 *
 * 1. LETRA (Claude). Siempre que haya ANTHROPIC_API_KEY. Sale ya troceada en
 *    secciones (estribillo, estrofas...) porque asi la necesita el paso 2.
 * 2. MUSICA (ElevenLabs Music). Solo si hay ELEVENLABS_API_KEY. Se le pasa la
 *    letra exacta seccion a seccion, asi que canta lo que hemos escrito, no
 *    algo parecido. Si falla o no esta configurado, la letra se guarda igual y
 *    el audio se puede volver a pedir desde el panel.
 *
 * Suno no tiene API oficial; por eso la musica va con ElevenLabs. Para quien
 * prefiera Suno a mano, cada cancion guarda tambien el estilo listo para pegar.
 */

// Escribir letras infantiles que rimen y se puedan cantar es trabajo
// creativo: aqui compensa el modelo grande (son una o dos llamadas por
// cancion, no cientos como en el rastreo de noticias).
const LYRICS_MODEL = "claude-opus-5-5";

const ELEVENLABS_URL = "https://api.elevenlabs.io/v1/music?output_format=mp3_44100_128";

export interface SongSection {
  /** «Estribillo», «Estrofa 1»... Se enseña en el panel y se le pasa a la musica. */
  name: string;
  lines: string[];
}

export interface GeneratedSong {
  title: string;
  topic: string;
  sections: SongSection[];
  /** Estilo musical en ingles (es como mejor lo entienden los generadores). */
  styles: string[];
  youtubeTitle: string;
  youtubeDescription: string;
}

/** Estilo comun a todas las canciones, para que el canal suene a un mismo sitio. */
export const BASE_STYLES = [
  "children's song",
  "cheerful",
  "bright friendly female vocals singing in Spanish from Spain",
  "ukulele",
  "xylophone",
  "hand claps",
  "simple catchy melody",
];

const NEGATIVE_STYLES = ["explicit lyrics", "dark", "aggressive", "heavy distortion", "rap", "autotune"];

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) throw new Error("Falta la variable de entorno ANTHROPIC_API_KEY");
    client = new Anthropic({ apiKey });
  }
  return client;
}

export function isMusicConfigured(): boolean {
  return Boolean(process.env.ELEVENLABS_API_KEY);
}

/** Estilo listo para pegar en Suno (u otro generador) si se hace a mano. */
export function stylePrompt(styles: string[]): string {
  return styles.join(", ");
}

/** Letra completa en texto plano, para copiarla al montaje del video. */
export function lyricsAsText(sections: SongSection[]): string {
  return sections.map((s) => `[${s.name}]\n${s.lines.join("\n")}`).join("\n\n");
}

/** Ideas para cuando no se escribe tema: Claude elige una que no se haya usado. */
const TOPIC_IDEAS =
  "colores, números del 1 al 5, números del 6 al 10, animales de la granja, animales de la selva, " +
  "las vocales, los días de la semana, las estaciones, las formas, el cuerpo, las emociones, " +
  "lavarse los dientes, lavarse las manos, el baño, recoger los juguetes, la hora de dormir, " +
  "comer fruta, los medios de transporte, el tiempo (sol, lluvia, viento), los opuestos (grande/pequeño), " +
  "decir por favor y gracias, la familia, ir al cole, el cumpleaños";

export async function generateSongLyrics(input: {
  topic?: string;
  previousTitles: string[];
}): Promise<GeneratedSong> {
  const topic = input.topic?.trim();
  const avoid = input.previousTitles.length
    ? `\nYa existen estas canciones en el canal, NO repitas tema ni título:\n${input.previousTitles
        .map((t) => `- ${t}`)
        .join("\n")}\n`
    : "";

  const prompt = `Eres compositor de canciones infantiles para el canal de YouTube «Aprende con Carlota» (niños de 2 a 5 años, España). Carlota es la protagonista: una niña alegre que aprende cosas con los niños que la ven.

${topic ? `Tema de la canción: «${topic}».` : `Elige tú un tema educativo sencillo. Ideas: ${TOPIC_IDEAS}.`}
${avoid}
Escribe una canción ORIGINAL (no copies ni adaptes canciones conocidas) en español de España, con estas reglas:
- Versos cortos (de 5 a 9 sílabas), vocabulario de niño pequeño, que rimen o al menos tengan asonancia.
- Un ESTRIBILLO pegadizo de 2 a 4 versos que se repite al menos 3 veces, idéntico cada vez.
- Mete onomatopeyas y sonidos para imitar (¡plas!, ¡muuu!, ¡chof!) y gestos que el niño pueda hacer (palmas, saltar, contar con los dedos).
- Si cabe con naturalidad, nombra a Carlota en el estribillo.
- Lo que se aprende tiene que ser correcto (si cuentas, cuenta bien; si nombras colores, asígnalos bien).
- Estructura: Estribillo, Estrofa 1, Estribillo, Estrofa 2, Estribillo, y un Final corto (1 o 2 versos). Puedes añadir una Estrofa 3 si el tema lo pide. Entre 3 y 6 versos por sección.
- Duración cantada: entre 1 y 2 minutos.

Además:
- "styles": de 2 a 4 etiquetas de estilo musical EN INGLÉS que se SUMAN al estilo base del canal (${BASE_STYLES.join(", ")}), incluyendo el tempo en bpm. Ej.: canción de dormir → "lullaby", "soft piano", "music box", "70 bpm"; canción de moverse → "energetic", "120 bpm".
- "youtubeTitle": título para YouTube, con lo que buscaría un padre (ej. «Canción de los colores 🎨 | Canciones infantiles | Aprende con Carlota»).
- "youtubeDescription": 2 o 3 frases para la descripción del vídeo, dirigidas a los padres.

Responde SOLO con un JSON válido, sin texto antes ni después, con esta forma:
{"title": "...", "topic": "...", "sections": [{"name": "Estribillo", "lines": ["...", "..."]}], "styles": ["..."], "youtubeTitle": "...", "youtubeDescription": "..."}`;

  const message = await getClient().messages.create({
    model: LYRICS_MODEL,
    max_tokens: 16000,
    messages: [{ role: "user", content: prompt }],
  });

  if (message.stop_reason === ("refusal" as string)) {
    throw new Error("Claude no ha querido escribir esta canción. Prueba con otro tema.");
  }

  const text = message.content
    .map((block) => (block.type === "text" ? block.text : ""))
    .join("");
  return parseSong(text);
}

function parseSong(text: string): GeneratedSong {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error("Claude no ha devuelto la canción en el formato esperado. Vuelve a intentarlo.");
  }

  let raw: unknown;
  try {
    raw = JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new Error("Claude ha devuelto la canción mal formada. Vuelve a intentarlo.");
  }

  const data = raw as Record<string, unknown>;
  const str = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const sections = Array.isArray(data.sections)
    ? data.sections
        .map((s) => {
          const section = s as Record<string, unknown>;
          return {
            name: str(section.name) || "Estrofa",
            lines: Array.isArray(section.lines) ? section.lines.map(str).filter(Boolean) : [],
          };
        })
        .filter((s) => s.lines.length > 0)
    : [];

  const title = str(data.title);
  if (!title || sections.length === 0) {
    throw new Error("A la canción que ha devuelto Claude le falta el título o la letra. Vuelve a intentarlo.");
  }

  return {
    title,
    topic: str(data.topic) || title,
    sections,
    styles: Array.isArray(data.styles) ? data.styles.map(str).filter(Boolean).slice(0, 6) : [],
    youtubeTitle: str(data.youtubeTitle) || `${title} | Canciones infantiles | Aprende con Carlota`,
    youtubeDescription: str(data.youtubeDescription),
  };
}

/**
 * Tiempo que se le da a cada seccion. ElevenLabs pide la duracion de cada una
 * (entre 3 y 120 segundos); a ritmo de cancion infantil un verso corto se canta
 * en unos 3,5 s, y se deja un poco de aire para la entrada y el final.
 */
function sectionDurationMs(section: SongSection): number {
  const ms = section.lines.length * 3500 + 2000;
  return Math.min(120_000, Math.max(3_000, ms));
}

/**
 * Pide a ElevenLabs Music la cancion cantada con la letra exacta. Devuelve el
 * MP3. Tarda del orden de un minuto.
 */
export async function composeSongAudio(song: {
  sections: SongSection[];
  styles: string[];
}): Promise<Buffer> {
  const apiKey = process.env.ELEVENLABS_API_KEY;
  if (!apiKey) throw new Error("Falta la variable de entorno ELEVENLABS_API_KEY");

  const compositionPlan = {
    positive_global_styles: [...BASE_STYLES, ...song.styles],
    negative_global_styles: NEGATIVE_STYLES,
    sections: song.sections.map((section) => {
      const isChorus = /estribillo/i.test(section.name);
      return {
        section_name: section.name,
        positive_local_styles: isChorus ? ["catchy sing-along chorus", "fuller arrangement"] : ["light verse"],
        negative_local_styles: [],
        duration_ms: sectionDurationMs(section),
        lines: section.lines,
      };
    }),
  };

  const res = await fetch(ELEVENLABS_URL, {
    method: "POST",
    headers: { "xi-api-key": apiKey, "Content-Type": "application/json" },
    body: JSON.stringify({
      model_id: process.env.ELEVENLABS_MUSIC_MODEL || "music_v1",
      composition_plan: compositionPlan,
    }),
  });

  if (!res.ok) {
    const detail = (await res.text().catch(() => "")).slice(0, 300);
    if (res.status === 401) throw new Error("ElevenLabs rechaza la clave: revisa ELEVENLABS_API_KEY.");
    if (res.status === 402 || /quota|credits/i.test(detail)) {
      throw new Error("La cuenta de ElevenLabs no tiene créditos suficientes para generar música.");
    }
    throw new Error(`ElevenLabs ha devuelto un error (${res.status}): ${detail}`);
  }

  return Buffer.from(await res.arrayBuffer());
}
