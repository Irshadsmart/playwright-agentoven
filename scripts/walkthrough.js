/**
 * scripts/walkthrough.js
 * ─────────────────────────────────────────────────────────────────────────────
 * AgentOven full-platform walkthrough — designed for OBS screen recording.
 *
 * Navigates every menu section (Overview → Connectors) + opens reports.
 * A step-banner is injected into the browser at every section so OBS
 * captures what is being demonstrated without any manual annotation.
 *
 * Usage:  node scripts/walkthrough.js
 *         (run OBS before executing this command)
 *
 * Screenshots are saved to:
 *   reports/walkthrough/step-XX-<name>.png
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { chromium } = require('@playwright/test');
const path  = require('path');
const fs    = require('fs');

// ── Config ────────────────────────────────────────────────────────────────────
const BASE          = 'http://localhost:8085';
const SECTION_PAUSE = 6000;   // 6 s on each section — gives OBS time to capture
const ACTION_PAUSE  = 2500;   // 2.5 s between in-page interactions
const HOLD_PAUSE    = 4000;   // 4 s before moving to the next step
const REPORT_DIR    = path.join(__dirname, '..', 'reports', 'walkthrough');

if (!fs.existsSync(REPORT_DIR)) fs.mkdirSync(REPORT_DIR, { recursive: true });

// ── Helpers ───────────────────────────────────────────────────────────────────
let stepNum = 0;

/** Print step header to terminal and inject a step-banner into the browser. */
async function step(page, title, description) {
  stepNum++;
  const label = `Step ${String(stepNum).padStart(2, '0')}: ${title}`;
  const line  = '═'.repeat(64);
  console.log(`\n${line}\n  ${label}\n  ${description}\n${line}`);

  await page.evaluate(({ label, description }) => {
    let el = document.getElementById('__wt_banner__');
    if (!el) {
      el = document.createElement('div');
      el.id = '__wt_banner__';
      Object.assign(el.style, {
        position       : 'fixed',
        bottom         : '0',
        left           : '0',
        right          : '0',
        zIndex         : '999999',
        background     : 'rgba(10,15,30,0.93)',
        color          : '#f1f5f9',
        fontFamily     : '-apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif',
        fontSize       : '13px',
        padding        : '9px 20px',
        display        : 'flex',
        alignItems     : 'center',
        gap            : '14px',
        borderTop      : '2px solid #6366f1',
        pointerEvents  : 'none',
        boxSizing      : 'border-box',
      });
      document.body.appendChild(el);
    }
    const [stepPart, ...titleParts] = label.split(': ');
    el.innerHTML = `
      <span style="background:#6366f1;color:#fff;border-radius:4px;
                   padding:2px 8px;font-weight:700;font-size:11px;white-space:nowrap">
        ${stepPart}
      </span>
      <strong style="color:#e2e8f0;white-space:nowrap">${titleParts.join(': ')}</strong>
      <span style="color:#94a3b8;font-size:12px;overflow:hidden;
                   text-overflow:ellipsis;white-space:nowrap">— ${description}</span>
    `;
  }, { label, description });
}

/** Remove the step banner (e.g. before showing the HTML report). */
async function removeBanner(page) {
  await page.evaluate(() => {
    const el = document.getElementById('__wt_banner__');
    if (el) el.remove();
  });
}

