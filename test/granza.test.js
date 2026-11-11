'use strict';
/**
 * La granza (src/granza.js): por m2, en bolsas, tramos 1-9 / 10-19 / 20+ (supuesto a confirmar con Fran).
 * El orden de la cuenta: precio x bolsas -> + 21 % si hay factura -> para abajo a la centena.
 */
const assert = require('assert');
const g = require('../src/granza');
const c = require('../src/cotizador-piedra');

let fallas = 0;
function caso(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); } catch (e) { fallas++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
}
const CONFIG = { desperdicioPct: 0 };
const granza = g.productosDelCatalogo()[0];
const pesos = (centavos) => c.formatearPesos(centavos);
const cuenta = (m2) => g.cotizarGranza({ producto: granza, m2, config: CONFIG });

console.log('granza');

caso('la tabla de tramos esta en un solo lugar: la del 06/11 con los dos precios que fijo Tomas el 11/11 (20 m2 en efectivo $310.000, 1 m2 con tarjeta $26.500)', () => {
  assert.deepStrictEqual(g.TRAMOS.map((t) => [t.desde, t.efectivoCentavos / 100, t.listaCentavos / 100]), [[1, 22000, 26500], [10, 20000, 25000], [20, 15500, 19000]]);
  assert.strictEqual(g.tramoPara(1).desde, 1);
  assert.strictEqual(g.tramoPara(9).desde, 1);
  assert.strictEqual(g.tramoPara(10).desde, 10);
  assert.strictEqual(g.tramoPara(19).desde, 10);
  assert.strictEqual(g.tramoPara(20).desde, 20);
  assert.strictEqual(g.tramoPara(250).desde, 20);
  assert.strictEqual(g.tramoPara(0), null);
  assert.strictEqual(g.tramoPara(2.5), null);
});

caso('5 m2: 5 bolsas, tramo 1-9: efectivo 110.000 / tarjeta 132.500; con factura 133.100 / 160.300 (132.500 x 1,21 = 160.325, para abajo)', () => {
  const r = cuenta(5);
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.bolsas, 5);
  assert.strictEqual(r.unidad, 'bolsa');
  assert.deepStrictEqual([pesos(r.efectivo.totalCentavos), pesos(r.lista.totalCentavos)], ['$110.000', '$132.500']);
  assert.deepStrictEqual([pesos(r.efectivo.conFactura.totalCentavos), pesos(r.lista.conFactura.totalCentavos)], ['$133.100', '$160.300']);
});

caso('12 m2: 12 bolsas, tramo 10-19: 240.000 / 300.000; con factura 290.400 / 363.000', () => {
  const r = cuenta(12);
  assert.strictEqual(r.bolsas, 12);
  assert.deepStrictEqual(r.tramo, { desde: 10, hasta: 19 });
  assert.deepStrictEqual([pesos(r.efectivo.totalCentavos), pesos(r.lista.totalCentavos)], ['$240.000', '$300.000']);
  assert.deepStrictEqual([pesos(r.efectivo.conFactura.totalCentavos), pesos(r.lista.conFactura.totalCentavos)], ['$290.400', '$363.000']);
});

caso('25 m2: 25 bolsas, tramo desde 20: 387.500 / 475.000; con factura 468.800 / 574.700 (387.500 x 1,21 = 468.875, para abajo)', () => {
  const r = cuenta(25);
  assert.strictEqual(r.bolsas, 25);
  assert.deepStrictEqual(r.tramo, { desde: 20, hasta: null });
  assert.deepStrictEqual([pesos(r.efectivo.totalCentavos), pesos(r.lista.totalCentavos)], ['$387.500', '$475.000']);
  assert.deepStrictEqual([pesos(r.efectivo.conFactura.totalCentavos), pesos(r.lista.conFactura.totalCentavos)], ['$468.800', '$574.700']);
});

caso('3,5 x 3,5 = 12,25 m2 -> 13 bolsas (los m2 se redondean para arriba)', () => {
  const r = cuenta('12.2500');
  assert.strictEqual(r.bolsas, 13);
  assert.strictEqual(pesos(r.efectivo.totalCentavos), '$260.000');
});

caso('el tramo se elige por bolsas: 9,2 m2 son 10 bolsas y entran al tramo de 10', () => {
  const r = cuenta('9,2');
  assert.strictEqual(r.bolsas, 10);
  assert.strictEqual(pesos(r.efectivo.totalCentavos), '$200.000');
});

caso('el limite de los tramos: 9 y 10 bolsas, 19 y 20 bolsas (19 sale mas caro que 20: se cobra la banda)', () => {
  const total = (n) => g.cotizarGranza({ producto: granza, cantidad: n, config: CONFIG }).efectivo.totalCentavos / 100;
  assert.deepStrictEqual([9, 10, 19, 20].map(total), [198000, 200000, 380000, 310000]);
});

caso('los dos precios que fijo Tomas el 11/11: 20 m2 en efectivo $310.000 y 1 m2 con tarjeta $26.500', () => {
  const veinte = cuenta(20);
  assert.deepStrictEqual([pesos(veinte.efectivo.totalCentavos), pesos(veinte.lista.totalCentavos)], ['$310.000', '$380.000']);
  const uno = cuenta(1);
  assert.deepStrictEqual([pesos(uno.efectivo.totalCentavos), pesos(uno.lista.totalCentavos)], ['$22.000', '$26.500']);
});

caso('por bolsas directas; una fraccion de bolsa no existe', () => {
  assert.strictEqual(g.cotizarGranza({ producto: granza, cantidad: 3, config: CONFIG }).bolsas, 3);
  assert.strictEqual(g.cotizarGranza({ producto: granza, cantidad: '2,5', config: CONFIG }).error, 'cantidad_no_entera');
});

caso('el desperdicio solo si se pide: 10 m2 con 10 % = 11 bolsas', () => {
  const r = g.cotizarGranza({ producto: granza, m2: 10, config: { desperdicioPct: 10 } });
  assert.strictEqual(r.bolsas, 11);
});

caso('errores de dominio pasan tal cual y no cobran nada', () => {
  const r = g.cotizarGranza({ producto: granza, m2: 0, config: CONFIG });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.efectivo, undefined);
  assert.strictEqual(g.cotizarGranza({ producto: granza, m2: 5, config: CONFIG, medio: 'bitcoin' }).error, 'medio_desconocido');
});

caso('el catalogo trae los 4 colores como granza, y nunca "bolson"', () => {
  const p = g.productosDelCatalogo();
  assert.strictEqual(p.length, 4);
  assert.ok(p.every((x) => g.esGranza(x) && x.unidad === 'bolsa'));
  assert.ok(!p.some((x) => /bols[oó]n/i.test(x.nombre)));
});

if (fallas) { console.log(fallas + ' casos fallaron'); process.exit(1); }
console.log('todo bien');
