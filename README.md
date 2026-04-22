# AgentOven Automation Suite

End-to-end Playwright automation for the **AgentOven** AI platform — **22 test cases** covering every UI section plus live agent AI response testing, with a custom HTML/PDF Extent report, automated demo video recorder, Excel data backup, and GitHub Actions CI with pass/fail email notifications.

## Branches

| Branch | Tests | Purpose |
|---|---|---|
| `main` | 18 tests | Full UI end-to-end flow (Overview → Connectors) |
| `feature/agent-test-runner` | **22 tests** | UI flow (18) + live agent AI test runner (4) |

---

## Table of Contents

1. [What is AgentOven?](#1-what-is-agentoven)
2. [AgentOven UI Sections](#2-agentoven-ui-sections)
3. [Repository Structure](#3-repository-structure)
4. [Prerequisites](#4-prerequisites)
5. [First-Time Setup](#5-first-time-setup)
6. [Input File — input/input.xlsx](#6-input-file--inputinputxlsx)
7. [Agent Test Runner — Agents/Agents.xlsx](#7-agent-test-runner--agentsagentsxlsx)
8. [Running the Tests](#8-running-the-tests)
9. [Running via Batch File (Daily Automation)](#9-running-via-batch-file-daily-automation)
10. [Reports — Where They Are Stored](#10-reports--where-they-are-stored)
11. [Generating a PDF Report](#11-generating-a-pdf-report)
12. [Exporting AgentOven Data to Excel (Backup)](#12-exporting-agentoven-data-to-excel-backup)
13. [Demo Video Recorder](#13-demo-video-recorder)
14. [OBS Walkthrough Script](#14-obs-walkthrough-script)
15. [MCP Tool Servers](#15-mcp-tool-servers)
16. [Registering MCP Tools in AgentOven](#16-registering-mcp-tools-in-agentoven)
17. [GitHub Actions CI/CD](#17-github-actions-cicd)
18. [Restoring on a New Machine](#18-restoring-on-a-new-machine)
19. [All Commands — Quick Reference](#19-all-commands--quick-reference)

---

## 1. What is AgentOven?

AgentOven is an AI-powered platform for building and managing intelligent agents, workflows (recipes), and data pipelines. It runs locally at **http://localhost:8085** and exposes the following core capabilities:

| Capability | Description |
|---|---|
| **Agents** | AI agents with configurable models, system prompts, skills, and integrations |
| **Recipes** | Workflow definitions that agents follow to complete structured tasks |
| **DishShelf** | Output store — every recipe run result is saved here as a "dish" |
| **Prompts** | Reusable prompt templates assigned to agents and recipes |
| **Providers** | AI model provider connections (OpenAI, Anthropic, etc.) |
| **Model Catalog** | Registry of all available AI models |
| **MCP Tools** | Model Context Protocol tool integrations (web search, weather, APIs) |
| **Traces** | Full execution audit trail of every agent and recipe invocation |
| **Embeddings** | Vector embedding configuration for semantic understanding |
| **Vector Stores** | Connected vector databases for fast semantic retrieval |
| **RAG Pipelines** | Retrieval-Augmented Generation — ingest documents, query with AI |
| **Connectors** | External service integrations and data source connections |
| **Overview** | Dashboard showing all key metrics at a glance |

---

## 2. AgentOven UI Sections

The automation suite covers all 13 navigable sections. Below is a description of each section, what it does, and what the tests verify.

### Overview (`/overview`)
The main dashboard. Shows summary counts for agents, recipes, providers, tools, and recent traces. The test verifies the page loads and the Agents nav link is visible.

### Agents (`/agents`)
Lists all configured AI agents as cards. Each card shows the agent name, model, and description. Actions available per card:
- **Integrate** — opens a modal with 4 tabs:
  - **Invoke** — shows code snippets (CURL, CLI, Python) for calling the agent via API
  - **Session** — shows active session information
  - **Test** — interactive test panel to send a message to the agent live
  - **Agent Card** — shows the full agent specification
- **Re-cook** — re-initialises the agent (equivalent to restarting it)
- **Cool** — puts the agent into a cooled/inactive state
- **Rewarm** — brings a cooled agent back to active state

**Test coverage:** Verifies the correct number of agent cards, cycles through the Integrate modal tabs (with screenshots per tab), performs Re-cook, and Cool → Rewarm actions.

**Input:** Agent names and `Full Integrate` flag come from `input/input.xlsx` → **Agents** sheet.

### Recipes (`/recipes`)
Lists workflow recipe definitions. Recipes are created with a name and description, then run against agents.

**Test coverage:** Verifies page loads, creates a new recipe (name + description from Excel), runs it.

**Input:** Recipe name and description come from `input/input.xlsx` → **Recipes** sheet.

### DishShelf (`/dishshelf`)
Stores all outputs produced by recipe runs. Each "dish" represents the result of one recipe execution.

**Test coverage:** Verifies page heading, verifies navigation back to Recipes and the created recipe is listed.

### Prompts (`/prompts`)
Manages reusable prompt templates. Each prompt card shows its name, tags, and description. The Edit form opens a full prompt editor.

**Test coverage:** Verifies each expected prompt card is visible, opens the Edit form for prompts with `Open Edit = true`, attaches a screenshot per edit form.

**Input:** Prompt names and `Open Edit` flag come from `input/input.xlsx` → **Prompts** sheet.

### Providers (`/providers`)
Configures AI provider connections. Each provider entry holds API keys, base URLs, and model selections. The **Test** button verifies connectivity.

**Test coverage:** Clicks each provider to expand it, then runs Test Connection for providers where `Test Connection = true`.

**Input:** Provider names and `Test Connection` flag come from `input/input.xlsx` → **Providers** sheet.

### Model Catalog (`/catalog`)
Registry of all available AI models across all connected providers. Lists model IDs, context window sizes, and capabilities.

**Test coverage:** Verifies the page heading is visible and the catalog loads.

### MCP Tools (`/tools`)
Lists all registered Model Context Protocol tools. Each tool row shows its name, transport type (http/stdio), endpoint, and tool type. Tools extend what agents can do — web search, weather data, file access, API calls, etc.

**Test coverage:** Verifies the page heading, conditionally checks each tool from the Excel sheet (if the MCP server is running), attaches a full-page screenshot.

**Input:** Tool names, transport, and endpoints come from `input/input.xlsx` → **Tools** sheet.

### Traces (`/traces`)
Full execution audit trail for every agent and recipe run. Each trace entry shows the invocation timestamp, input, output, model used, and token counts.

**Test coverage:** Verifies the page heading is visible and the traces list loads.

### Embeddings (`/embeddings`)
Manages vector embedding model configurations used for semantic understanding in RAG pipelines.

**Test coverage:** Verifies the page heading is visible.

### Vector Stores (`/vectorstores`)
Lists configured vector databases (e.g. Chroma, pgvector). Each store entry shows connection details and index status.

**Test coverage:** Verifies the page heading is visible.

### RAG Pipelines (`/rag`)
Retrieval-Augmented Generation pipeline management. The **Ingest** tab accepts document text, processes it into chunks, and stores vectors. The **Query** tab lets you ask questions answered from the ingested content.

**Test coverage:** Clicks the Ingest tab, fills in document content from Excel, clicks **Ingest Document**, waits for the green success confirmation showing `Ingested 1 doc(s), 1 chunk(s), 1 vector(s)`.

**Input:** Ingest content, strategy, and expected success message come from `input/input.xlsx` → **RAG_Pipelines** sheet.

### Connectors (`/connectors`)
External service integrations — database connectors, file system mounts, REST API connections, and third-party data sources.

**Test coverage:** Verifies the `Data Connectors` page heading is visible.

---

## 3. Repository Structure

```
playwright-agentoven/
│
├── tests/
│   ├── localhost8085.spec.ts      # 18 serial E2E test cases
│   └── input-reader.ts            # Reads input/input.xlsx — all test data
│
├── reporter/
│   └── extent-reporter.ts         # Custom Extent-style HTML reporter
│
├── scripts/
│   ├── create-input-excel.js      # Generates input/input.xlsx from scratch
│   ├── generate-pdf.js            # Converts HTML report → A4 PDF
│   ├── export-to-excel.js         # Scrapes AgentOven → data/data.xlsx backup
│   ├── register-tools.js          # Auto-registers MCP tools in AgentOven UI
│   ├── walkthrough.js             # OBS walkthrough with step banners + screenshots
│   └── record-demo.js             # Fully automated demo video recorder (MP4)
│
├── weather-mcp/
│   └── server.js                  # Weather MCP server (port 3006, Open-Meteo API)
│
├── google-search-mcp/
│   └── server.js                  # Google Search MCP server (port 3005, DuckDuckGo)
│
├── input/
│   └── input.xlsx                 # All test input data (7 sheets) — edit this file
│
├── data/
│   └── data.xlsx                  # AgentOven data backup (generated by npm run backup)
│
├── reports/                       # All generated reports (gitignored)
│   ├── extent_DD-MM-YYYY_HH.MM/
│   │   ├── index.html             # Interactive Extent HTML report
│   │   └── index.pdf              # A4 PDF — auto-generated after every run
│   ├── index_DD-MM-YYYY_HH.MM/   # Playwright built-in HTML report
│   ├── walkthrough/               # Screenshots from walkthrough.js
│   └── AgentOven_Demo_Video.mp4   # Demo video from record-demo.js
│
├── .github/
│   └── workflows/
│       └── playwright.yml         # GitHub Actions CI — self-hosted runner + email
│
├── playwright.config.ts           # Playwright configuration
├── tsconfig.json                  # TypeScript configuration
├── package.json                   # npm scripts and dependencies
├── run-daily.bat                  # Windows batch: start MCP servers + run tests
└── .gitignore
```

---

## 4. Prerequisites

| Requirement | Version | Notes |
|---|---|---|
| **Node.js** | LTS (18+) | Download from nodejs.org |
| **npm** | Bundled with Node | Used for all dependency management |
| **AgentOven** | Running at `http://localhost:8085` | Must be started before running tests |
| **Windows** | Windows 10/11 | TTS narration in demo recorder uses Windows Speech API |
| **Git** | Any recent version | For pushing to GitHub |

---

## 5. First-Time Setup

```bash
# 1. Clone the repository
git clone https://github.com/Irshadsmart/playwright-agentoven.git
cd playwright-agentoven

# 2. Install all npm dependencies
npm install

# 3. Install Playwright browser (Chromium only)
npx playwright install chromium

# 4. Generate the input Excel file (only needed if input/input.xlsx is missing)
node scripts/create-input-excel.js

# 5. Verify AgentOven is running at http://localhost:8085 (start it separately)

# 6. Run the tests
npx playwright test --headed --project=chromium
```

---

## 6. Input File — `input/input.xlsx`

All test data is stored in **`input/input.xlsx`**. No test data is hardcoded in the test files. To change what agents, recipes, prompts, providers, or tools are tested — edit the Excel file. No code changes are needed.

The file has **7 sheets**:

### Sheet 1 — Config
Global settings that control how tests behave.

| Key | Default | Description |
|---|---|---|
| `BASE_URL` | `http://localhost:8085` | AgentOven application base URL |
| `STEP_PAUSE_MS` | `3000` | Pause (ms) after reaching a page or completing a section |
| `ACTION_PAUSE_MS` | `1500` | Pause (ms) between individual in-page interactions |
| `TEST_TIMEOUT_MS` | `90000` | Per-test timeout in milliseconds |
| `AGENTS_TIMEOUT_MS` | `120000` | Extended timeout for the Agents test |

### Sheet 2 — Agents
List of agents to verify. Each row is one agent.

| Column | Description |
|---|---|
| `Agent Name` | Exact name shown on the agent card in AgentOven |
| `Verify` | `true` / `false` — include this agent in the test run |
| `Full Integrate` | `true` = walk through all 4 Integrate tabs; `false` = Invoke tab only |
| `Notes` | Free-text notes (not used by tests) |

**Example rows:**
```
My First Agent  | true | true  | Full 4-tab Integrate walkthrough
task-planner    | true | false | Invoke tab only
```

### Sheet 3 — Recipes
Recipes to create and run during the test.

| Column | Description |
|---|---|
| `Recipe Name` | Name to enter in the Create Recipe dialog |
| `Description` | Description to enter in the Create Recipe dialog |
| `Notes` | Free-text notes |

### Sheet 4 — Prompts
Expected prompt cards to verify on the Prompts page.

| Column | Description |
|---|---|
| `Prompt Name` | Exact name shown on the prompt card |
| `Verify` | `true` / `false` — include this prompt in the verification |
| `Open Edit` | `true` = open the Edit form and take a screenshot |
| `Notes` | Free-text notes |

### Sheet 5 — Providers
AI provider connections to expand and test.

| Column | Description |
|---|---|
| `Provider Name` | Exact name shown in the Providers list |
| `Test Connection` | `true` = click the Test Connection button for this provider |
| `Notes` | Free-text notes |

### Sheet 6 — Tools
MCP tools expected in the Tools table. Assertions are **conditional** — if an MCP server is not running, the test skips that tool's assertion rather than failing.

| Column | Description |
|---|---|
| `Tool Name` | Exact name shown in the MCP Tools table |
| `Transport` | Transport type: `http` or `stdio` |
| `Endpoint` | Full endpoint URL |
| `Notes` | Free-text notes |

### Sheet 7 — RAG_Pipelines
Document content to ingest via the RAG Pipelines Ingest tab.

| Column | Description |
|---|---|
| `Ingest Content` | The text to paste into the ingest text box |
| `Strategy` | Ingest strategy: `naive`, `semantic`, etc. |
| `Expected Success Message` | The exact green success message to assert after ingest |
| `Notes` | Free-text notes |

### Regenerating input.xlsx from scratch

If `input/input.xlsx` is deleted or corrupted, regenerate it with:

```bash
node scripts/create-input-excel.js
```

This recreates all 7 sheets with default sample data.

---

## 7. Agent Test Runner — `Agents/Agents.xlsx`

Available on branch `feature/agent-test-runner`. Sends live AI prompts to each agent via its dedicated Test page and captures the AI responses.

### How it works

1. Reads `Agents/Agents.xlsx` — one sheet per agent
2. For each agent, navigates to `http://localhost:8085/agents/{agent-name}/test`
3. Confirms the agent is in **ready** state
4. Selects **Simple** mode
5. Pastes the input text from Column B of the Input row
6. Presses **Enter** (send button)
7. Waits for the AI response to stream and stabilise
8. Captures a **before** and **after** screenshot (both embedded in the Extent report)
9. After all 4 agents complete, writes `Agents/Agents_Output_DD-MM-YYYY_HH.MM.xlsx`

### Agents/Agents.xlsx — Input file structure

One sheet per agent. Each sheet has the same two-row format:

| Column A | Column B |
|---|---|
| `Input` | The prompt text to send to the agent |
| *(empty)* | *(empty)* |
| `Output` | Sample/reference output (for human reference only — not used by tests) |

**Sheets:** `quality-reviewer`, `task-planner`, `doc-researcher`, `summarizer`

To change what is sent to an agent: open `Agents/Agents.xlsx`, go to the relevant sheet, and edit the text in Column B of the Input row.

To add a new agent: add a new sheet named exactly as the agent's URL-slug (e.g. `my-new-agent`).

### Output file — `Agents/Agents_Output_DD-MM-YYYY_HH.MM.xlsx`

Created automatically after each agent test run. Saved in the `Agents/` folder alongside the input file.

| Sheet | Contents |
|---|---|
| Per-agent sheet | Agent name, Status (PASSED/FAILED), Timestamp, full Input text, captured AI Output |
| `Summary` | One row per agent — Name, Status, Output preview (first 200 chars), Timestamp |

**New output file is created for every run** — previous runs are not overwritten.

### Test cases added (19–22)

| # | Test name | Agent |
|---|---|---|
| 19 | Agent Test: quality-reviewer | Reviews and corrects text grammar/style |
| 20 | Agent Test: task-planner | Generates structured test plans from requirements |
| 21 | Agent Test: doc-researcher | Researches and compares document content |
| 22 | Agent Test: summarizer | Summarises multi-part outputs into one paragraph |

---

## 8. Running the Tests

### Run on `main` branch — 18 UI tests

```bash
git checkout main
npx playwright test --headed --project=chromium
```

Runs tests 01–18 (full UI end-to-end flow).

### Run on `feature/agent-test-runner` branch — 22 tests

```bash
git checkout feature/agent-test-runner
npx playwright test --headed --project=chromium
```

Runs all 22 tests: 4 live agent AI tests (19–22) first, then the 18 UI tests (01–18). Output Excel is saved to `Agents/Agents_Output_DD-MM-YYYY_HH.MM.xlsx`.

### Run using npm script shortcut

```bash
npm test
```

Equivalent to the above — works on both branches.

### Run a single specific test by name

```bash
npx playwright test --headed --project=chromium -g "13"
```

Replace `"13"` with any part of the test name (e.g. `"Agents"`, `"RAG"`, `"Connectors"`).

### Run headless (no browser window — faster, CI-style)

```bash
npx playwright test --project=chromium
```

---

## 8. Running via Batch File (Daily Automation)

The `run-daily.bat` file automates the full daily test sequence on Windows:

1. Starts the **Weather MCP server** on port 3006 (if not already running)
2. Starts the **Google Search MCP server** on port 3005 (if not already running)
3. Runs `register-tools.js` to ensure both tools are registered in AgentOven
4. Runs the full Playwright test suite
5. Logs everything with timestamps to `run-daily.log`

### How to run the batch file

**Option 1 — Double-click** `run-daily.bat` in Windows Explorer

**Option 2 — Run from terminal:**

```cmd
run-daily.bat
```

**Option 3 — Schedule it with Windows Task Scheduler** for fully automatic daily runs (no manual steps).

### What gets logged

All output is appended to `run-daily.log` in the project root:

```
[Mon 21/04/2026 09:00:01.23] Starting AgentOven daily test run...
[Mon 21/04/2026 09:00:01.89] Weather MCP server already running on port 3006
[Mon 21/04/2026 09:00:02.10] Google Search MCP server already running on port 3005
[Mon 21/04/2026 09:00:02.45] Registering MCP tools in AgentOven...
[Mon 21/04/2026 09:00:08.31] Running Playwright tests...
[Mon 21/04/2026 09:03:22.17] ALL TESTS PASSED
[Mon 21/04/2026 09:03:22.18] Done.
```

---

## 9. Reports — Where They Are Stored

All reports are saved inside the `reports/` folder. This folder is **gitignored** (not pushed to GitHub — reports stay on your local machine).

### Extent Report (primary — send this to management)

After every test run, two files are created in a timestamped folder:

```
reports/
└── extent_DD-MM-YYYY_HH.MM/
    ├── index.html    ← Open in browser — interactive, click arrows to expand screenshots
    └── index.pdf     ← Auto-generated A4 PDF — attach to email for management
```

**Format explanation:** `extent_21-04-2026_09.03` means the tests ran on 21 April 2026 at 09:03.

**What the Extent report contains:**
- Title: **AgentOven Automation Report**
- SVG donut chart showing Pass / Fail / Skip counts
- 4 stat tiles: Total, Passed, Failed, Skipped
- Verdict banner (green = all pass, red = failures)
- Environment table: OS, Browser, Execution Mode, Timeout, App Under Test
- 18 test cards — each collapsed by default
  - Click the **▼ arrow** on any card to expand it and see embedded screenshots
  - Click **▼ again** to collapse
- Failed tests auto-expand to show the error and failure screenshot immediately

### Playwright Built-in HTML Report

```
reports/
└── index_DD-MM-YYYY_HH.MM/
    └── index.html    ← Playwright's own report (detailed trace viewer)
```

**To open it in a browser:**
```bash
npx playwright show-report reports/index_21-04-2026_09.03
```

### Walkthrough Screenshots

```
reports/
└── walkthrough/
    ├── step-01-overview.png
    ├── step-02-agents.png
    └── ...                   ← One PNG per step from scripts/walkthrough.js
```

### Demo Video

```
reports/
└── AgentOven_Demo_Video.mp4  ← Produced by: node scripts/record-demo.js
```

---

## 10. Generating a PDF Report

The PDF is **auto-generated** after every test run — you do not need to run any extra command. It is saved alongside the HTML report as `index.pdf`.

### Manual PDF generation (if you need to regenerate)

**From the most recent report:**
```bash
npm run pdf
```

**From a specific report:**
```bash
node scripts/generate-pdf.js reports/extent_21-04-2026_09.03/index.html
```

**What the PDF looks like:**
- A4 format, portrait orientation
- All 18 test cards shown in a clean collapsed summary list
- Status badges (PASSED / FAILED / SKIPPED) with colour coding
- Environment table and donut chart preserved
- No screenshots in the PDF (clean summary for management)
- To view screenshots — open `index.html` in a browser and click the arrows

---

## 11. Exporting AgentOven Data to Excel (Backup)

The backup script scrapes every page of AgentOven and writes a complete snapshot to `data/data.xlsx`.

```bash
npm run backup
```

**What gets exported (one sheet per section):**

| Sheet | Contents |
|---|---|
| Agents | Name, model, system prompt, skills, ingredients, status |
| Recipes | Recipe name, description, status |
| Prompts | Prompt name, content, tags |
| Providers | Provider name, model, base URL, status |
| Model Catalog | All model IDs, context window, capabilities |
| Tools | Tool name, transport, endpoint |
| Traces | Execution history |
| Embeddings | Embedding model configs |
| Vector Stores | Store names, connection details |
| RAG Pipelines | Pipeline configurations |
| Connectors | Connector names and statuses |

**Output file:** `data/data.xlsx`

Use this as a **disaster recovery backup** — if AgentOven's data is lost, you have a full snapshot in Excel.

---

## 12. Demo Video Recorder

The demo recorder produces a fully automated MP4 video of the entire AgentOven platform with narrated voiceover — zero manual steps required.

```bash
node scripts/record-demo.js
```

**What it does:**
1. Generates TTS narration WAV files for all 15 sections using Windows Speech API
2. Opens Chrome with Playwright's built-in `recordVideo` — captures **only** the browser page content (not the desktop, not other tabs, not VS Code)
3. Walks through all 15 AgentOven sections with interactive demonstrations
4. Closes the browser, converts the recorded `.webm` to `.mp4` via ffmpeg
5. Builds a time-synced narration audio track (each narration placed at its exact position in the video timeline)
6. Merges video + narration audio into the final MP4
7. Saves to: `reports/AgentOven_Demo_Video.mp4`

**Sections covered in the demo video:**

| # | Section | What is shown |
|---|---|---|
| 1 | Overview Dashboard | Key metrics at a glance |
| 2 | Agents | Agent cards, Integrate modal, Cool/Rewarm |
| 3 | Recipes — Create | Creating a new recipe |
| 4 | Recipes — Run | Running the created recipe |
| 5 | DishShelf | Recipe output results |
| 6 | Prompts | Prompt templates |
| 7 | Providers | AI provider connections |
| 8 | Model Catalog | Available models |
| 9 | MCP Tools | Registered tool integrations |
| 10 | Traces | Execution audit trail |
| 11 | Embeddings | Embedding configurations |
| 12 | Vector Stores | Vector database connections |
| 13 | RAG Pipelines | Document ingest demonstration |
| 14 | Connectors | External integrations |
| 15 | Closing | Summary narration |

**Output:** `reports/AgentOven_Demo_Video.mp4`

**Duration:** ~6–7 minutes depending on agent response times.

**Note:** This command uses `ffmpeg-static` (bundled in the npm package) — no separate ffmpeg installation needed. Windows Speech API for TTS is built into Windows 10/11 — no external TTS service required.

---

## 13. OBS Walkthrough Script

For recording a manual walkthrough using OBS (Open Broadcaster Software):

```bash
node scripts/walkthrough.js
```

**What it does:**
- Opens Chrome and navigates through every AgentOven section
- Injects a step-banner overlay at the bottom of the browser at each step showing the step number and title
- Waits 6 seconds on each section for OBS to capture the screen
- Saves a screenshot per step to: `reports/walkthrough/step-XX-<name>.png`
- Logs all steps to terminal with step numbers and descriptions

**Setup before running:**
1. Start OBS and begin recording your screen
2. Run: `node scripts/walkthrough.js`
3. OBS will capture the browser with the step banners overlaid
4. Stop OBS when the script completes

---

## 14. MCP Tool Servers

Two MCP (Model Context Protocol) servers extend AgentOven agents with external capabilities. Both must be running for the tools to work and for test 13 to fully pass.

### Weather MCP Server (Port 3006)

Provides real-time weather data and 5-day forecasts using the **Open-Meteo API** (free, no API key required).

```bash
# Start the Weather MCP server
node weather-mcp/server.js
```

**Capabilities provided to agents:**
- Current conditions: temperature (°C/°F), feels-like, humidity, wind speed and direction, UV index, visibility, pressure
- 5-day forecast: daily condition, temperature range, rain probability %, precipitation mm, sunrise/sunset times, UV max
- Climate summary: average rain probability, total expected rain, recommendations

**Endpoint registered in AgentOven:** `http://host.docker.internal:3006/mcp`

### Google Search MCP Server (Port 3005)

Provides web search capability using **DuckDuckGo** (no API key required).

```bash
# Start the Google Search MCP server
node google-search-mcp/server.js
```

**Endpoint registered in AgentOven:** `http://host.docker.internal:3005/mcp`

### Starting both servers together

The `run-daily.bat` batch file starts both servers automatically. To start them manually in separate terminal windows:

```bash
# Terminal 1 — Weather MCP
node weather-mcp/server.js

# Terminal 2 — Google Search MCP
node google-search-mcp/server.js

# Terminal 3 — Tests
npx playwright test --headed --project=chromium
```

---

## 15. Registering MCP Tools in AgentOven

When tools are registered in AgentOven's UI, they persist in the app's database. The register script is safe to run multiple times — it skips any tool already registered.

```bash
node scripts/register-tools.js
```

**When to run this:**
- First time setting up on a new machine
- If a tool was accidentally deleted from the AgentOven Tools page
- The `run-daily.bat` batch file runs this automatically before every test run

---

## 16. GitHub Actions CI/CD

Every `git push` to the `main` branch triggers an automated test run on your machine and sends an email with the result.

### How it works

1. GitHub Actions sends a trigger to the self-hosted runner (your Windows machine)
2. The runner checks out the latest code, installs dependencies, installs Chromium
3. Verifies AgentOven is reachable at `http://localhost:8085`
4. Runs all 18 tests with `npx playwright test --headed --project=chromium`
5. Sends a **green pass email** if all tests pass
6. Sends a **red fail email** with a link to screenshots if any test fails

### One-time setup (required to activate CI)

**Step 1 — Add a self-hosted runner on your Windows machine:**
1. Go to: https://github.com/Irshadsmart/playwright-agentoven/settings/actions/runners
2. Click **New self-hosted runner** → select **Windows** → **x64**
3. Follow the download and configure commands shown by GitHub
4. After setup, keep the runner active with: `.\run.cmd` in the runner folder

**Step 2 — Create a Gmail App Password:**
1. Go to: https://myaccount.google.com/apppasswords
   (2-Step Verification must be enabled on your Gmail account)
2. Select **Mail** → **Windows Computer** → click **Generate**
3. Copy the 16-character app password shown

**Step 3 — Add GitHub Secrets:**
1. Go to: https://github.com/Irshadsmart/playwright-agentoven/settings/secrets/actions
2. Add two secrets:

| Secret Name | Value |
|---|---|
| `NOTIFY_EMAIL` | `irshadsmartone@gmail.com` |
| `NOTIFY_EMAIL_PASSWORD` | The 16-character app password from Step 2 |

### Triggering a manual CI run

Without pushing code:
1. Go to: https://github.com/Irshadsmart/playwright-agentoven/actions
2. Select **Playwright Tests**
3. Click **Run workflow** → **Run workflow**

---

## 17. Restoring on a New Machine

If your computer is replaced or the project folder is deleted, restore everything from GitHub:

```bash
# 1. Clone the repository
git clone https://github.com/Irshadsmart/playwright-agentoven.git
cd playwright-agentoven

# 2. Install dependencies
npm install

# 3. Install Playwright browser
npx playwright install chromium

# 4. Regenerate the input Excel file
node scripts/create-input-excel.js

# 5. Make sure AgentOven is running at http://localhost:8085

# 6. Start MCP servers (two separate terminals)
node weather-mcp/server.js
node google-search-mcp/server.js

# 7. Register the tools in AgentOven
node scripts/register-tools.js

# 8. Run the full test suite
npx playwright test --headed --project=chromium
```

The reports folder is not in GitHub (gitignored). All past reports remain on your original machine. New reports are generated fresh on the new machine when you run the tests.

---

## 18. All Commands — Quick Reference

### Test Commands

| What you want to do | Command |
|---|---|
| Run 18 UI tests (main branch) | `git checkout main && npx playwright test --headed --project=chromium` |
| Run 22 tests — UI + Agent Runner (feature branch) | `git checkout feature/agent-test-runner && npx playwright test --headed --project=chromium` |
| Run all tests (npm shortcut, current branch) | `npm test` |
| Run only the agent runner tests | `npx playwright test tests/localhost8085-agent-runner.spec.ts --headed --project=chromium` |
| Run a specific test by number/name | `npx playwright test --headed --project=chromium -g "13"` |
| Run headless (no browser window) | `npx playwright test --project=chromium` |
| View the Playwright HTML report | `npx playwright show-report reports/index_DD-MM-YYYY_HH.MM` |

### Report Commands

| What you want to do | Command |
|---|---|
| Generate PDF from latest Extent report | `npm run pdf` |
| Generate PDF from a specific report | `node scripts/generate-pdf.js reports/extent_.../index.html` |
| Export all AgentOven data to Excel | `npm run backup` |

### MCP Server Commands

| What you want to do | Command |
|---|---|
| Start Weather MCP server | `node weather-mcp/server.js` |
| Start Google Search MCP server | `node google-search-mcp/server.js` |
| Register tools in AgentOven UI | `node scripts/register-tools.js` |
| Register tools (npm shortcut) | `npm run register-tools` |

### Demo & Walkthrough Commands

| What you want to do | Command |
|---|---|
| Record automated demo video (MP4) | `node scripts/record-demo.js` |
| Record demo (npm shortcut) | `npm run demo` |
| Run OBS walkthrough with step banners | `node scripts/walkthrough.js` |
| Run walkthrough (npm shortcut) | `npm run walkthrough` |

### Input File Commands

| What you want to do | Command |
|---|---|
| Regenerate input/input.xlsx from scratch | `node scripts/create-input-excel.js` |
| Regenerate input (npm shortcut) | `npm run create-inputs` |

### Batch File (Windows)

| What you want to do | Command |
|---|---|
| Run full daily sequence (MCP + tools + tests) | `run-daily.bat` |

### Git Commands (pushing updates to GitHub)

| What you want to do | Command |
|---|---|
| See what changed locally | `git status` |
| Save changes to GitHub | `git add . && git commit -m "your message" && git push` |
| Get latest code from GitHub | `git pull` |
| View recent commits | `git log --oneline` |

---

## Where Reports Are Found

After running `npx playwright test --headed --project=chromium`, open File Explorer and navigate to:

```
C:\Users\irsha\Projects\playwright-localhost-8085\reports\
```

You will see folders named by date and time. Open the most recent one:

```
extent_21-04-2026_09.03\
├── index.html   ← Open in browser for interactive report
└── index.pdf    ← Attach to email for management
```

The **PDF** is ready to attach to any email as a professional test report. The **HTML** is best opened in Chrome for the interactive screenshot viewer.

---

## Repository

**GitHub:** https://github.com/Irshadsmart/playwright-agentoven

**Clone URL:** `https://github.com/Irshadsmart/playwright-agentoven.git`
