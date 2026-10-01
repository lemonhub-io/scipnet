// Reproduce the WebAuthn register/verify failure — capture the real response.
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'https://forum.openhub.today';

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const page = await (await browser.newContext()).newPage();
  page.on('console', (m) => console.log('[page]', m.text().slice(0, 200)));

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2',
      transport: 'internal',
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  // capture the exact verify response
  page.on('response', async (res) => {
    if (res.url().includes('/api/auth/webauthn/')) {
      let body = '';
      try { body = (await res.text()).slice(0, 400); } catch {}
      console.log(`[net] ${res.request().method()} ${res.url().replace(BASE, '')} -> ${res.status()} ${body}`);
    }
  });

  await page.goto(BASE + '/register', { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /issue clearance credential/i }).click();
  await page.waitForTimeout(6000);
  const state = await page.evaluate(() => ({
    done: !!document.querySelector('.passkey-done'),
    err: document.querySelector('.error, [class*=error]')?.textContent ?? null,
  }));
  console.log('UI state:', JSON.stringify(state));
  await page.screenshot({ path: '/tmp/wa-repro.png' });
  await browser.close();
})().catch((e) => { console.error(e); process.exit(1); });
