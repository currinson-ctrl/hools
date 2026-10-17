# Selector de fotos

Página autónoma para que varias personas seleccionen fotos de una galería con un
**Sí / No** en cada foto y luego comparen sus selecciones.

Nació para elegir entre los tres socios las fotos de la sesión
`hoolsbrandagosto2026` (Pixieset), pero sirve para cualquier galería.

## Cómo se usa

Está publicada en `public/`, así que una vez desplegado el sitio se abre en:

```
https://<dominio>/selector-fotos/
```

También funciona sin servidor: basta con abrir `index.html` con doble clic
(o mandárselo a alguien por email/WhatsApp). No tiene dependencias ni build.

### Flujo para los tres socios

1. Cada uno abre la página y escribe su nombre arriba a la derecha.
2. Carga las fotos, de una de estas dos formas:
   - **Carpeta local** (recomendado): descargar el ZIP de la galería, descomprimirlo
     y elegir la carpeta. Funciona sin conexión y con galerías grandes.
   - **URLs**: pegar las direcciones de las imágenes, una por línea. Es la vía a usar
     cuando el fotógrafo tiene la descarga desactivada. La propia página incluye un
     código para pegar en la consola del navegador: recorre la galería solo, espera a
     que carguen todas las miniaturas y copia las URLs al portapapeles.
3. Marca cada foto con **Sí** o **No** (clic en la foto = Sí; atajos `S`, `N`,
   `Espacio` y flechas). Se guarda solo en el navegador según se vota.
4. **Exportar mi selección** genera un `.json` que se pasa a los demás.
5. Cualquiera importa los `.json` de los otros dos y en **Comparar selecciones** ve,
   foto a foto, quién ha dicho qué, con filtros: *Sí de todos*, *Mayoría*, *Algún sí*,
   *En conflicto*, *Ningún sí*. Desde ahí se copia o descarga la lista final.

## Detalles de implementación

- Un único fichero `index.html`, sin dependencias externas ni red.
- Las fotos nunca se suben a ningún sitio: se leen con `URL.createObjectURL`
  desde el disco, o se cargan directamente desde su URL original.
- Los votos viven en `localStorage`, con clave por galería y por socio
  (`hools.sel.<galeria>.votos.<socio>`), así que tres personas pueden usar
  el mismo ordenador sin pisarse.
- Cuando varias URLs son la misma foto en distintos tamaños (lo habitual en las
  galerías online), se agrupan y se conserva la de mayor resolución.
- El emparejamiento entre selecciones se hace por nombre de archivo normalizado
  (sin ruta, sin extensión y sin sufijos de tamaño tipo `-xl` o `_thumb`), para que
  cuadre aunque uno haya trabajado con el ZIP y otro con las URLs.
- La galería se puede cambiar con `?g=nombre-de-la-galeria`, lo que además separa
  los votos guardados de cada sesión de fotos.
