#!/usr/bin/env python3
"""
Genera PDF sintéticos que replican formatos de cargo vistos en producción,
para poder tenerlos en las pruebas sin subir documentos de clientes reales.

    CASOS=/ruta/a/mis/casos python3 pruebas/generar_casos_sinteticos.py

Ahora mismo genera el par del perfil «Alcampo»: el cargo expresa la diferencia
en DOS renglones por artículo (lo facturado en positivo, lo correcto en
negativo, con el signo DETRÁS del número) y declara a la vez la base imponible
y el total con IVA.
"""
import os
import sys

BASE = os.environ.get("CASOS") or os.path.join(os.path.dirname(__file__), "..", "..", "casos-reales")


def pdf(lineas_posicionadas, destino, fuente="Courier"):
    """lineas_posicionadas: lista de (x, y, texto)."""
    partes = []
    for x, y, s in lineas_posicionadas:
        s = s.replace("\\", "\\\\").replace("(", "\\(").replace(")", "\\)")
        partes.append(f"BT /F1 8 Tf {x} {y} Td ({s}) Tj ET")
    flujo = "\n".join(partes).encode("latin-1", "replace")

    objs = [
        b"<< /Type /Catalog /Pages 2 0 R >>",
        b"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
        b"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 842 842] "
        b"/Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
        b"<< /Type /Font /Subtype /Type1 /BaseFont /" + fuente.encode()
        + b" /Encoding /WinAnsiEncoding >>",
        b"<< /Length " + str(len(flujo)).encode() + b" >>\nstream\n" + flujo + b"\nendstream",
    ]
    out = b"%PDF-1.4\n"
    offs = []
    for i, o in enumerate(objs, 1):
        offs.append(len(out))
        out += str(i).encode() + b" 0 obj\n" + o + b"\nendobj\n"
    xref = len(out)
    out += b"xref\n0 " + str(len(objs) + 1).encode() + b"\n0000000000 65535 f \n"
    for o in offs:
        out += ("%010d 00000 n \n" % o).encode()
    out += (b"trailer\n<< /Size " + str(len(objs) + 1).encode() + b" /Root 1 0 R >>\n"
            b"startxref\n" + str(xref).encode() + b"\n%%EOF")
    with open(destino, "wb") as fh:
        fh.write(out)
    return destino


def cargo_tipo_alcampo():
    lineas = [
        "**** DIRECCION SOCIAL ****            ***** NOTA DE CARGO *****",
        "CLIENTE DE PRUEBA S.A. NIF: ESA00000000",
        "CALLE MAYOR S/N",
        "28029  MADRID",
        "          EMISOR                                RECEPTOR",
        "                     (COD 155) UC:069      NIF: ESB56398357",
        "CENTRO APROVIS Y DISTRIBUCION              A.CAMACHO FOODS SOCIEDAD LIMITADA",
        "",
        "  REF./PROV.   FECHA EMISION  Nº PEDIDO  Nº ALBARAN   Nº FACTURA  FE.INCORPORAC.",
        "  0085465      16/01/2026     960454     0            098017625   16/01/2026",
        "",
        "| Lin |   Código    | |     Descripcion            |    |UM| | Tasa | | Importe | |  Total  |",
        "-------------------------------------------------------------------------------------------",
        "   1  8410134028337  F-MERMELADA NARANJA LIMON Y LIMA  FR 2   80,00 KG   10      5,043    403,44",
        "   2  8410134028337  F-MERMELADA NARANJA LIMON Y LIMA  FR 2   80,00- KG  10      2,369    189,52-",
        "   3  8410134028344  F-MERMELADA FRESA Y MENTA  FR 263 ML 2   24,00 KG   10      5,238    125,71",
        "   4  8410134028344  F-MERMELADA FRESA Y MENTA  FR 263 ML 2   24,00- KG  10      2,462     59,09-",
        "",
        "      Impuestos                              Descuentos Globales",
        "  Imp  Tarifa     Base      Cuota",
        "  IVA  10,00     280,54     28,05",
        "",
        "      Vencimientos                           TOTALES FACTURA",
        "  Primer Vto.        0,00        Moneda...... EUR",
        "  Segundo Vto.       0,00        Importe Neto: . :          308,59",
        "  Tercer Vto.        0,00        Total cargos: . :            0,00",
        "  Cuarto Vto.        0,00        Total Descuentos:            0,00",
        "                                 Base Imponible: :          280,54",
        "                                 Total Impuestos : . . :      28,05",
        "                                 Total Factura:  :          308,59",
        "",
        "      Observaciones",
        "  Nota de cargo sobre su factura nº 509000271 de fecha 13-01-2026",
        "  por diferencia en precios y/o cantidades",
    ]
    y = 800
    pos = []
    for l in lineas:
        pos.append((30, y, l))
        y -= 13
    return pdf(pos, os.path.join(BASE, "CARGO_TIPO_ALCAMPO.pdf"))


def factura_tipo_alcampo():
    """Formato de nuestro SAP: cada columna en su posición."""
    pos = []
    y = 800
    pos += [(14, y, "FACTURA"), (300, y, "FACTURA Nº")]
    y -= 14
    pos += [(300, y, "509000271")]
    y -= 14
    pos += [(300, y, "FECHA FACT.")]
    y -= 14
    pos += [(300, y, "16.01.2026")]
    y -= 24
    for x, t in [(14, "LIN."), (43, "CÓDIGO"), (82, "UC/US"), (193, "PRODUCTO"),
                 (327, "CANT."), (361, "UD"), (451, "PRECIO"), (513, "IMPORTE")]:
        pos.append((x, y, t))
    y -= 16
    for lin, mat, uc, desc, cant, um, precio, importe in [
        ("220", "2013655", "6", "MERMELADA FRESA Y MENTA FR 263 ML", "24,000", "UC", "5,2380", "125,71"),
        ("230", "2013654", "6", "MERMELADA NARANJA LIMON Y LIMA FR", "80,000", "UC", "5,0430", "403,44"),
    ]:
        pos += [(14, y, lin), (35, y, mat), (84, y, uc), (107, y, desc),
                (318, y, cant), (359, y, um), (451, y, precio), (519, y, importe)]
        y -= 12
        pos.append((107, y, "CLIENTE DE PRUEBA"))
        y -= 18
    y -= 20
    pos += [(300, y, "SUBTOTAL"), (500, y, "529,15")]
    return pdf(pos, os.path.join(BASE, "FACTURA_TIPO_ALCAMPO.pdf"), fuente="Helvetica")


if __name__ == "__main__":
    if not os.path.isdir(BASE):
        print(f"No existe la carpeta de casos: {BASE}", file=sys.stderr)
        sys.exit(1)
    for f in (cargo_tipo_alcampo(), factura_tipo_alcampo()):
        print("escrito", f)
