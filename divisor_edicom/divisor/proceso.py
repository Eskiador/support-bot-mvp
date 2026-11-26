"""Procesa un PDF combinado de principio a fin."""

from __future__ import annotations

import os
import shutil
import tempfile
import unicodedata
from collections.abc import Callable
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path

from .analisis import Analisis, ErrorDivision, NoEsConfirmacion, analizar
from .configuracion import Configuracion
from .escritura import ErrorEscritura, colocar, deshacer, generar
from .nombres import asignar_nombres, sanear
from .registro import ErrorRegistro, Registro

ERRORES_CONTROLADOS = (ErrorDivision, ErrorEscritura, ErrorRegistro)


@dataclass
class Resultado:
    archivo: Path
    estado: str  # "ok", "simulado", "ignorado", "error"
    mensaje: str = ""
    filas: list[dict] = field(default_factory=list)
    avisos: list[str] = field(default_factory=list)


def tabla(filas: list[dict]) -> str:
    cab = ["#", "Archivo", "Nº doc", "Origen (emisor)", "Págs", "Págs. combinado"]
    datos = [
        [str(i), f["archivo"], f["num_doc"], f["cliente"], str(f["paginas"]), f["rango"]]
        for i, f in enumerate(filas, 1)
    ]
    anchos = [max(len(x) for x in col) for col in zip(cab, *datos)]
    linea = lambda vals: "  ".join(v.ljust(a) for v, a in zip(vals, anchos))
    sep = "  ".join("-" * a for a in anchos)
    return "\n".join([linea(cab), sep, *(linea(d) for d in datos)])


def _rango(paginas: list[int]) -> str:
    return str(paginas[0]) if len(paginas) == 1 else f"{paginas[0]}-{paginas[-1]}"


def _nombres(analisis: Analisis, cfg: Configuracion, existentes: list[str]) -> list[str]:
    try:
        bases = [sanear(cfg.prefijo + d.nombre_cliente, cfg.longitud_maxima_nombre) for d in analisis.documentos]
        return asignar_nombres(bases, existentes)
    except ValueError as e:
        raise ErrorDivision(str(e)) from e


def procesar(
    archivo: Path,
    cfg: Configuracion,
    simular: bool = False,
    pedir_total: Callable[[int], int] | None = None,
    salida: Callable[[str], None] = print,
) -> Resultado:
    try:
        return _procesar(archivo, cfg, simular, pedir_total, salida)
    except NoEsConfirmacion as e:
        return Resultado(archivo, "ignorado", str(e))
    except ERRORES_CONTROLADOS as e:
        return Resultado(archivo, "error", str(e))


