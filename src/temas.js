'use strict';
/**
 * Memoria por tema: qué ya se le explicó a un cliente, para no repetírselo.
 *
 * El filtro de repetidos de `decidirYFormatear` solo saca frases idénticas, y
 * estilo.js rota variantes a propósito: una explicación repetida casi nunca es
 * idéntica. Esto anota el TEMA, no la frase. Temas: financiación (incluye "las
 * cuotas arrancan el mes que viene"), requisitos, garantía y métodos de pago.
 * Envíos no: escala, no se explica.
 *
 * Decidido con Tomás el 14/09/2026:
 *  1. Pregunta o iniciativa se decide por el MENSAJE del cliente, no por la rama
 *     del código que contesta. Si nombra el tema, es pregunta: se contesta
 *     siempre, con la versión corta si ya se explicó. Si no lo nombra, es
 *     iniciativa: si ya se explicó, no se agrega.
 *  2. Cuenta como explicado lo que LE LLEGÓ al cliente: las líneas de vendedor
 *     del historial, que son lo que escribió una persona y lo que el bot mandó
 *     de verdad. En escucha lo que el bot habría dicho no entra al historial, así
 *     que no marca. Se detecta con palabras clave, sin IA.
 *  3. Las frases con números ("la entrega arranca en $320.000") se dicen siempre:
 *     son el dato, no la explicación del tema.
 *
 * No caduca. Se borra con #reset, junto con el resto del chat.
 */

const TEMAS = ['financiacion', 'requisitos', 'garantia', 'metodos_pago'];

/** Minúsculas y sin tildes. */
function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/\p{M}/gu, '');
}

/**
 * El cliente pregunta por el tema: palabras clave sobre SU mensaje. "¿Detalles de pago?" es la
 * financiación (desde cero, segunda vuelta, 30/09/2026).
 */
const PREGUNTA = {
  financiacion: /\b(cuotas?|financ\w*|en pagos|plan de pagos?|entrega inicial|detalles? del? pagos?)\b/,
  requisitos:
    /\b(dni|tarjetas?|recibos?( de sueldo)?|requisitos?|papeles|papeleria|documentacion|documentos?)\b|\bque (piden|necesito|hay que (llevar|traer|presentar))\b/,
  garantia: /\bgarantias?\b/,
  // También decide la respuesta fija de medios de pago en responder.js.
  metodos_pago:
    /\b(metodos?|medios?|formas?|opciones|modalidad(es)?|maneras?) de pagos?\b|\bcomo se (paga|abona)\b|\bcomo (trabajan|manejan) (el|los) pagos?\b/,
};

/**
 * Una línea que le llegó al cliente explica el tema. Tienen que ser palabras de
 * explicación, no de paso: "asi te armo las cuotas" o "la entrega arranca en"
 * nombran las cuotas sin explicar cómo es la financiación.
 */
const EXPLICA = {
  financiacion:
    /financ\w*|\b(1|2|una|dos)\s+(o\s+(2|dos)\s+)?cuotas\b|\bcuotas arrancan\b|\bprimera cuota\b|\bentrega inicial\b|\b[12]\s+pagos?\s+de\b/,
  requisitos: /\bdni\b|tarjeta de credito|(no hace falta|sin|no necesitas?) (una )?tarjeta|recibo de sueldo|compromiso de pago/,
  garantia: /\bgarantias?\b/,
  // Contado y financiación en la misma línea: "podes pagarlo de contado o financiarlo…".
  metodos_pago: /\bcontado\b[^\n]*\b(financ\w*|cuotas?)\b|\b(financ\w*|cuotas?)\b[^\n]*\bcontado\b/,
};

/**
 * Líneas nuestras que nombran el tema sin explicarlo. La pregunta de cómo piensa
 * pagarlo ("contame como tenias pensado pagarlo, tenemos contado y tambien lo
 * financiamos hasta en 2 cuotas con una entrega inicial del 65%") ofrece la
 * financiación, no la explica: la explicación es la pieza `explicaFinanciacion`
 * con el PDF del compromiso (bloque 3b, 16/09/2026), y va cuando contesta "en
 * cuotas", cuando pregunta cómo es, o antes de la primera cotización. Si esa
 * pregunta contara como explicación, el cliente que contesta "como es la
 * financiacion?" recibiría solo la versión corta y nunca el PDF.
 * Sí marca métodos de pago: eso lo dice.
 */
