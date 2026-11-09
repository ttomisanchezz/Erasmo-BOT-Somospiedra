'use strict';
/**
 * Cotizador de Somos Piedra. Modulo puro: sin red, sin disco, sin fechas, sin otros archivos del repo.
 * Los montos los calcula este codigo, nunca la IA. Plata en centavos enteros (BigInt adentro).
 *
 * Reglas (Tomas, 16/10/2026; cambiadas el 30/10 y el 02/11, y confirmadas el 09/11/2026):
 *  - Cada producto tiene dos precios: EFECTIVO y PRECIO LISTA (por unidad de venta).
 *  - EFECTIVO: efectivo, transferencia, Mercado Pago y QR. LISTA: tarjeta (un solo pago), cheque y postnet.
 *  - Sin factura se cobra ese precio. CON FACTURA se suma el 21 % de IVA al precio que sea, efectivo O lista
 *    (decision del 30/10: manda lo que dijo Fran; la regla del 16/10, "la lista ya es final", quedo vieja).
 *  - Redondeo (02/11): SIEMPRE para abajo, a la centena de pesos (10.550 -> 10.500), en cada total que se muestra.
 *  - Orden de la cuenta: precio x cantidad -> + 21 % si hay factura -> para abajo a la centena.
 *  - Si no dicen como pagan: el de efectivo (el bot aclara que con tarjeta es otro).
 *  - Lo que falta es FALTA DATO y no sale ningun monto que dependa de eso.
 *
 * API
 *  cotizar({ producto, m2?, cantidad?, config, medio?, factura?, cuotas? }) ->
 *    { ok, error?, faltaDato: [], supuestos: [], unidad, cantidad: '13.20' | '83', m2Cubiertos?,
 *      efectivo: { ok, totalCentavos, conFactura: { totalCentavos } } | { ok:false, faltaDato },
 *      lista:    { ok, totalCentavos, conFactura: { totalCentavos } } | { ok:false, faltaDato },
 *      porDefecto: 'efectivo',
 *      elegido:  { ok, columna, factura, totalCentavos } | { ok:false, columna, faltaDato } }
 *  producto: { nombre, unidad: 'm2'|'metro'|'m3'|'kg'|'unidad'|'bolsa'|'bolson'|'caja'|'malla'|'litro',
 *              efectivoCentavos?, listaCentavos?, coberturaM2? (m2 que cubre una unidad entera),
 *              tramos?: [{ cantidad, efectivoCentavos, listaCentavos }] (precio del tramo entero) }
 *  config:   { desperdicioPct } (obligatorio si el pedido viene en m2 y no es por tramos; 0 es valido si se carga)
 *  columnaPorMedio(medio) -> 'efectivo' | 'lista' | null      formatearPesos(centavos) -> '$94.380'
 */

const FRACCIONABLES = new Set(['m2', 'metro', 'm3', 'kg']);
const ENTERAS = new Set(['unidad', 'bolsa', 'bolson', 'caja', 'malla', 'litro']);
const IVA_PCT = 21n;
/** La centena de pesos, en centavos: el redondeo siempre es para abajo a un multiplo de esto. */
const CENTENA = 10000n;

const MEDIOS = {
  efectivo: 'efectivo', transferencia: 'efectivo', mercadopago: 'efectivo', qr: 'efectivo',
  debito: 'lista', credito: 'lista', tarjeta: 'lista', cheque: 'lista', postnet: 'lista',
};
const MEDIOS_CUOTAS = new Set(['credito', 'tarjeta']);

function columnaPorMedio(medio) {
  if (medio === undefined || medio === null || medio === '') return 'efectivo';
  const k = String(medio).toLowerCase().replace(/[\s_-]/g, '');
  return MEDIOS[k] || null;
}

// --- aritmetica entera ---
const ceilDiv = (a, b) => (a + b - 1n) / b;

