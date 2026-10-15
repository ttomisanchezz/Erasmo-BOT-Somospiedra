'use strict';
/**
 * Ventas y pérdidas (#vendido / #perdido) y cómo las cuenta el resumen.
 *
 *   node test/ventas.test.js
 *
 * Una promesa, un caso:
 *   - en el chat, mismo patrón que #recordar / #hecho: no son mensajes de venta,
 *     confirman al grupo y al cliente no le llega nada;
 *   - desde el grupo, con el número del cliente, y nunca a ciegas;
 *   - uno por chat: marcar otra vez corrige, no duplica;
 *   - dos marcas por separado: si el bot propuso algo y si le mandó algo de verdad;
 *   - el resumen cuenta los del día anterior y saca de los pendientes a los marcados.
 *
 * El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GRUPO = '120363000000000003@g.us';

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
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-ventas-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-ventas-' + process.pid + '.jsonl');

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

const aClientes = [];
const alGrupo = [];
const historialGrupo = [];
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
const enviarTextoAnotando = async (numero, texto) => {
  aClientes.push({ numero, texto });
  return respuestaEvolution(numero);
};
evolution.enviarTexto = enviarTextoAnotando;
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  historialGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const aprendizaje = require('../src/aprendizaje');
const ventas = require('../src/ventas');
const recordatorios = require('../src/recordatorios');
const resumen = require('../src/resumen');

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
const nuevoChat = () => '54929966' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const tel = (chatId) => chatId.split('@')[0];
const mensaje = (chatId, texto, { fromMe = false, id, viejo = false } = {}) => ({
  key: { remoteJid: chatId, fromMe, id: id || 'V' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
  ...(viejo ? { messageTimestamp: Math.floor(Date.now() / 1000) - 3600 } : {}),
});
const mio = (chatId, texto, extra = {}) => mensaje(chatId, texto, { ...extra, fromMe: true });
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}
const resultadoDe = (chatId) => (state.todos()[chatId] || {}).resultado;

/** Un chat donde el cliente preguntó y el bot le contestó de verdad (en vivo). */
async function chatConBot() {
  const chat = nuevoChat();
  await bot.procesar(mensaje(chat, 'hola tenes el iphone 13?'));
  await dormir(200);
  return chat;
}

