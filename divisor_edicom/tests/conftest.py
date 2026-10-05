import shutil
import sys
from pathlib import Path

import pytest

RAIZ = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(RAIZ))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from divisor.configuracion import cargar_configuracion  # noqa: E402

EJEMPLOS = RAIZ / "ejemplos"
COMBINADO_1 = EJEMPLOS / "lote1" / "report - 2026-10-05T120721.750.pdf"
COMBINADO_2 = EJEMPLOS / "lote2" / "report - 2026-10-05T122235.677.pdf"


@pytest.fixture
def cfg(tmp_path):
    """Configuración real (clientes y plantillas) con carpetas temporales."""
    for d in ("descargas", "destino"):
        (tmp_path / d).mkdir()
    return cargar_configuracion(
        descargas=tmp_path / "descargas",
        destino=tmp_path / "destino",
        procesados=tmp_path / "procesados",
        registro=tmp_path / "registro",
        estado=tmp_path / "estado",
        intervalo_segundos=0,
    )


@pytest.fixture
def descargar(cfg):
    """Copia un PDF a la carpeta Descargas de prueba y devuelve su ruta."""

    def _descargar(origen: Path, nombre: str | None = None) -> Path:
        destino = cfg.descargas / (nombre or origen.name)
        shutil.copy(origen, destino)
        return destino

    return _descargar


def contenido(carpeta: Path) -> list[str]:
    return sorted(p.name for p in carpeta.iterdir()) if carpeta.exists() else []
