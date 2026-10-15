'use strict';
/**
 * Los timeouts de Supabase (08/10/2026, diagnóstico de los 57014 del panel Chiara y del timeout del stock de la app):
 * src/supabase-reintento.js, y cómo lo usan src/panel-chiara.js, src/stock-app.js y src/espejo-cotizador.js.
 *
 *   node test/timeout-supabase.test.js
 *
 * Sin red: Supabase y Google son de mentira (un `fetch` que tira si sale a otro lado). TZ=Asia/Tokyo para ver que
 * la hora del log es la de Argentina y no la de la PC. Se prueba:
 *   1. panel: un 57014 se reintenta una vez y, si entra, no cuenta como falla (la línea del reintento lleva la hora);
 *   2. panel: dos 57014 seguidos sí cuentan (un solo reintento), y la línea de error y la de "anda de nuevo" llevan
 *      la hora de Argentina;
 *   3. panel: el tope del fetch (TimeoutError) y un 504 también se reintentan una vez;
 *   4. panel: un 503, un 400 o "fetch failed" NO se reintentan (fallan de una, como siempre);
 *   5. stock: un 57014 en planilla_ordenes y un timeout en v_stock_chiara se reintentan; dos 57014 cuentan, con la hora;
 *   6. el corrimiento: el panel, el stock y el espejo nunca salen en el mismo segundo (al menos 10 s entre vueltas
 *      de módulos distintos), cada uno con su ritmo de siempre.
 */
process.env.TZ = 'Asia/Tokyo';
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'timeout-supabase-'));
Object.assign(process.env, {
  ESTADO_PATH: path.join(TMP, 'estado.json'),
  APRENDIZAJE_PATH: path.join(TMP, 'aprendizaje.jsonl'),
  DOCS_DIR: path.join(TMP, 'documentos'),
  FOTOS_DIR: path.join(TMP, 'sin-fotos'),
  SUPABASE_URL: 'https://de-mentira.supabase.co',
  SUPABASE_SERVICE_ROLE_KEY: 'sb_secret_de_mentira',
  SUPABASE_REINTENTO_MS: '20',
  CHIARA_PANEL_ACTIVO: 'true',
  CHIARA_TOPE_MES_USD: '',
  STOCK_APP_MODO: 'vivo',
  ESPEJO_COTIZADOR_ACTIVO: 'true',
  SHEET_ID: 'planilla-de-mentira',
  GOOGLE_CREDENTIALS_PATH: path.join(TMP, 'no-existe.json'),
  EVOLUTION_URL: 'http://127.0.0.1:9',
  EVOLUTION_APIKEY: 'clave-de-mentira',
  ANTHROPIC_API_KEY: 'clave-de-mentira',
  GEMINI_API_KEY: '',
  CEREBRO_MODO: 'apagado',
  CEREBRO_SOMBRA_PERSONA_HASTA: '',
  NUMEROS_PRUEBA: '',
  NUMEROS_TESTER: '',
  NUMEROS_PILOTO: '',
  CONTACTOS_PERSONALES: '',
  GRUPO_AVISOS_JID: '120363000000000099@g.us',
  MODO_ESCUCHA: 'false',
  MODO_BORRADOR: 'false',
  TECHSUR_ACTIVO: 'false',
  GUARDIAN_ACTIVO: 'false',
  RESUMEN_ACTIVO: 'false',
  SEGUIMIENTO_ACTIVO: 'false',
  AUDIO_ACTIVO: 'false',
});
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const config = require('../src/config');
config.techsur.supabaseUrl = process.env.SUPABASE_URL;
config.techsur.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
config.sheets.id = process.env.SHEET_ID;
config.stockApp.modo = 'vivo';

// ------------------------------------------------------------------ Supabase y Google de mentira
const pedidos = [];
let responder = () => null; // (pedido, cuántos iguales van) → una respuesta, o tira; null = 200/201 vacío
const respuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
const error57014 = () => respuesta(500, { code: '57014', details: null, hint: null, message: 'canceling statement due to statement timeout' });
const tope = () => {
  throw new DOMException('The operation was aborted due to timeout', 'TimeoutError');
};
globalThis.fetch = async (url, op = {}) => {
  const u = new URL(String(url));
  if (u.hostname !== 'de-mentira.supabase.co') throw new Error('salió a la red durante la prueba: ' + url);
  assert.ok(op.signal, 'un pedido a Supabase sin tope');
  const p = { metodo: op.method || 'GET', tabla: u.pathname.replace('/rest/v1/', '') };
  const iguales = pedidos.filter((x) => x.metodo === p.metodo && x.tabla === p.tabla).length + 1;
  pedidos.push(p);
  const r = responder(p, iguales);
  if (r) return r;
  return p.metodo === 'GET' ? respuesta(200, []) : respuesta(201, null);
};
const cuantos = (metodo, tabla) => pedidos.filter((x) => x.metodo === metodo && x.tabla === tabla).length;

