// Markdown e2e: register via CDP passkey → compose a markdown document →
// exercise the preview toggle → file → assert rendered DOM (headings, lists,
// code, quote, table, links, /media/ embed) and that raw HTML is escaped.
const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const SHELL =
  '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
const BASE = process.env.BASE || 'http://localhost:5174';

const BODY = `# Mission Report

Field notes from **Sector-7** — *extraction* went \`clean\`.

## Findings

- First item
- Second item
- Third item

1. Numbered one
2. Numbered two

> Quoted directive text
> second line

| Col A | Col B |
|-------|-------|
| c1    | c2    |

\`\`\`js
const x = 1;
\`\`\`

~~retracted~~ · [linked](https://scp-wiki.wikidot.com) · bare https://example.com

---

<script>alert(1)</script><img src=x onerror=alert(2)>

/media/fake-test.webp`;

(async () => {
  const browser = await chromium.launch({
    executablePath: SHELL,
    env: { ...process.env, LD_LIBRARY_PATH: '/home/lemon/lemon/goc-war/.chromium-libs' },
  });
  const context = await browser.newContext({ viewport: { width: 1100, height: 1300 } });
  const page = await context.newPage();
  page.on('dialog', (d) => { d.dismiss(); console.log('!! dialog fired — XSS?', d.message()); });

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
  const uname = 'md_' + Date.now().toString(36);
  await page.getByLabel(/personnel id/i).fill(uname);
  await page.getByLabel(/passphrase/i).fill('correct horse battery staple');
  await page.getByRole('button', { name: /file personnel record/i }).click();
  await page.waitForURL(`${BASE}/`, { timeout: 15000 });
  console.log('registered:', uname);

  const assert = (ok, label) => console.log((ok ? '  ✓' : '  ✗ FAIL'), label);

  // compose
  await page.goto(`${BASE}/new`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: /personnel commons/i }).click();
  await page.getByLabel(/designation/i).fill('Markdown field test');
  await page.getByLabel(/document body/i).fill(BODY);

  // preview toggle
  await page.getByRole('button', { name: /^preview$/i }).click();
  await page.waitForSelector('.md-preview', { timeout: 5000 });
  const pv = async (sel) => (await page.$$(`.md-preview ${sel}`)).length;
  console.log('PREVIEW');
  assert((await pv('h1')) === 1, 'h1');
  assert((await pv('h2')) === 1, 'h2');
  assert((await pv('ul li')) === 3, 'ul×3');
  assert((await pv('ol li')) === 2, 'ol×2');
  assert((await pv('blockquote')) === 1, 'blockquote');
  assert((await pv('table th')) === 2, 'table th×2');
  assert((await pv('pre code')) === 1, 'code block');
  assert((await pv('del')) === 1, 'strikethrough');
  assert((await pv('a[target="_blank"]')) >= 2, 'ext links');
  assert((await pv('img.post-img')) === 1, '/media/ embed');
  assert((await pv('script')) === 0, 'no <script> element');
  await page.screenshot({ path: '/tmp/md_preview.png' });
  await page.getByRole('button', { name: /^write$/i }).click();

  // file it
  await page.getByRole('button', { name: /file document/i }).click();
  await page.waitForURL(/\/t\//, { timeout: 15000 });
  console.log('filed:', page.url());
  await page.waitForSelector('.post-body', { timeout: 8000 });
  const tb = async (sel) => (await page.$$(`.post-body ${sel}`)).length;
  console.log('RENDERED THREAD');
  assert((await tb('h1')) === 1, 'h1');
  assert((await tb('h2')) === 1, 'h2');
  assert((await tb('ul li')) === 3, 'ul×3');
  assert((await tb('ol li')) === 2, 'ol×2');
  assert((await tb('blockquote')) === 1, 'blockquote');
  assert((await tb('table th')) === 2, 'table th×2');
  assert((await tb('pre code')) === 1, 'code block');
  assert((await tb('del')) === 1, 'strikethrough');
  assert((await tb('hr')) === 1, 'hr');
  assert((await tb('a[target="_blank"]')) >= 2, 'ext links');
  const imgSrc = await page.evaluate(() => document.querySelector('.post-body img.post-img')?.getAttribute('src'));
  assert(imgSrc === '/media/fake-test.webp', `/media/ img src (${imgSrc})`);
  assert((await tb('script')) === 0, 'no <script> element');
  const esc = await page.evaluate(() => document.querySelector('.post-body').textContent.includes('<script>alert(1)</script>'));
  assert(esc, 'raw HTML escaped → visible as text');
  await page.screenshot({ path: '/tmp/md_thread.png', fullPage: true });

  // reply composer preview
  await page.getByPlaceholder(/addendum text/i).fill('**bold** reply\n\n- a\n- b');
  await page.locator('.composer-foot').getByRole('button', { name: /^preview$/i }).click();
  await page.waitForSelector('.composer .md-preview', { timeout: 5000 });
  assert((await page.$$('.composer .md-preview strong')).length === 1, 'reply preview bold');
  assert((await page.$$('.composer .md-preview li')).length === 2, 'reply preview list');

  fs_cleanup();
  await browser.close();
  console.log('DONE');

  function fs_cleanup() {
    require('fs').writeFileSync('/tmp/md_uname.txt', uname);
  }
})();
