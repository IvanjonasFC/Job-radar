// Guarda la carta editada a mano en empleo.generated (la web es editor, no solo visor),
// y le pide a n8n (best-effort) que reescriba el .md de la carta en el vault de Obsidian.
import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { SITE } from '../../data/site';

export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData();
  const id = Number(f.get('id') || 0);
  if (!id) return redirect('/ofertas');
  const carta = String(f.get('carta_md') || '');
  try {
    const r = await sql`UPDATE empleo.generated SET carta_md = ${carta}, updated_at = now() WHERE offer_id = ${id}`;
    if (r.count === 0) {
      await sql`INSERT INTO empleo.generated (offer_id, carta_md, ia, updated_at) VALUES (${id}, ${carta}, 'manual', now())`;
    }
  } catch (e) { /* si falta la tabla o permisos, no rompemos */ }
  // Sincroniza el .md del vault (si hay n8n + wf7 importado). Si falla, la BD ya quedó guardada.
  try { if (SITE.n8nWebhookBase) await fetch(`${SITE.n8nWebhookBase}-guardar-carta?id=${id}`, { method: 'GET' }); } catch (e) {}
  return redirect(`/ofertas/${id}#carta`);
};
