import { Hono } from 'hono';
import type { AppEnv } from './types';

/**
 * /media/* — serves objects from the R2 bucket (the CDN tier).
 * Keys are content-addressed UUIDs, so responses are immutable and cached for a year.
 */
const app = new Hono<AppEnv>();

app.get('/*', async (c) => {
  const key = c.req.path.slice('/media/'.length);
  if (!key || key.includes('..') || key.startsWith('/')) {
    return c.json({ error: { code: 'not_found', message: 'Object not found.' } }, 404);
  }

  // Byte-range support for partial reads.
  const rangeHeader = c.req.header('range');
  let range: { offset: number; length?: number } | undefined;
  if (rangeHeader) {
    const m = /^bytes=(\d+)-(\d*)$/.exec(rangeHeader.trim());
    if (m) range = { offset: Number(m[1]), ...(m[2] ? { length: Number(m[2]) - Number(m[1]) + 1 } : {}) };
  }

  const object = await c.env.CDN.get(key, range ? { range } : undefined);
  if (!object) {
    return c.json({ error: { code: 'not_found', message: 'Object not found.' } }, 404);
  }

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('ETag', object.httpEtag);
  if (!headers.has('Content-Type')) headers.set('Content-Type', 'application/octet-stream');
  if (!headers.has('Cache-Control')) headers.set('Cache-Control', 'public, max-age=31536000, immutable');

  if (c.req.header('if-none-match') === object.httpEtag) {
    return new Response(null, { status: 304, headers });
  }

  if (range) {
    headers.set('Content-Range', `bytes ${range.offset}-${range.offset + (range.length ?? object.size) - 1}/${object.size}`);
    headers.set('Accept-Ranges', 'bytes');
    return new Response(object.body, { status: 206, headers });
  }

  return new Response(object.body, { headers });
});

export default app;
