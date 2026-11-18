'use strict';
/**
 * Tandas de chats SIN CONTESTAR (18/11/2026). Erasmo todavía no estaba en vivo cuando muchos clientes escribieron: hay
 * chats donde lo último es del cliente y nadie contestó. Desde el grupo interno, Tomás arma una propuesta de a 40, la
 * revisa y recién ahí la manda:
 *
 *   #tanda                    arma la propuesta: los próximos 40 chats sin contestar (del más reciente al más viejo, sin
 *                             los que ya estuvieron en una tanda mandada y sin los que no cuentan: `chats-elegibles.js`).
 *                             Por cada uno relee la conversación entera (`lectura-larga.js`, hasta 150 mensajes) y Sonnet
 *                             decide: `responder`, `no_contestar` (con el motivo) o `escalar`. NO MANDA NADA: deja
 *                             `data/tandas/<id>.md` (para leer) y `<id>.json` y avisa al grupo con un resumen.
 *   #tanda-ok <id>            manda la tanda (de a un chat por vez, con el ritmo humano y los candados de siempre).
 *   #tanda-ok <id> -4 -17     la manda sin esos números de orden (los del .md).
 *   #tanda-no <id>            la descarta.
 *
 * Reglas (todas con su test en test/tandas.test.js):
 *  - Una tanda a la vez: con otra sin mandar ni descartar (y sin vencer), `#tanda` da ❓. La propuesta vence a las 6 h.
 *  - Nada sale sin `#tanda-ok`. Con `CEREBRO_MODO=apagado` ni se arma (no gasta); para MANDAR hace falta `nuevos` o `todos`.
 *  - Antes de cada chat se re-chequea TODO (lo hace index.js, `mandarChat`): los candados de siempre, que el último mensaje
 *    del chat siga siendo el que se leyó (si escribió el cliente o una persona de la cuenta desde la propuesta, ese chat se
 *    saltea y se avisa) y que `leLlegaAlCliente` dé true (si no, se avisa y no sale).
 *  - Los chats que una tanda mandada atendió (respondidos, escalados, "no contestar", y los que se sacaron con -N) quedan
 *    marcados (`state.datosDeTandas().chats`) y no vuelven a una tanda; sobreviven a #reset. Una tanda descartada o vencida
 *    los libera: no se atendió a nadie. Los salteados al mandar tampoco se marcan (se les puede dar otra vuelta).
 *  - Los que Sonnet no pudo leer, o que no se pudieron releer en Evolution, quedan "salteados" (no se le pregunta a Sonnet
 *    con una lectura a medias, ni se escala por una falla nuestra).
 *
 * Lo que se manda lo hace index.js: este módulo solo elige, arma, guarda y lleva la cuenta. Los textos que salen al grupo
 * nunca empiezan con "#": el bot oye sus propios mensajes del grupo y un comando solo cuenta al principio del mensaje.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const evolution = require('./evolution');
const interruptor = require('./interruptor');
const cerebro = require('./cerebro');
const contexto = require('./contexto');
const lectura = require('./lectura-larga');
const salida = require('./salida');
const { motivoQueNoCuenta, ultimaLinea, conLimite } = require('./chats-elegibles');

const HORA_MS = 60 * 60 * 1000;
const DIA_MS = 24 * HORA_MS;
/** Cuántos chats se le preguntan a Sonnet a la vez al armar. */
const CONCURRENCIA = 4;
/** Los modos de `CEREBRO_MODO` con los que una tanda puede MANDAR (armarla se puede con cualquiera menos `apagado`). */
const MODOS_QUE_MANDAN = ['nuevos', 'todos'];

const COMO_SE_USA =
  'Tandas de chats sin contestar (en el grupo):\n' +
  '#tanda: arma una propuesta de 40 chats (no manda nada)\n' +
  '#tanda-ok 3: manda la tanda 3\n' +
  '#tanda-ok 3 -4 -17: la manda sin los números 4 y 17\n' +
  '#tanda-no 3: la descarta';

// ---------------------------------------------------------------------------
// El comando
// ---------------------------------------------------------------------------

