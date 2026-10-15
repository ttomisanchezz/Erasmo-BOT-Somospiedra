'use strict';
/**
 * El stock de la app en la planilla (08/10/2026): src/stock-app.js, la columna STOCK en sheets.js y en el
 * espejo, y lo que cambia en el cerebro con STOCK_APP_MODO=vivo.
 *
 *   node test/stock-app.test.js
 *
 * Sin red: la planilla es una hoja de cálculo de mentira en memoria (con la forma real: títulos arriba,
 * encabezados más abajo, fórmulas en Saldo_a_financiar, Pago_unico y Cuota_de_2 arrastradas hasta la fila 10),
 * Supabase y la API de Anthropic son un `fetch` de mentira. Se prueba:
 *   1. el día del depósito, de lunes a domingo (hora de Argentina);
 *   2. las fórmulas corridas a otra fila; el plan de escritura (datos con RAW, fórmulas con USER_ENTERED, lo
 *      viejo se borra, sin cambios no se escribe); la entrega mínima de LISTA; las filas desde la vista;
 *   3. sombra: escribe "USADOS APP" (la crea con la cabecera de USADOS) y no toca USADOS; vivo: escribe USADOS
 *      y sheets.js lee los códigos, el sellado y `solo_contado`;
 *   4. Supabase caído o la vista rota: no pisa nada y queda en /salud;
 *   5. las órdenes de STOCK: por fila_id, por modelo + capacidad + condición, no la encuentra, hay dos, sin la
 *      columna STOCK; y el espejo copia STOCK (solo con el stock de la app prendido);
 *   6. el cerebro en vivo: STOCK = NO no se ofrece, local primero, `donde`, `frase_deposito`, `[deposito]`, la
 *      guardia (el depósito por su cuenta, TechSur, "por encargo", `[deposito]` sin equipo), solo contado, y el
 *      código del equipo al escalar (del local y del depósito);
 *   7. sombra y apagado: el pedido a Sonnet y lo que contesta son idénticos (Chiara contesta como hoy).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'stock-app-'));
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.CEREBRO_MODO = 'apagado';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
process.env.SUPABASE_URL = 'https://de-mentira.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_de_mentira';
process.env.ESPEJO_COTIZADOR_ACTIVO = 'true';
process.env.STOCK_APP_MODO = 'apagado';
process.env.SHEET_ID = 'planilla-de-mentira';
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const config = require('../src/config');
config.techsur.supabaseUrl = process.env.SUPABASE_URL;
config.techsur.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
config.sheets.id = process.env.SHEET_ID;

// ------------------------------------------------------------------ la planilla de mentira
const CAB_USADOS = ['ID', 'Modelo', 'Capacidad_GB', 'Color', 'Bateria_pct', 'Detalles', 'Precio_contado', 'Anticipo_min', 'Saldo_a_financiar', 'Pago_unico', 'Cuota_de_2', 'Foto_lista', 'Disponible', 'Notas'];
const formulas = (r) => [`=G${r}-H${r}`, `=ROUNDUP(I${r}*CONFIG!$B$3/1000,0)*1000`, `=ROUNDUP(I${r}*CONFIG!$B$4/2/1000,0)*1000`];
const filaUsados = (r, datos) => [...datos.slice(0, 8), ...formulas(r), ...datos.slice(8)];
function usadosDeHoy() {
  return [
    ['USADOS - unidades del local'],
    [],
    CAB_USADOS,
    filaUsados(4, ['U-001', 'iPhone 12', 64, 'Blanco', 87, 'Micro rayon', 380000, 250000, 'SI', 'SI', '']),
    filaUsados(5, ['U-002', 'iPhone 14', 128, 'Gris', 86, 'Sin Face ID', 430000, 290000, 'SI', 'SI', 'a mano']),
    filaUsados(6, ['', '', '', '', '', '', '', '', '', '', '']),
    filaUsados(7, ['', '', '', '', '', '', '', '', '', '', '']),
    filaUsados(8, ['', '', '', '', '', '', '', '', '', '', '']),
    filaUsados(9, ['', '', '', '', '', '', '', '', '', '', '']),
    filaUsados(10, ['', '', '', '', '', '', '', '', '', '', '']),
  ];
}
const CAB_LISTA = ['ID', 'Modelo', 'Capacidad_GB', 'Condicion', 'Bateria_min', 'Costo_proveedor', 'Margen', 'Precio_contado', 'Margen_pct', 'Anticipo_min', 'Anticipo_pct', 'Saldo_a_financiar', 'Pago_unico_manual', 'Pago_unico', 'Total_con_1_pago', 'Cuota_2_manual', 'Cuota_de_2', 'Total_con_2_pagos', 'Interes_2_real', 'Cotizable', 'Notas', 'STOCK'];
const filaLista = (id, modelo, gb, cond, bat, contado, anticipo, stock = '', cotizable = 'SI') => [id, modelo, gb, cond, bat, 0, 0, contado, 0, anticipo, 0, 0, '', 0, 0, '', 0, 0, 0, cotizable, '', stock];
const titulo = [['LISTA - catalogo por modelo'], [], []];
function listaDeHoy() {
  return [
    ...titulo,
    CAB_LISTA,
    filaLista('N-001', 'iPhone 13', 128, 'Usado', 100, 495000, 320000),
    filaLista('N-004', 'iPhone 14 Pro', 128, 'Usado', 100, 800000, 480000, 'NO'),
    filaLista('N-005', 'iPhone 15', 128, 'Usado', 100, 740000, 420000, 'SÍ'),
    filaLista('N-006', 'iPhone 15 Pro', 128, 'Usado', 100, 920000, 530000),
    filaLista('N-007', 'iPhone 15 Pro', 256, 'Usado', 100, 990000, 560000),
    filaLista('N-009', 'iPhone 17', 128, 'Sellado', '', 1600000, 920000),
    filaLista('N-012', 'iPhone 16', 128, 'Usado', 100, 1050000, 670000),
    filaLista('N-013', 'iPhone 16', 128, 'Sellado', '', 1450000, 900000),
  ];
}
function lista8593DeHoy(conStock = true) {
  const cab = conStock ? CAB_LISTA : CAB_LISTA.slice(0, -1);
  return [...titulo, cab, filaLista('N-001', 'iPhone 13', 128, 'Usado', '85-93', 450000, 290000).slice(0, cab.length), filaLista('N-006', 'iPhone 15 Pro', 128, 'Usado', '85-93', 870000, 500000).slice(0, cab.length)];
}
const CONFIG = [['Parametro', 'Valor'], ['Estado_lista', 'VIGENTE'], ['Coef_1_cuota', 1.54], ['Coef_2_cuotas', 1.7], ['Redondeo', 1000]];

let hojas;
let escrituras;
let pestanasCreadas;
let googleCaido = false; // las escrituras tiran (503)
const rangosLeidos = [];
function planillaNueva({ stockEn8593 = true } = {}) {
  hojas = { CONFIG, LISTA: listaDeHoy(), 'LISTA 85-93': lista8593DeHoy(stockEn8593), USADOS: usadosDeHoy() };
  escrituras = [];
  pestanasCreadas = [];
}
const colIndice = (letras) => [...letras].reduce((n, c) => n * 26 + (c.charCodeAt(0) - 64), 0) - 1;
function rango(r) {
  const m = /^'?([^'!]+)'?!([A-Z]+)(\d+)(?::([A-Z]+)(\d+))?$/.exec(String(r));
  assert.ok(m, 'rango raro: ' + r);
  return { hoja: m[1], c1: colIndice(m[2]), f1: Number(m[3]) - 1, c2: colIndice(m[4] || m[2]), f2: Number(m[5] || m[3]) - 1 };
}
const esFormula = (v) => typeof v === 'string' && v.startsWith('=');
function leer(r, render) {
  const { hoja, c1, f1, c2, f2 } = rango(r);
  if (!hojas[hoja]) throw new Error(`Unable to parse range: ${r}`);
  const out = [];
  for (let i = f1; i <= Math.min(f2, hojas[hoja].length - 1); i++) {
    const fila = hojas[hoja][i] || [];
    const celdas = [];
    for (let j = c1; j <= Math.min(c2, fila.length - 1); j++) {
      const v = fila[j];
      // Con UNFORMATTED_VALUE una fórmula "vale" 0 (acá nadie la calcula); con FORMULA sale tal cual.
      celdas.push(esFormula(v) && render !== 'FORMULA' ? 0 : v === undefined ? '' : v);
    }
    while (celdas.length && (celdas[celdas.length - 1] === '' || celdas[celdas.length - 1] === undefined)) celdas.pop();
    out.push(celdas);
  }
  while (out.length && !out[out.length - 1].length) out.pop();
  return out;
}
function escribir(r, values, valueInputOption) {
  if (googleCaido) throw new Error('Google 503: de mentira');
  const { hoja, c1, f1 } = rango(r);
  assert.ok(hojas[hoja], 'escribe en una pestaña que no existe: ' + hoja);
  escrituras.push({ hoja, rango: r, valueInputOption, values });
  values.forEach((fila, i) => {
    hojas[hoja][f1 + i] = hojas[hoja][f1 + i] || [];
    fila.forEach((v, j) => {
      if (valueInputOption === 'RAW') assert.ok(!esFormula(v), `escribió una fórmula con RAW: ${v}`);
      hojas[hoja][f1 + i][c1 + j] = v;
    });
    // Como Google: una celda vacía al final no "existe".
    const h = hojas[hoja][f1 + i];
    while (h.length && (h[h.length - 1] === '' || h[h.length - 1] === undefined)) h.pop();
  });
}
const clienteDeMentira = {
  spreadsheets: {
    get: async () => ({ data: { sheets: Object.keys(hojas).map((title, i) => ({ properties: { sheetId: i + 1, title } })) } }),
    batchUpdate: async ({ requestBody }) => {
      for (const req of requestBody.requests) {
        assert.ok(req.addSheet, 'solo se puede crear una pestaña: ' + JSON.stringify(req));
        const t = req.addSheet.properties.title;
        assert.strictEqual(t, 'USADOS APP', 'creó otra pestaña: ' + t);
        hojas[t] = [];
        pestanasCreadas.push(t);
      }
      return { data: {} };
    },
    values: {
      get: async ({ range, valueRenderOption }) => {
        rangosLeidos.push(range);
        return { data: { values: leer(range, valueRenderOption) } };
      },
      batchGet: async ({ ranges, valueRenderOption }) => {
        rangosLeidos.push(...ranges);
        return { data: { valueRanges: ranges.map((r) => ({ values: leer(r, valueRenderOption) })) } };
      },
      update: async ({ range, valueInputOption, requestBody }) => {
        escribir(range, requestBody.values, valueInputOption);
        return { data: {} };
      },
      batchUpdate: async ({ requestBody }) => {
        for (const d of requestBody.data) escribir(d.range, d.values, requestBody.valueInputOption);
        return { data: {} };
      },
    },
  },
};
const sheets = require('../src/sheets');
sheets.usarCliente(clienteDeMentira);
const espejo = require('../src/espejo-cotizador');
espejo.usarLector(async (p) => {
  if (!hojas[p]) throw new Error(`Unable to parse range: '${p}'!A1:Z200`);
  return leer(`'${p}'!A1:Z200`, 'UNFORMATTED_VALUE');
});
const stockApp = require('../src/stock-app');

// ------------------------------------------------------------------ Supabase y la API de mentira
let vista = [];
let supabase = { caido: false, vistaRota: false };
let ordenes = [];
const pedidosSupabase = [];
const pedidosSonnet = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const FICHA = { quiere_avanzar: false, cuando: '', cuando_es: 'no_dijo', forma_pago: 'no_dijo', zona: '', canje: '' };
const responde = (mensajes) => [usar('responder', { mensajes, ficha: FICHA })];
const escala = (motivo) => [usar('escalar', { motivo, ficha: FICHA })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
  pedidosSonnet.length = 0;
}
globalThis.fetch = async (url, op = {}) => {
  const u = String(url);
  if (u.startsWith('https://de-mentira.supabase.co/')) {
    const ruta = new URL(u);
    const tabla = ruta.pathname.replace('/rest/v1/', '');
    const metodo = op.method || 'GET';
    pedidosSupabase.push({ tabla, metodo, url: u, body: op.body ? JSON.parse(op.body) : null });
    assert.strictEqual(op.headers.apikey, 'sb_secret_de_mentira');
    if (supabase.caido) return { ok: false, status: 503, text: async () => 'caído', json: async () => ({}) };
    if (tabla === 'v_stock_chiara') return supabase.vistaRota ? comoRespuesta(200, { mensaje: 'no soy una lista' }) : comoRespuesta(200, vista);
    if (tabla === 'planilla_ordenes' && metodo === 'GET') return comoRespuesta(200, ordenes.filter((o) => o.estado === 'pendiente'));
    if (tabla === 'planilla_ordenes' && metodo === 'PATCH') {
      const id = ruta.searchParams.get('id').replace('eq.', '');
      const o = ordenes.find((x) => x.id === id);
      const cuerpo = JSON.parse(op.body);
      assert.ok(['hecha', 'error'].includes(cuerpo.estado));
      assert.ok(cuerpo.hecha_en);
      assert.ok(cuerpo.estado === 'error' ? cuerpo.error : cuerpo.error === null);
      if (o) Object.assign(o, cuerpo);
      return comoRespuesta(204, null);
    }
    if (tabla === 'precios_cotizador' && metodo === 'GET') return comoRespuesta(200, []);
    if (tabla === 'precios_cotizador') return comoRespuesta(201, null);
    throw new Error('pedido inesperado a Supabase: ' + metodo + ' ' + tabla);
  }
  if (!u.startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + u);
  const body = JSON.parse(op.body);
  pedidosSonnet.push({ body });
  const paso = pasos[pedidosSonnet.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidosSonnet.length);
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};
const resultadoDe = (nombre) => {
  const p = pedidosSonnet.find((x) => x.body.messages.some((m) => m.role === 'user' && Array.isArray(m.content) && m.content.some((c) => c.type === 'tool_result')));
  assert.ok(p, 'no hubo tool_result');
  for (const m of pedidosSonnet.map((x) => x.body.messages).flat()) {
    if (m.role !== 'user' || !Array.isArray(m.content)) continue;
    for (const c of m.content) if (c.type === 'tool_result') return JSON.parse(c.content);
  }
  assert.fail('sin resultado de ' + nombre);
};

const equipo = (codigo, modelo, capacidad, bateria, precio, extra = {}) => ({
  equipo_id: 'id-' + codigo,
  codigo,
  prefijo: codigo.split('-')[0],
  modelo,
  capacidad,
  bateria,
  bateria_pct: /^\d+/.test(bateria) ? parseInt(bateria, 10) : null,
  condicion: /sellad/i.test(bateria) ? 'sellado' : 'usado',
  color: 'Negro',
  precio,
  precio_a_mano: false,
  precio_de: 'LISTA 85-93',
  detalle: '',
  fecha_ingreso: '2026-10-01',
  dias_en_stock: 7,
  lista_leida_en: '2026-10-08T10:00:00Z',
  actualizado_en: '2026-10-08T10:00:00Z',
  ...extra,
});

const silencio = async (fn) => {
  const [l, e, w] = [console.log, console.error, console.warn];
  console.log = () => {};
  console.error = () => {};
  console.warn = () => {};
  try {
    return await fn();
  } finally {
    console.log = l;
    console.error = e;
    console.warn = w;
  }
};
let fallos = 0;
let casos = 0;
async function check(nombre, fn) {
  casos++;
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (process.env.VER_TODO ? e.message : e && e.stack ? e.stack.split('\n').slice(0, 5).join(' | ') : e));
  } finally {
    supabase = { caido: false, vistaRota: false };
    ordenes = [];
    googleCaido = false;
    sheets.invalidarCache();
  }
}
const modo = (m) => {
  config.stockApp.modo = m;
  stockApp._reiniciar();
  espejo._reiniciar();
  sheets.invalidarCache();
};
const AR = (dia, hora = '12:00') => Date.parse(`${dia}T${hora}:00-03:00`);

(async () => {
  console.log('\nEl stock de la app en la planilla (08/10/2026)\n');

  // ------------------------------------------------------------ 1. el día del depósito
  await check('el día del depósito: de lunes a jueves "mañana", viernes, sábado y domingo "el lunes" (hora de Argentina)', () => {
    const esperado = { '2026-10-05': 'mañana', '2026-10-06': 'mañana', '2026-10-07': 'mañana', '2026-10-08': 'mañana', '2026-10-09': 'el lunes', '2026-10-10': 'el lunes', '2026-10-11': 'el lunes' };
    for (const [dia, texto] of Object.entries(esperado)) assert.strictEqual(stockApp.diaDelDeposito(AR(dia)), texto, dia);
    // Jueves a las 23:30 de Argentina ya es viernes en UTC: sigue siendo "mañana".
    assert.strictEqual(stockApp.diaDelDeposito(AR('2026-10-08', '23:30')), 'mañana');
    // Domingo a las 22:00 de Argentina (lunes 01:00 UTC): "el lunes".
    assert.strictEqual(stockApp.diaDelDeposito(AR('2026-10-11', '22:00')), 'el lunes');
    assert.strictEqual(stockApp.fraseDeposito(AR('2026-10-09')), 'si me bancás 10 minutos te confirmo bien para cuándo lo puedo tener');
  });

  // ------------------------------------------------------------ 2. las piezas
  await check('una fórmula corrida a otra fila: las referencias sin $ se corren, las ancladas y los nombres de función no', () => {
    assert.strictEqual(stockApp.formulaEnOtraFila('=G4-H4', 3), '=G7-H7');
    assert.strictEqual(stockApp.formulaEnOtraFila('=ROUNDUP(I4*CONFIG!$B$3/1000,0)*1000', 2), '=ROUNDUP(I6*CONFIG!$B$3/1000,0)*1000');
    assert.strictEqual(stockApp.formulaEnOtraFila('=G$4+$H4+LOG10(AB4)+CONFIG!B3', 1), '=G$4+$H5+LOG10(AB5)+CONFIG!B4');
    assert.strictEqual(stockApp.formulaEnOtraFila('=G4-H4', 0), '=G4-H4');
  });

  await check('la entrega mínima sale de LISTA (o LISTA 85-93) por modelo, capacidad y condición; sin fila, null', () => {
    const listas = { LISTA: espejo.aFilas('LISTA', listaDeHoy()), 'LISTA 85-93': espejo.aFilas('LISTA 85-93', lista8593DeHoy()) };
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000)), 500000, 'la de LISTA 85-93 (su precio sale de ahí)');
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('15P-256-001', 'iPhone 15 Pro', '256GB', '100%', 990000, { precio_de: 'LISTA' })), 560000, 'la del 256 de LISTA');
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('16-128-001', 'iPhone 16', '128GB', 'SELLADO', 1450000, { precio_de: 'a mano' })), 900000, 'el sellado del 16, no el usado');
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('16-128-002', 'iPhone 16', '128GB', '100%', 1050000, { precio_de: 'a mano' })), 670000, 'el usado del 16');
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('12-64-001', 'iPhone 12', '64GB', '90%', 380000, { precio_de: 'a mano' })), null, 'el 12 no está en ninguna lista');
    // Una batería que no entra en ninguna pestaña (menos de 80 %, de 96 a 99 %, sin dato): sin entrega mínima, aunque el modelo esté en LISTA.
    assert.strictEqual(stockApp.pestanaPara(equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '70%', 800000, { precio_de: 'a mano' })), null);
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '70%', 800000, { precio_de: 'a mano' })), null, '70 %: solo contado');
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '97%', 900000, { precio_de: 'a mano' })), null, '97 %: solo contado');
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '', 900000, { precio_de: 'a mano', bateria_pct: null })), null, 'sin dato: solo contado');
    assert.strictEqual(stockApp.pestanaPara(equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 800000, { precio_de: 'a mano' })), 'LISTA 85-93');
    // Una entrega mínima que no es menor que el precio del equipo: tampoco hay mínimo.
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 500000)), null, 'mínimo 500.000 con precio 500.000: solo contado');
    assert.strictEqual(stockApp.entregaMinimaDe(listas, equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 500001)), 500000);
    // Dos filas de LISTA que entran (la fila sin capacidad vale para cualquiera): la entrega mínima más alta.
    const conDos = { LISTA: [...listas.LISTA, { modelo: 'iPhone 13', capacidad: null, condicion: null, anticipo_min: 350000 }], 'LISTA 85-93': [] };
    assert.strictEqual(stockApp.entregaMinimaDe(conDos, equipo('13-128-001', 'iPhone 13', '128GB', '100%', 495000, { precio_de: 'LISTA' })), 350000);
  });

  await check('las filas desde la vista: código como ID, "SELLADO" en Bateria_pct, la capacidad en GB, solo contado sin mínimo; sin código no entra', () => {
    const listas = { LISTA: espejo.aFilas('LISTA', listaDeHoy()), 'LISTA 85-93': espejo.aFilas('LISTA 85-93', lista8593DeHoy()) };
    const filas = stockApp.filasDesdeLaVista(
      [
        equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000, { color: 'Azul', detalle: 'con caja' }),
        equipo('16-128-001', 'iPhone 16', '128GB', 'SELLADO', 1450000, { precio_de: 'a mano', precio_a_mano: true }),
        equipo('12-64-001', 'iPhone 12', '64GB', '90%', 380000, { precio_de: 'a mano', capacidad: '1TB' }),
        { ...equipo('', 'iPhone 11', '128GB', '85%', 240000), codigo: '' },
      ],
      listas
    );
    assert.deepStrictEqual(
      filas.map((f) => [f.id, f.modelo, f.capacidad_gb, f.color, f.bateria_pct, f.detalles, f.precio_contado, f.anticipo_min, f.foto_lista, f.disponible]),
      [
        ['15P-128-001', 'iPhone 15 Pro', 128, 'Azul', 88, 'con caja', 870000, 500000, 'SI', 'SI'],
        ['16-128-001', 'iPhone 16', 128, 'Negro', 'SELLADO', '', 1450000, 900000, 'SI', 'SI'],
        ['12-64-001', 'iPhone 12', 1024, 'Negro', 90, '', 380000, '', 'SI', 'SI'],
      ]
    );
    assert.match(filas[2].notas, /solo contado/);
    assert.match(filas[0].notas, /LISTA 85-93/);
  });

  await check('el plan de escritura: datos con RAW, fórmulas con USER_ENTERED corridas a su fila, lo viejo se borra; sin cambios no escribe', () => {
    const molde = usadosDeHoy();
    const listas = { LISTA: espejo.aFilas('LISTA', listaDeHoy()), 'LISTA 85-93': espejo.aFilas('LISTA 85-93', lista8593DeHoy()) };
    const nuevas = stockApp.filasDesdeLaVista([equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000)], listas);
    const plan = stockApp.planDeEscritura(molde, molde, nuevas);
    assert.strictEqual(plan.iCab, 2);
    assert.strictEqual(plan.desde, 3, 'la primera fila de datos (fila 4)');
    assert.strictEqual(plan.hasta, 4, 'hasta la última que tenía algo (fila 5): el U-002 se borra');
    assert.ok(plan.cambia);
    assert.deepStrictEqual(plan.datos.map((b) => b.rango), ['A4:H5', 'L4:N5']);
    assert.deepStrictEqual(plan.formulas.map((b) => b.rango), ['I4:K5']);
    assert.deepStrictEqual(plan.datos[0].values[0], ['15P-128-001', 'iPhone 15 Pro', 128, 'Negro', 88, '', 870000, 500000]);
    assert.deepStrictEqual(plan.datos[0].values[1], ['', '', '', '', '', '', '', '']);
    assert.deepStrictEqual(plan.datos[1].values, [['SI', 'SI', 'precio de LISTA 85-93'], ['', '', '']]);
    assert.deepStrictEqual(plan.formulas[0].values, [formulas(4), formulas(5)]);
    // Con 8 unidades, las fórmulas de las filas 4 a 11 (la 11 no existía: la fórmula se corre igual).
    const ocho = stockApp.filasDesdeLaVista(Array.from({ length: 8 }, (_, i) => equipo(`15P-128-00${i + 1}`, 'iPhone 15 Pro', '128GB', '88%', 870000)), listas);
    const grande = stockApp.planDeEscritura(molde, molde, ocho);
    assert.strictEqual(grande.hasta, 10);
    assert.deepStrictEqual(grande.formulas[0].values[7], formulas(11));
    // Sin filas nuevas: se borran las dos que había.
    const vacio = stockApp.planDeEscritura(molde, molde, []);
    assert.ok(vacio.cambia);
    assert.strictEqual(vacio.hasta, 4);
    // Lo mismo dos veces: la segunda no cambia.
    const escrito = molde.map((f) => f.slice());
    for (const b of [...plan.datos, ...plan.formulas]) {
      const { f1, c1 } = rango(`'USADOS'!${b.rango}`);
      b.values.forEach((fila, i) => fila.forEach((v, j) => (escrito[f1 + i][c1 + j] = v)));
    }
    assert.strictEqual(stockApp.planDeEscritura(molde, escrito, nuevas).cambia, false);
    assert.strictEqual(stockApp.planDeEscritura([['nada']], [['nada']], nuevas), null);
    // Una columna que no es de fórmulas ni de la app ("Costo"): se vacía y queda anotada como desconocida.
    assert.deepStrictEqual(plan.desconocidas, []);
    const conCosto = molde.map((f, i) => (i === 2 ? [...f, 'Costo'] : i === 3 || i === 4 ? [...f, 300000] : f));
    const planCosto = stockApp.planDeEscritura(conCosto, conCosto, nuevas);
    assert.deepStrictEqual(planCosto.desconocidas, ['costo']);
    assert.deepStrictEqual(planCosto.datos.map((b) => b.rango), ['A4:H5', 'L4:O5']);
    assert.deepStrictEqual(planCosto.datos[1].values[0], ['SI', 'SI', 'precio de LISTA 85-93', '']);
  });

  // ------------------------------------------------------------ 3. sombra y vivo contra la planilla
  await check('sombra: escribe "USADOS APP" (la crea con la cabecera de USADOS) y no toca USADOS', async () => {
    planillaNueva();
    modo('sombra');
    vista = [equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000), equipo('16-128-001', 'iPhone 16', '128GB', 'SELLADO', 1450000, { precio_de: 'a mano' })];
    const r = await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    assert.deepStrictEqual([r.usados.pestana, r.usados.filas, r.usados.escribio], ['USADOS APP', 2, true]);
    assert.deepStrictEqual(pestanasCreadas, ['USADOS APP']);
    assert.deepStrictEqual(hojas['USADOS APP'].slice(0, 3), [['USADOS - unidades del local'], [], CAB_USADOS], 'la cabecera copiada tal cual');
    assert.deepStrictEqual(hojas['USADOS APP'][3], filaUsados(4, ['15P-128-001', 'iPhone 15 Pro', 128, 'Negro', 88, '', 870000, 500000, 'SI', 'SI', 'precio de LISTA 85-93']));
    assert.deepStrictEqual(hojas['USADOS APP'][4], filaUsados(5, ['16-128-001', 'iPhone 16', 128, 'Negro', 'SELLADO', '', 1450000, 900000, 'SI', 'SI', 'precio a mano']));
    assert.deepStrictEqual(hojas.USADOS, usadosDeHoy(), 'USADOS no se toca en sombra');
    assert.ok(escrituras.every((e) => e.hoja === 'USADOS APP'));
    // Chiara sigue leyendo USADOS de siempre, sin solo_contado ni códigos de la app.
    const datos = await sheets.leerTodo();
    assert.deepStrictEqual(datos.usados.map((u) => u.id), ['U-001', 'U-002']);
    assert.ok(datos.usados.every((u) => u.solo_contado === undefined));
    assert.strictEqual(stockApp.resumen().pestana, 'USADOS APP');
    assert.strictEqual(stockApp.resumen().ultimoError, null);
    // La vuelta siguiente, sin cambios, no escribe nada.
    escrituras.length = 0;
    const r2 = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:01')));
    assert.strictEqual(r2.usados.escribio, false);
    assert.strictEqual(escrituras.length, 0);
    assert.strictEqual(pestanasCreadas.length, 1, 'no la crea dos veces');
  });

  await check('vivo: escribe USADOS; sheets.js lee los códigos, el sellado y `solo_contado`; lo cargado a mano se pisa', async () => {
    planillaNueva();
    modo('vivo');
    vista = [
      equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000, { color: 'Azul' }),
      equipo('16-128-001', 'iPhone 16', '128GB', 'SELLADO', 1450000, { precio_de: 'a mano' }),
      equipo('12-64-001', 'iPhone 12', '64GB', '90%', 380000, { precio_de: 'a mano' }),
    ];
    const r = await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    assert.deepStrictEqual([r.usados.pestana, r.usados.filas, r.usados.escribio], ['USADOS', 3, true]);
    assert.deepStrictEqual(pestanasCreadas, []);
    assert.deepStrictEqual(hojas.USADOS[3].slice(0, 8), ['15P-128-001', 'iPhone 15 Pro', 128, 'Azul', 88, '', 870000, 500000]);
    assert.deepStrictEqual(hojas.USADOS[3].slice(8, 11), formulas(4), 'las fórmulas siguen');
    assert.deepStrictEqual(hojas.USADOS[5].slice(0, 8), ['12-64-001', 'iPhone 12', 64, 'Negro', 90, '', 380000, '']);
    const datos = await sheets.leerTodo();
    const u = datos.usados;
    assert.deepStrictEqual(u.map((x) => x.id), ['15P-128-001', '16-128-001', '12-64-001'], 'U-001 y U-002 se pisaron');
    assert.strictEqual(u[0].anticipo_min, 500000);
    assert.strictEqual(u[0].solo_contado, undefined);
    assert.strictEqual(u[1].condicion, 'Sellado');
    assert.strictEqual(require('../src/cotizador').bateriaDe(u[1]), 'sellado');
    assert.strictEqual(u[2].solo_contado, true, 'sin entrega mínima: solo de contado');
    assert.strictEqual(u[2].anticipo_min, 0);
    assert.ok(u.every((x) => x.cotizable));
    // El cotizador: con la plata entera, de contado; con menos, SOLO_CONTADO (responder escala; Sonnet lo lee).
    const cotizador = require('../src/cotizador');
    assert.strictEqual(cotizador.cotizar(u[2], 380000, datos.config).soloContado, true);
    assert.deepStrictEqual(cotizador.cotizar(u[2], 300000, datos.config), { ok: false, motivo: 'SOLO_CONTADO', contado: 380000 });
    // Una fila común con el mínimo en 0 (sin la marca) sigue como siempre.
    assert.strictEqual(cotizador.cotizar({ ...u[2], solo_contado: undefined }, 300000, datos.config).ok, true);
  });

  await check('vivo: las filas de LISTA con STOCK = NO no se ofrecen (ni en listaAl100); SÍ y vacía sí; en sombra y apagado, todas', async () => {
    planillaNueva();
    modo('vivo');
    const vivo = await sheets.leerTodo();
    assert.deepStrictEqual(vivo.lista.map((f) => f.id), ['N-001', 'N-005', 'N-006', 'N-007', 'N-009', 'N-012', 'N-013'], 'el 14 Pro (NO) no está');
    assert.strictEqual(vivo.lista.find((f) => f.id === 'N-005').stock, 'SI');
    assert.strictEqual(vivo.lista.find((f) => f.id === 'N-001').stock, null);
    for (const m of ['sombra', 'apagado']) {
      modo(m);
      const todas = await sheets.leerTodo();
      assert.ok(todas.lista.some((f) => f.id === 'N-004'), `${m}: el 14 Pro con STOCK = NO sigue`);
      // En sombra la columna se lee (y no se usa); en apagado ni se lee (el rango es el de main).
      assert.strictEqual(todas.lista.find((f) => f.id === 'N-004').stock, m === 'sombra' ? 'NO' : null);
    }
    // Con #bateria 85-93 y el 13 de LISTA en NO: la fila de LISTA 85-93 manda (STOCK vacío) y listaAl100 lo filtra.
    hojas.LISTA[4][21] = 'NO';
    modo('vivo');
    sheets.usarListaBateria('85-93');
    const mezcla = await sheets.leerTodo();
    assert.strictEqual(mezcla.lista.find((f) => f.id === 'N-001').precio_contado, 450000, 'la del 85-93');
    assert.ok(!mezcla.listaAl100.some((f) => f.id === 'N-001'), 'la de LISTA con NO no va en al_100');
    sheets.usarListaBateria(null);
  });

  // ------------------------------------------------------------ 4. cuando algo falla
  await check('Supabase caído, la vista rota o la planilla ilegible: no pisa USADOS, queda lo último y /salud lo dice', async () => {
    planillaNueva();
    modo('vivo');
    vista = [equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000)];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    const antes = JSON.stringify(hojas.USADOS);
    escrituras.length = 0;
    supabase.caido = true;
    vista = [];
    let r = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:01')));
    assert.strictEqual(r.usados, null);
    assert.strictEqual(JSON.stringify(hojas.USADOS), antes, 'no tocó USADOS');
    assert.strictEqual(escrituras.length, 0);
    assert.match(stockApp.resumen().ultimoError.msg, /Supabase 503/);
    assert.strictEqual(stockApp.resumen().ultimoError.paso, 'usados');
    supabase.caido = false;
    supabase.vistaRota = true;
    r = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:02')));
    assert.strictEqual(r.usados, null);
    assert.strictEqual(JSON.stringify(hojas.USADOS), antes);
    assert.match(stockApp.resumen().ultimoError.msg, /no devolvió una lista/);
    supabase.vistaRota = false;
    // LISTA 85-93 no se puede leer: tampoco (la entrega mínima saldría a medias).
    const guardada = hojas['LISTA 85-93'];
    delete hojas['LISTA 85-93'];
    r = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:03')));
    assert.strictEqual(r.usados, null);
    assert.strictEqual(JSON.stringify(hojas.USADOS), antes);
    hojas['LISTA 85-93'] = guardada;
    // Vuelve: la vista vacía de verdad (una lista vacía) vacía lo del local recién a la tercera vuelta seguida.
    r = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:04')));
    assert.deepStrictEqual([r.usados.filas, r.usados.escribio, r.usados.esperandoVacia], [0, false, true]);
    assert.strictEqual(JSON.stringify(hojas.USADOS), antes, 'primera vuelta vacía: no toca USADOS');
    assert.strictEqual(stockApp.resumen().usados.vistaVaciaHace, 1);
    r = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:05')));
    assert.strictEqual(JSON.stringify(hojas.USADOS), antes, 'segunda vuelta vacía: tampoco');
    r = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:06')));
    assert.deepStrictEqual([r.usados.filas, r.usados.escribio], [0, true]);
    assert.deepStrictEqual(hojas.USADOS[3].slice(0, 8), ['', '', '', '', '', '', '', '']);
    assert.strictEqual(stockApp.resumen().ultimoError.paso, 'usados', 'el último error queda anotado aunque ya ande');
    // Una vista con algo en el medio vuelve la cuenta a cero.
    vista = [equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000)];
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:07')));
    vista = [];
    r = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:08')));
    assert.strictEqual(r.usados.esperandoVacia, true);
    assert.strictEqual(hojas.USADOS[3][0], '15P-128-001');
  });

  await check('rangos: en apagado la planilla se lee como en main (A1:U200 y A1:O200); en sombra y vivo, hasta la Z', async () => {
    planillaNueva();
    modo('apagado');
    rangosLeidos.length = 0;
    await sheets.leerTodo();
    assert.deepStrictEqual(rangosLeidos, ['CONFIG!A1:C30', 'LISTA!A1:U200', 'USADOS!A1:O200']);
    sheets.usarListaBateria('85-93');
    rangosLeidos.length = 0;
    await sheets.leerTodo();
    assert.deepStrictEqual(rangosLeidos, ['CONFIG!A1:C30', 'LISTA!A1:U200', 'USADOS!A1:O200', "'LISTA 85-93'!A1:U200"]);
    sheets.usarListaBateria(null);
    assert.deepStrictEqual(espejo.aFilas('LISTA', leer("'LISTA'!A1:U200", 'UNFORMATTED_VALUE')).map((f) => f.stock), [null, null, null, null, null, null, null, null], 'hasta la U no se ve STOCK');
    for (const m of ['sombra', 'vivo']) {
      modo(m);
      rangosLeidos.length = 0;
      await sheets.leerTodo();
      assert.deepStrictEqual(rangosLeidos, ['CONFIG!A1:C30', 'LISTA!A1:Z200', 'USADOS!A1:Z200'], m);
    }
    modo('apagado');
  });

  await check('apagado: no corre ni arranca; sin Supabase tampoco', async () => {
    modo('apagado');
    assert.strictEqual(await stockApp.vuelta(), null);
    assert.strictEqual(stockApp.arrancar(), false);
    assert.strictEqual(stockApp.resumen().activo, false);
    modo('sombra');
    const url = config.techsur.supabaseUrl;
    config.techsur.supabaseUrl = '';
    assert.strictEqual(await silencio(() => stockApp.arrancar()), false);
    assert.strictEqual(await stockApp.vuelta(), null);
    config.techsur.supabaseUrl = url;
    modo('apagado');
  });

  // ------------------------------------------------------------ 5. las órdenes de STOCK y el espejo
  await check('las órdenes: por fila_id, por modelo + capacidad + condición, no la encuentra, hay dos, sin la columna STOCK', async () => {
    planillaNueva({ stockEn8593: false });
    modo('sombra');
    vista = [];
    let nOrden = 0;
    const orden = (o) => ({ id: 'o-' + ++nOrden, creado_en: new Date().toISOString(), tipo: 'stock', estado: 'pendiente', hecha_en: null, error: null, fila_id: null, capacidad: null, condicion: null, ...o });
    ordenes = [
      orden({ pestana: 'LISTA', fila_id: 'N-006', modelo: 'iPhone 15 Pro', capacidad: '128GB', condicion: 'usado', valor: false }),
      orden({ pestana: 'LISTA', modelo: 'iphone 16', capacidad: '128GB', condicion: 'sellado', valor: true }),
      orden({ pestana: 'LISTA', modelo: 'iPhone 14 Pro', capacidad: '128GB', condicion: 'usado', valor: true }),
      orden({ pestana: 'LISTA', modelo: 'iPhone 15 Pro', capacidad: null, condicion: 'usado', valor: true }),
      orden({ pestana: 'LISTA', modelo: 'iPhone 11', capacidad: '128GB', condicion: 'usado', valor: true }),
      orden({ pestana: 'LISTA 85-93', fila_id: 'N-001', modelo: 'iPhone 13', capacidad: '128GB', condicion: 'usado', valor: false }),
      orden({ pestana: 'LISTA', fila_id: 'N-999', modelo: 'iPhone 13', capacidad: '128GB', condicion: 'usado', valor: false }),
    ];
    pedidosSupabase.length = 0;
    const r = await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    assert.strictEqual(r.ordenes, 7);
    assert.deepStrictEqual(
      ordenes.map((o) => [o.estado, o.error]),
      [
        ['hecha', null],
        ['hecha', null],
        ['hecha', null],
        ['error', 'Hay 2 filas de iPhone 15 Pro usado en LISTA: no sé cuál'],
        ['error', 'No encontré iPhone 11 128GB usado en LISTA'],
        ['error', 'Falta la columna STOCK en LISTA 85-93'],
        ['error', 'No encontré la fila N-999 en LISTA'],
      ]
    );
    const stockDe = (id) => hojas.LISTA.find((f) => f[0] === id)[21];
    assert.strictEqual(stockDe('N-006'), 'NO', 'por fila_id');
    assert.strictEqual(stockDe('N-013'), 'SI', 'el 16 sellado, no el usado');
    assert.strictEqual(stockDe('N-012'), '', 'el 16 usado quedó como estaba');
    assert.strictEqual(stockDe('N-004'), 'SI', 'el 14 Pro pasó de NO a SI');
    assert.strictEqual(stockDe('N-007'), '', 'el 15 Pro de 256 no se tocó');
    assert.ok(escrituras.filter((e) => e.hoja === 'LISTA').every((e) => e.valueInputOption === 'RAW' && e.values.length === 1 && e.values[0].length === 1));
    assert.ok(!hojas['LISTA 85-93'][3].includes('STOCK') && hojas['LISTA 85-93'][3].length === CAB_LISTA.length - 1, 'no creó la columna STOCK');
    // Cada orden se marcó una sola vez, con la hora, y después el espejo copió STOCK a la app.
    const patches = pedidosSupabase.filter((p) => p.metodo === 'PATCH');
    assert.strictEqual(patches.length, 7);
    assert.ok(patches.every((p) => p.url.includes('estado=eq.pendiente')));
    const copia = pedidosSupabase.find((p) => p.tabla === 'precios_cotizador' && p.metodo === 'POST');
    assert.ok(copia, 'el espejo no copió después de las órdenes');
    const fila = (id) => copia.body.find((f) => f.fila_id === id);
    assert.strictEqual(fila('N-006').stock, false);
    assert.strictEqual(fila('N-013').stock, true);
    assert.strictEqual(fila('N-001').stock, null);
    assert.ok(copia.body.filter((f) => f.pestana === 'LISTA 85-93').every((f) => f.stock === null), 'sin la columna, null');
    assert.deepStrictEqual(stockApp.resumen().ordenes.hechas, 3);
    assert.deepStrictEqual(stockApp.resumen().ordenes.errores, 4);
    // En la vuelta siguiente no quedan pendientes y no se vuelve a escribir nada.
    escrituras.length = 0;
    pedidosSupabase.length = 0;
    const r2 = await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:01')));
    assert.strictEqual(r2.ordenes, 0);
    assert.ok(escrituras.every((e) => e.hoja !== 'LISTA'));
    // Google no deja escribir (503, timeout): la orden queda pendiente y se reintenta; recién pasada 1 hora
    // (o 30 vueltas), error "la planilla no contesta".
    ordenes = [orden({ pestana: 'LISTA', fila_id: 'N-012', modelo: 'iPhone 16', capacidad: '128GB', condicion: 'usado', valor: false })];
    googleCaido = true;
    pedidosSupabase.length = 0;
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '13:00')));
    assert.strictEqual(ordenes[0].estado, 'pendiente', 'no la marcó');
    assert.strictEqual(pedidosSupabase.filter((p) => p.metodo === 'PATCH').length, 0);
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '13:30')));
    assert.strictEqual(ordenes[0].estado, 'pendiente', 'sigue pendiente a la media hora');
    googleCaido = false;
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '13:31')));
    assert.strictEqual(ordenes[0].estado, 'hecha', 'cuando Google vuelve, se escribe');
    assert.strictEqual(stockDe('N-012'), 'NO');
    ordenes = [orden({ pestana: 'LISTA', fila_id: 'N-013', modelo: 'iPhone 16', capacidad: '128GB', condicion: 'sellado', valor: false })];
    googleCaido = true;
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '14:00')));
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '15:00')));
    assert.strictEqual(ordenes[0].estado, 'error');
    assert.match(ordenes[0].error, /la planilla no contesta \(2 intentos\)/);
    assert.strictEqual(stockDe('N-013'), 'SI', 'no se tocó');
    googleCaido = false;
    // Chiara (en vivo) ve el cambio de STOCK en la misma vuelta: la caché se invalidó.
    modo('vivo');
    hojas.LISTA[5][21] = 'NO';
    await sheets.leerTodo();
    ordenes = [orden({ pestana: 'LISTA', fila_id: 'N-005', modelo: 'iPhone 15', capacidad: '128GB', condicion: 'usado', valor: false })];
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:02')));
    assert.ok(!(await sheets.leerTodo()).lista.some((f) => f.id === 'N-005'), 'el 15 con NO ya no se ofrece');
    modo('apagado');
  });

  await check('el espejo: con el stock de la app apagado la copia va sin `stock`; prendido, SÍ = true, NO = false, vacía = null', async () => {
    planillaNueva();
    modo('apagado');
    pedidosSupabase.length = 0;
    await silencio(() => espejo.copiar(AR('2026-10-08')));
    let copia = pedidosSupabase.find((p) => p.tabla === 'precios_cotizador' && p.metodo === 'POST');
    assert.ok(copia && copia.body.every((f) => !('stock' in f)), 'apagado: sin la columna');
    modo('sombra');
    pedidosSupabase.length = 0;
    await silencio(() => espejo.copiar(AR('2026-10-08')));
    copia = pedidosSupabase.find((p) => p.tabla === 'precios_cotizador' && p.metodo === 'POST');
    const f = (id) => copia.body.find((x) => x.fila_id === id);
    assert.strictEqual(f('N-004').stock, false);
    assert.strictEqual(f('N-005').stock, true, '"SÍ" con tilde');
    assert.strictEqual(f('N-001').stock, null);
    assert.deepStrictEqual(espejo.aFilas('LISTA', listaDeHoy()).map((x) => x.stock), [null, false, true, null, null, null, null, null]);
    // Una pestaña sin filas cotizables: no se guarda una copia a medias.
    hojas['LISTA 85-93'] = hojas['LISTA 85-93'].map((f, i) => (i > 3 ? f.map((c, j) => (j === 19 ? 'NO' : c)) : f));
    espejo._reiniciar();
    pedidosSupabase.length = 0;
    const r = await silencio(() => espejo.copiar(AR('2026-10-08')));
    assert.deepStrictEqual([r.guardo, r.motivo], [false, 'la pestaña LISTA 85-93 no tiene filas para copiar']);
    assert.strictEqual(pedidosSupabase.filter((p) => p.metodo === 'POST').length, 0);
    modo('apagado');
  });

  // ------------------------------------------------------------ 6. el cerebro en vivo
  const cerebro = require('../src/cerebro');
  const state = require('../src/state');
  const CHAT = '5492990000111@s.whatsapp.net';
  const pensar = (mensaje, ahora = AR('2026-10-08')) => cerebro.pensar({ chatId: CHAT, mensaje, nombre: 'Lucia', ahora });
  const nuevoChat = () => {
    state.reiniciar(CHAT);
    state.obtener(CHAT);
  };

  await check('vivo: buscar_equipos dice `donde`, los del local primero y la frase del depósito; STOCK = NO no aparece', async () => {
    planillaNueva();
    modo('vivo');
    vista = [equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000, { color: 'Azul' })];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
    guion([usar('buscar_equipos', { modelo: '15 pro' })], responde(['sii, tengo el 15 pro de 128 en $870.000']));
    let r = await silencio(() => pensar('tenes el 15 pro?'));
    assert.strictEqual(r.escalar, false, r.motivo);
    let res = resultadoDe('buscar_equipos');
    assert.deepStrictEqual(res.equipos.map((e) => [e.modelo, e.capacidad_gb, e.donde, e.precio_contado]), [
      ['iPhone 15 Pro', 128, 'local', 870000],
      ['iPhone 15 Pro', 128, 'deposito', 920000],
      ['iPhone 15 Pro', 256, 'deposito', 990000],
    ]);
    assert.strictEqual(res.equipos[0].unidad_puntual, true);
    assert.strictEqual(res.frase_deposito, 'te lo puedo tener para mañana o pasado');
    assert.match(res.nota, /Local primero/);
    // El 14 Pro tiene STOCK = NO: no hay, y vienen los parecidos (como un modelo que no está).
    guion([usar('buscar_equipos', { modelo: '14 pro' })], escala('no hay 14 pro'));
    await silencio(() => pensar('y el 14 pro?'));
    res = resultadoDe('buscar_equipos');
    assert.deepStrictEqual(res.equipos, []);
    assert.ok(res.parecidos && res.parecidos.length, 'sin parecidos');
    // Un modelo que está solo en el depósito: la nota lo dice, y un viernes el día es "el lunes".
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['sii, el 13 de 128 al 100% en $495.000', '[deposito]']));
    r = await silencio(() => pensar('tenes el 13?', AR('2026-10-09')));
    res = resultadoDe('buscar_equipos');
    assert.deepStrictEqual(res.equipos.map((e) => e.donde), ['deposito']);
    assert.match(res.nota, /no está en el local/);
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.mensajes, ['sii, el 13 de 128 al 100% en $495.000', 'si me bancás 10 minutos te confirmo bien para cuándo lo puedo tener']);
    // [deposito] adentro de un mensaje también.
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['sii, el 13 lo tengo! [deposito]. sale $495.000 de contado']));
    r = await silencio(() => pensar('tenes el 13?'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.strictEqual(r.mensajes[0], 'sii, el 13 lo tengo! te lo puedo tener para mañana o pasado. sale $495.000 de contado');
    // Lo que va al estado y a Sonnet: la línea del pedido dice que el stock es del local y del depósito.
    assert.match(pedidosSonnet[0].body.messages[0].content[0].text, /Stock: del local y del depósito/);
    assert.match(pedidosSonnet[0].body.system[0].text, /# El local y el depósito/);
    // Con #bateria 85-93, los de al 100% (`al_100`) también son del depósito: traen `donde` y habilitan [deposito].
    sheets.usarListaBateria('85-93');
    vista = [];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['tengo el 13 en 85-93% $450.000, sino al 100% en $495.000, [deposito]']));
    r = await silencio(() => pensar('tenes el 13?'));
    res = resultadoDe('buscar_equipos');
    assert.deepStrictEqual(res.equipos.map((e) => [e.donde, e.precio_contado]), [['deposito', 450000]]);
    assert.deepStrictEqual(res.al_100.map((e) => [e.donde, e.precio_contado]), [['deposito', 495000]]);
    assert.ok(res.frase_deposito);
    assert.strictEqual(r.escalar, false, r.motivo);
    sheets.usarListaBateria(null);
    modo('apagado');
  });

  await check('vivo, la guardia: el depósito por su cuenta, [deposito] sin equipo, TechSur, el proveedor y "por encargo" no salen', async () => {
    planillaNueva();
    modo('vivo');
    nuevoChat();
    const frena = async (mensajes, re, { conBusqueda = true } = {}) => {
      // Sin la vuelta de corrección: la segunda vez vuelve a decir lo mismo y escala.
      const pasosDe = conBusqueda ? [[usar('buscar_equipos', { modelo: '13' })], responde(mensajes), responde(mensajes)] : [responde(mensajes), responde(mensajes)];
      guion(...pasosDe);
      const r = await silencio(() => pensar('tenes el 13?'));
      assert.strictEqual(r.escalar, true, 'no frenó: ' + JSON.stringify(r.mensajes));
      assert.match(r.motivo, re);
      assert.match(r.motivo, /^guardia:/);
    };
    await frena(['sii, lo tengo en el deposito, te lo tengo mañana'], /ofrece del depósito por su cuenta/);
    await frena(['sii, lo tengo en el depósito'], /ofrece del depósito por su cuenta/);
    await frena(['es del deposito, llega al depósito el lunes'], /ofrece del depósito por su cuenta/);
    await frena(['sii, [deposito]'], /\[deposito\] sin que buscar_equipos/, { conBusqueda: false });
    // Los 300 caracteres se miden con la frase ya puesta.
    await frena(['[deposito] ' + 'x'.repeat(270)], /caracteres/);
    await frena(['lo pido a techsur y mañana lo tenés'], /nombra algo interno: "techsur"/);
    await frena(['lo pido a tech sur y mañana lo tenés'], /nombra algo interno: "tech sur"/);
    await frena(['se lo pido al proveedor'], /nombra algo interno: "proveedor"/);
    await frena(['lo traigo por encargo'], /nombra algo interno: "por encargo"/);
    await frena(['lo traigo a pedido'], /nombra algo interno: "a pedido"/);
    // Lo que sí pasa: un mensaje con [deposito] y un equipo del depósito en la respuesta; y "el depósito" de una
    // transferencia ("haceme el depósito") no es nuestro depósito.
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['dale, [deposito]', 'haceme el deposito y me pasas el comprobante']));
    const r = await silencio(() => pensar('tenes el 13?'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.strictEqual(r.mensajes[0], 'dale, te lo puedo tener para mañana o pasado');
    assert.strictEqual(r.mensajes[1], 'haceme el deposito y me pasas el comprobante');
    // En apagado y sombra NADA de esto frena: la guardia es exactamente la de main.
    for (const m of ['apagado', 'sombra']) {
      modo(m);
      for (const texto of ['lo tengo en el deposito', 'se lo pido a techsur', 'se lo pido al proveedor', 'lo traigo por encargo', 'lo traigo a pedido']) {
        guion(responde([texto]));
        const sinFreno = await silencio(() => pensar('hola'));
        assert.strictEqual(sinFreno.escalar, false, `${m}: "${texto}" frenó (${sinFreno.motivo})`);
        assert.deepStrictEqual(sinFreno.mensajes, [texto]);
      }
    }
    assert.strictEqual(cerebro.nombraAlgoInterno('te lo encargo a tech sur'), null);
    assert.strictEqual(cerebro.nombraAlgoInterno('te lo encargo a tech sur', { stockVivo: true }), 'tech sur');
    assert.strictEqual(cerebro.nombraAlgoInterno('lo traemos por encargo', { stockVivo: true }), 'por encargo');
    assert.strictEqual(cerebro.nombraAlgoInterno('el escalón de la entrada', { stockVivo: true }), null);
    assert.strictEqual(cerebro.nombraAlgoInterno('lo consulto con el sistema'), 'el sistema');
    assert.strictEqual(cerebro.nombraElDeposito('[deposito]'), false);
    assert.strictEqual(cerebro.nombraElDeposito('en el depósito [deposito]'), true);
    assert.strictEqual(cerebro.nombraElDeposito('haceme el depósito al alias'), false);
    assert.strictEqual(cerebro.nombraElDeposito('te lo traigo del deposito'), true);
    modo('apagado');
  });

  await check('vivo: una unidad del local sin entrega mínima se vende solo de contado (cotizar lo dice; con la plata entera, de contado)', async () => {
    planillaNueva();
    modo('vivo');
    vista = [equipo('12-64-001', 'iPhone 12', '64GB', '90%', 380000, { precio_de: 'a mano' })];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
    guion([usar('buscar_equipos', { modelo: '12' })], escala('pide cuotas para un equipo solo de contado'));
    await silencio(() => pensar('tenes el 12? tengo 300'));
    let res = resultadoDe('buscar_equipos');
    assert.deepStrictEqual(res.equipos.map((e) => [e.donde, e.solo_contado, e.entrega_minima]), [['local', true, null]]);
    guion([usar('cotizar', { modelo: '12', entrega: 300000, entrega_texto: 'tengo 300' })], escala('pide cuotas para un equipo solo de contado'));
    await silencio(() => pensar('tengo 300 para el 12'));
    res = resultadoDe('cotizar');
    assert.deepStrictEqual([res.llega, res.solo_contado, res.precio_contado], [false, true, 380000]);
    assert.match(res.nota, /solo de contado/);
    guion([usar('cotizar', { modelo: '12', entrega: 380000, entrega_texto: 'tengo 380' })], responde(['con eso lo pagas de contado, $380.000']));
    const r = await silencio(() => pensar('tengo 380 para el 12'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.strictEqual(resultadoDe('cotizar').paga_de_contado, true);
    modo('apagado');
  });

  await check('vivo: con entrega, cotizar se saltea la unidad solo de contado si otra del modelo se financia (el 13 al 77 % y al 100 %, 08/10)', async () => {
    // Prueba en vivo del 08/10: "el 13 con 450 mil?" agarraba el 13 al 77 % (el más barato, precio a mano, sin
    // entrega mínima) y escalaba. Decisión de Tomás: con la entrega dicha, la más barata que se financia.
    planillaNueva();
    modo('vivo');
    vista = [
      equipo('13-128-013', 'iPhone 13', '128GB', '77%', 440000, { precio_de: 'a mano' }),
      equipo('13-128-028', 'iPhone 13', '128GB', '100%', 495000, { precio_de: 'LISTA' }),
    ];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
    guion([usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'el 13 con 400 mil?' })], responde(['el 13 de 128gb al 100%, con los $400.000 de entrega te queda asi', '[cotizacion]']));
    const r = await silencio(() => pensar('el 13 con 400 mil?'));
    const res = resultadoDe('cotizar');
    assert.strictEqual(res.solo_contado, undefined, JSON.stringify(res));
    assert.deepStrictEqual([res.llega, res.bateria, res.entrega], [true, '100%', 400000]);
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.ok(r.mensajes.some((m) => /^iPhone 13 128GB 100% 📱/.test(m) && /1 cuota de \$/.test(m)), JSON.stringify(r.mensajes));
    // Con solo el 77 % en el local, la que se financia es la fila del 13 de LISTA (el depósito): esa.
    vista = [equipo('13-128-013', 'iPhone 13', '128GB', '77%', 440000, { precio_de: 'a mano' })];
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:05')));
    nuevoChat();
    guion([usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'el 13 con 400 mil?' })], responde(['el 13 de 128gb al 100%, con los $400.000 de entrega te queda asi', '[cotizacion]']));
    const r2 = await silencio(() => pensar('el 13 con 400 mil?'));
    const delDeposito = resultadoDe('cotizar');
    assert.deepStrictEqual([delDeposito.llega, delDeposito.bateria, delDeposito.solo_contado], [true, '100%', undefined], JSON.stringify(delDeposito));
    assert.strictEqual(r2.escalar, false, r2.motivo);
    // Si todas las del modelo son solo de contado, como antes: lo cubre el test de arriba con el 12.
    modo('apagado');
  });

  await check('vivo: al escalar, el 🔕 lleva el código del equipo del local, o "DEPÓSITO <modelo capacidad>"', async () => {
    planillaNueva();
    modo('vivo');
    vista = [equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000), equipo('15P-128-002', 'iPhone 15 Pro', '128GB', '91%', 880000)];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    const contestar = async (mensaje) => (await silencio(() => cerebro.contestar({ chatId: CHAT, mensaje, nombre: 'Lucia', ahora: AR('2026-10-08') }))).resultado;
    // Del local, con dos unidades: los dos códigos.
    nuevoChat();
    guion([usar('cotizar', { modelo: '15 pro', entrega: 600000, entrega_texto: 'tengo 600' })], escala('dijo día y hora: jueves a las 18'));
    let r = await contestar('el 15 pro, tengo 600, paso el jueves a las 18');
    assert.strictEqual(r.escalar, true);
    assert.strictEqual(r.paraElGrupo, 'Equipo: 15P-128-001 / 15P-128-002');
    // Sin herramientas en esta respuesta: el modelo del estado (el de la cotización anterior).
    guion(escala('dijo día y hora'));
    r = await contestar('el jueves a las 18 entonces');
    assert.strictEqual(r.paraElGrupo, 'Equipo: 15P-128-001 / 15P-128-002');
    // Del depósito.
    nuevoChat();
    guion([usar('buscar_equipos', { modelo: '13' })], escala('dijo día y hora'));
    r = await contestar('el 13, paso mañana a las 10');
    assert.strictEqual(r.paraElGrupo, 'Equipo: DEPÓSITO iPhone 13 128GB');
    // Sin modelo, nada; y en apagado o sombra, nada.
    nuevoChat();
    guion(escala('postventa'));
    r = await contestar('hola, tengo un problema con el que compré');
    assert.strictEqual(r.paraElGrupo, undefined);
    state.actualizar(CHAT, { modelo: 'iPhone 15 Pro', capacidad_gb: 128 });
    for (const m of ['apagado', 'sombra']) {
      modo(m);
      guion(escala('dijo día y hora'));
      r = await contestar('el jueves a las 18');
      assert.strictEqual(r.paraElGrupo, undefined, m);
    }
    modo('apagado');
  });

  // ------------------------------------------------------------ 7. sombra = apagado para Chiara
  await check('sombra: el pedido a Sonnet (reglas, contexto, herramientas) y lo que contesta son idénticos a apagado; vivo, no', async () => {
    planillaNueva();
    const correr = async (m) => {
      modo(m);
      nuevoChat();
      guion([usar('buscar_equipos', { modelo: '14' })], responde(['sii, tengo el 14 de 128 en $430.000 y en $540.000']));
      const r = await silencio(() => pensar('tenes el 14?'));
      return { r, cuerpos: pedidosSonnet.map((p) => p.body) };
    };
    const apagado = await correr('apagado');
    const sombra = await correr('sombra');
    // Los ids de las herramientas los inventa la API de mentira: no cuentan.
    const sinIds = (x) => JSON.parse(JSON.stringify(x).replace(/toolu_\d+/g, 'toolu_N'));
    assert.deepStrictEqual(sinIds(sombra.cuerpos), sinIds(apagado.cuerpos), 'el pedido cambió con sombra');
    assert.deepStrictEqual(sombra.r.mensajes, apagado.r.mensajes);
    assert.strictEqual(apagado.cuerpos[0].system[0].text, cerebro.REGLAS);
    assert.ok(!apagado.cuerpos[0].messages[0].content[0].text.includes('depósito'));
    const resultadoEn = (cuerpo) => JSON.parse(cuerpo.messages.flatMap((m) => (Array.isArray(m.content) ? m.content : [])).find((c) => c.type === 'tool_result').content);
    assert.deepStrictEqual(Object.keys(resultadoEn(apagado.cuerpos[1])), ['equipos']);
    assert.strictEqual(resultadoEn(apagado.cuerpos[1]).equipos[0].donde, undefined);
    const vivo = await correr('vivo');
    assert.notDeepStrictEqual(vivo.cuerpos[0].system[0].text, apagado.cuerpos[0].system[0].text);
    assert.ok(vivo.cuerpos[0].system[0].text.startsWith(cerebro.REGLAS.replace(/\s+$/, '')));
    assert.strictEqual(resultadoEn(vivo.cuerpos[1]).equipos[0].donde, 'local');
    modo('apagado');
  });

  // ------------------------------------------------------------ 8. lo que pasó hoy: empezó y dejó de ofrecer
  const noticias = [];
  stockApp.alCambiarLaOferta((n) => noticias.push(n));
  const RUTA_OFRECE = path.join(TMP, 'stock-ofrece.json');
  // Un arranque de cero: sin la lista en disco, sin noticias anotadas.
  const deCero = (m = 'vivo') => {
    planillaNueva();
    fs.rmSync(RUTA_OFRECE, { force: true });
    modo(m);
    noticias.length = 0;
  };
  const A = equipo('15P-256-001', 'iPhone 15 Pro', '256GB', '92%', 870000);
  const B = equipo('12-64-001', 'iPhone 12', '64GB', '90%', 380000, { precio_de: 'a mano' });
  const C = equipo('16-128-001', 'iPhone 16', '128GB', 'SELLADO', 1450000, { precio_de: 'a mano' });
  const DICHO = {
    A: 'iPhone 15 Pro 256GB 92% · $870.000 · 15P-256-001',
    B: 'iPhone 12 64GB 90% · $380.000 · 12-64-001',
    C: 'iPhone 16 128GB sellado · $1.450.000 · 16-128-001',
  };
  const vueltaA = (hora) => silencio(() => stockApp.vuelta(AR('2026-10-08', hora)));

  await check('lo que pasó hoy: la primera vuelta es la base; un código nuevo "empezó a ofrecer", uno que ya no está "dejó de ofrecer"; un cambio de precio, nada', async () => {
    deCero();
    vista = [A, B];
    await vueltaA('10:00');
    assert.deepStrictEqual(noticias, [], 'la primera vuelta es la base');
    vista = [A, B, C];
    await vueltaA('10:01');
    assert.deepStrictEqual(noticias, [{ tipo: 'empezo_a_ofrecer', en: AR('2026-10-08', '10:01'), codigo: '16-128-001', detalle: DICHO.C }]);
    noticias.length = 0;
    vista = [{ ...A, precio: 850000 }, C];
    await vueltaA('10:02');
    assert.deepStrictEqual(noticias, [{ tipo: 'dejo_de_ofrecer', en: AR('2026-10-08', '10:02'), codigo: '12-64-001', detalle: DICHO.B }], 'el 15 Pro cambió de precio: no es noticia');
    noticias.length = 0;
    await vueltaA('10:03');
    assert.deepStrictEqual(noticias, [], 'sin cambios, nada');
    // Cuando sale, se dice con el último precio con que se ofrecía.
    vista = [C];
    await vueltaA('10:04');
    assert.deepStrictEqual(noticias.map((n) => [n.tipo, n.detalle]), [['dejo_de_ofrecer', 'iPhone 15 Pro 256GB 92% · $850.000 · 15P-256-001']]);
    assert.ok(noticias.every((n) => !/vendid|reparaci|sin precio|apagad/i.test(n.detalle)), 'no adivina por qué');
    modo('apagado');
  });

  await check('lo que pasó hoy: la lista queda en disco; reiniciar sin cambios no anota nada, lo que cambió en el medio sí; un archivo ilegible, la base', async () => {
    deCero();
    vista = [A, B];
    await vueltaA('10:00');
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(RUTA_OFRECE, 'utf8')).equipos).sort(), ['12-64-001', '15P-256-001']);
    modo('vivo'); // _reiniciar: lo de memoria se pierde, como en un reinicio
    await vueltaA('10:05');
    assert.deepStrictEqual(noticias, [], 'reinicio sin cambios');
    assert.strictEqual(JSON.parse(fs.readFileSync(RUTA_OFRECE, 'utf8')).en, new Date(AR('2026-10-08', '10:00')).toISOString(), 'sin cambios no reescribe el archivo');
    modo('vivo');
    vista = [A];
    await vueltaA('10:10');
    assert.deepStrictEqual(noticias.map((n) => [n.tipo, n.codigo]), [['dejo_de_ofrecer', '12-64-001']], 'lo que cambió mientras reiniciaba');
    // Un archivo que no se puede leer o que no tiene la forma (una lista en vez de código → equipo): la base.
    for (const roto of ['{ roto', JSON.stringify({ v: 1, equipos: ['15P-256-001'] })]) {
      noticias.length = 0;
      fs.writeFileSync(RUTA_OFRECE, roto);
      modo('vivo');
      vista = [A, C];
      await vueltaA('10:15');
      assert.deepStrictEqual(noticias, [], `sin poder leer la lista, la primera vuelta es la base: ${roto}`);
      assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(RUTA_OFRECE, 'utf8')).equipos).sort(), ['15P-256-001', '16-128-001'], 'la vuelve a escribir');
      vista = [A];
      await vueltaA('10:16');
      assert.deepStrictEqual(noticias.map((n) => [n.tipo, n.codigo]), [['dejo_de_ofrecer', '16-128-001']]);
    }
    modo('apagado');
  });

  await check('lo que pasó hoy: si la lista no se pudo guardar, se vuelve a intentar en la vuelta siguiente, sin repetir la noticia', async () => {
    deCero();
    vista = [A, B];
    await vueltaA('10:00');
    fs.mkdirSync(RUTA_OFRECE + '.tmp'); // writeFileSync del temporal falla (es una carpeta)
    try {
      vista = [A, B, C];
      await vueltaA('10:01');
      assert.deepStrictEqual(noticias.map((n) => [n.tipo, n.codigo]), [['empezo_a_ofrecer', '16-128-001']]);
      assert.strictEqual(stockApp.resumen().ultimoError.paso, 'lo que ofrece');
      assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(RUTA_OFRECE, 'utf8')).equipos).sort(), ['12-64-001', '15P-256-001'], 'quedó la de antes');
    } finally {
      fs.rmSync(RUTA_OFRECE + '.tmp', { recursive: true, force: true });
    }
    noticias.length = 0;
    await vueltaA('10:02');
    assert.deepStrictEqual(noticias, [], 'no repite la noticia');
    assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(RUTA_OFRECE, 'utf8')).equipos).sort(), ['12-64-001', '15P-256-001', '16-128-001'], 'la guardó en la vuelta siguiente');
    modo('vivo');
    await vueltaA('10:03');
    assert.deepStrictEqual(noticias, [], 'un reinicio después tampoco la repite');
    modo('apagado');
  });

  await check('lo que pasó hoy: la vista que falla o viene vacía no es "dejó de ofrecer"; recién a la tercera vuelta vacía, cuando se vacía USADOS', async () => {
    deCero();
    vista = [A, B];
    await vueltaA('10:00');
    supabase.caido = true;
    await vueltaA('10:01');
    supabase.caido = false;
    supabase.vistaRota = true;
    await vueltaA('10:02');
    supabase.vistaRota = false;
    // La vista dice que el 12 ya no está, pero USADOS no se pudo escribir: Chiara lo sigue ofreciendo.
    vista = [A];
    googleCaido = true;
    await vueltaA('10:03');
    googleCaido = false;
    assert.deepStrictEqual(noticias, [], 'Supabase caído, la vista rota o USADOS sin escribir');
    vista = [];
    await vueltaA('10:04');
    await vueltaA('10:05');
    assert.deepStrictEqual(noticias, [], 'primera y segunda vuelta vacías');
    assert.strictEqual(hojas.USADOS[3][0], '15P-256-001', 'USADOS sigue con lo de antes');
    await vueltaA('10:06');
    assert.deepStrictEqual(hojas.USADOS[3].slice(0, 8), ['', '', '', '', '', '', '', ''], 'a la tercera se vació USADOS');
    assert.deepStrictEqual(noticias.map((n) => [n.tipo, n.codigo]), [['dejo_de_ofrecer', '15P-256-001'], ['dejo_de_ofrecer', '12-64-001']]);
    modo('apagado');
  });

  await check('lo que pasó hoy: con USADOS vaciado a mano, una vista vacía tampoco es "dejó de ofrecer" (no hay nada que escribir, pero la regla es la misma)', async () => {
    deCero();
    vista = [A, B];
    await vueltaA('10:00');
    hojas.USADOS = usadosDeHoy().map((f, i) => (i >= 3 ? filaUsados(i + 1, Array(11).fill('')) : f));
    vista = [];
    const r = await vueltaA('10:01');
    assert.deepStrictEqual([r.usados.escribio, r.usados.esperandoVacia], [false, undefined], 'USADOS ya estaba vacío: no espera');
    assert.deepStrictEqual(noticias, []);
    vista = [A, B];
    await vueltaA('10:02');
    assert.deepStrictEqual(noticias, [], 'vuelve lo mismo: ni "dejó" ni "empezó"');
    modo('apagado');
  });

  await check('lo que pasó hoy: más de 15 cambios en una vuelta, un solo evento resumen (uno por tipo si entran y salen); 15, uno por equipo', async () => {
    deCero();
    const catorce = (n, desde = 1) => Array.from({ length: n }, (_, i) => equipo(`14-128-${String(desde + i).padStart(3, '0')}`, 'iPhone 14', '128GB', '90%', 500000));
    vista = [A];
    await vueltaA('10:00');
    vista = [A, ...catorce(18)];
    await vueltaA('10:01');
    assert.deepStrictEqual(noticias, [{ tipo: 'empezo_a_ofrecer', en: AR('2026-10-08', '10:01'), codigo: null, detalle: '18 equipos' }]);
    noticias.length = 0;
    vista = [A, ...catorce(3)];
    await vueltaA('10:02');
    assert.strictEqual(noticias.length, 15, 'justo 15: uno por equipo');
    assert.ok(noticias.every((n) => n.tipo === 'dejo_de_ofrecer' && n.codigo && n.detalle === `iPhone 14 128GB 90% · $500.000 · ${n.codigo}`));
    noticias.length = 0;
    vista = [A, ...catorce(14, 101)];
    await vueltaA('10:03');
    assert.deepStrictEqual(
      noticias.map((n) => [n.tipo, n.codigo, n.detalle]),
      [
        ['empezo_a_ofrecer', null, '14 equipos'],
        ['dejo_de_ofrecer', null, '3 equipos'],
      ]
    );
    modo('apagado');
  });

  await check('lo que pasó hoy: en sombra y apagado no anota nada ni guarda la lista (Chiara no ofrece desde la app)', async () => {
    deCero('sombra');
    vista = [A, B];
    await vueltaA('10:00');
    vista = [A, C];
    const r = await vueltaA('10:01');
    assert.strictEqual(r.usados.escribio, true, 'la sombra escribió USADOS APP');
    assert.deepStrictEqual(noticias, []);
    assert.ok(!fs.existsSync(RUTA_OFRECE), 'guardó la lista en sombra');
    modo('apagado');
    assert.strictEqual(await vueltaA('10:02'), null);
    assert.deepStrictEqual(noticias, []);
    assert.ok(!fs.existsSync(RUTA_OFRECE));
  });

  await check('lo que pasó hoy: un oyente que tira no frena la vuelta ni a los demás', async () => {
    deCero();
    const sacar = stockApp.alCambiarLaOferta(() => {
      throw new Error('de mentira');
    });
    try {
      vista = [A];
      await vueltaA('10:00');
      vista = [A, B];
      const r = await vueltaA('10:01');
      assert.strictEqual(r.usados.escribio, true);
      assert.strictEqual(stockApp.resumen().ultimoError, null);
      assert.deepStrictEqual(noticias.map((n) => n.codigo), ['12-64-001']);
    } finally {
      sacar();
    }
    modo('apagado');
  });

  // ------------------------------------------------------------ 9. la lista del local (08/10/2026, …3557)
  // Decisión de Tomás del 08/10 (20:30): primero se liquida nuestro stock. Con el stock de la app en vivo, `lista_de_precios`
  // (y `[lista]`) es lo del local, sin repetir; lo del depósito (LISTA) entra solo por buscar_equipos. Sin nada en el
  // local, la lista de siempre. En apagado y sombra, todo como hoy. Y "nuestro stock" no se le dice al cliente.
  const listaDelDeposito = () => [...titulo, CAB_LISTA, filaLista('N-020', 'iPhone 16 Pro', 128, 'Usado', 100, 1250000, 750000), filaLista('N-009', 'iPhone 17', 128, 'Sellado', '', 1600000, 920000)];
  // Las unidades del local, desordenadas a propósito: la lista sale por modelo, capacidad y precio.
  const DEL_LOCAL = [
    equipo('14P-128-001', 'iPhone 14 Pro', '128GB', '100%', 835000, { precio_de: 'LISTA' }),
    equipo('13-128-004', 'iPhone 13', '128GB', '100%', 535000, { precio_de: 'LISTA' }),
    equipo('11-128-001', 'iPhone 11', '128GB', '77%', 210000, { precio_de: 'a mano' }),
    equipo('13-128-001', 'iPhone 13', '128GB', '77%', 480000),
    equipo('14P-128-002', 'iPhone 14 Pro', '128GB', '100%', 835000, { precio_de: 'LISTA' }),
    equipo('13-128-002', 'iPhone 13', '128GB', '77%', 480000),
    equipo('11-64-001', 'iPhone 11', '64GB', '75%', 190000, { precio_de: 'a mano' }),
    equipo('13-128-005', 'iPhone 13', '128GB', '100%', 535000, { precio_de: 'LISTA' }),
    equipo('13-128-003', 'iPhone 13', '128GB', '77%', 480000),
    equipo('14P-128-003', 'iPhone 14 Pro', '128GB', '100%', 835000, { precio_de: 'LISTA' }),
  ];
  const LISTA_DEL_LOCAL = ['Ip 11 64gb 75% 190.000', 'Ip 11 128gb 77% 210.000', 'Ip 13 128gb 77% 480.000', 'Ip 13 128gb 100% 535.000', 'Ip 14 Pro 128gb 100% 835.000'].join('\n');
  async function conElLocal(unidades, m = 'vivo') {
    planillaNueva();
    hojas.LISTA = listaDelDeposito();
    modo(m);
    vista = unidades;
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
  }
  const pideLaLista = (mensajes = ['[lista]', 'contame que modelo te interesa']) => guion([usar('lista_de_precios', {})], responde(mensajes), responde(mensajes));

  await check('vivo, la lista del local (…3557): "a que precio estan?" → [lista] con los equipos del local sin repetir, en un mensaje; nada de LISTA; la guardia no la frena', async () => {
    await conElLocal(DEL_LOCAL);
    pideLaLista();
    const r = await silencio(() => pensar('a que precio estan?'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.mensajes, [LISTA_DEL_LOCAL, 'contame que modelo te interesa']);
    const res = resultadoDe('lista_de_precios');
    assert.deepStrictEqual([res.usados, res.sellados], [LISTA_DEL_LOCAL, '']);
    assert.match(res.nota, /del local/);
    assert.ok(!/16 Pro|Ip 17|1\.250\.000|1\.600\.000/.test(JSON.stringify(res)), 'la lista trae algo de LISTA: ' + JSON.stringify(res));
    // La guardia anota los precios del local: escribir uno pasa; uno de LISTA (el depósito) no salió de esta lista.
    pideLaLista(['[lista]', 'el 13 al 100% esta $535.000']);
    let otra = await silencio(() => pensar('a que precio estan?'));
    assert.strictEqual(otra.escalar, false, otra.motivo);
    pideLaLista(['[lista]', 'el 17 sellado esta $1.600.000']);
    otra = await silencio(() => pensar('a que precio estan?'));
    assert.strictEqual(otra.escalar, true);
    assert.match(otra.motivo, /monto que no salió de ninguna herramienta: \$1\.600\.000/);
    modo('apagado');
  });

  await check('vivo: un sellado del local va en un segundo mensaje ("Ip 16 128gb sellado 1.450.000")', async () => {
    await conElLocal([...DEL_LOCAL, equipo('16-128-001', 'iPhone 16', '128GB', 'SELLADO', 1450000, { precio_de: 'a mano' })]);
    pideLaLista();
    const r = await silencio(() => pensar('a que precio estan?'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.mensajes, [LISTA_DEL_LOCAL, 'Ip 16 128gb sellado 1.450.000', 'contame que modelo te interesa']);
    modo('apagado');
  });

  await check('vivo, el orden: del 11 al 18 y en cada número común, Plus, Pro y Pro Max (el "e" antes del común); después la capacidad, el precio y, a igual precio, la batería', async () => {
    await conElLocal([
      equipo('16-128-001', 'iPhone 16', '128GB', '92%', 1000000, { precio_de: 'a mano' }),
      equipo('16-128-002', 'iPhone 16', '128GB', '89%', 1000000, { precio_de: 'a mano' }),
      equipo('16E-128-001', 'iPhone 16e', '128GB', '100%', 800000, { precio_de: 'a mano' }),
      equipo('15PM-256-001', 'iPhone 15 Pro Max', '256GB', '90%', 990000, { precio_de: 'a mano' }),
      equipo('15-256-001', 'iPhone 15', '256GB', '90%', 640000, { precio_de: 'a mano' }),
      equipo('14P-128-001', 'iPhone 14 Pro', '128GB', '100%', 835000, { precio_de: 'a mano' }),
      equipo('15PL-128-001', 'iPhone 15 Plus', '128GB', '90%', 720000, { precio_de: 'a mano' }),
      equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '90%', 850000, { precio_de: 'a mano' }),
      equipo('15-128-001', 'iPhone 15', '128GB', '88%', 690000, { precio_de: 'a mano' }),
      equipo('15-128-002', 'iPhone 15', '128GB', '95%', 650000, { precio_de: 'a mano' }),
      equipo('12-64-001', 'iPhone 12', '64GB', '90%', 380000, { precio_de: 'a mano' }),
    ]);
    pideLaLista();
    await silencio(() => pensar('a que precio estan?'));
    assert.deepStrictEqual(resultadoDe('lista_de_precios').usados.split('\n'), [
      'Ip 12 64gb 90% 380.000',
      'Ip 14 Pro 128gb 100% 835.000',
      'Ip 15 128gb 95% 650.000',
      'Ip 15 128gb 88% 690.000',
      'Ip 15 256gb 90% 640.000',
      'Ip 15 Plus 128gb 90% 720.000',
      'Ip 15 Pro 128gb 90% 850.000',
      'Ip 15 Pro Max 256gb 90% 990.000',
      'Ip 16e 128gb 100% 800.000',
      'Ip 16 128gb 89% 1.000.000',
      'Ip 16 128gb 92% 1.000.000',
    ]);
    modo('apagado');
  });

  await check('vivo sin nada en el local (la vista vacía): la lista de siempre (LISTA), y sus precios pasan la guardia', async () => {
    await conElLocal(DEL_LOCAL);
    vista = [];
    for (const hora of ['12:01', '12:02', '12:03']) await silencio(() => stockApp.vuelta(AR('2026-10-08', hora)));
    const datos = await sheets.leerTodo();
    assert.deepStrictEqual(datos.usados, [], 'USADOS no se vació');
    pideLaLista(['[lista]', 'el 16 pro esta $1.250.000']);
    const r = await silencio(() => pensar('a que precio estan?'));
    assert.strictEqual(r.escalar, false, r.motivo);
    const res = resultadoDe('lista_de_precios');
    assert.deepStrictEqual(res, require('../src/responder').listaDePreciosPartida(datos));
    assert.deepStrictEqual([res.usados, res.sellados], ['Ip 16 Pro 128gb 100% 1.250.000', 'Ip 17 128gb sellado 1.600.000']);
    assert.deepStrictEqual(r.mensajes, ['Ip 16 Pro 128gb 100% 1.250.000', 'Ip 17 128gb sellado 1.600.000', 'el 16 pro esta $1.250.000']);
    modo('apagado');
  });

  await check('apagado y sombra: la lista de hoy (LISTA) tal cual, con el local cargado; en sombra el pedido y lo que contesta son idénticos a apagado', async () => {
    const correr = async (m) => {
      await conElLocal(DEL_LOCAL, m);
      pideLaLista();
      const r = await silencio(() => pensar('a que precio estan?'));
      const datos = await sheets.leerTodo();
      return { r, res: resultadoDe('lista_de_precios'), hoy: require('../src/responder').listaDePreciosPartida(datos), cuerpos: pedidosSonnet.map((p) => p.body) };
    };
    const apagado = await correr('apagado');
    const sombra = await correr('sombra');
    for (const [nombre, x] of [['apagado', apagado], ['sombra', sombra]]) {
      assert.deepStrictEqual(x.res, x.hoy, nombre);
      assert.deepStrictEqual(Object.keys(x.res), ['usados', 'sellados'], nombre);
      assert.deepStrictEqual(x.r.mensajes, ['Ip 16 Pro 128gb 100% 1.250.000', 'Ip 17 128gb sellado 1.600.000', 'contame que modelo te interesa'], nombre);
    }
    const sinIds = (x) => JSON.parse(JSON.stringify(x).replace(/toolu_\d+/g, 'toolu_N'));
    assert.deepStrictEqual(sinIds(sombra.cuerpos), sinIds(apagado.cuerpos), 'el pedido cambió con sombra');
    modo('apagado');
  });

  await check('vivo, un equipo citado (…3557): "[responde a: iPhone 13 100%] Hola a qe precio están" → buscar_equipos("13") y el 13 al 100% de $535.000 del local, sin [lista]', async () => {
    await conElLocal(DEL_LOCAL);
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['el 13 de 128gb al 100% lo tenemos en $535.000 de contado']));
    const r = await silencio(() => pensar('[responde a: iPhone 13 100%] Hola a qe precio están'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.mensajes, ['el 13 de 128gb al 100% lo tenemos en $535.000 de contado']);
    assert.ok(/"""\n\[responde a: iPhone 13 100%\] Hola a qe precio están\n"""/.test(pedidosSonnet[0].body.messages[0].content[0].text), 'el pedido no lleva la cita');
    const res = resultadoDe('buscar_equipos');
    const delLocal = res.equipos.filter((e) => e.donde === 'local');
    assert.deepStrictEqual([...new Set(delLocal.map((e) => `${e.bateria} ${e.precio_contado}`))], ['77% 480000', '100% 535000']);
    modo('apagado');
  });

  await check('vivo, "nuestro stock" no se le dice al cliente (la guardia lo frena); en apagado y sombra no frena', async () => {
    planillaNueva();
    modo('vivo');
    nuevoChat();
    for (const texto of ['te paso los precios de nuestro stock', 'eso es stock propio', 'es todo stock nuestro', 'de nuestros stocks tengo el 13', 'mi stock es este']) {
      guion(responde([texto]), responde([texto]));
      const r = await silencio(() => pensar('hola'));
      assert.strictEqual(r.escalar, true, `no frenó: "${texto}"`);
      assert.match(r.motivo, /^guardia: .*nombra algo interno: "(?:nuestros? stocks?|stock propio|stock nuestro|mi stock)"/, texto);
    }
    for (const m of ['apagado', 'sombra']) {
      modo(m);
      guion(responde(['te paso los precios de nuestro stock']));
      const r = await silencio(() => pensar('hola'));
      assert.strictEqual(r.escalar, false, `${m}: frenó (${r.motivo})`);
    }
    // Lo de siempre sigue pasando: "en stock", "sin stock", "el stock del 13".
    for (const texto of ['sii, tenemos en stock el 13', 'el 13 pro sin stock ahora', 'el stock del 13 es de 128', 'lo tengo en stock']) {
      assert.strictEqual(cerebro.nombraAlgoInterno(texto, { stockVivo: true }), null, texto);
    }
    assert.strictEqual(cerebro.nombraAlgoInterno('te paso nuestro stock', { stockVivo: true }), 'nuestro stock');
    assert.strictEqual(cerebro.nombraAlgoInterno('te paso nuestro stock'), null);
    assert.strictEqual(cerebro.nombraAlgoInterno('es nuestro propio stock', { stockVivo: true }), 'nuestro propio stock');
    assert.strictEqual(cerebro.nombraAlgoInterno('el stock de nosotros', { stockVivo: true }), 'stock de nosotros');
    modo('apagado');
  });

  await check('las reglas: en vivo la lista es la del local (lo demás, solo si pide un modelo que no está) con su ejemplo, y "nuestro stock" en lo que no hacés nunca', async () => {
    const deposito = fs.readFileSync(path.join(__dirname, '..', 'src', 'cerebro-reglas-deposito.md'), 'utf8');
    assert.ok(/\*\*La lista de precios es la del local\.\*\*[^\n]*`lista_de_precios`[^\n]*solo los equipos del local[^\n]*`\[lista\]`[^\n]*sellados[^\n]*Lo del depósito no está en la lista: lo ofrecés solo si pide un modelo que no está en la lista/.test(deposito), 'la sección del depósito no dice lo de la lista');
    assert.ok(/\n22\. [^\n]*"a que precio estan\?"[^\n]*`lista_de_precios`[^\n]*`\[lista\]`[^\n]*"contame que modelo te interesa"/.test(deposito), 'falta el ejemplo 22');
    const nunca = cerebro.REGLAS.slice(cerebro.REGLAS.indexOf('# Lo que no hacés nunca'), cerebro.REGLAS.indexOf('# Cómo escribís'));
    assert.ok(/"nuestro stock", "stock propio", "stock nuestro"/.test(nunca), 'Lo que no hacés nunca no dice "nuestro stock"');
  });


  // ------------------------------------------------------------ 8. arreglos de las pruebas en vivo del 12/10
  await check('12/10 depósito: la frase es "te lo puedo tener para mañana o pasado" de lunes a jueves; de viernes a domingo, "si me bancás 10 minutos…"', () => {
    const semana = 'te lo puedo tener para mañana o pasado';
    const finde = 'si me bancás 10 minutos te confirmo bien para cuándo lo puedo tener';
    const esperado = { '2026-10-05': semana, '2026-10-06': semana, '2026-10-07': semana, '2026-10-08': semana, '2026-10-09': finde, '2026-10-10': finde, '2026-10-11': finde };
    for (const [dia, texto] of Object.entries(esperado)) assert.strictEqual(stockApp.fraseDeposito(AR(dia)), texto, dia);
    // Jueves 23:30 de Argentina (viernes en UTC): sigue siendo jueves.
    assert.strictEqual(stockApp.fraseDeposito(AR('2026-10-08', '23:30')), semana);
  });

  await check('12/10 depósito: se ofrece sin decir dónde está; [deposito] cuando lo quiere (también con cotizar), con el 🚨 ENTRÁ VOS al grupo', async () => {
    planillaNueva();
    modo('vivo');
    vista = [];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
    // Al ofrecerlo: la nota dice que no se habla del depósito hasta que lo quiera.
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['sii, el 13 de 128 al 100% lo tenemos en $495.000 de contado']));
    let r = await silencio(() => pensar('tenes el 13?'));
    assert.strictEqual(r.escalar, false, r.motivo);
    let res = resultadoDe('buscar_equipos');
    assert.match(res.nota, /no digas dónde está/i);
    assert.match(res.nota, /recién cuando lo quiere/i);
    assert.strictEqual(r.avisoGrupo, undefined, 'avisó al ofrecerlo');
    // Cuando lo quiere: cotizar del 13 (del depósito) habilita [deposito]; la frase y el aviso los pone el código.
    guion(
      [usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'lo quiero, tengo 400' })],
      responde(['dale joya, en 1 o en 2 cuotas?', '[deposito]', 'que dia y en que horario te queda mejor?'])
    );
    r = await silencio(() => pensar('lo quiero, tengo 400'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.mensajes, ['dale joya, en 1 o en 2 cuotas?', 'te lo puedo tener para mañana o pasado', 'que dia y en que horario te queda mejor?']);
    assert.strictEqual(r.avisoGrupo, '🚨 ENTRÁ VOS · DEPÓSITO: quiere el iPhone 13 128GB y le dije "te lo puedo tener para mañana o pasado". Confirmale el día.');
    // Un viernes, la frase del finde.
    guion([usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'lo quiero, tengo 400' })], responde(['dale joya, en 1 o en 2 cuotas?', '[deposito]', 'que dia te queda mejor?']));
    r = await silencio(() => pensar('lo quiero, tengo 400', AR('2026-10-09')));
    assert.strictEqual(r.mensajes[1], 'si me bancás 10 minutos te confirmo bien para cuándo lo puedo tener');
    assert.match(r.avisoGrupo, /^🚨 ENTRÁ VOS · DEPÓSITO: quiere el iPhone 13 128GB/);
    // Un cotizar de una unidad del local no habilita [deposito].
    vista = [equipo('15P-128-001', 'iPhone 15 Pro', '128GB', '88%', 870000, { precio_de: 'LISTA 85-93' })];
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:05')));
    nuevoChat();
    const pasos = [[usar('cotizar', { modelo: '15 pro', entrega: 600000, entrega_texto: 'tengo 600' })], responde(['dale', '[deposito]']), responde(['dale', '[deposito]'])];
    guion(...pasos);
    r = await silencio(() => pensar('lo quiero, tengo 600'));
    assert.strictEqual(r.escalar, true, 'no frenó: ' + JSON.stringify(r.mensajes));
    assert.match(r.motivo, /\[deposito\] sin que buscar_equipos o cotizar/);
    modo('apagado');
  });

  await check('12/10 cotizar con `bateria`: "el de 100" cotiza el 13 al 100% y no el de 89%; una batería que no hay, el error con las que hay', async () => {
    planillaNueva();
    modo('vivo');
    vista = [
      equipo('13-128-040', 'iPhone 13', '128GB', '89%', 465000, { precio_de: 'LISTA 85-93' }),
      equipo('13-128-041', 'iPhone 13', '128GB', '100%', 535000, { precio_de: 'LISTA' }),
    ];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
    guion([usar('cotizar', { modelo: '13', bateria: 100, entrega: 400000, entrega_texto: 'tengo 400 mil' })], responde(['el 13 de 128gb al 100%, con los $400.000 de entrega te queda asi', '[cotizacion]']));
    let r = await silencio(() => pensar('el de 100'));
    let res = resultadoDe('cotizar');
    assert.deepStrictEqual([res.llega, res.bateria], [true, '100%'], JSON.stringify(res));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.ok(r.mensajes.some((m) => /^iPhone 13 128GB 100% 📱/.test(m)), JSON.stringify(r.mensajes));
    // Sin batería, como antes: la más barata que se financia (el de 89%).
    guion([usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'tengo 400 mil' })], escala('fin'));
    await silencio(() => pensar('el 13 con 400'));
    assert.strictEqual(resultadoDe('cotizar').bateria, '89%');
    // Una batería que no hay: el error dice las que hay.
    guion([usar('cotizar', { modelo: '13', bateria: 95, entrega: 400000, entrega_texto: 'tengo 400 mil' })], escala('fin'));
    await silencio(() => pensar('el de 95'));
    res = resultadoDe('cotizar');
    assert.match(res.error || '', /89%/);
    assert.match(res.error || '', /100%/);
    // La herramienta lo ofrece.
    const cot = cerebro.HERRAMIENTAS.find((h) => h.name === 'cotizar');
    assert.ok(cot.input_schema.properties.bateria, 'cotizar sin `bateria`');
    modo('apagado');
  });

  await check('12/10 solo contado: "el 12 en cuotas, tengo 150" → `solo_contado` y `financiable` (el más barato que se financia, cotizado con su entrega), sin escalar', async () => {
    planillaNueva();
    modo('vivo');
    vista = [equipo('12-64-001', 'iPhone 12', '64GB', '60%', 380000, { precio_de: 'a mano' })];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
    guion(
      [usar('cotizar', { modelo: '12', entrega: 150000, entrega_texto: 'tengo 150' })],
      responde(['el 12 es solo de contado, $380.000', 'lo mas barato que te financio es el 13 de 128gb al 100%, lo retiras con $320.000'])
    );
    let r = await silencio(() => pensar('el 12 en cuotas, tengo 150'));
    let res = resultadoDe('cotizar');
    assert.deepStrictEqual([res.solo_contado, res.precio_contado], [true, 380000]);
    assert.doesNotMatch(res.nota, /escalá/);
    assert.deepStrictEqual(
      [res.financiable.modelo, res.financiable.capacidad_gb, res.financiable.bateria, res.financiable.llega, res.financiable.entrega_minima],
      ['iPhone 13', 128, '100%', false, 320000],
      JSON.stringify(res.financiable)
    );
    assert.strictEqual(r.escalar, false, r.motivo);
    // Con una entrega que llega: el financiable viene con la cotización y [cotizacion] sale.
    nuevoChat();
    guion(
      [usar('cotizar', { modelo: '12', entrega: 350000, entrega_texto: 'tengo 350' })],
      responde(['el 12 es solo de contado', 'el 13 de 128gb al 100%, con los $350.000 de entrega te queda asi', '[cotizacion]'])
    );
    r = await silencio(() => pensar('el 12 en cuotas, tengo 350'));
    res = resultadoDe('cotizar');
    assert.strictEqual(res.financiable.llega, true, JSON.stringify(res.financiable));
    assert.ok(res.financiable.un_pago > 0);
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.ok(r.mensajes.some((m) => /^iPhone 13 128GB 100% 📱/.test(m)), JSON.stringify(r.mensajes));
    modo('apagado');
  });

  await check('12/10 "el 13": buscar_equipos trae `desde` (el más barato del local) y ese precio pasa la guardia', async () => {
    planillaNueva();
    modo('vivo');
    vista = [
      equipo('13-128-050', 'iPhone 13', '128GB', '77%', 465000, { precio_de: 'a mano' }),
      equipo('13-128-051', 'iPhone 13', '128GB', '89%', 499999, { precio_de: 'LISTA 85-93' }),
      equipo('13-128-052', 'iPhone 13', '128GB', '100%', 535000, { precio_de: 'LISTA' }),
    ];
    await silencio(() => stockApp.vuelta(AR('2026-10-08')));
    nuevoChat();
    guion([usar('buscar_equipos', { modelo: '13' })], responde(['sii, el 13 lo tenemos desde $465.000 de contado', 'tenias solo interes por el 13 o tenias pensado otro?']));
    const r = await silencio(() => pensar('el 13'));
    const res = resultadoDe('buscar_equipos');
    assert.deepStrictEqual(res.desde, { modelo: 'iPhone 13', precio_contado: 465000 });
    assert.strictEqual(r.escalar, false, r.motivo);
    // Con un solo precio, sin `desde`.
    vista = [equipo('13-128-052', 'iPhone 13', '128GB', '100%', 535000, { precio_de: 'LISTA' })];
    await silencio(() => stockApp.vuelta(AR('2026-10-08', '12:05')));
    guion([usar('buscar_equipos', { modelo: '13' })], escala('fin'));
    await silencio(() => pensar('el 13'));
    assert.strictEqual(resultadoDe('buscar_equipos').desde, undefined);
    modo('apagado');
  });

  await check('12/10 turnos: escalar con `turno: true` le contesta una frase de espera (alternan las 3) y después escala; sin `turno`, callado como hoy', async () => {
    planillaNueva();
    modo('apagado');
    nuevoChat();
    const contestar = async (mensaje) => (await silencio(() => cerebro.contestar({ chatId: CHAT, mensaje, nombre: 'Lucia', ahora: AR('2026-10-08') }))).resultado;
    const frases = [];
    for (let i = 0; i < 4; i++) {
      guion([usar('escalar', { motivo: 'dijo día y hora: jueves a las 18', turno: true, ficha: FICHA })]);
      const r = await contestar('el jueves a las 18');
      assert.strictEqual(r.escalar, true);
      assert.match(r.motivo, /dijo día y hora/);
      const textos = r.mensajes.map((m) => (typeof m === 'string' ? m : m.texto || ''));
      frases.push(textos[textos.length - 1]);
    }
    assert.deepStrictEqual(frases, [...cerebro.FRASES_TURNO, cerebro.FRASES_TURNO[0]]);
    assert.deepStrictEqual(cerebro.FRASES_TURNO, ['dame 10 minutitos que llego al local y me fijo los turnos', 'bancame 20 min que estoy en el depósito, ya te confirmo', 'ahí me fijo cómo tengo los turnos y te confirmo']);
    // Sin `turno`: callado, como hoy.
    guion(escala('postventa'));
    const r = await contestar('tengo un problema con el que compré');
    assert.deepStrictEqual([r.escalar, r.mensajes], [true, []]);
    const esc = cerebro.HERRAMIENTAS.find((h) => h.name === 'escalar');
    assert.ok(esc.input_schema.properties.turno, 'escalar sin `turno`');
  });

  await check('12/10 las reglas: turno: true, `desde`, la batería en cotizar, el financiable, la vuelta a la venta y el depósito al cerrar', async () => {
    const deposito = fs.readFileSync(path.join(__dirname, '..', 'src', 'cerebro-reglas-deposito.md'), 'utf8');
    const reglas = cerebro.REGLAS;
    assert.ok(/Con día y hora dichos, escalás con `turno: true`/.test(reglas), 'Turnos no dice turno: true');
    assert.ok(/`desde`/.test(reglas) && /"el 13 lo tenemos desde \$X de contado"/.test(reglas), 'Stock y precio no dice desde');
    assert.ok(/`bateria`/.test(reglas.slice(reglas.indexOf('**La cotización.**'))), 'La cotización no dice bateria');
    assert.ok(/seguís teniendo interés por este modelo o tenías pensado otro\?/.test(reglas), 'falta la vuelta a la venta');
    assert.ok(/`financiable`/.test(deposito), 'el depósito no dice financiable');
    assert.ok(/recién cuando lo quiere/i.test(deposito), 'el depósito no dice recién cuando lo quiere');
    assert.ok(!/si pide cuotas o una entrega para ese equipo, escalá/.test(deposito), 'sigue el escalá del solo contado');
  });

  console.log(`\n${casos} casos, ${fallos} fallas.`);
  if (fallos) process.exitCode = 1;
})();
