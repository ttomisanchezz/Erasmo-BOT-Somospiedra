'use strict';
/**
 * El saludo del día (bloque 9, decisiones de Tomás del 24/09/2026).
 *
 *   node test/saludo.test.js
 *
 * Lo de punta a punta está en test/casos.js ("Bloque 9"). Acá va lo que el banco de
 * casos no ve:
 *   - "hoy" es el día de Argentina, no el de la PC ni el de UTC (este archivo corre con
 *     la PC en otra zona);
 *   - "hoy ya se habló" sale de tres lados: el saludo que salió (`saludoEn`), una
 *     persona de la cuenta (`ultimoHumano`, que index.js pone y el banco de casos no) y
 *     cualquier línea del vendedor de hoy en el historial;
 *   - el saludo lleva su marca, y pegado al primer mensaje suma la del mensaje;
 *   - qué cuenta como preguntar cómo estamos.
 *
 * Sin red: entiende el extractor local. El entorno se fija acá y no se hereda del .env.
 */
// Una zona que no es la de Argentina: el día tiene que salir de America/Argentina/Buenos_Aires.
process.env.TZ = 'Asia/Tokyo';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.GEMINI_API_KEY = '';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-saludo-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-saludo-' + process.pid + '.jsonl');
process.on('exit', () => {
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // no se llegó a crear
    }
  }
});

const PLANILLA = require('./fixture-planilla');
const sheets = require('../src/sheets');
sheets.usarFixture(PLANILLA);
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const state = require('../src/state');
const acciones = require('../src/acciones');
const estilo = require('../src/estilo');
const { decidir, hablaronHoy, preguntaComoEstan, conSaludo } = require('../src/responder');

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
const nuevoChat = () => '54900000' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const HORA = 60 * 60 * 1000;

/** Un turno como en el banco de casos: entra al historial, decide, y lo que dice también entra. */
async function turno(chat, texto) {
  state.agregarAlHistorial(chat, 'cliente', texto);
  const r = await decidir(chat, texto, 'Tomas');
  for (const m of r.mensajes || []) {
    state.agregarAlHistorial(chat, 'vendedor', acciones.paraHistorial(m));
    state.confirmarMarcas(chat, acciones.marcasDe(m));
  }
  return r;
}

const SALUDOS = [...estilo.variantes('saludo', 'tomass'), ...estilo.variantes('saludoDevuelve', 'tomass')].map((v) =>
  v.toLowerCase()
);
const arrancaConSaludo = (m) => SALUDOS.some((v) => acciones.comoTexto(m).toLowerCase().startsWith(v));