/**
 * ¿#tanda, #tanda-ok o #tanda-no? Solo si el mensaje EMPIEZA con el comando ('#tandas' o '#tanda-oks' no cuentan; los
 * avisos del bot vuelven por el webhook como mensajes propios y nombran estos comandos en el medio). Devuelve
 * { tipo, id, omitir, problema }: `id` es el número de la tanda (null si no vino), `omitir` los números de orden de
 * -N (solo con #tanda-ok), `problema` por qué no se entendió (quien llama contesta cómo se usa y no hace nada).
 */
function comando(texto) {
  const m = String(texto || '')
    .trim()
    .match(/^#(tanda-ok|tanda-no|tanda)(?![\p{L}\p{N}_-])([\s\S]*)$/iu);
  if (!m) return null;
  const tipo = m[1].toLowerCase();
  const fichas = m[2].trim().split(/\s+/).filter(Boolean);
  const salida_ = { tipo, id: null, omitir: [], problema: null };
  if (tipo === 'tanda') {
    if (fichas.length) salida_.problema = '#tanda va sin nada más';
    return salida_;
  }
  if (!fichas.length || !/^\d+$/.test(fichas[0])) {
    salida_.problema = `#${tipo} va con el número de la tanda`;
    return salida_;
  }
  salida_.id = parseInt(fichas[0], 10);
  for (const f of fichas.slice(1)) {
    const n = f.match(/^-(\d+)$/);
    if (tipo === 'tanda-ok' && n) salida_.omitir.push(parseInt(n[1], 10));
    else {
      salida_.problema = tipo === 'tanda-ok' ? `no entendí "${f}": para sacar un chat va -N (por ejemplo -4)` : `#tanda-no va solo con el número de la tanda`;
      break;
    }
  }
  return salida_;
}

// ---------------------------------------------------------------------------
// Archivos
// ---------------------------------------------------------------------------
const rutaJson = (id) => path.join(config.tandas.dir, `${id}.json`);
const rutaMd = (id) => path.join(config.tandas.dir, `${id}.md`);

/** La propuesta guardada, o null si no está o no se puede leer. */
function leerTanda(id) {
  try {
    const t = JSON.parse(fs.readFileSync(rutaJson(id), 'utf8'));
    return t && typeof t === 'object' && Array.isArray(t.chats) ? t : null;
  } catch {
    return null;
  }
}

/**
 * Como `guardarTanda`, pero sin tirar: en medio de un envío, un disco que falla no puede cortar la tanda ni dejarla
 * trabada (lo que ya salió quedó anotado en el estado). `t.sinArchivo` lo dice en el resumen final.
 */
function guardarSeguro(t) {
  try {
    guardarTanda(t);
    return true;
  } catch (e) {
    console.error(`[tandas] no pude guardar el archivo de la tanda ${t.id}:`, e.message);
    t.sinArchivo = true;
    return false;
  }
}

/** Guarda el .json (con un archivo temporal, así un corte no deja uno a medias) y el .md. */
function guardarTanda(t) {
  fs.mkdirSync(config.tandas.dir, { recursive: true });
  const tmp = rutaJson(t.id) + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(t, null, 2));
  fs.renameSync(tmp, rutaJson(t.id));
  fs.writeFileSync(rutaMd(t.id), comoMarkdown(t));
}

// ---------------------------------------------------------------------------
// Texto
// ---------------------------------------------------------------------------
const ultimos4 = (chatId) => `…${String(chatId).split('@')[0].replace(/\D/g, '').slice(-4)}`;
const link = (chatId) => `https://wa.me/${String(chatId).split('@')[0]}`;
const recorte = (t, n) => cerebro.recorte(t, n);

const FECHA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const fechaHora = (ts) => FECHA.format(new Date(ts));
const HORA = new Intl.DateTimeFormat('es-AR', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });

/** "5 días", "7 h", "40 min". */
function hace(ts, ahora) {
  const min = Math.max(0, Math.round((ahora - ts) / 60000));
  if (min < 60) return `${min} min`;
  const h = Math.round(min / 60);
  if (h < 48) return `${h} h`;
  return `${Math.round(h / 24)} días`;
}

