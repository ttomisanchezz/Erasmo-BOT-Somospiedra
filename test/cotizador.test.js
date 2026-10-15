'use strict';
/** Chequeo del cotizador contra los ejemplos de la propia planilla. */
const assert = require('assert');
const cotizador = require('../src/cotizador');
const { cotizar, plantilla, mejorQueEntraEnLaEntrega, detalleDe } = cotizador;
// 01/10/2026: lo que va donde iría la batería ("85-93%", "sellado"). Si no existe, el test lo dice.
const bateriaDe = (fila) => (cotizador.bateriaDe ? cotizador.bateriaDe(fila) : 'no hay cotizador.bateriaDe');

const config = { coef1: 1.26, coef2: 1.35, redondeo: 1000 };

const ip15 = {
  modelo: 'iPhone 15',
  capacidad_gb: 128,
  bateria_min: 85,
  precio_contado: 740000,
  anticipo_min: 420000,
  pago_unico_manual: 405000,
  cuota_2_manual: 216000,
  cotizable: true,
};

const ip13 = {
  modelo: 'iPhone 13',
  capacidad_gb: 128,
  bateria_min: 100,
  precio_contado: 495000,
  anticipo_min: 320000,
  pago_unico_manual: 221000,
  cuota_2_manual: 140000,
  cotizable: true,
};

let fallos = 0;
function check(nombre, fn) {
  try {
    fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  }
}

console.log('\nCotizador:');

// Ejemplo textual de la planilla: entrega 500.000 sobre el 15. Desde Ajustes 2
// (decisión de Tomás del 17/09/2026) cada pago calculado con coeficientes lleva
// +$10.000 después del redondeo.
check('iPhone 15 con entrega de 500.000', () => {
  const c = cotizar(ip15, 500000, config);
  assert.strictEqual(c.saldo, 240000);
  assert.strictEqual(c.pagoUnico, 313000); // 240000 * 1.26 = 302400 -> 303000 + 10.000
  assert.strictEqual(c.cuotaDe2, 172000); // 240000 * 1.35 / 2 = 162000 + 10.000
  assert.strictEqual(c.usoManual, false);
});

// Entrega exactamente el mínimo: manda el precio manual
check('iPhone 15 con la entrega mínima usa el precio manual', () => {
  const c = cotizar(ip15, 420000, config);
  assert.strictEqual(c.usoManual, true);
  assert.strictEqual(c.pagoUnico, 405000);
  assert.strictEqual(c.cuotaDe2, 216000);
  assert.strictEqual(c.totalCon2, 852000); // coincide con la planilla
});

// El que entrega más se ahorra plata: es el argumento de venta
check('entregar más de lo mínimo genera ahorro', () => {
  const c = cotizar(ip15, 600000, config);
  assert.ok(c.ahorro > 0, 'debería haber ahorro');
  assert.strictEqual(c.saldo, 140000);
  assert.strictEqual(c.cuotaDe2, 105000); // 140000*1.35/2 = 94500 -> 95000 + 10.000
  // Contra el mínimo manual del 15 (216.000 por cuota, sin extra): 852.000 − 810.000.
  assert.strictEqual(c.ahorro, 42000);
});

// Entrega por debajo del mínimo: no cotiza
check('entrega por debajo del mínimo no cotiza', () => {
  const c = cotizar(ip13, 250000, config);
  assert.strictEqual(c.ok, false);
  assert.strictEqual(c.motivo, 'ENTREGA_BAJA');
  assert.strictEqual(c.minimo, 320000);
});

// Redondeo siempre para arriba
check('el redondeo es siempre hacia arriba', () => {
  const fila = { ...ip13, pago_unico_manual: 0, cuota_2_manual: 0 };
  const c = cotizar(fila, 400000, config);
  assert.strictEqual(c.saldo, 95000);
  assert.strictEqual(c.pagoUnico, 130000); // 95000*1.26 = 119700 -> 120000 + 10.000
  assert.strictEqual(c.cuotaDe2, 75000); // 95000*1.35/2 = 64125 -> 65000 + 10.000
});

