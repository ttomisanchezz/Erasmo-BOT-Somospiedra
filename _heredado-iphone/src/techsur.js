'use strict';
/**
 * Precios de TechSur (01/10/2026, pedido de Tomás).
 *
 * TechSur (facu, el proveedor principal) publica lo que tiene en stock en el grupo Avisos de su
 * comunidad de WhatsApp, y el número del bot está en esa comunidad. Este módulo lee esos avisos y
 * guarda cada equipo con precio en la tabla `precios_proveedor` del Supabase de la app de ventas
 * (migración 0010), que los muestra en el panel Cotización con un buscador.
 *
 * Reglas:
 *   * Solo lee. Al grupo no se le escribe nunca, no pasa por Gemini y no toca a ningún cliente.
 *   * Sin IA: los avisos tienen formas fijas y se leen con reglas (ver `parsearAviso`):
 *       - usados: "📲IPHONE 16 PRO MAX 256GB $870USD", abajo el COLOR y abajo las baterías de cada
 *         unidad ("90% 92% 88%"), que pueden seguir en otra línea;
 *       - sellados: "LISTADO DE EQUIPOS SELLADOS ...", "📦IPHONE 15 128GB $720USD" y el color abajo;
 *       - una foto con el texto "IPhone 16 Pro 128GB 89% $760usd";
 *       - otros productos: "PS5 Física 1Tb" y abajo "1U x $815USD", "3U x $805USD";
 *       - listas por tramo de batería (la "LISTA MAYORISTA" del 07/10): un encabezado "Batería 85% a 99%" o
 *         "Con batería nueva" y abajo "iPhone 13 128GB - USD 280". El tramo va en la nota (ver `tramoDe`).
 *     Lo que no trae un precio en dólares ("JUEVES INGRESA 17 PRO MAX") no se guarda.
 *   * Nunca tira: si algo falla lo anota en consola y el bot sigue como si nada.
 *   * Cada aviso del grupo queda tal cual en data/techsur.jsonl, para volver a leerlo si el parser
 *     se equivocó: `npm run techsur -- --recargar`.
 *   * Solo inserta, y el mismo aviso dos veces no se duplica (único por proveedor, mensaje y posición).
 *     Si Supabase no contesta, las filas esperan en memoria y se reintentan cada 5 minutos.
 *   * Avisos de más de 7 días no se guardan: la app tampoco los muestra.
 *
 * Qué grupo es: TECHSUR_GRUPO_JID si está en el .env (puede ser más de uno, con comas). Si no, cada
 * grupo nuevo que escribe se le pregunta a Evolution cómo se llama, y es de TechSur si el nombre
 * contiene TECHSUR_GRUPO_NOMBRE ("techsur" por defecto; sin importar mayúsculas, espacios ni
 * tildes). Al encontrarlo lo dice en consola, para fijarlo en el .env.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const PROVEEDOR = 'TECH SUR';
const DIA_MS = 24 * 60 * 60 * 1000;
const REINTENTO_MS = 5 * 60 * 1000;
const PREGUNTAR_DE_NUEVO_MS = 10 * 60 * 1000;
const TOPE_MS = 8000;

// ============================================================ lectura del aviso

// Emojis, banderas, tonos de piel y los unidores. El "1" de un "1️⃣" queda.
const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{1F3FB}-\u{1F3FF}️‍⃣]/gu;
const LETRAS = 'A-Za-zÁÉÍÓÚÜÑáéíóúüñ';
const NUM = String.raw`(\d{1,3}(?:[.,]\d{3})+|\d+)(?:[.,](\d{1,2}))?`;

// Un precio en dólares, en las formas en que se escribe: "$870USD", "US$ 870", "870 usd" y "$600"
// (01/10: TechSur a veces no pone "USD"). En ese grupo todo es en dólares; un precio en pesos tendría
// seis cifras ("$870.000") y queda afuera por el tope de 20.000.
const PRECIOS = [
  new RegExp(String.raw`\$\s*${NUM}\s*(?:usd|u\$s|us\$|d[oó]lares)(?![${LETRAS}])`, 'i'),
  new RegExp(String.raw`(?:u\$s|us\$|usd)\s*${NUM}`, 'i'),
  new RegExp(String.raw`(?<![\d.,])${NUM}\s*(?:usd|u\$s|d[oó]lares)(?![${LETRAS}])`, 'i'),
  new RegExp(String.raw`(?<![\w$])\$\s*${NUM}(?![\d.,]*\d)(?![${LETRAS}])`, 'i'),
];

// Palabras que no son un color aunque vengan solas en una línea.
const NO_ES_COLOR = /unidad|stock|listad|sellad|usad|ingres|disponib|precio|consult|oferta|promo|nuev|[uú]ltim|actualiz|garant|env[ií]o|retir|pago|efectivo|transfer|detalle|caja|cargador|marca|ray[oa]|golpe|cambiad|bater[ií]a|pantalla|carcasa|m[oó]dulo|\bcon\b|\bsin\b/i;

function aNumero(entero, decimales) {
  const n = parseInt(String(entero).replace(/[.,]/g, ''), 10);
  if (!Number.isFinite(n)) return null;
  return decimales ? n + parseInt(decimales.padEnd(2, '0'), 10) / 100 : n;
}

/** El primer precio en dólares de la línea: { usd, inicio, fin } o null. */
function buscarPrecio(linea) {
  let mejor = null;
  for (const re of PRECIOS) {
    const m = re.exec(linea);
    if (!m) continue;
    if (!mejor || m.index < mejor.inicio) {
      const usd = aNumero(m[1], m[2]);
      if (usd !== null && usd >= 10 && usd <= 20000) mejor = { usd, inicio: m.index, fin: m.index + m[0].length };
    }
  }
  return mejor;
}