(async () => {
  console.log('\nEl saludo del día\n');

  await check('"hoy" es el día de Argentina: 23:30 y 12:00 del 23/09 son el mismo día aunque en UTC no', async () => {
    const ahora = Date.parse('2026-09-24T02:30:00Z'); // 23:30 del 23/09 en Argentina
    const ctx = { historial: [{ quien: 'vendedor', texto: 'hola', ts: Date.parse('2026-09-23T15:00:00Z') }] };
    assert.strictEqual(hablaronHoy(ctx, ahora), true);
  });

  await check('"hoy" es el día de Argentina: 00:30 del 24/09 no es el mismo día que 23:30 del 23/09', async () => {
    const ahora = Date.parse('2026-09-24T03:30:00Z'); // 00:30 del 24/09 en Argentina (12:30 en Tokio)
    const ctx = { historial: [{ quien: 'vendedor', texto: 'hola', ts: Date.parse('2026-09-24T02:30:00Z') }] };
    assert.strictEqual(hablaronHoy(ctx, ahora), false);
  });

  await check('una línea del cliente de hoy no es que se habló: solo cuenta el vendedor', async () => {
    const ahora = Date.now();
    assert.strictEqual(hablaronHoy({ historial: [{ quien: 'cliente', texto: 'hola', ts: ahora }] }, ahora), false);
    assert.strictEqual(hablaronHoy({}, ahora), false);
  });

  await check('una persona de la cuenta que escribió hoy cuenta, aunque su línea ya no esté en el historial', async () => {
    const ahora = Date.now();
    const soloCliente = Array.from({ length: 15 }, (_, i) => ({ quien: 'cliente', texto: `m${i}`, ts: ahora }));
    assert.strictEqual(hablaronHoy({ historial: soloCliente, ultimoHumano: ahora - HORA / 2 }, ahora), true);
    assert.strictEqual(hablaronHoy({ historial: soloCliente, ultimoHumano: ahora - 30 * HORA }, ahora), false);
  });

  await check('el saludo que salió hoy cuenta; el de ayer no', async () => {
    const ahora = Date.now();
    assert.strictEqual(hablaronHoy({ saludoEn: ahora - HORA / 2 }, ahora), true);
    assert.strictEqual(hablaronHoy({ saludoEn: ahora - 30 * HORA }, ahora), false);
    // El `yaSaludo: true` de los chats de antes del bloque 9 no dice de qué día es.
    assert.strictEqual(hablaronHoy({ yaSaludo: true }, ahora), false);
  });

  await check('la charla fue hace 30 h (otro día en Argentina): saluda de nuevo', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    const s = state.obtener(chat);
    const atras = 30 * HORA;
    state.actualizar(chat, {
      historial: s.historial.map((l) => ({ ...l, ts: l.ts - atras })),
      saludoEn: s.saludoEn - atras,
    });
    const r = await turno(chat, 'y el 14 pro?');
    assert.ok(arrancaConSaludo(r.mensajes[0]), 'no saludó al otro día: ' + acciones.comoTexto(r.mensajes[0]));
  });

  await check('el saludo lleva su marca (`saludoEn`), y se confirma cuando sale', async () => {
    const chat = nuevoChat();
    const antes = Date.now();
    state.agregarAlHistorial(chat, 'cliente', 'tenes el 13?');
    const r = await decidir(chat, 'tenes el 13?', 'Tomas');
    assert.ok(arrancaConSaludo(r.mensajes[0]), 'no saludó: ' + acciones.comoTexto(r.mensajes[0]));
    const marcas = acciones.marcasDe(r.mensajes[0]) || {};
    assert.ok(marcas.saludoEn >= antes, 'el saludo no lleva saludoEn: ' + JSON.stringify(marcas));
    assert.ok(!state.obtener(chat).saludoEn, 'se anotó al decidir: tiene que esperar a que salga');
    state.confirmarMarcas(chat, marcas);
    assert.strictEqual(state.obtener(chat).saludoEn, marcas.saludoEn);
  });

  await check('pegado al primer mensaje (4 mensajes), el saludo suma su marca a la del mensaje', async () => {
    // El 13 con un detalle cargado: sí lo tenemos · precio · detalle · otro modelo = 4.
    const conDetalle = {
      ...PLANILLA,
      lista: PLANILLA.lista.map((f) => (f.modelo === 'iPhone 13' ? { ...f, detalles: 'Marco con un golpe' } : f)),
    };
    sheets.usarFixture(conDetalle);
    try {
      const chat = nuevoChat();
      state.agregarAlHistorial(chat, 'cliente', 'tenes el 13?');
      const r = await decidir(chat, 'tenes el 13?', 'Tomas');
      assert.strictEqual(r.mensajes.length, 4, 'no son 4: ' + r.mensajes.map(acciones.comoTexto).join(' | '));
      const primero = acciones.comoTexto(r.mensajes[0]);
      assert.ok(arrancaConSaludo(primero) && /\ntenemos|\nsi+,? /i.test(primero), 'el saludo no quedó pegado al "sí lo tenemos": ' + primero);
      const marcas = acciones.marcasDe(r.mensajes[0]) || {};
      assert.ok(marcas.saludoEn, 'perdió la marca del saludo: ' + JSON.stringify(marcas));
      assert.strictEqual(marcas.stockInformadoDe, 'iPhone 13', 'perdió la marca del mensaje: ' + JSON.stringify(marcas));
      assert.ok(/marco con un golpe/i.test(r.mensajes.map(acciones.comoTexto).join(' ')), 'se perdió el detalle');
    } finally {
      sheets.usarFixture(PLANILLA);
    }
  });

  await check('con 4 mensajes que arrancan con el PDF o la cotización, el saludo no se pega (nunca un documento como texto) y siguen siendo 4', async () => {
    const pdf = acciones.doc('compromiso', 'no hace falta tarjeta, solo tu dni');
    const resto = ['uno', 'dos', 'tres'];
    assert.deepStrictEqual(conSaludo([pdf, ...resto], 'Tomas', 'hola', 1), [pdf, ...resto]);
    const ficha = '📱 *iPhone 13 128GB — batería 100%*\nCon una entrega de *$400.000*:';
    assert.deepStrictEqual(conSaludo([ficha, ...resto], 'Tomas', 'hola', 1), [ficha, ...resto]);
    // Con menos de 4, el saludo va aparte y adelante, con su marca.
    const [saludo, ...siguen] = conSaludo([pdf, 'uno'], 'Tomas', 'hola', 1);
    assert.ok(arrancaConSaludo(saludo) && acciones.marcasDe(saludo).saludoEn === 1, JSON.stringify(saludo));
    assert.deepStrictEqual(siguen, [pdf, 'uno']);
  });

  await check('un "hola" suelto: el saludo y la pregunta, y el conteo sin venta viaja con el primero', async () => {
    const chat = nuevoChat();
    state.agregarAlHistorial(chat, 'cliente', 'hola');
    const r = await decidir(chat, 'hola', 'Tomas');
    assert.strictEqual(r.mensajes.length, 2, r.mensajes.map(acciones.comoTexto).join(' | '));
    assert.ok(arrancaConSaludo(r.mensajes[0]));
    const marcas = acciones.marcasDe(r.mensajes[0]) || {};
    assert.ok(marcas.saludoEn && marcas.sinVenta === 1, JSON.stringify(marcas));
  });

  await check('sin nada que mandar no hay saludo: un acuse repetido', async () => {
    const chat = nuevoChat();
    const r1 = await turno(chat, 'ok');
    assert.ok(arrancaConSaludo(r1.mensajes[0]), 'el primer acuse se contesta, con el saludo del día');
    const r2 = await turno(chat, 'ok');
    assert.deepStrictEqual(r2.mensajes, [], 'el segundo acuse no se contesta, y tampoco se saluda');
  });

  await check('qué cuenta como preguntar cómo estamos', async () => {
    const si = [
      'buenass como estan tenes iphone 14 pro? 15 pro? tengo 200.000',
      'hola como andan?',
      'Hola, cómo estás? tenés el 13?',
      'buenas como va? tenes el 15',
      'como va todo? consulta',
      'hola que tal, tenes el 13?',
      'buenas, todo bien? tenes el 13?',
      'todo bien? tenes el 13',
      'hola buen dia, todo bien? consulta por el 13',
      'hola todo bien tenes el 13',
      'hola como anda?',
      'hola como esta usted',
    ];
    const no = [
      'hola, tenes iphone 14 pro y 15 pro?',
      'como estan de precio los 13?',
      'como va la financiacion?',
      'como va a ser el pago?',
      'como anda el 13 de bateria?',
      'como esta el 15?',
      'que tal el 14 pro?',
      'como es la financiacion?',
      'si todo bien, tenes el 13?',
      'como van los precios?',
    ];
    for (const t of si) assert.ok(preguntaComoEstan(t), 'no lo leyó como pregunta: ' + t);
    for (const t of no) assert.ok(!preguntaComoEstan(t), 'lo leyó como pregunta y no lo es: ' + t);
  });

  console.log(fallos ? `\n${fallos} con fallas\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
