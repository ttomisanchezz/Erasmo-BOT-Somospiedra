'use strict';
/**
 * Espejo del Cotizador (02/10/2026): qué filas de LISTA y LISTA 85-93 van a la app y cuándo.
 *
 *   node test/espejo-cotizador.test.js
 *
 * Sin red: la planilla son celdas en memoria (con la forma real de LISTA del 02/10/2026,
 * encabezados en la fila 4) y Supabase, un fetch de mentira.
 */
const assert = require('assert');

process.env.SUPABASE_URL = 'https://de-mentira.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_de_mentira';
process.env.ESPEJO_COTIZADOR_ACTIVO = 'true';

const config = require('../src/config');
config.techsur.supabaseUrl = process.env.SUPABASE_URL;
config.techsur.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const espejo = require('../src/espejo-cotizador');

const CAB = ['ID', 'Modelo', 'Capacidad_GB', 'Condicion', 'Bateria_min', 'Costo_proveedor', 'Margen', 'Precio_contado', 'Margen_pct', 'Anticipo_min', 'Anticipo_pct', 'Saldo_a_financiar', 'Pago_unico_manual', 'Pago_unico', 'Total_con_1_pago', 'Cuota_2_manual', 'Cuota_de_2', 'Total_con_2_pagos', 'Interes_2_real', 'Cotizable', 'Notas'];
const fila = (id, modelo, gb, cond, bat, costo, contado, anticipo, cotizable = 'SI', notas = '') => [id, modelo, gb, cond, bat, costo, 0, contado, 0, anticipo, 0, 0, '', 0, 0, '', 0, 0, 0, cotizable, notas];
const titulo = [['LISTA - catalogo por modelo'], ['Naranja = precio manual para la entrega minima.'], []];
const LISTA = [
  ...titulo,
  CAB,
  fila('N-002', 'iPhone 14', 128, 'Usado', 100, 518000, 595000, 360000, 'SI', 'Si no llega, minimo 250.000'),
  fila('N-003', 'iPhone 14 Pro', 128, 'Usado', 100, 775000, 835000, 500000),
  fila('N-005', 'iPhone 15 Pro', 128, 'Usado', '', 872025, 950000, 540000),
  fila('N-0014', 'Iphone 18 pro max ', 256, 'sellado ', '', 2660000, 2950000, 2300000),
  fila('N-0099', 'iPhone 12', 64, 'Usado', 100, 300000, 380000, 250000, 'NO'),
  fila('N-0098', 'iPhone 11', 128, 'Usado', 100, 180000, '', 150000),
  [],
];
const L8593 = [...titulo, CAB, fila('N-002', 'iPhone 14', 128, 'Usado', '85-93', 470000, 535000, 360000), fila('N-003', 'iPhone 14 Pro', 128, 'Usado', '85-93', 702000, 795000, 500000)];
let pestanas = { LISTA, 'LISTA 85-93': L8593 };
espejo.usarLector(async (p) => {
  if (!pestanas[p]) throw new Error(`Unable to parse range: '${p}'!A1:U200`);
  return pestanas[p];
});

let casos = 0;
async function caso(nombre, fn) {
  casos++;
  try {
    await fn();
    console.log(`  ok  ${nombre}`);
  } catch (e) {
    console.error(`  MAL ${nombre}\n${e.stack}`);
    process.exitCode = 1;
  }
}

const fetchReal = global.fetch;
const pedidos = [];
let guardado = null; // el hash que "tiene" Supabase
let falla = false;
global.fetch = async (url, op = {}) => {
  pedidos.push({ url: String(url), op });
  if (falla) return { ok: false, status: 503, text: async () => 'caído' };
  if ((op.method || 'GET') === 'GET') return { ok: true, status: 200, json: async () => (guardado ? [{ hash: guardado }] : []) };
  return { ok: true, status: 201, text: async () => '' };
};
const posts = () => pedidos.filter((p) => p.op.method === 'POST');
const silencio = async (fn) => {
  const [l, e] = [console.log, console.error];
  console.log = () => {};
  console.error = () => {};
  try {
    return await fn();
  } finally {
    console.log = l;
    console.error = e;
  }
};

