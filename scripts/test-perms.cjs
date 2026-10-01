// Permission e2e: members may only file in member_post departments (Personnel
// Commons); Site Command (admin) may file anywhere. REMOTE=1 targets remote D1
// for the admin-promotion step; local dev uses --local.
const { execSync } = require('child_process');
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://localhost:5173';
const SCOPE = process.env.REMOTE === '1' ? '--remote' : '--local';

const d1 = (sql) =>
  execSync(`npx wrangler d1 execute agora-db ${SCOPE} --command "${sql}"`, {
    cwd: '/home/lemon/lemon/forum',
    stdio: 'pipe',
  }).toString();

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const page = await (await browser.newContext()).newPage();
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 200)));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /issue clearance credential/i }).click();
  await page.waitForSelector('.passkey-done', { timeout: 15000 });
  const uname = 'perm_' + Date.now().toString(36);
  await page.getByLabel(/personnel id/i).fill(uname);
  await page.getByLabel(/passphrase/i).fill('correct horse battery staple');
  await page.getByRole('button', { name: /file personnel record/i }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  const me = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  const uid = me.user.id;
  console.log('registered member:', uname, uid);

  const post = (slug) =>
    page.evaluate(
      (s) =>
        fetch('/api/threads', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ categorySlug: s, title: 'Perm probe', body: 'probe body' }),
        }).then(async (r) => ({ status: r.status, code: (await r.json().catch(() => ({})))?.error?.code })),
      slug,
    );

  // member → restricted department: refused
  const r1 = await post('announcements');
  console.log('member→announcements:', JSON.stringify(r1));
  if (r1.status !== 403 || r1.code !== 'post_restricted') throw new Error('expected 403 post_restricted');
  console.log('PASS: member refused in Site Directives (403 post_restricted)');

  // member → Personnel Commons: allowed
  const r2 = await post('general');
  console.log('member→general:', JSON.stringify(r2));
  if (r2.status !== 201) throw new Error('expected 201');
  console.log('PASS: member filed in Personnel Commons');

  // UI: chips — 4 sealed, 1 open; restricted CTA on a sealed department page
  await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.chip', { timeout: 10000 });
  const chips = await page.evaluate(() =>
    [...document.querySelectorAll('.chip')].map((c) => ({
      text: c.textContent.trim(), disabled: c.disabled, sealed: c.classList.contains('chip-sealed'),
    })),
  );
  const sealed = chips.filter((c) => c.sealed && c.disabled).length;
  const open = chips.filter((c) => !c.disabled).length;
  console.log('chips:', JSON.stringify(chips));
  if (sealed !== 4 || open !== 1) throw new Error(`expected 4 sealed + 1 open chip, got ${sealed}/${open}`);
  console.log('PASS: member sees 4 sealed departments, 1 open');

  await page.goto(`${BASE}/c/announcements`, { waitUntil: 'networkidle' });
  const badge = await page.evaluate(() => document.querySelector('.subnav .pin-badge')?.textContent?.trim() ?? null);
  if (!badge) throw new Error('no restricted badge on sealed department');
  console.log('PASS: sealed department shows badge —', badge);

  // promote to Site Command → all departments open
  d1(`UPDATE users SET role='admin' WHERE id='${uid}'`);
  const r3 = await post('announcements');
  console.log('admin→announcements:', JSON.stringify(r3));
  if (r3.status !== 201) throw new Error('admin was refused in announcements');
  console.log('PASS: Site Command filed in Site Directives');

  await page.reload({ waitUntil: 'networkidle' });
  await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' });
  await page.waitForSelector('.chip', { timeout: 10000 });
  const openAdmin = await page.evaluate(
    () => [...document.querySelectorAll('.chip')].filter((c) => !c.disabled).length,
  );
  if (openAdmin !== 5) throw new Error(`admin should see 5 open chips, got ${openAdmin}`);
  console.log('PASS: Site Command sees all departments open');

  await browser.close();
  console.log('PERMS E2E PASS — uid:', uid);
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
