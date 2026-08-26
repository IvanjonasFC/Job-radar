// Guarda la configuración del sistema en empleo.settings (fila única id=1, jsonb).
import type { APIRoute } from 'astro';
import { sql } from '../../lib/db';
import { DEFAULTS } from '../../lib/config';

// Divide por comas o saltos de línea, limpia y quita vacíos.
const arr = (v: FormDataEntryValue | null) =>
  String(v || '').split(/[\n,]+/).map((s) => s.trim()).filter(Boolean);

const uniq = (a: string[]) => Array.from(new Set(a));

export const POST: APIRoute = async ({ request, redirect }) => {
  const f = await request.formData();
  const modOpts = ['presencial', 'hibrido', 'remoto'];
  const getAll = (name: string) => f.getAll(name).map((x) => String(x));

  // Claves de IA existentes: si el campo (password) llega vacío, se conserva la guardada (no se borra).
  let prevIa: any = {};
  try { const [row] = await sql<any[]>`SELECT data->'ia' AS ia FROM empleo.settings WHERE id=1`; prevIa = row?.ia || {}; } catch {}
  // Casillas 'borrar' marcadas: sus claves se vacían explícitamente.
  const iaClears = new Set(getAll('ia_clear'));
  const iaField = (name: string, prev: any) => {
    const v = String(f.get(name) || '').trim();
    if (v) return v;                    // reemplazo explícito (se escribió una clave nueva)
    if (iaClears.has(name)) return '';  // borrado explícito (casilla marcada)
    return String(prev || '');          // vacío = conservar la guardada
  };

  const cfg = {
    titular: String(f.get('titular') || DEFAULTS.titular).trim() || DEFAULTS.titular,
    local_region: String(f.get('local_region') || DEFAULTS.local_region).trim(),
    local_cities: arr(f.get('local_cities')).map((s) => s.toLowerCase()),
    local_modalidades: modOpts.filter((m) => getAll('local_modalidades').includes(m)),
    resto_modalidades: modOpts.filter((m) => getAll('resto_modalidades').includes(m)),
    min_score_cola: Math.max(0, Math.min(100, Number(f.get('min_score_cola') || DEFAULTS.min_score_cola))),
    include_keywords: arr(f.get('include_keywords')).map((s) => s.toLowerCase()),
    exclude_keywords: arr(f.get('exclude_keywords')).map((s) => s.toLowerCase()),
    // Fuentes de scraping (controles guiados + extras libres)
    sites: uniq(getAll('sites').map((s) => s.toLowerCase())),
    search_terms: uniq([...getAll('search_terms'), ...arr(f.get('search_terms_extra'))].map((s) => s.toLowerCase())),
    countries: uniq([...getAll('countries'), ...arr(f.get('countries_extra'))].map((s) => s.toLowerCase())),
    rss_feeds: arr(f.get('rss_feeds')),
    hours_old: Math.max(1, Math.min(2160, Number(f.get('hours_old') || DEFAULTS.hours_old))),
    results_wanted: Math.max(1, Math.min(200, Number(f.get('results_wanted') || DEFAULTS.results_wanted))),
    // Perfil del candidato (texto libre; lo usan las cartas/CV/entrevista de n8n)
    nombre: String(f.get('nombre') || '').trim(),
    email: String(f.get('email') || '').trim(),
    telefono: String(f.get('telefono') || '').trim(),
    github: String(f.get('github') || '').trim(),
    web: String(f.get('web') || '').trim(),
    perfil: String(f.get('perfil') || '').trim(),
    // Claves de IA (conserva las guardadas si el campo va vacío)
    ia: {
      groq_key: iaField('ia_groq_key', prevIa.groq_key),
      gemini_key: iaField('ia_gemini_key', prevIa.gemini_key),
      xai_key: iaField('ia_xai_key', prevIa.xai_key),
      ollama_url: iaField('ia_ollama_url', prevIa.ollama_url),
    },
  };
  // Respaldos: nunca dejar vacíos los que romperían la ingesta.
  if (cfg.local_cities.length === 0) cfg.local_cities = DEFAULTS.local_cities;
  if (cfg.local_modalidades.length === 0) cfg.local_modalidades = DEFAULTS.local_modalidades;
  if (cfg.resto_modalidades.length === 0) cfg.resto_modalidades = ['remoto'];
  if (cfg.sites.length === 0) cfg.sites = DEFAULTS.sites;
  if (cfg.search_terms.length === 0) cfg.search_terms = DEFAULTS.search_terms;
  if (cfg.countries.length === 0) cfg.countries = DEFAULTS.countries;

  // La localización del scraper se DERIVA de la zona (una sola fuente de verdad).
  const CLABEL: Record<string, string> = {
    spain: 'Spain', portugal: 'Portugal', france: 'France', germany: 'Germany', italy: 'Italy',
    uk: 'UK', ireland: 'Ireland', netherlands: 'Netherlands', mexico: 'Mexico', argentina: 'Argentina',
    colombia: 'Colombia', chile: 'Chile', peru: 'Peru', usa: 'USA',
  };
  const primary = cfg.countries[0] || 'spain';
  const clabel = CLABEL[primary] || (primary.charAt(0).toUpperCase() + primary.slice(1));
  (cfg as any).home_location = cfg.local_region ? `${cfg.local_region}, ${clabel}` : clabel;

  try {
    await sql`
      INSERT INTO empleo.settings (id, data, updated_at) VALUES (1, ${JSON.stringify(cfg)}::jsonb, now())
      ON CONFLICT (id) DO UPDATE SET data = EXCLUDED.data, updated_at = now()`;
    return redirect('/configuracion?guardado=1');
  } catch (e) {
    return redirect('/configuracion?error=1');
  }
};
