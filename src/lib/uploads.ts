import type { UploadKind } from "./shopify";

/**
 * Reglas de la subida directa desde el navegador a Shopify.
 *
 * Este modulo lo importan las dos orillas (el componente del navegador y las
 * rutas del servidor), asi que no puede tocar nada de servidor: la sesion se
 * comprueba en session.ts.
 *
 * Viven aqui, y no en el componente, porque hay que aplicarlas en el
 * servidor: el navegador puede saltarselas (un `accept` en un input no es
 * una validacion). El componente las usa ademas para avisar antes de subir.
 */
export const UPLOAD_LIMITS: Record<
  UploadKind,
  { maxBytes: number; mimeTypes: string[]; label: string }
> = {
  image: {
    // Shopify no admite HEIC (el formato de serie del iPhone). Safari suele
    // convertir a JPEG al subir, pero si llega un HEIC hay que decirlo con
    // claridad en vez de dejar que falle el procesado en Shopify.
    maxBytes: 20 * 1024 * 1024,
    mimeTypes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
    label: "JPG, PNG, WEBP o GIF",
  },
  video: {
    maxBytes: 300 * 1024 * 1024,
    mimeTypes: ["video/mp4", "video/quicktime"],
    label: "MP4 o MOV",
  },
};

/**
 * Duracion maxima de un video en X. Instagram admite mucho mas (15 min en
 * reels), asi que pasarse no impide publicar: solo hace fallar el tuit, y por
 * eso el formulario avisa en vez de bloquear.
 */
export const MAX_TWITTER_VIDEO_SECONDS = 140;

export function isUploadKind(value: unknown): value is UploadKind {
  return value === "image" || value === "video";
}
