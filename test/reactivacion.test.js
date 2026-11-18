'use strict';
/**
 * Reactivación de Piedra: 2 mensajes y listo (#reactivar / #reactivar-prueba; 18/11/2026).
 *
 *   node test/reactivacion.test.js
 *
 * Una promesa, un caso: los textos (con y sin nombre o producto), a quién le toca cada mensaje y cuándo (días, ventana),
 * nunca más de 2 por chat (también tras un #reset), el corte si el cliente contesta, el descarte de Sonnet, el tope por
 * día, la franja (lunes a sábado, 10 a 19, hora de Argentina), que con ERASMO_REACTIVACION_ACTIVA=false no salga nada, que
 * #reactivar-prueba no mande ni marque nada, los candados de siempre y que el eco del grupo no dispare comandos.
 *
 * Números inventados (5490000…). Sin red: lo fija test/piedra-ayuda.js. La hora de los barridos se pasa a mano.
 */
const assert = require('assert');
const fs = require('fs');

const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'nuevos' });
const { bot, state, config, sonnet, aClientes, alGrupo, enElGrupo, jid, evolution, cerebro } = p;
const reactivacion = require('../src/reactivacion');
const textos = require('../src/reactivacion-textos');

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;
const numero = (n) => `54900002${String(n).padStart(5, '0')}`;
const enGrupo = (texto) => bot.procesar(enElGrupo(texto));
const grupoCon = (re) => alGrupo.filter((t) => re.test(t));

/** El próximo miércoles a las 12:00 de Argentina (15:00 UTC) a partir de hoy: dentro de la franja y sin ser domingo. */
function proximoMiercoles() {
  const d = new Date();
  for (let i = 0; i < 8; i++) {
    const c = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + i, 15, 0, 0));
    if (c.getUTCDay() === 3 && c.getTime() > Date.now()) return c.getTime();
  }
  throw new Error('no hay miércoles');
}
const MIERCOLES = proximoMiercoles(); // 12:00 AR
// El reloj de la prueba arranca ese miércoles a las 10 AR (18/11/2026): los tiempos que se pasan a mano (`ahora`)
// y los que el bot toma de Date.now (las líneas del historial al mandar, #reactivar-prueba) tienen que ser del mismo
// día. Sin esto, la prueba solo pasaba un miércoles antes de las 12 (cuando "el próximo miércoles" era hoy).
{
  const real = Date.now;
  const corrimiento = MIERCOLES - 2 * 60 * 60 * 1000 - real();
  Date.now = () => real() + corrimiento;
}
/** Una hora de Argentina de un día relativo al miércoles: dia 0 = miércoles, 3 = sábado, 4 = domingo. */
const ar = (dias, hora, min = 0) => MIERCOLES + dias * DIA + (hora - 12) * HORA + min * 60000;

/**
 * Un chat donde lo último lo escribió la cuenta hace `cuentaHace` ms (respecto de `base`) y el cliente escribió por
 * última vez hace `clienteHace`. `producto`: lo último cotizado de la ficha.
 */
function sembrar(n, { base = MIERCOLES, cuentaHace = 3 * DIA, clienteHace = 3 * DIA + HORA, nombre = 'Juan', producto = 'Laja Ocre', extra = {}, humano = false } = {}) {
  const chatId = jid(numero(n));
  state.actualizar(chatId, { nombre, ...(producto ? { ficha: { pidio: { producto, cantidad: 10, unidad: 'm2' } } } : {}), ...extra });
  state.obtener(chatId).historial = [
    { quien: 'cliente', texto: 'hola, cuánto sale la laja ocre?', ts: base - clienteHace, id: `C${n}` },
    { quien: 'vendedor', texto: 'Hola! Te paso la info.', ts: base - cuentaHace, id: `V${n}`, ...(humano ? { humano: true } : {}) },
  ];
  state.actualizar(chatId, {});
  return chatId;
}

/** Un Sonnet que decide según lo que dice el pedido: [fragmento, paso]; si ninguno aparece, mandar: true. */
function sonnetPorTexto(reglas) {
  Object.defineProperty(sonnet, 'porDefecto', {
    configurable: true,
    get() {
      const body = this.pedidos[this.pedidos.length - 1].body;
      const t = body.messages[0].content.map((b) => b.text || '').join('\n');
      for (const [fragmento, paso] of reglas) if (t.includes(fragmento)) return paso;
      return [sonnet.usar('decidir', { mandar: true, motivo: 'sigue abierta la consulta' })];
    },
  });
}
const noMandar = (motivo) => [sonnet.usar('decidir', { mandar: false, motivo })];