const sheets = require('../src/sheets');
sheets.usarCliente({
  spreadsheets: {
    get: async () => {
      throw new Error('Google de mentira: sin planilla');
    },
    values: {
      get: async () => {
        throw new Error('Google de mentira: sin planilla');
      },
    },
  },
});
const panel = require('../src/panel-chiara');
const stockApp = require('../src/stock-app');
const espejo = require('../src/espejo-cotizador');

// ------------------------------------------------------------------ el log
let lineas = [];
async function conLog(fn) {
  const reales = [console.log, console.warn, console.error];
  const anotar = (tipo) => (...a) => lineas.push({ tipo, texto: a.map(String).join(' ') });
  console.log = anotar('log');
  console.warn = anotar('warn');
  console.error = anotar('error');
  try {
    return await fn();
  } finally {
    [console.log, console.warn, console.error] = reales;
  }
}
const linea = (re) => lineas.find((l) => re.test(l.texto));

/** La línea empieza con "[panel] dd/mm hh:mm:ss " y esa es la hora de ahora en Argentina (UTC-3 todo el año). */
function conHoraAR(texto) {
  const m = /^\[(?:panel|stock-app)\] (\d\d)\/(\d\d) (\d\d):(\d\d):(\d\d) /.exec(texto);
  assert.ok(m, 'la línea no lleva la hora: ' + texto);
  const ar = new Date(Date.now() - 3 * 3600e3);
  const ts = Date.UTC(ar.getUTCFullYear(), Number(m[2]) - 1, Number(m[1]), Number(m[3]), Number(m[4]), Number(m[5])) + 3 * 3600e3;
  assert.ok(Math.abs(Date.now() - ts) < 5000, `la hora de "${texto}" no es la de Argentina`);
}

