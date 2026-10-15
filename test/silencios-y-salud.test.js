'use strict';
/**
 * Bloque Ninjo 2 (06/10/2026, de la revisión de Ninjo del 05/10, puntos 3.1 a 3.3): ver lo que pasa.
 *
 *   node test/silencios-y-salud.test.js
 *
 *   1. El registro de aprendizaje dice por qué una línea del cliente se quedó sin respuesta (evento
 *      `silencio`, con el motivo) y qué salió de verdad por WhatsApp (evento `entrega`: uno por mensaje
 *      a un cliente, con el id que devolvió Evolution, o con `error` si el envío falló).
 *   2. La versión de las reglas de Sonnet: el hash de cerebro-reglas.md (8 caracteres del sha256, con
 *      los finales de línea en \n), en cada propuesta de Sonnet (`sonnet.reglas`), en /salud y en la
 *      consola al arrancar.
 *   3. /salud con lo que de verdad corre: la config del seguimiento, el silencio y el resumen; el gasto
 *      de Sonnet del mes (en estado.json, armado del registro si no está, con el aviso del 80%); y los
 *      avisos al grupo que no salieron.
 *
 * Todo por `procesar` (como el webhook), con un `fetch` de mentira que contesta como la API de
 * Anthropic y un Evolution de mentira: nunca sale a la red.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const http = require('http');
const net = require('net');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'silencios-salud-'));
const GRUPO = '120363000000000088@g.us';
const TESTER = '5490000088888';
const PERSONAL = '5490000077777';

// El entorno se fija acá y no se hereda del .env (dotenv no pisa lo que ya está puesto).
process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '6';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = TESTER;
process.env.NUMEROS_PILOTO = 'todos';
process.env.SOLO_CHATS_NUEVOS = '';
process.env.CONTACTOS_PERSONALES = PERSONAL;
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.SILENCIO_MAX_HORAS = '72';
process.env.SILENCIO_MAX_POR_BARRIDO = '3';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.SEGUIMIENTO_MAX_HORAS = '24';
process.env.SEGUIMIENTO_MAX_POR_BARRIDO = '2';
process.env.SEGUIMIENTO_HORAS_1 = '3';
process.env.SEGUIMIENTO_FRANJA_DESDE = '10';
process.env.SEGUIMIENTO_FRANJA_HASTA = '21';
process.env.SEGUIMIENTO_MANANA_HASTA = '12';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
process.env.RESUMEN_HORA = '9';
process.env.GUARDIAN_ACTIVO = 'false';
process.env.TECHSUR_ACTIVO = 'false';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.SHEET_ID = '';
process.env.GOOGLE_CREDENTIALS_PATH = path.join(TMP, 'no-hay-credenciales.json');
process.env.FOTOS_DIR = path.join(TMP, 'sin-fotos');
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
// Sonnet contesta todos los chats, como corre el bot desde el bloque 1b.
process.env.CEREBRO_MODO = 'todos';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.CEREBRO_TOPE_MES_USD = '60';
// Un solo tope (08/10/2026): CEREBRO_TOPE_MES_USD manda; la del panel es solo el respaldo.
process.env.CHIARA_TOPE_MES_USD = '45';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
// Sin clave de Evolution, contexto.js no pide el historial (y buscarMensajesDeChat está reemplazado).
process.env.EVOLUTION_URL = 'http://evolution.de-prueba.invalid';
process.env.EVOLUTION_INSTANCE = 'instancia-de-prueba';
process.env.EVOLUTION_APIKEY = '';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// La API de Anthropic de mentira y el Evolution de mentira (para avisarGrupo de verdad)
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const USD_POR_LLAMADA = (1000 * 2 + 100 * 10 + 2000 * 0.2 + 500 * 2.5) / 1e6;
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const responde = (mensajes) => [usar('responder', { mensajes })];
const escala = (motivo) => [usar('escalar', { motivo })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
}
/** Cómo contesta el Evolution de mentira a un POST (solo lo usa el avisarGrupo de verdad). */
let evolutionContesta = null;
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (u.startsWith('http://evolution.de-prueba.invalid/') && evolutionContesta) return evolutionContesta(u, opciones);
  if (!u.startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + u);
  pedidos.push(JSON.parse(opciones.body));
  const paso = pasos.shift();
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  if (paso.status) return comoRespuesta(paso.status, { type: 'error', error: { type: 'api_error', message: 'de mentira' } });
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};

// ---------------------------------------------------------------------------
// El bot, sin red
// ---------------------------------------------------------------------------
const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const avisarGrupoReal = evolution.avisarGrupo;
const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
// Cuántos envíos al cliente fallan (Evolution contesta 500), uno por vez.
let fallarEnvios = 0;
function enviar(numero, tipo, texto) {
  if (fallarEnvios > 0) {
    fallarEnvios--;
    throw new Error('Evolution 500 en /message/sendText/instancia-de-prueba: {"error":"C:\\\\Users\\\\x\\\\evolution\\\\dist\\\\main.js"}');
  }
  const id = 'EV' + ++idEnvio;
  aClientes.push({ numero, tipo, texto, id });
  return { key: { remoteJid: numero, fromMe: true, id } };
}
evolution.enviarTexto = async (numero, t) => enviar(numero, 'texto', t);
evolution.enviarImagen = async (numero) => enviar(numero, 'imagen', '');
evolution.enviarDocumento = async (numero, ruta, pie) => enviar(numero, 'documento', pie);
// Lo que pasa mientras el bot muestra "escribiendo…" (un mensaje nuevo, un #reset): una vez.
let alEscribir = null;
evolution.mostrarEscribiendo = async (numero) => {
  if (alEscribir) {
    const f = alEscribir;
    alEscribir = null;
    await f(numero);
  }
  return {};
};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });
evolution.buscarMensajesDeChat = async () => [];

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const control = require('../src/control');
const aprendizaje = require('../src/aprendizaje');

