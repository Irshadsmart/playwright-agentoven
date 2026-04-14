import {
  Reporter, TestCase, TestResult,
  FullResult, FullConfig, Suite,
} from '@playwright/test/reporter';
import * as fs            from 'fs';
import * as path          from 'path';
import { spawnSync }      from 'child_process';

// ─── Types ───────────────────────────────────────────────────────────────────

interface TestRecord {
  title:             string;
  fullTitle:         string;
  status:            'passed' | 'failed' | 'skipped' | 'timedOut';
  duration:          number;
  startTime:         Date;
  errorMessage?:     string;
  errorStack?:       string;
  screenshots:       string[];   // base64 PNG strings
  annotations:       { type: string; description?: string }[];
  browser:           string;
}

// ─── Reporter ────────────────────────────────────────────────────────────────

export default class ExtentReporter implements Reporter {
  private records:    TestRecord[] = [];
  private runStart  = new Date();
  private outputDir = '';

  onBegin(_config: FullConfig, _suite: Suite) {
    this.runStart = new Date();
    const n   = this.runStart;
    const pad = (x: number) => String(x).padStart(2, '0');
    const tag = `extent_${pad(n.getDate())}-${pad(n.getMonth()+1)}-${n.getFullYear()}_${pad(n.getHours())}.${pad(n.getMinutes())}`;
    this.outputDir = path.join('reports', tag);
    fs.mkdirSync(this.outputDir, { recursive: true });
  }

