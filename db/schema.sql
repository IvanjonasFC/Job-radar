-- ============================================================
--  Empleo CRM · esquema Postgres consolidado (v1 → v7 + web)
--  Idempotente: puedes ejecutarlo en una BD nueva o existente.
--
--  Uso (contenedor):
--    docker exec -i <pg_container> psql -U <admin> -d empleo < db/schema.sql
--  Uso (local):
--    psql "postgres://user:pass@host:5432/empleo" -f db/schema.sql
--
--  Crea el schema `empleo`, las tablas, índices, vistas y el rol de solo-web.
--  CAMBIA la contraseña de `empleo_web` (abajo) antes de usar en producción.
-- ============================================================

CREATE SCHEMA IF NOT EXISTS empleo;

-- ---------- Ofertas detectadas ----------
CREATE TABLE IF NOT EXISTS empleo.job_offers (
  id            BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  url           TEXT NOT NULL,
  guid          TEXT,
  title         TEXT,
  company       TEXT,
  source        TEXT,
  description   TEXT,
  score         INTEGER,
  verdict       TEXT,
  keywords      TEXT,
  reasons       TEXT,
  location      TEXT,                 -- v4
  modalidad     TEXT,                 -- v5: remoto|hibrido|presencial
  vault_path    TEXT,
  cv_path       TEXT,                 -- v2
  letter_path   TEXT,                 -- v2
  status        TEXT NOT NULL DEFAULT 'nueva',
  -- ciclo de vida: nueva → evaluada → notificada → generada → aplicada
  --                (+ descartada | caducada)
  first_seen    TIMESTAMPTZ NOT NULL DEFAULT now(),
  posted_at     DATE,                 -- v6: fecha real del anuncio en origen
  scored_at     TIMESTAMPTZ,
  notified_at   TIMESTAMPTZ,          -- v2
  interested_at TIMESTAMPTZ,          -- v2
  generated_at  TIMESTAMPTZ,          -- v2
  applied_at    TIMESTAMPTZ,          -- v2
  tg_message_id BIGINT,               -- v2 (Telegram)
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT job_offers_url_uniq UNIQUE (url)
);

CREATE INDEX IF NOT EXISTS job_offers_status_idx   ON empleo.job_offers (status);
CREATE INDEX IF NOT EXISTS job_offers_score_idx    ON empleo.job_offers (score DESC);
CREATE INDEX IF NOT EXISTS job_offers_seen_idx     ON empleo.job_offers (first_seen DESC);
CREATE INDEX IF NOT EXISTS ix_offers_posted_at     ON empleo.job_offers (posted_at DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS ix_offers_status_score  ON empleo.job_offers (status, score DESC);

-- ---------- Candidaturas (pipeline / seguimiento) ----------
CREATE TABLE IF NOT EXISTS empleo.applications (
  id               BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id         BIGINT REFERENCES empleo.job_offers(id) ON DELETE CASCADE,
  url              TEXT,
  company          TEXT,
  title            TEXT,
  applied_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  channel          TEXT,
  notes            TEXT,
  outcome          TEXT,
  stage            TEXT DEFAULT 'postulada',   -- v3
  -- fases: postulada → prueba_tecnica → entrevista_tecnica → entrevista_rrhh → oferta → aceptada | rechazada
  next_action      TEXT,                       -- v3
  next_date        DATE,                        -- v3
  fecha_entrevista DATE,                        -- web: recordatorios
  proxima_accion   TEXT,                        -- web: recordatorios
  fecha_proxima    DATE,                        -- web: recordatorios
  contacto         TEXT,                        -- web: reclutador
  email_contacto   TEXT,                        -- web: email reclutador
  salario          TEXT,                        -- web: salario/rango
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_app_offer ON empleo.applications (offer_id);

-- ---------- Documentos generados (carta/CV/ajustes) ----------
CREATE TABLE IF NOT EXISTS empleo.generated (
  offer_id      BIGINT PRIMARY KEY REFERENCES empleo.job_offers(id) ON DELETE CASCADE,
  asunto        TEXT,
  carta_md      TEXT,
  resumen_cv    TEXT,
  cv_ajustes_md TEXT,
  ia            TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Documentos IA on-demand (prep entrevista, carencias) ----------
CREATE TABLE IF NOT EXISTS empleo.ai_docs (
  id         BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id   BIGINT REFERENCES empleo.job_offers(id) ON DELETE CASCADE,
  tipo       TEXT NOT NULL,           -- 'entrevista' | 'carencias'
  texto      TEXT,
  ia         TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (offer_id, tipo)
);


-- ---------- Configuración del sistema (fila única) ----------
CREATE TABLE IF NOT EXISTS empleo.settings (
  id         SMALLINT PRIMARY KEY DEFAULT 1,
  data       JSONB NOT NULL DEFAULT '{}'::jsonb,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT settings_single_row CHECK (id = 1)
);
INSERT INTO empleo.settings (id, data) VALUES (1, '{}'::jsonb) ON CONFLICT (id) DO NOTHING;

-- ---------- Timeline de eventos (opcional) ----------
CREATE TABLE IF NOT EXISTS empleo.events (
  id       BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  offer_id BIGINT REFERENCES empleo.job_offers(id) ON DELETE CASCADE,
  tipo     TEXT NOT NULL,
  detalle  TEXT,
  creado   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------- Vistas de apoyo ----------
CREATE OR REPLACE VIEW empleo.v_hoy AS
  SELECT id, title, company, source, score, verdict, status, url, cv_path, first_seen
  FROM empleo.job_offers
  WHERE first_seen >= (now() - interval '24 hours')
  ORDER BY score DESC NULLS LAST;

-- ============================================================
--  Rol de solo-web (mínimos privilegios). CAMBIA la contraseña.
-- ============================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'empleo_web') THEN
    CREATE ROLE empleo_web LOGIN PASSWORD 'CHANGE_ME';
  END IF;
END$$;

GRANT USAGE ON SCHEMA empleo TO empleo_web;
GRANT SELECT ON ALL TABLES IN SCHEMA empleo TO empleo_web;
GRANT INSERT, UPDATE ON empleo.applications, empleo.generated, empleo.events, empleo.ai_docs, empleo.settings TO empleo_web;
GRANT UPDATE (status, updated_at, applied_at, generated_at) ON empleo.job_offers TO empleo_web;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA empleo TO empleo_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA empleo GRANT SELECT ON TABLES TO empleo_web;
ALTER DEFAULT PRIVILEGES IN SCHEMA empleo GRANT USAGE, SELECT ON SEQUENCES TO empleo_web;
