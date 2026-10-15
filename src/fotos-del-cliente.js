'use strict';
/**
 * Las fotos que manda el cliente, para que las vea Sonnet (decisión de Tomás del 06/10/2026; …7442, canje
 * del 16: mandó "16 común" y la captura de la batería al 90%, y Sonnet, que no veía la foto, le volvió a
 * preguntar la batería).
 *
 * Solo en una tanda que contesta Sonnet en vivo (index.js, `quien === 'sonnet'`): la sombra, la sombra
 * con persona y #sonnet no mandan imágenes. Cuesta unos US$0,005 por foto, que ya entran en el `usage`
 * de la API (el gasto del día y del mes, cerebro.sumarUso).
 *
 *   - `deMensaje(data)`: lo que index.js guarda de cada foto que entra a la tanda (sin epígrafe, o con
 *     epígrafe, que va como texto): el `key` del mensaje y el `mimetype` de `imageMessage`. Un álbum
 *     (`albumMessage`) no trae imagen: cada foto del álbum llega aparte, como su propio `imageMessage`.
 *   - `bajar(fotos)`: las últimas TOPE (3) de la tanda, con `evolution.base64DeMedia` y un tope de
 *     ESPERA_MS (10 s) por foto, todas a la vez. Solo jpeg, png, gif y webp, y hasta 5 MB del base64 (la
 *     API mide el tope sobre el base64). Una que no se puede bajar, que tarda, de otro tipo o más pesada,
 *     no va: cuenta en `sinVer` y el pedido lo dice. Nunca tira.
 */
const evolution = require('./evolution');

const TOPE = 3;
const ESPERA_MS = 10 * 1000;
const MAX_BASE64 = 5 * 1024 * 1024;
const TIPOS = ['image/jpeg', 'image/png', 'image/gif', 'image/webp'];

/** { key, mimetype } de una foto (`imageMessage`) del webhook, o null si no es una foto. */
function deMensaje(data) {
  const imagen = data && data.message && data.message.imageMessage;
  if (!imagen || !(data.key && data.key.id)) return null;
  return { key: data.key, mimetype: String(imagen.mimetype || '') };
}

/** La media de una foto, o null si no llegó a tiempo. */
async function una(foto, esperaMs) {
  let reloj = null;
  const tarde = new Promise((resolve) => {
    reloj = setTimeout(() => resolve(null), esperaMs);
  });
  try {
    const mensaje = { key: foto.key, message: { imageMessage: { mimetype: foto.mimetype } } };
    return await Promise.race([Promise.resolve(evolution.base64DeMedia(mensaje)).catch(() => null), tarde]);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Baja las fotos de la tanda (en orden de llegada). Devuelve { imagenes: [{ media_type, data }],
 * mandadas, sinVer }: `mandadas`, todas las de la tanda; `imagenes`, las que van al pedido (de las
 * últimas TOPE); `sinVer`, las de esas que no van.
 */
async function bajar(fotos, { esperaMs = ESPERA_MS } = {}) {
  const lista = (fotos || []).filter((f) => f && f.key);
  const ultimas = lista.slice(-TOPE);
  const medias = await Promise.all(ultimas.map((f) => una(f, esperaMs).catch(() => null)));
  const imagenes = [];
  let sinVer = 0;
  for (const m of medias) {
    const tipo = String((m && m.mimetype) || '').toLowerCase();
    const data = m && typeof m.base64 === 'string' ? m.base64 : '';
    if (!data || !TIPOS.includes(tipo) || data.length > MAX_BASE64) {
      sinVer++;
      continue;
    }
    imagenes.push({ media_type: tipo, data });
  }
  return { imagenes, mandadas: lista.length, sinVer };
}

module.exports = { deMensaje, bajar, TOPE, ESPERA_MS, MAX_BASE64, TIPOS };
