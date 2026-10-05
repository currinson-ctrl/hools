// Curación editorial con Claude: elige, clasifica y redacta en español.
//
// Llamada HTTP directa a la API de Anthropic (sin SDK, para que esta carpeta
// no tenga dependencias). Sin ANTHROPIC_API_KEY, o si la llamada falla, se
// monta una edición básica con los titulares originales: el boletín sale
// igual, solo que sin redacción ni análisis.

import { brand, competitors } from "../config.mjs";

const MODEL = process.env.LAIA_MODEL || "claude-sonnet-5-5";
const CATEGORIES = ["Lanzamiento", "Software e IA", "Alianza", "Negocio", "Certificación", "Evento", "Canal"];

function buildPrompt(candidates, period) {
  const brands = competitors.map((b) => `${b.key} = ${b.name}`).join(", ");
  const list = candidates
    .map(
      (c) =>
        `[${c.id}] marca_detectada=${c.brand || "ninguna"} | ${c.date.toISOString().slice(0, 10)} | ${c.source}\n` +
        `TITULAR: ${c.title}\nEXTRACTO: ${c.summary.slice(0, 400)}`
    )
    .join("\n\n");

  return `Eres el analista de inteligencia de mercado de ${brand.name}, fabricante español ("The AI & IoT Camera Company") de cámaras PTZ y de videoconferencia con IA, micrófonos y altavoces, que vende solo a través del canal de integración AV profesional (corporativo, educación, administración pública, producción en directo). Software propio: AICC (control de cámaras con IA, también de otras marcas), CCMS (gestión centralizada de cámaras) e IAVS (integración con audio de terceros). Soporte Prime de hasta 5 años.

Preparas "${brand.newsletterName}", el boletín quincenal interno (${period}) que lee el equipo comercial, de producto y dirección. Vigilamos sobre todo a: ${brands}. También interesa el sector AV profesional en general.

CANDIDATAS (titulares en bruto de buscadores y prensa AV):

${list}

INSTRUCCIONES
1. Descarta todo lo que no sea AV profesional: periféricos de consumo (ratones, teclados, gaming, auriculares de consumo), bolsa y cotizaciones, ofertas o descuentos de tiendas, notas de prensa irrelevantes, duplicados de la misma noticia (quédate con la mejor fuente) y artículos antiguos reciclados. Si una noticia no es claramente de esta quincena, descártala.
2. Corrige la marca si la detectada es errónea. POLY es la división de HP; AVER es AVer Information.
   Escribe SIEMPRE los nombres de marca en MAYÚSCULAS en todos los textos: PTZOPTICS, AVER, AVONIC, LOGITECH, POLY, HP, LAIA (también cualquier otra marca del sector que aparezca: NEAT, YEALINK, SONY...). Los nombres de producto van tal cual (Rally, Rise 4K, Studio X72).
3. Escribe SIEMPRE en español de España, tono profesional pero ágil, sin bombo. No inventes datos: usa solo lo que dicen titular y extracto. Si el extracto es pobre, resume con prudencia.
4. "lectura_laia": 1-2 frases con qué significa para ${brand.name} (amenaza, oportunidad, argumento de venta, hueco de producto, movimiento de canal). Concreto y accionable, nunca genérico.
5. Elige como "destacada" la noticia de mayor impacto competitivo para ${brand.name}.
6. "dato": solo si alguna candidata trae una cifra llamativa (cuota, crecimiento, precio, unidades). Si no hay, null.
7. Máximo 3 noticias por marca y 5 en "radar". Calidad antes que cantidad: es mejor una marca sin noticias que rellenar.

Responde SOLO con JSON válido, sin texto alrededor, con esta forma:
{
  "asunto": "asunto del correo, máx. 70 caracteres, que invite a abrir",
  "portada": "titular de portada de la edición, máx. 80 caracteres",
  "editorial": "2-3 frases que resuman la quincena y por qué importa",
  "destacada": {"id": "nX", "marca": "clave o null", "categoria": "${CATEGORIES.join("|")}", "titulo": "...", "resumen": "3-4 frases", "lectura_laia": "..."},
  "noticias": [{"id": "nX", "marca": "clave", "categoria": "...", "titulo": "máx. 90 caracteres", "resumen": "2 frases", "lectura_laia": "...", "impacto": 1}],
  "radar": [{"id": "nX", "titulo": "...", "resumen": "1 frase"}],
  "dato": {"id": "nX", "cifra": "p. ej. 9,2 %", "texto": "qué mide la cifra, 1 frase"},
  "tendencia": {"titulo": "...", "texto": "2-3 frases sobre el patrón que se repite en las noticias de la quincena"}
}
"impacto": 3 = alto (mueve el mercado o compite de frente con ${brand.name}), 2 = medio, 1 = informativo. La destacada no se repite en "noticias".`;
}

