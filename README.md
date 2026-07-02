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

Cada noticia agregada NO copia el artículo original completo: genera un
resumen corto + una cita breve + un enlace "Fuente: ..." al medio original.
Esto es intencional por derechos de autor — revisa y ajusta el texto en el
dashboard antes de aprobar si hace falta.

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

Para conseguir el token de acceso:

1. Shopify Admin → **Configuración → Apps y canales de venta → Desarrollar apps**.
2. Crea una app (ej. "Blog Aggregator").
3. En "Configuración de API Admin", concede estos scopes:
   `read_content`, `write_content`, `read_online_store_pages`, `write_online_store_pages`.
4. Instala la app y copia el **Admin API access token** → `SHOPIFY_ADMIN_ACCESS_TOKEN`.
5. `SHOPIFY_STORE_DOMAIN` es el dominio `.myshopify.com` de la tienda:
   `s001ux-0y.myshopify.com` (ya puesto por defecto).

### 2. X (Twitter) API v2

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

### 3. Acceso al dashboard

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

`/dashboard/sources` permite añadir/pausar fuentes RSS sin tocar código. El
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

- Generación de resúmenes con un LLM en vez de recorte simple del snippet RSS.
- Instagram/Facebook (requieren cuenta Business + app en Meta for Developers;
  no incluido en este MVP, se pidió arrancar solo con X).
- Aviso por email/Slack cuando hay nuevos pendientes en la cola.
