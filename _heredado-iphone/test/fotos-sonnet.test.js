'use strict';
/**
 * Sonnet ve las fotos del cliente (decisión de Tomás del 06/10/2026; …7442, canje del 16: mandó "16
 * común" y la captura de la batería al 90%, y Sonnet le volvió a preguntar la batería).
 *
 *   node test/fotos-sonnet.test.js
 *
 * Con un `fetch` de mentira que contesta como la API de Anthropic y `evolution.base64DeMedia` de
 * mentira: nunca sale a la red. A través de index.js (`procesar`) se prueba:
 *   1. el texto y la foto de una tanda de Sonnet: un bloque `image` después del texto, con su
 *      `cache_control` (y el del texto sigue);
 *   2. una tanda de solo fotos en un chat de Sonnet con canje en curso la contesta Sonnet, no `soloFotos`;
 *   3. en un chat del bot de siempre, como siempre, sin bajar nada;
 *   4. con 5 fotos van las últimas 3 y el pedido lo dice;
 *   5. una foto que no se baja, que tarda, de más de 5 MB o HEIC no va y el pedido lo dice;
 *   6. una foto suelta sin canje ni tanda abierta: `silencio` sin-texto y nada se baja;
 *   7. la sombra, la sombra con persona y #sonnet no mandan imágenes;
 *   8. el registro anota `sonnet.imagenes` (sin la imagen);
 *   9. la foto de una tanda no se vuelve a mandar en la siguiente;
 *  10. una foto con epígrafe: el texto como siempre y la imagen también;
 *  11. `base64DeMedia` sin `mimetype` en la respuesta toma el de `imageMessage` (los audios, igual);
 *  12. un acuse con una foto se le pregunta a Sonnet.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-sonnet-'));
const GRUPO = '120363000000000077@g.us';

// El entorno se fija acá y no se hereda del .env (dotenv no pisa lo que ya está puesto).
process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '6';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '5490000099999';
process.env.NUMEROS_PILOTO = 'todos';
process.env.SOLO_CHATS_NUEVOS = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
process.env.GUARDIAN_ACTIVO = 'false';
process.env.TECHSUR_ACTIVO = 'false';
process.env.AUDIO_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.FOTOS_DIR = path.join(TMP, 'sin-fotos');
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.CEREBRO_MODO = 'todos';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
process.env.EVOLUTION_APIKEY = 'clave-de-mentira';
process.env.EVOLUTION_URL = 'http://evolution-de-mentira:8080';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------------------
// La API de mentira, y Evolution de mentira para getBase64FromMediaMessage (check 11)
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const responde = (mensajes) => [usar('responder', { mensajes })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
  pedidos.length = 0;
}
let respuestaMedia = null;
const pedidosMedia = [];
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (u.includes('/chat/getBase64FromMediaMessage/')) {
    pedidosMedia.push(JSON.parse(opciones.body));
    return comoRespuesta(200, respuestaMedia);
  }
  if (!u.startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + u);
  const body = JSON.parse(opciones.body);
  pedidos.push({ body });
  const paso = pasos[pedidos.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};
/** Los bloques del primer mensaje del pedido N, el texto del contexto y sus imágenes. */
const bloquesDel = (i) => pedidos[i].body.messages[0].content;
const textoDel = (i) => bloquesDel(i).map((b) => b.text || '').join('\n');
const imagenesDel = (i) => bloquesDel(i).filter((b) => b.type === 'image');
const imagenesEnTodo = () => pedidos.flatMap((p) => p.body.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).filter((b) => b && b.type === 'image'));
const marcasDeCache = (body) => JSON.stringify(body).split('"cache_control"').length - 1;

