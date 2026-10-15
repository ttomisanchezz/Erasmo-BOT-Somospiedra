'use strict';
/**
 * Panel Chiara, lado bot (06/10/2026). Diseño cerrado por Tomás el 05/10 en el Cortex
 * (areas/ventas-mensajes/panel-chiara.md); el contrato son las columnas y los comentarios de la
 * migración 0013 de la app de ventas (rama panel-chiara). Decisiones del 06/10: la ficha la dice Sonnet,
 * `anuncio_id` va en la 0013, los días arrancan de cero y el gasto del mes incluye la sombra.
 *
 * CADA 1 MINUTO (`vuelta`), contra el Supabase de la app (el mismo del espejo del Cotizador):
 *   1. lee las órdenes del panel (bot_ordenes pendientes), las aplica y las marca 'hecha' o 'error':
 *      pausar / devolver / vendido / perdido hacen lo mismo que #pausa, #sigue, #vendido y #perdido desde
 *      el grupo (y al grupo le llega el mismo aviso, con "📱 Desde el panel"; desde el 08/10/2026 devolver
 *      también le contesta lo que dejó escrito, como #sigue); apagar / prender mueven el interruptor
 *      general (src/interruptor.js);
 *   2. compara el estado de cada chat con la vuelta anterior y anota las noticias (escalado, resuelto,
 *      pausado, devuelto, vendido, perdido), más WhatsApp caído o de vuelta; las del stock de la app
 *      (empezó o dejó de ofrecer un equipo del local) llegan de src/stock-app.js (`delStock`, 08/10/2026);
 *   3. sube bot_estado (una fila), los leads que cambiaron (bot_leads), los días con cambios (bot_dias)
 *      y las noticias nuevas (bot_eventos, sin duplicar por `clave`).
 * Si Supabase no contesta, sigue contando en disco y lo sube en la vuelta siguiente. Nunca tira.
 *
 * LO QUE CUENTA (con los ganchos de index.js y de cerebro.js, que nunca tiran):
 *   - mensajes del cliente (`delCliente`, antes de que el mensaje entre al estado: así se sabe si el chat
 *     es nuevo) y el anuncio de origen si vino de uno (`externalAdReply.sourceId` del mensaje; o la promo del
 *     Día de la Madre, `madre-<palabra>` / `madre`, hasta el 18/10/2026: src/promo-madre.js);
 *   - mensajes que Chiara mandó DE VERDAD (`deChiara`: solo los que Evolution confirmó con su id; los
 *     borradores, la sombra y los bloqueados no llegan acá);
 *   - mensajes de una persona de la cuenta (`delHumano`), y cuánto esperó el cliente la respuesta;
 *   - cada vez que Sonnet piensa (`cerebro.alPensar`): el gasto (de verdad o en sombra), la demora, los
 *     errores, la ficha del cliente (quiere avanzar, cuándo, forma de pago, zona, canje) y si la respuesta
 *     llevaba la cotización (cuenta como cotizado recién cuando sale el mensaje).
 *
 * EN DISCO, `data/chiara.json` (escritura atómica, como estado.json): los contadores por día y por
 * lead, las noticias que faltan subir y lo que se vio de cada chat. La primera vez, el primer contacto de
 * los chats que ya existen sale del registro de aprendizaje; los días arrancan de cero. El gasto de Sonnet
 * del mes no va acá (08/10/2026, decisión de Tomás: una sola cuenta): se sube el de cerebro.js, el de
 * estado.json y /salud, con su tope (CEREBRO_TOPE_MES_USD).
 *
 * NO SE SUBEN: el tester (NUMEROS_TESTER), los contactos personales ni los chats sin número (@lid). Nunca
 * el texto de los chats: de cada lead, el último mensaje del cliente recortado a 80 caracteres; los
 * motivos van sin lo que esté entre comillas.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const cerebro = require('./cerebro');
const control = require('./control');
const ventas = require('./ventas');
const evolution = require('./evolution');
const interruptor = require('./interruptor');
const aprendizaje = require('./aprendizaje');
const chatsViejos = require('./chats-viejos');
const stockApp = require('./stock-app');
const { esCierre } = require('./cierre');
const { MARCADOR, textoDelMensaje, marcadorSinTexto } = require('./texto-del-mensaje');
const { anuncioDe } = require('./anuncio');
const promoMadre = require('./promo-madre');
const { unReintento, horaAR } = require('./supabase-reintento');

const MIN = 60 * 1000;
const CADA_MS = MIN;
const PRIMERA_MS = 15 * 1000;
const TOPE_MS = 15000;
const H72 = 72 * 60 * MIN; // "para cerrar hoy" mira lo que dijo en las últimas 72 h
const COTIZACION_VALE_MS = 10 * MIN; // la cotización pensada cuenta si el mensaje sale en este rato
const DIAS_EN_DISCO = 40;
const MAX_MUESTRAS = 2000;
const MAX_EVENTOS = 500;
const POR_PEDIDO = 200;
const VERSION_DATOS = 1;
const INTENCIONES_QUE_AVANZAN = ['quiere_avanzar', 'pide_turno', 'propone_pago', 'reserva'];

const TEXTO_APAGADA =
  '⏸️ Chiara APAGADA desde el panel: no le contesta a ningún cliente hasta que la prendan. Sigue leyendo y anotando.';
const TEXTO_PRENDIDA =
  '▶️ Chiara PRENDIDA desde el panel: vuelve a contestar. Lo que escribieron mientras estaba apagada no lo contesta sola ' +
  '(los chats que atendía una persona siguen como siempre: al vencer su silencio).';
const SALUD_TOPE_MS = 20000;
const ORDENES_DIAS = 7;

// ============================================================ fechas en hora de Argentina

const DIA_AR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
const diaAR = (ts) => DIA_AR.format(new Date(Number(ts)));
function lunesDe(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}
const mismoDia = (a, b) => Number(a) > 0 && diaAR(a) === diaAR(b);
const mismaSemana = (a, b) => Number(a) > 0 && lunesDe(diaAR(a)) === lunesDe(diaAR(b));
const iso = (ts) => (Number(ts) > 0 && Number(ts) < 8.64e15 ? new Date(Number(ts)).toISOString() : null);

// ============================================================ chiquitos

const r4 = (n) => Math.round((Number(n) || 0) * 1e4) / 1e4;
function mediana(xs) {
  const v = (xs || []).filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  if (!v.length) return null;
  const m = Math.floor(v.length / 2);
  return Math.round(v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2);
}
function sumar(lista, valor) {
  lista.push(valor);
  if (lista.length > MAX_MUESTRAS) lista.splice(0, lista.length - MAX_MUESTRAS);
}
function texto(v, largo) {
  const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
  if (!t) return null;
  const letras = Array.from(t);
  return letras.length > largo ? letras.slice(0, largo - 1).join('').trimEnd() + '…' : t;
}
/** Un motivo para el panel, sin lo que esté entre comillas (suele ser lo que escribió el cliente). */
function sinCitas(t, largo = 140) {
  const limpio = String(t || '').replace(/"[^"]*"|“[^”]*”|«[^»]*»/g, '"…"');
  return texto(limpio, largo);
}
// Fuera de rango (una entrega imposible, un número roto) va null: un valor malo no frena la subida.
const entero = (v, min = 0, max = Number.MAX_SAFE_INTEGER) =>
  Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) >= min && Number(v) <= max ? Math.round(Number(v)) : null;
