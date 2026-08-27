// Healthcheck + mantenimiento (equivale a WF4, sin el envío a Telegram).
// Calcula métricas de salud, caduca ofertas antiguas (>30 días sin postular) y deja un
// informe en ${EXPORT_DIR}/_SALUD.md + un evento en la BD. Devuelve las alertas detectadas
// para que quien llame decida qué hacer con ellas (log, fichero, o —si algún día se quiere—
// un notificador propio). No manda Telegram.
import { q, one, logEvent } from './db.js';
import { EXPORT_DIR, EXPORT_ON, writeFileSafe } from './files.js';

const NL = '\n';

// Caduca ofertas abiertas de más de 30 días (nodo "Caducar antiguas").
export async function caducarAntiguas() {
  const rows = await q(
    `UPDATE empleo.job_offers SET status='caducada', updated_at=now()
      WHERE status IN ('evaluada','notificada') AND first_seen < now() - interval '30 days'
      RETURNING id`
  );
  return rows.length;
}

export async function healthcheck() {
  const r = await one(
    `SELECT
       (SELECT count(*) FROM empleo.job_offers WHERE first_seen >= now() - interval '24 hours') AS nuevas_24h,
       (SELECT count(*) FROM empleo.job_offers WHERE status <> 'nueva' AND updated_at >= now() - interval '24 hours') AS procesadas_24h,
       (SELECT count(*) FROM empleo.job_offers WHERE status='nueva') AS backlog_nuevas,
       (SELECT count(*) FROM empleo.job_offers WHERE status IN ('evaluada','notificada') AND first_seen >= now() - interval '10 days') AS abiertas`
  ) || {};

  const nuevas = Number(r.nuevas_24h) || 0;
  const proc = Number(r.procesadas_24h) || 0;
  const backlog = Number(r.backlog_nuevas) || 0;
  const abiertas = Number(r.abiertas) || 0;

  const alerts = [];
  if (nuevas === 0) alerts.push('Sin ofertas NUEVAS ingeridas en 24h (scraper o RSS caido?)');
  if (proc === 0) alerts.push('Ninguna oferta puntuada en 24h (scoring / IA parados?)');
  if (backlog > 50) alerts.push('Backlog de ' + backlog + ' ofertas nueva sin puntuar (scoring atascado?)');

  const caducadas = await caducarAntiguas();

  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const md = [
    '---', 'actualizado: ' + fecha, 'tags: [empleo, salud]', '---',
    '# Healthcheck del sistema de empleo', '',
    '| Metrica | Valor |', '|---|---|',
    '| Nuevas (24h) | ' + nuevas + ' |',
    '| Procesadas (24h) | ' + proc + ' |',
    '| Backlog sin puntuar | ' + backlog + ' |',
    '| Ofertas abiertas | ' + abiertas + ' |',
    '| Caducadas ahora (>30d) | ' + caducadas + ' |',
    '',
    '## Alertas',
    alerts.length ? alerts.map((a) => '- ⚠️ ' + a).join(NL) : '- ✅ Todo correcto.',
  ].join(NL);

  const w = EXPORT_ON ? writeFileSafe(EXPORT_DIR + '/_SALUD.md', md) : { ok: false, skipped: 'EXPORT_FILES off' };
  await logEvent(null, 'health', `nuevas=${nuevas} proc=${proc} backlog=${backlog} caducadas=${caducadas} alertas=${alerts.length}`);
  return { ok: true, metrics: { nuevas, proc, backlog, abiertas, caducadas }, alerts, file: w.path };
}