const ACCION = { responder: 'RESPONDE', no_contestar: 'NO CONTESTA', escalar: 'ESCALA', saltear: 'SALTEADO' };

/** El .md de la tanda, para leerlo antes de mandar (y para ver qué pasó después). Número tapado salvo los últimos 4 dígitos. */
function comoMarkdown(t) {
  const c = cuentas(t);
  const out = [
    `# Tanda ${t.id} · ${t.estado}`,
    '',
    `Armada el ${fechaHora(t.creada)} · vence el ${fechaHora(t.vence)} · ${t.chats.length} chats · modo ${t.modo} · US$${(t.usd || 0).toFixed(4)} de Sonnet`,
    `Resumen: ${c.responder} responde · ${c.no_contestar} no contesta · ${c.escalar} escala${c.saltear ? ` · ${c.saltear} salteados` : ''}`,
    `Para mandarla: #tanda-ok ${t.id} (o #tanda-ok ${t.id} -4 -17 para sacar números) · Para descartarla: #tanda-no ${t.id}`,
    '',
  ];
  for (const it of t.chats) {
    const res = it.resultado ? ` · RESULTADO: ${it.resultado.estado}${it.resultado.motivo ? ` (${it.resultado.motivo})` : ''}` : '';
    out.push(`## ${it.n}. ${it.nombre || 'sin nombre'} · ${ultimos4(it.chatId)} · ${hace(it.ultimoTs, t.creada)} sin respuesta → ${ACCION[it.accion] || it.accion}${res}`, '');
    if (it.omitidas) out.push(`(Sonnet leyó los últimos ${it.leidos ? it.leidos.historial : '?'} mensajes; otros ${it.omitidas} más viejos no entraron al pedido)`, '');
    for (const l of it.ultimos || []) out.push(`> ${contexto.etiqueta(l)}: ${recorte(l.texto, 400)}`);
    out.push('');
    if (it.accion === 'responder') {
      out.push('Erasmo contestaría:');
      it.mensajes.forEach((m, i) => out.push(`${i + 1}. ${m}`));
      if (it.acciones && it.acciones.catalogo) out.push('[+ catálogo en PDF]');
      if (it.acciones && it.acciones.seguimiento) out.push(`[+ seguimiento: ${it.acciones.seguimiento.fecha} · ${it.acciones.seguimiento.motivo}]`);
    } else {
      out.push(`Motivo: ${it.motivo}`);
    }
    out.push('');
  }
  return out.join('\n');
}

/** Cuántos chats de cada acción. */
function cuentas(t) {
  const c = { responder: 0, no_contestar: 0, escalar: 0, saltear: 0 };
  for (const it of t.chats) c[it.accion] = (c[it.accion] || 0) + 1;
  return c;
}

/** La ruta del .md como se la muestra al grupo: relativa al proyecto si cae adentro. */
function rutaParaMostrar(id) {
  const raiz = path.join(__dirname, '..');
  const rel = path.relative(raiz, rutaMd(id));
  return rel.startsWith('..') || path.isAbsolute(rel) ? rutaMd(id) : rel;
}

// ---------------------------------------------------------------------------
// Estado de la tanda en curso
// ---------------------------------------------------------------------------
let armando = false;
let mandando = false;
let trabajo = null;

/**
 * La tanda que está en curso (`actual`), o null: una que ya venció se cierra acá ('vencida') y deja de contar. Una que
 * quedó 'armando' o 'mandando' de antes de un reinicio es de otro proceso (`alArrancar` la cierra).
 */
function vigente(ahora = Date.now()) {
  const d = state.datosDeTandas();
  const a = d.actual;
  if (!a) return null;
  if (a.estado === 'propuesta' && ahora > Number(a.vence)) {
    const t = leerTanda(a.id);
    if (t && t.estado === 'propuesta') {
      t.estado = 'vencida';
      guardarTanda(t);
    }
    d.actual = null;
    state.guardarInternoYa();
    return null;
  }
  return a;
}

