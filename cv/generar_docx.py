#!/usr/bin/env python3
"""Genera las tres versiones del CV en .docx (formato compatible con ATS).

Uso: python3 generar_docx.py
Rellena los [corchetes] en este archivo y vuelve a ejecutarlo para regenerar.
"""
from docx import Document
from docx.shared import Pt, Cm, RGBColor
from docx.enum.text import WD_ALIGN_PARAGRAPH

NOMBRE = "[Nombre y Apellidos]"
CONTACTO = ("Morón de la Frontera (Sevilla) · Disponibilidad: Sevilla capital y "
            "Torrox Costa (Málaga) · Carnet B y vehículo propio\n"
            "[Teléfono] · pablossmontes1155@icloud.com · [LinkedIn]")

TITULARES = {
    "A": "Técnico Superior en Comercio Internacional | Export Front & Back Office | Inglés B2",
    "B": "Comercio Internacional y Marketing Digital | Export Ops · Meta Ads · Desarrollo Web",
    "C": "Comercio Internacional | Operaciones + Automatización de Procesos con IA (Python · APIs)",
}

EXTRACTOS = {
    "A": ("Técnico Superior en Comercio Internacional con más de un año en Angel Camacho "
          "Alimentación (agroalimentaria exportadora), donde he pasado de prácticas a contrato "
          "laboral en menos de un año. He gestionado en SAP la operativa, facturación y documentación de "
          "cargas de exportación a EE. UU., Canadá, Sudamérica y Reino Unido —mercados de alta "
          "exigencia documental— y actualmente resuelvo incidencias y cargos con grandes cuentas "
          "de distribución nacional. Inglés B2 de uso profesional diario. Como diferencial: "
          "desarrollo herramientas de automatización (Python + IA) que mi departamento usa a diario."),
    "B": ("Técnico Superior en Comercio Internacional con experiencia real en dos frentes: en "
          "Angel Camacho Alimentación gestiono grandes cuentas de distribución (incidencias, "
          "cargos, entregas) tras un año en exportación con clientes de UK, EE. UU. y Canadá; y "
          "por cuenta propia he creado Sorwebs, marca de diseño web para negocios locales, "
          "gestionando el ciclo comercial completo (captación, propuesta, entrega), además de "
          "campañas de Meta Ads y tiendas de e-commerce propias. Sé vender, medir resultados y "
          "tratar con el cliente en español y en inglés (B2)."),
    "C": ("Perfil híbrido negocio + tecnología: Técnico Superior en Comercio Internacional en "
          "activo en Angel Camacho Alimentación, donde además de gestionar operativa de "
          "exportación y cargos de grandes cuentas he desarrollado por iniciativa propia "
          "herramientas de automatización en uso real en el departamento: extracción de datos de "
          "facturas y cargos en PDF a Excel con OCR y APIs de IA (Python, JavaScript, API de "
          "Claude). Conozco los procesos administrativos desde dentro y sé automatizarlos: ese es "
          "el valor que aporto a un equipo de operaciones o mejora de procesos."),
}

BULLETS_BACKOFFICE = {
    "entregas": ("Reviso y controlo las entregas de mercancía a clientes nacionales, coordinando "
                 "con logística y comercial la resolución de desviaciones."),
    "cargos": ("Gestiono el ciclo completo de cargos de clientes de grandes cuentas de "
               "distribución: análisis en SAP de diferencias de precio y de mercancía, "
               "documentación y resolución de incidencias — más de 100 cargos gestionados al mes."),
    "automatizacion": ("Desarrollé por iniciativa propia herramientas de automatización con "
                       "Python, JavaScript y APIs de IA (extracción OCR de datos de facturas y "
                       "cargos en PDF a Excel), hoy en uso diario en el departamento — ahorro de "
                       "varias horas semanales de trabajo manual."),
}
ORDEN_BACKOFFICE = {
    "A": ["entregas", "cargos", "automatizacion"],
    "B": ["cargos", "entregas", "automatizacion"],
    "C": ["automatizacion", "entregas", "cargos"],
}

