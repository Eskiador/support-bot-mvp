# Decisiones cerradas

Lo que estaba abierto en el brief y cómo quedó. Sirve para no rehacer
conversaciones ya tenidas.

## Del cálculo

| Punto | Decisión |
|---|---|
| Origen de las líneas | El PDF del cargo trae el detalle por artículo. La factura aporta cantidades, precios y unidades por caja |
| Cómo se calcula la diferencia | Cada línea tiene la suya. El total es la suma, no un prorrateo |
| Cuadre | Siempre contra el importe **sin IVA** (base imponible) del cargo |
| Decimales de salida | 2, que es lo que admite SAP |
| Residuo de redondeo | No se reparte entre líneas: va a una condición **ZAJU** de cabecera |
| Un cargo, ¿una factura? | Siempre una |
| Cargo por redondeo | Por debajo de 1 € se avisa y se propone conformar sin desmenuzar |
| Usuarios | Uno solo. Sin control de concurrencia ni campo de autor |

## Del mecanismo en SAP

El abono se monta partiendo de la factura, borrando las líneas no afectadas y
metiendo en las afectadas una condición **ZNET**. A mano se hace así: se teclea
ZNET 10 por 100 UC, se mira el importe que devuelve SAP y se hace una regla de 3
para escalarlo hasta la diferencia buscada.

La herramienta calcula directamente el resultado de esa regla de 3:

```
ZNET = diferencia × 100 / cantidad
```

Comprobado contra el abono GAC 1519001122 (cargo Alimerka 2025-1970008318): los
nueve ZNET coinciden con los que se tecleraron a mano.

### El límite de los 2 decimales

Con ZNET expresado *por 100 unidades*, el importe de una línea solo puede tomar
valores múltiplos de `cantidad / 100 × 0,01`. En una línea de 10.080 unidades ese
salto es de **1,008 €**: hay importes a los que sencillamente no se llega.

Por eso el ZAJU no es un parche, es la pieza que cierra el cargo. En el caso
Alimerka las líneas llegan a 232,82 € y el ZAJU de +0,01 € deja el abono en los
232,83 € del cargo.

## De la lectura de archivos

**Nada de OCR.** Se lee el texto real.

El PDF de la factura sale de nuestro SAP, así que su formato es **el mismo para
todos los clientes**: un solo parser lo cubre todo. El del cargo lo genera cada
cliente y varía; por eso todo lo leído es editable y hay entrada manual.

El XPS/OXPS es un ZIP con XML dentro. No guarda espacios: cada letra lleva su
avance y los espacios y saltos de columna hay que deducirlos de ahí. Los números
salen exactos; las descripciones, con espaciado irregular. Es respaldo, no la
vía principal.

### La regla de 3 no hace falta

Meter ZNET 10, mirar el importe que devuelve SAP y escalarlo da el resultado
correcto, pero es un rodeo. Con la condición expresada *por 100 UC*:

```
importe de línea = ZNET / 100 × cantidad
```

Despejando, cuando el cargo da el precio correcto por unidad:

```
ZNET = (precio facturado − precio del cargo) × 100
```

Es decir: **la diferencia por unidad con la coma corrida dos lugares**. Sin
teclear el 10, sin mirar el 1.008 y sin dividir. Comprobado contra las nueve
líneas del cargo de Alimerka: salen los mismos ZNET (0,009 → 0,90; 0,023 → 2,30).

Cuando el cargo da el importe de la línea en vez del precio, es
`ZNET = importe × 100 / cantidad`. Tampoco hace falta la regla de 3.

> **MATIZADO.** Esto vale mientras SAP calcule el importe de línea como
> `ZNET / 100 × cantidad`, que es lo que hace en la mayoría de los casos. Pero no
> siempre: en el cargo de Alcampo 098017625 el factor real era 0,2387 en vez de
> 0,24, por conversiones o descuentos internos que no se ven desde fuera. Ahí la
> regla de 3 **sí hace falta**, y con el neto medido en SAP, no estimado. La
> fórmula de arriba se queda como estimación de partida; la medición manda.

> **CORREGIDO.** Restar el precio de **nuestra factura** era un error: lleva IVA y
> otros impuestos, y no es el neto. El precio de SAP se teclea a mano en la
> columna «Precio SAP», y si falta, la línea no se calcula.

### Subir la base del ZNET quita el descuadre

El salto mínimo de una línea es `cantidad / base × 0,01`. Con base 100 y 10.080
unidades, ese salto es de 1,008 €: por eso hay importes inalcanzables.

Pasando la base de **100 a 1.000 unidades** el salto se divide entre diez y el
cargo de Alimerka cuadra **exacto, sin ZAJU**: la línea 70 alcanza sus 17,67 €
(ZNET 23,01 por 1.000 UC) y el total sale 232,83 €.

> **SUPERADO.** Probado en SAP: el campo *por* **sí admite 1.000**, pero no vale:
> «aunque el precio disminuye, la cantidad sube mucho». El ZNET baja, sí, pero
> SAP escala la cantidad en la misma proporción y el importe de la línea no gana
> precisión. Las bases se han reducido a las dos que se usan de verdad, **100 UC
> y 100 CJ**, y el descuadre se resuelve midiendo el neto real (ver «Medir en SAP
> en vez de estimar»).

## Perfiles de cargo reconocidos

| Cliente | Cómo viene | Modo |
|---|---|---|
| Alimerka | Tabla con importe por línea, y además el precio correcto en el texto | Importe de línea |
| Alipensa | Sin importes: solo "ARTÍCULO ES A 2,125" y un total | Precio correcto por unidad |
| Alcampo | Dos renglones por artículo (facturado + / correcto −) y el signo detrás del número | Importe de línea, fundiendo los pares |
| Peninsulaco | Dos renglones por artículo, etiquetados `ART.FACTURADO` y `ART.ENTREGADO` | Importe de línea, fundiendo los pares |
| Hiper Usera y otros | La asignación lleva "C/" delante; el archivo de la carpeta va sin ella | — (afecta al emparejado, no al cálculo) |
| Grupo Hermanos Martín | En SAP `C/ 0D/4102`; en la carpeta `GRUPO HNOS MARTÍN 0D-4102.pdf` | — (afecta al emparejado) |

En el perfil sin importes la diferencia solo se puede calcular con la factura
delante, porque el precio facturado no está en el cargo. El cargo sí dice de qué
factura se trata y la herramienta lo rellena solo.

## Hallazgos en cargos reales

**El cargo puede contradecirse a sí mismo.** En el cargo de Alimerka, tres líneas
tienen la misma diferencia (0,023 × 768 = 17,664) pero el cliente escribió 17,66
en dos y 17,67 en la otra. Manda el cuadre del total, no la línea suelta.

**El código de artículo del cargo no sirve para casar.** Alimerka lo manda como
`00000000` y las descripciones son las suyas, no las nuestras. El emparejamiento
se hace por orden y parecido de texto, y siempre se puede corregir a mano.

## Pendiente de resolver con más cargos

- Ningún **cargo** visto todavía viene expresado en cajas. El modo existe y usa la
  columna `UC/US` de la factura, pero no está probado contra un cargo real. Sí ha
  aparecido ya una **factura** en cajas (ver «La factura que venía en CJ»), así que
  al menos la conversión tiene un documento real detrás por un lado.
- ~~Falta ver el export del listado de cargos I de SAP~~ → resuelto, ver más abajo.
- Los cargos de diferencia de **mercancía** quedan fuera: se abonan poniendo la
  mercancía que el cliente dice que no le llegó, y el importe cuadra solo. No
  necesitan calculadora.
- Queda pendiente el descuadre de 0,72 € del cargo de Alipensa NC2417589: hace
  falta la factura 90194273 para saber si el cliente cuenta otras cantidades.

## Cuadrar las líneas a la fuerza

Cuando las diferencias calculadas no suman el importe del cargo, hay un botón
que reparte el hueco entre las líneas afectadas: primero en proporción a lo que
pesa cada una, y después afinando de céntimo en céntimo de ZNET, tocando en cada
vuelta la línea que menos se ha movido en proporción. El ajuste es reversible y
cada línea muestra en la columna «Desvío» cuánto se ha separado del cargo.

El veredicto distingue tres situaciones, porque no todos los descuadres
significan lo mismo:

| Estado | Cuándo | Qué significa |
|---|---|---|
| CUADRA | descuadre ≤ tolerancia | nada que hacer |
| SOLO FALTA EL ZAJU | descuadre ≤ el salto de la línea más fina | resto inevitable del redondeo del ZNET |
| NO CUADRA | por encima de eso | las diferencias y el cargo no dicen lo mismo: hay que mirarlo |

El tercer caso es el importante. En el cargo de Alipensa NC2417589 las seis
líneas alcanzan su objetivo exacto y aun así faltan 0,72 € sobre 39,02 (un 1,8 %):
eso no es redondeo, es que el cliente y nuestra factura no cuentan lo mismo.
Cuadrar a la fuerza deja el abono correcto, pero tapa esa discrepancia, así que
la herramienta lo dice antes de hacerlo.

## Cargo escrito a mano

