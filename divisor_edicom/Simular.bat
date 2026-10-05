@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONDONTWRITEBYTECODE=1
rem Muestra lo que haria, SIN escribir nada.
"%~dp0python\python.exe" -m divisor --simular --pausa %*
