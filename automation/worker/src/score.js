// Puntúa ofertas nuevas con IA (equivalente a WF1 · scoring).
import { q, logEvent } from './db.js';
import { getSettings, getPerfil, getProviders } from './config.js';
import { chat } from './ai.js';

const NL = '\n';

function sys(perfil) {
  return (
    'Eres un evaluador de encaje laboral para el candidato (' + perfil + '). ' +
    'Puntua la oferta de 0 a 100 con esta rubrica: skills tecnicas 35 por ciento, seniority 20, ' +
    'encaje del proyecto 15, modalidad o ubicacion 15 (remoto o tu zona mejor), proyeccion 15. ' +
    'Veredicto: 80-100 aplicar ya; 60-79 aplicar con carta muy adaptada; 40-59 solo si interesa la empresa; ' +
    'menor de 40 descartar. REGLA DURA: si el puesto NO es de informatica, desarrollo, programacion, ' +
    'sistemas, IT o datos (por ejemplo comercial, ventas, marketing, atencion al cliente, administrativo, ' +
    'hosteleria, logistica, sanitario, educacion), pon score menor de 25 y verdict descartar no-IT. ' +
    'Responde SOLO un objeto JSON en una linea con las claves score (entero), verdict (texto corto), ' +
    'keywords (lista de 10 a 15), reasons (2 a 3 frases), ciudad (provincia o ciudad FISICA; NUNCA la ' +
    'modalidad; si no aparece pon No indicada) y modalidad (una de: presencial, hibrido, remoto). ' +
    'No escribas nada fuera del JSON.'
  );
}

const norm = (s) => String(s || '').toLowerCase();

function modKey(mod) {
  const s = norm(mod);
  if (/remot|teletrab/.test(s)) return 'remoto';
  if (/h[ií]brid|semipres/.test(s)) return 'hibrido';
  if (/presencial/.test(s)) return 'presencial';
  return '';
}

function esLocal(location, ciudad, cities) {
  const hay = norm(location) + ' ' + norm(ciudad);
  return (cities || []).some((c) => c && hay.includes(norm(c)));
}

export async function scoreBatch(limit = 20) {
  const settings = await getSettings();
  const perfil = getPerfil(settings);
  const providers = getProviders(settings, 'score');
  if (!providers.length) return { scored: 0, error: 'sin proveedores de IA configurados (Config → IA o .env)' };

  const SYS = sys(perfil);
  const localCities = settings.local_cities || [];
  const restoMod = settings.resto_modalidades || ['remoto'];

  const rows = await q(
    `SELECT id, title, company, location, url, description FROM empleo.job_offers
     WHERE status = 'nueva' ORDER BY first_seen ASC LIMIT $1`,
    [limit]
  );

  let scored = 0;
  for (const o of rows) {
    const userText = [
      'TITULO: ' + (o.title || ''),
      'EMPRESA: ' + (o.company || ''),
      'UBICACION: ' + (o.location || ''),
      'DESCRIPCION:', String(o.description || '').slice(0, 3000),
    ].join(NL);

    const r = await chat(providers, [{ role: 'system', content: SYS }, { role: 'user', content: userText }],
      { maxTokens: 2000, temperature: 0.2 });

    let parsed = null;
    try {
      const a = r.content.indexOf('{'); const b = r.content.lastIndexOf('}');
      parsed = JSON.parse(a >= 0 && b > a ? r.content.slice(a, b + 1) : r.content);
    } catch { parsed = null; }

    // IA falló → se queda 'nueva' para reintentar en la siguiente pasada.
    if (r.provider === 'none' || !parsed || !parsed.modalidad) {
      await logEvent(o.id, 'score_fallo', 'IA sin respuesta válida (' + r.provider + ')');
      continue;
    }

    const ciudad = parsed.ciudad && !/remoto|hibrido|presencial/i.test(parsed.ciudad) ? parsed.ciudad : (o.location || '');
    const mk = modKey(parsed.modalidad);
    const local = esLocal(o.location, ciudad, localCities);
    // Fuera de tu zona: solo modalidades aceptadas (por defecto remoto). En tu zona: cualquiera.
    const encaja = local || (mk && restoMod.includes(mk)) || (!localCities.length && mk === 'remoto');
    const status = encaja ? 'evaluada' : 'descartada';
    const kw = Array.isArray(parsed.keywords) ? parsed.keywords.join(', ') : String(parsed.keywords || '');

    await q(
      `UPDATE empleo.job_offers
       SET score=$1, verdict=$2, keywords=$3, reasons=$4, location=COALESCE(NULLIF($5,''), location),
           modalidad=$6, status=$7, scored_at=now(), updated_at=now()
       WHERE id=$8`,
      [Number(parsed.score) || 0, String(parsed.verdict || ''), kw, String(parsed.reasons || ''),
       ciudad, String(parsed.modalidad || ''), status, o.id]
    );
    await logEvent(o.id, 'puntuada', `score=${Number(parsed.score) || 0} status=${status} ia=${r.provider}`);
    scored++;
  }
  if (rows.length) await logEvent(null, 'score_lote', `puntuadas ${scored}/${rows.length}`);
  return { scored, seen: rows.length };
}
