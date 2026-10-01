const { chromium } = require('/home/lemon/lemon/craft/node_modules/playwright-core');
const exe = '/home/lemon/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell';
(async () => {
  const b = await chromium.launch({ executablePath: exe, env: { ...process.env, LD_LIBRARY_PATH: '/home/lemon/lemon/goc-war/.chromium-libs' } });
  const ctx = await b.newContext({ viewport: { width: 1100, height: 1400 } });
  for (const [id, name] of [
    ['ae83539c-f1e8-49c9-8d6c-8dda7c9ebf12', 'en'],
    ['ac13395f-a379-4133-bddd-48760eee7b64', 'zh'],
  ]) {
    const p = await ctx.newPage();
    await p.goto(`https://forum.openhub.today/t/${id}`, { waitUntil: 'networkidle' });
    await p.screenshot({ path: `/tmp/doc_${name}.png` });
    await p.close();
  }
  await b.close();
})();
