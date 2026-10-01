// Generate PWA icons: the authentic SCP Foundation emblem (far2/Aelanna,
// CC BY-SA 3.0 — path data from Wikimedia Commons "SCP Foundation (emblem).svg"),
// paper-white strokes on the SCiPNET carbon tile.
// Usage: LD_LIBRARY_PATH=<nss-libs> node scripts/gen-icons.cjs
const path = require('path');
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');

const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

// viewBox of the source art: 0 0 135 135, center ~67.7,71.5
const EMBLEM = `
<circle cx="67.7" cy="71.5" r="33" fill="none" stroke="#fbfbfa" stroke-width="6"/>
<path d="m51.9 11.9h31.7l3.07 11.4.944.391c19.4 8.03 32 26.9 32 47.9 0 2.26-.149 4.53-.445 6.77l-.133 1.01 8.37 8.37-15.8 27.4-11.4-3.06-.809.623c-9.06 6.95-20.2 10.7-31.6 10.7-11.4 6e-5-22.5-3.77-31.6-10.7l-.81-.623-11.4 3.06-15.8-27.4 8.37-8.37-.133-1.01c-.296-2.25-.445-4.51-.445-6.77.000141-21 12.6-39.9 32-47.9l.944-.391z" fill="none" stroke="#fbfbfa" stroke-width="4"/>
<g fill="#fbfbfa">
  <path d="m64.7 30.6v24h-5.08l8.08 14 8.08-14h-5.08l-.000265-24h-5.99"/>
  <path transform="rotate(120 67.7 71.5)" d="m64.7 30.6v24h-5.08l8.08 14 8.08-14h-5.08l-.000265-24h-5.99"/>
  <path transform="rotate(240 67.7 71.5)" d="m64.7 30.6v24h-5.08l8.08 14 8.08-14h-5.08l-.000265-24h-5.99"/>
</g>`;

// Regular icons: emblem ~89% of tile. Maskable: ~66% (inside 80% safe zone).
const TARGETS = [
  { file: 'icons/icon-192.png', size: 192, vb: '-8 -8 151 151' },
  { file: 'icons/icon-512.png', size: 512, vb: '-8 -8 151 151' },
  { file: 'icons/icon-maskable-512.png', size: 512, vb: '-34.5 -34.5 204 204' },
  { file: 'apple-touch-icon.png', size: 180, vb: '-8 -8 151 151' },
  { file: 'favicon-32.png', size: 32, vb: '-8 -8 151 151' },
];

(async () => {
  const browser = await chromium.launch({ executablePath: SHELL });
  const page = await browser.newPage();
  const out = path.join(__dirname, '..', 'public');
  for (const t of TARGETS) {
    await page.setContent(
      `<body style="margin:0"><div style="width:${t.size}px;height:${t.size}px;background:#0a0a09"><svg viewBox="${t.vb}" width="${t.size}" height="${t.size}" xmlns="http://www.w3.org/2000/svg">${EMBLEM}</svg></div>`,
    );
    await page.locator('div').screenshot({ path: path.join(out, t.file) });
    console.log('wrote', t.file, `${t.size}x${t.size}`);
  }
  await browser.close();
})();
