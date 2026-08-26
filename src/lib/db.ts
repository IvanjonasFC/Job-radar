// Cliente de BD: Postgres `empleo` (usuario `empleo_web`, minimos privilegios).
// Fuente de verdad unica; la web solo lee/escribe. No hay BD propia.
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';

const url = import.meta.env.DATABASE_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error('Falta DATABASE_URL (ver Web/04 - Stack, setup y variables.md).');

// search_path=empleo va en la URL (?options=-c%20search_path%3Dempleo).
const client = postgres(url, { max: 5 });
export const db = drizzle(client);
export { client as sql };

// Nota: tras crear el usuario y aplicar v6-web.sql, generar el schema tipado con:
//   pnpm drizzle-kit pull   → src/lib/schema.ts
// y usar `db` con ese schema. De momento se puede consultar con SQL crudo via `sql`.
