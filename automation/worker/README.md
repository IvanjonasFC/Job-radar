# Worker autónomo (alternativa a n8n)

Un servicio Node **sin dependencias pesadas** (solo `pg`) que hace lo mismo que los flujos de n8n para el
bucle principal, **sin necesitar n8n**:

- **Puntúa** las ofertas nuevas con IA (= WF1).
- **Genera** carta + ajustes de CV (= WF3) y **prep de entrevista / carencias** (= WF6).
- **Aplicar / descartar** (estado + candidatura en la BD).
- **Ingesta RSS opcional** → con esto un montaje básico no necesita ni el scraper Python ni n8n.
- **Digest** → `_TABLERO.md` + `candidaturas.csv` (= WF2).
- **Healthcheck** + **caduca ofertas >30 días** (= WF4).
- **Recordatorios** de seguimiento (= WF5), desde la tabla `applications`.
- **Export a ficheros** de ficha + carta + ajustes de CV al vault (= WF3/WF7).

Escribe todo en la misma BD `empleo`, así que la **web funciona igual**. Puedes usar **el worker, n8n, o los
dos a la vez** (ambos leen la config y escriben la misma BD).

> **Paridad con n8n:** el worker cubre **todo lo que hace tu montaje n8n salvo los avisos por Telegram**.
> El detalle completo (qué hace cada uno, qué se añadió y las diferencias menores) está en
> [`PARIDAD-n8n.md`](./PARIDAD-n8n.md).

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
node src/cli.js generar 123           # genera carta/CV de la oferta 123 (+ export .md)
node src/cli.js ia 123 entrevista     # prep de entrevista (o 'carencias')
node src/cli.js guardar-carta 123     # reescribe la carta en el vault (WF7)
node src/cli.js digest                # regenera _TABLERO.md + candidaturas.csv (WF2)
node src/cli.js health                # healthcheck + caduca ofertas >30d (WF4)
node src/cli.js recordatorios         # recalcula _RECORDATORIOS.md (WF5)
```

## Endpoints

| Método | Ruta | Qué hace |
|---|---|---|
| GET | `/health` | estado |
| GET | `…-radar` | ingesta (si `INGEST_RSS=1`) + puntúa un lote |
| GET | `…-generar?id=N` | carta + CV (+ export .md) |
| GET | `…-aplicar?id=N` | marca aplicada + candidatura |
| GET | `…-descartar?id=N` | descarta |
| GET | `…-ia?id=N&tipo=entrevista\|carencias` | documento IA |
| GET | `…-guardar-carta?id=N` | reescribe la carta en el vault (WF7) |
| GET | `…-digest` | regenera TABLERO + CSV (WF2) |
| GET | `…-health` | healthcheck + caducar (WF4) |
| GET | `…-recordatorios` | recalcula recordatorios (WF5) |

## Tareas periódicas (bucles)

Al arrancar el server corren automáticamente (además del scoring). Se apagan con las variables:

| Tarea | Var (def.) | Intervalo min (def.) |
|---|---|---|
| Digest (WF2) | `DIGEST_ON` (1) | `DIGEST_INTERVAL_MIN` (720) |
| Healthcheck + caducar (WF4) | `HEALTH_ON` (1) | `HEALTH_INTERVAL_MIN` (1440) |
| Recordatorios (WF5) | `REMIND_ON` (1) | `REMIND_INTERVAL_MIN` (1440) |

## Exportación a ficheros

- `EXPORT_DIR` (def. `/vault/Ofertas`): carpeta destino (móntala como volumen, igual que con n8n).
- `EXPORT_FILES` (def. `1`): activa/desactiva la escritura a fichero.
- `EXPORT_FOOTER`: pie de la carta (nombre/contacto); por defecto un placeholder.

## Qué NO hace (a propósito)

- **No manda Telegram.** Es lo único de n8n que no se replica. `healthcheck()` y `reminders()`
  **devuelven** las alertas en su resultado, así que enchufar un notificador es trivial si algún día
  lo quieres. Todo lo demás (digest, TABLERO, CSV, caducidad, recordatorios, export de cartas) ya está.

Ver [`PARIDAD-n8n.md`](./PARIDAD-n8n.md) para la comparativa completa.
