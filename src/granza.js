'use strict';
/**
 * La granza de Somos Piedra. NO está en el panel (decisión de Tomás, 09/11/2026): sus precios y sus tramos
 * viven ACÁ, en un solo lugar, y se cotiza con el mismo `cotizador-piedra.js` que todo lo demás (el 21 % de IVA
 * con factura y el redondeo a la centena los hace él).
 *
 * Cómo se vende (Fran y Tomás, 30/10 y 06/11):
 *  - Por m², en bolsas de unos 40 kg: 1 bolsa = 1 m² a 3 cm de espesor (equivalencia comercial orientativa).
 *  - BOLSÓN (Fran y Tomás, 17/11/2026): SÍ se vende. 1 bolsón = 1 m³ = 20 bolsas de 40 kg, y se cobra como 20 bolsas
 *    (tramo desde 20: 1 bolsón $310.000 en efectivo y $380.000 con tarjeta). Un camión entero no se cotiza: lo ve una persona.
 *  - Los 3 colores (blanca Mar del Plata, roja y gris Tandil) tienen el mismo precio. "Gris con roja" no existe:
 *    la gris es la gris Tandil (Fran, 16/11/2026).
 *  - El precio de cada bolsa baja según cuántas bolsas lleva (precios del 06/11, por bolsa, con dos que fijó Tomás el
 *    11/11/2026 para que coincidan con la planilla del local: 20 m² en efectivo $310.000 y 1 m² con tarjeta $26.500):
 *      efectivo / transferencia: $22.000, $20.000 y $15.500
 *      tarjeta (un solo pago):   $26.500, $25.000 y $19.000
 *
 * Tabla final (Fran y Tomás, 17/11/2026), por bolsa. Tramos: de 1 a 9 bolsas, de 10 a 14, de 15 a 19 y desde 20.
 *      efectivo / transferencia: $22.000 · $20.000 · $16.000 · $15.500
 *      tarjeta (un solo pago):   $26.500 · $25.000 · $19.000 · $19.000
 * Con estas bandas, 14 bolsas ($280.000 en efectivo, $350.000 con tarjeta) salen MÁS caras que 15 ($240.000 y $285.000):
 * el código no lo arregla, cobra el precio de la banda.
 *
 * El tramo se elige por la cantidad de BOLSAS (los m² redondeados para arriba) y ese precio vale para todas las
 * bolsas. La cuenta se hace en dos pasadas con el cotizador: la primera cuenta las bolsas, la segunda cobra.
 */
const cotizador = require('./cotizador-piedra');

/** Los tramos: `desde` es la primera cantidad de bolsas del tramo. Precios por bolsa, en centavos. */
const TRAMOS = [
  { desde: 1, hasta: 9, efectivoCentavos: 2200000, listaCentavos: 2650000 },
  { desde: 10, hasta: 14, efectivoCentavos: 2000000, listaCentavos: 2500000 },
  // 15 a 19 bolsas: efectivo $16.000 (16/11/2026) y tarjeta $19.000 (17/11/2026, Fran y Tomás).
  { desde: 15, hasta: 19, efectivoCentavos: 1600000, listaCentavos: 1900000 },
  { desde: 20, hasta: null, efectivoCentavos: 1550000, listaCentavos: 1900000 },
];

/** Cuántas bolsas de 40 kg son un bolsón (1 m³): Fran y Tomás, 17/11/2026. */
const BOLSAS_POR_BOLSON = 20;

/** Una bolsa de ~40 kg cubre 1 m² a 3 cm. */
const COBERTURA_M2_POR_BOLSA = '1';

const NOMBRES = ['Granza blanca Mar del Plata', 'Granza roja', 'Granza gris Tandil'];

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

/** Los 3 colores, para el catálogo del bot (con el precio del primer tramo: la cuenta real elige el tramo). */
function productosDelCatalogo() {
  return NOMBRES.map((n) => productoDelTramo(n, TRAMOS[0]));
}

const esGranza = (producto) => Boolean(producto && producto.esGranza);

/**
 * Cotiza granza: `m2`, `cantidad` (en bolsas) o `bolsones` (enteros: cada uno son 20 bolsas), como lo pide
 * `cotizador.cotizar`. Devuelve lo mismo que `cotizar`, más `bolsas` (cuántas lleva), `bolsones` (si lo pidió así),
 * `tramo` ({ desde, hasta }) y el supuesto de los tramos.
 */
function cotizarGranza({ producto, m2, cantidad, bolsones, config = {}, medio, factura, cuotas }) {
  const hay = (v) => v !== undefined && v !== null && v !== '';
  let porBolsones = null;
  if (hay(bolsones)) {
    if (hay(m2) || hay(cantidad)) return { ok: false, faltaDato: [], supuestos: [], error: 'cantidad_doble' };
    const t = String(bolsones).trim();
    if (!/^\d{1,4}$/.test(t) || Number(t) < 1) return { ok: false, faltaDato: [], supuestos: [], error: 'bolsones_invalidos' };
    porBolsones = Number(t);
    cantidad = porBolsones * BOLSAS_POR_BOLSON;
  }
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
    if (porBolsones !== null) r.bolsones = porBolsones;
    r.tramo = { desde: tramo.desde, hasta: tramo.hasta };
    r.supuestos = [...(r.supuestos || []), 'tramos_granza_1-9_10-14_15-19_20+'];
  }
  return r;
}

module.exports = { TRAMOS, NOMBRES, BOLSAS_POR_BOLSON, COBERTURA_M2_POR_BOLSA, tramoPara, productoDelTramo, productosDelCatalogo, esGranza, cotizarGranza };
