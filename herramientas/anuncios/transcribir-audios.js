'use strict';
/**
 * Transcribe los audios de los chats que vinieron por un anuncio (02/11/2026), para revisar qué ventas se
 * cerraron por anuncio. SOLO LEE: no manda mensajes, no toca el webhook ni el estado del bot.
 *
 *   node herramientas/anuncios/transcribir-audios.js                 (usa la exportación más nueva)
 *   node herramientas/anuncios/transcribir-audios.js --tope=400      (máximo de audios; por defecto 400)
 *
 * De dónde saca cada cosa:
 *  - qué chats vinieron por anuncio: data/estado.json (`anuncio`), leído con fs, sin cargar state.js;
 *  - los mensajes: la exportación más nueva de data/historial/export-AAAA/mensajes.jsonl
 *    (la arma herramientas/historial/exportar-historial.js);
 *  - el audio: Evolution (getBase64FromMediaMessage), y la transcripción: Gemini (GEMINI_API_KEY del .env,
 *    que este script no muestra). Gasta Gemini: un pedido por audio.
 * Escribe data/historial/<export>/audios-anuncios.jsonl (una línea por audio: chat, id, ts, de, texto o error).
 * Se puede volver a correr: saltea los audios que ya tienen texto.
 */
process.env.ESTADO_SOLO_LECTURA = '1';
const fs = require('fs');
const path = require('path');
const RAIZ = path.resolve(__dirname, '..', '..');
process.chdir(RAIZ);
const evolution = require('../../src/evolution');
const gemini = require('../../src/gemini');
const config = require('../../src/config');

const arg = (n, d) => { const m = process.argv.find((x) => x.startsWith(`--${n}=`)); return m ? m.split('=')[1] : d; };
const TOPE = Number(arg('tope', 400));
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

(async () => {
  if (!config.gemini.apikey) { console.log('Falta GEMINI_API_KEY en el .env. Cargala y volvé a correr.'); process.exit(1); }
  const H = path.join(RAIZ, 'data', 'historial');
  const exports = fs.readdirSync(H).filter((d) => d.startsWith('export-')).sort();
  if (!exports.length) { console.log('No hay exportación. Corré antes exportar-historial.js'); process.exit(1); }
  const dir = path.join(H, exports[exports.length - 1]);
  console.log('Exportación:', path.basename(dir));

  const estado = JSON.parse(fs.readFileSync(path.join(RAIZ, 'data', 'estado.json'), 'utf8'));
  const conAnuncio = new Set();
  for (const [k, v] of Object.entries(estado)) {
    if (v && typeof v === 'object' && v.anuncio && typeof v.anuncio === 'object') conAnuncio.add(k.split('@')[0]);
  }
  console.log('Chats con anuncio:', conAnuncio.size);

  const salida = path.join(dir, 'audios-anuncios.jsonl');
  const hechos = new Set();
  if (fs.existsSync(salida)) {
    for (const l of fs.readFileSync(salida, 'utf8').split('\n')) { try { const o = JSON.parse(l); if (o.texto) hechos.add(o.id); } catch {} }
  }
  const audios = fs.readFileSync(path.join(dir, 'mensajes.jsonl'), 'utf8').split('\n').filter(Boolean)
    .map((l) => JSON.parse(l)).filter((m) => m.tipo === 'audio' && conAnuncio.has(String(m.chat)) && !hechos.has(m.id));
  console.log('Audios a transcribir:', audios.length, `(tope ${TOPE})`);

  let ok = 0, mal = 0;
  for (const m of audios.slice(0, TOPE)) {
    const fila = { chat: m.chat, id: m.id, ts: m.ts, de: m.de };
    try {
      const media = await evolution.base64DeMedia({ key: { remoteJid: `${m.chat}@s.whatsapp.net`, fromMe: m.de === 'piedra', id: m.id } });
      if (!media || !media.base64) throw new Error('no pude bajar el audio de Evolution');
      fila.texto = await gemini.transcribir(media);
      ok++;
    } catch (e) { fila.error = String(e.message || e).slice(0, 200); mal++; }
    fs.appendFileSync(salida, JSON.stringify(fila) + '\n');
    if ((ok + mal) % 10 === 0) console.log(`  ${ok + mal}/${Math.min(audios.length, TOPE)} (${ok} bien, ${mal} con error)`);
    await dormir(400);
  }
  console.log(`Listo: ${ok} transcriptos, ${mal} con error. Archivo: ${salida}`);
})();
