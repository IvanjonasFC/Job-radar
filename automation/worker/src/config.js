// Lee la configuración del sistema desde empleo.settings (lo que define la pestaña Config de la web).
// Las claves de IA se toman de settings.data.ia; si falta, del entorno (.env). Así el worker es
// configurable sin tocar código: cualquiera pone sus claves en la web o en el .env.
import { one } from './db.js';

const DEFAULT_PERFIL_FALLBACK =
  'Perfil profesional del candidato. Rellénalo en la pestaña Config de la web (sección Tu perfil).';

export async function getSettings() {
  try {
    const row = await one(`SELECT data FROM empleo.settings WHERE id = 1`);
    return (row && row.data) || {};
  } catch {
    return {};
  }
}

// Perfil que usa la IA (de Config; fallback a un texto genérico).
export function getPerfil(settings) {
  const p = (settings.perfil || '').toString().trim();
  return p.length > 20 ? p : DEFAULT_PERFIL_FALLBACK;
}

// Endpoints públicos por defecto (compatibles con OpenAI). El usuario solo pone su clave.
const PROVIDER_DEFAULTS = {
  groq: { base_url: 'https://api.groq.com/openai/v1', model_score: 'openai/gpt-oss-20b', model_gen: 'openai/gpt-oss-120b' },
  gemini: { base_url: 'https://generativelanguage.googleapis.com/v1beta/openai', model_score: 'gemini-2.0-flash', model_gen: 'gemini-2.0-flash' },
  xai: { base_url: 'https://api.x.ai/v1', model_score: 'grok-3', model_gen: 'grok-3' },
  ollama: { base_url: process.env.OLLAMA_URL || 'http://localhost:11434/v1', model_score: 'qwen3:8b', model_gen: 'qwen3:8b' },
};

// Construye la lista ordenada de proveedores de IA con su clave (Config → env).
export function getProviders(settings, mode /* 'score' | 'gen' */) {
  const ia = settings.ia || {};
  const key = (name, envVar) => (ia[name + '_key'] || process.env[envVar] || '').toString().trim();
  const base = (name) => (ia[name + '_url'] || '').toString().trim() || PROVIDER_DEFAULTS[name].base_url;
  const model = (name) => (ia[`${name}_model_${mode}`] || ia[`${name}_model`] || '').toString().trim()
    || (mode === 'gen' ? PROVIDER_DEFAULTS[name].model_gen : PROVIDER_DEFAULTS[name].model_score);

  const order = Array.isArray(ia.order) && ia.order.length ? ia.order : ['groq', 'gemini', 'xai', 'ollama'];
  const out = [];
  for (const name of order) {
    if (!PROVIDER_DEFAULTS[name]) continue;
    const apiKey = key(name, {
      groq: 'GROQ_API_KEY', gemini: 'GEMINI_API_KEY', xai: 'XAI_API_KEY', ollama: 'OLLAMA_KEY',
    }[name]);
    // Ollama no necesita clave; los demás sí.
    if (name !== 'ollama' && !apiKey) continue;
    out.push({ name, base_url: base(name), api_key: apiKey, model: model(name) });
  }
  return out;
}
