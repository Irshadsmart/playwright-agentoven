/**
 * scripts/record-demo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fully automated AgentOven demo video recorder.
 *
 * What it does (zero manual steps):
 *   1. Installs/locates ffmpeg (uses bundled ffmpeg-static npm package)
 *   2. Generates TTS narration audio for every section via Windows Speech
 *   3. Starts full-screen recording with ffmpeg gdigrab
 *   4. Opens Chrome (headed) and walks through every AgentOven section
 *   5. Stops recording, builds a time-synced narration audio track
 *   6. Merges video + audio → final MP4
 *   7. Saves to reports/AgentOven_Demo_Video.mp4
 *
 * Usage:  node scripts/record-demo.js
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const { spawn, spawnSync } = require('child_process');
const { chromium }         = require('@playwright/test');
const path                 = require('path');
const fs                   = require('fs');

// ── Paths ─────────────────────────────────────────────────────────────────────
const ROOT_DIR    = path.join(__dirname, '..');
const REPORTS_DIR = path.join(ROOT_DIR, 'reports');
const TEMP_DIR    = path.join(REPORTS_DIR, '_demo_temp');
const TEMP_VIDEO  = path.join(TEMP_DIR, 'screen.mp4');
const FINAL_VIDEO = path.join(REPORTS_DIR, 'AgentOven_Demo_Video.mp4');

// ── Timing (ms) ───────────────────────────────────────────────────────────────
const BASE         = 'http://localhost:8085';
const NAV_PAUSE    = 5000;   // show page before narration begins
const AFTER_PAUSE  = 3000;   // pause after narration before moving on
const ACTION_PAUSE = 1500;   // between in-page interactions

// ── Section definitions ───────────────────────────────────────────────────────
const SECTIONS = [
  {
    id: 'overview', label: 'Overview Dashboard', url: '/overview',
    narration: 'Welcome to AgentOven. This is the main Overview dashboard showing all key metrics at a glance including Agents, Recipes, Providers, MCP Tools and Traces.',
  },
  {
    id: 'agents', label: 'Agents', url: '/agents',
    narration: 'Here is the Agents section. Each agent card shows the agent name, model, and description. We can integrate agents, and perform actions like Cool and Rewarm to manage agent state.',
  },
  {
    id: 'recipes', label: 'Recipes — Create', url: '/recipes',
    narration: 'This is the Recipes section. We are now creating a new recipe called Demo Recipe. Recipes define the workflow that agents follow to complete tasks.',
  },
  {
    id: 'run_recipe', label: 'Recipes — Run', url: '/recipes',
    narration: 'We are now running the recipe. The recipe engine processes the workflow and returns the result.',
  },
  {
    id: 'dishshelf', label: 'DishShelf', url: '/dishshelf',
    narration: 'DishShelf stores all the outputs and results produced by recipe runs. Each dish represents a completed task output.',
  },
  {
    id: 'prompts', label: 'Prompts', url: '/prompts',
    narration: 'The Prompts section manages all prompt templates used by agents and recipes within AgentOven.',
  },
  {
    id: 'providers', label: 'Providers', url: '/providers',
    narration: 'Providers shows all configured AI provider integrations such as OpenAI. Each provider connection is listed with its current status.',
  },
  {
    id: 'catalog', label: 'Model Catalog', url: '/catalog',
    narration: 'The Model Catalog lists all available AI models registered in AgentOven. Models can be selected and assigned to agents and recipes.',
  },
  {
    id: 'tools', label: 'MCP Tools', url: '/tools',
    narration: 'The Tools section shows all registered tools available to agents. Tools extend what agents can do such as web search, file access, and API calls.',
  },
  {
    id: 'traces', label: 'Traces', url: '/traces',
    narration: 'Traces captures the full execution history of every agent and recipe run. This provides a complete audit trail for review and debugging.',
  },
  {
    id: 'embeddings', label: 'Embeddings', url: '/embeddings',
    narration: 'The Embeddings section manages vector embedding configurations used for semantic understanding within AgentOven.',
  },
  {
    id: 'vectorstores', label: 'Vector Stores', url: '/vectorstores',
    narration: 'Vector Stores shows all configured vector databases. These enable fast semantic search and retrieval across large document collections.',
  },
  {
    id: 'rag', label: 'RAG Pipelines — Ingest', url: '/rag',
    narration: 'This is the RAG Pipeline Ingest section. We are typing a document into the content box and clicking Ingest Document. The system processes and indexes the document. You can see the green confirmation showing Ingested 1 document, 1 chunk, and 1 vector successfully stored.',
  },
  {
    id: 'connectors', label: 'Connectors', url: '/connectors',
    narration: 'Finally, the Connectors section shows all external service integrations. Connectors allow AgentOven to communicate with third-party tools and data sources seamlessly.',
  },
  {
    id: 'closing', label: 'Closing', url: null,
    narration: 'This completes the full walkthrough of AgentOven. The platform provides a complete end-to-end solution for building and managing intelligent AI agents, recipes, and data pipelines.',
  },
];

// ── ffmpeg paths ──────────────────────────────────────────────────────────────
function getFFmpegPaths() {
  // 1. Try system PATH first
  const sysCheck = spawnSync('ffmpeg', ['-version'], { encoding: 'utf8', shell: true });
  if (sysCheck.status === 0) {
    const ffmpegSys = spawnSync('where', ['ffmpeg'], { encoding: 'utf8', shell: true });
    const ffprobeSys = spawnSync('where', ['ffprobe'], { encoding: 'utf8', shell: true });
    if (ffmpegSys.status === 0) {
      return {
        ffmpeg : ffmpegSys.stdout.trim().split('\n')[0].trim(),
        ffprobe: ffprobeSys.stdout.trim().split('\n')[0].trim() || 'ffprobe',
      };
    }
  }
  // 2. Use bundled npm packages (already installed)
  const ffmpegStatic  = require('ffmpeg-static');
  const ffprobeStatic = require('ffprobe-static');
  return { ffmpeg: ffmpegStatic, ffprobe: ffprobeStatic.path };
}

// ── TTS audio generation (Windows Speech API via PowerShell) ──────────────────
function generateTTS(text, wavPath) {
  const txtFile = wavPath + '.txt';
  fs.writeFileSync(txtFile, text, 'utf8');

  const absWav = wavPath.replace(/\\/g, '\\\\');
  const absTxt = txtFile.replace(/\\/g, '\\\\');

  const ps = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Rate   = -2
$synth.Volume = 100
$synth.SetOutputToWaveFile("${absWav}")
$t = [System.IO.File]::ReadAllText("${absTxt}", [System.Text.Encoding]::UTF8)
$synth.Speak($t.Trim())
$synth.Dispose()
`;
  const r = spawnSync('powershell', ['-NoProfile', '-Command', ps],
    { encoding: 'utf8', timeout: 60000 });

  try { fs.unlinkSync(txtFile); } catch {}

  if (r.status !== 0 || !fs.existsSync(wavPath)) {
    throw new Error(`TTS failed for "${text.slice(0, 40)}...": ${r.stderr?.slice(0, 200)}`);
  }
}

// ── Media duration (works for WAV and MP4) ────────────────────────────────────
function getDurationMs(filePath, ffprobePath) {
  const r = spawnSync(ffprobePath, [
    '-v', 'quiet', '-show_entries', 'format=duration',
    '-of', 'default=noprint_wrappers=1:nokey=1', filePath,
  ], { encoding: 'utf8' });
  const d = parseFloat(r.stdout.trim());
  if (isNaN(d)) throw new Error(`Cannot measure duration of: ${filePath}`);
  return Math.round(d * 1000);
}

// ── Screen recording ──────────────────────────────────────────────────────────
function startRecording(outputPath, ffmpegPath) {
  const proc = spawn(ffmpegPath, [
    '-y', '-f', 'gdigrab', '-framerate', '30', '-i', 'desktop',
    '-c:v', 'libx264', '-preset', 'ultrafast', '-pix_fmt', 'yuv420p',
    outputPath,
  ], { stdio: ['pipe', 'ignore', 'ignore'] });

  proc.on('error', err => console.error('[ffmpeg error]', err.message));
  return proc;
}

function stopRecording(proc) {
  return new Promise(resolve => {
    if (!proc || proc.exitCode !== null) { resolve(); return; }
    proc.on('close', resolve);
    try { proc.stdin.write('q'); proc.stdin.end(); } catch {}
    setTimeout(() => { try { proc.kill(); } catch {} resolve(); }, 20000);
  });
}

// ── Browser step banner ───────────────────────────────────────────────────────
async function banner(page, label) {
  await page.evaluate(label => {
    let el = document.getElementById('__demo__');
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo__';
      Object.assign(el.style, {
        position: 'fixed', bottom: '0', left: '0', right: '0', zIndex: '999999',
        background: 'rgba(10,14,26,0.93)', color: '#f1f5f9',
        fontFamily: '-apple-system,sans-serif', fontSize: '14px',
        padding: '10px 20px', display: 'flex', alignItems: 'center', gap: '14px',
        borderTop: '2px solid #ff6b35', pointerEvents: 'none',
      });
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <span style="background:#ff6b35;color:#fff;border-radius:4px;padding:2px 10px;
                   font-weight:700;font-size:12px;white-space:nowrap">AgentOven Demo</span>
      <strong style="color:#e2e8f0;">${label}</strong>`;
  }, label);
}

// ── Section-specific Playwright interactions ──────────────────────────────────
async function runSection(page, id) {
  const modal = page.locator('div.fixed.inset-0');

  if (id === 'agents') {
    const count = await page.getByRole('button', { name: 'Integrate' }).count();
    for (let i = 0; i < count; i++) {
      await page.getByRole('button', { name: 'Integrate' }).nth(i).click();
      await page.waitForTimeout(ACTION_PAUSE);
      try {
        await modal.getByRole('button', { name: 'Invoke' }).click();
        await page.waitForTimeout(1500);
      } catch {}
      await page.keyboard.press('Escape');
      await page.waitForTimeout(ACTION_PAUSE);
    }
    // Cool → Rewarm on first agent
    try {
      await page.getByRole('button', { name: 'Cool' }).first().click();
      await page.waitForTimeout(ACTION_PAUSE);
      await page.getByRole('button', { name: 'Rewarm' }).first().click();
      await page.waitForTimeout(ACTION_PAUSE);
    } catch {}
  }

  else if (id === 'recipes') {
    try {
      await page.getByRole('button', { name: 'Create Recipe' }).click();
      await page.waitForTimeout(ACTION_PAUSE);
      await page.getByRole('textbox', { name: 'my-workflow' }).fill('Demo Recipe');
      await page.waitForTimeout(600);
      await page.getByRole('textbox', { name: 'A workflow that...' })
        .fill('Demo Recipe for AgentOven walkthrough');
      await page.waitForTimeout(600);
      await page.getByRole('button', { name: 'Create', exact: true }).click();
      await page.waitForTimeout(2000);
    } catch (e) { console.log(`    ⚠  recipes: ${e.message.slice(0, 80)}`); }
  }

  else if (id === 'run_recipe') {
    try {
      await page.getByRole('button', { name: 'Run' }).first().click();
      await page.waitForTimeout(5000);
    } catch (e) { console.log(`    ⚠  run_recipe: ${e.message.slice(0, 80)}`); }
  }

  else if (id === 'rag') {
    try {
      await page.getByRole('button', { name: 'ingest' }).click();
      await page.waitForTimeout(ACTION_PAUSE);
      await page.getByRole('textbox', {
        name: 'Paste text content to ingest into the vector store...',
      }).fill('AgentOven is an AI-powered platform that enables intelligent automation through agents, recipes, and retrieval augmented generation pipelines.');
      await page.waitForTimeout(ACTION_PAUSE);
      await page.getByRole('button', { name: 'Ingest Document' }).click();
      await page.locator('div.text-green-400').waitFor({ timeout: 15000 }).catch(() => {});
      await page.waitForTimeout(2000);
    } catch (e) { console.log(`    ⚠  rag: ${e.message.slice(0, 80)}`); }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  const hr = '─'.repeat(60);
  console.log(`\n🎬  AgentOven Demo Video Recorder\n${hr}`);

  // ── Setup dirs ───────────────────────────────────────────────────────────────
  [TEMP_DIR, REPORTS_DIR].forEach(d => { if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true }); });

  // ── Install system ffmpeg via winget (best-effort, non-blocking) ─────────────
  {
    const check = spawnSync('where', ['ffmpeg'], { encoding: 'utf8', shell: true });
    if (check.status !== 0) {
      console.log('📦  System ffmpeg not found — attempting winget install (background)...');
      spawn('winget', ['install', 'Gyan.FFmpeg', '--accept-package-agreements',
        '--accept-source-agreements', '--silent'],
        { stdio: 'ignore', detached: true }).unref();
      console.log('    (winget running in background — using bundled ffmpeg-static for this run)\n');
    }
  }

  // ── Locate ffmpeg ─────────────────────────────────────────────────────────────
  const { ffmpeg: FFMPEG, ffprobe: FFPROBE } = getFFmpegPaths();
  console.log(`✅  ffmpeg  : ${FFMPEG}`);
  console.log(`✅  ffprobe : ${FFPROBE}\n`);

  // ── Phase 1: Generate all TTS narration WAV files ────────────────────────────
  console.log(`🔊  Generating TTS narration for ${SECTIONS.length} sections...\n`);

  const sections = SECTIONS.map(s => ({
    ...s,
    wavPath: path.join(TEMP_DIR, `narr_${s.id}.wav`),
    durationMs: 0,
    audioOffsetMs: 0,   // filled during Playwright run
  }));

  for (const s of sections) {
    process.stdout.write(`  [TTS] ${s.label.padEnd(30, '.')} `);
    generateTTS(s.narration, s.wavPath);
    s.durationMs = getDurationMs(s.wavPath, FFPROBE);
    console.log(`${(s.durationMs / 1000).toFixed(1)} s`);
  }

  console.log('\n  All narration audio generated.\n');

  // ── Phase 2: Open Chrome FIRST so AgentOven fills the screen before recording ──
  console.log('🌐  Launching Chrome and navigating to AgentOven...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 700,
    args: ['--start-maximized'],
  });
  const context = await browser.newContext({ viewport: null });
  const page    = await context.newPage();

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });

  // Wait for Chrome to be maximised and fully covering the screen.
  // This ensures VS Code (or any other window) is hidden before recording begins.
  await page.waitForTimeout(3000);

  // ── Phase 3: Start recording — Chrome is already on-screen ───────────────────
  console.log('🎥  Starting full-screen recording (AgentOven is now on screen)...');
  const ffmpegProc     = startRecording(TEMP_VIDEO, FFMPEG);
  const recordingStart = Date.now();
  await new Promise(r => setTimeout(r, 2500)); // warm-up — first frames capture AgentOven home
  console.log('  Recording started.\n');

  // ── Phase 4: Playwright walkthrough ──────────────────────────────────────────
  console.log('🚀  Running AgentOven walkthrough...\n');

  // 3-second intro buffer on home page (already loaded)
  await page.waitForTimeout(3000);

  for (const s of sections) {
    console.log(`  ▶  ${s.label}`);

    // Navigate
    if (s.url) {
      await page.goto(`${BASE}${s.url}`, { waitUntil: 'networkidle' });
    }
    await banner(page, s.label);

    // Section-specific interactions
    await runSection(page, s.id);

    // Show page for NAV_PAUSE seconds before narration
    await page.waitForTimeout(NAV_PAUSE);

    // ── Mark the exact narration start offset in the video timeline ────────────
    s.audioOffsetMs = Date.now() - recordingStart;
    console.log(`      📢  narration at ${(s.audioOffsetMs / 1000).toFixed(1)} s`);

    // Wait for narration audio duration (screen stays on AgentOven during narration)
    await page.waitForTimeout(s.durationMs);

    // Post-narration pause
    await page.waitForTimeout(AFTER_PAUSE);
  }

  // 5-second outro — stay on last AgentOven page (Connectors)
  await page.waitForTimeout(5000);

  // ── Phase 5: Stop recording BEFORE closing Chrome ────────────────────────────
  // This ensures the video ends on AgentOven UI, not on VS Code or the desktop.
  console.log('\n⏹  Stopping screen recording (AgentOven still on screen)...');
  await stopRecording(ffmpegProc);
  await new Promise(r => setTimeout(r, 4000)); // let ffmpeg finalise the file

  // Now safe to close Chrome
  await browser.close();

  if (!fs.existsSync(TEMP_VIDEO)) {
    throw new Error('Screen recording not found — ffmpeg may have failed to capture the screen.');
  }
  const videoMB = (fs.statSync(TEMP_VIDEO).size / 1024 / 1024).toFixed(1);
  const videoDurationMs = getDurationMs(TEMP_VIDEO, FFPROBE);
  console.log(`  ✅  Video: ${videoMB} MB  (${(videoDurationMs / 1000).toFixed(0)} s)\n`);

  // ── Phase 5: Build time-synced narration audio track ─────────────────────────
  console.log('🎵  Building narration audio track...');

  // Create a silent base track matching the video duration
  const silenceWav = path.join(TEMP_DIR, 'silence.wav');
  spawnSync(FFMPEG, [
    '-y', '-f', 'lavfi',
    '-i', `anullsrc=r=44100:cl=stereo`,
    '-t', String(videoDurationMs / 1000 + 5),
    '-c:a', 'pcm_s16le',
    silenceWav,
  ], { stdio: 'inherit' });

  // Build adelay filter: place each narration at its recorded offset
  const inputs       = ['-i', silenceWav];
  const filterParts  = [];
  const outputLabels = ['[0:a]'];

  sections.forEach((s, i) => {
    inputs.push('-i', s.wavPath);
    const idx   = i + 1;
    const delay = s.audioOffsetMs;
    filterParts.push(`[${idx}:a]aresample=44100,adelay=${delay}|${delay}[d${idx}]`);
    outputLabels.push(`[d${idx}]`);
  });

  const mixCount      = outputLabels.length;
  const filterComplex = [
    ...filterParts,
    `${outputLabels.join('')}amix=inputs=${mixCount}:duration=first:normalize=0[aout]`,
  ].join(';');

  const narrationTrack = path.join(TEMP_DIR, 'narration.wav');
  const audioResult = spawnSync(FFMPEG, [
    '-y', ...inputs,
    '-filter_complex', filterComplex,
    '-map', '[aout]',
    '-c:a', 'pcm_s16le',
    narrationTrack,
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });

  if (!fs.existsSync(narrationTrack)) {
    throw new Error(`Audio track build failed:\n${audioResult.stderr?.slice(0, 500)}`);
  }
  console.log('  ✅  Narration track built.\n');

  // ── Phase 6: Merge video + audio ──────────────────────────────────────────────
  console.log('🎞  Merging video + narration audio...');

  const mergeResult = spawnSync(FFMPEG, [
    '-y',
    '-i', TEMP_VIDEO,
    '-i', narrationTrack,
    '-c:v', 'copy',
    '-c:a', 'aac', '-b:a', '192k',
    '-shortest',
    FINAL_VIDEO,
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });

  if (!fs.existsSync(FINAL_VIDEO)) {
    throw new Error(`Video merge failed:\n${mergeResult.stderr?.slice(0, 500)}`);
  }

  // ── Phase 7: Cleanup temp files ───────────────────────────────────────────────
  console.log('🧹  Cleaning up temp files...');
  try { fs.rmSync(TEMP_DIR, { recursive: true, force: true }); } catch {}

  // ── Done ──────────────────────────────────────────────────────────────────────
  const finalMB  = (fs.statSync(FINAL_VIDEO).size / 1024 / 1024).toFixed(1);
  const finalDur = getDurationMs(FINAL_VIDEO, FFPROBE);

  console.log(`\n${hr}`);
  console.log(`✅  Demo video saved successfully!`);
  console.log(`\n   📁  Full path : ${FINAL_VIDEO}`);
  console.log(`   📦  File size : ${finalMB} MB`);
  console.log(`   ⏱  Duration  : ${(finalDur / 1000).toFixed(0)} seconds`);
  console.log(`${hr}\n`);
}

main().catch(err => {
  console.error('\n❌  record-demo failed:', err.message);
  process.exit(1);
});
