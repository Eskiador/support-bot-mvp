#!/usr/bin/env node
/*
 * Auditoría: ejercita piezas del programa que las pruebas de cuadre no tocan
 * (Excel generado, reimportación del listado, veredicto del cuadre, limpieza
 * entre cargos) y deja los resultados en la consola.
 *
 *   CHROME=... node pruebas/auditoria.js
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const raiz = path.join(__dirname, '..');
const salida = process.env.SALIDA || '/tmp/auditoria';
const ejecutable = process.env.CHROME || undefined;
fs.mkdirSync(salida, {recursive:true});

let fallos = 0;
const dice = (bien, etiqueta, detalle='') => {
  if(!bien) fallos++;
  console.log(`  [${bien?'OK ':'MAL'}] ${etiqueta}${detalle?' — '+detalle:''}`);
};

(async () => {
  const navegador = await chromium.launch(ejecutable ? { executablePath: ejecutable } : {});
  const pagina = await navegador.newPage();
  pagina.on('pageerror', e => console.log('  !! error JS:', e.message));
  await pagina.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));

  // ------------------------------------------------------------------
  console.log('\n=== 1 · Libro de Excel generado ===');
  await pagina.evaluate(() => {
    window.E.memoria.cargos = {
      'A|C/5300011522||2026-07-01|-308.59': {
        cliente:'HIPER USERA, S.L.', asignacion:'C/5300011522', importe:-308.59,
        moneda:'EUR', fecha:'2026-07-01', ndoc:'1800012345', clave:'I',
        estado:'pendiente', abono:'', conforme:null, marcadoEnSap:false,
        compensado:false, reclamado:false, nota:'nota con "comillas" y <etiqueta>',
        clasificado:'', calculo:null, enListado:true, pdfGuardado:false
      }
    };
    window.E.memoria.comerciales = {
      'HIPER USERA SL': {cliente:'HIPER USERA, S.L.', nombre:'Ana', correo:'ana@ejemplo.es', notas:''}
    };
    window.E.memoria.pdfIndice = {carpeta:'CARGOS', fecha:new Date().toISOString(),
      rutas:['HIPER USERA/HIPER_USERA_5300011522.pdf']};
    window.__cargarIndiceGuardado();
    document.querySelector('#fRutaCarpeta').value = 'D:\\CARGOS';
    document.querySelector('#fRutaHtml').value = 'D:\\Contabilizador.html';
  });

  const bytes = await pagina.evaluate(() => new Promise(res => {
    const orig = URL.createObjectURL;
    URL.createObjectURL = b => { b.arrayBuffer().then(ab => res([...new Uint8Array(ab)])); return 'blob:probe'; };
    try { window.__descargarExcel(); } finally { setTimeout(()=>URL.createObjectURL = orig, 0); }
  }));
  const xlsx = path.join(salida, 'Cargos_I.xlsx');
  fs.writeFileSync(xlsx, Buffer.from(bytes));
  console.log(`  libro generado: ${(bytes.length/1024).toFixed(1)} kB → ${xlsx}`);

  // ------------------------------------------------------------------
  console.log('\n=== 2 · Reimportación del listado con otra disposición de columnas ===');
  const reimport = await pagina.evaluate(() => {
    // listado tal como sale de SAP
    const cab = ['Nombre 1','Asignación','Importe en moneda local','Moneda local',
                 'Fecha contabilización','Clave de reclamación','Nº documento'];
    const fila = ['HIPER USERA, S.L.','C/5300011522',-308.59,'EUR',46000,'I','1800012345'];
    window.E.memoria.cargos = {};
    window.__importarListado([cab, fila]);
    const id1 = Object.keys(window.E.memoria.cargos)[0];
    // el usuario hace su trabajo
    window.E.memoria.cargos[id1].abono = '1519001122';
    window.E.memoria.cargos[id1].conforme = true;
    window.E.memoria.cargos[id1].nota = 'trabajo hecho';
    // segunda exportación: el mismo cargo, pero sin la columna «Nº documento»
    const cab2 = ['Nombre 1','Asignación','Importe en moneda local','Moneda local',
                  'Fecha contabilización','Clave de reclamación'];
    const fila2 = ['HIPER USERA, S.L.','C/5300011522',-308.59,'EUR',46000,'I'];
    const r = window.__importarListado([cab2, fila2]);
    const cargos = Object.values(window.E.memoria.cargos);
    return {r, cuantos:cargos.length, abonos:cargos.map(c=>c.abono||''), notas:cargos.map(c=>c.nota||'')};
  });
  dice(reimport.cuantos === 1, 'el cargo no se duplica al reexportar sin la columna «Nº documento»',
       `${reimport.cuantos} cargo(s) en la cola`);
  dice(reimport.abonos.includes('1519001122'), 'el nº de abono sobrevive a la reimportación',
       JSON.stringify(reimport.abonos));

  // ------------------------------------------------------------------
  console.log('\n=== 3 · Registrar un cargo y luego importarlo del listado ===');
  const dobles = await pagina.evaluate(() => {
    window.E.memoria.cargos = {};
    // el usuario calcula y registra antes de importar el listado
    window.E.memoria.cargos['HIPER USERA SL|C/5300011999|||308.59'] = Object.assign(
      {}, {cliente:'HIPER USERA, S.L.', asignacion:'C/5300011999', importe:308.59,
           fecha:'2026-08-01', ndoc:'', abono:'1519009999', conforme:true, nota:'ya calculado',
           estado:'abonado', compensado:false, reclamado:false, marcadoEnSap:false,
           clasificado:'precio', calculo:{suma:1}, enListado:false, moneda:'EUR', clave:''});
    const cab = ['Nombre 1','Asignación','Importe en moneda local','Moneda local',
                 'Fecha contabilización','Clave de reclamación','Nº documento'];
    const fila = ['HIPER USERA, S.L.','C/5300011999',-308.59,'EUR',46050,'I','1800099999'];
    window.__importarListado([cab, fila]);
    const cargos = Object.values(window.E.memoria.cargos);
    return {cuantos:cargos.length, abonos:cargos.map(c=>c.abono||'')};
  });
  dice(dobles.cuantos === 1, 'el cargo registrado a mano no se duplica al importar el listado',
       `${dobles.cuantos} cargo(s)`);
  dice(dobles.abonos.includes('1519009999'), 'conserva el abono del cargo ya registrado');

  // ------------------------------------------------------------------
  // El reconocimiento por cliente + asignación es lo que evita duplicados, pero
  // si afloja de más junta cargos distintos y les cambia el trabajo de sitio.
  // Carrefour numera 20241051S3836, 20241051S44696…: todos comparten el tramo
  // largo de delante y NO son el mismo cargo.
  console.log('\n=== 3b · Qué asignaciones se consideran el mismo cargo ===');
  const parejas = await pagina.evaluate(() => [
    ['C/5300011522', '5300011522',        true,  'el mismo, con y sin el tipo de documento de SAP'],
    ['C/CG0532418',  'CG0532418',         true,  'igual, con el número alfanumérico'],
    ['C/2405NC0147', 'c/2405nc0147',      true,  'da igual cómo esté escrito'],
    ['20241051S3836','20241051S44696',    false, 'dos cargos de Carrefour del mismo pedido'],
    ['DOI25028401',  'ADI25028401',       false, 'mismo número, distinto tipo de documento'],
    ['C/5300011522', 'C/5300011523',      false, 'números consecutivos'],
    ['4188',         '4188',              true,  'asignación corta idéntica'],
    ['4188',         '41880',             false, 'asignación corta parecida']
  ].map(([a,b,espera,porque]) => ({a, b, espera, porque, real: window.__mismaAsignacion(a,b)})));
  for(const t of parejas)
    dice(t.real === t.espera, `«${t.a}» ${t.espera?'=':'≠'} «${t.b}» — ${t.porque}`);

  // ------------------------------------------------------------------
  console.log('\n=== 4 · Veredicto del cuadre con líneas medidas en SAP ===');
  const veredicto = await pagina.evaluate(() => {
    window.E.factura = {numero:'90224478', fecha:'', texto:'', lineas:[
      {pos:10, material:'2007482', udsCaja:12, desc:'ARTICULO A', cantidad:10080, um:'UC', precio:0.847, importe:8537.76}
    ]};
    window.E.cargo = {numero:'X', cliente:'C', fecha:'', refFactura:'90224478',
      totalSinIva:100, ivaPct:null, sinImportes:false, texto:'', lineas:[
      {n:1, desc:'ARTICULO A', importe:100, importeFirmado:100, precioCorrecto:null,
       difUnitaria:null, y:0, pag:1, texto:'ARTICULO A 100,00'}]};
    document.querySelector('#fTotal').value = '100,00';
    document.querySelector('#fModo').value = 'importe';
    window.__emparejar();
    // medición real de SAP: con ZNET 10 devuelve 2,00 € -> factor 0,20
    window.E.filas[0].netoPrueba = '2';
    window.__calcular();
    const u = window.E.ultimaSalida;
    return {
      znet: u.salida[0].znet, importe: u.salida[0].importe, factor: u.salida[0].factor,
      rotulo: document.querySelector('#marcador .veredicto .vl').textContent.trim(),
      zaju: u.zaju
    };
  });
  console.log('  ', JSON.stringify(veredicto));
  dice(Math.abs(veredicto.factor - 0.2) < 1e-9, 'el factor sale de la medición, no de la cantidad',
       'factor='+veredicto.factor);
  dice(veredicto.rotulo !== 'NO CUADRA' || Math.abs(veredicto.zaju) > 0.2,
       'el veredicto tiene en cuenta el salto real de la línea medida', 'veredicto='+veredicto.rotulo);

  // ------------------------------------------------------------------
  // Encadenar dos facturas distintas sin vaciar en medio: el nº que queda en la
  // cabecera es el que se registra en la ficha del cargo, así que tiene que ser
  // el de la factura que está cargada de verdad.
  console.log('\n=== 5 · Nº de factura al cambiar de factura sin vaciar ===');
  const base = process.env.CASOS || path.join(raiz, '..', 'casos-reales');
  const facA = path.join(base, 'ALIMERKA_FACTURA_PDF.pdf');
  const facB = path.join(base, 'HIPERUSERA_FACTURA_12.pdf');
  if(fs.existsSync(facA) && fs.existsSync(facB)){
    // página limpia: los apartados anteriores han dejado facturas de mentira en E
    const hoja = await navegador.newPage();
    hoja.on('pageerror', e => console.log('  !! error JS:', e.message));
    await hoja.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));
    await hoja.evaluate(() => window.__elegirZona('factura'));
    await hoja.setInputFiles('#selArchivo', facA);
    await hoja.waitForFunction(() => window.E.factura, {timeout:40000});
    const primera = await hoja.inputValue('#fNumFactura');
    await hoja.setInputFiles('#selArchivo', facB);
    await hoja.waitForFunction(n => window.E.factura && window.E.factura.numero !== n,
                               primera, {timeout:40000});
    const segunda = await hoja.inputValue('#fNumFactura');
    await hoja.close();
    dice(primera === '90224478', 'la primera factura deja su número en la cabecera', primera);
    dice(segunda === '1509010571',
         'el nº de factura se actualiza al cargar otra factura', `${primera} → ${segunda}`);
  } else {
    console.log('  OMITIDO (no encuentro las facturas en '+base+')');
  }

  // ------------------------------------------------------------------
  // Antes se calculaba el salto mínimo con cantidad/base aunque la línea
  // estuviera medida. Con una medición fina el programa declaraba «inevitable»
  // un descuadre que la línea sí podía absorber, y escondía el botón de cuadrar.
  console.log('\n=== 4b · Descuadre que la línea medida SÍ puede absorber ===');
  const finura = await pagina.evaluate(() => {
    window.E.factura = {numero:'1', fecha:'', texto:'', lineas:[
      {pos:10, material:'2007482', udsCaja:12, desc:'A', cantidad:10080, um:'UC', precio:0.8, importe:1}]};
    window.E.cargo = {numero:'X', cliente:'C', fecha:'', refFactura:'', totalSinIva:100.5,
      ivaPct:null, sinImportes:false, texto:'', lineas:[{n:1, desc:'A', importe:100,
      importeFirmado:100, precioCorrecto:null, difUnitaria:null, y:0, pag:1, texto:'A 100,00'}]};
    document.querySelector('#fTotal').value = '100,50';
    document.querySelector('#fModo').value = 'importe';
    window.__emparejar();
    window.E.filas[0].netoPrueba = '2';        // ZNET 10 → 2 € : cada céntimo mueve 0,002 €
    window.__calcular();
    return {
      pasoReal: window.E.ultimaSalida.salida[0].factor * 0.01,
      veredicto: document.querySelector('#marcador .veredicto .vl').textContent.trim(),
      hayBotonCuadrar: !!document.querySelector('#btnCuadrar')
    };
  });
  dice(finura.veredicto === 'NO CUADRA',
       'un descuadre de 0,50 € con saltos de 0,002 € no se da por inevitable', finura.veredicto);
  dice(finura.hayBotonCuadrar, 'se ofrece cuadrar las líneas en vez de mandarlo todo al ZAJU');

  // ------------------------------------------------------------------
  console.log('\n=== 4c · Línea en cajas sin saber las unidades por caja ===');
  const muda = await pagina.evaluate(() => {
    window.E.factura = {numero:'1', fecha:'', texto:'', lineas:[
      {pos:10, material:'2007482', udsCaja:null, desc:'A', cantidad:100, um:'CJ', precio:1, importe:1}]};
    window.E.cargo = {numero:'X', cliente:'C', fecha:'', refFactura:'', totalSinIva:50, ivaPct:null,
      sinImportes:false, texto:'', lineas:[{n:1, desc:'A', importe:50, importeFirmado:50,
      precioCorrecto:null, difUnitaria:null, y:0, pag:1, texto:'A 50'}]};
    document.querySelector('#fTotal').value = '50,00';
    document.querySelector('#fBase').value = '100UC';
    window.__emparejar(); window.__calcular();
    return {znet: window.E.ultimaSalida.salida[0].znet,
            aviso: document.querySelector('#avisosZnet').textContent};
  });
  dice(isNaN(muda.znet), 'no se inventa un ZNET cuando la cantidad no se puede convertir');
  dice(/sin unidades por caja/.test(muda.aviso),
       'lo dice en vez de dejar la línea fuera del cuadre en silencio',
       muda.aviso.slice(0,90));

  // ------------------------------------------------------------------
  // Al abrir un cargo desde la cola, su asignación se escribe en la cabecera y
  // después se lee el PDF. La lectura limpiaba los campos para que no se
  // quedara pegado el cargo anterior, y de paso borraba la asignación: si el
  // PDF del cliente no trae el número en un formato reconocible, el campo se
  // quedaba vacío aunque en la ficha se viera bien.
  console.log('\n=== 5b · La asignación de la cola sobrevive a leer el PDF ===');
  const cargoPdf = path.join(base, 'ALIPENSA_NC2417589.pdf');
  if(fs.existsSync(cargoPdf)){
    const hoja = await navegador.newPage();
    hoja.on('pageerror', e => console.log('  !! error JS:', e.message));
    await hoja.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));
    await hoja.evaluate(() => {
      window.E.fijado = {cliente:'PENINSULACO, S.L.', asignacion:'CP-0008336'};
      document.querySelector('#fCliente').value = 'PENINSULACO, S.L.';
      document.querySelector('#fNumCargo').value = 'CP-0008336';
      window.__elegirZona('cargo');
    });
    await hoja.setInputFiles('#selArchivo', cargoPdf);
    await hoja.waitForFunction(() => window.E.cargo, {timeout:40000});
    const quedo = await hoja.evaluate(() => ({
      numCargo: document.querySelector('#fNumCargo').value,
      cliente: document.querySelector('#fCliente').value,
      leidoDelPdf: window.E.cargo.numero
    }));
    await hoja.close();
    dice(quedo.numCargo === 'CP-0008336',
         'el nº de cargo sigue siendo el de la cola después de leer el PDF',
         `quedó «${quedo.numCargo}» (el PDF decía «${quedo.leidoDelPdf}»)`);
    dice(quedo.cliente === 'PENINSULACO, S.L.',
         'el cliente del listado tampoco lo pisa el PDF', quedo.cliente);
  } else {
    console.log('  OMITIDO (no encuentro el PDF del cargo en '+base+')');
  }

  // ------------------------------------------------------------------
  // Con este perfil de cargo la diferencia aparece sola al asignar la línea,
  // sin teclear precios, porque el cargo trae lo facturado y lo correcto en dos
  // renglones. Desde la pantalla no había forma de saberlo.
  console.log('\n=== 5c · Se explica de dónde sale la diferencia ===');
  const cargoPar = path.join(base, 'CARGO_TIPO_ALCAMPO.pdf');
  const facPar = path.join(base, 'FACTURA_TIPO_ALCAMPO.pdf');
  if(fs.existsSync(cargoPar) && fs.existsSync(facPar)){
    const hoja = await navegador.newPage();
    hoja.on('pageerror', e => console.log('  !! error JS:', e.message));
    await hoja.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));
    await hoja.evaluate(() => window.__elegirZona('cargo'));
    await hoja.setInputFiles('#selArchivo', cargoPar);
    await hoja.waitForFunction(() => window.E.cargo, {timeout:40000});
    await hoja.evaluate(() => window.__elegirZona('factura'));
    await hoja.setInputFiles('#selArchivo', facPar);
    await hoja.waitForFunction(() => window.E.factura, {timeout:40000});
    const explica = await hoja.evaluate(() => ({
      fundidas: window.E.cargo.lineas.filter(l => l.fundida).length,
      restas: window.E.cargo.lineas.map(l => l.fundida).filter(Boolean),
      aviso: document.querySelector('#avisoEmparejado').textContent,
      opcion: [...document.querySelectorAll('.selCargo option')]
        .map(o => o.textContent).find(t => /\(/.test(t)) || '',
      pista: document.querySelector('.datoMan') ? document.querySelector('.datoMan').title : ''
    }));
    await hoja.close();
    dice(explica.fundidas > 0, 'el cargo se lee fundiendo los dos renglones de cada artículo',
         explica.restas.join(' · '));
    dice(/dos renglones por/.test(explica.aviso),
         'se avisa en pantalla de que la diferencia ya viene restada');
    dice(/\(.+[−+].+\)/.test(explica.opcion),
         'el desplegable enseña la resta concreta de esa línea', explica.opcion.trim());
    dice(/resta de los dos/.test(explica.pista),
         'el dato del cargo explica su origen al pasar el ratón', explica.pista.slice(0,70));
  } else {
    console.log('  OMITIDO (no encuentro el cargo de pares en '+base+')');
  }

  // ------------------------------------------------------------------
  // Compensar y reclamar una tanda abriendo la ficha de cada cargo son cuatro
  // acciones por un sí o un no, y la ficha además baja la página hasta el final.
  console.log('\n=== 5d · Marcar compensado y reclamado desde la propia tabla ===');
  const casillas = await pagina.evaluate(async () => {
    window.E.memoria.cargos = {};
    for(let i = 0; i < 12; i++) window.E.memoria.cargos['p'+i] = {
      cliente:'PENINSULACO, S.L.', asignacion:'CP-000833'+i, importe:-21.62,
      fecha:'2024-08-05', ndoc:'', moneda:'EUR', clave:'I', abono:'151900124'+i,
      fechaAbono:'2026-08-01', conforme:false, marcadoEnSap:false, compensado:false,
      reclamado:false, fechaReclamacion:'', nota:'', clasificado:'precio',
      calculo:null, enListado:true, pdfGuardado:false, estado:'abonado'};
    window.__pintarCola();

    const celdas = f => [...document.querySelectorAll(`#tablaCola tbody tr:first-child td[data-campo="${f}"]`)][0];
    const antes = window.E.memoria.cargos.p0.compensado;
    celdas('compensado').click();                       // un clic en la casilla
    const trasUno = window.E.memoria.cargos.p0.compensado;
    celdas('reclamado').click();
    const trasDos = window.E.memoria.cargos.p0.reclamado;
    celdas('pdfGuardado').click();
    const trasTres = window.E.memoria.cargos.p0.pdfGuardado;
    const fecha = window.E.memoria.cargos.p0.fechaReclamacion;
    const abrioFicha = !document.querySelector('#secFicha').classList.contains('oculto');

    // y la tanda entera de una vez
    const botones = [...document.querySelectorAll('#barraLote [data-lote]')].map(b => b.textContent.trim());
    const original = window.confirm; window.confirm = () => true;
    [...document.querySelectorAll('#barraLote [data-lote]')]
      .find(b => /compensados/.test(b.textContent)).click();
    window.confirm = original;
    const compensados = Object.values(window.E.memoria.cargos).filter(c => c.compensado).length;
    const cerrados = Object.values(window.E.memoria.cargos).filter(c => c.estado === 'cerrado').length;
    return {antes, trasUno, trasDos, trasTres, fecha, abrioFicha, botones, compensados, cerrados};
  });
  dice(casillas.antes === false && casillas.trasUno === true,
       'un clic en la casilla marca el cargo como compensado');
  dice(casillas.trasDos === true, 'y otro lo marca como reclamado');
  dice(casillas.trasTres === true, 'y la casilla del PDF guardado también está en la tabla');
  dice(!!casillas.fecha, 'apunta la fecha de reclamación sola', casillas.fecha);
  dice(!casillas.abrioFicha, 'no abre la ficha ni salta la página al hacerlo');
  dice(casillas.botones.some(t => /Marcar 11 como compensados/.test(t)),
       'ofrece marcar de golpe los que quedan del filtro', casillas.botones.join(' | '));
  dice(casillas.compensados === 12, 'la acción en lote los marca todos', casillas.compensados+' de 12');
  // Compensar no cierra nada: el cierre lo decide quien cierra (ver 5f).
  dice(casillas.cerrados === 0,
       'compensar en lote no cierra ningún cargo por su cuenta',
       `${casillas.cerrados} cerrado(s) de 12`);

  // ------------------------------------------------------------------
  console.log('\n=== 5g · Marca del cargo: MDD o MDF ===');
  const marca = await pagina.evaluate(() => {
    window.E.memoria.cargos = {};
    for(let i = 0; i < 4; i++) window.E.memoria.cargos['m'+i] = {
      cliente:'PENINSULACO, S.L.', asignacion:'CP-00090'+i, importe:-10, fecha:'2026-08-01',
      ndoc:'', moneda:'EUR', clave:'I', abono:'', fechaAbono:'', conforme:null,
      marcadoEnSap:false, compensado:false, reclamado:false, fechaReclamacion:'',
      nota:'', clasificado:'', calculo:null, enListado:true, pdfGuardado:false,
      cerrado:false, marca:'', estado:'pendiente'};
    window.__pintarCola();
    const celda = () => document.querySelector('#tablaCola tbody tr:first-child td[data-campo="marca"]');
    const hayColumna = !!celda();
    celda().click(); const uno = window.E.memoria.cargos.m0.marca;
    celda().click(); const dos = window.E.memoria.cargos.m0.marca;
    celda().click(); const tres = window.E.memoria.cargos.m0.marca;
    // en lote
    const botones = [...document.querySelectorAll('#barraLote [data-lote]')].map(b => b.textContent.trim());
    const iMDD = [...document.querySelectorAll('#barraLote [data-lote]')]
      .find(b => /MDD/.test(b.textContent));
    const original = window.confirm; window.confirm = () => true;
    if(iMDD) iMDD.click();
    window.confirm = original;
    const cuantosMDD = Object.values(window.E.memoria.cargos).filter(c => c.marca === 'MDD').length;
    // filtro
    document.querySelector('#fMarca').value = 'MDF';
    window.__pintarCola();
    const filtradoMDF = document.querySelectorAll('#tablaCola tbody tr').length;
    document.querySelector('#fMarca').value = '';
    window.__pintarCola();
    return {hayColumna, uno, dos, tres, botones, cuantosMDD, filtradoMDF};
  });
  dice(marca.hayColumna, 'la marca tiene su columna en la cola');
  dice(marca.uno === 'MDD' && marca.dos === 'MDF' && marca.tres === '',
       'un clic va pasando por MDD, MDF y sin decidir',
       `${marca.uno} → ${marca.dos} → «${marca.tres}»`);
  dice(marca.botones.some(t => /MDD/.test(t)) && marca.botones.some(t => /MDF/.test(t)),
       'se puede poner la marca a toda una tanda de golpe');
  dice(marca.cuantosMDD === 4, 'la acción en lote marca los cuatro', String(marca.cuantosMDD));
  dice(marca.filtradoMDF === 0, 'el filtro por marca funciona', String(marca.filtradoMDF));

  const enLibro = await pagina.evaluate(() =>
    window.__hojasDelLibro()[0].filas[0].map(c => (c && c.v) || c));
  dice(enLibro.includes('Marca'), 'la marca sale en el Excel', enLibro.join(' · ').slice(0,80));

  // ------------------------------------------------------------------
  // Un cliente puede llevar un comercial para MDD y otro para MDF.
  console.log('\n=== 5h · Un comercial por cliente Y marca ===');
  const coms = await pagina.evaluate(() => {
    window.E.memoria.comerciales = {
      // como lo guardaba la versión anterior: solo por cliente
      'COVIRAN': {cliente:'COVIRAN', nombre:'Antiguo', correo:'antiguo@ejemplo.es', notas:''}
    };
    window.__aplicarDatos(null);              // migración al abrir el archivo
    const migrado = window.__comercialDe('COVIRAN', 'MDD');

    window.E.memoria.comerciales['ALDI|MDD'] =
      {cliente:'ALDI', marca:'MDD', nombre:'Juan', correo:'juan@ejemplo.es', notas:''};
    window.E.memoria.comerciales['ALDI|MDF'] =
      {cliente:'ALDI', marca:'MDF', nombre:'Pablo', correo:'pablo@ejemplo.es', notas:''};

    const cargo = m => ({cliente:'ALDI', asignacion:'C/1', importe:-10, marca:m, ndoc:'',
                         fecha:'2026-08-01', nota:'', abono:''});
    return {
      migrado: migrado && migrado.nombre,
      mdd: (window.__comercialDe('ALDI', 'MDD')||{}).nombre,
      mdf: (window.__comercialDe('ALDI', 'MDF')||{}).nombre,
      sinMarca: window.__comercialDe('ALDI', ''),
      correoMdd: window.__textoCorreo(cargo('MDD')).para,
      correoMdf: window.__textoCorreo(cargo('MDF')).para,
      repartido: window.__repartidoPorMarca('ALDI'),
      noRepartido: window.__repartidoPorMarca('COVIRAN')
    };
  });
  dice(coms.mdd === 'Juan' && coms.mdf === 'Pablo',
       'ALDI MDD es de Juan y ALDI MDF de Pablo', `${coms.mdd} / ${coms.mdf}`);
  dice(coms.correoMdd === 'juan@ejemplo.es' && coms.correoMdf === 'pablo@ejemplo.es',
       'el correo de reclamación va al que toca según la marca del cargo');
  dice(coms.sinMarca === null,
       'un cargo sin marca no se le asigna a ninguno de los dos por su cuenta');
  dice(coms.migrado === 'Antiguo',
       'los comerciales guardados antes valen para todo el cliente', String(coms.migrado));
  dice(coms.repartido === true && coms.noRepartido === false,
       'se sabe qué clientes tienen el reparto hecho');

  const cuenta = await pagina.evaluate(() => {
    window.E.memoria.comerciales = {
      'ALDI|MDD': {cliente:'ALDI, S.L.', marca:'MDD', nombre:'Juan', correo:'j@e.es', notas:''},
      'ALDI|MDF': {cliente:'ALDI, S.L.', marca:'MDF', nombre:'Pablo', correo:'p@e.es', notas:''}
    };
    window.E.memoria.cargos = {};
    for(let i = 0; i < 6; i++) window.E.memoria.cargos['a'+i] = {
      cliente:'ALDI, S.L.', asignacion:'C/'+i, importe:-10, fecha:'2026-08-01', ndoc:'',
      moneda:'EUR', clave:'I', abono:'', fechaAbono:'', conforme:null, marcadoEnSap:false,
      compensado:false, reclamado:false, fechaReclamacion:'', nota:'', clasificado:'',
      calculo:null, enListado:true, pdfGuardado:false, cerrado:false,
      marca: i < 4 ? 'MDD' : 'MDF', estado:'pendiente'};
    window.__pintarComerciales();
    return [...document.querySelectorAll('#tablaCom tbody tr')]
      .map(tr => tr.children[2].textContent + ':' + tr.children[5].textContent);
  });
  dice(cuenta.join(' ') === 'Juan:4 Pablo:2',
       'cada comercial ve los cargos de su marca', cuenta.join(' '));

  // Buscador de la pestaña de comerciales
  const busca = await pagina.evaluate(() => {
    window.E.memoria.comerciales = {
      'ALDI|MDD':   {cliente:'ALDI, S.L.', marca:'MDD', nombre:'Juan Ruiz',
                     correo:'juan.ruiz@ejemplo.es', notas:'620 11 22 33'},
      'ALDI|MDF':   {cliente:'ALDI, S.L.', marca:'MDF', nombre:'Pablo Gil',
                     correo:'pablo.gil@ejemplo.es', notas:''},
      'COVIRAN|':   {cliente:'COVIRÁN S.COOP.', marca:'', nombre:'Ana Soto',
                     correo:'ana@ejemplo.es', notas:'lleva todo'},
      'MUSGRAVE|MDD': {cliente:'MUSGRAVE ESPAÑA', marca:'MDD', nombre:'Luis Paz',
                     correo:'luis@ejemplo.es', notas:''}
    };
    const nombres = () => [...document.querySelectorAll('#tablaCom tbody tr')]
      .map(tr => tr.children[2] ? tr.children[2].textContent : '(vacío)');
    const buscar = t => { document.querySelector('#cBuscar').value = t;
                          window.__pintarComerciales(); return nombres(); };
    const r = {
      todos:    buscar('').length,
      porMarca: buscar('MDF'),
      porNombre:buscar('pablo'),
      porCliente:buscar('coviran'),          // sin tilde, y en el nombre va con ella
      porCorreo:buscar('luis@ejemplo'),
      generales:buscar('todo el cliente'),
      sinNada:  buscar('zzz'),
      chip:     document.querySelector('#chipCom').textContent,
      aviso:    document.querySelector('#tablaCom tbody').textContent.trim()
    };
    document.querySelector('#cBuscar').value = ''; window.__pintarComerciales();
    return r;
  });
  dice(busca.todos === 4, 'sin filtro salen todos', String(busca.todos));
  dice(busca.porMarca.join() === 'Pablo Gil', 'busca por MDD / MDF', busca.porMarca.join(' '));
  dice(busca.porNombre.join() === 'Pablo Gil', 'busca por el nombre del comercial');
  dice(busca.porCliente.join() === 'Ana Soto', 'busca por cliente, sin importar la tilde');
  dice(busca.porCorreo.join() === 'Luis Paz', 'busca por el correo, con arroba y punto');
  dice(busca.generales.join() === 'Ana Soto', 'busca «todo el cliente» para los generales');
  dice(busca.chip === '0 de 4', 'el contador dice cuántos casan', busca.chip);
  dice(/Ninguno de los 4/.test(busca.aviso),
       'sin resultados lo explica en vez de parecer que no hay nada', busca.aviso.slice(0,60));

  // ------------------------------------------------------------------
  // Cerrar es una decisión. Antes el estado saltaba solo a «cerrado» en cuanto
  // un cargo estaba abonado, compensado y conforme, y desaparecía de la vista
  // mientras todavía se estaba trabajando.
  console.log('\n=== 5f · Un cargo no se cierra solo ===');
  const cierre = await pagina.evaluate(() => {
    window.E.memoria.cargos = {
      c1: {cliente:'X, S.L.', asignacion:'CP-1', importe:-10, fecha:'2026-08-01', ndoc:'',
           moneda:'EUR', clave:'I', abono:'1519001111', fechaAbono:'2026-08-01',
           conforme:true, marcadoEnSap:true, compensado:true, reclamado:false,
           fechaReclamacion:'', nota:'', clasificado:'precio', calculo:null,
           enListado:true, pdfGuardado:true, cerrado:false, estado:'abonado'},
      // un cargo guardado con la versión anterior: no trae el campo «cerrado»
      c2: {cliente:'Y, S.L.', asignacion:'CP-2', importe:-20, fecha:'2026-08-01', ndoc:'',
           moneda:'EUR', clave:'I', abono:'1519002222', fechaAbono:'2026-08-01',
           conforme:true, marcadoEnSap:true, compensado:true, reclamado:false,
           fechaReclamacion:'', nota:'', clasificado:'precio', calculo:null,
           enListado:true, pdfGuardado:true, estado:'cerrado'}
    };
    window.__pintarCola();
    const traeTodo = window.E.memoria.cargos.c1.estado;
    const antiguo  = window.E.memoria.cargos.c2.estado;
    // la casilla de estado cierra y reabre
    const casilla = () => document.querySelector('#tablaCola tbody tr:first-child td[data-campo="cerrado"]');
    const hayCasilla = !!casilla();
    casilla().click();
    const trasCerrar = window.E.memoria.cargos.c1.estado;
    const fecha = window.E.memoria.cargos.c1.fechaCierre;
    casilla().click();
    const trasReabrir = window.E.memoria.cargos.c1.estado;
    return {traeTodo, antiguo, hayCasilla, trasCerrar, fecha, trasReabrir};
  });
  dice(cierre.traeTodo === 'abonado',
       'abonado + conforme + compensado se queda en abonado', cierre.traeTodo);
  dice(cierre.antiguo === 'abonado',
       'y los que la versión anterior había cerrado sola vuelven a abonado', cierre.antiguo);
  dice(cierre.hayCasilla && cierre.trasCerrar === 'cerrado',
       'se cierra con un clic en la casilla de estado', cierre.trasCerrar);
  dice(!!cierre.fecha, 'apunta la fecha de cierre', cierre.fecha);
  dice(cierre.trasReabrir === 'abonado', 'y se reabre con otro clic', cierre.trasReabrir);

  // ------------------------------------------------------------------
  // La cola tiene trece columnas y hay que verlas todas de una vez: si no cabe,
  // se acaba deslizando la tabla de lado para marcar cada casilla.
  console.log('\n=== 5e · La cola entera cabe sin deslizar de lado ===');
  for(const ancho of [1920, 1440, 1366, 1280]){
    const hoja = await navegador.newPage({viewport:{width:ancho, height:900}});
    await hoja.goto('file://' + path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html'));
    const r = await hoja.evaluate(() => {
      window.E.memoria.cargos = {};
      const clientes = ['PENINSULACO, S.L.', 'CENTROS COMERCIALES CARREFOUR SOCIEDAD ANONIMA',
                        'COVIRAN S.COOP.ANDALUZA'];
      for(let i = 0; i < 15; i++) window.E.memoria.cargos['k'+i] = {
        cliente:clientes[i%3], asignacion:'CP-000833'+i, importe:-1234.56,
        fecha:'2024-08-05', ndoc:'', moneda:'EUR', clave:'I', abono:'1519001241',
        fechaAbono:'2026-08-01', conforme:i%3===0?false:(i%3===1?true:null),
        marcadoEnSap:false, compensado:false, reclamado:false, fechaReclamacion:'',
        nota:'', clasificado:'precio', calculo:null, enListado:true,
        pdfGuardado:false, estado:'abonado'};
      window.__pintarCola();
      const env = document.querySelector('#tablaCola').closest('.tablaenv');
      // la columna del cliente se corta a propósito, con el nombre entero en el título
      const cortadas = [...document.querySelectorAll('#tablaCola tbody td')]
        .filter(td => td.scrollWidth > td.clientWidth + 1 && td.cellIndex !== 2)
        .map(td => `col ${td.cellIndex}: ${td.textContent.trim()}`);
      return {
        desliza: env.scrollWidth > env.clientWidth + 1,
        pagina: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        columnas: document.querySelectorAll('#tablaCola thead th').length,
        casillas: document.querySelectorAll('#tablaCola tbody tr:first-child td[data-campo]').length,
        // conforme · SAP · comp. · recl. · PDF · estado (cerrar/reabrir)
        cortadas: [...new Set(cortadas)]
      };
    });
    await hoja.close();
    dice(!r.desliza && !r.pagina, `a ${ancho} px se ve la tabla entera sin barra lateral`);
    dice(r.cortadas.length === 0, `a ${ancho} px no hay texto recortado`,
         r.cortadas.slice(0,4).join(' | '));
    if(ancho === 1366){
      dice(r.columnas === 14, 'la cola tiene las catorce columnas', String(r.columnas));
      dice(r.casillas === 7, 'las siete casillas se marcan desde la tabla', String(r.casillas));
    }
  }

  // ------------------------------------------------------------------
  // El orden importa: si se arrastra el listado ANTES de conectar el archivo
  // de datos, guardarDatos() no tiene dónde escribir y no hace nada, en
  // silencio. Al conectar el archivo justo después, aplicarDatos() sustituye
  // la memoria entera por lo que había en el archivo (el listado VIEJO) y el
  // que se acababa de arrastrar desaparecía sin avisar.
  console.log('\n=== 5i · Arrastrar el listado antes de conectar el archivo de datos ===');
  const orden = await pagina.evaluate(() => {
    // estado limpio, como una sesión que arranca sin archivo de datos conectado
    window.E.handle = null;
    window.E.memoria.cargos = {};
    window.__setListadoPendiente(null);

    // 1) se arrastra el listado nuevo de SAP, sin archivo de datos conectado todavía
    const cabNuevo = ['Nombre 1','Asignación','Importe en moneda local','Moneda local',
                      'Fecha contabilización','Clave de reclamación','Nº documento'];
    const filasNuevo = [cabNuevo,
      ['ALCAMPO, S.A.','098017625',-308.59,'EUR',46200,'I','1800000111'],
      ['HIPER USERA, S.L.','C/5300099999',-12.34,'EUR',46200,'I','1800000222']];
    window.__importarListado(filasNuevo);
    // guardarDatos() sin handle no hace nada: así se marca a mano, como haría
    // procesarListado() al ver que guardarDatos() devuelve false
    window.__setListadoPendiente(filasNuevo);
    const trasArrastrar = Object.keys(window.E.memoria.cargos).length;

    // 2) se conecta un archivo de datos que ya tenía guardado el listado VIEJO,
    // con un cargo ya trabajado (abono puesto)
    window.E.memoria.cargos = {};       // aplicarDatos() reemplaza esto entero
    const datosDelArchivo = {
      clientes:{}, comerciales:{}, log:[],
      cargos:{
        'ALCAMPO SA|098017625|1800000100||': {
          cliente:'ALCAMPO, S.A.', asignacion:'098017625', importe:-300, fecha:'2026-08-01',
          ndoc:'1800000100', moneda:'EUR', clave:'I', abono:'1519005555', fechaAbono:'2026-08-02',
          conforme:true, marcadoEnSap:true, compensado:false, reclamado:false,
          fechaReclamacion:'', nota:'ya revisado la semana pasada', clasificado:'precio',
          calculo:null, enListado:true, pdfGuardado:false, cerrado:false, marca:'',
          estado:'abonado'
        }
      }
    };
    window.__aplicarDatos(datosDelArchivo);
    const soloArchivo = Object.keys(window.E.memoria.cargos).length;

    // 3) esto es lo que hace conectarDatos() justo después de aplicarDatos()
    return window.__reaplicarListadoPendiente().then(() => {
      const cargos = Object.values(window.E.memoria.cargos);
      const alcampo = cargos.find(c => c.asignacion === '098017625');
      return {
        trasArrastrar, soloArchivo,
        total: cargos.length,
        hiperUsera: !!cargos.find(c => c.asignacion === 'C/5300099999'),
        abonoConservado: alcampo && alcampo.abono,
        importeActualizado: alcampo && alcampo.importe,
        notaConservada: alcampo && alcampo.nota,
        quedaPendiente: window.__getListadoPendiente()
      };
    });
  });
  dice(orden.trasArrastrar === 2, 'el listado arrastrado sin archivo conectado se ve en pantalla',
       orden.trasArrastrar + ' cargo(s)');
  dice(orden.soloArchivo === 1, 'conectar el archivo reemplaza la memoria (el paso que antes lo perdía todo)');
  dice(orden.total === 2,
       'tras reaplicar, están los del listado arrastrado, no solo los del archivo',
       orden.total + ' cargo(s) en total');
  dice(orden.hiperUsera, 'el segundo cargo del listado (que no estaba en el archivo) también aparece');
  dice(orden.abonoConservado === '1519005555',
       'el abono que ya tenía el archivo para ese cargo no se pierde', orden.abonoConservado);
  dice(orden.notaConservada === 'ya revisado la semana pasada',
       'la nota tampoco se pierde');
  dice(orden.importeActualizado === -308.59,
       'el importe se actualiza con el del listado nuevo', orden.importeActualizado);
  dice(orden.quedaPendiente === null, 'el listado pendiente se limpia después de reaplicarlo');

  // ------------------------------------------------------------------
  // Cuando un cargo de precio es no conforme, a veces hay que detallarle al
  // comercial la gama de producto y el % de descuento que no se aplicó. Solo
  // tiene sentido en MDF (marca propia): la del distribuidor no tiene gamas.
  console.log('\n=== 5j · Gama y % de descuento no aplicado ===');
  const gamas = await pagina.evaluate(() => {
    const casos = [
      ['MERMELADA DE FRESAS LVF 800G', 'LVF'], ['MERMELADA DE NARANJA LVZ 800G', 'LVZ'],
      ['MERMELADA NATURAL LVN 350G', 'LVN'], ['MERMELADA LV0 SIN AZUCAR 350G', 'LV0'],
      ['FUSION FRESA-KIWI LFF 280G', 'LFF'], ['MERMELADA DIET LVD 280G', 'LVD'],
      ['COCINA SELECTA LVC 280G', 'LVC'], ['MERMELADA LVT COMBINA CON TODO 350G', 'LVT'],
      ['INFUSION MANZANILLA INFU 20 BOLSAS', 'INFU'],
      ['INFUSION LAXANTES 20 BOLSAS', 'LAXANTES'], ['ACEITUNA RELLENA ANCHOA FRAGATA 300G', 'FRAGATA'],
      // «FRA» es como sale la gama de aceitunas al copiar y pegar directamente
      // de SAP (el PDF de la propia factura la escribe entera, «FRAGATA»): se
      // normaliza al mismo código para que el resumen no enseñe dos etiquetas
      // distintas de la misma gama.
      ['FRA MANZ REL ANCHO 18 12x350 G', 'FRAGATA'],
      // Un código pegado a una cifra, sin espacio («LVF280», frente a «LVF
      // 800G»): \b no corta ahí (una cifra es parte de la misma «palabra»),
      // así que hacía falta algo más estricto que un límite de palabra.
      ['SAL.DULC PIM. ROJ JALAP LVF280', 'LVF'],
      ['TISANA RELAX 20 BOLSAS', null], ['AGUA MINERAL 1,5L', null]
    ];
    const detectadas = casos.map(([d, esperado]) => [d, window.__gamaDe(d), esperado]);

    window.E.factura = {numero:'1', fecha:'', texto:'', lineas:[
      {pos:10, material:'1', udsCaja:null, desc:'MERMELADA DE FRESAS LVF 800G', cantidad:100, um:'UC', precio:2.2, importe:220},
      {pos:20, material:'2', udsCaja:null, desc:'MERMELADA DE NARANJA LVZ 800G', cantidad:50, um:'UC', precio:2.2, importe:110},
      {pos:30, material:'3', udsCaja:null, desc:'TISANA RELAX 20 BOLSAS', cantidad:20, um:'UC', precio:1.5, importe:30}
    ]};
    window.E.cargo = {numero:'X', cliente:'C', fecha:'', refFactura:'', totalSinIva:44, ivaPct:null,
      sinImportes:false, texto:'', lineas:[
      {n:1, desc:'MERMELADA DE FRESAS', importe:null, importeFirmado:null, precioCorrecto:1.80, difUnitaria:null, y:0, pag:1, texto:''},
      {n:2, desc:'MERMELADA DE NARANJA', importe:null, importeFirmado:null, precioCorrecto:2.00, difUnitaria:null, y:0, pag:1, texto:''},
      {n:3, desc:'TISANA', importe:null, importeFirmado:null, precioCorrecto:1.30, difUnitaria:null, y:0, pag:1, texto:''}
    ]};
    document.querySelector('#fTotal').value = '44,00';
    document.querySelector('#fModo').value = 'precio_ud';
    // La gama y el % no dependen de la Marca del cargo: se detectan solo con
    // el texto de la factura, se haya marcado ya el cargo o no — a veces se
    // marca después de calcular, y perder el dato mientras tanto no ayuda.
    document.querySelector('#fMarcaCalc').value = '';           // primero, sin marca
    window.__emparejar();
    window.E.filas[0].precioSap = '2,00';
    window.E.filas[1].precioSap = '2,20';
    window.E.filas[2].precioSap = '1,50';
    window.__calcular();
    const filasSinMarca = window.E.ultimaSalida.salida.map(s => ({pos:s.fila.fac.pos, gama:s.gama, pct:s.pct}));
    const sinMarcaVisible = !document.querySelector('#resumenGamas').classList.contains('oculto');

    document.querySelector('#fMarcaCalc').value = 'MDF';
    window.__calcular();
    const filas = window.E.ultimaSalida.salida.map(s => ({pos:s.fila.fac.pos, gama:s.gama, pct:s.pct}));
    const resumenTexto = document.querySelector('#resumenGamas').textContent;
    const botonVisible = !document.querySelector('#btnCopiarGamas').classList.contains('oculto');

    document.querySelector('#fMarcaCalc').value = 'MDD';
    window.__calcular();
    const conMDDVisible = !document.querySelector('#resumenGamas').classList.contains('oculto');
    const conMDDPct = window.E.ultimaSalida.salida[0].pct;

    return {detectadas, filasSinMarca, sinMarcaVisible, filas, resumenTexto, botonVisible,
            conMDDVisible, conMDDPct};
  });
  for(const [desc, real, esperado] of gamas.detectadas)
    dice(real === esperado, `gama de «${desc}»`, `esperado ${esperado}, obtenido ${real}`);
  const [ls1, ls2] = gamas.filasSinMarca;
  dice(ls1.gama === 'LVF' && Math.abs(ls1.pct - 10) < 0.01,
       'sin marca puesta el % se calcula igual', JSON.stringify(ls1));
  dice(gamas.sinMarcaVisible, 'sin marca puesta el resumen se enseña igual (hay gama detectada)');
  dice(gamas.conMDDVisible && Math.abs(gamas.conMDDPct - 10) < 0.01,
       'con marca MDD también se enseña, con el mismo %', String(gamas.conMDDPct));
  const [l1, l2, l3] = gamas.filas;
  dice(l1.gama === 'LVF' && Math.abs(l1.pct - 10) < 0.01, 'línea LVF: 10 % no aplicado', JSON.stringify(l1));
  dice(l2.gama === 'LVZ' && Math.abs(l2.pct - 9.09) < 0.01, 'línea LVZ: 9,09 % no aplicado', JSON.stringify(l2));
  dice(l3.gama === null && !isFinite(l3.pct), 'la tisana no tiene gama ni %, aunque sí tiene diferencia');
  dice(/LVF \(Tradicional\): 10,00 %/.test(gamas.resumenTexto), 'el resumen agrupa por gama con su nombre');
  dice(/1 línea\(s\) sin gama/.test(gamas.resumenTexto), 'el resumen avisa de las líneas sin gama, sin tratarlo como error');
  dice(gamas.botonVisible, 'aparece el botón de copiar el resumen');

  // ------------------------------------------------------------------
  // Pablo encontró que copiando y pegando directamente desde SAP (en vez de
  // arrastrar el PDF de la factura) la gama sale como código suelto al
  // principio de la descripción («LVD MERM MELOC DIET»), sin adivinar nada.
  // Ese texto no trae precio por unidad, solo cantidad e importe neto de la
  // línea con la moneda detrás — hay que leerlo como importe, no como precio.
  console.log('\n=== 5j-bis · Pegar la factura tal cual sale de SAP ===');
  const pegadoSap = await pagina.evaluate(() => {
    const texto = '10\t2012880\tFRA MANZ REL ANCHO 18 12x350 G\t60\tUC\t122,59 \tEUR\n'+
                  '40\t2009398\tLVD MERM MELOC DIET 8x263ML\t56\tUC\t127,61 \tEUR';
    const lineas = window.leerLineasFacturaManual(texto);
    return lineas.map(l => ({pos:l.pos, material:l.material, desc:l.desc, cantidad:l.cantidad,
      um:l.um, precio:l.precio, importe:l.importe, gama:window.__gamaDe(l.desc)}));
  });
  const [p1, p2] = pegadoSap;
  dice(p1 && p1.desc === 'FRA MANZ REL ANCHO 18 12x350 G' && p1.cantidad === 60,
       'la descripción y la cantidad se leen bien de la línea pegada', JSON.stringify(p1));
  dice(p1 && p1.precio === null && p1.importe === 122.59,
       'con la moneda detrás, el número se entiende como importe, no como precio', JSON.stringify(p1));
  dice(p1 && p1.gama === 'FRAGATA', 'la gama «FRA» de esa línea se detecta como Fragata', JSON.stringify(p1));
  dice(p2 && p2.gama === 'LVD' && p2.importe === 127.61,
       'segunda línea: gama LVD e importe correctos', JSON.stringify(p2));

  // ------------------------------------------------------------------
  // Modo nuevo: cuando el cargo da el TOTAL de la línea (no un precio por
  // unidad), se restan dos totales — el de SAP y el del cargo — en vez de
  // multiplicar una diferencia unitaria por la cantidad.
  console.log('\n=== 5k · Modo «Totales de línea» (restar dos totales) ===');
  const totalLinea = await pagina.evaluate(() => {
    window.E.factura = {numero:'1', fecha:'', texto:'', lineas:[
      {pos:10, material:'1', udsCaja:null, desc:'MERMELADA DE NARANJA LVZ 800G', cantidad:10, um:'UC', precio:20, importe:200}
    ]};
    window.E.cargo = {numero:'X', cliente:'C', fecha:'', refFactura:'', totalSinIva:20, ivaPct:null,
      sinImportes:false, texto:'', lineas:[
      {n:1, desc:'MERMELADA DE NARANJA', importe:180, importeFirmado:180, precioCorrecto:null, difUnitaria:null, y:0, pag:1, texto:''}
    ]};
    document.querySelector('#fTotal').value = '20,00';
    document.querySelector('#fModo').value = 'total_linea';
    document.querySelector('#fMarcaCalc').value = 'MDF';
    window.__emparejar();
    window.E.filas[0].precioSap = '200';   // total facturado en SAP para la línea entera
    window.__calcular();
    const s = window.E.ultimaSalida.salida[0];
    return {objetivo:s.objetivo, gama:s.gama, pct:s.pct};
  });
  dice(Math.abs(totalLinea.objetivo - 20) < 0.01,
       'la diferencia sale de restar los dos totales (200 − 180)', JSON.stringify(totalLinea));
  dice(totalLinea.gama === 'LVZ' && Math.abs(totalLinea.pct - 10) < 0.01,
       'y el % de gama sale igual que en los demás modos (10 %)', JSON.stringify(totalLinea));

  // ------------------------------------------------------------------
  // La marca del cargo tiene que viajar con él: si se abre desde la cola, la
  // calculadora debe saber ya si es MDD o MDF sin que haya que volver a
  // decidirlo, y al registrar el cálculo, la marca elegida en la calculadora
  // se guarda en la ficha del cargo.
  console.log('\n=== 5l · La marca viaja entre la cola y la calculadora ===');
  const marcaViaja = await pagina.evaluate(() => {
    window.E.memoria.cargos = {mA: {
      cliente:'ALDI, S.L.', asignacion:'C/9001', importe:-20, fecha:'2026-08-01', ndoc:'',
      moneda:'EUR', clave:'I', abono:'', fechaAbono:'', conforme:null, marcadoEnSap:false,
      compensado:false, reclamado:false, fechaReclamacion:'', nota:'', clasificado:'',
      calculo:null, enListado:true, pdfGuardado:false, cerrado:false, marca:'MDF', fechaPedido:'',
      estado:'pendiente'
    }};
    window.__pintarCola();
    document.querySelector('tr[data-id="mA"] td').click();
    document.querySelector('#xIrCalc').click();
    const marcaEnCalculadora = document.querySelector('#fMarcaCalc').value;

    // se registra un cálculo y debe conservar la marca (y guardar el resumen)
    window.E.factura = {numero:'1', fecha:'', texto:'', lineas:[
      {pos:10, material:'1', udsCaja:null, desc:'MERMELADA DE FRESAS LVF 800G', cantidad:100, um:'UC', precio:2.2, importe:220}
    ]};
    window.E.cargo = {numero:'X', cliente:'ALDI, S.L.', fecha:'', refFactura:'', totalSinIva:20,
      ivaPct:null, sinImportes:false, texto:'', lineas:[
      {n:1, desc:'MERMELADA DE FRESAS', importe:null, importeFirmado:null, precioCorrecto:1.80, difUnitaria:null, y:0, pag:1, texto:''}
    ]};
    document.querySelector('#fCliente').value = 'ALDI, S.L.';
    document.querySelector('#fNumCargo').value = 'C/9001';
    document.querySelector('#fTotal').value = '20,00';
    document.querySelector('#fModo').value = 'precio_ud';
    window.__emparejar();
    window.E.filas[0].precioSap = '2,00';
    window.__calcular();
    const original = window.prompt; window.prompt = () => '';   // sin nº de abono
    window.__registrarCalculo();
    window.prompt = original;
    const c = window.E.memoria.cargos.mA;
    return {marcaEnCalculadora, marcaGuardada:c.marca, gamasGuardadas:c.calculo && c.calculo.gamas};
  });
  dice(marcaViaja.marcaEnCalculadora === 'MDF',
       'al abrir un cargo MDF desde la cola, la calculadora ya lo sabe', marcaViaja.marcaEnCalculadora);
  dice(marcaViaja.marcaGuardada === 'MDF', 'la marca se conserva al registrar el cálculo');
  dice(!!marcaViaja.gamasGuardadas && marcaViaja.gamasGuardadas[0].gama === 'LVF',
       'el resumen de gamas queda guardado en el cálculo, no solo en pantalla',
       JSON.stringify(marcaViaja.gamasGuardadas));

  // ------------------------------------------------------------------
  // La fecha del pedido se escribe siempre a mano (la fecha del cargo es
  // siempre posterior, así que no hay de dónde leerla sola con fiabilidad).
  console.log('\n=== 5m · Fecha del pedido, campo manual en la ficha ===');
  const fechaPedido = await pagina.evaluate(() => {
    window.E.memoria.cargos = {fp: {
      cliente:'COVIRAN, S.COOP.', asignacion:'C/8001', importe:-10, fecha:'2026-08-05', ndoc:'',
      moneda:'EUR', clave:'I', abono:'', fechaAbono:'', conforme:null, marcadoEnSap:false,
      compensado:false, reclamado:false, fechaReclamacion:'', nota:'', clasificado:'',
      calculo:null, enListado:true, pdfGuardado:false, cerrado:false, marca:'', fechaPedido:'',
      estado:'pendiente'
    }};
    window.__pintarCola();
    document.querySelector('tr[data-id="fp"] td').click();
    document.querySelector('#xFechaPedido').value = '29/05/2026';
    document.querySelector('#xGuardarFicha').click();
    return window.E.memoria.cargos.fp.fechaPedido;
  });
  dice(fechaPedido === '29/05/2026', 'la fecha del pedido se guarda desde la ficha', fechaPedido);

  const enLibroConGama = await pagina.evaluate(() => {
    const fila = window.__hojasDelLibro()[0].filas[0];
    return fila.map(c => (c && c.v) || c);
  });
  dice(enLibroConGama.includes('Fecha pedido'), 'la fecha del pedido sale en el Excel',
       enLibroConGama.join(' · ').slice(0,100));

  // El nº de pedido del cliente, igual que la fecha del pedido: campo manual
  // en la ficha, sin ninguna regla que lo deduzca de otro documento.
  console.log('\n=== 5n · Nº de pedido de cliente, campo manual en la ficha ===');
  const pedidoCliente = await pagina.evaluate(() => {
    window.E.memoria.cargos = {pc: {
      cliente:'COVIRAN, S.COOP.', asignacion:'C/8002', importe:-10, fecha:'2026-08-05', ndoc:'',
      moneda:'EUR', clave:'I', abono:'', fechaAbono:'', conforme:null, marcadoEnSap:false,
      compensado:false, reclamado:false, fechaReclamacion:'', nota:'', clasificado:'',
      calculo:null, enListado:true, pdfGuardado:false, cerrado:false, marca:'', fechaPedido:'',
      pedidoCliente:'', estado:'pendiente'
    }};
    window.__pintarCola();
    document.querySelector('tr[data-id="pc"] td').click();
    document.querySelector('#xPedidoCliente').value = 'PC-2026-4471';
    document.querySelector('#xGuardarFicha').click();
    return window.E.memoria.cargos.pc.pedidoCliente;
  });
  dice(pedidoCliente === 'PC-2026-4471', 'el nº de pedido de cliente se guarda desde la ficha',
       pedidoCliente);

  const enLibroConPedidoCliente = await pagina.evaluate(() => {
    const fila = window.__hojasDelLibro()[0].filas[0];
    return fila.map(c => (c && c.v) || c);
  });
  dice(enLibroConPedidoCliente.includes('Nº pedido de cliente'),
       'el nº de pedido de cliente sale en el Excel',
       enLibroConPedidoCliente.join(' · ').slice(0,100));

  // Orden de columnas pedido por Pablo para que el comercial vea antes lo
  // que le hace falta: lo demás (Días, Estado, Fecha abono...) va detrás,
  // en cualquier orden — solo se fija el orden de las doce primeras.
  console.log('\n=== 5n-bis · Orden de columnas del Excel, pensado para el comercial ===');
  const cabecerasCargos = await pagina.evaluate(() =>
    window.__hojasDelLibro()[0].filas[0].map(c => (c && c.v) || c));
  const primerasDoce = [
    'Fecha','Cliente','Asignación','Importe','Fecha pedido','Nº pedido de cliente',
    'Nº abono','Marca','Clasificación','Conforme','Gamas','Nota'
  ];
  dice(JSON.stringify(cabecerasCargos.slice(0,12)) === JSON.stringify(primerasDoce),
       'las doce primeras columnas van en el orden pedido', cabecerasCargos.slice(0,12).join(' · '));

  // ------------------------------------------------------------------
  // Las tres pestañas comparten el scroll de la ventana (solo una está
  // visible a la vez): subir o bajar en una se notaba también al volver a
  // otra. Cada pestaña debe recordar su propio punto de scroll.
  console.log('\n=== 5o · Cada pestaña con su propio scroll ===');
  const scrolls = await pagina.evaluate(() => {
    window.cambiarVista('cargos');
    window.scrollTo(0, 300);
    const cola300 = window.scrollY;
    window.cambiarVista('calc');
    const calcAlEntrar = window.scrollY;
    window.cambiarVista('cargos');
    const colaAlVolver = window.scrollY;
    return {cola300, calcAlEntrar, colaAlVolver};
  });
  dice(scrolls.calcAlEntrar === 0, 'al cambiar de pestaña no arrastra el scroll de la anterior',
       JSON.stringify(scrolls));
  dice(scrolls.colaAlVolver === scrolls.cola300, 'al volver a una pestaña recupera su propio scroll',
       JSON.stringify(scrolls));

  // ------------------------------------------------------------------
  // «Marcar todas» debía marcar solo las líneas ya emparejadas con una línea
  // del cargo, así que en cuanto el emparejado automático fallaba (o el
  // cargo aún no estaba cargado) el botón no marcaba nada, aunque las líneas
  // tuvieran un valor tecleado a mano con el que sí se puede calcular.
  console.log('\n=== 5p · «Marcar todas» marca también las líneas sin emparejar ===');
  const marcadas = await pagina.evaluate(() => {
    window.cambiarVista('calc');
    window.E.filas = [
      {fac:{pos:10, material:'1', desc:'SIN EMPAREJAR 1', cantidad:10, um:'UC', udsCaja:null, precio:1},
       cargoIdx:-1, afectada:false, modo:'importe', manual:'5', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:null},
      {fac:{pos:20, material:'2', desc:'SIN EMPAREJAR 2', cantidad:20, um:'UC', udsCaja:null, precio:1},
       cargoIdx:-1, afectada:false, modo:'importe', manual:'7', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:null}
    ];
    window.pintarLineas();
    document.querySelector('#btnTodas').click();
    return window.E.filas.map(f => f.afectada);
  });
  dice(marcadas.every(Boolean), '«Marcar todas» marca hasta las líneas sin línea del cargo asignada',
       JSON.stringify(marcadas));

  // ------------------------------------------------------------------
  // «Aplicar el modo a todas» borraba «Dato del cargo» en TODAS las líneas,
  // aunque fuera al mismo modo que ya tenían — un cargo con muchas líneas
  // escritas a mano (sin línea del cargo asignada) se quedaba en blanco de
  // golpe. El cambio de modo por línea, con su propio desplegable, sigue
  // limpiando lo escrito a mano (ahí sí tiene sentido: se repiensa esa
  // línea en concreto); el botón de aplicar a todas ya no lo toca.
  console.log('\n=== 5p-bis · «Aplicar el modo a todas» no borra lo escrito a mano ===');
  const trasAplicarModo = await pagina.evaluate(() => {
    window.E.filas = [
      {fac:{pos:10, material:'1', desc:'CON DATO A MANO 1', cantidad:10, um:'UC', udsCaja:null, precio:1},
       cargoIdx:-1, afectada:true, modo:'precio_ud', manual:'1.74', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:'2.04'},
      {fac:{pos:20, material:'2', desc:'CON DATO A MANO 2', cantidad:20, um:'UC', udsCaja:null, precio:1},
       cargoIdx:-1, afectada:true, modo:'precio_ud', manual:'2.16', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:'2.27'}
    ];
    window.pintarLineas();
    document.querySelector('#fModo').value = 'precio_ud';
    document.querySelector('#btnAplicarModo').click();
    return window.E.filas.map(f => f.manual);
  });
  dice(trasAplicarModo.every(m => m != null), '«Aplicar el modo a todas» conserva el dato del cargo',
       JSON.stringify(trasAplicarModo));

  // ------------------------------------------------------------------
  // Cuando una línea viene en cajas y la factura no trae las unidades por
  // caja (columna «Ud/cj» con un guion), no hay forma de pasar la cantidad
  // a unidades para el ZNET, y la línea se quedaba fuera de la suma sin que
  // Pablo pudiera arreglarlo desde la herramienta: esa celda no tenía ningún
  // campo para escribir. Ahora se escribe ahí mismo. Se usa el modo «precio
  // por unidad», que sí necesita la cantidad para la propia diferencia (a
  // diferencia de «importe», ver 5p-quater más abajo).
  console.log('\n=== 5p-ter · Unidades por caja, editable cuando la factura no las trae ===');
  const udsCaja = await pagina.evaluate(async () => {
    document.querySelector('#fTotal').value = '69,12';
    window.E.filas = [
      {fac:{pos:20, material:'2012464', desc:'WES INF COLA CABALLERO', cantidad:144, um:'CJ',
            udsCaja:null, precio:881.28},
       cargoIdx:-1, afectada:true, modo:'precio_ud', manual:'1.10', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:'1.32'}
    ];
    window.pintarLineas();
    const antes = window.__calcular ? (window.__calcular(), window.E.ultimaSalida.suma) : null;
    const input = document.querySelector('.udsCajaManual[data-i="0"]');
    input.value = '12';
    input.dispatchEvent(new Event('change'));
    return {antes, udsCaja: window.E.filas[0].fac.udsCaja, suma: window.E.ultimaSalida.suma};
  });
  dice(udsCaja.antes === 0, 'sin unidades por caja, esta línea no cuenta en la suma (sí la necesita)',
       JSON.stringify(udsCaja));
  dice(udsCaja.udsCaja === 12 && udsCaja.suma > 0,
       'escribir las unidades por caja a mano arregla la suma de la línea', JSON.stringify(udsCaja));

  // ------------------------------------------------------------------
  // Pablo probó a escribir cualquier número al azar en «unidades por caja»
  // y comprobó que cuadraba igual: en el modo «Diferencia de línea» el
  // cargo ya da el importe entero, así que la cantidad no hace falta para
  // saber cuánto es la diferencia — solo hace falta para expresar el ZNET
  // «por cada 100 unidades». Antes, sin esa cantidad, la línea entera se
  // quedaba fuera de la suma aunque el importe ya se supiera con certeza.
  console.log('\n=== 5p-quater · «Diferencia de línea» cuenta en la suma sin cantidad, sin ZNET todavía ===');
  const sinCantidadImporte = await pagina.evaluate(() => {
    document.querySelector('#fTotal').value = '69,12';
    window.E.filas = [
      {fac:{pos:20, material:'2012464', desc:'WES INF COLA CABALLERO', cantidad:144, um:'CJ',
            udsCaja:null, precio:881.28},
       cargoIdx:-1, afectada:true, modo:'importe', manual:'69.12', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:null}
    ];
    window.__calcular();
    const s = window.E.ultimaSalida;
    return {suma:s.suma, importe:s.salida[0].importe, znet:s.salida[0].znet,
            avisoAmbar: document.querySelector('#avisosZnet').textContent};
  });
  dice(Math.abs(sinCantidadImporte.suma - 69.12) < 0.01, 'cuenta en la suma aunque falte la cantidad',
       JSON.stringify(sinCantidadImporte));
  dice(!isFinite(sinCantidadImporte.znet), 'pero el ZNET se deja en blanco, no se inventa una tarifa',
       String(sinCantidadImporte.znet));
  dice(/contadas en la suma.*sin ZNET/.test(sinCantidadImporte.avisoAmbar),
       'avisa de que falta el ZNET aunque ya cuente en el cuadre');

  // Y el caso contrario: un modo que SÍ necesita la cantidad para la propia
  // diferencia (no solo para el ZNET) sigue sin contar si falta.
  const conCantidadPrecioUd = await pagina.evaluate(() => {
    window.E.filas = [
      {fac:{pos:20, material:'2012464', desc:'WES INF COLA CABALLERO', cantidad:144, um:'CJ',
            udsCaja:null, precio:881.28},
       cargoIdx:-1, afectada:true, modo:'precio_ud', manual:'1.10', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:'1.32'}
    ];
    window.__calcular();
    return {suma: window.E.ultimaSalida.suma};
  });
  dice(conCantidadPrecioUd.suma === 0,
       'un modo que sí necesita la cantidad para la diferencia sigue sin contar si falta',
       JSON.stringify(conCantidadPrecioUd));

  // ------------------------------------------------------------------
  // La tabla de líneas tenía doce columnas sin acotar (dos desplegables con
  // texto largo, entre ellas) y se salía de una pantalla normal: había que
  // deslizar de lado para ver la diferencia calculada.
  console.log('\n=== 5q · La tabla de líneas cabe sin deslizar de lado ===');
  const anchoTabla = await pagina.evaluate(() => {
    window.cambiarVista('calc');
    window.E.filas = [
      {fac:{pos:10, material:'2007482', desc:'MERMELADA DE FRESAS LVF TRADICIONAL 800G',
            cantidad:100, um:'UC', udsCaja:12, precio:2.5},
       cargoIdx:-1, afectada:true, modo:'precio_ud', manual:null, objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:'2.2'}
    ];
    window.pintarLineas();
    const env = document.querySelector('#tablaLineas').closest('.tablaenv');
    return {cliente: env.clientWidth, scroll: env.scrollWidth};
  });
  dice(anchoTabla.scroll <= anchoTabla.cliente, 'la tabla de líneas no necesita scroll horizontal',
       JSON.stringify(anchoTabla));

  // ------------------------------------------------------------------
  // Lo que se pega en la hoja «Asistente SAP» del Excel: Pos. · ZNET ·
  // Descripción. Solo lleva ZNET la línea medida contra SAP: la estimación
  // por cantidad no se le pasa al asistente para que la teclee.
  console.log('\n=== 5q-bis · «Copiar para el asistente SAP» ===');
  const asistente = await pagina.evaluate(() => {
    window.E.filas = [
      {fac:{pos:10, material:'1', desc:'LVF MERM FRESA 8x263ML', cantidad:24, um:'UC', udsCaja:null, precio:1},
       cargoIdx:-1, afectada:true, modo:'importe', manual:'5,00', objetivoForzado:null, base:null,
       netoPrueba:'2,00', precioSap:null},
      {fac:{pos:20, material:'2', desc:'LVC MERM ARAND\t8x263ML', cantidad:16, um:'UC', udsCaja:null, precio:1},
       cargoIdx:-1, afectada:true, modo:'importe', manual:'3,00', objetivoForzado:null, base:null,
       netoPrueba:null, precioSap:null}
    ];
    document.querySelector('#fZnetPrueba').value = '10';
    window.__calcular();
    return window.__textoAsistente(window.E.ultimaSalida.salida);
  });
  const lineasAsis = asistente.texto.split('\r\n').map(l => l.split('\t'));
  dice(lineasAsis[0][0] === '10' && lineasAsis[0][1] === '25,00',
       'la línea medida va con su ZNET, en formato SAP', JSON.stringify(lineasAsis[0]));
  dice(lineasAsis[1][1] === '' && asistente.sinMedir === 1,
       'la línea sin medir va sin ZNET, para que no se teclee una estimación', JSON.stringify(lineasAsis[1]));
  dice(lineasAsis.every(l => l.length === 3), 'cada línea son tres columnas (un tabulador en la descripción no las descuadra)');

  // ------------------------------------------------------------------
  // Un no conforme reclamado al comercial queda en «Reclamado» hasta que el
  // comercial da el visto bueno y se cierra a mano; al reabrirlo vuelve ahí.
  console.log('\n=== 5r · Estado «Reclamado» para los no conformes reclamados ===');
  const reclamado = await pagina.evaluate(() => {
    window.cambiarVista('cargos');
    window.E.memoria.cargos = {rc: {
      cliente:'PENINSULACO, S.L.', asignacion:'CP-0000001', importe:-10, fecha:'2026-08-05', ndoc:'',
      moneda:'EUR', clave:'I', abono:'1519000001', fechaAbono:'2026-08-06', conforme:false,
      marcadoEnSap:false, compensado:false, reclamado:false, fechaReclamacion:'', nota:'',
      clasificado:'precio', calculo:null, enListado:true, pdfGuardado:false, cerrado:false,
      marca:'MDF', fechaPedido:'', pedidoCliente:'', estado:'pendiente'
    }};
    const c = window.E.memoria.cargos.rc, pasos = {};
    window.__pintarCola();
    pasos.antes = window.recalcularEstado(c);
    window.__alternarCasilla('rc', 'reclamado');
    pasos.trasReclamar = c.estado;
    pasos.filtro = (document.querySelector('#fEstado').value = 'reclamado',
                    window.cargosFiltrados().map(x => x.id));
    document.querySelector('#fEstado').value = '';
    window.__alternarCasilla('rc', 'cerrado');
    pasos.trasCerrar = c.estado;
    window.__alternarCasilla('rc', 'cerrado');
    pasos.trasReabrir = c.estado;
    pasos.contador = [...document.querySelectorAll('#contadores .dato')]
      .find(d => /Reclamados/.test(d.textContent))?.querySelector('.vl').textContent;
    return pasos;
  });
  dice(reclamado.antes === 'abonado' && reclamado.trasReclamar === 'reclamado',
       'al marcarlo como reclamado al comercial pasa solo a «Reclamado»', JSON.stringify(reclamado));
  dice(reclamado.filtro.includes('rc'), 'el filtro de estado encuentra los reclamados');
  dice(reclamado.trasCerrar === 'cerrado' && reclamado.trasReabrir === 'reclamado',
       'se cierra a mano, y al reabrirlo vuelve a «Reclamado»', JSON.stringify(reclamado));
  dice(reclamado.contador === '1', 'el contador de reclamados lo cuenta', reclamado.contador);

  // ------------------------------------------------------------------
  console.log('\n=== 6 · Texto del cliente con caracteres especiales ===');
  const escapado = await pagina.evaluate(() => {
    window.E.memoria.cargos = {'x': {
      cliente:'GARC<IA & "HIJOS", S.L.', asignacion:'C/1', importe:10, fecha:'2026-01-01',
      ndoc:'', abono:'', conforme:null, marcadoEnSap:false, compensado:false, reclamado:false,
      nota:'', clasificado:'', calculo:null, enListado:true, estado:'pendiente', moneda:'EUR'}};
    window.__pintarCola();
    const td = document.querySelectorAll('#tablaCola tbody tr td');
    return td.length ? td[2].textContent : '(sin filas)';
  });
  dice(escapado.startsWith('GARC<IA & "HIJOS"'), 'el nombre del cliente se pinta tal cual', escapado);

  // ------------------------------------------------------------------
  // Hay exportaciones de SAP que dejan delante una hoja de portada. Leyendo
  // solo la primera, el listado entero parecía ilegible.
  console.log('\n=== 8 · Listado con los cargos en la segunda hoja del libro ===');
  const segundaHoja = await pagina.evaluate(async () => {
    const cod = new TextEncoder();
    const T = new Uint32Array(256);
    for(let i=0;i<256;i++){ let c=i; for(let k=0;k<8;k++) c = c&1 ? 0xEDB88320^(c>>>1) : c>>>1; T[i]=c>>>0; }
    const crc32 = d => { let c=0xFFFFFFFF; for(let i=0;i<d.length;i++) c = T[(c^d[i])&0xFF]^(c>>>8); return (c^0xFFFFFFFF)>>>0; };
    const zip = archivos => {
      const partes=[], central=[]; let desp=0;
      for(const a of archivos){
        const n=cod.encode(a.nombre), d=cod.encode(a.datos), crc=crc32(d);
        const loc=new Uint8Array(30+n.length), dv=new DataView(loc.buffer);
        dv.setUint32(0,0x04034b50,true); dv.setUint16(4,20,true); dv.setUint32(14,crc,true);
        dv.setUint32(18,d.length,true); dv.setUint32(22,d.length,true); dv.setUint16(26,n.length,true);
        loc.set(n,30); partes.push(loc,d);
        const cen=new Uint8Array(46+n.length), dc=new DataView(cen.buffer);
        dc.setUint32(0,0x02014b50,true); dc.setUint16(4,20,true); dc.setUint16(6,20,true);
        dc.setUint32(16,crc,true); dc.setUint32(20,d.length,true); dc.setUint32(24,d.length,true);
        dc.setUint16(28,n.length,true); dc.setUint32(42,desp,true); cen.set(n,46); central.push(cen);
        desp += loc.length + d.length;
      }
      const fc=central.reduce((a,c)=>a+c.length,0), fin=new Uint8Array(22), df=new DataView(fin.buffer);
      df.setUint32(0,0x06054b50,true); df.setUint16(8,archivos.length,true);
      df.setUint16(10,archivos.length,true); df.setUint32(12,fc,true); df.setUint32(16,desp,true);
      const todo=[...partes,...central,fin], tot=todo.reduce((a,x)=>a+x.length,0), out=new Uint8Array(tot);
      let i=0; for(const x of todo){ out.set(x,i); i+=x.length; } return out;
    };
    const cel = (r,v) => typeof v === 'number'
      ? `<c r="${r}"><v>${v}</v></c>`
      : `<c r="${r}" t="inlineStr"><is><t>${v}</t></is></c>`;
    const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
    const portada = `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData>`+
      `<row r="1">${cel('A1','Parámetros de selección')}</row></sheetData></worksheet>`;
    const datos = `<?xml version="1.0"?><worksheet xmlns="${NS}"><sheetData>`+
      `<row r="1">${cel('A1','Nombre 1')}${cel('B1','Asignación')}`+
      `${cel('C1','Importe en moneda local')}${cel('D1','Nº documento')}</row>`+
      `<row r="2">${cel('A2','ALCAMPO, S.A.')}${cel('B2','098017625')}`+
      `${cel('C2',-308.59)}${cel('D2','1800001')}</row></sheetData></worksheet>`;
    const bin = zip([
      {nombre:'[Content_Types].xml', datos:'<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="xml" ContentType="application/xml"/></Types>'},
      {nombre:'xl/worksheets/sheet1.xml', datos:portada},
      {nombre:'xl/worksheets/sheet2.xml', datos:datos}
    ]);
    try{
      window.E.memoria.cargos = {};
      const filas = await window.__leerXlsx(new File([bin], 'listado.xlsx'),
        fs => fs.some(f => f.some(c => c && /asignaci[oó]n/i.test(String(c)))));
      const r = window.__importarListado(filas);
      return {leidos:r.leidos, cliente:Object.values(window.E.memoria.cargos)[0]?.cliente};
    }catch(e){ return {error:e.message}; }
  });
  dice(segundaHoja.leidos === 1, 'encuentra el listado aunque no esté en la primera hoja',
       segundaHoja.error || `${segundaHoja.leidos} cargo(s), ${segundaHoja.cliente}`);

  // ------------------------------------------------------------------
  // Antes había un solo botón «Pegar texto a mano…» y había que elegir en un
  // desplegable si era el cargo o la factura; ahora hay un botón junto a
  // cada zona de arrastre que abre directamente en el modo que toca, sin esa
  // pregunta de más.
  console.log('\n=== 8b · Un botón de pegar por cada zona, sin tener que elegir ===');
  const botonesPegar = await pagina.evaluate(() => {
    document.querySelector('#btnPegarCargo').click();
    const trasCargo = {modo: document.querySelector('#mQue').value,
                        titulo: document.querySelector('#tituloManual').textContent};
    document.querySelector('#btnCerrarManual').click();
    document.querySelector('#btnPegarFactura').click();
    const trasFactura = {modo: document.querySelector('#mQue').value,
                          titulo: document.querySelector('#tituloManual').textContent};
    document.querySelector('#btnCerrarManual').click();
    return {trasCargo, trasFactura};
  });
  dice(botonesPegar.trasCargo.modo === 'cargo' && /cargo a mano/i.test(botonesPegar.trasCargo.titulo),
       'el botón de la zona del cargo abre directamente en modo cargo', JSON.stringify(botonesPegar.trasCargo));
  dice(botonesPegar.trasFactura.modo === 'factura' && /factura a mano/i.test(botonesPegar.trasFactura.titulo),
       'el botón de la zona de la factura abre directamente en modo factura', JSON.stringify(botonesPegar.trasFactura));

  // ------------------------------------------------------------------
  console.log('\n=== 9 · Lo que queda tras «Vaciar y empezar otro cargo» ===');
  const restos = await pagina.evaluate(() => {
    document.querySelector('#mNumFactura').value = '90224478';
    document.querySelector('#fNumFactura').value = '90224478';
    window.E.ultimaSalida = null;
    window.__limpiarCalculadora();
    return ['fCliente','fNumCargo','fNumFactura','fFecha','fTotal',
            'mTexto','mTotal','mCliente','mNumCargo','mNumFactura']
      .filter(id => document.querySelector('#'+id).value !== '');
  });
  dice(restos.length === 0, 'no queda ningún dato del cargo anterior',
       restos.length ? 'con datos: '+restos.join(', ') : '');

  await pagina.close();
  await navegador.close();

  // ------------------------------------------------------------------
  console.log('\n=== 7 · El libro se abre y sus fórmulas son las que Excel entiende ===');
  const { execFileSync } = require('child_process');
  try{
    const r = JSON.parse(execFileSync('python3', ['-c', `
import json, zipfile, re, openpyxl
libro = ${JSON.stringify(xlsx)}
wb = openpyxl.load_workbook(libro)
z = zipfile.ZipFile(libro)
formulas = []
for n in z.namelist():
    if 'worksheets/' in n:
        formulas += re.findall(r'<f>(.*?)</f>', z.read(n).decode())
print(json.dumps({'hojas': wb.sheetnames, 'formulas': formulas,
                  'cliente': wb['Cargos'].cell(row=2, column=2).value}))
`], {encoding:'utf8'}));
    dice(r.hojas.length === 4, 'el libro se abre y tiene las cuatro hojas', r.hojas.join(', '));
    dice(r.formulas.length > 0, 'lleva los botones de abrir el PDF y escribir al comercial');
    dice(r.formulas.every(f => /^HYPERLINK\(/.test(f)),
         'las fórmulas usan el nombre que guarda el formato .xlsx (inglés)', r.formulas[0]||'');
    dice(r.formulas.every(f => !/&quot;;&quot;|",\s*"/.test(f) || /&quot;,&quot;/.test(f)),
         'los argumentos van separados por coma, como exige el formato');
    dice(r.cliente === 'HIPER USERA, S.L.', 'los cargos están en la hoja', String(r.cliente));
  }catch(e){
    console.log('  no he podido revisar el libro:', String(e.message).slice(0,300));
    fallos++;
  }

  console.log(fallos === 0 ? '\nAuditoría sin hallazgos.' : `\n${fallos} hallazgo(s).`);
  process.exit(0);
})();
