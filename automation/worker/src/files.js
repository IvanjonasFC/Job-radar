// Utilidades de escritura a disco para las exportaciones del worker (TABLERO, CSV, cartas,
// recordatorios, salud). Equivale a los nodos "Guardar ... (fs)" de n8n.
//
// EXPORT_DIR: carpeta raíz donde se vuelca todo (igual que el /vault/Ofertas que montaba n8n).
// Por defecto /vault/Ofertas para mantener paridad; móntala como volumen en Docker. Si no se
// puede escribir, las funciones devuelven { ok:false } sin romper el flujo (best-effort).
import fs from 'node:fs';
import path from 'node:path';

export const EXPORT_DIR = (process.env.EXPORT_DIR || '/vault/Ofertas').replace(/\/+$/, '');

// ¿Están activadas las exportaciones a fichero? (por defecto sí, para igualar a n8n).
export const EXPORT_ON = !/^(0|false|no|off)$/i.test(process.env.EXPORT_FILES || '1');

// Escribe un fichero creando su carpeta. Nunca lanza: devuelve el resultado.
export function writeFileSafe(absPath, content) {
  try {
    fs.mkdirSync(path.dirname(absPath), { recursive: true });
    fs.writeFileSync(absPath, content, 'utf8');
    return { ok: true, path: absPath };
  } catch (e) {
    return { ok: false, path: absPath, error: String((e && e.message) || e) };
  }
}

// Mueve una carpeta (con fallback a copiar+borrar entre volúmenes). Best-effort.
export function moveDirSafe(oldFolder, newFolder) {
  try {
    if (!fs.existsSync(oldFolder)) return { ok: false, error: 'origen no existe: ' + oldFolder };
    fs.mkdirSync(path.dirname(newFolder), { recursive: true });
    try {
      fs.renameSync(oldFolder, newFolder);
    } catch {
      fs.cpSync(oldFolder, newFolder, { recursive: true });
      fs.rmSync(oldFolder, { recursive: true, force: true });
    }
    return { ok: true, path: newFolder };
  } catch (e) {
    return { ok: false, error: String((e && e.message) || e) };
  }
}

// slug para nombres de carpeta (igual criterio que WF3).
export function slugify(s) {
  return String(s || '')
    .replace(/[^a-zA-Z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 50);
}

// Limpia un fragmento para usarlo en un nombre de fichero.
export function cleanName(s) {
  return String(s || '').split('/').join('-').split(':').join('-').trim().slice(0, 70);
}
