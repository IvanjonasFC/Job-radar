// Genera carta + ajustes de CV (equivalente a WF3 · generar) y documentos IA on-demand
// (equivalente a WF6 · prep entrevista / carencias). Escribe en la BD (la web lo lee) y,
// si EXPORT_FILES está activo, exporta también los .md al vault (igual que WF3 "Guardar MD").
import { q, one, logEvent } from './db.js';
import { getSettings, getPerfil, getProviders } from './config.js';
import { chat } from './ai.js';
import { exportOfferDocs } from './exportdocs.js';

const NL = '\n';

function sysCarta(perfil) {
  return [
    'Eres el estratega de candidaturas del candidato. Escribes cartas de presentacion y ajustes de CV a ' +
    'medida de cada oferta usando UNICAMENTE los datos reales del perfil de abajo. Jamas inventes ' +
    'experiencia, titulos, empresas, metricas ni tecnologias que no aparezcan aqui.',
    '', '== PERFIL ==', perfil, '',
    '== REGLAS ==',
    '1) Usa del perfil SOLO lo que conecta con la oferta, con detalle concreto. Cada afirmacion rastreable al perfil.',
    '2) Cuantifica con cifras reales del perfil. Nada de generalidades vacias.',
    '3) PROHIBIDO el relleno: no uses emocionado, apasionado, excelente oportunidad, encajo perfectamente.',
    '4) Integra con naturalidad las tecnologias de la oferta que el candidato domina; no inventes las que no tenga.',
    '5) Gancho de apertura especifico para la empresa/puesto. Cierre con disponibilidad + llamada a la accion.',
    '6) Primera persona, tono profesional, en el idioma de la oferta (espanol por defecto).',
    '',
    '== FORMATO (obligatorio) ==',
    'Devuelve EXACTAMENTE estos cuatro bloques, en este orden, sin texto antes/entre/despues y SIN JSON. ' +
    'Cada marcador en su propia linea:',
    '===ASUNTO===', '(asunto del email, max 80 caracteres)',
    '===CARTA===', '(carta en markdown, 4 parrafos, 280-380 palabras, sin fecha ni firma)',
    '===RESUMEN_CV===', '(3-4 lineas de cabecera de CV adaptadas a esta oferta)',
    '===AJUSTES_CV===', '(lista markdown de 5-7 ajustes copiables; solo integra keywords que el candidato YA tenga; lo que falte, como item aparte "a aprender")',
    'No escribas nada fuera de esos cuatro bloques.',
  ].join(NL);
}

function grab(raw, name) {
  const tag = '===' + name + '===';
  const s = raw.indexOf(tag);
  if (s < 0) return '';
  const from = s + tag.length;
  let end = raw.length;
  for (const n of ['ASUNTO', 'CARTA', 'RESUMEN_CV', 'AJUSTES_CV']) {
    if (n === name) continue;
    const p = raw.indexOf('===' + n + '===', from);
    if (p >= 0 && p < end) end = p;
  }
  return raw.slice(from, end).trim();
}

