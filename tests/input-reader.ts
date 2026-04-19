/**
 * tests/input-reader.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Reads input/input.xlsx and exports typed test inputs.
 * All hardcoded test data lives in the Excel file — change it there,
 * not in the test code.
 *
 * Sheets consumed:
 *   Config, Agents, Recipes, Prompts, Providers, Tools, RAG_Pipelines
 * ─────────────────────────────────────────────────────────────────────────────
 */

// eslint-disable-next-line @typescript-eslint/no-require-imports
const XLSX = require('xlsx');
import * as path from 'path';

// ── File path ─────────────────────────────────────────────────────────────────
const INPUT_FILE = path.join(__dirname, '..', 'input', 'input.xlsx');

// ── Low-level sheet reader ────────────────────────────────────────────────────
function readSheet<T = Record<string, string>>(wb: ReturnType<typeof XLSX.readFile>, sheetName: string): T[] {
  const ws = wb.Sheets[sheetName];
  if (!ws) {
    console.warn(`[input-reader] Sheet "${sheetName}" not found in input.xlsx`);
    return [];
  }
  return XLSX.utils.sheet_to_json<T>(ws, { defval: '' });
}

function bool(val: string | boolean): boolean {
  if (typeof val === 'boolean') return val;
  return String(val).toLowerCase().trim() !== 'false' && String(val).trim() !== '0';
}

// ── Read and parse all sheets ─────────────────────────────────────────────────
function loadInputs() {
  let wb: ReturnType<typeof XLSX.readFile>;
  try {
    wb = XLSX.readFile(INPUT_FILE);
  } catch {
    throw new Error(
      `[input-reader] Cannot read ${INPUT_FILE}\n` +
      `  Run: node scripts/create-input-excel.js  to regenerate it.`
    );
  }

  // ── Config ──────────────────────────────────────────────────────────────────
  const configRows = readSheet<{ Key: string; Value: string }>(wb, 'Config');
  const cfg: Record<string, string> = {};
  for (const row of configRows) cfg[row.Key] = row.Value;

  const config = {
    BASE_URL    : cfg['BASE_URL']          || 'http://localhost:8085',
    STEP_PAUSE  : parseInt(cfg['STEP_PAUSE_MS']     || '3000',  10),
    ACTION_PAUSE: parseInt(cfg['ACTION_PAUSE_MS']   || '1500',  10),
    TIMEOUT     : parseInt(cfg['TEST_TIMEOUT_MS']   || '90000', 10),
    AGENTS_TIMEOUT: parseInt(cfg['AGENTS_TIMEOUT_MS'] || '120000', 10),
  };

  // ── Agents ──────────────────────────────────────────────────────────────────
  const agentRows = readSheet<{
    'Agent Name': string;
    'Verify': string;
    'Full Integrate': string;
  }>(wb, 'Agents');

  const agents = agentRows
    .filter(r => bool(r['Verify']))
    .map(r => ({
      name         : r['Agent Name'],
      fullIntegrate: bool(r['Full Integrate']),
    }));

  // ── Recipes ─────────────────────────────────────────────────────────────────
  const recipeRows = readSheet<{
    'Recipe Name': string;
    'Description': string;
  }>(wb, 'Recipes');

  const recipes = recipeRows.map(r => ({
    name       : r['Recipe Name'],
    description: r['Description'],
  }));

  // ── Prompts ─────────────────────────────────────────────────────────────────
  const promptRows = readSheet<{
    'Prompt Name': string;
    'Verify': string;
    'Open Edit': string;
  }>(wb, 'Prompts');

  const prompts = promptRows
    .filter(r => bool(r['Verify']))
    .map(r => ({
      name    : r['Prompt Name'],
      openEdit: bool(r['Open Edit']),
    }));

  // ── Providers ────────────────────────────────────────────────────────────────
  const providerRows = readSheet<{
    'Provider Name': string;
    'Test Connection': string;
  }>(wb, 'Providers');

  const providers = providerRows.map(r => ({
    name           : r['Provider Name'],
    testConnection : bool(r['Test Connection']),
  }));

  // ── Tools ────────────────────────────────────────────────────────────────────
  const toolRows = readSheet<{
    'Tool Name': string;
    'Transport': string;
    'Endpoint': string;
  }>(wb, 'Tools');

  const tools = toolRows.map(r => ({
    name     : r['Tool Name'],
    transport: r['Transport'],
    endpoint : r['Endpoint'],
  }));

  // ── RAG Pipelines ────────────────────────────────────────────────────────────
  const ragRows = readSheet<{
    'Ingest Content': string;
    'Strategy': string;
    'Expected Success Message': string;
  }>(wb, 'RAG_Pipelines');

  const rag = ragRows.map(r => ({
    content       : r['Ingest Content'],
    strategy      : r['Strategy'],
    successMessage: r['Expected Success Message'],
  }));

  return { config, agents, recipes, prompts, providers, tools, rag };
}

// ── Singleton — loaded once at import time ────────────────────────────────────
export const INPUTS = loadInputs();

// ── Convenience re-exports ────────────────────────────────────────────────────
export const BASE          = INPUTS.config.BASE_URL;
export const STEP_PAUSE    = INPUTS.config.STEP_PAUSE;
export const ACTION_PAUSE  = INPUTS.config.ACTION_PAUSE;
export const TIMEOUT       = INPUTS.config.TIMEOUT;
export const AGENTS_TIMEOUT= INPUTS.config.AGENTS_TIMEOUT;
