'use strict';
/** Catalogo de Somos Piedra: filas de la planilla -> productos del cotizador, y busqueda por nombre.
 *  Productos y precios INVENTADOS. */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const cat = require('../src/catalogo-piedra');
const { cotizar } = require('../src/cotizador-piedra');

let fallas = 0;
function caso(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); }
  catch (e) { fallas++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
}
console.log('catalogo-piedra');

caso('pesos a centavos: numeros y textos con formato argentino', () => {
  const t = [
    [78000, 7800000], [78000.5, 7800050], ['78.000', 7800000], ['$ 78.000', 7800000], ['$78.000,50', 7800050],
    ['1.234.567', 123456700], ['78000', 7800000], ['78000.5', 7800050], ['78,5', 7850], [' 87.000 ', 8700000],
  ];
  for (const [v, esperado] of t) assert.strictEqual(cat.pesosACentavos(v), esperado, String(v));
});

caso('pesos invalidos o vacios -> null (FALTA DATO)', () => {
  for (const v of ['', null, undefined, '-', 'consultar', 0, '0', -5, '12.34.5', '78.0000', 'abc', NaN]) {
    assert.strictEqual(cat.pesosACentavos(v), null, String(v));
  }
});

caso('normalizar: encabezados con mayusculas y espacios', () => {
  const c = cat.armarCatalogo([
    { PRODUCTO: 'Laja de prueba', EFECTIVO: '50.000', 'PRECIO LISTA': '60.000' },
  ]);
  assert.strictEqual(c.productos.length, 1);
  const p = c.productos[0];
  assert.strictEqual(p.nombre, 'Laja de prueba');
  assert.strictEqual(p.efectivoCentavos, 5000000);
  assert.strictEqual(p.listaCentavos, 6000000);
  assert.strictEqual(p.unidad, undefined);
});

caso('problemas: sin unidad, sin precio, sin nombre, nombre repetido', () => {
  const c = cat.armarCatalogo([
    { producto: 'Laja de prueba', efectivo: 100, lista: 120, unidad: 'm2' },
    { producto: 'Micosa de prueba', efectivo: '', lista: '' },
    { producto: '', efectivo: 10, lista: 12 },
    { producto: 'laja de PRUEBA', efectivo: 100, lista: 120, unidad: 'm2' },
  ]);
  assert.strictEqual(c.productos.length, 2, 'la fila sin nombre y la repetida no entran');
  const prob = c.problemas.map((x) => x.fila + ':' + x.faltaDato.join(','));
  assert.deepStrictEqual(prob, [
    '2:unidad,efectivoCentavos,listaCentavos',
    '3:nombre',
    '4:nombre_repetido',
  ]);
});

caso('unidad: sinonimos conocidos; lo desconocido no se adivina', () => {
  const u = (x) => cat.armarCatalogo([{ producto: 'X', efectivo: 1, lista: 1, unidad: x }]).productos[0].unidad;
  assert.strictEqual(u('M2'), 'm2');
  assert.strictEqual(u('m²'), 'm2');
  assert.strictEqual(u('Bolsón'), 'bolson');
  assert.strictEqual(u('unidad'), 'unidad');
  assert.strictEqual(u('ml'), undefined);
  assert.strictEqual(u('caja'), 'caja'); // el panel tiene caja y malla (cobertura en m2)
  assert.strictEqual(u('pallet'), undefined);
});

caso('cobertura y tramos se pasan al cotizador', () => {
  const c = cat.armarCatalogo([
    { producto: 'Baldosa de prueba', efectivo: '6.000', lista: '7.200', unidad: 'unidad', cobertura_m2: '0,16' },
  ]);
  const r = cotizar({ producto: c.productos[0], m2: 12, config: { desperdicioPct: 10 } });
  assert.strictEqual(r.cantidad, '83');
  assert.strictEqual(r.efectivo.totalCentavos, 49800000);
});

