"use client";

import { useId, useRef, useState } from "react";
import { MAX_TWITTER_VIDEO_SECONDS, UPLOAD_LIMITS } from "@/lib/uploads";

type Kind = "image" | "video";

type Phase = "idle" | "uploading" | "processing" | "error";

interface StagedTarget {
  url: string;
  resourceUrl: string;
  parameters: Array<{ name: string; value: string }>;
}

interface UploadedFile {
  fileId?: string;
  ready: boolean;
  url: string | null;
  previewUrl: string | null;
}

// Cuanto se espera a que Shopify termine de procesar. Una foto esta lista en
// segundos; un video hay que transcodificarlo y puede irse a varios minutos.
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS: Record<Kind, number> = { image: 15, video: 100 };

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function readError(response: Response): Promise<string> {
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) return data.error;
  } catch {
    // respuesta sin JSON (ej. una pagina de error): sirve el codigo
  }
  return `El servidor respondió ${response.status}`;
}

/**
 * Sube el archivo al destino firmado. Va por XHR y no por fetch porque es la
 * unica forma de tener el porcentaje de progreso, y en un video de 80 MB por
 * una conexion normal la diferencia entre una barra que avanza y un boton
 * congelado es la diferencia entre esperar y volver a pulsar.
 */
function uploadToTarget(
  target: StagedTarget,
  file: File,
  onProgress: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const form = new FormData();
    // El orden importa: los campos firmados van antes del archivo.
    for (const parameter of target.parameters) form.append(parameter.name, parameter.value);
    form.append("file", file);

    const request = new XMLHttpRequest();
    request.open("POST", target.url, true);
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100));
    };
    request.onload = () => {
      if (request.status >= 200 && request.status < 300) resolve();
      else reject(new Error(`La subida respondió ${request.status}`));
    };
    request.onerror = () =>
      reject(
        new Error(
          "No se pudo conectar con el almacén de Shopify. Si se repite, sube el archivo a otro sitio y pega aquí su URL."
        )
      );
    request.send(form);
  });
}

export interface MediaUploaderProps {
  kind: Kind;
  /** Nombre del campo del formulario que lleva la URL final. */
  name: string;
  label: string;
  /** Campo oculto con la miniatura que Shopify saca del vídeo. Solo vídeo. */
  previewName?: string;
  defaultValue?: string | null;
  defaultPreview?: string | null;
  /** Texto de ayuda bajo el control. */
  hint?: React.ReactNode;
  /** Sin credenciales de Shopify solo queda pegar la URL a mano. */
  canUpload?: boolean;
}

/**
 * Campo de foto o vídeo con subida directa del navegador a los Archivos de
 * Shopify.
 *
 * El archivo NO pasa por el servidor del panel: este pide a Shopify un
 * destino firmado (/api/uploads/stage), el navegador sube ahí, y luego el
 * panel registra el archivo y espera a que Shopify lo procese. Es lo que
 * permite subir un vídeo de 80 MB desde Vercel, que corta cualquier petición
 * de más de 4,5 MB.
 *
 * Lo que se envía con el formulario es siempre una URL, en un campo de texto
 * normal: si la subida falla (o no hay credenciales), se puede pegar a mano
 * la URL de una foto/vídeo ya alojado y el formulario sigue funcionando.
 */
