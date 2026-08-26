// Cliente multi-IA con fallback (formato OpenAI /chat/completions). Mismo comportamiento que los
// nodos Code de n8n: prueba proveedores en orden y se queda con la primera respuesta válida.

async function callProvider(p, messages, { maxTokens = 1024, temperature = 0.4 }) {
  const headers = { 'Content-Type': 'application/json' };
  if (p.api_key) headers['Authorization'] = 'Bearer ' + p.api_key;
  const url = p.base_url.replace(/\/+$/, '') + '/chat/completions';
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 120000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model: p.model, messages, temperature, max_tokens: maxTokens }),
      signal: ctrl.signal,
    });
    const data = await res.json().catch(() => ({}));
    const c =
      data?.choices?.[0]?.message?.content ??
      data?.message?.content ??
      '';
    return typeof c === 'string' ? c : '';
  } catch {
    return '';
  } finally {
    clearTimeout(t);
  }
}

// providers: lista ordenada (de config.js). minLen: exige respuesta mínima (para generación).
export async function chat(providers, messages, { maxTokens = 1024, temperature = 0.4, minLen = 0 } = {}) {
  let firstAny = '';
  let firstProv = 'none';
  for (const p of providers) {
    const c = await callProvider(p, messages, { maxTokens, temperature });
    if (c && c.trim().length >= (minLen || 1)) return { content: c, provider: p.name };
    if (c && !firstAny) { firstAny = c; firstProv = p.name; }
  }
  return { content: firstAny, provider: firstAny ? firstProv : 'none' };
}