const titulo = (s) =>
  s
    .toLowerCase()
    .split(/\s+/)
    .filter(Boolean)
    .map((p) => p[0].toUpperCase() + p.slice(1))
    .join(' ');

const sinTildes = (s) => s.normalize('NFD').replace(/[̀-ͯ]/g, '');

function esColor(s) {
  const t = String(s || '').trim();
  if (!t || t.length > 30 || NO_ES_COLOR.test(t)) return false;
  if (!new RegExp(`^[${LETRAS}][${LETRAS} /]*$`).test(t)) return false;
  return t.split(/\s+/).length <= 4;
}

// Lo que viene antes de un precio y no es un producto ("COMISIÓN $1.500USD (REVENTA)").
const NO_ES_PRODUCTO = /^(?:comisi[oó]n|reventa|cliente|precio|total|env[ií]o|se[ñn]a|anticipo|desde)\b/i;

const BATERIAS = /^(?:\d{2,3}\s*%[\s,;/-]*)+$/;
const COLOR_Y_BATERIAS = new RegExp(String.raw`^([${LETRAS}][${LETRAS} /]*?)\s*[:\-]?\s*((?:\d{2,3}\s*%[\s,;/-]*)+)$`);

function baterias(s) {
  return [...String(s).matchAll(/(\d{2,3})\s*%/g)].map((m) => Number(m[1])).filter((b) => b >= 50 && b <= 100);
}

/**
 * El tramo de batería de un encabezado (08/10/2026, decisión de Tomás: la "LISTA MAYORISTA" del 07/10 trae
 * "Batería 85% a 99%" (13 128 a US$280) y "Con batería nueva" (13 128 a US$300), y los dos salían con la misma
 * clave). Una línea sin precio que habla de la batería: un rango ("Batería 85% a 99%" → "batería 85-99%") o la
 * batería nueva o al 100% ("Con batería nueva", "USADOS CON BATERIA 100%" → "batería 100%"). El rango puede ir
 * con "a", "al" o "-" ("80% a 94%", "del 80 al 94%", "85-99%"). "Batería baja" no es un tramo: un aviso de
 * batería baja lleva su nota, como siempre, y ningún tramo (ver `parsearAviso`). Devuelve el tramo o null.
 */
