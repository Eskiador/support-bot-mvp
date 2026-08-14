#!/usr/bin/env node
/*
 * Prueba la herramienta en dos frentes:
 *
 *  1. el CUADRE, contra cargos reales ya resueltos en SAP
 *  2. el EMPAREJADO de cada cargo con su archivo en la carpeta
 *
 * Los PDF de cargos y facturas NO se guardan en el repositorio (llevan datos
 * de clientes). Se leen de una carpeta local que se indica al ejecutar:
 *
 *   CASOS=/ruta/a/mis/casos node pruebas/probar.js
 *
 * Las pruebas de emparejado no necesitan ningún archivo: van con nombres
 * inventados, así que se ejecutan siempre.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const dirCasos = path.join(__dirname, 'casos');
const baseArchivos = process.env.CASOS || path.join(raiz, '..', 'casos-reales');
const ejecutable = process.env.CHROME || undefined;
const casosEmparejado = require('./casos_emparejado');

const num = v => Number(v);
const eur = v => (v == null || isNaN(v)) ? '—' : v.toFixed(2).replace('.', ',') + ' €';

(async () => {
  const casos = fs.readdirSync(dirCasos).filter(f => f.endsWith('.json'))
    .map(f => JSON.parse(fs.readFileSync(path.join(dirCasos, f), 'utf8')));

  const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
  let fallos = 0;

  for (const caso of casos) {
    // Un caso puede traer cargo, factura o los dos: hay cargos de los que aún no
    // tengo la factura, y facturas sueltas cuyo formato conviene tener cubierto.
    const cargo = caso.archivos.cargo ? path.join(baseArchivos, caso.archivos.cargo) : null;
    const factura = caso.archivos.factura ? path.join(baseArchivos, caso.archivos.factura) : null;
    if ((cargo && !fs.existsSync(cargo)) || (factura && !fs.existsSync(factura))) {
      console.log(`\n· ${caso.nombre}: OMITIDO (no encuentro los PDF en ${baseArchivos})`);
      continue;
    }

    const pagina = await navegador.newPage();
    const errores = [];
    pagina.on('pageerror', e => errores.push(e.message));
    await pagina.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));

    if (cargo) {
      await pagina.evaluate(() => window.__elegirZona('cargo'));
      await pagina.setInputFiles('#selArchivo', cargo);
      await pagina.waitForFunction(() => window.E.cargo, { timeout: 40000 });
    }
    if (factura) {
      await pagina.evaluate(() => window.__elegirZona('factura'));
      await pagina.setInputFiles('#selArchivo', factura);
      await pagina.waitForFunction(() => window.E.factura, { timeout: 40000 });
    }

    const obtenido = await pagina.evaluate(() => ({
      cliente: document.querySelector('#fCliente').value,
      numCargo: document.querySelector('#fNumCargo').value,
      numFactura: document.querySelector('#fNumFactura').value,
      total: window.__num ? window.__num(document.querySelector('#fTotal').value) : null,
      totalTexto: document.querySelector('#fTotal').value,
      lineasCargo: window.E && window.E.cargo ? window.E.cargo.lineas.length : null,
      lineasFactura: window.E && window.E.factura ? window.E.factura.lineas.length : null,
      sumaFactura: window.E && window.E.factura
        ? Math.round(window.E.factura.lineas.reduce((a, l) => a + (l.importe || 0), 0) * 100) / 100 : null,
      preciosCargo: window.E && window.E.cargo
        ? window.E.cargo.lineas.map(l => l.precioCorrecto) : [],
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

    comprobar('nº de factura', caso.esperado.numFactura, obtenido.numFactura);
    if (caso.esperado.lineasFactura != null)
      comprobar('líneas de la factura', caso.esperado.lineasFactura, obtenido.lineasFactura);
    if (caso.esperado.sumaFactura != null)
      comprobar('suma de la factura', caso.esperado.sumaFactura, obtenido.sumaFactura, 0.005);

    if (!cargo) { console.log('  (caso de solo factura)'); await pagina.close(); continue; }

    comprobar('cliente', caso.esperado.cliente ?? obtenido.cliente, obtenido.cliente);
    comprobar('nº de cargo', caso.esperado.numCargo, obtenido.numCargo);
    comprobar('líneas del cargo', caso.esperado.lineasCargo, obtenido.lineasCargo);
    comprobar('importe sin IVA leído', caso.esperado.totalSinIva,
      num(obtenido.totalTexto.replace(/\./g, '').replace(',', '.')), 0.005);

    if (caso.esperado.preciosCargo) {
      comprobar('precios "es a" leídos', caso.esperado.preciosCargo.join(' '),
        obtenido.preciosCargo.join(' '));
    }
    if (!factura) { console.log('  (sin factura: no se comprueba el cuadre)'); await pagina.close(); continue; }

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

  // ---------------------------------------------------------------------
  // Emparejado de cada cargo con su archivo. Sin PDF de por medio: se inyecta
  // un índice de nombres inventados y se mira a cuál llega.
  // ---------------------------------------------------------------------
  console.log('\n=== Emparejado de cargos con los archivos de la carpeta ===');
  const pagina = await navegador.newPage();
  pagina.on('pageerror', e => console.log('  error JS:', e.message));
  await pagina.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));

  for (const caso of casosEmparejado) {
    const obtenido = await pagina.evaluate(({ cargo, archivos }) => {
      window.E.memoria.pdfIndice = { carpeta: 'CARGOS', fecha: new Date().toISOString(), rutas: archivos };
      window.__cargarIndiceGuardado();
      const d = window.__buscarDoc(cargo);
      return d ? d.ruta : null;
    }, caso);

    const bien = obtenido === caso.espera;
    if (!bien) fallos++;
    console.log(`  [${bien ? 'OK ' : 'MAL'}] ${caso.nombre}`);
    if (!bien) console.log(`        esperado: ${caso.espera}\n        obtenido: ${obtenido}`);
    else if (caso.porque) console.log(`        (${caso.porque})`);
  }
  await pagina.close();

  await navegador.close();
  console.log(fallos === 0 ? '\nTodas las comprobaciones han pasado.' : `\n${fallos} comprobación(es) han fallado.`);
  process.exit(fallos === 0 ? 0 : 1);
})();
