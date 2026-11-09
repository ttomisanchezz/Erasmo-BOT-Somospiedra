'use strict';
/**
 * Los avisos al grupo "Bot Erasmo" salen de 9 a 20 (AVISOS_HORA_DESDE / AVISOS_HORA_HASTA, hora de Argentina;
 * decisión de Tomás, 09/11/2026). Erasmo le contesta a los clientes las 24 h: esto es solo del grupo.
 *
 * Un aviso que se genera afuera de la franja NO sale: queda en una cola en estado.json (sobrevive a un reinicio)
 * y cuando abre la franja salen TODOS juntos, en un solo mensaje (si no entran en uno, en los mínimos
 * necesarios, numerados). Un aviso se saca de la cola recién después de que salió: si el envío falla, queda
 * para el barrido siguiente.
 *
 * Lo que se encola lo decide `evolution.avisarGrupo`: todo, salvo lo que sale con `{ inmediato: true }` (las
 * respuestas a un comando que alguien escribió ahora, el guardián de Evolution y el aviso de que el archivo de
 * estado estaba dañado). Tope de la cola: MAX_COLA (se descartan los más viejos, y se loguea).
 */
const config = require('./config');
const state = require('./state');
const { LARGO_MENSAJE } = require('./avisos-texto');

const ZONA = 'America/Argentina/Buenos_Aires';
const MAX_COLA = 200;
const BARRA = '━'.repeat(20);
const PARTES = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** La hora (0 a 23) de Argentina de ese momento. */
function horaArgentina(ts) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return Number(p.hour);
}

/** "09/11 23:15": cuándo se generó el aviso, en hora de Argentina. */
function cuando(ts) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** ¿Es hora de avisar? Desde `horaDesde` inclusive hasta `horaHasta` exclusive. Una franja vacía (desde >= hasta) no restringe nada. */
function enFranja(ts = Date.now(), { horaDesde, horaHasta } = config.avisos) {
  if (!(horaDesde < horaHasta)) return true;
  const h = horaArgentina(ts);
  return h >= horaDesde && h < horaHasta;
}

/** Deja el aviso en la cola. Devuelve cuántos hay esperando. */
function encolar(texto, ts = Date.now()) {
  const cola = [...state.colaAvisos(), { id: `${ts}-${Math.random().toString(36).slice(2, 8)}`, ts, texto: String(texto) }];
  while (cola.length > MAX_COLA) {
    const viejo = cola.shift();
    console.warn(`[avisos] la cola de avisos pasó el tope de ${MAX_COLA}: descarto el más viejo (${cuando(viejo.ts)})`);
  }
  state.guardarColaAvisos(cola);
  return cola.length;
}

/** Los avisos que esperan, del más viejo al más nuevo. */
const pendientes = () => state.colaAvisos();

/**
 * Los mensajes que salen cuando abre la franja: `[{ texto, ids }]`. Todos los avisos juntos en un mensaje si
 * entran en LARGO_MENSAJE; si no, en los mínimos, cada aviso entero en uno solo (uno que ya es más largo sale
 * igual: mejor largo que perdido). Cada mensaje lleva los ids de los avisos que contiene.
 */
function armarMensajes(items) {
  const bloque = (it) => `[${cuando(it.ts)}] ${it.texto}`;
  const grupos = [];
  let actual = [];
  const largo = (g) => g.map(bloque).join(`\n${BARRA}\n`).length + 80;
  for (const it of items) {
    if (actual.length && largo([...actual, it]) > LARGO_MENSAJE) {
      grupos.push(actual);
      actual = [];
    }
    actual.push(it);
  }
  if (actual.length) grupos.push(actual);
  return grupos.map((g, i) => {
    const cuenta = `${items.length} aviso${items.length === 1 ? '' : 's'}`;
    const titulo = grupos.length === 1 ? `🌙 ${cuenta} de afuera de horario` : `🌙 ${cuenta} de afuera de horario (${i + 1}/${grupos.length})`;
    return { texto: [titulo, BARRA, g.map(bloque).join(`\n${BARRA}\n`)].join('\n'), ids: g.map((x) => x.id) };
  });
}

/**
 * Si abrió la franja y hay avisos esperando, los manda con `enviar(texto)` (que devuelve lo de
 * `evolution.avisarGrupo`: `bloqueado` es que no salió). Saca de la cola lo que salió, después de que salió.
 * Devuelve cuántos avisos salieron. Nunca tira.
 */
async function vaciar(enviar, ahora = Date.now()) {
  if (!enFranja(ahora)) return 0;
  const items = pendientes();
  if (!items.length) return 0;
  let salieron = 0;
  for (const m of armarMensajes(items)) {
    let r;
    try {
      r = await enviar(m.texto);
    } catch (e) {
      r = { bloqueado: true, motivo: (e && e.message) || String(e) };
    }
    if (!r || r.bloqueado) {
      console.log(`[avisos] los avisos de afuera de horario no salieron (${(r && r.motivo) || 'sin respuesta'}): quedan para el próximo barrido`);
      break;
    }
    const salidos = new Set(m.ids);
    state.guardarColaAvisos(state.colaAvisos().filter((x) => !salidos.has(x.id)));
    salieron += m.ids.length;
  }
  return salieron;
}

module.exports = { enFranja, encolar, pendientes, armarMensajes, vaciar, horaArgentina, MAX_COLA };
