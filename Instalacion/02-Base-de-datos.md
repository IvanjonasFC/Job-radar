# 2 · Base de datos

Todo el sistema vive sobre un único schema **`empleo`** en PostgreSQL. El fichero [`db/schema.sql`](../db/schema.sql) lo crea entero y es **idempotente** (puedes reejecutarlo sin romper nada).

```bash
psql "postgres://ADMIN:PASS@HOST:5432/empleo" -f db/schema.sql
```

## Tablas

### `job_offers` — las ofertas
El corazón. Cada fila es una oferta detectada. Columnas clave:

| Columna | Para qué |
|---|---|
| `url` (único) | Identifica la oferta; evita duplicados (dedupe). |
| `title`, `company`, `location`, `modalidad` | Datos del puesto. |
| `score`, `verdict`, `keywords`, `reasons` | Resultado de la IA (encaje 0–100 + por qué). |
| `status` | Ciclo de vida: `nueva → evaluada → notificada → generada → aplicada` (+ `descartada`, `caducada`). |
| `first_seen` | Cuándo la detectamos. |
| `posted_at` | Fecha real del anuncio en origen (del scraper). |
| `notified_at`, `generated_at`, `applied_at` | Marcas de tiempo de cada fase (alimentan el embudo de Analíticas). |

### `applications` — el seguimiento
Se crea al **aplicar** a una oferta. Guarda la fase (`stage`), fechas de entrevista/próxima acción, y datos del proceso (`contacto`, `email_contacto`, `salario`, `notes`).

### `generated` — carta y CV
Una fila por oferta con `carta_md`, `resumen_cv`, `cv_ajustes_md` (lo produce n8n; lo lee y edita la web).

### `ai_docs` — documentos IA bajo demanda
Prep de entrevista y análisis de carencias (`tipo` = `entrevista` | `carencias`). Único por `(offer_id, tipo)`.

### `settings` — la configuración (fila única)
Una sola fila (`id=1`) con una columna **JSONB** `data`. Aquí escribe la pestaña Config y de aquí leen la web, el scraper y n8n. Es lo que hace el sistema modular.

### `events` — timeline (opcional)
Historial de acciones por oferta.

---

## El rol de la web: `empleo_web`

La web se conecta con un usuario de **mínimos privilegios**, no con el admin:

- `SELECT` en todo el schema.
- `INSERT`/`UPDATE` solo en `applications`, `generated`, `events`, `ai_docs`, `settings`.
- `UPDATE` solo de columnas concretas de `job_offers` (`status`, `applied_at`, `generated_at`, `updated_at`).

Así, aunque alguien comprometa la web, no puede borrar ofertas ni alterar el histórico.

**Cambia la contraseña** (viene como `CHANGE_ME`):

```sql
ALTER ROLE empleo_web PASSWORD 'una-contraseña-larga';
```

Y refléjala en `DATABASE_URL` del `.env`.

> El scraper y n8n usan otro usuario con permisos de escritura (p. ej. `empleo_worker`), porque sí necesitan insertar ofertas y escribir score/carta.

---

## Backups

Copia diaria recomendada:

```bash
pg_dump -Fc "postgres://ADMIN:PASS@HOST:5432/empleo" -f empleo_$(date +%F).dump
# restaurar:
pg_restore -d empleo --clean empleo_2026-01-01.dump
```

Como todo (incluida la config) está en la BD, **un dump es una copia completa del sistema**.

---

## Migraciones

El esquema consolidado ya incluye todas las columnas históricas (v1→v7). Si añades una columna nueva en el futuro, hazlo con `ALTER TABLE ... ADD COLUMN IF NOT EXISTS ...` y anótalo aquí para que la doc no mienta.
