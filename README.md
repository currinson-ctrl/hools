# Hools Blog — agregador de noticias con cola de revisión

Agrega noticias de afición/ultras, desplazamientos/viajes de hinchas y moda
casual desde feeds RSS, las deja en una **cola de revisión** privada, y al
aprobar una noticia la publica automáticamente:

- como artículo en el blog de Shopify de **hoolsbrand.com** (blog "The Away End"), y
- como tuit en **X** con el enlace al artículo publicado.

La aprobación es manual a propósito (ver "¿Por qué revisión manual?" abajo), y
el rastreo también: se dispara con un botón, no con un horario (ver "Cuándo se
rastrea" abajo).

## Cómo funciona

```
Botón "Buscar noticias ahora" (/dashboard?status=PENDING)
        │  (o GET /api/cron/fetch con CRON_SECRET, para dispararlo desde fuera)
        ▼
Lee todas las fuentes RSS activas → crea Article en estado PENDING
(deduplicado por guid/link, no se repiten noticias)
        │
        ▼
Dashboard privado /dashboard  →  tú revisas, editas título/resumen/tuit,
        │                        y pulsas "Aprobar" o "Rechazar"
        ▼ (al aprobar)
Publica en Shopify (blog "The Away End") + publica tuit en X
```

Cada noticia agregada NO copia el artículo original completo: durante el
rastreo, Claude (Anthropic) reescribe el titular y el resumen en español de
España (no es una traducción literal, adapta el estilo) + una cita breve +
un enlace "Fuente: ..." al medio original. Esto es intencional por derechos
de autor — revisa y ajusta el texto en el dashboard antes de aprobar si hace
falta. Si `ANTHROPIC_API_KEY` no está configurada o falla la llamada, esa
noticia en concreto se queda en su idioma original en vez de bloquear el
resto del rastreo.

## Escribir una noticia a mano

Además de lo que llega de las fuentes, el panel tiene su propia caja para
publicar noticias propias: **`/dashboard/nueva`** (pestaña "Nueva noticia",
o el botón "Escribir noticia" de la cola de pendientes).

Se rellena titular, texto, categoría, **foto** y, si hace falta, **vídeo**.
Opcionalmente: enlace a la fuente, texto del tuit y pie de Instagram; si se
dejan vacíos, el tuit sale del titular más los hashtags de la categoría, y el
pie de Instagram del texto del tuit.

La noticia entra en la **misma cola de pendientes** que las rastreadas, así
que se repasa y se publica con el mismo botón "Aprobar y publicar" (Shopify +
X + Instagram + Facebook). Dos diferencias con las noticias de fuera:

- **El texto no se reescribe.** Claude solo lo *maqueta* — entradilla,
  ladillos, cita destacada y ficha — conservando los párrafos palabra por
  palabra (es el mismo maquetado que usa "Remaquetar publicados"). Sin
  `ANTHROPIC_API_KEY` se maqueta en básico, no se pierde la noticia.
- **No pasan por "Limpiar fuera de tema".** Si te has sentado a escribirla,
  ya has decidido que encaja.

Sin enlace a la fuente, el artículo no lleva la línea "Fuente: ..." (la
noticia es propia, no hay a quién enlazar).

Las noticias manuales cuelgan de una fuente interna ("Redacción Hools") que
se crea sola, nace pausada para que el rastreo la ignore y no aparece en
`/dashboard/sources`: no hay nada que configurar en ella.

### Fotos y vídeos: cómo se suben

Los mismos dos campos están en la caja de noticia manual y en la ficha de
cualquier artículo (`/dashboard/articles/...`), así que también se puede
cambiar la foto o añadir un vídeo después.

- **Foto**: JPG, PNG, WEBP o GIF, hasta 20 MB. Es la imagen destacada del
  artículo en Shopify y la que se adjunta al tuit y a Instagram/Facebook.
- **Vídeo**: MP4 o MOV, hasta 300 MB. No sale en el artículo del blog: al
  aprobar habilita **Reel** y **Story** en Instagram y se adjunta al tuit
  (X no admite más de 2:20 y no mezcla vídeo y fotos en el mismo tuit; el
  formulario avisa si el vídeo se pasa). Si no se pone foto, se usa de
  portada el fotograma que saca Shopify.

El archivo **no pasa por el servidor del panel**: una función de Vercel no
admite peticiones de más de 4,5 MB, así que el panel solo firma un destino de
subida en Shopify (`/api/uploads/stage`) y el navegador sube el archivo
directamente ahí. Después el panel lo registra en los Archivos de la tienda
(`/api/uploads/complete`) y el navegador espera a que Shopify termine de
procesarlo (`/api/uploads/status`) — segundos en una foto, varios minutos en
un vídeo, que hay que transcodificar. Lo que se guarda en el artículo es la
URL del CDN de Shopify.

Todo acaba en los **Archivos de tu tienda** (Shopify Admin → Contenido →
Archivos) porque todo lo que publica el sistema consume la foto y el vídeo
como URL pública: Shopify descarga la imagen del artículo, X se baja el mp4
para adjuntarlo, y a Instagram se le pasa la URL para que la descargue Meta.

Por eso la app de Shopify necesita el scope **`write_files`** (ver "Variables
de entorno → Shopify"). Sin él la subida falla; queda la opción de pegar a
mano la URL de una foto o un vídeo ya alojados, que es el mismo campo.

Las rutas `/api/uploads/*` comprueban la cookie de sesión del panel: firman
peticiones contra la Admin API de la tienda, así que no pueden quedar
abiertas (el middleware solo cubre `/dashboard`).

## Categorías (y las pestañas del blog)

Las pestañas de la portada del blog —Afición / Desplazamientos / Casual— son un
filtro por **etiqueta**: cada artículo se publica con `[categoría, nombre de la
fuente]`, y la pestaña enseña los que llevan `AFICION`, `VIAJES` o `MODA`.

La categoría la decide **el contenido de la noticia**, no la fuente que la
trajo. En el mismo paso en que escribe el artículo, Claude elige una de las
tres (o la descarta por no encajar en ninguna). La categoría configurada en
`/dashboard/sources` sigue existiendo para organizar el catálogo y como
respaldo si el modelo devuelve algo que no reconocemos, pero ya no es la que
manda.

Antes sí lo era, y por eso una fuente generalista dada de alta como AFICION
metía en esa pestaña también sus desplazamientos: la clasificación no miraba el
texto, solo quién lo publicaba.

Cambiar la etiqueta de un artículo ya publicado desde Shopify **aguanta**: al
actualizar, el agregador no reenvía las etiquetas.

## Cómo está maquetado un artículo

Claude no devuelve un bloque de párrafos, sino el artículo **por piezas**
(`src/lib/translate.ts`), y `src/lib/article-html.ts` las monta en el HTML que
se publica:

```
p.hools-lead                 entradilla (es también el resumen de Shopify:
                             la tarjeta del listado y la meta description)
h2 + p                       cuerpo en 3-4 secciones con ladillo
blockquote.hools-pullquote   cita destacada, tras la primera sección
figure.hools-gallery         fotos extra repartidas por el texto
aside.hools-facts            recuadro "la ficha" (club, estadio, competición…)
p.hools-source               atribución a la fuente original
aside.hools-shop-cta         cierre con enlace a la tienda
```

Esas clases son el contrato con la plantilla del tema (ver `theme/README.md`):
si se renombran aquí, hay que renombrarlas allí. La ficha solo aparece cuando
la noticia original da datos concretos — al modelo se le pide expresamente que
devuelva la lista vacía antes que inventarse cifras o nombres.

El cierre de tienda reparte los enlaces entre las colecciones de
`SHOP_COLLECTIONS` (`src/lib/sources.ts`) en vez de elegirlas por la categoría
de la noticia: como casi todo lo que entra es AFICION, por categoría el enlace
acababa siendo Terrace prácticamente siempre. El reparto sale de un hash del
`guid` del artículo, así que es estable (un artículo no cambia de colección al
remaquetarlo) y reproducible. La banda verde sobre la foto se reparte igual,
pero eso vive en el tema y se configura desde el editor.

Los artículos publicados **antes** de esta maquetación se pueden reprocesar
desde `/dashboard?status=PUBLISHED` con el botón **«Remaquetar publicados»**:
descompone el HTML antiguo y le pide a Claude que lo agrupe en secciones sin
reescribir el texto (si se pierde algún párrafo por el camino, descarta el
resultado y maqueta solo lo que no necesita criterio). Va por tandas de 8 y es
idempotente, así que hay que pulsarlo hasta que avise de que no queda ninguno.

## Titulares

Un titular tiene que **contar lo que pasa: quién y qué**. El modelo había
cogido un tic —«X: cuando la afición reconoce el sacrificio de un ídolo»— que
evoca mucho y no dice nada. El problema no era la longitud: recortar eso a «La
Roma y su gesto de honor» lo deja corto y peor, porque ya no dice con quién. El
titular bueno es «La Roma y su gesto de honor con Ranieri», y uno largo se
justifica si cuenta algo («La Curva Nord de la Lazio convirtió el derby en una
batalla de carteles»).

Las reglas viven en `TITLE_RULES` (`src/lib/translate.ts`) y las comparten los
dos prompts, el que escribe el artículo y el que repasa un titular ya guardado,
para que no se contradigan. Las 14 palabras / 80 caracteres de
`MAX_TITLE_WORDS` y `MAX_TITLE_CHARS` son un **techo, no un objetivo**.

No se confía solo en el prompt:

1. `normalizeTitle()` limpia sin gastar llamada lo que se puede limpiar sin
   leer la noticia: comillas, punto final y el «cuando» (de apertura o colgado
   de los dos puntos). Quitarlo no quita información y suele dejar el titular
   ya bien. Lo que **no** hace es podar el subtítulo: eso acorta, pero se lleva
   por delante lo que el titular contaba.
2. Si aun así no cumple, `improveSpanishTitle()` se lo pasa a Claude **junto
   con el texto del artículo**, que es de donde sale lo que al titular le falta
   (el «con Ranieri» del ejemplo).

Los titulares que ya están guardados se repasan desde el dashboard con el botón
**«Arreglar titulares»**, que actúa sobre la pestaña en la que estés. En los
publicados cambia también el título en Shopify; el `handle` no se toca, así que
las URLs que ya estén circulando siguen funcionando. El tuit se reescribe solo
si todavía no se ha publicado (X no permite editar un tuit vivo). Va por tandas
de 12 y es idempotente: se pulsa hasta que avise de que no queda ninguno.

Ojo con lo que ese botón **no** puede hacer: detecta el «cuando» y el exceso de
largo, que se ven sin leer la noticia, pero no el titular corto y vago. Para
esos, edición a mano desde la ficha del artículo.

## Puesta en marcha local

Necesitas una base Postgres incluso en local (ver "Base de datos" abajo) —
la más simple es crear una gratis en [Neon](https://neon.tech) y usar la
misma cadena de conexión aquí y en producción.

```bash
npm install
cp .env.example .env   # rellena DATABASE_URL y el resto de variables (ver abajo)
npm run db:deploy      # aplica las migraciones a esa base Postgres
npm run db:seed        # carga el catálogo inicial de fuentes RSS
npm run dev
```

Abre `http://localhost:3000`, te redirige a `/login` (usa `DASHBOARD_PASSWORD`
de tu `.env`).

La agregación se lanza desde el botón «Buscar noticias ahora» del dashboard, o
por HTTP si prefieres verla en crudo:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/fetch
```

## Cuándo se rastrea

**No hay horario automático: se rastrea cuando tú lo pides.** El botón
**«Buscar noticias ahora»** de `/dashboard?status=PENDING` lee todas las
fuentes activas y añade a la cola lo que no estuviera ya. Tarda un rato (hay
que leer las fuentes y escribir con Claude cada noticia nueva), así que no te
extrañe que la página se quede pensando; al terminar avisa de cuántas ha
encontrado.

### Qué significa «ninguna noticia nueva»

El aviso del rastreo no se queda en el número: dice cuántos items nuevos traían
las fuentes, cuántos se han descartado por no encajar con el tema del blog,
cuántos han fallado y cuántos se han quedado para la siguiente pasada. Son
situaciones distintas y antes se veían todas igual:

- **«no había nada que no tuviéramos ya visto»** — las fuentes no han publicado
  nada nuevo desde el último rastreo (o lo publicado ya está en la cola).
- **«N descartado(s) por no encajar en el tema»** — sí había noticias, pero el
  filtro las ha considerado fuera de la cultura ultra/desplazamientos/moda
  casual. Están una a una en la pestaña **Descartadas**, con su enlace al
  original: si el filtro se pasó de estricto, «Volver a examinarla» la devuelve
  al próximo rastreo.
- **«N sin mirar todavía, vuelve a pulsar»** — cada pasada escribe como mucho
  cuatro artículos por fuente (`MAX_ARTICLES_PER_SOURCE`) y examina como mucho
  24 items (`MAX_EXAMINED_PER_SOURCE`), para no pasarse del límite de tiempo de
  Vercel. Lo que sobra se coge en la siguiente pulsación, no se pierde.
- **Banner rojo de error** — items que no se han podido procesar (falta
  `ANTHROPIC_API_KEY`, límite de uso de la API, red) o fuentes que no
  responden. Eso no es «no hay noticias»: es que no se ha podido mirar, y esos
  items se reintentan en el próximo rastreo.

Los descartes por tema se guardan en la tabla `SkippedItem` precisamente para
que el rastreo pueda avanzar: si no se anotaran, cada pasada volvería a
examinar los mismos items de cabecera del feed, los volvería a descartar y
nunca llegaría a las noticias que vienen detrás. Después de cambiar el criterio
del filtro conviene **vaciar la lista** desde la pestaña Descartadas, para que
lo antiguo se vuelva a examinar con el criterio nuevo.

Antes esto lo hacía un cron de GitHub Actions cada 3 horas, y se quitó a
propósito: llenaba la cola hubiera o no alguien para revisarla, y en el caso de
las fuentes de tipo «Cuenta de X» eso son lecturas de una API de pago ocho
veces al día. Rastrear justo cuando vas a revisar es lo mismo con menos gasto.
Como aviso, si dejas pasar mucho tiempo entre barridos puedes perderte noticias
de feeds que solo mantienen los últimos N elementos.

El workflow `.github/workflows/aggregate.yml` sigue existiendo como vía
alternativa, pero ya solo corre cuando se pulsa **«Run workflow»** en la
pestaña Actions del repo. Para recuperar el horario basta con devolverle el
bloque `schedule` que quedó comentado en el propio fichero. Ojo: los cron de
GitHub Actions se ejecutan con retraso (en este repo iban entre 1 y 2 horas
tarde), así que «cada 3 horas» nunca fue una hora fija.

## Variables de entorno

Ver `.env.example` para la lista completa. Las que requieren configuración
externa:

### 1. Shopify Admin API

La tienda `hoolsbrand.com` ya tiene un blog listo para esto: **"The Away
End"** (handle `the-away-end`, id `gid://shopify/Blog/127456543059`) — ya
está puesto por defecto en `.env.example`.

Desde 2026 Shopify mueve la creación de apps personalizadas al **Dev
Dashboard** y ya no expone un token fijo desde la interfaz — la app se
canjea Client ID + Client Secret por un access token de ~24h en cada
llamada (lo hace `src/lib/shopify.ts` automáticamente, no hay que tocar nada
en producción salvo tener las credenciales puestas).

1. Shopify Admin → **Configuración → Apps y canales de venta → Desarrollar apps → Desarrollar apps en Dev Dashboard**.
2. Crea una app (ej. "Blog Aggregator"), opción **"Empezar desde Dev Dashboard"**.
3. En **"Alcances"** (Access → Scopes) añade: `read_content,write_content,read_online_store_pages,write_online_store_pages,write_files,read_products`
   (`write_files` es el que permite subir fotos y vídeos a los Archivos de
   la tienda desde el panel; sin él todo lo demás sigue funcionando, pero esa
   subida falla y hay que dar la foto/vídeo por URL. `read_products` es el que
   permite que el resumen semanal (`/dashboard/newsletter`) saque la prenda y
   **su precio** de la tienda; sin él se cae a un catálogo escrito a mano en
   `src/lib/newsletter.ts`, que envejece, y el correo puede salir con un precio
   que ya no es el de la tienda — el panel avisa cuando pasa).
4. Marca **"Usar flujo de instalación heredado"** y publica la versión.
5. Instala la app en la tienda Hools (botón "Instalar app" en la vista general).
6. Ve a la pestaña **"Configuración"** de la app → **"Credenciales"** y copia
   **"ID de cliente"** → `SHOPIFY_CLIENT_ID` y **"Secreto"** → `SHOPIFY_CLIENT_SECRET`.
7. `SHOPIFY_STORE_DOMAIN` es el dominio `.myshopify.com` de la tienda:
   `s001ux-0y.myshopify.com` (ya puesto por defecto).

(La sección "Token de automatización de la app" que también aparece en esa
pantalla es para otro caso de uso — CI/CD del propio Shopify CLI — y **no**
sirve como credencial de la Admin API; no la uses aquí.)

### 1-bis. Prueba del resumen semanal (Resend, opcional)

El resumen semanal (`/dashboard/newsletter`) **no se envía desde el panel**:
la lista de suscriptores vive en Shopify y el correo sale por **Shopify Email**
(Shopify Admin → Apps → Shopify Email). Lo único que hace el panel es montar
el HTML.

Shopify Email y no Klaviyo, aunque la tienda tenga Klaviyo y Seguno
instaladas: Shopify Email envía contra la lista de clientes de la propia
tienda, así que no hay sincronización que cuadrar ni dominio que autenticar
aparte — el de la tienda ya lo está.

El panel da el correo en **dos cajas**:

- **HTML personalizado** (`htmlFragment`): la normal. Va dentro de una sección
  de HTML personalizado del editor. Sin cabecera de documento y sin línea de
  baja, porque de las dos cosas se encarga el editor.
- **Documento entero** (`html`): para «Crear con código», donde el correo es
  el documento completo. Trae las dos variables que Shopify exige ahí:
  `{{ unsubscribe_link }}` (la URL de baja, dentro de un `href`) y
  `{{ open_tracking_block }}` (el píxel de aperturas, antes de `</body>`).
  Sin ellas el editor no deja llegar a la pantalla de envío.

Pegar la segunda donde va la primera deja el correo con **dos enlaces de
baja**. Los nombres de esas variables salen de `UNSUBSCRIBE_URL` y
`OPEN_TRACKING_BLOCK` en `src/lib/newsletter.ts`, y no se adivinan: no son
`{{ unsubscribe }}` (que Shopify se come sin avisar, dejando el correo sin
enlace de baja) ni `{% unsubscribe %}`, que es el de Klaviyo. Si algún día se
cambia de herramienta, esas dos constantes son lo único que hay que tocar.

Antes de montar la campaña conviene ver el correo en una bandeja de verdad,
porque Gmail y Outlook recortan CSS que el navegador sí pinta y la vista
previa del panel no lo enseña. Hay dos formas:

- **Sin configurar nada:** pega el HTML en la campaña de Shopify Email y usa
  su botón de **enviar prueba** dentro del editor. Es además obligatorio
  hacerlo antes del envío real: el editor reescribe parte del HTML, así que lo
  que valida el botón del panel no es exactamente lo que acaba saliendo.
- **Con el botón del panel:** crea una cuenta gratuita en https://resend.com,
  genera una API key → `RESEND_API_KEY`, y aparecerá un botón "Enviar prueba"
  en `/dashboard/newsletter` que manda el correo sin pasar por Shopify. Sin la
  clave el botón simplemente no sale; nada más del panel depende de ella.

  Mientras no verifiques un dominio, Resend solo deja enviar a la dirección
  con la que creaste la cuenta. Si verificas `hoolsbrand.com` en Resend,
  pon el remitente en `NEWSLETTER_TEST_FROM`.

La prueba llega con `[PRUEBA]` delante del asunto, y donde el correo real
lleva el enlace de baja (la etiqueta que sustituye el editor) la prueba enseña
un aviso en rojo — recordatorio de que ese enlace tiene que salir sí o sí en
el envío real.

### 2. Traducción/reescritura en español (Claude)

1. Crea una cuenta en https://console.anthropic.com si no tienes una.
2. Genera una clave de API → `ANTHROPIC_API_KEY`.
3. Coste: para este volumen de noticias (decenas al día) es del orden de
   céntimos al mes con el modelo usado (Claude Haiku).

### 3. X (Twitter) API v2

1. Cuenta de desarrollador en https://developer.x.com (nota: publicar por API
   requiere un plan de pago de la API de X, incluso en el nivel más básico).
2. Crea una App con **User authentication settings → OAuth 1.0a** activado y
   permisos de **Read and Write**.
3. Genera "API Key & Secret" y "Access Token & Secret" (deben ser del propio
   usuario/cuenta de Hools, con permisos de escritura).
4. Rellena `TWITTER_API_KEY`, `TWITTER_API_SECRET`, `TWITTER_ACCESS_TOKEN`,
   `TWITTER_ACCESS_SECRET`.

Si estas variables no están configuradas, el sistema sigue publicando en el
blog de Shopify con normalidad y simplemente omite el tuit (no falla).

#### Editar el texto de un tuit ya publicado

La API de X **no permite editar un tuit publicado** (el botón de edición de la
web es exclusivo de Premium y no está expuesto en la API). Por eso, guardar un
texto nuevo en la ficha del artículo actualiza el blog y la base de datos, pero
no el tuit que ya está en X: la ficha avisa del desfase y ofrece
**«Actualizar el tuit en X»**, que borra el tuit anterior y publica uno nuevo
con el texto guardado. El tuit cambia de enlace y pierde likes, RTs y
respuestas, así que es un paso manual y no un efecto secundario de guardar.

Ese mismo botón sirve para publicar el tuit a posteriori cuando el artículo
salió en el blog pero X falló en ese momento.

#### Fuentes de tipo "Cuenta de X" (opcional)

Además de fuentes RSS, en `/dashboard/sources` puedes añadir una fuente de
tipo **"Cuenta de X"** indicando su `@handle` — el rastreo leerá sus tuits
recientes (sin RTs ni respuestas) igual que un feed. Esto necesita una
variable adicional:

5. En la misma App de X (pestaña "Keys and tokens" → "Autenticación Solo de
   Aplicación"), genera el **Bearer Token** → `TWITTER_BEARER_TOKEN`.

Ten en cuenta que leer líneas temporales de otras cuentas es una llamada de
pago adicional (aparte de la de publicar tuits) en el modelo de pago-por-uso
de X — el código minimiza las llamadas cacheando en cada fuente el id de
usuario resuelto y un cursor `since_id` para no releer tuits ya vistos (el
cursor solo avanza cuando la tanda entera se ha resuelto, para no dejar tuits
por detrás sin mirar), pero
aun así conviene vigilar el saldo en `console.x.com` si añades varias cuentas.
Si `TWITTER_BEARER_TOKEN` no está configurada, esas fuentes simplemente no
producen noticias nuevas (no rompen el resto del rastreo).

### Hasta dónde lee cada cuenta de X

El rastreo **no busca por fechas** en X: no pide «lo de hoy» ni «lo de las
últimas 24 horas». Pide *los tuits posteriores al último que ya leyó*, con un
tope de **8 por cuenta y pasada** (`MAX_RESULTS` en `src/lib/twitter-source.ts`;
el mínimo que admite la API es 5).

La consecuencia importante: el cursor solo avanza. Si una cuenta publica más de
8 tuits entre dos pasadas, la API devuelve los más nuevos y **el resto queda por
detrás del cursor de forma permanente**. Cuando una tanda viene llena, el
resumen del rastreo nombra la cuenta: es la señal de que hay que rastrear más a
menudo, o de que ese tope se queda corto.

Para volver atrás está el botón **«Volver a leer sus últimos tuits»** de cada
cuenta en `/dashboard/sources`: borra el cursor y la siguiente pasada relee sus
tuits recientes (no duplica nada, la deduplicación va por `guid`). La ficha de
la fuente muestra por dónde va el cursor en cada momento.


### 4. Instagram (opcional)

Al aprobar un artículo, si hay imagen y está configurado, también se publica
como foto en el feed de Instagram (con el mismo texto que el tuit, sin
enlace — Instagram no permite enlaces clicables en el pie de foto).
Instagram exige imagen siempre; si el artículo no tiene, se omite igual que
X cuando falta configuración.

1. La cuenta de Instagram debe ser **Business o Creator**, vinculada a una
   página de Facebook (Instagram → Configuración → Cuenta → Cambiar a
   cuenta profesional).
2. Crea una app en [developers.facebook.com](https://developers.facebook.com)
   (tipo "Empresa"), añade el caso de uso **"Administrar mensajes y
   contenido en Instagram"**.
3. Añade tu cuenta de Instagram como **Evaluador de Instagram** en Roles de
   la app, y acéptalo desde Instagram → Configuración → Aplicaciones y
   sitios web → Invitaciones para evaluadores.
4. En el propio caso de uso, punto "Genera identificadores de acceso",
   añade la cuenta y genera el **identificador de acceso** →
   `INSTAGRAM_ACCESS_TOKEN`. Ese mismo punto muestra el id numérico de la
   cuenta → `INSTAGRAM_USER_ID`.

A diferencia de X, la API de Instagram es **gratuita** (límite de 25
publicaciones/24h, muy por encima del volumen de este blog). El token dura
aproximadamente 60 días; cuando caduque, hay que generar uno nuevo desde el
mismo panel y actualizar la variable de entorno.

#### Facebook (opcional)

Publica en la página de Facebook de la marca al aprobar, con una casilla
propia en el panel. A diferencia de Instagram, aquí el enlace al artículo sí
es clicable, así que el post lleva texto + enlace (y la foto si la hay).
Usa la misma app de Meta:

1. Ve al [Explorador de la API Graph](https://developers.facebook.com/tools/explorer/),
   elige tu app y pide los permisos `pages_manage_posts`, `pages_read_engagement`
   y `pages_show_list`.
2. Genera un token de usuario, y con él consulta `me/accounts`: ahí aparece
   tu página con su `id` → `FACEBOOK_PAGE_ID` y su `access_token` (token **de
   página**) → `FACEBOOK_PAGE_ACCESS_TOKEN`.
3. Si generas el token de página a partir de un token de usuario de larga
   duración, el de página no caduca; si no, habrá que renovarlo cada ~60 días
   igual que el de Instagram.

También gratuita. Si estas variables no están configuradas, la casilla de
Facebook no aparece y el resto sigue funcionando igual.

### 5. Acceso al dashboard

`DASHBOARD_PASSWORD` (contraseña única de acceso) y `SESSION_SECRET` (cadena
aleatoria larga, ej. `openssl rand -hex 32`) — es una única persona/cuenta
administrando, no hay multiusuario.

## Base de datos

El esquema usa Postgres (`prisma/schema.prisma`), porque en Vercel (y en
cualquier hosting serverless) el disco no es persistente y SQLite perdería
los datos en cada despliegue. Usa una base gestionada gratuita, p.ej.
[Neon](https://neon.tech).

El propio `npm run build` aplica las migraciones (crea/actualiza las tablas) y
siembra el catálogo de fuentes (`prisma/seed.ts`, idempotente) antes de
compilar — así que en Vercel no hace falta ejecutar nada a mano: basta con
tener `DATABASE_URL` configurada como variable de entorno antes del primer
despliegue.

Las migraciones no van por `prisma migrate deploy` a pelo, sino por
`scripts/db-migrate.mjs`, que es lo mismo pero **reintentando si la base no
contesta**. Neon apaga la base del plan gratuito cuando lleva unos minutos sin
nadie conectado y tarda unos segundos en arrancar; Prisma se rinde a los cinco
y aborta el despliegue entero con un `P1001` sin que haya nada roto. El script
espera 2, 4, 8 y 16 segundos antes de darse por vencido. Un error que no sea de
conexión —una migración mal, unas credenciales mal— sigue fallando a la
primera, sin esperas inútiles.

## Despliegue recomendado (Vercel)

1. Crea una base en [Neon](https://neon.tech) y copia su cadena de conexión → `DATABASE_URL`.
2. En [vercel.com](https://vercel.com), importa este repositorio de GitHub.
3. Antes de desplegar, añade en "Environment Variables" todas las de
   `.env.example` (como mínimo `DATABASE_URL`, `DASHBOARD_PASSWORD`,
   `SESSION_SECRET`, `CRON_SECRET`; Shopify/X se pueden añadir después).
4. Despliega. La URL pública que te da Vercel (ej. `https://hools-blog.vercel.app`) es tu `APP_URL`.
5. Con eso ya puedes rastrear desde el botón «Buscar noticias ahora» del
   dashboard. Si además quieres poder lanzarlo desde GitHub, añade estos
   **secrets** al repositorio (Settings → Secrets and variables → Actions):
   - `APP_URL`: la URL del paso anterior
   - `CRON_SECRET`: el mismo valor que pusiste en Vercel

   El workflow `.github/workflows/aggregate.yml` llama a `/api/cron/fetch`, y
   solo corre cuando se pulsa «Run workflow» en la pestaña Actions (ver
   "Cuándo se rastrea" arriba).

## Gestión de fuentes

`/dashboard/sources` permite añadir/pausar fuentes (RSS o cuentas de X) sin
tocar código. El
catálogo inicial (`src/lib/sources.ts`, cargado por `npm run db:seed`) es un
punto de partida orientativo — verifica que cada feed responde XML válido y
que el contenido encaja con el tono de la marca antes de dejarlo en piloto
automático; algunos sitios cambian o retiran su RSS con el tiempo.

## ¿Por qué revisión manual y no 100% automático?

Publicar contenido de terceros y postear en las redes reales de la marca sin
supervisión tiene dos riesgos directos: derechos de autor sobre el contenido
original, y que un resumen mal generado o una noticia de mal gusto salga
publicada tal cual en el canal oficial de Hools. La cola de revisión mantiene
la automatización del rastreo (lo tedioso) sin ceder el control editorial.

## Próximos pasos posibles (no implementados)

- Instagram/Facebook (requieren cuenta Business + app en Meta for Developers;
  no incluido en este MVP, se pidió arrancar solo con X).
- Aviso por email/Slack cuando hay nuevos pendientes en la cola.
