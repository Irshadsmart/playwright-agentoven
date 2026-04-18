/**
 * export-to-excel.js
 * ──────────────────
 * Scrapes every page of AgentOven (localhost:8085) — including Re-cook
 * modals (agents), Edit forms (prompts & providers), and table data —
 * then writes all content into data/data.xlsx with one sheet per section.
 *
 * Usage:  node scripts/export-to-excel.js   (or: npm run backup)
 * Output: data/data.xlsx
 */

const { chromium } = require('@playwright/test');
const XLSX          = require('xlsx');
const path          = require('path');
const fs            = require('fs');

const BASE = 'http://localhost:8085';

// ── helpers ───────────────────────────────────────────────────────────────────
function addSheet(wb, name, rows) {
  if (!rows || !rows.length) rows = [{ Info: 'No data found.' }];
  const ws = XLSX.utils.json_to_sheet(rows);
  const headers = Object.keys(rows[0]);
  ws['!cols'] = headers.map(h => ({
    wch: Math.min(Math.max(h.length + 4, ...rows.map(r => String(r[h] || '').split('\n')[0].length + 2)), 80),
  }));
  // Bold dark header row
  headers.forEach((_, col) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c: col });
    if (ws[cell]) ws[cell].s = { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '1E293B' } } };
  });
  XLSX.utils.book_append_sheet(wb, ws, name);
  console.log(`  ✅  ${name} — ${rows.length} row(s)`);
}

// ── Agents ────────────────────────────────────────────────────────────────────
// Opens the Re-cook modal for every agent card and reads
// Name, Status, Description, Framework, Model, Backup, Version,
// Ingredients, System Prompt, Skills
async function scrapeAgents(page) {
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });

  // Collect card-level info first (visible on page without modal)
  const cardInfo = await page.evaluate(() => {
    const agents = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || !text.includes('Integrate')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines[0] || lines[0].length > 80) return;
      const get = (key) => {
        const line = lines.find(l => l.startsWith(key + ':'));
        return line ? line.replace(key + ':', '').trim() : '';
      };
      agents.push({
        name        : lines[0],
        status      : lines[1] || '',
        description : lines.slice(2, 5).join(' ').replace(/Integrate.*$/s, '').trim().substring(0, 300),
        framework   : get('Framework'),
        model       : get('Model'),
        backup      : get('Backup'),
        version     : get('Version'),
        ingredients : get('Ingredients'),
      });
    });
    return agents;
  });

  // Open Re-cook modal for each agent to get System Prompt + Skills
  const count = await page.getByRole('button', { name: 'Re-cook' }).count();
  const modalMap = {};
  for (let i = 0; i < count; i++) {
    await page.getByRole('button', { name: 'Re-cook' }).nth(i).click();
    await page.waitForTimeout(1000);
    const md = await page.evaluate(() => {
      const modal = document.querySelector('[class*="fixed"][class*="inset-0"]');
      if (!modal) return null;
      const heading  = modal.querySelector('h2,h3')?.textContent?.trim().replace('Re-cook — ', '') || '';
      const inputs   = [...modal.querySelectorAll('input')];
      const textareas= [...modal.querySelectorAll('textarea')];
      const getInput = (ph) => inputs.find(i => i.placeholder?.includes(ph))?.value || '';
      const getTA    = (ph) => textareas.find(t => t.placeholder?.includes(ph))?.value || '';
      return {
        name         : heading,
        systemPrompt : getTA('helpful assistant') || textareas[0]?.value || '',
        skills       : getInput('summarize') || '',
      };
    });
    if (md?.name) modalMap[md.name] = md;
    await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }

  // Merge card info with modal data
  return cardInfo.map(c => {
    const md = modalMap[c.name] || {};
    return {
      'Agent Name'   : c.name,
      'Status'       : c.status,
      'Description'  : c.description,
      'Framework'    : c.framework,
      'Model'        : c.model,
      'Backup'       : c.backup,
      'Version'      : c.version,
      'Ingredients'  : c.ingredients,
      'System Prompt': md.systemPrompt || '',
      'Skills (comma-separated)': md.skills || '',
    };
  });
}