Para clientes cuyo PDF no se deja leer. Se pega el texto (del PDF, de Excel o
tecleado), un artículo por renglón, y de cada uno se toma el último número como
valor y el resto como descripción. Se elige una vez si ese número es el importe,
el precio correcto o la diferencia por unidad, y el modo de cálculo se ajusta
solo. Hay vista previa en vivo de lo que ha entendido antes de aceptar.

## El listado de cargos I de SAP

Resuelto el punto que quedaba abierto en el brief. El export real trae la
cabecera en la **fila 8** y filas de subtotal intercaladas (`Cuenta 400131…`) que
hay que saltarse. Las columnas útiles van de A a H:

| Columna | Uso |
|---|---|
| Nombre 1 | cliente |
| Asignación | identificador del cargo |
| Importe en moneda local + Moneda | importe |
| Fecha contabiliz. | antigüedad y semáforo |
| Clave de reclamación | siempre `I` en este export |
| Nº documento | referencia de apoyo |

En el export de muestra: 1.273 cargos, 102 clientes, todos en euros.

**No hay identificador único.** La asignación se repite (hay tres filas idénticas
de ALDI Pinto, misma asignación, mismo documento, mismo importe y misma fecha).
La clave para cruzar reimportaciones es
`cliente|asignación|nº documento|fecha|importe` más un número de repetición. Es
estable mientras el export salga igual; si SAP cambiara el orden de las filas
repetidas, esas tres podrían bailar entre sí. Como las tres son idénticas, el
único riesgo es que el trabajo hecho sobre una aparezca en otra de las tres.

El listado incluye clientes internacionales. No hay columna que los distinga, así
que se importan todos y se filtran por cliente.

## Estado de un cargo

Se deduce de los pasos hechos, no se elige a mano:

| Estado | Condición |
|---|---|
| Pendiente | nada hecho |
| En curso | clasificado o con el cálculo guardado |
| Abonado | tiene nº de abono |
| Cerrado | abonado, compensado y —si es no conforme— reclamado |

Esto último implementa la regla del brief: un cargo no se cierra con pasos
abiertos, y el no conforme no se cierra hasta reclamarlo.

## El correo al comercial

Se genera con `mailto:`, que abre Outlook con destinatario, asunto y cuerpo ya
escritos. **El PDF no se puede adjuntar desde el navegador**: eso queda a mano, y
la ficha lo recuerda en pantalla. También hay botón para copiar solo el texto.

## Carpeta de PDF conectada

En vez de una macro en Excel (que además suele estar bloqueada en equipos de
trabajo), la carpeta de cargos se conecta con la misma API que ya guarda el JSON.
Se indexa una vez, recursivamente, y cada cargo encuentra su archivo por el
nombre: se normalizan nombre y asignación quitando todo lo que no sea letra o
número, y se busca la asignación dentro del nombre del archivo. Si hay varios
candidatos, gana el que además lleve el cliente y, entre esos, el nombre más
corto. Las asignaciones de menos de 5 caracteres se descartan para no provocar
falsos positivos.

Con eso, cada fila de la cola tiene su botón **Ver PDF**, y la ficha añade
**Calcular con este PDF**, que lo abre directamente en la calculadora.

Limitaciones reales:

- El navegador **no da rutas absolutas**. Para los enlaces del Excel exportado hay
  que teclear una vez la ruta de la carpeta en la unidad.
- Edge **vuelve a pedir permiso** de lectura de la carpeta cada vez que se abre el
  archivo. Es un clic, y la herramienta lo pide sola al arrancar.
- La columna «Abrir» del Excel usa `=HIPERVINCULO(...;...)`, con el nombre y el
  separador del Excel **en español**.

## Por qué el Excel lo escribe la herramienta y no al revés

La petición era tener **un solo Excel** con todo (cargos, comerciales, botones para
abrir cada PDF y para abrir la calculadora) y que el HTML escribiera en él cada
vez que se hace un abono.

Lo que **no** se puede hacer, y no es una decisión de diseño sino cómo funciona
Windows: dos programas escribiendo el mismo archivo. Si Excel tiene el libro
abierto, lo bloquea y el navegador no puede escribir; y si el navegador escribe
mientras el libro está abierto, al guardar desde Excel se machaca lo que escribió
el navegador. Con dos escritores, tarde o temprano se pierde trabajo.

La solución: **un solo escritor**. El estado vive en el JSON, que solo toca la
herramienta, y el libro `Cargos_I.xlsx` se **regenera entero** en cada guardado.
El Excel es siempre un reflejo actualizado, nunca una fuente de datos.

Consecuencia que hay que tener presente: lo que se escriba a mano en el Excel se
pierde en la siguiente actualización. La hoja «Calculadora» del propio libro lo
advierte.

Si el libro está abierto en Excel, la escritura falla y la herramienta lo dice en
la cabecera («Excel: bloqueado, ciérralo») en lugar de fallar en silencio.

### Cómo se escribe el .xlsx sin librerías

Un `.xlsx` es un ZIP de XML. El escritor usa el método **STORE** (sin comprimir),
que Excel acepta igual, así que no hace falta ningún compresor: basta con
calcular el CRC32 y montar las cabeceras del ZIP. Son unas 60 líneas.

El libro lleva cuatro hojas: **Cargos** (una fila por cargo, con la columna
«Abrir el cargo» como `=HIPERVINCULO` al PDF), **Comerciales** (con enlace
`mailto:`), **Calculadora** (el botón que abre el HTML y el recordatorio de la
fórmula) y **Registro** (el log append-only). Cabecera fija, autofiltro y formato
de moneda.

## Aviso antes de sobrescribir el Excel (corrección de un fallo real)

Un usuario conectó «Excel» apuntando a un archivo que ya tenía sus cargos
trabajados, y el archivo quedó vacío. Causa: **«Conectar Excel» no lee el
archivo elegido, lo sustituye entero** por lo que la herramienta tiene cargado
en ese momento — a diferencia de «Conectar archivo de datos» (JSON), que si el
archivo elegido ya existe, primero lo **lee** y solo después escribe. Si la
sesión no tenía el JSON reconectado, la herramienta tenía 0 cargos en memoria,
y ese 0 fue lo que se escribió encima del Excel real.

Corrección: antes de la primera escritura, si el archivo elegido ya tiene
contenido, se pide confirmación explícita con `confirm()`, indicando cuántos
cargos hay cargados ahora mismo. Si son 0, el aviso lo dice sin rodeos y
recomienda cancelar y conectar primero el archivo de datos. Solo se escribe si
el usuario confirma después de leer eso.

Esto no convierte el Excel en algo que se pueda leer de vuelta — sigue siendo
un reflejo de solo escritura, por las razones ya explicadas (dos escritores
sobre el mismo archivo pierden trabajo tarde o temprano). Lo que evita es que
la sustitución ocurra **en silencio**.

## Fila entera clicable en la cola

Primer aviso de uso real: el usuario no podía editar ningún cargo porque no
encontraba el botón «Abrir» — con muchas columnas queda al borde derecho de la
tabla, y en su pantalla se salía de la vista sin que fuera obvio que había que
desplazarse. La conclusión razonable desde fuera fue «no se puede editar».

Corrección: cualquier clic sobre una fila (fuera de los botones «Ver PDF» y
«Abrir») abre la ficha de ese cargo, igual que si se hubiera pulsado «Abrir».
Cursor de mano y resaltado al pasar por encima para que se note que es
clicable, y una frase fija encima de la tabla («Haz clic en cualquier parte de
una fila para abrir su ficha»). Los botones de la fila conservan su
comportamiento propio y no disparan también la apertura de la ficha.

## Del PDF abierto a la calculadora, sin volver a la carpeta

Segundo aviso de uso real: «Ver PDF» abre el cargo en otra pestaña del navegador
para leerlo, pero de ahí **no se puede arrastrar nada** a la calculadora, así que
había que ir a la carpeta a buscar el mismo archivo otra vez. El atajo existía
(«Calcular con este PDF») pero estaba escondido dentro de la ficha.

Cambios:

- Botón **«Calcular»** en cada fila de la cola, al lado de «Ver PDF». Un clic
  lleva a la calculadora con el cargo ya leído.
- Ese mismo clic **busca también la factura** en la carpeta conectada, por el
  número que el propio cargo menciona (`Ref. Fact. …`). Si la encuentra, la carga
  sola: el cuadre sale hecho sin arrastrar ni un archivo.
- Barra en la calculadora con el cargo que se está trabajando: botón para
  **reabrir su PDF** en otra pestaña mientras se calcula (hace falta para
  clasificar mercancía/precio) y, si la factura no apareció sola, botón para
  **buscarla por número** en la carpeta.

Al buscar la factura se excluye el archivo del propio cargo, porque su nombre
suele llevar también el número de factura y se encontraría a sí mismo.

## Perfil Alcampo: tres fallos de golpe

Primer cargo real que rompió varias cosas a la vez. Formato:

```
1  8410134028337  F-MERMELADA NARANJA...  80,00 KG   10   5,043   403,44
2  8410134028337  F-MERMELADA NARANJA...  80,00- KG  10   2,369   189,52-
```

