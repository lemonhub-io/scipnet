// WebAuthn e2e with a NO-UV authenticator (hasUserVerification:false → flags.uv=0).
// This is the real-device case that produced "Credential verification failed".
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://localhost:5173';

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const page = await (await browser.newContext()).newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[pageerr]', m.text().slice(0, 200)); });
  page.on('response', async (res) => {
    if (res.url().includes('/api/auth/webauthn/') || res.url().endsWith('/api/auth/register')) {
      let b = ''; try { b = (await res.text()).slice(0, 300); } catch {}
      console.log(`[net] ${res.url().replace(BASE, '')} -> ${res.status()} ${res.status() >= 400 ? b : 'ok'}`);
    }
  });

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      // UV=1 sets hasUserVerification/isUserVerified; the uv=0 case (no-PIN keys,
      // manager passkeys) is what previously failed verification.
      hasUserVerification: process.env.UV === '1',
      isUserVerified: process.env.UV === '1',
      automaticPresenceSimulation: true,
    },
  });

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /issue clearance credential/i }).click();
  await page.waitForSelector('.passkey-done', { timeout: 15000 });
  console.log('PASS: passkey verified without UV (uv=0)');

  const uname = 'nouv_' + Date.now().toString(36);
  await page.getByLabel(/personnel id/i).fill(uname);
  await page.getByLabel(/passphrase/i).fill('correct horse battery staple');
  await page.getByRole('button', { name: /file personnel record/i }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  const me = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  console.log('PASS: registered as', me.user.username);

  // passkey login with the same no-UV credential
  await page.evaluate(() => fetch('/api/auth/logout', { method: 'POST' }));
  await page.goto(`${BASE}/signin`, { waitUntil: 'networkidle' });
  await page.getByLabel(/personnel id/i).fill(uname);
  await page.getByRole('button', { name: /keycard|passkey|biometric/i }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  const me2 = await page.evaluate(() => fetch('/api/auth/me').then((r) => r.json()));
  console.log('PASS: passkey login as', me2.user.username, 'same-user:', me2.user.id === me.user.id);

  await browser.close();
  console.log('NO-UV E2E PASS');
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