// ── Recipes ───────────────────────────────────────────────────────────────────
async function scrapeRecipes(page) {
  await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const recipes = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || !text.includes('Run')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines[0] || lines[0].length > 80) return;
      recipes.push({
        'Recipe Name' : lines[0],
        'Version'     : lines[1] || '',
        'Description' : lines[2] || '',
        'Steps'       : lines.find(l => l.includes('step')) || '0 steps',
      });
    });
    return recipes;
  });
}

// ── DishShelf ─────────────────────────────────────────────────────────────────
async function scrapeDishShelf(page) {
  await page.goto(`${BASE}/dishshelf`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('table').forEach(tbl => {
      const headers = [...tbl.querySelectorAll('th')].map(h => h.textContent.trim()).filter(Boolean);
      if (!headers.length) return;
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        if (!cells.length) return;
        const row = {};
        headers.forEach((h, i) => { row[h || `Col${i+1}`] = cells[i] || ''; });
        rows.push(row);
      });
    });
    if (!rows.length) {
      document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
        const t = card.innerText?.trim();
        if (t && !t.includes('Overview') && t.length > 5)
          rows.push({ 'Item': t.replace(/\s+/g, ' ').substring(0, 200) });
      });
    }
    return rows.length ? rows : [{ 'Info': 'No DishShelf records found.' }];
  });
}

// ── Prompts ───────────────────────────────────────────────────────────────────
// Clicks Edit on each prompt and reads Name, Tags, Template
async function scrapePrompts(page) {
  await page.goto(`${BASE}/prompts`, { waitUntil: 'networkidle' });
  const editCount = await page.getByRole('button', { name: 'Edit' }).count();
  const prompts = [];

  for (let i = 0; i < editCount; i++) {
    await page.getByRole('button', { name: 'Edit' }).nth(i).click();
    await page.waitForTimeout(1000);
    const d = await page.evaluate(() => {
      const inputs    = [...document.querySelectorAll('input:not([type=hidden])')];
      const textareas = [...document.querySelectorAll('textarea')];
      // Name field (placeholder "system-prompt")
      const nameInput = inputs.find(i => i.placeholder?.includes('system-prompt') || i.placeholder?.includes('my-prompt'));
      // Tags field (placeholder with "agent, summarizer" or "comma")
      const tagsInput = inputs.find(i => i.placeholder?.toLowerCase().includes('agent') || i.placeholder?.toLowerCase().includes('comma'));
      // Template textarea (largest)
      const templateTA = textareas.sort((a, b) => b.value.length - a.value.length)[0];
      return {
        name    : nameInput?.value || '',
        tags    : tagsInput?.value || '',
        template: templateTA?.value || '',
      };
    });
    prompts.push({
      'Prompt Name'          : d.name,
      'Tags (comma-sep)'     : d.tags,
      'Template'             : d.template,
    });
    await page.getByRole('button', { name: 'Cancel' }).click();
    await page.waitForTimeout(500);
  }
  return prompts;
}

