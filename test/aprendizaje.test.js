'use strict';
/**
 * Registro de aprendizaje por eventos (bloque 6 de la auditoría del 15/09/2026, B1).
 *
 *   node test/aprendizaje.test.js
 *
 * Hasta el bloque 6 cada fila se armaba cuando escribía alguien de la cuenta, leyendo
 * campos del chat que se pisan (`ultimoMensajeCliente`, `ultimaPropuestaBot`,
 * `ultimaLectura`): si la persona contestaba mientras el bot interpretaba, la fila
 * mezclaba la pregunta nueva, la propuesta de la tanda anterior y la respuesta nueva.
 * Ahora se guarda un evento por cosa que pasa (`cliente`, `propuesta`, `humano`) y los
 * ejemplos se arman al leer (`aprendizaje.ejemplos`).
 *
 * Se prueba:
 *   1. una tanda normal y dos mensajes de la persona: un solo ejemplo;
 *   2. el cruce de la auditoría: la persona contesta mientras el bot interpreta;
 *   3. el cliente escribe después de la propuesta y antes de la persona (3b: mientras
 *      atiende una persona, en vivo no entra a ninguna tanda, y también se registra);
 *   4. cada propuesta lleva los id de SUS líneas;
 *   5. un #reset en medio de la tanda: no hay propuesta;
 *   6. comandos, ecos del bot, audios propios sin transcribir y contactos personales
 *      no generan eventos;
 *   7. en escucha la tanda espera y agrupa como en vivo;
 *   8. `ejemplos()` con eventos armados a mano;
 *   9. `npm run reproducir` con un archivo viejo y uno v2 inventados, sin red y sin
 *      escribir nada en data/.
 *  11. la clave por chat (bloque 7): dos chats con los mismos 4 dígitos tienen el
 *      mismo `chat` y distinta `clave`, un HMAC-SHA256 con la sal local;
 *  12. la sal se crea al lado del registro con el primer evento, no al cargar el módulo
 *      (12b: si otro proceso la creó recién, se usa la de él);
 *  13. sin sal, el evento se anota igual con `clave: null` (13b: una sal vacía no se usa,
 *      y cuando vuelve a haber sal, los eventos siguientes tienen clave);
 *  14. `ejemplos()` agrupa por clave: dos chats con los mismos 4 dígitos no se mezclan;
 *  15. `reproducir` también: se reproducen por separado.
 *
 * Sin red, extractor local, números inventados, estado y aprendizaje temporales. El
 * entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const { execFileSync, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000078@g.us';
const PERSONAL = '5490000009999@s.whatsapp.net';
const REPO = path.join(__dirname, '..');
const DATA = path.join(REPO, 'data');

process.env.ESPERA_MIN_MS = '20';
process.env.ESPERA_MAX_MS = '30';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = PERSONAL.split('@')[0];
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.AUDIO_ACTIVO = 'true';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-aprendizaje-' + process.pid + '.json');
// En una carpeta propia (bloque 7): la sal de la clave por chat se crea al lado del registro.
const TMP_APR = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-aprendizaje-'));
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(TMP_APR, 'aprendizaje.jsonl');

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
// `alEntender` corre mientras se interpreta la tanda: ahí se simula lo que pasa en ese
// rato (una persona que contesta, un mensaje nuevo del cliente, un #reset).
let alEntender = null;
const lecturas = [];
gemini.entender = async (h, m) => {
  lecturas.push(m);
  if (alEntender) {
    const fn = alEntender;
    alEntender = null;
    fn();
  }
  return local.entender(m);
};
gemini.redactar = async (instruccion, nombre, reserva) => reserva;
let transcripcion = null;
gemini.transcribir = async () => transcripcion;
evolution.base64DeMedia = async () => ({ base64: 'AAAA', mimetype: 'audio/ogg' });

// Evolution de mentira: cada envío devuelve su id, como Evolution v2 (key.id).
let idN = 0;
const aClientes = [];
async function envio(numero, tipo, texto) {
  const id = 'BOT' + ++idN;
  aClientes.push({ numero, tipo, texto, id });
  return { key: { remoteJid: numero, fromMe: true, id }, status: 'PENDING' };
}
evolution.enviarTexto = (numero, texto) => envio(numero, 'texto', texto);
evolution.enviarImagen = (numero) => envio(numero, 'imagen', '');
evolution.enviarDocumento = (numero, ruta, pie) => envio(numero, 'documento', pie);
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async () => ({});
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const aprendizaje = require('../src/aprendizaje');

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  } finally {
    alEntender = null;
    config.modoEscucha = false;
  }
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 1000;
const nuevoChat = () => '549000000' + n++ + '@s.whatsapp.net';
let idMsj = 0;
const nuevoId = (prefijo) => prefijo + ++idMsj;
const escrito = (chatId, texto, id = nuevoId('C')) => ({
  key: { remoteJid: chatId, fromMe: false, id },
  pushName: 'Ailin',
  message: { conversation: texto },
});
const mio = (chatId, texto, id = nuevoId('P')) => ({
  key: { remoteJid: chatId, fromMe: true, id },
  pushName: 'Ailin',
  message: { conversation: texto },
});
const notaDeVoz = (chatId, fromMe = false, id = nuevoId('A')) => ({
  key: { remoteJid: chatId, fromMe, id },
  pushName: 'Ailin',
  message: { audioMessage: { mimetype: 'audio/ogg', seconds: 5, ptt: true } },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);

const deChat = (chat) => aprendizaje.leerTodo().filter((e) => e.chat === aprendizaje.anonimo(chat));
const deTipo = (chat, tipo) => deChat(chat).filter((e) => e.tipo === tipo);
const ejemplosDe = (chat) => aprendizaje.ejemplos(aprendizaje.leerTodo()).filter((e) => e.chat === aprendizaje.anonimo(chat));

// El commit con el que corre el bot (index.js lo lee de .git sin lanzar procesos).
const commitEsperado = (() => {
  try {
    return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO }).toString().trim().slice(0, 7);
  } catch {
    return null;
  }
})();

(async () => {
  console.log('\nEventos de una charla\n');

  await check('1. el cliente escribe, el bot propone y la persona contesta dos mensajes: 4 eventos y UN ejemplo', async () => {
    const chat = nuevoChat();
    const idCliente = nuevoId('C');
    await bot.procesar(escrito(chat, 'tenes el iphone 13?', idCliente));
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: el bot no contestó');
    await bot.procesar(mio(chat, 'si! lo tenemos en azul y en negro'));
    await bot.procesar(mio(chat, 'queres que te pase fotos?'));

    // Bloque Ninjo 2: cada mensaje que salió deja también una `entrega` (la prueba es test/silencios-y-salud.test.js).
    const entregas = deChat(chat).filter((e) => e.tipo === 'entrega');
    assert.deepStrictEqual(entregas.map((e) => e.texto), aEste(chat).map((m) => m.texto), 'falta la entrega de lo que salió');
    const evs = deChat(chat).filter((e) => e.tipo !== 'entrega');
    assert.deepStrictEqual(evs.map((e) => e.tipo), ['cliente', 'propuesta', 'humano', 'humano']);
    for (const e of evs) {
      assert.strictEqual(e.v, 2, 'un evento sin v: 2');
      assert.ok(e.ts && !Number.isNaN(Date.parse(e.ts)), 'un evento sin ts');
      assert.strictEqual(e.chat, '...' + chat.split('@')[0].slice(-4), 'el chat no va anonimizado');
      assert.strictEqual(e.commit, commitEsperado, 'el evento no lleva el commit del bot');
    }
    const [c, p, h1, h2] = evs;
    assert.deepStrictEqual(
      { id: c.id, texto: c.texto, audio: c.audio, humanoAtendiendo: c.humanoAtendiendo },
      { id: idCliente, texto: 'tenes el iphone 13?', audio: false, humanoAtendiendo: false }
    );
    assert.ok(typeof p.tanda === 'string' && p.tanda, 'la propuesta no tiene id de tanda');
    assert.deepStrictEqual(p.lineas, [idCliente]);
    assert.ok(p.mensajes.length > 0 && p.mensajes.every((m) => typeof m === 'string'), 'la propuesta no trae los mensajes como texto');
    assert.deepStrictEqual(p.mensajes, aEste(chat).map((m) => m.texto), 'la propuesta no es lo que salió en esta tanda');
    assert.ok(p.mensajes.some((m) => /495\.000/.test(m)), 'la propuesta no es la de esta tanda: ' + p.mensajes.join(' | '));
    assert.strictEqual(p.escalar, false);
    assert.strictEqual(p.modo, 'vivo');
    assert.deepStrictEqual(p.contexto, { humanoAtendiendo: false, audio: false });
    assert.strictEqual(p.lectura && p.lectura.fuente, 'local', 'la propuesta no trae la lectura de esta tanda');
    for (const h of [h1, h2]) {
      assert.strictEqual(h.responde, p.tanda, 'la respuesta humana no apunta a la propuesta');
      assert.strictEqual(h.incompleto, null);
    }
    assert.deepStrictEqual([h1.texto, h2.texto], ['si! lo tenemos en azul y en negro', 'queres que te pase fotos?']);

    const ej = ejemplosDe(chat);
    assert.strictEqual(ej.length, 1, 'dos mensajes seguidos de la persona tienen que ser un solo ejemplo');
    assert.deepStrictEqual(ej[0].cliente, ['tenes el iphone 13?']);
    assert.deepStrictEqual(ej[0].bot, p.mensajes);
    assert.strictEqual(ej[0].humano, 'si! lo tenemos en azul y en negro\nqueres que te pase fotos?');
    assert.strictEqual(ej[0].ts, h1.ts, 'el ts del ejemplo es el del primer mensaje humano');
    assert.strictEqual(ej[0].incompleto, null);
    assert.strictEqual(ej[0].modo, 'vivo');
    assert.strictEqual(ej[0].commit, commitEsperado);
  });

  await check('2. el cruce de la auditoría: la persona contesta mientras el bot interpreta → incompleto, sin la propuesta anterior', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'hola'));
    const [anterior] = deTipo(chat, 'propuesta');
    assert.ok(anterior && anterior.mensajes.length, 'el caso no prueba nada: no hubo propuesta para el "hola"');

    const idNueva = nuevoId('C');
    alEntender = () => bot.procesar(mio(chat, 'si, el 13 lo tenemos')).catch((e) => console.error(e));
    await bot.procesar(escrito(chat, 'tenes el iphone 13?', idNueva));
    await dormir(20);

    const [h] = deTipo(chat, 'humano');
    assert.ok(h, 'no quedó el mensaje de la persona');
    assert.strictEqual(h.responde, null, 'la respuesta quedó emparejada con una propuesta');
    assert.strictEqual(h.incompleto, 'bot interpretando');
    // La tanda en curso anota igual lo que el bot habría dicho, con SUS líneas.
    const props = deTipo(chat, 'propuesta');
    assert.strictEqual(props.length, 2, 'la tanda interrumpida no anotó su propuesta');
    assert.deepStrictEqual(props[1].lineas, [idNueva]);

    const ej = ejemplosDe(chat);
    assert.strictEqual(ej.length, 1);
    assert.strictEqual(ej[0].incompleto, 'bot interpretando');
    assert.deepStrictEqual(ej[0].bot, [], 'el ejemplo lleva una propuesta');
    assert.ok(!ej[0].bot.some((m) => anterior.mensajes.includes(m)), 'el ejemplo lleva la propuesta de la tanda anterior');
    assert.deepStrictEqual(ej[0].cliente, ['tenes el iphone 13?'], 'el ejemplo no lleva lo que escribió el cliente');
    assert.strictEqual(ej[0].humano, 'si, el 13 lo tenemos');
  });

  await check('3. el cliente escribe después de la propuesta y antes de la persona → incompleto: cliente escribió después', async () => {
    const chat = nuevoChat();
    // Pide turno: el bot pregunta el día y escala callado. Lo que escriba después queda
    // en el historial sin entrar a ninguna tanda.
    await bot.procesar(escrito(chat, 'que dia puedo pasar?'));
    const [p] = deTipo(chat, 'propuesta');
    assert.ok(p && p.escalar, 'el caso no prueba nada: la propuesta no escaló');
    const idDespues = nuevoId('C');
    await bot.procesar(escrito(chat, 'el jueves', idDespues));
    await dormir(40);
    assert.strictEqual(deTipo(chat, 'propuesta').length, 1, 'el caso no prueba nada: "el jueves" entró a una tanda');
    const c = deTipo(chat, 'cliente').find((e) => e.id === idDespues);
    assert.ok(c, 'la línea que no entró a ninguna tanda no quedó registrada');
    assert.strictEqual(c.texto, 'el jueves');

    await bot.procesar(mio(chat, 'dale, te esperamos el jueves'));
    const [h] = deTipo(chat, 'humano');
    assert.strictEqual(h.responde, null, 'la respuesta quedó emparejada con la propuesta de antes');
    assert.strictEqual(h.incompleto, 'cliente escribió después');
    const ej = ejemplosDe(chat);
    assert.strictEqual(ej.length, 1);
    assert.strictEqual(ej[0].incompleto, 'cliente escribió después');
    assert.deepStrictEqual(ej[0].bot, []);
    assert.deepStrictEqual(ej[0].cliente, ['el jueves']);
  });

  await check('3b. el cliente escribe mientras atiende una persona (no entra a ninguna tanda): se registra y la respuesta siguiente no se empareja', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'hola'));
    await bot.procesar(mio(chat, 'buenas! que estabas buscando?'));
    const idAtendido = nuevoId('C');
    await bot.procesar(escrito(chat, 'un 13 para regalar', idAtendido));
    await dormir(40);
    assert.strictEqual(deTipo(chat, 'propuesta').length, 1, 'el caso no prueba nada: con una persona atendiendo entró a una tanda');
    const c = deTipo(chat, 'cliente').find((e) => e.id === idAtendido);
    assert.ok(c, 'no quedó registrado lo que escribió el cliente');
    assert.strictEqual(c.humanoAtendiendo, true);
    await bot.procesar(mio(chat, 'dale, te paso los precios'));
    const [h1, h2] = deTipo(chat, 'humano');
    assert.strictEqual(h1.incompleto, null, 'la primera respuesta sí responde a la propuesta del "hola"');
    assert.strictEqual(h2.responde, null);
    assert.strictEqual(h2.incompleto, 'cliente escribió después');
    const ej = ejemplosDe(chat);
    assert.strictEqual(ej.length, 2);
    assert.deepStrictEqual(ej[1].cliente, ['un 13 para regalar']);
    assert.deepStrictEqual(ej[1].bot, []);
  });

  await check('4. dos tandas seguidas: cada propuesta lleva los id de SUS líneas', async () => {
    // En vivo, una detrás de otra: la segunda junta los dos mensajes seguidos.
    const chat = nuevoChat();
    const [a, b, c] = [nuevoId('C'), nuevoId('C'), nuevoId('C')];
    await bot.procesar(escrito(chat, 'hola', a));
    const segunda = bot.procesar(escrito(chat, 'tenes el iphone 13?', b));
    await bot.procesar(escrito(chat, 'y el 14?', c));
    await segunda;
    assert.deepStrictEqual(deTipo(chat, 'propuesta').map((p) => p.lineas), [[a], [b, c]]);

    // En escucha, con el segundo mensaje llegando mientras se interpreta el primero.
    config.modoEscucha = true;
    const otro = nuevoChat();
    const [d, e] = [nuevoId('C'), nuevoId('C')];
    alEntender = () => bot.procesar(escrito(otro, 'tenes el iphone 13?', e)).catch((err) => console.error(err));
    await bot.procesar(escrito(otro, 'hola', d));
    assert.deepStrictEqual(deTipo(otro, 'propuesta').map((p) => p.lineas), [[d], [e]]);
    assert.deepStrictEqual(deTipo(otro, 'propuesta').map((p) => p.modo), ['escucha', 'escucha']);
  });

  await check('5. un #reset en medio de la tanda: no hay propuesta de esa tanda, y lo de antes no se empareja con nada', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'hola'));
    assert.strictEqual(deTipo(chat, 'propuesta').length, 1, 'el caso no prueba nada: no hubo propuesta para el "hola"');
    const idCortada = nuevoId('C');
    alEntender = () => bot.procesar(mio(chat, '#reset')).catch((e) => console.error(e));
    await bot.procesar(escrito(chat, 'tenes el iphone 13?', idCortada));
    await dormir(20);
    const props = deTipo(chat, 'propuesta');
    assert.strictEqual(props.length, 1, 'la tanda cortada por el #reset anotó su propuesta');
    assert.ok(!props.some((p) => p.lineas.includes(idCortada)));
    // Después del #reset el chat es nuevo: la persona no responde a la propuesta de antes.
    await bot.procesar(mio(chat, 'hola! en que te ayudo?'));
    const [h] = deTipo(chat, 'humano');
    assert.strictEqual(h.responde, null);
    assert.strictEqual(h.incompleto, 'sin propuesta en memoria');
  });

  await check('6. comandos, ecos del bot, audios propios sin transcribir y contactos personales no generan eventos', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    const [primero] = aEste(chat);
    assert.ok(primero, 'el caso no prueba nada: el bot no contestó');
    const cuantos = () => aprendizaje.leerTodo().length;
    const sinEventos = async (nombre, fn) => {
      const antes = cuantos();
      await fn();
      await dormir(40);
      assert.strictEqual(cuantos(), antes, nombre + ' generó un evento');
    };
    await sinEventos('el eco de un envío del bot', () => bot.procesar(mio(chat, primero.texto, primero.id)));
    for (const cmd of ['#pausa', '#sigue', '#recordar pasarle el precio', '#hecho', '#vendido', '#perdido']) {
      await sinEventos(cmd, () => bot.procesar(mio(chat, cmd)));
    }
    transcripcion = gemini.INAUDIBLE;
    await sinEventos('un audio propio sin transcribir', () => bot.procesar(notaDeVoz(chat, true)));
    await sinEventos('un mensaje de un contacto personal', () => bot.procesar(escrito(PERSONAL, 'hola, tenes el 13?')));
    await sinEventos('un mensaje propio a un contacto personal', () => bot.procesar(mio(PERSONAL, 'te llamo a la noche')));
    await sinEventos('#reset', () => bot.procesar(mio(chat, '#reset')));
    // Control: un mensaje propio normal y un audio propio transcrito sí entran.
    const otro = nuevoChat();
    await bot.procesar(mio(otro, 'hola! te escribo por el 13'));
    transcripcion = 'mira, el 13 te lo dejo en 495 mil';
    await bot.procesar(notaDeVoz(otro, true));
    assert.deepStrictEqual(
      deTipo(otro, 'humano').map((h) => h.texto),
      ['hola! te escribo por el 13', 'mira, el 13 te lo dejo en 495 mil'],
      'el caso no prueba nada: un mensaje propio no entra'
    );
  });

  await check('7. en escucha la tanda espera y agrupa dos mensajes seguidos en UNA propuesta, como en vivo', async () => {
    config.modoEscucha = true;
    const chat = nuevoChat();
    const [a, b] = [nuevoId('C'), nuevoId('C')];
    const desde = lecturas.length;
    const primera = bot.procesar(escrito(chat, 'hola', a));
    await bot.procesar(escrito(chat, 'tenes el iphone 13?', b));
    await primera;
    assert.deepStrictEqual(lecturas.slice(desde), ['hola\ntenes el iphone 13?'], 'en escucha no esperó para juntar la tanda');
    const props = deTipo(chat, 'propuesta');
    assert.strictEqual(props.length, 1, 'dos mensajes seguidos dieron dos propuestas');
    assert.deepStrictEqual(props[0].lineas, [a, b]);
    assert.strictEqual(props[0].modo, 'escucha');
    assert.deepStrictEqual(aEste(chat), [], 'en escucha le mandó algo al cliente');
  });

  console.log('\nArmar ejemplos\n');

  await check('8. ejemplos(): agrupa por chat hasta el próximo cliente, respeta el orden y marca los incompletos', () => {
    const ts = (s) => new Date(Date.UTC(2026, 8, 22, 15, 0, s)).toISOString();
    const E = (tipo, chat, s, datos) => ({ v: 2, ts: ts(s), chat, tipo, commit: 'abc1234', ...datos });
    const lectura = { fuente: 'local', intencion: 'saludo' };
    const eventos = [
      // Formato viejo mezclado: no se toma.
      { ts: ts(0), chat: '...1111', cliente: 'viejo', bot: 'x', humano: 'y', motivo: '' },
      E('cliente', '...1111', 1, { id: 'a1', texto: 'hola', audio: false, humanoAtendiendo: false }),
      E('cliente', '...2222', 2, { id: 'b1', texto: 'tenes el 14?', audio: false, humanoAtendiendo: false }),
      E('propuesta', '...1111', 3, { tanda: 'T1', lineas: ['a1'], mensajes: ['Buenass', 'Que modelo buscabas?'], escalar: false, motivo: '', lectura, contexto: { humanoAtendiendo: false, audio: false }, modo: 'escucha' }),
      E('humano', '...1111', 4, { id: 'h1', texto: 'buenas!', responde: 'T1', incompleto: null }),
      E('humano', '...2222', 5, { id: 'h2', texto: 'si, el 14 tenemos', responde: null, incompleto: 'bot interpretando' }),
      E('humano', '...1111', 6, { id: 'h3', texto: 'que buscabas?', responde: 'T1', incompleto: null }),
      // Llega la propuesta de la tanda que estaba en curso: no parte el ejemplo, y el
      // mensaje humano que le sigue queda en el mismo (incompleto, sin propuesta).
      E('propuesta', '...2222', 7, { tanda: 'T2', lineas: ['b1'], mensajes: ['Sii, tenemos el 14'], escalar: false, motivo: '', lectura, contexto: { humanoAtendiendo: true, audio: false }, modo: 'escucha' }),
      E('humano', '...2222', 8, { id: 'h4', texto: 'te paso el precio', responde: 'T2', incompleto: null }),
      // El audio se anota cuando termina la transcripción, después del texto que llegó
      // detrás de él, pero con la hora en que llegó: el orden es el de la llegada.
      E('cliente', '...1111', 11, { id: 'a3', texto: 'y en cuotas?', audio: false, humanoAtendiendo: true }),
      E('cliente', '...1111', 10, { id: 'a2', texto: 'quiero el 13', audio: true, humanoAtendiendo: true }),
      E('propuesta', '...1111', 12, { tanda: 'T3', lineas: ['a2', 'a3'], mensajes: [], escalar: true, motivo: 'el cliente quiere avanzar o pide turno', lectura: null, contexto: { humanoAtendiendo: true, audio: true }, modo: 'escucha' }),
      E('humano', '...1111', 13, { id: 'h5', texto: 'dale, te paso las cuotas del 13', responde: 'T3', incompleto: null }),
    ];
    const ej = aprendizaje.ejemplos(eventos);
    // `clave` e `idsCliente` desde el bloque 7: estos eventos no tienen clave (agrupan por chat).
    assert.deepStrictEqual(ej, [
      {
        chat: '...1111', ts: ts(4), tanda: 'T1', cliente: ['hola'], bot: ['Buenass', 'Que modelo buscabas?'],
        humano: 'buenas!\nque buscabas?', escalar: false, motivo: '', lectura, commit: 'abc1234', modo: 'escucha', incompleto: null,
        clave: null, idsCliente: ['a1'],
      },
      {
        chat: '...2222', ts: ts(5), tanda: null, cliente: ['tenes el 14?'], bot: [],
        humano: 'si, el 14 tenemos\nte paso el precio', escalar: null, motivo: null, lectura: null, commit: 'abc1234', modo: null, incompleto: 'bot interpretando',
        clave: null, idsCliente: ['b1'],
      },
      {
        chat: '...1111', ts: ts(13), tanda: 'T3', cliente: ['quiero el 13', 'y en cuotas?'], bot: [],
        humano: 'dale, te paso las cuotas del 13', escalar: true, motivo: 'el cliente quiere avanzar o pide turno', lectura: null, commit: 'abc1234', modo: 'escucha', incompleto: null,
        clave: null, idsCliente: ['a2', 'a3'],
      },
    ]);
    assert.deepStrictEqual(aprendizaje.ejemplos([]), []);
    // Responde a una tanda cuya propuesta no está en el archivo (una línea que no se pudo
    // leer): no se presenta como un ejemplo completo con el bot callado.
    const [huerfano] = aprendizaje.ejemplos([
      E('cliente', '...3333', 1, { id: 'c1', texto: 'hola', audio: false, humanoAtendiendo: false }),
      E('humano', '...3333', 2, { id: 'h1', texto: 'buenas!', responde: 'T-perdida', incompleto: null }),
    ]);
    assert.strictEqual(huerfano.incompleto, 'sin propuesta en el registro');
    assert.deepStrictEqual(huerfano.bot, []);
    // Un audio del cliente que llegó ANTES de la segunda respuesta de la persona pero se
    // anotó después (terminó de transcribirse más tarde): por la hora de llegada, parte
    // la respuesta en dos, y la segunda no se pega a la propuesta del "hola".
    const conAudio = aprendizaje.ejemplos([
      E('cliente', '...4444', 1, { id: 'x1', texto: 'hola', audio: false, humanoAtendiendo: false }),
      E('propuesta', '...4444', 2, { tanda: 'T4', lineas: ['x1'], mensajes: ['Buenass'], escalar: false, motivo: '', lectura: null, contexto: null, modo: 'escucha' }),
      E('humano', '...4444', 3, { id: 'h1', texto: 'buenas!', responde: 'T4', incompleto: null }),
      E('humano', '...4444', 5, { id: 'h2', texto: 'dale, te lo paso', responde: null, incompleto: 'cliente escribió después' }),
      E('cliente', '...4444', 4, { id: 'x2', texto: 'quiero el 13', audio: true, humanoAtendiendo: true }),
    ]);
    assert.deepStrictEqual(
      conAudio.map((e) => [e.humano, e.cliente, e.bot, e.incompleto]),
      [
        ['buenas!', ['hola'], ['Buenass'], null],
        ['dale, te lo paso', ['quiero el 13'], [], 'cliente escribió después'],
      ]
    );
  });

  console.log('\nnpm run reproducir\n');

  await check('9. reproducir con un archivo viejo y uno v2 inventados: sin red, sin escribir en data/, con las cantidades esperadas', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-reproducir-'));
    const viejo = path.join(dir, 'viejo.jsonl');
    const v2 = path.join(dir, 'v2.jsonl');
    const fila = (chat, cliente, humano) => JSON.stringify({ ts: '2026-09-12T13:00:00.000Z', chat, cliente, bot: 'lo que habia dicho', humano, motivo: '', lectura: null, contexto: null });
    fs.writeFileSync(
      viejo,
      [
        fila('...0001', 'tenes el iphone 13?', 'si, lo tenemos'),
        // Mismo chat y misma pregunta: es la misma respuesta de la persona, partida en dos.
        fila('...0001', 'tenes el iphone 13?', 'queres que te pase fotos?'),
        // Pedir el precio en dólares escala callado. Hasta el bloque 8 era "aceptan dolares?",
        // que desde entonces se contesta ("sii, aceptamos dolares") y ya no escala.
        fila('...0002', 'me pasas el precio en dolares?', 'si, tomamos dolares'),
      ].join('\n') + '\n'
    );
    const ts = (s) => new Date(Date.UTC(2026, 8, 22, 15, 0, s)).toISOString();
    const E = (tipo, s, datos) => JSON.stringify({ v: 2, ts: ts(s), chat: '...0003', tipo, commit: 'abc1234', ...datos });
    const prop = (tanda, lineas) => ({ tanda, lineas, mensajes: ['lo que habia dicho'], escalar: false, motivo: '', lectura: null, contexto: { humanoAtendiendo: false, audio: false }, modo: 'escucha' });
    fs.writeFileSync(
      v2,
      [
        E('cliente', 1, { id: 'c1', texto: 'hola', audio: false, humanoAtendiendo: false }),
        E('propuesta', 2, prop('T1', ['c1'])),
        E('humano', 3, { id: 'h1', texto: 'buenas! que modelo buscabas?', responde: 'T1', incompleto: null }),
        E('cliente', 4, { id: 'c2', texto: 'el 13, tengo 300 mil', audio: false, humanoAtendiendo: false }),
        E('propuesta', 5, prop('T2', ['c2'])),
        E('humano', 6, { id: 'h2', texto: 'dale, te paso como es', responde: 'T2', incompleto: null }),
        E('humano', 7, { id: 'h3', texto: 'te queda en 2 cuotas de 150', responde: 'T2', incompleto: null }),
        // Incompleto: no es un caso.
        E('cliente', 8, { id: 'c3', texto: 'y el 14?', audio: false, humanoAtendiendo: false }),
        E('humano', 9, { id: 'h4', texto: 'el 14 tambien lo tenemos', responde: null, incompleto: 'bot interpretando' }),
        E('propuesta', 10, prop('T3', ['c3'])),
      ].join('\n') + '\n'
    );

    // Gancho cargado antes que el script: frena (y anota) cualquier escritura en data/.
    // Sin ESTADO_PATH ni APRENDIZAJE_PATH heredados: el script tiene que poner los suyos.
    const gancho = `
      import fs from 'node:fs';
      import path from 'node:path';
      const DATA = path.resolve(process.env.REPRO_DATA_REAL).toLowerCase();
      const enData = (p) => {
        try {
          const r = path.resolve(String(p)).toLowerCase();
          return r === DATA || r.startsWith(DATA + path.sep);
        } catch {
          return false;
        }
      };
      const frenar = (...rutas) => {
        for (const p of rutas) {
          if (enData(p)) {
            process.stderr.write('ESCRIBIO_EN_DATA ' + p + '\\n');
            throw new Error('quiso escribir en data/: ' + p);
          }
        }
      };
      for (const f of ['writeFileSync', 'appendFileSync', 'unlinkSync', 'rmSync', 'mkdirSync', 'writeFile', 'appendFile', 'unlink', 'createWriteStream']) {
        const o = fs[f];
        fs[f] = function (p, ...a) { frenar(p); return o.call(this, p, ...a); };
      }
      for (const f of ['renameSync', 'copyFileSync', 'rename', 'copyFile']) {
        const o = fs[f];
        fs[f] = function (a, b, ...r) { frenar(a, b); return o.call(this, a, b, ...r); };
      }
      const abrir = fs.openSync;
      fs.openSync = function (p, fl, ...a) { if (/[wa+]/.test(String(fl ?? 'r'))) frenar(p); return abrir.call(this, p, fl, ...a); };
    `;
    const env = { ...process.env, REPRO_DATA_REAL: DATA };
    delete env.ESTADO_PATH;
    delete env.APRENDIZAJE_PATH;
    const correrCon = (extra, ...args) =>
      spawnSync(process.execPath, ['--import', 'data:text/javascript;base64,' + Buffer.from(gancho).toString('base64'), path.join(__dirname, 'reproducir.js'), ...args], {
        cwd: REPO,
        env: { ...env, ...extra },
        encoding: 'utf8',
        timeout: 180000, // en una PC lenta (la VM de Cowork) cargar el bot tarda más de un minuto
      });
    const correr = (...args) => correrCon({}, ...args);
    const resumen = (r) => {
      assert.ok(!/ESCRIBIO_EN_DATA/.test(r.stderr), 'quiso escribir en data/: ' + r.stderr);
      assert.strictEqual(r.status, 0, 'terminó con error: ' + (r.stderr || r.stdout).slice(-600));
      const ultima = r.stdout.trim().split('\n').pop();
      return JSON.parse(ultima);
    };

    const informeViejo = path.join(dir, 'informe-viejo.md');
    const rv = resumen(correr('--archivo', viejo, '--informe', informeViejo, '--json'));
    assert.deepStrictEqual(
      {
        formato: rv.formato, casos: rv.casos, contesta: rv.contesta, escalaSinContestar: rv.escalaSinContestar, seCalla: rv.seCalla,
        escala: rv.escala, motivos: rv.motivos, coincidenEnContestar: rv.coincidenEnContestar, numeros: rv.numeros, errores: rv.errores,
      },
      {
        formato: 'viejo', casos: 2, contesta: 1, escalaSinContestar: 1, seCalla: 0,
        escala: 1, motivos: { 'quiere cotización en dólares': 1 }, coincidenEnContestar: 1, numeros: { soloBot: 1, soloPersona: 0 }, errores: 0,
      }
    );
    const md = fs.readFileSync(informeViejo, 'utf8');
    for (const t of ['tenes el iphone 13?', 'si, lo tenemos', 'queres que te pase fotos?', 'me pasas el precio en dolares?', 'quiere cotización en dólares']) {
      assert.ok(md.includes(t), 'el informe no trae: ' + t);
    }

    const informeV2 = path.join(dir, 'informe-v2.md');
    const r2 = resumen(correr('--archivo', v2, '--informe', informeV2, '--json'));
    assert.deepStrictEqual(
      { formato: r2.formato, casos: r2.casos, contesta: r2.contesta, escala: r2.escala, coincidenEnContestar: r2.coincidenEnContestar, numeros: r2.numeros, errores: r2.errores },
      { formato: 'v2', casos: 2, contesta: 2, escala: 0, coincidenEnContestar: 2, numeros: { soloBot: 0, soloPersona: 0 }, errores: 0 }
    );
    const md2 = fs.readFileSync(informeV2, 'utf8');
    assert.ok(md2.includes('te queda en 2 cuotas de 150') && !md2.includes('el 14 tambien lo tenemos'), 'el informe v2 no trae los casos completos solos');

    // Con --gemini y sin --si no corre nada: avisa lo que cuesta y termina. Sin clave:
    // si el script no frenara, igual no saldría a Google (gemini.js usa el extractor local).
    const informeGemini = path.join(dir, 'informe-gemini.md');
    const rg = correrCon({ GEMINI_API_KEY: '' }, '--archivo', viejo, '--informe', informeGemini, '--gemini');
    assert.ok(!/ESCRIBIO_EN_DATA/.test(rg.stderr), 'quiso escribir en data/');
    assert.ok(/--si/.test(rg.stdout) && /tokens/i.test(rg.stdout), 'no avisó que cuesta tokens ni pidió --si: ' + rg.stdout);
    assert.notStrictEqual(rg.status, 0, 'con --gemini y sin --si siguió como si nada');
    assert.ok(!fs.existsSync(informeGemini), 'con --gemini y sin --si corrió igual');

    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log('\nLas pruebas no escriben el registro real\n');

  await check('10. todo test que carga index.js o aprendizaje.js fija un APRENDIZAJE_PATH temporal', () => {
    // Desde el bloque 6 cada mensaje del cliente escribe un evento, no solo las respuestas
    // de una persona: lista-blanca.test.js no fijaba la ruta y escribió en data/.
    const sinRuta = fs
      .readdirSync(__dirname)
      .filter((a) => a.endsWith('.test.js'))
      .filter((a) => {
        const t = fs.readFileSync(path.join(__dirname, a), 'utf8');
        return /require\('\.\.\/src\/(index|aprendizaje)'\)/.test(t) && !/process\.env\.APRENDIZAJE_PATH\s*=/.test(t);
      });
    assert.deepStrictEqual(sinRuta, []);
  });

  console.log('\nClave por chat (bloque 7)\n');

  const SAL = path.join(TMP_APR, 'aprendizaje-sal');
  const hmac = (sal, chatId) => crypto.createHmac('sha256', sal).update(String(chatId)).digest('hex').slice(0, 12);

  await check('11. dos chats con los mismos 4 dígitos: el mismo chat, distinta clave, y la clave es el HMAC con la sal del archivo', async () => {
    const A = '5490000001234@s.whatsapp.net';
    const B = '5490000091234@s.whatsapp.net';
    const [ca, cb] = [nuevoId('C'), nuevoId('C')];
    await bot.procesar(escrito(A, 'tenes el iphone 13?', ca));
    await bot.procesar(mio(A, 'si, lo tenemos'));
    await bot.procesar(escrito(B, 'hola', cb));
    const todos = aprendizaje.leerTodo();
    const claveDe = (id) => (todos.find((e) => e.tipo === 'cliente' && e.id === id) || {}).clave;
    const [ka, kb] = [claveDe(ca), claveDe(cb)];
    assert.ok(ka && kb, 'los eventos no traen clave');
    assert.notStrictEqual(ka, kb, 'dos chats distintos con los mismos 4 dígitos tienen la misma clave');
    const deA = todos.filter((e) => e.clave === ka);
    const deB = todos.filter((e) => e.clave === kb);
    // Bloque Ninjo 2: las `entrega` de lo que salió van con la misma clave, entre la propuesta y lo demás.
    const sinEntregas = (l) => l.filter((e) => e.tipo !== 'entrega').map((e) => e.tipo);
    assert.ok(deA.some((e) => e.tipo === 'entrega') && deB.some((e) => e.tipo === 'entrega'), 'las entregas quedaron con otra clave');
    assert.deepStrictEqual(sinEntregas(deA), ['cliente', 'propuesta', 'humano'], 'un evento del chat quedó con otra clave');
    assert.deepStrictEqual(sinEntregas(deB), ['cliente', 'propuesta']);
    for (const e of [...deA, ...deB]) {
      assert.strictEqual(e.chat, '...1234');
      assert.deepStrictEqual(Object.keys(e).slice(0, 6), ['v', 'ts', 'chat', 'clave', 'tipo', 'commit']);
    }
    assert.ok(/^[0-9a-f]{12}$/.test(ka) && /^[0-9a-f]{12}$/.test(kb), 'la clave no son 12 caracteres hex: ' + ka);
    const sal = fs.readFileSync(SAL, 'utf8').trim();
    assert.strictEqual(ka, hmac(sal, A), 'la clave no es el HMAC-SHA256 del chat con la sal');
    assert.strictEqual(kb, hmac(sal, B));
    assert.ok(!fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8').includes(sal), 'la sal aparece en el registro');
  });

  // Un proceso aparte por caso: la sal se lee una vez y queda en memoria.
  const enOtroProceso = (dir, codigo) => {
    const r = spawnSync(process.execPath, ['-e', codigo], {
      cwd: REPO,
      env: { ...process.env, APRENDIZAJE_PATH: path.join(dir, 'aprendizaje.jsonl'), ESTADO_PATH: path.join(dir, 'estado.json') },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.strictEqual(r.status, 0, 'el proceso terminó con error: ' + (r.stderr || r.stdout).slice(-600));
    return { ...JSON.parse(r.stdout.trim().split('\n').pop()), stderr: r.stderr };
  };
  const moduloAprendizaje = JSON.stringify(path.join(REPO, 'src', 'aprendizaje'));

  await check('12. la sal se crea al lado del registro con el primer evento; cargar el módulo, leer o armar ejemplos no la crea', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-sal-'));
    const sal = path.join(dir, 'aprendizaje-sal');
    const r = enOtroProceso(
      dir,
      `const fs = require('fs');
       const aprendizaje = require(${moduloAprendizaje});
       const sal = ${JSON.stringify(sal)};
       const alCargar = fs.existsSync(sal);
       aprendizaje.ejemplos(aprendizaje.leerTodo());
       const alLeer = fs.existsSync(sal);
       aprendizaje.cliente('5490000000000@s.whatsapp.net', { id: 'x1', texto: 'hola' });
       console.log(JSON.stringify({ alCargar, alLeer, sal: fs.existsSync(sal) ? fs.readFileSync(sal, 'utf8') : null, eventos: aprendizaje.leerTodo() }));`
    );
    assert.strictEqual(r.alCargar, false, 'cargar el módulo creó la sal');
    assert.strictEqual(r.alLeer, false, 'leer el registro creó la sal');
    assert.ok(/^[0-9a-f]{64}$/.test(r.sal || ''), 'la sal no son 32 bytes en hex: ' + r.sal);
    assert.strictEqual(r.eventos.length, 1);
    assert.strictEqual(r.eventos[0].clave, hmac(r.sal, '5490000000000@s.whatsapp.net'));
    // `npm run aprender` carga el módulo y lee el registro: no crea nada.
    const otra = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-sal-'));
    const ra = spawnSync(process.execPath, [path.join(__dirname, 'aprender.js')], {
      cwd: REPO,
      env: { ...process.env, APRENDIZAJE_PATH: path.join(otra, 'aprendizaje.jsonl') },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.strictEqual(ra.status, 0, (ra.stderr || '').slice(-400));
    assert.deepStrictEqual(fs.readdirSync(otra), [], 'aprender creó algo al lado del registro');
    fs.rmSync(dir, { recursive: true, force: true });
    fs.rmSync(otra, { recursive: true, force: true });
  });

  await check('12b. (agregado) si otro proceso creó la sal recién, se usa la de él y no se pisa', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-sal-otro-'));
    const sal = path.join(dir, 'aprendizaje-sal');
    const r = enOtroProceso(
      dir,
      `const fs = require('fs');
       const path = require('path');
       const sal = ${JSON.stringify(sal)};
       // La primera lectura no la encuentra y, en ese momento, otro proceso la crea.
       const leer = fs.readFileSync;
       let primera = true;
       fs.readFileSync = function (p, ...a) {
         if (primera && path.resolve(String(p)) === path.resolve(sal)) {
           primera = false;
           fs.writeFileSync(sal, 'sal-del-otro-proceso');
           const e = new Error('no está');
           e.code = 'ENOENT';
           throw e;
         }
         return leer.call(this, p, ...a);
       };
       const aprendizaje = require(${moduloAprendizaje});
       aprendizaje.cliente('5490000000000@s.whatsapp.net', { id: 'x1', texto: 'hola' });
       console.log(JSON.stringify({ sal: leer(sal, 'utf8'), eventos: aprendizaje.leerTodo() }));`
    );
    assert.strictEqual(r.sal, 'sal-del-otro-proceso', 'pisó la sal que había creado otro proceso');
    assert.strictEqual(r.eventos[0].clave, hmac('sal-del-otro-proceso', '5490000000000@s.whatsapp.net'), 'no usó la sal del otro proceso');
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check('13. sin sal (una carpeta en su lugar): el evento se anota con clave null, un solo aviso, y no rompe', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-sin-sal-'));
    fs.mkdirSync(path.join(dir, 'aprendizaje-sal'));
    const r = enOtroProceso(
      dir,
      `const errores = [];
       const original = console.error;
       console.error = (...a) => errores.push(a.join(' '));
       const aprendizaje = require(${moduloAprendizaje});
       aprendizaje.cliente('5490000000000@s.whatsapp.net', { id: 'x1', texto: 'hola' });
       aprendizaje.humano('5490000000000@s.whatsapp.net', { id: 'h1', texto: 'buenas!' });
       console.error = original;
       console.log(JSON.stringify({ errores, eventos: aprendizaje.leerTodo() }));`
    );
    assert.deepStrictEqual(r.eventos.map((e) => [e.tipo, e.clave]), [['cliente', null], ['humano', null]], 'sin sal no se anotó el evento con clave null');
    assert.strictEqual(r.errores.length, 1, 'el aviso de la sal no salió una sola vez: ' + JSON.stringify(r.errores));
    assert.ok(r.errores[0].startsWith('[aprendizaje] sin sal:'), r.errores[0]);
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check('13b. (agregado) una sal vacía no se usa, y cuando vuelve a haber sal los eventos siguientes tienen clave', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-sal-vacia-'));
    const sal = path.join(dir, 'aprendizaje-sal');
    fs.writeFileSync(sal, '');
    const r = enOtroProceso(
      dir,
      `const fs = require('fs');
       const errores = [];
       console.error = (...a) => errores.push(a.join(' '));
       const aprendizaje = require(${moduloAprendizaje});
       aprendizaje.cliente('5490000000000@s.whatsapp.net', { id: 'x1', texto: 'hola' });
       fs.writeFileSync(${JSON.stringify(sal)}, 'una-sal-que-ya-se-puede-leer');
       aprendizaje.cliente('5490000000000@s.whatsapp.net', { id: 'x2', texto: 'tenes el 13?' });
       console.log(JSON.stringify({ errores, eventos: aprendizaje.leerTodo() }));`
    );
    assert.deepStrictEqual(
      r.eventos.map((e) => e.clave),
      [null, hmac('una-sal-que-ya-se-puede-leer', '5490000000000@s.whatsapp.net')],
      'usó una sal vacía, o no volvió a probar'
    );
    assert.strictEqual(r.errores.length, 1, JSON.stringify(r.errores));
    fs.rmSync(dir, { recursive: true, force: true });
  });

  await check('14. ejemplos(): dos chats con los mismos 4 dígitos y distinta clave dan ejemplos separados; sin clave, como antes', () => {
    const ts = (s) => new Date(Date.UTC(2026, 8, 23, 15, 0, s)).toISOString();
    const E = (tipo, chat, clave, s, datos) => ({ v: 2, ts: ts(s), chat, clave, tipo, commit: 'abc1234', ...datos });
    const [K1, K2] = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'];
    const prop = (tanda, lineas, mensajes) => ({ tanda, lineas, mensajes, escalar: false, motivo: '', lectura: null, contexto: null, modo: 'escucha' });
    const cli = (id, texto) => ({ id, texto, audio: false, humanoAtendiendo: false });
    const eventos = [
      E('cliente', '...1234', K1, 1, cli('a1', 'hola')),
      E('cliente', '...1234', K1, 2, cli('a2', 'tenes el 13?')),
      E('propuesta', '...1234', K1, 3, prop('TA', ['a1', 'a2'], ['Buenass', 'Sii, lo tenemos'])),
      // El otro chat escribe antes de que la persona conteste al primero.
      E('cliente', '...1234', K2, 4, cli('b1', 'aceptan dolares?')),
      E('humano', '...1234', K1, 5, { id: 'h1', texto: 'si, lo tenemos', responde: 'TA', incompleto: null }),
      E('propuesta', '...1234', K2, 6, prop('TB', ['b1'], [])),
      E('humano', '...1234', K2, 7, { id: 'h2', texto: 'si, tomamos dolares', responde: 'TB', incompleto: null }),
      // Sin clave (los del bloque 6, o sin sal): agrupan por chat, como antes.
      E('cliente', '...5678', null, 8, cli('c1', 'hola')),
      { v: 2, ts: ts(9), chat: '...5678', tipo: 'propuesta', commit: 'abc1234', ...prop('TC', ['c1'], ['Buenass']) },
      { v: 2, ts: ts(10), chat: '...5678', tipo: 'humano', commit: 'abc1234', id: 'h3', texto: 'buenas!', responde: 'TC', incompleto: null },
    ];
    const ej = aprendizaje.ejemplos(eventos);
    assert.deepStrictEqual(
      ej.map((e) => ({ chat: e.chat, clave: e.clave, tanda: e.tanda, idsCliente: e.idsCliente, cliente: e.cliente, humano: e.humano, incompleto: e.incompleto })),
      [
        { chat: '...1234', clave: K1, tanda: 'TA', idsCliente: ['a1', 'a2'], cliente: ['hola', 'tenes el 13?'], humano: 'si, lo tenemos', incompleto: null },
        { chat: '...1234', clave: K2, tanda: 'TB', idsCliente: ['b1'], cliente: ['aceptan dolares?'], humano: 'si, tomamos dolares', incompleto: null },
        { chat: '...5678', clave: null, tanda: 'TC', idsCliente: ['c1'], cliente: ['hola'], humano: 'buenas!', incompleto: null },
      ]
    );
  });

  await check('15. reproducir: dos chats con los mismos 4 dígitos y distinta clave se reproducen por separado', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'apr-reproducir-clave-'));
    const v2 = path.join(dir, 'v2.jsonl');
    const ts = (s) => new Date(Date.UTC(2026, 8, 23, 15, 0, s)).toISOString();
    const E = (clave, tipo, s, datos) => JSON.stringify({ v: 2, ts: ts(s), chat: '...1234', clave, tipo, commit: 'abc1234', ...datos });
    const prop = (tanda, lineas) => ({ tanda, lineas, mensajes: ['lo que habia dicho'], escalar: false, motivo: '', lectura: null, contexto: { humanoAtendiendo: false, audio: false }, modo: 'vivo' });
    // Si se mezclaran, "y en cuotas como es?" llegaría con el 13 ya cotizado en el chat y el
    // bot daría la entrega de ese modelo: números del bot y no de la persona en los dos casos.
    fs.writeFileSync(
      v2,
      [
        E('aaaaaaaaaaaa', 'cliente', 1, { id: 'a1', texto: 'tenes el iphone 13?', audio: false, humanoAtendiendo: false }),
        E('aaaaaaaaaaaa', 'propuesta', 2, prop('T1', ['a1'])),
        E('aaaaaaaaaaaa', 'humano', 3, { id: 'h1', texto: 'si, lo tenemos', responde: 'T1', incompleto: null }),
        E('bbbbbbbbbbbb', 'cliente', 4, { id: 'b1', texto: 'y en cuotas como es?', audio: false, humanoAtendiendo: false }),
        E('bbbbbbbbbbbb', 'propuesta', 5, prop('T2', ['b1'])),
        E('bbbbbbbbbbbb', 'humano', 6, { id: 'h2', texto: 'que modelo buscabas?', responde: 'T2', incompleto: null }),
      ].join('\n') + '\n'
    );
    const env = { ...process.env };
    delete env.ESTADO_PATH;
    delete env.APRENDIZAJE_PATH;
    const r = spawnSync(process.execPath, [path.join(__dirname, 'reproducir.js'), '--archivo', v2, '--informe', path.join(dir, 'informe.md'), '--json'], {
      cwd: REPO,
      env,
      encoding: 'utf8',
      timeout: 180000,
    });
    assert.strictEqual(r.status, 0, 'terminó con error: ' + (r.stderr || r.stdout).slice(-600));
    const s = JSON.parse(r.stdout.trim().split('\n').pop());
    assert.deepStrictEqual(
      { casos: s.casos, contesta: s.contesta, numeros: s.numeros, errores: s.errores },
      { casos: 2, contesta: 2, numeros: { soloBot: 1, soloPersona: 0 }, errores: 0 },
      'los dos chats se reprodujeron juntos'
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  try {
    fs.unlinkSync(process.env.ESTADO_PATH);
  } catch {
    /* da igual */
  }
  fs.rmSync(TMP_APR, { recursive: true, force: true });
  process.exit(fallos ? 1 : 0);
})();
