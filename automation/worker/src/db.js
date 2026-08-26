// Conexión a Postgres (schema empleo). Usa DATABASE_URL o PG_* del entorno.
import pg from 'pg';

const url = process.env.DATABASE_URL;
const cfg = url
  ? { connectionString: url }
  : {
      host: process.env.PG_HOST || '127.0.0.1',
      port: Number(process.env.PG_PORT || 5432),
      database: process.env.PG_DB || 'empleo',
      user: process.env.PG_USER || 'empleo_worker',
      password: process.env.PG_PASS || '',
    };

export const pool = new pg.Pool({ ...cfg, max: 4, options: '-c search_path=empleo' });

export async function q(text, params) {
  const r = await pool.query(text, params);
  return r.rows;
}

export async function one(text, params) {
  const rows = await q(text, params);
  return rows[0] || null;
}

// Registro de auditoría: cada acción del worker queda en empleo.events (trazabilidad histórica).
// Nunca rompe el flujo si falla el log.
export async function logEvent(offerId, tipo, detalle) {
  try {
    await q(`INSERT INTO empleo.events (offer_id, tipo, detalle) VALUES ($1, $2, $3)`,
      [offerId || null, String(tipo).slice(0, 40), String(detalle || '').slice(0, 500)]);
  } catch { /* auditoría best-effort */ }
}
