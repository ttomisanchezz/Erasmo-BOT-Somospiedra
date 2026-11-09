'use strict';
const assert = require('assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'piedra-panel-'));
process.env.PRECIOS_CACHE_PATH = path.join(carpeta, 'copia', 'panel.json');
process.env.SUPABASE_URL = 'https://de-mentira.supabase.co';
process.env.SUPABASE_ANON_KEY = 'anon-inventada';
process.env.ERASMO_EMAIL = 'erasmo@example.invalid';
process.env.ERASMO_PASSWORD = 'password-inventado';
// Evita que config intente leer el .env real.
const dotenv = require('dotenv');
const cargarEnv = dotenv.config;
dotenv.config = () => ({});
const config = require('../src/config');
dotenv.config = cargarEnv;
const panel = require('../src/precios-panel');
const { cotizar, formatearPesos } = require('../src/cotizador-piedra');
const base = { ...config.panel };
const ahora = 1800000000000;
const producto = (cambios = {}) => ({ id: 'p1', negocio_id: 'n1', planta_id: 'l1', presentacion: '', unidad: 'm2', cobertura_m2: '0.5000', moneda_precio: 'ARS', precio: 7800000, precio_lista: 7800050, activo: true, ...cambios });
const planta = (cambios = {}) => ({ id: 'l1', negocio_id: 'n1', nombre: 'Piedra', activa: true, ...cambios });
const respuesta = (datos, status = 200) => ({ status, json: async () => datos });
let llamadas;
function servidor({ productos = [producto()], plantas = [planta()], negocios = [{ id: 'n1' }], interceptar } = {}) {
  llamadas = [];
  panel.configurarFetch(async (url, opciones) => {
    const u = new URL(url);
    llamadas.push({ u, opciones });
    assert(!u.searchParams.get('select')?.includes('costo'));
    assert.equal(opciones.headers.apikey, base.anonKey);
    assert(opciones.signal instanceof AbortSignal);
    const especial = interceptar && await interceptar(u, opciones);
    if (especial) return especial;
    if (u.pathname.includes('/auth/')) {
      assert.equal(opciones.method, 'POST');
      assert.deepEqual(JSON.parse(opciones.body), { email: base.email, password: base.password });
      return respuesta({ access_token: 'token-inventado', expires_in: 3600 });
    }
    assert.equal(opciones.headers.Authorization, 'Bearer token-inventado');
    if (u.pathname.endsWith('/negocios')) return respuesta(negocios);
    assert.equal(u.searchParams.get('negocio_id'), 'eq.n1');
    const filas = u.pathname.endsWith('/productos') ? productos : plantas;
    const offset = Number(u.searchParams.get('offset'));
    assert.equal(u.searchParams.get('limit'), '1000');
    return respuesta(filas.slice(offset, offset + 1000));
  });
}
const obtener = (ts = ahora) => panel.obtenerCatalogo({ ahora: ts });
const caer = () => panel.configurarFetch(async () => { throw new Error(base.password); });
let fallos = 0;
async function check(nombre, fn) {
  panel.limpiarCache();
  Object.assign(config.panel, base, { cachePath: path.join(carpeta, String(++check.numero), 'panel.json') });
  servidor();
  try { await fn(); console.log('OK ' + nombre); }
  catch (e) { fallos++; console.error('FALLÓ ' + nombre, e); }
}
check.numero = 0;
async function main() {
  await check('login, unidades exactas y cotización', async () => {
    const c = await obtener();
    assert.equal(c.origen, 'panel');
    assert.equal(c.actualizado, ahora);
    assert.equal(c.desactualizado, false);
    assert.equal(c.productos[0].efectivoCentavos, 7800000);
    assert.equal(c.productos[0].listaCentavos, 7800050);
    assert.equal(c.productos[0].coberturaM2, '0.5000');
    const q = cotizar({ producto: c.productos[0], m2: 1, config: { desperdicioPct: 0 } });
    assert.equal(formatearPesos(q.efectivo.totalCentavos), '$78.000');
    const copia = JSON.parse(fs.readFileSync(config.panel.cachePath, 'utf8'));
    assert.equal(copia.filas[0].EFECTIVO, '78000.00');
    assert.equal(copia.filas[0].LISTA, '78000.50');
  });
  await check('inactivos, USD, granza y faltantes', async () => {
    servidor({ productos: [producto(), producto({ id: '2', activo: false }), producto({ id: '3', planta_id: 'inactiva' }), producto({ id: '4', moneda_precio: 'USD', presentacion: 'dólares' }), producto({ id: '5', planta_id: 'granza' }), producto({ id: '6', presentacion: 'sin lista', precio_lista: null }), producto({ id: '7', presentacion: 'sin datos', precio: 0, precio_lista: null, unidad: null })], plantas: [planta(), planta({ id: 'inactiva', activa: false }), planta({ id: 'granza', nombre: 'GRANZA blanca' })] });
    const c = await obtener();
    assert.equal(c.productos.length, 3);
    assert(c.problemas.some(p => p.faltaDato.includes('moneda')));
    assert(c.problemas.some(p => p.nombre.endsWith('sin lista') && p.faltaDato.includes('listaCentavos')));
    assert(c.problemas.some(p => p.nombre.endsWith('sin datos') && p.faltaDato.includes('efectivoCentavos')));
  });
  await check('rechaza negocios mezclados y negocio ambiguo', async () => {
    for (const opciones of [{ productos: [producto(), producto({ negocio_id: 'otro' })] }, { plantas: [planta(), planta({ id: 'otra', negocio_id: 'otro' })] }, { negocios: [] }, { negocios: [{ id: 'n1' }, { id: 'n2' }] }]) {
      servidor(opciones);
      assert.equal((await obtener()).origen, 'sin-datos');
    }
  });
  await check('sin credenciales no usa red ni copia', async () => {
    await obtener();
    for (const campo of ['supabaseUrl', 'anonKey', 'email', 'password']) {
      config.panel[campo] = '';
      let n = 0;
      panel.configurarFetch(async () => { n++; throw Error('No debe llamar'); });
      assert.deepEqual((await obtener()).productos, []);
      assert.equal(n, 0);
      config.panel[campo] = base[campo];
    }
  });
  await check('caché diez minutos y renovación', async () => {
    await obtener();
    const n = llamadas.length;
    assert.equal((await obtener(ahora + 9 * 60000)).origen, 'cache-memoria');
    assert.equal(llamadas.length, n);
    assert.equal((await obtener(ahora + 11 * 60000)).origen, 'panel');
    assert(llamadas.length > n);
  });
  await check('caída: memoria, reinicio con disco y sin copia', async () => {
    await obtener(); caer();
    let c = await obtener(ahora + 11 * 60000);
    assert.equal(c.origen, 'cache-memoria'); assert.equal(c.desactualizado, true);
    panel.limpiarCache();
    c = await obtener(ahora + 11 * 60000);
    assert.equal(c.origen, 'copia-en-disco'); assert.equal(c.desactualizado, true);
    assert.equal(c.productos[0].efectivoCentavos, 7800000);
    panel.limpiarCache(); config.panel.cachePath = path.join(carpeta, 'nunca.json');
    c = await obtener();
    assert.deepEqual(c, { productos: [], problemas: [], origen: 'sin-datos', actualizado: null, desactualizado: true });
  });
  await check('vacío, JSON raro y precios vacíos no pisan copia', async () => {
    await obtener();
    const copia = fs.readFileSync(config.panel.cachePath, 'utf8');
    for (const productos of [[], {}, [null], [producto({ precio: null, precio_lista: 0 })]]) {
      servidor({ productos, interceptar: u => u.pathname.endsWith('/productos') ? respuesta(productos) : null });
      const c = await obtener(ahora + 11 * 60000);
      assert.equal(c.desactualizado, true);
      assert.equal(fs.readFileSync(config.panel.cachePath, 'utf8'), copia);
    }
  });
  await check('single-flight comparte promesa y login', async () => {
    const a = obtener(), b = obtener(), c = obtener();
    assert.equal(a, b); assert.equal(b, c);
    await Promise.all([a, b, c]);
    assert.equal(llamadas.filter(x => x.u.pathname.includes('/auth/')).length, 1);
  });
  await check('401 renueva una sola vez', async () => {
    let n = 0;
    servidor({ interceptar: u => u.pathname.endsWith('/productos') && n++ === 0 ? respuesta({}, 401) : null });
    assert.equal((await obtener()).origen, 'panel');
    assert.equal(llamadas.filter(x => x.u.pathname.includes('/auth/')).length, 2);
    panel.limpiarCache(); config.panel.cachePath = path.join(carpeta, '401.json');
    servidor({ interceptar: u => u.pathname.includes('/rest/') ? respuesta({}, 401) : null });
    assert.equal((await obtener()).origen, 'sin-datos');
    assert.equal(llamadas.filter(x => x.u.pathname.includes('/auth/')).length, 2);
  });
  await check('pagina productos y plantas de a mil', async () => {
    servidor({ productos: Array.from({ length: 1001 }, (_, i) => producto({ id: 'p' + i, planta_id: 'l' + i })), plantas: Array.from({ length: 1001 }, (_, i) => planta({ id: 'l' + i, nombre: 'Piedra ' + i })) });
    assert.equal((await obtener()).productos.length, 1001);
    assert.equal(llamadas.filter(x => x.u.searchParams.get('offset') === '1000').length, 2);
  });
  await check('renueva token vencido y evalúa fetch global en cada llamada', async () => {
    await obtener();
    await obtener(ahora + 61 * 60000);
    assert.equal(llamadas.filter(x => x.u.pathname.includes('/auth/')).length, 2);
    panel.limpiarCache();
    config.panel.cachePath = path.join(carpeta, 'global.json');
    const original = globalThis.fetch;
    let n = 0;
    try {
      panel.configurarFetch(null);
      globalThis.fetch = async () => { n++; throw Error('falla inventada'); };
      assert.equal((await obtener()).origen, 'sin-datos');
      globalThis.fetch = async () => { n += 10; throw Error('otra falla'); };
      await obtener(ahora + 5000); // dentro del respiro después de un fallo: no vuelve a pedir
      assert.equal(n, 1);
      await obtener(ahora + 61000); // pasado el respiro: pide de nuevo, con el fetch global de ESTE momento
      assert.equal(n, 11);
    } finally { globalThis.fetch = original; }
  });
  await check('después de un fallo, un respiro de 60 s: sirve la última copia buena sin volver a esperar a Supabase', async () => {
    panel.limpiarCache();
    config.panel.cachePath = path.join(carpeta, 'respiro.json');
    servidor();
    assert.equal((await obtener()).origen, 'panel');
    caer();
    const vuelta = await obtener(ahora + 11 * 60000);
    assert.equal(vuelta.desactualizado, true);
    const antes = llamadas.length;
    const otra = await obtener(ahora + 11 * 60000 + 30000);
    assert.equal(otra.desactualizado, true);
    assert.equal(otra.productos.length, vuelta.productos.length);
    assert.equal(llamadas.length, antes, 'volvió a pedir adentro del respiro');
  });
  await check('JSON inválido y copia corrupta quedan sin datos', async () => {
    fs.mkdirSync(path.dirname(config.panel.cachePath), { recursive: true });
    fs.writeFileSync(config.panel.cachePath, '{roto');
    panel.configurarFetch(async () => ({ status: 200, json: async () => { throw Error(base.password); } }));
    assert.equal((await obtener()).origen, 'sin-datos');
  });
  await check('timeout, HTTP y errores no filtran secretos', async () => {
    const mensajes = [];
    const originales = {};
    for (const k of ['log', 'warn', 'error']) { originales[k] = console[k]; console[k] = (...a) => mensajes.push(a.join(' ')); }
    try {
      caer(); assert.equal((await obtener()).origen, 'sin-datos');
      servidor({ interceptar: () => respuesta({ mensaje: base.password }, 500) });
      assert.equal((await obtener()).origen, 'sin-datos');
      config.panel.timeoutMs = 5;
      panel.configurarFetch((url, { signal }) => new Promise((resolve, reject) => signal.addEventListener('abort', () => reject(signal.reason), { once: true })));
      // AbortSignal.timeout no mantiene vivo Node por sí solo.
      const vivo = setInterval(() => {}, 100);
      try { assert.equal((await obtener()).origen, 'sin-datos'); } finally { clearInterval(vivo); }
      for (const secreto of [base.password, base.email, base.anonKey, 'token-inventado']) assert(!mensajes.join(' ').includes(secreto));
    } finally { Object.assign(console, originales); }
  });
  if (fallos) process.exitCode = 1;
  else console.log('Todo OK');
}
main().catch(e => { console.error(e); process.exitCode = 1; });
