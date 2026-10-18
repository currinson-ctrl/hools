import { prisma } from "@/lib/db";
import { BASE_STYLES, isMusicConfigured, lyricsAsText, stylePrompt, type SongSection } from "@/lib/songs";
import { composeSongAudioAction, createSongAction, deleteSongAction } from "./actions";

// Letra (Claude) + música (ElevenLabs) pueden pasar del minuto largo.
export const maxDuration = 280;
export const dynamic = "force-dynamic";

const PAGE_SIZE = 50;

export default async function SongsPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string; error?: string }>;
}) {
  const query = await searchParams;
  const musicConfigured = isMusicConfigured();
  const lyricsConfigured = Boolean(process.env.ANTHROPIC_API_KEY);

  // Sin `audio`: son megas por canción y aquí solo hace falta saber si lo hay.
  const songs = await prisma.song.findMany({
    select: {
      id: true,
      topic: true,
      title: true,
      sections: true,
      styles: true,
      youtubeTitle: true,
      youtubeDescription: true,
      hasAudio: true,
      audioError: true,
      createdAt: true,
    },
    orderBy: { createdAt: "desc" },
    take: PAGE_SIZE,
  });

  return (
    <div>
      {query.notice && <div className="banner ok">{query.notice}</div>}
      {query.error && <div className="banner error">{query.error}</div>}

      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Canciones · Aprende con Carlota</h1>

      <div className="card">
        <h3>Nueva canción</h3>
        {!lyricsConfigured && (
          <p className="meta">Falta ANTHROPIC_API_KEY: sin ella no se puede escribir la letra.</p>
        )}
        <form action={createSongAction}>
          <label htmlFor="topic">Tema (opcional)</label>
          <input
            type="text"
            id="topic"
            name="topic"
            placeholder="Ej. los colores, lavarse las manos, los animales de la selva… Vacío = lo elige Claude"
          />
          <label style={{ display: "flex", gap: 8, alignItems: "center", marginTop: 10 }}>
            <input
              type="checkbox"
              name="withAudio"
              defaultChecked={musicConfigured}
              disabled={!musicConfigured}
              style={{ width: "auto" }}
            />
            Generar también la música cantada
          </label>
          {!musicConfigured && (
            <p className="meta" style={{ marginTop: 6 }}>
              Para que salga la canción cantada hace falta <code>ELEVENLABS_API_KEY</code> (ver
              README, «Canciones de Aprende con Carlota»). Mientras tanto se genera la letra y el
              estilo para pegarlos en Suno a mano.
            </p>
          )}
          <button type="submit" className="primary" style={{ marginTop: 12 }} disabled={!lyricsConfigured}>
            Crear canción
          </button>
          <p className="meta" style={{ marginTop: 8 }}>
            Tarda entre medio minuto (solo letra) y dos minutos (con música). No cierres la página.
          </p>
        </form>
      </div>

      {songs.length === 0 && <div className="empty">Aún no hay canciones.</div>}

      {songs.map((song) => {
        const sections = song.sections as unknown as SongSection[];
        const styles = [...BASE_STYLES, ...song.styles.split(",").map((s) => s.trim()).filter(Boolean)];
        return (
          <div className="card" key={song.id} id={`song-${song.id}`}>
            <h3>{song.title}</h3>
            <div className="meta">
              {song.topic} · {song.createdAt.toLocaleDateString("es-ES")}
            </div>

            {song.hasAudio ? (
              <div style={{ marginTop: 12 }}>
                <audio controls preload="none" src={`/dashboard/canciones/${song.id}/audio`} style={{ width: "100%" }} />
                <a className="btn" href={`/dashboard/canciones/${song.id}/audio?download=1`} style={{ marginTop: 8, display: "inline-block" }}>
                  Descargar MP3
                </a>
              </div>
            ) : (
              song.audioError && (
                <p className="meta" style={{ color: "#c0392b", marginTop: 8 }}>
                  La música falló: {song.audioError}
                </p>
              )
            )}

            <div style={{ marginTop: 12, lineHeight: 1.6, fontSize: 14 }}>
              {sections.map((section, i) => (
                <p key={i} style={{ margin: "0 0 10px" }}>
                  <strong>{section.name}</strong>
                  {section.lines.map((line, j) => (
                    <span key={j}>
                      <br />
                      {line}
                    </span>
                  ))}
                </p>
              ))}
            </div>

            <details style={{ marginTop: 8 }}>
              <summary>Para el vídeo: letra, título y descripción de YouTube, estilo para Suno</summary>
              <label>Letra completa</label>
              <textarea readOnly defaultValue={lyricsAsText(sections)} style={{ width: "100%", height: 160 }} />
              <label>Título de YouTube</label>
              <input type="text" readOnly defaultValue={song.youtubeTitle} />
              <label>Descripción de YouTube</label>
              <textarea readOnly defaultValue={song.youtubeDescription} style={{ width: "100%", height: 70 }} />
              <label>Estilo (para Suno u otro generador)</label>
              <input type="text" readOnly defaultValue={stylePrompt(styles)} />
            </details>

            <div className="row" style={{ marginTop: 12, gap: 8 }}>
              {musicConfigured && (
                <form action={composeSongAudioAction}>
                  <input type="hidden" name="id" value={song.id} />
                  <button type="submit">{song.hasAudio ? "Otra versión de la música" : "Generar música"}</button>
                </form>
              )}
              <form action={deleteSongAction}>
                <input type="hidden" name="id" value={song.id} />
                <button type="submit" className="danger">
                  Borrar
                </button>
              </form>
            </div>
          </div>
        );
      })}
    </div>
  );
}
