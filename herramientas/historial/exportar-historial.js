'use strict';
/**
 * Exportador del historial de Somos Piedra (15/10/2026). SOLO LEE de Evolution: no manda nada,
 * no crea ni cambia instancias, no toca el webhook, no arranca el bot y no usa ninguna API paga.
 *
 *   node herramientas/historial/exportar-historial.js --probar     (una pagina, no escribe nada)
 *   node herramientas/historial/exportar-historial.js              (exporta todo)
 *   opciones:  --desde=2026-01-01  --hasta=2026-10-15  --salida=data/historial
 *
 * No necesita `npm install`: usa solo Node. Lee el .env de bot-piedra (EVOLUTION_URL,
 * EVOLUTION_INSTANCE, EVOLUTION_APIKEY) sin mostrarlo, y se NIEGA a correr si la instancia falta
 * o es `somosiphone` (el otro bot, en vivo).
 *
 * Solo hace dos llamadas, y una lista cerrada las vigila: POST /chat/findMessages/<instancia>
 * (una lectura de Evolution 2.3.7, filtro por fecha con gte y lte juntos, paginas de 500, del mas
 * nuevo al mas viejo) y GET /instance/connectionState/<instancia>.
 *
 * Escribe en data/historial/export-AAAA-MM-DD-HHMM/ (data/ esta en .gitignore: son conversaciones
 * reales). Una carpeta nueva por corrida: nunca pisa una exportacion anterior.
 *   mensajes.jsonl  un mensaje por linea, por chat y en orden de fecha. Solo texto: de las fotos,
 *                   audios, videos y archivos queda el tipo (y el epigrafe / la duracion / el nombre).
 *   chats.jsonl     un chat por linea, con conteos, quien escribio primero y ultimo, y si Piedra
 *                   nunca contesto.
 *   resumen.json    totales y tokens estimados (lo que se pega para estimar la clasificacion).
 * Quedan afuera los grupos, los estados, los canales y las reacciones / mensajes de sistema; se
 * cuentan en el resumen.
 */
const fs = require('fs');
const path = require('path');
const { textoDelMensaje, loCitado } = require('../../src/texto-del-mensaje');

const RAIZ = path.join(__dirname, '..', '..');
const POR_PAGINA = 500;
const TIMEOUT_MS = 60000;
const REINTENTOS = 3;
const MAX_PAGINAS = 4000;
const CHARS_POR_TOKEN = 3.5; // estimacion gruesa para espanol; la real se mide en la prueba chica
const OVERHEAD_LINEA = 22; // "[14/10 10:32] Cliente: " por mensaje

// ---------------------------------------------------------------- .env y configuracion

