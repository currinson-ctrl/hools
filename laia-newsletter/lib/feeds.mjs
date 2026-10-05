// Descarga y lectura de feeds RSS/Atom, sin dependencias.
//
// Se usan tres tipos de fuente: búsquedas de Google News, búsquedas de Bing
// News y los feeds de la prensa AV. Ninguna es crítica: si una falla se
// registra y se sigue con las demás, para que una web caída no deje sin
// boletín.

const UA = "Mozilla/5.0 (compatible; LAIA-RadarAV/1.0)";

export async function fetchText(url, timeoutMs = 15000) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "application/rss+xml, application/xml, text/xml, text/html;q=0.8, */*;q=0.5" },
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

const ENTITIES = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " };

export function decodeEntities(s) {
  return s
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/&([a-z]+);/gi, (m, n) => ENTITIES[n.toLowerCase()] ?? m);
}

export function stripHtml(s) {
  return decodeEntities(
    decodeEntities(s.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1"))
      .replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i"));
  return m ? m[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1").trim() : "";
}

function attr(block, tagName, attrName) {
  const m = block.match(new RegExp(`<${tagName}\\b[^>]*\\b${attrName}=["']([^"']+)["']`, "i"));
  return m ? decodeEntities(m[1]) : "";
}

/** Convierte un XML RSS 2.0 o Atom en una lista de items normalizados. */
export function parseFeed(xml, fallbackSource = "") {
  const blocks = xml.match(/<item\b[\s\S]*?<\/item>/gi) || xml.match(/<entry\b[\s\S]*?<\/entry>/gi) || [];
  return blocks.map((b) => {
    let link = decodeEntities(tag(b, "link")) || attr(b, "link", "href");
    const rawDesc = tag(b, "description") || tag(b, "summary") || tag(b, "content:encoded") || tag(b, "content");
    const image =
      attr(b, "media:content", "url") ||
      attr(b, "media:thumbnail", "url") ||
      decodeEntities(tag(b, "News:Image")) ||
      (/<enclosure\b[^>]*type=["']image/i.test(b) ? attr(b, "enclosure", "url") : "") ||
      (decodeEntities(rawDesc).match(/<img[^>]+src=["']([^"']+)["']/i)?.[1] ?? "");
    // Bing envuelve el enlace real en un redirect con el destino en ?url=
    try {
      const u = new URL(link);
      if (/bing\.com$/i.test(u.hostname) && u.searchParams.get("url")) link = u.searchParams.get("url");
    } catch {}
    const source = stripHtml(tag(b, "source") || tag(b, "News:Source")) || fallbackSource;
    let title = stripHtml(tag(b, "title"));
    // Google News añade " - Medio" al final del titular.
    if (source && title.endsWith(` - ${source}`)) title = title.slice(0, -(source.length + 3));
    const date = new Date(tag(b, "pubDate") || tag(b, "published") || tag(b, "updated") || tag(b, "dc:date"));
    return {
      title,
      link,
      source,
      date: isNaN(date) ? null : date,
      summary: stripHtml(rawDesc).slice(0, 600),
      image: image && /^https:/i.test(image) ? image : "",
    };
  });
}

export function googleNewsUrl(query, lang = "en") {
  const loc = lang === "es" ? "hl=es&gl=ES&ceid=ES:es" : "hl=en-US&gl=US&ceid=US:en";
  return `https://news.google.com/rss/search?q=${encodeURIComponent(query + " when:21d")}&${loc}`;
}

export function bingNewsUrl(query) {
  return `https://www.bing.com/news/search?q=${encodeURIComponent(query)}&format=rss`;
}

/** Descarga muchas fuentes en paralelo (con límite) y junta los items. */
export async function collect(sources, { concurrency = 6, log = console.error } = {}) {
  const out = [];
  let i = 0;
  async function worker() {
    while (i < sources.length) {
      const s = sources[i++];
      try {
        const items = parseFeed(await fetchText(s.url), s.name);
        items.forEach((it) => (it.hint = s.brand || null));
        out.push(...items);
        log(`  ✓ ${s.label}: ${items.length}`);
      } catch (e) {
        log(`  ✗ ${s.label}: ${e.message}`);
      }
    }
  }
  await Promise.all(Array.from({ length: concurrency }, worker));
  return out;
}

/** og:image de un artículo, para dar imagen a las noticias destacadas. */
export async function fetchOgImage(url) {
  try {
    if (/news\.google\.com/.test(url)) return "";
    const html = (await fetchText(url, 8000)).slice(0, 300000);
    const m =
      html.match(/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i) ||
      html.match(/<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i) ||
      html.match(/<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i);
    const img = m ? decodeEntities(m[1]) : "";
    return /^https:/i.test(img) ? img : "";
  } catch {
    return "";
  }
}
