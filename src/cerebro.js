'use strict';
/**
 * Cerebro Sonnet de Somos Piedra: Claude Sonnet 5.5 decide qué contestar. Es el único que contesta: no hay
 * "bot de siempre" (el motor de reglas de iPhone quedó en _heredado-iphone/, poda del 19/10/2026).
 *
 * Quién atiende cada tanda lo decide `CEREBRO_MODO` (`quienAtiende`):
 *   - `apagado` (lo normal): nadie. El bot escucha, guarda y registra; nunca llama a la API.
 *   - `sombra`: Sonnet piensa con cada tanda (`pensar`) y queda en el registro de aprendizaje como
 *     `propuesta-sonnet`; no se manda nada.
 *   - `tester`, `nuevos`, `todos`: Sonnet contesta de verdad (`contestar`) a los chats que le tocan; los
 *     demás, en sombra.
 * Si Sonnet falla (error de la API, timeout, sin clave) NO hay respaldo: index.js escala en silencio
 * (al cliente no le sale nada y el grupo interno recibe el aviso). Regla heredada del sistema: si no sabe
 * cómo seguir, silencio con el cliente y aviso al grupo.
 *
 * El pedido (`pensar`): las instrucciones de `cerebro-reglas.md` (con cache_control), lo que sabe el estado,
 * las líneas de una persona de la cuenta, las últimas líneas del historial (completado con Evolution por
 * contexto.js, lo llama index.js), la tanda y, en vivo, las fotos del cliente. Sonnet termina con una de
 * dos herramientas: `responder` (de 1 a 4 mensajes) o `escalar` (no le llega nada al cliente; el motivo va
 * al grupo). Lo que no termina así cuenta como escalar.
 *
 * Herramientas de datos (src/herramientas-erasmo.js): `buscar_productos`, `cotizar`, `mandar_catalogo` y
 * `agendar_seguimiento`. Cada una trae su definición para la API y una función que corre con el input y el
 * `turno`; los montos que devuelva van a `turno.montos`, que son los ÚNICOS que la guardia deja escribir. Las
 * dos últimas no hacen nada en el acto: anotan en `turno.acciones` y las ejecuta index.js después de mandar
 * los mensajes (y solo si el turno no termina en `escalar`).
 *
 * La guardia (`revisarSalida`), antes de que algo pueda salir: tope de 4 mensajes (del 4º en adelante van
 * juntos en el 4º) de 300 caracteres como máximo; cualquier monto que no haya devuelto una herramienta de
 * ESTA respuesta frena (un año suelto o una dirección no son montos); nada de prometer que otra persona lo
 * va a contactar ni volver a escribir (src/promesas.js), ni "te falta", ni mandar algo después, ni archivos
 * (salvo el catálogo en PDF, y solo si `mandar_catalogo` salió bien en ESTA respuesta); nada interno
 * (herramientas, el sistema, escalar…); sin marcas de IA ni caracteres raros. Si frena, Sonnet tiene UNA vuelta para
 * corregirlo; si vuelve a frenar, escala.
 *
 * Sin dependencias npm: `fetch` a la API de Anthropic, con timeout y un reintento ante 429/5xx o error de
 * red. Sonnet 5.5 no acepta `tool_choice: any`: va `auto`, y las instrucciones piden terminar con
 * `responder` o `escalar`.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const gemini = require('./gemini');
const promesas = require('./promesas');
const acciones = require('./acciones');
const evolution = require('./evolution');
const chatsViejos = require('./chats-viejos');
const contexto = require('./contexto');
const salida = require('./salida');
const herramientasErasmo = require('./herramientas-erasmo');
const ficha = require('./ficha');

/** Las instrucciones: se leen una vez, al arrancar. Van con cache_control (se reaprovechan). */
const REGLAS = fs.readFileSync(path.join(__dirname, 'cerebro-reglas.md'), 'utf8');

/**
 * La versión de las reglas: los primeros 8 caracteres del sha256 de cerebro-reglas.md, con los finales de
 * línea pasados a \n (da igual en Windows y en Linux). Va en cada propuesta de Sonnet del registro
 * (`sonnet.reglas`), en /salud (`cerebro.reglas`) y en la consola al arrancar (`lineaDeReglas`).
 */
const conFinalesLf = (texto) => String(texto).replace(/\r\n?/g, '\n');
function hashDeReglas(texto) {
  return crypto.createHash('sha256').update(conFinalesLf(texto)).digest('hex').slice(0, 8);
}
const REGLAS_HASH = hashDeReglas(REGLAS);
const REGLAS_LINEAS = conFinalesLf(REGLAS).replace(/\n$/, '').split('\n').length;
/** "CEREBRO: reglas 1a2b3c4d (40 líneas)": lo que dice la consola al arrancar (index.js). */
const lineaDeReglas = () => `CEREBRO: reglas ${REGLAS_HASH} (${REGLAS_LINEAS} líneas)`;

const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSION_API = '2023-06-01';
/** Vueltas de herramientas por turno. La que no termina con responder o escalar, escala. */
const MAX_VUELTAS = 5;
/** Si la guardia frena lo que quería mandar, Sonnet tiene UNA vuelta más para corregirlo. */
const CORRECCIONES = 1;
const MAX_MENSAJES = 4;
const LARGO_MAXIMO = 300;
/** Incluye lo que piensa (adaptive thinking): la respuesta en sí es corta. */
const MAX_TOKENS = 8000;
const ESPERA_REINTENTO_MS = 500;
const ESPERA_REINTENTO_RED_MS = 2000;
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'];

const objeto = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// ---------------------------------------------------------------------------
// Las herramientas
// ---------------------------------------------------------------------------

/** Termina sin mandarle nada al cliente: una persona del negocio sigue el chat. */
const ESCALAR = {
  name: 'escalar',
  description: 'Terminás sin mandarle nada al cliente: una persona del negocio sigue el chat. Usala ante la duda.',
  strict: true,
  input_schema: objeto({ motivo: { type: 'string', description: 'Por qué, en una frase corta para el grupo interno.' } }, ['motivo']),
};

/** Termina con lo que le llega al cliente. */
const RESPONDER = {
  name: 'responder',
  description: 'Terminás con lo que le llega al cliente: de 1 a 4 mensajes, cada uno de hasta 300 caracteres.',
  strict: true,
  input_schema: objeto({ mensajes: { type: 'array', items: { type: 'string' }, description: 'Los mensajes, en orden.' } }, ['mensajes']),
};

/**
 * Las herramientas de datos: `{ definicion, correr(input, turno) }`. `definicion` es lo que va a la API
 * (name, description, input_schema, strict); `correr` devuelve lo que vuelve como tool_result (un objeto;
 * con `error`, vuelve como is_error) y anota en `turno.montos` los montos que se pueden escribir (en pesos)
 * y en `turno.acciones` lo que hay que hacer cuando salgan los mensajes (el catálogo, el seguimiento).
 */
