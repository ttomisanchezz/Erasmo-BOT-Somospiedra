'use strict';
/**
 * Chats sin número (@lid, 28/09/2026).
 *
 *   node test/lid.test.js
 *
 * Evolution guarda en su base el identificador interno de WhatsApp (`…@lid`) y, justo
 * antes del webhook, lo cambia por el número si el mensaje trae `remoteJidAlt`. Si no lo
 * trae, al bot le llega el `@lid`: con esa clave no sabe si es un cliente viejo, un amigo
 * o un proveedor, y ni CONTACTOS_PERSONALES ni SOLO_CHATS_NUEVOS lo reconocen.
 * Decisión de Tomás del 28/09: no se procesa (no se contesta, no se guarda, no va a
 * Gemini) y se avisa al grupo una vez por chat cada 24 h, con el nombre y la hora, sin el
 * texto. Un mensaje propio en ese chat no hace nada.
 *
 * El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '10';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.SOLO_CHATS_NUEVOS = '';
process.env.AUDIO_ACTIVO = 'true';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = '120363000000000000@g.us';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-lid-' + Date.now() + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-lid-' + Date.now() + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

let llamadasAGemini = 0;
let pedidosDeAudio = 0;
const local = require('../src/extractor-local');
gemini.entender = async (h, m) => {
  llamadasAGemini++;
  return local.entender(m);
};
gemini.transcribir = async () => 'hola tenes el iphone 13';
evolution.base64DeMedia = async () => {
  pedidosDeAudio++;
  return { base64: 'AAAA', mimetype: 'audio/ogg' };
};

const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
evolution.enviarTexto = async (numero, texto) => {
  aClientes.push({ numero, texto });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.mostrarEscribiendo = async () => ({});
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const aprendizaje = require('../src/aprendizaje');

// Números inventados. Los @lid tienen la forma de los reales (14 o 15 dígitos).
const LID = '10000000000001@lid';
const LID_2 = '10000000000002@lid';
const LID_3 = '10000000000003@lid';
const LID_4 = '10000000000004@lid';
const LID_5 = '10000000000005@lid';
const LID_6 = '10000000000006@lid';
const LID_7 = '10000000000007@lid';
const CLIENTE = '5490000000000@s.whatsapp.net';

let fallos = 0;
function check(nombre, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('  ok   ' + nombre))
    .catch((e) => {
      fallos++;
      console.log('  FALLA ' + nombre + ' -> ' + e.message);
    });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const escrito = (chatId, texto, extra = {}) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random(), ...(extra.key || {}) },
  pushName: 'pushName' in extra ? extra.pushName : 'Marta',
  message: { conversation: texto },
  ...(extra.messageTimestamp ? { messageTimestamp: extra.messageTimestamp } : {}),
});
const notaDeVoz = (chatId) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'A' + Math.random() },
  pushName: 'Marta',
  message: { audioMessage: { mimetype: 'audio/ogg', seconds: 5, ptt: true } },
});

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  llamadasAGemini = 0;
  pedidosDeAudio = 0;
}

const HORA_AR = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

(async () => {
  console.log('\nUn chat que llega como @lid no se procesa\n');

  await check('no se le contesta ni va a Gemini', async () => {
    limpiar();
    await bot.procesar(escrito(LID, 'hola tenes el iphone 13? tengo 500 mil'));
    await dormir(200);
    assert.strictEqual(aClientes.length, 0, 'le contestó a un chat sin número');
    assert.strictEqual(llamadasAGemini, 0, 'gastó una llamada a Gemini');
  });

  await check('no se guarda en estado.json', () => {
    assert.ok(!state.todos()[LID], 'quedó guardado en el estado con la clave @lid');
    assert.strictEqual(Object.keys(state.todos()).filter((k) => k.endsWith('@lid')).length, 0);
  });

  await check('avisa al grupo una vez, con el nombre y la hora, sin el texto', async () => {
    limpiar();
    const ts = Math.floor(Date.now() / 1000) - 60;
    await bot.procesar(escrito(LID_2, 'hola tenes el iphone 13? tengo 500 mil', { messageTimestamp: ts }));
    await dormir(100);
    assert.strictEqual(alGrupo.length, 1, `avisos: ${alGrupo.length}`);
    const aviso = alGrupo[0];
    assert.ok(aviso.includes('Marta'), 'el aviso no dice el nombre: ' + aviso);
    assert.ok(aviso.includes(HORA_AR.format(ts * 1000)), 'el aviso no dice la hora del mensaje: ' + aviso);
    assert.ok(!/iphone|500/i.test(aviso), 'el aviso muestra el texto del mensaje: ' + aviso);
    assert.ok(!aviso.includes('10000000000002'), 'el aviso muestra el identificador interno: ' + aviso);
  });

  await check('otro mensaje del mismo chat antes de 24 h no vuelve a avisar', async () => {
    limpiar();
    await bot.procesar(escrito(LID_2, 'hola?'));
    await bot.procesar(escrito(LID_2, 'estas?'));
    await dormir(100);
    assert.strictEqual(alGrupo.length, 0, 'volvió a avisar');
    assert.strictEqual(aClientes.length, 0);
  });

  await check('pasadas 24 h avisa de nuevo', async () => {
    limpiar();
    const ahora = Date.now;
    Date.now = () => ahora() + 24 * 60 * 60 * 1000 + 60 * 1000;
    try {
      await bot.procesar(escrito(LID_2, 'sigue disponible?'));
      await dormir(100);
    } finally {
      Date.now = ahora;
    }
    assert.strictEqual(alGrupo.length, 1, `avisos: ${alGrupo.length}`);
    assert.strictEqual(aClientes.length, 0);
  });

  await check('otro chat @lid tiene su propio aviso', async () => {
    limpiar();
    await bot.procesar(escrito(LID_3, 'hola'));
    await dormir(100);
    assert.strictEqual(alGrupo.length, 1, `avisos: ${alGrupo.length}`);
  });

  await check('sin nombre, el aviso lo dice', async () => {
    limpiar();
    await bot.procesar(escrito(LID_4, 'hola', { pushName: '' }));
    await dormir(100);
    assert.strictEqual(alGrupo.length, 1, `avisos: ${alGrupo.length}`);
    assert.ok(/sin nombre/i.test(alGrupo[0]), 'el aviso no dice que no tiene nombre: ' + alGrupo[0]);
  });

  await check('un nombre que son los dígitos del @lid cuenta como sin nombre', async () => {
    limpiar();
    await bot.procesar(escrito(LID_7, 'hola', { pushName: '10000000000007' }));
    await dormir(100);
    assert.strictEqual(alGrupo.length, 1, `avisos: ${alGrupo.length}`);
    assert.ok(/sin nombre/i.test(alGrupo[0]), 'el aviso no dice que no tiene nombre: ' + alGrupo[0]);
    assert.ok(!alGrupo[0].includes('10000000000007'), 'el aviso muestra el identificador interno');
  });

  await check('un audio no se transcribe', async () => {
    limpiar();
    await bot.procesar(notaDeVoz(LID_5));
    await dormir(200);
    assert.strictEqual(pedidosDeAudio, 0, 'bajó el audio de un chat sin número');
    assert.strictEqual(aClientes.length, 0);
    assert.ok(!state.todos()[LID_5], 'quedó guardado en el estado');
  });

  await check('un mensaje propio en un chat @lid no hace nada', async () => {
    limpiar();
    await bot.procesar(escrito(LID_6, 'le contesto yo', { key: { fromMe: true } }));
    await dormir(100);
    assert.strictEqual(alGrupo.length, 0, 'avisó por un mensaje propio');
    assert.ok(!state.todos()[LID_6], 'guardó estado por un mensaje propio');
    assert.strictEqual(aprendizaje.leerTodo().filter((r) => r.texto === 'le contesto yo').length, 0);
  });

  await check('un mensaje viejo (del historial) no avisa', async () => {
    limpiar();
    const viejo = Math.floor(Date.now() / 1000) - 3 * 24 * 60 * 60;
    await bot.procesar(escrito(LID_6, 'mensaje de hace dias', { messageTimestamp: viejo }));
    await dormir(100);
    assert.strictEqual(alGrupo.length, 0, 'avisó por un mensaje del historial');
    assert.strictEqual(aClientes.length, 0);
  });

  await check('con NUMEROS_PILOTO=todos y SOLO_CHATS_NUEVOS tampoco se le contesta', async () => {
    const antes = { pilotoTodos: config.pilotoTodos, soloChatsNuevos: config.soloChatsNuevos };
    config.pilotoTodos = true;
    config.soloChatsNuevos = true;
    try {
      limpiar();
      await bot.procesar(escrito(LID, 'tenes el 14 pro?'));
      await dormir(200);
      assert.strictEqual(aClientes.length, 0, 'le contestó en vivo a un chat sin número');
      assert.strictEqual(llamadasAGemini, 0);
      assert.ok(!state.todos()[LID]);
    } finally {
      Object.assign(config, antes);
    }
  });

  console.log('\nCon el número sigue como siempre\n');

  await check('un cliente con número recibe respuesta', async () => {
    limpiar();
    await bot.procesar(escrito(CLIENTE, 'hola tenes el iphone 13?'));
    await dormir(250);
    assert.ok(aClientes.length > 0, 'dejó de contestarle a un cliente con número');
    assert.ok(llamadasAGemini > 0, 'no analizó el mensaje de un cliente');
    assert.ok(state.todos()[CLIENTE], 'no guardó el chat de un cliente');
    assert.ok(!alGrupo.some((t) => /sin (el )?n[uú]mero/i.test(t)), 'avisó "sin número" por un chat con número');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