/** Save a full-page screenshot into reports/walkthrough/. */
async function shot(page, name) {
  const safe = name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  const file = `step-${String(stepNum).padStart(2, '0')}-${safe}.png`;
  await page.screenshot({ path: path.join(REPORT_DIR, file), fullPage: true });
  console.log(`  📸  ${file}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('\n🎬  AgentOven Walkthrough — OBS Recording Session\n');
  console.log('   Start OBS recording NOW, then watch the browser.\n');

  const browser = await chromium.launch({
    headless : false,
    slowMo   : 800,
    args     : ['--start-maximized'],
  });

  const context = await browser.newContext({ viewport: null });
  const page    = await context.newPage();

  // ────────────────────────────────────────────────────────────────────────────
  // 01 — Load App
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Load AgentOven', 'Opening localhost:8085 — the AgentOven AI agent platform');
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'home');

  // ────────────────────────────────────────────────────────────────────────────
  // 02 — Overview
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Overview', 'Dashboard — system health, recent runs and key platform metrics');
  await page.getByRole('link', { name: 'Overview' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'overview');

  // ────────────────────────────────────────────────────────────────────────────
  // 03 — Agents — all 5 cards
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Agents — All 5 Agent Cards', 'Five AI agents registered: My First Agent, task-planner, doc-researcher, summarizer, quality-reviewer');
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'agents-all-cards');

  // ────────────────────────────────────────────────────────────────────────────
  // 04 — Integrate modal — My First Agent (all 4 tabs)
  // ────────────────────────────────────────────────────────────────────────────
  const modal = page.locator('div.fixed.inset-0');

  await step(page, 'Agents — Integrate (My First Agent) — Invoke Tab',
    'How to call this agent via HTTP — endpoint, request body, and auth headers');
  await page.getByRole('button', { name: 'Integrate' }).nth(0).click();
  await page.waitForTimeout(ACTION_PAUSE);
  await modal.getByRole('button', { name: 'Invoke' }).click();
  await page.waitForTimeout(3000);
  await shot(page, 'integrate-myFirstAgent-invoke');

  await step(page, 'Agents — Integrate (My First Agent) — Session Tab',
    'Stateful session calls — maintaining conversation context across requests');
  await modal.getByRole('button', { name: 'Session' }).click();
  await page.waitForTimeout(3000);
  await shot(page, 'integrate-myFirstAgent-session');

  await step(page, 'Agents — Integrate (My First Agent) — Test Tab',
    'Built-in test console — send a message and see the agent respond live');
  await modal.getByRole('button', { name: 'Test', exact: true }).click();
  await page.waitForTimeout(3000);
  await shot(page, 'integrate-myFirstAgent-test');

  await step(page, 'Agents — Integrate (My First Agent) — Agent Card Tab',
    'Agent Card — a shareable metadata card that describes this agent\'s capabilities');
  await modal.getByRole('button', { name: 'Agent Card' }).click();
  await page.waitForTimeout(3000);
  await shot(page, 'integrate-myFirstAgent-agentcard');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(ACTION_PAUSE);

  // ────────────────────────────────────────────────────────────────────────────
  // 05–08 — Integrate for remaining 4 agents (Invoke only)
  // ────────────────────────────────────────────────────────────────────────────
  const otherAgents = ['task-planner', 'doc-researcher', 'summarizer', 'quality-reviewer'];
  for (let i = 0; i < otherAgents.length; i++) {
    const name = otherAgents[i];
    await step(page, `Agents — Integrate (${name})`,
      `Integration endpoint and Invoke details for the ${name} agent`);
    await page.getByRole('button', { name: 'Integrate' }).nth(i + 1).click();
    await page.waitForTimeout(ACTION_PAUSE);
    await modal.getByRole('button', { name: 'Invoke' }).click();
    await page.waitForTimeout(2500);
    await shot(page, `integrate-${name}`);
    await page.keyboard.press('Escape');
    await page.waitForTimeout(ACTION_PAUSE);
  }

  // ────────────────────────────────────────────────────────────────────────────
  // 09 — Re-cook
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Agents — Re-cook Action',
    'Re-cook regenerates the agent configuration from its system prompt and skills');
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(ACTION_PAUSE);
  await page.getByRole('button', { name: 'Re-cook' }).first().click();
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'recook-modal');
  await page.getByRole('button', { name: '🔥 Re-cook Agent' }).click();
  await page.waitForTimeout(ACTION_PAUSE);
  await page.keyboard.press('Escape');
  await page.waitForTimeout(HOLD_PAUSE);

  // ────────────────────────────────────────────────────────────────────────────
  // 10 — Cool → Rewarm
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Agents — Cool (Deactivate) Action',
    'Cooling an agent pauses it — it stops accepting requests until Rewarmed');
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(ACTION_PAUSE);
  await page.getByRole('button', { name: 'Cool' }).first().click();
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'agent-cooled');
  await page.waitForTimeout(HOLD_PAUSE);

  await step(page, 'Agents — Rewarm (Reactivate) Action',
    'Rewarm reactivates the cooled agent — it is now live and accepting requests again');
  await page.getByRole('button', { name: 'Rewarm' }).first().click();
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'agent-rewarmed');

  // ────────────────────────────────────────────────────────────────────────────
  // 11 — Recipes
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Recipes', 'Multi-step agent workflows — chain multiple agents into automated pipelines');
  await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'recipes');

  await step(page, 'Recipes — Create New Recipe',
    'Creating a new recipe: fill in a name and description then click Create');
  await page.getByRole('button', { name: 'Create Recipe' }).click();
  await page.waitForTimeout(ACTION_PAUSE);
  await page.getByRole('textbox', { name: 'my-workflow' }).fill('My First Recipe');
  await page.waitForTimeout(ACTION_PAUSE);
  await page.getByRole('textbox', { name: 'A workflow that...' }).fill('My First Recipe description');
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'recipe-create-form');
  await page.getByRole('button', { name: 'Create', exact: true }).click();
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'recipe-created');

  await step(page, 'Recipes — Run Recipe',
    'Executing the recipe — triggers the full agent pipeline defined in this workflow');
  await page.getByRole('button', { name: 'Run' }).first().click();
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'recipe-run');

  // ────────────────────────────────────────────────────────────────────────────
  // 12 — DishShelf
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'DishShelf',
    'DishShelf stores completed recipe outputs — a persistent shelf of finished results');
  await page.goto(`${BASE}/dishshelf`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'dishshelf');

  await step(page, 'DishShelf — Navigate Back to Recipes',
    'Each DishShelf item links back to its source recipe — full traceability');
  await page.getByRole('link', { name: 'Recipes' }).click();
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'dishshelf-to-recipes');

  // ────────────────────────────────────────────────────────────────────────────
  // 13 — Prompts
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Prompts',
    'Reusable prompt templates — qa-test-generator and code-reviewer stored centrally');
  await page.goto(`${BASE}/prompts`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'prompts-both-cards');

  await step(page, 'Prompts — Edit qa-test-generator',
    'Tags: testing, qa, automation — Template defines the full prompt structure sent to the LLM');
  await page.getByRole('button', { name: 'Edit' }).first().click();
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'prompt-qa-test-generator-edit');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(ACTION_PAUSE);

  await step(page, 'Prompts — Edit code-reviewer',
    'Tags: code, review, engineering — Template guides the agent through systematic code review');
  await page.getByRole('button', { name: 'Edit' }).nth(1).click();
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'prompt-code-reviewer-edit');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.waitForTimeout(SECTION_PAUSE);

  // ────────────────────────────────────────────────────────────────────────────
  // 14 — Providers
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Providers',
    'Model Providers — My Anthropic (Claude) and My OpenAI (GPT-4o) configured as LLM backends');
  await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'providers');

  await step(page, 'Providers — Test OpenAI Connection',
    'Sending a live connectivity test to the OpenAI API endpoint');
  await page.getByText('My Anthropic').click();
  await page.waitForTimeout(ACTION_PAUSE);
  await page.getByText('My OpenAI').click();
  await page.waitForTimeout(ACTION_PAUSE);
  await page.getByRole('button', { name: 'Test' }).nth(1).click();
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'providers-test-openai');

  await step(page, 'Providers — Test Anthropic Connection',
    'Sending a live connectivity test to the Anthropic API endpoint');
  await page.getByRole('button', { name: 'Test' }).first().click();
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'providers-test-anthropic');

  // ────────────────────────────────────────────────────────────────────────────
  // 15 — Model Catalog
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Model Catalog',
    'Over 2000 AI models available — browse, filter and select models for each agent or recipe');
  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'model-catalog');

  // ────────────────────────────────────────────────────────────────────────────
  // 16 — MCP Tools
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'MCP Tools',
    'Model Context Protocol tools — external capabilities (Weather, Google Search) available to all agents');
  await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'mcp-tools');

  // ────────────────────────────────────────────────────────────────────────────
  // 17 — Traces
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Traces',
    'Execution traces — full audit trail of every agent run, decision and tool call');
  await page.goto(`${BASE}/traces`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'traces');

  // ────────────────────────────────────────────────────────────────────────────
  // 18 — Embeddings
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Embeddings',
    'Embedding model configurations — convert text to vectors for semantic search and RAG');
  await page.goto(`${BASE}/embeddings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'embeddings');

  // ────────────────────────────────────────────────────────────────────────────
  // 19 — Vector Stores
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Vector Stores',
    'Vector databases — where embeddings are stored and queried for similarity search');
  await page.goto(`${BASE}/vectorstores`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'vector-stores');

  // ────────────────────────────────────────────────────────────────────────────
  // 20 — RAG Pipelines
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'RAG Pipelines',
    'Retrieval-Augmented Generation — ingest documents and query them with AI using vector search');
  await page.goto(`${BASE}/rag`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'rag-pipelines');

  await step(page, 'RAG Pipelines — Ingest Tab',
    'Switching to the Ingest tab — paste document content to store in the vector database');
  await page.getByRole('button', { name: 'ingest' }).click();
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'rag-ingest-tab');

  await step(page, 'RAG Pipelines — Ingest BDD Scenario',
    'Ingesting a BDD test scenario document — it will be vectorised and stored for AI queries');
  const ragContent = [
    'Scenario: Query using naive strategy',
    '  Given documents are ingested',
    '  When user asks "What is AgentOven?"',
    '  And strategy is "naive"',
    '  Then system should return accurate answer',
  ].join('\n');
  await page.getByRole('textbox', {
    name: 'Paste text content to ingest into the vector store...',
  }).fill(ragContent);
  await page.waitForTimeout(ACTION_PAUSE);
  await shot(page, 'rag-ingest-filled');
  await page.getByRole('button', { name: 'Ingest Document' }).click();
  await page.waitForTimeout(3000);
  await shot(page, 'rag-ingest-success');
  await page.waitForTimeout(SECTION_PAUSE);

  // ────────────────────────────────────────────────────────────────────────────
  // 21 — Connectors
  // ────────────────────────────────────────────────────────────────────────────
  await step(page, 'Connectors',
    'Data Connectors — plug external data sources (databases, APIs, files) into the platform');
  await page.goto(`${BASE}/connectors`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(SECTION_PAUSE);
  await shot(page, 'connectors');

  // ────────────────────────────────────────────────────────────────────────────
  // 22-24 — Reports
  // ────────────────────────────────────────────────────────────────────────────
  const reportsBase = path.join(__dirname, '..', 'reports');
  const reportFolders = fs.existsSync(reportsBase)
    ? fs.readdirSync(reportsBase)
        .filter(f => f.startsWith('extent_') &&
          fs.statSync(path.join(reportsBase, f)).isDirectory())
        .sort()
        .reverse()
    : [];

  if (reportFolders.length > 0) {
    const latest      = reportFolders[0];
    const htmlReport  = path.join(reportsBase, latest, 'index.html');
    const pdfReport   = path.join(reportsBase, latest, 'index.pdf');

    // Extent HTML report ───────────────────────────────────────────────────────
    await step(page, 'AgentOven Automation Report — HTML',
      'Interactive HTML report — collapsible test cards, screenshots, pass/fail status for all 18 tests');
    await removeBanner(page);
    const htmlUrl = 'file:///' + htmlReport.replace(/\\/g, '/');
    await page.goto(htmlUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(SECTION_PAUSE);
    await shot(page, 'report-html-collapsed');

    // Expand first card to show screenshot inside
    const firstToggle = page.locator('.toggle-btn').first();
    if (await firstToggle.isVisible()) {
      await firstToggle.click();
      await page.waitForTimeout(ACTION_PAUSE);
      await shot(page, 'report-html-card-expanded');
      await firstToggle.click();   // collapse again
      await page.waitForTimeout(ACTION_PAUSE);
    }

    // PDF report ───────────────────────────────────────────────────────────────
    if (fs.existsSync(pdfReport)) {
      await step(page, 'AgentOven Automation Report — PDF',
        'PDF version of the report — print-ready, email-ready, suitable for management review');
      const pdfUrl = 'file:///' + pdfReport.replace(/\\/g, '/');
      await page.goto(pdfUrl, { waitUntil: 'networkidle' });
      await page.waitForTimeout(SECTION_PAUSE);
      await shot(page, 'report-pdf');
    }
  }

  // Playwright built-in HTML report ───────────────────────────────────────────
  const pwReport = path.join(__dirname, '..', 'playwright-report', 'index.html');
  if (fs.existsSync(pwReport)) {
    await step(page, 'Playwright HTML Report',
      'Built-in Playwright test report — test timeline, retry history, and trace viewer');
    await removeBanner(page);
    const pwUrl = 'file:///' + pwReport.replace(/\\/g, '/');
    await page.goto(pwUrl, { waitUntil: 'networkidle' });
    await page.waitForTimeout(SECTION_PAUSE);
    await shot(page, 'playwright-report');
  }

  // ────────────────────────────────────────────────────────────────────────────
  // Done
  // ────────────────────────────────────────────────────────────────────────────
  console.log(`\n${'═'.repeat(64)}`);
  console.log(`  ✅  Walkthrough complete — ${stepNum} steps`);
  console.log(`  📁  Screenshots → ${REPORT_DIR}`);
  console.log(`${'═'.repeat(64)}\n`);
  console.log('   You can stop OBS recording now.\n');

  // Keep browser open 12 s so OBS captures the final state
  await page.waitForTimeout(12000);
  await browser.close();
}

main().catch(err => {
  console.error('Walkthrough failed:', err);
  process.exit(1);
});
