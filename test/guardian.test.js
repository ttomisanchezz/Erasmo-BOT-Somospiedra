'use strict';
/**
 * Guardián de Evolution: avisar al grupo interno cuando dejan de llegar los mensajes.
 *
 *   node test/guardian.test.js
 *
 * Nació de tres cortes en tres días (17 al 19/09/2026): el bot seguía vivo y
 * escribiendo el estado, pero Evolution no le entregaba ningún mensaje, y nadie se
 * enteró en el momento. El guardián avisa; no reinicia nada.
 *
 * Se prueba:
 *   - evolution.estadoDeLaInstancia(): la consulta, lo que devuelve y que nunca tira;
 *   - control 1, la instancia: un aviso por corte, la recuperación con la duración, y
 *     Evolution que no responde;
 *   - control 2, el webhook: instancia en open y ningún mensaje, solo dentro de la
 *     franja del seguimiento, un aviso por corte y el rearme cuando llega algo;
 *   - las guardas de siempre (escucha, sin destino), los reintentos con tope y
 *     GUARDIAN_ACTIVO=false;
 *   - los cortes, para chats viejos (29/09/2026): cuándo abre y cierra cada uno y desde
 *     cuándo, sin cambiar ningún aviso;
 *   - index.js: /salud y el barrido con el `ultimoEntrante` del webhook: el reloj del
 *     guardián cuenta solo los mensajes que entran, no los propios (Pendientes 2).
 *
 * Reloj simulado (cada barrido recibe su `ahora`) y un fetch de mentira que hace de
 * Evolution: sin esperas reales, sin red y sin Docker. El entorno se fija acá y no se
 * hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const GRUPO = '120363000000000055@g.us';
const INSTANCIA = 'instancia-de-prueba';
const EVOLUTION = 'http://evolution.de-prueba.invalid';
const MIN = 60 * 1000;

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'guardian-'));

process.env.ESPERA_MIN_MS = '10';
process.env.ESPERA_MAX_MS = '20';
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
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '9';
process.env.SEGUIMIENTO_HORA_HASTA = '22';
process.env.RESUMEN_ACTIVO = 'false';
process.env.GUARDIAN_ACTIVO = 'true';
process.env.GUARDIAN_MIN = '5';
process.env.GUARDIAN_SIN_MENSAJES_MIN = '45';
process.env.EVOLUTION_URL = EVOLUTION;
process.env.EVOLUTION_INSTANCE = INSTANCIA;
process.env.EVOLUTION_APIKEY = 'clave-de-prueba';
process.env.WEBHOOK_SECRETO = '';
process.env.WEBHOOK_MAX_POR_MINUTO = '';
process.env.HOST = '';
process.env.GOOGLE_CREDENTIALS_PATH = path.join(TMP, 'credenciales-que-no-existen.json');
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');

// Evolution de mentira. Lo único que puede salir es hacia ella, y queda anotado.
//  - `estado`: lo que contesta connectionState.
//  - `falla`: 'tira' (no hay respuesta) o un código HTTP (responde con error).
//  - `fallaEnvio`: el envío al grupo responde con error.
const evo = { estado: 'open', falla: null, fallaEnvio: false };
const consultas = []; // los GET a connectionState
const intentos = []; // los POST a sendText, hayan salido o no
const alGrupo = []; // los textos que SÍ salieron
const ok = (cuerpo) => ({ ok: true, status: 200, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
const error = (status) => ({ ok: false, status, json: async () => ({}), text: async () => 'PrismaClientUnknownRequestError' });
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (!u.startsWith(EVOLUTION)) throw new Error('salió a la red durante la prueba: ' + u);
  const ruta = u.slice(EVOLUTION.length);
  if (ruta.includes('/instance/connectionState/')) {
    consultas.push({ ruta, metodo: opciones.method || 'GET', apikey: (opciones.headers || {}).apikey });
    if (evo.falla === 'tira') throw new Error('fetch failed');
    if (evo.falla) return error(evo.falla);
    return ok({ instance: { instanceName: INSTANCIA, state: evo.estado } });
  }
  if (ruta.includes('/message/sendText/')) {
    const cuerpo = JSON.parse(opciones.body);
    intentos.push(cuerpo);
    if (evo.fallaEnvio) return error(500);
    alGrupo.push(cuerpo.text);
    return ok({ key: { remoteJid: cuerpo.number, fromMe: true, id: 'EV' + intentos.length } });
  }
  return ok({});
};

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const config = require('../src/config');
const evolution = require('../src/evolution');
const bot = require('../src/index');
// Adentro de una función: contra el código de antes (sin src/guardian.js) cada caso
// falla por su cuenta en vez de caerse el archivo entero.
const guardian = () => require('../src/guardian');

const excepciones = [];
process.on('unhandledRejection', (e) => excepciones.push(e));
process.on('uncaughtException', (e) => excepciones.push(e));

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

/** Un momento del 21/09/2026, en hora local (la franja se mira con la hora de la PC). */
const a = (hora, minuto = 0, dia = 21) => new Date(2026, 8, dia, hora, minuto, 0, 0).getTime();