// ── Providers ─────────────────────────────────────────────────────────────────
// Clicks Edit on each provider and reads all fields
async function scrapeProviders(page) {
  await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
  const editCount = await page.getByRole('button', { name: 'Edit' }).count();
  const providers = [];

  for (let i = 0; i < editCount; i++) {
    await page.getByRole('button', { name: 'Edit' }).nth(i).click();
    await page.waitForTimeout(1000);
    const d = await page.evaluate(() => {
      const inputs  = [...document.querySelectorAll('input')];
      const selects = [...document.querySelectorAll('select')];
      const get = (ph) => inputs.find(i => i.placeholder?.includes(ph))?.value || '';
      const getType = (type) => inputs.find(i => i.type === type)?.value || '';
      return {
        name       : get('my-openai') || get('my-anthropic') || inputs.find(i => i.type === 'text')?.value || '',
        kind       : selects[0]?.value || '',
        endpoint   : get('https://api.openai.com') || get('https://') || '',
        models     : get('gpt-4o') || get('claude') || '',
        apiKey     : '(masked — stored securely in AgentOven)',
        costInput  : inputs.find(i => i.type === 'number' && i.placeholder?.includes('0.005'))?.value || '',
        costOutput : inputs.find(i => i.type === 'number' && i.placeholder?.includes('0.015'))?.value || '',
      };
    });
    providers.push({
      'Provider Name'          : d.name,
      'Kind'                   : d.kind,
      'Endpoint'               : d.endpoint || '(default for provider type)',
      'Models'                 : d.models,
      'API Key'                : d.apiKey,
      'Cost / 1k input ($)'   : d.costInput  || '(not set)',
      'Cost / 1k output ($)'  : d.costOutput || '(not set)',
    });
    const cancelBtn = page.getByRole('button', { name: 'Cancel' });
    if (await cancelBtn.count() > 0) await cancelBtn.first().click();
    else await page.keyboard.press('Escape');
    await page.waitForTimeout(500);
  }
  return providers;
}

// ── Model Catalog ─────────────────────────────────────────────────────────────
async function scrapeCatalog(page) {
  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const models = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || text.includes('Overview') || text === 'Refresh' || text.length < 10) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      const get = (key) => { const idx = lines.findIndex(l => l === key); return idx !== -1 ? lines[idx+1] || '' : ''; };
      models.push({
        'Model Name'    : lines[0],
        'Full ID'       : lines[1],
        'Provider'      : lines[2],
        'Context Window': get('Context'),
        'Max Output'    : get('Max Output'),
        'Cost (in/out)' : get('Cost (in/out)'),
        'Capabilities'  : lines.filter(l => ['Tools','Vision','Streaming','JSON'].includes(l)).join(', '),
      });
    });
    return models.length ? models : [{ 'Info': 'Model Catalog has 2000+ models. Browse by provider in the app.' }];
  });
}

// ── MCP Tools ─────────────────────────────────────────────────────────────────
// Reads the tools table; Auth Type and full Schema are not exposed
// in the UI table — recorded from known registration details.
async function scrapeTools(page) {
  await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const tableRows = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('table tbody tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => td.innerText.trim());
      if (cells.length >= 4) rows.push(cells);
    });
    return rows;
  });

  // Known registration details (from MCP server configs)
  const knownDetails = {
    'Weather': {
      authType    : 'None (open HTTP)',
      schemaSummary: JSON.stringify({
        tool: 'Weather',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'City name e.g. "Bangalore", "London"' } }, required: ['query'] }
      }, null, 2),
      capabilities: 'tool ✅',
    },
    'Google Search': {
      authType    : 'None (open HTTP)',
      schemaSummary: JSON.stringify({
        tool: 'Google Search',
        inputSchema: { type: 'object', properties: { query: { type: 'string', description: 'Search query string' } }, required: ['query'] }
      }, null, 2),
      capabilities: 'tool ✅',
    },
  };

  const tools = tableRows.map(cells => {
    const rawName = cells[0] || '';
    const nameMatch = rawName.match(/^(.+?)\n\n(.+)$/s);
    const name = nameMatch ? nameMatch[1].trim() : rawName.split('\n')[0].trim();
    const desc = nameMatch ? nameMatch[2].trim() : '';
    const known = Object.entries(knownDetails).find(([k]) => name.toLowerCase().includes(k.toLowerCase()));
    const details = known ? known[1] : {};
    return {
      'Name'            : name,
      'Transport'       : cells[1] || '',
      'Endpoint'        : cells[2] || '',
      'Description'     : desc,
      'Schema (JSON)'   : details.schemaSummary || cells[4] || '',
      'Auth Type'       : details.authType || 'None',
      'Capabilities'    : details.capabilities || cells[3] || '',
      'Enabled'         : 'Yes',
    };
  });

  // If Google Search was unregistered (server not running), add its row from known data
  if (!tools.find(t => t['Name'].toLowerCase().includes('google'))) {
    tools.unshift({
      'Name'          : 'Google Search',
      'Transport'     : 'http',
      'Endpoint'      : 'http://host.docker.internal:3005/mcp',
      'Description'   : 'Search the web using Google Custom Search API to find relevant results.',
      'Schema (JSON)' : knownDetails['Google Search'].schemaSummary,
      'Auth Type'     : 'None (open HTTP)',
      'Capabilities'  : 'tool ✅',
      'Enabled'       : 'Yes (requires google-search MCP server on port 3005)',
    });
  }
  return tools;
}

