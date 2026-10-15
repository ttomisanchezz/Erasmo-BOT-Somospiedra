'use strict';
/**
 * El contexto completo desde Evolution (bloque Ninjo 1b, 05/10/2026): src/contexto.js.
 *
 *   node test/contexto.test.js
 *
 * Con un `buscar` de mentira (lo que devolvería /chat/findMessages) y un estado temporal: nunca sale a
 * la red. Se prueba lo de la tabla del bloque (2 + 20 líneas, duplicados por id y por texto y hora, un
 * registro de otro chat, Evolution que falla, 30 líneas guardadas, #reset, @lid) y el resto: qué
 * entra y qué no (reacciones, protocolo, borrados, encuestas, los marcadores sin texto), quién lo
 * escribió (el cliente, el bot por su id, una persona), lo del último minuto, el tope de 8 s, los 10
 * minutos sin volver a pedir, el pedido a Evolution (`evolution.buscarMensajesDeChat`) y que
 * `npm run probar-contexto` no carga state.js.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'contexto-'));
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.ESTADO_SOLO_LECTURA = '';
process.env.EVOLUTION_URL = 'http://evolution.de-prueba.invalid';
process.env.EVOLUTION_INSTANCE = 'instancia-de-prueba';
process.env.EVOLUTION_APIKEY = 'clave-de-prueba';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));
// Si una promesa queda colgada, Node sale con 0 sin terminar las pruebas: eso no puede pasar como OK.
let termino = false;
process.on('exit', (codigo) => {
  if (!termino && !codigo) {
    console.log('\nLAS PRUEBAS NO TERMINARON (una promesa quedó colgada)\n');
    process.exitCode = 1;
  }
});

globalThis.fetch = async (url) => {
  throw new Error('salió a la red durante la prueba: ' + url);
};

const state = require('../src/state');
const contexto = require('../src/contexto');
const evolution = require('../src/evolution');
const chatsViejos = require('../src/chats-viejos');
const autoria = require('../src/autoria');

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

const MIN = 60 * 1000;
let n = 0;
const nuevoChat = () => '54900000' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
let idReg = 0;
/** Un registro de findMessages: { key, messageTimestamp (en segundos), messageType, message }. */
function reg(chat, { texto = 'hola', ts, fromMe = false, id = null, message = null, messageType = null, alt = null, extra = {} } = {}) {
  return {
    key: { remoteJid: chat, fromMe, id: id || 'R' + ++idReg, ...(alt ? { remoteJidAlt: alt } : {}) },
    pushName: 'Lucia',
    messageType: messageType || (message ? Object.keys(message)[0] : 'conversation'),
    message: message || { conversation: texto },
    messageTimestamp: Math.floor(ts / 1000),
    ...extra,
  };
}
/** Un chat con estas líneas en el historial, cada una con su hora. */
function chatCon(lineas) {
  const chat = nuevoChat();
  state.actualizar(chat, { historial: lineas.map((l) => ({ ...l })) });
  return chat;
}
const buscarQueDevuelve = (porJid) => {
  const pedidos = [];
  const buscar = async (jid, cuantos) => {
    pedidos.push({ jid, cuantos });
    return typeof porJid === 'function' ? porJid(jid) : porJid[jid] || [];
  };
  return { buscar, pedidos };
};

