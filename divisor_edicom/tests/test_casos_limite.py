"""Casos límite: ante cualquier duda, error controlado y NADA escrito."""

import dataclasses

import pytest
from conftest import COMBINADO_1, COMBINADO_2, contenido
from pdf_sintetico import escribir_pdf, montar, pagina_mercadona, pdf_bytes

import divisor.escritura
from divisor.analisis import ErrorDivision, NoEsConfirmacion, analizar
from divisor.proceso import procesar
from divisor.registro import ErrorRegistro, Registro

TODAS_1 = list(range(19))  # índices de las páginas del combinado del lote 1


def sin_cambios(cfg, *pdfs_en_descargas):
    """Comprueba que no se ha escrito nada y el combinado sigue en Descargas."""
    assert contenido(cfg.destino) == []
    assert not (cfg.registro / "registro_confirmaciones.xlsx").exists()
    assert contenido(cfg.procesados) == []
    for p in pdfs_en_descargas:
        assert p.exists()


def error(cfg, ruta, *textos):
    res = procesar(ruta, cfg)
    assert res.estado == "error", res.mensaje
    for t in textos:
        assert t in res.mensaje, res.mensaje
    sin_cambios(cfg, ruta)
    return res.mensaje


# --- Páginas sin texto o desconocidas ---------------------------------------


def test_pdf_sin_texto(cfg):
    ruta = escribir_pdf(cfg.descargas / "report - escaneado.pdf", [[], []])
    error(cfg, ruta, "Página(s) 1, 2", "no tienen texto extraíble")


def test_pagina_en_blanco_intercalada(cfg):
    blanco = pdf_bytes([[]])
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in range(5)] + [(blanco, 0)] + [(COMBINADO_1, i) for i in range(5, 19)])
    error(cfg, ruta, "Página(s) 6", "no tienen texto extraíble")


def test_pagina_con_patron_desconocido(cfg):
    extra = pdf_bytes([["FACTURA Nº 123", "Total 10,00 €"]])
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in range(4)] + [(extra, 0)] + [(COMBINADO_1, i) for i in range(4, 19)])
    error(cfg, ruta, "Página 5", "no encaja con ningún tipo de documento")


def test_pdf_ajeno_se_ignora_sin_tocarlo(cfg):
    ruta = escribir_pdf(cfg.descargas / "report - pedido.pdf", [["PEDIDO 4500001", "Cliente X"]])
    with pytest.raises(NoEsConfirmacion):
        analizar(ruta, cfg)
    res = procesar(ruta, cfg)
    assert res.estado == "ignorado"
    sin_cambios(cfg, ruta)


# --- Páginas perdidas, duplicadas, desordenadas o mezcladas ------------------


def test_pagina_perdida(cfg):
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in TODAS_1 if i != 5])
    error(cfg, ruta, "Página 6", "debería ser 'Página 5'")


def test_ultima_pagina_de_un_documento_perdida(cfg):
    # Falta la pág. 7 (3.ª del primer Carrefour): la siguiente es inicio de otro documento.
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in TODAS_1 if i != 6])
    error(cfg, ruta, "Página 7", "debería ser")


def test_pagina_duplicada(cfg):
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in [*range(6), 5, *range(6, 19)]])
    error(cfg, ruta, "Página 7")


def test_paginas_desordenadas(cfg):
    orden = list(TODAS_1)
    orden[5], orden[6] = orden[6], orden[5]
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in orden])
    error(cfg, ruta, "Página 6")


def test_empieza_por_pagina_de_continuacion(cfg):
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in range(5, 19)])
    error(cfg, ruta, "Página 1")


def test_combinados_distintos_mezclados(cfg):
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in TODAS_1] + [(COMBINADO_2, 0)])
    error(cfg, ruta, "Página 20", "hora de generación")


def test_continuacion_de_otro_documento(cfg):
    # Pág. de continuación del 1.er Carrefour (Página 5) justo tras el inicio del 2.º
    sint = pdf_bytes([["Nº confirmación: 20265076483596 05/10/2026 10:07 Página 5", "20 8431876283259 280,000"]])
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_1, i) for i in range(4)] + [(COMBINADO_1, 7), (sint, 0)])
    msg = error(cfg, ruta)
    assert "Página" in msg


# --- Mercadona de varias páginas (no verificado: debe avisar) ----------------


def test_mercadona_de_varias_paginas_avisa_para_actualizar(cfg):
    cont = pdf_bytes([["Nº. Confirmación: 15046 05/10/2026 10:22 Página 2", "3 8402001029141 11947 1800 12"]])
    ruta = montar(cfg.descargas / "r.pdf", [(COMBINADO_2, 0), (cont, 0)])
    error(cfg, ruta, "Página 2", "15046", "aún no está verificado", "Envía este PDF")


# --- Datos incoherentes ------------------------------------------------------


def test_cliente_desconocido(cfg):
    clientes = {k: v for k, v in cfg.clientes.items() if v != "CARREFOUR"}
    cfg2 = dataclasses.replace(cfg, clientes=clientes)
    res = procesar(COMBINADO_1, cfg2, simular=True)
    assert res.estado == "error"
    assert "8480015979997" in res.mensaje and "clientes.ini" in res.mensaje


def test_mismo_documento_dos_veces_en_el_lote(cfg):
    ruta = escribir_pdf(cfg.descargas / "r.pdf", [pagina_mercadona("111", 1), pagina_mercadona("111", 2)])
    error(cfg, ruta, "aparece dos veces")


