'use strict';
/**
 * Seguridad del webhook (A1) y acciones separadas del texto (A2), de la auditoría
 * del 15/09/2026.
 *
 *   node test/seguridad.test.js
 *
 * A1: secreto en la ruta, validación del cuerpo, topes de tamaño y de pedidos,
 *     errores sin detalles, HOST y /salud. Se levanta el servidor de verdad en un
 *     puerto efímero (listen(0)) y se le pega por HTTP: el puerto real no se toca.
 * A2: un texto con forma de "[doc:ruta|pie]" o "[foto:ruta]" se manda como texto;
 *     las fotos y los documentos los arma solo el código, del catálogo; los envíos
 *     reales se niegan a mandar un archivo fuera de fotos/ o documentos/; lo que
 *     redacta Gemini con forma de marcador se cambia por el texto fijo.
 *
 * Sin red: Evolution se reemplaza por un fetch de mentira que anota lo que se le
 * habría pedido, y los envíos reales de evolution.js corren contra ese fetch.
 * Datos inventados. El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const SECRETO = 'secreto-de-prueba-7c1e4a';
const INSTANCIA = 'instancia-de-prueba';
const EVOLUTION = 'http://evolution.de-prueba.invalid';

// Carpetas de mentira para el catálogo: una foto, el PDF, y archivos que no valen.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'seguridad-'));
const FOTOS = path.join(TMP, 'fotos');
const DOCS = path.join(TMP, 'documentos');
fs.mkdirSync(FOTOS);
fs.mkdirSync(DOCS);
fs.writeFileSync(path.join(FOTOS, '13.jpg'), 'foto de mentira');
fs.writeFileSync(path.join(DOCS, 'compromiso-de-pago.pdf'), '%PDF de mentira');
fs.writeFileSync(path.join(DOCS, 'nota.txt'), 'no es un pdf');
fs.writeFileSync(path.join(TMP, 'fuera.pdf'), '%PDF fuera del catalogo');
fs.writeFileSync(path.join(TMP, 'afuera.jpg'), 'foto fuera del catalogo');

process.env.ESPERA_MIN_MS = '10';
process.env.ESPERA_MAX_MS = '20';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = '';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RESUMEN_ACTIVO = 'false';
process.env.EVOLUTION_URL = EVOLUTION;
process.env.EVOLUTION_INSTANCE = INSTANCIA;
process.env.EVOLUTION_APIKEY = 'clave-de-prueba';
process.env.WEBHOOK_SECRETO = SECRETO;
process.env.WEBHOOK_MAX_POR_MINUTO = '';
// Vacío y no borrado: si se borra, dotenv lo completa con el del .env de la máquina.
process.env.HOST = '';
process.env.FOTOS_DIR = FOTOS;
process.env.DOCS_DIR = DOCS;
process.env.GOOGLE_CREDENTIALS_PATH = path.join(TMP, 'credenciales-que-no-existen.json');
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');

// Lo único que puede salir es hacia la Evolution de mentira, y queda anotado.
const pedidosEvolution = [];
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (!u.startsWith(EVOLUTION)) throw new Error('salió a la red durante la prueba: ' + u);
  pedidosEvolution.push({ ruta: u.slice(EVOLUTION.length), cuerpo: opciones.body ? JSON.parse(opciones.body) : null });
  // Evolution v2 contesta cada envío con el id del mensaje: sin id, index.js no
  // confirma ni la autoría ni las marcas de "ya se dijo" (bloque 3).
  const respuesta = u.includes('/connectionState/')
    ? { instance: { state: 'open' } }
    : { key: { remoteJid: 'x@s.whatsapp.net', fromMe: true, id: 'EV' + pedidosEvolution.length } };
  return { ok: true, status: 200, json: async () => respuesta, text: async () => JSON.stringify(respuesta) };
};

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');
const responder = require('../src/responder');

// `decidir` se puede forzar en un caso; el resto usa el de verdad. Va antes de
// cargar index.js, que lo toma al cargarse.
const decidirReal = responder.decidir;
let decidirForzado = null;
responder.decidir = (...args) => (decidirForzado ? decidirForzado(...args) : decidirReal(...args));

// Los envíos de archivos se espían y siguen al real: así se prueba la guardia de evolution.js.
const imagenReal = evolution.enviarImagen;
const documentoReal = evolution.enviarDocumento;
const llamadas = { imagen: [], documento: [] };
evolution.enviarImagen = async (...args) => {
  llamadas.imagen.push(args);
  return imagenReal(...args);
};
evolution.enviarDocumento = async (...args) => {
  llamadas.documento.push(args);
  return documentoReal(...args);
};
const alGrupo = [];
const avisarReal = evolution.avisarGrupo;
evolution.avisarGrupo = async (texto) => {
  alGrupo.push(texto);
  return avisarReal(texto);
};

const bot = require('../src/index');
const state = require('../src/state');

const excepciones = [];
process.on('unhandledRejection', (e) => excepciones.push(e));
process.on('uncaughtException', (e) => excepciones.push(e));

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

let servidor;
/** Un pedido HTTP al servidor de la prueba. `crudo` manda el cuerpo tal cual, sin JSON. */
function pedir(metodo, ruta, cuerpo, { crudo } = {}) {
  return new Promise((resolve, reject) => {
    const datos = crudo !== undefined ? crudo : cuerpo === undefined ? '' : JSON.stringify(cuerpo);
    let respondio = false;
    const req = http.request(
      {
        host: '127.0.0.1',
        port: servidor.address().port,
        method: metodo,
        path: ruta,
        headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(datos) },
      },
      (res) => {
        respondio = true;
        let texto = '';
        res.on('data', (c) => (texto += c));
        res.on('end', () => resolve({ status: res.statusCode, cuerpo: texto }));
      }
    );
    // Con un cuerpo gigante el servidor puede cortar antes de terminar de recibirlo.
    req.on('error', (e) => {
      if (!respondio) reject(e);
    });
    req.end(datos);
  });
}

