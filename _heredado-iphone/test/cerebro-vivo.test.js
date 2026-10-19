'use strict';
/**
 * Cerebro Sonnet, fase 2: contesta de verdad (decisiones de Tomás del 02/10/2026).
 *
 *   node test/cerebro-vivo.test.js
 *
 * Todo con un `fetch` de mentira que contesta como la API de Anthropic y Evolution de mentira:
 * nunca sale a la red. Se prueba, a través de index.js (`procesar`):
 *   1. quién contesta con cada modo (tester, nuevos, todos, sombra, apagado), el chat nuevo que
 *      queda marcado y sigue con Sonnet aunque cambie el modo, y #reset que se lleva la marca;
 *   2. lo que sale: el saludo del día (una vez), el PDF del compromiso una sola vez, el filtro de
 *      repetidos y lo que queda en el estado;
 *   3. escalar y la guardia por el camino del 🔕; si escala, no sale nada más;
 *   4. un error de la API: contesta el bot y un solo ⚠️ por racha;
 *   5. el aviso "leí N mensajes" (por respuesta, y el resumen por hora con `todos`);
 *   6. #sonnet, #comparar, #bot y #sonnet-si, solo desde la cuenta.
 * Con `sombra` nada cambia respecto de la fase 1: lo prueba test/cerebro.test.js (dos procesos).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-vivo-'));
const GRUPO = '120363000000000077@g.us';
const TESTER = '5490000099999';

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
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
process.env.GUARDIAN_ACTIVO = 'false';
process.env.TECHSUR_ACTIVO = 'false';
process.env.AUDIO_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.FOTOS_DIR = path.join(TMP, 'sin-fotos');
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
// Fase 2: arranca con `tester`; cada prueba pone el modo que necesita (config.cerebro.modo).
process.env.CEREBRO_MODO = 'tester';
// La sombra con persona (03/10/2026) apagada: la prueba es test/sombra-persona.test.js.
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
// Bloque Ninjo 1b: el contexto se pide solo con una clave de Evolution (acá de mentira; buscarMensajesDeChat
// está reemplazado más abajo y fetch no sale a la red).
process.env.EVOLUTION_APIKEY = 'clave-de-mentira';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// La API de mentira (como en test/cerebro.test.js)
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const responde = (mensajes, compromiso = false) => [usar('responder', { mensajes, compromiso_de_pago: compromiso })];
const escala = (motivo) => [usar('escalar', { motivo })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
  pedidos.length = 0;
}
globalThis.fetch = async (url, opciones = {}) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + url);
  const body = JSON.parse(opciones.body);
  pedidos.push({ body });
  const paso = pasos[pedidos.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  if (paso && paso.status) return comoRespuesta(paso.status, { type: 'error', error: { type: 'api_error', message: 'de mentira' } });
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};
/** El texto del pedido N (el contexto que armó el código). */
const textoDelPedido = (i) => pedidos[i].body.messages[0].content.map((b) => b.text || '').join('\n');

// ---------------------------------------------------------------------------
// El bot, sin red
// ---------------------------------------------------------------------------
const sheets = require('../src/sheets');
const fixture = require('./fixture-planilla');
sheets.usarFixture(fixture);
sheets.registrarLead = async () => {};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, t) => {
  aClientes.push({ numero, tipo: 'texto', texto: t });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero, ruta, pie) => {
  aClientes.push({ numero, tipo: 'documento', texto: pie, ruta });
  return respuestaEvolution(numero);
};
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });
// Bloque Ninjo 1b: lo que Evolution tiene de cada chat (src/contexto.js). Por defecto, nada; cada
// prueba que lo necesita lo cambia. Nunca sale a la red.
let deEvolution = () => [];
const pedidosEvolution = [];
evolution.buscarMensajesDeChat = async (jid, cuantos) => {
  pedidosEvolution.push({ jid, cuantos });
  return deEvolution(jid, cuantos);
};

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const cotizador = require('../src/cotizador');
const chatsViejos = require('../src/chats-viejos');

const escrito = (chatId, t) => ({ key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() }, pushName: 'Lucia', message: { conversation: t } });
/** Un mensaje escrito desde la cuenta del negocio (en el grupo, un comando). */
const mio = (chatId, t) => ({ key: { remoteJid: chatId, fromMe: true, id: 'H' + Math.random() }, pushName: 'Tomi', message: { conversation: t } });
/** Uno escrito en el grupo por otro integrante (no la cuenta). */
const deOtro = (t) => ({ key: { remoteJid: GRUPO, fromMe: false, id: 'G' + Math.random() }, pushName: 'Fran', message: { conversation: t } });

