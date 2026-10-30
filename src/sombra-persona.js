'use strict';
/**
 * Sonnet en sombra donde atiende una persona (decisión de Tomás del 03/10/2026, por 7 días).
 *
 * En vivo, la línea de un cliente que llega con una persona atendiendo (los
 * SILENCIO_TRAS_HUMANO_MIN después de que escribió alguien de la cuenta, o #pausa) o con el chat
 * escalado y callado no entra a ninguna tanda: nadie piensa nada. Con
 * CEREBRO_SOMBRA_PERSONA_HASTA=AAAA-MM-DD (hasta ese día de Argentina inclusive), esas líneas se
 * juntan igual en una tanda de sombra (con la misma espera que una tanda normal) y Sonnet piensa
 * qué contestaría, para compararlo después con lo que contestó la persona. También las de una
 * tanda que se canceló porque una persona contestó (o el chat escaló) mientras esperaba.
 *
 * NO SE MANDA NADA, ni al cliente ni al grupo, y no se toca el estado del chat (salvo el historial,
 * que antes de pensar se completa con Evolution como en vivo: bloque Ninjo 1b, src/contexto.js): queda
 * solo en el registro de aprendizaje como `propuesta-sonnet`, con `conPersona` ('persona' o
 * 'escalado'), las `lineas` (ids de WhatsApp) y lo de siempre (mensajes, escalar, motivo, guardia,
 * uso, usd…).
 *
 * - Sonnet ve el chat solo hasta la última línea del cliente de esa tanda (`hasta` en
 *   cerebro.pensar): lo que contestó la persona después no entra al pedido.
 * - Tope por día de Argentina (CEREBRO_SOMBRA_PERSONA_TOPE_USD, 1,5): pasado, no piensa más hasta
 *   el otro día. En memoria: un reinicio lo pone en 0. Es para no comerse el saldo del bot en vivo.
 * - Solo las líneas con texto (un audio cuenta si ya se transcribió y se entendió).
 * - Con CEREBRO_MODO=apagado o en MODO_ESCUCHA, nada (en escucha el bot ya piensa en esos chats).
 * - Si el chat se reinicia (#reset) antes de pensar, no piensa.
 * - Con el bot apagado (#apagar, src/interruptor.js), tampoco.
 */
const crypto = require('crypto');
const config = require('./config');
const state = require('./state');
const cerebro = require('./cerebro');
const contexto = require('./contexto');
const aprendizaje = require('./aprendizaje');
const interruptor = require('./interruptor');
// evolution no carga state al requerirse (lo pide adentro de esContactoPersonal), así que no suma nada al arranque.
const evolution = require('./evolution');

const DIA_ARGENTINA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});
const diaDe = (ts) => DIA_ARGENTINA.format(ts);

// chatId → { lineas: [{ linea, id }], motivo, nombre, generacion, timer }
const esperando = new Map();
let gasto = { dia: null, usd: 0, pensadas: 0, topeAvisado: false };

/**
 * ¿Está prendida ahora? Con la fecha bien escrita, sin vencer, el cerebro prendido, fuera de escucha y
 * con el bot prendido (#apagar / #prender).
 */
function activa(ahora = Date.now()) {
  const hasta = config.cerebro.sombraPersonaHasta;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hasta || '')) return false;
  if (config.cerebro.modo === 'apagado' || config.modoEscucha) return false;
  if (!interruptor.prendida()) return false;
  return diaDe(ahora) <= hasta;
}

function delDia(ahora = Date.now()) {
  const hoy = diaDe(ahora);
  if (gasto.dia !== hoy) gasto = { dia: hoy, usd: 0, pensadas: 0, topeAvisado: false };
  return gasto;
}

/** Para /salud: si está prendida, hasta cuándo, y lo de hoy. */
function resumen(ahora = Date.now()) {
  const g = delDia(ahora);
  return {
    activa: activa(ahora),
    hasta: config.cerebro.sombraPersonaHasta || null,
    pensadasHoy: g.pensadas,
    usdHoy: Math.round(g.usd * 1e6) / 1e6,
    topeUsd: config.cerebro.sombraPersonaTopeUsd,
  };
}

const textoDe = (l) => (l && !l.foto && !l.pedido && typeof l.texto === 'string' ? l.texto.trim() : '');
const SIN_TEXTO = /^\[audio( que no se entendio)?\]$/i;

/**
 * Una o más líneas del cliente en un chat que atiende una persona. `lineas`: [{ linea, id }], con
 * la línea del historial (la misma referencia: si es un audio, al pensar ya tiene la
 * transcripción) y su id de WhatsApp. `motivo`: 'persona' o 'escalado'. `espera`: ms hasta pensar;
 * si llega otra línea antes, se suma y la espera vuelve a arrancar. Devuelve si la anotó. Nunca
 * tira: se llama justo antes de los `return` de `procesar`, y un error acá no puede cambiar lo que
 * hace el bot en vivo.
 */
