// Aplicar / descartar una oferta (parte de BD de WF3) + mover la carpeta del vault entre fases
// (01_Inbox → 02_Postuladas / 03_Descartadas), igual que hacía n8n. El movimiento es best-effort:
// si no hay vault_path o falla, la acción en BD se completa igualmente.
import { q, one, logEvent } from './db.js';
import { EXPORT_ON, moveDirSafe } from './files.js';

// Mueve la carpeta de la oferta a la fase destino ('02_Postuladas' | '03_Descartadas') y
// actualiza vault_path en la BD. Devuelve un texto informativo (nunca lanza).
async function moverCarpeta(id, destSeg) {
  if (!EXPORT_ON) return 'export off';
  try {
    const o = await one(`SELECT vault_path FROM empleo.job_offers WHERE id=$1`, [id]);
    const vp = (o && o.vault_path) || '';
    if (!vp) return 'sin vault_path';
    const src = vp.includes('/01_Inbox/') ? '/01_Inbox/' : (vp.includes('/02_Postuladas/') ? '/02_Postuladas/' : null);
    if (!src) return 'no esta en Inbox/Postuladas';
    const oldFolder = vp.slice(0, vp.lastIndexOf('/'));
    const newFolder = oldFolder.split(src).join('/' + destSeg + '/');
    const r = moveDirSafe(oldFolder, newFolder);
    if (!r.ok) return 'no movida: ' + r.error;
    const newPath = newFolder + '/' + vp.slice(vp.lastIndexOf('/') + 1);
    await q(`UPDATE empleo.job_offers SET vault_path=$2, updated_at=now() WHERE id=$1`, [id, newPath]);
    return 'movida a ' + destSeg;
  } catch (e) {
    return 'error al mover: ' + ((e && e.message) || e);
  }
}

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
  const mov = await moverCarpeta(id, '02_Postuladas');
  await logEvent(id, 'aplicada', 'candidatura registrada; ' + mov);
  return { ok: true, carpeta: mov };
}

export async function descartar(id) {
  await q(`UPDATE empleo.job_offers SET status='descartada', updated_at=now() WHERE id=$1`, [id]);
  const mov = await moverCarpeta(id, '03_Descartadas');
  await logEvent(id, 'descartada', mov);
  return { ok: true, carpeta: mov };
}
