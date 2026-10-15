'use strict';
/**
 * Memoria por tema: lo que ya le llegó al cliente no se le vuelve a explicar.
 *
 *   node test/temas.test.js
 *
 * Las conductas de punta a punta están en test/casos.js (sección "Memoria por
 * tema"). Acá va lo que el banco de casos no ve:
 *   - qué palabras marcan un tema como explicado, y cuáles no;
 *   - la INSTRUCCIÓN que se le arma a redactar (Gemini), no solo el texto final;
 *   - medios de pago con los requisitos ya explicados;
 *   - que en escucha lo que el bot habría dicho no marca, y lo que escribe una
 *     persona sí.
 *
 * Gemini no se llama nunca: se captura lo que se le pediría. El entorno se fija
 * acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GRUPO = '120363000000000004@g.us';

process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '10';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-temas-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-temas-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);
// Lo que le llegaría a redactar. Devuelve la reserva, como pasa sin conexión.
const instrucciones = [];
gemini.redactar = async (instruccion, nombre, reserva) => {
  instrucciones.push(instruccion);
  return reserva;
};

const aClientes = [];
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
evolution.enviarTexto = async (numero, texto) => {
  aClientes.push({ numero, texto });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.avisarGrupo = async () => ({});
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const temas = require('../src/temas');
const estilo = require('../src/estilo');
const { decidir, DATOS_FIJOS } = require('../src/responder');

// Un mensaje que SALE: al historial va lo que ve el cliente y se confirman sus
// marcas de 'ya se dijo', igual que hace index.js cuando Evolution acusa el envío
// (bloque 3 de la auditoría). Acá todo envío se considera exitoso.
const acciones = require('../src/acciones');
function salio(chat, m) {
  state.agregarAlHistorial(chat, 'vendedor', acciones.paraHistorial(m));
  state.confirmarMarcas(chat, acciones.marcasDe(m));
}

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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const nuevoChat = () => '54929977' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const mensaje = (chatId, texto, { fromMe = false } = {}) => ({
  key: { remoteJid: chatId, fromMe, id: 'T' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const mio = (chatId, texto) => mensaje(chatId, texto, { fromMe: true });

/** Un turno como en el banco de casos: el mensaje entra al historial, decide, y lo que dice también entra. */
async function turno(chat, texto) {
  state.agregarAlHistorial(chat, 'cliente', texto);
  const r = await decidir(chat, texto, 'Lucia');
  (r.mensajes || []).forEach((m) => salio(chat, m));
  return r;
}

async function con(cambios, fn) {
  const antes = {};
  for (const [k, v] of Object.entries(cambios)) {
    antes[k] = config[k];
    config[k] = v;
  }
  try {
    return await fn();
  } finally {
    Object.assign(config, antes);
  }
}

