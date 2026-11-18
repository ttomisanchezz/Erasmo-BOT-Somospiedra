'use strict';
/**
 * Tandas de chats sin contestar (#tanda / #tanda-ok / #tanda-no; 18/11/2026).
 *
 *   node test/tandas.test.js
 *
 * Una promesa, un caso: cómo se eligen los 40 (orden y exclusiones), qué decide Sonnet (responder, no contestar,
 * escalar), que NADA sale sin #tanda-ok, que al mandar se re-chequea todo chat por chat (el cliente o una persona
 * escribieron desde la propuesta, las listas, el interruptor), los números -N, el vencimiento a las 6 h, una tanda a la
 * vez, `atiendeSonnet` al mandar, y que lo que el bot escribe al grupo no vuelve a ejecutarse como comando.
 *
 * Números inventados (5490000…). Sin red: lo fija test/piedra-ayuda.js.
 */
const assert = require('assert');
const fs = require('fs');

const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'nuevos' });
const { bot, state, config, sonnet, aClientes, alGrupo, enElGrupo, mensaje, jid, esperar, evolution } = p;
const tandas = require('../src/tandas');

const DIA = 24 * 60 * 60 * 1000;
const HORA = 60 * 60 * 1000;
const numero = (n) => `54900001${String(n).padStart(5, '0')}`;
const enGrupo = (texto) => bot.procesar(enElGrupo(texto));
const grupoCon = (re) => alGrupo.filter((t) => re.test(t));

/** Un chat con historial: lo último es del cliente (o de la cuenta con `ultimo: 'cuenta'`). Devuelve su jid. */
function sembrar(n, { ultimo = 'cliente', hace = 3 * DIA, nombre = 'Juan', texto = 'hola, quiero laja ocre', extra = {}, lineas = null } = {}) {
  const chatId = jid(numero(n));
  state.actualizar(chatId, { nombre, ...extra });
  const s = state.obtener(chatId);
  const ts = Date.now() - hace;
  s.historial =
    lineas ||
    (ultimo === 'cliente'
      ? [{ quien: 'cliente', texto, ts, id: `C${n}` }]
      : [
          { quien: 'cliente', texto, ts: ts - HORA, id: `C${n}` },
          { quien: 'vendedor', texto: 'Hola! Te paso la info.', ts, id: `V${n}` },
        ]);
  state.actualizar(chatId, {});
  return chatId;
}

/** Cada caso arranca sin chats, sin tandas y con la configuración como estaba. */
async function caso(nombre, fn) {
  await p.check(nombre, async () => {
    for (const k of Object.keys(state.todos())) state.reiniciar(k);
    const t = state.datosDeTandas();
    t.actual = null;
    t.chats = {};
    state.guardarInternoYa();
    tandas.reiniciarParaPruebas();
    for (const k of state.numerosExcluidos()) state.borrarExcluido(k);
    const guardada = { ...config.cerebro };
    const listas = { tester: config.numerosTester, piloto: config.numerosPiloto, todos: config.pilotoTodos, personales: config.contactosPersonales, borrador: config.modoBorrador, escucha: config.modoEscucha };
    const tandasCfg = { ...config.tandas };
    const originalBuscar = evolution.buscarMensajesDeChat;
    sonnetPorTexto([]);
    try {
      await fn();
    } finally {
      Object.assign(config.cerebro, guardada);
      config.numerosTester = listas.tester;
      config.numerosPiloto = listas.piloto;
      config.pilotoTodos = listas.todos;
      config.contactosPersonales = listas.personales;
      config.modoBorrador = listas.borrador;
      config.modoEscucha = listas.escucha;
      Object.assign(config.tandas, tandasCfg);
      evolution.buscarMensajesDeChat = originalBuscar;
      await bot.esperarSegundoPlano();
    }
  });
}

/** Un Sonnet que decide según lo que dice el pedido: [fragmento, paso]; si ninguno aparece, responde algo. */
function sonnetPorTexto(reglas) {
  Object.defineProperty(sonnet, 'porDefecto', {
    configurable: true,
    get() {
      const body = this.pedidos[this.pedidos.length - 1].body;
      const t = body.messages[0].content.map((b) => b.text || '').join('\n');
      for (const [fragmento, paso] of reglas) if (t.includes(fragmento)) return paso;
      return sonnet.responde(['Hola! Te cuento que tenemos laja ocre. Qué medidas necesitás?']);
    },
  });
}

const idDeLaTanda = () => state.datosDeTandas().siguiente - 1;
/** Arma una tanda con #tanda y espera su resumen; devuelve su id. */
async function armarTanda() {
  await enGrupo('#tanda');
  await bot.esperarSegundoPlano();
  return idDeLaTanda();
}
/** Manda la tanda con #tanda-ok y espera a que termine. */
async function mandarTanda(id, extra = '') {
  await enGrupo(`#tanda-ok ${id}${extra}`);
  await bot.esperarSegundoPlano();
}