def test_gln_con_digito_de_control_erroneo(cfg):
    ruta = escribir_pdf(cfg.descargas / "r.pdf", [pagina_mercadona("111", 1, gln="8480000009608")])
    error(cfg, ruta, "8480000009608", "dígito de control")


def test_cabecera_y_cuerpo_con_distinto_numero(cfg):
    pag = pagina_mercadona("111", 1)
    pag[2] = "Número de documento: 999"
    ruta = escribir_pdf(cfg.descargas / "r.pdf", [pag])
    error(cfg, ruta, "Página 1", "999")


def test_total_de_ediwin_no_coincide(cfg, descargar):
    ruta = descargar(COMBINADO_1)
    res = procesar(ruta, cfg, pedir_total=lambda n: 10)
    assert res.estado == "error" and "Total de ediwin (10)" in res.mensaje
    sin_cambios(cfg, ruta)
    assert procesar(ruta, cfg, pedir_total=lambda n: 11).estado == "ok"


# --- Escritura segura: o todo o nada -----------------------------------------


def test_destino_inaccesible(cfg, descargar):
    ruta = descargar(COMBINADO_1)
    cfg2 = dataclasses.replace(cfg, destino=cfg.destino / "no_existe")
    res = procesar(ruta, cfg2)
    assert res.estado == "error" and "red/VPN" in res.mensaje
    sin_cambios(cfg, ruta)


def test_excel_de_registro_abierto(cfg, descargar, monkeypatch):
    assert procesar(descargar(COMBINADO_1), cfg).estado == "ok"
    antes = contenido(cfg.destino)
    real_open = open

    def open_bloqueado(ruta, modo="r", *a, **k):  # así se comporta Windows con el Excel abierto
        if str(ruta).endswith(".xlsx") and "+" in modo:
            raise PermissionError(13, "El proceso no tiene acceso al archivo")
        return real_open(ruta, modo, *a, **k)

    monkeypatch.setattr("builtins.open", open_bloqueado)
    ruta = descargar(COMBINADO_2)
    res = procesar(ruta, cfg)
    assert res.estado == "error" and "abierto en Excel" in res.mensaje
    assert contenido(cfg.destino) == antes
    assert ruta.exists()


def test_fallo_de_red_a_mitad_deshace_todo(cfg, descargar, monkeypatch):
    real = divisor.escritura._mover_sin_sobrescribir
    llamadas = []

    def falla_en_la_cuarta(origen, final):
        llamadas.append(final)
        if len(llamadas) == 4:
            raise OSError("Se ha perdido la conexión de red")
        real(origen, final)

    monkeypatch.setattr(divisor.escritura, "_mover_sin_sobrescribir", falla_en_la_cuarta)
    ruta = descargar(COMBINADO_1)
    res = procesar(ruta, cfg)
    assert res.estado == "error" and "No se ha dejado nada en el destino" in res.mensaje
    sin_cambios(cfg, ruta)  # incluida la carpeta temporal oculta


def test_fallo_al_guardar_registro_retira_los_pdfs(cfg, descargar, monkeypatch):
    def falla(self, temporal):
        raise ErrorRegistro("No se pudo guardar el registro")

    monkeypatch.setattr(Registro, "confirmar", falla)
    ruta = descargar(COMBINADO_1)
    res = procesar(ruta, cfg)
    assert res.estado == "error" and "no ha quedado nada a medias" in res.mensaje
    sin_cambios(cfg, ruta)


def test_archivo_creado_por_otro_mientras_tanto_no_se_sobrescribe(cfg, descargar, monkeypatch):
    real = divisor.escritura.generar

    def generar_y_compañero_guarda(analisis, nombres, carpeta):
        rutas = real(analisis, nombres, carpeta)
        (cfg.destino / nombres[4]).write_bytes(b"archivo de un companero")
        return rutas

    monkeypatch.setattr("divisor.proceso.generar", generar_y_compañero_guarda)
    ruta = descargar(COMBINADO_1)
    res = procesar(ruta, cfg)
    assert res.estado == "error" and "Ya existe" in res.mensaje
    assert contenido(cfg.destino) == ["Confirmación Recepción_CARREFOUR 1.pdf"]
    assert (cfg.destino / "Confirmación Recepción_CARREFOUR 1.pdf").read_bytes() == b"archivo de un companero"
    assert ruta.exists()


def test_pdf_danado(cfg):
    ruta = cfg.descargas / "report - roto.pdf"
    ruta.write_bytes(b"%PDF-1.4 esto no es un pdf")
    with pytest.raises(ErrorDivision):
        analizar(ruta, cfg)
    assert procesar(ruta, cfg).estado == "error"


def test_tipo_de_documento_nuevo_con_estructura_conocida(cfg):
    """Lo que pasó con CONSUM antes de añadir su título: título desconocido
    pero con la línea de Nº de documento -> para y lo dice."""
    pag = [
        "Nº confirmación: 777 05/10/2026 11:34 Página 1",
        "Pedido de compra",
        "Nº de confirmación 777",
        "Fecha documento 29/09/2026",
        "Emisor mensaje CONSUM 8414807000002",
    ]
    ruta = escribir_pdf(cfg.descargas / "report.pdf", [pag])
    error(cfg, ruta, "Página 1", "ninguno de los títulos conocidos", "tipo de documento nuevo")
