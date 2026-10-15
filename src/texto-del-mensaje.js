'use strict';
/**
 * El texto de un mensaje de WhatsApp como lo trae Evolution (el webhook o /chat/findMessages). Lo
 * comparten index.js (lo que escribe el cliente o una persona de la cuenta) y contexto.js (los
 * mensajes de Evolution que completan el historial; bloque Ninjo 1b, 05/10/2026). Hasta ese bloque
 * `textoDelMensaje` vivía en index.js: se movió tal cual.
 *
 * No requiere nada del bot: lo usa también `npm run probar-contexto`, que no carga state.js.
 */

function textoDelMensaje(m) {
  const msg = m?.message || {};
  return (
    msg.conversation ||
    msg.extendedTextMessage?.text ||
    msg.imageMessage?.caption ||
    msg.videoMessage?.caption ||
    ''
  ).trim();
}

/**
 * Lo que va en la línea del historial cuando un mensaje de Evolution no trae texto: "[foto]",
 * "[audio]", "[video]", "[sticker]" o "[archivo]", según el tipo. null si es otra cosa (contexto.js
 * no lo suma): una reacción, un mensaje de protocolo (un borrado, una edición), una encuesta, una
 * ubicación, un contacto.
 */
function marcadorSinTexto(m) {
  const msg = m?.message || {};
  if (msg.imageMessage || msg.albumMessage) return '[foto]';
  if (msg.videoMessage || msg.ptvMessage) return '[video]';
  if (msg.audioMessage) return '[audio]';
  if (msg.stickerMessage) return '[sticker]';
  if (msg.documentMessage || msg.documentWithCaptionMessage) return '[archivo]';
  return null;
}

/** Los marcadores de `marcadorSinTexto`, para reconocerlos en una línea. */
const MARCADOR = /^\[(?:foto|audio|video|sticker|archivo)\]$/;

/**
 * La línea del historial de una foto sin epígrafe del cliente: el marcador "[foto]". Desde el 07/10/2026 (decisión
 * de Tomás) index.js la anota también en los chats de Sonnet, y no cuenta como algo escrito: ni para el barrido del
 * silencio ni para #sigue (no es texto), ni para el seguimiento ni para los datos viejos (control.js).
 */
const LINEA_FOTO = '[foto]';
const esFotoDelCliente = (l) => Boolean(l) && l.quien === 'cliente' && String(l.texto || '').trim() === LINEA_FOTO;

/**
 * Lo que cita el cliente (decisión de Tomás del 08/10/2026, chat …3557: respondió a un producto del catálogo de
 * WhatsApp, "iPhone 13 100%", con "Hola a qe precio están", Sonnet no vio la cita y mandó la lista entera). Cuando
 * un mensaje responde a otro (un producto del catálogo, un estado, un mensaje nuestro o suyo), WhatsApp trae el
 * citado en `contextInfo.quotedMessage`: en el `contextInfo` del tipo de mensaje (extendedTextMessage,
 * imageMessage, audioMessage…; la forma de Baileys) o arriba, en `data.contextInfo` (Evolution v2 lo copia ahí; son
 * los mismos dos lugares que lee anuncio.js). Lo citado es:
 *   - de un producto del catálogo (`productMessage.product`), el título (sin título, la descripción) y el precio si
 *     viene (`priceAmount1000`, el precio por mil: en pesos "$535.000", en otra moneda "USD 500"). La forma del
 *     producto citado no se vio en un payload real: son los campos del proto de WhatsApp;
 *   - el texto (`conversation`, `extendedTextMessage.text`) o el epígrafe de una foto, un video o un archivo;
 *   - sin texto, el marcador del tipo: "[foto]", "[video]", "[audio]", "[sticker]" o "[archivo]".
 * Va en una línea, sin saltos, hasta 120 caracteres (sin cortar un emoji), con los corchetes pasados a paréntesis
 * (así la cita se saca entera: `sinCita`). Sin cita, con una cita vacía o con una que no se lee (una reacción, una
 * ubicación): null. Un anuncio (`externalAdReply`, sin `quotedMessage`) no es una cita. Nunca tira.
 */
const CITA_MAXIMO = 120;
/** Los mensajes que envuelven a otro (efímero, ver una vez, documento con epígrafe): se mira el de adentro. */
const ENVOLTORIOS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];
const comoTexto = (x) => (typeof x === 'string' ? x : '');

