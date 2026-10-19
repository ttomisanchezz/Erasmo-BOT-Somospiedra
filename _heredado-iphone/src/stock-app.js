'use strict';
/**
 * El stock de la app en la planilla (08/10/2026, decisiones de Tomás; parte 2 del diseño de escritorio del
 * Cortex, areas/contabilidad/diseno-escritorio/README.md). La planilla del Cotizador en el Drive es donde vive
 * todo (precios, entrega mínima, qué hay): Tomás la mira y la toca ahí, la app la cambia por medio del bot y
 * Chiara la sigue leyendo como hoy (sheets.js). El contrato es la migración 0018 de la app de ventas.
 *
 * CADA 1 MINUTO (`vuelta`), contra el Supabase de la app (el mismo del panel Chiara y del espejo):
 *   1. aplica las órdenes de la app (`planilla_ordenes` pendientes, tipo 'stock'): escribe SÍ o NO en la
 *      columna STOCK de esa fila de LISTA o LISTA 85-93 (por `fila_id` si viene; si no, por modelo +
 *      capacidad + condición) y marca la orden 'hecha' o 'error' (con el motivo: no la encontró, hay más de
 *      una, o la pestaña no tiene la columna STOCK: el bot NO crea columnas). Después el espejo copia STOCK.
 *   2. lee `v_stock_chiara` (lo que Chiara puede ofrecer del local: disponibles, con precio y "Chiara lo
 *      ofrece") y la escribe en la pestaña USADOS, con la forma de USADOS: una unidad por fila, el código de
 *      la app como ID, y la entrega mínima de LISTA (si el precio es de una lista, de esa; si es a mano, de la
 *      que le toca por la batería: sellado o 100 % → LISTA, de 80 a 95 % → LISTA 85-93) para ese modelo,
 *      capacidad y condición; sin pestaña, sin fila, o con un mínimo que no es menor que el precio, la unidad
 *      se vende solo de contado (sheets.js la marca `solo_contado`). Escribe solo las columnas de datos y
 *      conserva las fórmulas (Pago_unico, Cuota_de_2…): las vuelve a escribir tal cual, relativas a la fila;
 *      las columnas que no conoce se vacían (se avisan una vez al arrancar). Lo que se cargue a mano en USADOS
 *      se pisa. Si Supabase no contesta, la vista no viene como una lista o la planilla no se puede leer, NO
 *      pisa USADOS: queda lo último, y se ve en el log y en /salud (`stockApp.ultimoError`). Una vista vacía
 *      (HTTP 200, lista vacía) con filas en la pestaña recién la vacía a la tercera vuelta seguida.
 *      Las órdenes que Google no deja escribir (503, timeout) quedan pendientes y se reintentan (hasta 30
 *      vueltas o 1 hora); 'error' de una, solo por motivos del negocio. Cada llamada a Google tiene 30 s de tope.
 *
 * EL INTERRUPTOR, `STOCK_APP_MODO` (config.stockApp.modo), apagado por defecto:
 *   apagado  nada de esto corre.
 *   sombra   escribe la pestaña "USADOS APP" (la crea si no existe: es la única pestaña que puede crear),
 *            con el mismo formato que USADOS, para compararla en el Drive; aplica las órdenes y el espejo
 *            copia STOCK. Chiara contesta como hoy: sin el filtro de STOCK ni la frase del depósito.
 *   vivo     escribe USADOS y Chiara usa lo nuevo (sheets.js, cerebro.js): local primero, el depósito son
 *            las filas de LISTA con STOCK distinto de NO, la frase del depósito con el día, y el código del
 *            equipo al escalar.
 *
 * EL DÍA DEL DEPÓSITO (`diaDelDeposito`): de lunes a jueves "mañana"; viernes, sábado y domingo "el lunes",
 * en hora de Argentina. Lo calcula el código, nunca Sonnet.
 *
 * LO QUE PASÓ HOY (08/10/2026, diseño de escritorio del Cortex; `anotarOferta`), solo en vivo: cada vuelta que
 * deja USADOS al día compara los códigos que Chiara ofrece del local (las filas que escribió) con los de la
 * vuelta anterior. Código nuevo → "empezó a ofrecer"; código que ya no está → "dejó de ofrecer", sin el porqué
 * (la vista no lo dice). Un cambio de precio no es noticia. El detalle es el equipo: "iPhone 15 Pro 256GB 92% ·
 * $870.000 · 15P-256-001". Las noticias van a quien escuche (`alCambiarLaOferta`: el panel, que las sube a
 * bot_eventos). Sin avalancha: la lista anterior queda en disco (`data/stock-ofrece.json`, al lado del estado)
 * y sin ella (o ilegible) la vuelta es la base y no avisa nada; la vista que falla o no se escribe no compara;
 * la vacía, recién cuando vacía USADOS (a la tercera vuelta seguida); más de 15 cambios en una vuelta, un solo
 * resumen por tipo ("18 equipos"). El depósito (LISTA con STOCK) no entra.
 *
 * Nunca tira. Lee la planilla con el cliente de sheets.js (`clienteGoogle`, con permiso de escritura).
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const sheets = require('./sheets');
const espejo = require('./espejo-cotizador');
const { unReintento, horaAR } = require('./supabase-reintento');

const MIN = 60 * 1000;
const CADA_MS = MIN;
/**
 * La primera vuelta a los 30 s y las demás cada 1 minuto contado desde esa (08/10/2026, timeouts de Supabase): el
 * panel Chiara sale a los 15 s y en cada minuto justo desde que arrancó el bot, y el espejo del Cotizador a los 45 s.
 * Así ninguna vuelta le pega a Supabase en el mismo segundo que otra.
 */