**1. El signo va detrás del número.** `189,52-` no pasaba el filtro de celda
numérica (`/^-?[\d.,]+$/`), así que esas líneas se descartaban enteras. Ahora se
admite el signo final, que es como lo escriben los sistemas antiguos.

**2. La diferencia viene en dos renglones por artículo**: lo facturado en
positivo y lo que debió facturarse en negativo. La diferencia real es la suma
con signo (`403,44 − 189,52 = 213,92`). Se funden los pares que comparten código
de artículo y tienen signos opuestos. No afecta a Alimerka, donde el código es
`00000000` en todas las líneas y por eso se excluye.

**3. El total elegido llevaba el IVA dentro.** El documento declara
`Importe Neto: 308,59` (que es CON IVA, pese al nombre) y `Base Imponible:
280,54`. Se leía el primero y todo el cuadre salía inflado un 10 %.

La corrección no es añadir más rótulos a una lista de prioridades, porque cada
cliente los nombra a su manera. **La suma de las líneas es el árbitro**: si
coincide con alguno de los candidatos, ese es el bueno. Aquí las cuatro líneas
suman 280,54 y eligen la base imponible sin ambigüedad. Si ninguno coincide, se
mantiene el orden por rótulo, y si el importe elegido resulta ser otro candidato
multiplicado por el IVA, se avisa en rojo antes de calcular.

De paso, el patrón comodín del número de cargo leía el NIF del cliente
(`ESA00000000`) como si fuera el número. Ahora descarta lo que tenga forma de
NIF y prefiere `REF./PROV.`.

## Base del ZNET por línea

Con cantidades pequeñas el ZNET se dispara (24 unidades y 66,62 € dan 277,58 por
100 UC). Cada línea puede llevar ahora su propia base, elegible en la tabla de
salida, y hay un botón que busca automáticamente la que deja el número más
pequeño **sin perder ni un céntimo**.

Conviene entender la dirección, porque es contraintuitiva: el ZNET es
`diferencia × base / cantidad`. Bajar la base (de 100 UC a 1 UC) da un número
más pequeño; pasar de UC a CJ **lo hace más grande**, porque hay menos cajas que
unidades. Cambiar de base no altera el importe salvo por el redondeo a dos
decimales, y ese desvío se ve en su columna y lo absorbe el ZAJU.

## Medir en SAP en vez de estimar: la columna «Neto de la prueba»

Caso Alcampo 098017625. La herramienta preveía 213,92 y 66,62; SAP devolvió
**212,81 y 66,27** con esos mismos ZNET. El descuadre resultante era de 1,46 €,
demasiado para taparlo con un ZAJU.

Deducido de esas cifras, el factor real de SAP (euros de valor neto por unidad
de ZNET) es 0,2387 y 0,7957, cuando `cantidad/100` daría 0,24 y 0,80: SAP aplica
por dentro conversiones o descuentos que no se ven ni en el cargo ni en la
factura. **No se puede modelar desde fuera.**

La salida no es adivinar el factor, sino medirlo: se teclea un ZNET de prueba en
la línea, se lee el valor neto que devuelve SAP y se anota en la columna «Neto de
la prueba». A partir de ahí:

```
factor = neto de la prueba / ZNET de prueba
ZNET   = diferencia / factor
```

Es la regla de 3 original, pero con el dato real en vez de una estimación. Con la
medición puesta, el resultado sale exacto y el ZAJU desaparece.

**El ZNET de prueba conviene que sea grande.** SAP muestra el neto con dos
decimales, así que la precisión de la medida depende de cuántas cifras
significativas tenga. Con ZNET 10 el neto sale 2,39 y arrastra un error de unos
20 céntimos; con ZNET 1.000 sale 238,75 y el resultado es exacto. Por eso el
valor por defecto es 1.000, no 10.

La medición se invalida sola si se cambia la base de esa línea, porque se hizo
con la anterior.

## Dos fallos que destapó este cargo

**El PDF de Alcampo no tiene texto.** 2.068 objetos vectoriales, cero
caracteres, cero fuentes: el texto está dibujado como curvas. No es que el
lector falle, es que no hay nada que leer, y sin OCR (descartado en el brief) no
se puede extraer. Para estos cargos hay que usar la entrada manual, que ahora
admite el modo **«dos importes: facturado y correcto»**, pensado justo para este
formato: se pegan los dos números y la herramienta resta.

**Limpiar el «ES A» se comía una letra.** El patrón `\s*(?:ES\s+)?A\s*$` no
exigía espacio antes de la A, así que recortaba la última letra de cualquier
palabra acabada en A: `MENTA` → `MENT`, `LIMA` → `LIM`. Con las descripciones
mutiladas, el emparejado automático cruzaba los artículos (la mermelada de fresa
recibía la diferencia de la naranja). Al exigir el espacio se arregla.

Además, el emparejado gana una pista fuerte: si el renglón del cargo menciona la
cantidad de una línea de factura, casi seguro hablan del mismo artículo. Evita
cruces entre artículos de nombre parecido.

## Carpetas grandes: 25.000 archivos y 10 minutos de espera

La carpeta real de cargos tiene ~25.000 archivos. Al recorrerla entera en cada
arranque (Edge no conserva el permiso de lectura entre sesiones, así que hay que
volver a darlo y eso disparaba la relectura) la herramienta tardaba diez minutos
en estar lista. Inaceptable para una tarea diaria.

Tres cambios, todos medidos con un índice simulado de 25.000 archivos:

**1. El índice se guarda en el archivo de datos.** Solo las rutas, como texto:
25.000 rutas ocupan unos 860 KB dentro del JSON. Al arrancar se cargan en **58
ms** en vez de releer el disco. Recorrer la carpeta pasa a ser una acción
explícita («Volver a leer la carpeta»), necesaria solo cuando se añaden cargos
nuevos.

**2. Los archivos se localizan al abrirlos, no al indexar.** Antes se guardaba
el `FileSystemFileHandle` de cada archivo; ahora solo la ruta, y al pulsar «Ver
PDF» se baja por ella (`getDirectoryHandle` por carpeta y `getFileHandle` al
final). Es instantáneo y los handles no sobreviven a cerrar el navegador de
todas formas.

**3. Un índice de búsqueda, porque el problema no era solo leer el disco.**
Recorrer 25.000 nombres por cada cargo costaba 9 ms; con 1.273 cargos, pintar la
cola se iba a **más de once segundos**. Se construye una vez un `Map` con las
palabras del nombre de archivo y sus combinaciones de dos y tres
(`SORIADIS_C-2405NC0147.pdf` indexa `SORIADIS`, `C`, `2405NC0147`,
`C2405NC0147`…), que es donde caen las asignaciones. Pintar la cola completa
baja a **33 ms**.

Medido sobre 300 cargos con el nombre que propone la propia herramienta: los 300
se localizan, con 1 falso positivo entre los 973 restantes. Las asignaciones de
menos de 4 caracteres se descartan, y las de 4 exigen que el nombre lleve
también el cliente.

### Efecto colateral que salió en la misma prueba

`nombrePdf()` metía la asignación tal cual en el nombre sugerido, y hay
asignaciones con barra (`C/2405NC0147`). Windows no admite `\ / : * ? " < > |`
en un nombre de archivo, así que ese nombre no se podía usar para guardar. Ahora
se limpian esos caracteres.

## La fórmula, tal cual se hace en Excel

Corrección de rumbo pedida por el usuario. La hoja de Excel que venía usando a
mano hace exactamente esto, y es lo que la herramienta implementa ahora:

```
diferencia = (precio de SAP − precio del cargo) × unidades      ← o se teclea directa
ZNET       = diferencia × 10 / precio neto que da SAP con ZNET 10
```

Comprobado contra sus dos ejemplos reales:

| Diferencia | Neto con ZNET 10 | Excel | La herramienta |
|---|---|---|---|
| 90,72 | 1.008 | 0,9 | **0,90** |
| 3,20 | 0,77 | 41,5584416 | **41,56** |

El ZNET de prueba vuelve a ser **10** por defecto, no 1.000. Yo lo había subido
para ganar cifras significativas, pero se trabaja con 10 y con 10 funciona; el
campo sigue estando por si algún día hace falta afinar.

**Solo quedan dos bases: 100 UC y 100 CJ**, que son las que se usan de verdad.
Las de 1 y 1.000 eran ruido.

## El precio de la factura no sirve para restar

Cuando la diferencia sale de restar dos precios, el de nuestra factura **no
vale**: lleva IVA y otros impuestos, y el neto real solo se ve en SAP. Antes se
cogía automáticamente de la factura, y de ahí venían descuadres que no se
explicaban solos.

Ahora hay una columna **«Precio SAP»** que se teclea a mano. La de la factura se
queda al lado, en gris, solo como referencia. Si falta en alguna línea, la
diferencia no se calcula —en vez de calcularse mal— y se dice qué posiciones
faltan.

## Un cargo, un cálculo

Al montar las pestañas desapareció el botón «Cargo nuevo» y no quedó forma de
vaciar la calculadora salvo recargar la página, que además obliga a volver a dar
todos los permisos.

Y detrás había algo peor: los campos de cabecera solo se rellenaban **si estaban
vacíos** (`if(!$('#fTotal').value)`). Al encadenar un segundo cargo sin recargar,
el importe del primero se quedaba puesto y el cuadre se hacía **contra el total
equivocado**. Un abono mal por un campo que nadie mira.