// Ajustes 2 (decisión de Tomás del 17/09/2026): +$10.000 a cada pago financiado que
// sale de los coeficientes, después del redondeo. Son $10.000 por cada cuota, no
// repartidos. Los precios manuales se usan tal cual; el contado y el descuento no
// cambian. Tabla de control sobre el 13 (contado $495.000, mínimo $320.000).
check('Ajustes 2: la constante EXTRA_POR_PAGO es $10.000', () => {
  assert.strictEqual(cotizador.EXTRA_POR_PAGO, 10000);
});

check('Ajustes 2: entrega = mínimo sin precios manuales → 231.000 / 129.000', () => {
  const fila = { ...ip13, pago_unico_manual: 0, cuota_2_manual: 0 };
  const c = cotizar(fila, 320000, config);
  assert.strictEqual(c.bajoMinimo, false);
  assert.strictEqual(c.pagoUnico, 231000); // 175.000 × 1,26 = 220.500 → 221.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 129000); // 175.000 × 1,35 / 2 = 118.125 → 119.000 + 10.000
});

check('Ajustes 2: entrega 300.000 (recargo) → 285.000 / 157.000', () => {
  const c = cotizar(ip13, 300000, config);
  assert.strictEqual(c.bajoMinimo, true);
  assert.strictEqual(c.pagoUnico, 285000); // 195.000 × 1,41 = 274.950 → 275.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 157000); // 195.000 × 1,50 / 2 = 146.250 → 147.000 + 10.000
});

check('Ajustes 2: entrega 290.000 (recargo) → 300.000 / 164.000', () => {
  const c = cotizar(ip13, 290000, config);
  assert.strictEqual(c.pagoUnico, 300000); // 205.000 × 1,41 = 289.050 → 290.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 164000); // 205.000 × 1,50 / 2 = 153.750 → 154.000 + 10.000
});

check('Ajustes 2: entrega 280.000 (recargo) → 314.000 / 172.000', () => {
  const c = cotizar(ip13, 280000, config);
  assert.strictEqual(c.pagoUnico, 314000); // 215.000 × 1,41 = 303.150 → 304.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 172000); // 215.000 × 1,50 / 2 = 161.250 → 162.000 + 10.000
});

check('Ajustes 2: con precios manuales y la entrega en el mínimo, los manuales tal cual, sin +10.000', () => {
  const c = cotizar(ip13, 320000, config);
  assert.strictEqual(c.usoManual, true);
  assert.strictEqual(c.pagoUnico, 221000);
  assert.strictEqual(c.cuotaDe2, 140000);
  assert.strictEqual(c.totalCon2, 600000);
});

check('Ajustes 2: soloContado no cambia', () => {
  const contado = cotizar(ip13, 500000, config);
  assert.strictEqual(contado.soloContado, true);
  assert.strictEqual(contado.contado, 495000);
  assert.strictEqual(contado.pagoUnico, undefined);
});

// Sin descuento (decisión de Tomás del 30/09/2026): ya no va el contado − $10.000 del
// segundo pedido. Una marca vieja del chat (`descuentoDe`) no cambia nada.
check('30/09: sin descuento, ni con una marca vieja del chat', () => {
  assert.strictEqual(cotizador.DESCUENTO_CONTADO, undefined, 'sigue la constante del descuento');
  const marcaVieja = { modelo: 'iPhone 13', precio: 485000 };
  assert.strictEqual(cotizador.descuentoPara(ip13, marcaVieja), null);
  const cot = cotizar(ip13, 490000, config);
  const conMarca = cotizador.conDescuento(cot, ip13, 490000, marcaVieja);
  assert.deepStrictEqual(conMarca, cot);
  assert.strictEqual(conMarca.soloContado, false, 'con $490.000 no paga el 13 de contado: es $495.000');
});

