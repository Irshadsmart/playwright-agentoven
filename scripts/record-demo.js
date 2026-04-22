/**
 * scripts/record-demo.js
 * ─────────────────────────────────────────────────────────────────────────────
 * Fully automated AgentOven demo video recorder.
 *
 * What it does (zero manual steps):
 *   1. Installs/locates ffmpeg (uses bundled ffmpeg-static npm package)
 *   2. Generates TTS narration audio for every section via Windows Speech
 *   3. Opens Chrome with Playwright recordVideo (captures browser page ONLY)
 *   4. Walks through every AgentOven section interactively
 *   5. Closes context → finalises .webm → converts to mp4
 *   6. Builds a time-synced narration audio track with ffmpeg adelay/amix
 *   7. Merges video + audio → final MP4
 *   8. Saves to reports/AgentOven_Demo_Video.mp4
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
    id: 'agent_test_quality', label: 'Agent Test: quality-reviewer', url: '/agents/quality-reviewer/test',
    narration: 'Here we are testing the quality-reviewer agent in Simple mode. We paste a technical paragraph with grammar errors and click Send. The agent reviews the text and returns a corrected version with improvement suggestions.',
  },
  {
    id: 'agent_test_planner', label: 'Agent Test: task-planner', url: '/agents/task-planner/test',
    narration: 'Now testing the task-planner agent. We send a software requirement — implementing a password reset feature with OTP. The agent generates a structured functional test plan covering all edge cases.',
  },
  {
    id: 'agent_test_researcher', label: 'Agent Test: doc-researcher', url: '/agents/doc-researcher/test',
    narration: 'The doc-researcher agent receives source material about two server models — Alpha and Beta. It analyses the documents and produces a detailed comparison table and recommendation.',
  },
  {
    id: 'agent_test_summarizer', label: 'Agent Test: summarizer', url: '/agents/summarizer/test',
    narration: 'Finally the summarizer agent. We provide four project update outputs from different team members. The agent condenses everything into a single clear summary paragraph.',
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

// ── Convert webm → mp4 (Playwright records webm, we need mp4) ────────────────
function convertToMp4(webmPath, mp4Path, ffmpegPath) {
  const r = spawnSync(ffmpegPath, [
    '-y', '-i', webmPath,
    '-c:v', 'libx264', '-preset', 'fast', '-crf', '22',
    '-pix_fmt', 'yuv420p',
    mp4Path,
  ], { encoding: 'utf8', stdio: ['ignore', 'ignore', 'pipe'] });
  if (!fs.existsSync(mp4Path)) {
    throw new Error(`webm→mp4 conversion failed:\n${r.stderr?.slice(0, 400)}`);
  }
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

// ── Agent test page helper (click Simple, fill, send, wait for response) ──────
async function runAgentTestSection(page, input) {
  try {
    const simpleBtn = page.getByRole('button', { name: 'Simple' });
    if (await simpleBtn.isVisible().catch(() => false)) {
      await simpleBtn.click();
      await page.waitForTimeout(ACTION_PAUSE);
    }
    const textarea = page.getByPlaceholder('Type a message... (Enter to send)');
    await textarea.waitFor({ timeout: 10000 });
    await textarea.fill(input);
    await page.waitForTimeout(600);
    await textarea.press('Enter');
    await page.waitForTimeout(ACTION_PAUSE);
    // Poll main innerText length until stable for 2 consecutive 2-second intervals
    let prevLen = 0, stableCount = 0;
    for (let i = 0; i < 45; i++) {
      await page.waitForTimeout(2000);
      const len = await page.evaluate(() => document.querySelector('main')?.innerText.length ?? 0);
      if (len > prevLen) { prevLen = len; stableCount = 0; }
      else if (prevLen > 0) { stableCount++; if (stableCount >= 2) break; }
    }
    await page.waitForTimeout(2000);
  } catch (e) {
    console.log(`    ⚠  agent test: ${e.message.slice(0, 80)}`);
  }
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

  else if (id === 'agent_test_quality') {
    await runAgentTestSection(page,
      'Please review the following technical paragraph for a user manual:\n\n' +
      '"To starting the machine, you must pushed the red button and than wait for 5 minutes. ' +
      'The engine will began to rotate and the green light will blinking. ' +
      'If the light stay red, you must to calling the technician immediately."');
  }

  else if (id === 'agent_test_planner') {
    await runAgentTestSection(page,
      'Requirement for Analysis: "Implement a \'Password Reset\' feature where a user enters ' +
      'their email, receives a 6-digit numeric OTP valid for 10 minutes, and then sets a new ' +
      'password that must be at least 8 characters with one special character."');
  }

  else if (id === 'agent_test_researcher') {
    await runAgentTestSection(page,
      'Research Request:\n\nUse the following reference material to compare the "Alpha" and "Beta" server models.\n\n' +
      '[Source 1] TechSpecs Annual Report: "The Alpha Model features a liquid-cooling system and supports up to 128GB of RAM. Released in 2024."\n\n' +
      '[Source 2] Internal Infrastructure Wiki: "The Beta Model utilizes traditional air-cooling. It supports 256GB of RAM but requires a dedicated 240V outlet. Release date: Late 2025."\n\n' +
      'Task: Create a comparison table of these two models and summarize which is better for a low-power office environment.');
  }

  else if (id === 'agent_test_summarizer') {
    await runAgentTestSection(page,
      'Context/Previous Outputs:\n\n' +
      '1. The developer completed the integration of the payment gateway using Stripe API.\n\n' +
      '2. The QA team identified three high-priority bugs in the checkout flow.\n\n' +
      '3. The UI designer updated the mobile navigation menu for better accessibility.\n\n' +
      '4. The project manager confirmed the release date is set for Friday at 5:00 PM.\n\n' +
      'Task: Please provide the summary of the work done based on the outputs above.');
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

  // ── Phase 2: Launch Chrome with Playwright recordVideo ───────────────────────
  // recordVideo captures only the browser page content — nothing else on screen.
  console.log('🌐  Launching Chrome with Playwright video recording...');

  const browser = await chromium.launch({
    headless: false,
    slowMo: 700,
    args: ['--start-maximized'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    recordVideo: { dir: TEMP_DIR, size: { width: 1280, height: 800 } },
  });
  const page           = await context.newPage();
  const recordingStart = Date.now();   // video starts from the moment the page exists

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  console.log('  Browser recording started (captures AgentOven UI only).\n');

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

  // ── Phase 5: Stop recording by closing the context (finalises the .webm) ──────
  console.log('\n⏹  Stopping Playwright recording...');

  // Grab the path before closing (it resolves immediately to the pending file path)
  const webmPath = await page.video().path();

  // Closing the context finalises and flushes the .webm to disk
  await context.close();
  await browser.close();

  // Convert webm → mp4 (Playwright always records webm / VP8)
  console.log('  Converting webm → mp4...');
  convertToMp4(webmPath, TEMP_VIDEO, FFMPEG);

  if (!fs.existsSync(TEMP_VIDEO)) {
    throw new Error('webm→mp4 conversion produced no output file.');
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
