'use strict';
/**
 * Lo que cita el cliente (decisión de Tomás del 08/10/2026, chat …3557): el cliente respondió a un producto del
 * catálogo de WhatsApp ("iPhone 13 100%") con "Hola a qe precio están" y Sonnet no vio la cita: mandó la lista
 * entera. Desde ahí, la línea del cliente que va al historial y a Sonnet empieza con `[responde a: <lo citado>]`.
 *
 *   node test/responde-a.test.js
 *
 * Todo con un `fetch` de mentira que contesta como la API de Anthropic y Evolution de mentira: nunca sale a la red.
 * Se prueba:
 *   1. las piezas (src/texto-del-mensaje.js): qué es lo citado (el producto del catálogo con su título y su precio
 *      si viene, el texto o el epígrafe, "[foto]" de una foto sin texto), recortado a 120 caracteres y sin saltos de
 *      línea, en las dos ubicaciones de `contextInfo` (la del tipo de mensaje y `data.contextInfo`); sin cita o con
 *      una cita vacía, nada;
 *   2. el webhook (index.js `procesar`) con Sonnet: la línea del historial y lo que escribió ahora empiezan con
 *      `[responde a: …]`; sin cita, igual que hoy; un audio que cita también; los comandos del tester siguen;
 *   3. lo que no cambia con una cita: el bot de siempre recibe el mensaje sin la cita, un acuse que cita sigue
 *      siendo un acuse, y el saludo del día no toma el "como estas?" de lo citado;
 *   4. las líneas que trae contexto.js de Evolution: las del cliente con su cita, las de la cuenta sin;
 *   5. las reglas: qué es `[responde a: …]` y el ejemplo del caso de …3557.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'responde-a-'));
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
process.env.GRUPO_AVISOS_JID = '';
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
process.env.STOCK_APP_MODO = 'apagado';
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
// Sin clave de Evolution: contexto.completar no pide nada (lo de contexto.js se prueba con `lineasDe`).
process.env.EVOLUTION_APIKEY = '';
process.env.EVOLUTION_URL = 'http://127.0.0.1:9';
process.env.SHEET_ID = '';
process.env.SUPABASE_URL = '';
process.env.SUPABASE_SERVICE_ROLE_KEY = '';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// La API de mentira
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const FICHA = { quiere_avanzar: false, cuando: '', cuando_es: 'no_dijo', forma_pago: 'no_dijo', zona: '', canje: '' };
const responde = (mensajes) => [usar('responder', { mensajes, ficha: FICHA })];
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
/** El texto del pedido N (el contexto que armó el código). */
const textoDelPedido = (i) => pedidos[i].body.messages[0].content.map((b) => b.text || '').join('\n');
/** Lo que el pedido dice que escribió ahora el cliente (entre las comillas triples). */
const loQueEscribio = (i) => (textoDelPedido(i).match(/\(contestá esto\):\n"""\n([\s\S]*?)\n"""/) || [])[1];

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
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, t) => {
  aClientes.push({ numero, texto: t });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async () => ({});
evolution.estadoInstancia = async () => ({ state: 'open' });
evolution.buscarMensajesDeChat = async () => [];
// El bot de siempre: lo que recibe `decidir` (index.js lo toma al cargarse, por eso va antes de requerirlo).
const responder = require('../src/responder');
const decidirReal = responder.decidir;
const alBot = [];
responder.decidir = async (chatId, mensaje, ...resto) => {
  alBot.push(mensaje);
  return decidirReal(chatId, mensaje, ...resto);
};
// Un audio "se transcribe" con lo que diga la prueba.
const audio = require('../src/audio');
let transcripcion = 'cuanto sale este?';
audio.transcribir = async () => ({ ok: true, texto: transcripcion });

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const contexto = require('../src/contexto');
const tdm = require('../src/texto-del-mensaje');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const nuevoChat = () => '54900000' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const textosA = (chat) => aClientes.filter((m) => m.numero === chat).map((m) => m.texto);
const ultimaDelCliente = (chat) => [...state.obtener(chat).historial].reverse().find((l) => l.quien === 'cliente');

// Las formas del payload de Evolution: la cita en el `contextInfo` del tipo de mensaje (extendedTextMessage,
// imageMessage…) o arriba, en `data.contextInfo` (Evolution v2 la copia ahí).
const PRODUCTO = { productMessage: { product: { productId: '7203', title: 'iPhone 13 100%', description: '128GB, batería al 100%', retailerId: '13-128' }, businessOwnerJid: '5490000000001@s.whatsapp.net' } };
const conPrecio = (precio, moneda = 'ARS') => ({ productMessage: { product: { ...PRODUCTO.productMessage.product, currencyCode: moneda, priceAmount1000: precio } } });
const citaEn = (quotedMessage) => ({ stanzaId: 'CITADO' + Math.random(), participant: '5490000000001@s.whatsapp.net', quotedMessage });
/** La cita en `message.extendedTextMessage.contextInfo` (la forma de Baileys). */
const respondeAdentro = (chat, texto, citado) => ({
  key: { remoteJid: chat, fromMe: false, id: 'T' + Math.random() },
  pushName: 'Lucia',
  message: { extendedTextMessage: { text: texto, contextInfo: citaEn(citado) } },
});
/** La cita en `data.contextInfo`, con el texto como `conversation`. */
const respondeArriba = (chat, texto, citado) => ({
  key: { remoteJid: chat, fromMe: false, id: 'T' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
  contextInfo: citaEn(citado),
});
const escrito = (chat, t) => ({ key: { remoteJid: chat, fromMe: false, id: 'T' + Math.random() }, pushName: 'Lucia', message: { conversation: t } });
const mio = (chat, t) => ({ key: { remoteJid: chat, fromMe: true, id: 'H' + Math.random() }, pushName: 'Tomi', message: { conversation: t } });

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  }
}

