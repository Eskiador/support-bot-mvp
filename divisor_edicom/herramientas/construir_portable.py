"""Construye el ZIP portable para Windows.

Uso:  python herramientas/construir_portable.py [carpeta_salida]

Contenido:
- Python 3.12 "embeddable" OFICIAL de python.org (binarios firmados por la
  Python Software Foundation; vcruntime firmado por Microsoft).
- pypdf y openpyxl: librerías escritas solo en Python (ningún .exe/.dll/.pyd).
- La herramienta y sus .bat.
- HUELLAS.txt: SHA256 de todos los archivos, para que Informática los verifique.
"""

from __future__ import annotations

import hashlib
import shutil
import subprocess
import sys
import urllib.request
import zipfile
from pathlib import Path

PYTHON_VERSION = "3.12.10"
PYTHON_URL = f"https://www.python.org/ftp/python/{PYTHON_VERSION}/python-{PYTHON_VERSION}-embed-amd64.zip"

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
    "NOTA_PARA_INFORMATICA.md",
]
BINARIOS = {".exe", ".dll", ".pyd"}


def sha256(ruta: Path) -> str:
    return hashlib.sha256(ruta.read_bytes()).hexdigest()


def main() -> None:
    salida = Path(sys.argv[1] if len(sys.argv) > 1 else RAIZ / "dist").resolve()
    destino = salida / NOMBRE
    if destino.exists():
        shutil.rmtree(destino)
    py = destino / "python"
    py.mkdir(parents=True)

    zip_python = salida / f"python-{PYTHON_VERSION}-embed-amd64.zip"
    if not zip_python.exists():
        print(f"Descargando {PYTHON_URL}")
        urllib.request.urlretrieve(PYTHON_URL, zip_python)
    with zipfile.ZipFile(zip_python) as z:
        z.extractall(py)
    assert (py / "python.exe").exists()

    # Rutas de Python: sus librerías, las nuestras y la carpeta de la herramienta
    # (el archivo ._pth hace que Python ignore variables de entorno: aislado).
    pth = next(py.glob("python3*._pth"))
    zip_std = next(py.glob("python3*.zip")).name
    pth.write_text(f"{zip_std}\n.\nLib\\site-packages\n..\n", encoding="ascii")

    print("Instalando pypdf y openpyxl...")
    subprocess.run(
        [
            sys.executable, "-m", "pip", "install", "--quiet", "--disable-pip-version-check",
            "--no-compile", "--target", str(py / "Lib" / "site-packages"),
            "--platform", "win_amd64", "--python-version", "3.12", "--implementation", "cp",
            "--only-binary=:all:", "-r", str(RAIZ / "requirements.txt"),
        ],
        check=True,
    )
    extra = [f for f in (py / "Lib").rglob("*") if f.suffix.lower() in BINARIOS]
    if extra:
        raise SystemExit(f"Las librerías han traído binarios compilados y no deberían: {extra}")

    for nombre in INCLUIR:
        origen = RAIZ / nombre
        if origen.is_dir():
            shutil.copytree(origen, destino / nombre, ignore=shutil.ignore_patterns("__pycache__"))
        else:
            shutil.copy2(origen, destino / nombre)
    shutil.copy2(RAIZ / "README.md", destino / "LEEME.txt")

    archivos = sorted(f for f in destino.rglob("*") if f.is_file())
    huellas = [f"{sha256(f)}  {f.relative_to(destino).as_posix()}" for f in archivos]
    (destino / "HUELLAS.txt").write_text(
        f"Divisor EDICOM - huellas SHA256 de todos los archivos\n"
        f"Python oficial: {PYTHON_URL}\n"
        f"SHA256 del paquete de Python descargado: {sha256(zip_python)}\n\n" + "\n".join(huellas) + "\n",
        encoding="utf-8",
    )
    print("Ejecutables y bibliotecas incluidos:")
    for f in archivos:
        if f.suffix.lower() in BINARIOS:
            print(f"  {f.relative_to(destino).as_posix()}")

    zip_ruta = salida / f"{NOMBRE}.zip"
    with zipfile.ZipFile(zip_ruta, "w", zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for f in sorted(destino.rglob("*")):
            if f.is_file():
                z.write(f, f.relative_to(salida))
    print(f"Creado: {zip_ruta} ({zip_ruta.stat().st_size / 1e6:.1f} MB)")


if __name__ == "__main__":
    main()
