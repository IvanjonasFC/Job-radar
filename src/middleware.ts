// Protege todas las rutas si APP_PASSWORD está definido. Deja pasar los estáticos y el login.
import { defineMiddleware } from 'astro:middleware';
import { authEnabled, verifyToken, COOKIE } from './lib/auth';

const PUBLIC = new Set(['/login', '/api/login', '/api/logout']);

export const onRequest = defineMiddleware(async (ctx, next) => {
  if (!authEnabled()) return next();
  const p = ctx.url.pathname;
  if (p.startsWith('/_astro') || p.startsWith('/_image') || p === '/favicon.ico' || p === '/robots.txt' || PUBLIC.has(p)) {
    return next();
  }
  if (verifyToken(ctx.cookies.get(COOKIE)?.value)) return next();
  if (p.startsWith('/api/')) {
    return new Response(JSON.stringify({ ok: false, error: 'no autorizado' }), { status: 401, headers: { 'content-type': 'application/json' } });
  }
  return ctx.redirect('/login?next=' + encodeURIComponent(p + ctx.url.search));
});
