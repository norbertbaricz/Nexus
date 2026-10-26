@echo off
setlocal
rem Run from the project directory, including when opened through Explorer.
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24.15 or newer in the Node 24 release line first.
  pause
  exit /b 1
)
if not exist node_modules\express\package.json (
  call npm ci
  if errorlevel 1 (
    echo Dependency installation failed. Review the error above.
    pause
    exit /b 1
  )
)
call npm start
pause
