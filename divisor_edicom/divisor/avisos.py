"""Avisos en Windows: notificación discreta y ventana de error."""

from __future__ import annotations

import os
import subprocess

_PS_NOTIFICACION = r"""
Add-Type -AssemblyName System.Windows.Forms
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::Information
$n.Visible = $true
$n.ShowBalloonTip(10000, $env:DIVISOR_TITULO, $env:DIVISOR_TEXTO, 'Info')
Start-Sleep -Seconds 11
$n.Dispose()
"""


def notificar(titulo: str, texto: str) -> None:
    """Notificación de Windows que desaparece sola (no bloquea)."""
    if os.name != "nt":
        print(f"[NOTIFICACIÓN] {titulo}: {texto}")
        return
    entorno = dict(os.environ, DIVISOR_TITULO=titulo[:63], DIVISOR_TEXTO=texto[:250])
    try:
        subprocess.Popen(
            ["powershell", "-NoProfile", "-WindowStyle", "Hidden", "-Command", _PS_NOTIFICACION],
            env=entorno,
            creationflags=subprocess.CREATE_NO_WINDOW,
        )
    except OSError:
        pass


def ventana_error(titulo: str, texto: str) -> None:
    """Ventana de error que hay que cerrar a mano (bloquea hasta cerrarla)."""
    if os.name != "nt":
        print(f"[ERROR] {titulo}: {texto}")
        return
    import ctypes

    MB_ICONERROR, MB_SYSTEMMODAL, MB_SETFOREGROUND = 0x10, 0x1000, 0x10000
    ctypes.windll.user32.MessageBoxW(0, texto, titulo, MB_ICONERROR | MB_SYSTEMMODAL | MB_SETFOREGROUND)