const PRIMERA_MS = 30 * 1000;
const TOPE_MS = 15000;
const PESTANA_USADOS = 'USADOS';
const PESTANAS_LISTA = ['LISTA', 'LISTA 85-93'];
const MAX_ORDENES = 50;
/** Google no contesta: tope por llamada, así una colgada no deja la vuelta trabada (`enVuelta`). */
const TOPE_GOOGLE_MS = 30000;
/** Una orden que no se pudo escribir por un error de Google queda pendiente y se reintenta: hasta tantas vueltas o tanto tiempo. */
const ORDEN_MAX_INTENTOS = 30;
const ORDEN_MAX_MS = 60 * MIN;
/** La vista vacía (HTTP 200, lista vacía) con filas en USADOS: recién a la tercera vuelta seguida se vacía. */
const VACIAS_PARA_VACIAR = 3;
/** Las columnas de USADOS que escribe el bot (como las normaliza sheets.js: minúsculas, sin tildes, `_`). */
const COLUMNAS_DE_DATOS = ['id', 'modelo', 'capacidad_gb', 'color', 'bateria_pct', 'detalles', 'precio_contado', 'precio_cotizacion', 'anticipo_min', 'foto_lista', 'disponible', 'notas'];
/** Lo que pasó hoy: con más cambios que estos en una vuelta, un solo resumen por tipo en vez de uno por equipo. */
const MAX_NOTICIAS = 15;

const modo = () => config.stockApp.modo;
const prendido = () => modo() !== 'apagado';
const configurado = () => Boolean(prendido() && config.techsur.supabaseUrl && config.techsur.supabaseKey);
/** La pestaña que se escribe: USADOS en vivo, "USADOS APP" en sombra. */
const pestanaDestino = () => (modo() === 'vivo' ? PESTANA_USADOS : config.stockApp.pestanaSombra);

// ============================================================ el día del depósito

const ZONA = 'America/Argentina/Buenos_Aires';
const DIA_AR = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });

/**
 * Cuándo llega lo del depósito, según el día de hoy en Argentina (decisión de Tomás del 08/10/2026): de
 * lunes a jueves "mañana"; viernes, sábado y domingo "el lunes". Lo decide el código, no Sonnet.
 */
function diaDelDeposito(ahora = Date.now()) {
  const dia = DIA_AR.format(new Date(Number(ahora)));
  const semana = new Date(`${dia}T12:00:00Z`).getUTCDay(); // 0 domingo … 6 sábado
  return semana >= 1 && semana <= 4 ? 'mañana' : 'el lunes';
}

/**
 * La frase del depósito que el código pone donde Sonnet escribe `[deposito]` (cerebro.js). Desde el 12/10/2026
 * (decisión de Tomás, pruebas en vivo): va recién cuando el cliente lo quiere, y no nombra el depósito. De lunes a
 * jueves "te lo puedo tener para mañana o pasado"; de viernes a domingo "si me bancás 10 minutos te confirmo bien
 * para cuándo lo puedo tener" (el finde se puede conseguir, pero lo confirma Tomás).
 */
function fraseDeposito(ahora = Date.now()) {
  return diaDelDeposito(ahora) === 'mañana' ? 'te lo puedo tener para mañana o pasado' : 'si me bancás 10 minutos te confirmo bien para cuándo lo puedo tener';
}

// ============================================================ chiquitos

