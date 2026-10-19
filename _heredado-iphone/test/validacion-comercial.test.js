'use strict';
/**
 * Bloque 5 de la auditoría (A5): validación comercial. Decisiones de Tomás del
 * 16/09/2026.
 *
 *   node test/validacion-comercial.test.js
 *
 * Se prueba:
 *   1. entrega por debajo del mínimo del modelo que nombró (bloque 5b, decisión de
 *      Tomás del 16/09/2026): primero se le dice solo la entrega inicial, dos veces;
 *      recién después, con hasta $45.000 de diferencia se cotiza con recargo, y con
 *      más va la alternativa. Un rechazo salta directo al último paso. Nunca la
 *      diferencia, ni "no alcanza", ni el recargo. El conteo es por modelo y suma
 *      solo si la línea salió. Donde el bot elige el modelo sigue el mínimo estricto;
 *   2. pedido de descuento: desde el 30/09/2026 no hay descuento; cada pedido recibe "el
 *      precio es ese", sin números y sin escalar (hasta ahí, el 2º era el contado −
 *      $10.000). Las cuotas no cambian. Sin un modelo claro escala callado;
 *   3. corrección de monto: con "perdón", "me equivoqué"… gana el último monto y se
 *      recotiza; un número suelto se lee solo después de una cotización o de la
 *      pregunta por la entrega;
 *   4. dos o más modelos mostrados y un monto sin modelo: se cotizan todos (los
 *      últimos 3), dentro del tope de 4 mensajes;
 *   5. canje: se piden los datos sin prometer nada, y cuando los manda escala callado;
 *   6. el conteo de los pedidos de descuento se confirma solo si el envío salió.
 *
 * Sin red, extractor local, números inventados. El entorno se fija acá y no se
 * hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000055@g.us';

process.env.ESPERA_MIN_MS = '20';
process.env.ESPERA_MAX_MS = '30';
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
process.env.ESCALADO_RECORDATORIO_MIN = '30';
process.env.ESCALADO_REANUDAR_HORAS = '24';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-validacion-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-validacion-' + process.pid + '.jsonl');

const PLANILLA = require('./fixture-planilla');
const sheets = require('../src/sheets');
sheets.usarFixture(PLANILLA);
sheets.registrarLead = async () => {};

const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

// Evolution de mentira. Con `fallar`, el envío no devuelve id: para index.js no salió.
let idN = 0;
let fallar = false;
const aClientes = [];
const alGrupo = [];
async function envio(numero, tipo, texto) {
  const registro = { numero, tipo, texto, id: 'BOT' + ++idN };
  aClientes.push(registro);
  return fallar ? {} : { key: { remoteJid: numero, fromMe: true, id: registro.id } };
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
const control = require('../src/control');
const estilo = require('../src/estilo');
const acciones = require('../src/acciones');
const temas = require('../src/temas');
const cotizador = require('../src/cotizador');
const { decidir } = require('../src/responder');

const { cotizar, pesos } = cotizador;

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
const nuevoChat = () => '549000000' + String(n++).padStart(4, '0') + '@s.whatsapp.net';
const numero = (chat) => chat.split('@')[0];
const del = (chat) => state.todos()[chat] || {};
const fila = (modelo) => sheets.buscarModelo(PLANILLA, modelo, null);
const cuantas = (texto, parte) => texto.split(parte).length - 1;
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}

/** Un turno como en el banco de casos: entra al historial, decide, y lo que dice sale (confirma sus marcas). */
async function turno(chat, texto) {
  state.agregarAlHistorial(chat, 'cliente', texto);
  const r = await decidir(chat, texto, 'Lucia');
  const mensajes = r.mensajes || [];
  for (const m of mensajes) {
    state.agregarAlHistorial(chat, 'vendedor', acciones.paraHistorial(m));
    state.confirmarMarcas(chat, acciones.marcasDe(m));
  }
  const textos = mensajes.map(acciones.comoTexto);
  return { r, textos, todo: textos.join(' | ') };
}

const EXPLICACIONES = estilo.variantes('explicaFinanciacion');
const explica = (todo) => EXPLICACIONES.some((e) => todo.toLowerCase().includes(e.toLowerCase()));

