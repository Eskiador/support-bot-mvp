@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONDONTWRITEBYTECODE=1
powershell -NoProfile -Command "Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'pythonw.exe' -and $_.CommandLine -like '*divisor --vigilar*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force; Write-Host 'Vigilancia detenida.' }"
pause
