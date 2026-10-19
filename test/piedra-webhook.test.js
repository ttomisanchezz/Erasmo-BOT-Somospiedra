'use strict';
/**
 * El webhook no le cree a cualquiera (auditoría A1), con Sonnet y Evolution de mentira (poda de iPhone,
 * 19/10/2026). Por HTTP de verdad contra el puerto del bot (en 127.0.0.1, puerto libre):
 *   1. con WEBHOOK_SECRETO: /webhook pelado o con otro secreto da 401 y no procesa;
 *   2. el tope de pedidos por minuto (429), que los 401 no gastan;
 *   3. la validación del cuerpo: 400 (sin event, sin remoteJid, JSON roto), 403 (otra instancia, también
 *      somosiphone), 200 y nada para un evento que no es de mensajes;
 *   4. un mensaje repetido (mismo id) se procesa una sola vez;
 *   5. dos mensajes seguidos por el webhook se contestan juntos.
 *
 *   node test/piedra-webhook.test.js
 */
const assert = require('assert');
const http = require('http');
const SECRETO = 'secretoDePrueba123';
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos', WEBHOOK_SECRETO: SECRETO, WEBHOOK_MAX_POR_MINUTO: '30', ESPERA_MIN_MS: '40', ESPERA_MAX_MS: '41' });
const { bot, config, sonnet, aClientes, mensaje, state, jid, esperar, check } = p;

let servidor;
let puerto;
function pedir(metodo, ruta, cuerpo, { crudo = null } = {}) {
  return new Promise((resolver, rechazar) => {
    const datos = crudo != null ? crudo : cuerpo === undefined ? '' : JSON.stringify(cuerpo);
    const req = http.request(
      { host: '127.0.0.1', port: puerto, method: metodo, path: ruta, headers: { 'content-type': 'application/json', 'content-length': Buffer.byteLength(datos) } },
      (res) => {
        let texto = '';
        res.on('data', (c) => (texto += c));
        res.on('end', () => resolver({ status: res.statusCode, texto }));
      }
    );
    req.on('error', rechazar);
    req.end(datos);
  });
}

let n = 700;
const nuevo = () => `54900000${String(++n).padStart(5, '0')}`;
const upsert = (data, extra = {}) => ({ event: 'messages.upsert', instance: 'somospiedra', data, ...extra });