/** Numero o texto ("12,5") -> entero escalado a `dec` decimales, redondeando para arriba. null si no sirve. */
function aEscala(v, dec) {
  if (typeof v === 'number') { if (!Number.isFinite(v) || v < 0) return null; v = String(v); }
  if (typeof v !== 'string') return null;
  const m = v.trim().match(/^(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const frac = m[2] || '';
  const escala = 10n ** BigInt(dec);
  let n = BigInt(m[1]) * escala + BigInt((frac + '0'.repeat(dec)).slice(0, dec) || '0');
  if (frac.length > dec && /[1-9]/.test(frac.slice(dec))) n += 1n;
  return n;
}

const precioValido = (v) => Number.isSafeInteger(v) && v > 0;
const conDec = (n, dec) => {
  const s = n.toString().padStart(dec + 1, '0');
  return dec ? s.slice(0, -dec) + '.' + s.slice(-dec) : s;
};

function formatearPesos(centavos) {
  const c = BigInt(centavos);
  const neg = c < 0n;
  const a = neg ? -c : c;
  const pesos = (a / 100n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  const cent = a % 100n;
  return (neg ? '-' : '') + '$' + pesos + (cent ? ',' + cent.toString().padStart(2, '0') : '');
}

/** Para abajo a la centena de pesos (en centavos). */
const aLaCentena = (centavos) => (centavos / CENTENA) * CENTENA;

/**
 * Una columna de precio (efectivo o lista): el total sin factura y el total con factura (+ 21 %), cada uno
 * redondeado para abajo a la centena DESDE la cuenta exacta (no se redondea dos veces). Un total que queda
 * en cero (un producto de menos de $100) no es un monto: FALTA DATO.
 */
function unaColumna(precioUnit, mult, faltante) {
  // mult: funcion precio -> total en centavos (BigInt)
  if (!precioValido(precioUnit)) return { ok: false, faltaDato: [faltante] };
  const t = mult(BigInt(precioUnit));
  const sinFactura = aLaCentena(t);
  const conFactura = ((t * (100n + IVA_PCT)) / 100n / CENTENA) * CENTENA;
  if (sinFactura <= 0n) return { ok: false, faltaDato: ['total_menor_a_una_centena'] };
  return { ok: true, totalCentavos: Number(sinFactura), conFactura: { totalCentavos: Number(conFactura) } };
}
const columnaEfectivo = (precioUnit, mult) => unaColumna(precioUnit, mult, 'efectivoCentavos');
const columnaLista = (precioUnit, mult) => unaColumna(precioUnit, mult, 'listaCentavos');

function cotizar(args) {
  const { producto, m2, cantidad, config = {}, medio, factura = false, cuotas } = args || {};
  const out = { ok: false, faltaDato: [], supuestos: [] };
  const error = (e) => ({ ...out, error: e });

  if (!producto || typeof producto !== 'object') return error('falta_producto');
  const hayM2 = m2 !== undefined && m2 !== null && m2 !== '';
  const hayCant = cantidad !== undefined && cantidad !== null && cantidad !== '';
  if (hayM2 && hayCant) return error('cantidad_doble');
  if (!hayM2 && !hayCant) return error('falta_cantidad');
  const pedido = aEscala(hayM2 ? m2 : cantidad, 2); // centesimos
  if (pedido === null || pedido <= 0n) return error('cantidad_invalida');

  const columna = columnaPorMedio(medio);
  if (columna === null) return error('medio_desconocido');
  const nCuotas = cuotas === undefined || cuotas === null ? 1 : Number(cuotas);
  if (!Number.isSafeInteger(nCuotas) || nCuotas < 1) return error('cuotas_invalidas');
  if (nCuotas > 1 && !MEDIOS_CUOTAS.has(String(medio || '').toLowerCase())) return error('cuotas_solo_con_tarjeta');

  const unidad = producto.unidad;
  out.unidad = unidad;
  if (!FRACCIONABLES.has(unidad) && !ENTERAS.has(unidad)) {
    out.faltaDato.push('unidad');
    return out;
  }

  let efectivo, lista;

  if (Array.isArray(producto.tramos) && producto.tramos.length) {
    // Precio del tramo entero. Supuesto a confirmar con Fran (pregunta 9.2). Sin desperdicio.
    out.supuestos.push('precio_de_tramo_es_total');
    const tramo = producto.tramos.find((t) => aEscala(t && t.cantidad, 2) === pedido);
    if (!tramo) { out.faltaDato.push('regla_tramos'); return out; }
    out.cantidad = conDec(pedido, 2);
    const uno = (p) => p;
    efectivo = columnaEfectivo(tramo.efectivoCentavos, uno);
    lista = columnaLista(tramo.listaCentavos, uno);
  } else {
    let mult;
    if (hayM2) {
      const bp = aEscala(config.desperdicioPct, 2); // puntos basicos
      if (bp === null) { out.faltaDato.push('desperdicioPct'); return out; }
      const conDesp = ceilDiv(pedido * (10000n + bp), 10000n); // centesimos de m2
      if (unidad === 'm2') {
        out.cantidad = conDec(conDesp, 2);
        mult = (p) => (p * conDesp) / 100n; // al centavo, para abajo: nunca sube un total
      } else if (ENTERAS.has(unidad)) {
        const cob = aEscala(producto.coberturaM2, 4); // diezmilesimos de m2
        if (cob === null || cob <= 0n) { out.faltaDato.push('coberturaM2'); return out; }
        const unidades = ceilDiv(conDesp * 100n, cob);
        out.cantidad = unidades.toString();
        out.m2Cubiertos = conDec((unidades * cob) / 100n, 2);
        mult = (p) => p * unidades;
      } else {
        out.faltaDato.push('coberturaM2');
        return out;
      }
    } else if (ENTERAS.has(unidad)) {
      if (pedido % 100n !== 0n) return error('cantidad_no_entera');
      const unidades = pedido / 100n;
      out.cantidad = unidades.toString();
      mult = (p) => p * unidades;
    } else {
      out.cantidad = conDec(pedido, 2);
      mult = (p) => (p * pedido) / 100n;
    }
    efectivo = columnaEfectivo(producto.efectivoCentavos, mult);
    lista = columnaLista(producto.listaCentavos, mult);
  }

  if (!efectivo.ok && !lista.ok) {
    out.faltaDato.push(...efectivo.faltaDato, ...lista.faltaDato);
    delete out.cantidad;
    delete out.m2Cubiertos;
    return out;
  }

  out.ok = true;
  out.efectivo = efectivo;
  out.lista = lista;
  out.porDefecto = 'efectivo';

  const col = columna === 'lista' ? lista : efectivo;
  if (!col.ok) out.elegido = { ok: false, columna, faltaDato: col.faltaDato };
  else if (nCuotas > 1) out.elegido = { ok: false, columna, faltaDato: ['recargo_cuotas'] };
  else {
    // Con factura, +21 % sobre la columna que sea (efectivo o lista).
    out.elegido = { ok: true, columna, factura: !!factura,
      totalCentavos: factura ? col.conFactura.totalCentavos : col.totalCentavos };
  }
  return out;
}

module.exports = { cotizar, columnaPorMedio, formatearPesos };
