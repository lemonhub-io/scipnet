import { createMiddleware } from 'hono/factory';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { USER_COLS, publicUser } from './db';
import type { AppEnv } from './types';
import { err, now } from './util';

export const SESSION_COOKIE = 'agora_session';
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days
const PBKDF2_ITERATIONS = 100_000; // Cloudflare WebCrypto caps PBKDF2 at 100k iterations

const enc = new TextEncoder();

const toHex = (b: ArrayBuffer | Uint8Array): string =>
  Array.from(b instanceof Uint8Array ? b : new Uint8Array(b))
    .map((x) => x.toString(16).padStart(2, '0'))
    .join('');

const fromHex = (hex: string): Uint8Array => {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
};

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations: PBKDF2_ITERATIONS },
    key,
    256,
  );
  return `pbkdf2$${PBKDF2_ITERATIONS}$${toHex(salt)}$${toHex(bits)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 4 || parts[0] !== 'pbkdf2') return false;
  const [, iterStr, saltHex, hashHex] = parts;
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', hash: 'SHA-256', salt: fromHex(saltHex), iterations: Number(iterStr) },
    key,
    256,
  );
  const a = new Uint8Array(bits);
  const b = fromHex(hashHex);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

const sha256Hex = async (text: string) => toHex(await crypto.subtle.digest('SHA-256', enc.encode(text)));

export async function createSession(env: { DB: D1Database }, userId: string): Promise<string> {
  const token = crypto.randomUUID() + crypto.randomUUID();
  const t = now();
  await env.DB.prepare('INSERT INTO sessions (id, user_id, created_at, expires_at) VALUES (?, ?, ?, ?)')
    .bind(await sha256Hex(token), userId, t, t + SESSION_TTL_MS)
    .run();
  return token;
}

export function setSessionCookie(c: Parameters<typeof setCookie>[0], token: string) {
  setCookie(c, SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'Lax',
    maxAge: SESSION_TTL_MS / 1000,
    secure: c.req.url.startsWith('https:'),
  });
}

export function clearSessionCookie(c: Parameters<typeof deleteCookie>[0]) {
  deleteCookie(c, SESSION_COOKIE, { path: '/' });
}

/** Resolves the session cookie into c.var.user (or null). Runs on every /api/* request. */
export const attachUser = createMiddleware<AppEnv>(async (c, next) => {
  c.set('user', null);
  const token = getCookie(c)[SESSION_COOKIE];
  if (token) {
    const row = await c.env.DB.prepare(
      `SELECT ${USER_COLS} FROM sessions s JOIN users u ON u.id = s.user_id
       WHERE s.id = ? AND s.expires_at > ?`,
    )
      .bind(await sha256Hex(token), now())
      .first();
    if (row) c.set('user', publicUser(row));
  }
  await next();
});

/** 401 unless a session user is present. */
export const requireUser = createMiddleware<AppEnv>(async (c, next) => {
  if (!c.get('user')) return err(c, 401, 'unauthorized', 'Sign in to continue.');
  await next();
});
