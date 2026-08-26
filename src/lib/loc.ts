// Normaliza ubicación y modalidad para todo el CRM (fuente única de la lógica).
// Enfoque del candidato: Remoto en toda España · Híbrido/Remoto · y presencial/híbrido en Asturias (Gijón).
// Convierte las cadenas sucias de los portales (Indeed, LinkedIn…) en algo legible y robusto.

const REGION: Record<string, string> = {
  MD: 'Madrid', CT: 'Cataluña', PV: 'País Vasco', AN: 'Andalucía', AR: 'Aragón',
  GA: 'Galicia', VC: 'C. Valenciana', CL: 'Castilla y León', CM: 'Castilla-La Mancha',
  CN: 'Canarias', AS: 'Asturias', MC: 'Murcia', EX: 'Extremadura', IB: 'Baleares',
  RI: 'La Rioja', NC: 'Navarra', CB: 'Cantabria', ML: 'Melilla', CE: 'Ceuta', ES: 'España',
};

// Concejos/ciudades de Asturias que interesan (presencial/híbrido local viable).
const ASTUR_RX = /asturi|principado|gij[oó]n|ovied|avil[eé]s|langreo|mieres|siero|llanera|nore[ñn]a|corvera|pola de/i;
const CIUDAD_AST = /gij[oó]n|ovied[oa]|avil[eé]s/i;
const NOPLACE_RX = /^(100%\s*)?(en\s*)?(remoto?|remote|teletrabajo|anywhere.*|worldwide|europe|full[\s-]*remote|desde casa|home\s*office)$/i;
const ESPANA_RX = /^(es|esp|españa|spain)$/i;
const REMOTO_RX = /remot|teletrab|anywhere|desde casa|home\s*office|full[\s-]*remote/i;
const HIBRIDO_RX = /h[ií]brid|semipresen|hybrid/i;
const PRESEN_RX = /presencial|on[\s-]*site|in[\s-]*office|oficina/i;

const cap = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1).toLowerCase() : t);

/** True si la oferta es de Asturias (interés local del candidato). */
export function esAsturias(loc: any, mod?: any): boolean {
  return ASTUR_RX.test(String(loc || '') + ' ' + String(mod || ''));
}

/** Modalidad normalizada a Remoto | Híbrido | Presencial | '' (mira también la ubicación). */
export function cleanMod(mm: any, loc?: any): string {
  const s = (String(mm || '') + ' ' + String(loc || '')).toLowerCase();
  if (HIBRIDO_RX.test(s)) return 'Híbrido';
  if (REMOTO_RX.test(s)) return 'Remoto';
  if (PRESEN_RX.test(s)) return 'Presencial';
  return '';
}

/** Lugar geográfico legible ('' si es puramente remoto sin país). */
export function cleanLoc(loc: any): string {
  const s = String(loc || '').trim();
  if (!s) return '';
  if (ASTUR_RX.test(s)) {
    const m = s.match(CIUDAD_AST);
    return m ? cap(m[0]) : 'Asturias';
  }
  let first = s.split(',')[0].trim();
  if (NOPLACE_RX.test(first)) {
    return /\b(es|esp|españa|spain)\b/i.test(s) ? 'España' : '';
  }
  if (/^[A-Z]{2}$/.test(first)) return REGION[first] || first;
  if (ESPANA_RX.test(first)) return 'España';
  first = first.replace(/^(provincia de|área de|area de|comunidad de|region de|región de)\s+/i, '');
  return first;
}

/** Texto final para mostrar: "Asturias · Híbrido", "Remoto", "España · Remoto"… */
export function ubi(o: { location?: any; modalidad?: any }): string {
  const l = cleanLoc(o.location);
  const m = cleanMod(o.modalidad, o.location);
  if (!l && !m) return '—';
  if (l && m && l.toLowerCase() !== m.toLowerCase()) return `${l} · ${m}`;
  return l || m;
}
