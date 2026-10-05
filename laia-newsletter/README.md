# Radar AV — boletín quincenal de LAIA

Boletín interno de inteligencia de mercado con la identidad de LAIA, según
su «Brand Style Guide» (Laia Red, degradado rojo, Dark Blue, Mandau +
Poppins, logos oficiales en `assets/` y barra final con «A European
Company»). La guía resumida para cualquier otra pieza de LAIA está en
`.claude/skills/laia-brand/` y empaquetada en `laia-brand.skill`. Vigila
sobre todo a **PTZOptics, AVer, Avonic, Logitech y Poly (HP)**, más el sector
AV profesional, y sale solo **el 2.º y el 4.º viernes de cada mes**.

Solo entran noticias AV profesionales: si Logitech saca un ratón o Poly un
auricular de consumo, no aparece (lo quitan primero un filtro de palabras y
después Claude).

`muestra.html` es una edición de ejemplo hecha a mano con noticias reales,
para ver el diseño sin esperar al primer envío.

## Qué trae cada edición

| Bloque | Qué es |
|---|---|
| Portada | Titular de la quincena y un editorial de 2-3 frases |
| Termómetro de la competencia | Las 5 marcas con su nivel de actividad (en calma / activo / muy activo) |
| En portada | La noticia de mayor impacto para LAIA, con imagen cuando la hay |
| Marca a marca | Hasta 3 noticias por marca, con categoría e impacto |
| **Lectura LAIA** | En cada noticia: qué significa para LAIA (amenaza, oportunidad, argumento de venta) |
| El dato / La tendencia | Una cifra llamativa de la quincena y el patrón que se repite |
| Radar del sector | Noticias AV relevantes fuera de las 5 marcas |
| Agenda | Cuenta atrás a las próximas ferias (ISE, InfoComm…) |
| Fuentes de esta edición | Índice numerado con medio, fecha, titular y enlace de cada noticia |

Cada noticia lleva además, bajo el titular, su línea **FUENTE** (medio ·
dominio · fecha) con enlace al original, y la imagen destacada indica de
qué medio sale.

## Versiones descargables

Cada edición se guarda en dos formatos en `ediciones/`:

- `AAAA-MM-DD.html` — con los logos dentro: se descarga y se abre en
  cualquier navegador, sin conexión.
- `AAAA-MM-DD.pdf` — A4, listo para imprimir o reenviar. Además va adjunto
  en el correo y en el artefacto de cada ejecución de Actions.
- `AAAA-MM-DD.eml` — el boletín como **correo ya montado** (cuerpo con el
  diseño, logos dentro y el PDF adjunto) para enviarlo **desde tu propio
  buzón**:
  - **Outlook (Windows o Mac)**: doble clic en el `.eml` → se abre como
    borrador → rellena «Para» → Enviar.
  - **Apple Mail**: abre el `.eml` → menú *Mensaje → Enviar de nuevo*.
  - **Gmail / Outlook web**: no abren `.eml` como borrador; usa Outlook o
    Apple Mail de escritorio, o adjunta el PDF.

## Cómo funciona

```
Viernes 06:00 UTC (GitHub Actions)
  └─ ¿Es 2.º o 4.º viernes? Si no, termina sin hacer nada.
       ├─ Google News + Bing News (búsquedas por marca) + prensa AV (rAVe, CI, AV Network, SVC, AVNation…)
       ├─ Filtro sin IA: fechas de la quincena, duplicados, consumo (ratones, gaming, bolsa…)
       ├─ Claude elige, clasifica y redacta en español con la «Lectura LAIA»
       ├─ HTML para correo (tablas + estilos en línea, adaptado a móvil)
       ├─ Envío por Resend a la lista de destinatarios (en copia oculta)
       └─ Archivo en laia-newsletter/ediciones/AAAA-MM-DD.html y .pdf (+ artefacto descargable)
```

Sin dependencias: solo Node 20+ (`fetch` nativo). Si Claude falla, sale una
edición básica con los titulares originales en vez de no salir.

