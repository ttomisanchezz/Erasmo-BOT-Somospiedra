'use strict';
/**
 * Registro de aprendizaje.
 *
 * Qué escribió el cliente, qué habría contestado el bot y qué contestó una persona
 * de la cuenta (Tomi o Fran). Es la materia prima para mejorar el bot: muestra
 * exactamente dónde la persona dice algo distinto.
 *
 * Desde el bloque 6 de la auditoría (hallazgo B1, decisiones de Tomás del 22/09/2026)
 * es un registro de EVENTOS, uno por línea, en `data/aprendizaje-v2.jsonl`:
 *
 *   - `cliente`: cada línea del cliente que entra al historial, entre o no a una tanda
 *     (en vivo o en borrador, con una persona atendiendo o el chat escalado, no entra).
 *   - `propuesta`: lo que el bot diría con UNA tanda, con los id de SUS líneas. Se
 *     escribe en el hilo de la tanda, con los datos de esa tanda.
 *   - `humano`: cada mensaje de una persona de la cuenta, con la tanda a la que
 *     responde, o `incompleto` y el motivo si no se puede saber.
 *   - `silencio` (bloque Ninjo 2, 06/10/2026): una tanda, o una línea del cliente, que se
 *     quedó sin respuesta, con el porqué (`silencio`, más abajo).
 *   - `entrega` (bloque Ninjo 2): cada mensaje que salió de verdad a un cliente, con el id que
 *     devolvió Evolution, o con `error` si el envío falló (`entrega`, más abajo).
 *
 * Los ejemplos se arman al leer (`ejemplos`): una respuesta humana entera, todos los
 * mensajes seguidos de la cuenta hasta que el cliente vuelve a escribir.
 *
 * Hasta el bloque 6 cada fila se armaba cuando escribía la persona, leyendo campos del
 * chat que se pisan (`ultimoMensajeCliente`, `ultimaPropuestaBot`, `ultimaLectura`): si
 * contestaba mientras el bot interpretaba, la fila mezclaba la pregunta nueva, la
 * propuesta de la tanda anterior y la respuesta nueva. Ese archivo
 * (`data/aprendizaje.jsonl`, del 10 al 19/09/2026) se archiva tal cual como
 * `data/aprendizaje-v1.jsonl`. Este módulo no lo escribe nunca; `npm run aprender --
 * --archivo` y `npm run reproducir` lo leen.
 *
 * IMPORTANTE: el bot NO se modifica solo con esto. Un bot que aprende solo de
 * conversaciones termina copiando errores y, peor, inventando precios. Acá se
 * junta la evidencia; una persona aprueba ejemplos (`npm run aprobar`, bloque 7),
 * `npm run evaluar` los corre como casos, y las reglas las escribe una persona.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Las pruebas apuntan APRENDIZAJE_PATH a un archivo temporal, igual que
// ESTADO_PATH: si no, cada corrida ensucia el registro real con conversaciones
// inventadas y después no se puede medir nada con él.
const ARCHIVO = config.aprendizajePath || path.join(__dirname, '..', 'data', 'aprendizaje-v2.jsonl');

/** Guarda el teléfono ofuscado: alcanza para agrupar, no identifica. Es para mostrar. */
function anonimo(chatId) {
  const num = String(chatId).split('@')[0];
  return num.length > 4 ? '...' + num.slice(-4) : num;
}

/**
 * La sal de la clave por chat (bloque 7): `aprendizaje-sal`, al lado del registro (en
 * producción `data/aprendizaje-sal`; en las pruebas, al lado del APRENDIZAJE_PATH
 * temporal). Se crea con el primer evento que se anota, nunca al cargar el módulo:
 * `aprobar`, `aprender` y `reproducir` cargan este módulo y no crean nada. Se lee una
 * vez y queda en memoria. Nunca va a un log, a un evento ni a git (data/ está en
 * .gitignore). Si se borra, los chats nuevos no se pueden agrupar con los de antes.
 */
const ARCHIVO_SAL = path.join(path.dirname(ARCHIVO), 'aprendizaje-sal');
let sal = null;
let avisoSinSal = false;

function leerSal() {
  const s = fs.readFileSync(ARCHIVO_SAL, 'utf8').trim();
  if (!s) throw new Error(`${ARCHIVO_SAL} está vacío`);
  return s;
}