const decimal = (v, max = 99999999) =>
  Number.isFinite(Number(v)) && v !== null && v !== '' && Number(v) >= 0 && Number(v) < max ? Math.round(Number(v) * 100) / 100 : null;
const INT_MAX = 2147483647;
/** Una promesa con tope: si no termina en `ms`, tira. */
function conTope(promesa, ms, que) {
  let t;
  const tope = new Promise((_, no) => {
    t = setTimeout(() => no(new Error(`${que} no contestó en ${Math.round(ms / 1000)} s`)), ms);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(t));
}

// ============================================================ qué chats cuentan

/** Los dígitos del chat (549…) si es un cliente que va al panel; null si no (tester, personal, @lid). */
function numeroDe(chatId) {
  const m = /^(\d{8,15})@s\.whatsapp\.net$/.exec(String(chatId || ''));
  if (!m) return null;
  if (evolution.esContactoPersonal(chatId)) return null;
  if (evolution.estaEnLaLista(chatId, config.numerosTester)) return null;
  return m[1];
}

// ============================================================ lo que se guarda en disco

let datos = null;
let sucio = false;

function ruta() {
  if (process.env.CHIARA_PATH) return process.env.CHIARA_PATH;
  if (config.estadoPath) return path.join(path.dirname(config.estadoPath), 'chiara.json');
  return path.join(__dirname, '..', 'data', 'chiara.json');
}

const datosVacios = (ahora) => ({
  v: VERSION_DATOS,
  creado: ahora,
  dias: {},
  leads: {},
  eventos: [],
  ordenes: {}, // id → { estado, error, en }: las aplicadas cuyo PATCH todavía no entró (no se vuelven a aplicar)
  whatsapp: { malas: 0, caido: false },
  errorVivo: false,
});

/** Lo de disco, o null si no hay archivo. Un archivo ilegible se aparta (como estado.json) y arranca vacío. */
function cargar() {
  const archivo = ruta();
  let crudo;
  try {
    crudo = fs.readFileSync(archivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e; // EBUSY/EPERM: mejor no pisarlo (arrancar() lo atrapa y no arranca el panel)
  }
  try {
    const d = JSON.parse(crudo);
    if (!d || typeof d !== 'object' || !d.leads || !d.dias) throw new Error('no tiene la forma esperada');
    d.eventos = Array.isArray(d.eventos) ? d.eventos : [];
    d.ordenes = d.ordenes && typeof d.ordenes === 'object' ? d.ordenes : {};
    d.whatsapp = d.whatsapp || { malas: 0, caido: false };
    delete d.mes; // la cuenta del mes del panel, hasta el 08/10/2026: ahora vale la de cerebro.js
    return d;
  } catch (e) {
    const copia = `${archivo}.corrupto-${new Date().toISOString().replace(/:/g, '-')}`;
    try {
      fs.copyFileSync(archivo, copia);
    } catch {
      /* que quede el error de abajo */
    }
    console.error(`[panel] ${archivo} estaba dañado (${e.message}): lo copié a ${copia} y arranco de cero`);
    return null;
  }
}

function dormirSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function guardar() {
  if (!sucio || !datos) return;
  const archivo = ruta();
  const tmp = archivo + '.tmp';
  try {
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(datos));
    for (let i = 0; ; i++) {
      try {
        fs.renameSync(tmp, archivo);
        break;
      } catch (e) {
        const pasajero = e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES';
        if (!pasajero || i >= 5) throw e;
        dormirSync(100 * (i + 1));
      }
    }
    sucio = false;
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ya no está */
    }
    fallo('disco', e);
  }
}

/**
 * La primera vez (sin archivo): el primer mensaje de cada chat, del registro de aprendizaje. Nunca tira:
 * sin registro, arranca en cero.
 */
function delRegistro() {
  const out = { primeros: new Map() };
  let crudo;
  try {
    crudo = fs.readFileSync(aprendizaje.ARCHIVO, 'utf8');
  } catch {
    return out;
  }
  for (const linea of crudo.split('\n')) {
    if (!linea) continue;
    let o;
    try {
      o = JSON.parse(linea);
    } catch {
      continue;
    }
    const ts = typeof o.ts === 'number' ? o.ts : Date.parse(o.ts);
    if (!Number.isFinite(ts)) continue;
    if (o.tipo === 'cliente' && o.clave) {
      const antes = out.primeros.get(o.clave);
      if (!antes || ts < antes) out.primeros.set(o.clave, ts);
    }
  }
  return out;
}

function sembrar(ahora) {
  const d = datosVacios(ahora);
  const reg = delRegistro();
  datos = d;
  for (const [chatId, s] of Object.entries(state.todos())) {
    const num = numeroDe(chatId);
    if (!num) continue;
    let clave = null;
    try {
      clave = aprendizaje.clave(chatId);
    } catch {
      clave = null;
    }
    const delReg = clave ? reg.primeros.get(clave) : null;
    const primero = [delReg, primeroDelHistorial(s)].filter((x) => Number(x) > 0);
    if (!primero.length) continue;
    nuevoLead(num, s).primer = Math.min(...primero);
  }
  sucio = true;
  console.log(`[panel] arranco de cero: ${Object.keys(d.leads).length} chats`);
  return d;
}

// ============================================================ días, leads y noticias

function dia(ts) {
  const d = diaAR(ts);
  let x = datos.dias[d];
  if (!x) {
    x = datos.dias[d] = { chats: [], nuevos: 0, cliente: 0, chiara: 0, humano: 0, escalados: 0, vivo: 0, sombra: 0, llamadas: 0, errores: 0, demoras: [], llamadasMs: [] };
  }
  x.sucio = true;
  sucio = true;
  return x;
}

/**
 * Lo que importa del estado de un chat para las noticias. `escaladoEn` queda aunque el escalado se haya
 * resuelto: así un escalado que se tomó dentro del mismo minuto también es noticia.
 */
function foto(s) {
  return {
    escaladoEn: (s && Number(s.escaladoEn)) || null,
    resueltoTs: (s && s.escaladoResuelto && Number(s.escaladoResuelto.ts)) || null,
    pausado: Boolean(s && s.pausado),
    resultadoTs: (s && s.resultado && Number(s.resultado.ts)) || null,
  };
}