Tres medidas:

- Botón **«Vaciar y empezar otro cargo»**, que deja la calculadora como recién
  abierta sin tocar los ajustes (tolerancia, base, ZNET de prueba) ni la carpeta
  conectada. Pide confirmación si había un cálculo hecho.
- Abrir un cargo desde la cola limpia sola: cada cargo empieza de cero.
- Cargar un PDF de cargo borra los campos que vienen de él (importe, nº de cargo,
  fecha) para que se rellenen con los nuevos.

Además, un aviso en rojo cuando la factura cargada no es la que menciona el
cargo: compara el número que trae el cargo con el de la factura abierta. Es el
síntoma típico de haber encadenado dos cargos sin darse cuenta.

## Conectar un archivo de datos que ya existe

Al conectar el archivo de datos se usaba `showSaveFilePicker`, y Windows soltaba
un «¿seguro que quieres reemplazarlo?» que asusta con razón: parece que vaya a
vaciar el archivo con todo el trabajo dentro.

No lo vaciaba —se lee antes de escribir— pero el diálogo equivocado para la
tarea equivocada. Ahora se pregunta primero si el archivo ya existe:

- **ya existe** → diálogo de ABRIR, sin aviso de reemplazo, y se cargan los datos
- **crear uno nuevo** → diálogo de guardar, como antes; si resulta que el archivo
  elegido ya tenía cargos dentro, se pide confirmación antes de conectarlo

### El fallo que había debajo

`cargarDesdeHandle` se llamaba con `silencioso = true` y **se tragaba cualquier
error**. Si el JSON estuviera dañado, no cargaba nada, dejaba el archivo
conectado, y el primer guardado lo sustituía por el estado vacío que había en
memoria. El archivo se perdía de verdad, y en silencio.

Ahora la lectura distingue tres situaciones:

| Estado | Qué se hace |
|---|---|
| vacío | se conecta y se empieza de cero |
| legible | se cargan los datos |
| **ilegible** | **no se conecta**, se avisa y no se escribe nada |

Lo mismo al reconectar en el arranque: si el archivo guardado no se puede leer,
se deja desconectado a propósito y la cabecera lo dice, en vez de quedarse
conectado esperando a pisarlo.

## «Carpeta conectada» cuando no lo estaba

Primer uso del índice guardado en un ordenador donde el navegador ya no tenía
apuntada la carpeta. La pantalla decía **«Carpeta conectada», 25.337 archivos,
PDF localizado en 754 de 1279 cargos**… y al pulsar «Ver PDF» fallaba, y «Volver
a leer la carpeta» no hacía nada.

Dos fallos, y el primero es de los feos: **estado que miente**. `pintarCarpeta()`
daba por conectada la carpeta con solo tener el índice cargado, y son cosas
distintas: el índice dice qué archivos hay y dónde, pero para **abrir** uno hace
falta el permiso de lectura, que Edge no conserva de una sesión a otra. La
pantalla mostraba lo que sabía del JSON, no lo que realmente podía hacer.

El segundo: `releerCarpeta()` empezaba con `if(!E.carpeta) return;`. Sin carpeta
enganchada el botón no hacía absolutamente nada, ni siquiera decirlo.

Ahora:

- Con índice pero sin carpeta, la zona lo dice tal cual — «Índice cargado, pero
  falta conectar la carpeta»— y ofrece el botón para engancharla.
- «Volver a leer la carpeta» sin carpeta conectada abre el diálogo en vez de
  callarse.
- «Ver PDF» sin carpeta explica qué falta y lleva la vista al botón.
- Y lo que hace el arreglo indoloro: **al reconectar la carpeta, si el índice
  guardado es de esa misma carpeta, no se relee nada**. Medido: 0 recorridos del
  disco, 25.050 archivos disponibles al instante.

## La barra de la asignación: «C/5300011522»

Muchos clientes (Hiper Usera y más) llevan en SAP la asignación con el tipo de
documento delante y una barra: `C/5300011522`. En la carpeta el archivo se llama
solo con el número, **porque Windows no admite la barra en un nombre de
archivo**. Así que ninguno de esos cargos encontraba su PDF.

La búsqueda pasa a intentar dos claves, en este orden:

1. la asignación entera sin separadores (`C5300011522`)
2. **solo el número** (`5300011522`)

Y al caer en la segunda se exige que el archivo lleve además el **cliente**, en
el nombre o en la carpeta que lo contiene, salvo que el número tenga 7 cifras o
más y sea el único candidato. Así `C/5300011522` encuentra
`HIPER USERA/HIPER_USERA_5300011522.pdf` y descarta
`ruido/FACTURA_5300011522_OTRA_COSA.pdf`.

El cliente se compara por palabras significativas (≥ 4 letras, saltando
«sociedad», «limitada», «supermercados» y similares), lo que además hace que
funcione cuando el cliente está en la carpeta y no en el nombre:
`COVIRAN/COVIRAN NC000051086.pdf`.

### Un archivo indexado dos veces

Encontrado al probar esto. Un archivo llamado solo con el número
(`5300011861.pdf`) generaba la misma clave por dos caminos —el nombre completo y
su único token— y quedaba **repetido en el índice**. Como la regla de
desempate era «si solo hay un candidato, vale», con el duplicado nunca se
cumplía y ese archivo no se encontraba jamás. Se deduplican las claves por
archivo al indexar, y los candidatos al buscar.

Sobre el nombre para guardar el PDF: ya se limpiaban `\ / : * ? " < > |` desde
la corrección anterior, así que el nombre que propone la herramienta nunca lleva
barra.

## Cuando la factura no se deja leer

Apareció una factura (nº 1509010571) de la que el lector saca el número pero
**ninguna línea**: un formato distinto al de las demás. El problema no era solo
ese archivo, era que **no había salida**: la entrada manual existía para el cargo
pero no para la factura, así que con la factura en blanco no se podía seguir.

Ahora el panel de escribir a mano sirve para las dos cosas, con un selector
arriba. Para la factura se pegan los campos separados por tabulador o por dos
espacios o más —así queda al copiar de un PDF o de Excel— en el orden
**posición · material · descripción · cantidad · precio**. Lo que falte se
deduce: basta con que cada renglón acabe en la cantidad.

Comprobado pegando a mano las nueve líneas de la factura 90224478: sale el mismo
cuadre que leyéndola del PDF, con los mismos nueve ZNET.

Además, leer un archivo y sacar cero líneas ya no se queda en un número
silencioso: la zona lo dice y ofrece el botón para escribirlas a mano ahí mismo.

## Por qué aquella factura salía con 0 líneas: venía en CJ

La factura 1509010571 de la sección anterior —la que obligó a montar la entrada
manual— no tenía en realidad «un formato distinto al de las demás». El formato
era exactamente el de siempre. Lo que cambiaba era **una sola columna**: la
unidad de medida ponía `CJ` en vez de `UC` o `CS`.

La localización de las columnas se apoya en encontrar la de la unidad de medida,
y las tres expresiones que la reconocían llevaban la lista escrita a mano
`UC|CS|US|KG|UD`. Sin `CJ` no se encontraba la columna, cada renglón se
descartaba por no encajar, y la factura salía con cero líneas — sin ningún aviso
de por qué.

Se ha añadido `CJ` a las tres (la de la cantidad con unidad pegada, la de buscar
la columna y la del panel de escribir a mano). Y como el nombre de la caja
depende del cliente —unos dicen `CS` y otros `CJ`— ahora hay un único sitio que
lo decide:

```js
const enCajas = um => /^(CS|CJ)$/i.test(um || '');
```

que usan tanto la conversión a la base del ZNET como el cálculo de la diferencia,
en lugar de repetir la lista por el código. Si mañana aparece un tercer nombre,
se toca ahí y ya.

Resultado con el archivo real: **13 líneas**, y la suma de importes da
`37.261,67`, que es exactamente el SUBTOTAL que la propia factura imprime en la
página 2. Queda como caso de prueba permanente
(`pruebas/casos/hiperusera-factura-CJ.json`), y para eso la batería admite ahora
casos de **solo factura**, sin cargo: hay formatos que conviene tener cubiertos
aunque no haya todavía un abono con el que compararlos.

## Auditoría del programa entero

Repaso completo del código buscando fallos, no solo del cuadre. Lo que aparece
aquí está comprobado ejecutándolo, y cada hallazgo ha quedado como comprobación
permanente en `pruebas/auditoria.js`, que se ejecuta aparte de las de cuadre:

```bash
CASOS=/ruta/a/mis/casos node pruebas/auditoria.js
```

### Los botones del Excel no funcionaban

Dentro de un `.xlsx` las fórmulas se guardan **siempre con el nombre inglés y
con coma** entre argumentos; Excel las enseña luego traducidas según el idioma
de quien abre el libro. La herramienta escribía `HIPERVINCULO("…";"…")`, que es
lo que se teclea en Excel en español pero no lo que va dentro del archivo, así
que cada botón «Abrir PDF» y «Escribir» salía como `#¿NOMBRE?`.

