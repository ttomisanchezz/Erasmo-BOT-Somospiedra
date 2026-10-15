'use strict';
/**
 * El reintento de Gemini conserva el audio (bloque 4 de la auditoría del
 * 15/09/2026, hallazgo B5).
 *
 *   node test/audio-reintento.test.js
 *
 * En `llamar`, el reintento por 503, 429 o 5xx no pasaba `audio` ni `timeoutMs`:
 * el segundo pedido salía sin el archivo y con el timeout de texto. Ahora todos
 * los reintentos llevan todos los parámetros, el mensaje de corte usa el timeout
 * real, y una transcripción cortada (finishReason distinto de STOP) se trata como
 * transcripción fallida, por el mismo camino que ya tenía audio.js. Los pedidos
 * de texto no cambian.
 *
 * Gemini se simula con un fetch de mentira: no sale nada a la red. El entorno se
 * fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.GEMINI_MODEL = 'principal-de-prueba';
process.env.GEMINI_MODEL_RESPALDO = 'respaldo-de-prueba';
process.env.AUDIO_ACTIVO = 'true';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-audio-reintento-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-audio-reintento-' + process.pid + '.jsonl');

const gemini = require('../src/gemini');
const evolution = require('../src/evolution');
const audio = require('../src/audio');

const AUDIO = { base64: 'QUFBQQ==', mimetype: 'audio/ogg' };
const respuesta = (texto, finishReason = 'STOP') => ({
  ok: true,
  json: async () => ({ candidates: [{ content: { parts: [{ text: texto }] }, finishReason }] }),
});
const error = (status) => ({ ok: false, status, text: async () => 'error ' + status });

/** Lo que se pidió cada vez: modelo, si llevaba el audio, y la señal de corte. */
let pedidos = [];
function anotar(url, opts) {
  const body = JSON.parse(opts.body);
  const partes = body.contents[0].parts;
  pedidos.push({
    modelo: (String(url).match(/models\/([^:]+):generateContent/) || [])[1],
    conAudio: partes.some((p) => p.inline_data && p.inline_data.data === AUDIO.base64),
    maxTokens: body.generationConfig.maxOutputTokens,
    signal: opts.signal,
  });
}

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

/** Un fetch que falla `veces` veces con `status` y después contesta bien. */
function fetchQueFalla(status, veces, texto = 'hola, tengo cuatrocientos mil') {
  let n = 0;
  return async (url, opts) => {
    anotar(url, opts);
    n++;
    return n <= veces ? error(status) : respuesta(texto);
  };
}

(async () => {
  console.log('\nEl reintento conserva el audio\n');

  for (const status of [503, 500]) {
    await check(`un ${status} y después 200: el segundo pedido lleva el audio y los mismos parámetros`, async () => {
      pedidos = [];
      globalThis.fetch = fetchQueFalla(status, 1);
      const texto = await gemini.transcribir(AUDIO);
      assert.strictEqual(texto, 'hola, tengo cuatrocientos mil');
      assert.strictEqual(pedidos.length, 2, 'tenían que ser 2 pedidos');
      assert.strictEqual(pedidos[0].conAudio, true, 'el primer pedido no llevaba el audio');
      assert.strictEqual(pedidos[1].conAudio, true, 'el reintento salió SIN el audio');
      assert.strictEqual(pedidos[1].maxTokens, pedidos[0].maxTokens, 'el reintento cambió maxTokens');
      assert.strictEqual(pedidos[1].modelo, 'respaldo-de-prueba', 'el reintento no fue al respaldo');
    });
  }

  await check('dos fallas seguidas (503 y 500): el tercer pedido también lleva el audio', async () => {
    pedidos = [];
    let n = 0;
    globalThis.fetch = async (url, opts) => {
      anotar(url, opts);
      n++;
      if (n === 1) return error(503);
      if (n === 2) return error(500);
      return respuesta('dale');
    };
    assert.strictEqual(await gemini.transcribir(AUDIO), 'dale');
    assert.deepStrictEqual(
      pedidos.map((p) => p.conAudio),
      [true, true, true],
      'algún reintento salió sin el audio'
    );
  });

  await check('el reintento por 503 respeta el timeout del audio, y el mensaje de corte dice el timeout real', async () => {
    pedidos = [];
    let n = 0;
    globalThis.fetch = async (url, opts) => {
      anotar(url, opts);
      n++;
      if (n === 1) return error(503);
      // El reintento se cuelga hasta que lo corte la señal.
      return new Promise((_, reject) => {
        opts.signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          reject(e);
        });
      });
    };
    const arranque = Date.now();
    const resultado = await Promise.race([
      gemini.llamar('transcribí', { audio: AUDIO, timeoutMs: 50, maxTokens: 800 }).then(
        () => ({ ok: true }),
        (e) => ({ error: e.message })
      ),
      new Promise((r) => setTimeout(() => r({ colgado: true }), 2000)),
    ]);
    assert.ok(!resultado.colgado, 'el reintento no respetó timeoutMs=50: seguía esperando a los 2 s');
    assert.ok(resultado.error, 'tenía que fallar por corte: ' + JSON.stringify(resultado));
    assert.ok(/0\.05\s*s|50\s*ms/.test(resultado.error), 'el mensaje no dice el timeout real: ' + resultado.error);
    assert.ok(Date.now() - arranque < 1500, 'tardó demasiado: ' + (Date.now() - arranque) + ' ms');
  });

  console.log('\nRespuesta truncada\n');

  await check('MAX_TOKENS en una transcripción no se toma como válida: transcribir rechaza', async () => {
    pedidos = [];
    globalThis.fetch = async (url, opts) => {
      anotar(url, opts);
      return respuesta('tengo cuatrocientos mil para el trece y', 'MAX_TOKENS');
    };
    await assert.rejects(gemini.transcribir(AUDIO), /MAX_TOKENS/);
  });

  await check('y audio.js la trata como transcripción fallida, por su camino de siempre ({ ok: false })', async () => {
    globalThis.fetch = async () => respuesta('tengo cuatrocientos mil para el trece y', 'MAX_TOKENS');
    evolution.base64DeMedia = async () => AUDIO;
    const data = { key: { remoteJid: '5490000000000@s.whatsapp.net', id: 'A1' }, message: { audioMessage: { mimetype: 'audio/ogg', seconds: 4 } } };
    const r = await audio.transcribir(data);
    assert.strictEqual(r.ok, false, 'tomó como válida una transcripción cortada: ' + JSON.stringify(r));
    assert.ok(/Gemini no pudo transcribir/.test(r.motivo), 'no fue por el camino de transcripción fallida: ' + r.motivo);
  });

  await check('un pedido de texto con MAX_TOKENS sigue devolviendo el texto (no cambia)', async () => {
    globalThis.fetch = async () => respuesta('respuesta larga cortada', 'MAX_TOKENS');
    assert.strictEqual(await gemini.llamar('hola', { maxTokens: 5 }), 'respuesta larga cortada');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos ? 1 : 0);
})();
