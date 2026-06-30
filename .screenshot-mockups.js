const { chromium } = require('playwright');
const path = require('path');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const dir = path.join(__dirname, 'mockups');
  const outDir = 'C:/Users/MONIRK~1/AppData/Local/Temp/claude/c--Users-Monir-Khan-Downloads-spansense/3f9f4c14-753d-4a05-a21d-bbd8118420a8/scratchpad';

  const pages = [
    { file: 'dashboard.html', out: 'mock-dashboard.png', full: true },
    { file: 'map.html', out: 'mock-map.png', full: false },
    { file: 'database.html', out: 'mock-database.png', full: true },
  ];

  for (const p of pages) {
    const url = 'file:///' + path.join(dir, p.file).split('\\').join('/');
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(2500);
      await page.screenshot({ path: `${outDir}/${p.out}`, fullPage: p.full });
      console.log('Captured', p.file);
    } catch (e) {
      console.log('FAILED', p.file, e.message);
    }
  }
  await browser.close();
})();
