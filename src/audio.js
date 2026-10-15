'use strict';
/**
 * Notas de voz.
 *
 * Antes de esto, un audio no existía para el bot:
 *  - el de un cliente moría en el `if (!texto) return` de index.js, sin dejar
 *    rastro — ni siquiera entraba al historial;
 *  - los propios (fromMe) entraban como mensaje de vendedor con texto vacío.
 *    Había 76 así en `data/estado.json`: callaban al bot 45 minutos y se
 *    perdía el contenido, que es la mejor muestra de cómo se vende de verdad.
 *
 * Acá se transcriben los dos. El archivo no viene en el webhook: se le pide a
 * Evolution (ver `evolution.base64DeMedia`) y se manda a Gemini.
 *
 * Se puede apagar solo, con AUDIO_ACTIVO=false, sin tocar el resto del bot. Y
 * nunca transcribe cuando Gemini está en modo solo-local, que es lo que activa
 * `npm run evaluar -- --offline`: la suite no sale a la red por ningún lado.
 */
const config = require('./config');
const evolution = require('./evolution');
const gemini = require('./gemini');

/**
 * Una transcripción más corta que esto no alcanza para decidir nada.
 * "si", "dale" o "ok" sueltos sí llegan, que es lo que se quiere.
 */
const LARGO_MINIMO = 2;

/** ¿Está encendida la transcripción? */
function activo() {
  if (!config.audio.activo) return false;
  // En modo solo-local no se sale a la red ni para esto.
  if (gemini.esSoloLocal()) return false;
  if (!config.gemini.apikey) return false;
  return true;
}

/** ¿Este mensaje del webhook es una nota de voz? */
function esAudio(data) {
  const msg = data?.message || {};
  return Boolean(msg.audioMessage || msg.pttMessage);
}

/**
 * ¿La transcripción sirve para procesarla como si fuera un mensaje escrito?
 *
 * Se exige que Gemini no haya devuelto su marca de inaudible y que quede algo
 * con letras o números. Ante la duda, NO: un audio mal escuchado que termina en
 * una cotización es mucho peor que pedirle a la persona que lo escriba.
 */
function esClara(texto) {
  const t = String(texto || '').trim();
  if (!t) return false;
  if (t.includes(gemini.INAUDIBLE)) return false;
  if (t.replace(/[^a-záéíóúñü0-9]/gi, '').length < LARGO_MINIMO) return false;
  return true;
}

/**
 * Transcribe la nota de voz de un mensaje del webhook.
 *
 * Devuelve siempre la misma forma, nunca tira:
 *   { ok: true,  texto }            transcripción usable
 *   { ok: false, motivo }           por qué no se pudo
 *
 * Que no tire es parte del contrato: el que llama decide qué hacer, y lo que
 * hace es escalar. Un audio que falla no cotiza nunca.
 */
async function transcribir(data) {
  if (!esAudio(data)) return { ok: false, motivo: 'no es un audio' };
  if (!activo()) return { ok: false, motivo: 'transcripción apagada' };

  const media = await evolution.base64DeMedia(data);
  if (!media || !media.base64) {
    return { ok: false, motivo: 'no pude bajar el audio de Evolution' };
  }

  let texto;
  try {
    texto = await gemini.transcribir(media);
  } catch (e) {
    console.error('[audio] no pude transcribir:', e.message);
    return { ok: false, motivo: 'Gemini no pudo transcribir: ' + e.message };
  }

  if (!esClara(texto)) {
    return { ok: false, motivo: 'el audio no se entiende' };
  }
  return { ok: true, texto: String(texto).trim() };
}

module.exports = { activo, esAudio, esClara, transcribir, LARGO_MINIMO };
