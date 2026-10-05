// Configuración del boletín "Radar AV" de LAIA.
//
// Todo lo que se toca a menudo vive aquí: identidad de marca, marcas que se
// vigilan, fuentes del sector y agenda de ferias. El resto del código no
// tiene valores de marca escritos a mano.

// --- Identidad LAIA ---------------------------------------------------------
// Sacada de la «Brand Style Guide» de LAIA (abril de 2024). La misma guía,
// resumida para cualquier otro trabajo de LAIA, está en
// .claude/skills/laia-brand/SKILL.md. No cambies colores ni logos a ojo:
// la guía prohíbe alterar el color del logo.
export const brand = {
  name: "LAIA",
  newsletterName: "Radar AV",
  slogan: "The AI & IoT Camera Company",
  signature: "A European Company",
  tagline: "Inteligencia de mercado AV para el equipo LAIA",
  website: "https://laiatech.com",
  // Logos oficiales (PNG transparente, extraídos del vectorial de la guía).
  // En el correo se adjuntan como imágenes en línea (cid:), o se sirven desde
  // LAIA_ASSETS_URL si se define (una URL pública con estos mismos ficheros).
  logos: {
    color: "logo-color-slogan.png", // cabecera, sobre fondo claro
    white: "logo-white.png", // barra inferior azul oscuro
  },
  colors: {
    red: "#E4032C", // Laia Red
    redDark: "#650F31", // final del degradado Laia
    ink: "#1B1D24", // Dark Blue: texto y barra inferior
    grey: "#85878E", // Blue Grey
    soft: "#EDF0F2", // Soft White
    white: "#FFFFFF",
    line: "#D9DDE1",
  },
  // Degradado Laia: #e4032c + #650f31, -40°. Se usa para llamar la atención
  // (marcos con texto, botones), nunca como relleno de todo.
  gradient: "linear-gradient(130deg, #E4032C 0%, #E4032C 35%, #650F31 100%)",
  // Mandau para titulares y números (si el equipo la tiene instalada);
  // Poppins para el resto. Ambas caen a Arial donde no haya fuentes web.
  fontHead: "Mandau, Poppins, 'Helvetica Neue', Arial, sans-serif",
  fontBody: "Poppins, 'Helvetica Neue', Arial, sans-serif",
};

// --- Marcas vigiladas --------------------------------------------------------
// Los nombres van en MAYÚSCULAS a propósito: es el estilo del boletín para
// todas las marcas (ver lib/brandcase.mjs, que lo aplica también al texto).
// queries: búsquedas en Google News / Bing News (ya acotadas a temas AV).
// match:   cómo reconocer la marca en un titular o resumen.
// context: si se define, la noticia solo cuenta si además aparece alguno de
//          estos términos (para marcas con nombre ambiguo o con productos de
//          consumo que no interesan, como Logitech o Poly).
// Expresión con límites de palabra que sí entienden tildes (\b de JS no:
// "ratón" seguido de espacio no tiene límite de palabra para \b).
function words(list) {
  return new RegExp(`(?<![\\p{L}\\p{N}])(?:${list.join("|")})(?![\\p{L}\\p{N}])`, "iu");
}

const AV_CONTEXT = words([
  "ptz", "c[áa]maras?", "cameras?", "video ?conferenc\\w*", "videoconferencias?", "conferencing",
  "meeting rooms?", "salas? de reuniones", "teams rooms", "zoom rooms", "video ?bars?", "barras? de v[íi]deo",
  "ndi", "sdi", "hdmi", "streaming", "broadcast", "auto ?tracking", "tracking", "aulas?", "classrooms?",
  "hybrid", "h[íi]brid[ao]s?", "huddle", "rally", "sight", "meetup", "roommate", "tap ip", "tap scheduler",
  "studio [xevrg]\\w*", "g7500", "videoos", "poly lens", "directorai", "pro ?av", "audiovisual",
  "integrador(es)?", "integrators?", "infocomm", "ise", "ibc", "nab", "avixa", "educause", "zoomtopia",
]);

