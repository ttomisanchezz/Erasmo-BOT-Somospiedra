'use strict';
/**
 * #reset desde el celular del cliente (solo NUMEROS_PRUEBA) y los leads de
 * prueba en LEADS_PRUEBA.
 *
 *   node test/reset.test.js
 *
 * Se prueba:
 *   - un cliente de la lista manda #reset: estado y recordatorio borrados, le
 *     llega "🔄 Reiniciado" y el #reset no queda en ningún lado;
 *   - fuera de la lista, o con la lista vacía, "#reset" es un mensaje más;
 *   - carreras: un #reset mientras la tanda espera, interpreta, espera un audio
 *     o manda. Lo de antes no sale ni escribe en el estado nuevo, y lo que llega
 *     después se contesta normal, desde cero;
 *   - el eco de "🔄 Reiniciado" no cuenta como una persona contestando;
 *   - un escalado de un número de prueba va a LEADS_PRUEBA y el resto a LEADS, y
 *     la pestaña se crea sola (con una planilla de mentira).
 *
 * Sin red ni planilla: entiende el extractor local, los audios se simulan y
 * Google se reemplaza por un cliente de mentira. El entorno se fija acá y no se
 * hereda del .env. Todos los números son inventados.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

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
process.env.GRUPO_AVISOS_JID = '';
process.env.AUDIO_ACTIVO = 'true';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.SHEET_ID = 'planilla-de-prueba';
// Si algo llegara a pedir el cliente real de Google, que falle sin leer credenciales.
process.env.GOOGLE_CREDENTIALS_PATH = path.join(os.tmpdir(), 'credenciales-que-no-existen-' + process.pid + '.json');
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-reset-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-reset-' + process.pid + '.jsonl');

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// --- Planilla de mentira, para registrarLead de verdad ---

const CAMPOS = [
  'fecha',
  'canal',
  'usuario',
  'modelo_consultado',
  'entrega_declarada',
  'forma_pago',
  'permuta',
  'timing',
  'zona',
  'score',
  'estado',
];
const ENCABEZADOS_LEADS = ['Fecha', 'Canal', 'Usuario', 'Modelo', 'Entrega', 'Pago', 'Permuta', 'Cuando', 'Zona', 'Score', 'Estado'];
const LEAD = {
  fecha: '15/9/2026',
  canal: 'WhatsApp',
  usuario: 'Lucia',
  modelo_consultado: 'iPhone 13',
  entrega_declarada: 300000,
  forma_pago: 'efectivo',
  permuta: '',
  timing: 'hoy',
  zona: 'Centro',
  score: 3,
  estado: 'ESCALADO - prueba',
};
const FILA = ['15/9/2026', 'WhatsApp', 'Lucia', 'iPhone 13', 300000, 'efectivo', '', 'hoy', 'Centro', 3, 'ESCALADO - prueba'];

/**
 * Anota cada pedido. `falla` se puede cambiar en el medio: { get, batchUpdate,
 * 'values.get', append }. `encabezados: null` es una LEADS sin fila 1.
 */
function planillaFalsa({ pestanas = ['CONFIG', 'LISTA', 'USADOS', 'LEADS'], encabezados = ENCABEZADOS_LEADS, falla = {} } = {}) {
  const llamadas = [];
  const hojas = pestanas.map((title, i) => ({ title, sheetId: i }));
  const pedir = async (tipo, p) => {
    llamadas.push({ tipo, ...p });
    await dormir(5);
    if (falla[tipo]) throw new Error('la planilla falló en ' + tipo);
  };
  const api = {
    spreadsheets: {
      get: async (p) => {
        await pedir('get', p);
        return { data: { sheets: hojas.map((properties) => ({ properties: { ...properties } })) } };
      },
      batchUpdate: async (p) => {
        await pedir('batchUpdate', p);
        for (const r of p.requestBody.requests) if (r.addSheet) hojas.push(r.addSheet.properties);
        return { data: {} };
      },
      values: {
        get: async (p) => {
          await pedir('values.get', p);
          return { data: encabezados ? { values: [encabezados] } : {} };
        },
        append: async (p) => {
          await pedir('append', p);
          return { data: {} };
        },
      },
    },
  };
  return { api, hojas, de: (tipo) => llamadas.filter((l) => l.tipo === tipo), tipos: () => llamadas.map((l) => l.tipo) };
}

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.usarCliente(planillaFalsa().api);
// El de verdad se prueba con la planilla de mentira; el bot usa este, que anota a qué pestaña iría.
const registrarLeadReal = sheets.registrarLead;
const leads = [];
let falloLead = null;
sheets.registrarLead = async (lead, opciones = {}) => {
  if (falloLead) throw falloLead;
  leads.push({ lead, hoja: opciones.hoja });
};

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

