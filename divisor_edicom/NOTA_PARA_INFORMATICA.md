# Divisor EDICOM: nota para Informática / Seguridad

**Solicitud:** permitir la ejecución de la herramienta interna "Divisor EDICOM"
desde la carpeta `C:\EDICOM\DivisorEDICOM\` en el equipo de Pablo Montes
(back office), y si procede añadir esa carpeta como excepción en Cortex XDR.

## Qué hace

Cada mañana se descarga del portal EDICOM (ediwin) un PDF que contiene varias
"confirmaciones de recepción". La herramienta:

1. Lee el texto de ese PDF y localiza dónde empieza y acaba cada documento
   (reglas fijas de texto, sin IA ni servicios externos).
2. Copia las páginas de cada documento, sin modificarlas, a un PDF propio.
3. Guarda esos PDFs en `\\hq.gac\files\wmn\PEDIDOS\RECADV` y anota cada uno en
   un Excel local (`registro\registro_confirmaciones.xlsx`).
4. Mueve el PDF original a la subcarpeta `_procesados`.

Si algo no cuadra, se detiene y no escribe nada.

## Qué NO hace

- **No se conecta a internet** ni a ningún servicio externo. No abre puertos.
- **No usa PowerShell**, ni scripts ocultos, ni tareas programadas.
- **No se instala**: no toca el registro de Windows, ni carpetas del sistema, ni
  el arranque. No necesita permisos de administrador.
- **No lanza otros programas.** Todo se ejecuta en una ventana de consola
  visible. Cerrar la ventana detiene la herramienta.

## Qué archivos tiene y qué hace cada uno

| Elemento | Qué es |
|---|---|
| `python\` | Python 3.12.10 "embeddable" **oficial de python.org**, sin modificar. `python.exe`, `python312.dll` y los `.pyd` están firmados por la *Python Software Foundation*; `vcruntime140.dll` lo firma *Microsoft*. |
| `python\Lib\site-packages\` | Librerías de código abierto **escritas solo en Python** (no incluyen ningún `.exe`, `.dll` ni `.pyd`): `pypdf` (lee y divide PDF) y `openpyxl` (escribe el Excel). |
| `divisor\` | El código de la herramienta, en Python legible. |
| `plantillas\`, `clientes.ini`, `configuracion.ini` | Reglas y configuración, en texto plano. |
| `Procesar.bat`, `Simular.bat`, `Vigilar.bat` | Lanzadores de 1 línea: ejecutan `python\python.exe -m divisor` con un parámetro, en la misma ventana. |
| `HUELLAS.txt` | SHA256 de todos los archivos, para verificar que no se han alterado. |

**Únicos ejecutables del paquete:** los del Python oficial de python.org.

## Comportamiento en el equipo

- **Lee:** los PDF de ediwin (`report.pdf`, `report (N).pdf`, `report - *.pdf`) de `C:\Users\pablo.montes\Downloads`.
- **Escribe:** en `\\hq.gac\files\wmn\PEDIDOS\RECADV`, y dentro de su propia carpeta
  (`_procesados`, `registro`, `estado`).
- **Avisos:** el cuadro de mensaje estándar de Windows (`MessageBoxW` de user32).
- **Modo vigilancia (`Vigilar.bat`):** mientras su ventana esté abierta, revisa
  Descargas cada 5 segundos. Si se cierra la ventana, se detiene.

## Verificación

- El código fuente completo está en un repositorio privado de GitHub, con 49 pruebas
  automáticas que se ejecutan en un Windows limpio cada vez que cambia.
- La firma de los ejecutables se puede comprobar con
  `Get-AuthenticodeSignature` (o Propiedades → Firmas digitales).
