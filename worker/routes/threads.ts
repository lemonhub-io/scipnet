import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { THREAD_SELECT, REPLY_SELECT, replyDto, threadSummary } from '../db';
import { pushToUsers } from '../push';
import { errResp, pageQuery, replyPageSchema, replySchema, threadPageSchema, threadSchema } from '../schemas';
import type { AppEnv } from '../types';
import { err, id as newId, now, parsePage } from '../util';

const app = new OpenAPIHono<AppEnv>({ strict: false });

const idParam = z.object({ id: z.string().openapi({ param: { in: 'path', name: 'id' } }) });

/* ------------------------------------------------------------------ */
/* GET /  — list threads                                               */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Threads'],
    summary: 'List threads',
    description:
      'Paginated thread summaries. Filter by `category` slug, full-text-ish `q` search over title and body, and `sort` by `new` (default, recent activity) or `top` (most liked).',
    request: {
      query: z.object({
        category: z.string().optional().openapi({ param: { in: 'query', name: 'category' } }),
        q: z.string().optional().openapi({ param: { in: 'query', name: 'q' } }),
        sort: z.enum(['new', 'top']).optional().openapi({ param: { in: 'query', name: 'sort' } }),
        ...pageQuery,
      }),
    },
    responses: {
      200: { description: 'A page of threads', content: { 'application/json': { schema: threadPageSchema } } },
    },
  }),
  async (c) => {
    const { category, q, sort } = c.req.valid('query');
    const { page, perPage, offset } = parsePage(c.req.valid('query'));
    const uid = c.get('user')?.id ?? null;
    const likeParam = `%${q ?? ''}%`;

    const where = `WHERE (? IS NULL OR c.slug = ?) AND (? IS NULL OR t.title LIKE ? OR t.body LIKE ?)`;
    const binds = [category ?? null, category ?? null, q ?? null, likeParam, likeParam];
    const order = sort === 'top' ? 't.pinned DESC, t.like_count DESC, t.created_at DESC' : 't.pinned DESC, t.updated_at DESC';

    const [rows, count] = await c.env.DB.batch([
      c.env.DB.prepare(`${THREAD_SELECT} ${where} ORDER BY ${order} LIMIT ? OFFSET ?`).bind(uid, ...binds, perPage, offset),
      c.env.DB.prepare(`SELECT COUNT(*) AS n FROM threads t JOIN categories c ON c.id = t.category_id ${where}`).bind(...binds),
    ]);

    const total = ((count.results[0] as { n?: number } | undefined)?.n ?? 0);
    return c.json(
      {
        data: rows.results.map(threadSummary),
        page,
        perPage,
        total,
        totalPages: Math.max(1, Math.ceil(total / perPage)),
      },
      200,
    );
  },
);

/* ------------------------------------------------------------------ */
/* POST / — create a thread                                            */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: ['Threads'],
    summary: 'Create a thread',
    description:
      'Files a document in the given department. Members may only file in departments ' +
      'where `memberPost` is true (currently: Personnel Commons); other departments require ' +
      'Site Command (admin) clearance and return `403 post_restricted`.',
    request: {
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({
              categorySlug: z.string(),
              title: z.string().min(1).max(140),
              body: z.string().min(1).max(20000),
            }),
          },
        },
      },
    },
    responses: {
      201: { description: 'Thread created', content: { 'application/json': { schema: z.object({ thread: threadSchema }) } } },
      400: errResp('Validation failed'),
      401: errResp('Not signed in'),
      403: errResp('Department restricted to Site Command'),
      404: errResp('Category not found'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const { categorySlug, title, body } = c.req.valid('json');
    const category = await c.env.DB.prepare('SELECT id, member_post FROM categories WHERE slug = ?').bind(categorySlug).first();
    if (!category) return err(c, 404, 'not_found', 'Category not found.');
    if (!category.member_post && user.role !== 'admin') {
      return err(c, 403, 'post_restricted', 'This department accepts filings from Site Command only.');
    }

    const tid = newId();
    const t = now();
    await c.env.DB.prepare(
      'INSERT INTO threads (id, category_id, author_id, title, body, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
      .bind(tid, category.id, user.id, title, body, t, t)
      .run();

    const row = await c.env.DB.prepare(`${THREAD_SELECT} WHERE t.id = ?`).bind(user.id, tid).first();
    return c.json({ thread: { ...threadSummary(row), body } }, 201);
  },
);

/* ------------------------------------------------------------------ */
/* GET /{id} — thread detail                                           */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: ['Threads'],
    summary: 'Get a thread',
    request: { params: idParam },
    responses: {
      200: { description: 'The thread', content: { 'application/json': { schema: z.object({ thread: threadSchema }) } } },
      404: errResp('Thread not found'),
    },
  }),
  async (c) => {
    const row = await c.env.DB
      .prepare(`${THREAD_SELECT} WHERE t.id = ?`)
      .bind(c.get('user')?.id ?? null, c.req.param('id'))
      .first();
    if (!row) return err(c, 404, 'not_found', 'Thread not found.');
    return c.json({ thread: { ...threadSummary(row), body: row.body as string } }, 200);
  },
);

