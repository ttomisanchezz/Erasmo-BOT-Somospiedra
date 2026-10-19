'use strict';
/**
 * Mensajes repetidos por id (bloque 4 de la auditoría del 15/09/2026, hallazgo A6).
 *
 *   node test/dedupe.test.js
 *
 * Si Evolution entrega dos veces el mismo `messages.upsert`, se procesaba dos
 * veces: dos entradas en el historial y dos respuestas. Ahora cada mensaje se
 * reconoce por `remoteJid` + `key.id`, se marca como visto al recibirlo (antes de
 * procesar) y queda en disco, bajo `bot:interno`, para sobrevivir a un reinicio.
 *
 * Se prueba:
 *   - el mismo evento dos veces: una entrada en el historial y una respuesta;
 *   - un duplicado no mueve `ultimoMensaje` de /salud, y /salud cuenta los descartados;
 *   - el mismo id en dos chats distintos no es duplicado;
 *   - un duplicado después de "reiniciar" con el mismo archivo también se descarta;
 *   - la poda por tiempo y el tope de cantidad;
 *   - un lote con un repetido y uno nuevo procesa solo el nuevo;
 *   - sin key.id se procesa como siempre;
 *   - un eco duplicado de una persona de la cuenta tampoco duplica el historial;
 *   - #reset no borra los vistos.
 *
 * El webhook se levanta en un puerto efímero y se le pega por HTTP, como hace
 * Evolution. Sin red, extractor local, números inventados. El entorno se fija acá
 * y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const GRUPO = '120363000000000042@g.us';

process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '10';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = '';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.RESUMEN_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.WEBHOOK_MAX_POR_MINUTO = '600';
process.env.HOST = '';
process.env.ESTADO_SOLO_LECTURA = '';
process.env.EVOLUTION_INSTANCE = 'somospiedra';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-dedupe-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'todos';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-dedupe-' + process.pid + '.jsonl');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const evolution = require('../src/evolution');
let idEnvio = 0;
const enviados = [];
const respuesta = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, texto) => {
  enviados.push({ numero, texto });
  return respuesta(numero);
};
evolution.enviarImagen = async (numero) => respuesta(numero);
evolution.enviarDocumento = async (numero) => respuesta(numero);
evolution.avisarGrupo = async () => ({ key: { id: 'G' } });
evolution.estadoInstancia = async () => ({ state: 'open' });

// Sin bot de siempre (poda de iPhone): contesta un Sonnet de mentira (test/sonnet-fijo.js).
const sonnetFijo = require('./sonnet-fijo').instalar();
const bot = require('../src/index');
const state = require('../src/state');

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
const nuevoChat = () => '54900000' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const evento = (chatId, texto, id, { fromMe = false } = {}) => ({
  event: 'messages.upsert',
  instance: 'somospiedra',
  data: {
    key: { remoteJid: chatId, fromMe, id },
    pushName: 'Lucia',
    messageTimestamp: Math.floor(Date.now() / 1000),
    message: { conversation: texto },
  },
});
const historialDe = (chat) => (state.todos()[chat] || {}).historial || [];
const enviadosA = (chat) => enviados.filter((m) => m.numero === chat);

let servidor;
let puerto;
function pedir(metodo, ruta, cuerpo) {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { 'Content-Type': 'application/json' } },
      (res) => {
        let data = '';
        res.on('data', (c) => (data += c));
        res.on('end', () => resolve({ status: res.statusCode, cuerpo: data }));
      }
    );
    req.on('error', reject);
    if (cuerpo !== undefined) req.write(JSON.stringify(cuerpo));
    req.end();
  });
}
const salud = async () => JSON.parse((await pedir('GET', '/salud')).cuerpo);
/** Manda el evento y espera a que la tanda se procese y conteste. */
async function webhook(cuerpo, espera = 120) {
  const r = await pedir('POST', '/webhook', cuerpo);
  assert.strictEqual(r.status, 200, 'el webhook no aceptó el evento: ' + r.status);
  await dormir(espera);
}

