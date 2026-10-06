# Tema con la promo «Hools en la Grada» aplicada

Ficheros del tema modificados para lanzar la promo. Se subieron a una COPIA del
tema publicado («Hools — 2x1 Hools en la Grada (listo para publicar)»), que es
la que se publica desde Tienda online → Temas.

| Fichero | Cambio |
|---|---|
| `sections/header-group.json` | Anuncio «2x1 · Sube tu polo y te regalamos otro →» el primero; oculto el de «10% de descuento en la primera compra» |
| `sections/hools-hero.liquid` | Dos ajustes nuevos para promos, apagados por defecto: «Tamaño del titular» (Normal/Grande) y «Estilo del botón principal» (Claro/Dorado), más «Línea 2 en dorado» |
| `templates/index.json` | Hero en modo promo: «2X1 EN POLOS / EL SEGUNDO, GRATIS», botón dorado «QUIERO MI 2X1» a la landing y «VER LOS POLOS»; banner: texto y botón «Ver el 2x1» a la landing |
| `sections/footer-group.json` | Instagram del pie a instagram.com/hoolsbrand (antes instagram.es/hools) |
| `templates/product.json` | Bloque «2x1 Hools en la Grada» bajo el precio (solo productos de tipo Polo) |

Para cerrar la promo: en el editor, ocultar el anuncio y el bloque del producto,
volver a mostrar el del 10 % y devolver el hero y el banner a sus textos
(hero: antetítulo «RETURN TO THE ORIGINS», titular «FÚTBOL OLD STYLE» con la
línea 2 vacía, tamaño Normal, sin dorado, subtítulo «Para los que saben de dónde
vienen.», botón 1 «VER LA COLECCIÓN» → Novedades en estilo Claro, botón 2
«CONOCE HOOLS» → La Marca; banner «not a fashion... it's an attitude» / «Comprar ahora» →
/collections/productos). El enlace de Instagram del pie se queda corregido.
