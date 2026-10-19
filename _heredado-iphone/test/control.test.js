'use strict';
/**
 * Control humano (bloque 2 de la auditoría del 15/09/2026, hallazgo A3).
 *
 *   node test/control.test.js
 *
 * Se prueba:
 *   - autoría por id: un mensaje propio es del bot si su id es de un envío del bot,
 *     o si llega mientras ese envío está en vuelo (el eco antes que el id); cualquier
 *     otro es de una persona, sin la ventana de 15 s de antes;
 *   - el control antes de CADA envío de la tanda: pausa, escalado, una persona que
 *     escribe y un mensaje nuevo del cliente (que rearma la respuesta con los dos);
 *   - el chat escalado: callado, un solo recordatorio a los 30 min con lo que escribió
 *     el cliente, y las dos vueltas solas (escribió alguien de la cuenta; 24 h sin nadie);
 *   - #pausa y #sigue desde el grupo, con el número;
 *   - el seguimiento y los recordatorios no le escriben a un chat escalado o pausado;
 *   - /salud y el resumen muestran los escalados sin tomar.
 *
 * Nada espera de verdad lo que depende del tiempo: los barridos corren con un reloj
 * simulado y las marcas del estado se corren hacia atrás. Sin red, extractor local y
 * números inventados. El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000077@g.us';
const MIN = 60 * 1000;
const HORA = 60 * MIN;

process.env.ESPERA_MIN_MS = '20';
process.env.ESPERA_MAX_MS = '30';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'true';
process.env.SEGUIMIENTO_MINUTOS = '45';
process.env.SEGUIMIENTO_MAX_HORAS = '24';
process.env.SEGUIMIENTO_MAX_POR_BARRIDO = '10';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
// Bloque Ninjo 1b: la franja del seguimiento, también abierta todo el día.
process.env.SEGUIMIENTO_FRANJA_DESDE = '0';
process.env.SEGUIMIENTO_FRANJA_HASTA = '24';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
process.env.ESCALADO_RECORDATORIO_MIN = '30';
process.env.ESCALADO_REANUDAR_HORAS = '24';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-control-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-control-' + process.pid + '.jsonl');

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
const lecturas = [];
gemini.entender = async (h, m) => {
  lecturas.push(m);
  return local.entender(m);
};
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

// Evolution de mentira: cada envío devuelve su id, como Evolution v2 (key.id).
// `alEnviar` corre ANTES de que vuelva esa respuesta: ahí se simula lo que pasa con
// el envío en vuelo (un eco, una persona que escribe, un #pausa, un mensaje nuevo).
let idN = 0;
let sinId = false;
const aClientes = [];
const alGrupo = [];
let alEnviar = null;
async function envio(numero, tipo, texto) {
  const id = 'BOT' + ++idN;
  const registro = { numero, tipo, texto, id };
  aClientes.push(registro);
  if (alEnviar) await alEnviar(registro);
  return sinId ? {} : { key: { remoteJid: numero, fromMe: true, id }, status: 'PENDING' };
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
const aprendizaje = require('../src/aprendizaje');
// Cuántas respuestas de una persona hay en el registro de aprendizaje (eventos `humano`, bloque 6).
const humanosAprendidos = () => aprendizaje.leerTodo().filter((e) => e.tipo === 'humano').length;
const resumen = require('../src/resumen');

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
const nuevoChat = () => '54929988' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const numero = (chat) => chat.split('@')[0];
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
/** Un mensaje escrito desde la cuenta del negocio (o su eco, si lleva el id de un envío). */
const mio = (chatId, texto, id = 'H' + Math.random()) => ({
  key: { remoteJid: chatId, fromMe: true, id },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
const vendedor = (chat) =>
  ((state.todos()[chat] || {}).historial || []).filter((l) => l.quien === 'vendedor').map((l) => l.texto);
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  lecturas.length = 0;
  leads.length = 0;
  alEnviar = null;
}
/** Escala de verdad: pedir la cotización en dólares escala en silencio. */
async function escalarPorDolares(chat) {
  await bot.procesar(escrito(chat, 'me cotizas el 13 en dolares?'));
  assert.strictEqual((state.todos()[chat] || {}).escalado, true, 'el caso no prueba nada: no quedó escalado');
  await dormir(2); // lo que escriba después tiene que quedar con una hora posterior al escalado
}
function pedirSalud(servidor) {
  return new Promise((resolve, reject) => {
    http
      .get({ host: '127.0.0.1', port: servidor.address().port, path: '/salud' }, (res) => {
        let texto = '';
        res.on('data', (c) => (texto += c));
        res.on('end', () => resolve(texto));
      })
      .on('error', reject);
  });
}

(async () => {
  console.log('\nAutoría por id\n');

  await check('humano_15s: una persona que contesta enseguida del bot entra al historial, calla al bot y va al aprendizaje', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: el bot no contestó');
    const aprendidos = humanosAprendidos();
    await bot.procesar(mio(chat, 'si! lo tenemos en azul y en negro'));
    const s = state.todos()[chat];
    assert.ok(s.ultimoHumano > 0, 'no marcó a la persona: se perdió por caer dentro de los 15 s');
    assert.ok(vendedor(chat).includes('si! lo tenemos en azul y en negro'), 'no entró al historial');
    assert.strictEqual(humanosAprendidos(), aprendidos + 1, 'no entró al aprendizaje');
    assert.ok(
      aprendizaje.leerTodo().some((e) => e.tipo === 'humano' && e.texto === 'si! lo tenemos en azul y en negro'),
      'entró al aprendizaje otra cosa'
    );
    limpiar();
    await bot.procesar(escrito(chat, 'y el 14?'));
    assert.deepStrictEqual(aEste(chat), [], 'el bot siguió hablando con una persona atendiendo');
  });

  await check('el eco de un envío del bot se reconoce por su id, aunque llegue tarde', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    const [primero] = aEste(chat);
    assert.ok(primero, 'el caso no prueba nada: el bot no contestó');
    const antes = vendedor(chat).length;
    const aprendidos = humanosAprendidos();
    // Reloj simulado: el envío "fue" hace 20 s. Con la regla vieja de 15 s, esto era una persona.
    state.actualizar(chat, { ultimoBot: Date.now() - 20000 });
    await bot.procesar(mio(chat, primero.texto, primero.id));
    assert.ok(!state.todos()[chat].ultimoHumano, 'tomó el eco del bot como una persona');
    assert.strictEqual(vendedor(chat).length, antes, 'el eco entró al historial');
    assert.strictEqual(humanosAprendidos(), aprendidos, 'el eco entró al aprendizaje');
  });

  await check('el eco que llega ANTES que la respuesta de Evolution (envío en vuelo) tampoco es una persona', async () => {
    const chat = nuevoChat();
    limpiar();
    let ecos = 0;
    alEnviar = async ({ numero: destino, texto, id }) => {
      if (destino !== chat) return;
      ecos++;
      await bot.procesar(mio(chat, texto, id));
    };
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    alEnviar = null;
    assert.ok(ecos >= 2, 'el caso no prueba nada: la respuesta es de un solo mensaje');
    assert.ok(!state.todos()[chat].ultimoHumano, 'tomó un eco como una persona');
    assert.strictEqual(aEste(chat).length, ecos, 'un eco cortó la tanda');
    const v = vendedor(chat);
    assert.strictEqual(new Set(v).size, v.length, 'un eco duplicó una línea del historial');
  });

  await check('si Evolution no devuelve id, no se anota nada: un eco que llega después cuenta como persona', async () => {
    const chat = nuevoChat();
    limpiar();
    sinId = true;
    try {
      await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    } finally {
      sinId = false;
    }
    const [primero] = aEste(chat);
    await bot.procesar(mio(chat, primero.texto, primero.id));
    assert.ok(state.todos()[chat].ultimoHumano > 0, 'reconoció un eco sin id anotado');
  });

  await check('el registro de ids es acotado: por chat y por tiempo', async () => {
    const autoria = require('../src/autoria');
    const chat = nuevoChat();
    const t0 = Date.now();
    for (let i = 0; i < autoria.MAX_POR_CHAT + 10; i++) {
      const vuelo = autoria.despegar(chat, 'texto', 'hola ' + i, t0);
      autoria.aterrizar(vuelo, { key: { id: 'ID' + i } }, t0);
    }
    assert.strictEqual(autoria.cuantos(chat, t0), autoria.MAX_POR_CHAT, 'el registro creció sin tope');
    assert.strictEqual(autoria.esDelBot(chat, mio(chat, 'hola 0', 'ID0'), t0), false, 'guardó el más viejo pasado el tope');
    const ultimo = mio(chat, 'x', 'ID' + (autoria.MAX_POR_CHAT + 9));
    assert.strictEqual(autoria.esDelBot(chat, ultimo, t0), true);
    assert.strictEqual(autoria.esDelBot(chat, ultimo, t0 + autoria.TTL_MS + 1), false, 'no vence con el tiempo');
    assert.strictEqual(autoria.cuantos(chat, t0 + autoria.TTL_MS + 1), 0, 'no liberó lo vencido');
  });

  console.log('\nControl antes de cada envío\n');

  // La respuesta a esta consulta tiene que ser de varios mensajes: si no, los cortes no prueban nada.
  const control = nuevoChat();
  limpiar();
  await bot.procesar(escrito(control, 'tenes el iphone 13?'));
  const LARGO = aEste(control).length;

  /** Corre la consulta y, en el primer envío a ese chat, hace `enElPrimero`. */
  async function cortarEnElPrimero(chat, enElPrimero, texto = 'tenes el iphone 13?') {
    assert.ok(LARGO >= 2, 'el caso no prueba nada: la respuesta es de un solo mensaje');
    let hecho = false;
    alEnviar = async ({ numero: destino }) => {
      if (destino !== chat || hecho) return;
      hecho = true;
      await enElPrimero();
    };
    try {
      await bot.procesar(escrito(chat, texto));
    } finally {
      alEnviar = null;
    }
  }

  await check('pausa_durante_tanda: un #pausa después del primer envío corta lo que faltaba', async () => {
    const chat = nuevoChat();
    limpiar();
    await cortarEnElPrimero(chat, () => bot.procesar(mio(chat, '#pausa')));
    assert.strictEqual(aEste(chat).length, 1, `después del #pausa salieron ${aEste(chat).length - 1} mensajes más`);
    assert.strictEqual(state.todos()[chat].pausado, true);
  });

  await check('un chat que queda escalado en medio de la tanda no recibe lo que faltaba', async () => {
    const chat = nuevoChat();
    limpiar();
    await cortarEnElPrimero(chat, async () => state.actualizar(chat, { escalado: true, escaladoEn: Date.now() }));
    assert.strictEqual(aEste(chat).length, 1, `a un chat escalado le salieron ${aEste(chat).length - 1} mensajes más`);
  });

  await check('una persona que escribe en medio de la tanda la corta', async () => {
    const chat = nuevoChat();
    limpiar();
    await cortarEnElPrimero(chat, () => bot.procesar(mio(chat, 'dejame que le contesto yo')));
    assert.strictEqual(aEste(chat).length, 1, `con una persona escribiendo salieron ${aEste(chat).length - 1} mensajes más`);
    assert.ok(state.todos()[chat].ultimoHumano > 0);
  });

  await check('un mensaje nuevo del cliente en medio de la tanda la corta, y la siguiente contesta los dos juntos', async () => {
    const chat = nuevoChat();
    limpiar();
    await cortarEnElPrimero(chat, () => bot.procesar(escrito(chat, 'y el 14?')));
    assert.deepStrictEqual(lecturas, ['tenes el iphone 13?', 'tenes el iphone 13?\ny el 14?']);
    const textos = aEste(chat).map((m) => m.texto);
    assert.ok(textos.length >= 2, 'la tanda siguiente no contestó');
    assert.ok(/te paso el 13 y el 14/i.test(textos[1]), 'después del corte no contestó los dos: ' + textos.join(' | ').slice(0, 200));
  });

  await check('tras dos cortes seguidos por mensajes nuevos, la tanda siguiente sale entera: nunca queda sin contestar', async () => {
    const chat = nuevoChat();
    limpiar();
    const extras = ['y el 14?', 'y el 15?', 'y el 16?'];
    let tandaVista = 0;
    alEnviar = async ({ numero: destino }) => {
      if (destino !== chat || !extras.length || lecturas.length === tandaVista) return;
      // En el primer envío de cada tanda el cliente manda algo más (tres veces seguidas).
      tandaVista = lecturas.length;
      await bot.procesar(escrito(chat, extras.shift()));
    };
    try {
      await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    } finally {
      alEnviar = null;
    }
    assert.deepStrictEqual(lecturas, [
      'tenes el iphone 13?',
      'tenes el iphone 13?\ny el 14?',
      'tenes el iphone 13?\ny el 14?\ny el 15?',
      'y el 16?',
    ]);
  });

  console.log('\nChat escalado\n');

  await check('escalado: un mensaje nuevo del cliente entra al historial, no se contesta y no avisa en el momento', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    assert.strictEqual(leads.length, 1, 'no anotó el lead');
    limpiar();
    await bot.procesar(escrito(chat, 'hola? tenes el iphone 13?'));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó a un chat escalado');
    assert.deepStrictEqual(lecturas, [], 'interpretó el mensaje de un chat escalado');
    assert.deepStrictEqual(alGrupo, [], 'avisó por el mensaje');
    const h = state.todos()[chat].historial;
    assert.ok(h.some((l) => l.quien === 'cliente' && l.texto === 'hola? tenes el iphone 13?'), 'no quedó en el historial');
  });

  await check('los escalados de "no entendí" no callan el chat: el bot sigue atendiendo, y una persona que escribe igual corta', async () => {
    const chat = nuevoChat();
    limpiar();
    // Dos mensajes seguidos que no se entienden: escala y avisa en el momento, pero
    // no calla el chat (si callara, el crédito sin venta no llegaría a su aviso y un
    // cliente al que no se le entendió quedaría sin respuesta hasta que alguien lo tome).
    await bot.procesar(escrito(chat, 'asdasd'));
    await bot.procesar(escrito(chat, 'qwrtyp'));
    const s = state.todos()[chat];
    assert.strictEqual(s.escalado, true, 'el caso no prueba nada: no escaló por no entender');
    assert.strictEqual(s.escaladoCalla, false, 'ese escalado dejó callado el chat');
    assert.ok(alGrupo.some((t) => /no se entienden/.test(t)), 'no avisó al grupo en el momento del escalado');
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    assert.ok(aEste(chat).length > 0, 'dejó de contestar un chat que solo escaló por no entender');
    // Y en ese chat el corte por una persona que escribe sigue valiendo.
    limpiar();
    await cortarEnElPrimero(chat, () => bot.procesar(mio(chat, 'yo sigo con este')), 'y el 15?');
    assert.strictEqual(aEste(chat).length, 1, `salieron ${aEste(chat).length - 1} mensajes encima de la persona`);
  });

  await check('recordatorio del escalado: uno solo, a los 30 min, con lo que escribió, el link y el motivo', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    await bot.procesar(escrito(chat, 'hola?'));
    await bot.procesar(escrito(chat, 'me pasas el precio en dolares?'));
    const t0 = state.todos()[chat].escaladoEn;
    assert.ok(t0, 'no guardó cuándo escaló');
    limpiar();
    // El barrido recorre todos los chats: se miran solo los avisos de este.
    const deEste = () => alGrupo.filter((t) => t.includes('wa.me/' + numero(chat)));
    await bot.revisarEscalados(t0 + 29 * MIN);
    assert.deepStrictEqual(deEste(), [], 'avisó antes de los 30 min');
    await bot.revisarEscalados(t0 + 31 * MIN);
    assert.strictEqual(deEste().length, 1, `mandó ${deEste().length} recordatorios`);
    for (const t of ['hola?', 'me pasas el precio en dolares?', 'wa.me/' + numero(chat), 'dólares']) {
      assert.ok(deEste()[0].includes(t), `el recordatorio no trae "${t}":\n${deEste()[0]}`);
    }
    await bot.revisarEscalados(t0 + 90 * MIN);
    assert.strictEqual(deEste().length, 1, 'repitió el recordatorio');
  });

  await check('sin mensajes nuevos del cliente no hay recordatorio: el aviso del escalado ya salió', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    const t0 = state.todos()[chat].escaladoEn;
    limpiar();
    await bot.revisarEscalados(t0 + 31 * MIN);
    assert.deepStrictEqual(alGrupo.filter((t) => t.includes('wa.me/' + numero(chat))), []);
  });

  await check('el recordatorio no sale si alguien de la cuenta escribió en el chat', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    await bot.procesar(escrito(chat, 'hola?'));
    await bot.procesar(mio(chat, 'hola! ahora te paso el precio en dolares'));
    limpiar();
    await bot.revisarEscalados(Date.now() + 31 * MIN);
    assert.deepStrictEqual(
      alGrupo.filter((t) => t.includes('wa.me/' + numero(chat))),
      [],
      'recordó un escalado que ya tomó alguien'
    );
  });

  // Pendientes 2, punto 1 (decisión de Tomás del 21/09/2026): el recordatorio del
  // escalado usa la franja de los recordatorios manuales, de RECORDATORIO_HORA (8) hasta
  // antes de SEGUIMIENTO_HORA_HASTA (22). Fuera de la franja no se descarta: sale en la
  // primera vuelta dentro de la franja, una sola vez. Las horas son de hace dos días y
  // de ayer, para que el barrido (que recorre todos los chats) no toque los de otros casos.
  const aLas = (diasAtras, hora, minuto = 0) => {
    const d = new Date();
    d.setDate(d.getDate() - diasAtras);
    d.setHours(hora, minuto, 0, 0);
    return d.getTime();
  };
  /** Un chat que escaló a `escalo` y donde el cliente escribió "hola?" a `escribio`. */
  async function escaladoALas(escalo, escribio) {
    const chat = nuevoChat();
    await escalarPorDolares(chat);
    await bot.procesar(escrito(chat, 'hola?'));
    const s = state.todos()[chat];
    state.actualizar(chat, {
      escaladoEn: escalo,
      historial: s.historial.map((l) => ({ ...l, ts: l.texto === 'hola?' ? escribio : escalo - MIN })),
    });
    return chat;
  }
  async function conFranjaDeRecordatorios(fn) {
    const antes = { hora: config.recordatorio.hora, hasta: config.seguimiento.horaHasta };
    config.recordatorio.hora = 8;
    config.seguimiento.horaHasta = 22;
    try {
      await fn();
    } finally {
      config.recordatorio.hora = antes.hora;
      config.seguimiento.horaHasta = antes.hasta;
    }
  }

  await check('el recordatorio del escalado no suena de noche: escaló a las 23:00, a las 23:45 y a las 3:00 nada, a las 8:00 sale uno y a las 8:05 no repite', async () => {
    limpiar();
    const chat = await escaladoALas(aLas(2, 23, 0), aLas(2, 23, 10));
    limpiar();
    const deEste = () => alGrupo.filter((t) => t.includes('wa.me/' + numero(chat)));
    await conFranjaDeRecordatorios(async () => {
      await bot.revisarEscalados(aLas(2, 23, 45));
      assert.deepStrictEqual(deEste(), [], 'sonó a las 23:45');
      await bot.revisarEscalados(aLas(1, 3, 0));
      assert.deepStrictEqual(deEste(), [], 'sonó a las 3:00');
      assert.ok(!state.todos()[chat].escaladoRecordado, 'lo dio por recordado sin haber salido: se perdería');
      await bot.revisarEscalados(aLas(1, 8, 0));
      assert.strictEqual(deEste().length, 1, `a las 8:00 tenía que salir uno, salieron ${deEste().length}`);
      assert.ok(deEste()[0].startsWith('⏰ ESCALADO SIN TOMAR') && deEste()[0].includes('hola?'), deEste()[0]);
      await bot.revisarEscalados(aLas(1, 8, 5));
      assert.strictEqual(deEste().length, 1, 'repitió a las 8:05');
    });
  });

  await check('de día sale como siempre: escaló a las 15:00, el cliente escribió a las 15:10 y a las 15:35 sale', async () => {
    limpiar();
    const chat = await escaladoALas(aLas(1, 15, 0), aLas(1, 15, 10));
    limpiar();
    const deEste = () => alGrupo.filter((t) => t.includes('wa.me/' + numero(chat)));
    await conFranjaDeRecordatorios(async () => {
      await bot.revisarEscalados(aLas(1, 15, 25));
      assert.deepStrictEqual(deEste(), [], 'avisó antes de los 30 min');
      await bot.revisarEscalados(aLas(1, 15, 35));
      assert.strictEqual(deEste().length, 1, `a las 15:35 tenía que salir uno, salieron ${deEste().length}`);
    });
  });

  await check('la franja es la de los recordatorios manuales: a las 21:59 sale y a las 22:00 no; a las 7:59 no y a las 8:00 sí', async () => {
    limpiar();
    const tarde = await escaladoALas(aLas(2, 21, 0), aLas(2, 21, 10));
    // Cumple los 30 min justo a las 22:00, con la franja ya cerrada.
    const noche = await escaladoALas(aLas(2, 21, 30), aLas(2, 21, 31));
    limpiar();
    const de = (chat) => alGrupo.filter((t) => t.includes('wa.me/' + numero(chat)));
    await conFranjaDeRecordatorios(async () => {
      await bot.revisarEscalados(aLas(2, 21, 59));
      assert.strictEqual(de(tarde).length, 1, 'a las 21:59 tenía que salir');
      assert.deepStrictEqual(de(noche), [], 'salió antes de los 30 min');
      await bot.revisarEscalados(aLas(2, 22, 0));
      await bot.revisarEscalados(aLas(1, 7, 59));
      assert.deepStrictEqual(de(noche), [], 'sonó fuera de la franja (22:00 o 7:59)');
      await bot.revisarEscalados(aLas(1, 8, 0));
      assert.strictEqual(de(noche).length, 1, 'a las 8:00 tenía que salir');
    });
  });

  await check('vuelta 1: alguien de la cuenta escribió, el escalado queda resuelto y el bot vuelve pasados los 45 min', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    await bot.procesar(mio(chat, 'hola! te paso el precio en dolares'));
    assert.strictEqual(state.todos()[chat].escalado, false, 'el escalado no quedó resuelto');
    limpiar();
    await bot.procesar(escrito(chat, 'dale, y el 14?'));
    assert.deepStrictEqual(aEste(chat), [], 'habló antes de que pasara el silencio de la persona');
    // Reloj simulado: la persona escribió hace 46 min.
    state.actualizar(chat, { ultimoHumano: Date.now() - 46 * MIN });
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 15?'));
    assert.ok(aEste(chat).length > 0, 'no volvió a contestar pasado el silencio');
  });

  await check('vuelta 2: pasadas 24 h sin que nadie lo tome, un mensaje nuevo se atiende como consulta nueva', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    state.actualizar(chat, { escaladoEn: Date.now() - 23 * HORA });
    await bot.procesar(escrito(chat, 'hola, tenes el iphone 15?'));
    assert.deepStrictEqual(aEste(chat), [], 'contestó antes de las 24 h');
    // Marcas de la charla vieja, para ver que se limpian al volver.
    state.actualizar(chat, {
      escaladoEn: Date.now() - 25 * HORA,
      listaEnviada: true,
      cotizadoDe: 'iPhone 13',
      seguimientoEnviado: true,
      calladoPorNoVenta: true,
    });
    limpiar();
    await bot.procesar(escrito(chat, 'y el iphone 16?'));
    const s = state.todos()[chat];
    assert.ok(aEste(chat).length > 0, 'no lo atendió pasadas las 24 h');
    assert.strictEqual(s.escalado, false, 'no limpió el escalado');
    assert.ok(
      !s.listaEnviada && !s.cotizadoDe && !s.seguimientoEnviado && !s.calladoPorNoVenta,
      'no limpió las marcas de la charla vieja'
    );
    assert.ok(s.modelo, 'borró lo que había dicho el cliente');
  });

  await check('un escalado resuelto que vuelve a escalar no anota otro lead: uno por chat, como antes', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    await bot.procesar(mio(chat, 'hola! ya te escribo'));
    const hace46 = Date.now() - 46 * MIN;
    state.actualizar(chat, { ultimoHumano: hace46, ultimoAvisoSilencio: { motivo: 'quiere cotización en dólares', ts: hace46 } });
    await bot.procesar(escrito(chat, 'y el 14 en dolares?'));
    assert.strictEqual(state.todos()[chat].escalado, true, 'el caso no prueba nada: no volvió a escalar');
    assert.strictEqual(leads.length, 1, 'anotó el lead dos veces');
  });

  await check('#sigue en el chat del cliente también limpia el escalado', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    await bot.procesar(mio(chat, '#sigue'));
    assert.strictEqual(state.todos()[chat].escalado, false, '#sigue no limpió el escalado');
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 15?'));
    assert.ok(aEste(chat).length > 0, 'no volvió a contestar después de #sigue');
  });

  // Bloque 10 (decisión de Tomás del 25/09/2026): "me quedo con el que me dijiste" sigue con
  // el modelo que ofreció el bot, pero si lo último se lo escribió una persona, escala
  // callado. El historial marca las líneas que escribe una persona (`humano: true`): por la
  // hora no se sabría, porque `#sigue` pone `ultimoHumano` en 0.
  await check('bloque 10: la línea que escribe una persona queda marcada en el historial; las del bot, no', async () => {
    const chat = '5490000000002@s.whatsapp.net';
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    await bot.procesar(mio(chat, 'te recomiendo el 14 pro, esta impecable'));
    const lineas = state.todos()[chat].historial.filter((l) => l.quien === 'vendedor');
    assert.ok(lineas.length >= 2, 'no están las líneas del bot y de la persona');
    assert.strictEqual(lineas[lineas.length - 1].humano, true, 'la línea de la persona no quedó marcada');
    assert.ok(lineas.slice(0, -1).every((l) => !l.humano), 'una línea del bot quedó marcada como de una persona');
  });

  await check('bloque 10: después de un #sigue, "me quedo con el que me dijiste" sobre lo que escribió una persona escala callado', async () => {
    const chat = '5490000000003@s.whatsapp.net';
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    await bot.procesar(mio(chat, 'te recomiendo el 14 pro, esta impecable'));
    await bot.procesar(mio(chat, '#sigue'));
    limpiar();
    await bot.procesar(escrito(chat, 'me quedo con el que me dijiste'));
    assert.strictEqual(aEste(chat).length, 0, 'le contestó: ' + aEste(chat).map((m) => m.texto).join(' | '));
    assert.strictEqual(alGrupo.length, 1, 'no avisó al grupo');
    assert.ok(/^🔕/.test(alGrupo[0]) && /persona/.test(alGrupo[0]), alGrupo[0]);
  });

  console.log('\nMejora 1b: si el bot le pregunta algo al cliente, no se calla\n');

  // Decisión de Tomás (16/09/2026): "te interesaba solo ese modelo?" y "decime que
  // modelo te interesa mas" son preguntas al cliente. El aviso al grupo sale igual,
  // pero el chat no queda callado: lo que conteste se atiende con el flujo normal.
  // Los turnos ("que dia te podes acercar?") quedan callados a propósito: el turno
  // lo confirma una persona.
  const controlHumano = require('../src/control');
  const textos = (chat) => aEste(chat).map((m) => m.texto).join(' | ');

  const noCargado = nuevoChat();
  let alternativa = null;

  await check('modelo que no está cargado: alternativa + pregunta, avisa al grupo y NO calla el chat', async () => {
    limpiar();
    await bot.procesar(mio(noCargado, '#reset'));
    limpiar();
    await bot.procesar(escrito(noCargado, 'tenes el 12 pro max?'));
    const t = textos(noCargado);
    assert.ok(/no me esta quedando/i.test(t), 'el caso no prueba nada: no dijo que ese no le queda: ' + t);
    const m = t.match(/pero tengo (iPhone [^|]+?) en \$/i);
    assert.ok(m, 'no ofreció una alternativa: ' + t);
    alternativa = m[1].replace(/\s+\d+GB.*$/, ''); // "iPhone 11 64GB 84%" → "iPhone 11"
    assert.ok(/te interesaba solo ese modelo\?/i.test(t), 'no hizo la pregunta: ' + t);
    assert.ok(
      alGrupo.some((a) => a.includes('🔔 LEAD') && a.includes('12 pro max')),
      'no avisó al grupo con el modelo pedido: ' + alGrupo.join(' || ')
    );
    const s = state.todos()[noCargado];
    assert.strictEqual(s.escalado, true, 'no escaló');
    assert.strictEqual(s.escaladoCalla, false, 'el escalado dejó callado el chat');
    assert.strictEqual(controlHumano.callado(s), false, 'el chat quedó callado');
  });

  await check('después, "dale, pasame el <alternativa>": contesta con el flujo normal de esa alternativa', async () => {
    assert.ok(alternativa, 'el caso anterior no dejó la alternativa');
    limpiar();
    await bot.procesar(escrito(noCargado, `dale, pasame el ${alternativa}`));
    const t = textos(noCargado);
    assert.ok(aEste(noCargado).length > 0, 'no contestó: el chat quedó callado');
    const num = alternativa.replace(/^iPhone /, '');
    assert.ok(new RegExp('iPhone ' + num + '|(^|[^0-9])' + num + '([^0-9]|$)').test(t), 'no habló de la alternativa: ' + t);
    assert.ok(/\$|tenemos|lo tengo|en stock/i.test(t), 'no fue stock ni precio: ' + t);
  });

  await check('después, "tengo 500.000": sigue el flujo normal del monto (cotiza o dice qué le entra)', async () => {
    limpiar();
    await bot.procesar(escrito(noCargado, 'tengo 500.000'));
    const t = textos(noCargado);
    assert.ok(aEste(noCargado).length > 0, 'no contestó el monto: el chat quedó callado');
    assert.ok(/\$|te lo llevas|te entra|te alcanza|cuota/i.test(t), 'no siguió el flujo del monto: ' + t);
    assert.strictEqual(state.todos()[noCargado].entrega, 500000, 'no guardó el monto');
  });

  await check('colores: pregunta "que modelo te interesa mas", avisa al grupo y no calla; "el 13" se contesta', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: no contestó la primera consulta');
    limpiar();
    await bot.procesar(escrito(chat, 'que colores tenes?'));
    const t = textos(chat);
    assert.ok(/decime que modelo te interesa mas/i.test(t), 'no hizo la pregunta: ' + t);
    assert.ok(alGrupo.some((a) => a.includes('🔔 LEAD') && /colores/.test(a)), 'no avisó al grupo: ' + alGrupo.join(' || '));
    const s = state.todos()[chat];
    assert.strictEqual(s.escalado, true, 'no escaló');
    assert.strictEqual(s.escaladoCalla, false, 'el escalado por colores dejó callado el chat');
    limpiar();
    await bot.procesar(escrito(chat, 'el 13'));
    assert.ok(aEste(chat).length > 0, 'no contestó "el 13": el chat quedó callado');
  });

  await check('control: "puedo pasar mañana a las 16?" sigue callado, igual que hoy (el turno lo confirma una persona)', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    limpiar();
    await bot.procesar(escrito(chat, 'puedo pasar mañana a las 16?'));
    assert.deepStrictEqual(aEste(chat), [], 'con día y hora dichos le contestó algo: ' + textos(chat));
    assert.ok(alGrupo.some((a) => a.includes('🔕 SIN RESPUESTA')), 'no avisó al grupo: ' + alGrupo.join(' || '));
    const s = state.todos()[chat];
    assert.strictEqual(s.escalado, true, 'no escaló');
    assert.strictEqual(controlHumano.callado(s), true, 'el turno dejó de callar el chat');
    await dormir(2);
    limpiar();
    await bot.procesar(escrito(chat, 'y el 14?'));
    assert.deepStrictEqual(aEste(chat), [], 'contestó en un chat callado por un turno');
    assert.deepStrictEqual(lecturas, [], 'interpretó el mensaje de un chat callado');
  });

  console.log('\n#pausa y #sigue desde el grupo\n');

  await check('#pausa <número> desde el grupo pausa ese chat; #sigue <número> lo reactiva y limpia escalado y silencio', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    limpiar();
    await bot.procesar(mio(GRUPO, '#pausa ' + numero(chat)));
    assert.strictEqual(state.todos()[chat].pausado, true, 'no pausó');
    assert.strictEqual(alGrupo.length, 1, 'no confirmó en el grupo');
    assert.ok(alGrupo[0].includes('wa.me/' + numero(chat)), 'la confirmación no trae el link: ' + alGrupo[0]);
    await bot.procesar(escrito(chat, 'y el 14?'));
    assert.deepStrictEqual(aEste(chat), [], 'contestó un chat pausado');

    state.actualizar(chat, { escalado: true, escaladoEn: Date.now(), ultimoHumano: Date.now() });
    limpiar();
    await bot.procesar(mio(GRUPO, '#sigue ' + numero(chat)));
    const s = state.todos()[chat];
    assert.strictEqual(s.pausado, false, 'no despausó');
    assert.strictEqual(s.escalado, false, 'no limpió el escalado');
    assert.ok(!s.ultimoHumano, 'no limpió el silencio de humano');
    assert.ok(alGrupo.length === 1 && alGrupo[0].includes('wa.me/' + numero(chat)), 'no confirmó: ' + alGrupo.join(' | '));
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 15?'));
    assert.ok(aEste(chat).length > 0, 'no volvió a contestar después de #sigue');
  });

  await check('desde el grupo, con un número ambiguo, inexistente o sin número: dice cómo se usa y no toca nada', async () => {
    const a = '5491155500123@s.whatsapp.net';
    const b = '541155500123@s.whatsapp.net';
    state.actualizar(a, { historial: [{ quien: 'cliente', texto: 'hola', ts: Date.now() }] });
    state.actualizar(b, { historial: [{ quien: 'cliente', texto: 'hola', ts: Date.now() }] });
    const avisos = [];
    limpiar();
    await bot.procesar(mio(GRUPO, '#pausa 1155500123'));
    assert.ok(/Hay 2 chats/.test(alGrupo[0] || ''), 'ambiguo: ' + alGrupo[0]);
    assert.ok(!state.todos()[a].pausado && !state.todos()[b].pausado, 'pausó con un número ambiguo');
    avisos.push(...alGrupo);
    limpiar();
    await bot.procesar(mio(GRUPO, '#pausa 5492990009999'));
    assert.ok(/No encontré/.test(alGrupo[0] || ''), 'inexistente: ' + alGrupo[0]);
    avisos.push(...alGrupo);
    limpiar();
    await bot.procesar(mio(GRUPO, '#sigue'));
    assert.ok(/con el número/.test(alGrupo[0] || ''), 'sin número: ' + alGrupo[0]);
    avisos.push(...alGrupo);
    // Lo que el bot contesta en el grupo vuelve por el webhook como propio: no dispara nada.
    const antes = JSON.stringify(state.todos());
    limpiar();
    for (const t of avisos) await bot.procesar(mio(GRUPO, t));
    assert.deepStrictEqual(alGrupo, [], 'se contestó a su propio aviso');
    assert.strictEqual(JSON.stringify(state.todos()), antes, 'su propio aviso cambió el estado');
  });

  console.log('\nOtros caminos que escriben\n');

  await check('el seguimiento no le escribe a un chat escalado ni a uno pausado', async () => {
    const hace1h = Date.now() - HORA;
    // Bloque Ninjo 1b: el seguimiento sale 3 h después de un precio del bot que le llegó.
    const planton = (extra) => ({ ultimoBot: hace1h, ultimoEnvioCliente: hace1h, ultimoPrecioBot: hace1h - 3 * HORA, modelo: 'iPhone 13', historial: [], ...extra });
    const libre = nuevoChat();
    const escalado = nuevoChat();
    const pausado = nuevoChat();
    state.actualizar(libre, planton({}));
    state.actualizar(escalado, planton({ escalado: true, escaladoEn: hace1h }));
    state.actualizar(pausado, planton({ pausado: true }));
    limpiar();
    await bot.revisarSeguimientos({ escribiendoMs: 1 });
    assert.strictEqual(aEste(libre).length, 1, 'el caso no prueba nada: al chat libre no le salió el seguimiento');
    assert.deepStrictEqual(aEste(escalado), [], 'le escribió a un chat escalado');
    assert.deepStrictEqual(aEste(pausado), [], 'le escribió a un chat pausado');
  });

  await check('los recordatorios manuales van al grupo y no le escriben al cliente escalado o pausado', async () => {
    const escalado = nuevoChat();
    const pausado = nuevoChat();
    state.actualizar(escalado, { escalado: true, escaladoEn: Date.now(), historial: [] });
    state.actualizar(pausado, { pausado: true, historial: [] });
    const ahora = new Date();
    for (const c of [escalado, pausado]) {
      state.guardarRecordatorio(c, { textos: ['llamarlo'], creado: ahora.getTime() - 2 * HORA, origenes: [], envios: 0, ultimoEnvio: 0, estado: 'activo' });
    }
    limpiar();
    try {
      await bot.revisarRecordatorios(ahora);
      assert.ok(alGrupo.length >= 1, 'el caso no prueba nada: el recordatorio no sonó');
      assert.deepStrictEqual(aEste(escalado), []);
      assert.deepStrictEqual(aEste(pausado), []);
    } finally {
      for (const c of [escalado, pausado]) state.borrarRecordatorio(c);
    }
  });

  console.log('\nVisibilidad\n');

  await check('/salud cuenta los escalados sin tomar y los pausados, sin datos de clientes', async () => {
    const servidor = await new Promise((resolve) => {
      const s = bot.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      const texto = await pedirSalud(servidor);
      const j = JSON.parse(texto);
      const chats = Object.entries(state.todos()).filter(([id]) => !id.endsWith('@g.us'));
      const escalados = chats.filter(([, s]) => s.escalado === true).length;
      const pausados = chats.filter(([, s]) => s.pausado === true).length;
      assert.ok(escalados > 0 && pausados > 0, 'el caso no prueba nada');
      assert.strictEqual(j.escaladosSinTomar, escalados, texto);
      assert.strictEqual(j.pausados, pausados, texto);
      for (const [id] of chats) assert.ok(!texto.includes(numero(id)), '/salud muestra un número de cliente');
    } finally {
      servidor.close();
    }
  });

  await check('el resumen lista los escalados sin tomar con su motivo, y no los que ya tomó alguien', () => {
    const escaladoEn = Date.now() - HORA;
    const partes = resumen.armar(
      {
        '5491100000501@s.whatsapp.net': {
          nombre: 'Sin Tomar',
          modelo: 'iPhone 13',
          escalado: true,
          escaladoEn,
          escaladoMotivo: 'quiere cotización en dólares',
          historial: [{ quien: 'cliente', texto: 'hola?', ts: Date.now() - 10 * MIN }],
        },
        '5491100000502@s.whatsapp.net': {
          nombre: 'Ya Tomado',
          modelo: 'iPhone 13',
          escalado: false,
          escaladoEn,
          ultimoHumano: Date.now() - 5 * MIN,
          historial: [{ quien: 'cliente', texto: 'gracias', ts: Date.now() - 20 * MIN }],
        },
      },
      3
    );
    const texto = partes.join('\n');
    const esperando = (texto.split('TE ESTÁN ESPERANDO')[1] || '').split(/💬 ESCRIBIERON|❄️|🔥/)[0];
    assert.ok(esperando.includes('Sin Tomar'), 'no lista el escalado sin tomar:\n' + texto);
    assert.ok(esperando.includes('dólares'), 'no dice el motivo del escalado:\n' + texto);
    assert.ok(!esperando.includes('Ya Tomado'), 'lista como sin tomar uno que ya tomó alguien:\n' + texto);
  });

  console.log('\nDatos viejos por tiempo (Pendientes 1, Parte B)\n');

  // Un cliente que vuelve a la semana no tiene por qué arrancar con el modelo y el
  // monto de la charla vieja. Pasadas DATOS_VIEJOS_HORAS sin actividad en el chat (el
  // ts más nuevo del historial, de cualquiera de los dos lados), el próximo mensaje
  // se atiende como consulta nueva: se limpian los datos que caducan y las marcas del
  // bot; quedan el nombre, la zona, las notas, el historial, los temas explicados y el
  // resultado. `leadRegistrado` también se limpia (Pendientes 2, punto 5): si vuelve
  // como consulta nueva y escala, es una fila nueva en LEADS. Reloj simulado: las fechas
  // del chat se corren hacia atrás.
  const ctl = require('../src/control');
  function envejecer(chat, horas) {
    const s = state.todos()[chat];
    const atras = horas * HORA;
    const cambios = { historial: (s.historial || []).map((l) => ({ ...l, ts: l.ts - atras })) };
    for (const campo of ['ultimoBot', 'ultimoHumano', 'escaladoEn', 'leadRegistrado', 'botEnvio', 'botPropuso']) {
      if (s[campo]) cambios[campo] = s[campo] - atras;
    }
    if (s.ultimaLectura && s.ultimaLectura.ts) cambios.ultimaLectura = { ...s.ultimaLectura, ts: s.ultimaLectura.ts - atras };
    state.actualizar(chat, cambios);
  }
  // Datos y marcas puestos a mano, para ver qué se limpia y qué no.
  const CADUCAN = {
    capacidad_gb: 128,
    forma_pago: 'cuotas',
    permuta: { ofrece: true, modelo: 'iPhone 8' },
    presupuestoAnotado: 300000,
    timing: 'esta semana',
    modeloPropuesto: 'iPhone 11',
    primerIphoneDicho: true,
    permutaDatosPedidos: true,
    // Desde cero (D2, 29/09/2026): el "sin X no te puedo pasar el numero" ya dicho en el canje.
    permutaSinDatosDicho: true,
    descuentoPedidos: 2,
    descuentoDe: { modelo: 'iPhone 13', precio: 485000 },
    // Bloque 10: un monto en dólares, que no es la entrega en pesos. Caduca como ella.
    entregaDolares: 420,
    // 🔔 LEAD (13/10/2026): la última entrega cotizada para el aviso al grupo. Caduca como la entrega.
    entregaAviso: 1020000,
  };
  const SOBREVIVEN = {
    zona: 'Centro',
    notas: ['es para su hija'],
    resultado: { tipo: 'perdido', ts: 1, botParticipo: true, botLeMando: true },
  };
  /** Un chat con el 13 cotizado con $400.000 (modelo, entrega, PDF y cotización confirmados). */
  async function charlaCotizada(chat) {
    for (const t of ['tenes el 13?', 'ese me gusto', 'en cuotas', 'tengo 400 mil']) await bot.procesar(escrito(chat, t));
    const s = state.todos()[chat];
    assert.strictEqual(s.modelo, 'iPhone 13', 'el caso no prueba nada: no guardó el modelo');
    assert.strictEqual(s.entrega, 400000, 'el caso no prueba nada: no guardó la entrega');
    assert.strictEqual(s.cotizadoDe, 'iPhone 13', 'el caso no prueba nada: no cotizó');
    assert.strictEqual(s.compromisoEnviado, true, 'el caso no prueba nada: no mandó el PDF');
    // Bloque 9: la marca del saludo es `saludoEn` (cuándo salió), ya no `yaSaludo: true`.
    assert.ok(s.saludoEn, 'el caso no prueba nada: no saludó');
    assert.ok(s.temasExplicados && s.temasExplicados.financiacion, 'el caso no prueba nada: no quedó la financiación explicada');
  }
  const textosDe = (chat) => aEste(chat).map((m) => m.texto).join(' | ');

  await check('chat con modelo y entrega de hace 80 h: al llegar el mensaje quedan en cero y el bot pregunta de nuevo en vez de cotizar con el monto viejo', async () => {
    const chat = nuevoChat();
    limpiar();
    await charlaCotizada(chat);
    state.actualizar(chat, { ...CADUCAN, ...SOBREVIVEN });
    envejecer(chat, 80);
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    const s = state.todos()[chat];
    const textos = textosDe(chat);
    assert.ok(aEste(chat).length, 'no contestó');
    assert.ok(!/400\.000|\$/.test(textos), 'siguió con el monto viejo: ' + textos.slice(0, 200));
    assert.ok(/modelito|que estabas (buscando|mirando)|que modelo/i.test(textos), 'no preguntó de nuevo qué busca: ' + textos.slice(0, 200));
    // 80 h después es otro día: a un "hola" lo vuelve a saludar (desde el bloque 9, el saludo es
    // el del día; `saludoEn` además se limpia con los datos viejos).
    assert.ok(/buenass|hola|como (estas|andas|va)/i.test(textos), 'no volvió a saludar: ' + textos.slice(0, 200));
    for (const campo of ['modelo', 'entrega', ...Object.keys(CADUCAN)]) assert.ok(!s[campo], `${campo} sobrevivió: ` + JSON.stringify(s[campo]));
    for (const marca of ['compromisoEnviado', 'cotizadoDe', 'entregaCotizada', 'stockInformadoDe', 'preguntamosFormaPago']) {
      assert.ok(!s[marca], `la marca ${marca} sobrevivió: ` + JSON.stringify(s[marca]));
    }
  });

  await check('nombre, zona, notas, modelosPedidos, historial, temas explicados, resultado y botEnvio sobreviven a la limpieza; leadRegistrado se limpia', async () => {
    const chat = nuevoChat();
    limpiar();
    await charlaCotizada(chat);
    state.actualizar(chat, { ...CADUCAN, ...SOBREVIVEN, leadRegistrado: Date.now() });
    envejecer(chat, 80);
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    const s = state.todos()[chat];
    assert.ok(!s.modelo, 'el caso no prueba nada: no limpió');
    assert.strictEqual(s.nombre, 'Lucia', 'perdió el nombre');
    for (const campo of Object.keys(SOBREVIVEN)) assert.deepStrictEqual(s[campo], SOBREVIVEN[campo], `perdió ${campo}`);
    // El extractor local los guarda como los escribió ("13").
    assert.ok((s.modelosPedidos || []).some((m) => /13/.test(m)), 'perdió los modelos pedidos: ' + JSON.stringify(s.modelosPedidos));
    // El historial sigue (las últimas 15 líneas, como siempre): lo viejo y lo nuevo.
    assert.ok(s.historial.some((l) => l.texto === 'tengo 400 mil'), 'perdió las líneas viejas del historial');
    assert.ok(s.historial.some((l) => l.quien === 'cliente' && l.texto === 'hola'), 'no anotó la línea nueva');
    assert.ok(s.temasExplicados && s.temasExplicados.financiacion, 'perdió los temas explicados');
    assert.ok(!s.leadRegistrado, 'leadRegistrado sobrevivió a los datos viejos: si vuelve a escalar no suma fila en LEADS');
    assert.ok(s.botEnvio, 'perdió botEnvio');
  });

  await check('chat de hace 10 h: no se limpia nada', async () => {
    const chat = nuevoChat();
    limpiar();
    await charlaCotizada(chat);
    state.actualizar(chat, SOBREVIVEN);
    envejecer(chat, 10);
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    const s = state.todos()[chat];
    assert.strictEqual(s.modelo, 'iPhone 13', 'limpió el modelo con 10 h');
    assert.strictEqual(s.entrega, 400000, 'limpió la entrega con 10 h');
    assert.strictEqual(s.cotizadoDe, 'iPhone 13', 'limpió la cotización con 10 h');
    assert.strictEqual(s.compromisoEnviado, true, 'limpió el compromiso con 10 h');
    assert.strictEqual(s.zona, 'Centro');
    assert.ok(/400\.000/.test(textosDe(chat)), 'no siguió con la cotización de siempre: ' + textosDe(chat).slice(0, 200));
  });

  await check('un chat escalado y viejo pasa por las dos limpiezas sin romperse', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    const s0 = state.todos()[chat];
    assert.ok(/13/.test(s0.modelo || ''), 'el caso no prueba nada: no guardó el modelo: ' + s0.modelo);
    assert.ok(s0.leadRegistrado, 'el caso no prueba nada: no anotó el lead');
    envejecer(chat, 80);
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    const s = state.todos()[chat];
    assert.ok(aEste(chat).length, 'no lo atendió como consulta nueva');
    assert.strictEqual(s.escalado, false, 'no limpió el escalado');
    assert.ok(!s.modelo, 'no limpió el modelo viejo: ' + s.modelo);
    assert.ok(!s.leadRegistrado, 'leadRegistrado sobrevivió: el escalado viejo (resolver) volvió a tapar el lead');
    assert.deepStrictEqual(alGrupo.filter((t) => /falló/.test(t)), [], 'avisó una falla');
  });

  // Pendientes 2, punto 5 (decisión de Tomás del 21/09/2026): `leadRegistrado` sobrevivía
  // a todo, así que un contacto que volvía semanas después y volvía a escalar avisaba al
  // grupo pero no sumaba fila en LEADS. Ahora se limpia con los datos viejos (72 h); la
  // vuelta de un escalado a las 24 h sigue sin sumar fila.
  await check('escaló hace 5 días, nadie lo tomó, vuelve y vuelve a escalar: se anota una fila nueva en LEADS', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    assert.strictEqual(leads.length, 1, 'el caso no prueba nada: el primer escalado no anotó su fila');
    envejecer(chat, 5 * 24);
    const viejo = state.todos()[chat].escaladoEn;
    limpiar();
    await escalarPorDolares(chat);
    const s = state.todos()[chat];
    assert.ok(s.escaladoEn > viejo, 'el caso no prueba nada: no es un escalado nuevo');
    assert.strictEqual(leads.length, 1, `tenía que anotar una fila nueva, anotó ${leads.length}`);
    assert.ok(s.leadRegistrado > viejo, 'leadRegistrado quedó con la fecha del escalado viejo: ' + s.leadRegistrado);
  });

  await check('escaló hace 30 h, vuelve y vuelve a escalar: no se anota otra fila (la vuelta a las 24 h conserva leadRegistrado)', async () => {
    const chat = nuevoChat();
    limpiar();
    await escalarPorDolares(chat);
    assert.strictEqual(leads.length, 1, 'el caso no prueba nada: el primer escalado no anotó su fila');
    envejecer(chat, 30);
    const lead = state.todos()[chat].leadRegistrado;
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    assert.strictEqual(state.todos()[chat].escalado, false, 'el caso no prueba nada: no volvió como consulta nueva');
    assert.strictEqual(state.todos()[chat].leadRegistrado, lead, 'la vuelta a las 24 h tocó leadRegistrado');
    await escalarPorDolares(chat);
    assert.strictEqual(leads.length, 0, 'anotó otra fila a las 30 h');
  });

  await check('un escalado de "no entendí" (no calla) que nadie tomó, a los 5 días: se resuelve con los datos viejos, y si vuelve a escalar calla y anota su fila', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'asdasd'));
    await bot.procesar(escrito(chat, 'qwrtyp'));
    const s0 = state.todos()[chat];
    assert.ok(s0.escalado === true && s0.escaladoCalla === false, 'el caso no prueba nada: no escaló por no entender');
    assert.strictEqual(leads.length, 1, 'el caso no prueba nada: el primer escalado no anotó su fila');
    envejecer(chat, 5 * 24);
    const viejo = state.todos()[chat].escaladoEn;
    limpiar();
    await escalarPorDolares(chat);
    const s = state.todos()[chat];
    assert.ok(s.escaladoEn > viejo, 'siguió con el escalado de hace 5 días: el nuevo no quedó anotado');
    assert.notStrictEqual(s.escaladoCalla, false, 'el escalado nuevo no dejó callado el chat');
    assert.strictEqual(leads.length, 1, `tenía que anotar una fila nueva, anotó ${leads.length}`);
  });

  await check('ese mismo escalado de "no entendí", a las 30 h, sigue abierto: los datos viejos no lo tocan', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'asdasd'));
    await bot.procesar(escrito(chat, 'qwrtyp'));
    envejecer(chat, 30);
    const viejo = state.todos()[chat].escaladoEn;
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    const s = state.todos()[chat];
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: no lo atendió');
    assert.strictEqual(s.escalado, true, 'a las 30 h resolvió un escalado que nadie tomó');
    assert.strictEqual(s.escaladoEn, viejo);
  });

  // Decisión de Tomás del 22/09/2026 (opción A): un escalado de "no entendí" sin tomar
  // no calla el chat, y tapaba a los escalados que venían después dentro de las 72 h: el
  // bot seguía contestando, el grupo no recibía el aviso y no se anotaba la fila. Ahora un
  // escalado que calla le gana a uno que no calla. Uno que no calla no pisa a nadie.
  await check('un escalado de "no entendí" sin tomar no tapa a uno que calla (en silencio): avisa, calla y anota su fila', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'asdasd'));
    await bot.procesar(escrito(chat, 'qwrtyp'));
    const s0 = state.todos()[chat];
    assert.ok(s0.escalado === true && s0.escaladoCalla === false, 'el caso no prueba nada: no escaló por no entender');
    const motivoViejo = s0.escaladoMotivo;
    await dormir(2);
    limpiar();
    await escalarPorDolares(chat);
    const s = state.todos()[chat];
    assert.notStrictEqual(s.escaladoMotivo, motivoViejo, 'siguió con el motivo de "no entendí": el escalado nuevo no quedó anotado');
    assert.strictEqual(s.escaladoCalla, true, 'el escalado nuevo no dejó callado el chat');
    assert.ok(alGrupo.length >= 1, 'no avisó al grupo');
    assert.strictEqual(leads.length, 1, `tenía que anotar la fila del escalado nuevo, anotó ${leads.length}`);
  });

  await check('un escalado de "no entendí" sin tomar no tapa a uno que calla (con respuesta): "quiero sacar un turno" avisa con 🔔 y calla', async () => {
    const control = nuevoChat();
    limpiar();
    await bot.procesar(escrito(control, 'quiero sacar un turno'));
    const sc = state.todos()[control] || {};
    if (!(sc.escalado === true && sc.escaladoCalla !== false)) {
      throw new Error('el caso no prueba nada: en un chat limpio "quiero sacar un turno" no escala (' + JSON.stringify(alGrupo).slice(0, 200) + ')');
    }
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'asdasd'));
    await bot.procesar(escrito(chat, 'qwrtyp'));
    assert.strictEqual(state.todos()[chat].escaladoCalla, false, 'el caso no prueba nada: no escaló por no entender');
    await dormir(2);
    limpiar();
    await bot.procesar(escrito(chat, 'quiero sacar un turno'));
    const s = state.todos()[chat];
    assert.ok(alGrupo.some((t) => /🔔 LEAD/.test(t)), 'no salió el 🔔 LEAD: ' + JSON.stringify(alGrupo).slice(0, 300));
    assert.strictEqual(s.escaladoCalla, true, 'el escalado nuevo no dejó callado el chat');
    assert.strictEqual(leads.length, 1, `tenía que anotar la fila del escalado nuevo, anotó ${leads.length}`);
  });

  await check('un tercer mensaje raro no vuelve a escalar: uno que no calla no pisa a otro', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'asdasd'));
    await bot.procesar(escrito(chat, 'qwrtyp'));
    const s0 = state.todos()[chat];
    assert.strictEqual(s0.escaladoCalla, false, 'el caso no prueba nada: no escaló por no entender');
    await dormir(2);
    limpiar();
    await bot.procesar(escrito(chat, 'zxcvbn'));
    const s = state.todos()[chat];
    assert.strictEqual(s.escaladoEn, s0.escaladoEn, 'volvió a escalar con el tercer mensaje raro');
    assert.strictEqual(leads.length, 0, 'anotó otra fila con el tercer mensaje raro');
  });

  await check('el tope se lee de DATOS_VIEJOS_HORAS (con 1 h limpia a las 2 h; con 72 no)', async () => {
    assert.strictEqual(config.datosViejosHoras, 72, 'el default no es 72: ' + config.datosViejosHoras);
    const chico = nuevoChat();
    const normal = nuevoChat();
    limpiar();
    await charlaCotizada(chico);
    await charlaCotizada(normal);
    envejecer(chico, 2);
    envejecer(normal, 2);
    config.datosViejosHoras = 1;
    try {
      limpiar();
      await bot.procesar(escrito(chico, 'hola'));
    } finally {
      config.datosViejosHoras = 72;
    }
    limpiar();
    await bot.procesar(escrito(normal, 'hola'));
    assert.ok(!state.todos()[chico].modelo, 'con DATOS_VIEJOS_HORAS=1 no limpió a las 2 h');
    assert.strictEqual(state.todos()[normal].modelo, 'iPhone 13', 'con 72 limpió a las 2 h');
  });

  await check('la última actividad es el ts más nuevo del historial, de cualquiera de los dos; sin historial, el de la última lectura', () => {
    const ahora = Date.now();
    const conHistorial = {
      historial: [
        { quien: 'cliente', texto: 'hola', ts: ahora - 3 * HORA },
        { quien: 'vendedor', texto: 'buenass', ts: ahora - 2 * HORA },
      ],
      ultimaLectura: { ts: ahora - 90 * HORA },
    };
    assert.strictEqual(ctl.ultimaActividad(conHistorial), ahora - 2 * HORA);
    assert.strictEqual(ctl.ultimaActividad({ historial: [], ultimaLectura: { ts: ahora - 90 * HORA } }), ahora - 90 * HORA);
    assert.strictEqual(ctl.ultimaActividad({}), 0);
    assert.strictEqual(ctl.ultimaActividad(undefined), 0);
    assert.strictEqual(ctl.horasViejas(ahora - 80 * HORA, ahora), 80, 'con 80 h no dice 80');
    assert.strictEqual(ctl.horasViejas(ahora - 10 * HORA, ahora), 0, 'con 10 h dice que es viejo');
    assert.strictEqual(ctl.horasViejas(0, ahora), 0, 'sin actividad dice que es viejo');
  });

  // #bateria (01/10/2026, decisión de Tomás): desde el grupo elige qué pestaña usa el bot para
  // los usados. La de prueba es la `LISTA 85-93` del fixture: el 13 y el 14 con otro precio y
  // batería 85-93, y un 14 Plus que solo está ahí.
  console.log('\n#bateria: qué lista de usados usa el bot (01/10/2026)\n');

  const FIXTURE = require('./fixture-planilla');
  const OK_8593 = '🔋 Usados con LISTA 85-93 (3 modelos). Sellados y el resto, de LISTA.';
  const OK_100 = '🔋 Usados con LISTA (al 100%).';
  const activa = () => (sheets.listaBateriaActiva ? sheets.listaBateriaActiva() : 'no hay sheets.listaBateriaActiva');
  const internoGuardado = () => JSON.parse(fs.readFileSync(process.env.ESTADO_PATH, 'utf8'))['bot:interno'] || {};
  const lo = (chat) => aEste(chat).map((m) => m.texto).join('\n');

  await check('#bateria 85-93 desde el grupo: los usados salen de LISTA 85-93, lo confirma y queda guardado', async () => {
    limpiar();
    await bot.procesar(mio(GRUPO, '#bateria 85-93'));
    assert.deepStrictEqual(alGrupo, [OK_8593]);
    assert.strictEqual(activa(), '85-93');
    assert.strictEqual(internoGuardado().listaBateria, '85-93', 'no quedó guardado en el estado');
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    assert.ok(lo(chat).includes('128GB 85-93%') && lo(chat).includes('$450.000'), 'no salió el 13 de LISTA 85-93: ' + lo(chat));
    const otro = nuevoChat();
    await bot.procesar(escrito(otro, 'tenes el 17?'));
    assert.ok(lo(otro).includes('iPhone 17 128GB sellado') && lo(otro).includes('$1.600.000'), 'el sellado no sale de LISTA: ' + lo(otro));
  });

  await check('#batería, "85 93" y "85 a 93" también; #bateria 100 vuelve a LISTA', async () => {
    for (const t of ['#batería 85-93', '#bateria 85 93', '#bateria 85 a 93', '#BATERIA 85-93']) {
      await bot.procesar(mio(GRUPO, '#bateria 100'));
      assert.strictEqual(activa(), null, 'no volvió a LISTA antes de ' + t);
      limpiar();
      await bot.procesar(mio(GRUPO, t));
      assert.strictEqual(activa(), '85-93', t);
      assert.deepStrictEqual(alGrupo, [OK_8593], t);
    }
    limpiar();
    await bot.procesar(mio(GRUPO, '#bateria 100'));
    assert.deepStrictEqual(alGrupo, [OK_100]);
    assert.strictEqual(activa(), null);
    assert.strictEqual(internoGuardado().listaBateria, null, 'no quedó guardado que vuelve a LISTA');
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    assert.ok(lo(chat).includes('128GB 100%') && lo(chat).includes('$495.000'), 'no volvió el 13 de LISTA: ' + lo(chat));
  });

  await check('#bateria solo dice cuál está activa y no cambia nada', async () => {
    await bot.procesar(mio(GRUPO, '#bateria 85-93'));
    limpiar();
    await bot.procesar(mio(GRUPO, '#bateria'));
    assert.strictEqual(alGrupo.length, 1, alGrupo.join(' | '));
    assert.ok(/^🔋/.test(alGrupo[0]) && alGrupo[0].includes('LISTA 85-93'), alGrupo[0]);
    assert.strictEqual(activa(), '85-93');
    await bot.procesar(mio(GRUPO, '#bateria 100'));
    limpiar();
    await bot.procesar(mio(GRUPO, '#bateria'));
    assert.ok(/^🔋/.test(alGrupo[0]) && alGrupo[0].includes('LISTA (al 100%)'), alGrupo[0]);
    assert.strictEqual(activa(), null);
  });

  await check('#bateria con una pestaña que no existe, sin filas, o con algo que no es un rango: dice por qué y no cambia nada', async () => {
    await bot.procesar(mio(GRUPO, '#bateria 85-93'));
    limpiar();
    await bot.procesar(mio(GRUPO, '#bateria 70-80'));
    assert.ok(alGrupo.length === 1 && /LISTA 70-80/.test(alGrupo[0]) && /no existe/.test(alGrupo[0]), alGrupo.join(' | '));
    sheets.usarFixture({ ...FIXTURE, pestanas: { ...FIXTURE.pestanas, 'LISTA 60-70': [] } });
    try {
      limpiar();
      await bot.procesar(mio(GRUPO, '#bateria 60-70'));
      assert.ok(alGrupo.length === 1 && /no tiene filas con modelo/.test(alGrupo[0]), alGrupo.join(' | '));
    } finally {
      sheets.usarFixture(FIXTURE);
    }
    for (const t of ['#bateria hola', '#bateria 90']) {
      limpiar();
      await bot.procesar(mio(GRUPO, t));
      assert.strictEqual(alGrupo.length, 1, t + ': ' + alGrupo.join(' | '));
    }
    assert.strictEqual(activa(), '85-93', 'cambió la lista');
    assert.strictEqual(internoGuardado().listaBateria, '85-93', 'cambió lo guardado');
    await bot.procesar(mio(GRUPO, '#bateria 100'));
  });

  await check('#bateria fuera del grupo (en el chat de un cliente, o lo escribe un cliente) no cambia nada', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    limpiar();
    await bot.procesar(mio(chat, '#bateria 85-93'));
    await bot.procesar(escrito(nuevoChat(), '#bateria 85-93'));
    await bot.procesar(escrito(GRUPO, '#bateria 85-93'));
    assert.strictEqual(activa(), null);
    assert.ok(!alGrupo.some((t) => /^🔋/.test(t)), 'contestó el comando: ' + alGrupo.join(' | '));
  });

  await check('la elección sobrevive a recargar el estado: un proceso nuevo con el mismo archivo arranca con LISTA 85-93', async () => {
    await bot.procesar(mio(GRUPO, '#bateria 85-93'));
    const src = (m) => JSON.stringify(path.join(__dirname, '..', 'src', m));
    const salida = require('child_process').execFileSync(
      process.execPath,
      ['-e', `require(${src('bateria')}); console.log('ACTIVA=' + require(${src('sheets')}).listaBateriaActiva())`],
      {
        // Desde test/: sin .env (config.js lo busca en la carpeta actual) y fuera de la carpeta
        // temporal de Windows, que puede tener un package.json que rompe el require.
        cwd: __dirname,
        encoding: 'utf8',
        env: { ...process.env, APRENDIZAJE_PATH: path.join(os.tmpdir(), 'apr-control-hijo-' + process.pid + '.jsonl') },
      }
    );
    assert.ok(salida.includes('ACTIVA=85-93'), salida);
  });

  await check('/salud dice qué lista de usados está activa', async () => {
    const servidor = await new Promise((resolve) => {
      const s = bot.app.listen(0, '127.0.0.1', () => resolve(s));
    });
    try {
      assert.strictEqual(JSON.parse(await pedirSalud(servidor)).listaBateria, 'LISTA 85-93');
      await bot.procesar(mio(GRUPO, '#bateria 100'));
      assert.strictEqual(JSON.parse(await pedirSalud(servidor)).listaBateria, 'LISTA');
    } finally {
      servidor.close();
    }
  });

  await check('con LISTA 85-93 activa y sin poder leerla: cotiza con LISTA y avisa una vez al grupo', async () => {
    await bot.procesar(mio(GRUPO, '#bateria 85-93'));
    sheets.usarFixture({ ...FIXTURE, pestanas: {} });
    try {
      limpiar();
      const chat = nuevoChat();
      await bot.procesar(escrito(chat, 'tenes el 13?'));
      assert.ok(lo(chat).includes('$495.000'), 'no cotizó con LISTA: ' + lo(chat));
      await bot.procesar(escrito(nuevoChat(), 'tenes el 14?'));
      assert.deepStrictEqual(alGrupo.filter((t) => /No pude leer/.test(t)), ['⚠️ No pude leer LISTA 85-93: cotizo con LISTA']);
    } finally {
      sheets.usarFixture(FIXTURE);
      await bot.procesar(mio(GRUPO, '#bateria 100'));
    }
  });

  await check('la vuelta a las 24 h de un escalado también limpia modeloPropuesto (y deja modelo)', () => {
    const chat = nuevoChat();
    state.actualizar(chat, { modeloPropuesto: 'iPhone 11', modelo: 'iPhone 13' });
    ctl.limpiarParaConsultaNueva(chat);
    assert.strictEqual(state.todos()[chat].modeloPropuesto, null, 'no limpió modeloPropuesto');
    assert.strictEqual(state.todos()[chat].modelo, 'iPhone 13', 'limpió el modelo del cliente');
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