const HERRAMIENTAS_DE_DATOS = herramientasErasmo.HERRAMIENTAS;

/** Las herramientas del pedido: las de datos y las dos que terminan el turno. */
const herramientasEfectivas = () => [...HERRAMIENTAS_DE_DATOS.map((h) => h.definicion), ESCALAR, RESPONDER];
const HERRAMIENTAS = herramientasEfectivas();

// ---------------------------------------------------------------------------
// El gasto del día, en memoria (se pierde con un reinicio). /salud lo muestra.
// ---------------------------------------------------------------------------
const ZONA = 'America/Argentina/Buenos_Aires';
const DIA_ARGENTINA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const usoEnCero = () => ({ entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 });
let gasto = { dia: null, llamadas: 0, ...usoEnCero(), usd: 0 };

function delDia() {
  const hoy = DIA_ARGENTINA.format(Date.now());
  if (gasto.dia !== hoy) gasto = { dia: hoy, llamadas: 0, ...usoEnCero(), usd: 0 };
  return gasto;
}

const seisDecimales = (n) => Math.round(n * 1e6) / 1e6;

/** USD estimados con los precios por millón de config (CEREBRO_USD_*). */
function costo(uso) {
  const p = config.cerebro.usdPorMillon;
  return (uso.entrada * p.entrada + uso.salida * p.salida + uso.cacheLeida * p.cacheLeida + uso.cacheEscrita * p.cacheEscrita) / 1e6;
}

/** Suma el `usage` de una respuesta al turno, al día y al mes. */
function sumarUso(uso, usage) {
  const u = {
    entrada: Number(usage && usage.input_tokens) || 0,
    salida: Number(usage && usage.output_tokens) || 0,
    cacheLeida: Number(usage && usage.cache_read_input_tokens) || 0,
    cacheEscrita: Number(usage && usage.cache_creation_input_tokens) || 0,
  };
  const g = delDia();
  for (const k of Object.keys(u)) {
    uso[k] += u[k];
    g[k] += u[k];
  }
  g.llamadas++;
  g.usd += costo(u);
  sumarAlMes(costo(u));
}

/** Lo del día: llamadas a la API, tokens y USD estimados. */
function gastoDeHoy() {
  const g = delDia();
  return { ...g, usd: seisDecimales(g.usd) };
}

// ---------------------------------------------------------------------------
// El gasto del mes: en estado.json, bajo la clave interna (`gastoSonnetMes: { mes, usd }`), así un
// reinicio no lo pone en 0. El tope de verdad está en la cuenta de Anthropic (CEREBRO_TOPE_MES_USD es
// para verlo): pasado el 80%, un aviso al grupo por mes.
// ---------------------------------------------------------------------------
const MES_ARGENTINA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' });
/** 'AAAA-MM' en Argentina. */
const mesDe = (ts) => MES_ARGENTINA.format(ts).slice(0, 7);

/** Suma `usd` al mes de `ahora`; si lo guardado es de otro mes, arranca de 0. */
function sumarAlMes(usd, ahora = Date.now()) {
  const mes = mesDe(ahora);
  const g = state.gastoSonnetMes();
  const antes = g && g.mes === mes ? Number(g.usd) || 0 : 0;
  state.guardarGastoSonnetMes({ mes, usd: seisDecimales(antes + (Number(usd) || 0)) });
}

/** Para /salud: { mes, usd, tope, porcentaje } del mes de `ahora` (0 si lo guardado es de otro mes). */
function gastoDelMes(ahora = Date.now()) {
  const mes = mesDe(ahora);
  const g = state.gastoSonnetMes();
  const usd = g && g.mes === mes ? seisDecimales(Number(g.usd) || 0) : 0;
  const tope = config.cerebro.topeMesUsd;
  return { mes, usd, tope, porcentaje: Math.round((usd / tope) * 1000) / 10 };
}

/**
 * Al arrancar (index.js): si estado.json no tiene el gasto del mes en curso, se arma UNA vez con el
 * registro de aprendizaje de ese mes (`sonnet.usd` de las `propuesta` que contestó Sonnet y `usd` de las
 * `propuesta-sonnet`). `eventos`: la lista, o una función que la lee. Devuelve si lo armó.
 */
function armarGastoMes({ eventos = [], ahora = Date.now() } = {}) {
  const mes = mesDe(ahora);
  const g = state.gastoSonnetMes();
  if (g && g.mes === mes) return false;
  let usd = 0;
  for (const e of typeof eventos === 'function' ? eventos() : eventos) {
    const ts = Date.parse(e && e.ts);
    if (!Number.isFinite(ts) || mesDe(ts) !== mes) continue;
    if (e.tipo === 'propuesta' && e.sonnet) usd += Number(e.sonnet.usd) || 0;
    else if (e.tipo === 'propuesta-sonnet') usd += Number(e.usd) || 0;
  }
  state.guardarGastoSonnetMes({ mes, usd: seisDecimales(usd) });
  return true;
}

/** "49,00", "60" (el tope, si es entero), "81,7". */
const conComa = (n, decimales) => (decimales == null ? String(n) : n.toFixed(decimales)).replace('.', ',');

/** El aviso del 80% del tope, si toca: { mes, texto } o null. Una sola vez por mes. */
function avisoGastoMes(ahora = Date.now()) {
  const g = gastoDelMes(ahora);
  if (!(g.usd >= g.tope * 0.8) || state.gastoSonnetAvisado() === g.mes) return null;
  const tope = Number.isInteger(g.tope) ? String(g.tope) : conComa(g.tope, 2);
  return { mes: g.mes, texto: `⚠️ Sonnet va US$${conComa(g.usd, 2)} de US$${tope} este mes (${conComa(g.porcentaje)}%)` };
}

/** El aviso del 80% salió: no se repite ese mes. */
function marcarAvisoGastoMes(mes) {
  state.marcarGastoSonnetAvisado(mes);
}

/** Para /salud. `chatsConSonnet`: los que quedaron marcados (`atiendeSonnet`). */
function resumenSalud() {
  const g = gastoDeHoy();
  const chatsConSonnet = Object.values(state.todos()).filter((s) => s && s.atiendeSonnet === true).length;
  return { modo: config.cerebro.modo, llamadasHoy: g.llamadas, usdHoy: g.usd, chatsConSonnet, reglas: REGLAS_HASH, gastoMes: gastoDelMes(), enFalla: caido };
}

// ---------------------------------------------------------------------------
// La guardia del código
// ---------------------------------------------------------------------------

/** "$1.500.000" (para el motivo de la guardia). */
const pesos = (n) => '$' + Number(n || 0).toLocaleString('es-AR');

// Un número, con $ adelante o "mil" / "k" / "lucas" atrás si los tiene.
const MONTO = /(\$\s*)?(\d[\d.,]*\d|\d)(\s*(?:mil|k|lucas)\b)?/gi;

