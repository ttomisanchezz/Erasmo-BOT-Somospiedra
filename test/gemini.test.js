'use strict';
/**
 * Qué sale de esta PC hacia Google.
 *
 * En el tier gratuito Google puede usar lo que le mandamos para entrenar sus
 * modelos, así que el nombre del cliente, su teléfono y su mail se tachan
 * antes de salir (también lo usa cerebro.js para lo que va a Anthropic). Lo que
 * NO se puede tachar es un monto o una medida que dijo el cliente.
 */
const assert = require('assert');

// El entorno se fija acá y no se hereda del .env (01/10/2026: desde que este archivo también
// simula pedidos a Gemini). La clave es de mentira y `fetch` se reemplaza antes de cada pedido.
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.GEMINI_MODEL = 'principal-de-prueba';
process.env.GEMINI_MODEL_RESPALDO = 'respaldo-de-prueba';
globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const { sinDatosPersonales } = require('../src/gemini');

let fallos = 0;
function check(nombre, fn) {
  try {
    fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  }
}

console.log('\nDatos que se le mandan a Gemini:');

check('tacha el nombre del cliente', () => {
  const t = sinDatosPersonales('Hola tomas, como estas?', 'Tomas');
  assert.ok(!/tomas/i.test(t), 'quedó el nombre: ' + t);
});

check('tacha también el nombre deformado del saludo', () => {
  const t = sinDatosPersonales('buenass tomass, tenes el 13?', 'Tomas');
  assert.ok(!/tomas/i.test(t), 'quedó el nombre deformado: ' + t);
});

check('tacha teléfonos', () => {
  const t = sinDatosPersonales('mi numero es 299 154 123456', 'Tomas');
  assert.ok(t.includes('[telefono]'), 'no tachó el teléfono: ' + t);
});

check('tacha mails', () => {
  const t = sinDatosPersonales('escribime a juan.perez@gmail.com', 'Tomas');
  assert.ok(t.includes('[mail]'), 'no tachó el mail: ' + t);
});

// Esto es lo que se rompería sin querer: los montos tienen que sobrevivir,
// porque son lo único que el bot necesita entender del mensaje.
check('NO toca el monto de la entrega', () => {
  assert.ok(sinDatosPersonales('tengo 500.000', 'Tomas').includes('500.000'));
  assert.ok(sinDatosPersonales('tengo 1.500.000', 'Tomas').includes('1.500.000'));
  assert.ok(sinDatosPersonales('junte 250 mil', 'Tomas').includes('250'));
});

check('NO toca las medidas ni los números del producto', () => {
  const t = sinDatosPersonales('queria laja de 13 cm, 128 m2 al 100%', 'Tomas');
  assert.ok(t.includes('13') && t.includes('128') && t.includes('100'), t);
});

check('sin nombre no rompe', () => {
  assert.strictEqual(sinDatosPersonales('tenes el 14?', ''), 'tenes el 14?');
  assert.strictEqual(sinDatosPersonales('tenes el 14?', null), 'tenes el 14?');
});

// Desde la poda de iPhone (19/10/2026) Gemini solo transcribe audios (entender y redactar se fueron con
// el bot de siempre). Gemini se simula: no sale nada a la red.
(async () => {
  console.log('\nTranscribir (lo único que hace Gemini):');
  const gemini = require('../src/gemini');
  let cuerpo = null;
  async function checkAsync(nombre, fn) {
    try {
      await fn();
      console.log('  ok   ' + nombre);
    } catch (e) {
      fallos++;
      console.log('  FALLA ' + nombre + ' -> ' + e.message);
    }
  }

  await checkAsync('manda el audio y pide solo la transcripción, sin nada de iPhone', async () => {
    globalThis.fetch = async (url, opciones) => {
      cuerpo = JSON.parse(opciones.body);
      return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: 'hola, tienen laja?' }] }, finishReason: 'STOP' }] }) };
    };
    const texto = await gemini.transcribir({ base64: 'AAAA', mimetype: 'audio/ogg' });
    assert.strictEqual(texto, 'hola, tienen laja?');
    const partes = cuerpo.contents[0].parts;
    assert.ok(partes.some((x) => x.inline_data && x.inline_data.data === 'AAAA'), 'no mandó el audio');
    const prompt = partes[0].text;
    assert.ok(prompt.includes(gemini.INAUDIBLE), 'no pide la marca de inaudible');
    assert.ok(!/iphone|celular|venta de/i.test(prompt), 'el prompt habla de iPhone: ' + prompt);
  });

  await checkAsync('ya no existen entender ni redactar', async () => {
    assert.strictEqual(gemini.entender, undefined);
    assert.strictEqual(gemini.redactar, undefined);
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : `\n${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
