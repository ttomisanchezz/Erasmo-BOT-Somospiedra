'use strict';
/**
 * Sonnet en sombra donde atiende una persona (decisión de Tomás del 03/10/2026, por 7 días).
 *
 *   node test/sombra-persona.test.js
 *
 * Con un `fetch` de mentira que contesta como la API de Anthropic y un Evolution de mentira: nunca
 * sale a la red. Se prueba, a través de index.js (`procesar`), que con CEREBRO_SOMBRA_PERSONA_HASTA:
 *   1. con una persona atendiendo, Sonnet piensa en sombra: al cliente y al grupo no les llega
 *      nada, el estado del chat no cambia y queda `propuesta-sonnet` con `conPersona: 'persona'`;
 *   2. Sonnet ve el chat solo hasta la última línea del cliente (lo que contestó la persona después
 *      no entra), y las líneas seguidas van juntas;
 *   3. un escalado que calla también (`conPersona: 'escalado'`);
 *   4. la tanda que se cancela porque una persona contestó mientras esperaba va a la sombra;
 *   5. vencida, mal escrita, con `apagado` o en escucha: no piensa;
 *   6. el tope del día; 7. un #reset antes de pensar; 8. lo que muestra /salud.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sombra-persona-'));
const GRUPO = '120363000000000088@g.us';

// El entorno se fija acá y no se hereda del .env (dotenv no pisa lo que ya está puesto).
process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '6';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '5490000099999';
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
process.env.AUDIO_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.FOTOS_DIR = path.join(TMP, 'sin-fotos');
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.env.EVOLUTION_INSTANCE = 'somospiedra';
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.CEREBRO_MODO = 'todos';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '2099-12-31';
process.env.CEREBRO_SOMBRA_PERSONA_TOPE_USD = '';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
// Bloque Ninjo 1b: el contexto de Evolution se pide solo con clave (de mentira; buscarMensajesDeChat va reemplazado).
process.env.EVOLUTION_APIKEY = 'clave-de-mentira';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// La API de mentira (como en test/cerebro-vivo.test.js).
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const responde = (mensajes) => [usar('responder', { mensajes, compromiso_de_pago: false })];
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
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};
const textoDelPedido = (i) => pedidos[i].body.messages[0].content.map((b) => b.text || '').join('\n');

// El bot, sin red.
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, t) => {
  aClientes.push({ numero, texto: t });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero, ruta, pie) => {
  aClientes.push({ numero, texto: pie });
  return respuestaEvolution(numero);
};
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });
// Bloque Ninjo 1b: lo que Evolution tiene de cada chat (src/contexto.js). Por defecto, nada.
let deEvolution = () => [];
evolution.buscarMensajesDeChat = async (jid) => deEvolution(jid);

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const sombraPersona = require('../src/sombra-persona');

const escrito = (chatId, t) => ({ key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() }, pushName: 'Lucia', message: { conversation: t } });
/** Un mensaje escrito desde la cuenta del negocio en el chat del cliente: una persona. */
const mio = (chatId, t) => ({ key: { remoteJid: chatId, fromMe: true, id: 'H' + Math.random() }, pushName: 'Persona', message: { conversation: t } });
function eventos() {
  try {
    return fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
let n = 0;
const nuevoChat = () => '54900001' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const corto = (chat) => '...' + chat.split('@')[0].slice(-4);
const habla = (chat, t) => bot.procesar(escrito(chat, t));
async function esperarHasta(cond, ms = 2000) {
  for (let t = 0; t < ms && !cond(); t += 10) await dormir(10);
}
const sombrasDe = (chat) => eventos().filter((e) => e.tipo === 'propuesta-sonnet' && e.chat === corto(chat) && e.conPersona);
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}
/** Un chat que contestó Sonnet en vivo y después tomó una persona (con la línea dada). */
async function chatConPersona(lineaDeLaPersona = 'LINEA DE FRAN: el 13 te lo dejo en 495') {
  const chat = nuevoChat();
  guion(responde(['contame que modelo buscabas']));
  await habla(chat, 'hola');
  await bot.procesar(mio(chat, lineaDeLaPersona));
  await dormir(5);
  return chat;
}
function ritmo(min, max) {
  config.ritmo.esperaMinMs = min;
  config.ritmo.esperaMaxMs = max;
}

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  } finally {
    config.cerebro.modo = 'todos';
    config.cerebro.sombraPersonaHasta = '2099-12-31';
    config.cerebro.sombraPersonaTopeUsd = 1.5;
    config.modoEscucha = false;
    ritmo(5, 6);
  }
}