const TRAMO_100 = 'batería 100%';
const RANGO_DE_BATERIA = /(\d{2,3})\s*%?\s*(?:a|al|-)\s*(\d{2,3})\s*%/i;

function tramoDe(linea) {
  if (!/bater[ií]a/i.test(linea)) return null;
  const r = RANGO_DE_BATERIA.exec(linea);
  if (r) return `batería ${Number(r[1])}-${Number(r[2])}%`;
  if (/bater[ií]as?\s+nuevas?\b/i.test(linea) || /\b100\s*%/.test(linea)) return TRAMO_100;
  return null;
}

/**
 * ¿Una línea sin precio es un título que corta el tramo? Toda en negrita ("*USADOS PROMO*", "*ULTIMAS UNIDADES*🔥") y
 * que no es un iPhone ("*IPHONE 15 128GB*" es el nombre de los que siguen). Un color ("PINK X3") o un nombre sin
 * negrita no cortan.
 */
function esTitulo(cruda, linea) {
  if (!/^[_~]*\*[^*].*\*[_~]*$/.test(cruda.replace(EMOJI, '').trim())) return false;
  const info = leerNombre(linea);
  return !(info && /^iPhone\b/.test(info.modelo));
}

/**
 * Lo que dice el nombre de un equipo: "IPHONE 16 PRO MAX 256GB", "IPhone 16 Pro 128GB 89%",
 * "PS5 Física 1Tb". Devuelve { modelo, capacidad, baterias, color, extra } o null si no queda nombre.
 * `extra` es lo que sobra de un iPhone y no es un color ("con detalles"): va como nota.
 */
function leerNombre(nombre) {
  let resto = ` ${nombre} `;
  const bats = baterias(resto);
  resto = resto.replace(/\d{2,3}\s*%/g, ' ');

  let capacidad = null;
  const cap = /(\d{2,4}|1|2)\s*(gb|tb|g|t)(?![a-z])/i.exec(resto);
  if (cap) {
    capacidad = `${Number(cap[1])}${cap[2].toUpperCase().replace(/^([GT])$/, '$1B')}`;
    resto = resto.slice(0, cap.index) + ' ' + resto.slice(cap.index + cap[0].length);
  }

  // "ULTIMAS UNIDADES DE 18 PRO": lo de adelante no es el nombre.
  resto = ` ${resto.replace(/^\s*(?:[uú]ltimas?\s+unidades?|ingres[oó]s?|ingresan?|llegaron|lleg[oó]|stock|disponibles?|oferta|promo)\s*(?:de\s+|del\s+)?/i, ' ')} `;
  // Un iPhone escrito sin la palabra: empieza con 11 a 19 y no dice otra cosa ("18 PRO", "15 128").
  if (!/iphone/i.test(resto) && /^\s*1[1-9](e)?(?:\s+(?:pro\s*max|pro|plus|max|mini))?\s*$/i.test(resto)) resto = ` iphone ${resto.trim()} `;
  let modelo = null;
  let color = null;
  let extra = null;
  const ip = /\biphone\s*(\d{1,2}|se|xr|xs|x)(e)?\b\s*(pro\s*max|pro|plus|max|mini)?\b/i.exec(resto);
  if (ip) {
    const num = /^\d+$/.test(ip[1]) ? ip[1] : ip[1].toUpperCase();
    const variante = ip[3] ? ' ' + titulo(ip[3].replace(/\s+/g, ' ')) : '';
    modelo = `iPhone ${num}${ip[2] ? 'e' : ''}${variante}`;
    const sobra = (resto.slice(0, ip.index) + ' ' + resto.slice(ip.index + ip[0].length)).replace(/\s+/g, ' ').trim();
    if (esColor(sobra)) color = titulo(sobra);
    else if (sobra && /[a-z]/i.test(sobra)) extra = sobra.toLowerCase();
  } else {
    const limpio = resto.replace(/\s+/g, ' ').replace(/^[\s\-:|=x]+|[\s\-:|=]+$/gi, '').trim();
    if (!limpio || !/[A-Za-z0-9]/.test(limpio)) return null;
    // Todo en mayúsculas ("AIRPODS PRO 2") se pasa a "Airpods Pro 2"; lo que vino prolijo, queda.
    modelo = limpio === limpio.toUpperCase() ? limpio.split(' ').map((p) => (/\d/.test(p) ? p : titulo(p))).join(' ') : limpio;
  }
  return { modelo, capacidad, baterias: bats, color, extra };
}