  onTestEnd(test: TestCase, result: TestResult) {
    const screenshots: string[] = [];

    for (const att of result.attachments) {
      if (att.contentType === 'image/png' && att.path) {
        try {
          const b64 = fs.readFileSync(att.path).toString('base64');
          screenshots.push(b64);
        } catch { /* file might not exist */ }
      }
    }

    this.records.push({
      title:        test.title,
      fullTitle:    test.titlePath().join(' › '),
      status:       result.status as TestRecord['status'],
      duration:     result.duration,
      startTime:    new Date(result.startTime),
      errorMessage: result.error?.message?.replace(/\x1b\[[0-9;]*m/g, ''),
      errorStack:   result.error?.stack?.replace(/\x1b\[[0-9;]*m/g, ''),
      screenshots,
      annotations:  test.annotations ?? [],
      browser:      test.parent?.project()?.name ?? 'unknown',
    });
  }

  onEnd(_result: FullResult) {
    const runEnd  = new Date();
    const elapsed = ((runEnd.getTime() - this.runStart.getTime()) / 1000);
    const dur     = elapsed >= 60
      ? `${Math.floor(elapsed/60)}m ${Math.round(elapsed%60)}s`
      : `${elapsed.toFixed(1)}s`;

    const passed  = this.records.filter(r => r.status === 'passed').length;
    const failed  = this.records.filter(r => r.status === 'failed' || r.status === 'timedOut').length;
    const skipped = this.records.filter(r => r.status === 'skipped').length;
    const total   = this.records.length;

    const html = buildHTML(this.records, this.runStart, runEnd, dur, passed, failed, skipped, total);
    const out  = path.join(this.outputDir, 'index.html');
    fs.writeFileSync(out, html, 'utf-8');
    console.log(`\n📊  Extent Report → ${out}`);

    // ── Auto-generate PDF alongside the HTML report ───────────────────────────
    const pdfScript = path.resolve(process.cwd(), 'scripts', 'generate-pdf.js');
    if (fs.existsSync(pdfScript)) {
      console.log(`📄  Generating PDF...`);
      const result = spawnSync(process.execPath, [pdfScript, out], { stdio: 'inherit' });
      if (result.status !== 0) {
        console.warn('⚠️   PDF generation failed — HTML report is still available.');
      }
    }
  }
}

// ─── HTML Builder ────────────────────────────────────────────────────────────

function fmt(d: Date) {
  const pad = (x: number) => String(x).padStart(2, '0');
  return `${pad(d.getDate())}-${pad(d.getMonth()+1)}-${d.getFullYear()}  ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function statusColor(s: TestRecord['status']) {
  return s === 'passed'                        ? '#22c55e'
       : s === 'failed' || s === 'timedOut'    ? '#ef4444'
       : '#f59e0b';
}
function statusBg(s: TestRecord['status']) {
  return s === 'passed'                        ? '#dcfce7'
       : s === 'failed' || s === 'timedOut'    ? '#fee2e2'
       : '#fef9c3';
}
function statusLabel(s: TestRecord['status']) {
  return s === 'timedOut' ? 'TIMEOUT' : s.toUpperCase();
}

function donut(passed: number, failed: number, skipped: number, total: number) {
  if (total === 0) return '<p style="color:#6b7280">No tests ran.</p>';
  const pct = (n: number) => total === 0 ? 0 : Math.round((n / total) * 100);
  const passP = pct(passed), failP = pct(failed), skipP = pct(skipped);
  const r = 54, cx = 70, cy = 70, circ = 2 * Math.PI * r;
  let offset = 0;
  const arc = (pct: number, color: string) => {
    const len = (pct / 100) * circ;
    const el  = `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}"
      stroke-width="14" stroke-dasharray="${len} ${circ - len}"
      stroke-dashoffset="${-offset}" transform="rotate(-90 ${cx} ${cy})" />`;
    offset += len;
    return el;
  };
  return `
  <svg width="140" height="140" viewBox="0 0 140 140">
    <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#e5e7eb" stroke-width="14"/>
    ${arc(passP, '#22c55e')}
    ${arc(failP, '#ef4444')}
    ${arc(skipP, '#f59e0b')}
    <text x="${cx}" y="${cy - 6}" text-anchor="middle" font-size="22" font-weight="700" fill="#1e293b">${total}</text>
    <text x="${cx}" y="${cy + 14}" text-anchor="middle" font-size="11" fill="#6b7280">Total</text>
  </svg>`;
}

function buildHTML(
  records:  TestRecord[],
  runStart: Date, runEnd: Date,
  dur: string,
  passed: number, failed: number, skipped: number, total: number,
) {

  // pull env annotations from the first test that has them
  const envAnnotations = records.flatMap(r => r.annotations).filter(a => a.description);
  const envMap = new Map<string, string>();
  for (const a of envAnnotations) envMap.set(a.type, a.description ?? '');

  const envRows = envMap.size
    ? [...envMap.entries()].map(([k, v]) => `
      <tr>
        <td style="padding:10px 16px;font-weight:600;color:#374151;background:#f8fafc;border-bottom:1px solid #e5e7eb;white-space:nowrap">${esc(k)}</td>
        <td style="padding:10px 16px;color:#1e293b;border-bottom:1px solid #e5e7eb">${esc(v)}</td>
      </tr>`).join('')
    : `<tr><td colspan="2" style="padding:12px 16px;color:#9ca3af">No environment annotations found.</td></tr>`;

  const testCards = records.map((r, i) => {
    const color = statusColor(r.status);
    const bg    = statusBg(r.status);
    const label = statusLabel(r.status);
    const dSec  = (r.duration / 1000).toFixed(2);

    const screenshots = r.screenshots.length
      ? r.screenshots.map((b64, j) => `
        <div style="margin-top:12px">
          <div style="font-size:12px;color:#6b7280;margin-bottom:6px">📸 Screenshot ${r.screenshots.length > 1 ? j+1 : ''}</div>
          <img src="data:image/png;base64,${b64}"
               style="max-width:100%;border-radius:6px;border:1px solid #e5e7eb;box-shadow:0 2px 8px rgba(0,0,0,.08)"
               alt="screenshot"/>
        </div>`).join('')
      : '';

    const errorBlock = r.errorMessage ? `
      <div style="margin-top:12px;padding:12px 14px;background:#fef2f2;border-left:4px solid #ef4444;border-radius:4px;font-family:monospace;font-size:12px;color:#b91c1c;white-space:pre-wrap">${esc(r.errorMessage)}</div>` : '';

    return `
    <div id="test-${i}" style="border:1px solid #e5e7eb;border-radius:10px;margin-bottom:16px;overflow:hidden;box-shadow:0 1px 4px rgba(0,0,0,.06)">
      <!-- Test header -->
      <div onclick="toggle('body-${i}')"
           style="display:flex;align-items:center;justify-content:space-between;padding:14px 18px;background:${bg};cursor:pointer;user-select:none">
        <div style="display:flex;align-items:center;gap:12px">
          <span style="background:${color};color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:20px;letter-spacing:.5px">${label}</span>
          <span style="font-weight:600;color:#1e293b;font-size:14px">${esc(r.title)}</span>
          <span style="font-size:12px;color:#6b7280;background:rgba(255,255,255,.7);padding:2px 8px;border-radius:12px">${esc(r.browser)}</span>
        </div>
        <div style="display:flex;align-items:center;gap:16px;font-size:12px;color:#6b7280">
          <span>⏱ ${dSec}s</span>
          <span>🕐 ${fmt(r.startTime)}</span>
          <span id="arr-${i}" style="font-size:16px;transition:transform .2s">▼</span>
        </div>
      </div>
      <!-- Test body -->
      <div id="body-${i}" style="padding:16px 18px;background:#fff;display:none">
        ${errorBlock}
        ${screenshots}
        ${!r.errorMessage && !r.screenshots.length
          ? '<p style="color:#9ca3af;font-size:13px">✓ No errors. Test passed cleanly.</p>'
          : ''}
      </div>
    </div>`;
  }).join('');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<title>Extent Report — AgentOven | ${fmt(runStart)}</title>
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{font-family:'Segoe UI',system-ui,sans-serif;background:#f1f5f9;color:#1e293b;min-height:100vh}
  a{color:#3b82f6;text-decoration:none}
  table{border-collapse:collapse;width:100%}
  @media print {
    /* Ensure backgrounds (dark header, coloured badges) print correctly */
    *{-webkit-print-color-adjust:exact!important;print-color-adjust:exact!important}
    /* Expand every test card body so all screenshots appear in the PDF */
    [id^="body-"]{display:block!important}
    [id^="arr-"]{transform:rotate(180deg)!important}
    /* Keep each test card together — avoid splitting across pages */
    [id^="test-"]{page-break-inside:avoid;break-inside:avoid;margin-bottom:12px!important}
    /* Remove click cursor on headers */
    [onclick]{cursor:default!important}
    /* Give each screenshot a page break hint if it is tall */
    img{max-width:100%!important;page-break-inside:avoid;break-inside:avoid}
    /* Tighten outer margins — A4 already has margin set in page.pdf() */
    body{background:#f1f5f9!important}
  }
</style>
</head>
<body>

<!-- ── Top Bar ── -->
<div style="background:linear-gradient(135deg,#1e293b 0%,#334155 100%);color:#fff;padding:18px 32px;display:flex;align-items:center;justify-content:space-between;box-shadow:0 2px 8px rgba(0,0,0,.2)">
  <div style="display:flex;align-items:center;gap:14px">
    <div style="font-size:26px">🧪</div>
    <div>
      <div style="font-size:20px;font-weight:700;letter-spacing:.3px">Extent Automation Report</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:2px">AgentOven UI — End-to-End Test Suite</div>
    </div>
  </div>
  <div style="text-align:right;font-size:12px;color:#94a3b8;line-height:1.8">
    <div>🕐 Start : <strong style="color:#e2e8f0">${fmt(runStart)}</strong></div>
    <div>🏁 End &nbsp;: <strong style="color:#e2e8f0">${fmt(runEnd)}</strong></div>
    <div>⏱ Duration : <strong style="color:#e2e8f0">${dur}</strong></div>
  </div>
</div>

<div style="max-width:1200px;margin:28px auto;padding:0 20px">

  <!-- ── Dashboard ── -->
  <div style="display:grid;grid-template-columns:200px 1fr;gap:24px;background:#fff;border-radius:12px;padding:24px 28px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:24px;border:1px solid #e5e7eb">

    <!-- Donut -->
    <div style="display:flex;flex-direction:column;align-items:center;justify-content:center">
      ${donut(passed, failed, skipped, total)}
      <div style="font-size:12px;color:#6b7280;margin-top:4px">Test Results</div>
    </div>

    <!-- Stat tiles -->
    <div style="display:grid;grid-template-columns:repeat(4,1fr);gap:16px;align-items:center">
      ${[
        ['Total',   total,   '#3b82f6', '#eff6ff', '📋'],
        ['Passed',  passed,  '#22c55e', '#f0fdf4', '✅'],
        ['Failed',  failed,  '#ef4444', '#fef2f2', '❌'],
        ['Skipped', skipped, '#f59e0b', '#fffbeb', '⏭'],
      ].map(([label, val, color, bg, icon]) => `
        <div style="background:${bg};border:1px solid ${color}33;border-radius:10px;padding:18px 14px;text-align:center">
          <div style="font-size:22px;margin-bottom:4px">${icon}</div>
          <div style="font-size:30px;font-weight:800;color:${color}">${val}</div>
          <div style="font-size:12px;color:#6b7280;font-weight:600;letter-spacing:.4px;margin-top:2px">${label}</div>
        </div>`).join('')}
    </div>
  </div>

  <!-- ── Overall Verdict Banner ── -->
  <div style="background:${failed > 0 ? '#fef2f2' : '#f0fdf4'};border:1.5px solid ${failed > 0 ? '#fca5a5' : '#86efac'};border-radius:10px;padding:14px 20px;margin-bottom:24px;display:flex;align-items:center;gap:12px">
    <span style="font-size:22px">${failed > 0 ? '❌' : '✅'}</span>
    <div>
      <div style="font-weight:700;color:${failed > 0 ? '#b91c1c' : '#15803d'};font-size:15px">
        Overall Verdict: ${failed > 0 ? 'TESTS FAILED' : 'ALL TESTS PASSED'}
      </div>
      <div style="font-size:12px;color:#6b7280;margin-top:2px">
        ${envMap.get('Overall Verdict') ?? `${passed} passed · ${failed} failed · ${skipped} skipped out of ${total} total`}
      </div>
    </div>
  </div>

  <!-- ── Environment Table ── -->
  <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);margin-bottom:24px;border:1px solid #e5e7eb;overflow:hidden">
    <div style="background:#1e293b;color:#fff;padding:13px 18px;font-weight:700;font-size:14px;display:flex;align-items:center;gap:8px">
      🖥️ Test Environment
    </div>
    <table>
      <tbody>
        ${envRows}
      </tbody>
    </table>
  </div>

  <!-- ── Test Results ── -->
  <div style="background:#fff;border-radius:12px;box-shadow:0 1px 4px rgba(0,0,0,.08);border:1px solid #e5e7eb;overflow:hidden;margin-bottom:24px">
    <div style="background:#1e293b;color:#fff;padding:13px 18px;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:space-between">
      <span>🧾 Test Results</span>
      <span style="font-size:12px;font-weight:400;color:#94a3b8">Click a row to expand details</span>
    </div>
    <div style="padding:16px">
      ${testCards || '<p style="color:#9ca3af;padding:8px">No test records found.</p>'}
    </div>
  </div>

  <!-- Footer -->
  <div style="text-align:center;font-size:12px;color:#9ca3af;padding-bottom:32px">
    Generated by <strong>Playwright Extent Reporter</strong> · ${fmt(runEnd)} · AgentOven QA Automation
  </div>

</div>

<script>
function toggle(id) {
  const el  = document.getElementById(id);
  const idx = id.split('-')[1];
  const arr = document.getElementById('arr-' + idx);
  if (el.style.display === 'none') {
    el.style.display = 'block';
    arr.style.transform = 'rotate(180deg)';
  } else {
    el.style.display = 'none';
    arr.style.transform = 'rotate(0deg)';
  }
}
// Auto-expand failed tests
document.querySelectorAll('[id^="test-"]').forEach(card => {
  const badge = card.querySelector('span');
  if (badge && (badge.textContent === 'FAILED' || badge.textContent === 'TIMEOUT')) {
    const i = card.id.split('-')[1];
    toggle('body-' + i);
  }
});
</script>
</body>
</html>`;
}

function esc(s: string | undefined) {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}
