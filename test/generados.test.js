'use strict';
/**
 * Archivos propios del bot (29/10/2026): cada bloqueo prueba también que no salió nada.
 * El dueño de un archivo se ata al CONTENIDO (sha256), no a la ruta ni al inodo.
 * El directorio de trabajo temporal evita que dotenv lea secretos del repo.
 */
const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');
const temporal = fs.mkdtempSync(path.join(os.tmpdir(), 'generados-test-'));
const anterior = process.cwd();
process.chdir(temporal);
process.on('exit', () => {
  process.chdir(anterior);
  fs.rmSync(temporal, { recursive: true, force: true });
});
for (const [nombre, archivo] of Object.entries({ ESTADO_PATH: 'estado.json', APRENDIZAJE_PATH: 'apr.jsonl',
  INTERRUPTOR_PATH: 'interruptor.json', GENERADOS_DIR: 'generados', FOTOS_DIR: 'fotos', DOCS_DIR: 'docs' })) {
  process.env[nombre] = path.join(temporal, archivo);
}
Object.assign(process.env, { EVOLUTION_URL: 'http://evolution.de.mentira', EVOLUTION_INSTANCE: 'somospiedra',
  EVOLUTION_APIKEY: 'clave-de-mentira', GRUPO_AVISOS_JID: '120363000000000077@g.us',
  MODO_BORRADOR: 'false', MODO_ESCUCHA: 'false', NUMEROS_TESTER: '', NUMEROS_PILOTO: '',
  NUMEROS_PRUEBA: '', SOLO_CHATS_NUEVOS: '', CONTACTOS_PERSONALES: '', ESTADO_SOLO_LECTURA: '',
  // Los avisos al grupo salen de 9 a 20 en producción: este test llama al avisarGrupo real y espera que salga ya.
  AVISOS_HORA_DESDE: '0', AVISOS_HORA_HASTA: '24' });
