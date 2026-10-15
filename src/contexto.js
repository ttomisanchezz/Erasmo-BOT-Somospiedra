'use strict';
/**
 * El contexto completo desde Evolution (bloque Ninjo 1b, decisión de Tomás del 05/10/2026).
 *
 * Sonnet lee el historial de estado.json, de hasta 30 líneas. Ese historial arranca cuando el bot
 * vio el chat por primera vez: quedaba afuera lo que se habló antes, lo que escribió Fran desde el
 * celular con el bot apagado y lo que pasó durante un corte. En 13 de las 35 respuestas en chats
 * viejos Sonnet leyó 3 líneas o menos (…4517 y …6356: a clientas que pagan cuotas les preguntó "qué
 * modelo estás buscando?"; …3405: contestó "como me habías hecho cuotas" habiendo leído 1 línea).
 *
 * `completar(chatId)` le pide a Evolution los últimos 30 mensajes de ese chat (solo lectura:
 * evolution.buscarMensajesDeChat) y los suma al historial:
 *   - solo si el historial guardado tiene menos de 30 líneas y el chat no tiene `evolutionTraido`
 *     (la fecha en que se trajo; `#reset` la deja con la hora del reset: lo de antes no se trae);
 *   - si llega un registro de otro chat (el filtro por chat de findMessages no se probó en la PC),
 *     no se usa ninguno y el chat no queda marcado;
 *   - con el `@lid` del número (chats-viejos.json, `lids`), se pide también ese;
 *   - cada registro es una línea: la hora es `messageTimestamp`, el texto el de `textoDelMensaje`
 *     (en una del cliente que responde a otro mensaje, con "[responde a: …]" adelante, `conCita`, desde el
 *     08/10/2026) o "[foto]", "[audio]"… (texto-del-mensaje.js); sin reacciones, protocolo, borrados ni
 *     encuestas. Del cliente si no es `fromMe`; del bot si el id es de un envío suyo (chats-viejos
 *     `idsBot` o autoria.js); si no, de una persona de la cuenta (`humano: true`);
 *   - una línea con el mismo id que una del historial no entra; con una línea vieja sin id, es la
 *     misma si es del mismo lado, con el mismo texto (sin mayúsculas ni espacios dobles) y a menos
 *     de 3 minutos (queda la del historial: así no se pierde que la escribió el bot);
 *   - lo de Evolution del último minuto antes de la línea más nueva del historial, o posterior, no
 *     entra: es lo que está llegando por el webhook (si entrara, el webhook lo sumaría otra vez);
 *   - se ordena todo por hora, quedan las últimas 30 y las de una persona van también a
 *     `lineasPersona` (state.completarHistorial).
 * Si Evolution falla o tarda más de 8 s, se sigue como hasta ahora (el log lo dice) y ese chat no se
 * vuelve a pedir por 10 minutos. Nunca tira.
 *
 * state.js se pide adentro de `completar` y no arriba: `npm run probar-contexto` usa `traerCrudo` y
 * `lineasDe` sin cargarlo (cargarlo migra y reescribe el estado real).
 */
const config = require('./config');
const evolution = require('./evolution');
const chatsViejos = require('./chats-viejos');
const autoria = require('./autoria');
const { textoDelMensaje, marcadorSinTexto, MARCADOR, conCita } = require('./texto-del-mensaje');

/** Cuántos mensajes se le piden a Evolution: los mismos que guarda el historial (state.LARGO_HISTORIAL). */
const CUANTOS = 30;
const ESPERA_MS = 8000;
const REINTENTO_MS = 10 * 60 * 1000;
const MISMA_LINEA_MS = 3 * 60 * 1000;
const EN_CAMINO_MS = 60 * 1000;

/** Tipos de mensaje que no son parte de la charla (por `messageType` o por la clave del `message`). */
const NO_ENTRAN = /^(?:reactionMessage|protocolMessage|editedMessage|pollCreationMessage(?:V\d)?|pollUpdateMessage)$/;

class NoFiltro extends Error {
  constructor(detalle) {
    super(detalle);
    this.name = 'NoFiltro';
  }
}

const esDeLaCuenta = (k) => k.fromMe === true || k.fromMe === 'true';
const tsDe = (r) => Number(r?.messageTimestamp?.low ?? r?.messageTimestamp) * 1000 || 0;
const normal = (t) => String(t || '').toLowerCase().replace(/\s+/g, ' ').trim();

/** El chat y, si tiene, su `@lid`: los dos jid que se le piden a Evolution. */
function jidsDelChat(chatId, lid) {
  return [chatId, ...(lid ? [`${lid}@lid`] : [])];
}

/** ¿El registro es de este chat? Por `key.remoteJid` o `key.remoteJidAlt`. */
function esDeEsteChat(r, jids) {
  const k = (r && r.key) || {};
  return jids.includes(String(k.remoteJid || '')) || jids.includes(String(k.remoteJidAlt || ''));
}

