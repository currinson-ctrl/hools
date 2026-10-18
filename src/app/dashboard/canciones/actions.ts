"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/db";
import { composeSongAudio, generateSongLyrics, isMusicConfigured, type SongSection } from "@/lib/songs";

const PAGE = "/dashboard/canciones";

function back(params: { notice?: string; error?: string; id?: string }): never {
  const query = new URLSearchParams();
  if (params.notice) query.set("notice", params.notice);
  if (params.error) query.set("error", params.error);
  redirect(`${PAGE}?${query.toString()}${params.id ? `#song-${params.id}` : ""}`);
}

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error ? err.message : fallback;
}

/**
 * Genera la musica de una cancion ya guardada y deja el resultado (el MP3 o
 * el motivo del fallo) en la base. No lanza: el fallo de la musica no debe
 * perder la letra.
 */
async function composeAndStore(id: string): Promise<string | null> {
  const song = await prisma.song.findUnique({
    where: { id },
    select: { sections: true, styles: true },
  });
  if (!song) return "Canción no encontrada";

  try {
    const audio = await composeSongAudio({
      sections: song.sections as unknown as SongSection[],
      styles: song.styles ? song.styles.split(",").map((s) => s.trim()).filter(Boolean) : [],
    });
    await prisma.song.update({
      where: { id },
      data: { audio, hasAudio: true, audioError: null },
    });
    return null;
  } catch (err) {
    const message = errorMessage(err, "Error al generar la música");
    await prisma.song.update({ where: { id }, data: { audioError: message } });
    return message;
  }
}

export async function createSongAction(formData: FormData) {
  const topic = String(formData.get("topic") || "").trim();
  const withAudio = formData.get("withAudio") === "on" && isMusicConfigured();

  const previous = await prisma.song.findMany({
    select: { title: true },
    orderBy: { createdAt: "desc" },
    take: 40,
  });

  let id: string;
  try {
    const song = await generateSongLyrics({
      topic,
      previousTitles: previous.map((p) => p.title),
    });
    const created = await prisma.song.create({
      data: {
        topic: song.topic,
        title: song.title,
        sections: song.sections as unknown as object,
        styles: song.styles.join(", "),
        youtubeTitle: song.youtubeTitle,
        youtubeDescription: song.youtubeDescription,
      },
      select: { id: true },
    });
    id = created.id;
  } catch (err) {
    back({ error: errorMessage(err, "No se ha podido escribir la canción") });
  }

  let audioError: string | null = null;
  if (withAudio) audioError = await composeAndStore(id);

  revalidatePath(PAGE);
  if (audioError) {
    back({ id, error: `La letra está lista, pero la música ha fallado: ${audioError}` });
  }
  back({ id, notice: withAudio ? "Canción lista, con música." : "Letra lista." });
}

export async function composeSongAudioAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (!id) back({ error: "Falta la canción" });
  if (!isMusicConfigured()) back({ id, error: "Falta ELEVENLABS_API_KEY para generar la música" });

  const audioError = await composeAndStore(id);
  revalidatePath(PAGE);
  if (audioError) back({ id, error: `La música ha fallado: ${audioError}` });
  back({ id, notice: "Música generada." });
}

export async function deleteSongAction(formData: FormData) {
  const id = String(formData.get("id") || "");
  if (id) await prisma.song.delete({ where: { id } }).catch(() => null);
  revalidatePath(PAGE);
  back({ notice: "Canción borrada." });
}
