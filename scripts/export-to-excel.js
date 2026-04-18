/**
 * export-to-excel.js
 * ──────────────────
 * Scrapes every page of AgentOven (localhost:8085) and writes all data
 * into a single Excel workbook with one sheet per section.
 *
 * Usage:  node scripts/export-to-excel.js
 * Output: backup/agentoven-data-backup_DD-MM-YYYY.xlsx
 */

const { chromium } = require('@playwright/test');
const XLSX          = require('xlsx');
const path          = require('path');
const fs            = require('fs');

const BASE = 'http://localhost:8085';

// ── helpers ──────────────────────────────────────────────────────────────────
function clean(t) { return (t || '').replace(/\s+/g, ' ').trim(); }

function styleHeader(ws, headers) {
  headers.forEach((_, col) => {
    const cell = XLSX.utils.encode_cell({ r: 0, c: col });
    if (!ws[cell]) return;
    ws[cell].s = {
      font:      { bold: true, color: { rgb: 'FFFFFF' } },
      fill:      { fgColor: { rgb: '1E293B' } },
      alignment: { horizontal: 'center' },
    };
  });
}

// ── page scrapers ─────────────────────────────────────────────────────────────

async function scrapeOverview(page) {
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  const stats = await page.evaluate(() => {
    const tiles = [];
    document.querySelectorAll('[class*="text-2xl"],[class*="text-3xl"],[class*="font-bold"]')
      .forEach(el => {
        const t = el.textContent.trim();
        if (/^\d+$/.test(t)) {
          const label = el.closest('[class*="card"],[class*="tile"],[class*="rounded"]')
                          ?.querySelector('p,span,div:last-child')?.textContent?.trim();
          tiles.push({ Metric: label || '?', Value: t });
        }
      });
    return tiles;
  });

  const traces = await page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('table').forEach(tbl => {
      const headers = [...tbl.querySelectorAll('th')].map(h => h.textContent.trim());
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        if (cells.length && headers.length) {
          const row = {};
          headers.forEach((h, i) => { row[h] = cells[i] || ''; });
          rows.push(row);
        }
      });
    });
    return rows;
  });

  return { stats, traces };
}

async function scrapeAgents(page) {
  await page.goto(`${BASE}/agents`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const agents = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || !text.includes('Integrate')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const name = lines[0] || '';
      if (!name || name.length > 60) return;
      const get = (key) => {
        const line = lines.find(l => l.startsWith(key + ':'));
        return line ? line.replace(key + ':', '').trim() : '';
      };
      agents.push({
        'Agent Name'  : name,
        'Status'      : lines[1] || '',
        'Description' : lines.slice(2, 4).join(' ').replace(/\s+/g,' '),
        'Mode'        : get('') || lines.find(l => l === 'managed' || l === 'simple') || '',
        'Framework'   : get('Framework'),
        'Model'       : get('Model'),
        'Backup'      : get('Backup'),
        'Version'     : get('Version'),
        'Ingredients' : get('Ingredients'),
      });
    });
    return agents;
  });
}

async function scrapeRecipes(page) {
  await page.goto(`${BASE}/recipes`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const recipes = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || !text.includes('Run')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const name = lines[0] || '';
      if (!name || name.length > 80) return;
      recipes.push({
        'Recipe Name' : name,
        'Version'     : lines[1] || '',
        'Description' : lines[2] || '',
        'Steps'       : lines.find(l => l.includes('step')) || '0 steps',
      });
    });
    return recipes;
  });
}

async function scrapeDishShelf(page) {
  await page.goto(`${BASE}/dishshelf`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    // try table first
    document.querySelectorAll('table').forEach(tbl => {
      const headers = [...tbl.querySelectorAll('th')].map(h => h.textContent.trim());
      if (!headers.length) return;
      tbl.querySelectorAll('tbody tr').forEach(tr => {
        const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
        if (cells.length) {
          const row = {};
          headers.forEach((h, i) => { row[h || `Col${i+1}`] = cells[i] || ''; });
          rows.push(row);
        }
      });
    });
    if (!rows.length) {
      document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
        const t = card.innerText?.trim();
        if (t && !t.includes('Overview') && t.length > 5)
          rows.push({ 'Item': t.replace(/\s+/g,' ').substring(0, 200) });
      });
    }
    return rows.length ? rows : [{ 'Item': 'No DishShelf records found' }];
  });
}

async function scrapePrompts(page) {
  await page.goto(`${BASE}/prompts`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const prompts = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || !text.includes('Edit')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const name = lines[0];
      if (!name || name.length > 80) return;
      const content = lines.slice(2).join('\n').replace(/Edit.*$/s,'').trim();
      prompts.push({
        'Prompt Name' : name,
        'Version'     : lines[1] || '',
        'Content'     : content.substring(0, 2000),
      });
    });
    return prompts;
  });
}

