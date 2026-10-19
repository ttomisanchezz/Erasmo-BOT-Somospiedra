'use strict';
/**
 * Persistencia del estado (bloque 4 de la auditoría del 15/09/2026, hallazgo A7).
 *
 *   node test/persistencia.test.js
 *
 * Lo que se prueba:
 *   1. La escritura es atómica: va a `estado.json.tmp` y después rename. Si el
 *      rename falla (EPERM/EBUSY en Windows) se reintenta; si igual falla, hay un
 *      error visible, los datos siguen en memoria y el próximo guardado los escribe.
 *   2. Se guarda solo si hubo cambios: cargar, leer y salir no toca el archivo.
 *   3. Un archivo ilegible se aparta tal cual en `estado.json.corrupto-<fecha>`,
 *      se arranca vacío, el bot lo avisa una vez al grupo, y el archivo queda con
 *      JSON válido. Si el archivo no existe, no pasa nada de eso.
 *   4. Modo solo lectura (ESTADO_SOLO_LECTURA=1): la migración es solo en memoria,
 *      no hay backup y no se escribe nada, ni al salir. Un lector no pisa lo que
 *      otro proceso escribió mientras tanto (el caso de la auditoría).
 *   5. La migración del bloque 3 sigue igual (backup `.antes-bloque3`, no se pisa).
 *   6. (Bloque 4b) Una lectura que falla por otra cosa que "no existe" (EBUSY,
 *      EPERM, EACCES) se reintenta y, si sigue, tira: el módulo no carga, el
 *      bot no arranca y NO se escribe nada. Solo ENOENT arranca vacío. Se simula
 *      con un `fs.readFileSync` de mentira, en otro proceso.
 *
 * Los casos de "cargar y salir" corren en OTRO proceso, como el bot: `state.js`
 * lee el archivo al cargarse y guarda al salir. Este proceso arranca con un
 * estado dañado a propósito, para probar el aviso al grupo. Números inventados,
 * sin red. El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync, spawn, spawnSync } = require('child_process');

const RAIZ = path.join(__dirname, '..');
const STATE_JS = path.join(RAIZ, 'src', 'state.js');
const INDEX_JS = path.join(RAIZ, 'src', 'index.js');
const GRUPO = '120363000000000041@g.us';
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'persistencia-'));

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
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.RESUMEN_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.ESTADO_SOLO_LECTURA = '';
process.env.EVOLUTION_INSTANCE = 'somospiedra';
process.env.ESTADO_PATH = path.join(DIR, 'estado.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(DIR, 'apr.jsonl');

// Este proceso arranca con el estado DAÑADO: un JSON cortado a la mitad.
const CORRUPTO = '{"5490000000001@s.whatsapp.net": {"nombre": "Lucia", "historial": [{"quien": "cli';
fs.writeFileSync(process.env.ESTADO_PATH, CORRUPTO);

const erroresConsola = [];
const errorOriginal = console.error;
console.error = (...args) => {
  erroresConsola.push(args.map(String).join(' '));
  errorOriginal(...args);
};

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};
const evolution = require('../src/evolution');
const alGrupo = [];
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return { key: { id: 'G' + alGrupo.length } };
};
evolution.enviarTexto = async (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'X' } });
evolution.estadoInstancia = async () => ({ state: 'open' });

const state = require('../src/state');
// Lo que dijo la consola al cargar el estado dañado, antes de que otras pruebas la limpien.
const erroresArranque = erroresConsola.slice();
const bot = require('../src/index');

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
const leer = (f) => fs.readFileSync(f, 'utf8');
const mtime = (f) => fs.statSync(f).mtimeMs;
const ESTADO_VALIDO = {
  '5490000000002@s.whatsapp.net': { nombre: 'Bruno', modelo: 'laja', entrega: 400000, historial: [] },
  'bot:interno': { esquema: 3 },
};

/**
 * Corre un script en otro proceso con su propio ESTADO_PATH. Corre desde test/,
 * que no tiene .env: dotenv no carga nada del repo. Devuelve stdout.
 */
