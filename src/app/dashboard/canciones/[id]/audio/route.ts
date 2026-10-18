import { prisma } from "@/lib/db";

// Protegida por el middleware (cuelga de /dashboard), igual que el resto del panel.
export const dynamic = "force-dynamic";

function fileName(title: string): string {
  const slug = title
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  return `${slug || "cancion"}.mp3`;
}

/**
 * Sirve el MP3 de una cancion. Atiende peticiones parciales (Range) porque
 * Safari, en el iPhone sobre todo, no reproduce un <audio> si no puede pedir
 * el fichero por trozos.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const song = await prisma.song.findUnique({ where: { id }, select: { audio: true, title: true } });
  if (!song?.audio) return new Response("Esta canción aún no tiene música", { status: 404 });

  const audio = new Uint8Array(song.audio);
  const total = audio.byteLength;
  const download = new URL(request.url).searchParams.has("download");
  const headers: Record<string, string> = {
    "Content-Type": "audio/mpeg",
    "Accept-Ranges": "bytes",
    "Cache-Control": "private, max-age=3600",
    "Content-Disposition": `${download ? "attachment" : "inline"}; filename="${fileName(song.title)}"`,
  };

  const range = request.headers.get("range")?.match(/^bytes=(\d*)-(\d*)$/);
  if (range && (range[1] || range[2])) {
    // "bytes=-500" son los ultimos 500 bytes; "bytes=100-" desde el 100 al final.
    const start = range[1] ? Number(range[1]) : Math.max(0, total - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), total - 1) : total - 1;
    if (start >= total || start > end) {
      return new Response(null, { status: 416, headers: { "Content-Range": `bytes */${total}` } });
    }
    return new Response(audio.slice(start, end + 1), {
      status: 206,
      headers: {
        ...headers,
        "Content-Range": `bytes ${start}-${end}/${total}`,
        "Content-Length": String(end - start + 1),
      },
    });
  }

  return new Response(audio, { headers: { ...headers, "Content-Length": String(total) } });
}
