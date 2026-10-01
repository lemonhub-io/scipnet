import { OpenAPIHono } from '@hono/zod-openapi';
import { HTTPException } from 'hono/http-exception';
import type { ContentfulStatusCode } from 'hono/utils/http-status';
import { attachUser } from './auth';
import media from './media';
import authRoutes from './routes/auth';
import categoryRoutes from './routes/categories';
import replyRoutes from './routes/replies';
import threadRoutes from './routes/threads';
import pushRoutes from './routes/push';
import uploadRoutes from './routes/uploads';
import userRoutes from './routes/users';
import webauthnRoutes from './routes/webauthn';
import type { AppEnv } from './types';

const app = new OpenAPIHono<AppEnv>({
  strict: false,
  defaultHook: (result, c) => {
    if (!result.success) {
      const issue = result.error.issues[0];
      const where = issue ? issue.path.map(String).join('.') : '';
      return c.json(
        { error: { code: 'validation_error', message: `Invalid request${where ? ` — ${where}: ${issue!.message}` : '.'}` } },
        400,
      );
    }
    return undefined;
  },
});

// Resolve the session cookie on every API request.
app.use('/api/*', attachUser);

app.route('/api/auth', authRoutes);
app.route('/api/auth/webauthn', webauthnRoutes);
app.route('/api/categories', categoryRoutes);
app.route('/api/threads', threadRoutes);
app.route('/api/replies', replyRoutes);
app.route('/api/users', userRoutes);
app.route('/api/uploads', uploadRoutes);
app.route('/api/push', pushRoutes);
app.route('/media', media);

app.get('/api/health', (c) => c.json({ ok: true, service: 'scipnet', time: new Date().toISOString() }));

app.doc31('/api/openapi.json', {
  openapi: '3.1.0',
  info: {
    title: 'SCiPNET API',
    version: '1.0.0',
    description:
      'The SCiPNET terminal API — a fan-made forum packaged after the SCP Foundation. Authentication is cookie-based: `POST /api/auth/register` or `/login` sets an ' +
      '`agora_session` HttpOnly cookie which is sent on subsequent requests. ' +
      'All errors share the shape `{ "error": { "code", "message" } }`. ' +
      'List endpoints are paginated with `page`/`limit` and return `{ data, page, perPage, total, totalPages }`. ' +
      'Uploaded files live in R2 and are served immutable at `/media/{key}`.',
  },
  servers: [{ url: '/' }],
});

// Interactive reference UI (Scalar) — same-origin, no build step.
app.get('/api/docs', (c) =>
  c.html(`<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>SCiPNET API Reference</title>
    <style>body { margin: 0; }</style>
  </head>
  <body>
    <script id="api-reference" data-url="/api/openapi.json"></script>
    <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
  </body>
</html>`),
);

app.notFound((c) => c.json({ error: { code: 'not_found', message: 'Not found.' } }, 404));

app.onError((e, c) => {
  if (e instanceof HTTPException) {
    return c.json({ error: { code: 'http_error', message: e.message } }, e.status as ContentfulStatusCode);
  }
  console.error(e);
  return c.json({ error: { code: 'internal_error', message: 'Something went wrong.' } }, 500);
});

export default app;
