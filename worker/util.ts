import type { Context } from 'hono';
import type { ContentfulStatusCode } from 'hono/utils/http-status';

export const now = (): number => Date.now();
export const id = (): string => crypto.randomUUID();

export function excerpt(body: string, len = 160): string {
  const t = body.replace(/\s+/g, ' ').trim();
  return t.length > len ? `${t.slice(0, len).trimEnd()}…` : t;
}

export function mediaUrl(key: string | null | undefined): string | null {
  return key ? `/media/${key}` : null;
}

export function err<S extends ContentfulStatusCode>(
  c: Context,
  status: S,
  code: string,
  message: string,
  details?: unknown,
) {
  return c.json({ error: { code, message, ...(details !== undefined ? { details } : {}) } }, status);
}

export function parsePage(query: { page?: string; limit?: string }, defaultLimit = 20, maxLimit = 50) {
  const page = Math.max(1, parseInt(query.page ?? '1', 10) || 1);
  const perPage = Math.min(maxLimit, Math.max(1, parseInt(query.limit ?? String(defaultLimit), 10) || defaultLimit));
  return { page, perPage, offset: (page - 1) * perPage };
}