def _procesar(archivo, cfg, simular, pedir_total, salida) -> Resultado:
    salida(f"\nAnalizando: {archivo.name}")
    analisis = analizar(archivo, cfg)
    docs = analisis.documentos

    registro = Registro(cfg.registro)
    if not simular:
        registro.comprobar_escribible()
    previas = registro.leer()

    # ¿Ya procesado otro día? Mismo cliente y Nº, y mismo contenido (huella).
    # Las filas antiguas del registro no tienen huella: con ellas basta el Nº.
    repetidos, avisos = [], []
    for d in docs:
        anteriores = [p for p in previas if (p.gln, p.num_doc) == (d.gln, d.num_doc)]
        iguales = [p for p in anteriores if p.huella in ("", d.huella)]
        if iguales:
            p = iguales[0]
            repetidos.append(f"Nº {d.num_doc} ({d.nombre_cliente}): ya se guardó como '{p.archivo}' el {p.fecha_proceso}")
        elif anteriores:
            avisos.append(
                f"El Nº {d.num_doc} ({d.nombre_cliente}) ya existía ('{anteriores[0].archivo}') pero con otro "
                "contenido: se guarda como documento distinto."
            )
    if repetidos:
        raise ErrorDivision("Documentos ya procesados anteriormente:\n  - " + "\n  - ".join(repetidos))

    try:
        en_destino = os.listdir(cfg.destino)
    except OSError as e:
        if not simular:
            raise ErrorEscritura(
                f"No se puede acceder a la carpeta destino '{cfg.destino}'. ¿Hay conexión a la red/VPN? ({e})"
            ) from e
        en_destino = []
        avisos.append(f"No se puede acceder al destino '{cfg.destino}': la numeración no tiene en cuenta lo que haya allí.")
    usados = en_destino + [p.archivo for p in previas]
    nombres = _nombres(analisis, cfg, usados)
    # Comprobación final: cada nombre es único e irrepetible (ni en el lote,
    # ni en la carpeta destino, ni en ningún proceso anterior del registro).
    clave = lambda n: unicodedata.normalize("NFC", n).casefold()
    ocupados = {clave(n) for n in usados}
    if len({clave(n) for n in nombres}) != len(nombres) or any(clave(n) in ocupados for n in nombres):
        raise ErrorDivision("Error interno: un nombre de archivo ya estaba usado. No se ha escrito nada.")
    avisos = analisis.avisos + avisos

    filas = [
        dict(
            archivo=n,
            num_doc=d.num_doc,
            cliente=d.origen,
            gln=d.gln,
            tipo=d.tipo,
            fecha_documento=d.fecha_documento,
            pedido=d.pedido or "",
            paginas=len(d.paginas),
            rango=_rango(d.paginas),
            huella=d.huella,
        )
        for d, n in zip(docs, nombres, strict=True)
    ]
    salida(f"{len(docs)} documentos en {analisis.total_paginas} páginas:\n{tabla(filas)}")

    if simular:
        return Resultado(archivo, "simulado", f"Simulación: se generarían {len(docs)} PDFs. No se ha escrito nada.", filas, avisos)

    if pedir_total is not None:
        total = pedir_total(len(docs))
        if total != len(docs):
            raise ErrorDivision(
                f"El Total de ediwin ({total}) no coincide con los documentos encontrados ({len(docs)}). "
                "No se ha escrito nada. Revisa la selección en ediwin."
            )

    ahora = datetime.now()
    with tempfile.TemporaryDirectory(prefix="divisor_") as tmp:
        locales = generar(analisis, nombres, Path(tmp))
        colocados = colocar(locales, cfg.destino)
        try:
            temporal = registro.preparar(
                [
                    [
                        ahora.strftime("%Y-%m-%d %H:%M:%S"),
                        f["archivo"],
                        f["num_doc"],
                        f["cliente"],
                        f["gln"],
                        f["tipo"],
                        f["fecha_documento"],
                        f["pedido"],
                        f["paginas"],
                        f["rango"],
                        archivo.name,
                        str(cfg.destino),
                        f["huella"],
                    ]
                    for f in filas
                ]
            )
            registro.confirmar(temporal)
        except Exception as e:
            no_borrados = deshacer(colocados)
            extra = f" ATENCIÓN: no se pudieron retirar del destino: {no_borrados}" if no_borrados else ""
            raise ErrorRegistro(f"{e} Se han retirado los PDFs del destino; no ha quedado nada a medias.{extra}") from e

    try:
        cfg.procesados.mkdir(parents=True, exist_ok=True)
        shutil.move(str(archivo), str(cfg.procesados / f"{ahora:%Y-%m-%d_%H%M%S}_{archivo.name}"))
    except OSError as e:
        avisos.append(f"Los PDFs están guardados, pero no se pudo mover el combinado a '{cfg.procesados}': {e}")

    return Resultado(archivo, "ok", f"{len(docs)} PDFs guardados en {cfg.destino}", filas, avisos)


def escribir_log(cfg: Configuracion, texto: str) -> Path | None:
    try:
        carpeta = cfg.registro / "logs"
        carpeta.mkdir(parents=True, exist_ok=True)
        ruta = carpeta / f"{datetime.now():%Y-%m-%d}.txt"
        with open(ruta, "a", encoding="utf-8") as f:
            f.write(f"===== {datetime.now():%Y-%m-%d %H:%M:%S}\n{texto}\n\n")
        return ruta
    except OSError:
        return None
