'use strict';
/**
 * Catalogo de Somos Piedra: convierte filas de la planilla de precios en productos para `cotizador-piedra.js`
 * y busca productos por nombre. Modulo puro (sin red, sin disco, sin otros archivos del repo).
 * Los precios se pasan a centavos enteros sin flotantes. Lo que falta queda en `problemas` (FALTA DATO):
 * nunca se completa ni se adivina (unidad, cobertura o precio).
 *
 * API
 *  pesosACentavos(v) -> entero > 0 o null.  Numeros (78000, 78000.5) o texto argentino ("$ 78.000", "78.000,50").
 *  armarCatalogo(filas) -> { productos: [producto], problemas: [{ fila, nombre, faltaDato: [] }] }
 *    filas: objetos con encabezados libres: PRODUCTO|NOMBRE, EFECTIVO, PRECIO LISTA|LISTA, UNIDAD, COBERTURA M2, TRAMO.
 *    Filas con el mismo producto y TRAMO se juntan en `tramos` (precio del tramo entero).
 *  buscarProductos(catalogo, consulta, { max = 5 }) -> [{ nombre, unidad, tienePrecio, puntaje }] (sin montos).
 *    Singular y plural dan lo mismo: "adoquines" encuentra "Adoquin" y al reves.
 */

const UNIDADES = {
  m2: 'm2', 'm²': 'm2', mt2: 'm2', 'metro cuadrado': 'm2', 'metros cuadrados': 'm2',
  metro: 'metro', metros: 'metro', 'metro lineal': 'metro',
  m3: 'm3', 'm³': 'm3', 'metro cubico': 'm3',
  kg: 'kg', kilo: 'kg', kilos: 'kg',
  unidad: 'unidad', unidades: 'unidad', u: 'unidad', un: 'unidad', unid: 'unidad',
  bolsa: 'bolsa', bolsas: 'bolsa', bolson: 'bolson', bolsones: 'bolson',
  caja: 'caja', cajas: 'caja', malla: 'malla', mallas: 'malla',
  litro: 'litro', litros: 'litro', lt: 'litro', l: 'litro',
};

const PARADAS = new Set(['de', 'del', 'la', 'las', 'el', 'los', 'para', 'con', 'en', 'y', 'a', 'un', 'una', 'por', 'que', 'mi', 'me', 'al']);

const sinAcentos = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '');
const clave = (s) => sinAcentos(s).toLowerCase().replace(/_/g, ' ').replace(/\s+/g, ' ').trim();
const palabras = (s) => sinAcentos(s).toLowerCase().replace(/²/g, '2').replace(/³/g, '3').replace(/[^a-z0-9]+/g, ' ').trim().split(' ').filter(Boolean);

/** "123" + "4" decimales -> centavos enteros (Number). */
function aCentavos(enteros, decimales) {
  const n = BigInt(enteros) * 100n + BigInt((decimales + '00').slice(0, 2));
  if (n <= 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) return null;
  return Number(n);
}

function pesosACentavos(v) {
  if (typeof v === 'number') {
    if (!Number.isFinite(v) || v <= 0) return null;
    v = String(v);
    const m = v.match(/^(\d+)(?:\.(\d{1,2}))?$/);
    return m ? aCentavos(m[1], m[2] || '') : null;
  }
  if (typeof v !== 'string') return null;
  const s = v.replace(/\$/g, '').replace(/\s/g, '');
  if (!s) return null;
  let m;
  if (s.includes(',')) {
    m = s.match(/^(\d{1,3}(?:\.\d{3})+|\d+),(\d{1,2})$/);
    return m ? aCentavos(m[1].replace(/\./g, ''), m[2]) : null;
  }
  if ((m = s.match(/^\d{1,3}(?:\.\d{3})+$/))) return aCentavos(s.replace(/\./g, ''), '');
  if ((m = s.match(/^(\d+)(?:\.(\d{1,2}))?$/))) return aCentavos(m[1], m[2] || '');
  return null;
}

const CAMPOS = {
  producto: 'nombre', nombre: 'nombre',
  efectivo: 'efectivo', 'precio efectivo': 'efectivo',
  'precio lista': 'lista', lista: 'lista',
  unidad: 'unidad', 'unidad de venta': 'unidad',
  'cobertura m2': 'cobertura', cobertura: 'cobertura',
  tramo: 'tramo',
};