function obtenerSal() {
  if (sal) return sal;
  try {
    try {
      sal = leerSal();
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      fs.mkdirSync(path.dirname(ARCHIVO_SAL), { recursive: true });
      try {
        // 'wx': si otro proceso la creó recién, no se pisa y se usa la de él.
        fs.writeFileSync(ARCHIVO_SAL, crypto.randomBytes(32).toString('hex'), { flag: 'wx' });
      } catch (e2) {
        if (e2.code !== 'EEXIST') throw e2;
      }
      sal = leerSal();
    }
  } catch (e) {
    // Sin sal el evento se anota igual, con `clave: null` (agrupa por `chat`, como los
    // del bloque 6). Se vuelve a probar con el próximo evento; el aviso sale una vez.
    if (!avisoSinSal) console.error('[aprendizaje] sin sal:', e.message);
    avisoSinSal = true;
    return null;
  }
  return sal;
}

/**
 * La clave por chat: HMAC-SHA256 del chat completo (con el `@dominio`) con la sal
 * local, en hex, 12 caracteres. Con los últimos 4 dígitos (`chat`), entre 117 chats ya
 * había un 49% de chance de que dos se mezclaran (con 300, un 99%). `null` si no hay sal.
 */
function clave(chatId) {
  const s = obtenerSal();
  return s ? crypto.createHmac('sha256', s).update(String(chatId)).digest('hex').slice(0, 12) : null;
}

// El commit con el que corre el bot (lo pone index.js al arrancar). Va en cada evento,
// para saber con qué reglas se armó cada propuesta.
let commit = null;
function usarCommit(c) {
  commit = c || null;
}

/**
 * Lo mínimo para decidir a qué propuesta responde una persona, por chat:
 *   - propuesta: la última del chat, { tanda, lineas: Set de ids };
 *   - ultimaLinea: el id de la última línea del cliente que llegó.
 * Vive en memoria y no en estado.json: el registro es el que manda. Si el bot se
 * reinicia, lo que conteste una persona en cada chat queda como 'sin propuesta en
 * memoria' hasta la próxima propuesta.
 */
const memoria = new Map();
function delChat(chatId) {
  if (!memoria.has(chatId)) memoria.set(chatId, { propuesta: null, ultimaLinea: null });
  return memoria.get(chatId);
}

function anotar(tipo, chatId, datos, ts = Date.now()) {
  const fila = { v: 2, ts: new Date(ts).toISOString(), chat: anonimo(chatId), clave: clave(chatId), tipo, commit, ...datos };
  try {
    fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
    fs.appendFileSync(ARCHIVO, JSON.stringify(fila) + '\n');
  } catch (e) {
    console.error('[aprendizaje] no pude guardar:', e.message);
  }
}

/**
 * Llegó una línea del cliente. Se llama AL LLEGAR, también con un audio que todavía
 * se está transcribiendo: desde ese momento, lo que conteste una persona ya no
 * responde a la propuesta anterior.
 */
function llegoDelCliente(chatId, id) {
  delChat(chatId).ultimaLinea = id;
}

/**
 * Evento `cliente`, con el texto ya conocido: la transcripción si era un audio. Un
 * audio se anota cuando termina de transcribirse, con `ts` = la hora en que llegó.
 * `humanoAtendiendo`: había una persona atendiendo cuando llegó (en vivo el bot no lo
 * interpreta; en escucha sí).
 */
function cliente(chatId, { id, texto, audio, humanoAtendiendo }, { ts } = {}) {
  anotar('cliente', chatId, { id, texto, audio: Boolean(audio), humanoAtendiendo: Boolean(humanoAtendiendo) }, ts);
}

/**
 * Evento `propuesta`: una por tanda interpretada, con los datos de ESA tanda.
 *   lineas    los id de sus líneas, en orden;
 *   mensajes  lo que el bot diría, como texto (acciones.comoTexto);
 *   lectura   cómo se entendió: { fuente: 'gemini' | 'local', intencion, modelo,
 *             entrega, entregaFuente }. Sin esto no se puede responder si conviene
 *             pagar Gemini o si el extractor local alcanza;
 *   contexto  { humanoAtendiendo, audio }, para medir por separado lo que el bot haría
 *             en vivo de lo que solo pasa en escucha;
 *   modo      'vivo', 'borrador', 'escucha' o 'fuera-de-lista'.
 *   fuente    'sonnet' si la tanda la contestó el cerebro Sonnet (fase 2, 02/10/2026), con
 *   sonnet    { modelo, uso, usd, ms, guardia, herramientas, leidos }. Sin Sonnet no van: la
 *             propuesta del bot queda igual que antes.
 *   origen    'silencio' si la tanda la armó el barrido de cuando vence el silencio de una persona
 *             (bloque Ninjo 1b, index.js `revisarSilencios`); 'sigue' si la armó un #sigue que
 *             contesta lo que dejó escrito el cliente (07/10/2026, index.js `alSeguir`). Si no, no va.
 */
