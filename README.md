# Contabilizador de Cargos I

Herramienta para contabilizar y abonar en SAP los cargos con letra **I**
(diferencias) de mercado nacional. Un único archivo HTML que se abre en Edge
desde el disco: sin instalar nada, sin internet y sin que ningún dato salga del
ordenador.

Estado: **Módulo 2 (calculadora de diferencias) funcionando y validado contra un
cargo real.** El resto de módulos todavía no está construido.

## Cómo se usa

1. Descarga `dist/Contabilizador_Cargos_I.html` y guárdalo en tu unidad.
2. Ábrelo con doble clic (se abre en Edge).
3. Arrastra el **PDF del cargo** y el **PDF de la factura original**.
4. Revisa el emparejamiento de líneas y el modo de diferencia.
5. Copia los **ZNET** y el **ZAJU** que te da, y tecléalos en SAP.

La primera vez conviene pulsar **Conectar archivo de datos** y elegir un JSON en
la unidad. Ahí se guarda la memoria de cada cliente (qué modo de diferencia usa)
y el registro de lo que vas cerrando.

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

## Privacidad

Cargos y facturas llevan datos de clientes: no se suben aquí. El `.gitignore`
bloquea `*.pdf`, `*.xps` y `*.oxps`. Los casos de prueba guardan solo las cifras
esperadas, no los documentos.