/**
 * La línea de la entrega inicial de un modelo (bloque 5b, `entregaInicial` en
 * estilo.js). Desde el Bloque Tono dice "$320.000 de entrega inicial" ("lo estamos
 * pidiendo con $320.000 de entrega inicial", "pedimos por lo menos $320.000 de
 * entrega inicial"); las de antes, que siguen en los historiales, decían "la entrega
 * inicial es de $320.000". Nombra la entrega sin explicar la financiación, así que
 * no marca el tema (va en NO_EXPLICA) aunque diga "1 o 2 cuotas": la explicación es
 * la pieza con el PDF. responder.js la reconoce en el historial para leer un número
 * suelto como plata. "entrega inicial del 65%" (cómo pensabas pagarlo) y "pedimos
 * una entrega inicial" (la explicación) no entran: no llevan "$X de".
 * Todas las variantes tienen que pasar por acá (lo prueba validacion-comercial).
 */
const LINEA_ENTREGA_INICIAL = /\$[\d.]+ (?:de|como) entrega inicial\b|\bentrega inicial\b[^?\n$]{0,25}\bde \$/;

const NO_EXPLICA = {
  financiacion: new RegExp('\\bcomo (tenias pensado|pensabas|lo ibas a) (pagar|hacer)|' + LINEA_ENTREGA_INICIAL.source),
};

/** Lo que se dice cuando el cliente pregunta por algo que ya se le explicó. */
const CORTA = {
  financiacion: 'como te decia, te lo financiamos en 1 o 2 cuotas con una entrega inicial',
  requisitos: 'si, solo con tu dni, no hace falta tarjeta',
  garantia: 'si, un mes de garantia',
  metodos_pago: 'como te decia, podes pagarlo de contado o financiarlo hasta en 2 cuotas con una entrega inicial',
};

function explicado(ctx, tema) {
  return Boolean(ctx && ctx.temasExplicados && ctx.temasExplicados[tema]);
}

/**
 * Con `ctx` (desde cero, C57T2, 29/09/2026): si la financiación ya se explicó en la charla,
 * "¿y cómo serían?" y "¿cómo son?" también preguntan por ella. Antes recibían "contame que
 * estabas buscando". "¿cómo son los equipos?" no.
 */
function pregunta(mensaje, tema, ctx = null) {
  const t = normalizar(mensaje);
  if (PREGUNTA[tema].test(t)) return true;
  return (
    tema === 'financiacion' &&
    explicado(ctx, 'financiacion') &&
    /\bcomo (serian|son)\b(?!\s+(los|las|el|la)\s+(equipos?|celus?|celulares|iphones?|telefonos?|precios?|colores))/.test(t)
  );
}

/** `larga` puede venir como función, para no rotar una variante de estilo.js que no se usa. */
const valor = (larga) => (typeof larga === 'function' ? larga() : larga);

/**
 * Para las ramas que YA son la respuesta a una pregunta del cliente (la
 * respuesta fija, documentación, medios de pago): va siempre, corta si ya se
 * explicó.
 */
function responder(tema, ctx, larga) {
  return explicado(ctx, tema) ? CORTA[tema] : valor(larga);
}

/**
 * Para lo que el bot agrega pegado a otra respuesta. Devuelve null si no va.
 *  - lo pregunta en este mensaje → como `responder`: siempre, corta si ya se explicó
 *  - no lo pregunta → solo si todavía no se explicó
 */
function decir(tema, ctx, mensaje, larga) {
  if (pregunta(mensaje, tema)) return responder(tema, ctx, larga);
  return explicado(ctx, tema) ? null : valor(larga);
}

/**
 * Las marcas del chat al día con lo que dice el historial. Mira todas las
 * líneas de vendedor que quedan (son 15 como mucho, y marcar dos veces no hace
 * nada). Devuelve las marcas nuevas, o null si no cambió nada.
 */
function actualizarDesdeHistorial(ctx) {
  const previas = (ctx && ctx.temasExplicados) || {};
  const nuevas = { ...previas };
  for (const h of (ctx && ctx.historial) || []) {
    if (h.quien !== 'vendedor') continue;
    const t = normalizar(h.texto);
    for (const tema of TEMAS) {
      if (nuevas[tema] || !EXPLICA[tema].test(t)) continue;
      if (NO_EXPLICA[tema] && NO_EXPLICA[tema].test(t)) continue;
      nuevas[tema] = true;
    }
  }
  return Object.keys(nuevas).length !== Object.keys(previas).length ? nuevas : null;
}

module.exports = {
  TEMAS,
  PREGUNTA,
  EXPLICA,
  NO_EXPLICA,
  LINEA_ENTREGA_INICIAL,
  CORTA,
  explicado,
  pregunta,
  responder,
  decir,
  actualizarDesdeHistorial,
  normalizar,
};
