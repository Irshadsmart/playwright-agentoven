@echo off
cd /d "C:\Users\irsha\Projects\playwright-localhost-8085"

echo [%date% %time%] Starting AgentOven daily test run... >> run-daily.log

:: Start Weather MCP server in background (if not already running)
tasklist /FI "IMAGENAME eq node.exe" 2>NUL | find /I "node.exe" >NUL
if errorlevel 1 (
    echo [%date% %time%] Starting Weather MCP server... >> run-daily.log
    start /B node weather-mcp\server.js >> run-daily.log 2>&1
    timeout /t 3 /nobreak >NUL
)

:: Run Playwright tests
echo [%date% %time%] Running Playwright tests... >> run-daily.log
call npx playwright test --headed --project=chromium >> run-daily.log 2>&1

if %errorlevel%==0 (
    echo [%date% %time%] ALL TESTS PASSED >> run-daily.log
) else (
    echo [%date% %time%] TESTS FAILED — check the Extent report >> run-daily.log
)

echo [%date% %time%] Done. >> run-daily.log