caso('tramos: filas con el mismo producto y tramo se juntan', () => {
  const c = cat.armarCatalogo([
    { producto: 'Granza de prueba', tramo: 1, efectivo: '20.000', lista: '24.000', unidad: 'm2' },
    { producto: 'Granza de prueba', tramo: 10, efectivo: '150.000', lista: '180.000', unidad: 'm2' },
  ]);
  assert.strictEqual(c.productos.length, 1);
  const p = c.productos[0];
  assert.deepStrictEqual(p.tramos.map((t) => t.cantidad), ['1', '10']);
  const r = cotizar({ producto: p, m2: 10, config: { desperdicioPct: 0 } });
  assert.strictEqual(r.efectivo.totalCentavos, 15000000);
  assert.deepStrictEqual(c.problemas, []);
});

caso('buscar: sin acentos, sin mayusculas, por palabras, mejor primero', () => {
  const c = cat.armarCatalogo([
    { producto: 'GRANZA BLANCA MAR DEL PLATA', efectivo: 1, lista: 1 },
    { producto: 'Granza gris', efectivo: 1, lista: 1 },
    { producto: 'Travertino irregular', efectivo: 1, lista: 1 },
    { producto: 'Laja pizarra', efectivo: 1, lista: 1 },
  ]);
  const r = cat.buscarProductos(c, 'granza blanca');
  assert.deepStrictEqual(r.map((x) => x.nombre), ['GRANZA BLANCA MAR DEL PLATA', 'Granza gris']);
  assert.deepStrictEqual(cat.buscarProductos(c, 'TRAVERTÍNO').map((x) => x.nombre), ['Travertino irregular']);
  assert.deepStrictEqual(cat.buscarProductos(c, 'travert').map((x) => x.nombre), ['Travertino irregular']);
  assert.deepStrictEqual(cat.buscarProductos(c, 'cesped en rollo'), []);
  assert.deepStrictEqual(cat.buscarProductos(c, 'de la para'), []);
  assert.strictEqual(cat.buscarProductos(c, 'granza', { max: 1 }).length, 1);
});

caso('buscar: singular y plural dan lo mismo ("adoquines" encuentra "Adoquin", "pizarras" encuentra "Pizarra")', () => {
  const c = cat.armarCatalogo([
    { producto: 'Adoquines Ojito', efectivo: 1, lista: 1 },
    { producto: 'Micosa Adoquin 10X10', efectivo: 1, lista: 1 },
    { producto: 'Porfido Adoquin 10X10', efectivo: 1, lista: 1 },
    { producto: 'Pizarra Negra 30 Cm', efectivo: 1, lista: 1 },
    { producto: 'Granza gris', efectivo: 1, lista: 1 },
    { producto: 'Baldosa 40X40 Vainilla', efectivo: 1, lista: 1 },
  ]);
  const nombres = (q) => cat.buscarProductos(c, q).map((x) => x.nombre);
  const adoquines = ['Adoquines Ojito', 'Micosa Adoquin 10X10', 'Porfido Adoquin 10X10'];
  assert.deepStrictEqual(nombres('adoquines'), adoquines);
  assert.deepStrictEqual(nombres('adoquin'), adoquines);
  assert.deepStrictEqual(nombres('adoquínes micosa'), ['Micosa Adoquin 10X10', 'Adoquines Ojito', 'Porfido Adoquin 10X10']);
  assert.deepStrictEqual(nombres('pizarras negras'), ['Pizarra Negra 30 Cm']);
  assert.deepStrictEqual(nombres('granza grises'), ['Granza gris']);
  assert.deepStrictEqual(nombres('baldosas'), ['Baldosa 40X40 Vainilla']);
  // No se pasa de largo: una palabra corta o distinta no engancha por la "s".
  assert.deepStrictEqual(nombres('es'), []);
  assert.deepStrictEqual(nombres('gres'), []);
});

