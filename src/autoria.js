'use strict';
/**
 * ¿Quién escribió un mensaje propio (fromMe): el bot o una persona de la cuenta?
 *
 * Auditoría del 15/09/2026, bloque 2 (A3). Antes contaba como persona solo si
 * pasaban más de 15 s desde el último envío del bot: una persona que contestaba en
 * esos 15 s se perdía (no entraba al historial ni callaba al bot), y un eco del bot
 * que tardaba más contaba como persona. Ahora se decide por el id del mensaje:
 *
 *  - cada envío del bot anota el id que devuelve Evolution (`key.id`);
 *  - el eco puede llegar por el webhook ANTES que esa respuesta: mientras el envío
 *    está en vuelo, un mensaje propio del mismo tipo (y, si es texto, con el mismo
 *    texto) es su eco, y se anota su id;
 *  - cualquier otro mensaje propio es de una persona, sin ventana de tiempo;
 *  - si Evolution no devuelve id (falló o el envío quedó bloqueado), no se anota nada.
 *
 * Vive en memoria y no se guarda en disco, a propósito. El eco llega en segundos:
 * para perder uno, el bot tendría que reiniciarse justo entre el envío y el eco. Si
 * pasa, ese eco cuenta como una persona y el bot se calla 45 minutos en ese chat,
 * lo mismo que ya hacía la regla vieja con un eco lento. Guardarlo en estado.json
 * sumaba una escritura por mensaje para cubrir esa ventana de segundos.
 *
 * Acotado: como mucho MAX_POR_CHAT ids por chat, y cada uno vive TTL_MS.
 */
const TTL_MS = 30 * 60 * 1000;
const MAX_POR_CHAT = 50;

const ids = new Map(); // chatId -> Map(id -> cuándo se anotó)
const enVuelo = new Map(); // chatId -> Set de envíos que todavía no volvieron

const normalizar = (t) => String(t || '').replace(/\s+/g, ' ').trim();

/** Qué es un mensaje de WhatsApp, para compararlo con un envío: { tipo, texto }. */
function contenido(data) {
  const msg = (data && data.message) || {};
  const conPie = msg.documentWithCaptionMessage && msg.documentWithCaptionMessage.message;
  const doc = msg.documentMessage || (conPie && conPie.documentMessage);
  if (msg.imageMessage) return { tipo: 'imagen', texto: normalizar(msg.imageMessage.caption) };
  if (doc) return { tipo: 'documento', texto: normalizar(doc.caption) };
  const texto = msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text);
  return { tipo: 'texto', texto: normalizar(texto) };
}

function podar(chatId, ahora) {
  const delChat = ids.get(chatId);
  if (!delChat) return;
  for (const [id, cuando] of delChat) if (ahora - cuando > TTL_MS) delChat.delete(id);
  if (!delChat.size) ids.delete(chatId);
}

function anotar(chatId, id, ahora) {
  podar(chatId, ahora);
  if (!ids.has(chatId)) ids.set(chatId, new Map());
  const delChat = ids.get(chatId);
  delChat.delete(id);
  delChat.set(id, ahora);
  // Se van los más viejos: un Map recorre en el orden en que se agregó.
  while (delChat.size > MAX_POR_CHAT) delChat.delete(delChat.keys().next().value);
}

/** Antes de mandar: el envío queda en vuelo hasta que Evolution conteste. */
function despegar(chatId, tipo, texto, ahora = Date.now()) {
  const vuelo = { chatId, tipo, texto: normalizar(texto), desde: ahora, eco: false };
  if (!enVuelo.has(chatId)) enVuelo.set(chatId, new Set());
  enVuelo.get(chatId).add(vuelo);
  return vuelo;
}

/** Cuando Evolution contestó (o falló: `respuesta` null). Sale de vuelo y anota el id si vino. */
function aterrizar(vuelo, respuesta, ahora = Date.now()) {
  const delChat = enVuelo.get(vuelo.chatId);
  if (delChat) {
    delChat.delete(vuelo);
    if (!delChat.size) enVuelo.delete(vuelo.chatId);
  }
  if (llego(respuesta)) anotar(vuelo.chatId, String(respuesta.key.id), ahora);
}

/**
 * ¿El mensaje llegó de verdad? Es la respuesta de Evolution con su id: sin id no
 * hubo envío (en escucha o fuera de la lista de prueba vuelve `bloqueado`, y si
 * Evolution falla no se llega a contestar). Lo usan la autoría y las marcas de
 * "ya se dijo" (bloque 3), que se confirman con el mismo criterio.
 */
function llego(respuesta) {
  return Boolean(respuesta && !respuesta.bloqueado && respuesta.key && respuesta.key.id);
}

/** ¿Este mensaje propio lo mandó el bot? */
function esDelBot(chatId, data, ahora = Date.now()) {
  const id = data && data.key && data.key.id ? String(data.key.id) : '';
  podar(chatId, ahora);
  if (id && ids.has(chatId) && ids.get(chatId).has(id)) return true;
  const delChat = enVuelo.get(chatId);
  if (!delChat) return false;
  const c = contenido(data);
  for (const vuelo of delChat) {
    if (vuelo.eco || vuelo.tipo !== c.tipo) continue;
    // Una foto o un documento se reconocen por el tipo: el pie puede volver distinto.
    if (vuelo.tipo === 'texto' && vuelo.texto !== c.texto) continue;
    vuelo.eco = true; // un eco por envío
    if (id) anotar(chatId, id, ahora);
    return true;
  }
  return false;
}

/**
 * ¿Este id es de un envío del bot que está anotado? Solo mira, no reconoce ecos (contexto.js, bloque
 * Ninjo 1b: los mensajes que trae de Evolution). Vale lo que vive en memoria: los últimos 30 minutos.
 */
function anotado(chatId, id, ahora = Date.now()) {
  if (!id) return false;
  podar(chatId, ahora);
  return ids.has(chatId) && ids.get(chatId).has(String(id));
}

/** Cuántos ids tiene anotados un chat. */
function cuantos(chatId, ahora = Date.now()) {
  podar(chatId, ahora);
  return ids.has(chatId) ? ids.get(chatId).size : 0;
}

module.exports = { despegar, aterrizar, llego, esDelBot, anotado, contenido, cuantos, TTL_MS, MAX_POR_CHAT };
