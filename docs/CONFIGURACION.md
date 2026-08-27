# Configuración — adáptalo a tu búsqueda

> **Lo más fácil: la pestaña _Config_ de la web** (`/configuracion`). Desde ahí defines tu zona, qué modalidades aceptas dentro y fuera de ella, el score mínimo de la "cola de hoy" y las palabras clave — y la web lo aplica al instante. Requiere la tabla `empleo.settings` (incluida en `db/schema.sql`; si tu BD ya existía, créala con el snippet de abajo).
>
> ```sql
> CREATE TABLE IF NOT EXISTS empleo.settings (id smallint PRIMARY KEY DEFAULT 1, data jsonb NOT NULL DEFAULT '{}'::jsonb, updated_at timestamptz NOT NULL DEFAULT now(), CONSTRAINT settings_single_row CHECK (id=1));
> INSERT INTO empleo.settings (id,data) VALUES (1,'{}') ON CONFLICT (id) DO NOTHING;
> GRANT INSERT, UPDATE ON empleo.settings TO empleo_web;
> ```

Para lo que la web no cubre (scraper, prompts de IA, etc.), la tabla siguiente dice **qué tocar** en el código.

| Quiero cambiar… | Tócalo aquí |
|---|---|
| **Conexión a la BD** | `.env` → `DATABASE_URL` (usuario `empleo_web`). El esquema se crea con `db/schema.sql`. |
| **Contraseña del rol web** | `db/schema.sql` (`CHANGE_ME`) o `ALTER ROLE empleo_web PASSWORD '...';` |
| **Nombre/marca de la cabecera** | `src/data/site.ts` → `titular` (sale como “Empleo &lt;titular&gt;”) y `marca`. |
| **Dominio del sitio** | `src/data/site.ts` → `dominio` y `astro.config.mjs` → `site`. |
| **Login (contraseña)** | `.env` → `APP_PASSWORD` (+ `AUTH_SECRET`). Vacío = sin login (LAN/VPN). |
| **Qué se puntúa/descarta en n8n** | **Pestaña _Config_ → Afinado del scoring** (wf1 lo lee de la BD) o las listas del propio `wf1-radar.json`. |
| **Puerto** | `.env` → `PORT` (por defecto 3010) y `astro.config.mjs`. |
| **Colores / tema** | `src/styles/global.css`, bloque `@theme` (acento en `--color-primary`). |
| **Tu zona local** (para el 📍 y “cerca de ti”) | Config -> seccion "Ciudades / regiones locales" (`local_cities`); se aplica sin tocar codigo. |
| **Qué considera “remoto/híbrido/presencial”** | `src/lib/loc.ts` → `REMOTO_RX` / `HIBRIDO_RX` / `PRESEN_RX`. |
| **Ciudades/portales del scraper** | **Pestaña _Config_ → Fuentes de scraping** (el scraper lo lee de la BD si `SETTINGS_FROM_DB=1`). O en `automation/scraper/.env` si prefieres env. |
| **Qué puestos incluir/excluir** | `automation/n8n/wf1-radar.json`, nodo *Prefiltro* → arrays `INCLUDE` / `EXCLUDE` / `NONIT` / `LOCAL`. |
| **Rúbrica de puntuación IA** (pesos, umbrales) | `automation/n8n/wf1-radar.json`, nodo de scoring → variable `SYS` (el prompt del sistema). |
| **Tu perfil para cartas/CV** | `automation/n8n/profile.example.md` → pégalo en `wf3-acciones.json` y `wf6-ia-ondemand.json` (marcador `<<< PON TU PERFIL AQUI >>>`). |
| **Modelos/proveedores de IA** | En cada workflow, array `providers` (Groq, Gemini, Grok, Ollama). Claves por `$env` en n8n. |
| **Webhooks de acciones** | `.env` → `N8N_WEBHOOK_BASE`. Las rutas en los workflows son `empleo-hook-<accion>` (cámbialas si quieres). |
| **Telegram (avisos)** | En los workflows, `YOUR_TELEGRAM_BOT_TOKEN` y `YOUR_TELEGRAM_CHAT_ID`. |

## Mínimo para arrancar solo el CRM (sin IA ni scraper)

1. `psql ... -f db/schema.sql` (crea el esquema y el rol).
2. `cp .env.example .env` y pon tu `DATABASE_URL`.
3. `npm install && npm run dev` → http://localhost:3010
4. Inserta ofertas a mano (o conecta el scraper): basta con `title, company, url, score, status='evaluada'` en `empleo.job_offers`. El resto de la UI se llena sola.

## Añadir la automatización (opcional)

Sigue [`../automation/README.md`](../automation/README.md): levanta el scraper, importa los 6 workflows en n8n, pega tu perfil y configura las claves de IA y Telegram. En `.env` del CRM pon `N8N_WEBHOOK_BASE` para activar los botones *Aplicar / Generar CV / Analizar*.
