'use strict';
/**
 * Lectura de la planilla "Cotizador - Somos iPhone NQN".
 * Es la ÚNICA fuente de precios. Si esto falla, el bot no cotiza.
 */
const fs = require('fs');
const { google } = require('googleapis');
const config = require('./config');

let cache = { datos: null, vence: 0 };
let clienteDePrueba = null;
// La copia congelada de las pruebas (`usarFixture`). Sobrevive a `invalidarCache`: desde el
// 01/10/2026 `#bateria` invalida la caché y una prueba no puede terminar leyendo Google.
let fixture = null;

/**
 * #bateria (01/10/2026, decisión de Tomás): qué lista de usados usa el bot. null es LISTA (al
 * 100%, como siempre); '85-93' es la pestaña `LISTA 85-93`, que se lee aparte y SOLO si está
 * activa: cada fila de LISTA con el mismo ID se reemplaza por la suya, y una fila suya con un
 * ID que no está en LISTA también entra. Si no se puede leer, el bot sigue con LISTA sola y
 * avisa una vez al grupo (`alAvisar`, lo conecta index.js). La elección la guarda bateria.js.
 */
let listaBateria = null;
let avisar = () => {};
let avisadoDe = null;

/**
 * Hasta dónde se leen LISTA (y LISTA X-Y) y USADOS. Con el stock de la app (STOCK_APP_MODO sombra o vivo,
 * 08/10/2026), hasta la Z: la columna STOCK (y las que se sumen después de Notas) tiene que entrar en la
 * lectura, y las de más vienen vacías. Con apagado, los rangos de siempre: la lectura es idéntica.
 */
const rangoLista = () => (config.stockApp.modo === 'apagado' ? 'A1:U200' : 'A1:Z200');
const rangoUsados = () => (config.stockApp.modo === 'apagado' ? 'A1:O200' : 'A1:Z200');

