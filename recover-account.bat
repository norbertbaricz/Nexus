@echo off
setlocal
cd /d "%~dp0"
node scripts\require-node.js
if errorlevel 1 goto failed
node scripts\verify-release.js
if errorlevel 1 goto failed
node --env-file-if-exists=.env scripts\recover-account.js %*
if errorlevel 1 goto failed
pause
exit /b 0
:failed
echo Account recovery did not finish. Read the message above.
pause
exit /b 1
