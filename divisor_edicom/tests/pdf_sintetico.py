"""Generador mínimo de PDFs con texto, para casos límite de los tests."""

from __future__ import annotations

from io import BytesIO
from pathlib import Path

from pypdf import PdfReader, PdfWriter


def _cadena(texto: str) -> bytes:
    b = texto.encode("cp1252")
    return b"(" + b.replace(b"\\", b"\\\\").replace(b"(", b"\\(").replace(b")", b"\\)") + b")"


def pdf_bytes(paginas: list[list[str]]) -> bytes:
    """PDF con una página por lista de líneas (Helvetica, WinAnsi). Lista vacía = página en blanco."""
    objetos: list[bytes] = []

    def nuevo(contenido: bytes) -> int:
        objetos.append(contenido)
        return len(objetos)

    fuente = nuevo(b"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>")
    nodo_paginas = nuevo(b"")  # se rellena al final
    hijos = []
    for lineas in paginas:
        flujo = b"BT /F1 9 Tf 12 TL 40 800 Td " + b"".join(_cadena(l) + b" Tj T* " for l in lineas) + b"ET"
        contenido = nuevo(b"<< /Length %d >>\nstream\n" % len(flujo) + flujo + b"\nendstream")
        hijos.append(
            nuevo(
                b"<< /Type /Page /Parent %d 0 R /MediaBox [0 0 595 842] "
                b"/Resources << /Font << /F1 %d 0 R >> >> /Contents %d 0 R >>" % (nodo_paginas, fuente, contenido)
            )
        )
    objetos[nodo_paginas - 1] = b"<< /Type /Pages /Kids [%s] /Count %d >>" % (
        b" ".join(b"%d 0 R" % h for h in hijos),
        len(hijos),
    )
    catalogo = nuevo(b"<< /Type /Catalog /Pages %d 0 R >>" % nodo_paginas)

    salida = BytesIO()
    salida.write(b"%PDF-1.4\n")
    posiciones = []
    for i, obj in enumerate(objetos, 1):
        posiciones.append(salida.tell())
        salida.write(b"%d 0 obj\n" % i + obj + b"\nendobj\n")
    xref = salida.tell()
    salida.write(b"xref\n0 %d\n0000000000 65535 f \n" % (len(objetos) + 1))
    for p in posiciones:
        salida.write(b"%010d 00000 n \n" % p)
    salida.write(b"trailer\n<< /Size %d /Root %d 0 R >>\nstartxref\n%d\n%%%%EOF\n" % (len(objetos) + 1, catalogo, xref))
    return salida.getvalue()


def escribir_pdf(ruta: Path, paginas: list[list[str]]) -> Path:
    ruta.write_bytes(pdf_bytes(paginas))
    return ruta


def montar(ruta: Path, piezas: list[tuple[Path | bytes, int]]) -> Path:
    """Crea un PDF con páginas tomadas de otros PDFs: [(origen, índice_0), ...].
    `origen` puede ser una ruta o los bytes de un PDF sintético."""
    escritor = PdfWriter()
    lectores = {}
    for origen, indice in piezas:
        clave = origen if isinstance(origen, Path) else id(origen)
        if clave not in lectores:
            lectores[clave] = PdfReader(origen if isinstance(origen, Path) else BytesIO(origen))
        escritor.add_page(lectores[clave].pages[indice])
    with open(ruta, "wb") as f:
        escritor.write(f)
    return ruta


def pagina_mercadona(num: str, contador: int, fecha_gen: str = "05/10/2026 10:22", gln: str = "8480000009609") -> list[str]:
    """Página de inicio sintética con la estructura de la plantilla B."""
    return [
        f"Nº. Confirmación: {num} {fecha_gen} Página {contador}",
        "Confirmación de Recepción de Mercancías",
        f"Número de documento: {num}",
        "Fecha documento 02/10/2026 Fecha recogida carga 29/09/2026 Fecha recep. merc. 01/10/2026",
        f"Emisor Mensaje {gln} 0960 - RIBARROJA SECOS",
        "Nº. albarán 80396236 Nº. pedido 03078232",
    ]
