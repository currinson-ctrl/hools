"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { deleteArticleFromShopify, publishArticleToShopify } from "@/lib/shopify";
import { isTwitterConfigured, postTweet } from "@/lib/twitter";
import { translateToSpanish } from "@/lib/translate";
import { Category } from "@prisma/client";

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

  await prisma.article.update({
    where: { id },
    data: { title, excerpt, tweetText, imageUrl: imageUrl || null },
  });

  revalidatePath(`/dashboard/articles/${id}`);
  redirect(`/dashboard/articles/${id}?saved=1`);
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
        tweetId = await postTweet(article!.tweetText, publicUrl);
      } catch (tweetErr) {
        // La publicación en el blog ya tuvo éxito; no revertimos por un fallo en X.
        console.error("Fallo al publicar en X:", tweetErr);
      }
    }

    await prisma.article.update({
      where: { id },
      data: {
        status: "PUBLISHED",
        shopifyArticleId,
        shopifyHandle: handle,
        tweetId,
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
  const feedUrl = String(formData.get("feedUrl") || "").trim();
  const category = String(formData.get("category") || "") as Category;

  if (!name || !feedUrl || !Object.values(Category).includes(category)) {
    withError("/dashboard/sources", "Rellena nombre, URL del feed y categoría");
  }

  await prisma.source.create({ data: { name, feedUrl, category } });
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
