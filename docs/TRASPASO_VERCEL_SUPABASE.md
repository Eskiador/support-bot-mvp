# Contabilizador de Cargos I: traspaso a GitHub + Vercel + Supabase

Documento de contexto para pasar el Contabilizador de Cargos I de **lanzador**
(un HTML que se abre desde el disco) a **programa web** con repositorio en
GitHub, publicación en Vercel y datos en Supabase.

**Destino, en las cuentas de Pablo Montes:**
- **GitHub:** repositorio privado nuevo.
- **Vercel:** proyecto conectado a ese repositorio. Publica `main` solo si pasan las pruebas.
- **Supabase:** base de datos y usuarios. Región UE (Fráncfort), RLS en todas las tablas.

**Cómo usarlo:**
1. Crea el repositorio vacío en GitHub.
2. Ábrelo con Claude Code.
3. Pásale este archivo como primer mensaje, o súbelo a `docs/`.
4. Copia también los archivos de la sección 13.

Estado del lanzador en este documento: rama `claude/contabilizador-cargos-i-ko1xgk`
del repositorio `Eskiador/support-bot-mvp`, a 28-oct-2026.

---

## 1. Quién, para qué y reglas que no se negocian

- **Usuario:** Pablo Montes, Back Office de Angel Camacho Alimentación (nacional).
  No es programador: hay que explicarle las decisiones en español claro.
  Su jefa quiere ver el seguimiento de los no conformes.
- **Qué resuelve:** los **cargos con letra I** (diferencias de precio o mercancía)
  de mercado nacional. Para cada uno hay que:
  1. leer el cargo del cliente y nuestra factura;
  2. calcular la diferencia línea a línea;
  3. crear en SAP la solicitud de abono (VA01, clase ZG2), con un **ZNET** por línea
     (y un ZAJU de cabecera si hace falta);
  4. llevar el seguimiento: conforme / no conforme, reclamación al comercial,
     conformidad marcada en SAP, compensado, PDF guardado y cierre.

**Principios del lanzador que hay que mantener:**
1. **Cero errores antes que automatización.** Un número dudoso no se da por bueno en
   silencio: se avisa (ámbar o rojo) y se pide revisarlo. Nada se cierra solo.
2. **Los PDF de clientes nunca salen del PC.** Hoy no se sube nada a ningún sitio.
   En la versión web, los PDF se siguen leyendo en el navegador con pdf.js. A
   Supabase solo van los datos: cargos, estados, cálculos, comerciales y registro.
   Nunca el PDF ni su texto.
3. **Trazabilidad.** Cada cambio queda en un registro con quién y cuándo (`log`).
   En la web, cada alta, cambio o cierre debe tener auditoría.
4. **El cierre es una decisión.** Un cargo pasa a «cerrado» solo cuando alguien lo
   cierra a mano. El resto del estado se deduce.
5. **No se cambia una regla de negocio sin preguntar a Pablo.**

## 2. Relación con el «programa de cargos» que Pablo ya tiene en la nube

Pablo ya tiene en producción otra app, el **programa de cargos**. Hace la entrada
de PDF con OCR, la carpeta 02, Cargos B/C y el reparto.

**Stack de esa app:**
- Vite + Preact + htm.
- pdf.js, Tesseract.js, pdf-lib, SheetJS y fflate.
- Supabase: PostgreSQL 17 + Auth, en la UE, con RLS en las 21 tablas.
- Vercel (Hobby), con una función `/api/admin`.
- GitHub privado. Vercel publica `main` solo si pasa `npm test && npm run build`.

**Convenciones de esa app:**
- Todo el acceso a datos en `src/data/`.
- Las escrituras pasan por funciones SQL `security definer` con `search_path=''`.
- El borrado siempre es lógico.
- Roles `admin` / `usuario` en `profiles.rol`.
- Registro público desactivado: las altas las hace el admin.
- Las migraciones SQL son idempotentes en `supabase/migrations/`.
- Hay un modo demo con datos inventados.
- **Variables de entorno:**
  - `VITE_SUPABASE_URL` y `VITE_SUPABASE_ANON_KEY`: públicas.
  - `SUPABASE_SERVICE_ROLE_KEY`: solo en Vercel, producción.

