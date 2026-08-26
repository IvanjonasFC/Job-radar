// CLI para tareas puntuales sin servidor: `node src/cli.js score` | `ingest` | `generar <id>` | `ia <id> <tipo>`
import { scoreBatch } from './score.js';
import { ingestRSS } from './ingest.js';
import { generarCarta, ondemand } from './generate.js';
import { pool } from './db.js';

const [cmd, a, b] = process.argv.slice(2);
const run = async () => {
  if (cmd === 'score') return scoreBatch(Number(a) || 30);
  if (cmd === 'ingest') return ingestRSS();
  if (cmd === 'generar') return generarCarta(Number(a));
  if (cmd === 'ia') return ondemand(Number(a), b || 'entrevista');
  return { error: 'uso: score [n] | ingest | generar <id> | ia <id> <entrevista|carencias>' };
};
run().then((r) => { console.log(JSON.stringify(r, null, 2)); return pool.end(); })
     .catch((e) => { console.error(e); process.exit(1); });
