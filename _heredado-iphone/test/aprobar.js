'use strict';
/**
 * Aprobar ejemplos: las respuestas reales de Tomi y Fran, de a una, para decidir cuáles
 * valen (bloque 7, decisiones de Tomás del 23/09/2026). Aprueba solo Tomás.
 *
 *   npm run aprobar                        de a uno, primero los más distintos
 *   npm run aprobar -- --fuente v1         solo esa fuente (v1 o v2)
 *   npm run aprobar -- --contar            cuántos hay, sin preguntar nada
 *   npm run aprobar -- --fijar             marca los pendientes que el bot ya cumple
 *   npm run aprobar -- --revisar <id>      vuelve a decidir uno (version + 1)
 *   --archivo <ruta> / --archivo-v1 <ruta> / --aprobados <ruta>   otros archivos (tests)
 *
 * Una `buena` se vuelve un caso que `npm run evaluar` corre (test/aprobados.js). El bot
 * NO cambia solo: si no cumple un ejemplo, el ejemplo queda pendiente y una persona lo
 * arregla con una regla en otro bloque; `--fijar` marca los que ya cumple, y esos sí
 * rompen `evaluar` si vuelven a fallar.
 *
 * Fuentes, en este orden: el registro de eventos (`aprendizaje.ARCHIVO`, v2) y el viejo
 * (`data/aprendizaje-v1.jsonl`, o si no está `data/aprendizaje.jsonl`, v1). Solo se leen.
 * Las decisiones van a `test/ejemplos-aprobados.json`, que va en git: el texto se limpia
 * (`limpiar`) y uno que conserva un número de 8 cifras o más, o una @, no se puede
 * aprobar.
 *
 * Sin --fijar no carga state.js, responder.js ni index.js.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const readline = require('readline');

const ES_CONSOLA = require.main === module;
const ARGS = ES_CONSOLA ? process.argv.slice(2) : [];

// --fijar corre los ejemplos como `evaluar -- --offline`. Los temporales van antes de
// requerir nada: config.js lee las variables al cargarse.
if (ES_CONSOLA && ARGS.includes('--fijar')) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'aprobar-fijar-'));
  process.env.ESTADO_PATH = path.join(tmp, 'estado.json');
  process.env.APRENDIZAJE_PATH = path.join(tmp, 'aprendizaje.jsonl');
  process.on('exit', () => fs.rmSync(tmp, { recursive: true, force: true }));
}

const aprendizaje = require('../src/aprendizaje');
const config = require('../src/config');
const { sinDatosPersonales } = require('../src/gemini');
const aprobados = require('./aprobados');

const C = {
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s) => `\x1b[31m${s}\x1b[0m`,
  amar: (s) => `\x1b[33m${s}\x1b[0m`,
  cian: (s) => `\x1b[36m${s}\x1b[0m`,
  neg: (s) => `\x1b[1m${s}\x1b[0m`,
};

const DATA = path.join(__dirname, '..', 'data');
const TOPE_CONTEXTO = 30;
const CONTEXTO_EN_PANTALLA = 6;
const CONTEXTO_V1_EN_PANTALLA = 8;
const ZONA = 'America/Argentina/Buenos_Aires';

/** El registro viejo, como lo busca `npm run reproducir`. */
function v1PorDefecto() {
  const v1 = path.join(DATA, 'aprendizaje-v1.jsonl');
  return fs.existsSync(v1) ? v1 : path.join(DATA, 'aprendizaje.jsonl');
}

/** AAAA-MM-DD, en hora de Argentina. */
function hoy(fecha = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' }).format(fecha);
}

