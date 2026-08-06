import type { Category } from "@prisma/client";
import { CATEGORY_CTA } from "./sources";

/**
 * Construccion del HTML que se publica como cuerpo del articulo en Shopify.
 *
 * Vive en su propio modulo (y no dentro de rss.ts) porque lo usan tres sitios
 * con origenes distintos: el rastreo de RSS, el de cuentas de X, y el script
 * de reestructuracion de articulos ya publicados. Las clases `hools-*` que
 * emite son el contrato con la plantilla del tema (main-article-hools-
 * editorial.liquid): si se renombran aqui, hay que renombrarlas alli.
 */

export interface ArticleSection {
  /** Ladillo de la seccion. La primera suele venir sin el (arranque directo). */
  heading: string | null;
  paragraphs: string[];
}

export interface ArticleFact {
  label: string;
  value: string;
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface BuildArticleHtmlInput {
  /** Entradilla: 1-2 frases que resumen la noticia. Tambien alimenta el resumen de Shopify. */
  lead: string;
  sections: ArticleSection[];
  /** Frase del propio texto sacada a gran tamaño. Opcional. */
  pullQuote?: string | null;
  /** Datos del recuadro "la ficha". Se omite entero si viene vacio. */
  facts?: ArticleFact[];
  /** Fotos adicionales a la destacada (las que trae un tuit multi-foto). */
  galleryImageUrls?: string[];
  sourceName: string;
  sourceUrl: string;
  category: Category;
  /**
   * Transforma el HTML de un bloque de parrafos ya escapado (lo usa el
   * rastreo para enlazar los grupos de aficion mencionados). Identidad si no
   * se pasa.
   */
  decorate?: (html: string) => string;
}

function renderParagraphs(paragraphs: string[], decorate: (html: string) => string): string {
  const html = paragraphs
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("\n");
  return html ? decorate(html) : "";
}

function renderPullQuote(quote: string, decorate: (html: string) => string): string {
  return [
    '<blockquote class="hools-pullquote">',
    decorate(`<p>${escapeHtml(quote)}</p>`),
    "</blockquote>",
  ].join("\n");
}

function renderGallery(urls: string[]): string {
  // Una sola foto extra no es una galeria: se sirve como figura suelta para
  // que ocupe todo el ancho en vez de quedarse a media columna.
  const modifier = urls.length === 1 ? " hools-gallery--single" : "";
  const items = urls
    .map((url) => `  <img src="${escapeHtml(url)}" alt="" loading="lazy" />`)
    .join("\n");
  return `<figure class="hools-gallery${modifier}">\n${items}\n</figure>`;
}

function renderFacts(facts: ArticleFact[]): string {
  const rows = facts
    .filter((f) => f.label.trim() && f.value.trim())
    .map(
      (f) =>
        `  <div class="hools-facts__row"><dt>${escapeHtml(f.label)}</dt><dd>${escapeHtml(
          f.value
        )}</dd></div>`
    );
  if (!rows.length) return "";
  return [
    '<aside class="hools-facts">',
    '  <h3 class="hools-facts__title">La ficha</h3>',
    '  <dl class="hools-facts__list">',
    ...rows,
    "  </dl>",
    "</aside>",
  ].join("\n");
}

function renderSource(sourceName: string, sourceUrl: string): string {
  return (
    `<p class="hools-source">Fuente: ` +
    `<a href="${escapeHtml(sourceUrl)}" target="_blank" rel="noopener noreferrer nofollow">` +
    `${escapeHtml(sourceName)}</a></p>`
  );
}

/**
 * Cierre comercial del articulo. Antes era una linea en cursiva del mismo
 * peso que el cuerpo y pasaba desapercibida; ahora es un bloque propio. Se
 * mantiene como HTML dentro del articulo (y no como bloque del tema) para
 * que el unico puente del blog a la tienda siga existiendo aunque el
 * articulo se lea fuera de la plantilla (lector de RSS, vista previa, etc.).
 */
export function buildShopCtaHtml(category: Category): string {
  const cta = CATEGORY_CTA[category];
  const publicDomain = process.env.SHOPIFY_PUBLIC_DOMAIN || "www.hoolsbrand.com";
  const url = `https://${publicDomain}${cta.path}?utm_source=blog&utm_medium=article&utm_campaign=away-end`;
  return [
    '<aside class="hools-shop-cta">',
    '  <p class="hools-shop-cta__kicker">Return to the Origins</p>',
    `  <p class="hools-shop-cta__text">${escapeHtml(cta.text)}</p>`,
    `  <p class="hools-shop-cta__action"><a href="${escapeHtml(url)}">Ver la colección</a></p>`,
    "</aside>",
  ].join("\n");
}

/**
 * Extrae la entradilla del HTML ya construido. Shopify usa el resumen para la
 * tarjeta del listado y como meta description, asi que interesa que sea la
 * entradilla escrita a proposito y no el primer parrafo cortado a lo bruto.
 */
export function extractLead(bodyHtml: string): string | null {
  const match = /<p class="hools-lead">([\s\S]*?)<\/p>/i.exec(bodyHtml);
  if (!match) return null;
  return match[1].replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim() || null;
}

function decodeEntities(input: string): string {
  return input
    .replace(/&nbsp;/g, " ")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&");
}

export interface LegacyArticle {
  paragraphs: string[];
  imageUrls: string[];
  sourceName: string | null;
  sourceUrl: string | null;
}

/**
 * Descompone en sus piezas un articulo con el formato plano anterior a la
 * maquetacion (una tira de <p>, las fotos extra apiladas al final, y las
 * lineas de fuente y cierre en cursiva). Lo usa el reproceso de los
 * articulos ya publicados, que no conserva el JSON con el que se generaron.
 */
export function parseLegacyArticleHtml(html: string): LegacyArticle {
  const imageUrls = [...html.matchAll(/<img[^>]+src=["']([^"']+)["']/gi)].map((m) =>
    decodeEntities(m[1])
  );

  const sourceMatch = /Fuente:\s*<a[^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/i.exec(html);

  const paragraphs = [...html.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi)]
    .map((m) => m[1])
    .filter((inner) => !/<img/i.test(inner))
    .filter((inner) => !/Fuente:/i.test(inner))
    .filter((inner) => !/Return to the Origins/i.test(inner))
    .map((inner) => decodeEntities(inner.replace(/<[^>]*>/g, " ")).replace(/\s+/g, " ").trim())
    .filter(Boolean);

  return {
    paragraphs,
    imageUrls,
    sourceName: sourceMatch
      ? decodeEntities(sourceMatch[2].replace(/<[^>]*>/g, "")).trim() || null
      : null,
    sourceUrl: sourceMatch ? decodeEntities(sourceMatch[1]) : null,
  };
}

/** Un articulo ya maquetado se reconoce por la entradilla con su clase. */
export function isRestructured(html: string): boolean {
  return /class="hools-lead"/i.test(html);
}

export function buildArticleHtml(input: BuildArticleHtmlInput): string {
  const decorate = input.decorate ?? ((html: string) => html);
  const gallery = (input.galleryImageUrls ?? []).filter(Boolean);

  const parts: string[] = [];

  if (input.lead.trim()) {
    parts.push(decorate(`<p class="hools-lead">${escapeHtml(input.lead.trim())}</p>`));
  }

  const sections = input.sections.filter(
    (s) => s.heading?.trim() || s.paragraphs.some((p) => p.trim())
  );

  // La cita va tras la primera seccion y la galeria tras la segunda: asi
  // ambas caen dentro del texto y lo parten, en vez de amontonarse al final
  // como hacian las fotos hasta ahora.
  const quoteAfter = sections.length > 1 ? 0 : -1;
  const galleryAfter = sections.length > 2 ? 1 : sections.length - 1;

  sections.forEach((section, index) => {
    if (section.heading?.trim()) {
      parts.push(`<h2>${escapeHtml(section.heading.trim())}</h2>`);
    }
    const body = renderParagraphs(section.paragraphs, decorate);
    if (body) parts.push(body);

    if (index === quoteAfter && input.pullQuote?.trim()) {
      parts.push(renderPullQuote(input.pullQuote.trim(), decorate));
    }
    if (index === galleryAfter && gallery.length) {
      parts.push(renderGallery(gallery));
    }
  });

  // Si no hubo secciones donde colgarlas, no se pierden: van al final del
  // cuerpo, antes de la fuente.
  if (quoteAfter === -1 && input.pullQuote?.trim()) {
    parts.push(renderPullQuote(input.pullQuote.trim(), decorate));
  }
  if (!sections.length && gallery.length) {
    parts.push(renderGallery(gallery));
  }

  const facts = renderFacts(input.facts ?? []);
  if (facts) parts.push(facts);

  parts.push(renderSource(input.sourceName, input.sourceUrl));
  parts.push(buildShopCtaHtml(input.category));

  return parts.filter(Boolean).join("\n");
}