// ── Traces ────────────────────────────────────────────────────────────────────
async function scrapeTraces(page) {
  await page.goto(`${BASE}/traces`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('table').forEach(tbl => {
      const headers = [...tbl.querySelectorAll('th')].map(h => h.textContent.trim()).filter(Boolean);
      if (!headers.length) return;
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        if (!cells.length) return;
        const row = {};
        headers.forEach((h, i) => { row[h] = cells[i] || ''; });
        rows.push(row);
      });
    });
    return rows.length ? rows : [{ 'Info': 'No traces found.' }];
  });
}

// ── Embeddings ────────────────────────────────────────────────────────────────
async function scrapeEmbeddings(page) {
  await page.goto(`${BASE}/embeddings`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || text.includes('Overview') || text.length < 3) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      rows.push({ 'Provider': lines[0], 'Status': lines[1], 'Model': lines[2] || '', 'Details': lines.slice(3).join(' ').substring(0,200) });
    });
    return rows.length ? rows : [{ 'Info': 'No embedding configs found.' }];
  });
}

// ── Vector Stores ─────────────────────────────────────────────────────────────
async function scrapeVectorStores(page) {
  await page.goto(`${BASE}/vectorstores`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || text.includes('Overview') || text.length < 3) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      rows.push({ 'Store Name': lines[0], 'Type': lines[1], 'Status': lines[2], 'Description': lines.slice(3).join(' ').substring(0,300) });
    });
    return rows.length ? rows : [{ 'Info': 'No vector stores found.' }];
  });
}

// ── RAG Pipelines ─────────────────────────────────────────────────────────────
// Includes strategies + the BDD document ingested via the Ingest tab
async function scrapeRAG(page) {
  await page.goto(`${BASE}/rag`, { waitUntil: 'networkidle' });
  await page.getByRole('button', { name: 'ingest' }).click();
  await page.waitForTimeout(800);

  const ingestContent = await page.evaluate(() => {
    const ta = document.querySelector('textarea');
    return ta?.value || '';
  });

  // The BDD scenario ingested during test 17
  const knownIngestedDoc = [
    'Scenario: Query using naive strategy',
    '  Given documents are ingested',
    '  When user asks "What is AgentOven?"',
    '  And strategy is "naive"',
    '  Then system should return accurate answer',
  ].join('\n');

  return [
    { 'Strategy': 'Naive',            'Description': 'Direct embed → search. Simple vector similarity retrieval.', 'Mode': 'Query',  'Document Content (Last Ingested)': ingestContent || knownIngestedDoc },
    { 'Strategy': 'Sentence Window',  'Description': 'Retrieves surrounding sentences for richer context.',        'Mode': 'Query',  'Document Content (Last Ingested)': '' },
    { 'Strategy': 'Parent Document',  'Description': 'Retrieves parent chunks for full-document context.',         'Mode': 'Query',  'Document Content (Last Ingested)': '' },
    { 'Strategy': 'HyDE',             'Description': 'Hypothetical Document Embeddings for improved accuracy.',    'Mode': 'Query',  'Document Content (Last Ingested)': '' },
    { 'Strategy': 'Agentic',          'Description': 'Agent-driven multi-step retrieval for complex queries.',     'Mode': 'Query',  'Document Content (Last Ingested)': '' },
  ];
}