export async function generarCarta(id) {
  const settings = await getSettings();
  const perfil = getPerfil(settings);
  const providers = getProviders(settings, 'gen');
  if (!providers.length) return { ok: false, error: 'sin proveedores de IA' };

  const o = await one(`SELECT id, title, company, location, modalidad, score, verdict, keywords,
                              description, reasons, source, url
                       FROM empleo.job_offers WHERE id=$1`, [id]);
  if (!o) return { ok: false, error: 'oferta no encontrada' };

  const userText = [
    'OFERTA: ' + (o.title || '') + ' en ' + (o.company || '') + ' (' + (o.location || '') + ', ' + (o.modalidad || '') + ')',
    'ENCAJE IA: ' + (Number(o.score) || 0) + '/100 ' + (o.verdict || ''),
    'TECNOLOGIAS: ' + (o.keywords || ''),
    'DESCRIPCION:', String(o.description || '').slice(0, 3000),
  ].join(NL);

  const r = await chat(providers, [{ role: 'system', content: sysCarta(perfil) }, { role: 'user', content: userText }],
    { maxTokens: 4096, temperature: 0.6, minLen: 400 });

  const raw = r.content || '';
  const asunto = grab(raw, 'ASUNTO');
  const carta = grab(raw, 'CARTA') || raw; // si no vino con marcadores, guarda lo que haya
  const resumen = grab(raw, 'RESUMEN_CV');
  const ajustes = grab(raw, 'AJUSTES_CV');

  await q(
    `INSERT INTO empleo.generated (offer_id, asunto, carta_md, resumen_cv, cv_ajustes_md, ia, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,now())
     ON CONFLICT (offer_id) DO UPDATE SET asunto=EXCLUDED.asunto, carta_md=EXCLUDED.carta_md,
       resumen_cv=EXCLUDED.resumen_cv, cv_ajustes_md=EXCLUDED.cv_ajustes_md, ia=EXCLUDED.ia, updated_at=now()`,
    [id, asunto, carta, resumen, ajustes, r.provider]
  );
  await q(`UPDATE empleo.job_offers SET status='generada', generated_at=now(), updated_at=now()
           WHERE id=$1 AND status IN ('nueva','evaluada','notificada')`, [id]);
  await logEvent(id, 'generada', 'carta+CV ia=' + r.provider);

  // Export a ficheros .md (WF3 "Guardar MD"), best-effort: nunca rompe la generación.
  let exported = null;
  try {
    const e = await exportOfferDocs(o, { asunto, carta_md: carta, resumen_cv: resumen, cv_ajustes_md: ajustes });
    exported = e && e.ok ? e.folderPath : (e && (e.error || e.skipped)) || null;
  } catch (e) { exported = 'export ERROR: ' + ((e && e.message) || e); }

  return { ok: true, ia: r.provider, exported };
}

// WF6: prep de entrevista o análisis de carencias.
export async function ondemand(id, tipo = 'entrevista') {
  const settings = await getSettings();
  const perfil = getPerfil(settings);
  const providers = getProviders(settings, 'gen');
  if (!providers.length) return { ok: false, error: 'sin proveedores de IA' };

  const o = await one(`SELECT id, title, company, location, keywords, description
                       FROM empleo.job_offers WHERE id=$1`, [id]);
  if (!o) return { ok: false, error: 'oferta no encontrada' };

  const SYS = (tipo === 'carencias'
    ? ['Eres el coach de carrera del candidato (perfil abajo). Analiza ESTA oferta frente a su perfil y ' +
       'responde en markdown, conciso y accionable: 1) QUE YA TIENE que encaja, 2) QUE LE FALTA (se honesto), ' +
       '3) MINI-PLAN para cubrir cada carencia. Usa SOLO datos reales del perfil.']
    : ['Eres el preparador de entrevistas del candidato (perfil abajo). Para ESTA oferta genera en markdown: ' +
       '1) 8-10 PREGUNTAS probables con un apunte de como responder apoyandose en su experiencia real, ' +
       '2) 3 PREGUNTAS que el candidato deberia hacer al entrevistador. Concreto y util, sin relleno.']
  ).concat(['== PERFIL ==', perfil]).join(NL);

  const userText = [
    'OFERTA: ' + (o.title || '') + ' en ' + (o.company || '') + ' (' + (o.location || '') + ')',
    'TECNOLOGIAS: ' + (o.keywords || ''),
    'DESCRIPCION:', String(o.description || '').slice(0, 3000),
  ].join(NL);

  const r = await chat(providers, [{ role: 'system', content: SYS }, { role: 'user', content: userText }],
    { maxTokens: 2048, temperature: 0.5, minLen: 400 });
  if (!r.content) return { ok: false, error: 'la IA no devolvio texto' };

  await q(
    `INSERT INTO empleo.ai_docs (offer_id, tipo, texto, ia, created_at) VALUES ($1,$2,$3,$4,now())
     ON CONFLICT (offer_id, tipo) DO UPDATE SET texto=EXCLUDED.texto, ia=EXCLUDED.ia, created_at=now()`,
    [id, tipo, r.content, r.provider]
  );
  await logEvent(id, 'ia_' + tipo, 'ia=' + r.provider);
  return { ok: true, ia: r.provider };
}
