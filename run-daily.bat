@echo off
cd /d "C:\Users\irsha\Projects\playwright-localhost-8085"

echo [%date% %time%] Starting AgentOven daily test run... >> run-daily.log

:: ── Start Weather MCP server (port 3006) ────────────────────────────────────
netstat -an | find ":3006" >NUL 2>&1
if errorlevel 1 (
    echo [%date% %time%] Starting Weather MCP server on port 3006... >> run-daily.log
    start /B node weather-mcp\server.js >> run-daily.log 2>&1
    timeout /t 3 /nobreak >NUL
) else (
    echo [%date% %time%] Weather MCP server already running on port 3006 >> run-daily.log
)

:: ── Start Google Search MCP server (port 3005) ──────────────────────────────
netstat -an | find ":3005" >NUL 2>&1
if errorlevel 1 (
    echo [%date% %time%] Starting Google Search MCP server on port 3005... >> run-daily.log
    start /B node google-search-mcp\server.js >> run-daily.log 2>&1
    timeout /t 3 /nobreak >NUL
) else (
    echo [%date% %time%] Google Search MCP server already running on port 3005 >> run-daily.log
)

:: ── Register tools in AgentOven (safe to run if already registered) ─────────
echo [%date% %time%] Registering MCP tools in AgentOven... >> run-daily.log
call node scripts\register-tools.js >> run-daily.log 2>&1

:: ── Run Playwright tests ─────────────────────────────────────────────────────
echo [%date% %time%] Running Playwright tests... >> run-daily.log
call npx playwright test --headed --project=chromium >> run-daily.log 2>&1

if %errorlevel%==0 (
    echo [%date% %time%] ALL TESTS PASSED >> run-daily.log
) else (
    echo [%date% %time%] TESTS FAILED — check the Extent report >> run-daily.log
)

echo [%date% %time%] Done. >> run-daily.log