const pedidos = [];
let fallaEvolution = false;
globalThis.fetch = async (url, opciones) => {
  const permitidas = ['sendMedia', 'sendText', 'sendPresence'].map((n) => 'http://evolution.de.mentira/'
    + (n === 'sendPresence' ? 'chat' : 'message') + '/' + n + '/somospiedra');
  if (!permitidas.includes(url)) throw new Error('salió a la red');
  pedidos.push({ url, body: JSON.parse(opciones.body) });
  return { ok: !fallaEvolution, status: fallaEvolution ? 500 : 200,
    text: async () => 'fallo de mentira', json: async () => ({ key: { id: 'EV1' } }) };
};
const config = require('../src/config');
const evolution = require('../src/evolution');
const interruptor = require('../src/interruptor');
let generados;
let fallos = 0;
async function check(nombre, fn) {
  pedidos.length = 0;
  try { await fn(); console.log('  ok   ' + nombre); }
  catch (e) { fallos++; console.log('  FALLA ' + nombre + ' -> ' + e.message); }
}
async function con(cambios, fn) {
  const antes = {};
  for (const k of Object.keys(cambios)) { antes[k] = config[k]; config[k] = cambios[k]; }
  try { await fn(); } finally { Object.assign(config, antes); }
}
const CHAT = '5490000000001@s.whatsapp.net';
const OTRO = '5490000000002@s.whatsapp.net';
const dia = 24 * 60 * 60 * 1000;
const archivos = [];
let contador = 0;
// Cada archivo tiene contenido propio (los mismos bytes nunca van a dos chats).
function archivo(nombre, contenido = 'imagen de mentira ' + (++contador) + ' ' + nombre) {
  const ruta = path.join(process.env.GENERADOS_DIR, nombre);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, contenido);
  archivos.push(ruta);
  return ruta;
}
const hashDe = (ruta) => crypto.createHash('sha256').update(fs.readFileSync(ruta)).digest('hex');
function registrar(ruta, chat = CHAT) {
  const r = generados.registrar(chat, ruta);
  assert.strictEqual(r.registrado, true, JSON.stringify(r));
  assert.strictEqual(r.clave, hashDe(ruta));
}
// Una entrada escrita a mano en el registro, con la fecha que haga falta.
function entrada(ruta, ts, chatId = CHAT) {
  require('../src/state').guardarGenerado(hashDe(ruta), { chatId, ts, ruta: path.basename(ruta) });
}
async function bloqueado(ruta, tipo, motivo, chat = CHAT) {
  assert.deepStrictEqual(await evolution.enviarGenerado(chat, ruta, { tipo }), { bloqueado: true, motivo });
  assert.strictEqual(pedidos.length, 0);
}
async function sale(ruta, tipo, mimetype) {
  const cantidad = pedidos.length;
  assert.deepStrictEqual(await evolution.enviarGenerado(CHAT, ruta, { tipo }), { key: { id: 'EV1' } });
  assert.strictEqual(pedidos.length, cantidad + 1);
  const real = fs.realpathSync.native(ruta);
  assert.deepStrictEqual(pedidos.at(-1).body, { number: CHAT, mediatype: tipo === 'imagen' ? 'image' : 'document',
    mimetype, media: fs.readFileSync(real).toString('base64'), caption: '', fileName: path.basename(real), delay: 0 });
}
(async () => {
  await check('API disponible sin cargar estado ni crear carpeta', () => {
    assert.strictEqual(typeof evolution.enviarGenerado, 'function');
    assert.strictEqual(typeof evolution.rutaAdentro, 'function');
    generados = require('../src/generados');
    assert.ok(!require.cache[require.resolve('../src/state')]);
    assert.ok(!fs.existsSync(process.env.GENERADOS_DIR));
  });
  // Si falta el módulo, el primer corrido deja un fallo claro y no tapa la causa con errores en cascada.
  if (!generados) { console.log('\n' + fallos + ' fallo(s)'); process.exit(fallos ? 1 : 0); }
  const estado = () => require('../src/state');
  const jpg = archivo('Foto.jpg'); registrar(jpg);
  const pdf = archivo('presupuesto.pdf'); registrar(pdf);
  const afuera = path.join(temporal, 'afuera.jpg'); fs.writeFileSync(afuera, 'afuera');
  for (const [nombre, ruta] of [['ruta afuera', afuera], ['.. que sale', process.env.GENERADOS_DIR + '/../afuera.jpg']]) {
    await check(nombre, () => bloqueado(ruta, 'imagen', 'fuera de la carpeta de generados'));
  }
  await check('junction que sale', async () => {
    const externa = path.join(temporal, 'externa'); fs.mkdirSync(externa);
    fs.writeFileSync(path.join(externa, 'foto.jpg'), 'afuera');
    fs.symlinkSync(externa, path.join(process.env.GENERADOS_DIR, 'enlace'), 'junction');
    await bloqueado(path.join(process.env.GENERADOS_DIR, 'enlace', 'foto.jpg'), 'imagen', 'fuera de la carpeta de generados');
  });
  for (const ext of ['gif', 'exe']) await check('extensión ' + ext, async () => {
    const ruta = archivo('no.' + ext);
    assert.strictEqual(generados.registrar(CHAT, ruta).registrado, false);
    await bloqueado(ruta, 'imagen', 'extensión no permitida para imagen');
  });
  await check('PDF como imagen', () => bloqueado(pdf, 'imagen', 'extensión no permitida para imagen'));
  await check('imagen como PDF', () => bloqueado(jpg, 'pdf', 'extensión no permitida para pdf'));
  await check('tipo desconocido antes de resolver ruta', () => bloqueado(afuera, 'video', 'tipo desconocido'));
  await check('más de 5 MB', async () => {
    const ruta = archivo('grande.jpg', Buffer.alloc(5 * 1024 * 1024 + 1));
    assert.deepStrictEqual(generados.registrar(CHAT, ruta), { registrado: false, motivo: 'pesa más de 5 MB' });
    entrada(ruta, Date.now()); // aunque estuviera registrado a mano
    await bloqueado(ruta, 'imagen', 'pesa más de 5 MB');
  });
  await check('exactamente 5 MB', async () => {
    const ruta = archivo('limite.jpg', Buffer.alloc(5 * 1024 * 1024)); registrar(ruta);
    await sale(ruta, 'imagen', 'image/jpeg');
  });
  await check('otro chat no recibe ni se apropia del registro', async () => {
    assert.deepStrictEqual(generados.registrar(OTRO, jpg), { registrado: false, motivo: 'registrado para otro chat' });
    await bloqueado(jpg, 'imagen', 'registrado para otro chat', OTRO);
    await bloqueado(jpg, 'imagen', 'chat inválido', CHAT.split('@')[0]); // un número pelado ya no es un chat
  });
  await check('vigencia con entradas escritas a mano: 24 h + 1 s vence, 23 h sale', async () => {
    const venc = archivo('vencido.jpg'); entrada(venc, Date.now() - dia - 1000);
    await bloqueado(venc, 'imagen', 'vencido (más de 24 h)');
    const ruta = archivo('23h.jpg'); entrada(ruta, Date.now() - 23 * 3600000);
    await sale(ruta, 'imagen', 'image/jpeg');
  });
  await check('vigencia: ts 10 min en el futuro es fecha inválida; 4 min sale', async () => {
    const futuro = archivo('futuro.jpg'); entrada(futuro, Date.now() + 10 * 60000);
    await bloqueado(futuro, 'imagen', 'fecha de registro inválida');
    const dia1 = archivo('futuro-dia.jpg'); entrada(dia1, Date.now() + dia);
    await bloqueado(dia1, 'imagen', 'fecha de registro inválida');
    const ok = archivo('reloj4.jpg'); entrada(ok, Date.now() + 4 * 60000);
    await sale(ok, 'imagen', 'image/jpeg');
  });
  await check('un registro vencido (24 h a 7 días) sigue siendo de su dueño', async () => {
    const f = archivo('vencido-dueno.jpg'); entrada(f, Date.now() - 3 * dia);
    assert.deepStrictEqual(generados.registrar(OTRO, f), { registrado: false, motivo: 'registrado para otro chat' });
    await bloqueado(f, 'imagen', 'registrado para otro chat', OTRO);
    await bloqueado(f, 'imagen', 'vencido (más de 24 h)');
    registrar(f); // el mismo chat lo renueva
    await sale(f, 'imagen', 'image/jpeg');
  });
  await check('sin registro', () => bloqueado(archivo('sin.jpg'), 'imagen', 'no está registrado'));
  await check('registro rechaza afuera y chat vacío', () => {
    assert.strictEqual(generados.registrar(CHAT, afuera).registrado, false);
    for (const chat of ['', '  ', null, 123]) assert.strictEqual(generados.registrar(chat, jpg).registrado, false);
  });
  await check('carpeta misma, inexistente y directorio', async () => {
    await bloqueado(process.env.GENERADOS_DIR, 'imagen', 'fuera de la carpeta de generados');
    await bloqueado(path.join(process.env.GENERADOS_DIR, 'falta.jpg'), 'imagen', 'fuera de la carpeta de generados');
    const directorio = path.join(process.env.GENERADOS_DIR, 'directorio.jpg'); fs.mkdirSync(directorio);
    assert.strictEqual(generados.registrar(CHAT, directorio).registrado, false);
    await bloqueado(directorio, 'imagen', 'no es un archivo');
  });
  await check('escucha precede apagado y borrador', () => con({ modoEscucha: true, modoBorrador: true }, async () => {
    interruptor.poner(false); try { await bloqueado(afuera, 'video', 'modo escucha'); } finally { interruptor.poner(true); }
  }));
  await check('apagado precede revisión y borrador', () => con({ modoBorrador: true }, async () => {
    interruptor.poner(false); try { await bloqueado(afuera, 'video', 'bot apagado (#apagar)'); } finally { interruptor.poner(true); }
  }));
  await check('lista de prueba', () => con({ numerosTester: ['5490000000002'] }, () => bloqueado(jpg, 'imagen', 'fuera de la lista de prueba')));
  await check('inválido no sale ni como borrador', () => con({ modoBorrador: true }, () => bloqueado(afuera, 'imagen', 'fuera de la carpeta de generados')));
  for (const [ruta, tipo, mime] of [[jpg, 'imagen', 'image/jpeg'], [pdf, 'pdf', 'application/pdf']]) {
    await check('borrador ' + tipo + ' al grupo antes de lista de prueba', () => con({ modoBorrador: true, numerosTester: ['5490000000002'] }, async () => {
      assert.deepStrictEqual(await evolution.enviarGenerado(CHAT, ruta, { tipo, caption: 'Texto', delayMs: 7 }),
        { bloqueado: true, motivo: 'modo borrador', alGrupo: true });
      assert.strictEqual(pedidos.length, 1);
      const cuerpo = pedidos[0].body;
      assert.strictEqual(cuerpo.number, config.grupoAvisos);
      assert.strictEqual(cuerpo.mediatype, tipo === 'imagen' ? 'image' : 'document');
      assert.strictEqual(cuerpo.mimetype, mime);
      assert.strictEqual(cuerpo.delay, 7);
      assert.ok(cuerpo.caption.includes('— BORRADOR, no se envió —'));
      assert.ok(cuerpo.caption.includes('https://wa.me/5490000000001'));
      assert.ok(cuerpo.caption.includes('Texto'));
    }));
  }
  await check('borrador: lo no registrado tampoco va al grupo', () => con({ modoBorrador: true }, () => bloqueado(archivo('borrador-sin.jpg'), 'imagen', 'no está registrado')));
  for (const grupoAvisos of ['', OTRO]) await check('grupo inválido: ' + grupoAvisos, () => con({ modoBorrador: true, grupoAvisos }, async () => {
    assert.deepStrictEqual(await evolution.enviarGenerado(CHAT, jpg, { tipo: 'imagen' }),
      { bloqueado: true, motivo: 'modo borrador', alGrupo: false });
    assert.strictEqual(pedidos.length, 0);
  }));
  await check('error del grupo no tira', () => con({ modoBorrador: true }, async () => {
    fallaEvolution = true;
    try {
      assert.deepStrictEqual(await evolution.enviarGenerado(CHAT, jpg, { tipo: 'imagen' }),
        { bloqueado: true, motivo: 'modo borrador', alGrupo: false });
      assert.strictEqual(pedidos.length, 1); assert.strictEqual(pedidos[0].body.number, config.grupoAvisos);
    } finally { fallaEvolution = false; }
  }));
  await check('bueno JPG', () => sale(jpg, 'imagen', 'image/jpeg'));
  for (const [ext, mime] of [['png', 'image/png'], ['jpeg', 'image/jpeg'], ['webp', 'image/webp']]) {
    await check('bueno ' + ext, async () => { const ruta = archivo('bueno.' + ext); registrar(ruta); await sale(ruta, 'imagen', mime); });
  }
  await check('bueno PDF', () => sale(pdf, 'pdf', 'application/pdf'));
  await check('misma ruta escrita distinto', async () => {
    fs.mkdirSync(path.join(process.env.GENERADOS_DIR, 'sub'));
    const variantes = [process.env.GENERADOS_DIR + '/sub/../Foto.jpg', jpg.split(path.sep).join('/')];
    if (process.platform === 'win32') variantes.push(jpg.toUpperCase(), jpg.replace(/\//g, '\\'));
    for (const ruta of variantes) {
      assert.strictEqual(generados.clave(fs.realpathSync.native(ruta)), generados.clave(fs.realpathSync.native(jpg)));
      await sale(ruta, 'imagen', 'image/jpeg');
    }
  });
  await check('reinicio en otro proceso conserva el registro', () => {
    const codigo = `globalThis.fetch = () => { throw new Error('salió a la red'); }; const g = require(${JSON.stringify(require.resolve('../src/generados'))}); const r = g.revisar(${JSON.stringify(CHAT)}, ${JSON.stringify(jpg)}, 'imagen'); require('assert').strictEqual(r.ok, true); require('assert').strictEqual(g.leer(${JSON.stringify(CHAT)}, r).ok, true);`;
    // 29/10/2026: heredar la consola evita pipes de spawnSync que Windows puede bloquear con EPERM.
    execFileSync(process.execPath, ['-e', codigo], { cwd: temporal, env: { ...process.env }, stdio: 'inherit' });
  });
  await check('el registro se indexa por el sha256 del contenido', () => {
    const e = estado().generados()[hashDe(jpg)];
    assert.strictEqual(e.chatId, CHAT);
    assert.ok(Number.isFinite(e.ts) && Math.abs(Date.now() - e.ts) < 60000);
    assert.strictEqual(e.ruta, 'Foto.jpg');
  });
  await check('una entrada dañada del registro (estado.json tocado a mano) no rompe ni deja salir nada', async () => {
    const state = estado();
    const ruta = archivo('danada.jpg');
    const h = hashDe(ruta);
    const casos = [[null, 'no está registrado'], ['texto', 'no está registrado'], [{ chatId: CHAT }, 'vencido (más de 24 h)'],
      [{ chatId: CHAT, ts: 'x' }, 'vencido (más de 24 h)'], [{ chatId: 123, ts: Date.now() }, 'registrado para otro chat']];
    for (const [e, motivo] of casos) {
      state.guardarGenerado(h, e);
      assert.strictEqual(generados.leer(CHAT, generados.revisar(CHAT, ruta, 'imagen')).motivo, motivo);
      await bloqueado(ruta, 'imagen', motivo);
    }
    // La entrada sin fecha legible se poda con la próxima registración: ya no ocupa el contenido.
    state.guardarGenerado(h, { chatId: CHAT });
    registrar(archivo('despues-de-danada.jpg'));
    assert.ok(!Object.hasOwn(state.generados(), h), 'la entrada sin fecha sigue');
    state.guardarGenerado(h, 'texto'); registrar(archivo('despues-de-danada2.jpg'));
    assert.ok(!Object.hasOwn(state.generados(), h), 'la entrada no objeto sigue');
  });
  await check('poda: las entradas de más de 7 días se van con la próxima registración; las más nuevas se quedan', async () => {
    const state = estado();
    const f8 = archivo('hace8dias.jpg'); entrada(f8, Date.now() - 8 * dia);
    const f6 = archivo('hace6dias.jpg'); entrada(f6, Date.now() - 6 * dia);
    const f1 = archivo('hace1dia.jpg'); entrada(f1, Date.now() - dia - 5000);
    assert.ok(Object.hasOwn(state.generados(), hashDe(f8)));
    registrar(archivo('dispara-poda.jpg'));
    assert.ok(!Object.hasOwn(state.generados(), hashDe(f8)), 'la de 8 días sigue');
    assert.ok(Object.hasOwn(state.generados(), hashDe(f6)), 'la de 6 días se podó');
    assert.ok(Object.hasOwn(state.generados(), hashDe(f1)), 'la de 1 día se podó');
    // Un archivo ya podado vuelve a ser de quien lo registre primero (riesgo aceptado, escrito en la cabecera).
    registrar(f8, OTRO);
    // El que sigue en el registro mantiene a su dueño.
    assert.strictEqual(generados.registrar(OTRO, f6).motivo, 'registrado para otro chat');
  });
  await check('solo se registra lo recién generado (mtime de hace más de 10 min no)', async () => {
    const vieja = archivo('hace1h.jpg'); const hace = new Date(Date.now() - 3600000);
    fs.utimesSync(vieja, hace, hace);
    assert.deepStrictEqual(generados.registrar(CHAT, vieja), { registrado: false, motivo: 'no es un archivo recién generado' });
    await bloqueado(vieja, 'imagen', 'no está registrado');
    const justa = archivo('hace9min.jpg'); const nueve = new Date(Date.now() - 9 * 60000);
    fs.utimesSync(justa, nueve, nueve); registrar(justa);
  });
  await check('registro perdido: nadie registra a su nombre un archivo viejo de otro chat', async () => {
    const f = archivo('perdido.jpg'); registrar(f);
    estado().borrarGenerados([hashDe(f)]); // estado.json dañado o borrado
    const hace = new Date(Date.now() - 3600000); fs.utimesSync(f, hace, hace);
    for (const chat of [OTRO, CHAT]) assert.strictEqual(generados.registrar(chat, f).registrado, false);
    await bloqueado(f, 'imagen', 'no está registrado', OTRO);
  });
  await check('un hard link adentro hacia un archivo de afuera no se registra ni sale', async () => {
    const externo = path.join(temporal, 'externo.jpg'); fs.writeFileSync(externo, 'secreto de afuera');
    const duro = path.join(process.env.GENERADOS_DIR, 'enlace-duro.jpg'); fs.linkSync(externo, duro); archivos.push(duro);
    assert.deepStrictEqual(generados.registrar(CHAT, duro), { registrado: false, motivo: 'tiene otro enlace' });
    entrada(duro, Date.now()); // registro a mano: lo único que frena es el enlace
    await bloqueado(duro, 'imagen', 'tiene otro enlace');
  });
  await check('un alias (hard link) del archivo de A no se registra para B', async () => {
    const orig = archivo('orig.jpg'); registrar(orig);
    const alias = path.join(process.env.GENERADOS_DIR, 'alias.jpg'); fs.linkSync(orig, alias); archivos.push(alias);
    assert.deepStrictEqual(generados.registrar(OTRO, alias), { registrado: false, motivo: 'tiene otro enlace' });
    await bloqueado(alias, 'imagen', 'tiene otro enlace', OTRO);
    await bloqueado(orig, 'imagen', 'tiene otro enlace'); // y el original, con dos nombres, tampoco sale
  });
  await check('flujo alternativo de NTFS (Foto.jpg:oculto.jpg)', async () => {
    const f = archivo('Flujo.jpg'); registrar(f);
    const ads = f + ':oculto.jpg';
    try { fs.writeFileSync(ads, 'escondido'); } catch (e) { console.log('       (salteado: no se pudo crear el flujo: ' + e.code + ')'); return; }
    assert.strictEqual(generados.registrar(CHAT, ads).registrado, false);
    const r = await evolution.enviarGenerado(CHAT, ads, { tipo: 'imagen' });
    assert.strictEqual(r.bloqueado, true); assert.strictEqual(pedidos.length, 0);
  });
  // Cambio entre la revisión y la lectura: el gancho dispara justo después de que `revisar` mira el archivo.
  async function despuesDe(objeto, nombre, esElMomento, cambio, fn) {
    const original = objeto[nombre]; let hecho = false;
    objeto[nombre] = function (...a) {
      if (!hecho && esElMomento(a)) { hecho = true; cambio(); }
      return original.apply(this, a);
    };
    try { await fn(); } finally { objeto[nombre] = original; }
    assert.ok(hecho, 'el cambio no se disparó');
  }
  const reescribir = (real, texto) => { const fd = fs.openSync(real, 'r+'); fs.writeSync(fd, texto, 0); fs.closeSync(fd); };
  await check('carrera: el archivo crece a más de 5 MB entre la revisión y la lectura', async () => {
    const f = archivo('crece.jpg', 'chico'); registrar(f); const real = fs.realpathSync.native(f);
    await despuesDe(fs, 'openSync', (a) => String(a[0]) === real, () => fs.truncateSync(real, generados.TOPE_BYTES + 1),
      () => bloqueado(f, 'imagen', 'pesa más de 5 MB'));
  });
  await check('carrera: un subdirectorio se cambia por una junction hacia afuera', async () => {
    const dentro = archivo(path.join('cambia', 'dentro.jpg'), 'adentro'); registrar(dentro);
    const real = fs.realpathSync.native(dentro); const sub = path.dirname(real);
    const externa2 = path.join(temporal, 'externa2'); fs.mkdirSync(externa2);
    fs.writeFileSync(path.join(externa2, 'dentro.jpg'), 'contenido de afuera');
    await despuesDe(fs, 'openSync', (a) => String(a[0]) === real, () => { fs.rmSync(sub, { recursive: true }); fs.symlinkSync(externa2, sub, 'junction'); },
      () => bloqueado(dentro, 'imagen', 'no está registrado'));
    archivos.pop(); // el camino ahora lleva a la carpeta de afuera: no cuenta como generado
  });
  for (const [donde, nombre, momento] of [['fs.statSync', 'statSync', (real) => (a) => String(a[0]) === real],
    ['fs.openSync', 'openSync', (real) => (a) => String(a[0]) === real]]) {
    await check(`carrera: reescritura del mismo tamaño entre revisar y leer (gancho en ${donde}): el hash ya no está registrado`, async () => {
      const f = archivo('mismo-tamano-' + nombre + '.jpg', 'aaaaaaaa'); registrar(f); const real = fs.realpathSync.native(f);
      await despuesDe(fs, nombre, momento(real), () => reescribir(real, 'bbbbbbbb'),
        () => bloqueado(f, 'imagen', 'no está registrado'));
      assert.strictEqual(fs.readFileSync(real, 'utf8'), 'bbbbbbbb');
    });
  }
  await check('carrera: reescritura del mismo tamaño mientras se lee', async () => {
    const f = archivo('mismo-tamano-leyendo.jpg', 'aaaaaaaa'); registrar(f); const real = fs.realpathSync.native(f);
    const original = fs.readSync; let hecho = false;
    fs.readSync = function (...a) { if (!hecho) { hecho = true; reescribir(real, 'bbbbbbbb'); } return original.apply(this, a); };
    try { await bloqueado(f, 'imagen', 'no está registrado'); } finally { fs.readSync = original; }
    assert.ok(hecho);
  });
  await check('recién generado se mide contra el reloj real', async () => {
    const aMtime = (nombre, ms) => { const f = archivo(nombre); const t = new Date(ms); fs.utimesSync(f, t, t); return f; };
    const futuro = aMtime('mtime-futuro.jpg', Date.now() + 3600000);
    for (const chat of [CHAT, OTRO]) {
      assert.deepStrictEqual(generados.registrar(chat, futuro), { registrado: false, motivo: 'fecha del archivo inválida' });
    }
    await bloqueado(futuro, 'imagen', 'no está registrado');
    const hace23h = aMtime('mtime-23h.jpg', Date.now() - 23 * 3600000);
    assert.deepStrictEqual(generados.registrar(OTRO, hace23h), { registrado: false, motivo: 'no es un archivo recién generado' });
    await bloqueado(hace23h, 'imagen', 'no está registrado', OTRO);
    registrar(aMtime('mtime-mas4min.jpg', Date.now() + 4 * 60000)); // 5 min de margen por el reloj
    assert.strictEqual(generados.registrar(CHAT, aMtime('mtime-mas6min.jpg', Date.now() + 6 * 60000)).registrado, false);
  });
  // El dueño va atado al CONTENIDO: ningún cambio de ruta, nombre, enlace o inodo le da el archivo de A a B.
  const MOTIVO_OTRO = { registrado: false, motivo: 'registrado para otro chat' };
  const cambios = {
    'renombrar': (a, s) => { const n = path.join(process.env.GENERADOS_DIR, 'renombrado-' + s + '.jpg'); fs.renameSync(a, n); return n; },
    'mover a una subcarpeta': (a, s) => {
      const n = path.join(process.env.GENERADOS_DIR, 'otra-carpeta', 'movido-' + s + '.jpg');
      fs.mkdirSync(path.dirname(n), { recursive: true }); fs.renameSync(a, n); return n;
    },
    'cambiar solo las mayúsculas': (a) => { const n = path.join(path.dirname(a), path.basename(a).toUpperCase().replace('.JPG', '.jpg')); fs.renameSync(a, n); return n; },
    'hard link y borrar el original': (a, s) => { const n = path.join(process.env.GENERADOS_DIR, 'enlazado-' + s + '.jpg'); fs.linkSync(a, n); fs.rmSync(a); return n; },
  };
  for (const [cambio, hacer] of Object.entries(cambios)) {
    await check(`dueño atado al contenido: ${cambio}`, async () => {
      const sufijo = cambio.replace(/[^a-z]/gi, '');
      const a = archivo('dueno-' + sufijo + '.jpg'); registrar(a);
      const nuevo = hacer(a, sufijo);
      archivos.splice(archivos.indexOf(a), 1); archivos.push(nuevo);
      assert.deepStrictEqual(generados.registrar(OTRO, nuevo), MOTIVO_OTRO);
      await bloqueado(nuevo, 'imagen', 'registrado para otro chat', OTRO);
      // A sí lo recibe, con el nombre nuevo (mismo contenido, mismo dueño), con o sin volver a registrar.
      await sale(nuevo, 'imagen', 'image/jpeg');
      registrar(nuevo);
      await sale(nuevo, 'imagen', 'image/jpeg');
      pedidos.length = 0;
      await bloqueado(nuevo, 'imagen', 'registrado para otro chat', OTRO);
    });
  }
  await check('dueño atado al contenido: A vuelve a registrar el mismo nombre con otro contenido y el viejo quedó archivado', async () => {
    const nombre = 'repetido.jpg';
    const viejo = archivo(nombre, 'contenido uno de A'); registrar(viejo);
    const archivado = path.join(process.env.GENERADOS_DIR, 'repetido-archivado.jpg');
    fs.renameSync(viejo, archivado); archivos.splice(archivos.indexOf(viejo), 1); archivos.push(archivado);
    const nuevo = archivo(nombre, 'contenido dos de A'); registrar(nuevo);
    assert.deepStrictEqual(generados.registrar(OTRO, archivado), MOTIVO_OTRO);
    await bloqueado(archivado, 'imagen', 'registrado para otro chat', OTRO);
    await bloqueado(nuevo, 'imagen', 'registrado para otro chat', OTRO);
    await sale(archivado, 'imagen', 'image/jpeg'); await sale(nuevo, 'imagen', 'image/jpeg');
  });
  await check('dueño atado al contenido: una COPIA del archivo de A (otro inodo, mismo contenido) no es de B', async () => {
    const a = archivo('original-copiado.jpg'); registrar(a);
    const copia = path.join(process.env.GENERADOS_DIR, 'copia-de-a.jpg'); fs.copyFileSync(a, copia); archivos.push(copia);
    assert.notDeepStrictEqual(fs.statSync(copia).ino, fs.statSync(a).ino);
    assert.deepStrictEqual(generados.registrar(OTRO, copia), MOTIVO_OTRO);
    await bloqueado(copia, 'imagen', 'registrado para otro chat', OTRO);
    await bloqueado(a, 'imagen', 'registrado para otro chat', OTRO);
    await sale(copia, 'imagen', 'image/jpeg'); // para A, la copia es lo mismo
  });
  await check('los mismos bytes nunca van a dos chats', async () => {
    const x = archivo('mismos-x.jpg', 'bytes iguales'); const y = archivo('mismos-y.jpg', 'bytes iguales');
    registrar(x);
    assert.deepStrictEqual(generados.registrar(OTRO, y), MOTIVO_OTRO);
    await bloqueado(y, 'imagen', 'registrado para otro chat', OTRO);
    registrar(y); // el mismo chat sí
  });
  await check('el chat tiene que ser una persona: grupo (con #apagar), status, lid, número pelado e indefinido', async () => {
    const f = archivo('chats.jpg'); registrar(f);
    const h = hashDe(f);
    for (const chat of [config.grupoAvisos, 'status@broadcast', '123456789012345@lid', '5490000000001', undefined]) {
      assert.deepStrictEqual(generados.registrar(chat, f), { registrado: false, motivo: 'chat inválido' });
      estado().guardarGenerado(h, { chatId: chat, ts: Date.now() }); // registro a mano
      // #apagar solo deja pasar a los grupos (apagadaPara): ahí es donde la regla del chat tiene que frenar.
      if (String(chat).endsWith('@g.us')) interruptor.poner(false);
      try { // directo, no con `bloqueado`: un chat undefined caería en su valor por defecto
        assert.deepStrictEqual(await evolution.enviarGenerado(chat, f, { tipo: 'imagen' }), { bloqueado: true, motivo: 'chat inválido' });
        assert.strictEqual(pedidos.length, 0);
      } finally { interruptor.poner(true); }
      assert.deepStrictEqual(generados.revisar(chat, '/ruta/que/no/existe.jpg', 'imagen'), { ok: false, motivo: 'chat inválido' });
    }
    estado().guardarGenerado(h, { chatId: CHAT, ts: Date.now() });
  });
  await check('mayúsculas exactas: un hermano GENERADOS / FOTOS en una carpeta que distingue mayúsculas', async () => {
    const base = path.join(temporal, 'cs'); fs.mkdirSync(base);
    try { execFileSync('fsutil', ['file', 'setCaseSensitiveInfo', base, 'enable'], { stdio: 'ignore' }); }
    catch (e) { console.log('       (salteado: fsutil setCaseSensitiveInfo no anduvo: ' + String(e.message).split('\n')[0] + ')'); return; }
    for (const d of ['generados', 'GENERADOS', 'fotos', 'FOTOS']) fs.mkdirSync(path.join(base, d));
    const hermano = path.join(base, 'GENERADOS', 'x.jpg'); fs.writeFileSync(hermano, 'hermano');
    const foto = path.join(base, 'FOTOS', 'f.jpg'); fs.writeFileSync(foto, 'foto');
    const propio = path.join(base, 'generados', 'y.jpg'); fs.writeFileSync(propio, 'propio');
    await con({ generadosDir: path.join(base, 'generados'), fotosDir: path.join(base, 'fotos') }, async () => {
      assert.deepStrictEqual(generados.registrar(CHAT, hermano), { registrado: false, motivo: 'fuera de la carpeta de generados' });
      await bloqueado(hermano, 'imagen', 'fuera de la carpeta de generados');
      assert.deepStrictEqual(await evolution.enviarImagen(CHAT, foto), { bloqueado: true, motivo: 'archivo fuera del catálogo' });
      assert.strictEqual(pedidos.length, 0);
      registrar(propio); await sale(propio, 'imagen', 'image/jpeg'); // control: el propio sigue saliendo
    });
  });
  await check('contacto personal o excluido: ninguna función manda ni pide nada', async () => {
    const MOTIVO = { bloqueado: true, motivo: 'contacto personal o excluido' };
    const personal = '5490000000003@s.whatsapp.net'; const excluido = '5490000000004@s.whatsapp.net';
    fs.mkdirSync(process.env.FOTOS_DIR, { recursive: true }); fs.mkdirSync(process.env.DOCS_DIR, { recursive: true });
    const foto = path.join(process.env.FOTOS_DIR, 'contacto.jpg'); fs.writeFileSync(foto, 'foto');
    const doc = path.join(process.env.DOCS_DIR, 'contacto.pdf'); fs.writeFileSync(doc, 'pdf');
    estado().guardarExcluido('5490000000004', { ts: Date.now() });
    try {
      await con({ contactosPersonales: ['5490000000003'] }, async () => {
        for (const n of [personal, excluido]) {
          // Cada uno con SU archivo registrado, para que lo único que frene sea ser personal o excluido.
          const propio = archivo('contacto-' + n.slice(0, 13) + '.jpg'); registrar(propio, n);
          for (const borrador of [false, true]) await con({ modoBorrador: borrador }, async () => {
            assert.deepStrictEqual(await evolution.enviarTexto(n, 'hola'), MOTIVO);
            assert.deepStrictEqual(await evolution.mostrarEscribiendo(n, 100), MOTIVO);
            assert.deepStrictEqual(await evolution.enviarImagen(n, foto), MOTIVO);
            assert.deepStrictEqual(await evolution.enviarDocumento(n, doc), MOTIVO);
            assert.deepStrictEqual(await evolution.enviarGenerado(n, propio, { tipo: 'imagen' }), MOTIVO);
            assert.strictEqual(pedidos.length, 0, 'salió un pedido para ' + n);
          });
        }
        // Control positivo: un número común sí hace los pedidos, y el grupo sigue recibiendo avisos.
        await evolution.enviarTexto(CHAT, 'hola');
        await evolution.mostrarEscribiendo(CHAT, 50);
        await evolution.avisarGrupo('aviso');
        assert.deepStrictEqual(pedidos.map((p) => [p.url.split('/').slice(-2).join('/'), p.body.number]),
          [['sendText/somospiedra', CHAT], ['sendPresence/somospiedra', CHAT], ['sendText/somospiedra', config.grupoAvisos]]);
      });
    } finally { estado().borrarExcluido('5490000000004'); }
  });
  await check('el log de un tipo desconocido dice "archivo generado"', async () => {
    const original = console.error; const lineas = [];
    console.error = (...a) => lineas.push(a.join(' '));
    try { await evolution.enviarGenerado(CHAT, jpg, { tipo: 'video' }); } finally { console.error = original; }
    assert.ok(lineas.some((l) => l.includes('archivo generado: tipo desconocido')), lineas.join('|'));
    assert.ok(!lineas.some((l) => l.includes('pdf generado')));
  });
  await check('carpeta por defecto en otro proceso: data/generados, sin crearla ni cargar estado', () => {
    const cwdVacio = fs.mkdtempSync(path.join(os.tmpdir(), 'generados-cwd-'));
    const defecto = path.join(path.resolve(__dirname, '..'), 'data', 'generados');
    const existia = fs.existsSync(defecto);
    const R = (m) => JSON.stringify(require.resolve(m));
    const codigo = `globalThis.fetch = () => { throw new Error('salió a la red'); }; const assert = require('assert');
      const config = require(${R('../src/config')}); require(${R('../src/evolution')}); require(${R('../src/generados')});
      assert.strictEqual(config.generadosDir, ${JSON.stringify(defecto)});
      assert.ok(!require.cache[${R('../src/state')}]);`;
    try { execFileSync(process.execPath, ['-e', codigo], { cwd: cwdVacio, env: { ...process.env, GENERADOS_DIR: '' }, stdio: 'inherit' }); }
    finally { fs.rmSync(cwdVacio, { recursive: true, force: true }); }
    assert.strictEqual(fs.existsSync(defecto), existia, 'se creó (o se borró) data/generados');
  });
  await check('catálogo conserva su candado y su resultado exacto', async () => {
    fs.mkdirSync(process.env.FOTOS_DIR, { recursive: true });
    for (const ruta of [jpg, process.env.FOTOS_DIR + '/../afuera.jpg']) {
      assert.deepStrictEqual(await evolution.enviarImagen(CHAT, ruta), { bloqueado: true, motivo: 'archivo fuera del catálogo' });
    }
    assert.strictEqual(pedidos.length, 0);
    const foto = path.join(process.env.FOTOS_DIR, 'catalogo.jpg'); fs.writeFileSync(foto, 'foto');
    await evolution.enviarImagen(CHAT, foto);
    assert.strictEqual(pedidos.length, 1); assert.strictEqual(pedidos[0].body.mimetype, 'image/jpeg');
  });
  await check('ningún generado se borró del disco, ni el vencido', () => {
    for (const ruta of archivos) assert.ok(fs.existsSync(ruta), ruta);
  });
  console.log(fallos ? '\n' + fallos + ' fallo(s)' : '\nTodo OK');
  process.exit(fallos ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(1); });
