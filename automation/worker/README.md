# Worker autónomo (alternativa a n8n)

Un servicio Node **sin dependencias pesadas** (solo `pg`) que hace lo mismo que los flujos de n8n para el
bucle principal, **sin necesitar n8n**:

- **Puntúa** las ofertas nuevas con IA (= WF1).
- **Genera** carta + ajustes de CV (= WF3) y **prep de entrevista / carencias** (= WF6).
- **Aplicar / descartar** (estado + candidatura en la BD).
- **Ingesta RSS opcional** → con esto un montaje básico no necesita ni el scraper Python ni n8n.

Escribe todo en la misma BD `empleo`, así que la **web funciona igual**. Puedes usar **el worker, n8n, o los
dos a la vez** (ambos leen la config y escriben la misma BD).

## Por qué existe

n8n es potente pero pesado de reproducir (montar n8n + pasarela TLS + importar 7 flujos). El worker reduce
el sistema a **3 piezas**: Postgres + web + worker. Ideal para que cualquiera lo despliegue rápido.

## Puesta en marcha

```bash
cd automation/worker
cp .env.example .env      # pon tu DATABASE_URL (y claves IA si no las pones en la web)
npm install
npm start                 # servidor en :8080 + bucle de scoring
```

O con Docker:
```bash
docker build -t empleo-worker .
docker run -d --env-file .env -p 8080:8080 --name empleo-worker empleo-worker
```

### Conectar la web al worker (drop-in)
La web llama a `${N8N_WEBHOOK_BASE}-generar|-aplicar|-descartar|-ia|-radar`. Apunta esa variable al worker:

```
N8N_WEBHOOK_BASE=http://empleo-worker:8080/empleo
```

y el worker responde a `/empleo-generar?id=…`, `/empleo-aplicar?id=…`, etc. **Sin cambiar la web.**

## Claves de IA

Las lee de la pestaña **Config → IA** de la web (`empleo.settings`) y, si no, del `.env`. Con **una sola**
(p. ej. Groq) basta; el resto son fallback. Proveedores compatibles con OpenAI: Groq, Gemini, xAI, y Ollama
local (sin clave). Endpoints por defecto ya puestos; solo hace falta la clave.

## Uso por CLI (sin servidor)

```bash
node src/cli.js score 30              # puntúa 30 ofertas nuevas
node src/cli.js ingest                # lee los feeds RSS de Config
node src/cli.js generar 123           # genera carta/CV de la oferta 123
node src/cli.js ia 123 entrevista     # prep de entrevista (o 'carencias')
```

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | estado |
| GET | `…-radar` | ingesta (si `INGEST_RSS=1`) + puntúa un lote |
| GET | `…-generar?id=N` | carta + CV |
| GET | `…-aplicar?id=N` | marca aplicada + candidatura |
| GET | `…-descartar?id=N` | descarta |
| GET | `…-ia?id=N&tipo=entrevista\|carencias` | documento IA |

## Qué NO hace (a propósito)

- No escribe los `.md` en el vault de Obsidian (eso es específico de n8n/WF3-WF7; la carta ya está en la BD).
- No manda Telegram (opcional; usa n8n si lo quieres).

Para esas extras, usa n8n en paralelo. Para el CRM funcional, el worker basta.
