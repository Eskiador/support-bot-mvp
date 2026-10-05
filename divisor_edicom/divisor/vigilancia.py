"""Modo vigilancia: procesa cada combinado de ediwin en cuanto aparece en Descargas."""

from __future__ import annotations

import time
import traceback

from . import avisos, estado
from .bloqueo import Ocupado, bloqueo
from .configuracion import Configuracion
from .proceso import escribir_log, procesar, tabla

TITULO = "Divisor EDICOM"


def vigilar(cfg: Configuracion, vueltas: int | None = None) -> None:
    """Bucle de vigilancia. `vueltas` limita las iteraciones (para tests)."""
    with bloqueo(cfg.estado / "vigilancia.lock"):
        datos = estado.leer(cfg)
        tamanos: dict[str, int] = {}
        hechas = 0
        while vueltas is None or hechas < vueltas:
            hechas += 1
            for f in estado.candidatos(cfg, datos):
                try:
                    k = estado.clave(f)
                    if k in datos["vistos"]:
                        continue
                    # Esperar a que la descarga termine: mismo tamaño en dos vueltas.
                    tam = f.stat().st_size
                    if tam == 0 or tamanos.get(f.name) != tam:
                        tamanos[f.name] = tam
                        continue
                    with open(f, "rb"):
                        pass
                    with bloqueo(cfg.estado / "proceso.lock"):
                        _procesar_uno(cfg, f, datos, k)
                except Ocupado:
                    continue  # hay una ejecución manual; se reintenta en la próxima vuelta
                except OSError:
                    continue  # el archivo aún se está escribiendo o ha desaparecido
            if vueltas is None or hechas < vueltas:
                time.sleep(cfg.intervalo_segundos)


def _procesar_uno(cfg: Configuracion, f, datos: dict, k: str) -> None:
    lineas: list[str] = []
    try:
        res = procesar(f, cfg, salida=lineas.append)
    except Exception:  # error inesperado: nunca debe tumbar la vigilancia
        escribir_log(cfg, f"{f.name}: ERROR INESPERADO\n{traceback.format_exc()}")
        datos["vistos"][k] = "error"
        estado.guardar(cfg, datos)
        avisos.ventana_error(TITULO, f"Error inesperado procesando:\n{f.name}\n\nNo se ha escrito nada. Revisa el log.")
        return

    datos["vistos"][k] = res.estado
    estado.guardar(cfg, datos)
    texto = "\n".join(lineas + [res.mensaje] + [f"AVISO: {a}" for a in res.avisos])
    escribir_log(cfg, f"{f.name}: {res.estado.upper()}\n{texto}")
    if res.estado == "ok":
        avisos.notificar(TITULO, f"{len(res.filas)} confirmaciones guardadas en RECADV.\nTotal para cuadrar con ediwin: {len(res.filas)}")
        if res.avisos:
            avisos.ventana_error(TITULO, "Proceso correcto, pero con avisos:\n\n" + "\n".join(res.avisos))
    elif res.estado == "ignorado":
        avisos.notificar(TITULO, f"Ignorado (no son confirmaciones): {f.name}")
    else:
        avisos.ventana_error(
            TITULO,
            f"NO se ha procesado:\n{f.name}\n\n{res.mensaje}\n\n"
            "No se ha escrito nada. El PDF sigue en Descargas.",
        )
