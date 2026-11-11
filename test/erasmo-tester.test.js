'use strict';
/**
 * Erasmo en modo tester (09/11/2026), de punta a punta con Sonnet y Evolution de mentira (sin red):
 *  - CEREBRO_MODO=tester: Sonnet le contesta SOLO al número tester; el resto, nadie (cero llamadas a la API);
 *  - cotizar + responder: el monto sale de la herramienta y la guardia lo deja pasar; queda en el registro y en la ficha;
 *  - el catálogo en PDF sale DESPUÉS de los textos, por el mismo camino (el eco no calla el chat), una vez cada 24 h;
 *  - el seguimiento se anota solo si la respuesta salió, y ese día sale UN aviso al grupo;
 *  - los avisos al grupo de afuera de la franja (9 a 20) se juntan y salen en un solo mensaje;
 *  - los candados de evolution.enviarDocumento (escucha, borrador, listas, excluidos).
 */
const fs = require('fs');
const path = require('path');
const TESTER = '5492994295806';
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'tester', NUMEROS_TESTER: TESTER });
const assert = require('assert');
const { check, fin, bot, state, config, cerebro, sonnet, aClientes, alGrupo, mensaje, propio, jid, evolution, eventos, real } = p;
const herr = require('../src/herramientas-erasmo');
const { armarCatalogo } = require('../src/catalogo-piedra');
const seguimiento = require('../src/seguimiento');
const avisosCola = require('../src/avisos-cola');

herr.usarCatalogoDelPanel(async () => armarCatalogo([{ PRODUCTO: 'Adoquines ojito', EFECTIVO: '78000.00', LISTA: '90000.00', UNIDAD: 'm2' }]));
fs.mkdirSync(process.env.DOCS_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'Catalogo-Somos-Piedra-2026_3.pdf'), '%PDF-1.4 de mentira');

// El documento: se anota qué id le devolvió Evolution a cada envío (para el eco).
const documentos = [];
let idDoc = 0;
evolution.enviarDocumento = async (numero) => {
  const key = { remoteJid: numero, fromMe: true, id: 'DOC' + ++idDoc };
  documentos.push(key.id);
  aClientes.push({ numero, texto: '[documento]' });
  return { key };
};

const hoy = herr.hoyArgentina(Date.now());
const enDias = (n) => new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const nuevo = (() => { let n = 7000; return () => `54900009${String(++n).padStart(5, '0')}`; })();
const deTester = () => {
  state.reiniciar(jid(TESTER));
  return TESTER;
};
const alCliente = (num) => aClientes.filter((m) => m.numero === jid(num)).map((m) => m.texto);