export function MediaUploader({
  kind,
  name,
  label,
  previewName,
  defaultValue,
  defaultPreview,
  hint,
  canUpload = true,
}: MediaUploaderProps) {
  const fieldId = useId();
  const fileInput = useRef<HTMLInputElement>(null);

  const [url, setUrl] = useState(defaultValue || "");
  const [previewUrl, setPreviewUrl] = useState(defaultPreview || "");
  const [phase, setPhase] = useState<Phase>("idle");
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [warning, setWarning] = useState<string | null>(null);

  const limits = UPLOAD_LIMITS[kind];
  const busy = phase === "uploading" || phase === "processing";

  /** Avisa (sin bloquear) si el vídeo se pasa del tope de X. */
  async function checkDuration(file: File) {
    if (kind !== "video") return;
    const objectUrl = URL.createObjectURL(file);
    try {
      const seconds = await new Promise<number>((resolve, reject) => {
        const video = document.createElement("video");
        video.preload = "metadata";
        video.onloadedmetadata = () => resolve(video.duration);
        video.onerror = () => reject(new Error("no se pudo leer el vídeo"));
        video.src = objectUrl;
      });
      if (seconds > MAX_TWITTER_VIDEO_SECONDS) {
        setWarning(
          `El vídeo dura ${Math.round(seconds)}s y X no admite más de ${MAX_TWITTER_VIDEO_SECONDS}s: ` +
            "el artículo y el reel de Instagram saldrán bien, pero el tuit fallará. Recórtalo si lo quieres también en X."
        );
      }
    } catch {
      // Si el navegador no sabe leer la duración, se sube igual.
    } finally {
      URL.revokeObjectURL(objectUrl);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    setWarning(null);

    if (!limits.mimeTypes.includes(file.type)) {
      setError(
        `"${file.name}" no es un formato admitido. Usa ${limits.label}.` +
          (kind === "image" && /heic|heif/i.test(file.type + file.name)
            ? " Las fotos .HEIC del iPhone hay que convertirlas a JPG."
            : "")
      );
      return;
    }
    if (file.size > limits.maxBytes) {
      setError(
        `"${file.name}" pesa ${(file.size / 1024 / 1024).toFixed(1)} MB y el máximo son ${
          limits.maxBytes / 1024 / 1024
        } MB.`
      );
      return;
    }

    await checkDuration(file);

    try {
      setPhase("uploading");
      setProgress(0);

      const stageResponse = await fetch("/api/uploads/stage", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          filename: file.name,
          mimeType: file.type,
          size: file.size,
          kind,
        }),
      });
      if (!stageResponse.ok) throw new Error(await readError(stageResponse));
      const target = (await stageResponse.json()) as StagedTarget;

      await uploadToTarget(target, file, setProgress);

      setPhase("processing");
      const completeResponse = await fetch("/api/uploads/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          resourceUrl: target.resourceUrl,
          filename: file.name,
          kind,
        }),
      });
      if (!completeResponse.ok) throw new Error(await readError(completeResponse));
      let uploaded = (await completeResponse.json()) as UploadedFile;

      // Shopify procesa en segundo plano. Se pregunta desde aquí (y no
      // esperando dentro de una función del servidor) para no gastar tiempo
      // de ejecución mientras transcodifica.
      for (let attempt = 0; !uploaded.ready && attempt < MAX_POLLS[kind]; attempt++) {
        await sleep(POLL_INTERVAL_MS);
        const statusResponse = await fetch(
          `/api/uploads/status?fileId=${encodeURIComponent(uploaded.fileId!)}`
        );
        if (!statusResponse.ok) throw new Error(await readError(statusResponse));
        uploaded = { fileId: uploaded.fileId, ...((await statusResponse.json()) as UploadedFile) };
      }

      if (!uploaded.ready || !uploaded.url) {
        throw new Error(
          "Shopify sigue procesando el archivo. Búscalo en Contenido → Archivos de tu tienda dentro de un rato y pega aquí su URL."
        );
      }

      setUrl(uploaded.url);
      setPreviewUrl(uploaded.previewUrl || (kind === "image" ? uploaded.url : ""));
      setPhase("idle");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    } finally {
      // Sin esto, volver a elegir el mismo archivo no dispara el evento.
      if (fileInput.current) fileInput.current.value = "";
    }
  }

  return (
    <div style={{ marginTop: 14 }}>
      <label htmlFor={fieldId}>{label}</label>

      {canUpload && (
        <div className="row" style={{ marginTop: 0, alignItems: "center" }}>
          <input
            ref={fileInput}
            type="file"
            accept={limits.mimeTypes.join(",")}
            disabled={busy}
            style={{ flex: 1, minWidth: 220 }}
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </div>
      )}

      {phase === "uploading" && (
        <div className="meta" style={{ marginTop: 6 }}>
          Subiendo a Shopify… {progress}%
          <div
            style={{
              height: 4,
              borderRadius: 999,
              background: "var(--border)",
              marginTop: 4,
              overflow: "hidden",
            }}
          >
            <div style={{ width: `${progress}%`, height: "100%", background: "var(--accent)" }} />
          </div>
        </div>
      )}
      {phase === "processing" && (
        <div className="meta" style={{ marginTop: 6 }}>
          Shopify está procesando el archivo… {kind === "video" && "(un vídeo puede tardar varios minutos, no cierres la página)"}
        </div>
      )}
      {error && (
        <div className="banner error" style={{ marginTop: 8 }}>
          {error}
        </div>
      )}
      {warning && (
        <div className="banner error" style={{ marginTop: 8 }}>
          {warning}
        </div>
      )}

      <input
        type="url"
        id={fieldId}
        name={name}
        value={url}
        placeholder={
          canUpload
            ? "Se rellena sola al subir el archivo (o pega aquí una URL)"
            : "Pega aquí la URL del archivo"
        }
        onChange={(event) => {
          setUrl(event.target.value);
          if (kind === "image") setPreviewUrl(event.target.value);
        }}
        style={{ marginTop: 8 }}
      />
      {previewName && <input type="hidden" name={previewName} value={previewUrl} />}

      {hint && (
        <div className="meta" style={{ marginTop: 6 }}>
          {hint}
        </div>
      )}

      {url && kind === "video" && (
        <div className="row" style={{ alignItems: "center" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          {previewUrl && (
            <img src={previewUrl} alt="" style={{ maxWidth: 120, borderRadius: 8, display: "block" }} />
          )}
          <a className="btn" href={url} target="_blank" rel="noreferrer">
            Ver el vídeo
          </a>
          <button type="button" onClick={() => { setUrl(""); setPreviewUrl(""); }}>
            Quitar
          </button>
        </div>
      )}
      {url && kind === "image" && (
        <div className="row" style={{ alignItems: "flex-start" }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={url}
            alt=""
            style={{ maxWidth: 240, borderRadius: 8, display: "block" }}
          />
          <button type="button" onClick={() => { setUrl(""); setPreviewUrl(""); }}>
            Quitar
          </button>
        </div>
      )}
    </div>
  );
}