(async () => {
  console.log('\nEl comando\n');

  await caso('#tanda, #tanda-ok y #tanda-no solo cuentan al principio; #tandas y #tanda-oks no', () => {
    assert.deepStrictEqual({ ...tandas.comando('#tanda') }, { tipo: 'tanda', id: null, omitir: [], problema: null });
    assert.strictEqual(tandas.comando('#TANDA').tipo, 'tanda');
    assert.deepStrictEqual({ ...tandas.comando('#tanda-ok 3') }, { tipo: 'tanda-ok', id: 3, omitir: [], problema: null });
    assert.deepStrictEqual(tandas.comando('#tanda-ok 3 -4 -17').omitir, [4, 17]);
    assert.deepStrictEqual({ ...tandas.comando('#tanda-no 12') }, { tipo: 'tanda-no', id: 12, omitir: [], problema: null });
    assert.strictEqual(tandas.comando('#tandas'), null);
    assert.strictEqual(tandas.comando('#tanda-oks 3'), null);
    assert.strictEqual(tandas.comando('#tanda-okey 3'), null);
    assert.strictEqual(tandas.comando('ojo #tanda'), null);
    assert.strictEqual(tandas.comando('Tanda 3: 40 chats'), null);
    assert.strictEqual(tandas.comando('hola'), null);
  });

  await caso('lo que no se entiende da un problema y no hace nada', () => {
    assert.ok(tandas.comando('#tanda 5').problema);
    assert.ok(tandas.comando('#tanda-ok').problema);
    assert.ok(tandas.comando('#tanda-ok abc').problema);
    assert.ok(tandas.comando('#tanda-ok 3 4').problema);
    assert.ok(tandas.comando('#tanda-ok 3 -x').problema);
    assert.ok(tandas.comando('#tanda-no 3 -4').problema);
  });

  console.log('\nCómo se eligen los 40\n');

  await caso('toma los 40 más recientes sin contestar, del más reciente al más viejo', () => {
    for (let i = 1; i <= 50; i++) sembrar(i, { hace: i * HORA });
    const { elegidos, hay } = tandas.seleccionar();
    assert.strictEqual(hay, 50);
    assert.strictEqual(elegidos.length, 40);
    assert.strictEqual(elegidos[0].chatId, jid(numero(1)));
    assert.strictEqual(elegidos[39].chatId, jid(numero(40)));
    for (let i = 1; i < elegidos.length; i++) assert.ok(elegidos[i - 1].ultimoTs >= elegidos[i].ultimoTs);
  });

  await caso('no entran los que no cuentan: excluidos, personales, @lid, grupos, testers, pausados, escalados, vendidos, #bot, lo último de la cuenta', () => {
    const buenos = [sembrar(1), sembrar(2)];
    sembrar(10, { ultimo: 'cuenta' });
    const excluido = sembrar(11);
    state.guardarExcluido(numero(11), { desde: Date.now(), nombre: 'x', origen: 'test' });
    const personal = sembrar(12);
    config.contactosPersonales = [numero(12)];
    config.numerosTester = [numero(13)];
    sembrar(13);
    sembrar(14, { extra: { pausado: true } });
    sembrar(15, { extra: { escalado: true, escaladoCalla: true } });
    sembrar(16, { extra: { resultado: { tipo: 'vendido', ts: Date.now() } } });
    sembrar(17, { extra: { resultado: { tipo: 'perdido', ts: Date.now() } } });
    sembrar(18, { extra: { atiendeSonnet: false } });
    sembrar(19, { extra: { escalado: true, escaladoCalla: false } }); // escalado que no calla (audio): sí entra
    const lid = '123456789012@lid';
    state.actualizar(lid, {});
    state.obtener(lid).historial = [{ quien: 'cliente', texto: 'hola', ts: Date.now() - DIA }];
    const grupo = '120363000000000001@g.us';
    state.actualizar(grupo, {});
    state.obtener(grupo).historial = [{ quien: 'cliente', texto: 'hola', ts: Date.now() - DIA }];
    const { elegidos, afuera } = tandas.seleccionar();
    const ids = elegidos.map((e) => e.chatId).sort();
    assert.deepStrictEqual(ids, [...buenos, jid(numero(19))].sort());
    assert.ok(![excluido, personal].some((x) => ids.includes(x)));
    assert.ok(Object.keys(afuera).length >= 7, JSON.stringify(afuera));
  });

  await caso('los que ya estuvieron en una tanda mandada no vuelven', () => {
    sembrar(1);
    sembrar(2);
    state.datosDeTandas().chats[jid(numero(1))] = { tanda: 1, ts: Date.now(), resultado: 'enviado' };
    assert.deepStrictEqual(
      tandas.seleccionar().elegidos.map((e) => e.chatId),
      [jid(numero(2))]
    );
  });

  console.log('\nQué decide Sonnet y qué queda guardado (no se manda nada)\n');

  await caso('#tanda arma la propuesta: responde, no contesta y escala, con .md, .json y un resumen; no sale nada al cliente', async () => {
    sembrar(1, { texto: 'hola, quiero laja ocre', hace: 1 * HORA });
    sembrar(2, { texto: 'gracias, ya compré en otro lado', hace: 2 * HORA });
    sembrar(3, { texto: 'necesito envío a Plottier', hace: 3 * HORA });
    sonnetPorTexto([
      ['ya compré', [sonnet.usar('no_contestar', { motivo: 'ya compró en otro lado' })]],
      ['Plottier', sonnet.escala('pide envío fuera de Neuquén')],
    ]);
    const id = await armarTanda();
    assert.strictEqual(aClientes.length, 0, 'no sale nada al cliente');
    const t = tandas.leerTanda(id);
    assert.strictEqual(t.estado, 'propuesta');
    assert.deepStrictEqual(t.chats.map((c) => c.accion), ['responder', 'no_contestar', 'escalar']);
    assert.strictEqual(t.chats[0].mensajes.length, 1);
    assert.strictEqual(t.chats[1].motivo, 'ya compró en otro lado');
    assert.ok(fs.existsSync(tandas.rutaMd(id)));
    const md = fs.readFileSync(tandas.rutaMd(id), 'utf8');
    assert.ok(md.includes('…0001') && !md.includes(numero(1)), 'número tapado salvo los últimos 4');
    assert.ok(md.includes('RESPONDE') && md.includes('NO CONTESTA') && md.includes('ESCALA'));
    const resumen = grupoCon(/^Tanda \d+:/)[0];
    assert.ok(resumen, alGrupo.join('\n---\n'));
    assert.ok(/3 chats → 1 contesta, 1 no, 1 escala/.test(resumen), resumen);
    assert.ok(resumen.includes(`#tanda-ok ${id}`));
    assert.strictEqual(aprendizajeSinEntregas(), 0);
  });

  await caso('el pedido de la tanda lleva no_contestar, la tarea y las instrucciones; las reglas son las de siempre', async () => {
    sembrar(1, { hace: 3 * DIA });
    await armarTanda();
    const body = sonnet.pedidos[0].body;
    assert.ok(body.tools.some((h) => h.name === 'no_contestar'));
    assert.ok(['responder', 'escalar', 'cotizar', 'buscar_productos', 'mandar_catalogo'].every((n) => body.tools.some((h) => h.name === n)));
    const texto = sonnet.textoDelPedido(0);
    assert.ok(texto.includes('TAREA ESPECIAL'));
    assert.ok(texto.includes('ÚLTIMOS 20 mensajes'));
    assert.ok(/pidiendo disculpas por la demora/.test(texto), 'más de 24 h: pide disculpas');
    assert.strictEqual(body.system[0].text, p.cerebro.REGLAS, 'las reglas no cambian');
  });

  await caso('las disculpas que el pedido da como ejemplo (y otras comunes) pasan la guardia: no se escala por pedir perdón', () => {
    assert.ok(p.cerebro.EJEMPLO_DE_DISCULPAS.length > 10);
    for (const t of [p.cerebro.EJEMPLO_DE_DISCULPAS, 'Perdón la demora!', 'Disculpá que te respondo recién ahora', 'Perdón por no haberte respondido antes', 'Disculpá la demora, recién veo tu mensaje.']) {
      assert.strictEqual(p.cerebro.revisarSalida([t], []).guardia, null, t);
    }
  });

  await caso('hace menos de 24 h no pide disculpas por la demora', async () => {
    sembrar(1, { hace: 5 * HORA });
    await armarTanda();
    assert.ok(/no hace falta pedir disculpas/.test(sonnet.textoDelPedido(0)));
    assert.ok(!/arranca pidiendo disculpas/.test(sonnet.textoDelPedido(0)));
  });

  await caso('en el pedido de siempre (una charla en vivo) no existe no_contestar', async () => {
    const r = await p.cerebro.pensar({ chatId: sembrar(1), mensaje: 'hola' });
    assert.ok(!r.error, r.error);
    assert.ok(!sonnet.pedidos[0].body.tools.some((h) => h.name === 'no_contestar'));
  });

  await caso('Sonnet lee la conversación entera de Evolution (hasta 150) y el pedido dice lo que no entra', async () => {
    const chatId = sembrar(1, { hace: 2 * DIA, lineas: [{ quien: 'cliente', texto: 'ultimo de estado', ts: Date.now() - 2 * DIA, id: 'E-ULT' }] });
    const registros = [];
    for (let i = 0; i < 200; i++) {
      registros.push({ key: { remoteJid: chatId, fromMe: i % 2 === 1, id: `EV${i}` }, message: { conversation: `mensaje largo numero ${i} ${'x'.repeat(200)}` }, messageTimestamp: Math.floor((Date.now() - (10 * DIA + (200 - i) * 60000)) / 1000) });
    }
    let pedido = null;
    evolution.buscarMensajesDeChat = async (j, n) => {
      pedido = n;
      return registros;
    };
    config.tandas.maxCaracteres = 12000;
    await armarTanda();
    assert.strictEqual(pedido, 150, 'le pide 150 a Evolution');
    const texto = sonnet.textoDelPedido(0);
    assert.ok(texto.includes('ultimo de estado'));
    assert.ok(/otros \d+ mensajes más viejos no entran/.test(texto), 'dice cuántos no entran');
    const lineas = texto.split('\n').filter((l) => /^\[hace .*\] (Cliente|Persona de la cuenta|Vos \(antes\)):/.test(l));
    assert.ok(lineas.length >= 20 && lineas.length < 150, `entraron ${lineas.length}`);
    assert.ok(texto.includes('mensaje largo numero 199'), 'lo más nuevo entra siempre');
  });

  await caso('si Evolution muestra que ya contestó alguien, no_contestar sin gastar a Sonnet', async () => {
    const chatId = sembrar(1, { hace: 3 * DIA });
    evolution.buscarMensajesDeChat = async () => [
      { key: { remoteJid: chatId, fromMe: true, id: 'EV-PERSONA' }, message: { conversation: 'Hola Juan, te paso el precio por acá' }, messageTimestamp: Math.floor((Date.now() - 2 * DIA) / 1000) },
    ];
    await armarTanda();
    assert.strictEqual(sonnet.pedidos.length, 0, 'no se le pregunta a Sonnet');
    const t = tandas.leerTanda(idDeLaTanda());
    assert.strictEqual(t.chats[0].accion, 'no_contestar');
    assert.ok(/ya le contestó alguien/.test(t.chats[0].motivo));
  });

  await caso('si no se puede releer el chat en Evolution, queda salteado y no se le pregunta a Sonnet', async () => {
    sembrar(1);
    evolution.buscarMensajesDeChat = async () => {
      throw new Error('Evolution 500');
    };
    await armarTanda();
    assert.strictEqual(sonnet.pedidos.length, 0);
    const t = tandas.leerTanda(idDeLaTanda());
    assert.strictEqual(t.chats[0].accion, 'saltear');
    assert.ok(grupoCon(/salteados/).length === 1);
  });

  await caso('si Sonnet falla, el chat queda salteado (no se escala por una falla nuestra)', async () => {
    sembrar(1);
    sonnet.guion(sonnet.falla(500), sonnet.falla(500));
    await armarTanda();
    const t = tandas.leerTanda(idDeLaTanda());
    assert.strictEqual(t.chats[0].accion, 'saltear');
    assert.ok(/Sonnet no pudo/.test(t.chats[0].motivo));
  });

  await caso('la guardia se aplica igual: un monto que no salió de una herramienta frena y, sin corregir, escala', async () => {
    sembrar(1);
    sonnetPorTexto([['quiero laja', sonnet.responde(['Te sale $50.000 el metro'])]]);
    await armarTanda();
    const t = tandas.leerTanda(idDeLaTanda());
    assert.strictEqual(t.chats[0].accion, 'escalar');
    assert.ok(/guardia/.test(t.chats[0].motivo), t.chats[0].motivo);
  });

  await caso('con CEREBRO_MODO=apagado no se arma ni se gasta; con el bot apagado tampoco', async () => {
    sembrar(1);
    config.cerebro.modo = 'apagado';
    await enGrupo('#tanda');
    await bot.esperarSegundoPlano();
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.ok(grupoCon(/^❓.*apagado/).length === 1, alGrupo.join('|'));
    config.cerebro.modo = 'nuevos';
    alGrupo.length = 0;
    await enGrupo('#apagar');
    alGrupo.length = 0;
    await enGrupo('#tanda');
    await bot.esperarSegundoPlano();
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.ok(grupoCon(/^❓.*apagado/).length === 1, alGrupo.join('|'));
    await enGrupo('#prender');
  });

  await caso('una tanda a la vez: con otra sin mandar ni descartar, #tanda da ❓ y no gasta', async () => {
    sembrar(1);
    const id = await armarTanda();
    sonnet.guion();
    alGrupo.length = 0;
    await enGrupo('#tanda');
    await bot.esperarSegundoPlano();
    assert.strictEqual(sonnet.pedidos.length, 0);
    const aviso = grupoCon(/^❓/)[0];
    assert.ok(aviso && aviso.includes(`tanda ${id}`) && aviso.includes('sin mandar ni descartar'), aviso);
  });

  await caso('#tanda-no descarta: no manda nada, libera los chats y se puede armar otra', async () => {
    sembrar(1);
    const id = await armarTanda();
    alGrupo.length = 0;
    await enGrupo(`#tanda-no ${id}`);
    assert.ok(grupoCon(/descartada/).length === 1);
    assert.strictEqual(tandas.leerTanda(id).estado, 'descartada');
    assert.strictEqual(aClientes.length, 0);
    await enGrupo(`#tanda-ok ${id}`);
    assert.ok(grupoCon(/^❓.*descartada/).length === 1, 'una descartada no se manda');
    assert.strictEqual(aClientes.length, 0);
    const otra = await armarTanda();
    assert.strictEqual(otra, id + 1);
    assert.strictEqual(tandas.leerTanda(otra).chats.length, 1, 'el chat volvió a entrar');
  });

  console.log('\nNada sale sin #tanda-ok, y al mandar se re-chequea todo\n');

  await caso('nada sale sin #tanda-ok: ni al armar, ni pasado el tiempo', async () => {
    for (let i = 1; i <= 5; i++) sembrar(i);
    await armarTanda();
    await p.dormir(80);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(state.datosDeTandas().chats[jid(numero(1))], undefined, 'nadie queda marcado');
    assert.ok(Object.values(state.todos()).every((s) => s.atiendeSonnet !== true));
  });

  await caso('#tanda-ok manda la tanda, de a un chat, y los respondidos quedan con atiendeSonnet', async () => {
    for (let i = 1; i <= 4; i++) sembrar(i, { hace: i * HORA });
    const id = await armarTanda();
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 4);
    assert.deepStrictEqual([...new Set(aClientes.map((m) => m.numero))].length, 4);
    for (let i = 1; i <= 4; i++) {
      const s = state.todos()[jid(numero(i))];
      assert.strictEqual(s.atiendeSonnet, true);
      assert.ok(s.historial.some((l) => l.quien === 'vendedor'), 'queda en el historial');
      assert.ok(s.botEnvio);
      assert.strictEqual(state.datosDeTandas().chats[jid(numero(i))].resultado, 'enviado');
    }
    assert.strictEqual(tandas.leerTanda(id).estado, 'mandada');
    assert.ok(grupoCon(/^Tanda \d+ mandada: 4 contestados/).length === 1, alGrupo.join('\n---\n'));
    assert.ok(p.aprendizaje.leerTodo().some((e) => e.tipo === 'entrega' && e.origen === 'tanda' && e.tanda === `T${id}`));
  });

  await caso('un segundo #tanda-ok (mientras se manda o después) da ❓ y no manda de nuevo', async () => {
    sembrar(1);
    sembrar(2);
    const id = await armarTanda();
    await enGrupo(`#tanda-ok ${id}`);
    await enGrupo(`#tanda-ok ${id}`);
    await bot.esperarSegundoPlano();
    assert.strictEqual(aClientes.length, 2);
    assert.ok(grupoCon(/^❓.*ya se está mandando/).length === 1, alGrupo.join('|'));
    alGrupo.length = 0;
    await enGrupo(`#tanda-ok ${id}`);
    assert.ok(grupoCon(/^❓.*mandada/).length === 1);
    assert.strictEqual(aClientes.length, 2);
  });

  await caso('#tanda-ok <id> -N la manda sin esos números, y los sacados no vuelven', async () => {
    for (let i = 1; i <= 4; i++) sembrar(i, { hace: i * HORA });
    const id = await armarTanda();
    await mandarTanda(id, ' -2 -4');
    assert.deepStrictEqual(aClientes.map((m) => m.numero).sort(), [jid(numero(1)), jid(numero(3))]);
    assert.strictEqual(state.datosDeTandas().chats[jid(numero(2))].resultado, 'omitido');
    assert.strictEqual(tandas.seleccionar().elegidos.length, 0, 'los sacados a mano tampoco vuelven');
    assert.ok(grupoCon(/Sacados a mano: 2, 4/).length === 1);
  });

  await caso('un número de orden que no existe da ❓ y no manda nada', async () => {
    sembrar(1);
    sembrar(2);
    const id = await armarTanda();
    await mandarTanda(id, ' -7');
    assert.strictEqual(aClientes.length, 0);
    assert.ok(grupoCon(/^❓.*no tiene el número 7/).length === 1, alGrupo.join('|'));
    assert.strictEqual(tandas.leerTanda(id).estado, 'propuesta', 'sigue disponible');
    alGrupo.length = 0;
    await mandarTanda(id, ' -0');
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('una propuesta vence a las 6 h: #tanda-ok da ❓ y no manda; #tanda arma otra', async () => {
    sembrar(1);
    const id = await armarTanda();
    const t = tandas.leerTanda(id);
    assert.ok(Math.abs(t.vence - t.creada - 6 * HORA) < 1000, 'vence a las 6 h');
    t.vence = Date.now() - 1000;
    fs.writeFileSync(tandas.rutaJson(id), JSON.stringify(t));
    state.datosDeTandas().actual.vence = t.vence;
    alGrupo.length = 0;
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 0);
    assert.ok(grupoCon(/^❓.*venció/).length === 1, alGrupo.join('|'));
    assert.strictEqual(tandas.leerTanda(id).estado, 'vencida');
    const otra = await armarTanda();
    assert.strictEqual(otra, id + 1, 'la vencida ya no bloquea');
  });

  await caso('#tanda-no de una propuesta vencida da ❓: ya venció, no hay nada para descartar', async () => {
    sembrar(1);
    const id = await armarTanda();
    const t = tandas.leerTanda(id);
    t.vence = Date.now() - 1000;
    fs.writeFileSync(tandas.rutaJson(id), JSON.stringify(t));
    state.datosDeTandas().actual.vence = t.vence;
    alGrupo.length = 0;
    await enGrupo(`#tanda-no ${id}`);
    assert.ok(grupoCon(/^❓.*ya venció/).length === 1, alGrupo.join('|'));
    assert.strictEqual(tandas.leerTanda(id).estado, 'vencida');
  });

  await caso('si desde la propuesta escribió el cliente, ese chat se saltea y se avisa', async () => {
    const a = sembrar(1);
    sembrar(2);
    const id = await armarTanda();
    state.agregarAlHistorial(a, 'cliente', 'perdón, una cosa más', { id: 'C-NUEVO' });
    await mandarTanda(id);
    assert.deepStrictEqual(aClientes.map((m) => m.numero), [jid(numero(2))]);
    const fin = grupoCon(/^Tanda \d+ mandada/)[0];
    assert.ok(/No salieron 1/.test(fin) && /no le llegaría|dejó de|tanda en curso|escribió/.test(fin), fin);
    assert.strictEqual(state.datosDeTandas().chats[a], undefined, 'el salteado no queda marcado');
  });

  await caso('si desde la propuesta escribió una persona de la cuenta (el estado se enteró), se saltea', async () => {
    const a = sembrar(1);
    sembrar(2);
    const id = await armarTanda();
    state.agregarAlHistorial(a, 'vendedor', 'Hola Juan, yo te atiendo', { humano: true, id: 'H1' });
    state.actualizar(a, { ultimoHumano: Date.now() });
    await mandarTanda(id);
    assert.deepStrictEqual(aClientes.map((m) => m.numero), [jid(numero(2))]);
    assert.ok(/No salieron 1/.test(grupoCon(/^Tanda \d+ mandada/)[0]));
  });

  await caso('si Evolution muestra algo nuevo que el estado no sabe (escribió el cliente o una persona), se saltea', async () => {
    const a = sembrar(1);
    const b = sembrar(2);
    const id = await armarTanda();
    evolution.buscarMensajesDeChat = async (j) => [
      { key: { remoteJid: j, fromMe: j === a, id: 'EV-NUEVO-' + j }, message: { conversation: 'algo nuevo' }, messageTimestamp: Math.floor(Date.now() / 1000) },
    ];
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 0);
    const fin = grupoCon(/^Tanda \d+ mandada/)[0];
    assert.ok(/No salieron 2/.test(fin), fin);
    assert.ok(/una persona de la cuenta escribió/.test(fin) && /el cliente escribió de nuevo/.test(fin), fin);
    assert.ok(b);
  });

  await caso('si no se puede verificar el chat en Evolution al mandar, no se le escribe', async () => {
    sembrar(1);
    const id = await armarTanda();
    evolution.buscarMensajesDeChat = async () => {
      throw new Error('Evolution 500');
    };
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 0);
    assert.ok(/no pude verificar el chat/.test(grupoCon(/^Tanda \d+ mandada/)[0]));
  });

  await caso('los candados de siempre se re-chequean al mandar: excluido, pausado, escalado, #bot, #vendido, #reset', async () => {
    const chats = [1, 2, 3, 4, 5, 6, 7].map((n) => sembrar(n, { hace: n * HORA }));
    const id = await armarTanda();
    state.guardarExcluido(numero(1), { desde: Date.now(), nombre: 'x', origen: 'test' });
    state.actualizar(chats[1], { pausado: true });
    state.actualizar(chats[2], { escalado: true, escaladoCalla: true });
    state.actualizar(chats[3], { atiendeSonnet: false });
    state.actualizar(chats[4], { resultado: { tipo: 'vendido', ts: Date.now() } });
    state.reiniciar(chats[5]);
    await mandarTanda(id);
    assert.deepStrictEqual(aClientes.map((m) => m.numero), [chats[6]]);
    assert.ok(/No salieron 6/.test(grupoCon(/^Tanda \d+ mandada/)[0]));
    // Un chat salteado no se toca: ni ficha, ni propuesta anotada, ni nada de lo que deja una respuesta.
    for (const salteado of chats.slice(1, 5)) {
      const e = state.todos()[salteado];
      assert.ok(e.ultimaRespuestaSonnet === undefined && e.ultimaPropuestaBot === undefined && e.ficha === undefined, salteado);
    }
  });

  await caso('si el chat no le llegaría al cliente (listas de prueba), no sale y se avisa; ya al armar se dice', async () => {
    sembrar(1);
    config.numerosTester = [numero(99)];
    config.pilotoTodos = false;
    const id = await armarTanda();
    assert.ok(grupoCon(/^Tanda \d+:/)[0].includes('no les llegaría'), grupoCon(/^Tanda \d+:/)[0]);
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 0);
    assert.ok(/no le llegaría/.test(grupoCon(/^Tanda \d+ mandada/)[0]));
  });

  await caso('con MODO_BORRADOR, MODO_ESCUCHA o un CEREBRO_MODO que no manda, #tanda-ok da ❓ y no manda', async () => {
    sembrar(1);
    const id = await armarTanda();
    // En escucha ni el grupo recibe nada (motivoBloqueoAvisos): ahí solo se mira que no salga nada al cliente.
    for (const [cambio, hablaAlGrupo] of [[() => (config.modoBorrador = true), true], [() => (config.modoEscucha = true), false], [() => (config.cerebro.modo = 'tester'), true], [() => (config.cerebro.modo = 'sombra'), true]]) {
      config.modoBorrador = false;
      config.modoEscucha = false;
      config.cerebro.modo = 'nuevos';
      cambio();
      alGrupo.length = 0;
      await enGrupo(`#tanda-ok ${id}`);
      await bot.esperarSegundoPlano();
      assert.strictEqual(aClientes.length, 0);
      if (hablaAlGrupo) assert.ok(grupoCon(/^❓ No mando la tanda/).length === 1, alGrupo.join('|'));
      assert.strictEqual(tandas.leerTanda(id).estado, 'propuesta');
    }
  });

  await caso('si el cliente escribe en el medio del envío (mientras "escribe…"), ese chat no recibe nada', async () => {
    const chatId = sembrar(1);
    const id = await armarTanda();
    const original = evolution.mostrarEscribiendo;
    evolution.mostrarEscribiendo = async () => {
      state.agregarAlHistorial(chatId, 'cliente', 'justo ahora', { id: 'C-JUSTO' });
    };
    try {
      await mandarTanda(id);
    } finally {
      evolution.mostrarEscribiendo = original;
    }
    assert.strictEqual(aClientes.length, 0);
    assert.ok(/el cliente escribió en el medio|tanda en curso/.test(grupoCon(/^Tanda \d+ mandada/)[0]), alGrupo.join('|'));
    assert.strictEqual(state.datosDeTandas().chats[chatId], undefined);
  });

  await caso('lo que ya se le dijo se saca otra vez al mandar: si todo era repetido, no sale', async () => {
    const chatId = sembrar(1);
    const id = await armarTanda();
    const dicho = tandas.leerTanda(id).chats[0].mensajes[0];
    // Después de armar la propuesta aparece, más atrás en el chat, lo mismo que Erasmo iba a decir.
    state.obtener(chatId).historial.unshift({ quien: 'vendedor', texto: dicho, ts: Date.now() - 20 * DIA, id: 'V-VIEJO' });
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 0);
    assert.ok(/ya se lo había dicho/.test(grupoCon(/^Tanda \d+ mandada/)[0]), alGrupo.join('|'));
  });

  await caso('si el archivo de la tanda no se puede guardar al mandar, no se manda nada y no queda trabada', async () => {
    sembrar(1);
    const id = await armarTanda();
    const escribir = fs.writeFileSync;
    fs.writeFileSync = (ruta, ...resto) => {
      if (String(ruta).includes(`${id}.json`)) throw new Error('disco lleno');
      return escribir(ruta, ...resto);
    };
    try {
      await mandarTanda(id);
      assert.strictEqual(aClientes.length, 0);
      assert.ok(grupoCon(/^⚠️ No pude guardar el archivo de la tanda/).length === 1, alGrupo.join('|'));
    } finally {
      fs.writeFileSync = escribir;
    }
    alGrupo.length = 0;
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 1, 'con el disco bien, se puede mandar');
  });

  await caso('si algo se rompe a mitad de la tanda, el grupo se entera y la tanda no queda trabada', async () => {
    for (let i = 1; i <= 3; i++) sembrar(i, { hace: i * HORA });
    const id = await armarTanda();
    const interruptor = require('../src/interruptor');
    const prendida = interruptor.prendida;
    const original = evolution.enviarTexto;
    evolution.enviarTexto = async (...args) => {
      const r = await original(...args);
      interruptor.prendida = () => {
        throw new Error('algo se rompió');
      };
      return r;
    };
    try {
      await mandarTanda(id);
    } finally {
      evolution.enviarTexto = original;
      interruptor.prendida = prendida;
    }
    assert.strictEqual(aClientes.length, 1, 'salió uno y se cortó');
    assert.ok(grupoCon(/^⚠️ La tanda \d+ se cortó por un error \(algo se rompió\)/).length === 1, alGrupo.join('|'));
    assert.strictEqual(tandas.leerTanda(id).estado, 'mandada', 'queda cerrada, no "mandando"');
    assert.strictEqual(state.datosDeTandas().actual, null, 'no bloquea a la próxima');
    const otra = await armarTanda();
    assert.strictEqual(otra, id + 1);
  });

  await caso('un #apagar mientras se manda frena lo que falta', async () => {
    for (let i = 1; i <= 3; i++) sembrar(i, { hace: i * HORA });
    const id = await armarTanda();
    const original = evolution.enviarTexto;
    let enviados = 0;
    evolution.enviarTexto = async (...args) => {
      const r = await original(...args);
      if (++enviados === 1) await enGrupo('#apagar');
      return r;
    };
    try {
      await mandarTanda(id);
    } finally {
      evolution.enviarTexto = original;
      await enGrupo('#prender');
    }
    assert.strictEqual(aClientes.length, 1, 'solo salió el primero');
    assert.ok(/No salieron 2/.test(grupoCon(/^Tanda \d+ mandada/)[0]));
  });

  await caso('no contestar: no sale nada, no avisa y el chat queda marcado (no vuelve a una tanda)', async () => {
    sembrar(1, { texto: 'gracias, ya compré' });
    sonnetPorTexto([['ya compré', [sonnet.usar('no_contestar', { motivo: 'ya compró' })]]]);
    const id = await armarTanda();
    alGrupo.length = 0;
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(state.datosDeTandas().chats[jid(numero(1))].resultado, 'no_contestar');
    assert.strictEqual(tandas.seleccionar().elegidos.length, 0);
    assert.ok(grupoCon(/🔕|SIN RESPUESTA/).length === 0, 'no escala ni avisa por el chat');
  });

  await caso('escalar sale como un escalado normal: el 🔕 al grupo y, una vez, "Enseguida te respondemos."', async () => {
    const chatId = sembrar(1, { texto: 'necesito envío a Plottier' });
    sonnetPorTexto([['Plottier', sonnet.escala('pide envío fuera de Neuquén')]]);
    const id = await armarTanda();
    await mandarTanda(id);
    assert.deepStrictEqual(aClientes, [{ numero: chatId, texto: bot.AVISO_ESCALADO }]);
    assert.ok(grupoCon(/SIN RESPUESTA/).length === 1);
    const s = state.todos()[chatId];
    assert.strictEqual(s.escalado, true);
    assert.strictEqual(state.datosDeTandas().chats[chatId].resultado, 'escalado');
    assert.ok(grupoCon(/^Tanda \d+ mandada: 0 contestados, 1 escalados/).length === 1, alGrupo.join('\n---\n'));
  });

  await caso('las marcas de la tanda sobreviven a #reset del chat', async () => {
    const chatId = sembrar(1);
    const id = await armarTanda();
    await mandarTanda(id);
    assert.strictEqual(aClientes.length, 1);
    state.reiniciar(chatId);
    assert.strictEqual(state.datosDeTandas().chats[chatId].resultado, 'enviado');
  });

  await caso('el catálogo y el seguimiento que pidió Sonnet salen al mandar, no antes', async () => {
    const chatId = sembrar(1, { texto: 'quiero ver el catalogo' });
    const manana = new Date(Date.now() + 10 * DIA).toISOString().slice(0, 10);
    sonnetPorTexto([
      [
        'quiero ver el catalogo',
        [sonnet.usar('mandar_catalogo', {}), sonnet.usar('agendar_seguimiento', { fecha: manana, motivo: 'volver a preguntar' }), sonnet.usar('responder', { mensajes: ['Te lo mando, mirá y me contás qué te gusta.'] })],
      ],
    ]);
    const docs = require('../src/documentos');
    const rutaOriginal = docs.ruta;
    docs.ruta = () => __filename;
    try {
      const id = await armarTanda();
      assert.strictEqual(aClientes.length, 0, 'al armar no sale el catálogo');
      assert.strictEqual(state.todos()[chatId].seguimiento, undefined, 'ni se anota el seguimiento');
      const t = tandas.leerTanda(id);
      assert.strictEqual(t.chats[0].accion, 'responder');
      assert.ok(t.chats[0].acciones.catalogo && t.chats[0].acciones.seguimiento);
      await mandarTanda(id);
    } finally {
      docs.ruta = rutaOriginal;
    }
    assert.ok(aClientes.some((m) => m.texto === '[documento]'), JSON.stringify(aClientes));
    assert.ok(state.todos()[chatId].seguimiento && state.todos()[chatId].seguimiento.fecha === manana);
  });

  console.log('\nLo que el bot escribe al grupo no se vuelve a ejecutar\n');

  await caso('el eco de cada mensaje del bot al grupo (resumen, ❓, avisos) no dispara ningún comando', async () => {
    for (let i = 1; i <= 3; i++) sembrar(i);
    const id = await armarTanda();
    await enGrupo('#tanda');
    await bot.esperarSegundoPlano();
    await enGrupo(`#tanda-ok ${id} -9`);
    await mandarTanda(id);
    await enGrupo(`#tanda-ok ${id}`);
    await enGrupo('#tanda 5');
    const textos = [...alGrupo];
    assert.ok(textos.length >= 6);
    const antesCliente = aClientes.length;
    const antesPedidos = sonnet.pedidos.length;
    const siguiente = state.datosDeTandas().siguiente;
    alGrupo.length = 0;
    for (const t of textos) await enGrupo(t);
    await bot.esperarSegundoPlano();
    assert.strictEqual(alGrupo.length, 0, 'no contestó a ningún eco: ' + alGrupo.join('|'));
    assert.strictEqual(aClientes.length, antesCliente);
    assert.strictEqual(sonnet.pedidos.length, antesPedidos);
    assert.strictEqual(state.datosDeTandas().siguiente, siguiente);
    assert.ok(textos.every((t) => !t.trim().startsWith('#')), 'ningún mensaje del bot empieza con #');
  });

  p.fin();
})();

/** Cuántas `entrega` hay en el registro (al armar no tiene que haber ninguna). */
function aprendizajeSinEntregas() {
  return p.aprendizaje.leerTodo().filter((e) => e.tipo === 'entrega').length;
}
