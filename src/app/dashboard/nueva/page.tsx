import { Category } from "@prisma/client";
import { CATEGORY_LABEL } from "@/lib/sources";
import { isShopifyConfigured } from "@/lib/shopify";
import { createManualArticleAction } from "../actions";
import { MediaUploader } from "../media-uploader";

// Maquetar el texto con Claude puede pasar de los 60s por defecto; mismo
// margen que el resto del panel. (La foto y el vídeo ya no cuentan aquí: los
// sube el navegador directamente a Shopify antes de enviar el formulario.)
export const maxDuration = 280;

export default async function NewArticlePage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const query = await searchParams;
  const canUploadMedia = isShopifyConfigured();

  return (
    <div>
      {query.error && <div className="banner error">{query.error}</div>}

      <h1 style={{ fontSize: 18, marginBottom: 16 }}>Nueva noticia</h1>
      <p className="excerpt" style={{ marginBottom: 16 }}>
        Escribe aquí una noticia propia: titular, texto y foto. Se guarda en
        <strong> pendientes</strong> como una más, así que después la repasas y la
        publicas con el mismo botón «Aprobar y publicar» (Shopify + X + Instagram
        + Facebook). Tu texto no se reescribe: solo se le añaden la entradilla,
        los ladillos y la maquetación del blog.
      </p>

      <div className="card">
        <form action={createManualArticleAction}>
          <label htmlFor="title">Titular</label>
          <input
            type="text"
            id="title"
            name="title"
            required
            placeholder="Ej. La Curva Nord llenó de tifos el derby de Roma"
          />

          <label htmlFor="body">Texto de la noticia</label>
          <textarea
            id="body"
            name="body"
            required
            // El resto del panel escribe HTML (de ahi la monoespaciada global);
            // aqui se escribe prosa, y en monoespaciada 12px se lee peor.
            style={{ minHeight: 240, fontFamily: "inherit", fontSize: 14 }}
            placeholder={
              "Escribe la noticia en párrafos, separados por una línea en blanco.\n\n" +
              "El primero funciona como entrada: cuenta lo esencial (quién, qué, dónde)."
            }
          />

          <label htmlFor="category">Categoría</label>
          <select id="category" name="category" defaultValue={Category.AFICION}>
            <option value={Category.AFICION}>{CATEGORY_LABEL.AFICION}</option>
            <option value={Category.VIAJES}>{CATEGORY_LABEL.VIAJES}</option>
            <option value={Category.MODA}>{CATEGORY_LABEL.MODA}</option>
          </select>

          <MediaUploader
            kind="image"
            name="imageUrl"
            label="Foto"
            canUpload={canUploadMedia}
            hint={
              canUploadMedia ? (
                <>
                  JPG, PNG, WEBP o GIF, hasta 20 MB. Se sube directa a los Archivos
                  de tu tienda de Shopify (no pasa por el panel, así que ya no la
                  limita el tope de Vercel) y se usa como imagen destacada del
                  artículo. También puedes pegar la URL de una foto ya alojada.
                </>
              ) : (
                <>
                  Faltan las credenciales de Shopify (SHOPIFY_*), así que de momento
                  solo se puede indicar la foto por URL.
                </>
              )
            }
          />

          <MediaUploader
            kind="video"
            name="videoUrl"
            previewName="videoPreviewUrl"
            label="Vídeo (opcional)"
            canUpload={canUploadMedia}
            hint={
              <>
                MP4 o MOV, hasta 300 MB. Con vídeo, al aprobar podrás publicarlo
                como <strong>Reel</strong> o <strong>Story</strong> en Instagram, y
                se adjunta al tuit (X no admite más de 2:20, y no mezcla vídeo y
                fotos en el mismo tuit). Si no pones foto, se usa de portada el
                fotograma que saca Shopify.
              </>
            }
          />

          <label htmlFor="sourceUrl">Enlace a la fuente (opcional)</label>
          <input
            type="url"
            id="sourceUrl"
            name="sourceUrl"
            placeholder="https://… (déjalo vacío si la noticia es tuya)"
          />
          <div className="meta" style={{ marginTop: 6 }}>
            Si lo rellenas, el artículo cierra con «Fuente: …» enlazando ahí.
          </div>

          <label htmlFor="tweetText">Texto del tuit (opcional)</label>
          <textarea
            id="tweetText"
            name="tweetText"
            style={{ minHeight: 80 }}
            placeholder="Si lo dejas vacío se usa el titular con los hashtags de la categoría."
          />

          <label htmlFor="igCaption">Pie de foto de Instagram (opcional)</label>
          <textarea
            id="igCaption"
            name="igCaption"
            style={{ minHeight: 80 }}
            placeholder="Si lo dejas vacío se usa el texto del tuit."
          />

          <div className="row">
            <button className="primary" type="submit">
              Crear noticia
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
