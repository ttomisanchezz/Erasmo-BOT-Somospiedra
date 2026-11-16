'use strict';
/**
 * Lo que Erasmo sabe del anuncio del que vino el chat (revisión de la sombra, 16/11/2026): en 88 chats Fran
 * contestó sabiendo de qué anuncio venía el cliente y Erasmo no lo sabía. El pedido lleva el título.
 *
 *   node test/erasmo-anuncio.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'tester' });
const { check } = p;
const cerebro = require('../src/cerebro');

(async () => {
  console.log('\nEl anuncio en el pedido\n');
  await check('con anuncio: el pedido dice de qué anuncio vino (título)', async () => {
    const s = { historial: [], anuncio: { id: '120251070323040411', titulo: 'Somos Piedra, elija piedra' } };
    const { texto } = cerebro.armarContexto(s, 'Hola, precio?', null, Date.now());
    assert.match(texto, /vino de un anuncio de Meta: "Somos Piedra, elija piedra"/);
  });
  await check('anuncio sin título: dice que vino de un anuncio, sin inventar el título', async () => {
    const s = { historial: [], anuncio: { id: '1' } };
    const { texto } = cerebro.armarContexto(s, 'Hola', null, Date.now());
    assert.match(texto, /vino de un anuncio de Meta \(sin título\)/);
  });
  await check('si después llegó desde otro anuncio, va el último', async () => {
    const s = { historial: [], anuncio: { id: '1', titulo: 'Viejo' }, anuncioUltimo: { id: '2', titulo: 'Tu jardín listo en un finde' } };
    const { texto } = cerebro.armarContexto(s, 'Hola', null, Date.now());
    assert.match(texto, /"Tu jardín listo en un finde"/);
    assert.doesNotMatch(texto, /"Viejo"/);
  });
  await check('sin anuncio: no dice nada de anuncios', async () => {
    const { texto } = cerebro.armarContexto({ historial: [] }, 'Hola', null, Date.now());
    assert.doesNotMatch(texto, /anuncio/i);
  });
  p.fin ? p.fin() : process.exit(0);
})();