(async () => {
  console.log('espejo-cotizador.test.js');

  await caso('las filas: solo cotizables con contado; capacidad, condición, batería y modelo prolijos', () => {
    const f = espejo.aFilas('LISTA', LISTA);
    assert.deepStrictEqual(
      f.map((x) => [x.posicion, x.fila_id, x.modelo, x.capacidad, x.condicion, x.bateria, x.costo_proveedor, x.precio_contado, x.anticipo_min]),
      [
        [0, 'N-002', 'iPhone 14', '128GB', 'usado', '100', 518000, 595000, 360000],
        [1, 'N-003', 'iPhone 14 Pro', '128GB', 'usado', '100', 775000, 835000, 500000],
        [2, 'N-005', 'iPhone 15 Pro', '128GB', 'usado', null, 872025, 950000, 540000],
        [3, 'N-0014', 'iPhone 18 Pro Max', '256GB', 'sellado', null, 2660000, 2950000, 2300000],
      ],
    );
    assert.strictEqual(f[0].notas, 'Si no llega, minimo 250.000');
    assert.strictEqual(espejo.aFilas('LISTA 85-93', L8593)[1].bateria, '85-93');
    assert.throws(() => espejo.aFilas('X', [['nada']]), /columna Modelo/);
  });

  await caso('primera vez: guarda las dos pestañas juntas, con el mismo leido_en y hash', async () => {
    espejo._reiniciar();
    pedidos.length = 0;
    const r = await silencio(() => espejo.copiar(Date.parse('2026-10-02T14:00:00Z')));
    assert.deepStrictEqual([r.guardo, r.filas], [true, 6]);
    assert.strictEqual(posts().length, 1);
    const p = posts()[0];
    assert.ok(p.url.endsWith('/rest/v1/precios_cotizador'));
    assert.strictEqual(p.op.headers.apikey, 'sb_secret_de_mentira');
    assert.strictEqual(p.op.headers.Authorization, undefined);
    const filas = JSON.parse(p.op.body);
    assert.deepStrictEqual(filas.map((x) => x.pestana), ['LISTA', 'LISTA', 'LISTA', 'LISTA', 'LISTA 85-93', 'LISTA 85-93']);
    assert.ok(filas.every((x) => x.leido_en === '2026-10-02T14:00:00.000Z' && x.hash === filas[0].hash));
    guardado = filas[0].hash;
  });

  await caso('sin cambios en la planilla no guarda otra copia', async () => {
    pedidos.length = 0;
    const r = await silencio(() => espejo.copiar());
    assert.deepStrictEqual([r.guardo, r.motivo], [false, 'sin cambios']);
    assert.strictEqual(posts().length, 0);
  });

  await caso('al arrancar de nuevo compara con la última copia de Supabase: igual, no guarda', async () => {
    espejo._reiniciar();
    pedidos.length = 0;
    const r = await silencio(() => espejo.copiar());
    assert.strictEqual(r.guardo, false);
    assert.strictEqual(pedidos.filter((p) => !p.op.method).length, 1, 'no le preguntó a Supabase la última copia');
    assert.strictEqual(posts().length, 0);
  });

  await caso('si cambia un precio, guarda una copia nueva entera', async () => {
    pestanas = { LISTA: LISTA.map((f) => (f[0] === 'N-003' ? f.map((c, j) => (j === 7 ? 845000 : c)) : f)), 'LISTA 85-93': L8593 };
    pedidos.length = 0;
    const r = await silencio(() => espejo.copiar());
    assert.deepStrictEqual([r.guardo, r.filas], [true, 6]);
    assert.strictEqual(JSON.parse(posts()[0].op.body)[1].precio_contado, 845000);
  });

  await caso('si una pestaña no se puede leer, no guarda nada (sigue la copia anterior)', async () => {
    pestanas = { LISTA };
    pedidos.length = 0;
    const r = await silencio(() => espejo.copiar());
    assert.strictEqual(r.guardo, false);
    assert.match(r.motivo, /LISTA 85-93/);
    assert.strictEqual(posts().length, 0);
    pestanas = { LISTA, 'LISTA 85-93': L8593 };
  });

  await caso('Supabase caído: no tira', async () => {
    espejo._reiniciar();
    falla = true;
    const r = await silencio(() => espejo.copiar());
    falla = false;
    assert.strictEqual(r.guardo, false);
  });

  await caso('apagado (ESPEJO_COTIZADOR_ACTIVO=false): ni lee ni escribe', async () => {
    process.env.ESPEJO_COTIZADOR_ACTIVO = 'false';
    pedidos.length = 0;
    const r = await espejo.copiar();
    assert.strictEqual(r.guardo, false);
    assert.strictEqual(pedidos.length, 0);
    assert.strictEqual(espejo.arrancar(), false);
    process.env.ESPEJO_COTIZADOR_ACTIVO = 'true';
  });

  global.fetch = fetchReal;
  espejo._reiniciar();
  console.log(`\n${casos} casos.`);
})();