const primeroDelHistorial = (s) => {
  const ts = ((s && s.historial) || []).filter((l) => l && l.quien === 'cliente' && Number(l.ts) > 0).map((l) => Number(l.ts));
  return ts.length ? Math.min(...ts) : null;
};
const ultimaDelCliente = (s) => {
  const ts = ((s && s.historial) || []).filter((l) => l && l.quien === 'cliente' && Number(l.ts) > 0).map((l) => Number(l.ts));
  return ts.length ? Math.max(...ts) : null;
};
const lecturaQueAvanza = (s) =>
  s && s.ultimaLectura && INTENCIONES_QUE_AVANZAN.includes(s.ultimaLectura.intencion) ? Number(s.ultimaLectura.ts) || null : null;
/** La última vez que escribió una persona: `ultimoHumano`, o su última línea (#sigue pone `ultimoHumano` en 0). */
const ultimoHumanoDe = (s) =>
  Math.max(Number(s && s.ultimoHumano) || 0, ...((s && s.historial) || []).filter((l) => l && l.humano).map((l) => Number(l.ts) || 0)) || null;

// Lo que no es un mensaje: una reacción, un borrado o una edición, el voto de una encuesta.
const NO_SON_MENSAJES = ['reactionMessage', 'encReactionMessage', 'protocolMessage', 'editedMessage', 'pollUpdateMessage', 'keepInChatMessage', 'pinInChatMessage'];
const SIN_CONTENIDO = ['messageContextInfo', 'senderKeyDistributionMessage'];
function esMensaje(data) {
  if (textoDelMensaje(data) || marcadorSinTexto(data)) return true;
  const tipos = Object.keys((data && data.message) || {}).filter((k) => !SIN_CONTENIDO.includes(k));
  return tipos.length > 0 && !tipos.every((k) => NO_SON_MENSAJES.includes(k));
}

/** Un lead nuevo en disco, con lo que ya se ve del estado (sin noticias por lo de antes). */
function nuevoLead(num, s) {
  const l = {
    primer: null,
    nombre: null,
    cliente: 0,
    chiara: 0,
    humano: 0,
    ultimoCliente: null,
    fueCotizado: Boolean(s && s.cotizadoDe),
    quisoAvanzar: Boolean(lecturaQueAvanza(s)),
    fueEscalado: Boolean(s && s.escaladoEn),
    ficha: null,
    fichaEn: null,
    quiereAvanzarEn: null,
    cuandoEs: null,
    cuandoEn: null,
    cotizado: null,
    pendiente: null,
    anuncio: null,
    escaladoCerrado: null, // el `escaladoResuelto.ts` del último escalado tomado que ya se cerró
    visto: foto(s),
  };
  datos.leads[num] = l;
  sucio = true;
  return l;
}

/** El lead de ese chat; si no existe y el cliente escribió alguna vez, se crea. Si no, null. */
function leadDe(num, chatId) {
  if (datos.leads[num]) return datos.leads[num];
  const s = state.todos()[chatId];
  const primero = primeroDelHistorial(s);
  if (!primero) return null;
  const l = nuevoLead(num, s);
  l.primer = primero;
  return l;
}

// `id`: lo que distingue dos noticias sin teléfono de la misma hora (el código del equipo en las del stock).
function evento(tipo, num, en, { nombre = null, detalle = null, id = null } = {}) {
  const clave = `${tipo}:${num || '-'}:${en}${id ? `:${id}` : ''}`;
  if (datos.eventos.some((e) => e.clave === clave)) return;
  datos.eventos.push({ clave, en, tipo, telefono: num || null, nombre: texto(nombre, 60), detalle: sinCitas(detalle, 140) });
  if (datos.eventos.length > MAX_EVENTOS) datos.eventos.splice(0, datos.eventos.length - MAX_EVENTOS);
  sucio = true;
}

/**
 * ¿El chat ya existía antes del bot? Está en la lista de chats viejos (data/chats-viejos.json, la que
 * arma la puesta al día con Evolution). Así un cliente de antes que vuelve a escribir no es un lead nuevo.
 */
function conocidoDeAntes(chatId) {
  try {
    return Boolean(chatsViejos.listo() && evolution.estaEnLaLista(chatId, chatsViejos.numeros()));
  } catch {
    return false;
  }
}

// ============================================================ si el cliente espera respuesta

/** ¿Esta línea del cliente pide respuesta? Un "gracias", un "dale" o un sticker, no. */
function pideRespuesta(t) {
  const x = String(t || '').trim();
  if (!x) return false;
  if (MARCADOR.test(x)) return x !== '[sticker]';
  return !esCierre(x);
}

/**
 * Desde cuándo espera el cliente: la primera línea suya que pide respuesta después de lo último que le
 * llegó (de Chiara o de una persona). null si no espera, o si lo último que escribió tiene más de 72 h
 * (una charla que quedó ahí no es un aviso: en el ensayo con el estado real del 06/10 eran 50 de 72).
 */
function esperaDesde(s, ahora = Date.now()) {
  if (!s) return null;
  const h = s.historial || [];
  let ultima = Math.max(Number(s.ultimoEnvioCliente) || 0, Number(s.ultimoHumano) || 0);
  for (const l of h) if (l && l.quien === 'vendedor' && !l.sinConfirmar && Number(l.ts) > ultima) ultima = Number(l.ts);
  const esperan = h.filter((l) => l && l.quien === 'cliente' && Number(l.ts) > ultima && pideRespuesta(l.texto));
  if (!esperan.length || ahora - Number(esperan[esperan.length - 1].ts) > H72) return null;
  return Number(esperan[0].ts);
}

/**
 * El escalado como lo muestra el panel: abierto desde que escala hasta que Chiara vuelve a atender. Si
 * lo tomó una persona (escribió alguien de la cuenta), sigue abierto mientras dura su silencio o la
 * pausa, con `tomado` = cuándo escribió. Se cierra para siempre (`cerrado`, el ts de ese
 * `escaladoResuelto`, que el estado no borra) apenas pasa el silencio o Chiara le vuelve a escribir: si
 * la persona escribe de nuevo días después, no se reabre.
 */
function escaladoDe(s, ahora, cerrado = null) {
  const nada = { abierto: false, en: null, tomado: null };
  if (!s) return nada;
  if (s.escalado) return { abierto: true, en: Number(s.escaladoEn) || null, tomado: null };
  const r = s.escaladoResuelto;
  const en = Number(s.escaladoEn) || 0;
  const tomado = Number(r && r.ts) || 0;
  if (!tomado || !en || tomado < en || tomado === Number(cerrado)) return nada;
  if (!/alguien de la cuenta/.test(String(r.porque || ''))) return nada;
  if (Number(s.ultimoEnvioCliente) > tomado) return nada; // Chiara ya le volvió a escribir
  const conPersona = Boolean(s.pausado) || (Number(s.ultimoHumano) > 0 && ahora - Number(s.ultimoHumano) < config.silencioTrasHumanoMin * MIN);
  return conPersona ? { abierto: true, en, tomado } : nada;
}

