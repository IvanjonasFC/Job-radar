# 3 · Automatización: scraper + (worker | n8n)

> **Dos motores para la IA.** El bucle de puntuar + redactar lo puede llevar el **worker autónomo**
> (`automation/worker/`, un servicio Node de 3 piezas: Postgres + web + worker, sin n8n) **o** los **flujos
> de n8n** (`automation/n8n/`, con Telegram y vault). Ambos leen la config y escriben la misma BD; usa el que
> quieras o los dos. Las claves de IA van en **Config → IA** de la web (o en el `.env` del worker).
> Guía del worker: `automation/worker/README.md`.

Esta capa es **opcional** pero es la que hace el sistema "inteligente": mete ofertas solo y las procesa con IA. Todo está en [`automation/`](../automation/) con placeholders (sin datos reales).

---

## El scraper (`automation/scraper/`)

Recolector de ofertas basado en [JobSpy](https://github.com/Bunsly/JobSpy) (Indeed, LinkedIn…) + feeds RSS. Filtra por sector IT y por tu zona, deduplica por URL e inserta en `job_offers` con `status='nueva'`.

```bash
cd automation/scraper
cp .env.example .env      # rellena PG_* (BD)
docker compose up --build # ejecución puntual
```

**Obedece a la web:** con `SETTINGS_FROM_DB=1` (por defecto) lee portales, países, términos, zona y RSS de `empleo.settings`. Es decir: **lo que pongas en la pestaña Config manda**; el `.env` es solo respaldo.

Prográmalo 1–2 veces al día (cron del host, tarea del NAS, o un nodo `Schedule` de n8n).

---

## Los flujos de n8n (`automation/n8n/`)

Siete workflows. Impórtalos (UI: *Workflows → Import from File*, o por API REST) y rellena credenciales.

| Flujo | Disparador | Qué hace |
|---|---|---|
| `wf1-radar` | cron | Coge las `nueva`, las **puntúa con IA** (0–100 + veredicto + keywords), marca `evaluada`. |
| `wf2-digest` | cron | Manda por **Telegram** las mejores sin notificar. |
| `wf3-acciones` | webhook | Al "aplicar/generar": crea **carta + ajustes de CV** y los guarda en `generated`. |
| `wf4-healthcheck` | cron | Avisa por Telegram si la ingesta o el scoring se caen. |
| `wf5-recordatorios` | cron | Recuerda entrevistas y próximas acciones. |
| `wf6-ia-ondemand` | webhook | Genera **prep de entrevista** o **carencias** por oferta (`ai_docs`). |
| `wf7-guardar-carta` | webhook | Reescribe la carta `.md` (opcional; la carta se guarda igual en la BD). |

### Placeholders a rellenar

| Placeholder | Dónde | Qué poner |
|---|---|---|
| `<<< PON TU PERFIL AQUI >>>` | wf3, wf6 | Tu perfil — ver `automation/n8n/profile.example.md`. |
| `YOUR_TELEGRAM_BOT_TOKEN` | flujos Telegram | Token de tu bot (@BotFather). |
| `YOUR_TELEGRAM_CHAT_ID` | flujos Telegram | Tu chat id. |
| `example.com` | URLs webhook/gateway | Tu dominio de n8n. |

### Claves de IA (no van en el JSON)
Los nodos `Code` leen las keys del entorno de n8n: `$env['GROQ_API_KEY']`, `$env['GEMINI_API_KEY']`, etc. Añádelas al `.env` del contenedor n8n y pon `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Vale cualquier proveedor compatible con OpenAI (Groq, Gemini, Ollama local…): cambias URL base + modelo + key en el nodo.

---

## Cablear el perfil desde la base de datos (recomendado)

Por defecto el perfil está fijo dentro de wf3/wf6. Para que usen el que editas en **Config** (y así el sistema sea 100% modular), añade al inicio de cada flujo un nodo **Postgres → Execute Query**:

```sql
SELECT data->>'perfil' AS perfil,
       data->>'nombre' AS nombre,
       data->>'email'  AS email
FROM empleo.settings WHERE id = 1;
```

Y en el nodo `Code`, sustituye el bloque del perfil por el valor recibido. Por ejemplo, en `wf3` cambia la constante del perfil por:

```js
const PERFIL = ($('DB leer perfil').first().json.perfil || '').split('\n');
```

(usa el nombre real del nodo Postgres que hayas creado). A partir de ahí, editar tu perfil en la web actualiza toda la IA sin tocar los flujos.

> Mientras no lo cablees, el sistema **sigue funcionando**: las cartas se generan con el perfil fijo del flujo. El cableado solo cambia *de dónde* sale el perfil.

---

## Cómo la web dispara a n8n

Los botones **Aplicar / Generar CV / Analizar / Preparar entrevista** hacen `POST` a `${N8N_WEBHOOK_BASE}/...`. Si `N8N_WEBHOOK_BASE` está vacío, esos botones no hacen nada (pero el kanban, notas, carta y mover siguen funcionando: son escritura directa a la BD).

## Telegram desde una red sin salida
Si tu n8n no tiene internet directo, no llames a `api.telegram.org`: pon una **pasarela** (Caddy/Nginx en el host) que reenvíe `/(bot<token>)/<método>` a Telegram, y apunta los flujos a esa URL.
