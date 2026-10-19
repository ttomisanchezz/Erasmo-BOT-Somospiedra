'use strict';
/**
 * Documentos que el bot puede mandar. En Piedra, por ahora ninguno (poda de iPhone, 19/10/2026: el
 * compromiso de pago era de iPhone). Queda el catálogo vacío y la carpeta, que es el candado de
 * evolution.js: nunca se manda un documento de afuera de `DOCS_DIR`.
 */
const fs = require('fs');
const path = require('path');

const CARPETA = process.env.DOCS_DIR || path.join(__dirname, '..', 'documentos');

/**
 * El catálogo: un documento se pide por id, nunca por ruta (auditoría del
 * 15/09/2026, A2). `nombre` es como se lee en el borrador al grupo y en los logs.
 */
const CATALOGO = {};

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
