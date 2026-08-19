import { NextResponse } from "next/server";
import { createShopifyFile, getUploadedFile } from "@/lib/shopify";
import { hasDashboardSession } from "@/lib/session";
import { isUploadKind } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Segundo paso: el navegador ya ha subido el archivo al destino firmado, y
 * aqui se registra en los Archivos de la tienda. Shopify lo procesa en
 * segundo plano (una foto tarda segundos; un video, minutos), asi que se
 * devuelve el id y, si ya estuviera listo, tambien la URL: el navegador
 * sigue preguntando por /api/uploads/status hasta que lo este.
 */
export async function POST(request: Request) {
  if (!(await hasDashboardSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const body = (await request.json()) as {
    resourceUrl?: string;
    filename?: string;
    kind?: string;
  };

  if (!isUploadKind(body.kind) || !body.resourceUrl) {
    return NextResponse.json({ error: "Faltan datos de la subida" }, { status: 400 });
  }

  try {
    const fileId = await createShopifyFile({
      resourceUrl: body.resourceUrl,
      filename: (body.filename || "").trim() || "archivo",
      kind: body.kind,
    });
    const file = await getUploadedFile(fileId);
    return NextResponse.json({ fileId, ...file });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fallo al registrar el archivo en Shopify:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
