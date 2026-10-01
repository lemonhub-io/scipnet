import type { PublicUser } from '../shared/api-types';

export interface Bindings {
  DB: D1Database;
  CDN: R2Bucket;
  ASSETS: Fetcher;
  VAPID_PUBLIC_KEY?: string;
  VAPID_PRIVATE_KEY?: string;
  VAPID_SUBJECT?: string;
}

export type AuthedUser = PublicUser;

export type AppEnv = {
  Bindings: Bindings;
  Variables: { user: AuthedUser | null };
};