let nId = 0;
const nuevoId = () => `C${Date.now()}-${++nId}`;
const escrito = (chatId, t, id = nuevoId()) => ({ key: { remoteJid: chatId, fromMe: false, id }, pushName: 'Lucia', message: { conversation: t } });
const mio = (chatId, t) => ({ key: { remoteJid: chatId, fromMe: true, id: 'H' + ++nId }, pushName: 'Tomi', message: { conversation: t } });
/** El cliente escribe; devuelve el id de su línea. */
async function habla(chat, t) {
  const id = nuevoId();
  await bot.procesar(escrito(chat, t, id));
  return id;
}
let n = 0;
const nuevoChat = () => '54900002' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const tester = `${TESTER}@s.whatsapp.net`;
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);

function eventos() {
  try {
    return fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const delChat = (chat) => eventos().filter((e) => e.clave === aprendizaje.clave(chat));
const silenciosDe = (chat) => delChat(chat).filter((e) => e.tipo === 'silencio');
const entregasDe = (chat) => delChat(chat).filter((e) => e.tipo === 'entrega');
const propuestasDe = (chat) => delChat(chat).filter((e) => e.tipo === 'propuesta');
async function esperarHasta(cond, ms = 2000) {
  for (let t = 0; t < ms && !cond(); t += 10) await dormir(10);
}
/** Un chat al que hoy ya se le habló: lo que contesta Sonnet sale sin el saludo del día delante. */
function chatSaludado() {
  const chat = nuevoChat();
  state.actualizar(chat, { saludoEn: Date.now() });
  return chat;
}

const MES_AR = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit' });
const mesDe = (ts) => MES_AR.format(ts).slice(0, 7);
/** Una hora de Argentina (UTC-3, sin horario de verano): "2026-09-29 10:00". */
const AR = (texto) => Date.parse(texto.replace(' ', 'T') + ':00-03:00');
const MIN = 60 * 1000;

function pedirSalud(puerto) {
  return new Promise((resolve, reject) => {
    const req = http.get({ host: '127.0.0.1', port: puerto, path: '/salud' }, (res) => {
      let t = '';
      res.on('data', (c) => (t += c));
      res.on('end', () => {
        try {
          resolve({ texto: t, json: JSON.parse(t) });
        } catch (e) {
          reject(new Error('/salud no devolvió JSON: ' + t.slice(0, 300)));
        }
      });
    });
    req.on('error', reject);
  });
}
async function salud() {
  const servidor = bot.app.listen(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  try {
    return await pedirSalud(servidor.address().port);
  } finally {
    servidor.close();
  }
}
function puertoLibre() {
  return new Promise((resolve, reject) => {
    const s = net.createServer();
    s.once('error', reject);
    s.listen(0, '127.0.0.1', () => {
      const { port } = s.address();
      s.close(() => resolve(port));
    });
  });
}
function internoGuardado() {
  state.guardarAhora();
  return JSON.parse(fs.readFileSync(process.env.ESTADO_PATH, 'utf8'))['bot:interno'] || {};
}

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}

// Si una promesa queda colgada y no hay timers, Node sale con 0 a mitad de la prueba: así no pasa en silencio.
let terminado = false;
process.on('exit', (codigo) => {
  if (!terminado && codigo === 0) {
    console.log('\nLA PRUEBA NO TERMINÓ (una promesa quedó colgada)\n');
    process.exitCode = 1;
  }
});

(async () => {
  console.log('\n1. Los silencios y lo que salió de verdad (evento `silencio` y `entrega`)\n');

  await check('Sonnet contesta 2 mensajes: 2 `entrega` con origen "sonnet", el id de Evolution, el texto y la tanda', async () => {
    const chat = chatSaludado();
    guion(responde(['sii, tenemos el 13', 'que capacidad buscabas?']));
    const id = await habla(chat, 'tenes el 13?');
    const [prop] = propuestasDe(chat);
    assert.ok(prop, 'no hay propuesta');
    assert.deepStrictEqual(prop.lineas, [id]);
    const entregas = entregasDe(chat);
    assert.strictEqual(entregas.length, 2, JSON.stringify(entregas));
    assert.deepStrictEqual(entregas.map((e) => e.texto), ['sii, tenemos el 13', 'que capacidad buscabas?']);
    assert.deepStrictEqual(entregas.map((e) => e.id), aEste(chat).map((m) => m.id), 'los ids no son los que devolvió Evolution');
    for (const e of entregas) {
      assert.strictEqual(e.origen, 'sonnet');
      assert.strictEqual(e.formato, 'texto');
      assert.strictEqual(e.tanda, prop.tanda);
      assert.ok(!('error' in e), 'una entrega que salió lleva error');
      assert.deepStrictEqual(Object.keys(e).slice(0, 6), ['v', 'ts', 'chat', 'clave', 'tipo', 'commit']);
    }
    assert.deepStrictEqual(silenciosDe(chat), [], 'una tanda que salió dejó un silencio');
  });

  await check('la tanda se corta por un mensaje nuevo: `silencio` con motivo "corte" y ninguna `entrega` de esa tanda', async () => {
    const chat = chatSaludado();
    guion(responde(['primera respuesta']), responde(['respuesta a todo junto']));
    let segunda = null;
    alEscribir = async () => {
      segunda = await habla(chat, 'ah y otra cosa');
    };
    const primera = await habla(chat, 'tenes el 14?');
    const [p1, p2] = propuestasDe(chat);
    assert.ok(p1 && p2, 'no hubo dos tandas');
    const [s] = silenciosDe(chat);
    assert.ok(s, 'no se anotó el silencio del corte');
    assert.strictEqual(s.motivo, 'corte');
    assert.strictEqual(s.tanda, p1.tanda);
    assert.deepStrictEqual(s.lineas, [primera]);
    assert.ok(!entregasDe(chat).some((e) => e.tanda === p1.tanda), 'salió algo de la tanda cortada');
    assert.deepStrictEqual(entregasDe(chat).map((e) => [e.texto, e.tanda]), [['respuesta a todo junto', p2.tanda]]);
    assert.deepStrictEqual(p2.lineas, [primera, segunda]);
  });

  await check('escribe dentro del silencio de una persona: `silencio` con motivo "persona" (y la sombra con persona lleva sonnet.reglas)', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, 'hola, ahi te paso los precios'));
    config.cerebro.sombraPersonaHasta = '2099-12-31';
    const antes = cerebro.gastoDelMes().usd;
    try {
      guion(responde(['contestaria esto']));
      const id = await habla(chat, 'dale, y el 15?');
      assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas]), [['persona', [id]]]);
      assert.deepStrictEqual(entregasDe(chat), []);
      await esperarHasta(() => delChat(chat).some((e) => e.tipo === 'propuesta-sonnet'));
    } finally {
      config.cerebro.sombraPersonaHasta = '';
    }
    const sombra = delChat(chat).find((e) => e.tipo === 'propuesta-sonnet');
    assert.ok(sombra, 'la sombra con persona no anotó nada');
    assert.strictEqual(sombra.conPersona, 'persona');
    assert.strictEqual(sombra.sonnet && sombra.sonnet.reglas, cerebro.REGLAS_HASH, 'la sombra con persona no lleva sonnet.reglas');
    // Lo que gasta la sombra con persona también suma al mes.
    assert.strictEqual(Math.round((cerebro.gastoDelMes().usd - antes) * 1e6), Math.round(USD_POR_LLAMADA * 1e6));
  });

  await check('con #pausa: `silencio` con motivo "pausado"', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, '#pausa'));
    const id = await habla(chat, 'hola? siguen ahi?');
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas]), [['pausado', [id]]]);
    assert.deepStrictEqual(entregasDe(chat), []);
  });

  await check('chat escalado y callado: `silencio` con motivo "escalado"', async () => {
    const chat = nuevoChat();
    control.escalar(chat, 'de prueba', { calla: true });
    const id = await habla(chat, 'me confirmas el turno?');
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas]), [['escalado', [id]]]);
    assert.deepStrictEqual(entregasDe(chat), []);
  });

  await check('todo lo que iba a contestar ya se dijo: `silencio` con motivo "repetido"', async () => {
    const chat = chatSaludado();
    state.agregarAlHistorial(chat, 'vendedor', 'contame que modelo buscabas', { id: 'EV-viejo' });
    guion(responde(['contame que modelo buscabas']));
    const id = await habla(chat, 'hola, una consulta');
    const [prop] = propuestasDe(chat);
    assert.ok(prop && prop.escalar, 'el caso no prueba nada: no escaló por repetido');
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas, s.tanda]), [['repetido', [id], prop.tanda]]);
    assert.deepStrictEqual(entregasDe(chat), []);
  });

  await check('Sonnet escala: `silencio` con motivo "escalo"', async () => {
    const chat = chatSaludado();
    guion(escala('sigue un trato de una persona'));
    const id = await habla(chat, 'lo del precio que me dijo fran sigue?');
    const [prop] = propuestasDe(chat);
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas, s.tanda]), [['escalo', [id], prop.tanda]]);
    assert.deepStrictEqual(entregasDe(chat), []);
  });

  await check('un contacto personal: nada en el registro (ni silencio, ni entrega, ni nada)', async () => {
    const chat = `${PERSONAL}@s.whatsapp.net`;
    const antes = eventos().length;
    await habla(chat, 'hola amor, compras pan?');
    await bot.procesar(mio(chat, 'si'));
    await bot.procesar({ key: { remoteJid: chat, fromMe: false, id: 'P-sticker' }, pushName: 'Ma', message: { stickerMessage: {} } });
    await dormir(30);
    assert.strictEqual(eventos().length, antes, 'un contacto personal dejó eventos: ' + JSON.stringify(eventos().slice(antes)));
    assert.deepStrictEqual(aEste(chat), []);
  });

  await check('Evolution falla al mandar: `entrega` con `error` corto (sin rutas), sin id, y el silencio "error"', async () => {
    const chat = chatSaludado();
    guion(responde(['te paso la info del 16']));
    fallarEnvios = 1;
    let id;
    try {
      id = await habla(chat, 'tenes el 16?');
    } finally {
      fallarEnvios = 0;
    }
    const entregas = entregasDe(chat);
    assert.strictEqual(entregas.length, 1, JSON.stringify(entregas));
    const [e] = entregas;
    assert.strictEqual(e.id, null);
    assert.strictEqual(e.origen, 'sonnet');
    assert.strictEqual(e.texto, 'te paso la info del 16');
    assert.ok(/^Evolution 500\b/.test(e.error), 'el error no dice qué pasó: ' + e.error);
    assert.ok(!/[A-Za-z]:\\|\/message\/|main\.js/.test(e.error), 'el error lleva rutas: ' + e.error);
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas]), [['error', [id]]]);
  });

  await check('el seguimiento sale: `entrega` con origen "seguimiento"', async () => {
    // Los chats de antes no tienen que recibir nada.
    for (const [chatId, s] of Object.entries(state.todos())) if (s && s.ultimoPrecioBot) state.actualizar(chatId, { ultimoPrecioBot: 0 });
    const precio = AR('2026-09-29 11:00');
    const chat = nuevoChat();
    state.actualizar(chat, {
      ultimoBot: precio,
      ultimoEnvioCliente: precio,
      ultimoPrecioBot: precio,
      historial: [
        { quien: 'cliente', texto: 'tenes el 13?', ts: precio - MIN },
        { quien: 'vendedor', texto: 'el 13 esta $495.000 de contado', ts: precio },
      ],
    });
    config.seguimiento.activo = true;
    try {
      await bot.revisarSeguimientos({ escribiendoMs: 1, reloj: () => AR('2026-09-29 15:00') });
    } finally {
      config.seguimiento.activo = false;
    }
    const [m] = aEste(chat);
    assert.ok(m, 'el caso no prueba nada: el seguimiento no salió');
    const entregas = entregasDe(chat);
    assert.deepStrictEqual(entregas.map((e) => [e.origen, e.formato, e.texto, e.id, e.tanda]), [['seguimiento', 'texto', 'contame como te quedan los numeros!', m.id, null]]);
    assert.ok(delChat(chat).some((e) => e.tipo === 'seguimiento'), 'se perdió el evento `seguimiento` de siempre');
  });

  await check('#reset del tester con la tanda mandándose: `silencio` "corte" (#reset); el 🔄 Reiniciado sale y no deja `entrega`', async () => {
    const chat = tester;
    state.actualizar(chat, { saludoEn: Date.now() });
    guion(responde(['uno', 'dos']));
    alEscribir = () => bot.procesar(escrito(chat, '#reset'));
    const id = await habla(chat, 'tenes el 12?');
    const s = silenciosDe(chat).find((x) => x.motivo === 'corte');
    assert.ok(s, 'no se anotó el corte por el #reset: ' + JSON.stringify(silenciosDe(chat)));
    assert.strictEqual(s.detalle, '#reset');
    assert.deepStrictEqual(s.lineas, [id]);
    assert.ok(aEste(chat).some((m) => /Reiniciado/.test(m.texto)), 'el caso no prueba nada: no salió el 🔄 Reiniciado');
    // El #reset no deja nada en el registro (test/reset.test.js): tampoco la entrega de su confirmación.
    assert.deepStrictEqual(entregasDe(chat), [], 'quedó una entrega: ' + JSON.stringify(entregasDe(chat)));
  });

  await check('un sticker o una foto sin texto fuera de un canje: `silencio` "sin-texto"; una reacción, nada', async () => {
    const chat = nuevoChat();
    const datos = (id, message) => ({ key: { remoteJid: chat, fromMe: false, id }, pushName: 'Lucia', message });
    await bot.procesar(datos('S1', { stickerMessage: {} }));
    await bot.procesar(datos('F1', { imageMessage: {} }));
    await bot.procesar(datos('R1', { reactionMessage: { text: '👍', key: { id: 'EV1' } } }));
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.formato, s.lineas]), [
      ['sin-texto', 'sticker', ['S1']],
      ['sin-texto', 'foto', ['F1']],
    ]);
  });

  await check('en escucha y en borrador no sale nada: `silencio` "escucha" y "borrador"', async () => {
    const a = chatSaludado();
    const b = chatSaludado();
    config.modoEscucha = true;
    try {
      guion(responde(['esto no sale']));
      await habla(a, 'tenes el 13 pro?');
    } finally {
      config.modoEscucha = false;
    }
    config.modoBorrador = true;
    try {
      guion(responde(['esto va de borrador']));
      await habla(b, 'tenes el 13 pro max?');
    } finally {
      config.modoBorrador = false;
    }
    assert.deepStrictEqual(silenciosDe(a).map((s) => s.motivo), ['escucha']);
    assert.deepStrictEqual(silenciosDe(b).map((s) => s.motivo), ['borrador']);
    assert.deepStrictEqual([...entregasDe(a), ...entregasDe(b)], []);
  });

  await check('fuera de las listas de prueba: `silencio` "fuera-de-prueba"', async () => {
    const chat = chatSaludado();
    const antes = { piloto: config.numerosPiloto, todos: config.pilotoTodos };
    config.pilotoTodos = false;
    config.numerosPiloto = ['5490000066666'];
    try {
      assert.strictEqual(evolution.esDestinoDePrueba(chat), false, 'el caso no prueba nada');
      guion(responde(['esto no le llega']));
      await habla(chat, 'tenes el 15 pro?');
    } finally {
      config.pilotoTodos = antes.todos;
      config.numerosPiloto = antes.piloto;
    }
    assert.deepStrictEqual(silenciosDe(chat).map((s) => s.motivo), ['fuera-de-prueba']);
    assert.deepStrictEqual(entregasDe(chat), []);
  });

  // Panel Chiara + bloque Ninjo 2 (merge del 06/10/2026): apagada desde el panel no se contesta ni se llama a
  // Sonnet, y queda el porqué.
  await check('Chiara apagada desde el panel: `silencio` "apagada" con la línea, sin llamar a Sonnet y sin `entrega`', async () => {
    const interruptor = require('../src/interruptor');
    const chat = chatSaludado();
    const antes = pedidos.length;
    interruptor.poner(false, 'prueba');
    let id;
    try {
      id = await habla(chat, 'tenes el 14?');
    } finally {
      interruptor.poner(true, 'prueba');
    }
    assert.strictEqual(pedidos.length, antes, 'llamó a Sonnet con Chiara apagada');
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas]), [['apagada', [id]]]);
    assert.deepStrictEqual(entregasDe(chat), []);
  });

  await check('un acuse al que Sonnet iba a contestar algo ya dicho: `silencio` "repetido" (no escala)', async () => {
    const chat = chatSaludado();
    state.agregarAlHistorial(chat, 'vendedor', 'cualquier cosa que necesites avisame', { id: 'EV-viejo2' });
    guion(responde(['cualquier cosa que necesites avisame']));
    const id = await habla(chat, 'ok');
    const [prop] = propuestasDe(chat);
    assert.ok(prop && !prop.escalar && /^acuse: /.test(prop.motivo), 'el caso no prueba nada: ' + JSON.stringify(prop && { escalar: prop.escalar, motivo: prop.motivo }));
    assert.deepStrictEqual(silenciosDe(chat).map((s) => [s.motivo, s.lineas, s.tanda]), [['repetido', [id], prop.tanda]]);
  });

  await check('el bot de siempre deja de contestar por no venta: `silencio` "sin-venta", la primera vez y las siguientes', async () => {
    const chat = chatSaludado();
    state.actualizar(chat, { sinVenta: 5 });
    config.cerebro.modo = 'apagado';
    try {
      await habla(chat, 'jaja');
      await habla(chat, 'nada');
    } finally {
      config.cerebro.modo = 'todos';
    }
    assert.ok(alGrupo.some((t) => t.startsWith('🤐')), 'el caso no prueba nada: no se calló por no venta');
    assert.deepStrictEqual(silenciosDe(chat).map((s) => s.motivo), ['sin-venta', 'sin-venta']);
    assert.deepStrictEqual(entregasDe(chat), []);
  });

  await check('Sonnet no responde (500): contesta el bot de siempre (`entrega` con origen "bot") y el error lleva sonnet.reglas', async () => {
    const chat = chatSaludado();
    guion({ status: 500 }, { status: 500 });
    await habla(chat, 'tenes el iphone 13?');
    const fallo = delChat(chat).find((e) => e.tipo === 'propuesta-sonnet' && e.enVivo);
    assert.ok(fallo && fallo.error, 'no quedó el error de Sonnet');
    assert.strictEqual(fallo.sonnet && fallo.sonnet.reglas, cerebro.REGLAS_HASH);
    const entregas = entregasDe(chat);
    assert.ok(entregas.length && entregas.every((e) => e.origen === 'bot' && e.id), JSON.stringify(entregas));
  });

  await check('un chat que atiende el bot de siempre: la `entrega` va con origen "bot", y la sombra de Sonnet lleva sonnet.reglas', async () => {
    const chat = chatSaludado();
    config.cerebro.modo = 'tester';
    try {
      assert.strictEqual(cerebro.quienAtiende(chat), 'sombra', 'el caso no prueba nada');
      guion(responde(['lo que diria sonnet']));
      await habla(chat, 'tenes el iphone 13?');
      await esperarHasta(() => delChat(chat).some((e) => e.tipo === 'propuesta-sonnet'));
    } finally {
      config.cerebro.modo = 'todos';
    }
    const entregas = entregasDe(chat);
    assert.ok(entregas.length, 'el bot de siempre no mandó nada');
    assert.ok(entregas.every((e) => e.origen === 'bot'), JSON.stringify(entregas.map((e) => e.origen)));
    const sombra = delChat(chat).find((e) => e.tipo === 'propuesta-sonnet');
    assert.ok(sombra, 'la sombra no anotó nada');
    assert.strictEqual(sombra.sonnet && sombra.sonnet.reglas, cerebro.REGLAS_HASH);
  });

  console.log('\n2. La versión de las reglas\n');

  const crudo = fs.readFileSync(path.join(__dirname, '..', 'src', 'cerebro-reglas.md'), 'utf8');
  const conLf = crudo.replace(/\r\n/g, '\n');
  const HASH = crypto.createHash('sha256').update(conLf).digest('hex').slice(0, 8);
  const LINEAS = conLf.replace(/\n$/, '').split('\n').length;

  await check('el hash: 8 caracteres del sha256 con los finales en \\n; igual con \\r\\n, distinto si cambia una letra', async () => {
    assert.ok(/^[0-9a-f]{8}$/.test(cerebro.REGLAS_HASH), cerebro.REGLAS_HASH);
    assert.strictEqual(cerebro.REGLAS_HASH, HASH);
    assert.strictEqual(cerebro.hashDeReglas(conLf.replace(/\n/g, '\r\n')), HASH, 'con \\r\\n da otro hash');
    assert.strictEqual(cerebro.hashDeReglas(conLf), HASH);
    const otra = conLf.replace(/a/, 'e');
    assert.notStrictEqual(otra, conLf);
    assert.notStrictEqual(cerebro.hashDeReglas(otra), HASH, 'una letra distinta da el mismo hash');
    assert.strictEqual(cerebro.lineaDeReglas(), `CEREBRO: reglas ${HASH} (${LINEAS} líneas)`);
  });

  await check('va en la propuesta de Sonnet (`sonnet.reglas`)', async () => {
    const chat = chatSaludado();
    guion(responde(['dale, contame']));
    await habla(chat, 'buenas, una consulta del 11');
    const [prop] = propuestasDe(chat);
    assert.strictEqual(prop.fuente, 'sonnet');
    assert.strictEqual(prop.sonnet.reglas, HASH);
  });

  console.log('\n3. /salud con lo que de verdad corre\n');

  await check('/salud: config (seguimiento, silencio, resumen), cerebro.reglas, cerebro.gastoMes y avisosGrupo, sin datos de clientes', async () => {
    const { texto, json } = await salud();
    assert.deepStrictEqual(json.config, {
      seguimiento: { activo: false, franja: '10-21', horasPrimero: 3, segundoHasta: 12, maxPorBarrido: 2 },
      silencio: { minutosTrasPersona: 45, maxHoras: 72, maxPorBarrido: 3 },
      resumen: { activo: false, hora: 9 },
    });
    // La sombra con persona ya dice hasta qué día: no se duplica.
    assert.ok('hasta' in json.sombraPersona);
    assert.strictEqual(json.cerebro.reglas, HASH);
    const g = json.cerebro.gastoMes;
    assert.deepStrictEqual(Object.keys(g), ['mes', 'usd', 'tope', 'porcentaje']);
    assert.strictEqual(g.mes, mesDe(Date.now()));
    assert.strictEqual(g.tope, 60);
    assert.strictEqual(g.usd, cerebro.gastoDelMes().usd);
    assert.ok(g.usd > 0, 'el caso no prueba nada: no hubo gasto');
    assert.strictEqual(g.porcentaje, Math.round((g.usd / 60) * 1000) / 10);
    assert.deepStrictEqual(Object.keys(json.avisosGrupo), ['noSalieron', 'ultimo']);
    for (const chat of Object.keys(state.todos())) assert.ok(!texto.includes(chat.split('@')[0]), '/salud muestra un número de cliente');
  });

  await check('el gasto del mes suma cada llamada y queda en estado.json (bot:interno.gastoSonnetMes)', async () => {
    state.guardarGastoSonnetMes({ mes: mesDe(Date.now()), usd: 1 });
    const chat = chatSaludado();
    guion(responde(['dale']));
    await habla(chat, 'tenes el 12 pro?');
    const g = cerebro.gastoDelMes();
    assert.strictEqual(Math.round(g.usd * 1e6), Math.round((1 + USD_POR_LLAMADA) * 1e6));
    assert.deepStrictEqual(internoGuardado().gastoSonnetMes, { mes: mesDe(Date.now()), usd: g.usd });
    assert.strictEqual((await salud()).json.cerebro.gastoMes.usd, g.usd);
  });

  await check('el mes es el de Argentina, y al cambiar de mes el gasto vuelve a 0', async () => {
    // 30/09 a las 22 en Argentina ya es 01/10 en UTC: sigue siendo septiembre.
    const finDeSeptiembre = AR('2026-09-30 22:00');
    assert.strictEqual(new Date(finDeSeptiembre).toISOString().slice(0, 7), '2026-10');
    state.guardarGastoSonnetMes({ mes: '2026-09', usd: 50 });
    assert.deepStrictEqual(cerebro.gastoDelMes(finDeSeptiembre), { mes: '2026-09', usd: 50, tope: 60, porcentaje: 83.3 });
    const octubre = AR('2026-10-01 09:00');
    assert.deepStrictEqual(cerebro.gastoDelMes(octubre), { mes: '2026-10', usd: 0, tope: 60, porcentaje: 0 });
    cerebro.sumarAlMes(0.25, octubre);
    assert.deepStrictEqual(state.gastoSonnetMes(), { mes: '2026-10', usd: 0.25 });
    cerebro.sumarAlMes(0.5, octubre);
    assert.deepStrictEqual(state.gastoSonnetMes(), { mes: '2026-10', usd: 0.75 });
  });

  await check('un solo tope del mes (08/10/2026): CEREBRO_TOPE_MES_USD; si no está, CHIARA_TOPE_MES_USD; si no, 60', () => {
    assert.strictEqual(config.cerebro.topeMesUsd, 60, 'con las dos, manda CEREBRO_TOPE_MES_USD');
    assert.ok(!('topeMesUsd' in config.panel), 'el panel sigue con su propio tope');
    const clave = require.resolve('../src/config');
    const cargado = require.cache[clave];
    const antes = [process.env.CEREBRO_TOPE_MES_USD, process.env.CHIARA_TOPE_MES_USD];
    const tope = (deCerebro, deChiara) => {
      process.env.CEREBRO_TOPE_MES_USD = deCerebro;
      process.env.CHIARA_TOPE_MES_USD = deChiara;
      delete require.cache[clave];
      return require('../src/config').cerebro.topeMesUsd;
    };
    try {
      assert.strictEqual(tope('80', '45'), 80);
      assert.strictEqual(tope('', '45'), 45);
      assert.strictEqual(tope('', ''), 60);
      assert.strictEqual(tope('cero', '45'), 60, 'una ilegible vuelve a 60, como siempre');
      assert.strictEqual(tope('', '0'), 60);
    } finally {
      [process.env.CEREBRO_TOPE_MES_USD, process.env.CHIARA_TOPE_MES_USD] = antes;
      require.cache[clave] = cargado;
    }
  });

  await check('si no está el del mes en curso, se arma una sola vez con lo que dice el registro de ese mes', async () => {
    const ahora = AR('2026-10-06 12:00');
    const ev = (tipo, ts, extra) => ({ v: 2, ts: new Date(ts).toISOString(), chat: '...0001', clave: 'aaaaaaaaaaaa', tipo, commit: 'abc1234', ...extra });
    const registro = [
      ev('cliente', AR('2026-10-02 10:00'), { id: 'c1', texto: 'hola' }),
      ev('propuesta', AR('2026-10-02 10:01'), { tanda: 'T1', fuente: 'sonnet', sonnet: { usd: 0.5 } }),
      ev('propuesta-sonnet', AR('2026-10-03 10:00'), { tanda: 'T2', usd: 0.25 }),
      ev('propuesta', AR('2026-10-03 10:00'), { tanda: 'T2', mensajes: ['del bot de siempre'] }),
      // 30/09 a las 22 en Argentina: es de septiembre, no cuenta.
      ev('propuesta-sonnet', AR('2026-09-30 22:00'), { tanda: 'T0', usd: 7 }),
      ev('propuesta', AR('2026-09-15 10:00'), { tanda: 'T00', fuente: 'sonnet', sonnet: { usd: 9 } }),
    ];
    state.guardarGastoSonnetMes({ mes: '2026-09', usd: 16 });
    assert.strictEqual(cerebro.armarGastoMes({ eventos: registro, ahora }), true);
    assert.deepStrictEqual(state.gastoSonnetMes(), { mes: '2026-10', usd: 0.75 });
    // Ya está el del mes: no se vuelve a armar, y el registro ni se lee (al arrancar va una función).
    let leido = 0;
    const leer = () => {
      leido++;
      return [...registro, ev('propuesta-sonnet', AR('2026-10-05 10:00'), { usd: 3 })];
    };
    assert.strictEqual(cerebro.armarGastoMes({ eventos: leer, ahora }), false);
    assert.strictEqual(leido, 0, 'leyó el registro entero sin hacer falta');
    assert.deepStrictEqual(state.gastoSonnetMes(), { mes: '2026-10', usd: 0.75 });
    // Con otro mes guardado, la función se lee una vez.
    state.guardarGastoSonnetMes({ mes: '2026-09', usd: 16 });
    assert.strictEqual(cerebro.armarGastoMes({ eventos: leer, ahora }), true);
    assert.strictEqual(leido, 1);
    assert.deepStrictEqual(state.gastoSonnetMes(), { mes: '2026-10', usd: 3.75 });
  });

  await check('pasado el 80% del tope, un aviso al grupo una sola vez por mes (la marca queda en bot:interno)', async () => {
    const ahora = AR('2026-10-06 12:00');
    const avisos = () => alGrupo.filter((t) => /Sonnet va US\$/.test(t));
    alGrupo.length = 0;
    state.guardarGastoSonnetMes({ mes: '2026-10', usd: 47 });
    await bot.revisarGastoMes(ahora);
    assert.deepStrictEqual(avisos(), [], 'avisó con el 78%');
    state.guardarGastoSonnetMes({ mes: '2026-10', usd: 49 });
    await bot.revisarGastoMes(ahora);
    await bot.revisarGastoMes(ahora);
    assert.deepStrictEqual(avisos(), ['⚠️ Sonnet va US$49,00 de US$60 este mes (81,7%)']);
    assert.strictEqual(internoGuardado().gastoSonnetAvisado, '2026-10');
    // Otro mes, otro aviso.
    const noviembre = AR('2026-11-20 12:00');
    state.guardarGastoSonnetMes({ mes: '2026-11', usd: 55.5 });
    await bot.revisarGastoMes(noviembre);
    assert.deepStrictEqual(avisos().slice(1), ['⚠️ Sonnet va US$55,50 de US$60 este mes (92,5%)']);
  });

  await check('un aviso al grupo que no sale cuenta en /salud (avisosGrupo: cuántos y el último, con la hora y el motivo)', async () => {
    evolution.avisarGrupo = avisarGrupoReal;
    const antes = evolution.avisosGrupo().noSalieron;
    try {
      // Evolution contesta 500.
      evolutionContesta = async () => comoRespuesta(500, { error: 'de mentira' });
      const r = await evolution.avisarGrupo('hola grupo');
      assert.ok(r && r.bloqueado, 'el caso no prueba nada: el aviso salió');
      let a = evolution.avisosGrupo();
      assert.strictEqual(a.noSalieron, antes + 1);
      assert.ok(/fallo de envio/.test(a.ultimo.motivo) && /Evolution 500/.test(a.ultimo.motivo), a.ultimo.motivo);
      assert.ok(Math.abs(Date.parse(a.ultimo.hora) - Date.now()) < 60 * 1000, 'la hora no es la de ahora: ' + a.ultimo.hora);
      // Un destino que no es un grupo: también cuenta.
      const grupoAntes = config.grupoAvisos;
      config.grupoAvisos = '5490000011111@s.whatsapp.net';
      try {
        await evolution.avisarGrupo('hola grupo');
      } finally {
        config.grupoAvisos = grupoAntes;
      }
      a = evolution.avisosGrupo();
      assert.strictEqual(a.noSalieron, antes + 2);
      assert.strictEqual(a.ultimo.motivo, 'el destino no es un grupo de WhatsApp');
      // Uno que sale no cuenta.
      evolutionContesta = async () => comoRespuesta(201, { key: { remoteJid: GRUPO, fromMe: true, id: 'EVG1' } });
      await evolution.avisarGrupo('hola grupo');
      assert.strictEqual(evolution.avisosGrupo().noSalieron, antes + 2);
      const { json } = await salud();
      assert.deepStrictEqual(json.avisosGrupo, evolution.avisosGrupo());
    } finally {
      evolutionContesta = null;
      evolution.avisarGrupo = async (t) => {
        alGrupo.push(t);
        return {};
      };
    }
  });

  await check('al arrancar (node src/index.js): la consola dice "CEREBRO: reglas <hash> (<N> líneas)" y /salud trae el gasto del mes armado del registro', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'arranque-'));
    const ahora = Date.now();
    const ev = (tipo, extra) => JSON.stringify({ v: 2, ts: new Date(ahora).toISOString(), chat: '...0001', clave: null, tipo, commit: null, ...extra });
    fs.writeFileSync(
      path.join(dir, 'apr.jsonl'),
      [
        ev('propuesta', { tanda: 'A', fuente: 'sonnet', sonnet: { usd: 0.5 } }),
        ev('propuesta-sonnet', { tanda: 'B', usd: 0.25 }),
        JSON.stringify({ v: 2, ts: new Date(ahora - 45 * 24 * 3600e3).toISOString(), tipo: 'propuesta-sonnet', usd: 9 }),
      ].join('\n') + '\n'
    );
    const [puerto, cerrado] = [await puertoLibre(), await puertoLibre()];
    const hijo = spawn(process.execPath, [path.join(__dirname, '..', 'src', 'index.js')], {
      // Desde test/: dotenv no encuentra ningún .env.
      cwd: __dirname,
      env: {
        ...process.env,
        PORT: String(puerto),
        HOST: '127.0.0.1',
        ESTADO_PATH: path.join(dir, 'estado.json'),
        APRENDIZAJE_PATH: path.join(dir, 'apr.jsonl'),
        CEREBRO_MODO: 'apagado',
        GRUPO_AVISOS_JID: '',
        EVOLUTION_URL: `http://127.0.0.1:${cerrado}`,
        EVOLUTION_APIKEY: '',
        SHEET_ID: '',
        GOOGLE_CREDENTIALS_PATH: path.join(dir, 'no-hay.json'),
        SUPABASE_URL: '',
        SUPABASE_SERVICE_ROLE_KEY: '',
        GEMINI_API_KEY: '',
        ANTHROPIC_API_KEY: '',
        // El panel Chiara (merge del 06/10/2026) escribe en esta carpeta al arrancar: apagado, para que el
        // borrado del final no choque con un archivo a medio escribir.
        CHIARA_PANEL_ACTIVO: 'false',
      },
    });
    let salida = '';
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('el bot no arrancó en 20 s:\n' + salida.slice(-800))), 20000);
        const leer = (d) => {
          salida += d;
          if (/Bot escuchando/.test(salida) && /CEREBRO: reglas/.test(salida)) {
            clearTimeout(t);
            resolve();
          }
        };
        hijo.stdout.on('data', leer);
        hijo.stderr.on('data', leer);
        hijo.on('exit', (c) => reject(new Error(`el bot terminó (${c}):\n` + salida.slice(-800))));
      });
      const linea = salida.split(/\r?\n/).find((l) => /CEREBRO: reglas/.test(l));
      assert.strictEqual(linea, `CEREBRO: reglas ${HASH} (${LINEAS} líneas)`);
      const { json } = await pedirSalud(puerto);
      assert.strictEqual(json.cerebro.reglas, HASH);
      assert.deepStrictEqual(json.cerebro.gastoMes, { mes: mesDe(ahora), usd: 0.75, tope: 60, porcentaje: 1.3 });
    } finally {
      hijo.kill();
      // Que termine antes de borrar su carpeta (si ya terminó, no espera).
      if (hijo.exitCode === null && hijo.signalCode === null) await new Promise((r) => { hijo.once('exit', r); setTimeout(r, 3000); });
    }
  });

  terminado = true;
  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