function sinEnvoltorio(msg) {
  let m = msg;
  for (let i = 0; i < 3 && m && typeof m === 'object'; i++) {
    const clave = ENVOLTORIOS.find((k) => m[k] && typeof m[k] === 'object' && m[k].message);
    if (!clave) break;
    m = m[clave].message;
  }
  return m;
}

/** Un int64 de WhatsApp como venga en el JSON: un número, un texto o { low, high } (un Long). */
function entero64(v) {
  if (v && typeof v === 'object') return (Number(v.high) >>> 0) * 4294967296 + (Number(v.low) >>> 0);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/** El precio de un producto del catálogo: "$535.000", "USD 500", o '' si no viene. */
function precioDelProducto(p) {
  const n = Math.round(entero64(p.priceAmount1000) / 1000);
  if (!(n > 0)) return '';
  const moneda = comoTexto(p.currencyCode).trim().toUpperCase();
  const numero = n.toLocaleString('es-AR');
  return !moneda || moneda === 'ARS' ? `$${numero}` : `${moneda} ${numero}`;
}

/** El texto de un mensaje citado (`quotedMessage`), sin recortar, o ''. */
function textoCitado(q) {
  const m = sinEnvoltorio(q);
  if (!m || typeof m !== 'object') return '';
  const producto = m.productMessage && m.productMessage.product;
  if (producto && typeof producto === 'object') {
    const nombre = comoTexto(producto.title).trim() || comoTexto(producto.description).trim();
    return [nombre, precioDelProducto(producto)].filter(Boolean).join(' ');
  }
  const texto =
    comoTexto(m.conversation) ||
    comoTexto(m.extendedTextMessage && m.extendedTextMessage.text) ||
    comoTexto(m.imageMessage && m.imageMessage.caption) ||
    comoTexto(m.videoMessage && m.videoMessage.caption) ||
    comoTexto(m.documentMessage && m.documentMessage.caption);
  return texto.trim() || marcadorSinTexto({ message: m }) || '';
}

/** Lo citado en una línea: sin saltos, con los corchetes como paréntesis (salvo un marcador) y hasta 120 caracteres. */
function enUnaLinea(t) {
  const plano = String(t || '').replace(/\s+/g, ' ').trim();
  if (!plano || MARCADOR.test(plano)) return plano;
  const sinCorchetes = plano.replace(/\[/g, '(').replace(/\]/g, ')');
  return Array.from(sinCorchetes).slice(0, CITA_MAXIMO).join('').trim();
}

/** Lo que cita el mensaje `m` (el `data` del webhook o un registro de /chat/findMessages), o null. */
function loCitado(m) {
  if (!m || typeof m !== 'object') return null;
  const msg = m.message && typeof m.message === 'object' ? m.message : {};
  const lugares = Object.values(msg)
    .filter((v) => v && typeof v === 'object' && v.contextInfo)
    .map((v) => v.contextInfo);
  if (m.contextInfo) lugares.push(m.contextInfo);
  for (const c of lugares) {
    const q = c && typeof c === 'object' ? c.quotedMessage : null;
    if (!q || typeof q !== 'object') continue;
    const t = enUnaLinea(textoCitado(q));
    if (t) return t;
  }
  return null;
}

/**
 * La línea del cliente con lo que citó adelante: "[responde a: iPhone 13 100%] Hola a qe precio están". Sin cita, el
 * texto tal cual. Es lo que va al historial (y de ahí a Sonnet): index.js con lo que llega por el webhook (un texto,
 * un epígrafe o la transcripción de un audio) y contexto.js con las líneas del cliente que trae de Evolution.
 */
function conCita(texto, m) {
  const c = loCitado(m);
  return c ? `[responde a: ${c}] ${texto}` : texto;
}

/**
 * El texto sin la cita del principio de cada línea (`conCita`). Lo usan lo que tiene que leer solo lo que escribió el
 * cliente, como antes de la cita: el mensaje que recibe el bot de siempre (index.js; lo citado no se lee como un
 * monto ni como un modelo suyo), los acuses y el saludo del día de Sonnet (cerebro.js).
 */
const CITA = /^\[responde a: (?:\[(?:foto|audio|video|sticker|archivo)\]|[^[\]])*\] ?/gm;
function sinCita(texto) {
  return String(texto == null ? '' : texto).replace(CITA, '');
}

module.exports = { textoDelMensaje, marcadorSinTexto, MARCADOR, LINEA_FOTO, esFotoDelCliente, loCitado, conCita, sinCita };
