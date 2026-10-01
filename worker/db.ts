import type { PublicUser, Reply, ThreadSummary } from '../shared/api-types';
import { excerpt, mediaUrl } from './util';

/* eslint-disable @typescript-eslint/no-explicit-any */

// Row mappers. SQL always selects with camelCase aliases so rows map 1:1.

export function publicUser(r: any): PublicUser {
  return {
    id: r.id,
    username: r.username,
    displayName: r.displayName,
    avatarUrl: mediaUrl(r.avatarKey),
    bio: r.bio ?? '',
    role: r.role,
    createdAt: r.createdAt,
  };
}

// Expected joined columns: author{Id,Username,DisplayName,AvatarKey,Bio,Role,CreatedAt}, category{Slug,Name}
export function threadSummary(r: any): ThreadSummary {
  return {
    id: r.id,
    docNum: r.docNum,
    title: r.title,
    excerpt: excerpt(r.body),
    author: publicUser({
      id: r.authorId,
      username: r.authorUsername,
      displayName: r.authorDisplayName,
      avatarKey: r.authorAvatarKey,
      bio: r.authorBio,
      role: r.authorRole,
      createdAt: r.authorCreatedAt,
    }),
    category: { slug: r.categorySlug, name: r.categoryName },
    pinned: !!r.pinned,
    locked: !!r.locked,
    replyCount: r.replyCount,
    likeCount: r.likeCount,
    likedByMe: !!r.likedByMe,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
  };
}

export function replyDto(r: any): Reply {
  return {
    id: r.id,
    threadId: r.threadId,
    author: publicUser({
      id: r.authorId,
      username: r.authorUsername,
      displayName: r.authorDisplayName,
      avatarKey: r.authorAvatarKey,
      bio: r.authorBio,
      role: r.authorRole,
      createdAt: r.authorCreatedAt,
    }),
    body: r.body,
    createdAt: r.createdAt,
  };
}

export const USER_COLS =
  'u.id, u.username, u.display_name AS displayName, u.avatar_key AS avatarKey, u.bio, u.role, u.created_at AS createdAt';

export const AUTHOR_JOIN_COLS = `u.id AS authorId, u.username AS authorUsername,
  u.display_name AS authorDisplayName, u.avatar_key AS authorAvatarKey,
  u.bio AS authorBio, u.role AS authorRole, u.created_at AS authorCreatedAt`;

export const THREAD_SELECT = `SELECT t.id, t.rowid AS docNum, t.title, t.body, t.pinned, t.locked,
  t.reply_count AS replyCount, t.like_count AS likeCount,
  t.created_at AS createdAt, t.updated_at AS updatedAt,
  c.slug AS categorySlug, c.name AS categoryName,
  EXISTS(SELECT 1 FROM thread_likes tl WHERE tl.thread_id = t.id AND tl.user_id = ?) AS likedByMe,
  ${AUTHOR_JOIN_COLS}
  FROM threads t
  JOIN users u ON u.id = t.author_id
  JOIN categories c ON c.id = t.category_id`;

export const REPLY_SELECT = `SELECT r.id, r.thread_id AS threadId, r.body, r.created_at AS createdAt,
  ${AUTHOR_JOIN_COLS}
  FROM replies r
  JOIN users u ON u.id = r.author_id`;