(async () => {
  console.log('\nQué cuenta como explicado y qué como pregunta\n');

  await check('una línea que le llegó al cliente explica el tema; nombrarlo al pasar no', () => {
    const marca = (texto, quien = 'vendedor') =>
      Object.keys(temas.actualizarDesdeHistorial({ historial: [{ quien, texto }] }) || {}).sort();
    assert.deepStrictEqual(
      marca('Lo que hacemos es financiarte el celular y darte a pagar en 1 o 2 cuotas, pedimos una entrega inicial'),
      ['financiacion']
    );
    assert.deepStrictEqual(marca('Las cuotas arrancan el mes que viene, no este mes'), ['financiacion']);
    assert.deepStrictEqual(
      marca('📱 *iPhone 13 128GB*\nContado: *$495.000*\n\nCon una entrega de *$400.000*:\n• *1 pago de $164.000*\n• *2 pagos de $88.000 cada uno*'),
      ['financiacion']
    );
    assert.deepStrictEqual(marca('[doc:/x/compromiso.pdf|No hace falta tarjeta, solo tu dni y un compromiso de pago]'), ['requisitos']);
    // "Cómo pensabas pagarlo" ofrece la financiación pero no la explica (bloque 3b):
    // marca métodos de pago, no financiación. La explicación es la pieza con el PDF.
    assert.deepStrictEqual(
      marca('Contame como tenias pensado pagarlo, tenemos contado y tambien lo financiamos hasta en 2 cuotas con una entrega inicial del 65%'),
      ['metodos_pago']
    );
    assert.deepStrictEqual(
      marca('Contame como lo ibas a hacer, podes de contado o financiarlo hasta en 2 cuotas con una entrega inicial del 65%'),
      ['metodos_pago']
    );
    assert.deepStrictEqual(marca('si! todos los equipos tienen un mes de garantía'), ['garantia']);
    assert.deepStrictEqual(
      marca('Podes pagarlo de contado o financiarlo hasta en 2 cuotas con una entrega inicial'),
      ['financiacion', 'metodos_pago']
    );
    for (const nada of [
      'Contame con cuanto contas asi te armo las cuotas',
      'Cual te gusta mas? asi te armo las cuotas',
      'Lo tenemos en $495.000 de contado',
      'Por esa entrega depende de como queden las cuotas, dejame consultarlo',
      'Dale, para el iPhone 13 la entrega arranca en $320.000',
      // La línea de la entrega inicial (bloque 5b) nombra la entrega sin explicar,
      // aunque desde el Bloque Tono diga "1 o 2 cuotas": la explicación es la pieza
      // con el PDF. Las variantes de antes siguen en los historiales guardados.
      'Para el 13 la entrega inicial es de $320.000',
      'La entrega inicial del 13 es de $320.000',
      'Mira, el 13 tiene una entrega inicial de $320.000',
      ...estilo.variantes('entregaInicial', '13', '$320.000', '$280.000'),
      ...estilo.variantes('entregaInicial', '13', '$320.000', null),
    ]) {
      assert.deepStrictEqual(marca(nada), [], 'marcó un tema con: ' + nada);
    }
    assert.deepStrictEqual(marca('tienen garantia? y en cuotas?', 'cliente'), [], 'lo que escribe el cliente no explica nada');
  });

  await check('la pregunta se lee en el mensaje del cliente', () => {
    const preguntados = (m) => temas.TEMAS.filter((t) => temas.pregunta(m, t));
    assert.deepStrictEqual(preguntados('y las cuotas?'), ['financiacion']);
    assert.deepStrictEqual(preguntados('que garantía tienen?'), ['garantia']);
    assert.deepStrictEqual(preguntados('que papeles piden?'), ['requisitos']);
    assert.deepStrictEqual(preguntados('que formas de pago tienen?'), ['metodos_pago']);
    assert.deepStrictEqual(preguntados('tengo 400 mil'), []);
  });

  await check('pregunta: siempre, corta si ya se explicó; iniciativa: solo si no se explicó', () => {
    const ya = { temasExplicados: { garantia: true } };
    assert.strictEqual(temas.decir('garantia', {}, 'tenes el 13?', 'larga'), 'larga');
    assert.strictEqual(temas.decir('garantia', ya, 'tenes el 13?', 'larga'), null);
    assert.strictEqual(temas.decir('garantia', {}, 'tiene garantia?', 'larga'), 'larga');
    assert.strictEqual(temas.decir('garantia', ya, 'tiene garantia?', 'larga'), temas.CORTA.garantia);
  });

  console.log('\nLa instrucción que se le arma a redactar\n');

  const DE = {
    financiacion: [DATOS_FIJOS.cuotas_desde, 'cuota', 'financ', 'entrega inicial'],
    requisitos: [DATOS_FIJOS.requisitos, 'dni', 'tarjeta'],
    garantia: [DATOS_FIJOS.garantia, 'garantia'],
  };
  const noTrae = (instruccion, tema) => {
    for (const p of DE[tema]) {
      assert.ok(!instruccion.toLowerCase().includes(p.toLowerCase()), `la instrucción trae ${tema} ("${p}"):\n${instruccion}`);
    }
  };

  await check('pregunta por garantía: la instrucción trae la garantía y NO financiación ni requisitos', async () => {
    const chat = nuevoChat();
    instrucciones.length = 0;
    await turno(chat, 'que garantia tienen?');
    assert.strictEqual(instrucciones.length, 1, 'no se armó la instrucción para redactar');
    const [inst] = instrucciones;
    assert.ok(inst.includes(DATOS_FIJOS.garantia), 'la instrucción no trae la garantía:\n' + inst);
    noTrae(inst, 'financiacion');
    noTrae(inst, 'requisitos');
    assert.ok(!inst.includes('Belgrano'), 'la instrucción trae la dirección, que no preguntó:\n' + inst);
  });

  // Con una entrega guardada la pregunta por cuotas sigue yendo a redactar. Sin
  // entrega va por su propia rama, con textos fijos (el caso siguiente). Hasta el
  // 15/09/2026 este caso usaba un chat sin entrega.
  await check('pregunta por cuotas con la entrega ya dicha: la instrucción trae la financiación y NO garantía ni requisitos', async () => {
    const chat = nuevoChat();
    state.actualizar(chat, { entrega: 400000 });
    instrucciones.length = 0;
    await turno(chat, 'y las cuotas?');
    const [inst] = instrucciones;
    // La larga es una variante de estilo.js (bloque 3b): se financia, 1 o 2 cuotas,
    // entrega inicial. "El mes que viene" ya no va: solo si pregunta cuándo arranca.
    assert.ok(inst && /financia/.test(inst) && /entrega inicial/.test(inst), 'no trae la financiación:\n' + inst);
    assert.ok(!inst.includes(DATOS_FIJOS.cuotas_desde), 'trae "el mes que viene" sin que pregunte cuándo arranca:\n' + inst);
    noTrae(inst, 'garantia');
    noTrae(inst, 'requisitos');
  });

  await check('pregunta por cuotas sin entrega: textos fijos, sin redactar, y sigue la venta', async () => {
    const chat = nuevoChat();
    instrucciones.length = 0;
    const r = await turno(chat, 'y las cuotas?');
    assert.strictEqual(instrucciones.length, 0, 'pasó por redactar:\n' + instrucciones[0]);
    // Bloque 3b: la explicación (variante), el PDF del compromiso y la pregunta. Desde el
    // bloque 9, en un chat nuevo va primero el saludo del día.
    const [saludo, explica, pdf, pregunta] = r.mensajes;
    assert.strictEqual(r.mensajes.length, 4, 'tenían que ser 4 mensajes: ' + r.mensajes.map(acciones.comoTexto).join(' | '));
    assert.ok(estilo.variantes('saludo', 'luciaa').includes(acciones.comoTexto(saludo).toLowerCase()), 'el 1 no es el saludo: ' + acciones.comoTexto(saludo));
    assert.ok(/financia/i.test(explica) && /entrega inicial/i.test(explica), 'el 1 no explica la financiación: ' + explica);
    assert.ok(acciones.esDoc(pdf) && /dni/i.test(pdf.pie), 'el 2 no es el PDF con el pie: ' + acciones.comoTexto(pdf));
    assert.strictEqual(
      pregunta.toLowerCase(),
      'contame que modelito te interesa y con cuanto contas para la entrega asi te armo los numeros'
    );
  });

  await check('con la garantía ya explicada, a redactar le llega la versión corta y no la larga', async () => {
    const chat = nuevoChat();
    state.agregarAlHistorial(chat, 'vendedor', 'si, todos los equipos tienen un mes de garantia');
    instrucciones.length = 0;
    await turno(chat, 'que garantia tienen?');
    const [inst] = instrucciones;
    assert.ok(inst && inst.includes(temas.CORTA.garantia), 'no trae la versión corta:\n' + inst);
    assert.ok(!inst.includes(DATOS_FIJOS.garantia), 'trae la versión larga:\n' + inst);
  });

  console.log('\nMedios de pago\n');

  await check('medios de pago con los requisitos ya explicados: no los repite', async () => {
    const control = nuevoChat();
    // Un mensaje puede venir como objeto si confirma marcas al salir (acciones.conMarcas).
    const primera = (await turno(control, 'que formas de pago tienen?')).mensajes.map(acciones.comoTexto).join('\n');
    assert.ok(/dni/i.test(primera), 'el caso no prueba nada: sin explicar, no trae los requisitos:\n' + primera);

    const chat = nuevoChat();
    state.agregarAlHistorial(chat, 'vendedor', 'solo con tu dni, no hace falta tarjeta de credito');
    const texto = (await turno(chat, 'que formas de pago tienen?')).mensajes.map(acciones.comoTexto).join('\n');
    assert.ok(/contado/i.test(texto) && /2 cuotas/i.test(texto), texto);
    assert.ok(!/dni|tarjeta/i.test(texto), 'repitió los requisitos:\n' + texto);
  });

  await check('si en el mismo mensaje también pregunta los requisitos, van, cortos', async () => {
    const chat = nuevoChat();
    state.agregarAlHistorial(chat, 'vendedor', 'solo con tu dni, no hace falta tarjeta de credito');
    const r = await turno(chat, 'que formas de pago hay y que requisitos piden?');
    const textos = r.mensajes.map(acciones.comoTexto);
    assert.ok(textos.some((m) => m.toLowerCase() === temas.CORTA.requisitos), textos.join('\n'));
  });

  console.log('\nQué le llegó de verdad\n');

  await check('en escucha lo que el bot habría dicho no marca; lo que escribe una persona sí', async () => {
    const chat = nuevoChat();
    await con({ modoEscucha: true }, async () => {
      await bot.procesar(mensaje(chat, 'tenes el iphone 13?'));
      await dormir(50);
      await bot.procesar(mensaje(chat, 'y el 15?'));
      await dormir(50);
      assert.ok(/garantia/i.test(state.todos()[chat].ultimaPropuestaBot || ''), 'el caso no prueba nada: el bot no habría dicho la garantía');
      await bot.procesar(mensaje(chat, 'buenas?'));
      await dormir(50);
      assert.ok(!(state.todos()[chat].temasExplicados || {}).garantia, 'marcó la garantía que el bot solo habría dicho');

      await bot.procesar(mio(chat, 'si, todos tienen un mes de garantia'));
      await bot.procesar(mensaje(chat, 'y el 14?'));
      await dormir(50);
      assert.ok(state.todos()[chat].temasExplicados.garantia, 'no marcó la garantía que explicó una persona');
      assert.ok(!/garantia/i.test(state.todos()[chat].ultimaPropuestaBot || ''), 'la volvió a meter por su cuenta');
    });
  });

  await check('en vivo, lo que el bot mandó sí marca', async () => {
    const chat = nuevoChat();
    await bot.procesar(mensaje(chat, 'tenes el iphone 13?'));
    await dormir(200);
    await bot.procesar(mensaje(chat, 'y el 15?'));
    await dormir(200);
    assert.ok(aClientes.some((m) => m.numero === chat && /garantia/i.test(m.texto)), 'el caso no prueba nada: no le mandó la garantía');
    await bot.procesar(mensaje(chat, 'y el 14?'));
    await dormir(200);
    assert.ok((state.todos()[chat].temasExplicados || {}).garantia, 'no quedó marcada la garantía que le llegó');
  });

  await check('#reset borra las marcas junto con el resto del chat', async () => {
    const chat = nuevoChat();
    state.agregarAlHistorial(chat, 'vendedor', 'todos tienen un mes de garantia');
    await turno(chat, 'hola');
    assert.ok(state.todos()[chat].temasExplicados.garantia, 'el caso no prueba nada: no quedó marcada');
    await bot.procesar(mio(chat, '#reset'));
    assert.ok(!state.todos()[chat], 'quedó algo del chat después de #reset');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
