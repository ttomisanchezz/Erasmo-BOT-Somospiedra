'use strict';
/**
 * Arreglos "desde cero" que pasan por index.js (diagnóstico y decisiones de Tomás del
 * 29/09/2026).
 *
 *   node test/desde-cero.test.js
 *
 * Se prueba:
 *   D1. una foto sin texto en un canje en curso cuenta como "mandó fotos": con los datos ya
 *       pedidos escala callado; varias fotos o un álbum son un solo evento; si llega en la
 *       misma tanda en que arranca el canje, también cuenta; fuera de un canje, nada (no
 *       entra al historial ni avisa al grupo).
 *   D10. un pedido del catálogo de WhatsApp (orderMessage) sin texto escala callado con el
 *       nombre del producto; si en la misma tanda escribió texto, se contesta el texto.
 *
 * Evolution de mentira, como en fotos-pedido.test.js. Sin red, extractor local y números
 * inventados. El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000077@g.us';

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'desde-cero-'));
fs.mkdirSync(path.join(TMP, 'docs'));
fs.writeFileSync(path.join(TMP, 'docs', 'compromiso-de-pago.pdf'), 'pdf inventado');

process.env.DOCS_DIR = path.join(TMP, 'docs');
process.env.FOTOS_DIR = path.join(TMP, 'fotos');
process.env.ESPERA_MIN_MS = '40';
process.env.ESPERA_MAX_MS = '50';
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
process.env.SOLO_CHATS_NUEVOS = 'false';
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

let idN = 0;
const aClientes = [];
const alGrupo = [];
async function envio(numero, tipo, texto) {
  const id = 'BOT' + ++idN;
  aClientes.push({ numero, tipo, texto, id });
  return { key: { remoteJid: numero, fromMe: true, id }, status: 'PENDING' };
}
evolution.enviarTexto = (numero, texto) => envio(numero, 'texto', texto);
evolution.enviarImagen = (numero, ruta, caption) => envio(numero, 'imagen', caption);
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
const base = (chatId) => ({ key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() }, pushName: 'Lucia' });
const escrito = (chatId, texto) => ({ ...base(chatId), message: { conversation: texto } });
const foto = (chatId) => ({ ...base(chatId), message: { imageMessage: { mimetype: 'image/jpeg' } } });
const album = (chatId) => ({ ...base(chatId), message: { albumMessage: { expectedImageCount: 3 } } });
const pedido = (chatId, titulo) => ({
  ...base(chatId),
  message: { orderMessage: { orderId: '1', itemCount: 1, ...(titulo ? { orderTitle: titulo } : {}) } },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
const delChat = (chat) => state.todos()[chat] || {};
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}

/** Un canje con los datos ya pedidos ("pasame modelo, almacenamiento..."). */
async function canjePedido() {
  const chat = nuevoChat();
  await bot.procesar(escrito(chat, 'hacen canje?'));
  assert.ok(delChat(chat).permutaDatosPedidos, 'el caso no prueba nada: no pidió los datos del canje');
  limpiar();
  return chat;
}

