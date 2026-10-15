'use strict';
/**
 * Cerebro Sonnet, fase 1: en sombra (decisión de Tomás del 01/10/2026).
 *
 *   node test/cerebro.test.js
 *
 * Todo con un `fetch` de mentira que contesta como la API de Anthropic (bloques `tool_use` y
 * `usage`): nunca sale a la red, y la clave es de mentira. Se prueba:
 *   1. la guardia del código: los montos salen de las herramientas de ESE turno, como mucho 4
 *      mensajes de 300 caracteres, nada de prometer a otra persona ni de "te falta(n)";
 *   2. escalar, los errores (500 dos veces, timeout) y lo que no termina con responder o escalar;
 *   3. qué lleva cada pedido: las 30 líneas marcadas, las líneas de persona y las instrucciones con
 *      `cache_control`;
 *   4. el enganche en sombra de index.js: deja `propuesta-sonnet` con el mismo `tanda`, y el
 *      cliente y el grupo reciben exactamente lo mismo que con `apagado` (dos procesos hijos con
 *      `Math.random` fijo: la alternancia de `estilo.frase` es de todo el proceso). Con `apagado`
 *      no hay ninguna llamada a la API;
 *   5. /salud muestra `cerebro`;
 *   6. `npm run sombra` (test/sombra.js) con el registro de mentira;
 *   7. todo test que carga index.js fija CEREBRO_MODO (si no, con `sombra` en el .env real,
 *      `npm test` saldría a Anthropic con la clave de verdad).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');
const { spawnSync } = require('child_process');

const CORRIDA = (process.argv.find((a) => a.startsWith('--corrida=')) || '').split('=')[1] || null;
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'cerebro-'));

// El entorno se fija acá y no se hereda del .env (dotenv no pisa lo que ya está puesto).
process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '6';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.SOLO_CHATS_NUEVOS = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = '';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RESUMEN_ACTIVO = 'false';
process.env.GUARDIAN_ACTIVO = 'false';
process.env.TECHSUR_ACTIVO = 'false';
process.env.AUDIO_ACTIVO = 'false';
process.env.FOTOS_DIR = path.join(TMP, 'sin-fotos');
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.CEREBRO_MODO = CORRIDA || 'apagado';
// La sombra con persona (03/10/2026) apagada: si no, la del .env real cambiaría lo que se compara.
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
// Un PDF de mentira (como cerebro-vivo.test.js): el compromiso "sale" aunque no haya documentos/ (un worktree).
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// La API de mentira
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const USD_POR_LLAMADA = (1000 * 2 + 100 * 10 + 2000 * 0.2 + 500 * 2.5) / 1e6;

const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const texto = (t) => ({ type: 'text', text: t });
function mensajeApi(content, stop = 'tool_use') {
  return { id: 'msg_' + pedidos.length, type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: stop, usage: { ...USO } };
}
const comoRespuesta = (status, cuerpo) => ({
  ok: status >= 200 && status < 300,
  status,
  json: async () => cuerpo,
  text: async () => JSON.stringify(cuerpo),
});

/** Cada paso: el `content` de una respuesta, `{ status }` para un error, o una función. */
function guion(...lista) {
  pasos = lista;
  pedidos.length = 0;
}
globalThis.fetch = async (url, opciones = {}) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + url);
  const body = JSON.parse(opciones.body);
  pedidos.push({ url: String(url), headers: opciones.headers, body });
  const paso = pasos[pedidos.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  if (typeof paso === 'function') return paso(opciones, body);
  if (paso && paso.status) return comoRespuesta(paso.status, { type: 'error', error: { type: 'api_error', message: 'de mentira' } });
  return comoRespuesta(200, Array.isArray(paso) ? mensajeApi(paso) : paso);
};

// ---------------------------------------------------------------------------
// El bot, sin red
// ---------------------------------------------------------------------------
const sheets = require('../src/sheets');
const fixture = require('./fixture-planilla');
sheets.usarFixture(fixture);
sheets.registrarLead = async () => {};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, t) => {
  aClientes.push({ numero, texto: t });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const escrito = (chatId, t) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: t },
});

/** Leído del registro de aprendizaje de este proceso. */
function eventos() {
  try {
    return fs
      .readFileSync(process.env.APRENDIZAJE_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}

// ---------------------------------------------------------------------------
// Proceso hijo: una conversación por index.js con el modo de CORRIDA. Imprime lo que salió.
// ---------------------------------------------------------------------------
if (CORRIDA) {
  // Mismo azar en las dos corridas: el saludo y las variantes salen iguales.
  Math.random = () => 0.42;
  (async () => {
    // Sonnet contesta algo que no puede salir nunca: si aparece en un envío, la sombra se filtró.
    guion(
      [usar('responder', { mensajes: ['MENSAJE DE SONNET que no tiene que salir'] })],
      [usar('escalar', { motivo: 'ESCALADO DE SONNET que no tiene que salir' })]
    );
    const bot = require('../src/index');
    const chat = '5490000000001@s.whatsapp.net';
    await bot.procesar(escrito(chat, 'hola, tenes el iphone 13?'));
    await bot.procesar(escrito(chat, 'me lo podes mandar a cordoba?'));
    // Sin texto: un pedido del catálogo, y una nota de voz que no se transcribe (AUDIO_ACTIVO=false).
    // El bot escala sin interpretar; a Sonnet no se le pregunta nada.
    await bot.procesar({
      key: { remoteJid: '5490000000002@s.whatsapp.net', fromMe: false, id: 'O' + Math.random() },
      pushName: 'Lucia',
      message: { orderMessage: { orderTitle: 'iPhone 13' } },
    });
    await bot.procesar({
      key: { remoteJid: '5490000000003@s.whatsapp.net', fromMe: false, id: 'A' + Math.random() },
      pushName: 'Lucia',
      message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } },
    });
    // La sombra no se espera: se le da un rato para que anote lo suyo.
    for (let i = 0; i < 100; i++) {
      const evs = eventos();
      const props = evs.filter((e) => e.tipo === 'propuesta' && e.chat === '...0001').length;
      if (CORRIDA === 'apagado' || evs.filter((e) => e.tipo === 'propuesta-sonnet').length >= props) break;
      await dormir(20);
    }
    // Lo que se hubiera disparado de más (con los casos sin texto) también tiene que alcanzar a anotarse.
    await dormir(150);
    const salida = {
      aClientes,
      alGrupo,
      llamadasApi: pedidos.length,
      eventos: eventos().filter((e) => e.tipo === 'propuesta' || e.tipo === 'propuesta-sonnet'),
    };
    console.log('RESULTADO_CORRIDA ' + JSON.stringify(salida));
    process.exit(0);
  })().catch((e) => {
    console.error(e);
    process.exit(1);
  });
  return;
}

// ---------------------------------------------------------------------------
// Las pruebas
// ---------------------------------------------------------------------------
const state = require('../src/state');
const config = require('../src/config');
const cotizador = require('../src/cotizador');
const cerebro = require('../src/cerebro');
const acciones = require('../src/acciones');

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}

let n = 0;
const nuevoChat = () => '54900000' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
/** Un chat con una línea del cliente, como la deja index.js antes de interpretar. */
function chatCon(t) {
  const chatId = nuevoChat();
  state.agregarAlHistorial(chatId, 'cliente', t);
  return chatId;
}
/** El JSON de los tool_result del último pedido, por nombre de la herramienta que los pidió. */
function resultadosDelPedido(i) {
  const msgs = pedidos[i].body.messages;
  const ultimo = msgs[msgs.length - 1];
  return (Array.isArray(ultimo.content) ? ultimo.content : []).filter((b) => b.type === 'tool_result').map((b) => b.content);
}

const filaDel13 = fixture.lista.find((f) => f.modelo === 'iPhone 13');
const cot13 = cotizador.cotizar(filaDel13, 340000, fixture.config);