**Recomendación:** usar **el mismo stack y las mismas convenciones**. Así Pablo
mantiene una sola forma de trabajar y una sola cuenta de cada servicio.

**Decisión que debe tomar Pablo antes de empezar:**
- **A) Proyecto de Supabase propio** para el Contabilizador, en la misma organización.
  Más aislado y más simple de empezar.
- **B) El mismo proyecto de Supabase** que el programa de cargos, con tablas nuevas.
  - Ventaja: un único inicio de sesión y la posibilidad de cruzar datos. Un cargo I de
    SAP es un cargo DIF de la 02, con la misma asignación y COD_CLI. El reparto pone
    la letra I a los DIF.
  - Inconveniente: hay que tener cuidado de no tocar las tablas existentes.

No hay que inventar cruces con la otra app sin que Pablo lo pida.

## 3. Qué hay hoy (el lanzador)

| Pieza | Qué es |
|---|---|
| `src/calculadora.html` | Código fuente legible (~4.750 líneas, HTML + CSS + JS en un archivo). |
| `build/construir.js` | Incrusta pdf.js (`vendor/pdf.mjs`, `vendor/pdf.worker.mjs`) y genera `dist/Contabilizador_Cargos_I.html` (~3 MB, autocontenido, sin internet). |
| `dist/Contabilizador_Cargos_I.html` | Lo que usa Pablo: lo abre con doble clic en Edge. |
| Archivo de datos JSON (`contabilizador_cargos_I.json`) | Todo el estado: cargos, comerciales, memoria por cliente, registro e índice de PDF. Se elige con «Conectar archivo de datos» (File System Access API). |
| `Cargos_I.xlsx` | Libro **generado** por la herramienta en cada guardado. Es solo un reflejo: lo que se edite a mano se pierde. Hojas: **Cargos**, **No conformes**, **Comerciales**, **Calculadora**, **Registro**. |
| Carpeta de PDF | `\\hq.gac\files\wmn\MN-EXP\CARGOS` (red) o OneDrive. Se indexa con File System Access y el índice se guarda en el JSON. |
| `sap/AsistenteSAP.bas` | Macro VBA (Excel) que teclea el ZNET en SAP GUI posición a posición. Ver sección 9. **Sigue siendo local**: no se puede llevar a la web. |
| `pruebas/probar.js`, `pruebas/auditoria.js` | Pruebas con Playwright + Chromium contra el HTML construido. `probar.js` cuadra cargos reales (los PDF están fuera de git, en `CASOS=`). `auditoria.js` hace ~200 comprobaciones de comportamiento. |
| `pruebas/casos/*.json` | Lo que debe salir de cada cargo real, sin los PDF. |
| `docs/decisiones.md` | ~1.850 líneas: **cada decisión tomada y por qué**. Es la fuente de las reglas. Hay que leerla antes de reescribir nada. |

Ahora mismo **no hay usuarios ni servidor**: es una sola persona con un archivo
JSON. La web añade inicio de sesión, datos compartidos y que la jefa pueda verlo.

## 4. Las cuatro pestañas (funcionalidad completa)

### 4.1 Cola de cargos
- **Importar el listado de cargos I de SAP** (Excel `.xlsx` o CSV).
  - Lee todas las hojas y busca la cabecera por la columna «Asignación».
  - Columnas reconocidas:
    - cliente: «Nombre 1», «Cliente»;
    - asignación;
    - importe en moneda local;
    - moneda;
    - fecha de contabilización;
    - clave de reclamación;
    - nº documento;
    - referencia;
    - fecha de entrada.
  - Las fechas de Excel son números de serie desde el 30/12/1899.
- **Reimportar conserva el trabajo hecho.** Los cargos se cruzan por
  **cliente + asignación normalizada**, no por un id que lleve la fecha o el importe.
  Los que ya no salen en el listado se marcan (`enListado:false`), no se borran.
- **Por cargo:** fecha, días (semáforo: más de 30 ámbar, más de 60 rojo), cliente,
  asignación, importe, marca, estado, nº de abono, conforme, SAP, compensado,
  reclamado, PDF, y los botones Ver (PDF) y Calcular.