function enOtroProceso(codigo, archivo, extraEnv = {}) {
  // Sin los logs de state.js ("[estado] migrado..."): lo que se lee es lo que escribe el script.
  return execFileSync(process.execPath, ['-e', 'console.log = () => {}; ' + codigo], {
    cwd: __dirname,
    env: { ...process.env, ESTADO_PATH: archivo, APRENDIZAJE_PATH: path.join(DIR, 'apr2.jsonl'), ESTADO_SOLO_LECTURA: '', ...extraEnv },
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
}
const CARGAR_Y_SALIR = `require(${JSON.stringify(STATE_JS)}); process.exit(0);`;
// Sin process.exit: sale solo, por beforeExit, que es donde se guardaba siempre.
const CARGAR_Y_SALIR_SOLO = `const s = require(${JSON.stringify(STATE_JS)}); s.todos();`;

(async () => {
  console.log('\nEscritura atómica\n');

  await check('guardar escribe a .tmp y renombra; no queda ningún .tmp suelto y el JSON es válido', async () => {
    const renombres = [];
    const original = fs.renameSync;
    fs.renameSync = (a, b) => {
      renombres.push([path.basename(a), path.basename(b)]);
      return original(a, b);
    };
    try {
      state.actualizar('5490000000003@s.whatsapp.net', { modelo: 'piedra bola' });
      state.guardarAhora();
    } finally {
      fs.renameSync = original;
    }
    assert.ok(
      renombres.some(([a, b]) => a === 'estado.json.tmp' && b === 'estado.json'),
      'no escribió por estado.json.tmp + rename: ' + JSON.stringify(renombres)
    );
    assert.ok(!fs.existsSync(state.ARCHIVO + '.tmp'), 'quedó estado.json.tmp suelto');
    const datos = JSON.parse(leer(state.ARCHIVO));
    assert.strictEqual(datos['5490000000003@s.whatsapp.net'].modelo, 'piedra bola');
  });

  await check('rename con EPERM dos veces: reintenta y termina escribiendo', async () => {
    let fallas = 0;
    const original = fs.renameSync;
    fs.renameSync = (a, b) => {
      if (fallas < 2) {
        fallas++;
        const e = new Error('EPERM: operation not permitted');
        e.code = 'EPERM';
        throw e;
      }
      return original(a, b);
    };
    try {
      state.actualizar('5490000000003@s.whatsapp.net', { entrega: 500000 });
      state.guardarAhora();
    } finally {
      fs.renameSync = original;
    }
    assert.strictEqual(fallas, 2, 'no reintentó el rename');
    assert.strictEqual(JSON.parse(leer(state.ARCHIVO))['5490000000003@s.whatsapp.net'].entrega, 500000);
    assert.ok(!fs.existsSync(state.ARCHIVO + '.tmp'), 'quedó estado.json.tmp suelto');
  });

  await check('rename que falla siempre: error visible, los datos siguen en memoria y el próximo guardado los escribe', async () => {
    const original = fs.renameSync;
    const antes = leer(state.ARCHIVO);
    erroresConsola.length = 0;
    fs.renameSync = () => {
      const e = new Error('EBUSY: resource busy or locked');
      e.code = 'EBUSY';
      throw e;
    };
    try {
      state.actualizar('5490000000003@s.whatsapp.net', { entrega: 600000 });
      state.guardarAhora();
    } finally {
      fs.renameSync = original;
    }
    assert.ok(erroresConsola.some((l) => /no pude guardar/i.test(l)), 'no dejó un error visible: ' + erroresConsola.join(' | '));
    assert.strictEqual(leer(state.ARCHIVO), antes, 'tocó el archivo definitivo con el rename fallando');
    assert.strictEqual(state.obtener('5490000000003@s.whatsapp.net').entrega, 600000, 'perdió el dato de la memoria');
    // Sin tocar nada más, el próximo guardado lo escribe.
    state.guardarAhora();
    assert.strictEqual(JSON.parse(leer(state.ARCHIVO))['5490000000003@s.whatsapp.net'].entrega, 600000, 'no reintentó en el próximo guardado');
    assert.ok(!fs.existsSync(state.ARCHIVO + '.tmp'), 'quedó estado.json.tmp suelto');
  });

  await check('el guardado diferido (un segundo de gracia) también es atómico', async () => {
    const renombres = [];
    const original = fs.renameSync;
    fs.renameSync = (a, b) => {
      renombres.push(path.basename(a));
      return original(a, b);
    };
    try {
      state.actualizar('5490000000003@s.whatsapp.net', { zona: 'centro' });
      await dormir(1300);
    } finally {
      fs.renameSync = original;
    }
    assert.ok(renombres.includes('estado.json.tmp'), 'el timer de guardar escribió directo');
    assert.strictEqual(JSON.parse(leer(state.ARCHIVO))['5490000000003@s.whatsapp.net'].zona, 'centro');
  });

  console.log('\nGuardar solo si hubo cambios\n');

  await check('cargar, leer y salir (por beforeExit) no toca el archivo: mismo contenido y misma fecha', async () => {
    const archivo = path.join(DIR, 'solo-lee.json');
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    const contenido = leer(archivo);
    const fecha = mtime(archivo);
    await dormir(30);
    enOtroProceso(CARGAR_Y_SALIR_SOLO, archivo);
    assert.strictEqual(leer(archivo), contenido, 'reescribió el archivo sin cambios');
    assert.strictEqual(mtime(archivo), fecha, 'cambió la fecha de modificación sin cambios');
  });

  await check('con SIGINT (process.exit desde la señal) tampoco, si no hubo cambios', async () => {
    const archivo = path.join(DIR, 'solo-lee-2.json');
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    const fecha = mtime(archivo);
    await dormir(30);
    enOtroProceso(`require(${JSON.stringify(STATE_JS)}); process.emit('SIGINT');`, archivo);
    assert.strictEqual(mtime(archivo), fecha, 'guardó al salir sin cambios');
  });

  await check('si hubo un cambio, al salir sí se guarda (lo de siempre)', async () => {
    const archivo = path.join(DIR, 'cambia.json');
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    enOtroProceso(
      `const s = require(${JSON.stringify(STATE_JS)}); s.agregarAlHistorial('5490000000002@s.whatsapp.net', 'cliente', 'hola'); process.emit('SIGINT');`,
      archivo
    );
    const h = JSON.parse(leer(archivo))['5490000000002@s.whatsapp.net'].historial;
    assert.strictEqual(h.length, 1, 'no guardó el cambio al salir');
  });

  console.log('\nArchivo ilegible\n');

  await check('este proceso arrancó con un JSON cortado: copia tal cual, error visible, arranca vacío y el archivo queda válido', async () => {
    const copias = fs.readdirSync(DIR).filter((f) => f.startsWith('estado.json.corrupto-'));
    assert.strictEqual(copias.length, 1, 'no hizo la copia .corrupto-*: ' + copias.join(', '));
    assert.ok(/^estado\.json\.corrupto-\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}/.test(copias[0]), 'el nombre no lleva la fecha ISO sin ":": ' + copias[0]);
    assert.strictEqual(leer(path.join(DIR, copias[0])), CORRUPTO, 'la copia no es byte a byte el original');
    assert.ok(erroresArranque.some((l) => /dañado|corrupto|no se pudo leer/i.test(l)), 'no mostró el error: ' + erroresArranque.slice(0, 3).join(' | '));
    assert.deepStrictEqual(Object.keys(state.todos()).filter((k) => k.startsWith('549000000000') && k !== '5490000000003@s.whatsapp.net'), [], 'no arrancó vacío');
    JSON.parse(leer(state.ARCHIVO)); // válido
    const info = state.estadoDanado();
    assert.ok(info && info.copia === path.join(DIR, copias[0]), 'estadoDanado() no dice dónde quedó la copia: ' + JSON.stringify(info));
  });

  await check('index.js avisa UNA vez al grupo al arrancar: que estaba dañado, dónde quedó la copia y que arrancó sin memoria', async () => {
    alGrupo.length = 0;
    await bot.avisarEstadoDanado();
    assert.strictEqual(alGrupo.length, 1, 'no avisó al grupo');
    assert.ok(/dañad|corrupt/i.test(alGrupo[0]), 'no dice que estaba dañado: ' + alGrupo[0]);
    assert.ok(alGrupo[0].includes('estado.json.corrupto-'), 'no dice dónde quedó la copia: ' + alGrupo[0]);
    assert.ok(/sin memoria/i.test(alGrupo[0]), 'no dice que arrancó sin memoria: ' + alGrupo[0]);
    await bot.avisarEstadoDanado();
    assert.strictEqual(alGrupo.length, 1, 'avisó dos veces');
  });

  await check('un JSON que no es un objeto ({}) también se aparta', async () => {
    const archivo = path.join(DIR, 'nulo.json');
    fs.writeFileSync(archivo, 'null');
    enOtroProceso(CARGAR_Y_SALIR, archivo);
    const copias = fs.readdirSync(DIR).filter((f) => f.startsWith('nulo.json.corrupto-'));
    assert.strictEqual(copias.length, 1, 'no apartó el "null"');
    assert.ok(JSON.parse(leer(archivo)) && typeof JSON.parse(leer(archivo)) === 'object', 'no quedó un objeto válido');
  });

  await check('si el archivo no existe es un arranque normal: sin copia y sin aviso', async () => {
    const archivo = path.join(DIR, 'no-existe', 'estado.json');
    const salida = enOtroProceso(
      `const s = require(${JSON.stringify(STATE_JS)}); process.stdout.write(JSON.stringify(s.estadoDanado())); process.exit(0);`,
      archivo
    );
    assert.strictEqual(salida, 'null', 'marcó como dañado un archivo que no existe');
    assert.deepStrictEqual(fs.readdirSync(path.dirname(archivo)).filter((f) => f.includes('corrupto')), []);
  });

  console.log('\nModo solo lectura (ESTADO_SOLO_LECTURA=1)\n');

  await check('cargar un estado viejo, leer y salir: mismo contenido, misma fecha, sin backup .antes-bloque3', async () => {
    const archivo = path.join(DIR, 'lector.json');
    const viejo = { '5490000000004@s.whatsapp.net': { nombre: 'Ana', saludoEn: 1700000000000, acuseContestado: { ts: 1, texto: 'ok' } } };
    fs.writeFileSync(archivo, JSON.stringify(viejo, null, 2));
    const contenido = leer(archivo);
    const fecha = mtime(archivo);
    await dormir(30);
    const salida = enOtroProceso(
      `const s = require(${JSON.stringify(STATE_JS)}); const c = s.todos()['5490000000004@s.whatsapp.net']; process.stdout.write(JSON.stringify({ lista: c.saludoEn || null, cot: c.acuseContestado || null, nombre: c.nombre })); s.actualizar('5490000000004@s.whatsapp.net', { entrega: 1 }); s.guardarAhora(); process.emit('SIGINT');`,
      archivo,
      { ESTADO_SOLO_LECTURA: '1' }
    );
    // La migración corrió en memoria: las marcas del bot no están, el nombre sí.
    assert.deepStrictEqual(JSON.parse(salida), { lista: null, cot: null, nombre: 'Ana' });
    assert.strictEqual(leer(archivo), contenido, 'escribió en modo solo lectura');
    assert.strictEqual(mtime(archivo), fecha, 'cambió la fecha en modo solo lectura');
    assert.ok(!fs.existsSync(archivo + '.antes-bloque3'), 'hizo el backup en modo solo lectura');
    assert.ok(!fs.existsSync(archivo + '.tmp'), 'dejó un .tmp en modo solo lectura');
  });

  await check('un archivo dañado en modo solo lectura no se copia ni se reescribe', async () => {
    const archivo = path.join(DIR, 'lector-roto.json');
    fs.writeFileSync(archivo, CORRUPTO);
    enOtroProceso(CARGAR_Y_SALIR_SOLO, archivo, { ESTADO_SOLO_LECTURA: '1' });
    assert.strictEqual(leer(archivo), CORRUPTO, 'reescribió el archivo dañado');
    assert.deepStrictEqual(fs.readdirSync(DIR).filter((f) => f.startsWith('lector-roto.json.corrupto')), [], 'hizo la copia en modo solo lectura');
  });

  await check('el caso de la auditoría: un lector no pisa lo que otro proceso escribió mientras tanto', async () => {
    const archivo = path.join(DIR, 'compartido.json');
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    // El lector carga, se queda un rato y sale solo (beforeExit).
    const lector = spawn(
      process.execPath,
      ['-e', `const s = require(${JSON.stringify(STATE_JS)}); s.todos(); setTimeout(() => {}, 400);`],
      { cwd: __dirname, env: { ...process.env, ESTADO_PATH: archivo, ESTADO_SOLO_LECTURA: '1' }, stdio: 'ignore' }
    );
    await dormir(150);
    // Mientras tanto, el bot anota una entrega nueva.
    const actualizado = { ...ESTADO_VALIDO, '5490000000002@s.whatsapp.net': { ...ESTADO_VALIDO['5490000000002@s.whatsapp.net'], entrega: 999000 } };
    fs.writeFileSync(archivo, JSON.stringify(actualizado, null, 2));
    await new Promise((r) => lector.on('exit', r));
    assert.strictEqual(JSON.parse(leer(archivo))['5490000000002@s.whatsapp.net'].entrega, 999000, 'el lector pisó la actualización');
  });

  console.log('\nLectura que falla por otra cosa que "no existe" (bloque 4b)\n');

  // Un `fs.readFileSync` de mentira SOLO para el archivo del estado: el resto
  // (módulos, .env) se lee de verdad. `fallas` dice cuántas veces seguidas tira
  // ese código antes de leer bien; Infinity, siempre. Imprime en stdout un JSON
  // con qué pasó: si cargó, cuántos intentos hubo y los chats que ve.
  function cargarConLecturaRota(archivo, codigo, fallas, modulo = STATE_JS, extraEnv = {}) {
    const codigoJs = `
      const fs = require('fs'); const path = require('path');
      const ARCHIVO = path.resolve(${JSON.stringify(archivo)});
      const original = fs.readFileSync; let intentos = 0;
      fs.readFileSync = function (p, ...a) {
        if (typeof p === 'string' && path.resolve(p) === ARCHIVO) {
          intentos++;
          if (intentos <= ${fallas}) { const e = new Error(${JSON.stringify(codigo)} + ': lectura de mentira'); e.code = ${JSON.stringify(codigo)}; throw e; }
        }
        return original.call(fs, p, ...a);
      };
      let salida;
      try {
        const s = require(${JSON.stringify(modulo)});
        salida = { cargo: true, intentos, chats: s.todos ? Object.keys(s.todos()) : null };
      } catch (e) {
        salida = { cargo: false, intentos, nombre: e.name, code: e.code, mensaje: e.message };
      }
      process.stdout.write(JSON.stringify(salida));
      process.emit('SIGINT');
    `;
    const r = spawnSync(process.execPath, ['-e', 'console.log = () => {}; ' + codigoJs], {
      cwd: __dirname,
      env: { ...process.env, ESTADO_PATH: archivo, APRENDIZAJE_PATH: path.join(DIR, 'apr3.jsonl'), ESTADO_SOLO_LECTURA: '', ...extraEnv },
      encoding: 'utf8',
      timeout: 20000,
    });
    let salida = null;
    try {
      salida = JSON.parse(r.stdout);
    } catch {
      /* no llegó a escribir: se mira status y stderr */
    }
    return { salida, status: r.status, stderr: r.stderr || '' };
  }
  const sinTmpNiCopias = (archivo) =>
    fs.readdirSync(path.dirname(archivo)).filter((f) => f.startsWith(path.basename(archivo) + '.'));

  await check('EBUSY siempre: cargar el módulo tira, y el archivo queda con el mismo contenido y la misma fecha (nada de .tmp ni backup)', async () => {
    const archivo = path.join(DIR, 'ocupado', 'estado.json');
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    const contenido = leer(archivo);
    const fecha = mtime(archivo);
    await dormir(30);
    const { salida, stderr } = cargarConLecturaRota(archivo, 'EBUSY', Infinity);
    assert.ok(salida, 'el proceso no dijo qué pasó: ' + stderr.slice(0, 300));
    assert.strictEqual(salida.cargo, false, 'cargó el módulo con el archivo ilegible: ' + JSON.stringify(salida));
    assert.ok(salida.intentos > 1, `no reintentó la lectura (intentos: ${salida.intentos})`);
    assert.ok(/no pude leer el estado/i.test(salida.mensaje), 'el error no dice que no pudo leer el estado: ' + salida.mensaje);
    assert.ok(/NO PUDE LEER EL ESTADO/.test(stderr), 'no mostró el error grande en consola: ' + stderr.slice(0, 300));
    assert.strictEqual(leer(archivo), contenido, 'tocó el archivo');
    assert.strictEqual(mtime(archivo), fecha, 'cambió la fecha del archivo');
    assert.deepStrictEqual(sinTmpNiCopias(archivo), [], 'escribió un .tmp, un backup o una copia');
  });

  await check('EBUSY una vez y después lee bien: carga los datos normalmente', async () => {
    const archivo = path.join(DIR, 'ocupado-una-vez.json');
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    const { salida, stderr } = cargarConLecturaRota(archivo, 'EBUSY', 1);
    assert.ok(salida, 'el proceso no dijo qué pasó: ' + stderr.slice(0, 300));
    assert.strictEqual(salida.cargo, true, 'tiró con un EBUSY pasajero: ' + JSON.stringify(salida));
    assert.strictEqual(salida.intentos, 2, `tenían que ser 2 lecturas (intentos: ${salida.intentos})`);
    assert.deepStrictEqual(salida.chats, ['5490000000002@s.whatsapp.net'], 'no cargó los datos: ' + JSON.stringify(salida.chats));
    assert.ok(!/NO PUDE LEER/.test(stderr) && !/DAÑADO/.test(stderr), 'mostró un error con una lectura que al final anduvo: ' + stderr.slice(0, 200));
    assert.deepStrictEqual(sinTmpNiCopias(archivo), [], 'dejó un .tmp o una copia');
  });

  await check('ENOENT sigue arrancando vacío, sin error ni copia', async () => {
    const archivo = path.join(DIR, 'no-esta', 'estado.json');
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    const { salida, stderr } = cargarConLecturaRota(archivo, 'ENOENT', Infinity);
    assert.ok(salida, 'el proceso no dijo qué pasó: ' + stderr.slice(0, 300));
    assert.strictEqual(salida.cargo, true, 'tiró con ENOENT: ' + JSON.stringify(salida));
    assert.strictEqual(salida.intentos, 1, `reintentó un ENOENT (intentos: ${salida.intentos})`);
    assert.deepStrictEqual(salida.chats, [], 'no arrancó vacío');
    assert.ok(!/NO PUDE LEER|DAÑADO/.test(stderr), 'mostró un error con ENOENT: ' + stderr.slice(0, 200));
    assert.deepStrictEqual(fs.readdirSync(path.dirname(archivo)).filter((f) => f.includes('corrupto') || f.endsWith('.tmp')), []);
  });

  await check('en modo solo lectura un EPERM que no se va también tira, y no escribe nada', async () => {
    const archivo = path.join(DIR, 'lector-ocupado.json');
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    const contenido = leer(archivo);
    const fecha = mtime(archivo);
    await dormir(30);
    const { salida, stderr } = cargarConLecturaRota(archivo, 'EPERM', Infinity, STATE_JS, { ESTADO_SOLO_LECTURA: '1' });
    assert.ok(salida, 'el proceso no dijo qué pasó: ' + stderr.slice(0, 300));
    assert.strictEqual(salida.cargo, false, 'cargó en solo lectura con el archivo ilegible: ' + JSON.stringify(salida));
    assert.strictEqual(leer(archivo), contenido, 'tocó el archivo en solo lectura');
    assert.strictEqual(mtime(archivo), fecha, 'cambió la fecha en solo lectura');
    assert.deepStrictEqual(sinTmpNiCopias(archivo), [], 'escribió algo en solo lectura');
  });

  await check('index.js: si el estado no se puede leer, el bot no arranca y lo dice ("no pude leer el estado", "no arranco")', async () => {
    const archivo = path.join(DIR, 'bot-ocupado', 'estado.json');
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(archivo, JSON.stringify(ESTADO_VALIDO, null, 2));
    const contenido = leer(archivo);
    const { salida, status, stderr } = cargarConLecturaRota(archivo, 'EACCES', Infinity, INDEX_JS);
    assert.ok(salida === null || salida.cargo === false, 'index.js cargó con el estado ilegible: ' + JSON.stringify(salida));
    assert.notStrictEqual(status, 0, 'el proceso salió con 0 aunque no pudo leer el estado');
    assert.ok(/no pude leer el estado/i.test(stderr), 'no dice que no pudo leer el estado: ' + stderr.slice(0, 400));
    assert.ok(/no arranco/i.test(stderr) && /pisar/i.test(stderr), 'no dice que no arranca para no pisarlo: ' + stderr.slice(0, 400));
    assert.strictEqual(leer(archivo), contenido, 'index.js tocó el archivo');
    assert.deepStrictEqual(sinTmpNiCopias(archivo), [], 'index.js escribió un .tmp o una copia');
  });

  console.log('\nLa migración del bloque 3 sigue igual\n');

  await check('con escritura: migra, hace el backup una sola vez y no lo pisa', async () => {
    const archivo = path.join(DIR, 'migra.json');
    const viejo = { '5490000000005@s.whatsapp.net': { nombre: 'Leo', saludoEn: 1700000000000 } };
    fs.writeFileSync(archivo, JSON.stringify(viejo));
    enOtroProceso(CARGAR_Y_SALIR, archivo);
    assert.deepStrictEqual(JSON.parse(leer(archivo + '.antes-bloque3')), viejo, 'el backup no es el original');
    const migrado = JSON.parse(leer(archivo));
    assert.ok(!migrado['5490000000005@s.whatsapp.net'].saludoEn, 'no migró');
    assert.strictEqual(migrado['bot:interno'].esquema, 3);
    fs.writeFileSync(archivo + '.antes-bloque3.control', leer(archivo + '.antes-bloque3'));
    enOtroProceso(CARGAR_Y_SALIR, archivo);
    assert.deepStrictEqual(JSON.parse(leer(archivo + '.antes-bloque3')), viejo, 'pisó el backup');
    assert.deepStrictEqual(JSON.parse(leer(archivo)), migrado, 'la segunda corrida cambió algo');
  });

  await check('respaldos por hora: uno por hora, al día en cada guardado, se conservan 24 y el aviso de dañado lo nombra', async () => {
    const archivo = path.join(DIR, 'respaldos', 'estado.json');
    const dirCopias = path.join(path.dirname(archivo), 'backups', 'estado');
    const GUARDAR_DOS = `const s = require(${JSON.stringify(STATE_JS)});
      s.actualizar('5490000000021@s.whatsapp.net', { modelo: 'laja' }); s.guardarAhora();
      s.actualizar('5490000000022@s.whatsapp.net', { modelo: 'granza' }); s.guardarAhora();
      process.exit(0);`;
    enOtroProceso(GUARDAR_DOS, archivo);
    let copias = fs.readdirSync(dirCopias);
    assert.strictEqual(copias.length, 1, 'tendría que haber una sola copia en la hora: ' + copias.join(', '));
    const alDia = JSON.parse(leer(path.join(dirCopias, copias[0])));
    assert.ok(alDia['5490000000022@s.whatsapp.net'], 'la copia de la hora quedó vieja: no tiene el último chat');

    // Con más de 24 se borran las más viejas y queda la más nueva.
    for (let h = 1; h <= 30; h++) {
      fs.writeFileSync(path.join(dirCopias, `estado-2026-08-${String(h).padStart(2, '0')}T05.json`), '{}');
    }
    const GUARDAR_UNO = `const s = require(${JSON.stringify(STATE_JS)});
      s.actualizar('5490000000023@s.whatsapp.net', { modelo: 'piedra bola' }); s.guardarAhora();
      console.error('ULTIMO=' + s.ultimoRespaldo() + ' TOPE=' + s.HORAS_DE_RESPALDO); process.exit(0);`;
    const corrida = spawnSync(process.execPath, ['-e', 'console.log = () => {}; ' + GUARDAR_UNO], {
      cwd: __dirname,
      env: { ...process.env, ESTADO_PATH: archivo, APRENDIZAJE_PATH: path.join(DIR, 'apr3.jsonl'), ESTADO_SOLO_LECTURA: '' },
      encoding: 'utf8',
    });
    const tope = Number((corrida.stderr.match(/TOPE=(\d+)/) || [])[1]);
    copias = fs.readdirSync(dirCopias).sort();
    assert.strictEqual(copias.length, tope, 'no podó a ' + tope + ': quedaron ' + copias.length);
    assert.ok(!copias.includes('estado-2026-08-01T05.json'), 'no borró las más viejas');
    assert.ok(corrida.stderr.includes('ULTIMO=' + path.join(dirCopias, copias[copias.length - 1])), 'ultimoRespaldo no es la más nueva: ' + corrida.stderr);

    // El aviso de archivo dañado nombra el último respaldo, para poder volver a él.
    fs.writeFileSync(archivo, 'esto no es json');
    const danado = spawnSync(process.execPath, ['-e', CARGAR_Y_SALIR], {
      cwd: __dirname,
      env: { ...process.env, ESTADO_PATH: archivo, APRENDIZAJE_PATH: path.join(DIR, 'apr4.jsonl'), ESTADO_SOLO_LECTURA: '' },
      encoding: 'utf8',
    });
    assert.ok(/Último respaldo por hora/.test(danado.stderr || ''), 'el aviso no nombra el respaldo: ' + danado.stderr);
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  console.error = errorOriginal;
  try {
    fs.rmSync(DIR, { recursive: true, force: true });
  } catch {
    /* da igual */
  }
  process.exit(fallos ? 1 : 0);
})();