function propuesta(chatId, { tanda, lineas, mensajes, escalar, motivo, lectura, contexto, modo, fuente, sonnet, origen }) {
  anotar('propuesta', chatId, {
    tanda,
    lineas,
    mensajes,
    escalar: Boolean(escalar),
    motivo: motivo || '',
    lectura: lectura || null,
    contexto: contexto || null,
    modo,
    ...(fuente ? { fuente } : {}),
    ...(sonnet ? { sonnet } : {}),
    ...(origen ? { origen } : {}),
  });
  delChat(chatId).propuesta = { tanda, lineas: new Set(lineas) };
}

/**
 * Evento `humano`. Responde a la última propuesta del chat solo si después no llegó
 * ninguna línea del cliente y no hay una tanda de ese chat en curso (`tandaEnCurso`,
 * lo sabe index.js). Si no, `responde: null` e `incompleto` con el motivo: nunca se
 * empareja con la tanda anterior. Un texto vacío (un audio propio que no se pudo
 * transcribir) no se anota: un marcador no enseña nada.
 */
function humano(chatId, { id, texto }, { tandaEnCurso = false } = {}) {
  if (!texto || !String(texto).trim()) return;
  const m = memoria.get(chatId);
  let incompleto = null;
  if (tandaEnCurso) incompleto = 'bot interpretando';
  else if (!m || !m.propuesta) incompleto = 'sin propuesta en memoria';
  else if (m.ultimaLinea && !m.propuesta.lineas.has(m.ultimaLinea)) incompleto = 'cliente escribió después';
  anotar('humano', chatId, { id: id || null, texto, responde: incompleto ? null : m.propuesta.tanda, incompleto });
}

/**
 * Evento `silencio` (bloque Ninjo 2, revisión de Ninjo del 05/10/2026, punto 3.1): una tanda, o una
 * línea del cliente, que se quedó sin respuesta. Para contestar "¿por qué no le contestó a X?" sin leer
 * la consola. `motivo`: 'persona', 'pausado', 'escalado', 'repetido', 'escalo', 'sin-texto', 'corte',
 * 'fuera-de-prueba', 'escucha', 'borrador', 'sin-numero', 'sin-venta', 'sonnet-no-pudo', 'apagada' (Chiara
 * apagada desde el panel) o 'error' (los anota index.js, cada uno en su camino; ver CLAUDE.md). `lineas`: los ids de las líneas del cliente ([]
 * si no hay). `extra`: lo que suma cada camino (`tanda`, `origen`, `formato`, `detalle`, `sinMandar`).
 * `formato` y no `tipo`: `tipo` es el del evento.
 */
function silencio(chatId, { motivo, lineas = [], ...extra }) {
  anotar('silencio', chatId, { motivo, lineas: (lineas || []).filter(Boolean), ...extra });
}

/**
 * Evento `entrega` (bloque Ninjo 2, punto 3.1): un mensaje que salió a un cliente (nunca al grupo),
 * después de que Evolution contestó. `id`: el `key.id` que devolvió (null si no vino); `formato`:
 * 'texto', 'documento' o 'imagen' (no `tipo`: ese es el del evento); `origen`: 'sonnet', 'bot',
 * 'seguimiento', 'silencio', 'sigue' o 'fotos'; `texto`: lo que salió (en un documento, el epígrafe);
 * `tanda`: la de la propuesta, o null. Si el envío falló o Evolution lo frenó, el mismo evento con
 * `error` (corto, sin rutas) y sin id.
 */
function entrega(chatId, { id = null, formato, origen, texto = '', tanda = null, error = null }) {
  anotar('entrega', chatId, { id, formato, origen, texto: texto || '', tanda: tanda || null, ...(error ? { error } : {}) });
}

/** #reset: el chat queda como nuevo también acá. Lo de antes no responde a nada. */
function olvidar(chatId) {
  memoria.delete(chatId);
}

/** Las líneas del archivo (el registro nuevo, o el que se pida), sin las que no se pueden leer. */
function leerTodo(archivo = ARCHIVO) {
  try {
    return fs
      .readFileSync(archivo, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => {
        try {
          return JSON.parse(l);
        } catch {
          return null;
        }
      })
      .filter(Boolean);
  } catch {
    return [];
  }
}

/**
 * Arma los ejemplos a partir de los eventos (función pura). Por chat, los `humano`
 * seguidos hasta el próximo `cliente` forman UN ejemplo: tres mensajes al hilo de la
 * persona son una respuesta, no tres. Una propuesta en el medio no lo parte.
 *
 * El ejemplo toma la propuesta del PRIMER mensaje humano. Si ese quedó incompleto, el
 * ejemplo va sin propuesta del bot (`bot: []`, `tanda: null`) y `cliente` son las
 * líneas que nadie había respondido todavía; nunca la tanda anterior. `incompleto` es
 * el motivo del primero que lo tenga. Las líneas del formato viejo (sin `v: 2`) no se
 * toman. Los eventos se ordenan por `ts` dentro de cada chat: un audio se anota al
 * terminar la transcripción, con la hora en que llegó.
 *
 * "Por chat" es por `clave` desde el bloque 7; los eventos sin clave (los del bloque 6,
 * o sin sal) agrupan por `chat`, como antes. Cada ejemplo lleva la `clave` del grupo (o
 * null) y los `idsCliente` de sus líneas del cliente, en el mismo orden que `cliente`.
 */
