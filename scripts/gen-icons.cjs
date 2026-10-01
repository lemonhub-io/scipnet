// Generate PWA icons: white SCiPNET emblem on black tile.
// Usage: LD_LIBRARY_PATH=<nss-libs> node scripts/gen-icons.cjs
const path = require('path');
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');

const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';

const EMBLEM = `
<circle cx="24" cy="24" r="19.5" fill="none" stroke="#fbfbfa" stroke-width="4"/>
<g fill="none" stroke="#fbfbfa" stroke-width="3.6" stroke-linecap="square">
  <path d="M24 7 V16.5 M19.5 12 L24 16.5 L28.5 12"/>
  <path transform="rotate(120 24 24)" d="M24 7 V16.5 M19.5 12 L24 16.5 L28.5 12"/>
  <path transform="rotate(240 24 24)" d="M24 7 V16.5 M19.5 12 L24 16.5 L28.5 12"/>
</g>
<circle cx="24" cy="37.6" r="2.7" fill="#fbfbfa"/>
<circle cx="12.4" cy="17.2" r="2.7" fill="#fbfbfa"/>
<circle cx="35.6" cy="17.2" r="2.7" fill="#fbfbfa"/>`;

// Regular icons: emblem ~89% of tile. Maskable: ~68% (inside 80% safe zone).
const TARGETS = [
  { file: 'icons/icon-192.png', size: 192, vb: '-3 -3 54 54' },
  { file: 'icons/icon-512.png', size: 512, vb: '-3 -3 54 54' },
  { file: 'icons/icon-maskable-512.png', size: 512, vb: '-9.5 -9.5 67 67' },
  { file: 'apple-touch-icon.png', size: 180, vb: '-3 -3 54 54' },
  { file: 'favicon-32.png', size: 32, vb: '-3 -3 54 54' },
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
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