// ============================================================ los ganchos (nunca tiran)

let activo = false;

/** Un mensaje del cliente, antes de entrar al estado. */
function delCliente(chatId, data, ahora = Date.now()) {
  if (!activo) return;
  try {
    const num = numeroDe(chatId);
    if (!num || !esMensaje(data)) return;
    const s = state.todos()[chatId];
    let l = datos.leads[num];
    const esNuevo = !l && !s && !conocidoDeAntes(chatId);
    if (!l) {
      l = nuevoLead(num, s);
      l.primer = esNuevo ? ahora : primeroDelHistorial(s) || ahora;
    }
    const nombre = String((data && data.pushName) || '').trim();
    if (nombre && nombre !== num) l.nombre = texto(nombre, 60);
    const d = dia(ahora);
    if (esNuevo) {
      d.nuevos++;
      evento('lead_nuevo', num, ahora, { nombre: l.nombre });
    }
    if (!d.chats.includes(num)) d.chats.push(num);
    d.cliente++;
    l.cliente++;
    l.ultimoCliente = ahora;
    if (!l.anuncio) {
      // Un anuncio de verdad (externalAdReply) o, mientras dure, la promo del Día de la Madre
      // (src/promo-madre.js, 12/10/2026): `madre-<palabra>` o `madre`. El primero que aparece se queda.
      const anuncio = anuncioDe(data) || promoMadre.anuncioDe(textoDelMensaje(data), ahora);
      if (anuncio) {
        l.anuncio = anuncio;
        console.log(`[panel] …${num.slice(-4)} vino del anuncio ${anuncio}`);
      }
    }
    sucio = true;
  } catch (e) {
    console.error('[panel] no pude contar el mensaje del cliente:', e.message);
  }
}

/**
 * El origen de un lead por la promo del Día de la Madre cuando la regla la reconoce después de que entró el
 * mensaje: un audio, que recién se lee al transcribirlo (`delCliente` solo ve el texto escrito). No pisa un
 * anuncio ya anotado. Nunca tira.
 */
function conPromo(chatId, anuncioId) {
  if (!activo) return;
  try {
    const num = numeroDe(chatId);
    if (!num || !anuncioId) return;
    const l = leadDe(num, chatId);
    if (!l || l.anuncio) return;
    l.anuncio = anuncioId;
    sucio = true;
    console.log(`[panel] …${num.slice(-4)} vino de la promo ${anuncioId}`);
  } catch (e) {
    console.error('[panel] no pude anotar el origen de la promo:', e.message);
  }
}

function respuesta(chatId, quien, ahora) {
  if (!activo) return;
  try {
    const num = numeroDe(chatId);
    if (!num) return;
    const s = state.todos()[chatId];
    const d = dia(ahora);
    d[quien]++;
    const espera = esperaDesde(s, ahora);
    if (espera && ahora >= espera) sumar(d.demoras, Math.round((ahora - espera) / 1000));
    const l = leadDe(num, chatId);
    if (!l) return;
    l[quien]++;
    if (quien === 'chiara' && l.pendiente && ahora - l.pendiente.en <= COTIZACION_VALE_MS) {
      l.fueCotizado = true;
      l.cotizado = { modelo: l.pendiente.modelo, entrega: l.pendiente.entrega, en: ahora };
      l.pendiente = null;
    }
  } catch (e) {
    console.error('[panel] no pude contar la respuesta:', e.message);
  }
}

/** Un mensaje que Chiara mandó de verdad (Evolution lo confirmó con su id). */
const deChiara = (chatId, ahora = Date.now()) => respuesta(chatId, 'chiara', ahora);

/** #apagar / #prender desde el grupo (06/10/2026): la noticia para "lo que pasó" del panel. Nunca tira. */
function interruptorDesdeGrupo(prendida, ahora = Date.now()) {
  if (!activo) return;
  try {
    evento(prendida ? 'prendida' : 'apagada', null, ahora, { detalle: 'desde el grupo' });
  } catch (e) {
    console.error('[panel] no pude anotar el cambio del interruptor:', e.message);
  }
}
/**
 * Lo que Chiara empezó o dejó de ofrecer del local (src/stock-app.js, 08/10/2026, `alCambiarLaOferta`, que
 * escucha desde que arranca el panel hasta `_detener`): la noticia para "lo que pasó hoy", sin teléfono, con
 * el equipo en el detalle. Si tira, stock-app lo atrapa.
 */
function delStock({ tipo, en, codigo = null, detalle = null }) {
  evento(tipo, null, en, { detalle, id: codigo });
}
/** Un mensaje de una persona de la cuenta, antes de que se mueva `ultimoHumano`. */
const delHumano = (chatId, ahora = Date.now()) => respuesta(chatId, 'humano', ahora);

/** Cada vez que Sonnet termina de pensar (cerebro.alPensar). */
function alPensar({ chatId, vivo, ahora, r }) {
  if (!activo || !r) return;
  const t = Date.now();
  const d = dia(t);
  const usd = Number(r.usd) || 0;
  if (vivo) {
    d.vivo += usd;
  } else {
    d.sombra += usd;
  }
  d.llamadas++;
  if (Number.isFinite(r.ms)) sumar(d.llamadasMs, r.ms);
  const num = numeroDe(chatId);
  if (r.error) {
    d.errores++;
    if (vivo && !datos.errorVivo) {
      datos.errorVivo = true;
      evento('error', num, t, { detalle: `Sonnet no responde (${cerebro.motivoCorto(r.error)}): contesta el bot de siempre` });
    }
  } else if (vivo) {
    datos.errorVivo = false;
  }
  if (!num) return;
  const l = leadDe(num, chatId);
  if (!l) return;
  const cuando = Number(ahora) > 0 ? Number(ahora) : t;
  if (r.ficha) aplicarFicha(l, r.ficha, cuando);
  if (vivo && r.conCotizacion && !r.escalar && r.datos && r.datos.modelo) {
    const gb = Number(r.datos.capacidad_gb) || 0;
    l.pendiente = {
      modelo: gb ? `${r.datos.modelo} ${gb >= 1024 ? `${gb / 1024}TB` : `${gb}GB`}` : r.datos.modelo,
      entrega: entero(r.datos.entrega),
      en: t,
    };
  }
}

function aplicarFicha(l, f, ts) {
  const antes = l.ficha || {};
  l.ficha = {
    cuando: f.cuando || antes.cuando || null,
    forma_pago: f.forma_pago || antes.forma_pago || null,
    zona: f.zona || antes.zona || null,
    canje: f.canje || antes.canje || null,
  };
  l.fichaEn = ts;
  if (f.quiere_avanzar) {
    l.quisoAvanzar = true;
    l.quiereAvanzarEn = ts;
  } else {
    l.quiereAvanzarEn = null;
  }
  if (f.cuando_es) {
    l.cuandoEs = f.cuando_es;
    l.cuandoEn = ts;
  }
}

