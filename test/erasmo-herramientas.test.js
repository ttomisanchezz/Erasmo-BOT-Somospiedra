'use strict';
/**
 * Las herramientas de Erasmo (src/herramientas-erasmo.js): buscar_productos, cotizar, mandar_catalogo y
 * agendar_seguimiento, y cómo las mira la guardia. Sin red: el panel de Supabase se reemplaza por productos de
 * mentira (precios INVENTADOS salvo los de granza, que son los del 06/11 y viven en src/granza.js).
 */
const fs = require('fs');
const path = require('path');
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const assert = require('assert');
const { check, fin, state, cerebro } = p;
const herr = require('../src/herramientas-erasmo');
const { armarCatalogo } = require('../src/catalogo-piedra');

const por = (nombre) => herr.HERRAMIENTAS.find((h) => h.definicion.name === nombre);
const turno = (extra = {}) => ({ montos: [], acciones: {}, cotizo: null, chatId: null, enVivo: true, ahora: Date.now(), ...extra });

// El panel guarda centavos: 7800000 = $78.000 el m2. Pasa por armarCatalogo como en producción.
const filas = [
  { PRODUCTO: 'Adoquines ojito', EFECTIVO: '78000.00', LISTA: '90000.00', UNIDAD: 'm2' },
  { PRODUCTO: 'Laja San Luis', EFECTIVO: '50000.00', LISTA: '', UNIDAD: 'm2' },
  { PRODUCTO: 'Piedra bola', EFECTIVO: '', LISTA: '', UNIDAD: 'm2' },
  { PRODUCTO: 'Laja en caja', EFECTIVO: '30000.00', LISTA: '36000.00', UNIDAD: 'caja', 'COBERTURA M2': '0.5' },
  { PRODUCTO: 'Lomo de burro', EFECTIVO: '1000.00', LISTA: '1200.00', UNIDAD: 'unidad' },
];
herr.usarCatalogoDelPanel(async () => ({ ...armarCatalogo(filas), desactualizado: false }));

const totalesDe = (r) => r.totales.map((t) => t.total);

