import pytest
from conftest import EJEMPLOS, RAIZ, contenido

from divisor.configuracion import ErrorConfiguracion, cargar_clientes, cargar_plantilla, gln_valido
from divisor.nombres import asignar_nombres, sanear
from divisor.proceso import procesar

B = "Confirmación Recepción_CARREFOUR"
C = "Confirmación Recepción_BON PREU"


def test_uno_solo_sin_numero_y_varios_numerados():
    assert asignar_nombres([B, C, B], []) == [f"{B} 1.pdf", f"{C}.pdf", f"{B} 2.pdf"]


def test_continua_la_numeracion_existente():
    assert asignar_nombres([B], [f"{B} 1.pdf", f"{B} 3.pdf", "otro.pdf"]) == [f"{B} 4.pdf"]


def test_el_que_no_tiene_numero_cuenta_como_1():
    assert asignar_nombres([C, C], [f"{C}.pdf"]) == [f"{C} 2.pdf", f"{C} 3.pdf"]


def test_mayusculas_y_tildes_como_windows():
    existente = "confirmación recepción_carrefour 2.PDF"
    assert asignar_nombres([B], [existente]) == [f"{B} 3.pdf"]
    # Misma palabra con la tilde codificada de otra forma (NFD)
    import unicodedata

    assert asignar_nombres([B], [unicodedata.normalize("NFD", f"{B}.pdf")]) == [f"{B} 2.pdf"]


def test_no_confunde_clientes_con_prefijo_comun():
    assert asignar_nombres([B], [f"{B} EXPRESS.pdf", f"{B}X 4.pdf"]) == [f"{B}.pdf"]


def test_sanear_para_windows():
    assert sanear('Confirmación Recepción_A/B:C*"D"?<E>|F', 120) == "Confirmación Recepción_A B C D E F"
    assert sanear("Nombre.  ", 120) == "Nombre"
    assert sanear("x" * 300, 120) == "x" * 120
    assert sanear("CON", 120) == "_CON"
    with pytest.raises(ValueError):
        sanear(" ... ", 120)


def test_gln():
    assert gln_valido("8480015979997") and gln_valido("8430803111139") and gln_valido("5606001007106")
    assert not gln_valido("8480015979998") and not gln_valido("848001597999") and not gln_valido("84800159799a7")


def test_tabla_de_clientes_real_valida():
    clientes = cargar_clientes(RAIZ / "clientes.ini")
    assert clientes["8480015979997"] == "CARREFOUR"
    assert clientes["8430803111139"] == "{pedido}"
    assert len(clientes) == 12


def test_clientes_con_gln_invalido(tmp_path):
    f = tmp_path / "clientes.ini"
    f.write_text("[clientes]\n8480015979998 = X\n", encoding="utf-8")
    with pytest.raises(ErrorConfiguracion, match="8480015979998"):
        cargar_clientes(f)


def test_plantilla_con_expresion_mal_escrita(tmp_path):
    texto = (RAIZ / "plantillas" / "aviso_recepcion_ean.toml").read_text(encoding="utf-8")
    f = tmp_path / "mala.toml"
    f.write_text(texto.replace("(?P<num>\\S+)$'", "(?P<num>\\S+$'", 1), encoding="utf-8")
    with pytest.raises(ErrorConfiguracion, match="numero_doc"):
        cargar_plantilla(f)


def test_nunca_reutiliza_un_numero_aunque_muevan_el_archivo(cfg, descargar):
    ind = EJEMPLOS / "lote1" / "individuales"
    assert procesar(descargar(ind / "report - 2026-10-05T120624.021.pdf"), cfg).estado == "ok"
    (cfg.destino / f"{B}.pdf").unlink()  # alguien lo mueve a otra carpeta
    res = procesar(descargar(ind / "report - 2026-10-05T120612.425.pdf"), cfg)  # otro Carrefour
    assert res.estado == "ok"
    assert contenido(cfg.destino) == [f"{B} 2.pdf"]