/* ------------------------------------------------------------------ */
/* PATCH /{id} — edit (author or admin)                                */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: ['Threads'],
    summary: 'Edit a thread',
    request: {
      params: idParam,
      body: {
        required: true,
        content: {
          'application/json': {
            schema: z.object({ title: z.string().min(1).max(140).optional(), body: z.string().min(1).max(20000).optional() }),
          },
        },
      },
    },
    responses: {
      200: { description: 'Thread updated', content: { 'application/json': { schema: z.object({ thread: threadSchema }) } } },
      400: errResp('Validation failed'),
      401: errResp('Not signed in'),
      403: errResp('Not the author'),
      404: errResp('Thread not found'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const tid = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT author_id FROM threads WHERE id = ?').bind(tid).first();
    if (!existing) return err(c, 404, 'not_found', 'Thread not found.');
    if (existing.author_id !== user.id && user.role !== 'admin')
      return err(c, 403, 'forbidden', 'Only the author can edit this thread.');

    const { title, body } = c.req.valid('json');
    await c.env.DB.prepare(
      'UPDATE threads SET title = COALESCE(?, title), body = COALESCE(?, body), updated_at = ? WHERE id = ?',
    )
      .bind(title ?? null, body ?? null, now(), tid)
      .run();

    const row = await c.env.DB.prepare(`${THREAD_SELECT} WHERE t.id = ?`).bind(user.id, tid).first();
    return c.json({ thread: { ...threadSummary(row), body: row!.body as string } }, 200);
  },
);

/* ------------------------------------------------------------------ */
/* DELETE /{id} — remove thread (author or admin)                      */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Threads'],
    summary: 'Delete a thread',
    description: 'Deletes the thread, its replies, and its likes atomically.',
    request: { params: idParam },
    responses: {
      204: { description: 'Thread deleted' },
      401: errResp('Not signed in'),
      403: errResp('Not the author'),
      404: errResp('Thread not found'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const tid = c.req.param('id');
    const existing = await c.env.DB.prepare('SELECT author_id FROM threads WHERE id = ?').bind(tid).first();
    if (!existing) return err(c, 404, 'not_found', 'Thread not found.');
    if (existing.author_id !== user.id && user.role !== 'admin')
      return err(c, 403, 'forbidden', 'Only the author can delete this thread.');

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM replies WHERE thread_id = ?').bind(tid),
      c.env.DB.prepare('DELETE FROM thread_likes WHERE thread_id = ?').bind(tid),
      c.env.DB.prepare('DELETE FROM threads WHERE id = ?').bind(tid),
    ]);
    return c.body(null, 204);
  },
);

/* ------------------------------------------------------------------ */
/* POST /{id}/like — toggle a like                                     */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/like',
    tags: ['Threads'],
    summary: 'Like or unlike a thread',
    request: { params: idParam },
    responses: {
      200: {
        description: 'Updated like state',
        content: { 'application/json': { schema: z.object({ liked: z.boolean(), likeCount: z.number() }) } },
      },
      401: errResp('Not signed in'),
      404: errResp('Thread not found'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const tid = c.req.param('id');
    const thread = await c.env.DB.prepare('SELECT like_count AS likeCount FROM threads WHERE id = ?').bind(tid).first();
    if (!thread) return err(c, 404, 'not_found', 'Thread not found.');

    const inserted = await c.env.DB.prepare('INSERT OR IGNORE INTO thread_likes (thread_id, user_id, created_at) VALUES (?, ?, ?)')
      .bind(tid, user.id, now())
      .run();

    let liked: boolean;
    if ((inserted.meta.changes ?? 0) === 1) {
      liked = true;
      await c.env.DB.prepare('UPDATE threads SET like_count = like_count + 1 WHERE id = ?').bind(tid).run();
    } else {
      liked = false;
      await c.env.DB.batch([
        c.env.DB.prepare('DELETE FROM thread_likes WHERE thread_id = ? AND user_id = ?').bind(tid, user.id),
        c.env.DB.prepare('UPDATE threads SET like_count = MAX(like_count - 1, 0) WHERE id = ?').bind(tid),
      ]);
    }
    const row = await c.env.DB.prepare('SELECT like_count AS likeCount FROM threads WHERE id = ?').bind(tid).first();
    return c.json({ liked, likeCount: ((row as { likeCount?: number } | null)?.likeCount) ?? 0 }, 200);
  },
);

