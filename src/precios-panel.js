'use strict';
const fs = require('fs/promises');
const path = require('path');
const { randomUUID } = require('crypto');
const config = require('./config');
const { armarCatalogo } = require('./catalogo-piedra');

const COLUMNAS = {
  productos: 'id,negocio_id,planta_id,presentacion,unidad,cobertura_m2,moneda_precio,precio,precio_lista,activo',
  plantas: 'id,negocio_id,nombre,activa',
};
let memoria = null;
let sesion = null;
let enVuelo = null;
let fetchInyectado = null;
let falloEn = null;
const RESPIRO_MS = 60 * 1000;

function configurarFetch(fn) { fetchInyectado = fn; }
// No borra la copia en disco ni cambia el fetch inyectado.
function limpiarCache() { memoria = null; sesion = null; falloEn = null; }
const vacio = () => ({ productos: [], problemas: [], origen: 'sin-datos', actualizado: null, desactualizado: true });
const objeto = v => v !== null && typeof v === 'object' && !Array.isArray(v);
const fallo = codigo => Object.assign(new Error(codigo), { codigoPanel: codigo });

/** El panel entrega centavos; el catálogo recibe texto en PESOS, sin usar flotantes. */
function pesos(v) {
  if (typeof v === 'number' && !Number.isSafeInteger(v)) return '';
  if (!['number', 'string', 'bigint'].includes(typeof v) || !/^\d+$/.test(String(v))) return '';
  const n = BigInt(v);
  if (n <= 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) return '';
  return `${n / 100n}.${String(n % 100n).padStart(2, '0')}`;
}

function salida(copia, origen, desactualizado) {
  const catalogo = armarCatalogo(copia.filas);
  return { ...catalogo, problemas: [...catalogo.problemas, ...structuredClone(copia.problemas)], origen, actualizado: copia.ts, desactualizado };
}

function copiaValida(copia) {
  if (!objeto(copia) || !Number.isFinite(copia.ts) || !Array.isArray(copia.filas) || !copia.filas.length || !copia.filas.every(objeto)) return false;
  if (!Array.isArray(copia.problemas) || !copia.problemas.every(p => objeto(p) && typeof p.nombre === 'string' && Array.isArray(p.faltaDato) && p.faltaDato.every(v => typeof v === 'string'))) return false;
  return armarCatalogo(copia.filas).productos.some(p => p.efectivoCentavos || p.listaCentavos);
}

async function pedido(url, opciones, cfg) {
  let r;
  try {
    r = await (fetchInyectado || globalThis.fetch)(url, { ...opciones, signal: AbortSignal.timeout(cfg.timeoutMs) });
  } catch { throw fallo('RED_TIMEOUT'); }
  if (!r || r.status !== 200) {
    const status = Number.isInteger(r?.status) ? r.status : 0;
    throw Object.assign(fallo('HTTP_' + status), { status });
  }
  try { return await r.json(); } catch { throw fallo('JSON_INVALIDO'); }
}

