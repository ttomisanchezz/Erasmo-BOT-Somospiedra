'use strict';
/**
 * Tandas y lo que no se contesta, con Sonnet y Evolution de mentira (poda de iPhone, 19/10/2026):
 *   1. dos mensajes que llegan durante la espera van juntos en UN pedido a Sonnet;
 *   2. un mensaje que llega mientras se manda la respuesta la corta, y la tanda siguiente contesta todo;
 *   3. el techo de caracteres de una tanda;
 *   4. un audio que no se entendió no se contesta: escala en silencio (sin callar el chat);
 *   5. un chat sin número (@lid) no se procesa y avisa al grupo sin el texto;
 *   6. un contacto personal se ignora entero;
 *   7. un pedido del catálogo sin texto escala; una foto suelta no dispara nada.
 *
 *   node test/piedra-tandas.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos', ESPERA_MIN_MS: '60', ESPERA_MAX_MS: '61' });
const { bot, config, sonnet, aClientes, alGrupo, mensaje, state, jid, eventos, dormir, check } = p;
const audio = require('../src/audio');
const evolution = require('../src/evolution');

let n = 300;
const nuevo = () => `54900000${String(++n).padStart(5, '0')}`;

(async () => {
  console.log('\nTandas\n');

  await check('dos mensajes durante la espera: un solo pedido a Sonnet, con los dos', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.responde(['hola! si, tenemos']));
    const primero = bot.procesar(mensaje(num, 'hola'));
    await dormir(10);
    await bot.procesar(mensaje(num, 'tienen laja?'));
    await primero;
    assert.strictEqual(sonnet.pedidos.length, 1, 'le preguntó a Sonnet dos veces');
    assert.match(sonnet.textoDelPedido(0), /"""\nhola\ntienen laja\?\n"""/);
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola! si, tenemos']);
  });

  await check('un mensaje nuevo mientras se manda la respuesta la corta; la siguiente contesta los dos juntos', async () => {
    const num = nuevo();
    // El primer mensaje se manda; antes del segundo llega uno nuevo del cliente.
    let enviados = 0;
    const enviarReal = evolution.enviarTexto;
    let llegoElNuevo = null;
    evolution.enviarTexto = async (numero, texto) => {
      const r = await enviarReal(numero, texto);
      if (++enviados === 1) llegoElNuevo = bot.procesar(mensaje(num, 'y piedra bola?'));
      return r;
    };
    try {
      sonnet.guion(sonnet.responde(['uno', 'dos', 'tres']), sonnet.responde(['te cuento de las dos']));
      await bot.procesar(mensaje(num, 'tienen laja?'));
      await llegoElNuevo;
    } finally {
      evolution.enviarTexto = enviarReal;
    }
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['uno', 'te cuento de las dos']);
    assert.strictEqual(sonnet.pedidos.length, 2);
    assert.match(sonnet.textoDelPedido(1), /"""\ntienen laja\?\ny piedra bola\?\n"""/);
    assert.ok(eventos(num, 'silencio').some((e) => e.motivo === 'corte' && e.sinMandar === 2));
  });

  await check('techo: si la tanda pasa de TECHO_TANDA caracteres, el resto va en la siguiente, en orden', async () => {
    const num = nuevo();
    const largo = 'x'.repeat(bot.TECHO_TANDA - 10);
    sonnet.guion(sonnet.responde(['primera']), sonnet.responde(['segunda']));
    const primero = bot.procesar(mensaje(num, largo));
    await dormir(10);
    await bot.procesar(mensaje(num, 'y esto que pasa el techo'));
    await primero;
    assert.strictEqual(sonnet.pedidos.length, 2);
    assert.ok(!/pasa el techo/.test(sonnet.textoDelPedido(0).split('"""')[1]), 'la primera tanda trae el que pasaba el techo');
    assert.match(sonnet.textoDelPedido(1).split('"""')[1], /y esto que pasa el techo/);
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['primera', 'segunda']);
  });

  await check('lo que cita el cliente llega a Sonnet como "[responde a: …]"', async () => {
    const num = nuevo();
    sonnet.guion(sonnet.escala('pregunta precio de un producto del catálogo'));
    const m = mensaje(num, '', {
      message: { extendedTextMessage: { text: 'a qué precio está?', contextInfo: { quotedMessage: { conversation: 'Laja patagónica gris' } } } },
    });
    await bot.procesar(m);
    assert.match(sonnet.textoDelPedido(0), /\[responde a: Laja patagónica gris\] a qué precio está\?/);
    assert.strictEqual(state.todos()[jid(num)].ultimoMensajeCliente, 'a qué precio está?');
  });

  console.log('\nAudios\n');

  await check('un audio que no se entendió: no le pregunta a Sonnet, al cliente nada y 🔕 al grupo', async () => {
    const num = nuevo();
    const real = audio.transcribir;
    audio.transcribir = async () => ({ ok: false, motivo: 'el audio no se entiende' });
    try {
      await bot.procesar(mensaje(num, '', { message: { audioMessage: { seconds: 4 } } }));
    } finally {
      audio.transcribir = real;
    }
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(alGrupo.length, 1);
    assert.match(alGrupo[0], /🔕 SIN RESPUESTA/);
    assert.match(alGrupo[0], /audio y no se pudo transcribir/);
    const s = state.todos()[jid(num)];
    assert.strictEqual(s.historial[0].texto, '[audio que no se entendio]');
    assert.strictEqual(s.escalado, true);
    assert.strictEqual(s.escaladoCalla, false, 'el audio no entendido calló el chat');
  });

  await check('un audio claro va a Sonnet como texto', async () => {
    const num = nuevo();
    const real = audio.transcribir;
    audio.transcribir = async () => ({ ok: true, texto: 'hola, tienen granza?' });
    try {
      sonnet.guion(sonnet.escala('pregunta por granza'));
      await bot.procesar(mensaje(num, '', { message: { audioMessage: { seconds: 4 } } }));
    } finally {
      audio.transcribir = real;
    }
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.match(sonnet.textoDelPedido(0), /en un audio transcripto/);
    assert.match(sonnet.textoDelPedido(0), /tienen granza/);
  });

  console.log('\nLo que no se procesa\n');

  await check('un chat sin número (@lid): no se guarda, no va a Sonnet y avisa al grupo sin el texto', async () => {
    const lid = '123456789012345@lid';
    await bot.procesar(mensaje(lid, 'hola soy un secreto', { pushName: 'Alguien' }));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.ok(!state.todos()[lid], 'guardó el chat sin número');
    assert.deepStrictEqual(aClientes, []);
    assert.strictEqual(alGrupo.length, 1);
    assert.match(alGrupo[0], /📵 SIN NÚMERO · Alguien/);
    assert.ok(!/secreto/.test(alGrupo[0]), 'el aviso lleva el texto');
  });

  await check('un contacto personal se ignora entero: ni estado, ni Sonnet, ni grupo', async () => {
    const num = nuevo();
    config.contactosPersonales.push(num);
    try {
      await bot.procesar(mensaje(num, 'hola, todo bien?'));
      await bot.procesar(mensaje(num, '', { message: { audioMessage: { seconds: 2 } } }));
    } finally {
      config.contactosPersonales.pop();
    }
    assert.ok(!state.todos()[jid(num)], 'guardó un contacto personal');
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(aClientes, []);
    assert.deepStrictEqual(alGrupo, []);
  });

  await check('un pedido del catálogo sin texto escala con el nombre del producto; al cliente solo "Enseguida te respondemos."', async () => {
    const num = nuevo();
    await bot.procesar(mensaje(num, '', { message: { orderMessage: { orderTitle: 'Laja patagónica' } } }));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(aClientes, [{ numero: jid(num), texto: 'Enseguida te respondemos.' }]);
    assert.match(alGrupo[0], /pedido del catálogo de WhatsApp: Laja patagónica/);
  });

  await check('una foto suelta, sin texto ni tanda abierta, no dispara nada', async () => {
    const num = nuevo();
    await bot.procesar(mensaje(num, '', { message: { imageMessage: { mimetype: 'image/jpeg' } } }));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.deepStrictEqual(aClientes, []);
    assert.deepStrictEqual(alGrupo, []);
  });

  await check('una foto que llega con una tanda abierta la ve Sonnet', async () => {
    const num = nuevo();
    const real = evolution.base64DeMedia;
    evolution.base64DeMedia = async () => ({ base64: Buffer.from('foto de mentira').toString('base64'), mimetype: 'image/jpeg' });
    try {
      sonnet.guion(sonnet.escala('mandó una foto de su patio'));
      const primero = bot.procesar(mensaje(num, 'mirá mi patio'));
      await dormir(10);
      await bot.procesar(mensaje(num, '', { message: { imageMessage: { mimetype: 'image/jpeg' } } }));
      await primero;
    } finally {
      evolution.base64DeMedia = real;
    }
    assert.strictEqual(sonnet.pedidos.length, 1);
    const contenido = sonnet.pedidos[0].body.messages[0].content;
    assert.ok(contenido.some((b) => b.type === 'image'), 'Sonnet no vio la foto');
    assert.match(sonnet.textoDelPedido(0), /mandó una foto/);
  });

  p.fin();
})();