Ahora se escribe `HYPERLINK("…","…")`. El CSV que exporta el botón «Exportar»
es el caso contrario —lo interpreta el Excel del usuario, no el formato— y ahí
sigue en español, a propósito.

### El listado reimportado podía duplicar los cargos

La clave con la que se cruzan las reimportaciones se construía con cliente,
asignación, **nº de documento, fecha e importe**. Con eso, un cargo entraba como
nuevo —dejando huérfano el abono, la conformidad y las notas— en dos situaciones
nada raras: exportar el listado de SAP con otras columnas, y registrar un cargo
desde la calculadora antes de importarlo.

Ahora, antes de dar un cargo por nuevo, se busca uno anterior con **el mismo
cliente y la misma asignación** y se le trasladan los datos frescos del listado.
El aviso del final dice cuántos se han reconocido así.

Reconocer la asignación tiene su miga, y aquí hubo que rectificar sobre la
marcha. La primera regla —quedarse con el número más largo que lleva dentro—
parecía razonable hasta que se probó contra el listado real de 1.273 cargos:
Carrefour numera `20241051S3836`, `20241051S44696`… y todas comparten el tramo
de delante, así que **19 grupos de cargos distintos se habrían dado por el
mismo** y el trabajo de uno habría acabado en otro. Lo único que cambia de
verdad entre SAP y el documento es el tipo de documento con barra, así que se
quita solo eso. Con esa regla, los 1.273 cargos reales no producen ni una sola
colisión.

### El veredicto del cuadre mentía en las líneas medidas

«SOLO FALTA EL ZAJU» se decide comparando el descuadre con el salto más fino que
puede dar una línea, y ese salto se calculaba siempre como `cantidad / base`.
Pero en las líneas **medidas contra SAP** el salto lo marca la medición, y puede
ser cientos de veces más fino: en una línea de 10.080 unidades el cálculo daba
1,008 € cuando el salto real era de 0,002 €. Resultado: un descuadre de 0,50 €
se declaraba inevitable y **se escondía el botón de cuadrar las líneas**, que sí
podía resolverlo. Ahora el salto sale del factor real de cada línea.

### Líneas que desaparecían del cuadre sin decir nada

Si una línea viene en cajas y la factura no dice cuántas unidades lleva cada
una, la cantidad no se puede pasar a la unidad del ZNET. Esa línea se quedaba
sin ZNET y **fuera de la suma**, en silencio: el usuario veía «NO CUADRA» sin
ninguna pista. Ahora se dice cuáles son, cuánto suman y qué falta para
arreglarlo.

### Nombres de cliente que rompían la pantalla

Las razones sociales salen de SAP y se metían tal cual en el HTML. Un `<`, un
`&` o unas comillas dentro del nombre partían la fila: `GARC<IA & "HIJOS", S.L.`
se quedaba en `GARC`. Todo lo que viene de un documento o del teclado pasa ahora
por una función de escape antes de pintarse.

### Lo demás

- **El nº de factura se quedaba pegado.** Al cargar otra factura sin vaciar, en
  la cabecera seguía el número anterior, y ese era el que se registraba en la
  ficha del cargo. Ahora la factura cargada manda.
- **Solo se leía la primera hoja del Excel.** Si la exportación de SAP trae
  delante una hoja de portada o de parámetros, el listado entero parecía
  ilegible. Ahora se recorren todas y se coge la que lleva la cabecera.
- **`num` tapada por una variable.** En dos funciones había una variable local
  llamada `num`, el mismo nombre que la función que convierte los importes.
  No llegaba a fallar por dónde estaban las líneas, pero cualquier retoque en
  medio la habría dejado inservible sin avisar. Renombradas.
- **«Vaciar y empezar otro cargo»** dejaba el nº de factura del panel manual.
- La versión que se escribía en el archivo de datos (1) no coincidía con la del
  estado inicial (2); una fecha de abono vacía se escribía en el Excel como una
  raya; y el aviso azul de «todo medido» dejaba pegado su color al siguiente.

### Lo que se miró y estaba bien

- **Rendimiento.** Con 25.000 archivos indexados, 400 cargos y 3.000 líneas de
  registro: pintar la cola 272 ms, serializar el archivo de datos 22 ms (1,14 MB),
  generar el libro entero 26 ms. No hay nada que optimizar.
- **El listado real de SAP** (1.273 cargos) se importa entero, sin fechas ni
  importes perdidos, y reimportarlo no duplica ni un cargo.
- **La lectura de las facturas**: las tres reales (dos PDF y un XPS) dan número,
  fecha y líneas correctos.
- El libro generado se abre sin errores y con sus cuatro hojas.

### La asignación de la cola se borraba al leer el PDF

Cargo de PENINSULACO abierto desde la cola: en la ficha se ve
`CP-0008336`, pero al pasar a la calculadora el campo «Nº de cargo» aparecía
vacío.

Lo causó una corrección anterior. `procesarArchivo` limpia el importe, el número
y la fecha antes de leer un cargo nuevo, para que no se queden pegados los del
anterior. Pero al abrir desde la cola el orden es: escribir la asignación en la
cabecera → leer el PDF, así que esa limpieza **borraba lo que acababa de poner
el listado**. Después, la cabecera se rellenaba con lo que hubiera leído del
PDF; como PENINSULACO numera con guion (`CP-0008336`) y ningún patrón lo
reconocía, se quedaba en blanco.

Ahora lo que viene del listado de SAP se guarda en `E.fijado` y se repone tras
la limpieza: **la asignación del listado manda sobre el PDF**, que es lo
correcto porque es la que identifica el cargo en SAP y con la que se cruza al
registrar el abono. Vale igual si se abre desde la ficha y se arrastra el PDF
después.

De paso, el lector reconoce ya la numeración con guion. Se exigen seis cifras
para no confundirla con cosas como «IVA-2024», que también aparecen en estos
documentos.

### «¿De dónde saca la diferencia, si el cargo no la trae?»

Pregunta de un cargo de PENINSULACO: al asignar la línea, la diferencia aparece
sola, sin teclear ningún precio. La respuesta es que **el cargo sí la trae**,
solo que repartida en dos renglones por artículo:

```
1  8410134037506 MERMELADA DE FRESAS  12,000  3,296   39,551   Agrupacion 24->ART.FACTURADO
2  8410134037506 MERMELADA DE FRESAS   0,000  3,055  -36,660   Agrupacion 24->ART.ENTREGADO
```

Uno es lo que se facturó y el otro, en negativo, lo que debió facturarse. La
resta de los dos —2,891 €— es la diferencia, y coincide con hacerlo por unidad:
`(3,296 − 3,055) × 12 = 2,892`. Es el mismo perfil de Alcampo, y lo resuelve
`fundirPares()`: mismo código de artículo, importes de signo contrario, se
funden en una sola línea con el neto.

Lo que fallaba no era el cálculo, era que **no se veía**. La resta se calculaba
desde el principio pero no se enseñaba en ninguna parte, así que la diferencia
parecía salir de la nada. Ahora se dice en tres sitios: un aviso sobre la tabla
de líneas, la resta concreta dentro del desplegable «Línea del cargo»
(`213,92 € (403,44 − 189,52)`) y, al pasar el ratón por «Dato del cargo», de
dónde sale ese número exacto en cualquiera de los modos.

## Marcar el estado sin abrir la ficha

Compensar y reclamar una tanda de cargos es, por cargo, decir sí o no cuatro
veces. Hacerlo por la ficha eran cuatro acciones —abrir, bajar hasta el final de
la página, marcar, guardar— para una información que cabe en un clic. Con veinte
o treinta cargos de una tanda, eso es la diferencia entre un minuto y media hora.

Las casillas de **conforme**, **en SAP**, **compensado** y **reclamado** se
cambian ahora pulsando encima en la propia tabla. La de conformidad va en ciclo
(sin decidir → conforme → no conforme → sin decidir); las otras tres son un
interruptor. Toda la celda es zona de clic, no solo la etiqueta.

Tres decisiones que no son evidentes:

- **Las casillas que no aplican siguen sin aplicar.** No se marca en SAP la
  conformidad de un cargo sin decidir, ni se reclama uno que va como conforme.
  Al pulsarlas se explica por qué en vez de no hacer nada.
- **Se guarda con un respiro de 0,9 s.** Cada cambio reescribe el archivo de
  datos y regenera el libro entero; marcando veinte cargos seguidos serían veinte
  escrituras. Si se cierra la pestaña con algo sin guardar, el navegador avisa.
- **Si la ficha de ese cargo está abierta, se refresca** —sin saltar la página—
  porque si no sus casillas se quedarían con el valor viejo y «Guardar cambios»
  desharía lo que se acababa de marcar.

Y para la tanda entera, encima de la tabla aparecen botones que marcan **de una
vez todo lo que haya filtrado** («Marcar 11 como compensados»), con una
confirmación que enumera los primeros para poder ver qué se va a tocar. Solo
alcanzan a los cargos del filtro puesto en ese momento, y solo a los que les
falte esa marca.

Lo que no cambia: compensar un cargo no conforme **no lo cierra** mientras no
esté reclamado. La regla de cierre es la misma que antes.

### Las cinco casillas, y que quepan todas

