import { NextResponse } from "next/server";
import { createStagedUpload, isShopifyConfigured } from "@/lib/shopify";
import { hasDashboardSession } from "@/lib/session";
import { isUploadKind, UPLOAD_LIMITS } from "@/lib/uploads";

export const dynamic = "force-dynamic";

/**
 * Primer paso de la subida: firma un destino en Shopify para el archivo que
 * el navegador esta a punto de subir. El archivo no pasa por aqui — solo su
 * nombre, tipo y tamaño — porque una funcion de Vercel no admite cuerpos de
 * mas de 4,5 MB y un video pesa mucho mas.
 */
export async function POST(request: Request) {
  if (!(await hasDashboardSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }
  if (!isShopifyConfigured()) {
    return NextResponse.json(
      { error: "Faltan las credenciales de Shopify (SHOPIFY_*)" },
      { status: 400 }
    );
  }

  const body = (await request.json()) as {
    filename?: string;
    mimeType?: string;
    size?: number;
    kind?: string;
  };

  if (!isUploadKind(body.kind)) {
    return NextResponse.json({ error: "Tipo de subida no válido" }, { status: 400 });
  }
  const limits = UPLOAD_LIMITS[body.kind];

  const filename = (body.filename || "").trim();
  const mimeType = (body.mimeType || "").trim();
  const size = Number(body.size);

  if (!filename || !Number.isFinite(size) || size <= 0) {
    return NextResponse.json({ error: "Faltan datos del archivo" }, { status: 400 });
  }
  if (!limits.mimeTypes.includes(mimeType)) {
    return NextResponse.json(
      { error: `Formato no admitido. Usa ${limits.label}.` },
      { status: 400 }
    );
  }
  if (size > limits.maxBytes) {
    return NextResponse.json(
      {
        error: `El archivo pesa ${(size / 1024 / 1024).toFixed(1)} MB y el máximo son ${
          limits.maxBytes / 1024 / 1024
        } MB.`,
      },
      { status: 400 }
    );
  }

  try {
    const target = await createStagedUpload({ filename, mimeType, fileSize: size, kind: body.kind });
    return NextResponse.json(target);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fallo al firmar la subida en Shopify:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