(async () => {
  console.log('\nEl contexto completo desde Evolution\n');

  await check('chat con 2 líneas y 20 de Evolution: 22 líneas, en orden y con las etiquetas bien (cliente, bot, persona)', async () => {
    const ahora = Date.now();
    const chat = chatCon([
      { quien: 'cliente', texto: 'hola, sigo con lo del 13', ts: ahora - 2 * MIN, id: 'C-1' },
      { quien: 'vendedor', texto: 'dale, contame', ts: ahora - MIN },
    ]);
    autoria.aterrizar(autoria.despegar(chat, 'texto', 'x'), { key: { id: 'BOT-AUTORIA' } });
    chatsViejos.envioConfirmado('BOT-VIEJOS');
    const registros = [];
    const t0 = ahora - 3 * 24 * 60 * MIN;
    for (let i = 0; i < 20; i++) {
      const ts = t0 + i * 10 * MIN;
      if (i % 4 === 0) registros.push(reg(chat, { ts, texto: `cliente ${i}` }));
      else if (i === 1) registros.push(reg(chat, { ts, fromMe: true, id: 'BOT-AUTORIA', texto: `bot ${i}` }));
      else if (i === 2) registros.push(reg(chat, { ts, fromMe: true, id: 'BOT-VIEJOS', texto: `bot ${i}` }));
      else if (i % 4 === 1) registros.push(reg(chat, { ts, fromMe: true, texto: `persona ${i}` }));
      else registros.push(reg(chat, { ts, texto: `cliente ${i}` }));
    }
    const { buscar, pedidos } = buscarQueDevuelve({ [chat]: registros.slice().reverse() });
    const r = await contexto.completar(chat, { buscar });
    assert.strictEqual(r.agregadas, 20, JSON.stringify(r));
    assert.deepStrictEqual(pedidos, [{ jid: chat, cuantos: 30 }]);
    const s = state.todos()[chat];
    assert.strictEqual(s.historial.length, 22);
    const ts = s.historial.map((l) => l.ts);
    assert.deepStrictEqual(ts, ts.slice().sort((a, b) => a - b), 'no quedó en orden');
    assert.strictEqual(s.historial[20].texto, 'hola, sigo con lo del 13', 'lo del historial no quedó al final');
    const etiquetas = Object.fromEntries(s.historial.map((l) => [l.texto, contexto.etiqueta(l)]));
    assert.strictEqual(etiquetas['cliente 0'], 'Cliente');
    assert.strictEqual(etiquetas['bot 1'], 'Vos (antes)', 'un id anotado en autoria.js es del bot');
    assert.strictEqual(etiquetas['bot 2'], 'Vos (antes)', 'un id de los envíos de chats-viejos es del bot');
    assert.strictEqual(etiquetas['persona 5'], 'Persona de la cuenta');
    assert.ok(s.historial.filter((l) => l.evolution).length === 20 && s.historial.filter((l) => l.evolution).every((l) => l.id));
    assert.ok(s.evolutionTraido > 0, 'no quedó marcado');
    assert.ok((s.lineasPersona || []).some((l) => l.texto === 'persona 17'), 'la persona no fue a lineasPersona');
    // Ya marcado: no se pide otra vez.
    const otra = await contexto.completar(chat, { buscar });
    assert.ok(otra.omitido && pedidos.length === 1, JSON.stringify(otra));
  });

  await check('duplicado por id, y duplicado por texto y hora (una línea vieja sin id): entra uno solo y queda la del historial', async () => {
    const ahora = Date.now();
    const chat = chatCon([
      { quien: 'cliente', texto: 'Tenes el 13?', ts: ahora - 60 * MIN, id: 'MISMO-ID' },
      { quien: 'vendedor', texto: 'sii,  tenemos el 13', ts: ahora - 59 * MIN },
      { quien: 'cliente', texto: 'ok', ts: ahora - 2 * MIN },
    ]);
    const registros = [
      reg(chat, { ts: ahora - 60 * MIN, id: 'MISMO-ID', texto: 'Tenes el 13?' }),
      // La línea vieja del bot no tiene id: el mismo texto (sin mayúsculas ni espacios dobles), a 1 minuto.
      reg(chat, { ts: ahora - 58 * MIN, fromMe: true, id: 'OTRO', texto: 'Sii, tenemos el 13' }),
      // Del otro lado no es la misma, aunque diga lo mismo.
      reg(chat, { ts: ahora - 58 * MIN, texto: 'sii, tenemos el 13' }),
      // A más de 3 minutos tampoco.
      reg(chat, { ts: ahora - 50 * MIN, fromMe: true, texto: 'sii, tenemos el 13' }),
    ];
    const r = await contexto.completar(chat, { buscar: buscarQueDevuelve({ [chat]: registros }).buscar });
    assert.strictEqual(r.agregadas, 2, JSON.stringify(r));
    const h = state.todos()[chat].historial;
    assert.strictEqual(h.filter((l) => /tenes el 13/i.test(l.texto)).length, 1, 'el duplicado por id entró dos veces');
    const delBot = h.filter((l) => l.quien === 'vendedor' && /tenemos el 13/i.test(l.texto));
    assert.strictEqual(delBot.length, 2, JSON.stringify(h));
    assert.ok(!delBot[0].humano && !delBot[0].evolution, 'no quedó la del historial (la del bot)');
    assert.ok(delBot[1].humano && delBot[1].evolution, 'la de 8 minutos después es de una persona');
  });

  await check('un audio viejo: el "[audio]" de Evolution es la misma línea que la transcripción del historial', async () => {
    const ahora = Date.now();
    const chat = chatCon([{ quien: 'cliente', texto: 'tengo 400 para el 13', ts: ahora - 30 * MIN, audio: true }, { quien: 'cliente', texto: 'y?', ts: ahora - 2 * MIN }]);
    const registros = [reg(chat, { ts: ahora - 30 * MIN - 2000, message: { audioMessage: { seconds: 4 } } })];
    const r = await contexto.completar(chat, { buscar: buscarQueDevuelve({ [chat]: registros }).buscar });
    assert.strictEqual(r.agregadas, 0, JSON.stringify(state.todos()[chat].historial));
  });

  await check('un registro de otro chat: no se usa ninguno y el chat no queda marcado', async () => {
    const ahora = Date.now();
    const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: ahora - 2 * MIN }]);
    const otro = nuevoChat();
    const registros = [reg(chat, { ts: ahora - 60 * MIN, texto: 'del chat' }), reg(otro, { ts: ahora - 50 * MIN, texto: 'de OTRO chat' })];
    const r = await contexto.completar(chat, { buscar: buscarQueDevuelve({ [chat]: registros }).buscar });
    assert.ok(/no filtró por chat/.test(r.error || ''), JSON.stringify(r));
    const s = state.todos()[chat];
    assert.strictEqual(s.historial.length, 1);
    assert.ok(!s.evolutionTraido, 'quedó marcado');
    // Un registro que trae el número en remoteJidAlt (el chat guardado con su @lid) sí es de este chat.
    const conAlt = chatCon([{ quien: 'cliente', texto: 'hola', ts: ahora - 2 * MIN }]);
    const lid = '999888777666@lid';
    const r2 = await contexto.completar(conAlt, { buscar: buscarQueDevuelve({ [conAlt]: [{ ...reg(lid, { ts: ahora - 60 * MIN, texto: 'por el lid' }), key: { remoteJid: lid, remoteJidAlt: conAlt, fromMe: false, id: 'ALT1' } }] }).buscar });
    assert.strictEqual(r2.agregadas, 1, JSON.stringify(r2));
  });

  await check('Evolution falla: sigue como hoy, no se marca y no se vuelve a pedir por 10 minutos', async () => {
    const ahora = Date.now();
    const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: ahora - 2 * MIN }]);
    let llamadas = 0;
    const buscar = async () => {
      llamadas++;
      throw new Error('Evolution 500 en findMessages');
    };
    const r = await contexto.completar(chat, { buscar });
    assert.ok(/Evolution no contestó \(Evolution 500/.test(r.error || ''), JSON.stringify(r));
    assert.ok(!state.todos()[chat].evolutionTraido);
    assert.strictEqual(state.todos()[chat].historial.length, 1);
    await contexto.completar(chat, { buscar });
    assert.strictEqual(llamadas, 1, 'lo volvió a pedir antes de los 10 minutos');
    await contexto.completar(chat, { buscar, ahora: Date.now() + 11 * MIN });
    assert.strictEqual(llamadas, 2, 'pasados los 10 minutos no lo volvió a pedir');
  });

  await check('Evolution tarda más de 8 s: sigue como hoy (con el tope achicado para la prueba)', async () => {
    const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: Date.now() - 2 * MIN }]);
    // Con un reloj propio: si el tope no anda, completar no vuelve nunca y esto lo dice.
    const r = await Promise.race([
      contexto.completar(chat, { buscar: () => new Promise(() => {}), esperaMs: 30 }),
      new Promise((ok) => setTimeout(() => ok({ colgado: true }), 3000)),
    ]);
    assert.ok(!r.colgado, 'completar no volvió: el tope de espera no anda');
    assert.ok(/no contestó \(tardó más de/.test(r.error || ''), JSON.stringify(r));
    assert.strictEqual(contexto.ESPERA_MS, 8000);
    assert.ok(!state.todos()[chat].evolutionTraido);
  });

  await check('con 30 líneas guardadas no se pide', async () => {
    const ahora = Date.now();
    const chat = chatCon(Array.from({ length: 30 }, (_, i) => ({ quien: i % 2 ? 'vendedor' : 'cliente', texto: `l${i}`, ts: ahora - (40 - i) * MIN })));
    const { buscar, pedidos } = buscarQueDevuelve({});
    const r = await contexto.completar(chat, { buscar });
    assert.ok(r.omitido && !pedidos.length, JSON.stringify(r));
  });

  await check('después de un #reset no se pide: el chat nace con evolutionTraido en la hora del reset (y el reset no lo vuelve a crear)', async () => {
    const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: Date.now() - 5 * MIN }]);
    const antes = Date.now();
    state.reiniciar(chat, { evolutionTraido: antes });
    assert.strictEqual(state.todos()[chat], undefined, 'el #reset dejó el chat creado');
    state.agregarAlHistorial(chat, 'cliente', 'hola de nuevo');
    assert.strictEqual(state.todos()[chat].evolutionTraido, antes);
    const { buscar, pedidos } = buscarQueDevuelve({});
    const r = await contexto.completar(chat, { buscar });
    assert.ok(r.omitido && !pedidos.length, JSON.stringify(r));
    // Sin la marca (otro chat que no se reseteó) sí se pide.
    const otro = chatCon([{ quien: 'cliente', texto: 'hola', ts: Date.now() - 5 * MIN }]);
    await contexto.completar(otro, { buscar });
    assert.strictEqual(pedidos.length, 1);
  });

  await check('chat con @lid: se pide también el lid y se juntan los dos (sin repetir)', async () => {
    const ahora = Date.now();
    const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: ahora - 2 * MIN }]);
    const numero = chat.split('@')[0];
    const lidJid = '123456789012345@lid';
    const lidDe = chatsViejos.lidDe;
    chatsViejos.lidDe = (num) => (num === numero ? '123456789012345' : null);
    try {
      const comun = reg(lidJid, { ts: ahora - 40 * MIN, id: 'EN-LOS-DOS', texto: 'en los dos' });
      const { buscar, pedidos } = buscarQueDevuelve({
        [chat]: [reg(chat, { ts: ahora - 50 * MIN, texto: 'por el número' }), { ...comun, key: { ...comun.key, remoteJid: chat } }],
        [lidJid]: [reg(lidJid, { ts: ahora - 45 * MIN, texto: 'por el lid' }), comun],
      });
      const r = await contexto.completar(chat, { buscar });
      assert.deepStrictEqual(pedidos.map((p) => p.jid).sort(), [lidJid, chat].sort());
      assert.strictEqual(r.agregadas, 3, JSON.stringify(state.todos()[chat].historial));
    } finally {
      chatsViejos.lidDe = lidDe;
    }
  });

  await check('qué entra: el texto (con o sin pie de foto), y sin texto los marcadores; no entran reacciones, protocolo, borrados ni encuestas', async () => {
    const ahora = Date.now();
    const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: ahora - 2 * MIN }]);
    const t = (k) => ahora - (100 - k) * MIN;
    const registros = [
      reg(chat, { ts: t(1), message: { extendedTextMessage: { text: 'un texto largo' } } }),
      reg(chat, { ts: t(2), message: { imageMessage: { caption: 'mi 12, mirá' } } }),
      reg(chat, { ts: t(3), message: { imageMessage: {} } }),
      reg(chat, { ts: t(4), message: { audioMessage: { seconds: 3 } } }),
      reg(chat, { ts: t(5), message: { videoMessage: {} } }),
      reg(chat, { ts: t(6), message: { stickerMessage: {} } }),
      reg(chat, { ts: t(7), fromMe: true, message: { documentMessage: { fileName: 'x.pdf' } } }),
      reg(chat, { ts: t(8), message: { reactionMessage: { text: '👍' } } }),
      reg(chat, { ts: t(9), message: { protocolMessage: { type: 'REVOKE' } } }),
      reg(chat, { ts: t(10), message: { pollCreationMessageV3: { name: 'encuesta' } } }),
      reg(chat, { ts: t(11), texto: 'este se borró', extra: { status: 'DELETED' } }),
      reg(chat, { ts: t(12), message: { locationMessage: { degreesLatitude: 1 } } }),
      reg(chat, { ts: t(13), texto: 'con contexto', extra: {} }),
      // Sin messageType (otra versión de Evolution): se mira la clave del message.
      { ...reg(chat, { ts: t(14), message: { reactionMessage: { text: '❤️' }, conversation: 'una reaccion con texto' } }), messageType: undefined },
      // El tipo manda aunque traiga texto: una edición (protocolo) no entra como mensaje nuevo.
      { ...reg(chat, { ts: t(15), message: { conversation: 'lo edité' } }), messageType: 'editedMessage' },
    ];
    registros[12].message.messageContextInfo = { deviceListMetadata: {} };
    const r = await contexto.completar(chat, { buscar: buscarQueDevuelve({ [chat]: registros }).buscar });
    const textos = state.todos()[chat].historial.filter((l) => l.evolution).map((l) => l.texto);
    assert.deepStrictEqual(textos, ['un texto largo', 'mi 12, mirá', '[foto]', '[audio]', '[video]', '[sticker]', '[archivo]', 'con contexto']);
    assert.strictEqual(r.agregadas, 8);
    // Un "[archivo]" de una persona no va a lineasPersona: no es algo que dijo.
    assert.ok(!(state.todos()[chat].lineasPersona || []).some((l) => l.texto === '[archivo]'));
  });

  await check('chats-viejos: lidDe busca el @lid del número al revés en `lids`, e idsDelBot junta los del archivo y los de este proceso', async () => {
    fs.writeFileSync(
      chatsViejos.ARCHIVO,
      JSON.stringify({ viejos: {}, lids: { 123456789012345: '5490000000099', 111: null }, idsBot: ['ID-DEL-ARCHIVO'], semilla: { en: new Date().toISOString(), primerArranque: new Date().toISOString() }, alDia: new Date().toISOString() })
    );
    try {
      await chatsViejos.arrancar({ escucha: Date.now(), buscar: async () => ({ registros: [], paginas: 1 }) });
      assert.strictEqual(chatsViejos.lidDe('5490000000099'), '123456789012345');
      assert.strictEqual(chatsViejos.lidDe('5490000000098'), null);
      chatsViejos.envioConfirmado('ID-DE-ESTE-PROCESO');
      const ids = chatsViejos.idsDelBot();
      assert.ok(ids.has('ID-DEL-ARCHIVO') && ids.has('ID-DE-ESTE-PROCESO'), [...ids].join(', '));
    } finally {
      chatsViejos.detener();
    }
  });

  await check('lo del último minuto antes de la línea más nueva (o después) no entra: está llegando por el webhook', async () => {
    const ahora = Date.now();
    const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: ahora - 10 * MIN }, { quien: 'cliente', texto: 'tenes el 13?', ts: ahora }]);
    const registros = [
      reg(chat, { ts: ahora - 20 * MIN, texto: 'de antes' }),
      reg(chat, { ts: ahora - 30 * 1000, texto: 'llegando por el webhook' }),
      reg(chat, { ts: ahora + 5000, texto: 'posterior' }),
    ];
    const r = await contexto.completar(chat, { buscar: buscarQueDevuelve({ [chat]: registros }).buscar });
    assert.strictEqual(r.agregadas, 1);
    assert.deepStrictEqual(state.todos()[chat].historial.map((l) => l.texto), ['de antes', 'hola', 'tenes el 13?']);
  });

  await check('con 25 guardadas y 20 de Evolution quedan las últimas 30, por hora', async () => {
    const ahora = Date.now();
    const chat = chatCon(Array.from({ length: 25 }, (_, i) => ({ quien: 'cliente', texto: `guardada ${i}`, ts: ahora - (25 - i) * MIN })));
    const registros = Array.from({ length: 20 }, (_, i) => reg(chat, { ts: ahora - (500 - i) * MIN, texto: `vieja ${i}` }));
    await contexto.completar(chat, { buscar: buscarQueDevuelve({ [chat]: registros }).buscar });
    const h = state.todos()[chat].historial;
    assert.strictEqual(h.length, 30);
    assert.deepStrictEqual(h.slice(0, 5).map((l) => l.texto), ['vieja 15', 'vieja 16', 'vieja 17', 'vieja 18', 'vieja 19']);
  });

  await check('sin EVOLUTION_APIKEY (y sin buscar inyectado) no se pide nada; un chat que no está tampoco', async () => {
    const config = require('../src/config');
    const clave = config.evolution.apikey;
    config.evolution.apikey = '';
    try {
      const chat = chatCon([{ quien: 'cliente', texto: 'hola', ts: Date.now() - 2 * MIN }]);
      const r = await contexto.completar(chat);
      assert.ok(/sin EVOLUTION_APIKEY/.test(r.omitido || ''), JSON.stringify(r));
    } finally {
      config.evolution.apikey = clave;
    }
    const r2 = await contexto.completar(nuevoChat(), { buscar: async () => [] });
    assert.ok(/no está/.test(r2.omitido || ''));
    assert.strictEqual(state.todos()['54900000' + String(n).padStart(5, '0') + '@s.whatsapp.net'], undefined, 'creó el chat');
  });

  await check('evolution.buscarMensajesDeChat: POST /chat/findMessages con where.key.remoteJid, page 1 y offset; devuelve los registros', async () => {
    const real = globalThis.fetch;
    let pedido = null;
    globalThis.fetch = async (url, opciones) => {
      pedido = { url: String(url), opciones };
      return { ok: true, status: 200, json: async () => ({ messages: { total: 1, pages: 1, records: [{ key: { id: 'X' } }] } }) };
    };
    try {
      const r = await evolution.buscarMensajesDeChat('5490000000001@s.whatsapp.net', 30);
      assert.deepStrictEqual(r, [{ key: { id: 'X' } }]);
      assert.strictEqual(pedido.url, 'http://evolution.de-prueba.invalid/chat/findMessages/instancia-de-prueba');
      assert.strictEqual(pedido.opciones.method, 'POST');
      assert.strictEqual(pedido.opciones.headers.apikey, 'clave-de-prueba');
      assert.deepStrictEqual(JSON.parse(pedido.opciones.body), { where: { key: { remoteJid: '5490000000001@s.whatsapp.net' } }, page: 1, offset: 30 });
      assert.ok(pedido.opciones.signal, 'sin tope de espera');
      globalThis.fetch = async () => ({ ok: false, status: 401, text: async () => 'Unauthorized' });
      await assert.rejects(() => evolution.buscarMensajesDeChat('x@s.whatsapp.net'), /Evolution 401 en findMessages/);
      globalThis.fetch = async () => ({ ok: true, status: 200, json: async () => ({ algo: 1 }) });
      await assert.rejects(() => evolution.buscarMensajesDeChat('x@s.whatsapp.net'), /sin messages\.records/);
    } finally {
      globalThis.fetch = real;
    }
  });

  await check('textoDelMensaje vive en texto-del-mensaje.js e index.js usa ese (no una copia)', async () => {
    const indice = fs.readFileSync(path.join(__dirname, '..', 'src', 'index.js'), 'utf8');
    assert.ok(/require\('\.\/texto-del-mensaje'\)/.test(indice), 'index.js no lo requiere');
    assert.ok(!/function textoDelMensaje/.test(indice), 'index.js tiene su propia copia');
    const { textoDelMensaje } = require('../src/texto-del-mensaje');
    assert.strictEqual(textoDelMensaje({ message: { conversation: '  hola  ' } }), 'hola');
    assert.strictEqual(textoDelMensaje({ message: { videoMessage: { caption: 'mi video' } } }), 'mi video');
    assert.strictEqual(textoDelMensaje({ message: { documentMessage: { caption: 'no lo lee' } } }), '');
  });

  await check('npm run probar-contexto: imprime lo que trae y no carga state.js (otro proceso, con un Evolution de mentira)', async () => {
    const codigo = [
      "process.chdir(" + JSON.stringify(TMP) + ");",
      "globalThis.fetch = async (url, o) => { const jid = JSON.parse(o.body).where.key.remoteJid;",
      "  const r = (t, fromMe, id) => ({ key: { remoteJid: jid, fromMe, id }, messageTimestamp: Math.floor(Date.now() / 1000) - 3600, message: { conversation: t } });",
      "  return { ok: true, status: 200, json: async () => ({ messages: { records: [r('hola, consulto por el 13', false, 'A'), r('sii, contame', true, 'B')] } }) }; };",
      "require(" + JSON.stringify(path.join(__dirname, 'probar-contexto.js')) + ").main(['5490000000077']).then(() => {",
      "  const cargo = Object.keys(require.cache).some((k) => /[\\\\/]src[\\\\/]state\\.js$/.test(k));",
      "  console.log('CARGO_STATE ' + cargo); });",
    ].join('\n');
    const r = spawnSync(process.execPath, ['-e', codigo], {
      cwd: __dirname,
      env: { ...process.env, EVOLUTION_APIKEY: 'clave-de-prueba', ESTADO_PATH: path.join(TMP, 'no-existe', 'estado.json') },
      encoding: 'utf8',
      timeout: 60000,
    });
    const salida = r.stdout + r.stderr;
    assert.ok(/CARGO_STATE false/.test(salida), salida);
    assert.ok(/Trajo 2 registro/.test(salida) && /todos de este chat/.test(salida), salida);
    assert.ok(/Cliente: hola, consulto por el 13/.test(salida) && /Persona de la cuenta: sii, contame/.test(salida), salida);
    assert.ok(!fs.existsSync(path.join(TMP, 'no-existe')), 'escribió algo');
  });

  termino = true;
  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
