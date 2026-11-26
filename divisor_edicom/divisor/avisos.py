"""Avisos en Windows con el cuadro de mensaje estándar de Windows (user32).

No se lanza ningún otro programa ni nada en segundo plano: todo pasa
dentro del propio proceso de Python, visible en su ventana."""

from __future__ import annotations

import os
import threading

MB_ICONERROR, MB_ICONINFORMATION = 0x10, 0x40
MB_SYSTEMMODAL, MB_SETFOREGROUND = 0x1000, 0x10000


def notificar(titulo: str, texto: str, segundos: int = 15) -> None:
    """Aviso informativo que se cierra solo a los `segundos` (no bloquea)."""
    print(f"[{titulo}] {texto}")
    if os.name != "nt":
        return

    def mostrar():
        import ctypes

        user32 = ctypes.windll.user32
        estilo = MB_ICONINFORMATION | MB_SETFOREGROUND
        try:  # MessageBoxTimeoutW: igual que MessageBoxW pero se cierra solo
            user32.MessageBoxTimeoutW(0, texto, titulo, estilo, 0, segundos * 1000)
        except AttributeError:
            user32.MessageBoxW(0, texto, titulo, estilo)

    threading.Thread(target=mostrar, daemon=True).start()


def ventana_error(titulo: str, texto: str) -> None:
    """Ventana de error que hay que cerrar a mano (bloquea hasta cerrarla)."""
    print(f"[{titulo}] ERROR: {texto}")
    if os.name != "nt":
        return
    import ctypes

    ctypes.windll.user32.MessageBoxW(0, texto, titulo, MB_ICONERROR | MB_SYSTEMMODAL | MB_SETFOREGROUND)
