'use strict';
/**
 * Lo genérico de los avisos al grupo interno, sacado de resumen.js (el resumen de la mañana de iPhone, que
 * quedó en _heredado-iphone/) en la poda del 19/10/2026: si un chat es un teléfono de verdad (para no armar
 * un wa.me roto) y cómo partir un aviso largo en varios mensajes. Lo usan control.js, ventas.js y
 * recordatorios.js.
 */

/** Largo cómodo para un mensaje de WhatsApp. Pasado esto, se parte en varios. */
const LARGO_MENSAJE = 1500;

function telefono(chatId) {
  return String(chatId).split('@')[0];
}

/**
 * ¿Es un JID de teléfono de verdad? No todo lo que hay en estado.json es un cliente: un script de
 * diagnóstico puede dejar una clave con una etiqueta en vez de un número, y saldría un `wa.me/…` que no
 * lleva a ningún lado. Antes de armar un link, se verifica.
 */
function esTelefono(chatId) {
  return /^\d{6,}$/.test(telefono(chatId));
}

/**
 * Reparte los bloques en mensajes que entren en `largoMax`, sin cortar ningún bloque por la mitad. Si uno
 * solo ya es más largo que el tope, sale igual: mejor un mensaje largo que perder un aviso.
 */
function partir(bloques, largoMax) {
  const RESERVA = 16; // para el "(1/3)" que se agrega después
  const partes = [];
  let actual = '';
  for (const b of bloques) {
    if (actual && (actual + '\n' + b).length + RESERVA > largoMax) {
      partes.push(actual);
      actual = b;
    } else {
      actual = actual ? actual + '\n' + b : b;
    }
  }
  if (actual) partes.push(actual);
  return partes;
}

module.exports = { esTelefono, partir, LARGO_MENSAJE };