/**
 * Lo que devuelve Evolution para el chat (y su `@lid`), sin juzgar: { registros, ajenos }. `ajenos`
 * son los de otro chat. Sin repetidos por id (el del número y el del lid pueden traer el mismo). Tira
 * si Evolution falla.
 */
async function traerCrudo(chatId, { buscar, lid = null, cuantos = CUANTOS } = {}) {
  const jids = jidsDelChat(chatId, lid);
  const listas = await Promise.all(jids.map((j) => buscar(j, cuantos)));
  if (listas.some((l) => !Array.isArray(l))) throw new Error('Evolution contestó sin una lista de mensajes');
  const vistos = new Set();
  const registros = [];
  for (const r of listas.flat()) {
    const id = r && r.key && r.key.id ? `${r.key.id}` : null;
    if (id && vistos.has(id)) continue;
    if (id) vistos.add(id);
    registros.push(r);
  }
  return { registros, ajenos: registros.filter((r) => !esDeEsteChat(r, jids)) };
}

/** Lo mismo, pero si llega uno de otro chat tira NoFiltro: no se usa ninguno. */
async function traer(chatId, opciones) {
  const { registros, ajenos } = await traerCrudo(chatId, opciones);
  if (ajenos.length) throw new NoFiltro(`Evolution no filtró por chat (${ajenos.length} de ${registros.length} son de otro chat)`);
  return registros;
}

/**
 * Un registro de findMessages como línea del historial, o null si no entra. `esDelBot(id)`: ¿ese
 * id es de un envío del bot? Lleva `evolution: true` (para contar cuántas leyó Sonnet de acá).
 */
function lineaDe(r, esDelBot) {
  const msg = r && r.message;
  if (!msg || typeof msg !== 'object') return null;
  if (NO_ENTRAN.test(String(r.messageType || '')) || r.status === 'DELETED' || r.messageStubType) return null;
  if (Object.keys(msg).some((k) => NO_ENTRAN.test(k))) return null;
  const ts = tsDe(r);
  if (!ts) return null;
  const escrito = textoDelMensaje(r);
  const texto = escrito || marcadorSinTexto(r);
  if (!texto) return null;
  const k = r.key || {};
  const id = k.id ? String(k.id) : null;
  const conId = id ? { id } : {};
  // Lo que cita el cliente (08/10/2026): su línea con "[responde a: …]" adelante, como la del webhook (index.js).
  if (!esDeLaCuenta(k)) return { quien: 'cliente', texto: escrito ? conCita(escrito, r) : texto, ts, ...conId, evolution: true };
  if (id && esDelBot(id)) return { quien: 'vendedor', texto, ts, ...conId, evolution: true };
  return { quien: 'vendedor', texto, ts, humano: true, ...conId, evolution: true };
}

/** Las líneas de los registros, de la más vieja a la más nueva. */
function lineasDe(registros, { esDelBot = () => false } = {}) {
  return (registros || [])
    .map((r) => lineaDe(r, esDelBot))
    .filter(Boolean)
    .sort((a, b) => a.ts - b.ts);
}

const lado = (l) => (l.quien === 'cliente' ? 'cliente' : 'cuenta');

/**
 * ¿Una línea vieja del historial (sin id) y una de Evolution son el mismo mensaje? Del mismo lado,
 * a menos de 3 minutos, y el mismo texto. Un "[audio]" o una "[foto]" de Evolution también es la
 * línea de un audio (`audio: true`, que en el historial tiene la transcripción) o un marcador del
 * historial ("[foto]", "[audio que no se entendio]"): sin esto, un audio viejo entraba dos veces.
 */
function mismaLinea(h, l) {
  if (lado(h) !== lado(l)) return false;
  if (Math.abs((Number(h.ts) || 0) - l.ts) >= MISMA_LINEA_MS) return false;
  if (normal(h.texto) === normal(l.texto)) return true;
  return MARCADOR.test(l.texto) && (Boolean(h.audio) || /^\[/.test(String(h.texto || '').trim()));
}

/**
 * Las líneas de Evolution que no están en el historial. Cada línea del historial empareja con una
 * sola de Evolution. Lo del último minuto antes de la línea más nueva del historial (o de `ahora`,
 * si está vacío), o posterior, no entra: está llegando por el webhook.
 */
function nuevasLineas(historial, lineas, { ahora = Date.now() } = {}) {
  const h = historial || [];
  const masNueva = h.reduce((max, l) => Math.max(max, Number(l && l.ts) || 0), 0) || ahora;
  const limite = masNueva - EN_CAMINO_MS;
  const ids = new Set(h.filter((l) => l && l.id).map((l) => String(l.id)));
  const usadas = new Set();
  const out = [];
  for (const l of lineas) {
    if (l.ts > limite) continue;
    if (l.id && ids.has(l.id)) continue;
    const igual = h.find((x) => x && !x.id && !usadas.has(x) && mismaLinea(x, l));
    if (igual) {
      usadas.add(igual);
      continue;
    }
    out.push(l);
  }
  return out;
}

/** Cómo va cada línea en el pedido a Sonnet (y en `npm run probar-contexto`). */
function etiqueta(l) {
  if (l.quien === 'cliente') return l.audio ? 'Cliente (audio)' : 'Cliente';
  return l.humano ? 'Persona de la cuenta' : 'Vos (antes)';
}

function conTope(promesa, ms) {
  let reloj;
  const vencida = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`tardó más de ${Math.round(ms / 1000)} s`)), ms);
    if (reloj.unref) reloj.unref();
  });
  return Promise.race([promesa, vencida]).finally(() => clearTimeout(reloj));
}

