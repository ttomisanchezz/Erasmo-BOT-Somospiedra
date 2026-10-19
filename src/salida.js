'use strict';
/**
 * Lo que comparte todo lo que le sale al cliente, sacado de responder.js (el "bot de siempre" de iPhone, que
 * quedó en _heredado-iphone/) en la poda del 19/10/2026:
 *   - `sinLoYaDicho`: nunca repetir textual algo que ya le llegó en los últimos 15 mensajes (desde cero, D5);
 *   - `primerNombre`: el nombre de pila del pushName, o '' si no es un nombre de verdad;
 *   - `TODO_REPETIDO`: el motivo del escalado cuando todo lo que iba a contestar ya se lo había dicho.
 */
const state = require('./state');
const acciones = require('./acciones');

/** El motivo de D5 (desde cero, 29/09/2026): todo lo que iba a contestar ya se lo había dicho. */
const TODO_REPETIDO = 'no sé cómo seguir: lo que iba a contestar ya se lo dije';

const soloLetras = (t) =>
  String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/**
 * Los mensajes que no son una repetición textual de algo que ya le llegó (las últimas 15 líneas de la
 * cuenta en el historial, sin las que no se confirmaron). Una acción (foto, documento) no se filtra.
 */
function sinLoYaDicho(chatId, msgs) {
  const yaDicho = new Set(
    (state.obtener(chatId).historial || [])
      .filter((m) => m.quien === 'vendedor' && !m.sinConfirmar)
      .slice(-15)
      .map((m) => soloLetras(m.texto))
  );
  return msgs.filter((m) => acciones.esAccion(m) || !yaDicho.has(soloLetras(acciones.comoTexto(m))));
}

/**
 * El nombre de pila sacado del pushName de WhatsApp. Vacío si no hay un nombre de verdad: solo cuentan las
 * letras, y vale la primera palabra de 2 letras o más con alguna vocal que no sea una sola letra repetida
 * ("HH", "RSS" u "O" no son nombres).
 */
function primerNombre(pushName) {
  if (!pushName) return '';
  const palabras = String(pushName).match(/[\p{L}\p{M}]{2,}/gu) || [];
  const nombre = palabras.find((p) => {
    const base = p.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
    return /[aeiou]/.test(base) && !/^(.)\1+$/.test(base);
  });
  return nombre ? [...nombre].slice(0, 20).join('') : '';
}

module.exports = { sinLoYaDicho, primerNombre, TODO_REPETIDO };