(async () => {
  servidor = await new Promise((resolve) => {
    const s = bot.app.listen(0, '127.0.0.1', () => resolve(s));
  });
  puerto = servidor.address().port;

  console.log('\nMensajes repetidos por id\n');

  await check('el mismo evento dos veces: una sola entrada en el historial y una sola respuesta', async () => {
    const chat = nuevoChat();
    enviados.length = 0;
    await webhook(evento(chat, 'tenes el 13?', 'ABC123'));
    const unaVez = enviadosA(chat).length;
    assert.ok(unaVez > 0, 'el caso no prueba nada: no contestó la primera vez');
    await webhook(evento(chat, 'tenes el 13?', 'ABC123'));
    assert.strictEqual(historialDe(chat).filter((l) => l.quien === 'cliente').length, 1, 'el historial tiene el mensaje dos veces');
    assert.strictEqual(enviadosA(chat).length, unaVez, 'contestó dos veces');
  });

  await check('un duplicado no mueve ultimoMensaje de /salud, y /salud cuenta los descartados', async () => {
    const chat = nuevoChat();
    await webhook(evento(chat, 'hola', 'DUP-1'));
    const antes = await salud();
    await dormir(20);
    await webhook(evento(chat, 'hola', 'DUP-1'));
    const despues = await salud();
    assert.strictEqual(despues.ultimoMensaje, antes.ultimoMensaje, 'el duplicado movió ultimoMensaje');
    assert.ok(Number(despues.duplicadosDescartados) >= Number(antes.duplicadosDescartados || 0) + 1, 'no contó el duplicado: ' + JSON.stringify(despues));
  });

  await check('el mismo id en dos chats distintos no es duplicado', async () => {
    const a = nuevoChat();
    const b = nuevoChat();
    await webhook(evento(a, 'hola', 'MISMO-ID'));
    await webhook(evento(b, 'hola', 'MISMO-ID'));
    assert.strictEqual(historialDe(a).length > 0, true, 'no procesó el primero');
    assert.ok(historialDe(b).some((l) => l.quien === 'cliente'), 'descartó el mismo id en otro chat');
  });

  await check('un lote con un mensaje repetido y uno nuevo procesa solo el nuevo', async () => {
    const chat = nuevoChat();
    await webhook(evento(chat, 'tenes el 13?', 'LOTE-1'));
    const antes = historialDe(chat).filter((l) => l.quien === 'cliente').length;
    const lote = { event: 'messages.upsert', instance: 'somospiedra', data: [evento(chat, 'tenes el 13?', 'LOTE-1').data, evento(chat, 'y el 15?', 'LOTE-2').data] };
    await webhook(lote, 200);
    const cliente = historialDe(chat).filter((l) => l.quien === 'cliente');
    assert.strictEqual(cliente.length, antes + 1, 'procesó el repetido del lote: ' + cliente.map((l) => l.texto).join(' | '));
    assert.strictEqual(cliente[cliente.length - 1].texto, 'y el 15?');
  });

  await check('sin key.id se procesa como siempre, sin dedupe', async () => {
    const chat = nuevoChat();
    const e = evento(chat, 'hola', undefined);
    delete e.data.key.id;
    await webhook(e);
    await webhook(e);
    assert.strictEqual(historialDe(chat).filter((l) => l.quien === 'cliente').length, 2, 'dedupeó sin id');
  });

  await check('un eco duplicado de una persona de la cuenta no duplica el historial', async () => {
    const chat = nuevoChat();
    await webhook(evento(chat, 'tenes el 13?', 'C-1'));
    await webhook(evento(chat, 'si, lo tenemos', 'H-1', { fromMe: true }));
    await webhook(evento(chat, 'si, lo tenemos', 'H-1', { fromMe: true }));
    assert.strictEqual(historialDe(chat).filter((l) => l.quien === 'vendedor' && l.texto === 'si, lo tenemos').length, 1, 'el mensaje de la persona entró dos veces');
  });

  await check('#reset no borra los vistos: el mismo evento después del reset se sigue descartando', async () => {
    const chat = nuevoChat();
    await webhook(evento(chat, 'tenes el 13?', 'R-1'));
    await webhook(evento(chat, '#reset', 'R-CMD', { fromMe: true }));
    assert.ok(!state.todos()[chat], 'el caso no prueba nada: el reset no borró el chat');
    await webhook(evento(chat, 'tenes el 13?', 'R-1'));
    assert.ok(!state.todos()[chat] || !historialDe(chat).length, 'reprocesó un mensaje ya visto después del reset');
  });

  await check('los vistos quedan en disco: otro proceso con el mismo archivo también lo descarta', async () => {
    const chat = nuevoChat();
    await webhook(evento(chat, 'hola', 'DISCO-1'));
    state.guardarAhora();
    const salida = execFileSync(
      process.execPath,
      ['-e', `const s = require(${JSON.stringify(path.join(RAIZ, 'src', 'state.js'))}); process.stdout.write(String(s.marcarVisto(${JSON.stringify(chat + '|DISCO-1')})));`],
      { cwd: __dirname, env: { ...process.env, ESTADO_SOLO_LECTURA: '1' }, encoding: 'utf8' }
    );
    assert.strictEqual(salida, 'false', 'el otro proceso lo tomó como nuevo');
  });

  console.log('\nPoda\n');

  await check('las entradas de más de 30 minutos se podan', () => {
    const t0 = Date.now();
    assert.strictEqual(state.marcarVisto('poda|a', t0), true);
    assert.strictEqual(state.marcarVisto('poda|a', t0 + 1000), false, 'no reconoció uno recién visto');
    state.marcarVisto('poda|b', t0 + state.VISTOS_MS + 1000);
    assert.strictEqual(state.marcarVisto('poda|a', t0 + state.VISTOS_MS + 2000), true, 'no podó la entrada vieja');
  });

  await check('hay un tope de cantidad: se van las más viejas', () => {
    const t0 = Date.now() + 10 * 60 * 1000;
    state.marcarVisto('tope|primero', t0);
    for (let i = 0; i < state.VISTOS_MAX; i++) state.marcarVisto('tope|' + i, t0 + 1 + i);
    assert.strictEqual(state.marcarVisto('tope|primero', t0 + state.VISTOS_MAX + 5), true, 'no aplicó el tope');
    assert.strictEqual(state.marcarVisto('tope|' + (state.VISTOS_MAX - 1), t0 + state.VISTOS_MAX + 6), false, 'se llevó una reciente');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  servidor.close();
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos ? 1 : 0);
})();