// ---------------------------------------------------------------------------
// El bot, sin red
// ---------------------------------------------------------------------------
const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const base64Real = evolution.base64DeMedia;
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
evolution.buscarMensajesDeChat = async () => [];
// Las fotos: lo que devuelve Evolution para cada id (o una función), y qué se pidió.
const medias = new Map();
const descargas = [];
evolution.base64DeMedia = async (m) => {
  descargas.push({ id: m.key.id, mimetype: m.message && m.message.imageMessage && m.message.imageMessage.mimetype });
  const r = medias.get(m.key.id);
  return typeof r === 'function' ? r() : r === undefined ? null : r;
};

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const fotosDelCliente = require('../src/fotos-del-cliente');

let n = 0;
const nuevoChat = () => '54900000' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const numero = (chat) => chat.split('@')[0];
const escrito = (chat, t) => ({ key: { remoteJid: chat, fromMe: false, id: 'T' + Math.random() }, pushName: 'Lucia', message: { conversation: t } });
const mio = (chat, t) => ({ key: { remoteJid: chat, fromMe: true, id: 'H' + Math.random() }, pushName: 'Tomi', message: { conversation: t } });
let nFoto = 0;
/** Una foto del cliente; Evolution la devuelve bien (base64 "B64-<id>") salvo que se diga otra cosa. */
function foto(chat, { caption = '', media = 'bien', mimetype = 'image/jpeg' } = {}) {
  const id = 'F' + ++nFoto;
  if (media === 'bien') medias.set(id, { base64: 'B64-' + id, mimetype });
  else medias.set(id, media);
  return { key: { remoteJid: chat, fromMe: false, id }, pushName: 'Lucia', message: { imageMessage: { mimetype, ...(caption ? { caption } : {}) } } };
}
const idDe = (m) => m.key.id;
const aEste = (chat) => aClientes.filter((m) => m.numero === chat).map((m) => m.texto);
function eventos() {
  try {
    return fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const delChat = (chat) => (e) => e.chat === '...' + numero(chat).slice(-4);
async function esperarHasta(cond, ms = 2000) {
  for (let t = 0; t < ms && !cond(); t += 10) await dormir(10);
}
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  descargas.length = 0;
}
/** Un texto y unas fotos en la misma tanda: el texto arranca la tanda y las fotos llegan mientras espera. */
async function tanda(chat, texto, fotos) {
  const t = texto ? bot.procesar(escrito(chat, texto)) : null;
  await Promise.all(fotos.map((f) => bot.procesar(f)));
  if (t) await t;
}
/** Un chat de Sonnet que ya habló (y su tanda terminó), con un canje en curso si se pide. */
async function chatDeSonnet({ canje = false } = {}) {
  const chat = nuevoChat();
  config.cerebro.modo = 'todos';
  guion(responde(['contame que equipo tenes']));
  await bot.procesar(escrito(chat, 'quiero entregar mi iphone en parte de pago'));
  assert.strictEqual(cerebro.quienAtiende(chat), 'sonnet', 'el chat no lo atiende Sonnet');
  // En los chats de Sonnet `permuta` no lo llena nadie: el canje en curso se pone a mano (como lo dejaría el
  // bot de siempre si contestó él, por ejemplo después de un error de la API).
  if (canje) state.actualizar(chat, { permuta: { ofrece: true } });
  limpiar();
  return chat;
}

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

(async () => {
  // Un pedido que quede colgado no puede dar "Todo OK": la prueba tiene que llegar al final.
  let termino = false;
  process.on('exit', (codigo) => {
    if (!termino && codigo === 0) {
      console.log('\nFALLA: la prueba no llegó al final (una promesa quedó colgada)\n');
      process.exitCode = 1;
    }
  });

  console.log('\nLas fotos en el pedido de Sonnet\n');

  let chat1 = null;
  let foto1 = null;
  await check('1. "16 comun" y una foto en un chat de Sonnet: el texto y 1 bloque image (base64 y media_type) después, con cache_control en el texto y en la imagen', async () => {
    const chat = await chatDeSonnet();
    chat1 = chat;
    const gastoAntes = cerebro.gastoDelMes().usd;
    guion(responde(['dale, de cuantos gb es?']));
    foto1 = foto(chat, { mimetype: 'image/png' });
    await tanda(chat, '16 comun', [foto1]);
    assert.strictEqual(pedidos.length, 1, 'llamadas a la API: ' + pedidos.length);
    const bloques = bloquesDel(0);
    assert.strictEqual(bloques[0].type, 'text', 'el primer bloque no es el texto del contexto');
    assert.deepStrictEqual(bloques[0].cache_control, { type: 'ephemeral' }, 'el texto perdió su cache_control');
    assert.ok(/16 comun/.test(bloques[0].text), 'el texto no lleva lo que escribió');
    assert.ok(/el cliente mandó una foto \(va después de este texto\)/.test(bloques[0].text), 'el texto no dice que mandó una foto:\n' + bloques[0].text.slice(-300));
    assert.deepStrictEqual(bloques.slice(1), [
      { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'B64-' + idDe(foto1) }, cache_control: { type: 'ephemeral' } },
    ]);
    assert.strictEqual(marcasDeCache(pedidos[0].body), 3, 'las marcas de caché tienen que ser 3 (reglas, contexto, última imagen)');
    assert.deepStrictEqual(descargas, [{ id: idDe(foto1), mimetype: 'image/png' }], 'lo que se bajó: ' + JSON.stringify(descargas));
    assert.deepStrictEqual(aEste(chat).slice(-1), ['dale, de cuantos gb es?']);
    // El costo de la imagen viene en el usage: suma al gasto del mes como cualquier llamada.
    assert.ok(cerebro.gastoDelMes().usd > gastoAntes, 'la llamada con la imagen no sumó al gasto del mes');
  });

  await check('2. solo 2 fotos en un chat de Sonnet con canje en curso: la contesta Sonnet (no soloFotos), con 2 imágenes y "(mandó 2 fotos, sin texto)"', async () => {
    const chat = await chatDeSonnet({ canje: true });
    guion(responde(['dale, ahi vi la bateria', 'de cuantos gb es?']));
    const a = foto(chat);
    const b = foto(chat);
    await tanda(chat, null, [a, b]);
    assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet');
    assert.ok(textoDel(0).includes('"""\n(mandó 2 fotos, sin texto)\n"""'), 'el texto no dice "(mandó 2 fotos, sin texto)":\n' + textoDel(0).slice(-300));
    assert.deepStrictEqual(imagenesDel(0).map((b) => b.source.data), ['B64-' + idDe(a), 'B64-' + idDe(b)]);
    assert.ok(!imagenesDel(0)[0].cache_control && imagenesDel(0)[1].cache_control, 'el cache_control va solo en la última imagen');
    assert.deepStrictEqual(aEste(chat), ['dale, ahi vi la bateria', 'de cuantos gb es?']);
    assert.ok(!state.obtener(chat).escalado, 'escaló como soloFotos');
    assert.ok(!/canje/.test(alGrupo.join('\n')), 'avisó el canje al grupo como soloFotos');
    const prop = eventos().filter(delChat(chat)).filter((e) => e.tipo === 'propuesta').pop();
    assert.strictEqual(prop.fuente, 'sonnet');
  });

  await check('3. la misma tanda en un chat del bot de siempre: soloFotos como hoy, sin bajar ninguna imagen ni llamar a la API', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'apagado';
    await bot.procesar(escrito(chat, 'te dejo mi 12 en parte de pago para el 13'));
    assert.ok(state.obtener(chat).permutaDatosPedidos, 'el caso no prueba nada: no pidió los datos del canje');
    // Con `sombra` el chat lo atiende el bot de siempre (Sonnet piensa en sombra solo con texto).
    config.cerebro.modo = 'sombra';
    assert.strictEqual(cerebro.quienAtiende(chat), 'sombra');
    limpiar();
    guion();
    await tanda(chat, null, [foto(chat), foto(chat)]);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'llamó a la API');
    assert.deepStrictEqual(descargas, [], 'bajó imágenes');
    assert.strictEqual(state.obtener(chat).escalado, true, 'no escaló como soloFotos');
    assert.ok(/mandó los datos del equipo/.test(alGrupo.join('\n')), 'el aviso no es el de soloFotos:\n' + alGrupo.join('\n'));
    config.cerebro.modo = 'todos';
  });

  await check('4. 5 fotos: van las 3 últimas y el pedido dice "mandó 5 fotos, ves las últimas 3"', async () => {
    const chat = await chatDeSonnet({ canje: true });
    guion(responde(['dale, de cuantos gb es?']));
    const cinco = [1, 2, 3, 4, 5].map(() => foto(chat));
    await tanda(chat, 'ahi van', cinco);
    assert.strictEqual(pedidos.length, 1);
    assert.deepStrictEqual(imagenesDel(0).map((b) => b.source.data), cinco.slice(2).map((f) => 'B64-' + idDe(f)));
    assert.ok(/mandó 5 fotos, ves las últimas 3/.test(textoDel(0)), 'el texto no lo dice:\n' + textoDel(0).slice(-300));
    assert.deepStrictEqual(descargas.map((d) => d.id).sort(), cinco.slice(2).map(idDe).sort(), 'bajó otras: ' + JSON.stringify(descargas));
  });

  await check('5. una foto que Evolution no devuelve: no va, el pedido dice que no se pudo ver y Sonnet contesta igual', async () => {
    const chat = await chatDeSonnet({ canje: true });
    guion(responde(['contame de cuantos gb es']));
    await tanda(chat, '16 comun', [foto(chat, { media: null })]);
    assert.strictEqual(pedidos.length, 1);
    assert.deepStrictEqual(imagenesDel(0), []);
    assert.ok(/mandó una foto que no se pudo ver/.test(textoDel(0)), 'el texto no lo dice:\n' + textoDel(0).slice(-300));
    assert.deepStrictEqual(aEste(chat), ['contame de cuantos gb es']);
  });

  await check('5b. tarda más de 10 s (acá, del tope de la prueba), pesa más de 5 MB del base64 o es image/heic: no va ninguna, el pedido lo dice y Sonnet contesta', async () => {
    assert.strictEqual(fotosDelCliente.ESPERA_MS, 10000, 'el tope por foto no es de 10 s');
    assert.strictEqual(fotosDelCliente.MAX_BASE64, 5 * 1024 * 1024, 'el tope de peso no es de 5 MB');
    const bajarDeVerdad = fotosDelCliente.bajar;
    fotosDelCliente.bajar = (fotos) => bajarDeVerdad(fotos, { esperaMs: 50 });
    try {
      const chat = await chatDeSonnet({ canje: true });
      guion(responde(['dale, de cuantos gb es?']));
      const colgada = foto(chat, { media: () => new Promise(() => {}) });
      const pesada = foto(chat, { media: { base64: 'A'.repeat(5 * 1024 * 1024 + 4), mimetype: 'image/jpeg' } });
      const heic = foto(chat, { media: { base64: 'HEIC', mimetype: 'image/heic' }, mimetype: 'image/heic' });
      // Si no hubiera tope por foto, la tanda quedaría colgada: la prueba no espera más de 3 s.
      let reloj = null;
      const colgo = new Promise((resolve) => {
        reloj = setTimeout(() => resolve('colgada'), 3000);
      });
      const como = await Promise.race([tanda(chat, 'ahi van', [colgada, pesada, heic]).then(() => 'termino'), colgo]);
      clearTimeout(reloj);
      assert.strictEqual(como, 'termino', 'la tanda quedó esperando a la foto colgada');
      assert.strictEqual(pedidos.length, 1);
      assert.deepStrictEqual(imagenesDel(0), []);
      assert.ok(/mandó 3 fotos y no se pudo ver ninguna/.test(textoDel(0)), 'el texto no lo dice:\n' + textoDel(0).slice(-300));
      assert.deepStrictEqual(aEste(chat), ['dale, de cuantos gb es?']);
      const prop = eventos().filter(delChat(chat)).filter((e) => e.tipo === 'propuesta').pop();
      assert.deepStrictEqual(prop.sonnet.imagenes, { vistas: 0, sin_ver: 3 });
      // Una de cada: la que sí se ve va, y el pedido dice la otra.
      limpiar();
      guion(responde(['dale, y la bateria?']));
      const buena = foto(chat);
      await tanda(chat, 'y estas', [buena, foto(chat, { media: { base64: 'HEIC', mimetype: 'image/heic' } })]);
      assert.deepStrictEqual(imagenesDel(0).map((b) => b.source.data), ['B64-' + idDe(buena)]);
      assert.ok(/mandó 2 fotos, ves 1 \(va después de este texto\); una no se pudo ver/.test(textoDel(0)), textoDel(0).slice(-300));
    } finally {
      fotosDelCliente.bajar = bajarDeVerdad;
    }
  });

  await check('6. una foto suelta sin canje ni tanda abierta en un chat de Sonnet: silencio sin-texto, no se baja nada ni se llama a la API', async () => {
    const chat = await chatDeSonnet();
    guion();
    const suelta = foto(chat);
    await bot.procesar(suelta);
    await dormir(30);
    assert.deepStrictEqual(descargas, []);
    assert.strictEqual(pedidos.length, 0);
    assert.deepStrictEqual(aEste(chat), []);
    const ultimo = eventos().filter(delChat(chat)).pop();
    assert.strictEqual(ultimo.tipo, 'silencio');
    assert.strictEqual(ultimo.motivo, 'sin-texto');
    assert.strictEqual(ultimo.formato, 'foto');
    // La corta el filtro de la entrada (con el id de la foto), no la tanda.
    assert.deepStrictEqual(ultimo.lineas, [idDe(suelta)], 'no la cortó el filtro de la entrada: ' + JSON.stringify(ultimo));
    // Un chat que no existía tampoco se crea por una foto suelta.
    const nuevo = nuevoChat();
    await bot.procesar(foto(nuevo));
    assert.ok(!state.todos()[nuevo], 'una foto suelta creó el chat');
    assert.deepStrictEqual(descargas, []);
  });

  await check('7a. la sombra (CEREBRO_MODO=sombra) no manda imágenes ni baja nada, aunque la tanda traiga una foto', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'apagado';
    await bot.procesar(escrito(chat, 'te dejo mi 12 en parte de pago para el 13'));
    config.cerebro.modo = 'sombra';
    limpiar();
    guion(responde(['SOMBRA']));
    await tanda(chat, '12 comun', [foto(chat)]);
    await esperarHasta(() => eventos().some((e) => delChat(chat)(e) && e.tipo === 'propuesta-sonnet'));
    assert.strictEqual(pedidos.length, 1, 'la sombra no pensó');
    assert.deepStrictEqual(imagenesEnTodo(), [], 'la sombra mandó imágenes');
    assert.deepStrictEqual(descargas, [], 'bajó imágenes para la sombra');
    assert.ok(!/mandó una foto/.test(textoDel(0)), 'el pedido de la sombra habla de la foto');
    config.cerebro.modo = 'todos';
  });

  await check('7b. la sombra con persona tampoco: una foto con epígrafe mientras atiende una persona', async () => {
    const chat = await chatDeSonnet();
    config.cerebro.sombraPersonaHasta = '2099-12-31';
    try {
      await bot.procesar(mio(chat, 'hola, te escribe tomi'));
      guion(responde(['SOMBRA CON PERSONA']));
      await bot.procesar(foto(chat, { caption: 'es este' }));
      await esperarHasta(() => pedidos.length > 0);
      await dormir(20);
      assert.strictEqual(pedidos.length, 1, 'la sombra con persona no pensó');
      assert.ok(/es este/.test(textoDel(0)));
      assert.deepStrictEqual(imagenesEnTodo(), []);
      assert.deepStrictEqual(descargas, []);
      assert.deepStrictEqual(aEste(chat), []);
    } finally {
      config.cerebro.sombraPersonaHasta = '';
    }
  });

  await check('7c. #sonnet tampoco: lo que contestaría va sin imágenes', async () => {
    const chat = await chatDeSonnet();
    guion(responde(['dale']));
    await tanda(chat, 'es este', [foto(chat)]);
    limpiar();
    guion(responde(['LO QUE CONTESTARIA']));
    await bot.procesar(mio(GRUPO, `#sonnet ${numero(chat)}`));
    await esperarHasta(() => alGrupo.some((t) => /LO QUE CONTESTARIA/.test(t)));
    assert.strictEqual(pedidos.length, 1, '#sonnet no le preguntó a Sonnet');
    assert.deepStrictEqual(imagenesEnTodo(), []);
    assert.deepStrictEqual(descargas, []);
  });

  await check('8. el registro anota sonnet.imagenes ({ vistas, sin_ver }) y nunca la imagen', async () => {
    const props = eventos().filter(delChat(chat1)).filter((e) => e.tipo === 'propuesta' && e.sonnet && e.sonnet.imagenes);
    assert.strictEqual(props.length, 1, 'propuestas con imagenes: ' + props.length);
    assert.deepStrictEqual(props[0].sonnet.imagenes, { vistas: 1, sin_ver: 0 });
    const registro = fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8');
    assert.ok(!registro.includes('B64-'), 'el registro tiene el base64 de una foto');
    // Sin fotos, no va.
    const sinFotos = eventos().filter(delChat(chat1)).filter((e) => e.tipo === 'propuesta')[0];
    assert.ok(!('imagenes' in sinFotos.sonnet), 'una tanda sin fotos lleva sonnet.imagenes');
  });

  await check('9. en la tanda siguiente la foto de antes no se vuelve a mandar (ni a bajar)', async () => {
    limpiar();
    guion(responde(['dale, tiene algun detalle?']));
    await bot.procesar(escrito(chat1, 'es de 128'));
    assert.strictEqual(pedidos.length, 1);
    assert.deepStrictEqual(imagenesEnTodo(), []);
    assert.deepStrictEqual(descargas, []);
    assert.ok(!/mandó una foto/.test(textoDel(0)), 'el pedido sigue hablando de la foto');
  });

  await check('10. una foto con epígrafe ("es este"): el texto va como siempre y la imagen también', async () => {
    const chat = await chatDeSonnet();
    guion(responde(['dale, de cuantos gb es?']));
    const conEpigrafe = foto(chat, { caption: 'es este' });
    await bot.procesar(conEpigrafe);
    assert.strictEqual(pedidos.length, 1);
    assert.ok(textoDel(0).includes('"""\nes este\n"""'), 'el epígrafe no va como lo que escribió');
    assert.ok(/el cliente mandó una foto/.test(textoDel(0)));
    assert.deepStrictEqual(imagenesDel(0).map((b) => b.source.data), ['B64-' + idDe(conEpigrafe)]);
    const h = state.obtener(chat).historial;
    assert.strictEqual(h.filter((l) => l.quien === 'cliente').pop().texto, 'es este', 'el epígrafe no entró al historial');
    assert.ok(!JSON.stringify(h).includes('imageMessage') && !JSON.stringify(h).includes('B64-'), 'la línea del historial guarda la foto');
  });

  await check('11. base64DeMedia sin mimetype en la respuesta: la foto toma el de imageMessage; el audio, el de audioMessage; sin nada, audio/ogg', async () => {
    respuestaMedia = { base64: 'QUJD' };
    const deFoto = await base64Real({ key: { id: 'X1' }, message: { imageMessage: { mimetype: 'image/png' } } });
    assert.deepStrictEqual(deFoto, { base64: 'QUJD', mimetype: 'image/png' });
    const deAudio = await base64Real({ key: { id: 'X2' }, message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus' } } });
    assert.deepStrictEqual(deAudio, { base64: 'QUJD', mimetype: 'audio/ogg' });
    const sinNada = await base64Real({ key: { id: 'X3' }, message: {} });
    assert.deepStrictEqual(sinNada, { base64: 'QUJD', mimetype: 'audio/ogg' });
    respuestaMedia = { base64: 'QUJD', mimetype: 'image/jpeg' };
    const conMime = await base64Real({ key: { id: 'X4' }, message: { imageMessage: { mimetype: 'image/png' } } });
    assert.strictEqual(conMime.mimetype, 'image/jpeg', 'el de la respuesta gana');
    assert.deepStrictEqual(pedidosMedia.map((p) => p.message.key.id), ['X1', 'X2', 'X3', 'X4']);
  });

  await check('12. un acuse con una foto se le pregunta a Sonnet (sin la foto, después de la lista, no)', async () => {
    const chat = await chatDeSonnet();
    // Lo último de la cuenta fue la lista de precios: un "ok" solo no se le pregunta (bloque Ninjo 1).
    state.agregarAlHistorial(chat, 'vendedor', 'Ip 13 128GB 100% $495.000');
    guion();
    await bot.procesar(escrito(chat, 'ok'));
    assert.strictEqual(pedidos.length, 0, 'el caso no prueba nada: al "ok" solo le preguntó a Sonnet');
    guion(responde(['dale, de cuantos gb es el tuyo?']));
    await tanda(chat, 'ok', [foto(chat)]);
    assert.strictEqual(pedidos.length, 1, 'al "ok" con la foto no le preguntó a Sonnet');
    assert.strictEqual(imagenesDel(0).length, 1);
  });

  await check('13. un álbum cuenta por cada foto (el albumMessage no es una foto); un álbum solo, sin fotos, sigue como siempre', async () => {
    const chat = await chatDeSonnet({ canje: true });
    const album = { key: { remoteJid: chat, fromMe: false, id: 'ALB' + ++nFoto }, pushName: 'Lucia', message: { albumMessage: { expectedImageCount: 2 } } };
    guion(responde(['dale, de cuantos gb es?']));
    const a = foto(chat);
    const b = foto(chat);
    await tanda(chat, null, [album, a, b]);
    assert.strictEqual(pedidos.length, 1);
    assert.ok(textoDel(0).includes('(mandó 2 fotos, sin texto)'), 'contó el álbum como foto:\n' + textoDel(0).slice(-300));
    assert.deepStrictEqual(imagenesDel(0).map((x) => x.source.data), ['B64-' + idDe(a), 'B64-' + idDe(b)]);
    assert.ok(!descargas.some((d) => d.id === album.key.id), 'intentó bajar el álbum');
    // Solo el albumMessage (sin fotos que bajar): no se le pregunta a Sonnet, como hasta ahora (soloFotos).
    const otro = await chatDeSonnet({ canje: true });
    guion();
    await tanda(otro, null, [{ ...album, key: { remoteJid: otro, fromMe: false, id: 'ALB' + ++nFoto } }]);
    await dormir(30);
    assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet por un álbum sin fotos');
    assert.deepStrictEqual(descargas, []);
  });

  // Marca de canje (decisión de Tomás del 07/10/2026): cuando Sonnet anota un canje en la ficha, el chat queda
  // con `canjeSonnet` (la hora); una foto sola entra mientras la marca tenga menos de 72 h. Así la captura que
  // manda sola después de que Chiara pidió los datos la ve Sonnet, y un comprobante en un chat sin canje no.
  const conFicha = (mensajes, ficha) => [usar('responder', { mensajes, ficha })];
  async function chatConCanjeDeSonnet() {
    const chat = nuevoChat();
    config.cerebro.modo = 'todos';
    guion(conFicha(['dale, de cuantos gb es tu 16?', 'y mandame una captura de la bateria'], { canje: 'iPhone 16' }));
    await bot.procesar(escrito(chat, 'quiero canjear mi 16'));
    assert.strictEqual(cerebro.quienAtiende(chat), 'sonnet', 'el chat no lo atiende Sonnet');
    limpiar();
    return chat;
  }

  await check('14. Sonnet anota un canje en la ficha: queda canjeSonnet y una foto SOLA (sin tanda abierta) entra y la contesta Sonnet viéndola', async () => {
    const chat = await chatConCanjeDeSonnet();
    const marca = state.obtener(chat).canjeSonnet;
    assert.ok(Number(marca) > Date.now() - 60 * 1000, 'no quedó la marca de canje: ' + JSON.stringify(marca));
    assert.ok(!(state.obtener(chat).permuta && state.obtener(chat).permuta.ofrece), 'la prueba no prueba nada: permuta ya estaba');
    guion(responde(['dale, ahi vi la bateria', 'de cuantos gb es?']));
    const suelta = foto(chat);
    await bot.procesar(suelta);
    await esperarHasta(() => aEste(chat).length >= 2);
    assert.deepStrictEqual(descargas.map((d) => d.id), [idDe(suelta)], 'no bajó la foto');
    assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet');
    assert.ok(textoDel(0).includes('(mandó una foto, sin texto)'), textoDel(0).slice(-300));
    assert.deepStrictEqual(imagenesDel(0).map((b) => b.source.data), ['B64-' + idDe(suelta)]);
    assert.deepStrictEqual(aEste(chat), ['dale, ahi vi la bateria', 'de cuantos gb es?']);
  });

  await check('14b. una respuesta sin canje en la ficha no deja marca: la foto sola sigue en silencio sin-texto', async () => {
    const chat = nuevoChat();
    config.cerebro.modo = 'todos';
    guion(conFicha(['hola! que modelo buscas?'], { canje: '' }));
    await bot.procesar(escrito(chat, 'hola'));
    limpiar();
    assert.ok(!state.obtener(chat).canjeSonnet, 'quedó marca sin canje');
    guion();
    await bot.procesar(foto(chat));
    await dormir(30);
    assert.deepStrictEqual(descargas, []);
    assert.strictEqual(pedidos.length, 0);
    const ultimo = eventos().filter(delChat(chat)).pop();
    assert.deepStrictEqual([ultimo.tipo, ultimo.motivo], ['silencio', 'sin-texto']);
  });

  await check('14c. una marca de más de 72 h ya no vale: la foto sola va a silencio sin-texto y no se baja', async () => {
    const chat = await chatConCanjeDeSonnet();
    state.actualizar(chat, { canjeSonnet: Date.now() - 73 * 60 * 60 * 1000 });
    guion();
    await bot.procesar(foto(chat));
    await dormir(30);
    assert.deepStrictEqual(descargas, []);
    assert.strictEqual(pedidos.length, 0);
    const ultimo = eventos().filter(delChat(chat)).pop();
    assert.deepStrictEqual([ultimo.tipo, ultimo.motivo], ['silencio', 'sin-texto']);
  });

  await check('14d. con la marca pero el chat escalado: como hoy, la foto sola no entra', async () => {
    const chat = await chatConCanjeDeSonnet();
    state.actualizar(chat, { escalado: true });
    guion();
    await bot.procesar(foto(chat));
    await dormir(30);
    assert.deepStrictEqual(descargas, []);
    assert.strictEqual(pedidos.length, 0);
    assert.deepStrictEqual(aEste(chat), []);
  });

  await check('14e. con la marca pero el chat pasó al bot de siempre (#bot): la foto sola no va a Sonnet ni se baja', async () => {
    const chat = await chatConCanjeDeSonnet();
    state.actualizar(chat, { atiendeSonnet: false, atiendeBot: true });
    config.cerebro.modo = 'apagado';
    guion();
    await bot.procesar(foto(chat));
    await dormir(30);
    config.cerebro.modo = 'todos';
    assert.deepStrictEqual(descargas, []);
    assert.strictEqual(pedidos.length, 0);
  });

  termino = true;
  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
