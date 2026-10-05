@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONDONTWRITEBYTECODE=1
rem Crea un acceso directo en la carpeta Inicio para que la vigilancia arranque al encender el PC.
powershell -NoProfile -Command "$s=(New-Object -ComObject WScript.Shell).CreateShortcut([Environment]::GetFolderPath('Startup')+'\Divisor EDICOM.lnk'); $s.TargetPath='%~dp0python\pythonw.exe'; $s.Arguments='-m divisor --vigilar'; $s.WorkingDirectory='%~dp0'; $s.Description='Divisor EDICOM - vigilancia de Descargas'; $s.Save(); Write-Host 'Listo: la vigilancia arrancara con Windows.'"
pause
