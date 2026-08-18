import { NextResponse } from "next/server";
import { getUploadedFile } from "@/lib/shopify";
import { hasDashboardSession } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Tercer paso: ¿ya ha terminado Shopify de procesar el archivo? El navegador
 * pregunta cada pocos segundos. Se sondea desde el navegador y no desde el
 * servidor para no tener una funcion esperando (y consumiendo tiempo de
 * ejecucion) mientras Shopify transcodifica un video.
 */
export async function GET(request: Request) {
  if (!(await hasDashboardSession())) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  const fileId = new URL(request.url).searchParams.get("fileId");
  if (!fileId) {
    return NextResponse.json({ error: "Falta el identificador del archivo" }, { status: 400 });
  }

  try {
    return NextResponse.json(await getUploadedFile(fileId));
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Fallo al consultar el archivo en Shopify:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