// La última falla de cada chat (en memoria): no se vuelve a pedir por 10 minutos.
const fallas = new Map();
// Un pedido en curso por chat: si se pide dos veces a la vez, la segunda espera a la primera.
const enCurso = new Map();

/**
 * Completa el historial del chat con Evolution (ver arriba). `buscar(jid, cuantos)` se inyecta en
 * las pruebas y la batería; por defecto evolution.buscarMensajesDeChat, y sin EVOLUTION_APIKEY no se
 * pide nada. Devuelve { agregadas } (cuántas líneas de Evolution quedaron en el historial), con
 * `omitido` (por qué no se pidió) o `error` (Evolution no contestó, o no filtró por chat). Nunca tira.
 */
function completar(chatId, opciones = {}) {
  if (enCurso.has(chatId)) return enCurso.get(chatId);
  const pedido = completarYa(chatId, opciones)
    .catch((e) => {
      console.error(`[contexto] ${chatId}: no pude completar el historial: ${e.message}`);
      return { agregadas: 0, error: e.message };
    })
    .finally(() => enCurso.delete(chatId));
  enCurso.set(chatId, pedido);
  return pedido;
}

async function completarYa(chatId, { buscar = null, ahora = Date.now(), esperaMs = ESPERA_MS } = {}) {
  const state = require('./state');
  const tiene = (id) => Object.prototype.hasOwnProperty.call(state.todos(), id);
  if (!tiene(chatId)) return { agregadas: 0, omitido: 'el chat no está en el estado' };
  const s = state.todos()[chatId];
  if ((s.historial || []).length >= state.LARGO_HISTORIAL) return { agregadas: 0, omitido: `ya tiene ${state.LARGO_HISTORIAL} líneas` };
  if (s.evolutionTraido) return { agregadas: 0, omitido: 'ya se trajo' };
  const falla = fallas.get(chatId);
  if (falla && ahora - falla < REINTENTO_MS) return { agregadas: 0, omitido: 'falló hace menos de 10 minutos' };
  const leer = buscar || (config.evolution.apikey ? (jid, n) => evolution.buscarMensajesDeChat(jid, n) : null);
  if (!leer) return { agregadas: 0, omitido: 'sin EVOLUTION_APIKEY' };

  const generacion = state.generacion(chatId);
  let registros;
  try {
    const lid = chatsViejos.lidDe(chatsViejos.digitos(chatId));
    registros = await conTope(traer(chatId, { buscar: leer, lid }), esperaMs);
  } catch (e) {
    fallas.set(chatId, Date.now());
    if (e instanceof NoFiltro) {
      console.warn(`[contexto] ${chatId}: ${e.message}: no uso ninguno`);
      return { agregadas: 0, error: 'Evolution no filtró por chat' };
    }
    console.warn(`[contexto] ${chatId}: Evolution no contestó (${e.message})`);
    return { agregadas: 0, error: `Evolution no contestó (${e.message})` };
  }
  // Un #reset mientras se esperaba: el chat ya no es el mismo (y preguntar lo volvería a crear).
  if (state.generacion(chatId) !== generacion || !tiene(chatId)) return { agregadas: 0, omitido: 'hubo un #reset' };
  fallas.delete(chatId);
  const actual = state.todos()[chatId];
  if (actual.evolutionTraido) return { agregadas: 0, omitido: 'ya se trajo' };
  const delBot = chatsViejos.idsDelBot();
  const esDelBot = (id) => delBot.has(id) || autoria.anotado(chatId, id);
  const historial = actual.historial || [];
  const nuevas = nuevasLineas(historial, lineasDe(registros, { esDelBot }), { ahora: Date.now() });
  const todas = [...historial, ...nuevas].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0)).slice(-state.LARGO_HISTORIAL);
  const persona = nuevas.filter((l) => l.humano && !MARCADOR.test(l.texto));
  state.completarHistorial(chatId, todas, { traido: Date.now(), persona });
  const agregadas = todas.filter((l) => l.evolution).length;
  if (agregadas) console.log(`[contexto] ${chatId}: sumé ${agregadas} línea(s) de Evolution al historial`);
  return { agregadas };
}

/** Para las pruebas: olvida las fallas y los pedidos en curso. */
function reiniciar() {
  fallas.clear();
  enCurso.clear();
}

module.exports = {
  completar,
  traerCrudo,
  traer,
  lineasDe,
  nuevasLineas,
  etiqueta,
  jidsDelChat,
  esDeEsteChat,
  reiniciar,
  NoFiltro,
  CUANTOS,
  ESPERA_MS,
  REINTENTO_MS,
};
