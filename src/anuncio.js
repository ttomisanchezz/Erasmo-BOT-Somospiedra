'use strict';
/**
 * De qué anuncio vino un chat (20/10/2026, pedido de Tomás).
 *
 * Un mensaje que el cliente manda desde un anuncio de Meta "Enviar mensaje de WhatsApp" trae en su
 * `contextInfo` un `externalAdReply` con el id del anuncio (`sourceId`), el título y el link. Puede venir en
 * el `contextInfo` del tipo de mensaje (extendedTextMessage, imageMessage…; la forma de Baileys) o arriba,
 * en `data.contextInfo` (Evolution v2 lo copia ahí). Mismo criterio que `loCitado` de texto-del-mensaje.js.
 *
 * Se guarda en el estado del chat (`anuncio`: el primero; `anuncioUltimo`: si después llega desde otro) y
 * en el registro de aprendizaje (evento `anuncio`). Con `#vendido` / `#perdido` (ventas.js) alcanza para
 * contar chats y ventas por anuncio: `node herramientas/anuncios/reporte.js`.
 *
 * Solo lee. Nunca tira: un mensaje raro devuelve null.
 */

const comoTexto = (x) => (typeof x === 'string' ? x.trim() : typeof x === 'number' ? String(x) : '');

/** Los `contextInfo` del mensaje `m` (el `data` del webhook). */
function contextos(m) {
  const msg = m && typeof m.message === 'object' && m.message ? m.message : {};
  const lugares = Object.values(msg)
    .filter((v) => v && typeof v === 'object' && v.contextInfo && typeof v.contextInfo === 'object')
    .map((v) => v.contextInfo);
  if (m && m.contextInfo && typeof m.contextInfo === 'object') lugares.push(m.contextInfo);
  return lugares;
}

/**
 * El anuncio del que vino el mensaje, o null.
 * @returns {{id:string|null, titulo:string, url:string, tipo:string} | null}
 */
function anuncioDe(m) {
  try {
    if (!m || typeof m !== 'object') return null;
    for (const c of contextos(m)) {
      const ad = c.externalAdReply;
      const ctwa = /ctwa/i.test(comoTexto(c.entryPointConversionSource) + comoTexto(c.conversionSource));
      if ((!ad || typeof ad !== 'object') && !ctwa) continue;
      const a = ad && typeof ad === 'object' ? ad : {};
      const id = comoTexto(a.sourceId).replace(/\D/g, '') || null;
      const tipo = comoTexto(a.sourceType).toLowerCase();
      // Un externalAdReply sin id y sin tipo "ad" puede ser una vista previa de un link: no es un anuncio.
      if (!id && tipo !== 'ad' && !ctwa) continue;
      return {
        id,
        titulo: Array.from(comoTexto(a.title)).slice(0, 80).join(''),
        url: comoTexto(a.sourceUrl).slice(0, 200),
        tipo: tipo || 'ad',
      };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Los cambios para el estado del chat `s` con el anuncio `a`, o null si no hay nada que cambiar.
 * El primero queda en `anuncio` y no se pisa; uno distinto después va a `anuncioUltimo`.
 */
function cambiosDeEstado(s, a, ahora = Date.now()) {
  if (!a) return null;
  const nuevo = { id: a.id, titulo: a.titulo, ts: ahora };
  const previo = s && s.anuncio;
  if (!previo) return { anuncio: nuevo };
  if (previo.id === a.id) return null;
  const ultimo = s.anuncioUltimo;
  if (ultimo && ultimo.id === a.id) return null;
  return { anuncioUltimo: nuevo };
}

module.exports = { anuncioDe, cambiosDeEstado };
