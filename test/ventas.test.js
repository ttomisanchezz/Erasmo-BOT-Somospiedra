'use strict';
/**
 * Ventas y pérdidas (#vendido / #perdido).
 *
 *   node test/ventas.test.js
 *
 * Una promesa, un caso:
 *   - en el chat, mismo patrón que #recordar / #hecho: no son mensajes de venta,
 *     confirman al grupo y al cliente no le llega nada;
 *   - desde el grupo, con el número del cliente, y nunca a ciegas;
 *   - uno por chat: marcar otra vez corrige, no duplica;
 *   - dos marcas por separado: si el bot propuso algo y si le mandó algo de verdad;
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
process.env.EVOLUTION_INSTANCE = 'somospiedra';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-ventas-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
// Sin bot de siempre (poda de iPhone): contesta un Sonnet de mentira (test/sonnet-fijo.js).
process.env.CEREBRO_MODO = 'todos';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-ventas-' + process.pid + '.jsonl');


const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};


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

const sonnetFijo = require('./sonnet-fijo').instalar();
const bot = require('../src/index');
const state = require('../src/state');
const aprendizaje = require('../src/aprendizaje');
const ventas = require('../src/ventas');
const recordatorios = require('../src/recordatorios');

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
  await bot.procesar(mensaje(chat, 'hola tienen laja?'));
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
    assert.strictEqual(ventas.botParticipo({ ultimaPropuestaBot: 'Sii tenemos laja' }), true);
    assert.strictEqual(ventas.botParticipo({ ultimaPropuestaBot: '' }), false);
    assert.strictEqual(ventas.botParticipo({}), false);
    assert.strictEqual(ventas.botLeMando({ ultimaPropuestaBot: 'Sii tenemos laja' }), false);
  });

  console.log('\nPropuso o le mandó\n');

  await check('en borrador el bot propone pero no le manda: "participó" sí, "le mandó" no', async () => {
    const chat = nuevoChat();
    await con({ modoBorrador: true }, async () => {
      await bot.procesar(mensaje(chat, 'hola tienen laja?'));
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
      await bot.procesar(mensaje(chat, 'hola tienen laja?'));
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
      await bot.procesar(mensaje(chat, 'hola tienen laja?'));
      await dormir(200);
    } finally {
      evolution.enviarTexto = enviarTextoAnotando;
    }
    assert.ok(!state.todos()[chat].botEnvio, 'marcó un envío que falló');
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

  console.log('\nEl eco del propio bot\n');

  await check('nada de lo que el bot manda al grupo dispara un comando al volver', async () => {
    const mandados = [...historialGrupo];
    for (const tipo of [/^💰/, /^❌/, /^❓ Desde el grupo/, /^❓ Hay 2 chats/, /wa\.me/]) {
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
