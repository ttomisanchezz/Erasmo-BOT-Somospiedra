'use strict';
/**
 * De qué anuncio vino un chat (src/anuncio.js) y el reporte por anuncio (herramientas/anuncios/reporte.js).
 *
 *   node test/anuncio.test.js
 *
 * Unitario (sin red ni estado real). Lo que pasa por el webhook lo prueba test/piedra-webhook.test.js.
 */
const assert = require('assert');
const { anuncioDe, cambiosDeEstado } = require('../src/anuncio');
const { resumir } = require('../herramientas/anuncios/reporte');

let fallas = 0;
function check(nombre, fn) {
  try {
    fn();
    console.log('  ok  ' + nombre);
  } catch (e) {
    fallas += 1;
    console.log('  MAL ' + nombre + '\n      ' + e.message);
  }
}

const ad = { sourceId: '120250759618840411', sourceType: 'ad', title: 'Tu jardín listo en un finde', sourceUrl: 'https://fb.me/x' };

console.log('\nanuncioDe\n');
check('en el contextInfo del extendedTextMessage (Baileys)', () => {
  const a = anuncioDe({ message: { extendedTextMessage: { text: 'hola', contextInfo: { externalAdReply: ad } } } });
  assert.deepStrictEqual(a, { id: '120250759618840411', titulo: 'Tu jardín listo en un finde', url: 'https://fb.me/x', tipo: 'ad' });
});
check('en data.contextInfo (Evolution v2)', () => {
  const a = anuncioDe({ message: { conversation: 'hola' }, contextInfo: { externalAdReply: ad } });
  assert.strictEqual(a.id, '120250759618840411');
});
check('sourceId como número y con basura: solo dígitos', () => {
  assert.strictEqual(anuncioDe({ contextInfo: { externalAdReply: { sourceId: 'ad:123 ' } } }).id, '123');
});
check('marca ctwa sin externalAdReply: anuncio sin id', () => {
  const a = anuncioDe({ message: { extendedTextMessage: { contextInfo: { entryPointConversionSource: 'ctwa_ad' } } } });
  assert.deepStrictEqual(a, { id: null, titulo: '', url: '', tipo: 'ad' });
});
check('vista previa de un link (externalAdReply sin id ni tipo ad): no es anuncio', () => {
  assert.strictEqual(anuncioDe({ contextInfo: { externalAdReply: { title: 'Un link', sourceType: 'link' } } }), null);
});
check('mensaje común, una cita, null o basura: null y no tira', () => {
  assert.strictEqual(anuncioDe({ message: { conversation: 'hola' } }), null);
  assert.strictEqual(anuncioDe({ message: { extendedTextMessage: { contextInfo: { quotedMessage: { conversation: 'x' } } } } }), null);
  assert.strictEqual(anuncioDe(null), null);
  assert.strictEqual(anuncioDe({ message: 'raro', contextInfo: 5 }), null);
  const ciclo = {};
  Object.defineProperty(ciclo, 'externalAdReply', { get() { throw new Error('boom'); } });
  assert.strictEqual(anuncioDe({ contextInfo: ciclo }), null);
});

console.log('\ncambiosDeEstado\n');
const a1 = { id: '1', titulo: 'uno' };
const a2 = { id: '2', titulo: 'dos' };
check('primer anuncio: va a anuncio', () => {
  assert.deepStrictEqual(cambiosDeEstado({}, a1, 10), { anuncio: { id: '1', titulo: 'uno', ts: 10 } });
});
check('el mismo otra vez: nada', () => {
  assert.strictEqual(cambiosDeEstado({ anuncio: { id: '1' } }, a1), null);
});
check('otro distinto: anuncioUltimo, sin pisar el primero', () => {
  assert.deepStrictEqual(cambiosDeEstado({ anuncio: { id: '1' } }, a2, 20), { anuncioUltimo: { id: '2', titulo: 'dos', ts: 20 } });
  assert.strictEqual(cambiosDeEstado({ anuncio: { id: '1' }, anuncioUltimo: { id: '2' } }, a2), null);
});
check('sin anuncio: nada', () => assert.strictEqual(cambiosDeEstado({}, null), null));

console.log('\nreporte\n');
check('cuenta chats, vendidos y perdidos por anuncio; ignora chats sin anuncio y la clave interna', () => {
  const estado = {
    'bot:interno': { algo: 1 },
    a: { anuncio: { id: '1', ts: 100 }, resultado: { tipo: 'vendido' } },
    b: { anuncio: { id: '1', ts: 100 } },
    c: { anuncio: { id: '2', ts: 100 }, resultado: { tipo: 'perdido' } },
    d: { historial: [] },
  };
  assert.deepStrictEqual(resumir(estado, { nombres: { 1: 'Granza' } }), [
    { id: '1', nombre: 'Granza', chats: 2, vendidos: 1, perdidos: 0 },
    { id: '2', nombre: '2', chats: 1, vendidos: 0, perdidos: 1 },
  ]);
});
check('--desde deja afuera los anteriores', () => {
  const estado = { a: { anuncio: { id: '1', ts: 100 } }, b: { anuncio: { id: '1', ts: 300 } } };
  assert.strictEqual(resumir(estado, { desde: 200 })[0].chats, 1);
});

if (fallas) {
  console.log(`\n${fallas} MAL`);
  process.exit(1);
}
console.log('\nTodo ok');
