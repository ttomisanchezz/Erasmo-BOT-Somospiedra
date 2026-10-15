'use strict';
/**
 * La entrega cuando Gemini no la lee.
 *
 *   node test/entrega.test.js
 *
 * Gemini se pierde cuando el mensaje mezcla un monto con un modelo: "perfecto
 * tengo 520 y quiero el 14 pro" volvía sin entrega, y el bot seguía cotizando
 * con el monto que el cliente había dicho antes. Ahora, si Gemini no lee la
 * entrega, se prueba el extractor local sobre el mensaje actual.
 *
 * `npm run evaluar -- --offline` no puede probar esto: ahí Gemini está apagado
 * y el respaldo nunca se dispara. Acá se simula la respuesta de Gemini con un
 * fetch de mentira; no sale nada a la red.
 *
 * El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.GEMINI_MODEL = 'gemini-de-prueba';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-entrega-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-entrega-' + process.pid + '.jsonl');

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

// Lo que "contesta Gemini" en cada prueba. Al pedido de entender (el que lleva
// esquema) se le devuelve esto; al de redactar, un texto cualquiera.
let respuestaGemini = null;
const pedidos = [];
globalThis.fetch = async (url, opciones) => {
  const body = JSON.parse(opciones.body);
  pedidos.push({ url: String(url), prompt: body.contents[0].parts[0].text });
  const texto = body.generationConfig.responseSchema ? JSON.stringify(respuestaGemini) : 'dale';
  return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) };
};

// Se espía con qué texto se llama al extractor local desde gemini.js: tiene que
// ser el mensaje actual y nunca el historial.
const extraerMontoReal = local.extraerMonto;
const llamadasLocal = [];
local.extraerMonto = (texto) => {
  llamadasLocal.push(texto);
  return extraerMontoReal(texto);
};

/** Una respuesta mínima de Gemini, con la entrega que se le pase. */
function leeGemini(entrega, extra = {}) {
  return {
    intencion: 'declara_entrega',
    modelo: null,
    modelos: [],
    entrega,
    permuta: { ofrece: false },
    urgente: false,
    ...extra,
  };
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
  console.log('\nEntrega que Gemini no leyó\n');

  await check('Gemini sin entrega: la completa el extractor local desde el mensaje', async () => {
    const msg = 'perfecto tengo 520 y quiero el 14 pro';
    respuestaGemini = leeGemini(null, { modelo: '14 pro', modelos: ['14 pro'] });
    const info = await gemini.entender('Cliente: ' + msg, msg, '');
    assert.strictEqual(info._fuente, 'gemini', 'no pasó por Gemini');
    assert.strictEqual(info.entrega, 520000);
    assert.strictEqual(info._entregaFuente, 'local');
  });

  await check('el respaldo lee solo el mensaje actual: no arrastra un monto del historial', async () => {
    const msg = 'dale, y en cuotas como me queda?';
    const historial = `Cliente: tengo 400.000 y me estiro hasta 550.000\nVendedor: dale\nCliente: ${msg}`;
    respuestaGemini = leeGemini(null, { intencion: 'consulta_precio' });
    const antes = { pedidos: pedidos.length, local: llamadasLocal.length };
    const info = await gemini.entender(historial, msg, '');

    const prompts = pedidos.slice(antes.pedidos).map((p) => p.prompt);
    assert.ok(prompts.some((p) => p.includes('400.000')), 'la prueba no le pasó el historial a Gemini');
    assert.deepStrictEqual(llamadasLocal.slice(antes.local), [msg], 'el local no leyó (solo) el mensaje actual');
    assert.strictEqual(info.entrega, null, 'sacó la entrega del historial: ' + info.entrega);
    assert.strictEqual(info._entregaFuente, null);
  });

  await check('si Gemini leyó la entrega, el local ni se consulta', async () => {
    respuestaGemini = leeGemini(550000);
    const antes = llamadasLocal.length;
    const info = await gemini.entender('Cliente: me estiro a 550', 'me estiro a 550', '');
    assert.strictEqual(info.entrega, 550000);
    assert.strictEqual(info._entregaFuente, 'gemini');
    assert.strictEqual(llamadasLocal.length, antes, 'consultó al local sin hacer falta');
  });

  await check('la lectura del chat deja rastro de que la entrega vino del local', async () => {
    const chat = '5491100000101@s.whatsapp.net';
    const msg = 'quiero el 14 pro, tengo 520';
    respuestaGemini = leeGemini(null, { intencion: 'consulta_stock', modelo: '14 pro', modelos: ['14 pro'] });
    state.agregarAlHistorial(chat, 'cliente', msg);
    await decidir(chat, msg, 'Cliente');

    const s = state.obtener(chat);
    const { fuente, entrega, entregaFuente } = s.ultimaLectura;
    assert.deepStrictEqual({ fuente, entrega, entregaFuente }, { fuente: 'gemini', entrega: 520000, entregaFuente: 'local' });
    assert.strictEqual(s.entrega, 520000, 'no quedó guardada en el estado');
  });

  await check('el chat del bug: el segundo monto pisa al primero aunque Gemini no lo lea', async () => {
    const chat = '5491100000102@s.whatsapp.net';
    // Lo que devolvió Gemini de verdad en el diagnóstico, turno por turno.
    const turnos = [
      ['tengo 400.000 y me estiro hasta 550.000', leeGemini(400000), 400000],
      ['perfecto tengo 520 y quiero el 14 pro', leeGemini(null, { modelo: '14 pro', modelos: ['14 pro'] }), 520000],
      ['dale, y en cuotas como me queda?', leeGemini(null, { intencion: 'consulta_precio', forma_pago: 'cuotas' }), 520000],
    ];
    for (const [msg, lectura, esperada] of turnos) {
      respuestaGemini = lectura;
      state.agregarAlHistorial(chat, 'cliente', msg);
      const r = await decidir(chat, msg, 'Cliente');
      (r.mensajes || []).forEach((m) => salio(chat, m));
      assert.strictEqual(state.obtener(chat).entrega, esperada, `después de "${msg}"`);
    }
  });

  // ---------- Muestra de repro-v1 (28/09/2026): entrega partida, "90" de batería y cobranza ----------
  console.log('\nMuestra de repro-v1 (28/09/2026)\n');

  await check('extractor local: la entrega partida por forma de pago se suma', async () => {
    const esperados = [
      ['180 en efectivo y 120 en transferencia', 300000],
      ['150 cash y 100 por mp', 250000],
      ['tengo 180 mil en efectivo y 120.000 por transferencia', 300000],
      ['Tengo 180 en efectivo y \n120 en transferencia? No hay drama', 300000],
      ['efectivo 180 y transferencia 120', 300000],
      ['100 billetes y 50 por mercadopago', 150000],
      ['tengo 400 y me estiro a 550', 400000],
      ['tengo 180 y 120', 180000],
      ['tengo 180 en efectivo', 180000],
      ['el precio en transferencia es el mismo q en efectivo?', null],
      ['300 usd y 85 mil en efectivo', 85000],
    ];
    for (const [texto, esperado] of esperados) {
      assert.strictEqual(local.extraerMonto(texto), esperado, 'extraerMonto("' + texto.replace(/\n/g, ' ') + '")');
    }
    assert.strictEqual(local.entregaPartida('180 en efectivo y 120 en transferencia'), 300000);
    assert.strictEqual(local.entregaPartida('tengo 180 en efectivo'), null, 'un solo monto atado no es una entrega partida');
    assert.strictEqual(local.entregaPartida('tengo 180 y 120'), null, 'sin forma de pago no hay suma');
    // Mismo texto preparado que extraerMonto: "no llego a X" tampoco cuenta acá (code-review).
    assert.strictEqual(local.entregaPartida('no llego a 150 en efectivo y 100 por mp'), null);
    // Desde cero, D12 (decisión de Tomás del 29/09/2026): con una palabra de corrección la
    // entrega partida también se suma, igual que sin el "perdón" (hasta entonces daba $180.000).
    assert.strictEqual(local.extraerMonto('perdon, 180 en efectivo y 120 por transferencia'), 300000);
    // Y con una corrección de un solo monto, sigue ganando la corrección.
    assert.strictEqual(local.extraerMonto('tengo 400, perdon, 500'), 500000);
  });

  await check('Gemini lee $180.000 en "tengo 180 en efectivo y 120 en transferencia": se cotiza con la suma, $300.000', async () => {
    const chat = '5490000000154@s.whatsapp.net';
    const msg = 'Q onda amigo che sabes\nTengo 180 en efectivo y\n120 en transferencia? No hay drama';
    respuestaGemini = leeGemini(180000);
    state.agregarAlHistorial(chat, 'cliente', msg);
    const r = await decidir(chat, msg, 'Cliente');
    const s = state.obtener(chat);
    const texto = (r.mensajes || []).map(acciones.comoTexto).join('\n');
    assert.strictEqual(s.ultimaLectura.entrega, 300000, 'leyó entrega ' + s.ultimaLectura.entrega);
    assert.strictEqual(s.ultimaLectura.entregaFuente, 'local', 'fuente ' + s.ultimaLectura.entregaFuente);
    assert.strictEqual(s.entrega, 300000, 'guardó ' + s.entrega);
    assert.ok(texto.includes('$300.000'), 'no cotizó con $300.000: ' + texto);
    assert.ok(!texto.includes('$180.000'), 'cotizó con $180.000: ' + texto);
  });

  await check('canje en curso: "90" con Gemini leyendo $90.000 es la batería del equipo, no plata', async () => {
    const chat = '5490000000368@s.whatsapp.net';
    let msg = 'te dejo mi 12 en parte de pago para el 13';
    respuestaGemini = leeGemini(null, {
      intencion: 'permuta',
      modelo: '13',
      modelos: ['13'],
      permuta: { ofrece: true, modelo: '12', capacidad_gb: null, bateria: null, tiene_fotos: false },
    });
    state.agregarAlHistorial(chat, 'cliente', msg);
    let r = await decidir(chat, msg, 'Cliente');
    (r.mensajes || []).forEach((m) => salio(chat, m));
    assert.ok(state.obtener(chat).permutaDatosPedidos, 'la prueba no dejó el canje con los datos pedidos');
    assert.ok(/bateria/.test((r.mensajes || []).map(acciones.comoTexto).join('\n')), 'el bot no pidió la batería');

    msg = '90';
    respuestaGemini = leeGemini(90000);
    state.agregarAlHistorial(chat, 'cliente', msg);
    r = await decidir(chat, msg, 'Cliente');
    const s = state.obtener(chat);
    const texto = (r.mensajes || []).map(acciones.comoTexto).join('\n');
    assert.strictEqual(s.permuta && s.permuta.bateria, 90, 'no quedó la batería en el canje: ' + JSON.stringify(s.permuta));
    assert.strictEqual(s.entrega || null, null, 'guardó una entrega: ' + s.entrega);
    assert.strictEqual(s.ultimaLectura.entrega, null, 'leyó entrega ' + s.ultimaLectura.entrega);
    assert.ok(!/monto|[$]/i.test(texto), 'habló de plata: ' + texto);
    assert.ok(r.escalar && /mandó los datos del equipo/.test(r.motivo || ''), 'no escaló como "mandó los datos": ' + JSON.stringify({ escalar: r.escalar, motivo: r.motivo, texto }));
    assert.strictEqual(texto, '', 'no escaló callado: ' + texto);
  });

  await check('una línea de la cuenta que cobra la cuota se reconoce; la financiación del bot, no', async () => {
    const { cobraLaCuota } = require('../src/responder');
    const cobran = [
      'Estaria necesitando si me podrias transferir lo de la cuota',
      'te encargo el comprobante de la transferencia, sino la cuota ya aumenta a 185.000 por los 10 dias de demora',
      'Estaria necesitando el pago de la cuota! Para que no se junte con la otra',
      'me pasas el comprobante de la cuota?',
      'te dejo el alias para la cuota',
      'pagaste la cuota?',
      'la cuota pasa a 190.000 el 15',
      'acordate que la cuota sube si te demoras',
      'me transferis la cuota?',
      'hiciste la transferencia de la cuota?',
    ];
    const noCobran = [
      // Lo que manda el bot con la cotización y la financiación.
      '📱 *iPhone 11 64GB — batería 84%*\nCon una entrega de *$180.000*:\n• *1 pago de $111.000*\n• *2 pagos de $64.000 cada uno*',
      'lo que hacemos es financiarte en 1 o 2 cuotas con una entrega inicial',
      'sii mira, te cuento, lo que hacemos es financiarte el celular y darte a pagar en 1 o 2 cuotas, pedimos una entrega inicial',
      'como te decia, te lo financiamos en 1 o 2 cuotas con una entrega inicial',
      'como te decia, podes pagarlo de contado o financiarlo hasta en 2 cuotas con una entrega inicial',
      'podes pagarlo de contado (efectivo, transferencia o mercado pago) o financiarlo hasta en 2 cuotas con una entrega inicial',
      'tenemos contado, en efectivo, transferencia o mercado pago, y tambien financiacion hasta en 2 cuotas, con una entrega inicial',
      'contame como tenias pensado pagarlo, tenemos contado y tambien lo financiamos hasta en 2 cuotas con una entrega inicial',
      'las cuotas arrancan el mes que viene, no este mes',
      'dale, abonas los $320.000 de entrega, te llevas el 13 y el resto lo hacemos en cuotas',
      'el resto lo podemos hacer en hasta 2 cuotas',
      'dale, te cuento, con los $300.000 al 13 todavia no estamos, para ese modelo pedimos $320.000 de entrega inicial. el resto lo financiamos en 1 o 2 cuotas, asi que cuanto mas te acerques a esa entrega mas livianas te quedan',
      'contame con cuanto contas asi te armo las cuotas',
      // Una persona explicando cómo se paga, antes de la venta (code-review): no es cobranza.
      'la primera cuota la podes hacer por transferencia',
      'la cuota la pagas el mes que viene, por transferencia o efectivo',
      'el pago de la primera cuota es a los 30 dias de la entrega',
      // Sin la cuota no es cobranza.
      'te dejo el alias',
      'dale joya no hay drama',
    ];
    const noCaza = cobran.filter((l) => !cobraLaCuota(l));
    const cazaDeMas = noCobran.filter((l) => cobraLaCuota(l));
    assert.deepStrictEqual(noCaza, [], 'no caza: ' + JSON.stringify(noCaza));
    assert.deepStrictEqual(cazaDeMas, [], 'caza de más: ' + JSON.stringify(cazaDeMas));
  });

  await check('ningún pedido salió con otra clave que la de la prueba', async () => {
    assert.ok(pedidos.length > 0, 'no se simuló ningún pedido');
    assert.ok(pedidos.every((p) => p.url.includes('de-mentira-para-la-prueba')));
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