/** Al arrancar el bot: una tanda que quedó armándose o mandándose se cortó con el reinicio ('interrumpida'). */
function alArrancar() {
  const d = state.datosDeTandas();
  const a = d.actual;
  if (!a || (a.estado !== 'armando' && a.estado !== 'mandando')) return;
  const t = leerTanda(a.id);
  if (t && (t.estado === 'armando' || t.estado === 'mandando')) {
    t.estado = 'interrumpida';
    for (const it of t.chats) if (!it.resultado && it.accion !== 'no_contestar') it.resultado = { estado: 'sin-mandar', motivo: 'se cortó con un reinicio' };
    guardarTanda(t);
  }
  d.actual = null;
  state.guardarInternoYa();
  console.log(`[tandas] la tanda ${a.id} quedó ${a.estado} de antes de un reinicio: queda interrumpida`);
}

// ---------------------------------------------------------------------------
// Elegir los chats
// ---------------------------------------------------------------------------

/**
 * Los próximos chats sin contestar: lo último del historial es del cliente (nadie escribió después), del más reciente al más
 * viejo, sin los que ya estuvieron en una tanda mandada y sin los que `motivoQueNoCuenta` descarta. Devuelve
 * { elegidos: [{ chatId, ultimoTs }], hay, afuera: { motivo: cantidad } }.
 */
function seleccionar({ cuantos = config.tandas.tamano } = {}) {
  const marcados = state.datosDeTandas().chats;
  const candidatos = [];
  const afuera = {};
  for (const [chatId, s] of Object.entries(state.todos())) {
    const ultima = ultimaLinea(s.historial);
    if (!ultima || ultima.quien !== 'cliente') continue;
    const motivo = Object.prototype.hasOwnProperty.call(marcados, chatId) ? 'ya estuvo en una tanda' : motivoQueNoCuenta(chatId, s);
    if (motivo) {
      afuera[motivo] = (afuera[motivo] || 0) + 1;
      continue;
    }
    candidatos.push({ chatId, ultimoTs: Number(ultima.ts) || 0 });
  }
  candidatos.sort((a, b) => b.ultimoTs - a.ultimoTs);
  return { elegidos: candidatos.slice(0, cuantos), hay: candidatos.length, afuera };
}

/** Los mensajes de un chat que entran al .md (los últimos 6). */
const paraMostrar = (lineas) => lineas.slice(-6).map((l) => ({ quien: l.quien, texto: l.texto, ts: l.ts, ...(l.humano ? { humano: true } : {}), ...(l.audio ? { audio: true } : {}) }));

/**
 * Lo que decide el código o Sonnet para UN chat: `{ accion, motivo, mensajes?, acciones?, ... }`. Nunca tira.
 *  - sin poder releer el chat en Evolution → 'saltear';
 *  - lo último ya es de la cuenta (alguien contestó y el estado no se enteró) → 'no_contestar', sin gastar a Sonnet;
 *  - si no, Sonnet: `pensar` con la conversación larga y la herramienta `no_contestar`.
 */
