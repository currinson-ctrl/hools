import Anthropic from "@anthropic-ai/sdk";
import type { Category } from "@prisma/client";
import type { ArticleFact, ArticleSection } from "./article-html";

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
  /**
   * Categoria decidida por el contenido de la noticia, no por la fuente que
   * la trajo. Es la que se publica como etiqueta y la que hace que el
   * articulo aparezca en su pestaña del blog.
   */
  category: Category;
  title: string;
  /** Entradilla: 1-2 frases que abren el articulo y alimentan el resumen de Shopify. */
  lead: string;
  /** Cuerpo por secciones, cada una con su ladillo (la primera suele no llevarlo). */
  sections: ArticleSection[];
  /** Frase del propio texto para sacar a gran tamaño entre parrafos. */
  pullQuote: string | null;
  /** Datos del recuadro "la ficha". Vacio cuando la fuente no da datos fiables. */
  facts: ArticleFact[];
  /** Pie de foto para Instagram (gancho + pregunta + hashtags de nicho), o null si no vino. */
  igCaption: string | null;
  /**
   * Todo el texto plano del articulo (entradilla + ladillos + parrafos). No se
   * publica tal cual: lo usan la deteccion de grupos de aficion y el tuit, que
   * solo necesitan texto sin marcado.
   */
  body: string;
}

/**
 * Techo del titular, no objetivo. El problema de los titulares que sacaba el
 * blog ("X: cuando la afición reconoce el sacrificio de un idolo") no era la
 * longitud, era que no contaban nada: pura evocacion, sin decir quien ni que.
 * Recortarlos a lo bruto los deja peor ("La Roma y su gesto de honor" ya no
 * dice con quien). Asi que se permite un titular largo si dice algo — "La
 * Curva Nord de la Lazio convirtió el derby en una batalla de carteles" esta
 * bien — y lo que se persigue es la vaguedad, no las palabras.
 */
export const MAX_TITLE_WORDS = 14;
export const MAX_TITLE_CHARS = 80;

/** Separadores con los que el modelo cuelga un subtitulo del titular. */
const TITLE_SEPARATOR = /\s*[:;–—]\s+|\s+[-|]\s+/;

function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function isTitleTooLong(title: string): boolean {
  return countWords(title) > MAX_TITLE_WORDS || title.length > MAX_TITLE_CHARS;
}

/** El tic: "Cuando la Curva Nord..." y "Widzew Łódź: cuando la visitante...". */
function hasCuandoTic(title: string): boolean {
  return /^cuando\s/i.test(title) || new RegExp(`(?:${TITLE_SEPARATOR.source})cuando\\s`, "i").test(title);
}

/**
 * Titulares que hay que repasar. Se detecta lo que se puede detectar sin leer
 * la noticia: el tic del "cuando" y el exceso de largo. Un titular corto pero
 * vago no cae aqui — eso solo se ve leyendo el articulo, y de eso se encarga
 * el prompt al escribirlo.
 */
export function needsBetterTitle(title: string): boolean {
  return hasCuandoTic(title) || isTitleTooLong(title);
}

/** "Cuando la Curva Nord tomó el derbi" -> "La Curva Nord tomó el derbi". */
function dropCuando(text: string, capitalize: boolean): string {
  const rest = text.replace(/^cuando\s+/i, "");
  if (rest === text || !rest) return text;
  return capitalize ? rest.charAt(0).toUpperCase() + rest.slice(1) : rest;
}

/** Parte el titular por el separador del que suele colgar el subtitulo. */
function splitTitle(title: string): { head: string; tail: string } | null {
  const match = title.match(TITLE_SEPARATOR);
  if (!match || match.index === undefined) return null;
  const head = title.slice(0, match.index).trim();
  const tail = title.slice(match.index + match[0].length).trim();
  return head && tail ? { head, tail } : null;
}

/**
 * Limpieza que se puede hacer sin leer la noticia: comillas, punto final y el
 * "cuando", de apertura o colgado de los dos puntos. Quitar el "cuando" no
 * quita informacion, solo el amaneramiento, y suele dejar el titular ya bien
 * ("Widzew Łódź: cuando la visitante arrebata el estadio" -> "Widzew Łódź: la
 * visitante arrebata el estadio").
 *
 * Lo que NO hace es podar el subtitulo de detras de los dos puntos: eso
 * acorta, pero se lleva por delante lo que el titular contaba. Si despues de
 * esto sigue siendo largo, hay que reescribirlo leyendo el articulo.
 */
