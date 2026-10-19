'use strict';
/**
 * Pedidos de fotos y #sinstock (bloque 8, decisión de Tomás del 24/09/2026).
 *
 *   node test/fotos-pedido.test.js
 *
 * Se prueba:
 *   1. el cliente pide fotos o videos: el bot escala callado, avisa al grupo con los
 *      modelos y cómo seguir, y guarda el pedido pendiente (`fotosPedidas`);
 *   2. el cliente que manda fotos de su celular en un canje no está pidiendo fotos;
 *   3. sin modelo en el mensaje, el pedido toma el del chat (o dice que no dijo cuál);
 *   4. #sinstock <número> en el grupo: la foto de referencia de cada modelo, sola, sin
 *      texto, y lo que mandó en el grupo;
 *   5. un modelo sin foto: manda la otra y avisa en el grupo cuál falta;
 *   6. sin pedido pendiente o sin número: no manda nada y dice cómo se usa;
 *   7. después de #sinstock el chat sigue escalado;
 *   8. en borrador, o con un número fuera de las listas de prueba, no le manda nada;
 *   9. como mucho 4 fotos, como cualquier tanda: las otras, en el grupo.
 *
 * Evolution de mentira, como en control.test.js. Fotos inventadas en una carpeta
 * temporal (FOTOS_DIR). Sin red, extractor local y números inventados. El entorno se
 * fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000088@g.us';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-pedido-'));
const FOTOS = path.join(TMP, 'fotos');
fs.mkdirSync(FOTOS);
// Fotos de referencia inventadas: del 13 no hay.
for (const m of ['14', '15', '15 pro', '16', '17']) fs.writeFileSync(path.join(FOTOS, `${m}.jpg`), `foto inventada del ${m}`);

process.env.FOTOS_DIR = FOTOS;
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
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
process.env.ESCALADO_RECORDATORIO_MIN = '30';
process.env.ESCALADO_REANUDAR_HORAS = '24';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');

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
gemini.entender = async (h, m) => local.entender(m);
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

// Evolution de mentira: cada envío devuelve su id, como Evolution v2 (key.id). De cada
// imagen se anota la ruta y el texto que la acompaña: la foto de #sinstock va sola.
let idN = 0;
const aClientes = [];
const alGrupo = [];
async function envio(numero, tipo, texto, ruta = null) {
  const id = 'BOT' + ++idN;
  aClientes.push({ numero, tipo, texto, ruta, id });
  return { key: { remoteJid: numero, fromMe: true, id }, status: 'PENDING' };
}
evolution.enviarTexto = (numero, texto) => envio(numero, 'texto', texto);
evolution.enviarImagen = (numero, ruta, caption) => envio(numero, 'imagen', caption, ruta);
evolution.enviarDocumento = (numero, ruta, pie) => envio(numero, 'documento', pie);
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
const nuevoChat = () => '549000000' + String(++n).padStart(4, '0') + '@s.whatsapp.net';
const numero = (chat) => chat.split('@')[0];
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
/** Un mensaje escrito desde la cuenta del negocio: en el grupo, un comando. */
const mio = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: true, id: 'H' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
const delChat = (chat) => state.todos()[chat] || {};
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}

/** Un pedido de fotos que ya escaló: el punto de partida de #sinstock. */
async function conPedido(texto, previo = null) {
  const chat = nuevoChat();
  if (previo) await bot.procesar(escrito(chat, previo));
  await bot.procesar(escrito(chat, texto));
  assert.ok(delChat(chat).fotosPedidas, 'el caso no prueba nada: no quedó el pedido de fotos');
  limpiar();
  return chat;
}

