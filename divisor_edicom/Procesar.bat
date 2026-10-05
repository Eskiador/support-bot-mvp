@echo off
rem Divisor EDICOM. Solo ejecuta el Python incluido en esta carpeta, en esta
rem misma ventana y a la vista. No usa PowerShell ni procesos ocultos.
chcp 65001 >nul
cd /d "%~dp0"
title Divisor EDICOM - Procesar
rem Procesa los PDF 'report - ...' pendientes en Descargas.
rem Tambien puedes arrastrar un PDF encima de este archivo.
"%~dp0python\python.exe" -m divisor --pausa %*
