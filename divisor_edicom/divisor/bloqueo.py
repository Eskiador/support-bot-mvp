"""Bloqueo entre procesos: evita que la vigilancia y una ejecución manual
procesen a la vez. El sistema operativo lo libera si el proceso muere."""

from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path


class Ocupado(Exception):
    pass


@contextmanager
def bloqueo(ruta: Path):
    ruta.parent.mkdir(parents=True, exist_ok=True)
    f = open(ruta, "a+b")
    try:
        try:
            if os.name == "nt":
                import msvcrt

                f.seek(0)
                msvcrt.locking(f.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl

                fcntl.flock(f.fileno(), fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as e:
            raise Ocupado("Ya hay otra ejecución del divisor trabajando. Espera a que termine.") from e
        yield
    finally:
        f.close()
