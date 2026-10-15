'use strict';
/**
 * El PDF del compromiso de pago no sale (arreglos en vivo, 30/09/2026).
 *
 *   node test/pdf-fallido.test.js
 *
 * En la prueba en vivo del 30/09 Evolution contestó 500 en /message/sendMedia ("Media
 * upload failed on all hosts": Baileys no pudo subir el archivo a los servidores de media
 * de WhatsApp) y al cliente le llegó solo el pie, como texto. Nadie se enteró. Ahora, además
 * del pie, sale un aviso al grupo interno para que una persona le mande el compromiso:
 *
 *   📄 NO SALIÓ EL PDF · <nombre> · wa.me/<número> · mandale el compromiso de pago vos
 *
 * Se prueba:
 *   - con Evolution devolviendo 500 en sendMedia, sale el pie como texto;
 *   - sale el aviso al grupo, una vez, con el nombre y el wa.me;
 *   - un segundo fallo en el mismo chat (después de un #reset, que no borra el aviso) no lo
 *     repite; pasadas 24 h, sí;
 *   - con otro chat, sí sale;
 *   - `compromisoEnviado` no se confirma (el PDF no salió);
 *   - en escucha no sale nada, ni el aviso.
 *
 * Evolution es un `fetch` de mentira que contesta como la API real: 200 con el id del
 * mensaje en sendText y sendPresence, y 500 con el cuerpo del error real en sendMedia. Así se
 * pasa por `evolution.enviarDocumento` de verdad (carpeta permitida, base64, mimetype). Sin
 * red, sin planilla, sin Gemini. El entorno se fija acá y no se hereda del .env. Todos los
 * números son inventados.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GRUPO = '120363000000000009@g.us';

// El compromiso de pago: un PDF de mentira en una carpeta temporal, para no depender de
// documentos/ del repo (un worktree no lo tiene).
const DOCS = fs.mkdtempSync(path.join(os.tmpdir(), 'docs-pdf-fallido-'));
fs.writeFileSync(path.join(DOCS, 'compromiso-de-pago.pdf'), '%PDF-1.4\n% de mentira\n%%EOF\n');
process.env.DOCS_DIR = DOCS;

process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '10';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.RESUMEN_ACTIVO = 'false';
process.env.GUARDIAN_ACTIVO = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.EVOLUTION_URL = 'http://evolution-de-mentira.invalid';
process.env.EVOLUTION_INSTANCE = 'prueba';
process.env.EVOLUTION_APIKEY = 'apikey-de-mentira';
process.env.SHEET_ID = 'planilla-de-prueba';
process.env.GOOGLE_CREDENTIALS_PATH = path.join(os.tmpdir(), 'credenciales-que-no-existen-' + process.pid + '.json');
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-pdf-fallido-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-pdf-fallido-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const config = require('../src/config');
const gemini = require('../src/gemini');
const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

// --- Evolution de mentira: lo que pide el bot, ruta por ruta ---
const RESPUESTA_500 =
  '{"status":500,"error":"Internal Server Error","response":{"message":["Error: Media upload failed on all hosts"]}}';
const pedidos = []; // { ruta, body }
let idEnvio = 0;
let fallaSendMedia = true;
globalThis.fetch = async (url, opciones = {}) => {
  const ruta = String(url).replace(config.evolution.url, '');
  const body = opciones.body ? JSON.parse(opciones.body) : {};
  pedidos.push({ ruta, body });
  const ok = (data) => ({ ok: true, status: 200, json: async () => data, text: async () => JSON.stringify(data) });
  if (ruta.startsWith('/message/sendMedia/')) {
    if (fallaSendMedia) return { ok: false, status: 500, json: async () => JSON.parse(RESPUESTA_500), text: async () => RESPUESTA_500 };
    return ok({ key: { remoteJid: body.number, fromMe: true, id: 'EV' + ++idEnvio } });
  }
  if (ruta.startsWith('/message/sendText/')) return ok({ key: { remoteJid: body.number, fromMe: true, id: 'EV' + ++idEnvio } });
  if (ruta.startsWith('/chat/sendPresence/')) return ok({});
  if (ruta.includes('/instance/connectionState/')) return ok({ instance: { state: 'open' } });
  throw new Error('salió a la red durante la prueba: ' + ruta);
};

const bot = require('../src/index');
const state = require('../src/state');

const textosA = (numero) => pedidos.filter((p) => p.ruta.startsWith('/message/sendText/') && p.body.number === numero).map((p) => p.body.text);
const mediaA = (numero) => pedidos.filter((p) => p.ruta.startsWith('/message/sendMedia/') && p.body.number === numero);
const avisosPdf = () => textosA(GRUPO).filter((t) => t.startsWith('📄 NO SALIÓ EL PDF'));
const limpiar = () => pedidos.splice(0, pedidos.length);

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const nuevoChat = () => '54900000000' + String(n++).padStart(2, '0') + '@s.whatsapp.net';
const numeroDe = (chat) => chat.split('@')[0];
const mensaje = (chatId, texto, { fromMe = false, pushName = 'Lucia' } = {}) => ({
  key: { remoteJid: chatId, fromMe, id: 'T' + Math.random() },
  pushName,
  message: { conversation: texto },
});
const mio = (chatId, texto) => mensaje(chatId, texto, { fromMe: true });

/** Pregunta por las cuotas: la explicación, el PDF con su pie y la pregunta de qué modelo. */
async function pideElPdf(chat, pushName = 'Lucia') {
  await bot.procesar(mensaje(chat, 'como son las cuotas?', { pushName }));
  await dormir(300);
}

