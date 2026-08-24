# Prompt de continuación — Contabilizador de Cargos I

Pega este mensaje al abrir el chat nuevo.

---

Estoy continuando el desarrollo de **"Contabilizador de Cargos I"**, una herramienta que ya existe y funciona en producción. Lee primero `README.md` y `docs/decisiones.md` en la raíz del repo: ahí está el estado real, las decisiones tomadas y por qué. Este mensaje es el resumen para que no tengas que reconstruir el contexto desde cero, pero los `.md` mandan si hay contradicción.

## Quién soy y para qué es esto

Soy Pablo, back office en Angel Camacho Alimentación. Contabilizo y abono en SAP los cargos con letra **I** (diferencias) que meten los clientes: 20-50 por semana, antes a mano con Excel. La herramienta automatiza la calculadora de diferencias y la gestión de la cola de cargos.

## Restricciones que no se negocian

- **No se puede instalar nada** en mi PC de trabajo (está bloqueado). Navegador **Edge**.
- **Un único archivo HTML autocontenido**, se abre desde el disco con doble clic, funciona **offline**, sin servidor.
- **Persistencia con File System Access API** sobre un JSON local — nada sale del ordenador.
- **Nada de OCR.** Se extrae texto real de PDF/XPS. "Un dígito mal leído en un importe es peor que teclearlo a mano."
- El cuadre se hace **siempre contra el importe SIN IVA** (base imponible) del cargo.
- Usuario único, sin concurrencia.

## Estructura del repositorio

```
src/calculadora.html          código fuente legible (sin librerías incrustadas) — AQUÍ SE EDITA
vendor/                       pdf.js (biblioteca + worker), se incrusta al construir
build/construir.js            genera el HTML autocontenido final
dist/Contabilizador_Cargos_I.html   el archivo que se entrega al usuario (~3.19 MB)
pruebas/probar.js             batería: cuadre contra cargos reales + emparejado de archivos
pruebas/auditoria.js          batería: todo lo que no es el cuadre (Excel, cola, comerciales…)
pruebas/casos/*.json          qué se espera de cada cargo real (SIN los PDF, por privacidad)
pruebas/casos_emparejado.js   nombres de archivo inventados y a qué cargo deben enlazar
docs/decisiones.md            decisiones tomadas, por qué, y hallazgos — LEER ANTES DE TOCAR NADA
```

**Flujo de trabajo obligatorio tras cualquier cambio en `src/calculadora.html`:**

```bash
node build/construir.js
CASOS=/home/user/casos-reales CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node pruebas/probar.js
CASOS=/home/user/casos-reales CHROME=/opt/pw-browsers/chromium-1194/chrome-linux/chrome node pruebas/auditoria.js
```

Las dos baterías deben pasar limpias (actualmente 85 + ~90 comprobaciones OK) antes de dar nada por terminado. Los PDF/XPS reales de clientes **no están en el repo** (`.gitignore` bloquea `*.pdf`, `*.xps`, `*.oxps`, `casos-reales/`) — viven en `/home/user/casos-reales/` fuera del repo, por privacidad. Si esa carpeta no está disponible en la sesión nueva, las pruebas que la necesitan se OMITEN automáticamente (no fallan), pero conviene pedírmela si hace falta verificar algo a fondo.

Rama de trabajo: `claude/contabilizador-cargos-i-ko1xgk` en `eskiador/support-bot-mvp`. Todo el trabajo hasta ahora está commiteado y pusheado ahí.

## Qué calcula la calculadora (Módulo 2, la pieza central)

Mecanismo SAP: el abono se monta metiendo una condición **ZNET** por línea, expresada *por 100 UC* o *por 100 CJ* (2 decimales máximo). Fórmula base: `ZNET = diferencia × 100 / cantidad`. Lo que sobra por el redondeo se cierra con un **ZAJU** de cabecera.

