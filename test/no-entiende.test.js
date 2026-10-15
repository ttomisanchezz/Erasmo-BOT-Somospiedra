'use strict';
/**
 * Mensajes que no se entienden: cuándo pasan a una persona.
 *
 *   node test/no-entiende.test.js
 *
 * Lo de punta a punta está en test/casos.js ("No se entiende"). Acá va lo que
 * el banco de casos no ve:
 *   - el contador viejo (`mensajesSinContenido`) de los chats de antes se ignora
 *     sin tocar el estado;
 *   - un mensaje que el bot no evaluó (atendía una persona) igual corta la cadena;
 *   - la marca se borra con el primer mensaje entendido, y un acuse no la toca.
 *
 * Sin red: entiende el extractor local. El entorno se fija acá y no se hereda
 * del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.GEMINI_API_KEY = '';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-no-entiende-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-no-entiende-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const state = require('../src/state');
const { decidir } = require('../src/responder');

// Un mensaje que SALE: al historial va lo que ve el cliente y se confirman sus
// marcas de 'ya se dijo', igual que hace index.js cuando Evolution acusa el envío
// (bloque 3 de la auditoría). Acá todo envío se considera exitoso.
const acciones = require('../src/acciones');
function salio(chat, m) {
  state.agregarAlHistorial(chat, 'vendedor', acciones.paraHistorial(m));
  state.confirmarMarcas(chat, acciones.marcasDe(m));
}

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

let n = 0;
const nuevoChat = () => '54929988' + String(n++).padStart(5, '0') + '@s.whatsapp.net';

/** Un turno como en el banco de casos: entra al historial, decide, y lo que dice también entra. */
async function turno(chat, texto) {
  state.agregarAlHistorial(chat, 'cliente', texto);
  const r = await decidir(chat, texto, 'Lucia');
  (r.mensajes || []).forEach((m) => salio(chat, m));
  return r;
}
// Un mensaje puede venir como objeto si confirma marcas al salir (acciones.conMarcas).
const pregunta = (r) =>
  (r.mensajes || []).some((m) => /contame que estabas buscando/i.test(acciones.comoTexto(m)));

