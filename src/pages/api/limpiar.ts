// Marca como 'caducada' las ofertas abiertas (evaluada/notificada) detectadas hace mas de N dias.
// No toca aplicadas/generadas/descartadas. Deja el panel limpio de ofertas viejas.
import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData();
  const dias = Math.max(7, Math.min(120, Number(f.get('dias') || 30)));
  try {
    await sql`
      UPDATE empleo.job_offers
      SET status='caducada', updated_at=now()
      WHERE status IN ('evaluada','notificada','generada','nueva')
        AND COALESCE(posted_at, first_seen)::date < current_date - ${dias}::int`;
  } catch (e) { /* si falla permisos, no rompemos */ }
  return redirect('/ofertas');
};
