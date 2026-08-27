// CLI para tareas puntuales sin servidor.
// Uso: score [n] | ingest | generar <id> | ia <id> <tipo> | guardar-carta <id>
//      | digest | health | recordatorios
import { scoreBatch } from './score.js';
import { ingestRSS } from './ingest.js';
import { generarCarta, ondemand } from './generate.js';
import { guardarCarta } from './exportdocs.js';
import { runDigest } from './digest.js';
import { healthcheck } from './health.js';
import { reminders } from './reminders.js';
import { pool } from './db.js';

const [cmd, a, b] = process.argv.slice(2);
const run = async () => {
  if (cmd === 'score') return scoreBatch(Number(a) || 30);
  if (cmd === 'ingest') return ingestRSS();
  if (cmd === 'generar') return generarCarta(Number(a));
  if (cmd === 'ia') return ondemand(Number(a), b || 'entrevista');
  if (cmd === 'guardar-carta') return guardarCarta(Number(a));
  if (cmd === 'digest') return runDigest();
  if (cmd === 'health') return healthcheck();
  if (cmd === 'recordatorios') return reminders();
  return { error: 'uso: score [n] | ingest | generar <id> | ia <id> <entrevista|carencias> | guardar-carta <id> | digest | health | recordatorios' };
};
run().then((r) => { console.log(JSON.stringify(r, null, 2)); return pool.end(); })
     .catch((e) => { console.error(e); process.exit(1); });