Faltaba una: **PDF guardado** solo existía dentro de la ficha, así que era la
única de las cinco que obligaba a abrir el cargo. Ya está en la tabla, y las
acciones en lote también la cubren.

Añadir una columna a una tabla que ya iba justa habría empeorado lo de siempre:
deslizar de lado para llegar a las casillas de la derecha. Así que se ha
ajustado entera, con anchos fijos por columna (`table-layout:fixed`), algo menos
de aire y el nombre del cliente cortado con puntos suspensivos —entero en el
título—. Suma **1.028 px**, que es el mínimo por debajo del cual vuelve a
aparecer la barra: comprobado a 1.920, 1.440, 1.366 y 1.280 px, sin barra
lateral y sin texto recortado en ninguna celda salvo la del cliente, que se
corta a propósito.

Dos recortes para que cupiera:

- **La columna «Abrir» se ha quitado.** Su botón hacía lo mismo que pulsar en
  cualquier parte libre de la fila, que es lo que dice la pista de arriba.
- Los rótulos se han acortado (`SAP`, `Comp.`, `Recl.`, `PDF`, «no conf.»,
  «falta» en vez de «pendiente»), con el texto completo en el título de cada
  cabecera. «Pendiente» no cabía en su columna sin ensancharla de más.

### Cerrar es una decisión, no una consecuencia

El estado pasaba solo a **cerrado** en cuanto un cargo estaba abonado,
compensado y conforme. Sobre el papel es correcto —no queda nada por hacer—
pero en la práctica sacaba de la vista cargos que todavía se estaban trabajando:
marcas una tanda como compensada y media lista se te va a «Cerrado», con el
filtro «Ocultar los cerrados» puesto desaparecen, y ya no sabes por dónde ibas.

Ahora **el resto del estado se sigue deduciendo** (pendiente → en curso →
abonado, según haya cálculo, clasificación o nº de abono) pero el cierre es un
campo propio que se marca a mano:

- pulsando la **casilla de estado** de un cargo abonado, en la propia tabla; con
  otro clic se reabre y vuelve a «Abonado»;
- o con la casilla **«Cargo cerrado»** de su ficha;
- o en lote, con «Marcar N como cerrados» sobre lo que haya filtrado.

Solo se ofrece cerrar lo que tiene **nº de abono** —sin abono no hay nada que
cerrar— y si el cargo es **no conforme y no está reclamado**, se pregunta antes
en lugar de impedirlo: cerrarlo sin avisar al comercial es una decisión legítima,
pero conviene tomarla a sabiendas.

Efecto sobre lo ya guardado: los cargos que la versión anterior había cerrado
sola no traen el campo, así que **vuelven a aparecer como «Abonado»**. Es lo
buscado —quedan a la vista para cerrarlos cuando toque— y el trabajo hecho
(abono, conformidad, compensado, reclamado) no se toca.

De paso, el contador «Abonados sin compensar» contaba en realidad todos los
abonados. Ahora que compensar ya no los saca del estado, cuenta los que de
verdad están sin compensar.

### Grupo Hermanos Martín: el código lleva serie

Ningún cargo de este cliente encontraba su PDF. Comparando las dos listas:

```
en SAP            en la carpeta
C/ 0D/4102        GRUPO HNOS MARTÍN 0D-4102.pdf
C/0D/7635         GRUPO HNOS MARTÍN 0D-7635.pdf
C/ 0D/237         GRUPO HNOS MARTIN 0D-237.pdf
C/22088           GRUPO HNOS MARTÍN 0A-22088.pdf
C/ 0A/5605        HNOS MARTIN 0A-5605.pdf
```

El código de verdad es `0D-4102`, con su **serie** delante. La herramienta
buscaba con dos claves: la asignación entera (`C0D4102`, que no está en ningún
nombre por culpa de la C) y el número suelto de cuatro cifras o más (`4102`).
Con `C/ 0D/237` no había ni eso: tres cifras no llegaban a clave, y ese cargo no
tenía por dónde buscarse.

Ahora se busca también por la asignación **sin el tipo de documento**, que es
exactamente `0D4102` y aparece en el nombre del archivo. De paso resuelve un
caso que ya estaba mal: `C/ 0D/9341` y `C/ 0A/9341` son cargos distintos, y por
el número pelado se cogía el primero que apareciera.

### Buscar por el número suelto enlazaba el PDF de otro cargo

Encontrado al medir lo anterior contra el listado real. La clave del «número más
largo de dentro» la compartían cargos distintos: **19 grupos** en 1.273 cargos.
Carrefour numera `20241044S115781`, `20241044S71824`… —el tramo de delante es el
pedido— y también pasaba con `DOI25028401` / `ADI25028401` y con
`90196075SCR` / `90196075SCRSC`. Como el cliente casaba en todos, la herramienta
daba por bueno el PDF de **otro cargo del mismo pedido**.

La regla ahora es más estrecha: el número solo vale como clave cuando la
asignación **es** ese número (quitado el tipo de documento). Si lleva algo más,
manda el código entero. Medido sobre los 1.273 cargos reales: de 19 grupos
ambiguos a **cero**. Se pierde el enlace en algún caso en que el archivo esté
nombrado solo con parte del código, y es lo correcto: enlazar el documento de
otro cargo es peor que no enlazar ninguno.

Sobre el nombre del cliente, no hizo falta tocar nada: SAP dice «GRUPO HERMANOS
MARTIN» y la carpeta «GRUPO HNOS MARTÍN», pero basta con que case una palabra
significativa —MARTIN, sin acento tras normalizar— y `GRUPO` ya estaba en la
lista de palabras vacías.

### MDD o MDF

Cada cargo lleva ahora si es de **marca de distribuidor** (la del propio cliente)
o de **marca de fabricante** (la nuestra). No es lo mismo que la clasificación
mercancía / precio —que dice de qué va el cargo— sino de qué producto habla, y
cambia a quién se reclama y cómo se negocia, así que va en su propio campo.

Está en los mismos sitios que el resto del estado, para que no haya que abrirlo
todo: **columna propia en la cola**, que cicla con un clic (sin decidir → MDD →
MDF → sin decidir), **casilla en la ficha** junto a la clasificación, **filtro**
en la barra de arriba, un paso más en la checklist, y columna en el libro de
Excel y en la exportación a CSV.

También se puede poner **a toda una tanda de golpe**, que es lo normal cuando un
cliente entero es de una u otra. Eso obligó a generalizar las acciones en lote:
hasta ahora solo sabían poner casillas a «sí», y la marca lleva valor. Ahora cada
acción es `{campo, valor}` y el mismo botón sirve para las dos cosas.

La tabla pasa de trece a catorce columnas: de 1.028 a **1.086 px**, que sigue
entrando sin barra lateral a 1.280 px y de ahí para arriba.

### Un comercial por cliente Y marca

ALDI MDD es de Juan y ALDI MDF es de Pablo. La ficha del comercial se guardaba
solo por cliente, así que no había forma de tener los dos.

Ahora la clave es `cliente|marca`, y **la marca vacía significa «todo el
cliente»**, que es lo normal cuando no hay reparto. Al buscar el comercial de un
cargo se mira primero el de su marca y, si no hay, el general. **Al revés no**:
teniendo a Juan apuntado solo para MDD, un cargo MDF no es suyo — antes que
mandarle el correo equivocado, la ficha avisa de que falta apuntarlo.

Y si el cargo **todavía no tiene marca** pero el cliente sí está repartido, la
ficha lo dice con todas las letras («ponle la marca arriba y aparecerá el suyo»)
en lugar del genérico «no lo tengo apuntado», que ahí despistaría.

Lo guardado antes se migra al abrir el archivo de datos: los comerciales que solo
tenían cliente pasan a ser los generales de ese cliente. Sin esa migración no se
encontraría ni uno.

La cuenta de cargos de cada fila mira el nombre de cliente guardado, no la clave:
así sigue saliendo bien aunque la clave se haya escrito de otra forma.

### Buscador de comerciales

Con el reparto por marcas, la lista de comerciales pasa a tener hasta dos fichas
por cliente, así que encontrar una a ojo deja de ser viable enseguida.

Un solo cuadro de búsqueda que mira **todo lo de la ficha a la vez**: cliente,
marca, nombre, correo y notas. No hace falta elegir por qué campo se busca, que
es una decisión que el usuario no debería tener que tomar para encontrar algo.

Detalles que hacen que responda a lo que uno teclea:

- El texto pasa por `norm()`, así que **da igual la tilde y la puntuación**:
  «coviran» encuentra a COVIRÁN, y «juan@ejemplo» encuentra a juan@ejemplo.es.
- Las fichas generales responden a **«todo»**, que es justo lo que enseña su
  etiqueta en la tabla.
- El contador de la derecha dice «N de M», y cuando no casa ninguno lo explica
  («ninguno de los 4 apuntados casa con esa búsqueda») en vez de dejar la tabla
  vacía como si no hubiera nada guardado.

La exportación a Excel sigue sacando **todos** los comerciales, no lo filtrado:
es la lista maestra y un filtro puesto sin querer no debería recortarla.

### El orden importaba: arrastrar el listado antes de conectar el archivo