// ============================================================ cada vuelta: noticias de los chats

function revisarChats(ahora) {
  for (const [chatId, s] of Object.entries(state.todos())) {
    const num = numeroDe(chatId);
    if (!num || !s) continue;
    // La primera vez que se lo ve, el lead nace con lo de ahora (`visto`): sin noticias por lo de antes.
    const l = datos.leads[num] || leadDe(num, chatId);
    if (!l) continue;
    const f = foto(s);
    const v = l.visto || {};
    const nombre = s.nombre || l.nombre;
    if (f.escaladoEn && f.escaladoEn !== v.escaladoEn) {
      evento('escalado', num, f.escaladoEn, { nombre, detalle: s.escaladoMotivo });
      dia(f.escaladoEn).escalados++;
      l.fueEscalado = true;
    }
    if (f.resueltoTs && f.resueltoTs !== v.resueltoTs) {
      evento('resuelto', num, f.resueltoTs, { nombre, detalle: s.escaladoResuelto && s.escaladoResuelto.porque });
    }
    if (f.pausado !== Boolean(v.pausado)) evento(f.pausado ? 'pausado' : 'devuelto', num, ahora, { nombre });
    if (f.resultadoTs && f.resultadoTs !== v.resultadoTs && ['vendido', 'perdido'].includes(s.resultado.tipo)) {
      evento(s.resultado.tipo, num, f.resultadoTs, { nombre });
    }
    if (JSON.stringify(f) !== JSON.stringify(v)) {
      l.visto = f;
      sucio = true;
    }
    // El escalado que tomó una persona se cierra una sola vez (ver escaladoDe).
    const tomado = Number(s.escaladoResuelto && s.escaladoResuelto.ts) || 0;
    if (tomado && !s.escalado && l.escaladoCerrado !== tomado && !escaladoDe(s, ahora, l.escaladoCerrado).abierto) {
      l.escaladoCerrado = tomado;
      sucio = true;
    }
  }
}

function revisarWhatsapp(salud, ahora) {
  if (!salud) return;
  const w = datos.whatsapp;
  const antes = JSON.stringify(w);
  if (salud.whatsapp === 'open') {
    w.malas = 0;
    if (w.caido) {
      w.caido = false;
      evento('whatsapp_volvio', null, ahora);
    }
  } else {
    w.malas = (w.malas || 0) + 1;
    // Dos vueltas seguidas (2 minutos) sin 'open': así un reinicio de Evolution no es una noticia.
    if (w.malas >= 2 && !w.caido) {
      w.caido = true;
      evento('whatsapp_caido', null, ahora, { detalle: `WhatsApp: ${salud.whatsapp || 'sin respuesta'}` });
    }
  }
  if (JSON.stringify(w) !== antes) sucio = true;
}

// ============================================================ las filas de Supabase

function filaDeLead(num, l, s, ahora) {
  const esc = escaladoDe(s, ahora, l.escaladoCerrado);
  const resultado = s.resultado && ['vendido', 'perdido'].includes(s.resultado.tipo) ? s.resultado : null;
  const ficha = l.ficha || {};
  const formaPago = ficha.forma_pago || (['contado', 'cuotas'].includes(s.forma_pago) ? s.forma_pago : null);
  const cot = l.cotizado || (s.cotizadoDe ? { modelo: s.cotizadoDe, entrega: s.entregaCotizada } : null);
  const ultimoCliente = Math.max(Number(l.ultimoCliente) || 0, ultimaDelCliente(s) || 0) || null;
  const respondido =
    l.chiara > 0 ||
    l.humano > 0 ||
    Number(s.ultimoEnvioCliente) > 0 ||
    Number(s.ultimoHumano) > 0 ||
    (s.historial || []).some((h) => h && h.quien === 'vendedor' && !h.sinConfirmar);
  const quiere = l.quiereAvanzarEn || lecturaQueAvanza(s);
  const fueCotizado = Boolean(l.fueCotizado || s.cotizadoDe);
  const quisoAvanzar = Boolean(l.quisoAvanzar || lecturaQueAvanza(s));
  const fueEscalado = Boolean(l.fueEscalado || s.escaladoEn || esc.abierto);
  const reciente = (ts) => Number(ts) > 0 && ahora - Number(ts) <= H72;

  // Manda la más avanzada: vendido/perdido > escalado > quiere_avanzar > cotizado > consultando > nuevo
  let etapa = 'nuevo';
  if (resultado) etapa = resultado.tipo;
  else if (esc.abierto) etapa = 'escalado';
  else if (quisoAvanzar) etapa = 'quiere_avanzar';
  else if (fueCotizado) etapa = 'cotizado';
  else if (respondido || s.modelo) etapa = 'consultando';

  const motivos = [];
  if (!resultado) {
    if (reciente(quiere)) motivos.push('quiere_avanzar');
    if ((l.cuandoEs === 'hoy' && mismoDia(l.cuandoEn, ahora)) || (l.cuandoEs === 'esta_semana' && mismaSemana(l.cuandoEn, ahora))) {
      motivos.push('dijo_cuando');
    }
    if (cot && entero(cot.entrega) !== null && formaPago && reciente(ultimoCliente)) motivos.push('cotizado_completo');
    if (esc.abierto && !esc.tomado) motivos.push('escalado');
  }

  const canjeDelEstado = s.permuta && s.permuta.ofrece
    ? texto([s.permuta.modelo && `iPhone ${String(s.permuta.modelo).replace(/^iphone\s*/i, '')}`, s.permuta.capacidad_gb && `${s.permuta.capacidad_gb}GB`, s.permuta.bateria && `${s.permuta.bateria}%`].filter(Boolean).join(' ') || 'trae canje', 80)
    : null;
  const escaladoEn = esc.abierto ? esc.en || ultimoCliente || ahora : null;

  return {
    telefono: num,
    nombre: texto(s.nombre || l.nombre, 60),
    modelo: texto(s.modelo, 60),
    capacidad_gb: entero(s.capacidad_gb, 1, 100000),
    entrega: entero(s.entrega),
    entrega_usd: decimal(s.entregaDolares),
    forma_pago: formaPago,
    zona: ficha.zona || texto(s.zona, 60),
    cuando: ficha.cuando || texto(s.timing, 60),
    canje: ficha.canje || canjeDelEstado,
    intencion: reciente(quiere) ? 'quiere_avanzar' : (s.ultimaLectura && texto(s.ultimaLectura.intencion, 40)) || null,
    cotizado_de: cot ? texto(cot.modelo, 60) : null,
    entrega_cotizada: cot ? entero(cot.entrega) : null,
    etapa,
    cerrar_hoy: motivos,
    fue_cotizado: fueCotizado,
    quiso_avanzar: quisoAvanzar,
    fue_escalado: fueEscalado,
    escalado: esc.abierto,
    escalado_en: iso(escaladoEn),
    escalado_motivo: esc.abierto ? sinCitas(s.escaladoMotivo, 140) : null,
    escalado_tomado_en: esc.abierto ? iso(esc.tomado) : null,
    pausado: Boolean(s.pausado),
    resultado: resultado ? resultado.tipo : null,
    resultado_en: resultado ? iso(Number(resultado.ts) || ahora) : null,
    primer_contacto: iso(l.primer || ultimoCliente || ahora),
    ultimo_cliente_en: iso(ultimoCliente),
    ultimo_chiara_en: iso(s.ultimoEnvioCliente),
    ultimo_humano_en: iso(ultimoHumanoDe(s)),
    espera_desde: iso(esperaDesde(s, ahora)),
    mensajes_cliente: entero(l.cliente, 0, INT_MAX) || 0,
    mensajes_chiara: entero(l.chiara, 0, INT_MAX) || 0,
    mensajes_humano: entero(l.humano, 0, INT_MAX) || 0,
    ultimo_mensaje: texto(s.ultimoMensajeCliente, 80),
    anuncio_id: l.anuncio || null,
  };
}

