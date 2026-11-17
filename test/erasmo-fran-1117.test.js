'use strict';
/**
 * Lo que Erasmo sabe en el pedido tras las respuestas de Fran y Tomás del 16-17/11/2026 (corrida 2026-11-17a):
 * qué colores de granza faltan hoy (#sinstock) y si lo último cotizado pasa $1.000.000 (cuotas / pagar en partes).
 * La comparación con el millón la hace el código, no Sonnet.
 *
 *   node test/erasmo-fran-1117.test.js
 */
const assert = require('assert');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'tester' });
const { check } = p;
const cerebro = require('../src/cerebro');
const stock = require('../src/stock-colores');
const ficha = require('../src/ficha');

const ctx = (s) => cerebro.armarContexto({ historial: [], ...s }, 'Hola', null, Date.now()).texto;

(async () => {
  console.log('\nSin stock en el pedido\n');
  await check('todo en stock: el pedido no dice nada de stock', async () => {
    assert.doesNotMatch(ctx({}), /NO hay stock/);
  });
  await check('con un color sin stock: el pedido lo dice, para todos los chats, y manda a no mencionarlo ni cotizarlo', async () => {
    try {
      stock.desdeGrupo({ tipo: 'sinstock', resto: 'roja' });
      const t = ctx({});
      assert.match(t, /hoy NO hay stock de: Granza roja/);
      assert.match(t, /no lo ofrezcas ni lo menciones/i);
      assert.match(t, /no lo cotices/);
      assert.doesNotMatch(t, /Granza gris Tandil|Granza blanca/);
    } finally {
      stock.desdeGrupo({ tipo: 'hay', resto: 'roja' });
    }
    assert.doesNotMatch(ctx({}), /NO hay stock/);
  });

  console.log('\nCuotas: lo último cotizado y el millón\n');
  const pidio = (totalCentavos, extra = {}) => ({ ficha: { pidio: { producto: 'Granza roja', cantidad: '60', unidad: 'bolsas', totalCentavos, ...extra } } });
  await check('el umbral es de $1.000.000 y "pasa" es mayor: exactamente $1.000.000 no', async () => {
    assert.strictEqual(ficha.UMBRAL_PAGAR_EN_PARTES_CENTAVOS, 100000000);
    assert.strictEqual(ficha.pasaElUmbralDePagarEnPartes(100000000), false);
    assert.strictEqual(ficha.pasaElUmbralDePagarEnPartes(100000100), true);
    assert.strictEqual(ficha.pasaElUmbralDePagarEnPartes(undefined), false);
  });
  await check('compra de $1.500.000: el pedido dice que es grande y cómo escalar (con el monto para el grupo)', async () => {
    const t = ctx(pidio(150000000));
    assert.match(t, /fue de \$1\.500\.000: es una compra grande/);
    assert.match(t, /pide pagar en partes, compra de \$1\.500\.000/);
    assert.match(t, /no se lo digas al cliente/);
  });
  await check('compra de $930.000: no es grande, "por ahora no hay cuotas" y se sigue', async () => {
    const t = ctx(pidio(93000000));
    assert.match(t, /fue de \$930\.000: no es una compra grande/);
    assert.match(t, /por ahora no hay y seguís/);
    assert.doesNotMatch(t, /pide pagar en partes/);
  });
  await check('sin total guardado (fichas de antes) o sin nada cotizado: no dice nada de cuotas', async () => {
    assert.doesNotMatch(ctx({ ficha: { pidio: { producto: 'Granza roja', cantidad: '12', unidad: 'bolsas' } } }), /compra grande/);
    assert.doesNotMatch(ctx({}), /lo último que cotizaste/);
  });
  p.fin ? p.fin() : process.exit(0);
})();