function eventos() {
  try {
    return fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
let n = 0;
const nuevoChat = () => '54900000' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const numero = (chat) => chat.split('@')[0];
const tester = `${TESTER}@s.whatsapp.net`;
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
const textosA = (chat) => aEste(chat).map((m) => m.texto);
const habla = (chat, t) => bot.procesar(escrito(chat, t));
async function esperarHasta(cond, ms = 2000) {
  for (let t = 0; t < ms && !cond(); t += 10) await dormir(10);
}
/** Espera a que la sombra anote lo suyo (no se espera dentro de la tanda). */
const esperarSombra = (chat, cuantas) =>
  esperarHasta(() => eventos().filter((e) => e.tipo === 'propuesta-sonnet' && e.chat === '...' + numero(chat).slice(-4)).length >= cuantas);
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}
/** Un chat nuevo con `nuevos`: queda marcado con su primer mensaje y lo atiende Sonnet. */
async function chatDeSonnet(primero = 'hola', respuesta = ['contame que modelo buscabas']) {
  const chat = nuevoChat();
  config.cerebro.modo = 'nuevos';
  guion(responde(respuesta));
  await habla(chat, primero);
  assert.strictEqual(state.todos()[chat].atiendeSonnet, true, 'el chat no quedó marcado');
  return chat;
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

const filaDel13 = fixture.lista.find((f) => f.modelo === 'iPhone 13');
const cot13 = cotizador.cotizar(filaDel13, 340000, fixture.config);

(async () => {
  console.log('\n1. Quién contesta, con cada modo\n');

  await check('CEREBRO_MODO se lee con los cinco modos (lo que no es uno de ellos, apagado)', async () => {
    assert.strictEqual(config.cerebro.modo, 'tester', 'no tomó CEREBRO_MODO=tester del entorno');
    const { execFileSync } = require('child_process');
    const leer = (valor) =>
      execFileSync(process.execPath, ['-e', "process.stdout.write(require('../src/config').cerebro.modo)"], {
        cwd: __dirname,
        env: { ...process.env, CEREBRO_MODO: valor },
        encoding: 'utf8',
      });
    assert.deepStrictEqual(['NUEVOS', ' todos ', 'sombra', 'vivo', ''].map(leer), ['nuevos', 'todos', 'sombra', 'apagado', 'apagado']);
  });

  await check('tester: al tester le contesta Sonnet, no el bot; la propuesta queda con fuente sonnet y lo que costó', async () => {
    config.cerebro.modo = 'tester';
    limpiar();
    guion(responde(['MENSAJE DE SONNET para el tester']));
    await habla(tester, 'tenes el 13?');
    assert.ok(textosA(tester).includes('MENSAJE DE SONNET para el tester'), 'no le llegó lo de Sonnet: ' + JSON.stringify(textosA(tester)));
    assert.strictEqual(pedidos.length, 1, 'tiene que ser una sola llamada (sin sombra)');
    const prop = eventos().filter((e) => e.tipo === 'propuesta').pop();
    assert.strictEqual(prop.fuente, 'sonnet');
    assert.ok(prop.mensajes.includes('MENSAJE DE SONNET para el tester'));
    assert.ok(prop.sonnet && prop.sonnet.usd > 0 && prop.sonnet.leidos.historial === 1, JSON.stringify(prop.sonnet));
    assert.ok(!eventos().some((e) => e.tipo === 'propuesta-sonnet' && e.tanda === prop.tanda), 'también pensó en sombra');
  });

  await check('tester: a cualquier otro le contesta el bot de siempre y Sonnet piensa en sombra (mismo tanda)', async () => {
    config.cerebro.modo = 'tester';
    const chat = nuevoChat();
    limpiar();
    guion(responde(['SOMBRA que no tiene que salir']));
    await habla(chat, 'tenes el iphone 13?');
    await esperarSombra(chat, 1);
    assert.ok(aEste(chat).length > 0, 'el bot no contestó');
    assert.ok(!textosA(chat).some((t) => /SOMBRA/.test(t)), 'salió lo de la sombra');
    const prop = eventos().filter((e) => e.tipo === 'propuesta' && e.chat === '...' + numero(chat).slice(-4)).pop();
    assert.ok(!prop.fuente, 'la propuesta del bot no lleva fuente');
    const sombra = eventos().find((e) => e.tipo === 'propuesta-sonnet' && e.tanda === prop.tanda);
    assert.ok(sombra && sombra.mensajes[0] === 'SOMBRA que no tiene que salir');
    assert.ok(!state.todos()[chat].atiendeSonnet, 'con tester no se marcan los chats nuevos');
  });

  await check('nuevos: un chat nuevo queda marcado con la fecha y lo atiende Sonnet; sigue con Sonnet con tester y con sombra; con apagado, el bot', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'nuevos';
    limpiar();
    guion(responde(['NUEVO uno']));
    const antes = Date.now();
    await habla(chat, 'hola, tenes el 13?');
    const s = state.todos()[chat];
    assert.strictEqual(s.atiendeSonnet, true);
    assert.ok(s.atiendeSonnetDesde >= antes, 'sin la fecha');
    assert.ok(textosA(chat).includes('NUEVO uno'));
    assert.strictEqual(s.nombre, 'Lucia', 'el nombre no quedó en el estado (como con decidir)');
    const marcados = Object.values(state.todos()).filter((x) => x.atiendeSonnet === true).length;
    assert.strictEqual(cerebro.resumenSalud().chatsConSonnet, marcados, '/salud no cuenta los chats de Sonnet');
    // El tester ya lo atiende Sonnet con `nuevos`: su #reset no lo marca (si no, seguiría con Sonnet con `sombra`).
    await bot.procesar(mio(tester, '#reset'));
    guion(responde(['para el tester']));
    await habla(tester, 'hola');
    assert.ok(!state.todos()[tester].atiendeSonnet, 'se marcó el tester');
    assert.ok(textosA(tester).includes('para el tester'));
    for (const [modo, texto] of [['tester', 'NUEVO dos'], ['sombra', 'NUEVO tres']]) {
      config.cerebro.modo = modo;
      guion(responde([texto]));
      await habla(chat, `y con ${modo}?`);
      assert.ok(textosA(chat).includes(texto), `con ${modo} no le contestó Sonnet: ${JSON.stringify(textosA(chat))}`);
      assert.strictEqual(pedidos.length, 1);
    }
    config.cerebro.modo = 'apagado';
    guion();
    const cuantos = aEste(chat).length;
    await habla(chat, 'y el 14?');
    assert.strictEqual(pedidos.length, 0, 'con apagado llamó a la API');
    assert.ok(aEste(chat).length > cuantos, 'con apagado no contestó el bot');
  });

  await check('nuevos: un chat que ya tenía estado no se marca: contesta el bot y Sonnet en sombra', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'apagado';
    await habla(chat, 'hola');
    config.cerebro.modo = 'nuevos';
    limpiar();
    guion(responde(['SOMBRA del chat viejo']));
    await habla(chat, 'tenes el 13?');
    await esperarSombra(chat, 1);
    assert.ok(!state.todos()[chat].atiendeSonnet, 'se marcó un chat que ya existía');
    assert.ok(!textosA(chat).some((t) => /SOMBRA/.test(t)));
  });

  await check('nuevos: con la lista de chats viejos poniéndose al día, o con el número en la lista, no se marca', async () => {
    const original = { listo: chatsViejos.listo, numeros: chatsViejos.numeros };
    config.cerebro.modo = 'nuevos';
    try {
      const atrasado = nuevoChat();
      chatsViejos.listo = () => false;
      guion(responde(['SOMBRA']));
      await habla(atrasado, 'hola');
      await esperarSombra(atrasado, 1);
      assert.ok(!state.todos()[atrasado].atiendeSonnet, 'se marcó con la lista atrasada');
      chatsViejos.listo = original.listo;
      const viejo = nuevoChat();
      chatsViejos.numeros = () => [numero(viejo)];
      guion(responde(['SOMBRA']));
      await habla(viejo, 'hola');
      await esperarSombra(viejo, 1);
      assert.ok(!state.todos()[viejo].atiendeSonnet, 'se marcó un chat de la lista de viejos');
    } finally {
      Object.assign(chatsViejos, original);
    }
  });

  await check('#reset se lleva la marca: con sombra, ese chat vuelve al bot de siempre', async () => {
    const chat = await chatDeSonnet();
    await bot.procesar(mio(chat, '#reset'));
    assert.ok(!state.todos()[chat], 'el #reset no borró el chat');
    config.cerebro.modo = 'sombra';
    limpiar();
    guion(responde(['SOMBRA despues del reset']));
    await habla(chat, 'tenes el 13?');
    await esperarSombra(chat, 1);
    assert.ok(!state.todos()[chat].atiendeSonnet);
    assert.ok(aEste(chat).length && !textosA(chat).some((t) => /SOMBRA/.test(t)), 'no contestó el bot');
  });

  await check('quién atiende, uno por uno (cerebro.quienAtiende)', async () => {
    const libre = nuevoChat();
    const marcado = nuevoChat();
    const sacado = nuevoChat();
    state.actualizar(marcado, { atiendeSonnet: true });
    state.actualizar(sacado, { atiendeSonnet: false });
    const tabla = {
      apagado: ['bot', 'bot', 'bot', 'bot'],
      sombra: ['sombra', 'sombra', 'sonnet', 'sombra'],
      tester: ['sonnet', 'sombra', 'sonnet', 'sombra'],
      nuevos: ['sonnet', 'sombra', 'sonnet', 'sombra'],
      todos: ['sonnet', 'sonnet', 'sonnet', 'sombra'],
    };
    for (const [modo, esperado] of Object.entries(tabla)) {
      config.cerebro.modo = modo;
      assert.deepStrictEqual([tester, libre, marcado, sacado].map(cerebro.quienAtiende), esperado, `con ${modo}`);
    }
  });

  console.log('\n2. Lo que sale\n');

  await check('el saludo del día lo pone el sistema, una vez: Sonnet no saluda (se le saca) y la segunda vez no va', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'nuevos';
    limpiar();
    guion(responde(['Holaa! sii, tenemos el 13']));
    await habla(chat, 'tenes el 13?');
    const primeros = textosA(chat);
    assert.strictEqual(primeros.length, 2, JSON.stringify(primeros));
    assert.ok(/luciaa/i.test(primeros[0]), 'el primero no es el saludo con el nombre: ' + primeros[0]);
    assert.strictEqual(primeros[1], 'sii, tenemos el 13');
    assert.ok(state.todos()[chat].saludoEn, 'el saludo no quedó marcado');
    guion(responde(['dale, contame']));
    await habla(chat, 'y en cuotas?');
    assert.deepStrictEqual(textosA(chat).slice(2), ['dale, contame']);
  });

  await check('el PDF del compromiso (bloque Ninjo 1b): no sale con la explicación de la financiación; sale con el primer bloque, una sola vez, con su marca', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    guion(responde(['lo financiamos nosotros, con tu dni y un compromiso de pago, en 1 o 2 cuotas'], true));
    await habla(chat, 'como son las cuotas?');
    assert.deepStrictEqual(aEste(chat).filter((m) => m.tipo === 'documento'), [], 'el PDF salió con la explicación (aunque Sonnet pida compromiso_de_pago)');
    guion([usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'tengo 340' })], responde(['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?']));
    await habla(chat, 'el 13, tengo 340');
    const docs = aEste(chat).filter((m) => m.tipo === 'documento');
    assert.strictEqual(docs.length, 1, 'no salió el PDF con el bloque: ' + JSON.stringify(aEste(chat)));
    assert.strictEqual(docs[0].texto, 'te paso el compromiso de pago');
    const s = state.todos()[chat];
    assert.strictEqual(s.compromisoEnviado, true);
    assert.strictEqual(s.temasExplicados.financiacion, true);
    assert.ok(!/compromiso de pago \(PDF\)/.test(textoDelPedido(0)), 'el pedido sigue diciendo si salió el PDF');
    guion([usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'y con 400' })], responde(['dale, con $400.000 de entrega', '[cotizacion]']));
    await habla(chat, 'y con 400?');
    assert.strictEqual(aEste(chat).filter((m) => m.tipo === 'documento').length, 1, 'el PDF salió con el segundo bloque');
  });

  await check('con 4 mensajes (uno es el bloque) el PDF va de pie del último y el tope sigue en 4 (el saludo va pegado al primero)', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'nuevos';
    limpiar();
    guion([usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'tengo 340 mil' })], responde(['uno', '[cotizacion]', 'tres', 'cuatro, con tu dni y un compromiso']));
    await habla(chat, 'el 13 con 340');
    const salio = aEste(chat);
    assert.strictEqual(salio.length, 4, JSON.stringify(salio));
    assert.ok(/luciaa/i.test(salio[0].texto) && /\nuno$/.test(salio[0].texto), 'el saludo no va pegado al primero: ' + salio[0].texto);
    assert.strictEqual(salio[1].texto, cotizador.bloqueSonnet(filaDel13, cot13), 'el segundo no es el bloque');
    assert.deepStrictEqual(salio[3], { ...salio[3], tipo: 'documento', texto: 'cuatro, con tu dni y un compromiso' });
  });

  await check('el filtro de repetidos: lo que ya se dijo no sale; si todo ya se dijo, escala callado', async () => {
    const chat = await chatDeSonnet('hola', ['el 13 esta joya', 'contame']);
    limpiar();
    guion(responde(['el 13 esta joya', 'algo nuevo']));
    await habla(chat, 'y?');
    assert.deepStrictEqual(textosA(chat), ['algo nuevo']);
    guion(responde(['algo nuevo']));
    await habla(chat, 'y??');
    assert.deepStrictEqual(textosA(chat), ['algo nuevo'], 'salió algo repetido');
    assert.ok(alGrupo.some((t) => /🔕/.test(t) && /ya se lo dije/.test(t)), 'no avisó al grupo: ' + alGrupo.join(' || '));
    assert.strictEqual(state.todos()[chat].escalado, true);
  });

  await check('lo que queda en el estado: modelo, capacidad y entrega del cotizar, precios mostrados, insistencia y la última respuesta', async () => {
    const chat = await chatDeSonnet();
    const pesos = cotizador.pesos;
    guion([usar('cotizar', { modelo: '13', entrega: 340000 })], responde(['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]']));
    await habla(chat, 'el 13 con 340');
    assert.ok(textosA(chat).some((x) => x.includes(`· 1 cuota de ${pesos(cot13.pagoUnico)}`)), 'no salió el bloque');
    let s = state.todos()[chat];
    assert.strictEqual(s.modelo, 'iPhone 13');
    assert.strictEqual(s.capacidad_gb, 128);
    assert.strictEqual(s.entrega, 340000);
    assert.ok(s.ultimaRespuestaSonnet && s.ultimaRespuestaSonnet.ts > 0 && s.ultimaRespuestaSonnet.mensajes.length === 2);
    assert.ok(s.ultimoPrecioBot > 0, 'el bloque no dejó ultimoPrecioBot (el seguimiento)');
    assert.ok(!(s.preciosMostradosDe || []).includes('iPhone 13'), 'el contado no salió en la respuesta');
    guion([usar('buscar_equipos', { modelo: '14 pro' })], responde(['el 14 pro esta $800.000 de contado']));
    await habla(chat, 'y el 14 pro?');
    s = state.todos()[chat];
    assert.strictEqual(s.modelo, 'iPhone 14 Pro', 'el único modelo de buscar_equipos');
    assert.strictEqual(s.entrega, 340000, 'sin cotizar, la entrega no cambia');
    assert.ok(s.preciosMostradosDe.includes('iPhone 14 Pro'), JSON.stringify(s.preciosMostradosDe));
    for (const [k, entrega] of [[1, 300000], [2, 310000]]) {
      guion([usar('cotizar', { modelo: '13', entrega })], responde([`para el 13 pedimos $320.000 de entrega inicial (${k})`]));
      await habla(chat, `el 13 con ${entrega / 1000}`);
      assert.deepStrictEqual(state.todos()[chat].insistenciaEntrega, { 'iPhone 13': k });
    }
  });

  await check('los temas explicados se ponen al día con el historial antes de preguntarle (como decidir)', async () => {
    const chat = await chatDeSonnet('como es la financiacion?', ['lo financiamos nosotros en 1 o 2 cuotas con una entrega inicial']);
    guion(responde(['dale']));
    await habla(chat, 'y que piden?');
    assert.ok(/ya se le explicó: financiacion/.test(textoDelPedido(0)), 'Sonnet no sabe que ya se explicó:\n' + textoDelPedido(0).slice(0, 600));
  });

  console.log('\n2b. Ninjo bloque 1: los acuses no se le preguntan a Sonnet ni escalan (decisión del 29/09)\n');

  const hayCampanita = () => alGrupo.some((t) => /🔕/.test(t));
  const ultimaPropuesta = (chat) => eventos().filter((e) => e.tipo === 'propuesta' && e.chat === '...' + numero(chat).slice(-4)).pop();
  let chatDelAcuse = null;

  await check('"ok" después de una respuesta: contesta Sonnet, y el acuse queda contestado cuando el mensaje sale', async () => {
    chatDelAcuse = await chatDeSonnet('tenes el 13?', ['sii, tenemos el 13']);
    limpiar();
    guion(responde(['cuando quieras lo seguimos']));
    await habla(chatDelAcuse, 'ok');
    assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet');
    assert.deepStrictEqual(textosA(chatDelAcuse), ['cuando quieras lo seguimos']);
    const marca = state.todos()[chatDelAcuse].acuseContestado;
    assert.ok(marca && marca.texto === 'ok' && marca.ts > 0, 'el acuse no quedó contestado: ' + JSON.stringify(marca));
  });

  await check('otro "👍" seguido: no se llama a la API, no sale nada, no hay 🔕 y la propuesta queda con el motivo "acuse"', async () => {
    assert.ok(chatDelAcuse, 'no corrió el anterior');
    limpiar();
    guion();
    await habla(chatDelAcuse, '👍');
    assert.strictEqual(pedidos.length, 0, 'llamó a la API');
    assert.deepStrictEqual(aEste(chatDelAcuse), []);
    assert.ok(!hayCampanita(), alGrupo.join(' || '));
    assert.ok(!state.todos()[chatDelAcuse].escalado, 'quedó escalado');
    const prop = ultimaPropuesta(chatDelAcuse);
    assert.strictEqual(prop.motivo, 'acuse');
    assert.strictEqual(prop.escalar, false);
    assert.deepStrictEqual(prop.mensajes, []);
    assert.strictEqual(prop.fuente, 'sonnet');
    assert.ok(/ya se contestó/.test(prop.sonnet.sinLlamar || ''), 'el registro no dice por qué no se le preguntó: ' + JSON.stringify(prop.sonnet));
    // Dos acuses juntos en la misma tanda ("ok" + "👍"): tampoco (con las líneas de la tanda).
    await Promise.all([habla(chatDelAcuse, 'oki'), habla(chatDelAcuse, '👌')]);
    const juntos = ultimaPropuesta(chatDelAcuse);
    assert.strictEqual((juntos.lineas || []).length, 2, 'el caso no prueba nada: no fueron en la misma tanda');
    assert.strictEqual(pedidos.length, 0, 'a la tanda de dos acuses le preguntó a Sonnet');
    assert.strictEqual(juntos.motivo, 'acuse');
    // Un mensaje que no es un acuse corta la cadena: el próximo "ok" se le pregunta de nuevo.
    guion(responde(['el 14 tambien lo tenemos']));
    await habla(chatDelAcuse, 'y el 14?');
    guion(responde(['dale, lo vemos cuando quieras']));
    await habla(chatDelAcuse, 'ok');
    assert.strictEqual(pedidos.length, 1, 'después de otro mensaje, el "ok" no se le preguntó a Sonnet');
    assert.ok(textosA(chatDelAcuse).includes('dale, lo vemos cuando quieras'));
  });

  await check('un "ok" cuya respuesta sale repetida: mudo, sin 🔕 y sin escalar (con otra tanda, lo repetido sigue escalando)', async () => {
    const chat = await chatDeSonnet('tenes el 13?', ['sii, tenemos el 13']);
    limpiar();
    guion(responde(['sii, tenemos el 13']));
    await habla(chat, 'ok');
    assert.strictEqual(pedidos.length, 1, 'el caso no prueba nada: no le preguntó a Sonnet');
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(!hayCampanita(), alGrupo.join(' || '));
    assert.ok(!state.todos()[chat].escalado, 'quedó escalado');
    assert.notStrictEqual(ultimaPropuesta(chat).escalar, true);
  });

  await check('"dale" justo después de la línea de la entrega inicial: no se llama a la API; "no" sí se le pregunta', async () => {
    const chat = await chatDeSonnet('tenes el 13?', ['sii, tenemos el 13']);
    const linea = 'mira, con los $300.000 al 13 todavia no llegamos, para retirarlo lo estamos pidiendo con $320.000 de entrega inicial. lo que queda lo haces en 1 o 2 cuotas';
    guion([usar('cotizar', { modelo: '13', entrega: 300000, entrega_texto: 'tengo 300' })], responde([linea]));
    await habla(chat, 'el 13, tengo 300');
    assert.ok(textosA(chat).includes(linea), 'el caso no prueba nada: no salió la línea de la entrega inicial');
    limpiar();
    guion();
    await habla(chat, 'dale');
    assert.strictEqual(pedidos.length, 0, 'llamó a la API');
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(!hayCampanita(), alGrupo.join(' || '));
    assert.strictEqual(ultimaPropuesta(chat).motivo, 'acuse');
    // "no" no es un acuse para esto (como en el bot de siempre, `esAcuseCorto`): puede ser "no llego".
    guion(responde(['tranqui, cuando llegues a esa entrega lo organizamos']));
    await habla(chat, 'no');
    assert.strictEqual(pedidos.length, 1, 'a un "no" no le preguntó a Sonnet');
  });

  await check('un acuse que no se le pregunta a Sonnet no rearma el ⚠️ de una caída (no sabe si Sonnet volvió)', async () => {
    cerebro.alContestar();
    const chat = await chatDeSonnet('tenes el 13?', ['sii, tenemos el 13']);
    const linea = 'mira, con los $300.000 al 13 todavia no llegamos, para retirarlo lo estamos pidiendo con $320.000 de entrega inicial';
    guion([usar('cotizar', { modelo: '13', entrega: 300000, entrega_texto: 'tengo 300' })], responde([linea]));
    await habla(chat, 'el 13, tengo 300');
    assert.ok(cerebro.alFallar('Anthropic 500: de mentira'), 'el caso no prueba nada: ya estaba caído');
    limpiar();
    guion();
    await habla(chat, 'dale');
    assert.strictEqual(pedidos.length, 0, 'el caso no prueba nada: le preguntó a Sonnet');
    guion({ status: 500 }, { status: 500 });
    await habla(chat, 'y el 14 tenes?');
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: no contestó el bot de siempre');
    assert.ok(!alGrupo.some((t) => /^⚠️ Sonnet no responde/.test(t)), 'avisó otra vez en la misma racha: ' + alGrupo.join(' || '));
    cerebro.alContestar();
  });

  await check('un acuse después de la lista de precios o de un "te cotizo" de una persona: tampoco se le pregunta', async () => {
    const responder = require('../src/responder');
    const lineaDel13 = responder.listaDePrecios(await responder.leerPlanilla()).split('\n').find((l) => /^Ip 13 /.test(l));
    const chat = await chatDeSonnet();
    guion([usar('lista_de_precios', {})], responde([lineaDel13, 'contame cual te interesa']));
    await habla(chat, 'pasame la lista');
    assert.ok(textosA(chat).includes(lineaDel13), 'el caso no prueba nada: no salió la lista');
    limpiar();
    guion();
    await habla(chat, 'listo');
    assert.strictEqual(pedidos.length, 0, 'después de la lista llamó a la API');
    // Sonnet la puede mandar con un renglón antes, en el mismo mensaje: también cuenta.
    const conRenglon = await chatDeSonnet();
    guion([usar('lista_de_precios', {})], responde([`te paso los del 13:\n${lineaDel13}`]));
    await habla(conRenglon, 'pasame los precios del 13');
    assert.ok(textosA(conRenglon).includes(`te paso los del 13:\n${lineaDel13}`), 'el caso no prueba nada: no salió la lista con el renglón');
    guion();
    await habla(conRenglon, 'ok');
    assert.strictEqual(pedidos.length, 0, 'después de la lista con un renglón antes llamó a la API');
    const otro = await chatDeSonnet();
    await bot.procesar(mio(otro, 'ahi llego al local y te cotizo todo'));
    state.actualizar(otro, { ultimoHumano: 0 });
    limpiar();
    guion();
    await habla(otro, 'dale');
    assert.strictEqual(pedidos.length, 0, 'después del "te cotizo" de una persona llamó a la API');
    assert.deepStrictEqual(aEste(otro), []);
  });

  await check('"dale" después del bloque de la cotización, aunque la tanda diga "te paso los numeros": sí se le pregunta (como el 📱 del bot, C67T6; el bloque se reconoce por "2 cuotas de")', async () => {
    const chat = await chatDeSonnet('tenes el 13?', ['sii, tenemos el 13']);
    guion([usar('cotizar', { modelo: '13', entrega: 340000 })], responde(['te paso los numeros', '[cotizacion]']));
    await habla(chat, 'el 13, tengo 340');
    assert.ok(textosA(chat).includes(cotizador.bloqueSonnet(filaDel13, cot13)), 'el caso no prueba nada: no salió el bloque');
    assert.ok(cerebro.cotizacionEnLaUltimaTanda(state.todos()[chat].historial), 'no reconoce el bloque como cotización');
    limpiar();
    guion(responde(['dale joya, que dia te podes acercar?']));
    await habla(chat, 'dale');
    assert.strictEqual(pedidos.length, 1, 'después de la cotización, el "dale" no se le preguntó a Sonnet');
    assert.deepStrictEqual(textosA(chat), ['dale joya, que dia te podes acercar?']);
  });

  console.log('\n2c. Ninjo bloque 1: la entrega que lee el código y los audios, por procesar\n');

  await check('"180 en efectivo y 120 por transferencia" con Sonnet pasando 180.000: en el estado queda 300.000 y el registro tiene las dos', async () => {
    const chat = await chatDeSonnet();
    const frase = '180 en efectivo y 120 por transferencia';
    guion([usar('cotizar', { modelo: '13', entrega: 180000, entrega_texto: frase })], responde(['para el 13 pedimos $320.000 de entrega inicial']));
    await habla(chat, `quiero el 13, tengo ${frase}`);
    assert.strictEqual(state.todos()[chat].entrega, 300000);
    const prop = ultimaPropuesta(chat);
    assert.deepStrictEqual(prop.sonnet.entregasDistintas, [{ modelo: 'iPhone 13', entrega_texto: frase, entrega_sonnet: 180000, entrega_leida: 300000 }]);
  });

  await check('un audio transcripto: el pedido lo marca "Cliente (audio)" y dice que lo de ahora vino por audio', async () => {
    const audio = require('../src/audio');
    const original = audio.transcribir;
    const chat = await chatDeSonnet();
    audio.transcribir = async () => ({ ok: true, texto: 'tenes el trece pro?' });
    try {
      guion(responde(['sii, tenemos el 13 pro']));
      await bot.procesar({
        key: { remoteJid: chat, fromMe: false, id: 'A' + Math.random() },
        pushName: 'Lucia',
        message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } },
      });
      await esperarHasta(() => pedidos.length > 0);
    } finally {
      audio.transcribir = original;
    }
    const pedido = textoDelPedido(0);
    assert.ok(/\] Cliente \(audio\): tenes el trece pro\?$/m.test(pedido), pedido);
    const ahora = pedido.slice(pedido.lastIndexOf('\n\n') + 2).split('\n')[0];
    assert.ok(/audio/.test(ahora), 'el pedido no dice que vino por audio: ' + ahora);
  });

  console.log('\n3. Escalar y la guardia, por el camino del 🔕\n');

  await check('escala: al cliente no le llega nada, 🔕 con el motivo, el chat queda callado y lo que sigue no llama a la API', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    guion(escala('pide fotos del 15'));
    await habla(chat, 'me mandas fotos del 15?');
    assert.deepStrictEqual(aEste(chat), []);
    const aviso = alGrupo.find((t) => /🔕/.test(t));
    assert.ok(aviso && /Motivo: pide fotos del 15/.test(aviso), alGrupo.join(' || '));
    assert.ok(!alGrupo.some((t) => /^🤖 Sonnet/.test(t)), 'un escalado no lleva el aviso de respuesta');
    assert.strictEqual(state.todos()[chat].escalado, true);
    guion();
    await habla(chat, 'hola??');
    assert.strictEqual(pedidos.length, 0);
    assert.deepStrictEqual(aEste(chat), []);
  });

  await check('la guardia frena: 🔕 con el motivo que empieza con "guardia:" y nada al cliente', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['el 13 esta $495000 de contado']), responde(['el 13 esta $495000 de contado']));
    await habla(chat, 'tenes el 13?');
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(alGrupo.some((t) => /🔕/.test(t) && /Motivo: guardia: .*sin puntos/.test(t)), alGrupo.join(' || '));
    assert.strictEqual(state.todos()[chat].escalado, true);
  });

  await check('si escala, no manda nada más: responder y escalar en la misma respuesta, al cliente no le llega nada', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    guion([...responde(['dale, ya te paso con alguien']), ...escala('quiere hablar con una persona')]);
    await habla(chat, 'quiero hablar con alguien');
    assert.deepStrictEqual(aEste(chat), []);
    assert.ok(alGrupo.some((t) => /Motivo: quiere hablar con una persona/.test(t)));
  });

  console.log('\n4. Un error de la API\n');

  await check('contesta el bot de siempre y avisa una sola vez por racha; se rearma cuando Sonnet vuelve', async () => {
    cerebro.alContestar();
    const chat = await chatDeSonnet();
    limpiar();
    const caida = () => alGrupo.filter((t) => t === '⚠️ Sonnet no responde (error 500): contesta el bot de siempre').length;
    guion({ status: 500 }, { status: 500 });
    await habla(chat, 'tenes el iphone 13?');
    assert.ok(aEste(chat).length > 0, 'no contestó el bot');
    assert.strictEqual(caida(), 1, alGrupo.join(' || '));
    const prop = eventos().filter((e) => e.tipo === 'propuesta').pop();
    assert.ok(!prop.fuente, 'la propuesta es del bot');
    const err = eventos().find((e) => e.tipo === 'propuesta-sonnet' && e.tanda === prop.tanda);
    assert.ok(err && /500/.test(err.error) && err.enVivo === true, JSON.stringify(err));
    guion({ status: 503 }, { status: 503 });
    await habla(chat, 'y el 14?');
    assert.strictEqual(alGrupo.filter((t) => /^⚠️ Sonnet no responde/.test(t)).length, 1, 'avisó dos veces en la misma racha');
    guion(responde(['VOLVIO Sonnet']));
    await habla(chat, 'y el 15?');
    assert.ok(textosA(chat).includes('VOLVIO Sonnet'));
    guion({ status: 500 }, { status: 500 });
    await habla(chat, 'y el 16?');
    assert.strictEqual(caida(), 2, 'no se rearmó');
  });

  await check('sin clave: contesta el bot y el aviso lo dice', async () => {
    cerebro.alContestar();
    const chat = await chatDeSonnet();
    const clave = config.cerebro.apikey;
    config.cerebro.apikey = '';
    limpiar();
    try {
      guion();
      await habla(chat, 'tenes el 13?');
    } finally {
      config.cerebro.apikey = clave;
    }
    assert.ok(aEste(chat).length > 0);
    assert.ok(alGrupo.includes('⚠️ Sonnet no responde (falta la clave): contesta el bot de siempre'), alGrupo.join(' || '));
    cerebro.alContestar();
  });

  console.log('\n5. El aviso "leí N mensajes"\n');

  await check('cada respuesta de Sonnet avisa cuántos mensajes leyó, con el primero (hasta 80) y el wa.me; con persona, (+N)', async () => {
    const chat = await chatDeSonnet('hola', ['contame']);
    state.agregarAlHistorial(chat, 'vendedor', 'el 13 te lo dejo en 495', { humano: true });
    limpiar();
    const largo = 'sii, el 13 lo tenemos de 128gb al 100% de bateria, y tambien tenemos del 11 al 18 pro max si tenias pensado otro';
    guion(responde([largo, 'contame']));
    await habla(chat, 'sigue en pie lo del 13?');
    const aviso = alGrupo.find((t) => t.startsWith('🤖 Sonnet →'));
    assert.ok(aviso, alGrupo.join(' || '));
    const esperado = `🤖 Sonnet → Lucia · leí 5 mensajes de contexto (+1 de una persona) · ${largo.slice(0, 79).trimEnd()}… · wa.me/${numero(chat)}`;
    assert.strictEqual(aviso, esperado);
  });

  await check('si la respuesta se corta porque el cliente escribió en medio, igual avisa lo que salió', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    const enviarTexto = evolution.enviarTexto;
    let metio = false;
    evolution.enviarTexto = async (numeroDe, t) => {
      const r = await enviarTexto(numeroDe, t);
      // Mientras sale el primero, el cliente escribe otra cosa: la tanda se corta antes del segundo.
      if (!metio && numeroDe === chat) {
        metio = true;
        await bot.procesar(escrito(chat, 'ah y otra cosa'));
      }
      return r;
    };
    try {
      guion(responde(['PRIMERO que sale', 'SEGUNDO que no sale']), responde(['RESPUESTA a todo junto']));
      await habla(chat, 'tenes el 15?');
      await esperarHasta(() => textosA(chat).includes('RESPUESTA a todo junto'));
    } finally {
      evolution.enviarTexto = enviarTexto;
    }
    assert.deepStrictEqual(textosA(chat), ['PRIMERO que sale', 'RESPUESTA a todo junto']);
    const avisos = alGrupo.filter((t) => t.startsWith('🤖 Sonnet →'));
    assert.strictEqual(avisos.length, 2, alGrupo.join(' || '));
    assert.ok(avisos[0].includes('· PRIMERO que sale ·'), avisos[0]);
  });

  await check('si no le llegó nada (Evolution no confirmó), no hay aviso', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    const enviarTexto = evolution.enviarTexto;
    evolution.enviarTexto = async (numeroDe, t) => {
      aClientes.push({ numero: numeroDe, tipo: 'texto', texto: t });
      return {};
    };
    try {
      guion(responde(['esto no se confirma']));
      await habla(chat, 'tenes el 15?');
    } finally {
      evolution.enviarTexto = enviarTexto;
    }
    assert.ok(textosA(chat).includes('esto no se confirma'), 'el caso no prueba nada: no se intentó mandar');
    assert.ok(!alGrupo.some((t) => t.startsWith('🤖 Sonnet →')), alGrupo.join(' || '));
  });

  await check('con todos: no hay aviso por respuesta; el resumen de la hora sale después, con lo leído, los escalados y el gasto', async () => {
    // Lo de antes de prender `todos` no cuenta para el resumen.
    const antes = await chatDeSonnet();
    guion(escala('esto fue con nuevos'));
    await habla(antes, 'me mandas fotos?');
    config.cerebro.modo = 'todos';
    limpiar();
    const a = nuevoChat();
    const b = nuevoChat();
    guion(responde(['para a']));
    await habla(a, 'tenes el 13?');
    guion(escala('pide colores'));
    await habla(b, 'que colores tenes?');
    assert.ok(!alGrupo.some((t) => t.startsWith('🤖 Sonnet →')), 'con todos salió el aviso por respuesta');
    await bot.revisarResumenSonnet(Date.now());
    assert.ok(!alGrupo.some((t) => t.startsWith('🤖 Última hora')), 'salió antes de que termine la hora');
    await bot.revisarResumenSonnet(Date.now() + 3600 * 1000);
    const resumen = alGrupo.find((t) => t.startsWith('🤖 Última hora'));
    const usd = cerebro.usdTexto(2 * ((1000 * 2 + 100 * 10 + 2000 * 0.2 + 500 * 2.5) / 1e6));
    assert.strictEqual(resumen, `🤖 Última hora: 1 respuesta de Sonnet, leyó 1 mensajes de contexto en promedio (el que menos, 1) · 1 escalado · ${usd}`);
    limpiar();
    await bot.revisarResumenSonnet(Date.now() + 3 * 3600 * 1000);
    assert.deepStrictEqual(alGrupo, [], 'una hora sin respuestas no avisa');
    // Si cuando termina la hora ya no está en `todos`, el resumen no sale.
    guion(responde(['para c']));
    await habla(nuevoChat(), 'tenes el 13?');
    config.cerebro.modo = 'tester';
    limpiar();
    await bot.revisarResumenSonnet(Date.now() + 3600 * 1000);
    assert.deepStrictEqual(alGrupo, [], 'salió el resumen fuera de todos');
  });

  await check('el motivo corto del ⚠️: error con su número, timeout, sin clave, o el error recortado', async () => {
    const motivo = (e) => {
      cerebro.alContestar();
      return cerebro.alFallar(e);
    };
    assert.strictEqual(motivo('Anthropic 529: overloaded'), '⚠️ Sonnet no responde (error 529): contesta el bot de siempre');
    assert.strictEqual(motivo('Anthropic no respondió en 20s'), '⚠️ Sonnet no responde (timeout): contesta el bot de siempre');
    assert.strictEqual(motivo('Anthropic: fetch failed'), '⚠️ Sonnet no responde (Anthropic: fetch failed): contesta el bot de siempre');
    cerebro.alContestar();
  });

  console.log('\n6. Comandos del grupo (solo desde la cuenta)\n');

  await check('#sonnet <número>: lo que contestaría, en el grupo, sin mandarle nada al cliente ni tocar el estado (salvo el historial con Evolution)', async () => {
    config.cerebro.modo = 'apagado';
    const chat = nuevoChat();
    await habla(chat, 'hola');
    await habla(chat, 'tenes el 15?');
    config.cerebro.modo = 'tester';
    // Bloque Ninjo 1b: el historial se completa con Evolution (acá no trae nada); fuera de eso, nada cambia.
    const sinContexto = (s) => JSON.stringify({ ...s, evolutionTraido: null });
    const antes = sinContexto(state.todos()[chat]);
    limpiar();
    guion([usar('cotizar', { modelo: '15', entrega: 600000, entrega_texto: '600' })], responde(['TE CONTESTARIA ESTO', '[cotizacion]']));
    await bot.procesar(mio(GRUPO, `#sonnet https://wa.me/${numero(chat)}`));
    assert.deepStrictEqual(aEste(chat), [], 'le mandó algo al cliente');
    assert.strictEqual(sinContexto(state.todos()[chat]), antes, 'cambió el estado');
    assert.ok(state.todos()[chat].evolutionTraido > 0, 'no completó el historial con Evolution');
    assert.ok(/Lo que escribió ahora el cliente[\s\S]*tenes el 15\?/.test(textoDelPedido(1)), 'no le preguntó por lo último del cliente');
    const r = alGrupo[0] || '';
    assert.ok(r.startsWith('🧠 A Lucia le contestaría:\n• TE CONTESTARIA ESTO\n• iPhone 15 128GB 85% 📱'), r);
    assert.ok(/\n\(\+ el PDF del compromiso de pago\)\nleí /.test(r), r);
    assert.ok(/leí \d+ mensajes de contexto · US\$0,\d{4} · al cliente no le mandé nada/.test(r) && r.includes(`wa.me/${numero(chat)}`), r);
    limpiar();
    guion(escala('sigue lo que dijo una persona'));
    await bot.procesar(mio(GRUPO, `#sonnet ${numero(chat).slice(3)}`));
    assert.ok((alGrupo[0] || '').startsWith('🧠 Escalaría: sigue lo que dijo una persona\nleí '), alGrupo[0]);
  });

  await check('#sonnet con apagado no gasta, y de alguien que no es la cuenta no hace nada', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'apagado';
    await habla(chat, 'hola');
    limpiar();
    guion();
    await bot.procesar(mio(GRUPO, `#sonnet ${numero(chat)}`));
    assert.ok(/^❓ Con CEREBRO_MODO=apagado/.test(alGrupo[0] || ''), alGrupo[0]);
    config.cerebro.modo = 'tester';
    limpiar();
    await bot.procesar(deOtro(`#sonnet ${numero(chat)}`));
    assert.deepStrictEqual(alGrupo, []);
    assert.strictEqual(pedidos.length, 0);
  });

  await check('#comparar <número>: las últimas 3 tandas, con el cliente, el bot, la persona y lo de Sonnet en sombra', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'tester';
    const pasoTanda = async (modo, paso, texto) => {
      config.cerebro.modo = modo;
      const cuantas = eventos().filter((e) => e.tipo === 'propuesta-sonnet' && e.chat === '...' + numero(chat).slice(-4)).length;
      if (paso) guion(...paso);
      else guion();
      await habla(chat, texto);
      if (paso) await esperarSombra(chat, cuantas + 1);
    };
    await pasoTanda('tester', [responde(['SOMBRA UNO'])], 'primera: tenes el 13?');
    await pasoTanda('apagado', null, 'segunda: y el 14?');
    await pasoTanda('tester', [{ status: 500 }, { status: 500 }], 'tercera: y el 15?');
    await pasoTanda('tester', [responde(['SOMBRA CUATRO'])], 'cuarta: y el 16?');
    await bot.procesar(mio(chat, 'te lo dejo a 495'));
    limpiar();
    await bot.procesar(mio(GRUPO, `#comparar ${numero(chat)}`));
    const r = alGrupo[0] || '';
    assert.ok(r.startsWith('🔍 #comparar · Lucia'), r);
    assert.ok(/últimas 3 tandas/.test(r), r);
    assert.ok(!/primera|SOMBRA UNO/.test(r), 'trajo más de 3 tandas');
    assert.ok(/👤 Cliente: "segunda: y el 14\?"/.test(r) && /🤖 El bot \(le llegó\): /.test(r), r);
    assert.ok(/no hay propuesta de Sonnet para esta tanda/.test(r), r);
    assert.ok(/no pudo pensar \(Anthropic 500/.test(r), r);
    assert.ok(/🧠 Sonnet: "SOMBRA CUATRO"/.test(r), r);
    assert.ok(/🙋 Una persona: "te lo dejo a 495"/.test(r), r);
    // Pasado el silencio de la persona, una tanda más donde Sonnet escalaría.
    state.actualizar(chat, { ultimoHumano: 0 });
    await pasoTanda('tester', [escala('pide colores del 16')], 'quinta: de que color?');
    limpiar();
    await bot.procesar(mio(GRUPO, `#comparar ${numero(chat)}`));
    assert.ok(/🧠 Sonnet: escalaría \(pide colores del 16\)/.test(alGrupo[0] || ''), alGrupo[0]);
    assert.ok(!/segunda/.test(alGrupo[0]), 'trajo más de 3 tandas');
  });

  await check('#comparar de un chat sin tandas en el registro, y #sonnet de un chat sin mensajes del cliente, lo dicen', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, 'hola, te escribo por lo del 13'));
    config.cerebro.modo = 'tester';
    limpiar();
    guion();
    await bot.procesar(mio(GRUPO, `#comparar ${numero(chat)}`));
    await bot.procesar(mio(GRUPO, `#sonnet ${numero(chat)}`));
    assert.ok(/^❓ No hay tandas de .* en el registro de aprendizaje/.test(alGrupo[0] || ''), alGrupo[0]);
    assert.ok(/^❓ .* no tiene ningún mensaje del cliente/.test(alGrupo[1] || ''), alGrupo[1]);
    assert.strictEqual(pedidos.length, 0);
  });

  await check('#comparar de un chat que contestó Sonnet en vivo lo dice', async () => {
    const chat = await chatDeSonnet('hola', ['RESPUESTA EN VIVO']);
    limpiar();
    await bot.procesar(mio(GRUPO, `#comparar ${numero(chat)}`));
    assert.ok(/🧠 Sonnet, en vivo \(le llegó\): .*"RESPUESTA EN VIVO"/.test(alGrupo[0] || ''), alGrupo[0]);
  });

  await check('#bot y #sonnet-si: sacan o ponen el chat a mano, con confirmación (solo desde la cuenta)', async () => {
    config.cerebro.modo = 'tester';
    limpiar();
    await bot.procesar(deOtro(`#bot ${TESTER}`));
    assert.ok(state.todos()[tester].atiendeSonnet === undefined, 'cambió desde alguien que no es la cuenta');
    await bot.procesar(mio(GRUPO, `#bot ${TESTER}`));
    assert.ok(/^🤖 #bot · .* — lo atiende el bot de siempre \(Sonnet sigue en sombra\)/.test(alGrupo[0] || ''), alGrupo[0]);
    assert.strictEqual(state.todos()[tester].atiendeSonnet, false);
    guion(responde(['SOMBRA del tester']));
    const antes = aEste(tester).length;
    const sombras = eventos().filter((e) => e.tipo === 'propuesta-sonnet' && e.chat === '...' + TESTER.slice(-4)).length;
    await habla(tester, 'tenes el 14?');
    await esperarSombra(tester, sombras + 1);
    assert.ok(aEste(tester).length > antes && !textosA(tester).some((t) => /SOMBRA del tester/.test(t)), 'no le contestó el bot');
    limpiar();
    await bot.procesar(mio(GRUPO, `#sonnet-si 549${TESTER.slice(3)}`));
    assert.ok(/^🧠 #sonnet-si · .* — desde ahora le contesta Sonnet/.test(alGrupo[0] || ''), alGrupo[0]);
    assert.strictEqual(state.todos()[tester].atiendeSonnet, true);
    assert.ok(state.todos()[tester].atiendeSonnetDesde > 0);
    guion(responde(['OTRA VEZ SONNET']));
    await habla(tester, 'y el 15?');
    assert.ok(textosA(tester).includes('OTRA VEZ SONNET'));
    limpiar();
    await bot.procesar(mio(GRUPO, `#sonnet-si ${TESTER}`));
    assert.ok(/ya lo atendía Sonnet, no cambié nada/.test(alGrupo[0] || ''), alGrupo[0]);
    limpiar();
    await bot.procesar(mio(GRUPO, '#bot'));
    assert.ok(/^❓ Desde el grupo, #bot va con el número/.test(alGrupo[0] || ''), alGrupo[0]);
    // Con apagado lo dicen: no hay sombra, y #sonnet-si no prende nada hasta que se prenda.
    config.cerebro.modo = 'apagado';
    limpiar();
    await bot.procesar(mio(GRUPO, `#bot ${TESTER}`));
    await bot.procesar(mio(GRUPO, `#sonnet-si ${TESTER}`));
    assert.ok(/lo atiende el bot de siempre\n/.test(alGrupo[0] || '') && !/sombra/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(/Ojo: con CEREBRO_MODO=apagado igual le contesta el bot de siempre/.test(alGrupo[1] || ''), alGrupo[1]);
    await bot.procesar(mio(tester, '#reset'));
  });

  await check('los comandos se leen solo al principio, y #sonnet-si no es #sonnet', async () => {
    const { comando } = require('../src/cerebro-comandos');
    assert.deepStrictEqual(comando('#sonnet-si 549 299 000-0000'), { tipo: 'sonnet-si', numero: '5492990000000' });
    assert.deepStrictEqual(comando('#Sonnet wa.me/5492990000000'), { tipo: 'sonnet', numero: '5492990000000' });
    assert.deepStrictEqual(comando('#comparar'), { tipo: 'comparar', numero: '' });
    assert.strictEqual(comando('🤖 #bot · Lucia'), null);
    assert.strictEqual(comando('#botón'), null);
    assert.strictEqual(comando('#sonnetsi 123'), null);
    assert.strictEqual(comando('#sonnet-no 5492990000000'), null);
  });

  console.log('\n7. Bloque Ninjo 1b: el contexto de Evolution, el bloque, la lista y el aviso al grupo\n');

  const responderMod = require('../src/responder');
  let idEvo = 0;
  /** Un registro de findMessages de hace `hace` ms. */
  const registro = (chat, { texto, hace, fromMe = false, id = null }) => ({
    key: { remoteJid: chat, fromMe, id: id || 'EVO' + ++idEvo },
    messageType: 'conversation',
    message: { conversation: texto },
    messageTimestamp: Math.floor((Date.now() - hace) / 1000),
  });
  const DIA = 24 * 60 * 60 * 1000;

  await check('contexto: chat nuevo con 20 mensajes en Evolution: Sonnet lee 21 líneas con sus etiquetas, el aviso dice cuántas son de Evolution y el registro también', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'nuevos';
    const registros = [];
    for (let i = 0; i < 20; i++) registros.push(registro(chat, { texto: i % 2 ? `persona ${i}` : `cliente ${i}`, fromMe: Boolean(i % 2), hace: (3 * DIA * (20 - i)) / 20 }));
    deEvolution = (jid) => (jid === chat ? registros.slice().reverse() : []);
    pedidosEvolution.length = 0;
    limpiar();
    guion(responde(['contame']));
    try {
      await habla(chat, 'hola');
    } finally {
      deEvolution = () => [];
    }
    assert.deepStrictEqual(pedidosEvolution, [{ jid: chat, cuantos: 30 }]);
    const pedido = textoDelPedido(0);
    const marcadas = pedido.split('\n').filter((l) => /^\[hace [^\]]+\] (Cliente|Vos \(antes\)|Persona de la cuenta): /.test(l));
    assert.strictEqual(marcadas.length, 21, pedido.slice(0, 1500));
    assert.ok(marcadas.some((l) => /\] Persona de la cuenta: persona 19$/.test(l)) && marcadas.some((l) => /\] Cliente: cliente 0$/.test(l)), pedido.slice(0, 1500));
    assert.ok(/\] Cliente: hola$/.test(marcadas[marcadas.length - 1]), 'lo de ahora no quedó al final');
    const aviso = alGrupo.find((t) => t.startsWith('🤖 Sonnet →'));
    assert.ok(aviso && /leí 21 mensajes de contexto \(20 de Evolution\)/.test(aviso), aviso);
    const prop = ultimaPropuesta(chat);
    assert.strictEqual(prop.sonnet.leidos.evolution, 20);
    assert.ok(!prop.sonnet.contexto, 'dice que Evolution falló');
    // Cada línea nueva del historial guarda el id del mensaje: la del cliente y la del bot.
    const h = state.todos()[chat].historial;
    assert.ok(h.find((l) => l.texto === 'hola').id, 'la línea del cliente no tiene id');
    assert.ok(h.find((l) => l.texto === 'contame').id, 'la línea del bot no tiene id');
    await bot.procesar(mio(chat, 'hola, soy fran'));
    assert.ok(state.todos()[chat].historial.find((l) => l.texto === 'hola, soy fran' && l.humano).id, 'la línea de una persona no tiene id');
  });

  await check('contexto: si Evolution falla, Sonnet contesta igual y el registro dice "evolution no contestó"', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'nuevos';
    deEvolution = () => {
      throw new Error('Evolution 500 en findMessages');
    };
    limpiar();
    guion(responde(['contame igual']));
    try {
      await habla(chat, 'hola');
    } finally {
      deEvolution = () => [];
    }
    assert.ok(textosA(chat).includes('contame igual'));
    assert.strictEqual(ultimaPropuesta(chat).sonnet.contexto, 'evolution no contestó');
    assert.ok(!state.todos()[chat].evolutionTraido, 'quedó marcado');
  });

  await check('contexto: después de un #reset no se le pide nada a Evolution (cada prueba del tester arranca limpia)', async () => {
    const chat = await chatDeSonnet();
    await bot.procesar(mio(chat, '#reset'));
    assert.strictEqual(state.todos()[chat], undefined, 'el #reset no borró el chat');
    pedidosEvolution.length = 0;
    config.cerebro.modo = 'todos';
    guion(responde(['de nuevo']));
    await habla(chat, 'hola de nuevo');
    assert.deepStrictEqual(pedidosEvolution, []);
    assert.ok(state.todos()[chat].evolutionTraido > 0);
    assert.ok(textosA(chat).includes('de nuevo'));
  });

  await check('la prueba en vivo del bloque 1, hecha caso: 300 → la entrega inicial sin PDF; 350 → el bloque con el PDF; "dale" después del bloque → contesta Sonnet', async () => {
    const chat = await chatDeSonnet('tenes el 13?', ['sii, tenemos el iPhone 13']);
    limpiar();
    const entregaInicial = 'mira, con los $300.000 al 13 todavia no llegamos, para retirarlo lo estamos pidiendo con $320.000 de entrega inicial. lo que queda lo haces en 1 o 2 cuotas';
    guion([usar('cotizar', { modelo: '13', entrega: 300000, entrega_texto: 'tengo 300' })], responde([entregaInicial]));
    await habla(chat, 'lo quiero, tengo 300');
    assert.ok(textosA(chat).includes(entregaInicial), 'el caso no prueba nada: no salió la entrega inicial');
    assert.deepStrictEqual(aEste(chat).filter((m) => m.tipo === 'documento'), [], 'salió el PDF con la entrega inicial');
    const cot350 = cotizador.cotizar(filaDel13, 350000, fixture.config);
    guion([usar('cotizar', { modelo: '13', entrega: 350000, entrega_texto: 'consegui 350' })], responde(['dale, con $350.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?']));
    await habla(chat, 'consegui 350');
    assert.ok(textosA(chat).includes(cotizador.bloqueSonnet(filaDel13, cot350)), JSON.stringify(textosA(chat)));
    assert.strictEqual(aEste(chat).filter((m) => m.tipo === 'documento').length, 1, 'no salió el PDF con el bloque');
    guion(responde(['dale joya, que dia te podes acercar?']));
    await habla(chat, 'dale');
    assert.strictEqual(pedidos.length, 1, 'el "dale" después del bloque no se le preguntó a Sonnet');
    assert.ok(textosA(chat).includes('dale joya, que dia te podes acercar?'));
  });

  await check('[lista]: la lista completa sale en dos mensajes tal cual (usados y sellados) y cuenta para el tope de 4', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    guion([usar('lista_de_precios', {})], responde(['te paso la lista', '[lista]', 'cual te interesa?']));
    await habla(chat, 'me pasas la lista completa?');
    const partida = responderMod.listaDePreciosPartida(await responderMod.leerPlanilla());
    assert.deepStrictEqual(textosA(chat), ['te paso la lista', partida.usados, partida.sellados, 'cual te interesa?']);
  });

  await check('aviso_grupo: el 📌 al grupo con el nombre y el wa.me, y el chat sigue con Sonnet (no queda callado)', async () => {
    const chat = await chatDeSonnet();
    limpiar();
    guion([usar('buscar_equipos', { modelo: '18' })], [usar('responder', { mensajes: ['justo ese no me esta quedando, tengo el 17 sellado en $1.600.000'], aviso_grupo: 'pidió el 18 y no está en la planilla' })]);
    await habla(chat, 'tenes el 18?');
    assert.deepStrictEqual(textosA(chat), ['justo ese no me esta quedando, tengo el 17 sellado en $1.600.000']);
    assert.ok(alGrupo.includes(`📌 Lucia — pidió el 18 y no está en la planilla — wa.me/${numero(chat)}`), alGrupo.join(' || '));
    assert.ok(!state.todos()[chat].escalado, 'quedó escalado');
    assert.strictEqual(ultimaPropuesta(chat).sonnet.avisoGrupo, 'pidió el 18 y no está en la planilla');
    guion(responde(['sigue Sonnet']));
    await habla(chat, 'y en cuotas?');
    assert.ok(textosA(chat).includes('sigue Sonnet'));
  });

  await check('el parecido con la entrega que ya dio (decisión de Tomás del 08/10): "el 14 plus con 450 mil?" → el 14 cotizado con esa entrega; salen 4 (el saludo pegado al primero, el bloque, el PDF de pie del último) y el 📌 al grupo', async () => {
    // La planilla sin el 14 Plus, con el 14 de 128GB al 100% a $595.000 y mínimo $410.000 (la LISTA de hoy) y sin la
    // unidad suelta del 14: el más parecido al 14 Plus es esa fila.
    const fila14 = { ...fixture.lista.find((f) => f.modelo === 'iPhone 14'), bateria_min: 100, precio_contado: 595000, anticipo_min: 410000, pago_unico_manual: 0, cuota_2_manual: 0 };
    const sinCatorcePlus = { ...fixture, lista: fixture.lista.map((f) => (f.modelo === 'iPhone 14' ? fila14 : f)), usados: fixture.usados.filter((f) => f.modelo !== 'iPhone 14') };
    const cot = cotizador.cotizar(fila14, 450000, fixture.config);
    assert.ok(cot.ok && !cot.soloContado && !cot.bajoMinimo, 'el caso no prueba nada: 450.000 no da las cuotas de siempre');
    const escritos = [
      'justo el 14 plus no me esta quedando, lo mas parecido que tengo es el 14 de 128gb al 100%',
      'con los $450.000 de entrega te queda asi',
      '[cotizacion]',
      'te sirve ese o tenias pensado otro?',
    ];
    const chat = nuevoChat();
    config.cerebro.modo = 'nuevos';
    limpiar();
    sheets.usarFixture(sinCatorcePlus);
    try {
      guion(
        [usar('buscar_equipos', { modelo: '14 plus' })],
        [usar('cotizar', { modelo: 'iPhone 14', capacidad: 128, entrega: 450000, entrega_texto: 'el 14 plus con 450 mil?' })],
        [usar('responder', { mensajes: escritos, aviso_grupo: 'pidió el 14 plus y no está en la planilla' })]
      );
      await habla(chat, 'el 14 plus con 450 mil?');
    } finally {
      sheets.usarFixture(fixture);
    }
    assert.strictEqual(pedidos.length, 3, 'no se le preguntó a Sonnet las tres vueltas');
    const salio = aEste(chat);
    assert.strictEqual(salio.length, 4, JSON.stringify(salio));
    assert.ok(/luciaa/i.test(salio[0].texto) && salio[0].texto.endsWith('\n' + escritos[0]), 'el saludo no va pegado al primero: ' + salio[0].texto);
    assert.strictEqual(salio[1].texto, escritos[1]);
    assert.strictEqual(salio[2].texto, cotizador.bloqueSonnet(fila14, cot), 'el tercero no es el bloque del 14');
    assert.deepStrictEqual(salio[3], { ...salio[3], tipo: 'documento', texto: escritos[3] });
    assert.ok(alGrupo.includes(`📌 Lucia — pidió el 14 plus y no está en la planilla — wa.me/${numero(chat)}`), alGrupo.join(' || '));
    assert.ok(!alGrupo.some((t) => /🔕/.test(t)), 'escaló: ' + alGrupo.join(' || '));
    const s = state.todos()[chat];
    assert.ok(!s.escalado, 'quedó escalado');
    assert.deepStrictEqual([s.modelo, s.capacidad_gb, s.entrega, s.compromisoEnviado], ['iPhone 14', 128, 450000, true]);
    assert.strictEqual(ultimaPropuesta(chat).sonnet.avisoGrupo, 'pidió el 14 plus y no está en la planilla');
  });

  await check('otro modelo con la entrega ya dicha (decisión de Tomás del 08/10): "el 13 con 450 mil?" y después "y el 14?" → el 14 cotizado con esa entrega ($234.000 y $134.000), sin el contado, sin saludo y sin un segundo PDF', async () => {
    // La LISTA de hoy: el 13 de 128GB al 100% a $535.000 (mínimo $370.000) y el 14 a $595.000 (mínimo $410.000), con
    // los coeficientes de producción y sin las unidades sueltas del 13 y del 14.
    const deHoy = { 'iPhone 13': { precio_contado: 535000, anticipo_min: 370000 }, 'iPhone 14': { precio_contado: 595000, anticipo_min: 410000 } };
    const planilla = {
      ...fixture,
      config: { ...fixture.config, coef1: 1.54, coef2: 1.7 },
      lista: fixture.lista.map((f) => (deHoy[f.modelo] ? { ...f, bateria_min: 100, pago_unico_manual: 0, cuota_2_manual: 0, ...deHoy[f.modelo] } : f)),
      usados: fixture.usados.filter((f) => !deHoy[f.modelo]),
    };
    const fila14 = planilla.lista.find((f) => f.modelo === 'iPhone 14');
    const cot = cotizador.cotizar(fila14, 450000, planilla.config);
    assert.deepStrictEqual([cot.ok, cot.soloContado, cot.bajoMinimo, cot.pagoUnico, cot.cuotaDe2], [true, false, false, 234000, 134000]);
    const escritos = ['el 14 de 128gb al 100%, con los $450.000 de entrega te queda asi', '[cotizacion]', 'cual te cierra mas, el 13 o el 14?'];
    const chat = nuevoChat();
    config.cerebro.modo = 'nuevos';
    limpiar();
    sheets.usarFixture(planilla);
    try {
      guion(
        [usar('buscar_equipos', { modelo: '13' })],
        [usar('cotizar', { modelo: '13', entrega: 450000, entrega_texto: 'el 13 con 450 mil?' })],
        responde(['dale, con $450.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?'])
      );
      await habla(chat, 'el 13 con 450 mil?');
      assert.strictEqual(aEste(chat).filter((m) => m.tipo === 'documento').length, 1, 'el PDF no salió con el 13: ' + JSON.stringify(aEste(chat)));
      limpiar();
      guion([usar('cotizar', { modelo: '14', entrega: 450000, entrega_texto: 'el 13 con 450 mil?' })], responde(escritos));
      await habla(chat, 'y el 14?');
    } finally {
      sheets.usarFixture(fixture);
    }
    assert.strictEqual(pedidos.length, 2, 'no se le preguntó a Sonnet las dos vueltas');
    assert.ok(textoDelPedido(0).includes('con cuánto dijo que cuenta para la entrega: $450.000'), 'el pedido no dice la entrega que ya dijo');
    assert.deepStrictEqual(aEste(chat).map((m) => [m.tipo, m.texto]), [
      ['texto', escritos[0]],
      ['texto', cotizador.bloqueSonnet(fila14, cot)],
      ['texto', escritos[2]],
    ]);
    assert.ok(!/595\.000/.test(textosA(chat).join('\n')), 'salió el contado del 14');
    assert.ok(!alGrupo.some((t) => /🔕/.test(t)), 'escaló: ' + alGrupo.join(' || '));
    const s = state.todos()[chat];
    assert.ok(!s.escalado, 'quedó escalado');
    assert.deepStrictEqual([s.modelo, s.entrega, s.compromisoEnviado], ['iPhone 14', 450000, true]);
  });

  await check('con todos, el resumen de la hora suma los chats que se completaron con Evolution', async () => {
    config.cerebro.modo = 'todos';
    await bot.revisarResumenSonnet(Date.now() + 3600 * 1000);
    const chat = nuevoChat();
    deEvolution = (jid) => (jid === chat ? [registro(chat, { texto: 'de antes', hace: 2 * DIA })] : []);
    limpiar();
    guion(responde(['para el resumen']));
    try {
      await habla(chat, 'hola');
    } finally {
      deEvolution = () => [];
    }
    await bot.revisarResumenSonnet(Date.now() + 3600 * 1000);
    const resumen = alGrupo.find((t) => t.startsWith('🤖 Última hora')) || '';
    assert.ok(/ · 1 chat completado con Evolution · US\$/.test(resumen), resumen);
  });

  console.log('\n8. Bloque Ninjo 1b: cuando vence el silencio de una persona (revisarSilencios)\n');

  const hace = (min) => Date.now() - min * 60 * 1000;
  /** Un chat donde una persona habló hace `personaHace` minutos y el cliente escribió después, sin respuesta. */
  function silencioDe({ personaHace = 50, clienteHace = 40, texto = 'y el 13 en cuantas cuotas?', extra = {} } = {}) {
    const chat = nuevoChat();
    state.actualizar(chat, {
      nombre: 'Lucia',
      ultimoHumano: hace(personaHace),
      historial: [
        { quien: 'cliente', texto: 'hola, tenes el 13?', ts: hace(personaHace + 5) },
        { quien: 'vendedor', texto: 'sii, el 13 lo tenemos', ts: hace(personaHace), humano: true },
        { quien: 'cliente', texto, ts: hace(clienteHace) },
      ],
      ...extra,
    });
    return chat;
  }
  /** Los chats de los casos anteriores no entran al barrido. */
  function apartarLosDemas() {
    for (const id of Object.keys(state.todos())) state.actualizar(id, { silencioAtendido: Number.MAX_SAFE_INTEGER });
  }

  await check('vence el silencio y la línea del cliente no tuvo respuesta: contesta Sonnet (origen silencio, sin persona atendiendo) y un segundo barrido no repite', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const chat = silencioDe();
    limpiar();
    guion(responde(['dale, en 1 o 2 cuotas con una entrega inicial']));
    const tomados = await bot.revisarSilencios();
    assert.deepStrictEqual(tomados, [chat]);
    assert.deepStrictEqual(textosA(chat), ['dale, en 1 o 2 cuotas con una entrega inicial']);
    assert.ok(/Lo que escribió ahora el cliente[\s\S]*y el 13 en cuantas cuotas\?/.test(textoDelPedido(0)), 'no le preguntó por la línea que esperaba');
    const prop = ultimaPropuesta(chat);
    assert.strictEqual(prop.origen, 'silencio', JSON.stringify(prop));
    assert.strictEqual(prop.fuente, 'sonnet', JSON.stringify(prop));
    assert.strictEqual(prop.contexto.humanoAtendiendo, false, JSON.stringify(prop));
    guion();
    assert.deepStrictEqual(await bot.revisarSilencios(), [], 'el segundo barrido lo tomó otra vez');
    assert.strictEqual(pedidos.length, 0, 'el segundo barrido le preguntó a Sonnet');
  });

  await check('no lo toma: la persona le contestó, la línea tiene 73 h, el chat está escalado, todavía no venció el silencio, o la línea llegó con el silencio ya vencido', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const contestado = silencioDe();
    state.agregarAlHistorial(contestado, 'vendedor', 'dale, ahi te paso', { humano: true });
    const vieja = silencioDe({ personaHace: 73 * 60 + 30, clienteHace: 73 * 60 });
    const escalado = silencioDe({ extra: { escalado: true, escaladoEn: hace(30) } });
    const enSilencio = silencioDe({ personaHace: 20, clienteHace: 10 });
    const tarde = silencioDe({ personaHace: 120, clienteHace: 60 });
    limpiar();
    guion();
    assert.deepStrictEqual(await bot.revisarSilencios(), []);
    for (const c of [contestado, vieja, escalado, enSilencio, tarde]) assert.deepStrictEqual(aEste(c), []);
    assert.strictEqual(pedidos.length, 0);
  });

  await check('no lo toma si lo que quedó son acuses o agradecimientos ("Okiss dale", "Noo, gracias a vos", "Dale dale", 👍): la charla la cerró la persona; un "dale" con una pregunta sí', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const acuses = ['Okiss dale', 'Noo, gracias a vos', 'Dale dale', 'Dale gracias!!!', '👍', 'Todo bienn', 'okk', 'Muchas gracias abrazo y buena semana'].map((texto) =>
      silencioDe({ texto })
    );
    const conPregunta = silencioDe({ texto: 'dale, y el 13 cuanto sale?' });
    const pago = silencioDe({ texto: 'Hola fran mañana ya te pago' });
    limpiar();
    guion(responde(['dale, en 1 o 2 cuotas con una entrega inicial']), responde(['dale, en 1 o 2 cuotas con una entrega inicial']));
    const tomados = await bot.revisarSilencios();
    assert.deepStrictEqual(tomados.sort(), [conPregunta, pago].sort());
    for (const c of acuses) assert.deepStrictEqual(aEste(c), [], `contestó un acuse: ${c}`);
  });

  await check('5 chats a la vez: 3 en ese barrido y 2 en el siguiente (SILENCIO_MAX_POR_BARRIDO)', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const chats = [1, 2, 3, 4, 5].map(() => silencioDe());
    limpiar();
    guion(responde(['uno']), responde(['dos']), responde(['tres']));
    const primeros = await bot.revisarSilencios();
    assert.strictEqual(primeros.length, 3, JSON.stringify(primeros));
    guion(responde(['cuatro']), responde(['cinco']));
    const segundos = await bot.revisarSilencios();
    assert.strictEqual(segundos.length, 2, JSON.stringify(segundos));
    assert.deepStrictEqual([...primeros, ...segundos].sort(), chats.slice().sort());
    assert.ok(chats.every((c) => aEste(c).length === 1), 'alguno no recibió su respuesta');
  });

  await check('Sonnet falla en el barrido: al cliente no le sale nada (no contesta el bot de siempre) y al grupo le llega el 💬 SIN CONTESTAR', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const chat = silencioDe();
    limpiar();
    guion({ status: 500 }, { status: 500 });
    await bot.revisarSilencios();
    assert.deepStrictEqual(aEste(chat), [], 'le contestó el bot de siempre');
    assert.ok(alGrupo.includes(`💬 SIN CONTESTAR — Lucia — "y el 13 en cuantas cuotas?" — wa.me/${numero(chat)}`), alGrupo.join(' || '));
    const err = eventos().filter((e) => e.tipo === 'propuesta-sonnet' && e.chat === '...' + numero(chat).slice(-4)).pop();
    assert.ok(err && /500/.test(err.error) && err.origen === 'silencio', JSON.stringify(err));
    // La línea sigue sin respuesta, pero ya se atendió (silencioAtendido): el barrido siguiente no la toma.
    limpiar();
    guion();
    assert.deepStrictEqual(await bot.revisarSilencios(), [], 'lo tomó otra vez');
    assert.strictEqual(pedidos.length, 0);
    assert.ok(!alGrupo.some((t) => /SIN CONTESTAR/.test(t)), 'el 💬 salió dos veces');
  });

  await check('solo los chats que atiende Sonnet, y nunca en borrador', async () => {
    apartarLosDemas();
    config.cerebro.modo = 'apagado';
    const conBot = silencioDe();
    guion();
    assert.deepStrictEqual(await bot.revisarSilencios(), []);
    config.cerebro.modo = 'todos';
    config.modoBorrador = true;
    try {
      assert.deepStrictEqual(await bot.revisarSilencios(), []);
    } finally {
      config.modoBorrador = false;
    }
    assert.deepStrictEqual(aEste(conBot), []);
    state.actualizar(conBot, { silencioAtendido: Number.MAX_SAFE_INTEGER });
  });

  await check('no toma a un contacto personal (CONTACTOS_PERSONALES) aunque su estado sea de antes de sumarlo a la lista: ni Sonnet ni aviso al grupo (…5984, 06/10)', async () => {
    config.cerebro.modo = 'todos';
    apartarLosDemas();
    const personal = silencioDe();
    const cliente = silencioDe();
    config.contactosPersonales.push(numero(personal));
    try {
      limpiar();
      guion(responde(['dale, en 1 o 2 cuotas con una entrega inicial']));
      assert.deepStrictEqual(await bot.revisarSilencios(), [cliente]);
      assert.deepStrictEqual(aEste(personal), [], 'le escribió al contacto personal');
      assert.strictEqual(pedidos.length, 1, 'le preguntó a Sonnet por el contacto personal');
      assert.ok(!alGrupo.some((t) => t.includes(numero(personal))), 'avisó al grupo por el contacto personal');
    } finally {
      config.contactosPersonales.pop();
    }
    state.actualizar(personal, { silencioAtendido: Number.MAX_SAFE_INTEGER });
  });

  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
