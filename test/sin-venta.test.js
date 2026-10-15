'use strict';
/**
 * Crédito de mensajes sin venta, comando #reset, y que un audio claro dispare
 * la respuesta normal.
 *
 *   node test/sin-venta.test.js
 *
 * El crédito NO es un filtro por contenido: "hola" de un cliente nuevo y "che
 * como andas" de un conocido son iguales en el primer mensaje. Lo que los
 * separa es que el cliente dice algo de venta enseguida. Por eso se cuenta.
 */
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
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.AUDIO_ACTIVO = 'true';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-sinventa-' + Date.now() + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-sinventa-' + Date.now() + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
// `alEntender` corre mientras se interpreta la tanda: ahí se simula un mensaje nuevo
// del cliente que llega antes de que salga la respuesta.
let alEntender = null;
let lecturas = 0;
gemini.entender = async (h, m) => {
  lecturas++;
  if (alEntender) {
    const fn = alEntender;
    alEntender = null;
    fn();
  }
  return local.entender(m);
};
let transcripcion = 'hola, tenes el iphone 13? tengo 350.000';
gemini.transcribir = async () => transcripcion;
evolution.base64DeMedia = async () => ({ base64: 'AAAA', mimetype: 'audio/ogg' });

const aClientes = [];
const alGrupo = [];
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
// `sinId`: Evolution contesta sin el id del mensaje, como cuando el envío no llegó.
let sinId = false;
const respuestaEvolution = (numero) =>
  sinId
    ? {}
    : {
        key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
      };
evolution.enviarTexto = async (numero, texto) => {
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
const aprendizaje = require('../src/aprendizaje');

let fallos = 0;
function check(nombre, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('  ok   ' + nombre))
    .catch((e) => {
      fallos++;
      console.log('  FALLA ' + nombre + ' -> ' + e.message);
    });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
let n = 0;
const nuevoChat = () => '54911000' + String(n++).padStart(4, '0') + '@s.whatsapp.net';
const escrito = (chatId, texto, fromMe = false) => ({
  key: { remoteJid: chatId, fromMe, id: 'T' + Math.random() },
  pushName: 'Ailin',
  message: { conversation: texto },
});
const notaDeVoz = (chatId) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'A' + Math.random() },
  pushName: 'Ailin',
  message: { audioMessage: { mimetype: 'audio/ogg', seconds: 5, ptt: true } },
});

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  lecturas = 0;
}

