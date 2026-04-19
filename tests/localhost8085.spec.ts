import { test, expect, TestInfo } from '@playwright/test';
import { INPUTS, BASE, STEP_PAUSE, ACTION_PAUSE, TIMEOUT, AGENTS_TIMEOUT } from './input-reader';

// ── Environment annotations ───────────────────────────────────────────────────
// Added to every test — appear as the Annotations block in the Extent report
function addEnv(info: TestInfo) {
  info.annotations.push({ type: 'OS',             description: 'Windows 11 Pro (10.0.26200)' });
  info.annotations.push({ type: 'Browser',        description: 'Chromium — Desktop Chrome (Playwright built-in)' });
  info.annotations.push({ type: 'Execution Mode', description: 'Headed — 800 ms/action slowMo + 3 s pause per section' });
  info.annotations.push({ type: 'Test Timeout',   description: '90 seconds per test' });
  info.annotations.push({ type: 'App Under Test', description: `AgentOven — ${BASE}` });
}

// ── Suite ─────────────────────────────────────────────────────────────────────
// serial  → tests run in order; if one fails the rest are marked skipped
// headed  → controlled by CLI flag --headed
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

    // Confirm the expected number of agent cards matches the input sheet
    await expect(page.getByRole('button', { name: 'Re-cook' })).toHaveCount(INPUTS.agents.length);
    await page.waitForTimeout(STEP_PAUSE);

    // Screenshot all cards before interacting
    const ssAll = await page.screenshot({ fullPage: true });
    await info.attach('Agents — All Cards', { body: ssAll, contentType: 'image/png' });

    for (let i = 0; i < INPUTS.agents.length; i++) {
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

    // Target first agent (My First Agent) — driven by Agents sheet order
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

  // ── 05 ───────────────────────────────────────────────────────────────────────
  test('05 — Recipes', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Recipes', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Create Recipe' })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 06 ───────────────────────────────────────────────────────────────────────
  // Recipe name + description driven by input/input.xlsx → Recipes sheet
  test('06 — Create Recipe', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    const recipe = INPUTS.recipes[0];   // first recipe row from Excel

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

  // ── 07 ───────────────────────────────────────────────────────────────────────
  test('07 — Run Recipe', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    const recipe = INPUTS.recipes[0];

    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
    await expect(page.getByText(recipe.name, { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'Run' }).first().click();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 08 ───────────────────────────────────────────────────────────────────────
  test('08 — DishShelf', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/dishshelf`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'DishShelf', exact: true })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Recipes' })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 09 ───────────────────────────────────────────────────────────────────────
  test('09 — DishShelf → Recipes Verification', async ({ page }, info) => {
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

  // ── 10 ───────────────────────────────────────────────────────────────────────
  // Prompts to verify + edit driven by input/input.xlsx → Prompts sheet
  test('10 — Prompts', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/prompts`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Prompts', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    // Verify every prompt in the sheet is visible
    for (const prompt of INPUTS.prompts) {
      await expect(page.getByText(prompt.name)).toBeVisible();
    }

    // Screenshot both cards
    await info.attach('Prompts — All Cards',
      { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });

    // Open Edit form for each prompt that has openEdit = true
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

  // ── 11 ───────────────────────────────────────────────────────────────────────
  // Providers driven by input/input.xlsx → Providers sheet
  test('11 — Providers', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Model Providers', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    // Click each provider to expand it
    for (const provider of INPUTS.providers) {
      await page.getByText(provider.name).click();
      await page.waitForTimeout(ACTION_PAUSE);
    }

    // Test connections for providers where testConnection = true
    // Test in reverse order (nth from end) to match existing behaviour
    const testableProviders = INPUTS.providers.filter(p => p.testConnection);
    for (let i = testableProviders.length - 1; i >= 0; i--) {
      await page.getByRole('button', { name: 'Test' }).nth(i).click();
      await page.waitForTimeout(ACTION_PAUSE);
    }
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 12 ───────────────────────────────────────────────────────────────────────
  test('12 — Model Catalog', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Model Catalog', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 13 ───────────────────────────────────────────────────────────────────────
  // Tool names driven by input/input.xlsx → Tools sheet (conditional on server running)
  test('13 — Tools', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'MCP Tools', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    // Check each tool from the Excel sheet (conditional — depends on which MCP servers are running)
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

  // ── 14 ───────────────────────────────────────────────────────────────────────
  test('14 — Traces', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/traces`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Traces', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 15 ───────────────────────────────────────────────────────────────────────
  test('15 — Embeddings', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/embeddings`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Embeddings', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 16 ───────────────────────────────────────────────────────────────────────
  test('16 — Vector Stores', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/vectorstores`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Vector Stores', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 17 ───────────────────────────────────────────────────────────────────────
  // RAG ingest content + expected success message driven by input/input.xlsx → RAG_Pipelines sheet
  test('17 — RAG Pipelines: Ingest', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    const ragInput = INPUTS.rag[0];   // first RAG row from Excel

    await page.goto(`${BASE}/rag`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'RAG Pipelines', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    // Click Ingest tab
    await page.getByRole('button', { name: 'ingest' }).click();
    await page.waitForTimeout(ACTION_PAUSE);

    // Paste document content from Excel
    await page.getByRole('textbox', { name: 'Paste text content to ingest into the vector store...' })
      .fill(ragInput.content);
    await page.waitForTimeout(ACTION_PAUSE);

    // Trigger ingest
    await page.getByRole('button', { name: 'Ingest Document' }).click();

    // Wait for button to reset
    await expect(page.getByRole('button', { name: 'Ingest Document' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(ACTION_PAUSE);

    // Assert success message from Excel
    const successMsg = page.locator('div.text-green-400')
      .filter({ hasText: ragInput.successMessage });
    await expect(successMsg).toBeVisible({ timeout: 15000 });
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 18 ───────────────────────────────────────────────────────────────────────
  test('18 — Connectors', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/connectors`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Data Connectors', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

});