caso('buscar "laja": toda piedra es laja; la granza, la laca y las baldosas no (Tomás, 11/11/2026)', () => {
  const c = cat.armarCatalogo([
    { producto: 'Ocre Irregular', efectivo: 1, lista: 1 },
    { producto: 'Ocre Murete Irregular', efectivo: 1, lista: 1 },
    { producto: 'Pizarra Negra 30 Cm', efectivo: 1, lista: 1 },
    { producto: 'Adoquines Ojito', efectivo: 1, lista: 1 },
    { producto: 'Travertino Irregular', efectivo: 1, lista: 1 },
    { producto: 'Verde Bronce Irregular', efectivo: 1, lista: 1 },
    { producto: 'Zapala Irregular', efectivo: 1, lista: 1 },
    { producto: 'Granza gris', efectivo: 1, lista: 1 },
    { producto: 'Laca acrílica incolora Lata 1 litro', efectivo: 1, lista: 1 },
    { producto: 'Baldosa 40X40 Vainilla', efectivo: 1, lista: 1 },
    { producto: 'Baldosa Piedra Lavada 40X40', efectivo: 1, lista: 1 },
    { producto: 'Envío', efectivo: 1, lista: 1 },
    { producto: 'Flete paletizado', efectivo: 1, lista: 1 },
    { producto: 'Garden Block 35X35 Cm', efectivo: 1, lista: 1 },
  ]);
  const nombres = (q, o) => cat.buscarProductos(c, q, o).map((x) => x.nombre);
  const piedras = ['Adoquines Ojito', 'Ocre Irregular', 'Ocre Murete Irregular', 'Pizarra Negra 30 Cm', 'Travertino Irregular', 'Verde Bronce Irregular', 'Zapala Irregular'];
  // "laja" (o "piedra") sin nombrar ninguna: todas las piedras, aunque sean más que el tope
  assert.deepStrictEqual(nombres('laja', { max: 3 }), piedras);
  assert.deepStrictEqual(nombres('lajas'), piedras);
  assert.deepStrictEqual(nombres('piedras'), piedras);
  assert.deepStrictEqual(nombres('las lajas para el frente'), piedras, '"frente" no es un producto');
  assert.strictEqual(cat.pideLajaEnGeneral(c, 'laja'), true);
  assert.strictEqual(cat.pideLajaEnGeneral(c, 'laja san luis'), true, 'una que no se trabaja: se ve la lista entera');
  // "laja ocre": el producto es lo otro
  assert.deepStrictEqual(nombres('laja ocre'), ['Ocre Irregular', 'Ocre Murete Irregular']);
  assert.deepStrictEqual(nombres('piedra negra'), ['Pizarra Negra 30 Cm']);
  assert.strictEqual(cat.pideLajaEnGeneral(c, 'laja ocre'), false);
  // lo que no es laja se sigue encontrando por su nombre, también si le dicen laja o piedra
  assert.deepStrictEqual(nombres('laja vainilla'), ['Baldosa 40X40 Vainilla']);
  assert.deepStrictEqual(nombres('piedra lavada'), ['Baldosa Piedra Lavada 40X40']);
  assert.deepStrictEqual(nombres('granza'), ['Granza gris']);
  assert.deepStrictEqual(nombres('laca'), ['Laca acrílica incolora Lata 1 litro']);
  assert.strictEqual(cat.pideLajaEnGeneral(c, 'granza'), false);
  assert.strictEqual(cat.pideLajaEnGeneral(c, ''), false);
});

caso('buscar "laja": si un producto se llama así, va primero', () => {
  const c = cat.armarCatalogo([
    { producto: 'Zapala Irregular', efectivo: 1, lista: 1 },
    { producto: 'Laja San Luis', efectivo: 1, lista: 1 },
  ]);
  assert.deepStrictEqual(cat.buscarProductos(c, 'laja').map((x) => x.nombre), ['Laja San Luis', 'Zapala Irregular']);
  assert.deepStrictEqual(cat.buscarProductos(c, 'laja san luis').map((x) => x.nombre), ['Laja San Luis']);
});

caso('buscar no devuelve precios (los montos salen solo de cotizar)', () => {
  const c = cat.armarCatalogo([{ producto: 'Laja pizarra', efectivo: 1, lista: 1 }]);
  const r = cat.buscarProductos(c, 'laja')[0];
  assert.deepStrictEqual(Object.keys(r).sort(), ['nombre', 'puntaje', 'tienePrecio', 'unidad']);
});

caso('el modulo no usa flotantes sobre plata ni requiere otros archivos del repo', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'catalogo-piedra.js'), 'utf8');
  for (const p of ['parseFloat', 'toFixed(', 'Math.round(', 'Math.floor(', 'Math.ceil(']) assert.ok(!src.includes(p), 'usa ' + p);
  assert.ok(!/require\(\s*['"]\.\.?\//.test(src));
});

if (fallas) { console.log(fallas + ' casos fallaron'); process.exit(1); }
console.log('todo bien');
