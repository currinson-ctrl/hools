# Tema de Shopify — secciones propias del blog

Estos ficheros son las secciones y snippets **propios de Hools** del tema de
`hoolsbrand.com`. El tema completo vive en Shopify; aquí solo está la parte que
escribimos nosotros, para tenerla en control de versiones y poder revisar los
cambios en un diff.

```
theme/
  sections/main-blog-hools-editorial.liquid     portada del blog
  sections/main-article-hools-editorial.liquid  plantilla de artículo
  sections/hools-blog-strip.liquid              franja del blog en la home
  sections/hools-hero.liquid                    hero de la portada de la tienda
  sections/hools-testimonials-bg.liquid         testimonios "Desde la Grada" (home)
  snippets/hools-article-card.liquid            tarjeta de artículo (4 variantes)
  templates/blog.hools-editorial.json           ajustes de la portada
  templates/article.hools-editorial.json        ajustes de la plantilla de artículo
```

`hools-hero` sustituye al bloque de "Liquid personalizado" que había en la
portada, donde el nombre del fichero de la foto estaba escrito a mano dos veces
(una para móvil y otra para escritorio). Cambiar la imagen obligaba a editar
texto; ahora es un `image_picker` y se cambia desde el editor. Su ajuste
`image` vive en `templates/index.json`, que **no** está aquí: ese fichero lo
mantiene el editor y contiene toda la portada de la tienda, no solo el hero.

`hools-testimonials-bg` es la sección "Desde la Grada" de la portada. El
carrusel es `scroll-snap` nativo de CSS (`overflow-x:auto` +
`scroll-snap-type`), sin JS ni librería: no hace falta añadir ninguna para
moverlo. Cada testimonio lleva una foto opcional (`photo`); si se deja vacía se
usa la del producto enlazado, así que ninguna tarjeta se queda coja mientras
faltan fotos. El tamaño y la forma se cambian desde el editor
(`avatar_size`, `avatar_shape`), no tocando el CSS.

> **Las fotos de los testimonios no están aquí.** `photo` es un `image_picker`
> de bloque, y como el `image` del hero, sólo vive en `templates/index.json`
> — el fichero que mantiene el editor y que **no** está en el repo. Recrear la
> sección sin él deja los testimonios con la foto del producto (el respaldo),
> no en blanco, pero las fotos de los clientes hay que volver a elegirlas a
> mano.

Los dos `templates/*.json` están aquí porque guardan ajustes que **el schema de
la sección no puede reponer**: los `image_picker` y los `url` no admiten valor
por defecto, así que la foto de fondo de la cabecera y las tres colecciones del
CTA solo existen dentro de esos JSON. Si se recrean sin ellos, esas piezas se
quedan en blanco sin que nada avise.

> **El JSON de la portada lo mantiene el editor de temas, y lo guarda
> minificado.** Su copia de aquí está formateada para que el diff se lea, así
> que su md5 **no** coincide con el del tema aunque el contenido sea el mismo
> (la Admin API devuelve el fichero con formato al leerlo, pero `size` y
> `checksumMd5` son los del original minificado). Para este fichero la
> comparación es semántica, no byte a byte. El JSON del artículo sí lo subimos
> nosotros con formato, así que ese sí coincide.
>
> Ese mismo JSON arrastra dos ajustes muertos del carrusel anterior
> (`carousel_title`, `carousel_count`) que el schema actual ya no declara. No
> molestan — Shopify los ignora — y desaparecerán en cuanto el fichero se vuelva
> a subir.

El blog `the-away-end` y sus artículos usan el sufijo de plantilla
`hools-editorial`, que es lo que hace que se rendericen con estas secciones y
no con las de serie del tema (`main-blog` / `main-article`).

> **El sufijo del blog NO lo heredan sus artículos.** Hay que ponérselo a cada
> artículo, y por eso el agregador manda `templateSuffix` en `articleCreate` y
> en `articleUpdate` (`SHOPIFY_ARTICLE_TEMPLATE_SUFFIX`, en `src/lib/shopify.ts`).
> Un artículo sin sufijo se renderiza con `main-article` de serie, que recorta
> la imagen destacada a un banner: con las fotos verticales que llegan de X, el
> resultado es una franja estirada. Si ves eso en un artículo, lo primero que
> hay que mirar es su `templateSuffix`.

## Contrato con el agregador

`src/lib/article-html.ts` genera el cuerpo de cada artículo con unas clases
concretas, y estas secciones las estilan. **Si se renombra una clase en un
lado, hay que renombrarla en el otro**:

| Clase                       | Qué es                                  |
| --------------------------- | --------------------------------------- |
| `p.hools-lead`              | entradilla destacada (ver nota abajo)   |
| `h2`                        | ladillos                                |
| `blockquote.hools-pullquote`| cita a gran tamaño                      |
| `figure.hools-gallery`      | galería de fotos dentro del texto       |
| `aside.hools-facts`         | recuadro «la ficha»                     |
| `p.hools-source`            | atribución a la fuente original         |
| `aside.hools-shop-cta`      | cierre con enlace a la tienda           |

Los artículos publicados **antes** de la maquetación no traen `p.hools-lead`.
Para que no se queden sin entradilla si no se remaquetan, la plantilla estila
igual el primer párrafo del cuerpo (`.hools-content > p:first-child`). Como en
los maquetados ese primer párrafo *es* la entradilla, la misma regla vale para
los dos casos y no hace falta ninguna condición en Liquid.

Los que se escribieron a mano (los de febrero) traen además `h3` y `hr`, que el
agregador no emite nunca. La plantilla los estila igualmente para que no salgan
con el aspecto de serie del tema.

Las etiquetas `AFICION` / `VIAJES` / `MODA` que pone el agregador son además lo
que alimenta el antetítulo de las tarjetas y el filtro por categoría de la
portada. La otra etiqueta de cada artículo es el nombre de la fuente y no se
usa para navegar.

## Cómo subir cambios a Shopify

> **Sube siempre la sección antes que su `templates/*.json`.** Shopify valida
> los ajustes del template contra el schema de la sección y **descarta sin
> avisar** los que no reconoce (la mutación responde `success` igualmente). Si
> subes primero el JSON con ajustes nuevos, se pierden y parece que el cambio
> "no ha hecho nada".

Estos ficheros **no se despliegan solos**: hay que subirlos al tema. Con
[Shopify CLI](https://shopify.dev/docs/api/shopify-cli):

```bash
shopify theme push --theme <ID_DEL_TEMA> --only sections/main-blog-hools-editorial.liquid \
                                          --only sections/main-article-hools-editorial.liquid \
                                          --only sections/hools-testimonials-bg.liquid \
                                          --only snippets/hools-article-card.liquid \
                                          --only templates/blog.hools-editorial.json \
                                          --only templates/article.hools-editorial.json
```

Trabaja siempre sobre un tema **sin publicar** y publícalo desde el admin
cuando la vista previa te convenza. La API rechaza escribir en el tema en vivo.