(async () => {
  console.log('\nNo se entiende\n');

  await check('un chat de antes con mensajesSinContenido en 1 no escala con el primer mensaje raro', async () => {
    const chat = nuevoChat();
    state.actualizar(chat, { mensajesSinContenido: 1 });
    const r = await turno(chat, 'asdasd');
    assert.ok(!r.escalar, 'escaló por el contador viejo');
    assert.ok(pregunta(r), 'no preguntó qué buscaba: ' + JSON.stringify(r.mensajes));
    assert.strictEqual(state.obtener(chat).mensajesSinContenido, 1, 'tocó el contador viejo');
    const r2 = await turno(chat, 'kkkkkk');
    assert.ok(r2.escalar, 'con dos seguidos tendría que escalar');
  });

  await check('un mensaje del cliente que el bot no evaluó (atendía una persona) corta la cadena', async () => {
    const chat = nuevoChat();
    await turno(chat, 'asdasd');
    // Entra al historial sin pasar por decidir, como en vivo con una persona atendiendo.
    state.agregarAlHistorial(chat, 'vendedor', 'hola! si, contame');
    state.agregarAlHistorial(chat, 'cliente', 'tenes el 13?');
    const r = await turno(chat, 'kkkkkk');
    // Desde cero, D5 (29/09/2026): la pregunta ya se le hizo, así que no se repite y escala
    // callado; pero la cadena se cortó: el motivo no es el de dos mensajes que no se entienden.
    assert.ok(r.escalar && !r.mensajes.length, 'repitió la pregunta ya hecha: ' + JSON.stringify(r.mensajes));
    assert.ok(/ya se lo dije/.test(r.motivo), 'escaló por dos seguidos aunque en el medio hubo un mensaje que no era un acuse: ' + r.motivo);
  });

  await check('la marca se borra con el primer mensaje entendido', async () => {
    const chat = nuevoChat();
    await turno(chat, 'asdasd');
    assert.ok(state.obtener(chat).noEntendido, 'el caso no prueba nada: no quedó la marca');
    await turno(chat, 'donde estan?');
    assert.strictEqual(state.obtener(chat).noEntendido, null, 'la marca siguió después de un mensaje entendido');
  });

  await check('un acuse no borra la marca ni suma: el siguiente mensaje raro escala', async () => {
    const chat = nuevoChat();
    await turno(chat, 'asdasd');
    const marca = state.obtener(chat).noEntendido;
    const rAcuse = await turno(chat, 'ok');
    assert.ok(!rAcuse.escalar, 'el acuse escaló');
    assert.deepStrictEqual(state.obtener(chat).noEntendido, marca, 'el acuse cambió la marca');
    const r = await turno(chat, 'kkkkkk');
    assert.ok(r.escalar, 'no escaló con dos mensajes raros separados solo por un acuse');
  });

  await check('ok, si, no y un emoji solo son acuses; una palabra rara no', async () => {
    for (const acuse of ['ok', 'Si', 'no', '👍', 'dale']) {
      const chat = nuevoChat();
      await turno(chat, 'asdasd');
      await turno(chat, acuse);
      assert.ok((await turno(chat, 'kkkkkk')).escalar, `"${acuse}" cortó la cadena`);
    }
    const chat = nuevoChat();
    const primero = await turno(chat, 'ok');
    assert.ok(!primero.escalar && !state.obtener(chat).noEntendido, 'un acuse dejó marca');
    // Desde cero, D5 (29/09/2026): la pregunta ya se le hizo con el acuse, así que no se repite
    // y escala callado. Un acuse, en cambio, no escalaría: la palabra rara no es un acuse.
    const raro = await turno(chat, 'qwrtyp');
    assert.ok(raro.escalar && /ya se lo dije/.test(raro.motivo), 'una palabra rara se trató como un acuse: ' + JSON.stringify(raro));
  });

  await check('acuses repetidos: el primero se contesta, los que siguen no', async () => {
    const chat = nuevoChat();
    assert.ok(pregunta(await turno(chat, 'ok')), 'el primer acuse no se contestó');
    const segundo = await turno(chat, '👍');
    assert.deepStrictEqual(segundo.mensajes, [], 'contestó el segundo acuse seguido');
    assert.ok(!segundo.escalar, 'el segundo acuse escaló');
    // Un mensaje en el medio que el bot no evaluó (atendía una persona): el acuse ya no es
    // "seguido", pero la pregunta ya se le hizo. Desde cero, D5 (29/09/2026, con la respuesta
    // de Tomás para los acuses): no se repite, no se contesta nada y no escala.
    state.agregarAlHistorial(chat, 'cliente', 'tenes el 13?');
    const tercero = await turno(chat, 'ok');
    assert.deepStrictEqual(tercero.mensajes, [], 'repitió la pregunta ya hecha');
    assert.ok(!tercero.escalar, 'el acuse escaló');
  });

  console.log('\nLa marca viaja con la pregunta (Pendientes 2)\n');

  // Decisión de Tomás del 21/09/2026: `noEntendido` y `sinVenta` se escribían al decidir,
  // así que en escucha, en borrador o con una tanda cortada contaban igual, y un cliente
  // con dos mensajes raros quedaba escalado sin haber recibido nunca la pregunta. Ahora
  // viajan como marcas en el PRIMER mensaje de la respuesta (acciones.conMarcas) y las
  // confirma index.js con el id de Evolution en la mano. De punta a punta, con index.js,
  // está en test/sin-venta.test.js.

  /** Un turno donde la respuesta NO sale (borrador, escucha, tanda cortada): no entra al historial ni confirma nada. */
  async function turnoSinEntrega(chat, texto) {
    state.agregarAlHistorial(chat, 'cliente', texto);
    return decidir(chat, texto, 'Lucia');
  }

  await check('decidir no anota noEntendido ni sinVenta: van como marcas en el primer mensaje', async () => {
    const chat = nuevoChat();
    const r = await turnoSinEntrega(chat, 'asdasd');
    assert.ok(pregunta(r), 'no preguntó qué buscaba: ' + JSON.stringify(r.mensajes));
    // Bloque 9: en un chat nuevo el primer mensaje es el saludo del día. `sinVenta` va en el
    // primero (el saludo) y `noEntendido` sigue con la pregunta, que es la que tiene que llegar.
    const iPregunta = r.mensajes.findIndex((m) => /contame que estabas buscando/i.test(acciones.comoTexto(m)));
    assert.strictEqual(iPregunta, 1, 'el saludo no va antes de la pregunta: ' + JSON.stringify(r.mensajes));
    const deLaPregunta = acciones.marcasDe(r.mensajes[iPregunta]) || {};
    assert.strictEqual(deLaPregunta.noEntendido && deLaPregunta.noEntendido.texto, 'asdasd', 'la pregunta no lleva la marca noEntendido: ' + JSON.stringify(deLaPregunta));
    const marcas = acciones.marcasDe(r.mensajes[0]) || {};
    assert.strictEqual(marcas.sinVenta, 1, 'el primer mensaje no lleva sinVenta: ' + JSON.stringify(marcas));
    const s = state.obtener(chat);
    assert.ok(!s.noEntendido, 'anotó noEntendido al decidir: ' + JSON.stringify(s.noEntendido));
    assert.ok(!s.sinVenta, 'anotó sinVenta al decidir: ' + s.sinVenta);
  });

  await check('si la pregunta no salió, dos mensajes raros seguidos no escalan; cuando sale, el siguiente sí, y un tercero también', async () => {
    const chat = nuevoChat();
    await turnoSinEntrega(chat, 'asdasd');
    const r2 = await turnoSinEntrega(chat, 'kkkkkk');
    assert.ok(!r2.escalar, 'escaló sin que la primera pregunta le hubiera llegado');
    assert.ok(pregunta(r2), 'no volvió a preguntar: ' + JSON.stringify(r2.mensajes));
    const r3 = await turno(chat, 'qwrtyp'); // esta sí sale
    assert.ok(!r3.escalar && pregunta(r3), 'la primera pregunta que sale no tiene que escalar');
    assert.strictEqual(state.obtener(chat).noEntendido.texto, 'qwrtyp', 'la pregunta salió y no confirmó la marca');
    assert.ok((await turno(chat, 'zxcvbn')).escalar, 'con la pregunta ya recibida, el siguiente mensaje raro tenía que escalar');
    assert.ok((await turno(chat, 'mnbvcx')).escalar, 'un tercero seguido también escala, como siempre');
  });

  await check('con varios mensajes, sinVenta va solo en el primero', async () => {
    const chat = nuevoChat();
    const r = await turnoSinEntrega(chat, 'hola');
    assert.ok(r.mensajes.length > 1, 'el caso no prueba nada: el saludo salió en un solo mensaje');
    assert.strictEqual((acciones.marcasDe(r.mensajes[0]) || {}).sinVenta, 1, 'el primer mensaje no lleva sinVenta');
    for (const m of r.mensajes.slice(1)) {
      assert.ok(!('sinVenta' in (acciones.marcasDe(m) || {})), 'sinVenta va en más de un mensaje');
    }
  });

  await check('sin entrega el crédito no se gasta: seis saludos que no salieron no callan al bot', async () => {
    const chat = nuevoChat();
    let r;
    for (let i = 0; i < 7; i++) r = await turnoSinEntrega(chat, 'hola');
    assert.ok(!r.silencioso && r.mensajes.length > 0, 'se calló por mensajes que nunca contestó');
    assert.ok(!state.obtener(chat).sinVenta, 'sinVenta quedó en ' + state.obtener(chat).sinVenta);
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos ? 1 : 0);
})();