(async () => {
  console.log('buscar_productos');
  await check('devuelve nombres exactos y cómo se vende, sin ningún precio', async () => {
    const r = await por('buscar_productos').correr({ consulta: 'adoquines' });
    assert.strictEqual(r.productos[0].nombre, 'Adoquines ojito');
    assert.strictEqual(r.productos[0].se_vende_por, 'm²');
    assert.strictEqual(r.productos[0].tiene_precio, true);
    assert.ok(!/\$|\d{4,}/.test(JSON.stringify(r)), 'trae un monto: ' + JSON.stringify(r));
  });
  await check('"laja" sola trae todas las piedras (no la granza) y avisa que no es un producto para cotizar', async () => {
    const r = await por('buscar_productos').correr({ consulta: 'lajas' });
    const nombres = r.productos.map((p) => p.nombre);
    assert.deepStrictEqual(nombres.slice(0, 2), ['Laja en caja', 'Laja San Luis']);
    for (const n of ['Adoquines ojito', 'Lomo de burro', 'Piedra bola']) assert.ok(nombres.includes(n), 'falta ' + n);
    assert.ok(!nombres.some((n) => /granza/i.test(n)), 'la granza no es laja');
    assert.match(r.aviso, /cualquier piedra/);
    assert.strictEqual(r.hay_mas, false);
    assert.ok(!/\$|\d{4,}/.test(JSON.stringify(r)), 'trae un monto');
  });
  await check('un producto sin precio lo dice (tiene_precio false) y avisa que se escala', async () => {
    const r = await por('buscar_productos').correr({ consulta: 'piedra bola' });
    assert.strictEqual(r.productos[0].tiene_precio, false);
    assert.match(r.aviso, /escal/);
  });
  await check('la granza está siempre (tabla propia), por m² en bolsas de 40 kg y también por bolsón (1 bolsón = 20 bolsas, 17/11)', async () => {
    const r = await por('buscar_productos').correr({ consulta: 'granza' });
    assert.strictEqual(r.productos.length, 3);
    assert.ok(r.productos.every((x) => /bolsas de unos 40 kg/.test(x.se_vende_por) && /1 bolsón = 20 bolsas/.test(x.se_vende_por) && x.tiene_precio));
    assert.ok(r.productos.every((x) => x.hay_stock === undefined), 'sin #sinstock, no se marca nada');
    assert.ok(!/\$|\d{5,}/.test(JSON.stringify(r)), 'trae un monto');
  });
  await check('lo que no existe: lista vacía y el aviso de escalar', async () => {
    const r = await por('buscar_productos').correr({ consulta: 'pegamento' });
    assert.deepStrictEqual(r.productos, []);
    assert.match(r.aviso, /escal/);
  });
  await check('búsqueda vacía: lista lo que se trabaja; una caja dice cuánto cubre', async () => {
    const r = await por('buscar_productos').correr({ consulta: '' });
    assert.ok(r.productos.length >= 5);
    const caja = (await por('buscar_productos').correr({ consulta: 'laja en caja' })).productos.find((x) => x.nombre === 'Laja en caja');
    assert.strictEqual(caja.se_vende_por, 'caja');
    assert.strictEqual(caja.cada_unidad_cubre_m2, '0,5');
  });
  await check('sin panel (Supabase caído y nunca cargó): solo queda la granza', async () => {
    herr.usarCatalogoDelPanel(async () => ({ productos: [], problemas: [], origen: 'sin-datos' }));
    try {
      const r = await por('buscar_productos').correr({ consulta: 'adoquines' });
      assert.deepStrictEqual(r.productos, []);
      assert.strictEqual((await por('buscar_productos').correr({ consulta: 'granza' })).productos.length, 3);
    } finally {
      herr.usarCatalogoDelPanel(async () => ({ ...armarCatalogo(filas), desactualizado: false }));
    }
  });

  console.log('\ncotizar');
  await check('Adoquines ojito 10 m2, sin forma de pago: SOLO el total en efectivo o transferencia (17/11: la tarjeta, si la pide), sin ofrecer factura', async () => {
    const t = turno();
    const r = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10' }, t);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(totalesDe(r), ['$780.000']);
    assert.strictEqual(r.totales[0].forma_de_pago, 'efectivo o transferencia');
    assert.match(r.factura, /no la menciones/);
    assert.ok(!/sin factura/i.test(r.factura));
    assert.match(r.aviso, /no menciones la tarjeta/);
    assert.deepStrictEqual(t.montos.slice(0, 1), [780000]);
    assert.ok(!t.montos.includes(900000), 'el de tarjeta no se deja escribir si no se pidió');
    assert.strictEqual(r.precio_de_una_unidad.por_forma_de_pago.length, 1);
    assert.strictEqual(r.precio_de_una_unidad.por_forma_de_pago[0].precio, '$78.000');
  });
  await check('ningún texto de la salida de cotizar nombra Mercado Pago, QR ni el IVA que se ofrece (17/11)', async () => {
    for (const args of [{ m2: '10' }, { m2: '10', forma_pago: 'tarjeta' }, { m2: '10', forma_pago: 'transferencia' }]) {
      const r = await por('cotizar').correr({ producto: 'Adoquines ojito', ...args }, turno());
      assert.ok(!/mercado|\bqr\b|\+ ?IVA|si necesit/i.test(JSON.stringify(r)), JSON.stringify(r));
    }
    assert.ok(!/mercado|\bqr\b/i.test(JSON.stringify(por('cotizar').definicion)), 'la definición de la herramienta');
  });
  await check('Mercado Pago y QR ya no son formas de pago: error que manda a escalar', async () => {
    for (const forma of ['mercado_pago', 'qr']) {
      const e = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', forma_pago: forma }, turno());
      assert.ok(e.error && /escal/.test(e.error), forma);
    }
  });
  await check('con factura (solo si la pide el cliente): +21 %, redondeado para abajo a la centena, en efectivo y en tarjeta', async () => {
    const t = turno();
    const r = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', con_factura: true }, t);
    assert.deepStrictEqual(totalesDe(r), ['$943.800']);
    assert.match(r.factura, /CON factura/);
    assert.ok(t.montos.includes(943800));
    const tarjeta = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', con_factura: true, forma_pago: 'tarjeta' }, turno());
    assert.deepStrictEqual(totalesDe(tarjeta), ['$1.089.000']);
    // Las herramientas no son strict: un "true" escrito como texto también es factura (no se pierde el IVA).
    const comoTexto = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', con_factura: 'true' }, turno());
    assert.deepStrictEqual(totalesDe(comoTexto), ['$943.800']);
    const sin = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', con_factura: 'false' }, turno());
    assert.deepStrictEqual(totalesDe(sin), ['$780.000']);
  });
  await check('con forma de pago: solo esa columna (tarjeta = un solo pago)', async () => {
    const r = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', forma_pago: 'tarjeta' }, turno());
    assert.deepStrictEqual(totalesDe(r), ['$900.000']);
    assert.match(r.totales[0].forma_de_pago, /un solo pago/);
    assert.ok(!/no menciones la tarjeta/.test(r.aviso));
    const t = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', forma_pago: 'transferencia' }, turno());
    assert.deepStrictEqual(totalesDe(t), ['$780.000']);
    assert.strictEqual(t.totales[0].forma_de_pago, 'efectivo o transferencia');
  });
  await check('largo y ancho: los multiplica el código (3,5 x 3,5 = 12,25 m2)', async () => {
    assert.strictEqual(herr.m2DeLargoYAncho('3,5', '3,5'), '12.2500');
    const r = await por('cotizar').correr({ producto: 'Adoquines ojito', largo: '3,5', ancho: '3,5', forma_pago: 'efectivo' }, turno());
    assert.strictEqual(r.cantidad, '12,25 m²');
    assert.deepStrictEqual(totalesDe(r), ['$955.500']); // 12,25 x 78.000 = 955.500
  });
  await check('el nombre tiene que ser el exacto: "adoquines" a secas no cotiza (no hay parecidos)', async () => {
    const r = await por('cotizar').correr({ producto: 'adoquines', m2: '10' }, turno());
    assert.ok(r.error);
    assert.deepStrictEqual(r.parecidos, ['Adoquines ojito']);
  });
  await check('sin tildes ni mayúsculas el exacto sigue siendo el exacto', async () => {
    const r = await por('cotizar').correr({ producto: 'ADOQUINES  Ojito', m2: '1' }, turno());
    assert.strictEqual(r.ok, true);
  });
  await check('FALTA DATO: sin precio en la tarjeta, pedirla no da ningún monto (y no anota montos); el efectivo sí sale', async () => {
    const t = turno();
    const r = await por('cotizar').correr({ producto: 'Laja San Luis', m2: '4', forma_pago: 'tarjeta' }, t);
    assert.match(r.error, /FALTA DATO/);
    assert.deepStrictEqual(t.montos, []);
    const sola = await por('cotizar').correr({ producto: 'Laja San Luis', m2: '4' }, turno());
    assert.deepStrictEqual(totalesDe(sola), ['$200.000']);
    const sinNada = await por('cotizar').correr({ producto: 'Piedra bola', m2: '4' }, turno());
    assert.match(sinNada.error, /FALTA DATO/);
  });
  await check('más de 100 m2: obra grande, escala (por m2, por largo x ancho y por lo que cubren las cajas)', async () => {
    assert.match((await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '101' }, turno())).error, /100 m²/);
    assert.match((await por('cotizar').correr({ producto: 'Adoquines ojito', largo: '20', ancho: '6' }, turno())).error, /100 m²/);
    assert.match((await por('cotizar').correr({ producto: 'Laja en caja', cantidad: 300 }, turno())).error, /100 m²/);
    assert.strictEqual((await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '100' }, turno())).ok, true);
  });
  await check('cuotas, cheque y dólares no se cotizan: escala', async () => {
    for (const forma of ['cheque', 'cuotas', 'dolares']) {
      const r = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '4', forma_pago: forma }, turno());
      assert.match(r.error, /persona/, forma);
    }
  });
  await check('una sola cantidad, y la cantidad es obligatoria', async () => {
    assert.match((await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '4', cantidad: 4 }, turno())).error, /una sola cantidad/);
    assert.match((await por('cotizar').correr({ producto: 'Adoquines ojito' }, turno())).error, /Falta la cantidad/);
    assert.ok((await por('cotizar').correr({ producto: 'Adoquines ojito', m2: 'mucho' }, turno())).error);
    assert.ok((await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '0' }, turno())).error);
  });
  await check('desperdicio: 0 salvo que el cliente lo pida (y entre 0 y 20)', async () => {
    const sin = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' }, turno());
    const con = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo', desperdicio_pct: 10 }, turno());
    assert.deepStrictEqual([totalesDe(sin)[0], totalesDe(con)[0]], ['$780.000', '$858.000']);
    assert.ok((await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', desperdicio_pct: 50 }, turno())).error);
  });
  await check('granza por m2: 5, 12 y 25 m2, en efectivo y con tarjeta, con y sin factura (tabla final del 17/11)', async () => {
    const g = async (m2, forma_pago, con_factura) => totalesDe(await por('cotizar').correr({ producto: 'Granza roja', m2: String(m2), forma_pago, con_factura }, turno()));
    assert.deepStrictEqual([await g(5), await g(12), await g(25)], [['$110.000'], ['$240.000'], ['$387.500']]);
    assert.deepStrictEqual([await g(5, 'tarjeta'), await g(12, 'tarjeta'), await g(25, 'tarjeta')], [['$132.500'], ['$300.000'], ['$475.000']]);
    assert.deepStrictEqual([await g(5, undefined, true), await g(12, undefined, true), await g(25, undefined, true)], [['$133.100'], ['$290.400'], ['$468.800']]);
    assert.deepStrictEqual([await g(5, 'tarjeta', true), await g(12, 'tarjeta', true), await g(25, 'tarjeta', true)], [['$160.300'], ['$363.000'], ['$574.700']]);
    const r = await por('cotizar').correr({ producto: 'Granza roja', m2: '12,25' }, turno());
    assert.match(r.cantidad, /^13 bolsas/);
    assert.strictEqual(r.precio_de_una_unidad.por_forma_de_pago[0].precio, '$20.000'); // el tramo de 10 a 14 bolsas
  });
  await check('granza de 15 a 19 bolsas (17/11): 16 bolsas = $256.000 en efectivo y $304.000 con tarjeta ($19.000 la bolsa)', async () => {
    const t = turno();
    const r = await por('cotizar').correr({ producto: 'Granza roja', m2: '16' }, t);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.deepStrictEqual(totalesDe(r), ['$256.000']);
    assert.ok(!r.aviso_tarjeta);
    const tarjeta = await por('cotizar').correr({ producto: 'Granza roja', m2: '16', forma_pago: 'tarjeta' }, turno());
    assert.deepStrictEqual(totalesDe(tarjeta), ['$304.000']);
  });
  await check('bolsón de granza (17/11): 1 bolsón = 20 bolsas = $310.000 en efectivo y $380.000 con tarjeta; la cuenta la hace el código', async () => {
    const t = turno();
    const r = await por('cotizar').correr({ producto: 'Granza roja', bolsones: 1 }, t);
    assert.strictEqual(r.ok, true, JSON.stringify(r));
    assert.strictEqual(r.cantidad, '1 bolsón (20 bolsas de 40 kg)');
    assert.deepStrictEqual(totalesDe(r), ['$310.000']);
    assert.ok(t.montos.includes(310000));
    assert.deepStrictEqual([t.cotizo.cantidad, t.cotizo.unidad], ['1', 'bolsón']);
    const tarjeta = await por('cotizar').correr({ producto: 'Granza gris Tandil', bolsones: 1, forma_pago: 'tarjeta' }, turno());
    assert.deepStrictEqual(totalesDe(tarjeta), ['$380.000']);
    const dos = await por('cotizar').correr({ producto: 'Granza roja', bolsones: '2' }, turno());
    assert.strictEqual(dos.cantidad, '2 bolsones (40 bolsas de 40 kg)');
    assert.deepStrictEqual(totalesDe(dos), ['$620.000']);
    // 5 bolsones = 100 bolsas = 100 m2: todavía; 6 pasan el tope de obra grande y lo ve una persona.
    assert.strictEqual((await por('cotizar').correr({ producto: 'Granza roja', bolsones: 5 }, turno())).ok, true);
    assert.match((await por('cotizar').correr({ producto: 'Granza roja', bolsones: 6 }, turno())).error, /100 m²/);
  });
  await check('bolsón: no se mezcla con otra cantidad, no vale para otros productos y tiene que ser entero', async () => {
    assert.match((await por('cotizar').correr({ producto: 'Granza roja', bolsones: 1, m2: '5' }, turno())).error, /una sola cantidad/);
    assert.match((await por('cotizar').correr({ producto: 'Granza roja', bolsones: 1, cantidad: 3 }, turno())).error, /una sola cantidad/);
    assert.match((await por('cotizar').correr({ producto: 'Adoquines ojito', bolsones: 1 }, turno())).error, /solo de la granza/);
    for (const malo of [0, 1.5, 'medio']) assert.match((await por('cotizar').correr({ producto: 'Granza roja', bolsones: malo }, turno())).error, /entero/, String(malo));
  });
  await check('cuotas (17/11): una compra de más de $1.000.000 lo avisa (compra_grande) y la ficha guarda el total; hasta $1.000.000 no', async () => {
    const grande = turno();
    const r = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '14' }, grande); // 14 x 78.000 = 1.092.000
    assert.deepStrictEqual(totalesDe(r), ['$1.092.000']);
    assert.match(r.compra_grande, /pide pagar en partes/);
    assert.strictEqual(grande.cotizo.totalCentavos, 109200000);
    const chica = await por('cotizar').correr({ producto: 'Granza roja', bolsones: 3 }, turno()); // 930.000
    assert.ok(!chica.compra_grande);
    const mil = await por('cotizar').correr({ producto: 'Lomo de burro', cantidad: 1000 }, turno()); // 1.000 x 1.000 = 1.000.000 exactos
    assert.deepStrictEqual(totalesDe(mil), ['$1.000.000']);
    assert.ok(!mil.compra_grande, 'exactamente $1.000.000 no pasa');
  });
  await check('un color de granza sin stock (#sinstock, 17/11): no se cotiza, buscar_productos lo marca (no lo saca) y los otros siguen; con #hay vuelve', async () => {
    const stock = require('../src/stock-colores');
    try {
      stock.desdeGrupo({ tipo: 'sinstock', resto: 'roja' });
      const t = turno();
      const e = await por('cotizar').correr({ producto: 'Granza roja', m2: '10' }, t);
      assert.match(e.error, /no hay de ese color/);
      assert.deepStrictEqual(t.montos, []);
      assert.strictEqual((await por('cotizar').correr({ producto: 'Granza roja', bolsones: 1 }, turno())).ok === true, false);
      assert.strictEqual((await por('cotizar').correr({ producto: 'Granza gris Tandil', m2: '10' }, turno())).ok, true);
      const b = await por('buscar_productos').correr({ consulta: 'granza' });
      assert.strictEqual(b.productos.length, 3);
      assert.deepStrictEqual(b.productos.map((x) => [x.nombre, x.hay_stock]).filter(([, h]) => h === false), [['Granza roja', false]]);
      assert.match(b.aviso, /NO hay/);
      stock.desdeGrupo({ tipo: 'hay', resto: 'roja' });
      assert.strictEqual((await por('cotizar').correr({ producto: 'Granza roja', m2: '10' }, turno())).ok, true);
    } finally {
      stock.desdeGrupo({ tipo: 'hay', resto: 'gris, roja, blanca' });
    }
  });
  await check('una caja: los m2 se convierten en cajas enteras (3 m2 = 6 cajas de 0,5 m2) y dice cuánto cubre', async () => {
    const r = await por('cotizar').correr({ producto: 'Laja en caja', m2: '3', forma_pago: 'efectivo' }, turno());
    assert.strictEqual(r.cantidad, '6 cajas');
    assert.strictEqual(r.m2_que_cubre, '3 m²');
    assert.deepStrictEqual(totalesDe(r), ['$180.000']);
  });
  await check('un producto de menos de $100 el total no es un monto: FALTA DATO', async () => {
    herr.usarCatalogoDelPanel(async () => armarCatalogo([{ PRODUCTO: 'Clavito', EFECTIVO: '90.00', LISTA: '95.00', UNIDAD: 'unidad' }]));
    try {
      assert.match((await por('cotizar').correr({ producto: 'Clavito', cantidad: 1 }, turno())).error, /FALTA DATO/);
    } finally {
      herr.usarCatalogoDelPanel(async () => ({ ...armarCatalogo(filas), desactualizado: false }));
    }
  });
  await check('lo que devuelve cotizar pasa por la guardia; un monto inventado, no', async () => {
    const t = turno();
    const r = await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', con_factura: true }, t);
    const buenos = [`Para 10 m² te sale ${r.totales[0].total} en efectivo con factura.`];
    assert.strictEqual(cerebro.revisarSalida(buenos, t.montos).guardia, null);
    assert.match(cerebro.revisarSalida(['Te sale $944.000 en efectivo.'], t.montos).guardia, /monto que no salió de ninguna herramienta/);
    assert.match(cerebro.revisarSalida(['Te sale $780.000 en efectivo.'], t.montos).guardia, /monto/); // el sin factura no se pidió
    assert.match(cerebro.revisarSalida(['Te sale $943.800.'], []).guardia, /no salió de ninguna herramienta de esta respuesta/);
  });
  await check('el precio del m2 que devuelve también deja escribirlo', async () => {
    const t = turno();
    await por('cotizar').correr({ producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' }, t);
    assert.strictEqual(cerebro.revisarSalida(['El m² está $78.000.'], t.montos).guardia, null);
  });

  console.log('\nmandar_catalogo');
  const CAT = path.join(process.env.DOCS_DIR, 'Catalogo-Somos-Piedra-2026_4.pdf');
  await check('sin el PDF en documentos/: error, no acciona', async () => {
    const t = turno();
    const r = await por('mandar_catalogo').correr({}, t);
    assert.ok(r.error);
    assert.strictEqual(t.acciones.catalogo, undefined);
  });
  fs.mkdirSync(process.env.DOCS_DIR, { recursive: true });
  fs.writeFileSync(CAT, '%PDF-1.4 de mentira');
  await check('con el PDF: solo anota la acción en el turno (no manda nada, no toca el estado)', async () => {
    const t = turno({ chatId: '5490000009001@s.whatsapp.net' });
    const r = await por('mandar_catalogo').correr({}, t);
    assert.strictEqual(r.ok, true);
    assert.strictEqual(t.acciones.catalogo, true);
    assert.strictEqual(state.todos()['5490000009001@s.whatsapp.net'], undefined);
  });
  await check('una vez cada 24 h por chat, salvo que lo pida de nuevo', async () => {
    const chat = '5490000009002@s.whatsapp.net';
    const ahora = Date.now();
    state.actualizar(chat, { catalogoEnviado: ahora - 3 * 3600 * 1000 });
    const t1 = turno({ chatId: chat, ahora });
    const r1 = await por('mandar_catalogo').correr({}, t1);
    assert.strictEqual(r1.ok, false);
    assert.strictEqual(r1.ya_enviado, true);
    assert.strictEqual(t1.acciones.catalogo, undefined);
    const t2 = turno({ chatId: chat, ahora });
    assert.strictEqual((await por('mandar_catalogo').correr({ pidio_de_nuevo: true }, t2)).ok, true);
    assert.strictEqual(t2.acciones.catalogo, true);
    const t3 = turno({ chatId: chat, ahora: ahora + 25 * 3600 * 1000 });
    assert.strictEqual((await por('mandar_catalogo').correr({}, t3)).ok, true);
  });
  await check('la guardia: "te mando el catálogo" pasa solo si mandar_catalogo salió bien; las fotos, nunca', async () => {
    const dice = ['Te mando el catálogo para que lo veas.'];
    assert.match(cerebro.revisarSalida(dice, []).guardia, /archivo/);
    assert.strictEqual(cerebro.revisarSalida(dice, [], { catalogo: true }).guardia, null);
    assert.match(cerebro.revisarSalida(['Te mando fotos de la laja.'], [], { catalogo: true }).guardia, /archivo/);
    assert.match(cerebro.revisarSalida(['Te paso el link del catálogo y un video.'], [], { catalogo: true }).guardia, /archivo/);
    assert.strictEqual(cerebro.prometeArchivo('Te mando el catálogo en pdf', ['catalogo', 'pdf']), null);
  });
  await check('los nombres de las herramientas nuevas no salen en un mensaje', async () => {
    for (const n of ['mandar_catalogo', 'agendar_seguimiento', 'buscar_productos']) assert.ok(cerebro.nombraAlgoInterno(`usé ${n}`), n);
  });

  console.log('\nagendar_seguimiento');
  const hoy = herr.hoyArgentina(Date.now());
  const enDias = (n) => new Date(Date.parse(`${hoy}T12:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
  await check('una fecha futura con motivo: anota la acción (no escribe nada en el estado)', async () => {
    const t = turno({ chatId: '5490000009003@s.whatsapp.net' });
    const r = await por('agendar_seguimiento').correr({ fecha: enDias(15), motivo: '  arranca la obra   en 15 días ' }, t);
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(t.acciones.seguimiento, { fecha: enDias(15), motivo: 'arranca la obra en 15 días' });
    assert.strictEqual(state.todos()['5490000009003@s.whatsapp.net'], undefined);
    assert.match(r.aviso, /no le prometas/i);
  });
  await check('fecha de hoy o del pasado, inexistente, mal escrita o muy lejana: error', async () => {
    for (const fecha of [hoy, enDias(-3), '2026-02-30', '15/12/2026', 'mañana', enDias(181), '']) {
      const t = turno();
      assert.ok((await por('agendar_seguimiento').correr({ fecha, motivo: 'x' }, t)).error, fecha);
      assert.strictEqual(t.acciones.seguimiento, undefined);
    }
    assert.ok((await por('agendar_seguimiento').correr({ fecha: enDias(5), motivo: ' ' }, turno())).error);
    assert.strictEqual((await por('agendar_seguimiento').correr({ fecha: enDias(180), motivo: 'x' }, turno())).ok, true);
  });

  console.log('\nlas definiciones');
  await check('van a la API con nombre, descripción y schema; ninguna promete nada en la descripción al cliente', async () => {
    assert.deepStrictEqual(herr.HERRAMIENTAS.map((h) => h.definicion.name), ['buscar_productos', 'cotizar', 'cotizar_envio', 'mandar_catalogo', 'agendar_seguimiento']);
    for (const h of herr.HERRAMIENTAS) {
      assert.ok(h.definicion.description.length > 40);
      assert.strictEqual(h.definicion.input_schema.type, 'object');
    }
    assert.deepStrictEqual(cerebro.HERRAMIENTAS_DE_DATOS, herr.HERRAMIENTAS);
  });

  fin();
})();
