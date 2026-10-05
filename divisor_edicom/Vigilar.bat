@echo off
rem Divisor EDICOM. Solo ejecuta el Python incluido en esta carpeta, en esta
rem misma ventana y a la vista. No usa PowerShell ni procesos ocultos.
chcp 65001 >nul
cd /d "%~dp0"
title Divisor EDICOM - Vigilancia (cierra esta ventana para pararla)
rem Vigila Descargas mientras esta ventana este abierta. Cerrarla = parar.
"%~dp0python\python.exe" -m divisor --vigilar
pause
