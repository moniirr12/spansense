const { chromium } = require('playwright');
const path = require('path');
const fs = require('fs');

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
  const errors = [];
  page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
  page.on('console', msg => { if (msg.type() === 'error') errors.push('CONSOLE: ' + msg.text()); });

  const filePath = 'file:///' + path.resolve('author/author-mock.html').replace(/\\/g, '/');
  await page.goto(filePath);
  await page.waitForTimeout(300);

  // open widget, walk through wizard to export
  await page.click('#awCollapsed');
  await page.waitForTimeout(200);
  await page.setInputFiles('#fileInput', { name: 'HCC PI Report.pdf', mimeType: 'application/pdf', buffer: Buffer.from('dummy') });
  await page.click('#analyzeBtn');
  await page.waitForTimeout(3500);
  await page.click('#toStyleDraftBtn');
  await page.waitForTimeout(200);
  await page.click('#toAuthorBtn');
  await page.waitForTimeout(200);
  await page.click('#toExportBtn');
  await page.waitForTimeout(200);

  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 15000 }),
    page.click('#genWordBtn'),
  ]);

  const suggested = download.suggestedFilename();
  const savePath = path.resolve('_generated_report.docx');
  await download.saveAs(savePath);
  const stat = fs.statSync(savePath);
  const buf = fs.readFileSync(savePath);
  const isZip = buf[0] === 0x50 && buf[1] === 0x4b; // PK.. zip signature (docx is a zip)

  console.log('suggested filename:', suggested);
  console.log('file size bytes:', stat.size);
  console.log('is valid zip/docx signature:', isZip);

  await page.waitForTimeout(1600);
  const overlayText = await page.textContent('#saveBox');
  console.log('overlay text:', overlayText.replace(/\s+/g, ' ').trim());

  // also check the PDF mock still works and message updated
  const { execSync } = require('child_process');
  await page.click('#closeOverlayBtn').catch(() => {});
  await page.waitForTimeout(200);
  await page.click('#genPdfBtn');
  await page.waitForTimeout(1600);
  const pdfOverlayText = await page.textContent('#saveBox');
  console.log('pdf overlay text:', pdfOverlayText.replace(/\s+/g, ' ').trim());

  console.log('ERRORS:', errors.length ? errors.join('\n') : 'none');
  await browser.close();
  //kept for inspection
})();
