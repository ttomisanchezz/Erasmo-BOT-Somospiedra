'use strict';
/**
 * Lo que redacta Gemini en la consulta general (Mejora 1, decisión del negocio
 * del 16/09/2026).
 *
 *   node test/redactar.test.js
 *
 * `redactar` es el único camino por el que el bot manda texto libre. Dos cierres:
 *  - si el mensaje nombra un modelo, no se llama: Gemini podía contestar también
 *    el stock ("¿tenés el 13 blanco? ¿qué garantía tiene?"). Va la reserva de
 *    datos fijos;
 *  - la instrucción no le deja contestar disponibilidad, stock ni modelos, y ya no
 *    le pide "decí que en un rato te confirman". Si la respuesta no está en los
 *    datos, devuelve `gemini.SIN_DATO`: con esa marca, sola o mezclada, al cliente
 *    no le sale nada y se escala.
 *
 * `evaluar --offline` nunca ejercita la salida real de `redactar`: acá se simula.
 * Sin red, extractor local, números inventados. El entorno se fija acá y no se
 * hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000033@g.us';
const ESPERA = 60;

process.env.ESPERA_MIN_MS = String(ESPERA);
process.env.ESPERA_MAX_MS = String(ESPERA + 1);
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
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
process.env.HOST = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-redactar-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-redactar-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);

// Gemini de mentira: anota cada instrucción y contesta lo que diga `respuesta`.
const pedidos = [];
let respuesta = (instruccion, nombre, reserva) => reserva;
gemini.redactar = async (instruccion, nombre, reserva) => {
  pedidos.push(instruccion);
  return respuesta(instruccion, nombre, reserva);
};

let idN = 0;
const aClientes = [];
const alGrupo = [];
async function envio(numero, tipo, texto) {
  const registro = { numero, tipo, texto, id: 'BOT' + ++idN };
  aClientes.push(registro);
  return { key: { remoteJid: numero, fromMe: true, id: registro.id } };
}
evolution.enviarTexto = (numero, texto) => envio(numero, 'texto', texto);
evolution.enviarImagen = (numero) => envio(numero, 'imagen', '');
evolution.enviarDocumento = (numero, ruta, pie) => envio(numero, 'documento', pie);
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const acciones = require('../src/acciones');
const { decidir } = require('../src/responder');

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
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
function limpiar() {
  pedidos.length = 0;
  aClientes.length = 0;
  alGrupo.length = 0;
  respuesta = (instruccion, nombre, reserva) => reserva;
}
async function turno(chat, texto) {
  state.agregarAlHistorial(chat, 'cliente', texto);
  return decidir(chat, texto, 'Lucia');
}

const GARANTIA = 'que garantia tienen?';

(async () => {
  console.log('\nLa instrucción\n');

  await check('1. la instrucción le prohíbe contestar disponibilidad, stock y modelos, no dice "te confirman" y pide la marca', async () => {
    limpiar();
    await turno(nuevoChat(), GARANTIA);
    assert.strictEqual(pedidos.length, 1, `el caso no prueba nada: redactar se llamó ${pedidos.length} veces`);
    const [instruccion] = pedidos;
    assert.ok(/disponibilidad, stock ni modelos/i.test(instruccion), 'no prohíbe disponibilidad, stock ni modelos: ' + instruccion);
    assert.ok(!/te confirman/i.test(instruccion), 'sigue diciendo "te confirman": ' + instruccion);
    assert.ok(!/en un rato/i.test(instruccion), 'sigue diciendo "en un rato": ' + instruccion);
    assert.ok(typeof gemini.SIN_DATO === 'string' && gemini.SIN_DATO.length > 0, 'gemini.SIN_DATO no existe');
    assert.ok(instruccion.includes(gemini.SIN_DATO), 'no le pide la marca SIN_DATO: ' + instruccion);
  });

  console.log('\nLa marca de "no está en los datos"\n');

  await check('2. Gemini devuelve solo la marca: escala y al cliente no le sale nada', async () => {
    limpiar();
    respuesta = () => gemini.SIN_DATO;
    const r = await turno(nuevoChat(), GARANTIA);
    assert.strictEqual(r.escalar, true, 'no escaló');
    assert.deepStrictEqual(r.mensajes, [], 'le sale algo al cliente: ' + JSON.stringify(r.mensajes));
  });

  await check('2. la marca mezclada con texto (y en minúscula): tampoco sale nada y escala', async () => {
    for (const texto of [
      `todos los equipos tienen 1 mes de garantia\n${gemini.SIN_DATO}`,
      `${gemini.SIN_DATO.toLowerCase()} todos tienen garantia`,
    ]) {
      limpiar();
      respuesta = () => texto;
      const r = await turno(nuevoChat(), GARANTIA);
      assert.strictEqual(r.escalar, true, 'no escaló con: ' + JSON.stringify(texto));
      assert.deepStrictEqual(r.mensajes, [], 'le sale algo al cliente con ' + JSON.stringify(texto) + ': ' + JSON.stringify(r.mensajes));
    }
  });

  await check('2. por index.js: con la marca no le llega nada al cliente y el grupo recibe el aviso', async () => {
    limpiar();
    respuesta = () => gemini.SIN_DATO;
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, GARANTIA));
    assert.deepStrictEqual(aEste(chat), [], 'le llegó algo al cliente: ' + JSON.stringify(aEste(chat)));
    assert.ok(alGrupo.some((t) => t.includes(chat.split('@')[0])), 'no avisó al grupo: ' + JSON.stringify(alGrupo));
    assert.strictEqual(state.obtener(chat).escalado, true, 'no quedó escalado');
  });

  await check('control: una respuesta normal de Gemini sale tal cual', async () => {
    limpiar();
    respuesta = () => 'sii, todos tienen 1 mes de garantia';
    const r = await turno(nuevoChat(), GARANTIA);
    assert.ok(!r.escalar, 'escaló una respuesta normal');
    // Un mensaje puede venir como objeto si confirma marcas al salir (acciones.conMarcas).
    // Bloque 9: en un chat nuevo va primero el saludo del día, y después la respuesta tal cual.
    const [saludo, ...resto] = r.mensajes.map(acciones.comoTexto);
    assert.ok(/^(hola|buenass|luciaa)\b/i.test(saludo), 'no arrancó con el saludo: ' + JSON.stringify(r.mensajes));
    assert.deepStrictEqual(resto, ['Sii, todos tienen 1 mes de garantia'], 'no salió la respuesta: ' + JSON.stringify(r.mensajes));
  });

  await check('control: un marcador de acción ([doc:]) sigue yendo al texto fijo, sin escalar (A2)', async () => {
    limpiar();
    respuesta = () => '[doc: compromiso] todos tienen garantia';
    const r = await turno(nuevoChat(), GARANTIA);
    assert.ok(!r.escalar, 'escaló un marcador de acción');
    // Bloque 9: en un chat nuevo va primero el saludo del día; lo que sigue es el texto fijo.
    const [saludo, ...textos] = r.mensajes.map(acciones.comoTexto);
    assert.ok(/^(hola|buenass|luciaa)\b/i.test(saludo), 'no arrancó con el saludo: ' + JSON.stringify(r.mensajes));
    assert.ok(textos.length && textos.every((m) => /garantia/i.test(m) && !/\[doc/i.test(m)), 'no fue el texto fijo: ' + JSON.stringify(r.mensajes));
  });

  console.log('\nEl saludo y el relleno de Gemini (desde cero, grupo 10, 29/09/2026)\n');

  await check('4. "tenes el 13?" y "horario de atencion?": lo de los turnos, sin el "buenass" ni el "tranqui" que agrega Gemini', async () => {
    limpiar();
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    respuesta = () => 'buenass\nnos manejamos con turnos para la atencion al cliente\ntranqui';
    const r = await turno(chat, 'horario de atencion?');
    assert.strictEqual(pedidos.length, 1, `el caso no prueba nada: redactar se llamó ${pedidos.length} veces`);
    const textos = r.mensajes.map(acciones.comoTexto).filter((t) => !/luciaa/i.test(t)); // sin el saludo del día (bloque 9)
    assert.deepStrictEqual(textos, ['Nos manejamos con turnos para la atencion al cliente'], 'salió el saludo o el relleno: ' + JSON.stringify(textos));
  });

  await check('4. el saludo pegado al principio se saca y el mensaje de relleno se va', async () => {
    limpiar();
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    respuesta = () => 'Buenass mira, todos tienen 1 mes de garantia\n\nQuedo atento, dale joya';
    const r = await turno(chat, GARANTIA);
    assert.strictEqual(pedidos.length, 1, `el caso no prueba nada: redactar se llamó ${pedidos.length} veces`);
    const textos = r.mensajes.map(acciones.comoTexto).filter((t) => !/luciaa/i.test(t)); // sin el saludo del día (bloque 9)
    assert.deepStrictEqual(textos, ['Mira, todos tienen 1 mes de garantia'], 'salió el saludo o el relleno: ' + JSON.stringify(textos));
  });

  await check('4. si Gemini solo devuelve saludo y relleno, sale el texto fijo', async () => {
    limpiar();
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    respuesta = () => 'Buenass\nTranqui';
    const r = await turno(chat, 'horario de atencion?');
    const textos = r.mensajes.map(acciones.comoTexto).filter((t) => !/luciaa/i.test(t)); // sin el saludo del día (bloque 9)
    assert.deepStrictEqual(textos, ['Nos manejamos con turnos para la atencion al cliente'], 'no salió el texto fijo: ' + JSON.stringify(textos));
  });

  // El ". tranqui" pegado (01/10/2026): una muletilla suelta al final de una línea, después de
  // un punto, una coma o un signo, se va. En el medio de la frase queda.
  await check('5. "como es la entrega?" sin modelo: sale sin el ". tranqui" pegado al final', async () => {
    limpiar();
    const chat = nuevoChat();
    await turno(chat, 'hola');
    respuesta = () =>
      'Te cuento, financiamos el celular, lo que pedimos es una entrega inicial y el resto lo financias en 1 o 2 cuotas. tranqui';
    const r = await turno(chat, 'como es la entrega?');
    assert.strictEqual(pedidos.length, 1, `el caso no prueba nada: redactar se llamó ${pedidos.length} veces`);
    const textos = r.mensajes.map(acciones.comoTexto).filter((t) => !/luciaa/i.test(t));
    assert.deepStrictEqual(textos, [
      'Te cuento, financiamos el celular, lo que pedimos es una entrega inicial y el resto lo financias en 1 o 2 cuotas.',
    ]);
  });

  await check('5. después de una coma o de un signo también se va (dale, sii, perfecto, dale joya, quedo atento); en el medio de la frase queda', async () => {
    limpiar();
    const chat = nuevoChat();
    await turno(chat, 'hola');
    respuesta = () =>
      'dale, te cuento: es una entrega inicial y el resto en 1 o 2 cuotas, dale joya\n' +
      'con tu dni alcanza! quedo atento\n' +
      'no hace falta tarjeta? sii, dale. perfecto';
    const r = await turno(chat, 'como es la entrega?');
    assert.strictEqual(pedidos.length, 1, `el caso no prueba nada: redactar se llamó ${pedidos.length} veces`);
    const textos = r.mensajes.map(acciones.comoTexto).filter((t) => !/luciaa/i.test(t));
    assert.deepStrictEqual(textos, [
      'Dale, te cuento: es una entrega inicial y el resto en 1 o 2 cuotas',
      'Con tu dni alcanza!',
      'No hace falta tarjeta?',
    ]);
  });

  await check('4. el estilo que se le pasa a Gemini ya no tiene "buenass" y le dice que no salude', async () => {
    assert.ok(typeof gemini.ESTILO === 'string' && gemini.ESTILO.length > 0, 'gemini.ESTILO no está exportado');
    assert.ok(!/buenass/i.test(gemini.ESTILO), '"buenass" sigue en el estilo: ' + gemini.ESTILO);
    assert.ok(/no saludes/i.test(gemini.ESTILO), 'no le dice que no salude: ' + gemini.ESTILO);
  });

  console.log('\nNombra un modelo\n');

  await check('3. "tenes el 13 blanco? que garantia tiene?": no llama a redactar y sale la reserva de garantía', async () => {
    limpiar();
    respuesta = () => 'sii, el 13 blanco lo tenemos y tiene 1 mes de garantia';
    const r = await turno(nuevoChat(), 'tenes el 13 blanco? que garantia tiene?');
    assert.strictEqual(pedidos.length, 0, 'llamó a redactar: ' + pedidos.join(' || '));
    assert.ok(r.mensajes.some((m) => /1 mes de garantia/i.test(m)), 'no salió la reserva de garantía: ' + JSON.stringify(r.mensajes));
    assert.ok(!r.mensajes.some((m) => /lo tenemos/i.test(m)), 'contestó el stock: ' + JSON.stringify(r.mensajes));
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
