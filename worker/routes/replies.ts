import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import { errResp } from '../schemas';
import type { AppEnv } from '../types';
import { err } from '../util';

const app = new OpenAPIHono<AppEnv>({ strict: false });

app.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: ['Replies'],
    summary: 'Delete a reply',
    request: { params: z.object({ id: z.string().openapi({ param: { in: 'path', name: 'id' } }) }) },
    responses: {
      204: { description: 'Reply deleted' },
      401: errResp('Not signed in'),
      403: errResp('Not the author'),
      404: errResp('Reply not found'),
    },
  }),
  async (c) => {
    const user = c.get('user');
    if (!user) return err(c, 401, 'unauthorized', 'Sign in to continue.');
    const rid = c.req.param('id');
    const reply = await c.env.DB.prepare('SELECT thread_id AS threadId, author_id AS authorId FROM replies WHERE id = ?')
      .bind(rid)
      .first();
    if (!reply) return err(c, 404, 'not_found', 'Reply not found.');
    if (reply.authorId !== user.id && user.role !== 'admin')
      return err(c, 403, 'forbidden', 'Only the author can delete this reply.');

    await c.env.DB.batch([
      c.env.DB.prepare('DELETE FROM replies WHERE id = ?').bind(rid),
      c.env.DB.prepare('UPDATE threads SET reply_count = MAX(reply_count - 1, 0) WHERE id = ?').bind(reply.threadId),
    ]);
    return c.body(null, 204);
  },
);

export default app;
