import { api } from './api';

export type PushState = 'unsupported' | 'denied' | 'on' | 'off';

const b64ToU8 = (b64url: string): Uint8Array => {
  const b64 = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return Uint8Array.from(raw, (ch) => ch.charCodeAt(0));
};

export function pushSupported(): boolean {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

/** iOS/iPadOS requires the PWA installed to the home screen before push is available. */
export function needsInstallForPush(): boolean {
  const ios = /iP(hone|ad|od)/.test(navigator.userAgent)
    || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = (navigator as { standalone?: boolean }).standalone === true
    || window.matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

async function swReg(): Promise<ServiceWorkerRegistration | null> {
  if (!pushSupported()) return null;
  return (await navigator.serviceWorker.getRegistration()) ?? null;
}

export async function pushState(): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await swReg();
  if (!reg) return 'unsupported';
  return (await reg.pushManager.getSubscription()) ? 'on' : 'off';
}

export async function enablePush(lang: 'en' | 'zh'): Promise<PushState> {
  if (!pushSupported()) return 'unsupported';
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') return perm === 'denied' ? 'denied' : 'off';

  const { publicKey } = await api.pushVapid();
  const reg = (await navigator.serviceWorker.ready.catch(() => null)) ?? (await swReg());
  if (!publicKey || !reg) return 'unsupported';

  const sub =
    (await reg.pushManager.getSubscription()) ??
    (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: b64ToU8(publicKey) as BufferSource }));
  const j = sub.toJSON();
  if (!j.endpoint || !j.keys?.p256dh || !j.keys?.auth) return 'unsupported';
  await api.pushSubscribe({
    endpoint: j.endpoint,
    expirationTime: j.expirationTime ?? null,
    keys: { p256dh: j.keys.p256dh, auth: j.keys.auth },
    lang,
  });
  return 'on';
}

export async function disablePush(): Promise<void> {
  const reg = await swReg();
  const sub = await reg?.pushManager.getSubscription();
  if (!sub) return;
  await api.pushUnsubscribe(sub.endpoint).catch(() => {});
  await sub.unsubscribe().catch(() => {});
}
