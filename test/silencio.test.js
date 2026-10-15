'use strict';
/**
 * Escalar en silencio: cuando hace falta una persona, al cliente no se le dice
 * nada y el grupo se entera.
 *
 *   node test/silencio.test.js
 *
 * Antes el bot contestaba "ahora te responde fran", "dejame verlo con fran" o
 * "si preferis te llama fran": promesas a nombre de otro que nadie garantiza.
 * Callarse solo sirve si el aviso al grupo no se pierde nunca, y cada forma de
 * perderlo tiene su caso acá.
 *
 * El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GRUPO = '120363000000000002@g.us';

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
process.env.AUDIO_ACTIVO = 'true';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-silencio-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-silencio-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
const leads = [];
sheets.registrarLead = async (lead) => {
  leads.push(lead);
};

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);
// Evolution no entrega el archivo: el audio queda sin transcribir.
evolution.base64DeMedia = async () => null;

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
const avisarAnotando = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.avisarGrupo = avisarAnotando;
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');

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

let n = 0;
const nuevoChat = () => '54929966' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() },
  pushName: 'Ailin',
  message: { conversation: texto },
});
const notaDeVoz = (chatId) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'A' + Math.random() },
  pushName: 'Ailin',
  message: { audioMessage: { mimetype: 'audio/ogg', seconds: 5, ptt: true } },
});

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  leads.length = 0;
}

(async () => {
  console.log('\nDonde antes prometía a otro, ahora se calla y avisa\n');

  await check('pide una persona: al cliente nada, al grupo el aviso con el link', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente: ' + JSON.stringify(aClientes));
    assert.strictEqual(alGrupo.length, 1, 'no avisó al grupo');
    assert.ok(/^🔕 SIN RESPUESTA/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(alGrupo[0].includes('https://wa.me/' + chat.split('@')[0]), 'el aviso no lleva el link');
    assert.ok(/escribile vos/.test(alGrupo[0]), 'el aviso no dice que nadie le contestó');
  });

  await check('audio que no se pudo transcribir: tampoco le promete que lo llaman', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(notaDeVoz(chat));
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente: ' + JSON.stringify(aClientes));
    assert.strictEqual(alGrupo.length, 1, 'no avisó al grupo');
    assert.ok(/^🔕/.test(alGrupo[0]) && /audio/.test(alGrupo[0]), alGrupo[0]);
  });

  await check('en vivo, la primera vez queda escalado y anotado en la planilla', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    assert.strictEqual(state.todos()[chat].escalado, true, 'no quedó escalado');
    assert.strictEqual(leads.length, 1, 'no anotó el lead');
  });

  // Hasta el 15/09/2026 este caso esperaba un aviso nuevo. Desde el bloque 2 de la
  // auditoría un chat escalado queda callado: el mensaje nuevo queda en el historial
  // y lo junta el recordatorio del escalado (test/control.test.js).
  await check('un chat ya escalado queda callado: el mensaje nuevo no se contesta ni avisa en el momento', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'hola tenes el 13?'));
    state.actualizar(chat, { escalado: true, escaladoEn: Date.now() });
    limpiar();
    await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente');
    assert.strictEqual(alGrupo.length, 0, 'avisó por un mensaje de un chat escalado');
    assert.strictEqual(leads.length, 0, 'volvió a anotar un lead que ya estaba');
  });

  // En vivo el primer aviso ya deja el chat escalado y callado; la regla de no repetir
  // el mismo motivo se ve donde no se escala: en borrador (o fuera de la lista de prueba).
  await check('el mismo motivo seguido se avisa una vez; un motivo nuevo, otra vez (en borrador, donde no queda escalado)', async () => {
    const chat = nuevoChat();
    config.modoBorrador = true;
    try {
      await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
      limpiar();
      await bot.procesar(escrito(chat, 'hola? puedo hablar con alguien?'));
      await bot.procesar(escrito(chat, 'quiero hablar con una persona'));
      assert.strictEqual(alGrupo.length, 0, 'repitió el mismo aviso ' + alGrupo.length + ' veces');
      await bot.procesar(escrito(chat, 'me lo podes guardar hasta mañana?'));
      assert.strictEqual(alGrupo.length, 1, 'no avisó el motivo nuevo');
      assert.ok(/guard/.test(alGrupo[0]), alGrupo[0]);
      assert.strictEqual(aClientes.length, 0, 'le escribió al cliente');
    } finally {
      config.modoBorrador = false;
    }
  });

  await check('si el aviso no salió, se reintenta con el próximo mensaje', async () => {
    const chat = nuevoChat();
    evolution.avisarGrupo = async () => ({ bloqueado: true, motivo: 'fallo de envio' });
    try {
      await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    } finally {
      evolution.avisarGrupo = avisarAnotando;
    }
    limpiar();
    await bot.procesar(escrito(chat, 'hola? puedo hablar con alguien?'));
    assert.strictEqual(alGrupo.length, 1, 'dio por avisado un aviso que no salió');
  });

  await check('modo escucha: no sale nada, ni al cliente ni al grupo', async () => {
    const chat = nuevoChat();
    limpiar();
    config.modoEscucha = true;
    try {
      await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    } finally {
      config.modoEscucha = false;
    }
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 0);
  });

  await check('modo borrador: el aviso sale, pero no escala ni anota el lead', async () => {
    const chat = nuevoChat();
    limpiar();
    config.modoBorrador = true;
    try {
      await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    } finally {
      config.modoBorrador = false;
    }
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1, 'no avisó en borrador');
    assert.strictEqual(leads.length, 0, 'anotó un lead en borrador');
    assert.ok(!state.todos()[chat].escalado, 'escaló en borrador');
  });

  // Bloque 10 (decisión de Tomás del 25/09/2026): "tengo 420 dólares y el resto en pesos"
  // escalaba callado bien, pero el aviso decía "Entrega: $420.000". Un monto en dólares
  // no es una entrega en pesos: en el aviso va como US$, sin convertir nada.
  await check('dólares con monto: escala callado y el aviso dice US$420, no $420.000', async () => {
    const chat = '5490000000001@s.whatsapp.net';
    limpiar();
    await bot.procesar(escrito(chat, 'tengo 420 dólares y el resto en pesos'));
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente: ' + JSON.stringify(aClientes));
    assert.strictEqual(alGrupo.length, 1, 'no avisó al grupo');
    assert.ok(/Entrega: US\$420\b/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(!alGrupo[0].includes('$420.000'), alGrupo[0]);
    assert.ok(!state.todos()[chat].entrega, 'quedó una entrega en pesos: ' + state.todos()[chat].entrega);
  });

  // Gana el último monto, como con la entrega: si después dice un monto en pesos, el aviso
  // lleva ese y no los dólares de antes. En borrador, donde el chat no queda escalado.
  await check('dólares y después un monto en pesos: el aviso lleva los pesos, sin los US$ de antes', async () => {
    const chat = '5490000000004@s.whatsapp.net';
    config.modoBorrador = true;
    try {
      await bot.procesar(escrito(chat, 'tengo 420 dólares y el resto en pesos'));
      await bot.procesar(escrito(chat, 'bueno tengo 300.000, tenes el 13?'));
      limpiar();
      await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
      assert.strictEqual(alGrupo.length, 1, 'no avisó al grupo');
      assert.ok(alGrupo[0].includes('Entrega: $300.000\n'), alGrupo[0]);
      assert.ok(!alGrupo[0].includes('US$'), alGrupo[0]);
    } finally {
      config.modoBorrador = false;
    }
  });

  console.log('\nLo demás sigue igual\n');

  await check('una consulta normal sigue recibiendo respuesta y no avisa', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'hola tenes el 13?'));
    assert.ok(aClientes.length > 0, 'no le contestó');
    assert.strictEqual(alGrupo.length, 0);
  });

  // Respetar lo que dijo una persona de la cuenta (01/10/2026, decisión de Tomás; caso Jazz):
  // si en las últimas 72 h una persona dejó algo pendiente o acordado y el cliente escribe
  // sobre eso, el bot no contesta: escala callado, con la frase de la persona en el aviso.
  console.log('\nLo que dijo una persona de la cuenta (01/10/2026)\n');

  const mio = (chatId, texto) => ({
    key: { remoteJid: chatId, fromMe: true, id: 'P' + Math.random() },
    pushName: 'Ailin',
    message: { conversation: texto },
  });
  const PERSONA = 'ahi te confirmo bien que tengo al 100%';
  const lecturas = [];
  const conLectura = (extra) => {
    gemini.entender = async (...args) => {
      lecturas.push(args);
      return { ...local.entender(args[1]), ...extra };
    };
  };
  const hace = (chat, minutos) => state.actualizar(chat, { ultimoHumano: Date.now() - minutos * 60 * 1000 });

  await check('la persona dejó algo pendiente y el cliente vuelve con eso pasados los 45 min: callado, con la frase en el aviso', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes con bateria al 100?'));
    await bot.procesar(mio(chat, PERSONA));
    hace(chat, 51);
    conLectura({ dijo_persona: PERSONA });
    limpiar();
    try {
      await bot.procesar(escrito(chat, 'y? tenes al 100?'));
    } finally {
      gemini.entender = async (h, m) => local.entender(m);
    }
    assert.strictEqual(aClientes.length, 0, 'le contestó: ' + JSON.stringify(aClientes));
    assert.strictEqual(alGrupo.length, 1, 'no avisó al grupo');
    assert.ok(/^🔕 SIN RESPUESTA/.test(alGrupo[0]) && alGrupo[0].includes(PERSONA), 'el aviso no trae la frase: ' + alGrupo[0]);
  });

  await check('dentro de los 45 min sigue el silencio de siempre, antes que todo esto: ni siquiera lo interpreta', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes con bateria al 100?'));
    await bot.procesar(mio(chat, PERSONA));
    lecturas.length = 0;
    conLectura({ dijo_persona: PERSONA });
    limpiar();
    try {
      await bot.procesar(escrito(chat, 'y? tenes al 100?'));
    } finally {
      gemini.entender = async (h, m) => local.entender(m);
    }
    assert.strictEqual(lecturas.length, 0, 'lo interpretó');
    assert.strictEqual(aClientes.length + alGrupo.length, 0);
  });

  await check('al leer, Gemini ve "Persona de la cuenta" y "Bot" por separado, y las últimas 5 líneas de persona con su hora aunque el historial las haya perdido', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    await bot.procesar(mio(chat, 'mañana entran iphones 13'));
    hace(chat, 60);
    // Una línea más que el tope del historial (30 desde el 01/10/2026): la de la persona se cae.
    for (let i = 0; i <= state.LARGO_HISTORIAL; i++) state.agregarAlHistorial(chat, i % 2 ? 'vendedor' : 'cliente', 'charla ' + i);
    const s = state.obtener(chat);
    assert.ok(!s.historial.some((l) => l.humano), 'el caso no prueba nada: la línea de la persona sigue en el historial');
    assert.ok(
      (s.lineasPersona || []).some((l) => l.texto === 'mañana entran iphones 13' && l.ts > 0),
      'no guardó aparte la línea de la persona: ' + JSON.stringify(s.lineasPersona)
    );
    lecturas.length = 0;
    conLectura({});
    try {
      await bot.procesar(escrito(chat, 'hola, entraron los 13?'));
    } finally {
      gemini.entender = async (h, m) => local.entender(m);
    }
    assert.strictEqual(lecturas.length, 1, 'no lo interpretó');
    const [historial, , , personas] = lecturas[0];
    assert.ok(/^Bot: /m.test(historial) && !/^Vendedor: /m.test(historial), 'el historial no dice "Bot": ' + historial);
    assert.ok(Array.isArray(personas) && personas.some((l) => l.texto === 'mañana entran iphones 13' && l.ts > 0), 'no le pasó la línea de la persona: ' + JSON.stringify(personas));
    state.agregarAlHistorial(chat, 'vendedor', 'te aviso', { humano: true });
    assert.ok(/^Persona de la cuenta: te aviso$/m.test(state.historialTexto(chat)), state.historialTexto(chat));
    for (let i = 0; i < 6; i++) state.agregarAlHistorial(chat, 'vendedor', 'persona ' + i, { humano: true });
    assert.deepStrictEqual(state.obtener(chat).lineasPersona.map((l) => l.texto), ['persona 1', 'persona 2', 'persona 3', 'persona 4', 'persona 5']);
    // Las mismas líneas están en el historial y aparte: se cuentan una vez, también con horas
    // distintas (acá, en la prueba, caen todas en el mismo milisegundo).
    const linea = (texto, ts) => ({ quien: 'vendedor', texto, ts, humano: true });
    const repetidas = { historial: ['a', 'b', 'c', 'd', 'e'].map((x, i) => linea(x, 1000 + i)), lineasPersona: ['a', 'b', 'c', 'd', 'e'].map((x, i) => ({ texto: x, ts: 1000 + i })) };
    assert.deepStrictEqual(state.lineasDePersona(repetidas).map((l) => l.texto), ['a', 'b', 'c', 'd', 'e']);
    assert.deepStrictEqual(state.lineasDePersona(state.obtener(chat)).map((l) => l.texto), ['persona 1', 'persona 2', 'persona 3', 'persona 4', 'persona 5']);
  });

  // Una foto o un documento de la persona entra al historial como una línea de persona sin texto.
  const fotoMia = (chatId) => ({
    key: { remoteJid: chatId, fromMe: true, id: 'F' + Math.random() },
    pushName: 'Ailin',
    message: { imageMessage: { mimetype: 'image/jpeg' } },
  });

  await check('una foto de la persona (sin texto) no es algo dicho: si Gemini falla, contesta igual', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    await bot.procesar(fotoMia(chat));
    hace(chat, 60);
    assert.ok(state.obtener(chat).historial.some((l) => l.humano && !l.texto), 'el caso no prueba nada: la foto no quedó como línea de persona');
    conLectura({ _geminiFallo: true });
    limpiar();
    try {
      await bot.procesar(escrito(chat, 'y el 15?'));
    } finally {
      gemini.entender = async (h, m) => local.entender(m);
    }
    assert.ok(aClientes.length > 0, 'no le contestó: ' + alGrupo.join(' | '));
  });

  await check('las fotos de la persona no le sacan el lugar a lo que dijo: con 5 fotos después, "mañana entran" sigue contando', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    await bot.procesar(mio(chat, 'mañana entran iphones 13'));
    for (let i = 0; i < 5; i++) await bot.procesar(fotoMia(chat));
    // Una línea más que el tope del historial (30 desde el 01/10/2026): la de la persona se cae.
    for (let i = 0; i <= state.LARGO_HISTORIAL; i++) state.agregarAlHistorial(chat, i % 2 ? 'vendedor' : 'cliente', 'charla ' + i);
    hace(chat, 60);
    conLectura({ dijo_persona: 'mañana entran iphones 13' });
    limpiar();
    try {
      await bot.procesar(escrito(chat, 'hola entraron los 13?'));
    } finally {
      gemini.entender = async (h, m) => local.entender(m);
    }
    assert.strictEqual(aClientes.length, 0, 'le contestó: ' + JSON.stringify(aClientes));
    assert.ok(alGrupo.some((t) => t.includes('mañana entran iphones 13')), 'el aviso no trae la frase: ' + alGrupo.join(' | '));
  });

  await check('una escalación con pregunta (turno) le escribe y avisa con 🔔', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    limpiar();
    await bot.procesar(escrito(chat, 'me podes dar un turno para hoy?'));
    assert.ok(aClientes.length > 0, 'no le preguntó el horario');
    assert.strictEqual(alGrupo.filter((t) => /^🔔 LEAD/.test(t)).length, 1);
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
