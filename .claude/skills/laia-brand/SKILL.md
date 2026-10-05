---
name: laia-brand
description: >
  Identidad visual oficial de LAIA (laiatech.com, "The AI & IoT Camera Company", fabricante español de cámaras PTZ, videoconferencia y audio AV). Úsala SIEMPRE que se cree o maquete cualquier pieza para LAIA o con su marca: newsletters, boletines, correos, presentaciones, documentos, informes, fichas de producto, posts, banners, webs, carteles o roll-ups. Contiene paleta exacta (Laia Red #E4032C, degradado a #650F31, Dark Blue #1B1D24), tipografías (Mandau + Poppins), jerarquía tipográfica, reglas del logo, recursos de diseño y los logos oficiales en PNG transparente. Actívala también cuando el usuario diga "formato LAIA", "estilo LAIA", "con la imagen de LAIA", "plantilla LAIA" o mencione Radar AV.
---

# LAIA — Guía de estilo (Brand Style Guide, abril 2024)

Fuente: la «Brand Style Guide» oficial de LAIA que facilitó el usuario. Aplica
estas reglas tal cual; no improvises colores, fuentes ni variaciones del logo.

## Marca

- Nombre: **LAIA** (el logotipo se escribe «laia» en minúsculas; en texto corrido, «LAIA» o «Laia»).
- Eslogan del logo: **The AI & IoT Camera Company** (no cambiar ni su posición ni su tipografía).
- Firma de cierre: **A European Company**.
- Web: **laiatech.com**.
- Empresa española con sede en Madrid y distribución internacional exclusivamente a través del canal de integración AV profesional. Cartera: cámaras PTZ y de videoconferencia con IA, micrófonos y altavoces. Software propio: **AICC** (AI Cam Control), **CCMS** (Centralized Cam Management System) e **IAVS** (Intelligent Audiovisual System). Programas de soporte: **Prime Support** (3 y 5 años) y **Professional Support** (2 años). Sello: «Certified by Laia».

## Paleta

| Nombre | HEX | RGB | CMYK | Uso |
|---|---|---|---|---|
| Laia Red | `#E4032C` | 228 3 44 | 1 99 80 0 | Color de marca, acentos, palabras destacadas |
| Degradado Laia | `#E4032C` → `#650F31` | — | — | −40°, 70 %. Marcos con texto, botones y fondos que deben llamar la atención |
| Dark Blue | `#1B1D24` | 27 29 36 | 84 74 56 76 | Texto principal, barra inferior |
| Blue Grey | `#85878E` | 133 135 142 | 49 38 33 15 | Texto secundario, detalles |
| Soft White | `#EDF0F2` | 237 240 242 | 9 4 5 0 | Fondos claros |

CSS del degradado: `linear-gradient(130deg, #E4032C 0%, #E4032C 35%, #650F31 100%)`
(en correo, pon siempre `background-color:#E4032C` de respaldo).

## Tipografía

- **Mandau** (Regular, Medium, Semi-Bold, Bold): titulares y **números** (obligatorio en piezas gráficas con diseño conceptual).
- **Poppins** (Thin, Light, Regular, Semi-Bold, Bold): todo lo demás. Gratuita (Google Fonts / Fontshare).
- Si Mandau no está disponible (web, correo), usa la pila `Mandau, Poppins, Arial, sans-serif`.

Jerarquía:
- **Titular**: Mandau Bold.
- **Subtítulo**: Poppins Light o Thin, algo mayor que el párrafo; puede ir en MAYÚSCULAS.
- **Párrafo**: Poppins Regular.
- **Números**: Mandau.
- **Llamada a la acción**: Poppins Semi-Bold, siempre en **formato botón**: borde fino (0,5 pt), esquinas redondeadas (≈4 mm), margen interior 1 mm vertical × 2 mm horizontal.
- Interlineado corto y tracking ligeramente negativo (−5).
- **Marcas en MAYÚSCULAS**: en el texto, los nombres de marca se escriben siempre en mayúsculas (LAIA, PTZOPTICS, AVER, AVONIC, LOGITECH, POLY, HP, SONY, YEALINK, NEAT…). Los nombres de producto, tal cual (Rally, Rise 4K, Studio X72, C-Pro). Nunca en las URL.
- El texto mezcla **Dark Blue** con palabras clave en **Laia Red** (p. ej. «A world of **solutions** to communicate»).

## Logo

Ficheros en `assets/` (extraídos del vectorial de la guía, fondo transparente):
- `logo-color-slogan.png` — principal, con eslogan debajo (fondos claros). **Versión preferente.**
- `logo-color.png` — sin eslogan, para tamaños pequeños donde el eslogan no se lee.
- `logo-white.png` / `logo-white-slogan.png` — versión blanca para fondos oscuros o rojos (la segunda con el eslogan a la derecha).

Variantes oficiales: color (isotipo gris/negro + bola roja + «laia» rojo), negro/rojo, negro, gris y blanca; alternativas con «laiatech.com» debajo o con el eslogan a la derecha.

Prohibido: cambiar los colores del logo, deformarlo o estirarlo, separar el isotipo (escudo con lente) del logotipo, cambiar la posición o la tipografía del eslogan.

Sobre fotografías: el logo siempre en un lateral/esquina, **blanco** si la zona es oscura y **negro u original** si es clara. Nunca grande y centrado sobre la foto.

## Recursos de diseño

- **Fondo**: en diseños sin foto, fondo claro con degradado gris-blanco (`#FFFFFF` → `#EDF0F2`).
- **Esquinas redondeadas** siempre que se pueda (≈2 mm; en pantalla 6–8 px), incluidas las fotos.
- **Corchetes de esquina** (⌜ arriba-izquierda y ⌟ abajo-derecha) enmarcando titulares destacados.
- **Degradado rojo** solo donde se busca llamar la atención: cajas con texto, botones, fondos puntuales. No como fondo de todo.
- **Barra inferior obligatoria** en Dark Blue con: logo (blanco) | web | «A European Company».
- **Fotos de producto** a tamaño real o lo más cerca posible; en composiciones con varios productos, respeta la proporción real entre ellos (medidas en las fichas de laiatech.com).
- Los títulos de las secciones en la guía llevan una línea fina roja a su derecha.
- Estilo general: limpio, mucho aire, iconos de línea en Laia Red, etiquetas tipo píldora.

## Cómo aplicarlo

1. Antes de maquetar, carga los colores y fuentes de arriba como variables/tokens.
2. Cabecera: logo a color con eslogan sobre fondo claro (o logo blanco sobre degradado rojo).
3. Titular en Mandau Bold Dark Blue con una o dos palabras en Laia Red; subtítulo en Poppins Light.
4. Un elemento con degradado rojo como foco (portada, cifra clave o llamada a la acción).
5. Botones en píldora: rellenos con degradado (principal) o blancos con borde rojo (secundario).
6. Cierra siempre con la barra Dark Blue: logo blanco | laiatech.com | A European Company.
7. En HTML para correo: tablas y estilos en línea, color plano de respaldo para cada degradado, logos como imágenes en línea (cid:) o URL pública.

Implementación de referencia (correo HTML completo con estas reglas): `laia-newsletter/lib/render.mjs` del repo `hools`.
