# Radar AV — boletín quincenal de LAIA

Boletín interno de inteligencia de mercado con la identidad de LAIA. Vigila
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

## Cómo funciona

```
Viernes 06:00 UTC (GitHub Actions)
  └─ ¿Es 2.º o 4.º viernes? Si no, termina sin hacer nada.
       ├─ Google News + Bing News (búsquedas por marca) + prensa AV (rAVe, CI, AV Network, SVC, AVNation…)
       ├─ Filtro sin IA: fechas de la quincena, duplicados, consumo (ratones, gaming, bolsa…)
       ├─ Claude elige, clasifica y redacta en español con la «Lectura LAIA»
       ├─ HTML para correo (tablas + estilos en línea, adaptado a móvil)
       ├─ Envío por Resend a la lista de destinatarios (en copia oculta)
       └─ Archivo en laia-newsletter/ediciones/AAAA-MM-DD.html (+ artefacto descargable)
```

Sin dependencias: solo Node 20+ (`fetch` nativo). Si Claude falla, sale una
edición básica con los titulares originales en vez de no salir.

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
   - `LAIA_LOGO_URL` — URL https pública del logo en PNG blanco sobre
     transparente (unos 80 px de alto)
   - `LAIA_COLOR_INK`, `LAIA_COLOR_ACCENT`, `LAIA_COLOR_ACCENT_SOFT` —
     colores del manual de marca (hex)
   - Opcionales: `LAIA_SEND_FRIDAYS` (por defecto `2,4`), `LAIA_MODEL`
     (por defecto `claude-sonnet-5-5`)
3. Prueba: *Actions → Boletín Radar AV (LAIA) → Run workflow* con
   `send` desmarcado. Descarga el artefacto y revisa el HTML; cuando guste,
   lánzalo con `send` marcado.

> Los colores y el logo de `config.mjs` son **provisionales** hasta que se
> pongan los del manual de marca de LAIA.

## Ajustes habituales (`config.mjs`)

- **Marcas**: `competitors` — búsquedas, cómo se reconocen y el contexto AV
  que se exige (así se descartan los ratones de Logitech).
- **Exclusiones**: `excludePatterns`.
- **Fuentes del sector**: `sectorFeeds` y `sectorQueries`.
- **Agenda**: `agenda` (revisa las fechas cada temporada).

## En local

```bash
node laia-newsletter/generate.mjs --force          # genera con red real
node laia-newsletter/generate.mjs --fixture laia-newsletter/fixtures/muestra.json \
     --date 2026-10-09 --out laia-newsletter/muestra.html   # sin red
```