function leerEnv(ruta) {
  const h = {};
  let t = '';
  try { t = fs.readFileSync(ruta, 'utf8'); } catch (e) { return h; }
  for (const linea of t.split(/\r?\n/)) {
    if (/^\s*#/.test(linea)) continue;
    const m = linea.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
    if (m) h[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return h;
}

/** La configuracion de Evolution. Tira si falta algo o si apunta a la instancia de iPhone. */
function configuracion(envArchivo, envProceso = process.env) {
  const v = (k) => (envProceso[k] != null && envProceso[k] !== '' ? envProceso[k] : envArchivo[k] || '');
  const url = (v('EVOLUTION_URL') || 'http://localhost:8080').replace(/\/$/, '');
  const instancia = v('EVOLUTION_INSTANCE');
  const apikey = v('EVOLUTION_APIKEY');
  if (!instancia) throw new Error('Falta EVOLUTION_INSTANCE en el .env de bot-piedra (tiene que ser somospiedra).');
  if (instancia.toLowerCase() === 'somosiphone') {
    throw new Error('EVOLUTION_INSTANCE es somosiphone: esa es la instancia del bot de iPhone (en vivo). No se exporta.');
  }
  if (!apikey) throw new Error('Falta EVOLUTION_APIKEY en el .env de bot-piedra.');
  return { url, instancia, apikey };
}

// ---------------------------------------------------------------- Evolution (solo lectura)

const RUTAS_PERMITIDAS = [/^\/chat\/findMessages\/[\w-]+$/, /^\/instance\/connectionState\/[\w-]+$/];
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function llamar(cfg, metodo, ruta, cuerpo, opciones = {}) {
  if (!RUTAS_PERMITIDAS.some((r) => r.test(ruta))) {
    throw new Error(`Ruta no permitida: el exportador solo lee (${metodo} ${ruta}).`);
  }
  const fetchFn = opciones.fetchFn || fetch;
  const espera = opciones.espera != null ? opciones.espera : 1000;
  let ultimo;
  for (let i = 1; i <= REINTENTOS; i++) {
    try {
      const res = await fetchFn(cfg.url + ruta, {
        method: metodo,
        headers: { 'Content-Type': 'application/json', apikey: cfg.apikey },
        body: cuerpo ? JSON.stringify(cuerpo) : undefined,
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return await res.json();
      const detalle = (await res.text().catch(() => '')).slice(0, 200);
      ultimo = new Error(`Evolution ${res.status} en ${ruta}: ${detalle}`);
      if (res.status < 500 && res.status !== 429) { ultimo.noReintentar = true; throw ultimo; }
    } catch (e) {
      ultimo = e;
      if (e.noReintentar) throw e;
    }
    if (i < REINTENTOS) await dormir(espera * i * i);
  }
  throw ultimo;
}

/** Una pagina de mensajes entre `desde` y `hasta` (Date). Devuelve { total, paginas, registros }. */
async function traerPagina(cfg, desde, hasta, pagina, porPagina = POR_PAGINA, opciones = {}) {
  const data = await llamar(cfg, 'POST', `/chat/findMessages/${cfg.instancia}`, {
    where: { messageTimestamp: { gte: desde.toISOString(), lte: hasta.toISOString() } },
    page: pagina,
    offset: porPagina,
  }, opciones);
  const m = data && data.messages;
  if (!m || !Array.isArray(m.records)) throw new Error('Evolution contesto findMessages sin messages.records');
  return { total: Number(m.total) || 0, paginas: Number(m.pages) || 0, registros: m.records };
}

// ---------------------------------------------------------------- de un registro de Evolution a un mensaje

const ENVOLTORIOS = ['ephemeralMessage', 'viewOnceMessage', 'viewOnceMessageV2', 'viewOnceMessageV2Extension', 'documentWithCaptionMessage'];

function desenvolver(msg) {
  let m = msg;
  for (let i = 0; i < 3 && m && typeof m === 'object'; i++) {
    const clave = ENVOLTORIOS.find((k) => m[k] && typeof m[k] === 'object' && m[k].message);
    if (!clave) break;
    m = m[clave].message;
  }
  return m && typeof m === 'object' ? m : {};
}

function entero(v) {
  if (v && typeof v === 'object') return (Number(v.high) >>> 0) * 4294967296 + (Number(v.low) >>> 0);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function tipoDe(inner, messageType) {
  if (inner.reactionMessage) return 'reaccion';
  if (inner.protocolMessage || inner.senderKeyDistributionMessage || (inner.messageContextInfo && Object.keys(inner).length === 1)) return 'sistema';
  if (inner.imageMessage || inner.albumMessage) return 'foto';
  if (inner.videoMessage || inner.ptvMessage) return 'video';
  if (inner.audioMessage) return 'audio';
  if (inner.stickerMessage) return 'sticker';
  if (inner.documentMessage) return 'archivo';
  if (inner.locationMessage || inner.liveLocationMessage) return 'ubicacion';
  if (inner.contactMessage || inner.contactsArrayMessage) return 'contacto';
  if (inner.pollCreationMessage || inner.pollCreationMessageV2 || inner.pollCreationMessageV3 || inner.pollUpdateMessage) return 'encuesta';
  if (inner.productMessage || inner.orderMessage) return 'catalogo';
  if (inner.conversation || inner.extendedTextMessage) return 'texto';
  const t = String(messageType || '');
  if (t === 'conversation' || t === 'extendedTextMessage') return 'texto';
  if (/^image/.test(t)) return 'foto';
  if (/^video/.test(t)) return 'video';
  if (/^audio/.test(t)) return 'audio';
  if (/^document/.test(t)) return 'archivo';
  if (/^sticker/.test(t)) return 'sticker';
  return 'otro';
}

const DESCARTAR = new Set(['sistema', 'reaccion']);

/**
 * Un registro de findMessages como mensaje compacto. Devuelve
 * { ok: true, jid, alt, msg } o { ok: false, motivo } (grupo, difusion, canal, sin_chat, sistema, reaccion, sin_id).
 */
function compactar(r) {
  const key = (r && r.key) || {};
  const jid = String(key.remoteJid || '');
  if (!jid) return { ok: false, motivo: 'sin_chat' };
  if (/@g\.us$/.test(jid)) return { ok: false, motivo: 'grupo' };
  if (/@broadcast$/.test(jid) || jid === 'status@broadcast') return { ok: false, motivo: 'difusion_o_estado' };
  if (/@newsletter$/.test(jid)) return { ok: false, motivo: 'canal' };
  const inner = desenvolver(r.message);
  const tipo = tipoDe(inner, r.messageType);
  if (DESCARTAR.has(tipo)) return { ok: false, motivo: tipo };
  const id = String(key.id || r.id || '');
  if (!id) return { ok: false, motivo: 'sin_id' };
  let ts = entero(r.messageTimestamp);
  if (ts > 1e12) ts = Math.floor(ts / 1000);
  const texto = (textoDelMensaje({ message: inner }) || (inner.documentMessage && String(inner.documentMessage.caption || '').trim()) || '').trim();
  const cita = loCitado(r);
  const msg = { id, ts, fecha: ts ? new Date(ts * 1000).toISOString() : '', de: key.fromMe ? 'piedra' : 'cliente', tipo };
  if (texto) msg.texto = texto;
  if (cita) msg.cita = cita;
  if (tipo === 'audio' && inner.audioMessage && entero(inner.audioMessage.seconds)) msg.seg = entero(inner.audioMessage.seconds);
  if (tipo === 'archivo' && inner.documentMessage && inner.documentMessage.fileName) msg.archivo = String(inner.documentMessage.fileName);
  if (!key.fromMe && r.pushName) msg.nombre = String(r.pushName);
  if (r.source) msg.origen = String(r.source);
  return { ok: true, jid, alt: String(key.remoteJidAlt || ''), msg };
}

// ---------------------------------------------------------------- armar los chats

const soloDigitos = (s) => String(s).replace(/@.*$/, '').replace(/\D/g, '');
const esNumero = (jid) => /@s\.whatsapp\.net$/.test(jid);

/**
 * `compactados`: lo que devuelve compactar con ok: true. Junta por chat (un @lid con su numero
 * cuando algun registro trae remoteJidAlt), saca repetidos por id y ordena por fecha.
 * Devuelve [{ chat, numero, lid, nombre, mensajes }] ordenado por chat.
 */
function armarChats(compactados) {
  const lidANumero = new Map();
  for (const c of compactados) {
    if (/@lid$/.test(c.jid) && esNumero(c.alt)) lidANumero.set(c.jid, soloDigitos(c.alt));
    if (esNumero(c.jid) && /@lid$/.test(c.alt)) lidANumero.set(c.alt, soloDigitos(c.jid));
  }
  const chats = new Map();
  const vistos = new Set();
  for (const c of compactados) {
    let numero = null;
    let lid = null;
    if (esNumero(c.jid)) numero = soloDigitos(c.jid);
    else if (/@lid$/.test(c.jid)) { lid = soloDigitos(c.jid); if (lidANumero.has(c.jid)) numero = lidANumero.get(c.jid); }
    else numero = soloDigitos(c.jid) || null;
    const id = numero || (lid ? `lid-${lid}` : soloDigitos(c.jid));
    if (!id) continue;
    const clave = `${id}|${c.msg.id}`;
    if (vistos.has(clave)) continue;
    vistos.add(clave);
    let ch = chats.get(id);
    if (!ch) { ch = { chat: id, numero, lid, nombre: '', mensajes: [] }; chats.set(id, ch); }
    if (lid && !ch.lid) ch.lid = lid;
    ch.mensajes.push(c.msg);
  }
  const lista = [...chats.values()];
  for (const ch of lista) {
    ch.mensajes.sort((a, b) => a.ts - b.ts);
    const conNombre = ch.mensajes.filter((m) => m.nombre);
    ch.nombre = conNombre.length ? conNombre[conNombre.length - 1].nombre : '';
  }
  return lista.sort((a, b) => (a.chat < b.chat ? -1 : a.chat > b.chat ? 1 : 0));
}

/** La linea de resumen de un chat (chats.jsonl). */
function resumenDeChat(ch) {
  const ms = ch.mensajes;
  const c = { texto: 0, foto: 0, audio: 0, video: 0, sticker: 0, archivo: 0, otros: 0 };
  let delCliente = 0;
  let dePiedra = 0;
  let segAudio = 0;
  let chars = 0;
  for (const m of ms) {
    if (m.de === 'cliente') delCliente++; else dePiedra++;
    if (c[m.tipo] != null) c[m.tipo]++; else c.otros++;
    segAudio += m.seg || 0;
    chars += (m.texto ? m.texto.length : 0) + (m.cita ? m.cita.length : 0) + OVERHEAD_LINEA;
  }
  const primero = ms[0];
  const ultimo = ms[ms.length - 1];
  return {
    chat: ch.chat,
    numero: ch.numero,
    lid: ch.lid,
    nombre: ch.nombre,
    primero: primero ? primero.fecha : '',
    ultimo: ultimo ? ultimo.fecha : '',
    primero_de: primero ? primero.de : '',
    ultimo_de: ultimo ? ultimo.de : '',
    mensajes: ms.length,
    del_cliente: delCliente,
    de_piedra: dePiedra,
    tipos: c,
    seg_audio: segAudio,
    sin_respuesta_de_piedra: delCliente > 0 && dePiedra === 0,
    solo_piedra: delCliente === 0 && dePiedra > 0,
    chars,
    tokens_est: Math.ceil(chars / CHARS_POR_TOKEN),
  };
}

function percentil(ordenados, p) {
  if (!ordenados.length) return 0;
  return ordenados[Math.min(ordenados.length - 1, Math.floor((p / 100) * ordenados.length))];
}

/** Totales de toda la exportacion (resumen.json). */
function estadisticas(resumenes, descartados, extra = {}) {
  const tokens = resumenes.map((r) => r.tokens_est).sort((a, b) => a - b);
  const suma = (f) => resumenes.reduce((a, r) => a + f(r), 0);
  const porMes = {};
  for (const r of resumenes) {
    if (!r.primero) continue;
    const mes = r.primero.slice(0, 7);
    porMes[mes] = (porMes[mes] || 0) + 1;
  }
  const tipos = {};
  for (const r of resumenes) for (const [k, n] of Object.entries(r.tipos)) tipos[k] = (tipos[k] || 0) + n;
  return {
    ...extra,
    chats: resumenes.length,
    mensajes: suma((r) => r.mensajes),
    del_cliente: suma((r) => r.del_cliente),
    de_piedra: suma((r) => r.de_piedra),
    tipos,
    seg_audio_total: suma((r) => r.seg_audio),
    chats_sin_respuesta_de_piedra: resumenes.filter((r) => r.sin_respuesta_de_piedra).length,
    chats_solo_piedra: resumenes.filter((r) => r.solo_piedra).length,
    chats_con_ida_y_vuelta: resumenes.filter((r) => r.del_cliente > 0 && r.de_piedra > 0).length,
    primer_mensaje: resumenes.map((r) => r.primero).filter(Boolean).sort()[0] || '',
    ultimo_mensaje: resumenes.map((r) => r.ultimo).filter(Boolean).sort().pop() || '',
    chats_por_mes_de_inicio: porMes,
    tokens_est_total: tokens.reduce((a, b) => a + b, 0),
    tokens_est_por_chat: { p50: percentil(tokens, 50), p90: percentil(tokens, 90), p99: percentil(tokens, 99), max: tokens[tokens.length - 1] || 0 },
    descartados,
    nota: `Tokens estimados con ${CHARS_POR_TOKEN} caracteres por token: es gruesa, se mide en la muestra chica antes de gastar.`,
  };
}

// ---------------------------------------------------------------- recorrer todo

/** Baja todas las paginas. `alProgreso(info)` se llama despues de cada una. Devuelve { compactados, descartados, leidos }. */
async function traerTodo(cfg, desde, hasta, opciones = {}) {
  const compactados = [];
  const descartados = {};
  let leidos = 0;
  let pagina = 1;
  let paginas = 1;
  while (pagina <= paginas && pagina <= MAX_PAGINAS) {
    const p = await traerPagina(cfg, desde, hasta, pagina, opciones.porPagina || POR_PAGINA, opciones);
    if (pagina === 1) paginas = p.paginas || Math.ceil(p.total / (opciones.porPagina || POR_PAGINA)) || 1;
    for (const r of p.registros) {
      leidos++;
      const c = compactar(r);
      if (c.ok) compactados.push(c); else descartados[c.motivo] = (descartados[c.motivo] || 0) + 1;
    }
    if (opciones.alProgreso) opciones.alProgreso({ pagina, paginas, leidos, total: p.total });
    if (!p.registros.length) break;
    pagina++;
  }
  return { compactados, descartados, leidos };
}

function escribirExportacion(carpeta, chats, resumenes, estad) {
  fs.mkdirSync(carpeta, { recursive: true });
  const m = fs.createWriteStream(path.join(carpeta, 'mensajes.jsonl'), { encoding: 'utf8' });
  for (const ch of chats) for (const msg of ch.mensajes) m.write(JSON.stringify({ chat: ch.chat, ...msg }) + '\n');
  m.end();
  fs.writeFileSync(path.join(carpeta, 'chats.jsonl'), resumenes.map((r) => JSON.stringify(r)).join('\n') + '\n', 'utf8');
  fs.writeFileSync(path.join(carpeta, 'resumen.json'), JSON.stringify(estad, null, 2), 'utf8');
  return new Promise((ok, mal) => { m.on('finish', ok); m.on('error', mal); });
}

// ---------------------------------------------------------------- linea de comandos

function argumentos(argv) {
  const a = { probar: false };
  for (const x of argv) {
    if (x === '--probar') a.probar = true;
    else { const m = x.match(/^--(desde|hasta|salida)=(.+)$/); if (m) a[m[1]] = m[2]; }
  }
  return a;
}

const dos = (n) => String(n).padStart(2, '0');
function marcaDeHora(d) { return `${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`; }

async function probar(cfg, desde, hasta) {
  try {
    const e = await llamar(cfg, 'GET', `/instance/connectionState/${cfg.instancia}`);
    console.log(`Estado de la instancia ${cfg.instancia}: ${(e && ((e.instance && e.instance.state) || e.state)) || JSON.stringify(e)}`);
  } catch (e) { console.log(`Estado de la instancia: no se pudo leer (${e.message})`); }
  const p = await traerPagina(cfg, desde, hasta, 1, 50);
  console.log(`Mensajes guardados en Evolution (entre ${desde.toISOString().slice(0, 10)} y ${hasta.toISOString().slice(0, 10)}): ${p.total}`);
  console.log(`Paginas de ${POR_PAGINA}: ${Math.ceil(p.total / POR_PAGINA)}`);
  const motivos = {};
  const tipos = {};
  let conAlt = 0;
  let lids = 0;
  for (const r of p.registros) {
    const c = compactar(r);
    if (c.ok) { tipos[c.msg.tipo] = (tipos[c.msg.tipo] || 0) + 1; if (c.alt) conAlt++; if (/@lid$/.test(c.jid)) lids++; }
    else motivos[c.motivo] = (motivos[c.motivo] || 0) + 1;
  }
  const r0 = p.registros[0];
  if (r0) {
    console.log('Campos de un registro:', Object.keys(r0).join(', '));
    console.log('Campos de key:', Object.keys(r0.key || {}).join(', '));
  }
  console.log(`En los ${p.registros.length} primeros: tipos`, JSON.stringify(tipos), '| descartados', JSON.stringify(motivos), `| con remoteJidAlt: ${conAlt} | chats @lid: ${lids}`);
  console.log('No se escribio nada. Para exportar de verdad, corre el mismo comando sin --probar.');
}

async function main() {
  const a = argumentos(process.argv.slice(2));
  const cfg = configuracion(leerEnv(path.join(RAIZ, '.env')));
  const desde = a.desde ? new Date(a.desde) : new Date('2020-01-01T00:00:00Z');
  const hasta = a.hasta ? new Date(a.hasta + (a.hasta.length === 10 ? 'T23:59:59Z' : '')) : new Date();
  if (Number.isNaN(desde.getTime()) || Number.isNaN(hasta.getTime())) throw new Error('--desde / --hasta: usa AAAA-MM-DD.');
  console.log(`Instancia: ${cfg.instancia} | Evolution: ${cfg.url} | solo lectura`);
  if (a.probar) return probar(cfg, desde, hasta);

  const t0 = Date.now();
  const { compactados, descartados, leidos } = await traerTodo(cfg, desde, hasta, {
    alProgreso: ({ pagina, paginas, leidos: n, total }) => { if (pagina === 1 || pagina % 5 === 0 || pagina === paginas) console.log(`  pagina ${pagina}/${paginas} (${n} de ${total} mensajes leidos)`); },
  });
  const chats = armarChats(compactados);
  const resumenes = chats.map(resumenDeChat);
  const estad = estadisticas(resumenes, descartados, { instancia: cfg.instancia, leidos_de_evolution: leidos, desde: desde.toISOString(), hasta: hasta.toISOString(), exportado: new Date().toISOString() });
  const carpeta = path.resolve(RAIZ, a.salida || path.join('data', 'historial'), `export-${marcaDeHora(new Date())}`);
  await escribirExportacion(carpeta, chats, resumenes, estad);
  console.log(`\nListo en ${Math.round((Date.now() - t0) / 1000)} s -> ${carpeta}`);
  console.log(JSON.stringify(estad, null, 2));
  console.log('\nCopia lo de arriba (desde "chats") y pegaselo a Claude. No se mando nada a nadie.');
}

if (require.main === module) {
  main().catch((e) => { console.error(`\nERROR: ${e.message}`); process.exitCode = 1; });
}

module.exports = { leerEnv, configuracion, llamar, traerPagina, traerTodo, compactar, armarChats, resumenDeChat, estadisticas, escribirExportacion, argumentos, RUTAS_PERMITIDAS };
