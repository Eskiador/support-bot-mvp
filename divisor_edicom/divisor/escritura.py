"""Escritura segura: se genera y valida todo en local; después se coloca en el
destino de red de forma que, si algo falla, se deshace lo colocado."""

from __future__ import annotations

import hashlib
import os
import shutil
import uuid
from pathlib import Path

from pypdf import PdfReader, PdfWriter

from .analisis import Analisis, ErrorDivision, leer_paginas


class ErrorEscritura(Exception):
    pass


def _sha256(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def generar(analisis: Analisis, nombres: list[str], carpeta: Path) -> list[Path]:
    """Escribe un PDF por documento en `carpeta` (local) copiando las páginas
    originales tal cual, y valida cada uno releyéndolo."""
    carpeta.mkdir(parents=True, exist_ok=True)
    lector = PdfReader(analisis.archivo)
    if len(lector.pages) != analisis.total_paginas:
        raise ErrorDivision("pypdf y pdfplumber no ven el mismo número de páginas en el combinado.")
    rutas = []
    for doc, nombre in zip(analisis.documentos, nombres, strict=True):
        escritor = PdfWriter()
        for n in doc.paginas:
            escritor.add_page(lector.pages[n - 1])
        ruta = carpeta / nombre
        with open(ruta, "wb") as f:
            escritor.write(f)
        rutas.append(ruta)

    # Validaciones del resultado
    total = 0
    for doc, ruta in zip(analisis.documentos, rutas, strict=True):
        textos = leer_paginas(ruta)
        if len(textos) != len(doc.paginas):
            raise ErrorDivision(f"{ruta.name}: tiene {len(textos)} páginas y debería tener {len(doc.paginas)}.")
        for i, n in enumerate(doc.paginas):
            if textos[i] != analisis.textos[n - 1]:
                raise ErrorDivision(f"{ruta.name}: la página {i + 1} no es idéntica a la página {n} del combinado.")
        total += len(textos)
    if total != analisis.total_paginas:
        raise ErrorDivision(
            f"La suma de páginas generadas ({total}) no coincide con el combinado ({analisis.total_paginas})."
        )
    return rutas


def _mover_sin_sobrescribir(origen: Path, final: Path) -> None:
    if os.name == "nt":
        os.rename(origen, final)  # en Windows falla si `final` ya existe
    else:
        os.link(origen, final)  # falla si `final` ya existe
        os.unlink(origen)


def deshacer(colocados: list[tuple[Path, str]]) -> list[str]:
    """Borra los archivos colocados (solo si siguen siendo los nuestros).
    Devuelve los que no se pudieron borrar."""
    fallos = []
    for ruta, huella in reversed(colocados):
        try:
            if ruta.exists() and _sha256(ruta) == huella:
                ruta.unlink()
        except OSError:
            fallos.append(str(ruta))
    return fallos


def colocar(locales: list[Path], destino: Path) -> list[tuple[Path, str]]:
    """Copia los PDFs al destino. O se colocan todos o ninguno.

    Devuelve [(ruta_final, sha256)] para poder deshacer si falla un paso posterior."""
    if not destino.is_dir():
        raise ErrorEscritura(f"No se puede acceder a la carpeta destino '{destino}'. ¿Hay conexión a la red/VPN?")
    for ruta in locales:
        if (destino / ruta.name).exists():
            raise ErrorEscritura(f"Ya existe '{ruta.name}' en el destino (lo ha creado alguien mientras tanto).")
        if len(str(destino / ruta.name)) > 255:
            raise ErrorEscritura(f"La ruta completa de '{ruta.name}' supera la longitud que admite Windows.")

    temporal = destino / f".divisor_tmp_{uuid.uuid4().hex[:8]}"
    colocados: list[tuple[Path, str]] = []
    try:
        temporal.mkdir()
        huellas = {}
        for ruta in locales:
            copia = temporal / ruta.name
            shutil.copyfile(ruta, copia)
            huellas[ruta.name] = _sha256(ruta)
            if _sha256(copia) != huellas[ruta.name]:
                raise ErrorEscritura(f"La copia de '{ruta.name}' en la red no es idéntica a la original.")
        for ruta in locales:
            final = destino / ruta.name
            _mover_sin_sobrescribir(temporal / ruta.name, final)
            colocados.append((final, huellas[ruta.name]))
        return colocados
    except Exception as e:
        no_borrados = deshacer(colocados)
        aviso = f" ATENCIÓN: no se pudieron retirar: {no_borrados}" if no_borrados else ""
        if isinstance(e, ErrorEscritura):
            raise ErrorEscritura(f"{e} No se ha dejado nada en el destino.{aviso}") from e
        raise ErrorEscritura(f"Error al copiar a '{destino}': {e}. No se ha dejado nada en el destino.{aviso}") from e
    finally:
        shutil.rmtree(temporal, ignore_errors=True)
