/**
 * scripts/register-tools.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Ensures both MCP tools (Weather + Google Search) are registered in AgentOven.
 * Safe to run multiple times — skips any tool that is already registered.
 *
 * Run:  node scripts/register-tools.js
 * Called automatically by run-daily.bat before the test suite.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { chromium } = require('@playwright/test');

const BASE = 'http://localhost:8085';

const TOOLS_TO_REGISTER = [
  {
    name        : 'Weather',
    transport   : 'http',
    endpoint    : 'http://host.docker.internal:3006/mcp',
    description : 'Get real-time weather, 5-day forecast, rain probability, UV index, wind and climate recommendations for any city worldwide.',
    schema      : JSON.stringify({
      type: 'object',
      properties: { query: { type: 'string', description: 'City name e.g. "Bangalore", "London"' } },
      required: ['query'],
    }),
  },
  {
    name        : 'Google Search',
    transport   : 'http',
    endpoint    : 'http://host.docker.internal:3005/mcp',
    description : 'Search the web using DuckDuckGo to find relevant, up-to-date results with titles, snippets, and URLs.',
    schema      : JSON.stringify({
      type: 'object',
      properties: { query: { type: 'string', description: 'Search query string' } },
      required: ['query'],
    }),
  },
];

async function main() {
  console.log('\n🔧  AgentOven Tool Registration\n');

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage();

  await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle' });

  for (const tool of TOOLS_TO_REGISTER) {
    // Check if already registered
    const alreadyThere = await page.getByRole('row').filter({ hasText: tool.name }).isVisible();

    if (alreadyThere) {
      console.log(`  ✅  ${tool.name} — already registered, skipping`);
      continue;
    }

    console.log(`  ➕  Registering: ${tool.name} → ${tool.endpoint}`);

    // Open the Register Tool modal
    await page.getByRole('button', { name: /Register Tool/i }).click();
    await page.waitForTimeout(1000);

    // ── Field 1: Name (placeholder="search-tool") ────────────────────────────
    await page.locator('input[placeholder="search-tool"]').fill(tool.name);
    await page.waitForTimeout(300);

    // ── Field 2: Transport select (already defaults to "http") ───────────────
    // Only change if not http
    const transportSelect = page.locator('select').first();
    await transportSelect.selectOption(tool.transport);
    await page.waitForTimeout(300);

    // ── Field 3: Endpoint (placeholder contains "localhost:3001") ────────────
    await page.locator('input[placeholder*="localhost:3001"]').fill(tool.endpoint);
    await page.waitForTimeout(300);

    // ── Field 4: Description (placeholder="A tool for searching documents...") ─
    await page.locator('input[placeholder*="A tool for searching"]').fill(tool.description);
    await page.waitForTimeout(300);

    // ── Field 5: Schema JSON (textarea) ──────────────────────────────────────
    await page.locator('textarea').fill(tool.schema);
    await page.waitForTimeout(300);

    // ── Checkboxes: ensure "tool" capability is checked (first checkbox) ─────
    const checkboxes   = page.locator('input[type="checkbox"]');
    const firstChecked = await checkboxes.first().isChecked();
    if (!firstChecked) {
      await checkboxes.first().check();
      await page.waitForTimeout(200);
    }

    // ── Submit ────────────────────────────────────────────────────────────────
    const registerBtn = page.getByRole('button', { name: /register|save|add|create/i }).last();
    await registerBtn.click();
    await page.waitForTimeout(2000);

    // Verify it appeared in the table
    await page.reload({ waitUntil: 'networkidle' });
    const registered = await page.getByRole('row').filter({ hasText: tool.name }).isVisible();
    if (registered) {
      console.log(`  ✅  ${tool.name} — registered successfully`);
    } else {
      console.log(`  ⚠️   ${tool.name} — check manually at ${BASE}/tools`);
    }
  }

  await browser.close();
  console.log('\n✅  Tool registration complete\n');
}

main().catch(err => {
  console.error('Registration script error:', err.message);
  process.exit(0);  // Don't block test run if registration fails
});
