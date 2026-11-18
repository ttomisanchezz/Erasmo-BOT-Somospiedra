'use strict';
/**
 * Reactivación de Piedra: 2 mensajes y listo (18/11/2026). Un cliente que dejó de contestar recibe, como mucho, DOS
 * recordatorios en toda su vida con el negocio, escritos por el CÓDIGO (`reactivacion-textos.js`, los que aprobó Tomás),
 * nunca por Sonnet. Sonnet solo decide, antes de cada uno, si corresponde mandarlo (`cerebro.decidirReactivacion`).
 *
 * Variables NUEVAS (config.reactivacion; las REACTIVACION_* de iPhone que sigan en el .env no se leen):
 *   ERASMO_REACTIVACION_ACTIVA (apagada si falta), _TOPE_DIA (40), _DIAS_1 (2), _DIAS_2 (7), _VENTANA_DIAS (30).
 *
 * Quién: chats donde lo último lo escribió la cuenta (Erasmo o una persona) y el cliente no contestó en DIAS_1 días →
 * mensaje 1; si después del 1 pasan DIAS_2 días sin respuesta → mensaje 2. Nunca más de 2 por chat: las marcas
 * (`state.datosDeReactivacion().chats`: m1, m2, descartado, cortado) viven afuera del chat y sobreviven a #reset. Solo con
 * actividad del cliente dentro de los últimos VENTANA_DIAS. Si el cliente contesta en cualquier momento después del 1, se
 * corta para siempre (vuelve al flujo normal). Un `false` de Sonnet descarta el chat para siempre; un error de Sonnet
 * (o de Evolution) no: se reintenta en el próximo barrido. Mismas exclusiones que las tandas (`chats-elegibles.js`), más:
 * con un seguimiento agendado (`s.seguimiento`, futuro o sin avisar todavía) no se le escribe.
 *
 * Cuándo: un barrido cada 15 minutos, de lunes a sábado de 10 a 19 (hora de Argentina), con un tope de TOPE_DIA mensajes
 * por día entre los dos tipos (cuenta solo los que Evolution confirmó) y, para que no salgan todos juntos, a lo sumo
 * MAX_POR_BARRIDO por barrido. De a uno, con el ritmo humano y todos los candados (los pone index.js: `mandarReactivacion`).
 * Lo que sale queda con `atiendeSonnet: true`: si el cliente contesta, lo atiende Erasmo.
 *
 * Con ACTIVA=false no se manda nada nunca (ni se le pregunta a Sonnet). `#reactivar-prueba` arma el .md con a quién le
 * saldría hoy cada mensaje (con el chequeo de Sonnet incluido), sin mandar nada y sin marcar nada, aunque ACTIVA sea false.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const evolution = require('./evolution');
const interruptor = require('./interruptor');
const cerebro = require('./cerebro');
const lectura = require('./lectura-larga');
const textos = require('./reactivacion-textos');
const { motivoQueNoCuenta, ultimaLinea, conLimite } = require('./chats-elegibles');

const DIA_MS = 24 * 60 * 60 * 1000;
/** Lunes a sábado (domingo cerrado), de HORA_DESDE a antes de HORA_HASTA, hora de Argentina. */
const HORA_DESDE = 10;
const HORA_HASTA = 19;
/** A lo sumo esto sale en un barrido (cada 15 min): el día se reparte, no sale todo junto a las 10. */
const MAX_POR_BARRIDO = 4;
/** A lo sumo esto se evalúa (se lee el chat y se le pregunta a Sonnet) en un barrido. */
const MAX_EVALUADOS_POR_BARRIDO = 12;
/** Cuántos chats se evalúan a la vez en #reactivar-prueba. */
const CONCURRENCIA_PRUEBA = 4;

const COMO_SE_USA =
  'Reactivación (en el grupo):\n' +
  '#reactivar: dice si está activa, cuántos salieron hoy y el tope\n' +
  '#reactivar-prueba: arma el archivo con a quién le saldría hoy cada mensaje (no manda nada)';

