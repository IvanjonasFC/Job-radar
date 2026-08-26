import type { APIRoute } from 'astro';
import { COOKIE } from '../../lib/auth';

const clear = (cookies: any, redirect: any) => {
  cookies.delete(COOKIE, { path: '/' });
  return redirect('/login');
};
export const GET: APIRoute = ({ cookies, redirect }) => clear(cookies, redirect);
export const POST: APIRoute = ({ cookies, redirect }) => clear(cookies, redirect);
