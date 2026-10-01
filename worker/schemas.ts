import { z } from '@hono/zod-openapi';

export const errorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export const publicUserSchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable(),
  bio: z.string(),
  role: z.enum(['member', 'admin']),
  createdAt: z.number(),
});

export const categorySchema = z.object({
  id: z.string(),
  slug: z.string(),
  name: z.string(),
  description: z.string(),
  memberPost: z.boolean(),
  threadCount: z.number(),
});

export const threadSummarySchema = z.object({
  id: z.string(),
  docNum: z.number(),
  title: z.string(),
  excerpt: z.string(),
  author: publicUserSchema,
  category: z.object({ slug: z.string(), name: z.string() }),
  pinned: z.boolean(),
  locked: z.boolean(),
  replyCount: z.number(),
  likeCount: z.number(),
  likedByMe: z.boolean(),
  createdAt: z.number(),
  updatedAt: z.number(),
});

export const threadSchema = threadSummarySchema.extend({ body: z.string() });

export const replySchema = z.object({
  id: z.string(),
  threadId: z.string(),
  author: publicUserSchema,
  body: z.string(),
  createdAt: z.number(),
});

export const userProfileSchema = publicUserSchema.extend({
  threadCount: z.number(),
  replyCount: z.number(),
});

export const uploadResultSchema = z.object({
  key: z.string(),
  url: z.string(),
  contentType: z.string(),
  size: z.number(),
});

const pageOf = <T extends z.ZodType>(item: T) =>
  z.object({
    data: z.array(item),
    page: z.number(),
    perPage: z.number(),
    total: z.number(),
    totalPages: z.number(),
  });

export const threadPageSchema = pageOf(threadSummarySchema);
export const replyPageSchema = pageOf(replySchema);

export const usernameSchema = z
  .string()
  .min(3)
  .max(24)
  .regex(/^[A-Za-z0-9_-]+$/, 'Letters, numbers, hyphens and underscores only');

export const passwordSchema = z.string().min(8).max(72);

export const pageQuery = {
  page: z.string().optional().openapi({ param: { in: 'query', name: 'page' }, example: '1' }),
  limit: z.string().optional().openapi({ param: { in: 'query', name: 'limit' }, example: '20' }),
};

export const errResp = (description: string) => ({
  description,
  content: { 'application/json': { schema: errorSchema } },
});