- **Las casillas se cambian con un clic en la propia tabla:**
  - conforme: sin decidir → conforme → no conforme;
  - marca: — → MDD → MDF;
  - marcado en SAP, compensado, reclamado (solo si no es conforme), PDF guardado y cerrado.
- **Lotes sobre lo filtrado:** marcar compensados, conformidad en SAP, reclamados,
  PDF guardado, cerrados, MDD o MDF.
- **Filtros:** estado, cliente, conformidad, marca y texto libre. Hay contadores arriba.
- **Ficha del cargo:**
  - checklist de 9 pasos: clasificado, marca, cálculo, revisado, abono, PDF,
    conformidad en SAP, compensado, reclamado;
  - nombre `CLIENTE_ASIGNACION` para copiar;
  - nota;
  - botón de **correo de reclamación** (mailto al comercial de ese cliente y marca,
    con asunto y cuerpo hechos).
- **Carpeta de PDF:**
  - índice de archivos guardado (26.682 archivos en la carpeta real) y botón
    «Volver a leer la carpeta»;
  - buscador del índice, que dice además por qué un cargo enlaza o no con su PDF;
  - carpetas saltadas por no responder (60 s por carpeta, 6 a la vez, 8 niveles). Al
    releer se conservan los PDF ya conocidos de esas carpetas.
- **Emparejar cargo y PDF:**
  - se buscan claves de la asignación (entera y sin el tipo de documento) entre los
    trozos del nombre del archivo;
  - una clave corta exige que coincida también el cliente;
  - nunca se saca un número suelto de dentro de una asignación compuesta (Carrefour
    `20241044S115781`), para no enlazar el PDF de otro cargo.

  Casos de prueba: `pruebas/casos_emparejado.js`.

### 4.2 Calculadora (el cuadre)
- **Entradas:**
  - el **cargo del cliente** (PDF, XPS/OXPS o texto pegado a mano);
  - **nuestra factura** (PDF de SAP; el formato es el mismo para todos los clientes).
- **Sin OCR**, solo la capa de texto. Algunos PDF (Alcampo) vienen en curvas, sin
  texto, y para esos hay entrada manual.
- **Parser de la factura** (formato fijo de A. Camacho): posición, material,
  descripción, cantidad, UM, UC/US (unidades por caja), precio e importe.
- **Parser del cargo** (varía por cliente):
  - cabecera: nº de cargo, fecha, referencia de factura, total sin IVA;
  - líneas con importes a la derecha.
  - Reglas probadas con ALIMERKA, ALIPENSA, HIPER USERA, PENINSULACO y ALDI.
- **Emparejar líneas** de factura y cargo por material o EAN.
  - Cada línea se marca como afectada o no.
  - Se puede asignar a mano la «línea del cargo».
- **Modo de la diferencia** (por línea o para todas; se **recuerda por cliente**):

  | Modo | Cálculo |
  |---|---|
  | `importe`: diferencia de línea | el cargo ya da la diferencia |
  | `total_linea` | total SAP − total del cargo |
  | `precio_ud` | (precio SAP − precio del cargo) × unidades |
  | `precio_cj` | (precio SAP − precio del cargo) × cajas |
  | `dif_ud` | diferencia por unidad × unidades |
  | `dif_cj` | diferencia por caja × cajas |

  - El modo recordado del cliente se aplica **una vez al abrir el cargo**. No pisa lo
    que se elige a mano.
- **Precio SAP:** se teclea tal cual sale en SAP, que lo da **por 100**
  (204,33 = 2,0433 €/ud), o ya por unidad (1,771).
  - En los modos de precio se elige automáticamente la lectura (÷100 o no) más
    cercana al precio del cargo.
  - En los modos de precio, un número con punto y sin coma (`1.313`) es decimal.
- **El precio de nuestra factura no sirve para restar**: lleva IVA y otros
  impuestos. El neto bueno es el de SAP.