(async () => {
  console.log('\nEl PDF del compromiso no sale\n');

  const chat = nuevoChat();
  await check('con Evolution en 500 en sendMedia, el PDF se intentó y al cliente le llegó el pie como texto', async () => {
    limpiar();
    await pideElPdf(chat);
    assert.strictEqual(mediaA(chat).length, 1, 'el caso no prueba nada: no intentó mandar el PDF');
    const media = mediaA(chat)[0].body;
    assert.strictEqual(media.mediatype, 'document');
    assert.strictEqual(media.mimetype, 'application/pdf');
    assert.strictEqual(media.fileName, 'compromiso-de-pago.pdf');
    const textos = textosA(chat);
    assert.ok(textos.some((t) => /dni/i.test(t) && /compromiso de pago/i.test(t)), 'no le llegó el pie como texto:\n' + textos.join('\n'));
    // El PDF no salió: no queda como mandado.
    assert.ok(!state.todos()[chat].compromisoEnviado, 'quedó compromisoEnviado con el PDF sin salir');
  });

  await check('sale el aviso al grupo, una vez, con el nombre y el wa.me, y sin el texto del cliente', async () => {
    const avisos = avisosPdf();
    assert.strictEqual(avisos.length, 1, `avisos: ${avisos.length}\n` + textosA(GRUPO).join('\n'));
    assert.strictEqual(avisos[0], `📄 NO SALIÓ EL PDF · Lucia · wa.me/${numeroDe(chat)} · mandale el compromiso de pago vos`);
  });

  await check('un segundo fallo en el mismo chat (tras un #reset) manda el pie otra vez y no repite el aviso', async () => {
    limpiar();
    await bot.procesar(mio(chat, '#reset'));
    await pideElPdf(chat);
    assert.strictEqual(mediaA(chat).length, 1, 'el caso no prueba nada: no volvió a intentar el PDF');
    assert.ok(textosA(chat).some((t) => /dni/i.test(t)), 'no le llegó el pie la segunda vez');
    assert.strictEqual(avisosPdf().length, 0, 'repitió el aviso:\n' + avisosPdf().join('\n'));
  });

  await check('pasadas 24 h, el mismo chat avisa de nuevo', async () => {
    limpiar();
    const ahora = Date.now;
    Date.now = () => ahora() + 24 * 60 * 60 * 1000 + 60 * 1000;
    try {
      await bot.procesar(mio(chat, '#reset'));
      await pideElPdf(chat);
    } finally {
      Date.now = ahora;
    }
    assert.strictEqual(mediaA(chat).length, 1, 'el caso no prueba nada: no volvió a intentar el PDF');
    assert.strictEqual(avisosPdf().length, 1, `avisos: ${avisosPdf().length}`);
  });

  await check('con otro chat, sí sale (con su nombre y su número)', async () => {
    limpiar();
    const otro = nuevoChat();
    await pideElPdf(otro, 'Marta');
    assert.strictEqual(mediaA(otro).length, 1, 'el caso no prueba nada: no intentó mandar el PDF');
    assert.deepStrictEqual(avisosPdf(), [`📄 NO SALIÓ EL PDF · Marta · wa.me/${numeroDe(otro)} · mandale el compromiso de pago vos`]);
  });

  await check('si el PDF sale, no hay aviso y queda compromisoEnviado', async () => {
    limpiar();
    fallaSendMedia = false;
    try {
      const sano = nuevoChat();
      await pideElPdf(sano);
      assert.strictEqual(mediaA(sano).length, 1, 'el caso no prueba nada: no mandó el PDF');
      assert.strictEqual(avisosPdf().length, 0, 'avisó con el PDF salido');
      assert.ok(state.todos()[sano].compromisoEnviado, 'no quedó compromisoEnviado');
    } finally {
      fallaSendMedia = true;
    }
  });

  await check('en escucha no sale nada: ni el PDF, ni el pie, ni el aviso', async () => {
    limpiar();
    const antes = config.modoEscucha;
    config.modoEscucha = true;
    try {
      const callado = nuevoChat();
      await pideElPdf(callado);
      assert.strictEqual(pedidos.length, 0, 'salió algo a Evolution en escucha:\n' + pedidos.map((p) => p.ruta).join('\n'));
    } finally {
      config.modoEscucha = antes;
    }
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* no se llegó a crear */
    }
  }
  fs.rmSync(DOCS, { recursive: true, force: true });
  process.exit(fallos === 0 ? 0 : 1);
})();
