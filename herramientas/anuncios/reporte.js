'use strict';
/**
 * Chats y ventas por anuncio de Meta (20/10/2026).
 *
 *   node herramientas/anuncios/reporte.js            (lee data/estado.json)
 *   node herramientas/anuncios/reporte.js --desde 2026-10-20
 *
 * Cuenta los chats que tienen `anuncio` (src/anuncio.js) y su `resultado` (#vendido / #perdido, ventas.js).
 * Los nombres salen de `nombres.json` (id del anuncio → nombre); un id que no está ahí sale tal cual.
 * Solo lee: no toca el estado ni manda nada.
 */
const fs = require('fs');
const path = require('path');

const RAIZ = path.join(__dirname, '..', '..');
const ESTADO = process.env.ESTADO_PATH || path.join(RAIZ, 'data', 'estado.json');

function leerJson(archivo, siFalta) {
  try {
    return JSON.parse(fs.readFileSync(archivo, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return siFalta;
    throw e;
  }
}

/** Los chats del estado: acepta { chats: {...} } o el objeto de chats directo. */
function chatsDe(estado) {
  if (!estado || typeof estado !== 'object') return {};
  if (estado.chats && typeof estado.chats === 'object') return estado.chats;
  return estado;
}

function resumir(estado, { desde = 0, nombres = {} } = {}) {
  const filas = new Map();
  for (const s of Object.values(chatsDe(estado))) {
    if (!s || typeof s !== 'object' || !s.anuncio) continue;
    if (desde && Number(s.anuncio.ts || 0) < desde) continue;
    const id = s.anuncio.id || 'sin-id';
    const f = filas.get(id) || { id, nombre: nombres[id] || s.anuncio.titulo || id, chats: 0, vendidos: 0, perdidos: 0 };
    f.chats += 1;
    const tipo = s.resultado && s.resultado.tipo;
    if (tipo === 'vendido') f.vendidos += 1;
    if (tipo === 'perdido') f.perdidos += 1;
    filas.set(id, f);
  }
  return [...filas.values()].sort((a, b) => b.chats - a.chats);
}

function main() {
  const i = process.argv.indexOf('--desde');
  const desde = i > -1 ? Date.parse(process.argv[i + 1] + 'T00:00:00-03:00') : 0;
  const nombres = leerJson(path.join(__dirname, 'nombres.json'), {});
  const filas = resumir(leerJson(ESTADO, {}), { desde, nombres });
  if (!filas.length) {
    console.log('Ningún chat con anuncio todavía.');
    return;
  }
  console.log('Anuncio | Chats | Vendidos | Perdidos | Sin marcar');
  for (const f of filas) {
    console.log(`${f.nombre} (${f.id}) | ${f.chats} | ${f.vendidos} | ${f.perdidos} | ${f.chats - f.vendidos - f.perdidos}`);
  }
}

if (require.main === module) main();
module.exports = { resumir, chatsDe };
