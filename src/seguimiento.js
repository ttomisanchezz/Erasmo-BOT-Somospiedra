'use strict';
/**
 * El seguimiento de Erasmo (09/11/2026): "volver a contactar al cliente el día X", según lo que dijo el cliente.
 *
 *  - Erasmo lo anota con la herramienta `agendar_seguimiento` (fecha y motivo). Nada se hace en el acto: index.js
 *    lo guarda DESPUÉS de que salió la respuesta, en el estado del chat (`s.seguimiento`), y si el turno terminó
 *    en `escalar` o se cortó, no se anota.
 *  - Ese día, cuando abre la franja de avisos (9, AVISOS_HORA_DESDE), sale UN aviso al grupo: quién es, qué pidió y
 *    por qué volver. Un solo aviso por seguimiento; queda marcado (`avisado`) cuando salió.
 *  - NUNCA le escribe al cliente, y Erasmo nunca le promete al cliente que va a volver a escribir (regla heredada).
 *  - No es `recordatorios.js`: ese es de una persona (`#recordar`), uno por chat, y suena cada hora hasta `#hecho`;
 *    mezclarlos pisaría el recordatorio de una persona con el seguimiento de Erasmo.
 */
const state = require('./state');
const evolution = require('./evolution');
const avisosCola = require('./avisos-cola');
const ficha = require('./ficha');
const { esTelefono } = require('./avisos-texto');

const ZONA = 'America/Argentina/Buenos_Aires';
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const hoy = (ts) => DIA.format(ts);

/** 'AAAA-MM-DD' -> 'DD/MM'. */
const diaMes = (f) => `${f.slice(8, 10)}/${f.slice(5, 7)}`;

/**
 * Anota el seguimiento en el chat (uno por chat: uno nuevo reemplaza al anterior) y en su ficha. Lo llama
 * index.js cuando la respuesta ya salió.
 */
function anotar(chatId, { fecha, motivo }, ahora = Date.now()) {
  const s = state.obtener(chatId);
  state.actualizar(chatId, {
    seguimiento: { fecha, motivo, creado: ahora, avisado: false },
    ficha: { ...(s.ficha || {}), seguimiento: { fecha, motivo }, actualizado: ahora },
  });
}

/**
 * Los seguimientos que tienen que salir ahora: los de hoy o de días anteriores que todavía no avisaron, si la
 * franja de avisos está abierta, y que no son de un contacto personal o excluido. `[{ chatId, s }]`, del más viejo.
 */
function debenAvisar(ahora = Date.now()) {
  if (!avisosCola.enFranja(ahora)) return [];
  const dia = hoy(ahora);
  return Object.entries(state.todos())
    .filter(([chatId, s]) => s && s.seguimiento && !s.seguimiento.avisado && s.seguimiento.fecha <= dia && !evolution.esContactoPersonal(chatId))
    .map(([chatId, s]) => ({ chatId, s }))
    .sort((a, b) => a.s.seguimiento.fecha.localeCompare(b.s.seguimiento.fecha));
}

/** El aviso al grupo de un seguimiento. */
function textoDelAviso(chatId, s, ahora = Date.now()) {
  const seg = s.seguimiento;
  const f = s.ficha || {};
  const numero = String(chatId).split('@')[0];
  const nombre = String(s.nombre || '').trim() || (esTelefono(chatId) ? numero : 'sin nombre');
  const atrasado = seg.fecha < hoy(ahora) ? ` (era para el ${diaMes(seg.fecha)})` : '';
  return [
    `📅 Hoy toca volver a contactar a ${nombre}${atrasado}`,
    `Por qué: ${seg.motivo}`,
    `Qué pidió: ${f.pidio ? ficha.comoTexto({ pidio: f.pidio }).replace(/^pidió /, '') : f.ultimoMensaje || 'no quedó anotado'}`,
    ...(f.anuncio ? [`Vino del anuncio: ${f.anuncio.titulo || f.anuncio.id}`] : []),
    esTelefono(chatId) ? `💬 https://wa.me/${numero}` : `⚠️ sin link: el chat no tiene número (${chatId})`,
  ].join('\n');
}

/**
 * Manda los avisos que tocan, de a uno, con `avisarGrupo` (sale solo si no volvió `bloqueado`) y marca como
 * avisado después de que salió. Devuelve cuántos salieron. Nunca tira.
 */
async function avisarLosDeHoy(ahora = Date.now()) {
  let salieron = 0;
  for (const { chatId, s } of debenAvisar(ahora)) {
    let r;
    try {
      r = await evolution.avisarGrupo(textoDelAviso(chatId, s, ahora));
    } catch (e) {
      r = { bloqueado: true, motivo: (e && e.message) || String(e) };
    }
    if (!r || r.bloqueado) {
      console.log(`[seguimiento] el aviso de ${chatId} no salió (${(r && r.motivo) || 'sin respuesta'}): queda para el próximo barrido`);
      continue;
    }
    try {
      state.actualizar(chatId, { seguimiento: { ...s.seguimiento, avisado: true, avisadoEn: ahora } });
    } catch (e) {
      // Un #reset en el medio: el chat ya no existe, no hay nada que marcar.
      if (!(e instanceof state.ChatReiniciado)) throw e;
    }
    salieron++;
    console.log(`[seguimiento] aviso al grupo: hoy toca volver a contactar a ${chatId} (${s.seguimiento.fecha})`);
  }
  return salieron;
}

module.exports = { anotar, debenAvisar, textoDelAviso, avisarLosDeHoy };