const normalizar = (s) =>
  String(s ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .trim()
    .replace(/\s+/g, '_');

/** "iPhone 14  Pro" → "iphone 14 pro": para comparar modelos (como `clave_modelo` de la 0018). */
const claveModelo = (s) => normalizar(sheets.modeloProlijo(s)).replace(/_/g, ' ');

/** "128GB" → 128, "1TB" → 1024, "" → null. */
function gbDe(capacidad) {
  const m = /^\s*(\d+(?:[.,]\d+)?)\s*(gb|tb)?\s*$/i.exec(String(capacidad ?? ''));
  if (!m) return null;
  const n = parseFloat(m[1].replace(',', '.'));
  if (!(n > 0)) return null;
  return (m[2] || '').toLowerCase() === 'tb' ? Math.round(n * 1024) : Math.round(n);
}

/** 128 → "128GB", 1024 → "1TB" (como la copia del espejo). */
function capacidadTexto(gb) {
  const n = Number(gb);
  if (!(n > 0)) return null;
  if (n >= 1024) return `${n / 1024}TB`;
  if (n <= 4) return `${n}TB`;
  return `${n}GB`;
}

function condicionDe(c) {
  const t = String(c || '').trim().toLowerCase();
  if (t.startsWith('sellad') || t.startsWith('nuev')) return 'sellado';
  if (t.startsWith('usad')) return 'usado';
  return null;
}

/** La letra de una columna (0 → A, 25 → Z, 26 → AA). */
function letra(indice) {
  let n = indice + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const esFormula = (v) => typeof v === 'string' && v.startsWith('=');
const vacio = (v) => v === undefined || v === null || v === '';

/**
 * Una fórmula copiada a otra fila, como lo hace la planilla al arrastrarla: cada referencia sin `$` en la
 * fila ("G5", "CONFIG!B3") se corre `delta` filas; las ancladas ("$B$2", "G$5") quedan. Los nombres de
 * función (LOG10) y lo que no es una referencia no se tocan.
 */
function formulaEnOtraFila(formula, delta) {
  if (!delta) return formula;
  return String(formula).replace(/(?<![A-Za-z0-9_])(\$?)([A-Z]{1,3})(\$?)(\d+)(?![A-Za-z0-9_(])/g, (todo, colFija, col, filaFija, fila) =>
    filaFija ? todo : `${colFija}${col}${Math.max(1, Number(fila) + delta)}`
  );
}

// ============================================================ Supabase

function cabeceras(extra = {}) {
  const key = config.techsur.supabaseKey;
  const h = { apikey: key, ...extra };
  if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`;
  return h;
}

/** Un pedido a Supabase; un 57014 o un timeout se reintenta una vez (src/supabase-reintento.js) y queda en el log. */
function pedir(ruta, opciones) {
  const tabla = ruta.split('?')[0];
  return unReintento(
    () => pedirUnaVez(ruta, opciones),
    (e, ms) => console.warn(`[stock-app] ${horaAR()} ${tabla}: ${e.message}; reintento en ${ms / 1000} s`)
  );
}

async function pedirUnaVez(ruta, { method = 'GET', body = null, prefer = null } = {}) {
  const url = `${config.techsur.supabaseUrl.replace(/\/$/, '')}/rest/v1/${ruta}`;
  const extra = {};
  if (body) extra['Content-Type'] = 'application/json';
  if (prefer) extra.Prefer = prefer;
  const res = await fetch(url, { method, headers: cabeceras(extra), body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(TOPE_MS) });
  if (!res.ok) {
    // Solo el código y el mensaje de PostgREST (sin `details`, que trae la fila): esto va a /salud.
    const crudo = await res.text().catch(() => '');
    let detalle = '';
    try {
      const j = JSON.parse(crudo);
      detalle = [j.code, String(j.message || '').replace(/:\s*".*$/, '')].filter(Boolean).join(' ');
    } catch {
      detalle = '';
    }
    const e = new Error(`Supabase ${res.status} en ${ruta.split('?')[0]}${detalle ? `: ${detalle.slice(0, 160)}` : ''}`);
    e.status = res.status;
    throw e;
  }
  return method === 'GET' ? res.json() : null;
}

/** Las filas de `v_stock_chiara`, en orden. Tira si la respuesta no es una lista: no se pisa nada con eso. */
async function leerVista() {
  const filas = await pedir('v_stock_chiara?select=*&order=modelo.asc,capacidad.asc,codigo.asc');
  if (!Array.isArray(filas)) throw new Error('v_stock_chiara no devolvió una lista');
  return filas;
}

// ============================================================ la planilla

const api = () => sheets.clienteGoogle();

/** Una llamada a Google con tope: si no termina en TOPE_GOOGLE_MS, tira. */
function conTope(promesa, que) {
  let t;
  const tope = new Promise((_, no) => {
    t = setTimeout(() => no(new Error(`Google no contestó en ${TOPE_GOOGLE_MS / 1000} s (${que})`)), TOPE_GOOGLE_MS);
  });
  return Promise.race([promesa, tope]).finally(() => clearTimeout(t));
}

/** Las celdas de una pestaña. `formulas`: las fórmulas como texto ("=G5-H5") en vez de su valor. */
async function leerCeldas(nombre, { formulas = false } = {}) {
  const { data } = await conTope(
    api().spreadsheets.values.get({
      spreadsheetId: config.sheets.id,
      range: `'${nombre}'!${sheets.rangoUsados()}`,
      valueRenderOption: formulas ? 'FORMULA' : 'UNFORMATTED_VALUE',
    }),
    `leer ${nombre}`
  );
  return data.values || [];
}

/**
 * La cabecera de una pestaña: la fila de encabezados (`iCab`) y el índice de cada columna por su nombre
 * normalizado. null si no tiene la columna Modelo.
 */
function cabeceraDe(celdas) {
  const iCab = sheets.buscarEncabezados(celdas, 'Modelo');
  if (iCab < 0) return null;
  const nombres = (celdas[iCab] || []).map((c) => normalizar(c));
  const columnas = new Map();
  nombres.forEach((n, j) => {
    if (n && !columnas.has(n)) columnas.set(n, j);
  });
  return { iCab, nombres, columnas, ancho: nombres.length };
}

// ---------------------------------------------------------------- la entrega mínima de LISTA

/** Las filas de LISTA y LISTA 85-93 (con la forma de la copia del espejo), por pestaña. Tira si una no se lee. */
async function leerListas() {
  const out = {};
  for (const nombre of PESTANAS_LISTA) out[nombre] = espejo.aFilas(nombre, await leerCeldas(nombre));
  return out;
}

/**
 * En qué pestaña buscar la entrega mínima de un equipo del local: la de su precio si salió de una lista; si
 * el precio es a mano, la que le toca por la batería (sellado o 100 % → LISTA; de 80 a 95 % → LISTA 85-93,
 * la misma regla que `pestana_de_precio` de la 0018). Con una batería que no entra en ninguna (menos de
 * 80 %, de 96 a 99 %, sin dato), null: no hay entrega mínima, se vende solo de contado.
 */
function pestanaPara(equipo) {
  if (PESTANAS_LISTA.includes(equipo.precio_de)) return equipo.precio_de;
  const pct = Number(equipo.bateria_pct);
  if (equipo.condicion === 'sellado' || pct === 100) return 'LISTA';
  if (pct >= 80 && pct <= 95) return 'LISTA 85-93';
  return null;
}

/**
 * La entrega mínima de LISTA (o LISTA 85-93) para un equipo del local (decisión de Tomás del 08/10/2026):
 * en la pestaña que le toca (`pestanaPara`), la fila del mismo modelo, con la misma capacidad y condición si
 * la fila las dice. Si hay más de una, la más alta (lo que protege al negocio). Sin pestaña, sin fila, o con
 * una entrega mínima que no es menor que el precio del equipo: null, solo de contado.
 */
function entregaMinimaDe(listas, equipo) {
  const nombre = pestanaPara(equipo);
  if (!nombre) return null;
  const modelo = claveModelo(equipo.modelo);
  const capacidad = String(equipo.capacidad || '').trim().toUpperCase() || null;
  const condicion = condicionDe(equipo.condicion);
  const minimos = (listas[nombre] || [])
    .filter((f) => claveModelo(f.modelo) === modelo)
    .filter((f) => !f.capacidad || !capacidad || String(f.capacidad).toUpperCase() === capacidad)
    .filter((f) => !f.condicion || !condicion || f.condicion === condicion)
    .map((f) => Number(f.anticipo_min))
    .filter((n) => n > 0);
  if (!minimos.length) return null;
  const minimo = Math.max(...minimos);
  return minimo < Number(equipo.precio) ? minimo : null;
}

// ---------------------------------------------------------------- las filas de USADOS

/** Una fila de `v_stock_chiara` como va a USADOS (por nombre de columna). */
function filaDeUsados(equipo, listas) {
  const sellado = equipo.condicion === 'sellado' || /sellad/i.test(String(equipo.bateria || ''));
  const pct = Number(equipo.bateria_pct);
  const minimo = entregaMinimaDe(listas, equipo);
  const deDonde = equipo.precio_de === 'a mano' ? 'precio a mano' : equipo.precio_de ? `precio de ${equipo.precio_de}` : '';
  return {
    id: String(equipo.codigo || '').trim(),
    modelo: sheets.modeloProlijo(equipo.modelo),
    capacidad_gb: gbDe(equipo.capacidad) ?? '',
    color: String(equipo.color || '').trim(),
    bateria_pct: sellado ? 'SELLADO' : pct > 0 ? pct : '',
    detalles: String(equipo.detalle || '').replace(/\s+/g, ' ').trim(),
    precio_contado: Math.round(Number(equipo.precio)),
    precio_cotizacion: '',
    anticipo_min: minimo ?? '',
    foto_lista: 'SI',
    disponible: 'SI',
    notas: [deDonde, minimo ? '' : 'sin entrega minima: solo contado'].filter(Boolean).join(' · '),
  };
}

/** Las filas de USADOS a partir de la vista: solo las que traen código, modelo y precio. */
function filasDesdeLaVista(vista, listas) {
  return (vista || [])
    .filter((e) => e && String(e.codigo || '').trim() && String(e.modelo || '').trim() && Number(e.precio) > 0)
    .map((e) => filaDeUsados(e, listas));
}

// ---------------------------------------------------------------- qué escribir

/**
 * Qué escribir en la pestaña de destino para que quede con `filas` (puro, para las pruebas). `molde` son
 * las celdas de USADOS con las fórmulas como texto (de ahí salen la cabecera y las fórmulas); `actuales`,
 * las de la pestaña de destino (también con fórmulas). Devuelve null si no hay cabecera con Modelo, o
 *   { iCab, desde, hasta, datos: [{ rango, values }], formulas: [{ rango, values }], cambia }
 * `desde`/`hasta` son índices de fila (0 = la fila 1). Se escriben las filas de datos desde la primera
 * después de la cabecera hasta la última que tenía algo (así lo viejo se borra) o hasta la última nueva.
 * Las columnas de datos van con RAW (un "12/10" en Detalles no se vuelve fecha); las de fórmulas (las que
 * en USADOS tienen una fórmula en alguna fila, se llamen como se llamen), con USER_ENTERED y la fórmula
 * del molde corrida a esa fila. Las demás columnas se vacían. `cambia` dice si lo que hay difiere de lo
 * que se quiere escribir.
 */
function planDeEscritura(molde, actuales, filas) {
  const cab = cabeceraDe(molde);
  if (!cab) return null;
  const { iCab, nombres, columnas, ancho } = cab;
  // El molde de cada columna de fórmulas: la primera fila de USADOS que tiene una.
  const moldes = new Map();
  for (let j = 0; j < ancho; j++) {
    for (let i = iCab + 1; i < molde.length; i++) {
      const v = (molde[i] || [])[j];
      if (esFormula(v)) {
        moldes.set(j, { formula: v, fila: i });
        break;
      }
    }
  }
  // Una columna con fórmula en USADOS se conserva como fórmula aunque tenga un nombre de dato (si
  // Anticipo_min fuera una fórmula de la planilla, manda la planilla: no se le escribe el mínimo de LISTA).
  const esColumnaDeFormula = (j) => moldes.has(j);
  // Hasta dónde hay algo escrito en el destino (en las columnas que no son de fórmulas).
  let ultimaOcupada = iCab;
  for (let i = iCab + 1; i < actuales.length; i++) {
    const fila = actuales[i] || [];
    if (fila.some((v, j) => !vacio(v) && !esColumnaDeFormula(j) && !esFormula(v))) ultimaOcupada = i;
  }
  const desde = iCab + 1;
  const hasta = Math.max(ultimaOcupada, iCab + filas.length);
  if (hasta < desde) return { iCab, desde, hasta, datos: [], formulas: [], cambia: false, desconocidas: nombres.filter((n, j) => n && !esColumnaDeFormula(j) && !COLUMNAS_DE_DATOS.includes(n)) };

  const grilla = [];
  for (let i = desde; i <= hasta; i++) {
    const nueva = filas[i - desde] || null;
    const celdas = [];
    for (let j = 0; j < ancho; j++) {
      if (esColumnaDeFormula(j)) {
        const m = moldes.get(j);
        celdas.push(formulaEnOtraFila(m.formula, i - m.fila));
      } else if (nueva && COLUMNAS_DE_DATOS.includes(nombres[j])) {
        celdas.push(nueva[nombres[j]] ?? '');
      } else {
        celdas.push('');
      }
    }
    grilla.push(celdas);
  }
  const actual = [];
  for (let i = desde; i <= hasta; i++) {
    const fila = actuales[i] || [];
    actual.push(Array.from({ length: ancho }, (_, j) => (vacio(fila[j]) ? '' : fila[j])));
  }
  const cambia = JSON.stringify(grilla) !== JSON.stringify(actual);
  // Las columnas que no son de fórmulas ni de la app: se vacían (decisión de Tomás: lo que se carga a mano se pisa).
  const desconocidas = nombres.filter((n, j) => n && !esColumnaDeFormula(j) && !COLUMNAS_DE_DATOS.includes(n));

  // Los bloques de columnas seguidas de la misma clase, cada uno con su rango.
  const bloques = (clase) => {
    const out = [];
    let j = 0;
    while (j < ancho) {
      if (esColumnaDeFormula(j) !== clase) {
        j++;
        continue;
      }
      let k = j;
      while (k + 1 < ancho && esColumnaDeFormula(k + 1) === clase) k++;
      out.push({ rango: `${letra(j)}${desde + 1}:${letra(k)}${hasta + 1}`, values: grilla.map((fila) => fila.slice(j, k + 1)) });
      j = k + 1;
    }
    return out;
  };
  return { iCab, desde, hasta, datos: bloques(false), formulas: bloques(true), cambia, desconocidas };
}

// ---------------------------------------------------------------- escribir

/** Las pestañas que ya se sabe que existen (una consulta por arranque). */
let pestanasConocidas = null;

async function existePestana(nombre) {
  if (!pestanasConocidas) {
    const { data } = await conTope(api().spreadsheets.get({ spreadsheetId: config.sheets.id, fields: 'sheets.properties(sheetId,title)' }), 'las pestañas');
    pestanasConocidas = new Set((data.sheets || []).map((s) => (s.properties || {}).title));
  }
  return pestanasConocidas.has(nombre);
}

/**
 * Crea la pestaña de la sombra ("USADOS APP") con las filas de arriba de USADOS (título y cabecera), tal
 * cual. Es la única pestaña que el bot puede crear; USADOS, LISTA y LISTA 85-93 tienen que existir.
 */
async function crearPestanaSombra(nombre, molde, iCab) {
  await conTope(
    api().spreadsheets.batchUpdate({
      spreadsheetId: config.sheets.id,
      requestBody: { requests: [{ addSheet: { properties: { title: nombre } } }] },
    }),
    `crear ${nombre}`
  );
  const arriba = molde.slice(0, iCab + 1).map((fila) => (fila || []).map((v) => (vacio(v) ? '' : v)));
  const ancho = Math.max(1, ...arriba.map((f) => f.length));
  await conTope(
    api().spreadsheets.values.update({
      spreadsheetId: config.sheets.id,
      range: `'${nombre}'!A1:${letra(ancho - 1)}${arriba.length}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: arriba.map((f) => [...f, ...Array(ancho - f.length).fill('')]) },
    }),
    `la cabecera de ${nombre}`
  );
  pestanasConocidas.add(nombre);
  console.log(`[stock-app] cree la pestaña ${nombre} con la cabecera de USADOS`);
}