// Financiación nueva (decisión de Tomás del 30/09/2026, negocio/financiacion.md del Cortex):
// plan Estándar, 1,52 en 1 pago y 1,60 en 2 cuotas sobre el saldo, redondeo para arriba al mil,
// +$10.000 por pago y la tolerancia de $45.000 con +15 puntos (1,67 / 1,75). Los coeficientes
// salen de CONFIG: acá van los que tiene que tener la planilla.
const config30 = { coef1: 1.52, coef2: 1.6, redondeo: 1000 };

check('30/09: el ejemplo del Cortex: contado 790.000, entrega 600.000 → 299.000 / 2 de 162.000', () => {
  const fila = { modelo: 'iPhone X', precio_contado: 790000, anticipo_min: 470000, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true };
  const c = cotizar(fila, 600000, config30);
  assert.strictEqual(c.saldo, 190000);
  assert.strictEqual(c.pagoUnico, 299000); // 190.000 × 1,52 = 288.800 → 289.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 162000); // 190.000 × 1,60 / 2 = 152.000 + 10.000
});

check('30/09: el 14 Pro en el mínimo, sin manuales → 497.000 / 2 de 266.000', () => {
  const fila = { modelo: 'iPhone 14 Pro', precio_contado: 800000, anticipo_min: 480000, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true };
  const c = cotizar(fila, 480000, config30);
  assert.strictEqual(c.pagoUnico, 497000); // 320.000 × 1,52 = 486.400 → 487.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 266000); // 320.000 × 1,60 / 2 = 256.000 + 10.000
});

check('30/09: tolerancia de $45.000 con 1,67 / 1,75 → 612.000 / 2 de 325.000', () => {
  const fila = { modelo: 'iPhone 14 Pro', precio_contado: 800000, anticipo_min: 480000, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true };
  const c = cotizar(fila, 440000, config30);
  assert.strictEqual(c.bajoMinimo, true);
  assert.strictEqual(c.pagoUnico, 612000); // 360.000 × 1,67 = 601.200 → 602.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 325000); // 360.000 × 1,75 / 2 = 315.000 + 10.000
  assert.strictEqual(cotizar(fila, 434000, config30).ok, false, 'con $46.000 de menos no se cotiza');
});

// 02/10/2026 (decisión de Tomás): el Estándar pasa a 1,54 en 1 pago y 1,70 en 2 cuotas, y la
// excepción bajo el mínimo se queda en 1,67 / 1,75. Es lo que trae sheets.js con la planilla real.
const config02 = { coef1: 1.54, coef2: 1.7, coef1Bajo: 1.67, coef2Bajo: 1.75, redondeo: 1000 };

check('02/10: el ejemplo del Cortex con el Estándar nuevo: 790.000, entrega 600.000 → 303.000 / 2 de 172.000', () => {
  const fila = { modelo: 'iPhone X', precio_contado: 790000, anticipo_min: 470000, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true };
  const c = cotizar(fila, 600000, config02);
  assert.strictEqual(c.saldo, 190000);
  assert.strictEqual(c.pagoUnico, 303000); // 190.000 × 1,54 = 292.600 → 293.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 172000); // 190.000 × 1,70 / 2 = 161.500 → 162.000 + 10.000
  assert.strictEqual(c.bajoMinimo, false);
});

check('02/10: la excepción sigue en 1,67 / 1,75 aunque el Estándar sea 1,54 / 1,70 → 612.000 / 2 de 325.000', () => {
  const fila = { modelo: 'iPhone 14 Pro', precio_contado: 800000, anticipo_min: 480000, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true };
  const c = cotizar(fila, 440000, config02);
  assert.strictEqual(c.bajoMinimo, true);
  assert.strictEqual(c.pagoUnico, 612000); // 360.000 × 1,67 = 601.200 → 602.000 + 10.000 (no 1,69)
  assert.strictEqual(c.cuotaDe2, 325000); // 360.000 × 1,75 / 2 = 315.000 + 10.000 (no 1,85)
  assert.deepStrictEqual(cotizador.COEF_BAJO_MINIMO, { coef1: 1.67, coef2: 1.75 });
});

