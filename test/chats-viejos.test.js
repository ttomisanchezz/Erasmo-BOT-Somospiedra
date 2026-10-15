'use strict';
/**
 * Chats viejos para SOLO_CHATS_NUEVOS (decisión de Tomás del 29/09/2026).
 *
 *   node test/chats-viejos.test.js
 *
 * Un chat es NUEVO solo si empezó desde cero con el bot mirando y nunca escribió nadie de la
 * cuenta. Todo lo demás es VIEJO y, con SOLO_CHATS_NUEVOS=true, va en borrador; el tester no
 * cambia. La lista sale de la semilla (npm run sembrar-viejos) y de la puesta al día con
 * Evolution en cada arranque (src/chats-viejos.js).
 *
 * La sección 10 es la caída de Evolution con el bot andando (29/09/2026): el guardián abre un
 * corte, alDia se frena en la última señal buena y, a la vuelta, se pone al día hasta ahora.
 *
 * Evolution es de mentira (`evolution.buscarMensajes` filtra y pagina como el 2.3.7 que corre)
 * y los números, inventados. El entorno se fija acá y no se hereda del .env: ESTADO_PATH va en
 * una carpeta temporal propia, y chats-viejos.json se guarda al lado.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const http = require('http');
const { spawnSync } = require('child_process');

const CARPETA = fs.mkdtempSync(path.join(os.tmpdir(), 'chats-viejos-'));
process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '10';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = '';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '5490000000009';
process.env.NUMEROS_PILOTO = 'todos';
process.env.SOLO_CHATS_NUEVOS = 'true';
// El guardián de la caída de Evolution (sección 10): se lo llama a mano, con su reloj.
process.env.GUARDIAN_ACTIVO = 'true';
process.env.GUARDIAN_MIN = '5';
process.env.GUARDIAN_SIN_MENSAJES_MIN = '45';
process.env.WEBHOOK_SECRETO = '';
process.env.WEBHOOK_MAX_POR_MINUTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.RESUMEN_ACTIVO = 'false';
process.env.EVOLUTION_URL = 'http://evolution.de-mentira:8080';
process.env.EVOLUTION_INSTANCE = 'instancia-de-prueba';
process.env.EVOLUTION_APIKEY = 'clave-de-prueba';
process.env.GRUPO_AVISOS_JID = '120363000000000000@g.us';
process.env.ESTADO_PATH = path.join(CARPETA, 'estado.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(CARPETA, 'aprendizaje.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const config = require('../src/config');
const evolution = require('../src/evolution');

// El de verdad, antes de reemplazarlo: se prueba contra un fetch de mentira.
const buscarMensajesReal = evolution.buscarMensajes;

globalThis.fetch = async () => {
  throw new Error('salió a la red durante la prueba');
};

const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, texto) => {
  aClientes.push({ numero, texto });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => {
  aClientes.push({ numero, texto: '[foto]' });
  return respuestaEvolution(numero);
};
evolution.enviarDocumento = async (numero) => {
  aClientes.push({ numero, texto: '[documento]' });
  return respuestaEvolution(numero);
};
evolution.mostrarEscribiendo = async () => ({});
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

// Evolution de mentira: guarda mensajes y los devuelve como POST /chat/findMessages del 2.3.7
// (filtra por fecha en segundos, ambos inclusive; del más nuevo al más viejo; página desde 1).
const evo = { registros: [], falla: null, demora: 0, pedidos: [], instancia: 'open' };
// El guardián lee la instancia con estadoDeLaInstancia: `evo.instancia` (null: Evolution no responde).
evolution.estadoDeLaInstancia = async () =>
  evo.instancia ? { estado: evo.instancia, motivo: '' } : { estado: null, motivo: 'fetch failed' };
evolution.buscarMensajes = async (q) => {
  evo.pedidos.push(q);
  if (evo.demora) await dormir(evo.demora);
  if (evo.falla) throw new Error(evo.falla);
  const gte = Math.floor(new Date(q.desde).getTime() / 1000);
  const lte = Math.floor(new Date(q.hasta).getTime() / 1000);
  const todos = evo.registros
    .filter((r) => r.messageTimestamp >= gte && r.messageTimestamp <= lte)
    .sort((a, b) => b.messageTimestamp - a.messageTimestamp);
  const por = q.porPagina;
  return {
    total: todos.length,
    paginas: Math.ceil(todos.length / por),
    registros: todos.slice((q.pagina - 1) * por, q.pagina * por),
  };
};

const bot = require('../src/index');
const state = require('../src/state');
const chatsViejos = require('../src/chats-viejos');
const semilla = require('./sembrar-viejos');
const guardian = require('../src/guardian');

// Números inventados.
const VIEJO = '5490000000001';
const EN_ESTADO = '5490000000002';
const NUEVO = '5490000000003';
const CONOCIDO = '5490000000004';
const DESCONOCIDO = '5490000000005';
const ATENDIDO = '5490000000006';
const DEL_BOT = '5490000000007';
const OTRO_NUEVO = '5490000000008';
const TESTER = '5490000000009';
const jid = (n) => `${n}@s.whatsapp.net`;

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

function dormir(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
const iso = (ms) => new Date(ms).toISOString();
let serie = 0;
/** Un mensaje guardado en Evolution, como lo devuelve findMessages. */
const guardado = (remoteJid, ms, { fromMe = false, id, alt } = {}) => ({
  key: { remoteJid, fromMe, id: id || 'R' + ++serie, ...(alt ? { remoteJidAlt: alt } : {}) },
  messageTimestamp: Math.floor(ms / 1000),
  messageType: 'conversation',
  message: { conversation: 'hola' },
});
/** Un mensaje que llega por el webhook. */
const escrito = (numero, texto) => ({
  key: { remoteJid: jid(numero), fromMe: false, id: 'W' + ++serie },
  pushName: 'Marta',
  message: { conversation: texto },
});
const leLlego = (numero) => aClientes.some((m) => String(m.numero).includes(numero));
const archivo = () => JSON.parse(fs.readFileSync(chatsViejos.ARCHIVO, 'utf8'));

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  evo.registros = [];
  evo.falla = null;
  evo.demora = 0;
  evo.pedidos = [];
  evo.instancia = 'open';
  guardian.reiniciar();
}

/** Una lista ya sembrada y arrancada antes: lo que queda en disco para el arranque siguiente. */
function escribirLista({ viejos = [], lids = {}, alDia, idsBot = [], primerArranque = true }) {
  const v = {};
  for (const n of viejos) v[n] = { desde: iso(alDia - 86400e3), motivo: 'semilla: mensajes en Evolution' };
  chatsViejos.guardar({
    viejos: v,
    lids,
    alDia: iso(alDia),
    idsBot,
    semilla: { en: iso(alDia - 3600e3), total: viejos.length, primerArranque: primerArranque ? iso(alDia - 1800e3) : null },
  });
}

/** Arranca la puesta al día como index.js al levantar el puerto, con relojes de prueba. */
function arrancar(escucha = Date.now(), extra = {}) {
  chatsViejos.detener();
  return bot.arrancarChatsViejos(escucha, { tickMs: 1e7, reintentoMs: 1e7, ...extra });
}

async function conLogs(fn) {
  const lineas = [];
  const original = console.log;
  console.log = (...a) => lineas.push(a.join(' '));
  try {
    await fn();
  } finally {
    console.log = original;
  }
  return lineas;
}

const ESTADO_SEMILLA = path.join(CARPETA, 'estado-para-la-semilla.json');
/** Siembra con una base de mentira (lo que leería de evolution_postgres y evolution_api). */
function sembrarCon({ claves = [], mapaLid = [], estado = {}, en = Date.now(), simular = false, ...resto }) {
  fs.writeFileSync(ESTADO_SEMILLA, JSON.stringify(estado));
  return semilla.sembrar({
    simular,
    base: () => ({ claves, mapaLid }),
    estadoPath: ESTADO_SEMILLA,
    ahora: () => en,
    botCorriendo: async () => false,
    log: () => {},
    ...resto,
  });
}

let servidor;
function pedirSalud() {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port: servidor.address().port, method: 'GET', path: '/salud' }, (res) => {
      let texto = '';
      res.on('data', (c) => (texto += c));
      res.on('end', () => resolve(JSON.parse(texto)));
    });
    req.on('error', reject);
    req.end();
  });
}

