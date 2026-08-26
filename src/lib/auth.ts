// Autenticación opcional y sin dependencias: una contraseña (APP_PASSWORD) + cookie de sesión
// firmada con HMAC (AUTH_SECRET). Si APP_PASSWORD está vacío, la auth queda DESACTIVADA
// (ideal para uso interno en LAN/VPN). Modular: todo vive aquí.
import crypto from 'node:crypto';

const env = (k: string) => (process.env[k] ?? (import.meta.env as any)[k] ?? '') as string;

export const APP_PASSWORD = env('APP_PASSWORD');
const SECRET = env('AUTH_SECRET') || 'cambia-esto-en-produccion';
export const COOKIE = 'empleo_sess';
export const MAX_AGE = 60 * 60 * 24 * 30; // 30 días

export const authEnabled = () => APP_PASSWORD.length > 0;

function hmac(data: string) {
  return crypto.createHmac('sha256', SECRET).update(data).digest('hex');
}
function safeEq(a: string, b: string) {
  const ba = Buffer.from(a), bb = Buffer.from(b);
  return ba.length === bb.length && crypto.timingSafeEqual(ba, bb);
}

export function makeToken(): string {
  const ts = Date.now().toString();
  return `${ts}.${hmac('v1.' + ts)}`;
}

export function verifyToken(tok?: string | null): boolean {
  if (!tok) return false;
  const i = tok.indexOf('.');
  if (i < 0) return false;
  const ts = tok.slice(0, i), sig = tok.slice(i + 1);
  if (!/^\d+$/.test(ts)) return false;
  if (Date.now() - Number(ts) > MAX_AGE * 1000) return false;
  return safeEq(sig, hmac('v1.' + ts));
}

export function passwordOk(pw: string): boolean {
  if (!APP_PASSWORD) return false;
  const a = crypto.createHash('sha256').update(String(pw)).digest();
  const b = crypto.createHash('sha256').update(APP_PASSWORD).digest();
  return crypto.timingSafeEqual(a, b);
}