async function analizarChat(chatId, ahora, { buscar = null } = {}) {
  const s = state.todos()[chatId] || {};
  const base = { chatId, nombre: s.nombre || '', ultimoTs: 0, ultimaLinea: null, ultimos: [], accion: 'saltear', motivo: '' };
  const lec = await lectura.leerLargo(chatId, { cuantos: config.tandas.maxMensajes, ...(buscar ? { buscar } : {}) });
  const lineas = lec.lineas;
  const ultima = lineas[lineas.length - 1] || null;
  const dePedido = ultima ? { id: ultima.id || null, ts: Number(ultima.ts) || 0, quien: ultima.quien } : null;
  const comun = { ...base, ultimaLinea: dePedido, ultimos: paraMostrar(lineas), leidos: { historial: Math.min(lineas.length, config.tandas.maxMensajes), evolution: lineas.filter((l) => l.evolution).length } };
  if (!lec.evolution) return { ...comun, accion: 'saltear', motivo: `no pude releer el chat (${lec.error})` };
  if (!ultima) return { ...comun, accion: 'saltear', motivo: 'el chat no tiene mensajes' };
  const ultimoDelCliente = [...lineas].reverse().find((l) => l.quien === 'cliente');
  const ultimoTs = ultimoDelCliente ? Number(ultimoDelCliente.ts) || 0 : 0;
  const conTs = { ...comun, ultimoTs };
  if (ultima.quien !== 'cliente') {
    return { ...conTs, accion: 'no_contestar', motivo: 'ya le contestó alguien de la cuenta (lo vi en Evolution)', porCodigo: true };
  }
  const r = await cerebro.pensar({ chatId, mensaje: '', nombre: s.nombre || '', ahora, enVivo: true, tanda: { lineas } });
  const gasto = { usd: r.usd || 0, herramientas: r.herramientas || [], ...(r.leidos ? { leidos: { ...r.leidos } } : {}) };
  if (r.error) return { ...conTs, ...gasto, accion: 'saltear', motivo: `Sonnet no pudo (${cerebro.motivoCorto(r.error)})` };
  if (r.noContestar) return { ...conTs, ...gasto, accion: 'no_contestar', motivo: r.motivo };
  if (r.escalar) return { ...conTs, ...gasto, accion: 'escalar', motivo: r.motivo };
  const sinRepetir = salida.sinLoYaDicho(chatId, r.mensajes || []);
  if (!sinRepetir.length) return { ...conTs, ...gasto, accion: 'escalar', motivo: salida.TODO_REPETIDO };
  return { ...conTs, ...gasto, accion: 'responder', motivo: '', mensajes: sinRepetir.map((m) => (typeof m === 'string' ? m : m.texto || String(m))), acciones: r.acciones || {}, cotizo: r.cotizo || null };
}

// ---------------------------------------------------------------------------
// #tanda: armar la propuesta
// ---------------------------------------------------------------------------

/**
 * #tanda. Devuelve { aviso } (para el grupo). No manda nada al cliente. `analizar(chatId, ahora)` se inyecta en las pruebas.
 * `alEmpezar(texto)`: una respuesta inmediata para el grupo ("armo la tanda…") apenas se sabe que va a armarse: leer 40 chats lleva minutos.
 * `salenAlCliente(chatId)`: ¿esta tanda, tal como está, le llegaría a ese cliente? (index.js: los candados) — solo para
 * avisarlo en el resumen.
 */
async function armar({ ahora = Date.now(), analizar = analizarChat, frenoGeneral = () => null, salenAlCliente = () => true, alEmpezar = null } = {}) {
  if (!interruptor.prendida()) return { aviso: '❓ El bot está apagado (#apagar). No armé ninguna tanda. Para prenderlo: #prender' };
  if (config.cerebro.modo === 'apagado') {
    return { aviso: '❓ Con CEREBRO_MODO=apagado no le pregunto nada a Sonnet. No armé ninguna tanda y no gasté nada.' };
  }
  if (armando || mandando) return { aviso: '❓ Hay una tanda armándose o mandándose ahora mismo. Esperá a que termine para armar otra.' };
  const actual = vigente(ahora);
  if (actual) {
    return {
      aviso:
        `❓ La tanda ${actual.id} todavía está sin mandar ni descartar (vence a las ${HORA.format(new Date(Number(actual.vence)))}). ` +
        `Mandala con #tanda-ok ${actual.id} o descartala con #tanda-no ${actual.id}, y después armo otra.`,
    };
  }
  armando = true;
  const d = state.datosDeTandas();
  try {
    const { elegidos, hay, afuera } = seleccionar();
    if (!elegidos.length) {
      const otros = Object.entries(afuera).map(([m, n]) => `${n} ${m}`).join(', ');
      return { aviso: `✅ No hay chats sin contestar para una tanda${otros ? ` (quedaron afuera: ${otros})` : ''}.` };
    }
    const id = d.siguiente;
    d.siguiente = id + 1;
    d.actual = { id, estado: 'armando', creada: ahora, vence: ahora + config.tandas.venceHoras * HORA_MS };
    state.guardarInternoYa();
    const t = { id, estado: 'armando', creada: ahora, vence: d.actual.vence, modo: config.cerebro.modo, usd: 0, hay, chats: [] };
    if (alEmpezar) Promise.resolve(alEmpezar(`Armo la tanda ${id}: leo ${elegidos.length} chats y le pregunto a Sonnet por cada uno (puede tardar unos minutos). No mando nada.`)).catch(() => {});
    const analizados = await conLimite(elegidos, CONCURRENCIA, async (e) => {
      try {
        return await analizar(e.chatId, ahora);
      } catch (err) {
        return { chatId: e.chatId, nombre: '', ultimoTs: e.ultimoTs, ultimaLinea: null, ultimos: [], accion: 'saltear', motivo: `falló al analizarlo (${err.message})` };
      }
    });
    t.chats = analizados.map((it, i) => ({ n: i + 1, ...it, ultimoTs: it.ultimoTs || elegidos[i].ultimoTs }));
    t.usd = t.chats.reduce((suma, it) => suma + (it.usd || 0), 0);
    t.estado = 'propuesta';
    guardarTanda(t);
    d.actual = { id, estado: 'propuesta', creada: ahora, vence: t.vence };
    state.guardarInternoYa();
    return { aviso: resumenDeLaPropuesta(t, { hay, frenoGeneral, salenAlCliente }), tanda: t };
  } catch (e) {
    if (d.actual && d.actual.estado === 'armando') {
      d.actual = null;
      state.guardarInternoYa();
    }
    console.error('[tandas] no pude armar la tanda:', e);
    return { aviso: `⚠️ No pude armar la tanda: ${e.message}. No mandé nada.` };
  } finally {
    armando = false;
  }
}