let n = 0;
const nuevoChat = () => '549299770' + String(n++).padStart(4, '0') + '@s.whatsapp.net';
/** Un "#pausa" desde la cuenta del negocio: si se procesa, el chat queda pausado. */
const pausa = (chatId, extra = {}) => ({
  event: 'messages.upsert',
  instance: INSTANCIA,
  data: { key: { remoteJid: chatId, fromMe: true, id: 'P' + n }, message: { conversation: '#pausa' } },
  ...extra,
});
const pausado = (chat) => Boolean(state.todos()[chat] && state.todos()[chat].pausado);
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const textosA = (chat) =>
  pedidosEvolution.filter((p) => p.ruta.includes('/message/sendText/') && p.cuerpo.number === chat).map((p) => p.cuerpo.text);
const mediaA = (chat, tipo) =>
  pedidosEvolution.filter(
    (p) => p.ruta.includes('/message/sendMedia/') && p.cuerpo.number === chat && p.cuerpo.mediatype === tipo
  );
function limpiar() {
  pedidosEvolution.length = 0;
  llamadas.imagen.length = 0;
  llamadas.documento.length = 0;
  alGrupo.length = 0;
}
/** Una respuesta de error no puede traer el stack, rutas del disco ni el nombre del error. */
const sinDetalles = (texto) => !/\bat \S|node_modules|SyntaxError|PayloadTooLarge|[A-Za-z]:\\/.test(texto);
/** Una ruta del disco ("C:\..." o "C:/..."). La letra no puede venir pegada a otra: "https://" no cuenta. */
const RUTA_DEL_DISCO = /(^|[^A-Za-z])[A-Za-z]:[\\/]/;