function extractJson(text) {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start < 0 || end < start) throw new Error("La respuesta no trae JSON");
  return JSON.parse(text.slice(start, end + 1));
}

async function askClaude(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": process.env.ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({ model: MODEL, max_tokens: 8000, messages: [{ role: "user", content: prompt }] }),
    signal: AbortSignal.timeout(180000),
  });
  if (!res.ok) throw new Error(`API de Anthropic: HTTP ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data.content.filter((b) => b.type === "text").map((b) => b.text).join("");
}

/** Une la redacción de Claude con los datos reales (enlace, medio, fecha). */
function attach(entry, byId) {
  const c = byId.get(entry?.id);
  if (!c) return null;
  const marca = competitors.some((b) => b.key === entry.marca) ? entry.marca : c.brand;
  return {
    ...entry,
    marca,
    categoria: CATEGORIES.includes(entry.categoria) ? entry.categoria : "",
    link: c.link,
    source: c.source,
    date: c.date,
    image: c.image || "",
  };
}

function basicEdition(candidates) {
  const noticias = [];
  for (const b of competitors) {
    candidates
      .filter((c) => c.brand === b.key)
      .slice(0, 3)
      .forEach((c) => noticias.push({ id: c.id, marca: b.key, titulo: c.title, resumen: c.summary.slice(0, 240), impacto: 1 }));
  }
  const radar = candidates
    .filter((c) => !c.brand)
    .slice(0, 5)
    .map((c) => ({ id: c.id, titulo: c.title, resumen: c.summary.slice(0, 160) }));
  const [destacada, ...resto] = noticias;
  return {
    asunto: `${brand.newsletterName}: lo que han movido PTZOptics, AVer, Avonic, Logitech y Poly`,
    portada: "Lo que se ha movido en el mercado AV esta quincena",
    editorial: "",
    destacada: destacada || null,
    noticias: resto,
    radar,
    dato: null,
    tendencia: null,
  };
}

export async function curate(candidates, period, { log = console.error } = {}) {
  const byId = new Map(candidates.map((c) => [c.id, c]));
  let raw;
  if (!process.env.ANTHROPIC_API_KEY) {
    log("Sin ANTHROPIC_API_KEY: edición básica sin redacción.");
    raw = basicEdition(candidates);
  } else {
    try {
      raw = extractJson(await askClaude(buildPrompt(candidates, period)));
    } catch (e) {
      log(`Curación con Claude fallida (${e.message}): edición básica.`);
      raw = basicEdition(candidates);
    }
  }
  const destacada = attach(raw.destacada, byId);
  const noticias = (raw.noticias || []).map((n) => attach(n, byId)).filter(Boolean).filter((n) => n.id !== destacada?.id);
  const radar = (raw.radar || []).map((n) => attach(n, byId)).filter(Boolean);
  const dato = raw.dato && byId.has(raw.dato.id) ? attach(raw.dato, byId) : null;
  return { ...raw, destacada, noticias, radar, dato };
}
