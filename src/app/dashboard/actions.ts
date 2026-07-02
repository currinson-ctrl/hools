"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { publishArticleToShopify } from "@/lib/shopify";
import { isTwitterConfigured, postTweet } from "@/lib/twitter";
import { Category } from "@prisma/client";

function withError(basePath: string, message: string): never {
  redirect(`${basePath}?error=${encodeURIComponent(message)}`);
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