Reportado directamente por Pablo: "arrastro el nuevo listado de SAP, luego
conecto el .json para que se guarde, y se pone el listado ANTERIOR, que es el
que hay en el .json".

La causa estaba en dos sitios que por separado son correctos y juntos son una
trampa:

1. `guardarDatos()` sin archivo de datos conectado (`E.handle` es `null`) no
   tiene dónde escribir, así que **no hace nada — en silencio**. No hay error
   que dar: es un estado normal antes de conectar nada. Pero eso significa que
   arrastrar el listado sin tener el archivo conectado todavía se ve perfecto
   en pantalla (chip verde, aviso de "listado importado") y **no se guarda en
   ningún sitio**.
2. `aplicarDatos()`, que se llama al conectar un archivo de datos, hace
   `Object.assign(E.memoria, j)`: sustituye la memoria entera por lo que hay
   guardado en el archivo. Es lo correcto cuando se conecta un archivo con
   trabajo previo. Pero si el paso 1 acababa de dejar el listado nuevo solo en
   memoria, este paso lo **tira sin avisar** y deja lo que había en el archivo,
   que es el listado viejo.

El orden correcto siempre fue "conectar primero, arrastrar el listado después"
— así lo dice el README — pero nada en la herramienta impedía ni advertía del
orden contrario, y es fácil caer en él la primera vez que se usa un archivo de
datos nuevo.

En vez de exigir el orden correcto, se ha hecho que **el orden no importe**. Si
`guardarDatos()` no puede escribir, las filas del listado se guardan en
`listadoPendiente` (variable de sesión, no se persiste). En cuanto se conecta un
archivo de datos —tanto si es antes como si es después de arrastrar el
listado— `reaplicarListadoPendiente()` vuelve a pasar esas filas por
`importarListado()`, esta vez contra lo que acaba de traer el archivo, y avisa
de que lo ha recuperado. El aviso verde también dice, si hace falta, que
todavía no se ha guardado en ningún sitio.

Probado exactamente en el orden descrito: listado nuevo con dos cargos
(arrastrado sin archivo conectado) → conectar un archivo con un cargo antiguo ya
trabajado (abono puesto, nota escrita) → los dos cargos del listado nuevo
aparecen, y el trabajo del archivo (abono, nota) se conserva en el que coincide
por cliente y asignación.

## Gama y % de descuento no aplicado (solo MDF)

Pablo, cuando un cargo de precio es no conforme, a veces tiene que detallarle
al comercial en qué gama de producto se dejó de aplicar un descuento y en qué
porcentaje, para reclamarlo con conocimiento. Las gamas conocidas:

| Categoría | Códigos |
|---|---|
| Mermeladas | LVF (tradicional), LVZ (cero), LVN (natural), LV0 (0% azúcares añadidos), LFF (fusión), LVD (dietética), LVC (cocina selecta) |
| Infusiones | INFU, LAXANTES (tisanas no llevan gama: es normal, no un error) |
| Aceitunas | FRAGATA |

**De dónde se lee.** Siempre de la descripción de **nuestra factura**, nunca
del cargo: es el único documento con el mismo formato para todos los clientes,
y muchos cargos ni traen descripción reconocible. El código se busca como
palabra completa (con límites de palabra), sin distinguir mayúsculas ni
acentos, así que «MERMELADA DE FRESAS LVF 800G» encuentra LVF sin confundirlo
con LVZ o LVD.

**La fórmula.** `% = (diferencia de la línea ÷ unidades) ÷ precio de SAP × 100`,
siempre en positivo — es el número que se le dice al comercial, no importa la
dirección. Se calcula en **todos los modos**, no solo en los que restan dos
precios: se reutiliza `diferenciaDe()` (que ya da el total de la línea en
cualquier modo) y se divide por las unidades reales para tener un precio por
unidad comparable con el de SAP.

**Solo en MDF.** La marca de distribuidor no tiene gamas propias, así que si
el cargo no está marcado como MDF no se calcula ni se enseña nada de esto —
ni columnas, ni resumen. Por eso la calculadora necesita saber la marca: se ha
añadido un desplegable «Marca» en el paso 2 (Datos del cargo), que se rellena
solo cuando el cargo se abre desde la cola (si ya la tenías puesta ahí) y se
guarda de vuelta en la ficha al registrar el cálculo.

**Dónde se ve.** Dos columnas nuevas en la tabla de salida («Gama» y «% no
aplicado»), y un resumen agrupado por gama debajo, con la media de cada una y
un botón para copiarlo tal cual y pasárselo al comercial. Si una línea de MDF
no tiene gama reconocible (tisanas, agua, lo que sea fuera de catálogo), se
avisa de cuántas son sin tratarlo como un fallo — con tisanas es lo esperado.
El resumen queda guardado también en `c.calculo.gamas` al registrar, para
poder consultarlo después desde la ficha sin tener que volver a calcular.

### Un bug real que casi pasa desapercibido: dos elementos con el mismo id

Al construir esto apareció que la cola ya tenía un filtro por marca
(`<select id="fMarca">`, de la mejora anterior) y el campo nuevo de la
calculadora se llamó igual. `document.querySelector('#fMarca')` con un id
duplicado en el documento **siempre devuelve el primero** — en este caso, el
filtro de la cola — así que todo el código de la calculadora leía y escribía
sin darse cuenta sobre el desplegable equivocado.

Lo grave es que las primeras pruebas **pasaron igual**, porque tanto la
lectura como la escritura del valor caían sobre el mismo elemento erróneo
dentro de una prueba aislada: parecía funcionar porque el error era
consistente consigo mismo. Se destapó al encadenar dos pruebas seguidas: la
segunda arrancaba con el filtro de la cola todavía en «MDF» de la prueba
anterior, eso ocultaba de la tabla un cargo que la siguiente prueba necesitaba,
y la fila no llegaba a pintarse.

Arreglado renombrando el campo de la calculadora a `fMarcaCalc`. Queda como
aviso: un `id` duplicado no da ningún error en la consola, y unas pruebas que
solo miran «¿el resultado es el esperado?» sin aislar el estado entre ellas
pueden dar el visto bueno a un fallo real.

## Modo nuevo: «Totales de línea» (restar dos totales)

Hasta ahora, cuando el cargo daba el precio correcto (no la diferencia ya
calculada), solo se podía restar un precio **por unidad**. Pero a veces el
cargo da directamente el **total** que debía facturarse para toda la línea, y
lo que hay que restar es ese total contra el total que de verdad se facturó en
SAP para esa misma línea — sin multiplicar por nada, porque los dos números ya
son totales.

Se reutiliza el mismo campo «Precio / total SAP» (antes solo servía para un
precio por unidad): en este modo pasa a representar el total de SAP para la
línea entera. `precioSapPorUnidad()` decide cómo interpretarlo según el modo,
para que el % de gama —que siempre se mide por unidad— siga saliendo bien:
divide ese total entre las unidades reales de la línea antes de compararlo con
el precio de SAP de los demás modos.

## Nombres de los modos, más explícitos

A petición de Pablo: los nombres antiguos («Importe de línea», «Precio
correcto por unidad») no dejaban claro qué se restaba de qué. Ahora todos los
modos que restan dicen «SAP − cargo» en el propio nombre:

| Antes | Ahora |
|---|---|
| Importe de línea | Diferencia de línea (el cargo ya la da) |
| — (nuevo) | Totales de línea: SAP − cargo (restar) |
| Precio correcto/ud | Precio SAP − cargo, por unidad (restar) |
| Precio correcto/caja | Precio SAP − cargo, por caja (restar) |
| Diferencia/ud | Diferencia por unidad (el cargo ya la da) |
| Diferencia/caja | Diferencia por caja (el cargo ya la da) |

Son claves internas (`importe`, `total_linea`, `precio_ud`...) que no cambian:
solo el texto que se ve.

## Fecha del pedido: siempre a mano

Se planteó leerla sola del propio cargo (algunos, como Peninsulaco, la traen
en su cabecera: «Nº pedido / Fecha pedido»), pero Pablo prefirió escribirla
siempre él: la fecha del cargo es siempre posterior a la del pedido, así que
no hay una regla fiable para deducirla sola en todos los formatos. Campo
manual en la ficha, junto a Marca; sale también en el Excel y en la
exportación a CSV.

## Nº de pedido de cliente

Mismo mecanismo que la fecha del pedido: campo manual en la ficha, sin
ninguna regla que lo deduzca de otro documento, porque cada cliente lo
expresa a su manera (o no lo trae). Sale al lado de «Fecha del pedido», y
también en el Excel y en la exportación a CSV.

## Cada pestaña con su propio scroll

Las tres pestañas (Cola de cargos, Calculadora, Comerciales) son tres `<div>`
que se muestran u ocultan con `display:none`; la página nunca ha tenido un
contenedor de scroll por pestaña, sino uno solo, el de la ventana. Subir o
bajar en una pestaña movía ese único scroll, y al cambiar a otra —que
comparte el mismo scroll de ventana— aparecía en ese mismo punto, como si se
hubiera movido sola. `cambiarVista()` ahora guarda el `scrollY` de la
pestaña que se abandona en un objeto en memoria (`scrollPorVista`, por
nombre de vista) y restaura el de la que se abre, con 0 la primera vez que
se visita. No hace falta guardarlo en el archivo de datos: es una posición
de pantalla de esta sesión, no un dato del trabajo.

