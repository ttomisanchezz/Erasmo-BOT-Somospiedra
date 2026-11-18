'use strict';
/**
 * Qué chats pueden entrar a una tanda de sin contestar (tandas.js) o a la reactivación (reactivacion.js): las
 * exclusiones son las MISMAS en los dos (18/11/2026), en un solo lugar. Solo lee el estado; no escribe nada.
 *
 * Un chat NO cuenta si es: de otra cosa que una persona (grupo, difusión, `@lid`, algo que no es un teléfono), un
 * contacto personal o un excluido (#excluir), un tester, uno pausado, uno escalado que calla, uno marcado
 * #vendido / #perdido, o uno al que se le sacó Sonnet con #bot (`atiendeSonnet: false`: mandarle algo y marcarlo
 * `atiendeSonnet: true` desharía una decisión explícita de la cuenta).
 * El interruptor general (#apagar) y los modos los mira quien llama: valen para todo el envío, no para un chat.
 */
const config = require('./config');
const evolution = require('./evolution');
const control = require('./control');
const { esTelefono } = require('./avisos-texto');

/** Por qué este chat no cuenta, o null si cuenta. `s` es su estado guardado. */
function motivoQueNoCuenta(chatId, s) {
  if (!String(chatId).endsWith('@s.whatsapp.net') || !esTelefono(chatId)) return 'no es el chat de una persona';
  if (!s || typeof s !== 'object') return 'no hay estado del chat';
  const personal = evolution.motivoContactoPersonal(chatId);
  if (personal) return personal === 'excluido' ? 'está excluido (#excluir)' : 'es un contacto personal';
  if (evolution.estaEnLaLista(chatId, config.numerosTester)) return 'es un tester';
  if (s.pausado) return 'está pausado';
  if (control.callado(s)) return 'está escalado y callado';
  if (s.resultado && s.resultado.tipo) return `está marcado ${s.resultado.tipo === 'vendido' ? 'como venta (#vendido)' : 'como perdido (#perdido)'}`;
  if (s.atiendeSonnet === false) return 'se le sacó Sonnet (#bot)';
  return null;
}

/** El último mensaje de la lista (`historial`), o null. */
const ultimaLinea = (historial) => (Array.isArray(historial) && historial.length ? historial[historial.length - 1] : null);

/** `fn` sobre cada elemento con hasta `n` a la vez; devuelve los resultados en el mismo orden. */
async function conLimite(lista, n, fn) {
  const out = new Array(lista.length);
  let i = 0;
  const obreros = Array.from({ length: Math.min(n, lista.length) }, async () => {
    while (i < lista.length) {
      const mio = i++;
      out[mio] = await fn(lista[mio], mio);
    }
  });
  await Promise.all(obreros);
  return out;
}

module.exports = { motivoQueNoCuenta, ultimaLinea, conLimite };
