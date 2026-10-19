'use strict';
/**
 * Seguimiento: el único mensaje que el bot manda sin que el cliente escriba.
 *
 *   node test/seguimiento.test.js
 *
 * Bloque Ninjo 1b (decisión de Tomás del 05/10/2026, reescrito): sale solo después de una tanda del
 * bot con un precio de contado o una cotización (`ultimoPrecioBot`) que le llegó, si el cliente no
 * contestó y ninguna persona de la cuenta escribió después. El 1º, 3 horas después o más, entre las
 * 10 y las 21 de Argentina (si cae fuera, cuando abre la franja); el 2º, el día siguiente entre las 10
 * y las 12. No hay 3º. Los textos: "contame como te quedan los numeros!" y "como viste los celus? cual
 * te dio mas interes". Se marca ANTES de mandar: si Evolution falla, ya cuenta. La hora es la de
 * Argentina aunque la PC tenga otra zona: este proceso corre con TZ=Asia/Tokyo.
 *
 * Pendientes 2, punto 2 (21/09/2026), que sigue: el seguimiento pasa por la misma guardia que las
 * respuestas ("escribiendo…", la espera local, el control con el estado leído de nuevo y el envío con
 * delay 0). Se prueba con un Evolution de mentira (un `fetch` que anota cada POST) y provocando cada
 * cosa durante la espera.
 *
 * El entorno se fija acá y no se hereda del .env. El reloj del barrido se pasa a mano (`reloj`): el
 * resultado no depende de la hora en que se corre.
 */
// Antes de cualquier Date: la PC "está" en Tokio (UTC+9). El seguimiento tiene que usar la de Argentina.
process.env.TZ = 'Asia/Tokyo';
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
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.SEGUIMIENTO_ACTIVO = 'true';
process.env.SEGUIMIENTO_MAX_HORAS = '24';
process.env.SEGUIMIENTO_MAX_POR_BARRIDO = '10';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.SEGUIMIENTO_HORAS_1 = '3';
process.env.SEGUIMIENTO_FRANJA_DESDE = '10';
process.env.SEGUIMIENTO_FRANJA_HASTA = '21';
process.env.SEGUIMIENTO_MANANA_HASTA = '12';
process.env.EVOLUTION_URL = 'http://evolution.de-prueba.invalid';
process.env.EVOLUTION_INSTANCE = 'instancia-de-prueba';
process.env.EVOLUTION_APIKEY = 'clave-de-prueba';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-seguimiento-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-seguimiento-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');
const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};
// El envío de verdad de evolution.js, para la sección que usa el Evolution de mentira.
const enviarTextoReal = evolution.enviarTexto;
const mostrarEscribiendoReal = evolution.mostrarEscribiendo;