async function login(cfg, ahora) {
  const datos = await pedido(`${cfg.supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: 'POST', headers: { apikey: cfg.anonKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: cfg.email, password: cfg.password }),
  }, cfg);
  if (!objeto(datos) || typeof datos.access_token !== 'string' || !datos.access_token.trim()) throw fallo('LOGIN_INVALIDO');
  const vencimiento = Number.isFinite(datos.expires_at) ? datos.expires_at * 1000
    : Number.isFinite(datos.expires_in) && datos.expires_in > 0 ? ahora + datos.expires_in * 1000 : ahora;
  sesion = { token: datos.access_token, vence: vencimiento };
}

async function leerPanel(cfg, ahora) {
  if (!sesion || sesion.vence <= ahora) await login(cfg, ahora);
  let renovado = false;
  async function leer(tabla, parametros) {
    const url = new URL(`${cfg.supabaseUrl}/rest/v1/${tabla}`);
    for (const [k, v] of Object.entries(parametros)) url.searchParams.set(k, v);
    for (;;) {
      try {
        return await pedido(url.toString(), { method: 'GET', headers: {
          apikey: cfg.anonKey, Authorization: `Bearer ${sesion.token}`,
        } }, cfg);
      } catch (e) {
        // Un solo reingreso en toda la carga, incluso si fallan páginas distintas.
        if (e.status !== 401 || renovado) throw e;
        renovado = true;
        sesion = null;
        await login(cfg, ahora);
      }
    }
  }
  const negocios = await leer('negocios', { slug: `eq.${cfg.slug}`, select: 'id' });
  if (!Array.isArray(negocios) || negocios.length !== 1 || !objeto(negocios[0]) || typeof negocios[0].id !== 'string' || !negocios[0].id) throw fallo('NEGOCIO_INVALIDO');
  const id = negocios[0].id;
  async function paginas(tabla) {
    const filas = [];
    const ids = new Set();
    for (let offset = 0; ; offset += 1000) {
      const pagina = await leer(tabla, { negocio_id: `eq.${id}`, select: COLUMNAS[tabla], order: 'id.asc', limit: '1000', offset: String(offset) });
      if (!Array.isArray(pagina) || pagina.length > 1000) throw fallo('FILAS_INVALIDAS');
      for (const fila of pagina) {
        if (!objeto(fila) || fila.negocio_id !== id) throw fallo('NEGOCIO_MEZCLADO');
        if (typeof fila.id !== 'string' || !fila.id || ids.has(fila.id)) throw fallo('ID_INVALIDO');
        ids.add(fila.id);
        filas.push(fila);
      }
      if (pagina.length < 1000) return filas;
    }
  }
  const productos = await paginas('productos');
  const plantas = await paginas('plantas');
  if (!productos.length || !plantas.length) throw fallo('LISTA_VACIA');
  const porId = new Map(plantas.map(p => [p.id, p]));
  const filas = [], problemas = [];
  for (const [i, p] of productos.entries()) {
    if (p.activo !== true) continue;
    const planta = porId.get(p.planta_id);
    if (!planta) throw fallo('PLANTA_FALTANTE');
    if (planta.activa !== true) continue;
    if (typeof planta.nombre !== 'string' || !planta.nombre.trim() || (p.presentacion != null && typeof p.presentacion !== 'string')) throw fallo('NOMBRE_INVALIDO');
    if (/granza/i.test(planta.nombre)) {
      console.log('[precios-panel] GRANZA_IGNORADA');
      continue;
    }
    const nombre = (planta.nombre + (p.presentacion ? ' ' + p.presentacion : '')).trim();
    if (p.moneda_precio !== 'ARS') {
      problemas.push({ fila: i + 1, nombre, faltaDato: ['moneda'] });
      continue;
    }
    filas.push({ PRODUCTO: nombre, EFECTIVO: pesos(p.precio), LISTA: pesos(p.precio_lista), UNIDAD: p.unidad, 'COBERTURA M2': p.cobertura_m2 });
  }
  const copia = { filas, problemas, ts: ahora };
  if (!copiaValida(copia)) throw fallo('SIN_PRECIOS');
  return copia;
}

async function guardar(copia, destino) {
  const temporal = destino + '.' + randomUUID() + '.tmp';
  try {
    await fs.mkdir(path.dirname(destino), { recursive: true });
    await fs.writeFile(temporal, JSON.stringify(copia), { encoding: 'utf8', flag: 'wx' });
    await fs.rename(temporal, destino);
  } catch {
    console.warn('[precios-panel] DISCO_ESCRITURA');
  } finally {
    await fs.unlink(temporal).catch(() => {});
  }
}

async function cargar(cfg, ahora) {
  try {
    const copia = await leerPanel(cfg, ahora);
    await guardar(copia, cfg.cachePath);
    memoria = { copia, origen: 'cache-memoria', desactualizado: false };
    falloEn = null;
    return salida(copia, 'panel', false);
  } catch (e) {
    // Solo códigos propios: nunca mensajes, cuerpos de respuesta ni credenciales.
    console.warn('[precios-panel] ' + (e.codigoPanel || 'CARGA_FALLIDA'));
    falloEn = ahora;
    if (memoria) {
      memoria.desactualizado = true;
      return salida(memoria.copia, memoria.origen, true);
    }
    try {
      const copia = JSON.parse(await fs.readFile(cfg.cachePath, 'utf8'));
      if (copiaValida(copia)) {
        memoria = { copia, origen: 'copia-en-disco', desactualizado: true };
        return salida(copia, 'copia-en-disco', true);
      }
    } catch { /* Sin copia legible, no hay precios para ofrecer. */ }
    return vacio();
  }
}

// No es async para que los consumidores compartan la misma promesa en vuelo.
function obtenerCatalogo({ ahora = Date.now() } = {}) {
  const cfg = { ...config.panel };
  if (![cfg.supabaseUrl, cfg.anonKey, cfg.email, cfg.password].every(v => typeof v === 'string' && v.trim())) return Promise.resolve(vacio());
  if (enVuelo) return enVuelo;
  if (memoria && !memoria.desactualizado && ahora >= memoria.copia.ts && ahora - memoria.copia.ts < cfg.ttlMs) return Promise.resolve(salida(memoria.copia, 'cache-memoria', false));
  // Respiro después de un fallo: con Supabase caído, cada consulta de Sonnet esperaría hasta timeoutMs. Durante
  // RESPIRO_MS se sirve la última copia buena (o nada, si nunca hubo) sin volver a pedir.
  if (falloEn !== null && ahora >= falloEn && ahora - falloEn < RESPIRO_MS) {
    return Promise.resolve(memoria ? salida(memoria.copia, memoria.origen, true) : vacio());
  }
  enVuelo = cargar(cfg, ahora).finally(() => { enVuelo = null; });
  return enVuelo;
}

module.exports = { obtenerCatalogo, limpiarCache, configurarFetch };
