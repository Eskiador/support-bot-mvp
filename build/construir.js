#!/usr/bin/env node
/*
 * Construye el HTML autocontenido a partir de src/calculadora.html.
 * Incrusta pdf.js (biblioteca + worker) para que el archivo funcione
 * abierto directamente desde el disco, sin internet y sin instalar nada.
 *
 *   node build/construir.js
 */
const fs = require('fs');
const path = require('path');

const raiz = path.join(__dirname, '..');
const src = path.join(raiz, 'src', 'calculadora.html');
const vendor = path.join(raiz, 'vendor');
const destino = path.join(raiz, 'dist', 'Contabilizador_Cargos_I.html');

const principal = fs.readFileSync(path.join(vendor, 'pdf.mjs'), 'utf8');
const worker = fs.readFileSync(path.join(vendor, 'pdf.worker.mjs'), 'utf8');

// El HTML se rompería si el código incrustado contuviera un cierre de <script>.
for (const [nombre, codigo] of [['pdf.mjs', principal], ['pdf.worker.mjs', worker]]) {
  if (/<\/script/i.test(codigo)) {
    throw new Error(`${nombre} contiene "</script": no se puede incrustar tal cual.`);
  }
}

let html = fs.readFileSync(src, 'utf8');
if (!html.includes('/*__PDFJS_MAIN__*/') || !html.includes('/*__PDFJS_WORKER__*/')) {
  throw new Error('Faltan las marcas __PDFJS_MAIN__ / __PDFJS_WORKER__ en el HTML fuente.');
}
html = html.replace('/*__PDFJS_WORKER__*/', () => worker);
html = html.replace('/*__PDFJS_MAIN__*/', () => principal);

fs.mkdirSync(path.dirname(destino), { recursive: true });
fs.writeFileSync(destino, html);

const mb = (Buffer.byteLength(html) / 1048576).toFixed(2);
console.log(`Construido: ${path.relative(raiz, destino)} (${mb} MB)`);
