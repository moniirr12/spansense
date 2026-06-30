const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  const pages = [
    { url: 'http://localhost:3000/dashboard/dashboard.html', out: 'dashboard.png' },
    { url: 'http://localhost:3000/map/map.html', out: 'map.png' },
    { url: 'http://localhost:3000/database/database.html', out: 'database.png' },
  ];

  for (const p of pages) {
    try {
      await page.goto(p.url, { waitUntil: 'load', timeout: 15000 });
      await page.waitForTimeout(2000);
      await page.screenshot({ path: `C:/Users/MONIRK~1/AppData/Local/Temp/claude/c--Users-Monir-Khan-Downloads-spansense/3f9f4c14-753d-4a05-a21d-bbd8118420a8/scratchpad/${p.out}` });
      console.log('Captured', p.url);
    } catch (e) {
      console.log('Failed', p.url, e.message);
    }
  }

  await browser.close();
})();
