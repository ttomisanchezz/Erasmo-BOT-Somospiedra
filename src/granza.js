'use strict';
/**
 * La granza de Somos Piedra. NO está en el panel (decisión de Tomás, 09/11/2026): sus precios y sus tramos
 * viven ACÁ, en un solo lugar, y se cotiza con el mismo `cotizador-piedra.js` que todo lo demás (el 21 % de IVA
 * con factura y el redondeo a la centena los hace él).
 *
 * Cómo se vende (Fran y Tomás, 30/10 y 06/11):
 *  - SIEMPRE por m², en bolsas de unos 40 kg: 1 bolsa = 1 m² a 3 cm de espesor (equivalencia comercial
 *    orientativa). Nunca por bolsón: en bolsas se vende más cantidad.
 *  - Los 4 colores (blanca Mar del Plata, gris con roja, roja y gris Tandil) tienen el mismo precio.
 *  - El precio de cada bolsa baja según cuántas bolsas lleva (precios del 06/11, por bolsa, con dos que fijó Tomás el
 *    11/11/2026 para que coincidan con la planilla del local: 20 m² en efectivo $310.000 y 1 m² con tarjeta $26.500):
 *      efectivo / transferencia: $22.000, $20.000 y $15.500
 *      tarjeta (un solo pago):   $26.500, $25.000 y $19.000
 *
 * SUPUESTO A CONFIRMAR CON FRAN (anotado en REVISAR.md): los tramos son de 1 a 9 bolsas, de 10 a 19 y desde 20,
 * como la estructura de la ronda 2 (30/10). Con estas bandas, 19 bolsas ($380.000 en efectivo) salen MÁS caras
 * que 20 ($310.000): el código no lo arregla, cobra el precio de la banda.
 *
 * El tramo se elige por la cantidad de BOLSAS (los m² redondeados para arriba) y ese precio vale para todas las
 * bolsas. La cuenta se hace en dos pasadas con el cotizador: la primera cuenta las bolsas, la segunda cobra.
 */
const cotizador = require('./cotizador-piedra');

/** Los tramos: `desde` es la primera cantidad de bolsas del tramo. Precios por bolsa, en centavos. */
const TRAMOS = [
  { desde: 1, hasta: 9, efectivoCentavos: 2200000, listaCentavos: 2650000 },
  { desde: 10, hasta: 19, efectivoCentavos: 2000000, listaCentavos: 2500000 },
  { desde: 20, hasta: null, efectivoCentavos: 1550000, listaCentavos: 1900000 },
];

/** Una bolsa de ~40 kg cubre 1 m² a 3 cm. */
const COBERTURA_M2_POR_BOLSA = '1';

const NOMBRES = ['Granza blanca Mar del Plata', 'Granza gris con roja', 'Granza roja', 'Granza gris Tandil'];

/** El tramo que le toca a esa cantidad de bolsas (un entero >= 1). */
function tramoPara(bolsas) {
  const n = Number(bolsas);
  if (!Number.isInteger(n) || n < 1) return null;
  return [...TRAMOS].reverse().find((t) => n >= t.desde) || null;
}

/** Un producto de granza con el precio de ESE tramo, para `cotizador.cotizar`. */
function productoDelTramo(nombre, tramo) {
  return { nombre, unidad: 'bolsa', coberturaM2: COBERTURA_M2_POR_BOLSA, efectivoCentavos: tramo.efectivoCentavos, listaCentavos: tramo.listaCentavos, esGranza: true };
}

/** Los 4 colores, para el catálogo del bot (con el precio del primer tramo: la cuenta real elige el tramo). */
function productosDelCatalogo() {
  return NOMBRES.map((n) => productoDelTramo(n, TRAMOS[0]));
}

const esGranza = (producto) => Boolean(producto && producto.esGranza);

/**
 * Cotiza granza: `m2` (o `cantidad`, en bolsas) como lo pide `cotizador.cotizar`. Devuelve lo mismo que
 * `cotizar`, más `bolsas` (cuántas lleva), `tramo` ({ desde, hasta }) y el supuesto de los tramos.
 */
function cotizarGranza({ producto, m2, cantidad, config = {}, medio, factura, cuotas }) {
  const base = { m2, cantidad, config, medio, factura, cuotas };
  // Primera pasada, con el precio del primer tramo: solo para saber cuántas bolsas son.
  const primera = cotizador.cotizar({ ...base, producto: productoDelTramo(producto.nombre, TRAMOS[0]) });
  if (primera.error) return primera;
  const bolsas = Number(primera.cantidad);
  const tramo = tramoPara(bolsas);
  if (!primera.cantidad || !tramo) return primera;
  const r = cotizador.cotizar({ ...base, producto: productoDelTramo(producto.nombre, tramo) });
  if (r.ok) {
    r.bolsas = bolsas;
    r.tramo = { desde: tramo.desde, hasta: tramo.hasta };
    r.supuestos = [...(r.supuestos || []), 'tramos_granza_1-9_10-19_20+'];
  }
  return r;
}

module.exports = { TRAMOS, NOMBRES, COBERTURA_M2_POR_BOLSA, tramoPara, productoDelTramo, productosDelCatalogo, esGranza, cotizarGranza };
