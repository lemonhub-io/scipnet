// Image-upload e2e: registers via CDP passkey, crops a PNG avatar (locked 1:1)
// and a PNG attachment (4:3 preset + rotation) through the crop modal, and
// asserts the wire format is WebP with the expected crop geometry.
// SAFARI=1 patches canvas.toBlob to return PNG (WebKit behavior) to exercise
// the WASM encoder fallback.
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://localhost:5173';
const PNG = '/home/lemon/lemon/forum/public/icons/icon-192.png';

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on('console', (m) => { if (m.type() === 'error') console.log('[pageerr]', m.text().slice(0, 200)); });

  if (process.env.SAFARI === '1') {
    await context.addInitScript(() => {
      const orig = HTMLCanvasElement.prototype.toBlob;
      HTMLCanvasElement.prototype.toBlob = function (cb, _type, quality) {
        return orig.call(this, cb, 'image/png', quality);
      };
    });
    console.log('SAFARI mode: canvas.toBlob patched to return PNG');
  }

  const cdp = await page.context().newCDPSession(page);
  await cdp.send('WebAuthn.enable');
  await cdp.send('WebAuthn.addVirtualAuthenticator', {
    options: {
      protocol: 'ctap2', transport: 'internal', hasResidentKey: true,
      hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true,
    },
  });

  // register
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /issue clearance credential/i }).click();
  await page.waitForSelector('.passkey-done', { timeout: 15000 });
  const uname = 'img_' + Date.now().toString(36);
  await page.getByLabel(/personnel id/i).fill(uname);
  await page.getByLabel(/passphrase/i).fill('correct horse battery staple');
  await page.getByRole('button', { name: /file personnel record/i }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  console.log('registered:', uname);

  const dimsOf = async (url) =>
    page.evaluate(async (u) => {
      const r = await fetch(u);
      const buf = new Uint8Array(await r.arrayBuffer());
      const tag = (a, b) => String.fromCharCode(...buf.slice(a, b));
      const img = new Image();
      img.src = u;
      await img.decode();
      return { riff: tag(0, 4), webp: tag(8, 12), ct: r.headers.get('content-type'), w: img.naturalWidth, h: img.naturalHeight };
    }, url);

  // --- avatar: crop modal locked to 1:1 ---
  await page.goto(`${BASE}/u/${uname}`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /amend file/i }).click();
  const avatarReq = page.waitForResponse((r) => r.url().includes('/api/uploads/avatar'), { timeout: 20000 });
  await page.locator('input[type="file"]').setInputFiles(PNG);
  await page.waitForSelector('.crop-modal', { timeout: 10000 });
  console.log('PASS: crop modal opened for avatar');
  // zoom in a bit, then commit — aspect locked, no preset chips expected
  await page.locator('.crop-zoom').fill('2');
  if ((await page.locator('.crop-modal .chip').count()) !== 0) throw new Error('avatar crop should not offer aspect presets');
  await page.getByRole('button', { name: /commit & transcode/i }).click();
  const avatarRes = await (await avatarReq).json();
  if (!avatarRes.url.endsWith('.webp') || avatarRes.contentType !== 'image/webp') throw new Error('avatar not webp');
  const avDims = await dimsOf(avatarRes.url);
  console.log('avatar:', JSON.stringify(avDims));
  if (avDims.riff !== 'RIFF' || avDims.webp !== 'WEBP') throw new Error('avatar bytes not webp');
  if (avDims.w !== avDims.h) throw new Error(`avatar not square: ${avDims.w}x${avDims.h}`);
  console.log('PASS: cropped avatar is square webp');

  // --- attachment: crop modal with aspect presets + rotation ---
  await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' });
  await page.locator('#title').fill('Framing verification — Sector-7 imagery');
  await page.locator('#body').fill('Attached capture follows.');
  const attachReq = page.waitForResponse((r) => r.url().includes('/api/uploads/attachment'), { timeout: 20000 });
  await page.locator('input[type="file"]').setInputFiles(PNG);
  await page.waitForSelector('.crop-modal', { timeout: 10000 });
  // pick the 4:3 preset, rotate 90° (square source → still 4:3 crop), commit
  await page.getByRole('button', { name: '4:3', exact: true }).click();
  await page.locator('.crop-modal button[title="Rotate"]').first().click();
  const outLine = await page.locator('.crop-out').textContent();
  console.log('crop spec line:', outLine.trim());
  await page.getByRole('button', { name: /commit & transcode/i }).click();
  const attachRes = await (await attachReq).json();
  if (!attachRes.url.endsWith('.webp') || attachRes.contentType !== 'image/webp') throw new Error('attachment not webp');
  const atDims = await dimsOf(attachRes.url);
  console.log('attachment:', JSON.stringify(atDims));
  const ratio = atDims.w / atDims.h;
  if (Math.abs(ratio - 4 / 3) > 0.02) throw new Error(`attachment not 4:3: ${atDims.w}x${atDims.h}`);
  console.log('PASS: cropped attachment is 4:3 webp');

  // draft got the media url
  const draft = await page.locator('#body').inputValue();
  if (!draft.includes(attachRes.url)) throw new Error('media url not inserted into body');

  // --- abort path: open modal, cancel, no upload fires ---
  let strayUpload = false;
  page.on('request', (r) => { if (r.url().includes('/api/uploads/')) strayUpload = true; });
  await page.locator('input[type="file"]').setInputFiles(PNG);
  await page.waitForSelector('.crop-modal', { timeout: 10000 });
  await page.getByRole('button', { name: /^abort$/i }).last().click();
  await page.waitForSelector('.crop-modal', { state: 'detached', timeout: 5000 });
  await page.waitForTimeout(300);
  if (strayUpload) throw new Error('abort still uploaded');
  console.log('PASS: abort cancels without uploading');

  // --- thread renders the image ---
  await page.getByRole('button', { name: /file document/i }).click();
  await page.waitForURL(/\/t\//, { timeout: 15000 });
  await page.waitForSelector('img.post-img', { timeout: 15000 });
  const imgOk = await page.locator('img.post-img').evaluate((el) => el.complete && el.naturalWidth > 0);
  if (!imgOk) throw new Error('post image did not load');
  console.log('PASS: thread renders the uploaded webp');

  // --- negative: raw PNG straight at the API is refused ---
  const neg = await page.evaluate(async () => {
    const png = await fetch('/icons/icon-192.png').then((r) => r.blob());
    const fd = new FormData();
    fd.append('file', new File([png], 'x.png', { type: 'image/png' }));
    const r = await fetch('/api/uploads/attachment', { method: 'POST', body: fd });
    return { status: r.status };
  });
  if (neg.status !== 415) throw new Error('non-webp upload was not refused');
  console.log('PASS: server refuses non-webp payloads (415)');

  await browser.close();
  console.log('UPLOAD E2E PASS');
})().catch((e) => { console.error('FAIL:', e); process.exit(1); });
