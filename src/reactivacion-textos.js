'use strict';
/**
 * Los textos de la reactivación de Piedra (18/11/2026). Los escribe el CÓDIGO, no Sonnet: son los que aprobó Tomás y
 * si los cambia se cambian SOLO acá. Ninguno lleva montos.
 *
 *   mensaje1: «Hola {nombre}! Cómo estás? Te escribo de Somos Piedra por {producto} que estabas viendo. Pudiste avanzar?
 *             Si querés te ayudo a calcular cuánto necesitás.»   (sin producto: «…por la piedra que estabas viendo…»)
 *   mensaje2: «Hola {nombre}! Último mensajito de Somos Piedra. Si seguís con la obra, cualquier duda de piedras o
 *             cantidades acá estamos. Y si conseguiste otro presupuesto, pasámelo y vemos si lo podemos mejorar.»
 *
 * `{nombre}` es el nombre de pila que el estado ya guardó (si no hay, el saludo queda "Hola!", sin coma suelta) y
 * `{producto}` es lo último que se cotizó (`ficha.pidio.producto`; si no hay, la frase va con "la piedra").
 * Los dos se limpian: un nombre o un producto raro (símbolos, un monto) no entra en un mensaje que sale al cliente.
 */

/** El nombre de pila seguro para un saludo: solo letras (y acentos), hasta 20; si no, ''. */
function nombreSeguro(nombre) {
  const n = String(nombre == null ? '' : nombre).trim();
  const m = n.match(/^[\p{L}\p{M}]{2,20}$/u);
  return m ? n : '';
}

/**
 * El producto seguro para la frase: texto simple de hasta 60 caracteres, sin símbolos raros ni nada que parezca un
 * monto ("$", un número de 4 cifras o más, "1.000"). Si no pasa, '' y la frase va con "la piedra".
 */
function productoSeguro(producto) {
  const p = String(producto == null ? '' : producto).replace(/\s+/g, ' ').trim();
  if (!p || p.length > 60) return '';
  if (!/^[\p{L}\p{M}\p{N} .,'()/+-]+$/u.test(p)) return '';
  if (/\$|\d{4,}|\d[.,]\d{3}/.test(p)) return '';
  return p;
}

const saludo = (nombre) => {
  const n = nombreSeguro(nombre);
  return n ? `Hola ${n}!` : 'Hola!';
};

/** El mensaje 1: a los DIAS_1 días de que la cuenta escribió y el cliente no contestó. */
function mensaje1({ nombre = '', producto = '' } = {}) {
  const cosa = productoSeguro(producto) || 'la piedra';
  return `${saludo(nombre)} Cómo estás? Te escribo de Somos Piedra por ${cosa} que estabas viendo. Pudiste avanzar? Si querés te ayudo a calcular cuánto necesitás.`;
}

/** El mensaje 2: a los DIAS_2 días del 1, si el cliente sigue sin contestar. El último. */
function mensaje2({ nombre = '' } = {}) {
  return `${saludo(nombre)} Último mensajito de Somos Piedra. Si seguís con la obra, cualquier duda de piedras o cantidades acá estamos. Y si conseguiste otro presupuesto, pasámelo y vemos si lo podemos mejorar.`;
}

/** El texto de cada tipo ('m1' o 'm2'). */
function textoDe(tipo, datos) {
  return tipo === 'm2' ? mensaje2(datos) : mensaje1(datos);
}

module.exports = { mensaje1, mensaje2, textoDe, nombreSeguro, productoSeguro };