check('Ajustes 2: el ahorro compara contra el mínimo con los mismos +10.000', () => {
  const fila = { ...ip13, pago_unico_manual: 0, cuota_2_manual: 0 };
  const c = cotizar(fila, 400000, config);
  // En el mínimo: 119.000 + 10.000 = 129.000 por cuota → 320.000 + 258.000 = 578.000.
  // Ahora: 400.000 + 2 × 75.000 = 550.000. Sin el extra en la cuenta del mínimo daría 8.000.
  assert.strictEqual(c.totalCon2, 550000);
  assert.strictEqual(c.ahorro, 28000);
});

// Bloque 5 (decisión de Tomás del 16/09/2026): si le faltan hasta el tope para el
// mínimo, se cotiza igual, con los coeficientes de CONFIG + 0,15 y sin precios
// manuales. Bloque 5b: el tope baja de $60.000 a $45.000. Los números de abajo
// están hechos a mano sobre el iPhone 13 (contado $495.000, mínimo $320.000), con
// 1,26 + 0,15 = 1,41 y 1,35 + 0,15 = 1,50.
check('las constantes del recargo tienen nombre: tope $45.000 (bloque 5b) y +0,15', () => {
  assert.strictEqual(cotizador.TOPE_BAJO_MINIMO, 45000);
  assert.strictEqual(cotizador.RECARGO_BAJO_MINIMO, 0.15);
});

check('entrega = mínimo − 30.000: cotiza con recargo, sin precios manuales y redondeando para arriba', () => {
  const c = cotizar(ip13, 290000, config);
  assert.strictEqual(c.ok, true, 'no cotizó: ' + JSON.stringify(c));
  assert.strictEqual(c.bajoMinimo, true, 'no marcó bajoMinimo');
  assert.strictEqual(c.usoManual, false, 'usó los precios manuales');
  assert.strictEqual(c.saldo, 205000); // 495.000 − 290.000
  assert.strictEqual(c.pagoUnico, 300000); // 205.000 × 1,41 = 289.050 → 290.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 164000); // 205.000 × 1,50 / 2 = 153.750 → 154.000 + 10.000
  assert.notStrictEqual(c.pagoUnico, ip13.pago_unico_manual);
  assert.notStrictEqual(c.cuotaDe2, ip13.cuota_2_manual);
});

check('entrega = mínimo − 45.000: el borde entra, con recargo (bloque 5b)', () => {
  const c = cotizar(ip13, 275000, config);
  assert.strictEqual(c.ok, true, 'no cotizó el borde: ' + JSON.stringify(c));
  assert.strictEqual(c.bajoMinimo, true);
  assert.strictEqual(c.saldo, 220000);
  assert.strictEqual(c.pagoUnico, 321000); // 220.000 × 1,41 = 310.200 → 311.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 175000); // 220.000 × 1,50 / 2 = 165.000 + 10.000
});

check('entrega = mínimo − 45.001: ENTREGA_BAJA (bloque 5b)', () => {
  const c = cotizar(ip13, 274999, config);
  assert.strictEqual(c.ok, false);
  assert.strictEqual(c.motivo, 'ENTREGA_BAJA');
  assert.strictEqual(c.minimo, 320000);
});

check('entrega = mínimo − 60.000: con el tope de $45.000 ya no entra', () => {
  const c = cotizar(ip13, 260000, config);
  assert.strictEqual(c.ok, false);
  assert.strictEqual(c.motivo, 'ENTREGA_BAJA');
});