(async () => {
  console.log('\nEl cliente pide fotos\n');

  await check('1. pide fotos: escala callado, avisa al grupo con los modelos y guarda el pedido', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'te jodo si me envias fotos o videos de ambos, del 15 y 16?'));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al cliente: ' + JSON.stringify(aEste(chat)));
    const s = delChat(chat);
    assert.strictEqual(s.escalado, true, 'no escaló');
    assert.ok(s.fotosPedidas, 'no guardó el pedido pendiente');
    assert.deepStrictEqual(s.fotosPedidas.modelos, ['iPhone 15', 'iPhone 16']);
    assert.ok(typeof s.fotosPedidas.ts === 'number' && s.fotosPedidas.ts > 0, 'el pedido no tiene fecha');
    const aviso = alGrupo.join('\n');
    assert.strictEqual(alGrupo.length, 1, 'avisos al grupo: ' + alGrupo.length);
    for (const t of ['iPhone 15', 'iPhone 16', 'Lucia', 'mandale las fotos vos', '#sinstock ' + numero(chat)]) {
      assert.ok(aviso.includes(t), `el aviso no dice "${t}":\n${aviso}`);
    }
    for (const t of ['me mandas fotos?', 'me pasas unas fotos del 15?', 'tenes fotos?', 'ftos y precios', 'nunca me enviaste las fotitos']) {
      const otro = nuevoChat();
      await bot.procesar(escrito(otro, t));
      assert.ok(delChat(otro).fotosPedidas, `"${t}" no quedó como pedido de fotos`);
      assert.deepStrictEqual(aEste(otro), [], `"${t}": le contestó al cliente`);
    }
    // Habla de algo que ya le mandaron (registro real: una postventa): no pide nada.
    for (const t of ['no se si era eso lo que me enviaste en el video', 'ya me pasaste las fotos, gracias']) {
      const otro = nuevoChat();
      await bot.procesar(escrito(otro, t));
      assert.ok(!delChat(otro).fotosPedidas, `"${t}" quedó como pedido de fotos`);
    }
  });

  await check('2. "te mando las fotos" en un canje no es un pedido: sigue el camino del canje', async () => {
    // "fotos?" suelto en un canje puede ser qué fotos le pedimos.
    for (const t of ['te mando las fotos', 'ahi van', 'fotos?']) {
      const chat = nuevoChat();
      await bot.procesar(escrito(chat, 'hago plan canje con mi 13 128gb 86%'));
      assert.ok(delChat(chat).permutaDatosPedidos, 'el caso no prueba nada: no pidió los datos del canje');
      limpiar();
      await bot.procesar(escrito(chat, t));
      const s = delChat(chat);
      assert.ok(!s.fotosPedidas, `"${t}" quedó como pedido de fotos`);
      assert.ok(!alGrupo.join('\n').includes('#sinstock'), `"${t}": el grupo recibió un aviso de fotos pedidas`);
      assert.ok(s.permuta && s.permuta.ofrece, `"${t}": se perdió el canje`);
    }
  });

  await check('3. sin modelo en el mensaje: toma el del chat; sin ninguno, el aviso lo dice', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 15?'));
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: no contestó el stock');
    limpiar();
    await bot.procesar(escrito(chat, 'me mandas fotos?'));
    assert.deepStrictEqual(delChat(chat).fotosPedidas.modelos, ['iPhone 15']);
    assert.ok(alGrupo.join('\n').includes('iPhone 15'), 'el aviso no dice el modelo del chat');

    const vacio = nuevoChat();
    limpiar();
    await bot.procesar(escrito(vacio, 'me mandas fotos?'));
    assert.deepStrictEqual(delChat(vacio).fotosPedidas.modelos, []);
    assert.ok(/no dijo de qu[eé] modelo/i.test(alGrupo.join('\n')), 'el aviso no dice que no dijo el modelo: ' + alGrupo.join('\n'));
  });

  console.log('\n#sinstock desde el grupo\n');

  await check('4. #sinstock con foto de los dos modelos: dos fotos solas al cliente y el aviso en el grupo', async () => {
    const chat = await conPedido('me pasas fotos del 15 y del 16?');
    await bot.procesar(mio(GRUPO, '#sinstock ' + numero(chat)));
    const enviados = aEste(chat);
    assert.strictEqual(enviados.length, 2, 'mandó: ' + JSON.stringify(enviados));
    assert.ok(enviados.every((m) => m.tipo === 'imagen'), 'le mandó algo que no es una foto');
    assert.ok(enviados.every((m) => !m.texto), 'la foto fue con texto: ' + JSON.stringify(enviados));
    assert.deepStrictEqual(enviados.map((m) => path.basename(m.ruta)).sort(), ['15.jpg', '16.jpg']);
    const s = delChat(chat);
    assert.ok(!s.fotosPedidas, 'no borró el pedido pendiente');
    assert.strictEqual(s.historial.filter((l) => l.quien === 'vendedor' && l.texto === '[foto]').length, 2, 'las fotos no quedaron en el historial');
    assert.strictEqual(alGrupo.length, 1, 'avisos al grupo: ' + alGrupo.join(' | '));
    for (const t of ['iPhone 15', 'iPhone 16', 'wa.me/' + numero(chat)]) {
      assert.ok(alGrupo[0].includes(t), `el aviso no dice "${t}":\n${alGrupo[0]}`);
    }
  });

  await check('5. un modelo sin foto: manda la otra y en el grupo dice cuál falta', async () => {
    const chat = await conPedido('me pasas fotos del 13 y del 15?');
    await bot.procesar(mio(GRUPO, '#sinstock ' + numero(chat)));
    const enviados = aEste(chat);
    assert.deepStrictEqual(enviados.map((m) => [m.tipo, path.basename(m.ruta)]), [['imagen', '15.jpg']]);
    assert.ok(
      alGrupo.join('\n').includes('No tengo foto de referencia del iPhone 13: mandásela vos'),
      'no avisó del que falta:\n' + alGrupo.join('\n')
    );
    assert.ok(!delChat(chat).fotosPedidas, 'no borró el pedido pendiente');
  });

  await check('6. sin pedido pendiente, o sin número: no manda nada y dice cómo se usa', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 15?'));
    limpiar();
    await bot.procesar(mio(GRUPO, '#sinstock ' + numero(chat)));
    assert.deepStrictEqual(aEste(chat), [], 'mandó algo sin pedido pendiente');
    assert.ok(/#sinstock 549/.test(alGrupo[0] || '') && /no mand[eé] nada/i.test(alGrupo[0] || ''), 'sin pedido: ' + alGrupo[0]);
    const avisos = [...alGrupo];
    limpiar();
    await bot.procesar(mio(GRUPO, '#sinstock'));
    assert.deepStrictEqual(aClientes, [], 'sin número mandó algo');
    assert.ok(/con el número/.test(alGrupo[0] || '') && /#sinstock 549/.test(alGrupo[0] || ''), 'sin número: ' + alGrupo[0]);
    avisos.push(...alGrupo);
    // Lo que el bot contesta en el grupo vuelve por el webhook como propio: no dispara nada.
    const antes = JSON.stringify(state.todos());
    limpiar();
    for (const t of avisos) await bot.procesar(mio(GRUPO, t));
    assert.deepStrictEqual(alGrupo, [], 'se contestó a su propio aviso');
    assert.strictEqual(JSON.stringify(state.todos()), antes, 'su propio aviso cambió el estado');
  });

  await check('7. después de #sinstock el chat sigue escalado: lo que escriba no se contesta', async () => {
    const chat = await conPedido('me mandas fotos del 15?');
    await bot.procesar(mio(GRUPO, '#sinstock ' + numero(chat)));
    assert.strictEqual(aEste(chat).length, 1, 'el caso no prueba nada: no mandó la foto');
    assert.strictEqual(delChat(chat).escalado, true, 'el chat dejó de estar escalado');
    limpiar();
    await bot.procesar(escrito(chat, 'y cuanto sale?'));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó con el chat escalado');
  });

  await check('8. en borrador, o con un número fuera de las listas, #sinstock no le manda nada al cliente', async () => {
    const antes = { borrador: config.modoBorrador, tester: config.numerosTester };
    try {
      config.modoBorrador = true;
      const chat = await conPedido('me mandas fotos del 15?');
      await bot.procesar(mio(GRUPO, '#sinstock ' + numero(chat)));
      assert.deepStrictEqual(aEste(chat), [], 'en borrador le mandó la foto');
      assert.ok(/borrador/i.test(alGrupo.join('\n')) && alGrupo.join('\n').includes('iPhone 15'), 'en borrador no dijo qué habría mandado: ' + alGrupo.join('\n'));

      config.modoBorrador = false;
      config.numerosTester = ['5490000009999'];
      const afuera = await conPedido('me mandas fotos del 16?');
      await bot.procesar(mio(GRUPO, '#sinstock ' + numero(afuera)));
      assert.deepStrictEqual(aEste(afuera), [], 'fuera de las listas le mandó la foto');
      assert.ok(alGrupo.join('\n').includes('iPhone 16'), 'fuera de las listas no dijo qué habría mandado: ' + alGrupo.join('\n'));
    } finally {
      config.modoBorrador = antes.borrador;
      config.numerosTester = antes.tester;
    }
  });

  await check('9. como mucho 4 fotos por tanda: las otras, en el grupo', async () => {
    const chat = await conPedido('me pasas fotos del 14, 15, 16, 17 y 15 pro?');
    assert.strictEqual(delChat(chat).fotosPedidas.modelos.length, 5, 'el caso no prueba nada: no son 5 modelos');
    await bot.procesar(mio(GRUPO, '#sinstock ' + numero(chat)));
    assert.strictEqual(aEste(chat).length, 4, 'mandó ' + aEste(chat).length + ' fotos');
    assert.ok(/tope por tanda: mandale vos la foto del iPhone 17/.test(alGrupo.join('\n')), 'no avisó de la que no mandó: ' + alGrupo.join('\n'));
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  try {
    fs.rmSync(TMP, { recursive: true, force: true });
  } catch {
    /* da igual */
  }
  process.exit(fallos ? 1 : 0);
})();
