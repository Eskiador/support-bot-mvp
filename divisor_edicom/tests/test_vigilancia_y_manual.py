import os
import shutil
import time

import pytest
from conftest import COMBINADO_1, COMBINADO_2, contenido
from pdf_sintetico import escribir_pdf

from divisor import avisos, estado
from divisor.__main__ import manual
from divisor.bloqueo import Ocupado, bloqueo
from divisor.vigilancia import vigilar


@pytest.fixture
def capturar_avisos(monkeypatch):
    registro = []
    monkeypatch.setattr(avisos, "notificar", lambda t, x: registro.append(("notificacion", x)))
    monkeypatch.setattr(avisos, "ventana_error", lambda t, x: registro.append(("error", x)))
    return registro


def _envejecer(ruta, segundos=3600):
    t = time.time() - segundos
    os.utime(ruta, (t, t))


def test_vigilancia(cfg, capturar_avisos):
    viejo = shutil.copy(COMBINADO_2, cfg.descargas / "report.pdf")
    _envejecer(viejo)
    estado.leer(cfg)  # primera ejecución: "instalación"
    shutil.copy(COMBINADO_1, cfg.descargas / "report - nuevo.pdf")
    ajeno = escribir_pdf(cfg.descargas / "report - pedido.pdf", [["PEDIDO 1"]])
    roto = escribir_pdf(cfg.descargas / "report - escaneado.pdf", [[]])
    escribir_pdf(cfg.descargas / "otro.pdf", [["no es de ediwin"]])

    vigilar(cfg, vueltas=3)

    assert len(contenido(cfg.destino)) == 11  # solo el nuevo
    assert contenido(cfg.descargas) == ["otro.pdf", "report - escaneado.pdf", "report - pedido.pdf", "report.pdf"]
    tipos = sorted(t for t, _ in capturar_avisos)
    assert tipos == ["error", "notificacion", "notificacion"]
    assert any("11 confirmaciones" in x for _, x in capturar_avisos)
    assert any("Ignorado" in x for _, x in capturar_avisos)
    assert any("escaneado" in x and "No se ha escrito nada" in x for t, x in capturar_avisos if t == "error")

    # Lo que ya avisó no vuelve a avisar en cada vuelta
    capturar_avisos.clear()
    vigilar(cfg, vueltas=2)
    assert capturar_avisos == []
    assert estado.leer(cfg)["vistos"][estado.clave(ajeno)] == "ignorado"
    assert estado.leer(cfg)["vistos"][estado.clave(roto)] == "error"


def test_vigilancia_espera_a_que_termine_la_descarga(cfg, capturar_avisos):
    estado.leer(cfg)
    vigilar(cfg, vueltas=1)
    shutil.copy(COMBINADO_1, cfg.descargas / "report - nuevo.pdf")
    vigilar(cfg, vueltas=1)  # primera vez que lo ve: anota el tamaño y espera
    assert contenido(cfg.destino) == []


def test_manual_procesa_pendientes_y_pregunta_total(cfg, monkeypatch, capsys):
    estado.leer(cfg)
    shutil.copy(COMBINADO_1, cfg.descargas / "report - 1.pdf")
    shutil.copy(COMBINADO_2, cfg.descargas / "report - 2.pdf")
    respuestas = iter(["11", "15"])
    monkeypatch.setattr("builtins.input", lambda *_: next(respuestas))
    assert manual(cfg, [], simular=False, con_total=True) == 0
    assert len(contenido(cfg.destino)) == 26
    assert contenido(cfg.descargas) == []
    salida = capsys.readouterr().out
    assert salida.count("CORRECTO") == 2


def test_manual_total_incorrecto(cfg, monkeypatch, capsys):
    estado.leer(cfg)
    shutil.copy(COMBINADO_1, cfg.descargas / "report - 1.pdf")
    monkeypatch.setattr("builtins.input", lambda *_: "12")
    assert manual(cfg, [], simular=False, con_total=True) == 1
    assert contenido(cfg.destino) == []
    assert "ERROR" in capsys.readouterr().out


def test_manual_sin_pendientes(cfg, capsys):
    assert manual(cfg, [], simular=False, con_total=False) == 0
    assert "No hay combinados" in capsys.readouterr().out


def test_no_pueden_trabajar_dos_a_la_vez(tmp_path):
    with bloqueo(tmp_path / "proceso.lock"):
        with pytest.raises(Ocupado):
            with bloqueo(tmp_path / "proceso.lock"):
                pass
    with bloqueo(tmp_path / "proceso.lock"):  # liberado al terminar
        pass


def test_reconoce_los_nombres_que_pone_edge(cfg):
    from divisor.estado import descargas_ediwin

    for n in ["report.pdf", "report (1).pdf", "report (100).pdf", "report - 2026-10-05T120721.750.pdf",
              "reporte.pdf", "report (1) - copia.pdf", "mi report.pdf", "report (1).pdf.crdownload", "otro.pdf"]:
        (cfg.descargas / n).write_bytes(b"%PDF")
    assert sorted(f.name for f in descargas_ediwin(cfg)) == [
        "report (1).pdf", "report (100).pdf", "report - 2026-10-05T120721.750.pdf", "report.pdf",
    ]


def test_manual_procesa_aunque_se_descargaran_antes_de_la_primera_ejecucion(cfg, monkeypatch, capsys):
    a = shutil.copy(COMBINADO_1, cfg.descargas / "report.pdf")
    b = shutil.copy(COMBINADO_2, cfg.descargas / "report (1).pdf")
    _envejecer(a, 120)
    _envejecer(b, 60)
    estado.leer(cfg)  # primera ejecución DESPUÉS de descargar
    respuestas = iter(["11", "15"])
    monkeypatch.setattr("builtins.input", lambda *_: next(respuestas))
    assert manual(cfg, [], simular=False, con_total=True) == 0
    assert len(contenido(cfg.destino)) == 26
    assert contenido(cfg.descargas) == []
    salida = capsys.readouterr().out
    assert salida.index("report.pdf") < salida.index("report (1).pdf")  # del más antiguo al más nuevo
