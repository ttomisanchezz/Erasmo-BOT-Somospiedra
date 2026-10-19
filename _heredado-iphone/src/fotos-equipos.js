'use strict';
/**
 * Las fotos de los equipos del local, como las manda Fran (decisiones de Tomás del 08/10/2026). Solo con
 * el stock de la app en vivo (STOCK_APP_MODO=vivo): cuando el cliente PIDE fotos, Chiara manda una foto por
 * unidad del local de ese modelo, con el pie abajo ("15 128gb 87% 740.000"), hasta 3. Quién las elige es el
 * código (cerebro.js, la herramienta `mandar_fotos`, con lo de acá), nunca Sonnet.
 *
 * LAS FOTOS Y EL ÍNDICE (no las carga el bot: las sube Tomás y el índice lo escribe Claude mirando cada foto):
 *   - la carpeta es la de siempre, `fotos/` (FOTOS_DIR), con una subcarpeta por modelo: `fotos/iPhone 15/`,
 *     `fotos/iPhone 14 Pro/`… Una foto puede tener un celular solo o varios juntos;
 *   - `fotos/indice.json`:
 *       { "v": 1, "fotos": [
 *         { "archivo": "iPhone 15/IMG_0412.jpg", "modelo": "iPhone 15", "colores": [["rosa"], ["cian", "celeste", "azul claro"]] }
 *       ] }
 *     `archivo` es la ruta relativa a la carpeta de fotos; `colores`, un elemento por celular que se ve, DE
 *     IZQUIERDA A DERECHA, y en cada uno los nombres con que puede estar cargado ese color en la app (da igual
 *     mayúsculas y tildes). Una foto con un solo celular tiene un solo elemento.
 *   - El bot lo relee cuando cambia el archivo (por la fecha de modificación y el tamaño), sin reiniciar. Si
 *     no está o no se puede leer: sin fotos, un aviso en consola una sola vez por motivo, y nada se rompe.
 *
 * CÓMO SE ELIGE (`elegirFotos`): por cada modelo pedido, las unidades del local (USADOS, con código y color),
 * primero la que ya se habló en el chat (la cotizada, `primero`; su modelo, adelante de los otros; si no se sabe
 * de cuál se habló, el modelo del chat, `modeloPrimero`, adelante), después las más baratas (el orden de
 * `buscarTodas`). Cada unidad necesita color cargado y una foto del índice de ese modelo y ese color: una
 * donde está sola antes que una de varios; con más de 3 celulares no se usa (no hay forma corta de decir
 * cuál es). Hasta TOPE (3) fotos en total entre todos los modelos, repartidas (una de cada modelo, después la
 * segunda de cada uno…); dos unidades con el mismo pie y la misma foto van una sola vez. El pie:
 * "<modelo sin iPhone, en minúscula> <capacidad>gb <batería o sellado> <precio con puntos, sin $>", y si la
 * foto tiene varios celulares, abajo "me quedó el de la izquierda, el cian" (el color tal cual está cargado
 * en la app, en minúscula).
 *
 * El catálogo viejo por modelo (fotos.js: 13.jpg, 14-pro.jpg sueltos en `fotos/`) sigue igual: lo usa
 * #sinstock. Acá solo se miran el índice y sus subcarpetas; la foto final la manda evolution.enviarImagen,
 * que exige que esté adentro de fotos.carpeta() (las subcarpetas valen).
 */
const fs = require('fs');
const path = require('path');
const sheets = require('./sheets');
const cotizador = require('./cotizador');
const fotos = require('./fotos');
const stockApp = require('./stock-app');

/** Fotos por respuesta, entre todos los modelos. */
const TOPE = 3;
/** Celulares en una foto como mucho: con 2 o 3 se dice cuál es; con más, la foto no se usa. */
const MAX_EN_LA_FOTO = 3;
const ARCHIVO_INDICE = 'indice.json';
const EXTENSIONES = ['.jpg', '.jpeg', '.png', '.webp'];

// ---------------------------------------------------------------------------
// Las claves: el modelo y el color como se comparan
// ---------------------------------------------------------------------------