- **ZNET:**
  - Se expresa «por 100 UC» o «por 100 CJ».
  - Estimación: ZNET = diferencia × 100 / cantidad.
  - Lo exacto se **mide en SAP**: se pone ZNET 10, se lee el neto y
    ZNET = diferencia × 10 / neto de prueba (columna «Neto de la prueba»).
  - El ZNET solo admite **2 decimales**. Lo que no se alcanza se cierra con **ZAJU**
    de cabecera.
  - Hay un afinado que reparte los céntimos entre líneas para minimizar el ZAJU.
- **Gamas y % de descuento no aplicado** (para el comercial, sobre todo en MDF):
  - Se detectan en la descripción **de nuestra factura**:
    - mermeladas: LVF, LVZ, LVN, LV0, LFF, LVD, LVC, LVT;
    - infusiones: una sola gama INFU; TIS, SUS y LAXANTES cuentan como INFU, y el
      sabor (LAXSANA…) es variante, no gama;
    - aceitunas: FRAGATA (alias FRA).
  - % = diferencia por unidad / precio SAP por unidad × 100.
  - Hay un resumen por gama para copiar.
- **Salida:**
  - copiar la tabla para SAP;
  - copiar solo los ZNET;
  - **copiar para el asistente SAP**: Pos · importe objetivo · descripción.
    - Los importes van con su signo.
    - Si las líneas no suman el cargo, la diferencia va a la línea mayor.
  - copiar el resumen de gamas;
  - **Registrar en el archivo de cargos**: pide el nº de abono y guarda el cálculo
    completo en la ficha (`calculo`: fecha, suma, total, zaju, factura, ZNET por línea
    y gamas).
  - El nº de cargo se repite abajo para copiarlo de un clic.

### 4.3 Comerciales
- Relación **cliente + marca → comercial** (nombre, correo, notas).
  - Si el cliente lo lleva una sola persona, la marca queda vacía y vale para todo el cliente.
  - Búsqueda por cliente: primero la clave `cliente|marca` y si no, `cliente|`.
- Buscador en todos los campos.
- Se usa en el correo de reclamación y en las hojas del Excel.

### 4.4 No conformes (seguimiento para la jefa)
- **Qué cargos salen:** los **no conformes no cerrados**, ordenados por días sin movimiento.
- **Situaciones:**
  - `sin_reclamar`: días desde la fecha del cargo;
  - `esperando`, «reclamado, sin respuesta»: días desde la última reclamación;
  - `revisa`, «lo revisa con el cliente»: días desde la respuesta.
- **Aviso** si llevan más de **7 días** sin movimiento.
- **Botones:**
  - Reclamado: la primera vez marca `reclamado` y pone `fechaReclamacion` = hoy;
  - Recordatorio: añade una fecha a `recordatorios[]`;
  - «Lo revisa con el cliente»: `respuesta = {tipo:'revisa', fecha}`;
  - Correo, Ficha y Cerrar.
- **Volver a reclamar** después de una respuesta manda esa respuesta a
  `respuestasAnteriores[]` y el cargo vuelve a «esperando».
- Las fechas de la 1ª reclamación y de la respuesta se pueden editar.
- **Contadores:** abiertos, sin reclamar, sin respuesta, revisando e importe en juego.
- Lo mismo sale en la hoja «No conformes» del Excel.

## 5. Estado de un cargo

```js
function recalcularEstado(c){
  if(c.cerrado) c.estado = 'cerrado';                                  // solo a mano
  else if(c.conforme === false && c.reclamado) c.estado = 'reclamado'; // esperando al comercial
  else if(c.abono) c.estado = 'abonado';
  else if(c.calculo || c.clasificado) c.estado = 'en curso';
  else c.estado = 'pendiente';
}
```

- **Cerrar un no conforme sin reclamarlo:** se pregunta antes, pero no se impide.
- **Cerrar un cargo sin nº de abono:** en lote no se permite. Desde No conformes sí.

## 6. Modelo de datos actual (JSON) y propuesta para Supabase

**Hoy, en el JSON:**

