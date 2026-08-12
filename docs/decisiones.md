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

### Subir la base del ZNET quita el descuadre

El salto mínimo de una línea es `cantidad / base × 0,01`. Con base 100 y 10.080
unidades, ese salto es de 1,008 €: por eso hay importes inalcanzables.

Pasando la base de **100 a 1.000 unidades** el salto se divide entre diez y el
cargo de Alimerka cuadra **exacto, sin ZAJU**: la línea 70 alcanza sus 17,67 €
(ZNET 23,01 por 1.000 UC) y el total sale 232,83 €.

Falta confirmar en SAP que el campo *por* admite 1.000. La herramienta ya ofrece
esa base para poder probarlo.

## Perfiles de cargo reconocidos

| Cliente | Cómo viene | Modo |
|---|---|---|
| Alimerka | Tabla con importe por línea, y además el precio correcto en el texto | Importe de línea |
| Alipensa | Sin importes: solo "ARTÍCULO ES A 2,125" y un total | Precio correcto por unidad |

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

- Ningún cliente visto todavía expresa el cargo en cajas. El modo existe y usa la
  columna `UC/US` de la factura, pero no está probado contra un cargo real.
- Falta ver el export del listado de cargos I de SAP (Módulo 1).
- Falta un cargo de diferencia de **mercancía**: hasta ahora solo hay de precio.

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
