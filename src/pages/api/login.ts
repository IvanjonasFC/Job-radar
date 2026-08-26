import type { APIRoute } from 'astro';
import { passwordOk, makeToken, COOKIE, MAX_AGE, authEnabled } from '../../lib/auth';

export const POST: APIRoute = async ({ request, cookies, redirect, url }) => {
  if (!authEnabled()) return redirect('/');
  const f = await request.formData();
  const pw = String(f.get('password') || '');
  const nextRaw = String(f.get('next') || '/');
  const next = nextRaw.startsWith('/') ? nextRaw : '/';
  if (!passwordOk(pw)) return redirect('/login?error=1&next=' + encodeURIComponent(next));
  cookies.set(COOKIE, makeToken(), {
    httpOnly: true, sameSite: 'lax', path: '/', maxAge: MAX_AGE, secure: url.protocol === 'https:',
  });
  return redirect(next);
};