/** El resumen que va al grupo cuando la propuesta está lista. */
function resumenDeLaPropuesta(t, { hay, frenoGeneral, salenAlCliente }) {
  const c = cuentas(t);
  const partes = [`${c.responder} contesta`, `${c.no_contestar} no`, `${c.escalar} escala`];
  if (c.saltear) partes.push(`${c.saltear} salteados`);
  const lineas = [`Tanda ${t.id}: ${t.chats.length} chats → ${partes.join(', ')}.`];
  if (hay > t.chats.length) lineas.push(`(Hay ${hay} sin contestar en total; esta tanda toma los ${t.chats.length} más recientes.)`);
  const salteados = t.chats.filter((it) => it.accion === 'saltear');
  for (const it of salteados.slice(0, 5)) lineas.push(`• ${it.n}. ${it.nombre || ultimos4(it.chatId)}: ${it.motivo}`);
  if (salteados.length > 5) lineas.push(`• …y ${salteados.length - 5} más (están en el .md)`);
  lineas.push(`Revisá ${rutaParaMostrar(t.id)}.`);
  const freno = frenoGeneral();
  const sinSalida = t.chats.filter((it) => (it.accion === 'responder' || it.accion === 'escalar') && !salenAlCliente(it.chatId));
  if (freno) lineas.push(`Ojo: con el modo de ahora no saldría nada (${freno}).`);
  else if (sinSalida.length) lineas.push(`Ojo: a ${sinSalida.length} de los que contestan o escalan no les llegaría (borrador, listas o SOLO_CHATS_NUEVOS).`);
  lineas.push(`Vence a las ${HORA.format(new Date(t.vence))}. Para mandar: #tanda-ok ${t.id} (sin algunos: #tanda-ok ${t.id} -4 -17). Para descartar: #tanda-no ${t.id}`);
  return lineas.join('\n');
}

// ---------------------------------------------------------------------------
// #tanda-no
// ---------------------------------------------------------------------------

/** #tanda-no <id>. Devuelve { aviso }. Libera a los chats (no se atendió a nadie). */
function descartar({ id, ahora = Date.now() }) {
  const t = leerTanda(id);
  if (!t) return { aviso: `❓ No encontré la tanda ${id}. No toqué nada.` };
  const a = vigente(ahora);
  if (t.estado === 'vencida' || (t.estado === 'propuesta' && !a)) return { aviso: `❓ La tanda ${id} ya venció. No hay nada para descartar.` };
  if (t.estado === 'mandando') return { aviso: `❓ La tanda ${id} se está mandando: no se puede descartar.` };
  if (t.estado !== 'propuesta') return { aviso: `❓ La tanda ${id} ya está ${t.estado}: no la toco.` };
  t.estado = 'descartada';
  guardarTanda(t);
  const d = state.datosDeTandas();
  if (d.actual && d.actual.id === id) d.actual = null;
  state.guardarInternoYa();
  return { aviso: `🗑️ Tanda ${id} descartada. No mandé nada y esos chats quedan libres para otra tanda.` };
}

