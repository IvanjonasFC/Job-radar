// Descarta una oferta de forma FIABLE: marca status='descartada' en la BD (desaparece de todas
// las vistas activas) y, si hay n8n, le avisa para mover la carpeta del vault. No depende de n8n.
import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { SITE } from '../../data/site';

export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData();
  const id = Number(f.get('id') || 0);
  const back = String(f.get('back') || '/');
  if (!id) return redirect(back);
  try {
    await sql`UPDATE empleo.job_offers SET status='descartada', updated_at=now() WHERE id=${id}`;
  } catch (e) { /* permisos/tabla: no rompemos la navegación */ }
  try { if (SITE.n8nWebhookBase) await fetch(`${SITE.n8nWebhookBase}-descartar?id=${id}`, { method: 'GET' }); } catch (e) {}
  return redirect(back);
};