check('el recargo se suma a lo que dice CONFIG: con otros coeficientes cambian las cuotas', () => {
  const c = cotizar(ip13, 290000, { coef1: 1.3, coef2: 1.4, redondeo: 1000 });
  assert.strictEqual(c.pagoUnico, 308000); // 205.000 × (1,30 + 0,15) = 297.250 → 298.000 + 10.000
  assert.strictEqual(c.cuotaDe2, 169000); // 205.000 × (1,40 + 0,15) / 2 = 158.875 → 159.000 + 10.000
});


check('con la entrega en el mínimo o arriba no hay recargo', () => {
  const justo = cotizar(ip15, 420000, config);
  assert.strictEqual(justo.bajoMinimo, false);
  assert.strictEqual(justo.usoManual, true);
  const arriba = cotizar(ip15, 500000, config);
  assert.strictEqual(arriba.bajoMinimo, false);
  assert.strictEqual(arriba.pagoUnico, 313000);
});

check('la plantilla arma el mensaje esperado', () => {
  const c = cotizar(ip15, 500000, config);
  const txt = plantilla(ip15, c);
  assert.ok(txt.includes('📱 *iPhone 15 128GB — batería 85%*'));
  // Desde Ajustes 1 la cotización no muestra el contado (lo dice responder.js si lo pregunta).
  assert.ok(!/contado/i.test(txt) && !txt.includes('$740.000'), 'muestra el contado: ' + txt);
  assert.ok(txt.includes('Con una entrega de *$500.000*:'));
  assert.ok(txt.includes('1 pago de $313.000'));
  assert.ok(txt.includes('2 pagos de $172.000 cada uno'));
});

check('busca la alternativa más cara que entre en el presupuesto', () => {
  const alt = mejorQueEntraEnLaEntrega([ip15, ip13], 330000, 'iPhone 15');
  assert.ok(alt, 'debería encontrar una alternativa');
  assert.strictEqual(alt.modelo, 'iPhone 13');
});

check('si nada entra en el presupuesto devuelve null', () => {
  const alt = mejorQueEntraEnLaEntrega([ip15, ip13], 100000, 'iPhone 15');
  assert.strictEqual(alt, null);
});

