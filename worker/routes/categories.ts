import { OpenAPIHono, createRoute, z } from '@hono/zod-openapi';
import type { Category } from '../../shared/api-types';
import { categorySchema, errResp } from '../schemas';
import type { AppEnv } from '../types';
import { err } from '../util';

const app = new OpenAPIHono<AppEnv>({ strict: false });

const CATEGORY_SELECT = `SELECT c.id, c.slug, c.name, c.description, c.member_post,
  (SELECT COUNT(*) FROM threads t WHERE t.category_id = c.id) AS threadCount
  FROM categories c`;

const dto = (r: Record<string, unknown>) => ({ ...r, memberPost: !!r.member_post, member_post: undefined });

app.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: ['Categories'],
    summary: 'List categories',
    responses: {
      200: {
        description: 'All categories, ordered for display',
        content: { 'application/json': { schema: z.object({ categories: z.array(categorySchema) }) } },
      },
    },
  }),
  async (c) => {
    const { results } = await c.env.DB.prepare(`${CATEGORY_SELECT} ORDER BY c.sort_order, c.name`).all();
    return c.json({ categories: results.map(dto) as unknown as Category[] }, 200);
  },
);

app.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    tags: ['Categories'],
    summary: 'Get a category',
    request: { params: z.object({ slug: z.string() }) },
    responses: {
      200: { description: 'The category', content: { 'application/json': { schema: z.object({ category: categorySchema }) } } },
      404: errResp('Category not found'),
    },
  }),
  async (c) => {
    const row = await c.env.DB.prepare(`${CATEGORY_SELECT} WHERE c.slug = ?`).bind(c.req.param('slug')).first();
    if (!row) return err(c, 404, 'not_found', 'Category not found.');
    return c.json({ category: dto(row) as unknown as Category }, 200);
  },
);

export default app;
