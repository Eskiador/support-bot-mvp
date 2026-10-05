"""Carga de configuración, tabla de clientes y plantillas de documento."""

from __future__ import annotations

import configparser
import re
import tomllib
from dataclasses import dataclass
from pathlib import Path, PureWindowsPath

CARPETA_HERRAMIENTA = Path(__file__).resolve().parent.parent


class ErrorConfiguracion(Exception):
    pass


@dataclass(frozen=True)
class Plantilla:
    id: str
    nombre: str
    tipo_registro: str
    titulo: str
    numero_doc: re.Pattern
    cabecera: re.Pattern
    permite_continuacion: bool
    emisor: re.Pattern
    fecha_documento: re.Pattern
    pedido: re.Pattern
    archivo: str


@dataclass(frozen=True)
class Configuracion:
    descargas: Path
    destino: Path
    procesados: Path
    registro: Path
    estado: Path
    patron_descargas: tuple[str, ...]
    prefijo: str
    longitud_maxima_nombre: int
    intervalo_segundos: float
    clientes: dict[str, str]
    plantillas: tuple[Plantilla, ...]


_CAMPOS_REGEX = {
    "numero_doc": "num",
    "cabecera": "pag",
    "emisor": None,
    "fecha_documento": "fecha",
    "pedido": "pedido",
}


def cargar_plantilla(ruta: Path) -> Plantilla:
    try:
        datos = tomllib.loads(ruta.read_text(encoding="utf-8-sig"))
    except (OSError, tomllib.TOMLDecodeError) as e:
        raise ErrorConfiguracion(f"No se puede leer la plantilla {ruta.name}: {e}") from e
    obligatorios = ["id", "nombre", "tipo_registro", "titulo", "permite_continuacion", *_CAMPOS_REGEX]
    faltan = [c for c in obligatorios if c not in datos]
    if faltan:
        raise ErrorConfiguracion(f"A la plantilla {ruta.name} le faltan los campos: {', '.join(faltan)}")
    regex = {}
    for campo, grupo in _CAMPOS_REGEX.items():
        try:
            patron = re.compile(datos[campo])
        except re.error as e:
            raise ErrorConfiguracion(f"Plantilla {ruta.name}, campo '{campo}': expresión no válida ({e})") from e
        if grupo and grupo not in patron.groupindex:
            raise ErrorConfiguracion(f"Plantilla {ruta.name}, campo '{campo}': falta el grupo (?P<{grupo}>...)")
        regex[campo] = patron
    if "num" not in regex["cabecera"].groupindex or "fecha" not in regex["cabecera"].groupindex:
        raise ErrorConfiguracion(f"Plantilla {ruta.name}, campo 'cabecera': necesita los grupos num, fecha y pag")
    return Plantilla(
        id=str(datos["id"]),
        nombre=str(datos["nombre"]),
        tipo_registro=str(datos["tipo_registro"]),
        titulo=str(datos["titulo"]),
        permite_continuacion=bool(datos["permite_continuacion"]),
        archivo=ruta.name,
        **regex,
    )


def cargar_plantillas(carpeta: Path) -> tuple[Plantilla, ...]:
    plantillas = tuple(cargar_plantilla(p) for p in sorted(carpeta.glob("*.toml")))
    if not plantillas:
        raise ErrorConfiguracion(f"No hay plantillas (*.toml) en {carpeta}")
    ids = [p.id for p in plantillas]
    titulos = [p.titulo for p in plantillas]
    if len(set(ids)) != len(ids) or len(set(titulos)) != len(titulos):
        raise ErrorConfiguracion("Hay dos plantillas con el mismo id o el mismo título")
    return plantillas


def gln_valido(gln: str) -> bool:
    """Comprueba el dígito de control GS1 de un GLN de 13 dígitos."""
    if not re.fullmatch(r"\d{13}", gln):
        return False
    suma = sum(int(d) * (3 if i % 2 else 1) for i, d in enumerate(gln[:12]))
    return (10 - suma % 10) % 10 == int(gln[12])


def cargar_clientes(ruta: Path) -> dict[str, str]:
    cp = configparser.ConfigParser(interpolation=None, delimiters=("=",))
    cp.optionxform = str
    try:
        cp.read_string(ruta.read_text(encoding="utf-8-sig"))
    except (OSError, configparser.Error) as e:
        raise ErrorConfiguracion(f"No se puede leer {ruta.name}: {e}") from e
    if not cp.has_section("clientes"):
        raise ErrorConfiguracion(f"{ruta.name} no tiene la sección [clientes]")
    clientes = {}
    for gln, nombre in cp.items("clientes"):
        gln, nombre = gln.strip(), nombre.strip()
        if not gln_valido(gln):
            raise ErrorConfiguracion(f"{ruta.name}: '{gln}' no es un GLN válido de 13 dígitos")
        if not nombre:
            raise ErrorConfiguracion(f"{ruta.name}: el GLN {gln} no tiene nombre")
        clientes[gln] = nombre
    return clientes


def _ruta(valor: str, base: Path) -> Path:
    valor = valor.strip()
    if PureWindowsPath(valor).is_absolute() or Path(valor).is_absolute():
        return Path(valor)
    return base / valor


def cargar_configuracion(carpeta: Path = CARPETA_HERRAMIENTA, **sustituir) -> Configuracion:
    """Lee configuracion.ini, clientes.ini y plantillas/*.toml de `carpeta`.

    `sustituir` permite cambiar valores (lo usan los tests)."""
    cp = configparser.ConfigParser(interpolation=None)
    try:
        cp.read_string((carpeta / "configuracion.ini").read_text(encoding="utf-8-sig"))
        r, a, v = cp["rutas"], cp["archivos"], cp["vigilancia"]
        valores = dict(
            descargas=_ruta(r["descargas"], carpeta),
            destino=_ruta(r["destino"], carpeta),
            procesados=_ruta(r["procesados"], carpeta),
            registro=_ruta(r["registro"], carpeta),
            estado=_ruta(r["estado"], carpeta),
            patron_descargas=tuple(p.strip() for p in a["patron_descargas"].split("|") if p.strip()),
            prefijo=a["prefijo"].strip(),
            longitud_maxima_nombre=a.getint("longitud_maxima_nombre"),
            intervalo_segundos=v.getfloat("intervalo_segundos"),
        )
    except (OSError, KeyError, ValueError, configparser.Error) as e:
        raise ErrorConfiguracion(f"Error en configuracion.ini: {e}") from e
    # El prefijo termina en "_": strip() no lo quita, pero sí espacios.
    valores["clientes"] = cargar_clientes(carpeta / "clientes.ini")
    valores["plantillas"] = cargar_plantillas(carpeta / "plantillas")
    valores.update(sustituir)
    return Configuracion(**valores)
