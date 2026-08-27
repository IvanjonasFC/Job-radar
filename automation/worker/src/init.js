// Crea la estructura de carpetas de salida (el "vault") para que cualquier usuario nuevo tenga
// la misma organización, con READMEs que explican cada carpeta. Idempotente: no pisa lo que ya
// exista. Se ejecuta solo al arrancar el server y también a mano con `node src/cli.js init`.
import fs from 'node:fs';
import { EXPORT_DIR } from './files.js';

const NL = '\n';

// carpeta -> texto del README que la explica
const TREE = {
  '': [
    '# Vault de búsqueda de empleo',
    '',
    'Estructura creada y mantenida automáticamente por el worker (o n8n). Cada carpeta es una fase:',
    '',
    '- **01_Inbox/** — ofertas con carta+CV generados, pendientes de revisar/postular.',
    '- **02_Postuladas/** — ofertas a las que ya te has postulado (seguimiento).',
    '- **03_Descartadas/** — ofertas descartadas (se conservan por si acaso).',
    '',
    'Ficheros en la raíz:',
    '- **_TABLERO.md** — panel general (estados, oportunidades abiertas, pipeline).',
    '- **candidaturas.csv** — export para Excel/Sheets.',
    '- **_SALUD.md** — healthcheck del sistema.',
    '- **_RECORDATORIOS.md** — avisos de entrevistas y seguimientos.',
    '',
    'Puedes abrir esta carpeta con Obsidian o cualquier editor de Markdown.',
  ],
  '01_Inbox': [
    '# 01 · Inbox',
    '',
    'Ofertas con **carta y ajustes de CV ya generados**, esperando tu decisión.',
    'Cada oferta es una subcarpeta con `_Oferta.md`, `Carta de presentacion.md` y `Ajustes CV.md`.',
    'Al **postular** pasan a `02_Postuladas/`; al **descartar**, a `03_Descartadas/`.',
  ],
  '02_Postuladas': [
    '# 02 · Postuladas',
    '',
    'Ofertas a las que ya te postulaste. El worker vigila el seguimiento (ver `_RECORDATORIOS.md`).',
  ],
  '03_Descartadas': [
    '# 03 · Descartadas',
    '',
    'Ofertas descartadas. Se conservan como archivo histórico; no se borran solas.',
  ],
};

export function initStructure() {
  const created = [];
  for (const [sub, lines] of Object.entries(TREE)) {
    const dir = sub ? EXPORT_DIR + '/' + sub : EXPORT_DIR;
    try {
      fs.mkdirSync(dir, { recursive: true });
      const readme = dir + '/README.md';
      if (!fs.existsSync(readme)) {
        fs.writeFileSync(readme, lines.join(NL) + NL, 'utf8');
        created.push(sub || '(raíz)');
      }
    } catch (e) {
      return { ok: false, error: String((e && e.message) || e), dir };
    }
  }
  return { ok: true, base: EXPORT_DIR, created };
}
