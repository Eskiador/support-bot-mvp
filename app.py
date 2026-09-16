import io
import tempfile
from pathlib import Path

import streamlit as st

from logic import SIN_CODIGO_SAP, SIN_INCIDENCIA, procesar

CRUCE_PATH = Path(__file__).parent / "data" / "cruce_ean_sap.xlsx"

st.set_page_config(page_title="Observaciones Carrefour", page_icon="📋")

st.title("📋 Cruce de Observaciones — Pedidos Carrefour")
st.write(
    "Sube el excel de pedidos del comercial y el excel exportado de SAP. "
    "La app rellenará la columna **Observaciones** del excel del comercial "
    "y te dejará descargarlo."
)

col1, col2 = st.columns(2)
with col1:
    comercial_file = st.file_uploader(
        "Excel del comercial (hoja 'Prov-Ref')", type=["xlsx"], key="comercial"
    )
with col2:
    sap_file = st.file_uploader("Excel de SAP (hoja 'Data')", type=["xlsx"], key="sap")

if not CRUCE_PATH.exists():
    st.error("No se encuentra la tabla de cruce EAN↔SAP en el servidor (data/cruce_ean_sap.xlsx).")
    st.stop()

if st.button("Procesar", type="primary", disabled=not (comercial_file and sap_file)):
    with st.spinner("Procesando..."):
        with tempfile.TemporaryDirectory() as tmp:
            tmp_path = Path(tmp)
            comercial_path = tmp_path / "comercial.xlsx"
            sap_path = tmp_path / "sap.xlsx"
            salida_path = tmp_path / (comercial_file.name or "resultado.xlsx")

            comercial_path.write_bytes(comercial_file.getvalue())
            sap_path.write_bytes(sap_file.getvalue())

            try:
                resultado = procesar(comercial_path, sap_path, CRUCE_PATH, salida_path)
            except KeyError as exc:
                st.error(f"No se encontró la hoja esperada en el excel: {exc}")
                st.stop()
            except Exception as exc:  # noqa: BLE001
                st.error(f"Error al procesar los archivos: {exc}")
                st.stop()

            salida_bytes = salida_path.read_bytes()

    st.success(
        f"Proceso completado: {resultado.actualizadas} líneas actualizadas con motivo, "
        f"{resultado.sin_incidencia} marcadas como '{SIN_INCIDENCIA}', "
        f"{resultado.sin_codigo_sap} marcadas como '{SIN_CODIGO_SAP}'."
    )

    st.metric("Total líneas con incidencia procesadas", resultado.total_procesadas)
    m1, m2, m3 = st.columns(3)
    m1.metric("Con motivo SAP", resultado.actualizadas)
    m2.metric(SIN_INCIDENCIA, resultado.sin_incidencia)
    m3.metric(SIN_CODIGO_SAP, resultado.sin_codigo_sap)

    st.download_button(
        "⬇️ Descargar excel actualizado",
        data=salida_bytes,
        file_name=comercial_file.name or "resultado.xlsx",
        mime="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    )

    if resultado.filas_detalle:
        with st.expander("Ver detalle de filas actualizadas"):
            st.dataframe(resultado.filas_detalle, use_container_width=True)