export function normalizeTitle(raw: string): string {
  let title = raw
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^["'«“”]+|["'«“”]+$/g, "")
    .replace(/[.;,\s]+$/, "")
    .trim();

  title = dropCuando(title, true);

  const parts = splitTitle(title);
  if (parts) {
    const tail = dropCuando(parts.tail, false);
    if (tail !== parts.tail) title = `${parts.head}: ${tail}`;
  }

  return title;
}

/**
 * Reglas del titular, compartidas por el prompt que escribe el articulo y por
 * el que repasa un titular ya guardado, para que los dos pidan lo mismo. Los
 * ejemplos son la parte que mas trabaja: enseñan que lo que sobra es la
 * evocacion, no las palabras.
 */
const TITLE_RULES = `- Un titular tiene que CONTAR LO QUE PASA: quien y que. Si al leerlo solo sabes de que "va", no sirve.
- Concreto: nombres propios (club, grupo, jugador, estadio, ciudad) siempre que el material los de. Si no los da, no te los inventes.
- PROHIBIDO el "cuando": ni empezar por "Cuando ...", ni la formula "X: cuando ...". Es un tic, y ademas deja el titular sin verbo principal.
- Nada de literatura ni de frases evocadoras vacias ("el rugido de la grada", "la noche magica", "el eco de la afición").
- Los dos puntos valen cuando a la izquierda va el protagonista y a la derecha lo que hizo. No valen para colgar una frase poetica.
- Como techo, ${MAX_TITLE_WORDS} palabras y ${MAX_TITLE_CHARS} caracteres. Pero es un techo, no un objetivo: mejor un titular largo que cuenta algo que uno corto que no dice nada.
- Sin comillas, sin punto final, sin emojis, sin hashtags.

Asi NO / asi SI:
- NO: "La Roma y su gesto de honor: cuando la afición reconoce el sacrificio de un ídolo" — SI: "La Roma y su gesto de honor con Ranieri"
- NO: "Widzew Łódź: cuando la visitante arrebata el estadio" — SI: "Widzew Łódź: la afición visitante reina en el estadio"
- NO: "Cuando la Curva Nord de la Lazio convirtió el derby en batalla de carteles" — SI: "La Curva Nord de la Lazio convirtió el derby en una batalla de carteles"`;

/**
 * Repasa un titular que la limpieza automatica no ha dejado bien: se le pide
 * a Claude que lo reescriba con lo que de verdad cuenta la noticia (por eso
 * se le pasa el texto: es de donde sale el "con Ranieri" que le falta al
 * titular original).
 *
 * Devuelve null si no hay clave, si falla la llamada o si lo que vuelve no
 * cumple las reglas; quien llama se queda entonces con el que tenia.
 */
export async function improveSpanishTitle(input: {
  title: string;
  context?: string;
}): Promise<string | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 100,
      messages: [
        {
          role: "user",
          content: `Reescribe el titular de esta noticia de un blog español de cultura ultra/casual. El problema del titular actual es que no cuenta lo que pasa: es evocador y vago.

Titular actual: "${input.title}"${input.context ? `\nTexto de la noticia: "${input.context}"` : ""}

${TITLE_RULES}

Responde SOLO con el titular, en una linea.`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const improved = normalizeTitle(raw.split("\n")[0] ?? "");
    if (!improved || needsBetterTitle(improved)) return null;
    return improved;
  } catch (err) {
    console.error(`Fallo al reescribir el titular "${input.title}":`, err);
    return null;
  }
}

export interface RestructuredArticle {
  lead: string;
  sections: ArticleSection[];
  pullQuote: string | null;
  facts: ArticleFact[];
}

/**
 * Vuelve a maquetar un articulo ya escrito y publicado: le saca entradilla,
 * ladillos, cita destacada y ficha SIN reescribir el texto. Es lo que usa el
 * reproceso de los articulos antiguos, que se generaron cuando el cuerpo era
 * una simple tira de parrafos.
 *
 * Devuelve null si no hay clave de API o si falla la llamada: quien llama
 * debe recaer entonces en una maquetacion basica en vez de perder el
 * articulo.
 */
export async function restructureSpanishArticle(input: {
  title: string;
  paragraphs: string[];
}): Promise<RestructuredArticle | null> {
  if (!process.env.ANTHROPIC_API_KEY) return null;

  try {
    const message = await getClient().messages.create({
      model: MODEL,
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Este articulo de un blog español de cultura ultra/casual ya esta escrito y publicado. Tu tarea es MAQUETARLO, no reescribirlo.

Titular: "${input.title}"

Parrafos actuales:
${input.paragraphs.map((p, i) => `[${i + 1}] ${p}`).join("\n\n")}

Reglas estrictas:
- CONSERVA los parrafos tal cual, palabra por palabra. No los reescribas, no los resumas, no los reordenes, no los fusiones ni los partas. Cada parrafo original debe aparecer una sola vez y entero en alguna seccion.
- Lo unico que añades es: la entradilla, los ladillos, la cita destacada y la ficha.

- "lead": entradilla de 1-2 frases (maximo 45 palabras). Esta si la escribes tu, resumiendo el articulo con gancho. No repitas literalmente el primer parrafo.
- "sections": agrupa los parrafos existentes en 3-4 secciones. La primera lleva "heading": null. Las demas, un ladillo corto de 3-6 palabras, concreto, nunca generico ("Contexto", "Conclusion" y similares estan prohibidos). En "paragraphs" van los parrafos ORIGINALES literales.
- "pullQuote": una frase corta (10-25 palabras) copiada literalmente de alguno de los parrafos, que se sostenga sola. Si ninguna vale, null.
- "facts": 2-4 pares etiqueta/valor con datos que aparezcan LITERALMENTE en el texto (club, estadio, competicion, ciudad, grupo...). Etiquetas de 1-2 palabras. NO INVENTES nada: si el texto no da datos concretos, devuelve lista vacia.

Responde SOLO con este JSON, sin texto adicional ni bloques de codigo:
{"lead": "...", "sections": [{"heading": null, "paragraphs": ["..."]}, {"heading": "...", "paragraphs": ["..."]}], "pullQuote": "... o null", "facts": [{"label": "...", "value": "..."}]}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJson(raw)) as {
      lead?: string;
      sections?: Array<{ heading?: string | null; paragraphs?: string[] }>;
      pullQuote?: string | null;
      facts?: Array<{ label?: string; value?: string }>;
    };

    const sections = normalizeSections(parsed.sections, undefined);
    if (!sections.length) return null;

    // Red de seguridad contra el fallo mas caro de este prompt: que el modelo
    // se deje parrafos por el camino al agruparlos. Si el texto maquetado no
    // contiene todos los originales, se descarta y se maqueta en basico.
    const kept = sections.flatMap((s) => s.paragraphs).join(" ");
    const dropped = input.paragraphs.filter((p) => !kept.includes(p.slice(0, 60)));
    if (dropped.length) {
      console.error(
        `Reestructuracion descartada para "${input.title}": se perdieron ${dropped.length} parrafo(s)`
      );
      return null;
    }

    return {
      lead: parsed.lead?.trim() || input.paragraphs[0] || "",
      sections,
      pullQuote: parsed.pullQuote?.trim() || null,
      facts: normalizeFacts(parsed.facts),
    };
  } catch (err) {
    console.error(`Fallo al reestructurar "${input.title}":`, err);
    return null;
  }
}

/**
 * Deja las secciones en la forma que espera el maquetador, tolerando las dos
 * respuestas que puede dar el modelo: la estructurada, y la de un unico
 * bloque de parrafos separados por lineas en blanco (que es lo que devolvia
 * antes de maquetar los articulos, y a lo que puede recaer si se despista).
 */
function normalizeSections(
  sections: Array<{ heading?: string | null; paragraphs?: string[] }> | undefined,
  fallbackBody: string | undefined
): ArticleSection[] {
  const normalized = (sections ?? [])
    .map((s) => ({
      heading: s.heading?.trim() || null,
      paragraphs: (s.paragraphs ?? []).map((p) => p.trim()).filter(Boolean),
    }))
    .filter((s) => s.heading || s.paragraphs.length);

  if (normalized.length) return normalized;

  const paragraphs = (fallbackBody ?? "")
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter(Boolean);
  return paragraphs.length ? [{ heading: null, paragraphs }] : [];
}

function normalizeFacts(facts: Array<{ label?: string; value?: string }> | undefined): ArticleFact[] {
  return (facts ?? [])
    .map((f) => ({ label: (f.label ?? "").trim(), value: (f.value ?? "").trim() }))
    .filter((f) => f.label && f.value)
    .slice(0, 4);
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

const CATEGORY_VALUES: Category[] = ["AFICION", "VIAJES", "MODA"];

function focusList(): string {
  return CATEGORY_VALUES.map((c) => `- ${c}: ${CATEGORY_FOCUS[c]}`).join("\n\n");
}

/**
 * Filtra y, si encaja, genera un titular + articulo completo en español de
 * España a partir del original (normalmente en ingles). El blog es sobre
 * cultura ultra/casual y desplazamientos, no noticias de futbol genericas,
 * asi que primero se le pide a Claude que decida si el tema encaja de verdad
 * en alguna de las tres categorias; si no encaja en ninguna, o si falla la
 * llamada (red, limite de uso, respuesta no valida), se descarta el item
 * devolviendo null en vez de publicar contenido fuera de tema.
 *
 * La categoria la decide el CONTENIDO, no la fuente. Antes se heredaba de la
 * fuente que traia la noticia, y como casi todas estan dadas de alta como
 * AFICION, un desplazamiento traído por una fuente generalista acababa
 * etiquetado como aficion y no aparecia en su pestaña del blog. `category`
 * sigue llegando aqui, pero solo como respaldo si el modelo devuelve una
 * categoria que no reconocemos.
 */
export async function translateToSpanish(input: {
  originalTitle: string;
  snippet: string;
  category: Category;
}): Promise<TranslatedArticle | null> {
  try {
    const message = await getClient().messages.create({
      model: MODEL,
      // El articulo maquetado (entradilla + secciones + cita + ficha) ocupa
      // bastante mas que el bloque de parrafos que se pedia antes.
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Eres redactor de un blog español muy especializado en cultura ULTRA/casual del fútbol (marca Hools): ambiente de aficion, tifos, mosaicos, banderas, desplazamientos masivos de hinchas, fiestas de grada, moda casual. NO es un blog generico de noticias de futbol.

Primero decide si la siguiente noticia encaja de verdad en ALGUNA de estas tres categorias, y en cual:

${focusList()}

Elige la categoria por lo que cuenta la noticia, no por el medio que la publica. Una misma fuente puede traer noticias de las tres. Si trata sobre todo del viaje o del desplazamiento de una aficion, es VIAJES aunque hable tambien del ambiente en la grada.

Se estricto: ante la duda, descartala.

Titular original: "${input.originalTitle}"
Fragmento original: "${input.snippet}"

Si NO encaja, responde SOLO con este JSON, sin texto adicional: {"relevant": false}

Si SI encaja, escribe un ARTICULO COMPLETO Y ORIGINAL en español de España, de entre 350 y 500 palabras. No traduzcas ni resumas el original: usalo solo como punto de partida, y desarrolla tu propio contenido con contexto, trasfondo y análisis. No copies frases del original. Tono periodístico natural, directo, como si lo hubieras escrito tú desde cero.

El articulo va MAQUETADO, asi que devuelvelo por piezas:

- "category": la categoria que le corresponde, exactamente una de estas tres palabras: AFICION, VIAJES o MODA.
- "title": el titular, con estas reglas:
${TITLE_RULES}
- "lead": entradilla de 1 o 2 frases (maximo 45 palabras) que resuma la noticia y enganche. Va destacada al principio y es tambien el resumen que se ve en el listado del blog y en Google. No empieces con "En este articulo" ni formulas de relleno.
- "sections": entre 3 y 4 secciones. La PRIMERA lleva "heading": null (arranca directo, sin ladillo). Las siguientes llevan un ladillo corto de 3-6 palabras, concreto y con gancho, nunca generico ("Contexto", "Conclusion" y similares estan prohibidos). Cada seccion tiene 1-2 parrafos en "paragraphs".
- "pullQuote": UNA frase corta (10-25 palabras) sacada del propio articulo o que lo resuma, para destacarla a gran tamaño entre parrafos. Debe sostenerse sola fuera de contexto. Si no hay ninguna que valga, null.
- "facts": entre 2 y 4 datos concretos de la noticia en pares etiqueta/valor, para un recuadro tipo ficha (ej. {"label":"Club","value":"Levski Sofia"}, {"label":"Estadio","value":"Vasil Levski"}, {"label":"Competicion","value":"Europa League"}, {"label":"Grupo","value":"Ultras Levski"}). Etiquetas de 1-2 palabras. IMPORTANTISIMO: solo datos que aparezcan de verdad en el material original. NO INVENTES fechas, cifras, nombres ni aforos. Si el original no da datos fiables, devuelve una lista vacia: es preferible sin ficha que con datos falsos.
- "igCaption": pie de foto para Instagram sobre la misma noticia. Reglas: 2-3 frases cortas con gancho directo (tono cultura terrace/ultra, sin sonar a marca corporativa) + una pregunta final a la audiencia para invitar a comentar. NUNCA uses @menciones. Cierra con una linea de 8-12 hashtags mezclando nicho y tema (ej. #terraceculture #awaydays #casuals #ultras #groundhopping mas los especificos de esta noticia). Sin enlaces.

Responde SOLO con este JSON, sin texto adicional ni bloques de codigo:
{"relevant": true, "category": "VIAJES", "title": "titular en español", "lead": "entradilla", "sections": [{"heading": null, "paragraphs": ["parrafo", "parrafo"]}, {"heading": "ladillo corto", "paragraphs": ["parrafo"]}], "pullQuote": "frase destacada o null", "facts": [{"label": "Club", "value": "..."}], "igCaption": "pie de foto para Instagram\\n\\n#hashtags"}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJson(raw)) as {
      relevant?: boolean;
      category?: string;
      title?: string;
      lead?: string;
      sections?: Array<{ heading?: string | null; paragraphs?: string[] }>;
      pullQuote?: string | null;
      facts?: Array<{ label?: string; value?: string }>;
      body?: string;
      igCaption?: string;
    };

    if (!parsed.relevant) return null;
    if (!parsed.title) throw new Error("Respuesta sin los campos esperados");

    const sections = normalizeSections(parsed.sections, parsed.body);
    if (!sections.length) throw new Error("Respuesta sin cuerpo de articulo");

    // Si el modelo se salta la entradilla, se usa el primer parrafo antes que
    // publicar el articulo sin ella (el resumen del listado depende de esto).
    const lead = parsed.lead?.trim() || sections[0].paragraphs[0] || "";

    // Si devuelve una categoria que no reconocemos, se usa la de la fuente:
    // preferible etiquetar de menos que descartar un articulo ya escrito.
    const claimed = (parsed.category ?? "").trim().toUpperCase() as Category;
    const category = CATEGORY_VALUES.includes(claimed) ? claimed : input.category;
    if (claimed && category !== claimed) {
      console.error(`Categoria no reconocida "${parsed.category}", se usa ${input.category}`);
    }

    // El titular no se publica tal cual: primero la limpieza automatica y,
    // si aun asi no cumple, una segunda pasada de Claude con la entradilla
    // delante. Es barata y evita que se cuele otro titular evocador por
    // saltarse el prompt.
    let title = normalizeTitle(parsed.title);
    if (needsBetterTitle(title)) {
      title = (await improveSpanishTitle({ title, context: lead })) ?? title;
    }

    return {
      category,
      title,
      lead,
      sections,
      pullQuote: parsed.pullQuote?.trim() || null,
      facts: normalizeFacts(parsed.facts),
      igCaption: parsed.igCaption || null,
      body: [lead, ...sections.flatMap((s) => [s.heading ?? "", ...s.paragraphs])]
        .filter(Boolean)
        .join("\n\n"),
    };
  } catch (err) {
    console.error("Fallo al traducir/filtrar con Claude, se descarta el item:", err);
    return null;
  }
}
