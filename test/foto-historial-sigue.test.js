'use strict';
/**
 * La foto en el historial, el canje de la ficha y `#sigue` que contesta (decisiones de Tomás del 07/10/2026).
 *
 *   node test/foto-historial-sigue.test.js
 *
 * Con un `fetch` de mentira que contesta como la API de Anthropic y Evolution de mentira (los envíos, las
 * fotos y lo que trae del historial): nunca sale a la red. A través de index.js (`procesar` y los barridos):
 *   A. en un chat de Sonnet, cada foto sin epígrafe del cliente deja `cliente: [foto]` en el historial, entre
 *      o no a la tanda, sin cambiar qué se contesta: la foto suelta sigue sin contestarse, y la línea no
 *      dispara el barrido del silencio, no frena el seguimiento ni cuenta para los datos viejos. En los chats
 *      del bot de siempre, como siempre; con lo de Evolution, una sola línea (1 a 5, 5b, 5c y 5d);
 *   B. el canje que Sonnet anota en la ficha queda en el estado (`canjeFicha`) y va en "lo que el sistema ya
 *      sabe" mientras tenga menos de 72 h (6 y 6b);
 *   C. `#sigue`, desde el grupo y desde el chat, contesta lo que el cliente dejó escrito por el camino del
 *      barrido (`origen: 'sigue'`); si no corresponde, solo reactiva, y el aviso al grupo dice por qué; con
 *      una tanda en curso, o si el cliente escribe mientras sale el aviso, una sola respuesta (7 a 21).
 * El barrido del silencio sigue igual: lo prueba test/cerebro-vivo.test.js.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'foto-historial-sigue-'));
const GRUPO = '120363000000000079@g.us';

// El entorno se fija acá y no se hereda del .env (dotenv no pisa lo que ya está puesto).
process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '6';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '5490000099998';
process.env.NUMEROS_PILOTO = 'todos';
process.env.SOLO_CHATS_NUEVOS = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.SILENCIO_MAX_HORAS = '72';
process.env.SILENCIO_MAX_POR_BARRIDO = '3';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.SEGUIMIENTO_FRANJA_DESDE = '0';
process.env.SEGUIMIENTO_FRANJA_HASTA = '24';
process.env.SEGUIMIENTO_HORAS_1 = '3';
process.env.SEGUIMIENTO_MAX_HORAS = '24';
process.env.SEGUIMIENTO_MAX_POR_BARRIDO = '10';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
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
process.env.CEREBRO_MODO = 'todos';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
// Con clave, contexto.js pide el historial a Evolution (buscarMensajesDeChat está reemplazado más abajo).
process.env.EVOLUTION_APIKEY = 'clave-de-mentira';
process.env.EVOLUTION_URL = 'http://evolution-de-mentira:8080';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const MIN = 60 * 1000;
const HORA = 60 * MIN;
const DIA = 24 * HORA;
const hace = (min) => Date.now() - min * MIN;

// ---------------------------------------------------------------------------
// La API de Anthropic de mentira
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const responde = (mensajes) => [usar('responder', { mensajes })];
const conFicha = (mensajes, ficha) => [usar('responder', { mensajes, ficha })];
const escala = (motivo) => [usar('escalar', { motivo })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
  pedidos.length = 0;
}
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (!u.startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + u);
  const body = JSON.parse(opciones.body);
  pedidos.push({ body });
  const paso = pasos[pedidos.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  if (paso && paso.status) return comoRespuesta(paso.status, { type: 'error', error: { type: 'api_error', message: 'de mentira' } });
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};
/** El texto del contexto del pedido N (el que arma el código) y sus imágenes. */
const textoDel = (i) => pedidos[i].body.messages[0].content.map((b) => b.text || '').join('\n');
const imagenesEnTodo = () => pedidos.flatMap((p) => p.body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b && b.type === 'image'));
const loQueEscribioAhora = (i) => (textoDel(i).match(/Lo que escribió ahora el cliente \(contestá esto\):\n"""\n([\s\S]*?)\n"""/) || [])[1];

// ---------------------------------------------------------------------------
// El bot, sin red
// ---------------------------------------------------------------------------
const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const aClientes = [];
const alGrupo = [];
// Todo lo que sale, en orden: el aviso al grupo de #sigue tiene que salir antes que la respuesta al cliente.
const orden = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, t) => {
  aClientes.push({ numero, texto: t });
  orden.push({ a: 'cliente', numero, t });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  orden.push({ a: 'grupo', t });
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });
// Lo que Evolution tiene de cada chat (contexto.js): por defecto nada; el check 4 lo cambia.
let deEvolution = () => [];
evolution.buscarMensajesDeChat = async (jid) => deEvolution(jid);
// Las fotos: lo que devuelve Evolution al bajarlas, y qué se pidió.
const medias = new Map();
const descargas = [];
evolution.base64DeMedia = async (m) => {
  descargas.push(m.key.id);
  const r = medias.get(m.key.id);
  return r === undefined ? null : r;
};

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const contexto = require('../src/contexto');
const interruptor = require('../src/interruptor');
const aprendizaje = require('../src/aprendizaje');

