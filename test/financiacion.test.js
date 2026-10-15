'use strict';
/**
 * La explicación de la financiación antes de la primera cotización (bloque 3b,
 * pedido de Tomás tras la prueba en vivo del 16/09/2026).
 *
 *   node test/financiacion.test.js
 *
 * En la prueba en vivo el cliente mandó en una tanda "me interesa el 14 pro pero
 * cuento con 600.000" + "vi que hacian financiamiento" + "como es eso", y el bot
 * cotizó sin explicar nunca cómo es la financiación (1 o 2 cuotas, entrega
 * inicial). Ahora, antes de la PRIMERA cotización del chat, pregunte o no:
 *
 *   1. explicaFinanciacion (estilo.js)
 *   2. el PDF del compromiso con pieCompromiso de pie
 *   3. puedeRetirar
 *   4. la cotización
 *
 * y sin "ahora te cotizo", para que entre en 4. No va si el chat ya tiene una
 * cotización o si la financiación ya le llegó (del bot o de una persona): ahí,
 * si pregunta, va la versión corta. Sin monto ("como es la financiacion?", "en
 * cuotas"): explicación, PDF y la pregunta de siempre para seguir.
 *
 * Ajustes 1b (decisión de Tomás): si la entrega paga el equipo entero
 * (`soloContado`, y con varias unidades todas), no van la explicación, el PDF ni
 * los requisitos, salvo que pregunte cómo es la financiación. No se marcan: salen
 * con la próxima cotización en cuotas.
 *
 * Mejora 1, paso 5 (decisión de Tomás): si paga de contado (la última cotización
 * fue soloContado o dijo que paga de contado) y pregunta por papeles, no necesita
 * nada: sin dni, tarjeta, compromiso ni PDF. Y no le llegan frases con "cuotas".
 *
 * Sin red, extractor local, números inventados. El entorno se fija acá y no se
 * hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000031@g.us';
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
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-financiacion-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-financiacion-' + process.pid + '.jsonl');

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
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

// Evolution de mentira: cada envío devuelve su id, como Evolution v2. Se anota
// el tipo, así se ve si el segundo mensaje fue el PDF y no un texto.
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
const temas = require('../src/temas');
const estilo = require('../src/estilo');
const acciones = require('../src/acciones');
const documentos = require('../src/documentos');
const { decidir } = require('../src/responder');

assert.ok(documentos.compromisoDePago(), 'falta documentos/compromiso-de-pago.pdf: sin el PDF estas pruebas no prueban nada');

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
let n = 0;
const nuevoChat = () => '54900000' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
const del = (chat) => state.todos()[chat] || {};
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
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

/** Un turno como en el banco de casos: entra al historial, decide, y lo que dice sale (confirma sus marcas). */
async function turno(chat, texto) {
  state.agregarAlHistorial(chat, 'cliente', texto);
  const r = await decidir(chat, texto, 'Lucia');
  for (const m of r.mensajes || []) {
    state.agregarAlHistorial(chat, 'vendedor', acciones.paraHistorial(m));
    state.confirmarMarcas(chat, acciones.marcasDe(m));
  }
  return r.mensajes || [];
}

// La tanda de la captura: tres mensajes que llegan durante la espera.
const TANDA = ['sii te comento me interesa el 14 pro pero cuento con 600.000', 'vi que hacian financiamiento', 'como es eso'];
async function mandarTanda(chat, lineas = TANDA) {
  const primero = bot.procesar(escrito(chat, lineas[0]));
  for (const l of lineas.slice(1)) {
    await dormir(5);
    await bot.procesar(escrito(chat, l));
  }
  await primero;
}

// Cómo se reconoce cada pieza, sin depender de la variante que tocó.
const texto = (m) => (typeof m === 'string' ? m : acciones.comoTexto(m));
const norm = (t) => temas.normalizar(t);
const esCorta = (t) => norm(t).includes(temas.CORTA.financiacion);
// La larga: se financia el celular, 1 o 2 cuotas, entrega inicial. La corta también
// nombra las tres cosas, así que se descarta aparte.
const esExplicacion = (t) =>
  !esCorta(t) && /financia/.test(norm(t)) && /(1 o 2|hasta 2) cuotas/.test(norm(t)) && /entrega inicial/.test(norm(t));
const esPieCompromiso = (t) =>
  /(no necesitas|no hace falta|sin) tarjeta/.test(norm(t)) && /\bdni\b/.test(norm(t)) && /compromiso de pago/.test(norm(t));
const esPuedeRetirar = (t) => /te lo llevas|lo podes retirar|lo sacas tranquilo/.test(norm(t));
// La cotización arranca con 📱 y, desde Ajustes 1, ya no dice "Contado:".
const esCotizacion = (t) => /^📱/.test(t) && /1 pago/i.test(t) && /2 pagos/i.test(t);
const esAhoraCotizo = (t) => /^(ahora te cotizo|te paso los numeros|mira como te queda)[.!]?$/i.test(norm(t).trim());
const resumen = (msgs) => msgs.map((m) => texto(m).split('\n')[0].slice(0, 70)).join(' | ');

// Bloque 9: en un chat nuevo, la primera respuesta del día arranca con el saludo (aparte,
// si entra en los 4 mensajes). Los checks que miran lo que sigue lo sacan con esto, que
// además comprueba que estaba.
const SALUDOS = [...estilo.variantes('saludo', 'luciaa'), ...estilo.variantes('saludoDevuelve', 'luciaa')].map(norm);
function sinSaludo(msgs, vista) {
  const t = (m) => (m && m.tipo && 'numero' in m ? m.texto : texto(m));
  assert.ok(msgs.length && SALUDOS.includes(norm(t(msgs[0]))), 'no arrancó con el saludo del día: ' + vista);
  return msgs.slice(1);
}