```text
memoria = {
  version: 2,
  cargos: { <id>: Cargo },
  comerciales: { "<CLIENTE_NORM>|<MDD|MDF|''>": {cliente, marca, nombre, correo, notas} },
  clientes: { "<CLIENTE_NORM>": {nombre, modo, base, veces, ultimo} },   // memoria por cliente
  log: [ {ts, accion, ...datos} ],                                        // registro
  pdfIndice: {carpeta, fecha, rutas:[...], saltadas:[...]},
  rutaHtml, rutaCarpeta                                                   // rutas para el Excel
}

Cargo = {
  cliente, asignacion, importe, moneda, fecha, clave, ndoc, referencia, fechaEntrada,  // del listado SAP
  enListado,
  marca: ''|'MDD'|'MDF', clasificado: ''|'precio'|'mercancia',
  conforme: null|true|false, marcadoEnSap, compensado, pdfGuardado,
  reclamado, fechaReclamacion, recordatorios:[fechas], respuesta:{tipo,fecha}|null, respuestasAnteriores:[],
  abono, fechaAbono, calculo:{fecha,suma,total,zaju,lineas,factura,znet:[{pos,material,cantidad,znet,importe}],gamas},
  nota, cerrado, fechaCierre, estado, fechaPedido, pedidoCliente
}
```

**Propuesta de tablas** (a revisar con Pablo):

| Tabla | Contenido |
|---|---|
| `ci_cargos` | Una fila por cargo I. Todos los campos de arriba. Clave única `(cliente_norm, asignacion_norm)` entre los no borrados. `calculo` y `revision` en `jsonb`. Borrado lógico. |
| `ci_reclamaciones` | Histórico de no conformes: tipo (reclamado / recordatorio / respuesta), fecha, quién. Sustituye a `recordatorios[]` y `respuestasAnteriores[]`. |
| `ci_comerciales` | cliente, marca (null = todo el cliente), nombre, correo, notas. |
| `ci_clientes_memoria` | modo y base recordados por cliente. |
| `ci_listados` | Cada listado de SAP importado (quién, cuándo, cuántos cargos). |
| `ci_audit` | Disparador de auditoría sobre `ci_cargos`: antes, después, quién, cuándo. Sustituye al `log`. |
| `profiles` | Si se usa el proyecto de la otra app, ya existe. Roles `admin` / `usuario`. Hace falta un usuario de solo lectura, o un rol para la jefa. |

- **Índice de PDF:** no va a Supabase. Son rutas de la red de la empresa, y el PDF se
  abre en el PC. Va en IndexedDB del navegador, como el lote a medias de la otra app.
- **Excel `Cargos_I.xlsx`:** en la web puede ser un botón «Descargar Excel», con las
  mismas hojas y columnas que `hojasDelLibro()` del lanzador. La jefa, en vez de abrir
  el Excel, puede entrar con su usuario y ver la pestaña No conformes.

**Migración de datos:** importar el JSON actual (`contabilizador_cargos_I.json`) con
un script o pantalla de admin, y solo con el OK de Pablo. Se conserva el `log` como
auditoría histórica.

## 7. Qué cambia al pasar a web (y qué no)

| Hoy | En la web |
|---|---|
| Archivo JSON en OneDrive (un usuario) | Supabase, compartido, con usuarios y RLS |
| Abrir el HTML con doble clic | URL de Vercel, con inicio de sesión |
| Excel regenerado en cada guardado | Descarga a demanda (y la vista para la jefa) |
| `localStorage` para modo noche | Igual, o en el perfil |
| pdf.js incrustado | Dependencia npm (`pdfjs-dist`), alojada en la app, sin CDN |
| Leer PDF arrastrados | **Igual, en el navegador.** No se suben. |
| Carpeta de PDF con File System Access | **Igual, en el navegador** (Edge o Chrome). El permiso de carpeta hay que darlo en cada sesión: Edge no lo guarda. |
| Macro AsistenteSAP en Excel | **Se queda en Excel.** La web le da los datos por el portapapeles (Pos · importe · descripción, pegar en B12). |

## 8. Lecciones aprendidas (no repetirlas)

Todas están detalladas en `docs/decisiones.md`.

- **Carpeta en red/OneDrive:**
  - nunca leer subcarpetas sin límite ni sin tiempo máximo;
  - una carpeta que no responde se salta y se avisa;
  - al releer no se tira lo ya conocido de esa carpeta.
- **Números:**
  - `num()` trata una sola coma como decimal (formato español) y `1.234,56` como miles;
  - los precios con punto y sin coma son decimales;
  - SAP escribe los negativos con el signo detrás (`97,78-`) y los miles con punto.