// Las columnas de USADOS que el bot no conoce y vacía: se avisan una vez por arranque (para verlas en sombra).
let desconocidasAvisadas = false;

/**
 * Escribe `filas` en la pestaña de destino (USADOS en vivo, USADOS APP en sombra), conservando las
 * fórmulas. Devuelve { pestana, filas, escribio } (`escribio` false si no había cambios; con
 * `esperandoVacia`, la vista vino vacía y todavía no se vacía: ver `vaciar`). Tira si la planilla no se
 * puede leer o escribir: quien llama no pisa nada. `vaciar`: si `filas` está vacía y la pestaña tiene
 * algo, recién se vacía con `vaciar: true` (la tercera vuelta seguida con la vista vacía).
 */
async function escribirUsados(filas, { vaciar = true } = {}) {
  const destino = pestanaDestino();
  const molde = await leerCeldas(PESTANA_USADOS, { formulas: true });
  const cab = cabeceraDe(molde);
  if (!cab) throw new Error('USADOS no tiene la columna Modelo: no sé dónde escribir');
  let actuales = molde;
  if (destino !== PESTANA_USADOS) {
    try {
      if (!(await existePestana(destino))) await crearPestanaSombra(destino, molde, cab.iCab);
      actuales = await leerCeldas(destino, { formulas: true });
    } catch (e) {
      // Si alguien borró la pestaña con el bot andando, la próxima vuelta la vuelve a buscar (y a crear).
      pestanasConocidas = null;
      throw e;
    }
  }
  const plan = planDeEscritura(molde, actuales, filas);
  if (plan.desconocidas.length && !desconocidasAvisadas) {
    desconocidasAvisadas = true;
    console.warn(`[stock-app] USADOS tiene columnas que no conozco y que vacío al escribir: ${plan.desconocidas.join(', ')}`);
  }
  if (!plan.cambia) return { pestana: destino, filas: filas.length, escribio: false };
  if (!filas.length && !vaciar) return { pestana: destino, filas: 0, escribio: false, esperandoVacia: true };
  const escribir = (bloques, valueInputOption) =>
    bloques.length
      ? conTope(
          api().spreadsheets.values.batchUpdate({
            spreadsheetId: config.sheets.id,
            requestBody: { valueInputOption, data: bloques.map((b) => ({ range: `'${destino}'!${b.rango}`, values: b.values })) },
          }),
          `escribir ${destino}`
        )
      : null;
  await escribir(plan.datos, 'RAW');
  await escribir(plan.formulas, 'USER_ENTERED');
  return { pestana: destino, filas: filas.length, escribio: true };
}

