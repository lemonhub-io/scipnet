// PWA update-prompt e2e on a local static build: serve dist/, let sw.js v1
// activate, then append a byte comment to sw.js on disk (a "new deploy") and
// force reg.update(). Standalone context → toast must ask before updating;
// normal tab → silent auto-update. Run `npm run build` first.
const fs = require('fs');
const http = require('http');
const path = require('path');
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const EXE = '/home/lemon/.cache/ms-playwright/chromium-1243/chrome-linux64/chrome';
const DIST = path.join(__dirname, '..', 'dist', 'client', 'client');
const SW = path.join(DIST, 'sw.js');
const MIME = { '.js': 'text/javascript', '.html': 'text/html', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.css': 'text/css', '.svg': 'image/svg+xml' };
process.env.LD_LIBRARY_PATH = '/home/lemon/lemon/goc-war/.chromium-libs:' + (process.env.LD_LIBRARY_PATH || '');

if (!fs.existsSync(SW)) {
  console.error('dist/client/client/sw.js missing — run npm run build first');
  process.exit(1);
}

const server = http.createServer((req, res) => {
  const p = path.join(DIST, decodeURIComponent(req.url.split('?')[0]).replace(/\/$/, 'index.html'));
  fs.readFile(p, (e, buf) => {
    if (e) {
      res.writeHead(404).end('nf');
      return;
    }
    res.writeHead(200, { 'content-type': MIME[path.extname(p)] || 'application/octet-stream', 'cache-control': 'no-store' });
    res.end(buf);
  });
});

async function run(standalone) {
  const orig = fs.readFileSync(SW); // restore on every run — v1 again
  const profile = fs.mkdtempSync(`/tmp/updprof-${standalone ? 'sa' : 'tab'}-`);
  const ctx = await chromium.launchPersistentContext(profile, { executablePath: EXE, headless: true });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 160)));

  if (standalone) {
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'standalone', { get: () => true, configurable: true });
    });
  }

  await page.goto('http://localhost:8577/', { waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 20000 });
  // Reload once so v1 is already controlling when registerSW runs —
  // workbox-window marks _isUpdate at register() time, and an existing
  // controller is what makes the post-update 'controlling' event reload.
  await page.reload({ waitUntil: 'load' });
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
  console.log(`[${standalone ? 'standalone' : 'tab'}] sw v1 active (2nd load)`);

  // "deploy" a new build: same assets, different sw.js bytes
  fs.writeFileSync(SW, Buffer.concat([orig, Buffer.from('\n// build v2\n')]));
  await page.evaluate(() => navigator.serviceWorker.getRegistration().then((r) => r.update()));

  if (standalone) {
    const toast = page.locator('.pwa-toast', { hasText: 'update?' });
    await toast.waitFor({ timeout: 30000 });
    console.log('[standalone] toast:', (await toast.textContent()).trim().replace(/\s+/g, ' '));
    const reloaded = page.waitForEvent('load', { timeout: 20000 });
    await page.getByRole('button', { name: /update now/i }).click();
    await reloaded;
    await page.waitForFunction(() => navigator.serviceWorker.controller !== null, { timeout: 15000 });
    const isV2 = await page.evaluate(() => fetch('/sw.js').then((r) => r.text()).then((t) => t.includes('build v2')));
    console.log('[standalone] reloaded into v2:', isV2);
    if (!isV2) throw new Error('page did not pick up the new build');
  } else {
    await page.waitForEvent('load', { timeout: 30000 });
    const n = await page.locator('.pwa-toast').count();
    if (n !== 0) throw new Error('prompt should not appear in a browser tab');
    console.log('[tab] updated silently, no prompt');
  }

  fs.writeFileSync(SW, orig); // restore before next run
  await ctx.close();
  fs.rmSync(profile, { recursive: true, force: true });
}

(async () => {
  await new Promise((r) => server.listen(8577, r));
  await run(true);
  await run(false);
  server.close();
  console.log('UPDATE FLOW PASSED');
  process.exit(0);
})().catch((e) => {
  console.error('FAIL:', e);
  process.exit(1);
});
