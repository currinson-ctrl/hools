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

export interface RestructuredArticle {
  lead: string;
  sections: ArticleSection[];
  pullQuote: string | null;
  facts: ArticleFact[];
}

/**
 * Voz de los articulos. Vive aparte porque la comparten los dos prompts que
 * escriben texto (el que redacta el articulo entero y el que le pone
 * entradilla a los ya publicados), y porque asi se ajusta el tono en un solo
 * sitio en vez de en dos redacciones que se van separando con el tiempo.
 *
 * Esta escrito como prohibiciones concretas y no como adjetivos ("se humano",
 * "se cercano") a proposito: pedirle a un modelo que "escriba con empatia"
 * devuelve justo la prosa de folleto que se intenta evitar. Lo que si mueve el
 * resultado es la lista negra de muletillas y la orden de hablar de personas
 * concretas en vez de colectivos abstractos.
 */
const VOICE_RULES = `VOZ (esto es lo que separa un articulo de Hools de un teletipo):

- Escribes como alguien que ha estado en la grada, no como una agencia de noticias ni como una marca. Español de España, natural, el que usarias contandoselo a alguien en el bar despues del partido.
- Habla de PERSONAS, no de abstracciones. No "la aficion mostro su descontento", sino quienes son, que hicieron y que les llevo a hacerlo. Detras de un tifo hay gente que ha puesto su dinero y ha pasado noches pintando lona; detras de un desplazamiento hay quien ha pedido el dia libre o ha hecho 900 km para volver de madrugada. Eso es lo que hay que contar.
- Empatia es entender por que a alguien le importa tanto algo, y contarlo sin condescendencia y sin ponerte por encima. Ni paternalismo ("los sufridos aficionados"), ni glorificacion epica, ni sermon moral. Cuentas lo que pasa y por que le duele o le enorgullece a quien lo vive.
- Cuando la noticia tenga un lado duro (sanciones, cierres de grada, prohibiciones, incidentes), cuentalo tal cual y desde como se vive dentro. Nunca justifiques ni celebres la violencia, pero tampoco des lecciones: ni apologia ni editorial de moralina.
- Ritmo desigual: alterna frases largas con frases cortas. Alguna de tres palabras. Eso es lo que hace que se lea como escrito por una persona.
- Voz activa. Un adjetivo por sustantivo como mucho. Puedes tutear al lector alguna vez ("si has hecho ese viaje, sabes de que va esto"), pero con moderacion: una o dos veces en todo el articulo, no en cada parrafo.

PROHIBIDO (son las marcas de agua de un texto escrito por una maquina):
- Formulas de relleno: "cabe destacar", "cabe señalar", "es importante mencionar", "en definitiva", "en resumen", "en conclusion", "por otro lado", "asimismo".
- Aperturas de redaccion escolar: "En un mundo donde...", "En pleno siglo XXI...", "Desde tiempos inmemoriales...".
- La antitesis facil: "no es solo X, es Y", "no es casualidad", "no es un hecho aislado", "mas que un club".
- Topicos de periodico deportivo: "no dejo indiferente a nadie", "dio mucho que hablar", "un antes y un despues", "autentico espectaculo", "la aficion vibro", "los amantes del futbol", "puso la piel de gallina".
- Tres adjetivos seguidos, y los superlativos vacios ("impresionante", "espectacular", "historico") cuando no los sostiene un dato.
- Terminar el articulo con una moraleja o una reflexion generica sobre el futbol moderno. Acaba con algo concreto: un dato, una escena, una frase de alguien.`;

/**
 * Reglas del titular, aparte del resto de la voz porque es la pieza que mas
 * se resiste: el modelo tiende al titular de reportaje dominical (una idea
 * principal, dos puntos, y un matiz ironico detras) aunque el cuerpo salga
 * bien.
 *
 * Van con pares malo -> bueno y no solo con prohibiciones porque la primera
 * version, que prohibia el patron "Club: descripcion", se esquivo sola
 * moviendo los dos puntos de sitio ("La respuesta ingenua de la Lazio:
 * cuando los ultras..."). Contra eso funciona el ejemplo, no la regla.
 */
