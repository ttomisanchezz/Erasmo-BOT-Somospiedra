'use strict';
/**
 * Notas del cliente.
 *
 *   node test/notas.test.js
 *
 * Lo que el cliente cuenta y no entra en ningún campo ("es para mi hija") se
 * caía de las 15 líneas del historial. Ahora Gemini lo devuelve como `nota` en
 * la misma lectura del mensaje, y queda en el estado: como mucho 5.
 *
 * Lo que no se negocia y se prueba acá: sin Gemini no hay notas; las notas no
 * cambian ninguna decisión; y toda nota pasa por sinDatosPersonales antes de
 * guardarse y antes de volver a un prompt.
 *
 * Gemini se simula con un fetch de mentira: no sale nada a la red. El entorno
 * se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.GEMINI_MODEL = 'gemini-de-prueba';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-notas-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-notas-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
const local = require('../src/extractor-local');
const gemini = require('../src/gemini');
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

// Lo que "lee Gemini" en cada turno. Al pedido de entender (el que lleva
// esquema) se le devuelve esto; los pedidos de redactar se guardan para mirar
// qué instrucción recibieron.
let lecturaGemini = null;
const urls = [];
const redacciones = [];
globalThis.fetch = async (url, opciones) => {
  urls.push(String(url));
  const body = JSON.parse(opciones.body);
  let texto = 'dale, te cuento';
  if (body.generationConfig.responseSchema) texto = JSON.stringify(lecturaGemini);
  else redacciones.push(body.contents[0].parts[0].text);
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
};

/** Una lectura de Gemini mínima, con lo que se le cambie. */
function lee(extra = {}) {
  return {
    intencion: 'consulta_general',
    modelo: null,
    modelos: [],
    entrega: null,
    permuta: { ofrece: false },
    urgente: false,
    nota: null,
    ...extra,
  };
}