(async () => {
  servidor = bot.escuchar(0, '127.0.0.1');
  await new Promise((r) => servidor.once('listening', r));
  puerto = servidor.address().port;

  console.log('\nEl secreto\n');

  await check('sin el secreto, o con otro: 401 y no procesa', async () => {
    bot.reiniciarTopeWebhook();
    const num = nuevo();
    for (const ruta of ['/webhook', '/webhook/otro', '/webhook/' + SECRETO.slice(0, -1)]) {
      const r = await pedir('POST', ruta, upsert(mensaje(num, 'hola')));
      assert.strictEqual(r.status, 401, ruta);
    }
    await p.dormir(60);
    assert.ok(!state.todos()[jid(num)], 'procesó un pedido sin secreto');
    assert.strictEqual(sonnet.pedidos.length, 0);
  });

  console.log('\nEl tope por minuto\n');

  await check('pasado WEBHOOK_MAX_POR_MINUTO, 429; los 401 no gastan el tope', async () => {
    bot.reiniciarTopeWebhook();
    for (let i = 0; i < 40; i++) assert.strictEqual((await pedir('POST', '/webhook', { event: 'x' })).status, 401);
    const estados = [];
    for (let i = 0; i < config.webhook.maxPorMinuto + 2; i++) {
      estados.push((await pedir('POST', '/webhook/' + SECRETO, { event: 'connection.update', instance: 'somospiedra', data: {} })).status);
    }
    assert.deepStrictEqual(estados.slice(0, config.webhook.maxPorMinuto), Array(config.webhook.maxPorMinuto).fill(200));
    assert.deepStrictEqual(estados.slice(-2), [429, 429]);
    bot.reiniciarTopeWebhook();
  });

  console.log('\nEl cuerpo\n');

  await check('400 sin event, sin remoteJid o con JSON roto; 200 y nada para otro evento', async () => {
    bot.reiniciarTopeWebhook();
    const ruta = '/webhook/' + SECRETO;
    assert.strictEqual((await pedir('POST', ruta, { instance: 'somospiedra', data: {} })).status, 400);
    assert.strictEqual((await pedir('POST', ruta, upsert({ key: { remoteJid: 12345 } }))).status, 400);
    assert.strictEqual((await pedir('POST', ruta, upsert(null))).status, 400);
    assert.strictEqual((await pedir('POST', ruta, null, { crudo: '{"event": "messages.upsert", roto' })).status, 400);
    assert.strictEqual((await pedir('POST', ruta, { event: 'connection.update', instance: 'somospiedra', data: { state: 'open' } })).status, 200);
  });

  await check('403 si es de otra instancia (también somosiphone); sin el campo instance, se acepta', async () => {
    bot.reiniciarTopeWebhook();
    const ruta = '/webhook/' + SECRETO;
    const num = nuevo();
    assert.strictEqual((await pedir('POST', ruta, upsert(mensaje(num, 'hola'), { instance: 'somosiphone' }))).status, 403);
    assert.strictEqual((await pedir('POST', ruta, upsert(mensaje(num, 'hola'), { instance: 'otra' }))).status, 403);
    await p.dormir(60);
    assert.ok(!state.todos()[jid(num)], 'procesó un mensaje de otra instancia');
    sonnet.porDefecto = sonnet.escala('algo');
    try {
      const cuerpo = upsert(mensaje(num, 'hola'));
      delete cuerpo.instance;
      assert.strictEqual((await pedir('POST', ruta, cuerpo)).status, 200);
      assert.ok(await esperar(() => Boolean(state.todos()[jid(num)])), 'no lo procesó');
      await esperar(() => sonnet.pedidos.length > 0);
      await p.dormir(30);
    } finally {
      sonnet.porDefecto = null;
    }
  });

  console.log('\nRepetidos y tandas por el webhook\n');

  await check('el mismo mensaje dos veces (mismo id): una sola línea en el historial y un solo pedido a Sonnet', async () => {
    bot.reiniciarTopeWebhook();
    const num = nuevo();
    sonnet.guion(sonnet.responde(['hola!']));
    const m = mensaje(num, 'hola', { id: 'REPETIDO-1' });
    assert.strictEqual((await pedir('POST', '/webhook/' + SECRETO, upsert(m))).status, 200);
    assert.strictEqual((await pedir('POST', '/webhook/' + SECRETO, upsert(m))).status, 200);
    await esperar(() => aClientes.length > 0);
    await p.dormir(60);
    assert.strictEqual(state.todos()[jid(num)].historial.filter((l) => l.quien === 'cliente').length, 1);
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.deepStrictEqual(aClientes.map((x) => x.texto), ['hola!']);
    assert.ok((await bot.datosDeSalud()).duplicadosDescartados >= 1);
  });

  await check('dos mensajes seguidos por el webhook se contestan juntos (no se pierde el segundo)', async () => {
    bot.reiniciarTopeWebhook();
    const num = nuevo();
    sonnet.guion(sonnet.responde(['te cuento']));
    await pedir('POST', '/webhook/' + SECRETO, upsert(mensaje(num, 'hola')));
    await pedir('POST', '/webhook/' + SECRETO, upsert(mensaje(num, 'tienen granza?')));
    await esperar(() => aClientes.length > 0);
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.match(sonnet.textoDelPedido(0), /"""\nhola\ntienen granza\?\n"""/);
  });

  await check('/salud contesta sin datos de clientes ni el secreto', async () => {
    const r = await pedir('GET', '/salud');
    assert.strictEqual(r.status, 200);
    const s = JSON.parse(r.texto);
    assert.strictEqual(s.ok, true);
    assert.strictEqual(s.webhookConSecreto, true);
    assert.ok(!r.texto.includes(SECRETO), '/salud muestra el secreto');
    assert.ok(!/5490000/.test(r.texto), '/salud muestra un número de cliente');
  });

  servidor.close();
  p.fin();
})();
