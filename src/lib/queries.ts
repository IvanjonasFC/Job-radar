// Consultas de solo lectura. SQL parametrizado (postgres.js) → seguro y sin necesitar el schema drizzle.
import { sql } from './db';

export type Filtros = { q?: string; estado?: string; modalidad?: string; min?: number; limit?: number; offset?: number; sort?: string; dir?: string };

// Columnas por las que se puede ordenar desde las cabeceras de la tabla (whitelist → seguro).
const SORT_COL: Record<string, any> = {
  encaje: sql`score`,
  puesto: sql`lower(title)`,
  empresa: sql`lower(company)`,
  ubicacion: sql`lower(location)`,
  estado: sql`status`,
  fuente: sql`lower(source)`,
  fecha: sql`COALESCE(posted_at, first_seen)`,
  limite: sql`COALESCE(posted_at, first_seen)`,
};

export async function listOffers(f: Filtros = {}) {
  const q = f.q ?? '';
  const estado = f.estado ?? '';
  const modalidad = f.modalidad ?? '';
  const min = Number.isFinite(f.min as number) ? (f.min as number) : 0;
  const limit = Math.min(f.limit ?? 100, 300);
  const offset = Math.max(0, f.offset ?? 0);
  const dir = f.dir === 'asc' ? sql`ASC` : sql`DESC`;

  let orderFrag;
  if (f.sort === 'relevancia') {
    orderFrag = sql`CASE status WHEN 'aplicada' THEN 0 WHEN 'generada' THEN 1 WHEN 'notificada' THEN 2 WHEN 'evaluada' THEN 3 ELSE 4 END, score DESC NULLS LAST, COALESCE(posted_at, first_seen) DESC`;
  } else if (SORT_COL[f.sort ?? '']) {
    // Orden por la columna que el usuario pulsó, en la dirección pedida.
    orderFrag = sql`${SORT_COL[f.sort as string]} ${dir} NULLS LAST, COALESCE(posted_at, first_seen) DESC`;
  } else {
    // Por defecto / 'reciente' / legacy 'nuevas': por fecha, con las AÚN sin puntuar ('nueva') al final.
    orderFrag = sql`(status = 'nueva') ASC, COALESCE(posted_at, first_seen) ${dir} NULLS LAST`;
  }

  return sql<any[]>`
    SELECT id, title, company, location, modalidad, source, score, verdict, status,
           to_char(COALESCE(posted_at, first_seen),'YYYY-MM-DD') AS visto,
           to_char(COALESCE(posted_at, first_seen) + interval '30 days','YYYY-MM-DD') AS cierre,
           (now() > COALESCE(posted_at, first_seen) + interval '30 days') AS cerrada,
           ((COALESCE(posted_at, first_seen)::date + 30) - current_date) AS dias_cierre,
           (posted_at IS NOT NULL) AS fecha_real, url
    FROM empleo.job_offers
    WHERE (${estado} = '' OR status = ${estado})
      AND (${modalidad} = '' OR modalidad ILIKE ${'%' + modalidad + '%'})
      AND (${q} = '' OR title ILIKE ${'%' + q + '%'} OR company ILIKE ${'%' + q + '%'})
      AND score >= ${min}
      AND status NOT IN ('caducada','descartada')
    ORDER BY ${orderFrag}
    LIMIT ${limit} OFFSET ${offset}`;
}

export async function getOffer(id: number) {
  const [o] = await sql<any[]>`
    SELECT *,
      ((COALESCE(posted_at, first_seen)::date + 30) - current_date) AS dias_cierre,
      (now() > COALESCE(posted_at, first_seen) + interval '30 days') AS cerrada,
      (current_date - first_seen::date) AS dias_detectada,
      to_char((COALESCE(posted_at, first_seen) + interval '30 days'),'YYYY-MM-DD') AS cierre
    FROM empleo.job_offers WHERE id = ${id}`;
  if (!o) return null;
  let g: any = null, a: any = null;
  try { [g] = await sql<any[]>`SELECT * FROM empleo.generated WHERE offer_id = ${id}`; } catch {}
  try { [a] = await sql<any[]>`SELECT * FROM empleo.applications WHERE offer_id = ${id} ORDER BY updated_at DESC NULLS LAST LIMIT 1`; } catch {}
  const ai: Record<string, any> = {};
  try { const docs = await sql<any[]>`SELECT tipo, texto, ia FROM empleo.ai_docs WHERE offer_id = ${id}`; for (const d of docs) ai[d.tipo] = d; } catch {}
  return { o, g, a, ai };
}

export async function estadosDisponibles() {
  return sql<any[]>`SELECT DISTINCT status FROM empleo.job_offers WHERE status <> 'caducada' ORDER BY status`;
}
