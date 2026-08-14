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
5. Pulsa **Conectar carpeta** y elige dónde guardas los PDF de los cargos. Se
   indexa una vez y el índice queda dentro del JSON; en los arranques siguientes
   basta volver a dar permiso, sin releer el disco.
6. Arrastra el **Excel de cargos I** que sacas de SAP.
7. Para cada cargo: ábrelo, calcula la diferencia y regístralo con su nº de abono.

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
imponible).

En SAP el abono se monta metiendo una condición **ZNET** en cada línea afectada,
expresada *por 100 UC* o *por 100 CJ*. Lo que SAP hace después con ese ZNET no se
puede predecir desde fuera —aplica conversiones y descuentos que no aparecen ni
en el cargo ni en la factura— así que **se mide**:

```
1. tecleas ZNET 10 en la línea, con la base que vayas a usar
2. anotas el «precio neto» que devuelve SAP
3. ZNET final = diferencia × 10 / ese precio neto
```

Es la misma regla de 3 que se hacía a mano en Excel, y va en la columna **«Neto
de la prueba»** de la tabla de salida. Mientras no se mide, la herramienta estima
con `diferencia × 100 / cantidad`: sirve para muchos clientes, pero no para
todos. Cuando SAP no dé el importe previsto, se mide y sale exacto.

**El ZNET solo admite 2 decimales**, así que hay importes a los que no se llega:
en una línea de 10.080 unidades cada céntimo de ZNET mueve 1,008 €. Lo que sobre
se cierra con un **ZAJU** en la cabecera del abono, y la herramienta lo calcula.

### De dónde sale la diferencia

Cada cliente expresa el cargo a su manera. Se elige por línea o para todas a la
vez, y el modo elegido **se recuerda por cliente** para la próxima vez.

| Modo | Cuándo | Cálculo |
|---|---|---|
| Importe de línea | El cargo ya da el total de la diferencia | se usa tal cual |
| Precio correcto por unidad | El cargo dice a qué precio debía ir | (precio SAP − precio cargo) × unidades |
| Precio correcto por caja | Igual, pero en cajas | (precio SAP − precio cargo) × cajas |
| Diferencia por unidad | El cargo da la diferencia unitaria | diferencia × unidades |
| Diferencia por caja | El cargo da la diferencia por caja | diferencia × cajas |

**El precio de nuestra factura no sirve para restar**: lleva IVA y otros
impuestos. El neto de verdad solo se ve en SAP, así que se teclea en la columna
**«Precio SAP»**; el de la factura queda al lado en gris, como referencia. Si
falta, esa línea no se calcula — antes que dar un número que parece bueno.

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
pruebas/probar.js         batería de pruebas: cuadre y emparejado de archivos
pruebas/casos/*.json      qué se espera de cada cargo real (sin los PDF)
pruebas/casos_emparejado.js  nombres de archivo y a qué cargo deben enlazar
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
dio por bueno en SAP. Las pruebas de **emparejado** (a qué archivo llega cada
cargo) no necesitan ningún PDF: van con nombres inventados y se ejecutan
siempre, en la misma orden.

## Lo que la herramienta no puede hacer

- **Adjuntar el PDF al correo.** El navegador abre Outlook con el texto escrito,
  pero el adjunto lo tienes que poner tú. La ficha te recuerda hacerlo.
- **Leer lo que edites a mano en el Excel.** El libro se regenera entero cada vez.
- **Escribir el Excel si lo tienes abierto.** Windows lo bloquea; ciérralo y vuelve
  a guardar.
- **Saber si un cargo es nacional o internacional.** El listado de SAP no trae esa
  columna, así que salen todos. Se filtran por cliente.
- **Leer un PDF sin texto.** Algunos clientes (Alcampo) mandan el cargo con el
  texto convertido a curvas: cero caracteres dentro. No es que el lector falle,
  es que no hay nada que leer, y el brief descarta el OCR. Para esos hay entrada
  manual, con un modo que resta los dos importes.
- **Recordar el permiso de la carpeta entre sesiones.** Eso lo decide Edge. Es un
  clic al abrir, y no vuelve a leer el disco porque el índice está guardado.

## Privacidad

Cargos y facturas llevan datos de clientes: no se suben aquí. El `.gitignore`
bloquea `*.pdf`, `*.xps` y `*.oxps`. Los casos de prueba guardan solo las cifras
esperadas, no los documentos.