**Importante:** SAP a veces aplica conversiones/descuentos internos que no se ven ni en el cargo ni en la factura (factor real 0,2387 en vez de 0,24 en un caso real). Por eso existe el modo de **medición**: se teclea ZNET 10 de prueba, se anota el neto que devuelve SAP, y `ZNET final = diferencia × 10 / ese neto`. Columna "Neto de la prueba" en la tabla de salida. Cuando hay medición, manda sobre el cálculo teórico — incluye el cálculo del salto mínimo de la línea (importante para el veredicto CUADRA/SOLO FALTA EL ZAJU/NO CUADRA).

**El precio de nuestra factura NUNCA sirve para restar** — lleva IVA e impuestos. El precio neto de SAP se teclea a mano en la columna "Precio SAP".

5 modos de diferencia por línea (importe de línea / precio correcto por ud / precio correcto por caja / diferencia por ud / diferencia por caja), elegibles por línea o para todas, y se recuerdan por cliente.

Perfiles de cargo reconocidos y ya resueltos: **Alimerka** (tabla con importe), **Alipensa** (sin importes, "ES A precio"), **Alcampo** y **Peninsulaco** (dos renglones por artículo, facturado+/correcto−, se funden con `fundirPares()`), **Hiper Usera** y **Grupo Hermanos Martín** (solo afectan al emparejado de archivos, no al cálculo — ver abajo).

**Pendiente, aún sin resolver:**
- Ningún cargo real visto todavía en **cajas** (CJ) — el modo existe, usa `UC/US` de la factura, pero no probado contra un cargo real. Sí hay ya una factura real en CJ (caso permanente en pruebas).
- Descuadre de 0,72 € en Alipensa NC2417589, pendiente de la factura 90194273 para investigar.
- Cargos de diferencia de **mercancía** quedan fuera a propósito (no necesitan calculadora, el importe cuadra solo).

## Las tres pestañas y qué hace cada una

**Cola de cargos** — el listado de SAP importado (xlsx/csv), con estado por cargo. 14 columnas, ajustadas con `table-layout:fixed` para que quepan sin scroll horizontal hasta 1280px (por debajo de 1086px reaparece el scroll). Columnas: Fecha, Días (semáforo), Cliente, Asignación, Importe, **Marca (MDD/MDF)**, Estado, Nº abono, Conforme, SAP, Comp., Recl., PDF, [Abrir].

**Casillas de un clic** (sin abrir la ficha): conforme (cicla sin-decidir→conforme→no-conforme→sin-decidir), en-SAP, compensado, reclamado, PDF-guardado, marca (cicla igual: sin-decidir→MDD→MDF→sin-decidir), y estado (para cerrar/reabrir cargos abonados). Cada una explica por qué no si no se puede marcar (p.ej. no se reclama un conforme). Guardado con debounce de 900ms (`guardarPronto()`) para no reescribir el Excel en cada clic; `beforeunload` avisa si queda algo sin guardar.

**Acciones en lote** (`ACCIONES_LOTE` = array de `{campo, valor, et}`, genérico para casillas booleanas y para marca que lleva valor): botones sobre lo filtrado, con confirmación que enumera los primeros cargos afectados.

**El cierre NUNCA es automático** — decisión explícita del usuario reciente: antes el estado saltaba solo a "cerrado" cuando abonado+conforme+compensado, lo que sacaba cargos de la vista mientras se seguían trabajando. Ahora `cerrado` es un campo propio (`c.cerrado`), y `recalcularEstado()` solo usa pendiente→en curso→abonado automáticamente; cerrar es clic explícito, con confirmación extra si es no-conforme-sin-reclamar.

**Reimportar el listado** cruza por `cliente + asignación` (no por la clave completa vieja, que incluía fecha/importe/ndoc y se rompía si SAP cambiaba de columnas) — el trabajo hecho se conserva, los que desaparecen del listado se marcan `enListado:false` sin borrarse. `leerXlsx()` ahora recorre TODAS las hojas del libro (por si SAP mete una portada delante), no solo la primera.

