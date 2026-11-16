'use strict';
/**
 * Control humano y modos, con Sonnet y Evolution de mentira (poda de iPhone, 19/10/2026):
 *   1. una persona de la cuenta escribe: el bot se calla SILENCIO_TRAS_HUMANO_MIN (no le pregunta a Sonnet);
 *      vencido el silencio, el barrido contesta lo que quedó sin respuesta;
 *   2. #pausa / #sigue (en el chat y desde el grupo, #sigue contesta lo pendiente vía Sonnet) / #reset (de
 *      la cuenta y del tester);
 *   3. el escalado callado y su recordatorio al grupo;
 *   4. escucha, borrador y listas: no sale nada a quien no corresponde;
 *   5. #apagar / #prender;
 *   6. "Enseguida te respondemos." (Tomás y Fran, 16/11/2026): el único mensaje que el código le manda al cliente
 *      al escalar, una vez por escalado y con los candados de siempre.
 *
 *   node test/piedra-control.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, config, sonnet, aClientes, alGrupo, mensaje, propio, enElGrupo, state, jid, eventos, check } = p;
const control = require('../src/control');

// El texto exacto que decidieron Tomás y Fran (16/11/2026). Escrito a mano, a propósito.
const AVISO_ESCALADO = 'Enseguida te respondemos.';

let n = 500;
const nuevo = () => `54900000${String(++n).padStart(5, '0')}`;
const MIN = 60 * 1000;

/** Corre `enElMedio()` mientras Sonnet "piensa" su próximo pedido (una sola vez) y después `correr()`. */
async function mientrasSonnetPiensa(enElMedio, correr) {
  const real = globalThis.fetch;
  let hecho = false;
  globalThis.fetch = async (...args) => {
    if (!hecho) {
      hecho = true;
      await enElMedio();
    }
    return real(...args);
  };
  try {
    await correr();
  } finally {
    globalThis.fetch = real;
  }
}

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
    // Lo primero es el mensaje fijo del escalado de antes del #reset.
    assert.deepStrictEqual(aClientes.map((m) => m.texto), [AVISO_ESCALADO, 'hola de nuevo']);
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
    // El mensaje fijo salió una sola vez: lo que escribe con el chat ya escalado no lo repite.
    assert.deepStrictEqual(aClientes, [{ numero: jid(num), texto: AVISO_ESCALADO }]);
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

  console.log('\n"Enseguida te respondemos." al escalar (16/11/2026)\n');

  await check('el eco de "Enseguida te respondemos." no cuenta como una persona: el chat sigue escalado y no entra al historial', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pide envío a Plottier'));
    await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    const [entrega] = eventos(num, 'entrega');
    assert.ok(entrega && entrega.id, 'no quedó la entrega con su id');
    // El eco del envío vuelve por el webhook como un mensaje propio, con el id que devolvió Evolution.
    await bot.procesar(propio(num, AVISO_ESCALADO, { id: entrega.id }));
    const s = state.todos()[jid(num)];
    assert.strictEqual(s.escalado, true, 'el eco del mensaje fijo tomó el chat');
    assert.ok(!s.ultimoHumano, 'el eco contó como una persona');
    // No es una línea del historial (como el "🔄 Reiniciado"): lo último sigue siendo lo que dejó escrito el cliente.
    assert.deepStrictEqual(s.historial.map((l) => [l.quien, l.texto]), [['cliente', 'hacen envios a plottier?']]);
    // Tampoco cuenta como un mensaje del bot para #vendido / #perdido.
    assert.ok(!s.botEnvio, 'el mensaje fijo quedó anotado como un envío del bot');
  });

  await check('si el aviso al grupo no salió, al cliente no le sale nada (y el chat no queda escalado)', async () => {
    const num = nuevo();
    const grupo = config.grupoAvisos;
    config.grupoAvisos = '';
    try {
      sonnet.guion(sonnet.escala('pide envío a Plottier'));
      await bot.procesar(mensaje(num, 'hacen envios?'));
    } finally {
      config.grupoAvisos = grupo;
    }
    assert.deepStrictEqual(alGrupo, [], 'el caso no prueba nada: el aviso salió');
    assert.deepStrictEqual(aClientes, []);
    assert.ok(!state.todos()[jid(num)].escalado);
  });

  await check('Sonnet falla (no calla): al cliente nada; cuando después escala de verdad, ahí sale, una vez', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.falla(500), sonnet.falla(500));
    await bot.procesar(mensaje(num, 'hola'));
    assert.deepStrictEqual(aClientes, [], 'salió el mensaje fijo con un escalado que no calla');
    assert.strictEqual(state.todos()[jid(num)].escaladoCalla, false);
    p.limpiar();
    sonnet.guion(sonnet.escala('pide envío a Plottier'));
    await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    assert.deepStrictEqual(aClientes, [{ numero: jid(num), texto: AVISO_ESCALADO }]);
    assert.strictEqual(state.todos()[jid(num)].escaladoCalla, true);
  });

  await check('#sigue y el mismo motivo dentro de la ventana: no sale de nuevo; con un escalado nuevo, sí', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pide envío a Plottier'));
    await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), [AVISO_ESCALADO]);
    p.limpiar();
    // #sigue reactiva y contesta lo que dejó escrito: Sonnet vuelve a escalar por lo mismo.
    sonnet.guion(sonnet.escala('pide envío a Plottier'));
    await bot.procesar(propio(num, '#sigue'));
    assert.strictEqual(sonnet.pedidos.length, 1, '#sigue no le contestó lo que dejó escrito');
    assert.deepStrictEqual(alGrupo, [], 'repitió el aviso del mismo motivo');
    assert.deepStrictEqual(aClientes, [], 'repitió el mensaje fijo con el mismo motivo');
    p.limpiar();
    // Otro motivo, con el chat ya reactivado: es un escalado nuevo.
    sonnet.guion(sonnet.escala('pregunta cuánto sale el envío'));
    await bot.procesar(mensaje(num, 'y cuanto sale el envio?'));
    assert.strictEqual(alGrupo.length, 1);
    assert.deepStrictEqual(aClientes.map((m) => m.texto), [AVISO_ESCALADO]);
  });

  await check('si el chat quedó escalado y callado mientras Sonnet pensaba, el mensaje fijo no sale de nuevo', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pide envío a Plottier'));
    await mientrasSonnetPiensa(
      async () => control.escalar(jid(num), 'otra cosa', { calla: true }),
      () => bot.procesar(mensaje(num, 'hacen envios?'))
    );
    assert.strictEqual(alGrupo.length, 1, 'el aviso al grupo no depende del escalado: tiene que salir');
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(state.todos()[jid(num)].escaladoMotivo, 'otra cosa', 'pisó el escalado que ya estaba');
    // Lo mismo en borrador: el aviso sale, pero sin el borrador de un mensaje que no iba a salir.
    p.limpiar();
    const otro = nuevo();
    config.modoBorrador = true;
    try {
      sonnet.guion(sonnet.escala('pide envío a Plottier'));
      await mientrasSonnetPiensa(
        async () => control.escalar(jid(otro), 'otra cosa', { calla: true }),
        () => bot.procesar(mensaje(otro, 'hacen envios?'))
      );
    } finally {
      config.modoBorrador = false;
    }
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(!/BORRADOR/.test(alGrupo[0]), 'el aviso lleva el borrador de un mensaje que no iba a salir');
  });

  await check('si una persona de la cuenta escribió mientras Sonnet pensaba, el mensaje fijo no sale (ni el "escribiendo…")', async () => {
    const num = nuevo();
    const real = p.evolution.mostrarEscribiendo;
    const escribiendo = [];
    p.evolution.mostrarEscribiendo = async (numero) => {
      escribiendo.push(numero);
    };
    try {
      // El control: en un escalado sin nadie en el medio, el "escribiendo…" se muestra.
      const testigo = nuevo();
      sonnet.guion(sonnet.escala('pide envío a Centenario'));
      await bot.procesar(mensaje(testigo, 'hacen envios a centenario?'));
      assert.deepStrictEqual(escribiendo, [jid(testigo)], 'el caso no prueba nada: no mostró "escribiendo…"');
      p.limpiar();
      sonnet.guion(sonnet.escala('pide envío a Plottier'));
      await mientrasSonnetPiensa(
        () => bot.procesar(propio(num, 'hola! te atiendo yo')),
        () => bot.procesar(mensaje(num, 'hacen envios?'))
      );
    } finally {
      p.evolution.mostrarEscribiendo = real;
    }
    assert.strictEqual(alGrupo.length, 1);
    assert.deepStrictEqual(aClientes, []);
    assert.ok(!escribiendo.includes(jid(num)), 'le mostró "escribiendo…" con una persona ya atendiendo');
  });

  await check('#reset justo cuando está por salir: no sale nada y no es una falla del bot', async () => {
    const num = nuevo();
    const real = p.evolution.mostrarEscribiendo;
    let llego = false;
    p.evolution.mostrarEscribiendo = async (numero) => {
      if (numero !== jid(num)) return;
      llego = true;
      await bot.procesar(propio(num, '#reset'));
    };
    try {
      sonnet.guion(sonnet.escala('pide envío a Plottier'));
      await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    } finally {
      p.evolution.mostrarEscribiendo = real;
    }
    assert.ok(llego, 'el caso no prueba nada: no llegó a la espera de antes del envío');
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(alGrupo.length, 1, 'salió otro aviso además del 🔕: ' + JSON.stringify(alGrupo));
    assert.ok(!state.todos()[jid(num)], 'el #reset no dejó el chat como nuevo');
    // En el registro la tanda queda cortada por el #reset, como cualquier otra (no como una escalada más).
    const silencios = eventos(num, 'silencio');
    assert.ok(silencios.some((e) => e.motivo === 'corte' && e.detalle === '#reset'), JSON.stringify(silencios));
    assert.ok(!silencios.some((e) => e.motivo === 'escalo'), 'siguió de largo después del #reset');
  });

  await check('#pausa mientras Sonnet pensaba: el mensaje fijo no sale', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pide envío a Plottier'));
    await mientrasSonnetPiensa(
      () => bot.procesar(propio(num, '#pausa')),
      () => bot.procesar(mensaje(num, 'hacen envios?'))
    );
    assert.deepStrictEqual(aClientes, []);
  });

  await check('#sigue justo cuando está por salir (el chat ya no está escalado): el mensaje fijo no sale', async () => {
    const num = nuevo();
    // El control: sin el #sigue, sale.
    const testigo = nuevo();
    sonnet.guion(sonnet.escala('pide envío a Centenario'));
    await bot.procesar(mensaje(testigo, 'hacen envios a centenario?'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), [AVISO_ESCALADO], 'el caso no prueba nada: sin #sigue no salió');
    p.limpiar();
    // El #sigue llega en la espera de antes del envío ("escribiendo…"), con el chat recién escalado.
    const real = p.evolution.mostrarEscribiendo;
    let estabaEscalado = null;
    p.evolution.mostrarEscribiendo = async (numero) => {
      if (numero !== jid(num)) return;
      estabaEscalado = state.todos()[jid(num)].escalado;
      await bot.procesar(propio(num, '#sigue'));
    };
    try {
      sonnet.guion(sonnet.escala('pide envío a Plottier'));
      await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    } finally {
      p.evolution.mostrarEscribiendo = real;
    }
    assert.strictEqual(estabaEscalado, true, 'el caso no prueba nada: el #sigue no llegó con el chat escalado');
    assert.strictEqual(alGrupo.length, 1, 'el 🔕 tiene que haber salido igual');
    assert.strictEqual(state.todos()[jid(num)].escalado, false, 'el #sigue no reactivó el chat');
    assert.deepStrictEqual(aClientes, [], 'le dijo "Enseguida te respondemos." con el chat ya reactivado');
  });

  // Dos candados: el de index.js (el que prueba este caso: el Evolution de mentira no tiene ninguno) y, atrás, el
  // de `evolution.enviarTexto` de verdad.
  await check('#apagar mientras Sonnet pensaba: el mensaje fijo no sale', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pide envío a Plottier'));
    try {
      await mientrasSonnetPiensa(
        () => bot.procesar(enElGrupo('#apagar')),
        () => bot.procesar(mensaje(num, 'hacen envios?'))
      );
    } finally {
      await bot.procesar(enElGrupo('#prender'));
    }
    assert.ok(alGrupo.some((t) => /🔕 SIN RESPUESTA/.test(t)), 'el caso no prueba nada: no escaló');
    assert.deepStrictEqual(aClientes, []);
  });

  await check('si Evolution falla al mandarlo, el chat igual queda escalado y no sale el "⚠️ El bot falló"', async () => {
    const num = nuevo();
    const real = p.evolution.enviarTexto;
    p.evolution.enviarTexto = async () => {
      throw new Error('Evolution 500 en /message/sendText: de mentira');
    };
    try {
      sonnet.guion(sonnet.escala('pide envío a Plottier'));
      await bot.procesar(mensaje(num, 'hacen envios?'));
    } finally {
      p.evolution.enviarTexto = real;
    }
    assert.strictEqual(state.todos()[jid(num)].escalado, true);
    assert.strictEqual(alGrupo.length, 1, 'salió otro aviso además del 🔕: ' + JSON.stringify(alGrupo));
    assert.match(alGrupo[0], /🔕 SIN RESPUESTA/);
    const [entrega] = eventos(num, 'entrega');
    assert.ok(entrega && entrega.error && entrega.origen === 'escalado', 'no quedó la entrega con su error');
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'escalo'));
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

  await check('escalar en borrador: al cliente nada; "Enseguida te respondemos." va al grupo marcado BORRADOR', async () => {
    const num = nuevo();
    config.modoBorrador = true;
    try {
      sonnet.guion(sonnet.escala('pide envío a Plottier'));
      await bot.procesar(mensaje(num, 'hacen envios a plottier?'));
    } finally {
      config.modoBorrador = false;
    }
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(alGrupo.length, 1);
    assert.match(alGrupo[0], /🔕 SIN RESPUESTA/);
    assert.match(alGrupo[0], /pide envío a Plottier/);
    assert.match(alGrupo[0], /— BORRADOR, no se envió —\nEnseguida te respondemos\.$/);
    assert.ok(!state.todos()[jid(num)].escalado, 'en borrador el chat no queda escalado');
    assert.deepStrictEqual(eventos(num, 'entrega'), []);
  });

  await check('en borrador, si Sonnet falla (no calla) el aviso no lleva el borrador del mensaje fijo', async () => {
    const num = nuevo();
    config.modoBorrador = true;
    try {
      sonnet.guion(sonnet.falla(500), sonnet.falla(500));
      await bot.procesar(mensaje(num, 'hola'));
    } finally {
      config.modoBorrador = false;
    }
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(alGrupo.length, 1);
    assert.match(alGrupo[0], /Sonnet no pudo contestar/);
    assert.ok(!/BORRADOR|Enseguida/.test(alGrupo[0]), 'el aviso de una falla lleva el mensaje fijo');
  });

  await check('escalar fuera de las listas: a ese número no le llega; va al grupo marcado BORRADOR. Al piloto sí le llega', async () => {
    const piloto = nuevo();
    const otro = nuevo();
    config.numerosPiloto.splice(0, config.numerosPiloto.length, piloto);
    try {
      sonnet.guion(sonnet.escala('pide envío a Plottier'), sonnet.escala('pide envío a Centenario'));
      await bot.procesar(mensaje(otro, 'hacen envios a plottier?'));
      await bot.procesar(mensaje(piloto, 'hacen envios a centenario?'));
    } finally {
      config.numerosPiloto.splice(0);
    }
    assert.deepStrictEqual(aClientes, [{ numero: jid(piloto), texto: AVISO_ESCALADO }]);
    assert.strictEqual(alGrupo.length, 2);
    assert.match(alGrupo[0], /pide envío a Plottier[\s\S]*— BORRADOR, no se envió —\nEnseguida te respondemos\.$/);
    assert.ok(!/BORRADOR/.test(alGrupo[1]), 'el aviso del piloto dice que fue un borrador');
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
