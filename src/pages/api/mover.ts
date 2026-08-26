// Persiste el movimiento de una tarjeta del kanban. Traduce columna -> estado/stage en la BD.
import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

const json = (o: any, status = 200) =>
  new Response(JSON.stringify(o), { status, headers: { 'content-type': 'application/json' } });

export const POST: APIRoute = async ({ request }) => {
  let body: any = {};
  try { body = await request.json(); } catch { return json({ ok: false, error: 'bad json' }, 400); }
  const id = Number(body.offerId) || 0;
  const col = String(body.col || '');
  if (!id || !col) return json({ ok: false, error: 'faltan datos' }, 400);
  try {
    if (col === 'descartada') {
      await sql`UPDATE empleo.job_offers SET status='descartada', updated_at=now() WHERE id=${id}`;
    } else if (col === 'abiertas') {
      await sql`UPDATE empleo.job_offers SET status='evaluada', updated_at=now() WHERE id=${id}`;
    } else if (col === 'cv') {
      await sql`UPDATE empleo.job_offers SET status='generada', updated_at=now() WHERE id=${id}`;
    } else {
      // postulada / entrevista / resuelta -> candidatura aplicada + fase
      const stage = col === 'entrevista' ? 'entrevista_tecnica' : col === 'resuelta' ? 'oferta' : 'postulada';
      await sql`UPDATE empleo.job_offers SET status='aplicada', applied_at=COALESCE(applied_at, now()), updated_at=now() WHERE id=${id}`;
      const r = await sql`UPDATE empleo.applications SET stage=${stage}, updated_at=now() WHERE offer_id=${id}`;
      if (r.count === 0) {
        await sql`INSERT INTO empleo.applications (offer_id, url, company, title, stage, applied_at, updated_at)
                  SELECT id, url, company, title, ${stage}, now(), now() FROM empleo.job_offers WHERE id=${id}`;
      }
      // Al pasar a Postuladas, deja un recordatorio de seguimiento (+7 días) si no lo tiene.
      if (stage === 'postulada') {
        await sql`UPDATE empleo.applications
          SET proxima_accion = COALESCE(NULLIF(proxima_accion,''), 'Hacer seguimiento (sin respuesta)'),
              fecha_proxima  = COALESCE(fecha_proxima, current_date + 7), updated_at = now()
          WHERE offer_id = ${id}`;
      }
    }
    return json({ ok: true });
  } catch (e: any) {
    return json({ ok: false, error: e?.message ?? String(e) }, 500);
  }
};
