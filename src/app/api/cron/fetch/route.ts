import { NextResponse } from "next/server";
import { runAggregation } from "@/lib/aggregate";

export const dynamic = "force-dynamic";
// El plan Hobby normalmente limita a 60s, pero con Fluid Compute algunos
// proyectos permiten mas: se pide 280s (por debajo del limite duro de 300s
// de Pro) y si Vercel lo recorta a 60 no pasa nada, el codigo ya esta
// pensado para funcionar tambien dentro de ese margen mas estricto.
export const maxDuration = 280;

function isAuthorized(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const header = request.headers.get("authorization") || "";
  return header === `Bearer ${secret}`;
}

/**
 * Rastreo por HTTP. Ya no lo llama nadie cada tres horas: el rastreo se
 * dispara a mano desde el dashboard ("Buscar noticias ahora"). Este endpoint
 * se mantiene para lanzarlo desde fuera — el workflow de GitHub, que ahora
 * solo corre cuando se pulsa "Run workflow", o un curl.
 */
export async function GET(request: Request) {
  if (!isAuthorized(request)) {
    return NextResponse.json({ error: "No autorizado" }, { status: 401 });
  }

  return NextResponse.json(await runAggregation());
}