(async () => {
  console.log('\n1. Lo citado (texto-del-mensaje.js)\n');

  await check('el producto del catálogo: su título; con el precio si viene (en pesos, con puntos); sin título, la descripción', async () => {
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'Hola a qe precio están', PRODUCTO)), 'iPhone 13 100%');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y este?', conPrecio(535000000))), 'iPhone 13 100% $535.000');
    // El int64 como lo puede traer el JSON: un texto, o { low, high } (un Long). $2.500.000 × 1000 no entra en 31 bits
    // (`low` viene negativo) y $5.000.000 × 1000 no entra en 32 (`high` es 1).
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y este?', conPrecio('535000000'))), 'iPhone 13 100% $535.000');
    const comoLong = (n) => ({ low: n | 0, high: Math.floor(n / 2 ** 32), unsigned: false });
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y este?', conPrecio(comoLong(2500000 * 1000)))), 'iPhone 13 100% $2.500.000');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y este?', conPrecio(comoLong(5000000 * 1000)))), 'iPhone 13 100% $5.000.000');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y este?', conPrecio(500000, 'USD'))), 'iPhone 13 100% USD 500');
    const sinTitulo = { productMessage: { product: { description: 'iPhone 14 Pro 128GB' } } };
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'precio?', sinTitulo)), 'iPhone 14 Pro 128GB');
  });

  await check('un texto, un epígrafe o un estado: el texto; una foto sin texto, "[foto]"; recortado a 120 y sin saltos de línea', async () => {
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { conversation: 'tenes el 13?' })), 'tenes el 13?');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { extendedTextMessage: { text: 'el 13 de contado\n\nte queda en $535.000' } })), 'el 13 de contado te queda en $535.000');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { imageMessage: { caption: 'Llegaron los 15 Pro!', mimetype: 'image/jpeg' } })), 'Llegaron los 15 Pro!');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { imageMessage: { mimetype: 'image/jpeg' } })), '[foto]');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { videoMessage: { mimetype: 'video/mp4' } })), '[video]');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { videoMessage: { caption: 'mirá el 16 Pro', mimetype: 'video/mp4' } })), 'mirá el 16 Pro');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { documentMessage: { caption: 'el compromiso', fileName: 'c.pdf' } })), 'el compromiso');
    // Los envoltorios: un efímero y un documento con epígrafe traen el mensaje adentro.
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { ephemeralMessage: { message: { extendedTextMessage: { text: 'tenes el 13?' } } } })), 'tenes el 13?');
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { documentWithCaptionMessage: { message: { documentMessage: { caption: 'la lista' } } } })), 'la lista');
    const largo = 'a'.repeat(100) + ' ' + 'b'.repeat(100);
    const citado = tdm.loCitado(respondeAdentro('x', 'y?', { conversation: largo }));
    assert.strictEqual(citado.length, 120);
    assert.strictEqual(citado, largo.slice(0, 120));
    // Un emoji no se corta por la mitad.
    const conEmoji = tdm.loCitado(respondeAdentro('x', 'y?', { conversation: 'x'.repeat(119) + '📱📱' }));
    assert.strictEqual(conEmoji, 'x'.repeat(119) + '📱');
    // Un corchete de lo citado no se confunde con el cierre de la cita.
    assert.strictEqual(tdm.loCitado(respondeAdentro('x', 'y?', { conversation: 'la [lista] de hoy' })), 'la (lista) de hoy');
  });

  await check('las dos ubicaciones de contextInfo; sin cita, con una cita vacía o que no se puede leer, null', async () => {
    assert.strictEqual(tdm.loCitado(respondeArriba('x', 'Hola a qe precio están', PRODUCTO)), 'iPhone 13 100%');
    // Una foto con epígrafe que responde: el contextInfo del imageMessage.
    const foto = { key: { id: 'F' }, message: { imageMessage: { caption: 'esta la tienen?', contextInfo: citaEn({ conversation: 'tenemos del 11 al 18' }) } } };
    assert.strictEqual(tdm.loCitado(foto), 'tenemos del 11 al 18');
    assert.strictEqual(tdm.loCitado(escrito('x', 'hola')), null);
    assert.strictEqual(tdm.loCitado({ message: { extendedTextMessage: { text: 'hola', contextInfo: {} } } }), null);
    assert.strictEqual(tdm.loCitado({ message: { extendedTextMessage: { text: 'hola', contextInfo: citaEn({}) } } }), null);
    assert.strictEqual(tdm.loCitado({ message: { extendedTextMessage: { text: 'hola', contextInfo: citaEn({ conversation: '   ' }) } } }), null);
    assert.strictEqual(tdm.loCitado({ message: { extendedTextMessage: { text: 'hola', contextInfo: citaEn({ reactionMessage: { text: '👍' } }) } } }), null);
    assert.strictEqual(tdm.loCitado({ message: { extendedTextMessage: { text: 'hola', contextInfo: citaEn('raro') } } }), null);
    // El anuncio (externalAdReply) no es una cita.
    assert.strictEqual(tdm.loCitado({ message: { extendedTextMessage: { text: 'hola, vi el anuncio', contextInfo: { externalAdReply: { title: 'iPhone 13', sourceType: 'ad', sourceId: '1' } } } } }), null);
    assert.strictEqual(tdm.loCitado(null), null);
    assert.strictEqual(tdm.loCitado({}), null);
  });

  await check('conCita y sinCita: "[responde a: …] texto" y de vuelta el texto', async () => {
    const m = respondeAdentro('x', 'Hola a qe precio están', PRODUCTO);
    assert.strictEqual(tdm.conCita('Hola a qe precio están', m), '[responde a: iPhone 13 100%] Hola a qe precio están');
    assert.strictEqual(tdm.conCita('hola', escrito('x', 'hola')), 'hola');
    assert.strictEqual(tdm.sinCita('[responde a: iPhone 13 100%] Hola a qe precio están'), 'Hola a qe precio están');
    assert.strictEqual(tdm.sinCita('[responde a: [foto]] y este?'), 'y este?');
    assert.strictEqual(tdm.sinCita('[responde a: el 13 (a) $535.000] dale'), 'dale');
    assert.strictEqual(tdm.sinCita('hola'), 'hola');
    assert.strictEqual(tdm.sinCita('[foto]'), '[foto]');
    assert.strictEqual(tdm.sinCita(''), '');
    assert.strictEqual(tdm.sinCita(null), '');
  });

  console.log('\n2. El webhook: la línea a Sonnet\n');

  await check('…3557: responde a un producto del catálogo → la línea del historial y lo que escribió ahora empiezan con [responde a: iPhone 13 100%] (las dos ubicaciones)', async () => {
    for (const armar of [respondeAdentro, respondeArriba]) {
      const chat = nuevoChat();
      guion(responde(['dale, el 13 de 128gb al 100%']));
      await bot.procesar(armar(chat, 'Hola a qe precio están', PRODUCTO));
      assert.strictEqual(pedidos.length, 1, `${armar.name}: no le preguntó a Sonnet`);
      assert.strictEqual(ultimaDelCliente(chat).texto, '[responde a: iPhone 13 100%] Hola a qe precio están', armar.name);
      assert.strictEqual(loQueEscribio(0), '[responde a: iPhone 13 100%] Hola a qe precio están', armar.name);
      assert.ok(/\] Cliente: \[responde a: iPhone 13 100%\] Hola a qe precio están$/m.test(textoDelPedido(0)), `${armar.name}: el historial del pedido no lleva la cita`);
      // El "último mensaje" del panel (cortado a 80 caracteres) es lo que escribió él, sin la cita.
      assert.strictEqual(state.obtener(chat).ultimoMensajeCliente, 'Hola a qe precio están');
    }
  });

  await check('dos mensajes en una tanda, el segundo con cita: Sonnet ve las dos líneas (la segunda con su cita); el "último mensaje" del panel, sin la cita', async () => {
    const chat = nuevoChat();
    guion(responde(['dale, el 13 de 128gb al 100%']));
    await Promise.all([bot.procesar(escrito(chat, 'hola')), bot.procesar(respondeAdentro(chat, 'a qe precio están', PRODUCTO))]);
    assert.strictEqual(pedidos.length, 1, 'no fue una sola tanda');
    assert.strictEqual(loQueEscribio(0), 'hola\n[responde a: iPhone 13 100%] a qe precio están');
    assert.strictEqual(state.obtener(chat).ultimoMensajeCliente, 'hola\na qe precio están');
  });

  await check('una foto citada sin texto → [responde a: [foto]]; un texto largo, recortado a 120; con el precio del producto', async () => {
    let chat = nuevoChat();
    guion(responde(['contame']));
    await bot.procesar(respondeAdentro(chat, 'y este?', { imageMessage: { mimetype: 'image/jpeg' } }));
    assert.strictEqual(loQueEscribio(0), '[responde a: [foto]] y este?');
    chat = nuevoChat();
    guion(responde(['contame']));
    const largo = 'te paso lo que tenemos ' + 'x'.repeat(200);
    await bot.procesar(respondeArriba(chat, 'y eso?', { extendedTextMessage: { text: largo } }));
    assert.strictEqual(ultimaDelCliente(chat).texto, `[responde a: ${largo.slice(0, 120)}] y eso?`);
    chat = nuevoChat();
    guion(responde(['contame']));
    await bot.procesar(respondeAdentro(chat, 'a cuanto?', conPrecio(535000000)));
    assert.strictEqual(loQueEscribio(0), '[responde a: iPhone 13 100% $535.000] a cuanto?');
  });

  await check('sin cita, igual que hoy: la línea es el texto tal cual', async () => {
    const chat = nuevoChat();
    guion(responde(['contame']));
    await bot.procesar(escrito(chat, 'Hola a qe precio están'));
    assert.strictEqual(ultimaDelCliente(chat).texto, 'Hola a qe precio están');
    assert.strictEqual(loQueEscribio(0), 'Hola a qe precio están');
    assert.ok(!textoDelPedido(0).includes('responde a'));
  });

  await check('un audio que cita: la transcripción con su cita', async () => {
    const chat = nuevoChat();
    transcripcion = 'cuanto sale este?';
    guion(responde(['contame']));
    await bot.procesar({ key: { remoteJid: chat, fromMe: false, id: 'A' + Math.random() }, pushName: 'Lucia', message: { audioMessage: { ptt: true, seconds: 3, contextInfo: citaEn(PRODUCTO) } } });
    assert.strictEqual(ultimaDelCliente(chat).texto, '[responde a: iPhone 13 100%] cuanto sale este?');
    assert.strictEqual(loQueEscribio(0), '[responde a: iPhone 13 100%] cuanto sale este?');
    assert.strictEqual(state.obtener(chat).ultimoMensajeCliente, 'cuanto sale este?');
    // Sin cita, la transcripción sola.
    const otro = nuevoChat();
    guion(responde(['contame']));
    await bot.procesar({ key: { remoteJid: otro, fromMe: false, id: 'A' + Math.random() }, pushName: 'Lucia', message: { audioMessage: { ptt: true, seconds: 3 } } });
    assert.strictEqual(ultimaDelCliente(otro).texto, 'cuanto sale este?');
  });

  await check('un #reset del tester que cita un mensaje sigue siendo el comando (no entra al historial)', async () => {
    const tester = `${TESTER}@s.whatsapp.net`;
    guion(responde(['contame']));
    await bot.procesar(escrito(tester, 'tenes el 13?'));
    assert.ok(state.todos()[tester], 'el chat del tester no se creó');
    guion();
    await bot.procesar(respondeAdentro(tester, '#reset', { conversation: 'contame' }));
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet por el #reset');
    const h = (state.todos()[tester] || {}).historial || [];
    assert.ok(!h.some((l) => /#reset|responde a/.test(l.texto)), JSON.stringify(h));
  });

  console.log('\n3. Lo que no cambia con una cita\n');

  await check('el bot de siempre recibe el mensaje sin la cita (lo citado no se lee como un monto); en el historial queda con la cita', async () => {
    config.cerebro.modo = 'apagado';
    try {
      const chat = nuevoChat();
      alBot.length = 0;
      await bot.procesar(respondeAdentro(chat, 'y con 300?', { conversation: 'el 13 de contado te queda en $535.000' }));
      assert.deepStrictEqual(alBot, ['y con 300?']);
      assert.strictEqual(ultimaDelCliente(chat).texto, '[responde a: el 13 de contado te queda en $535.000] y con 300?');
    } finally {
      config.cerebro.modo = 'todos';
    }
  });

  await check('un acuse que cita ("dale" a la lista) sigue siendo un acuse: no se le pregunta a Sonnet, como sin la cita', async () => {
    for (const armar of [(chat) => escrito(chat, 'dale'), (chat) => respondeAdentro(chat, 'dale', { conversation: 'Ip 13 128gb 100% 535.000' })]) {
      const chat = nuevoChat();
      state.obtener(chat);
      state.agregarAlHistorial(chat, 'cliente', 'pasame la lista');
      state.agregarAlHistorial(chat, 'vendedor', 'Ip 13 128gb 100% 535.000\nIp 14 128gb 100% 595.000');
      state.actualizar(chat, { ultimoBot: Date.now() });
      guion(responde(['NO TENDRÍA QUE PREGUNTARLE']));
      await bot.procesar(armar(chat));
      await dormir(20);
      assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet: ' + ultimaDelCliente(chat).texto);
      assert.deepStrictEqual(textosA(chat), []);
    }
  });

  await check('el saludo del día no toma el "como estas?" de lo citado: si cita nuestro saludo de ayer, el saludo no "devuelve" la pregunta', async () => {
    const DEVUELVE = /bien por suerte|todo bien por aca|todo tranqui por aca/i;
    const chat = nuevoChat();
    guion(responde(['sii, tenemos el 13']));
    await bot.procesar(respondeAdentro(chat, 'tenes el 13?', { conversation: 'buenass Lucia, como estas?' }));
    const textos = textosA(chat);
    assert.ok(textos.length >= 2, JSON.stringify(textos));
    assert.ok(!DEVUELVE.test(textos[0]), 'el saludo devolvió la pregunta de lo citado: ' + textos[0]);
    // Si el cliente pregunta él cómo estamos, el saludo sí la devuelve (como siempre).
    const otro = nuevoChat();
    guion(responde(['sii, tenemos el 13']));
    await bot.procesar(respondeAdentro(otro, 'hola como estas? tenes el 13?', { conversation: 'tenemos del 11 al 18 Pro Max' }));
    assert.ok(DEVUELVE.test(textosA(otro)[0]), 'no devolvió la pregunta del cliente: ' + textosA(otro)[0]);
  });

  console.log('\n4. Las líneas de Evolution (contexto.js)\n');

  await check('lineasDe: la línea del cliente que citó lleva [responde a: …] (en las dos ubicaciones); las de la cuenta, no', async () => {
    const chat = '5490000000123@s.whatsapp.net';
    const ts = 1759950000;
    const registros = [
      { key: { remoteJid: chat, fromMe: false, id: 'E1' }, messageTimestamp: ts, message: { extendedTextMessage: { text: 'Hola a qe precio están', contextInfo: citaEn(PRODUCTO) } } },
      { key: { remoteJid: chat, fromMe: false, id: 'E2' }, messageTimestamp: ts + 60, message: { conversation: 'y este?' }, contextInfo: citaEn({ imageMessage: { mimetype: 'image/jpeg' } }) },
      { key: { remoteJid: chat, fromMe: true, id: 'E3' }, messageTimestamp: ts + 120, message: { extendedTextMessage: { text: 'este es el de 128', contextInfo: citaEn({ conversation: 'y este?' }) } } },
      { key: { remoteJid: chat, fromMe: false, id: 'E4' }, messageTimestamp: ts + 180, message: { conversation: 'dale' } },
    ];
    assert.deepStrictEqual(
      contexto.lineasDe(registros).map((l) => [l.quien, l.texto]),
      [
        ['cliente', '[responde a: iPhone 13 100%] Hola a qe precio están'],
        ['cliente', '[responde a: [foto]] y este?'],
        ['vendedor', 'este es el de 128'],
        ['cliente', 'dale'],
      ]
    );
  });

  console.log('\n5. Las reglas\n');

  await check('las reglas: qué es [responde a: …], que un equipo citado con "a qué precio" es una consulta de ese modelo (no la lista), y el ejemplo de …3557', async () => {
    const reglas = cerebro.REGLAS;
    const quien = reglas.slice(0, reglas.indexOf('# Cómo terminás cada respuesta'));
    assert.ok(/`\[responde a: …\]`/.test(quien), 'Quién sos no dice qué es [responde a: …]');
    assert.ok(/es lo que citó/.test(quien));
    assert.ok(/cita un equipo \("iPhone 13 100%"\) y pregunta el precio, es una consulta de ese modelo: `buscar_equipos`[^\n]*la batería[^\n]*no la lista/.test(quien), 'falta la consulta del equipo citado');
    assert.ok(/\n21\. [^\n]*`\[responde a: iPhone 13 100%\] Hola a qe precio están`[^\n]*`buscar_equipos`[^\n]*128gb al 100%[^\n]*sin `\[lista\]`/.test(reglas), 'falta el ejemplo 21');
  });

  console.log(fallos ? `\n${fallos} prueba(s) fallaron` : '\nTodo ok');
  process.exit(fallos ? 1 : 0);
})();
