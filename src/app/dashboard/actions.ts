"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import {
  deleteArticleFromShopify,
  publishArticleToShopify,
  updateArticleOnShopify,
} from "@/lib/shopify";
import { isTwitterConfigured, postTweet } from "@/lib/twitter";
import { isInstagramConfigured, postStoryToInstagram, postToInstagram } from "@/lib/instagram";
import { translateToSpanish } from "@/lib/translate";
import { searchRelatedImage } from "@/lib/image-search";
import { findMentionedGroups, linkMentionedGroups, parseAliases } from "@/lib/groups";
import { Category, SourceType } from "@prisma/client";

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

  revalidatePath(`/dashboard/articles/${id}`);
  redirect(`/dashboard/articles/${id}?saved=1`);
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

    const blogHandle = process.env.SHOPIFY_BLOG_HANDLE || "";
    const publicDomain = process.env.SHOPIFY_PUBLIC_DOMAIN || "";
    const articleUrl = `https://${publicDomain}/blogs/${blogHandle}/${handle}`;
    // Etiquetado para poder ver en Shopify Analytics que trae cada canal.
    const publicUrl = `${articleUrl}?utm_source=twitter&utm_medium=social&utm_campaign=away-end`;

    let tweetId: string | null = null;
    if (isTwitterConfigured()) {
      try {
        const images = [article!.imageUrl, ...(article!.extraImageUrls?.split(",") || [])];
        tweetId = await postTweet(tweetText, publicUrl, images);
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

    // "none" | "post" (publicacion de foto en el feed) | "story"
    const instagramMode = String(formData.get("instagramMode") || "none");
    let instagramMediaId: string | null = null;
    if (isInstagramConfigured() && instagramMode !== "none") {
      try {
        if (instagramMode === "story") {
          instagramMediaId = await postStoryToInstagram({
            videoUrl: article!.videoUrl,
            imageUrl: article!.imageUrl,
          });
        } else if (article!.imageUrl) {
          // Pie propio de Instagram si existe (mas largo, con hashtags de
          // nicho y sin @menciones de X, que en IG apuntarian a otra cuenta);
          // si no, el texto del tuit. Y la atribucion de la fuente al final
          // (en stories la API no admite texto, ahi no se puede).
          const caption = article!.igCaption?.trim() || tweetText;
          const sourceCredit =
            article!.source.type === "X_ACCOUNT"
              ? `📸 Fuente: @${article!.source.feedUrl} (en X)`
              : `📸 Fuente: ${article!.source.name}`;
          instagramMediaId = await postToInstagram(
            `${caption}\n\n${sourceCredit}`,
            article!.imageUrl
          );
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
        instagramMediaId,
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
export async function cleanupOffTopicAction(formData: FormData) {
  const returnTo = String(formData.get("returnTo") || "/dashboard?status=PENDING");

  const pending = await prisma.article.findMany({
    where: { status: "PENDING" },
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