/** Deja todo como recién arrancado: Evolution sana, el guardián sin memoria y nada anotado. */
function limpiar() {
  evo.estado = 'open';
  evo.falla = null;
  evo.fallaEnvio = false;
  consultas.length = 0;
  intentos.length = 0;
  alGrupo.length = 0;
  guardian().reiniciar();
}

/**
 * Un barrido del guardián. `ultimoMensaje` es la hora del último mensaje que ENTRÓ
 * por el webhook (null: ninguno desde el arranque); por defecto, uno de hace un
 * instante, para que el control 2 no se meta en los casos del control 1. El guardián
 * lo recibe como `ultimoEntrante` (Pendientes 2).
 */
const barrer = (ahora, { ultimoMensaje = ahora - MIN, arranque = a(8), ...ganchos } = {}) =>
  guardian().revisar({ ahora, ultimoEntrante: ultimoMensaje, arranque, ...ganchos });

/** Corre `fn` con la consola espiada y devuelve lo que se logueó. */
async function conLogs(fn) {
  const lineas = [];
  const originales = { log: console.log, error: console.error, warn: console.warn };
  const espiar = (...args) => lineas.push(args.join(' '));
  console.log = console.error = console.warn = espiar;
  try {
    await fn();
  } finally {
    Object.assign(console, originales);
  }
  return lineas;
}

let servidor;
function pedir(metodo, ruta, cuerpo) {
  return new Promise((resolve, reject) => {
    const datos = cuerpo === undefined ? '' : JSON.stringify(cuerpo);
    const req = http.request(
      {
        host: '127.0.0.1',
        port: servidor.address().port,
        method: metodo,
        path: ruta,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(datos) },
      },
      (res) => {
        let texto = '';
        res.on('data', (c) => (texto += c));
        res.on('end', () => resolve({ status: res.statusCode, cuerpo: texto }));
      }
    );
    req.on('error', reject);
    req.end(datos);
  });
}
const salud = async () => JSON.parse((await pedir('GET', '/salud')).cuerpo);
const hhmm = (ts) => {
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};

