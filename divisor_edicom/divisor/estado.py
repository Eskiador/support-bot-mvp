"""Qué PDFs de Descargas están pendientes.

Al usarse por primera vez se anota la fecha de "instalación": los PDFs
descargados antes se ignoran (ya se archivaron a mano)."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from .configuracion import Configuracion


def _ruta(cfg: Configuracion) -> Path:
    return cfg.estado / "estado.json"


def leer(cfg: Configuracion) -> dict:
    ruta = _ruta(cfg)
    try:
        datos = json.loads(ruta.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        datos = {}
    if "desde" not in datos:
        datos = {"desde": datetime.now().timestamp(), "vistos": {}}
        guardar(cfg, datos)
    datos.setdefault("vistos", {})
    return datos


def guardar(cfg: Configuracion, datos: dict) -> None:
    cfg.estado.mkdir(parents=True, exist_ok=True)
    temporal = _ruta(cfg).with_suffix(".tmp")
    temporal.write_text(json.dumps(datos, ensure_ascii=False, indent=1), encoding="utf-8")
    os.replace(temporal, _ruta(cfg))


def clave(archivo: Path) -> str:
    st = archivo.stat()
    return f"{archivo.name}|{st.st_size}|{st.st_mtime_ns}"


def candidatos(cfg: Configuracion, datos: dict) -> list[Path]:
    """PDFs de ediwin en Descargas descargados después de la instalación."""
    res = []
    for f in cfg.descargas.glob(cfg.patron_descargas):
        try:
            if f.is_file() and f.stat().st_mtime >= datos["desde"]:
                res.append(f)
        except OSError:
            continue
    return sorted(res, key=lambda f: f.stat().st_mtime)


def anteriores(cfg: Configuracion, datos: dict) -> int:
    return sum(1 for f in cfg.descargas.glob(cfg.patron_descargas) if f.stat().st_mtime < datos["desde"])