BULLETS_FRONTOFFICE = [
    ("Gestioné la operativa de cargas de exportación a Sudamérica, EE. UU., Canadá y almacenes "
     "externos de Reino Unido — entre 15 y 30 cargas mensuales."),
    ("Grabé y gestioné en SAP los pedidos del mercado UK — 10-25 pedidos semanales, con "
     "comunicación diaria en inglés con clientes y almacenes."),
    ("Responsable de la facturación (SAP) y documentación de exportación de dichas cargas "
     "(factura comercial, packing list, certificados y documentación aduanera) para mercados de "
     "alta exigencia documental como EE. UU. y Canadá."),
]

PROYECTOS = {
    "compacto": [
        ("Sorwebs — Diseño web para negocios locales · [año] – actualidad",
         ["Marca propia de creación de webs profesionales para restaurantes y negocios de la "
          "Costa del Sol: ciclo completo con el cliente — captación, propuesta, diseño y "
          "desarrollo (HTML/CSS/JavaScript), SEO local y entrega."]),
        ("Publicidad digital y e-commerce · [año] – [año/actualidad]",
         ["Creación y gestión de tiendas online propias (selección de producto, proveedores "
          "internacionales y logística) y campañas de Meta Ads en Facebook/Instagram: "
          "segmentación de audiencias, creativos y optimización por resultados."]),
    ],
    "ampliado": [
        ("Sorwebs — Diseño web para negocios locales · [año] – actualidad",
         ["Marca propia de creación de webs profesionales para restaurantes y negocios de la "
          "Costa del Sol.",
          "Ciclo comercial completo: captación de clientes, propuestas y presupuestos, entrega y "
          "mantenimiento recurrente. Diseño y desarrollo con HTML/CSS/JavaScript y SEO local."]),
        ("Meta Ads (Facebook/Instagram) · [año] – [año/actualidad]",
         ["Planificación, creación y optimización de campañas: segmentación de audiencias, "
          "creativos y análisis de resultados por métricas."]),
        ("E-commerce · [año] – [año/actualidad]",
         ["Creación y gestión de tiendas online propias: selección de producto, negociación con "
          "proveedores internacionales y coordinación logística."]),
    ],
}

HABILIDADES = {
    "comex": ("Comercio exterior: documentación de exportación (factura comercial, packing list, "
              "certificados y documentación aduanera), gestión de pedidos y cargas, Incoterms, "
              "gestión de incidencias y cargos con grandes cuentas."),
    "prog": ("Programación y automatización: Python, JavaScript, HTML/CSS, APIs de IA (Claude), "
             "OCR y procesamiento automático de documentos."),
    "mkt": ("Marketing digital: Meta Ads (Facebook/Instagram), e-commerce ([plataforma]), SEO local."),
    "ofimatica": ("Gestión y ofimática: SAP (pedidos, facturación, cargos), Excel de uso diario "
                  "(análisis de cargos y control de entregas), Outlook."),
}
ORDEN_HABILIDADES = {
    "A": ["comex", "prog", "mkt", "ofimatica"],
    "B": ["mkt", "comex", "prog", "ofimatica"],
    "C": ["prog", "ofimatica", "comex", "mkt"],
}

IDIOMAS = [
    "Español: nativo.",
    ("Inglés: B2 — uso profesional diario: documentación de exportación y gestión de pedidos "
     "con clientes de Reino Unido, EE. UU. y Canadá. Certificación Trinity (Reading y Writing, "
     "nivel B2)."),
]

FORMACION = ("Técnico Superior en Comercio Internacional (FP de Grado Superior) — [Centro], "
             "[ciudad] · [año] – [año]")


def estilo_base(doc):
    st = doc.styles["Normal"]
    st.font.name = "Calibri"
    st.font.size = Pt(10.5)
    for sec in doc.sections:
        sec.top_margin = sec.bottom_margin = Cm(1.4)
        sec.left_margin = sec.right_margin = Cm(1.6)


