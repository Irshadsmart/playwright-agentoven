import { test, expect, TestInfo } from '@playwright/test';
import { INPUTS, BASE, STEP_PAUSE, ACTION_PAUSE, TIMEOUT, AGENTS_TIMEOUT } from './input-reader';
import * as path from 'path';
import * as fs   from 'fs';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx');

// ── Agent test runner — inputs from Agents/Agents.xlsx ────────────────────────
const AGENTS_DIR   = path.join(__dirname, '..', 'Agents');
const AGENTS_INPUT = path.join(AGENTS_DIR, 'Agents.xlsx');

function loadAgentInputs(): { agentName: string; input: string }[] {
  try {
    const wb = XLSX.readFile(AGENTS_INPUT);
    return wb.SheetNames.map((sheet: string) => {
      const rows: string[][] = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { header: 1, defval: '' });
      const inputRow = rows.find(r => String(r[0]).trim().toLowerCase().startsWith('input'));
      return { agentName: sheet, input: inputRow ? String(inputRow[1]).trim() : '' };
    }).filter((a: { agentName: string; input: string }) => a.input.length > 0);
  } catch {
    console.warn('[agent-runner] Agents/Agents.xlsx not found — skipping agent tests');
    return [];
  }
}

const AGENT_INPUTS = loadAgentInputs();
const AGENT_RESPONSE_TIMEOUT = 90_000;

// Collects AI outputs during the run — written to Excel in afterAll
const agentOutputs: {
  agentName: string; input: string; output: string;
  timestamp: string; status: 'passed' | 'failed';
}[] = [];

// ── Environment annotations ───────────────────────────────────────────────────
function addEnv(info: TestInfo) {
  info.annotations.push({ type: 'OS',             description: 'Windows 11 Pro (10.0.26200)' });
  info.annotations.push({ type: 'Browser',        description: 'Chromium — Desktop Chrome (Playwright built-in)' });
  info.annotations.push({ type: 'Execution Mode', description: 'Headed — 800 ms/action slowMo + 3 s pause per section' });
  info.annotations.push({ type: 'Test Timeout',   description: '90 seconds per test' });
  info.annotations.push({ type: 'App Under Test', description: `AgentOven — ${BASE}` });
}

