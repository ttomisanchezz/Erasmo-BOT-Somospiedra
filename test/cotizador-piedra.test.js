'use strict';
/**
 * Cotizador de Somos Piedra: dos precios por producto (EFECTIVO y PRECIO LISTA).
 * Productos y precios INVENTADOS: ningun precio real de Piedra va en los tests.
 * Decisiones de Tomas (16/10/2026):
 *  - EFECTIVO: efectivo, transferencia, Mercado Pago y QR. Con factura se suma el 21 % de IVA.
 *  - LISTA: tarjeta (debito o credito), cheque y postnet. Ya es el precio final con factura.
 *  - Si no dicen como pagan, el bot dice el de efectivo (y aclara que con tarjeta es otro).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const c = require('../src/cotizador-piedra');

let fallas = 0;
function caso(nombre, fn) {
  try { fn(); console.log('  ok  ' + nombre); }
  catch (e) { fallas++; console.log('  MAL ' + nombre + '\n      ' + e.message); }
}

const CONFIG = { desperdicioPct: 0 };
const CONFIG10 = { desperdicioPct: 10 };

// Producto por m2: $50.000 efectivo, $60.000 lista.
const laja = { nombre: 'Laja de prueba', unidad: 'm2', efectivoCentavos: 5000000, listaCentavos: 6000000 };
// Producto por unidad que cubre 0,16 m2.
const baldosa = { nombre: 'Baldosa de prueba', unidad: 'unidad', coberturaM2: 0.16, efectivoCentavos: 600000, listaCentavos: 720000 };
// Producto por tramos (precio del tramo entero).
const granza = {
  nombre: 'Granza de prueba', unidad: 'm2',
  tramos: [
    { cantidad: 1, efectivoCentavos: 2000000, listaCentavos: 2400000 },
    { cantidad: 10, efectivoCentavos: 15000000, listaCentavos: 18000000 },
    { cantidad: 20, efectivoCentavos: 28000000, listaCentavos: 33600000 },
  ],
};

console.log('cotizador-piedra');

caso('12 m2 de laja: efectivo, efectivo con factura y lista', () => {
  const r = c.cotizar({ producto: laja, m2: 12, config: CONFIG });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.cantidad, '12.00');
  assert.strictEqual(r.efectivo.totalCentavos, 60000000);           // $600.000
  assert.strictEqual(r.efectivo.conFactura.totalCentavos, 72600000); // $726.000
  assert.strictEqual(r.efectivo.conFactura.netoCentavos, 60000000);
  assert.strictEqual(r.efectivo.conFactura.ivaCentavos, 12600000);
  assert.strictEqual(r.lista.totalCentavos, 72000000);               // $720.000, ya con factura
  assert.strictEqual(r.lista.netoCentavos, 59504132);
  assert.strictEqual(r.lista.ivaCentavos, 12495868);
  assert.strictEqual(r.porDefecto, 'efectivo');
});

caso('12,5 m2 (texto con coma) = $625.000 efectivo', () => {
  const r = c.cotizar({ producto: laja, m2: '12,5', config: CONFIG });
  assert.strictEqual(r.cantidad, '12.50');
  assert.strictEqual(r.efectivo.totalCentavos, 62500000);
});

caso('12 m2 + 10 % de desperdicio = 13,20 m2 = $660.000', () => {
  const r = c.cotizar({ producto: laja, m2: 12, config: CONFIG10 });
  assert.strictEqual(r.cantidad, '13.20');
  assert.strictEqual(r.efectivo.totalCentavos, 66000000);
});

caso('m2 con mas de dos decimales se redondea para arriba al centesimo', () => {
  const r = c.cotizar({ producto: laja, m2: '10.001', config: CONFIG });
  assert.strictEqual(r.cantidad, '10.01');
});

caso('baldosa: 12 m2 + 10 % -> 83 unidades, 13,28 m2, $498.000', () => {
  const r = c.cotizar({ producto: baldosa, m2: 12, config: CONFIG10 });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.cantidad, '83');
  assert.strictEqual(r.m2Cubiertos, '13.28');
  assert.strictEqual(r.efectivo.totalCentavos, 49800000);
  assert.strictEqual(r.lista.totalCentavos, 59760000);
});

caso('cantidad directa en la unidad del producto (sin m2)', () => {
  const r = c.cotizar({ producto: baldosa, cantidad: 10, config: CONFIG });
  assert.strictEqual(r.cantidad, '10');
  assert.strictEqual(r.efectivo.totalCentavos, 6000000);
});

caso('unidad entera no acepta fracciones', () => {
  const r = c.cotizar({ producto: baldosa, cantidad: '2,5', config: CONFIG });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'cantidad_no_entera');
});

caso('tramo exacto: 10 m2 de granza = precio del tramo', () => {
  const r = c.cotizar({ producto: granza, m2: 10, config: CONFIG });
  assert.strictEqual(r.ok, true, JSON.stringify(r));
  assert.strictEqual(r.efectivo.totalCentavos, 15000000);
  assert.strictEqual(r.lista.totalCentavos, 18000000);
  assert.ok(r.supuestos.includes('precio_de_tramo_es_total'));
});

caso('tramo no exacto: 12 m2 de granza -> FALTA DATO, sin montos', () => {
  const r = c.cotizar({ producto: granza, m2: 12, config: CONFIG });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.faltaDato, ['regla_tramos']);
  assert.strictEqual(r.efectivo, undefined);
  assert.strictEqual(r.lista, undefined);
});

caso('sin unidad -> FALTA DATO unidad, ningun monto', () => {
  const r = c.cotizar({ producto: { nombre: 'X', efectivoCentavos: 100, listaCentavos: 120 }, m2: 3, config: CONFIG });
  assert.strictEqual(r.ok, false);
  assert.ok(r.faltaDato.includes('unidad'));
  assert.strictEqual(r.efectivo, undefined);
});

caso('por unidad sin cobertura y pedido en m2 -> FALTA DATO coberturaM2', () => {
  const p = { nombre: 'X', unidad: 'unidad', efectivoCentavos: 100, listaCentavos: 120 };
  const r = c.cotizar({ producto: p, m2: 3, config: CONFIG });
  assert.deepStrictEqual(r.faltaDato, ['coberturaM2']);
});

caso('sin desperdicio configurado y pedido en m2 -> FALTA DATO desperdicioPct', () => {
  const r = c.cotizar({ producto: laja, m2: 3, config: {} });
  assert.deepStrictEqual(r.faltaDato, ['desperdicioPct']);
});

caso('sin precio de lista: el efectivo sale y la lista dice FALTA DATO', () => {
  const p = { nombre: 'X', unidad: 'm2', efectivoCentavos: 5000000 };
  const r = c.cotizar({ producto: p, m2: 2, config: CONFIG });
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.efectivo.totalCentavos, 10000000);
  assert.deepStrictEqual(r.lista, { ok: false, faltaDato: ['listaCentavos'] });
});

caso('sin ningun precio -> FALTA DATO de los dos, ok false', () => {
  const p = { nombre: 'Micosa de prueba', unidad: 'm2' };
  const r = c.cotizar({ producto: p, m2: 2, config: CONFIG });
  assert.strictEqual(r.ok, false);
  assert.deepStrictEqual(r.faltaDato.sort(), ['efectivoCentavos', 'listaCentavos']);
});

caso('precio 0 o negativo o con decimales cuenta como FALTA DATO', () => {
  for (const v of [0, -5, 10.5, '100', null]) {
    const r = c.cotizar({ producto: { nombre: 'X', unidad: 'm2', efectivoCentavos: v, listaCentavos: v }, m2: 1, config: CONFIG });
    assert.strictEqual(r.ok, false, 'valor ' + v);
  }
});

caso('cantidad faltante, cero o rara -> error', () => {
  assert.strictEqual(c.cotizar({ producto: laja, config: CONFIG }).error, 'falta_cantidad');
  assert.strictEqual(c.cotizar({ producto: laja, m2: 0, config: CONFIG }).error, 'cantidad_invalida');
  assert.strictEqual(c.cotizar({ producto: laja, m2: 'doce', config: CONFIG }).error, 'cantidad_invalida');
  assert.strictEqual(c.cotizar({ producto: laja, m2: 2, cantidad: 2, config: CONFIG }).error, 'cantidad_doble');
});

caso('columna por medio de pago', () => {
  for (const m of ['efectivo', 'transferencia', 'mercadopago', 'qr']) assert.strictEqual(c.columnaPorMedio(m), 'efectivo', m);
  for (const m of ['debito', 'credito', 'cheque', 'postnet', 'tarjeta']) assert.strictEqual(c.columnaPorMedio(m), 'lista', m);
  assert.strictEqual(c.columnaPorMedio(undefined), 'efectivo');
  assert.strictEqual(c.columnaPorMedio('bitcoin'), null);
});

caso('con medio: elegido apunta a la columna correcta', () => {
  const r = c.cotizar({ producto: laja, m2: 1, config: CONFIG, medio: 'credito' });
  assert.strictEqual(r.elegido.columna, 'lista');
  assert.strictEqual(r.elegido.totalCentavos, 6000000);
  const t = c.cotizar({ producto: laja, m2: 1, config: CONFIG, medio: 'transferencia', factura: true });
  assert.strictEqual(t.elegido.columna, 'efectivo');
  assert.strictEqual(t.elegido.totalCentavos, 6050000); // 50.000 + 21 %
  const s = c.cotizar({ producto: laja, m2: 1, config: CONFIG });
  assert.strictEqual(s.elegido.columna, 'efectivo');
  assert.strictEqual(s.elegido.totalCentavos, 5000000);
});

caso('medio desconocido -> error de dominio', () => {
  const r = c.cotizar({ producto: laja, m2: 1, config: CONFIG, medio: 'bitcoin' });
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.error, 'medio_desconocido');
});

caso('cuotas con tarjeta -> FALTA DATO recargo_cuotas (todavia no definido)', () => {
  const r = c.cotizar({ producto: laja, m2: 1, config: CONFIG, medio: 'credito', cuotas: 3 });
  assert.strictEqual(r.elegido.ok, false);
  assert.deepStrictEqual(r.elegido.faltaDato, ['recargo_cuotas']);
  assert.strictEqual(r.elegido.totalCentavos, undefined);
});

caso('cuotas con un medio que no es tarjeta -> error', () => {
  const r = c.cotizar({ producto: laja, m2: 1, config: CONFIG, medio: 'efectivo', cuotas: 3 });
  assert.strictEqual(r.error, 'cuotas_solo_con_tarjeta');
});

caso('IVA redondea al centavo mas cercano (mitad para arriba)', () => {
  const p = { nombre: 'X', unidad: 'unidad', efectivoCentavos: 3333333, listaCentavos: 4000000 };
  const r = c.cotizar({ producto: p, cantidad: 1, config: CONFIG });
  assert.strictEqual(r.efectivo.conFactura.totalCentavos, 4033333);
  assert.strictEqual(r.efectivo.conFactura.ivaCentavos, 700000);
});

caso('formatear pesos', () => {
  assert.strictEqual(c.formatearPesos(72600000), '$726.000');
  assert.strictEqual(c.formatearPesos(4033333), '$40.333,33');
  assert.strictEqual(c.formatearPesos(5), '$0,05');
  assert.strictEqual(c.formatearPesos(123456789000), '$1.234.567.890');
});

caso('el modulo no usa flotantes sobre plata ni requiere otros archivos', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'cotizador-piedra.js'), 'utf8');
  for (const prohibido of ['parseFloat', 'toFixed(', 'Math.round(', 'Math.floor(', 'Math.ceil(']) {
    assert.ok(!src.includes(prohibido), 'usa ' + prohibido);
  }
  assert.ok(!/require\(\s*['"]\.\.?\//.test(src), 'requiere un archivo del repo');
});

if (fallas) { console.log(fallas + ' casos fallaron'); process.exit(1); }
console.log('todo bien');