/** El barrido de la reactivación a una hora dada (la del reloj de Argentina), con ACTIVA prendida. */
async function barrido(ahora) {
  const r = await bot.revisarReactivacion(ahora);
  await bot.esperarSegundoPlano();
  return r;
}

async function caso(nombre, fn) {
  await p.check(nombre, async () => {
    for (const k of Object.keys(state.todos())) state.reiniciar(k);
    const r = state.datosDeReactivacion();
    r.chats = {};
    r.dias = {};
    state.guardarInternoYa();
    reactivacion.reiniciarParaPruebas();
    for (const k of state.numerosExcluidos()) state.borrarExcluido(k);
    const guardada = { ...config.cerebro };
    const cfg = { ...config.reactivacion };
    const listas = { tester: config.numerosTester, piloto: config.numerosPiloto, todos: config.pilotoTodos, borrador: config.modoBorrador, escucha: config.modoEscucha };
    const original = { buscar: evolution.buscarMensajesDeChat, enviarTexto: evolution.enviarTexto };
    config.reactivacion.activa = true;
    sonnetPorTexto([]);
    try {
      await fn();
    } finally {
      Object.assign(config.cerebro, guardada);
      Object.assign(config.reactivacion, cfg);
      config.numerosTester = listas.tester;
      config.numerosPiloto = listas.piloto;
      config.pilotoTodos = listas.todos;
      config.modoBorrador = listas.borrador;
      config.modoEscucha = listas.escucha;
      evolution.buscarMensajesDeChat = original.buscar;
      evolution.enviarTexto = original.enviarTexto;
      await bot.esperarSegundoPlano();
    }
  });
}