// ============================================================ las órdenes de STOCK

/**
 * Escribe SÍ o NO en la columna STOCK de la fila que pide la orden. Devuelve { estado: 'hecha', fila } o
 * { estado: 'error', error }. Por `fila_id` si viene; si no, por modelo + capacidad + condición. Con cero o
 * más de una fila, error con el motivo; sin la columna STOCK en esa pestaña, error ("Falta la columna
 * STOCK en LISTA"): el bot no crea columnas. Tira si la planilla no se puede leer o escribir.
 */
async function escribirStock(orden) {
  const pestana = String(orden.pestana || '').trim();
  if (!PESTANAS_LISTA.includes(pestana)) return { estado: 'error', error: `pestaña desconocida: ${pestana || '(vacía)'}` };
  if (orden.tipo !== 'stock') return { estado: 'error', error: `orden desconocida: ${orden.tipo}` };
  if (typeof orden.valor !== 'boolean') return { estado: 'error', error: 'la orden no dice SÍ o NO (valor)' };
  const celdas = await leerCeldas(pestana);
  const cab = cabeceraDe(celdas);
  if (!cab) return { estado: 'error', error: `La pestaña ${pestana} no tiene la columna Modelo` };
  const jStock = cab.columnas.get('stock');
  if (jStock === undefined) return { estado: 'error', error: `Falta la columna STOCK en ${pestana}` };
  const col = (fila, nombre) => {
    const j = cab.columnas.get(nombre);
    return j === undefined ? '' : (fila || [])[j];
  };
  const filaId = String(orden.fila_id || '').trim().toLowerCase();
  const modelo = claveModelo(orden.modelo);
  const capacidad = String(orden.capacidad || '').trim().toUpperCase() || null;
  const condicion = condicionDe(orden.condicion);
  const que = filaId ? `la fila ${orden.fila_id}` : [orden.modelo, orden.capacidad, orden.condicion].filter(Boolean).join(' ');
  const indices = [];
  for (let i = cab.iCab + 1; i < celdas.length; i++) {
    const fila = celdas[i] || [];
    if (filaId) {
      if (String(col(fila, 'id') ?? '').trim().toLowerCase() === filaId) indices.push(i);
      continue;
    }
    if (!String(col(fila, 'modelo') ?? '').trim() || claveModelo(col(fila, 'modelo')) !== modelo) continue;
    const cap = capacidadTexto(col(fila, 'capacidad_gb'));
    if (capacidad && cap && cap !== capacidad) continue;
    const cond = condicionDe(col(fila, 'condicion'));
    if (condicion && cond && cond !== condicion) continue;
    indices.push(i);
  }
  if (!indices.length) return { estado: 'error', error: `No encontré ${que} en ${pestana}` };
  if (indices.length > 1) return { estado: 'error', error: `Hay ${indices.length} filas de ${que} en ${pestana}: no sé cuál` };
  const i = indices[0];
  await conTope(
    api().spreadsheets.values.update({
      spreadsheetId: config.sheets.id,
      range: `'${pestana}'!${letra(jStock)}${i + 1}`,
      valueInputOption: 'RAW',
      requestBody: { values: [[orden.valor ? 'SI' : 'NO']] },
    }),
    `escribir STOCK en ${pestana}`
  );
  return { estado: 'hecha', fila: i + 1 };
}