/**
 * Los equipos con precio de un aviso, en el orden en que aparecen. Cada uno:
 *   { modelo, capacidad, condicion, precio_usd, detalle: [{ color, baterias }], nota, texto, clave }
 * `condicion` es 'usado' si trae baterías, 'sellado' si lo dice el aviso o viene con 📦, y null si
 * no se sabe. `clave` agrupa el mismo equipo entre avisos: modelo + capacidad + condición + nota
 * ("1U", "batería baja", "con detalles": cada uno es otro precio y no tapa al común).
 *
 * El tramo de batería (08/10/2026) también va en `nota`: el del último encabezado de arriba (`tramoDe`, vale
 * hasta el próximo encabezado, otro título en negrita o el fin del aviso) o, si el equipo trae 100% como única
 * batería ("IPHONE 13 128GB 100% $295"), "batería 100%". Solo en los iPhone que no son sellados, y nunca en un
 * aviso de batería baja (queda "batería baja", como siempre). Si el equipo ya tenía una nota, el tramo va
 * adelante, separado por una coma: "batería 100%, 1U", "batería 100%, con detalles".
 */
function parsearAviso(textoCrudo) {
  const texto = String(textoCrudo || '');
  const avisoSellados = /sellad/i.test(texto);
  const avisoUsados = /usad/i.test(texto);
  // "USADOS BATERIA BAJA": es otro precio que el de los usados comunes, va como nota (y en la clave).
  const notaAviso = /bater[ií]a\s+baja/i.test(texto) ? 'batería baja' : null;
  const items = [];
  let actual = null; // el equipo al que se le van sumando colores y baterías
  let ultimoTexto = ''; // la última línea sin precio: el nombre de un "1U x $815USD"
  let tramo = null; // el tramo de batería del último encabezado ("batería 85-99%")

  const lineas = [];
  for (const l of texto.split(/\r?\n/)) lineas.push(...l.split(/\s+(?:\/\/|\|)\s+/));
  for (const cruda of lineas) {
    const original = cruda.replace(/[*_~`]/g, '').trim();
    const linea = original.replace(EMOJI, ' ').replace(/\s+/g, ' ').trim();
    if (!linea) {
      actual = null;
      continue;
    }

    const precio = buscarPrecio(linea);
    if (precio) {
      const antes = linea.slice(0, precio.inicio).replace(/[\s\-:|=]+$/, '').trim();
      const despues = linea.slice(precio.fin).replace(/^[\s\-:|=]+/, '').trim();
      if (NO_ES_PRODUCTO.test(antes)) continue;
      const cantidad = /^(\d{1,3})\s*(?:u(?:nidad(?:es)?|n)?\.?\s*(?:x|de|a)?|x)$/i.exec(antes);
      let base = antes;
      let colorSuelto = null;
      let nota = null;
      const soloCapacidad = /^(\d{2,4}|1|2)\s*(gb|tb)$/i.test(antes);
      if (cantidad || !antes) {
        base = ultimoTexto;
        if (cantidad) nota = `${Number(cantidad[1])}U`;
      } else if (soloCapacidad && ultimoTexto) {
        // "SAMSUNG S26 ULTRA" y abajo "256GB $1.060USD", "512GB $1.180USD"
        base = `${ultimoTexto} ${antes}`;
      } else if (esColor(antes) && ultimoTexto) {
        base = ultimoTexto;
        colorSuelto = antes;
      }
      // Un nombre que tiene un precio adentro no es un producto ("$35.000USD (CLIENTE FINAL)").
      if (NO_ES_PRODUCTO.test(base) || /\$|usd/i.test(base)) continue;
      const info = base ? leerNombre(base) : null;
      if (!info) continue;
      if (!nota && info.extra) nota = info.extra;
      const color = colorSuelto || info.color || (esColor(despues) ? despues : null);
      const detalle = color || info.baterias.length ? [{ color: color ? titulo(color) : null, baterias: info.baterias }] : [];
      actual = {
        modelo: info.modelo,
        capacidad: info.capacidad,
        precio_usd: precio.usd,
        nota,
        tramo,
        detalle,
        lineas: [original],
        selladoEnLinea: /\u{1F4E6}/u.test(cruda) || /sellad|nuevo/i.test(linea),
      };
      items.push(actual);
      continue;
    }

    if (actual && BATERIAS.test(linea)) {
      if (!actual.detalle.length) actual.detalle.push({ color: null, baterias: [] });
      actual.detalle[actual.detalle.length - 1].baterias.push(...baterias(linea));
      actual.lineas.push(original);
      continue;
    }
    const cb = actual ? COLOR_Y_BATERIAS.exec(linea) : null;
    if (cb && esColor(cb[1])) {
      actual.detalle.push({ color: titulo(cb[1]), baterias: baterias(cb[2]) });
      actual.lineas.push(original);
      continue;
    }
    if (actual && esColor(linea)) {
      actual.detalle.push({ color: titulo(linea), baterias: [] });
      actual.lineas.push(original);
      continue;
    }
    // Texto suelto (un título, un aviso): cierra el equipo abierto. Si es el encabezado de un tramo de
    // batería, vale para los equipos que siguen; otro título lo corta (`esTitulo`).
    const nuevoTramo = tramoDe(linea);
    if (nuevoTramo) tramo = nuevoTramo;
    else if (esTitulo(cruda, linea)) tramo = null;
    actual = null;
    ultimoTexto = linea;
  }

  return items.map((it) => {
    const todas = it.detalle.flatMap((d) => d.baterias);
    const conBaterias = todas.length > 0;
    let condicion = null;
    if (conBaterias) condicion = 'usado';
    else if (it.selladoEnLinea || (avisoSellados && !avisoUsados)) condicion = 'sellado';
    else if (avisoUsados && !avisoSellados) condicion = 'usado';
    // Un aviso de batería baja no lleva tramo, aunque traiga otro encabezado: su nota es "batería baja", como siempre.
    const tramoDelEquipo =
      !notaAviso && /^iPhone\b/.test(it.modelo) && condicion !== 'sellado'
        ? it.tramo || (conBaterias && todas.every((b) => b === 100) ? TRAMO_100 : null)
        : null;
    const nota = [tramoDelEquipo, it.nota || notaAviso].filter(Boolean).join(', ') || null;
    const clave = [sinTildes(it.modelo).toLowerCase().replace(/\s+/g, ' '), (it.capacidad || '').toLowerCase(), condicion || '', sinTildes(nota || '').toLowerCase()].join('|');
    return {
      modelo: it.modelo,
      capacidad: it.capacidad,
      condicion,
      precio_usd: it.precio_usd,
      detalle: it.detalle,
      nota,
      texto: it.lineas.join('\n'),
      clave,
    };
  });
}

// ============================================================ qué grupo es

const gruposTechsur = new Set();
const noSonTechsur = new Set();
const preguntadoEn = new Map(); // jid -> hora del último intento fallido

const normalizarNombre = (s) => sinTildes(String(s || '')).toLowerCase().replace(/[^a-z0-9]/g, '');

function coincideNombre(nombre) {
  const buscado = normalizarNombre(config.techsur.nombre);
  return Boolean(buscado) && normalizarNombre(nombre).includes(buscado);
}

/** El nombre del grupo según Evolution, o null si no contestó. Es una lectura: no escribe a nadie. */
async function nombreDelGrupo(jid) {
  const base = config.evolution.url.replace(/\/$/, '');
  const url = `${base}/group/findGroupInfos/${config.evolution.instancia}?groupJid=${encodeURIComponent(jid)}`;
  const res = await fetch(url, { headers: { apikey: config.evolution.apikey }, signal: AbortSignal.timeout(TOPE_MS) });
  if (!res.ok) throw new Error(`Evolution ${res.status} en findGroupInfos`);
  const info = await res.json().catch(() => ({}));
  return String(info?.subject ?? info?.group?.subject ?? '');
}

async function esElGrupo(jid) {
  if (!jid || !jid.endsWith('@g.us')) return false;
  const fijos = String(config.techsur.grupoJid || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  if (fijos.length) return fijos.includes(jid);
  if (gruposTechsur.has(jid)) return true;
  if (noSonTechsur.has(jid)) return false;
  const antes = preguntadoEn.get(jid);
  if (antes && Date.now() - antes < PREGUNTAR_DE_NUEVO_MS) return false;
  try {
    const nombre = await nombreDelGrupo(jid);
    preguntadoEn.delete(jid);
    if (coincideNombre(nombre)) {
      gruposTechsur.add(jid);
      console.log(`[techsur] grupo encontrado: "${nombre}" ${jid}  <- para fijarlo: TECHSUR_GRUPO_JID=${jid}`);
      return true;
    }
    noSonTechsur.add(jid);
    return false;
  } catch (e) {
    preguntadoEn.set(jid, Date.now());
    console.warn(`[techsur] no pude preguntar el nombre de ${jid}: ${e.message}`);
    return false;
  }
}

// ============================================================ guardar

let pendientes = [];
let timerReintento = null;
let avisoSinSupabase = false;

function configurado() {
  return Boolean(config.techsur.supabaseUrl && config.techsur.supabaseKey);
}

async function insertar(filas, pisar = false) {
  const base = config.techsur.supabaseUrl.replace(/\/$/, '');
  const key = config.techsur.supabaseKey;
  const cabeceras = {
    apikey: key,
    'Content-Type': 'application/json',
    // En vivo, el mismo aviso dos veces no cambia nada. Al volver a leer avisos con el parser
    // corregido (`pisar`), la fila de ese aviso y esa posición se reescribe.
    Prefer: `resolution=${pisar ? 'merge-duplicates' : 'ignore-duplicates'},return=minimal`,
  };
  // Las claves viejas (JWT) también van en Authorization; las nuevas (sb_secret_…) solo en apikey.
  if (key.startsWith('eyJ')) cabeceras.Authorization = `Bearer ${key}`;
  const res = await fetch(`${base}/rest/v1/precios_proveedor?on_conflict=proveedor,mensaje_id,posicion`, {
    method: 'POST',
    headers: cabeceras,
    body: JSON.stringify(filas),
    signal: AbortSignal.timeout(TOPE_MS),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Supabase ${res.status}: ${detalle.slice(0, 200)}`);
  }
}

function programarReintento() {
  if (timerReintento) return;
  timerReintento = setTimeout(() => {
    timerReintento = null;
    guardar([]).catch(() => {});
  }, REINTENTO_MS);
  if (typeof timerReintento.unref === 'function') timerReintento.unref();
}

/**
 * Guarda las filas (y las que quedaron esperando). Devuelve cuántas entraron. Nunca tira.
 * `pisar`: reescribir las filas que ya estaban (solo desde la herramienta, al volver a leer avisos).
 */
async function guardar(filas, { pisar = false } = {}) {
  if (!configurado()) {
    if (!avisoSinSupabase) {
      avisoSinSupabase = true;
      console.warn('[techsur] faltan SUPABASE_URL o SUPABASE_SERVICE_ROLE_KEY en el .env: no guardo los precios');
    }
    return 0;
  }
  const lote = [...pendientes, ...filas];
  if (!lote.length) return 0;
  pendientes = [];
  try {
    await insertar(lote, pisar);
    return lote.length;
  } catch (e) {
    console.error(`[techsur] no pude guardar ${lote.length} precio(s), reintento en 5 min: ${e.message}`);
    pendientes = lote.slice(-500);
    programarReintento();
    return 0;
  }
}

function aFilas(items, mensajeId, publicadoEnMs) {
  const publicado_en = new Date(publicadoEnMs).toISOString();
  return items.map((it, posicion) => ({
    proveedor: PROVEEDOR,
    mensaje_id: mensajeId,
    posicion,
    publicado_en,
    clave: it.clave,
    modelo: it.modelo,
    capacidad: it.capacidad,
    condicion: it.condicion,
    precio_usd: it.precio_usd,
    detalle: it.detalle,
    nota: it.nota,
    texto: it.texto,
  }));
}

// ============================================================ registro local

function rutaLog() {
  return config.techsur.logPath || path.join(__dirname, '..', 'data', 'techsur.jsonl');
}

function anotar(registro) {
  try {
    fs.mkdirSync(path.dirname(rutaLog()), { recursive: true });
    fs.appendFileSync(rutaLog(), JSON.stringify(registro) + '\n');
  } catch (e) {
    console.warn(`[techsur] no pude anotar el aviso en ${rutaLog()}: ${e.message}`);
  }
}

// ============================================================ entrada

/**
 * Un mensaje de un grupo. Si es de TechSur, lo anota y guarda sus precios. Devuelve true si el
 * grupo es de TechSur (haya o no precios), false si no. Nunca tira.
 */
async function recibir(data, texto) {
  try {
    if (!config.techsur.activo) return false;
    const chatId = data?.key?.remoteJid;
    if (!(await esElGrupo(chatId))) return false;
    const id = data?.key?.id;
    const t = String(texto || '').trim();
    if (!id || !t) return true; // una foto sin texto, un sticker: nada que leer
    const ts = Number(data?.messageTimestamp?.low ?? data?.messageTimestamp ?? 0);
    const publicadoEnMs = ts > 0 ? ts * 1000 : Date.now();
    anotar({ id, chat: chatId, ts: publicadoEnMs, texto: t });
    if (Date.now() - publicadoEnMs > config.techsur.diasMax * DIA_MS) return true;
    const items = parsearAviso(t);
    if (!items.length) return true;
    const n = await guardar(aFilas(items, id, publicadoEnMs));
    if (n) console.log(`[techsur] aviso ${id}: ${items.length} precio(s) guardado(s)${n > items.length ? ` y ${n - items.length} que esperaban` : ''}`);
    return true;
  } catch (e) {
    console.error('[techsur]', e.message);
    return false;
  }
}

module.exports = {
  PROVEEDOR,
  parsearAviso,
  buscarPrecio,
  leerNombre,
  coincideNombre,
  esElGrupo,
  recibir,
  guardar,
  aFilas,
  rutaLog,
  // para los tests
  _reiniciar() {
    gruposTechsur.clear();
    noSonTechsur.clear();
    preguntadoEn.clear();
    pendientes = [];
    avisoSinSupabase = false;
    if (timerReintento) clearTimeout(timerReintento);
    timerReintento = null;
  },
};