const enviados = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, texto) => {
  enviados.push({ numero, texto });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.mostrarEscribiendo = async () => ({});
evolution.avisarGrupo = async () => ({});
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');

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

const MIN = 60 * 1000;
const HORA = 60 * MIN;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const nuevoChat = () => '54929944' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
/** Una hora de Argentina (UTC-3, sin horario de verano): "2026-09-29 10:00". */
const AR = (texto) => Date.parse(texto.replace(' ', 'T') + ':00-03:00');
const PRIMERO = 'contame como te quedan los numeros!';
const SEGUNDO = 'como viste los celus? cual te dio mas interes';

/**
 * Un chat donde el bot le pasó un precio a la hora `precio` (le llegó) y el cliente no volvió a
 * escribir. `extra` pisa campos del estado; `antes`, líneas que van antes del precio.
 */
function conPrecio(precio, { extra = {}, antes = [], despues = [] } = {}) {
  const chat = nuevoChat();
  state.actualizar(chat, {
    modelo: null,
    ultimoBot: precio,
    ultimoEnvioCliente: precio,
    ultimoPrecioBot: precio,
    historial: [
      ...antes,
      { quien: 'cliente', texto: 'tenes el 13?', ts: precio - MIN },
      { quien: 'vendedor', texto: 'el 13 esta $495.000 de contado', ts: precio },
      ...despues,
    ],
    ...extra,
  });
  return chat;
}
const aEste = (chat) => enviados.filter((e) => e.numero === chat).map((e) => e.texto);
/** Un barrido con el reloj en `ahora`. */
const barrer = (ahora) => bot.revisarSeguimientos({ escribiendoMs: 1, reloj: () => ahora });
/** Los chats de los casos anteriores ya no tienen que recibir nada. */
function apartarLosDemas() {
  for (const [chatId, s] of Object.entries(state.todos())) {
    if (s && s.historial && s.ultimoPrecioBot) state.actualizar(chatId, { ultimoPrecioBot: 0 });
  }
}

(async () => {
  console.log('\nSeguimiento: cuándo sale (bloque Ninjo 1b)\n');

  await check('la PC está en otra zona (Tokio): el caso prueba la hora de Argentina', async () => {
    assert.strictEqual(new Date(AR('2026-09-29 11:00')).getHours(), 23, 'el proceso no quedó con TZ=Asia/Tokyo');
  });

  await check('sale a las 3 h del precio, con el texto nuevo (sin modelo también); antes de las 3 h no', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 11:00');
    const chat = conPrecio(precio);
    await barrer(precio + 2 * HORA + 59 * MIN);
    assert.deepStrictEqual(aEste(chat), [], 'salió antes de las 3 h');
    await barrer(precio + 3 * HORA + MIN);
    assert.deepStrictEqual(aEste(chat), [PRIMERO]);
    const s = state.todos()[chat];
    assert.strictEqual(s.seguimiento.n, 1);
    assert.strictEqual(s.seguimiento.de, precio);
    assert.ok(s.historial.some((l) => l.quien === 'vendedor' && l.texto === PRIMERO && l.id), 'no quedó en el historial con su id');
  });

  await check('usa la hora de Argentina, no la de la PC: 11:00 de Argentina (23:00 en Tokio) sale; 22:00 de Argentina (10:00 en Tokio) no', async () => {
    apartarLosDemas();
    const tarde = conPrecio(AR('2026-09-29 07:30'));
    await barrer(AR('2026-09-29 11:00'));
    assert.deepStrictEqual(aEste(tarde), [PRIMERO], 'a las 11 de Argentina no salió (¿miró la hora de la PC?)');
    apartarLosDemas();
    const noche = conPrecio(AR('2026-09-29 18:30'));
    await barrer(AR('2026-09-29 22:00'));
    assert.deepStrictEqual(aEste(noche), [], 'a las 22 de Argentina salió (¿miró la hora de la PC?)');
  });

  await check('fuera de la franja espera: el precio a las 19:30, nada a las 22:30 ni a las 9:59; sale a las 10:00 del día siguiente', async () => {
    apartarLosDemas();
    const chat = conPrecio(AR('2026-09-29 19:30'));
    await barrer(AR('2026-09-29 22:30'));
    await barrer(AR('2026-09-30 09:59'));
    assert.deepStrictEqual(aEste(chat), [], 'salió fuera de la franja');
    await barrer(AR('2026-09-30 10:00'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO]);
  });

  await check('el 2º sale el día siguiente al 1º, entre las 10 y las 12; no hay 3º', async () => {
    apartarLosDemas();
    const chat = conPrecio(AR('2026-09-29 10:00'));
    await barrer(AR('2026-09-29 13:30'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO]);
    await barrer(AR('2026-09-29 18:00'));
    await barrer(AR('2026-09-30 09:30'));
    await barrer(AR('2026-09-30 12:00'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO], 'el 2º salió fuera de la mañana del día siguiente');
    await barrer(AR('2026-09-30 10:30'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO, SEGUNDO]);
    await barrer(AR('2026-09-30 11:00'));
    await barrer(AR('2026-10-01 10:30'));
    await barrer(AR('2026-10-01 15:00'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO, SEGUNDO], 'salió un 3º');
  });

  await check('si el 2º no salió el día siguiente (el bot estaba apagado), no sale después', async () => {
    apartarLosDemas();
    const chat = conPrecio(AR('2026-09-29 10:00'));
    await barrer(AR('2026-09-29 13:30'));
    await barrer(AR('2026-10-01 10:30'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO]);
  });

  await check('un precio de hace más de SEGUIMIENTO_MAX_HORAS (24) no recibe el 1º', async () => {
    apartarLosDemas();
    const chat = conPrecio(AR('2026-09-29 10:00'));
    await barrer(AR('2026-09-30 10:30'));
    assert.deepStrictEqual(aEste(chat), []);
  });

  await check('cuando el cliente vuelve a escribir, la cuenta arranca de cero con el precio nuevo', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 10:00');
    const chat = conPrecio(precio);
    await barrer(AR('2026-09-29 13:30'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO]);
    // Contestó, y el bot le pasó otra cotización a las 15:00: hasta las 18:00, nada.
    const nuevo = AR('2026-09-29 15:00');
    const s = state.todos()[chat];
    state.actualizar(chat, {
      ultimoPrecioBot: nuevo,
      ultimoEnvioCliente: nuevo,
      historial: [...s.historial, { quien: 'cliente', texto: 'y con 400?', ts: nuevo - MIN }, { quien: 'vendedor', texto: '· o 2 cuotas de $250.000 cada una', ts: nuevo }],
    });
    await barrer(AR('2026-09-29 17:00'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO], 'salió antes de las 3 h del precio nuevo');
    await barrer(AR('2026-09-29 18:30'));
    assert.deepStrictEqual(aEste(chat), [PRIMERO, PRIMERO], 'con el precio nuevo no volvió a arrancar del 1º');
  });

  console.log('\nSeguimiento: cuándo no sale\n');

  await check('el cliente contestó después del precio: no sale', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 10:00');
    const chat = conPrecio(precio, { despues: [{ quien: 'cliente', texto: 'gracias', ts: precio + 10 * MIN }] });
    await barrer(AR('2026-09-29 14:00'));
    assert.deepStrictEqual(aEste(chat), []);
  });

  await check('escribió una persona de la cuenta después del precio: no sale; si escribió antes, sí (lo que pasa una persona lo sigue esa persona)', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 10:00');
    const despues = conPrecio(precio, { despues: [{ quien: 'vendedor', texto: 'cualquier cosa avisame', ts: precio + 5 * MIN, humano: true }] });
    const conHumano = conPrecio(precio, { extra: { ultimoHumano: precio + 20 * MIN } });
    const antes = conPrecio(precio, { antes: [{ quien: 'vendedor', texto: 'hola! soy fran', ts: precio - 2 * HORA, humano: true }], extra: { ultimoHumano: precio - 2 * HORA } });
    await barrer(AR('2026-09-29 14:00'));
    assert.deepStrictEqual(aEste(despues), [], 'salió con una línea de una persona después del precio');
    assert.deepStrictEqual(aEste(conHumano), [], 'salió con ultimoHumano después del precio');
    assert.deepStrictEqual(aEste(antes), [PRIMERO], 'una persona que escribió antes del precio lo frena (la regla de antes)');
  });

  await check('después del precio dijo "lo voy a pensar" (y después el bot le pasó otro): no sale', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 10:00');
    const chat = conPrecio(precio, {
      antes: [
        { quien: 'vendedor', texto: 'el 13 esta $495.000 de contado', ts: precio - 30 * MIN },
        { quien: 'cliente', texto: 'lo voy a pensar, y en cuotas?', ts: precio - 20 * MIN },
      ],
    });
    await barrer(AR('2026-09-29 14:00'));
    assert.deepStrictEqual(aEste(chat), []);
    for (const frase of ['lo pienso', 'no me interesa', 'no me escribas', 'no gracias', 'ya compré', 'ya conseguí']) {
      const otro = conPrecio(precio, { antes: [{ quien: 'vendedor', texto: '$495.000', ts: precio - 30 * MIN }, { quien: 'cliente', texto: frase, ts: precio - 20 * MIN }] });
      await barrer(AR('2026-09-29 14:00'));
      assert.deepStrictEqual(aEste(otro), [], `salió con "${frase}"`);
    }
  });

  await check('no sale con el chat escalado, pausado, con #vendido o #perdido, ni si el último escalado fue por postventa', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 10:00');
    const libre = conPrecio(precio);
    const escalado = conPrecio(precio, { extra: { escalado: true, escaladoEn: precio } });
    const pausado = conPrecio(precio, { extra: { pausado: true } });
    const vendido = conPrecio(precio, { extra: { resultado: { tipo: 'vendido', ts: precio } } });
    const perdido = conPrecio(precio, { extra: { resultado: { tipo: 'perdido', ts: precio } } });
    const postventa = conPrecio(precio, { extra: { escalado: false, escaladoMotivo: 'postventa: el que compró no carga' } });
    await barrer(AR('2026-09-29 14:00'));
    assert.deepStrictEqual(aEste(libre), [PRIMERO], 'el caso no prueba nada: al chat libre no le salió');
    for (const [chat, que] of [[escalado, 'escalado'], [pausado, 'pausado'], [vendido, '#vendido'], [perdido, '#perdido'], [postventa, 'postventa']]) {
      assert.deepStrictEqual(aEste(chat), [], `le escribió a un chat ${que}`);
    }
  });

  await check('no sale a un contacto personal (CONTACTOS_PERSONALES), aunque su estado sea de antes de sumarlo a la lista', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 10:00');
    const libre = conPrecio(precio);
    const personal = conPrecio(precio);
    config.contactosPersonales.push(personal.replace(/\D/g, ''));
    try {
      await barrer(AR('2026-09-29 14:00'));
    } finally {
      config.contactosPersonales.pop();
    }
    assert.deepStrictEqual(aEste(libre), [PRIMERO], 'el caso no prueba nada: al chat libre no le salió');
    assert.deepStrictEqual(aEste(personal), [], 'le escribió a un contacto personal');
  });

  await check('sin un precio del bot (o si no le llegó) no sale', async () => {
    apartarLosDemas();
    const precio = AR('2026-09-29 10:00');
    const sinPrecio = conPrecio(precio, { extra: { ultimoPrecioBot: 0 } });
    const noLlego = conPrecio(precio, { extra: { ultimoEnvioCliente: 0 } });
    await barrer(AR('2026-09-29 14:00'));
    assert.deepStrictEqual(aEste(sinPrecio), []);
    assert.deepStrictEqual(aEste(noLlego), []);
    // Sin precio no sale aunque SEGUIMIENTO_MAX_HORAS no lo frene (un chat sin líneas del cliente).
    const previo = config.seguimiento.maxHoras;
    config.seguimiento.maxHoras = 1e9;
    try {
      const soloElBot = nuevoChat();
      state.actualizar(soloElBot, { ultimoBot: precio, ultimoEnvioCliente: precio, historial: [{ quien: 'vendedor', texto: 'hola, te paso info', ts: precio }] });
      await barrer(AR('2026-09-29 14:00'));
      assert.deepStrictEqual(aEste(soloElBot), [], 'salió sin un precio del bot');
    } finally {
      config.seguimiento.maxHoras = previo;
    }
  });

  await check('se marca aunque el envío falle: no se repite en el barrido siguiente', async () => {
    apartarLosDemas();
    const chat = conPrecio(AR('2026-09-29 10:00'));
    const real = evolution.enviarTexto;
    let intentos = 0;
    evolution.enviarTexto = async () => {
      intentos++;
      throw new Error('Evolution 500');
    };
    try {
      await barrer(AR('2026-09-29 14:00'));
      await barrer(AR('2026-09-29 14:05'));
    } finally {
      evolution.enviarTexto = real;
    }
    assert.strictEqual(intentos, 1, `se intentó ${intentos} veces`);
    assert.strictEqual(state.todos()[chat].seguimiento.n, 1, 'no quedó marcado');
  });

  await check('queda un evento `seguimiento` con el número en el registro de aprendizaje', async () => {
    const eventos = fs
      .readFileSync(process.env.APRENDIZAJE_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((e) => e.tipo === 'seguimiento');
    assert.ok(eventos.some((e) => e.n === 1 && e.salio === true), JSON.stringify(eventos.slice(-2)));
    assert.ok(eventos.some((e) => e.n === 2), 'no está el 2º');
    assert.ok(eventos.some((e) => e.n === 1 && e.salio === false), 'el que falló no quedó');
  });

  await check('el tope por barrido (SEGUIMIENTO_MAX_POR_BARRIDO) se respeta', async () => {
    apartarLosDemas();
    const previo = config.seguimiento.maxPorBarrido;
    config.seguimiento.maxPorBarrido = 2;
    try {
      const chats = [1, 2, 3, 4].map(() => conPrecio(AR('2026-09-29 10:00')));
      await barrer(AR('2026-09-29 14:00'));
      assert.strictEqual(chats.filter((c) => aEste(c).length).length, 2);
    } finally {
      config.seguimiento.maxPorBarrido = previo;
    }
  });

  await check('en borrador o en escucha no sale nada', async () => {
    for (const modo of ['modoBorrador', 'modoEscucha']) {
      apartarLosDemas();
      const chat = conPrecio(AR('2026-09-29 10:00'));
      config[modo] = true;
      try {
        await barrer(AR('2026-09-29 14:00'));
      } finally {
        config[modo] = false;
      }
      assert.deepStrictEqual(aEste(chat), [], `salió en ${modo}`);
    }
  });

  console.log('\nSeguimiento: la misma guardia que las respuestas (Pendientes 2)\n');

  // Evolution de mentira: anota cada POST con su hora y su cuerpo. `alEscribir` corre a mitad de la
  // espera del "escribiendo…"; `alPostear`, con el sendText en vuelo.
  const ESPERA = 80;
  const posts = [];
  let alEscribir = null;
  let alPostear = null;
  const ok = (cuerpo) => ({ ok: true, status: 200, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
  const evolutionDeMentira = async (url, opciones = {}) => {
    const u = String(url);
    if (!u.startsWith(process.env.EVOLUTION_URL)) throw new Error('salió a la red durante la prueba: ' + u);
    const cuerpo = JSON.parse(opciones.body || '{}');
    const post = { ruta: u.slice(process.env.EVOLUTION_URL.length), cuerpo, t: Date.now() };
    posts.push(post);
    if (post.ruta.includes('/chat/sendPresence/') && alEscribir) {
      const fn = alEscribir;
      alEscribir = null;
      setTimeout(() => Promise.resolve(fn()).catch((e) => console.error('alEscribir:', e)), ESPERA / 2);
    }
    if (post.ruta.includes('/message/sendText/')) {
      if (alPostear) {
        const fn = alPostear;
        alPostear = null;
        await fn();
      }
      return ok({ key: { remoteJid: cuerpo.number, fromMe: true, id: 'SEG' + posts.length } });
    }
    return ok({});
  };
  const escrito = (chatId, texto) => ({ key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() }, pushName: 'Lucia', message: { conversation: texto } });
  const mio = (chatId, texto) => ({ key: { remoteJid: chatId, fromMe: true, id: 'H' + Math.random() }, pushName: 'Lucia', message: { conversation: texto } });
  const seguimientosA = (chat) => posts.filter((p) => p.ruta.includes('/message/sendText/') && p.cuerpo.number === chat && p.cuerpo.text === PRIMERO);
  // Un precio de hace 4 horas, con el reloj del barrido a las 15:00 de Argentina.
  const RELOJ = AR('2026-09-29 15:00');
  const planton = () => conPrecio(RELOJ - 4 * HORA);
  /** Un barrido contra el Evolution de mentira, con la espera del "escribiendo…" corta. */
  async function barrerConEvolution() {
    posts.length = 0;
    const antes = { enviarTexto: evolution.enviarTexto, mostrarEscribiendo: evolution.mostrarEscribiendo, fetch: globalThis.fetch };
    evolution.enviarTexto = enviarTextoReal;
    evolution.mostrarEscribiendo = mostrarEscribiendoReal;
    globalThis.fetch = evolutionDeMentira;
    try {
      await bot.revisarSeguimientos({ escribiendoMs: ESPERA, reloj: () => RELOJ });
    } finally {
      Object.assign(evolution, { enviarTexto: antes.enviarTexto, mostrarEscribiendo: antes.mostrarEscribiendo });
      globalThis.fetch = antes.fetch;
      alEscribir = null;
      alPostear = null;
    }
  }

  await check('el caso normal: "escribiendo…", la espera, y recién ahí el envío con delay 0; deja la marca, ultimoBot y la línea en el historial', async () => {
    apartarLosDemas();
    const chat = planton();
    await barrerConEvolution();
    const salio = seguimientosA(chat);
    assert.strictEqual(salio.length, 1, `tenía que salir un seguimiento, salieron ${salio.length}`);
    assert.strictEqual(salio[0].cuerpo.delay, 0, `el seguimiento salió con delay ${salio[0].cuerpo.delay}`);
    const presencia = posts.find((p) => p.ruta.includes('/chat/sendPresence/') && p.cuerpo.number === chat);
    assert.ok(presencia, 'no mostró "escribiendo…" antes del seguimiento');
    assert.deepStrictEqual(presencia.cuerpo, { number: chat, presence: 'composing', delay: ESPERA });
    assert.ok(salio[0].t - presencia.t >= ESPERA - 5, `el seguimiento salió ${salio[0].t - presencia.t} ms después del "escribiendo…"`);
    const s = state.todos()[chat];
    assert.strictEqual(s.seguimiento.n, 1, 'no quedó la marca');
    assert.strictEqual(s.ultimoBot, RELOJ, 'no movió ultimoBot');
    assert.ok(s.botEnvio, 'no anotó el envío (botEnvio)');
    assert.ok(s.historial.some((l) => l.quien === 'vendedor' && l.texto === PRIMERO), 'no anotó el seguimiento en el historial');
  });

  /** Provoca `evento` durante la espera del seguimiento de un chat y devuelve ese chat. */
  async function cortadoPor(evento) {
    apartarLosDemas();
    const chat = planton();
    alEscribir = () => evento(chat);
    alPostear = async () => {
      if (!alEscribir) return;
      const fn = alEscribir;
      alEscribir = null;
      await fn();
    };
    await barrerConEvolution();
    return chat;
  }
  const sinSeguimiento = (chat, que) => assert.strictEqual(seguimientosA(chat).length, 0, `salió el seguimiento aunque ${que} durante la espera`);
  const sinRastro = (chat) => {
    const s = state.todos()[chat] || {};
    assert.ok(!s.seguimiento, 'dejó la marca del seguimiento sin haber mandado nada');
    assert.ok(!(s.historial || []).some((l) => l.quien === 'vendedor' && l.texto === PRIMERO), 'anotó en el historial un seguimiento que no salió');
  };

  await check('un #reset durante la espera: no sale el sendText y el chat queda limpio', async () => {
    const chat = await cortadoPor((c) => bot.procesar(mio(c, '#reset')));
    sinSeguimiento(chat, 'hubo un #reset');
    assert.strictEqual(state.todos()[chat], undefined, 'el seguimiento volvió a crear el chat recién limpiado: ' + JSON.stringify(state.todos()[chat]));
  });

  await check('un escalado durante la espera: no sale el sendText y no se escribe nada', async () => {
    const chat = await cortadoPor(async (c) => require('../src/control').escalar(c, 'prueba'));
    sinSeguimiento(chat, 'el chat quedó escalado');
    sinRastro(chat);
  });

  await check('un #pausa durante la espera: no sale el sendText y no se escribe nada', async () => {
    const chat = await cortadoPor((c) => bot.procesar(mio(c, '#pausa')));
    sinSeguimiento(chat, 'hubo un #pausa');
    sinRastro(chat);
  });

  await check('un mensaje de una persona de la cuenta durante la espera: no sale el sendText y no se escribe nada', async () => {
    const chat = await cortadoPor((c) => bot.procesar(mio(c, 'hola! te escribo yo')));
    sinSeguimiento(chat, 'escribió alguien de la cuenta');
    sinRastro(chat);
  });

  await check('un mensaje nuevo del cliente durante la espera: no sale el sendText del seguimiento y no se escribe nada', async () => {
    const chat = await cortadoPor(async (c) => {
      bot.procesar(escrito(c, 'hola, sigo aca')).catch((e) => console.error(e));
    });
    sinSeguimiento(chat, 'escribió el cliente');
    sinRastro(chat);
    await dormir(200); // que termine la tanda del cliente antes del caso que sigue
  });

  await check('un #reset con el envío ya en vuelo: el seguimiento no vuelve a crear el chat', async () => {
    apartarLosDemas();
    const chat = planton();
    alPostear = () => bot.procesar(mio(chat, '#reset'));
    await barrerConEvolution();
    assert.strictEqual(seguimientosA(chat).length, 1, 'el caso no prueba nada: el seguimiento no llegó a postearse');
    assert.strictEqual(state.todos()[chat], undefined, 'escribió en el chat recién limpiado: ' + JSON.stringify(state.todos()[chat]));
  });

  await check('un seguimiento que se cortó no cuenta para SEGUIMIENTO_MAX_POR_BARRIDO', async () => {
    apartarLosDemas();
    const previo = config.seguimiento.maxPorBarrido;
    config.seguimiento.maxPorBarrido = 1;
    try {
      const cortado = planton();
      const siguiente = planton();
      alEscribir = () => bot.procesar(mio(cortado, '#pausa'));
      await barrerConEvolution();
      sinSeguimiento(cortado, 'hubo un #pausa');
      assert.strictEqual(seguimientosA(siguiente).length, 1, 'el seguimiento cortado gastó el tope del barrido');
    } finally {
      config.seguimiento.maxPorBarrido = previo;
    }
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