/** Los intentos de cada orden que no se pudo escribir por un error de Google (id → { intentos, desde }), en memoria. */
const intentosDeOrden = new Map();

/**
 * Las órdenes pendientes, de la más vieja a la más nueva: cada una se escribe en la planilla y se marca
 * 'hecha' o 'error'. 'error' de una, solo por motivos del negocio (no la encontró, hay dos, falta la columna
 * STOCK). Si Google falla (503, timeout), la orden queda pendiente y se reintenta en la vuelta siguiente,
 * hasta ORDEN_MAX_INTENTOS vueltas o ORDEN_MAX_MS: recién ahí 'error' ("la planilla no contesta"). Escribir
 * SÍ o NO es idempotente: si el PATCH falla, en la vuelta siguiente se vuelve a escribir lo mismo. Devuelve
 * cuántas aplicó (hechas o con error).
 */
async function aplicarOrdenes(ahora) {
  const ordenes = await pedir(`planilla_ordenes?select=id,tipo,pestana,fila_id,modelo,capacidad,condicion,valor,creado_en&estado=eq.pendiente&order=creado_en.asc&limit=${MAX_ORDENES}`);
  let n = 0;
  let hechas = 0;
  for (const o of Array.isArray(ordenes) ? ordenes : []) {
    const que = `${o.pestana} ${o.fila_id || [o.modelo, o.capacidad, o.condicion].filter(Boolean).join(' ')} → ${o.valor ? 'SÍ' : 'NO'}`;
    let r;
    try {
      r = await escribirStock(o);
      intentosDeOrden.delete(o.id);
    } catch (e) {
      const antes = intentosDeOrden.get(o.id) || { intentos: 0, desde: ahora };
      const intento = { intentos: antes.intentos + 1, desde: antes.desde };
      intentosDeOrden.set(o.id, intento);
      const agotada = intento.intentos >= ORDEN_MAX_INTENTOS || ahora - intento.desde >= ORDEN_MAX_MS;
      if (!agotada) {
        console.warn(`[stock-app] orden ${que}: la planilla no contestó (${String(e.message || e).slice(0, 120)}); queda pendiente, intento ${intento.intentos}`);
        continue;
      }
      intentosDeOrden.delete(o.id);
      r = { estado: 'error', error: `la planilla no contesta (${intento.intentos} intentos): ${String(e.message || e).slice(0, 160)}` };
    }
    console.log(`[stock-app] orden ${que}: ${r.estado}${r.error ? ` (${r.error})` : r.fila ? ` (fila ${r.fila})` : ''}`);
    try {
      await pedir(`planilla_ordenes?id=eq.${encodeURIComponent(o.id)}&estado=eq.pendiente`, {
        method: 'PATCH',
        body: { estado: r.estado, hecha_en: new Date(ahora).toISOString(), error: r.estado === 'error' ? String(r.error || 'error').slice(0, 300) : null },
        prefer: 'return=minimal',
      });
    } catch (e) {
      fallo('órdenes', e);
    }
    n++;
    if (r.estado === 'hecha') hechas++;
    resumenOrdenes.ultima = { que, estado: r.estado, error: r.error || null, en: new Date(ahora).toISOString() };
    resumenOrdenes[r.estado === 'hecha' ? 'hechas' : 'errores']++;
  }
  if (hechas) {
    // Chiara (en vivo) y la app se enteran ya: la caché de la planilla y la copia del espejo.
    sheets.invalidarCache();
    await espejo.copiar(ahora);
  }
  return n;
}

// ============================================================ lo que pasó hoy: empezó y dejó de ofrecer

const EMPEZO = 'empezo_a_ofrecer';
const DEJO = 'dejo_de_ofrecer';
const oyentes = [];

