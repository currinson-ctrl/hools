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
import { isInstagramConfigured, postToInstagram } from "@/lib/instagram";
import { translateToSpanish } from "@/lib/translate";
import { searchRelatedImage } from "@/lib/image-search";
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
    data: { title, excerpt, tweetText, imageUrl: imageUrl || null },
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

  const article = await prisma.article.findUnique({ where: { id } });
  if (!article) withError(returnTo, "Artículo no encontrado");
  if (article!.status === "PUBLISHED") redirect(returnTo);

  try {
    const { shopifyArticleId, handle } = await publishArticleToShopify({
      title: article!.title,
      bodyHtml: article!.excerpt,
      tags: article!.tags.split(",").map((t) => t.trim()).filter(Boolean),
      imageUrl: article!.imageUrl,
    });

    const blogHandle = process.env.SHOPIFY_BLOG_HANDLE || "";
    const publicDomain = process.env.SHOPIFY_PUBLIC_DOMAIN || "";
    const publicUrl = `https://${publicDomain}/blogs/${blogHandle}/${handle}`;

    let tweetId: string | null = null;
    if (isTwitterConfigured()) {
      try {
        const images = [article!.imageUrl, ...(article!.extraImageUrls?.split(",") || [])];
        tweetId = await postTweet(article!.tweetText, publicUrl, images);
      } catch (tweetErr) {
        // La publicación en el blog ya tuvo éxito; no revertimos por un fallo en X.
        // Node trunca objetos anidados (ej. "data: [Object]") en los logs, asi
        // que se vuelca el detalle real de la respuesta de X en texto plano.
        const detail =
          tweetErr && typeof tweetErr === "object" && "data" in tweetErr
            ? JSON.stringify((tweetErr as { data?: unknown }).data)
            : String(tweetErr);
        console.error("Fallo al publicar en X:", detail);
      }
    }

    const publishInstagram = formData.get("publishInstagram") === "on";
    let instagramMediaId: string | null = null;
    if (isInstagramConfigured() && article!.imageUrl && publishInstagram) {
      try {
        instagramMediaId = await postToInstagram(article!.tweetText, article!.imageUrl);
      } catch (igErr) {
        // Igual que con X: el blog ya se publico, no revertimos por esto.
        console.error("Fallo al publicar en Instagram:", igErr);
      }
    }

    await prisma.article.update({
      where: { id },
      data: {
        status: "PUBLISHED",
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
