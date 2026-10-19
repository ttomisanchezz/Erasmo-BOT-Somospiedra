'use strict';
/**
 * Promo del Día de la Madre (decisión de Tomás del 12/10/2026): del 12 al 18/10/2026 hay 10% OFF en todos los
 * equipos. La gente comenta una palabra en Instagram (MAMÁ, CUOTAS, CANJE, HERMANOS o REGALO), ManyChat le
 * contesta por DM y la manda a WhatsApp con un mensaje ya escrito: "Hola! Vengo por la promo MAMÁ" o
 * "Hola! Vengo por la promo MAMÁ - CUOTAS".
 *
 * Chiara NO cotiza esa promo: saluda una sola vez y escala a Tomás o Fran. Es una regla de código y no de
 * Sonnet ni del bot de siempre: `atenderTanda` (index.js) la mira ANTES de elegir quién contesta, así que no
 * se llama a Sonnet ni a Gemini y la cotización ni se arma. Vale hasta `PROMO_MADRE_HASTA`; desde el 19/10 estos
 * mensajes siguen el flujo normal. Para apagarla antes: poner `PROMO_MADRE_HASTA` en una fecha pasada.
 *
 * El origen queda en bot_leads.anuncio_id (panel Chiara, src/panel-chiara.js): `madre-<palabra>` sin tildes
 * (el CHECK de la 0013 es ^[A-Za-z0-9_-]{3,64}$, y "madre-mamá" no entra), o `madre` si no vino la palabra.
 * La planilla LEADS no tiene esa columna: ahí queda el motivo en `estado` ("ESCALADO - Promo Día de la Madre — CUOTAS").
 *
 * El saludo viaja con una marca de "ya se dijo" (`promoMadreSaludo`, como las de state.js): index.js la guarda recién
 * cuando Evolution confirma el envío, y no depende del historial (que recuerda solo las últimas líneas).
 */
const { sinTildes } = require('./promesas');
const { sinCita } = require('./texto-del-mensaje');
const acciones = require('./acciones');

/** Hasta cuándo vale: el 18/10/2026 a las 23:59 de Argentina (UTC-3, sin horario de verano), ese minuto incluido. */
const PROMO_MADRE_HASTA = Date.parse('2026-10-18T23:59:59.999-03:00');

/** Lo único que Chiara le dice al cliente. */
const SALUDO = 'Hola! Gracias por escribirnos 💐 Ya te paso con Tomi o Fran para la promo del Día de la Madre.';

// Sobre el texto sin tildes y en minúscula (`sinTildes`).
const DISPARADORES = [
  /\bpromo\s+mama\b/, //                       "promo MAMÁ"
  /\bdia\s+de\s+(?:la|las)\s+madres?\b/, //    "Día de la Madre"
  /(?<![\d.,])10\s?%/, //                      "10%" y "10 %", pero no "110%" ni "1,10%"
  /\bdiez\s+por\s+ciento\b/,
  /\bdescuento\s+de\s+instagram\b/,
];
// "promo MAMÁ - CUOTAS": la palabra es la que sigue al guion; sin guion, la palabra es MAMÁ.
const CON_PALABRA = /\bpromo\s+mama\s*[-–—]\s*(cuotas|canje|hermanos|regalo)\b/;
const SOLO_MAMA = /\bpromo\s+mama\b/;

/** ¿Está vigente? `ahora` en ms (Date.now() si no se pasa). */
function vigente(ahora = Date.now()) {
  return Number(ahora) <= PROMO_MADRE_HASTA;
}

/**
 * Si el mensaje es de la promo y la promo está vigente: { palabra, motivo, anuncioId }; si no, null.
 * `palabra`: 'MAMÁ', 'CUOTAS', 'CANJE', 'HERMANOS', 'REGALO' o null (llegó por "10%", "Día de la Madre"…).
 * Lee lo que escribió el cliente, no lo que citó (`[responde a: …]`).
 */
function deMensaje(texto, ahora = Date.now()) {
  if (!vigente(ahora)) return null;
  const t = sinTildes(sinCita(texto));
  if (!DISPARADORES.some((re) => re.test(t))) return null;
  const conPalabra = t.match(CON_PALABRA);
  const palabra = conPalabra ? conPalabra[1].toUpperCase() : SOLO_MAMA.test(t) ? 'MAMÁ' : null;
  return {
    palabra,
    motivo: `Promo Día de la Madre — ${palabra || 'sin palabra'}`,
    anuncioId: palabra ? `madre-${sinTildes(palabra)}` : 'madre',
  };
}

/** El `anuncio_id` de bot_leads para ese mensaje, o null si no es de la promo (o ya venció). */
function anuncioDe(texto, ahora = Date.now()) {
  const promo = deMensaje(texto, ahora);
  return promo ? promo.anuncioId : null;
}

/** ¿Ya le llegó el saludo a este chat? `estado`: el del chat (state.obtener). La marca la confirma el envío. */
function yaSeSaludo(estado) {
  return Boolean(estado && estado.promoMadreSaludo);
}

/**
 * El `resultado` de la tanda (el mismo que arman `decidir` y Sonnet): escala con el motivo de la promo y, la
 * primera vez, saluda. Si el saludo ya le llegó a este chat (la promo volvió a aparecer tras un escalado
 * resuelto), escala igual pero sin decirle nada: "contesta una sola vez".
 */
function resultado(promo, estado, ahora = Date.now()) {
  return {
    escalar: true,
    motivo: promo.motivo,
    mensajes: yaSeSaludo(estado) ? [] : [acciones.conMarcas(SALUDO, { promoMadreSaludo: ahora })],
    promoMadre: promo.anuncioId,
  };
}

module.exports = { PROMO_MADRE_HASTA, SALUDO, vigente, deMensaje, anuncioDe, yaSeSaludo, resultado };
