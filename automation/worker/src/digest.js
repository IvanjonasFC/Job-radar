// Digest (equivale a WF2, sin la parte de Telegram): genera el TABLERO.md y el candidaturas.csv
// a partir de la BD, con el MISMO SQL y formato que los nodos de n8n. No marca 'notificada'
// (eso en n8n iba ligado al envío a Telegram); las ofertas siguen visibles en la web.
import { q } from './db.js';
import { EXPORT_DIR, EXPORT_ON, writeFileSafe } from './files.js';

const NL = '\n';
const c = (v) => String(v == null ? '' : v).split('|').join('/').split(NL).join(' ').trim();
const ubi = (o) => {
  const l = c(o.location); const m = c(o.modalidad);
  const isMod = /remot|teletrab|presencial|h.brid|semipresencial/i.test(l);
  const loc = (!l || l.toLowerCase() === 'no indicada' || isMod) ? '' : l;
  return !loc ? (m || '-') : (m && loc.toLowerCase() !== m.toLowerCase() ? loc + ' - ' + m : loc);
};

// TABLERO.md — dashboard en markdown (nodo "DB datos tablero" + "Construir TABLERO").
export async function buildTablero() {
  const row = await q(
    `SELECT
       (SELECT json_agg(t) FROM (SELECT status, count(*) AS c FROM empleo.job_offers GROUP BY status ORDER BY count(*) DESC) t) AS por_estado,
       (SELECT json_agg(t) FROM (SELECT id,title,company,location,modalidad,score,verdict,keywords,reasons,url FROM empleo.job_offers WHERE status IN ('evaluada','notificada') ORDER BY score DESC NULLS LAST LIMIT 60) t) AS top_ofertas,
       (SELECT json_agg(t) FROM (SELECT id,title,company,stage,applied_at,next_action,next_date,url FROM empleo.applications WHERE stage NOT IN ('rechazada','aceptada') ORDER BY applied_at DESC) t) AS pipeline,
       (SELECT count(*) FROM empleo.job_offers WHERE first_seen >= now() - interval '7 days') AS ultimas_7d`
  );
  const raw = row[0] || {};
  const est = raw.por_estado || [];
  const top = raw.top_ofertas || [];
  const pipe = raw.pipeline || [];
  const fecha = new Date().toISOString().slice(0, 16).replace('T', ' ');

  const L = [];
  L.push('---'); L.push('actualizado: ' + fecha); L.push('tags: [empleo, tablero]'); L.push('---');
  L.push('# Tablero de busqueda de empleo'); L.push('');
  L.push('Actualizado automaticamente por el worker. Ofertas nuevas ultimos 7 dias: ' + (raw.ultimas_7d || 0) + '.'); L.push('');
  L.push('## Estado general'); L.push('| Estado | Total |'); L.push('|---|---|');
  for (const e of est) L.push('| ' + c(e.status) + ' | ' + (e.c || 0) + ' |');
  L.push('');
  L.push('## Oportunidades abiertas (' + top.length + ')');
  L.push('| Score | Puesto | Empresa | Ubicacion | Tecnologias | Enlace |');
  L.push('|---|---|---|---|---|---|');
  for (const o of top) {
    L.push('| ' + (o.score || 0) + ' | ' + c(o.title) + ' | ' + c(o.company) + ' | ' + ubi(o) + ' | ' + c(o.keywords).slice(0, 60) + ' | [ver](' + c(o.url) + ') |');
  }
  L.push('');
  L.push('## Detalle (top 15)');
  for (const o of top.slice(0, 15)) {
    L.push(''); L.push('### ' + (o.score || 0) + '/100 - ' + c(o.title) + ' (' + c(o.company) + ')');
    L.push('- Ubicacion: ' + ubi(o));
    if (c(o.keywords)) L.push('- Tecnologias: ' + c(o.keywords));
    if (c(o.verdict)) L.push('- Veredicto: ' + c(o.verdict));
    if (c(o.reasons)) L.push('- Encaje: ' + c(o.reasons));
    L.push('- [Ver oferta](' + c(o.url) + ')');
  }
  L.push('');
  L.push('## Candidaturas en curso');
  if (!pipe.length) {
    L.push('Ninguna candidatura activa por ahora.');
  } else {
    L.push('| Empresa | Puesto | Fase | Aplicada | Proxima accion |'); L.push('|---|---|---|---|---|');
    for (const a of pipe) {
      L.push('| ' + c(a.company) + ' | ' + c(a.title) + ' | ' + c(a.stage) + ' | ' +
        (a.applied_at ? String(a.applied_at).slice(0, 10) : '') + ' | ' +
        c(a.next_action) + (a.next_date ? (' (' + String(a.next_date).slice(0, 10) + ')') : '') + ' |');
    }
  }
  return writeFileSafe(EXPORT_DIR + '/_TABLERO.md', L.join(NL));
}

// candidaturas.csv (nodo "DB candidaturas" + "Construir CSV"). Con BOM y CRLF, abre bien en Excel.
export async function buildCsv() {
  const rows = await q(
    `SELECT status, company, title, location, modalidad, score, verdict, source,
            to_char(first_seen,'YYYY-MM-DD')  AS fecha_deteccion,
            to_char(generated_at,'YYYY-MM-DD') AS fecha_cv,
            to_char(applied_at,'YYYY-MM-DD')   AS fecha_postulacion, url
       FROM empleo.job_offers
      WHERE status IN ('aplicada','generada','notificada')
         OR (status='evaluada' AND first_seen >= now() - interval '30 days')
      ORDER BY CASE status WHEN 'aplicada' THEN 1 WHEN 'generada' THEN 2 WHEN 'notificada' THEN 3
                           WHEN 'evaluada' THEN 4 ELSE 5 END,
               COALESCE(applied_at, generated_at, notified_at, first_seen) DESC NULLS LAST`
  );
  const DQ = '"'; const CR = '\r'; const LF = '\n';
  const estadoLabel = { aplicada: '1-Postulada', generada: '2-CV generado', notificada: '3-Notificada', evaluada: '4-Abierta', descartada: '5-Descartada' };
  const qcsv = (v) => {
    let s = String(v == null ? '' : v).split(DQ).join(DQ + DQ).split(LF).join(' ').split(CR).join(' ');
    return (s.indexOf(';') >= 0 || s.indexOf(DQ) >= 0) ? DQ + s + DQ : s;
  };
  const cols = ['Estado', 'Empresa', 'Puesto', 'Ubicacion', 'Modalidad', 'Encaje', 'Veredicto', 'Fuente', 'Fecha_deteccion', 'Fecha_CV', 'Fecha_postulacion', 'URL'];
  const out = [cols.join(';')];
  for (const o of rows) {
    const est = estadoLabel[o.status] || String(o.status || '');
    out.push([est, o.company, o.title, o.location, o.modalidad, (o.score == null ? '' : o.score),
      o.verdict, o.source, o.fecha_deteccion, o.fecha_cv, o.fecha_postulacion, o.url].map(qcsv).join(';'));
  }
  const csv = String.fromCharCode(0xFEFF) + out.join(CR + LF);
  return writeFileSafe(EXPORT_DIR + '/candidaturas.csv', csv);
}

// Ejecuta el digest completo (TABLERO + CSV).
export async function runDigest() {
  if (!EXPORT_ON) return { ok: false, skipped: 'EXPORT_FILES off' };
  const tablero = await buildTablero();
  const csv = await buildCsv();
  return { ok: tablero.ok && csv.ok, tablero: tablero.path, csv: csv.path };
}