- **Memoria por cliente:** se aplica al llegar el cliente, no en cada repintado. Si no,
  pisa lo que se elige a mano.
- **Reimportar el listado** no debe crear cargos nuevos por cambiar la fecha o el
  importe. Se cruza por cliente + asignación.
- **Emparejar PDF:** no enlazar el documento de otro cargo. Es peor enlazar mal que no enlazar.
- **Interfaz:**
  - las 14 columnas de la cola caben en pantalla sin deslizar de lado;
  - las píldoras de estado no se recortan («Reclamado»);
  - cada pestaña recuerda su scroll.

## 9. El Asistente SAP (VBA, se queda local)

`sap/AsistenteSAP.bas` se importa en un Excel con macros (hoja «Asistente SAP»).

- **Por qué es local:** el **SAP GUI Scripting está desactivado en el servidor (PRO)**.
  Se pidió a sistemas activar `sapgui/user_scripting` (por usuario, autorización
  S_SCR). Mientras tanto, la macro trabaja con **teclas (WScript.Shell SendKeys) y
  ratón** (selecciona la casilla arrastrando y copia con Ctrl+C), con coordenadas
  calibradas respecto a la ventana de SAP.
- **Flujo por posición**, en una sola visita a la pestaña Condiciones de VA01 ZG2:
  1. Lee el nº de posición. Salta las que no están en la lista.
  2. Ctrl+Fin lleva a la fila en blanco. Espera 0,4 s, teclea
     `ZNET{TAB}10{TAB}{TAB}100` y pulsa Intro.
  3. Lee el Neto de arriba.
  4. El neto es una **recta**: neto = a·ZNET + b. b no es 0 si hay importes fijos (ZTRT).
     Con dos medidas se calcula el ZNET exacto. Se hacen hasta 4 intentos.
  5. Busca **desde arriba** la fila cuyo Importe dice `10,00`. El ZNET va antes que
     los subtotales que repiten ese valor.
  6. Escribe encima y **comprueba la casilla antes de Intro** (hasta 2 veces por fila;
     si no cae, prueba la siguiente fila que coincida).
  7. Lee el neto y lo compara con el objetivo.
  8. Mayús+F7 pasa a la siguiente posición. Al acabar, avisa del ZAJU que queda.
     **No graba nunca.**
- **Calibración, 7 puntos:**
  - casilla Posición, bordes izquierdo y derecho;
  - casilla Neto, bordes izquierdo y derecho;
  - Importe de la fila 1, bordes;
  - Importe de la **fila 10**, para medir bien el alto de fila.

  Se calibra con la columna **Descripción escondida**, que es como queda la tabla al
  tabular hasta «por».
- **Sigue donde se paró:** usa los neto de prueba y ZNET apuntados en la hoja.
- **Importes negativos:** se respetan (ZNET negativo `97,78-`). **Pendiente de
  confirmar que SAP lo acepta.**
- **Si se activa el scripting:** reescribirlo con `GetObject("SAPGUI").GetScriptingEngine`.
  Leería y escribiría los campos por su id, sin ratón ni calibración. Podría ser un
  `.vbs` que la web genere o descargue.

## 10. Pruebas

- **Hoy:**
  - `node build/construir.js`;
  - `CASOS=<carpeta de PDF reales> node pruebas/probar.js` (cuadre al céntimo de
    cargos reales y emparejado de archivos);
  - `node pruebas/auditoria.js` (comportamiento: Excel, reimportación, estados, No
    conformes, gamas, precio SAP, carpeta que no responde…).

  Las dos con Playwright y Chromium.
- **5 comprobaciones fallan solo en el contenedor de pruebas**, porque las fuentes
  recortan columnas de la cola. Fallaban ya antes de los últimos cambios.
- **En la web:**
  - pasar la lógica pura (parsers, cálculo, emparejado, estado, gamas, números) a
    módulos `src/rules/` con pruebas `node --test`;
  - mantener los casos de `pruebas/casos/*.json` como pruebas de regresión;
  - los PDF reales, **fuera de git**.

## 11. Pendientes abiertos