const TITLE_RULES = `EL TITULAR (la pieza mas importante: es lo que se lee en el blog, en Google y en el tuit)

Directo, corto y concreto. Una sola oracion: SUJETO + VERBO EN PRESENTE + QUE ha pasado. Nada mas.

- Maximo 10 palabras. Si te salen 12, sobran 3.
- Cuenta UN solo hecho, el principal. El matiz, la ironia y el contexto van en el cuerpo, nunca en el titular.
- Verbo activo, en presente y concreto: burlan, se plantan, llenan, toman, pagan, prohiben, montan. Huye de "se produce", "tiene lugar", "protagonizan".

PROHIBIDO en el titular, sin excepciones:
- Los DOS PUNTOS. Ninguno, en ninguna posicion. Es la muleta que convierte un titular en un teletipo.
- Las subordinadas y los arranques de reportaje: "cuando...", "lo que...", "por que...", "asi es como...", "el dia que...", "la historia de...".
- Los adjetivos que opinan ("ingenua", "increible", "historica"): el titular cuenta, no valora.
- Las comillas, los guiones largos y las preguntas.

Ejemplos (malo -> bueno):
- "La respuesta ingenua de la Lazio: cuando los ultras se burlan de las restricciones con una 'excursion cultural'" -> "Los ultras de la Lazio burlan la prohibicion de viajar"
- "Sampdoria: la protesta ultra contra la directiva" -> "La grada de la Sampdoria se planta contra su directiva"
- "La tercera division alemana: ejemplo de 'Against Modern Football'" -> "La tercera alemana llena estadios sin futbol moderno"
- "Despliegue de la aficion del Hertha Berlin en la previa del derbi" -> "El Hertha toma Berlin la vispera del derbi"`;

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

- "lead": entradilla de 1-2 frases (maximo 45 palabras). Esta si la escribes tu, resumiendo el articulo con gancho. No repitas literalmente el primer parrafo. Escribela con esta voz (el resto del texto NO se toca, solo la entradilla):

${VOICE_RULES}
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

/**
 * Deja constancia en los logs del cron cuando un titular se salta las dos
 * reglas que se pueden comprobar sin criterio (dos puntos y longitud).
 *
 * Solo avisa, no lo corrige: recortar por los dos puntos automaticamente da
 * titulares peores que el original ("Lazio: cuando los ultras..." se
 * quedaria en "cuando los ultras..."), y la noticia pasa igualmente por la
 * cola de revision, donde el titular se edita a mano. Esto sirve para saber
 * si el prompt esta cumpliendo sin tener que leerse la cola entera.
 */