// ---------------------------------------------------------------------------
// #tanda-ok: mandar
// ---------------------------------------------------------------------------

/** Anota que este chat ya fue atendido por una tanda mandada. */
function marcar(chatId, tanda, resultado, ts = Date.now()) {
  state.datosDeTandas().chats[chatId] = { tanda, ts, resultado };
  state.guardarInternoYa();
}

/**
 * #tanda-ok <id> [-N …]. Devuelve { aviso, trabajo }: `aviso` es la respuesta inmediata para el grupo (❓ si no se
 * manda) y `trabajo` la promesa del envío (null si no se mandó), que resuelve con el texto final para el grupo.
 *   frenoGeneral()           por qué no se puede mandar nada ahora (apagado, escucha, borrador, el modo), o null;
 *   mandarChat(item, id)     index.js: re-chequea los candados y manda UN chat: { resultado: 'enviado' | 'escalado' |
 *                            'salteado' | 'frenado', motivo };
 *   esperar()                la pausa humana entre un chat y el siguiente.
 */
function ok({ id, omitir = [], ahora = Date.now(), frenoGeneral = () => null, mandarChat, esperar = async () => {} }) {
  const sin = (aviso) => ({ aviso, trabajo: null });
  if (!interruptor.prendida()) return sin('❓ El bot está apagado (#apagar). No mandé nada.');
  const t = leerTanda(id);
  if (!t) return sin(`❓ No encontré la tanda ${id}. No mandé nada.`);
  if (mandando || t.estado === 'mandando') return sin(`❓ La tanda ${id} ya se está mandando. No hago nada.`);
  if (t.estado !== 'propuesta') {
    return sin(`❓ La tanda ${id} está ${t.estado}${t.estado === 'mandada' ? ' (ya se mandó)' : ''}: no la mando.${t.estado === 'vencida' ? ' Armá otra con #tanda.' : ''}`);
  }
  if (ahora > Number(t.vence)) {
    vigente(ahora);
    return sin(`❓ La tanda ${id} venció (las propuestas duran ${config.tandas.venceHoras} h: los precios y los chats cambian). No mandé nada: armá otra con #tanda.`);
  }
  const fuera = omitir.filter((n) => !t.chats.some((it) => it.n === n));
  if (fuera.length) return sin(`❓ La tanda ${id} no tiene el número ${fuera.join(', ')} (va del 1 al ${t.chats.length}). No mandé nada.`);
  const freno = frenoGeneral();
  if (freno) return sin(`❓ No mando la tanda ${id}: ${freno}.`);

  // Desde acá, la tanda es 'mandando' (antes de cualquier await): un segundo #tanda-ok da ❓.
  mandando = true;
  t.estado = 'mandando';
  t.omitidos = [...new Set(omitir)].sort((a, b) => a - b);
  t.empezo = ahora;
  try {
    guardarTanda(t);
  } catch (e) {
    mandando = false;
    return sin(`⚠️ No pude guardar el archivo de la tanda ${id} (${e.message}). No mandé nada.`);
  }
  const d = state.datosDeTandas();
  d.actual = { id, estado: 'mandando', creada: t.creada, vence: t.vence };
  state.guardarInternoYa();

  const quedan = t.chats.filter((it) => !t.omitidos.includes(it.n) && (it.accion === 'responder' || it.accion === 'escalar')).length;
  const aviso = `📤 Mando la tanda ${id}: ${quedan} chats para contestar o escalar${t.omitidos.length ? ` (sin el ${t.omitidos.join(', ')})` : ''}. Va de a uno, con el ritmo de siempre; al terminar te cuento.`;
  trabajo = mandarTodo(t, { frenoGeneral, mandarChat, esperar }).finally(() => {
    mandando = false;
  });
  return { aviso, trabajo };
}