// ── Suite ─────────────────────────────────────────────────────────────────────
test.describe.serial('AgentOven UI — End-to-End Flow', () => {

  // ── 01 ───────────────────────────────────────────────────────────────────────
  test('01 — Load App & Navigate to Overview', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
    await expect(page).toHaveURL(/8085/);
    await expect(page.getByRole('link', { name: 'Overview' })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('link', { name: 'Overview' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByRole('link', { name: 'Agents' })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 02 ───────────────────────────────────────────────────────────────────────
  // Agents list driven by input/input.xlsx → Agents sheet
  // "Full Integrate = true" → 4-tab walkthrough; false → Invoke only
  test('02 — Agents', async ({ page }, info) => {
    test.setTimeout(AGENTS_TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();

    // Count visible Integrate buttons (agent count can vary by warm/cool state)
    const integrateCount = await page.getByRole('button', { name: 'Integrate' }).count();
    expect(integrateCount).toBeGreaterThan(0);
    await page.waitForTimeout(STEP_PAUSE);

    // Screenshot all cards before interacting
    const ssAll = await page.screenshot({ fullPage: true });
    await info.attach('Agents — All Cards', { body: ssAll, contentType: 'image/png' });

    const loopCount = Math.min(integrateCount, INPUTS.agents.length);
    for (let i = 0; i < loopCount; i++) {
      const { name: agentName, fullIntegrate } = INPUTS.agents[i];
      const modal = page.locator('div.fixed.inset-0');

      // Open Integrate modal for this agent
      await page.getByRole('button', { name: 'Integrate' }).nth(i).click();
      await page.waitForTimeout(ACTION_PAUSE);
      await expect(page.getByRole('heading', { name: /Integrate/i })).toBeVisible();

      if (fullIntegrate) {
        // ── Full 4-tab walkthrough ─────────────────────────────────────────────
        await modal.getByRole('button', { name: 'Invoke' }).click();
        await page.waitForTimeout(3000);
        await info.attach(`${agentName} — Invoke tab`,
          { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

        await modal.getByRole('button', { name: 'Session' }).click();
        await page.waitForTimeout(3000);
        await info.attach(`${agentName} — Session tab`,
          { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

        await modal.getByRole('button', { name: 'Test', exact: true }).click();
        await page.waitForTimeout(3000);
        await info.attach(`${agentName} — Test tab`,
          { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

        await modal.getByRole('button', { name: 'Agent Card' }).click();
        await page.waitForTimeout(3000);
        await info.attach(`${agentName} — Agent Card tab`,
          { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      } else {
        // ── Invoke tab only ────────────────────────────────────────────────────
        await modal.getByRole('button', { name: 'Invoke' }).click();
        await page.waitForTimeout(2000);
        await info.attach(`${agentName} — Integrate`,
          { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      }

      // Close modal before moving to next agent
      await page.keyboard.press('Escape');
      await expect(modal).toHaveCount(0);
      await page.waitForTimeout(ACTION_PAUSE);
    }

    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 03 ───────────────────────────────────────────────────────────────────────
  test('03 — Agent Actions: Re-cook', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'Re-cook' }).first().click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('button', { name: '🔥 Re-cook Agent' }).click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.keyboard.press('Escape');
    await expect(page.locator('div.fixed.inset-0')).toHaveCount(0);
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 04 ───────────────────────────────────────────────────────────────────────
  test('04 — Agent Actions: Cool → Rewarm', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'Cool' }).first().click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('button', { name: 'Rewarm' }).first().click();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 05–08 — Agent Test Runner ─────────────────────────────────────────────────
  // Sends each agent's input from Agents/Agents.xlsx via its Test page (Simple mode),
  // waits for the AI response, captures screenshots, and collects outputs for Excel.
  // Runs AFTER all Agents page actions and BEFORE Recipes.

  // ── 05 ───────────────────────────────────────────────────────────────────────
  test('05 — Agent Test: quality-reviewer', async ({ page }, info) => {
    test.setTimeout(120_000);
    addEnv(info);
    const agent = AGENT_INPUTS.find(a => a.agentName === 'quality-reviewer');
    if (!agent) { console.log('  ⚠  quality-reviewer not in Agents.xlsx — skipping'); return; }
    await runAgentTest(page, info, agent.agentName, agent.input);
  });

  // ── 06 ───────────────────────────────────────────────────────────────────────
  test('06 — Agent Test: task-planner', async ({ page }, info) => {
    test.setTimeout(120_000);
    addEnv(info);
    const agent = AGENT_INPUTS.find(a => a.agentName === 'task-planner');
    if (!agent) { console.log('  ⚠  task-planner not in Agents.xlsx — skipping'); return; }
    await runAgentTest(page, info, agent.agentName, agent.input);
  });

  // ── 07 ───────────────────────────────────────────────────────────────────────
  test('07 — Agent Test: doc-researcher', async ({ page }, info) => {
    test.setTimeout(120_000);
    addEnv(info);
    const agent = AGENT_INPUTS.find(a => a.agentName === 'doc-researcher');
    if (!agent) { console.log('  ⚠  doc-researcher not in Agents.xlsx — skipping'); return; }
    await runAgentTest(page, info, agent.agentName, agent.input);
  });

  // ── 08 ───────────────────────────────────────────────────────────────────────
  test('08 — Agent Test: summarizer', async ({ page }, info) => {
    test.setTimeout(120_000);
    addEnv(info);
    const agent = AGENT_INPUTS.find(a => a.agentName === 'summarizer');
    if (!agent) { console.log('  ⚠  summarizer not in Agents.xlsx — skipping'); return; }
    await runAgentTest(page, info, agent.agentName, agent.input);
  });

  // ── 09 ───────────────────────────────────────────────────────────────────────
  test('09 — Recipes', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Recipe' })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 10 ───────────────────────────────────────────────────────────────────────
  test('10 — Create Recipe', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    const recipe = INPUTS.recipes[0];

    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'Create Recipe' }).click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('textbox', { name: 'my-workflow' }).fill(recipe.name);
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('textbox', { name: 'A workflow that...' }).fill(recipe.description);
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText(recipe.name, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 11 ───────────────────────────────────────────────────────────────────────
  test('11 — Run Recipe', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    const recipe = INPUTS.recipes[0];

    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
    await expect(page.getByText(recipe.name, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'Run' }).first().click();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 12 ───────────────────────────────────────────────────────────────────────
  test('12 — DishShelf', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/dishshelf`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'DishShelf', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Recipes' })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 13 ───────────────────────────────────────────────────────────────────────
  test('13 — DishShelf → Recipes Verification', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    const recipe = INPUTS.recipes[0];

    await page.goto(`${BASE}/dishshelf`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('link', { name: 'Recipes' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText(recipe.name, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 14 ───────────────────────────────────────────────────────────────────────
  test('14 — Prompts', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/prompts`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Prompts', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    for (const prompt of INPUTS.prompts) {
      await expect(page.getByText(prompt.name)).toBeVisible();
    }

    await info.attach('Prompts — All Cards',
      { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    let editIndex = 0;
    for (const prompt of INPUTS.prompts) {
      if (!prompt.openEdit) continue;
      await page.getByRole('button', { name: 'Edit' }).nth(editIndex).click();
      await page.waitForTimeout(ACTION_PAUSE);
      await info.attach(`${prompt.name} — Edit Form`,
        { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
      await page.getByRole('button', { name: 'Cancel' }).click();
      await page.waitForTimeout(ACTION_PAUSE);
      editIndex++;
    }

    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 15 ───────────────────────────────────────────────────────────────────────
  test('15 — Providers', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Model Providers', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    for (const provider of INPUTS.providers) {
      await page.getByText(provider.name).click();
      await page.waitForTimeout(ACTION_PAUSE);
    }

    const testableProviders = INPUTS.providers.filter(p => p.testConnection);
    for (let i = testableProviders.length - 1; i >= 0; i--) {
      await page.getByRole('button', { name: 'Test' }).nth(i).click();
      await page.waitForTimeout(ACTION_PAUSE);
    }
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 16 ───────────────────────────────────────────────────────────────────────
  test('16 — Model Catalog', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Model Catalog', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 17 ───────────────────────────────────────────────────────────────────────
  test('17 — Tools', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'MCP Tools', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    const visibleTools: string[] = [];
    for (const tool of INPUTS.tools) {
      const row     = page.getByRole('row').filter({ hasText: tool.name });
      const visible = await row.isVisible();
      if (visible) {
        visibleTools.push(tool.name);
        await expect(row.getByText(tool.transport, { exact: true })).toBeVisible();
        await expect(row.getByText('tool', { exact: true })).toBeVisible();
      }
    }
    await page.waitForTimeout(ACTION_PAUSE);

    const screenshot = await page.screenshot({ fullPage: true });
    const label      = visibleTools.length ? `MCP Tools — ${visibleTools.join(' & ')}` : 'MCP Tools page';
    await info.attach(label, { body: screenshot, contentType: 'image/png' });
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 18 ───────────────────────────────────────────────────────────────────────
  test('18 — Traces', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/traces`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Traces', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 19 ───────────────────────────────────────────────────────────────────────
  test('19 — Embeddings', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/embeddings`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Embeddings', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 20 ───────────────────────────────────────────────────────────────────────
  test('20 — Vector Stores', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/vectorstores`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Vector Stores', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 21 ───────────────────────────────────────────────────────────────────────
  test('21 — RAG Pipelines: Ingest', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    const ragInput = INPUTS.rag[0];

    await page.goto(`${BASE}/rag`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'RAG Pipelines', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'ingest' }).click();
    await page.waitForTimeout(ACTION_PAUSE);

    await page.getByRole('textbox', { name: 'Paste text content to ingest into the vector store...' })
      .fill(ragInput.content);
    await page.waitForTimeout(ACTION_PAUSE);

    await page.getByRole('button', { name: 'Ingest Document' }).click();
    await expect(page.getByRole('button', { name: 'Ingest Document' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(ACTION_PAUSE);

    const successMsg = page.locator('div.text-green-400')
      .filter({ hasText: ragInput.successMessage });
    await expect(successMsg).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 22 ───────────────────────────────────────────────────────────────────────
  test('22 — Connectors', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/connectors`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Data Connectors', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── Write agent outputs to Excel after the full suite completes ───────────────
  test.afterAll(async () => {
    if (agentOutputs.length === 0) return;

    fs.mkdirSync(AGENTS_DIR, { recursive: true });
    const now   = new Date();
    const pad   = (n: number) => String(n).padStart(2, '0');
    const stamp = `${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()}_${pad(now.getHours())}.${pad(now.getMinutes())}`;
    const outFile = path.join(AGENTS_DIR, `Agents_Output_${stamp}.xlsx`);

    const wb = XLSX.utils.book_new();

    for (const { agentName, input, output, timestamp, status } of agentOutputs) {
      const ws = XLSX.utils.aoa_to_sheet([
        ['Agent',     agentName],
        ['Status',    status === 'passed' ? '✅ PASSED' : '❌ FAILED'],
        ['Timestamp', timestamp],
        ['', ''],
        ['Input',     input],
        ['', ''],
        ['Output',    output],
      ]);
      ws['!cols'] = [{ wch: 12 }, { wch: 100 }];
      for (const addr of ['A1','A2','A3','A5','A7']) {
        if (ws[addr]) ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'FF6B35' } } };
      }
      XLSX.utils.book_append_sheet(wb, ws, agentName.slice(0, 31));
    }

    // Summary sheet
    const summaryRows = [
      ['Agent', 'Status', 'Output Preview (first 200 chars)', 'Timestamp'],
      ...agentOutputs.map(o => [
        o.agentName,
        o.status === 'passed' ? '✅ PASSED' : '❌ FAILED',
        o.output.slice(0, 200),
        o.timestamp,
      ]),
    ];
    const summaryWs = XLSX.utils.aoa_to_sheet(summaryRows);
    summaryWs['!cols'] = [{ wch: 20 }, { wch: 12 }, { wch: 80 }, { wch: 25 }];
    for (let c = 0; c < 4; c++) {
      const addr = XLSX.utils.encode_cell({ r: 0, c });
      if (summaryWs[addr]) summaryWs[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E293B' } } };
    }
    XLSX.utils.book_append_sheet(wb, summaryWs, 'Summary');

    XLSX.writeFile(wb, outFile, { bookType: 'xlsx', type: 'buffer', cellStyles: true });
    console.log(`\n📊  Agent outputs saved → ${outFile}`);
  });

});

// ── Agent Test Runner — shared helper ────────────────────────────────────────
async function runAgentTest(
  page: import('@playwright/test').Page,
  info: TestInfo,
  agentName: string,
  input: string,
) {
  info.annotations.push({ type: 'Agent',         description: agentName });
  info.annotations.push({ type: 'Input Preview', description: input.slice(0, 120) + (input.length > 120 ? '…' : '') });

  let capturedOutput = '';
  let status: 'passed' | 'failed' = 'passed';

  try {
    await page.goto(`${BASE}/agents/${agentName}/test`, { waitUntil: 'networkidle' });
    await expect(page.locator('main').getByText('ready')).toBeVisible({ timeout: 15_000 });
    await page.waitForTimeout(ACTION_PAUSE);

    // Ensure Simple mode
    const simpleBtn = page.getByRole('button', { name: 'Simple' });
    if (await simpleBtn.isVisible()) await simpleBtn.click();

    // Screenshot: ready state
    await info.attach(`${agentName} — ready state`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // Fill and send
    const textarea = page.getByPlaceholder('Type a message... (Enter to send)');
    await expect(textarea).toBeVisible({ timeout: 5_000 });
    await textarea.fill(input);
    await page.waitForTimeout(ACTION_PAUSE);
    await textarea.press('Enter');

    console.log(`\n  → [${agentName}] Message sent. Waiting for AI response...`);

    // Wait for response to stabilise (poll page length every 2 s, stable for 4 s = done)
    let prevLen = 0, stable = 0;
    const deadline = Date.now() + AGENT_RESPONSE_TIMEOUT;
    while (Date.now() < deadline) {
      await page.waitForTimeout(2000);
      const curLen: number = await page.evaluate(
        () => (document.querySelector('main')?.innerText ?? '').length
      );
      if (curLen > prevLen + 15) { stable = 0; prevLen = curLen; }
      else if (++stable >= 2)     break;
    }
    await page.waitForTimeout(2000);

    // Screenshot: AI response visible
    await info.attach(`${agentName} — AI response`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });

    // Extract response text — try prose/markdown containers first, then fallback
    for (const sel of ['[class*="prose"]','[class*="markdown"]','article','[class*="message"]:last-child']) {
      const els = await page.locator(sel).all();
      if (!els.length) continue;
      const txt = (await els[els.length - 1].textContent() ?? '').trim();
      if (txt.length > 30 && !txt.toLowerCase().includes('type a message')) {
        capturedOutput = txt; break;
      }
    }
    if (!capturedOutput) {
      capturedOutput = await page.evaluate((userMsg: string) => {
        const main = document.querySelector('main')?.innerText ?? '';
        const idx  = main.lastIndexOf(userMsg.slice(0, 50));
        return idx >= 0 ? main.slice(idx + 50).trim() : main.slice(-3000).trim();
      }, input);
    }

    expect(capturedOutput.length, `Expected AI response for ${agentName}`).toBeGreaterThan(20);
    console.log(`  ✅  [${agentName}] ${capturedOutput.length} chars — ${capturedOutput.slice(0, 80)}…`);

  } catch (err) {
    status = 'failed';
    capturedOutput = `ERROR: ${(err as Error).message}`;
    throw err;
  } finally {
    agentOutputs.push({ agentName, input, output: capturedOutput, timestamp: new Date().toISOString(), status });
  }
}
