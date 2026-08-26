// Aplicar / descartar una oferta (equivalente a la parte de BD de WF3, sin el mover de carpetas del vault).
import { q, logEvent } from './db.js';

export async function aplicar(id) {
  // Registra la candidatura (idempotente) y marca la oferta como aplicada.
  await q(
    `INSERT INTO empleo.applications (offer_id, url, company, title, channel, stage, applied_at, proxima_accion, fecha_proxima, updated_at)
     SELECT id, url, company, title, 'web', 'postulada', now(), 'Hacer seguimiento (sin respuesta)', (current_date + 7), now()
     FROM empleo.job_offers WHERE id=$1
       AND NOT EXISTS (SELECT 1 FROM empleo.applications WHERE offer_id=$1)`,
    [id]
  );
  await q(
    `UPDATE empleo.applications
       SET applied_at=COALESCE(applied_at, now()),
           fecha_proxima=COALESCE(fecha_proxima, (current_date + 7)),
           proxima_accion=COALESCE(NULLIF(proxima_accion,''), 'Hacer seguimiento (sin respuesta)'),
           updated_at=now()
     WHERE offer_id=$1`,
    [id]
  );
  await q(`UPDATE empleo.job_offers SET status='aplicada', applied_at=now(), updated_at=now() WHERE id=$1`, [id]);
  await logEvent(id, 'aplicada', 'candidatura registrada');
  return { ok: true };
}

export async function descartar(id) {
  await q(`UPDATE empleo.job_offers SET status='descartada', updated_at=now() WHERE id=$1`, [id]);
  await logEvent(id, 'descartada', '');
  return { ok: true };
}
