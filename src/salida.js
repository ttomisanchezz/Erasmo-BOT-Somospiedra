'use strict';
/**
 * Lo que comparte todo lo que le sale al cliente, sacado de responder.js (el "bot de siempre" de iPhone, que
 * quedó en _heredado-iphone/) en la poda del 19/10/2026:
 *   - `sinLoYaDicho`: nunca repetir textual algo que ya le llegó en los últimos 15 mensajes (desde cero, D5), ni
 *     una pregunta que la cuenta ya le hizo en el chat (11/11/2026: "cada pregunta se hace una sola vez");
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
 * Una pregunta cuenta como tal desde este largo (en letras): "Cómo estás?" o "Todo bien?" son parte del saludo,
 * no una pregunta de la venta.
 */
const LARGO_MINIMO_DE_PREGUNTA = 12;

/** Un texto partido en [frase, separador, frase, …]. Corta solo donde hay un espacio después de . ! ? …: "$945.000." queda entero. */
const enFrases = (texto) => String(texto || '').split(/((?<=[.!?…])\s+)/);

/** La clave de una frase si es una pregunta de la venta ("lonecesitabasparaelpatio…"), o ''. */
function claveDePregunta(frase) {
  if (!/\?\s*$/.test(frase)) return '';
  const clave = soloLetras(frase);
  return clave.length >= LARGO_MINIMO_DE_PREGUNTA ? clave : '';
}

/** Las preguntas de un texto, como claves. */
const preguntasDe = (texto) => enFrases(texto).map(claveDePregunta).filter(Boolean);

/**
 * Las preguntas de la venta que la cuenta ya hizo, como texto y sin repetir, de la más vieja a la más nueva. `lineas`: líneas del
 * historial. Va en el pedido a Sonnet (cerebro.armarContexto) para que no las repita ni con otras palabras: el filtro de abajo
 * solo ataja la repetición textual.
 */
function preguntasHechas(lineas) {
  const vistas = new Map();
  for (const m of lineas || []) {
    if (!m || m.quien !== 'vendedor' || m.sinConfirmar) continue;
    for (const frase of enFrases(m.texto)) {
      const clave = claveDePregunta(frase);
      if (clave && !vistas.has(clave)) vistas.set(clave, frase.trim().replace(/^¿/, ''));
    }
  }
  return [...vistas.values()];
}

/**
 * El texto sin las preguntas que ya se le hicieron (`yaPreguntado`: claves). Lo demás queda tal cual, con sus
 * separadores; si no queda nada, ''.
 */
function sinPreguntasHechas(texto, yaPreguntado) {
  const partes = enFrases(texto);
  let queda = '';
  let saco = false;
  for (let i = 0; i < partes.length; i += 2) {
    const clave = claveDePregunta(partes[i]);
    if (clave && yaPreguntado.has(clave)) {
      saco = true;
      continue;
    }
    queda += (queda && i > 0 ? partes[i - 1] : '') + partes[i];
  }
  return saco ? queda.trim() : String(texto || '');
}

/**
 * Los mensajes que no son una repetición textual de algo que ya le llegó (las últimas 15 líneas de la
 * cuenta en el historial, sin las que no se confirmaron). Una acción (foto, documento) no se filtra.
 *
 * Además (11/11/2026), de cada texto se saca la pregunta que la cuenta ya le hizo en este chat (todo el
 * historial guardado, igual o con otra puntuación): Sonnet repetía "Lo necesitabas para el patio, el frente o
 * una pared?" cuando el cliente no la contestaba. Sale lo demás del mensaje; si era lo único, ese mensaje no sale.
 */
function sinLoYaDicho(chatId, msgs) {
  const deLaCuenta = (state.obtener(chatId).historial || []).filter((m) => m.quien === 'vendedor' && !m.sinConfirmar);
  const yaDicho = new Set(deLaCuenta.slice(-15).map((m) => soloLetras(m.texto)));
  const yaPreguntado = new Set(deLaCuenta.flatMap((m) => preguntasDe(m.texto)));
  const salen = [];
  for (const m of msgs) {
    if (acciones.esAccion(m)) {
      salen.push(m);
      continue;
    }
    const texto = acciones.comoTexto(m);
    if (yaDicho.has(soloLetras(texto))) continue;
    const limpio = sinPreguntasHechas(texto, yaPreguntado);
    if (limpio === texto) salen.push(m);
    else if (limpio) salen.push(acciones.esTexto(m) ? { ...m, texto: limpio } : limpio);
  }
  return salen;
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

module.exports = { sinLoYaDicho, preguntasHechas, primerNombre, TODO_REPETIDO };
