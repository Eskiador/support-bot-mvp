"""Análisis determinista del PDF combinado: dónde empieza y acaba cada documento.

Reglas (ver plantillas/*.toml):
- Página de INICIO: contiene la línea de título de una plantilla y una única
  línea con el Nº de documento.
- Página de CONTINUACIÓN: no tiene título y su cabecera lleva el Nº del
  documento en curso (con la misma plantilla).
- Cualquier otra cosa es un error: el programa no adivina.
"""

from __future__ import annotations

import hashlib
import re
from dataclasses import dataclass, field
from pathlib import Path

from pypdf import PdfReader

from .configuracion import Configuracion, Plantilla, gln_valido


class ErrorDivision(Exception):
    """Problema que impide dividir el PDF con total seguridad."""


class NoEsConfirmacion(Exception):
    """Ninguna página del PDF es de una plantilla conocida (no es nuestro)."""


@dataclass
class Pagina:
    numero: int  # 1, 2, 3... dentro del combinado
    lineas: list[str]
    plantilla: Plantilla | None = None
    es_inicio: bool = False
    num_doc: str | None = None
    contador: int | None = None  # "Página N" impreso
    fecha_generacion: str | None = None
    titulo: str | None = None  # solo en páginas de inicio


@dataclass
class Documento:
    plantilla: Plantilla
    num_doc: str
    tipo: str = ""  # texto de la columna Tipo (según el título)
    huella: str = ""  # SHA256 del texto del documento sin cabeceras (igual en cualquier combinado)
    paginas: list[int] = field(default_factory=list)  # números de página (1, 2...)
    gln: str = ""
    nombre_cliente: str = ""  # lo que va en el nombre del archivo
    origen: str = ""  # para el resumen y el registro
    fecha_documento: str = ""
    pedido: str | None = None
    linea_emisor: str = ""


@dataclass
class Analisis:
    archivo: Path
    total_paginas: int
    documentos: list[Documento]
    textos: list[list[str]]  # texto de cada página, para validar después
    avisos: list[str] = field(default_factory=list)  # cosas raras que no impiden dividir


def leer_paginas(archivo: Path) -> list[list[str]]:
    """Texto de cada página como lista de líneas, en el orden en que se ven
    (modo "layout" de pypdf). Los espacios repetidos se reducen a uno."""
    try:
        lector = PdfReader(archivo)
        if lector.is_encrypted:
            raise ErrorDivision(f"El PDF '{archivo.name}' está protegido con contraseña.")
        paginas = []
        for pagina in lector.pages:
            texto = pagina.extract_text(extraction_mode="layout") or ""
            paginas.append([" ".join(l.split()) for l in texto.splitlines() if l.strip()])
    except ErrorDivision:
        raise
    except Exception as e:  # PDF dañado o ilegible
        raise ErrorDivision(f"No se puede leer el PDF '{archivo.name}': {e}") from e
    if not paginas:
        raise ErrorDivision(f"El PDF '{archivo.name}' no tiene páginas.")
    return paginas


def _cabeceras(lineas: list[str], plantilla: Plantilla) -> list[re.Match]:
    return [m for l in lineas if (m := plantilla.cabecera.fullmatch(l))]


