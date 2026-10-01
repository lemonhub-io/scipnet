const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'https://forum.openhub.today';

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const page = await (await browser.newContext()).newPage();
  page.on('console', (m) => console.log('[console]', m.text().slice(0, 200)));
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));
  await page.goto(BASE + '/?cb=' + Date.now(), { waitUntil: 'networkidle' });
  await page.waitForTimeout(4000);
  const st = await page.evaluate(async () => {
    const regs = await navigator.serviceWorker.getRegistrations();
    return {
      hasSW: 'serviceWorker' in navigator,
      count: regs.length,
      states: regs.map((r) => ({
        url: (r.active || r.installing || r.waiting || {}).scriptURL,
        state: (r.active || r.installing || r.waiting || {}).state,
      })),
      controller: navigator.serviceWorker.controller?.scriptURL ?? null,
      jsBundle: [...document.scripts].map((s) => s.src).join(','),
    };
  });
  console.log(JSON.stringify(st, null, 1));
  await browser.close();
})();
