#!/usr/bin/env node
/*
 * Prueba la calculadora contra casos reales ya resueltos en SAP.
 *
 * Los PDF de cargos y facturas NO se guardan en el repositorio (llevan datos
 * de clientes). Se leen de una carpeta local que se indica al ejecutar:
 *
 *   CASOS=/ruta/a/mis/casos node pruebas/probar.js
 *
 * Cada caso es un JSON en pruebas/casos/*.json con los archivos que usa y el
 * resultado que se dio por bueno en SAP.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const dirCasos = path.join(__dirname, 'casos');
const baseArchivos = process.env.CASOS || path.join(raiz, '..', 'casos-reales');
const ejecutable = process.env.CHROME || undefined;

const num = v => Number(v);
const eur = v => (v == null || isNaN(v)) ? '—' : v.toFixed(2).replace('.', ',') + ' €';

(async () => {
  const casos = fs.readdirSync(dirCasos).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dirCasos, f), 'utf8')));

  const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
  let fallos = 0;

  for (const caso of casos) {
    const cargo = path.join(baseArchivos, caso.archivos.cargo);
    const factura = path.join(baseArchivos, caso.archivos.factura);
    if (!fs.existsSync(cargo) || !fs.existsSync(factura)) {
      console.log(`\n· ${caso.nombre}: OMITIDO (no encuentro los PDF en ${baseArchivos})`);
      continue;
    }

    const pagina = await navegador.newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push(e.message));
    await pagina.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));

    await pagina.evaluate(() => window.__elegirZona('cargo'));
    await pagina.setInputFiles('#selArchivo', cargo);
    await pagina.waitForFunction(() => document.querySelector('#zonaCargo').classList.contains('lleno'),
      { timeout: 40000 });
    await pagina.evaluate(() => window.__elegirZona('factura'));
    await pagina.setInputFiles('#selArchivo', factura);
    await pagina.waitForFunction(() => document.querySelector('#secResultado') &&
      !document.querySelector('#secResultado').classList.contains('oculto'), { timeout: 40000 });

    const obtenido = await pagina.evaluate(() => ({
      cliente: document.querySelector('#fCliente').value,
      numCargo: document.querySelector('#fNumCargo').value,
      numFactura: document.querySelector('#fNumFactura').value,
      total: window.__num ? window.__num(document.querySelector('#fTotal').value) : null,
      totalTexto: document.querySelector('#fTotal').value,
      lineasCargo: window.E ? window.E.cargo.lineas.length : null,
      lineasFactura: window.E ? window.E.factura.lineas.length : null,
      suma: window.E && window.E.ultimaSalida ? window.E.ultimaSalida.suma : null,
      zaju: window.E && window.E.ultimaSalida ? window.E.ultimaSalida.zaju : null,
      znet: window.E && window.E.ultimaSalida
        ? window.E.ultimaSalida.salida.map(s => ({ pos: s.fila.fac.pos, znet: s.znet, importe: s.importe, objetivo: s.objetivo }))
        : []
    }));

    console.log(`\n=== ${caso.nombre} ===`);
    if (errores.length) console.log('  errores JS:', errores.join(' | '));

    const comprobar = (etiqueta, esperado, real, tol = 0) => {
      const bien = typeof esperado === 'number'
        ? Math.abs(esperado - real) <= tol
        : String(esperado) === String(real);
      if (!bien) fallos++;
      console.log(`  [${bien ? 'OK ' : 'MAL'}] ${etiqueta}: esperado ${esperado}, obtenido ${real}`);
    };

    comprobar('nº de cargo', caso.esperado.numCargo, obtenido.numCargo);
    comprobar('nº de factura', caso.esperado.numFactura, obtenido.numFactura);
    comprobar('líneas del cargo', caso.esperado.lineasCargo, obtenido.lineasCargo);
    comprobar('líneas de la factura', caso.esperado.lineasFactura, obtenido.lineasFactura);
    comprobar('importe sin IVA leído', caso.esperado.totalSinIva, num(obtenido.totalTexto.replace('.', '').replace(',', '.')), 0.005);
    comprobar('suma de las líneas', caso.esperado.sumaLineas, obtenido.suma, 0.005);
    comprobar('ZAJU propuesto', caso.esperado.zaju, obtenido.zaju, 0.005);

    if (caso.esperado.znet) {
      for (const esp of caso.esperado.znet) {
        const real = obtenido.znet.find(z => z.pos === esp.pos);
        comprobar(`pos ${esp.pos} · ZNET`, esp.znet, real ? real.znet : null, 0.001);
        comprobar(`pos ${esp.pos} · importe SAP`, esp.importe, real ? real.importe : null, 0.005);
      }
    }

    const totalAbono = obtenido.suma + obtenido.zaju;
    comprobar('total del abono = total del cargo', caso.esperado.totalSinIva, Math.round(totalAbono * 100) / 100, 0.005);
    console.log(`  → líneas ${eur(obtenido.suma)} + ZAJU ${eur(obtenido.zaju)} = ${eur(totalAbono)}`);

    await pagina.close();
  }

  await navegador.close();
  console.log(fallos === 0 ? '\nTodas las comprobaciones han pasado.' : `\n${fallos} comprobación(es) han fallado.`);
  process.exit(fallos === 0 ? 0 : 1);
})();
