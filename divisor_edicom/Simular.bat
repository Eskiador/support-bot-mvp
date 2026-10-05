@echo off
rem Divisor EDICOM. Solo ejecuta el Python incluido en esta carpeta, en esta
rem misma ventana y a la vista. Nada se ejecuta en segundo plano.
chcp 65001 >nul
cd /d "%~dp0"
title Divisor EDICOM - Simulacion
rem Muestra lo que haria, SIN escribir nada.
"%~dp0python\python.exe" -m divisor --simular --pausa %*