// La planilla sin los coeficientes en CONFIG: el bot usa los del 30/09, no los viejos.
(async () => {
  const sheets = require('../src/sheets');
  const valores = (filas) => ({ values: filas });
  sheets.usarCliente({
    spreadsheets: {
      values: {
        batchGet: async () => ({
          data: {
            valueRanges: [
              valores([['Parametro', 'Valor'], ['Estado_lista', 'VIGENTE'], ['Redondeo', 1000]]),
              valores([['Modelo', 'Precio_contado', 'Anticipo_min'], ['iPhone 13', 495000, 320000]]),
              valores([
                ['ID', 'Modelo', 'Precio_contado', 'Anticipo_min', 'Saldo_a_financiar', 'Pago_unico', 'Cuota_de_2', 'Foto_lista', 'Disponible'],
                ['U-001', 'iPhone 12', 380000, 250000, 130000, 198000, 104000, 'SI', 'SI'],
              ]),
            ],
          },
        }),
      },
    },
  });
  sheets.invalidarCache();
  let datos = null;
  try {
    datos = await sheets.leerTodo();
  } catch (e) {
    datos = { error: e.message };
  }
  check('02/10: sin Coef_1_cuota ni Coef_2_cuotas en CONFIG, 1,54 y 1,70; la excepción, 1,67 y 1,75', () => {
    assert.ok(datos && datos.config, 'no leyó la planilla: ' + JSON.stringify(datos));
    assert.strictEqual(datos.config.coef1, 1.54);
    assert.strictEqual(datos.config.coef2, 1.7);
    assert.strictEqual(datos.config.coef1Bajo, 1.67);
    assert.strictEqual(datos.config.coef2Bajo, 1.75);
  });
  // En USADOS, Pago_unico y Cuota_de_2 son fórmulas de la planilla (saldo × coeficiente, sin
  // los $10.000): no son precios cargados a mano. Hasta el 30/09 el bot los tomaba como
  // manuales y en la entrega mínima cotizaba sin los $10.000 por pago.
  check('30/09: USADOS no tiene precios manuales: en la entrega mínima, calculado y con los $10.000', () => {
    const u = datos && datos.usados && datos.usados[0];
    assert.ok(u, 'no leyó USADOS: ' + JSON.stringify(datos && datos.usados));
    assert.strictEqual(u.pago_unico_manual, 0);
    assert.strictEqual(u.cuota_2_manual, 0);
    const c = cotizar(u, 250000, datos.config);
    assert.strictEqual(c.usoManual, false);
    assert.strictEqual(c.pagoUnico, 211000); // 130.000 × 1,54 = 200.200 → 201.000 + 10.000
    assert.strictEqual(c.cuotaDe2, 121000); // 130.000 × 1,70 / 2 = 110.500 → 111.000 + 10.000
  });

  // --- #bateria (01/10/2026, decisión de Tomás): qué lista de usados usa el bot ---
  // LISTA y LISTA 85-93 con la forma de la planilla real (encabezados en la fila 4). La otra
  // pestaña se lee aparte y solo si está activa: si no existe, no rompe LISTA, CONFIG ni USADOS.
  const CAB = ['ID', 'Modelo', 'Capacidad_GB', 'Condicion', 'Bateria_min', 'Precio_contado', 'Anticipo_min', 'Cotizable', 'Notas'];
  const LISTA_REAL = [
    ['Cotizador - Somos iPhone NQN'], [], [], CAB,
    ['N-001', 'iPhone 13', 128, 'Usado', 100, 535000, 350000, 'SI', ''],
    ['N-006', 'iPhone 16', 128, 'Usado', 100, 1050000, 670000, 'SI', ''],
    ['N-008', 'iPhone 17', 128, 'Sellado', '', 1700000, 1000000, 'SI', ''],
    ['N-0014', 'Iphone 18 pro max', 256, 'sellado ', '', 2900000, 1800000, 'SI', ''],
    ['N-0015', 'iPhone 16', 128, 'sellado ', '', 1450000, 900000, 'SI', ''],
    ['N-0016', 'iPhone 15', 128, 'Usado', '85-90%', 700000, 420000, 'SI', ''],
    ['N-0017', 'iPhone 14 Pro', 128, 'Usado', 0, 800000, 480000, 'SI', ''],
  ];
  const LISTA_8593 = [
    ['Cotizador - Somos iPhone NQN'], [], [], CAB,
    ['N-001', 'iPhone 13', 128, 'Usado', '85-93', 499999, 320000, 'SI', ''],
    ['N-0099', 'iPhone 14 plus', 128, 'Usado', '85-93', 620000, 400000, 'SI', ''],
  ];
  const otrasPedidas = [];
  let otraPestana = () => LISTA_8593;
  sheets.usarCliente({
    spreadsheets: {
      values: {
        batchGet: async () => ({
          data: {
            valueRanges: [
              valores([['Parametro', 'Valor'], ['Estado_lista', 'VIGENTE'], ['Redondeo', 1000]]),
              valores(LISTA_REAL),
              valores([
                ['ID', 'Modelo', 'Capacidad_GB', 'Bateria_pct', 'Precio_contado', 'Anticipo_min', 'Foto_lista', 'Disponible'],
                ['U-001', 'iPhone 12', 64, 87, 380000, 250000, 'SI', 'SI'],
                ['U-002', 'iphone xr', 64, 90, 290000, 190000, 'SI', 'SI'],
              ]),
            ],
          },
        }),
        get: async ({ range }) => {
          otrasPedidas.push(range);
          return { data: { values: otraPestana() } };
        },
      },
    },
  });
  const avisos = [];
  const leer = async () => {
    sheets.invalidarCache();
    try {
      return await sheets.leerTodo();
    } catch (e) {
      return { error: e.message, lista: [], usados: [] };
    }
  };
  const porId = (d, id) => (d.lista || []).find((f) => f.id === id);
  let usaLista = true;
  try {
    sheets.alAvisar((t) => avisos.push(t));
    sheets.usarListaBateria(null);
  } catch (e) {
    usaLista = false;
    check('01/10: sheets tiene la lista de usados elegida (#bateria)', () => assert.fail(e.message));
  }

  if (usaLista) {
    const sinOtra = await leer();
    check('01/10: sin #bateria, todo de LISTA y la otra pestaña no se lee', () => {
      assert.ok(!sinOtra.error, sinOtra.error);
      assert.deepStrictEqual(otrasPedidas, [], 'leyó otra pestaña sin estar activa: ' + otrasPedidas.join(', '));
      assert.strictEqual(porId(sinOtra, 'N-001').precio_contado, 535000);
      assert.ok(!porId(sinOtra, 'N-0099'), 'entró una fila de la otra pestaña');
    });

    sheets.usarListaBateria('85-93');
    const mezcla = await leer();
    check('01/10: #bateria 85-93: la fila con el mismo ID sale de LISTA 85-93, con su precio y su batería', () => {
      assert.ok(!mezcla.error, mezcla.error);
      assert.deepStrictEqual(otrasPedidas, ["'LISTA 85-93'!A1:U200"]);
      const f = porId(mezcla, 'N-001');
      assert.strictEqual(f.precio_contado, 499999);
      assert.strictEqual(f.anticipo_min, 320000);
      assert.strictEqual(f.bateria_texto, '85-93');
      assert.strictEqual(f.bateria_min, 85, 'para una cuenta, bateria_min sigue siendo el número');
      assert.strictEqual((mezcla.lista || []).filter((x) => x.id === 'N-001').length, 1, 'quedó el 13 de LISTA también');
    });
    check('01/10: #bateria 85-93: los sellados y lo que no está en la otra pestaña siguen de LISTA', () => {
      assert.strictEqual(porId(mezcla, 'N-008').precio_contado, 1700000);
      assert.strictEqual(porId(mezcla, 'N-0015').precio_contado, 1450000);
      assert.strictEqual(porId(mezcla, 'N-006').precio_contado, 1050000);
      assert.strictEqual(porId(mezcla, 'N-0016').bateria_texto, '85-90');
      assert.strictEqual(mezcla.usados.length, 2, 'USADOS no cambia');
      assert.strictEqual(mezcla.usados[0].bateria_min, 87);
    });
    check('01/10: #bateria 85-93: una fila con un ID que no está en LISTA también entra', () => {
      const f = porId(mezcla, 'N-0099');
      assert.ok(f, 'no entró la fila nueva: ' + JSON.stringify((mezcla.lista || []).map((x) => x.id)));
      assert.strictEqual(f.modelo, 'iPhone 14 Plus');
      assert.strictEqual(f.precio_contado, 620000);
    });
    check('01/10: Condicion y Modelo sin espacios de más ni mayúsculas; el modelo se muestra prolijo', () => {
      const f = porId(mezcla, 'N-0014');
      assert.strictEqual(f.modelo, 'iPhone 18 Pro Max');
      assert.strictEqual(mezcla.usados[1].modelo, 'iPhone XR', 'USADOS también sale prolijo');
      assert.ok(sheets.buscarModelo(mezcla, '18 pro max', null), 'no encuentra el 18 Pro Max');
      assert.strictEqual(bateriaDe(f), 'sellado');
      assert.strictEqual(bateriaDe(porId(mezcla, 'N-0015')), 'sellado');
    });
    check('01/10: la batería que se muestra sale de Bateria_min tal cual: 85-93%, 85-90%, 100%', () => {
      assert.strictEqual(bateriaDe(porId(mezcla, 'N-001')), '85-93%');
      assert.strictEqual(bateriaDe(porId(mezcla, 'N-0016')), '85-90%');
      assert.strictEqual(bateriaDe(porId(mezcla, 'N-006')), '100%');
      assert.strictEqual(bateriaDe({ modelo: 'iPhone 13', bateria_min: 85 }), '85%');
      assert.strictEqual(bateriaDe({ modelo: 'iPhone 13', bateria_min: 0 }), '');
      assert.strictEqual(bateriaDe(porId(mezcla, 'N-0017')), '', 'una batería en 0 se mostraba');
    });
    check('01/10: "¿tenés el 16?" sigue dando el más barato (el usado), aunque esté el 16 sellado', () => {
      assert.strictEqual(sheets.buscarModelo(mezcla, '16', null).id, 'N-006');
    });

    otraPestana = () => {
      throw new Error("Unable to parse range: 'LISTA 85-93'!A1:U200");
    };
    avisos.length = 0;
    const falla = await leer();
    const falla2 = await leer();
    check('01/10: si la pestaña activa no se puede leer, sigue con LISTA sola y avisa una vez', () => {
      assert.ok(!falla.error, 'se cayó la lectura de LISTA: ' + falla.error);
      assert.strictEqual(porId(falla, 'N-001').precio_contado, 535000);
      assert.strictEqual(falla.config.estadoLista, 'VIGENTE');
      assert.strictEqual(falla.usados.length, 2);
      assert.ok(!falla2.error, falla2.error);
      assert.deepStrictEqual(avisos, ['⚠️ No pude leer LISTA 85-93: cotizo con LISTA']);
    });
    otraPestana = () => [['Cotizador'], [], [], CAB];
    avisos.length = 0;
    sheets.usarListaBateria('85-93');
    const vacia = await leer();
    check('01/10: una pestaña activa sin filas con modelo: LISTA sola, y avisa', () => {
      assert.strictEqual(porId(vacia, 'N-001').precio_contado, 535000);
      assert.deepStrictEqual(avisos, ['⚠️ No pude leer LISTA 85-93: cotizo con LISTA']);
    });

    otraPestana = () => LISTA_8593;
    const prueba = await sheets.probarListaBateria('85-93');
    otraPestana = () => {
      throw new Error("Unable to parse range: 'LISTA 70-80'!A1:U200");
    };
    const noEsta = await sheets.probarListaBateria('70-80');
    otraPestana = () => [['Cotizador'], [], [], CAB];
    const sinFilas = await sheets.probarListaBateria('85-93');
    check('01/10: antes de cambiar se lee la pestaña: cuántas filas tiene, o por qué no sirve', () => {
      assert.deepStrictEqual(prueba, { ok: true, filas: 2 });
      assert.strictEqual(noEsta.ok, false);
      assert.match(noEsta.motivo, /no existe/);
      assert.strictEqual(sinFilas.ok, false);
      assert.match(sinFilas.motivo, /no tiene filas con modelo/);
    });
    sheets.usarListaBateria(null);
  }

  check('01/10: la cotización dice la batería de la columna, o "sellado"', () => {
    const cot = cotizar(ip13, 330000, config);
    const bat = plantilla({ ...ip13, bateria_min: 85, bateria_texto: '85-93' }, cot);
    assert.ok(bat.includes('📱 *iPhone 13 128GB — batería 85-93%*'), bat);
    const sellado = plantilla({ ...ip13, modelo: 'iPhone 17', condicion: 'Sellado', bateria_min: 0 }, cot);
    assert.ok(sellado.includes('📱 *iPhone 17 128GB — sellado*'), sellado);
    assert.strictEqual(detalleDe({ capacidad_gb: 128, condicion: 'sellado ', bateria_min: 0 }), '128gb, sellado');
    assert.strictEqual(detalleDe({ capacidad_gb: 128, bateria_min: 85, bateria_texto: '85-93' }), '128gb, bateria 85-93%');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : `\n${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
