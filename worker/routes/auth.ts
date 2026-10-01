import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import {
  SESSION_COOKIE,
  clearSessionCookie,
  createSession,
  hashPassword,
  setSessionCookie,
  verifyPassword,
} from '../auth';
import { USER_COLS, publicUser } from '../db';
import { errResp, passwordSchema, publicUserSchema, usernameSchema } from '../schemas';
import type { AppEnv } from '../types';
import { err, id as newId, now } from '../util';
import { getCookie } from 'hono/cookie';
import { primaryBatch, type StoredCredential } from './webauthn';

const enc = new TextEncoder();
const sha256Hex = async (t: string) =>
  Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(t))))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');

const app = new OpenAPIHono<AppEnv>({ strict: false });

const credentials = z.object({ username: usernameSchema, password: passwordSchema });

app.openapi(
  createRoute({
    method: 'post',
    path: '/register',
    tags: ['Auth'],
    summary: 'Create an account',
    description:
      'Registers a new member and starts a session. The session token is returned as an `agora_session` HttpOnly ' +
      'cookie. A verified passkey ceremony is required first: complete ' +
      '`POST /api/auth/webauthn/register/options` → `startRegistration()` → `/register/verify`, then send the ' +
      'issued token as `webauthnToken`.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: credentials.extend({
              displayName: z.string().min(1).max(50).optional(),
              webauthnToken: z
                .string()
                .min(1)
                .openapi({ description: 'Token from a verified passkey registration ceremony' }),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Account created', content: { 'application/json': { schema: z.object({ user: publicUserSchema }) } } },
      400: errResp('Validation failed or missing passkey ceremony'),
      409: errResp('Username already taken'),
    },
  }),
  async (c) => {
    const { username, password, displayName, webauthnToken } = c.req.valid('json');
    // Reads route to the D1 primary via the write-carrying batch — replicas can lag.
    const [, existsRes, chRes] = await primaryBatch(c.env.DB, [
      c.env.DB.prepare('SELECT 1 AS x FROM users WHERE username = ?').bind(username),
      c.env.DB.prepare(
        "SELECT data, expires_at FROM webauthn_challenges WHERE token = ? AND kind = 'register'",
      ).bind(webauthnToken),
    ]);
    if (existsRes.results[0]) return err(c, 409, 'username_taken', 'That username is taken.');

    // Registration is gated on a verified passkey ceremony.
    const ch = chRes.results[0] as { data: string | null; expires_at: number } | undefined;
    if (ch && ch.expires_at < now()) {
      await c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE token = ?').bind(webauthnToken).run();
      return err(c, 400, 'passkey_expired', 'That passkey ceremony expired — verify your passkey again.');
    }
    const credential = (JSON.parse(ch?.data ?? '{}') as { credential?: StoredCredential }).credential;
    if (!ch || !credential) {
      return err(c, 400, 'passkey_required', 'Verify a passkey before creating your account.');
    }

    const user = {
      id: newId(),
      username,
      displayName: displayName ?? username,
      passwordHash: await hashPassword(password),
      createdAt: now(),
    };
    try {
      await c.env.DB.batch([
        c.env.DB.prepare(
          'INSERT INTO users (id, username, display_name, password_hash, created_at) VALUES (?, ?, ?, ?, ?)',
        ).bind(user.id, user.username, user.displayName, user.passwordHash, user.createdAt),
        c.env.DB.prepare(
          `INSERT INTO webauthn_credentials
             (credential_id, user_id, public_key, counter, transports, device_type, backed_up, user_handle, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        ).bind(
          credential.id,
          user.id,
          credential.publicKey,
          credential.counter,
          JSON.stringify(credential.transports),
          credential.deviceType,
          credential.backedUp,
          credential.userHandle,
          user.createdAt,
        ),
        c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE token = ?').bind(webauthnToken),
      ]);
    } catch {
      return err(c, 400, 'passkey_invalid', 'That passkey is already registered to another account.');
    }

    setSessionCookie(c, await createSession(c.env, user.id));
    const row = await c.env.DB.prepare(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`).bind(user.id).first();
    return c.json({ user: publicUser(row) }, 201);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/login',
    tags: ['Auth'],
    summary: 'Sign in',
    description: 'Verifies credentials and starts a session via the `agora_session` HttpOnly cookie.',
    request: { body: { required: true, content: { 'application/json': { schema: credentials } } } },
    responses: {
      200: { description: 'Signed in', content: { 'application/json': { schema: z.object({ user: publicUserSchema }) } } },
      400: errResp('Validation failed'),
      401: errResp('Invalid credentials'),
    },
  }),
  async (c) => {
    const { username, password } = c.req.valid('json');
    const row = await c.env.DB.prepare(`SELECT ${USER_COLS}, u.password_hash AS passwordHash FROM users u WHERE u.username = ?`)
      .bind(username)
      .first();
    if (!row || !(await verifyPassword(password, row.passwordHash as string))) {
      return err(c, 401, 'invalid_credentials', 'Incorrect username or password.');
    }
    setSessionCookie(c, await createSession(c.env, row.id as string));
    return c.json({ user: publicUser(row) }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/logout',
    tags: ['Auth'],
    summary: 'Sign out',
    description: 'Destroys the current session and clears the cookie. Safe to call when not signed in.',
    responses: { 204: { description: 'Signed out' } },
  }),
  async (c) => {
    const token = getCookie(c)[SESSION_COOKIE];
    if (token) {
      await c.env.DB.prepare('DELETE FROM sessions WHERE id = ?').bind(await sha256Hex(token)).run();
    }
    clearSessionCookie(c);
    return c.body(null, 204);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/me',
    tags: ['Auth'],
    summary: 'Current session user',
    responses: {
      200: { description: 'The signed-in user', content: { 'application/json': { schema: z.object({ user: publicUserSchema }) } } },
      401: errResp('Not signed in'),
    },
  }),
  (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Not signed in.');
    return c.json({ user }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'patch',
    path: '/me',
    tags: ['Auth'],
    summary: 'Update profile',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              displayName: z.string().min(1).max(50).optional(),
              bio: z.string().max(280).optional(),
            }),
          },
        },
      },
    },
    responses: {
      200: { description: 'Profile updated', content: { 'application/json': { schema: z.object({ user: publicUserSchema }) } } },
      400: errResp('Validation failed'),
      401: errResp('Not signed in'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const { displayName, bio } = c.req.valid('json');
    await c.env.DB.prepare(
      `UPDATE users SET display_name = COALESCE(?, display_name), bio = COALESCE(?, bio) WHERE id = ?`,
    )
      .bind(displayName ?? null, bio ?? null, user.id)
      .run();
    const row = await c.env.DB.prepare(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`).bind(user.id).first();
    return c.json({ user: publicUser(row) }, 200);
  },
);

export default app;