def _clasificar(pag: Pagina, plantillas: tuple[Plantilla, ...]) -> None:
    n = pag.numero
    if not pag.lineas:
        raise ErrorDivision(
            f"Página {n}: no tiene texto extraíble (¿PDF escaneado o página en blanco?). "
            "No se puede saber a qué documento pertenece."
        )
    encontrados = [(p, t) for p in plantillas for t in p.titulos if t in pag.lineas]
    for _, t in encontrados:
        if pag.lineas.count(t) > 1:
            raise ErrorDivision(f"Página {n}: el título '{t}' aparece más de una vez.")
    if len(encontrados) > 1:
        raise ErrorDivision(f"Página {n}: tiene títulos de dos tipos de documento distintos.")

    # Cabeceras CON Nº de documento: identifican la plantilla sin ambigüedad.
    con_num = {p.id: [m for m in _cabeceras(pag.lineas, p) if m.group("num")] for p in plantillas}
    plantillas_con_num = [p for p in plantillas if con_num[p.id]]
    if len(plantillas_con_num) > 1:
        raise ErrorDivision(f"Página {n}: tiene cabeceras de dos tipos de documento distintos.")

    if encontrados:
        plantilla, pag.titulo = encontrados[0]
        if plantillas_con_num and plantillas_con_num[0] is not plantilla:
            raise ErrorDivision(
                f"Página {n}: el título es de '{plantilla.nombre}' pero la cabecera es de "
                f"'{plantillas_con_num[0].nombre}'."
            )
        nums = [m.group("num") for l in pag.lineas if (m := plantilla.numero_doc.fullmatch(l))]
        if len(nums) != 1:
            raise ErrorDivision(
                f"Página {n}: es el inicio de un '{plantilla.nombre}' pero se encontraron "
                f"{len(nums)} líneas con el Nº de documento (debe haber exactamente 1)."
            )
        pag.es_inicio, pag.num_doc = True, nums[0]
    elif plantillas_con_num:
        plantilla = plantillas_con_num[0]
        if any(plantilla.numero_doc.fullmatch(l) for l in pag.lineas):
            raise ErrorDivision(
                f"Página {n}: tiene la línea de Nº de documento pero ninguno de los títulos conocidos "
                f"({' / '.join(plantilla.titulos)}). ¿Es un tipo de documento nuevo?"
            )
        nums = {m.group("num") for m in con_num[plantilla.id]}
        if len(nums) != 1:
            raise ErrorDivision(f"Página {n}: la cabecera indica varios Nº de documento: {sorted(nums)}.")
        pag.num_doc = nums.pop()
    else:
        raise ErrorDivision(
            f"Página {n}: no encaja con ningún tipo de documento conocido "
            f"(no tiene título reconocido ni cabecera con Nº de documento). "
            f"Primeras líneas: {' | '.join(pag.lineas[:3])}"
        )
    pag.plantilla = plantilla

    cabeceras = _cabeceras(pag.lineas, plantilla)
    if not cabeceras:
        raise ErrorDivision(f"Página {n}: no tiene la cabecera 'fecha hora Página N'.")
    contadores = {int(m.group("pag")) for m in cabeceras}
    fechas = {m.group("fecha") for m in cabeceras}
    nums_cab = {m.group("num") for m in cabeceras if m.group("num")}
    if len(contadores) != 1 or len(fechas) != 1:
        raise ErrorDivision(f"Página {n}: las cabeceras de la página no coinciden entre sí.")
    if nums_cab and nums_cab != {pag.num_doc}:
        raise ErrorDivision(
            f"Página {n}: la cabecera dice Nº {sorted(nums_cab)} pero el documento es el Nº {pag.num_doc}."
        )
    pag.contador, pag.fecha_generacion = contadores.pop(), fechas.pop()


def _campo_unico(patron: re.Pattern, grupo: str, lineas: list[str]) -> list[str]:
    return [m.group(grupo) for l in lineas for m in patron.finditer(l)]


def _datos_documento(doc: Documento, paginas: list[Pagina], cfg: Configuracion) -> None:
    p = doc.plantilla
    primera = paginas[doc.paginas[0] - 1]
    todas = [l for n in doc.paginas for l in paginas[n - 1].lineas]
    donde = f"Documento Nº {doc.num_doc} (página {primera.numero})"

    emisores = [l for l in todas if p.emisor.search(l)]
    if len(emisores) != 1:
        raise ErrorDivision(f"{donde}: se esperaba 1 línea de emisor y hay {len(emisores)}.")
    glns = re.findall(r"(?<!\d)\d{13}(?!\d)", emisores[0])
    if len(glns) != 1:
        raise ErrorDivision(
            f"{donde}: la línea del emisor debe tener exactamente un código GLN de 13 dígitos: '{emisores[0]}'"
        )
    if not gln_valido(glns[0]):
        raise ErrorDivision(f"{donde}: el GLN del emisor {glns[0]} no es válido (dígito de control).")
    doc.gln, doc.linea_emisor = glns[0], emisores[0]
    if doc.gln not in cfg.clientes:
        raise ErrorDivision(
            f"{donde}: cliente desconocido. El GLN del emisor {doc.gln} no está en clientes.ini "
            f"(línea: '{emisores[0]}'). Añádelo a clientes.ini y vuelve a ejecutar."
        )

    fechas = _campo_unico(p.fecha_documento, "fecha", primera.lineas)
    if len(fechas) != 1:
        raise ErrorDivision(f"{donde}: no se encuentra una única 'Fecha documento' (hay {len(fechas)}).")
    doc.fecha_documento = fechas[0]

    pedidos = _campo_unico(p.pedido, "pedido", todas)
    if len(pedidos) > 1:
        raise ErrorDivision(f"{donde}: aparecen varios Nº de pedido: {pedidos}.")
    doc.pedido = pedidos[0] if pedidos else None

    nombre = cfg.clientes[doc.gln]
    if "{pedido}" in nombre:
        if not doc.pedido:
            raise ErrorDivision(f"{donde}: el nombre de este cliente usa el Nº de pedido y el documento no lo tiene.")
        nombre = nombre.replace("{pedido}", doc.pedido)
        doc.origen = f"GLN {doc.gln} (nombre = Nº pedido)"
    else:
        doc.origen = nombre
    doc.nombre_cliente = nombre


