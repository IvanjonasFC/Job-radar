// Servidor del worker: expone los MISMOS endpoints que los webhooks de n8n (drop-in), corre el
// bucle de scoring y, opcionalmente, la ingesta RSS. Sin dependencias más allá de `pg`.
//
// Compatibilidad drop-in: la web llama por GET a `<N8N_WEBHOOK_BASE>-generar?id=N`, `-aplicar`,
// `-descartar`, `-ia?id=N&tipo=...` y `-radar`. Apunta N8N_WEBHOOK_BASE al worker, p.ej.
//   N8N_WEBHOOK_BASE=http://empleo-worker:8080/empleo
// y el worker responde a /empleo-generar, /empleo-aplicar, etc.
import http from 'node:http';
import { scoreBatch } from './score.js';
import { generarCarta, ondemand } from './generate.js';
import { aplicar, descartar } from './actions.js';
import { ingestRSS } from './ingest.js';
import { runDigest } from './digest.js';
import { healthcheck } from './health.js';
import { reminders } from './reminders.js';
import { guardarCarta } from './exportdocs.js';

const PORT = Number(process.env.PORT || 8080);
const SCORE_MIN = Number(process.env.SCORE_INTERVAL_MIN || 15);
const INGEST_MIN = Number(process.env.INGEST_INTERVAL_MIN || 360);
const INGEST_ON = /^(1|true|yes)$/i.test(process.env.INGEST_RSS || '0');

// Tareas periódicas de paridad con n8n (todas menos Telegram). ON por defecto; se apagan
// individualmente con DIGEST_ON=0 / HEALTH_ON=0 / REMIND_ON=0.
const flag = (name, def) => !/^(0|false|no|off)$/i.test(process.env[name] || def);
const DIGEST_ON = flag('DIGEST_ON', '1');
const HEALTH_ON = flag('HEALTH_ON', '1');
const REMIND_ON = flag('REMIND_ON', '1');
const DIGEST_MIN = Number(process.env.DIGEST_INTERVAL_MIN || 720);   // ~ WF2 (9:00 y 20:00)
const HEALTH_MIN = Number(process.env.HEALTH_INTERVAL_MIN || 1440);  // ~ WF4 (diario 08:00)
const REMIND_MIN = Number(process.env.REMIND_INTERVAL_MIN || 1440);  // ~ WF5 (diario 08:30)

const log = (...a) => console.log(new Date().toISOString(), ...a);
const json = (res, code, obj) => { res.writeHead(code, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };

// Lanza el trabajo en segundo plano y responde ya (como n8n onReceived).
function background(res, label, fn) {
  json(res, 200, { ok: true, queued: label });
  Promise.resolve().then(fn).then((r) => log(label, 'OK', r || '')).catch((e) => log(label, 'ERROR', e.message));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url, 'http://localhost');
  const p = u.pathname;
  const id = Number(u.searchParams.get('id') || 0);
  const tipo = u.searchParams.get('tipo') || 'entrevista';

  if (p === '/health' || p === '/') return json(res, 200, { ok: true, service: 'empleo-worker' });
  if (p.endsWith('-radar')) return background(res, 'radar', async () => {
    const ing = INGEST_ON ? await ingestRSS() : null;
    const sc = await scoreBatch(30);
    return { ingest: ing, score: sc };
  });
  if (p.endsWith('-generar') && id) return background(res, `generar#${id}`, () => generarCarta(id));
  if (p.endsWith('-aplicar') && id) return background(res, `aplicar#${id}`, () => aplicar(id));
  if (p.endsWith('-descartar') && id) return background(res, `descartar#${id}`, () => descartar(id));
  if (p.endsWith('-ia') && id) return background(res, `ia#${id}:${tipo}`, () => ondemand(id, tipo));
  if (p.endsWith('-guardar-carta') && id) return background(res, `guardar-carta#${id}`, () => guardarCarta(id));
  // Paridad n8n (sin Telegram): disparo manual on-demand además de sus bucles.
  if (p.endsWith('-digest')) return background(res, 'digest', () => runDigest());
  if (p.endsWith('-health')) return background(res, 'health', () => healthcheck());
  if (p.endsWith('-recordatorios')) return background(res, 'recordatorios', () => reminders());

  json(res, 404, { ok: false, error: 'ruta no reconocida' });
});

server.listen(PORT, () => {
  log(`empleo-worker escuchando en :${PORT} · scoring cada ${SCORE_MIN} min · ingesta RSS ${INGEST_ON ? 'ON cada ' + INGEST_MIN + ' min' : 'OFF'}`);
  // Bucle de scoring (equivale al schedule de WF1).
  const runScore = () => scoreBatch(30).then((r) => log('score-loop', r)).catch((e) => log('score-loop ERROR', e.message));
  setInterval(runScore, SCORE_MIN * 60 * 1000);
  setTimeout(runScore, 5000);
  // Bucle de ingesta RSS (opcional).
  if (INGEST_ON) {
    const runIngest = () => ingestRSS().then((r) => log('ingest-loop', r)).catch((e) => log('ingest-loop ERROR', e.message));
    setInterval(runIngest, INGEST_MIN * 60 * 1000);
    setTimeout(runIngest, 8000);
  }
  // Paridad n8n (todas menos Telegram): digest (WF2), healthcheck+caducar (WF4), recordatorios (WF5).
  const loop = (name, on, min, fn, delayMs) => {
    if (!on) return;
    const run = () => fn().then((r) => log(name + '-loop', r)).catch((e) => log(name + '-loop ERROR', e.message));
    setInterval(run, min * 60 * 1000);
    setTimeout(run, delayMs);
    log(`${name}: ON cada ${min} min`);
  };
  loop('digest', DIGEST_ON, DIGEST_MIN, runDigest, 12000);
  loop('health', HEALTH_ON, HEALTH_MIN, healthcheck, 16000);
  loop('recordatorios', REMIND_ON, REMIND_MIN, reminders, 20000);
});
