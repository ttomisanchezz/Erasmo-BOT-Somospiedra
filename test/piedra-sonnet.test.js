'use strict';
/**
 * Quién contesta y qué sale, con Sonnet de mentira (poda de iPhone, 19/10/2026). A través de index.js
 * (`procesar`), con la API de Anthropic y Evolution de mentira (test/piedra-ayuda.js):
 *   1. CEREBRO_MODO: apagado no llama a la API ni manda nada; sombra piensa y no manda; tester le
 *      contesta solo al tester; todos, a cualquiera.
 *   2. El pedido: solo `responder` y `escalar`, las reglas de Piedra, sin el número del cliente.
 *   3. `responder` sale al cliente (tope de 4 mensajes de 300 como máximo, del 4º en adelante juntos).
 *   4. Cualquier monto frena: Sonnet tiene una vuelta para corregir; si vuelve a frenar, escala callado.
 *   5. `escalar`: al cliente UNA vez el mensaje fijo "Enseguida te respondemos." (lo manda el código; Tomás y
 *      Fran, 16/11/2026), 🔕 al grupo, el chat queda callado y lo que sigue no llama a Sonnet ni lo repite.
 *   6. Sonnet falla (500, timeout, sin clave): silencio con el cliente y aviso al grupo, sin respaldo.
 *   7. Lo que ya se le dijo no se repite: si todo es repetido, escala.
 *   8. Una pregunta que ya hizo en el chat no se repite: sale lo demás, sin la pregunta (11/11/2026).
 *
 *   node test/piedra-sonnet.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, config, sonnet, aClientes, alGrupo, mensaje, state, jid, eventos, check } = p;

// El único mensaje que el código le manda al cliente cuando le pasa el chat al equipo (16/11/2026). Va escrito
// acá a mano, a propósito: es el texto exacto que decidieron Tomás y Fran.
const AVISO_ESCALADO = 'Enseguida te respondemos.';

let n = 100;
const nuevo = () => `54900000${String(++n).padStart(5, '0')}`;

(async () => {
  console.log('\nQuién contesta (CEREBRO_MODO)\n');

  await check('apagado: no llama a Sonnet, no manda nada y queda el silencio "cerebro-apagado"', async () => {
    config.cerebro.modo = 'apagado';
    const num = nuevo();
    sonnet.porDefecto = sonnet.responde(['hola!']);
    await bot.procesar(mensaje(num, 'hola, tienen laja?'));
    assert.strictEqual(sonnet.pedidos.length, 0, 'llamó a la API con apagado');
    assert.deepStrictEqual(aClientes, []);
    assert.deepStrictEqual(alGrupo, []);
    assert.strictEqual(state.todos()[jid(num)].historial.length, 1, 'no guardó el mensaje');
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'cerebro-apagado'));
    sonnet.porDefecto = null;
  });

  await check('apagado: un audio que no se entendió tampoco escala (solo escucha)', async () => {
    config.cerebro.modo = 'apagado';
    const num = nuevo();
    await bot.procesar(mensaje(num, '', { message: { audioMessage: { seconds: 3 } } }));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(alGrupo, []);
    assert.deepStrictEqual(aClientes, []);
  });

  await check('sombra: Sonnet piensa y se anota, no le manda nada a nadie', async () => {
    config.cerebro.modo = 'sombra';
    const num = nuevo();
    sonnet.guion(sonnet.responde(['hola, te paso la info']));
    await bot.procesar(mensaje(num, 'hola, cuanto sale la laja?'));
    await p.esperar(() => eventos(num, 'propuesta-sonnet').length > 0);
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.deepStrictEqual(aClientes, []);
    assert.deepStrictEqual(alGrupo, []);
    const prop = eventos(num, 'propuesta-sonnet')[0];
    assert.deepStrictEqual(prop.mensajes, ['hola, te paso la info']);
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'sombra'));
  });

  await check('tester: le contesta al tester y no a otro número (ese queda en sombra)', async () => {
    config.cerebro.modo = 'tester';
    const tester = nuevo();
    const otro = nuevo();
    config.numerosTester.splice(0, config.numerosTester.length, tester);
    try {
      sonnet.guion(sonnet.responde(['hola! que tal']), sonnet.responde(['esto no sale']));
      await bot.procesar(mensaje(tester, 'hola'));
      await bot.procesar(mensaje(otro, 'hola'));
      await p.esperar(() => sonnet.pedidos.length === 2);
      assert.deepStrictEqual(aClientes.map((m) => [m.numero, m.texto]), [[jid(tester), 'hola! que tal']]);
    } finally {
      config.numerosTester.splice(0);
    }
  });

  await check('todos: le contesta a cualquiera', async () => {
    config.cerebro.modo = 'todos';
    const num = nuevo();
    sonnet.guion(sonnet.responde(['hola!']));
    await bot.procesar(mensaje(num, 'hola'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola!']);
  });

  console.log('\nEl pedido\n');

  await check('solo responder y escalar, con las reglas de Piedra y sin el número del cliente', async () => {
    config.cerebro.modo = 'todos';
    const num = nuevo();
    sonnet.guion(sonnet.escala('pregunta precio'));
    await bot.procesar(mensaje(num, 'hola, cuanto sale la piedra bola?'));
    const body = sonnet.pedidos[0].body;
    assert.deepStrictEqual(body.tools.map((t) => t.name).sort(), ['agendar_seguimiento', 'buscar_productos', 'cotizar', 'escalar', 'mandar_catalogo', 'responder']);
    assert.match(body.system[0].text, /Somos Piedra/);
    assert.ok(!/iphone|chiara|canje|bater|techsur|icloud/i.test(body.system[0].text), 'las reglas traen algo de iPhone');
    const texto = sonnet.textoDelPedido(0);
    assert.match(texto, /cuanto sale la piedra bola/);
    assert.ok(!texto.includes(num), 'el pedido lleva el número del cliente');
  });

  console.log('\nresponder: lo que sale\n');

  await check('tope de 4 mensajes: del 4º en adelante van juntos en el 4º', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['uno', 'dos', 'tres', 'cuatro', 'cinco']));
    await bot.procesar(mensaje(num, 'hola'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['uno', 'dos', 'tres', 'cuatro\ncinco']);
  });

  await check('un mensaje de más de 300 caracteres frena; corregido, sale', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['a'.repeat(301)]), sonnet.responde(['corto']));
    await bot.procesar(mensaje(num, 'hola'));
    assert.strictEqual(sonnet.pedidos.length, 2, 'no le dio la vuelta para corregir');
    const correccion = sonnet.pedidos[1].body.messages.at(-1).content[0];
    assert.strictEqual(correccion.is_error, true);
    assert.match(correccion.content, /301 caracteres/);
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['corto']);
  });

  console.log('\nCualquier monto frena\n');

  for (const [nombre, texto] of [
    ['con $', 'sale $15.000 el m2'],
    ['en miles', 'son 15 mil la bolsa'],
    ['4 cifras peladas', 'te queda en 15000'],
    ['con k', 'sale 20k'],
  ]) {
    await check(`un monto ${nombre} ("${texto}"): frena dos veces y escala callado, al cliente solo "Enseguida te respondemos."`, async () => {
      const num = nuevo();
      sonnet.guion(sonnet.responde([texto]), sonnet.responde([texto]));
      await bot.procesar(mensaje(num, 'cuanto sale?'));
      assert.deepStrictEqual(aClientes.map((m) => m.texto), [AVISO_ESCALADO], 'salió un monto');
      assert.strictEqual(alGrupo.length, 1);
      assert.match(alGrupo[0], /🔕 SIN RESPUESTA/);
      assert.match(alGrupo[0], /guardia: .*monto/);
      assert.strictEqual(state.todos()[jid(num)].escalado, true);
    });
  }

  await check('un año suelto o una dirección no son montos', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['estamos desde 2019', 'el local queda en San Martín 3090']));
    await bot.procesar(mensaje(num, 'donde estan?'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['estamos desde 2019', 'el local queda en San Martín 3090']);
  });

  await check('un monto frenado y corregido sin monto: sale lo corregido', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['sale $9.000']), sonnet.responde(['hola! dame un momento']));
    await bot.procesar(mensaje(num, 'cuanto sale?'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola! dame un momento']);
    assert.match(sonnet.pedidos[1].body.messages.at(-1).content[0].content, /monto/);
  });

  console.log('\nLas promesas y lo interno\n');

  await check('prometer que otra persona lo contacta frena (y si insiste, escala)', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['ahora te escribe fran']), sonnet.responde(['ahora te escribe fran']));
    await bot.procesar(mensaje(num, 'hola'));
    // La promesa de Sonnet no sale; lo único que recibe es el mensaje fijo del código al escalar.
    assert.deepStrictEqual(aClientes.map((m) => m.texto), [AVISO_ESCALADO]);
    assert.match(alGrupo[0], /promete que otra persona/);
  });

  await check('nombrar algo interno o prometer fotos frena', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['lo escalo al grupo']), sonnet.responde(['te paso unas fotos']));
    await bot.procesar(mensaje(num, 'hola'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), [AVISO_ESCALADO]);
    assert.match(alGrupo[0], /archivo/);
  });

  console.log('\nescalar\n');

  await check('escalar: al cliente UNA vez "Enseguida te respondemos.", 🔕 al grupo con el motivo, y lo que sigue queda callado sin llamar a Sonnet', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pregunta si hacen envíos a Plottier'));
    await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    assert.deepStrictEqual(aClientes, [{ numero: jid(num), texto: AVISO_ESCALADO }]);
    assert.strictEqual(alGrupo.length, 1);
    assert.match(alGrupo[0], /🔕 SIN RESPUESTA/);
    assert.match(alGrupo[0], /pregunta si hacen envíos a Plottier/);
    assert.match(alGrupo[0], new RegExp(`wa.me/${num}`));
    assert.strictEqual(state.todos()[jid(num)].escalado, true);
    // Queda en el registro como una entrega del código ('escalado'), con el id de Evolution y el de su tanda.
    const entregas = eventos(num, 'entrega');
    assert.deepStrictEqual(entregas.map((e) => [e.origen, e.formato, e.texto]), [['escalado', 'texto', AVISO_ESCALADO]]);
    assert.ok(entregas[0].id, 'la entrega no lleva el id de Evolution');
    assert.strictEqual(entregas[0].tanda, eventos(num, 'propuesta')[0].tanda, 'la entrega no lleva la tanda que escaló');
    p.limpiar();
    await bot.procesar(mensaje(num, 'hola??'));
    assert.strictEqual(sonnet.pedidos.length, 0, 'le preguntó a Sonnet con el chat escalado');
    assert.deepStrictEqual(aClientes, [], 'repitió el mensaje con el chat ya escalado');
    assert.deepStrictEqual(alGrupo, []);
  });

  console.log('\nSonnet falla: silencio y aviso al grupo\n');

  for (const [nombre, paso, motivo] of [
    ['error 500', sonnet.falla(500), /error 500/],
    ['timeout', sonnet.timeout(), /timeout/],
  ]) {
    await check(`${nombre}: al cliente nada, 🔕 al grupo "Sonnet no pudo contestar"`, async () => {
      const num = nuevo();
      sonnet.guion(paso, paso);
      await bot.procesar(mensaje(num, 'hola'));
      assert.deepStrictEqual(aClientes, []);
      assert.strictEqual(alGrupo.length, 1);
      assert.match(alGrupo[0], /🔕 SIN RESPUESTA/);
      assert.match(alGrupo[0], /Sonnet no pudo contestar/);
      assert.match(alGrupo[0], motivo);
      const fallo = eventos(num, 'propuesta-sonnet').find((e) => e.enVivo);
      assert.ok(fallo && fallo.error, 'no quedó el error en el registro');
      assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'sonnet-no-pudo'));
    });
  }

  await check('sin ANTHROPIC_API_KEY: no sale a la red, silencio y aviso', async () => {
    const num = nuevo();
    const clave = config.cerebro.apikey;
    config.cerebro.apikey = '';
    try {
      await bot.procesar(mensaje(num, 'hola'));
    } finally {
      config.cerebro.apikey = clave;
    }
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(aClientes, []);
    assert.match(alGrupo[0], /falta la clave/);
  });

  await check('después de una falla, el siguiente mensaje se vuelve a intentar (el chat no queda callado)', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.falla(500), sonnet.falla(500));
    await bot.procesar(mensaje(num, 'hola'));
    p.limpiar();
    sonnet.guion(sonnet.responde(['hola! que tal']));
    await bot.procesar(mensaje(num, 'hola?'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola! que tal']);
  });

  console.log('\nRepetidos\n');

  await check('lo que ya le llegó no se repite; si todo es repetido, escala', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['hola! que tal']), sonnet.responde(['hola! que tal']));
    await bot.procesar(mensaje(num, 'hola'));
    await bot.procesar(mensaje(num, 'hola'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola! que tal', AVISO_ESCALADO]);
    assert.match(alGrupo[0], /ya se lo dije/);
  });

  console.log('\nUna pregunta se hace una sola vez por chat\n');

  await check('una pregunta que ya hizo no se repite: sale lo demás, sin la pregunta', async () => {
    const num = nuevo();
    sonnet.guion(
      sonnet.responde(['Lo necesitabas para el patio, el frente o una pared? Así te oriento mejor.']),
      sonnet.responde(['Por ahora no tenemos cuotas, con tarjeta es en un pago.', 'Lo necesitabas para el patio, el frente o una pared?']),
      sonnet.responde(['Dale! ¿Lo necesitabas para el patio, el frente o una pared? Contame y lo vemos.'])
    );
    await bot.procesar(mensaje(num, 'hola'));
    await bot.procesar(mensaje(num, 'hay cuotas?'));
    await bot.procesar(mensaje(num, 'ok'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), [
      'Lo necesitabas para el patio, el frente o una pared? Así te oriento mejor.',
      'Por ahora no tenemos cuotas, con tarjeta es en un pago.',
      'Dale! Contame y lo vemos.',
    ]);
  });
  await check('el pedido le dice a Sonnet qué preguntas ya hizo en el chat (para que no las repita con otras palabras)', async () => {
    const num = nuevo();
    sonnet.guion(
      sonnet.responde(['Hola, buen día! Cómo estás? Espero que bien.', 'Lo necesitabas para el patio, el frente o una pared? Así te oriento mejor.']),
      sonnet.responde(['Dale.'])
    );
    await bot.procesar(mensaje(num, 'hola'));
    assert.match(sonnet.textoDelPedido(0), /Preguntas que ya le hiciste en este chat[^\n]*\n- ninguna/);
    await bot.procesar(mensaje(num, 'hay cuotas?'));
    const texto = sonnet.textoDelPedido(1);
    assert.match(texto, /Preguntas que ya le hiciste en este chat[^\n]*\n- Lo necesitabas para el patio, el frente o una pared\?\n/);
    assert.ok(!/\n- Cómo estás\?/.test(texto), 'la del saludo no va en la lista');
    assert.ok(texto.indexOf('Preguntas que ya le hiciste') < texto.indexOf('Lo que escribió ahora el cliente'), 'va antes de lo que escribió el cliente');
  });
  await check('una pregunta nueva sale, y la del saludo ("Cómo estás?") no cuenta como repetida', async () => {
    const num = nuevo();
    sonnet.guion(
      sonnet.responde(['Hola, buen día! Cómo estás? Espero que bien.', 'Calculaste los m² que necesitás cubrir?']),
      sonnet.responde(['Buenas! Cómo estás? Te cuento.', 'Lo retirás por el local o necesitás envío?'])
    );
    await bot.procesar(mensaje(num, 'hola'));
    await bot.procesar(mensaje(num, 'buenas'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto).slice(2), ['Buenas! Cómo estás? Te cuento.', 'Lo retirás por el local o necesitás envío?']);
  });
  await check('sacar la pregunta repetida no toca los montos ni los saltos de línea; si era lo único, el mensaje no sale', async () => {
    const salida = require('../src/salida');
    const chat = jid(nuevo());
    state.agregarAlHistorial(chat, 'vendedor', 'Dale. Lo retirás por el local o necesitás envío?', { id: 'X1' });
    assert.deepStrictEqual(
      salida.sinLoYaDicho(chat, [
        'Con tarjeta te queda en $945.000. Lo retirás por el local o necesitás envío?',
        'Uno\nDos. ¿Lo retiras por el local, o necesitas envio?\nTres.',
        'Lo retirás por el local o necesitás envío?',
        'Y para cuándo lo necesitás?',
      ]),
      ['Con tarjeta te queda en $945.000.', 'Uno\nDos.\nTres.', 'Y para cuándo lo necesitás?']
    );
  });
  await check('una pregunta de un envío que no se confirmó no cuenta como hecha', async () => {
    const salida = require('../src/salida');
    const chat = jid(nuevo());
    state.agregarAlHistorial(chat, 'vendedor', 'Lo retirás por el local o necesitás envío?', { sinConfirmar: true });
    assert.deepStrictEqual(salida.sinLoYaDicho(chat, ['Dale. Lo retirás por el local o necesitás envío?']), ['Dale. Lo retirás por el local o necesitás envío?']);
  });

  p.fin();
})();