(async () => {
  servidor = await new Promise((resolve) => {
    const s = bot.app.listen(0, '127.0.0.1', () => resolve(s));
  });

  console.log('\nA1: webhook\n');

  await check('(a) con secreto: /webhook pelado responde 401 y no procesa', async () => {
    const chat = nuevoChat();
    const r = await pedir('POST', '/webhook', pausa(chat));
    await dormir(20);
    assert.strictEqual(r.status, 401);
    assert.ok(!pausado(chat), 'procesó un pedido sin secreto');
  });

  await check('(a) con secreto: un secreto incorrecto responde 401 y no procesa', async () => {
    const chat = nuevoChat();
    const r = await pedir('POST', '/webhook/otro-secreto', pausa(chat));
    await dormir(20);
    assert.strictEqual(r.status, 401);
    assert.ok(!pausado(chat), 'procesó un pedido con el secreto equivocado');
    assert.ok(!r.cuerpo.includes(SECRETO), 'la respuesta trae el secreto');
  });

  await check('(a) con secreto: con el correcto procesa', async () => {
    const chat = nuevoChat();
    const r = await pedir('POST', `/webhook/${SECRETO}`, pausa(chat));
    await dormir(20);
    assert.strictEqual(r.status, 200);
    assert.ok(pausado(chat), 'no procesó un pedido con el secreto correcto');
  });

  await check('(b) sin secreto: /webhook procesa como hoy', async () => {
    const chat = nuevoChat();
    config.webhook.secreto = '';
    try {
      const r = await pedir('POST', '/webhook', pausa(chat));
      await dormir(20);
      assert.strictEqual(r.status, 200);
      assert.ok(pausado(chat), 'sin secreto no procesó');
    } finally {
      config.webhook.secreto = SECRETO;
    }
  });

  await check('(b) sin secreto también acepta /webhook/<algo>: se puede cambiar la URL de Evolution antes que el .env', async () => {
    const chat = nuevoChat();
    config.webhook.secreto = '';
    try {
      const r = await pedir('POST', `/webhook/${SECRETO}`, pausa(chat));
      await dormir(20);
      assert.strictEqual(r.status, 200);
      assert.ok(pausado(chat));
    } finally {
      config.webhook.secreto = SECRETO;
    }
  });

  await check('(c) otra instancia: se descarta (403, que Evolution no reintenta)', async () => {
    const chat = nuevoChat();
    const r = await pedir('POST', `/webhook/${SECRETO}`, pausa(chat, { instance: 'otra-instancia' }));
    await dormir(20);
    assert.strictEqual(r.status, 403);
    assert.ok(!pausado(chat), 'procesó un mensaje de otra instancia');
  });

  await check('(c) sin el campo instance se acepta: la validación corre solo si viene', async () => {
    const chat = nuevoChat();
    const cuerpo = pausa(chat);
    delete cuerpo.instance;
    const r = await pedir('POST', `/webhook/${SECRETO}`, cuerpo);
    await dormir(20);
    assert.strictEqual(r.status, 200);
    assert.ok(pausado(chat));
  });

  await check('(c) un evento que no es de mensajes se ignora sin error', async () => {
    const r = await pedir('POST', `/webhook/${SECRETO}`, { event: 'connection.update', instance: INSTANCIA, data: { state: 'open' } });
    assert.strictEqual(r.status, 200);
  });

  await check('(c) cuerpo mal formado: se descarta con 400, sin excepción y sin detalles', async () => {
    const casos = [
      ['JSON roto', { crudo: '{"event": "messages.upsert", "data": ' }],
      ['un array', { cuerpo: [] }],
      ['sin event', { cuerpo: { instance: INSTANCIA, data: {} } }],
      ['remoteJid que no es texto', { cuerpo: { event: 'messages.upsert', instance: INSTANCIA, data: { key: { remoteJid: 12345 } } } }],
      ['data vacío', { cuerpo: { event: 'messages.upsert', instance: INSTANCIA, data: null } }],
      ['sin data', { cuerpo: { event: 'messages.upsert', instance: INSTANCIA } }],
    ];
    for (const [nombre, { cuerpo, crudo }] of casos) {
      const r = await pedir('POST', `/webhook/${SECRETO}`, cuerpo, { crudo });
      assert.strictEqual(r.status, 400, `${nombre}: respondió ${r.status}`);
      assert.ok(sinDetalles(r.cuerpo), `${nombre}: la respuesta trae detalles: ${r.cuerpo.slice(0, 120)}`);
    }
    await dormir(20);
    assert.deepStrictEqual(excepciones.map(String), [], 'hubo excepciones sin atrapar');
    assert.strictEqual((await pedir('GET', '/salud')).status, 200, 'el servidor no sigue vivo');
  });

  await check('(d) un cuerpo demasiado grande se rechaza (413) sin procesar y sin detalles', async () => {
    const chat = nuevoChat();
    const cuerpo = pausa(chat);
    cuerpo.relleno = 'x'.repeat(6 * 1024 * 1024);
    const r = await pedir('POST', `/webhook/${SECRETO}`, cuerpo);
    await dormir(20);
    assert.strictEqual(r.status, 413);
    assert.ok(!pausado(chat), 'procesó un cuerpo gigante');
    assert.ok(sinDetalles(r.cuerpo), 'la respuesta trae detalles: ' + r.cuerpo.slice(0, 120));
  });

  await check('tope de pedidos por minuto: pasado el tope responde 429 sin procesar; los pedidos sin secreto no lo gastan', async () => {
    const antes = config.webhook.maxPorMinuto;
    bot.reiniciarTopeWebhook();
    config.webhook.maxPorMinuto = 3;
    try {
      for (let i = 0; i < 5; i++) {
        assert.strictEqual((await pedir('POST', '/webhook', pausa(nuevoChat()))).status, 401);
      }
      for (let i = 0; i < 3; i++) {
        const r = await pedir('POST', `/webhook/${SECRETO}`, pausa(nuevoChat()));
        assert.strictEqual(r.status, 200, `el pedido ${i + 1} dentro del tope respondió ${r.status}: los 401 gastaron el tope`);
      }
      const chat = nuevoChat();
      const r = await pedir('POST', `/webhook/${SECRETO}`, pausa(chat));
      await dormir(20);
      assert.strictEqual(r.status, 429);
      assert.ok(!pausado(chat), 'procesó un pedido pasado el tope');
    } finally {
      config.webhook.maxPorMinuto = antes;
      bot.reiniciarTopeWebhook();
    }
  });

  await check('(e) /salud: modo efectivo, si hay secreto, versión y último mensaje; sin el secreto ni datos de clientes', async () => {
    const chat = nuevoChat();
    await pedir('POST', `/webhook/${SECRETO}`, pausa(chat));
    const salud = async () => {
      const r = await pedir('GET', '/salud');
      assert.strictEqual(r.status, 200);
      assert.ok(!r.cuerpo.includes(SECRETO), '/salud muestra el secreto');
      assert.ok(!r.cuerpo.includes(chat.split('@')[0]), '/salud muestra un número de cliente');
      return JSON.parse(r.cuerpo);
    };
    const j = await salud();
    assert.strictEqual(j.webhookConSecreto, true);
    assert.strictEqual(j.modo, 'en vivo');
    assert.ok(j.version && j.version.arranque, 'sin fecha de arranque');
    assert.ok('commit' in j.version, 'sin el campo commit');
    assert.ok(j.ultimoMensaje && Date.now() - Date.parse(j.ultimoMensaje) < 60000, 'sin la hora del último mensaje');

    const antes = { tester: config.numerosTester, piloto: config.numerosPiloto, borrador: config.modoBorrador, escucha: config.modoEscucha };
    try {
      // Las dos listas por separado (Pendientes 1, Parte C).
      config.numerosTester = ['5492990000001'];
      let k = await salud();
      assert.strictEqual(k.modo, 'en vivo con tester');
      assert.strictEqual(k.numerosTester, 1);
      assert.strictEqual(k.numerosPiloto, 0);
      config.numerosPiloto = ['5492990000002', '5492990000003'];
      k = await salud();
      assert.strictEqual(k.modo, 'en vivo con tester y piloto');
      assert.strictEqual(k.numerosTester, 1);
      assert.strictEqual(k.numerosPiloto, 2);
      config.numerosTester = [];
      assert.strictEqual((await salud()).modo, 'en vivo con piloto');
      config.numerosTester = ['5492990000001'];
      config.modoBorrador = true;
      assert.strictEqual((await salud()).modo, 'borrador');
      config.modoEscucha = true;
      assert.strictEqual((await salud()).modo, 'escucha');
      config.webhook.secreto = '';
      k = await salud();
      assert.strictEqual(k.webhookConSecreto, false);
    } finally {
      config.numerosTester = antes.tester;
      config.numerosPiloto = antes.piloto;
      config.modoBorrador = antes.borrador;
      config.modoEscucha = antes.escucha;
      config.webhook.secreto = SECRETO;
    }
  });

  await check('HOST: sin HOST escucha en todas las interfaces; con HOST=127.0.0.1, solo en esa', async () => {
    assert.strictEqual(config.host, '', 'sin HOST en el entorno, config.host tiene que quedar vacío');
    const abrir = async (host) => {
      const s = bot.escuchar(0, host);
      await new Promise((r) => s.once('listening', r));
      const direccion = s.address().address;
      await new Promise((r) => s.close(r));
      return direccion;
    };
    assert.ok(['::', '0.0.0.0'].includes(await abrir('')), 'sin HOST no escucha en todas las interfaces');
    assert.strictEqual(await abrir('127.0.0.1'), '127.0.0.1');
  });

  console.log('\nA2: acciones separadas del texto\n');

  await check('reproducción: redactar devuelve "[doc:C:/x/archivo.txt|hola]": no se llama a enviarDocumento y el cliente recibe el texto fijo', async () => {
    const chat = nuevoChat();
    limpiar();
    const redactarReal = gemini.redactar;
    gemini.redactar = async () => '[doc:C:/x/archivo.txt|hola]';
    try {
      await bot.procesar(escrito(chat, 'que garantia tienen?'));
    } finally {
      gemini.redactar = redactarReal;
    }
    assert.deepStrictEqual(llamadas.documento, [], 'llamó a enviarDocumento con un texto de Gemini');
    const textos = textosA(chat).map((t) => t.toLowerCase());
    assert.ok(textos.includes(responder.DATOS_FIJOS.garantia), 'no le llegó el texto fijo: ' + JSON.stringify(textos));
    assert.ok(!textos.some((t) => t.includes('[doc:')), 'le mandó el marcador como texto');
  });

  await check('un string con forma de marcador que llegue a los mensajes se manda como texto, nunca como archivo', async () => {
    const chat = nuevoChat();
    limpiar();
    // Aunque la ruta sea la del catálogo: un texto no ordena mandar nada.
    const comoTexto = ['[foto:C:/x/imagen.jpg]', `[doc:${path.join(DOCS, 'compromiso-de-pago.pdf')}|firmalo]`];
    decidirForzado = async () => ({ mensajes: comoTexto });
    try {
      await bot.procesar(escrito(chat, 'hola'));
    } finally {
      decidirForzado = null;
    }
    assert.deepStrictEqual(llamadas.imagen, [], 'mandó una imagen desde un texto');
    assert.deepStrictEqual(llamadas.documento, [], 'mandó un documento desde un texto');
    assert.deepStrictEqual(textosA(chat), comoTexto);
  });

  await check('los envíos reales no mandan un archivo fuera del catálogo ni con otra extensión', async () => {
    const chat = nuevoChat();
    limpiar();
    const casos = [
      ['documento fuera de documentos/', documentoReal, 'C:/x/archivo.txt'],
      ['documento que no es pdf, adentro de documentos/', documentoReal, path.join(DOCS, 'nota.txt')],
      ['documento que sale de la carpeta con ..', documentoReal, path.join(DOCS, '..', 'fuera.pdf')],
      ['foto que es un pdf', imagenReal, path.join(DOCS, 'compromiso-de-pago.pdf')],
      ['foto fuera de fotos/', imagenReal, path.join(TMP, 'afuera.jpg')],
      ['foto que sale de la carpeta con ..', imagenReal, path.join(FOTOS, '..', 'afuera.jpg')],
    ];
    for (const [nombre, fn, ruta] of casos) {
      let r;
      try {
        r = await fn(chat, ruta, 'pie', 0);
      } catch (e) {
        throw new Error(`${nombre}: tiró en vez de frenar (${e.message})`);
      }
      assert.ok(r && r.bloqueado, nombre + ': no frenó');
    }
    assert.deepStrictEqual(pedidosEvolution.filter((p) => p.ruta.includes('/sendMedia/')), [], 'llegó a pedirle a Evolution');
  });

  await check('la guardia no se confunde con mayúsculas ni separadores de Windows', async () => {
    const chat = nuevoChat();
    limpiar();
    const ruta = path.join(DOCS, 'compromiso-de-pago.pdf');
    const variantes = [ruta.split(path.sep).join('/')];
    if (process.platform === 'win32') variantes.push(ruta.toUpperCase());
    for (const v of variantes) {
      const r = await documentoReal(chat, v, 'pie', 0);
      assert.ok(!r || !r.bloqueado, 'frenó un archivo del catálogo: ' + v);
    }
    assert.strictEqual(pedidosEvolution.filter((p) => p.ruta.includes('/sendMedia/')).length, variantes.length);
  });

  await check('la foto y el PDF del compromiso legítimos siguen saliendo, del catálogo', async () => {
    const chat = nuevoChat();
    limpiar();
    // Desde el bloque 3b el PDF sale con la explicación de la financiación, al
    // contestar "en cuotas"; la cotización ya no lo repite.
    for (const t of ['hola tenes el 13?', 'ese me gusto', 'en cuotas']) {
      await bot.procesar(escrito(chat, t));
    }
    const propuestaConPdf = state.todos()[chat].ultimaPropuestaBot || '';
    await bot.procesar(escrito(chat, 'tengo 400 mil'));
    const foto = mediaA(chat, 'image');
    const pdf = mediaA(chat, 'document');
    assert.strictEqual(foto.length, 1, 'no salió la foto');
    assert.strictEqual(foto[0].cuerpo.fileName, '13.jpg');
    assert.strictEqual(pdf.length, 1, 'no salió el PDF');
    assert.strictEqual(pdf[0].cuerpo.fileName, 'compromiso-de-pago.pdf');
    assert.ok(/dni/i.test(pdf[0].cuerpo.caption), 'el PDF salió sin el pie de requisitos: ' + pdf[0].cuerpo.caption);
    const s = state.todos()[chat];
    assert.ok(s.historial.some((l) => l.quien === 'vendedor' && l.texto === '[foto]'), 'la foto no quedó en el historial');
    assert.ok(
      !/\[object Object\]/.test(s.ultimaPropuestaBot || '') && !RUTA_DEL_DISCO.test(s.ultimaPropuestaBot || ''),
      'ultimaPropuestaBot ilegible o con rutas: ' + s.ultimaPropuestaBot
    );
    assert.ok(
      !/\[object Object\]/.test(propuestaConPdf) && !RUTA_DEL_DISCO.test(propuestaConPdf),
      'ultimaPropuestaBot ilegible o con rutas: ' + propuestaConPdf
    );
    assert.ok(propuestaConPdf.includes('[doc: compromiso de pago]'), 'ultimaPropuestaBot: ' + propuestaConPdf);
  });

  await check('en borrador, el texto al grupo muestra la foto legible y sin rutas', async () => {
    const chat = nuevoChat();
    limpiar();
    // En borrador no sale nada, así que tampoco se marca nada (bloque 3): el chat
    // arranca con lo que ya se le había dicho al cliente de verdad, para llegar al
    // paso donde va la foto.
    state.actualizar(chat, {
      modelo: 'iPhone 13',
      stockInformadoDe: 'iPhone 13',
      preciosMostradosDe: ['iPhone 13'],
    });
    config.modoBorrador = true;
    try {
      await bot.procesar(escrito(chat, 'ese me gusto'));
    } finally {
      config.modoBorrador = false;
    }
    const borrador = alGrupo.join('\n');
    assert.ok(borrador.includes('[foto: iPhone 13]'), 'el borrador no muestra la foto: ' + borrador);
    assert.ok(!RUTA_DEL_DISCO.test(borrador) && !/13\.jpg/.test(borrador), 'el borrador trae la ruta: ' + borrador);
    assert.deepStrictEqual(mediaA(chat, 'image'), [], 'en borrador mandó la foto');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  servidor.close();
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* da igual */
  }
  process.exit(fallos ? 1 : 0);
})();