/** "10/09 20:56", en hora de Argentina. */
function cuando(ts) {
  const d = new Date(ts);
  if (Number.isNaN(d.getTime())) return '?';
  const p = Object.fromEntries(
    new Intl.DateTimeFormat('es-AR', { timeZone: ZONA, day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
      .formatToParts(d)
      .map((x) => [x.type, x.value])
  );
  const dos = (n) => String(n).padStart(2, '0');
  return `${dos(p.day)}/${dos(p.month)} ${dos(p.hour)}:${dos(p.minute)}`;
}

const sha12 = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12);
// Primero los más distintos; a igual distancia, por hora.
const porDistancia = (a, b) => b.dif - a.dif || Date.parse(a.ts) - Date.parse(b.ts);

/**
 * ¿Habla de una venta? Palabras de iPhone, modelos, plata o condiciones (24/09/2026, pedido
 * de Tomás: la cola arrancaba con chats personales). Sirve para ordenar, no para descartar.
 */
const VENTA =
  /\biphone|\bip ?1[1-7]\b|\b(?:el|un|del|los|al|tenes|tienen) 1[1-7]\b|\b1[1-7] ?(?:pro|max|plus|mini)\b|cuota|entrega|contado|precio|stock|bateria|\bgb\b|financ|permuta|canje|\$|\b\d{1,3}[.,]\d{3}\b|\bmil\b|lucas|garantia|\bdni\b|tarjeta|cotiz|sellado|usado|dolar|efectivo|transfer/;
function pareceVenta(texto) {
  return VENTA.test(String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
}

/**
 * El orden de la cola: primero los que hablan de una venta y tienen propuesta del bot,
 * después los de venta sin propuesta, y al final el resto; dentro de cada grupo, los más
 * distintos primero.
 */
function prioridadDe(c) {
  if (!pareceVenta(c.cliente.join('\n') + '\n' + c.humano)) return 2;
  return c.conPropuesta ? 0 : 1;
}
const porPrioridad = (a, b) => a.prioridad - b.prioridad || porDistancia(a, b);

/** Los últimos 4 dígitos del chat coinciden con los de un contacto de CONTACTOS_PERSONALES. */
function esPersonal(chat, personales) {
  const cuatro = String(chat || '').replace(/\D/g, '').slice(-4);
  if (cuatro.length < 4) return false;
  return (personales || []).some((p) => String(p).replace(/\D/g, '').slice(-4) === cuatro);
}

/**
 * El contexto de un candidato del registro viejo: las filas del mismo chat anteriores a su
 * primera fila, en orden, como items (`{ cliente }` por línea y `{ tanda }` con esas líneas,
 * sin mandar: el bot corría en escucha; `{ humano }`). Un mensaje del cliente repetido en
 * filas seguidas va una sola vez. Es una reconstrucción: el registro viejo puede tener
 * cruces (hallazgo B1). Los últimos 30.
 */
function contextoV1(filasDelChat, desde) {
  const items = [];
  let ultimo = null;
  for (const f of filasDelChat) {
    if (!(Date.parse(f.ts) < desde)) continue;
    const cliente = String(f.cliente || '').trim();
    const humano = String(f.humano || '').trim();
    if (cliente && cliente !== ultimo) {
      const lineas = cliente.split('\n');
      for (const l of lineas) items.push({ cliente: l });
      items.push({ tanda: lineas, enviado: false });
      ultimo = cliente;
    }
    if (humano) items.push({ humano });
  }
  return items.slice(-TOPE_CONTEXTO);
}

// ---------------------------------------------------------------------------
// Candidatos
// ---------------------------------------------------------------------------

/**
 * Del registro viejo: uno por par chat + cliente (con `trim`), con cliente y humano no
 * vacíos, el mismo criterio que `casosViejos` de `reproducir`. Las respuestas de la
 * persona se juntan con `\n`, en orden; el bot y la lectura son los de la primera fila
 * del par (la lectura puede venir cruzada: hallazgo B1). Sin contexto.
 */
function candidatosV1(filas, { personales = config.contactosPersonales } = {}) {
  const porPar = new Map();
  const porChat = new Map();
  (filas || []).forEach((f, i) => {
    if (!f || f.v === 2) return;
    if (!porChat.has(f.chat)) porChat.set(f.chat, []);
    porChat.get(f.chat).push({ f, i });
  });
  for (const lista of porChat.values()) lista.sort((a, b) => Date.parse(a.f.ts) - Date.parse(b.f.ts) || a.i - b.i);
  for (const f of filas || []) {
    if (!f || f.v === 2) continue;
    // Los contactos personales no son ventas (24/09/2026): el registro viejo los tiene
    // porque se juntó antes de que el bot los filtrara.
    if (esPersonal(f.chat, personales)) continue;
    const cliente = String(f.cliente || '').trim();
    const humano = String(f.humano || '').trim();
    if (!cliente || !humano) continue;
    const par = f.chat + '\n' + cliente;
    if (!porPar.has(par)) {
      const bot = String(f.bot || '').trim();
      porPar.set(par, {
        id: 'v1-' + sha12(par),
        fuente: 'v1',
        chat: f.chat,
        clave: null,
        ts: f.ts,
        cliente: cliente.split('\n'),
        contexto: [],
        bot: bot ? [bot] : [],
        // Sin texto pero con motivo: el bot escalaba callado.
        conPropuesta: Boolean(bot || f.motivo),
        escalar: f.motivo ? true : null,
        motivo: f.motivo || '',
        modo: null,
        commit: null,
        lectura: f.lectura || null,
        incompleto: null,
        humanos: [],
      });
    }
    porPar.get(par).humanos.push(humano);
  }
  return [...porPar.values()]
    .map(({ humanos, ...c }) => {
      const humano = humanos.join('\n');
      const contexto = contextoV1((porChat.get(c.chat) || []).map(({ f }) => f), Date.parse(c.ts));
      const conDatos = { ...c, contexto, humano, dif: aprendizaje.distancia(c.bot.join('\n'), humano) };
      return { ...conDatos, prioridad: prioridadDe(conDatos) };
    })
    .sort(porPrioridad);
}

/**
 * Del registro de eventos: los ejemplos (`aprendizaje.ejemplos`) con cliente y humano no
 * vacíos, completos e incompletos. El contexto son los eventos del mismo grupo (clave, o
 * chat si no hay) anteriores a la primera línea del cliente del ejemplo, en orden y como
 * items: `{ cliente }`, `{ humano }` y `{ tanda, enviado }` (una propuesta, con los
 * textos de sus líneas conocidas; `enviado` si era en vivo). Los últimos 30.
 */
function candidatosV2(eventos) {
  const validos = (eventos || []).filter((e) => e && e.v === 2);
  const porGrupo = new Map();
  validos.forEach((e, i) => {
    const grupo = e.clave || e.chat;
    if (!porGrupo.has(grupo)) porGrupo.set(grupo, []);
    porGrupo.get(grupo).push({ e, i });
  });
  for (const lista of porGrupo.values()) lista.sort((a, b) => Date.parse(a.e.ts) - Date.parse(b.e.ts) || a.i - b.i);

  const salida = [];
  for (const ej of aprendizaje.ejemplos(validos)) {
    const humano = String(ej.humano || '').trim();
    if (!ej.cliente.length || !ej.cliente.join('').trim() || !humano) continue;
    const grupo = ej.clave || ej.chat;
    const lista = (porGrupo.get(grupo) || []).map(({ e }) => e);
    const primera = lista.find((e) => e.tipo === 'cliente' && e.id === ej.idsCliente[0]);
    const desde = primera ? Date.parse(primera.ts) : Date.parse(ej.ts);
    salida.push({
      id: 'v2-' + sha12(grupo + '\n' + ej.ts + '\n' + ej.cliente.join('\n')),
      fuente: 'v2',
      chat: ej.chat,
      clave: ej.clave,
      ts: ej.ts,
      cliente: ej.cliente,
      contexto: contextoAntes(lista, desde),
      bot: ej.bot,
      conPropuesta: Boolean(ej.tanda),
      escalar: ej.escalar,
      motivo: ej.motivo || '',
      modo: ej.modo,
      commit: ej.tanda ? ej.commit : null,
      lectura: ej.lectura,
      incompleto: ej.incompleto,
      humano,
      // Sin propuesta del bot, la distancia es 1.
      dif: ej.tanda ? aprendizaje.distancia(ej.bot.join('\n'), humano) : 1,
    });
  }
  return salida.map((c) => ({ ...c, prioridad: prioridadDe(c) })).sort(porPrioridad);
}

function contextoAntes(lista, desde) {
  const lineas = new Map(lista.filter((e) => e.tipo === 'cliente').map((e) => [e.id, e]));
  const items = [];
  for (const e of lista) {
    if (!(Date.parse(e.ts) < desde)) continue;
    if (e.tipo === 'cliente') items.push({ cliente: e.texto });
    else if (e.tipo === 'humano') items.push({ humano: e.texto });
    else if (e.tipo === 'propuesta') {
      const textos = (e.lineas || []).filter((id) => lineas.has(id)).map((id) => lineas.get(id).texto);
      if (textos.length) items.push({ tanda: textos, enviado: e.modo === 'vivo' });
    }
  }
  return items.slice(-TOPE_CONTEXTO);
}

/** Los candidatos de cada fuente (sin limpiar), cada lista ya ordenada. */
function fuentes({ archivo = aprendizaje.ARCHIVO, archivoV1 = v1PorDefecto(), fuente = null } = {}) {
  const filasV1 = fuente === 'v2' ? [] : aprendizaje.leerTodo(archivoV1);
  const v1 = candidatosV1(filasV1);
  return {
    v2: fuente === 'v1' ? [] : candidatosV2(aprendizaje.leerTodo(archivo)),
    v1,
    // Cuántos pares del registro viejo son de CONTACTOS_PERSONALES y no salen.
    personales: candidatosV1(filasV1, { personales: [] }).length - v1.length,
  };
}

/** Primero v2, después v1. */
function candidatos(opciones) {
  const { v2, v1 } = fuentes(opciones);
  return [...v2, ...v1];
}

// ---------------------------------------------------------------------------
// Limpieza
// ---------------------------------------------------------------------------

// Lo que `sinDatosPersonales` no tapa y no puede ir a git: una tirada de 8 dígitos o más,
// separados o no por punto o guion (un DNI: 30.123.456), o una @.
// Sin el espacio como separador (24/09/2026): "820.000 11 pro" son un precio y un modelo, no
// un documento. Los teléfonos con espacios ya los tapa `sinDatosPersonales`.
const DATO_SIN_TAPAR = /\d(?:[.-]?\d){7,}|@/;

/**
 * Los montos de la persona como `[monto]`: el caso mira si el bot da precio o no, y el
 * monto lo calcula el cotizador. No se tocan los de 1 o 2 cifras (modelos, batería,
 * días, horas), ni 128, 256 y 512, ni un año después de "del" o "año".
 */
function taparMontos(texto) {
  return (
    String(texto)
      // número + mil, k, lucas o palo(s): "320 mil", "320k", "5 lucas", "1 palo"
      .replace(/\b\d+(?:[.,]\d+)?\s*(?:mil|k|lucas?|palos?)\b/gi, () => '[monto]')
      // "un palo", "medio palo"
      .replace(/\b(?:un|medio)\s+palos?\b/gi, () => '[monto]')
      // $ + número: "$495.000", "$ 320000", "$1.250.000"
      .replace(/\$\s?\d+(?:[.,]\d+)*/g, () => '$[monto]')
      // con separador de miles: "495.000", "1,250,000"
      .replace(/\b\d{1,3}(?:[.,]\d{3})+\b/g, () => '[monto]')
      // entero suelto de 4 a 7 cifras, salvo un año después de "del" o "año"
      .replace(/(?<![\w.,$])\d{4,7}(?!\w|[.,]\d)/g, (n, i, t) =>
        /^(?:19|20)\d\d$/.test(n) && /(?:^|\s)(?:del|año)\s+$/i.test(t.slice(0, i)) ? n : '[monto]'
      )
      // entero suelto de 3 cifras, salvo 128, 256 y 512, y salvo gb, %, hs o hrs después
      .replace(/(?<![\w.,$])\d{3}(?!\w|[.,]\d|\s*%|\s*(?:gb|hs|hrs)\b)/gi, (n) => (['128', '256', '512'].includes(n) ? n : '[monto]'))
  );
}

/**
 * Un texto que se va a guardar: `sinDatosPersonales` (sin nombre: no hay pushName), si
 * queda algo que no se puede guardar (`bloquea`) y, solo en lo que escribió la persona
 * (`persona`), los montos. Lo del cliente queda con sus montos: el bot necesita su
 * entrega para llegar al mismo estado. El control va antes de los montos: "30.123.456"
 * también parece un monto.
 */
function limpiar(texto, { persona = false } = {}) {
  // Línea por línea: si no, el fin de un precio y el modelo de la línea siguiente
  // ("360.000\n11 128gb") se leen como un teléfono.
  const t = String(texto || '').split('\n').map((l) => sinDatosPersonales(l)).join('\n');
  return { texto: persona ? taparMontos(t) : t, bloquea: DATO_SIN_TAPAR.test(t) };
}

/** El candidato con todo lo que se guarda ya limpio, y `bloqueado` si no se puede aprobar. */
function limpio(c) {
  let bloqueado = false;
  const l = (t, persona) => {
    const r = limpiar(t, { persona });
    if (r.bloquea) bloqueado = true;
    return r.texto;
  };
  const contexto = (c.contexto || []).map((it) => {
    if (it.tanda) return { tanda: it.tanda.map((t) => l(t, false)), enviado: Boolean(it.enviado) };
    if ('humano' in it) return { humano: l(it.humano, true) };
    return { cliente: l(it.cliente, false) };
  });
  const cliente = c.cliente.map((t) => l(t, false));
  const humano = l(c.humano, true);
  return { ...c, cliente, contexto, humano, bloqueado };
}

// ---------------------------------------------------------------------------
// Lo que se guarda
// ---------------------------------------------------------------------------

const ACCIONES = { c: 'contesta', e: 'escala-callado', n: 'nada' };
const DESCARTES = { d: 'dato-desactualizado', f: 'falto-contexto', n: 'no-usar' };

/**
 * La entrada de `test/ejemplos-aprobados.json`. `buena` y `excepcion` llevan la situación
 * (ya limpia); los descartes, solo id, version, fecha, fuente y etiqueta, sin texto.
 */
function entrada(c, decision, fecha, version = 1) {
  const base = { id: c.id, version, fecha, fuente: c.fuente, etiqueta: decision.etiqueta };
  if (decision.etiqueta !== 'buena' && decision.etiqueta !== 'excepcion') return base;
  const conTexto = {
    ...base,
    situacion: { cliente: c.cliente, contexto: c.contexto },
    intencionLeida: (c.lectura && c.lectura.intencion) || null,
    commitBot: c.commit || null,
    respuesta: c.humano,
  };
  if (decision.etiqueta === 'excepcion') return { ...conTexto, nota: decision.nota };
  return {
    ...conTexto,
    accion: decision.accion,
    conPrecio: decision.accion === 'contesta' ? decision.conPrecio : null,
    debeDecir: decision.debeDecir || [],
    limites: decision.limites,
    nota: decision.nota,
    estado: 'pendiente',
  };
}

// ---------------------------------------------------------------------------
// La consola
// ---------------------------------------------------------------------------

/** Lee stdin de a una línea. `null` cuando se acaba. */
function lector() {
  const rl = readline.createInterface({ input: process.stdin, terminal: false });
  const cola = [];
  const esperando = [];
  let fin = false;
  rl.on('line', (l) => (esperando.length ? esperando.shift()(l) : cola.push(l)));
  rl.on('close', () => {
    fin = true;
    while (esperando.length) esperando.shift()(null);
  });
  // Sin terminal (stdin de un archivo, los tests) lo que se contesta no se ve: se repite.
  const eco = (l) => {
    if (l !== null && !process.stdin.isTTY) process.stdout.write(l + '\n');
    return l;
  };
  return {
    leer: () => (cola.length ? Promise.resolve(cola.shift()) : fin ? Promise.resolve(null) : new Promise((r) => esperando.push(r))).then(eco),
    cerrar: () => rl.close(),
  };
}

/** Una letra de las que valen; otra cosa se vuelve a preguntar. `null` si se acabó stdin. */
async function elegir(leer, pregunta, letras, siNoVale = null) {
  for (;;) {
    process.stdout.write(pregunta + ' ');
    const l = await leer();
    if (l === null) {
      process.stdout.write('\n');
      return null;
    }
    const x = l.trim().toLowerCase();
    if (letras.includes(x)) return x;
    console.log(C.gris(siNoVale && (x === 'b' || x === 'e') ? siNoVale : '  (esa no es una de las opciones)'));
  }
}

async function textoLibre(leer, pregunta) {
  process.stdout.write(pregunta + ' ');
  const l = await leer();
  if (l === null) process.stdout.write('\n');
  return l === null ? null : l.trim();
}

const cita = (t) => String(t || '').split('\n').map((l) => '  > ' + l).join('\n');
const sangria = (t) => String(t).split('\n').join('\n' + ' '.repeat(12));

function itemComoTexto(it) {
  if (it.tanda) return `  (el bot interpretó ${it.tanda.length > 1 ? 'esas líneas' : 'esa línea'}${it.enviado ? ' y lo mandó' : ', sin mandar nada'})`;
  if ('humano' in it) return '  persona › ' + sangria(it.humano);
  return '  cliente › ' + sangria(it.cliente);
}

/** El candidato ya limpio: es lo que se va a guardar. */
function mostrar(c, encabezado) {
  console.log('');
  const marca = c.incompleto ? C.amar(` · INCOMPLETO: ${c.incompleto}`) : '';
  console.log(C.neg(encabezado) + marca);
  if (c.contexto.length) {
    if (c.fuente === 'v1') {
      // Del registro viejo se muestran los mensajes, sin las tandas (el bot corría en escucha).
      console.log('Antes (reconstruido del registro viejo, puede tener cruces):');
      for (const it of c.contexto.filter((x) => !x.tanda).slice(-CONTEXTO_V1_EN_PANTALLA)) console.log(C.gris(itemComoTexto(it)));
    } else {
      console.log('Antes:');
      for (const it of c.contexto.slice(-CONTEXTO_EN_PANTALLA)) console.log(C.gris(itemComoTexto(it)));
    }
  }
  console.log('Cliente:');
  console.log(C.cian(cita(c.cliente.join('\n'))));
  if (c.desdeJson) {
    console.log('El bot entonces:');
    console.log(C.gris('  (el JSON no lo guarda)'));
  } else if (!c.conPropuesta) {
    console.log('El bot entonces:');
    console.log(C.gris('  (sin propuesta)'));
  } else {
    console.log(c.fuente === 'v2' ? `El bot entonces (${c.modo}, commit ${c.commit || '?'}):` : 'El bot entonces:');
    console.log(c.bot.length ? cita(c.bot.join('\n')) : C.gris('  (no iba a contestar)'));
    if (c.escalar && c.motivo) console.log(C.gris(`  y escalaba: ${c.motivo}`));
  }
  console.log('La persona:');
  console.log(C.verde(cita(c.humano)));
}

function encabezadoDe(c) {
  const mensajes = c.contexto.filter((x) => !x.tanda).length;
  const contexto = mensajes ? `${mensajes} mensajes antes` : 'sin contexto';
  return `${c.fuente} · ${c.chat} · ${cuando(c.ts)} · ${contexto}`;
}

const PREGUNTA = '¿Cómo está? [b]uena · [e]xcepción · [d]ato desactualizado · [f]altó contexto · [n]o usar · [s]altear · [q] salir';
const PREGUNTA_BLOQUEADO = '¿Cómo está? [d]ato desactualizado · [f]altó contexto · [n]o usar · [s]altear · [q] salir';

/** La decisión sobre un candidato: 'q', 's' o { etiqueta, … }. */
async function decidir(c, leer) {
  if (c.bloqueado) {
    console.log(C.amar('Queda un número de 8 cifras o más, o una @, que la limpieza no tapó: no se puede aprobar como buena ni como excepción.'));
  }
  const x = c.bloqueado
    ? await elegir(leer, PREGUNTA_BLOQUEADO, ['d', 'f', 'n', 's', 'q'], '  (no se puede aprobar: tiene un dato personal)')
    : await elegir(leer, PREGUNTA, ['b', 'e', 'd', 'f', 'n', 's', 'q']);
  if (x === null || x === 'q') return 'q';
  if (x === 's') return 's';
  if (DESCARTES[x]) return { etiqueta: DESCARTES[x] };
  if (x === 'e') {
    const nota = await textoLibre(leer, 'Nota: por qué es una excepción (Enter = nada)');
    return nota === null ? 'q' : { etiqueta: 'excepcion', nota };
  }
  // b
  const a = await elegir(leer, '¿Qué tenía que hacer el bot? [c]ontestar · [e]scalar callado · [n]o decir nada', ['c', 'e', 'n']);
  if (a === null) return 'q';
  let conPrecio = null;
  if (a === 'c') {
    const p = await elegir(leer, '¿Con precio? [s]í · [n]o', ['s', 'n']);
    if (p === null) return 'q';
    conPrecio = p === 's';
  }
  // Lo que tiene que decir sí o sí (24/09/2026): el caso lo pide con `contiene`. Solo si contesta.
  let debeDecir = '';
  if (a === 'c') {
    debeDecir = await textoLibre(leer, '¿Qué tiene que decir sí o sí? (palabras o frases separadas por coma; Enter = nada)');
    if (debeDecir === null) return 'q';
  }
  const limites = await textoLibre(leer, '¿Qué no puede decir? (palabras o frases separadas por coma; Enter = nada)');
  if (limites === null) return 'q';
  const nota = await textoLibre(leer, 'Nota (Enter = nada)');
  if (nota === null) return 'q';
  return {
    etiqueta: 'buena',
    accion: ACCIONES[a],
    conPrecio,
    debeDecir: debeDecir.split(',').map((s) => s.trim()).filter(Boolean),
    limites: limites.split(',').map((s) => s.trim()).filter(Boolean),
    nota,
  };
}

const esDescarte = (e) => Object.values(DESCARTES).includes(e.etiqueta);

/** La lista de decididos, o null (avisado) si no se puede leer: así no se pisa. */
function leerDecididos(ruta) {
  try {
    return aprobados.leer(ruta);
  } catch (e) {
    console.log(C.rojo(`\nNo pude leer ${ruta} (${e.message}). No lo toco: arreglalo y volvé a correr.\n`));
    return null;
  }
}

async function revisarTodos(opciones, ruta) {
  const lista = leerDecididos(ruta);
  if (!lista) return 1;
  const todos = candidatos(opciones);
  const decididos = new Set(lista.map((e) => e.id));
  const porRevisar = todos.filter((c) => !decididos.has(c.id));
  const hoyDecididos = { buena: 0, excepcion: 0, descartado: 0 };
  const { leer, cerrar } = lector();
  if (!porRevisar.length) console.log('\nNo hay nada por revisar.');
  for (let i = 0; i < porRevisar.length; i++) {
    const c = limpio(porRevisar[i]);
    mostrar(c, `[${i + 1} de ${porRevisar.length} · decididos ${lista.length}] ${encabezadoDe(c)}`);
    const d = await decidir(c, leer);
    if (d === 'q') break;
    if (d === 's') continue;
    lista.push(entrada(c, d, hoy()));
    aprobados.guardar(ruta, lista);
    decididos.add(c.id);
    if (d.etiqueta === 'buena') hoyDecididos.buena++;
    else if (d.etiqueta === 'excepcion') hoyDecididos.excepcion++;
    else hoyDecididos.descartado++;
  }
  cerrar();
  const n = hoyDecididos.buena + hoyDecididos.excepcion + hoyDecididos.descartado;
  const quedan = todos.filter((c) => !decididos.has(c.id)).length;
  console.log('');
  console.log(
    C.neg(`Decididos hoy: ${n} (buenas ${hoyDecididos.buena}, excepciones ${hoyDecididos.excepcion}, descartados ${hoyDecididos.descartado}). Quedan por revisar: ${quedan}.`)
  );
  console.log('');
  return 0;
}

function contar(opciones, ruta) {
  const lista = leerDecididos(ruta);
  if (!lista) return 1;
  const { v2, v1, personales } = fuentes(opciones);
  const decididos = new Set(lista.map((e) => e.id));
  const partes = [];
  if (opciones.fuente !== 'v1') partes.push(`v2 ${v2.length}`);
  if (opciones.fuente !== 'v2') partes.push(`v1 ${v1.length}`);
  const cuenta = (etiqueta) => lista.filter((e) => e.etiqueta === etiqueta).length;
  console.log('');
  console.log(`Candidatos: ${partes.join(' · ')}`);
  if (opciones.fuente !== 'v2') console.log(`Personales salteados: ${personales} (CONTACTOS_PERSONALES)`);
  console.log(`Decididos: ${lista.length} (buenas ${cuenta('buena')}, excepciones ${cuenta('excepcion')}, descartados ${lista.filter(esDescarte).length})`);
  console.log(`Quedan por revisar: ${[...v2, ...v1].filter((c) => !decididos.has(c.id)).length}`);
  console.log('');
  return 0;
}

/**
 * Corre los `buena` pendientes como `evaluar -- --offline` y pasa a `fijado` los que el
 * bot ya cumple, con la fecha. No cambia `version` y nunca vuelve a pendiente uno fijado.
 */
async function fijar(ruta) {
  const lista = leerDecididos(ruta);
  if (!lista) return 1;
  const pendientes = lista.filter((e) => e.etiqueta === 'buena' && e.estado === 'pendiente');
  if (!pendientes.length) {
    console.log('\nNo hay ejemplos pendientes para fijar.\n');
    return 0;
  }
  // Recién acá se carga el bot, con los temporales ya puestos (arriba de todo).
  const sheets = require('../src/sheets');
  require('../src/gemini').usarSoloLocal(true);
  sheets.usarFixture(require('./fixture-planilla'));
  const { correrCaso } = require('./correr-caso');

  console.log(`\nCorriendo ${pendientes.length} pendiente${pendientes.length > 1 ? 's' : ''} como evaluar -- --offline (copia congelada, extractor local)...`);
  const fijados = [];
  const siguen = [];
  for (let i = 0; i < pendientes.length; i++) {
    const e = pendientes[i];
    const r = await correrCaso(aprobados.comoCaso(e), { chatId: `fijar-${i}-${Date.now()}@s.whatsapp.net` });
    if (r.errores.length) {
      siguen.push({ e, r });
    } else {
      e.estado = 'fijado';
      e.fijado = hoy();
      fijados.push(e.id);
    }
  }
  if (fijados.length) aprobados.guardar(ruta, lista);
  console.log('');
  console.log(fijados.length ? C.verde(`Fijados: ${fijados.join(', ')}`) : 'No se fijó ninguno.');
  if (siguen.length) {
    console.log(C.amar(`Siguen pendientes (${siguen.length}):`));
    for (const { e, r } of siguen) console.log(C.amar(`  ${e.id}  ${r.primerError}`));
  }
  console.log('');
  return 0;
}

/** Vuelve a decidir uno ya decidido: lo busca en las fuentes y, si no está, lo muestra desde el JSON. */
async function revisarUno(id, opciones, ruta) {
  const lista = leerDecididos(ruta);
  if (!lista) return 1;
  const k = lista.findIndex((e) => e.id === id);
  if (k === -1) {
    console.log(`\n${id} no existe en ${ruta}.\n`);
    return 1;
  }
  const actual = lista[k];
  let c = candidatos({ ...opciones, fuente: null }).find((x) => x.id === id);
  if (!c) {
    if (!actual.situacion) {
      console.log(`\n${id} ya no está en las fuentes y el JSON no guarda su texto (${actual.etiqueta}).\n`);
      return 1;
    }
    c = {
      id,
      fuente: actual.fuente,
      chat: null,
      ts: null,
      cliente: actual.situacion.cliente || [],
      contexto: actual.situacion.contexto || [],
      bot: [],
      conPropuesta: false,
      desdeJson: true,
      lectura: { intencion: actual.intencionLeida },
      commit: actual.commitBot,
      incompleto: null,
      humano: actual.respuesta || '',
    };
  }
  c = limpio(c);
  const donde = c.desdeJson ? `${c.fuente} · desde el JSON` : encabezadoDe(c);
  mostrar(c, `[revisar ${id} · versión ${actual.version}, ${actual.etiqueta}] ${donde}`);
  const { leer, cerrar } = lector();
  const d = await decidir(c, leer);
  cerrar();
  if (d === 'q' || d === 's') {
    console.log('\nNo cambió nada.\n');
    return 0;
  }
  lista[k] = entrada(c, d, hoy(), (Number(actual.version) || 1) + 1);
  aprobados.guardar(ruta, lista);
  console.log(`\n${id}: versión ${lista[k].version}, ${lista[k].etiqueta}.\n`);
  return 0;
}

async function main() {
  const valor = (flag) => {
    const i = ARGS.indexOf(flag);
    return i > -1 ? ARGS[i + 1] || '' : null;
  };
  for (const flag of ['--archivo', '--archivo-v1', '--aprobados', '--fuente', '--revisar']) {
    if (valor(flag) === '') {
      console.log(`\nFalta el valor después de ${flag}.\n`);
      return 1;
    }
  }
  const fuente = valor('--fuente');
  if (fuente && fuente !== 'v1' && fuente !== 'v2') {
    console.log('\n--fuente es v1 o v2.\n');
    return 1;
  }
  const opciones = { fuente };
  if (valor('--archivo')) opciones.archivo = valor('--archivo');
  if (valor('--archivo-v1')) opciones.archivoV1 = valor('--archivo-v1');
  const ruta = valor('--aprobados') || aprobados.RUTA;

  if (ARGS.includes('--contar')) return contar(opciones, ruta);
  if (ARGS.includes('--fijar')) return fijar(ruta);
  if (valor('--revisar')) return revisarUno(valor('--revisar'), opciones, ruta);
  return revisarTodos(opciones, ruta);
}

if (ES_CONSOLA) {
  main().then(
    (codigo) => process.exit(codigo),
    (e) => {
      console.error(e);
      process.exit(1);
    }
  );
}

module.exports = {
  candidatosV1,
  candidatosV2,
  candidatos,
  fuentes,
  limpiar,
  limpio,
  entrada,
  hoy,
  comoCaso: aprobados.comoCaso,
  pareceVenta,
  esPersonal,
};
