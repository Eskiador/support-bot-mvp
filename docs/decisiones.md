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
