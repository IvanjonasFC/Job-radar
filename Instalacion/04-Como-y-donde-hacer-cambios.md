# 4 · Cómo y dónde hacer cambios

Mapa práctico: **"quiero cambiar X → se toca aquí"**. La regla general: si es *comportamiento de búsqueda* se cambia en **Config** (web); si es *estructura o lógica* se cambia en el código.

## Desde la web (sin tocar código) — pestaña Config

Todo esto se guarda en `empleo.settings` y lo aplican web + scraper + n8n al momento (el scraper, en su siguiente ejecución):

| Quiero… | Sección de Config |
|---|---|
| Cambiar mi zona o ciudades locales | 1 · Tu zona y modalidades |
| Aceptar/rechazar presencial, híbrido o remoto | 1 · modalidades (dentro y fuera de zona) |
| Añadir/quitar portales, países o puestos | 2 · Fuentes de scraping |
| Cambiar antigüedad máxima o nº de resultados | 2 · Fuentes de scraping |
| Añadir feeds RSS | 2 · Feeds RSS extra |
| Subir/bajar el score de la "cola de hoy" | 3 · Preferencias de la web |
| Cambiar mi nombre, contacto o CV para la IA | 4 · Tu perfil |
| Afinar keywords de scoring (títulos sí/no) | Bloque avanzado (al final) |

El panel de KPIs de arriba de Config te muestra el **impacto** de cada cambio (cuántas ofertas encajan, de tu zona, etc.).

## En el código de la web

| Quiero… | Fichero |
|---|---|
| Cambiar el valor por defecto de un ajuste | `src/lib/config.ts` (`DEFAULTS`) |
| Añadir un ajuste nuevo | `src/lib/config.ts` (tipo + `DEFAULTS`) → `src/pages/api/config.ts` (parseo) → `src/pages/configuracion.astro` (control) |
| Cambiar cómo se decide si una oferta "encaja" | `src/lib/config.ts` (`matchPref`, `esLocal`) |
| Cambiar cómo se limpia/normaliza la ubicación | `src/lib/loc.ts` |
| Cambiar colores, tipografías, glass | `src/styles/global.css` (bloque `@theme`) |
| Cambiar la marca o el menú | `src/data/site.ts` y `src/layouts/Base.astro` |
| Cambiar una consulta (qué ofertas se listan) | `src/lib/queries.ts` |
| Cambiar una página (Hoy, Ofertas, Pipeline…) | `src/pages/*.astro` |
| Añadir/editar un endpoint (aplicar, mover…) | `src/pages/api/*.ts` |

## En la base de datos

| Quiero… | Dónde |
|---|---|
| Añadir una columna o tabla | `db/schema.sql` (con `IF NOT EXISTS`) y reejecutar |
| Cambiar permisos de la web | `db/schema.sql` (bloque `GRANT ... TO empleo_web`) |
| Cambiar la contraseña de la web | `ALTER ROLE empleo_web PASSWORD '...'` + `.env` |

## En la automatización

| Quiero… | Dónde |
|---|---|
| Cambiar qué busca el scraper | Config (recomendado) o `automation/scraper/.env` |
| Cambiar el modelo/proveedor de IA | nodo `Code` del flujo (URL base + modelo + key) |
| Cambiar el prompt de las cartas | nodo `Code` de `wf3-acciones` |
| Que la IA use el perfil de la web | cablear wf3/wf6 a `settings` ([doc 3](./03-Automatizacion-flujos-scraper.md)) |
| Cambiar cada cuánto corre el scraper/flujos | cron del host / nodo `Schedule` de n8n |

---

## Regla de oro

- **Comportamiento del día a día** (qué ofertas, de dónde, mi perfil) → **Config**.
- **Estructura o lógica nueva** → código + `db/schema.sql`, y **anótalo** en la bitácora del proyecto para no repetir errores.
