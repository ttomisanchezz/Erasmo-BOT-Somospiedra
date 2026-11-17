'use strict';
/**
 * Colores de granza sin stock, marcados a mano desde el grupo interno (decisión de Fran y Tomás):
 *   #sinstock <color>[, <color>…]   marca que ese color no hay
 *   #hay <color>[, <color>…]        vuelve a haber
 *   #sinstock                       lista qué falta (no cambia nada)
 *
 * Los colores son los tres de granza.js: gris (Tandil), roja y blanca (Mar del Plata). El estado vive bajo la
 * clave interna de state.js (`sinStock`, claves 'gris' | 'roja' | 'blanca'): arranca vacío (todo en stock),
 * sobrevive a un reinicio y #reset no lo toca.
 *
 * Mismo patrón que excluidos.js: el comando solo cuenta si el mensaje EMPIEZA con él (los avisos del bot vuelven
 * por el webhook como mensajes propios; las confirmaciones empiezan con un emoji, nunca con "#"). Lo que no se
 * entiende no cambia nada y contesta cómo se usa.
 */
const state = require('./state');
const { NOMBRES } = require('./granza');

const sinTildes = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().trim();

/** Los colores, con el nombre de producto que sale de granza.js. */
const COLORES = [
  { clave: 'gris', nombre: NOMBRES.find((n) => /gris/i.test(n)) },
  { clave: 'roja', nombre: NOMBRES.find((n) => /roja/i.test(n)) },
  { clave: 'blanca', nombre: NOMBRES.find((n) => /blanca/i.test(n)) },
];

const porClave = (clave) => COLORES.find((c) => c.clave === clave);
/** "Granza gris Tandil" -> "gris Tandil" (para la lista). */
const corto = (c) => c.nombre.replace(/^Granza\s+/i, '');

const COMO_SE_USA =
  'En el grupo: #sinstock roja (marca que no hay) o #hay roja (vuelve a haber). Colores: gris (Tandil), roja, blanca (Mar del Plata). ' +
  'Se pueden varios: #sinstock roja y blanca\n' +
  'Para ver qué falta: #sinstock (sin nada más)';

/** ¿El texto es #sinstock o #hay? Solo si el mensaje EMPIEZA con el comando. @returns {{tipo:'sinstock'|'hay', resto:string}|null} */
function comando(texto) {
  const m = String(texto || '').trim().match(/^#(sinstock|hay)(?![\p{L}\p{N}_-])([\s\S]*)$/iu);
  return m ? { tipo: m[1].toLowerCase(), resto: m[2].trim() } : null;
}

// Más largo primero: "blanca mar del plata" antes que "blanca", "gris tandil" antes que "gris".
const VARIANTES = [
  [/\bblanc[ao]\s+mar\s+del\s+plata\b/g, 'blanca'],
  [/\bblanc[ao]\s+mdp\b/g, 'blanca'],
  [/\bmar\s+del\s+plata\b/g, 'blanca'],
  [/\bmdp\b/g, 'blanca'],
  [/\bblanc[ao]\b/g, 'blanca'],
  [/\bgris\s+tandil\b/g, 'gris'],
  [/\btandil\b/g, 'gris'],
  [/\bgris\b/g, 'gris'],
  [/\broj[ao]\b/g, 'roja'],
];

/** Los colores que nombra el resto del comando, o null si queda algo que no se reconoce (o no hay nada). */
function colores(resto) {
  let t = ` ${sinTildes(resto)} `.replace(/\bgranza\b/g, ' ');
  const claves = [];
  // Cada variante se saca del texto a medida que se reconoce: lo que sobra, si no son separadores, es un problema.
  for (const [re, clave] of VARIANTES) {
    t = t.replace(re, () => {
      if (!claves.includes(clave)) claves.push(clave);
      return ' ';
    });
  }
  const sobra = t.replace(/[\s,;.+&/-]+/g, ' ').replace(/\b[ye]\b/g, ' ').trim();
  if (sobra || !claves.length) return null;
  return claves;
}

const nombres = (claves) => claves.map((c) => porClave(c).nombre).join(', ');
const ayuda = (tipo, porQue) => `❓ #${tipo}: ${porQue}. No cambié nada.\n\n${COMO_SE_USA}`;

/** El estado actual, para #sinstock sin nada. */
function estado() {
  const faltan = state.sinStockColores();
  if (!faltan.length) return `📦 Hay stock de todo (${COLORES.map(corto).join(', ').replace(/, ([^,]*)$/, ' y $1')}).`;
  return `📦 Sin stock hoy: ${nombres(COLORES.map((c) => c.clave).filter((c) => faltan.includes(c)))}`;
}

/**
 * Aplica el comando al estado y devuelve el texto para el grupo. Nunca marca a ciegas: sin entender todo lo que
 * se escribió, o un #hay sin color, no cambia nada y contesta cómo se usa.
 *
 * @returns {{cambio:boolean, texto:string}}
 */
function desdeGrupo({ tipo, resto }) {
  if (tipo === 'sinstock' && !String(resto || '').trim()) return { cambio: false, texto: estado() };
  const claves = String(resto || '').trim() ? colores(resto) : null;
  if (!claves) {
    return { cambio: false, texto: ayuda(tipo, String(resto || '').trim() ? 'no entendí el color' : 'falta el color') };
  }
  const actual = state.sinStockColores();
  const lineas = [];
  let cambio = false;
  if (tipo === 'sinstock') {
    const nuevos = claves.filter((c) => !actual.includes(c));
    const yaEstaban = claves.filter((c) => actual.includes(c));
    if (nuevos.length) {
      state.guardarSinStockColores([...actual, ...nuevos]);
      cambio = true;
      lineas.push(`🔴 Sin stock: ${nombres(nuevos)}. Erasmo ya no lo cotiza. Para avisar que vuelve: #hay ${nuevos.join(' y ')}`);
    }
    if (yaEstaban.length) lineas.push(`ℹ️ ${nombres(yaEstaban)} ya estaba sin stock.`);
  } else {
    const vuelven = claves.filter((c) => actual.includes(c));
    const yaHabia = claves.filter((c) => !actual.includes(c));
    if (vuelven.length) {
      state.guardarSinStockColores(actual.filter((c) => !vuelven.includes(c)));
      cambio = true;
      lineas.push(`🟢 Vuelve a haber stock: ${nombres(vuelven)}.`);
    }
    if (yaHabia.length) lineas.push(`ℹ️ De ${nombres(yaHabia)} ya había stock.`);
  }
  lineas.push(estado());
  return { cambio, texto: lineas.join('\n') };
}

/** Los NOMBRES de producto (granza.js) sin stock, en el orden de COLORES. */
function sinStock() {
  const faltan = state.sinStockColores();
  return COLORES.filter((c) => faltan.includes(c.clave)).map((c) => c.nombre);
}

/** ¿Ese producto es un color de granza marcado sin stock? Sin tildes ni mayúsculas. */
function haySinStock(nombreProducto) {
  const n = sinTildes(nombreProducto);
  if (!n) return false;
  return sinStock().some((x) => sinTildes(x) === n);
}

module.exports = { COLORES, COMO_SE_USA, comando, desdeGrupo, sinStock, haySinStock };
