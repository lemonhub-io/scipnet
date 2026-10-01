/* SCiPNET push handler — imported into the Workbox-generated SW via
   importScripts. Covers browsers without declarative push (Chrome/Firefox);
   Safari displays declarative (web_push: 8030) payloads itself. */

const safeUrl = (u) => {
  try {
    const url = new URL(u || '/', self.location.origin);
    return url.origin === self.location.origin ? url.href : self.location.origin + '/';
  } catch {
    return self.location.origin + '/';
  }
};

self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data = {};
      try {
        data = event.data ? event.data.json() : {};
      } catch {
        /* non-JSON payload */
      }
      // Declarative payload: { web_push: 8030, notification: {title, body, navigate, tag} }
      const n = data.notification || data;
      const url = safeUrl(n.navigate || n.url);
      await self.registration.showNotification(n.title || 'SCiPNET', {
        body: n.body || '',
        tag: n.tag,
        icon: '/icons/icon-192.png',
        badge: '/icons/icon-192.png',
        data: { url },
      });
      // Let open tabs react (badge refresh, e2e observability).
      const cs = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const c of cs) c.postMessage({ type: 'scipnet:push', url, title: n.title || 'SCiPNET' });
    })(),
  );
});

/* Browser rotated/revoked the subscription — re-register under the new
   endpoint so the uplink survives. Best-effort: if the session is gone the
   PUT 401s and we drop it. */
self.addEventListener('pushsubscriptionchange', (event) => {
  event.waitUntil(
    (async () => {
      try {
        const { publicKey } = await (await fetch('/api/push/vapid')).json();
        if (!publicKey) return;
        const key = Uint8Array.from(atob(publicKey.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0));
        const sub = await self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
        const j = sub.toJSON();
        await fetch('/api/push/subscriptions', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'same-origin',
          body: JSON.stringify({ endpoint: j.endpoint, expirationTime: j.expirationTime ?? null, keys: j.keys, lang: 'en' }),
        });
      } catch {
        /* resubscribe failed — next manual enable will recover */
      }
    })(),
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl(event.notification?.data?.url);
  event.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const hit = all.find((w) => w.url.startsWith(self.location.origin));
      if (hit) {
        await hit.focus();
        await hit.navigate(url).catch(() => {});
      } else {
        await self.clients.openWindow(url);
      }
    })(),
  );
});