(async () => {
  console.log('\nCliente nuevo: no se lo pierde\n');

  await check('un "hola" de alguien nuevo SÍ recibe respuesta', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    await dormir(200);
    assert.ok(aClientes.length > 0, 'no le contestó a un cliente nuevo que saluda');
  });

  await check('saluda, charla un poco y recién al 3er mensaje pregunta: se le contesta', async () => {
    const chat = nuevoChat();
    for (const m of ['hola', 'buenas como andan', 'tenes iphone 13?']) {
      limpiar();
      await bot.procesar(escrito(chat, m));
      await dormir(200);
      assert.ok(aClientes.length > 0, 'se calló antes de tiempo con: ' + m);
    }
    const todo = aClientes.map((x) => x.texto).join(' ');
    assert.ok(/495\.000/.test(todo), 'no llegó a cotizar el modelo que preguntó');
  });

  console.log('\nChat sin ninguna señal de venta\n');

  await check('a los 5 mensajes sin señal deja de contestar', async () => {
    const chat = nuevoChat();
    const charla = ['hola', 'como va', 'todo bien?', 'que haces', 'jaja', 'dale', 'nada'];
    const contesto = [];
    const seCallo = [];
    for (const m of charla) {
      limpiar();
      await bot.procesar(escrito(chat, m));
      await dormir(180);
      contesto.push(aClientes.length > 0);
      seCallo.push(alGrupo.some((a) => a.startsWith('🤐')));
    }
    // Del 3ro al 5to escala por "no entiendo" (callar: false). Antes le contestaba
    // "dejame confirmarte eso bien y te aviso"; desde la Mejora 1 escala sin mensaje,
    // así que lo que se mira es que el crédito se corte recién en el 6to.
    assert.ok(contesto[0] && contesto[1], 'tendría que contestar los primeros');
    assert.deepStrictEqual(seCallo.indexOf(true), 5, 'el crédito tendría que cortarse en el 6to: ' + JSON.stringify(seCallo));
    assert.ok(!contesto[5], 'el 6to mensaje sin señal tendría que quedar sin respuesta');
    assert.ok(!contesto[6], 'el 7mo tampoco');
  });

  await check('avisa que se calló UNA sola vez, con el link', async () => {
    const chat = nuevoChat();
    const avisosDeSilencio = [];
    for (const m of ['hola', 'que tal', 'ahi ando', 'jaja', 'si', 'bueno', 'chau', 'ah']) {
      limpiar();
      await bot.procesar(escrito(chat, m));
      await dormir(180);
      // El chat puede escalar antes por "no entiendo", que es otro aviso y
      // está bien que salga. Acá se cuenta solo el de haberse callado.
      avisosDeSilencio.push(...alGrupo.filter((a) => a.startsWith('🤐')));
    }
    assert.strictEqual(
      avisosDeSilencio.length,
      1,
      'avisó ' + avisosDeSilencio.length + ' veces que se calló, tendría que ser una'
    );
    assert.ok(/wa\.me/.test(avisosDeSilencio[0]), 'el aviso no trae el link para contestarle');
    assert.ok(
      /sin ninguna señal de venta/.test(avisosDeSilencio[0]),
      'el aviso no dice por qué se calló'
    );
  });

  await check('callarse no es lo que marca el chat como escalado', async () => {
    const chat = nuevoChat();
    for (const m of ['hola', 'que tal', 'ahi ando', 'jaja', 'si']) {
      await bot.procesar(escrito(chat, m));
      await dormir(150);
    }
    // Foto del estado justo antes del mensaje que lo hace callar
    const escaladoAntes = Boolean(state.todos()[chat].escalado);

    limpiar();
    await bot.procesar(escrito(chat, 'bueno'));
    await dormir(180);

    const s = state.todos()[chat];
    assert.ok(s.calladoPorNoVenta, 'no se calló: el caso no prueba nada');
    assert.strictEqual(
      Boolean(s.escalado),
      escaladoAntes,
      'el hecho de callarse cambió la marca de escalado'
    );
  });

  await check('si después dice algo de venta, vuelve a contestar', async () => {
    const chat = nuevoChat();
    for (const m of ['hola', 'que tal', 'ahi ando', 'jaja', 'si', 'bueno', 'chau']) {
      await bot.procesar(escrito(chat, m));
      await dormir(150);
    }
    limpiar();
    await bot.procesar(escrito(chat, 'che, tenes iphone 13?'));
    await dormir(250);
    const todo = aClientes.map((x) => x.texto).join(' ');
    assert.ok(aClientes.length > 0, 'no revivió el chat cuando apareció una señal de venta');
    assert.ok(/495\.000/.test(todo), 'revivió pero no cotizó: ' + todo.slice(0, 100));
  });

  console.log('\nnoEntendido y sinVenta cuentan solo si el mensaje le llegó (Pendientes 2)\n');

  // Decisión de Tomás del 21/09/2026. Los dos contadores se escribían al decidir: en
  // escucha, en borrador (hoy lo son todos los clientes reales, por las listas de
  // prueba) o con una tanda cortada contaban igual. Un cliente real con dos mensajes
  // raros quedaba escalado sin haber recibido nunca el "contame que estabas buscando", y
  // una tanda cortada que se reencola sumaba `sinVenta` dos veces por los mismos mensajes.
  // Ahora viajan como marcas en el PRIMER mensaje de la respuesta y se confirman con el
  // id de Evolution en la mano. Los turnos donde el bot no manda nada (el segundo "no
  // entendí", que escala callado) siguen sumando al decidir, como siempre.
  const noEntiende = (avisos) => avisos.filter((a) => /no se entienden|no entiendo/.test(a));

  await check('en borrador, dos mensajes raros seguidos no escalan: la pregunta nunca le llegó', async () => {
    const chat = nuevoChat();
    config.modoBorrador = true;
    try {
      limpiar();
      await bot.procesar(escrito(chat, 'asdasd'));
      await bot.procesar(escrito(chat, 'qwrtyp'));
      await dormir(100);
    } finally {
      config.modoBorrador = false;
    }
    const s = state.todos()[chat];
    assert.strictEqual(aClientes.length, 0, 'el caso no prueba nada: en borrador le escribió al cliente');
    assert.deepStrictEqual(noEntiende(alGrupo), [], 'avisó que no entiende a un cliente que nunca recibió la pregunta');
    assert.ok(!s.escalado, 'quedó escalado');
    assert.ok(!s.noEntendido, 'dejó la marca noEntendido sin que la pregunta saliera: ' + JSON.stringify(s.noEntendido));
    assert.ok(!s.sinVenta, 'sumó sinVenta sin haberle contestado nada: ' + s.sinVenta);
    const borradores = alGrupo.filter((a) => /BORRADOR/.test(a) && /contame que estabas buscando/i.test(a));
    assert.strictEqual(borradores.length, 2, 'los dos borradores tenían que ser la pregunta: ' + JSON.stringify(alGrupo).slice(0, 300));
  });

  await check('en vivo, igual que siempre: el primero pregunta y el segundo escala', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'asdasd'));
    await dormir(100);
    assert.ok(aClientes.some((m) => /contame que estabas buscando/i.test(m.texto)), 'no preguntó con el primero');
    let s = state.todos()[chat];
    assert.ok(s.noEntendido && s.noEntendido.texto === 'asdasd', 'la pregunta salió y no confirmó noEntendido: ' + JSON.stringify(s.noEntendido));
    assert.strictEqual(s.sinVenta, 1, 'la pregunta salió y sinVenta quedó en ' + s.sinVenta);
    limpiar();
    await bot.procesar(escrito(chat, 'qwrtyp'));
    await dormir(100);
    s = state.todos()[chat];
    assert.strictEqual(aClientes.length, 0, 'el segundo tenía que escalar callado');
    assert.strictEqual(s.escalado, true, 'con dos seguidos no escaló');
    assert.strictEqual(noEntiende(alGrupo).length, 1, 'no avisó al grupo: ' + JSON.stringify(alGrupo));
    // El bot no mandó nada en ese turno: suma al decidir, como siempre.
    assert.strictEqual(s.sinVenta, 2, 'el turno que escala callado dejó de sumar: ' + s.sinVenta);
  });

  await check('envío fallido (Evolution contesta sin id): no cuenta, y el segundo mensaje raro no escala', async () => {
    const chat = nuevoChat();
    limpiar();
    sinId = true;
    try {
      await bot.procesar(escrito(chat, 'asdasd'));
      await dormir(100);
    } finally {
      sinId = false;
    }
    let s = state.todos()[chat];
    assert.ok(aClientes.length > 0, 'el caso no prueba nada: no intentó mandar la pregunta');
    assert.ok(!s.noEntendido, 'confirmó noEntendido con un envío sin id: ' + JSON.stringify(s.noEntendido));
    assert.ok(!s.sinVenta, 'sumó sinVenta con un envío sin id: ' + s.sinVenta);
    limpiar();
    await bot.procesar(escrito(chat, 'qwrtyp'));
    await dormir(100);
    s = state.todos()[chat];
    assert.ok(!s.escalado, 'escaló aunque la primera pregunta no le había llegado');
    assert.ok(aClientes.some((m) => /contame que estabas buscando/i.test(m.texto)), 'no volvió a preguntar');
  });

  await check('tanda cortada por un mensaje nuevo y reencolada: sinVenta suma una vez, no dos', async () => {
    const chat = nuevoChat();
    limpiar();
    // Mientras se interpreta "hola" llega "como va": la respuesta no sale, las líneas
    // vuelven a la cola y la tanda siguiente contesta las dos juntas.
    alEntender = () => bot.procesar(escrito(chat, 'como va')).catch((e) => console.error(e));
    await bot.procesar(escrito(chat, 'hola'));
    await dormir(150);
    const s = state.todos()[chat];
    assert.ok(aClientes.length > 0, 'el caso no prueba nada: la tanda reencolada no contestó');
    assert.strictEqual(lecturas, 2, 'el caso no prueba nada: no se interpretó dos veces (no hubo corte): ' + lecturas);
    assert.strictEqual(s.sinVenta, 1, `contó ${s.sinVenta} por los mismos mensajes`);
  });

  await check('con señal de venta sinVenta vuelve a 0 en el momento, salga o no la respuesta', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    await dormir(100);
    assert.strictEqual(state.todos()[chat].sinVenta, 1, 'el caso no prueba nada: el saludo no sumó');
    config.modoBorrador = true;
    try {
      await bot.procesar(escrito(chat, 'tenes el iphone 13?'));
      await dormir(100);
    } finally {
      config.modoBorrador = false;
    }
    assert.strictEqual(state.todos()[chat].sinVenta, 0, 'no volvió a 0 con una señal de venta');
  });

  console.log('\nComando #reset\n');

  await check('#reset deja el chat como nuevo', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'quiero un iphone 13 y tengo 350.000'));
    await dormir(250);
    assert.ok(state.todos()[chat], 'el chat tendría que existir antes del reset');
    assert.ok(state.todos()[chat].modelo, 'tendría que haber guardado el modelo');

    await bot.procesar(escrito(chat, '#reset', true));
    await dormir(50);
    assert.ok(!state.todos()[chat], 'el chat sigue en el estado después del #reset');
  });

  await check('#reset no entra al aprendizaje ni se procesa como venta', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'hola tenes el 13?'));
    await dormir(250);
    state.actualizar(chat, { ultimoBot: Date.now() - 60000 });

    const antes = aprendizaje.leerTodo().length;
    limpiar();
    await bot.procesar(escrito(chat, '#reset', true));
    await dormir(50);

    assert.strictEqual(aprendizaje.leerTodo().length, antes, 'el #reset quedó en el aprendizaje');
    assert.strictEqual(aClientes.length, 0, 'el #reset le mandó algo al cliente');
  });

  await check('después del #reset el cliente arranca de cero', async () => {
    const chat = nuevoChat();
    await bot.procesar(escrito(chat, 'quiero un 16 pro y tengo 500.000'));
    await dormir(250);
    await bot.procesar(escrito(chat, '#reset', true));
    await dormir(50);

    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    await dormir(200);
    const todo = aClientes.map((x) => x.texto).join(' ');
    assert.ok(aClientes.length > 0, 'no contestó después del reset');
    assert.ok(!/16 Pro/.test(todo), 'se acordó del modelo viejo: ' + todo.slice(0, 120));
    assert.ok(!/anotado/.test(todo), 'repitió la frase del chat anterior');
  });

  console.log('\nAudio claro dispara la respuesta normal\n');

  await check('un audio con una consulta real cotiza, no repite nada', async () => {
    const chat = nuevoChat();
    transcripcion = 'hola, tenes el iphone 13? tengo 350.000';
    limpiar();
    await bot.procesar(notaDeVoz(chat));
    await dormir(300);
    const todo = aClientes.map((x) => x.texto).join(' ');
    assert.ok(aClientes.length > 0, 'el audio no disparó ninguna respuesta');
    // Cotiza el 13 con los $350.000 del audio. Hasta Ajustes 1 se miraba el contado
    // ($495.000), que la cotización ya no muestra.
    assert.ok(/📱 \*iPhone 13\b/.test(todo) && /350\.000/.test(todo) && /1 pago de/.test(todo), 'el audio no se procesó como consulta: ' + todo.slice(0, 120));
  });

  await check('un audio pidiendo la lista manda la lista', async () => {
    const chat = nuevoChat();
    transcripcion = 'hola, me pasas el stock de precios?';
    limpiar();
    await bot.procesar(notaDeVoz(chat));
    await dormir(300);
    const todo = aClientes.map((x) => x.texto).join(' ');
    assert.ok(/Ip 13/.test(todo), 'no mandó la lista: ' + todo.slice(0, 120));
  });

  console.log('\nRegresión: la respuesta repetida\n');

  await check('pedir la lista gana sobre el modelo que se venía hablando', async () => {
    const chat = nuevoChat();
    // Ya se le dijo dos veces la entrega inicial del 16 Pro (bloque 5b): el próximo
    // mensaje sin nada nuevo iría a la alternativa ("te lo dejo anotado").
    state.actualizar(chat, {
      nombre: 'Tomas',
      modelo: 'iPhone 16 Pro',
      entrega: 500000,
      insistenciaEntrega: { 'iPhone 16 Pro': 2 },
    });
    limpiar();
    await bot.procesar(escrito(chat, 'hola rey como estas? me pasas stock de precios'));
    await dormir(250);
    const todo = aClientes.map((x) => x.texto).join(' ');
    assert.ok(/Ip 13/.test(todo), 'no mandó la lista, cotizó el modelo viejo: ' + todo.slice(0, 120));
    assert.ok(!/anotado/.test(todo), 'repitió la frase del modelo viejo');
  });

  await check('la frase de "te lo dejo anotado" no se repite', async () => {
    const chat = nuevoChat();
    state.actualizar(chat, {
      nombre: 'Tomas',
      modelo: 'iPhone 16 Pro',
      entrega: 500000,
      insistenciaEntrega: { 'iPhone 16 Pro': 2 },
    });
    limpiar();
    await bot.procesar(escrito(chat, 'buneas'));
    await dormir(250);
    const primera = aClientes.map((x) => x.texto).join(' ');
    assert.ok(/anotado/.test(primera), 'el caso no prueba nada: no dijo la frase ni una vez');

    limpiar();
    await bot.procesar(escrito(chat, 'hola'));
    await dormir(250);
    const segunda = aClientes.map((x) => x.texto).join(' ');
    assert.ok(!/anotado/.test(segunda), 'REPITIÓ la frase: ' + segunda.slice(0, 120));
    assert.ok(!/📱|1 pago de/.test(segunda), 'volvió a cotizar lo mismo');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