function cliente() {
  if (clienteDePrueba) return clienteDePrueba;
  const cred = JSON.parse(fs.readFileSync(config.sheets.credencialesPath, 'utf8'));
  const auth = new google.auth.JWT({
    email: cred.client_email,
    key: cred.private_key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return google.sheets({ version: 'v4', auth });
}

function aNumero(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return v;
  const s = String(v).trim();
  const soloDigitos = s.replace(/[^0-9.,-]/g, '');
  if (!soloDigitos) return 0;
  const m = soloDigitos.match(/[.,](\d{1,2})$/);
  let limpio;
  if (m) {
    const corte = soloDigitos.lastIndexOf(m[0][0]);
    limpio = soloDigitos.slice(0, corte).replace(/[.,]/g, '') + '.' + soloDigitos.slice(corte + 1);
  } else {
    limpio = soloDigitos.replace(/[.,]/g, '');
  }
  const n = parseFloat(limpio);
  return Number.isFinite(n) ? n : 0;
}

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

/** Busca la fila de encabezados: la primera que contenga la columna pedida. */
function buscarEncabezados(filas, columnaClave) {
  const clave = normalizar(columnaClave);
  for (let i = 0; i < Math.min(filas.length, 15); i++) {
    const fila = filas[i] || [];
    if (fila.some((c) => normalizar(c) === clave)) return i;
  }
  return -1;
}

/**
 * El modelo como se muestra (01/10/2026): "Iphone 18 pro max " → "iPhone 18 Pro Max". Sin
 * espacios de más; solo toca las palabras que conoce (iphone, pro, max, plus, mini, se, xr, xs,
 * x), el resto queda como está cargado.
 */
function modeloProlijo(s) {
  return String(s || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\biphone\b/gi, 'iPhone')
    .replace(/\b(pro|max|plus|mini)\b/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .replace(/\b(se|xr|xs|x)\b/gi, (w) => w.toUpperCase());
}

/**
 * `Bateria_min` tal cual, para mostrar (01/10/2026): 100 → "100", "85-93" → "85-93" (sin el "%",
 * que pone quien la muestra). '' si está vacía o en cero, como hasta ahora. Para una cuenta o una
 * comparación sigue `bateria_min`, el número (de un rango, el primero).
 */
function textoBateria(v) {
  if (!(aNumero(v) > 0)) return '';
  return String(v).replace(/%/g, '').trim();
}

function aObjetos(filas, columnaClave) {
  const iCab = buscarEncabezados(filas, columnaClave);
  if (iCab === -1) return [];
  const cab = (filas[iCab] || []).map((c) => normalizar(c).replace(/\s+/g, '_'));
  const out = [];
  for (let i = iCab + 1; i < filas.length; i++) {
    const fila = filas[i] || [];
    if (fila.every((c) => !String(c || '').trim())) continue;
    const obj = {};
    cab.forEach((nombre, j) => {
      if (nombre) obj[nombre] = fila[j];
    });
    out.push(obj);
  }
  return out;
}

/**
 * La columna STOCK de LISTA y LISTA 85-93 (08/10/2026, decisión de Tomás: lo del depósito son las filas
 * con STOCK distinto de NO). "SÍ", "SI", "si" → 'SI'; "NO" → 'NO'; vacía o cualquier otra cosa → null (se
 * ofrece, como hasta hoy). Si la planilla todavía no tiene la columna, todas vienen null.
 */
function stockDe(v) {
  const t = normalizar(v).replace(/\s+/g, '');
  if (t === 'si') return 'SI';
  if (t === 'no') return 'NO';
  return null;
}

/**
 * Una fila de LISTA (o de una pestaña con su forma, como `LISTA 85-93`), ya normalizada.
 * `Condicion` y `Modelo` sin espacios de más (01/10/2026: "sellado " es "Sellado").
 */
function filaDeLista(f) {
  return {
    origen: 'LISTA',
    id: String(f.id || '').trim(),
    modelo: modeloProlijo(f.modelo),
    capacidad_gb: aNumero(f.capacidad_gb),
    condicion: String(f.condicion || '').trim(),
    bateria_min: aNumero(f.bateria_min),
    // Lo que se muestra (01/10/2026): "85-93" y no 85, que es lo que da aNumero.
    bateria_texto: textoBateria(f.bateria_min),
    precio_contado: aNumero(f.precio_contado),
    // Base para calcular las cuotas. Si la columna no está o está vacía, se
    // usa el contado y el resultado es idéntico al de siempre.
    precio_cotizacion: aNumero(f.precio_cotizacion),
    anticipo_min: aNumero(f.anticipo_min),
    pago_unico_manual: aNumero(f.pago_unico_manual),
    cuota_2_manual: aNumero(f.cuota_2_manual),
    cotizable: String(f.cotizable || '').toUpperCase().trim() === 'SI',
    notas: f.notas || '',
    // La columna STOCK (08/10/2026): 'SI', 'NO' o null. Solo con STOCK_APP_MODO=vivo se filtra (`leerTodo`).
    stock: stockDe(f.stock),
  };
}

/** Con STOCK_APP_MODO=vivo (08/10/2026): una fila de LISTA con STOCK = NO no está en el depósito y no se ofrece. */
const enElDeposito = (f) => f.stock !== 'NO';

/**
 * La planilla como la ve el bot con el stock de la app en vivo (08/10/2026): sin las filas de LISTA (y de
 * `listaAl100`) que tienen STOCK = NO. En apagado y en sombra, `datos` tal cual: Chiara contesta como hoy.
 */
function conStockApp(datos) {
  if (config.stockApp.modo !== 'vivo') return datos;
  const out = { ...datos, lista: (datos.lista || []).filter(enElDeposito) };
  if (Array.isArray(datos.listaAl100)) out.listaAl100 = datos.listaAl100.filter(enElDeposito);
  return out;
}

async function leerTodo() {
  const ahora = Date.now();
  if (cache.datos && ahora < cache.vence) return cache.datos;

  // Sin la lista de usados elegida, la copia congelada sale tal cual (el mismo objeto).
  const base = fixture || (await leerDeGoogle());
  // Con el stock de la app en vivo (08/10/2026), sin las filas con STOCK = NO; si no, tal cual.
  const datos = conStockApp(await conListaBateria(base));
  cache = { datos, vence: fixture ? Number.MAX_SAFE_INTEGER : ahora + config.sheets.cacheSegundos * 1000 };
  return datos;
}

/** El nombre de la pestaña de `#bateria 85-93`: "LISTA 85-93". */
function nombrePestana(rango) {
  return `LISTA ${rango}`;
}

/**
 * Las filas con modelo de una pestaña con la forma de LISTA. Se lee aparte de CONFIG, LISTA y
 * USADOS: si no existe, tira acá y no rompe esa lectura. Con la copia congelada, de
 * `fixture.pestanas`.
 */
async function leerPestanaLista(nombre) {
  if (fixture) {
    const filas = (fixture.pestanas || {})[nombre];
    if (!filas) throw new Error(`la pestaña ${nombre} no existe`);
    return filas.filter((f) => String(f.modelo || '').trim());
  }
  const { data } = await cliente().spreadsheets.values.get({
    spreadsheetId: config.sheets.id,
    range: `'${nombre}'!${rangoLista()}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  return aObjetos(data.values || [], 'Modelo')
    .filter((f) => String(f.modelo || '').trim())
    .map(filaDeLista);
}

/** ¿El error de Google es que la pestaña no existe? ("Unable to parse range: 'LISTA 70-80'!…") */
function pestanaQueNoExiste(e) {
  return /unable to parse range|no existe|not found/i.test(String((e && e.message) || ''));
}

/**
 * Cada fila de `lista` con el mismo ID en `otra` se reemplaza por la de `otra`; las de `otra`
 * con un ID que no está en `lista` (o sin ID) se suman al final. Los ID se comparan sin
 * espacios ni mayúsculas.
 */
function mezclarPorId(lista, otra) {
  const clave = (f) => String(f.id || '').trim().toLowerCase();
  const deLaOtra = new Map(otra.filter(clave).map((f) => [clave(f), f]));
  const usadas = new Set();
  const out = lista.map((f) => {
    const k = clave(f);
    if (!k || !deLaOtra.has(k)) return f;
    usadas.add(k);
    return deLaOtra.get(k);
  });
  for (const f of otra) if (!usadas.has(clave(f))) out.push(f);
  return out;
}

/**
 * Las filas de `lista` que reemplaza `otra` por el mismo ID (bloque Ninjo 1b, decisión de Tomás del
 * 05/10/2026): con `#bateria 85-93`, las de LISTA (al 100% o selladas) que la pestaña activa tapó.
 * Sonnet las ofrece también si preguntan por la batería ("tengo en 85-93% $X, sino al 100% en $Y").
 */
function reemplazadasPorId(lista, otra) {
  const clave = (f) => String(f.id || '').trim().toLowerCase();
  const deLaOtra = new Set(otra.map(clave).filter(Boolean));
  return lista.filter((f) => clave(f) && deLaOtra.has(clave(f)));
}

/**
 * La planilla con la lista de usados elegida. Sin elegir, `base` tal cual. Con una elegida, además
 * `listaAl100`: las filas de LISTA que la elegida reemplazó (`reemplazadasPorId`).
 */
async function conListaBateria(base) {
  if (!listaBateria) return base;
  const nombre = nombrePestana(listaBateria);
  let filas = [];
  try {
    filas = await leerPestanaLista(nombre);
    if (!filas.length) console.warn(`[planilla] ${nombre} no tiene filas con modelo: cotizo con LISTA`);
  } catch (e) {
    console.warn(`[planilla] no pude leer ${nombre}: ${e.message}. Cotizo con LISTA`);
  }
  if (!filas.length) {
    avisarUnaVez(`⚠️ No pude leer ${nombre}: cotizo con LISTA`, nombre);
    return base;
  }
  avisadoDe = null;
  return { ...base, lista: mezclarPorId(base.lista || [], filas), listaAl100: reemplazadasPorId(base.lista || [], filas) };
}

/** Una vez por racha: se rearma cuando la pestaña se lee bien o cuando se elige otra. */
function avisarUnaVez(texto, nombre) {
  if (avisadoDe === nombre) return;
  avisadoDe = nombre;
  try {
    Promise.resolve(avisar(texto)).catch((e) => console.error('[planilla] no pude avisar al grupo:', e.message));
  } catch (e) {
    console.error('[planilla] no pude avisar al grupo:', e.message);
  }
}

/**
 * Antes de cambiar de lista (#bateria): ¿esa pestaña sirve? { ok: true, filas } o { ok: false,
 * motivo } si no existe, no tiene filas con modelo o no se pudo leer.
 */
async function probarListaBateria(rango) {
  const nombre = nombrePestana(rango);
  try {
    const filas = await leerPestanaLista(nombre);
    if (!filas.length) return { ok: false, motivo: `la pestaña ${nombre} no tiene filas con modelo` };
    return { ok: true, filas: filas.length };
  } catch (e) {
    if (pestanaQueNoExiste(e)) return { ok: false, motivo: `la pestaña ${nombre} no existe en la planilla` };
    console.error(`[planilla] no pude leer ${nombre}:`, e.message);
    return { ok: false, motivo: `no pude leer la pestaña ${nombre}` };
  }
}

/** Elige la lista de usados ('85-93' o null para LISTA) y fuerza a releer la planilla. */
function usarListaBateria(rango) {
  listaBateria = rango || null;
  avisadoDe = null;
  invalidarCache();
}

function listaBateriaActiva() {
  return listaBateria;
}

/** Quién avisa al grupo si la pestaña elegida no se puede leer (index.js: evolution.avisarGrupo). */
function alAvisar(fn) {
  avisar = typeof fn === 'function' ? fn : () => {};
}

async function leerDeGoogle() {
  const sheets = cliente();
  const { data } = await sheets.spreadsheets.values.batchGet({
    spreadsheetId: config.sheets.id,
    ranges: ['CONFIG!A1:C30', `LISTA!${rangoLista()}`, `USADOS!${rangoUsados()}`],
    valueRenderOption: 'UNFORMATTED_VALUE',
  });

  const [rConfig, rLista, rUsados] = data.valueRanges.map((r) => r.values || []);

  // --- CONFIG ---
  const paramFilas = aObjetos(rConfig, 'Parametro');
  const cfg = {};
  paramFilas.forEach((f) => {
    cfg[normalizar(f.parametro).replace(/\s+/g, '_')] = f.valor;
  });
  const estado = String(cfg.estado_lista || '').toUpperCase().trim();

  const configPrecios = {
    // Si faltan en CONFIG, los del plan Estándar (negocio/financiacion.md del Cortex): 1,54 y
    // 1,70 desde el 02/10/2026; 1,52 y 1,60 desde el 30/09; hasta ahí 1,26 y 1,35.
    coef1: aNumero(cfg.coef_1_cuota) || 1.54,
    coef2: aNumero(cfg.coef_2_cuotas) || 1.7,
    // La excepción bajo el mínimo (cotizador.js): 67/75 aunque cambie el Estándar (02/10/2026).
    // CONFIG puede traer Coef_1_bajo_minimo / Coef_2_bajo_minimo; si no, los de cotizador.js.
    coef1Bajo: aNumero(cfg.coef_1_bajo_minimo) || require('./cotizador').COEF_BAJO_MINIMO.coef1,
    coef2Bajo: aNumero(cfg.coef_2_bajo_minimo) || require('./cotizador').COEF_BAJO_MINIMO.coef2,
    redondeo: aNumero(cfg.redondeo) || 1000,
    // Umbral_excepcion_pesos y Umbral_excepcion_pct siguen en la planilla pero ya no
    // se leen: desde el bloque 5 (16/09/2026) no hay "POSIBLE EXCEPCIÓN", y hasta
    // TOPE_BAJO_MINIMO ($45.000 desde el 5b) bajo el mínimo se cotiza con recargo (cotizador.js).
    estadoLista: estado || 'SIN CARGAR',
    fechaUltimaLista: cfg.fecha_ultima_lista || '',
  };

  // --- LISTA ---
  const lista = aObjetos(rLista, 'Modelo')
    .filter((f) => String(f.modelo || '').trim())
    .map(filaDeLista);

  // --- USADOS (equipos físicos puntuales) ---
  const usados = aObjetos(rUsados, 'Modelo')
    .filter((f) => String(f.modelo || '').trim())
    .map((f) => ({
      origen: 'USADOS',
      id: String(f.id || '').trim(),
      modelo: modeloProlijo(f.modelo),
      capacidad_gb: aNumero(f.capacidad_gb),
      color: f.color || '',
      bateria_min: aNumero(f.bateria_pct),
      // Un equipo sellado del local (08/10/2026): el stock de la app escribe "SELLADO" en Bateria_pct, y
      // así `esSellado` lo muestra como sellado en todos lados (plantilla, detalle, bloque de Sonnet).
      condicion: /sellad/i.test(String(f.bateria_pct || '')) ? 'Sellado' : '',
      detalles: f.detalles || '',
      precio_contado: aNumero(f.precio_contado),
      precio_cotizacion: aNumero(f.precio_cotizacion),
      anticipo_min: aNumero(f.anticipo_min),
      // Pago_unico y Cuota_de_2 de USADOS son fórmulas de la planilla (saldo × coeficiente, sin
      // los $10.000 por pago), no precios cargados a mano: el bot calcula siempre (30/09/2026;
      // hasta ahí las tomaba como manuales y en la entrega mínima cotizaba sin los $10.000).
      pago_unico_manual: 0,
      cuota_2_manual: 0,
      cotizable:
        String(f.foto_lista || '').toUpperCase().trim() === 'SI' &&
        String(f.disponible || '').toUpperCase().trim() === 'SI',
      // Con el stock de la app en vivo (08/10/2026, decisión de Tomás): una unidad sin entrega mínima (no
      // hay una en LISTA para ese modelo y capacidad) se vende solo de contado; si piden cuotas, se escala
      // (cotizador.cotizar, `SOLO_CONTADO`). En apagado y en sombra no cambia nada.
      ...(config.stockApp.modo === 'vivo' && !(aNumero(f.anticipo_min) > 0) ? { solo_contado: true } : {}),
    }));

  return { config: configPrecios, lista, usados };
}

/**
 * La planilla de hoy con la forma de la copia congelada (CONFIG, LISTA, USADOS y las pestañas de
 * #bateria que se pidan: `{ pestanas: { 'LISTA 85-93': [...] } }`), solo lectura y sin caché. Para
 * `npm run bateria-cerebro -- --planilla-en-vivo` (cerebro Sonnet, fase 2): cada caso arma su
 * planilla sobre una copia de esto y la usa con `usarFixture`. Va antes de cualquier `usarFixture`
 * (con una copia puesta, las pestañas salen de la copia). Una pestaña que no se puede leer no va.
 */
async function copiaEnVivo(rangos = []) {
  const base = await leerDeGoogle();
  const pestanas = {};
  for (const rango of rangos) {
    const nombre = nombrePestana(rango);
    try {
      pestanas[nombre] = await leerPestanaLista(nombre);
    } catch (e) {
      console.warn(`[planilla] no pude leer ${nombre}: ${e.message}`);
    }
  }
  return { ...base, pestanas };
}

/**
 * Modo prueba: en vez de leer Google, usa los datos que le pasen.
 * Sirve para chatear con el bot sin credenciales de Google.
 */
function usarFixture(datos) {
  fixture = datos;
  cache = { datos: null, vence: 0 };
}

/** Fuerza recarga en la próxima lectura (útil tras cargar precios nuevos). La copia congelada queda. */
function invalidarCache() {
  cache = { datos: null, vence: 0 };
}

/**
 * TODAS las filas que coinciden con el modelo que pidió el cliente.
 *
 * Un mismo modelo puede estar en LISTA y además tener una o varias unidades
 * físicas en USADOS. Se devuelven todas, ordenadas por:
 *   1. puntaje de coincidencia — una exacta le gana a una parcial;
 *   2. cotizable antes que no cotizable — una unidad marcada Disponible=NO
 *      o Foto_lista=NO NUNCA puede tapar la fila de LISTA del mismo modelo;
 *   3. precio de contado ascendente — la más barata primero;
 *   4. USADOS antes que LISTA, solo para desempatar a igual precio.
 */
function buscarTodas(datos, texto, capacidad) {
  if (!texto) return [];
  const q = normalizar(texto).replace(/iphone|ip\b|\bip/g, '').trim();
  if (!q) return [];

  const puntaje = (fila) => {
    const m = normalizar(fila.modelo).replace(/iphone/g, '').trim();
    if (m === q) return 100;
    // "13 pro" no debe matchear con "13" ni al revés
    const palabrasQ = q.split(/\s+/).filter(Boolean);
    const palabrasM = m.split(/\s+/).filter(Boolean);
    if (palabrasQ.length !== palabrasM.length) return 0;
    return palabrasQ.every((p, i) => p === palabrasM[i]) ? 90 : 0;
  };

  const primeroUsados = (f) => (f.origen === 'USADOS' ? 0 : 1);
  const ordenar = (xs) =>
    xs
      .sort(
        (a, b) =>
          b.p - a.p ||
          Number(b.f.cotizable) - Number(a.f.cotizable) ||
          a.f.precio_contado - b.f.precio_contado ||
          primeroUsados(a.f) - primeroUsados(b.f)
      )
      .map((x) => x.f);

  const candidatos = [...(datos.usados || []), ...(datos.lista || [])]
    .map((f) => ({ f, p: puntaje(f) }))
    .filter((x) => x.p > 0);

  if (!candidatos.length) return [];

  if (capacidad) {
    const conCap = candidatos.filter((x) => x.f.capacidad_gb === capacidad);
    if (conCap.length) return ordenar(conCap);
  }
  return ordenar(candidatos);
}

/**
 * La mejor fila para el modelo que pidió el cliente: la primera de
 * buscarTodas(). Una unidad sin stock ya no le gana a la fila de LISTA.
 */
function buscarModelo(datos, texto, capacidad) {
  return buscarTodas(datos, texto, capacidad)[0] || null;
}

/** Las columnas de un lead, en orden (A a K). También son los encabezados de respaldo. */
const CAMPOS_LEAD = [
  'fecha',
  'canal',
  'usuario',
  'modelo_consultado',
  'entrega_declarada',
  'forma_pago',
  'permuta',
  'timing',
  'zona',
  'score',
  'estado',
];
const HOJA_LEADS = 'LEADS';

/**
 * Las pestañas de leads que ya se sabe que existen, en esta corrida: se consulta
 * una vez por arranque. Se guarda la promesa y no un sí o no, para que dos leads
 * que llegan juntos esperen la misma consulta y no creen la pestaña dos veces.
 * Si falla, se olvida y el próximo lead vuelve a intentar.
 */
const hojasListas = new Map();

function prepararHoja(api, hoja) {
  if (!hojasListas.has(hoja)) {
    const lista = crearSiFalta(api, hoja);
    hojasListas.set(hoja, lista);
    lista.catch(() => {
      if (hojasListas.get(hoja) === lista) hojasListas.delete(hoja);
    });
  }
  return hojasListas.get(hoja);
}

/**
 * Si la pestaña no existe, la crea con la fila de encabezados de LEADS. Crearla
 * y escribirle los encabezados van en el mismo batchUpdate: o queda con
 * encabezados o no queda, y el próximo lead lo vuelve a intentar.
 */
async function crearSiFalta(api, hoja) {
  const spreadsheetId = config.sheets.id;
  const { data } = await api.spreadsheets.get({ spreadsheetId, fields: 'sheets.properties(sheetId,title)' });
  const pestanas = (data.sheets || []).map((s) => s.properties || {});
  if (pestanas.some((p) => p.title === hoja)) return;

  const encabezados = await encabezadosDeLeads(api);
  // El id de la pestaña nueva se elige acá: hace falta para escribirle los
  // encabezados en el mismo pedido.
  const usados = new Set(pestanas.map((p) => p.sheetId));
  let sheetId;
  do {
    sheetId = 1 + Math.floor(Math.random() * 2e9);
  } while (usados.has(sheetId));
  await api.spreadsheets.batchUpdate({
    spreadsheetId,
    requestBody: {
      requests: [
        { addSheet: { properties: { sheetId, title: hoja } } },
        {
          updateCells: {
            start: { sheetId, rowIndex: 0, columnIndex: 0 },
            rows: [{ values: encabezados.map((t) => ({ userEnteredValue: { stringValue: String(t) } })) }],
            fields: 'userEnteredValue',
          },
        },
      ],
    },
  });
  console.log(`[leads] cree la pestaña ${hoja}`);
}

/** La fila 1 de LEADS. Si no se puede leer o está vacía, los nombres de campo. */
async function encabezadosDeLeads(api) {
  try {
    const { data } = await api.spreadsheets.values.get({
      spreadsheetId: config.sheets.id,
      range: `${HOJA_LEADS}!A1:K1`,
    });
    const fila = (data.values || [])[0] || [];
    if (fila.some((c) => String(c || '').trim())) return fila;
    console.warn('[leads] LEADS no tiene encabezados en la fila 1: uso los nombres de campo');
  } catch (e) {
    console.warn('[leads] no pude leer los encabezados de LEADS, uso los nombres de campo:', e.message);
  }
  return CAMPOS_LEAD;
}

/**
 * Escribe una fila de lead. Va a LEADS salvo que se pida otra pestaña: index.js
 * manda los números de la lista de prueba a LEADS_PRUEBA, con las mismas
 * columnas. Una pestaña que no es LEADS se crea si falta. Si algo falla, tira:
 * quien llama loguea y sigue, y nunca se cae a escribir en LEADS.
 */
async function registrarLead(lead, { hoja = HOJA_LEADS } = {}) {
  const api = cliente();
  if (hoja !== HOJA_LEADS) await prepararHoja(api, hoja);
  try {
    await api.spreadsheets.values.append({
      spreadsheetId: config.sheets.id,
      range: `${hoja}!A:K`,
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [CAMPOS_LEAD.map((c) => lead[c])] },
    });
  } catch (e) {
    // Si alguien borró la pestaña con el bot andando, el próximo lead la vuelve a buscar.
    hojasListas.delete(hoja);
    throw e;
  }
}

/**
 * Pruebas: un cliente de Google de mentira, para no leer las credenciales ni
 * salir a la red. También olvida qué pestañas se sabía que existían.
 */
function usarCliente(api) {
  clienteDePrueba = api;
  hojasListas.clear();
}

module.exports = {
  leerTodo,
  // El cliente de Google con permiso de escritura (el mismo que usa LEADS). Lo usa stock-app.js (08/10/2026)
  // para escribir USADOS y la columna STOCK; en las pruebas es el de `usarCliente`.
  clienteGoogle: cliente,
  buscarEncabezados,
  stockDe,
  rangoLista,
  rangoUsados,
  usarListaBateria,
  listaBateriaActiva,
  probarListaBateria,
  alAvisar,
  mezclarPorId,
  reemplazadasPorId,
  modeloProlijo,
  buscarModelo,
  buscarTodas,
  registrarLead,
  invalidarCache,
  usarFixture,
  copiaEnVivo,
  usarCliente,
  normalizar,
  aNumero,
};
