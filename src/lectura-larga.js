'use strict';
/**
 * Lo que hay en un chat, MÁS LARGO y SIN ESCRIBIR en el estado (tandas y reactivación, 18/11/2026).
 *
 * `contexto.completar` no sirve para esto: le pide a Evolution solo 30 mensajes, no hace nada si el chat ya tiene 30
 * líneas o `evolutionTraido`, y lo que trae lo guarda en el historial (que tiene tope de 30). Acá se lee más (hasta
 * `cuantos`, 150 por defecto), se une con el historial guardado sin repetir y no se toca el estado: es solo una lectura.
 *
 * `leerLargo(chatId)` devuelve { lineas, evolution, agregadas, ultimaEvolution, error }:
 *   - `lineas`: las del historial guardado más las de Evolution, de la más vieja a la más nueva;
 *   - `evolution`: true si Evolution contestó y filtró por chat. Con false, `lineas` es solo el historial guardado y
 *     `error` dice por qué: quien llama decide qué hacer (la tanda no le pregunta a Sonnet con una lectura a medias);
 *   - `ultimaEvolution`: la línea más nueva que trajo Evolution, para ver si hay algo más nuevo que lo guardado.
 * Nunca tira. `buscar(jid, cuantos)` se inyecta en las pruebas.
 */
const config = require('./config');
const evolution = require('./evolution');
const chatsViejos = require('./chats-viejos');
const autoria = require('./autoria');
const contexto = require('./contexto');

const ESPERA_MS = 12000;

/** Un tope de tiempo para una promesa (la lectura de Evolution ya tiene el suyo: este es el último recurso). */
function conTope(promesa, ms) {
  let reloj;
  const vencida = new Promise((_, rechazar) => {
    reloj = setTimeout(() => rechazar(new Error(`tardó más de ${Math.round(ms / 1000)} s`)), ms);
    if (reloj.unref) reloj.unref();
  });
  return Promise.race([promesa, vencida]).finally(() => clearTimeout(reloj));
}

async function leerLargo(chatId, { cuantos = 150, buscar = null, esperaMs = ESPERA_MS } = {}) {
  const state = require('./state');
  const guardado = ((state.todos()[chatId] || {}).historial || []).slice();
  const base = { lineas: guardado, evolution: false, agregadas: 0, ultimaEvolution: null, error: null };
  const leer = buscar || (config.evolution.apikey ? (jid, n) => evolution.buscarMensajesDeChat(jid, n) : null);
  if (!leer) return { ...base, error: 'sin EVOLUTION_APIKEY' };
  let registros;
  try {
    const lid = chatsViejos.lidDe(chatsViejos.digitos(chatId));
    registros = await conTope(contexto.traer(chatId, { buscar: leer, lid, cuantos }), esperaMs);
  } catch (e) {
    if (e instanceof contexto.NoFiltro) return { ...base, error: 'Evolution no filtró por chat' };
    return { ...base, error: `Evolution no contestó (${e.message})` };
  }
  const delBot = chatsViejos.idsDelBot();
  const esDelBot = (id) => delBot.has(id) || autoria.anotado(chatId, id);
  const deEvolution = contexto.lineasDe(registros, { esDelBot });
  const nuevas = contexto.nuevasLineas(guardado, deEvolution, { sinLimite: true });
  const lineas = [...guardado, ...nuevas].sort((a, b) => (Number(a.ts) || 0) - (Number(b.ts) || 0));
  return { lineas, evolution: true, agregadas: nuevas.length, ultimaEvolution: deEvolution[deEvolution.length - 1] || null, error: null };
}

module.exports = { leerLargo, ESPERA_MS };
