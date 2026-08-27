// Exporta a ficheros Markdown la carta + CV + ficha de una oferta generada.
// Equivale a los nodos "Construir MD" + "Guardar MD (fs)" de WF3 y a WF7 (guardar-carta).
// Vuelca en ${EXPORT_DIR}/01_Inbox/<slug>/ y actualiza vault_path/cv_path en la BD, igual que n8n.
import { q, one, logEvent } from './db.js';
import { EXPORT_DIR, EXPORT_ON, writeFileSafe, slugify, cleanName } from './files.js';

const NL = '\n';
const yv = (s) => "'" + String(s == null ? '' : s).split("'").join('').split(NL).join(' ').trim() + "'";
const footerLine = () =>
  (process.env.EXPORT_FOOTER || '[Tu Nombre]  |  [tu-email]  |  [tu-web]  |  [tu-github]');

// Construye el contenido de los 3 ficheros a partir de la oferta y lo generado.
function buildDocs(offer, gen, today) {
  const kwStr = Array.isArray(offer.keywords) ? offer.keywords.join(', ') : String(offer.keywords || '');

  const fm = [
    '---',
    'estado: por_revisar',
    'empresa: ' + yv(offer.company),
    'puesto: ' + yv(offer.title),
    'ubicacion: ' + yv(offer.location),
    'modalidad: ' + yv(offer.modalidad),
    'fuente: ' + yv(offer.source),
    'url: ' + yv(offer.url),
    'match_score: ' + (Number(offer.score) || 0),
    'veredicto: ' + yv(offer.verdict),
    'fecha_deteccion: ' + today,
    'fecha_postulacion: ',
    'fecha_respuesta: ',
    'fecha_entrevista: ',
    'proxima_accion: ',
    'fecha_proxima: ',
    'notas: ',
    'offer_id: ' + (Number(offer.id) || 0),
    'tags: [empleo, inbox]',
    '---',
    '',
  ].join(NL);

  const indice = fm + [
    '# ' + (offer.title || 'Oferta') + ' - ' + (offer.company || ''),
    '',
    '- **Empresa:** ' + (offer.company || '-'),
    '- **Ubicacion:** ' + (offer.location || '-') + ' (' + (offer.modalidad || '-') + ')',
    '- **Encaje:** ' + (Number(offer.score) || 0) + '/100 - ' + (offer.verdict || ''),
    '- **Enlace:** ' + (offer.url || '-'),
    '',
    '## Por que encaja',
    (offer.reasons || ''),
    '',
    '## Tecnologias',
    kwStr,
    '',
    '## Documentos',
    '- [[Carta de presentacion]]',
    '- [[Ajustes CV]]',
    '',
    '---',
    '### Descripcion (recorte)',
    String(offer.description || '').slice(0, 2500),
  ].join(NL);

  const carta = [
    '# Carta de presentacion',
    '',
    '**Para:** ' + (offer.company || '') + '  |  **Puesto:** ' + (offer.title || ''),
    '**Asunto:** ' + (gen.asunto || ((offer.title || 'Candidatura') + ' - candidatura')),
    '**Fecha:** ' + today,
    '',
    '---',
    '',
    (gen.carta_md || '(no generada)'),
    '',
    '---',
    footerLine(),
  ].join(NL);

  const cvtips = [
    '# Ajustes de CV para esta oferta',
    '',
    '**' + (offer.company || '') + '** - ' + (offer.title || ''),
    '',
    '---',
    '',
    '## Resumen profesional sugerido',
    (gen.resumen_cv || '(no generado)'),
    '',
    '## Ajustes a aplicar',
    (gen.cv_ajustes_md || '(no generados)'),
  ].join(NL);

  return { indice, carta, cvtips };
}

// Escribe los 3 ficheros de una oferta y actualiza vault_path/cv_path. Best-effort.
// Se llama desde generarCarta cuando EXPORT_FILES está activo.
export async function exportOfferDocs(offer, gen) {
  if (!EXPORT_ON) return { ok: false, skipped: 'EXPORT_FILES off' };
  const today = new Date().toISOString().slice(0, 10);
  const slug = today + '-' + slugify(offer.company || 'empresa') + '-' + slugify(offer.title || 'oferta');
  const folderPath = EXPORT_DIR + '/01_Inbox/' + slug;
  const { indice, carta, cvtips } = buildDocs(offer, gen, today);

  const r1 = writeFileSafe(folderPath + '/_Oferta.md', indice);
  writeFileSafe(folderPath + '/Carta de presentacion.md', carta);
  writeFileSafe(folderPath + '/Ajustes CV.md', cvtips);
  if (!r1.ok) return { ok: false, error: r1.error, folderPath };

  const indicePath = folderPath + '/_Oferta.md';
  const cartaPath = folderPath + '/Carta de presentacion.md';
  await q(
    `UPDATE empleo.job_offers SET vault_path=$2, cv_path=$3, updated_at=now() WHERE id=$1`,
    [offer.id, indicePath, cartaPath]
  );
  await logEvent(offer.id, 'export', 'ficheros en ' + folderPath);
  return { ok: true, folderPath, indicePath, cartaPath };
}

// WF7: reescribe SOLO la carta a partir de lo que hay en la BD (usa el vault_path guardado).
export async function guardarCarta(id) {
  const r = await one(
    `SELECT g.carta_md, g.asunto, o.company, o.title, o.vault_path
       FROM empleo.generated g JOIN empleo.job_offers o ON o.id = g.offer_id
      WHERE o.id = $1`, [id]
  );
  if (!r) return { ok: false, error: 'oferta/carta no encontrada' };
  if (!r.vault_path || !r.carta_md) return { ok: false, error: 'sin vault_path o carta en BD' };

  const folder = r.vault_path.slice(0, r.vault_path.lastIndexOf('/'));
  const path = folder + '/Carta de presentacion.md';
  const today = new Date().toISOString().slice(0, 10);
  const carta = [
    '# Carta de presentacion',
    '',
    '**Para:** ' + (r.company || '') + '  |  **Puesto:** ' + (r.title || ''),
    '**Asunto:** ' + (r.asunto || ''),
    '**Fecha:** ' + today,
    '',
    '---',
    '',
    (r.carta_md || ''),
    '',
    '---',
    footerLine(),
  ].join(NL);

  const w = writeFileSafe(path, carta);
  if (w.ok) await logEvent(id, 'export_carta', path);
  return w;
}
