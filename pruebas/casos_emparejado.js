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
  /* Grupo Hermanos Martín: en SAP la asignación lleva delante el tipo de
     documento y una barra («C/ 0D/4102»), y en la carpeta el archivo se llama
     con ese mismo código pero con guion y sin la C («GRUPO HNOS MARTÍN
     0D-4102.pdf»). Además el cliente se abrevia distinto: HERMANOS / HNOS. */
  {
    nombre: 'Martín · «C/ 0D/4102» contra «0D-4102» en el archivo',
    cargo: { cliente: 'GRUPO HERMANOS MARTIN, S.L.', asignacion: 'C/ 0D/4102' },
    archivos: ['GRUPO HNOS MARTÍN 0D-4102.pdf', 'ruido/OTRA COSA 4102.pdf'],
    espera: 'GRUPO HNOS MARTÍN 0D-4102.pdf',
    porque: 'el código entero es 0D-4102, no solo el 4102'
  },
  {
    nombre: 'Martín · número corto detrás del tipo de documento',
    cargo: { cliente: 'GRUPO HERMANOS MARTIN, S.L.', asignacion: 'C/ 0D/237' },
    archivos: ['GRUPO HNOS MARTIN 0D-237.pdf'],
    espera: 'GRUPO HNOS MARTIN 0D-237.pdf',
    porque: 'tres cifras: sin el 0D delante no habría por dónde buscarlo'
  },
  {
    nombre: 'Martín · sin espacio tras la barra',
    cargo: { cliente: 'GRUPO HERMANOS MARTIN, S.L.', asignacion: 'C/0D/7635' },
    archivos: ['GRUPO HNOS MARTÍN 0D-7635.pdf'],
    espera: 'GRUPO HNOS MARTÍN 0D-7635.pdf'
  },
  {
    nombre: 'Martín · asignación sin el 0A y archivo con él',
    cargo: { cliente: 'GRUPO HERMANOS MARTIN, S.L.', asignacion: 'C/22088' },
    archivos: ['GRUPO HNOS MARTÍN 0A-22088.pdf'],
    espera: 'GRUPO HNOS MARTÍN 0A-22088.pdf'
  },
  {
    nombre: 'Martín · el archivo no lleva «GRUPO» delante',
    cargo: { cliente: 'GRUPO HERMANOS MARTIN, S.L.', asignacion: 'C/ 0A/5605' },
    archivos: ['HNOS MARTIN 0A-5605.pdf'],
    espera: 'HNOS MARTIN 0A-5605.pdf'
  },
  {
    nombre: 'Martín · dos cargos con el mismo número y distinta serie',
    cargo: { cliente: 'GRUPO HERMANOS MARTIN, S.L.', asignacion: 'C/ 0D/9341' },
    archivos: ['GRUPO HNOS MARTÍN 0A-9341.pdf', 'GRUPO HNOS MARTÍN 0D-9341.pdf'],
    espera: 'GRUPO HNOS MARTÍN 0D-9341.pdf',
    porque: 'la serie (0A / 0D) es parte del código: no vale coger el otro'
  },
  /* Carrefour numera 20241044S115781, 20241044S71824…: el tramo de delante es
     el pedido y lo comparten varios cargos. Buscar por ese número enlazaba el
     PDF de otro cargo del mismo pedido, y como el cliente casaba se daba por
     bueno. Enlazar el documento de otro cargo es peor que no enlazar ninguno. */
  {
    nombre: 'Carrefour · el número del pedido no basta para enlazar',
    cargo: { cliente: 'CENTROS COMERCIALES CARREFOUR S A', asignacion: '20241044S115781' },
    archivos: ['CARREFOUR/20241044S71824.pdf', 'CARREFOUR/20241044S83646.pdf'],
    espera: null,
    porque: 'esos dos PDF son de otros cargos del mismo pedido'
  },
  {
    nombre: 'Carrefour · con el código entero, sí',
    cargo: { cliente: 'CENTROS COMERCIALES CARREFOUR S A', asignacion: '20241044S115781' },
    archivos: ['CARREFOUR/20241044S115781.pdf', 'CARREFOUR/20241044S71824.pdf'],
    espera: 'CARREFOUR/20241044S115781.pdf'
  },
  {
    nombre: 'mismo número, distinto tipo de documento',
    cargo: { cliente: 'CSF SAS', asignacion: 'DOI25028401' },
    archivos: ['CSF/ADI25028401.pdf'],
    espera: null,
    porque: 'ADI y DOI son dos documentos distintos del mismo cliente'
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