// Lo que llega a interpretarse, en orden. Se anota al empezar: sirve para saber
// que la tanda ya está interpretando.
const local = require('../src/extractor-local');
const lecturas = [];
let demoraEntender = 0;
gemini.entender = async (h, m) => {
  lecturas.push(m);
  await dormir(demoraEntender);
  return local.entender(m);
};
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

let transcripcion = 'hola, tenes el iphone 13?';
let demoraTranscripcion = 0;
evolution.base64DeMedia = async () => ({ base64: 'AAAA', mimetype: 'audio/ogg' });
gemini.transcribir = async () => {
  await dormir(demoraTranscripcion);
  return transcripcion;
};

// Cada envío a un cliente se anota cuando EMPIEZA, con su número de orden: uno
// que ya estaba en viaje cuando llegó el #reset no se puede frenar; uno que
// empieza después, sí.
let orden = 0;
const aClientes = [];
const alGrupo = [];
let demoraEnvio = 0;
// Cada envío devuelve su id, como Evolution v2: con eso el bot reconoce su eco.
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
// `alPostear` corre apenas se postea un envío, antes de que Evolution conteste.
let alPostear = null;
evolution.enviarTexto = async (numero, texto, delayMs) => {
  // `delay` es lo que Evolution retiene el mensaje (el "escribiendo…") antes de
  // entregarlo: se anota cuándo se posteó y con qué delay, porque al cliente le
  // llega en posted + delay, y un mensaje ya posteado no se frena (D2).
  const envio = { numero, texto, orden: ++orden, id: 'RESET' + orden, posted: Date.now(), delay: delayMs };
  aClientes.push(envio);
  if (alPostear) await alPostear(envio);
  await dormir(demoraEnvio);
  return { key: { id: envio.id } };
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
/** Un número nuevo, ya cargado en NUMEROS_TESTER (el celular de prueba). */
function deLaLista() {
  const num = '5492991100' + String(n++).padStart(3, '0');
  config.numerosTester.push(num);
  return num + '@s.whatsapp.net';
}
/** Un número nuevo, ya cargado en NUMEROS_PILOTO (un cliente real de la prueba). */
function delPiloto() {
  const num = '5492993300' + String(n++).padStart(3, '0');
  config.numerosPiloto.push(num);
  return num + '@s.whatsapp.net';
}
/** Un número nuevo que no está en ninguna lista. */
const deAfuera = () => '5492992200' + String(n++).padStart(3, '0') + '@s.whatsapp.net';

/** Corre algo con otra lista de tester (y sin pilotos) y después deja las dos como estaban. */
async function conLista(lista, fn) {
  const antes = { tester: config.numerosTester, piloto: config.numerosPiloto };
  config.numerosTester = lista;
  config.numerosPiloto = [];
  try {
    return await fn();
  } finally {
    config.numerosTester = antes.tester;
    config.numerosPiloto = antes.piloto;
  }
}

const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const mio = (chatId, texto, id = 'P' + Math.random()) => ({
  key: { remoteJid: chatId, fromMe: true, id },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const notaDeVoz = (chatId) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'A' + Math.random() },
  pushName: 'Lucia',
  message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat).map((m) => m.texto);
const delCliente = (chat) => (state.todos()[chat]?.historial || []).filter((l) => l.quien === 'cliente').map((l) => l.texto);
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  lecturas.length = 0;
  leads.length = 0;
}
async function hasta(condicion, ms = 3000) {
  const fin = Date.now() + ms;
  while (!condicion()) {
    if (Date.now() > fin) throw new Error('se cansó de esperar: el caso no llegó al punto que prueba');
    await dormir(2);
  }
}
function ponerRecordatorio(chat) {
  state.guardarRecordatorio(chat, {
    textos: ['llamarlo'],
    creado: Date.now(),
    origenes: [],
    envios: 0,
    ultimoEnvio: 0,
    estado: 'activo',
  });
}
/** Deja un chat con algo guardado: una consulta contestada y un recordatorio. */
async function conCharla(chat) {
  await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
  ponerRecordatorio(chat);
  assert.ok(state.todos()[chat]?.modelo, 'el caso no prueba nada: no guardó el modelo');
}
/**
 * Un #reset mientras la tanda manda la respuesta a "tenes el iphone 13?". Se
 * espera el primer mensaje y después `despuesDelPrimero` ms: con `demoraDelEnvio`
 * el reset cae con un envío en viaje; con `entreMensajes` largo, entre uno y otro.
 * Ningún envío que EMPIECE después del reset puede ser otro que "🔄 Reiniciado".
 */