**Ficha del cargo** — checklist de 9 pasos (clasificado, **marca**, cálculo, conforme, abono, PDF, SAP, compensado, reclamado), nombre `CLIENTE_ASIGNACIÓN` para el PDF, botón de correo de reclamación (solo si no conforme).

**Calculadora** — el módulo 2. Botón "Registrar en el archivo de cargos" pide nº de abono y guarda el cálculo completo en la ficha.

**Comerciales** — relación cliente→comercial que se va construyendo sola. **Cambio reciente importante: ahora es por cliente Y marca** (`claveComercial = cliente|marca`, marca vacía = "todo el cliente"). ALDI MDD puede ser de Juan y ALDI MDF de Pablo. `comercialDe(cliente, marca)` busca primero el específico, si no el general — nunca al revés. Migración automática al cargar datos viejos (comerciales sin marca pasan a marca vacía = generales). **Buscador** añadido (`#cBuscar`) que filtra por cliente+marca+nombre+correo+notas a la vez, usando `norm()` (ignora tildes/puntuación), con debounce 160ms y contador "N de M".

## Emparejado cargo↔PDF de la carpeta (pieza delicada, ya endurecida varias veces)

25.000 archivos indexados: el índice se guarda en el JSON (`E.memoria.pdfIndice`), así que releer la carpeta solo hace falta cuando hay archivos nuevos (antes: 10 min cada arranque; ahora: instantáneo con índice guardado + reconexión de permiso). `construirMapaDocs()` indexa tokens y n-gramas de 2-3 palabras del nombre de archivo para búsqueda O(1).

`clavesDeAsignacion(asig)` genera las claves con las que se busca. **Historial de endurecimiento** (importante para no repetir errores):
1. Primero solo probaba la asignación entera y "el número más largo dentro". Se rompía con `C/5300011522` vs archivo `5300011522.pdf` (arreglado con `claveAsignacion()` que quita el prefijo tipo-de-documento antes de la barra).
2. Se rompía con Grupo Hermanos Martín: SAP `C/ 0D/4102`, archivo `GRUPO HNOS MARTÍN 0D-4102.pdf` — el código real es `0D-4102` con su serie, no solo el número.
3. **Hallazgo grave, ya corregido:** buscar por "el número más largo suelto" enlazaba el PDF de OTRO cargo cuando varios compartían un prefijo largo (Carrefour: `20241044S115781`, `20241044S71824`... comparten `20241044` — 19 grupos de colisión en 1273 cargos reales). Regla actual: el número solo vale como clave si la asignación **ES** ese número entero (tras quitar el prefijo); si lleva algo más, no se usa el número suelto. Verificado: 0 colisiones sobre los 1273 cargos reales del listado.

Si tocas esto: la máxima que rige es **"enlazar el documento de otro cargo es peor que no enlazar ninguno"**. Cualquier relajación de la regla debe medirse contra `CARGOS_EN_I.xlsx` real (en `/home/user/casos-reales/`) antes de aceptarse, contando colisiones de clave entre asignaciones distintas.

## Excel generado (`Cargos_I.xlsx`)

4 hojas: Cargos (con hipervínculo a cada PDF), Comerciales (ahora con columna Marca), Calculadora (botón que abre el HTML), Registro. Se regenera entero en cada guardado — **no es editable a mano**, se pierde en la siguiente escritura (avisado en el propio libro). Escrito con ZIP manual sin librerías (`escribirZip`, `construirXlsx`, `hojaXml`).

**Bug grave ya corregido:** las fórmulas de hipervínculo se escribían como `HIPERVINCULO(...;...)` (español), pero dentro de un `.xlsx` el formato exige el nombre **inglés** `HYPERLINK(...,...)` — Excel lo traduce al mostrarlo, pero el archivo interno tiene que llevar el nombre canónico. Con el nombre español, cada botón salía como `#¿NOMBRE?`. Verificado abriendo el `.xlsx` generado con `openpyxl` de verdad (no hay Excel en este entorno, así que la verificación es leyendo el formato, no visual).