function leerFila(fila) {
  const r = {};
  for (const [k, v] of Object.entries(fila || {})) {
    const campo = CAMPOS[clave(k)];
    if (campo && r[campo] === undefined) r[campo] = v;
  }
  return r;
}

const textoDecimal = (v) => {
  if (v === undefined || v === null || v === '') return null;
  const s = String(v).trim().replace(',', '.');
  return /^\d+(\.\d+)?$/.test(s) && /[1-9]/.test(s) ? s : null;
};

function armarCatalogo(filas) {
  const productos = [];
  const problemas = [];
  const porNombre = new Map();
  const vistos = new Set();

  (filas || []).forEach((filaCruda, i) => {
    const fila = i + 1;
    const f = leerFila(filaCruda);
    const nombre = typeof f.nombre === 'string' ? f.nombre.trim() : f.nombre == null ? '' : String(f.nombre).trim();
    if (!nombre) { problemas.push({ fila, nombre: '', faltaDato: ['nombre'] }); return; }
    const k = clave(nombre);
    const falta = [];

    const unidad = f.unidad == null || f.unidad === '' ? undefined : UNIDADES[clave(f.unidad)];
    const efectivoCentavos = pesosACentavos(f.efectivo);
    const listaCentavos = pesosACentavos(f.lista);
    const tramo = textoDecimal(f.tramo);

    if (tramo) {
      let p = porNombre.get(k);
      if (p && !p.tramos) { problemas.push({ fila, nombre, faltaDato: ['nombre_repetido'] }); return; }
      if (!p) {
        p = { nombre, tramos: [] };
        if (unidad) p.unidad = unidad; else falta.push('unidad');
        porNombre.set(k, p);
        productos.push(p);
      }
      if (p.tramos.some((t) => t.cantidad === tramo)) { problemas.push({ fila, nombre, faltaDato: ['tramo_repetido'] }); return; }
      const t = { cantidad: tramo };
      if (efectivoCentavos) t.efectivoCentavos = efectivoCentavos; else falta.push('efectivoCentavos');
      if (listaCentavos) t.listaCentavos = listaCentavos; else falta.push('listaCentavos');
      p.tramos.push(t);
      if (falta.length) problemas.push({ fila, nombre, faltaDato: falta });
      return;
    }

    if (vistos.has(k) || porNombre.has(k)) { problemas.push({ fila, nombre, faltaDato: ['nombre_repetido'] }); return; }
    vistos.add(k);
    const p = { nombre };
    if (unidad) p.unidad = unidad; else falta.push('unidad');
    if (efectivoCentavos) p.efectivoCentavos = efectivoCentavos; else falta.push('efectivoCentavos');
    if (listaCentavos) p.listaCentavos = listaCentavos; else falta.push('listaCentavos');
    const cobertura = textoDecimal(f.cobertura);
    if (cobertura) p.coberturaM2 = cobertura;
    porNombre.set(k, p);
    productos.push(p);
    if (falta.length) problemas.push({ fila, nombre, faltaDato: falta });
  });

  return { productos, problemas };
}

/** La palabra y sus singulares posibles ("adoquines" -> adoquines, adoquine, adoquin), con 3 letras o mas. */
function formas(w) {
  const f = [w];
  if (w.endsWith('s') && w.length >= 4) f.push(w.slice(0, -1));
  if (w.endsWith('es') && w.length >= 5) f.push(w.slice(0, -2));
  return f;
}

function buscarProductos(catalogo, consulta, { max = 5 } = {}) {
  const pedidas = palabras(consulta || '').filter((w) => !PARADAS.has(w));
  if (!pedidas.length) return [];
  const encontrados = [];
  for (const p of (catalogo && catalogo.productos) || []) {
    const suyas = palabras(p.nombre);
    let puntaje = 0;
    for (const w of pedidas) {
      const formasW = formas(w);
      if (suyas.some((s) => s === w || (w.length >= 3 && s.startsWith(w)) || formas(s).some((f) => formasW.includes(f)))) puntaje++;
    }
    if (puntaje) {
      const tienePrecio = Boolean(p.efectivoCentavos || p.listaCentavos || (p.tramos || []).some((t) => t.efectivoCentavos || t.listaCentavos));
      encontrados.push({ nombre: p.nombre, unidad: p.unidad || null, tienePrecio, puntaje });
    }
  }
  encontrados.sort((a, b) => b.puntaje - a.puntaje || a.nombre.localeCompare(b.nombre, 'es'));
  return encontrados.slice(0, max);
}

module.exports = { pesosACentavos, armarCatalogo, buscarProductos };