## Preguntas al equipo (Zoho Forms)

Los correos no admiten formularios dentro (Outlook y Gmail los bloquean),
así que cada pregunta se pinta con **un botón por respuesta**. Al pulsarlo se
abre un formulario de Zoho Forms con la edición, la noticia, la pregunta y la
respuesta ya rellenadas; la persona añade un comentario si quiere y envía.

Claude propone hasta 3 preguntas por edición (la destacada y 2 noticias de
impacto alto) y al final siempre sale «¿Te ha resultado útil este número?».

**Montaje en Zoho Forms (una sola vez):**

1. Crea un formulario «Radar AV – Respuestas» con estos campos de tipo
   *Una línea* y, en *Propiedades del campo*, este **Nombre de enlace**:
   `Edicion`, `Noticia`, `Pregunta`, `Respuesta`. Añade un campo
   *Multilínea* «Comentario» (opcional) y uno *Correo electrónico* o
   *Nombre* si queréis saber quién responde.
2. *Compartir → Enlace público* (o *Compartir con la organización* si solo
   lo usáis dentro de Zoho One): copia el **permalink**.
3. En GitHub, *Variables*: `LAIA_FORM_URL` = ese permalink. Si usaste otros
   nombres de enlace, defínelos en `LAIA_FORM_FIELD_EDITION`,
   `LAIA_FORM_FIELD_NEWS`, `LAIA_FORM_FIELD_QUESTION` y
   `LAIA_FORM_FIELD_ANSWER`.
4. Las respuestas se ven en *Informes* de Zoho Forms (filtrables por edición
   y noticia). Con Zoho Analytics o Zoho Flow se pueden llevar a un panel o
   avisar por Cliq/correo cuando alguien responde.

Sin `LAIA_FORM_URL` el boletín sale sin preguntas.

## Puesta en marcha

1. **Lleva este workflow a la rama por defecto** (`main`). GitHub solo
   ejecuta los horarios desde ahí.
2. En el repo, *Settings → Secrets and variables → Actions*:

   **Secrets**
   - `ANTHROPIC_API_KEY` — clave de https://console.anthropic.com
   - `RESEND_API_KEY` — clave de https://resend.com
   - `LAIA_NEWSLETTER_TO` — destinatarios separados por comas

   **Variables** (pestaña *Variables*)
   - `LAIA_NEWSLETTER_FROM` — remitente, p. ej. `Radar AV <radar@laiatech.com>`
     (el dominio tiene que estar verificado en Resend; sin esto se usa
     `onboarding@resend.dev`, que solo deja enviar al dueño de la cuenta)
   - `LAIA_ASSETS_URL` (opcional) — URL pública donde estén los PNG de
     `assets/`. Sin ella, los logos van adjuntos dentro del correo (cid:),
     que funciona en Gmail y Outlook sin alojar nada.
   - Opcionales: `LAIA_SEND_FRIDAYS` (por defecto `2,4`), `LAIA_MODEL`
     (por defecto `claude-sonnet-5-5`)
3. Prueba: *Actions → Boletín Radar AV (LAIA) → Run workflow* con
   `send` desmarcado. Descarga el artefacto y revisa el HTML; cuando guste,
   lánzalo con `send` marcado.

## Ajustes habituales (`config.mjs`)

- **Marcas**: `competitors` — búsquedas, cómo se reconocen y el contexto AV
  que se exige (así se descartan los ratones de Logitech).
- **Exclusiones**: `excludePatterns`.
- **Fuentes del sector**: `sectorFeeds` y `sectorQueries`.
- **Agenda**: `agenda` (revisa las fechas cada temporada).

## En local

```bash
node laia-newsletter/generate.mjs --force --pdf    # genera con red real (+ PDF; CHROME_PATH si hace falta)
node laia-newsletter/generate.mjs --fixture laia-newsletter/fixtures/muestra.json \
     --date 2026-10-09 --out laia-newsletter/muestra.html   # sin red
```