(async () => {
  console.log('\n1. Entrega por debajo del mínimo: primero se insiste con la entrega (bloque 5b)\n');

  const MIN13 = fila('13').anticipo_min; // $320.000
  // La línea de la entrega inicial se reconoce por su forma (temas.LINEA_ENTREGA_INICIAL):
  // desde el Bloque Tono retoma el monto del cliente, así que el texto cambia por turno.
  const esLineaEntrega = (t) => !String(t).includes('📱') && temas.LINEA_ENTREGA_INICIAL.test(String(t).toLowerCase());
  const lineaEntregaDe = (textos) => textos.find(esLineaEntrega);
  const lineaDe = (textos, corto, minimo) => textos.find((t) => esLineaEntrega(t) && t.includes(corto) && t.includes(pesos(minimo)));
  const montos = (t) => [...new Set(t.match(/\$[\d.]+/g) || [])].sort();
  const enMiles = (n) => String(n / 1000);
  const terminaEnPregunta = (t) => /\?\s*$/.test(String(t).trim());
  // La frase de excepción antes de la ficha con recargo (Bloque Tono).
  const esExcepcion = (t, plata, modelos = 'el 13') =>
    estilo.variantes('excepcionCerca', modelos, pesos(plata)).some((v) => v.toLowerCase() === String(t).toLowerCase());
  const hayExcepcion = (textos) => textos.some((t) => /\bcerca\b|excepcion/i.test(t));

  await check('las constantes del bloque 5b: tope $45.000; las variantes de la línea (con y sin el monto del cliente) se reconocen, no preguntan y no marcan la financiación', () => {
    assert.strictEqual(cotizador.TOPE_BAJO_MINIMO, 45000);
    const conMonto = estilo.variantes('entregaInicial', '13', pesos(MIN13), pesos(MIN13 - 40000));
    const sinMonto = estilo.variantes('entregaInicial', '13', pesos(MIN13), null);
    assert.strictEqual(conMonto.length, 3);
    assert.strictEqual(sinMonto.length, 3);
    for (const v of [...conMonto, ...sinMonto]) {
      assert.ok(temas.LINEA_ENTREGA_INICIAL.test(v), 'no se reconoce como la línea de la entrega: ' + v);
      assert.ok(!v.includes('?'), 'la línea lleva una pregunta: ' + v);
      assert.ok(v.includes('13') && v.includes(pesos(MIN13)), 'la línea no dice el modelo y su entrega: ' + v);
      assert.ok(!/null|undefined/.test(v), 'quedó rota: ' + v);
      assert.ok(!/40\.000|falta/i.test(v), 'dijo la diferencia: ' + v);
      assert.ok(v.length <= 400, 'demasiado larga: ' + v.length);
      assert.strictEqual(temas.actualizarDesdeHistorial({ historial: [{ quien: 'vendedor', texto: v }] }), null, 'la línea marca un tema: ' + v);
    }
    // Bloque Tono: dos partes, retoma el monto del cliente y cierra con una razón o un beneficio.
    for (const v of conMonto) {
      assert.ok(v.includes(pesos(MIN13 - 40000)), 'no retoma el monto del cliente: ' + v);
      assert.ok(v.split(/[.,]/).length >= 3, 'es una sola oración: ' + v);
    }
    // 3. Sin el monto del cliente, la línea sale igual y bien formada.
    for (const v of sinMonto) {
      assert.ok(!v.includes(pesos(MIN13 - 40000)) && !/^\s|\s\s|, ,|\.\s*\./.test(v), 'quedó mal armada sin el monto: ' + v);
    }
    assert.notStrictEqual(conMonto[0], conMonto[1]);
    assert.notStrictEqual(conMonto[1], conMonto[2]);
  });

  await check('bloque 9: la entrega de varios modelos en un mensaje (2 y 3 modelos, con y sin el monto) se reconoce, dice cada entrega, explica una vez, no pregunta y no marca la financiación', () => {
    const dos = [['14 Pro', '$480.000'], ['15 Pro', '$530.000']];
    const tres = [['13', '$320.000'], ...dos];
    const todas = [
      ...estilo.variantes('entregaInicialVarios', dos, '$200.000'),
      ...estilo.variantes('entregaInicialVarios', dos, null),
      ...estilo.variantes('entregaInicialVarios', tres, '$200.000'),
      ...estilo.variantes('entregaInicialVarios', tres, null),
    ];
    assert.strictEqual(todas.length, 12);
    for (const v of todas) {
      assert.ok(temas.LINEA_ENTREGA_INICIAL.test(v), 'no se reconoce como la línea de la entrega: ' + v);
      assert.ok(!v.includes('?'), 'la línea lleva una pregunta: ' + v);
      assert.ok(dos.every(([m, p]) => v.includes(m) && v.includes(p)), 'no dice cada modelo con su entrega: ' + v);
      assert.strictEqual(v.split('1 o 2 cuotas').length - 1, 1, 'la explicación no va una sola vez: ' + v);
      assert.strictEqual(v.split('entrega inicial').length - 1, 1, '"entrega inicial" más de una vez: ' + v);
      assert.ok(!/null|undefined/.test(v), 'quedó rota: ' + v);
      assert.ok(!/falta/i.test(v), 'dijo la diferencia: ' + v);
      assert.ok(!/^\s|\s\s|, ,|\.\s*\./.test(v), 'quedó mal armada: ' + v);
      assert.ok(v.length <= 400, 'demasiado larga: ' + v.length);
      assert.strictEqual(temas.actualizarDesdeHistorial({ historial: [{ quien: 'vendedor', texto: v }] }), null, 'la línea marca un tema: ' + v);
    }
    for (const v of estilo.variantes('entregaInicialVarios', tres, null)) assert.ok(v.includes('13') && v.includes('$320.000'), v);
  });

  await check('2. "tengo [mín − 40.000] para el 13": explicación, PDF y la línea, que retoma los 280.000 y dice los 320.000; sin cuotas, sin la diferencia, sin pregunta', async () => {
    const chat = nuevoChat();
    const { r, textos, todo } = await turno(chat, `tengo ${enMiles(MIN13 - 40000)} para el 13`);
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.ok(!r.bajoMinimo, 'cotizó con recargo en el paso 1');
    assert.ok(explica(todo), 'no explicó la financiación antes: ' + todo);
    assert.ok(textos.some((t) => t.startsWith('[doc: compromiso de pago]')), 'no mandó el PDF: ' + todo);
    const linea = textos[textos.length - 1];
    assert.ok(esLineaEntrega(linea), 'la última no es la línea de la entrega: ' + todo);
    assert.ok(textos.length <= 4, `mandó ${textos.length} mensajes`);
    // Bloque Tono: la línea retoma lo que dijo ($280.000) y dice la entrega ($320.000); nunca la resta.
    assert.deepStrictEqual(montos(todo), [pesos(MIN13 - 40000), pesos(MIN13)].sort(), 'los montos no son el suyo y la entrega: ' + todo);
    assert.ok(!terminaEnPregunta(linea), 'la línea termina con una pregunta: ' + linea);
    // Bloque 9: en un chat nuevo va primero el saludo del día ("como andas?"); la pregunta
    // prohibida es la del resto.
    assert.ok(estilo.variantes('saludo', 'luciaa').includes(textos[0].toLowerCase()), 'el 1 no es el saludo: ' + todo);
    const sinSaludo = textos.slice(1).join(' | ');
    for (const prohibido of [/📱/, /1 pago|2 pagos/i, /no (te )?(alcanza|llega)\b/i, /te falta|faltan|faltaria/i, /40\.000/, /495\.000/, /estirarte|arranca en/i, /\?/]) {
      assert.ok(!prohibido.test(sinSaludo), `dijo ${prohibido}: ${todo}`);
    }
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 1 });
    assert.strictEqual(del(chat).presupuestoAnotado, MIN13 - 40000);
  });

  await check('3. después, "tengo [mín − 30.000]": otra vez la entrega inicial, con otra variante, sin cotizar', async () => {
    const chat = nuevoChat();
    const uno = await turno(chat, `tengo ${enMiles(MIN13 - 40000)} para el 13`);
    const dos = await turno(chat, `tengo ${enMiles(MIN13 - 30000)}`);
    assert.ok(!dos.r.escalar, 'escaló: ' + dos.r.motivo);
    assert.strictEqual(dos.textos.length, 1, 'mandó más que la línea: ' + dos.todo);
    assert.ok(esLineaEntrega(dos.textos[0]), 'no es la línea de la entrega: ' + dos.todo);
    // Bloque Tono: la segunda no es la primera con otras palabras: es la variante explicativa.
    const primera = lineaEntregaDe(uno.textos);
    assert.notStrictEqual(dos.textos[0], primera, 'repitió la misma variante');
    assert.notStrictEqual(dos.textos[0].replace(/\$[\d.]+/g, '$'), primera.replace(/\$[\d.]+/g, '$'), 'la segunda es la primera con otro monto');
    assert.deepStrictEqual(montos(dos.todo), [pesos(MIN13 - 30000), pesos(MIN13)].sort());
    assert.ok(!terminaEnPregunta(dos.textos[0]), 'la línea termina con una pregunta: ' + dos.todo);
    assert.ok(!/30\.000|📱|1 pago/.test(dos.todo), 'dijo la diferencia o cotizó: ' + dos.todo);
    assert.strictEqual(del(chat).entrega, MIN13 - 30000);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 2 });
  });

  await check('4. después, "no llego": cotiza con recargo con el último monto (mín − 30.000) y bajoMinimo para el log', async () => {
    const chat = nuevoChat();
    await turno(chat, `tengo ${enMiles(MIN13 - 40000)} para el 13`);
    await turno(chat, `tengo ${enMiles(MIN13 - 30000)}`);
    const cot = cotizar(fila('13'), MIN13 - 30000, PLANILLA.config);
    assert.ok(cot.ok && cot.bajoMinimo, 'el caso no prueba nada: mín − 30.000 no quedó bajo el mínimo');
    assert.strictEqual(cot.pagoUnico, 300000); // 205.000 × 1,41 = 289.050 → 290.000 + 10.000 (Ajustes 2)
    assert.strictEqual(cot.cuotaDe2, 164000); // 205.000 × 1,50 / 2 = 153.750 → 154.000 + 10.000
    const { r, textos, todo } = await turno(chat, 'no llego');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13'], 'no avisó bajoMinimo para el log');
    assert.ok(todo.includes(`Con una entrega de *${pesos(MIN13 - 30000)}*`), 'no cotizó con el último monto: ' + todo);
    assert.ok(todo.includes('1 pago de $300.000') && todo.includes('2 pagos de $164.000'), 'no cotizó con el recargo: ' + todo);
    assert.ok(!explica(todo), 'repitió la explicación: ' + todo);
    // Bloque Tono (4): antes de la ficha, la frase de excepción; después, la ficha. En 4 mensajes.
    const iExcepcion = textos.findIndex((t) => esExcepcion(t, MIN13 - 30000));
    const iFicha = textos.findIndex((t) => t.startsWith('📱'));
    assert.ok(iExcepcion >= 0, 'falta la frase de excepción: ' + todo);
    assert.ok(iFicha > iExcepcion, 'la ficha no va después de la excepción: ' + todo);
    assert.ok(textos.length <= 4, `mandó ${textos.length} mensajes`);
    for (const prohibido of [/no (te )?(alcanza|llega)\b/i, /te falta|faltan|faltaria/i, /30\.000/, /320\.000/, /recargo|interes/i, /entrega inicial/i, /estirarte/i, /mas car/i]) {
      assert.ok(!prohibido.test(todo), `dijo ${prohibido}: ${todo}`);
    }
    assert.strictEqual(del(chat).cotizadoDe, 'iPhone 13');
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 2 }, 'siguió contando después de cotizar');
  });

  await check('5. atajo por rechazo: entrega baja → "entonces no" → cotiza con recargo en ese momento', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const cot = cotizar(fila('13'), MIN13 - 40000, PLANILLA.config);
    assert.strictEqual(cot.pagoUnico, 314000); // 215.000 × 1,41 = 303.150 → 304.000 + 10.000 (Ajustes 2)
    assert.strictEqual(cot.cuotaDe2, 172000); // 215.000 × 1,50 / 2 = 161.250 → 162.000 + 10.000
    const { r, textos, todo } = await turno(chat, 'uh entonces no');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13']);
    assert.ok(todo.includes('1 pago de $314.000') && todo.includes('2 pagos de $172.000'), 'no cotizó con el recargo: ' + todo);
    assert.ok(!/entrega inicial|estirarte|anotado/i.test(todo), 'insistió otra vez o bajó de gama: ' + todo);
    assert.ok(esExcepcion(textos[0], MIN13 - 40000), 'la tanda no arranca con la frase de excepción: ' + todo);
    assert.ok(!/recargo|interes|40\.000/i.test(todo), 'dijo el recargo o la diferencia: ' + todo);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 1 }, 'sumó una insistencia que no hubo');
  });

  await check('detección de rechazo (regex nueva): cada frase; las de insistencia no; y el "no" suelto', () => {
    for (const t of ['uh entonces no', 'entonces no', 'lo dejo', 'dejalo', 'no me interesa', 'esta muy caro', 'muy caro', 'paso', 'paso.', 'bueno paso', 'no, paso gracias', 'gracias igual', 'igual gracias', 'no gracias', 'no, gracias', 'no gracias, tengo 290', 'muy caro, tengo 310.000']) {
      assert.strictEqual(local.esRechazo(t), true, `no leyó rechazo en "${t}"`);
    }
    // Ajuste al 5b y al 17/09: con "?" no es rechazo, es seguir negociando (un monto
    // ya no lo salva: "no gracias, tengo 290" cotiza con esos 290); "paso"
    // solo como mensaje entero; "lo dejo" / "dejalo" no con "te" adelante ni seguidos
    // de señado, reservado, apartado, anotado o para.
    for (const t of ['no llego', 'no tengo', 'no me alcanza', 'no tengo mas', 'cuanto le agrego?', 'cuanto le tengo que agregar?', 'paso hoy', 'puedo pasar hoy?', 'tengo 290', 'no', 'mañana paso', 'hoy paso', 'despues paso', 'lo dejo señado?', 'lo dejo señado', 'lo dejo reservado', 'te lo dejo en 290?', 'te lo dejo', 'entonces no se puede con 290?', 'está muy caro?']) {
      assert.strictEqual(local.esRechazo(t), false, `leyó rechazo en "${t}"`);
    }
    for (const t of ['no', 'No', 'noo', 'nop', 'no, no', 'no.']) assert.strictEqual(local.esNegacionSuelta(t), true, `"${t}" no es un no suelto`);
    for (const t of ['no llego', 'no gracias', 'nose', 'no se', 'ok']) assert.strictEqual(local.esNegacionSuelta(t), false, `"${t}" se leyó como un no suelto`);
  });

  await check('14. "no llego", "no tengo" y "no me alcanza" no disparan el atajo: insisten. "gracias igual" sí', async () => {
    for (const frase of ['no llego', 'no tengo', 'no me alcanza']) {
      const chat = nuevoChat();
      await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
      const { r, textos, todo } = await turno(chat, frase);
      assert.ok(!r.bajoMinimo && !todo.includes('📱'), `"${frase}" cotizó: ` + todo);
      assert.ok(esLineaEntrega(textos[textos.length - 1]), `"${frase}" no insistió: ` + todo);
      assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 2 });
    }
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { r, todo } = await turno(chat, 'gracias igual');
    assert.ok(todo.includes('📱') && r.bajoMinimo, '"gracias igual" no saltó al recargo: ' + todo);
    assert.ok(!/a vos!/i.test(todo), 'contestó el agradecimiento: ' + todo);
  });

  await check('Ajustes 2 (5): 280.000 → línea → "tengo 300.000 se puede financiar igual?" → línea → "bueno te escribo el mes que viene entonces" → ficha con 300.000 y recargo, sin despedida', async () => {
    const chat = nuevoChat();
    const uno = await turno(chat, `quiero el 13, tengo ${enMiles(MIN13 - 40000)}`);
    assert.ok(esLineaEntrega(uno.textos[uno.textos.length - 1]), 'paso 1 sin la línea: ' + uno.todo);
    const dos = await turno(chat, 'tengo 300.000 se puede financiar igual?');
    assert.ok(esLineaEntrega(dos.textos[dos.textos.length - 1]) && !dos.todo.includes('📱'), 'paso 2 sin la línea: ' + dos.todo);
    assert.strictEqual(del(chat).entrega, 300000);
    const { r, todo } = await turno(chat, 'bueno te escribo el mes que viene entonces');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13'], 'no cotizó con recargo: ' + todo);
    assert.ok(todo.includes('Con una entrega de *$300.000*') && todo.includes('1 pago de $285.000') && todo.includes('2 pagos de $157.000'), 'la ficha no es la de 300.000 con recargo: ' + todo);
    assert.ok(!/quedo atento|escribime y lo vemos/i.test(todo), 'se despidió: ' + todo);
    assert.ok(!/entrega inicial/i.test(todo), 'insistió otra vez: ' + todo);
  });

  await check('Ajustes 2 (6): línea → "lo pienso" en la primera insistencia → ficha con recargo', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { r, todo } = await turno(chat, 'lo pienso');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13'], 'no cotizó con recargo: ' + todo);
    assert.ok(todo.includes('1 pago de $314.000') && todo.includes('2 pagos de $172.000'), 'no es la ficha de 280.000 con recargo: ' + todo);
    assert.ok(!/quedo atento/i.test(todo), 'se despidió: ' + todo);
  });

  await check('Ajustes 2 (7): faltan $100.000 → línea → "después te aviso" → la alternativa', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 100000)}`);
    const { r, todo } = await turno(chat, 'después te aviso');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.ok(!r.bajoMinimo, 'cotizó el 13 con recargo con $100.000 de diferencia');
    assert.ok(/mira lo que si te podes llevar/i.test(todo) && /te lo dejo anotado, cuando llegues a los \$320\.000/i.test(todo), 'no ofreció la alternativa: ' + todo);
    assert.ok(!/quedo atento|entrega inicial/i.test(todo), 'se despidió o insistió: ' + todo);
  });

  await check('Ajustes 2 (8): sin insistencia, "lo pienso" después de una cotización normal queda como hoy', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 + 80000)}`);
    const { r, todo } = await turno(chat, 'lo pienso');
    assert.ok(!r.escalar);
    assert.ok(/quedo atento/i.test(todo) && !todo.includes('📱'), 'no contestó como siempre: ' + todo);
  });

  await check('Tono 5: entrega igual al mínimo → ficha normal, sin la frase de excepción', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    await turno(chat, `tengo ${enMiles(MIN13 - 30000)}`);
    const { r, textos, todo } = await turno(chat, `tengo ${enMiles(MIN13)}`);
    assert.ok(!r.bajoMinimo && todo.includes('📱'), 'no cotizó normal: ' + todo);
    assert.ok(!hayExcepcion(textos), 'dijo la excepción con la entrega en el mínimo: ' + todo);
  });

  await check('Tono 6: alternativa (faltan más de $45.000) → sin la frase de excepción', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 100000)}`);
    await turno(chat, 'no tengo mas');
    const { r, textos, todo } = await turno(chat, 'no');
    assert.ok(!r.bajoMinimo && /anotado/i.test(todo), 'no fue a la alternativa: ' + todo);
    assert.ok(!hayExcepcion(textos), 'dijo la excepción en la alternativa: ' + todo);
  });

  await check('Tono 7: contado → sin la frase de excepción', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { textos, todo } = await turno(chat, 'tengo 500');
    assert.ok(todo.includes('$495.000') && /contado/i.test(todo), 'no cotizó de contado: ' + todo);
    assert.ok(!hayExcepcion(textos), 'dijo la excepción de contado: ' + todo);
  });

  await check('Tono 8: paso 3 con recargo, con el precio preguntado y con el primer iPhone, sigue en 4 mensajes y la excepción va antes de la ficha', async () => {
    const conPrecio = nuevoChat();
    await turno(conPrecio, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    await turno(conPrecio, `tengo ${enMiles(MIN13 - 30000)}`);
    const a = await turno(conPrecio, 'no llego, cuanto sale?');
    assert.ok(a.r.bajoMinimo && a.todo.includes('📱'), 'no cotizó con recargo: ' + a.todo);
    assert.ok(a.textos.length <= 4, `mandó ${a.textos.length} mensajes`);
    assert.ok(a.todo.includes('$495.000'), 'no dijo el precio que preguntó: ' + a.todo);
    assert.ok(a.textos.findIndex((t) => esExcepcion(t, MIN13 - 30000)) === 0, 'la excepción no va primero: ' + a.todo);
    assert.ok(a.textos.findIndex((t) => t.startsWith('📱')) === a.textos.length - 1, 'la ficha no va al final: ' + a.todo);

    const primero = nuevoChat();
    await turno(primero, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    await turno(primero, `tengo ${enMiles(MIN13 - 30000)}`);
    const b = await turno(primero, 'es mi primer iphone, no llego');
    assert.ok(b.r.bajoMinimo && b.todo.includes('📱'), 'no cotizó con recargo: ' + b.todo);
    assert.ok(b.textos.length <= 4, `mandó ${b.textos.length} mensajes`);
    assert.ok(/primer iphone|lugar indicado/i.test(b.todo), 'no reconoció el primer iPhone: ' + b.todo);
    assert.ok(hayExcepcion(b.textos), 'falta la excepción: ' + b.todo);
    assert.ok(b.textos.findIndex((t) => /\bcerca\b/i.test(t)) < b.textos.findIndex((t) => t.startsWith('📱')), 'la excepción no va antes de la ficha: ' + b.todo);
    assert.strictEqual(del(primero).primerIphoneDicho, true);
  });

  await check('Ajustes 2: "se va" por frase, con y sin la intención lo_piensa; con "?" no, con monto sí', () => {
    for (const t of ['bueno te escribo el mes que viene entonces', 'mas adelante te escribo', 'después te aviso', 'lo pienso', 'lo voy a pensar', 'cuando cobre te escribo', 'lo veo y te aviso', 'lo pienso, tengo 290', 'dale nos vemos el mes que viene, tengo 310.000']) {
      assert.strictEqual(local.seVa(t), true, `no leyó "se va" en "${t}"`);
    }
    assert.strictEqual(local.seVa('bueno dale', 'lo_piensa'), true, 'la intención lo_piensa no cuenta');
    for (const t of ['tengo 300.000 se puede financiar igual?', 'te aviso si llego a 320?', 'no llego', 'te doy 280 ahora y el resto cuando cobre', 'mañana paso']) {
      assert.strictEqual(local.seVa(t), false, `leyó "se va" en "${t}"`);
    }
  });

  await check('Tono 1b: volver con un plazo lejano es "se va"; con un día cercano no', () => {
    for (const t of ['nos vemos el mes que viene', 'nos vemos mas adelante', 'paso el mes que viene', 'vuelvo el mes que viene', 'cuando cobre paso', 'bueno nos vemos el mes que viene entonces', 'vuelvo a fin de mes']) {
      assert.strictEqual(local.seVa(t), true, `no leyó "se va" en "${t}"`);
    }
    // Un día concreto o cercano es un turno, no irse; y siguen las excepciones de siempre.
    for (const t of ['nos vemos el lunes', 'nos vemos mañana', 'paso hoy', 'paso mañana', 'nos vemos a las 17', 'paso el mes que viene si llego?', 'nos vemos, tengo 290']) {
      assert.strictEqual(local.seVa(t), false, `leyó "se va" en "${t}"`);
    }
  });

  // Las preguntas del turno rotan variante (estilo.js), así que se comparan contra
  // todas: con un /que dia|que horario/ a mano, "a que hora mas o menos podrias
  // venir?" no entraba y el test salía flaky.
  const PREGUNTAS_TURNO = [...estilo.variantes('queDia'), ...estilo.variantes('queHorario')];
  const pregNotaTurno = (todo) => PREGUNTAS_TURNO.some((p) => todo.toLowerCase().includes(p.toLowerCase()));

  await check('Tono 1b (1): "nos vemos el mes que viene" con insistencia en curso → excepción y ficha, sin turno ni escalado', async () => {
    const chat = nuevoChat();
    await turno(chat, `quiero el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const dos = await turno(chat, 'tengo 300.000 se puede financiar igual');
    assert.ok(esLineaEntrega(dos.textos[dos.textos.length - 1]), 'el paso 2 no insistió: ' + dos.todo);
    const { r, textos, todo } = await turno(chat, 'nos vemos el mes que viene');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13'], 'no cotizó con recargo: ' + todo);
    assert.ok(esExcepcion(textos[0], 300000), 'no arranca con la frase de excepción: ' + todo);
    assert.ok(todo.includes('Con una entrega de *$300.000*') && todo.includes('1 pago de $285.000') && todo.includes('2 pagos de $157.000'), 'la ficha no es la de 300.000 con recargo: ' + todo);
    assert.ok(!pregNotaTurno(todo), 'contestó como turno: ' + todo);
    assert.ok(!/quedo atento|entrega inicial|recargo|interes/i.test(todo), 'se despidió, insistió o dijo el recargo: ' + todo);
  });

  await check('Tono 1c: se va CON un monto nuevo → cotiza con ese monto, no se despide (prueba en vivo del 17/09)', async () => {
    const chat = nuevoChat();
    await turno(chat, `quiero el 13, tengo ${enMiles(MIN13 - 40000)}`);
    await turno(chat, 'tengo 300.000 se puede financiar igual');
    const { r, textos, todo } = await turno(chat, 'dale nos vemos el mes que viene, tengo 310.000');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13'], 'no cotizó con recargo: ' + todo);
    assert.ok(hayExcepcion(textos), 'falta la frase de excepción: ' + todo);
    assert.ok(todo.includes('Con una entrega de *$310.000*') && todo.includes('1 pago de $271.000') && todo.includes('2 pagos de $149.000'), 'no es la ficha de 310.000 con recargo: ' + todo);
    assert.ok(!/quedo atento|escribime y lo vemos/i.test(todo), 'se despidió en vez de cotizar: ' + todo);
    assert.ok(!pregNotaTurno(todo), 'contestó como turno: ' + todo);
  });

  await check('Tono 1c: rechazo CON un monto nuevo también cotiza con ese monto', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { r, todo } = await turno(chat, 'uh muy caro, tengo 310.000');
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13'], 'no cotizó con recargo: ' + todo);
    assert.ok(todo.includes('1 pago de $271.000') && todo.includes('2 pagos de $149.000'), 'no usó los 310.000: ' + todo);
  });

  await check('Tono 1b (2): la misma frase SIN insistencia sigue yendo a turno, como hoy', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 + 80000)}`); // cotiza normal: no hay insistencia
    assert.ok(!del(chat).insistenciaEntrega, 'el caso no prueba nada: quedó una insistencia');
    const { r, todo } = await turno(chat, 'nos vemos el mes que viene');
    assert.strictEqual(r.escalar, true, 'no escaló el turno');
    assert.ok(pregNotaTurno(todo), 'no preguntó por el turno: ' + todo);
    assert.ok(!todo.includes('📱'), 'cotizó: ' + todo);
  });

  await check('Tono 1b (3): "nos vemos el lunes" con insistencia sigue siendo un turno', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { r, todo } = await turno(chat, 'nos vemos el lunes');
    assert.strictEqual(r.escalar, true, 'no escaló el turno: ' + todo);
    assert.ok(pregNotaTurno(todo), 'no coordinó el turno: ' + todo);
    assert.ok(!r.bajoMinimo && !todo.includes('📱'), 'cotizó con recargo: ' + todo);
  });

  await check('Tono 1b (4): "paso el mes que viene" con insistencia → excepción y ficha', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { r, textos, todo } = await turno(chat, 'paso el mes que viene');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.deepStrictEqual(r.bajoMinimo, ['iPhone 13'], 'no cotizó con recargo: ' + todo);
    assert.ok(hayExcepcion(textos), 'falta la frase de excepción: ' + todo);
    assert.ok(todo.includes('1 pago de $314.000') && todo.includes('2 pagos de $172.000'), 'no es la ficha de 280.000 con recargo: ' + todo);
    assert.ok(!pregNotaTurno(todo), 'contestó como turno: ' + todo);
  });

  await check('"mañana paso" después de la línea no es rechazo: no cotiza con recargo', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { r, todo } = await turno(chat, 'mañana paso');
    assert.ok(!r.bajoMinimo, 'cotizó con recargo: ' + todo);
    assert.ok(!todo.includes('📱'), 'cotizó: ' + todo);
  });

  await check('6. "cuanto le tengo que agregar?": la entrega inicial, nunca la resta; cuenta como insistencia', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { r, textos, todo } = await turno(chat, 'cuanto le tengo que agregar?');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.ok(esLineaEntrega(textos[textos.length - 1]), 'no dijo la entrega inicial: ' + todo);
    // Los únicos números: su monto y la entrega inicial (Bloque Tono). Nunca la resta.
    assert.deepStrictEqual(montos(todo), [pesos(MIN13 - 40000), pesos(MIN13)].sort(), 'dijo otro número: ' + todo);
    assert.ok(!/40\.000|falta/i.test(todo), 'dijo la resta: ' + todo);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 2 });
  });

  await check('7. faltan $100.000: paso 1 → paso 2 → la alternativa; en ningún paso la diferencia', async () => {
    const chat = nuevoChat();
    const uno = await turno(chat, `el 13, tengo ${enMiles(MIN13 - 100000)}`);
    assert.ok(esLineaEntrega(uno.textos[uno.textos.length - 1]), 'paso 1 sin la línea: ' + uno.todo);
    const dos = await turno(chat, 'no tengo mas');
    assert.ok(esLineaEntrega(dos.textos[dos.textos.length - 1]), 'paso 2 sin la línea: ' + dos.todo);
    assert.ok(!dos.todo.includes('📱'), 'cotizó en el paso 2: ' + dos.todo);
    const tres = await turno(chat, 'no');
    assert.ok(!tres.r.escalar, 'escaló: ' + tres.r.motivo);
    assert.ok(!tres.r.bajoMinimo, 'cotizó el 13 con recargo con $100.000 de diferencia');
    assert.ok(/mira lo que si te podes llevar/i.test(tres.todo) && tres.todo.includes('📱') && !tres.todo.includes('📱 *iPhone 13'), 'no ofreció la alternativa: ' + tres.todo);
    assert.ok(/te lo dejo anotado, cuando llegues a los \$320\.000/i.test(tres.todo), 'no dejó la puerta abierta con el mínimo: ' + tres.todo);
    assert.ok(!/contame que estabas buscando/i.test(tres.todo), 'tomó el "no" como un mensaje que no se entiende: ' + tres.todo);
    for (const t of [uno.todo, dos.todo, tres.todo]) {
      assert.ok(!/100\.000/.test(t) && !/te falta|faltan|faltaria/i.test(t), 'dijo la diferencia: ' + t);
    }
    assert.strictEqual(del(chat).puertaAbiertaDe, 'iPhone 13');
  });

  await check('8. en el paso 2 sube al mínimo: cotización normal, sin recargo', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    await turno(chat, `tengo ${enMiles(MIN13 - 30000)}`);
    const { r, todo } = await turno(chat, `tengo ${enMiles(MIN13)}`);
    assert.ok(!r.bajoMinimo, 'marcó recargo con la entrega en el mínimo');
    assert.ok(todo.includes(`Con una entrega de *${pesos(MIN13)}*`) && todo.includes('1 pago de $221.000') && todo.includes('2 pagos de $140.000'), 'no cotizó normal (los precios manuales del mínimo): ' + todo);
  });

  await check('9. en el paso 1 sube hasta cubrir el contado: solo el precio (Ajustes 1b)', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { todo } = await turno(chat, 'tengo 500');
    assert.ok(todo.includes('$495.000') && /contado/i.test(todo), 'no dio el contado: ' + todo);
    assert.ok(!todo.includes('1 pago de') && !/cuota/i.test(todo) && !explica(todo), 'habló de financiación: ' + todo);
    assert.strictEqual(del(chat).cotizadoDeContado, true);
  });

  await check('10. cambio de modelo en el medio: el contador del nuevo arranca de cero', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13 y el 15?');
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const dos = await turno(chat, `tengo ${enMiles(MIN13 - 30000)}`);
    assert.ok(esLineaEntrega(dos.textos[dos.textos.length - 1]) && !dos.todo.includes('15'), 'después de elegir el 13, volvió a hablar del 15: ' + dos.todo);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 2 });
    const { r, textos, todo } = await turno(chat, 'el 15 entonces');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.ok(lineaDe(textos, '15', fila('15').anticipo_min), 'no arrancó de cero con el 15 (su entrega inicial): ' + todo);
    assert.ok(!/anotado|📱/.test(todo), 'fue al paso 3 con el 15: ' + todo);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 2, 'iPhone 15': 1 });
  });

  await check('11. si el envío de la línea falla, el contador no suma', async () => {
    const chat = nuevoChat();
    fallar = true;
    try {
      await bot.procesar(escrito(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`));
    } finally {
      fallar = false;
    }
    assert.ok(!del(chat).insistenciaEntrega, 'contó una línea que no le llegó: ' + JSON.stringify(del(chat).insistenciaEntrega));
    limpiar();
    await bot.procesar(escrito(chat, `tengo ${enMiles(MIN13 - 30000)}`));
    const textos = aEste(chat).map((m) => m.texto);
    assert.ok(textos.some(esLineaEntrega), 'no volvió a insistir por primera vez: ' + textos.join(' | '));
    assert.ok(!textos.some((t) => t.includes('📱')), 'cotizó como si ya hubiera insistido: ' + textos.join(' | '));
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13': 1 });
  });

  await check('12. dos modelos vistos y un monto (el 13 llega, el 15 no): cotización del 13 y solo la entrega inicial del 15', async () => {
    // Con la planilla congelada el 14 resuelve a la unidad de USADOS (mínimo $290.000,
    // menos que el 13), así que el que no llega es el 15 (mínimo $420.000).
    const chat = nuevoChat();
    await turno(chat, 'tenés el 13 y el 15?');
    const { r, textos, todo } = await turno(chat, `tengo ${enMiles(MIN13 + 30000)}`);
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.ok(textos.length <= 4, `mandó ${textos.length} mensajes`);
    assert.strictEqual(cuantas(todo, '📱'), 1, 'no cotizó solo el 13: ' + todo);
    assert.ok(todo.includes('📱 *iPhone 13'), 'no cotizó el 13: ' + todo);
    assert.ok(lineaDe(textos, '15', fila('15').anticipo_min), 'falta la entrega inicial del 15: ' + todo);
    assert.ok(!todo.includes('$740.000') && !todo.includes('70.000') && !/arranca en/.test(todo), 'dijo el contado del 15 o la diferencia: ' + todo);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 15': 1 });
    assert.ok(!r.bajoMinimo);
  });

  await check('dos vistos, los dos bajo el mínimo: el conteo avanza para cada uno; en el paso 3 cada uno va a recargo o a la línea del contado según su diferencia', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenés el 15 y el 16?');
    const uno = await turno(chat, 'tengo 380'); // 15: faltan 40.000 · 16: faltan 290.000
    // Bloque 9: las dos entregas van en un solo mensaje, con "entrega inicial" una vez (antes,
    // una línea por modelo: dos veces).
    assert.strictEqual(cuantas(uno.todo.toLowerCase(), 'entrega inicial'), 1 + (explica(uno.todo) ? 1 : 0), 'no dijo las dos entregas en un mensaje: ' + uno.todo);
    assert.ok(lineaDe(uno.textos, '15', fila('15').anticipo_min) === lineaDe(uno.textos, '16', fila('16').anticipo_min) && lineaDe(uno.textos, '16', fila('16').anticipo_min), 'las dos entregas no van en el mismo mensaje: ' + uno.todo);
    assert.ok(!uno.todo.includes('📱'), 'cotizó en el paso 1: ' + uno.todo);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 15': 1, 'iPhone 16': 1 });
    const dos = await turno(chat, 'tengo 385');
    assert.strictEqual(cuantas(dos.todo.toLowerCase(), 'entrega inicial'), 1, 'no insistió con las dos en un mensaje: ' + dos.todo);
    assert.ok(lineaDe(dos.textos, '15', fila('15').anticipo_min) === lineaDe(dos.textos, '16', fila('16').anticipo_min) && lineaDe(dos.textos, '16', fila('16').anticipo_min), 'las dos entregas no van en el mismo mensaje: ' + dos.todo);
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 15': 2, 'iPhone 16': 2 });
    const tres = await turno(chat, 'tengo 390'); // 15: faltan 30.000 → recargo · 16: faltan 280.000 → contado y mínimo
    assert.ok(tres.todo.includes('📱 *iPhone 15') && tres.r.bajoMinimo && tres.r.bajoMinimo.includes('iPhone 15'), 'el 15 no entró con recargo: ' + tres.todo);
    assert.ok(tres.todo.toLowerCase().includes('el 16 sale $1.050.000 de contado y la entrega arranca en $670.000'), 'falta la línea del 16: ' + tres.todo);
    assert.ok(!tres.todo.includes('280.000') && !/entrega inicial/i.test(tres.todo), 'dijo la diferencia o insistió otra vez: ' + tres.todo);
    assert.ok(tres.textos.length <= 4, `mandó ${tres.textos.length} mensajes`);
  });

  await check('13. "500" suelto después de la línea de la entrega: se lee como monto y cotiza', async () => {
    const chat = nuevoChat();
    await turno(chat, `el 13, tengo ${enMiles(MIN13 - 40000)}`);
    const { todo } = await turno(chat, '500');
    assert.strictEqual(del(chat).ultimaLectura.entrega, 500000);
    assert.ok(todo.includes('$495.000') && /contado/i.test(todo), 'no cotizó con 500.000: ' + todo);
  });

  await check('dos modelos nombrados con el monto: el que llega entra, del otro solo la entrega inicial (13 Pro a $40.000)', async () => {
    const chat = nuevoChat();
    const { r, textos, todo } = await turno(chat, 'me interesan el 13 y el 13 pro y tengo 380.000');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.ok(/te podes llevar el 13\b/i.test(todo) && !/llevar el 13 o el 13 Pro|llevar el 13 Pro/i.test(todo), 'no dijo que se lleva solo el 13: ' + todo);
    assert.ok(lineaDe(textos, '13 Pro', fila('13 pro').anticipo_min), 'falta la entrega inicial del 13 Pro: ' + todo);
    assert.ok(!/arranca en|40\.000|695\.000|estirarte/.test(todo), 'habló del contado, de la diferencia o de estirarse: ' + todo);
    assert.ok(!r.bajoMinimo, 'cotizó con recargo en el paso 1');
    assert.deepStrictEqual(del(chat).insistenciaEntrega, { 'iPhone 13 Pro': 1 });
  });

  await check('donde el bot elige el modelo (monto sin modelo) sigue el mínimo estricto', async () => {
    const chat = nuevoChat();
    // Con recargo entraría el 13 ($20.000 abajo), que es más caro que el 14 de USADOS:
    // tiene que elegir este último.
    const { r, todo } = await turno(chat, 'tengo 300 mil');
    assert.ok(/el mejor que te llevas es el iPhone 14/i.test(todo), 'no eligió el 14: ' + todo);
    assert.ok(todo.includes('batería 86%'), 'no es el 14 de USADOS (mínimo $290.000): ' + todo);
    assert.ok(!/iPhone 13/.test(todo), 'ofreció un modelo con recargo: ' + todo);
    assert.ok(!r.bajoMinimo);
  });

  console.log('\n2. Pedido de descuento\n');

  await check('detección: pedidos de descuento sí, "el más barato" y "algo menos" no', () => {
    for (const t of ['me hacés un descuento?', 'me lo dejás más barato?', 'no me lo dejás más barato?', 'haceme precio', 'tenes precio especial?', 'cual es el mejor precio?', 'hay rebaja?', 'un descuentito?']) {
      assert.strictEqual(local.pideDescuento(t), true, `no leyó descuento en "${t}"`);
    }
    for (const t of ['el más barato?', 'cuál es más barato?', 'algo más barato?', 'tengo algo menos de 500', 'tenes el 13?']) {
      assert.strictEqual(local.pideDescuento(t), false, `leyó descuento en "${t}"`);
    }
  });

  for (const frase of ['me lo dejás más barato?', 'no me lo dejás más barato?']) {
    await check(`"${frase}" es pedido de descuento y le gana al modelo más económico`, async () => {
      const chat = nuevoChat();
      await turno(chat, 'tenes el 13?');
      const { r, todo } = await turno(chat, frase);
      assert.ok(!r.escalar, 'escaló: ' + r.motivo);
      assert.ok(!/economico/i.test(todo), 'contestó con el modelo más económico: ' + todo);
      assert.ok(estilo.variantes('descuentoPrimero').some((v) => v.toLowerCase() === todo.toLowerCase()), 'no es la frase del primer pedido: ' + todo);
      assert.ok(!todo.includes('$'), 'el primer pedido dijo un precio: ' + todo);
      assert.strictEqual(del(chat).descuentoPedidos, 1);
    });
  }

  for (const frase of ['el más barato?', 'cuál es más barato?', 'algo más barato?']) {
    await check(`"${frase}" sigue yendo al modelo más económico`, async () => {
      const chat = nuevoChat();
      await turno(chat, 'tenes el 13?');
      const { todo } = await turno(chat, frase);
      assert.ok(/el mas economico que tenemos es el/i.test(todo), 'no fue al más económico: ' + todo);
      assert.ok(!del(chat).descuentoPedidos, 'lo contó como pedido de descuento');
    });
  }

  // Sin descuento (decisión de Tomás del 30/09/2026): ya no va el contado − $10.000 del
  // segundo pedido. Cada pedido recibe "el precio es ese", sin números y sin escalar.
  await check('descuento (30/09): el 1º, el 2º y el 3º, la frase sin números y sin escalar', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    let i = 0;
    for (const frase of ['me hacés un descuento?', 'dale, me haces un descuento?', 'un descuentito mas?']) {
      i++;
      const { r, todo } = await turno(chat, frase);
      assert.ok(!r.escalar, `escaló el pedido ${i}: ` + r.motivo);
      assert.ok(!todo.includes('$'), `el pedido ${i} dijo un precio: ` + todo);
      assert.ok(estilo.variantes('descuentoPrimero').some((v) => v.toLowerCase() === todo.toLowerCase()), `el pedido ${i} no es "el precio es ese": ` + todo);
      assert.strictEqual(del(chat).descuentoPedidos, i);
      assert.ok(!del(chat).descuentoDe, `el pedido ${i} marcó un descuento`);
    }
    // En cuotas no cambia nada: salen de la planilla.
    const cot = cotizar(fila('13'), 400000, PLANILLA.config);
    const cuotas = await turno(chat, 'tengo 400');
    assert.ok(cuotas.todo.includes(`1 pago de ${pesos(cot.pagoUnico)}`) && cuotas.todo.includes(`2 pagos de ${pesos(cot.cuotaDe2)}`), 'las cuotas cambiaron: ' + cuotas.todo);
  });

  await check('una marca de descuento de antes del 30/09 no cambia nada: el contado de la planilla', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    state.actualizar(chat, { descuentoPedidos: 2, descuentoDe: { modelo: 'iPhone 13', precio: 485000 } });
    const cuanto = await turno(chat, 'y en que valor esta?');
    assert.ok(!cuanto.todo.includes('$485.000'), 'usó el precio con descuento: ' + cuanto.todo);
    const { todo } = await turno(chat, 'tengo 490');
    assert.ok(!todo.includes('$485.000'), 'cotizó con el descuento viejo: ' + todo);
    assert.ok(todo.includes('1 pago de'), 'con $490.000 no paga el 13 de contado: ' + todo);
    const otra = await turno(chat, 'me haces un descuento?');
    assert.ok(!otra.todo.includes('$'), 'dio un precio: ' + otra.todo);
  });

  await check('descuento sin modelo en la charla: escala callado', async () => {
    const chat = nuevoChat();
    const { r } = await turno(chat, 'me hacés un descuento?');
    assert.strictEqual(r.escalar, true, 'no escaló');
    assert.deepStrictEqual(r.mensajes, [], 'le dijo algo al cliente');
    assert.notStrictEqual(r.callar, false, 'no calla el chat');
  });

  await check('descuento con dos modelos mostrados y ninguno elegido: escala callado', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13 y el 14?');
    const { r } = await turno(chat, 'me hacés un descuento?');
    assert.strictEqual(r.escalar, true, 'no escaló');
    assert.deepStrictEqual(r.mensajes, []);
  });

  console.log('\n3. Corrección de monto\n');

  await check('con palabras de corrección gana el último monto; sin ellas, el primero', () => {
    const casos = [
      ['tengo 400 y me estiro a 550', 400000],
      ['tengo 400\nperdón, 500', 500000],
      ['perdón, 500', 500000],
      ['me equivoqué, son 500', 500000],
      ['en realidad tengo 450', 450000],
      ['tengo 400, no, son 480', 480000],
      ['corrijo: 520', 520000],
      ['mejor 450 mil', 450000],
      // Sin plata después de la palabra: nada, como antes.
      ['perdón, cuánto sale el 13?', null],
      ['perdón la demora', null],
      // Agregado defensivo: la capacidad suelta tampoco es plata después de "mejor".
      ['mejor el 128', null],
    ];
    for (const [texto, esperado] of casos) {
      assert.strictEqual(local.extraerMonto(texto), esperado, `"${texto}"`);
    }
  });

  await check('un mensaje con monto no va a la disculpa', () => {
    assert.strictEqual(local.entender('perdón, 500').intencion, 'declara_entrega');
    assert.strictEqual(local.entender('perdón la demora').intencion, 'se_disculpa');
  });

  await check('"tengo 450" y "perdón, 500": cotización nueva del mismo modelo, sin repetir la explicación', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 15?');
    // 450 llega al mínimo del 15 ($420.000). Hasta el bloque 5b era 400, que ahora
    // no cotiza: primero insiste con la entrega.
    const antes = await turno(chat, 'tengo 450');
    assert.ok(antes.todo.includes('📱') && explica(antes.todo), 'el caso no prueba nada: la primera cotización no explicó: ' + antes.todo);
    const { r, todo } = await turno(chat, 'perdón, 500');
    assert.ok(!/no te hagas drama/i.test(todo), 'contestó la disculpa: ' + todo);
    assert.ok(todo.includes('📱 *iPhone 15') && todo.includes('Con una entrega de *$500.000*'), 'no recotizó el 15 con 500.000: ' + todo);
    assert.ok(!explica(todo), 'repitió la explicación: ' + todo);
    assert.strictEqual(del(chat).entrega, 500000);
    assert.ok(!r.bajoMinimo);
  });

  await check('una corrección que cubre el contado: solo el precio (Ajustes 1b)', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    await turno(chat, 'tengo 400');
    const { todo } = await turno(chat, 'perdón, 500');
    assert.ok(todo.includes('$495.000') && /contado/i.test(todo), 'no dio el contado: ' + todo);
    assert.ok(!todo.includes('1 pago de') && !/cuota/i.test(todo) && !explica(todo), 'habló de financiación: ' + todo);
  });

  await check('corrección lea lo que lea Gemini: si leyó el primer monto, vale el último', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    const deVerdad = gemini.entender;
    gemini.entender = async (h, m) => ({ ...local.entender(m), entrega: 400000 });
    try {
      await turno(chat, 'tengo 400\nperdón, 500');
    } finally {
      gemini.entender = deVerdad;
    }
    assert.strictEqual(del(chat).entrega, 500000);
  });

  await check('"500" suelto después de una cotización: recotiza', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 15?');
    await turno(chat, 'tengo 450');
    const { todo } = await turno(chat, '500');
    assert.strictEqual(del(chat).ultimaLectura.entrega, 500000);
    assert.ok(todo.includes('Con una entrega de *$500.000*'), 'no recotizó: ' + todo);
  });

  await check('"256" suelto después de una cotización: no es plata', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 15?');
    await turno(chat, 'tengo 450');
    const { todo } = await turno(chat, '256');
    assert.strictEqual(del(chat).ultimaLectura.entrega, null);
    assert.strictEqual(del(chat).entrega, 450000);
    assert.ok(!todo.includes('256.000'), 'cotizó con 256.000: ' + todo);
  });

  await check('"500" suelto sin cotización ni pregunta por la entrega: no se lee', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenes el 13?');
    await turno(chat, '500');
    assert.strictEqual(del(chat).ultimaLectura.entrega, null);
    assert.ok(!del(chat).entrega, 'guardó una entrega');
  });

  await check('número suelto fuera de rango después de una cotización: no se lee', async () => {
    for (const texto of ['50', '3500', '90']) {
      const chat = nuevoChat();
      await turno(chat, 'tenes el 15?');
      await turno(chat, 'tengo 450');
      await turno(chat, texto);
      assert.strictEqual(del(chat).ultimaLectura.entrega, null, `leyó "${texto}"`);
    }
  });

  await check('"500" suelto después de preguntarle con cuánto cuenta (cada pregunta): se lee', async () => {
    const preguntas = [
      ...estilo.variantes('pedirEntrega'),
      'hasta cuanto podrias estirarte?', // ya no se dice (bloque 5b); queda por los historiales guardados
      'decime con cuanto contas para la entrega asi te paso bien los numeros',
      // La línea de la entrega inicial (bloque 5b), en sus tres variantes, con y sin el
      // monto del cliente (Bloque Tono).
      ...estilo.variantes('entregaInicial', '13', '$320.000', '$280.000'),
      ...estilo.variantes('entregaInicial', '13', '$320.000', null),
      // La de varios modelos en un mensaje (bloque 9).
      ...estilo.variantes('entregaInicialVarios', [['13', '$320.000'], ['14 Pro', '$480.000']], '$280.000'),
    ];
    for (const pregunta of preguntas) {
      const chat = nuevoChat();
      await turno(chat, 'tenes el 13?');
      state.agregarAlHistorial(chat, 'vendedor', pregunta.charAt(0).toUpperCase() + pregunta.slice(1));
      await turno(chat, '500');
      assert.strictEqual(del(chat).ultimaLectura.entrega, 500000, `después de "${pregunta}"`);
    }
  });

  console.log('\n4. Dos o más modelos mostrados y un monto\n');

  await check('el 13 y el 14 + "tengo 400": dos cotizaciones dentro del tope de 4; "perdón, 500" recotiza las dos', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenés el 13 y el 14?');
    const { r, textos, todo } = await turno(chat, 'tengo 400');
    assert.ok(!r.escalar, 'escaló: ' + r.motivo);
    assert.ok(textos.length <= 4, `mandó ${textos.length} mensajes`);
    assert.strictEqual(cuantas(todo, '📱'), 2, 'no son dos cotizaciones: ' + todo);
    assert.ok(todo.includes('📱 *iPhone 13') && todo.includes('📱 *iPhone 14'), 'faltan modelos: ' + todo);

    const otra = await turno(chat, 'perdón, 500');
    assert.strictEqual(cuantas(otra.todo, '📱'), 2, 'no recotizó los dos: ' + otra.todo);
    assert.ok(otra.todo.includes('$495.000') && otra.todo.includes('$430.000'), 'no son de contado: ' + otra.todo);
    assert.ok(!/cuota/i.test(otra.todo) && !explica(otra.todo), 'habló de cuotas: ' + otra.todo);
  });

  await check('tres modelos y paga de contado: tres cotizaciones, sin la palabra "cuota"', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenés el 13, el 14 y el 15?');
    const { textos, todo } = await turno(chat, 'tengo 800.000');
    assert.ok(textos.length <= 4, `mandó ${textos.length} mensajes`);
    assert.strictEqual(cuantas(todo, '📱'), 3, 'no son tres cotizaciones: ' + todo);
    assert.ok(!/cuota/i.test(todo), 'dijo "cuota": ' + todo);
  });

  await check('más de 3 modelos mostrados: se cotizan los últimos 3', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenés el 12, el 13, el 14 y el 15?');
    assert.strictEqual((del(chat).preciosMostradosDe || []).length, 4, 'el caso no prueba nada: no se mostraron 4');
    const { todo } = await turno(chat, 'tengo 800.000');
    assert.strictEqual(cuantas(todo, '📱'), 3, 'no son tres cotizaciones: ' + todo);
    assert.ok(!todo.includes('iPhone 12'), 'cotizó el primero: ' + todo);
  });

  await check('si no entran en 4 mensajes, las cotizaciones van juntas en uno', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenés el 13, el 14 y el 15?');
    const { textos } = await turno(chat, 'tengo 450');
    assert.ok(textos.length <= 4, `mandó ${textos.length} mensajes`);
    assert.ok(textos.some((t) => cuantas(t, '📱') === 3), 'no las juntó: ' + textos.join(' | '));
  });

  await check('el que no llega al mínimo, la primera vez: solo su entrega inicial, sin el contado ni la diferencia (bloque 5b)', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenés el 13 y el 16?');
    const { todo } = await turno(chat, 'tengo 400');
    assert.strictEqual(cuantas(todo, '📱'), 1, 'no cotizó solo el 13: ' + todo);
    assert.ok(/entrega inicial/i.test(todo) && todo.includes('$670.000'), 'falta la entrega inicial del 16: ' + todo);
    assert.ok(!todo.includes('$1.050.000') && !todo.includes('270.000') && !/arranca en/.test(todo), 'dijo el contado del 16 o la diferencia: ' + todo);
  });

  await check('si eligió uno de los dos, el monto cotiza solo ese', async () => {
    const chat = nuevoChat();
    await turno(chat, 'tenés el 13 y el 14?');
    await turno(chat, 'dale, el 14');
    const { todo } = await turno(chat, 'tengo 400');
    assert.ok(!todo.includes('📱 *iPhone 13'), 'cotizó el 13 que no eligió: ' + todo);
    assert.ok(todo.includes('iPhone 14'), 'no cotizó el 14: ' + todo);
  });

  console.log('\n5. Canje\n');

  await check('canje: pide los datos sin prometer; cuando los manda, escala callado y avisa al grupo', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'te puedo dar mi 11 como parte de pago?'));
    const primero = aEste(chat).map((m) => m.texto).join(' | ');
    assert.ok(/a partir del 11/i.test(primero) && /pasame/i.test(primero), 'no pidió los datos: ' + primero);
    assert.ok(!/cotiz|te aviso|te confirmo/i.test(primero), 'prometió algo: ' + primero);
    assert.ok(!del(chat).escalado, 'escaló antes de pedir los datos');
    assert.strictEqual(del(chat).permutaDatosPedidos, true, 'no quedó marcado el pedido');

    limpiar();
    await bot.procesar(escrito(chat, '128gb, bateria 90%'));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al mandar los datos');
    const aviso = alGrupo.find((t) => t.includes('wa.me/' + numero(chat)));
    assert.ok(aviso && /canje/i.test(aviso), 'el aviso al grupo no dice que ofrece un canje: ' + alGrupo.join(' || '));
    assert.strictEqual(del(chat).escalado, true, 'no escaló');
    assert.strictEqual(control.callado(del(chat)), true, 'el chat no quedó callado');
  });

  for (const frase of ['tomás usados?', 'te dejo mi celular y pongo la diferencia']) {
    await check(`"${frase}" se lee como canje`, async () => {
      const chat = nuevoChat();
      const { r, todo } = await turno(chat, frase);
      assert.ok(!r.escalar, 'escaló: ' + r.motivo);
      assert.ok(/a partir del 11/i.test(todo) && /pasame/i.test(todo), 'no pidió los datos del canje: ' + todo);
    });
  }

  await check('canje: si insiste sin mandar datos, no escala y no promete', async () => {
    const chat = nuevoChat();
    await turno(chat, 'hago plan canje con mi 13 128gb 86%');
    const { r, todo } = await turno(chat, 'cuanto me queda de diferencia?');
    assert.ok(!r.escalar, 'escaló sin datos nuevos: ' + r.motivo);
    assert.ok(/no te puedo pasar el numero exacto/i.test(todo), 'cambió la respuesta: ' + todo);
    assert.ok(!/cotizamos|apenas/i.test(todo), 'prometió: ' + todo);
  });

  await check('canje: lo que ya mandó no se borra con un mensaje que no trae datos (agregado defensivo)', async () => {
    const chat = nuevoChat();
    await turno(chat, 'hago plan canje con mi 13 128gb 86%');
    await turno(chat, 'plan canje, como seguimos?');
    const p = del(chat).permuta || {};
    assert.deepStrictEqual([p.modelo, p.capacidad_gb, p.bateria], ['13', 128, 86], 'se borraron datos: ' + JSON.stringify(p));
  });

  console.log('\n6. Marcas del descuento\n');

  await check('si el envío falla, el conteo queda sin confirmar', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: no contestó');

    fallar = true;
    try {
      await bot.procesar(escrito(chat, 'me hacés un descuento?'));
    } finally {
      fallar = false;
    }
    assert.ok(!del(chat).descuentoPedidos, 'contó un pedido que no le llegó');

    limpiar();
    await bot.procesar(escrito(chat, 'me hacés un descuento?'));
    assert.ok(!aEste(chat).map((m) => m.texto).join(' ').includes('$'), 'lo tomó como segundo pedido');
    assert.strictEqual(del(chat).descuentoPedidos, 1);

    fallar = true;
    try {
      await bot.procesar(escrito(chat, 'dale, me hacés un descuento?'));
    } finally {
      fallar = false;
    }
    assert.strictEqual(del(chat).descuentoPedidos, 1, 'contó un pedido que no le llegó');

    limpiar();
    await bot.procesar(escrito(chat, 'un descuentito?'));
    assert.ok(!aEste(chat).map((m) => m.texto).join(' ').includes('$'), 'dio un precio: ' + aEste(chat).map((m) => m.texto).join(' | '));
    assert.strictEqual(del(chat).descuentoPedidos, 2);
    assert.ok(!del(chat).descuentoDe, 'marcó un descuento');
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
