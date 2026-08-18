"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  deleteArticleFromShopify,
  isShopifyConfigured,
  publishArticleToShopify,
  updateArticleOnShopify,
  uploadImageToShopifyFiles,
} from "@/lib/shopify";
import { deleteTweet, isTwitterConfigured, postTweet } from "@/lib/twitter";
import {
  isInstagramConfigured,
  postReelToInstagram,
  postStoryToInstagram,
  postToInstagram,
} from "@/lib/instagram";
import { isFacebookConfigured, postToFacebook } from "@/lib/facebook";
import {
  improveSpanishTitle,
  needsBetterTitle,
  normalizeTitle,
  restructureSpanishArticle,
  translateToSpanish,
} from "@/lib/translate";
import { searchRelatedImage } from "@/lib/image-search";
import { findMentionedGroups, linkMentionedGroups, parseAliases } from "@/lib/groups";
import {
  buildArticleHtml,
  isRestructured,
  parseLegacyArticleHtml,
  type ArticleSection,
} from "@/lib/article-html";
import { runAggregation } from "@/lib/aggregate";
import { getManualSource, MANUAL_GUID_PREFIX, MANUAL_SOURCE_NAME } from "@/lib/manual";
import { buildBlogArticleUrl, buildCtaHtml, CATEGORY_HASHTAGS } from "@/lib/sources";
import { ArticleStatus, Category, SourceType } from "@prisma/client";

function withError(basePath: string, message: string): never {
  const separator = basePath.includes("?") ? "&" : "?";
  redirect(`${basePath}${separator}error=${encodeURIComponent(message)}`);
}

export async function updateArticleAction(formData: FormData) {
  const id = String(formData.get("id"));
  const title = String(formData.get("title") || "").trim();
  const excerpt = String(formData.get("excerpt") || "").trim();
  const tweetText = String(formData.get("tweetText") || "").trim();
  const igCaption = String(formData.get("igCaption") || "").trim();
  const imageUrl = String(formData.get("imageUrl") || "").trim();

  if (!id || !title || !excerpt) {
    withError(`/dashboard/articles/${id}`, "Título y contenido son obligatorios");
  }

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) withError(`/dashboard/articles/${id}`, "Artículo no encontrado");

  if (article!.status === "PUBLISHED" && article!.shopifyArticleId) {
    try {
      await updateArticleOnShopify(article!.shopifyArticleId, {
        title,
        bodyHtml: excerpt,
        imageUrl: imageUrl || null,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al actualizar en Shopify";
      withError(`/dashboard/articles/${id}`, message);
    }
  }

  await prisma.article.update({
    where: { id },
    data: { title, excerpt, tweetText, igCaption: igCaption || null, imageUrl: imageUrl || null },
  });

  // Guardar no toca el tuit vivo: X no permite editar un tuit ya publicado,
  // hay que borrarlo y volver a publicarlo (eso pierde likes/RTs y cambia el
  // enlace), asi que es una decision del revisor, no un efecto secundario de
  // pulsar "Guardar". Se avisa para que el cambio no parezca perdido.
  const tweetOutOfSync =
    article!.status === "PUBLISHED" && Boolean(article!.tweetId) && tweetText !== article!.tweetedText;

  revalidatePath(`/dashboard/articles/${id}`);
  redirect(`/dashboard/articles/${id}?saved=1${tweetOutOfSync ? "&tweetStale=1" : ""}`);
}

/**
 * Sincroniza con X el texto editado de un articulo ya publicado. La API de X
 * no expone la edicion de tuits, asi que la unica via es borrar el tuit
 * anterior y publicar uno nuevo: el tuit cambia de id/URL y pierde las
 * interacciones que tuviera. Tambien sirve para publicar el tuit por primera
 * vez cuando el articulo salio en el blog pero X fallo en ese momento.
 */
export async function republishTweetAction(formData: FormData) {
  const id = String(formData.get("id"));
  const returnTo = `/dashboard/articles/${id}`;

  if (!isTwitterConfigured()) {
    withError(returnTo, "X no está configurado (faltan las credenciales TWITTER_*)");
  }

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) withError(returnTo, "Artículo no encontrado");
  if (article!.status !== "PUBLISHED" || !article!.shopifyHandle) {
    withError(returnTo, "El artículo no está publicado todavía");
  }

  // Primero se borra el viejo: si el borrado falla, mejor abortar que dejar
  // dos tuits distintos de la misma noticia conviviendo en el timeline.
  if (article!.tweetId) {
    try {
      await deleteTweet(article!.tweetId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      withError(returnTo, `No se pudo borrar el tuit anterior: ${message}`);
    }
    // El tuit viejo ya no existe: se limpia antes de reintentar publicar para
    // que un fallo a continuacion no deje guardado un id que apunta a nada.
    await prisma.article.update({
      where: { id },
      data: { tweetId: null, tweetedText: null },
    });
  }

  const publicUrl = buildBlogArticleUrl(article!.shopifyHandle!, "twitter");
  const images = [article!.imageUrl, ...(article!.extraImageUrls?.split(",") || [])];

  let tweetId: string;
  try {
    tweetId = await postTweet(article!.tweetText, publicUrl, images, article!.videoUrl);
  } catch (err) {
    const detail =
      err && typeof err === "object" && "data" in err
        ? JSON.stringify((err as { data?: unknown }).data)
        : String(err);
    console.error("Fallo al republicar en X:", detail);
    withError(returnTo, `El tuit anterior se borró, pero el nuevo falló: ${detail}`.slice(0, 400));
  }

  await prisma.article.update({
    where: { id },
    data: { tweetId, tweetedText: article!.tweetText },
  });

  revalidatePath(returnTo);
  redirect(`${returnTo}?notice=${encodeURIComponent("Tuit actualizado en X con el texto nuevo.")}`);
}

/**
 * Repite la busqueda de imagen de respaldo en Openverse pero con terminos
 * mas especificos (el titulo del articulo + un texto de contexto opcional
 * que escriba el revisor, ej. "Hard Rock Stadium Miami England fans"), para
 * los casos en los que la foto generica original no encaje con la noticia.
 * Si el articulo ya esta PUBLICADO, sincroniza la nueva imagen con Shopify.
 */
export async function regenerateImageAction(formData: FormData) {
  const id = String(formData.get("id"));
  const hint = String(formData.get("imageHint") || "").trim();
  const returnTo = `/dashboard/articles/${id}`;

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) withError(returnTo, "Artículo no encontrado");

  const query = [article!.originalTitle, hint].filter(Boolean).join(" ");
  const imageUrl = await searchRelatedImage(query, article!.imageUrl);

  if (!imageUrl) {
    withError(returnTo, "No se encontró ninguna imagen distinta para esa búsqueda");
  }

  if (article!.status === "PUBLISHED" && article!.shopifyArticleId) {
    try {
      await updateArticleOnShopify(article!.shopifyArticleId, { imageUrl });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Error al actualizar la imagen en Shopify";
      withError(returnTo, message);
    }
  }

  await prisma.article.update({ where: { id }, data: { imageUrl } });

  revalidatePath(returnTo);
  redirect(`${returnTo}?saved=1`);
}

