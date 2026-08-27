# Paridad worker ↔ n8n

Este documento deja por escrito **qué hacía n8n**, **qué hace ahora el worker Node** y **qué se ha
añadido** para que ambos caminos sean equivalentes. Único punto que NO se replica a propósito:
**los avisos por Telegram** (todo lo demás sí).

## Resumen

| Capacidad | n8n | Worker (antes) | Worker (ahora) |
|---|---|---|---|
| Ingesta RSS | WF1 | ✅ `ingestRSS` | ✅ |
| Scoring multi-IA (bucle) | WF1 | ✅ `scoreBatch` | ✅ |
| Generar carta + CV | WF3 | ✅ (solo BD) | ✅ **+ export .md al vault** |
| IA on-demand (entrevista / carencias) | WF6 | ✅ `ondemand` | ✅ |
| Aplicar / descartar | WF3 | ✅ | ✅ |
| **Digest → TABLERO.md + candidaturas.csv** | WF2 | ❌ | ✅ `runDigest` (WF2 sin Telegram) |
| **Healthcheck + caducar ofertas >30d** | WF4 | ❌ | ✅ `healthcheck` (WF4 sin Telegram) |
| **Recordatorios de seguimiento** | WF5 | ❌ | ✅ `reminders` (WF5 sin Telegram, desde BD) |
| **Guardar carta a fichero** | WF7 | ❌ | ✅ `guardarCarta` |
| Avisos Telegram | todos los WF | ❌ | ❌ **(excluido a propósito)** |

Con esto, **el worker cubre todo lo que hace tu montaje n8n salvo el envío a Telegram**. Los dos
caminos escriben en la misma BD `empleo` y generan los mismos ficheros, así que la web y el vault
quedan idénticos usando uno u otro (o los dos a la vez).

## Qué se ha añadido (módulos nuevos)

- `src/files.js` — utilidades de escritura a disco + `EXPORT_DIR` (equivale al `/vault/Ofertas` que
  montaba n8n).
- `src/exportdocs.js` — export de la ficha + carta + ajustes de CV a `.md` (nodos WF3 *Construir/Guardar
  MD*) y `guardarCarta` (WF7).
- `src/digest.js` — `runDigest`: genera `_TABLERO.md` y `candidaturas.csv` con el **mismo SQL y formato**
  que WF2 (sin la parte de Telegram ni el marcado `notificada`, que en n8n iba ligado al envío).
- `src/health.js` — `healthcheck`: métricas de salud + **caduca ofertas >30 días** (WF4) y deja
  `_SALUD.md`. Devuelve las alertas (no las envía).
- `src/reminders.js` — `reminders`: mismas reglas que WF5 (entrevista hoy/mañana, pendiente, sin
  respuesta ≥7 días) pero **leyendo de `empleo.applications`** en vez de ficheros del vault. Deja
  `_RECORDATORIOS.md`.

`generate.js` ahora, tras escribir en la BD, exporta también los `.md` (si `EXPORT_FILES` está activo).
`server.js` añade los bucles (digest/health/recordatorios) y los endpoints on-demand.

## La única diferencia: Telegram

En n8n, WF2/WF4/WF5/WF3/WF6 terminan en un nodo **"Avisar (tgapi)"** que manda el mensaje a Telegram.
El worker **hace todo el cálculo y lo persiste** (fichero + BD + log), pero **no envía nada**. Las
funciones `healthcheck()` y `reminders()` **devuelven** las alertas en su resultado, así que si algún
día quieres notificar, solo hay que enchufar un notificador a esa salida — sin tocar la lógica.

## Diferencias menores (documentadas)

- **`notificada`**: WF2 marca las ofertas como `notificada` al mandarlas a Telegram. El worker **no**
  las marca (no hay envío), así siguen visibles como `evaluada` en la web, que pasa a ser tu "digest".
- **Recordatorios**: n8n los saca de los `.md` del vault; el worker los saca de la tabla
  `applications` (fuente de verdad del CRM). Mismas reglas, fuente más fiable.
- **Programación**: n8n usa horas fijas (WF2 9:00/20:00, WF4 08:00, WF5 08:30). El worker usa
  intervalos (`setInterval`) configurables; el resultado (los ficheros) es el mismo.

## Cómo se usa

### Bucles automáticos (por defecto ON)
Al arrancar `node src/server.js` corren, además del scoring:

| Tarea | Var ON/OFF | Intervalo (min) | Equivale a |
|---|---|---|---|
| Digest (TABLERO+CSV) | `DIGEST_ON` (1) | `DIGEST_INTERVAL_MIN` (720) | WF2 |
| Healthcheck + caducar | `HEALTH_ON` (1) | `HEALTH_INTERVAL_MIN` (1440) | WF4 |
| Recordatorios | `REMIND_ON` (1) | `REMIND_INTERVAL_MIN` (1440) | WF5 |

### On-demand (endpoints HTTP)
```
GET <base>-digest            # regenera TABLERO + CSV
GET <base>-health            # healthcheck + caducar
GET <base>-recordatorios     # recalcula recordatorios
GET <base>-guardar-carta?id=N
```

### CLI (sin servidor)
```bash
node src/cli.js digest
node src/cli.js health
node src/cli.js recordatorios
node src/cli.js guardar-carta <id>
```

### Variables relevantes
- `EXPORT_DIR` (por defecto `/vault/Ofertas`): carpeta donde se vuelca todo. Móntala como volumen,
  igual que hacías con n8n.
- `EXPORT_FILES` (por defecto `1`): activa/desactiva la escritura a fichero.
- `EXPORT_FOOTER`: pie de la carta (nombre/contacto). Por defecto un placeholder.

## Verificación

Probado contra una Postgres real con el schema `empleo` y datos sembrados:
- `digest` → genera `_TABLERO.md` y `candidaturas.csv` (formato idéntico a WF2, CSV con BOM+CRLF).
- `health` → métricas correctas y **caduca** la oferta de >30 días; idempotente (2ª vez, 0 caducadas).
- `recordatorios` → detecta "ENTREVISTA HOY" y "PENDIENTE" con las reglas de WF5.
- `guardar-carta` → reescribe la carta en el vault (WF7).
- El server arranca y responde en `/health` y en los endpoints on-demand.
