import { test, expect, TestInfo } from '@playwright/test';

// ── Constants ─────────────────────────────────────────────────────────────────
const BASE         = 'http://localhost:8085';
const STEP_PAUSE   = 3000;   // pause after reaching a page / completing a section
const ACTION_PAUSE = 1500;   // pause between in-page interactions
const TIMEOUT      = 90_000; // per-test timeout (slowMo + waits)

// ── Environment annotations ───────────────────────────────────────────────────
// Added to every test — appear as the Annotations block in the Extent report
function addEnv(info: TestInfo) {
  info.annotations.push({ type: 'OS',             description: 'Windows 11 Pro (10.0.26200)' });
  info.annotations.push({ type: 'Browser',        description: 'Chromium — Desktop Chrome (Playwright built-in)' });
  info.annotations.push({ type: 'Execution Mode', description: 'Headed — 800 ms/action slowMo + 3 s pause per section' });
  info.annotations.push({ type: 'Test Timeout',   description: '90 seconds per test' });
  info.annotations.push({ type: 'App Under Test', description: 'AgentOven — http://localhost:8085' });
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
  test('02 — Agents', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Agents', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Re-cook' })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 03 ───────────────────────────────────────────────────────────────────────
  test('03 — Agent Actions: Re-cook', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'Re-cook' }).click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('button', { name: '🔥 Re-cook Agent' }).click();
    await page.waitForTimeout(ACTION_PAUSE);
    // Dismiss modal that stays open after re-cook attempt
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

    await page.getByRole('button', { name: 'Cool' }).click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('button', { name: 'Rewarm' }).click();
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
  test('06 — Create Recipe', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('button', { name: 'Create Recipe' }).click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('textbox', { name: 'my-workflow' }).fill('My First Recipe');
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('textbox', { name: 'A workflow that...' }).fill('My First Recipe description');
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('button', { name: 'Create', exact: true }).click();
    await expect(page.getByText('My First Recipe', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 07 ───────────────────────────────────────────────────────────────────────
  test('07 — Run Recipe', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
    await expect(page.getByText('My First Recipe', { exact: true }).first()).toBeVisible();
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

    await page.goto(`${BASE}/dishshelf`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByRole('link', { name: 'Recipes' }).click();
    await page.waitForLoadState('networkidle');
    await expect(page.getByText('My First Recipe', { exact: true }).first()).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 10 ───────────────────────────────────────────────────────────────────────
  test('10 — Prompts', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/prompts`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Prompts', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);
  });

  // ── 11 ───────────────────────────────────────────────────────────────────────
  test('11 — Providers', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'Model Providers', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    await page.getByText('My Anthropic').click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByText('My OpenAI').click();
    await page.waitForTimeout(ACTION_PAUSE);

    await page.getByRole('button', { name: 'Test' }).nth(1).click();
    await page.waitForTimeout(ACTION_PAUSE);
    await page.getByRole('button', { name: 'Test' }).first().click();
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
  test('13 — Tools', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'MCP Tools', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    // ── Assert Google Search tool is registered and enabled ───────────────────
    const googleRow = page.getByRole('row').filter({ hasText: 'Google Search' });
    await expect(googleRow).toBeVisible();
    await expect(googleRow.getByText('http', { exact: true })).toBeVisible();
    await expect(googleRow.getByText('tool', { exact: true })).toBeVisible();
    await page.waitForTimeout(ACTION_PAUSE);

    // ── Assert Weather tool is registered and enabled ─────────────────────────
    const weatherRow = page.getByRole('row').filter({ hasText: 'Weather' });
    await expect(weatherRow).toBeVisible();
    await expect(weatherRow.getByText('http', { exact: true })).toBeVisible();
    await expect(weatherRow.getByText('tool', { exact: true })).toBeVisible();
    await page.waitForTimeout(ACTION_PAUSE);

    // ── Capture full-page screenshot and attach to report ─────────────────────
    // Screenshot shows both tools in the table — visible in Extent report card
    const screenshot = await page.screenshot({ fullPage: true });
    await info.attach('MCP Tools — Google Search & Weather registered', {
      body        : screenshot,
      contentType : 'image/png',
    });
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
  test('17 — RAG Pipelines: Ingest', async ({ page }, info) => {
    test.setTimeout(TIMEOUT);
    addEnv(info);

    await page.goto(`${BASE}/rag`, { waitUntil: 'networkidle' });
    await expect(page.getByRole('heading', { name: 'RAG Pipelines', exact: true })).toBeVisible();
    await page.waitForTimeout(STEP_PAUSE);

    // Click Ingest tab
    await page.getByRole('button', { name: 'ingest' }).click();
    await page.waitForTimeout(ACTION_PAUSE);

    // Paste BDD scenario into Document Content
    const ragContent = [
      'Scenario: Query using naive strategy',
      '  Given documents are ingested',
      '  When user asks "What is AgentOven?"',
      '  And strategy is "naive"',
      '  Then system should return accurate answer',
    ].join('\n');
    await page.getByRole('textbox', { name: 'Paste text content to ingest into the vector store...' }).fill(ragContent);
    await page.waitForTimeout(ACTION_PAUSE);

    // Trigger ingest
    await page.getByRole('button', { name: 'Ingest Document' }).click();

    // Wait for ingestion cycle to complete (button resets to "Ingest Document")
    await expect(page.getByRole('button', { name: 'Ingest Document' })).toBeVisible({ timeout: 10000 });
    await page.waitForTimeout(ACTION_PAUSE);

    // Assert green success message
    const successMsg = page.locator('div.text-green-400').filter({ hasText: 'Ingested 1 doc(s), 1 chunk(s), 1 vector(s)' });
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