/**
 * Quien quiere enterarse de lo que Chiara empezó o dejó de ofrecer del local (el panel, que lo sube a
 * bot_eventos): `fn({ tipo, en, codigo, detalle })`, una vez por noticia; `codigo` null en un resumen. Un
 * oyente que tira no cambia nada de la vuelta. Devuelve la función para sacarlo.
 */
function alCambiarLaOferta(fn) {
  if (typeof fn !== 'function') return () => {};
  oyentes.push(fn);
  return () => {
    const i = oyentes.indexOf(fn);
    if (i >= 0) oyentes.splice(i, 1);
  };
}

/** Dónde queda la lista de lo que Chiara ofrece: al lado del estado (data/stock-ofrece.json). */
function rutaOfrece() {
  if (config.estadoPath) return path.join(path.dirname(config.estadoPath), 'stock-ofrece.json');
  return path.join(__dirname, '..', 'data', 'stock-ofrece.json');
}

/** Una fila de USADOS dicha para el panel: "iPhone 15 Pro 256GB 92% · $870.000 · 15P-256-001". */
function equipoDicho(f) {
  const bateria = f.bateria_pct === 'SELLADO' ? 'sellado' : Number(f.bateria_pct) > 0 ? `${f.bateria_pct}%` : '';
  const equipo = [f.modelo, capacidadTexto(f.capacidad_gb), bateria].filter(Boolean).join(' ');
  return [equipo, `$${Math.round(Number(f.precio_contado)).toLocaleString('es-AR')}`, f.id].join(' · ');
}

/** Lo que Chiara ofrecía en la vuelta anterior (código → cómo se dice). undefined: todavía no se leyó el disco; null: sin base. */
let ofrece;
/** No se pudo guardar la última lista: se vuelve a intentar en la vuelta siguiente aunque no cambie. */
let ofreceSinGuardar = false;

/** La lista de disco, o null si no hay o no se puede leer (esa vuelta es la base). */
function leerOfrece() {
  try {
    const d = JSON.parse(fs.readFileSync(rutaOfrece(), 'utf8'));
    if (!d || !d.equipos || typeof d.equipos !== 'object' || Array.isArray(d.equipos)) throw new Error('no tiene la forma esperada');
    return new Map(Object.entries(d.equipos).map(([codigo, dicho]) => [codigo, String(dicho)]));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`[stock-app] no pude leer ${rutaOfrece()} (${e.message}): esta vuelta es la base de "lo que pasó hoy"`);
    return null;
  }
}

/** Escribe la lista en disco (atómico). Devuelve si pudo. */
function guardarOfrece(lista, ahora) {
  const archivo = rutaOfrece();
  const tmp = archivo + '.tmp';
  try {
    fs.mkdirSync(path.dirname(archivo), { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify({ v: 1, en: new Date(ahora).toISOString(), equipos: Object.fromEntries(lista) }));
    fs.renameSync(tmp, archivo);
    return true;
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      /* ya no está */
    }
    fallo('lo que ofrece', e);
    return false;
  }
}

/**
 * Compara lo que Chiara ofrece ahora del local (`filas`, las que se escribieron en USADOS) con la vuelta
 * anterior y avisa a los oyentes: "empezó a ofrecer" los códigos nuevos y "dejó de ofrecer" los que ya no
 * están (con cómo se decían, el último precio incluido; sin el porqué). Sin lista anterior (la primera vez, o
 * el archivo ilegible) es la base: no avisa nada. Más de MAX_NOTICIAS cambios: un resumen por tipo. Guarda la
 * lista en disco si cambió (o si la última no se pudo guardar). Devuelve las noticias.
 */
function anotarOferta(filas, ahora) {
  const ahoraOfrece = new Map(filas.map((f) => [String(f.id), equipoDicho(f)]));
  if (ofrece === undefined) ofrece = leerOfrece();
  const antes = ofrece;
  const noticias = [];
  if (antes) {
    const entraron = [...ahoraOfrece].filter(([codigo]) => !antes.has(codigo));
    const salieron = [...antes].filter(([codigo]) => !ahoraOfrece.has(codigo));
    if (entraron.length + salieron.length > MAX_NOTICIAS) {
      for (const [tipo, lista] of [[EMPEZO, entraron], [DEJO, salieron]]) {
        if (lista.length) noticias.push({ tipo, en: ahora, codigo: null, detalle: lista.length === 1 ? '1 equipo' : `${lista.length} equipos` });
      }
    } else {
      for (const [codigo, detalle] of entraron) noticias.push({ tipo: EMPEZO, en: ahora, codigo, detalle });
      for (const [codigo, detalle] of salieron) noticias.push({ tipo: DEJO, en: ahora, codigo, detalle });
    }
  }
  const igual = antes && antes.size === ahoraOfrece.size && [...ahoraOfrece].every(([codigo, dicho]) => antes.get(codigo) === dicho);
  ofrece = ahoraOfrece;
  if (!igual || ofreceSinGuardar) ofreceSinGuardar = !guardarOfrece(ahoraOfrece, ahora);
  for (const n of noticias) {
    console.log(`[stock-app] lo que pasó hoy: ${n.tipo === EMPEZO ? 'empezó a ofrecer' : 'dejó de ofrecer'} ${n.detalle}`);
    for (const fn of oyentes.slice()) {
      try {
        fn({ ...n });
      } catch (e) {
        console.error('[stock-app] el panel no pudo anotar lo que pasó con el stock:', e.message);
      }
    }
  }
  return noticias;
}

// ============================================================ la vuelta

let timers = [];
let enVuelta = false;
let ultimaVuelta = null;
let ultimoError = null;
const errores = new Map();
let resumenUsados = { pestana: null, filas: null, escribioEn: null, leidoEn: null, vistaVaciaHace: null };
const resumenOrdenes = { hechas: 0, errores: 0, ultima: null };

