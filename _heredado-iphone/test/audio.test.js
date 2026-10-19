'use strict';
/**
 * Notas de voz: transcripción, qué se guarda y qué pasa cuando falla.
 *
 *   node test/audio.test.js
 *
 * No sale a la red: se reemplazan `evolution.base64DeMedia` (que bajaría el
 * archivo) y `gemini.transcribir` (que lo mandaría a Google) por dobles que
 * devuelven lo que cada caso necesita.
 *
 * El entorno se fija acá y no se hereda del .env, para que un verde signifique
 * siempre lo mismo en cualquier máquina.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
process.env.AUDIO_ACTIVO = 'true';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-audio-' + Date.now() + '.json');
// Sin esto la prueba escribiría en el registro de aprendizaje REAL.
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'aprendizaje-audio-' + Date.now() + '.jsonl');
const APR = process.env.APRENDIZAJE_PATH;

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');
const audio = require('../src/audio');

// Red cortada de verdad: si algo intenta salir, revienta y se ve.
globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

// El extractor local entiende los mensajes: no queremos depender de Gemini.
const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);

let transcripcion = null; // lo que devuelve el doble de Gemini
let pidioMedia = 0;
evolution.base64DeMedia = async () => {
  pidioMedia++;
  return { base64: 'AAAA', mimetype: 'audio/ogg' };
};
gemini.transcribir = async () => {
  if (transcripcion instanceof Error) throw transcripcion;
  return transcripcion;
};

const aClientes = [];
const alGrupo = [];
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
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const aprendizaje = require('../src/aprendizaje');

// El registro de aprendizaje es de eventos desde el bloque 6: `humano` con el texto de
// la persona y `responde` (la tanda de la propuesta), `propuesta` con la lectura y el
// contexto de esa tanda, y `cliente` por cada línea del cliente.
const humanos = (texto) => aprendizaje.leerTodo().filter((e) => e.tipo === 'humano' && e.texto === texto);
const propuestaDe = (h) => aprendizaje.leerTodo().find((e) => e.tipo === 'propuesta' && h && e.tanda === h.responde);

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

const notaDeVoz = (chatId, fromMe = false) => ({
  key: { remoteJid: chatId, fromMe, id: 'ABC' + Math.random() },
  pushName: 'Ailin',
  message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } },
});
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() },
  pushName: 'Ailin',
  message: { conversation: texto },
});

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  pidioMedia = 0;
}

(async () => {
  console.log('\nDetección y claridad\n');

  await check('reconoce una nota de voz y no confunde un mensaje escrito', () => {
    assert.strictEqual(audio.esAudio(notaDeVoz('x@s.whatsapp.net')), true);
    assert.strictEqual(audio.esAudio(escrito('x@s.whatsapp.net', 'hola')), false);
    assert.strictEqual(audio.esAudio({}), false);
  });

  await check('una transcripción vacía o inaudible no es clara', () => {
    assert.strictEqual(audio.esClara(''), false);
    assert.strictEqual(audio.esClara('   '), false);
    assert.strictEqual(audio.esClara(gemini.INAUDIBLE), false);
    assert.strictEqual(audio.esClara('no se entiende ' + gemini.INAUDIBLE), false);
    assert.strictEqual(audio.esClara('...'), false);
  });

  await check('una transcripción corta pero con contenido sí es clara', () => {
    assert.strictEqual(audio.esClara('si'), true);
    assert.strictEqual(audio.esClara('dale'), true);
    assert.strictEqual(audio.esClara('tenes el 13?'), true);
  });

  console.log('\nAudios propios (fromMe)\n');

  await check('un audio propio se transcribe y se guarda con el texto real', async () => {
    const chat = '5491100000001@s.whatsapp.net';
    transcripcion = 'mira, el 13 te lo dejo en 495 mil y lo financiamos';
    limpiar();
    state.actualizar(chat, { ultimoMensajeCliente: 'tenes el 13?', ultimaPropuestaBot: 'algo' });
    await bot.procesar(notaDeVoz(chat, true));
    await dormir(30);

    const h = state.todos()[chat].historial || [];
    const ultimo = h[h.length - 1];
    assert.strictEqual(ultimo.quien, 'vendedor');
    assert.strictEqual(ultimo.texto, transcripcion, 'no guardó la transcripción en el historial');
    assert.strictEqual(pidioMedia, 1, 'no le pidió el archivo a Evolution');
  });

  await check('el audio propio entra al aprendizaje con el texto transcrito', () => {
    const registros = humanos(transcripcion);
    assert.ok(registros.length > 0, 'no quedó registrado en el aprendizaje');
  });

  await check('un audio propio sigue callando al bot 45 minutos', async () => {
    const chat = '5491100000002@s.whatsapp.net';
    transcripcion = 'ya le contesto yo a este';
    await bot.procesar(notaDeVoz(chat, true));
    await dormir(30);
    assert.ok(
      state.humanoActivo(chat, config.silencioTrasHumanoMin),
      'el audio propio no marcó que hay un humano atendiendo'
    );
  });

  await check('un audio propio que no se transcribe deja constancia y NO ensucia el aprendizaje', async () => {
    const chat = '5491100000003@s.whatsapp.net';
    transcripcion = gemini.INAUDIBLE;
    const antes = aprendizaje.leerTodo().length;
    await bot.procesar(notaDeVoz(chat, true));
    await dormir(30);

    const h = state.todos()[chat].historial || [];
    assert.strictEqual(h[h.length - 1].texto, '[audio que no se pudo transcribir]');
    assert.strictEqual(aprendizaje.leerTodo().length, antes, 'guardó un registro sin contenido');
    assert.ok(
      state.humanoActivo(chat, config.silencioTrasHumanoMin),
      'aunque falle, sigue siendo un humano atendiendo'
    );
  });

  console.log('\nAudios de cliente\n');

  await check('un audio claro se procesa como texto normal y cotiza', async () => {
    const chat = '5491100000010@s.whatsapp.net';
    transcripcion = 'hola tenes el iphone 13? tengo 350.000';
    limpiar();
    await bot.procesar(notaDeVoz(chat));
    await dormir(250);

    const todo = aClientes.map((m) => m.texto).join(' ');
    assert.ok(aClientes.length > 0, 'no contestó nada');
    // Cotiza el 13 con los $350.000 del audio. Hasta Ajustes 1 se miraba el contado
    // ($495.000), que la cotización ya no muestra.
    assert.ok(/📱 \*iPhone 13\b/.test(todo) && /350\.000/.test(todo) && /1 pago de/.test(todo), 'no usó el audio como consulta real: ' + todo.slice(0, 120));
    const h = state.todos()[chat].historial || [];
    assert.strictEqual(h[0].texto, transcripcion, 'no guardó la transcripción del cliente');
  });

  // Antes le pedía que lo escriba "o si preferis te llama fran". Esa promesa a
  // nombre de otro se sacó: al cliente no se le dice nada y lo ve una persona.
  await check('un audio que no se entiende NO cotiza: no le dice nada y avisa al grupo', async () => {
    const chat = '5491100000011@s.whatsapp.net';
    transcripcion = gemini.INAUDIBLE;
    limpiar();
    await bot.procesar(notaDeVoz(chat));
    await dormir(250);

    const todo = aClientes.map((m) => m.texto).join(' ');
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente: ' + todo.slice(0, 120));
    assert.ok(!/📱|1 pago de/i.test(todo), 'COTIZÓ sobre un audio que no se entendió');
    assert.strictEqual(alGrupo.length, 1, 'no escaló al grupo');
    assert.ok(/^🔕/.test(alGrupo[0]), 'el aviso no dice que al cliente no se le contestó');
    assert.ok(/audio/i.test(alGrupo[0]), 'el aviso no dice que fue por un audio');
  });

  await check('si Gemini falla al transcribir, tampoco cotiza: no le dice nada y avisa', async () => {
    const chat = '5491100000012@s.whatsapp.net';
    transcripcion = new Error('429 sin cupo');
    limpiar();
    await bot.procesar(notaDeVoz(chat));
    await dormir(250);

    const todo = aClientes.map((m) => m.texto).join(' ');
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente: ' + todo.slice(0, 120));
    assert.strictEqual(alGrupo.length, 1, 'no escaló al grupo');
    assert.ok(/^🔕/.test(alGrupo[0]), 'el aviso no dice que al cliente no se le contestó');
  });

  await check('el audio fallido queda en el historial, no desaparece', async () => {
    const chat = '5491100000011@s.whatsapp.net';
    const h = state.todos()[chat].historial || [];
    assert.ok(
      h.some((m) => m.quien === 'cliente' && /audio/i.test(m.texto)),
      'el audio del cliente no dejó rastro en el historial'
    );
  });

  console.log('\nApagado\n');

  await check('con AUDIO_ACTIVO=false no transcribe ni le pide el archivo a Evolution', async () => {
    const antes = config.audio.activo;
    config.audio.activo = false;
    try {
      limpiar();
      const r = await audio.transcribir(notaDeVoz('5491100000020@s.whatsapp.net'));
      assert.strictEqual(r.ok, false);
      assert.strictEqual(pidioMedia, 0, 'le pidió el archivo a Evolution con la función apagada');
    } finally {
      config.audio.activo = antes;
    }
  });

  await check('con Gemini en modo solo-local (--offline) no transcribe', async () => {
    gemini.usarSoloLocal(true);
    try {
      limpiar();
      assert.strictEqual(audio.activo(), false);
      const r = await audio.transcribir(notaDeVoz('5491100000021@s.whatsapp.net'));
      assert.strictEqual(r.ok, false);
      assert.strictEqual(pidioMedia, 0, 'salió a buscar el audio en una corrida offline');
    } finally {
      gemini.usarSoloLocal(false);
    }
  });

  console.log('\nRegistro de quién entendió\n');

  await check('el estado guarda qué parser leyó el mensaje y qué extrajo', async () => {
    const chat = '5491100000030@s.whatsapp.net';
    await bot.procesar(escrito(chat, 'tenes el iphone 13? tengo 350.000'));
    await dormir(250);

    const lec = state.todos()[chat].ultimaLectura;
    assert.ok(lec, 'no guardó la lectura');
    assert.strictEqual(lec.fuente, 'local', 'no marcó qué parser contestó');
    assert.ok(lec.intencion, 'no guardó la intención');
    assert.strictEqual(lec.entrega, 350000, 'no guardó lo que extrajo');
  });

  await check('el aprendizaje guarda la lectura cuando contesta un humano', async () => {
    const chat = '5491100000031@s.whatsapp.net';
    await bot.procesar(escrito(chat, 'tenes el iphone 14? tengo 400.000'));
    await dormir(250);

    // El bot acaba de contestar. Si el humano responde dentro de los 15s,
    // index.js asume que escribió el propio bot y no registra nada: se simula
    // que pasó un minuto, que es lo realista.
    state.actualizar(chat, { ultimoBot: Date.now() - 60000 });

    transcripcion = 'si, te lo dejo en 540';
    await bot.procesar(notaDeVoz(chat, true));
    await dormir(30);

    const reg = humanos(transcripcion);
    assert.ok(reg.length > 0, 'no quedó el registro');
    const lec = (propuestaDe(reg[reg.length - 1]) || {}).lectura;
    assert.ok(lec, 'el registro no trae la lectura: sigue sin poder medirse Gemini');
    assert.strictEqual(lec.fuente, 'local');
    assert.strictEqual(lec.entrega, 400000);
  });

  // Un mensaje propio escrito (no audio), como el que manda Tomi o Fran.
  const propio = (chatId, texto) => ({
    key: { remoteJid: chatId, fromMe: true, id: 'P' + Math.random() },
    pushName: 'Ailin',
    message: { conversation: texto },
  });

  await check('el aprendizaje guarda que el mensaje del cliente fue un audio y que no había nadie atendiendo', async () => {
    const chat = '5491100000032@s.whatsapp.net';
    transcripcion = 'hola, tenes el iphone 13?';
    await bot.procesar(notaDeVoz(chat));
    await dormir(250);
    state.actualizar(chat, { ultimoBot: Date.now() - 60000 });
    await bot.procesar(propio(chat, 'si, lo tenemos en azul y en negro'));
    const reg = humanos('si, lo tenemos en azul y en negro');
    assert.ok(reg.length > 0, 'no quedó el registro');
    assert.deepStrictEqual((propuestaDe(reg[reg.length - 1]) || {}).contexto, { humanoAtendiendo: false, audio: true });
  });

  await check('el aprendizaje guarda que había una persona atendiendo cuando escribió el cliente', async () => {
    const chat = '5491100000033@s.whatsapp.net';
    await bot.procesar(escrito(chat, 'hola'));
    await dormir(250);
    state.actualizar(chat, { ultimoBot: Date.now() - 60000 });
    await bot.procesar(propio(chat, 'buenas! que estabas buscando?'));
    // Escribe mientras la persona atiende: en vivo el bot no lo evalúa.
    await bot.procesar(escrito(chat, 'un 13 para regalar'));
    await dormir(30);
    await bot.procesar(propio(chat, 'dale, te paso los precios'));
    const antes = humanos('buenas! que estabas buscando?');
    assert.deepStrictEqual((propuestaDe(antes[antes.length - 1]) || {}).contexto, { humanoAtendiendo: false, audio: false });
    // "un 13 para regalar" no entra a ninguna tanda (en vivo, con una persona atendiendo,
    // no se interpreta), pero queda como evento `cliente`, y es lo último que escribió el
    // cliente antes de la segunda respuesta de la persona.
    const delChat = aprendizaje.leerTodo().filter((e) => e.chat === aprendizaje.anonimo(chat));
    const i = delChat.findIndex((e) => e.tipo === 'humano' && e.texto === 'dale, te paso los precios');
    assert.ok(i > 0, 'no quedó el registro');
    const ultimoDelCliente = delChat.slice(0, i).filter((e) => e.tipo === 'cliente').pop();
    assert.deepStrictEqual(
      { texto: ultimoDelCliente.texto, humanoAtendiendo: ultimoDelCliente.humanoAtendiendo, audio: ultimoDelCliente.audio },
      { texto: 'un 13 para regalar', humanoAtendiendo: true, audio: false }
    );
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, APR]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
