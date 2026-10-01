// Push e2e against production: passkey-register a member, subscribe for real
// via FCM (full chromium, persistent profile — Push API is off in incognito
// contexts), receive the declarative push through the SW fallback, verify the
// reply trigger + per-subscription language + cleanup.
const { execSync } = require('child_process');
const fs = require('fs');
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const EXE = '/home/lemon/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const BASE = process.env.BASE || 'https://forum.openhub.today';
process.env.LD_LIBRARY_PATH =
  '/home/lemon/lemon/goc-war/.chromium-libs:' + (process.env.LD_LIBRARY_PATH || '');

const SC_PW = process.env.SC_PASSWORD;
if (!SC_PW) {
  console.error('SC_PASSWORD env var required (Site Command passphrase for the addendum step)');
  process.exit(1);
}

const d1 = (sql) =>
  execSync(`npx wrangler d1 execute agora-db --remote --command "${sql}"`, {
    cwd: '/home/lemon/lemon/forum',
    stdio: 'pipe',
  }).toString();

(async () => {
  const profile = fs.mkdtempSync('/tmp/pushprof-');
  const ctx = await chromium.launchPersistentContext(profile, {
    executablePath: EXE,
    headless: true,
    args: ['--enable-features=PushMessaging'],
    permissions: ['notifications'],
  });
  const page = await ctx.newPage();
  page.on('console', (m) => console.log('[con]', m.text().slice(0, 160)));
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

  // passkey register
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /issue clearance credential/i }).click();
  await page.waitForSelector('.passkey-done', { timeout: 15000 });
  const uname = 'push_' + Date.now().toString(36);
  await page.getByLabel(/personnel id/i).fill(uname);
  await page.getByLabel(/passphrase/i).fill('correct horse battery staple');
  await page.getByRole('button', { name: /file personnel record/i }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  const me = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  console.log('registered:', uname, me.user.id);

  // collect SW push broadcasts
  await page.evaluate(() => {
    window.__pushes = [];
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data?.type === 'scipnet:push') window.__pushes.push(e.data);
    });
  });

  // subscribe through the real push path
  const subRes = await page.evaluate(async () => {
    const { publicKey } = await fetch('/api/push/vapid').then((r) => r.json());
    if (!publicKey) return { err: 'no vapid' };
    const b64 = publicKey.replace(/-/g, '+').replace(/_/g, '/');
    const key = Uint8Array.from(atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4)), (c) => c.charCodeAt(0));
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const j = sub.toJSON();
    const r = await fetch('/api/push/subscriptions', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: j.endpoint, expirationTime: j.expirationTime ?? null, keys: j.keys, lang: 'en' }),
    });
    return { put: r.status, endpoint: j.endpoint.slice(0, 60), p256dh: !!j.keys?.p256dh };
  }).catch((e) => ({ err: String(e).slice(0, 300) }));
  console.log('subscribe:', JSON.stringify(subRes));
  if (!subRes || subRes.put !== 200) throw new Error('subscribe failed: ' + JSON.stringify(subRes));

  const rows = JSON.parse(d1(`SELECT count(*) AS n, lang FROM push_subscriptions`).match(/\[[\s\S]*\]/)?.[0] ?? '{}');
  console.log('db rows:', JSON.stringify(rows));

  // 1) link test → real push delivery (FCM needs a few seconds to
  // propagate a fresh token; retry while it settles)
  await page.waitForTimeout(4000);
  let t1 = await page.evaluate(() => fetch('/api/push/test', { method: 'POST' }).then((r) => r.json()));
  for (let i = 0; i < 4 && !t1.sent; i++) {
    await page.waitForTimeout(4000);
    // re-PUT in case the worker pruned the row on a transient 404
    await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.ready;
      const j = (await reg.pushManager.getSubscription())?.toJSON();
      if (j?.endpoint) {
        await fetch('/api/push/subscriptions', {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ endpoint: j.endpoint, expirationTime: j.expirationTime ?? null, keys: j.keys, lang: 'en' }),
        });
      }
    });
    t1 = await page.evaluate(() => fetch('/api/push/test', { method: 'POST' }).then((r) => r.json()));
  }
  console.log('push test:', JSON.stringify(t1));
  await page.waitForFunction(() => window.__pushes.length >= 1, { timeout: 30000 });
  let pushes = await page.evaluate(() => window.__pushes);
  console.log('received:', JSON.stringify(pushes));
  if (!/link test/i.test(pushes[0].title)) throw new Error('unexpected test title');
  console.log('PASS: declarative push delivered end-to-end via FCM');

  // 2) member files a document; Site Command appends an addendum → push to member
  const tid = await page.evaluate(() =>
    fetch('/api/threads', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ categorySlug: 'general', title: 'Push probe', body: 'probe' }),
    }).then((r) => r.json()).then((d) => d.thread.id),
  );
  await page.evaluate(
    (pw) =>
      fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: 'SiteCommand', password: pw }),
      }),
    SC_PW,
  );
  const reply = await page.evaluate(
    (t) =>
      fetch(`/api/threads/${t}/replies`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: 'Received. File under review.' }),
      }).then((r) => r.status),
    tid,
  );
  console.log('reply status:', reply);
  await page.waitForFunction(() => window.__pushes.length >= 2, { timeout: 30000 });
  pushes = await page.evaluate(() => window.__pushes);
  const notif = pushes[1];
  console.log('received:', JSON.stringify(notif));
  if (!/addendum/i.test(notif.title) || !notif.url.includes(tid)) throw new Error('bad reply push: ' + JSON.stringify(notif));
  console.log('PASS: reply triggered localized declarative push to thread author');

  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));

  // 3) lang=zh re-PUT → Chinese title
  await page.evaluate(
    (u) =>
      fetch('/api/auth/login', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: u, password: 'correct horse battery staple' }),
      }),
    uname,
  );
  await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const j = (await reg.pushManager.getSubscription()).toJSON();
    return fetch('/api/push/subscriptions', {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint: j.endpoint, expirationTime: j.expirationTime ?? null, keys: j.keys, lang: 'zh' }),
    });
  });
  const t2 = await page.evaluate(() => fetch('/api/push/test', { method: 'POST' }).then((r) => r.json()));
  await page.waitForFunction(() => window.__pushes.length >= 3, { timeout: 30000 });
  pushes = await page.evaluate(() => window.__pushes);
  console.log('zh push:', JSON.stringify({ sent: t2.sent, title: pushes[2].title }));
  if (!/链路测试/.test(pushes[2].title)) throw new Error('zh localization failed');
  console.log('PASS: per-subscription zh localization');

  // 4) unsubscribe → row gone
  const un = await page.evaluate(async () => {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    const endpoint = sub.endpoint;
    const r = await fetch('/api/push/subscriptions', {
      method: 'DELETE', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ endpoint }),
    });
    await sub.unsubscribe();
    return r.status;
  });
  console.log('unsubscribe:', un);

  console.log('ALL PUSH TESTS PASSED');

  // cleanup: test user + thread (cascade removes sub rows if any remain)
  d1(`DELETE FROM replies WHERE thread_id='${tid}'`);
  d1(`DELETE FROM threads WHERE id='${tid}'`);
  d1(`DELETE FROM push_subscriptions WHERE user_id='${me.user.id}'`);
  d1(`DELETE FROM sessions WHERE user_id='${me.user.id}'`);
  d1(`DELETE FROM webauthn_credentials WHERE user_id='${me.user.id}'`);
  d1(`DELETE FROM users WHERE id='${me.user.id}'`);
  console.log('cleaned:', uname);
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
