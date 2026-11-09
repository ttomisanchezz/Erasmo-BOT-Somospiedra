'use strict';
/**
 * Quién contesta y qué sale, con Sonnet de mentira (poda de iPhone, 19/10/2026). A través de index.js
 * (`procesar`), con la API de Anthropic y Evolution de mentira (test/piedra-ayuda.js):
 *   1. CEREBRO_MODO: apagado no llama a la API ni manda nada; sombra piensa y no manda; tester le
 *      contesta solo al tester; todos, a cualquiera.
 *   2. El pedido: solo `responder` y `escalar`, las reglas de Piedra, sin el número del cliente.
 *   3. `responder` sale al cliente (tope de 4 mensajes de 300 como máximo, del 4º en adelante juntos).
 *   4. Cualquier monto frena: Sonnet tiene una vuelta para corregir; si vuelve a frenar, escala callado.
 *   5. `escalar`: al cliente nada, 🔕 al grupo, el chat queda callado y lo que sigue no llama a Sonnet.
 *   6. Sonnet falla (500, timeout, sin clave): silencio con el cliente y aviso al grupo, sin respaldo.
 *   7. Lo que ya se le dijo no se repite: si todo es repetido, escala.
 *
 *   node test/piedra-sonnet.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, config, sonnet, aClientes, alGrupo, mensaje, state, jid, eventos, check } = p;

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
    await check(`un monto ${nombre} ("${texto}"): frena dos veces y escala callado, al cliente nada`, async () => {
      const num = nuevo();
      sonnet.guion(sonnet.responde([texto]), sonnet.responde([texto]));
      await bot.procesar(mensaje(num, 'cuanto sale?'));
      assert.deepStrictEqual(aClientes, [], 'salió un monto');
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
    assert.deepStrictEqual(aClientes, []);
    assert.match(alGrupo[0], /promete que otra persona/);
  });

  await check('nombrar algo interno o prometer fotos frena', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['lo escalo al grupo']), sonnet.responde(['te paso unas fotos']));
    await bot.procesar(mensaje(num, 'hola'));
    assert.deepStrictEqual(aClientes, []);
    assert.match(alGrupo[0], /archivo/);
  });

  console.log('\nescalar\n');

  await check('escalar: al cliente nada, 🔕 al grupo con el motivo, y lo que sigue queda callado sin llamar a Sonnet', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pregunta si hacen envíos a Plottier'));
    await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(alGrupo.length, 1);
    assert.match(alGrupo[0], /🔕 SIN RESPUESTA/);
    assert.match(alGrupo[0], /pregunta si hacen envíos a Plottier/);
    assert.match(alGrupo[0], new RegExp(`wa.me/${num}`));
    assert.strictEqual(state.todos()[jid(num)].escalado, true);
    p.limpiar();
    await bot.procesar(mensaje(num, 'hola??'));
    assert.strictEqual(sonnet.pedidos.length, 0, 'le preguntó a Sonnet con el chat escalado');
    assert.deepStrictEqual(aClientes, []);
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
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola! que tal']);
    assert.match(alGrupo[0], /ya se lo dije/);
  });

  p.fin();
})();