/** Corre `fn` con la configuración cambiada y la deja como estaba. */
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
  console.log('\nQué cuenta como comando\n');

  await check('#vendido y #perdido solo cuentan al principio del mensaje, y traen el número si hay', () => {
    assert.deepStrictEqual(ventas.comando('#vendido'), { tipo: 'vendido', numero: '' });
    assert.deepStrictEqual(ventas.comando('  #Perdido no contesto mas'), { tipo: 'perdido', numero: '' });
    assert.deepStrictEqual(ventas.comando('#vendido +54 9 299 555-0001'), { tipo: 'vendido', numero: '5492995550001' });
    assert.deepStrictEqual(ventas.comando('#perdido https://wa.me/5492995550001'), { tipo: 'perdido', numero: '5492995550001' });
    for (const no of ['#vendidos', '#perdidoo', 'ya esta #vendido', 'vendido', '#recordar vendido', '']) {
      assert.strictEqual(ventas.comando(no), null, 'lo tomó como comando: ' + no);
    }
  });

  console.log('\nEn el chat del cliente\n');

  await check('#vendido en el chat: anota con la fecha y las dos marcas, confirma al grupo y al cliente no le llega nada', async () => {
    const chat = await chatConBot();
    limpiar();
    const antes = Date.now();
    await bot.procesar(mio(chat, '#vendido'));
    const r = resultadoDe(chat);
    assert.ok(r, 'no quedó anotado');
    assert.strictEqual(r.tipo, 'vendido');
    assert.ok(r.ts >= antes && r.ts <= Date.now(), 'la fecha no es la de ahora');
    assert.strictEqual(r.botParticipo, true);
    assert.strictEqual(r.botLeMando, true, 'el bot le contestó en vivo y no quedó que le mandó');
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente');
    assert.strictEqual(alGrupo.length, 1, 'no confirmó en el grupo');
    assert.ok(/^💰 Vendido · Lucia/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(/propuesto mensajes en este chat: sí/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(/le mandó mensajes al cliente: sí/.test(alGrupo[0]), alGrupo[0]);
  });

  await check('no entra al historial ni al aprendizaje, ni calla al bot', async () => {
    const chat = await chatConBot();
    state.actualizar(chat, { ultimoBot: 0 });
    const largo = state.todos()[chat].historial.length;
    await bot.procesar(mio(chat, '#perdido'));
    const s = state.todos()[chat];
    assert.strictEqual(s.historial.length, largo, 'el comando entró al historial');
    assert.ok(!s.ultimoHumano, 'el comando calló al bot como si hubiera contestado una persona');
    assert.strictEqual(aprendizaje.leerTodo().filter((x) => /#perdido|#vendido/.test(x.texto || '')).length, 0);
  });

  await check('#perdido en un chat donde el bot no propuso nada: las dos marcas en "no"', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(mio(chat, '#perdido'));
    const r = resultadoDe(chat);
    assert.deepStrictEqual([r.tipo, r.botParticipo, r.botLeMando], ['perdido', false, false]);
    assert.ok(/^❌ Perdido/.test(alGrupo[0]) && /: no$/m.test(alGrupo[0]), alGrupo[0]);
    assert.ok(!/le mandó/.test(alGrupo[0]), 'dice lo de "le mandó" cuando no le mandó nada: ' + alGrupo[0]);
  });

  await check('una escalación en silencio no cuenta como mensaje propuesto', async () => {
    const chat = nuevoChat();
    await bot.procesar(mensaje(chat, 'puedo hablar con alguien?'));
    await dormir(50);
    assert.ok(alGrupo.some((t) => /SIN RESPUESTA/.test(t)), 'el caso no prueba nada: no escaló en silencio');
    assert.ok(!state.todos()[chat].botPropuso, 'marcó participación sin ningún mensaje');
    await bot.procesar(mio(chat, '#vendido'));
    assert.strictEqual(resultadoDe(chat).botParticipo, false);
  });

  await check('la participación no se pierde si después el bot solo escala en silencio', async () => {
    const chat = await chatConBot();
    await bot.procesar(mensaje(chat, 'puedo hablar con alguien?'));
    await dormir(50);
    const s = state.todos()[chat];
    assert.strictEqual(s.ultimaPropuestaBot, '', 'el caso no prueba nada: la última propuesta no quedó vacía');
    assert.ok(s.botPropuso, 'se perdió la marca de que el bot había propuesto');
    await bot.procesar(mio(chat, '#vendido'));
    assert.strictEqual(resultadoDe(chat).botParticipo, true);
  });

  await check('un chat de antes (solo con ultimaPropuestaBot) cuenta como que el bot participó', () => {
    assert.strictEqual(ventas.botParticipo({ ultimaPropuestaBot: 'Sii tenemos iPhone 13' }), true);
    assert.strictEqual(ventas.botParticipo({ ultimaPropuestaBot: '' }), false);
    assert.strictEqual(ventas.botParticipo({}), false);
    assert.strictEqual(ventas.botLeMando({ ultimaPropuestaBot: 'Sii tenemos iPhone 13' }), false);
  });

  console.log('\nPropuso o le mandó\n');

  await check('en borrador el bot propone pero no le manda: "participó" sí, "le mandó" no', async () => {
    const chat = nuevoChat();
    await con({ modoBorrador: true }, async () => {
      await bot.procesar(mensaje(chat, 'hola tenes el iphone 13?'));
      await dormir(200);
    });
    const s = state.todos()[chat];
    assert.ok(s.botPropuso, 'el caso no prueba nada: no propuso');
    assert.ok(!s.botEnvio, 'marcó un envío en borrador');
    await bot.procesar(mio(chat, '#vendido'));
    assert.deepStrictEqual([resultadoDe(chat).botParticipo, resultadoDe(chat).botLeMando], [true, false]);
  });

  await check('un envío que vuelve bloqueado no cuenta como mandado', async () => {
    const chat = nuevoChat();
    evolution.enviarTexto = async () => ({ bloqueado: true, motivo: 'fuera de la lista de prueba' });
    try {
      await bot.procesar(mensaje(chat, 'hola tenes el iphone 13?'));
      await dormir(200);
    } finally {
      evolution.enviarTexto = enviarTextoAnotando;
    }
    const s = state.todos()[chat];
    assert.ok(s.botPropuso, 'el caso no prueba nada: no propuso');
    assert.ok(!s.botEnvio, 'marcó un envío que no salió');
  });

  await check('un envío que falla (Evolution tira error) no cuenta como mandado', async () => {
    const chat = nuevoChat();
    evolution.enviarTexto = async () => {
      throw new Error('Evolution 500');
    };
    try {
      await bot.procesar(mensaje(chat, 'hola tenes el iphone 13?'));
      await dormir(200);
    } finally {
      evolution.enviarTexto = enviarTextoAnotando;
    }
    assert.ok(!state.todos()[chat].botEnvio, 'marcó un envío que falló');
  });

  await check('el seguimiento también cuenta como mensaje mandado', async () => {
    const chat = nuevoChat();
    const hace = (h) => Date.now() - h * 3600 * 1000;
    state.actualizar(chat, {
      modelo: 'iPhone 13',
      botPropuso: hace(3),
      ultimoBot: hace(2),
      ultimoEnvioCliente: hace(2),
      // Bloque Ninjo 1b: el seguimiento sale 3 h después de un precio del bot que le llegó.
      ultimoPrecioBot: hace(3.5),
      historial: [{ quien: 'cliente', texto: 'tenes el 13?', ts: hace(4) }],
    });
    limpiar();
    const seguimiento = { ...config.seguimiento, activo: true, horaDesde: 0, horaHasta: 24, franjaDesde: 0, franjaHasta: 24 };
    await con({ seguimiento }, () => bot.revisarSeguimientos({ escribiendoMs: 1 }));
    assert.ok(aClientes.some((m) => m.numero === chat), 'el caso no prueba nada: no salió el seguimiento');
    assert.ok(state.todos()[chat].botEnvio, 'el seguimiento salió y no quedó que le mandó');
  });

  console.log('\nCorregir, no duplicar\n');

  await check('#perdido y después #vendido corrige: queda uno solo, con la fecha nueva', async () => {
    const chat = await chatConBot();
    await bot.procesar(mio(chat, '#perdido'));
    const primero = resultadoDe(chat);
    await dormir(5);
    limpiar();
    await bot.procesar(mio(chat, '#vendido'));
    const r = resultadoDe(chat);
    assert.strictEqual(r.tipo, 'vendido');
    assert.strictEqual(r.corrigio, 'perdido');
    assert.ok(r.ts > primero.ts, 'no tomó la fecha de la corrección');
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/corregido, estaba como perdido/.test(alGrupo[0]), alGrupo[0]);
  });

  await check('#vendido sobre uno ya vendido no duplica ni mueve la fecha, y lo dice', async () => {
    const chat = await chatConBot();
    await bot.procesar(mio(chat, '#vendido'));
    const primero = resultadoDe(chat);
    await dormir(5);
    limpiar();
    await bot.procesar(mio(chat, '#vendido'));
    const r = resultadoDe(chat);
    assert.strictEqual(r.ts, primero.ts, 'movió la fecha');
    assert.strictEqual(r.tipo, 'vendido');
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/ya estaba anotado desde el \d{2}\/\d{2}/.test(alGrupo[0]), alGrupo[0]);
  });

  await check('el mismo mensaje dos veces (webhook repetido) confirma una sola vez', async () => {
    const chat = await chatConBot();
    limpiar();
    const m = mio(chat, '#vendido', { id: 'REPETIDO-V1' });
    await bot.procesar(m);
    await bot.procesar(m);
    assert.strictEqual(alGrupo.length, 1, 'confirmó dos veces');
  });

  await check('queda en disco al toque, sin esperar el guardado diferido', async () => {
    const chat = await chatConBot();
    await bot.procesar(mio(chat, '#vendido'));
    const enDisco = JSON.parse(fs.readFileSync(process.env.ESTADO_PATH, 'utf8'));
    assert.strictEqual(enDisco[chat] && enDisco[chat].resultado && enDisco[chat].resultado.tipo, 'vendido');
  });

  console.log('\nDesde el grupo, con el número\n');

  await check('marca el chat del número, escrito como sea, y confirma con el link', async () => {
    const formas = [
      (t) => t, //                                               5492996600012
      (t) => `+54 9 ${t.slice(3, 6)} ${t.slice(6, 9)}-${t.slice(9)}`, // +54 9 299 660-0012
      (t) => `https://wa.me/${t}`, //                            el link del resumen
      (t) => t.slice(3), //                                      sin 54 ni 9
      (t) => `54${t.slice(3)}`, //                               sin el 9
    ];
    for (const forma of formas) {
      const chat = await chatConBot();
      limpiar();
      await bot.procesar(mio(GRUPO, `#vendido ${forma(tel(chat))}`));
      assert.strictEqual((resultadoDe(chat) || {}).tipo, 'vendido', 'no marcó con: ' + forma(tel(chat)));
      assert.strictEqual(aClientes.length, 0, 'le escribió al cliente');
      assert.strictEqual(alGrupo.length, 1);
      assert.ok(/^💰 Vendido · Lucia/.test(alGrupo[0]), alGrupo[0]);
      assert.ok(alGrupo[0].includes('https://wa.me/' + tel(chat)), 'la confirmación no dice qué chat marcó');
    }
  });

  await check('desde el grupo también corrige: #perdido con el número sobre uno vendido', async () => {
    const chat = await chatConBot();
    await bot.procesar(mio(chat, '#vendido'));
    limpiar();
    await bot.procesar(mio(GRUPO, `#perdido ${tel(chat)}`));
    assert.deepStrictEqual([resultadoDe(chat).tipo, resultadoDe(chat).corrigio], ['perdido', 'vendido']);
    assert.ok(/corregido, estaba como vendido/.test(alGrupo[0]), alGrupo[0]);
  });

  await check('sin número no marca nada: contesta cómo se usa', async () => {
    limpiar();
    const antes = JSON.stringify(state.todos());
    await bot.procesar(mio(GRUPO, '#vendido'));
    await bot.procesar(mio(GRUPO, '#perdido'));
    assert.strictEqual(JSON.stringify(state.todos()), antes, 'cambió el estado desde el grupo');
    assert.strictEqual(alGrupo.length, 2);
    assert.ok(/^❓ Desde el grupo, #vendido va con el número/.test(alGrupo[0]) && /No marqué nada/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(/^❓ Desde el grupo, #perdido/.test(alGrupo[1]), alGrupo[1]);
  });

  await check('con un número que no es de ningún chat, o muy corto, no marca nada y lo dice', async () => {
    limpiar();
    const antes = JSON.stringify(state.todos());
    await bot.procesar(mio(GRUPO, '#vendido 5492990000999'));
    await bot.procesar(mio(GRUPO, '#vendido 1234'));
    assert.strictEqual(JSON.stringify(state.todos()), antes, 'cambió el estado');
    assert.ok(/^❓ No encontré ningún chat con el 5492990000999/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(/^❓ #vendido 1234: no parece un número/.test(alGrupo[1]), alGrupo[1]);
  });

  await check('si el número coincide con varios chats no elige: pide el completo, y con el completo marca ese', async () => {
    const conNueve = '5492996677777@s.whatsapp.net';
    const sinNueve = '542996677777@s.whatsapp.net';
    for (const id of [conNueve, sinNueve]) {
      state.actualizar(id, { historial: [{ quien: 'cliente', texto: 'hola', ts: Date.now() }] });
    }
    limpiar();
    await bot.procesar(mio(GRUPO, '#vendido 2996677777'));
    assert.ok(!resultadoDe(conNueve) && !resultadoDe(sinNueve), 'marcó uno a ciegas');
    assert.ok(/^❓ Hay 2 chats con el 2996677777/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(alGrupo[0].includes('wa.me/5492996677777') && alGrupo[0].includes('wa.me/542996677777'), alGrupo[0]);
    await bot.procesar(mio(GRUPO, '#vendido 5492996677777'));
    assert.strictEqual((resultadoDe(conNueve) || {}).tipo, 'vendido');
    assert.ok(!resultadoDe(sinNueve), 'marcó también el otro');
  });

  await check('un contacto personal no se marca desde el grupo', async () => {
    const chat = await chatConBot();
    limpiar();
    await con({ contactosPersonales: [tel(chat)] }, () => bot.procesar(mio(GRUPO, `#vendido ${tel(chat)}`)));
    assert.ok(!resultadoDe(chat), 'marcó un contacto personal');
    assert.ok(/CONTACTOS_PERSONALES/.test(alGrupo[0]), alGrupo[0]);
  });

  await check('se ignoran si los escribe el cliente, alguien desde su número, otro grupo, o si son viejos', async () => {
    const chat = await chatConBot();
    limpiar();
    await bot.procesar(mensaje(chat, '#vendido')); // el cliente
    await bot.procesar(mensaje(GRUPO, `#vendido ${tel(chat)}`)); // alguien desde su número personal
    await bot.procesar(mio('120363999999999999@g.us', `#vendido ${tel(chat)}`)); // otro grupo
    await bot.procesar(mio(chat, '#perdido', { viejo: true })); // sincronización del QR
    await bot.procesar(mio(GRUPO, `#perdido ${tel(chat)}`, { viejo: true }));
    await dormir(200);
    assert.ok(!resultadoDe(chat), 'quedó anotado');
    assert.strictEqual(alGrupo.filter((t) => /^(💰|❌|❓)/.test(t)).length, 0);
  });

  console.log('\nEn el resumen de la mañana\n');

  // Lunes 14 de septiembre de 2026 a las 9:05: "ayer" es el domingo 13.
  const HOY = new Date(2026, 8, 14, 9, 5);
  const el = (dia, h, m = 0) => new Date(2026, 8, dia, h, m).getTime();
  const marcado = (tipo, ts, botParticipo, botLeMando = false) => ({
    historial: [],
    resultado: { tipo, ts, botParticipo, botLeMando },
  });
  const AYER = {
    '5491100000101@s.whatsapp.net': marcado('vendido', el(13, 0, 0), true, true), // borde: 0:00 de ayer
    '5491100000102@s.whatsapp.net': marcado('vendido', el(13, 18, 30), true),
    '5491100000103@s.whatsapp.net': marcado('vendido', el(13, 23, 59), false),
    '5491100000104@s.whatsapp.net': marcado('perdido', el(13, 11), true),
    '5491100000105@s.whatsapp.net': marcado('vendido', el(14, 8), true, true), // hoy
    '5491100000106@s.whatsapp.net': marcado('vendido', el(12, 23, 59), true, true), // anteayer
    '5491100000107@s.whatsapp.net': { historial: [] }, // sin marcar
  };

  await check('cuenta solo los del día anterior, en cuántos propuso y en cuántos le mandó', () => {
    assert.deepStrictEqual(resumen.resultadosDeAyer(AYER, HOY), {
      vendido: { total: 3, conBot: 2, conEnvio: 1 },
      perdido: { total: 1, conBot: 1, conEnvio: 0 },
    });
  });

  await check('la línea de "le mandó" va debajo de su fila y solo si no es cero', () => {
    const texto = resumen.armar(AYER, 3, HOY).join('\n');
    assert.ok(texto.includes('📊 Ayer, domingo 13'), texto.slice(0, 120));
    assert.ok(
      texto.includes('💰 3 vendidos · el bot participó en 2\n   📤 le mandó mensajes en 1\n❌ 1 perdido · el bot participó en 1\n'),
      texto.slice(0, 200)
    );
    assert.strictEqual((texto.match(/📤/g) || []).length, 1, 'puso la línea de "le mandó" en cero');
  });

  await check('los contactos personales no cuentan, como en el resto del resumen', async () => {
    const chat = '5491100000108@s.whatsapp.net';
    await con({ contactosPersonales: [tel(chat)] }, () => {
      assert.strictEqual(resumen.resultadosDeAyer({ [chat]: marcado('vendido', el(13, 12), true) }, HOY).vendido.total, 0);
    });
  });

  await check('sin nada pendiente igual salen las cuentas de ayer', () => {
    const partes = resumen.armar({ '5491100000109@s.whatsapp.net': marcado('perdido', el(13, 12), false) }, 3, HOY);
    assert.strictEqual(partes.length, 1);
    assert.ok(/❌ 1 perdido · el bot participó en 0\n/.test(partes[0]), partes[0]);
    assert.ok(!/📤/.test(partes[0]), partes[0]);
    assert.ok(/No hay nada pendiente/.test(partes[0]), partes[0]);
  });

  // Hasta Ajustes 1 (16/09/2026) decía "💰 0 vendidos" y recordaba cómo se anotan.
  // Nadie los anotaba: ahora, con los dos en cero, no sale nada (ver test/turnos.test.js).
  await check('con los dos en cero no sale la línea de vendidos ni el recordatorio de cómo se anotan', () => {
    const texto = resumen.armar({}, 3, HOY)[0];
    assert.ok(!/📊|💰|❌|vendido|perdido/.test(texto), texto);
    assert.ok(!texto.includes('Se anotan con'), texto);
  });

  await check('un chat marcado sale de los pendientes; si el cliente escribe después de marcarlo, vuelve', () => {
    const t = Date.now();
    const hace = (h) => t - h * 3600 * 1000;
    const cotizado = (extra) => ({
      nombre: 'Cliente',
      modelo: 'iPhone 13',
      cotizadoDe: 'iPhone 13',
      ultimoBot: hace(2),
      historial: [{ quien: 'cliente', texto: 'tengo 400 mil', ts: hace(3) }],
      ...extra,
    });
    const todos = {
      '5491100000201@s.whatsapp.net': cotizado({}), // sin marcar
      '5491100000202@s.whatsapp.net': cotizado({ resultado: { tipo: 'vendido', ts: hace(1) } }),
      '5491100000203@s.whatsapp.net': cotizado({ escalado: true, resultado: { tipo: 'perdido', ts: hace(1) } }),
      '5491100000204@s.whatsapp.net': cotizado({
        resultado: { tipo: 'perdido', ts: hace(1) },
        historial: [{ quien: 'cliente', texto: 'che al final lo quiero', ts: hace(0.2) }],
      }),
    };
    const texto = resumen.armar(todos, 3).join('\n');
    assert.ok(/2 chats para mirar/.test(texto), texto.slice(0, 200));
    assert.ok(texto.includes('wa.me/5491100000201'), 'se perdió el chat sin marcar');
    assert.ok(!texto.includes('wa.me/5491100000202'), 'el vendido sigue en PARA CERRAR');
    assert.ok(!texto.includes('wa.me/5491100000203'), 'el perdido sigue en TE ESTÁN ESPERANDO');
    assert.ok(texto.includes('wa.me/5491100000204') && texto.includes('che al final lo quiero'), 'el que volvió a escribir no está');
  });

  await check('de punta a punta: un #vendido de hoy sale en el resumen de mañana', async () => {
    const chat = await chatConBot();
    await bot.procesar(mio(chat, '#vendido'));
    const ahora = new Date();
    const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1, 9, 5);
    const soloEste = { [chat]: state.todos()[chat] };
    assert.deepStrictEqual(resumen.resultadosDeAyer(soloEste, manana).vendido, { total: 1, conBot: 1, conEnvio: 1 });
    assert.strictEqual(resumen.resultadosDeAyer(soloEste, ahora).vendido.total, 0, 'lo contó en el resumen de hoy');
  });

  console.log('\nChats marcados que vuelven, y el seguimiento\n');

  await check('un chat marcado que vuelve dice al lado del nombre por qué vuelve', () => {
    const HOY14 = new Date(2026, 8, 14, 9, 5);
    const el = (mes, dia, h = 12) => new Date(2026, mes, dia, h).getTime();
    // Todos escribieron después de la marca y nadie les contestó: van a ESCRIBIERON Y NADIE CONTESTÓ.
    const escribio = { quien: 'cliente', texto: 'hola, sigue en pie?', ts: HOY14.getTime() - 60 * 1000 };
    const volvio = (nombre, resultado) => ({
      nombre,
      modelo: 'iPhone 13',
      ultimoBot: resultado.ts - 3600 * 1000,
      historial: [escribio],
      resultado,
    });
    const todos = {
      '5491100000301@s.whatsapp.net': volvio('Ana', { tipo: 'vendido', ts: el(8, 14, 8) }), // hoy, antes del resumen
      '5491100000302@s.whatsapp.net': volvio('Beto', { tipo: 'vendido', ts: el(8, 13) }), // ayer
      '5491100000303@s.whatsapp.net': volvio('Caro', { tipo: 'perdido', ts: el(8, 12) }), // este mes
      '5491100000304@s.whatsapp.net': volvio('Dani', { tipo: 'vendido', ts: el(7, 30) }), // el mes pasado
      '5491100000305@s.whatsapp.net': { nombre: 'Eli', modelo: 'iPhone 13', ultimoBot: el(8, 14, 7), historial: [escribio] },
    };
    const texto = resumen.armar(todos, 3, HOY14).join('\n');
    for (const esperado of ['Ana (vendido hoy) · 13', 'Beto (vendido ayer) · 13', 'Caro (perdido el 12) · 13', 'Dani (vendido el 30/08) · 13']) {
      assert.ok(texto.includes(esperado), `falta "${esperado}" en:\n${texto}`);
    }
    assert.ok(/\d\) Eli · 13/.test(texto), 'un chat sin marcar no tendría que llevar nada al lado del nombre:\n' + texto);
  });

  await check('el seguimiento saltea los chats marcados, aunque el cliente haya vuelto a escribir', async () => {
    const hace = (h) => Date.now() - h * 3600 * 1000;
    // El bot le escribió último hace 2 horas y el cliente no contestó: un plantón.
    const planton = (extra) => ({
      modelo: 'iPhone 13',
      botPropuso: hace(3),
      ultimoBot: hace(2),
      ultimoEnvioCliente: hace(2),
      // Bloque Ninjo 1b: el seguimiento sale 3 h después de un precio del bot que le llegó.
      ultimoPrecioBot: hace(3.5),
      historial: [{ quien: 'cliente', texto: 'tenes el 13?', ts: hace(4) }],
      ...extra,
    });
    const libre = nuevoChat();
    const vendido = nuevoChat();
    const perdidoQueVolvio = nuevoChat(); // lo marcaron hace 5 h y escribió hace 3
    state.actualizar(libre, planton({}));
    state.actualizar(vendido, planton({ resultado: { tipo: 'vendido', ts: hace(4) } }));
    state.actualizar(perdidoQueVolvio, planton({ resultado: { tipo: 'perdido', ts: hace(5) } }));
    limpiar();
    const seguimiento = { ...config.seguimiento, activo: true, horaDesde: 0, horaHasta: 24, franjaDesde: 0, franjaHasta: 24, maxPorBarrido: 10 };
    await con({ seguimiento }, () => bot.revisarSeguimientos({ escribiendoMs: 1 }));
    assert.ok(aClientes.some((m) => m.numero === libre), 'el caso no prueba nada: al chat sin marcar no le salió el seguimiento');
    assert.ok(!aClientes.some((m) => m.numero === vendido), 'le mandó el seguimiento a un vendido');
    assert.ok(!aClientes.some((m) => m.numero === perdidoQueVolvio), 'le mandó el seguimiento a un perdido que volvió');
  });

  console.log('\nEl eco del propio bot\n');

  await check('nada de lo que el bot manda al grupo (ni el resumen) dispara un comando al volver', async () => {
    const mandados = [...historialGrupo, ...resumen.armar(AYER, 3, HOY), ...resumen.armar({}, 3, HOY)];
    for (const tipo of [/^💰/, /^❌/, /^❓ Desde el grupo/, /^❓ Hay 2 chats/, /wa\.me/, /📤/, /📅/]) {
      assert.ok(mandados.some((t) => tipo.test(t)), 'el caso no prueba nada: no hay avisos ' + tipo);
    }
    for (const t of mandados) {
      assert.strictEqual(ventas.comando(t), null, 'lo toma como comando: ' + t.slice(0, 40));
      assert.strictEqual(recordatorios.comando(t), null, 'lo toma como recordatorio: ' + t.slice(0, 40));
    }
    const antes = JSON.stringify(state.todos());
    limpiar();
    for (const t of mandados) await bot.procesar(mio(GRUPO, t));
    assert.strictEqual(alGrupo.length, 0, 'se contestó a su propio aviso');
    assert.strictEqual(JSON.stringify(state.todos()), antes);
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
