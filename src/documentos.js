'use strict';
/**
 * Documentos que el bot puede mandar. Hoy uno solo: el compromiso de pago,
 * que es lo que el cliente firma cuando se lleva el equipo financiado.
 *
 * Si el archivo no está, el bot NO lo menciona. Nunca promete algo que no
 * va a mandar — la misma regla que con las fotos.
 */
const fs = require('fs');
const path = require('path');

const CARPETA = process.env.DOCS_DIR || path.join(__dirname, '..', 'documentos');

/**
 * El catálogo: un documento se pide por id, nunca por ruta (auditoría del
 * 15/09/2026, A2). `nombre` es como se lee en el borrador al grupo y en los logs.
 */
const CATALOGO = {
  compromiso: { archivo: 'compromiso-de-pago.pdf', nombre: 'compromiso de pago' },
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

function compromisoDePago() {
  return ruta('compromiso');
}

module.exports = { compromisoDePago, ruta, nombre, CARPETA };
