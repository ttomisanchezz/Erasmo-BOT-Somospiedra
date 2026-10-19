'use strict';
/**
 * Espejo del Cotizador (02/10/2026, pedido de Tomás).
 *
 * La card "Precios TechSur" del panel Cotización de la app de ventas muestra lo que el proveedor
 * publica en su grupo (src/techsur.js). Lo que TechSur no publicó (el iPhone 14 común, por ejemplo)
 * se muestra con los precios del Cotizador: el costo (`Costo_proveedor`) y el contado
 * (`Precio_contado`) de las pestañas LISTA y LISTA 85-93. La app no puede leer la planilla, así que
 * el bot, que sí la lee, copia esas filas a la tabla `precios_cotizador` del Supabase de la app
 * (migración 0011).
 *
 * Reglas:
 *   * Solo LEE la planilla. En Supabase solo inserta, y solo cuando la planilla cambió (un hash de
 *     las filas): cada cambio es una copia nueva entera, con su `leido_en`; la app usa la última.
 *   * Si una de las dos pestañas no se puede leer, no se guarda nada: la app sigue con la copia
 *     anterior, que es mejor que una a medias.
 *   * Solo las filas con `Cotizable` = SI y precio de contado.
 *   * En el bot corre a los 45 s de arrancar y después cada 30 minutos (index.js). Nunca tira.
 *   * `node src/espejo-cotizador.js` hace una copia ahora y termina (para no esperar al bot).
 *   * Usa el Supabase de TechSur (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY del .env).
 *     ESPEJO_COTIZADOR_ACTIVO=false lo apaga.
 *   * Lee la planilla por su cuenta (no pasa por sheets.js ni por su cache), para no tocar cómo
 *     cotiza el bot.
 *   * La columna STOCK (08/10/2026, decisión de Tomás: lo del depósito son las filas con STOCK distinto
 *     de NO) va como `stock` (SÍ = true, NO = false, vacía = null) a `precios_cotizador.stock` (migración
 *     0018), SOLO con STOCK_APP_MODO en sombra o vivo: con apagado la base puede no tener la 0018 y una
 *     columna que no existe rompería la copia. Un cambio de STOCK cuenta como cambio de la planilla.
 */
const crypto = require('crypto');
const fs = require('fs');
const config = require('./config');

const PESTANAS = ['LISTA', 'LISTA 85-93'];
const CADA_MS = 30 * 60 * 1000;
/**
 * La primera copia a los 45 s y las demás cada 30 minutos contados desde esa (08/10/2026, timeouts de Supabase): el
 * panel Chiara sale en cada minuto justo desde que arrancó el bot y el stock de la app a los 30 s de cada minuto. Así
 * ninguna vuelta le pega a Supabase en el mismo segundo que otra.
 */
const PRIMERA_MS = 45 * 1000;
const TOPE_MS = 15000;

let ultimoHash = null;
let timers = [];
let lectorDePrueba = null;

const activo = () => (process.env.ESPEJO_COTIZADOR_ACTIVO || 'true').trim().toLowerCase() !== 'false';

function configurado() {
  return Boolean(activo() && config.techsur.supabaseUrl && config.techsur.supabaseKey);
}

// ============================================================ la planilla

const normalizar = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_');

