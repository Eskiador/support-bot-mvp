@echo off
chcp 65001 >nul
cd /d "%~dp0"
set PYTHONIOENCODING=utf-8
set PYTHONDONTWRITEBYTECODE=1
rem Procesa los PDF 'report - ...' pendientes en Descargas.
rem Tambien puedes arrastrar un PDF encima de este archivo.
"%~dp0python\python.exe" -m divisor --pausa %*
