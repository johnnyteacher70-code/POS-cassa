@echo off
rem Kassa rejimi: Chrome yoki Edge to'liq ekranda, chek oynasiz to'g'ridan-to'g'ri STANDART printerga chiqadi (--kiosk-printing).
rem Chek printerini Windows'da "standart printer" qilib qo'ying. Chiqish: Alt+F4.
cd /d "%~dp0\..\.."
powershell -NoProfile -Command "try { Invoke-WebRequest -UseBasicParsing http://localhost:3000/healthz -TimeoutSec 2 | Out-Null } catch { exit 1 }"
if errorlevel 1 ( wscript.exe "%CD%\scripts\windows\server-hidden.vbs" & timeout /t 4 >nul )
set URL=http://localhost:3000/#/pos
set PROFILE=%LOCALAPPDATA%\DokonKassa
for %%B in ("%ProgramFiles%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Google\Chrome\Application\chrome.exe" "%LocalAppData%\Google\Chrome\Application\chrome.exe" "%ProgramFiles(x86)%\Microsoft\Edge\Application\msedge.exe" "%ProgramFiles%\Microsoft\Edge\Application\msedge.exe") do (
  if exist %%B ( start "" %%B --kiosk --kiosk-printing --user-data-dir="%PROFILE%" --app=%URL% & exit /b 0 )
)
echo Chrome yoki Edge topilmadi. & pause
