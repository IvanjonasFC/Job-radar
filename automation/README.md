# Automatización (ingesta + IA)

Capa **opcional** que alimenta el CRM: detecta ofertas, las puntúa con IA, genera cartas/ajustes de CV y manda avisos por Telegram. El CRM web funciona sin esto (puedes insertar ofertas a mano), pero aquí está todo para replicar el sistema completo.

```
Scraper (JobSpy + RSS) ──insert──► Postgres (empleo.job_offers)
                                         │
                                    n8n (wf1..wf6)
                     puntúa · genera carta/CV · avisa · recordatorios
                                         │
                                    CRM web (../)
```

> ⚠️ Los flujos y el scraper usan **placeholders**. Sustitúyelos por tus valores antes de usar. No hay secretos reales en este repo.

---

## Dos motores intercambiables (elige uno o ambos)

El bucle de IA (puntuar + redactar) lo puede mover **n8n** o el **worker autónomo**. Ambos leen la config
y escriben la misma BD, así que la web funciona igual con cualquiera:

- **`worker/`** — un servicio Node ligero (solo `pg`). Reduce el sistema a **Postgres + web + worker**, sin
  n8n ni pasarelas. Ideal para que cualquiera lo despliegue rápido. Puede además ingestar RSS (sin el
  scraper Python). Ver [`worker/README.md`](./worker/README.md).
- **`n8n/`** — los 7 flujos. Añade Telegram, escritura en el vault Obsidian y automatizaciones visuales.

Las **claves de IA** se ponen en la pestaña **Config → IA** de la web (o en el `.env` del worker). Con una
basta; el resto es fallback.

## Componentes

### `scraper/` — recolector de ofertas
Basado en [JobSpy](https://github.com/Bunsly/JobSpy) (Indeed, LinkedIn…) + feeds RSS. Filtra por sector IT y por tu zona (remoto nacional + local), deduplica por URL e inserta en `empleo.job_offers`.

```bash
cd scraper
cp .env.example .env      # rellena PG_* y ajusta SEARCH_TERMS / HOME_LOCATION
docker compose up --build # ejecución puntual (restart: "no")
```

Prográmalo (cron del host, tarea del NAS, o un `schedule` de n8n) 1–2 veces al día. Variables en `.env.example`.

### `n8n/` — flujos de automatización
Seis workflows de [n8n](https://n8n.io). Impórtalos y rellena credenciales/variables.

| Flujo | Qué hace |
|---|---|
| `wf1-radar.json` | Lee ofertas nuevas, las **puntúa con IA** (encaje 0–100 + veredicto + keywords) y marca `evaluada`. |
| `wf2-digest.json` | Manda un **resumen por Telegram** de las mejores ofertas sin notificar. |
| `wf3-acciones.json` | Al pulsar “aplicar/generar”: crea **carta + ajustes de CV** con IA y los guarda en `empleo.generated`. |
| `wf4-healthcheck.json` | Cron diario: avisa por Telegram si la ingesta o la puntuación se han caído. |
| `wf5-recordatorios.json` | Recuerda entrevistas y próximas acciones pendientes. |
| `wf6-ia-ondemand.json` | Webhook: genera **prep de entrevista** o **análisis de carencias** por oferta (`empleo.ai_docs`). |
| `wf7-guardar-carta.json` | Reescribe la carta `.md` en el vault cuando la editas en la web *(opcional; la carta se guarda igual en la BD)*. |

---

## Cómo importar los flujos a n8n

### Opción A — Interfaz (rápido)
1. En n8n: **Workflows → Import from File** y selecciona cada `wf*.json`.
2. Abre cada flujo y **reconecta las credenciales** (Postgres, y el modelo IA que uses).
3. Revisa los nodos `Code`: sustituye los marcadores (perfil, token, chat id, dominio).
4. **Activa** el flujo.

### Opción B — API REST (reproducible)
n8n expone una API. Con una API key (*Settings → n8n API → Create*):

```bash
N8N=https://tu-n8n.example.com/api/v1
KEY=xxxxx   # tu API key

# Importar/crear un flujo
curl -s -X POST "$N8N/workflows" -H "X-N8N-API-KEY: $KEY" \
  -H "content-type: application/json" --data @n8n/wf1-radar.json

# Actualizar uno existente
curl -s -X PUT "$N8N/workflows/<id>" -H "X-N8N-API-KEY: $KEY" \
  -H "content-type: application/json" --data @n8n/wf3-acciones.json

# Activar
curl -s -X POST "$N8N/workflows/<id>/activate" -H "X-N8N-API-KEY: $KEY" -d '{}'
```

---

## Qué tienes que rellenar (placeholders)

| Placeholder | Dónde | Qué poner |
|---|---|---|
| `<<< PON TU PERFIL AQUI >>>` | `wf3`, `wf6` (nodos Code) | Tu perfil real — ver [`n8n/profile.example.md`](./n8n/profile.example.md). |
| `YOUR_TELEGRAM_BOT_TOKEN` | flujos con Telegram | Token de tu bot ([@BotFather](https://t.me/BotFather)). |
| `YOUR_TELEGRAM_CHAT_ID` | flujos con Telegram | Tu chat id (habla con tu bot y mira `getUpdates`). |
| `example.com` | URLs de webhook/gateway | Tu dominio de n8n / pasarela. |
| `YOUR_USER` | enlaces GitHub | Tu usuario. |

### Perfil desde la base de datos (recomendado)
En vez de dejar el perfil fijo en el nodo `Code`, puedes hacer que `wf3`/`wf6` lo lean de la BD (lo que edites en la pestaña **Config** de la web). Añade al inicio del flujo un nodo **Postgres → Execute Query**:

```sql
SELECT data->>'perfil' AS perfil, data->>'nombre' AS nombre, data->>'email' AS email
FROM empleo.settings WHERE id = 1;
```

Y en el nodo `Code`, sustituye el marcador del perfil por el valor recibido (`$json.perfil`). Así el sistema es **modular**: cambias tu perfil en la web y toda la IA lo usa, sin tocar los flujos.

### Claves de IA
Los flujos leen las API keys de IA del **entorno de n8n** con `$env['GROQ_API_KEY']`, `$env['GEMINI_API_KEY']`, etc. (no van en el JSON). Añádelas al `.env` de tu contenedor n8n y pon `N8N_BLOCK_ENV_ACCESS_IN_NODE=false`. Puedes usar cualquier proveedor compatible con OpenAI (Groq, Gemini, un modelo local con Ollama…): cambia URL base + modelo + key en el nodo `Code`.

### Telegram desde una red sin salida
Si tu n8n corre en una red **sin acceso a internet** (p. ej. detrás de un firewall), no llames a `api.telegram.org` directo: pon una **pasarela** (Caddy/Nginx en el host) que reenvíe `/(bot<token>)/<método>` a Telegram, y apunta los flujos a esa URL.

---

## Ciclo de vida de una oferta

```
nueva ──wf1──► evaluada ──wf2──► notificada ──(aplicar)──► generada ──► aplicada
                                                                         │
                                                    (+ descartada / caducada)
```

El CRM web y los flujos escriben todos sobre la **misma BD**. Esa es la única fuente de verdad.
