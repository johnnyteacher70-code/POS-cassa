@echo off
rem Serverni to'xtatish (yangilash yoki zaxiradan qo'lda tiklashdan oldin)
for /f "tokens=5" %%p in ('netstat -ano ^| findstr ":3000 " ^| findstr LISTENING') do taskkill /PID %%p /T /F >nul 2>nul
echo Server to'xtatildi.
