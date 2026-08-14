/*
 * Casos de emparejado entre un cargo del listado y su archivo en la carpeta.
 *
 * No hacen falta PDF reales: se inyecta un índice de nombres y se comprueba a
 * qué archivo llega cada cargo. Aquí han aparecido ya dos fallos en producción
 * (la barra de "C/5300011522" y un archivo indexado dos veces), así que conviene
 * que queden clavados.
 */
module.exports = [
  {
    nombre: 'asignación con «C/» y el archivo nombrado solo con el número',
    cargo: { cliente: 'HIPER USERA, S.L.', asignacion: 'C/5300011522' },
    archivos: [
      'HIPER USERA/HIPER_USERA_5300011522.pdf',
      'ruido/FACTURA_5300011522_OTRA_COSA.pdf'
    ],
    espera: 'HIPER USERA/HIPER_USERA_5300011522.pdf',
    porque: 'el número casa en los dos, pero solo uno lleva el cliente'
  },
  {
    nombre: 'archivo llamado solo con el número, sin cliente',
    cargo: { cliente: 'HIPER USERA, S.L.', asignacion: 'C/5300011861' },
    archivos: ['5300011861.pdf'],
    espera: '5300011861.pdf',
    porque: 'número largo y candidato único: vale aunque no lleve el cliente'
  },
  {
    nombre: 'el número dentro de un nombre más largo',
    cargo: { cliente: 'HIPER USERA, S.L.', asignacion: 'C/5300012232' },
    archivos: ['otros/5300012232_y_5300012231.pdf'],
    espera: 'otros/5300012232_y_5300012231.pdf'
  },
  {
    nombre: 'el cliente está en la carpeta, no en el nombre',
    cargo: { cliente: 'COVIRAN S.COOP.ANDALUZA', asignacion: 'NC000051086' },
    archivos: ['COVIRAN/NC000051086.pdf', 'ruido/NC000051086_borrador.pdf'],
    espera: 'COVIRAN/NC000051086.pdf',
    porque: 'se mira el cliente también en la ruta'
  },
  {
    nombre: 'asignación corta: sin el cliente no se acepta',
    cargo: { cliente: 'MUSGRAVE ESPAÑA, S.A.', asignacion: '4188' },
    archivos: ['MUSGRAVE_ESPANA_4188.pdf', 'ruido/ALBARAN_4188_DE_OTRO.pdf'],
    espera: 'MUSGRAVE_ESPANA_4188.pdf',
    porque: 'cuatro cifras podrían ser cualquier cosa: manda el cliente'
  },
  {
    nombre: 'asignación corta y ningún archivo con el cliente',
    cargo: { cliente: 'MUSGRAVE ESPAÑA, S.A.', asignacion: '4188' },
    archivos: ['ruido/ALBARAN_4188_DE_OTRO.pdf'],
    espera: null,
    porque: 'mejor no enlazar que enlazar el documento de otro'
  },
  {
    nombre: 'el nombre que propone la propia herramienta',
    cargo: { cliente: 'SORIADIS, S.L.', asignacion: 'C/2405NC0147' },
    archivos: ['SORIADIS_SL_C2405NC0147.pdf'],
    espera: 'SORIADIS_SL_C2405NC0147.pdf'
  },
  {
    nombre: 'cargo sin ningún archivo en la carpeta',
    cargo: { cliente: 'CLIENTE SIN PDF, S.A.', asignacion: 'C/9999999999' },
    archivos: ['otro/ALCAMPO_098017625.pdf'],
    espera: null
  },
  {
    nombre: 'dos cargos del mismo cliente no se pisan',
    cargo: { cliente: 'ALCAMPO, S.A.', asignacion: '098045065' },
    archivos: ['ALCAMPO_098017625.pdf', 'ALCAMPO_098045065.pdf'],
    espera: 'ALCAMPO_098045065.pdf'
  }
];
