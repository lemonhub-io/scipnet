import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { errResp } from '../schemas';
import { pushToUsers } from '../push';
import type { AppEnv } from '../types';
import { err, id, now } from '../util';

const app = new OpenAPIHono<AppEnv>({ strict: false });

const subBody = z.object({
  endpoint: z.url(),
  expirationTime: z.number().nullable().optional(),
  keys: z.object({ p256dh: z.string().min(1), auth: z.string().min(1) }),
  lang: z.enum(['en', 'zh']).optional(),
});

/* GET /vapid — the public applicationServerKey for pushManager.subscribe.    */

app.openapi(
  createRoute({
    method: 'get',
    path: '/vapid',
    tags: ['Push'],
    summary: 'Get the VAPID public key',
    description: 'Returns the uncompressed P-256 application server key used for `pushManager.subscribe({ applicationServerKey })`.',
    responses: { 200: { description: 'VAPID public key (base64url)' } },
  }),
  (c) => c.json({ publicKey: c.env.VAPID_PUBLIC_KEY ?? null }),
);

/* PUT /subscriptions — register or refresh a push subscription (auth).       */

app.openapi(
  createRoute({
    method: 'put',
    path: '/subscriptions',
    tags: ['Push'],
    summary: 'Register a push subscription',
    request: {
      body: { required: true, content: { 'application/json': { schema: subBody } } },
    },
    responses: {
      200: { description: 'Subscription stored' },
      400: errResp('Validation failed'),
      401: errResp('Not signed in'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const { endpoint, expirationTime, keys, lang } = c.req.valid('json');
    await c.env.DB.prepare(
      `INSERT INTO push_subscriptions (id, user_id, endpoint, p256dh, auth, lang, user_agent, expiration_time, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(endpoint) DO UPDATE SET
         user_id = excluded.user_id, p256dh = excluded.p256dh, auth = excluded.auth,
         lang = excluded.lang, user_agent = excluded.user_agent, expiration_time = excluded.expiration_time`,
    )
      .bind(id(), user.id, endpoint, keys.p256dh, keys.auth, lang ?? 'en', c.req.header('user-agent') ?? null, expirationTime ?? null, now())
      .run();
    return c.json({ ok: true }, 200);
  },
);

/* DELETE /subscriptions — remove a subscription by endpoint (auth).          */

app.openapi(
  createRoute({
    method: 'delete',
    path: '/subscriptions',
    tags: ['Push'],
    summary: 'Remove a push subscription',
    request: {
      body: { required: true, content: { 'application/json': { schema: z.object({ endpoint: z.url() }) } } },
    },
    responses: {
      204: { description: 'Subscription removed' },
      401: errResp('Not signed in'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const { endpoint } = c.req.valid('json');
    await c.env.DB.prepare('DELETE FROM push_subscriptions WHERE endpoint = ? AND user_id = ?').bind(endpoint, user.id).run();
    return c.body(null, 204);
  },
);

/* POST /test — send a declarative test notification to your own subs (auth). */

app.openapi(
  createRoute({
    method: 'post',
    path: '/test',
    tags: ['Push'],
    summary: 'Send a test push to yourself',
    responses: {
      200: { description: '{ sent, pruned }' },
      401: errResp('Not signed in'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const r = await pushToUsers(c.env, [user.id], (lang) => ({
      title: lang === 'zh' ? 'SCiPNET — 链路测试' : 'SCiPNET — link test',
      body: lang === 'zh' ? '推送链路正常。' : 'Push channel operational.',
      navigate: 'https://forum.openhub.today/',
      tag: 'scipnet-test',
    }));
    return c.json(r, 200);
  },
);

export default app;