/**
 * ¿El número de `m` (un match de MONTO en `t`) es el de una dirección? Después de "calle", "av",
 * "avenida", "ruta", "km", "pasaje", "diagonal", "bv"/"boulevard" o "esquina", o de un nombre propio
 * (una palabra con mayúscula que no arranca la frase: "San Martín 3090", "Santa Fe al 1200"). "Sale 15000"
 * al principio de la frase no es una dirección.
 */
const CALLE_Y_NOMBRE = /\b(?:calle|av|avda|avenida|ruta|km|pasaje|psje|diagonal|diag|bv|boulevard|esquina)\.?(?:\s+[\p{L}.]+){0,3}(?:\s+al)?\s*(?:n[°º]?\s*)?$/iu;
const NOMBRE_PROPIO = /(?:^|[^.!?\n\s])\s+(?:\p{Lu}[\p{L}.]*\s+){0,2}\p{Lu}[\p{L}.]*(?:\s+al)?\s*(?:n[°º]?\s*)?$/u;
function esDireccion(t, m) {
  if (m[1] || m[3]) return false;
  const antes = t.slice(Math.max(0, m.index - 40), m.index);
  return CALLE_Y_NOMBRE.test(antes) || NOMBRE_PROPIO.test(antes);
}

/**
 * Los montos de un texto, en pesos: con $, con 4 cifras o más, o en "mil". "254.000", "254000",
 * "254 mil", "$254 mil", "254k" y "$254.000,00" son todos 254000. "128gb", "100%", "2 bolsas" no son
 * montos, y tampoco un año suelto ("salió en 2024") ni la altura de una dirección ("San Martín 3090").
 */
function montosEn(texto) {
  const t = String(texto || '');
  const out = [];
  for (const m of t.matchAll(MONTO)) {
    const conPeso = Boolean(m[1]);
    const enMiles = Boolean(m[3]);
    if (!conPeso && !enMiles && /^(?:19|20)\d\d$/.test(m[2])) continue;
    if (esDireccion(t, m)) continue;
    const entero = m[2].replace(/[.,]\d{1,2}$/, '');
    const cifras = entero.replace(/[.,]/g, '');
    const valor = enMiles ? Math.round(parseFloat(m[2].replace(/\./g, '').replace(',', '.')) * 1000) : parseInt(cifras, 10);
    if (conPeso || enMiles || cifras.length >= 4) out.push(valor);
  }
  return out;
}

/**
 * Los montos escritos sin puntos de miles ("$740000" o "740,000"; va "$740.000"). Un año suelto o una
 * dirección no cuentan, como en `montosEn`. Devuelve lo que encontró, tal cual.
 */
function sinPuntosEn(texto) {
  const t = String(texto || '');
  const out = [];
  for (const m of t.matchAll(MONTO)) {
    if (!m[1] && /^(?:19|20)\d\d$/.test(m[2])) continue;
    if (esDireccion(t, m)) continue;
    const entero = m[2].replace(/[.,]\d{1,2}$/, '');
    if (/^\d{4,}$/.test(entero) || /^\d{1,3}(?:,\d{3})+$/.test(entero)) out.push(m[0].trim());
  }
  return out;
}

const TE_FALTA = /\bte faltan?\b/;
/**
 * La promesa de mandar algo después: "te la(s)/lo(s) paso|mando|envío" con "mañana", "después", "más
 * tarde", "en un rato", "a la tarde/noche" o un día de la semana dentro de las 2 palabras que siguen, sin
 * cruzar una coma ni un punto.
 */
