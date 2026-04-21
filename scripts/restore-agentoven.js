/**
 * scripts/restore-agentoven.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Restores AgentOven to an exact previous state from a backup folder.
 *
 * What is restored:
 *   • data.json  — agents, tools, prompts, providers, recipes, settings
 *   • PostgreSQL — all tables including ao_vectors (RAG document vectors)
 *
 * Usage:
 *   node scripts/restore-agentoven.js backup/agentoven_DD-MM-YYYY_HH.MM
 *   npm run restore-app backup/agentoven_DD-MM-YYYY_HH.MM
 *
 * ⚠  Requirements:
 *   • AgentOven Docker containers must be running:
 *     docker compose up -d   (from the AgentOven directory)
 *   • AgentOven must be stopped AFTER restore (server restarts automatically)
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { spawnSync } = require('child_process');
const path          = require('path');
const fs            = require('fs');

// ── Docker container names ─────────────────────────────────────────────────────
const SERVER_CONTAINER   = 'agentoven-server-1';
const POSTGRES_CONTAINER = 'agentoven-postgres-1';
const PG_USER            = 'agentoven';
const PG_DB              = 'agentoven';

const hr = '─'.repeat(60);

function run(cmd, args, opts = {}) {
  const r = spawnSync(cmd, args, { encoding: 'utf8', shell: true, ...opts });
  if (r.status !== 0) {
    const err = (r.stderr || r.stdout || '').trim().slice(0, 600);
    throw new Error(`Command failed (exit ${r.status}): ${cmd} ${args.join(' ')}\n${err}`);
  }
  return r.stdout.trim();
}

async function main() {
  // ── Resolve backup folder from CLI arg ──────────────────────────────────────
  const backupArg = process.argv[2];
  if (!backupArg) {
    console.error('\nUsage: node scripts/restore-agentoven.js backup/agentoven_DD-MM-YYYY_HH.MM');
    console.error('\nAvailable backups:');
    const backupRoot = path.join(__dirname, '..', 'backup');
    if (fs.existsSync(backupRoot)) {
      fs.readdirSync(backupRoot)
        .filter(d => d.startsWith('agentoven_'))
        .sort()
        .reverse()
        .forEach(d => console.error(`  ${d}`));
    } else {
      console.error('  (no backups found — run: npm run backup-app)');
    }
    process.exit(1);
  }

  const BACKUP_DIR = path.isAbsolute(backupArg)
    ? backupArg
    : path.join(__dirname, '..', backupArg);

  const DATA_JSON = path.join(BACKUP_DIR, 'data.json');
  const SQL_FILE  = path.join(BACKUP_DIR, 'agentoven_db.sql');

  // ── Validate backup folder ───────────────────────────────────────────────────
  if (!fs.existsSync(BACKUP_DIR)) {
    throw new Error(`Backup folder not found: ${BACKUP_DIR}`);
  }
  if (!fs.existsSync(DATA_JSON)) {
    throw new Error(`data.json not found in backup: ${DATA_JSON}`);
  }
  if (!fs.existsSync(SQL_FILE)) {
    throw new Error(`agentoven_db.sql not found in backup: ${SQL_FILE}`);
  }

  console.log(`\n♻️   AgentOven Restore\n${hr}`);
  console.log(`   Source: ${BACKUP_DIR}\n`);

  // ── Check containers are running ─────────────────────────────────────────────
  const running = run('docker', ['ps', '--format', '{{.Names}}']);
  if (!running.includes(SERVER_CONTAINER)) {
    throw new Error(
      `Container ${SERVER_CONTAINER} is not running.\n` +
      `Start AgentOven first:  docker compose up -d   (from the AgentOven directory)`
    );
  }
  if (!running.includes(POSTGRES_CONTAINER)) {
    throw new Error(
      `Container ${POSTGRES_CONTAINER} is not running.\n` +
      `Start AgentOven first:  docker compose up -d   (from the AgentOven directory)`
    );
  }

  // Preview what will be restored
  const dataJson = JSON.parse(fs.readFileSync(DATA_JSON, 'utf8'));
  const counts = {
    agents   : Object.keys(dataJson.agents    || {}).length,
    tools    : Object.keys(dataJson.tools     || {}).length,
    prompts  : Object.keys(dataJson.prompts   || {}).length,
    providers: Object.keys(dataJson.providers || {}).length,
    recipes  : Object.keys(dataJson.recipes   || {}).length,
  };

  console.log('   This restore will replace all current AgentOven data with:');
  console.log(`     • ${counts.agents} agent(s)`);
  console.log(`     • ${counts.tools} tool(s)`);
  console.log(`     • ${counts.prompts} prompt(s)`);
  console.log(`     • ${counts.providers} provider(s)`);
  console.log(`     • ${counts.recipes} recipe(s)`);
  console.log(`     • PostgreSQL tables (agents, recipes, ao_vectors/RAG, traces, etc.)`);
  console.log('\n   ⚠️   Current data will be OVERWRITTEN.\n');

  // ── Step 1: Restore data.json ─────────────────────────────────────────────────
  process.stdout.write('  [1/3] Restoring data.json (agents, tools, prompts, providers)... ');
  run('docker', ['cp', DATA_JSON, `${SERVER_CONTAINER}:/home/agentoven/.agentoven/data.json`]);
  console.log('✅');

  // ── Step 2: Restore PostgreSQL ────────────────────────────────────────────────
  process.stdout.write('  [2/3] Restoring PostgreSQL (dropping and recreating tables)...   ');

  // Drop and recreate the database to get a clean slate
  run('docker', [
    'exec', POSTGRES_CONTAINER,
    'psql', '-U', PG_USER, '-d', 'postgres',
    '-c', `DROP DATABASE IF EXISTS ${PG_DB};`,
  ]);
  run('docker', [
    'exec', POSTGRES_CONTAINER,
    'psql', '-U', PG_USER, '-d', 'postgres',
    '-c', `CREATE DATABASE ${PG_DB} OWNER ${PG_USER};`,
  ]);

  // Restore from the SQL dump
  const sqlContent = fs.readFileSync(SQL_FILE, 'utf8');
  const restoreResult = spawnSync('docker', [
    'exec', '-i', POSTGRES_CONTAINER,
    'psql', '-U', PG_USER, '-d', PG_DB,
  ], {
    input: sqlContent,
    encoding: 'utf8',
    shell: true,
    maxBuffer: 64 * 1024 * 1024,
  });

  if (restoreResult.status !== 0) {
    const errMsg = (restoreResult.stderr || '').trim();
    // psql exits non-zero on warnings but still succeeds — only fail on real errors
    if (errMsg.toLowerCase().includes('error') && !errMsg.toLowerCase().includes('warning')) {
      throw new Error(`PostgreSQL restore failed:\n${errMsg.slice(0, 600)}`);
    }
  }
  console.log('✅');

  // ── Step 3: Restart AgentOven server so it reloads data.json ─────────────────
  process.stdout.write('  [3/3] Restarting AgentOven server to load restored data...       ');
  run('docker', ['restart', SERVER_CONTAINER]);

  // Wait for it to be healthy
  let healthy = false;
  for (let i = 0; i < 20; i++) {
    const status = run('docker', [
      'inspect', SERVER_CONTAINER,
      '--format', '{{.State.Health.Status}}',
    ]);
    if (status === 'healthy') { healthy = true; break; }
    await new Promise(r => setTimeout(r, 2000));
  }

  if (!healthy) {
    console.log('⚠️  (still starting — check with: docker ps)');
  } else {
    console.log('✅');
  }

  // ── Done ──────────────────────────────────────────────────────────────────────
  console.log(`\n${hr}`);
  console.log(`✅  Restore complete!`);
  console.log(`\n   AgentOven is ready at: http://localhost:8085`);
  console.log(`\n   Restored:`);
  console.log(`     • ${counts.agents} agent(s)  •  ${counts.tools} tool(s)  •  ${counts.prompts} prompt(s)`);
  console.log(`     • ${counts.providers} provider(s)  •  ${counts.recipes} recipe(s)  •  RAG vectors`);
  console.log(`${hr}\n`);
}

main().catch(err => {
  console.error(`\n❌  Restore failed: ${err.message}`);
  process.exit(1);
});
