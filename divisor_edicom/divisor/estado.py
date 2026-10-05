"""Qué PDFs de Descargas están pendientes.

Modo manual: todos los PDF de ediwin que haya en Descargas (los ya
procesados se mueven a _procesados, así que no vuelven a aparecer).
Vigilancia: solo los descargados después de la primera ejecución."""

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


def descargas_ediwin(cfg: Configuracion) -> list[Path]:
    """PDFs de Descargas con nombre de descarga de ediwin, del más antiguo al más nuevo."""
    vistos: dict[str, Path] = {}
    for patron in cfg.patron_descargas:
        for f in cfg.descargas.glob(patron):
            vistos[str(f).lower()] = f
    res = []
    for f in vistos.values():
        try:
            if f.is_file():
                res.append((f.stat().st_mtime, f))
        except OSError:
            continue
    return [f for _, f in sorted(res, key=lambda x: x[0])]


def candidatos(cfg: Configuracion, datos: dict) -> list[Path]:
    """Para la vigilancia: los descargados después de la primera ejecución."""
    res = []
    for f in descargas_ediwin(cfg):
        try:
            if f.stat().st_mtime >= datos["desde"]:
                res.append(f)
        except OSError:
            continue
    return res