export async function approveArticleAction(formData: FormData) {
  const id = String(formData.get("id"));
  const returnTo = String(formData.get("returnTo") || "/dashboard");

  const article = await prisma.article.findUnique({
    where: { id },
    include: { source: true },
  });
  if (!article) withError(returnTo, "Artículo no encontrado");
  if (article!.status === "PUBLISHED") redirect(returnTo);

  // Los fallos de X/Instagram no abortan la publicacion (el blog ya salio),
  // pero si se avisan al final para no dejarlos solo en los logs.
  const warnings: string[] = [];

  // La deteccion de grupos corre al generar el borrador, pero los articulos
  // que ya estaban en cola cuando se anadio un grupo/alias (o los editados a
  // mano) se quedarian sin enlace: se repite aqui sobre el texto final, con
  // cuidado de no enlazar/mencionar dos veces lo que ya viene enlazado.
  let excerpt = article!.excerpt;
  let tweetText = article!.tweetText;
  const groupRows = await prisma.group.findMany({ where: { active: true } });
  const mentionedGroups = findMentionedGroups(`${article!.title} ${excerpt} ${tweetText}`, groupRows.map((g) => ({
    name: g.name,
    aliases: parseAliases(g.aliases),
    handle: g.handle,
  })));
  const toLink = mentionedGroups.filter((g) => !excerpt.includes(`x.com/${g.handle}`));
  if (toLink.length) excerpt = linkMentionedGroups(excerpt, toLink);
  for (const group of mentionedGroups) {
    if (tweetText.toLowerCase().includes(`@${group.handle.toLowerCase()}`)) continue;
    const withMention = `${tweetText} @${group.handle}`;
    // mismo margen que al generar el tuit: 280 menos el hueco del enlace
    if (withMention.length <= 256) tweetText = withMention;
  }

  try {
    const { shopifyArticleId, handle } = await publishArticleToShopify({
      title: article!.title,
      bodyHtml: excerpt,
      tags: article!.tags.split(",").map((t) => t.trim()).filter(Boolean),
      imageUrl: article!.imageUrl,
    });

    const publicUrl = buildBlogArticleUrl(handle, "twitter");

    let tweetId: string | null = null;
    if (isTwitterConfigured()) {
      try {
        const images = [article!.imageUrl, ...(article!.extraImageUrls?.split(",") || [])];
        tweetId = await postTweet(tweetText, publicUrl, images, article!.videoUrl);
      } catch (tweetErr) {
        // La publicación en el blog ya tuvo éxito; no revertimos por un fallo en X.
        // Node trunca objetos anidados (ej. "data: [Object]") en los logs, asi
        // que se vuelca el detalle real de la respuesta de X en texto plano.
        const detail =
          tweetErr && typeof tweetErr === "object" && "data" in tweetErr
            ? JSON.stringify((tweetErr as { data?: unknown }).data)
            : String(tweetErr);
        console.error("Fallo al publicar en X:", detail);
        warnings.push(`X: ${detail}`);
      }
    }

    const publishFacebook = formData.get("publishFacebook") === "on";
    let facebookPostId: string | null = null;
    if (isFacebookConfigured() && publishFacebook) {
      try {
        // En Facebook si tiene sentido el enlace (a diferencia de Instagram),
        // asi que se manda el texto del tuit + la URL del articulo.
        const fbUrl = buildBlogArticleUrl(handle, "facebook");
        facebookPostId = await postToFacebook(article!.tweetText, fbUrl, article!.imageUrl);
      } catch (fbErr) {
        console.error("Fallo al publicar en Facebook:", fbErr);
        warnings.push(`Facebook: ${fbErr instanceof Error ? fbErr.message : String(fbErr)}`);
      }
    }

    // "none" | "post" (foto en el feed) | "reel" (video) | "story"
    const instagramMode = String(formData.get("instagramMode") || "none");
    let instagramMediaId: string | null = null;
    if (isInstagramConfigured() && instagramMode !== "none") {
      try {
        // Pie propio de Instagram si existe (mas largo, con hashtags de nicho
        // y sin @menciones de X, que en IG apuntarian a otra cuenta); si no,
        // el texto del tuit. Con la atribucion de la fuente al final. Las
        // stories no lo usan: ahi la API no admite texto.
        const caption = article!.igCaption?.trim() || tweetText;
        const sourceCredit =
          article!.source.type === "X_ACCOUNT"
            ? `📸 Fuente: @${article!.source.feedUrl} (en X)`
            : `📸 Fuente: ${article!.source.name}`;
        const fullCaption = `${caption}\n\n${sourceCredit}`;

        if (instagramMode === "story") {
          instagramMediaId = await postStoryToInstagram({
            videoUrl: article!.videoUrl,
            imageUrl: article!.imageUrl,
          });
        } else if (instagramMode === "reel" && article!.videoUrl) {
          instagramMediaId = await postReelToInstagram(
            fullCaption,
            article!.videoUrl,
            article!.imageUrl
          );
        } else if (article!.imageUrl) {
          instagramMediaId = await postToInstagram(fullCaption, article!.imageUrl);
        }
      } catch (igErr) {
        // Igual que con X: el blog ya se publico, no revertimos por esto.
        console.error("Fallo al publicar en Instagram:", igErr);
        warnings.push(`Instagram: ${igErr instanceof Error ? igErr.message : String(igErr)}`);
      }
    }

    await prisma.article.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        // se guarda lo publicado de verdad (con los enlaces/menciones anadidos)
        excerpt,
        tweetText,
        shopifyArticleId,
        shopifyHandle: handle,
        tweetId,
        // solo si el tuit salio: si X fallo, queda null y la ficha ofrece
        // publicarlo a posteriori
        tweetedText: tweetId ? tweetText : null,
        instagramMediaId,
        facebookPostId,
        reviewedAt: new Date(),
        publishedAt: new Date(),
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al publicar";
    withError(returnTo, message);
  }

  revalidatePath("/dashboard");
  if (warnings.length) {
    // El redirect de withError lanza, asi que va fuera del try/catch de arriba
    // para no confundirse con un fallo de la publicacion en el blog.
    withError(returnTo, `Publicado en el blog, pero falló: ${warnings.join(" | ")}`.slice(0, 400));
  }
  redirect(returnTo);
}

