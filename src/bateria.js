'use strict';
/**
 * #bateria (01/10/2026, decisión de Tomás): qué lista de usados usa el bot.
 *
 * En la planilla hay dos pestañas con la misma forma: LISTA (los usados al 100% y todos los
 * sellados) y `LISTA 85-93` (solo los usados, con sus precios y entregas mínimas). Desde el grupo
 * interno, y solo desde ahí (como #sinstock):
 *
 *  - `#bateria 85-93` (también `#batería 85-93`, `#bateria 85 93`, `#bateria 85 a 93`): los
 *    usados salen de la pestaña `LISTA 85-93`. Cada fila de LISTA con el mismo ID se reemplaza
 *    por la suya, y una fila suya con un ID que no está en LISTA también entra; los sellados y lo
 *    demás siguen de LISTA (sheets.js). Antes de cambiar se lee la pestaña: si no existe o no
 *    tiene filas con modelo, contesta por qué y no cambia nada. Vale para cualquier `X-Y`.
 *  - `#bateria 100`: todo de LISTA, como siempre. Sin ningún #bateria mandado, también.
 *  - `#bateria` solo: contesta cuál está activa.
 *
 * La elección queda en el estado (`state.listaBateria`, bajo la clave interna): sobrevive a un
 * reinicio, y al cargar este módulo se le pasa a sheets.js. /salud la muestra.
 */
const sheets = require('./sheets');
const state = require('./state');

/** ¿Empieza con #bateria? Como los demás comandos, solo al principio del mensaje. */
function comando(texto) {
  const m = String(texto || '').trim().match(/^#bater[ií]a(?![\p{L}\p{N}_])([\s\S]*)$/iu);
  return m ? { argumento: m[1].trim() } : null;
}

/**
 * Lo que vino después de #bateria: `{ consulta }` si no vino nada, `{ rango: '85-93' }` para la
 * pestaña `LISTA 85-93`, `{ rango: null }` para LISTA ("100"), `{ invalido }` para lo demás.
 */
function leerArgumento(argumento) {
  const a = String(argumento || '').replace(/%/g, '').trim();
  if (!a) return { consulta: true };
  if (a === '100') return { rango: null };
  const m = a.match(/^(\d{1,3})\s*(?:-|–|a|\s)\s*(\d{1,3})$/i);
  return m ? { rango: `${m[1]}-${m[2]}` } : { invalido: true };
}

const COMO_SE_USA =
  'Para cambiar: #bateria 85-93 (los usados de la pestaña LISTA 85-93; los sellados y el resto, de LISTA) o #bateria 100 (todo de LISTA).';

function cualEs(rango) {
  return rango ? `LISTA ${rango}` : 'LISTA (al 100%)';
}

function elegir(rango) {
  state.guardarListaBateria(rango);
  sheets.usarListaBateria(rango);
}

/** #bateria escrito en el grupo interno. Devuelve lo que se le contesta al grupo. */
async function desdeGrupo({ argumento }) {
  const actual = sheets.listaBateriaActiva();
  const pedido = leerArgumento(argumento);
  if (pedido.consulta) {
    const ahora = actual ? `LISTA ${actual}. Sellados y el resto, de LISTA.` : 'LISTA (al 100%).';
    return `🔋 Ahora: usados con ${ahora}\n${COMO_SE_USA}`;
  }
  if (pedido.invalido) {
    return `❓ No entendí "#bateria ${argumento}". No cambié nada: sigo con ${cualEs(actual)}.\n${COMO_SE_USA}`;
  }
  if (!pedido.rango) {
    elegir(null);
    return '🔋 Usados con LISTA (al 100%).';
  }
  const prueba = await sheets.probarListaBateria(pedido.rango);
  if (!prueba.ok) {
    const motivo = prueba.motivo.charAt(0).toUpperCase() + prueba.motivo.slice(1);
    return `❓ ${motivo}. No cambié nada: sigo con ${cualEs(actual)}.`;
  }
  elegir(pedido.rango);
  const modelos = `${prueba.filas} ${prueba.filas === 1 ? 'modelo' : 'modelos'}`;
  return `🔋 Usados con LISTA ${pedido.rango} (${modelos}). Sellados y el resto, de LISTA.`;
}

/** Para /salud: "LISTA 85-93" o "LISTA". */
function activa() {
  const rango = sheets.listaBateriaActiva();
  return rango ? `LISTA ${rango}` : 'LISTA';
}

// La que quedó elegida antes de reiniciar.
sheets.usarListaBateria(state.listaBateria());

module.exports = { comando, leerArgumento, desdeGrupo, activa };
