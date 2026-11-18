'use strict';
/**
 * cotizar_envio (Tomás, 17/11/2026, opción A): Erasmo dice el costo del envío él mismo. Neuquén capital $35.000,
 * Alto Valle cercano $45.000 (Fran, 17/11); una localidad que no está en la lista escala. Los montos los pone el código.
 */
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const assert = require('assert');
const { check, fin, state, cerebro } = p;
const herr = require('../src/herramientas-erasmo');

const envio = herr.HERRAMIENTAS.find((h) => h.definicion.name === 'cotizar_envio');
const turno = (extra = {}) => ({ montos: [], acciones: {}, cotizo: null, chatId: null, enVivo: true, ahora: Date.now(), ...extra });

(async () => {
  console.log('cotizar_envio');
  await check('existe y pide la localidad', async () => {
    assert.ok(envio, 'no está cotizar_envio');
    assert.deepStrictEqual(envio.definicion.input_schema.required, ['localidad']);
  });
  await check('Neuquén capital: $35.000 y la guardia lo deja escribir', async () => {
    for (const loc of ['Neuquén', 'neuquen capital', 'NQN', 'Neuquén Capital.']) {
      const t = turno();
      const r = await envio.correr({ localidad: loc }, t);
      assert.strictEqual(r.ok, true, loc);
      assert.strictEqual(r.envio, '$35.000', loc);
      assert.deepStrictEqual(t.montos, [35000], loc);
    }
  });
  await check('Alto Valle cercano: $45.000 (Plottier, Centenario, Cipolletti…)', async () => {
    for (const loc of ['Plottier', 'Centenario', 'Cipolletti', 'Cinco Saltos', 'Senillosa', 'Fernández Oro', 'Vista Alegre', 'Allen']) {
      const t = turno();
      const r = await envio.correr({ localidad: loc }, t);
      assert.strictEqual(r.ok, true, loc);
      assert.strictEqual(r.envio, '$45.000', loc);
      assert.deepStrictEqual(t.montos, [45000], loc);
    }
  });
  await check('una localidad que no está en la lista escala (sin monto)', async () => {
    for (const loc of ['Bariloche', 'General Roca', 'Zapala', '', 'cualquier lado']) {
      const t = turno();
      const r = await envio.correr({ localidad: loc }, t);
      assert.ok(r.error, loc);
      assert.match(r.error, /escal/i, loc);
      assert.deepStrictEqual(t.montos, [], loc);
    }
  });
  await check('con algo cotizado en el mismo turno: total con envío (lo suma el código)', async () => {
    const t = turno({ cotizo: { producto: 'Granza roja', cantidad: '12', unidad: 'bolsas', pago: 'efectivo', factura: false, totalCentavos: 24000000 } });
    const r = await envio.correr({ localidad: 'Plottier' }, t);
    assert.strictEqual(r.total_con_envio, '$285.000');
    assert.deepStrictEqual(t.montos, [45000, 285000]);
  });
  await check('con algo cotizado antes en el chat (la ficha): total con envío', async () => {
    const chatId = '5490000000777@s.whatsapp.net';
    state.actualizar(chatId, { ficha: { pidio: { producto: 'Adoquines ojito', cantidad: '10', unidad: 'm²', pago: 'tarjeta', factura: false, totalCentavos: 40500000 } } });
    const t = turno({ chatId });
    const r = await envio.correr({ localidad: 'Neuquén' }, t);
    assert.strictEqual(r.total_con_envio, '$440.000');
    assert.match(r.total_de, /Adoquines ojito/);
    assert.deepStrictEqual(t.montos, [35000, 440000]);
  });
  await check('sin nada cotizado: solo el envío', async () => {
    const t = turno({ chatId: '5490000000778@s.whatsapp.net' });
    const r = await envio.correr({ localidad: 'Cipolletti' }, t);
    assert.strictEqual(r.total_con_envio, undefined);
    assert.deepStrictEqual(t.montos, [45000]);
  });
  await check('la guardia deja pasar el envío que devolvió la herramienta y frena otro monto', async () => {
    const t = turno();
    await envio.correr({ localidad: 'Plottier' }, t);
    const ok = cerebro.revisarSalida(['El envío a Plottier es $45.000.'], t.montos);
    assert.strictEqual(ok.guardia, null);
    const mal = cerebro.revisarSalida(['El envío a Plottier es $40.000.'], t.montos);
    assert.ok(mal.guardia);
  });
  fin();
})();
