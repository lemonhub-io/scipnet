import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import { decodeAttestationObject, isoBase64URL, isoCBOR } from '@simplewebauthn/server/helpers';
import type {
  AuthenticationResponseJSON,
  AuthenticatorTransport,
  PublicKeyCredentialDescriptorJSON,
  RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { createSession, setSessionCookie } from '../auth';
import { USER_COLS, publicUser } from '../db';
import { errResp, publicUserSchema } from '../schemas';
import type { AppEnv } from '../types';
import { err, id as newId, now } from '../util';

const app = new OpenAPIHono<AppEnv>({ strict: false });

const CHALLENGE_TTL_MS = 10 * 60 * 1000; // 10 minutes — covers ceremony + signup form

// ES256 + RS256 — the algorithms every mainstream authenticator supports. EdDSA
// credentials exist on some devices but signature verify support is uneven on Workers.
const SUPPORTED_ALGOS = [-7, -257];

const rpFrom = (url: string) => {
  const u = new URL(url);
  return { rpID: u.hostname, origin: u.origin };
};

/**
 * We request attestation 'none' — device provenance isn't part of our trust model.
 * Some authenticators still return packed/tpm/apple statements; verifying those pulls
 * in cert-chain code paths that can throw on Workers. Strip the statement and keep
 * authData (challenge/origin/rpId are still fully verified).
 */
function neutralizeAttestation(response: RegistrationResponseJSON): RegistrationResponseJSON {
  try {
    const decoded = decodeAttestationObject(isoBase64URL.toBuffer(response.response.attestationObject));
    if (decoded.get('fmt') === 'none') return response;
    const stripped = isoCBOR.encode(
      new Map<string, string | Uint8Array | Map<string, never>>([
        ['fmt', 'none'],
        ['attStmt', new Map<string, never>()],
        ['authData', decoded.get('authData')],
      ]),
    );
    return {
      ...response,
      response: { ...response.response, attestationObject: isoBase64URL.fromBuffer(stripped) },
    };
  } catch {
    return response;
  }
}

/**
 * Run reads in a batch carrying a write so the batch executes on the D1 primary —
 * read replicas can briefly lag and return 'missing' for a challenge row written
 * seconds ago, which surfaces as a spurious verification failure.
 */
export function primaryBatch(db: D1Database, stmts: D1PreparedStatement[]) {
  return db.batch([
    db.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(now()),
    ...stmts,
  ]);
}

// The authenticator payloads are deeply nested; SimpleWebAuthn validates their
// internals. For OpenAPI we require the fields every response must carry.
const credentialResponse = z.looseObject({
  id: z.string(),
  rawId: z.string(),
  type: z.literal('public-key'),
  response: z.record(z.string(), z.unknown()),
});

const optionsSchema = z.object({
  token: z.string().openapi({ description: 'Challenge token — send back with the ceremony response' }),
  options: z.record(z.string(), z.unknown()).openapi({ description: 'WebAuthn options, ready for `startRegistration()` / `startAuthentication()`' }),
});

type ChallengeRow = {
  token: string;
  challenge: string;
  user_id: string | null;
  data: string | null;
  expires_at: number;
};

export interface StoredCredential {
  id: string;
  publicKey: string;
  counter: number;
  transports: string[];
  deviceType: string;
  backedUp: number;
  userHandle: string;
}

/** Returns the live challenge row, 'missing', or 'expired' (deleting it). */
async function getChallenge(db: D1Database, token: string, kind: 'register' | 'login') {
  const [, sel] = await primaryBatch(db, [
    db.prepare(
      'SELECT token, challenge, user_id, data, expires_at FROM webauthn_challenges WHERE token = ? AND kind = ?',
    ).bind(token, kind),
  ]);
  const row = sel.results[0] as ChallengeRow | undefined;
  if (!row) return 'missing' as const;
  if (row.expires_at < now()) {
    await db.prepare('DELETE FROM webauthn_challenges WHERE token = ?').bind(token).run();
    return 'expired' as const;
  }
  return row;
}

const challengeErr = (c: Parameters<typeof err>[0], state: 'missing' | 'expired') =>
  state === 'expired'
    ? err(c, 400, 'passkey_expired', 'That passkey ceremony expired — start again.')
    : err(c, 400, 'passkey_invalid', 'Invalid or unknown passkey ceremony.');

// ---------- Registration ceremony (pre-account) ----------

app.openapi(
  createRoute({
    method: 'post',
    path: '/register/options',
    tags: ['Auth', 'WebAuthn'],
    summary: 'Begin passkey registration',
    description:
      'Starts the mandatory passkey ceremony for a new account. Returns `PublicKeyCredentialCreationOptions` ' +
      'for `navigator.credentials.create()` (or `startRegistration()`). The returned token must later be sent ' +
      'to `/api/auth/register` as `webauthnToken` after the ceremony has been verified.',
    responses: {
      200: { description: 'Creation options + challenge token', content: { 'application/json': { schema: optionsSchema } } },
    },
  }),
  async (c) => {
    const { rpID } = rpFrom(c.req.url);
    const token = newId();
    const options = await generateRegistrationOptions({
      rpName: 'Agora',
      rpID,
      // No account exists yet — the handle and name are placeholders; the member
      // picks their real username in the second step of signup.
      userID: crypto.getRandomValues(new Uint8Array(32)),
      userName: `agora-member-${token.slice(0, 8)}`,
      userDisplayName: 'Agora member',
      attestationType: 'none',
      authenticatorSelection: { residentKey: 'preferred', userVerification: 'preferred' },
      supportedAlgorithmIDs: SUPPORTED_ALGOS,
    });

    const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(t),
      c.env.DB.prepare(
        'INSERT INTO webauthn_challenges (token, kind, challenge, data, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(token, 'register', options.challenge, JSON.stringify({ userHandle: options.user.id }), t + CHALLENGE_TTL_MS, t),
    ]);
    return c.json({ token, options }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/register/verify',
    tags: ['Auth', 'WebAuthn'],
    summary: 'Verify passkey registration',
    description:
      'Verifies the authenticator attestation against the stored challenge. On success the verified ' +
      'credential is held against the token until `/api/auth/register` consumes it.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: z.object({ token: z.string(), response: credentialResponse }) },
        },
      },
    },
    responses: {
      200: { description: 'Passkey verified', content: { 'application/json': { schema: z.object({ ok: z.literal(true) }) } } },
      400: errResp('Invalid, expired, or failed ceremony'),
    },
  }),
  async (c) => {
    const { token, response } = c.req.valid('json');
    const ch = await getChallenge(c.env.DB, token, 'register');
    if (typeof ch === 'string') return challengeErr(c, ch);

    const { rpID, origin } = rpFrom(c.req.url);
    try {
      const verification = await verifyRegistrationResponse({
        response: neutralizeAttestation(response as unknown as RegistrationResponseJSON),
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        // Options request userVerification:'preferred' — authenticators that don't
        // perform UV (no-PIN keys, password-manager passkeys) must still pass.
        requireUserVerification: false,
        supportedAlgorithmIDs: SUPPORTED_ALGOS,
      });
      const info = verification.registrationInfo;
      if (!verification.verified || !info) return err(c, 400, 'passkey_invalid', 'Passkey verification failed.');

      const prev = JSON.parse(ch.data ?? '{}') as { userHandle?: string };
      const credential: StoredCredential = {
        id: info.credential.id,
        publicKey: isoBase64URL.fromBuffer(info.credential.publicKey),
        counter: info.credential.counter,
        transports: info.credential.transports ?? [],
        deviceType: info.credentialDeviceType,
        backedUp: info.credentialBackedUp ? 1 : 0,
        userHandle: prev.userHandle ?? '',
      };
      // Extend the window so the member has time to pick a username/password.
      await c.env.DB.prepare('UPDATE webauthn_challenges SET data = ?, expires_at = ? WHERE token = ?')
        .bind(JSON.stringify({ credential }), now() + CHALLENGE_TTL_MS, token)
        .run();
      return c.json({ ok: true as const }, 200);
    } catch (e) {
      console.warn('webauthn register/verify failed:', (e as Error)?.message ?? e);
      return err(c, 400, 'passkey_invalid', 'Passkey verification failed.');
    }
  },
);