(async () => {
  console.log('\nSombra con persona (03/10/2026)\n');

  await check('el entorno: lee la fecha y el tope (1,5 por defecto)', async () => {
    assert.strictEqual(config.cerebro.sombraPersonaHasta, '2099-12-31');
    assert.strictEqual(config.cerebro.sombraPersonaTopeUsd, 1.5);
    assert.strictEqual(sombraPersona.activa(), true);
  });

  await check('persona atendiendo: Sonnet piensa en sombra, no sale nada y el estado no cambia', async () => {
    const chat = await chatConPersona();
    limpiar();
    const antes = JSON.stringify((({ escalado, ultimaRespuestaSonnet, modelo, entrega, insistenciaEntrega }) => ({ escalado, ultimaRespuestaSonnet, modelo, entrega, insistenciaEntrega }))(state.todos()[chat]));
    guion(responde(['SOMBRA CON PERSONA']));
    await habla(chat, 'y en cuotas como seria?');
    await esperarHasta(() => sombrasDe(chat).length >= 1);
    const s = sombrasDe(chat);
    assert.strictEqual(s.length, 1, 'no quedó la propuesta en sombra');
    assert.strictEqual(s[0].conPersona, 'persona');
    assert.deepStrictEqual(s[0].mensajes, ['SOMBRA CON PERSONA']);
    assert.ok(s[0].usd > 0 && s[0].lineas.length === 1 && s[0].lineas[0], JSON.stringify(s[0]));
    assert.strictEqual(pedidos.length, 1, 'tiene que ser una sola llamada');
    assert.ok(/y en cuotas como seria\?/.test(textoDelPedido(0)), 'el pedido no lleva lo que escribió el cliente');
    assert.ok(/LINEA DE FRAN/.test(textoDelPedido(0)), 'el pedido no lleva lo que había dicho la persona');
    await dormir(20);
    assert.deepStrictEqual(aClientes, [], 'le llegó algo al cliente');
    assert.deepStrictEqual(alGrupo, [], 'le llegó algo al grupo');
    const despues = JSON.stringify((({ escalado, ultimaRespuestaSonnet, modelo, entrega, insistenciaEntrega }) => ({ escalado, ultimaRespuestaSonnet, modelo, entrega, insistenciaEntrega }))(state.todos()[chat]));
    assert.strictEqual(despues, antes, 'la sombra tocó el estado del chat');
    assert.ok(!eventos().some((e) => e.tipo === 'propuesta' && e.chat === corto(chat) && e.ts > s[0].ts), 'quedó una propuesta en vivo');
  });

  await check('bloque Ninjo 1b: antes de pensar completa el historial con Evolution, como en vivo (y el registro dice cuántas leyó de ahí)', async () => {
    // Un chat que no pasó por Sonnet (si no, ya tendría el contexto traído): una persona acaba de escribir.
    const chat = nuevoChat();
    state.actualizar(chat, { ultimoHumano: Date.now(), historial: [{ quien: 'vendedor', texto: 'LINEA DE FRAN', ts: Date.now(), humano: true }] });
    const viejo = { key: { remoteJid: chat, fromMe: false, id: 'EVO-SOMBRA' }, messageType: 'conversation', message: { conversation: 'LINEA VIEJA DE EVOLUTION' }, messageTimestamp: Math.floor((Date.now() - 3 * 24 * 3600 * 1000) / 1000) };
    deEvolution = (jid) => (jid === chat ? [viejo] : []);
    limpiar();
    guion(responde(['SOMBRA']));
    try {
      await habla(chat, 'y el 14?');
      await esperarHasta(() => sombrasDe(chat).length >= 1);
    } finally {
      deEvolution = () => [];
    }
    assert.ok(/\] Cliente: LINEA VIEJA DE EVOLUTION/.test(textoDelPedido(0)), 'el pedido no trae lo de Evolution');
    assert.strictEqual(sombrasDe(chat)[0].leidos.evolution, 1);
    assert.deepStrictEqual(aClientes, []);
  });

  await check('Sonnet ve el chat solo hasta el último mensaje del cliente; las líneas seguidas van juntas', async () => {
    const chat = await chatConPersona();
    ritmo(150, 151);
    limpiar();
    guion(responde(['SOMBRA']));
    await habla(chat, 'tenes el 15?');
    await dormir(5);
    await habla(chat, 'y el 16?');
    await dormir(5);
    await bot.procesar(mio(chat, 'RESPUESTA POSTERIOR DE FRAN'));
    await esperarHasta(() => sombrasDe(chat).length >= 1);
    const s = sombrasDe(chat);
    assert.strictEqual(s.length, 1, 'tenía que ser una sola sombra para las dos líneas');
    assert.strictEqual(s[0].lineas.length, 2);
    assert.strictEqual(pedidos.length, 1);
    const pedido = textoDelPedido(0);
    assert.ok(/tenes el 15\?\ny el 16\?/.test(pedido), 'no van las dos líneas juntas: ' + pedido.slice(-200));
    assert.ok(!/RESPUESTA POSTERIOR/.test(pedido), 'se coló lo que contestó la persona después');
    assert.ok(/LINEA DE FRAN/.test(pedido), 'falta lo que la persona había dicho antes');
    assert.deepStrictEqual(aClientes, []);
  });

  await check('escalado que calla: también piensa en sombra, con conPersona escalado, y no sale nada', async () => {
    const chat = nuevoChat();
    guion(escala('postventa: el equipo no carga'));
    await habla(chat, 'el que me vendieron no carga');
    assert.ok(state.todos()[chat].escalado, 'no quedó escalado');
    limpiar();
    // No dice "escalado": desde el bloque Ninjo 1 la guardia frena un mensaje que nombra "escalar".
    guion(responde(['SOMBRA DEL CHAT CALLADO']));
    await habla(chat, 'hola? me contestan?');
    await esperarHasta(() => sombrasDe(chat).length >= 1);
    const s = sombrasDe(chat);
    assert.strictEqual(s.length, 1);
    assert.strictEqual(s[0].conPersona, 'escalado');
    assert.deepStrictEqual(s[0].mensajes, ['SOMBRA DEL CHAT CALLADO']);
    await dormir(20);
    assert.deepStrictEqual(aClientes, [], 'le llegó algo al cliente');
    assert.ok(state.todos()[chat].escalado, 'la sombra sacó el escalado');
  });

  await check('la tanda que se cancela porque contestó una persona mientras esperaba va a la sombra, sin esa respuesta', async () => {
    const chat = nuevoChat();
    ritmo(150, 151);
    limpiar();
    guion(responde(['SOMBRA DE LA CANCELADA']));
    const p = habla(chat, 'tenes el 13?');
    await dormir(20);
    await bot.procesar(mio(chat, 'FRAN CONTESTA RAPIDO'));
    await p;
    await esperarHasta(() => sombrasDe(chat).length >= 1);
    const s = sombrasDe(chat);
    assert.strictEqual(s.length, 1, 'no pensó en sombra');
    assert.strictEqual(s[0].conPersona, 'persona');
    assert.strictEqual(pedidos.length, 1, 'tenía que ser solo la sombra (la tanda en vivo se canceló)');
    assert.ok(/tenes el 13\?/.test(textoDelPedido(0)));
    assert.ok(!/FRAN CONTESTA RAPIDO/.test(textoDelPedido(0)), 'se coló lo que contestó la persona');
    assert.deepStrictEqual(aClientes, []);
  });

  await check('vencida, mal escrita o con CEREBRO_MODO=apagado: no piensa ni llama a la API', async () => {
    for (const [campo, valor] of [['hasta', '2020-01-01'], ['hasta', '10/10/2026'], ['hasta', ''], ['modo', 'apagado']]) {
      const chat = await chatConPersona();
      if (campo === 'hasta') config.cerebro.sombraPersonaHasta = valor;
      else config.cerebro.modo = valor;
      guion();
      await habla(chat, 'hola, sigue el 13?');
      await dormir(60);
      assert.strictEqual(pedidos.length, 0, `llamó a la API con ${campo}=${valor}`);
      assert.strictEqual(sombrasDe(chat).length, 0);
      config.cerebro.sombraPersonaHasta = '2099-12-31';
      config.cerebro.modo = 'todos';
    }
  });

  await check('en escucha no se prende (ahí el bot ya piensa en esos chats)', async () => {
    config.modoEscucha = true;
    assert.strictEqual(sombraPersona.activa(), false);
    config.modoEscucha = false;
    assert.strictEqual(sombraPersona.activa(), true);
    config.cerebro.sombraPersonaHasta = '2099-12-31';
    assert.strictEqual(sombraPersona.activa(Date.UTC(2100, 0, 1, 12)), false, 'el 01/01/2100 ya está vencida');
    assert.strictEqual(sombraPersona.activa(Date.UTC(2099, 11, 31, 12)), true, 'el último día cuenta');
  });

  await check('tope del día: pasado el tope no llama más a la API', async () => {
    sombraPersona.reiniciar();
    config.cerebro.sombraPersonaTopeUsd = 0.000001;
    const chat = await chatConPersona();
    guion(responde(['PRIMERA']));
    await habla(chat, 'tenes el 14?');
    await esperarHasta(() => sombrasDe(chat).length >= 1);
    assert.strictEqual(sombrasDe(chat).length, 1, 'la primera tenía que pensar');
    guion(responde(['SEGUNDA']));
    await habla(chat, 'y el 15?');
    await dormir(60);
    assert.strictEqual(pedidos.length, 0, 'pasado el tope llamó igual');
    assert.strictEqual(sombrasDe(chat).length, 1);
    assert.ok(sombraPersona.resumen().usdHoy > 0.000001);
    sombraPersona.reiniciar();
  });

  await check('un #reset antes de pensar: no piensa', async () => {
    const chat = await chatConPersona();
    ritmo(150, 151);
    guion();
    await habla(chat, 'hola, sigue el 13?');
    await dormir(5);
    await bot.procesar(mio(chat, '#reset'));
    await dormir(250);
    assert.strictEqual(pedidos.length, 0, 'pensó con el chat reiniciado');
    assert.strictEqual(sombrasDe(chat).length, 0);
  });

  await check('/salud: si está prendida, hasta cuándo y lo de hoy', async () => {
    sombraPersona.reiniciar();
    const chat = await chatConPersona();
    guion(responde(['X']));
    await habla(chat, 'cuanto sale el 13?');
    await esperarHasta(() => sombrasDe(chat).length >= 1);
    const r = sombraPersona.resumen();
    assert.strictEqual(r.activa, true);
    assert.strictEqual(r.hasta, '2099-12-31');
    assert.strictEqual(r.pensadasHoy, 1);
    assert.ok(r.usdHoy > 0);
    assert.strictEqual(r.topeUsd, 1.5);
  });

  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
