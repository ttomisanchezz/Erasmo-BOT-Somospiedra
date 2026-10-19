'use strict';
/**
 * Si una línea del cliente es solo un acuse o un agradecimiento. Lo usan el barrido del silencio y #sigue
 * (index.js): un "gracias" que no pide respuesta no deja al cliente esperando.
 */
const promesas = require('./promesas');

/**
 * ¿La línea es solo un acuse o un agradecimiento? ("Okiss dale", "Noo, gracias a vos", "Dale dale",
 * "Dale gracias!!!", "👍"). Decisión de Tomás del 05/10/2026, al revisar el bloque Ninjo 1b: si al vencer
 * el silencio de una persona eso es todo lo que quedó sin respuesta, la charla la cerró la persona y el
 * barrido no la toma. Es más amplio que `responder.esAcuse`, que mira una palabra sola. Las letras
 * repetidas cuentan una vez ("graciass", "okiss"); "no" vale solo junto a "gracias".
 */
const PALABRAS_DE_CIERRE = new Set(
  (
    'dale ok oki okis okey okay oka bueno buenisimo listo joya perfecto genial barbaro gracias mil milones muchas ' +
    'muchisimas de nada a vos igualmente si sisi re rey bro amigo amigon capo crack genio hermano abrazo abrazos ' +
    'buena buen semana finde dia tarde noche tranqui ah va por la atencion todo bien y'
  ).split(' ')
);
function esCierre(texto) {
  const t = promesas
    .sinTildes(String(texto || ''))
    .toLowerCase()
    .replace(/[^a-zñ\s]/g, ' ')
    .replace(/([a-zñ])\1+/g, '$1')
    .trim();
  if (!t) return true; // solo emojis o signos
  const palabras = t.split(/\s+/);
  const conGracias = palabras.includes('gracias');
  return palabras.every((p) => PALABRAS_DE_CIERRE.has(p) || (conGracias && p === 'no'));
}

module.exports = { esCierre, PALABRAS_DE_CIERRE };