1. Confirmar que funciona la calibración nueva del asistente (punto 7 en la fila 10).
2. Confirmar que SAP acepta el ZNET negativo `97,78-`.
3. PDF de HIPER USERA C/5300006069: está en el índice
   (`04 CARGOS REPARTIDOS/PABLO/HIPER USERA 5300006069.pdf`) pero la cola no lo
   enlazaba. Falta la captura del diagnóstico del buscador.
4. Respuesta de sistemas sobre SAP GUI Scripting.
5. Opcional: parser del «Resumen» de SAP pegado (Ctrl+Y) y conciliación diaria por
   Ref. cliente (VA05).

## 12. Plan propuesto

1. **Repositorio y esqueleto.**
   - Repo privado en GitHub de Pablo.
   - Vite + Preact + htm.
   - `vercel.json` con CSP (sin CDN; `connect-src` solo la app y Supabase).
   - Proyecto en Vercel conectado al repo; `vercel-build` = `npm test && npm run build`.
2. **Supabase.**
   - Decidir si es proyecto propio o compartido (sección 2).
   - Migraciones idempotentes: tablas `ci_*`, RLS, funciones `security definer`,
     auditoría.
   - Auth con correo y contraseña. Altas solo por el admin. Rol para la jefa.
3. **Portar la lógica pura** de `src/calculadora.html` a `src/rules/`, con sus pruebas:
   - `num`, `numPrecio`;
   - parsers de factura y cargo;
   - emparejado;
   - cálculo y afinado del ZNET/ZAJU;
   - gamas;
   - `recalcularEstado`;
   - `seguimientoNC`;
   - claves de asignación;
   - lectura del listado.
4. **Pantallas**, en el mismo orden y con el mismo comportamiento: Cola, Ficha,
   Calculadora, Comerciales y No conformes. Con modo noche.
5. **Carpeta de PDF** con File System Access e índice en IndexedDB.
6. **Excel descargable** con las mismas hojas.
7. **Importar el JSON actual**, con el OK de Pablo, y comparar recuentos con el lanzador.
8. **Convivencia:** el lanzador sigue funcionando hasta que Pablo dé por buena la web.

## 13. Archivos que hay que llevarse

De `Eskiador/support-bot-mvp`, rama `claude/contabilizador-cargos-i-ko1xgk`:
- `src/calculadora.html`: toda la lógica y la interfaz actuales.
- `docs/decisiones.md`: el porqué de cada regla. **Leer antes de cambiar nada.**
- `README.md`: manual de uso actual.
- `pruebas/` (`probar.js`, `auditoria.js`, `casos/`, `casos_emparejado.js`): para
  convertirlas en pruebas de la web.
- `sap/AsistenteSAP.bas`: se queda como herramienta local.
- `build/construir.js` y `vendor/`: solo como referencia. En la web, pdf.js va por npm.

Y del PC de Pablo:
- el JSON de datos actual;
- un `Cargos_I.xlsx` de ejemplo;
- la carpeta de PDF de casos reales para las pruebas (sin subirla a git).

---

### Mensaje para empezar con Claude Code en el repositorio nuevo

> Quiero convertir mi «Contabilizador de Cargos I» (hoy un HTML que abro desde el
> disco, con los datos en un JSON) en un programa web. El repositorio estará en mi
> cuenta de **GitHub** (privado), se publicará en mi cuenta de **Vercel** y los
> datos irán a mi cuenta de **Supabase** (región UE).
>
> Lee primero `docs/TRASPASO_VERCEL_SUPABASE.md` y `docs/decisiones.md`.
>
> - Usa el mismo stack y las mismas convenciones que mi otro programa de cargos:
>   - Vite + Preact + htm, y Supabase con RLS y funciones `security definer`;
>   - borrado lógico y auditoría;
>   - Vercel publicando `main` solo si pasan las pruebas.
> - Los PDF no se suben nunca: se leen en el navegador.
> - No cambies ninguna regla de negocio sin preguntarme.
>
> Antes de escribir código, dame el plan por fases y pregúntame:
> - si uso un proyecto de Supabase nuevo o el de mi programa de cargos;
> - qué usuarios y roles necesito (yo como admin y mi jefa).