function warnIfWeakTitle(title: string): void {
  const words = title.trim().split(/\s+/).length;
  const problems: string[] = [];
  if (title.includes(":")) problems.push("lleva dos puntos");
  if (words > 10) problems.push(`tiene ${words} palabras (maximo 10)`);
  if (problems.length) {
    console.warn(`Titular flojo — ${problems.join(" y ")}: "${title}"`);
  }
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
      // El articulo maquetado (entradilla + secciones + cita + ficha) ocupa
      // bastante mas que el bloque de parrafos que se pedia antes.
      max_tokens: 2000,
      messages: [
        {
          role: "user",
          content: `Eres redactor de un blog español muy especializado en cultura ULTRA/casual del fútbol (marca Hools): ambiente de aficion, tifos, mosaicos, banderas, desplazamientos masivos de hinchas, fiestas de grada, moda casual. NO es un blog generico de noticias de futbol.

Primero decide si la siguiente noticia encaja de verdad en esta categoria (${input.category}): ${CATEGORY_FOCUS[input.category]}

Se estricto: ante la duda, descartala.

Titular original: "${input.originalTitle}"
Fragmento original: "${input.snippet}"

Si NO encaja, responde SOLO con este JSON, sin texto adicional: {"relevant": false}

Si SI encaja, escribe un ARTICULO COMPLETO Y ORIGINAL en español de España, de entre 350 y 500 palabras. No traduzcas ni resumas el original: usalo solo como punto de partida, y desarrolla tu propio contenido con contexto, trasfondo y análisis. No copies frases del original.

${VOICE_RULES}

${TITLE_RULES}

El articulo va MAQUETADO, asi que devuelvelo por piezas:

- "title": el titular, siguiendo al pie de la letra las reglas de arriba. Antes de darlo por bueno, comprueba: ¿lleva dos puntos? ¿pasa de 10 palabras? ¿empieza por "cuando", "lo que" o "asi es como"? Si alguna es que si, reescribelo.
- "lead": entradilla de 1 o 2 frases (maximo 45 palabras). Va destacada al principio y es tambien el resumen que se ve en el listado del blog y en Google. Que arranque con lo concreto de la noticia, no con contexto general. No empieces con "En este articulo" ni formulas de relleno.
- "sections": entre 3 y 4 secciones. La PRIMERA lleva "heading": null (arranca directo, sin ladillo). Las siguientes llevan un ladillo corto de 3-6 palabras, concreto y con gancho, nunca generico ("Contexto", "Conclusion" y similares estan prohibidos). Cada seccion tiene 1-2 parrafos en "paragraphs".
- "pullQuote": UNA frase corta (10-25 palabras) sacada del propio articulo o que lo resuma, para destacarla a gran tamaño entre parrafos. Debe sostenerse sola fuera de contexto y decir algo con carne: una imagen concreta o una idea con filo, nunca una obviedad ni una frase de calendario motivacional. Si no hay ninguna que valga, null.
- "facts": entre 2 y 4 datos concretos de la noticia en pares etiqueta/valor, para un recuadro tipo ficha (ej. {"label":"Club","value":"Levski Sofia"}, {"label":"Estadio","value":"Vasil Levski"}, {"label":"Competicion","value":"Europa League"}, {"label":"Grupo","value":"Ultras Levski"}). Etiquetas de 1-2 palabras. IMPORTANTISIMO: solo datos que aparezcan de verdad en el material original. NO INVENTES fechas, cifras, nombres ni aforos. Si el original no da datos fiables, devuelve una lista vacia: es preferible sin ficha que con datos falsos.
- "igCaption": pie de foto para Instagram sobre la misma noticia. Reglas: 2-3 frases cortas con gancho directo (tono cultura terrace/ultra, sin sonar a marca corporativa) + una pregunta final a la audiencia para invitar a comentar. NUNCA uses @menciones. Cierra con una linea de 8-12 hashtags mezclando nicho y tema (ej. #terraceculture #awaydays #casuals #ultras #groundhopping mas los especificos de esta noticia). Sin enlaces.

Responde SOLO con este JSON, sin texto adicional ni bloques de codigo:
{"relevant": true, "title": "titular", "lead": "entradilla", "sections": [{"heading": null, "paragraphs": ["parrafo", "parrafo"]}, {"heading": "ladillo corto", "paragraphs": ["parrafo"]}], "pullQuote": "frase destacada o null", "facts": [{"label": "Club", "value": "..."}], "igCaption": "pie de foto para Instagram\\n\\n#hashtags"}`,
        },
      ],
    });

    const textBlock = message.content.find((block) => block.type === "text");
    const raw = textBlock && textBlock.type === "text" ? textBlock.text : "";
    const parsed = JSON.parse(extractJson(raw)) as {
      relevant?: boolean;
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
    warnIfWeakTitle(parsed.title);

    const sections = normalizeSections(parsed.sections, parsed.body);
    if (!sections.length) throw new Error("Respuesta sin cuerpo de articulo");

    // Si el modelo se salta la entradilla, se usa el primer parrafo antes que
    // publicar el articulo sin ella (el resumen del listado depende de esto).
    const lead = parsed.lead?.trim() || sections[0].paragraphs[0] || "";

    return {
      title: parsed.title,
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
