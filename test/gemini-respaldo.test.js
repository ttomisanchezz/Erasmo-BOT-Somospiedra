'use strict';
/**
 * El modelo de respaldo de Gemini.
 *
 *   node test/gemini-respaldo.test.js
 *
 * Si el principal no responde o está saturado, `llamar` reintenta con el de
 * respaldo. Ese modelo sale de GEMINI_MODEL_RESPALDO: cuando Google retire uno,
 * el cambio es de .env y no de código. Pasó con gemini-2.5-flash-lite, que
 * estaba escrito a mano. Desde el 30/09/2026 (arreglos en vivo) el respaldo es
 * otro modelo con su propio cupo: también se pasa a él si el principal no existe
 * (404) o se quedó sin cupo del día (429 por día), un solo intento.
 *
 * Gemini se simula con un fetch de mentira: no sale nada a la red. El entorno
 * se fija acá y no se hereda del .env. Desde la poda de iPhone (19/10/2026) Gemini solo
 * transcribe: se prueba con `llamar` directo (antes con `entender`, que se fue).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFileSync } = require('child_process');

process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.GEMINI_MODEL = 'principal-de-prueba';
process.env.GEMINI_MODEL_RESPALDO = 'respaldo-de-prueba';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-respaldo-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-respaldo-' + process.pid + '.jsonl');

const gemini = require('../src/gemini');

const LECTURA = 'hola, tienen laja?';
const ok = (texto) => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] } }] }) });

/** Qué modelos se pidieron, en orden. */
let pedidos = [];
const modeloDe = (url) => (String(url).match(/models\/([^:]+):generateContent/) || [])[1];

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  }
}

(async () => {
  console.log('\nModelo de respaldo\n');

  await check('el principal no responde: reintenta con GEMINI_MODEL_RESPALDO', async () => {
    pedidos = [];
    globalThis.fetch = async (url) => {
      pedidos.push(modeloDe(url));
      if (modeloDe(url) === 'principal-de-prueba') throw new Error('sin red');
      return ok(LECTURA);
    };
    const texto = await gemini.llamar('transcribí');
    assert.deepStrictEqual(pedidos, ['principal-de-prueba', 'respaldo-de-prueba']);
    assert.strictEqual(texto, LECTURA, 'no contestó el respaldo');
  });

  await check('el principal está saturado (503): el reintento también va al respaldo', async () => {
    pedidos = [];
    globalThis.fetch = async (url) => {
      pedidos.push(modeloDe(url));
      if (modeloDe(url) === 'principal-de-prueba') return { ok: false, status: 503, text: async () => 'saturado' };
      return ok(LECTURA);
    };
    const texto = await gemini.llamar('transcribí');
    assert.deepStrictEqual(pedidos, ['principal-de-prueba', 'respaldo-de-prueba']);
    assert.strictEqual(texto, LECTURA, 'no contestó el respaldo');
  });

  // Arreglos en vivo (30/09/2026): el respaldo es otro modelo con su propio cupo. Si el
  // principal no existe (404: se retiró) o se quedó sin cupo del día (429 por día), un solo
  // intento con el respaldo. Antes las dos cosas tiraban sin probar nada más.
  const SIN_CUPO_DIARIO = { ok: false, status: 429, text: async () => 'Quota exceeded: GenerateRequestsPerDay, retry in "retryDelay":"37s"' };
  const NO_EXISTE = { ok: false, status: 404, text: async () => 'models/principal-de-prueba is not found for API version v1beta' };

  await check('el principal no existe (404): un intento con el respaldo, que responde', async () => {
    pedidos = [];
    globalThis.fetch = async (url) => {
      pedidos.push(modeloDe(url));
      return modeloDe(url) === 'principal-de-prueba' ? NO_EXISTE : ok(LECTURA);
    };
    const texto = await gemini.llamar('transcribí');
    assert.deepStrictEqual(pedidos, ['principal-de-prueba', 'respaldo-de-prueba']);
    assert.strictEqual(texto, LECTURA, 'no contestó el respaldo');
  });

  await check('el principal se quedó sin cupo del día (429 por día): un intento con el respaldo, que responde', async () => {
    pedidos = [];
    globalThis.fetch = async (url) => {
      pedidos.push(modeloDe(url));
      return modeloDe(url) === 'principal-de-prueba' ? SIN_CUPO_DIARIO : ok(LECTURA);
    };
    const texto = await gemini.llamar('transcribí');
    assert.deepStrictEqual(pedidos, ['principal-de-prueba', 'respaldo-de-prueba']);
    assert.strictEqual(texto, LECTURA, 'no contestó el respaldo');
  });

  await check('sin cupo del día en los dos: error con el motivo y un solo intento con el respaldo', async () => {
    pedidos = [];
    globalThis.fetch = async (url) => {
      pedidos.push(modeloDe(url));
      return SIN_CUPO_DIARIO;
    };
    await assert.rejects(gemini.llamar('hola'), (e) => {
      assert.match(e.message, /Gemini 429 \(respaldo-de-prueba\)/, e.message);
      assert.match(e.message, /principal-de-prueba/, 'no dice que el principal tampoco tenía cupo: ' + e.message);
      return true;
    });
    assert.deepStrictEqual(pedidos, ['principal-de-prueba', 'respaldo-de-prueba'], 'el 429 por día del respaldo no se reintenta');
  });

  await check('el principal no existe y el respaldo tampoco: error, sin un tercer pedido', async () => {
    pedidos = [];
    globalThis.fetch = async (url) => {
      pedidos.push(modeloDe(url));
      return NO_EXISTE;
    };
    await assert.rejects(gemini.llamar('hola'), /Gemini 404 \(respaldo-de-prueba\)/);
    assert.deepStrictEqual(pedidos, ['principal-de-prueba', 'respaldo-de-prueba']);
  });

  await check('el 429 por minuto y el 503 siguen como antes: respaldo y después el mismo modelo, hasta 3 pedidos', async () => {
    pedidos = [];
    globalThis.fetch = async (url) => {
      pedidos.push(modeloDe(url));
      return { ok: false, status: 503, text: async () => 'saturado' };
    };
    await assert.rejects(gemini.llamar('hola'), /Gemini 503 \(respaldo-de-prueba\)/);
    assert.deepStrictEqual(pedidos, ['principal-de-prueba', 'respaldo-de-prueba', 'respaldo-de-prueba']);
  });

  await check('sin las variables, los defaults son gemini-3.5-flash-lite y gemini-3.1-flash-lite', () => {
    // Otro proceso, para que la config se lea de cero. Corre desde test/, que no
    // tiene .env: dotenv busca en la carpeta actual y no encuentra nada que cargar.
    const env = { ...process.env };
    delete env.GEMINI_MODEL;
    delete env.GEMINI_MODEL_RESPALDO;
    const salida = execFileSync(
      process.execPath,
      [
        '-e',
        `const g = require(${JSON.stringify(path.join(__dirname, '..', 'src', 'config.js'))}).gemini; process.stdout.write(g.modelo + ' ' + g.modeloRespaldo)`,
      ],
      { cwd: __dirname, env, encoding: 'utf8' }
    );
    assert.strictEqual(salida, 'gemini-3.5-flash-lite gemini-3.1-flash-lite');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // no se llegó a crear
    }
  }
  process.exit(fallos ? 1 : 0);
})();
