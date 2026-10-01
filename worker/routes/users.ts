import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { THREAD_SELECT, USER_COLS, publicUser, threadSummary } from '../db';
import { errResp, pageQuery, threadPageSchema, userProfileSchema } from '../schemas';
import type { AppEnv } from '../types';
import { err, parsePage } from '../util';

const app = new OpenAPIHono<AppEnv>({ strict: false });

const usernameParam = z.object({
  username: z.string().openapi({ param: { in: 'path', name: 'username' }, example: 'ava' }),
});

app.openapi(
  createRoute({
    method: 'get',
    path: '/{username}',
    tags: ['Users'],
    summary: 'Public profile',
    request: { params: usernameParam },
    responses: {
      200: {
        description: 'The user profile with activity counts',
        content: { 'application/json': { schema: z.object({ user: userProfileSchema }) } },
      },
      404: errResp('User not found'),
    },
  }),
  async (c) => {
    const row = await c.env.DB.prepare(`SELECT ${USER_COLS} FROM users u WHERE u.username = ?`).bind(c.req.param('username')).first();
    if (!row) return err(c, 404, 'not_found', 'User not found.');

    const [threads, replies] = await c.env.DB.batch([
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM threads WHERE author_id = ?').bind(row.id),
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM replies WHERE author_id = ?').bind(row.id),
    ]);
    return c.json(
      {
        user: {
          ...publicUser(row),
          threadCount: (threads.results[0] as { n?: number } | undefined)?.n ?? 0,
          replyCount: (replies.results[0] as { n?: number } | undefined)?.n ?? 0,
        },
      },
      200,
    );
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{username}/threads',
    tags: ['Users'],
    summary: "A user's threads",
    request: { params: usernameParam, query: z.object({ ...pageQuery }) },
    responses: {
      200: { description: 'A page of threads', content: { 'application/json': { schema: threadPageSchema } } },
      404: errResp('User not found'),
    },
  }),
  async (c) => {
    const author = await c.env.DB.prepare('SELECT id FROM users WHERE username = ?').bind(c.req.param('username')).first();
    if (!author) return err(c, 404, 'not_found', 'User not found.');

    const { page, perPage, offset } = parsePage(c.req.valid('query'));
    const uid = c.get('user')?.id ?? null;
    const [rows, count] = await c.env.DB.batch([
      c.env.DB.prepare(`${THREAD_SELECT} WHERE t.author_id = ? ORDER BY t.created_at DESC LIMIT ? OFFSET ?`).bind(uid, author.id, perPage, offset),
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM threads WHERE author_id = ?').bind(author.id),
    ]);
    const total = ((count.results[0] as { n?: number } | undefined)?.n ?? 0);
    return c.json({ data: rows.results.map(threadSummary), page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }, 200);
  },
);

export default app;
