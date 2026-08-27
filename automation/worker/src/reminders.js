// Recordatorios de candidaturas (equivale a WF5, sin Telegram y leyendo de la BD en vez de
// ficheros del vault). Aplica las MISMAS reglas que n8n:
//   - Entrevista hoy o mañana (fecha_entrevista en [hoy, hoy+1]).
//   - Pendiente: fecha_proxima <= hoy y hay proxima_accion.
//   - Sin respuesta >= 7 días: postulada, aplicada hace >=7d, sin resultado y sin proxima fecha.
// Deja el resultado en ${EXPORT_DIR}/_RECORDATORIOS.md y lo devuelve. No manda Telegram.
import { q, logEvent } from './db.js';
import { EXPORT_DIR, EXPORT_ON, writeFileSafe } from './files.js';

const NL = '\n';
const daysUntil = (d) => {
  if (!d) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const t = new Date(d); if (isNaN(t.getTime())) return null;
  t.setHours(0, 0, 0, 0);
  return Math.round((t - today) / 86400000);
};

export async function reminders() {
  const rows = await q(
    `SELECT company, title, stage, outcome, proxima_accion,
            applied_at, fecha_entrevista, fecha_proxima
       FROM empleo.applications
      WHERE stage NOT IN ('rechazada','aceptada') OR stage IS NULL`
  );

  const alerts = [];
  for (const a of rows) {
    const emp = a.company || '?';
    const pue = a.title || '?';

    const de = daysUntil(a.fecha_entrevista);
    if (de !== null && de >= 0 && de <= 1) {
      alerts.push((de === 0 ? 'ENTREVISTA HOY' : 'ENTREVISTA MANANA') + ': ' + emp + ' - ' + pue);
    }

    const dp = daysUntil(a.fecha_proxima);
    if (dp !== null && dp <= 0 && (a.proxima_accion || '').trim()) {
      alerts.push('PENDIENTE: ' + a.proxima_accion + ' - ' + emp);
    }

    const dpost = daysUntil(a.applied_at);
    if ((a.stage || '') === 'postulada' && dpost !== null && dpost <= -7 &&
        !(a.outcome || '').trim() && !a.fecha_proxima) {
      alerts.push('SIN RESPUESTA ' + Math.abs(dpost) + ' dias: ' + emp + ' (' + pue + ') - seguimiento?');
    }
  }

  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const md = [
    '---', 'actualizado: ' + fecha, 'tags: [empleo, recordatorios]', '---',
    '# Recordatorios de candidaturas', '',
    alerts.length ? alerts.map((a) => '- ' + a).join(NL) : '- Sin recordatorios pendientes.',
  ].join(NL);

  const w = EXPORT_ON ? writeFileSafe(EXPORT_DIR + '/_RECORDATORIOS.md', md) : { ok: false, skipped: 'EXPORT_FILES off' };
  await logEvent(null, 'recordatorios', alerts.length + ' alertas');
  return { ok: true, alerts, file: w.path };
}
