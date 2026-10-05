@echo off
rem Divisor EDICOM. Solo ejecuta el Python incluido en esta carpeta, en esta
rem misma ventana y a la vista. No usa PowerShell ni procesos ocultos.
chcp 65001 >nul
cd /d "%~dp0"
title Divisor EDICOM - Simulacion
rem Muestra lo que haria, SIN escribir nada.
"%~dp0python\python.exe" -m divisor --simular --pausa %*