export async function unpublishArticleAction(formData: FormData) {
  const id = String(formData.get("id"));
  const returnTo = String(formData.get("returnTo") || "/dashboard");

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) withError(returnTo, "Artículo no encontrado");

  try {
    if (article!.shopifyArticleId) {
      await deleteArticleFromShopify(article!.shopifyArticleId);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Error al eliminar de Shopify";
    withError(returnTo, message);
  }

  await prisma.article.update({
    where: { id },
    data: {
      status: "REJECTED",
      shopifyArticleId: null,
      shopifyHandle: null,
      tweetId: null,
      tweetedText: null,
      publishedAt: null,
    },
  });

  revalidatePath("/dashboard");
  redirect(returnTo);
}

export async function rejectArticleAction(formData: FormData) {
  const id = String(formData.get("id"));
  const returnTo = String(formData.get("returnTo") || "/dashboard");

  await prisma.article.update({
    where: { id },
    data: { status: "REJECTED", reviewedAt: new Date() },
  });

  revalidatePath("/dashboard");
  redirect(returnTo);
}

const CLEANUP_BATCH_SIZE = 30;
const CLEANUP_CONCURRENCY = 6;

/**
 * Re-aplica el filtro de relevancia (aficion/ultras, desplazamientos
 * masivos, moda casual) a un lote de noticias PENDIENTES ya existentes de
 * antes de que ese filtro existiera, y rechaza las que no encajen. Procesa
 * como maximo CLEANUP_BATCH_SIZE por click para no acercarse al limite de
 * tiempo de la funcion; si quedan mas, se puede pulsar otra vez.
 */
