-- ============================================================
--  retention.sql · Mantenimiento y durabilidad (OPCIONAL)
--  Nada aquí borra ofertas: el sistema guarda TODO el histórico (solo marca 'caducada').
--  Ejecuta lo que te interese; lo destructivo va comentado y avisado.
--  Uso:  psql "postgres://.../empleo" -f db/retention.sql
-- ============================================================

-- 1) Índices de apoyo para consultas históricas y de logs (idempotentes).
CREATE INDEX IF NOT EXISTS ix_events_creado   ON empleo.events (creado DESC);
CREATE INDEX IF NOT EXISTS ix_events_offer    ON empleo.events (offer_id);
CREATE INDEX IF NOT EXISTS ix_offers_applied  ON empleo.job_offers (applied_at) WHERE applied_at IS NOT NULL;

-- 2) Ahorro de espacio SIN perder filas: vacía la descripción larga de ofertas ya caducadas
--    de hace más de 1 año (el resto de datos y el histórico se conservan).
UPDATE empleo.job_offers
SET description = NULL
WHERE status = 'caducada' AND first_seen < now() - interval '365 days' AND description IS NOT NULL;

-- 3) Retención de logs: conserva 2 años de eventos (ajústalo o coméntalo si quieres guardarlos siempre).
DELETE FROM empleo.events WHERE creado < now() - interval '730 days';

-- 4) Mantenimiento del planificador (recomendado tras cargas grandes).
ANALYZE empleo.job_offers;
ANALYZE empleo.events;

-- ============================================================
-- 5) (AVANZADO · DESTRUCTIVO) Particionar job_offers por año de first_seen.
--    Solo si acumulas cientos de miles de filas y notas lentitud. Recrea la tabla:
--    haz BACKUP antes (pg_dump). Pasos orientativos, revísalos para tu caso:
-- ------------------------------------------------------------
-- BEGIN;
--   ALTER TABLE empleo.job_offers RENAME TO job_offers_old;
--   CREATE TABLE empleo.job_offers (LIKE empleo.job_offers_old INCLUDING ALL) PARTITION BY RANGE (first_seen);
--   CREATE TABLE empleo.job_offers_2026 PARTITION OF empleo.job_offers
--     FOR VALUES FROM ('2026-01-01') TO ('2027-01-01');
--   -- (crea una partición por año que necesites)
--   INSERT INTO empleo.job_offers SELECT * FROM empleo.job_offers_old;
--   -- verifica el conteo antes de borrar la vieja:
--   -- SELECT (SELECT count(*) FROM empleo.job_offers_old) AS old, (SELECT count(*) FROM empleo.job_offers) AS new;
--   -- DROP TABLE empleo.job_offers_old;
-- COMMIT;
-- ------------------------------------------------------------
