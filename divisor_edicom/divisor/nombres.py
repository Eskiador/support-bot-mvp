"""Nombres de archivo: saneado para Windows y numeración que nunca se repite."""

from __future__ import annotations

import re
import unicodedata
from collections import defaultdict
from collections.abc import Iterable

PROHIBIDOS = re.compile(r'[<>:"/\\|?*\x00-\x1f]')
RESERVADOS = {"CON", "PRN", "AUX", "NUL", *(f"COM{i}" for i in range(1, 10)), *(f"LPT{i}" for i in range(1, 10))}


def sanear(nombre: str, longitud_maxima: int) -> str:
    """Quita caracteres prohibidos en Windows y limita la longitud."""
    nombre = unicodedata.normalize("NFC", nombre)
    nombre = PROHIBIDOS.sub(" ", nombre)
    nombre = re.sub(r"\s+", " ", nombre).strip(" .")
    nombre = nombre[:longitud_maxima].rstrip(" .")
    if not nombre:
        raise ValueError("El nombre de archivo queda vacío tras sanearlo.")
    if nombre.split(".")[0].upper() in RESERVADOS:
        nombre = "_" + nombre
    return nombre


def _clave(texto: str) -> str:
    # Windows no distingue mayúsculas ni (en la práctica) formas Unicode.
    return unicodedata.normalize("NFC", texto).casefold()


def numero_usado(archivo: str, base: str) -> int | None:
    """Si `archivo` es '<base>.pdf' devuelve 1; si es '<base> N.pdf', N; si no, None."""
    m = re.fullmatch(re.escape(_clave(base)) + r"(?: (\d+))?\.pdf", _clave(archivo))
    if not m:
        return None
    return int(m.group(1)) if m.group(1) else 1


def asignar_nombres(bases: list[str], existentes: Iterable[str]) -> list[str]:
    """Asigna el nombre final (con .pdf) a cada documento, en orden.

    `bases`: nombre base de cada documento (ya saneado, sin número ni .pdf).
    `existentes`: nombres de archivo ya usados (carpeta destino + registro).

    - Si un cliente no tiene archivos previos y llega 1 documento: sin número.
    - Si llegan varios: 1, 2, 3...
    - Si ya existen: se continúa desde el número más alto (el que no lleva
      número cuenta como 1). Nunca se reutiliza ni se renombra nada.
    """
    existentes = list(existentes)
    cuantos = defaultdict(int)
    for b in bases:
        cuantos[_clave(b)] += 1
    maximo = {}
    for b in bases:
        k = _clave(b)
        if k not in maximo:
            usados = [n for a in existentes if (n := numero_usado(a, b)) is not None]
            maximo[k] = max(usados, default=0)
    siguiente = {}
    nombres = []
    for b in bases:
        k = _clave(b)
        if maximo[k] == 0 and cuantos[k] == 1:
            nombres.append(f"{b}.pdf")
            continue
        n = siguiente.get(k, maximo[k] + 1)
        siguiente[k] = n + 1
        nombres.append(f"{b} {n}.pdf")
    if len({_clave(n) for n in nombres}) != len(nombres):
        raise ValueError("Error interno: dos documentos recibirían el mismo nombre.")
    return nombres