(async () => {
  console.log('\nD1: la foto sin texto en un canje\n');

  await check('1. canje con los datos pedidos y una foto sin texto: escala callado con los datos del equipo', async () => {
    const chat = await canjePedido();
    await bot.procesar(foto(chat));
    const s = delChat(chat);
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al cliente: ' + JSON.stringify(aEste(chat)));
    assert.strictEqual(s.escalado, true, 'no escaló');
    assert.ok(s.permuta && s.permuta.tiene_fotos, 'no anotó las fotos en el canje');
    assert.ok(/mandó los datos del equipo/.test(alGrupo.join('\n')), 'el aviso no dice que mandó los datos:\n' + alGrupo.join('\n'));
    assert.ok(!(s.historial || []).some((l) => l.quien === 'cliente' && !l.texto), 'la foto entró al historial como una línea vacía');
  });

  await check('2. un álbum (albumMessage y varias fotos) en la misma tanda es un solo evento', async () => {
    const chat = await canjePedido();
    const llegadas = [bot.procesar(album(chat)), bot.procesar(foto(chat)), bot.procesar(foto(chat)), bot.procesar(foto(chat))];
    await Promise.all(llegadas);
    assert.strictEqual(alGrupo.filter((t) => /canje/.test(t)).length, 1, 'avisos del canje al grupo: ' + alGrupo.length + '\n' + alGrupo.join('\n'));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al cliente');
  });

  await check('3. la foto llega en la misma tanda en que arranca el canje: cuenta', async () => {
    const chat = nuevoChat();
    const texto = bot.procesar(escrito(chat, 'hago plan canje con mi 13'));
    await bot.procesar(foto(chat));
    await texto;
    const s = delChat(chat);
    assert.ok(s.permuta && s.permuta.tiene_fotos, 'no anotó la foto en el canje: ' + JSON.stringify(s.permuta));
    const dicho = aEste(chat).map((m) => m.texto).join(' | ');
    assert.ok(/almacenamiento/.test(dicho), 'no pidió lo que falta: ' + dicho);
    assert.ok(!/fotos/.test(dicho), 'volvió a pedir fotos: ' + dicho);
  });

  await check('4. fuera de un canje, la foto sin texto sigue como hoy: nada', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: no contestó el stock');
    limpiar();
    const antes = (delChat(chat).historial || []).length;
    await bot.procesar(foto(chat));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al cliente');
    assert.deepStrictEqual(alGrupo, [], 'avisó al grupo');
    assert.strictEqual((delChat(chat).historial || []).length, antes, 'la foto entró al historial');
    assert.ok(!delChat(chat).escalado, 'escaló');
    // Un chat que no existía tampoco se crea por una foto suelta.
    const nuevo = nuevoChat();
    await bot.procesar(foto(nuevo));
    assert.ok(!state.todos()[nuevo], 'una foto suelta creó el chat');
  });

  await check('5. canje en curso y la foto con texto que pregunta otra cosa: la foto es un dato del canje', async () => {
    const chat = await canjePedido();
    const texto = bot.procesar(escrito(chat, 'ahi te mando'));
    await bot.procesar(foto(chat));
    await texto;
    assert.strictEqual(delChat(chat).escalado, true, 'no escaló con la foto');
    assert.ok(/mandó los datos del equipo/.test(alGrupo.join('\n')), 'el aviso no dice que mandó los datos');
  });

  console.log('\nD10: el pedido del catálogo de WhatsApp\n');

  await check('6. un pedido del catálogo sin texto: escala callado con el nombre del producto', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(pedido(chat, 'iPhone 13 128GB'));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al cliente: ' + JSON.stringify(aEste(chat)));
    assert.strictEqual(delChat(chat).escalado, true, 'no escaló');
    const aviso = alGrupo.join('\n');
    assert.ok(/mandó un pedido del catálogo de WhatsApp/.test(aviso), 'el aviso no dice que mandó un pedido:\n' + aviso);
    assert.ok(/iPhone 13 128GB/.test(aviso), 'el aviso no dice el producto:\n' + aviso);
  });

  await check('7. sin nombre del producto: el mismo motivo, sin nombre', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(pedido(chat, null));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al cliente');
    assert.ok(/mandó un pedido del catálogo de WhatsApp/.test(alGrupo.join('\n')), 'no avisó el pedido: ' + JSON.stringify(alGrupo));
  });

  await check('8. el pedido y un texto en la misma tanda: se contesta el texto como siempre', async () => {
    const chat = nuevoChat();
    limpiar();
    const elPedido = bot.procesar(pedido(chat, 'iPhone 13'));
    await bot.procesar(escrito(chat, 'hola quería saber si vendían ese celular en cuotas'));
    await elPedido;
    const dicho = aEste(chat).map((m) => m.texto).join(' | ');
    assert.ok(/financ|cuotas/i.test(dicho), 'no contestó el texto: ' + dicho);
    assert.ok(!/pedido del catálogo/.test(alGrupo.join('\n')), 'avisó el pedido aunque escribió texto');
  });

  console.log('\nSegunda vuelta (30/09): lo que encontró la verificación\n');

  const { preguntaPrecio } = require('../src/responder');

  await check('9. (1) "entregar" es canje solo si entrega el cliente; "más plata por", solo con su equipo', () => {
    for (const t of ['y para cuando me podes entregar el 16?', 'me podrian entregar el 16 hoy?', 'para cuando me entregas?', 'y cuanta mas plata por un 15?']) {
      assert.notStrictEqual(local.entender(t).intencion, 'permuta', `leyó un canje en "${t}"`);
      assert.strictEqual(local.entender(t).permuta.ofrece, false, `armó un canje en "${t}"`);
    }
    for (const t of ['te puedo entregar mi 12 para el 15?', 'te entrego mi 12', 'tengo un 11 para entregar', 'tengo un 12, cuanta mas plata por un 15?', 'el 15 pro más plata por un 16 pro se puede?', 'lo dejo en parte de pago']) {
      assert.strictEqual(local.entender(t).intencion, 'permuta', `no leyó el canje en "${t}"`);
    }
    // El equipo del canje no sale de lo que nos pide: "me podés entregar el 13" no es su 13.
    assert.deepStrictEqual(local.datosDelCanjeEnTexto('para cuando me podes entregar el 13?'), {});
    assert.strictEqual(local.hablaDelCanje('para cuando me podes entregar el 13?'), false);
  });

  await check('9b. (2) "¿me lo dejás en 780?" es un regateo; "¿me lo dejás a 3 cuotas?" no', () => {
    for (const t of ['me lo dejas en 780?', 'me lo dejás a 780 mil?', 'lo dejarias en 750.000?']) {
      assert.strictEqual(local.esRegateo(t), true, `no leyó el regateo en "${t}"`);
      assert.strictEqual(local.pideDescuento(t), true, `no leyó el descuento en "${t}"`);
    }
    for (const t of ['me lo dejas a 3 cuotas?', 'me lo dejas en 12 cuotas?', 'me lo dejas en 2 pagos?']) {
      assert.strictEqual(local.esRegateo(t), false, `leyó un regateo en "${t}"`);
      assert.strictEqual(local.pideDescuento(t), false, `leyó un descuento en "${t}"`);
    }
  });

  await check('10. (3) el número del modelo no es un "número chico", y un monto en letras tampoco', () => {
    assert.strictEqual(local.entregaDeNumeroChico('hola quiero el 14 pro', 500000), false, 'el 14 contó como número chico');
    assert.strictEqual(local.entregaDeNumeroChico('hola quiero el iphone 13, tengo lo de la entrega', 500000), false);
    assert.strictEqual(local.entregaDeNumeroChico('hola quiero el 14 pro, tengo quinientos', 500000), false);
    assert.strictEqual(local.entregaDeNumeroChico('para el 13 cuento con trescientos cincuenta', 350000), false);
    assert.strictEqual(local.entregaDeNumeroChico('tengo quinientos, en 2 semanas paso', 500000), false, 'el monto en letras no cortó la regla');
    // Los de la tanda anterior siguen.
    assert.strictEqual(local.entregaDeNumeroChico('para el mes que viene tengo, eso de 10 o 11', 1100000), true);
    assert.strictEqual(local.entregaDeNumeroChico('quiero el 14 pro, tengo 5', 500000), true);
    assert.strictEqual(local.entregaDeNumeroChico('hasta el domingo tenia 78', 78000), true);
  });

  await check('11. (4) del 11 al 18 como fecha, edad u hora no es un modelo', () => {
    for (const t of ['tengo 18 años', 'cobro el 18 y paso', 'me pagan el 15', 'te pago el 12', 'pago el 16', 'hasta el 15 no puedo', 'el dia 15 paso', 'a partir del 15', 'a partir de los 18', 'el 18 de octubre', 'a las 16', 'en 12 cuotas', 'tipo 17 hs', 'a eso de las 13 horas', '18hrs']) {
      assert.deepStrictEqual(local.extraerModelos(t), [], `leyó un modelo en "${t}"`);
    }
    assert.deepStrictEqual(local.extraerModelos('me interesa el 13 o el 14, cobro el 18 y paso'), ['13', '14']);
    for (const [t, m] of [['tenes el 13?', '13'], ['el 15?', '15'], ['iphone 18', '18'], ['el 18 pro max', '18 pro max'], ['tenes el 18?', '18'], ['hasta el 14 pro', '14 pro']]) {
      assert.deepStrictEqual(local.extraerModelos(t), [m], `no leyó el ${m} en "${t}"`);
    }
  });

  await check('12. (5b) el estado de WhatsApp, los detalles del pago, otras marcas y "más nuevo" no son el estado del equipo', () => {
    for (const t of ['vi en tu estado el 15 pro, cuanto esta?', 'vi tu estado', 'lo subiste al estado?', 'me pasas los detalles de la financiacion?', 'detalles de pago?', 'trabajan otras marcas o solo iphone?', 'y algo mas nuevo tenes?', 'son nuevos los precios?', 'la capacidad de pago?']) {
      assert.strictEqual(local.preguntaPorEstado(t), false, `"${t}" contó como el estado del equipo`);
    }
    for (const t of ['tenes usados?', 'hay nuevos?', 'sellados tenes?', 'precio del 16 sellado?', 'de cuantos gb es?', 'cuanta bateria tiene?', 'te quedan 16 sellados?', 'en que estado esta?', 'tiene marcas?']) {
      assert.strictEqual(local.preguntaPorEstado(t), true, `"${t}" dejó de ser el estado del equipo`);
    }
  });

  await check('13. (5c) canje en curso y "es de 128 con 85% de batería, ¿cuánto me das?": guarda los datos y escala', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'te dejo mi 12 en parte de pago para el 13'));
    assert.ok(delChat(chat).permutaDatosPedidos, 'el caso no prueba nada: no pidió los datos del canje');
    limpiar();
    await bot.procesar(escrito(chat, 'es de 128 con 85% de bateria, cuanto me das?'));
    const p = delChat(chat).permuta || {};
    assert.strictEqual(p.capacidad_gb, 128, 'no guardó la capacidad: ' + JSON.stringify(p));
    assert.strictEqual(p.bateria, 85, 'no guardó la batería: ' + JSON.stringify(p));
    assert.deepStrictEqual(aEste(chat), [], 'le contestó al cliente: ' + JSON.stringify(aEste(chat)));
    assert.ok(/mandó los datos del equipo/.test(alGrupo.join('\n')), 'el aviso no dice que mandó los datos:\n' + alGrupo.join('\n'));
  });

  await check('14. (6) canje del 12 en curso y "¿y el 15?": no pisa el modelo del canje ni escala por los datos', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'te dejo mi 12 en parte de pago para el 13'));
    assert.strictEqual((delChat(chat).permuta || {}).modelo, '12', 'el caso no prueba nada: el canje no es del 12');
    limpiar();
    await bot.procesar(escrito(chat, 'y el 15?'));
    assert.strictEqual((delChat(chat).permuta || {}).modelo, '12', 'pisó el modelo del canje: ' + JSON.stringify(delChat(chat).permuta));
    assert.ok(!/mandó los datos del equipo/.test(alGrupo.join('\n')), 'escaló como datos del canje:\n' + alGrupo.join('\n'));
  });

  await check('15. (9) "en cuánto tiempo", "en cuánto abren", "en cuánto llega" y "en cuántos días" no preguntan el precio', () => {
    for (const t of ['dale, en cuanto tiempo me lo podes tener?', 'en cuanto abren?', 'en cuanto llega?', 'en cuantos dias lo tenes?']) {
      assert.strictEqual(preguntaPrecio(t), false, `"${t}" contó como pregunta de precio`);
    }
    for (const t of ['mas o menos en cuanto?', 'en cuanto esta el 13?', 'cuanto sale?']) {
      assert.strictEqual(preguntaPrecio(t), true, `"${t}" dejó de ser pregunta de precio`);
    }
  });

  await check('16. (10) llegó al local: solo una llegada o una salida de ahora', () => {
    for (const t of ['ya salgo', 'dale, ya salgo para alla', 'estoy saliendo', 'ya estoy', 'ya estoy!', 'llegué', 'estoy llegando', 'estoy afuera', 'en 5 minutos estoy', 'yendo', 'ya voy, estoy en camino', 'voy yendo para alla']) {
      assert.strictEqual(local.llegoAlLocal(t), true, `"${t}" no contó como que llega`);
    }
    for (const t of ['el sabado ya voy', 'mañana paso', 'ya sali del laburo, mañana paso', 'me estoy yendo a trabajar, despues te escribo', 'como vas yendo?', 'ya voy juntando la plata', 'la plata ya esta en camino', 'a las 18 ya salgo']) {
      assert.strictEqual(local.llegoAlLocal(t), false, `"${t}" contó como que llega`);
    }
  });

  await check('17. (12) hablaDeSuPlata da lo mismo dos veces seguidas y no le cambia el monto a extraerMonto', () => {
    assert.strictEqual(local.hablaDeSuPlata('mejor 800?'), true);
    assert.strictEqual(local.hablaDeSuPlata('mejor 800?'), true, 'la segunda vez dio distinto (lastIndex)');
    assert.strictEqual(local.extraerMonto('tengo 400. perdon 500'), 500000);
    // La corrección lejos del principio deja el lastIndex más allá del largo del mensaje que sigue.
    assert.strictEqual(local.hablaDeSuPlata('para el 14 pro que me dijiste, en realidad serian 500'), true);
    assert.strictEqual(local.extraerMonto('tengo 400. perdon 500'), 500000, 'extraerMonto cambió después de hablaDeSuPlata');
  });

  // El pedido de descuento no pasa por D5 (verificación de Claude, 30/09/2026): desde el 30/09 cada
  // pedido recibe "el precio es ese", sin escalar (decisión de Tomás), y con tres variantes el
  // cuarto ya repetía una y D5 lo dejaba sin respuesta y escalado.
  await check('18. descuento seis veces seguidas: cada pedido tiene su respuesta y ninguno escala por repetido', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'tenes el 13?'));
    assert.ok(aEste(chat).length > 0, 'el caso no prueba nada: no contestó');
    const pedidos = ['me haces un descuento?', 'dale, me haces un descuento?', 'un descuentito mas?', 'dale haceme un descuento', 'me haces precio?', 'no me lo dejas mas barato?'];
    for (const [i, t] of pedidos.entries()) {
      limpiar();
      await bot.procesar(escrito(chat, t));
      assert.ok(aEste(chat).length > 0, `el pedido ${i + 1} no tuvo respuesta; al grupo: ` + alGrupo.join(' | '));
      assert.ok(!/no sé cómo seguir/.test(alGrupo.join('\n')), `el pedido ${i + 1} escaló por repetido`);
    }
  });

  console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo OK\n');
  setTimeout(() => process.exit(fallos ? 1 : 0), 50);
})();
