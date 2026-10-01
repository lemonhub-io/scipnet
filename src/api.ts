import i18n from './i18n';
import { toWebP } from './image';
import type {
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/browser';
import type {
  ApiErrorBody,
  Category,
  Page,
  PublicUser,
  Reply,
  Thread,
  ThreadSummary,
  UploadResult,
  UserProfile,
} from '../shared/api-types';

export class ApiError extends Error {
  code: string;
  status: number;
  constructor(status: number, body: ApiErrorBody | null) {
    super(body?.error.message ?? `Request failed (${status})`);
    this.code = body?.error.code ?? 'unknown';
    this.status = status;
  }
}

/** Localized, human-readable message for a caught API/network error. */
export function apiErr(e: unknown): string {
  const code = e instanceof ApiError ? e.code : (e as { code?: unknown } | null)?.code;
  if (typeof code === 'string') {
    return i18n.t(`errors.${code}`, { defaultValue: e instanceof Error ? e.message : String(e) });
  }
  return e instanceof Error ? e.message : i18n.t('errors.unknown');
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, { credentials: 'same-origin', ...init });
  if (res.status === 204) return undefined as T;
  const body = (await res.json().catch(() => null)) as ApiErrorBody | T | null;
  if (!res.ok) throw new ApiError(res.status, body as ApiErrorBody | null);
  return body as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, {
    method: 'POST',
    ...(body !== undefined
      ? { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
      : {}),
  });

const patch = <T>(path: string, body: unknown) =>
  request<T>(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

const del = (path: string) => request<void>(path, { method: 'DELETE' });
const delBody = (path: string, body: unknown) =>
  request<void>(path, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
const put = <T,>(path: string, body: unknown) =>
  request<T>(path, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

const qs = (params: Record<string, string | number | undefined>) => {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== '') p.set(k, String(v));
  const s = p.toString();
  return s ? `?${s}` : '';
};

export const api = {
  // auth
  me: () => request<{ user: PublicUser }>('/api/auth/me'),
  register: (username: string, password: string, displayName: string | undefined, webauthnToken: string) =>
    post<{ user: PublicUser }>('/api/auth/register', { username, password, displayName, webauthnToken }),
  webauthnRegisterOptions: () =>
    post<{ token: string; options: PublicKeyCredentialCreationOptionsJSON }>('/api/auth/webauthn/register/options'),
  webauthnRegisterVerify: (token: string, response: unknown) =>
    post<{ ok: true }>('/api/auth/webauthn/register/verify', { token, response }),
  webauthnLoginOptions: (username?: string) =>
    post<{ token: string; options: PublicKeyCredentialRequestOptionsJSON }>('/api/auth/webauthn/login/options', {
      username,
    }),
  webauthnLoginVerify: (token: string, response: unknown) =>
    post<{ user: PublicUser }>('/api/auth/webauthn/login/verify', { token, response }),
  login: (username: string, password: string) =>
    post<{ user: PublicUser }>('/api/auth/login', { username, password }),
  logout: () => post<void>('/api/auth/logout'),
  updateMe: (body: { displayName?: string; bio?: string }) =>
    patch<{ user: PublicUser }>('/api/auth/me', body),

  // categories
  categories: () => request<{ categories: Category[] }>('/api/categories'),

  // threads
  threads: (params: { category?: string; q?: string; sort?: 'new' | 'top'; page?: number; limit?: number }) =>
    request<Page<ThreadSummary>>(`/api/threads${qs(params)}`),
  thread: (id: string) => request<{ thread: Thread }>(`/api/threads/${id}`),
  createThread: (body: { categorySlug: string; title: string; body: string }) =>
    post<{ thread: Thread }>('/api/threads', body),
  updateThread: (id: string, body: { title?: string; body?: string }) =>
    patch<{ thread: Thread }>(`/api/threads/${id}`, body),
  deleteThread: (id: string) => del(`/api/threads/${id}`),
  toggleLike: (id: string) => post<{ liked: boolean; likeCount: number }>(`/api/threads/${id}/like`),

  // replies
  replies: (threadId: string, page = 1) =>
    request<Page<Reply>>(`/api/threads/${threadId}/replies${qs({ page })}`),
  createReply: (threadId: string, body: string) =>
    post<{ reply: Reply }>(`/api/threads/${threadId}/replies`, { body }),
  deleteReply: (id: string) => del(`/api/replies/${id}`),

  // users
  user: (username: string) => request<{ user: UserProfile }>(`/api/users/${username}`),
  userThreads: (username: string, page = 1) =>
    request<Page<ThreadSummary>>(`/api/users/${username}/threads${qs({ page })}`),

  // uploads — every image is transcoded to WebP (q85) before it leaves the client
  uploadAvatar: async (file: File) => {
    const fd = new FormData();
    fd.append('file', await toWebP(file));
    return request<UploadResult>('/api/uploads/avatar', { method: 'POST', body: fd });
  },
  uploadAttachment: async (file: File) => {
    const fd = new FormData();
    fd.append('file', await toWebP(file));
    return request<UploadResult>('/api/uploads/attachment', { method: 'POST', body: fd });
  },

  // push — Web Push subscriptions (declarative payload, Apple-compatible)
  pushVapid: () => request<{ publicKey: string | null }>('/api/push/vapid'),
  pushSubscribe: (s: { endpoint: string; expirationTime: number | null; keys: { p256dh: string; auth: string }; lang: 'en' | 'zh' }) =>
    put<{ ok: true }>('/api/push/subscriptions', s),
  pushUnsubscribe: (endpoint: string) => delBody('/api/push/subscriptions', { endpoint }),
  pushTest: () => post<{ sent: number; pruned: number }>('/api/push/test', {}),
};
