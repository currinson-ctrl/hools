# Tema de Shopify — secciones propias del blog

Estos ficheros son las secciones y snippets **propios de Hools** del tema de
`hoolsbrand.com`. El tema completo vive en Shopify; aquí solo está la parte que
escribimos nosotros, para tenerla en control de versiones y poder revisar los
cambios en un diff.

```
theme/
  sections/main-blog-hools-editorial.liquid     portada del blog
  sections/main-article-hools-editorial.liquid  plantilla de artículo
  snippets/hools-article-card.liquid            tarjeta de artículo (4 variantes)
```

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

Las etiquetas `AFICION` / `VIAJES` / `MODA` que pone el agregador son además lo
que alimenta el antetítulo de las tarjetas y el filtro por categoría de la
portada. La otra etiqueta de cada artículo es el nombre de la fuente y no se
usa para navegar.

## Cómo subir cambios a Shopify

Estos ficheros **no se despliegan solos**: hay que subirlos al tema. Con
[Shopify CLI](https://shopify.dev/docs/api/shopify-cli):

```bash
shopify theme push --theme <ID_DEL_TEMA> --only sections/main-blog-hools-editorial.liquid \
                                          --only sections/main-article-hools-editorial.liquid \
                                          --only snippets/hools-article-card.liquid
```

Trabaja siempre sobre un tema **sin publicar** y publícalo desde el admin
cuando la vista previa te convenza. La API rechaza escribir en el tema en vivo.
