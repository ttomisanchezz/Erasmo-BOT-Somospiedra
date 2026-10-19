'use strict';
/**
 * Los comandos del cerebro Sonnet en el grupo interno (fase 2, decisiones de Tomás del 02/10/2026).
 * Solo desde la cuenta del negocio (index.js los mira en el grupo con `fromMe`), y
 * con el número del cliente como #sigue: con o sin 549, o el link wa.me (ventas.js elige el chat).
 *
 *   #sonnet <número>     qué le contestaría Sonnet a ese chat AHORA: lee las últimas 30 líneas y las
 *                        de una persona, y contesta EN EL GRUPO, sin mandarle nada al cliente y sin
 *                        tocar el estado (salvo el historial, que antes se completa con Evolution
 *                        como en vivo: bloque Ninjo 1b). Con cualquier modo menos `apagado`.
 *   #comparar <número>   las últimas 3 tandas del chat según el registro de aprendizaje: lo que
 *                        escribió el cliente, lo que contestó Sonnet o una persona, y lo que propuso
 *                        Sonnet en sombra (`propuesta-sonnet` con el mismo `tanda`).
 *   #bot <número>        ese chat no lo atiende Sonnet: nadie contesta y Sonnet queda en sombra
 *                        (`atiendeSonnet: false`; en Piedra no hay "bot de siempre").
 *   #sonnet-si <número>  ese chat lo atiende Sonnet (`atiendeSonnet: true`, con la fecha).
 *
 * No escribe en el registro de aprendizaje ni en el estado, salvo #bot y #sonnet-si (la marca).
 */
const config = require('./config');
const state = require('./state');
const cerebro = require('./cerebro');
const contexto = require('./contexto');
const aprendizaje = require('./aprendizaje');
const ventas = require('./ventas');
const { quien } = require('./recordatorios');

const COMO_SE_USA =
  'En el grupo, con el número del cliente (sirve el wa.me):\n' +
  '#sonnet 5492990000000: qué le contestaría Sonnet ahora (no le manda nada)\n' +
  '#comparar 5492990000000: las últimas 3 tandas, con lo que propuso Sonnet\n' +
  '#bot 5492990000000: no le contesta Sonnet (queda en sombra)\n' +
  '#sonnet-si 5492990000000: lo atiende Sonnet';

/**
 * ¿#sonnet, #comparar, #bot o #sonnet-si? Solo si el mensaje EMPIEZA con el comando (los avisos del
 * bot vuelven por el webhook). `numero`: los dígitos que vengan después ('' si no hay).
 */
function comando(texto) {
  const m = String(texto || '')
    .trim()
    .match(/^#(sonnet-si|sonnet|comparar|bot)(?![\p{L}\p{N}_-])([\s\S]*)$/iu);
  return m ? { tipo: m[1].toLowerCase(), numero: m[2].replace(/\D/g, '') } : null;
}

const link = (chatId) => `💬 https://wa.me/${chatId.split('@')[0]}`;
const MAX_CITA = 300;
const cita = (t) => `"${cerebro.recorte(t, MAX_CITA)}"`;

/** "02/10 15:30", hora de Neuquén (rellenada a mano: Intl sin año no rellena el día). */
const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function cuando(ts) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dos = (v) => String(v).padStart(2, '0');
  return `${dos(p.day)}/${dos(p.month)} ${dos(p.hour)}:${dos(p.minute)}`;
}

/** Las últimas líneas seguidas del cliente: lo que Sonnet contestaría ahora. '' si nunca escribió. */
function ultimaTandaDelCliente(historial) {
  const h = historial || [];
  let fin = h.length - 1;
  while (fin >= 0 && h[fin].quien !== 'cliente') fin--;
  if (fin < 0) return '';
  let inicio = fin;
  while (inicio > 0 && h[inicio - 1].quien === 'cliente') inicio--;
  return h
    .slice(inicio, fin + 1)
    .map((l) => l.texto)
    .join('\n');
}

/** #sonnet: lo que contestaría Sonnet ahora, en el grupo. No le manda nada a nadie más. */
async function queContestaria(chatId) {
  const s = state.obtener(chatId);
  const nombre = s.nombre || chatId.split('@')[0];
  if (config.cerebro.modo === 'apagado') {
    return `❓ Con CEREBRO_MODO=apagado no le pregunto nada a Sonnet. No gasté nada.\n${link(chatId)}`;
  }
  const mensaje = ultimaTandaDelCliente(s.historial);
  if (!mensaje) return `❓ ${quien(chatId, s)} no tiene ningún mensaje del cliente en el historial. No le pregunté nada a Sonnet.\n${link(chatId)}`;
  // Bloque Ninjo 1b: el historial se completa con Evolution, como antes de contestar en vivo.
  await contexto.completar(chatId);
  const r = await cerebro.pensar({ chatId, mensaje, nombre: s.nombre || '' });
  if (r.error) return `⚠️ Sonnet no respondió (${cerebro.recorte(r.error, 120)}). Al cliente no le mandé nada.\n${link(chatId)}`;
  const pie = `leí ${cerebro.leidosTexto(r.leidos)} · ${cerebro.usdTexto(r.usd)} · al cliente no le mandé nada\n${link(chatId)}`;
  if (r.escalar) {
    const frenado = r.guardia && r.frenados ? `\nQuería mandar:\n${r.frenados.map((m) => `• ${cerebro.recorte(m, MAX_CITA)}`).join('\n')}` : '';
    return `🧠 Escalaría: ${r.motivo}${frenado}\n${pie}`;
  }
  return `🧠 A ${nombre} le contestaría:\n${r.mensajes.map((m) => `• ${m}`).join('\n')}\n${pie}`;
}

