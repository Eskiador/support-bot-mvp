"""Construye el ZIP portable para Windows: Python 3.12 + librerías + herramienta.

Uso:  python herramientas/construir_portable.py [carpeta_salida]

No necesita Windows: descarga un Python portable oficial para Windows
(python-build-standalone) y las librerías en su versión para Windows.
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
import tarfile
import urllib.request
import zipfile
from pathlib import Path

PYTHON_URL = (
    "https://github.com/astral-sh/python-build-standalone/releases/download/20250409/"
    "cpython-3.12.10+20250409-x86_64-pc-windows-msvc-install_only_stripped.tar.gz"
)

RAIZ = Path(__file__).resolve().parent.parent
NOMBRE = "DivisorEDICOM"
INCLUIR = [
    "divisor",
    "plantillas",
    "clientes.ini",
    "configuracion.ini",
    "requirements.txt",
    "Procesar.bat",
    "Simular.bat",
    "Vigilar.bat",
    "Detener_vigilancia.bat",
    "Activar_inicio_con_Windows.bat",
    "Desactivar_inicio_con_Windows.bat",
]


def main() -> None:
    salida = Path(sys.argv[1] if len(sys.argv) > 1 else RAIZ / "dist").resolve()
    destino = salida / NOMBRE
    if destino.exists():
        shutil.rmtree(destino)
    destino.mkdir(parents=True)

    tar = salida / "python-windows.tar.gz"
    if not tar.exists():
        print("Descargando Python portable para Windows...")
        urllib.request.urlretrieve(PYTHON_URL, tar)
    huella = hashlib.sha256(tar.read_bytes()).hexdigest()
    with tarfile.open(tar) as t:
        t.extractall(destino)  # crea destino/python/
    assert (destino / "python" / "python.exe").exists()

    print("Instalando librerías (versión Windows)...")
    subprocess.run(
        [
            sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check",
            "--target", str(destino / "python" / "Lib" / "site-packages"),
            "--platform", "win_amd64", "--python-version", "3.12", "--implementation", "cp",
            "--only-binary=:all:", "--upgrade",
            "-r", str(RAIZ / "requirements.txt"),
        ],
        check=True,
    )

    # Fuera lo que la herramienta no usa (el ZIP debe pesar menos de 30 MB).
    py = destino / "python"
    for sobrante in [
        "tcl", "include", "libs", "Lib/tkinter", "Lib/idlelib", "Lib/turtledemo", "Lib/ensurepip",
        "Lib/lib2to3", "Lib/pydoc_data", "Lib/site-packages/pip", "Lib/venv",
    ]:
        shutil.rmtree(py / sobrante, ignore_errors=True)
    for patron in ["DLLs/_tkinter.pyd", "DLLs/tcl*.dll", "DLLs/tk*.dll", "DLLs/_test*.pyd", "Lib/site-packages/pip-*",
                   "Lib/site-packages/PIL/_avif*.pyd", "DLLs/sqlite3.dll", "DLLs/_sqlite3.pyd"]:
        for f in py.glob(patron):
            shutil.rmtree(f) if f.is_dir() else f.unlink()

    for nombre in INCLUIR:
        origen = RAIZ / nombre
        if origen.is_dir():
            shutil.copytree(origen, destino / nombre, ignore=shutil.ignore_patterns("__pycache__"))
        else:
            shutil.copy2(origen, destino / nombre)
    shutil.copy2(RAIZ / "README.md", destino / "LEEME.txt")
    (destino / "VERSION.txt").write_text(
        f"Python: {PYTHON_URL}\nSHA256: {huella}\nLibrerías: {(RAIZ / 'requirements.txt').read_text()}",
        encoding="utf-8",
    )

    zip_ruta = salida / f"{NOMBRE}.zip"
    with zipfile.ZipFile(zip_ruta, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(destino.rglob("*")):
            if f.is_file() and "__pycache__" not in f.parts:
                z.write(f, f.relative_to(salida))
    print(f"Creado: {zip_ruta} ({zip_ruta.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