function filaDeDia(dia, x, ahora) {
  return {
    dia,
    leads: x.chats.length,
    leads_nuevos: x.nuevos,
    mensajes_cliente: x.cliente,
    mensajes_chiara: x.chiara,
    mensajes_humano: x.humano,
    escalados: x.escalados,
    gasto_usd: r4(x.vivo),
    sombra_usd: r4(x.sombra),
    llamadas: x.llamadas,
    errores: x.errores,
    demora_respuesta_s: mediana(x.demoras),
    demora_llamada_ms: mediana(x.llamadasMs),
    actualizado_en: iso(ahora),
  };
}

let deps = {};
let arranco = Date.now();

function filaDeEstado(salud, ahora) {
  const hoy = datos.dias[diaAR(ahora)] || { vivo: 0, sombra: 0, llamadas: 0, errores: 0, llamadasMs: [] };
  // El del mes es el de cerebro.js (08/10/2026): el mismo de /salud y del aviso del 80%, con su tope.
  const mes = cerebro.gastoDelMes(ahora);
  const sombraActiva = Boolean(salud && salud.sombraPersona && salud.sombraPersona.activa);
  const modo = config.cerebro.modo;
  const version = (deps.version && deps.version()) || {};
  const entrante = deps.ultimoEntrante ? deps.ultimoEntrante() : null;
  return {
    id: 1,
    actualizado_en: iso(ahora),
    prendida: interruptor.prendida(),
    whatsapp: (salud && salud.whatsapp) || null,
    contesta: modo === 'apagado' || modo === 'sombra' || cerebro.enFalla() ? 'gemini' : 'sonnet',
    modo: deps.modo ? deps.modo() : null,
    version: version.commit ? String(version.commit) : null,
    arranco_en: iso(Date.parse(version.arranque) || arranco),
    ultimo_entrante: iso(entrante),
    gasto_hoy_usd: r4(hoy.vivo),
    gasto_mes_usd: r4(mes.usd),
    tope_mes_usd: mes.tope,
    sombra_hoy_usd: r4(hoy.sombra),
    sombra_tope_dia_usd: sombraActiva && config.cerebro.sombraPersonaTopeUsd > 0 ? config.cerebro.sombraPersonaTopeUsd : null,
    sombra_hasta: sombraActiva ? config.cerebro.sombraPersonaHasta : null,
    llamadas_hoy: hoy.llamadas,
    errores_hoy: hoy.errores,
    demora_llamada_ms: mediana(hoy.llamadasMs),
    salud: salud || {},
  };
}

// ============================================================ Supabase

function configurado() {
  return Boolean(config.panel.activo && config.techsur.supabaseUrl && config.techsur.supabaseKey);
}