/** Un turno completo: el mensaje entra al historial, decide, y lo que dice también entra. */
async function turno(chat, mensaje, pushName = 'Cliente') {
  state.agregarAlHistorial(chat, 'cliente', mensaje);
  const r = await decidir(chat, mensaje, pushName);
  (r.mensajes || []).forEach((m) => salio(chat, m));
  return r;
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

(async () => {
  console.log('\nNotas del cliente\n');

  await check('sin Gemini (extractor local) no hay notas y el estado queda vacío', async () => {
    gemini.usarSoloLocal(true);
    try {
      assert.strictEqual(local.entender('es para mi hija, tenes el 13?').nota, null);
      const chat = '5491100000201@s.whatsapp.net';
      for (const m of ['hola, es para mi hija', 'tenes el 13?', 'me voy de viaje el 20, tengo 400 mil']) {
        await turno(chat, m);
      }
      assert.deepStrictEqual(state.obtener(chat).notas, []);
    } finally {
      gemini.usarSoloLocal(false);
    }
  });

  await check('Gemini devuelve una nota: queda guardada en el estado', async () => {
    const chat = '5491100000202@s.whatsapp.net';
    lecturaGemini = lee({ intencion: 'consulta_stock', modelo: '13', modelos: ['13'], nota: 'es para su hija' });
    await turno(chat, 'hola, tenes el 13? es para mi hija');
    assert.deepStrictEqual(state.obtener(chat).notas, ['es para su hija']);
  });

  await check('como mucho 5: se caen las más viejas, y una repetida no se suma', async () => {
    const chat = '5491100000203@s.whatsapp.net';
    const notas = [
      'es para su hija',
      'se va de viaje el 20',
      'ya compro el año pasado',
      'prefiere que le escriban a la tarde',
      'trabaja en el centro',
      'lo quiere regalar para un cumpleaños',
      'tiene un 11 que se le rompio',
    ];
    for (const nota of [...notas, 'Tiene un 11 que se le rompió']) {
      lecturaGemini = lee({ nota });
      await turno(chat, 'dale');
    }
    assert.deepStrictEqual(state.obtener(chat).notas, notas.slice(-5));
  });

  await check('la nota pasa por sinDatosPersonales antes de guardarse, en una sola línea', async () => {
    const chat = '5491100000204@s.whatsapp.net';
    lecturaGemini = lee({
      nota: 'Tomas pide que lo llamen al 299 555 0000\no que le escriban a hija.perez@correo.com',
    });
    await turno(chat, 'dale', 'Tomas');
    const [guardada] = state.obtener(chat).notas;
    assert.ok(guardada, 'no guardó la nota');
    assert.ok(guardada.includes('[telefono]') && guardada.includes('[mail]'), guardada);
    assert.ok(!/555|correo|tomas/i.test(guardada), 'quedó un dato personal: ' + guardada);
    assert.ok(!guardada.includes('\n'), 'la nota ocupa más de una línea');
  });

  await check('las notas llegan a redactar dentro de la instrucción, y limpias', async () => {
    const chat = '5491100000205@s.whatsapp.net';
    // Una nota vieja sin limpiar, como si hubiera quedado de antes: igual tiene
    // que salir limpia hacia Google.
    state.actualizar(chat, { notas: ['es para su hija', 'que la llamen al 2995550000'] });
    lecturaGemini = lee({ intencion: 'consulta_general' });
    const antes = redacciones.length;
    await turno(chat, 'que garantia tienen?');

    const nuevas = redacciones.slice(antes);
    assert.strictEqual(nuevas.length, 1, 'no se llamó a redactar');
    assert.ok(nuevas[0].includes('es para su hija'), 'la instrucción no trae las notas');
    assert.ok(nuevas[0].includes('[telefono]') && !nuevas[0].includes('2995550000'), 'salió un teléfono');
    assert.strictEqual(gemini.redactar.length, 3, 'redactar tiene que seguir recibiendo instrucción, nombre y reserva');
  });

  await check('las notas no cambian ninguna decisión', async () => {
    // Mismo chat dos veces, misma lectura de Gemini salvo la nota. Son caminos
    // sin variantes de estilo, así que las respuestas tienen que ser idénticas.
    // Con la entrega bajo el mínimo el bot insiste con la entrega inicial (bloque
    // 5b): la línea no rota al azar (la variante la elige el conteo), pero la
    // explicación de la financiación y el pie del PDF que van adelante sí. Se le
    // dan por llegados, como si una persona los hubiera mandado.
    const turnos = [
      ['quiero el 16 pro, tengo 300 mil', { intencion: 'declara_entrega', modelo: '16 pro', modelos: ['16 pro'], entrega: 300000 }],
      ['que garantia tienen?', { intencion: 'consulta_general' }],
      ['no, no llego a mas de 300', { intencion: 'precio_alto', entrega: 300000 }],
    ];
    const correr = async (chat, conNota) => {
      state.agregarAlHistorial(chat, 'vendedor', 'te cuento, financiamos el celular, lo que pedimos es una entrega inicial y el resto lo financias en 1 o 2 cuotas');
      state.agregarAlHistorial(chat, 'vendedor', 'no necesitas tarjeta, solo tu dni y un compromiso de pago, te lo paso asi lo lees');
      state.actualizar(chat, { compromisoEnviado: true });
      const respuestas = [];
      for (const [i, [mensaje, lectura]] of turnos.entries()) {
        lecturaGemini = lee({ ...lectura, nota: conNota ? `nota numero ${i + 1}` : null });
        const r = await turno(chat, mensaje);
        respuestas.push({ mensajes: r.mensajes, escalar: !!r.escalar, motivo: r.motivo || '' });
      }
      const { notas, historial, ultimaLectura, ...resto } = state.obtener(chat);
      // `ultimaLectura.ts` es la hora de la lectura (datos viejos, Pendientes 1): cambia
      // entre corridas, como el `ts` de cada línea del historial. Se compara sin ella.
      const { ts: _ts, ...lectura } = ultimaLectura || {};
      return { respuestas, resto: { ...resto, ultimaLectura: lectura }, notas, historial: historial.map((h) => [h.quien, h.texto]) };
    };

    const sin = await correr('5491100000206@s.whatsapp.net', false);
    const con = await correr('5491100000207@s.whatsapp.net', true);
    assert.strictEqual(con.notas.length, 3, 'la prueba no llegó a guardar notas');
    assert.deepStrictEqual(con.respuestas, sin.respuestas);
    assert.deepStrictEqual(con.historial, sin.historial);
    assert.deepStrictEqual(con.resto, sin.resto);
  });

  await check('ningún pedido salió con otra clave que la de la prueba', async () => {
    assert.ok(urls.length > 0, 'no se simuló ningún pedido');
    assert.ok(urls.every((u) => u.includes('de-mentira-para-la-prueba')));
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // no se llegó a crear
    }
  }
  process.exit(fallos ? 1 : 0);
})();