(async () => {
  console.log('\n1. La guardia: los montos salen de las herramientas\n');

  await check('busca el 13, cotiza con 340.000 y responde con [cotizacion]: pasa la guardia y sale el bloque con esos montos', async () => {
    assert.ok(cot13.ok && !cot13.soloContado && !cot13.usoManual, 'el caso no prueba nada: la cotización no es la de cuotas');
    // Bloque Ninjo 1b: la cotización la escribe el código en el bloque, donde Sonnet pone [cotizacion].
    const mensajes = ['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?'];
    guion(
      [usar('buscar_equipos', { modelo: '13' })],
      [usar('cotizar', { modelo: '13', entrega: 340000 })],
      [usar('responder', { mensajes })]
    );
    const r = await cerebro.pensar({ chatId: chatCon('quiero el 13, tengo 340 mil'), mensaje: 'quiero el 13, tengo 340 mil', nombre: 'Lucia' });
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.guardia, null, 'la guardia frenó: ' + r.guardia);
    assert.strictEqual(r.escalar, false);
    assert.deepStrictEqual(r.mensajes, [mensajes[0], cotizador.bloqueSonnet(filaDel13, cot13), mensajes[2]]);
    assert.deepStrictEqual(r.escritos, mensajes);
    assert.strictEqual(r.compromisoDePago, true, 'con el primer bloque va el PDF');
    // Los montos son los del cotizador y la planilla, no los que dijo el modelo.
    for (const m of [cot13.pagoUnico, cot13.cuotaDe2, 340000, filaDel13.precio_contado, filaDel13.anticipo_min]) {
      assert.ok(r.montosDeHerramientas.includes(m), `${m} no está entre los montos de las herramientas: ${r.montosDeHerramientas}`);
    }
    const busco = JSON.parse(resultadosDelPedido(1)[0]);
    const el13 = busco.equipos.find((e) => e.modelo === 'iPhone 13');
    assert.strictEqual(el13.precio_contado, 495000);
    assert.strictEqual(el13.entrega_minima, 320000);
    assert.strictEqual(el13.bateria, '100%');
    const cotizo = JSON.parse(resultadosDelPedido(2)[0]);
    assert.strictEqual(cotizo.llega, true);
    assert.strictEqual(cotizo.un_pago, cot13.pagoUnico);
    assert.strictEqual(cotizo.dos_cuotas_de, cot13.cuotaDe2);
    assert.ok(!('falta' in cotizo) && !('saldo' in cotizo), 'la herramienta devuelve una resta');
    assert.strictEqual(pedidos.length, 3);
  });

  await check('el gasto: tokens sumados de las 3 vueltas y USD con los precios de config', async () => {
    guion([usar('escalar', { motivo: 'x' })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.deepStrictEqual(r.uso, { entrada: 1000, salida: 100, cacheLeida: 2000, cacheEscrita: 500 });
    assert.strictEqual(r.usd.toFixed(8), USD_POR_LLAMADA.toFixed(8));
    assert.ok(typeof r.ms === 'number' && r.ms >= 0);
  });

  for (const inventado of ['$480.000', '480.000', '480000', '480 mil', '$480 mil', '480k']) {
    await check(`responde con un monto que ninguna herramienta devolvió (${inventado}): escala, con guardia`, async () => {
      // Lo vuelve a mandar igual en la vuelta de corrección: escala.
      const malo = () => [usar('responder', { mensajes: [`el 13 te lo dejo en ${inventado} de contado`] })];
      guion([usar('buscar_equipos', { modelo: '13' })], malo(), malo());
      const r = await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
      assert.strictEqual(r.escalar, true);
      assert.deepStrictEqual(r.mensajes, []);
      assert.ok(/monto/i.test(r.guardia || '') && /480/.test(r.guardia), 'la guardia no dice qué monto: ' + r.guardia);
      assert.strictEqual(pedidos.length, 3, 'una sola vuelta para corregir');
      assert.ok(r.corregida && /480/.test(r.corregida.guardia), 'falta lo que frenó la primera vez');
    });
  }

  await check('un monto de una herramienta de un turno anterior no vale: hay que volver a pedirlo', async () => {
    guion([usar('buscar_equipos', { modelo: '13' })], [usar('escalar', { motivo: 'x' })]);
    await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    guion([usar('responder', { mensajes: ['sii, el 13 esta $495.000 de contado'] })], [usar('responder', { mensajes: ['sii, el 13 esta $495.000 de contado'] })]);
    const r = await cerebro.pensar({ chatId: chatCon('cuanto era el 13?'), mensaje: 'cuanto era el 13?', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.ok(/495/.test(r.guardia || ''), r.guardia);
  });

  await check('los montos se leen igual con puntos, sin puntos y en "mil" (y la dirección no es un monto)', async () => {
    assert.deepStrictEqual(cerebro.montosEn('$254.000 · 254000 · 254 mil · $254 mil · 254k · $254.000,00'), [254000, 254000, 254000, 254000, 254000, 254000]);
    assert.deepStrictEqual(cerebro.montosEn('el 13 de 128gb al 100%, 1 o 2 cuotas, estamos en Belgrano 3090'), []);
    assert.deepStrictEqual(cerebro.montosEn('el 16 sale 1.050.000'), [1050000]);
    // Un año suelto no es un monto; con $, separador o "mil", sí.
    assert.deepStrictEqual(cerebro.montosEn('el 16 salio en 2024 y el 17 en el 2025'), []);
    assert.deepStrictEqual(cerebro.montosEn('$2024 · 2.024 · 2024 mil · 3090'), [2024, 2024, 2024000, 3090]);
  });

  console.log('\n1a. Fase 2: montos con puntos, lo leído, el PDF y lo que queda para el estado\n');

  for (const sinPuntos of ['$495000', '495000', '495,000', 'el 13 sale 495000 de contado']) {
    await check(`un monto sin puntos de miles ("${sinPuntos}") frena aunque salió de una herramienta: escala, guardia: …`, async () => {
      const malo = () => [usar('responder', { mensajes: [`el 13 te queda en ${sinPuntos}`], compromiso_de_pago: false })];
      guion([usar('buscar_equipos', { modelo: '13' })], malo(), malo());
      const r = await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
      assert.strictEqual(r.escalar, true);
      assert.deepStrictEqual(r.mensajes, []);
      assert.ok(/sin puntos/.test(r.guardia || ''), 'la guardia no dice que falta el punto: ' + r.guardia);
      assert.ok(!/no salió de ninguna herramienta/.test(r.guardia), 'el monto sí salió de la herramienta: ' + r.guardia);
      assert.ok(r.motivo.startsWith('guardia:'), 'el motivo no empieza con "guardia:": ' + r.motivo);
    });
  }

  await check('con puntos, el mismo monto pasa ("$495.000", "495.000", "495 mil")', async () => {
    guion([usar('buscar_equipos', { modelo: '13' })], [usar('responder', { mensajes: ['el 13 sale $495.000', 'o sea 495.000, 495 mil'], compromiso_de_pago: false })]);
    const r = await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.deepStrictEqual(cerebro.sinPuntosEn('salio en 2024, belgrano 3090, 128gb, 100%, 1 o 2 cuotas, $1.050.000'), []);
  });

  await check('responder pide los mensajes y acepta aviso_grupo (opcional); compromiso_de_pago ya no está (bloque Ninjo 1b), con strict', async () => {
    const h = cerebro.HERRAMIENTAS.find((x) => x.name === 'responder');
    assert.strictEqual(h.strict, true);
    assert.ok(!('compromiso_de_pago' in h.input_schema.properties), 'sigue compromiso_de_pago');
    assert.strictEqual(h.input_schema.properties.aviso_grupo.type, 'string');
    // Panel Chiara (06/10/2026): la ficha va siempre, en responder y en escalar.
    assert.deepStrictEqual(h.input_schema.required, ['mensajes', 'ficha']);
    assert.strictEqual(h.input_schema.additionalProperties, false);
    const f = h.input_schema.properties.ficha;
    assert.strictEqual(f.additionalProperties, false);
    assert.deepStrictEqual(f.required, Object.keys(f.properties), 'con strict, la ficha entera');
    assert.deepStrictEqual(cerebro.HERRAMIENTAS.find((x) => x.name === 'escalar').input_schema.required, ['motivo', 'ficha']);
  });

  await check('pensar dice cuántas líneas leyó (historial, de una persona y de Evolution); explicar la financiación ya no lleva el PDF', async () => {
    const chatId = nuevoChat();
    state.agregarAlHistorial(chatId, 'cliente', 'hola');
    state.agregarAlHistorial(chatId, 'vendedor', 'te paso el 13 en un rato', { humano: true });
    state.agregarAlHistorial(chatId, 'cliente', 'como son las cuotas?');
    guion([usar('responder', { mensajes: ['lo financiamos nosotros, con tu dni y un compromiso de pago'], compromiso_de_pago: true })]);
    const r = await cerebro.pensar({ chatId, mensaje: 'como son las cuotas?', nombre: '' });
    assert.deepStrictEqual(r.leidos, { historial: 3, persona: 1, evolution: 0 });
    // Bloque Ninjo 1b: el PDF lo decide el código (con el primer bloque), aunque Sonnet pida compromiso_de_pago.
    assert.strictEqual(r.compromisoDePago, false);
    assert.ok(!/compromiso de pago \(PDF\)/.test(pedidos[0].body.messages[0].content[0].text), 'el pedido sigue diciendo si salió el PDF');
    guion([usar('responder', { mensajes: ['contame que modelo buscabas'] })]);
    const sinCampo = await cerebro.pensar({ chatId, mensaje: 'ok', nombre: '' });
    assert.strictEqual(sinCampo.compromisoDePago, false, 'sin el campo tiene que contar como false');
  });

  await check('lo que queda para el estado: el modelo y la entrega del último cotizar, y los que no llegan', async () => {
    guion(
      [usar('cotizar', { modelo: '14', entrega: 600000 })],
      [usar('cotizar', { modelo: '13', entrega: 300000 })],
      [usar('responder', { mensajes: ['contame como lo pensabas pagar'], compromiso_de_pago: false })]
    );
    const r = await cerebro.pensar({ chatId: chatCon('y el 13 con 300?'), mensaje: 'y el 13 con 300?', nombre: '' });
    assert.strictEqual(r.datos.modelo, 'iPhone 13');
    assert.strictEqual(r.datos.capacidad_gb, 128);
    assert.strictEqual(r.datos.entrega, 300000);
    assert.deepStrictEqual(r.datos.noLlega, ['iPhone 13']);
    assert.ok(r.datos.precios.some((p) => p.modelo === 'iPhone 13' && p.precio === 495000));
    guion([usar('buscar_equipos', { modelo: '13' })], [usar('responder', { mensajes: ['contame como lo pensabas pagar'], compromiso_de_pago: false })]);
    const solo = await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    assert.strictEqual(solo.datos.modelo, 'iPhone 13', 'el único modelo de buscar_equipos');
    assert.strictEqual(solo.datos.entrega, null);
    guion([usar('buscar_equipos', {})], [usar('responder', { mensajes: ['contame como lo pensabas pagar'], compromiso_de_pago: false })]);
    const todos = await cerebro.pensar({ chatId: chatCon('que tenes?'), mensaje: 'que tenes?', nombre: '' });
    assert.strictEqual(todos.datos.modelo, null, 'con varios modelos no hay uno elegido');
  });

  // 🔔 LEAD (13/10/2026): "Entrega" muestra la última entrega cotizada o aceptada, no la primera que dijo el cliente.
  await check('entregaAviso: si la entrega no llega es la entrega mínima que se le dijo (no los $300.000 del cliente); si llega, esa entrega; un turno que no cotiza no la pisa; `entrega` sigue siendo la del cliente', async () => {
    const minima = fixture.lista.find((f) => f.modelo === 'iPhone 13' && f.capacidad_gb === 128 && !f.solo_contado).anticipo_min;
    assert.ok(minima > 300000 && minima < 400000, `el caso no prueba nada con la copia congelada: mínima ${minima}`);
    const chatId = chatCon('el 13 con 300');
    // Turno 1: cotiza con 300.000 y no llega: se le dice la mínima.
    guion([usar('cotizar', { modelo: '13', entrega: 300000 })], [usar('responder', { mensajes: ['con ese monto no llegamos, para retirarlo lo pedimos con la entrega inicial'] })]);
    const r1 = await cerebro.pensar({ chatId, mensaje: 'el 13 con 300', nombre: '' });
    assert.strictEqual(r1.datos.entrega, 300000);
    assert.strictEqual(r1.datos.entregaAviso, minima, 'no llega: el aviso lleva la entrega mínima');
    cerebro.comoResultado(chatId, r1, { mensaje: 'el 13 con 300' });
    assert.strictEqual(state.obtener(chatId).entrega, 300000, 'lo que dijo el cliente no se toca');
    assert.strictEqual(state.obtener(chatId).entregaAviso, minima);
    // Turno 2: acepta la mínima y Sonnet escala sin volver a cotizar: el aviso sigue con la mínima.
    state.agregarAlHistorial(chatId, 'cliente', 'dale, la consigo. el miercoles a las 18');
    guion([usar('escalar', { motivo: 'pide turno el miércoles a las 18', turno: true })]);
    const r2 = await cerebro.pensar({ chatId, mensaje: 'dale, la consigo. el miercoles a las 18', nombre: '' });
    assert.strictEqual(r2.datos.entregaAviso, null, 'un turno que no cotiza no trae entrega para el aviso');
    cerebro.comoResultado(chatId, r2, { mensaje: 'dale, la consigo. el miercoles a las 18' });
    assert.strictEqual(state.obtener(chatId).entregaAviso, minima, 'el turno sin cotizar pisó la entrega del aviso');
    assert.deepStrictEqual(cerebro.entregasDelAviso(state.obtener(chatId)), ['$' + minima.toLocaleString('es-AR')]);
    // Turno 3: cotiza con 400.000 y llega: ahora es esa.
    state.agregarAlHistorial(chatId, 'cliente', 'y si pongo 400?');
    guion([usar('cotizar', { modelo: '13', entrega: 400000 })], [usar('responder', { mensajes: ['dale, con los $400.000 te queda asi'] })]);
    const r3 = await cerebro.pensar({ chatId, mensaje: 'y si pongo 400?', nombre: '' });
    assert.strictEqual(r3.datos.entregaAviso, 400000, 'llega: la entrega con la que cotizó');
    cerebro.comoResultado(chatId, r3, { mensaje: 'y si pongo 400?' });
    assert.strictEqual(state.obtener(chatId).entregaAviso, 400000);
    // #reset: el chat queda como nuevo.
    state.reiniciar(chatId, {});
    assert.ok(!state.obtener(chatId).entregaAviso, '#reset no limpió la entrega del aviso');
  });

  await check('entregasDelAviso (la línea "Entrega:" del 🔔 LEAD): la del aviso si hay, si no la del cliente; los dólares se suman; sin nada, vacío', async () => {
    assert.deepStrictEqual(cerebro.entregasDelAviso({ entrega: 900000, entregaAviso: 1020000 }), ['$1.020.000']);
    assert.deepStrictEqual(cerebro.entregasDelAviso({ entrega: 900000 }), ['$900.000']);
    assert.deepStrictEqual(cerebro.entregasDelAviso({ entrega: 900000, entregaAviso: null, entregaDolares: 420 }), ['$900.000', 'US$420']);
    assert.deepStrictEqual(cerebro.entregasDelAviso({ entregaDolares: 420 }), ['US$420']);
    assert.deepStrictEqual(cerebro.entregasDelAviso({}), []);
  });

  console.log('\n1b. Las herramientas de datos\n');

  /** Una herramienta sola y escalar: devuelve el JSON de su tool_result, si fue error y lo que devolvió `pensar`. */
  async function probarHerramienta(nombre, input) {
    guion([usar(nombre, input)], [usar('escalar', { motivo: 'x' })]);
    const pensado = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    const bloque = pedidos[1].body.messages[pedidos[1].body.messages.length - 1].content[0];
    return { r: JSON.parse(bloque.content), error: Boolean(bloque.is_error), pensado };
  }

  await check('cotizar bajo el mínimo (dentro del tope del recargo): no llega, con la entrega mínima, sin cuotas', async () => {
    const cot = cotizador.cotizar(filaDel13, 300000, fixture.config);
    assert.ok(cot.ok && cot.bajoMinimo, 'el caso no prueba nada: 300.000 no es bajo el mínimo con recargo');
    const { r } = await probarHerramienta('cotizar', { modelo: '13', entrega: 300000 });
    assert.strictEqual(r.llega, false);
    assert.strictEqual(r.entrega_minima, 320000);
    assert.ok(!('un_pago' in r) && !('dos_cuotas_de' in r), 'cotizó con recargo: ' + JSON.stringify(r));
  });

  await check('cotizar con una entrega que paga el equipo entero: paga_de_contado y el precio', async () => {
    const { r } = await probarHerramienta('cotizar', { modelo: '13', entrega: 600000 });
    assert.strictEqual(r.paga_de_contado, true);
    assert.strictEqual(r.precio_contado, 495000);
    assert.ok(!('un_pago' in r));
  });

  await check('con la lista de precios vencida, las herramientas no dan precios', async () => {
    sheets.usarFixture({ ...fixture, config: { ...fixture.config, estadoLista: 'VENCIDA' } });
    try {
      const { r, error } = await probarHerramienta('buscar_equipos', { modelo: '13' });
      assert.ok(error && /VENCIDA/.test(r.error), JSON.stringify(r));
      const cot = await probarHerramienta('cotizar', { modelo: '13', entrega: 340000 });
      assert.ok(cot.error && !('un_pago' in cot.r));
    } finally {
      sheets.usarFixture(fixture);
    }
  });

  await check('buscar_equipos respeta #bateria (LISTA 85-93): otro precio y la batería como rango', async () => {
    sheets.usarListaBateria('85-93');
    try {
      const { r } = await probarHerramienta('buscar_equipos', { modelo: '13' });
      const el13 = r.equipos.find((e) => e.modelo === 'iPhone 13' && !e.unidad_puntual);
      assert.strictEqual(el13.precio_contado, 450000);
      assert.strictEqual(el13.bateria, '85-93%');
    } finally {
      sheets.usarListaBateria(null);
    }
  });

  await check('buscar_equipos no ofrece los modelos que no se trabajan (el XR de USADOS)', async () => {
    assert.ok(fixture.usados.some((f) => /xr/i.test(f.modelo)), 'el caso no prueba nada: no hay XR en la copia');
    const { r } = await probarHerramienta('buscar_equipos', { modelo: 'XR' });
    assert.deepStrictEqual(r.equipos, []);
    const todos = await probarHerramienta('buscar_equipos', {});
    assert.ok(todos.r.equipos.length > 5 && !todos.r.equipos.some((e) => /xr/i.test(e.modelo)));
  });

  await check('lista_de_precios: la lista del bot partida en usados y sellados, y sus precios pasan la guardia', async () => {
    const { r: lista } = await probarHerramienta('lista_de_precios', {});
    assert.ok(/^Ip 17 /m.test(lista.sellados) && !/^Ip 17 /m.test(lista.usados), JSON.stringify(lista));
    const linea = lista.usados.split('\n').find((l) => /^Ip 13 /.test(l));
    assert.ok(linea && /495\.000/.test(linea), 'la lista no tiene el 13: ' + linea);
    guion([usar('lista_de_precios', {})], [usar('responder', { mensajes: [linea, 'contame cual te interesa'] })]);
    const r = await cerebro.pensar({ chatId: chatCon('pasame la lista'), mensaje: 'pasame la lista', nombre: '' });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.strictEqual(r.escalar, false);
  });

  console.log('\n1c. Cómo termina el turno\n');

  await check('responder y escalar en la misma respuesta: gana escalar', async () => {
    guion([usar('responder', { mensajes: ['sii, contame'] }), usar('escalar', { motivo: 'mejor que lo vea una persona' })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.deepStrictEqual(r.mensajes, []);
    assert.strictEqual(r.motivo, 'mejor que lo vea una persona');
  });

  await check('buscar y responder en la misma respuesta: el monto no vale todavía; en la vuelta de corrección la herramienta ya corrió y pasa', async () => {
    const respuesta = () => usar('responder', { mensajes: ['el 13 de contado esta $495.000'] });
    guion([usar('buscar_equipos', { modelo: '13' }), respuesta()], [respuesta()]);
    const r = await cerebro.pensar({ chatId: chatCon('el 13 con 340'), mensaje: 'el 13 con 340', nombre: '' });
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.ok(r.corregida && /monto/.test(r.corregida.guardia), 'falta lo que frenó la primera vez');
    assert.strictEqual(pedidos.length, 2);
    // La segunda llamada lleva un tool_result por cada tool_use: el de cotizar con sus datos y el del responder como error.
    const ultimo = pedidos[1].body.messages[pedidos[1].body.messages.length - 1];
    assert.strictEqual(ultimo.role, 'user');
    assert.strictEqual(ultimo.content.length, 2);
    const [deBuscar, deResponder] = ultimo.content;
    assert.ok(!deBuscar.is_error && /equipos/.test(deBuscar.content), JSON.stringify(deBuscar));
    assert.ok(deResponder.is_error && /NO salió/.test(deResponder.content) && /monto/.test(deResponder.content), JSON.stringify(deResponder));
  });

  console.log('\n2. La guardia: lo que nunca se dice\n');

  await check('"te faltan $50.000": escala', async () => {
    const malo = () => [usar('responder', { mensajes: ['te faltan $50.000 para la entrega del 13'] })];
    guion([usar('cotizar', { modelo: '13', entrega: 270000 })], malo(), malo());
    const r = await cerebro.pensar({ chatId: chatCon('el 13, tengo 270'), mensaje: 'el 13, tengo 270', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.deepStrictEqual(r.mensajes, []);
    assert.ok(/falta/i.test(r.guardia || ''), r.guardia);
  });

  await check('"te falta poco" sin ningún monto también escala', async () => {
    guion([usar('responder', { mensajes: ['uh te falta poquito para el 13'] })], [usar('responder', { mensajes: ['uh te falta poquito para el 13'] })]);
    const r = await cerebro.pensar({ chatId: chatCon('el 13, tengo 300'), mensaje: 'el 13, tengo 300', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.ok(/falta/i.test(r.guardia || ''), r.guardia);
  });

  await check('prometer "ahora te escribe fran": escala', async () => {
    guion([usar('responder', { mensajes: ['dale, ahora te escribe fran'] })], [usar('responder', { mensajes: ['dale, ahora te escribe fran'] })]);
    const r = await cerebro.pensar({ chatId: chatCon('quiero hablar con alguien'), mensaje: 'quiero hablar con alguien', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.deepStrictEqual(r.mensajes, []);
    assert.ok(/promet/i.test(r.guardia || ''), r.guardia);
  });

  await check('prometer volver ("dame un ratito y te confirmo"): escala', async () => {
    guion([usar('responder', { mensajes: ['dame un ratito y te confirmo'] })], [usar('responder', { mensajes: ['dame un ratito y te confirmo'] })]);
    const r = await cerebro.pensar({ chatId: chatCon('lo tenes en negro?'), mensaje: 'lo tenes en negro?', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.ok(/promet/i.test(r.guardia || ''), r.guardia);
  });

  // Ninjo bloque 1 (05/10/2026): con más de 4 mensajes ya no frena, del cuarto en adelante van juntos.
  await check('5 mensajes: no escala, del cuarto en adelante van juntos en el cuarto', async () => {
    guion([usar('responder', { mensajes: ['uno', 'dos', 'tres', 'cuatro', 'cinco'], compromiso_de_pago: false })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.strictEqual(r.guardia, null);
    assert.deepStrictEqual(r.mensajes, ['uno', 'dos', 'tres', 'cuatro\ncinco']);
    assert.strictEqual(pedidos.length, 1);
  });

  await check('un mensaje de más de 300 caracteres: escala', async () => {
    guion([usar('responder', { mensajes: ['a'.repeat(301)] })], [usar('responder', { mensajes: ['a'.repeat(301)] })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.ok(/300/.test(r.guardia || ''), r.guardia);
  });

  console.log('\n2b. La guardia con una vuelta para corregir (02/10/2026)\n');

  await check('la guardia frena un mensaje de más de 300 caracteres y Sonnet lo corrige en la vuelta siguiente: sale lo corregido', async () => {
    guion(
      [usar('responder', { mensajes: ['uno', 'a'.repeat(301)], compromiso_de_pago: false })],
      [usar('responder', { mensajes: ['uno', 'dos', 'tres'], compromiso_de_pago: false })]
    );
    const r = await cerebro.pensar({ chatId: chatCon('pasame la lista'), mensaje: 'pasame la lista', nombre: '' });
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.strictEqual(r.guardia, null);
    assert.strictEqual(r.mensajes.length, 3);
    assert.ok(r.corregida && /300/.test(r.corregida.guardia), JSON.stringify(r.corregida));
    assert.strictEqual(r.corregida.frenados.length, 2);
    assert.strictEqual(pedidos.length, 2);
    const error = pedidos[1].body.messages[pedidos[1].body.messages.length - 1].content[0];
    assert.ok(error.type === 'tool_result' && error.is_error === true, JSON.stringify(error));
    assert.ok(/NO salió/.test(error.content) && /300/.test(error.content), error.content);
    assert.strictEqual(r.herramientas.filter((h) => h === 'responder').length, 2);
  });

  await check('una sola corrección: si en la vuelta de corrección vuelve a frenar, escala y no hay tercera llamada', async () => {
    guion([usar('responder', { mensajes: ['dale, ahora te escribe fran'] })], [usar('responder', { mensajes: ['uh te falta poco'] })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.ok(r.motivo.startsWith('guardia:') && /falta/.test(r.guardia), r.motivo);
    assert.ok(/promet/.test(r.corregida.guardia), JSON.stringify(r.corregida));
    assert.strictEqual(pedidos.length, 2);
  });

  await check('en la última vuelta no hay corrección: escala de una', async () => {
    guion(
      [usar('buscar_equipos', { modelo: '13' })],
      [usar('buscar_equipos', { modelo: '14' })],
      [usar('buscar_equipos', { modelo: '15' })],
      [usar('buscar_equipos', { modelo: '16' })],
      [usar('responder', { mensajes: ['a'.repeat(301)] })]
    );
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.ok(/300/.test(r.guardia || ''), r.guardia);
    assert.ok(!r.corregida);
    assert.strictEqual(pedidos.length, 5);
  });

  await check('escalar en la vuelta de corrección: escala con su motivo, sin mandar nada', async () => {
    guion([usar('responder', { mensajes: ['el 13 sale $480.000'] })], [usar('escalar', { motivo: 'no tengo el precio' })]);
    const r = await cerebro.pensar({ chatId: chatCon('cuanto el 13?'), mensaje: 'cuanto el 13?', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.strictEqual(r.motivo, 'no tengo el precio');
    assert.deepStrictEqual(r.mensajes, []);
  });

  await check('cada mensaje pasa por limpiarRedactado (sin el saludo del principio ni el relleno)', async () => {
    guion([usar('responder', { mensajes: ['Buenass! contame que modelo buscabas', 'dale joya'] })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.deepStrictEqual(r.mensajes, ['contame que modelo buscabas']);
  });

  console.log('\n3. Escalar, errores y lo que no termina bien\n');

  await check('llama a escalar: sin mensajes y con el motivo', async () => {
    guion([usar('escalar', { motivo: 'sigue lo que le dijo Fran ayer: "ahi te confirmo"' })]);
    const r = await cerebro.pensar({ chatId: chatCon('y? me confirmas?'), mensaje: 'y? me confirmas?', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.deepStrictEqual(r.mensajes, []);
    assert.strictEqual(r.motivo, 'sigue lo que le dijo Fran ayer: "ahi te confirmo"');
    assert.strictEqual(r.guardia, null);
  });

  await check('contesta con texto suelto, sin responder ni escalar: cuenta como escalar', async () => {
    guion([[texto('sii, tenemos el 13')]].map((c) => mensajeApi(c, 'end_turn'))[0]);
    const r = await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.deepStrictEqual(r.mensajes, []);
    assert.ok(/responder ni escalar/.test(r.motivo), r.motivo);
  });

  await check('5 vueltas sin terminar: escala, y no hay una sexta llamada', async () => {
    guion(...Array.from({ length: 6 }, () => [usar('buscar_equipos', { modelo: '13' })]));
    const r = await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.strictEqual(pedidos.length, 5);
  });

  await check('500 dos veces: { error }, sin tirar, con un solo reintento', async () => {
    guion({ status: 500 }, { status: 500 }, [usar('escalar', { motivo: 'no tendría que llegar' })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.ok(r.error && /500/.test(r.error), JSON.stringify(r));
    assert.strictEqual(pedidos.length, 2);
  });

  await check('un 429 y después bien: reintenta una vez y sigue', async () => {
    guion({ status: 429 }, [usar('escalar', { motivo: 'ok' })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.motivo, 'ok');
    assert.strictEqual(pedidos.length, 2);
  });

  // 03/10/2026: la batería del 03/10 dio "fetch failed" en 88 turnos seguidos desde la PC.
  const sinRed = () => {
    throw Object.assign(new TypeError('fetch failed'), { cause: { code: 'ECONNRESET' } });
  };

  await check('un error de red y después bien: reintenta una vez y sigue', async () => {
    guion(sinRed, [usar('escalar', { motivo: 'ok' })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.motivo, 'ok');
    assert.strictEqual(pedidos.length, 2);
  });

  await check('error de red dos veces: { error } con la causa (ECONNRESET), sin tirar y sin tercer intento', async () => {
    guion(sinRed, sinRed, [usar('escalar', { motivo: 'no tendría que llegar' })]);
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.ok(r.error && /fetch failed/.test(r.error) && /ECONNRESET/.test(r.error), JSON.stringify(r));
    assert.strictEqual(pedidos.length, 2);
  });

  await check('timeout: { error } a los CEREBRO_TIMEOUT_MS, sin tirar', async () => {
    const colgado = (opciones) =>
      new Promise((_, rechazar) =>
        opciones.signal.addEventListener('abort', () => rechazar(Object.assign(new Error('This operation was aborted'), { name: 'AbortError' })))
      );
    guion(colgado, colgado);
    const t0 = Date.now();
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.ok(r.error && /no respondi/i.test(r.error), JSON.stringify(r));
    assert.ok(Date.now() - t0 < 2000, 'tardó demasiado');
  });

  await check('una negativa (stop_reason refusal): escala, y el motivo lo dice', async () => {
    guion(mensajeApi([], 'refusal'));
    const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.deepStrictEqual(r.mensajes, []);
    assert.ok(/refusal/.test(r.motivo), r.motivo);
  });

  await check('sin ANTHROPIC_API_KEY: { error } y no sale ningún pedido', async () => {
    const antes = config.cerebro.apikey;
    config.cerebro.apikey = '';
    try {
      guion();
      const r = await cerebro.pensar({ chatId: chatCon('hola'), mensaje: 'hola', nombre: '' });
      assert.ok(r.error && /ANTHROPIC_API_KEY/.test(r.error), JSON.stringify(r));
      assert.strictEqual(pedidos.length, 0);
    } finally {
      config.cerebro.apikey = antes;
    }
  });

  await check('nunca tira: con un chat que explota al leerse, devuelve { error }', async () => {
    const original = state.obtener;
    state.obtener = () => {
      throw new Error('explotó');
    };
    try {
      guion();
      const r = await cerebro.pensar({ chatId: 'x@s.whatsapp.net', mensaje: 'hola', nombre: '' });
      assert.ok(r.error, JSON.stringify(r));
    } finally {
      state.obtener = original;
    }
  });

  console.log('\n4. Qué lleva cada pedido\n');

  await check('las 30 líneas marcadas, las líneas de persona y las instrucciones con cache_control', async () => {
    const chatId = nuevoChat();
    for (let i = 0; i < 34; i++) {
      if (i % 3 === 0) state.agregarAlHistorial(chatId, 'cliente', `linea ${i} del cliente`);
      else if (i % 3 === 1) state.agregarAlHistorial(chatId, 'vendedor', `linea ${i} del bot`);
      else state.agregarAlHistorial(chatId, 'vendedor', `linea ${i} de una persona`, { humano: true });
    }
    state.actualizar(chatId, { modelo: 'iPhone 13', entrega: 300000, temasExplicados: { financiacion: Date.now() } });
    guion([usar('escalar', { motivo: 'x' })]);
    await cerebro.pensar({ chatId, mensaje: 'linea 33 del cliente', nombre: '' });
    const { body, headers } = pedidos[0];

    assert.strictEqual(body.model, 'claude-sonnet-5-5');
    assert.strictEqual(headers['x-api-key'], 'clave-de-mentira');
    assert.strictEqual(headers['anthropic-version'], '2023-06-01');
    const sistema = body.system[body.system.length - 1];
    assert.deepStrictEqual(sistema.cache_control, { type: 'ephemeral' });
    assert.strictEqual(sistema.text, fs.readFileSync(path.join(__dirname, '..', 'src', 'cerebro-reglas.md'), 'utf8'));
    assert.deepStrictEqual(body.tools.map((t) => t.name).sort(), ['buscar_equipos', 'cotizar', 'escalar', 'lista_de_precios', 'que_me_alcanza', 'responder']);
    // Sonnet 5.5 no acepta tool_choice any (400): auto, y la regla de terminar con responder o escalar.
    assert.strictEqual(body.tool_choice.type, 'auto');
    assert.ok(body.tools.every((t) => t.strict === true), 'una herramienta sin strict');
    assert.deepStrictEqual(body.output_config, { effort: 'medium' });
    assert.ok(!('temperature' in body), 'Sonnet 5.5 da 400 con temperature');
    // El contexto también va con cache_control: las vueltas 2 a 5 lo leen de la caché.
    assert.deepStrictEqual(body.messages[0].content[0].cache_control, { type: 'ephemeral' });

    const pedido = body.messages[0].content.map((b) => b.text || '').join('\n');
    // Lo que ya contestó el bot (el viejo o Sonnet) va como "Vos (antes)" (Ninjo bloque 1, 05/10/2026).
    const marcadas = pedido.split('\n').filter((l) => /^\[hace [^\]]+\] (Cliente|Vos \(antes\)|Persona de la cuenta): linea \d+/.test(l));
    assert.strictEqual(marcadas.length, 30, 'no van las 30 líneas marcadas:\n' + pedido.slice(0, 600));
    assert.ok(marcadas.some((l) => / Persona de la cuenta: linea \d+ de una persona$/.test(l)));
    assert.ok(marcadas.some((l) => / Vos \(antes\): linea \d+ del bot$/.test(l)));
    assert.ok(marcadas.some((l) => / Cliente: linea \d+ del cliente$/.test(l)));
    for (const p of state.lineasDePersona(state.obtener(chatId))) {
      assert.ok(pedido.includes(`"${p.texto}"`), 'falta la línea de persona: ' + p.texto);
    }
    assert.ok(/iPhone 13/.test(pedido) && /300\.000/.test(pedido), 'no va lo que el estado ya sabe');
    assert.ok(/financiaci/i.test(pedido), 'no van los temas explicados');
    assert.ok(/Neuqu[eé]n/.test(pedido) && /\d{2}\/\d{2}\/\d{4}/.test(pedido), 'no va la fecha de Neuquén');
    assert.ok(/LISTA/.test(pedido), 'no va la lista de usados activa');
    assert.ok(pedido.includes('linea 33 del cliente'), 'no va la tanda');
    assert.ok(!pedido.includes('54900000'), 'el número del cliente salió en el pedido');
  });

  await check('el nombre del cliente no sale en el pedido (como con Gemini)', async () => {
    const chatId = chatCon('hola soy Rocio, tenes el 13?');
    guion([usar('escalar', { motivo: 'x' })]);
    await cerebro.pensar({ chatId, mensaje: 'hola soy Rocio, tenes el 13?', nombre: 'Rocio' });
    const pedido = JSON.stringify(pedidos[0].body.messages);
    assert.ok(!/roc[ií]o/i.test(pedido), 'salió el nombre');
  });

  await check('en la vuelta 2 va todo lo de la vuelta 1 sin tocar (historia solo agregada)', async () => {
    guion([usar('buscar_equipos', { modelo: '13' })], [usar('escalar', { motivo: 'x' })]);
    await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    const [a, b] = pedidos.map((p) => p.body.messages);
    assert.strictEqual(b.length, a.length + 2);
    const sinCache = (m) => JSON.parse(JSON.stringify(m, (k, v) => (k === 'cache_control' ? undefined : v)));
    assert.deepStrictEqual(sinCache(b.slice(0, a.length)), sinCache(a));
    assert.strictEqual(b[a.length].role, 'assistant');
    assert.strictEqual(b[a.length + 1].content[0].type, 'tool_result');
  });

  console.log('\n4b. Ninjo bloque 1: la entrega la lee el código (entrega_texto)\n');

  await check('cotizar pide entrega_texto: texto, obligatorio, con strict (y entrega sigue)', async () => {
    const h = cerebro.HERRAMIENTAS.find((x) => x.name === 'cotizar');
    assert.strictEqual(h.strict, true);
    assert.strictEqual(h.input_schema.properties.entrega_texto.type, 'string');
    assert.strictEqual(h.input_schema.properties.entrega.type, 'integer');
    assert.deepStrictEqual([...h.input_schema.required].sort(), ['entrega', 'entrega_texto', 'modelo']);
  });

  /** Lo que tiene que devolver `cotizar` para el 13 con esa entrega: con cotizador.cotizar y la copia congelada. */
  function esperadoDel13(entrega) {
    const cot = cotizador.cotizar(filaDel13, entrega, fixture.config);
    if (!cot.ok || cot.bajoMinimo) return { entrega, llega: false, entrega_minima: filaDel13.anticipo_min };
    if (cot.soloContado) return { entrega, llega: true, paga_de_contado: true, precio_contado: cot.contado };
    return { entrega, llega: true, un_pago: cot.pagoUnico, dos_cuotas_de: cot.cuotaDe2 };
  }
  const soloLasClaves = (r, esperado) => Object.fromEntries(Object.keys(esperado).map((k) => [k, r[k]]));

  // [frase del cliente, lo que pasa Sonnet en `entrega`, lo que tiene que leer el código]
  for (const [frase, deSonnet, leida] of [
    ['180 en efectivo y 120 por transferencia', 180000, 300000],
    ['medio palo', 1000000, 500000],
    ['tengo 400 y me estiro a 550', 550000, 400000],
    ['perdón, 500', 400000, 500000],
    // Un número solo (`montoSuelto`): Sonnet lo pasa como la frase de la entrega.
    ['500', 400000, 500000],
  ]) {
    await check(`cotizar con "${frase}": cotiza con ${cotizador.pesos(leida)} aunque Sonnet pase ${cotizador.pesos(deSonnet)}, y lo devuelve en entrega_leida`, async () => {
      const esperado = esperadoDel13(leida);
      assert.notDeepStrictEqual(esperadoDel13(deSonnet), esperado, 'el caso no prueba nada: con lo de Sonnet da lo mismo');
      const { r, error, pensado } = await probarHerramienta('cotizar', { modelo: '13', entrega: deSonnet, entrega_texto: frase });
      assert.ok(!error, JSON.stringify(r));
      assert.deepStrictEqual(soloLasClaves(r, esperado), esperado);
      assert.strictEqual(r.entrega_leida, cotizador.pesos(leida));
      assert.strictEqual(pensado.datos.entrega, leida, 'para el estado no quedó la entrega con la que se cotizó');
      assert.ok(!pensado.montosDeHerramientas.includes(deSonnet), 'la entrega de Sonnet quedó como monto válido');
    });
  }

  await check('cotizar con "tengo 420 dólares": error "monto en dólares: escalá", sin cotizar', async () => {
    const { r, error, pensado } = await probarHerramienta('cotizar', { modelo: '13', entrega: 420000, entrega_texto: 'tengo 420 dólares' });
    assert.ok(error && /monto en dólares: escalá/.test(r.error), JSON.stringify(r));
    assert.ok(!('llega' in r) && !('un_pago' in r), JSON.stringify(r));
    assert.strictEqual(pensado.datos.entrega, null);
  });

  // "tengo 90" no es una entrega (un número menor a 100, sin "mil", "k", "lucas" ni "palo"). Lo más
  // conservador: no cotiza con nada (ni con lo que pasó Sonnet) y le dice que no es una entrega.
  for (const [frase, deSonnet] of [['tengo 90', 90000], ['90', 90000], ['hasta el domingo tenia 78', 78000]]) {
    await check(`cotizar con "${frase}": no es una entrega, error y sin cotizar (ni con lo de Sonnet)`, async () => {
      const { r, error, pensado } = await probarHerramienta('cotizar', { modelo: '13', entrega: deSonnet, entrega_texto: frase });
      assert.ok(error && /no es una entrega/.test(r.error), JSON.stringify(r));
      assert.ok(!('llega' in r), JSON.stringify(r));
      assert.strictEqual(pensado.datos.entrega, null, 'quedó una entrega para el estado');
      assert.ok(!pensado.montosDeHerramientas.includes(deSonnet), 'el número chico quedó como monto válido');
    });
  }

  // Prueba en vivo del 06/10/2026: "quiero el de 85-93, tengo 250" daba "no es una entrega" (leía el 85
  // como $85.000). Los números del equipo (rango de batería, porcentaje, "al 100", la capacidad) no
  // son plata: se cotiza con la entrega de verdad, sin error y sin entregasDistintas.
  for (const [frase, entrega] of [
    ['quiero el de 85-93, tengo 250', 250000],
    ['el 80 - 95 tengo 350', 350000],
    ['quiero el de 85/93 tengo 300', 300000],
    ['el 85–93 tengo 300', 300000],
    ['el de 85 a 93 tengo 300', 300000],
    ['el de al 100, tengo 300', 300000],
    ['el de 87% de bateria tengo 300', 300000],
    ['el 13 pro max 256 tengo 600', 600000],
    ['el 14 de 128gb, tengo 380', 380000],
    ['tengo 250 para el de 85-93', 250000],
  ]) {
    await check(`cotizar con "${frase}": los números del equipo no son plata, cotiza con ${cotizador.pesos(entrega)}`, async () => {
      const { r, error, pensado } = await probarHerramienta('cotizar', { modelo: '13', entrega, entrega_texto: frase });
      assert.ok(!error, JSON.stringify(r));
      assert.deepStrictEqual(soloLasClaves(r, esperadoDel13(entrega)), esperadoDel13(entrega));
      assert.strictEqual(pensado.datos.entrega, entrega);
      assert.deepStrictEqual(pensado.entregasDistintas || [], [], 'leyó otro monto que el de Sonnet');
    });
  }

  await check('que_me_alcanza con "de los 85-93, tengo 750 que me alcanza?": lee $750.000', async () => {
    const { r, error } = await probarHerramienta('que_me_alcanza', { monto_texto: 'de los 85-93, tengo 750 que me alcanza?' });
    assert.ok(!error, JSON.stringify(r));
    assert.strictEqual(r.monto_leido, cotizador.pesos(750000), JSON.stringify(r));
  });

  await check('si el código no lee nada en entrega_texto (o no viene), cotiza con la entrega de Sonnet, como antes', async () => {
    for (const input of [{ modelo: '13', entrega: 340000, entrega_texto: 'con eso' }, { modelo: '13', entrega: 340000, entrega_texto: '' }, { modelo: '13', entrega: 340000 }]) {
      const { r, error, pensado } = await probarHerramienta('cotizar', input);
      assert.ok(!error, JSON.stringify(r));
      assert.deepStrictEqual(soloLasClaves(r, esperadoDel13(340000)), esperadoDel13(340000));
      assert.ok(!('entrega_leida' in r), 'no leyó nada: no va entrega_leida');
      assert.deepStrictEqual(pensado.entregasDistintas || [], []);
    }
  });

  await check('"tengo 1.5 palos": el extractor lo lee mal ($5.000.000), así que no lo lee el código y queda lo de Sonnet', async () => {
    assert.strictEqual(require('../src/extractor-local').extraerMonto('tengo 1.5 palos'), 5000000, 'el caso no prueba nada: el extractor ya lo lee bien');
    const { r, error } = await probarHerramienta('cotizar', { modelo: '13', entrega: 1500000, entrega_texto: 'tengo 1.5 palos' });
    assert.ok(!error, JSON.stringify(r));
    assert.strictEqual(r.entrega, 1500000);
    assert.ok(!('entrega_leida' in r), JSON.stringify(r));
  });

  await check('si no coinciden, quedan las dos (entregasDistintas); si coinciden, nada', async () => {
    const pesos = cotizador.pesos;
    const cot = cotizador.cotizar(filaDel13, 350000, fixture.config);
    const frase = '200 en efectivo y 150 por transferencia';
    guion(
      [usar('cotizar', { modelo: '13', entrega: 200000, entrega_texto: frase })],
      [usar('responder', { mensajes: ['dale, con $350.000 de entrega llegamos al 13', '[cotizacion]'] })]
    );
    const r = await cerebro.pensar({ chatId: chatCon(`quiero el 13, tengo ${frase}`), mensaje: `quiero el 13, tengo ${frase}`, nombre: '' });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.ok(r.mensajes[1].includes(`· 1 cuota de ${pesos(cot.pagoUnico)}`), 'el bloque no es el de los $350.000: ' + r.mensajes[1]);
    assert.strictEqual(r.datos.entrega, 350000);
    assert.deepStrictEqual(r.entregasDistintas, [{ modelo: 'iPhone 13', entrega_texto: frase, entrega_sonnet: 200000, entrega_leida: 350000 }]);
    guion([usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'tengo 340 mil' })], [usar('escalar', { motivo: 'x' })]);
    const igual = await cerebro.pensar({ chatId: chatCon('el 13, tengo 340 mil'), mensaje: 'el 13, tengo 340 mil', nombre: '' });
    assert.deepStrictEqual(igual.entregasDistintas || [], []);
    assert.strictEqual(igual.datos.entrega, 340000);
  });

  console.log('\n4c. Ninjo bloque 1: la guardia frena lo interno y la promesa de un archivo que no va\n');

  const motivoDeGuardia = (mensajes, opciones) => cerebro.revisarSalida(mensajes, [], opciones).guardia || '';

  await check('frena un mensaje que nombra algo interno, sin tildes ni mayúsculas', async () => {
    for (const t of [
      'lo busco con buscar_equipos',
      'segun LISTA_DE_PRECIOS',
      'uso cotizar(13)',
      'te da paga_de_contado',
      'llega: false',
      'la entrega_minima es esa',
      'pasame la entrega_texto',
      'te paso con_esa_entrega',
      'lo dice El Sistema',
      'en la planilla figura asi',
      'segun el historial ya te lo dije',
      'la herramienta no me lo da',
      'eso lo dijo la persona de la cuenta',
      'esto lo escalo',
      'lo tengo que escalar',
      'ya lo escalé',
      'quedo escalado',
    ]) {
      const g = motivoDeGuardia([t]);
      assert.ok(/^nombra algo interno: /.test(g), `no frenó "${t}": ${g}`);
    }
  });

  await check('no frena lo que solo se parece (límites de palabra)', async () => {
    for (const t of ['te lo cotizo ahora', 'cotizar el 13 es facil', 'cuidado con el escalon de la entrada', 'los sistemas de cuotas', 'llega bien']) {
      assert.strictEqual(motivoDeGuardia([t]), '', t);
    }
  });

  await check('frena la promesa de un archivo que no va (fotos, video, pdf, archivo, ubicación, link, el compromiso sin PDF)', async () => {
    for (const t of [
      'te mando unas fotos del 13',
      'ahi van las fotos',
      'Ahí va el video',
      'te paso la ubicación del local',
      'te envío el link',
      'te paso el pdf',
      'te mando el archivo',
      'te paso el compromiso de pago',
    ]) {
      const g = motivoDeGuardia([t]);
      assert.ok(/^promete un archivo que no va: /.test(g), `no frenó "${t}": ${g}`);
    }
  });

  await check('no frena "te paso los numeros", "te paso el 13 y el 14" ni el compromiso cuando va el PDF (con el bloque); las fotos no van nunca', async () => {
    assert.strictEqual(motivoDeGuardia(['te paso los numeros']), '');
    assert.strictEqual(motivoDeGuardia(['te paso el 13 y el 14']), '');
    const conBloque = { adjunto: true, bloques: [{ modelo: 'iPhone 13', texto: 'EL BLOQUE' }] };
    assert.strictEqual(motivoDeGuardia(['[cotizacion]', 'te paso el compromiso de pago'], conBloque), '');
    assert.strictEqual(motivoDeGuardia(['[cotizacion]', 'ahi va el pdf del compromiso'], conBloque), '');
    // Bloque Ninjo 1b: sin el bloque no va el PDF, aunque todavía no haya salido.
    assert.ok(/promete un archivo que no va/.test(motivoDeGuardia(['te paso el compromiso de pago'], { adjunto: true })));
    assert.ok(/promete un archivo que no va/.test(motivoDeGuardia(['[cotizacion]', 'te mando las fotos del 13'], conBloque)));
  });

  await check('pensar: con el bloque y el PDF sin mandar, "te paso el compromiso de pago" sale; sin bloque, o con el PDF ya mandado, frena', async () => {
    const cotiza = () => [usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'tengo 340 mil' })];
    const respuesta = () => [usar('responder', { mensajes: ['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]', 'te paso el compromiso de pago'] })];
    guion(cotiza(), respuesta());
    const conPdf = await cerebro.pensar({ chatId: chatCon('el 13, tengo 340 mil'), mensaje: 'el 13, tengo 340 mil', nombre: '' });
    assert.strictEqual(conPdf.guardia, null, conPdf.guardia);
    assert.strictEqual(conPdf.compromisoDePago, true);
    const sinBloque = () => [usar('responder', { mensajes: ['es con tu dni y un compromiso de pago', 'te paso el compromiso de pago'] })];
    guion(sinBloque(), sinBloque());
    const explica = await cerebro.pensar({ chatId: chatCon('como son las cuotas?'), mensaje: 'como son las cuotas?', nombre: '' });
    assert.strictEqual(explica.escalar, true, 'explicar la financiación ya no lleva el PDF: no puede prometerlo');
    assert.ok(/promete un archivo que no va/.test(explica.guardia || ''), explica.guardia);
    const yaSalio = chatCon('el 13, tengo 340 mil');
    state.actualizar(yaSalio, { compromisoEnviado: true });
    guion(cotiza(), respuesta(), respuesta());
    const r = await cerebro.pensar({ chatId: yaSalio, mensaje: 'el 13, tengo 340 mil', nombre: '' });
    assert.strictEqual(r.escalar, true);
    assert.ok(/promete un archivo que no va/.test(r.guardia || ''), r.guardia);
    assert.ok(/promete un archivo que no va/.test(r.corregida.guardia), 'no tuvo la vuelta para corregir');
  });

  console.log('\n4d. Ninjo bloque 1: más de 4 mensajes se juntan en el cuarto\n');

  await check('6 mensajes: del cuarto en adelante van juntos en el cuarto, separados por salto de línea', async () => {
    const r = cerebro.revisarSalida(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'], []);
    assert.strictEqual(r.guardia, null);
    assert.deepStrictEqual(r.mensajes, ['uno', 'dos', 'tres', 'cuatro\ncinco\nseis']);
  });

  await check('si el cuarto, ya juntado, pasa los 300 caracteres, frena como siempre', async () => {
    const r = cerebro.revisarSalida(['uno', 'dos', 'tres', 'a'.repeat(150), 'b'.repeat(150)], []);
    assert.ok(/un mensaje de 301 caracteres/.test(r.guardia || ''), r.guardia);
    assert.strictEqual(r.frenados.length, 5);
  });

  console.log('\n4e. Ninjo bloque 1: lo que delata a una IA, limpio\n');

  await check('rayas, ¿ y ¡, **negrita**, viñetas y títulos: limpios, sin tocar los montos ni el 📱', async () => {
    const r = cerebro.revisarSalida(
      [
        '¿tenés el 13? ¡joya!',
        'el 13 — 128gb – al 100%, bateria 85–93%',
        'es **sellado**, sale $495.000',
        '- el 13\n• el 14\n* el 15\n# precios\n## todos\n📱 iPhone 13 128GB 100%: $495.000',
      ],
      [495000]
    );
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.deepStrictEqual(r.mensajes, [
      'tenés el 13? joya!',
      'el 13, 128gb, al 100%, bateria 85-93%',
      'es *sellado*, sale $495.000',
      'el 13\nel 14\nel 15\nprecios\ntodos\n📱 iPhone 13 128GB 100%: $495.000',
    ]);
  });

  await check('la raya no deja ", ," ni dobles espacios, ni una coma al principio o al final', async () => {
    const r = cerebro.revisarSalida(['sii, — tenemos el 13 —', '— el 14 tambien', 'el 15  —  el 16', 'mira ¿ te sirve?'], []);
    assert.deepStrictEqual(r.mensajes, ['sii, tenemos el 13', 'el 14 tambien', 'el 15, el 16', 'mira te sirve?']);
  });

  await check('frena un tab u otro caracter raro adentro del texto ("si quer\\té s seguimos", prueba en vivo del 06/10); el emoji compuesto y el salto de línea pasan', async () => {
    for (const t of ['si quer\té s seguimos con el 13', 'dale\u0000 joya', 'el 13\u200B lo tenemos', 'te lo \uFFFD reservo']) {
      const g = motivoDeGuardia([t]);
      assert.ok(/^caracter que no va en WhatsApp: /.test(g), `no frenó ${JSON.stringify(t)}: ${g}`);
    }
    assert.ok(/un tab en "si quer·é s seguim/.test(motivoDeGuardia(['si quer\té s seguimos con el 13'])), motivoDeGuardia(['si quer\té s seguimos con el 13']));
    for (const t of ['dale joya 👨\u200D👩\u200D👧', 'iPhone 13 📱\nla segunda linea', 'genial ❤️']) {
      assert.strictEqual(motivoDeGuardia([t]), '', `frenó ${JSON.stringify(t)}`);
    }
  });

  console.log('\n4f. Ninjo bloque 1: las etiquetas del historial, los audios y las reglas\n');

  await check('el historial dice "Vos (antes)" (no "Bot") y "Cliente (audio)"; si lo de ahora vino por audio, el pedido lo dice', async () => {
    const chatId = nuevoChat();
    state.agregarAlHistorial(chatId, 'cliente', 'hola');
    state.agregarAlHistorial(chatId, 'vendedor', 'contame que modelo buscabas');
    state.agregarAlHistorial(chatId, 'cliente', 'el trece pro con cuatrocientos');
    state.obtener(chatId).historial[2].audio = true;
    guion([usar('escalar', { motivo: 'x' })]);
    await cerebro.pensar({ chatId, mensaje: 'el trece pro con cuatrocientos', nombre: '', audio: true });
    const pedido = pedidos[0].body.messages[0].content[0].text;
    assert.ok(/\] Vos \(antes\): contame que modelo buscabas$/m.test(pedido), pedido);
    assert.ok(/\] Cliente: hola$/m.test(pedido), pedido);
    assert.ok(/\] Cliente \(audio\): el trece pro con cuatrocientos$/m.test(pedido), pedido);
    assert.ok(!/\] Bot: /.test(pedido), 'sigue la etiqueta "Bot"');
    const ahora = (p) => p.slice(p.lastIndexOf('\n\n') + 2).split('\n')[0];
    assert.ok(/audio/.test(ahora(pedido)), 'el pedido no dice que lo de ahora vino por audio: ' + ahora(pedido));
    guion([usar('escalar', { motivo: 'x' })]);
    await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    assert.ok(!/audio/.test(ahora(pedidos[0].body.messages[0].content[0].text)), 'sin audio, el pedido no lo dice');
  });

  await check('las reglas: el objetivo, el contado y la aceptación con el turno, entrega_texto, la razón de escalar, "Vos (antes)", el audio y los datos fijos nuevos', async () => {
    const reglas = cerebro.REGLAS;
    const responder = require('../src/responder');
    for (const re of [
      /saque turno para venir a retirarlo/,
      /qué día te podés acercar/,
      /dale, me lo llevo/,
      /`entrega_texto`: la cuenta la hace el sistema\. Vos nunca sumás\./,
      /Ante la duda, escalá: es mejor que una respuesta equivocada\. Pero escalar deja al cliente esperando a una persona, así que no escales lo que estas reglas ya contestan\./,
      /Vos \(antes\) es lo que ya le contestaste; Persona de la cuenta es Tomás o Fran escribiendo a mano/,
      /si vino por audio, un monto o un modelo raro puede ser un error de la transcripción: si no cierra, preguntá/,
      /Una respuesta tiene como mucho 5 vueltas/,
    ]) {
      assert.ok(re.test(reglas), 'las reglas no dicen ' + re);
    }
    assert.ok(reglas.includes(responder.DATOS_FIJOS.importados), 'falta el origen de los equipos');
    // La primera variante de `requisitosContado` (estilo.js).
    assert.ok(reglas.includes('de contado no necesitas nada, solo venir'), 'falta lo de los papeles de contado');
    for (const viejo of [/Escalar no le cuesta nada al cliente/, /Un turno tiene como mucho 5 vueltas/, /\bBot\b/]) {
      assert.ok(!viejo.test(reglas), 'las reglas siguen diciendo ' + viejo);
    }
  });

  console.log('\n4e. Bloque Ninjo 1b: el bloque de la cotización, la lista, las dos listas de usados, los parecidos y que_me_alcanza\n');

  const pesosB = cotizador.pesos;
  const bloque13 = cotizador.bloqueSonnet(filaDel13, cot13);

  await check('el bloque (cotizador.bloqueSonnet): encabezado con modelo, capacidad, batería y 📱, la entrega, 1 cuota, 2 cuotas y la frase de cierre tal cual, con los montos de cotizador.cotizar', async () => {
    assert.strictEqual(
      bloque13,
      [
        'iPhone 13 128GB 100% 📱',
        `Haciendo una entrega de ${pesosB(340000)} te quedarían:`,
        `· 1 cuota de ${pesosB(cot13.pagoUnico)}`,
        `· o 2 cuotas de ${pesosB(cot13.cuotaDe2)} cada una`,
        'Este mes abonás solo la entrega. Las cuotas arrancan el mes que viene',
      ].join('\n')
    );
    const sellado = fixture.lista.find((f) => f.modelo === 'iPhone 17');
    const cot17 = cotizador.cotizar(sellado, 1000000, fixture.config);
    assert.ok(cotizador.bloqueSonnet(sellado, cot17).startsWith('iPhone 17 128GB sellado 📱\n'), 'el sellado no dice "sellado"');
    const rango = { ...filaDel13, bateria_texto: '85-93' };
    assert.ok(cotizador.bloqueSonnet(rango, cot13).startsWith('iPhone 13 128GB 85-93% 📱\n'), 'la batería no va como viene de la planilla');
  });

  await check('[cotizacion] se reemplaza por el bloque (con mayúscula o tilde también); varios modelos van en el mismo mensaje, separados por un renglón en blanco', async () => {
    const otro = { modelo: 'iPhone 15', texto: 'BLOQUE DEL 15' };
    const r = cerebro.revisarSalida(['con esa entrega te queda asi', '[Cotización]', 'cual te cierra mas?'], [], { bloques: [{ modelo: 'iPhone 13', texto: bloque13 }, otro] });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.deepStrictEqual(r.mensajes, ['con esa entrega te queda asi', `${bloque13}\n\nBLOQUE DEL 15`, 'cual te cierra mas?']);
    assert.deepStrictEqual(r.escritos, ['con esa entrega te queda asi', '[Cotización]', 'cual te cierra mas?']);
    assert.strictEqual(r.conBloque, true);
  });

  await check('la guardia frena [cotizacion] sin un cotizar con 1 pago y 2 cuotas en esa respuesta', async () => {
    const g = motivoDeGuardia(['dale', '[cotizacion]']);
    assert.ok(/\[cotizacion\] sin un cotizar/.test(g), g);
  });

  await check('la guardia frena la cotización escrita a mano ("1 pago de $X", "1 cuota de", "2 cuotas de", "2 pagos de", "dos cuotas de"): va en el bloque', async () => {
    const montos = [cot13.pagoUnico, cot13.cuotaDe2];
    for (const t of [
      `te queda 1 pago de ${pesosB(cot13.pagoUnico)}`,
      `o 2 pagos de ${pesosB(cot13.cuotaDe2)} cada uno`,
      `1 cuota de ${pesosB(cot13.pagoUnico)}`,
      `en 2 cuotas de ${pesosB(cot13.cuotaDe2)}`,
      `dos cuotas de ${pesosB(cot13.cuotaDe2)}`,
      `un pago de $${String(cot13.pagoUnico).replace(/\B(?=(\d{3})+$)/g, '.')}`,
    ]) {
      const g = cerebro.revisarSalida([t], montos).guardia || '';
      assert.ok(/la cotización va en el bloque/.test(g), `no frenó "${t}": ${g}`);
    }
  });

  await check('no frena lo que no es la cotización a mano: "1 o 2 cuotas", "en 2 cuotas", "hasta en 2 cuotas con una entrega", "2 cuotas" sin monto', async () => {
    for (const t of ['lo financiamos en 1 o 2 cuotas', 'en 2 cuotas sin tarjeta', 'hasta en 2 cuotas con una entrega inicial', 'las 2 cuotas arrancan el mes que viene', 'es 1 pago o 2 cuotas']) {
      assert.strictEqual(motivoDeGuardia([t]), '', t);
    }
  });

  await check('el bloque no cuenta para los 300 caracteres pero sí para el tope de 4 mensajes', async () => {
    const largo = { modelo: 'iPhone 13', texto: 'x'.repeat(400) };
    const r = cerebro.revisarSalida(['uno', '[cotizacion]', 'tres', 'cuatro'], [], { bloques: [largo] });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.strictEqual(r.mensajes.length, 4);
    const cinco = cerebro.revisarSalida(['uno', 'dos', 'tres', 'cuatro', '[cotizacion]'], [], { bloques: [largo] });
    assert.strictEqual(cinco.guardia, null, cinco.guardia);
    assert.deepStrictEqual(cinco.mensajes.slice(0, 3), ['uno', 'dos', 'tres']);
    assert.strictEqual(cinco.mensajes[3], `cuatro\n${'x'.repeat(400)}`, 'el quinto no se juntó en el cuarto');
  });

  await check('[lista]: dos mensajes tal cual (usados y sellados), sin el tope de 300; sin lista_de_precios frena; si con la lista pasan de 4, frena', async () => {
    const lista = { usados: 'Ip 13 128gb 100% 495.000\n' + 'Ip 14 128gb 80% 540.000\n'.repeat(20).trim(), sellados: 'Ip 17 128gb sellado 1.600.000' };
    const r = cerebro.revisarSalida(['te paso la lista', '[lista]', 'cual te interesa?'], [], { lista });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.deepStrictEqual(r.mensajes, ['te paso la lista', lista.usados, lista.sellados, 'cual te interesa?']);
    assert.ok(/\[lista\] sin llamar a lista_de_precios/.test(motivoDeGuardia(['[lista]'])));
    const muchos = cerebro.revisarSalida(['uno', '[lista]', 'tres', 'cuatro'], [], { lista });
    assert.ok(/con \[lista\] van 2 mensajes de la lista y el tope es 4/.test(muchos.guardia || ''), muchos.guardia);
  });

  await check('el pedido dice las dos listas de usados con #bateria; sin #bateria, como antes', async () => {
    sheets.usarListaBateria('85-93');
    try {
      guion([usar('escalar', { motivo: 'x' })]);
      await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
      assert.ok(pedidos[0].body.messages[0].content[0].text.includes('Listas de usados: la activa (#bateria) es LISTA 85-93. También podés ofrecer la de LISTA (al 100%)'));
    } finally {
      sheets.usarListaBateria(null);
    }
    guion([usar('escalar', { motivo: 'x' })]);
    await cerebro.pensar({ chatId: chatCon('tenes el 13?'), mensaje: 'tenes el 13?', nombre: '' });
    assert.ok(pedidos[0].body.messages[0].content[0].text.includes('Lista de usados activa (#bateria): LISTA (usados al 100%)'));
  });

  await check('buscar_equipos con LISTA 85-93: `al_100` con la fila de LISTA del mismo modelo (y sus montos valen); un modelo sin fila al 100%, vacío; con LISTA activa, no va', async () => {
    sheets.usarListaBateria('85-93');
    try {
      const { r, pensado } = await probarHerramienta('buscar_equipos', { modelo: '13' });
      assert.deepStrictEqual(r.equipos.map((e) => [e.bateria, e.precio_contado]), [['85-93%', 450000]]);
      assert.deepStrictEqual(r.al_100.map((e) => [e.bateria, e.precio_contado, e.entrega_minima]), [['100%', 495000, 320000]]);
      for (const m of [495000, 320000]) assert.ok(pensado.montosDeHerramientas.includes(m), `${m} no vale`);
      const plus = await probarHerramienta('buscar_equipos', { modelo: '14 plus' });
      assert.deepStrictEqual(plus.r.al_100, []);
    } finally {
      sheets.usarListaBateria(null);
    }
    const { r } = await probarHerramienta('buscar_equipos', { modelo: '13' });
    assert.ok(!('al_100' in r), 'con LISTA activa no va al_100');
  });

  await check('cotizar con al_100: cotiza la fila de LISTA (con los montos de cotizador.cotizar); sin #bateria, error', async () => {
    sheets.usarListaBateria('85-93');
    try {
      const { r } = await probarHerramienta('cotizar', { modelo: '13', entrega: 350000, entrega_texto: 'tengo 350 mil', al_100: true });
      const cot = cotizador.cotizar(filaDel13, 350000, fixture.config);
      assert.deepStrictEqual([r.bateria, r.un_pago, r.dos_cuotas_de], ['100%', cot.pagoUnico, cot.cuotaDe2]);
      const activa = await probarHerramienta('cotizar', { modelo: '13', entrega: 350000, entrega_texto: 'tengo 350 mil' });
      assert.strictEqual(activa.r.bateria, '85-93%', 'sin al_100 no cotiza la activa');
      const sinFila = await probarHerramienta('cotizar', { modelo: '14 plus', entrega: 450000, entrega_texto: '450 mil', al_100: true });
      assert.ok(sinFila.error && /no hay al 100%/.test(sinFila.r.error), JSON.stringify(sinFila.r));
    } finally {
      sheets.usarListaBateria(null);
    }
    const sinBateria = await probarHerramienta('cotizar', { modelo: '13', entrega: 350000, entrega_texto: 'tengo 350 mil', al_100: true });
    assert.ok(sinBateria.error && /ya es LISTA/.test(sinBateria.r.error), JSON.stringify(sinBateria.r));
  });

  await check('buscar_equipos de un modelo del 11 al 18 que no hay: `parecidos` (otra variante del mismo número, o el de abajo y el de arriba), hasta 2, con su contado (vale)', async () => {
    const promax = await probarHerramienta('buscar_equipos', { modelo: '15 pro max' });
    assert.deepStrictEqual(promax.r.equipos, []);
    assert.deepStrictEqual(promax.r.parecidos.map((e) => [e.modelo, e.precio_contado]), [['iPhone 15 Pro', 920000], ['iPhone 15', 740000]]);
    assert.ok(promax.pensado.montosDeHerramientas.includes(920000));
    const dieciocho = await probarHerramienta('buscar_equipos', { modelo: '18 pro' });
    assert.deepStrictEqual(dieciocho.r.parecidos.map((e) => e.modelo), ['iPhone 17 Pro']);
    const doce = await probarHerramienta('buscar_equipos', { modelo: '12 pro' });
    assert.deepStrictEqual(doce.r.parecidos.map((e) => e.modelo), ['iPhone 12'], 'el mismo número primero');
    for (const fuera of ['19', 'x', '10']) {
      const { r } = await probarHerramienta('buscar_equipos', { modelo: fuera });
      assert.ok(!r.parecidos, `"${fuera}" trajo parecidos`);
    }
  });

  await check('que_me_alcanza("q iphone me alcanza con 750.000"): los 2 más caros de contado y los 2 más caros que retira con esa entrega; el monto leído vale', async () => {
    const { r, pensado } = await probarHerramienta('que_me_alcanza', { monto_texto: 'q iphone me alcanza con 750.000' });
    assert.strictEqual(r.monto_leido, pesosB(750000));
    assert.deepStrictEqual(r.de_contado.map((e) => [e.modelo, e.precio_contado]), [['iPhone 15', 740000], ['iPhone 13 Pro', 695000]]);
    assert.deepStrictEqual(r.con_entrega.map((e) => [e.modelo, e.precio_contado, e.entrega_minima]), [['iPhone 16', 1050000, 670000], ['iPhone 15 Pro', 920000, 530000]]);
    for (const m of [750000, 740000, 670000, 1050000]) assert.ok(pensado.montosDeHerramientas.includes(m), `${m} no vale`);
    // Con $2.000.000 el 17 Pro (1.970.000) se paga de contado: no va en con_entrega.
    const alto = await probarHerramienta('que_me_alcanza', { monto_texto: 'tengo 2.000.000' });
    assert.deepStrictEqual(alto.r.con_entrega.map((e) => e.modelo), ['iPhone 17 Pro Max']);
    assert.deepStrictEqual(alto.r.de_contado.map((e) => e.modelo), ['iPhone 17 Pro', 'iPhone 17']);
    const dolares = await probarHerramienta('que_me_alcanza', { monto_texto: 'tengo 500 dolares' });
    assert.ok(dolares.error && /dólares/.test(dolares.r.error), JSON.stringify(dolares.r));
    const chico = await probarHerramienta('que_me_alcanza', { monto_texto: 'tengo 90' });
    assert.ok(chico.error, JSON.stringify(chico.r));
    const sinMonto = await probarHerramienta('que_me_alcanza', { monto_texto: 'que me alcanza?' });
    assert.ok(sinMonto.error && /preguntale con cuánto cuenta/.test(sinMonto.r.error), JSON.stringify(sinMonto.r));
  });

  await check('responder con aviso_grupo: pensar lo devuelve y comoResultado lo pasa al resultado (sin callar el chat)', async () => {
    guion([usar('buscar_equipos', { modelo: '18' })], [usar('responder', { mensajes: ['justo ese no me esta quedando, tengo el 17 sellado en $1.600.000'], aviso_grupo: '  pidió el 18   y no está ' })]);
    const chatId = chatCon('tenes el 18?');
    const r = await cerebro.pensar({ chatId, mensaje: 'tenes el 18?', nombre: '' });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.strictEqual(r.avisoGrupo, 'pidió el 18 y no está');
    const res = cerebro.comoResultado(chatId, r, { mensaje: 'tenes el 18?' });
    assert.strictEqual(res.avisoGrupo, 'pidió el 18 y no está');
    assert.strictEqual(res.escalar, false);
  });

  await check('leidosTexto: "(N de Evolution)" cuando hay, y el pedido cuenta las líneas que trajo Evolution', async () => {
    assert.strictEqual(cerebro.leidosTexto({ historial: 30, evolution: 18, persona: 2 }), '30 mensajes de contexto (18 de Evolution) (+2 de una persona)');
    assert.strictEqual(cerebro.leidosTexto({ historial: 3, persona: 0, evolution: 0 }), '3 mensajes de contexto');
    const chatId = nuevoChat();
    state.completarHistorial(chatId, [
      { quien: 'cliente', texto: 'de evolution', ts: Date.now() - 60000, evolution: true },
      { quien: 'cliente', texto: 'hola', ts: Date.now() },
    ]);
    guion([usar('escalar', { motivo: 'x' })]);
    const r = await cerebro.pensar({ chatId, mensaje: 'hola', nombre: '' });
    assert.deepStrictEqual(r.leidos, { historial: 2, persona: 0, evolution: 1 });
  });

  await check('cotizacionEnLaUltimaTanda reconoce el bloque (por "2 cuotas de"), como el 📱 del bot', async () => {
    const h = [
      { quien: 'cliente', texto: 'el 13 con 340', ts: 1 },
      { quien: 'vendedor', texto: 'dale, con $340.000 de entrega llegamos al 13', ts: 2 },
      { quien: 'vendedor', texto: bloque13, ts: 3 },
      { quien: 'vendedor', texto: 'cual te cierra mas?', ts: 4 },
      { quien: 'cliente', texto: 'dale', ts: 5 },
    ];
    assert.strictEqual(cerebro.cotizacionEnLaUltimaTanda(h), true);
    assert.strictEqual(cerebro.cotizacionEnLaUltimaTanda(h.filter((l) => l.ts !== 3)), false, 'sin el bloque también da true');
  });

  console.log('\n4g. Entrega baja, paso 3 (decisión de Tomás del 06/10/2026): la excepción y lo que sí se lleva\n');

  /** `cotizar` del 13 en un chat al que ya se le dijo `veces` veces la entrega inicial del 13. */
  async function cotizarInsistido(veces, entrega, input = {}) {
    const frase = `el 13, tengo ${entrega / 1000}`;
    const chatId = chatCon(frase);
    if (veces) state.actualizar(chatId, { insistenciaEntrega: { 'iPhone 13': veces } });
    guion([usar('cotizar', { modelo: '13', entrega, entrega_texto: frase, ...input })], [usar('escalar', { motivo: 'x' })]);
    const pensado = await cerebro.pensar({ chatId, mensaje: frase, nombre: '' });
    const bloque = pedidos[1].body.messages[pedidos[1].body.messages.length - 1].content[0];
    return { r: JSON.parse(bloque.content), error: Boolean(bloque.is_error), pensado, chatId };
  }
  const minimo13 = filaDel13.anticipo_min;
  const sinResta = (r) => assert.ok(!('falta' in r) && !('saldo' in r) && !('diferencia' in r), 'la herramienta devuelve una resta: ' + JSON.stringify(r));
  const sinCuotas = (r) => assert.ok(!('un_pago' in r) && !('dos_cuotas_de' in r) && !('excepcion' in r), 'cotizó: ' + JSON.stringify(r));

  for (const veces of [0, 1]) {
    await check(`con ${veces} insistencia(s) y a $20.000 del mínimo: llega: false con la entrega mínima, como siempre (sin la excepción)`, async () => {
      const cot = cotizador.cotizar(filaDel13, minimo13 - 20000, fixture.config);
      assert.ok(cot.ok && cot.bajoMinimo, 'el caso no prueba nada: el cotizador no da bajoMinimo');
      const { r, error, pensado } = await cotizarInsistido(veces, minimo13 - 20000);
      assert.ok(!error, JSON.stringify(r));
      assert.strictEqual(r.llega, false);
      assert.strictEqual(r.entrega_minima, minimo13);
      assert.strictEqual(r.precio_contado, filaDel13.precio_contado);
      sinCuotas(r);
      sinResta(r);
      assert.ok(!('con_esa_entrega' in r), 'antes del paso 3 no van las alternativas');
      assert.deepStrictEqual(pensado.datos.noLlega, ['iPhone 13'], 'la insistencia tiene que sumar');
      assert.ok(!pensado.montosDeHerramientas.includes(cot.pagoUnico), 'el monto de la excepción quedó como válido');
    });
  }

  await check('con 2 insistencias y a $20.000 del mínimo: llega: true, excepcion: true, 1 pago y 2 cuotas de la excepción (cotizador.cotizar con bajoMinimo) y el bloque; los montos valen', async () => {
    const entrega = minimo13 - 20000;
    const cot = cotizador.cotizar(filaDel13, entrega, fixture.config);
    assert.ok(cot.ok && cot.bajoMinimo, 'el caso no prueba nada');
    // Son los de la excepción (los coeficientes de bajo mínimo), no los del plan de siempre.
    const sinExcepcion = cotizador.cotizar(filaDel13, entrega, { ...fixture.config, coef1Bajo: fixture.config.coef1, coef2Bajo: fixture.config.coef2 });
    assert.ok(cot.pagoUnico > sinExcepcion.pagoUnico && cot.cuotaDe2 > sinExcepcion.cuotaDe2, 'la excepción no recarga nada');
    const { r, error, pensado } = await cotizarInsistido(2, entrega);
    assert.ok(!error, JSON.stringify(r));
    assert.strictEqual(r.llega, true);
    assert.strictEqual(r.excepcion, true);
    assert.strictEqual(r.un_pago, cot.pagoUnico);
    assert.strictEqual(r.dos_cuotas_de, cot.cuotaDe2);
    assert.strictEqual(r.precio_contado, filaDel13.precio_contado, 'el contado no cambia');
    assert.ok(/excepci/i.test(r.nota) && !/recargo/i.test(r.nota.replace(/sin nombrar recargo/, '')), r.nota);
    sinResta(r);
    assert.ok(!('con_esa_entrega' in r));
    for (const m of [cot.pagoUnico, cot.cuotaDe2, entrega]) assert.ok(pensado.montosDeHerramientas.includes(m), `${m} no vale`);
    assert.ok(!pensado.montosDeHerramientas.includes(sinExcepcion.pagoUnico), 'el monto del plan de siempre quedó como válido');
    assert.deepStrictEqual(pensado.datos.noLlega, [], 'con la excepción llega: la insistencia no suma');
    assert.strictEqual(pensado.datos.entrega, entrega);
  });

  await check('con 2 insistencias y a $45.000 justos del mínimo: excepcion: true (el tope entra)', async () => {
    const entrega = minimo13 - cotizador.TOPE_BAJO_MINIMO;
    const cot = cotizador.cotizar(filaDel13, entrega, fixture.config);
    assert.ok(cot.ok && cot.bajoMinimo, 'el caso no prueba nada');
    const { r, error } = await cotizarInsistido(2, entrega);
    assert.ok(!error, JSON.stringify(r));
    assert.deepStrictEqual([r.llega, r.excepcion, r.un_pago, r.dos_cuotas_de], [true, true, cot.pagoUnico, cot.cuotaDe2]);
  });

  await check('con 2 insistencias y a $46.000 del mínimo: llega: false y con_esa_entrega (hasta 2 de otro modelo que retira con esa entrega, los más caros primero, con contado y entrega mínima); los montos valen', async () => {
    const entrega = minimo13 - cotizador.TOPE_BAJO_MINIMO - 1000;
    const cot = cotizador.cotizar(filaDel13, entrega, fixture.config);
    assert.ok(!cot.ok && cot.motivo === 'ENTREGA_BAJA', 'el caso no prueba nada');
    const { r, error, pensado } = await cotizarInsistido(2, entrega);
    assert.ok(!error, JSON.stringify(r));
    assert.strictEqual(r.llega, false);
    assert.strictEqual(r.entrega_minima, minimo13);
    sinCuotas(r);
    sinResta(r);
    // Con la copia congelada: el 12 (entrega mínima 250.000) y el 11 de 128 (200.000); el 11 de 64 sale 260.000, menos que la entrega: no.
    assert.deepStrictEqual(
      r.con_esa_entrega.map((e) => [e.modelo, e.capacidad_gb, e.bateria, e.precio_contado, e.entrega_minima]),
      [['iPhone 12', 64, '87%', 380000, 250000], ['iPhone 11', 128, '91%', 310000, 200000]]
    );
    assert.ok(r.con_esa_entrega.every((e) => e.entrega_minima <= entrega && e.precio_contado > entrega && e.modelo !== 'iPhone 13'));
    for (const m of [380000, 250000, 310000, 200000, entrega, minimo13]) assert.ok(pensado.montosDeHerramientas.includes(m), `${m} no vale`);
    assert.ok(pensado.datos.precios.some((p) => p.modelo === 'iPhone 12' && p.precio === 380000), 'el 12 no cuenta como mostrado si sale su precio');
    assert.deepStrictEqual(pensado.datos.noLlega, ['iPhone 13']);
    // Y es lo mismo que `con_entrega` de que_me_alcanza con ese monto, sin el 13.
    const alcanza = await probarHerramienta('que_me_alcanza', { monto_texto: `tengo ${entrega / 1000}` });
    assert.deepStrictEqual(alcanza.r.con_entrega.filter((e) => e.modelo !== 'iPhone 13'), r.con_esa_entrega);
  });

  await check('con 2 insistencias y menos que la entrega mínima más barata: con_esa_entrega vacío (y la nota dice que escale)', async () => {
    const vendibles = [...fixture.lista, ...fixture.usados].filter((f) => f.cotizable && f.precio_contado > 0 && !/xr/i.test(f.modelo));
    const masBarata = Math.min(...vendibles.map((f) => f.anticipo_min));
    const entrega = masBarata - 20000;
    assert.ok(entrega > 0 && minimo13 - entrega > cotizador.TOPE_BAJO_MINIMO, 'el caso no prueba nada');
    const { r, error, pensado } = await cotizarInsistido(2, entrega);
    assert.ok(!error, JSON.stringify(r));
    assert.strictEqual(r.llega, false);
    assert.deepStrictEqual(r.con_esa_entrega, []);
    assert.ok(/escal/.test(r.nota), r.nota);
    sinCuotas(r);
    assert.deepStrictEqual(pensado.montosDeHerramientas.sort((a, b) => a - b), [entrega, minimo13, filaDel13.precio_contado].sort((a, b) => a - b));
  });

  // Paso 3 de contado (decisión de Tomás del 06/10/2026, prueba en vivo B: con 240 mil para el 13 escalaba,
  // y con esa plata entraba el 11 de 128 de contado). Si `con_esa_entrega` viene vacío y algo se paga
  // entero con esa plata, `de_contado`: hasta 2, los más caros primero. Con la copia congelada nada se
  // paga de contado con menos de la entrega mínima más barata: el 11 de 64 baja a $160.000 en esta prueba.
  await check('paso 3 de contado: con_esa_entrega vacío y el 11 de 64 a $160.000 → de_contado con el 11 (contado y sin entrega mínima), la nota lo ofrece de contado; los montos valen', async () => {
    const u4 = fixture.usados.find((f) => f.id === 'U-004');
    const antes = { precio_contado: u4.precio_contado, anticipo_min: u4.anticipo_min };
    Object.assign(u4, { precio_contado: 160000, anticipo_min: 100000 });
    try {
      const entrega = 165000;
      const filas = [...fixture.lista, ...fixture.usados];
      assert.deepStrictEqual(cerebro.losQueRetiraCon(filas, entrega, { salvo: 'iPhone 13' }), [], 'el caso no prueba nada: con_esa_entrega no viene vacío');
      assert.ok(minimo13 - entrega > cotizador.TOPE_BAJO_MINIMO, 'el caso no prueba nada: entra la excepción');
      const { r, error, pensado } = await cotizarInsistido(2, entrega);
      assert.ok(!error, JSON.stringify(r));
      assert.strictEqual(r.llega, false);
      assert.deepStrictEqual(r.con_esa_entrega, []);
      assert.deepStrictEqual(
        (r.de_contado || []).map((e) => [e.modelo, e.capacidad_gb, e.precio_contado]),
        [['iPhone 11', 64, 160000]]
      );
      assert.ok(/de contado/.test(r.nota) && !/escal/.test(r.nota), r.nota);
      sinCuotas(r);
      sinResta(r);
      assert.ok(pensado.montosDeHerramientas.includes(160000), 'el contado del 11 no vale');
      assert.ok(pensado.datos.precios.some((p) => p.modelo === 'iPhone 11' && p.precio === 160000), 'el 11 no cuenta como mostrado');
      assert.deepStrictEqual(pensado.datos.noLlega, ['iPhone 13']);
    } finally {
      Object.assign(u4, antes);
    }
  });

  await check('paso 3 de contado: si con_esa_entrega trae equipos, no va de_contado (como hasta ahora)', async () => {
    const entrega = minimo13 - cotizador.TOPE_BAJO_MINIMO - 1000;
    const { r } = await cotizarInsistido(2, entrega);
    assert.ok(r.con_esa_entrega.length > 0, 'el caso no prueba nada');
    assert.ok(!('de_contado' in r), JSON.stringify(r));
  });

  await check('losQueRetiraCon (con_entrega y con_esa_entrega): los 2 más caros que retira con el monto y valen más; con `salvo`, sin las filas de ese modelo', async () => {
    const filas = [...fixture.lista, ...fixture.usados];
    assert.deepStrictEqual(cerebro.losQueRetiraCon(filas, 300000).map((f) => [f.modelo, f.precio_contado, f.anticipo_min]), [['iPhone 14', 430000, 290000], ['iPhone 12', 380000, 250000]]);
    // El que paga de contado con ese monto (el 11 de 64, $260.000) y la unidad que no se vende (el 15 de USADOS) no van.
    assert.ok(!cerebro.losQueRetiraCon(filas, 300000).some((f) => f.precio_contado <= 300000 || !f.cotizable));
    // Otra unidad del mismo modelo que sí entra no se le ofrece al que pidió ese modelo: sería "con esa entrega te podes llevar el 13" al del 13.
    const otro13 = { ...filaDel13, id: 'X-13', origen: 'USADOS', precio_contado: 450000, anticipo_min: 280000 };
    assert.ok(cerebro.losQueRetiraCon([...filas, otro13], 300000).some((f) => f.modelo === 'iPhone 13'), 'el caso no prueba nada: sin salvo tampoco entra');
    assert.ok(!cerebro.losQueRetiraCon([...filas, otro13], 300000, { salvo: 'iPhone 13' }).some((f) => f.modelo === 'iPhone 13'));
    assert.deepStrictEqual(cerebro.losQueRetiraCon(filas, 100000), []);
  });

  await check('con 3 insistencias sigue en el paso 3; con 2 y una entrega que llega, cotiza normal (sin excepcion)', async () => {
    const tres = await cotizarInsistido(3, minimo13 - 20000);
    assert.strictEqual(tres.r.excepcion, true);
    const llega = await cotizarInsistido(2, 340000);
    assert.deepStrictEqual([llega.r.llega, llega.r.un_pago, llega.r.dos_cuotas_de], [true, cot13.pagoUnico, cot13.cuotaDe2]);
    assert.ok(!('excepcion' in llega.r), JSON.stringify(llega.r));
  });

  await check('la excepción de punta a punta: la frase, [cotizacion] con el bloque de la excepción y "cual te cierra mas?" pasan la guardia, y va el PDF si no salió', async () => {
    const entrega = minimo13 - 20000;
    const cot = cotizador.cotizar(filaDel13, entrega, fixture.config);
    const frase = 'no, 300 es lo que tengo';
    const chatId = chatCon(frase);
    state.actualizar(chatId, { insistenciaEntrega: { 'iPhone 13': 2 }, modelo: 'iPhone 13' });
    const mensajes = [
      `dale, con los ${cotizador.pesos(entrega)} te quedas cerca para el 13, asi que te hago una excepcion y te lo armo con esa entrega, mira como te queda`,
      '[cotizacion]',
      'cual te cierra mas?',
    ];
    guion([usar('cotizar', { modelo: '13', entrega, entrega_texto: frase })], [usar('responder', { mensajes })]);
    const r = await cerebro.pensar({ chatId, mensaje: frase, nombre: '' });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.strictEqual(r.escalar, false);
    assert.deepStrictEqual(r.mensajes, [mensajes[0], cotizador.bloqueSonnet(filaDel13, cot), mensajes[2]]);
    assert.ok(r.mensajes[1].includes(`· 1 cuota de ${cotizador.pesos(cot.pagoUnico)}`) && r.mensajes[1].includes(`Haciendo una entrega de ${cotizador.pesos(entrega)}`));
    assert.strictEqual(r.compromisoDePago, true, 'con el primer bloque va el PDF');
    // Lo que el estado ya sabe se lo cuenta a Sonnet, pero el paso lo decidió el código.
    assert.ok(/veces que se le dijo la entrega inicial: iPhone 13, 2/.test(pedidos[0].body.messages[0].content[0].text));
    const res = cerebro.comoResultado(chatId, r, { mensaje: frase });
    assert.strictEqual(res.escalar, false);
    assert.ok(!(acciones.marcasDe(res.mensajes[0]) || {}).insistenciaEntrega, 'la excepción no suma otra insistencia');
    assert.ok(res.mensajes.some((m) => acciones.esDoc(m)), 'no salió el PDF');
  });

  await check('la guardia con el paso 3: los montos de la excepción y de con_esa_entrega pasan; "te falta", el recargo nombrado o un monto que no salió siguen frenando', async () => {
    const entrega = minimo13 - cotizador.TOPE_BAJO_MINIMO - 1000;
    const { pensado } = await cotizarInsistido(2, entrega);
    const montos = pensado.montosDeHerramientas;
    const bien = cerebro.revisarSalida([`con ${cotizador.pesos(entrega)} para el 13 todavia no llegamos, pero con esa entrega te podes llevar el 12 que lo retiras con $250.000`, 'te interesa?'], montos);
    assert.strictEqual(bien.guardia, null, bien.guardia);
    const falta = cerebro.revisarSalida([`te faltan $46.000 para el 13, pero con esa entrega te podes llevar el 12 que lo retiras con $250.000`], montos);
    assert.ok(/te falta/.test(falta.guardia || ''), falta.guardia);
    const inventado = cerebro.revisarSalida(['con esa entrega te podes llevar el 12 que lo retiras con $240.000'], montos);
    assert.ok(/no salió de ninguna herramienta/.test(inventado.guardia || ''), inventado.guardia);
    const excepcion = await cotizarInsistido(2, minimo13 - 20000);
    const conExcepcion = cerebro.revisarSalida([`dale, con los ${cotizador.pesos(minimo13 - 20000)} te quedas cerca para el 13, asi que te hago una excepcion`, '[cotizacion]', 'cual te cierra mas?'], excepcion.pensado.montosDeHerramientas, {
      bloques: [{ modelo: 'iPhone 13', texto: 'EL BLOQUE' }],
    });
    assert.strictEqual(conExcepcion.guardia, null, conExcepcion.guardia);
  });

  await check('las reglas y la herramienta dicen el paso 3 (la excepción, con_esa_entrega, escalar si viene vacío) y el descuento sin repreguntar la entrega', async () => {
    const reglas = cerebro.REGLAS;
    for (const re of [
      /te hago una excepcion y te lo armo con esa entrega, mira como te queda/,
      /`excepcion: true`/,
      /con esa entrega te podes llevar el 11 que lo retiras con \$Y/,
      /si `con_esa_entrega` viene vacío y trae `de_contado`: .*de contado, te queda en \$Z/,
      /si `con_esa_entrega` viene vacío y no hay `de_contado`: escalá/,
      /sin nombrar un recargo ni porcentajes/,
      /Si ya dijo con cuánto cuenta[^.]*no se lo volvés a preguntar/,
    ]) {
      assert.ok(re.test(reglas), 'las reglas no dicen ' + re);
    }
    assert.ok(!/Si ya se le dijo dos veces \(mirá el historial\) y sigue sin llegar: escalá\./.test(reglas), 'las reglas siguen escalando a la tercera');
    const h = cerebro.HERRAMIENTAS.find((x) => x.name === 'cotizar');
    assert.ok(/excepcion: true/.test(h.description) && /con_esa_entrega/.test(h.description), h.description);
  });

  console.log('\n4h. El parecido se cotiza con la entrega que ya dio (decisión de Tomás del 08/10/2026)\n');

  // El caso real (tester, 07/10 23:51): "el 13 con 340 mil?", el 13 no estaba y Sonnet le pasó el 14 de contado, sin
  // cuotas. Desde el 08/10, si ya dijo con cuánto cuenta, el parecido se cotiza con esa entrega. Es un cambio de reglas;
  // estas pruebas fijan que el código ya lo deja (cotizar un modelo que el cliente no nombró, y que la guardia acepte sus
  // montos), con una planilla sin el 14 Plus y con el 14 de 128GB al 100% a $595.000 y mínimo $410.000 (la LISTA de hoy).
  // Sin la unidad suelta del 14 (U-002, más barata), el más parecido al 14 Plus es esa fila.
  const fila14 = { ...fixture.lista.find((f) => f.modelo === 'iPhone 14'), bateria_min: 100, precio_contado: 595000, anticipo_min: 410000, pago_unico_manual: 0, cuota_2_manual: 0 };
  const sinCatorcePlus = {
    ...fixture,
    lista: fixture.lista.map((f) => (f.modelo === 'iPhone 14' ? fila14 : f)),
    usados: fixture.usados.filter((f) => f.modelo !== 'iPhone 14'),
  };
  const NO_ESTA = 'justo el 14 plus no me esta quedando, lo mas parecido que tengo es el 14 de 128gb al 100%';
  const AVISO_14_PLUS = 'pidió el 14 plus y no está en la planilla';
  /** El JSON del tool_result del pedido que llega (el último mensaje del cuerpo). */
  const resultadoEn = (body) => JSON.parse(body.messages[body.messages.length - 1].content.find((b) => b.type === 'tool_result').content);
  const pasoDe = (...bloques) => comoRespuesta(200, mensajeApi(bloques));

  /**
   * Un turno de Sonnet con la planilla sin el 14 Plus: buscar_equipos("14 plus"), `cotizar` del primero de `parecidos`
   * (su modelo y su capacidad) con `entrega`, y `responder` con lo que arme `contesta` con lo que devolvió cotizar.
   */
  async function parecidoConEntrega(frase, entrega, contesta) {
    sheets.usarFixture(sinCatorcePlus);
    try {
      const chatId = chatCon(frase);
      const vio = {};
      guion(
        [usar('buscar_equipos', { modelo: '14 plus' })],
        (opciones, body) => {
          vio.busqueda = resultadoEn(body);
          const p = vio.busqueda.parecidos[0];
          return pasoDe(usar('cotizar', { modelo: p.modelo, capacidad: p.capacidad_gb, entrega, entrega_texto: frase }));
        },
        (opciones, body) => {
          vio.cotizado = resultadoEn(body);
          return pasoDe(usar('responder', { mensajes: contesta(vio.cotizado), aviso_grupo: AVISO_14_PLUS }));
        }
      );
      const r = await cerebro.pensar({ chatId, mensaje: frase, nombre: 'Lucia' });
      return { r, ...vio, chatId };
    } finally {
      sheets.usarFixture(fixture);
    }
  }

  await check('buscar_equipos("14 plus") sin el 14 Plus en la planilla: `parecidos` con el más parecido primero (el 14 de 128GB al 100%, $595.000) y su contado vale', async () => {
    sheets.usarFixture(sinCatorcePlus);
    try {
      const { r, pensado } = await probarHerramienta('buscar_equipos', { modelo: '14 plus' });
      assert.deepStrictEqual(r.equipos, []);
      assert.deepStrictEqual(r.parecidos[0], { modelo: 'iPhone 14', capacidad_gb: 128, bateria: '100%', precio_contado: 595000 });
      assert.deepStrictEqual(r.parecidos.map((e) => e.modelo), ['iPhone 14', 'iPhone 14 Pro']);
      assert.ok(pensado.montosDeHerramientas.includes(595000));
    } finally {
      sheets.usarFixture(fixture);
    }
  });

  await check('"el 14 plus con 450 mil?": cotizar del parecido (que el cliente no nombró) da 1 pago y 2 cuotas, la guardia lo deja salir con el bloque, el PDF va con ese primer bloque y el aviso al grupo también', async () => {
    const cot = cotizador.cotizar(fila14, 450000, sinCatorcePlus.config);
    assert.ok(cot.ok && !cot.soloContado && !cot.bajoMinimo && !cot.usoManual, 'el caso no prueba nada: 450.000 no da las cuotas de siempre');
    const escritos = [NO_ESTA, 'con los $450.000 de entrega te queda asi', '[cotizacion]', 'te sirve ese o tenias pensado otro?'];
    const { r, busqueda, cotizado, chatId } = await parecidoConEntrega('el 14 plus con 450 mil?', 450000, () => escritos);
    assert.deepStrictEqual(busqueda.equipos, [], 'el 14 Plus está en la planilla de la prueba');
    assert.strictEqual(cotizado.modelo, 'iPhone 14');
    assert.strictEqual(cotizado.llega, true);
    assert.ok(!cotizado.excepcion && !cotizado.paga_de_contado, JSON.stringify(cotizado));
    assert.deepStrictEqual([cotizado.entrega, cotizado.un_pago, cotizado.dos_cuotas_de], [450000, cot.pagoUnico, cot.cuotaDe2]);
    assert.ok(!r.error, r.error);
    assert.strictEqual(r.guardia, null, 'la guardia frenó: ' + r.guardia);
    assert.strictEqual(r.escalar, false);
    assert.deepStrictEqual(r.herramientas, ['buscar_equipos', 'cotizar', 'responder']);
    assert.deepStrictEqual(r.mensajes, [escritos[0], escritos[1], cotizador.bloqueSonnet(fila14, cot), escritos[3]]);
    for (const m of [450000, cot.pagoUnico, cot.cuotaDe2]) assert.ok(r.montosDeHerramientas.includes(m), `${m} no vale`);
    assert.strictEqual(r.compromisoDePago, true, 'el PDF no sale con el primer bloque');
    assert.strictEqual(r.avisoGrupo, AVISO_14_PLUS);
    assert.deepStrictEqual([r.datos.modelo, r.datos.capacidad_gb, r.datos.entrega, r.datos.noLlega], ['iPhone 14', 128, 450000, []]);
    // Lo que sale: 4 mensajes, el PDF de pie del último y el saludo pegado al primero (el chat es nuevo).
    const res = cerebro.comoResultado(chatId, r, { nombre: 'Lucia', mensaje: 'el 14 plus con 450 mil?' });
    assert.strictEqual(res.escalar, false);
    assert.strictEqual(res.avisoGrupo, AVISO_14_PLUS);
    assert.strictEqual(res.mensajes.length, 4, JSON.stringify(res.mensajes));
    assert.ok(acciones.comoTexto(res.mensajes[0]).endsWith('\n' + NO_ESTA), 'el saludo no va pegado al primero: ' + acciones.comoTexto(res.mensajes[0]));
    assert.ok(acciones.esDoc(res.mensajes[3]) && res.mensajes[3].pie === escritos[3], 'el PDF no va de pie del último: ' + JSON.stringify(res.mensajes[3]));
  });

  await check('"el 14 plus con 350 mil?": cotizar del parecido da llega: false con la entrega mínima del 14 ($410.000), sin cuotas ni resta; la insistencia suma para el 14; la diferencia no se puede escribir', async () => {
    const entregaInicial = (c) => `mira, con los ${cotizador.pesos(c.entrega)} al 14 todavia no llegamos, para retirarlo lo estamos pidiendo con ${cotizador.pesos(c.entrega_minima)} de entrega inicial. lo que queda lo haces en 1 o 2 cuotas`;
    const { r, cotizado, chatId } = await parecidoConEntrega('el 14 plus con 350 mil?', 350000, (c) => [NO_ESTA, entregaInicial(c)]);
    assert.strictEqual(cotizado.modelo, 'iPhone 14');
    assert.strictEqual(cotizado.llega, false);
    assert.strictEqual(cotizado.entrega_minima, 410000);
    sinCuotas(cotizado);
    sinResta(cotizado);
    assert.strictEqual(r.guardia, null, 'la guardia frenó: ' + r.guardia);
    assert.deepStrictEqual(r.mensajes, [NO_ESTA, entregaInicial(cotizado)]);
    assert.strictEqual(r.compromisoDePago, false, 'el PDF sale sin bloque');
    assert.deepStrictEqual(r.datos.noLlega, ['iPhone 14'], 'la insistencia no cuenta para el parecido');
    assert.ok(!r.montosDeHerramientas.includes(60000), 'la diferencia ($60.000) quedó como válida');
    const falta = cerebro.revisarSalida([NO_ESTA, 'te faltan $60.000 para la entrega del 14'], r.montosDeHerramientas);
    assert.ok(/te falta/.test(falta.guardia || '') && /\$60\.000/.test(falta.guardia || ''), falta.guardia);
    const res = cerebro.comoResultado(chatId, r, { nombre: 'Lucia', mensaje: 'el 14 plus con 350 mil?' });
    const marcas = res.mensajes.map((m) => acciones.marcasDe(m) || {}).find((m) => m.insistenciaEntrega);
    assert.deepStrictEqual(marcas && marcas.insistenciaEntrega, { 'iPhone 14': 1 });
    assert.ok(!res.mensajes.some((m) => acciones.esDoc(m)), 'salió el PDF con la entrega inicial');
  });

  await check('con una entrega que paga el parecido entero ($600.000): paga_de_contado con su contado, sin bloque ni PDF, y la guardia deja los dos montos', async () => {
    const turno = ['que dia te podes acercar?', 'y en que horario te queda mejor? nos manejamos con turnos'];
    const { r, cotizado } = await parecidoConEntrega('el 14 plus con 600 mil?', 600000, (c) => [
      NO_ESTA,
      `con los ${cotizador.pesos(c.entrega)} lo pagas de contado, te queda en ${cotizador.pesos(c.precio_contado)}`,
      ...turno,
    ]);
    assert.strictEqual(cotizado.modelo, 'iPhone 14');
    assert.deepStrictEqual([cotizado.llega, cotizado.paga_de_contado, cotizado.precio_contado], [true, true, 595000]);
    sinCuotas(cotizado);
    assert.strictEqual(r.guardia, null, 'la guardia frenó: ' + r.guardia);
    assert.strictEqual(r.mensajes[1], 'con los $600.000 lo pagas de contado, te queda en $595.000');
    assert.strictEqual(r.compromisoDePago, false);
    assert.deepStrictEqual([r.datos.modelo, r.datos.entrega], ['iPhone 14', 600000]);
  });

  await check('las reglas (Modelos) y las herramientas: con la entrega ya dicha, el parecido se cotiza con esa entrega; si no la dijo, como antes; y el ejemplo con el caso real', async () => {
    const reglas = cerebro.REGLAS;
    const modelos = reglas.slice(reglas.indexOf('**Modelos.**'), reglas.indexOf('**Lista de precios.**'));
    for (const re of [
      /`parecidos`, el más parecido primero/,
      /`aviso_grupo` con qué modelo pidió/,
      /Si todavía no dijo con cuánto cuenta[^\n]*"justo ese no me esta quedando, tengo el X", con el más parecido y su precio de contado, sin cuotas ni entrega/,
      /Si ya dijo con cuánto cuenta, en ese mensaje \("el 13 con 340 mil\?"\) o antes \(en el historial o en lo que el sistema ya sabe\)/,
      /`cotizar` del primero de `parecidos`/,
      /"justo el 13 no me esta quedando, lo mas parecido que tengo es el 14 de 128gb al 100%"/,
      /1 pago y 2 cuotas \(también con `excepcion: true`\): un mensaje que retoma la entrega \("con los \$X de entrega te queda asi"\), un mensaje que es exactamente `\[cotizacion\]` y "te sirve ese o tenias pensado otro\?"\. El precio de contado no va\./,
      /`llega: false`: lo de \*Cuando la entrega no llega\*[^\n]*sin decir nunca cuánto le falta/,
      /`paga_de_contado`: que con eso lo paga de contado, el precio y las dos preguntas del turno/,
      /4 mensajes como mucho/,
    ]) {
      assert.ok(re.test(modelos), 'Modelos no dice ' + re);
    }
    assert.ok(/\n19\. [^\n]*"el 13 con 340 mil\?"[^\n]*`cotizar`[^\n]*`\[cotizacion\]`[^\n]*"te sirve ese o tenias pensado otro\?"/.test(reglas), 'falta el ejemplo 19');
    const buscar = cerebro.HERRAMIENTAS.find((x) => x.name === 'buscar_equipos');
    assert.ok(/`parecidos`: los más parecidos que sí hay, el más parecido primero/.test(buscar.description), buscar.description);
    const cotizar = cerebro.HERRAMIENTAS.find((x) => x.name === 'cotizar');
    assert.ok(/el primero de `parecidos` de buscar_equipos/.test(cotizar.description), cotizar.description);
  });

  console.log('\n4i. Otro modelo con la entrega ya dicha (decisión de Tomás del 08/10/2026)\n');

  // "el 13 con 450 mil?" cotizado y después "y el 14?": hasta el 08/10 el 14 era otra consulta de stock (solo el
  // contado). Desde ahora, si ya dijo con cuánto cuenta, el 14 se cotiza con esa entrega. Es un cambio de reglas; estas
  // pruebas fijan que el código ya lo deja (un segundo modelo cotizado con la entrega del primero, sus montos pasan la
  // guardia, el PDF no sale otra vez y la insistencia cuenta para el 14), con la LISTA de hoy: el 13 de 128GB al 100% a
  // $535.000 (mínimo $370.000) y el 14 a $595.000 (mínimo $410.000), con los coeficientes de producción (1,54 y 1,70).
  const conLaListaDeHoy = (() => {
    const deHoy = { 'iPhone 13': { precio_contado: 535000, anticipo_min: 370000 }, 'iPhone 14': { precio_contado: 595000, anticipo_min: 410000 } };
    return {
      ...fixture,
      config: { ...fixture.config, coef1: 1.54, coef2: 1.7 },
      lista: fixture.lista.map((f) => (deHoy[f.modelo] ? { ...f, bateria_min: 100, pago_unico_manual: 0, cuota_2_manual: 0, ...deHoy[f.modelo] } : f)),
      usados: fixture.usados.filter((f) => !deHoy[f.modelo]),
    };
  })();
  const filaDeHoy = (modelo) => conLaListaDeHoy.lista.find((f) => f.modelo === modelo);
  const cotizarDeHoy = (modelo, entrega) => cotizador.cotizar(filaDeHoy(modelo), entrega, conLaListaDeHoy.config);
  const SABE_450 = 'con cuánto dijo que cuenta para la entrega: $450.000';

  /** Lo que devolvió `comoResultado`, como lo manda index.js: las marcas se confirman y entra al historial. */
  function salio(chatId, res) {
    for (const m of res.mensajes) {
      state.confirmarMarcas(chatId, acciones.marcasDe(m));
      state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m));
    }
  }

  /** El primer turno: "el 13 con <entrega>?" cotizado y mandado, con el bloque y el PDF. Devuelve el chat. */
  async function cotizoElTrece(frase, entrega) {
    const chatId = chatCon(frase);
    const escritos = [`dale, con ${pesosB(entrega)} de entrega llegamos al 13`, '[cotizacion]', 'cual te cierra mas?'];
    guion([usar('buscar_equipos', { modelo: '13' })], [usar('cotizar', { modelo: '13', entrega, entrega_texto: frase })], [usar('responder', { mensajes: escritos })]);
    const r = await cerebro.pensar({ chatId, mensaje: frase, nombre: 'Lucia' });
    assert.strictEqual(r.guardia, null, 'la guardia frenó el 13: ' + r.guardia);
    assert.strictEqual(r.compromisoDePago, true, 'el PDF no va con el 13');
    const res = cerebro.comoResultado(chatId, r, { nombre: 'Lucia', mensaje: frase });
    // El saludo (B, 08/10): con el PDF son 4, así que va pegado al primero.
    assert.strictEqual(res.mensajes.length, 4, JSON.stringify(res.mensajes));
    assert.ok(/luciaa/i.test(acciones.comoTexto(res.mensajes[0])) && acciones.comoTexto(res.mensajes[0]).endsWith('\n' + escritos[0]), acciones.comoTexto(res.mensajes[0]));
    assert.ok(acciones.esDoc(res.mensajes[3]), 'el PDF no salió con el 13');
    salio(chatId, res);
    assert.deepStrictEqual([state.obtener(chatId).modelo, state.obtener(chatId).entrega, state.obtener(chatId).compromisoEnviado], ['iPhone 13', entrega, true]);
    state.agregarAlHistorial(chatId, 'cliente', 'y el 14?');
    return chatId;
  }

  /** "y el 14?": cotizar del 14 con `entrega` (la frase del 13 en `entrega_texto`) y responder con lo que arme `contesta`. */
  async function yElCatorce(chatId, frase, entrega, contesta) {
    const vio = {};
    guion([usar('cotizar', { modelo: '14', entrega, entrega_texto: frase })], (opciones, body) => {
      vio.cotizado = resultadoEn(body);
      return pasoDe(usar('responder', { mensajes: contesta(vio.cotizado) }));
    });
    const r = await cerebro.pensar({ chatId, mensaje: 'y el 14?', nombre: 'Lucia' });
    vio.pedido = pedidos[0].body.messages[0].content[0].text;
    return { r, ...vio };
  }

  await check('los montos de la prueba en vivo, con el cotizador: el 13 con 450 mil da $141.000 y $83.000, el 14 $234.000 y $134.000; con 400 mil, el 13 $218.000 y $125.000 y el 14 no llega (mínimo $410.000); con "y el 14?" como frase, la entrega de Sonnet', async () => {
    const dos = (c) => [c.ok, c.soloContado, c.bajoMinimo, c.pagoUnico, c.cuotaDe2];
    assert.deepStrictEqual(dos(cotizarDeHoy('iPhone 13', 450000)), [true, false, false, 141000, 83000]);
    assert.deepStrictEqual(dos(cotizarDeHoy('iPhone 14', 450000)), [true, false, false, 234000, 134000]);
    assert.deepStrictEqual(dos(cotizarDeHoy('iPhone 13', 400000)), [true, false, false, 218000, 125000]);
    // Le faltan $10.000: el cotizador lo da con la excepción, pero `cotizar` dice que no llega (es la primera vez).
    assert.deepStrictEqual([cotizarDeHoy('iPhone 14', 400000).ok, cotizarDeHoy('iPhone 14', 400000).bajoMinimo], [true, true]);
    // Si Sonnet pasa "y el 14?" como frase de la entrega, el código no lee nada ahí (el 14 es el modelo, no un número
    // chico) y cotiza con la entrega que pasó Sonnet.
    sheets.usarFixture(conLaListaDeHoy);
    try {
      const { r, error } = await probarHerramienta('cotizar', { modelo: '14', entrega: 450000, entrega_texto: 'y el 14?' });
      assert.ok(!error, JSON.stringify(r));
      assert.deepStrictEqual([r.modelo, r.entrega, r.un_pago, r.dos_cuotas_de, 'entrega_leida' in r], ['iPhone 14', 450000, 234000, 134000, false]);
    } finally {
      sheets.usarFixture(fixture);
    }
  });

  await check('"el 13 con 450 mil?" cotizado y "y el 14?": cotizar del 14 con la misma entrega da 1 pago de $234.000 y 2 cuotas de $134.000, la guardia lo deja salir con el bloque, sin el contado, y el PDF no sale de nuevo', async () => {
    sheets.usarFixture(conLaListaDeHoy);
    try {
      const chatId = await cotizoElTrece('el 13 con 450 mil?', 450000);
      const escritos = ['el 14 de 128gb al 100%, con los $450.000 de entrega te queda asi', '[cotizacion]', 'cual te cierra mas, el 13 o el 14?'];
      const { r, cotizado, pedido } = await yElCatorce(chatId, 'el 13 con 450 mil?', 450000, () => escritos);
      // Sonnet sabe con cuánto cuenta: lo que el sistema ya sabe.
      assert.ok(pedido.includes(SABE_450), 'el pedido no dice la entrega que ya dijo');
      assert.deepStrictEqual([cotizado.modelo, cotizado.llega, cotizado.entrega, cotizado.un_pago, cotizado.dos_cuotas_de], ['iPhone 14', true, 450000, 234000, 134000]);
      assert.ok(!cotizado.excepcion && !cotizado.paga_de_contado, JSON.stringify(cotizado));
      assert.strictEqual(r.guardia, null, 'la guardia frenó: ' + r.guardia);
      assert.strictEqual(r.escalar, false);
      assert.deepStrictEqual(r.herramientas, ['cotizar', 'responder']);
      const bloque14 = cotizador.bloqueSonnet(filaDeHoy('iPhone 14'), cotizarDeHoy('iPhone 14', 450000));
      assert.ok(bloque14.includes('$234.000') && bloque14.includes('$134.000'), bloque14);
      assert.deepStrictEqual(r.mensajes, [escritos[0], bloque14, escritos[2]]);
      for (const m of [450000, 234000, 134000]) assert.ok(r.montosDeHerramientas.includes(m), `${m} no vale`);
      assert.strictEqual(r.compromisoDePago, false, 'el PDF sale otra vez con el bloque del 14');
      assert.deepStrictEqual([r.datos.modelo, r.datos.entrega, r.datos.noLlega], ['iPhone 14', 450000, []]);
      const res = cerebro.comoResultado(chatId, r, { nombre: 'Lucia', mensaje: 'y el 14?' });
      assert.deepStrictEqual(res.mensajes.map(acciones.comoTexto), [escritos[0], bloque14, escritos[2]], 'hoy ya se habló: sin saludo, y sin el PDF');
      assert.ok(!res.mensajes.some((m) => acciones.esDoc(m)), 'salió el PDF otra vez');
      assert.ok(!cerebro.montosEn(res.mensajes.map(acciones.comoTexto).join('\n')).includes(595000), 'salió el contado del 14');
      // La misma pregunta de cierre que con el 13 no sale (el filtro de repetidos): por eso las reglas piden otras palabras.
      const igual = cerebro.comoResultado(chatId, { ...r, mensajes: [escritos[0], bloque14, 'cual te cierra mas?'] }, { nombre: 'Lucia', mensaje: 'y el 14?' });
      assert.deepStrictEqual(igual.mensajes.map(acciones.comoTexto), [escritos[0], bloque14]);
    } finally {
      sheets.usarFixture(fixture);
    }
  });

  await check('"el 13 con 400 mil?" cotizado y "y el 14?": cotizar del 14 da llega: false con su entrega mínima ($410.000), sin cuotas ni resta y sin PDF; la insistencia cuenta para el 14 y la diferencia no se puede escribir', async () => {
    sheets.usarFixture(conLaListaDeHoy);
    try {
      const chatId = await cotizoElTrece('el 13 con 400 mil?', 400000);
      const entregaInicial = (c) => `mira, con los ${pesosB(c.entrega)} al 14 todavia no llegamos, para retirarlo lo estamos pidiendo con ${pesosB(c.entrega_minima)} de entrega inicial. lo que queda lo haces en 1 o 2 cuotas`;
      const { r, cotizado, pedido } = await yElCatorce(chatId, 'el 13 con 400 mil?', 400000, (c) => [entregaInicial(c)]);
      assert.ok(pedido.includes('con cuánto dijo que cuenta para la entrega: $400.000'), 'el pedido no dice la entrega que ya dijo');
      assert.deepStrictEqual([cotizado.modelo, cotizado.llega, cotizado.entrega_minima], ['iPhone 14', false, 410000]);
      sinCuotas(cotizado);
      sinResta(cotizado);
      assert.strictEqual(r.guardia, null, 'la guardia frenó: ' + r.guardia);
      assert.deepStrictEqual(r.mensajes, [entregaInicial(cotizado)]);
      assert.strictEqual(r.compromisoDePago, false);
      assert.deepStrictEqual(r.datos.noLlega, ['iPhone 14'], 'la insistencia no cuenta para el 14');
      assert.ok(!r.montosDeHerramientas.includes(10000), 'la diferencia ($10.000) quedó como válida');
      const falta = cerebro.revisarSalida(['te faltan $10.000 para la entrega del 14'], r.montosDeHerramientas);
      assert.ok(/te falta/.test(falta.guardia || '') && /\$10\.000/.test(falta.guardia || ''), falta.guardia);
      const res = cerebro.comoResultado(chatId, r, { nombre: 'Lucia', mensaje: 'y el 14?' });
      assert.ok(!res.mensajes.some((m) => acciones.esDoc(m)), 'salió el PDF con la entrega inicial');
      salio(chatId, res);
      assert.deepStrictEqual(state.obtener(chatId).insistenciaEntrega, { 'iPhone 14': 1 });
    } finally {
      sheets.usarFixture(fixture);
    }
  });

  await check('sin la entrega dicha, "y el 14?" sigue siendo otra consulta de stock: el pedido no trae una entrega y sale solo el contado (el saludo, con menos de 4, en un mensaje aparte)', async () => {
    sheets.usarFixture(conLaListaDeHoy);
    try {
      const chatId = chatCon('tenes el 13?');
      guion([usar('buscar_equipos', { modelo: '13' })], [usar('responder', { mensajes: ['sii, tenemos el 13 de 128gb al 100%, lo tenemos en $535.000 de contado'] })]);
      const r13 = await cerebro.pensar({ chatId, mensaje: 'tenes el 13?', nombre: 'Lucia' });
      const res13 = cerebro.comoResultado(chatId, r13, { nombre: 'Lucia', mensaje: 'tenes el 13?' });
      // El saludo (B, 08/10): con menos de 4, va en un mensaje aparte, antes.
      assert.strictEqual(res13.mensajes.length, 2, JSON.stringify(res13.mensajes));
      assert.ok(/luciaa/i.test(acciones.comoTexto(res13.mensajes[0])) && !acciones.comoTexto(res13.mensajes[0]).includes('535'), acciones.comoTexto(res13.mensajes[0]));
      salio(chatId, res13);
      state.agregarAlHistorial(chatId, 'cliente', 'y el 14?');
      const contado = 'sii, el 14 de 128gb al 100% lo tenemos en $595.000 de contado';
      guion([usar('buscar_equipos', { modelo: '14' })], [usar('responder', { mensajes: [contado] })]);
      const r = await cerebro.pensar({ chatId, mensaje: 'y el 14?', nombre: 'Lucia' });
      assert.ok(!/con cuánto dijo que cuenta/.test(pedidos[0].body.messages[0].content[0].text), 'el pedido dice una entrega que no dio');
      assert.strictEqual(r.guardia, null, r.guardia);
      assert.deepStrictEqual(r.mensajes, [contado]);
      assert.deepStrictEqual([r.datos.entrega, r.compromisoDePago], [null, false]);
    } finally {
      sheets.usarFixture(fixture);
    }
  });

  await check('las reglas: Stock y precio cotiza otro modelo con la entrega ya dicha (si no la dijo, como antes), el ejemplo 20, y el saludo lo pone el sistema sin decir que va pegado al primero', async () => {
    const reglas = cerebro.REGLAS;
    const stock = reglas.slice(reglas.indexOf('**Stock y precio.**'), reglas.indexOf('**Modelos.**'));
    for (const re of [
      /Si después pregunta por otro modelo que sí está \("y el 13\?", "y el 14\?"; si no está, ver \*Modelos\*\)/,
      /Si todavía no dijo con cuánto cuenta: es otra consulta de stock[^\n]*sin cuotas ni cómo paga, hasta que elija uno/,
      /Si ya dijo con cuánto cuenta \(en el historial o en lo que el sistema ya sabe\), le cotizás ese modelo con esa entrega: `cotizar` de ese modelo/,
      /1 pago y 2 cuotas \(también con `excepcion: true`\): un mensaje con el modelo, la capacidad y la batería que retoma la entrega \("el 14 de 128gb al 100%, con los \$450\.000 de entrega te queda asi"\), un mensaje que es exactamente `\[cotizacion\]` y la pregunta de cierre de siempre[^\n]*"cual te cierra mas\?"[^\n]*El precio de contado no va\./,
      /`llega: false`: lo de \*Cuando la entrega no llega\*, para ese modelo[^\n]*sin decir nunca cuánto le falta\. Las veces que se la decís cuentan para ese modelo\./,
      /`paga_de_contado`: que con eso lo paga de contado, el precio y las dos preguntas del turno/,
      /El PDF del compromiso lo adjunta el sistema una sola vez por chat/,
    ]) {
      assert.ok(re.test(stock), 'Stock y precio no dice ' + re);
    }
    assert.ok(/\n20\. [^\n]*"el 13 con 450 mil\?"[^\n]*"y el 14\?"[^\n]*`cotizar` del 14[^\n]*`\[cotizacion\]`[^\n]*la entrega inicial que pedimos para el 14, sin decir cuánto le falta/.test(reglas), 'falta el ejemplo 20');
    // B: el saludo lo manda el sistema aparte con menos de 4 mensajes y pegado al primero con 4 (`conSaludo`).
    assert.ok(!/pegado al primero/.test(reglas), 'las reglas siguen diciendo que el saludo va pegado al primero');
    const modelos = reglas.slice(reglas.indexOf('**Modelos.**'), reglas.indexOf('**Lista de precios.**'));
    assert.ok(/\(son 4 mensajes como mucho; el saludo lo pone el sistema\):/.test(modelos), 'Modelos no dice que el saludo lo pone el sistema');
  });

  console.log('\n5. El enganche en sombra (index.js), en dos procesos\n');

  const corrida = (modo) => {
    const r = spawnSync(process.execPath, [__filename, `--corrida=${modo}`], { cwd: __dirname, env: process.env, encoding: 'utf8', timeout: 60000 });
    const linea = (r.stdout || '').split('\n').find((l) => l.startsWith('RESULTADO_CORRIDA '));
    if (!linea) throw new Error(`la corrida ${modo} no terminó (status ${r.status}): ${(r.stderr || r.stdout || '').slice(-600)}`);
    return JSON.parse(linea.slice('RESULTADO_CORRIDA '.length));
  };
  let apagado = null;
  let sombra = null;
  await check('con sombra, el cliente y el grupo reciben exactamente lo mismo que con apagado', async () => {
    apagado = corrida('apagado');
    sombra = corrida('sombra');
    assert.ok(apagado.aClientes.length > 0 && apagado.alGrupo.length > 0, 'el caso no prueba nada: no salió nada al cliente o al grupo');
    assert.deepStrictEqual(sombra.aClientes, apagado.aClientes);
    assert.deepStrictEqual(sombra.alGrupo, apagado.alGrupo);
    const todo = JSON.stringify([sombra.aClientes, sombra.alGrupo]);
    assert.ok(!/SONNET/.test(todo), 'salió algo de Sonnet');
  });

  await check('con sombra, cada tanda deja propuesta-sonnet con el mismo tanda que la propuesta del bot', async () => {
    assert.ok(sombra, 'no corrió');
    const props = sombra.eventos.filter((e) => e.tipo === 'propuesta' && e.chat === '...0001');
    const deSonnet = sombra.eventos.filter((e) => e.tipo === 'propuesta-sonnet');
    assert.strictEqual(props.length, 2, 'el caso no prueba nada: no hubo dos tandas');
    assert.deepStrictEqual(deSonnet.map((e) => e.tanda).sort(), props.map((e) => e.tanda).sort());
    const primera = deSonnet.find((e) => e.tanda === props[0].tanda);
    assert.deepStrictEqual(primera.mensajes, ['MENSAJE DE SONNET que no tiene que salir']);
    assert.strictEqual(primera.escalar, false);
    for (const campo of ['motivo', 'guardia', 'montos', 'uso', 'usd', 'ms']) assert.ok(campo in primera, 'falta ' + campo);
    const segunda = deSonnet.find((e) => e.tanda === props[1].tanda);
    assert.strictEqual(segunda.escalar, true);
    assert.strictEqual(segunda.motivo, 'ESCALADO DE SONNET que no tiene que salir');
    assert.strictEqual(sombra.llamadasApi, 2);
  });

  await check('una tanda sin texto (pedido del catálogo) o con un audio que no se entendió: no se le pregunta a Sonnet', async () => {
    assert.ok(sombra, 'no corrió');
    for (const chat of ['...0002', '...0003']) {
      const props = sombra.eventos.filter((e) => e.tipo === 'propuesta' && e.chat === chat);
      assert.strictEqual(props.length, 1, `el caso no prueba nada: no hubo propuesta del bot en ${chat}`);
      assert.strictEqual(props[0].escalar, true);
      assert.ok(!sombra.eventos.some((e) => e.tipo === 'propuesta-sonnet' && e.chat === chat), `se le preguntó a Sonnet en ${chat}`);
    }
  });

  await check('con apagado no hay ninguna llamada a la API ni propuesta-sonnet', async () => {
    assert.ok(apagado, 'no corrió');
    assert.strictEqual(apagado.llamadasApi, 0);
    assert.strictEqual(apagado.eventos.filter((e) => e.tipo === 'propuesta-sonnet').length, 0);
    assert.strictEqual(apagado.eventos.filter((e) => e.tipo === 'propuesta').length, 4);
  });

  await check('en sombra, el pedido también dice si vino por audio, y propuesta-sonnet lleva entregasDistintas (Ninjo bloque 1)', async () => {
    const bot = require('../src/index');
    const audio = require('../src/audio');
    const transcribir = audio.transcribir;
    const chat = '5490000000098@s.whatsapp.net';
    const frase = '180 en efectivo y 120 por transferencia';
    config.cerebro.modo = 'sombra';
    audio.transcribir = async () => ({ ok: true, texto: `quiero el 13, tengo ${frase}` });
    try {
      guion([usar('cotizar', { modelo: '13', entrega: 180000, entrega_texto: frase })], [usar('escalar', { motivo: 'sombra' })]);
      await bot.procesar({ key: { remoteJid: chat, fromMe: false, id: 'A' + Math.random() }, pushName: 'Lucia', message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } } });
      for (let i = 0; i < 100 && !eventos().some((e) => e.tipo === 'propuesta-sonnet' && e.chat === '...0098'); i++) await dormir(20);
    } finally {
      config.cerebro.modo = 'apagado';
      audio.transcribir = transcribir;
    }
    const ev = eventos().find((e) => e.tipo === 'propuesta-sonnet' && e.chat === '...0098');
    assert.ok(ev, 'no pensó en sombra');
    assert.deepStrictEqual(ev.entregasDistintas, [{ modelo: 'iPhone 13', entrega_texto: frase, entrega_sonnet: 180000, entrega_leida: 300000 }]);
    const pedido = pedidos[0].body.messages[0].content[0].text;
    assert.ok(/\] Cliente \(audio\): quiero el 13/.test(pedido), pedido);
    assert.ok(/audio/.test(pedido.slice(pedido.lastIndexOf('\n\n') + 2).split('\n')[0]), 'el pedido no dice que vino por audio');
  });

  await check('un error de la API se anota como propuesta-sonnet con error, y nada más', async () => {
    const bot = require('../src/index');
    const chat = '5490000000099@s.whatsapp.net';
    config.cerebro.modo = 'sombra';
    const antes = { clientes: aClientes.length, grupo: alGrupo.length };
    try {
      guion({ status: 500 }, { status: 500 });
      await bot.procesar(escrito(chat, 'tenes el iphone 15?'));
      for (let i = 0; i < 100 && !eventos().some((e) => e.tipo === 'propuesta-sonnet' && e.error); i++) await dormir(20);
    } finally {
      config.cerebro.modo = 'apagado';
    }
    const ev = eventos().find((e) => e.tipo === 'propuesta-sonnet' && e.error);
    assert.ok(ev, 'no se anotó el error');
    assert.ok(/500/.test(ev.error));
    const prop = eventos().filter((e) => e.tipo === 'propuesta').pop();
    assert.strictEqual(ev.tanda, prop.tanda);
    assert.ok(aClientes.length > antes.clientes, 'el bot no contestó');
    assert.ok(!alGrupo.slice(antes.grupo).some((t) => /sonnet|anthropic|500/i.test(t)), 'el error llegó al grupo');
  });

  console.log('\n6. /salud\n');

  await check('/salud muestra cerebro: { modo, llamadasHoy, usdHoy, chatsConSonnet, reglas, gastoMes }', async () => {
    const { app } = require('../src/index');
    const servidor = app.listen(0);
    await new Promise((r) => servidor.once('listening', r));
    try {
      const salud = await new Promise((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port: servidor.address().port, method: 'GET', path: '/salud' }, (res) => {
          let t = '';
          res.on('data', (c) => (t += c));
          res.on('end', () => resolve(JSON.parse(t)));
        });
        req.on('error', reject);
        req.end();
      });
      assert.ok(salud.cerebro, '/salud no muestra cerebro');
      // Bloque Ninjo 2: `reglas` y `gastoMes` (la prueba es test/silencios-y-salud.test.js).
      assert.deepStrictEqual(Object.keys(salud.cerebro).sort(), ['chatsConSonnet', 'gastoMes', 'llamadasHoy', 'modo', 'reglas', 'usdHoy']);
      assert.strictEqual(salud.cerebro.reglas, cerebro.REGLAS_HASH);
      assert.strictEqual(salud.cerebro.chatsConSonnet, 0);
      assert.strictEqual(salud.cerebro.modo, 'apagado');
      assert.strictEqual(salud.cerebro.llamadasHoy, cerebro.gastoDeHoy().llamadas);
      assert.ok(salud.cerebro.llamadasHoy > 0, 'el caso no prueba nada: no hubo llamadas');
      assert.strictEqual(salud.cerebro.usdHoy, cerebro.gastoDeHoy().usd);
    } finally {
      servidor.close();
    }
  });

  console.log('\n7. npm run sombra (test/sombra.js), con el fetch de mentira\n');

  await check('repite las tandas del rango con su historial y arma el informe con los USD', async () => {
    const sombraJs = require('./sombra');
    const ts = (s) => new Date(s).toISOString();
    const base = { v: 2, chat: '...0001', clave: 'aaaaaaaaaaaa', commit: 'abc1234' };
    const ev = [
      { ...base, ts: ts('2026-09-20T15:00:00Z'), tipo: 'cliente', id: 'c0', texto: 'hola, viejo, fuera del rango' },
      { ...base, ts: ts('2026-09-20T15:00:30Z'), tipo: 'propuesta', tanda: 'T0', lineas: ['c0'], mensajes: ['Buenass'], escalar: false, motivo: '', modo: 'vivo' },
      { ...base, ts: ts('2026-09-30T15:00:00Z'), tipo: 'cliente', id: 'c1', texto: 'tenes el iphone 13?' },
      { ...base, ts: ts('2026-09-30T15:00:40Z'), tipo: 'propuesta', tanda: 'T1', lineas: ['c1'], mensajes: ['Sii, tenemos en stock iPhone 13 128GB 100%'], escalar: false, motivo: '', modo: 'vivo' },
      { ...base, ts: ts('2026-09-30T15:02:00Z'), tipo: 'humano', id: 'h1', texto: 'ahi te confirmo el color', responde: 'T1' },
      { ...base, ts: ts('2026-09-30T15:03:00Z'), tipo: 'propuesta-sonnet', tanda: 'T1', mensajes: ['de antes'] },
      { ...base, ts: ts('2026-10-01T13:00:00Z'), tipo: 'cliente', id: 'c2', texto: 'y? me confirmas el negro?' },
      { ...base, ts: ts('2026-10-01T13:00:30Z'), tipo: 'propuesta', tanda: 'T2', lineas: ['c2'], mensajes: [], escalar: true, motivo: 'sigue algo que dijo una persona', modo: 'escucha' },
    ];
    guion([usar('responder', { mensajes: ['RESPUESTA SONNET T1'] })], [usar('escalar', { motivo: 'sigue lo de la persona' })]);
    const resultados = await sombraJs.repetir({ eventos: ev, desde: '2026-09-30', hasta: '2026-10-02', max: 20 });
    assert.deepStrictEqual(resultados.map((r) => r.tanda), ['T1', 'T2']);
    assert.strictEqual(pedidos.length, 2);
    // La T2 ve lo que el bot mandó en vivo en la T1 y lo que escribió la persona.
    const pedidoT2 = pedidos[1].body.messages[0].content.map((b) => b.text || '').join('\n');
    assert.ok(/\] Vos \(antes\): Sii, tenemos en stock iPhone 13/.test(pedidoT2), 'no va lo que mandó el bot en vivo');
    assert.ok(/\] Persona de la cuenta: ahi te confirmo el color/.test(pedidoT2), 'no va la línea de la persona');
    assert.ok(/hace 22 h/.test(pedidoT2), 'la hora relativa no es la de ese momento');
    // Lo de antes del rango no se repite, pero es contexto.
    const pedidoT1 = pedidos[0].body.messages[0].content.map((b) => b.text || '').join('\n');
    assert.ok(/\] Cliente: hola, viejo, fuera del rango/.test(pedidoT1), 'no va el contexto de antes del rango');
    assert.ok(/\] Vos \(antes\): Buenass/.test(pedidoT1), 'no va lo que el bot mandó en vivo antes del rango');

    const md = sombraJs.armarInforme(resultados, { archivo: 'de mentira', desde: '2026-09-30', hasta: '2026-10-02', planilla: 'copia congelada' });
    for (const t of ['tenes el iphone 13?', 'Sii, tenemos en stock iPhone 13', 'RESPUESTA SONNET T1', 'sigue lo de la persona', 'ahi te confirmo el color']) {
      assert.ok(md.includes(t), 'el informe no tiene: ' + t);
    }
    const total = (USD_POR_LLAMADA * 2).toFixed(4);
    assert.ok(md.includes(total), `el informe no tiene el total de USD (${total})`);
    assert.ok(md.includes(USD_POR_LLAMADA.toFixed(4)), 'el informe no tiene el promedio por tanda');
    assert.ok(/1000/.test(md) && /2000/.test(md), 'el informe no tiene los tokens');

    guion([usar('escalar', { motivo: 'uno solo' })]);
    const uno = await sombraJs.repetir({ eventos: ev, desde: '2026-09-30', hasta: '2026-10-02', max: 1 });
    assert.deepStrictEqual(uno.map((r) => r.tanda), ['T1']);
  });

  console.log('\n8. Los tests que cargan index.js fijan CEREBRO_MODO\n');

  await check('todo test que carga index.js fija CEREBRO_MODO (si no, hereda el del .env real)', async () => {
    const sinFijar = fs
      .readdirSync(__dirname)
      .filter((f) => f.endsWith('.js'))
      .filter((f) => {
        const t = fs.readFileSync(path.join(__dirname, f), 'utf8');
        return /require\('\.\.\/src\/index'\)/.test(t) && !/process\.env\.CEREBRO_MODO\s*=/.test(t);
      });
    assert.deepStrictEqual(sinFijar, []);
  });

  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
