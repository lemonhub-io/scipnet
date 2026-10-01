const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const exe = '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const b = await chromium.launch({ executablePath: exe, env: { ...process.env, LD_LIBRARY_PATH: '/home/lemon/lemon/goc-war/.chromium-libs' } });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1400 } });
  const p = await ctx.newPage();
  await p.goto('https://forum.openhub.today/t/ae83539c-f1e8-49c9-8d6c-8dda7c9ebf12', { waitUntil: 'networkidle' });
  await p.waitForSelector('.post-body h2', { timeout: 10000 });
  await p.screenshot({ path: '/tmp/go_en_md2.png' });
  const counts = await p.evaluate(() => ({
    h2: document.querySelectorAll('.post-body h2').length,
    strong: document.querySelectorAll('.post-body strong').length,
    li: document.querySelectorAll('.post-body li').length,
    hr: document.querySelectorAll('.post-body hr').length,
    script: document.querySelectorAll('.post-body script').length,
  }));
  console.log(counts);
  const p2 = await ctx.newPage();
  await p2.goto('https://forum.openhub.today/t/ac13395f-a379-4133-bddd-48760eee7b64', { waitUntil: 'networkidle' });
  await p2.waitForSelector('.post-body h2', { timeout: 10000 });
  await p2.screenshot({ path: '/tmp/go_zh_md.png' });
  await b.close();
})();
