const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = 'http://localhost:5173';
const PNG = '/home/lemon/lemon/forum/public/icons/icon-192.png';

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (m) => console.log('[console]', m.type(), m.text().slice(0, 300)));
  page.on('pageerror', (e) => console.log('[pageerror]', String(e).slice(0, 300)));

  // login directly: register via API-less path not possible (passkey gate) —
  // reuse virtual authenticator
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: { protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /issue clearance credential/i }).click();
  await page.waitForSelector('.passkey-done', { timeout: 15000 });
  const uname = 'dbg_' + Date.now().toString(36);
  await page.getByLabel(/personnel id/i).fill(uname);
  await page.getByLabel(/passphrase/i).fill('correct horse battery staple');
  await page.getByRole('button', { name: /file personnel record/i }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });

  await page.goto(`${BASE}/u/${uname}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /amend file/i }).click();
  await page.locator('input[type="file"]').setInputFiles(PNG);
  await page.waitForSelector('.crop-modal', { timeout: 10000 });
  await page.waitForTimeout(800);

  // inspect cropper state
  const info = await page.evaluate(() => ({
    cropArea: !!document.querySelector('.reactEasyCrop_CropArea'),
    img: !!document.querySelector('.reactEasyCrop_Image'),
    out: document.querySelector('.crop-out')?.textContent,
    btnDisabled: [...document.querySelectorAll('.crop-foot button')].map(b => b.disabled),
    buttons: [...document.querySelectorAll('.crop-foot button')].map(b => b.textContent),
  }));
  console.log('state:', JSON.stringify(info));
  await page.screenshot({ path: '/tmp/crop-modal.png' });

  await page.getByRole('button', { name: /commit & transcode/i }).click();
  await page.waitForTimeout(3000);
  const post = await page.evaluate(() => ({
    out: document.querySelector('.crop-out')?.textContent,
    err: document.querySelector('.crop-err')?.textContent,
    modalStillThere: !!document.querySelector('.crop-modal'),
  }));
  console.log('after commit:', JSON.stringify(post));
  await page.screenshot({ path: '/tmp/crop-after.png' });
  await browser.close();
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