let n = 0;
const nuevoChat = () => '54900001' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const numero = (chat) => chat.split('@')[0];
let nId = 0;
const escrito = (chat, t, id = 'T' + ++nId) => ({ key: { remoteJid: chat, fromMe: false, id }, pushName: 'Lucia', message: { conversation: t } });
const mio = (chat, t) => ({ key: { remoteJid: chat, fromMe: true, id: 'H' + ++nId }, pushName: 'Tomi', message: { conversation: t } });
let nFoto = 0;
/** Una foto sin epígrafe del cliente (o con, si se pasa `caption`); Evolution la devuelve bien. */
function foto(chat, { caption = '' } = {}) {
  const id = 'F' + ++nFoto;
  medias.set(id, { base64: 'B64-' + id, mimetype: 'image/jpeg' });
  return { key: { remoteJid: chat, fromMe: false, id }, pushName: 'Lucia', message: { imageMessage: { mimetype: 'image/jpeg', ...(caption ? { caption } : {}) } } };
}
const idDe = (m) => m.key.id;
const aEste = (chat) => aClientes.filter((m) => m.numero === chat).map((m) => m.texto);
const historial = (chat) => (state.todos()[chat] || {}).historial || [];
const fotosEn = (chat) => historial(chat).filter((l) => l.texto === '[foto]');
function eventos() {
  try {
    return fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const delChat = (chat) => eventos().filter((e) => e.clave === aprendizaje.clave(chat));
const propuestasDe = (chat) => delChat(chat).filter((e) => e.tipo === 'propuesta');
const entregasDe = (chat) => delChat(chat).filter((e) => e.tipo === 'entrega');
const avisoDeSigue = () => alGrupo.find((t) => t.startsWith('▶️ Reactivado')) || '';
async function esperarHasta(cond, ms = 2000) {
  for (let t = 0; t < ms && !cond(); t += 10) await dormir(10);
}
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  orden.length = 0;
  descargas.length = 0;
}
/** Un chat de Sonnet que ya habló (su primera tanda terminó y quedó completado con Evolution). */
async function chatDeSonnet({ primero = 'hola, una consulta', respuesta = ['contame que equipo buscabas'], ficha = null } = {}) {
  const chat = nuevoChat();
  config.cerebro.modo = 'todos';
  guion(ficha ? conFicha(respuesta, ficha) : responde(respuesta));
  await bot.procesar(escrito(chat, primero));
  assert.strictEqual(cerebro.quienAtiende(chat), 'sonnet', 'el chat no lo atiende Sonnet');
  limpiar();
  return chat;
}
/** Un chat armado a mano (nombre, ya saludado hoy y ya completado con Evolution), con estas líneas. */
function chatArmado(lineas, extra = {}) {
  const chat = nuevoChat();
  state.actualizar(chat, { nombre: 'Lucia', saludoEn: Date.now(), evolutionTraido: Date.now(), historial: lineas.map((l) => ({ ...l })), ...extra });
  return chat;
}
/** Los chats de los casos anteriores no entran al barrido del silencio. */
function apartarLosDemas() {
  for (const id of Object.keys(state.todos())) state.actualizar(id, { silencioAtendido: Number.MAX_SAFE_INTEGER });
}
/** Un registro de /chat/findMessages, como lo devuelve Evolution. */
function deLaBase(chat, { id, texto = 'hola', ts, fromMe = false, message = null }) {
  return {
    key: { remoteJid: chat, fromMe, id },
    messageType: message ? Object.keys(message)[0] : 'conversation',
    message: message || { conversation: texto },
    messageTimestamp: Math.floor(ts / 1000),
  };
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

(async () => {
  // Una promesa colgada no puede dar "Todo OK": la prueba tiene que llegar al final.
  let termino = false;
  process.on('exit', (codigo) => {
    if (!termino && codigo === 0) {
      console.log('\nFALLA: la prueba no llegó al final (una promesa quedó colgada)\n');
      process.exitCode = 1;
    }
  });

  console.log('\nA. La foto sin epígrafe en el historial de los chats de Sonnet\n');

  await check('1. chat de Sonnet, foto suelta sin epígrafe (sin canje ni tanda): queda "cliente: [foto]" con su id, no hay tanda ni se baja nada, y el silencio sin-texto como hoy; un álbum deja una por foto', async () => {
    const chat = await chatDeSonnet();
    guion();
    const largo = historial(chat).length;
    const suelta = foto(chat);
    await bot.procesar(suelta);
    await dormir(30);
    const h = historial(chat);
    assert.strictEqual(h.length, largo + 1, 'el historial no sumó la línea: ' + JSON.stringify(h.slice(-2)));
    const l = h[h.length - 1];
    assert.deepStrictEqual([l.quien, l.texto, l.id], ['cliente', '[foto]', idDe(suelta)], JSON.stringify(l));
    assert.ok(Math.abs(l.ts - Date.now()) < MIN, 'la línea no tiene la hora de ahora');
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.deepStrictEqual(descargas, [], 'bajó la foto');
    assert.deepStrictEqual(aEste(chat), []);
    const ultimo = delChat(chat).pop();
    assert.deepStrictEqual([ultimo.tipo, ultimo.motivo, ultimo.formato, ultimo.lineas], ['silencio', 'sin-texto', 'foto', [idDe(suelta)]], JSON.stringify(ultimo));
    // Un álbum: el albumMessage (que no es una foto) no deja línea; cada foto del álbum, la suya.
    const album = { key: { remoteJid: chat, fromMe: false, id: 'ALB' + ++nFoto }, pushName: 'Lucia', message: { albumMessage: { expectedImageCount: 2 } } };
    const [a, b] = [foto(chat), foto(chat)];
    for (const m of [album, a, b]) await bot.procesar(m);
    assert.deepStrictEqual(fotosEn(chat).map((x) => x.id), [idDe(suelta), idDe(a), idDe(b)]);
    assert.strictEqual(pedidos.length, 0);
    // Un chat que no existía no se crea por una foto suelta (como hasta ahora).
    const nuevo = nuevoChat();
    await bot.procesar(foto(nuevo));
    assert.ok(!state.todos()[nuevo], 'una foto suelta creó el chat');
  });

  await check('2. un chat del bot de siempre (CEREBRO_MODO=apagado, o #bot con todos): la misma foto no cambia el historial', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'apagado';
    try {
      await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
      assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: el bot de siempre no contestó');
      const antes = JSON.stringify(historial(chat));
      await bot.procesar(foto(chat));
      await dormir(30);
      assert.strictEqual(JSON.stringify(historial(chat)), antes, 'la foto entró al historial de un chat del bot de siempre');
    } finally {
      config.cerebro.modo = 'todos';
    }
    const conBot = await chatDeSonnet();
    state.actualizar(conBot, { atiendeSonnet: false });
    assert.strictEqual(cerebro.quienAtiende(conBot), 'sombra');
    const antes = JSON.stringify(historial(conBot));
    await bot.procesar(foto(conBot));
    await dormir(30);
    assert.strictEqual(JSON.stringify(historial(conBot)), antes, 'la foto entró al historial de un chat que pasó al bot de siempre');
  });

  /** Un chat de Sonnet en el que Sonnet anotó un canje en la ficha (la marca de canje, 72 h). */
  async function chatConCanjeDeSonnet(canje = 'iPhone 16') {
    return chatDeSonnet({ primero: 'quiero canjear mi 16', respuesta: ['dale, mandame una captura de la bateria'], ficha: { canje } });
  }

  await check('3. canje en curso y la captura sola: la contesta Sonnet viéndola (como hoy) y queda "[foto]" antes de su respuesta; en la tanda siguiente el pedido lleva "Cliente: [foto]" y ninguna imagen', async () => {
    const chat = await chatConCanjeDeSonnet();
    guion(responde(['dale, ahi vi la bateria', 'de cuantos gb es?']));
    const captura = foto(chat);
    await bot.procesar(captura);
    assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet');
    assert.strictEqual(imagenesEnTodo().length, 1, 'Sonnet no vio la captura');
    assert.deepStrictEqual(aEste(chat), ['dale, ahi vi la bateria', 'de cuantos gb es?']);
    const h = historial(chat);
    const i = h.findIndex((l) => l.texto === '[foto]');
    assert.ok(i >= 0 && h[i].quien === 'cliente' && h[i].id === idDe(captura), 'no quedó la línea de la foto: ' + JSON.stringify(h.slice(-4)));
    assert.deepStrictEqual(h.slice(i + 1).map((l) => l.texto), ['dale, ahi vi la bateria', 'de cuantos gb es?'], 'la línea de la foto no quedó antes de la respuesta');
    limpiar();
    guion(responde(['dale, le cambiaron algo o tiene algun detalle?']));
    await bot.procesar(escrito(chat, 'es de 128'));
    assert.strictEqual(pedidos.length, 1);
    assert.ok(/\] Cliente: \[foto\]\n\[[^\]]+\] Vos \(antes\): dale, ahi vi la bateria/.test(textoDel(0)), 'el historial del pedido no lleva la foto:\n' + textoDel(0));
    assert.deepStrictEqual(imagenesEnTodo(), [], 'la foto de antes se volvió a mandar');
    assert.deepStrictEqual(descargas, [], 'la foto de antes se volvió a bajar');
    assert.ok(!/mandó una foto/.test(textoDel(0)), 'el pedido sigue diciendo que mandó una foto ahora');
  });

  await check('4. al completar con Evolution, la [foto] del estado y la de Evolution son la misma línea: queda una, la del estado (también sin id, por la hora)', async () => {
    const ahora = Date.now();
    const chat = nuevoChat();
    state.actualizar(chat, {
      nombre: 'Lucia',
      saludoEn: ahora,
      historial: [
        { quien: 'cliente', texto: 'hola, quiero canjear mi 16', ts: ahora - 20 * MIN, id: 'C-4' },
        { quien: 'vendedor', texto: 'dale, mandame una captura de la bateria', ts: ahora - 19 * MIN, id: 'EV-4' },
      ],
    });
    assert.ok(!state.obtener(chat).evolutionTraido, 'el caso no prueba nada: el chat ya se completó');
    guion();
    const suelta = foto(chat);
    await bot.procesar(suelta);
    assert.strictEqual(fotosEn(chat).length, 1, 'el caso no prueba nada: la foto no quedó en el historial');
    // La foto es de hace 10 min (Evolution la tiene con esa hora): lo del último minuto no se trae de Evolution.
    state.actualizar(chat, { historial: historial(chat).map((l) => (l.texto === '[foto]' ? { ...l, ts: ahora - 10 * MIN } : l)) });
    deEvolution = (jid) =>
      jid === chat
        ? [
            deLaBase(chat, { id: 'VIEJO-4', texto: 'una consulta de antes', ts: ahora - 3 * DIA }),
            deLaBase(chat, { id: 'C-4', texto: 'hola, quiero canjear mi 16', ts: ahora - 20 * MIN }),
            deLaBase(chat, { id: 'EV-4', fromMe: true, texto: 'dale, mandame una captura de la bateria', ts: ahora - 19 * MIN }),
            deLaBase(chat, { id: idDe(suelta), message: { imageMessage: { mimetype: 'image/jpeg' } }, ts: ahora - 10 * MIN }),
          ]
        : [];
    try {
      guion(responde(['dale, de cuantos gb es tu 16?']));
      await bot.procesar(escrito(chat, 'ahi te la mande'));
    } finally {
      deEvolution = () => [];
    }
    assert.ok(historial(chat).some((l) => l.texto === 'una consulta de antes'), 'el caso no prueba nada: no se completó con Evolution');
    const fotos = fotosEn(chat);
    assert.strictEqual(fotos.length, 1, 'la foto quedó dos veces: ' + JSON.stringify(fotos));
    assert.ok(!fotos[0].evolution, 'quedó la de Evolution y no la del estado');
    assert.strictEqual((textoDel(0).match(/Cliente: \[foto\]/g) || []).length, 1, 'el pedido lleva la foto dos veces:\n' + textoDel(0));
    // Una línea [foto] sin id (de un mensaje que llegó sin key.id): es la misma por el lado, el texto y la hora.
    const sinId = [{ quien: 'cliente', texto: '[foto]', ts: ahora - 10 * MIN }, { quien: 'vendedor', texto: 'dale', ts: ahora - 2 * MIN }];
    const deEvo = contexto.lineasDe([deLaBase(chat, { id: 'CON-ID', message: { imageMessage: {} }, ts: ahora - 10 * MIN + 2000 })]);
    assert.strictEqual(contexto.nuevasLineas([sinId[1]], deEvo, { ahora }).length, 1, 'el caso no prueba nada: sin la línea del historial no entraría');
    assert.deepStrictEqual(contexto.nuevasLineas(sinId, deEvo, { ahora }), []);
  });

  await check('5. el barrido del silencio no toma un chat donde lo único que quedó del cliente después de la persona es una [foto]', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const chat = chatArmado(
      [
        { quien: 'cliente', texto: 'hola, tenes el 13?', ts: hace(55) },
        { quien: 'vendedor', texto: 'sii, el 13 lo tenemos', ts: hace(50), humano: true },
        { quien: 'cliente', texto: '[foto]', ts: hace(40), id: 'F-5' },
      ],
      { ultimoHumano: hace(50) }
    );
    limpiar();
    guion();
    assert.deepStrictEqual(await bot.revisarSilencios(), [], 'tomó la foto como algo escrito');
    assert.strictEqual(pedidos.length, 0);
    assert.deepStrictEqual(aEste(chat), []);
  });

  await check('5b. el barrido con "y el 13 en cuantas cuotas?" y después una [foto]: contesta el texto (sin la foto) y no lo vuelve a tomar, aunque Sonnet falle', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const chat = chatArmado(
      [
        { quien: 'cliente', texto: 'hola, tenes el 13?', ts: hace(55) },
        { quien: 'vendedor', texto: 'sii, el 13 lo tenemos', ts: hace(50), humano: true },
        { quien: 'cliente', texto: 'y el 13 en cuantas cuotas?', ts: hace(40) },
        { quien: 'cliente', texto: '[foto]', ts: hace(35), id: 'F-5b' },
      ],
      { ultimoHumano: hace(50) }
    );
    limpiar();
    guion({ status: 500 }, { status: 500 });
    assert.deepStrictEqual(await bot.revisarSilencios(), [chat]);
    assert.strictEqual(loQueEscribioAhora(0), 'y el 13 en cuantas cuotas?', 'la tanda lleva la foto como texto');
    assert.deepStrictEqual(aEste(chat), [], 'le contestó el bot de siempre');
    assert.strictEqual(alGrupo.filter((t) => /SIN CONTESTAR/.test(t)).length, 1, alGrupo.join(' || '));
    limpiar();
    guion();
    assert.deepStrictEqual(await bot.revisarSilencios(), [], 'el barrido siguiente lo volvió a tomar');
    assert.strictEqual(pedidos.length, 0);
    assert.ok(!alGrupo.some((t) => /SIN CONTESTAR/.test(t)), 'el 💬 salió dos veces');
  });

  await check('5c. una [foto] después del precio no frena el seguimiento (un texto del cliente, sí)', async () => {
    for (const [id, s] of Object.entries(state.todos())) if (s && s.ultimoPrecioBot) state.actualizar(id, { ultimoPrecioBot: 0 });
    const precio = Date.now() - 4 * HORA;
    const conPrecio = (despues) =>
      chatArmado(
        [
          { quien: 'cliente', texto: 'tenes el 13?', ts: precio - MIN },
          { quien: 'vendedor', texto: 'el 13 esta $495.000 de contado', ts: precio },
          despues,
        ],
        { ultimoBot: precio, ultimoEnvioCliente: precio, ultimoPrecioBot: precio }
      );
    const conFoto = conPrecio({ quien: 'cliente', texto: '[foto]', ts: Date.now() - HORA, id: 'F-5c' });
    const conTexto = conPrecio({ quien: 'cliente', texto: 'y en cuotas?', ts: Date.now() - HORA });
    limpiar();
    config.seguimiento.activo = true;
    try {
      await bot.revisarSeguimientos({ escribiendoMs: 1 });
    } finally {
      config.seguimiento.activo = false;
    }
    assert.deepStrictEqual(aEste(conTexto), [], 'el caso no prueba nada: salió el seguimiento con un texto del cliente después del precio');
    assert.deepStrictEqual(aEste(conFoto), ['contame como te quedan los numeros!'], 'la foto frenó el seguimiento');
  });

  await check('5d. una [foto] no cuenta como actividad para los datos viejos: con lo último de hace 80 h, la foto y después un texto, es una consulta nueva', async () => {
    const chat = chatArmado(
      [
        { quien: 'cliente', texto: 'tenes el 13? tengo 300 mil', ts: hace(80 * 60) },
        { quien: 'vendedor', texto: 'sii, contame', ts: hace(80 * 60 - 1) },
      ],
      { modelo: 'iPhone 13', entrega: 300000 }
    );
    guion();
    await bot.procesar(foto(chat));
    assert.strictEqual(fotosEn(chat).length, 1, 'el caso no prueba nada: la foto no quedó en el historial');
    guion(responde(['contame, que modelo buscabas?']));
    await bot.procesar(escrito(chat, 'hola, sigue estando el 13?'));
    assert.strictEqual(state.obtener(chat).entrega, null, 'la foto contó como actividad: no limpió los datos viejos');
    assert.ok(!/con cuánto dijo que cuenta/.test(textoDel(0)), 'el pedido lleva la entrega de hace 80 h');
  });

  console.log('\nB. El canje que anotó Sonnet en la ficha\n');

  await check('6. la ficha con "iPhone 16 128GB 90%" queda en el estado (canjeFicha) y la tanda siguiente lo lleva en lo que el sistema ya sabe; una ficha con el canje vacío no lo borra; otra con otro canje lo reemplaza', async () => {
    const chat = await chatDeSonnet({ primero: 'quiero canjear mi 16, es de 128 y tiene 90 de bateria', respuesta: ['dale, le cambiaron algo o tiene algun detalle?'], ficha: { canje: 'iPhone 16 128GB 90%' } });
    const cf = { ...state.obtener(chat).canjeFicha };
    assert.ok(cf.texto === 'iPhone 16 128GB 90%' && Math.abs(cf.ts - Date.now()) < MIN, 'no quedó el canje de la ficha: ' + JSON.stringify(cf));
    assert.ok(state.obtener(chat).canjeSonnet, 'se perdió la marca de canje');
    guion(conFicha(['dale, me pasas unas fotos del equipo?'], { canje: '' }));
    await bot.procesar(escrito(chat, 'no, esta impecable'));
    assert.ok(/\n- canje que anotaste antes: "iPhone 16 128GB 90%"\n/.test(textoDel(0)), 'el pedido no lleva el canje anotado:\n' + textoDel(0));
    assert.deepStrictEqual(state.obtener(chat).canjeFicha, cf, 'una ficha con el canje vacío lo cambió');
    guion(conFicha(['dale, anotado'], { canje: 'iPhone 16 128GB 88%' }));
    await bot.procesar(escrito(chat, 'perdon, tiene 88'));
    assert.strictEqual(state.obtener(chat).canjeFicha.texto, 'iPhone 16 128GB 88%', 'otro canje no lo reemplazó');
    guion(responde(['buenisimo, y que modelo te gustaria llevarte?']));
    await bot.procesar(escrito(chat, 'ahi te mande las fotos'));
    assert.ok(/canje que anotaste antes: "iPhone 16 128GB 88%"/.test(textoDel(0)), textoDel(0));
    assert.ok(!/90%/.test(textoDel(0).split('Lo último que escribió una persona')[0]), 'quedó el canje de antes');
  });

  await check('6b. con 71 h va; con 73 h ya no; después de #reset tampoco', async () => {
    const chat = await chatDeSonnet({ primero: 'quiero canjear mi 16', respuesta: ['dale, de cuantos gb es tu 16?'], ficha: { canje: 'iPhone 16 90%' } });
    const cf = state.obtener(chat).canjeFicha;
    assert.ok(cf, 'el caso no prueba nada: no quedó el canje');
    state.actualizar(chat, { canjeFicha: { ...cf, ts: Date.now() - 71 * HORA } });
    guion(responde(['dale, le cambiaron algo?']));
    await bot.procesar(escrito(chat, 'es de 128'));
    assert.ok(/canje que anotaste antes: "iPhone 16 90%"/.test(textoDel(0)), 'con 71 h no va:\n' + textoDel(0));
    state.actualizar(chat, { canjeFicha: { ...cf, ts: Date.now() - 73 * HORA } });
    guion(responde(['buenisimo, mandame unas fotos del equipo']));
    await bot.procesar(escrito(chat, 'no, nada'));
    assert.ok(!/canje que anotaste antes/.test(textoDel(0)), 'con 73 h todavía va:\n' + textoDel(0));
    state.actualizar(chat, { canjeFicha: { ...cf, ts: Date.now() } });
    await bot.procesar(mio(chat, '#reset'));
    assert.ok(!(state.todos()[chat] || {}).canjeFicha, '#reset no lo borró');
    guion(responde(['contame que modelo buscabas']));
    await bot.procesar(escrito(chat, 'hola'));
    assert.ok(!/canje que anotaste antes/.test(textoDel(0)), 'después de #reset todavía va:\n' + textoDel(0));
    // Las 72 h se cuentan desde la hora del pedido, no la de la PC (la batería pide con la hora de su turno).
    state.actualizar(chat, { canjeFicha: { texto: 'iPhone 15 85%', ts: Date.now() - 101 * HORA } });
    guion(responde(['contame que modelo buscabas']));
    await cerebro.pensar({ chatId: chat, mensaje: 'hola', ahora: Date.now() - 100 * HORA });
    assert.ok(/canje que anotaste antes: "iPhone 15 85%"/.test(textoDel(0)), 'no contó desde la hora del pedido:\n' + textoDel(0));
  });

  console.log('\nC. #sigue contesta lo que quedó sin respuesta\n');

  /** Un chat de Sonnet pausado desde el grupo en el que el cliente escribió `texto` (sin respuesta). Devuelve { chat, id }. */
  async function pausadoCon(texto) {
    const chat = await chatDeSonnet();
    await bot.procesar(mio(GRUPO, '#pausa ' + numero(chat)));
    const id = 'T-' + ++nId;
    if (texto) await bot.procesar(escrito(chat, texto, id));
    assert.ok(state.obtener(chat).pausado, 'el caso no prueba nada: no quedó pausado');
    assert.deepStrictEqual(aEste(chat), [], 'le contestó con el chat pausado');
    limpiar();
    return { chat, id };
  }
  const sigueDesdeElGrupo = (chat) => bot.procesar(mio(GRUPO, '#sigue ' + numero(chat)));

  await check('7. #sigue desde el grupo, lo último es del cliente ("cuanto sale el 13?"): el aviso dice que le contesta, sale antes, y la tanda contesta esa línea (origen sigue, sin persona atendiendo)', async () => {
    const { chat, id } = await pausadoCon('cuanto sale el 13?');
    guion(responde(['sii, el 13 lo tenemos, de cuantos gb lo buscabas?']));
    await sigueDesdeElGrupo(chat);
    const aviso = avisoDeSigue();
    assert.ok(/saqué la pausa/.test(aviso) && /y le contesto lo que dejó escrito\n/.test(aviso), 'el aviso no dice que le contesta: ' + aviso);
    assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet');
    assert.strictEqual(loQueEscribioAhora(0), 'cuanto sale el 13?');
    assert.deepStrictEqual(aEste(chat), ['sii, el 13 lo tenemos, de cuantos gb lo buscabas?']);
    const iAviso = orden.findIndex((o) => o.a === 'grupo' && o.t.startsWith('▶️ Reactivado'));
    const iRespuesta = orden.findIndex((o) => o.a === 'cliente');
    assert.ok(iAviso >= 0 && iAviso < iRespuesta, 'el aviso no salió antes de la respuesta: ' + JSON.stringify(orden));
    const prop = propuestasDe(chat).pop();
    assert.strictEqual(prop.origen, 'sigue', JSON.stringify(prop));
    assert.strictEqual(prop.fuente, 'sonnet');
    assert.deepStrictEqual(prop.lineas, [id]);
    assert.strictEqual(prop.contexto.humanoAtendiendo, false);
    const entregas = entregasDe(chat).filter((e) => e.tanda === prop.tanda);
    assert.ok(entregas.length === 1 && entregas[0].origen === 'sigue', JSON.stringify(entregas));
    const s = state.obtener(chat);
    assert.ok(!s.pausado, 'no sacó la pausa');
    assert.strictEqual(s.silencioAtendido, historial(chat).find((l) => l.id === id).ts, 'no quedó atendida (silencioAtendido)');
  });

  await check('8. #sigue en el chat del cliente (lo escribe la cuenta): lo mismo, sin aviso al grupo y sin marcar a una persona', async () => {
    const chat = await chatDeSonnet();
    await bot.procesar(mio(chat, '#pausa'));
    const id = 'T-' + ++nId;
    await bot.procesar(escrito(chat, 'y en cuotas como es?', id));
    assert.deepStrictEqual(aEste(chat), [], 'el caso no prueba nada: le contestó pausado');
    limpiar();
    guion(responde(['es con una entrega inicial y lo que queda en 1 o 2 cuotas']));
    await bot.procesar(mio(chat, '#sigue'));
    assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet');
    assert.strictEqual(loQueEscribioAhora(0), 'y en cuotas como es?');
    assert.deepStrictEqual(aEste(chat), ['es con una entrega inicial y lo que queda en 1 o 2 cuotas']);
    assert.deepStrictEqual(alGrupo, [], 'avisó al grupo');
    const s = state.obtener(chat);
    assert.ok(!s.ultimoHumano, '#sigue marcó a una persona');
    assert.ok(!historial(chat).some((l) => /#sigue/.test(l.texto)), '#sigue entró al historial');
    const prop = propuestasDe(chat).pop();
    assert.strictEqual(prop.origen, 'sigue');
    assert.deepStrictEqual(prop.lineas, [id]);
  });

  await check('9. lo último es de una persona de la cuenta: solo reactiva, sin tanda, y el aviso lo dice', async () => {
    const chat = await chatDeSonnet();
    await bot.procesar(mio(chat, 'ahora te paso fotos, dame un rato'));
    assert.ok(state.obtener(chat).ultimoHumano > 0, 'el caso no prueba nada: no quedó la persona');
    limpiar();
    guion();
    await sigueDesdeElGrupo(chat);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.deepStrictEqual(aEste(chat), []);
    const aviso = avisoDeSigue();
    assert.ok(/\(saqué el silencio por una persona\); le contesto cuando vuelva a escribir \(lo último es de una persona\)\n/.test(aviso), aviso);
    assert.ok(!state.obtener(chat).ultimoHumano, 'no reactivó');
  });

  await check('10. lo último del cliente es de hace 73 h: solo reactiva, sin tanda, y el aviso lo dice', async () => {
    const { chat } = await pausadoCon('sigue estando el 13?');
    state.actualizar(chat, { historial: historial(chat).map((l) => ({ ...l, ts: l.ts - 73 * HORA })) });
    guion();
    await sigueDesdeElGrupo(chat);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(/; le contesto cuando vuelva a escribir \(lo último que escribió es de hace más de 72 h\)\n/.test(avisoDeSigue()), avisoDeSigue());
    assert.ok(!state.obtener(chat).pausado, 'no reactivó');
  });

  await check('11. Chiara apagada: solo reactiva, sin tanda, y el aviso lo dice (al prenderla no se contesta sola)', async () => {
    const { chat } = await pausadoCon('tenes el 14?');
    interruptor.poner(false, 'prueba');
    try {
      guion();
      await sigueDesdeElGrupo(chat);
      await dormir(30);
    } finally {
      interruptor.poner(true, 'prueba');
    }
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(/; le contesto cuando vuelva a escribir \(Chiara está apagada\)\n/.test(avisoDeSigue()), avisoDeSigue());
    await dormir(30);
    assert.deepStrictEqual(aEste(chat), [], 'al prenderla le contestó solo');
  });

  await check('12. un chat del bot de siempre (#bot): solo reactiva, como hoy, y el aviso lo dice', async () => {
    const { chat } = await pausadoCon(null);
    state.actualizar(chat, { atiendeSonnet: false });
    await bot.procesar(escrito(chat, 'tenes el 14?'));
    limpiar();
    guion();
    await sigueDesdeElGrupo(chat);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet (o pensó en sombra)');
    assert.deepStrictEqual(aEste(chat), [], 'le contestó el bot de siempre');
    assert.ok(/; le contesto cuando vuelva a escribir \(lo atiende el bot de siempre\)\n/.test(avisoDeSigue()), avisoDeSigue());
    assert.ok(!state.obtener(chat).pausado, 'no reactivó');
  });

  await check('13. solo "dale gracias" del cliente: sin tanda (como el barrido), y el aviso lo dice', async () => {
    const { chat } = await pausadoCon('dale gracias');
    guion();
    await sigueDesdeElGrupo(chat);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(/; le contesto cuando vuelva a escribir \(lo último es un ok o un gracias\)\n/.test(avisoDeSigue()), avisoDeSigue());
  });

  await check('14. solo una [foto] del cliente después de la persona (y un audio que no se entendió): sin tanda, y el aviso dice que no dejó texto', async () => {
    const chat = await chatDeSonnet();
    await bot.procesar(mio(chat, 'te paso fotos del 13 en un rato'));
    await bot.procesar(foto(chat));
    state.agregarAlHistorial(chat, 'cliente', '[audio que no se entendio]');
    assert.strictEqual(fotosEn(chat).length, 1, 'el caso no prueba nada: la foto no quedó en el historial');
    limpiar();
    guion();
    await sigueDesdeElGrupo(chat);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.deepStrictEqual(descargas, []);
    assert.ok(/; le contesto cuando vuelva a escribir \(lo último no tiene texto: una foto o un audio\)\n/.test(avisoDeSigue()), avisoDeSigue());
  });

  await check('15. Sonnet no puede (500) en la tanda de #sigue: no contesta el bot de siempre y al grupo le llega el 💬 SIN CONTESTAR', async () => {
    const { chat } = await pausadoCon('y el 15 cuanto sale?');
    guion({ status: 500 }, { status: 500 });
    await sigueDesdeElGrupo(chat);
    assert.deepStrictEqual(aEste(chat), [], 'le contestó el bot de siempre');
    assert.ok(alGrupo.includes(`💬 SIN CONTESTAR — Lucia — "y el 15 cuanto sale?" — wa.me/${numero(chat)}`), alGrupo.join(' || '));
    const err = delChat(chat).filter((e) => e.tipo === 'propuesta-sonnet').pop();
    assert.ok(err && /500/.test(err.error) && err.origen === 'sigue', JSON.stringify(err));
  });

  await check('16. Sonnet escala en la tanda de #sigue (sigue un trato de una persona): al cliente nada, al grupo el 🔕 con el motivo', async () => {
    const { chat } = await pausadoCon('lo del precio que me dijo fran sigue?');
    guion(escala('sigue un trato de una persona'));
    await sigueDesdeElGrupo(chat);
    assert.strictEqual(pedidos.length, 1);
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(alGrupo.some((t) => /^🔕 SIN RESPUESTA/.test(t) && /sigue un trato de una persona/.test(t)), alGrupo.join(' || '));
    assert.strictEqual(state.obtener(chat).escalado, true);
  });

  await check('17. en borrador: solo reactiva, sin tanda, y el aviso lo dice', async () => {
    const { chat } = await pausadoCon('tenes el 15 pro?');
    config.modoBorrador = true;
    try {
      guion();
      await sigueDesdeElGrupo(chat);
      await dormir(30);
    } finally {
      config.modoBorrador = false;
    }
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.ok(/; le contesto cuando vuelva a escribir \(modo borrador\)\n/.test(avisoDeSigue()), avisoDeSigue());
  });

  await check('18. un chat fuera de las listas de prueba: solo reactiva, sin tanda, y el aviso lo dice', async () => {
    const { chat } = await pausadoCon('tenes el 16?');
    const antes = { piloto: config.numerosPiloto, todos: config.pilotoTodos };
    config.pilotoTodos = false;
    config.numerosPiloto = ['5490000066666'];
    try {
      assert.strictEqual(evolution.esDestinoDePrueba(chat), false, 'el caso no prueba nada');
      guion();
      await sigueDesdeElGrupo(chat);
      await dormir(30);
    } finally {
      config.pilotoTodos = antes.todos;
      config.numerosPiloto = antes.piloto;
    }
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.ok(/; le contesto cuando vuelva a escribir \(no está en las listas de prueba\)\n/.test(avisoDeSigue()), avisoDeSigue());
  });

  await check('19. lo último es del bot (nada sin contestar): solo reactiva, y el aviso lo dice', async () => {
    const { chat } = await pausadoCon(null);
    assert.strictEqual(historial(chat).pop().quien, 'vendedor', 'el caso no prueba nada');
    guion();
    await sigueDesdeElGrupo(chat);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
    assert.ok(/; le contesto cuando vuelva a escribir \(no dejó nada sin contestar\)\n/.test(avisoDeSigue()), avisoDeSigue());
  });

  await check('20. con una tanda en curso: el aviso dice que ya le está contestando y sale una sola respuesta (la de esa tanda)', async () => {
    const chat = await chatDeSonnet();
    guion(responde(['sii, el 13 lo tenemos']));
    const enCurso = bot.procesar(escrito(chat, 'tenes el 13?'));
    await sigueDesdeElGrupo(chat);
    await enCurso;
    assert.ok(/\(no estaba pausado ni escalado\) y ya le estoy contestando lo que escribió\n/.test(avisoDeSigue()), avisoDeSigue());
    assert.strictEqual(pedidos.length, 1, 'contestó dos veces');
    assert.deepStrictEqual(aEste(chat), ['sii, el 13 lo tenemos']);
    assert.ok(!propuestasDe(chat).pop().origen, 'la tanda en curso quedó como de #sigue');
  });

  await check('21. lo que escribe el cliente mientras sale el aviso de #sigue va en la misma tanda: una sola respuesta', async () => {
    const { chat } = await pausadoCon('cuanto sale el 13?');
    let otro = null;
    const avisar = evolution.avisarGrupo;
    evolution.avisarGrupo = async (t) => {
      if (t.startsWith('▶️ Reactivado')) otro = bot.procesar(escrito(chat, 'y en cuotas?'));
      return avisar(t);
    };
    try {
      guion(responde(['el 13 lo tenemos, y en cuotas es con una entrega inicial']));
      await sigueDesdeElGrupo(chat);
      await otro;
    } finally {
      evolution.avisarGrupo = avisar;
    }
    assert.ok(otro, 'el caso no prueba nada: no escribió mientras salía el aviso');
    assert.strictEqual(pedidos.length, 1, 'le preguntó a Sonnet dos veces');
    assert.strictEqual(loQueEscribioAhora(0), 'cuanto sale el 13?\ny en cuotas?');
    assert.deepStrictEqual(aEste(chat), ['el 13 lo tenemos, y en cuotas es con una entrega inicial']);
    assert.strictEqual(propuestasDe(chat).pop().origen, 'sigue');
  });


  termino = true;
  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