(async () => {
  const REPO = path.join(__dirname, '..');

  console.log('\n9. Requerir los módulos no llama a Evolution\n');

  await check('requerir index, evolution, chats-viejos y la semilla no llama a Evolution ni toca la lista', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chats-viejos-requerir-'));
    const codigo = [
      'let llamadas = 0;',
      'globalThis.fetch = async () => { llamadas++; throw new Error("red"); };',
      'const cp = require("child_process");',
      'for (const f of ["exec", "execFile", "execSync", "execFileSync", "spawn", "spawnSync"]) {',
      '  const o = cp[f]; cp[f] = (...a) => { llamadas++; return o(...a); };',
      '}',
      'require("./src/index"); require("./src/evolution"); require("./test/sembrar-viejos");',
      'const cv = require("./src/chats-viejos");',
      'setTimeout(() => {',
      '  console.log("RESULTADO " + JSON.stringify({ llamadas, estado: cv.resumen().estado, existe: require("fs").existsSync(cv.ARCHIVO) }));',
      '  process.exit(0);',
      '}, 400);',
    ].join('\n');
    const r = spawnSync(process.execPath, ['-e', codigo], {
      cwd: REPO,
      encoding: 'utf8',
      env: { ...process.env, ESTADO_PATH: path.join(dir, 'estado.json'), APRENDIZAJE_PATH: path.join(dir, 'apr.jsonl') },
    });
    const linea = String(r.stdout).split('\n').find((l) => l.startsWith('RESULTADO '));
    assert.ok(linea, 'el proceso no terminó bien: ' + String(r.stderr).slice(0, 400));
    const res = JSON.parse(linea.slice('RESULTADO '.length));
    assert.strictEqual(res.llamadas, 0, `llamó ${res.llamadas} vez/veces a la red o a docker al requerir`);
    assert.strictEqual(res.estado, 'sin arrancar');
    assert.strictEqual(res.existe, false, 'creó chats-viejos.json al requerir');
  });

  await check('el bot de verdad (node src/index.js) se pone al día al levantar el puerto, contra Evolution por HTTP', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'chats-viejos-arranque-'));
    const alDia = Date.now() - 3600e3;
    const pedidos = [];
    // Evolution de mentira por HTTP: contesta findMessages como el 2.3.7.
    const falso = http.createServer((q, r) => {
      let cuerpo = '';
      q.on('data', (c) => (cuerpo += c));
      q.on('end', () => {
        pedidos.push({ url: q.url, apikey: q.headers.apikey, cuerpo: JSON.parse(cuerpo || '{}') });
        if (q.url !== '/chat/findMessages/instancia-de-prueba') return r.writeHead(404).end('{}');
        const registros = [guardado(jid(DESCONOCIDO + '1'), alDia + 60e3)];
        r.writeHead(200, { 'content-type': 'application/json' });
        r.end(JSON.stringify({ messages: { total: 1, pages: 1, currentPage: 1, records: registros } }));
      });
    });
    await new Promise((r) => falso.listen(0, '127.0.0.1', r));
    chatsViejos.guardar(
      { viejos: { [VIEJO]: { desde: iso(alDia - 86400e3), motivo: 'semilla' } }, lids: {}, alDia: iso(alDia), idsBot: [], semilla: { en: iso(alDia), primerArranque: iso(alDia) } },
      path.join(dir, 'chats-viejos.json')
    );
    const hijo = require('child_process').spawn(process.execPath, ['src/index.js'], {
      cwd: REPO,
      env: {
        ...process.env,
        PORT: '0',
        HOST: '127.0.0.1',
        EVOLUTION_URL: `http://127.0.0.1:${falso.address().port}`,
        ESTADO_PATH: path.join(dir, 'estado.json'),
        APRENDIZAJE_PATH: path.join(dir, 'apr.jsonl'),
      },
    });
    let salida = '';
    try {
      await new Promise((resolve, reject) => {
        const t = setTimeout(() => reject(new Error('el bot no dijo CHATS VIEJOS en 20 s:\n' + salida.slice(-800))), 20000);
        const leer = (d) => {
          salida += d;
          if (/CHATS VIEJOS: \d+ en la lista/.test(salida)) {
            clearTimeout(t);
            resolve();
          }
        };
        hijo.stdout.on('data', leer);
        hijo.stderr.on('data', leer);
      });
      assert.ok(/CHATS VIEJOS: 2 en la lista, al día hasta \d\d\/\d\d \d\d:\d\d/.test(salida), salida.slice(-800));
      assert.strictEqual(pedidos.length, 1);
      assert.strictEqual(pedidos[0].apikey, 'clave-de-prueba');
      assert.strictEqual(pedidos[0].cuerpo.where.messageTimestamp.gte, iso(alDia));
      const lista = JSON.parse(fs.readFileSync(path.join(dir, 'chats-viejos.json'), 'utf8'));
      assert.ok(lista.viejos[DESCONOCIDO + '1'], 'no guardó el chat que empezó con el bot apagado');
    } finally {
      hijo.kill();
      falso.close();
    }
  });

  await check('evolution.buscarMensajes: POST /chat/findMessages con gte y lte juntos, page y offset, también en escucha', async () => {
    const pedidos = [];
    const fetchAntes = globalThis.fetch;
    const escuchaAntes = config.modoEscucha;
    globalThis.fetch = async (url, opciones) => {
      pedidos.push({ url, opciones });
      return {
        ok: true,
        status: 200,
        json: async () => ({ messages: { total: 3, pages: 2, currentPage: 2, records: [guardado(jid(VIEJO), Date.now())] } }),
      };
    };
    config.modoEscucha = true; // es una lectura: en escucha también
    try {
      const desde = Date.parse('2026-09-29T10:00:00Z');
      const hasta = Date.parse('2026-09-29T12:30:00Z');
      const r = await buscarMensajesReal({ desde, hasta, pagina: 2, porPagina: 2 });
      assert.strictEqual(pedidos.length, 1);
      const { url, opciones } = pedidos[0];
      assert.strictEqual(url, 'http://evolution.de-mentira:8080/chat/findMessages/instancia-de-prueba');
      assert.strictEqual(opciones.method, 'POST');
      assert.strictEqual(opciones.headers.apikey, 'clave-de-prueba');
      const cuerpo = JSON.parse(opciones.body);
      assert.deepStrictEqual(cuerpo.where.messageTimestamp, { gte: iso(desde), lte: iso(hasta) });
      assert.strictEqual(cuerpo.page, 2);
      assert.strictEqual(cuerpo.offset, 2);
      assert.strictEqual(r.total, 3);
      assert.strictEqual(r.paginas, 2);
      assert.strictEqual(r.registros.length, 1);
    } finally {
      globalThis.fetch = fetchAntes;
      config.modoEscucha = escuchaAntes;
    }
  });

  await check('evolution.buscarMensajes tira si Evolution contesta con error o sin mensajes', async () => {
    const fetchAntes = globalThis.fetch;
    try {
      globalThis.fetch = async () => ({ ok: false, status: 500, text: async () => 'se rompió', json: async () => ({}) });
      await assert.rejects(() => buscarMensajesReal({ desde: 0, hasta: 1000, pagina: 1, porPagina: 10 }), /500/);
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ algo: 1 }) });
      await assert.rejects(() => buscarMensajesReal({ desde: 0, hasta: 1000, pagina: 1, porPagina: 10 }));
    } finally {
      globalThis.fetch = fetchAntes;
    }
  });

  console.log('\n1. La semilla\n');

  const HACE_UN_ANIO = Date.parse('2025-03-10T15:00:00Z');
  const baseDeEjemplo = {
    claves: [
      { jid: jid(VIEJO), alt: null, desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 1 },
      { jid: jid(TESTER), alt: null, desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 4 },
      { jid: '10000000000011@lid', alt: jid('5490000000011'), desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 2 },
      { jid: '10000000000012@lid', alt: null, desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 2 },
      { jid: '10000000000013@lid', alt: null, desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 1 },
      { jid: '120363000000000077@g.us', alt: null, desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 9 },
    ],
    mapaLid: [{ lid: '10000000000012', numero: '5490000000012', via: 'archivo' }],
  };
  const estadoDeEjemplo = {
    [jid(EN_ESTADO)]: { historial: [{ quien: 'cliente', texto: 'hola', ts: HACE_UN_ANIO + 1000 }] },
    [jid(TESTER)]: { historial: [] },
    'eval-abc123': { historial: [{ quien: 'cliente', texto: 'hola', ts: 1 }] },
    'aprobado-xyz': { historial: [] },
    'bot:interno': { esquema: 3 },
  };
  const s = semilla.armarSemilla({ ...baseDeEjemplo, estado: estadoDeEjemplo, esTester: (n) => evolution.estaEnLaLista(n, config.numerosTester), en: Date.now() });

  await check('un chat con mensajes en la base es viejo, de cualquier fecha', () => {
    assert.ok(s.datos.viejos[VIEJO], 'no quedó en la lista');
    assert.strictEqual(s.datos.viejos[VIEJO].desde, iso(HACE_UN_ANIO), 'desde tiene que ser su mensaje más viejo');
  });

  await check('un chat real de estado.json es viejo; los eval-… y aprobado-… no entran', () => {
    assert.ok(s.datos.viejos[EN_ESTADO], 'un chat de estado.json no quedó en la lista');
    const claves = Object.keys(s.datos.viejos);
    assert.ok(claves.every((n) => /^\d+$/.test(n)), 'entró una clave que no es un número: ' + claves.join(', '));
  });

  await check('el tester no entra', () => {
    assert.ok(!s.datos.viejos[TESTER], 'el tester quedó en la lista');
  });

  await check('un @lid con remoteJidAlt se guarda por número', () => {
    assert.ok(s.datos.viejos['5490000000011'], 'el @lid con alt no quedó por número');
    assert.strictEqual(s.datos.lids['10000000000011'], '5490000000011');
  });

  await check('un @lid sin alt se traduce con el mapeo (lid-mapping) y se guarda por número', () => {
    assert.ok(s.datos.viejos['5490000000012'], 'el @lid del mapeo no quedó por número');
    assert.strictEqual(s.datos.lids['10000000000012'], '5490000000012');
  });

  await check('un @lid que no se puede traducir se cuenta y queda anotado sin número', () => {
    assert.strictEqual(s.resumen.lidSinTraducir, 1);
    assert.ok('10000000000013' in s.datos.lids && s.datos.lids['10000000000013'] === null);
    assert.ok(!Object.keys(s.datos.viejos).some((n) => n.includes('10000000000013')), 'entró el @lid como número');
  });

  await check('el resumen cuenta el total, los de @lid y el mensaje más viejo; los grupos no entran', () => {
    assert.strictEqual(s.resumen.total, 4, JSON.stringify(s.resumen));
    assert.strictEqual(s.resumen.deLid, 2);
    assert.strictEqual(s.resumen.soloEnEstado, 1);
    assert.strictEqual(s.resumen.masViejo, iso(HACE_UN_ANIO));
    assert.ok(!Object.keys(s.datos.viejos).some((n) => n.startsWith('1203')), 'entró un grupo');
  });

  await check('sembrar --simular no escribe nada', async () => {
    try {
      fs.unlinkSync(chatsViejos.ARCHIVO);
    } catch {
      /* no estaba */
    }
    const r = await sembrarCon({ ...baseDeEjemplo, estado: estadoDeEjemplo, simular: true });
    assert.strictEqual(r.escrito, false);
    assert.ok(!fs.existsSync(chatsViejos.ARCHIVO), 'escribió con --simular');
    assert.strictEqual(r.resumen.total, 4);
  });

  await check('sembrar guarda la lista al lado de estado.json, con alDia en el momento de la semilla', async () => {
    const en = Date.now() - 5000;
    const r = await sembrarCon({ ...baseDeEjemplo, estado: estadoDeEjemplo, en });
    assert.strictEqual(r.escrito, true);
    assert.strictEqual(chatsViejos.ARCHIVO, path.join(CARPETA, 'chats-viejos.json'));
    const d = archivo();
    assert.strictEqual(d.alDia, iso(en));
    assert.strictEqual(d.semilla.en, iso(en));
    assert.strictEqual(d.semilla.primerArranque, null);
    assert.deepStrictEqual(d.idsBot, []);
    assert.ok(d.viejos[VIEJO] && d.viejos[EN_ESTADO]);
    assert.ok(!fs.existsSync(chatsViejos.ARCHIVO + '.tmp'), 'quedó el .tmp de la escritura');
  });

  // Agregado defensivo: el bot, si está corriendo con la lista cargada, la guarda cada 60 s y
  // pisaría la semilla nueva. Por eso el orden es frenar el bot, sembrar y arrancar.
  await check('con algo escuchando en el puerto del bot, sembrar no escribe', async () => {
    try {
      fs.unlinkSync(chatsViejos.ARCHIVO);
    } catch {
      /* no estaba */
    }
    const ocupado = http.createServer((q, r) => r.end('ok'));
    await new Promise((r) => ocupado.listen(0, '127.0.0.1', r));
    try {
      const r = await sembrarCon({ ...baseDeEjemplo, estado: estadoDeEjemplo, botCorriendo: undefined, puerto: ocupado.address().port, host: '127.0.0.1' });
      assert.strictEqual(r.escrito, false);
      assert.ok(!fs.existsSync(chatsViejos.ARCHIVO), 'sembró con el bot corriendo');
    } finally {
      ocupado.close();
    }
  });

  console.log('\n3. Primer arranque después de la semilla\n');

  await check('un chat que ya estaba en estado.json y tiene un mensaje en la ventana es viejo', async () => {
    limpiar();
    const en = Date.now() - 3600e3;
    await sembrarCon({ claves: [{ jid: jid(VIEJO), alt: null, desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 1 }], en });
    // Entró a estado.json después de la semilla (el bot seguía corriendo) y escribió el cliente.
    state.agregarAlHistorial(jid(CONOCIDO), 'cliente', 'hola');
    evo.registros = [guardado(jid(CONOCIDO), en + 600e3)];
    const escucha = Date.now() - 1000;
    await arrancar(escucha);
    assert.ok(evolution.estaEnLaLista(jid(CONOCIDO), chatsViejos.numeros()), 'en el primer arranque, cualquier mensaje de la ventana lo hace viejo');
    assert.strictEqual(archivo().viejos[CONOCIDO].motivo, 'mensaje entre la semilla y el primer arranque');
    assert.ok(archivo().semilla.primerArranque, 'no quedó anotado el primer arranque');
    assert.strictEqual(evo.pedidos[0].desde, en, 'la ventana tiene que empezar en la semilla');
    assert.strictEqual(evo.pedidos[0].hasta, escucha, 'la ventana tiene que terminar cuando empezó a escuchar');
    chatsViejos.detener();
  });

  console.log('\n4. Arranque siguiente\n');

  const ALDIA = Date.now() - 2 * 3600e3;
  const ESCUCHA = Date.now() - 60e3;
  const EN_LA_VENTANA = ALDIA + 30 * 60e3;

  await check('en un chat nuevo escribió una persona con el bot apagado: viejo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    state.agregarAlHistorial(jid(ATENDIDO), 'cliente', 'hola');
    evo.registros = [guardado(jid(ATENDIDO), EN_LA_VENTANA), guardado(jid(ATENDIDO), EN_LA_VENTANA + 60e3, { fromMe: true })];
    await arrancar(ESCUCHA);
    assert.ok(archivo().viejos[ATENDIDO], 'no quedó en la lista');
    assert.strictEqual(archivo().viejos[ATENDIDO].motivo, 'escribió alguien de la cuenta con el bot apagado');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(ATENDIDO)), false);
    chatsViejos.detener();
  });

  await check('en un chat nuevo que el bot conocía solo escribió el cliente: sigue nuevo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    state.agregarAlHistorial(jid(CONOCIDO + '0'), 'cliente', 'hola'); // otro, para no mezclar con el de arriba
    evo.registros = [guardado(jid(CONOCIDO + '0'), EN_LA_VENTANA), guardado(jid(CONOCIDO + '0'), EN_LA_VENTANA + 1000)];
    await arrancar(ESCUCHA);
    assert.ok(!archivo().viejos[CONOCIDO + '0'], 'lo marcó viejo');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(CONOCIDO + '0')), true);
    chatsViejos.detener();
  });

  await check('un chat desconocido que empezó con el bot apagado: viejo (el tester no entra)', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.registros = [guardado(jid(DESCONOCIDO), EN_LA_VENTANA), guardado(jid(TESTER), EN_LA_VENTANA, { fromMe: true })];
    await arrancar(ESCUCHA);
    assert.ok(!archivo().viejos[TESTER], 'el tester entró a la lista');
    assert.ok(archivo().viejos[DESCONOCIDO], 'no quedó en la lista');
    assert.strictEqual(archivo().viejos[DESCONOCIDO].motivo, 'empezó con el bot apagado');
    assert.strictEqual(archivo().viejos[DESCONOCIDO].desde, iso(Math.floor(EN_LA_VENTANA / 1000) * 1000));
    chatsViejos.detener();
  });

  await check('un envío del bot con id guardado dentro de la ventana no marca nada', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA, idsBot: ['ENVIO-DEL-BOT-1'] });
    state.agregarAlHistorial(jid(DEL_BOT), 'cliente', 'hola');
    evo.registros = [
      guardado(jid(DEL_BOT), EN_LA_VENTANA),
      guardado(jid(DEL_BOT), EN_LA_VENTANA + 5000, { fromMe: true, id: 'ENVIO-DEL-BOT-1' }),
    ];
    await arrancar(ESCUCHA);
    assert.ok(!archivo().viejos[DEL_BOT], 'un envío del bot lo marcó viejo');
    chatsViejos.detener();
  });

  await check('lee todas las páginas de la ventana, y fuera de la ventana no cuenta', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.registros = [
      ...[1, 2, 3, 4, 5].map((i) => guardado(jid('549000000010' + i), EN_LA_VENTANA + i * 1000)),
      guardado(jid('5490000000200'), ALDIA - 60e3), // antes de alDia
      guardado(jid('5490000000201'), ESCUCHA + 60e3), // después de empezar a escuchar: es del webhook
    ];
    await arrancar(ESCUCHA, { porPagina: 2 });
    for (const i of [1, 2, 3, 4, 5]) assert.ok(archivo().viejos['549000000010' + i], `faltó el de la página de ${i}`);
    assert.ok(!archivo().viejos['5490000000200'] && !archivo().viejos['5490000000201'], 'contó un mensaje fuera de la ventana');
    assert.strictEqual(evo.pedidos.length, 3, 'tenían que ser 3 páginas de 2');
    chatsViejos.detener();
  });

  await check('un @lid en la ventana se guarda por número (alt o mapeo) y el que no se traduce se cuenta en el log', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA, lids: { 10000000000021: '5490000000021' } });
    evo.registros = [
      guardado('10000000000020@lid', EN_LA_VENTANA, { alt: jid('5490000000020') }),
      guardado('10000000000021@lid', EN_LA_VENTANA),
      guardado('10000000000022@lid', EN_LA_VENTANA),
    ];
    const lineas = await conLogs(() => arrancar(ESCUCHA));
    const d = archivo();
    assert.ok(d.viejos['5490000000020'], 'el @lid con alt no quedó por número');
    assert.ok(d.viejos['5490000000021'], 'el @lid del mapeo no quedó por número');
    assert.strictEqual(d.lids['10000000000020'], '5490000000020', 'no aprendió el mapeo del alt');
    assert.strictEqual(d.lids['10000000000022'], null);
    assert.ok(lineas.some((l) => /@lid sin traducir: 1\b/.test(l)), 'el log no dice los @lid sin traducir:\n' + lineas.join('\n'));
    chatsViejos.detener();
  });

  await check('al arrancar, el log dice "CHATS VIEJOS: N en la lista, al día hasta DD/MM HH:MM", y /salud lo mismo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO, EN_ESTADO], alDia: ALDIA });
    const lineas = await conLogs(() => arrancar(ESCUCHA));
    const d = archivo();
    // Hora argentina (UTC-3, sin horario de verano), con ceros: 05/09 08:04.
    const ar = new Date(Date.parse(d.alDia) - 3 * 3600e3);
    const dos = (n) => String(n).padStart(2, '0');
    const esperada =
      `CHATS VIEJOS: 2 en la lista, al día hasta ${dos(ar.getUTCDate())}/${dos(ar.getUTCMonth() + 1)} ` +
      `${dos(ar.getUTCHours())}:${dos(ar.getUTCMinutes())}`;
    assert.ok(lineas.includes(esperada), `el log no dice "${esperada}":\n` + lineas.join('\n'));
    servidor = bot.escuchar(0, '127.0.0.1');
    await new Promise((r) => servidor.once('listening', r));
    try {
      const salud = await pedirSalud();
      assert.ok(salud.chatsViejos, '/salud no muestra los chats viejos');
      assert.strictEqual(salud.chatsViejos.texto, esperada);
      assert.strictEqual(salud.chatsViejos.enLista, 2);
      assert.strictEqual(salud.chatsViejos.estado, 'al día');
    } finally {
      servidor.close();
    }
    chatsViejos.detener();
  });

  console.log('\n2. SOLO_CHATS_NUEVOS con NUMEROS_PILOTO=todos y la lista al día\n');

  await check('viejo → borrador; nuevo desde cero → en vivo; tester → en vivo siempre', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    assert.strictEqual(config.pilotoTodos && config.soloChatsNuevos, true, 'el caso no prueba nada sin piloto todos y SOLO_CHATS_NUEVOS');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(VIEJO)), false);
    assert.strictEqual(evolution.leLlegaAlCliente(jid(VIEJO)), false);
    assert.strictEqual(evolution.esDestinoDePrueba(jid(NUEVO)), true);
    assert.strictEqual(evolution.esDestinoDePrueba(jid(TESTER)), true);
    await bot.procesar(escrito(VIEJO, 'hola tenes el iphone 13?'));
    await bot.procesar(escrito(NUEVO, 'hola tenes el iphone 13?'));
    await bot.procesar(escrito(TESTER, 'hola tenes el iphone 13?'));
    await dormir(300);
    assert.ok(!leLlego(VIEJO), 'le escribió a un chat viejo');
    assert.ok(leLlego(NUEVO), 'no le contestó a un chat nuevo');
    assert.ok(leLlego(TESTER), 'no le contestó al tester');
    chatsViejos.detener();
  });

  await check('un chat que atendió una persona sigue siendo viejo aunque no esté en la lista', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    state.agregarAlHistorial(jid('5490000000030'), 'vendedor', 'hola, soy fran', { humano: true });
    assert.strictEqual(evolution.esDestinoDePrueba(jid('5490000000030')), false);
    chatsViejos.detener();
  });

  console.log('\n5. Por el webhook, después de arrancar\n');

  await check('un chat que empieza por el webhook después del arranque es nuevo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    await bot.procesar(escrito(OTRO_NUEVO, 'hola tenes el iphone 13?'));
    await dormir(300);
    assert.ok(leLlego(OTRO_NUEVO), 'no le contestó a un chat que empezó con el bot mirando');
    assert.ok(!archivo().viejos[OTRO_NUEVO], 'lo puso en la lista');
    chatsViejos.detener();
  });

  console.log('\n5b. Envíos confirmados y el reloj de alDia\n');

  await check('cada envío confirmado guarda su id (los últimos 200) y mueve alDia', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    const antes = Date.parse(archivo().alDia);
    await dormir(20);
    await bot.procesar(escrito('5490000000031', 'hola tenes el iphone 13?'));
    await dormir(300);
    const enviados = idEnvio;
    const d = archivo();
    assert.ok(d.idsBot.includes('EV' + enviados), 'no guardó el id del envío: ' + d.idsBot.join(','));
    assert.ok(Date.parse(d.alDia) > antes, 'alDia no avanzó con el envío');
    // 200 desde el 29/09 (caída de Evolution): la ventana de la vuelta puede tener muchos envíos.
    assert.strictEqual(chatsViejos.MAX_IDS_BOT, 200);
    for (let i = 0; i < 210; i++) chatsViejos.envioConfirmado('X' + i);
    const ids = archivo().idsBot;
    assert.strictEqual(ids.length, 200);
    assert.strictEqual(ids[199], 'X209');
    chatsViejos.detener();
  });

  await check('alDia avanza solo, cada tanto, mientras está al día', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { tickMs: 30 });
    const antes = Date.parse(archivo().alDia);
    await dormir(120);
    assert.ok(Date.parse(archivo().alDia) > antes, 'alDia no avanzó con el reloj');
    chatsViejos.detener();
  });

  console.log('\n6. Si no puede ponerse al día\n');

  await check('Evolution no responde: todo en borrador salvo el tester, un solo aviso, reintento, y alDia quieto', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.falla = 'fetch failed (ECONNREFUSED)';
    await arrancar(ESCUCHA, { reintentoMs: 40, tickMs: 15 });
    assert.strictEqual(evolution.esDestinoDePrueba(jid(NUEVO)), false, 'sin ponerse al día, un chat nuevo tiene que ir en borrador');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(TESTER)), true, 'el tester siempre recibe');
    await bot.procesar(escrito(NUEVO, 'hola tenes el iphone 13?'));
    await dormir(250);
    assert.ok(!leLlego(NUEVO), 'le escribió en vivo sin estar al día');
    assert.ok(evo.pedidos.length >= 3, `no reintentó (${evo.pedidos.length} pedidos)`);
    const avisos = alGrupo.filter((t) => t.startsWith('⚠️'));
    assert.deepStrictEqual(avisos, ['⚠️ No pude ponerme al día con Evolution (chats viejos). Hasta que lo logre, todo va en borrador salvo el tester.']);
    assert.strictEqual(archivo().alDia, iso(ALDIA), 'alDia avanzó sin estar al día');
    assert.strictEqual(chatsViejos.resumen().estado, 'atrasado');

    evo.falla = null;
    await dormir(150);
    assert.deepStrictEqual(
      alGrupo.filter((t) => t.startsWith('✅')),
      ['✅ Me puse al día con Evolution: vuelvo a contestar los chats nuevos.']
    );
    assert.ok(Date.parse(archivo().alDia) > ALDIA, 'alDia no avanzó al ponerse al día');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(NUEVO)), true);
    assert.strictEqual(alGrupo.filter((t) => t.startsWith('⚠️')).length, 1, 'volvió a avisar');
    chatsViejos.detener();
  });

  await check('falta la semilla: todo en borrador salvo el tester y avisa; cuando aparece, se pone al día', async () => {
    limpiar();
    try {
      fs.unlinkSync(chatsViejos.ARCHIVO);
    } catch {
      /* no estaba */
    }
    await arrancar(ESCUCHA, { reintentoMs: 40 });
    assert.strictEqual(evolution.esDestinoDePrueba(jid(NUEVO)), false);
    assert.strictEqual(evolution.esDestinoDePrueba(jid(TESTER)), true);
    await dormir(100);
    assert.deepStrictEqual(alGrupo, [
      '⚠️ Falta la lista de chats viejos (npm run sembrar-viejos). Hasta que exista, todo va en borrador salvo el tester.',
    ]);
    assert.ok(!fs.existsSync(chatsViejos.ARCHIVO), 'creó la lista sin semilla');
    await sembrarCon({ claves: [{ jid: jid(VIEJO), alt: null, desde: Math.floor(HACE_UN_ANIO / 1000), mensajes: 1 }], en: ALDIA });
    await dormir(150);
    assert.ok(alGrupo.some((t) => t.startsWith('✅')), 'no avisó que se puso al día');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(NUEVO)), true);
    assert.strictEqual(evolution.esDestinoDePrueba(jid(VIEJO)), false);
    chatsViejos.detener();
  });

  // Agregado defensivo: una lista dañada no se pisa (queda para mirarla) y se trata como si
  // faltara, que es lo que la arregla (volver a sembrar).
  await check('la lista dañada: no la pisa, avisa que falta y todo va en borrador salvo el tester', async () => {
    limpiar();
    fs.writeFileSync(chatsViejos.ARCHIVO, '{"viejos": {"5490000');
    await arrancar(ESCUCHA, { tickMs: 15 });
    for (let i = 0; i < 20; i++) chatsViejos.envioConfirmado('Y' + i);
    await dormir(60);
    assert.strictEqual(fs.readFileSync(chatsViejos.ARCHIVO, 'utf8'), '{"viejos": {"5490000', 'pisó la lista dañada');
    assert.deepStrictEqual(alGrupo, [chatsViejos.AVISO_SIN_SEMILLA]);
    assert.strictEqual(evolution.esDestinoDePrueba(jid(NUEVO)), false);
    assert.strictEqual(evolution.esDestinoDePrueba(jid(TESTER)), true);
    assert.ok(/no pude leer chats-viejos\.json/.test(chatsViejos.resumen().motivo), chatsViejos.resumen().motivo);
    chatsViejos.detener();
  });

  console.log('\n7. Un mensaje que llega mientras se pone al día\n');

  await check('espera y se decide con la lista completa', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.demora = 250;
    const puesta = arrancar(ESCUCHA);
    await Promise.all([
      bot.procesar(escrito('5490000000040', 'hola tenes el iphone 13?')),
      bot.procesar(escrito(VIEJO, 'hola tenes el iphone 13?')),
    ]);
    await puesta;
    await dormir(300);
    assert.ok(leLlego('5490000000040'), 'un chat nuevo que escribió durante la puesta al día quedó en borrador');
    assert.ok(!leLlego(VIEJO), 'le escribió a un chat viejo');
    chatsViejos.detener();
  });

  await check('la espera tiene tope: pasado, se decide sin la lista (borrador)', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.demora = 600;
    const puesta = arrancar(ESCUCHA, { esperaMaxMs: 50 });
    await bot.procesar(escrito('5490000000041', 'hola tenes el iphone 13?'));
    await dormir(200);
    assert.ok(!leLlego('5490000000041'), 'le escribió en vivo sin estar al día');
    await puesta;
    chatsViejos.detener();
  });

  console.log('\n8. SOLO_CHATS_NUEVOS apagado\n');

  await check('no cambia quién recibe, no avisa, y la puesta al día corre igual', async () => {
    limpiar();
    const antes = config.soloChatsNuevos;
    config.soloChatsNuevos = false;
    try {
      escribirLista({ viejos: [VIEJO], alDia: ALDIA });
      evo.falla = 'fetch failed (ECONNREFUSED)';
      const lineas = await conLogs(async () => {
        await arrancar(ESCUCHA, { reintentoMs: 40 });
        await dormir(120);
      });
      assert.strictEqual(evolution.esDestinoDePrueba(jid(VIEJO)), true);
      assert.strictEqual(evolution.esDestinoDePrueba(jid(NUEVO)), true);
      assert.strictEqual(alGrupo.length, 0, 'avisó al grupo con SOLO_CHATS_NUEVOS apagado');
      assert.ok(evo.pedidos.length >= 2, 'no reintentó');
      assert.ok(lineas.some((l) => /CHATS VIEJOS: no pude ponerme al día/.test(l)), 'no lo dejó en el log:\n' + lineas.join('\n'));
      await bot.procesar(escrito(VIEJO, 'hola tenes el iphone 13?'));
      await dormir(300);
      assert.ok(leLlego(VIEJO), 'dejó de contestarle a un chat viejo con SOLO_CHATS_NUEVOS apagado');
      evo.falla = null;
      evo.registros = [guardado(jid(DESCONOCIDO + '9'), EN_LA_VENTANA)];
      await dormir(150);
      assert.ok(archivo().viejos[DESCONOCIDO + '9'], 'no completó la lista con SOLO_CHATS_NUEVOS apagado');
      assert.strictEqual(alGrupo.length, 0, 'avisó al grupo al ponerse al día con SOLO_CHATS_NUEVOS apagado');
    } finally {
      config.soloChatsNuevos = antes;
      chatsViejos.detener();
    }
  });

  console.log('\n10. Caída de Evolution con el bot andando (29/09/2026)\n');

  // Si Evolution se cae con el bot andando (el guardián abre un corte), chats viejos frena alDia
  // en la última señal buena; a la vuelta espera 2 minutos y se pone al día de alDia hasta ahora.
  // El guardián es el de verdad y el cableado, el de index.js (`revisarGuardian`), con el reloj
  // simulado de cada barrido; Evolution, la de mentira de arriba.
  const MIN = 60e3;
  const barrer = (ahora) => bot.revisarGuardian(ahora);
  /** Un barrido que lee open (la última señal buena) y, 5 minutos después, el corte. */
  async function cortarInstancia(ultimoOpen, estado = 'close') {
    evo.instancia = 'open';
    await barrer(ultimoOpen);
    evo.instancia = estado;
    await barrer(ultimoOpen + 5 * MIN);
  }
  async function volverInstancia(ahora = Date.now()) {
    evo.instancia = 'open';
    await barrer(ahora);
  }
  // Al mismo grupo van los avisos del guardián y los borradores: acá se miran los de chats viejos.
  const deChatsViejos = () =>
    alGrupo.filter((t) => !/^(⚠️ Evolution|✅ Evolution volvió|✅ Volvieron a llegar|🔔|🔕)/.test(t));
  function pedirWebhook(cuerpo) {
    return new Promise((resolve, reject) => {
      const datos = JSON.stringify(cuerpo);
      const req = http.request(
        {
          host: '127.0.0.1',
          port: servidor.address().port,
          method: 'POST',
          path: '/webhook',
          headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(datos) },
        },
        (res) => {
          res.resume();
          res.on('end', () => resolve(res.statusCode));
        }
      );
      req.on('error', reject);
      req.end(datos);
    });
  }
  let idEntra = 0;
  /** Entra un mensaje por el webhook (un estado: el bot no contesta). Devuelve su hora, la de /salud. */
  async function entra() {
    const status = await pedirWebhook({
      event: 'messages.upsert',
      instance: 'instancia-de-prueba',
      data: { key: { remoteJid: 'status@broadcast', fromMe: false, id: 'ENTRA-' + ++idEntra }, message: { conversation: 'x' } },
    });
    assert.strictEqual(status, 200, 'el webhook no recibió el mensaje');
    const ts = Date.parse((await pedirSalud()).ultimoEntrante);
    assert.ok(ts, 'el caso no prueba nada: /salud no dice cuándo entró el último mensaje');
    return ts;
  }
  /** Al tester, con el chat limpio: una respuesta repetida se filtra y no saldría nada. */
  async function alTester(texto) {
    state.reiniciar(jid(TESTER));
    await bot.procesar(escrito(TESTER, texto));
  }

  servidor = bot.escuchar(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));

  // Prueba 1 del pedido.
  await check('corte de la instancia: alDia vuelve al último barrido que leyó open y el reloj no lo mueve; listo() da false', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { tickMs: 20 });
    assert.strictEqual(chatsViejos.listo(), true, 'el caso no prueba nada: no arrancó al día');
    const ultimoOpen = Date.now() - 20 * MIN;
    await cortarInstancia(ultimoOpen);
    assert.ok(alGrupo.some((t) => t.startsWith('⚠️ Evolution: la instancia dice close')), 'el caso no prueba nada: el guardián no abrió el corte');
    assert.strictEqual(archivo().alDia, iso(ultimoOpen), 'alDia no volvió al último barrido que leyó open');
    await dormir(100);
    assert.strictEqual(archivo().alDia, iso(ultimoOpen), 'el reloj movió alDia durante el corte');
    assert.strictEqual(chatsViejos.listo(), false, 'listo() tiene que dar false durante el corte');
    assert.strictEqual(chatsViejos.resumen().estado, 'atrasado');
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (instancia close)');
    chatsViejos.detener();
  });

  await check('corte de la instancia sin ningún barrido en open desde que arrancó el bot: alDia vuelve al arranque', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    evo.instancia = null; // Evolution no responde
    await barrer(Date.now());
    const arranque = (await pedirSalud()).version.arranque;
    assert.strictEqual(archivo().alDia, arranque, 'alDia no volvió al arranque del bot');
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (instancia sin respuesta)');
    chatsViejos.detener();
  });

  await check('durante el corte, con SOLO_CHATS_NUEVOS=true, un chat nuevo va en borrador y el tester sigue en vivo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    await cortarInstancia(Date.now() - 20 * MIN);
    const nuevo = '5490000000050';
    assert.strictEqual(evolution.esDestinoDePrueba(jid(nuevo)), false, 'un chat nuevo tiene que ir en borrador durante el corte');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(TESTER)), true, 'el tester siempre recibe');
    await bot.procesar(escrito(nuevo, 'hola tenes el iphone 13?'));
    await alTester('hola tenes el iphone 13?');
    await dormir(300);
    assert.ok(!leLlego(nuevo), 'le escribió en vivo a un chat nuevo durante el corte');
    assert.ok(leLlego(TESTER), 'no le contestó al tester durante el corte');
    chatsViejos.detener();
  });

  // Prueba 2 del pedido.
  await check('corte del webhook: alDia vuelve a la hora del último mensaje que entró', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { tickMs: 20 });
    const entro = await entra();
    await dormir(60); // el reloj lleva alDia más allá del mensaje, como en la vida real
    assert.ok(Date.parse(archivo().alDia) > entro, 'el caso no prueba nada: alDia no pasó el último mensaje');
    await barrer(entro + 50 * MIN);
    assert.ok(
      alGrupo.some((t) => t.startsWith('⚠️ Evolution dice open pero no llega')),
      'el caso no prueba nada: el guardián no abrió el corte del webhook: ' + JSON.stringify(alGrupo)
    );
    assert.strictEqual(archivo().alDia, iso(entro), 'alDia no volvió a la hora del último mensaje que entró');
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (no llega nada por el webhook)');
    assert.strictEqual(chatsViejos.listo(), false);
    chatsViejos.detener();
  });

  await check('/salud y la línea CHATS VIEJOS muestran el atrasado con su motivo, en el corte y en la espera de la vuelta', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 1e7 });
    const ultimoOpen = Date.now() - 20 * MIN;
    const lineas = await conLogs(() => cortarInstancia(ultimoOpen));
    // Hora argentina (UTC-3, sin horario de verano), con ceros.
    const ar = new Date(ultimoOpen - 3 * 3600e3);
    const dos = (n) => String(n).padStart(2, '0');
    const hasta = `${dos(ar.getUTCDate())}/${dos(ar.getUTCMonth() + 1)} ${dos(ar.getUTCHours())}:${dos(ar.getUTCMinutes())}`;
    const esperada = `CHATS VIEJOS: atrasado (Evolution caído (instancia close)); 1 en la lista, al día hasta ${hasta}`;
    assert.ok(lineas.includes(esperada), `el log no dice "${esperada}":\n` + lineas.join('\n'));
    let s = (await pedirSalud()).chatsViejos;
    assert.strictEqual(s.texto, esperada);
    assert.strictEqual(s.estado, 'atrasado');
    assert.strictEqual(s.motivo, 'Evolution caído (instancia close)');
    assert.strictEqual(s.alDia, iso(ultimoOpen));
    await volverInstancia();
    s = (await pedirSalud()).chatsViejos;
    assert.strictEqual(s.estado, 'atrasado', 'en la espera de la vuelta tiene que seguir atrasado');
    assert.ok(/^Evolution volvió: me pongo al día a las \d\d:\d\d$/.test(s.motivo), 'el motivo de la espera: ' + s.motivo);
    chatsViejos.detener();
  });

  // Prueba 5 del pedido.
  await check('un envío confirmado durante el corte guarda su id y no mueve alDia', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    const ultimoOpen = Date.now() - 20 * MIN;
    await cortarInstancia(ultimoOpen);
    chatsViejos.envioConfirmado('EV-DURANTE-EL-CORTE');
    await alTester('hola, tenes el iphone 13?');
    await dormir(300);
    assert.ok(leLlego(TESTER), 'el caso no prueba nada: el tester no recibió');
    const d = archivo();
    assert.strictEqual(d.alDia, iso(ultimoOpen), 'un envío confirmado movió alDia durante el corte');
    assert.ok(d.idsBot.includes('EV-DURANTE-EL-CORTE'), 'no guardó el id');
    assert.ok(d.idsBot.includes('EV' + idEnvio), 'no guardó el id del envío al tester');
    chatsViejos.detener();
  });

  // Prueba 6 del pedido.
  await check('durante el corte chats viejos no manda ningún aviso propio, ni aunque falle la puesta al día que venía corriendo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.falla = 'fetch failed (ECONNREFUSED)';
    evo.demora = 100;
    const puesta = arrancar(ESCUCHA, { reintentoMs: 40 });
    await cortarInstancia(Date.now() - 20 * MIN);
    await puesta;
    await dormir(150);
    assert.ok(alGrupo.some((t) => t.startsWith('⚠️ Evolution: la instancia dice close')), 'el caso no prueba nada: el guardián no avisó');
    assert.deepStrictEqual(deChatsViejos(), [], 'chats viejos avisó durante el corte');
    assert.strictEqual(evo.pedidos.length, 1, 'reintentó durante el corte');
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (instancia close)');
    chatsViejos.detener();
  });

  // Prueba 3 del pedido: un corte con cuatro chats, y la vuelta.
  const C = { persona: '5490000000051', durante: '5490000000052', conocido: '5490000000053', delBot: '5490000000054' };
  const vuelta = {};
  await check('la vuelta espera 2 minutos (acá, 150 ms) y se pone al día de alDia hasta ahora; queda al día y vuelve el reloj', async () => {
    assert.strictEqual(chatsViejos.VUELTA_MS, 2 * 60 * 1000, 'la espera de la vuelta tiene que ser de 2 minutos');
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    for (const n of [C.persona, C.conocido, C.delBot]) state.agregarAlHistorial(jid(n), 'cliente', 'hola');
    await arrancar(ESCUCHA, { vueltaMs: 150, tickMs: 30 });
    // Un envío del bot de antes del corte y 120 más: con los 50 ids de antes, el primero se perdía.
    chatsViejos.envioConfirmado('ENVIO-ANTES-DEL-CORTE');
    for (let i = 0; i < 120; i++) chatsViejos.envioConfirmado('OTRO-ENVIO-' + i);
    const ultimoOpen = Date.now() - 30 * MIN;
    await cortarInstancia(ultimoOpen);
    evo.registros = [
      guardado(jid(C.delBot), ultimoOpen + 1 * MIN, { fromMe: true, id: 'ENVIO-ANTES-DEL-CORTE' }),
      guardado(jid(C.persona), ultimoOpen + 2 * MIN),
      guardado(jid(C.persona), ultimoOpen + 3 * MIN, { fromMe: true }), // alguien de la cuenta, desde el teléfono
      guardado(jid(C.durante), ultimoOpen + 4 * MIN), // empezó durante el corte, sin el bot mirando
      guardado(jid(C.conocido), ultimoOpen + 5 * MIN),
      guardado(jid(C.conocido), ultimoOpen + 6 * MIN),
      guardado(jid(C.delBot), ultimoOpen + 7 * MIN),
    ];
    const antes = evo.pedidos.length;
    const volvio = Date.now();
    await volverInstancia(volvio);
    await dormir(60);
    assert.strictEqual(evo.pedidos.length, antes, 'no esperó a que Evolution termine de guardar lo del corte');
    assert.strictEqual(chatsViejos.listo(), false, 'en la espera de la vuelta tiene que seguir atrasado');
    await dormir(300);
    assert.strictEqual(evo.pedidos.length, antes + 1, `no se puso al día a la vuelta (${evo.pedidos.length - antes} pedidos)`);
    const q = evo.pedidos[antes];
    assert.strictEqual(q.desde, ultimoOpen, 'la ventana tiene que empezar en alDia (la última señal buena)');
    assert.ok(q.hasta >= volvio + 100, 'la ventana tiene que ir hasta ahora, no hasta que empezó a escuchar: ' + iso(q.hasta));
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    const alDia = Date.parse(archivo().alDia);
    assert.ok(alDia >= q.hasta, 'alDia no quedó en ahora');
    vuelta.d = archivo();
    vuelta.destino = Object.fromEntries(Object.entries(C).map(([k, n]) => [k, evolution.esDestinoDePrueba(jid(n))]));
    await dormir(100);
    assert.ok(Date.parse(archivo().alDia) > alDia, 'el reloj no volvió a mover alDia');
    assert.deepStrictEqual(deChatsViejos(), [], 'chats viejos avisó al grupo en una vuelta que salió bien');
    chatsViejos.detener();
  });

  await check('vuelta: en un chat nuevo escribió una persona de la cuenta durante el corte → viejo', () => {
    assert.ok(vuelta.d, 'no hubo vuelta');
    assert.ok(vuelta.d.viejos[C.persona], 'no quedó en la lista');
    assert.strictEqual(vuelta.d.viejos[C.persona].motivo, 'escribió alguien de la cuenta durante un corte de Evolution');
    assert.strictEqual(vuelta.destino.persona, false);
  });

  await check('vuelta: un chat que empezó durante el corte y no está en estado.json → viejo', () => {
    assert.ok(vuelta.d, 'no hubo vuelta');
    assert.ok(vuelta.d.viejos[C.durante], 'no quedó en la lista');
    assert.strictEqual(vuelta.d.viejos[C.durante].motivo, 'empezó durante un corte de Evolution');
    assert.strictEqual(vuelta.destino.durante, false);
  });

  await check('vuelta: un chat conocido donde solo escribió el cliente sigue nuevo', () => {
    assert.ok(vuelta.d, 'no hubo vuelta');
    assert.ok(!vuelta.d.viejos[C.conocido], 'lo marcó viejo');
    assert.strictEqual(vuelta.destino.conocido, true);
  });

  await check('vuelta: un envío del bot con id guardado, de antes del corte, no marca nada (aunque haya 120 envíos después)', () => {
    assert.ok(vuelta.d, 'no hubo vuelta');
    assert.ok(!vuelta.d.viejos[C.delBot], 'un envío del bot lo marcó viejo');
    assert.ok(vuelta.d.idsBot.includes('ENVIO-ANTES-DEL-CORTE'), 'se perdió el id del envío');
    assert.strictEqual(vuelta.destino.delBot, true);
  });

  // Prueba 4 del pedido.
  await check('la puesta al día de la vuelta falla: reintenta hasta ahora, alDia quieto y un solo ⚠️ con SOLO_CHATS_NUEVOS=true; al lograrlo, el ✅', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 30, reintentoMs: 50 });
    const ultimoOpen = Date.now() - 20 * MIN;
    await cortarInstancia(ultimoOpen);
    evo.falla = 'fetch failed (ECONNREFUSED)';
    const n = evo.pedidos.length;
    const volvio = Date.now();
    await volverInstancia(volvio);
    await dormir(250);
    const pedidos = evo.pedidos.slice(n);
    assert.ok(pedidos.length >= 2, `no reintentó (${pedidos.length} pedido/s)`);
    assert.ok(pedidos.every((q) => q.desde === ultimoOpen), 'la ventana tiene que empezar en alDia');
    assert.ok(pedidos[0].hasta >= volvio, 'la vuelta tiene que pedir hasta ahora');
    assert.ok(pedidos[pedidos.length - 1].hasta > pedidos[0].hasta, 'el reintento tiene que pedir hasta ahora, no hasta la vuelta');
    assert.strictEqual(archivo().alDia, iso(ultimoOpen), 'alDia se movió sin ponerse al día');
    assert.strictEqual(chatsViejos.resumen().estado, 'atrasado');
    assert.deepStrictEqual(deChatsViejos(), [chatsViejos.AVISO_EVOLUTION], 'tenía que avisar una sola vez');
    evo.falla = null;
    await dormir(150);
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.deepStrictEqual(deChatsViejos(), [chatsViejos.AVISO_EVOLUTION, chatsViejos.AVISO_AL_DIA]);
    chatsViejos.detener();
  });

  // Prueba 7 del pedido.
  await check('con SOLO_CHATS_NUEVOS apagado, el corte no cambia a quién le escribe ni avisa: solo lo loguea (y alDia se frena igual)', async () => {
    limpiar();
    const antes = config.soloChatsNuevos;
    config.soloChatsNuevos = false;
    try {
      escribirLista({ viejos: [VIEJO], alDia: ALDIA });
      await arrancar(ESCUCHA, { vueltaMs: 30 });
      const ultimoOpen = Date.now() - 20 * MIN;
      const lineas = await conLogs(() => cortarInstancia(ultimoOpen));
      assert.ok(
        lineas.some((l) => /^CHATS VIEJOS: Evolution caído \(instancia close\)\..*SOLO_CHATS_NUEVOS está apagado/.test(l)),
        'no lo dejó en el log:\n' + lineas.join('\n')
      );
      const nuevo = '5490000000055';
      assert.strictEqual(evolution.esDestinoDePrueba(jid(VIEJO)), true);
      assert.strictEqual(evolution.esDestinoDePrueba(jid(nuevo)), true);
      await bot.procesar(escrito(nuevo, 'hola tenes el iphone 13?'));
      await dormir(300);
      assert.ok(leLlego(nuevo), 'dejó de contestarle a un chat nuevo con SOLO_CHATS_NUEVOS apagado');
      assert.strictEqual(archivo().alDia, iso(ultimoOpen), 'apagado, alDia también se frena: la lista tiene que estar completa cuando se prenda');
      await volverInstancia();
      await dormir(150);
      assert.strictEqual(evo.pedidos.length, 2, 'apagado, la vuelta también se pone al día');
      assert.strictEqual(chatsViejos.resumen().estado, 'al día');
      assert.deepStrictEqual(deChatsViejos(), [], 'avisó al grupo con SOLO_CHATS_NUEVOS apagado');
    } finally {
      config.soloChatsNuevos = antes;
      chatsViejos.detener();
    }
  });

  // Prueba 8 del pedido.
  await check('reinicio en medio del corte: alDia quedó quieto en el archivo y el arranque cubre desde ahí', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA);
    const ultimoOpen = Date.now() - 20 * MIN;
    await cortarInstancia(ultimoOpen);
    // Se cae el bot: queda el archivo; el guardián vive en memoria.
    chatsViejos.detener();
    guardian.reiniciar();
    const empezo = '5490000000056';
    evo.registros = [guardado(jid(empezo), ultimoOpen + 3 * MIN)];
    const n = evo.pedidos.length;
    const escucha = Date.now();
    await arrancar(escucha);
    assert.strictEqual(evo.pedidos[n].desde, ultimoOpen, 'el arranque no cubrió desde el alDia quieto');
    assert.strictEqual(evo.pedidos[n].hasta, escucha);
    assert.ok(archivo().viejos[empezo], 'un chat que empezó durante el corte quedó como nuevo');
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    chatsViejos.detener();
  });

  console.log('\n10b. Casos borde de la caída\n');

  await check('un corte con la puesta al día del arranque fallando: deja de reintentar, y a la vuelta se pone al día hasta ahora con un solo ⚠️ y su ✅', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    const apagado = '5490000000061';
    evo.registros = [guardado(jid(apagado), EN_LA_VENTANA)]; // con el bot apagado, antes del arranque
    evo.falla = 'fetch failed (ECONNREFUSED)';
    await arrancar(ESCUCHA, { reintentoMs: 40, vueltaMs: 30 });
    assert.deepStrictEqual(deChatsViejos(), [chatsViejos.AVISO_EVOLUTION], 'el caso no prueba nada: no falló el arranque');
    await cortarInstancia(Date.now() - 20 * MIN);
    const n = evo.pedidos.length;
    await dormir(150);
    assert.strictEqual(evo.pedidos.length, n, 'siguió reintentando durante el corte');
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (instancia close)');
    assert.strictEqual(archivo().alDia, iso(ALDIA), 'alDia se movió');
    evo.falla = null;
    const volvio = Date.now();
    await volverInstancia(volvio);
    await dormir(150);
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.strictEqual(evo.pedidos[n].desde, ALDIA, 'la ventana tiene que empezar en alDia');
    assert.ok(evo.pedidos[n].hasta >= volvio, 'la ventana tiene que ir hasta ahora, no hasta que empezó a escuchar');
    assert.deepStrictEqual(deChatsViejos(), [chatsViejos.AVISO_EVOLUTION, chatsViejos.AVISO_AL_DIA]);
    // La ventana empieza antes del arranque: el motivo es el de siempre, no el del corte.
    assert.strictEqual(archivo().viejos[apagado] && archivo().viejos[apagado].motivo, 'empezó con el bot apagado');
    chatsViejos.detener();
  });

  await check('una puesta al día lenta que empezó antes del corte y termina después de la vuelta no deja al día: la vuelta mira desde la última señal buena', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.demora = 250;
    const puesta = arrancar(ESCUCHA, { vueltaMs: 30 });
    const ultimoOpen = Date.now() - 20 * MIN;
    await cortarInstancia(ultimoOpen);
    await volverInstancia(); // la espera de la vuelta termina antes que la puesta al día del arranque
    await puesta;
    await dormir(400);
    assert.strictEqual(evo.pedidos.length, 2, 'la vuelta no se puso al día después de la del arranque');
    assert.strictEqual(evo.pedidos[1].desde, ultimoOpen, 'la vuelta tiene que mirar desde la última señal buena');
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    chatsViejos.detener();
  });

  await check('después de ponerse al día a la vuelta, el corte siguiente frena alDia en su propia señal', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 30, tickMs: 20 });
    await cortarInstancia(Date.now() - 40 * MIN);
    await volverInstancia();
    await dormir(150);
    assert.strictEqual(chatsViejos.resumen().estado, 'al día', 'el caso no prueba nada: no se puso al día');
    const segundo = Date.now() - MIN;
    await cortarInstancia(segundo);
    assert.strictEqual(archivo().alDia, iso(segundo), 'alDia quedó en el corte anterior');
    chatsViejos.detener();
  });

  await check('un corte nunca mueve alDia hacia adelante: con la última señal buena después de alDia, queda donde estaba', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA); // sin que corra el reloj: alDia queda en el arranque
    const alDia = archivo().alDia;
    const entro = await entra();
    assert.ok(entro > Date.parse(alDia), 'el caso no prueba nada: el mensaje no es posterior a alDia');
    await barrer(entro + 50 * MIN);
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (no llega nada por el webhook)', 'el caso no prueba nada: no se abrió el corte');
    assert.strictEqual(archivo().alDia, alDia, 'el corte movió alDia hacia adelante');
    chatsViejos.detener();
  });

  // Agregado defensivo: si no pudo guardar alDia al abrir el corte (en Windows, un antivirus o un
  // editor), la vuelta igual mira desde la última señal buena y no desde lo que quedó en el archivo.
  await check('si no pudo guardar alDia al abrir el corte, la vuelta igual mira desde la última señal buena', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 30 });
    const enArchivo = archivo().alDia;
    const ultimoOpen = Date.now() - 20 * MIN;
    const renombrar = fs.renameSync;
    fs.renameSync = (de, a) => {
      if (String(a) === chatsViejos.ARCHIVO) throw Object.assign(new Error('no se pudo escribir'), { code: 'EIO' });
      return renombrar(de, a);
    };
    try {
      await cortarInstancia(ultimoOpen);
    } finally {
      fs.renameSync = renombrar;
    }
    assert.strictEqual(archivo().alDia, enArchivo, 'el caso no prueba nada: guardó igual');
    await volverInstancia();
    await dormir(150);
    assert.strictEqual(evo.pedidos.length, 2, 'no se puso al día a la vuelta');
    assert.strictEqual(evo.pedidos[1].desde, ultimoOpen, 'la vuelta miró desde lo que quedó en el archivo');
    chatsViejos.detener();
  });

  await check('un corte en medio de la puesta al día del arranque: termina sin quedar al día y alDia no pasa de la última señal buena', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    evo.registros = [guardado(jid('5490000000060'), EN_LA_VENTANA)];
    evo.demora = 150;
    const puesta = arrancar(ESCUCHA, { tickMs: 20 });
    const ultimoOpen = Date.now() - 20 * MIN;
    await cortarInstancia(ultimoOpen);
    await puesta;
    await dormir(80);
    assert.ok(archivo().viejos['5490000000060'], 'no guardó lo que miró');
    assert.strictEqual(chatsViejos.listo(), false, 'quedó al día con el corte abierto');
    assert.strictEqual(archivo().alDia, iso(ultimoOpen), 'alDia pasó la última señal buena');
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (instancia close)');
    chatsViejos.detener();
  });

  await check('una vuelta sin corte abierto no hace nada (y un corte con chats viejos sin arrancar, tampoco)', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    chatsViejos.detener();
    // El guardián abre un corte con chats viejos sin arrancar (pruebas, evaluar): no le toca.
    evo.instancia = 'close';
    await barrer(Date.now() - 10 * MIN);
    assert.strictEqual(chatsViejos.resumen().estado, 'sin arrancar');
    assert.strictEqual(chatsViejos.listo(), true);
    await arrancar(ESCUCHA, { vueltaMs: 20 });
    const alDia = archivo().alDia;
    await volverInstancia(); // cierra un corte que chats viejos no tenía abierto
    chatsViejos.cerrarCorte({ control: 'webhook' }); // y una vuelta suelta
    await dormir(100);
    assert.strictEqual(evo.pedidos.length, 1, 'se puso al día sin ningún corte');
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.strictEqual(archivo().alDia, alDia, 'alDia se movió');
    chatsViejos.detener();
  });

  await check('dos cortes seguidos: el segundo no mueve alDia hacia adelante ni deja ponerse al día en el medio', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 150 });
    const primero = Date.now() - 40 * MIN;
    await cortarInstancia(primero);
    await volverInstancia(Date.now() - 30 * MIN); // vuelve: espera para ponerse al día
    await cortarInstancia(Date.now() - 20 * MIN); // y se corta de nuevo antes
    assert.strictEqual(archivo().alDia, iso(primero), 'el segundo corte movió alDia hacia adelante');
    await dormir(300);
    assert.strictEqual(evo.pedidos.length, 1, 'se puso al día con el segundo corte abierto');
    assert.strictEqual(chatsViejos.listo(), false);
    await volverInstancia();
    await dormir(300);
    assert.strictEqual(evo.pedidos.length, 2, 'no se puso al día a la vuelta del segundo corte');
    assert.strictEqual(evo.pedidos[1].desde, primero, 'la ventana tiene que empezar en el primer corte');
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    chatsViejos.detener();
  });

  await check('con el webhook todavía mudo, que vuelva la instancia no alcanza: sigue atrasado hasta que vuelvan a llegar mensajes', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 30, tickMs: 20 });
    const entro = await entra();
    await dormir(60); // el reloj lleva alDia más allá del mensaje, como en la vida real
    await barrer(entro + 50 * MIN); // corte del webhook
    evo.instancia = 'close';
    await barrer(entro + 55 * MIN); // y además la instancia
    evo.instancia = 'open';
    await barrer(entro + 60 * MIN); // vuelve la instancia, pero no entró nada
    assert.ok(alGrupo.some((t) => t.startsWith('✅ Evolution volvió')), 'el caso no prueba nada: la instancia no volvió');
    await dormir(100);
    assert.strictEqual(evo.pedidos.length, 1, 'se puso al día con el webhook todavía mudo');
    assert.strictEqual(chatsViejos.resumen().motivo, 'Evolution caído (no llega nada por el webhook)');
    assert.strictEqual(archivo().alDia, iso(entro));
    await dormir(5);
    await entra();
    await barrer(entro + 65 * MIN);
    assert.ok(alGrupo.some((t) => t.startsWith('✅ Volvieron a llegar')), 'el caso no prueba nada: el webhook no volvió');
    await dormir(150);
    assert.strictEqual(evo.pedidos.length, 2, 'no se puso al día cuando volvieron los mensajes');
    assert.strictEqual(evo.pedidos[1].desde, entro, 'la ventana tiene que empezar en el último mensaje que entró');
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    chatsViejos.detener();
  });

  console.log('\n10c. Un chat que entra a estado.json con la lista atrasada (30/09/2026)\n');

  // El hueco que quedó de la caída: un chat que empezó sin el bot mirando (durante un corte, o con
  // el bot apagado) y vuelve a escribir antes de que la lista se ponga al día entra a estado.json,
  // y la puesta al día lo daba por conocido: quedaba nuevo. Chat nuevo es el que empezó desde cero
  // con el bot mirando (decisión de Tomás del 29/09): si Evolution tiene un mensaje suyo de antes
  // del primero que vio el bot, es viejo.
  /** Un mensaje del cliente por el webhook, con la hora de WhatsApp (en segundos). */
  const escritoA = (numero, texto, ms, id) => ({
    key: { remoteJid: jid(numero), fromMe: false, id },
    pushName: 'Marta',
    messageTimestamp: Math.floor(ms / 1000),
    message: { conversation: texto },
  });
  const enEstado = (numero) => Object.prototype.hasOwnProperty.call(state.todos(), jid(numero));

  await check('vuelta: un chat que empezó durante el corte y vuelve a escribir en la espera de la vuelta → viejo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 400 });
    const ultimoOpen = Date.now() - 30 * MIN;
    await cortarInstancia(ultimoOpen);
    const X = '5490000000071';
    const ahora = Date.now();
    evo.registros = [
      guardado(jid(X), ultimoOpen + 4 * MIN), // empezó durante el corte, sin el bot mirando
      guardado(jid(X), ahora, { id: 'X-SIGUE-AHI' }), // el que entra en la espera de la vuelta
    ];
    await volverInstancia(ahora);
    await bot.procesar(escritoA(X, 'sigue disponible?', ahora, 'X-SIGUE-AHI'));
    assert.ok(enEstado(X), 'el caso no prueba nada: el chat no entró a estado.json');
    assert.strictEqual(chatsViejos.listo(), false, 'el caso no prueba nada: ya estaba al día');
    await dormir(700);
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.ok(archivo().viejos[X], 'un chat que empezó durante el corte quedó como nuevo');
    assert.strictEqual(archivo().viejos[X].motivo, 'empezó durante un corte de Evolution');
    assert.strictEqual(archivo().viejos[X].desde, iso(Math.floor((ultimoOpen + 4 * MIN) / 1000) * 1000));
    assert.strictEqual(evolution.esDestinoDePrueba(jid(X)), false);
    assert.ok(!leLlego(X), 'le escribió en vivo con la lista atrasada');
    chatsViejos.detener();
  });

  await check('vuelta: un chat que empieza de cero en la espera de la vuelta sigue nuevo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 400 });
    const ultimoOpen = Date.now() - 30 * MIN;
    await cortarInstancia(ultimoOpen);
    const Y = '5490000000072';
    const ahora = Date.now();
    evo.registros = [guardado(jid(Y), ahora, { id: 'Y-PRIMERO' })]; // su primer mensaje, el que ve el bot
    await volverInstancia(ahora);
    await bot.procesar(escritoA(Y, 'hola tenes el 13?', ahora, 'Y-PRIMERO'));
    assert.ok(enEstado(Y), 'el caso no prueba nada: el chat no entró a estado.json');
    await dormir(700);
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.ok(!archivo().viejos[Y], 'un chat que empezó con el bot mirando quedó viejo');
    assert.strictEqual(evolution.esDestinoDePrueba(jid(Y)), true);
    chatsViejos.detener();
  });

  await check('vuelta: un chat conocido de antes del corte que escribe durante el corte y en la espera sigue nuevo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    const K = '5490000000073';
    state.agregarAlHistorial(jid(K), 'cliente', 'hola');
    await arrancar(ESCUCHA, { vueltaMs: 400 });
    const ultimoOpen = Date.now() - 30 * MIN;
    await cortarInstancia(ultimoOpen);
    const ahora = Date.now();
    evo.registros = [guardado(jid(K), ultimoOpen + 4 * MIN), guardado(jid(K), ahora, { id: 'K-OTRA-VEZ' })];
    await volverInstancia(ahora);
    await bot.procesar(escritoA(K, 'y el 14?', ahora, 'K-OTRA-VEZ'));
    await dormir(700);
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.ok(!archivo().viejos[K], 'un chat conocido donde solo escribió el cliente quedó viejo');
    chatsViejos.detener();
  });

  await check('reinicio antes de la vuelta: el chat que entró con la lista atrasada queda viejo en el arranque, y la anotación se limpia', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    await arrancar(ESCUCHA, { vueltaMs: 1e7 }); // la vuelta no llega: se cae el bot antes
    const ultimoOpen = Date.now() - 30 * MIN;
    await cortarInstancia(ultimoOpen);
    const Z = '5490000000075';
    const ahora = Date.now();
    evo.registros = [guardado(jid(Z), ultimoOpen + 4 * MIN), guardado(jid(Z), ahora, { id: 'Z-SIGUE-AHI' })];
    await volverInstancia(ahora);
    await bot.procesar(escritoA(Z, 'sigue disponible?', ahora, 'Z-SIGUE-AHI'));
    assert.ok(enEstado(Z), 'el caso no prueba nada: el chat no entró a estado.json');
    chatsViejos.detener();
    guardian.reiniciar();
    await dormir(5);
    await arrancar(Date.now());
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.ok(archivo().viejos[Z], 'después del reinicio quedó como nuevo');
    assert.deepStrictEqual(archivo().sinMirar || {}, {}, 'la anotación tiene que limpiarse al ponerse al día');
    chatsViejos.detener();
  });

  await check('arranque lento: un chat que escribió con el bot apagado y vuelve a escribir pasada la espera de 60 s → viejo', async () => {
    limpiar();
    escribirLista({ viejos: [VIEJO], alDia: ALDIA });
    const W = '5490000000074';
    const ahora = Date.now();
    evo.registros = [guardado(jid(W), EN_LA_VENTANA), guardado(jid(W), ahora, { id: 'W-DE-NUEVO' })];
    evo.demora = 400;
    const puesta = arrancar(ESCUCHA, { esperaMaxMs: 50 });
    await bot.procesar(escritoA(W, 'hola? sigue?', ahora, 'W-DE-NUEVO'));
    assert.ok(enEstado(W), 'el caso no prueba nada: el chat no entró a estado.json');
    await puesta;
    assert.strictEqual(chatsViejos.resumen().estado, 'al día');
    assert.ok(archivo().viejos[W], 'un chat que empezó con el bot apagado quedó como nuevo');
    assert.strictEqual(archivo().viejos[W].motivo, 'empezó con el bot apagado');
    chatsViejos.detener();
  });

  servidor.close();

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  try {
    fs.rmSync(CARPETA, { recursive: true, force: true });
  } catch {
    /* da igual */
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