/**
 * ¿#reactivar o #reactivar-prueba? Solo si el mensaje EMPIEZA con el comando ('#reactivarlo' no cuenta). Sin nada más
 * después: con algo, `problema`.
 */
function comando(texto) {
  const m = String(texto || '')
    .trim()
    .match(/^#(reactivar-prueba|reactivar)(?![\p{L}\p{N}_-])([\s\S]*)$/iu);
  if (!m) return null;
  return { tipo: m[1].toLowerCase(), problema: m[2].trim() ? `#${m[1].toLowerCase()} va sin nada más` : null };
}

// ---------------------------------------------------------------------------
// La hora (Argentina)
// ---------------------------------------------------------------------------
const PARTES = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  weekday: 'short',
  hourCycle: 'h23',
});

/** { dia: 'AAAA-MM-DD', hora: 0-23, domingo: boolean } en Argentina. */
function partesAR(ts) {
  const p = Object.fromEntries(PARTES.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return { dia: `${p.year}-${p.month}-${p.day}`, hora: parseInt(p.hour, 10), domingo: p.weekday === 'Sun' };
}

/** ¿Es lunes a sábado, de 10 a 19, hora de Argentina? */
function enFranja(ts) {
  const { hora, domingo } = partesAR(ts);
  return !domingo && hora >= HORA_DESDE && hora < HORA_HASTA;
}

// ---------------------------------------------------------------------------
// La cuenta del día y las marcas
// ---------------------------------------------------------------------------

/** Cuántos mensajes de reactivación salieron en el día de Argentina de `ts`. */
function enviadosHoy(ts = Date.now()) {
  return Number(state.datosDeReactivacion().dias[partesAR(ts).dia]) || 0;
}

function sumarAlDia(ts) {
  const d = state.datosDeReactivacion();
  const dia = partesAR(ts).dia;
  d.dias[dia] = (Number(d.dias[dia]) || 0) + 1;
  // Se guardan los últimos 40 días: la cuenta de hoy es lo único que importa, el resto es para mirar.
  for (const k of Object.keys(d.dias).sort().slice(0, -40)) delete d.dias[k];
}

/** Las marcas del chat ({ m1, m2, descartado, cortado }), sin crearlas. */
const marcasDe = (chatId) => state.datosDeReactivacion().chats[chatId] || {};

/** Cambia las marcas del chat y guarda ya. */
function anotar(chatId, cambios) {
  const d = state.datosDeReactivacion();
  d.chats[chatId] = { ...(d.chats[chatId] || {}), ...cambios };
  state.guardarInternoYa();
}

// ---------------------------------------------------------------------------
// Quién toca hoy
// ---------------------------------------------------------------------------

/**
 * Los chats a los que les toca un mensaje ahora: [{ chatId, nombre, tipo: 'm1' | 'm2', ultimaCuenta: { id, ts },
 * ultimoCliente, producto }] del que más recientemente escribió el cliente al más viejo, y `afuera`: por qué no entraron los
 * demás chats donde lo último es de la cuenta. Con `marcar` (por defecto), un chat donde el cliente contestó después del
 * mensaje 1 queda `cortado` para siempre; `#reactivar-prueba` no marca nada (`marcar: false`).
 */
function candidatos({ ahora = Date.now(), marcar = true } = {}) {
  const lista = [];
  const afuera = {};
  const suma = (motivo) => {
    afuera[motivo] = (afuera[motivo] || 0) + 1;
  };
  const hoy = partesAR(ahora).dia;
  const desdeVentana = ahora - config.reactivacion.ventanaDias * DIA_MS;
  for (const [chatId, s] of Object.entries(state.todos())) {
    const h = s.historial || [];
    const ultima = ultimaLinea(h);
    if (!ultima) continue;
    const m = marcasDe(chatId);
    if (m.m2) continue; // ya recibió los dos: no es un candidato, no hace falta ni contarlo
    if (m.descartado) {
      suma('Sonnet lo descartó antes');
      continue;
    }
    if (m.cortado) {
      suma('el cliente ya contestó');
      continue;
    }
    // El cliente contestó después del mensaje 1: se corta para siempre.
    if (m.m1 && h.some((l) => l && l.quien === 'cliente' && Number(l.ts) > Number(m.m1))) {
      if (marcar) anotar(chatId, { cortado: ahora });
      suma('el cliente ya contestó');
      continue;
    }
    if (ultima.quien !== 'vendedor') continue; // lo último es del cliente: es de las tandas o del flujo normal
    const noCuenta = motivoQueNoCuenta(chatId, s);
    if (noCuenta) {
      suma(noCuenta);
      continue;
    }
    if (ultima.sinConfirmar) {
      suma('lo último que se le mandó no se confirmó');
      continue;
    }
    const seg = s.seguimiento;
    if (seg && (seg.fecha > hoy || !seg.avisado)) {
      suma('tiene un seguimiento agendado');
      continue;
    }
    const delCliente = [...h].reverse().find((l) => l && l.quien === 'cliente');
    if (!delCliente || Number(delCliente.ts) < desdeVentana) {
      suma(`el cliente no escribió en los últimos ${config.reactivacion.ventanaDias} días`);
      continue;
    }
    const sinContestar = ahora - Number(ultima.ts);
    let tipo = null;
    if (!m.m1 && sinContestar >= config.reactivacion.dias1 * DIA_MS) tipo = 'm1';
    else if (m.m1 && sinContestar >= config.reactivacion.dias2 * DIA_MS) tipo = 'm2';
    if (!tipo) {
      suma('todavía no pasó el tiempo');
      continue;
    }
    lista.push({
      chatId,
      nombre: s.nombre || '',
      tipo,
      ultimaCuenta: { id: ultima.id || null, ts: Number(ultima.ts) || 0 },
      ultimoCliente: Number(delCliente.ts) || 0,
      producto: (s.ficha && s.ficha.pidio && s.ficha.pidio.producto) || '',
    });
  }
  lista.sort((a, b) => b.ultimoCliente - a.ultimoCliente);
  return { lista, afuera };
}

/** ¿La lectura de Evolution muestra que sigue todo como estaba (lo último es lo mismo que de la cuenta)? */
function sigueIgual(lec, esperada) {
  const ultima = lec.lineas[lec.lineas.length - 1];
  if (!ultima || ultima.quien !== 'vendedor') return false;
  return esperada.id && ultima.id ? String(ultima.id) === String(esperada.id) : Number(ultima.ts) === Number(esperada.ts);
}

// ---------------------------------------------------------------------------
// El barrido
// ---------------------------------------------------------------------------
let barriendo = false;

/**
 * El barrido (cada 15 minutos, index.js). Devuelve { enviados, motivo? }. Nunca tira.
 *   frenoGeneral()    por qué no se puede mandar nada ahora (apagado, escucha, borrador, modo), o null;
 *   frenoDeChat(id)   por qué no a ESTE chat (candados de siempre), o null;
 *   enviar(chatId, texto, cand)   manda UN mensaje (index.js, `mandarReactivacion`): { salio, motivo };
 *   esperar()         la pausa humana entre un mensaje y el siguiente.
 * Con ACTIVA=false, fuera de la franja o con el tope del día cumplido, no hace nada ni le pregunta a Sonnet.
 */
async function revisar({ ahora = Date.now(), frenoGeneral = () => null, frenoDeChat = () => null, enviar, esperar = async () => {}, decidir = cerebro.decidirReactivacion, leer = lectura.leerLargo } = {}) {
  if (!config.reactivacion.activa) return { enviados: 0, motivo: 'la reactivación está apagada' };
  if (barriendo) return { enviados: 0, motivo: 'ya hay un barrido en curso' };
  if (!interruptor.prendida()) return { enviados: 0, motivo: 'el bot está apagado' };
  const freno = frenoGeneral();
  if (freno) return { enviados: 0, motivo: freno };
  if (!enFranja(ahora)) return { enviados: 0, motivo: 'fuera de la franja (lunes a sábado de 10 a 19)' };
  const restan = config.reactivacion.topeDia - enviadosHoy(ahora);
  if (restan <= 0) return { enviados: 0, motivo: 'ya salió el tope de hoy' };
  barriendo = true;
  const inicio = Date.now();
  // La hora de este instante, con la del barrido como punto de partida (un barrido largo puede cruzar las 19).
  const reloj = () => ahora + (Date.now() - inicio);
  try {
    const { lista } = candidatos({ ahora });
    const maximo = Math.min(restan, MAX_POR_BARRIDO);
    let enviados = 0;
    let evaluados = 0;
    for (const c of lista) {
      if (enviados >= maximo || evaluados >= MAX_EVALUADOS_POR_BARRIDO) break;
      if (!enFranja(reloj()) || !interruptor.prendida() || frenoGeneral()) break;
      if (frenoDeChat(c.chatId)) continue;
      evaluados++;
      const lec = await leer(c.chatId, { cuantos: 30 });
      // Sin poder verificar el chat no se le escribe (y no se descarta: se reintenta).
      if (!lec.evolution) continue;
      const m = marcasDe(c.chatId);
      const ultima = lec.lineas[lec.lineas.length - 1];
      if (ultima && ultima.quien === 'cliente') {
        // El cliente contestó (Evolution lo sabe, el estado todavía no): se corta si ya había recibido el 1.
        if (m.m1) anotar(c.chatId, { cortado: reloj() });
        continue;
      }
      if (!sigueIgual(lec, c.ultimaCuenta)) continue; // alguien escribió algo nuevo: el estado se pone al día y vuelve a evaluarse
      const d = await decidir({ chatId: c.chatId, lineas: lec.lineas, nombre: c.nombre, ahora: reloj() });
      if (d.error) {
        console.warn(`[reactivacion] ${c.chatId}: Sonnet no pudo decidir (${cerebro.motivoCorto(d.error)}): se reintenta`);
        continue;
      }
      if (!d.mandar) {
        anotar(c.chatId, { descartado: { motivo: d.motivo, ts: reloj() } });
        console.log(`[reactivacion] ${c.chatId}: Sonnet lo descartó para siempre (${d.motivo})`);
        continue;
      }
      if (!enFranja(reloj()) || !interruptor.prendida()) break;
      if (enviados > 0) await esperar();
      // Última mirada antes de mandar (la espera pudo cambiar algo, también la hora: la franja se cierra a las 19).
      if (!enFranja(reloj()) || !interruptor.prendida()) break;
      if (frenoDeChat(c.chatId) || frenoGeneral()) continue;
      const texto = textos.textoDe(c.tipo, { nombre: c.nombre, producto: c.producto });
      // La marca se reserva ANTES de mandar: si el bot se corta entre que Evolution entrega y que se anota, el mensaje no se
      // repite ("nunca más de 2"). Si no salió (un candado, Evolution lo frenó), se devuelve; si el envío revienta sin saber
      // si salió, se queda (es mejor no mandar el 2 que mandar dos veces el 1).
      const reservada = m[c.tipo];
      anotar(c.chatId, { [c.tipo]: reloj() });
      let r;
      try {
        r = await enviar(c.chatId, texto, c, { enFranja: () => enFranja(reloj()) });
      } catch (e) {
        console.error(`[reactivacion] ${c.chatId}: falló al mandar (no sé si salió: la marca queda):`, e.message);
        continue;
      }
      if (!r || !r.salio) {
        anotar(c.chatId, { [c.tipo]: reservada });
        console.log(`[reactivacion] ${c.chatId}: no salió${r && r.motivo ? ` (${r.motivo})` : ''}`);
        continue;
      }
      sumarAlDia(reloj());
      state.guardarInternoYa();
      enviados++;
      console.log(`[reactivacion] ${c.chatId}: salió el mensaje ${c.tipo === 'm1' ? 1 : 2} (hoy van ${enviadosHoy(reloj())} de ${config.reactivacion.topeDia})`);
    }
    return { enviados };
  } catch (e) {
    console.error('[reactivacion] el barrido falló:', e);
    return { enviados: 0, motivo: `falló (${e.message})` };
  } finally {
    barriendo = false;
  }
}

// ---------------------------------------------------------------------------
// #reactivar y #reactivar-prueba
// ---------------------------------------------------------------------------

/** #reactivar: el estado, en una respuesta para el grupo. */
function estado({ ahora = Date.now(), frenoGeneral = () => null } = {}) {
  const c = config.reactivacion;
  const freno = frenoGeneral();
  const lineas = [
    c.activa ? '🔁 La reactivación está ACTIVA.' : '🔁 La reactivación está APAGADA (ERASMO_REACTIVACION_ACTIVA): no manda nada.',
    `Hoy salieron ${enviadosHoy(ahora)} de ${c.topeDia}. Mensaje 1 a los ${c.dias1} días, mensaje 2 a los ${c.dias2} días del 1, solo con actividad del cliente en los últimos ${c.ventanaDias} días.`,
    `Franja: lunes a sábado de ${HORA_DESDE} a ${HORA_HASTA}, un barrido cada 15 minutos (${enFranja(ahora) ? 'ahora está abierta' : 'ahora está cerrada'}).`,
  ];
  if (c.activa && freno) lineas.push(`Ahora no mandaría nada: ${freno}.`);
  lineas.push('Para ver a quién le saldría hoy: #reactivar-prueba');
  return lineas.join('\n');
}

/**
 * #reactivar-prueba: arma `data/reactivacion/<fecha>.md` con a quién le saldría hoy cada mensaje y por qué (con el
 * chequeo de Sonnet incluido), SIN mandar nada ni marcar nada, aunque ACTIVA sea false. Mira los primeros TOPE_DIA
 * candidatos (lo que saldría hoy); el resto se cuenta. Devuelve { aviso, archivo }.
 */
async function armarPrueba({ ahora = Date.now(), frenoDeChat = () => null, frenoGeneral = () => null, decidir = cerebro.decidirReactivacion, leer = lectura.leerLargo } = {}) {
  if (config.cerebro.modo === 'apagado') return { aviso: '❓ Con CEREBRO_MODO=apagado no le pregunto nada a Sonnet. No armé la prueba y no gasté nada.' };
  const { lista, afuera } = candidatos({ ahora, marcar: false });
  const tope = config.reactivacion.topeDia;
  const vistos = lista.slice(0, tope);
  const filas = await conLimite(vistos, CONCURRENCIA_PRUEBA, async (c) => {
    const fila = { ...c, veredicto: '', texto: '' };
    const freno = frenoDeChat(c.chatId);
    if (freno) return { ...fila, veredicto: 'NO', motivo: `hoy no se le podría mandar: ${freno}` };
    const lec = await leer(c.chatId, { cuantos: 30 });
    if (!lec.evolution) return { ...fila, veredicto: 'NO', motivo: `no pude releer el chat (${lec.error})` };
    const ultima = lec.lineas[lec.lineas.length - 1];
    if (ultima && ultima.quien === 'cliente') return { ...fila, veredicto: 'NO', motivo: 'el cliente ya contestó (lo vi en Evolution)' };
    if (!sigueIgual(lec, c.ultimaCuenta)) return { ...fila, veredicto: 'NO', motivo: 'cambió algo en el chat desde el estado guardado' };
    const d = await decidir({ chatId: c.chatId, lineas: lec.lineas, nombre: c.nombre, ahora });
    if (d.error) return { ...fila, veredicto: 'NO', motivo: `Sonnet no pudo decidir (${cerebro.motivoCorto(d.error)})` };
    if (!d.mandar) return { ...fila, veredicto: 'NO', motivo: `Sonnet: no mandar (${d.motivo})`, usd: d.usd };
    return { ...fila, veredicto: 'SÍ', motivo: d.motivo, texto: textos.textoDe(c.tipo, { nombre: c.nombre, producto: c.producto }), usd: d.usd };
  });
  const si = filas.filter((f) => f.veredicto === 'SÍ');
  const no = filas.length - si.length;
  const usd = filas.reduce((a, f) => a + (f.usd || 0), 0);
  const md = [
    `# Reactivación · a quién le saldría hoy (${partesAR(ahora).dia})`,
    '',
    `Reactivación: ${config.reactivacion.activa ? 'ACTIVA' : 'APAGADA (esto es solo una prueba: no se mandó ni se marcó nada)'} · tope ${tope} por día · hoy salieron ${enviadosHoy(ahora)}`,
    `Candidatos: ${lista.length} (se miran los primeros ${vistos.length}${lista.length > vistos.length ? `; otros ${lista.length - vistos.length} esperan a otro día` : ''}) · mandaría ${si.length} · no ${no} · US$${usd.toFixed(4)} de Sonnet`,
    `Afuera: ${Object.entries(afuera).map(([m, n]) => `${n} ${m}`).join(' · ') || 'ninguno'}`,
    '',
  ];
  filas.forEach((f, i) => {
    const ult = (state.todos()[f.chatId] || {}).historial || [];
    md.push(`## ${i + 1}. ${f.nombre || 'sin nombre'} · …${f.chatId.split('@')[0].replace(/\D/g, '').slice(-4)} · mensaje ${f.tipo === 'm1' ? 1 : 2} → ${f.veredicto}`, '');
    md.push(`Lo último de la cuenta fue hace ${Math.round((ahora - f.ultimaCuenta.ts) / DIA_MS)} días; el cliente escribió por última vez hace ${Math.round((ahora - f.ultimoCliente) / DIA_MS)} días.`);
    md.push(`Motivo: ${f.motivo}`);
    for (const l of ult.slice(-4)) md.push(`> ${l.quien === 'cliente' ? 'Cliente' : l.humano ? 'Persona de la cuenta' : 'Erasmo'}: ${cerebro.recorte(l.texto, 300)}`);
    if (f.texto) md.push('', `Le saldría: ${f.texto}`);
    md.push('');
  });
  fs.mkdirSync(config.reactivacion.dir, { recursive: true });
  const archivo = path.join(config.reactivacion.dir, `${partesAR(ahora).dia}.md`);
  fs.writeFileSync(archivo, md.join('\n'));
  const freno = frenoGeneral();
  const aviso = [
    `Reactivación, prueba: de ${lista.length} chats que tocan, miré ${vistos.length}: mandaría ${si.length}, no ${no}. No mandé nada ni marqué nada.`,
    `Revisá ${path.relative(path.join(__dirname, '..'), archivo).startsWith('..') ? archivo : path.relative(path.join(__dirname, '..'), archivo)}.`,
    config.reactivacion.activa ? (freno ? `Ojo: ahora no mandaría nada (${freno}).` : '') : 'La reactivación está APAGADA: para prenderla, ERASMO_REACTIVACION_ACTIVA=true en el .env y reiniciar.',
  ]
    .filter(Boolean)
    .join('\n');
  return { aviso, archivo, filas };
}

/** Para las pruebas. */
function reiniciarParaPruebas() {
  barriendo = false;
}

module.exports = {
  comando,
  candidatos,
  revisar,
  estado,
  armarPrueba,
  enFranja,
  partesAR,
  enviadosHoy,
  marcasDe,
  anotar,
  reiniciarParaPruebas,
  COMO_SE_USA,
  MAX_POR_BARRIDO,
  MAX_EVALUADOS_POR_BARRIDO,
  HORA_DESDE,
  HORA_HASTA,
};
