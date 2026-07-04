const { chromium } = require('playwright');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.on('pageerror', err => console.log('PAGE EXCEPTION:', err.message));

  await page.goto('http://localhost:3000/index.html');
  await page.fill('#engineerId', 'admin');
  await page.fill('#secureKey', 'admin123');
  await page.click('#loginBtn');
  await page.waitForTimeout(1200);

  await page.evaluate(() => {
    sessionStorage.setItem('structureId', '18');
    sessionStorage.setItem('structureName', 'Culvert at River Thames');
    sessionStorage.setItem('structureType', 'Culvert');
    sessionStorage.setItem('selectedSpan', '1');
  });

  await page.goto('http://localhost:3000/inspection/inspection.html');
  await page.waitForTimeout(2000);

  const rows = page.locator('#inspectionElementsTable tbody tr.main-row');

  for (const idx of [0, 2, 10]) {
    const row = rows.nth(idx);
    const box = await row.boundingBox();
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.waitForTimeout(1700);
    const cloudBox = await page.locator('#rowPreviewCloud').boundingBox();
    const tableBox = await page.locator('#inspectionElementsTable').boundingBox();
    console.log('row', idx, 'rowTop=', box.top, 'tableRight=', tableBox.x + tableBox.width, 'cloudBox=', cloudBox);
    await page.mouse.move(5, 5);
    await page.waitForTimeout(300);
  }

  // Screenshot mid-table row for visual check
  const row5 = rows.nth(5);
  const box5 = await row5.boundingBox();
  await page.mouse.move(box5.x + box5.width / 2, box5.y + box5.height / 2);
  await page.waitForTimeout(1700);
  await page.screenshot({ path: 'shot-right-of-table.png' });

  await browser.close();
})();