(async () => {
  console.log('\nLa explicación de la financiación antes de la primera cotización\n');

  await check('1. la tanda de la captura: explicación, PDF con dni y sin tarjeta, "te lo llevas" y la cotización, sin "ahora te cotizo"', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat);
    const salieron = aEste(chat);
    const vista = salieron.map((m) => m.tipo + ': ' + m.texto.split('\n')[0].slice(0, 60)).join(' | ');
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length} mensajes, tenían que ser 4: ${vista}`);
    const [explica, pdf, retira, cotiza] = salieron;
    assert.strictEqual(explica.tipo, 'texto', 'el 1 no es un texto: ' + vista);
    assert.ok(esExplicacion(explica.texto), 'el 1 no explica la financiación (1 o 2 cuotas, entrega inicial): ' + explica.texto);
    assert.strictEqual(pdf.tipo, 'documento', 'el 2 no es el PDF: ' + vista);
    assert.ok(esPieCompromiso(pdf.texto), 'el pie del PDF no dice dni, sin tarjeta y compromiso de pago: ' + pdf.texto);
    assert.ok(esPuedeRetirar(retira.texto), 'el 3 no dice que se lo lleva: ' + retira.texto);
    assert.ok(/600\.000/.test(retira.texto) && /14 Pro/.test(retira.texto), 'el 3 no nombra los $600.000 y el 14 Pro: ' + retira.texto);
    assert.ok(esCotizacion(cotiza.texto), 'el 4 no es la cotización: ' + cotiza.texto.slice(0, 80));
    assert.ok(!salieron.some((m) => esAhoraCotizo(m.texto)), 'salió "ahora te cotizo": ' + vista);
    // Las marcas quedan como en el bloque 3: confirmadas por el envío.
    assert.strictEqual(del(chat).compromisoEnviado, true, 'no quedó marcado el compromiso enviado');
    assert.strictEqual(del(chat).cotizadoDe, 'iPhone 14 Pro', 'no quedó marcada la cotización');
  });

  await check('2. cotización con monto sin preguntar por financiación, en un chat nuevo: también lleva la explicación', async () => {
    const chat = nuevoChat();
    const msgs = await turno(chat, 'me interesa el 14 pro, tengo 600 mil');
    assert.strictEqual(msgs.length, 4, 'tenían que ser 4 mensajes: ' + resumen(msgs));
    assert.ok(esExplicacion(texto(msgs[0])), 'el 1 no explica: ' + texto(msgs[0]));
    assert.ok(acciones.esDoc(msgs[1]) && esPieCompromiso(msgs[1].pie), 'el 2 no es el PDF con el pie: ' + texto(msgs[1]));
    assert.ok(esPuedeRetirar(texto(msgs[2])), 'el 3 no es "te lo llevas": ' + texto(msgs[2]));
    assert.ok(esCotizacion(texto(msgs[3])), 'el 4 no es la cotización: ' + texto(msgs[3]).slice(0, 60));
    assert.ok(!msgs.some((m) => esAhoraCotizo(texto(m))), 'salió "ahora te cotizo": ' + resumen(msgs));
  });

  await check('3. una segunda cotización (otro monto u otro modelo) en un chat ya cotizado no lleva la explicación', async () => {
    const chat = nuevoChat();
    await turno(chat, 'me interesa el 14 pro, tego 600 mil'.replace('tego', 'tengo'));
    assert.strictEqual(del(chat).cotizadoDe, 'iPhone 14 Pro', 'el caso no prueba nada: no cotizó');
    const otroMonto = await turno(chat, 'tengo 650 mil');
    assert.ok(otroMonto.some((m) => esCotizacion(texto(m))), 'no volvió a cotizar: ' + resumen(otroMonto));
    assert.ok(!otroMonto.some((m) => esExplicacion(texto(m))), 'repitió la explicación: ' + resumen(otroMonto));
    assert.ok(!otroMonto.some((m) => acciones.esDoc(m)), 'volvió a mandar el PDF: ' + resumen(otroMonto));

    const otro = nuevoChat();
    await turno(otro, 'tenes el 13?');
    await turno(otro, 'tengo 400 mil');
    assert.strictEqual(del(otro).cotizadoDe, 'iPhone 13', 'el caso no prueba nada: no cotizó el 13');
    const otroModelo = await turno(otro, 'y el 14 pro con 600 mil me alcanza? tengo 600 mil');
    assert.ok(!otroModelo.some((m) => esExplicacion(texto(m))), 'repitió la explicación con otro modelo: ' + resumen(otroModelo));
    assert.ok(!otroModelo.some((m) => acciones.esDoc(m)), 'volvió a mandar el PDF con otro modelo: ' + resumen(otroModelo));
  });

  await check('4. ya cotizado y pregunta "como es la financiacion?": la versión corta, no la larga, y sin PDF', async () => {
    const chat = nuevoChat();
    await turno(chat, 'me interesa el 14 pro, tengo 600 mil');
    const msgs = await turno(chat, 'como es la financiacion?');
    assert.ok(msgs.some((m) => esCorta(texto(m))), 'no dio la versión corta: ' + resumen(msgs));
    assert.ok(!msgs.some((m) => esExplicacion(texto(m))), 'repitió la larga: ' + resumen(msgs));
    assert.ok(!msgs.some((m) => acciones.esDoc(m)), 'volvió a mandar el PDF: ' + resumen(msgs));
  });

  await check('5. la financiación la explicó una persona de la cuenta: la primera cotización no la repite', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 14 pro?');
    state.agregarAlHistorial(chat, 'vendedor', 'lo que hacemos es financiarte en 1 o 2 cuotas con una entrega inicial');
    const msgs = await turno(chat, 'tengo 600 mil');
    assert.ok(!msgs.some((m) => esExplicacion(texto(m))), 'repitió la explicación: ' + resumen(msgs));
    assert.ok(!msgs.some((m) => esCorta(texto(m))), 'metió la corta sin que preguntara: ' + resumen(msgs));
    // Sale como siempre: "te lo llevas", el anuncio, la cotización y el PDF.
    assert.ok(esPuedeRetirar(texto(msgs[0])), 'el 1 no es "te lo llevas": ' + resumen(msgs));
    assert.ok(msgs.some((m) => esCotizacion(texto(m))), 'no cotizó: ' + resumen(msgs));
    assert.ok(msgs.some((m) => acciones.esDoc(m) && esPieCompromiso(m.pie)), 'no mandó el PDF con el pie: ' + resumen(msgs));
  });

  await check('6. sin monto: "como es la financiacion?" con el modelo elegido → explicación, PDF y la pregunta por la entrega; el PDF no sale dos veces', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    await turno(chat, 'ese me gusto');
    assert.strictEqual(del(chat).preguntamosFormaPago, true, 'el caso no prueba nada: no le preguntó cómo paga');
    const msgs = await turno(chat, 'como es la financiacion?');
    assert.ok(msgs.length <= 4, 'más de 4 mensajes: ' + resumen(msgs));
    assert.ok(esExplicacion(texto(msgs[0])), 'el 1 no explica: ' + resumen(msgs));
    assert.ok(acciones.esDoc(msgs[1]) && esPieCompromiso(msgs[1].pie), 'el 2 no es el PDF con el pie: ' + resumen(msgs));
    assert.ok(/para el iPhone 13 la entrega arranca en \$/.test(texto(msgs[2])), 'el 3 no da la entrega del 13: ' + resumen(msgs));
    assert.ok(/con cuanto contas|de cuanto disponias/.test(norm(texto(msgs[3]))), 'el 4 no pregunta cuánto tiene: ' + resumen(msgs));
    assert.strictEqual(del(chat).compromisoEnviado, true, 'no quedó marcado el compromiso');

    const otraVez = await turno(chat, 'y como era lo de la financiacion?');
    assert.ok(!otraVez.some((m) => acciones.esDoc(m)), 'mandó el PDF dos veces: ' + resumen(otraVez));
    assert.ok(!otraVez.some((m) => esExplicacion(texto(m))), 'repitió la larga: ' + resumen(otraVez));
    assert.ok(otraVez.some((m) => esCorta(texto(m))), 'no dio la corta: ' + resumen(otraVez));

    // Y con el monto: "te lo llevas" y la cotización, sin repetir la explicación ni el PDF.
    const cotiza = await turno(chat, 'tengo 400 mil');
    assert.ok(esPuedeRetirar(texto(cotiza[0])), 'el 1 no es "te lo llevas": ' + resumen(cotiza));
    assert.ok(cotiza.some((m) => esCotizacion(texto(m))), 'no cotizó: ' + resumen(cotiza));
    assert.ok(!cotiza.some((m) => esExplicacion(texto(m))), 'repitió la explicación al cotizar: ' + resumen(cotiza));
    assert.ok(!cotiza.some((m) => acciones.esDoc(m)), 'repitió el PDF al cotizar: ' + resumen(cotiza));
  });

  await check('6b. sin monto ni modelo: "como son las cuotas?" → explicación, PDF y la pregunta por el modelo', async () => {
    const chat = nuevoChat();
    const todos = await turno(chat, 'hola, como son las cuotas?');
    const msgs = sinSaludo(todos, resumen(todos));
    assert.ok(esExplicacion(texto(msgs[0])), 'el 1 no explica: ' + resumen(msgs));
    assert.ok(acciones.esDoc(msgs[1]) && esPieCompromiso(msgs[1].pie), 'el 2 no es el PDF: ' + resumen(msgs));
    assert.ok(/que modelito te interesa/.test(norm(texto(msgs[2]))), 'el 3 no pregunta el modelo: ' + resumen(msgs));
    assert.ok(!msgs.some((m) => /mes que viene/.test(texto(m))), 'la larga ya no lleva "el mes que viene": ' + resumen(msgs));
  });

  await check('6c. "en cuotas" como respuesta a "cómo pensabas pagarlo": explicación, PDF, la entrega de ese y pide la suya (4)', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    await turno(chat, 'ese me gusto');
    const msgs = await turno(chat, 'en cuotas');
    assert.strictEqual(msgs.length, 4, 'tenían que ser 4 mensajes: ' + resumen(msgs));
    assert.ok(esExplicacion(texto(msgs[0])), 'el 1 no explica: ' + resumen(msgs));
    assert.ok(acciones.esDoc(msgs[1]), 'el 2 no es el PDF: ' + resumen(msgs));
    assert.ok(/la entrega arranca en/.test(texto(msgs[2])), 'el 3 no da la entrega: ' + resumen(msgs));
  });

  await check('6d. explicación una sola vez por tanda, también cuando se pregunta con la cotización repetida', async () => {
    const chat = nuevoChat();
    const msgs = await turno(chat, 'me interesa el 14 pro, tengo 600 mil, como es lo de las cuotas?');
    const cuantas = msgs.filter((m) => esExplicacion(texto(m)) || esCorta(texto(m))).length;
    assert.strictEqual(cuantas, 1, `la explicación salió ${cuantas} veces: ` + resumen(msgs));
    assert.ok(!msgs.some((m) => esAhoraCotizo(texto(m))), 'salió "ahora te cotizo": ' + resumen(msgs));
  });

  await check('cuándo arranca a pagar: "el mes que viene" solo si lo pregunta', async () => {
    const chat = nuevoChat();
    await turno(chat, 'me interesa el 14 pro, tengo 600 mil');
    const msgs = await turno(chat, 'y cuando arranco a pagar la primera cuota?');
    assert.ok(msgs.some((m) => /mes que viene/.test(texto(m))), 'no dijo cuándo arranca: ' + resumen(msgs));
    assert.ok(!msgs.some((m) => esExplicacion(texto(m))), 'repitió la larga: ' + resumen(msgs));
  });

  console.log('\nPrimer iPhone con la explicación adelante (bloque 4b)\n');

  // La frase del primer iPhone fundida con "te lo llevas" en un solo mensaje
  // (decisión de Tomás): así la tanda sigue en 4 y la frase no queda afuera.
  const PRIMER_IPHONE = 'es mi primer iphone, me interesa el 14 pro y tengo 600.000';
  const esPrimerIphoneRetira = (t) => /lugar indicado|primer iphone/.test(norm(t)) && /600\.000/.test(t) && /14 Pro/.test(t);

  await check('9. "es mi primer iphone…" con el monto en un chat nuevo: explicación, PDF, primer iPhone + "te lo llevas" (con monto y modelo) y cotización; queda primerIphoneDicho', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, [PRIMER_IPHONE]);
    const salieron = aEste(chat);
    const vista = salieron.map((m) => m.tipo + ': ' + m.texto.split('\n')[0].slice(0, 60)).join(' | ');
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length} mensajes, tenían que ser 4: ${vista}`);
    const [explica, pdf, primero, cotiza] = salieron;
    assert.ok(explica.tipo === 'texto' && esExplicacion(explica.texto), 'el 1 no explica la financiación: ' + vista);
    assert.ok(pdf.tipo === 'documento' && esPieCompromiso(pdf.texto), 'el 2 no es el PDF con el pie: ' + vista);
    assert.ok(esPrimerIphoneRetira(primero.texto), 'el 3 no reconoce el primer iPhone con los $600.000 y el 14 Pro: ' + primero.texto);
    assert.ok(esPuedeRetirar(primero.texto), 'el 3 no dice que se lo lleva: ' + primero.texto);
    assert.ok(esCotizacion(cotiza.texto), 'el 4 no es la cotización: ' + cotiza.texto.slice(0, 80));
    assert.strictEqual(del(chat).primerIphoneDicho, true, 'no quedó marcado primerIphoneDicho');
    assert.strictEqual(del(chat).cotizadoDe, 'iPhone 14 Pro', 'no quedó marcada la cotización');
    assert.strictEqual(del(chat).compromisoEnviado, true, 'no quedó marcado el compromiso');
  });

  await check('9. en escucha el mismo caso no marca primerIphoneDicho (y la propuesta lleva la frase)', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoEscucha: true }, async () => {
      await bot.procesar(escrito(chat, PRIMER_IPHONE));
    });
    assert.deepStrictEqual(aEste(chat), [], 'en escucha mandó algo');
    const s = del(chat);
    assert.ok(/lugar indicado|primer iphone/.test(norm(s.ultimaPropuestaBot || '')), 'la propuesta no lleva la frase del primer iPhone: ' + (s.ultimaPropuestaBot || '').slice(0, 200));
    assert.ok(!s.primerIphoneDicho, 'marcó primerIphoneDicho en escucha');
    assert.ok(!s.cotizadoDe, 'marcó la cotización en escucha');
  });

  await check('9. sin la explicación (ya explicada por una persona) la frase del primer iPhone sale como siempre, aparte', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 14 pro?');
    state.agregarAlHistorial(chat, 'vendedor', 'lo que hacemos es financiarte en 1 o 2 cuotas con una entrega inicial');
    const msgs = await turno(chat, 'cuento con 600.000 y es mi primer iphone');
    assert.ok(/lugar indicado|primer iphone/.test(norm(texto(msgs[0]))), 'el 1 no reconoce el primer iPhone: ' + resumen(msgs));
    assert.ok(!/600\.000/.test(texto(msgs[0])), 'el 1 lleva el monto, tenía que ser la frase de siempre: ' + texto(msgs[0]));
    assert.ok(esPuedeRetirar(texto(msgs[1])), 'el 2 no es "te lo llevas": ' + resumen(msgs));
    assert.ok(msgs.some((m) => esCotizacion(texto(m))), 'no cotizó: ' + resumen(msgs));
    assert.strictEqual(del(chat).primerIphoneDicho, true, 'no quedó marcado primerIphoneDicho');
  });

  console.log('\nLas variantes\n');

  await check('9. primerIphoneRetira: cada variante reconoce el primer iPhone, dice que se lo lleva y nombra el modelo y el monto que recibe', () => {
    const variantes = estilo.variantes('primerIphoneRetira', 'iPhone 14 Pro', '$550.000');
    assert.strictEqual(variantes.length, 3, `tiene ${variantes.length} variantes, tenían que ser 3`);
    for (const v of variantes) {
      const t = norm(v);
      assert.ok(/lugar indicado|primer iphone/.test(t), 'no reconoce el primer iPhone: ' + v);
      assert.ok(esPuedeRetirar(v) || /es tuyo/.test(t), 'no dice que se lo lleva: ' + v);
      assert.ok(v.includes('iPhone 14 Pro'), 'no nombra el modelo: ' + v);
      assert.ok(v.includes('$550.000'), 'no nombra el monto: ' + v);
      assert.ok(v.length <= 160, 'demasiado larga: ' + v);
    }
  });

  await check('7. explicaFinanciacion: cada variante abre, dice que se financia, 1 o 2 cuotas y entrega inicial, sin números, y pasa temas.EXPLICA', () => {
    const variantes = estilo.variantes('explicaFinanciacion');
    assert.ok(variantes.length >= 3 && variantes.length <= 4, `tiene ${variantes.length} variantes, tenían que ser 3 o 4`);
    for (const v of variantes) {
      const t = norm(v);
      assert.ok(/^(sii?,? ?mira|te cuento|mira|sii,? te cuento)/.test(t), 'no arranca con una apertura: ' + v);
      assert.ok(/financia/.test(t), 'no dice que se financia: ' + v);
      assert.ok(/\b(celular|equipo|celu)\b/.test(t), 'no dice que se financia el celular: ' + v);
      assert.ok(/(1 o 2|hasta 2) cuotas/.test(t), 'no dice 1 o 2 cuotas: ' + v);
      assert.ok(/entrega inicial/.test(t), 'no dice que pedimos una entrega inicial: ' + v);
      assert.ok(!/\d\s*%|\$\s*\d|\d{3}\.\d{3}/.test(t), 'trae un porcentaje o un monto: ' + v);
      assert.ok(temas.EXPLICA.financiacion.test(t), 'no pasa temas.EXPLICA.financiacion: ' + v);
      assert.ok(v.length <= 220, 'demasiado larga: ' + v);
    }
  });

  await check('7. pieCompromiso: cada variante dice sin tarjeta, solo dni, compromiso de pago que se lo pasamos, y pasa temas.EXPLICA', () => {
    const variantes = estilo.variantes('pieCompromiso');
    assert.ok(variantes.length >= 3 && variantes.length <= 4, `tiene ${variantes.length} variantes, tenían que ser 3 o 4`);
    for (const v of variantes) {
      const t = norm(v);
      assert.ok(/(no necesitas|no hace falta|sin) tarjeta/.test(t), 'no dice que no necesita tarjeta: ' + v);
      assert.ok(/\b(solo|alcanza)\b/.test(t) && /\bdni\b/.test(t), 'no dice que solo necesita su dni: ' + v);
      assert.ok(/compromiso de pago/.test(t), 'no nombra el compromiso de pago: ' + v);
      assert.ok(/te lo (paso|mando)|te (paso|mando) el compromiso/.test(t), 'no dice que se lo pasamos: ' + v);
      assert.ok(temas.EXPLICA.requisitos.test(t), 'no pasa temas.EXPLICA.requisitos: ' + v);
      assert.ok(v.length <= 220, 'demasiado larga: ' + v);
    }
  });

  console.log('\nEscucha y borrador (el bloque 3 sigue igual)\n');

  // En escucha no hay espera de tanda (cada mensaje se evalúa suelto), así que
  // acá va el texto ya juntado, que es lo que la tanda le pasa a decidir.
  await check('8. en escucha la tanda no deja marcado el compromiso ni la cotización, y la propuesta lleva la explicación', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoEscucha: true }, async () => {
      await bot.procesar(escrito(chat, TANDA.join('\n')));
    });
    assert.deepStrictEqual(aEste(chat), [], 'en escucha mandó algo');
    const s = del(chat);
    assert.ok(esExplicacion(s.ultimaPropuestaBot || ''), 'la propuesta no lleva la explicación: ' + (s.ultimaPropuestaBot || '').slice(0, 120));
    assert.ok(/\[doc: compromiso de pago\]/.test(s.ultimaPropuestaBot || ''), 'la propuesta no lleva el PDF');
    assert.ok(!s.compromisoEnviado, 'marcó el compromiso en escucha');
    assert.ok(!s.cotizadoDe, 'marcó la cotización en escucha');
    assert.ok(!temas.explicado(s, 'financiacion'), 'dio la financiación por explicada sin haberla mandado');
  });

  await check('8. en borrador tampoco, y el borrador del grupo lleva la explicación y el PDF', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoBorrador: true }, async () => {
      await mandarTanda(chat);
    });
    assert.deepStrictEqual(aEste(chat), [], 'en borrador le escribió al cliente');
    const borrador = alGrupo.join('\n');
    assert.ok(esExplicacion(borrador), 'el borrador no lleva la explicación: ' + borrador.slice(0, 200));
    assert.ok(/\[doc: compromiso de pago\]/.test(borrador), 'el borrador no lleva el PDF');
    const s = del(chat);
    assert.ok(!s.compromisoEnviado, 'marcó el compromiso en borrador');
    assert.ok(!s.cotizadoDe, 'marcó la cotización en borrador');
  });

  console.log('\nLe alcanza para pagarlo de contado (Ajustes 1b)\n');

  // Decisión de Tomás: si la entrega paga el equipo entero (`soloContado`), no van
  // la explicación, el PDF ni los requisitos. Solo el precio de contado. No se
  // marcan: salen con la próxima cotización en cuotas. Si pregunta cómo es la
  // financiación, las piezas de siempre. El 14 Pro sale $800.000.
  //
  // Pendientes 1, D3 (decisión de Tomás tras la prueba en vivo del 16/09/2026): con la
  // entrega por encima del contado, "lo podés retirar con esos $900.000" y la ficha
  // "con esa plata lo sacás de contado, está $800.000" decían lo mismo. Queda SOLO la
  // ficha: `puedeRetirar` no va cuando la cotización es de contado (`deContado`). La
  // frase del primer iPhone (`primerIphoneRetira`) no se toca acá.
  const esDeContado = (t) => /^📱/.test(t) && /de contado/.test(t) && t.includes('$800.000') && !/1 pago|2 pagos/.test(t);
  // "de contado no necesitas nada, solo venir" (Mejora 1): nombra el contado y que no hace falta nada.
  const esRequisitosContado = (t) => /contado/.test(norm(t)) && /\bnada\b/.test(norm(t));
  const marcasDeTemas = (s) => ({ ...(s.temasExplicados || {}), ...(temas.actualizarDesdeHistorial(s) || {}) });
  const vistaDe = (salieron) => salieron.map((m) => m.tipo + ': ' + m.texto.split('\n').join(' / ').slice(0, 90)).join(' | ');
  const sinTeLoLlevas = (salieron, vista) =>
    assert.ok(!salieron.some((m) => esPuedeRetirar(m.texto)), 'con la entrega por encima del contado salió "te lo llevas" (D3): ' + vista);

  const CONTADO = nuevoChat();
  await check('1b-1. "tengo 900.000 para el 14 pro" en un chat nuevo: solo la ficha con el precio de contado; sin "te lo llevas", cuotas, compromiso ni PDF, y sin marcas', async () => {
    limpiar();
    await mandarTanda(CONTADO, ['tengo 900.000 para el 14 pro']);
    const vista = vistaDe(aEste(CONTADO));
    const salieron = sinSaludo(aEste(CONTADO), vista);
    for (const m of salieron) {
      assert.ok(!/cuotas?/.test(norm(m.texto)), 'un mensaje habla de cuotas: ' + vista);
      assert.ok(!/compromiso/.test(norm(m.texto)), 'un mensaje nombra el compromiso: ' + vista);
    }
    assert.ok(!salieron.some((m) => m.tipo === 'documento'), 'salió el PDF: ' + vista);
    sinTeLoLlevas(salieron, vista);
    assert.strictEqual(salieron.length, 1, `salieron ${salieron.length} mensajes, tenía que ser solo la ficha: ${vista}`);
    assert.ok(esDeContado(salieron[0].texto), 'no es la cotización de contado con $800.000: ' + vista);
    const s = del(CONTADO);
    assert.strictEqual(s.cotizadoDe, 'iPhone 14 Pro', 'no quedó marcada la cotización');
    assert.ok(!s.compromisoEnviado, 'quedó marcado el compromiso enviado');
    const marcas = marcasDeTemas(s);
    assert.ok(!marcas.financiacion, 'quedó marcada la financiación como explicada');
    assert.ok(!marcas.requisitos, 'quedaron marcados los requisitos como explicados');
  });

  await check('1b-2. después, "y el 15 pro? tengo lo mismo" lista los dos como hoy, y al elegir "el 15 pro" (no le alcanza) salen la explicación y el PDF con la cotización', async () => {
    assert.strictEqual(del(CONTADO).cotizadoDe, 'iPhone 14 Pro', 'el caso no prueba nada: el 1b-1 no cotizó');
    limpiar();
    await mandarTanda(CONTADO, ['y el 15 pro? tengo lo mismo']);
    const lista = aEste(CONTADO);
    assert.ok(lista.some((m) => /14 Pro o el 15 Pro/.test(m.texto)), 'no listó los dos como hoy: ' + vistaDe(lista));
    assert.ok(!lista.some((m) => esExplicacion(m.texto) || m.tipo === 'documento'), 'la lista trajo la explicación o el PDF: ' + vistaDe(lista));

    limpiar();
    await mandarTanda(CONTADO, ['el 15 pro']);
    const salieron = aEste(CONTADO);
    const vista = vistaDe(salieron);
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length} mensajes, tenían que ser 4: ${vista}`);
    const [explica, pdf, retira, cotiza] = salieron;
    assert.ok(explica.tipo === 'texto' && esExplicacion(explica.texto), 'el 1 no explica la financiación: ' + vista);
    assert.ok(pdf.tipo === 'documento' && esPieCompromiso(pdf.texto), 'el 2 no es el PDF con el pie: ' + vista);
    assert.ok(esPuedeRetirar(retira.texto) && /15 Pro/.test(retira.texto), 'el 3 no es "te lo llevas" del 15 Pro: ' + vista);
    assert.ok(esCotizacion(cotiza.texto) && /15 Pro/.test(cotiza.texto), 'el 4 no es la cotización en cuotas del 15 Pro: ' + vista);
    assert.strictEqual(del(CONTADO).compromisoEnviado, true, 'no quedó marcado el compromiso');
    assert.strictEqual(del(CONTADO).cotizadoDe, 'iPhone 15 Pro', 'no quedó marcada la cotización del 15 Pro');
  });

  await check('1b-3. "tengo 900.000 para el 14 pro, como es la financiacion?": pregunta, así que va la explicación con el PDF y la ficha (sin "te lo llevas", D3)', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro, como es la financiacion?']);
    const vista = vistaDe(aEste(chat));
    const salieron = sinSaludo(aEste(chat), vista);
    sinTeLoLlevas(salieron, vista);
    assert.strictEqual(salieron.length, 3, `salieron ${salieron.length} mensajes, tenían que ser 3: ${vista}`);
    const [explica, pdf, cotiza] = salieron;
    assert.ok(explica.tipo === 'texto' && esExplicacion(explica.texto), 'el 1 no explica la financiación: ' + vista);
    assert.ok(pdf.tipo === 'documento' && esPieCompromiso(pdf.texto), 'el 2 no es el PDF con el pie: ' + vista);
    assert.ok(esDeContado(cotiza.texto), 'el 3 no es la cotización de contado: ' + vista);
    assert.strictEqual(del(chat).compromisoEnviado, true, 'no quedó marcado el compromiso');
  });

  await check('D3. con la entrega por debajo del contado nada cambia: "te lo llevas" sigue antes de la cotización en cuotas', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['me interesa el 14 pro, tengo 600.000']);
    const salieron = aEste(chat);
    const vista = vistaDe(salieron);
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length} mensajes, tenían que ser 4: ${vista}`);
    assert.ok(esPuedeRetirar(salieron[2].texto), 'el 3 no es "te lo llevas": ' + vista);
    assert.ok(esCotizacion(salieron[3].texto), 'el 4 no es la cotización en cuotas: ' + vista);
  });

  await check('1b-4. varias unidades, una de contado y otra en cuotas ("tengo 500.000 para el 14"): queda como hoy, con la explicación y el PDF', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 500.000 para el 14']);
    const salieron = aEste(chat);
    const vista = vistaDe(salieron);
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length} mensajes, tenían que ser 4: ${vista}`);
    const [explica, pdf, retira, cotiza] = salieron;
    assert.ok(explica.tipo === 'texto' && esExplicacion(explica.texto), 'el 1 no explica la financiación: ' + vista);
    assert.ok(pdf.tipo === 'documento' && esPieCompromiso(pdf.texto), 'el 2 no es el PDF con el pie: ' + vista);
    assert.ok(esPuedeRetirar(retira.texto), 'el 3 no es "te lo llevas": ' + vista);
    assert.ok(/^📱/.test(cotiza.texto) && /de contado/.test(cotiza.texto) && /1 pago de/.test(cotiza.texto), 'el caso no prueba nada: el 4 no mezcla contado y cuotas: ' + vista);
    assert.strictEqual(del(chat).compromisoEnviado, true, 'no quedó marcado el compromiso');
  });

  await check('1b-4. varias unidades y todas de contado ("tengo 600.000 para el 14"): sin explicación ni PDF, solo la ficha', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 600.000 para el 14']);
    const vista = vistaDe(aEste(chat));
    const salieron = sinSaludo(aEste(chat), vista);
    assert.ok(!salieron.some((m) => m.tipo === 'documento'), 'salió el PDF: ' + vista);
    assert.ok(!salieron.some((m) => /cuotas?|compromiso/.test(norm(m.texto))), 'habla de cuotas o del compromiso: ' + vista);
    sinTeLoLlevas(salieron, vista);
    assert.strictEqual(salieron.length, 1, `salieron ${salieron.length} mensajes, tenía que ser solo la ficha: ${vista}`);
    assert.ok(/^📱/.test(salieron[0].texto) && (salieron[0].texto.match(/de contado/g) || []).length === 2, 'no es la cotización con las dos de contado: ' + vista);
    assert.ok(!del(chat).compromisoEnviado, 'quedó marcado el compromiso');
  });

  await check('1b. primer iPhone y le alcanza de contado: la frase del primer iPhone aparte y la ficha; sin "te lo llevas", explicación ni PDF', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['es mi primer iphone, tengo 900.000 para el 14 pro']);
    const vista = vistaDe(aEste(chat));
    const salieron = sinSaludo(aEste(chat), vista);
    assert.ok(!salieron.some((m) => m.tipo === 'documento' || esExplicacion(m.texto)), 'salió la explicación o el PDF: ' + vista);
    sinTeLoLlevas(salieron, vista);
    assert.strictEqual(salieron.length, 2, `salieron ${salieron.length} mensajes, tenían que ser 2: ${vista}`);
    assert.ok(/lugar indicado|primer iphone/.test(norm(salieron[0].texto)), 'el 1 no reconoce el primer iPhone: ' + vista);
    assert.ok(esDeContado(salieron[1].texto), 'el 2 no es la cotización de contado: ' + vista);
    assert.strictEqual(del(chat).primerIphoneDicho, true, 'no quedó marcado primerIphoneDicho');
  });

  // Decisión de Tomás del 19/09/2026 (opción A, tras el "Ojo" de D3): primer iPhone,
  // entrega que cubre el contado y pregunta por la financiación. La frase del primer
  // iPhone con el monto ("lo sacas tranquilo con esos $900.000") repetía la ficha: va
  // sin monto ni "te lo llevas", y la ficha dice el resto.
  await check('D3-A. primer iPhone + le alcanza de contado + pregunta la financiación: la frase del primer iPhone va sin el monto y sin "te lo llevas", y después la ficha', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['es mi primer iphone, tengo 900.000 para el 14 pro, como es la financiacion?']);
    const salieron = aEste(chat);
    const vista = vistaDe(salieron);
    sinTeLoLlevas(salieron, vista);
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length} mensajes, tenían que ser 4: ${vista}`);
    const [explica, pdf, primer, cotiza] = salieron;
    assert.ok(explica.tipo === 'texto' && esExplicacion(explica.texto), 'el 1 no explica la financiación: ' + vista);
    assert.ok(pdf.tipo === 'documento' && esPieCompromiso(pdf.texto), 'el 2 no es el PDF con el pie: ' + vista);
    assert.ok(/lugar indicado|primer iphone/.test(norm(primer.texto)), 'el 3 no reconoce el primer iPhone: ' + vista);
    assert.ok(!/\$/.test(primer.texto), 'el 3 repite un monto: ' + vista);
    assert.ok(esDeContado(cotiza.texto), 'el 4 no es la cotización de contado: ' + vista);
    assert.strictEqual(del(chat).primerIphoneDicho, true, 'no quedó marcado primerIphoneDicho');
  });

  await check('D3-A. primerIphoneContado: cada variante reconoce el primer iPhone, sin montos y sin "te lo llevas"', () => {
    const variantes = estilo.variantes('primerIphoneContado', 'iPhone 14 Pro');
    assert.ok(variantes.length >= 2, 'tiene que haber al menos 2 variantes');
    for (const v of variantes) {
      assert.ok(/lugar indicado|primer iphone/.test(norm(v)), 'no reconoce el primer iPhone: ' + v);
      assert.ok(!/\$|\d/.test(v), 'lleva un número: ' + v);
      assert.ok(!esPuedeRetirar(v), 'dice "te lo llevas": ' + v);
    }
  });

  // Agregado para no romper la rama "ya cotizado": sin la explicación marcada, al
  // repetir el monto agregaba "lo que queda te lo financiamos en hasta 2 cuotas" y el PDF.
  // La frase `yaCotizado` en sí no cambia (una variante dice "el resto lo hacemos en
  // cuotas" desde antes): queda anotada como pendiente.
  await check('1b. ya cotizado de contado y repite el monto: no agrega el resto en cuotas, los requisitos ni el PDF', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro']);
    assert.ok(aEste(chat).some((m) => esDeContado(m.texto)), 'el caso no prueba nada: no cotizó de contado: ' + vistaDe(aEste(chat)));
    limpiar();
    await mandarTanda(chat, ['tengo 900.000']);
    const salieron = aEste(chat);
    const vista = vistaDe(salieron);
    // Desde la Mejora 1, de contado va `yaCotizadoContado` (sin "el resto en cuotas").
    const yaCotizado = estilo.variantes('yaCotizadoContado', '$900.000', '14 Pro').map(norm);
    assert.ok(salieron.length && yaCotizado.includes(norm(salieron[0].texto)), 'el caso no prueba nada: no fue por "ya cotizado": ' + vista);
    const resto = estilo.variantes('restoEnCuotas').map(norm);
    assert.ok(!salieron.some((m) => resto.includes(norm(m.texto))), 'agregó el resto en cuotas: ' + vista);
    assert.ok(!salieron.some((m) => m.tipo === 'documento'), 'salió el PDF: ' + vista);
    assert.ok(!salieron.some((m) => /compromiso|\bdni\b|tarjeta/.test(norm(m.texto))), 'le pasó los requisitos: ' + vista);
    assert.strictEqual(salieron.length, 2, `salieron ${salieron.length} mensajes, tenían que ser 2 (ya cotizado y la pregunta): ${vista}`);
    assert.ok(!del(chat).compromisoEnviado, 'quedó marcado el compromiso');
  });

  // Con la regla sola, "que papeles piden?" con una entrega de contado quedaba sin
  // respuesta. Desde la Mejora 1 (decisión de Tomás) la respuesta es que de contado
  // no necesita nada: sin dni, tarjeta, compromiso ni PDF.
  await check('1b. de contado y pregunta por los requisitos en la misma tanda: que no necesita nada, sin PDF ni la explicación', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro, que papeles piden?']);
    const vista = vistaDe(aEste(chat));
    const salieron = sinSaludo(aEste(chat), vista);
    assert.ok(!salieron.some((m) => esExplicacion(m.texto)), 'salió la explicación de la financiación: ' + vista);
    assert.ok(!salieron.some((m) => m.tipo === 'documento'), 'salió el PDF: ' + vista);
    sinTeLoLlevas(salieron, vista);
    assert.strictEqual(salieron.length, 2, `salieron ${salieron.length} mensajes, tenían que ser 2: ${vista}`);
    assert.ok(esDeContado(salieron[0].texto), 'el 1 no es la cotización de contado: ' + vista);
    assert.ok(esRequisitosContado(salieron[1].texto), 'el 2 no dice que de contado no necesita nada: ' + vista);
    assert.ok(!del(chat).compromisoEnviado, 'quedó marcado el compromiso');
  });

  console.log('\nContado sin cuotas ni requisitos (Mejora 1, paso 5)\n');

  // Paga de contado = la última cotización fue soloContado (`cotizadoDeContado`,
  // confirmada al salir) o dijo que paga de contado (`forma_pago`).
  const sinRequisitos = (m) => !/\bdni\b|compromiso|tarjeta/.test(norm(m.texto)) && m.tipo !== 'documento';

  await check('5-1. contado y después "que papeles piden?" y "necesito dni?": que no necesita nada, sin dni, compromiso ni PDF', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro']);
    assert.strictEqual(del(chat).cotizadoDeContado, true, 'no quedó marcada la cotización de contado');
    for (const pregunta of ['que papeles piden?', 'necesito dni?']) {
      limpiar();
      await mandarTanda(chat, [pregunta]);
      const salieron = aEste(chat);
      const vista = vistaDe(salieron);
      assert.ok(salieron.length > 0, `"${pregunta}" no contestó nada`);
      assert.ok(salieron.every(sinRequisitos), `"${pregunta}" le pasó los requisitos: ` + vista);
      assert.ok(salieron.some((m) => esRequisitosContado(m.texto)), `"${pregunta}" no dijo que no necesita nada: ` + vista);
    }
    assert.ok(!del(chat).compromisoEnviado, 'quedó marcado el compromiso');
  });

  await check('5-1. dijo que paga de contado (forma_pago) y pregunta qué papeles piden: que no necesita nada', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['lo pago de contado, que papeles piden?']);
    const salieron = aEste(chat);
    const vista = vistaDe(salieron);
    assert.strictEqual(del(chat).forma_pago, 'contado', 'el caso no prueba nada: no guardó forma_pago contado');
    assert.ok(salieron.every(sinRequisitos), 'le pasó los requisitos: ' + vista);
    assert.ok(salieron.some((m) => esRequisitosContado(m.texto)), 'no dijo que no necesita nada: ' + vista);
  });

  await check('5-1. en cuotas y "que papeles piden?": como hoy, con el dni', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['me interesa el 14 pro, tengo 600.000']);
    assert.strictEqual(del(chat).cotizadoDe, 'iPhone 14 Pro', 'el caso no prueba nada: no cotizó');
    limpiar();
    await mandarTanda(chat, ['que papeles piden?']);
    const salieron = aEste(chat);
    assert.ok(salieron.some((m) => /\bdni\b/.test(norm(m.texto))), 'no dijo lo del dni: ' + vistaDe(salieron));
    assert.ok(!salieron.some((m) => esRequisitosContado(m.texto)), 'dijo que no necesita nada: ' + vistaDe(salieron));
  });

  await check('5-1. primero de contado y después recotiza en cuotas: vuelve a pedir el dni', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro']);
    assert.strictEqual(del(chat).cotizadoDeContado, true, 'el caso no prueba nada: no cotizó de contado');
    await mandarTanda(chat, ['tengo 600.000']);
    assert.strictEqual(del(chat).cotizadoDeContado, false, 'la nueva cotización en cuotas no pisó la marca');
    limpiar();
    await mandarTanda(chat, ['que papeles piden?']);
    const salieron = aEste(chat);
    assert.ok(salieron.some((m) => /\bdni\b/.test(norm(m.texto))), 'no dijo lo del dni: ' + vistaDe(salieron));
  });

  // Agregado para no romper los requisitos de quien financia: con "la última
  // cotización fue de contado O dijo contado" a secas, una señal vieja de contado
  // le decía "no necesitas nada" a alguien que ya estaba en cuotas.
  await check('5-1. dijo "lo pago de contado" pero no le alcanza y se cotiza en cuotas: "que papeles piden?" sigue con el dni', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['lo pago de contado']);
    await mandarTanda(chat, ['me interesa el 14 pro, tengo 600.000']);
    assert.strictEqual(del(chat).forma_pago, 'contado', 'el caso no prueba nada: no guardó forma_pago contado');
    assert.strictEqual(del(chat).cotizadoDeContado, false, 'el caso no prueba nada: no cotizó en cuotas');
    limpiar();
    await mandarTanda(chat, ['que papeles piden?']);
    const salieron = aEste(chat);
    assert.ok(salieron.some((m) => /\bdni\b/.test(norm(m.texto))), 'no dijo lo del dni: ' + vistaDe(salieron));
    assert.ok(!salieron.some((m) => esRequisitosContado(m.texto)), 'dijo que no necesita nada: ' + vistaDe(salieron));
  });

  await check('5-1. cotizado de contado pero después pregunta en cuotas: "que papeles piden?" sigue con el dni', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro']);
    await mandarTanda(chat, ['y si lo hago en cuotas?']);
    assert.strictEqual(del(chat).cotizadoDeContado, true, 'el caso no prueba nada: no quedó la cotización de contado');
    assert.strictEqual(del(chat).forma_pago, 'cuotas', 'el caso no prueba nada: no guardó forma_pago cuotas');
    limpiar();
    await mandarTanda(chat, ['que papeles piden?']);
    const salieron = aEste(chat);
    assert.ok(salieron.some((m) => /\bdni\b/.test(norm(m.texto))), 'no dijo lo del dni: ' + vistaDe(salieron));
  });

  await check('5-2. contado repitiendo el monto (dos veces, así salen las dos variantes): ningún mensaje dice "cuota"', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro']);
    for (let i = 0; i < 2; i++) {
      limpiar();
      await mandarTanda(chat, ['tengo 900.000']);
      const salieron = aEste(chat);
      assert.ok(salieron.length > 0, 'no contestó nada');
      assert.ok(!salieron.some((m) => /cuota/.test(norm(m.texto))), `vuelta ${i + 1}: habló de cuotas: ` + vistaDe(salieron));
    }
  });

  await check('5-2. contado con varios modelos ("y el 15 pro?"): ningún mensaje dice "cuota"', async () => {
    const chat = nuevoChat();
    limpiar();
    await mandarTanda(chat, ['tengo 900.000 para el 14 pro']);
    limpiar();
    await mandarTanda(chat, ['y el 15 pro?']);
    const salieron = aEste(chat);
    assert.ok(salieron.some((m) => /14 Pro o el 15 Pro/.test(m.texto)), 'el caso no prueba nada: no fue por varios modelos: ' + vistaDe(salieron));
    assert.ok(!salieron.some((m) => /cuota/.test(norm(m.texto))), 'habló de cuotas: ' + vistaDe(salieron));
  });

  await check('5-1. requisitosContado: 2 o 3 variantes, que no necesita nada, sin dni, tarjeta ni compromiso, y no marcan requisitos', () => {
    const variantes = estilo.variantes('requisitosContado');
    assert.ok(variantes.length >= 2 && variantes.length <= 3, `tiene ${variantes.length} variantes, tenían que ser 2 o 3`);
    for (const v of variantes) {
      assert.ok(esRequisitosContado(v), 'no dice que de contado no necesita nada: ' + v);
      assert.ok(!/\bdni\b|tarjeta|compromiso/.test(norm(v)), 'nombra dni, tarjeta o compromiso: ' + v);
      assert.ok(!temas.EXPLICA.requisitos.test(norm(v)), 'marcaría los requisitos como explicados: ' + v);
    }
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
