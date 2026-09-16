"""Cruce de observaciones para pedidos Carrefour.

Cruza el excel del comercial (hoja "Prov-Ref") con el excel de SAP (hoja "Data")
usando la tabla de cruce EAN<->Codigo SAP, y rellena la columna Observaciones
del excel del comercial in situ.
"""
from __future__ import annotations

from dataclasses import dataclass, field

import openpyxl

SIN_INCIDENCIA = "Sin incidencia registrada en SAP"
SIN_CODIGO_SAP = "Código SAP no localizado"

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
SAP_HEADER_ROW = 1
SAP_DATA_START_ROW = 2

CRUCE_SHEET = "Cruce_EAN_SAP"
CRUCE_COL_EAN = 1
CRUCE_COL_SAP = 2


@dataclass
class ResultadoCruce:
    actualizadas: int = 0
    sin_incidencia: int = 0
    sin_codigo_sap: int = 0
    filas_detalle: list[dict] = field(default_factory=list)

    @property
    def total_procesadas(self) -> int:
        return self.actualizadas + self.sin_incidencia + self.sin_codigo_sap


def _normalizar(valor) -> str:
    if valor is None:
        return ""
    return str(valor).strip()


def cargar_tabla_cruce(cruce_path) -> dict[str, set[str]]:
    """EAN -> conjunto de codigos SAP asociados."""
    wb = openpyxl.load_workbook(cruce_path, data_only=True)
    ws = wb[CRUCE_SHEET]
    ean_a_sap: dict[str, set[str]] = {}
    for row in ws.iter_rows(min_row=2):
        ean = _normalizar(row[CRUCE_COL_EAN - 1].value)
        sap = _normalizar(row[CRUCE_COL_SAP - 1].value)
        if not ean or not sap:
            continue
        ean_a_sap.setdefault(ean, set()).add(sap)
    return ean_a_sap


def cargar_incidencias_sap(sap_path) -> dict[str, dict[str, str]]:
    """Pedido -> {codigo_material -> motivo} (solo filas con motivo relleno)."""
    wb = openpyxl.load_workbook(sap_path, data_only=True)
    ws = wb[SAP_SHEET]
    incidencias: dict[str, dict[str, str]] = {}
    for row in ws.iter_rows(min_row=SAP_DATA_START_ROW):
        pedido = _normalizar(row[SAP_COL_PEDIDO - 1].value)
        material = _normalizar(row[SAP_COL_MATERIAL - 1].value)
        motivo = _normalizar(row[SAP_COL_MOTIVO_DESC - 1].value)
        if not pedido or not material or not motivo:
            continue
        incidencias.setdefault(pedido, {})[material] = motivo
    return incidencias


def procesar(comercial_path, sap_path, cruce_path, salida_path) -> ResultadoCruce:
    ean_a_sap = cargar_tabla_cruce(cruce_path)
    incidencias_por_pedido = cargar_incidencias_sap(sap_path)

    wb = openpyxl.load_workbook(comercial_path)
    ws = wb[COMERCIAL_SHEET]

    resultado = ResultadoCruce()

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

        pedido = _normalizar(row[COMERCIAL_COL_PEDIDO - 1].value)
        ean = _normalizar(row[COMERCIAL_COL_EAN - 1].value)
        obs_cell = row[COMERCIAL_COL_OBSERVACIONES - 1]

        codigos_sap = ean_a_sap.get(ean)
        if not codigos_sap:
            obs_cell.value = SIN_CODIGO_SAP
            resultado.sin_codigo_sap += 1
            resultado.filas_detalle.append(
                {"fila": row[0].row, "pedido": pedido, "ean": ean, "observacion": SIN_CODIGO_SAP}
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