let fallos = 0;
async function check(nombre, fn) {
  pedidos.length = 0;
  lineas = [];
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
    for (const l of lineas) console.log('        ' + l.tipo + ': ' + l.texto);
  } finally {
    responder = () => null;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  console.log('\nLos timeouts de Supabase (08/10/2026)\n');
  assert.ok(panel.arrancar({ sinTimers: true, salud: async () => ({ whatsapp: 'open' }) }), 'el panel no arrancó');
  await conLog(() => panel.vuelta()); // la primera: la noticia del reinicio

  await check('panel: un 57014 en bot_estado se reintenta una vez y, si entra, no cuenta como falla', async () => {
    responder = (p, n) => (p.tabla === 'bot_estado' && n === 1 ? error57014() : null);
    await conLog(() => panel.vuelta());
    assert.strictEqual(cuantos('POST', 'bot_estado'), 2, 'no lo reintentó');
    assert.strictEqual(panel.resumen().ultimoError, null, 'contó como falla: ' + JSON.stringify(panel.resumen().ultimoError));
    assert.ok(!linea(/^\[panel\].* estado: /), 'dejó una línea de error');
    const r = linea(/bot_estado: Supabase 500 en bot_estado: 57014 .*reintento/);
    assert.ok(r, 'no dejó en el log la línea del reintento');
    conHoraAR(r.texto);
  });

  await check('panel: dos 57014 seguidos sí cuentan (un solo reintento); el error y "anda de nuevo" llevan la hora de Argentina', async () => {
    responder = (p) => (p.tabla === 'bot_estado' ? error57014() : null);
    await conLog(() => panel.vuelta());
    assert.strictEqual(cuantos('POST', 'bot_estado'), 2, 'tiene que ser un reintento, no más');
    assert.strictEqual(panel.resumen().ultimoError.paso, 'estado');
    const e = linea(/^\[panel\] .*estado: Supabase 500 en bot_estado: 57014 canceling statement due to statement timeout$/);
    assert.ok(e && e.tipo === 'error', 'no está la línea de error');
    conHoraAR(e.texto);
    responder = () => null;
    await conLog(() => panel.vuelta());
    const bien = linea(/^\[panel\] .*estado: anda de nuevo$/);
    assert.ok(bien, 'no dijo que anda de nuevo');
    conHoraAR(bien.texto);
  });

  await check('panel: el tope del fetch (TimeoutError) en bot_ordenes y un 504 en bot_estado también se reintentan una vez', async () => {
    responder = (p, n) => {
      if (p.tabla === 'bot_ordenes' && n === 1) tope();
      if (p.tabla === 'bot_estado' && n === 1) return respuesta(504, { code: 'PGRST003', message: 'Timed out acquiring connection from connection pool.' });
      return null;
    };
    await conLog(() => panel.vuelta());
    assert.strictEqual(cuantos('GET', 'bot_ordenes'), 2, 'no reintentó el timeout');
    assert.strictEqual(cuantos('POST', 'bot_estado'), 2, 'no reintentó el 504');
    assert.ok(!linea(/^\[panel\] (?:[\d/]+ [\d:]+ )?(órdenes|estado): /), 'contó como falla');
    assert.ok(linea(/bot_ordenes: The operation was aborted due to timeout.*reintento/), 'no dejó la línea del reintento');
  });

  await check('panel: un 503, un 400 o "fetch failed" no se reintentan: fallan de una, con la hora', async () => {
    responder = (p) => {
      if (p.tabla === 'bot_ordenes') return respuesta(503, { message: 'caído' });
      if (p.tabla === 'bot_estado') return respuesta(400, { code: '23514', message: 'new row violates check constraint' });
      return null;
    };
    await conLog(() => panel.vuelta());
    assert.strictEqual(cuantos('GET', 'bot_ordenes'), 1, 'reintentó un 503');
    assert.strictEqual(cuantos('POST', 'bot_estado'), 1, 'reintentó un 400');
    assert.ok(!linea(/reintento/), 'avisó un reintento');
    conHoraAR(linea(/^\[panel\] .*órdenes: Supabase 503/).texto);
    conHoraAR(linea(/^\[panel\] .*estado: Supabase 400/).texto);
    pedidos.length = 0;
    responder = (p) => {
      if (p.tabla === 'bot_estado') throw new TypeError('fetch failed');
      return null;
    };
    await conLog(() => panel.vuelta());
    assert.strictEqual(cuantos('POST', 'bot_estado'), 1, 'reintentó un "fetch failed"');
    conHoraAR(linea(/^\[panel\] .*estado: fetch failed$/).texto);
    responder = () => null;
    await conLog(() => panel.vuelta());
  });

  await check('stock: un 57014 en planilla_ordenes y un timeout en v_stock_chiara se reintentan; dos 57014 cuentan, con la hora', async () => {
    stockApp._reiniciar();
    responder = (p, n) => {
      if (p.tabla === 'planilla_ordenes' && n === 1) return error57014();
      if (p.tabla === 'v_stock_chiara' && n === 1) tope();
      return null;
    };
    await conLog(() => stockApp.vuelta());
    assert.strictEqual(cuantos('GET', 'planilla_ordenes'), 2, 'no reintentó planilla_ordenes');
    assert.strictEqual(cuantos('GET', 'v_stock_chiara'), 2, 'no reintentó v_stock_chiara');
    // Las órdenes entraron al reintento; lo que falla es la planilla (Google de mentira), y esa línea lleva la hora.
    assert.ok(!linea(/órdenes: /), 'las órdenes contaron como falla');
    assert.strictEqual(stockApp.resumen().ultimoError.paso, 'usados');
    conHoraAR(linea(/^\[stock-app\] .*usados: .*Google de mentira/).texto);
    conHoraAR(linea(/^\[stock-app\] .*planilla_ordenes: Supabase 500 en planilla_ordenes: 57014 .*reintento/).texto);
    pedidos.length = 0;
    lineas = [];
    responder = (p) => (p.tabla === 'planilla_ordenes' ? error57014() : null);
    await conLog(() => stockApp.vuelta());
    assert.strictEqual(cuantos('GET', 'planilla_ordenes'), 2, 'tiene que ser un reintento, no más');
    conHoraAR(linea(/^\[stock-app\] .*órdenes: Supabase 500 en planilla_ordenes: 57014 canceling statement due to statement timeout$/).texto);
    responder = () => null;
    await conLog(() => stockApp.vuelta());
    conHoraAR(linea(/^\[stock-app\] .*órdenes: anda de nuevo$/).texto);
  });

  await check('el corrimiento: el panel, el stock y el espejo nunca salen en el mismo segundo, cada uno con su ritmo', async () => {
    // Un reloj de mentira: se anota quién programa cada timer y se corre una hora y un minuto, en orden.
    const reales = { setTimeout: global.setTimeout, setInterval: global.setInterval, clearTimeout: global.clearTimeout, clearInterval: global.clearInterval };
    const pendientes = [];
    const disparos = [];
    let ahora = 0;
    let dueno = null;
    let n = 0;
    const timer = (f, ms, cada) => {
      const t = { f, en: ahora + ms, cada, dueno, n: ++n, unref() { return t; }, ref() { return t; }, hasRef: () => false };
      pendientes.push(t);
      return t;
    };
    panel._detener();
    stockApp._reiniciar();
    espejo._reiniciar();
    global.setTimeout = (f, ms) => timer(f, ms, null);
    global.setInterval = (f, ms) => timer(f, ms, ms);
    global.clearTimeout = global.clearInterval = (t) => {
      const i = pendientes.indexOf(t);
      if (i >= 0) pendientes.splice(i, 1);
    };
    try {
      // Como en index.js: los tres en el mismo momento, al levantar el puerto.
      dueno = 'espejo';
      assert.ok(espejo.arrancar(), 'el espejo no arrancó');
      dueno = 'panel';
      assert.ok(panel.arrancar({ salud: async () => ({ whatsapp: 'open' }) }), 'el panel no arrancó');
      dueno = 'stock';
      assert.ok(stockApp.arrancar(), 'el stock no arrancó');
      // Que las vueltas no hagan nada mientras corre el reloj (el panel corre la primera y las demás la encuentran en curso).
      config.stockApp.modo = 'apagado';
      process.env.ESPEJO_COTIZADOR_ACTIVO = 'false';
      const HASTA = 61 * 60 * 1000;
      for (;;) {
        pendientes.sort((a, b) => a.en - b.en || a.n - b.n);
        const t = pendientes[0];
        if (!t || t.en > HASTA) break;
        ahora = t.en;
        if (t.cada) t.en += t.cada;
        else pendientes.shift();
        dueno = t.dueno;
        disparos.push({ dueno: t.dueno, en: ahora });
        t.f();
      }
    } finally {
      Object.assign(global, reales);
      config.stockApp.modo = 'vivo';
      process.env.ESPEJO_COTIZADOR_ACTIVO = 'true';
    }
    await dormir(50);
    panel._detener();
    stockApp._reiniciar();
    espejo._reiniciar();
    const de = (d) => disparos.filter((x) => x.dueno === d).map((x) => x.en);
    const pasos = (xs) => xs.slice(1).map((x, i) => x - xs[i]);
    const [p, s, e] = [de('panel'), de('stock'), de('espejo')];
    // Cada uno con su ritmo: el panel como siempre (a los 15 s y en cada minuto justo), el stock cada 1 minuto y el
    // espejo cada 30 minutos, los dos con la primera vuelta dentro del primer minuto.
    assert.deepStrictEqual(p.slice(0, 3), [15000, 60000, 120000], 'el panel cambió de ritmo: ' + p.slice(0, 3));
    assert.ok(pasos(p.slice(1)).every((x) => x === 60000), 'el panel no va cada 1 minuto');
    assert.ok(s[0] <= 60000 && s.length >= 60, 'el stock arranca tarde o no sigue: ' + s.slice(0, 3));
    assert.ok(pasos(s).every((x) => x === 60000), 'el stock no va cada 1 minuto: ' + pasos(s).slice(0, 3));
    assert.ok(e[0] <= 60000 && e.length === 3, 'el espejo arranca tarde o no sigue: ' + e);
    assert.ok(pasos(e).every((x) => x === 30 * 60000), 'el espejo no va cada 30 minutos: ' + pasos(e));
    // Nunca dos módulos en el mismo segundo: al menos 10 s entre vueltas de módulos distintos.
    for (const [a, b] of [[p, s], [p, e], [s, e]]) {
      for (const x of a) for (const y of b) assert.ok(Math.abs(x - y) >= 10000, `dos módulos salen juntos: ${x / 1000} s y ${y / 1000} s`);
    }
  });

  panel._detener();
  console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
