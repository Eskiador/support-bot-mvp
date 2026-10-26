"""Cruce de observaciones para pedidos Carrefour.

Cruza el excel del comercial (hoja "Prov-Ref") con el excel de SAP (hoja "Data")
usando la tabla de cruce EAN<->Codigo SAP, y rellena la columna Observaciones
del excel del comercial in situ.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import openpyxl

SIN_INCIDENCIA = "No nos consta que esta referencia haya presentado ninguna incidencia en este pedido."
SIN_CODIGO_SAP = "Código SAP no localizado"
PEDIDO_NO_EN_SAP = "Pedido no encontrado en el excel de SAP"

COMERCIAL_SHEET = "Prov-Ref"
COMERCIAL_COL_PEDIDO = 2       # B
COMERCIAL_COL_EAN = 4          # D
COMERCIAL_COL_NO_SERVIDAS = 9  # I
COMERCIAL_COL_OBSERVACIONES = 11  # K
COMERCIAL_HEADER_ROW = 1
COMERCIAL_DATA_START_ROW = 2

SAP_SHEET = "Data"
SAP_COL_PEDIDO = 1       # A
SAP_COL_MATERIAL = 7     # G
SAP_COL_MOTIVO_DESC = 12  # L
SAP_COL_MOTIVO_COD = 13   # M
SAP_HEADER_ROW = 1
SAP_DATA_START_ROW = 2

# Las columnas de SAP se buscan por su cabecera; la posición fija solo se usa
# si la cabecera no aparece, por si el export cambia el orden de columnas.
SAP_CABECERAS = {
    "pedido": ("referencia de cliente", SAP_COL_PEDIDO),
    "material": ("material", SAP_COL_MATERIAL),
    "motivo_desc": ("descripción del motivo de rechazo", SAP_COL_MOTIVO_DESC),
    "motivo_cod": ("motivo de rechazo", SAP_COL_MOTIVO_COD),
}

CRUCE_SHEET = "Cruce_EAN_SAP"
CRUCE_COL_EAN = 1
CRUCE_COL_SAP = 2

# Texto a escribir en Observaciones según el código de motivo (columna M).
# Códigos que no estén aquí usan el texto literal de la columna L.
TEXTOS_POR_CODIGO_MOTIVO = {
    "Z1": "Cancelado por el cliente",
    "Z2": "Falta de disponibilidad informada",
    "Z7": "La mercancía salió completa del almacén",
}


@dataclass
class ResultadoCruce:
    actualizadas: int = 0
    sin_incidencia: int = 0
    sin_codigo_sap: int = 0
    pedido_no_en_sap: int = 0
    pedidos_no_en_sap: set[str] = field(default_factory=set)
    cabeceras_sap: list[str] = field(default_factory=list)
    filas_detalle: list[dict] = field(default_factory=list)

    @property
    def total_procesadas(self) -> int:
        return self.actualizadas + self.sin_incidencia + self.sin_codigo_sap + self.pedido_no_en_sap


def _normalizar(valor) -> str:
    if valor is None:
        return ""
    return str(valor).strip()


def _normalizar_codigo(valor) -> str:
    """EAN o código de material: '0002012865' y 2012865.0 pasan a '2012865'."""
    if isinstance(valor, float) and valor.is_integer():
        valor = int(valor)
    texto = _normalizar(valor)
    return texto.lstrip("0") or texto if texto.isdigit() else texto


def _normalizar_pedido(valor) -> str:
    return _normalizar(valor).upper()


def _clave_cabecera(valor) -> str:
    return " ".join(_normalizar(valor).split()).casefold()


def cargar_tabla_cruce(cruce_path) -> dict[str, set[str]]:
    """EAN -> conjunto de codigos SAP asociados."""
    wb = openpyxl.load_workbook(cruce_path, data_only=True)
    ws = wb[CRUCE_SHEET]
    ean_a_sap: dict[str, set[str]] = {}
    for row in ws.iter_rows(min_row=2):
        ean = _normalizar_codigo(row[CRUCE_COL_EAN - 1].value)
        sap = _normalizar_codigo(row[CRUCE_COL_SAP - 1].value)
        if not ean or not sap:
            continue
        ean_a_sap.setdefault(ean, set()).add(sap)
    return ean_a_sap


def cargar_incidencias_sap(sap_path):
    """Devuelve (pedido -> {material -> texto}, pedidos presentes en SAP, cabeceras)."""
    wb = openpyxl.load_workbook(sap_path, data_only=True)
    ws = wb[SAP_SHEET]
    fila_cabecera = next(ws.iter_rows(min_row=SAP_HEADER_ROW, max_row=SAP_HEADER_ROW), ())
    cabeceras = [_normalizar(c.value) for c in fila_cabecera]
    posiciones = {_clave_cabecera(c): i for i, c in enumerate(cabeceras, start=1) if c}
    col = {campo: posiciones.get(nombre, defecto) for campo, (nombre, defecto) in SAP_CABECERAS.items()}

    def celda(row, campo):
        indice = col[campo] - 1
        return row[indice].value if indice < len(row) else None

    incidencias: dict[str, dict[str, str]] = {}
    pedidos: set[str] = set()
    for row in ws.iter_rows(min_row=SAP_DATA_START_ROW):
        pedido = _normalizar_pedido(celda(row, "pedido"))
        if not pedido:
            continue
        pedidos.add(pedido)
        material = _normalizar_codigo(celda(row, "material"))
        motivo = _normalizar(celda(row, "motivo_desc"))
        codigo_motivo = _normalizar(celda(row, "motivo_cod")).upper()
        if not material or not (motivo or codigo_motivo):
            continue
        texto = TEXTOS_POR_CODIGO_MOTIVO.get(codigo_motivo) or motivo or codigo_motivo
        incidencias.setdefault(pedido, {})[material] = texto
    return incidencias, pedidos, cabeceras


def procesar(comercial_path, sap_path, cruce_path, salida_path) -> ResultadoCruce:
    ean_a_sap = cargar_tabla_cruce(cruce_path)
    incidencias_por_pedido, pedidos_en_sap, cabeceras_sap = cargar_incidencias_sap(sap_path)

    wb = openpyxl.load_workbook(comercial_path)
    ws = wb[COMERCIAL_SHEET]

    resultado = ResultadoCruce(cabeceras_sap=cabeceras_sap)

    for row in ws.iter_rows(min_row=COMERCIAL_DATA_START_ROW):
        no_servidas_cell = row[COMERCIAL_COL_NO_SERVIDAS - 1]
        no_servidas = no_servidas_cell.value
        if not no_servidas:
            continue
        try:
            if float(no_servidas) == 0:
                continue
        except (TypeError, ValueError):
            continue

        pedido = _normalizar_pedido(row[COMERCIAL_COL_PEDIDO - 1].value)
        ean = _normalizar_codigo(row[COMERCIAL_COL_EAN - 1].value)
        obs_cell = row[COMERCIAL_COL_OBSERVACIONES - 1]

        codigos_sap = ean_a_sap.get(ean)
        if not codigos_sap:
            obs_cell.value = SIN_CODIGO_SAP
            resultado.sin_codigo_sap += 1
            resultado.filas_detalle.append(
                {"fila": row[0].row, "pedido": pedido, "ean": ean, "observacion": SIN_CODIGO_SAP}
            )
            continue

        if pedido not in pedidos_en_sap:
            obs_cell.value = PEDIDO_NO_EN_SAP
            resultado.pedido_no_en_sap += 1
            resultado.pedidos_no_en_sap.add(pedido)
            resultado.filas_detalle.append(
                {"fila": row[0].row, "pedido": pedido, "ean": ean, "observacion": PEDIDO_NO_EN_SAP}
            )
            continue

        motivos_pedido = incidencias_por_pedido.get(pedido, {})
        motivo_encontrado = None
        for codigo in codigos_sap:
            if codigo in motivos_pedido:
                motivo_encontrado = motivos_pedido[codigo]
                break

        if motivo_encontrado:
            obs_cell.value = motivo_encontrado
            resultado.actualizadas += 1
            resultado.filas_detalle.append(
                {"fila": row[0].row, "pedido": pedido, "ean": ean, "observacion": motivo_encontrado}
            )
        else:
            obs_cell.value = SIN_INCIDENCIA
            resultado.sin_incidencia += 1
            resultado.filas_detalle.append(
                {"fila": row[0].row, "pedido": pedido, "ean": ean, "observacion": SIN_INCIDENCIA}
            )

    wb.save(salida_path)
    return resultado
