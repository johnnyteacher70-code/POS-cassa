@echo off
rem Dasturni brauzerda ochish (server ishlamayotgan bo'lsa — avval ishga tushiriladi)
cd /d "%~dp0\..\.."
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz -TimeoutSec 2 | Out-Null } catch { exit 1 }"
if errorlevel 1 ( wscript.exe "%CD%\scripts\windows\server-hidden.vbs" & timeout /t 4 >nul )
start "" http://localhost:3000
