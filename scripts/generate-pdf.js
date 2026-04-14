/**
 * generate-pdf.js
 * ────────────────
 * Converts the latest (or a specified) Extent HTML report to a
 * print-quality PDF — all test cards expanded, screenshots embedded.
 *
 * Usage:
 *   node scripts/generate-pdf.js               ← converts latest report
 *   node scripts/generate-pdf.js path/to/index.html
 */

const { chromium } = require('@playwright/test');
const path          = require('path');
const fs            = require('fs');

// ── Core converter ────────────────────────────────────────────────────────────
async function toPDF(htmlFile) {
  const absHtml = path.resolve(htmlFile);
  const absPdf  = absHtml.replace(/\.html$/, '.pdf');
  const fileUrl = 'file:///' + absHtml.replace(/\\/g, '/');

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('  → Loading HTML report...');
  await page.goto(fileUrl, { waitUntil: 'networkidle' });

  // Expand ALL test cards so every screenshot appears in the PDF
  await page.evaluate(() => {
    document.querySelectorAll('[id^="body-"]').forEach(el => {
      el.style.display = 'block';
    });
    document.querySelectorAll('[id^="arr-"]').forEach(el => {
      el.style.transform = 'rotate(180deg)';
    });
  });

  // Let all base64 images fully render before printing
  await page.waitForTimeout(3000);

  console.log('  → Rendering PDF...');
  await page.pdf({
    path            : absPdf,
    format          : 'A4',
    printBackground : true,
    margin          : { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    scale           : 0.82,   // scale down slightly so wide screenshots fit A4
  });

  await browser.close();
  return absPdf;
}

// ── Resolve which HTML to convert ─────────────────────────────────────────────
const arg = process.argv[2];
let htmlFile;

if (arg) {
  htmlFile = path.resolve(arg);
} else {
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) {
    console.error('\n❌  No reports/ directory found. Run tests first.\n');
    process.exit(1);
  }
  const folders = fs.readdirSync(reportsDir)
    .filter(f => f.startsWith('extent_'))
    .sort()
    .reverse();
  if (!folders.length) {
    console.error('\n❌  No extent reports found. Run tests first.\n');
    process.exit(1);
  }
  htmlFile = path.join(reportsDir, folders[0], 'index.html');
}

if (!fs.existsSync(htmlFile)) {
  console.error('\n❌  Report not found:', htmlFile, '\n');
  process.exit(1);
}

console.log('\n📄  Generating PDF...');
console.log('    Source :', htmlFile);

toPDF(htmlFile)
  .then(pdf => console.log(`✅  PDF saved → ${pdf}\n`))
  .catch(err => {
    console.error('\n❌  PDF generation failed:', err.message, '\n');
    process.exit(1);
  });