(async () => {
  console.log('\nLos textos (los escribe el código)\n');

  await caso('mensaje 1: el texto aprobado, con nombre y producto', () => {
    assert.strictEqual(
      textos.mensaje1({ nombre: 'Juan', producto: 'Laja Ocre' }),
      'Hola Juan! Cómo estás? Te escribo de Somos Piedra por Laja Ocre que estabas viendo. Pudiste avanzar? Si querés te ayudo a calcular cuánto necesitás.'
    );
  });

  await caso('mensaje 1 sin producto: "la piedra", y sin nombre: "Hola!" sin coma suelta', () => {
    assert.strictEqual(
      textos.mensaje1({ nombre: 'Juan' }),
      'Hola Juan! Cómo estás? Te escribo de Somos Piedra por la piedra que estabas viendo. Pudiste avanzar? Si querés te ayudo a calcular cuánto necesitás.'
    );
    const sin = textos.mensaje1({});
    assert.ok(sin.startsWith('Hola! Cómo estás?') && sin.includes('por la piedra que estabas viendo'));
    assert.ok(!/\s,|,\s*,|^,|Hola ,|Hola !/.test(sin), sin);
  });

  await caso('mensaje 2: el texto aprobado, con y sin nombre', () => {
    assert.strictEqual(
      textos.mensaje2({ nombre: 'Juan' }),
      'Hola Juan! Último mensajito de Somos Piedra. Si seguís con la obra, cualquier duda de piedras o cantidades acá estamos. Y si conseguiste otro presupuesto, pasámelo y vemos si lo podemos mejorar.'
    );
    assert.ok(textos.mensaje2({}).startsWith('Hola! Último mensajito'));
  });

  await caso('un nombre o un producto raro no entran al mensaje (símbolos, montos, demasiado largo)', () => {
    assert.ok(textos.mensaje1({ nombre: 'J@n$', producto: 'Laja' }).startsWith('Hola! '));
    assert.ok(textos.mensaje1({ nombre: '12345' }).startsWith('Hola! '));
    for (const producto of ['Laja $45.000', 'Laja 45000', 'Laja 45.000', '<b>Laja</b>', 'x'.repeat(61), '']) {
      assert.ok(textos.mensaje1({ producto }).includes('por la piedra que estabas viendo'), producto);
    }
    assert.ok(textos.mensaje1({ producto: 'Granza roja x 40 kg' }).includes('por Granza roja x 40 kg que'));
  });

  await caso('ninguno lleva montos y entran en un mensaje de WhatsApp (el código los escribe: no pasan por la guardia de Sonnet)', () => {
    // La guardia de Sonnet frenaría "Te escribo de Somos Piedra" (promesa de contacto): por eso estos textos los escribe el
    // código y salen por su propio camino (index.js `mandarReactivacion`), nunca por `revisarSalida`.
    for (const t of [textos.mensaje1({ nombre: 'Juan', producto: 'Laja Ocre 1 m²' }), textos.mensaje1({}), textos.mensaje2({ nombre: 'Juan' }), textos.mensaje2({})]) {
      assert.strictEqual(cerebro.montosEn(t).length, 0, t);
      assert.strictEqual(cerebro.nombraAlgoInterno(t), null, t);
      assert.ok(t.length <= 300, `${t.length} caracteres`);
    }
  });

  console.log('\nEl comando\n');

  await caso('#reactivar y #reactivar-prueba solo cuentan al principio; #reactivarlo y un resto dan problema', () => {
    assert.deepStrictEqual({ ...reactivacion.comando('#reactivar') }, { tipo: 'reactivar', problema: null });
    assert.deepStrictEqual({ ...reactivacion.comando('#REACTIVAR-prueba') }, { tipo: 'reactivar-prueba', problema: null });
    assert.strictEqual(reactivacion.comando('#reactivarlo'), null);
    assert.strictEqual(reactivacion.comando('#reactivar-pruebas'), null);
    assert.strictEqual(reactivacion.comando('ojo #reactivar'), null);
    assert.ok(reactivacion.comando('#reactivar 5').problema);
  });

  console.log('\nA quién le toca cada mensaje, y cuándo\n');

  await caso('mensaje 1: a los 2 días de que la cuenta escribió; antes no', () => {
    sembrar(1, { cuentaHace: 2 * DIA + HORA });
    sembrar(2, { cuentaHace: 2 * DIA - HORA });
    sembrar(3, { cuentaHace: 1 * DIA });
    const { lista } = reactivacion.candidatos({ ahora: MIERCOLES });
    assert.deepStrictEqual(lista.map((c) => c.chatId), [jid(numero(1))]);
    assert.strictEqual(lista[0].tipo, 'm1');
  });

  await caso('solo con actividad del cliente en los últimos 30 días', () => {
    sembrar(1, { cuentaHace: 3 * DIA, clienteHace: 29 * DIA });
    sembrar(2, { cuentaHace: 3 * DIA, clienteHace: 31 * DIA });
    assert.deepStrictEqual(reactivacion.candidatos({ ahora: MIERCOLES }).lista.map((c) => c.chatId), [jid(numero(1))]);
  });

  await caso('lo que dice una persona de la cuenta también cuenta como "la cuenta escribió"', () => {
    sembrar(1, { humano: true });
    assert.strictEqual(reactivacion.candidatos({ ahora: MIERCOLES }).lista.length, 1);
  });

  await caso('si lo último es del cliente, no es de la reactivación (es de las tandas o del flujo normal)', () => {
    const chatId = sembrar(1);
    state.obtener(chatId).historial.push({ quien: 'cliente', texto: 'una cosa más', ts: MIERCOLES - HORA, id: 'C-X' });
    assert.strictEqual(reactivacion.candidatos({ ahora: MIERCOLES }).lista.length, 0);
  });

  await caso('mismas exclusiones que las tandas: excluido, personal, tester, pausado, escalado, #vendido, #perdido, #bot, seguimiento', () => {
    sembrar(1);
    sembrar(2);
    state.guardarExcluido(numero(2), { desde: Date.now(), nombre: 'x', origen: 'test' });
    sembrar(3);
    config.numerosTester = [numero(3)];
    sembrar(4, { extra: { pausado: true } });
    sembrar(5, { extra: { escalado: true, escaladoCalla: true } });
    sembrar(6, { extra: { resultado: { tipo: 'vendido', ts: 1 } } });
    sembrar(7, { extra: { resultado: { tipo: 'perdido', ts: 1 } } });
    sembrar(8, { extra: { atiendeSonnet: false } });
    const dia = (ts) => new Date(ts - 3 * HORA).toISOString().slice(0, 10);
    sembrar(9, { extra: { seguimiento: { fecha: dia(MIERCOLES + 10 * DIA), motivo: 'en marzo', avisado: false } } });
    sembrar(10, { extra: { seguimiento: { fecha: dia(MIERCOLES - 5 * DIA), motivo: 'vencido y ya avisado', avisado: true } } });
    const { lista, afuera } = reactivacion.candidatos({ ahora: MIERCOLES });
    assert.deepStrictEqual(lista.map((c) => c.chatId).sort(), [jid(numero(1)), jid(numero(10))].sort());
    assert.ok(Object.keys(afuera).length >= 8, JSON.stringify(afuera));
  });

  console.log('\nNunca más de 2 por chat\n');

  await caso('mensaje 1 y mensaje 2, y listo: a los 7 días del 1, y nunca un tercero (tampoco tras un #reset)', async () => {
    const chatId = sembrar(1);
    // Mensaje 1
    let r = await barrido(MIERCOLES);
    assert.strictEqual(r.enviados, 1, JSON.stringify(r));
    assert.strictEqual(aClientes.length, 1);
    assert.ok(aClientes[0].texto.startsWith('Hola Juan! Cómo estás?'));
    assert.ok(reactivacion.marcasDe(chatId).m1);
    // Sin pasar el tiempo, nada
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual((await barrido(ar(6, 12))).enviados, 0, 'a los 6 días del 1 todavía no');
    // Mensaje 2 a los 7 días
    r = await barrido(ar(7 + 1, 12));
    assert.strictEqual(r.enviados, 1, JSON.stringify(r));
    assert.ok(aClientes[1].texto.startsWith('Hola Juan! Último mensajito'));
    assert.ok(reactivacion.marcasDe(chatId).m2);
    // Un tercero, nunca: ni pasado un mes, ni tras un #reset del chat y de los dos mensajes
    assert.strictEqual((await barrido(ar(40, 12))).enviados, 0);
    state.reiniciar(chatId);
    sembrar(1, { base: ar(40, 12), cuentaHace: 10 * DIA, clienteHace: 10 * DIA + HORA });
    assert.strictEqual((await barrido(ar(41, 12))).enviados, 0, 'las marcas sobreviven a #reset');
    assert.strictEqual(aClientes.length, 2);
  });

  await caso('con el mensaje 1 y el 2 ya mandados, un chat que cumple todo lo demás NO vuelve a ser candidato', () => {
    const chatId = sembrar(1, { cuentaHace: 20 * DIA, clienteHace: 20 * DIA + HORA });
    reactivacion.anotar(chatId, { m1: MIERCOLES - 15 * DIA, m2: MIERCOLES - 8 * DIA });
    assert.strictEqual(reactivacion.candidatos({ ahora: MIERCOLES }).lista.length, 0);
    // Con solo el 1, los mismos datos sí lo vuelven candidato del 2: lo único que lo frena es el 2.
    reactivacion.anotar(chatId, { m2: null });
    assert.deepStrictEqual(reactivacion.candidatos({ ahora: MIERCOLES }).lista.map((c) => c.tipo), ['m2']);
  });

  await caso('si el cliente contesta después del mensaje 1, se corta para siempre', async () => {
    const chatId = sembrar(1);
    await barrido(MIERCOLES);
    assert.strictEqual(aClientes.length, 1);
    const h = state.obtener(chatId).historial;
    h.push({ quien: 'cliente', texto: 'sí, todavía lo estoy viendo', ts: MIERCOLES + 3 * HORA, id: 'C-RESP' });
    h.push({ quien: 'vendedor', texto: 'Genial, te ayudo', ts: MIERCOLES + 4 * HORA, id: 'V-RESP', humano: true });
    assert.strictEqual((await barrido(ar(12, 12))).enviados, 0);
    assert.ok(reactivacion.marcasDe(chatId).cortado, 'queda cortado');
    assert.strictEqual((await barrido(ar(30, 12))).enviados, 0);
    assert.strictEqual(aClientes.length, 1);
  });

  await caso('si Evolution muestra que el cliente ya contestó (el estado no se enteró), no se le escribe', async () => {
    const chatId = sembrar(1);
    evolution.buscarMensajesDeChat = async (j) => [
      { key: { remoteJid: j, fromMe: false, id: 'EV-CLIENTE' }, message: { conversation: 'hola, sigo interesado' }, messageTimestamp: Math.floor((MIERCOLES - HORA) / 1000) },
    ];
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(sonnet.pedidos.length, 0, 'ni se le pregunta a Sonnet');
    assert.ok(chatId);
  });

  await caso('si no se puede verificar el chat en Evolution, no se le escribe ni se lo descarta', async () => {
    const chatId = sembrar(1);
    evolution.buscarMensajesDeChat = async () => {
      throw new Error('Evolution 500');
    };
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual({ ...reactivacion.marcasDe(chatId) }, {});
  });

  console.log('\nSonnet decide si se manda\n');

  await caso('si Evolution muestra que una persona de la cuenta escribió algo nuevo, no se le escribe', async () => {
    sembrar(1);
    evolution.buscarMensajesDeChat = async (j) => [
      { key: { remoteJid: j, fromMe: true, id: 'EV-PERSONA' }, message: { conversation: 'Hola, te escribo yo' }, messageTimestamp: Math.floor((MIERCOLES - HORA) / 1000) },
    ];
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(sonnet.pedidos.length, 0, 'ni se le pregunta a Sonnet');
  });

  await caso('si lo último que se le mandó no se confirmó (sin id), no se lo reactiva', () => {
    const chatId = sembrar(1);
    state.obtener(chatId).historial[1].sinConfirmar = true;
    assert.strictEqual(reactivacion.candidatos({ ahora: MIERCOLES }).lista.length, 0);
  });

  await caso('Sonnet dice que no: el chat queda descartado para siempre y no se le vuelve a preguntar', async () => {
    const chatId = sembrar(1, { nombre: 'Ana' });
    state.obtener(chatId).historial[0].texto = 'ya compré en otro lado, gracias';
    sonnetPorTexto([['ya compré', noMandar('ya compró')]]);
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(reactivacion.marcasDe(chatId).descartado.motivo, 'ya compró');
    const pedidos = sonnet.pedidos.length;
    await barrido(ar(10, 12));
    assert.strictEqual(sonnet.pedidos.length, pedidos, 'no se le vuelve a preguntar');
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('si Sonnet no puede decidir (error), no se manda y no se descarta: se reintenta', async () => {
    const chatId = sembrar(1);
    sonnet.guion(sonnet.falla(500), sonnet.falla(500));
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual(aClientes.length, 0);
    assert.deepStrictEqual({ ...reactivacion.marcasDe(chatId) }, {});
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 1, 'el próximo barrido lo reintenta');
  });

  await caso('Sonnet recibe los últimos 20 mensajes y una sola herramienta (decidir); no escribe nada', async () => {
    const chatId = sembrar(1);
    const h = state.obtener(chatId).historial;
    h.unshift(...Array.from({ length: 30 }, (_, i) => ({ quien: i % 2 ? 'vendedor' : 'cliente', texto: `mensaje viejo ${i}`, ts: MIERCOLES - 10 * DIA + i * 1000, id: `X${i}` })));
    await barrido(MIERCOLES);
    const body = sonnet.pedidos[0].body;
    assert.deepStrictEqual(body.tools.map((t) => t.name), ['decidir']);
    assert.notStrictEqual(body.system[0].text, cerebro.REGLAS);
    const texto = sonnet.textoDelPedido(0);
    assert.ok(texto.includes('Los últimos 20 mensajes'));
    assert.ok(!texto.includes('mensaje viejo 0'), 'los viejos no entran');
    assert.ok(texto.includes('Te paso la info'), 'lo último de la cuenta entra');
    assert.ok(chatId);
  });

  console.log('\nCuándo y cuántos\n');

  await caso('tope por día: no pasa de TOPE_DIA aunque haya más candidatos, y al día siguiente sigue', async () => {
    config.reactivacion.topeDia = 5;
    for (let i = 1; i <= 12; i++) sembrar(i);
    assert.strictEqual((await barrido(ar(0, 10))).enviados, 4, 'a lo sumo 4 por barrido');
    assert.strictEqual((await barrido(ar(0, 10, 15))).enviados, 1, 'el quinto completa el tope');
    assert.strictEqual(reactivacion.enviadosHoy(ar(0, 11)), 5);
    const r = await barrido(ar(0, 10, 30));
    assert.strictEqual(r.enviados, 0);
    assert.ok(/tope/.test(r.motivo), r.motivo);
    assert.strictEqual(aClientes.length, 5);
    // Al día siguiente vuelven a salir (de los que faltan)
    assert.strictEqual((await barrido(ar(1, 10))).enviados, 4);
  });

  await caso('la franja: lunes a sábado de 10 a 19 hora de Argentina; el domingo, nada', async () => {
    sembrar(1, { base: ar(0, 12), cuentaHace: 10 * DIA, clienteHace: 10 * DIA + HORA });
    for (const [cuando, sale] of [
      [ar(0, 9, 59), false],
      [ar(0, 19, 0), false],
      [ar(0, 22, 0), false],
      [ar(4, 12, 0), false], // domingo
    ]) {
      const r = await barrido(cuando);
      assert.strictEqual(r.enviados, sale ? 1 : 0, `${new Date(cuando).toISOString()}: ${r.motivo}`);
    }
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual((await barrido(ar(0, 10, 0))).enviados, 1, 'a las 10 sale');
    for (let i = 2; i <= 3; i++) sembrar(i, { base: ar(0, 12), cuentaHace: 10 * DIA, clienteHace: 10 * DIA + HORA });
    assert.strictEqual((await barrido(ar(0, 18, 59))).enviados, 2, 'a las 18:59 todavía sale');
    sembrar(4, { base: ar(0, 12), cuentaHace: 10 * DIA, clienteHace: 10 * DIA + HORA });
    assert.strictEqual((await barrido(ar(3, 12))).enviados, 1, 'el sábado sale');
  });

  await caso('con ERASMO_REACTIVACION_ACTIVA=false no sale nada nunca y ni se le pregunta a Sonnet', async () => {
    config.reactivacion.activa = false;
    for (let i = 1; i <= 3; i++) sembrar(i);
    const r = await barrido(MIERCOLES);
    assert.strictEqual(r.enviados, 0);
    assert.ok(/apagada/.test(r.motivo));
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual({ ...state.datosDeReactivacion().chats }, {});
  });

  await caso('ACTIVA vacía o con otra cosa que "true" es false; los números mal puestos usan el valor de siempre', () => {
    const { spawnSync } = require('child_process');
    const correr = (env) =>
      JSON.parse(
        spawnSync(process.execPath, ['-e', "const c=require('./src/config');console.log(JSON.stringify(c.reactivacion))"], { cwd: require('path').join(__dirname, '..'), env: { ...process.env, EVOLUTION_INSTANCE: 'somospiedra', ...env }, encoding: 'utf8' }).stdout
      );
    const base = { ERASMO_REACTIVACION_ACTIVA: '', ERASMO_REACTIVACION_TOPE_DIA: '', ERASMO_REACTIVACION_DIAS_1: '', ERASMO_REACTIVACION_DIAS_2: '', ERASMO_REACTIVACION_VENTANA_DIAS: '' };
    const vacia = correr(base);
    assert.deepStrictEqual([vacia.activa, vacia.topeDia, vacia.dias1, vacia.dias2, vacia.ventanaDias], [false, 40, 2, 7, 30]);
    assert.strictEqual(correr({ ...base, ERASMO_REACTIVACION_ACTIVA: 'si' }).activa, false);
    assert.strictEqual(correr({ ...base, ERASMO_REACTIVACION_ACTIVA: 'TRUE' }).activa, true);
    const raro = correr({ ...base, ERASMO_REACTIVACION_TOPE_DIA: 'abc', ERASMO_REACTIVACION_DIAS_1: '0', ERASMO_REACTIVACION_DIAS_2: '-3', ERASMO_REACTIVACION_VENTANA_DIAS: '  ' });
    assert.deepStrictEqual([raro.topeDia, raro.dias1, raro.dias2, raro.ventanaDias], [40, 2, 7, 30]);
    assert.strictEqual(correr({ ...base, ERASMO_REACTIVACION_TOPE_DIA: '12', ERASMO_REACTIVACION_DIAS_1: '3' }).topeDia, 12);
  });

  await caso('dos barridos a la vez: el segundo no hace nada (no se pisan)', async () => {
    for (let i = 1; i <= 3; i++) sembrar(i);
    const [a, b] = await Promise.all([bot.revisarReactivacion(MIERCOLES), bot.revisarReactivacion(MIERCOLES)]);
    assert.strictEqual(a.enviados + b.enviados, 3);
    assert.ok([a, b].some((r) => /ya hay un barrido/.test(r.motivo || '')));
    assert.strictEqual(aClientes.length, 3);
  });

  console.log('\nLos candados de siempre\n');

  await caso('lo que sale queda con atiendeSonnet, en el historial y en el registro como `reactivacion`', async () => {
    const chatId = sembrar(1);
    await barrido(MIERCOLES);
    const s = state.todos()[chatId];
    assert.strictEqual(s.atiendeSonnet, true);
    assert.strictEqual(s.historial[s.historial.length - 1].quien, 'vendedor');
    assert.ok(s.historial[s.historial.length - 1].texto.startsWith('Hola Juan!'));
    assert.ok(p.aprendizaje.leerTodo().some((e) => e.tipo === 'entrega' && e.origen === 'reactivacion'));
  });

  await caso('con el bot apagado, en escucha, en borrador o con un CEREBRO_MODO que no manda, no sale nada', async () => {
    sembrar(1);
    for (const cambio of [() => (config.modoBorrador = true), () => (config.modoEscucha = true), () => (config.cerebro.modo = 'tester'), () => (config.cerebro.modo = 'sombra'), () => (config.cerebro.modo = 'apagado')]) {
      config.modoBorrador = false;
      config.modoEscucha = false;
      config.cerebro.modo = 'nuevos';
      cambio();
      const r = await barrido(MIERCOLES);
      assert.strictEqual(r.enviados, 0);
    }
    config.modoBorrador = false;
    config.modoEscucha = false;
    config.cerebro.modo = 'nuevos';
    await enGrupo('#apagar');
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    await enGrupo('#prender');
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(sonnet.pedidos.length, 0, 'ni se le preguntó a Sonnet');
  });

  await caso('un chat que no le llegaría al cliente (listas de prueba) no recibe y no se marca', async () => {
    const chatId = sembrar(1);
    config.numerosTester = [numero(99)];
    config.pilotoTodos = false;
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual(aClientes.length, 0);
    assert.deepStrictEqual({ ...reactivacion.marcasDe(chatId) }, {});
  });

  await caso('si el cliente escribió en el medio (mientras se esperaba), no sale', async () => {
    const chatId = sembrar(1);
    const original = evolution.mostrarEscribiendo;
    evolution.mostrarEscribiendo = async () => {
      state.obtener(chatId).historial.push({ quien: 'cliente', texto: 'justo ahora', ts: MIERCOLES + 1000, id: 'C-JUSTO' });
    };
    try {
      assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    } finally {
      evolution.mostrarEscribiendo = original;
    }
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(reactivacion.marcasDe(chatId).m1, undefined);
  });

  await caso('un #reset justo después de que Evolution entregó el mensaje: igual cuenta (marca y tope), no se le vuelve a mandar', async () => {
    const chatId = sembrar(1);
    const original = evolution.enviarTexto;
    evolution.enviarTexto = async (...args) => {
      const r = await original(...args);
      state.reiniciar(chatId);
      return r;
    };
    const r = await barrido(MIERCOLES);
    assert.strictEqual(r.enviados, 1, JSON.stringify(r));
    assert.strictEqual(aClientes.length, 1);
    assert.ok(reactivacion.marcasDe(chatId).m1, 'la marca se escribe aunque el chat se haya reiniciado');
    assert.strictEqual(reactivacion.enviadosHoy(MIERCOLES), 1);
    sembrar(1);
    assert.strictEqual((await barrido(ar(8, 12))).enviados, 1, 'el que sigue es el 2, no otro 1');
    assert.ok(aClientes[1].texto.includes('Último mensajito'));
  });

  await caso('si el envío revienta sin saber si salió, la marca queda (nunca más de 2): no se reintenta a ciegas', async () => {
    const chatId = sembrar(1);
    evolution.enviarTexto = async () => {
      throw new Error('se cortó la red');
    };
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.ok(reactivacion.marcasDe(chatId).m1, 'queda reservado el mensaje 1');
    assert.strictEqual(reactivacion.enviadosHoy(MIERCOLES), 0, 'pero no cuenta como enviado');
    evolution.enviarTexto = p.evolution.enviarTexto;
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0, 'el 1 no se repite (el 2 espera sus 7 días)');
  });

  await caso('la franja se mira otra vez justo antes de mandar: lo que cruza las 19:00 mientras "escribe…" no sale', async () => {
    sembrar(1);
    const original = evolution.mostrarEscribiendo;
    evolution.mostrarEscribiendo = async () => p.dormir(700);
    try {
      assert.strictEqual((await barrido(ar(0, 19, 0) - 300)).enviados, 0);
    } finally {
      evolution.mostrarEscribiendo = original;
    }
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('y también después de la pausa entre un mensaje y el siguiente', async () => {
    sembrar(1);
    sembrar(2);
    const enviadosA = [];
    const r = await reactivacion.revisar({
      ahora: ar(0, 19, 0) - 300,
      enviar: async (chatId) => {
        enviadosA.push(chatId);
        return { salio: true };
      },
      esperar: () => p.dormir(700),
    });
    assert.strictEqual(r.enviados, 1);
    assert.strictEqual(enviadosA.length, 1, 'el segundo ya es después de las 19');
  });

  await caso('si Evolution no confirma el envío, no cuenta para el tope ni queda marcado', async () => {
    const chatId = sembrar(1);
    evolution.enviarTexto = async () => ({ bloqueado: true, motivo: 'fuera de la lista de prueba' });
    assert.strictEqual((await barrido(MIERCOLES)).enviados, 0);
    assert.strictEqual(reactivacion.enviadosHoy(MIERCOLES), 0);
    assert.strictEqual(reactivacion.marcasDe(chatId).m1, undefined);
  });

  console.log('\n#reactivar y #reactivar-prueba\n');

  await caso('#reactivar dice si está activa, cuántos salieron hoy y el tope; con ACTIVA=false, que no manda', async () => {
    config.reactivacion.topeDia = 7;
    await enGrupo('#reactivar');
    const activa = grupoCon(/ACTIVA\./)[0];
    assert.ok(activa && /de 7/.test(activa), alGrupo.join('|'));
    alGrupo.length = 0;
    config.reactivacion.activa = false;
    await enGrupo('#reactivar');
    assert.ok(/APAGADA/.test(alGrupo[0]), alGrupo[0]);
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('#reactivar-prueba arma el .md con a quién le saldría hoy, sin mandar ni marcar nada, aunque ACTIVA sea false', async () => {
    config.reactivacion.activa = false;
    const a = sembrar(1, { nombre: 'Ana' });
    const b = sembrar(2, { nombre: 'Beto' });
    state.obtener(b).historial[0].texto = 'ya compré en otro lado';
    sonnetPorTexto([['ya compré', noMandar('ya compró')]]);
    const reactivarAntes = JSON.stringify(state.datosDeReactivacion());
    await enGrupo('#reactivar-prueba');
    await bot.esperarSegundoPlano();
    assert.strictEqual(aClientes.length, 0, 'no sale nada');
    assert.strictEqual(JSON.stringify(state.datosDeReactivacion()), reactivarAntes, 'no marca nada');
    assert.ok(sonnet.pedidos.length >= 2, 'incluye el chequeo de Sonnet');
    const archivos = fs.readdirSync(config.reactivacion.dir).filter((f) => f.endsWith('.md'));
    assert.strictEqual(archivos.length, 1);
    const md = fs.readFileSync(require('path').join(config.reactivacion.dir, archivos[0]), 'utf8');
    assert.ok(md.includes('Ana') && md.includes('→ SÍ') && md.includes('Le saldría: Hola Ana! Cómo estás?'), md);
    assert.ok(md.includes('Beto') && md.includes('→ NO') && md.includes('Sonnet: no mandar (ya compró)'), md);
    assert.ok(!md.includes(numero(1)), 'número tapado');
    assert.ok(md.includes('APAGADA'));
    const aviso = grupoCon(/^Reactivación, prueba/)[0];
    assert.ok(aviso && /mandaría 1, no 1/.test(aviso) && /No mandé nada/.test(aviso), alGrupo.join('|'));
    assert.ok(a);
  });

  await caso('#reactivar-prueba con CEREBRO_MODO=apagado no le pregunta nada a Sonnet', async () => {
    sembrar(1);
    config.cerebro.modo = 'apagado';
    await enGrupo('#reactivar-prueba');
    await bot.esperarSegundoPlano();
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.ok(grupoCon(/^❓.*apagado/).length === 1, alGrupo.join('|'));
  });

  await caso('el eco de cada mensaje del bot al grupo no dispara ningún comando', async () => {
    sembrar(1);
    await enGrupo('#reactivar');
    await enGrupo('#reactivar 5');
    await enGrupo('#reactivar-prueba');
    await bot.esperarSegundoPlano();
    const textos_ = [...alGrupo];
    assert.ok(textos_.length >= 4);
    const pedidos = sonnet.pedidos.length;
    alGrupo.length = 0;
    for (const t of textos_) await enGrupo(t);
    await bot.esperarSegundoPlano();
    assert.strictEqual(alGrupo.length, 0, alGrupo.join('|'));
    assert.strictEqual(sonnet.pedidos.length, pedidos);
    assert.strictEqual(aClientes.length, 0);
    assert.ok(textos_.every((t) => !t.trim().startsWith('#')));
  });

  p.fin();
})();
