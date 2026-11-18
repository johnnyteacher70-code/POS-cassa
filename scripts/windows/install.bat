@echo off
chcp 65001 >nul
rem Do'kon boshqaruv — Windows o'rnatuvchisi.
rem 1) Node.js borligini tekshiradi  2) kutubxonalarni o'rnatadi  3) ish stoli va avtoyuklashga yorliq qo'yadi  4) ishga tushiradi
cd /d "%~dp0\..\.."
where node >nul 2>nul
if errorlevel 1 (
  echo.
  echo [!] Node.js topilmadi. https://nodejs.org dan "LTS" versiyasini o'rnating ^(20 yoki yangi^), keyin shu faylni qayta ishga tushiring.
  pause
  exit /b 1
)
echo Kutubxonalar o'rnatilmoqda (bir marta, internet kerak)...
call npm install --omit=dev
if errorlevel 1 ( echo [!] O'rnatishda xato. Internetni tekshiring. & pause & exit /b 1 )
if not exist ".env" copy ".env.example" ".env" >nul
echo Yorliqlar yaratilmoqda...
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
  "$s=New-Object -ComObject WScript.Shell; $d=[Environment]::GetFolderPath('Desktop'); $st=[Environment]::GetFolderPath('Startup');" ^
  "$l=$s.CreateShortcut(\"$d\Do'kon boshqaruv.lnk\"); $l.TargetPath='%CD%\scripts\windows\open.bat'; $l.WorkingDirectory='%CD%'; $l.Save();" ^
  "$k=$s.CreateShortcut(\"$d\Kassa (POS).lnk\"); $k.TargetPath='%CD%\scripts\windows\kassa.bat'; $k.WorkingDirectory='%CD%'; $k.Save();" ^
  "$a=$s.CreateShortcut(\"$st\Do'kon boshqaruv server.lnk\"); $a.TargetPath='wscript.exe'; $a.Arguments='\"%CD%\scripts\windows\server-hidden.vbs\"'; $a.WorkingDirectory='%CD%'; $a.Save();"
echo Server ishga tushirilmoqda...
wscript.exe "%CD%\scripts\windows\server-hidden.vbs"
timeout /t 4 >nul
start "" http://localhost:3000
echo.
echo Tayyor! Server kompyuter yonganda o'zi ishga tushadi. Ish stolidagi "Do'kon boshqaruv" yorlig'i — dasturni ochadi.
pause
