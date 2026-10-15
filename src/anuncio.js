'use strict';
/**
 * El anuncio de Meta del que vino un mensaje (panel Chiara, 06/10/2026). Los chats que llegan desde un
 * anuncio de WhatsApp traen `externalAdReply` en el contextInfo del mensaje: `sourceId` es el anuncio,
 * `sourceType` 'ad'. Evolution lo trae en `data.contextInfo` y en el `contextInfo` de cada tipo de
 * mensaje (extendedTextMessage, imageMessage…). Lo usan src/panel-chiara.js (bot_leads.anuncio_id) y
 * `npm run anuncios`. No requiere nada del bot.
 */

/** Todos los externalAdReply del mensaje (puede no haber ninguno). */
function respuestasDeAnuncio(data) {
  const lugares = [];
  if (data && data.contextInfo) lugares.push(data.contextInfo);
  const msg = (data && data.message) || {};
  for (const v of Object.values(msg)) if (v && typeof v === 'object' && v.contextInfo) lugares.push(v.contextInfo);
  return lugares.map((c) => c && c.externalAdReply).filter((x) => x && typeof x === 'object');
}

/** El id del anuncio, solo si es de un anuncio (`sourceType` 'ad' o sin tipo). null si no vino de uno. */
function anuncioDe(data) {
  for (const ad of respuestasDeAnuncio(data)) {
    const id = String(ad.sourceId || '').trim();
    const tipo = String(ad.sourceType || '').trim().toLowerCase();
    if (/^[A-Za-z0-9_-]{3,64}$/.test(id) && (!tipo || tipo === 'ad')) return id;
  }
  return null;
}

module.exports = { anuncioDe, respuestasDeAnuncio };
