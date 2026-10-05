@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONDONTWRITEBYTECODE=1
powershell -NoProfile -Command "$f=[Environment]::GetFolderPath('Startup')+'\Divisor EDICOM.lnk'; if (Test-Path $f) { Remove-Item $f; Write-Host 'Quitado del inicio de Windows.' } else { Write-Host 'No estaba activado.' }"
pause
