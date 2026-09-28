# Cruce de Observaciones — Pedidos Carrefour

App web (Streamlit) que automatiza el relleno de la columna **Observaciones**
del excel de pedidos Carrefour, cruzando los datos con el excel exportado de
SAP y la tabla de correspondencia EAN ↔ Código SAP.

## Cómo funciona

1. Se sube el excel del comercial (hoja `Prov-Ref`) y el excel exportado de
   SAP (hoja `Data`).
2. La app cruza primero por número de pedido, y dentro del mismo pedido busca
   el código de material SAP asociado al EAN (usando `data/cruce_ean_sap.xlsx`).
3. Rellena la columna Observaciones en cada línea con `No Servidas` ≠ 0:
   - Si se encuentra el motivo en SAP, el texto según su código (tabla
     `TEXTOS_POR_CODIGO_MOTIVO` en `logic.py`: Z1, Z2, Z7). Para códigos
     que no estén en esa tabla, el texto literal de SAP.
   - `"Sin incidencia registrada en SAP"` si no hay motivo para ese material.
   - `"Código SAP no localizado"` si el EAN no está en la tabla de cruce.
4. Descarga del excel del comercial ya actualizado, con un resumen de
   cuántas líneas se actualizaron en cada categoría.

La lógica de cruce está en `logic.py` (con tests en `tests/`); `app.py` es
solo la interfaz.

## Uso local

```bash
pip install -r requirements.txt
streamlit run app.py
```

Se abre en `http://localhost:8501`.

## Tests

```bash
pip install -r requirements.txt pytest
pytest tests/
```

## Despliegue (Streamlit Community Cloud, gratis)

1. Sube este repositorio a GitHub (ya está en la rama actual).
2. Entra en [share.streamlit.io](https://share.streamlit.io) con tu cuenta
   de GitHub.
3. "New app" → selecciona este repositorio, la rama, y `app.py` como
   archivo principal.
4. Deploy. Streamlit te da una URL pública (tipo
   `https://tuapp.streamlit.app`) que funciona desde cualquier PC con
   navegador, sin instalar nada.
5. Para dejarla fuera de servicio en cualquier momento: desde tu panel en
   share.streamlit.io puedes pausar o eliminar la app cuando quieras.

## Actualizar la tabla de cruce EAN ↔ SAP

La tabla vive en `data/cruce_ean_sap.xlsx` (hoja `Cruce_EAN_SAP`, columnas
`EAN | Codigo_SAP | Descripcion`). Si aparece un EAN o código SAP nuevo, se
añade una fila a ese archivo, se sube el cambio a GitHub (commit) y
Streamlit Community Cloud redespliega automáticamente la app con los datos
actualizados.
