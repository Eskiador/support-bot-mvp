# Contabilizador de Cargos I

Herramienta para contabilizar y abonar en SAP los cargos con letra **I**
(diferencias) de mercado nacional. Un único archivo HTML que se abre en Edge
desde el disco: sin instalar nada, sin internet y sin que ningún dato salga del
ordenador.

Estado: **cola de cargos, calculadora, checklist y ficha de comerciales
funcionando**, con la calculadora validada contra cargos reales. Todo vive en un
solo archivo con tres pestañas.

## Cómo se usa

1. Descarga `dist/Contabilizador_Cargos_I.html` y guárdalo en tu unidad.
2. Ábrelo con doble clic (se abre en Edge).
3. Pulsa **Conectar archivo de datos** y elige un JSON en la unidad. Ahí se
   guarda todo: los cargos, su estado, los comerciales y el registro.
4. Pulsa **Conectar Excel** y elige dónde quieres el libro `Cargos_I.xlsx`. A
   partir de ahí se regenera solo en cada guardado.
5. Arrastra el **Excel de cargos I** que sacas de SAP.
6. Para cada cargo: ábrelo, calcula la diferencia y regístralo con su nº de abono.

### El libro Cargos_I.xlsx

Lo genera y lo mantiene la herramienta; se actualiza en cada guardado. Cuatro
hojas: **Cargos** (con un botón por fila que abre su PDF), **Comerciales** (con
enlace para escribirle), **Calculadora** (botón que abre esta herramienta) y
**Registro**.

Es un reflejo, no una fuente: **lo que edites a mano en él se pierde** en la
siguiente actualización, porque dos programas escribiendo el mismo archivo
acaban perdiendo trabajo. Los cambios se hacen en la herramienta. Si tienes el
libro abierto en Excel, Windows lo bloquea y la cabecera te avisa.

### Las tres pestañas

**Cola de cargos** — el listado de SAP con el estado de cada uno: semáforo de
antigüedad, nº de abono, conforme / no conforme, si la conformidad está marcada
en SAP, compensado y reclamado. Filtros por cliente, estado, conformidad y texto
libre; contadores arriba; exportación a Excel. Al reimportar un listado nuevo se
cruza por cargo y **el trabajo hecho se conserva**; los que ya no aparecen se
marcan en lugar de borrarse.

Cada cargo tiene su **ficha** con la checklist de los ocho pasos del proceso, el
nombre `CLIENTE_ASIGNACIÓN` listo para copiar y el botón para generar el correo
de reclamación. Un cargo no pasa a cerrado con pasos abiertos: si es no conforme,
no se cierra hasta que está reclamado.

**Calculadora** — la pieza del cuadre (ver más abajo). Cuando termina, el botón
**Registrar en el archivo de cargos** pide el nº de abono y guarda el cálculo
completo (los ZNET línea a línea) en la ficha del cargo.

**Comerciales** — la relación cliente → comercial, que no existe en ningún sitio
y se va construyendo sola. Con el correo apuntado, el botón de reclamación abre
Outlook con el asunto y el cuerpo ya escritos.

## Qué calcula, exactamente

El cuadre se hace **siempre contra el importe sin IVA** del cargo (la base
imponible). En SAP el abono se monta metiendo una condición **ZNET** en cada
línea afectada:

```
ZNET de la línea = diferencia × 100 / cantidad     (SAP admite 2 decimales)
importe de línea = ZNET × cantidad / 100           (lo que calculará SAP)
ZAJU de cabecera = importe del cargo − suma de los importes de línea
```

Esto reproduce la regla de 3 que se hace a mano: meter ZNET 10 por 100 UC, mirar
qué importe sale y escalarlo hasta la diferencia buscada. La herramienta se
salta el paso intermedio y da el ZNET final directamente.

**Los ZNET de 2 decimales no llegan a cualquier importe.** En una línea de
10.080 unidades, cada céntimo de ZNET mueve 1,008 €, así que hay importes
inalcanzables. Cuando pasa, la línea se marca en ámbar y se dice cuánto se
desvía; el ajuste se hace a mano en SAP o se absorbe en el ZAJU de cabecera.

### Modos de diferencia

Cada cliente expresa el cargo a su manera. Se elige por línea o para todas a la
vez, y el modo elegido **se recuerda por cliente** para la próxima vez.

| Modo | Cuándo | Cálculo |
|---|---|---|
| Importe de línea | El cargo ya da el total de la diferencia | se usa tal cual |
| Precio correcto por unidad | El cargo dice a qué precio debía ir | (precio factura − precio cargo) × unidades |
| Precio correcto por caja | Igual, pero en cajas | (precio caja − precio cargo) × cajas |
| Diferencia por unidad | El cargo da la diferencia unitaria | diferencia × unidades |
| Diferencia por caja | El cargo da la diferencia por caja | diferencia × cajas |

Las **unidades por caja** salen de la columna `UC/US` de nuestra propia factura,
así que la conversión cajas ↔ unidades no hay que teclearla.

## Lectura de archivos: sin OCR

Se extrae el texto real del archivo. Nada de reconocimiento de imagen.

- **PDF** — vía recomendada. Las columnas salen limpias y separadas.
- **XPS / OXPS** — respaldo. Los importes salen exactos, pero las descripciones
  pierden parte de los espacios (el formato no guarda espacios: hay que
  deducirlos de la posición de cada letra). Sirve perfectamente para calcular.
- **Pegar texto a mano** — para clientes cuyo formato todavía no se reconozca.

Todos los valores leídos son editables antes de calcular.

## Estructura del repositorio

```
src/calculadora.html      código fuente legible (sin las librerías incrustadas)
vendor/                   pdf.js (biblioteca y worker) que se incrusta al construir
build/construir.js        genera el HTML autocontenido
dist/                     el archivo que se usa: HTML único de ~3 MB
pruebas/probar.js         batería de pruebas contra cargos reales ya resueltos
pruebas/casos/*.json      qué se espera de cada caso (sin los PDF)
docs/                     decisiones tomadas y cómo se cerraron
```

### Construir

```bash
node build/construir.js
```

### Probar

Los PDF de clientes **no están en el repositorio**. Se guardan aparte y se
indica dónde:

```bash
CASOS=/ruta/a/mis/casos node pruebas/probar.js
```

Cada caso comprueba que la herramienta reproduce, al céntimo, el abono que ya se
dio por bueno en SAP.

## Lo que la herramienta no puede hacer

- **Adjuntar el PDF al correo.** El navegador abre Outlook con el texto escrito,
  pero el adjunto lo tienes que poner tú. La ficha te recuerda hacerlo.
- **Leer lo que edites a mano en el Excel.** El libro se regenera entero cada vez.
- **Escribir el Excel si lo tienes abierto.** Windows lo bloquea; ciérralo y vuelve
  a guardar.
- **Saber si un cargo es nacional o internacional.** El listado de SAP no trae esa
  columna, así que salen todos. Se filtran por cliente.

## Privacidad

Cargos y facturas llevan datos de clientes: no se suben aquí. El `.gitignore`
bloquea `*.pdf`, `*.xps` y `*.oxps`. Los casos de prueba guardan solo las cifras
esperadas, no los documentos.