/** "iPhone 15 Pro Max" → "15 pro max"; "iphone 13" → "13". Sin tildes ni mayúsculas (sheets.normalizar). */
function claveModelo(texto) {
  return sheets
    .normalizar(texto)
    .replace(/\biphone\b|\bip\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** "GRAPHITO" → "graphito"; "Azul claro " → "azul claro". */
function claveColor(texto) {
  return sheets.normalizar(texto).replace(/\s+/g, ' ').trim();
}

// ---------------------------------------------------------------------------
// El índice
// ---------------------------------------------------------------------------
let cache = { clave: null, fotos: [] };
const avisados = new Set();

/** Un aviso en consola, una sola vez por motivo (el archivo que no está, el JSON roto…). */
function avisar(texto) {
  if (avisados.has(texto)) return;
  avisados.add(texto);
  console.warn(`[fotos-equipos] ${texto}`);
}

/** La ruta del índice: `indice.json` en la carpeta de fotos (absoluta). */
function rutaDelIndice() {
  return path.join(fotos.carpeta(), ARCHIVO_INDICE);
}

/** ¿Una ruta relativa que queda adentro de la carpeta de fotos y con extensión de imagen? */
function archivoValido(archivo) {
  if (typeof archivo !== 'string' || !archivo.trim() || path.isAbsolute(archivo)) return false;
  const relativa = path.relative(fotos.carpeta(), path.resolve(fotos.carpeta(), archivo));
  if (!relativa || path.isAbsolute(relativa) || relativa.split(path.sep)[0] === '..') return false;
  return EXTENSIONES.includes(path.extname(archivo).toLowerCase());
}

/** Una entrada del índice ya limpia ({ archivo, modelo, colores: [[...]] }), o null si no tiene la forma. */
function entrada(e) {
  if (!e || typeof e !== 'object' || !archivoValido(e.archivo) || typeof e.modelo !== 'string' || !claveModelo(e.modelo)) return null;
  if (!Array.isArray(e.colores) || !e.colores.length) return null;
  const colores = e.colores.map((c) => (Array.isArray(c) ? c : [c]).map((n) => String(n == null ? '' : n).trim()).filter(Boolean));
  if (colores.some((c) => !c.length)) return null;
  return { archivo: e.archivo, modelo: e.modelo.trim(), colores };
}

/**
 * Las entradas del índice (`fotos`), releídas si el archivo cambió. Sin archivo o ilegible, []: el aviso sale
 * una vez por motivo y nada se rompe. Nunca tira.
 */
function leerIndice() {
  const archivo = rutaDelIndice();
  let st;
  try {
    st = fs.statSync(archivo);
  } catch (e) {
    cache = { clave: null, fotos: [] };
    avisar(e && e.code === 'ENOENT' ? `no está ${archivo}: sin fotos de los equipos hasta que se cargue` : `no pude leer ${archivo} (${e.message}): sin fotos de los equipos`);
    return cache.fotos;
  }
  const clave = `${archivo}|${st.mtimeMs}|${st.size}`;
  if (cache.clave === clave) return cache.fotos;
  try {
    const d = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    if (!d || !Array.isArray(d.fotos)) throw new Error('no tiene la forma esperada ({ v, fotos: [...] })');
    const buenas = d.fotos.map(entrada).filter(Boolean);
    if (buenas.length < d.fotos.length) avisar(`${archivo}: ${d.fotos.length - buenas.length} entrada(s) sin la forma esperada (archivo, modelo, colores): las salteo`);
    cache = { clave, fotos: buenas };
  } catch (e) {
    cache = { clave, fotos: [] };
    avisar(`no pude leer ${archivo} (${e.message}): sin fotos de los equipos hasta que se arregle`);
  }
  return cache.fotos;
}

/** ¿Hay un índice con alguna foto? */
function hayIndice() {
  return leerIndice().length > 0;
}

/**
 * La ruta absoluta de una foto del índice, adentro de la carpeta de fotos, si el archivo existe; si no, null.
 * Solo por `archivo` tal cual figura en el índice: nunca una ruta que venga de un texto.
 */
function rutaDe(archivo) {
  if (!leerIndice().some((f) => f.archivo === archivo)) return null;
  if (!archivoValido(archivo)) return null;
  const ruta = path.resolve(fotos.carpeta(), archivo);
  try {
    return fs.statSync(ruta).isFile() ? ruta : null;
  } catch {
    return null;
  }
}

/**
 * La foto para una unidad: del mismo modelo y con ese color en alguno de sus celulares. Una donde está solo
 * antes que una de varios; con más de MAX_EN_LA_FOTO no se usa, y tampoco una donde ese color está en dos
 * celulares (no hay forma de decir cuál es). Devuelve { archivo, posicion, total } (la posición del celular en
 * la foto, de izquierda a derecha, desde 0) o null.
 */
function fotoPara(modelo, color) {
  const m = claveModelo(modelo);
  const c = claveColor(color);
  if (!m || !c) return null;
  const candidatas = [];
  for (const f of leerIndice()) {
    if (claveModelo(f.modelo) !== m || f.colores.length > MAX_EN_LA_FOTO) continue;
    const posiciones = f.colores.map((nombres, i) => (nombres.some((nombre) => claveColor(nombre) === c) ? i : -1)).filter((i) => i >= 0);
    if (posiciones.length !== 1 || !rutaDe(f.archivo)) continue;
    candidatas.push({ archivo: f.archivo, posicion: posiciones[0], total: f.colores.length });
  }
  candidatas.sort((a, b) => a.total - b.total);
  return candidatas[0] || null;
}

// ---------------------------------------------------------------------------
// El pie
// ---------------------------------------------------------------------------

/** "15 128gb 87% 740.000" · "14 pro 128gb 100% 835.000" · "17 256gb sellado 1.700.000". */
function pieDe(fila) {
  const capacidad = Number(fila.capacidad_gb) > 0 ? `${fila.capacidad_gb}gb` : '';
  const precio = cotizador.pesos(fila.precio_contado).replace('$', '');
  return [claveModelo(fila.modelo), capacidad, cotizador.bateriaDe(fila), precio].filter(Boolean).join(' ');
}

const LUGARES = { 2: ['de la izquierda', 'de la derecha'], 3: ['de la izquierda', 'del medio', 'de la derecha'] };

/** "el de la izquierda", "el del medio", "el de la derecha": cuál es el celular en una foto de 2 o 3; '' si no hay forma. */
function lugarEnLaFoto(posicion, total) {
  const lugar = (LUGARES[total] || [])[posicion];
  return lugar ? `el ${lugar}` : '';
}

/** "me quedó el de la izquierda, el cian": la segunda línea del pie cuando la foto tiene varios celulares. */
function textoDePosicion(posicion, total, color) {
  const lugar = lugarEnLaFoto(posicion, total);
  if (!lugar) return '';
  return `me quedó ${lugar}, el ${String(color || '').trim().toLowerCase()}`;
}

// ---------------------------------------------------------------------------
// Elegir
// ---------------------------------------------------------------------------

/**
 * Qué fotos van. `porModelo`: [{ modelo, unidades }] en el orden en que pidió los modelos, con las unidades
 * del local de cada uno como las devuelve `buscarTodas` (las más baratas primero). `primero`: el código de la
 * unidad de la que ya se habló (la cotizada), que va adelante en su modelo, y su modelo adelante de los otros;
 * si ninguna unidad es esa (no hay forma segura de saber de cuál se habló), `modeloPrimero` (el modelo del chat)
 * va adelante de los otros. Devuelve:
 *   fotos:          [{ archivo, pie, codigo, modelo, capacidad_gb, bateria, color, precio_contado, posicion, total }]
 *                   hasta `tope`, repartidas entre los modelos, sin repetir pie + foto;
 *   sinFoto:        las unidades que no tienen foto ({ modelo, codigo, color, motivo: 'sin color' | 'sin foto' });
 *   modelosSinFoto: los modelos de los que no va NINGUNA foto (ninguna unidad la tiene): por esos se escala.
 */
function elegirFotos(porModelo, { primero = null, modeloPrimero = null, tope = TOPE } = {}) {
  const sinFoto = [];
  const modelosSinFoto = [];
  const listas = [];
  // El modelo de la unidad de la que se habló adelante; si no está entre los pedidos, el modelo del chat.
  const pedidos = [...(porModelo || [])];
  const conLaCotizada = primero ? pedidos.findIndex((p) => (p.unidades || []).some((u) => u.id === primero)) : -1;
  const delChat = conLaCotizada < 0 && modeloPrimero ? pedidos.findIndex((p) => claveModelo(p.modelo) === claveModelo(modeloPrimero)) : -1;
  const adelante = conLaCotizada >= 0 ? conLaCotizada : delChat;
  if (adelante > 0) pedidos.unshift(...pedidos.splice(adelante, 1));
  for (const { modelo, unidades } of pedidos) {
    const conFoto = [];
    const delante = (unidades || []).filter((u) => primero && u.id === primero);
    const resto = (unidades || []).filter((u) => !(primero && u.id === primero));
    for (const u of [...delante, ...resto]) {
      const color = String(u.color || '').trim();
      if (!color) {
        sinFoto.push({ modelo: u.modelo, codigo: u.id, color: '', motivo: 'sin color' });
        continue;
      }
      const foto = fotoPara(u.modelo, color);
      if (!foto) {
        sinFoto.push({ modelo: u.modelo, codigo: u.id, color, motivo: 'sin foto' });
        continue;
      }
      const cual = foto.total > 1 ? textoDePosicion(foto.posicion, foto.total, color) : '';
      conFoto.push({
        archivo: foto.archivo,
        pie: cual ? `${pieDe(u)}\n${cual}` : pieDe(u),
        codigo: u.id,
        modelo: u.modelo,
        capacidad_gb: u.capacidad_gb || null,
        bateria: cotizador.bateriaDe(u) || null,
        color: color.toLowerCase(),
        precio_contado: u.precio_contado,
        posicion: foto.posicion,
        total: foto.total,
      });
    }
    if (!conFoto.length && (unidades || []).length) modelosSinFoto.push(modelo);
    listas.push(conFoto);
  }
  // Repartidas: la primera de cada modelo, después la segunda de cada uno… hasta el tope, sin repetir.
  const elegidas = [];
  const vistas = new Set();
  for (let i = 0; elegidas.length < tope && listas.some((l) => i < l.length); i++) {
    for (const l of listas) {
      if (elegidas.length >= tope || i >= l.length) continue;
      const f = l[i];
      const clave = `${f.archivo}|${f.pie}`;
      if (vistas.has(clave)) continue;
      vistas.add(clave);
      elegidas.push(f);
    }
  }
  return { fotos: elegidas, sinFoto, modelosSinFoto };
}

// ---------------------------------------------------------------------------
// El depósito
// ---------------------------------------------------------------------------

/**
 * La frase cuando el modelo no está en el local sino en el depósito (sin foto): la pone el código donde
 * Sonnet escribe `[fotos_deposito]`. Es la única promesa de fotos que existe (decisión de Tomás del 08/10/2026).
 * Con un solo modelo pedido, "este modelito"; si pidió más de uno, nombra los del depósito ("el 16 pro").
 * El día es el del depósito (stock-app.diaDelDeposito): "mañana" de lunes a jueves, "el lunes" de viernes a domingo.
 */
function fraseFotosDeposito(modelos, { ahora = Date.now(), unoSolo = true } = {}) {
  const nombres = (modelos || []).map((m) => `el ${claveModelo(m)}`).filter((m) => m !== 'el ');
  const cual = unoSolo || !nombres.length ? 'este modelito' : nombres.join(' ni ');
  return `mira, ahora en el local no tengo ${cual}, si me esperás un rato le pido fotos a los chicos del depósito, si no te las mando ${stockApp.diaDelDeposito(ahora)}`;
}

/** El aviso al grupo cuando salió la frase del depósito: "le prometí fotos del iPhone 16 Pro (depósito): mandáselas". */
function avisoFotosDeposito(modelos) {
  return `le prometí fotos del ${(modelos || []).join(' y del ')} (depósito): mandáselas`;
}

/** Para las pruebas: olvida el índice leído y los avisos dados. */
function _reiniciar() {
  cache = { clave: null, fotos: [] };
  avisados.clear();
}

/**
 * La frase cuando de un modelo van fotos pero alguna unidad no tiene (12/10/2026, decisión de Tomás): la pone el
 * código después de las fotos (cerebro.js), y el 📌 al grupo lleva el código de la unidad sin foto.
 */
const FRASE_SIN_FOTO = 'mirá, no sé si me queda en este colorcito porque no estoy en el depósito, cuando llegue te confirmo bien';

module.exports = {
  FRASE_SIN_FOTO,
  TOPE,
  MAX_EN_LA_FOTO,
  ARCHIVO_INDICE,
  claveModelo,
  claveColor,
  leerIndice,
  hayIndice,
  rutaDe,
  fotoPara,
  pieDe,
  lugarEnLaFoto,
  textoDePosicion,
  elegirFotos,
  fraseFotosDeposito,
  avisoFotosDeposito,
  _reiniciar,
};