function ejemplos(eventos) {
  const porChat = new Map();
  (eventos || []).forEach((e, i) => {
    if (!e || e.v !== 2) return;
    const grupo = e.clave || e.chat;
    if (!porChat.has(grupo)) porChat.set(grupo, []);
    porChat.get(grupo).push({ e, i });
  });

  const salida = [];
  for (const lista of porChat.values()) {
    const { chat } = lista[0].e;
    const claveDelGrupo = lista[0].e.clave || null;
    lista.sort((a, b) => Date.parse(a.e.ts) - Date.parse(b.e.ts) || a.i - b.i);
    const propuestas = new Map();
    const lineas = new Map();
    // Líneas del cliente que todavía no respondió ninguna propuesta ni ninguna persona.
    let sinResponder = [];
    let grupo = null;
    const cerrar = () => {
      if (grupo) salida.push(armarEjemplo(chat, claveDelGrupo, grupo, propuestas, lineas));
      grupo = null;
    };
    for (const { e } of lista) {
      if (e.tipo === 'cliente') {
        cerrar();
        lineas.set(e.id, e);
        sinResponder.push(e);
      } else if (e.tipo === 'propuesta') {
        propuestas.set(e.tanda, e);
        const suyas = new Set(e.lineas || []);
        sinResponder = sinResponder.filter((c) => !suyas.has(c.id));
      } else if (e.tipo === 'humano') {
        if (!grupo) {
          grupo = { humanos: [], sinResponder };
          sinResponder = [];
        }
        grupo.humanos.push(e);
      }
    }
    cerrar();
  }
  return salida.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

function armarEjemplo(chat, claveDelGrupo, { humanos, sinResponder }, propuestas, lineas) {
  const primero = humanos[0];
  const p = (primero.responde && propuestas.get(primero.responde)) || null;
  const conMotivo = humanos.find((h) => h.incompleto);
  let incompleto = conMotivo ? conMotivo.incompleto : null;
  // Responde a una tanda cuya propuesta no está en el archivo (una línea que no se pudo
  // leer): sin la propuesta no se puede comparar nada.
  if (!incompleto && primero.responde && !p) incompleto = 'sin propuesta en el registro';
  const delCliente = p ? (p.lineas || []).map((id) => lineas.get(id)).filter(Boolean) : sinResponder;
  return {
    chat,
    ts: primero.ts,
    tanda: p ? p.tanda : null,
    cliente: delCliente.map((c) => c.texto),
    bot: p ? p.mensajes || [] : [],
    humano: humanos.map((h) => h.texto).join('\n'),
    escalar: p ? Boolean(p.escalar) : null,
    motivo: p ? p.motivo || '' : null,
    lectura: p ? p.lectura || null : null,
    commit: p ? p.commit : primero.commit,
    modo: p ? p.modo : null,
    incompleto,
    clave: claveDelGrupo,
    idsCliente: delCliente.map((c) => c.id),
  };
}

/**
 * Qué tan distinto es lo que dijo la persona de lo que iba a decir el bot, de 0 a 1
 * (palabras de más de 3 letras en común). Sirve para ordenar, no es una nota de
 * calidad. La usan `npm run aprender` y `npm run reproducir`.
 */
function distancia(a, b) {
  const pal = (t) =>
    new Set(
      String(t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .split(/[^a-z0-9]+/)
        .filter((w) => w.length > 3)
    );
  const A = pal(a);
  const B = pal(b);
  if (!A.size || !B.size) return 1;
  let comunes = 0;
  for (const w of A) if (B.has(w)) comunes++;
  return 1 - comunes / Math.max(A.size, B.size);
}

module.exports = {
  ARCHIVO,
  ARCHIVO_SAL,
  anonimo,
  clave,
  // Cerebro Sonnet (fase 1, 01/10/2026): index.js anota `propuesta-sonnet` con la misma forma
  // de evento. `ejemplos()`, `aprobar` y `reproducir` miran solo cliente, propuesta y humano.
  anotar,
  usarCommit,
  llegoDelCliente,
  cliente,
  propuesta,
  humano,
  silencio,
  entrega,
  olvidar,
  leerTodo,
  ejemplos,
  distancia,
};