function cabeceras(extra = {}) {
  const key = config.techsur.supabaseKey;
  const h = { apikey: key, ...extra };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

/** Un pedido a Supabase; un 57014 o un timeout se reintenta una vez (src/supabase-reintento.js) y queda en el log. */
function pedir(ruta, opciones) {
  const tabla = ruta.split('?')[0];
  return unReintento(
    () => pedirUnaVez(ruta, opciones),
    (e, ms) => console.warn(`[panel] ${horaAR()} ${tabla}: ${e.message}; reintento en ${ms / 1000} s`)
  );
}

async function pedirUnaVez(ruta, { method = 'GET', body = null, prefer = null } = {}) {
  const url = `${config.techsur.supabaseUrl.replace(/\/$/, '')}/rest/v1/${ruta}`;
  const extra = {};
  if (body) extra['Content-Type'] = 'application/json';
  if (prefer) extra.Prefer = prefer;
  const res = await fetch(url, { method, headers: cabeceras(extra), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TOPE_MS) });
  if (!res.ok) {
    // Solo el código y el mensaje de PostgREST, sin `details` ("Failing row contains (…)" trae la fila con
    // datos del cliente) ni lo que venga después de ': "' (un valor que no entró): esto va a /salud.
    const crudo = await res.text().catch(() => '');
    let detalle = '';
    try {
      const j = JSON.parse(crudo);
      detalle = [j.code, String(j.message || '').replace(/:\s*".*$/, '')].filter(Boolean).join(' ');
    } catch {
      detalle = '';
    }
    const e = new Error(`Supabase ${res.status} en ${ruta.split('?')[0]}${detalle ? `: ${detalle.slice(0, 160)}` : ''}`);
    e.status = res.status;
    throw e;
  }
  return method === 'GET' ? res.json() : null;
}

const UPSERT = 'resolution=merge-duplicates,return=minimal';
const subidos = new Map(); // 'tabla:clave' → hash de lo último que subió bien

async function subirEstado(salud, ahora) {
  await pedir('bot_estado?on_conflict=id', { method: 'POST', body: [filaDeEstado(salud, ahora)], prefer: UPSERT });
}

async function subirLeads(ahora) {
  const cambios = [];
  const todos = state.todos();
  for (const [num, l] of Object.entries(datos.leads)) {
    // Un #reset borra el chat del estado: la fila queda neutra (sin escalado, pausa ni espera), con lo que
    // ya se sabía del lead, para que no quede un aviso colgado en el panel.
    const s = todos[`${num}@s.whatsapp.net`] || {};
    const fila = filaDeLead(num, l, s, ahora);
    const hash = JSON.stringify(fila);
    if (subidos.get(`lead:${num}`) === hash) continue;
    cambios.push({ num, hash, fila: { ...fila, actualizado_en: iso(ahora) } });
  }
  const subir = (filas) => pedir('bot_leads?on_conflict=telefono', { method: 'POST', body: filas, prefer: UPSERT });
  for (let i = 0; i < cambios.length; i += POR_PEDIDO) {
    const tanda = cambios.slice(i, i + POR_PEDIDO);
    try {
      await subir(tanda.map((c) => c.fila));
      for (const c of tanda) subidos.set(`lead:${c.num}`, c.hash);
    } catch (e) {
      // Un 400 es una fila que la base no acepta: se prueban de a una y la mala queda afuera (hasta que
      // cambie), así no frena a las demás. Cualquier otro error (sin red, sin la 0013) se reintenta entero.
      if (e.status !== 400) throw e;
      for (const c of tanda) {
        try {
          await subir([c.fila]);
        } catch (e1) {
          if (e1.status !== 400) throw e1;
          fallo('leads', new Error(`el lead …${c.num.slice(-4)} no entró: ${e1.message}`));
        }
        subidos.set(`lead:${c.num}`, c.hash);
      }
    }
  }
  return cambios.length;
}

async function subirDias(ahora) {
  const sucios = Object.entries(datos.dias).filter(([, x]) => x.sucio);
  if (!sucios.length) return 0;
  const filas = sucios.map(([d, x]) => filaDeDia(d, x, ahora));
  // Se limpia ANTES de subir: lo que se cuente mientras tanto lo vuelve a marcar y va en la vuelta siguiente.
  for (const [, x] of sucios) x.sucio = false;
  sucio = true;
  try {
    await pedir('bot_dias?on_conflict=dia', { method: 'POST', body: filas, prefer: UPSERT });
  } catch (e) {
    for (const [, x] of sucios) x.sucio = true;
    throw e;
  }
  return filas.length;
}

async function subirEventos() {
  const lote = datos.eventos.slice(0, POR_PEDIDO);
  if (!lote.length) return 0;
  const subir = (eventos) =>
    pedir('bot_eventos?on_conflict=clave', {
      method: 'POST',
      body: eventos.map((e) => ({ clave: e.clave, en: iso(e.en), tipo: e.tipo, telefono: e.telefono, nombre: e.nombre, detalle: e.detalle })),
      prefer: 'resolution=ignore-duplicates,return=minimal',
    });
  try {
    await subir(lote);
  } catch (e) {
    // Un 400 es una noticia que la base no acepta (un tipo nuevo antes de la migración de la app, como los del
    // stock): se prueban de a una y la mala queda afuera, así no traba las demás. Otro error se reintenta entero.
    if (e.status !== 400) throw e;
    for (const ev of lote) {
      try {
        await subir([ev]);
      } catch (e1) {
        if (e1.status !== 400) throw e1;
        fallo('noticia rechazada', new Error(`la noticia ${ev.tipo} no entró: ${e1.message}`));
      }
    }
  }
  const subidas = new Set(lote.map((e) => e.clave));
  datos.eventos = datos.eventos.filter((e) => !subidas.has(e.clave));
  sucio = true;
  return lote.length;
}

// ============================================================ las órdenes del panel

const primeraLinea = (t) => texto(String(t || '').split('\n').find((x) => x.trim()) || '', 200);

/**
 * Un aviso al grupo, SIN esperarlo: un envío a Evolution que se cuelga no puede frenar la vuelta (y con
 * ella el "último dato" del panel). Nunca tira.
 */
function avisar(textoAviso) {
  if (!textoAviso || !deps.avisarGrupo) return;
  Promise.resolve()
    .then(() => deps.avisarGrupo(textoAviso))
    .catch((e) => console.error('[panel] no pude avisar al grupo:', e.message));
}

/**
 * La tanda de un "devolver" que contesta, como la de #sigue desde el grupo: arranca YA (sin otro await
 * entre `alSeguir` y `atenderChat`, como en index.js) y no se la espera: la vuelta sigue. Nunca tira.
 */
function contestar(chatId) {
  new Promise((listo) => listo(deps.atenderChat(chatId, (state.todos()[chatId] || {}).nombre || ''))).catch((e) =>
    console.error(`[panel] no pude contestarle a …${String(chatId).split('@')[0].slice(-4)}:`, e.message)
  );
}

/** Aplica una orden. Devuelve { estado: 'hecha' } o { estado: 'error', error }. Los avisos van sin esperar. */
function aplicarOrden(o, ahora) {
  if (o.tipo === 'apagar' || o.tipo === 'prender') {
    const prender = o.tipo === 'prender';
    if (interruptor.poner(prender, 'panel', ahora)) {
      evento(prender ? 'prendida' : 'apagada', null, ahora, { detalle: 'desde el panel' });
      avisar(prender ? TEXTO_PRENDIDA : TEXTO_APAGADA);
    }
    return { estado: 'hecha' };
  }
  if (!o.telefono) return { estado: 'error', error: 'la orden no trae teléfono' };
  if (o.tipo === 'pausar' || o.tipo === 'devolver') {
    // "Devolver" es #sigue desde el grupo (decisión de Tomás del 08/10/2026): con `alSeguir` de index.js, si
    // toca le contesta lo que dejó escrito y el aviso lo dice. Sin `atenderChat` no hay quien conteste:
    // solo reactiva, como antes.
    const seguir = o.tipo === 'devolver' && deps.atenderChat ? { alSeguir: deps.alSeguir } : {};
    const r = control.desdeGrupo({ tipo: o.tipo === 'pausar' ? 'pausa' : 'sigue', numero: String(o.telefono) }, ahora, seguir);
    if (!r.chatId) return { estado: 'error', error: primeraLinea(r.aviso) || 'no encontré ese chat' };
    if (r.contesta) contestar(r.chatId);
    if (r.aviso) avisar(`📱 Desde el panel · ${r.aviso}`);
    return { estado: 'hecha' };
  }
  if (o.tipo === 'vendido' || o.tipo === 'perdido') {
    const r = ventas.desdeGrupo({ tipo: o.tipo, numero: String(o.telefono) }, `panel:${o.id}`, new Date(ahora));
    if (!r.chatId) return { estado: 'error', error: primeraLinea(r.aviso) || 'no encontré ese chat' };
    if (r.aviso) avisar(`📱 Desde el panel · ${r.aviso}`);
    return { estado: 'hecha' };
  }
  return { estado: 'error', error: `orden desconocida: ${o.tipo}` };
}

/**
 * Las órdenes pendientes, de la más vieja a la más nueva. Cada una se aplica UNA vez: lo aplicado queda en
 * disco (`datos.ordenes`) hasta que su PATCH entra, así un PATCH que falla no la vuelve a aplicar (un
 * "devolver" repetido cortaría el silencio de una persona). Un PATCH que falla no frena a las demás.
 */
async function aplicarOrdenes(ahora) {
  const ordenes = await pedir('bot_ordenes?select=id,tipo,telefono,creado_en&estado=eq.pendiente&order=creado_en.asc&limit=50');
  let n = 0;
  for (const o of Array.isArray(ordenes) ? ordenes : []) {
    let r = datos.ordenes[o.id];
    if (!r) {
      try {
        r = aplicarOrden(o, ahora);
      } catch (e) {
        r = { estado: 'error', error: texto(e.message, 200) };
      }
      r = { estado: r.estado, error: r.estado === 'error' ? r.error || 'error' : null, en: Date.now() };
      datos.ordenes[o.id] = r;
      sucio = true;
      console.log(`[panel] orden ${o.tipo}${o.telefono ? ` …${String(o.telefono).slice(-4)}` : ''}: ${r.estado}${r.error ? ` (${r.error})` : ''}`);
    }
    try {
      await pedir(`bot_ordenes?id=eq.${encodeURIComponent(o.id)}&estado=eq.pendiente`, {
        method: 'PATCH',
        body: { estado: r.estado, hecha_en: iso(r.en), error: r.error },
        prefer: 'return=minimal',
      });
      delete datos.ordenes[o.id];
      sucio = true;
    } catch (e) {
      fallo('órdenes', e);
    }
    n++;
  }
  return n;
}

// ============================================================ la vuelta

let timers = [];
let enVuelta = false;
let ultimaVuelta = null;
let ultimoError = null;
const errores = new Map();

function fallo(paso, e) {
  const msg = (e && e.message) || String(e);
  ultimoError = { paso, msg, en: iso(Date.now()) };
  const antes = errores.get(paso);
  if (!antes || antes.msg !== msg || Date.now() - antes.en > 10 * MIN) {
    console.error(`[panel] ${horaAR()} ${paso}: ${msg}`);
    errores.set(paso, { msg, en: Date.now() });
  }
}

async function paso(nombre, fn) {
  try {
    const r = await fn();
    if (errores.has(nombre)) {
      errores.delete(nombre);
      console.log(`[panel] ${horaAR()} ${nombre}: anda de nuevo`);
    }
    return r;
  } catch (e) {
    fallo(nombre, e);
    return null;
  }
}

function podar(ahora) {
  const limite = diaAR(ahora - DIAS_EN_DISCO * 24 * 60 * MIN);
  for (const [d, x] of Object.entries(datos.dias)) {
    if (d < limite && !x.sucio) {
      delete datos.dias[d];
      sucio = true;
    }
  }
  for (const [id, o] of Object.entries(datos.ordenes)) {
    if (ahora - (Number(o.en) || 0) > ORDENES_DIAS * 24 * 60 * MIN) {
      delete datos.ordenes[id];
      sucio = true;
    }
  }
}

// El archivo del interruptor no se pudo leer (Chiara quedó apagada por las dudas): se avisa una vez.
let problemaAvisado = null;
function revisarInterruptor() {
  const p = interruptor.problema();
  if (p && problemaAvisado !== p) {
    problemaAvisado = p;
    avisar(`⚠️ No pude leer el interruptor de Chiara (data/interruptor.json: ${texto(p, 80)}). Queda APAGADA por las dudas: prendela desde el panel.`);
  }
  if (!p) problemaAvisado = null;
}

/** Una vuelta: órdenes, noticias de los chats y la subida. Devuelve lo que hizo, o null si no corrió. */
async function vuelta(ahora = Date.now()) {
  if (!activo || enVuelta) return null;
  enVuelta = true;
  const r = { ordenes: 0, leads: 0, dias: 0, eventos: 0 };
  try {
    revisarInterruptor();
    if (configurado()) r.ordenes = (await paso('órdenes', () => aplicarOrdenes(ahora))) || 0;
    const salud = deps.salud ? await paso('salud', () => conTope(deps.salud(), SALUD_TOPE_MS, '/salud')) : null;
    await paso('chats', () => {
      revisarWhatsapp(salud, ahora);
      revisarChats(ahora);
    });
    if (configurado()) {
      await paso('estado', () => subirEstado(salud, ahora));
      r.leads = (await paso('leads', () => subirLeads(ahora))) || 0;
      r.dias = (await paso('días', () => subirDias(ahora))) || 0;
      r.eventos = (await paso('noticias', () => subirEventos())) || 0;
    }
    podar(ahora);
    ultimaVuelta = ahora;
  } finally {
    guardar();
    enVuelta = false;
  }
  return r;
}

let sacarOyente = null;
let sacarOyenteStock = null;
const alSalir = () => guardar();

/**
 * Arranca el panel: carga lo de disco (o lo arma la primera vez), escucha a Sonnet y programa las
 * vueltas (a los 15 s y cada 1 minuto). Solo desde index.js cuando el bot corre de verdad. `d`: { salud,
 * modo, version, ultimoEntrante, avisarGrupo, alSeguir, atenderChat }, y `sinTimers` para las pruebas.
 * Devuelve si arrancó.
 */
function arrancar(d = {}) {
  if (activo) return true;
  if (!config.panel.activo) return false;
  try {
    datos = cargar() || sembrar(Date.now());
  } catch (e) {
    console.error(`[panel] no pude leer ${ruta()} (${e.message}): el panel no arranca para no pisarlo`);
    datos = null;
    return false;
  }
  deps = d;
  arranco = Date.now();
  activo = true;
  const version = (deps.version && deps.version()) || {};
  evento('reinicio', null, arranco, { detalle: version.commit ? `versión ${version.commit}` : null });
  sacarOyente = cerebro.alPensar(alPensar);
  sacarOyenteStock = stockApp.alCambiarLaOferta(delStock);
  process.on('exit', alSalir);
  if (!configurado()) console.warn('[panel] sin SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: cuento en disco pero no subo nada');
  if (!d.sinTimers) {
    const una = setTimeout(() => vuelta().catch(() => {}), PRIMERA_MS);
    const cada = setInterval(() => vuelta().catch(() => {}), CADA_MS);
    for (const t of [una, cada]) if (typeof t.unref === 'function') t.unref();
    timers = [una, cada];
  }
  return true;
}

/** Para /salud. */
function resumen() {
  return {
    activo,
    subiendo: activo && configurado(),
    ultimaVuelta: iso(ultimaVuelta),
    noticiasSinSubir: datos ? datos.eventos.length : 0,
    ultimoError,
  };
}

module.exports = {
  arrancar,
  vuelta,
  delCliente,
  conPromo,
  deChiara,
  delHumano,
  interruptorDesdeGrupo,
  resumen,
  ruta,
  // para las pruebas
  anuncioDe,
  esperaDesde,
  escaladoDe,
  filaDeLead,
  datos: () => datos,
  _detener() {
    for (const t of timers) clearTimeout(t);
    timers = [];
    if (sacarOyente) sacarOyente();
    sacarOyente = null;
    if (sacarOyenteStock) sacarOyenteStock();
    sacarOyenteStock = null;
    process.removeListener('exit', alSalir);
    if (activo) guardar();
    activo = false;
    datos = null;
    sucio = false;
    problemaAvisado = null;
    subidos.clear();
    errores.clear();
    ultimaVuelta = null;
    ultimoError = null;
    enVuelta = false;
  },
};