function fallo(paso, e) {
  const msg = (e && e.message) || String(e);
  ultimoError = { paso, msg, en: new Date().toISOString() };
  const antes = errores.get(paso);
  if (!antes || antes.msg !== msg || Date.now() - antes.en > 10 * MIN) {
    console.error(`[stock-app] ${horaAR()} ${paso}: ${msg}`);
    errores.set(paso, { msg, en: Date.now() });
  }
}

async function paso(nombre, fn) {
  try {
    const r = await fn();
    if (errores.has(nombre)) {
      errores.delete(nombre);
      console.log(`[stock-app] ${horaAR()} ${nombre}: anda de nuevo`);
    }
    return r;
  } catch (e) {
    fallo(nombre, e);
    return null;
  }
}

/**
 * La vista a USADOS (o a USADOS APP). Si algo falla (Supabase, la vista, LISTA, USADOS), tira y no se
 * escribe nada: queda lo último. Devuelve lo que hizo.
 */
let vaciasSeguidas = 0;
async function sincronizarUsados(ahora) {
  const vista = await leerVista();
  const listas = await leerListas();
  const filas = filasDesdeLaVista(vista, listas);
  // La vista vacía (una lista vacía, con HTTP 200): puede ser que no haya nada en el local, o un error que
  // no se ve. Si la pestaña tiene filas, se pide VACIAS_PARA_VACIAR vueltas seguidas vacías antes de vaciarla.
  vaciasSeguidas = vista.length ? 0 : vaciasSeguidas + 1;
  const r = await escribirUsados(filas, { vaciar: vaciasSeguidas >= VACIAS_PARA_VACIAR });
  if (r.esperandoVacia) {
    console.warn(`[stock-app] v_stock_chiara vino vacía (${vaciasSeguidas} de ${VACIAS_PARA_VACIAR} vueltas seguidas): no vacío ${r.pestana} todavía`);
  }
  resumenUsados = { ...resumenUsados, pestana: r.pestana, filas: r.filas, leidoEn: new Date(ahora).toISOString(), vistaVaciaHace: r.esperandoVacia ? vaciasSeguidas : null };
  if (r.escribio) {
    resumenUsados.escribioEn = new Date(ahora).toISOString();
    const sinMinimo = filas.filter((f) => !f.anticipo_min).length;
    console.log(`[stock-app] ${r.pestana}: ${r.filas} equipo(s) del local${sinMinimo ? ` (${sinMinimo} sin entrega mínima: solo de contado)` : ''}`);
    // En vivo Chiara lee USADOS: que vea lo nuevo en esta misma vuelta.
    if (r.pestana === PESTANA_USADOS) sheets.invalidarCache();
  }
  // Lo que pasó hoy (solo en vivo): USADOS quedó con `filas`. La vista vacía cuenta recién a la tercera vuelta
  // seguida, cuando vacía USADOS (la regla de arriba): antes no es "dejó de ofrecer".
  if (modo() === 'vivo' && (filas.length || vaciasSeguidas >= VACIAS_PARA_VACIAR)) anotarOferta(filas, ahora);
  return r;
}

/** Una vuelta: las órdenes y la vista. Devuelve { ordenes, usados } o null si no corrió. */
async function vuelta(ahora = Date.now()) {
  if (!configurado() || enVuelta) return null;
  enVuelta = true;
  const r = { ordenes: 0, usados: null };
  try {
    r.ordenes = (await paso('órdenes', () => aplicarOrdenes(ahora))) || 0;
    r.usados = await paso('usados', () => sincronizarUsados(ahora));
    ultimaVuelta = ahora;
  } finally {
    enVuelta = false;
  }
  return r;
}

/** Arranca las vueltas (a los 30 s y cada 1 minuto desde esa: ver PRIMERA_MS). Solo desde index.js, al levantar el puerto. */
function arrancar() {
  if (!prendido()) return false;
  if (!configurado()) {
    console.warn(`[stock-app] STOCK_APP_MODO=${modo()} pero faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY: no corre`);
    return false;
  }
  const una = setTimeout(() => {
    vuelta().catch(() => {});
    const cada = setInterval(() => vuelta().catch(() => {}), CADA_MS);
    if (typeof cada.unref === 'function') cada.unref();
    timers.push(cada);
  }, PRIMERA_MS);
  if (typeof una.unref === 'function') una.unref();
  timers = [una];
  return true;
}

/** Para /salud. */
function resumen() {
  return {
    modo: modo(),
    activo: configurado(),
    pestana: prendido() ? pestanaDestino() : null,
    ultimaVuelta: ultimaVuelta ? new Date(ultimaVuelta).toISOString() : null,
    ultimoError,
    usados: resumenUsados,
    ordenes: { ...resumenOrdenes },
  };
}

module.exports = {
  diaDelDeposito,
  fraseDeposito,
  vuelta,
  arrancar,
  resumen,
  alCambiarLaOferta,
  // las piezas, para las pruebas
  anotarOferta,
  rutaOfrece,
  planDeEscritura,
  formulaEnOtraFila,
  filasDesdeLaVista,
  entregaMinimaDe,
  pestanaPara,
  escribirUsados,
  escribirStock,
  aplicarOrdenes,
  letra,
  ORDEN_MAX_INTENTOS,
  VACIAS_PARA_VACIAR,
  _reiniciar() {
    for (const t of timers) clearTimeout(t);
    timers = [];
    pestanasConocidas = null;
    intentosDeOrden.clear();
    vaciasSeguidas = 0;
    ofrece = undefined; // como un reinicio: la lista anterior se vuelve a leer de disco
    ofreceSinGuardar = false;
    desconocidasAvisadas = false;
    enVuelta = false;
    ultimaVuelta = null;
    ultimoError = null;
    errores.clear();
    resumenUsados = { pestana: null, filas: null, escribioEn: null, leidoEn: null, vistaVaciaHace: null };
    resumenOrdenes.hechas = 0;
    resumenOrdenes.errores = 0;
    resumenOrdenes.ultima = null;
  },
};
