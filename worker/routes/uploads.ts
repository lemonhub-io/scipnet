import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Context } from 'hono';
import { errResp, uploadResultSchema } from '../schemas';
import type { AppEnv } from '../types';
import { err } from '../util';

const app = new OpenAPIHono<AppEnv>({ strict: false });

const MAX_BYTES = 5 * 1024 * 1024;

const fileBody = z.object({ file: z.any().openapi({ type: 'string', format: 'binary' }) });
const multipartRequest = {
  body: { required: true, content: { 'multipart/form-data': { schema: fileBody } } },
};

const WEBP_DESC =
  'Accepts `multipart/form-data` with a single `file` field. The store is WebP-only (≤ 5 MB): ' +
  'the web client transcodes any image to WebP at quality 85 before uploading, and other clients must do the same. ' +
  'The first bytes are checked for the `RIFF…WEBP` signature.';

type StoreResult =
  | { ok: true; key: string; file: File }
  | { ok: false; status: 400 | 413 | 415; code: string; message: string };

async function store(c: Context<AppEnv>, keyPrefix: string): Promise<StoreResult> {
  const form = await c.req.formData();
  const file = form.get('file');
  if (!(file instanceof File)) {
    return { ok: false, status: 400, code: 'validation_error', message: 'A file field named "file" is required.' };
  }
  if (file.size > MAX_BYTES) {
    return { ok: false, status: 413, code: 'too_large', message: 'Files must be 5 MB or smaller.' };
  }
  const head =
    file.type === 'image/webp' ? new Uint8Array(await file.slice(0, 12).arrayBuffer()) : new Uint8Array();
  const tag = (a: number, b: number) => String.fromCharCode(...head.slice(a, b));
  if (head.length < 12 || tag(0, 4) !== 'RIFF' || tag(8, 12) !== 'WEBP') {
    return { ok: false, status: 415, code: 'unsupported_media', message: 'Only WebP images are accepted.' };
  }

  const key = `${keyPrefix}/${crypto.randomUUID()}.webp`;
  await c.env.CDN.put(key, file.stream(), {
    httpMetadata: { contentType: file.type, cacheControl: 'public, max-age=31536000, immutable' },
    customMetadata: { uploadedBy: c.get('user')!.id },
  });
  return { ok: true, key, file };
}

app.openapi(
  createRoute({
    method: 'post',
    path: '/avatar',
    tags: ['Uploads'],
    summary: 'Upload a profile avatar',
    description: WEBP_DESC + ' Stores the object in R2, updates the profile, and returns a `/media/…` URL.',
    request: multipartRequest,
    responses: {
      200: { description: 'Avatar updated', content: { 'application/json': { schema: uploadResultSchema } } },
      400: errResp('Missing file'),
      401: errResp('Not signed in'),
      413: errResp('File too large'),
      415: errResp('Unsupported media type'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const r = await store(c, `avatars/${user.id}`);
    if (!r.ok) return err(c, r.status, r.code, r.message);
    await c.env.DB.prepare('UPDATE users SET avatar_key = ? WHERE id = ?').bind(r.key, user.id).run();
    return c.json({ key: r.key, url: `/media/${r.key}`, contentType: r.file.type, size: r.file.size }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'post',
    path: '/attachment',
    tags: ['Uploads'],
    summary: 'Upload an image attachment',
    description: WEBP_DESC + ' Returns a `/media/…` URL suitable for embedding in a post body.',
    request: multipartRequest,
    responses: {
      201: { description: 'Attachment stored', content: { 'application/json': { schema: uploadResultSchema } } },
      400: errResp('Missing file'),
      401: errResp('Not signed in'),
      413: errResp('File too large'),
      415: errResp('Unsupported media type'),
    },
  }),
  async (c) => {
    if (!c.get('user')) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const r = await store(c, 'attachments');
    if (!r.ok) return err(c, r.status, r.code, r.message);
    return c.json({ key: r.key, url: `/media/${r.key}`, contentType: r.file.type, size: r.file.size }, 201);
  },
);

export default app;
