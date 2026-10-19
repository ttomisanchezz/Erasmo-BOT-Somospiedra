'use strict';
/**
 * La cotización no muestra el precio de contado (Ajustes 1, decisión de Tomás
 * del 16/09/2026).
 *
 *   node test/precio.test.js
 *
 * El mensaje de la cotización deja de decir "Contado: $X": quedan el equipo, la
 * entrega y los dos pagos. El precio se dice solo si el cliente lo pregunta, y
 * va dentro del mensaje de "te lo llevas". Si pregunta por las cuotas y no por
 * el precio, el precio no aparece. Cuando la entrega alcanza para pagarlo
 * entero (`soloContado`) sí va el precio, con un texto humano y sin cuotas.
 *
 * Sin red, extractor local, números inventados. El entorno se fija acá y no se
 * hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000032@g.us';
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
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-precio-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-precio-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
const FIXTURE = require('./fixture-planilla');
sheets.usarFixture(FIXTURE);
sheets.registrarLead = async () => {};

const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

let idN = 0;
const aClientes = [];
async function envio(numero, tipo, texto) {
  const registro = { numero, tipo, texto, id: 'BOT' + ++idN };
  aClientes.push(registro);
  return { key: { remoteJid: numero, fromMe: true, id: registro.id } };
}
evolution.enviarTexto = (numero, texto) => envio(numero, 'texto', texto);
evolution.enviarImagen = (numero) => envio(numero, 'imagen', '');
evolution.enviarDocumento = (numero, ruta, pie) => envio(numero, 'documento', pie);
evolution.avisarGrupo = async () => ({});
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const estilo = require('../src/estilo');
const acciones = require('../src/acciones');
const responder = require('../src/responder');
const { cotizar, plantilla, plantillaVarias, pesos } = require('../src/cotizador');

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

async function turno(chat, texto) {
  state.agregarAlHistorial(chat, 'cliente', texto);
  const r = await responder.decidir(chat, texto, 'Lucia');
  for (const m of r.mensajes || []) {
    state.agregarAlHistorial(chat, 'vendedor', acciones.paraHistorial(m));
    state.confirmarMarcas(chat, acciones.marcasDe(m));
  }
  return (r.mensajes || []).map((m) => (typeof m === 'string' ? m : acciones.comoTexto(m)));
}

async function mandarTanda(chat, lineas) {
  const primero = bot.procesar(escrito(chat, lineas[0]));
  for (const l of lineas.slice(1)) {
    await dormir(5);
    await bot.procesar(escrito(chat, l));
  }
  await primero;
}

const fila = (modelo) => FIXTURE.lista.find((f) => f.modelo === modelo);
const unidad = (id) => FIXTURE.usados.find((f) => f.id === id);
const esCotizacion = (t) => /^📱/.test(t) && /1 pago de/.test(t) && /2 pagos de/.test(t);
const esRetira = (t) => /te lo llevas|lo podes retirar|lo sacas tranquilo|es tuyo/i.test(t);
const vista = (msgs) => msgs.map((t) => t.split('\n')[0].slice(0, 70)).join(' | ');
const PRECIO_14PRO = '$800.000';

(async () => {
  console.log('\nLas plantillas\n');

  await check('1. cotización con cuotas: sin "Contado" ni el precio, con el equipo, la entrega y los dos pagos', () => {
    const f = fila('iPhone 14 Pro');
    const cot = cotizar(f, 600000, FIXTURE.config);
    assert.ok(cot.ok && !cot.soloContado, 'el caso no prueba nada: no cotiza con cuotas');
    assert.strictEqual(cot.contado, 800000, 'cot.contado tiene que seguir existiendo en el objeto');
    const t = plantilla(f, cot);
    assert.ok(!/contado/i.test(t), 'muestra el contado: ' + t);
    assert.ok(!t.includes(PRECIO_14PRO), 'muestra el precio: ' + t);
    assert.ok(t.startsWith('📱 *iPhone 14 Pro 128GB — batería 100%*'), 'falta el encabezado con capacidad y batería: ' + t);
    assert.ok(t.includes('Con una entrega de *$600.000*:'), 'falta la entrega: ' + t);
    assert.ok(t.includes(`• *1 pago de ${pesos(cot.pagoUnico)}*`), 'falta el pago único: ' + t);
    assert.ok(t.includes(`• *2 pagos de ${pesos(cot.cuotaDe2)} cada uno*`), 'faltan los dos pagos: ' + t);
  });

  await check('2. plantillaVarias con cuotas: ningún bloque muestra el contado ni los precios, y quedan el detalle y los pagos', () => {
    const opciones = [unidad('U-002'), fila('iPhone 14')].map((f) => ({ fila: f, cot: cotizar(f, 400000, FIXTURE.config) }));
    assert.ok(opciones.every((o) => o.cot.ok && !o.cot.soloContado), 'el caso no prueba nada: alguna no cotiza con cuotas');
    const t = plantillaVarias(opciones, 2);
    assert.ok(!/contado/i.test(t), 'algún bloque muestra el contado: ' + t);
    assert.ok(!t.includes('$430.000') && !t.includes('$540.000'), 'muestra los precios: ' + t);
    assert.ok(t.includes('128gb, bateria 86%, gris, sin face id'), 'falta el detalle de la unidad: ' + t);
    assert.ok(t.includes('128gb, bateria 80%'), 'falta el detalle de la fila de catálogo: ' + t);
    assert.strictEqual((t.match(/1 pago de/g) || []).length, 2, 'faltan pagos: ' + t);
    assert.strictEqual((t.match(/2 pagos de/g) || []).length, 2, 'faltan pagos: ' + t);
  });

  await check('3. soloContado: el precio con una de las variantes, sin cuotas y con el encabezado', () => {
    const f = fila('iPhone 14 Pro');
    const cot = cotizar(f, 900000, FIXTURE.config);
    assert.ok(cot.soloContado, 'el caso no prueba nada: no es soloContado');
    const t = plantilla(f, cot);
    const [cabecera, ...resto] = t.split('\n');
    assert.strictEqual(cabecera, '📱 *iPhone 14 Pro 128GB — batería 100%*', 'falta el encabezado: ' + t);
    const linea = resto.join('\n');
    const variantes = estilo.variantes('pagaDeContado', 'iPhone 14 Pro', `*${PRECIO_14PRO}*`);
    assert.ok(variantes.length >= 2 && variantes.length <= 3, `tiene ${variantes.length} variantes, tenían que ser 2 o 3`);
    assert.ok(variantes.some((v) => v.toLowerCase() === linea.toLowerCase()), 'no es una de las variantes: ' + linea);
    assert.ok(!/contado:/i.test(t), 'sigue diciendo "Contado:": ' + t);
    assert.ok(!/cuota|1 pago|2 pagos/i.test(t), 'habla de cuotas: ' + t);
    for (const v of variantes) {
      assert.ok(v.includes('iPhone 14 Pro') && v.includes(`*${PRECIO_14PRO}*`), 'la variante no nombra el modelo y el precio: ' + v);
      assert.ok(/de contado/.test(v), 'la variante no dice que es de contado: ' + v);
      assert.ok(!/cuota/.test(v), 'la variante habla de cuotas: ' + v);
    }
  });

  await check('3. soloContado dentro de plantillaVarias: ese bloque lleva el precio con una variante; el de cuotas, no', () => {
    const opciones = [unidad('U-002'), fila('iPhone 14')].map((f) => ({ fila: f, cot: cotizar(f, 500000, FIXTURE.config) }));
    assert.ok(opciones[0].cot.soloContado && !opciones[1].cot.soloContado, 'el caso no prueba nada');
    const t = plantillaVarias(opciones, 2);
    const [bloque1, bloque2] = t.split('\n\n').slice(1);
    const variantes = estilo.variantes('pagaDeContado', 'iPhone 14', '*$430.000*').map((v) => v.toLowerCase());
    assert.ok(variantes.some((v) => bloque1.toLowerCase().includes(v)), 'el bloque de contado no usa una variante: ' + bloque1);
    assert.ok(!/1 pago|2 pagos/.test(bloque1), 'el bloque de contado habla de pagos: ' + bloque1);
    assert.ok(!/contado/i.test(bloque2) && !bloque2.includes('$540.000'), 'el bloque con cuotas muestra el precio: ' + bloque2);
    assert.ok(/1 pago de/.test(bloque2) && /2 pagos de/.test(bloque2), 'el bloque con cuotas no tiene los pagos: ' + bloque2);
  });

  console.log('\nLa tanda\n');

  await check('4. la tanda de la captura: 4 mensajes y en ninguno aparece el precio', async () => {
    const chat = nuevoChat();
    aClientes.length = 0;
    await mandarTanda(chat, ['sii te comento me interesa el 14 pro pero cuento con 600.000', 'vi que hacian financiamiento', 'como es eso']);
    const salieron = aEste(chat).map((m) => m.texto);
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length}: ${vista(salieron)}`);
    assert.ok(esCotizacion(salieron[3]), 'el 4 no es la cotización: ' + vista(salieron));
    for (const t of salieron) {
      assert.ok(!t.includes(PRECIO_14PRO), 'apareció el precio: ' + t);
      assert.ok(!/contado:/i.test(t), 'apareció "Contado:": ' + t);
    }
  });

  await check('5. "cuanto sale el 14 pro y como son las cuotas? tengo 600.000": el precio va en "te lo llevas", no en la cotización, y son 4', async () => {
    const chat = nuevoChat();
    aClientes.length = 0;
    await mandarTanda(chat, ['cuanto sale el 14 pro y como son las cuotas? tengo 600.000']);
    const salieron = aEste(chat).map((m) => m.texto);
    assert.strictEqual(salieron.length, 4, `salieron ${salieron.length}: ${vista(salieron)}`);
    const [, , retira, cotiza] = salieron;
    assert.ok(esRetira(retira), 'el 3 no es "te lo llevas": ' + vista(salieron));
    assert.ok(retira.includes(PRECIO_14PRO) && retira.includes('$600.000') && retira.includes('iPhone 14 Pro'), 'el 3 no tiene el precio, el monto y el modelo: ' + retira);
    assert.ok(esCotizacion(cotiza), 'el 4 no es la cotización: ' + vista(salieron));
    assert.ok(!cotiza.includes(PRECIO_14PRO) && !/contado/i.test(cotiza), 'la cotización tiene el precio: ' + cotiza);
    assert.strictEqual(salieron.filter((t) => t.includes(PRECIO_14PRO)).length, 1, 'el precio salió más de una vez: ' + vista(salieron));
  });

  await check('5. con el 14 Pro ya mostrado, "cuanto sale y como son las cuotas? tengo 600.000" dice el precio igual', async () => {
    const chat = nuevoChat();
    const antes = await turno(chat, 'tenes el 14 pro?');
    assert.ok(antes.some((t) => t.includes(PRECIO_14PRO)), 'el caso no prueba nada: no le mostró el precio antes');
    assert.deepStrictEqual(state.obtener(chat).preciosMostradosDe, ['iPhone 14 Pro']);
    const msgs = await turno(chat, 'cuanto sale y como son las cuotas? tengo 600.000');
    assert.strictEqual(msgs.length, 4, 'tenían que ser 4: ' + vista(msgs));
    assert.ok(esRetira(msgs[2]) && msgs[2].includes(PRECIO_14PRO), 'el 3 no dice el precio: ' + vista(msgs));
    assert.ok(esCotizacion(msgs[3]) && !msgs[3].includes(PRECIO_14PRO), 'la cotización no es la de siempre: ' + msgs[3]);
  });

  await check('5. primer iPhone y pregunta el precio: la frase fundida lleva el precio, el monto y el modelo', async () => {
    const chat = nuevoChat();
    const msgs = await turno(chat, 'es mi primer iphone, cuanto sale el 14 pro? tengo 600.000');
    assert.strictEqual(msgs.length, 4, 'tenían que ser 4: ' + vista(msgs));
    assert.ok(/lugar indicado|primer iphone/i.test(msgs[2]), 'el 3 no reconoce el primer iPhone: ' + msgs[2]);
    assert.ok(msgs[2].includes(PRECIO_14PRO) && msgs[2].includes('$600.000'), 'el 3 no tiene el precio y el monto: ' + msgs[2]);
    assert.ok(esCotizacion(msgs[3]) && !msgs[3].includes(PRECIO_14PRO), 'la cotización no es la de siempre: ' + msgs[3]);
    assert.strictEqual(state.obtener(chat).primerIphoneDicho, true, 'no quedó marcado primerIphoneDicho');
  });

  await check('5. las variantes con precio: cada una dice que se lo lleva y nombra el modelo, el precio y el monto', () => {
    for (const clave of ['puedeRetirarConPrecio', 'primerIphoneRetiraConPrecio']) {
      const variantes = estilo.variantes(clave, 'iPhone 14 Pro', '$600.000', PRECIO_14PRO);
      assert.ok(variantes.length >= 2 && variantes.length <= 3, `${clave} tiene ${variantes.length} variantes`);
      for (const v of variantes) {
        assert.ok(esRetira(v), `${clave}: no dice que se lo lleva: ${v}`);
        assert.ok(v.includes('iPhone 14 Pro') && v.includes('$600.000') && v.includes(PRECIO_14PRO), `${clave}: le falta algo: ${v}`);
        assert.ok(v.length <= 180, `${clave}: demasiado larga: ${v}`);
      }
      if (clave === 'primerIphoneRetiraConPrecio') {
        assert.ok(variantes.every((v) => /lugar indicado|primer iphone/.test(v)), 'alguna no reconoce el primer iPhone');
      }
    }
  });

  await check('5. sin preguntar el precio, "te lo llevas" sale como siempre', async () => {
    const chat = nuevoChat();
    const msgs = await turno(chat, 'me interesa el 14 pro, tengo 600.000, como son las cuotas?');
    assert.ok(!msgs.some((t) => t.includes(PRECIO_14PRO)), 'apareció el precio: ' + vista(msgs));
  });

  console.log('\nQué cuenta como "pregunta el precio"\n');

  await check('6. falsos positivos: preguntas por las cuotas o la entrega no son preguntas por el precio', () => {
    for (const t of [
      'cuanto quedan las cuotas?',
      'cuanto es la entrega?',
      'cuanto me sale en cuotas?',
      'cuanto sale cada cuota?',
      'y cuanto me sale la cuota?',
      'que precio tiene la cuota?',
      'cuanto esta la entrega minima?',
      'cuanto me queda de diferencia?',
      'como son las cuotas',
      'cuanto sale financiado?',
      'me interesa el 14 pro',
    ]) {
      assert.strictEqual(responder.preguntaPrecio(t), false, 'lo tomó como pregunta de precio: ' + t);
    }
  });

  await check('6. preguntas por el precio del equipo', () => {
    for (const t of [
      'cuanto sale?',
      'cuánto sale el 14 pro y como son las cuotas?',
      'cuanto esta el 14 pro',
      'en cuanto estan?',
      'cuanto cuesta el 15?',
      'cuanto vale?',
      'que precio tiene?',
      'precio?',
      'me pasas el precio del 14 pro',
      'que valor tiene el 15',
      'cuanto sale de contado?',
    ]) {
      assert.strictEqual(responder.preguntaPrecio(t), true, 'no lo tomó como pregunta de precio: ' + t);
    }
  });

  await check('6. con monto y modelo, "cuanto quedan las cuotas?" y "cuanto es la entrega?" no dicen el precio', async () => {
    for (const texto of ['me interesa el 14 pro, tengo 600.000, cuanto quedan las cuotas?', 'me interesa el 14 pro, tengo 600.000, cuanto es la entrega?']) {
      const chat = nuevoChat();
      const msgs = await turno(chat, texto);
      assert.ok(msgs.some(esCotizacion), 'el caso no prueba nada: no cotizó: ' + vista(msgs));
      assert.ok(!msgs.some((t) => t.includes(PRECIO_14PRO)), `"${texto}" dijo el precio: ` + vista(msgs));
    }
  });

  console.log('\nLos otros lugares que cotizan\n');

  await check('ya cotizado: si pregunta el precio se lo dice; si repite el monto, no', async () => {
    const chat = nuevoChat();
    await turno(chat, 'me interesa el 14 pro, tengo 600 mil');
    assert.strictEqual(state.obtener(chat).cotizadoDe, 'iPhone 14 Pro', 'el caso no prueba nada: no cotizó');
    const repite = await turno(chat, 'tengo 600 mil');
    assert.ok(!repite.some((t) => t.includes(PRECIO_14PRO)), 'dijo el precio sin que lo pregunte: ' + vista(repite));
    const pregunta = await turno(chat, 'cuanto sale el 14 pro?');
    assert.ok(pregunta.some((t) => t.includes(PRECIO_14PRO) && /14 Pro/.test(t)), 'no dijo el precio: ' + vista(pregunta));
    assert.ok(pregunta.length <= 4, 'más de 4 mensajes: ' + vista(pregunta));
  });

  await check('monto sin modelo ("el mejor que te llevas"): el precio va con el modelo solo si lo pregunta', async () => {
    const sinPreguntar = await turno(nuevoChat(), 'tengo 600 mil');
    const cot = sinPreguntar.find(esCotizacion);
    assert.ok(cot, 'el caso no prueba nada: no cotizó: ' + vista(sinPreguntar));
    const modelo = cot.match(/^📱 \*(iPhone [^*]+?) \d+GB/)[1];
    const precio = pesos(fila(modelo).precio_contado);
    assert.ok(!sinPreguntar.some((t) => t.includes(precio)), 'dijo el precio sin que lo pregunte: ' + vista(sinPreguntar));

    const preguntando = await turno(nuevoChat(), 'cuanto sale y como son las cuotas? tengo 600.000');
    // Bloque 9: en un chat nuevo va primero el saludo del día; la frase es la que sigue.
    assert.ok(/^(hola|buenass|luciaa)\b/i.test(preguntando[0]), 'no arrancó con el saludo: ' + vista(preguntando));
    assert.ok(preguntando[1].includes(modelo) && preguntando[1].includes(precio), 'el 2 no dice el modelo con su precio: ' + vista(preguntando));
    const cotiza = preguntando.find(esCotizacion);
    assert.ok(cotiza && !cotiza.includes(precio), 'la cotización tiene el precio: ' + vista(preguntando));
  });

  await check('recomendación con monto: el precio va con el modelo solo si lo pregunta', async () => {
    const sinPreguntar = await turno(nuevoChat(), 'tengo 600 mil, cual me conviene?');
    assert.ok(sinPreguntar.some(esCotizacion), 'el caso no prueba nada: no cotizó: ' + vista(sinPreguntar));
    assert.ok(!sinPreguntar.some((t) => /\$\d{3}\.\d{3}/.test(t) && !t.includes('$600.000') && !/^📱/.test(t)), 'dijo un precio sin que lo pregunte: ' + vista(sinPreguntar));
    const preguntando = await turno(nuevoChat(), 'tengo 600 mil, cual me conviene y cuanto sale?');
    // Bloque 9: en un chat nuevo va primero el saludo del día; la frase es la que sigue.
    assert.ok(/^(hola|buenass|luciaa)\b/i.test(preguntando[0]), 'no arrancó con el saludo: ' + vista(preguntando));
    assert.ok(/te conviene/.test(preguntando[1]) && /\$\d{3}\.\d{3}/.test(preguntando[1]), 'el 2 no dice el precio: ' + vista(preguntando));
  });

  await check('una cotización con el formato nuevo cuenta como "ya cotizamos" (se disculpa sin nada guardado)', async () => {
    const chat = nuevoChat();
    const f = fila('iPhone 13');
    state.agregarAlHistorial(chat, 'vendedor', plantilla(f, cotizar(f, 400000, FIXTURE.config)));
    const msgs = await turno(chat, 'perdon');
    assert.ok(msgs.some((t) => /quedamos en contacto/i.test(t)), 'no la reconoció como cotizada: ' + vista(msgs));
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
