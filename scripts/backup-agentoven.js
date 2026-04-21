/**
 * scripts/backup-agentoven.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Creates a complete snapshot of AgentOven's live data:
 *   1. data.json  — agents, tools, prompts, providers, recipes, settings
 *   2. agentoven_db.sql — full PostgreSQL dump (includes RAG vectors)
 *
 * Backup is saved to:
 *   backup/agentoven_DD-MM-YYYY_HH.MM/
 *
 * Usage:  node scripts/backup-agentoven.js
 *     or: npm run backup-app
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { spawnSync } = require('child_process');
const path          = require('path');
const fs            = require('fs');

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT       = path.join(__dirname, '..');
const BACKUP_ROOT = path.join(ROOT, 'backup');

// ── Timestamp ─────────────────────────────────────────────────────────────────
const now   = new Date();
const pad   = n => String(n).padStart(2, '0');
const stamp = `${pad(now.getDate())}-${pad(now.getMonth()+1)}-${now.getFullYear()}_${pad(now.getHours())}.${pad(now.getMinutes())}`;
const DEST  = path.join(BACKUP_ROOT, `agentoven_${stamp}`);

// ── Docker container names (match docker-compose.yml) ─────────────────────────
const SERVER_CONTAINER   = 'agentoven-server-1';
const POSTGRES_CONTAINER = 'agentoven-postgres-1';
const PG_USER            = 'agentoven';
const PG_DB              = 'agentoven';

const hr = '─'.repeat(60);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: true, ...opts });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim().slice(0, 400);
    throw new Error(`Command failed (exit ${r.status}): ${cmd} ${args.join(' ')}\n${err}`);
  }
  return r.stdout.trim();
}

async function main() {
  console.log(`\n🔒  AgentOven Backup\n${hr}`);

  // ── Check Docker is running ──────────────────────────────────────────────────
  try {
    run('docker', ['ps', '--filter', `name=${SERVER_CONTAINER}`, '--format', '{{.Names}}']);
  } catch {
    throw new Error('Docker is not running or the AgentOven containers are not up.\nRun: docker compose up -d   (from the AgentOven directory)');
  }

  // Check both containers are running
  const running = run('docker', ['ps', '--format', '{{.Names}}']);
  if (!running.includes(SERVER_CONTAINER)) {
    throw new Error(`Container ${SERVER_CONTAINER} is not running. Start AgentOven first.`);
  }
  if (!running.includes(POSTGRES_CONTAINER)) {
    throw new Error(`Container ${POSTGRES_CONTAINER} is not running. Start AgentOven first.`);
  }

  // ── Create backup directory ──────────────────────────────────────────────────
  fs.mkdirSync(DEST, { recursive: true });
  console.log(`\n📁  Saving to: ${DEST}\n`);

  // ── 1. Back up data.json (agents, tools, prompts, providers, recipes) ────────
  process.stdout.write('  [1/2] Backing up data.json (agents, tools, prompts, providers)... ');
  const dataJsonDest = path.join(DEST, 'data.json');

  run('docker', ['cp', `${SERVER_CONTAINER}:/home/agentoven/.agentoven/data.json`, dataJsonDest]);

  // Count records for the summary
  const dataJson = JSON.parse(fs.readFileSync(dataJsonDest, 'utf8'));
  const counts = {
    agents   : Object.keys(dataJson.agents    || {}).length,
    tools    : Object.keys(dataJson.tools     || {}).length,
    prompts  : Object.keys(dataJson.prompts   || {}).length,
    providers: Object.keys(dataJson.providers || {}).length,
    recipes  : Object.keys(dataJson.recipes   || {}).length,
  };
  const sizekB = (fs.statSync(dataJsonDest).size / 1024).toFixed(1);
  console.log(`✅  (${sizekB} kB)`);
  console.log(`        agents: ${counts.agents}  tools: ${counts.tools}  prompts: ${counts.prompts}  providers: ${counts.providers}  recipes: ${counts.recipes}`);

  // ── 2. Back up PostgreSQL (includes ao_vectors / RAG data) ───────────────────
  process.stdout.write('  [2/2] Backing up PostgreSQL database (includes RAG vectors)...  ');
  const sqlDest = path.join(DEST, 'agentoven_db.sql');

  // pg_dump inside the container, pipe output to local file
  const pgDump = spawnSync('docker', [
    'exec', POSTGRES_CONTAINER,
    'pg_dump', '-U', PG_USER, '--no-password', '-d', PG_DB,
    '--format=plain', '--no-owner', '--no-acl',
  ], { encoding: 'utf8', shell: true, maxBuffer: 64 * 1024 * 1024 });

  if (pgDump.status !== 0 || !pgDump.stdout.trim()) {
    throw new Error(`pg_dump failed:\n${pgDump.stderr?.slice(0, 400)}`);
  }
  fs.writeFileSync(sqlDest, pgDump.stdout, 'utf8');
  const sqlkB = (fs.statSync(sqlDest).size / 1024).toFixed(1);
  console.log(`✅  (${sqlkB} kB)`);

  // ── 3. Write a README inside the backup folder ────────────────────────────────
  const manifest = [
    `AgentOven Backup`,
    `Created   : ${now.toLocaleString()}`,
    ``,
    `Contents:`,
    `  data.json         — agents (${counts.agents}), tools (${counts.tools}), prompts (${counts.prompts}), providers (${counts.providers}), recipes (${counts.recipes})`,
    `  agentoven_db.sql  — full PostgreSQL dump including RAG vectors (ao_vectors)`,
    ``,
    `To restore:`,
    `  node scripts/restore-agentoven.js backup/agentoven_${stamp}`,
    `  -- or --`,
    `  npm run restore-app backup/agentoven_${stamp}`,
    ``,
    `Ensure AgentOven containers are running before restoring:`,
    `  docker compose up -d   (from the AgentOven application directory)`,
  ].join('\n');

  fs.writeFileSync(path.join(DEST, 'BACKUP_INFO.txt'), manifest, 'utf8');

  // ── Done ──────────────────────────────────────────────────────────────────────
  console.log(`\n${hr}`);
  console.log(`✅  Backup complete!`);
  console.log(`\n   📁  Folder : ${DEST}`);
  console.log(`   📄  Files  : data.json  |  agentoven_db.sql  |  BACKUP_INFO.txt`);
  console.log(`\n   To restore this backup:`);
  console.log(`   node scripts/restore-agentoven.js backup/agentoven_${stamp}`);
  console.log(`${hr}\n`);
}

main().catch(err => {
  console.error(`\n❌  Backup failed: ${err.message}`);
  process.exit(1);
});
