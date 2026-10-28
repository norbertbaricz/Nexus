@echo off
setlocal
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo [Nexus runtime] Node.js was not found on PATH. Install Node.js 26.x or Node 24.15+.
  goto failed
)
echo [Nexus] Installation: "%CD%"
node scripts\require-node.js
if errorlevel 1 goto failed
node scripts\verify-release.js
if errorlevel 1 goto failed
node scripts\verify-release.js --dependencies
if errorlevel 1 (
  call npm ci
  if errorlevel 1 goto failed
)
node --env-file-if-exists=.env server.js
if errorlevel 1 goto failed
exit /b 0
:failed
echo Nexus could not start. Read the error above.
pause
exit /b 1
