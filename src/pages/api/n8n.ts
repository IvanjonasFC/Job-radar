// Proxy server-side a los webhooks de n8n. La URL interna nunca llega al navegador.
// Acciones: generar/aplicar/descartar (con id, form submit) y radar (re-analizar, botón JS).
import type { APIRoute } from 'astro';
import { SITE } from '../../data/site';
import { sql } from '../../lib/db';

export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData();
  const accion = String(f.get('accion') || '');
  const id = Number(f.get('id') || 0);
  const back = String(f.get('back') || '/ofertas');
  try {
    if (accion === 'radar') {
      await fetch(`${SITE.n8nWebhookBase}-radar`, { method: 'GET' });
      return new Response(JSON.stringify({ ok: true }), { headers: { 'content-type': 'application/json' } });
    }
    if (accion === 'ia' && id > 0) {
      const tipo = String(f.get('tipo') || 'entrevista');
      await fetch(`${SITE.n8nWebhookBase}-ia?id=${id}&tipo=${encodeURIComponent(tipo)}`, { method: 'GET' });
    }
    if (['generar', 'aplicar', 'descartar'].includes(accion) && id > 0) {
      await fetch(`${SITE.n8nWebhookBase}-${accion}?id=${id}`, { method: 'GET' });
      // Al aplicar: si aún no hay CV/carta generados, dispáralos también (embudo sin fugas).
      if (accion === 'aplicar') {
        try {
          const [g] = await sql`SELECT 1 AS x FROM empleo.generated WHERE offer_id = ${id}`;
          if (!g) await fetch(`${SITE.n8nWebhookBase}-generar?id=${id}`, { method: 'GET' });
        } catch (e) { /* sin tabla/permisos: no rompemos */ }
      }
    }
  } catch (e) {
    // n8n responde onReceived; si falla, no rompemos la navegación.
  }
  return redirect(back);
};
