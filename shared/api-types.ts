// Shared API contracts between the Hono worker and the React client.

export interface PublicUser {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  role: 'member' | 'admin';
  createdAt: number;
}

export interface Category {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Members may file documents here; other departments are Site Command only. */
  memberPost: boolean;
  threadCount: number;
}

export interface CategoryRef {
  slug: string;
  name: string;
}

export interface ThreadSummary {
  id: string;
  /** Sequential document number (SQLite rowid) — displayed as SCP-XXXX. */
  docNum: number;
  title: string;
  excerpt: string;
  author: PublicUser;
  category: CategoryRef;
  pinned: boolean;
  locked: boolean;
  replyCount: number;
  likeCount: number;
  likedByMe: boolean;
  createdAt: number;
  updatedAt: number;
}

export interface Thread extends ThreadSummary {
  body: string;
}

export interface Reply {
  id: string;
  threadId: string;
  author: PublicUser;
  body: string;
  createdAt: number;
}

export interface Page<T> {
  data: T[];
  page: number;
  perPage: number;
  total: number;
  totalPages: number;
}

export interface UserProfile extends PublicUser {
  threadCount: number;
  replyCount: number;
}

export interface UploadResult {
  key: string;
  url: string;
  contentType: string;
  size: number;
}

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}