def analizar(archivo: Path, cfg: Configuracion) -> Analisis:
    """Divide lógicamente el PDF en documentos. Lanza ErrorDivision ante cualquier duda."""
    textos = leer_paginas(archivo)
    paginas = [Pagina(numero=i, lineas=l) for i, l in enumerate(textos, 1)]

    # Una página sin texto es siempre un error (nunca se ignora el PDF por ello).
    sin_texto = [p.numero for p in paginas if not p.lineas]
    if sin_texto:
        raise ErrorDivision(
            f"Página(s) {', '.join(map(str, sin_texto))}: no tienen texto extraíble "
            "(¿PDF escaneado o página en blanco?). No se puede saber a qué documento pertenecen."
        )

    # ¿Es un PDF de confirmaciones? Si NINGUNA página tiene título o cabecera
    # con Nº de una plantilla conocida, no es nuestro: se ignora sin tocarlo.
    def reconocible(pag: Pagina) -> bool:
        return any(
            any(t in pag.lineas for t in p.titulos) or any(m.group("num") for m in _cabeceras(pag.lineas, p))
            for p in cfg.plantillas
        )

    if not any(reconocible(p) for p in paginas):
        raise NoEsConfirmacion(f"'{archivo.name}' no contiene confirmaciones de recepción conocidas.")

    for pag in paginas:
        _clasificar(pag, cfg.plantillas)

    documentos: list[Documento] = []
    anterior: Pagina | None = None
    for pag in paginas:
        n = pag.numero
        # Contador "Página N": consecutivo dentro de cada bloque de la misma
        # plantilla; vuelve a 1 cuando cambia la plantilla.
        if anterior is None or anterior.plantilla is not pag.plantilla:
            esperado = 1
        else:
            esperado = anterior.contador + 1
        if pag.contador != esperado:
            raise ErrorDivision(
                f"Página {n}: el contador impreso dice 'Página {pag.contador}' y debería ser "
                f"'Página {esperado}'. Puede faltar o sobrar una página, o estar desordenadas."
            )
        if anterior is not None and pag.fecha_generacion != anterior.fecha_generacion:
            raise ErrorDivision(
                f"Página {n}: hora de generación {pag.fecha_generacion} distinta de la página anterior "
                f"({anterior.fecha_generacion}). ¿Se han mezclado PDFs distintos?"
            )

        if pag.es_inicio:
            documentos.append(
                Documento(plantilla=pag.plantilla, num_doc=pag.num_doc, paginas=[n], tipo=pag.plantilla.titulos[pag.titulo])
            )
        else:
            if not documentos:
                raise ErrorDivision(f"Página {n}: el PDF empieza con una página de continuación.")
            actual = documentos[-1]
            if pag.plantilla is not actual.plantilla or pag.num_doc != actual.num_doc:
                raise ErrorDivision(
                    f"Página {n}: es continuación del documento Nº {pag.num_doc} pero el documento "
                    f"en curso es el Nº {actual.num_doc}."
                )
            if not pag.plantilla.permite_continuacion:
                raise ErrorDivision(
                    f"Página {n}: es la 2.ª página (o siguiente) de un '{pag.plantilla.nombre}' "
                    f"(Nº {pag.num_doc}). Este caso aún no está verificado con ejemplos reales, "
                    "así que no se divide. Envía este PDF para añadir la regla."
                )
            actual.paginas.append(n)
        anterior = pag

    for doc in documentos:
        _datos_documento(doc, paginas, cfg)
        # Las cabeceras ("Página N", hora de generación) cambian de un combinado
        # a otro; el resto del texto identifica el documento.
        lineas = [l for n in doc.paginas for l in paginas[n - 1].lineas if not doc.plantilla.cabecera.fullmatch(l)]
        doc.huella = hashlib.sha256("\n".join(lineas).encode("utf-8")).hexdigest()

    # Validaciones globales
    # Un cliente puede mandar varios documentos con el mismo Nº: con distinto
    # contenido (Bon Preu: recepción y regularización del mismo albarán) o
    # incluso idénticos (Carrefour enviando el mismo dos veces). Cada uno empieza
    # con su propio título, así que el corte es seguro: cada uno va a su PDF.
    # Los idénticos se avisan para que se sepa.
    avisos = []
    vistos: dict[tuple[str, str, str], list[Documento]] = {}
    for doc in documentos:
        vistos.setdefault((doc.gln, doc.num_doc, doc.huella), []).append(doc)
    for copias in vistos.values():
        if len(copias) > 1:
            paginas_txt = " y ".join(str(d.paginas) for d in copias)
            avisos.append(
                f"El Nº {copias[0].num_doc} de {copias[0].nombre_cliente} viene {len(copias)} veces idéntico "
                f"en el PDF (páginas {paginas_txt}): cada copia se guarda en su propio PDF."
            )
    asignadas = [n for d in documentos for n in d.paginas]
    if sorted(asignadas) != list(range(1, len(paginas) + 1)):
        raise ErrorDivision("Error interno: hay páginas sin asignar o asignadas dos veces.")

    return Analisis(archivo=archivo, total_paginas=len(paginas), documentos=documentos, textos=textos, avisos=avisos)