## «Marcar todas» no marcaba las líneas sin emparejar

El botón solo ponía `afectada = true` en las líneas que ya tenían una línea
del cargo asignada automáticamente (`cargoIdx >= 0`). Si el emparejado
automático fallaba para una línea —descripciones que no se parecen lo
bastante— el botón no la tocaba, aunque esa línea tuviera un valor tecleado
a mano en «Dato del cargo» con el que el cálculo funciona igual de bien sin
necesidad de una línea del cargo asignada (`datoCargo()` mira primero
`fila.manual`). «Marcar todas» ahora marca literalmente todas, que es lo que
dice el botón; «Desmarcar todas» ya lo hacía bien, sin esa condición.

## La tabla de líneas y diferencias, sin scroll horizontal

Doce columnas, dos de ellas desplegables con texto largo («Línea del cargo»,
con la descripción de cada línea del cargo; «Modo», con etiquetas del tipo
«Precio SAP − cargo, por unidad (restar)»), hacían que la tabla se saliera
de una pantalla normal — para ver la columna «Diferencia» había que deslizar
de lado. Iguala el tratamiento que ya tenía la cola de cargos (que sí cabía
en pantalla con sus catorce columnas): tipo más pequeño, menos relleno, y un
ancho máximo en los dos desplegables y en la descripción (con el texto
completo disponible al pasar el ratón o al desplegar, nunca se pierde
información, solo se deja de ver entera de un vistazo). Quedaba un sobrante
de 10 px por las cabeceras largas («Precio / total SAP», «Dato del cargo»)
forzando el ancho de su columna por encima de lo que ocupa el campo debajo;
se resuelve dejando que las cabeceras hagan salto de línea en vez de
imponer su propio ancho a la columna.

## Por qué no se guardaba ninguna gama: el PDF no es de fiar para esto

Pablo mandó un cálculo real donde la columna Gamas salía vacía. Mirando el
PDF de su propia factura, la gama va en una **segunda línea de texto**,
justo debajo del nombre del artículo:

```
60  2009446  8  MERMELADA HIGO
                  FR 263 ML 280G
                  LVF COCINA SELECTA        ← la gama está aquí
```

El lector del PDF agrupa el texto en filas por coordenada Y (`filasDePDF`), y
solo construye una línea de factura con la fila que trae posición + material
+ cantidad + precio + importe juntos; esa segunda línea de texto, sin
números, no encaja en ese patrón y se descarta entera. Por eso `gamaDe()`
nunca llegaba a ver la palabra que dice la gama.

Peor aún: en esa segunda línea, la gama no es un código suelto («LVD»,
«LVC», «LVT»...) sino **«LVF» + una palabra** («LVF DIET», «LVF COCINA
SELECTA», «LVF COMBINA CON TODO»). Aunque se leyera esa línea, con la lógica
de antes se habría detectado «LVF» (Tradicional) en todas, antes de llegar a
mirar la palabra que sigue.

**La solución no fue arreglar el lector del PDF.** Pablo encontró que
copiando y pegando el texto directamente desde SAP —selecciona las líneas
de la factura en SAP y las pega tal cual— la gama sale ya como código
suelto al principio de la descripción: «LVD MERM MELOC DIET», «LVC MERM
HIGOS», «FRA MANZ REL ANCHO». Sin ambigüedad ninguna: son los mismos
códigos que ya tenía el catálogo `GAMAS`, así que **no hizo falta añadir
ninguno nuevo ni adivinar cómo se escribe cada uno** — solo arreglar el
lector de «Pegar texto a mano» (que ya existía, para cuando el PDF no se
deja leer) para que entendiera bien esta forma concreta de pegar:

- Ese texto no trae precio por unidad, solo **cantidad e importe neto de la
  línea**, con la moneda detrás («60 UC 122,59 EUR»). El lector antiguo
  asumía que, con dos números al final, el segundo siempre era un precio
  por unidad — aquí habría entendido 122,59 €/unidad, un disparate. Ahora,
  si detecta un código de moneda (EUR/USD/GBP) al final de la línea, sabe
  que ese número es el importe de toda la línea, no un precio.
- «FRA» es como sale la gama de aceitunas al copiar de SAP; el PDF de la
  factura la escribe entera, «FRAGATA». Se normalizan las dos al mismo
  código con un pequeño diccionario de alias (`ALIAS_GAMA`), para que el
  resumen no le enseñe al comercial dos etiquetas distintas para la misma
  gama según de dónde se haya copiado el texto.

El lector del PDF se deja como estaba: el cuadre de importes seguía
funcionando bien con él (los números de cantidad/precio si estaban en la
fila correcta), el problema era solo de las gamas, y ese problema ya no
existe si la factura se pega en vez de arrastrarse.

## Modo noche

Pablo pidió una «versión noche» del programa porque prefiere trabajar sobre
fondo oscuro. Se ha hecho como un **botón en la cabecera** que cambia de tema
al vuelo, no como un segundo archivo HTML: mantener dos copias del mismo
programa las habría ido desincronizando en cada cambio futuro —cada arreglo
habría que aplicarlo dos veces, y tarde o temprano se olvidaría uno—, y aquí
todo el proyecto se apoya en que solo existe una fuente de verdad. Un
`data-theme="dark"` en `<html>` que cambia unas variables CSS cuesta lo mismo
de mantener que cualquier otro botón de la herramienta.

**Cómo está hecho.** Todos los colores del `<style>` ya vivían en variables
CSS (`--bg`, `--panel`, `--ink`, `--verde`, `--rojo`...), así que el trabajo
ha sido sobre todo declarar una segunda tabla de esas mismas variables bajo
`:root[data-theme="dark"]` y comprobar que ningún color se hubiera colado
escrito a fuego en algún sitio. La única sorpresa fue que algunas variables
se usan de dos maneras distintas: como **relleno sólido** con texto blanco
encima (`.dato.cuadra{background:var(--verde)}`) y como **color de texto**
sobre el fondo del panel (`.pasos .hecho{color:var(--verde)}`). El mismo verde
que se ve bien como relleno en modo oscuro queda demasiado apagado como texto
sobre un panel oscuro. Solución: variables `-txt` aparte (`--verde-txt`,
`--rojo-txt`, `--ambar-txt`, `--azul-txt`) que en modo claro valen lo mismo
que el color base y en modo oscuro son una versión más clara, solo para texto;
los rellenos siguen usando la variable original sin tocar.

**Sin parpadeo al abrir.** Si el tema se aplicara desde el script principal
(que carga después de pdf.js), se vería medio segundo en modo claro antes de
saltar a oscuro. Se evita con un script pequeño y síncrono, metido en el
`<head>` justo después del `<style>`, que lee `localStorage` antes de que el
`<body>` llegue a pintarse y pone el atributo `data-theme` de una vez. La
primera vez que se abre (sin nada guardado todavía) se respeta lo que tenga
Windows/Edge vía `prefers-color-scheme`, para no imponer un tema que nadie ha
pedido.

**Se recuerda solo.** El botón guarda la elección en `localStorage`
(`cargosI.tema`), no en el archivo de datos: es una preferencia de este
ordenador y este navegador, no un dato del trabajo, así que no tiene que
viajar en el JSON ni en el Excel. Vuelve a arrancar en el mismo modo la
próxima vez que se abra el HTML, sin volver a tocar el botón.

## Un botón de pegar por cada zona, no un desplegable

Con el pegado desde SAP como forma habitual de meter la factura, elegir
«cargo» o «factura» en un desplegable antes de escribir se había quedado
en un paso de más, en cada cargo. El botón único «Pegar texto a mano…» se
sustituye por dos, cada uno abriendo el panel ya en el modo que toca, sin
preguntar: «Pegar el cargo a mano…» a la izquierda, bajo «Cargo del
cliente», y «Pegar la factura a mano…» pegado del todo a la derecha, bajo
«Factura original» — con un espaciador entre los dos (la misma pieza
`.crece` que ya separaba otros pares de botones) para que cada uno quede en
su extremo en vez de los dos apretados al lado de su zona. El desplegable
se deja donde estaba por si hay que cambiar de modo una vez abierto el
panel, pero ya no hace falta tocarlo lo normal: entrar y pegar.

## Orden de columnas del Excel, pensado para el comercial

La hoja Cargos había ido creciendo columna a columna, cada una añadida al
final de la anterior según se iba necesitando — sin pensar en qué orden
le conviene a quien la lee, casi siempre un comercial buscando datos de un
cargo concreto. Pablo pidió fijar las doce primeras en el orden en que las
necesita: Fecha, Cliente, Asignación, Importe, Fecha pedido, Nº pedido de
cliente, Nº abono, Marca, Clasificación, Conforme, Gamas, Nota. El resto
—Días, Nº documento, Estado, Fecha abono, Marcado en SAP, Compensado,
Reclamado, Comercial, Abrir el cargo, Nombre del PDF— sigue detrás, en el
orden que ya tenía: son columnas que usa sobre todo la propia herramienta,
no algo que el comercial necesite mirar primero.