const MANDA_DESPUES = /\bte (?:la|las|lo|los) (?:paso|mando|envio)(?:\s+[^\s.,;:?!]+){0,2}?\s+(?:manana|despues|mas tarde|en un rat(?:o|ito)|a la (?:tarde|noche)|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/;

/**
 * Lo que escribió Sonnet sin lo que delata a una IA, línea por línea: las rayas ("—", "–") pasan a ", "
 * (pegadas entre dos números, a "-"), sin "¿" ni "¡", "**x**" pasa a "*x*" (la negrita de WhatsApp) y sin
 * viñetas ni títulos de markdown al principio. No deja ", ," ni dobles espacios, ni una coma al principio o
 * al final, ni líneas vacías.
 */
function sinMarcasDeIA(texto) {
  return String(texto == null ? '' : texto)
    .split('\n')
    .map((linea) =>
      linea
        .replace(/(\d)[—–](?=\d)/g, '$1-')
        .replace(/\s*[—–]\s*/g, ', ')
        .replace(/[¿¡]/g, '')
        .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
        .replace(/^\s*(?:[-•*]|#{1,6})\s+/, '')
        .replace(/,(?:\s*,)+/g, ',')
        .replace(/^\s*,\s*/, '')
        .replace(/\s*,\s*$/, '')
        .replace(/ {2,}/g, ' ')
        .trim()
    )
    .filter(Boolean)
    .join('\n');
}

/**
 * Lo interno que no puede salir nunca en un mensaje: los nombres de las herramientas, cómo se ve el
 * negocio por dentro y una forma de "escalar". Sobre el texto sin tildes ni mayúsculas, con límites de
 * palabra ("escalón" o "los sistemas" no cuentan).
 */
const LO_INTERNO = new RegExp(
  [
    '\\b(?:buscar_productos|mandar_catalogo|agendar_seguimiento|simular_piedra|presupuesto_pdf|cotizar_\\w+|tool_use|tool_result)\\b',
    '\\bcotizar\\(',
    '\\b(?:el sistema|la planilla|el historial|la herramienta|persona de la cuenta|grupo interno)\\b',
    '\\b(?:escalo|escalar|escale|escalado)\\b',
  ].join('|')
);

/** Lo interno que nombra el texto (`LO_INTERNO`), tal cual, o null. */
function nombraAlgoInterno(texto) {
  const m = promesas.sinTildes(texto).match(LO_INTERNO);
  return m ? m[0] : null;
}

/**
 * La promesa de un archivo: "te paso", "te mando", "te envío" o "ahí va(n)" y, en las 6 palabras que
 * siguen (sin cortar la frase), fotos, video, pdf, archivo, ubicación, link o catálogo. El único archivo que
 * Erasmo manda es el catálogo en PDF, y solo por `mandar_catalogo`: `permitidos` (['catalogo', 'pdf']) lo deja
 * pasar, y solo si la herramienta salió bien en ESTE turno. "Te paso los datos" no es un archivo. Devuelve lo
 * que promete, o null.
 */
const PROMETE = /\b(?:te paso|te mando|te envio|ahi van?)\b((?:\s+[^\s.?!]+){1,6})/g;
const ARCHIVO = /\b(?:fotos?|videos?|pdf|archivos?|ubicacion|link|catalogo)\b/g;

function prometeArchivo(texto, permitidos = []) {
  for (const m of promesas.sinTildes(texto).matchAll(PROMETE)) {
    const noVa = (m[1].match(ARCHIVO) || []).find((a) => !permitidos.includes(a));
    if (noVa) return m[0].slice(0, m[0].indexOf(noVa, m[0].length - m[1].length) + noVa.length).trim();
  }
  return null;
}

/**
 * Un caracter que no va en un mensaje de WhatsApp: un tab u otro de control (el salto de línea sí va), un
 * espacio invisible o el "�". El ZWJ de los emojis compuestos y el selector de variante (❤️) sí van.
 */
const CARACTER_RARO = /[\u0000-\u0009\u000B-\u001F\u007F​‌⁠﻿�]/;
const CARACTERES_RAROS = new RegExp(CARACTER_RARO.source, 'g');
function caracterRaro(texto) {
  const t = String(texto);
  const i = t.search(CARACTER_RARO);
  if (i < 0) return null;
  const c = t[i];
  const cual = c === '\t' ? 'un tab' : c === '�' ? 'un "�"' : `el caracter U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  return `${cual} en "${t.slice(Math.max(0, i - 12), i + 12).replace(CARACTERES_RAROS, '·')}"`;
}

/**
 * Lo que contestaría, revisado antes de que pueda salir. Cada mensaje pasa por `sinMarcasDeIA` y:
 *   - como mucho 4 mensajes: si vienen más, del cuarto en adelante van juntos en el cuarto, separados por
 *     un salto de línea. Cada uno de hasta 300 caracteres, el cuarto ya juntado;
 *   - todo monto tiene que estar entre los que devolvieron las herramientas en ESTA respuesta (`montos`, en
 *     pesos): sin llamar a `cotizar`, cualquier monto frena;
 *   - todo monto va con puntos de miles;
 *   - nada de prometer a otra persona ni de prometer volver (src/promesas.js), ni "te falta(n)", ni
 *     mandar algo después, ni un archivo (salvo el catálogo, con `catalogo`: `mandar_catalogo` salió bien);
 *   - nada que nombre algo interno, ni un tab u otro caracter raro.
 * Devuelve { mensajes, guardia: null } o { mensajes: [], guardia: 'qué no pasó', frenados }.
 */
function revisarSalida(mensajes, montos = [], { catalogo = false } = {}) {
  const crudos = Array.isArray(mensajes) ? mensajes.map((m) => String(m == null ? '' : m)) : [];
  if (!crudos.length) return { mensajes: [], guardia: 'responder sin mensajes', frenados: [] };
  const problemas = [];
  let limpios = crudos.map(sinMarcasDeIA).filter(Boolean);
  if (!limpios.length) problemas.push('no quedó nada después de limpiar los mensajes');
  if (limpios.length > MAX_MENSAJES) limpios = [...limpios.slice(0, MAX_MENSAJES - 1), limpios.slice(MAX_MENSAJES - 1).join('\n')];
  const validos = new Set(montos.map(Number));
  for (const m of limpios) {
    if (m.length > LARGO_MAXIMO) problemas.push(`un mensaje de ${m.length} caracteres (el tope es ${LARGO_MAXIMO})`);
    for (const monto of montosEn(m)) {
      if (!validos.has(monto)) {
        problemas.push(
          validos.size
            ? `monto que no salió de ninguna herramienta: ${pesos(monto)}`
            : `escribió un monto (${pesos(monto)}) que no salió de ninguna herramienta de esta respuesta: los montos salen solo de cotizar`
        );
      }
    }
    for (const crudo of sinPuntosEn(m)) {
      if (validos.size) problemas.push(`monto sin puntos de miles: "${crudo}" (va ${pesos(Number(crudo.replace(/\D/g, '')))})`);
    }
    const sin = promesas.sinTildes(m);
    const deOtro = promesas.promesaDeOtro(m);
    if (deOtro) problemas.push(`promete que otra persona lo va a contactar: "${deOtro}"`);
    const vuelve = sin.match(promesas.PROMESA_DE_CONTACTO);
    if (vuelve) problemas.push(`promete volver a contactarlo: "${vuelve[0]}"`);
    if (TE_FALTA.test(sin)) problemas.push('le dice cuánto le falta ("te falta")');
    const despues = sin.match(MANDA_DESPUES);
    if (despues) problemas.push(`promete mandar algo después: "${despues[0]}"`);
    const interno = nombraAlgoInterno(m);
    if (interno) problemas.push(`nombra algo interno: "${interno}"`);
    const archivo = prometeArchivo(m, catalogo ? ['catalogo', 'pdf'] : []);
    if (archivo) problemas.push(`promete un archivo que no va: "${archivo}"`);
    const raro = caracterRaro(m);
    if (raro) problemas.push(`caracter que no va en WhatsApp: ${raro} (escribí esa parte de nuevo, con las palabras enteras)`);
  }
  if (problemas.length) return { mensajes: [], guardia: [...new Set(problemas)].join('; '), frenados: crudos };
  return { mensajes: limpios, guardia: null };
}

// ---------------------------------------------------------------------------
// Las herramientas de datos, al correr
// ---------------------------------------------------------------------------

/**
 * Lo que dejaron las herramientas en un turno: los montos que se pueden escribir, en pesos (la guardia), y las
 * `acciones` pendientes (`catalogo`: true, `seguimiento`: { fecha, motivo }) que index.js ejecuta cuando salen
 * los mensajes. `chatId` y `enVivo` los pone `pensar`; `cotizo` es lo último que se cotizó (para la ficha).
 */
const turnoEnCero = () => ({ montos: [], acciones: {}, cotizo: null, chatId: null, enVivo: false, ahora: Date.now() });

/** El tool_result de un tool_use de datos. Un error de la herramienta vuelve como is_error. */
async function resultadoDe(bloque, turno) {
  let r;
  try {
    const h = HERRAMIENTAS_DE_DATOS.find((x) => x.definicion.name === bloque.name);
    r = h ? await h.correr(bloque.input, turno) : { error: `No existe la herramienta ${bloque.name}.` };
  } catch (e) {
    r = { error: `La herramienta falló (${e.message}): escalá.` };
  }
  // Para el registro de pruebas: qué se pidió y qué devolvió (nada personal: producto, cantidades y totales).
  if (Array.isArray(turno.llamadas)) turno.llamadas.push({ herramienta: bloque.name, entrada: bloque.input || {}, salida: r });
  return { type: 'tool_result', tool_use_id: bloque.id, content: JSON.stringify(r), ...(r && r.error ? { is_error: true } : {}) };
}

// ---------------------------------------------------------------------------
// El pedido
// ---------------------------------------------------------------------------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const HORA_ARGENTINA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "jueves 02/10/2026 15:30", la hora de Neuquén (la de Argentina). */
function fechaYHora(ts) {
  const p = Object.fromEntries(HORA_ARGENTINA.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dos = (v) => String(v).padStart(2, '0');
  const dia = DIAS[new Date(`${p.year}-${dos(p.month)}-${dos(p.day)}T12:00:00Z`).getUTCDay()];
  return `${dia} ${dos(p.day)}/${dos(p.month)}/${p.year} ${dos(p.hour)}:${dos(p.minute)}`;
}

/** "hace 40 min", "hace 20 h", "hace 3 días". */
function haceCuanto(ts, ahora) {
  if (!Number(ts)) return 'sin hora';
  const min = Math.max(0, Math.round((ahora - ts) / 60000));
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

/** Lo que el estado ya sabe del chat, en renglones (sin campos de un negocio en particular). */
function loQueSabe(s, nombre) {
  const out = [];
  const notas = (s.notas || []).map((n) => gemini.notaSegura(n, nombre)).filter(Boolean);
  if (notas.length) out.push(`contó: ${notas.join('; ')}`);
  if (s.resultado && s.resultado.tipo) out.push(`el chat está marcado como ${s.resultado.tipo === 'vendido' ? 'venta cerrada' : s.resultado.tipo}`);
  if (s.escalado) out.push('el chat está escalado a una persona');
  return out;
}

/** "una foto", "2 fotos". */
const unaOVarias = (n) => (n === 1 ? 'una foto' : `${n} fotos`);

/**
 * Lo que dice el pedido de las fotos de ahora: `mandadas`, las de la tanda; `vistas`, las que van al
 * pedido (de las últimas 3: fotos-del-cliente.js); `sinVer`, las de esas que no se pudieron ver.
 */
function textoDeFotos({ mandadas = 0, vistas = 0, sinVer = 0 } = {}) {
  const intentadas = vistas + sinVer;
  if (!vistas) {
    if (mandadas === 1) return 'mandó una foto que no se pudo ver: de esa foto no das nada por hecho.';
    const deCuales = intentadas < mandadas ? ` de las últimas ${intentadas}` : '';
    return `mandó ${mandadas} fotos y no se pudo ver ninguna${deCuales}: de esas fotos no das nada por hecho.`;
  }
  let t = `mandó ${unaOVarias(mandadas)}`;
  if (intentadas < mandadas) t += sinVer ? `, de las últimas ${intentadas} ves ${vistas}` : `, ves las últimas ${vistas}`;
  else if (sinVer) t += `, ves ${vistas}`;
  t += ` (${vistas === 1 ? 'va' : 'van'} después de este texto)`;
  if (sinVer) t += `; ${sinVer === 1 ? 'una no se pudo ver: de esa' : `${sinVer} no se pudieron ver: de esas`} no das nada por hecho`;
  return t + '.';
}

/**
 * El texto del pedido, armado por el código: la fecha de Neuquén, lo que sabe el estado, las líneas de una
 * persona de la cuenta, las últimas líneas del historial marcadas y con hace cuánto, y la tanda. Sin el
 * número del cliente; el nombre, tapado (`gemini.sinDatosPersonales`).
 *
 * Devuelve { texto, leidos }: `leidos` son las líneas del historial que van en el pedido (`historial`,
 * con la tanda), las de una persona de la cuenta que van aparte (`persona`) y cuántas del historial
 * vinieron de Evolution (`evolution`).
 *
 * `hasta` (la sombra con persona): solo lo que había hasta esa hora. `audio`: lo de ahora vino por audio.
 * `fotos` ({ mandadas, vistas, sinVer }): el pedido dice cuántas mandó y cuántas ve; una tanda de solo
 * fotos va como "(mandó 2 fotos, sin texto)". Las imágenes van aparte, después de este texto (`pensar`).
 */
function armarContexto(s, mensaje, nombre, ahora, hasta = null, { audio = false, fotos = null } = {}) {
  const limpio = (t) => gemini.sinDatosPersonales(String(t || ''), nombre);
  const quien = contexto.etiqueta;
  const antes = (l) => hasta == null || (Number(l && l.ts) || 0) <= hasta;
  const historial = (s.historial || []).filter(antes).slice(-state.LARGO_HISTORIAL);
  const persona = state.lineasDePersona(s).filter(antes);
  const sabe = loQueSabe(s, nombre);
  const mandadas = (fotos && fotos.mandadas) || 0;
  const escribio = String(mensaje || '').trim() || !mandadas ? limpio(mensaje) : `(mandó ${unaOVarias(mandadas)}, sin texto)`;
  const texto = [
    `Fecha y hora en Neuquén: ${fechaYHora(ahora)}`,
    '',
    'Lo que el sistema ya sabe de este chat:',
    ...(sabe.length ? sabe.map((l) => `- ${l}`) : ['- nada todavía']),
    '',
    'Lo último que escribió una persona de la cuenta (no el bot), de lo más viejo a lo más nuevo:',
    ...(persona.length ? persona.map((l) => `- ${haceCuanto(l.ts, ahora)}: "${limpio(l.texto).replace(/\s+/g, ' ').trim()}"`) : ['- nada']),
    '',
    `Historial (las últimas ${historial.length} líneas, de la más vieja a la más nueva):`,
    ...(historial.length ? historial.map((m) => `[${haceCuanto(m.ts, ahora)}] ${quien(m)}: ${limpio(m.texto)}`) : ['(vacío)']),
    '',
    audio ? 'Lo que dijo ahora el cliente, en un audio transcripto (contestá esto):' : 'Lo que escribió ahora el cliente (contestá esto):',
    '"""',
    escribio,
    '"""',
    ...(mandadas ? ['', `Con esto, el cliente ${textoDeFotos(fotos)}`] : []),
  ].join('\n');
  return { texto, leidos: { historial: historial.length, persona: persona.length, evolution: historial.filter((l) => l && l.evolution).length } };
}

function armarCuerpo(messages) {
  const esfuerzo = ESFUERZOS.includes(config.cerebro.esfuerzo) ? config.cerebro.esfuerzo : 'medium';
  return {
    model: config.cerebro.modelo,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: REGLAS, cache_control: { type: 'ephemeral' } }],
    tools: herramientasEfectivas(),
    tool_choice: { type: 'auto' },
    output_config: { effort: esfuerzo },
    messages,
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un pedido a la API. Un reintento ante 429, 5xx o error de red; el timeout no se reintenta. Tira con el motivo. */
async function llamarApi(cuerpo, intento = 0) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), config.cerebro.timeoutMs);
  try {
    let res;
    try {
      res = await fetch(URL_API, {
        method: 'POST',
        headers: { 'x-api-key': config.cerebro.apikey, 'anthropic-version': VERSION_API, 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error(`Anthropic no respondió en ${config.cerebro.timeoutMs / 1000}s`);
      // Error de red ("fetch failed": DNS, conexión cortada, TLS): se reintenta una vez, como un 5xx. El
      // mensaje lleva la causa (ENOTFOUND, ECONNRESET…) para saber qué pasó.
      const causa = e && e.cause && (e.cause.code || e.cause.message);
      if (intento < 1) {
        clearTimeout(reloj);
        await dormir(ESPERA_REINTENTO_RED_MS);
        return llamarApi(cuerpo, intento + 1);
      }
      throw new Error(`Anthropic: ${e.message}${causa ? ` (${causa})` : ''}`);
    }
    if (res.ok) return await res.json();
    const detalle = String(await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    if ((res.status === 429 || res.status >= 500) && intento < 1) {
      clearTimeout(reloj);
      await dormir(ESPERA_REINTENTO_MS);
      return llamarApi(cuerpo, intento + 1);
    }
    throw new Error(`Anthropic ${res.status}: ${detalle}`);
  } finally {
    clearTimeout(reloj);
  }
}

/** Lo que vuelve en el `responder` cuando una herramienta de datos de la misma respuesta devolvió un error. */
const TEXTO_DE_HERRAMIENTA_FALLIDA =
  'Tu respuesta NO salió: una herramienta que llamaste en esta misma respuesta devolvió un error. Mirá su resultado y ' +
  'volvé a llamar a responder (sin lo que dependía de eso) o a escalar.';

/**
 * Lo que vuelve como error del `responder` que frenó la guardia: el motivo y cómo corregirlo. Sonnet tiene
 * una sola vuelta para arreglarlo; si no puede, escala.
 */
function textoDeCorreccion(guardia) {
  return (
    `Tu respuesta NO salió, el sistema la frenó: ${guardia}. ` +
    'Corregila y volvé a llamar a responder: como mucho 4 mensajes, cada uno de hasta 300 caracteres; ' +
    'sin ningún monto que no haya devuelto una herramienta de ESTA respuesta (los montos salen solo de cotizar), ' +
    'sin decir cuánto le falta, sin prometer que otra persona o vos lo van a contactar, sin nombrar nada interno ' +
    '(herramientas, el sistema, el historial, escalar) y sin prometer archivos (fotos, videos, ubicación, links; el ' +
    'catálogo solo si llamaste a mandar_catalogo en esta respuesta). ' +
    'Si no podés contestar sin eso, llamá a escalar.'
  );
}

/**
 * Qué contestaría Sonnet a esta tanda. Nunca tira:
 *   { mensajes, escalar, motivo, montosDeHerramientas, guardia, uso, usd, ms, herramientas, frenados?,
 *     corregida?, leidos, imagenes? }
 * o { error, uso, usd, ms, leidos? }. `uso` son los tokens del turno, `usd` lo estimado con los precios de
 * config. `ahora` es la hora del pedido. `hasta` (la sombra con persona): el historial y las líneas de
 * persona, solo hasta esa hora. Si la guardia frena, Sonnet tiene una vuelta más para corregirlo
 * (`corregida`: { guardia, frenados } de la primera vez); si vuelve a frenar, escala y el motivo empieza
 * con "guardia:".
 *
 * `imagenes` ([{ media_type, data }], ya bajadas: solo las pasa una tanda en vivo) van como bloques
 * `image` en base64 en el primer mensaje, después del texto del contexto, y la última lleva
 * `cache_control`. `fotos` ({ mandadas, sinVer }) es lo que dice el pedido.
 */
async function pensar({ chatId, mensaje, nombre = '', ahora = Date.now(), hasta = null, audio = false, imagenes = [], fotos = null, enVivo = false } = {}) {
  const t0 = Date.now();
  const uso = usoEnCero();
  const turno = turnoEnCero();
  turno.ahora = Number(ahora) || Date.now();
  turno.chatId = chatId;
  turno.enVivo = enVivo === true;
  const montos = turno.montos;
  const herramientas = [];
  const llamadas = [];
  turno.llamadas = llamadas;
  let leidos = null;
  let corregida = null;
  const vistas = Array.isArray(imagenes) ? imagenes : [];
  const mandadas = Number(fotos && fotos.mandadas) || vistas.length;
  const sinVer = Number(fotos && fotos.sinVer) || 0;
  const deFotos = mandadas ? { imagenes: { vistas: vistas.length, sin_ver: sinVer } } : {};
  const fin = (r) => ({ ...r, uso, usd: seisDecimales(costo(uso)), ms: Date.now() - t0, ...(leidos ? { leidos } : {}), ...deFotos });
  // `llamadas`: lo que pidió y devolvió cada herramienta de datos (para `npm run pruebas`); `cotizo`: lo último cotizado.
  const comun = () => ({ montosDeHerramientas: montos, herramientas, llamadas, cotizo: turno.cotizo });
  const escala = (motivo, extra = {}) => fin({ mensajes: [], escalar: true, motivo, guardia: null, ...comun(), ...extra });
  try {
    if (!config.cerebro.apikey) return fin({ error: 'falta ANTHROPIC_API_KEY' });
    // Todo lo del chat se lee ACÁ, antes del primer await: lo que pase después (un #reset) no cambia lo
    // que se le pregunta a Sonnet.
    const s = state.obtener(chatId);
    const enElPedido = mandadas ? { mandadas, vistas: vistas.length, sinVer } : null;
    const ctx = armarContexto(s, mensaje, nombre, ahora, hasta, { audio, fotos: enElPedido });
    leidos = ctx.leidos;
    const fotosDelPedido = vistas.map((im, i) => ({
      type: 'image',
      source: { type: 'base64', media_type: im.media_type, data: im.data },
      ...(i === vistas.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
    }));
    const messages = [{ role: 'user', content: [{ type: 'text', text: ctx.texto, cache_control: { type: 'ephemeral' } }, ...fotosDelPedido] }];

    for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
      const resp = await llamarApi(armarCuerpo(messages));
      sumarUso(uso, resp && resp.usage);
      if (resp.stop_reason === 'refusal') return escala('Sonnet no quiso contestar (refusal)');
      const content = Array.isArray(resp.content) ? resp.content : [];
      // Tal cual llegó, con lo que pensó: el historial del turno solo se agrega, nunca se edita.
      messages.push({ role: 'assistant', content });
      const usos = content.filter((b) => b && b.type === 'tool_use');

      // Si escala, no manda nada más en ese turno: aunque en la misma respuesta haya un responder.
      const escalo = usos.find((b) => b.name === 'escalar');
      const respondio = usos.find((b) => b.name === 'responder');
      if (escalo) {
        herramientas.push('escalar');
        const motivo = String((escalo.input && escalo.input.motivo) || '').trim() || 'Sonnet escaló sin motivo';
        return escala(motivo, corregida ? { corregida } : {});
      }
      if (respondio) {
        // Las herramientas de datos que vinieron en la MISMA respuesta que `responder` corren antes de mirarla:
        // lo que dejan (los montos de cotizar, el catálogo, el seguimiento) vale para esa respuesta. Hasta el
        // 11/11/2026 solo corrían si la guardia frenaba: un `agendar_seguimiento` junto con `responder` se perdía.
        const deDatos = new Map();
        for (const b of usos) {
          if (b === respondio) continue;
          herramientas.push(b.name);
          deDatos.set(b, await resultadoDe(b, turno));
        }
        herramientas.push('responder');
        // La API pide un tool_result por cada tool_use: el de `responder` vuelve como error con el porqué.
        const devolver = (porque) =>
          messages.push({
            role: 'user',
            content: usos.map((b) => (b === respondio ? { type: 'tool_result', tool_use_id: b.id, is_error: true, content: porque } : deDatos.get(b))),
          });
        // Una de esas herramientas falló: Sonnet escribió sin ver el error. No sale nada; lo ve y decide (no
        // gasta la corrección de la guardia). Sin vueltas, escala.
        if ([...deDatos.values()].some((x) => x.is_error)) {
          if (vuelta < MAX_VUELTAS) {
            devolver(TEXTO_DE_HERRAMIENTA_FALLIDA);
            continue;
          }
          return escala('una herramienta falló junto con la respuesta y no quedaron vueltas', corregida ? { corregida } : {});
        }
        const r = revisarSalida(respondio.input && respondio.input.mensajes, montos, { catalogo: turno.acciones.catalogo === true });
        if (r.guardia) {
          // Una vuelta más para corregir: el responder vuelve como error con el motivo, y las herramientas
          // de datos que vinieron en la misma respuesta, con lo que devolvieron. Si no quedan vueltas o ya
          // corrigió una vez, escala.
          if (!corregida && CORRECCIONES > 0 && vuelta < MAX_VUELTAS) {
            corregida = { guardia: r.guardia, frenados: r.frenados };
            devolver(textoDeCorreccion(r.guardia));
            continue;
          }
          return escala(`guardia: ${r.guardia}`, { guardia: r.guardia, frenados: r.frenados, ...(corregida ? { corregida } : {}) });
        }
        return fin({ mensajes: r.mensajes, escalar: false, motivo: '', guardia: null, ...comun(), acciones: turno.acciones, ...(corregida ? { corregida } : {}) });
      }
      if (!usos.length) {
        return escala(`Sonnet no terminó con responder ni escalar${resp.stop_reason === 'max_tokens' ? ' (se cortó: max_tokens)' : ''}`);
      }
      const resultados = [];
      for (const b of usos) {
        herramientas.push(b.name);
        resultados.push(await resultadoDe(b, turno));
      }
      messages.push({ role: 'user', content: resultados });
    }
    return escala(`Sonnet no terminó en ${MAX_VUELTAS} vueltas`);
  } catch (e) {
    return fin({ error: (e && e.message) || String(e) });
  }
}

// ---------------------------------------------------------------------------
// Quién atiende y lo que contesta en vivo
// ---------------------------------------------------------------------------

/**
 * Quién atiende la tanda de este chat: 'sonnet' (contesta Sonnet), 'sombra' (nadie contesta y Sonnet
 * piensa en sombra) o 'nadie' (no se llama a la API):
 *   - `apagado`: nadie, siempre. Es el interruptor general: ni la marca del chat lo prende.
 *   - `tester` (09/11/2026): Sonnet SOLO para NUMEROS_TESTER; todos los demás, nadie (se escucha y se guarda,
 *     sin llamar a la API: ni sombra ni nada). Va ANTES de mirar las marcas del chat: un chat real que quedó
 *     marcado `atiendeSonnet: true` de otra época no llama a Sonnet, ni `#sonnet-si` lo prende. En el tester,
 *     `#bot` (marca `false`) lo deja en nadie.
 *   - `#bot <número>` dejó `atiendeSonnet: false`: sombra, en cualquier otro modo.
 *   - `atiendeSonnet: true` (chat nuevo con `nuevos`, o `#sonnet-si`): Sonnet, aunque después se cambie el
 *     modo (también a `sombra`), hasta `#reset` o `#bot`. Solo `apagado` y `tester` lo cortan.
 *   - `todos`: Sonnet. `nuevos`: Sonnet para NUMEROS_TESTER.
 *   - El resto: sombra (con `sombra`, todos menos los marcados).
 */
function quienAtiende(chatId) {
  const modo = config.cerebro.modo;
  if (modo === 'apagado') return 'nadie';
  const s = state.todos()[chatId] || {};
  if (modo === 'tester') return evolution.estaEnLaLista(chatId, config.numerosTester) && s.atiendeSonnet !== false ? 'sonnet' : 'nadie';
  if (s.atiendeSonnet === false) return 'sombra';
  if (s.atiendeSonnet === true || modo === 'todos') return 'sonnet';
  if (modo === 'nuevos' && evolution.estaEnLaLista(chatId, config.numerosTester)) return 'sonnet';
  return 'sombra';
}

/**
 * ¿Este mensaje abre un chat nuevo para Sonnet? Con `CEREBRO_MODO=nuevos`: un chat que no tenía estado
 * guardado, que no es del tester y que no está en la lista de chats viejos, con la lista al día. index.js
 * lo mira ANTES de que el mensaje entre al estado y, si da true, deja `atiendeSonnet: true` con la fecha.
 */
function esChatNuevo(chatId) {
  if (config.cerebro.modo !== 'nuevos') return false;
  if (Object.prototype.hasOwnProperty.call(state.todos(), chatId)) return false;
  if (evolution.estaEnLaLista(chatId, config.numerosTester)) return false;
  if (!chatsViejos.listo()) return false;
  return !evolution.estaEnLaLista(chatId, chatsViejos.numeros());
}

/**
 * Lo que devolvió `pensar` (sin error), convertido al `resultado` de index.js ({ escalar, motivo, mensajes,
 * callar }), más `fuente: 'sonnet'` y `sonnetMensajes` (lo que sale, como texto, para el aviso al grupo).
 * Queda en el estado el nombre de pila y `ultimaRespuestaSonnet` ({ ts, mensajes } o { ts, escalo }). Lo
 * que sale pasa por el filtro de repetidos: si todo ya se lo había dicho, escala callado (TODO_REPETIDO).
 */
function comoResultado(chatId, r, { nombre = '', ahora = Date.now() } = {}) {
  const s = state.obtener(chatId);
  const apodo = salida.primerNombre(s.nombre) || salida.primerNombre(nombre);
  const cambios = { ultimaRespuestaSonnet: { ts: ahora, ...(r.escalar ? { escalo: r.motivo } : { mensajes: r.mensajes }) } };
  if (apodo && s.nombre !== apodo) cambios.nombre = apodo;
  // La ficha del chat (qué pidió, en qué quedó): la arma el código con lo que cotizó y lo que se decidió.
  cambios.ficha = ficha.armar(s, r, ahora);
  state.actualizar(chatId, cambios);
  const escala = (motivo) => ({ escalar: true, motivo, mensajes: [], callar: true, fuente: 'sonnet', sonnetMensajes: [] });
  if (r.escalar) return escala(r.motivo);
  const msgs = salida.sinLoYaDicho(chatId, r.mensajes || []);
  if (!msgs.length) return escala(salida.TODO_REPETIDO);
  // `acciones`: lo que pidieron las herramientas (el catálogo, el seguimiento); index.js lo hace DESPUÉS de mandar
  // los mensajes. Un turno que escala no deja ninguna.
  return { escalar: false, motivo: '', mensajes: msgs, callar: true, fuente: 'sonnet', sonnetMensajes: msgs.map(acciones.comoTexto), acciones: r.acciones || {} };
}

/**
 * Sonnet contesta una tanda en vivo: piensa y lo convierte (`comoResultado`). Devuelve { r, resultado } o
 * { r, error }: con error, index.js escala en silencio (no hay respaldo). `imagenes` y `fotos`: las fotos de
 * la tanda, ya bajadas (index.js, fotos-del-cliente.js).
 */
async function contestar({ chatId, mensaje, nombre = '', ahora = Date.now(), audio = false, imagenes = [], fotos = null }) {
  // `enVivo`: lo único que habilita a las herramientas a dejar acciones pendientes (el catálogo, el seguimiento).
  const r = await pensar({ chatId, mensaje, nombre, ahora, audio, imagenes, fotos, enVivo: true });
  if (r.error) return { r, error: r.error };
  return { r, resultado: comoResultado(chatId, r, { nombre, ahora }) };
}

// --- Los avisos al grupo -------------------------------------------------------

/** "US$0,0077": cuatro decimales, con coma. */
const usdTexto = (n) => `US$${(Number(n) || 0).toFixed(4).replace('.', ',')}`;

/** "30 mensajes de contexto (18 de Evolution) (+2 de una persona)". */
function leidosTexto(leidos) {
  const n = (leidos && leidos.historial) || 0;
  const e = (leidos && leidos.evolution) || 0;
  const p = (leidos && leidos.persona) || 0;
  return `${n} mensaje${n === 1 ? '' : 's'} de contexto${e ? ` (${e} de Evolution)` : ''}${p ? ` (+${p} de una persona)` : ''}`;
}

const recorte = (t, largo) => {
  const una = String(t || '').replace(/\s+/g, ' ').trim();
  return una.length > largo ? una.slice(0, largo - 1).trimEnd() + '…' : una;
};

/** Con `tester` y `nuevos`, cada vez que Sonnet le contesta a alguien. */
function avisoRespuesta({ chatId, nombre, leidos, primero }) {
  const numero = String(chatId).split('@')[0];
  return `🤖 Sonnet → ${nombre || 'sin nombre'} · leí ${leidosTexto(leidos)} · ${recorte(primero, 80)} · wa.me/${numero}`;
}

/** "error 500", "timeout", "falta la clave" o el error recortado. */
function motivoCorto(error) {
  const e = String(error || '');
  const status = e.match(/^Anthropic (\d{3})\b/);
  if (status) return `error ${status[1]}`;
  if (/no respondi/i.test(e)) return 'timeout';
  if (/ANTHROPIC_API_KEY/.test(e)) return 'falta la clave';
  return recorte(e, 60);
}

// En una racha de errores en vivo (para /salud); se corta cuando Sonnet vuelve a contestar.
let caido = false;

/** Sonnet no pudo contestar en vivo: el motivo del escalado callado ("Sonnet no pudo contestar (timeout)"). */
function alFallar(error) {
  caido = true;
  return `Sonnet no pudo contestar (${motivoCorto(error)})`;
}

/** Sonnet contestó (o escaló) en vivo: se terminó la racha. */
function alContestar() {
  caido = false;
}

/** ¿Sonnet está en una racha de errores en vivo? */
function enFalla() {
  return caido;
}

// Con `todos`: un resumen por hora en lugar de un aviso por respuesta. En memoria, por hora de reloj.
const HORA_MS = 60 * 60 * 1000;
const porHora = new Map();

/**
 * Anota en la hora: 'gasto' (lo que costó una tanda en vivo, conteste o escale), 'respuesta' (le llegó al
 * cliente, con lo leído), 'escalado' o 'evolution' (a ese chat se le completó el historial con Evolution;
 * `r.chatId`, cada chat cuenta una vez).
 */
function contarEnVivo(tipo, r, ahora = Date.now()) {
  const desde = Math.floor(ahora / HORA_MS) * HORA_MS;
  if (!porHora.has(desde)) porHora.set(desde, { respuestas: 0, leidos: [], escalados: 0, usd: 0, conEvolution: new Set() });
  const h = porHora.get(desde);
  if (tipo === 'gasto') h.usd += Number(r && r.usd) || 0;
  else if (tipo === 'respuesta') {
    h.respuestas++;
    h.leidos.push((r && r.leidos && r.leidos.historial) || 0);
  } else if (tipo === 'escalado') h.escalados++;
  else if (tipo === 'evolution') h.conEvolution.add(String((r && r.chatId) || h.conEvolution.size));
}

/** Los resúmenes de las horas que ya terminaron, solo de las que tuvieron respuestas. */
function resumenesDeLaHora(ahora = Date.now()) {
  const actual = Math.floor(ahora / HORA_MS) * HORA_MS;
  const out = [];
  for (const desde of [...porHora.keys()].sort((a, b) => a - b)) {
    if (desde >= actual) continue;
    const h = porHora.get(desde);
    porHora.delete(desde);
    if (!h.respuestas) continue;
    const promedio = Math.round(h.leidos.reduce((a, b) => a + b, 0) / h.leidos.length);
    const minimo = Math.min(...h.leidos);
    const evo = h.conEvolution.size;
    const conEvolution = evo ? ` · ${evo} chat${evo === 1 ? '' : 's'} completado${evo === 1 ? '' : 's'} con Evolution` : '';
    out.push(
      `🤖 Última hora: ${h.respuestas} respuesta${h.respuestas === 1 ? '' : 's'} de Sonnet, leyó ${promedio} mensajes de contexto en promedio ` +
        `(el que menos, ${minimo}) · ${h.escalados} escalado${h.escalados === 1 ? '' : 's'}${conEvolution} · ${usdTexto(h.usd)}`
    );
  }
  return out;
}

module.exports = {
  pensar,
  contestar,
  comoResultado,
  quienAtiende,
  esChatNuevo,
  revisarSalida,
  montosEn,
  sinPuntosEn,
  sinMarcasDeIA,
  nombraAlgoInterno,
  prometeArchivo,
  caracterRaro,
  armarContexto,
  textoDeFotos,
  costo,
  gastoDeHoy,
  gastoDelMes,
  sumarAlMes,
  armarGastoMes,
  avisoGastoMes,
  marcarAvisoGastoMes,
  resumenSalud,
  hashDeReglas,
  lineaDeReglas,
  REGLAS,
  REGLAS_HASH,
  REGLAS_LINEAS,
  HERRAMIENTAS,
  HERRAMIENTAS_DE_DATOS,
  herramientasEfectivas,
  avisoRespuesta,
  leidosTexto,
  usdTexto,
  recorte,
  motivoCorto,
  alFallar,
  alContestar,
  enFalla,
  contarEnVivo,
  resumenesDeLaHora,
  MAX_MENSAJES,
  LARGO_MAXIMO,
};
