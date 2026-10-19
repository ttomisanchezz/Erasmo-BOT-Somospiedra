'use strict';
/**
 * Tandas: los mensajes que el cliente manda seguidos se interpretan juntos.
 *
 *   node test/tandas.test.js
 *
 * Antes, el segundo de dos mensajes seguidos se descartaba (control `enProceso`
 * de index.js) y el bot contestaba solo el primero. Ahora la espera de ritmo
 * humano pasa ANTES de interpretar: lo que llega en ese rato entra en la tanda,
 * y lo que llega mientras se manda va en la siguiente. Una decisión por tanda:
 * lo que se anota en el estado es lo que se manda.
 *
 * Se prueba: que se junten, la cola, el techo, los audios en orden, un audio que
 * no se entendió, la marca de "no se entiende" y los acuses con tandas, y que una
 * persona que contesta durante la espera cancela.
 *
 * Y la corrección de monto ("tengo 400" + "perdon, 500"), en la misma tanda y en
 * tandas separadas: gana el último monto (bloque 5, decisión de Tomás del 16/09/2026).
 * Hasta entonces era un caso abierto que se imprimía como PENDIENTE.
 *
 * Sin red: entiende el extractor local y los audios se simulan. El entorno se fija
 * acá y no se hereda del .env.
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
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-tandas-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-tandas-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// Lo que llega a interpretarse: el texto de cada tanda, en orden.
const local = require('../src/extractor-local');
const lecturas = [];
gemini.entender = async (h, m) => {
  lecturas.push(m);
  return local.entender(m);
};
// Redactar devuelve el texto de reserva, como sin conexión: sin esto intentaba salir a Google.
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

// Audios simulados: se puede demorar la transcripción.
let transcripcion = null;
let demoraTranscripcion = 0;
evolution.base64DeMedia = async () => ({ base64: 'AAAA', mimetype: 'audio/ogg' });
gemini.transcribir = async () => {
  await dormir(demoraTranscripcion);
  if (transcripcion instanceof Error) throw transcripcion;
  return transcripcion;
};

const aClientes = [];
const alGrupo = [];
let demoraEnvio = 0;
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
evolution.enviarTexto = async (numero, texto) => {
  await dormir(demoraEnvio);
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
const nuevoChat = () => '54929933' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const mio = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: true, id: 'P' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const notaDeVoz = (chatId) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'A' + Math.random() },
  pushName: 'Lucia',
  message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 4, ptt: true } },
});
const textosA = (chat) =>
  aClientes
    .filter((m) => m.numero === chat)
    .map((m) => m.texto)
    .join(' ');
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  lecturas.length = 0;
}

(async () => {
  console.log('\nTandas\n');

  await check('dos mensajes que llegan durante la espera se interpretan juntos, una sola vez', async () => {
    const chat = nuevoChat();
    limpiar();
    const primero = bot.procesar(escrito(chat, 'hola'));
    await dormir(5);
    await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
    await primero;
    assert.deepStrictEqual(lecturas, ['hola\ntenes el iphone 13?']);
    assert.ok(/495\.000/.test(textosA(chat)), 'no contestó el segundo mensaje: ' + textosA(chat).slice(0, 120));
  });

  // Hasta el 15/09/2026 ese mensaje iba solo en la tanda siguiente. Desde el bloque 2
  // de la auditoría (decisión 2A de Tomás) corta lo que faltaba mandar y la tanda
  // siguiente contesta los dos juntos (también en test/control.test.js).
  await check('un mensaje que llega mientras se manda la respuesta la corta, y la tanda siguiente contesta los dos juntos', async () => {
    const chat = nuevoChat();
    limpiar();
    demoraEnvio = 40;
    try {
      const primero = bot.procesar(escrito(chat, 'tenes el iphone 13?'));
      await dormir(ESPERA + 40);
      assert.strictEqual(lecturas.length, 1, 'el caso no prueba nada: todavía no había interpretado');
      await bot.procesar(escrito(chat, 'y el 15?'));
      await primero;
    } finally {
      demoraEnvio = 0;
    }
    assert.deepStrictEqual(lecturas, ['tenes el iphone 13?', 'tenes el iphone 13?\ny el 15?']);
    assert.ok(/740\.000/.test(textosA(chat)), 'no contestó el mensaje que llegó mientras se mandaba');
  });

  await check('techo: si la tanda pasa de TECHO_TANDA caracteres se corta, y el resto va en la siguiente, en orden', async () => {
    const chat = nuevoChat();
    limpiar();
    const partes = Array.from(
      { length: 9 },
      (_, i) => `te cuento lo que ando buscando, esta es la parte ${i + 1} de un mensaje largo que mando partido en pedazos`
    );
    await Promise.all(partes.map((p) => bot.procesar(escrito(chat, p))));
    let entran = 0;
    let suma = 0;
    while (entran < partes.length && (entran === 0 || suma + partes[entran].length <= bot.TECHO_TANDA)) {
      suma += partes[entran].length;
      entran++;
    }
    assert.ok(entran < partes.length, 'el caso no prueba nada: estas partes no pasan el techo');
    assert.deepStrictEqual(lecturas, [partes.slice(0, entran).join('\n'), partes.slice(entran).join('\n')]);
  });

  await check('un mensaje solo, más largo que el techo, va entero', async () => {
    const chat = nuevoChat();
    limpiar();
    const largo = 'te cuento con detalle lo que busco '.repeat(Math.ceil((bot.TECHO_TANDA + 100) / 35)).trim();
    assert.ok(largo.length > bot.TECHO_TANDA);
    await bot.procesar(escrito(chat, largo));
    assert.deepStrictEqual(lecturas, [largo]);
  });

  await check('un audio y un texto en la misma ventana van en el orden en que llegaron, aunque el audio tarde más que la espera', async () => {
    const chat = nuevoChat();
    limpiar();
    transcripcion = 'hola, estoy buscando un iphone para regalar';
    demoraTranscripcion = ESPERA + 90;
    try {
      const primero = bot.procesar(notaDeVoz(chat));
      await dormir(5);
      await bot.procesar(escrito(chat, 'tenes el 13?'));
      await primero;
    } finally {
      demoraTranscripcion = 0;
    }
    assert.deepStrictEqual(lecturas, [`${transcripcion}\ntenes el 13?`]);
    const delCliente = state.todos()[chat].historial.filter((l) => l.quien === 'cliente');
    assert.deepStrictEqual(delCliente.map((l) => l.texto), [transcripcion, 'tenes el 13?'], 'el historial no respeta el orden');
    assert.strictEqual(delCliente[0].audio, true, 'la línea del audio no quedó marcada como audio');
    assert.ok(/495\.000/.test(textosA(chat)), 'no contestó la tanda');
  });

  await check('un audio que no se entendió en la tanda: no se interpreta nada, no cotiza y lo ve una persona', async () => {
    const chat = nuevoChat();
    limpiar();
    transcripcion = gemini.INAUDIBLE;
    const primero = bot.procesar(notaDeVoz(chat));
    await dormir(5);
    await bot.procesar(escrito(chat, 'tenes el 13? tengo 400 mil'));
    await primero;
    assert.deepStrictEqual(lecturas, [], 'interpretó una tanda con un audio que no se entendió');
    assert.strictEqual(textosA(chat), '', 'le escribió al cliente');
    assert.ok(alGrupo.some((t) => /^🔕/.test(t) && /audio/i.test(t)), 'no avisó al grupo por el audio');
    const h = state.todos()[chat].historial;
    assert.ok(h.some((l) => l.quien === 'cliente' && l.texto === '[audio que no se entendio]'), 'el audio no dejó rastro');
  });

  await check('no se entiende: dos mensajes raros en la misma tanda cuentan como uno; el que sigue, seguido, escala', async () => {
    const chat = nuevoChat();
    limpiar();
    const primero = bot.procesar(escrito(chat, 'asdasd'));
    await dormir(5);
    await bot.procesar(escrito(chat, 'kkkkkk'));
    await primero;
    assert.strictEqual(alGrupo.length, 0, 'escaló con una sola tanda');
    assert.strictEqual(state.todos()[chat].noEntendido.texto, 'kkkkkk', 'la marca no apunta a la última línea de la tanda');
    await bot.procesar(escrito(chat, 'qwrtyp'));
    assert.ok(alGrupo.some((t) => /no se entienden/.test(t)), 'no escaló con el mensaje raro que siguió a la tanda');
  });

  await check('acuses en tanda: "ok" y "👍" juntos se contestan una vez; el "dale" que sigue, no', async () => {
    const chat = nuevoChat();
    limpiar();
    const primero = bot.procesar(escrito(chat, 'ok'));
    await dormir(5);
    await bot.procesar(escrito(chat, '👍'));
    await primero;
    assert.deepStrictEqual(lecturas, ['ok\n👍']);
    assert.ok(/contame que estabas buscando/i.test(textosA(chat)), 'no contestó la tanda de acuses');
    const antes = aClientes.length;
    await bot.procesar(escrito(chat, 'dale'));
    assert.strictEqual(aClientes.length, antes, 'contestó el acuse que siguió');
  });

  await check('si una persona contesta durante la espera, la tanda no se interpreta ni se contesta', async () => {
    const chat = nuevoChat();
    limpiar();
    const primero = bot.procesar(escrito(chat, 'tenes el 13?'));
    await dormir(10);
    await bot.procesar(mio(chat, 'hola! si, lo tenemos'));
    await primero;
    assert.deepStrictEqual(lecturas, [], 'interpretó con una persona atendiendo');
    assert.strictEqual(textosA(chat), '', 'le contestó con una persona atendiendo');
  });

  console.log('\nCorrección de monto (bloque 5): gana el último\n');

  // Qué contestó en cada tanda, corto: la cotización se resume con su entrega.
  const resumir = (textos) =>
    textos
      .map((t) => {
        const entrega = (t.match(/Con una entrega de \*(\$[\d.]+)\*/) || [])[1];
        return entrega ? `[cotización con ${entrega}]` : t.replace(/\[doc:[^|]*\|/, '[PDF] ').slice(0, 70);
      })
      .join(' / ');
  /** Manda las tandas de a una (cada una espera la respuesta de la anterior) y anota qué contestó en cada una. */
  async function conversar(chat, tandas) {
    const renglones = [];
    for (const mensajes of tandas) {
      const desde = aClientes.length;
      const promesas = [];
      for (const [i, m] of mensajes.entries()) {
        if (i) await dormir(5);
        promesas.push(bot.procesar(escrito(chat, m)));
      }
      await Promise.all(promesas);
      const contesto = aClientes.slice(desde).filter((x) => x.numero === chat).map((x) => x.texto);
      renglones.push(`${JSON.stringify(mensajes.join(' + '))} -> ${contesto.length ? resumir(contesto) : '(no contestó)'}`);
    }
    return renglones;
  }
  // Con el 13 ya consultado ($495.000), 500.000 lo paga de contado: la última tanda
  // tiene que cotizarlo así, sin la disculpa, y dejar guardado el último monto.
  const corrige = (nombre, tandas) =>
    check(nombre, async () => {
      const chat = nuevoChat();
      await bot.procesar(escrito(chat, 'tenes el 13?'));
      const desde = aClientes.length;
      const renglones = await conversar(chat, tandas);
      const s = state.todos()[chat];
      assert.strictEqual(s.entrega, 500000, 'no quedó el último monto: ' + renglones.join(' / '));
      const textos = aClientes.slice(desde).filter((x) => x.numero === chat).map((x) => x.texto).join(' | ');
      assert.ok(!/no te hagas drama/i.test(textos), 'contestó la disculpa: ' + textos);
      assert.ok(/de contado, el iPhone 13 (esta|sale) \*\$495\.000\*/.test(textos), 'no recotizó con 500.000: ' + textos);
    });

  await corrige('"tengo 400" + "perdon, 500" en la MISMA tanda (con el 13 ya consultado)', [['tengo 400', 'perdon, 500']]);
  await corrige('los mismos dos mensajes en tandas SEPARADAS', [['tengo 400'], ['perdon, 500']]);
  // Sin "perdon": la corrección no depende de la disculpa, sino de que gane el último monto.
  await corrige('"tengo 400" + "me equivoque, son 500" en la misma tanda, sin "perdon"', [['tengo 400', 'me equivoque, son 500']]);

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