async function resetMientrasManda({ demoraDelEnvio = 0, entreMensajes = 1, despuesDelPrimero = 0 }) {
  const chat = deLaLista();
  limpiar();
  const antes = config.ritmo.entreMensajesMs;
  demoraEnvio = demoraDelEnvio;
  config.ritmo.entreMensajesMs = entreMensajes;
  let marca;
  try {
    const primero = bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    await hasta(() => aEste(chat).length === 1);
    await dormir(despuesDelPrimero);
    assert.strictEqual(aEste(chat).length, 1, 'el caso no prueba nada: ya salió el segundo mensaje');
    marca = orden;
    await bot.procesar(escrito(chat, '#reset'));
    await primero;
  } finally {
    demoraEnvio = 0;
    config.ritmo.entreMensajesMs = antes;
  }
  const despues = aClientes.filter((m) => m.numero === chat && m.orden > marca).map((m) => m.texto);
  assert.deepStrictEqual(despues, ['🔄 Reiniciado'], 'siguió mandando después del reset');
  assert.ok(!state.todos()[chat], 'quedó algo en el estado: ' + JSON.stringify(state.todos()[chat]));
}

function sigueTodo(chat) {
  const s = state.todos()[chat];
  assert.ok(s && s.modelo, 'se borró el chat');
  assert.ok(state.recordatorios()[chat], 'se borró el recordatorio');
  assert.ok(delCliente(chat).includes('#reset'), 'el #reset no entró al historial como un mensaje más');
  assert.deepStrictEqual(lecturas, ['#reset'], 'el #reset no se interpretó como un mensaje más');
  assert.ok(!aClientes.some((m) => m.texto === '🔄 Reiniciado'), 'mandó "🔄 Reiniciado"');
}

