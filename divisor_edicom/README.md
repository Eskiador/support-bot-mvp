# Divisor de confirmaciones EDICOM

Divide el PDF combinado que descargas de ediwin (`report.pdf`, `report (1).pdf`…) en un PDF por
documento, con el nombre `Confirmación Recepción_CLIENTE.pdf`, y los guarda en
`\\hq.gac\files\wmn\PEDIDOS\RECADV`.

**Regla de oro:** si algo no cuadra al 100 %, el programa se detiene, te dice qué
página falla y no escribe nada. Nunca adivina.

**Todo es visible:** cada `.bat` ejecuta el Python incluido en su propia ventana.
No usa PowerShell, no lanza procesos ocultos y no se instala en Windows.


## 1. Instalación (una sola vez)

0. **Antes de ejecutar nada, pasa `NOTA_PARA_INFORMATICA.md` y `HUELLAS.txt` a
   Informática** y espera su visto bueno (por el antivirus Cortex XDR).
1. Antes de descomprimir: clic derecho en `DivisorEDICOM.zip` → Propiedades →
   marca **Desbloquear** (abajo) → Aceptar. Así Windows no bloquea los `.bat`.
2. Descomprime el ZIP en `C:\EDICOM\` (quedará `C:\EDICOM\DivisorEDICOM\`).
   No hace falta instalar Python ni nada más: va incluido.
3. Primera prueba: **arrastra un PDF combinado de ediwin encima de `Simular.bat`**.
   Verás la tabla de documentos y los nombres que tendrían, sin escribir nada.


## 2. Uso diario

1. En ediwin, Entrada > Recibidos: selecciona las confirmaciones y descarga el
   PDF combinado. Fíjate en el número "Total".
2. Doble clic en **`Procesar.bat`**. Procesa todos los PDF de ediwin que haya en
   Descargas (`report.pdf`, `report (1).pdf` … `report (100).pdf` y
   `report - fecha.pdf`), del más antiguo al más nuevo, te enseña la tabla de documentos y te pide el Total de ediwin.
   Si coincide, guarda los PDFs y mueve el combinado a `_procesados`.
   (También puedes arrastrar un PDF encima de `Procesar.bat`.)

Con la **vigilancia** (`Vigilar.bat`) no hace falta ni eso: mientras su ventana
esté abierta (puedes minimizarla), al terminar cada descarga los PDFs se guardan
solos y sale un aviso con el número de documentos para que lo cuadres con el
Total de ediwin. Si hay un error, sale una ventana de error. **Cerrar la ventana
de la vigilancia la detiene.**

| Archivo | Qué hace |
|---|---|
| `Procesar.bat` | Procesa los pendientes (te pide el Total de ediwin) |
| `Simular.bat` | Enseña lo que haría, sin escribir nada |
| `Vigilar.bat` | Vigila Descargas mientras su ventana esté abierta |

Los combinados procesados se mueven a `_procesados`, así que no se repiten. La
**vigilancia** solo coge los PDF descargados después de la primera vez que se
usó la herramienta; para uno anterior, usa `Procesar.bat`.
Los "report" que no son confirmaciones (p. ej. un pedido) se ignoran sin tocarlos.


## 3. Dónde queda cada cosa

- PDFs generados: `\\hq.gac\files\wmn\PEDIDOS\RECADV`
- Combinados ya procesados: `_procesados\` (con fecha y hora delante)
- Registro Excel (una fila por PDF: Nº doc, cliente, fecha, páginas…):
  `registro\registro_confirmaciones.xlsx`
- Log diario: `registro\logs\`

Numeración: si un cliente tiene un solo documento se guarda sin número; si hay
varios, `1`, `2`, `3`…; si ya existen, se sigue por el siguiente. Nunca se
sobrescribe ni se reutiliza un número.


## 4. Si da error

El mensaje dice qué ha pasado y en qué página. **No se ha escrito nada** y el
combinado sigue en Descargas: corrige la causa y vuelve a ejecutar `Procesar.bat`.

| Mensaje | Qué hacer |
|---|---|
| "cliente desconocido… GLN 84…" | Añade ese GLN a `clientes.ini` (ver punto 5) |
| "ya procesados anteriormente" | Ese documento ya se guardó otro día (el mensaje dice con qué nombre). Borra el combinado de Descargas |
| "¿Está abierto en Excel?" | Cierra el registro Excel y repite |
| "No se puede acceder a la carpeta destino… red/VPN" | Comprueba la conexión a la red y repite |
| "El Total de ediwin (X) no coincide" | Revisa la selección en ediwin y descarga de nuevo |
| "no tienen texto extraíble" / "no encaja con ningún tipo" / "contador…" | El PDF trae algo inesperado. Descárgalo de nuevo; si se repite, guarda el PDF y pide ayuda |
| "2.ª página… aún no está verificado" | Ha llegado un Mercadona de varias páginas: envía ese PDF para actualizar la herramienta |
| "Ya hay otra ejecución" | Espera unos segundos (la vigilancia está trabajando) |
| "La vigilancia ya está en marcha en otra ventana" | Ya tienes una ventana de vigilancia abierta (mira la barra de tareas) |


## 5. Añadir un cliente nuevo

Abre `clientes.ini` con el Bloc de notas y añade una línea con el GLN del
emisor (el que indica el error) y el nombre que quieres en el archivo:

    8480000099999 = MERCADONA NUEVO ALMACEN

Si el nombre lleva `{pedido}`, se sustituye por el Nº de pedido del documento.


## 6. Añadir un tipo de documento nuevo

Cada tipo de documento es un archivo en `plantillas\` (`.toml`) con sus reglas:
título que marca el inicio, línea del Nº de documento, cabecera de cada página,
línea del emisor, fecha y pedido. Para un tipo nuevo se copia uno existente y se
ajustan las reglas a partir de ejemplos reales; después hay que añadir esos
ejemplos a los tests (`tests\`) y comprobar que pasan. No se toca el programa.


## 7. Arranque automático con Windows (opcional)

**Hazlo solo cuando Informática haya dado el visto bueno.** La herramienta no lo
configura por sí misma; se hace a mano:

1. Pulsa `Windows + R`, escribe `shell:startup` y pulsa Intro. Se abre la
   carpeta "Inicio".
2. Arrastra `Vigilar.bat` con el **botón derecho** del ratón a esa carpeta y
   elige **"Crear acceso directo aquí"**.
3. Al encender el PC se abrirá la ventana de la vigilancia. Para quitarlo, borra
   ese acceso directo.

---

Para desarrolladores: el código está en `divisor\`, los tests en `tests\`
(`pip install -r requirements.txt pytest` y `pytest tests`), y el ZIP portable
se genera con `python herramientas/construir_portable.py`.