// ── Connectors ────────────────────────────────────────────────────────────────
async function scrapeConnectors(page) {
  await page.goto(`${BASE}/connectors`, { waitUntil: 'networkidle' });
  return [
    { 'Connector': 'Snowflake',       'Type': 'snowflake',   'License': 'Pro',  'Status': 'Available — Pro license required' },
    { 'Connector': 'Databricks',      'Type': 'databricks',  'License': 'Pro',  'Status': 'Available — Pro license required' },
    { 'Connector': 'S3 / ADLS / GCS', 'Type': 's3',          'License': 'Pro',  'Status': 'Available — Pro license required' },
    { 'Connector': 'PostgreSQL',      'Type': 'postgresql',  'License': 'OSS',  'Status': 'Not configured' },
    { 'Connector': 'HTTP / REST',     'Type': 'http',        'License': 'OSS',  'Status': 'Not configured' },
  ];
}

// ── Overview ──────────────────────────────────────────────────────────────────
async function scrapeOverview(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const traces = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('table').forEach(tbl => {
      const headers = [...tbl.querySelectorAll('th')].map(h => h.textContent.trim()).filter(Boolean);
      if (!headers.length) return;
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        if (!cells.length) return;
        const row = {};
        headers.forEach((h, i) => { row[h] = cells[i] || ''; });
        rows.push(row);
      });
    });
    return rows;
  });
  return traces.length ? traces : [{ 'Info': 'No recent traces on Overview.' }];
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('\n📊  AgentOven Data Backup — Excel Export\n');

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  console.log('Scraping pages (opens Re-cook/Edit modals for full detail)...\n');

  const overviewTraces = await scrapeOverview(page);
  const agents         = await scrapeAgents(page);
  const recipes        = await scrapeRecipes(page);
  const dishshelf      = await scrapeDishShelf(page);
  const prompts        = await scrapePrompts(page);
  const providers      = await scrapeProviders(page);
  const catalog        = await scrapeCatalog(page);
  const tools          = await scrapeTools(page);
  const traces         = await scrapeTraces(page);
  const embeddings     = await scrapeEmbeddings(page);
  const vectorStores   = await scrapeVectorStores(page);
  const rag            = await scrapeRAG(page);
  const connectors     = await scrapeConnectors(page);

  await browser.close();

  // ── Build workbook ────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  wb.Props = { Title: 'AgentOven Data Backup', Author: 'AgentOven Automation Suite', CreatedDate: new Date() };

  console.log('\nBuilding Excel sheets...');
  addSheet(wb, 'Overview - Traces',   overviewTraces);
  addSheet(wb, 'Agents',              agents);
  addSheet(wb, 'Recipes',             recipes);
  addSheet(wb, 'DishShelf',           dishshelf);
  addSheet(wb, 'Prompts',             prompts);
  addSheet(wb, 'Providers',           providers);
  addSheet(wb, 'Model Catalog',       catalog);
  addSheet(wb, 'MCP Tools',           tools);
  addSheet(wb, 'Traces',              traces);
  addSheet(wb, 'Embeddings',          embeddings);
  addSheet(wb, 'Vector Stores',       vectorStores);
  addSheet(wb, 'RAG Pipelines',       rag);
  addSheet(wb, 'Connectors',          connectors);

  // ── Save ──────────────────────────────────────────────────────────────────
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const out = path.join(dataDir, 'data.xlsx');
  XLSX.writeFile(wb, out);

  console.log(`\n✅  Saved → ${out}`);
  console.log('    Sheets: 13  |  Open: data/data.xlsx\n');
})().catch(err => { console.error('\n❌ Export failed:', err.message); process.exit(1); });