async function mandarTodo(t, { frenoGeneral, mandarChat, esperar }) {
  let yaSalioUno = false;
  let corte = null;
  try {
    for (const it of t.chats) {
      if (it.resultado) continue;
      if (t.omitidos.includes(it.n)) {
        it.resultado = { estado: 'omitido', motivo: 'sacado a mano con -N' };
        marcar(it.chatId, t.id, 'omitido');
        continue;
      }
      if (it.accion === 'saltear') {
        it.resultado = { estado: 'salteado', motivo: it.motivo };
        continue;
      }
      if (it.accion === 'no_contestar') {
        it.resultado = { estado: 'no-contestado', motivo: it.motivo };
        marcar(it.chatId, t.id, 'no_contestar');
        continue;
      }
      if (corte) {
        it.resultado = { estado: 'sin-mandar', motivo: corte };
        continue;
      }
      const freno = frenoGeneral();
      if (freno) {
        corte = freno;
        it.resultado = { estado: 'sin-mandar', motivo: freno };
        continue;
      }
      if (yaSalioUno) await esperar();
      let r;
      try {
        r = await mandarChat(it, t.id);
      } catch (e) {
        console.error(`[tandas] ${it.chatId}: falló al mandarlo:`, e);
        r = { resultado: 'salteado', motivo: `falló (${e.message})` };
      }
      it.resultado = { estado: r.resultado, ...(r.motivo ? { motivo: r.motivo } : {}), ts: Date.now() };
      if (r.resultado === 'enviado' || r.resultado === 'escalado') {
        yaSalioUno = true;
        marcar(it.chatId, t.id, r.resultado);
      } else if (r.resultado === 'frenado') {
        corte = r.motivo || 'se frenó el envío';
      }
      guardarSeguro(t);
    }
  } finally {
    t.estado = 'mandada';
    t.termino = Date.now();
    guardarSeguro(t);
    const d = state.datosDeTandas();
    if (d.actual && d.actual.id === t.id) d.actual = null;
    state.guardarInternoYa();
  }
  return resumenFinal(t);
}

/** El texto que va al grupo cuando termina de mandarse la tanda. */
function resumenFinal(t) {
  const n = (est) => t.chats.filter((it) => it.resultado && it.resultado.estado === est).length;
  const lineas = [`Tanda ${t.id} mandada: ${n('enviado')} contestados, ${n('escalado')} escalados, ${n('no-contestado')} sin contestar a propósito.`];
  const otros = t.chats.filter((it) => it.resultado && ['salteado', 'frenado', 'sin-mandar'].includes(it.resultado.estado));
  if (otros.length) {
    lineas.push(`No salieron ${otros.length}:`);
    for (const it of otros.slice(0, 15)) lineas.push(`• ${it.nombre || ultimos4(it.chatId)} (${link(it.chatId)}): ${it.resultado.motivo}`);
    if (otros.length > 15) lineas.push(`• …y ${otros.length - 15} más (están en ${rutaParaMostrar(t.id)})`);
  }
  if (t.omitidos && t.omitidos.length) lineas.push(`Sacados a mano: ${t.omitidos.join(', ')}.`);
  if (t.sinArchivo) lineas.push('Ojo: no pude guardar el archivo de la tanda en data/tandas (lo que salió quedó anotado en el estado).');
  return lineas.join('\n');
}

/** Para las pruebas: la promesa del envío en curso (o la última). */
const esperarTrabajo = () => trabajo || Promise.resolve();

/** Para las pruebas: vuelve a lo de un proceso recién arrancado. */
function reiniciarParaPruebas() {
  armando = false;
  mandando = false;
  trabajo = null;
}

module.exports = {
  comando,
  seleccionar,
  analizarChat,
  armar,
  ok,
  descartar,
  alArrancar,
  vigente,
  leerTanda,
  comoMarkdown,
  esperarTrabajo,
  reiniciarParaPruebas,
  COMO_SE_USA,
  MODOS_QUE_MANDAN,
  rutaJson,
  rutaMd,
};