function anotar(chatId, nombre, lineas, motivo, espera) {
  try {
    return anotarYa(chatId, nombre, lineas, motivo, espera);
  } catch (err) {
    console.error('[sombra-persona] no pude anotar:', err.message);
    return false;
  }
}

function anotarYa(chatId, nombre, lineas, motivo, espera) {
  if (!activa() || !lineas || !lineas.length) return false;
  let e = esperando.get(chatId);
  if (!e) {
    e = { lineas: [], motivo, nombre: nombre || '', generacion: state.generacion(chatId), timer: null };
    esperando.set(chatId, e);
  }
  e.lineas.push(...lineas);
  e.motivo = motivo;
  if (nombre) e.nombre = nombre;
  if (e.timer) clearTimeout(e.timer);
  e.timer = setTimeout(() => {
    if (esperando.get(chatId) === e) esperando.delete(chatId);
    pensar(chatId, e).catch((err) => console.error('[sombra-persona] no pude pensar:', err.message));
  }, Math.max(0, espera || 0));
  return true;
}

async function pensar(chatId, e) {
  if (!activa()) return null;
  // Un #excluir (o CONTACTOS_PERSONALES) mientras esperaba la sombra: el chat se ignora entero, no se lee ni se piensa.
  if (evolution.esContactoPersonal(chatId)) return null;
  // Un #reset en el medio: el chat ya no es el mismo (y preguntar lo volvería a crear vacío).
  if (state.generacion(chatId) !== e.generacion || !Object.prototype.hasOwnProperty.call(state.todos(), chatId)) return null;
  const conTexto = e.lineas.filter(({ linea }) => {
    const t = textoDe(linea);
    return t && !SIN_TEXTO.test(t);
  });
  if (!conTexto.length) return null;
  const g = delDia();
  const tope = config.cerebro.sombraPersonaTopeUsd;
  if (g.usd >= tope) {
    if (!g.topeAvisado) {
      g.topeAvisado = true;
      console.log(`[sombra-persona] llegó al tope del día (US$${tope}): no pienso más hasta mañana`);
    }
    return null;
  }
  const hasta = Math.max(...conTexto.map(({ linea }) => Number(linea.ts) || 0)) || Date.now();
  const texto = conTexto.map(({ linea }) => textoDe(linea)).join('\n');
  const tanda = crypto.randomUUID();
  // Bloque Ninjo 1b: el historial se completa con Evolution antes de pensar, como en vivo (es lo único
  // del estado que toca). Si en el medio hubo un #reset, no piensa.
  const ctx = await contexto.completar(chatId);
  if (state.generacion(chatId) !== e.generacion || !Object.prototype.hasOwnProperty.call(state.todos(), chatId)) return null;
  // Lo excluyeron mientras se completaba el contexto.
  if (evolution.esContactoPersonal(chatId)) return null;
  const r = await cerebro.pensar({ chatId, mensaje: texto, nombre: e.nombre, ahora: hasta, hasta });
  g.usd += Number(r.usd) || 0;
  g.pensadas++;
  const comun = {
    tanda,
    conPersona: e.motivo,
    lineas: conTexto.map(({ id }) => id || null),
    modelo: config.cerebro.modelo,
    // Bloque Ninjo 2: la versión de cerebro-reglas.md, como en la propuesta en vivo.
    sonnet: { reglas: cerebro.REGLAS_HASH },
    uso: r.uso || null,
    usd: r.usd || 0,
    ms: r.ms == null ? null : r.ms,
    ...(r.leidos ? { leidos: r.leidos } : {}),
    ...(ctx.error ? { contexto: /filtró/.test(ctx.error) ? 'evolution no filtró por chat' : 'evolution no contestó' } : {}),
  };
  if (r.error) {
    aprendizaje.anotar('propuesta-sonnet', chatId, { ...comun, error: r.error });
    console.warn(`[sombra-persona] ${chatId}: Sonnet no pudo pensar: ${r.error}`);
    return r;
  }
  aprendizaje.anotar('propuesta-sonnet', chatId, {
    ...comun,
    mensajes: r.mensajes,
    escalar: r.escalar,
    motivo: r.motivo,
    guardia: r.guardia,
    montos: r.montosDeHerramientas,
    ...(r.frenados ? { frenados: r.frenados } : {}),
    ...(r.corregida ? { corregida: r.corregida } : {}),
  });
  console.log(
    `[sombra-persona] ${chatId} (${e.motivo}): Sonnet ${r.escalar ? `escalaría (${r.motivo})` : `contestaría ${r.mensajes.length} mensaje(s)`} · US$${r.usd}`
  );
  return r;
}

/** Para las pruebas: lo que está esperando y el gasto del día, a cero. */
function reiniciar() {
  for (const e of esperando.values()) if (e.timer) clearTimeout(e.timer);
  esperando.clear();
  gasto = { dia: null, usd: 0, pensadas: 0, topeAvisado: false };
}

module.exports = { activa, anotar, resumen, reiniciar };