export const competitors = [
  {
    key: "ptzoptics",
    name: "PTZOPTICS",
    match: /ptz ?optics/i,
    queries: ['"PTZOptics"'],
  },
  {
    key: "aver",
    name: "AVER",
    // "aver" es una palabra común en español: se exige la marca escrita como
    // tal o un modelo/tema de cámara al lado.
    match: /\bAVer\b|aver information|aver europe/,
    context: AV_CONTEXT,
    queries: ['"AVer" (PTZ OR camera OR "auto tracking" OR videoconferencing)', '"AVer Information"'],
  },
  {
    key: "avonic",
    name: "AVONIC",
    match: /avonic/i,
    queries: ['"Avonic"'],
  },
  {
    key: "logitech",
    name: "LOGITECH",
    match: /logitech/i,
    context: AV_CONTEXT,
    // Solo la división de videocolaboración: ratones, teclados, gaming o
    // auriculares de consumo se descartan aunque sean de Logitech.
    queries: [
      '"Logitech" (Rally OR Sight OR "video conferencing" OR "Teams Rooms" OR "Zoom Rooms" OR "Logitech for Business")',
    ],
  },
  {
    key: "poly",
    name: "POLY (HP)",
    match: /\bpoly\b|hp poly|poly studio/i,
    context: AV_CONTEXT,
    queries: ['"HP Poly" OR "Poly Studio" OR "Poly VideoOS"', '"Poly" HP (video conferencing OR "meeting room")'],
  },
];

// Productos y temas que NO interesan aunque sean de una marca vigilada.
export const excludePatterns = [
  words([
    "mouse", "mice", "rat[óo]n(es)?", "keyboards?", "teclados?", "gaming", "gamers?", "g pro", "mx master",
    "mx keys", "logitech lift", "logitech pebble", "logitech g\\d*", "astro a\\d+", "streamcam", "mandos?",
    "racing wheel", "steering wheel", "volantes?", "playstation", "xbox", "nintendo", "earbuds", "ipad keyboard",
  ]),
  words(["polymarket", "polygon", "polyester", "poli[ée]ster", "polymer", "pol[íi]mero", "polyphia", "poly ?network"]),
  // Información bursátil: no es noticia de producto ni de canal.
  words(["stock price", "share price", "cotizaci[óo]n", "dividend\\w*", "earnings call", "price target"]),
];

// --- Fuentes del sector ----------------------------------------------------
// Prensa AV profesional. Sus noticias entran en "Radar del sector" cuando
// no son de ninguna marca vigilada, y en la marca correspondiente cuando sí.
export const sectorFeeds = [
  { name: "rAVe [PUBS]", url: "https://www.ravepubs.com/feed/" },
  { name: "Commercial Integrator", url: "https://www.commercialintegrator.com/feed/" },
  { name: "AV Network", url: "https://www.avnetwork.com/feeds/all" },
  { name: "Sound & Video Contractor", url: "https://www.svconline.com/feeds/all" },
  { name: "AVNation", url: "https://www.avnation.tv/feed/" },
  { name: "Installation", url: "https://www.installation-international.com/feeds/all" },
];

// Búsquedas generales del sector (además de las de cada marca).
export const sectorQueries = [
  '"PTZ camera" (launch OR announces OR unveils)',
  '"video conferencing" (camera OR "meeting room") (launch OR announces)',
  '"cámara PTZ" OR "videoconferencia" audiovisual profesional',
];

// Tope de candidatas que se mandan a Claude para elegir (controla el coste).
export const maxCandidates = 70;

// --- Agenda --------------------------------------------------------------
// Ferias que aparecen en el bloque "Agenda" con cuenta atrás. Solo salen las
// que aún no han terminado. Revisa las fechas cada temporada.
export const agenda = [
  { name: "ISE 2027", place: "Barcelona", start: "2027-02-02", end: "2027-02-05" },
  { name: "InfoComm 2027", place: "Orlando (EE. UU.)", start: "2027-06-12", end: "2027-06-18" },
];

// --- Calendario de envío ---------------------------------------------------
// Viernes del mes en que sale el boletín (1 = primer viernes del mes...).
// Por defecto el 2.º y el 4.º, que existen todos los meses.
export const sendFridays = (process.env.LAIA_SEND_FRIDAYS || "2,4")
  .split(",")
  .map((n) => Number(n.trim()))
  .filter(Boolean);
