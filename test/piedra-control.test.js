'use strict';
/**
 * Control humano y modos, con Sonnet y Evolution de mentira (poda de iPhone, 19/10/2026):
 *   1. una persona de la cuenta escribe: el bot se calla SILENCIO_TRAS_HUMANO_MIN (no le pregunta a Sonnet);
 *      vencido el silencio, el barrido contesta lo que quedó sin respuesta;
 *   2. #pausa / #sigue (en el chat y desde el grupo, #sigue contesta lo pendiente vía Sonnet) / #reset (de
 *      la cuenta y del tester);
 *   3. el escalado callado y su recordatorio al grupo;
 *   4. escucha, borrador y listas: no sale nada a quien no corresponde;
 *   5. #apagar / #prender.
 *
 *   node test/piedra-control.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, config, sonnet, aClientes, alGrupo, mensaje, propio, enElGrupo, state, jid, eventos, check } = p;

let n = 500;
const nuevo = () => `54900000${String(++n).padStart(5, '0')}`;
const MIN = 60 * 1000;

(async () => {
  console.log('\nUna persona atendiendo\n');

  await check('escribió una persona de la cuenta: el bot se calla (no le pregunta a Sonnet)', async () => {
    const num = nuevo();
    await bot.procesar(propio(num, 'hola! que andas buscando?'));
    await p.dormir(3);
    await bot.procesar(mensaje(num, 'laja para el patio'));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(aClientes, []);
    assert.deepStrictEqual(alGrupo, []);
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'persona'));
  });

  await check('vencido el silencio de la persona, el barrido le contesta lo que quedó (vía Sonnet)', async () => {
    const num = nuevo();
    await bot.procesar(propio(num, 'hola! que andas buscando?'));
    await p.dormir(3);
    await bot.procesar(mensaje(num, 'laja para el patio, cuanto sale?'));
    // Como si la persona hubiera escrito hace 46 minutos y el cliente un minuto después.
    const s = state.todos()[jid(num)];
    state.actualizar(jid(num), { ultimoHumano: Date.now() - 46 * MIN });
    s.historial[0].ts = Date.now() - 46 * MIN;
    s.historial[1].ts = Date.now() - 45 * MIN;
    sonnet.porDefecto = sonnet.escala('pregunta precio de laja');
    let tomados;
    try {
      tomados = await bot.revisarSilencios({ ahora: Date.now() });
    } finally {
      sonnet.porDefecto = null;
    }
    assert.ok(tomados.includes(jid(num)), 'el barrido no lo tomó: ' + JSON.stringify(tomados));
    assert.ok(sonnet.pedidos.some((x) => JSON.stringify(x.body).includes('laja para el patio')), 'pedidos: ' + sonnet.pedidos.length + ' grupo: ' + JSON.stringify(alGrupo));
    assert.ok(alGrupo.some((t) => t.includes(num) && /pregunta precio de laja/.test(t)));
    // El mismo barrido no lo vuelve a tomar.
    p.limpiar();
    assert.ok(!(await bot.revisarSilencios({ ahora: Date.now() })).includes(jid(num)), 'lo volvió a tomar');
  });

  console.log('\n#pausa, #sigue y #reset\n');

  await check('#pausa en el chat: el bot no contesta hasta #sigue; #sigue le contesta lo que dejó escrito', async () => {
    const num = nuevo();
    await bot.procesar(propio(num, '#pausa'));
    await bot.procesar(mensaje(num, 'hola, tienen piedra bola?'));
    assert.strictEqual(sonnet.pedidos.length, 0, 'contestó con el chat pausado');
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'pausado'));
    sonnet.guion(sonnet.responde(['hola! si, tenemos']));
    await bot.procesar(propio(num, '#sigue'));
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola! si, tenemos']);
    assert.strictEqual(state.todos()[jid(num)].pausado, false);
  });

  await check('#pausa y #sigue desde el grupo, con el número: el cliente no ve el comando', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['hola!']));
    await bot.procesar(mensaje(num, 'hola'));
    p.limpiar();
    await bot.procesar(enElGrupo(`#pausa ${num}`));
    assert.match(alGrupo[0], /⏸️ Pausado/);
    assert.strictEqual(state.todos()[jid(num)].pausado, true);
    await bot.procesar(mensaje(num, 'y laja?'));
    assert.strictEqual(sonnet.pedidos.length, 0);
    sonnet.guion(sonnet.responde(['tenemos laja']));
    await bot.procesar(enElGrupo(`#sigue ${num}`));
    assert.match(alGrupo[1], /▶️ Reactivado/);
    assert.match(alGrupo[1], /le contesto lo que dejó escrito/);
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['tenemos laja']);
  });

  await check('#reset de la cuenta: el chat queda como nuevo', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('algo'));
    await bot.procesar(mensaje(num, 'hola'));
    assert.strictEqual(state.todos()[jid(num)].escalado, true);
    await bot.procesar(propio(num, '#reset'));
    assert.ok(!state.todos()[jid(num)], 'no borró el chat');
    sonnet.guion(sonnet.responde(['hola de nuevo']));
    await bot.procesar(mensaje(num, 'hola'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola de nuevo']);
  });

  await check('#reset del tester: reinicia y le confirma; otro # del tester se descarta', async () => {
    const tester = nuevo();
    config.numerosTester.splice(0, config.numerosTester.length, tester);
    try {
      sonnet.guion(sonnet.responde(['hola!']));
      await bot.procesar(mensaje(tester, 'hola'));
      p.limpiar();
      await bot.procesar(mensaje(tester, '#resset'));
      assert.ok(!state.todos()[jid(tester)] || !(state.todos()[jid(tester)].historial || []).length, 'no reinició el chat');
      assert.deepStrictEqual(aClientes.map((m) => m.texto), ['🔄 Reiniciado']);
      await bot.procesar(mensaje(tester, '#otracosa'));
      assert.strictEqual(sonnet.pedidos.length, 0);
    } finally {
      config.numerosTester.splice(0);
    }
  });

  console.log('\nEscalado callado y su recordatorio\n');

  await check('escalado: lo que escribe después queda callado y a los 30 min sale un solo ⏰ al grupo', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('quiere hablar con alguien'));
    await bot.procesar(mensaje(num, 'quiero hablar con alguien'));
    await p.dormir(3);
    await bot.procesar(mensaje(num, 'hola??'));
    assert.strictEqual(sonnet.pedidos.length, 1);
    p.limpiar();
    await bot.revisarEscalados(Date.now() + 31 * MIN);
    const recordatorio = alGrupo.find((t) => t.includes(num));
    assert.ok(recordatorio, 'no salió el recordatorio');
    assert.match(recordatorio, /⏰ ESCALADO SIN TOMAR/);
    assert.match(recordatorio, /hola\?\?/);
    p.limpiar();
    await bot.revisarEscalados(Date.now() + 40 * MIN);
    assert.ok(!alGrupo.some((t) => t.includes(num)), 'el recordatorio salió dos veces');
  });

  await check('una persona que escribe en un chat escalado lo toma: queda resuelto', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('algo'));
    await bot.procesar(mensaje(num, 'hola'));
    await bot.procesar(propio(num, 'hola! te ayudo yo'));
    assert.strictEqual(state.todos()[jid(num)].escalado, false);
  });

  console.log('\nEscucha, borrador y listas\n');

  await check('escucha: no sale nada, ni al cliente ni al grupo (tampoco el 🔕)', async () => {
    const num = nuevo();
    config.modoEscucha = true;
    try {
      sonnet.guion(sonnet.responde(['hola!']));
      await bot.procesar(mensaje(num, 'hola'));
      sonnet.guion(sonnet.escala('algo'));
      await bot.procesar(mensaje(num, 'hola?'));
    } finally {
      config.modoEscucha = false;
    }
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.deepStrictEqual(aClientes, []);
    assert.deepStrictEqual(alGrupo, []);
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'escucha'));
  });

  await check('borrador: al cliente nada, el borrador va al grupo', async () => {
    const num = nuevo();
    config.modoBorrador = true;
    try {
      sonnet.guion(sonnet.responde(['hola! que buscabas?']));
      await bot.procesar(mensaje(num, 'hola'));
    } finally {
      config.modoBorrador = false;
    }
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(alGrupo.length, 1);
    assert.match(alGrupo[0], /BORRADOR, no se envió/);
    assert.match(alGrupo[0], /hola! que buscabas\?/);
  });

  await check('listas: con un piloto cargado, a otro número no le llega nada (borrador al grupo)', async () => {
    const piloto = nuevo();
    const otro = nuevo();
    config.numerosPiloto.splice(0, config.numerosPiloto.length, piloto);
    try {
      sonnet.guion(sonnet.responde(['hola piloto']), sonnet.responde(['hola otro']));
      await bot.procesar(mensaje(piloto, 'hola'));
      await bot.procesar(mensaje(otro, 'hola'));
    } finally {
      config.numerosPiloto.splice(0);
    }
    assert.deepStrictEqual(aClientes.map((m) => [m.numero, m.texto]), [[jid(piloto), 'hola piloto']]);
    assert.ok(alGrupo.some((t) => /BORRADOR/.test(t) && t.includes('hola otro')));
  });

  console.log('\n#apagar / #prender\n');

  await check('#apagar: nadie contesta (no llama a Sonnet); #prender vuelve', async () => {
    const num = nuevo();
    await bot.procesar(enElGrupo('#apagar'));
    assert.match(alGrupo[0], /Bot APAGADO/);
    await bot.procesar(mensaje(num, 'hola'));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(aClientes, []);
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'apagada'));
    await bot.procesar(enElGrupo('#prender'));
    sonnet.guion(sonnet.responde(['hola!']));
    await bot.procesar(mensaje(num, 'hola?'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola!']);
  });

  console.log('\n/salud\n');

  await check('/salud: Piedra, la instancia, el modo del cerebro y el hash de las reglas, sin campos de iPhone', async () => {
    const s = await bot.datosDeSalud();
    assert.strictEqual(s.negocio, 'Somos Piedra');
    assert.strictEqual(s.instancia, 'somospiedra');
    assert.strictEqual(s.cerebro.modo, config.cerebro.modo);
    assert.match(s.cerebro.reglas, /^[0-9a-f]{8}$/);
    const json = JSON.stringify(s);
    assert.ok(!/listaBateria|bateria|panel|chiara|stockApp|planilla|"lista"/i.test(json), 'trae campos de iPhone: ' + json);
  });

  p.fin();
})();
