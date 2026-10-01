import { buildPushPayload } from '@block65/webcrypto-web-push';
import type { Bindings } from './types';

export type DeclarativeNotification = {
  title: string;
  body?: string;
  navigate?: string;
  tag?: string;
  /** lang copied from the subscription row */
  lang?: string;
};

type SubRow = { id: string; endpoint: string; p256dh: string; auth: string; lang: string };

/**
 * Sends a declarative (Apple web_push=8030) push payload to every push
 * subscription held by the given users. Non-Safari clients get the same JSON
 * and their service worker's `push` handler calls showNotification with it.
 * Dead endpoints (404/410) are pruned. Never throws — fire-and-forget via
 * ctx.waitUntil.
 */
export async function pushToUsers(
  env: Bindings,
  userIds: string[],
  make: (lang: 'en' | 'zh') => Omit<DeclarativeNotification, 'lang'>,
): Promise<{ sent: number; pruned: number }> {
  const ids = [...new Set(userIds)];
  if (!ids.length || !env.VAPID_PUBLIC_KEY || !env.VAPID_PRIVATE_KEY) return { sent: 0, pruned: 0 };

  const vapid = {
    subject: env.VAPID_SUBJECT ?? 'mailto:admin@openhub.today',
    publicKey: env.VAPID_PUBLIC_KEY,
    privateKey: env.VAPID_PRIVATE_KEY,
  };

  const { results } = await env.DB.prepare(
    `SELECT id, endpoint, p256dh, auth, lang FROM push_subscriptions WHERE user_id IN (${ids.map(() => '?').join(',')})`,
  )
    .bind(...ids)
    .all<SubRow>();

  let sent = 0;
  let pruned = 0;
  await Promise.allSettled(
    (results ?? []).map(async (s) => {
      try {
        const notification = make(s.lang === 'zh' ? 'zh' : 'en');
        const msg = {
          data: { web_push: 8030, notification },
          options: { ttl: 43200, urgency: 'normal' as const },
        };
        const p = await buildPushPayload(
          msg,
          { endpoint: s.endpoint, expirationTime: null, keys: { auth: s.auth, p256dh: s.p256dh } },
          vapid,
        );
        const res = await fetch(s.endpoint, { method: p.method, headers: p.headers, body: p.body as BodyInit });
        if (res.status === 404 || res.status === 410) {
          await env.DB.prepare('DELETE FROM push_subscriptions WHERE id = ?').bind(s.id).run();
          pruned++;
        } else if (res.ok) {
          sent++;
        } else {
          console.warn(`push ${s.endpoint.slice(0, 48)}… -> ${res.status}`);
        }
      } catch (e) {
        console.warn('push send failed:', e);
      }
    }),
  );
  return { sent, pruned };
}