/**
 * Anade a los articulos ya publicados el cierre con enlace a la tienda (los
 * anteriores acababan en "Fuente:" sin ninguna salida al catalogo) y, de
 * paso, al reenviarlos a Shopify se rellenan summary y el alt de la imagen,
 * que antes iban vacios. Idempotente: salta los que ya tienen el cierre.
 */
export async function backfillPublishedArticlesAction(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/dashboard?status=PUBLISHED");

  const published = await prisma.article.findMany({
    where: { status: "PUBLISHED", shopifyArticleId: { not: null } },
    orderBy: { publishedAt: "desc" },
  });

  let updated = 0;
  let skipped = 0;
  const failures: string[] = [];

  for (const article of published) {
    if (article.excerpt.includes("Return to the Origins")) {
      skipped += 1;
      continue;
    }
    const excerpt = `${article.excerpt}\n${buildCtaHtml(article.category)}`;
    try {
      await updateArticleOnShopify(article.shopifyArticleId!, {
        title: article.title,
        bodyHtml: excerpt,
        imageUrl: article.imageUrl,
      });
      await prisma.article.update({ where: { id: article.id }, data: { excerpt } });
      updated += 1;
    } catch (err) {
      failures.push(`${article.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  revalidatePath("/dashboard");
  const summary =
    `Actualizados ${updated}, ya tenían cierre ${skipped}` +
    (failures.length ? `, fallaron ${failures.length}` : "");
  if (failures.length) {
    console.error("Fallos al añadir el cierre a publicados:", failures.join(" | "));
    withError(returnTo, `${summary}. Detalle en los logs.`);
  }
  redirect(`${returnTo}&notice=${encodeURIComponent(summary)}`);
}

// Cuantos articulos remaquetar por click. Cada uno gasta una llamada a
// Claude, asi que se procesan por tandas para no acercarse al limite de
// tiempo de la funcion; como la accion es idempotente, basta con volver a
// pulsar hasta que no queden.
const RESTRUCTURE_BATCH_SIZE = 8;

/**
 * Remaqueta los articulos ya publicados con la estructura nueva (entradilla,
 * ladillos, cita destacada, galeria y cierre de tienda como bloque), tanto en
 * la base como en Shopify. Los articulos antiguos se generaron como una tira
 * de parrafos y no se guardo el JSON con el que se escribieron, asi que hay
 * que descomponer su HTML y pedirle a Claude que lo agrupe — sin reescribir
 * el texto, solo añadiendo la maquetacion.
 *
 * Idempotente: salta los que ya estan maquetados.
 */
export async function restructurePublishedArticlesAction(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/dashboard?status=PUBLISHED");

  const published = await prisma.article.findMany({
    where: { status: "PUBLISHED", shopifyArticleId: { not: null } },
    orderBy: { publishedAt: "desc" },
    include: { source: true },
  });

  const pending = published.filter((a) => !isRestructured(a.excerpt));
  const batch = pending.slice(0, RESTRUCTURE_BATCH_SIZE);

  // Los grupos de aficion se vuelven a enlazar despues de remaquetar: el
  // texto se reconstruye desde cero y perderia los enlaces que ya tenia.
  const groups = await prisma.group.findMany({ where: { active: true } });
  const knownGroups = groups.map((g) => ({
    name: g.name,
    handle: g.handle,
    aliases: parseAliases(g.aliases),
  }));

  let updated = 0;
  let basic = 0;
  const failures: string[] = [];

  for (const article of batch) {
    const legacy = parseLegacyArticleHtml(article.excerpt);
    if (!legacy.paragraphs.length) {
      failures.push(`${article.title}: no se pudo leer el cuerpo`);
      continue;
    }

    const restructured = await restructureSpanishArticle({
      title: article.title,
      paragraphs: legacy.paragraphs,
    });

    // Sin clave de Claude (o si la llamada falla o pierde parrafos) se
    // maqueta igualmente lo que no necesita criterio: entradilla, galeria y
    // cierre de tienda. Se pierden solo los ladillos y la cita.
    let lead: string;
    let sections: ArticleSection[];
    if (restructured) {
      ({ lead, sections } = restructured);
    } else {
      basic += 1;
      const [first, ...rest] = legacy.paragraphs;
      lead = first;
      sections = [{ heading: null, paragraphs: rest.length ? rest : [first] }];
    }

    const mentionedGroups = findMentionedGroups(
      `${article.originalTitle} ${article.title} ${legacy.paragraphs.join(" ")}`,
      knownGroups
    );

    const excerpt = buildArticleHtml({
      lead,
      sections,
      pullQuote: restructured?.pullQuote ?? null,
      facts: restructured?.facts ?? [],
      galleryImageUrls: legacy.imageUrls,
      sourceName: legacy.sourceName ?? article.source?.name ?? "la fuente original",
      sourceUrl: legacy.sourceUrl ?? article.originalUrl,
      rotationKey: article.guid,
      decorate: (html) => linkMentionedGroups(html, mentionedGroups),
    });

    try {
      await updateArticleOnShopify(article.shopifyArticleId!, {
        title: article.title,
        bodyHtml: excerpt,
        imageUrl: article.imageUrl,
      });
      await prisma.article.update({ where: { id: article.id }, data: { excerpt } });
      updated += 1;
    } catch (err) {
      failures.push(`${article.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  revalidatePath("/dashboard");
  const left = pending.length - updated;
  const summary =
    `Remaquetados ${updated}` +
    (basic ? ` (${basic} sin ladillos, ver logs)` : "") +
    (left > 0 ? `, quedan ${left}: vuelve a pulsar` : ", no queda ninguno") +
    (failures.length ? `, fallaron ${failures.length}` : "");
  if (failures.length) {
    console.error("Fallos al remaquetar publicados:", failures.join(" | "));
    withError(returnTo, `${summary}. Detalle en los logs.`);
  }
  redirect(`${returnTo}&notice=${encodeURIComponent(summary)}`);
}

/**
 * Rastrea las fuentes al momento y deja lo nuevo en la cola de revision. Es
 * el sustituto del cron: antes esto corria solo cada tres horas, llenando la
 * cola tanto si habia alguien para revisarla como si no. Ahora se pide
 * cuando se va a mirar, que es lo que de verdad ahorra (sobre todo si hay
 * fuentes de tipo "Cuenta de X", que se leen por API de pago).
 */
export async function fetchNowAction(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/dashboard?status=PENDING");

  let result;
  try {
    result = await runAggregation();
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fallo al rastrear las fuentes:", err);
    withError(returnTo, `No se pudo completar el rastreo: ${message}`);
  }

  const failed = result.results.filter((r) => r.error);
  const notice =
    (result.createdTotal === 0
      ? `Rastreo terminado: ninguna noticia nueva (${result.sourcesProcessed} fuentes)`
      : `Rastreo terminado: ${result.createdTotal} noticia(s) nueva(s) de ${result.sourcesProcessed} fuentes`) +
    (failed.length ? `, ${failed.length} fuente(s) fallaron (ver logs)` : "");
  if (failed.length) {
    console.error(
      "Fuentes con error en el rastreo:",
      failed.map((r) => `${r.source}: ${r.error}`).join(" | ")
    );
  }

  revalidatePath("/dashboard");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}notice=${encodeURIComponent(notice)}`);
}

// Cada titular puede costar una llamada a Claude (solo los que no arregla la
// limpieza automatica), asi que tambien va por tandas: se pulsa hasta que no
// queden.
const FIX_TITLES_BATCH_SIZE = 12;

/**
 * Repasa los titulares ya guardados que caen en el tic del "cuando" o se
 * pasan de largo. Primero la limpieza automatica; si aun asi no cumplen, se
 * reescriben con Claude pasandole el texto del articulo, que es de donde sale
 * lo que al titular le falta (el "con Ranieri" del ejemplo).
 *
 * En los publicados el titular se cambia tambien en Shopify. El handle no se
 * toca, asi que los enlaces que ya esten por ahi siguen funcionando. El tuit
 * se reescribe solo si todavia no se ha publicado (X no deja editar un tuit
 * vivo, eso es decision del revisor).
 *
 * Idempotente: salta los que ya cumplen. Lo que no puede detectar es el
 * titular corto pero vago — para eso esta la edicion a mano.
 */
export async function fixTitlesAction(formData: FormData) {
  const status = String(formData.get("status") || "PUBLISHED") as ArticleStatus;
  const returnTo = String(formData.get("returnTo") || `/dashboard?status=${status}`);

  const articles = await prisma.article.findMany({
    where: { status },
    orderBy: { createdAt: "desc" },
  });

  const pending = articles.filter((a) => needsBetterTitle(a.title));
  const batch = pending.slice(0, FIX_TITLES_BATCH_SIZE);

  let updated = 0;
  let stubborn = 0;
  const failures: string[] = [];

  for (const article of batch) {
    let title = normalizeTitle(article.title);
    if (needsBetterTitle(title)) {
      // El cuerpo es lo que permite concretar el titular, asi que se le pasa
      // en plano y recortado: con la entradilla y el arranque basta.
      const context = article.excerpt
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim()
        .slice(0, 900);
      title = (await improveSpanishTitle({ title, context })) ?? title;
    }
    if (title === article.title) {
      stubborn += 1;
      continue;
    }
    if (needsBetterTitle(title)) stubborn += 1;

    // El tuit lleva el titular delante; mientras no este publicado, se
    // actualiza para que no se quede con el viejo.
    const tweetText =
      article.tweetId || !article.tweetText.startsWith(article.title)
        ? article.tweetText
        : title + article.tweetText.slice(article.title.length);

    try {
      if (article.status === "PUBLISHED" && article.shopifyArticleId) {
        await updateArticleOnShopify(article.shopifyArticleId, { title });
      }
      await prisma.article.update({
        where: { id: article.id },
        data: { title, tweetText },
      });
      updated += 1;
    } catch (err) {
      failures.push(`${article.title}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  revalidatePath("/dashboard");
  const left = pending.length - batch.length;
  const summary =
    (pending.length === 0
      ? "No había titulares que arreglar"
      : `Titulares arreglados: ${updated}`) +
    (stubborn ? ` (${stubborn} no han mejorado, revísalos a mano)` : "") +
    (left > 0 ? `, quedan ${left} por revisar: vuelve a pulsar` : "") +
    (failures.length ? `, fallaron ${failures.length}` : "");
  if (failures.length) {
    console.error("Fallos al arreglar titulares:", failures.join(" | "));
    withError(returnTo, `${summary}. Detalle en los logs.`);
  }
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}notice=${encodeURIComponent(summary)}`);
}

export async function cleanupOffTopicAction(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/dashboard?status=PENDING");

  // Las noticias escritas a mano no pasan por el filtro de tema: si alguien
  // se ha sentado a escribirla, ya ha decidido que encaja. El filtro esta
  // para lo que llega solo de las fuentes.
  const pending = await prisma.article.findMany({
    where: { status: "PENDING", NOT: { guid: { startsWith: MANUAL_GUID_PREFIX } } },
    orderBy: { createdAt: "asc" },
    take: CLEANUP_BATCH_SIZE,
  });

  let rejected = 0;
  let kept = 0;
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < pending.length) {
      const article = pending[nextIndex++];
      const snippet = article.excerpt
        .replace(/<[^>]+>/g, " ")
        .replace(/\s+/g, " ")
        .trim();

      const translated = await translateToSpanish({
        originalTitle: article.originalTitle,
        snippet,
        category: article.category,
      });

      if (!translated) {
        await prisma.article.update({
          where: { id: article.id },
          data: { status: "REJECTED", reviewedAt: new Date() },
        });
        rejected += 1;
      } else {
        kept += 1;
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(CLEANUP_CONCURRENCY, pending.length) }, () => worker())
  );

  const remaining = await prisma.article.count({ where: { status: "PENDING" } });
  const notice =
    pending.length === 0
      ? "No había pendientes que revisar."
      : `Limpieza: ${rejected} rechazadas por no encajar, ${kept} mantenidas. Quedan ${remaining} pendientes` +
        (remaining > 0 ? " (pulsa otra vez para seguir limpiando)." : ".");

  revalidatePath("/dashboard");
  const separator = returnTo.includes("?") ? "&" : "?";
  redirect(`${returnTo}${separator}notice=${encodeURIComponent(notice)}`);
}

export async function addSourceAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const type = String(formData.get("type") || SourceType.RSS) as SourceType;
  const category = String(formData.get("category") || "") as Category;
  let feedUrl = String(formData.get("feedUrl") || "").trim();

  if (!name || !feedUrl || !Object.values(Category).includes(category)) {
    withError("/dashboard/sources", "Rellena nombre, URL/cuenta y categoría");
  }
  if (!Object.values(SourceType).includes(type)) {
    withError("/dashboard/sources", "Tipo de fuente no válido");
  }

  if (type === SourceType.X_ACCOUNT) {
    feedUrl = normalizeHandle(feedUrl);
    if (!isValidHandle(feedUrl)) {
      withError("/dashboard/sources", "El @handle de X no es válido (solo letras, números y _)");
    }
  } else if (!isHttpUrl(feedUrl)) {
    // Sin esto, un @handle guardado como RSS acaba en una peticion a
    // localhost ("ECONNREFUSED 127.0.0.1:80") y la fuente no lee nada.
    withError(
      "/dashboard/sources",
      "Para un feed RSS hace falta una URL completa (http://...). Si querías seguir una cuenta de X, elige el tipo \"Cuenta de X (Twitter)\"."
    );
  }

  const existing = await prisma.source.findUnique({ where: { feedUrl } });
  if (existing) {
    withError("/dashboard/sources", `Esa fuente ya existe: "${existing.name}"`);
  }

  await prisma.source.create({ data: { name, feedUrl, category, type } });
  revalidatePath("/dashboard/sources");
  redirect("/dashboard/sources");
}

export async function toggleSourceAction(formData: FormData) {
  const id = String(formData.get("id"));
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) withError("/dashboard/sources", "Fuente no encontrada");

  await prisma.source.update({
    where: { id },
    data: { active: !source!.active },
  });
  revalidatePath("/dashboard/sources");
  redirect("/dashboard/sources");
}

/**
 * Cambia una fuente de RSS a cuenta de X (o al contrario) sin perder su
 * historial de articulos. Sirve para arreglar fuentes creadas con el tipo
 * equivocado, ej. un @handle guardado como si fuera un feed RSS.
 */
export async function switchSourceTypeAction(formData: FormData) {
  const id = String(formData.get("id"));
  const source = await prisma.source.findUnique({ where: { id } });
  if (!source) withError("/dashboard/sources", "Fuente no encontrada");

  const toXAccount = source!.type === SourceType.RSS;
  if (!toXAccount) {
    withError(
      "/dashboard/sources",
      "Para convertirla en fuente RSS hace falta la URL del feed: pausa esta y añádela de nuevo."
    );
  }

  const handle = normalizeHandle(source!.feedUrl);
  if (!isValidHandle(handle)) {
    withError(
      "/dashboard/sources",
      `"${source!.feedUrl}" no parece un @handle de X válido, así que no se puede convertir.`
    );
  }

  const clash = await prisma.source.findUnique({ where: { feedUrl: handle } });
  if (clash && clash.id !== id) {
    withError("/dashboard/sources", `Ya existe otra fuente con el handle @${handle}: "${clash.name}"`);
  }

  await prisma.source.update({
    where: { id },
    data: {
      type: SourceType.X_ACCOUNT,
      feedUrl: handle,
      // Se reinician los cursores cacheados: pertenecian a la lectura
      // anterior y ya no valen para la cuenta recien resuelta.
      externalId: null,
      lastFetchedId: null,
    },
  });
  revalidatePath("/dashboard/sources");
  redirect("/dashboard/sources");
}

function normalizeHandle(raw: string): string {
  return raw.replace(/^@/, "").replace(/^https?:\/\/(x|twitter)\.com\//i, "").trim();
}

function isValidHandle(value: string): boolean {
  return /^\w{1,15}$/.test(value);
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:";
  } catch {
    return false;
  }
}

export async function addGroupAction(formData: FormData) {
  const name = String(formData.get("name") || "").trim();
  const aliases = String(formData.get("aliases") || "").trim();
  const handle = normalizeHandle(String(formData.get("handle") || ""));

  if (!name || !handle) {
    withError("/dashboard/groups", "Rellena el nombre del grupo y su @handle de X");
  }
  if (!/^\w{1,15}$/.test(handle)) {
    withError("/dashboard/groups", "El @handle de X no es válido (solo letras, números y _)");
  }

  await prisma.group.create({ data: { name, aliases: aliases || null, handle } });
  revalidatePath("/dashboard/groups");
  redirect("/dashboard/groups");
}

export async function toggleGroupAction(formData: FormData) {
  const id = String(formData.get("id"));
  const group = await prisma.group.findUnique({ where: { id } });
  if (!group) withError("/dashboard/groups", "Grupo no encontrado");

  await prisma.group.update({
    where: { id },
    data: { active: !group!.active },
  });
  revalidatePath("/dashboard/groups");
  redirect("/dashboard/groups");
}

// Tope de la foto que se sube desde el formulario manual. Manda el limite de
// Vercel: el cuerpo de una peticion a una funcion no puede pasar de 4,5 MB,
// y ese corte lo hace la plataforma antes de que llegue nuestro codigo (el
// usuario veria un 413 opaco). Asi que el tope real es algo por debajo, para
// que quien avise sea nuestro mensaje. Va de la mano del bodySizeLimit de
// las Server Actions en next.config.mjs.
const MAX_MANUAL_IMAGE_BYTES = 4 * 1024 * 1024;

const MANUAL_TWEET_CHARS = 280 - 24; // el mismo hueco para el enlace que deja el rastreo

/**
 * Parte el texto escrito a mano en parrafos. Se aceptan las dos formas de
 * separarlos que sale natural teclear (linea en blanco o simple salto de
 * linea) porque quien escribe no tiene por que saber cual espera el sistema.
 */
function splitManualParagraphs(body: string): string[] {
  const byBlankLine = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
  if (byBlankLine.length > 1) return byBlankLine;

  return body
    .split(/\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean);
}

/**
 * Crea una noticia escrita a mano en el panel y la deja en la cola de
 * revision (PENDING), igual que si la hubiera traido el rastreo: desde ahi se
 * edita, se le busca otra foto y se aprueba con los mismos botones. No se
 * publica de golpe a proposito, para que la noticia propia pase por la misma
 * pantalla de repaso que las de fuera.
 *
 * El texto NO se reescribe: Claude solo lo maqueta (entradilla, ladillos,
 * cita y ficha) conservando los parrafos palabra por palabra, y si no hay
 * clave de API se maqueta en basico. Lo que se publica es lo que se escribio.
 */
export async function createManualArticleAction(formData: FormData) {
  const returnTo = "/dashboard/nueva";

  const title = String(formData.get("title") || "").trim();
  const body = String(formData.get("body") || "").trim();
  const category = String(formData.get("category") || "") as Category;
  const sourceUrl = String(formData.get("sourceUrl") || "").trim();
  const customTweet = String(formData.get("tweetText") || "").trim();
  const igCaption = String(formData.get("igCaption") || "").trim();
  let imageUrl = String(formData.get("imageUrl") || "").trim();

  if (!title || !body) {
    withError(returnTo, "El titular y el texto de la noticia son obligatorios");
  }
  if (!Object.values(Category).includes(category)) {
    withError(returnTo, "Elige una categoría válida");
  }
  if (sourceUrl && !isHttpUrl(sourceUrl)) {
    withError(returnTo, "El enlace a la fuente tiene que ser una URL completa (https://...)");
  }
  if (imageUrl && !isHttpUrl(imageUrl)) {
    withError(returnTo, "La URL de la foto tiene que ser completa (https://...)");
  }

  const paragraphs = splitManualParagraphs(body);
  if (!paragraphs.length) {
    withError(returnTo, "El texto de la noticia está vacío");
  }

  // La foto subida desde el ordenador manda sobre la URL: si se rellenan las
  // dos, lo que se acaba de elegir en el disco es lo que se queria.
  const photo = formData.get("photo");
  if (photo instanceof File && photo.size > 0) {
    if (!photo.type.startsWith("image/")) {
      withError(returnTo, `"${photo.name}" no es una imagen`);
    }
    if (photo.size > MAX_MANUAL_IMAGE_BYTES) {
      withError(
        returnTo,
        `La foto pesa ${(photo.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${
          MAX_MANUAL_IMAGE_BYTES / 1024 / 1024
        } MB. Redúcela o pega su URL.`
      );
    }
    if (!isShopifyConfigured()) {
      withError(
        returnTo,
        "Para subir una foto desde el ordenador hacen falta las credenciales de Shopify (SHOPIFY_*). Mientras tanto, pega la URL de una foto."
      );
    }

    // Se guarda en los Archivos de Shopify porque el panel corre en
    // serverless (sin disco donde dejarla) y Shopify solo acepta la imagen
    // del articulo por URL publica.
    let uploaded: string | null;
    try {
      uploaded = await uploadImageToShopifyFiles({
        bytes: await photo.arrayBuffer(),
        filename: photo.name || "foto.jpg",
        mimeType: photo.type,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error("Fallo al subir la foto de una noticia manual:", message);
      withError(returnTo, `No se pudo subir la foto: ${message}`.slice(0, 400));
    }

    if (!uploaded) {
      withError(
        returnTo,
        "Shopify aceptó la foto pero todavía la está procesando. Espera un momento y añádela desde el artículo."
      );
    }
    imageUrl = uploaded;
  }

  const groups = await prisma.group.findMany({ where: { active: true } });
  const knownGroups = groups.map((g) => ({
    name: g.name,
    handle: g.handle,
    aliases: parseAliases(g.aliases),
  }));
  const mentionedGroups = findMentionedGroups(`${title} ${paragraphs.join(" ")}`, knownGroups);

  const restructured = await restructureSpanishArticle({ title, paragraphs });
  let lead: string;
  let sections: ArticleSection[];
  if (restructured) {
    ({ lead, sections } = restructured);
  } else {
    const [first, ...rest] = paragraphs;
    lead = first;
    sections = rest.length ? [{ heading: null, paragraphs: rest }] : [];
  }

  const source = await getManualSource();
  const guid = `${MANUAL_GUID_PREFIX}${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const excerpt = buildArticleHtml({
    lead,
    sections,
    pullQuote: restructured?.pullQuote ?? null,
    facts: restructured?.facts ?? [],
    sourceName: sourceUrl ? new URL(sourceUrl).hostname.replace(/^www\./, "") : MANUAL_SOURCE_NAME,
    // Sin enlace de origen no se pinta la linea "Fuente:": la noticia es
    // nuestra, no hay a quien enlazar.
    sourceUrl: sourceUrl || null,
    rotationKey: guid,
    decorate: (html) => linkMentionedGroups(html, mentionedGroups),
  });

  const mentions = mentionedGroups.map((g) => `@${g.handle}`).join(" ");
  const secondLine = [mentions, CATEGORY_HASHTAGS[category].join(" ")].filter(Boolean).join(" ");
  const rawTweet = customTweet || `${title}\n\n${secondLine}`;
  const tweetText =
    rawTweet.length > MANUAL_TWEET_CHARS
      ? rawTweet.slice(0, MANUAL_TWEET_CHARS - 1).trimEnd() + "…"
      : rawTweet;

  const article = await prisma.article.create({
    data: {
      sourceId: source.id,
      category,
      guid,
      // Vacio cuando la noticia es propia: las pantallas de revision solo
      // enseñan el boton "Fuente original" si hay algo a lo que ir.
      originalUrl: sourceUrl,
      originalTitle: title,
      title,
      excerpt,
      tweetText,
      igCaption: igCaption || null,
      imageUrl: imageUrl || null,
      tags: [category, "manual"].join(","),
    },
  });

  revalidatePath("/dashboard");
  redirect(
    `/dashboard/articles/${article.id}?notice=${encodeURIComponent(
      "Noticia creada y guardada en pendientes. Repásala y pulsa «Aprobar y publicar»."
    )}`
  );
}
