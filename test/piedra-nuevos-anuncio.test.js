'use strict';
/**
 * CEREBRO_MODO=nuevos con un chat que llega desde un anuncio de Meta (18/11/2026, primera noche en vivo).
 * Anotar el anuncio (`state.obtener`) creaba el chat en el estado ANTES de mirar `esChatNuevo`, así que
 * todo chat nuevo que venía de un anuncio quedaba en sombra y no se le contestaba.
 *
 *   node test/piedra-nuevos-anuncio.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'nuevos' });
const { check, bot, sonnet, cerebro, jid, mensaje } = p;

const AD = { sourceId: '120251319879590411', title: 'Somos Piedra, elija piedra' };
const desdeAnuncio = (numero, texto) =>
  mensaje(numero, texto, { message: { extendedTextMessage: { text: texto, contextInfo: { externalAdReply: AD } } } });

(async () => {
  console.log('\nModo nuevos: chats que llegan desde un anuncio\n');
  await check('chat nuevo desde un anuncio: lo atiende Sonnet y le contesta', async () => {
    const num = '5490000077001';
    sonnet.guion(sonnet.responde(['Hola! Cómo estás?']));
    await bot.procesar(desdeAnuncio(num, 'Hola! Quiero cubrir el patio con granza'));
    assert.strictEqual(cerebro.quienAtiende(jid(num)), 'sonnet');
    assert.ok(await p.esperar(() => p.aClientes.some((m) => m.texto === 'Hola! Cómo estás?')), 'no le contestó');
    assert.strictEqual(p.state.todos()[jid(num)].anuncio.id, AD.sourceId, 'el anuncio tiene que quedar anotado');
  });
  await check('chat nuevo sin anuncio: también lo atiende Sonnet (control)', async () => {
    const num = '5490000077002';
    sonnet.guion(sonnet.responde(['Hola!']));
    await bot.procesar(mensaje(num, 'Hola, precio de la granza?'));
    assert.strictEqual(cerebro.quienAtiende(jid(num)), 'sonnet');
    assert.ok(await p.esperar(() => p.aClientes.some((m) => m.texto === 'Hola!')), 'no le contestó');
  });
  await check('un chat que ya existía (escribió antes) sigue en sombra aunque venga de un anuncio', async () => {
    const num = '5490000077003';
    p.state.actualizar(jid(num), { historial: [{ quien: 'cliente', texto: 'hola', ts: Date.now() - 86400000 }] });
    await bot.procesar(desdeAnuncio(num, 'Hola de nuevo'));
    assert.strictEqual(cerebro.quienAtiende(jid(num)), 'sombra');
  });
  p.fin();
})();