/** Cómo salió la propuesta del bot, según su modo. */
function comoSalio(p) {
  return { vivo: 'le llegó', borrador: 'borrador, no salió', escucha: 'en escucha, no salió', 'fuera-de-lista': 'fuera de la lista, no salió' }[p.modo] || 'no se sabe si salió';
}

function lineaDeSonnet(e) {
  if (!e) return '🧠 Sonnet: no hay propuesta de Sonnet para esta tanda';
  if (e.error) return `🧠 Sonnet: no pudo pensar (${cerebro.recorte(e.error, 80)})`;
  if (e.escalar) return `🧠 Sonnet: escalaría (${cerebro.recorte(e.motivo, 150)})`;
  return `🧠 Sonnet: ${(e.mensajes || []).map(cita).join(' / ') || '(nada)'}`;
}

/** #comparar: las últimas 3 tandas del chat, del registro de aprendizaje. */
function comparar(chatId, eventos = aprendizaje.leerTodo()) {
  const s = state.obtener(chatId);
  // Por `clave` (bloque 7): los eventos de antes, sin clave, no entran. Sin sal no hay clave.
  const clave = aprendizaje.clave(chatId);
  const delChat = clave ? (eventos || []).filter((e) => e && e.v === 2 && e.clave === clave) : [];
  const propuestas = delChat
    .filter((e) => e.tipo === 'propuesta' && e.tanda)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(-3);
  if (!propuestas.length) return `❓ No hay tandas de ${quien(chatId, s)} en el registro de aprendizaje.\n${link(chatId)}`;
  const lineas = new Map(delChat.filter((e) => e.tipo === 'cliente').map((e) => [e.id, e]));
  const out = [`🔍 #comparar · ${quien(chatId, s)} · últimas ${propuestas.length} tanda${propuestas.length === 1 ? '' : 's'}`];
  propuestas.forEach((p, i) => {
    out.push('', `${i + 1}) ${cuando(p.ts)}`);
    const delCliente = (p.lineas || []).map((id) => lineas.get(id)).filter(Boolean);
    out.push(`👤 Cliente: ${delCliente.length ? delCliente.map((c) => cita(c.texto)).join(' / ') : '(no está en el registro)'}`);
    const quienContesto = p.fuente === 'sonnet' ? '🧠 Sonnet, en vivo' : '🤖 Nadie';
    if ((p.mensajes || []).length) out.push(`${quienContesto} (${comoSalio(p)}): ${p.mensajes.map(cita).join(' / ')}${p.escalar ? ` · y escaló: ${p.motivo}` : ''}`);
    else out.push(`${quienContesto}: ${p.escalar ? `escaló sin contestar (${cerebro.recorte(p.motivo, 150)})` : 'no contestó'}`);
    const persona = delChat.filter((e) => e.tipo === 'humano' && e.responde === p.tanda);
    if (persona.length) out.push(`🙋 Una persona: ${persona.map((h) => cita(h.texto)).join(' / ')}`);
    if (p.fuente !== 'sonnet') out.push(lineaDeSonnet(delChat.find((e) => e.tipo === 'propuesta-sonnet' && e.tanda === p.tanda)));
  });
  out.push('', link(chatId));
  return out.join('\n');
}

/** #bot y #sonnet-si: quién atiende el chat, a mano. */
function marcar(chatId, tipo, ahora = Date.now()) {
  const s = state.obtener(chatId);
  const sonnet = tipo === 'sonnet-si';
  if (s.atiendeSonnet === sonnet) {
    return `${sonnet ? '🧠' : '🤖'} ${quien(chatId, s)} ya ${sonnet ? 'lo atendía Sonnet' : 'estaba sin Sonnet'}, no cambié nada\n${link(chatId)}`;
  }
  state.actualizar(chatId, { atiendeSonnet: sonnet, atiendeSonnetDesde: sonnet ? ahora : null });
  if (!sonnet) {
    return `🤖 #bot · ${quien(chatId, s)} — Sonnet no le contesta${config.cerebro.modo === 'apagado' ? '' : ' (sigue en sombra)'}\n${link(chatId)}`;
  }
  const apagado = config.cerebro.modo === 'apagado' ? '\nOjo: con CEREBRO_MODO=apagado no le contesta nadie, hasta que lo prendas.' : '';
  return `🧠 #sonnet-si · ${quien(chatId, s)} — desde ahora le contesta Sonnet${apagado}\n${link(chatId)}`;
}

/** El comando ya leído (`comando`), con el chat del número. Devuelve el texto para el grupo. */
async function desdeGrupo({ tipo, numero }) {
  if (!numero) return `❓ Desde el grupo, #${tipo} va con el número del cliente, así sé qué chat es. No hice nada.\n\n${COMO_SE_USA}`;
  const elegido = ventas.elegirChatDesdeGrupo({
    comando: `#${tipo}`,
    numero,
    nada: 'No hice nada.',
    verbo: { sonnet: 'leer', comparar: 'comparar', bot: 'sacarle Sonnet', 'sonnet-si': 'pasar a Sonnet' }[tipo],
    comoSeUsa: COMO_SE_USA,
  });
  if (!elegido.chatId) return elegido.aviso;
  if (tipo === 'sonnet') return queContestaria(elegido.chatId);
  if (tipo === 'comparar') return comparar(elegido.chatId);
  return marcar(elegido.chatId, tipo);
}

module.exports = { comando, desdeGrupo, comparar, ultimaTandaDelCliente, COMO_SE_USA };
