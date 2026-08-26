# 5 · Mantenimiento y problemas

## Salud del sistema

La pestaña **Analíticas** y el KPI **"Última oferta"** de Config son tu chequeo diario:

- **Última oferta > 24–48 h** → el scraper no está entrando. Revisa que corra y que sus portales respondan (Indeed y RSS son los fiables sin proxy).
- **"Sin puntuar" alto** (Analíticas → salud) → `wf1` (scoring) está caído o sin claves de IA.
- **Embudo que se cae** entre Detectadas y Puntuadas → problema de IA; entre Notificadas y Postuladas → cuello de botella tuyo (aplica más).

El flujo `wf4-healthcheck` avisa por Telegram si en 24 h no entra o no se puntúa nada.

## Logs de auditoría (trazabilidad histórica)

El **worker** escribe cada acción en `empleo.events` (`puntuada`, `generada`, `aplicada`, `descartada`,
`ia_entrevista`, `score_fallo`, `ingesta`…). Es tu histórico para años:

```sql
-- últimas 50 acciones
SELECT creado, tipo, offer_id, detalle FROM empleo.events ORDER BY creado DESC LIMIT 50;
-- errores de IA por proveedor en 7 días
SELECT detalle, count(*) FROM empleo.events WHERE tipo='score_fallo' AND creado > now()-interval '7 days' GROUP BY 1;
```

Los logs de stdout del worker/web se ven con `docker compose logs -f worker` (o `docker logs`).

## Backups

Un `pg_dump` **es** la copia de todo el sistema (config incluida). Opciones:

- **Automático con el compose:** `docker compose --profile backup up -d` → deja un dump diario en `./backups`
  con retención de 7 días.
- **Manual / cron:**
  ```bash
  pg_dump -Fc "postgres://ADMIN:PASS@HOST:5432/empleo" -f empleo_$(date +%F).dump
  ```

Guárdalo fuera del servidor. Restaurar: `pg_restore -d empleo --clean archivo.dump`.

## Retención y durabilidad (para años de datos)

El sistema **nunca borra** ofertas (solo marca `caducada`), así que acumula histórico. Para que siga rápido
y ligero con el tiempo, `db/retention.sql` (opcional, no destructivo por defecto):

```bash
psql "postgres://ADMIN:PASS@HOST:5432/empleo" -f db/retention.sql
```

Incluye índices de logs, vaciado de descripciones de ofertas caducadas de +1 año (sin borrar filas),
retención de eventos a 2 años, `ANALYZE`, y —comentada— una receta de **particionado por año** de
`job_offers` para cuando acumules cientos de miles de filas.

## Limpieza de ofertas viejas

La web marca como `caducada` las ofertas de más de 30 días (botón "Limpiar antiguas" en Ofertas). No borra: siguen en la BD, solo desaparecen del panel. Las **aplicadas** nunca se tocan.

---

## Problemas comunes

| Síntoma | Causa probable | Solución |
|---|---|---|
| La web no arranca: *Falta DATABASE_URL* | `.env` sin la variable o con BOM | Reescribe `.env` en UTF-8 sin BOM; comprueba `DATABASE_URL`. |
| *No se pudo guardar* en Config | Falta la tabla `settings` | Ejecuta el bloque SQL que muestra la propia pantalla (o reaplica `db/schema.sql`). |
| Los botones IA no hacen nada | `N8N_WEBHOOK_BASE` vacío o n8n caído | Rellena la variable y comprueba que el webhook del flujo está **activo**. |
| *conflict with one of the webhooks* al importar un flujo | Flujo duplicado (mismo path de webhook) | Borra el duplicado: `DELETE /api/v1/workflows/<id>`. |
| El scraper no mete nada | Sin egress TLS o portal que exige proxy | Usa Indeed + RSS; para LinkedIn/Google configura `PROXIES`. |
| Las cartas salen genéricas | Perfil vacío o poco concreto | Rellena la sección 4 de Config con cifras y proyectos reales. |
| *process is not defined* en un nodo Code de n8n | El task runner no expone `process` | Usa `$env['MI_KEY']`, nunca `process.env`. |
| El kanban no guarda al arrastrar | La web no puede escribir en la BD | Revisa permisos de `empleo_web` sobre `applications`. |

---

## Actualizar la web

```bash
git pull
npm install          # por si cambian dependencias
npm run build
# reinicia el servicio (systemd, docker compose up -d --build, etc.)
```

Los cambios de esquema van en `db/schema.sql` (idempotente): reejecútalo tras actualizar si la versión añadió columnas.

---

## Checklist de "sistema sano"

- [ ] Entran ofertas nuevas cada día (KPI "Última oferta" en verde).
- [ ] Las nuevas se puntúan (score no nulo).
- [ ] `pg_dump` diario guardado fuera del servidor.
- [ ] La web tras un proxy con TLS (y `APP_PASSWORD` si es accesible fuera de la LAN).
- [ ] Claves de IA y tokens **solo** en los `.env`, nunca en el repo.
