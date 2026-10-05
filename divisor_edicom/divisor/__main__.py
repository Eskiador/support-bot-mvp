"""Uso:
  python -m divisor                  Procesa los combinados pendientes de Descargas
  python -m divisor ARCHIVO.pdf      Procesa ese archivo
  python -m divisor --simular        Muestra qué haría, sin escribir nada
  python -m divisor --vigilar        Modo vigilancia de Descargas
"""

from __future__ import annotations

import argparse
import sys
import traceback
from pathlib import Path

from . import estado
from .bloqueo import Ocupado, bloqueo
from .configuracion import ErrorConfiguracion, cargar_configuracion
from .proceso import escribir_log, procesar


def pedir_total(encontrados: int) -> int:
    while True:
        r = input(f"\n¿Cuántos documentos indica el 'Total' de ediwin? (encontrados: {encontrados}): ").strip()
        if r.isdigit():
            return int(r)
        print("Escribe solo el número.")


def manual(cfg, archivos: list[Path], simular: bool, con_total: bool) -> int:
    with bloqueo(cfg.estado / "proceso.lock"):
        if not archivos:
            datos = estado.leer(cfg)
            antiguos = estado.anteriores(cfg, datos)
            archivos = []
            for f in estado.candidatos(cfg, datos):
                if datos["vistos"].get(estado.clave(f)) == "ignorado":
                    continue
                archivos.append(f)
            if antiguos:
                print(f"(Se ignoran {antiguos} PDF 'report' descargados antes de instalar la herramienta.)")
            if not archivos:
                print(f"No hay combinados de ediwin pendientes en {cfg.descargas}")
                return 0

        errores = 0
        for f in archivos:
            res = procesar(Path(f), cfg, simular=simular, pedir_total=pedir_total if con_total and not simular else None)
            print()
            if res.estado == "ok":
                print(f"CORRECTO: {res.mensaje}")
            elif res.estado == "simulado":
                print(res.mensaje)
            elif res.estado == "ignorado":
                print(f"IGNORADO: {res.mensaje}")
            else:
                errores += 1
                print("=" * 70)
                print(f"ERROR — NO se ha escrito nada para {Path(f).name}:")
                print(res.mensaje)
                print("=" * 70)
            for a in res.avisos:
                print(f"AVISO: {a}")
            if not simular:
                escribir_log(cfg, f"{Path(f).name}: {res.estado.upper()}\n{res.mensaje}\n" + "\n".join(res.avisos))
                if res.estado in ("ignorado",):
                    datos = estado.leer(cfg)
                    datos["vistos"][estado.clave(Path(f))] = res.estado
                    estado.guardar(cfg, datos)
        return 1 if errores else 0


def vigilar_con_avisos() -> int:
    """Vigilancia en una ventana visible: cerrar la ventana = parar."""
    from . import avisos
    from .vigilancia import TITULO, vigilar

    try:
        cfg = cargar_configuracion()
    except ErrorConfiguracion as e:
        avisos.ventana_error(TITULO, f"La vigilancia NO se ha iniciado.\n\nError de configuración:\n{e}")
        return 1
    print("=" * 70)
    print(f" VIGILANCIA ACTIVA en {cfg.descargas}")
    print(" Cada PDF 'report - ...' nuevo se procesa automáticamente.")
    print(" Puedes minimizar esta ventana. Para PARAR la vigilancia, ciérrala.")
    print("=" * 70)
    try:
        vigilar(cfg)
        return 0
    except Ocupado:
        avisos.ventana_error(TITULO, "La vigilancia ya está en marcha en otra ventana.\nEsta se cerrará.")
        return 0
    except Exception:
        escribir_log(cfg, f"VIGILANCIA DETENIDA POR ERROR INESPERADO\n{traceback.format_exc()}")
        traceback.print_exc()
        avisos.ventana_error(TITULO, "La vigilancia se ha detenido por un error inesperado.\nRevisa la ventana y el log (carpeta registro\\logs).")
        return 1


def main(argv=None) -> int:
    for flujo in (sys.stdout, sys.stderr):
        try:
            flujo.reconfigure(encoding="utf-8")
        except (AttributeError, ValueError):
            pass
    ap = argparse.ArgumentParser(prog="divisor", description="Divide los PDF combinados de ediwin.")
    ap.add_argument("archivos", nargs="*", type=Path)
    ap.add_argument("--simular", action="store_true", help="muestra qué haría sin escribir nada")
    ap.add_argument("--vigilar", action="store_true", help="vigila Descargas y procesa automáticamente")
    ap.add_argument("--sin-total", action="store_true", help="no preguntar el Total de ediwin")
    ap.add_argument("--pausa", action="store_true", help="esperar Intro al terminar (para el .bat)")
    args = ap.parse_args(argv)

    if args.vigilar:
        return vigilar_con_avisos()

    codigo = 1
    try:
        cfg = cargar_configuracion()
        codigo = manual(cfg, args.archivos, args.simular, not args.sin_total)
    except ErrorConfiguracion as e:
        print(f"ERROR DE CONFIGURACIÓN: {e}")
    except Ocupado as e:
        print(str(e))
    except KeyboardInterrupt:
        print("\nCancelado. No se ha escrito nada del documento en curso.")
    except Exception:
        print("ERROR INESPERADO. Detalle técnico:")
        traceback.print_exc()
    if args.pausa:
        input("\nPulsa Intro para cerrar...")
    return codigo


if __name__ == "__main__":
    sys.exit(main())
