// Guarda seguimiento (notas + fechas + contacto + salario) en empleo.applications.
import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';

const nn = (v: FormDataEntryValue | null) => { const s = String(v || '').trim(); return s === '' ? null : s; };

export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData();
  const id = Number(f.get('id') || 0);
  if (!id) return redirect('/ofertas');
  const notas = String(f.get('notas') || '');
  const fe = nn(f.get('fecha_entrevista'));
  const pa = String(f.get('proxima_accion') || '');
  const fp = nn(f.get('fecha_proxima'));
  const contacto = nn(f.get('contacto'));
  const email = nn(f.get('email_contacto'));
  const salario = nn(f.get('salario'));
  try {
    const r = await sql`
      UPDATE empleo.applications
      SET notes = ${notas}, fecha_entrevista = ${fe}, proxima_accion = ${pa}, fecha_proxima = ${fp},
          contacto = ${contacto}, email_contacto = ${email}, salario = ${salario}, updated_at = now()
      WHERE offer_id = ${id}`;
    if (r.count === 0) {
      await sql`
        INSERT INTO empleo.applications (offer_id, url, company, title, notes, fecha_entrevista, proxima_accion, fecha_proxima, contacto, email_contacto, salario, updated_at)
        SELECT id, url, company, title, ${notas}, ${fe}, ${pa}, ${fp}, ${contacto}, ${email}, ${salario}, now()
        FROM empleo.job_offers WHERE id = ${id}`;
    }
  } catch (e) {
    // si faltan columnas (migración no aplicada) o permisos, no rompemos la navegación.
  }
  return redirect(`/ofertas/${id}`);
};