def titulo_seccion(doc, texto):
    p = doc.add_paragraph()
    p.space_before = Pt(8)
    run = p.add_run(texto.upper())
    run.bold = True
    run.font.size = Pt(11.5)
    p.paragraph_format.space_before = Pt(10)
    p.paragraph_format.space_after = Pt(3)


def bullet(doc, texto):
    p = doc.add_paragraph(texto, style="List Bullet")
    p.paragraph_format.space_after = Pt(2)


def construir(version, ruta):
    doc = Document()
    estilo_base(doc)

    # Cabecera
    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(NOMBRE)
    r.bold = True
    r.font.size = Pt(19)

    p = doc.add_paragraph()
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    r = p.add_run(TITULARES[version])
    r.bold = True
    r.font.size = Pt(11.5)
    r.font.color.rgb = RGBColor(0x1F, 0x3B, 0x57)

    p = doc.add_paragraph(CONTACTO)
    p.alignment = WD_ALIGN_PARAGRAPH.CENTER
    p.runs[0].font.size = Pt(9.5)

    # Extracto
    titulo_seccion(doc, "Perfil profesional")
    doc.add_paragraph(EXTRACTOS[version])

    def seccion_experiencia():
        titulo_seccion(doc, "Experiencia profesional")
        p = doc.add_paragraph()
        r = p.add_run("Angel Camacho Alimentación — Morón de la Frontera (Sevilla)")
        r.bold = True
        r2 = p.add_run("\nEmpresa agroalimentaria internacional (exportación a [+X] países)")
        r2.italic = True
        r2.font.size = Pt(9.5)

        p = doc.add_paragraph()
        p.add_run("Técnico de Back Office Nacional · enero 2026 – actualidad").bold = True
        r = p.add_run("\nContrato laboral tras 9 meses en el área de exportación; renovado hasta septiembre 2026")
        r.italic = True
        r.font.size = Pt(9.5)
        for clave in ORDEN_BACKOFFICE[version]:
            bullet(doc, BULLETS_BACKOFFICE[clave])

        p = doc.add_paragraph()
        p.add_run("Front Office Exportación · marzo 2025 – diciembre 2025").bold = True
        r = p.add_run("\nIncorporación en prácticas (mar–jun) y continuidad con beca (jun–dic) por decisión de la empresa")
        r.italic = True
        r.font.size = Pt(9.5)
        for b in BULLETS_FRONTOFFICE:
            bullet(doc, b)

    def seccion_proyectos():
        titulo_seccion(doc, "Proyectos propios")
        modo = "ampliado" if version == "B" else "compacto"
        for titulo, bullets in PROYECTOS[modo]:
            p = doc.add_paragraph()
            p.add_run(titulo).bold = True
            for b in bullets:
                bullet(doc, b)

    def seccion_formacion():
        titulo_seccion(doc, "Formación")
        doc.add_paragraph(FORMACION)

    def seccion_habilidades():
        titulo_seccion(doc, "Habilidades técnicas")
        for clave in ORDEN_HABILIDADES[version]:
            bullet(doc, HABILIDADES[clave])

    def seccion_idiomas():
        titulo_seccion(doc, "Idiomas")
        for i in IDIOMAS:
            bullet(doc, i)

    if version == "A":
        orden = [seccion_experiencia, seccion_proyectos, seccion_formacion,
                 seccion_habilidades, seccion_idiomas]
    elif version == "B":
        orden = [seccion_experiencia, seccion_proyectos, seccion_habilidades,
                 seccion_formacion, seccion_idiomas]
    else:  # C
        orden = [seccion_experiencia, seccion_habilidades, seccion_proyectos,
                 seccion_formacion, seccion_idiomas]
    for f in orden:
        f()

    doc.save(ruta)
    print(f"Generado: {ruta}")


if __name__ == "__main__":
    construir("A", "CV_VersionA_Export.docx")
    construir("B", "CV_VersionB_Comercial_Marketing.docx")
    construir("C", "CV_VersionC_Hibrida_Automatizacion.docx")
