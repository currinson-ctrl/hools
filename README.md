# Hools Blog — agregador de noticias con cola de revisión

Agrega noticias de afición/ultras, desplazamientos/viajes de hinchas y moda
casual desde feeds RSS, las deja en una **cola de revisión** privada, y al
aprobar una noticia la publica automáticamente:

- como artículo en el blog de Shopify de **hoolsbrand.com** (blog "The Away End"), y
- como tuit en **X** con el enlace al artículo publicado.

La aprobación es manual a propósito (ver "¿Por qué revisión manual?" abajo).
El rastreo de fuentes sí es automático, vía un cron de GitHub Actions.

## Cómo funciona

```
GitHub Actions (cron cada 3h)
        │  POST/GET /api/cron/fetch  (con CRON_SECRET)
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

Para probar la agregación en local sin esperar al cron:

```bash
curl -H "Authorization: Bearer <CRON_SECRET>" http://localhost:3000/api/cron/fetch
```

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
3. En **"Alcances"** (Access → Scopes) añade: `read_content,write_content,read_online_store_pages,write_online_store_pages`.
4. Marca **"Usar flujo de instalación heredado"** y publica la versión.
5. Instala la app en la tienda Hools (botón "Instalar app" en la vista general).
6. Ve a la pestaña **"Configuración"** de la app → **"Credenciales"** y copia
   **"ID de cliente"** → `SHOPIFY_CLIENT_ID` y **"Secreto"** → `SHOPIFY_CLIENT_SECRET`.
7. `SHOPIFY_STORE_DOMAIN` es el dominio `.myshopify.com` de la tienda:
   `s001ux-0y.myshopify.com` (ya puesto por defecto).

(La sección "Token de automatización de la app" que también aparece en esa
pantalla es para otro caso de uso — CI/CD del propio Shopify CLI — y **no**
sirve como credencial de la Admin API; no la uses aquí.)

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
usuario resuelto y un cursor `since_id` para no releer tuits ya vistos, pero
aun así conviene vigilar el saldo en `console.x.com` si añades varias cuentas.
Si `TWITTER_BEARER_TOKEN` no está configurada, esas fuentes simplemente no
producen noticias nuevas (no rompen el resto del rastreo).

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

El propio `npm run build` ejecuta `prisma migrate deploy` (crea/actualiza las
tablas) y siembra el catálogo de fuentes (`prisma/seed.ts`, idempotente) antes
de compilar — así que en Vercel no hace falta ejecutar nada a mano: basta con
tener `DATABASE_URL` configurada como variable de entorno antes del primer
despliegue.

## Despliegue recomendado (Vercel)

1. Crea una base en [Neon](https://neon.tech) y copia su cadena de conexión → `DATABASE_URL`.
2. En [vercel.com](https://vercel.com), importa este repositorio de GitHub.
3. Antes de desplegar, añade en "Environment Variables" todas las de
   `.env.example` (como mínimo `DATABASE_URL`, `DASHBOARD_PASSWORD`,
   `SESSION_SECRET`, `CRON_SECRET`; Shopify/X se pueden añadir después).
4. Despliega. La URL pública que te da Vercel (ej. `https://hools-blog.vercel.app`) es tu `APP_URL`.
5. En el repositorio de GitHub, añade estos **secrets** (Settings → Secrets and
   variables → Actions) para que el cron de agregación funcione:
   - `APP_URL`: la URL del paso anterior
   - `CRON_SECRET`: el mismo valor que pusiste en Vercel
6. El workflow `.github/workflows/aggregate.yml` llama a
   `/api/cron/fetch` cada 3 horas (ajustable) para rellenar la cola de
   revisión. También se puede lanzar a mano desde la pestaña "Actions" del repo.

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