// ---------- Authentication ceremony ----------

app.openapi(
  createRoute({
    method: 'post',
    path: '/login/options',
    tags: ['Auth', 'WebAuthn'],
    summary: 'Begin passkey sign-in',
    description:
      'Returns `PublicKeyCredentialRequestOptions` for `navigator.credentials.get()`. Pass `username` to scope ' +
      'the prompt to that member’s passkeys; omit it for a discoverable-credential ("pick any passkey") prompt.',
    request: {
      body: {
        content: { 'application/json': { schema: z.object({ username: z.string().optional() }) } },
      },
    },
    responses: {
      200: { description: 'Request options + challenge token', content: { 'application/json': { schema: optionsSchema } } },
    },
  }),
  async (c) => {
    const { username } = c.req.valid('json') ?? {};
    const { rpID } = rpFrom(c.req.url);

    let userId: string | null = null;
    let allowCredentials: PublicKeyCredentialDescriptorJSON[] | undefined;
    if (username) {
      const u = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(username).first<{ id: string }>();
      if (u) {
        const { results } = await c.env.DB.prepare(
          'SELECT credential_id AS id, transports FROM webauthn_credentials WHERE user_id = ?',
        )
          .bind(u.id)
          .all<{ id: string; transports: string }>();
        if (results.length) {
          userId = u.id;
          allowCredentials = results.map((r) => ({
            id: r.id,
            type: 'public-key' as const,
            transports: JSON.parse(r.transports) as AuthenticatorTransport[],
          }));
        }
      }
    }

    const options = await generateAuthenticationOptions({
      rpID,
      allowCredentials,
      userVerification: 'preferred',
    });

    const token = newId();
    const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE expires_at < ?').bind(t),
      c.env.DB.prepare(
        'INSERT INTO webauthn_challenges (token, kind, challenge, user_id, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?)',
      ).bind(token, 'login', options.challenge, userId, t + CHALLENGE_TTL_MS, t),
    ]);
    return c.json({ token, options }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/login/verify',
    tags: ['Auth', 'WebAuthn'],
    summary: 'Verify passkey sign-in',
    description: 'Verifies the authenticator assertion and starts a session via the `agora_session` cookie.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': { schema: z.object({ token: z.string(), response: credentialResponse }) },
        },
      },
    },
    responses: {
      200: { description: 'Signed in', content: { 'application/json': { schema: z.object({ user: publicUserSchema }) } } },
      400: errResp('Invalid, expired, or failed ceremony'),
    },
  }),
  async (c) => {
    const { token, response } = c.req.valid('json');
    const assertion = response as unknown as AuthenticationResponseJSON;
    const ch = await getChallenge(c.env.DB, token, 'login');
    if (typeof ch === 'string') return challengeErr(c, ch);

    const [, credRes] = await primaryBatch(c.env.DB, [
      c.env.DB.prepare(
        'SELECT credential_id, user_id, public_key, counter, transports FROM webauthn_credentials WHERE credential_id = ?',
      ).bind(assertion.id),
    ]);
    const credRow = credRes.results[0] as
      | { credential_id: string; user_id: string; public_key: string; counter: number; transports: string }
      | undefined;
    if (!credRow) return err(c, 400, 'passkey_invalid', 'Unknown passkey.');
    if (ch.user_id && credRow.user_id !== ch.user_id) {
      return err(c, 400, 'passkey_invalid', 'That passkey belongs to a different account.');
    }

    const { rpID, origin } = rpFrom(c.req.url);
    let newCounter: number;
    try {
      const verification = await verifyAuthenticationResponse({
        response: assertion,
        expectedChallenge: ch.challenge,
        expectedOrigin: origin,
        expectedRPID: rpID,
        credential: {
          id: credRow.credential_id,
          publicKey: isoBase64URL.toBuffer(credRow.public_key),
          counter: credRow.counter,
          transports: JSON.parse(credRow.transports) as AuthenticatorTransport[],
        },
        requireUserVerification: false,
      });
      if (!verification.verified) return err(c, 400, 'passkey_invalid', 'Passkey verification failed.');
      newCounter = verification.authenticationInfo.newCounter;
    } catch (e) {
      console.warn('webauthn login/verify failed:', (e as Error)?.message ?? e);
      return err(c, 400, 'passkey_invalid', 'Passkey verification failed.');
    }

    await c.env.DB.batch([
      c.env.DB.prepare('UPDATE webauthn_credentials SET counter = ? WHERE credential_id = ?').bind(newCounter, credRow.credential_id),
      c.env.DB.prepare('DELETE FROM webauthn_challenges WHERE token = ?').bind(token),
    ]);

    setSessionCookie(c, await createSession(c.env, credRow.user_id));
    const user = await c.env.DB.prepare(`SELECT ${USER_COLS} FROM users u WHERE u.id = ?`).bind(credRow.user_id).first();
    return c.json({ user: publicUser(user) }, 200);
  },
);

export default app;