/** Un número de la planilla: 518000, "$518,000", "518.000". 0 si no es un número. */
function numero(v) {
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  const s = String(v ?? '').replace(/[^0-9.,]/g, '');
  if (!s) return 0;
  const m = s.match(/[.,](\d{1,2})$/);
  const limpio = m ? s.slice(0, s.length - m[0].length).replace(/[.,]/g, '') + '.' + m[1] : s.replace(/[.,]/g, '');
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

/** "Iphone 18 pro max " → "iPhone 18 Pro Max" (lo mismo que hace sheets.js). */
function modeloProlijo(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\biphone\b/gi, 'iPhone')
    .replace(/\b(pro|max|plus|mini)\b/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .replace(/\b(se|xr|xs|x)\b/gi, (w) => w.toUpperCase());
}

/** Hasta dónde se lee cada pestaña: con el stock de la app (sombra o vivo, 08/10/2026) hasta la Z, que la columna STOCK va después de Notas; con apagado, como siempre. */
const rango = () => (config.stockApp.modo === 'apagado' ? 'A1:U200' : 'A1:Z200');

/** Las celdas de una pestaña (A1:Z200), como las da Google. */
async function leerCeldas(pestana) {
  if (lectorDePrueba) return lectorDePrueba(pestana);
  const { google } = require('googleapis');
  const cred = JSON.parse(fs.readFileSync(config.sheets.credencialesPath, 'utf8'));
  const auth = new google.auth.JWT({ email: cred.client_email, key: cred.private_key, scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'] });
  const { data } = await google.sheets({ version: 'v4', auth }).spreadsheets.values.get({
    spreadsheetId: config.sheets.id,
    range: `'${pestana}'!${rango()}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return data.values || [];
}

function capacidad(gb) {
  const n = numero(gb);
  if (!(n > 0)) return null;
  if (n >= 1024) return `${n / 1024}TB`;
  if (n <= 4) return `${n}TB`;
  return `${n}GB`;
}

function condicion(c) {
  const t = String(c || '').trim().toLowerCase();
  if (t.startsWith('sellad') || t.startsWith('nuev')) return 'sellado';
  if (t.startsWith('usad')) return 'usado';
  return null;
}

const entero = (v) => (numero(v) > 0 ? Math.round(numero(v)) : null);

/** La columna STOCK: "SÍ"/"SI" → true, "NO" → false, vacía o cualquier otra cosa → null (se ofrece). */
function stock(v) {
  const t = normalizar(v).replace(/_/g, '');
  if (t === 'si') return true;
  if (t === 'no') return false;
  return null;
}

/** Las filas de una pestaña (celdas de Google) como van a la tabla precios_cotizador. */
function aFilas(pestana, celdas) {
  let iCab = -1;
  for (let i = 0; i < Math.min(celdas.length, 15) && iCab < 0; i++) if ((celdas[i] || []).some((c) => normalizar(c) === 'modelo')) iCab = i;
  if (iCab < 0) throw new Error(`la pestaña ${pestana} no tiene la columna Modelo`);
  const cab = celdas[iCab].map(normalizar);
  const col = (fila, nombre) => {
    const j = cab.indexOf(nombre);
    return j < 0 ? '' : fila[j];
  };
  const out = [];
  for (const fila of celdas.slice(iCab + 1)) {
    const modelo = modeloProlijo(col(fila, 'modelo'));
    if (!modelo) continue;
    if (String(col(fila, 'cotizable') || '').trim().toUpperCase() !== 'SI') continue;
    const contado = entero(col(fila, 'precio_contado'));
    if (!contado) continue;
    const bateria = String(col(fila, 'bateria_min') ?? '').replace(/%/g, '').trim();
    out.push({
      pestana,
      posicion: out.length,
      fila_id: String(col(fila, 'id') || '').trim() || null,
      modelo,
      capacidad: capacidad(col(fila, 'capacidad_gb')),
      condicion: condicion(col(fila, 'condicion')),
      bateria: numero(bateria) > 0 ? bateria : null,
      costo_proveedor: entero(col(fila, 'costo_proveedor')),
      precio_contado: contado,
      anticipo_min: entero(col(fila, 'anticipo_min')),
      notas: String(col(fila, 'notas') || '').trim() || null,
      stock: stock(col(fila, 'stock')),
    });
  }
  return out;
}

// ============================================================ Supabase

function hashDe(filas) {
  return crypto.createHash('sha256').update(JSON.stringify(filas)).digest('hex').slice(0, 16);
}

function cabeceras(extra = {}) {
  const key = config.techsur.supabaseKey;
  const h = { apikey: key, ...extra };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

const base = () => `${config.techsur.supabaseUrl.replace(/\/$/, '')}/rest/v1/precios_cotizador`;

/** El hash de la última copia guardada, o null si no hay ninguna. */
async function hashGuardado() {
  const res = await fetch(`${base()}?select=hash&order=leido_en.desc&limit=1`, { headers: cabeceras(), signal: AbortSignal.timeout(TOPE_MS) });
  if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
  const filas = await res.json();
  return Array.isArray(filas) && filas[0] ? filas[0].hash : null;
}

/**
 * Lee las dos pestañas y, si cambiaron desde la última copia, guarda una nueva. Devuelve
 * { guardo, filas, motivo }. Nunca tira.
 */
async function copiar(ahora = Date.now()) {
  if (!configurado()) return { guardo: false, filas: 0, motivo: 'apagado o sin Supabase' };
  try {
    let filas = [];
    for (const p of PESTANAS) {
      const deEsta = aFilas(p, await leerCeldas(p));
      // Una pestaña sin filas (08/10/2026): no se guarda una copia a medias. La app toma la copia más nueva
      // entera, y una con una sola pestaña dejaría sin precio a los equipos de la otra.
      if (!deEsta.length) {
        console.warn(`[cotizador] la pestaña ${p} no tiene filas cotizables con precio: no guardo una copia nueva (sigue la anterior)`);
        return { guardo: false, filas: 0, motivo: `la pestaña ${p} no tiene filas para copiar` };
      }
      filas = filas.concat(deEsta);
    }
    // Sin el stock de la app (STOCK_APP_MODO=apagado) la copia es la de siempre, sin la columna `stock`.
    if (config.stockApp.modo === 'apagado') filas = filas.map(({ stock: _stock, ...f }) => f);
    if (!filas.length) return { guardo: false, filas: 0, motivo: 'la planilla no tiene filas para copiar' };
    const hash = hashDe(filas);
    if (ultimoHash === null) ultimoHash = await hashGuardado();
    if (hash === ultimoHash) return { guardo: false, filas: filas.length, motivo: 'sin cambios' };
    const leido_en = new Date(ahora).toISOString();
    const res = await fetch(base(), {
      method: 'POST',
      headers: cabeceras({ 'Content-Type': 'application/json', Prefer: 'return=minimal' }),
      body: JSON.stringify(filas.map((f) => ({ ...f, leido_en, hash }))),
      signal: AbortSignal.timeout(TOPE_MS),
    });
    if (!res.ok) throw new Error(`Supabase ${res.status}: ${(await res.text().catch(() => '')).slice(0, 160)}`);
    ultimoHash = hash;
    const cuenta = PESTANAS.map((p) => `${p} ${filas.filter((f) => f.pestana === p).length}`).join(', ');
    console.log(`[cotizador] copia de la planilla para la app: ${filas.length} filas (${cuenta})`);
    return { guardo: true, filas: filas.length, motivo: null };
  } catch (e) {
    console.error(`[cotizador] no pude copiar la planilla a la app (sigue la copia anterior): ${e.message}`);
    return { guardo: false, filas: 0, motivo: e.message };
  }
}

/** Arranca las copias: a los 45 s y cada 30 minutos desde esa (ver PRIMERA_MS). Solo desde index.js, al levantar el puerto. */
function arrancar() {
  if (!configurado()) return false;
  const una = setTimeout(() => {
    copiar().catch(() => {});
    const cada = setInterval(() => copiar().catch(() => {}), CADA_MS);
    if (typeof cada.unref === 'function') cada.unref();
    timers.push(cada);
  }, PRIMERA_MS);
  if (typeof una.unref === 'function') una.unref();
  timers = [una];
  return true;
}

module.exports = {
  PESTANAS,
  aFilas,
  hashDe,
  copiar,
  arrancar,
  // para los tests
  usarLector(fn) {
    lectorDePrueba = fn;
  },
  _reiniciar() {
    ultimoHash = null;
    for (const t of timers) clearTimeout(t);
    timers = [];
  },
};

// `node src/espejo-cotizador.js`: una copia ahora.
if (require.main === module) {
  copiar().then((r) => {
    if (!r.guardo) console.log(`[cotizador] no guardé una copia nueva: ${r.motivo}`);
    process.exitCode = r.guardo || r.motivo === 'sin cambios' ? 0 : 1;
  });
}