/* ------------------------------------------------------------------ */
/* GET /{id}/replies — paginated replies                               */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/replies',
    tags: ['Replies'],
    summary: 'List replies',
    request: { params: idParam, query: z.object({ ...pageQuery }) },
    responses: {
      200: { description: 'A page of replies, oldest first', content: { 'application/json': { schema: replyPageSchema } } },
      404: errResp('Thread not found'),
    },
  }),
  async (c) => {
    const tid = c.req.param('id');
    const thread = await c.env.DB.prepare('SELECT id FROM threads WHERE id = ?').bind(tid).first();
    if (!thread) return err(c, 404, 'not_found', 'Thread not found.');

    const { page, perPage, offset } = parsePage(c.req.valid('query'));
    const [rows, count] = await c.env.DB.batch([
      c.env.DB.prepare(`${REPLY_SELECT} WHERE r.thread_id = ? ORDER BY r.created_at ASC LIMIT ? OFFSET ?`).bind(tid, perPage, offset),
      c.env.DB.prepare('SELECT COUNT(*) AS n FROM replies WHERE thread_id = ?').bind(tid),
    ]);
    const total = ((count.results[0] as { n?: number } | undefined)?.n ?? 0);
    return c.json({ data: rows.results.map(replyDto), page, perPage, total, totalPages: Math.max(1, Math.ceil(total / perPage)) }, 200);
  },
);

/* ------------------------------------------------------------------ */
/* POST /{id}/replies — add a reply                                    */
/* ------------------------------------------------------------------ */

app.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/replies',
    tags: ['Replies'],
    summary: 'Reply to a thread',
    request: {
      params: idParam,
      body: {
        required: true,
        content: { 'application/json': { schema: z.object({ body: z.string().min(1).max(10000) }) } },
      },
    },
    responses: {
      201: { description: 'Reply created', content: { 'application/json': { schema: z.object({ reply: replySchema }) } } },
      400: errResp('Validation failed'),
      401: errResp('Not signed in'),
      403: errResp('Thread is locked'),
      404: errResp('Thread not found'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const tid = c.req.param('id');
    const thread = await c.env.DB.prepare('SELECT locked, title, rowid AS docNum FROM threads WHERE id = ?').bind(tid).first();
    if (!thread) return err(c, 404, 'not_found', 'Thread not found.');
    if (thread.locked) return err(c, 403, 'thread_locked', 'This thread is locked.');

    const { body } = c.req.valid('json');
    const rid = newId();
    const t = now();
    await c.env.DB.batch([
      c.env.DB.prepare('INSERT INTO replies (id, thread_id, author_id, body, created_at) VALUES (?, ?, ?, ?, ?)').bind(rid, tid, user.id, body, t),
      c.env.DB.prepare('UPDATE threads SET reply_count = reply_count + 1, updated_at = ? WHERE id = ?').bind(t, tid),
    ]);

    const row = await c.env.DB.prepare(`${REPLY_SELECT} WHERE r.id = ?`).bind(rid).first();

    // Notify thread author + prior addendum authors (excluding the poster).
    const doc = `SCP-${String(Math.max(0, thread.docNum as number)).padStart(4, '0')}`;
    const { results: recipients } = await c.env.DB.prepare(
      `SELECT DISTINCT author_id AS uid FROM (
         SELECT author_id FROM threads WHERE id = ?
         UNION SELECT author_id FROM replies WHERE thread_id = ? AND id != ?
       ) WHERE uid != ?`,
    )
      .bind(tid, tid, rid, user.id)
      .all<{ uid: string }>();
    if (recipients.length) {
      const preview = body.replace(/\s+/g, ' ').trim().slice(0, 140);
      c.executionCtx.waitUntil(
        pushToUsers(c.env, recipients.map((r) => r.uid), (lang) => ({
          title: lang === 'zh' ? `SCiPNET · 附录 ${doc}` : `SCiPNET · ${doc} addendum`,
          body: `${user.displayName}: ${preview}`,
          navigate: `https://forum.openhub.today/t/${tid}`,
          tag: `addendum-${tid}`,
        })),
      );
    }

    return c.json({ reply: replyDto(row) }, 201);
  },
);

export default app;
