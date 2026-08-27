// Configuración del sistema, guardada en empleo.settings (fila única id=1, columna jsonb `data`).
// La web lee esto para decidir qué ofertas "encajan" con tu zona/modalidad y para la cola de hoy.
// Si la tabla no existe todavía, se usan los valores por defecto (la web no se rompe).
import { sql } from './db';
import { cleanMod } from './loc';

export type Config = {
  titular: string;            // marca de la cabecera ("Empleo <titular>")
  local_region: string;      // etiqueta legible de tu zona
  local_cities: string[];    // ciudades/regiones que cuentan como "tu zona"
  local_modalidades: string[];  // modalidades que aceptas EN tu zona
  resto_modalidades: string[];  // modalidades que aceptas FUERA de tu zona
  min_score_cola: number;    // score mínimo para la "cola de hoy"
  include_keywords: string[]; // puestos que quieres (título)
  exclude_keywords: string[]; // puestos a excluir (título)
  // Fuentes de scraping (las lee el propio scraper desde la BD)
  sites: string[];           // indeed, linkedin, glassdoor, google...
  search_terms: string[];    // términos de búsqueda
  countries: string[];       // países JobSpy (spain, mexico...)
  home_location: string;     // localización principal ("Madrid, Spain")
  rss_feeds: string[];       // feeds RSS extra
  hours_old: number;         // antigüedad máx. de la oferta (horas)
  results_wanted: number;    // resultados por búsqueda
  // Perfil del candidato (lo usa la IA para cartas/CV y prep de entrevista).
  // Editable desde Config y guardado en la BD → el sistema NO depende del vault de Obsidian.
  nombre: string;
  email: string;
  telefono: string;
  github: string;
  web: string;
  perfil: string;            // texto largo, un dato por línea (experiencia, stack, proyectos…)
  // Claves de IA (las usa el worker y, si migras los flujos, n8n). Con una basta; el resto es fallback.
  ia: {
    groq_key: string;
    gemini_key: string;
    xai_key: string;
    ollama_url: string;      // IA local sin clave (opcional)
  };
};

export const DEFAULTS: Config = {
  titular: 'MiBúsqueda',
  local_region: '',
  local_cities: [],
  local_modalidades: ['presencial', 'hibrido', 'remoto'],
  resto_modalidades: ['remoto'],
  min_score_cola: 80,
  include_keywords: [],
  exclude_keywords: ['comercial', 'ventas', 'camarero', 'teleoperador', 'marketing', 'administrativo'],
  sites: ['indeed', 'linkedin'],
  search_terms: ['desarrollador', 'programador', 'full stack developer', 'backend developer', 'frontend developer', 'devops', 'administrador de sistemas', 'data engineer'],
  countries: ['spain'],
  home_location: '',
  rss_feeds: ['https://weworkremotely.com/categories/remote-programming-jobs.rss'],
  hours_old: 168,
  results_wanted: 40,
  // Vacíos por defecto: el perfil real se rellena desde la pestaña Config y vive en la BD
  // (así el repo no lleva datos personales). Ver automation/n8n/profile.example.md.
  nombre: '',
  email: '',
  telefono: '',
  github: '',
  web: '',
  perfil: '',
  ia: { groq_key: '', gemini_key: '', xai_key: '', ollama_url: '' },
};

export async function getConfig(): Promise<Config> {
  try {
    const [row] = await sql<any[]>`SELECT data FROM empleo.settings WHERE id = 1`;
    if (row?.data) {
      const d = row.data as Partial<Config>;
      return { ...DEFAULTS, ...d, ia: { ...DEFAULTS.ia, ...(d.ia || {}) } };
    }
  } catch { /* tabla aún sin crear → defaults */ }
  return { ...DEFAULTS };
}

const norm = (s: any) => String(s ?? '').toLowerCase();

/** ¿La oferta es de tu zona local? (según las ciudades configuradas) */
export function esLocal(loc: any, mod: any, cfg: Config): boolean {
  const hay = norm(loc) + ' ' + norm(mod);
  return cfg.local_cities.some((c) => c && hay.includes(norm(c)));
}

/** Modalidad simplificada: 'remoto' | 'hibrido' | 'presencial' | '' */
export function modKey(mod: any, loc?: any): string {
  const m = cleanMod(mod, loc);
  if (/remot/i.test(m)) return 'remoto';
  if (/h[ií]brid/i.test(m)) return 'hibrido';
  if (/presencial/i.test(m)) return 'presencial';
  return '';
}

/** ¿La oferta encaja con tus criterios de zona + modalidad? */
export function matchPref(o: { location?: any; modalidad?: any }, cfg: Config): boolean {
  const local = esLocal(o.location, o.modalidad, cfg);
  const mk = modKey(o.modalidad, o.location);
  if (local) {
    // En tu zona: vale cualquier modalidad aceptada; si no se conoce, se acepta por ser local.
    return mk === '' || cfg.local_modalidades.includes(mk);
  }
  // Fuera de tu zona: solo las modalidades aceptadas para el resto (por defecto, remoto).
  return mk !== '' && cfg.resto_modalidades.includes(mk);
}

// ---- Opciones para la pestaña de configuración (controles guiados, sin teclear a mano) ----
export const SITE_OPTIONS: { v: string; l: string; note?: string; reliable?: boolean }[] = [
  { v: 'indeed', l: 'Indeed', note: 'recomendado', reliable: true },
  { v: 'linkedin', l: 'LinkedIn', note: 'suele requerir proxy' },
  { v: 'glassdoor', l: 'Glassdoor', note: 'inestable' },
  { v: 'google', l: 'Google Jobs', note: 'requiere proxy' },
  { v: 'zip_recruiter', l: 'ZipRecruiter', note: 'sobre todo EE. UU.' },
];
export const COUNTRY_OPTIONS: { v: string; l: string }[] = [
  { v: 'spain', l: 'España' }, { v: 'portugal', l: 'Portugal' }, { v: 'france', l: 'Francia' },
  { v: 'germany', l: 'Alemania' }, { v: 'italy', l: 'Italia' }, { v: 'uk', l: 'Reino Unido' },
  { v: 'ireland', l: 'Irlanda' }, { v: 'netherlands', l: 'Países Bajos' },
  { v: 'mexico', l: 'México' }, { v: 'argentina', l: 'Argentina' }, { v: 'colombia', l: 'Colombia' },
  { v: 'chile', l: 'Chile' }, { v: 'peru', l: 'Perú' }, { v: 'usa', l: 'EE. UU.' },
];
export const ROLE_OPTIONS: string[] = [
  'desarrollador', 'programador', 'full stack developer', 'backend developer', 'frontend developer',
  'devops', 'administrador de sistemas', 'data engineer', 'python developer', 'java developer',
  'react developer', 'angular developer', 'soporte informatico', 'cloud engineer', 'ciberseguridad', 'qa tester',
];
export const HOURS_OPTIONS: { v: number; l: string }[] = [
  { v: 24, l: 'Últimas 24 horas' }, { v: 72, l: 'Últimos 3 días' }, { v: 168, l: 'Última semana' },
  { v: 336, l: 'Últimas 2 semanas' }, { v: 720, l: 'Último mes' },
];
