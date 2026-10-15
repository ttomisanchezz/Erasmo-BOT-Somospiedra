'use strict';
/**
 * Muestra el resumen de la mañana con el estado real, sin esperar a las 9.
 *
 *   npm run resumen
 *
 * Sirve para ver cómo va a llegar al grupo antes de activarlo.
 *
 * Lee el estado REAL, y solo lo lee: con ESTADO_SOLO_LECTURA no escribe nunca,
 * ni al salir (bloque 4 de la auditoría). Antes guardaba al salir la copia que
 * había cargado y, con el bot corriendo, pisaba lo que anotó mientras tanto.
 */
process.env.ESTADO_SOLO_LECTURA = '1';
const resumen = require('../src/resumen');
const config = require('../src/config');

const dias = parseInt(process.argv.find((a) => /^\d+$/.test(a)) || config.resumen.diasFrio, 10);

const partes = resumen.deHoy(dias);
console.log('');
partes.forEach((p, i) => {
  console.log(`--- mensaje ${i + 1}/${partes.length} · ${p.length} caracteres ---`);
  console.log(p);
  console.log('');
});
