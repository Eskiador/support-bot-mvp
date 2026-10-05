@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONDONTWRITEBYTECODE=1
rem Arranca la vigilancia de Descargas en segundo plano (sin ventana).
start "" "%~dp0python\pythonw.exe" -m divisor --vigilar
echo Vigilancia iniciada. Veras una notificacion de Windows.
timeout /t 4 >nul