(async () => {
  console.log('\n#reset desde el celular del cliente\n');

  await check('(a) cliente de la lista manda #reset: se borran estado y recordatorio, le llega "🔄 Reiniciado" y el #reset no queda en ningún lado', async () => {
    const chat = deLaLista();
    await conCharla(chat);
    limpiar();
    const aprendidos = aprendizaje.leerTodo().length;
    await bot.procesar(escrito(chat, '#RESET'));
    // Si hubiera entrado a una tanda, en este rato ya se habría interpretado.
    await dormir(ESPERA + 40);
    assert.ok(!state.todos()[chat], 'el chat sigue en el estado: ' + JSON.stringify(delCliente(chat)));
    assert.ok(!state.recordatorios()[chat], 'no borró el recordatorio');
    assert.deepStrictEqual(aEste(chat), ['🔄 Reiniciado']);
    assert.deepStrictEqual(lecturas, [], 'el #reset se interpretó como un mensaje');
    assert.strictEqual(aprendizaje.leerTodo().length, aprendidos, 'el #reset entró al aprendizaje');
  });

  await check('(b) cliente fuera de la lista manda #reset: no se borra nada y se procesa como un mensaje común', async () => {
    const chat = deAfuera();
    assert.ok(config.numerosTester.length, 'el caso no prueba nada: la lista está vacía');
    await conCharla(chat);
    limpiar();
    await bot.procesar(escrito(chat, '#reset'));
    sigueTodo(chat);
  });

  await check('(c) con las listas vacías, #reset de cliente no borra nada (esDestinoDePrueba dejaría pasar a todos)', async () => {
    const chat = deAfuera();
    await conLista([], async () => {
      assert.strictEqual(evolution.esDestinoDePrueba(chat), true, 'el caso no prueba nada');
      await conCharla(chat);
      limpiar();
      await bot.procesar(escrito(chat, '#reset'));
    });
    sigueTodo(chat);
  });

  console.log('\nTester y piloto (Pendientes 1, Parte C): los comandos # son solo del tester\n');

  await check('#reset desde un piloto es un mensaje común: el chat no se reinicia', async () => {
    const chat = delPiloto();
    assert.strictEqual(evolution.esDestinoDePrueba(chat), true, 'el caso no prueba nada: al piloto no se le escribe');
    await conCharla(chat);
    limpiar();
    await bot.procesar(escrito(chat, '#reset'));
    sigueTodo(chat);
  });

  await check('#resset, #reseet y #rest desde el tester reinician el chat', async () => {
    for (const typo of ['#resset', '#reseet', '#rest', '#RESSET']) {
      const chat = deLaLista();
      await conCharla(chat);
      limpiar();
      await bot.procesar(escrito(chat, typo));
      await dormir(ESPERA + 40);
      assert.ok(!state.todos()[chat], `"${typo}" no reinició el chat`);
      assert.deepStrictEqual(aEste(chat), ['🔄 Reiniciado'], `"${typo}" no confirmó el reinicio`);
      assert.deepStrictEqual(lecturas, [], `"${typo}" se interpretó como un mensaje`);
    }
  });

  await check('#hola desde el tester se descarta: no entra al historial, no se interpreta, no se aprende y no se contesta', async () => {
    const chat = deLaLista();
    await conCharla(chat);
    const antes = JSON.stringify(state.todos()[chat]);
    limpiar();
    const aprendidos = aprendizaje.leerTodo().length;
    await bot.procesar(escrito(chat, '#hola'));
    await dormir(ESPERA + 40);
    assert.strictEqual(JSON.stringify(state.todos()[chat]), antes, 'tocó el estado');
    assert.ok(!delCliente(chat).includes('#hola'), 'entró al historial');
    assert.deepStrictEqual(lecturas, [], 'se interpretó');
    assert.deepStrictEqual(aEste(chat), [], 'contestó algo');
    assert.strictEqual(aprendizaje.leerTodo().length, aprendidos, 'entró al aprendizaje');
  });

  await check('#hola desde un piloto es un mensaje común', async () => {
    const chat = delPiloto();
    limpiar();
    await bot.procesar(escrito(chat, '#hola'));
    assert.deepStrictEqual(lecturas, ['#hola'], 'no se interpretó como un mensaje');
    assert.ok(delCliente(chat).includes('#hola'), 'no entró al historial');
  });

  console.log('\nEl eco de "🔄 Reiniciado"\n');

  await check('vuelve como mensaje propio y no cuenta como una persona: el chat sigue vacío y el bot contesta lo que sigue', async () => {
    const chat = deLaLista();
    await conCharla(chat);
    await bot.procesar(escrito(chat, '#reset'));
    const aprendidos = aprendizaje.leerTodo().length;
    // El eco llega con el id del envío, como en Evolution de verdad.
    const aviso = aClientes.filter((m) => m.numero === chat && m.texto === '🔄 Reiniciado').pop();
    await bot.procesar(mio(chat, '🔄 Reiniciado', aviso.id));
    assert.ok(!state.todos()[chat], 'el eco escribió en el estado: ' + JSON.stringify(state.todos()[chat]));
    assert.strictEqual(aprendizaje.leerTodo().length, aprendidos, 'el eco entró al aprendizaje');
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    assert.ok(aEste(chat).length > 0, 'el bot quedó callado después del reset: tomó el eco como una persona');
  });

  await check('pasado el eco, un mensaje de una persona desde la cuenta sigue callando al bot', async () => {
    const chat = deLaLista();
    await bot.procesar(escrito(chat, '#reset'));
    const aviso = aClientes.filter((m) => m.numero === chat && m.texto === '🔄 Reiniciado').pop();
    await bot.procesar(mio(chat, '🔄 Reiniciado', aviso.id));
    await bot.procesar(mio(chat, 'hola! te atiendo yo'));
    assert.ok(state.todos()[chat]?.ultimoHumano > 0, 'la guarda del eco se tragó el mensaje de una persona');
  });

  console.log('\nCarreras con una tanda en curso\n');

  await check('(d) #reset mientras la tanda espera: no se interpreta, la respuesta no sale y el estado queda vacío', async () => {
    const chat = deLaLista();
    limpiar();
    const primero = bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    await dormir(10);
    assert.deepStrictEqual(lecturas, [], 'el caso no prueba nada: ya estaba interpretando');
    await bot.procesar(escrito(chat, '#reset'));
    await primero;
    assert.deepStrictEqual(aEste(chat), ['🔄 Reiniciado'], 'la respuesta de la tanda salió después del reset');
    assert.deepStrictEqual(lecturas, [], 'interpretó una tanda que el reset se había llevado');
    assert.ok(!state.todos()[chat], 'quedó algo en el estado: ' + JSON.stringify(state.todos()[chat]));
  });

  await check('(d) #reset mientras la tanda interpreta: lo que decidió no sale, no escribe en el estado nuevo y no avisa una falla', async () => {
    const chat = deLaLista();
    limpiar();
    demoraEntender = 80;
    try {
      const primero = bot.procesar(escrito(chat, 'tenes el iphone 13?'));
      await hasta(() => lecturas.length === 1);
      await bot.procesar(escrito(chat, '#reset'));
      await primero;
    } finally {
      demoraEntender = 0;
    }
    assert.deepStrictEqual(aEste(chat), ['🔄 Reiniciado'], 'la respuesta de la tanda salió después del reset');
    assert.ok(!state.todos()[chat], 'la tanda vieja escribió en el estado nuevo: ' + JSON.stringify(state.todos()[chat]));
    assert.deepStrictEqual(alGrupo, [], 'avisó algo al grupo');
  });

  await check('lo que llega después del #reset se contesta normal y desde cero, aunque la tanda vieja siguiera interpretando', async () => {
    const chat = deLaLista();
    limpiar();
    demoraEntender = 80;
    try {
      const primero = bot.procesar(escrito(chat, 'quiero el iphone 15'));
      await hasta(() => lecturas.length === 1);
      await bot.procesar(escrito(chat, '#reset'));
      await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
      await primero;
    } finally {
      demoraEntender = 0;
    }
    assert.deepStrictEqual(lecturas, ['quiero el iphone 15', 'tenes el iphone 13?']);
    const textos = aEste(chat);
    assert.strictEqual(textos[0], '🔄 Reiniciado');
    assert.ok(/495\.000/.test(textos.join(' ')), 'no contestó lo que llegó después del reset: ' + textos.join(' | ').slice(0, 160));
    assert.deepStrictEqual(delCliente(chat), ['tenes el iphone 13?'], 'el historial nuevo trae cosas de antes del reset');
    const pedidos = state.todos()[chat].modelosPedidos || [];
    assert.ok(!pedidos.some((m) => /15/.test(m)), 'quedó el modelo de antes del reset: ' + pedidos.join(', '));
  });

  await check('#reset mientras la tanda espera un audio: la transcripción no vuelve a crear el chat', async () => {
    const chat = deLaLista();
    limpiar();
    transcripcion = 'hola, tenes el iphone 13?';
    demoraTranscripcion = ESPERA + 80;
    try {
      const primero = bot.procesar(notaDeVoz(chat));
      await dormir(ESPERA + 20);
      assert.deepStrictEqual(lecturas, [], 'el caso no prueba nada: el audio ya estaba transcrito');
      await bot.procesar(escrito(chat, '#reset'));
      await primero;
    } finally {
      demoraTranscripcion = 0;
    }
    assert.deepStrictEqual(aEste(chat), ['🔄 Reiniciado']);
    assert.deepStrictEqual(lecturas, [], 'interpretó el audio de antes del reset');
    assert.ok(!state.todos()[chat], 'la transcripción volvió a crear el chat: ' + JSON.stringify(state.todos()[chat]));
  });

  // La respuesta a esta consulta tiene que ser de más de un mensaje: si no, las
  // dos que siguen no prueban nada.
  const control = deLaLista();
  limpiar();
  await bot.procesar(escrito(control, 'tenes el iphone 13?'));
  const mensajesDeLaRespuesta = aEste(control).length;

  await check('#reset mientras la tanda manda, con un envío en viaje: lo que faltaba no sale y el estado queda vacío', async () => {
    assert.ok(mensajesDeLaRespuesta >= 2, 'el caso no prueba nada: la respuesta es de un solo mensaje');
    await resetMientrasManda({ demoraDelEnvio: 40 });
  });

  await check('#reset entre un mensaje y otro de la respuesta: el que seguía no sale', async () => {
    assert.ok(mensajesDeLaRespuesta >= 2, 'el caso no prueba nada: la respuesta es de un solo mensaje');
    await resetMientrasManda({ entreMensajes: 80, despuesDelPrimero: 30 });
  });

  await check('#reset desde la cuenta del negocio también corta la tanda en curso y borra el recordatorio (sin mandar nada)', async () => {
    const chat = deLaLista();
    limpiar();
    demoraEntender = 80;
    try {
      const primero = bot.procesar(escrito(chat, 'tenes el iphone 13?'));
      ponerRecordatorio(chat);
      await hasta(() => lecturas.length === 1);
      await bot.procesar(mio(chat, '#reset'));
      await primero;
    } finally {
      demoraEntender = 0;
    }
    assert.deepStrictEqual(aEste(chat), [], 'le mandó algo al cliente');
    assert.ok(!state.todos()[chat], 'la tanda vieja escribió en el estado nuevo');
    assert.ok(!state.recordatorios()[chat], 'no borró el recordatorio');
  });

  console.log('\nEl "escribiendo…" lo hace el bot (Pendientes 1, D2)\n');

  // Evolution retiene cada mensaje `delay` ms (el "escribiendo…") y recién ahí lo
  // entrega; un mensaje ya posteado no se frena. En la prueba en vivo del 16/09 un
  // #reset llegó en ese rato y "Dale, con los $900.000 te llevas el 14 Pro" salió
  // después del "🔄 Reiniciado". Ahora la espera la hace el bot antes de cada mensaje
  // (mostrando "escribiendo…"), el control corre después de esperar y todo se postea
  // con delay 0. Contra el código de hoy, las tres primeras fallan: el primer mensaje
  // se postea con delay y le llega al cliente después del evento.
  const llegaAlCliente = (m) => m.posted + (m.delay || 0);
  /**
   * Corre "tenes el iphone 13?" (4 mensajes) y, 20 ms después de que se postea el
   * primero —en la espera del segundo—, hace `evento`. Comprueba que la tanda se
   * corta ahí y que lo que salió le llegó al cliente antes del evento. Devuelve
   * cuándo pasó el evento.
   */
  async function eventoEnLaEspera(chat, evento) {
    limpiar();
    const antes = config.ritmo.entreMensajesMs;
    config.ritmo.entreMensajesMs = 150;
    let momento = 0;
    let pendiente = null;
    alPostear = (envio) => {
      if (envio.numero !== chat || pendiente) return;
      pendiente = dormir(20).then(async () => {
        momento = Date.now();
        await evento();
      });
    };
    try {
      await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
      await pendiente;
    } finally {
      alPostear = null;
      config.ritmo.entreMensajesMs = antes;
    }
    assert.ok(momento, 'el caso no prueba nada: el evento no llegó a pasar');
    const salieron = aClientes.filter((m) => m.numero === chat && m.texto !== '🔄 Reiniciado');
    assert.strictEqual(
      salieron.length,
      1,
      `salieron ${salieron.length} mensajes de la tanda, tenía que cortarse después del primero: ` + salieron.map((m) => m.texto.slice(0, 30)).join(' | ')
    );
    assert.ok(
      llegaAlCliente(salieron[0]) <= momento,
      `el primer mensaje se posteó con delay ${salieron[0].delay} y le llega al cliente ${llegaAlCliente(salieron[0]) - momento} ms DESPUÉS del evento`
    );
    return momento;
  }

  await check('un #reset en la espera del segundo mensaje corta la tanda: ese mensaje no se manda y lo que salió le llegó antes del reset', async () => {
    const chat = deLaLista();
    const momento = await eventoEnLaEspera(chat, () => bot.procesar(escrito(chat, '#reset')));
    assert.ok(!state.todos()[chat], 'quedó algo en el estado: ' + JSON.stringify(state.todos()[chat]));
    const despues = aClientes.filter((m) => m.numero === chat && m.posted >= momento).map((m) => m.texto);
    assert.deepStrictEqual(despues, ['🔄 Reiniciado'], 'después del reset salió otra cosa');
  });

  await check('lo mismo con un #pausa', async () => {
    const chat = deLaLista();
    await eventoEnLaEspera(chat, () => bot.procesar(mio(chat, '#pausa')));
    assert.strictEqual(state.todos()[chat].pausado, true, 'no quedó pausado');
  });

  await check('lo mismo con una persona que escribe', async () => {
    const chat = deLaLista();
    await eventoEnLaEspera(chat, () => bot.procesar(mio(chat, 'hola! te atiendo yo')));
    assert.ok(state.todos()[chat].ultimoHumano > 0, 'no registró a la persona');
  });

  await check('todos los envíos de la tanda van con delay 0; el "🔄 Reiniciado" queda como estaba', async () => {
    const chat = deLaLista();
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    const tanda = aClientes.filter((m) => m.numero === chat);
    assert.ok(tanda.length >= 2, 'el caso no prueba nada: la respuesta es de un solo mensaje');
    assert.ok(tanda.every((m) => m.delay === 0), 'algún mensaje de la tanda fue con delay: ' + tanda.map((m) => m.delay).join(', '));
    limpiar();
    await bot.procesar(escrito(chat, '#reset'));
    const aviso = aClientes.find((m) => m.numero === chat && m.texto === '🔄 Reiniciado');
    assert.ok(aviso && aviso.delay !== 0, 'el "🔄 Reiniciado" cambió de delay: ' + (aviso && aviso.delay));
  });

  await check('antes de cada mensaje muestra "escribiendo…" (sendPresence composing) y espera el ritmo: el ritmo entre mensajes no cambia', async () => {
    const chat = deLaLista();
    limpiar();
    const antes = config.ritmo.entreMensajesMs;
    config.ritmo.entreMensajesMs = 60;
    const presencias = [];
    const fetchReal = globalThis.fetch;
    globalThis.fetch = async (url, opciones) => {
      if (!/\/chat\/sendPresence\//.test(String(url))) throw new Error('salió a la red a otro lado: ' + url);
      presencias.push({ t: Date.now(), body: JSON.parse(opciones.body), instancia: String(url).split('/').pop() });
      return { ok: true, json: async () => ({}) };
    };
    try {
      await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    } finally {
      globalThis.fetch = fetchReal;
      config.ritmo.entreMensajesMs = antes;
    }
    const tanda = aClientes.filter((m) => m.numero === chat);
    assert.ok(tanda.length >= 2, 'el caso no prueba nada: la respuesta es de un solo mensaje');
    assert.strictEqual(presencias.length, tanda.length, `mostró "escribiendo…" ${presencias.length} veces para ${tanda.length} mensajes`);
    for (const [i, m] of tanda.entries()) {
      const p = presencias[i];
      assert.deepStrictEqual(p.body, { number: chat, presence: 'composing', delay: 60 }, 'el cuerpo de sendPresence no es el esperado: ' + JSON.stringify(p.body));
      assert.strictEqual(p.instancia, config.evolution.instancia, 'la instancia no es la del bot');
      assert.ok(p.t <= m.posted, `el "escribiendo…" ${i + 1} no fue antes del mensaje`);
      assert.ok(m.posted - p.t >= 55, `el mensaje ${i + 1} salió ${m.posted - p.t} ms después del "escribiendo…", tenía que esperar 60`);
      if (i) assert.ok(m.posted - tanda[i - 1].posted >= 55, `entre el ${i} y el ${i + 1} pasaron ${m.posted - tanda[i - 1].posted} ms, menos que el ritmo`);
    }
  });

  await check('si el "escribiendo…" falla, se loguea y el envío sigue igual', async () => {
    const chat = deLaLista();
    limpiar();
    // globalThis.fetch tira en esta prueba: la presencia falla en cada mensaje.
    const r = await evolution.mostrarEscribiendo(chat, 10);
    assert.ok(r && r.bloqueado, 'al fallar no devolvió bloqueado: ' + JSON.stringify(r));
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    assert.ok(aEste(chat).length >= 2, 'el fallo del "escribiendo…" cortó el envío: ' + aEste(chat).join(' | '));
  });

  console.log('\nLeads de números de prueba\n');

  await check('(e) un escalado de un número de prueba va a LEADS_PRUEBA', async () => {
    const chat = deLaLista();
    limpiar();
    await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    assert.ok(alGrupo.length, 'el caso no prueba nada: no escaló');
    assert.deepStrictEqual(leads.map((l) => l.hoja), ['LEADS_PRUEBA']);
    assert.strictEqual(state.todos()[chat].escalado, true);
  });

  await check('(e) el lead de un piloto va a LEADS', async () => {
    const chat = delPiloto();
    limpiar();
    await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    assert.ok(alGrupo.length, 'el caso no prueba nada: no escaló');
    assert.deepStrictEqual(leads.map((l) => l.hoja), ['LEADS']);
    assert.strictEqual(state.todos()[chat].escalado, true);
  });

  await check('(e) con la lista vacía, un escalado va a LEADS', async () => {
    const chat = deAfuera();
    limpiar();
    await conLista([], () => bot.procesar(escrito(chat, 'puedo hablar con alguien?')));
    assert.ok(alGrupo.length, 'el caso no prueba nada: no escaló');
    assert.deepStrictEqual(leads.map((l) => l.hoja), ['LEADS']);
  });

  await check('(e) con la lista cargada, un número de afuera no anota lead: se lo trata como borrador, igual que antes', async () => {
    const chat = deAfuera();
    assert.ok(config.numerosTester.length, 'el caso no prueba nada: la lista está vacía');
    limpiar();
    await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    assert.ok(alGrupo.length, 'el caso no prueba nada: no avisó al grupo');
    assert.deepStrictEqual(leads, []);
  });

  await check('si la planilla falla, el escalado sigue: avisa al grupo y queda escalado', async () => {
    const chat = deLaLista();
    limpiar();
    falloLead = new Error('planilla caída (de mentira)');
    try {
      await bot.procesar(escrito(chat, 'puedo hablar con alguien?'));
    } finally {
      falloLead = null;
    }
    assert.ok(alGrupo.length, 'no avisó al grupo');
    assert.strictEqual(state.todos()[chat].escalado, true);
  });

  console.log('\nLa pestaña LEADS_PRUEBA (planilla de mentira)\n');

  await check('sin pestaña pedida va a LEADS como siempre: la misma fila, sin consultar ni crear nada', async () => {
    const p = planillaFalsa();
    sheets.usarCliente(p.api);
    await registrarLeadReal(LEAD);
    await registrarLeadReal(LEAD, { hoja: 'LEADS' });
    assert.deepStrictEqual(p.tipos(), ['append', 'append']);
    for (const a of p.de('append')) {
      assert.strictEqual(a.range, 'LEADS!A:K');
      assert.deepStrictEqual(a.requestBody.values, [FILA]);
    }
  });

  await check('LEADS_PRUEBA que no existe: se crea con los encabezados de LEADS, y la fila va ahí con las mismas columnas', async () => {
    const p = planillaFalsa();
    sheets.usarCliente(p.api);
    await registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' });
    assert.deepStrictEqual(p.tipos(), ['get', 'values.get', 'batchUpdate', 'append']);
    assert.strictEqual(p.de('values.get')[0].range, 'LEADS!A1:K1');
    const [crear, encabezar] = p.de('batchUpdate')[0].requestBody.requests;
    const id = crear.addSheet.properties.sheetId;
    assert.strictEqual(crear.addSheet.properties.title, 'LEADS_PRUEBA');
    assert.ok(!p.hojas.slice(0, 4).some((h) => h.sheetId === id), 'eligió el id de una pestaña que ya existe');
    assert.deepStrictEqual(encabezar.updateCells.start, { sheetId: id, rowIndex: 0, columnIndex: 0 });
    assert.deepStrictEqual(encabezar.updateCells.rows[0].values.map((v) => v.userEnteredValue.stringValue), ENCABEZADOS_LEADS);
    const [append] = p.de('append');
    assert.strictEqual(append.range, 'LEADS_PRUEBA!A:K');
    assert.deepStrictEqual(append.requestBody.values, [FILA]);
  });

  await check('se consulta una vez por arranque, y dos leads juntos no la crean dos veces', async () => {
    const p = planillaFalsa();
    sheets.usarCliente(p.api);
    await Promise.all([registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' }), registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' })]);
    await registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' });
    assert.strictEqual(p.de('get').length, 1, 'consultó la pestaña más de una vez');
    assert.strictEqual(p.de('batchUpdate').length, 1, 'la creó más de una vez');
    assert.strictEqual(p.de('append').length, 3);
  });

  await check('si LEADS_PRUEBA ya existe no se toca: solo se agrega la fila', async () => {
    const p = planillaFalsa({ pestanas: ['LEADS', 'LEADS_PRUEBA'] });
    sheets.usarCliente(p.api);
    await registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' });
    assert.deepStrictEqual(p.tipos(), ['get', 'append']);
  });

  await check('si no puede leer los encabezados de LEADS (o están vacíos), usa los nombres de campo', async () => {
    for (const opciones of [{ falla: { 'values.get': true } }, { encabezados: null }]) {
      const p = planillaFalsa(opciones);
      sheets.usarCliente(p.api);
      await registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' });
      const [, encabezar] = p.de('batchUpdate')[0].requestBody.requests;
      assert.deepStrictEqual(encabezar.updateCells.rows[0].values.map((v) => v.userEnteredValue.stringValue), CAMPOS);
      assert.strictEqual(p.de('append')[0].range, 'LEADS_PRUEBA!A:K');
    }
  });

  await check('si no puede crear la pestaña: tira (el bot lo loguea), nunca escribe en LEADS, y el próximo lead reintenta', async () => {
    const falla = { batchUpdate: true };
    const p = planillaFalsa({ falla });
    sheets.usarCliente(p.api);
    await assert.rejects(registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' }));
    assert.deepStrictEqual(p.de('append'), [], 'escribió la fila igual');
    falla.batchUpdate = false;
    await registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' });
    assert.strictEqual(p.de('get').length, 2, 'no volvió a consultar la pestaña');
    assert.deepStrictEqual(p.de('append').map((a) => a.range), ['LEADS_PRUEBA!A:K']);
  });

  await check('si falla el append en LEADS_PRUEBA, no cae a LEADS y el próximo lead vuelve a buscar la pestaña', async () => {
    const falla = { append: true };
    const p = planillaFalsa({ pestanas: ['LEADS', 'LEADS_PRUEBA'], falla });
    sheets.usarCliente(p.api);
    await assert.rejects(registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' }));
    falla.append = false;
    await registrarLeadReal(LEAD, { hoja: 'LEADS_PRUEBA' });
    assert.strictEqual(p.de('get').length, 2, 'no volvió a buscar la pestaña');
    assert.ok(p.de('append').every((a) => a.range === 'LEADS_PRUEBA!A:K'), 'cayó a LEADS');
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
