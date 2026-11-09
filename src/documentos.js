'use strict';
/**
 * Documentos que el bot puede mandar. En Piedra, el catálogo en PDF (09/11/2026; `mandar_catalogo`,
 * src/herramientas-erasmo.js). La carpeta es el candado de evolution.js: nunca se manda un documento de
 * afuera de `DOCS_DIR`. `documentos/` no se versiona (.gitignore): el PDF se copia a mano desde la raíz.
 */
const fs = require('fs');
const path = require('path');

const CARPETA = process.env.DOCS_DIR || path.join(__dirname, '..', 'documentos');

/**
 * El catálogo: un documento se pide por id, nunca por ruta (auditoría del
 * 15/09/2026, A2). `nombre` es como se lee en el borrador al grupo y en los logs.
 */
const CATALOGO = {
  catalogo: { archivo: 'Catalogo-Somos-Piedra-2026_3.pdf', nombre: 'Catálogo Somos Piedra 2026' },
};

/** La ruta del documento con ese id, o null si no está en el catálogo o falta el archivo. */
function ruta(id) {
  if (!Object.prototype.hasOwnProperty.call(CATALOGO, id)) return null;
  const r = path.join(CARPETA, CATALOGO[id].archivo);
  try {
    return fs.existsSync(r) ? r : null;
  } catch {
    return null;
  }
}

function nombre(id) {
  return Object.prototype.hasOwnProperty.call(CATALOGO, id) ? CATALOGO[id].nombre : String(id);
}

module.exports = { ruta, nombre, CARPETA };