## Lectura de archivos

- **PDF** vía pdf.js, agrupando texto por coordenada Y (±2.2) en filas, columnas por X.
- **XPS/OXPS**: ZIP propio + XML con `<Glyphs>`, sin espacios reales — se deducen del atributo `Indices` (avance por glifo, umbral adaptativo).
- **Excel del listado**: ZIP + `sharedStrings.xml` + todas las hojas (DOMParser), sin librerías.
- Entrada manual (`leerLineasManuales`/`leerLineasFacturaManual`) para cuando el PDF no se deja leer — cubre tanto cargo como factura, con selector "¿Qué vas a escribir?".
- **Última corrección de parsing:** las facturas con cantidad en `CJ` (cajas) en vez de `UC`/`CS` daban 0 líneas porque `CJ` no estaba en las regex de unidad de medida. Corregido en 3 sitios; `enCajas()` centraliza qué se considera "caja" (`CS|CJ`).

## Funciones clave si necesitas orientarte rápido en `src/calculadora.html`

`num()` (parseo es-ES), `parseFactura()`, `parseCargo()`, `fundirPares()`, `emparejar()`, `calcular()`, `cuadrarLineas()` (reparto forzado del descuadre), `pintarResultado()` (veredicto CUADRA/SOLO FALTA ZAJU/NO CUADRA), `importarListado()`, `claveCargo()`/`claveAsignacion()`/`mismaAsignacion()`, `buscarDoc()`/`construirMapaDocs()`/`clavesDeAsignacion()`, `escribirZip()`/`construirXlsx()`, `alternarCasilla()`/`marcarLote()` (cola), `comercialDe()`/`claveComercial()` (comerciales). Hooks de depuración expuestos como `window.__algo` para las pruebas Playwright (ver bloque final del archivo).

## Estilo de trabajo que espero que mantengas

- **No asumas, pregunta o verifica ejecutando.** Cuando reporto un bug, reprodúcelo con Playwright contra `dist/` antes de tocar código, y vuelve a verificar después.
- **Todo cambio nuevo se documenta en `docs/decisiones.md`** con el porqué (no solo el qué) y queda como caso de prueba permanente en `pruebas/auditoria.js` o `pruebas/casos_emparejado.js`.
- Cuando cambias algo del emparejado de PDF o de las claves, **mide contra el listado real** de 1273 cargos, no solo contra casos sintéticos.
- Los mensajes de commit y el código en español, sin comentarios que expliquen el "qué" (los nombres ya lo dicen) — solo el "por qué" cuando no es obvio.
- Nunca subir PDF/XPS reales de clientes al repo.
- Cada entrega te mando el `dist/Contabilizador_Cargos_I.html` actualizado como archivo adjunto tras verificar que las pruebas pasan.

## Estado ahora mismo

Todo commiteado y pusheado a `claude/contabilizador-cargos-i-ko1xgk`. Últimas 8 cosas hechas, de más reciente a más antigua: buscador de comerciales · comercial por cliente+marca · columna Marca MDD/MDF en cola+ficha+filtro+lote+Excel · asignación sin tipo de documento para el emparejado (+ corrección de colisiones Carrefour) · ningún cargo se cierra solo · casillas de la cola con clic directo + acciones en lote · explicación de dónde sale la diferencia en cargos de renglones pareados · corrección del nº de cargo que se borraba al leer el PDF tras abrir desde la cola.

Estoy en producción usando esto a diario. Lo próximo que quiero seguir mejorando es: [aquí yo, Pablo, completaré con lo que toque en el momento — puede que sea algo nuevo o continuar algo de la lista de pendientes de arriba].
