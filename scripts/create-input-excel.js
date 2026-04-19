/**
 * scripts/create-input-excel.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Generates input/input.xlsx — the single source of truth for all test inputs.
 *
 * Edit the data objects below or edit the Excel directly.
 * Run this script only to regenerate the file from scratch.
 *
 * Usage:  node scripts/create-input-excel.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const XLSX = require('xlsx');
const path = require('path');
const fs   = require('fs');

const OUT_DIR  = path.join(__dirname, '..', 'input');
const OUT_FILE = path.join(OUT_DIR, 'input.xlsx');

if (!fs.existsSync(OUT_DIR)) fs.mkdirSync(OUT_DIR, { recursive: true });

// ── Shared style helpers ───────────────────────────────────────────────────────
function headerCell(value) {
  return { v: value, t: 's', s: { font: { bold: true }, fill: { fgColor: { rgb: 'FF6B35' } }, alignment: { horizontal: 'center' } } };
}

function makeSheet(headers, rows) {
  const data = [headers, ...rows];
  const ws   = XLSX.utils.aoa_to_sheet(data);
  // Bold first row
  const range = XLSX.utils.decode_range(ws['!ref'] || 'A1');
  for (let c = range.s.c; c <= range.e.c; c++) {
    const addr = XLSX.utils.encode_cell({ r: 0, c });
    if (!ws[addr]) continue;
    ws[addr].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: 'FF6B35' } } };
  }
  return ws;
}

const wb = XLSX.utils.book_new();

// ────────────────────────────────────────────────────────────────────────────
// Sheet 1 — Config
// Global settings: app URL, timeouts, mode flags
// ────────────────────────────────────────────────────────────────────────────
const configSheet = makeSheet(
  ['Key', 'Value', 'Description'],
  [
    ['BASE_URL',          'http://localhost:8085',  'AgentOven application base URL'],
    ['STEP_PAUSE_MS',     '3000',                   'Pause (ms) after reaching a page or completing a section'],
    ['ACTION_PAUSE_MS',   '1500',                   'Pause (ms) between individual in-page interactions'],
    ['TEST_TIMEOUT_MS',   '90000',                  'Per-test timeout in milliseconds (90 s default)'],
    ['AGENTS_TIMEOUT_MS', '120000',                 'Extended timeout for Agents test (5 agents × Integrate tabs)'],
  ]
);
XLSX.utils.book_append_sheet(wb, configSheet, 'Config');

// ────────────────────────────────────────────────────────────────────────────
// Sheet 2 — Agents
// List of agents to verify + Integrate tab walkthrough settings
// Full Integrate = walk through all 4 tabs (Invoke, Session, Test, Agent Card)
// ────────────────────────────────────────────────────────────────────────────
const agentsSheet = makeSheet(
  ['Agent Name', 'Verify', 'Full Integrate', 'Notes'],
  [
    ['My First Agent',    'true',  'true',  'Full 4-tab Integrate walkthrough'],
    ['task-planner',      'true',  'false', 'Invoke tab only'],
    ['doc-researcher',    'true',  'false', 'Invoke tab only'],
    ['summarizer',        'true',  'false', 'Invoke tab only'],
    ['quality-reviewer',  'true',  'false', 'Invoke tab only'],
  ]
);
XLSX.utils.book_append_sheet(wb, agentsSheet, 'Agents');

// ────────────────────────────────────────────────────────────────────────────
// Sheet 3 — Recipes
// Recipes to create and run during the test
// ────────────────────────────────────────────────────────────────────────────
const recipesSheet = makeSheet(
  ['Recipe Name', 'Description', 'Notes'],
  [
    ['My First Recipe', 'My First Recipe description', 'Created in test 06, run in test 07'],
  ]
);
XLSX.utils.book_append_sheet(wb, recipesSheet, 'Recipes');

// ────────────────────────────────────────────────────────────────────────────
// Sheet 4 — Prompts
// Expected prompt cards to verify on the Prompts page
// ────────────────────────────────────────────────────────────────────────────
const promptsSheet = makeSheet(
  ['Prompt Name', 'Verify', 'Open Edit', 'Notes'],
  [
    ['qa-test-generator', 'true', 'true', 'Tags: testing, qa, automation'],
    ['code-reviewer',     'true', 'true', 'Tags: code, review, engineering'],
  ]
);
XLSX.utils.book_append_sheet(wb, promptsSheet, 'Prompts');

// ────────────────────────────────────────────────────────────────────────────
// Sheet 5 — Providers
// Provider names to click and test during the Providers test
// ────────────────────────────────────────────────────────────────────────────
const providersSheet = makeSheet(
  ['Provider Name', 'Test Connection', 'Notes'],
  [
    ['My Anthropic', 'true', 'Claude Sonnet model'],
    ['My OpenAI',    'true', 'GPT-4o model'],
  ]
);
XLSX.utils.book_append_sheet(wb, providersSheet, 'Providers');

// ────────────────────────────────────────────────────────────────────────────
// Sheet 6 — Tools
// MCP tools expected in the Tools table (conditionally checked — server must be running)
// ────────────────────────────────────────────────────────────────────────────
const toolsSheet = makeSheet(
  ['Tool Name', 'Transport', 'Endpoint', 'Notes'],
  [
    ['Weather',       'http', 'http://host.docker.internal:3006/mcp', 'weather-mcp/server.js on port 3006'],
    ['Google Search', 'http', 'http://host.docker.internal:3005/mcp', 'google-search-mcp/server.js on port 3005'],
  ]
);
XLSX.utils.book_append_sheet(wb, toolsSheet, 'Tools');

// ────────────────────────────────────────────────────────────────────────────
// Sheet 7 — RAG_Pipelines
// Document content to ingest via the RAG Pipelines → Ingest tab
// Expected success message is checked after ingest
// ────────────────────────────────────────────────────────────────────────────
const ragContent = [
  'Scenario: Query using naive strategy',
  '  Given documents are ingested',
  '  When user asks "What is AgentOven?"',
  '  And strategy is "naive"',
  '  Then system should return accurate answer',
].join('\n');

const ragSheet = makeSheet(
  ['Ingest Content', 'Strategy', 'Expected Success Message', 'Notes'],
  [
    [
      ragContent,
      'naive',
      'Ingested 1 doc(s), 1 chunk(s), 1 vector(s)',
      'BDD test scenario for AgentOven RAG query',
    ],
  ]
);
// Enable wrap text on the content cell so newlines are visible in Excel
ragSheet['A2'] = { v: ragContent, t: 's', s: { alignment: { wrapText: true, vertical: 'top' } } };
XLSX.utils.book_append_sheet(wb, ragSheet, 'RAG_Pipelines');

// ────────────────────────────────────────────────────────────────────────────
// Set column widths on every sheet
// ────────────────────────────────────────────────────────────────────────────
const COL_WIDTHS = {
  Config       : [{ wch: 22 }, { wch: 30 }, { wch: 55 }],
  Agents       : [{ wch: 22 }, { wch: 10 }, { wch: 16 }, { wch: 40 }],
  Recipes      : [{ wch: 22 }, { wch: 35 }, { wch: 35 }],
  Prompts      : [{ wch: 22 }, { wch: 10 }, { wch: 12 }, { wch: 35 }],
  Providers    : [{ wch: 18 }, { wch: 18 }, { wch: 25 }],
  Tools        : [{ wch: 18 }, { wch: 12 }, { wch: 45 }, { wch: 40 }],
  RAG_Pipelines: [{ wch: 55 }, { wch: 12 }, { wch: 42 }, { wch: 40 }],
};
for (const [name, cols] of Object.entries(COL_WIDTHS)) {
  if (wb.Sheets[name]) wb.Sheets[name]['!cols'] = cols;
}

// Write file
XLSX.writeFile(wb, OUT_FILE, { bookType: 'xlsx', type: 'buffer', cellStyles: true });

console.log(`\n✅  Input file created → ${OUT_FILE}`);
console.log(`    Sheets: ${wb.SheetNames.join(', ')}\n`);
console.log('   Edit input/input.xlsx to change test inputs without touching code.\n');