(async () => {
  console.log('quién atiende con CEREBRO_MODO=tester');
  await check('el tester: Sonnet le contesta', async () => {
    const num = deTester();
    sonnet.guion(sonnet.responde(['Hola, ¿cómo estás?']));
    await bot.procesar(mensaje(num, 'hola'));
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.deepStrictEqual(alCliente(num), ['Hola, cómo estás?']);
  });
  await check('cualquier otro chat: nadie (se escucha y se guarda, CERO llamadas a la API, nada sale)', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['no debería salir']));
    await bot.procesar(mensaje(num, 'hola, tienen laja?'));
    await bot.procesar(mensaje(num, 'cuánto sale?'));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(alCliente(num), []);
    assert.deepStrictEqual(alGrupo, []);
    assert.ok(state.todos()[jid(num)].historial.length >= 2, 'no guardó lo que escribió');
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'cerebro-apagado'));
  });
  await check('un chat real marcado atiendeSonnet:true de otra época tampoco llama a Sonnet; el tester marcado false, nadie', async () => {
    const num = nuevo();
    state.actualizar(jid(num), { atiendeSonnet: true });
    assert.strictEqual(cerebro.quienAtiende(jid(num)), 'nadie');
    await bot.procesar(mensaje(num, 'hola'));
    assert.strictEqual(sonnet.pedidos.length, 0);
    const t = deTester();
    assert.strictEqual(cerebro.quienAtiende(jid(t)), 'sonnet');
    state.actualizar(jid(t), { atiendeSonnet: false });
    assert.strictEqual(cerebro.quienAtiende(jid(t)), 'nadie');
  });
  await check('sombra y nuevos siguen como siempre; apagado, nadie', async () => {
    const modo = config.cerebro.modo;
    deTester(); // la prueba anterior lo dejó marcado con #bot
    try {
      const otro = jid(nuevo());
      const tester = jid(TESTER);
      for (const [m, esperado] of [['sombra', ['sombra', 'sombra']], ['nuevos', ['sombra', 'sonnet']], ['todos', ['sonnet', 'sonnet']], ['apagado', ['nadie', 'nadie']], ['tester', ['nadie', 'sonnet']]]) {
        config.cerebro.modo = m;
        assert.deepStrictEqual([cerebro.quienAtiende(otro), cerebro.quienAtiende(tester)], esperado, m);
      }
    } finally {
      config.cerebro.modo = modo;
    }
  });

  await check('la sombra con persona (CEREBRO_SOMBRA_PERSONA_HASTA) no corre en modo tester, aunque el .env tenga fecha', async () => {
    const sombraPersona = require('../src/sombra-persona');
    const modo = config.cerebro.modo;
    const hasta = config.cerebro.sombraPersonaHasta;
    config.cerebro.sombraPersonaHasta = '2099-01-01';
    try {
      config.cerebro.modo = 'todos';
      assert.strictEqual(sombraPersona.activa(), true, 'el control: con todos sí corre');
      config.cerebro.modo = 'tester';
      assert.strictEqual(sombraPersona.activa(), false);
      assert.strictEqual(sombraPersona.anotar(jid(nuevo()), 'x', [{ linea: { texto: 'hola' }, id: 'A1' }], 'persona', 0), false);
    } finally {
      config.cerebro.modo = modo;
      config.cerebro.sombraPersonaHasta = hasta;
    }
  });

  console.log('\ncotizar de punta a punta');
  await check('Sonnet cotiza y responde: el monto sale de la herramienta, queda en el registro y en la ficha', async () => {
    const num = deTester();
    sonnet.guion(
      [sonnet.usar('cotizar', { producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' })],
      sonnet.responde(['Para 10 m² te sale $780.000 en efectivo, sin factura.', '¿Lo querés con factura?'])
    );
    await bot.procesar(mensaje(num, 'cuanto sale el adoquin ojito para 10 m2, pago en efectivo'));
    assert.deepStrictEqual(alCliente(num), ['Para 10 m² te sale $780.000 en efectivo, sin factura.', 'Lo querés con factura?']);
    const pedido2 = sonnet.pedidos[1].body.messages.at(-1).content[0];
    assert.strictEqual(pedido2.type, 'tool_result');
    assert.match(pedido2.content, /\$780\.000/);
    const prop = eventos(num, 'propuesta').at(-1);
    assert.deepStrictEqual(prop.sonnet.herramientas, ['cotizar', 'responder']);
    assert.strictEqual(prop.sonnet.llamadas[0].herramienta, 'cotizar');
    assert.deepStrictEqual(prop.sonnet.llamadas[0].entrada, { producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' });
    assert.ok(prop.sonnet.montos.includes(780000));
    const f = state.todos()[jid(num)].ficha;
    assert.strictEqual(f.pidio.producto, 'Adoquines ojito');
    assert.strictEqual(f.quedo, 'respondió');
  });
  await check('un monto que no salió de cotizar: la guardia frena y Sonnet corrige', async () => {
    const num = deTester();
    sonnet.guion(
      [sonnet.usar('cotizar', { producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' })],
      sonnet.responde(['Te sale $790.000']),
      sonnet.responde(['Te sale $780.000, sin factura.'])
    );
    await bot.procesar(mensaje(num, 'precio adoquin ojito 10 m2 efectivo'));
    assert.deepStrictEqual(alCliente(num), ['Te sale $780.000, sin factura.']);
  });
  await check('cotizar con error (FALTA DATO o un producto que no está): Sonnet escala y el cliente no recibe nada', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('cotizar', { producto: 'Mármol de Carrara', m2: '4' })], sonnet.escala('pide mármol de Carrara, no está en la lista'));
    await bot.procesar(mensaje(num, 'cuanto sale el marmol de carrara 4 m2'));
    assert.deepStrictEqual(alCliente(num), []);
    assert.ok(alGrupo.some((t) => /mármol de Carrara/.test(t)));
    assert.match(state.todos()[jid(num)].ficha.quedo, /^escaló/);
  });

  console.log('\nel catálogo en PDF');
  await check('sale DESPUÉS de los textos; el eco del documento no calla el chat; queda la marca de 24 h', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('mandar_catalogo', {})], sonnet.responde(['Dale, te mando el catálogo para que lo veas.']));
    await bot.procesar(mensaje(num, 'quiero ver las piedras que tienen'));
    assert.deepStrictEqual(alCliente(num), ['Dale, te mando el catálogo para que lo veas.', '[documento]']);
    const s = state.todos()[jid(num)];
    assert.ok(s.catalogoEnviado > Date.now() - 60000);
    assert.ok(s.historial.some((l) => /catálogo en PDF/.test(l.texto)));
    assert.strictEqual(s.ficha.quedo, 'respondió y mandó el catálogo');
    // El eco (fromMe) con el id del envío: es del bot, no una persona de la cuenta.
    await bot.procesar(propio(num, '', { id: documentos.at(-1), message: { documentMessage: { caption: '' } } }));
    assert.ok(!state.todos()[jid(num)].ultimoHumano, 'el eco del PDF contó como una persona y calló el chat');
    assert.ok(!state.humanoActivo(jid(num), 45));
  });
  await check('una vez cada 24 h: la segunda vez la herramienta dice que ya está y no sale; si lo pide de nuevo, sale', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('mandar_catalogo', {})], sonnet.responde(['Te mando el catálogo.']));
    await bot.procesar(mensaje(num, 'mandame el catalogo'));
    assert.strictEqual(alCliente(num).filter((t) => t === '[documento]').length, 1);
    sonnet.guion([sonnet.usar('mandar_catalogo', {})], sonnet.responde(['Dale, cualquier consulta avisanos.']));
    await bot.procesar(mensaje(num, 'gracias, lo miro'));
    assert.strictEqual(alCliente(num).filter((t) => t === '[documento]').length, 1);
    assert.match(sonnet.pedidos[1].body.messages.at(-1).content[0].content, /ya_enviado/);
    sonnet.guion([sonnet.usar('mandar_catalogo', { pidio_de_nuevo: true })], sonnet.responde(['Dale, de nuevo te lo mando.']));
    await bot.procesar(mensaje(num, 'me lo mandás de nuevo? no lo encuentro'));
    assert.strictEqual(alCliente(num).filter((t) => t === '[documento]').length, 2);
  });
  await check('si el turno termina en escalar, el catálogo no sale ni se marca', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('mandar_catalogo', {})], sonnet.escala('pide envío a Cipolletti'));
    await bot.procesar(mensaje(num, 'mandame el catalogo y decime si envian a cipolletti'));
    assert.deepStrictEqual(alCliente(num), []);
    assert.strictEqual(state.todos()[jid(num)].catalogoEnviado, undefined);
  });
  await check('promete el catálogo sin llamar a la herramienta: la guardia lo frena', async () => {
    const num = deTester();
    sonnet.guion(sonnet.responde(['Te mando el catálogo en un rato.']), sonnet.responde(['Dale, contame qué estás buscando.']));
    await bot.procesar(mensaje(num, 'que piedras tienen?'));
    assert.deepStrictEqual(alCliente(num), ['Dale, contame qué estás buscando.']);
    assert.ok(!alCliente(num).includes('[documento]'));
  });
  await check('en borrador, al cliente nada: el borrador va al grupo y dice que llevaba el catálogo', async () => {
    const num = deTester();
    config.modoBorrador = true;
    try {
      sonnet.guion([sonnet.usar('mandar_catalogo', {})], sonnet.responde(['Te mando el catálogo.']));
      await bot.procesar(mensaje(num, 'mandame el catalogo'));
      assert.deepStrictEqual(alCliente(num), []);
      assert.ok(alGrupo.some((t) => /catálogo en PDF/.test(t)));
      assert.strictEqual(state.todos()[jid(num)].catalogoEnviado, undefined);
    } finally {
      config.modoBorrador = false;
    }
  });
  await check('los candados de enviarDocumento (los de verdad): escucha, borrador, fuera de la lista, excluido', async () => {
    const ruta = path.join(process.env.DOCS_DIR, 'Catalogo-Somos-Piedra-2026_3.pdf');
    const probar = (chat) => real.enviarDocumento(jid(chat), ruta, '', 0);
    config.modoEscucha = true;
    assert.strictEqual((await probar(TESTER)).motivo, 'modo escucha');
    config.modoEscucha = false;
    config.modoBorrador = true;
    assert.strictEqual((await probar(TESTER)).motivo, 'modo borrador');
    config.modoBorrador = false;
    assert.strictEqual((await probar('5490000000777')).motivo, 'fuera de la lista de prueba');
    state.guardarExcluido('5490000000778', { desde: Date.now(), nombre: 'x', origen: 'test' });
    config.numerosTester.push('5490000000778');
    try {
      assert.strictEqual((await probar('5490000000778')).motivo, 'contacto personal o excluido');
    } finally {
      config.numerosTester.pop();
      state.borrarExcluido('5490000000778');
    }
    // Un archivo de afuera de documentos/ nunca sale (el candado de carpeta).
    const afuera = path.join(process.env.TMP || require('os').tmpdir(), 'otro.pdf');
    fs.writeFileSync(afuera, '%PDF');
    assert.match((await real.enviarDocumento(jid(TESTER), afuera, '', 0)).motivo, /catálogo|catalogo/);
  });

  console.log('\nel seguimiento');
  await check('se anota SOLO si la respuesta salió: en el chat y en la ficha', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('agendar_seguimiento', { fecha: enDias(15), motivo: 'arranca la obra en 15 días' })], sonnet.responde(['Dale, cualquier consulta avisanos.']));
    await bot.procesar(mensaje(num, 'dentro de 15 días arranco la obra, después te aviso'));
    const s = state.todos()[jid(num)];
    assert.deepStrictEqual({ fecha: s.seguimiento.fecha, motivo: s.seguimiento.motivo, avisado: s.seguimiento.avisado }, { fecha: enDias(15), motivo: 'arranca la obra en 15 días', avisado: false });
    assert.strictEqual(s.ficha.seguimiento.fecha, enDias(15));
    assert.ok(!alCliente(num).some((t) => /escrib|llam|contact/i.test(t)), 'le prometió algo al cliente');
  });
  await check('agendar_seguimiento en la MISMA respuesta que responder también se anota, sin otra vuelta', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('agendar_seguimiento', { fecha: enDias(15), motivo: 'arranca la obra en 15 días' }), sonnet.usar('responder', { mensajes: ['Dale, buenísimo!'] })]);
    await bot.procesar(mensaje(num, 'dale, lo pienso. en 15 días arranco la obra'));
    const s = state.todos()[jid(num)];
    assert.strictEqual(s.seguimiento && s.seguimiento.fecha, enDias(15), 'el seguimiento se perdió');
    assert.deepStrictEqual(alCliente(num), ['Dale, buenísimo!']);
    assert.strictEqual(sonnet.pedidos.length, 1, 'gastó otra vuelta');
    assert.deepStrictEqual(eventos(num, 'propuesta').at(-1).sonnet.herramientas, ['agendar_seguimiento', 'responder']);
  });
  await check('cotizar en la misma respuesta que responder: sus montos valen para esa respuesta; otro monto sigue frenando', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('cotizar', { producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' }), sonnet.usar('responder', { mensajes: ['Para 10 m² te queda en $780.000 en efectivo.'] })]);
    await bot.procesar(mensaje(num, 'cuanto salen 10 m2 de adoquines ojito en efectivo?'));
    assert.deepStrictEqual(alCliente(num), ['Para 10 m² te queda en $780.000 en efectivo.']);
    assert.strictEqual(sonnet.pedidos.length, 1);
    const otro = deTester();
    sonnet.guion(
      [sonnet.usar('cotizar', { producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' }), sonnet.usar('responder', { mensajes: ['Te queda en $750.000 en efectivo.'] })],
      sonnet.responde(['Te queda en $780.000 en efectivo.'])
    );
    await bot.procesar(mensaje(otro, 'cuanto salen 10 m2 de adoquines ojito en efectivo?'));
    assert.deepStrictEqual(alCliente(otro).slice(-1), ['Te queda en $780.000 en efectivo.']);
    assert.strictEqual(sonnet.pedidos.length, 2, 'no frenó el monto que cotizar no devolvió');
    const vuelta = sonnet.pedidos[1].body.messages.at(-1).content;
    assert.strictEqual(vuelta.length, 2, 'cotizar corrió dos veces o faltó un tool_result');
  });
  await check('una herramienta que falla en la misma respuesta que responder: no sale nada hasta que Sonnet ve el error', async () => {
    const num = deTester();
    sonnet.guion(
      [sonnet.usar('agendar_seguimiento', { fecha: '2020-01-01', motivo: 'x' }), sonnet.usar('responder', { mensajes: ['Dale.'] })],
      sonnet.responde(['Dale, buenísimo!'])
    );
    await bot.procesar(mensaje(num, 'en 15 días arranco'));
    assert.strictEqual(sonnet.pedidos.length, 2, 'no le devolvió el error');
    const vuelta = sonnet.pedidos[1].body.messages.at(-1).content;
    assert.strictEqual(vuelta.length, 2);
    assert.ok(vuelta.every((b) => b.type === 'tool_result' && b.is_error === true), JSON.stringify(vuelta));
    assert.deepStrictEqual(alCliente(num), ['Dale, buenísimo!']);
    assert.strictEqual(state.todos()[jid(num)].seguimiento, undefined);
  });
  await check('si el turno escala, no se anota; y la sombra (cerebro.pensar) nunca anota', async () => {
    const num = deTester();
    sonnet.guion([sonnet.usar('agendar_seguimiento', { fecha: enDias(10), motivo: 'x' })], sonnet.escala('pide envío'));
    await bot.procesar(mensaje(num, 'en 10 dias arranco, hacen envios a plottier?'));
    assert.strictEqual(state.todos()[jid(num)].seguimiento, undefined);
    const otro = nuevo();
    sonnet.guion([sonnet.usar('agendar_seguimiento', { fecha: enDias(10), motivo: 'x' })], sonnet.responde(['Dale.']));
    const r = await cerebro.pensar({ chatId: jid(otro), mensaje: 'en 10 dias arranco' });
    assert.strictEqual(r.acciones.seguimiento.fecha, enDias(10));
    assert.strictEqual((state.todos()[jid(otro)] || {}).seguimiento, undefined);
  });
  await check('ese día sale UN aviso al grupo (quién, qué pidió, por qué volver); un seguimiento futuro no', async () => {
    const num = nuevo();
    state.actualizar(jid(num), {
      nombre: 'Marta',
      ficha: { pidio: { producto: 'Granza roja', cantidad: '12', unidad: 'bolsas', pago: 'los dos', factura: false }, anuncio: { id: '123', titulo: 'Granza en oferta' } },
      seguimiento: { fecha: enDias(3), motivo: 'quiere ver si le cierra el presupuesto', creado: Date.now(), avisado: false },
    });
    assert.strictEqual(await seguimiento.avisarLosDeHoy(), 0, 'avisó un seguimiento de dentro de 3 días');
    state.actualizar(jid(num), { seguimiento: { ...state.todos()[jid(num)].seguimiento, fecha: hoy } });
    assert.strictEqual(await seguimiento.avisarLosDeHoy(), 1);
    const aviso = alGrupo.find((t) => /Hoy toca volver a contactar/.test(t));
    assert.ok(aviso && /Marta/.test(aviso) && /Granza roja/.test(aviso) && /cierra el presupuesto/.test(aviso) && /Granza en oferta/.test(aviso) && /wa\.me\//.test(aviso), aviso);
    assert.strictEqual(await seguimiento.avisarLosDeHoy(), 0, 'avisó dos veces');
    assert.deepStrictEqual(alCliente(num), [], 'le escribió al cliente');
  });
  await check('un seguimiento atrasado sale igual (dice para cuándo era); a un excluido no', async () => {
    const num = nuevo();
    state.actualizar(jid(num), { nombre: 'Juan', seguimiento: { fecha: enDias(-2), motivo: 'x', creado: Date.now(), avisado: false } });
    state.guardarExcluido(num, { desde: Date.now(), nombre: 'Juan', origen: 'test' });
    assert.strictEqual(await seguimiento.avisarLosDeHoy(), 0);
    state.borrarExcluido(num);
    assert.strictEqual(await seguimiento.avisarLosDeHoy(), 1);
    assert.ok(alGrupo.some((t) => /era para el/.test(t)));
  });
  await check('fuera de la franja de avisos el seguimiento espera (a las 9 sale)', async () => {
    const num = nuevo();
    state.actualizar(jid(num), { seguimiento: { fecha: hoy, motivo: 'x', creado: Date.now(), avisado: false } });
    const antes = { ...config.avisos };
    Object.assign(config.avisos, { horaDesde: 30, horaHasta: 31 });
    try {
      assert.strictEqual(await seguimiento.avisarLosDeHoy(), 0);
    } finally {
      Object.assign(config.avisos, antes);
    }
    assert.strictEqual(await seguimiento.avisarLosDeHoy(), 1);
  });

  console.log('\nlos avisos al grupo de 9 a 20');
  const AFUERA = { horaDesde: 30, horaHasta: 31 };
  const conFranja = async (franja, fn) => {
    const antes = { ...config.avisos };
    Object.assign(config.avisos, franja);
    try {
      await fn();
    } finally {
      Object.assign(config.avisos, antes);
    }
  };
  await check('la franja es hora de Argentina: 8:59 no, 9:00 sí, 19:59 sí, 20:00 no', async () => {
    const utc = (h, m) => Date.UTC(2026, 10, 9, h + 3, m); // Argentina = UTC-3
    const f = { horaDesde: 9, horaHasta: 20 };
    assert.deepStrictEqual([utc(8, 59), utc(9, 0), utc(19, 59), utc(20, 0), utc(23, 30), utc(3, 0)].map((t) => avisosCola.enFranja(t, f)), [false, true, true, false, false, false]);
    assert.strictEqual(avisosCola.enFranja(utc(3, 0), { horaDesde: 0, horaHasta: 24 }), true);
  });
  await check('afuera de la franja se encola (estado.json) y no sale; con inmediato sale ya', async () => {
    state.guardarColaAvisos([]);
    await conFranja(AFUERA, async () => {
      const r = await real.avisarGrupo('🔕 aviso de la noche 1');
      assert.deepStrictEqual(r, { encolado: true });
      assert.strictEqual((await real.avisarGrupo('🔕 aviso de la noche 2')).encolado, true);
      assert.strictEqual(state.colaAvisos().length, 2);
      // Inmediato: no se encola (en el test la red está cortada: vuelve bloqueado, pero no queda en la cola).
      const inm = await real.avisarGrupo('✅ respuesta a un comando', { inmediato: true });
      assert.ok(!inm.encolado);
      assert.strictEqual(state.colaAvisos().length, 2);
    });
  });
  await check('al abrir la franja salen TODOS juntos en un solo mensaje, y se sacan de la cola solo si salió', async () => {
    const enviados = [];
    // Falla: quedan todos.
    assert.strictEqual(await avisosCola.vaciar(async () => ({ bloqueado: true, motivo: 'Evolution 500' })), 0);
    assert.strictEqual(state.colaAvisos().length, 2);
    // Sale: un solo mensaje con los dos, y la cola queda vacía.
    assert.strictEqual(await avisosCola.vaciar(async (t) => (enviados.push(t), { key: { id: 'GR1' } })), 2);
    assert.strictEqual(enviados.length, 1);
    assert.match(enviados[0], /2 avisos de afuera de horario/);
    assert.ok(enviados[0].includes('aviso de la noche 1') && enviados[0].includes('aviso de la noche 2'));
    assert.deepStrictEqual(state.colaAvisos(), []);
    assert.strictEqual(await avisosCola.vaciar(async () => assert.fail('mandó con la cola vacía')), 0);
  });
  await check('afuera de la franja no se vacía; muchos avisos largos salen en los mínimos mensajes numerados', async () => {
    await conFranja(AFUERA, async () => {
      state.guardarColaAvisos([]);
      for (let i = 0; i < 5; i++) await real.avisarGrupo(`aviso ${i} ` + 'x'.repeat(500));
      assert.strictEqual(await avisosCola.vaciar(async () => assert.fail('salió afuera de la franja')), 0);
    });
    const enviados = [];
    assert.strictEqual(await avisosCola.vaciar(async (t) => (enviados.push(t), { key: { id: 'G' } })), 5);
    assert.ok(enviados.length >= 2 && enviados.length <= 3, 'mensajes: ' + enviados.length);
    assert.ok(enviados.every((t) => /\(\d\/\d\)/.test(t) && t.length < 1700));
    assert.deepStrictEqual(state.colaAvisos(), []);
  });
  await check('la cola sobrevive a un reinicio (está en estado.json) y tiene tope', async () => {
    await conFranja(AFUERA, async () => {
      state.guardarColaAvisos([]);
      await real.avisarGrupo('uno');
      const guardado = JSON.parse(fs.readFileSync(process.env.ESTADO_PATH, 'utf8'));
      assert.strictEqual(guardado['bot:interno'].colaAvisos.length, 1);
      for (let i = 0; i < avisosCola.MAX_COLA + 5; i++) avisosCola.encolar('x' + i);
      assert.strictEqual(state.colaAvisos().length, avisosCola.MAX_COLA);
    });
    state.guardarColaAvisos([]);
  });
  await check('en escucha o sin grupo no se encola nada (el candado de siempre va primero)', async () => {
    await conFranja(AFUERA, async () => {
      state.guardarColaAvisos([]);
      config.modoEscucha = true;
      try {
        assert.strictEqual((await real.avisarGrupo('x')).bloqueado, true);
      } finally {
        config.modoEscucha = false;
      }
      assert.deepStrictEqual(state.colaAvisos(), []);
    });
  });

  fin();
})();