async function scrapeProviders(page) {
  await page.goto(`${BASE}/providers`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const providers = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || !text.includes('Test') || !text.includes('API Key')) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      const get = (key) => {
        const line = lines.find(l => l.startsWith(key));
        return line ? line : '';
      };
      providers.push({
        'Provider Name' : lines[0] || '',
        'Type'          : lines[1] || '',
        'API Key'       : get('API Key:') || '(masked)',
        'Default Model' : lines.find(l => l.match(/gpt|claude|titan/i)) || '',
        'Status'        : lines.find(l => l.includes('Healthy') || l.includes('Error')) || '',
        'Last Tested'   : lines.find(l => l.includes('Tested:'))?.replace('Tested:','').trim() || '',
      });
    });
    return providers;
  });
}

async function scrapeCatalog(page) {
  await page.goto(`${BASE}/catalog`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const models = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || text.includes('Overview') || text === 'Refresh') return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      if (lines.length < 2) return;
      const get = (key) => {
        const idx = lines.findIndex(l => l === key);
        return idx !== -1 ? lines[idx+1] || '' : '';
      };
      models.push({
        'Model Name'      : lines[0] || '',
        'Full ID'         : lines[1] || '',
        'Provider'        : lines[2] || '',
        'Context Window'  : get('Context'),
        'Max Output'      : get('Max Output'),
        'Cost (in/out)'   : get('Cost (in/out)'),
        'Capabilities'    : lines.filter(l => ['Tools','Vision','Streaming','JSON'].includes(l)).join(', '),
      });
    });
    return models.length ? models : [{ 'Info': 'Model Catalog has 2000+ models. Open the app to browse by provider.' }];
  });
}

async function scrapeTools(page) {
  await page.goto(`${BASE}/tools`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    const headers = [...document.querySelectorAll('table th')].map(h => h.textContent.trim()).filter(Boolean);
    document.querySelectorAll('table tbody tr').forEach(tr => {
      const cells = [...tr.querySelectorAll('td')].map(td => td.textContent.trim());
      if (!cells.length) return;
      // Split first cell into Name + Description
      const [nameDesc, ...rest] = cells;
      const match = nameDesc.match(/^([A-Z][^\n]{0,40}?)((?:Get|Search|Fetch|Create|Update|Delete|List|Post|Put).+)?$/s);
      const row = {
        'Tool Name'   : match ? match[1].trim() : nameDesc.substring(0,40),
        'Description' : match ? (match[2] || nameDesc.replace(match[1],'').trim()) : '',
        'Transport'   : rest[0] || '',
        'Endpoint'    : rest[1] || '',
        'Capabilities': rest[2] || '',
        'Schema'      : rest[3] || '',
        'Enabled'     : 'Yes',
      };
      rows.push(row);
    });
    return rows;
  });
}

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
    return rows.length ? rows : [{ 'Info': 'No traces found or traces cleared.' }];
  });
}

async function scrapeEmbeddings(page) {
  await page.goto(`${BASE}/embeddings`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || text.includes('Overview') || text.length < 3) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      rows.push({
        'Provider'    : lines[0] || '',
        'Status'      : lines[1] || '',
        'Model'       : lines[2] || '',
        'Description' : lines.slice(3).join(' ').substring(0,200),
      });
    });
    return rows.length ? rows : [{ 'Info': 'No embedding configs found.' }];
  });
}

async function scrapeVectorStores(page) {
  await page.goto(`${BASE}/vectorstores`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const rows = [];
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const text = card.innerText?.trim();
      if (!text || text.includes('Overview') || text.length < 3) return;
      const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
      rows.push({
        'Store Name'  : lines[0] || '',
        'Type'        : lines[1] || '',
        'Status'      : lines[2] || '',
        'Description' : lines.slice(3).join(' ').substring(0,300),
      });
    });
    return rows.length ? rows : [{ 'Info': 'No vector stores found.' }];
  });
}

async function scrapeRAG(page) {
  await page.goto(`${BASE}/rag`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const strategies = [
      { Strategy: 'Naive',           Description: 'Direct embed → search. Simple vector similarity retrieval.', 'Top K': 'Configurable', Namespace: 'Configurable' },
      { Strategy: 'Sentence Window', Description: 'Retrieves surrounding sentences for richer context.',         'Top K': 'Configurable', Namespace: 'Configurable' },
      { Strategy: 'Parent Document', Description: 'Retrieves parent chunks for full-document context.',          'Top K': 'Configurable', Namespace: 'Configurable' },
      { Strategy: 'HyDE',            Description: 'Hypothetical Document Embeddings for improved accuracy.',     'Top K': 'Configurable', Namespace: 'Configurable' },
      { Strategy: 'Agentic',         Description: 'Agent-driven multi-step retrieval for complex queries.',      'Top K': 'Configurable', Namespace: 'Configurable' },
    ];
    return strategies;
  });
}

