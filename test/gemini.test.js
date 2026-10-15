'use strict';
/**
 * Qué sale de esta PC hacia Google.
 *
 * En el tier gratuito Google puede usar lo que le mandamos para entrenar sus
 * modelos, así que el nombre del cliente, su teléfono y su mail se tachan
 * antes de salir. Lo que NO se puede tachar es el monto que dijo tener: si se
 * borra, el bot deja de poder cotizar.
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

check('NO toca el modelo ni la batería', () => {
  const t = sinDatosPersonales('queria el iphone 13 128gb de 100%', 'Tomas');
  assert.ok(t.includes('13') && t.includes('128') && t.includes('100'), t);
});

check('sin nombre no rompe', () => {
  assert.strictEqual(sinDatosPersonales('tenes el 14?', ''), 'tenes el 14?');
  assert.strictEqual(sinDatosPersonales('tenes el 14?', null), 'tenes el 14?');
});

// Lo que dijo una persona de la cuenta (01/10/2026, decisión de Tomás; caso Jazz). Va en su
// propia sección, con cuándo lo dijo y tachada igual que el resto, y Gemini devuelve en la misma
// llamada la frase que el cliente está siguiendo (`dijo_persona`). Gemini se simula: no sale
// nada a la red.
(async () => {
  console.log('\nLo que dijo una persona de la cuenta (01/10/2026):');
  const gemini = require('../src/gemini');
  const HORA = 60 * 60 * 1000;
  let cuerpo = null;
  const lee = (obj) => async (url, opciones) => {
    cuerpo = JSON.parse(opciones.body);
    return { ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] }) };
  };
  async function checkAsync(nombre, fn) {
    try {
      await fn();
      console.log('  ok   ' + nombre);
    } catch (e) {
      fallos++;
      console.log('  FALLA ' + nombre + ' -> ' + e.message);
    }
  }
  const PERSONAS = [{ texto: 'mañana entran iphones 13, tomas te escribe del 2994123456', ts: Date.now() - 20 * HORA }];
  const SECCION = 'Lo que escribió una persona de la cuenta (no el bot)';

  await checkAsync('las líneas de la persona van aparte, con cuándo, y sin nombre ni teléfono', async () => {
    globalThis.fetch = lee({ intencion: 'consulta_stock', modelo: '13', modelos: ['13'] });
    await gemini.entender('Cliente: tenes el 13?\nPersona de la cuenta: mañana entran', 'hola entraron los 13?', 'Tomas', PERSONAS);
    const prompt = cuerpo.contents[0].parts[0].text;
    const partes = prompt.split(SECCION);
    assert.strictEqual(partes.length, 2, 'no va la sección: ' + prompt.slice(-600));
    const seccion = partes[1].split('Último mensaje del cliente')[0];
    assert.ok(seccion.includes('mañana entran iphones 13'), 'no va la línea de la persona: ' + seccion);
    assert.ok(seccion.includes('hace 20 h'), 'no dice cuándo: ' + seccion);
    assert.ok(!/tomas/i.test(seccion) && !seccion.includes('2994123456'), 'salió el nombre o el teléfono: ' + seccion);
  });

  await checkAsync('el esquema pide dijo_persona y vuelve en la lectura, en la misma llamada', async () => {
    let llamadas = 0;
    const leer = lee({ intencion: 'consulta_stock', modelo: '13', modelos: ['13'], dijo_persona: 'mañana entran iphones 13' });
    globalThis.fetch = async (...a) => {
      llamadas++;
      return leer(...a);
    };
    const info = await gemini.entender('', 'hola entraron los 13?', '', PERSONAS);
    assert.strictEqual(llamadas, 1);
    assert.ok(cuerpo.generationConfig.responseSchema.properties.dijo_persona, 'el esquema no tiene dijo_persona');
    assert.ok(/dijo_persona/.test(cuerpo.contents[0].parts[0].text), 'el prompt no explica dijo_persona');
    assert.strictEqual(info.dijo_persona, 'mañana entran iphones 13');
  });

  await checkAsync('sin líneas de persona no va la sección', async () => {
    globalThis.fetch = lee({ intencion: 'consulta_stock', modelo: '13', modelos: ['13'] });
    const info = await gemini.entender('', 'tenes el 13?', '');
    assert.ok(!cuerpo.contents[0].parts[0].text.includes(SECCION), 'fue la sección sin líneas');
    assert.strictEqual(info.dijo_persona, null);
  });

  await checkAsync('si Gemini falla, la lectura del extractor local sale marcada como falla', async () => {
    globalThis.fetch = async () => {
      throw new Error('sin red');
    };
    const info = await gemini.entender('', 'tenes el 13?', '', PERSONAS);
    assert.strictEqual(info._fuente, 'local');
    assert.strictEqual(info._geminiFallo, true);
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : `\n${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
