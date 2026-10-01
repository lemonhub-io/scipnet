// PWA e2e: SW registers + claims, precaches, runtime-caches API, offline nav works.
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://localhost:4999';

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();

  // load 1: SW installs, activates (skipWaiting), claims (clientsClaim)
  await page.goto(BASE + '/', { waitUntil: 'networkidle' });
  await page.waitForFunction(() => !!navigator.serviceWorker?.controller, { timeout: 15000 });

  // load 2: SW now controls — runtime cache should capture the API read
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(800);

  const reg = await page.evaluate(async () => {
    const r = await navigator.serviceWorker.getRegistration();
    return { scope: r.scope, scriptURL: r.active?.scriptURL };
  });
  console.log('SW:', reg.scriptURL, '| scope:', reg.scope);

  const apiCached = await page.evaluate(async () => {
    const names = await caches.keys();
    const api = names.find((n) => n.includes('scipnet-api'));
    if (!api) return [];
    const c = await caches.open(api);
    return (await c.keys()).map((r) => new URL(r.url).pathname);
  });
  console.log('api cache:', JSON.stringify(apiCached));

  // offline — app shell + cached API data must render
  await ctx.setOffline(true);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  const checks = await page.evaluate(() => ({
    banner: !!document.querySelector('.nav-banner'),
    logo: document.querySelector('.nav-logo')?.textContent?.includes('SCiPNET'),
    offlineBar: !!document.querySelector('.pwa-bar'),
    offlineText: (document.querySelector('.pwa-bar')?.textContent ?? '').trim(),
    deptSection: document.body.textContent?.includes('Department'),
  }));
  console.log('offline render:', JSON.stringify(checks));
  await page.screenshot({ path: '/tmp/pwa-offline.png' });

  // API request offline must serve cached JSON, not error
  const offlineApi = await page.evaluate(async () => {
    try {
      const res = await fetch('/api/categories');
      const data = await res.json();
      return { ok: res.ok, count: data.categories?.length };
    } catch (e) {
      return { ok: false, err: String(e) };
    }
  });
  console.log('offline api read:', JSON.stringify(offlineApi));

  await ctx.setOffline(false);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(800);
  const back = await page.evaluate(() => !document.querySelector('.pwa-bar'));
  console.log('back online, banner gone:', back);

  const pass =
    reg.scriptURL?.endsWith('/sw.js') &&
    apiCached.length > 0 &&
    checks.banner && checks.logo && checks.offlineBar &&
    offlineApi.ok && back;
  console.log(pass ? 'PWA E2E PASS' : 'PWA E2E FAIL');
  await browser.close();
  process.exit(pass ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