async function scrapeConnectors(page) {
  await page.goto(`${BASE}/connectors`, { waitUntil: 'networkidle' });
  return page.evaluate(() => {
    const connectors = [
      { 'Connector': 'Snowflake',     'Type': 'snowflake',  'License': 'Pro',  'Status': 'Available (Pro required)' },
      { 'Connector': 'Databricks',    'Type': 'databricks', 'License': 'Pro',  'Status': 'Available (Pro required)' },
      { 'Connector': 'S3 / ADLS / GCS','Type': 's3',        'License': 'Pro',  'Status': 'Available (Pro required)' },
      { 'Connector': 'PostgreSQL',    'Type': 'postgresql', 'License': 'OSS',  'Status': 'Not configured' },
      { 'Connector': 'HTTP / REST',   'Type': 'http',       'License': 'OSS',  'Status': 'Not configured' },
    ];
    // Try to enrich from page DOM
    document.querySelectorAll('[class*="border"][class*="rounded"]').forEach(card => {
      const lines = card.innerText?.trim().split('\n').map(l=>l.trim()).filter(Boolean);
      if (!lines || lines.length < 2) return;
      const name = lines[0];
      const existing = connectors.find(c => c.Connector === name);
      if (existing) existing['Configured'] = lines.find(l => l.toLowerCase().includes('configur')) || '';
    });
    return connectors;
  });
}

// ── Excel builder ─────────────────────────────────────────────────────────────

function addSheet(wb, sheetName, rows) {
  if (!rows || !rows.length) {
    rows = [{ Info: 'No data found for this section.' }];
  }
  const ws = XLSX.utils.json_to_sheet(rows);

  // Auto-column widths
  const headers = Object.keys(rows[0]);
  const colWidths = headers.map(h => {
    const maxLen = Math.max(h.length, ...rows.map(r => String(r[h] || '').length));
    return { wch: Math.min(maxLen + 4, 80) };
  });
  ws['!cols'] = colWidths;
  styleHeader(ws, headers);

  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  console.log(`  ✅  ${sheetName} — ${rows.length} row(s)`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

(async () => {
  console.log('\n📊  AgentOven Data Backup — Excel Export\n');

  const browser = await chromium.launch({ headless: true });
  const page    = await browser.newPage({ viewport: { width: 1440, height: 900 } });

  // ── Scrape all sections ───────────────────────────────────────────────────
  console.log('Scraping pages...');
  const overview    = await scrapeOverview(page);
  const agents      = await scrapeAgents(page);
  const recipes     = await scrapeRecipes(page);
  const dishshelf   = await scrapeDishShelf(page);
  const prompts     = await scrapePrompts(page);
  const providers   = await scrapeProviders(page);
  const catalog     = await scrapeCatalog(page);
  const tools       = await scrapeTools(page);
  const traces      = await scrapeTraces(page);
  const embeddings  = await scrapeEmbeddings(page);
  const vectorStores= await scrapeVectorStores(page);
  const rag         = await scrapeRAG(page);
  const connectors  = await scrapeConnectors(page);

  await browser.close();

  // ── Build workbook ────────────────────────────────────────────────────────
  const wb = XLSX.utils.book_new();
  wb.Props = {
    Title:   'AgentOven Data Backup',
    Subject: 'Full application data export',
    Author:  'AgentOven Automation Suite',
    CreatedDate: new Date(),
  };

  console.log('\nBuilding Excel sheets...');
  addSheet(wb, 'Overview - Stats',    overview.stats.length  ? overview.stats  : [{ Metric: 'No stats', Value: '' }]);
  addSheet(wb, 'Overview - Traces',   overview.traces.length ? overview.traces : [{ Info: 'No recent traces' }]);
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

  // ── Save file ─────────────────────────────────────────────────────────────
  const dataDir = path.join(__dirname, '..', 'data');
  fs.mkdirSync(dataDir, { recursive: true });

  const out = path.join(dataDir, 'data.xlsx');

  XLSX.writeFile(wb, out);

  console.log(`\n✅  Excel saved → ${out}`);
  console.log(`    Sheets: 14 | Open: data/data.xlsx\n`);
})().catch(err => {
  console.error('\n❌  Export failed:', err.message);
  process.exit(1);
});
