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
                  'cliente': wb['Cargos'].cell(row=2, column=3).value}))
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