(async () => {
  servidor = bot.escuchar(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));

  console.log('\nevolution.estadoDeLaInstancia()\n');

  await check('consulta GET /instance/connectionState/<instancia> con la apikey y devuelve el estado de Evolution', async () => {
    limpiar();
    for (const estado of ['open', 'connecting', 'close']) {
      evo.estado = estado;
      assert.deepStrictEqual(await evolution.estadoDeLaInstancia(), { estado, motivo: '' });
    }
    assert.strictEqual(consultas.length, 3);
    assert.deepStrictEqual(consultas[0], {
      ruta: '/instance/connectionState/' + INSTANCIA,
      metodo: 'GET',
      apikey: 'clave-de-prueba',
    });
  });

  await check('si no se pudo consultar devuelve null con el motivo, y nunca tira', async () => {
    limpiar();
    evo.falla = 500;
    let r = await evolution.estadoDeLaInstancia();
    assert.strictEqual(r.estado, null);
    assert.ok(/500/.test(r.motivo), 'el motivo no dice el código: ' + r.motivo);
    evo.falla = 'tira';
    r = await evolution.estadoDeLaInstancia();
    assert.strictEqual(r.estado, null);
    assert.ok(/fetch failed/.test(r.motivo), 'el motivo no dice qué pasó: ' + r.motivo);
  });

  await check('en modo escucha se consulta igual: es una lectura, no un envío', async () => {
    limpiar();
    config.modoEscucha = true;
    try {
      assert.deepStrictEqual(await evolution.estadoDeLaInstancia(), { estado: 'open', motivo: '' });
      assert.strictEqual(consultas.length, 1, 'en escucha no consultó a Evolution');
    } finally {
      config.modoEscucha = false;
    }
  });

  console.log('\nControl 1: la instancia\n');

  await check('instancia en close: un aviso; tres barridos más en close y sigue habiendo un solo aviso', async () => {
    limpiar();
    evo.estado = 'close';
    await barrer(a(14, 0));
    assert.deepStrictEqual(alGrupo, ['⚠️ Evolution: la instancia dice close. No están llegando mensajes.']);
    assert.strictEqual(intentos[0].number, GRUPO, 'el aviso no fue al grupo interno');
    await barrer(a(14, 5));
    await barrer(a(14, 10));
    await barrer(a(14, 15));
    assert.strictEqual(alGrupo.length, 1, 'repitió el aviso: ' + JSON.stringify(alGrupo));
    assert.strictEqual(guardian().estado().avisoActivo, true);
  });

  await check('vuelve a open: un solo aviso de recuperación, con el estado anterior y la duración', async () => {
    limpiar();
    evo.estado = 'close';
    await barrer(a(14, 0));
    await barrer(a(14, 5));
    evo.estado = 'open';
    await barrer(a(14, 20));
    assert.deepStrictEqual(alGrupo.slice(1), ['✅ Evolution volvió (close, 20 min)']);
    await barrer(a(14, 25));
    await barrer(a(14, 30));
    assert.strictEqual(alGrupo.length, 2, 'repitió la recuperación: ' + JSON.stringify(alGrupo));
    assert.strictEqual(guardian().estado().avisoActivo, false);
  });

  await check('después de recuperarse, un corte nuevo avisa de nuevo (se rearmó)', async () => {
    limpiar();
    evo.estado = 'close';
    await barrer(a(14, 0));
    evo.estado = 'open';
    await barrer(a(14, 5));
    evo.estado = 'connecting';
    await barrer(a(16, 0));
    assert.strictEqual(alGrupo.length, 3);
    assert.strictEqual(alGrupo[2], '⚠️ Evolution: la instancia dice connecting. No están llegando mensajes.');
  });

  await check('de close a connecting es el mismo corte: no avisa de nuevo, y la duración es la del corte entero', async () => {
    limpiar();
    evo.estado = 'close';
    await barrer(a(10, 0));
    evo.estado = 'connecting';
    await barrer(a(10, 5));
    assert.strictEqual(alGrupo.length, 1, 'avisó dos veces el mismo corte: ' + JSON.stringify(alGrupo));
    evo.estado = 'open';
    await barrer(a(12, 10));
    assert.strictEqual(alGrupo[1], '✅ Evolution volvió (close, 2 h 10 min)');
  });

  await check('Evolution no responde: cuenta como corte, con su texto y el motivo; al volver, "sin respuesta" y la duración', async () => {
    limpiar();
    evo.falla = 'tira';
    await barrer(a(15, 0));
    await barrer(a(15, 5));
    // El envío de mentira anduvo; en la vida real, con Evolution caída este no sale y llega el de abajo.
    assert.deepStrictEqual(alGrupo, ['⚠️ Evolution: no responde (fetch failed). No están llegando mensajes.']);
    assert.strictEqual(guardian().estado().estadoInstancia, 'sin respuesta');
    evo.falla = null;
    await barrer(a(15, 25));
    assert.strictEqual(alGrupo[1], '✅ Evolution volvió (sin respuesta, 25 min)');
    assert.strictEqual(alGrupo.length, 2);
  });

  await check('estadoDeLaInstancia() que tira no rompe el barrido: se loguea y el bot sigue atendiendo', async () => {
    limpiar();
    const real = evolution.estadoDeLaInstancia;
    evolution.estadoDeLaInstancia = async () => {
      throw new Error('Evolution caído, sin respuesta');
    };
    let logs;
    try {
      logs = await conLogs(() => barrer(a(11, 0))); // si tira, el caso falla acá
    } finally {
      evolution.estadoDeLaInstancia = real;
    }
    assert.ok(
      logs.some((l) => l.includes('[guardian]') && l.includes('Evolution caído, sin respuesta')),
      'no quedó en el log: ' + JSON.stringify(logs)
    );
    assert.deepStrictEqual(excepciones, [], 'quedó una excepción suelta');
    // El bot sigue atendiendo: el webhook recibe y /salud contesta.
    const r = await pedir('POST', '/webhook', {
      event: 'messages.upsert',
      instance: INSTANCIA,
      data: { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'G-VIVO' }, message: { conversation: 'x' } },
    });
    assert.strictEqual(r.status, 200, 'el webhook dejó de recibir');
    assert.strictEqual((await pedir('GET', '/salud')).status, 200, '/salud dejó de contestar');
    // Y el barrido siguiente anda normal.
    await barrer(a(11, 5));
    assert.strictEqual(guardian().estado().estadoInstancia, 'open');
  });

  console.log('\nControl 2: el webhook\n');

  await check('instancia en open y sin mensajes por más de GUARDIAN_SIN_MENSAJES_MIN, a las 14:00: avisa desde cuándo', async () => {
    limpiar();
    await barrer(a(14, 0), { ultimoMensaje: a(13, 10) });
    assert.deepStrictEqual(alGrupo, ['⚠️ Evolution dice open pero no llega ningún mensaje desde las 13:10.']);
    assert.strictEqual(guardian().estado().avisoActivo, true);
  });

  await check('con 45 minutos justos todavía no avisa; con 46, sí', async () => {
    limpiar();
    await barrer(a(13, 55), { ultimoMensaje: a(13, 10) });
    assert.deepStrictEqual(alGrupo, []);
    await barrer(a(13, 56), { ultimoMensaje: a(13, 10) });
    assert.strictEqual(alGrupo.length, 1);
  });

  await check('el mismo caso a las 04:00: no avisa, de madrugada no llegan mensajes y eso no es una falla', async () => {
    limpiar();
    await barrer(a(4, 0), { ultimoMensaje: a(3, 10) });
    assert.deepStrictEqual(alGrupo, []);
    assert.strictEqual(guardian().estado().avisoActivo, false);
  });

  await check('con la franja ya cerrada tampoco: a las 22:20 no avisa aunque el plazo se haya cumplido', async () => {
    limpiar();
    await barrer(a(22, 20), { ultimoMensaje: a(21, 30) });
    assert.deepStrictEqual(alGrupo, []);
  });

  await check('el silencio del final de la tarde no se arrastra a la mañana: cada franja tiene su plazo entero', async () => {
    limpiar();
    const ayerTarde = { ultimoMensaje: a(21, 30, 20), arranque: a(8, 0, 20) };
    await barrer(a(9, 30), ayerTarde); // 30 min de ayer + 30 de hoy no son 60
    assert.deepStrictEqual(alGrupo, [], 'sumó el silencio de ayer: ' + JSON.stringify(alGrupo));
    await barrer(a(9, 46), ayerTarde);
    assert.strictEqual(alGrupo.length, 1);
  });

  await check('tres barridos más sin mensajes: sigue habiendo un solo aviso', async () => {
    limpiar();
    await barrer(a(14, 0), { ultimoMensaje: a(13, 10) });
    await barrer(a(14, 5), { ultimoMensaje: a(13, 10) });
    await barrer(a(14, 10), { ultimoMensaje: a(13, 10) });
    await barrer(a(14, 15), { ultimoMensaje: a(13, 10) });
    assert.strictEqual(alGrupo.length, 1, 'repitió el aviso: ' + JSON.stringify(alGrupo));
  });

  await check('llega un mensaje: avisa una vez que volvieron, el aviso se rearma y el barrido siguiente no repite', async () => {
    limpiar();
    await barrer(a(14, 0), { ultimoMensaje: a(13, 10) });
    await barrer(a(14, 25), { ultimoMensaje: a(14, 20) });
    assert.deepStrictEqual(alGrupo.slice(1), ['✅ Volvieron a llegar mensajes (estuvo 1 h 10 min sin llegar nada)']);
    assert.strictEqual(guardian().estado().avisoActivo, false);
    await barrer(a(14, 30), { ultimoMensaje: a(14, 20) });
    await barrer(a(14, 35), { ultimoMensaje: a(14, 20) });
    assert.strictEqual(alGrupo.length, 2, 'repitió: ' + JSON.stringify(alGrupo));
    // Rearmado: si se vuelve a cortar, es un corte nuevo con su aviso.
    await barrer(a(15, 10), { ultimoMensaje: a(14, 20) });
    assert.strictEqual(alGrupo[2], '⚠️ Evolution dice open pero no llega ningún mensaje desde las 14:20.');
    assert.strictEqual(alGrupo.length, 3);
  });

  await check('el silencio de la madrugada no cuenta: con el último mensaje de anoche, a las 09:10 no avisa y a las 09:50 sí', async () => {
    limpiar();
    const anoche = { ultimoMensaje: a(23, 30, 20), arranque: a(8, 0, 20) }; // el bot corre desde ayer
    await barrer(a(9, 10), anoche);
    assert.deepStrictEqual(alGrupo, [], 'avisó apenas abrió la franja: ' + JSON.stringify(alGrupo));
    await barrer(a(9, 50), anoche);
    assert.deepStrictEqual(alGrupo, ['⚠️ Evolution dice open pero no llega ningún mensaje desde las 23:30 del 20/09.']);
  });

  await check('sin ningún mensaje desde el arranque, el silencio se cuenta desde que arrancó el bot', async () => {
    limpiar();
    await barrer(a(10, 30), { ultimoMensaje: null, arranque: a(10, 0) });
    assert.deepStrictEqual(alGrupo, []);
    await barrer(a(10, 50), { ultimoMensaje: null, arranque: a(10, 0) });
    assert.deepStrictEqual(alGrupo, [
      '⚠️ Evolution dice open pero no llega ningún mensaje desde las 10:00 (la hora en que arrancó el bot).',
    ]);
  });

  await check('recién vuelta la instancia, el silencio se cuenta desde que volvió: no sale el segundo aviso pegado a la recuperación', async () => {
    limpiar();
    evo.estado = 'close';
    await barrer(a(14, 0), { ultimoMensaje: a(13, 0) });
    evo.estado = 'open';
    await barrer(a(15, 0), { ultimoMensaje: a(13, 0) });
    await barrer(a(15, 30), { ultimoMensaje: a(13, 0) });
    assert.deepStrictEqual(alGrupo, [
      '⚠️ Evolution: la instancia dice close. No están llegando mensajes.',
      '✅ Evolution volvió (close, 1 h)',
    ]);
    // Si pasado el plazo desde que volvió sigue sin llegar nada, ahí sí.
    await barrer(a(15, 50), { ultimoMensaje: a(13, 0) });
    assert.strictEqual(alGrupo[2], '⚠️ Evolution dice open pero no llega ningún mensaje desde las 13:00.');
  });

  console.log('\nGuardas, reintentos y apagado\n');

  await check('en modo escucha no sale ningún aviso, pero el corte queda a la vista', async () => {
    limpiar();
    config.modoEscucha = true;
    try {
      evo.estado = 'close';
      await barrer(a(14, 0));
      await barrer(a(14, 5));
      evo.estado = 'open';
      await barrer(a(14, 10));
      await barrer(a(16, 0), { ultimoMensaje: a(14, 0) });
      assert.deepStrictEqual(intentos, [], 'en escucha le pidió un envío a Evolution');
      assert.strictEqual(guardian().estado().avisoActivo, true, 'el corte no quedó a la vista');
    } finally {
      config.modoEscucha = false;
    }
  });

  await check('sin destino configurado tampoco sale nada', async () => {
    limpiar();
    config.grupoAvisos = '';
    try {
      evo.estado = 'close';
      await barrer(a(14, 0));
      assert.deepStrictEqual(intentos, []);
    } finally {
      config.grupoAvisos = GRUPO;
    }
  });

  await check('el aviso que no pudo salir se reintenta en el barrido siguiente, y sale una sola vez', async () => {
    limpiar();
    evo.estado = 'close';
    evo.fallaEnvio = true;
    await conLogs(() => barrer(a(14, 0)));
    assert.deepStrictEqual(alGrupo, []);
    evo.fallaEnvio = false;
    await barrer(a(14, 5));
    await barrer(a(14, 10));
    assert.deepStrictEqual(alGrupo, ['⚠️ Evolution: la instancia dice close. No están llegando mensajes.']);
    assert.strictEqual(intentos.length, 2);
  });

  await check('como mucho 3 intentos por aviso: si Evolution manda y contesta error, no llega uno cada 5 minutos', async () => {
    limpiar();
    evo.estado = 'close';
    evo.fallaEnvio = true;
    await conLogs(async () => {
      for (let i = 0; i < 6; i++) await barrer(a(14, 5 * i));
    });
    assert.strictEqual(intentos.length, 3, 'intentó ' + intentos.length + ' veces');
  });

  await check('si el corte termina con el aviso sin salir, sale solo la recuperación', async () => {
    limpiar();
    evo.estado = 'close';
    evo.fallaEnvio = true;
    await conLogs(() => barrer(a(14, 0)));
    evo.estado = 'open';
    evo.fallaEnvio = false;
    await barrer(a(14, 40));
    assert.deepStrictEqual(alGrupo, ['✅ Evolution volvió (close, 40 min)']);
  });

  await check('GUARDIAN_ACTIVO=false apaga todo el módulo: ni consulta a Evolution ni avisa', async () => {
    limpiar();
    config.guardian.activo = false;
    try {
      evo.estado = 'close';
      await barrer(a(14, 0), { ultimoMensaje: a(12, 0) });
      await bot.revisarGuardian(a(14, 5));
      assert.deepStrictEqual(consultas, [], 'consultó a Evolution estando apagado');
      assert.deepStrictEqual(intentos, []);
      assert.deepStrictEqual(guardian().estado(), { estadoInstancia: null, avisoActivo: false });
    } finally {
      config.guardian.activo = true;
    }
  });

  await check('valores por defecto: activo, cada 5 minutos y 45 minutos sin mensajes', async () => {
    // config.js lee el entorno al cargarse: se mira en otro proceso, con las tres
    // variables vacías para no heredar nada del .env de la máquina.
    const leer = (env) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ['-e', `process.stdout.write(JSON.stringify(require(${JSON.stringify(path.join(__dirname, '..', 'src', 'config.js'))}).guardian))`],
          {
            cwd: __dirname,
            env: { ...process.env, GUARDIAN_ACTIVO: '', GUARDIAN_MIN: '', GUARDIAN_SIN_MENSAJES_MIN: '', ...env },
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
          }
        )
      );
    assert.deepStrictEqual(leer({}), { activo: true, min: 5, sinMensajesMin: 45 });
    assert.deepStrictEqual(leer({ GUARDIAN_ACTIVO: 'false', GUARDIAN_MIN: '2', GUARDIAN_SIN_MENSAJES_MIN: '90' }), {
      activo: false,
      min: 2,
      sinMensajesMin: 90,
    });
    // Un valor ilegible no puede dejar el barrido corriendo sin pausa.
    assert.deepStrictEqual(leer({ GUARDIAN_MIN: 'cinco', GUARDIAN_SIN_MENSAJES_MIN: '0' }), {
      activo: true,
      min: 5,
      sinMensajesMin: 45,
    });
  });

  console.log('\nLos cortes, para chats viejos (29/09/2026)\n');

  // El guardián le cuenta a chats viejos cuándo abre y cuándo cierra un corte (el cableado
  // está en index.js): con eso frena alDia en la última señal buena y, a la vuelta, se pone
  // al día. Lo que hace chats viejos con eso lo prueba test/chats-viejos.test.js.
  const cortes = [];
  const ganchos = {
    alAbrirCorte: (c) => cortes.push(['abre', c]),
    alCerrarCorte: (c) => cortes.push(['cierra', c]),
  };

  await check('control 1: abre el corte con el estado y desde el último barrido que leyó open, y lo cierra al volver', async () => {
    limpiar();
    cortes.length = 0;
    await barrer(a(14, 0), ganchos);
    await barrer(a(14, 5), ganchos);
    evo.estado = 'close';
    await barrer(a(14, 10), ganchos);
    evo.estado = 'connecting'; // el mismo corte: no abre otro
    await barrer(a(14, 15), ganchos);
    evo.estado = 'open';
    await barrer(a(14, 40), ganchos);
    await barrer(a(14, 45), ganchos);
    evo.estado = 'close'; // un corte nuevo: desde el último open, el de las 14:45
    await barrer(a(15, 0), ganchos);
    assert.deepStrictEqual(cortes, [
      ['abre', { control: 'instancia', estado: 'close', desde: a(14, 5) }],
      ['cierra', { control: 'instancia' }],
      ['abre', { control: 'instancia', estado: 'close', desde: a(14, 45) }],
    ]);
  });

  await check('control 1 sin ningún barrido en open desde que arrancó: desde es el arranque; Evolution sin responder es "sin respuesta"', async () => {
    limpiar();
    cortes.length = 0;
    evo.falla = 'tira';
    await barrer(a(9, 0), { ...ganchos, arranque: a(8, 30) });
    assert.deepStrictEqual(cortes, [['abre', { control: 'instancia', estado: 'sin respuesta', desde: a(8, 30) }]]);
  });

  await check('control 2: abre con la hora del último mensaje que entró (la del corte) y cierra cuando vuelve a llegar algo', async () => {
    limpiar();
    cortes.length = 0;
    await barrer(a(14, 0), { ...ganchos, ultimoMensaje: a(13, 10) });
    await barrer(a(14, 5), { ...ganchos, ultimoMensaje: a(13, 10) });
    await barrer(a(14, 25), { ...ganchos, ultimoMensaje: a(14, 20) });
    // Sin ningún mensaje desde el arranque, es la hora del arranque (la misma del ⚠️).
    await barrer(a(15, 30), { ...ganchos, ultimoMensaje: null, arranque: a(14, 30) });
    assert.deepStrictEqual(cortes, [
      ['abre', { control: 'webhook', desde: a(13, 10) }],
      ['cierra', { control: 'webhook' }],
      ['abre', { control: 'webhook', desde: a(14, 30) }],
    ]);
  });

  // Agregado defensivo: si chats viejos tira, el guardián sigue avisando igual.
  await check('los avisos al grupo son los mismos con chats viejos escuchando o no, y un gancho que tira no frena ninguno', async () => {
    const corte = async (extra) => {
      limpiar();
      evo.estado = 'close';
      await barrer(a(14, 0), extra);
      evo.estado = 'open';
      await barrer(a(14, 20), extra);
      await barrer(a(15, 10), { ...extra, ultimoMensaje: a(14, 19) });
      await barrer(a(15, 20), { ...extra, ultimoMensaje: a(15, 15) });
      return [...alGrupo];
    };
    const sin = await corte({});
    const tira = () => {
      throw new Error('chats viejos se rompió');
    };
    let con;
    const logs = await conLogs(async () => {
      con = await corte({ alAbrirCorte: tira, alCerrarCorte: tira });
    });
    assert.strictEqual(sin.length, 4, 'el caso no prueba nada: ' + JSON.stringify(sin));
    assert.deepStrictEqual(con, sin, 'los avisos cambiaron con chats viejos escuchando');
    assert.ok(
      logs.some((l) => l.includes('[guardian]') && l.includes('chats viejos se rompió')),
      'el error del gancho no quedó en el log: ' + JSON.stringify(logs)
    );
    assert.deepStrictEqual(excepciones, [], 'quedó una excepción suelta');
  });

  console.log('\nindex.js\n');

  await check('/salud suma estadoInstancia (lo último que se leyó) y guardianAvisoActivo', async () => {
    limpiar();
    let j = await salud();
    assert.strictEqual(j.estadoInstancia, null, 'antes del primer barrido: ' + j.estadoInstancia);
    assert.strictEqual(j.guardianAvisoActivo, false);
    const ahora = Date.now();
    evo.estado = 'close';
    await bot.revisarGuardian(ahora);
    evo.estado = 'open'; // /salud muestra lo que leyó el guardián, no una consulta nueva
    j = await salud();
    assert.strictEqual(j.estadoInstancia, 'close');
    assert.strictEqual(j.guardianAvisoActivo, true);
    await bot.revisarGuardian(ahora + 10 * MIN);
    j = await salud();
    assert.strictEqual(j.estadoInstancia, 'open');
    assert.strictEqual(j.guardianAvisoActivo, false);
    assert.deepStrictEqual(alGrupo, [
      '⚠️ Evolution: la instancia dice close. No están llegando mensajes.',
      '✅ Evolution volvió (close, 10 min)',
    ]);
  });

  await check('el barrido de index.js usa el ultimoEntrante del webhook, el mismo de /salud', async () => {
    limpiar();
    const antes = { desde: config.seguimiento.horaDesde, hasta: config.seguimiento.horaHasta };
    config.seguimiento.horaDesde = 0; // la prueba corre a cualquier hora
    config.seguimiento.horaHasta = 24;
    try {
      const r = await pedir('POST', '/webhook', {
        event: 'messages.upsert',
        instance: INSTANCIA,
        data: { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'G-ULTIMO' }, message: { conversation: 'x' } },
      });
      assert.strictEqual(r.status, 200);
      const ultimo = Date.parse((await salud()).ultimoMensaje);
      assert.ok(ultimo, 'el caso no prueba nada: /salud no tiene ultimoMensaje');
      await bot.revisarGuardian(ultimo + 30 * MIN);
      assert.deepStrictEqual(alGrupo, []);
      await bot.revisarGuardian(ultimo + 50 * MIN);
      assert.strictEqual(alGrupo.length, 1, JSON.stringify(alGrupo));
      assert.ok(
        alGrupo[0].startsWith(`⚠️ Evolution dice open pero no llega ningún mensaje desde las ${hhmm(ultimo)}`),
        alGrupo[0]
      );
    } finally {
      config.seguimiento.horaDesde = antes.desde;
      config.seguimiento.horaHasta = antes.hasta;
    }
  });

  // Pendientes 2, punto 6 (decisión de Tomás del 21/09/2026): el reloj del guardián
  // cuenta solo los mensajes que ENTRAN (los que no son `fromMe`: de clientes, de
  // grupos, estados). El ⚠️ del guardián vuelve por el webhook como mensaje propio en
  // el grupo y movía `ultimoMensaje`: en una tarde tranquila salía el ⚠️ y enseguida
  // el ✅. `ultimoMensaje` de /salud queda como estaba; el guardián recibe `ultimoEntrante`.
  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  const CLIENTE = '5490000000000@s.whatsapp.net';
  let idWebhook = 0;
  const llega = (remoteJid, fromMe, texto, id = 'G-P2-' + ++idWebhook) =>
    pedir('POST', '/webhook', {
      event: 'messages.upsert',
      instance: INSTANCIA,
      data: { key: { remoteJid, fromMe, id }, pushName: 'Lucia', message: { conversation: texto } },
    });
  // El Evolution de mentira anota todo sendText: acá se miran solo los avisos al grupo.
  const avisos = () => intentos.filter((i) => i.number === GRUPO).map((i) => i.text);
  // La hora del mensaje que acaba de entrar. Contra el código de antes (sin
  // `ultimoEntrante`) se lee `ultimoMensaje`, así cada caso falla por lo suyo.
  const cuandoEntro = async () => {
    const j = await salud();
    const ts = Date.parse(j.ultimoEntrante || j.ultimoMensaje);
    assert.ok(ts, 'el caso no prueba nada: /salud no dice cuándo entró el último mensaje');
    return ts;
  };
  async function conFranjaAbierta(fn) {
    const antes = { desde: config.seguimiento.horaDesde, hasta: config.seguimiento.horaHasta };
    config.seguimiento.horaDesde = 0; // la prueba corre a cualquier hora
    config.seguimiento.horaHasta = 24;
    try {
      await fn();
    } finally {
      config.seguimiento.horaDesde = antes.desde;
      config.seguimiento.horaHasta = antes.hasta;
    }
  }

  await check('el eco de un aviso al grupo (fromMe en el grupo) no rearma el control 2; un mensaje de un cliente sí', async () => {
    limpiar();
    await conFranjaAbierta(async () => {
      await llega('status@broadcast', false, 'x');
      const entro = await cuandoEntro();
      await bot.revisarGuardian(entro + 50 * MIN);
      assert.strictEqual(avisos().length, 1, 'el caso no prueba nada: no salió el ⚠️: ' + JSON.stringify(avisos()));
      assert.ok(avisos()[0].startsWith('⚠️ Evolution dice open pero no llega ningún mensaje'), avisos()[0]);

      // El ⚠️ vuelve por el webhook como mensaje propio en el grupo.
      await dormir(5);
      await llega(GRUPO, true, avisos()[0]);
      await bot.revisarGuardian(entro + 55 * MIN);
      assert.deepStrictEqual(avisos().slice(1), [], 'el eco del ⚠️ rearmó el control 2 y salió el ✅ enseguida');
      assert.strictEqual((await salud()).guardianAvisoActivo, true, 'el eco cerró el corte');

      // Un mensaje de un cliente sí: es lo que el guardián espera ver.
      await dormir(5);
      await llega(CLIENTE, false, 'hola');
      await bot.revisarGuardian(entro + 60 * MIN);
      // El webhook anota la hora de verdad y el barrido corre con reloj simulado: para
      // el guardián ese "hola" ya tiene una hora, así que después del ✅ abre un corte
      // nuevo. Lo que se mira es que el ✅ salió, una vez, y antes que cualquier otra cosa.
      const despues = avisos().slice(1);
      assert.ok(despues.length && despues[0].startsWith('✅ Volvieron a llegar mensajes'), 'con un mensaje de un cliente tenía que salir el ✅: ' + JSON.stringify(despues));
      assert.strictEqual(despues.filter((t) => t.startsWith('✅')).length, 1, 'el ✅ salió más de una vez: ' + JSON.stringify(despues));
      await dormir(120); // que termine la tanda del "hola" antes del caso que sigue
    });
  });

  await check('un mensaje de una persona de la cuenta en el chat de un cliente tampoco mueve el reloj del guardián', async () => {
    limpiar();
    await conFranjaAbierta(async () => {
      await llega('status@broadcast', false, 'x');
      const entro = await cuandoEntro();
      await dormir(30);
      await llega(CLIENTE, true, 'hola! ahora te paso el precio');
      // Pasado el plazo por 10 ms contando desde el mensaje que ENTRÓ. Si el de la cuenta
      // (30 ms después) moviera el reloj, todavía faltarían 20 ms y no avisaría.
      await bot.revisarGuardian(entro + 45 * MIN + 10);
      assert.strictEqual(avisos().length, 1, 'el mensaje de la cuenta contó como que entran mensajes: ' + JSON.stringify(avisos()));
      assert.ok(avisos()[0].includes(`desde las ${hhmm(entro)}`), avisos()[0]);
    });
  });

  await check('/salud muestra ultimoMensaje y ultimoEntrante por separado, y un repetido no mueve ninguno de los dos', async () => {
    limpiar();
    await llega('status@broadcast', false, 'x', 'G-P2-ENTRA');
    const j1 = await salud();
    assert.ok(j1.ultimoEntrante, '/salud no tiene ultimoEntrante');
    assert.strictEqual(j1.ultimoMensaje, j1.ultimoEntrante, 'con un mensaje que entra, los dos tienen la misma hora');
    await dormir(5);
    await llega(GRUPO, true, '📌 Anotado · un aviso cualquiera del bot');
    const j2 = await salud();
    assert.strictEqual(j2.ultimoEntrante, j1.ultimoEntrante, 'un mensaje propio movió ultimoEntrante');
    assert.ok(Date.parse(j2.ultimoMensaje) > Date.parse(j1.ultimoMensaje), 'ultimoMensaje dejó de moverse con los mensajes propios');
    await dormir(5);
    await llega('status@broadcast', false, 'x', 'G-P2-ENTRA'); // el mismo id: repetido
    const j3 = await salud();
    assert.strictEqual(j3.ultimoEntrante, j2.ultimoEntrante, 'un repetido movió ultimoEntrante');
    assert.strictEqual(j3.ultimoMensaje, j2.ultimoMensaje, 'un repetido movió ultimoMensaje');
  });

  await check('el guardián reemplaza a la alerta vieja de desconexión: un corte no avisa dos veces', async () => {
    const fuente = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
    assert.ok(!/reescanear el QR/.test(fuente), 'index.js todavía tiene la alerta vieja ("reescanear el QR")');
    assert.ok(!/ultimoEstadoAvisado/.test(fuente), 'index.js todavía tiene el barrido viejo (ultimoEstadoAvisado)');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  servidor.close();
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* da igual */
  }
  process.exit(fallos ? 1 : 0);
})();
