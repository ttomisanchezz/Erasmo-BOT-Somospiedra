'use strict';
/**
 * `npm run bateria-cerebro`: la batería de pruebas del cerebro Sonnet (fase 2, decisión de Tomás
 * del 02/10/2026). Corre las conversaciones de test/bateria-cerebro-casos.js contra
 * `cerebro.contestar` (lo mismo que usa el bot en vivo: `pensar` y `comoResultado`, con el saludo,
 * el filtro de repetidos y el PDF) como si fueran chats reales, y chequea cada turno. No es un test
 * de `npm test` (ese es test/bateria-cerebro.test.js, con un `fetch` de mentira).
 *
 *   npm run bateria-cerebro                          todos los casos, con la copia congelada
 *   npm run bateria-cerebro -- --solo Jazz           los casos cuyo nombre contiene el texto
 *   npm run bateria-cerebro -- --max 5               los primeros 5 casos
 *   npm run bateria-cerebro -- --desde 22            los casos del 22 en adelante
 *   npm run bateria-cerebro -- --planilla-en-vivo    la planilla de hoy, solo lectura
 *   npm run bateria-cerebro -- --informe <ruta>      dónde va el informe (por defecto
 *                                                    data/bateria-cerebro-AAAA-MM-DD.md)
 *
 * GASTA PLATA: cada turno son de 1 a 5 llamadas a la API de Anthropic con ANTHROPIC_API_KEY (del
 * .env de la carpeta donde se corre). Solo sale a Anthropic (y a Google Sheets, solo lectura, con
 * --planilla-en-vivo). Estado, registro de aprendizaje y el PDF en temporales: solo escribe el
 * informe.
 *
 * Cómo arma cada caso: un chat nuevo, con la planilla del caso (`planilla`, sobre una copia) y la
 * lista de usados (`bateria`). Cada turno arranca a la hora del anterior más `despues` (2 min por
 * defecto; el primero, un martes a las 15:00 de Neuquén). Las líneas `antes` entran al historial con
 * su hora (`hace`); una de una persona también deja `ultimoHumano`. Después, la tanda del cliente y
 * `cerebro.contestar` con esa hora. Lo que contesta Sonnet "sale" como en vivo: sus marcas se
 * confirman y entra al historial como línea del bot (el saludo y el PDF incluidos); un turno que
 * escala no deja nada y la conversación sigue igual (en vivo, el chat quedaría callado).
 *
 * Chequeos de cada turno: los de `espera` (escala, contiene, contieneAlguno, noContiene, motivo,
 * montos, noMontos, maxMensajes, compromiso, usa, sinPreguntar, aviso) y siempre: ningún monto
 * inventado, sin "te falta", sin promesas, montos con puntos, sin saludo duplicado y nada interno
 * (bloque Ninjo 1: ningún mensaje nombra una herramienta, el sistema, la planilla o "escalar"). Las
 * regex se prueban sobre el texto en minúsculas y sin tildes. Los montos de `espera` se calculan
 * con la planilla del caso y `cotizador.cotizar`. `sinPreguntar: true`: el turno es un acuse que no
 * se le pregunta a Sonnet (no se llama a la API, no sale nada y no escala).
 *
 * Bloque Ninjo 1b (05/10/2026): un caso puede traer `evolution` (lo que Evolution tiene del chat de
 * antes de que el bot lo mirara): el corredor lo pasa a registros con la forma de /chat/findMessages
 * y antes de cada turno corre `contexto.completar`, como index.js. Dos reglas más, siempre: ningún
 * mensaje de Sonnet escribe "1 pago de", "1 cuota de", "2 cuotas de" ni "2 pagos de" fuera del
 * bloque de la cotización, y a un caso con `postventa: true` nunca se le pregunta qué modelo busca.
 * `aviso: true` en `espera`: la respuesta lleva `aviso_grupo`. Un monto con `al100: true` sale de la
 * fila de LISTA que tapó la lista de usados activa.
 *
 * Entrega baja, paso 3 (06/10/2026, decisión de Tomás): un monto `{ cotiza, entrega, excepcion: true }`
 * son 1 pago y 2 cuotas de la excepción (la tercera vez que no llega, con el cotizador bajo el mínimo);
 * `{ retiraCon: 220000, salvo: '13' }`, la entrega mínima del primer equipo de `con_esa_entrega`. Y una
 * regla más, siempre: ningún mensaje dice "recargo", "67%" ni "75%".
 *
 * Las fotos del cliente (07/10/2026, decisión de Tomás del 06/10): un turno con `fotos` (archivos de
 * test/fixtures) se las pasa a `cerebro.contestar` como `imagenes`, en base64, como las baja index.js en
 * vivo. El informe dice qué fotos iban.
 *
 * Las fotos de los equipos del local (08/10/2026, decisiones de Tomás; src/fotos-equipos.js): un caso con
 * `stockVivo: true` corre con el stock de la app en vivo (STOCK_APP_MODO=vivo: la herramienta `mandar_fotos`, el
 * local y el depósito), y con `fotosDeEquipos` ([{ archivo, modelo, colores }], las entradas de un `indice.json`)
 * el corredor arma una carpeta de fotos temporal con esas imágenes (chiquitas, inventadas) y su índice, y la usa
 * como FOTOS_DIR mientras dura el caso. En `espera`: `fotos: 1` (cuántas fotos de equipos salen), `pies:
 * [/regex/]` (cada una sobre el pie de alguna foto, en minúsculas y sin tildes) y `fraseDeposito: true` (sale la
 * frase del depósito de las fotos). Lo que le llega al cliente lleva las fotos como "[foto: <código>] <pie>".
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRINCIPAL = require.main === module;
if (PRINCIPAL) {
  // Antes de requerir nada: config.js y documentos.js leen las variables al cargarse.
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bateria-cerebro-'));
  process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
  process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
  process.env.ESTADO_SOLO_LECTURA = '';
  // Un PDF de mentira: el compromiso "sale" y queda marcado como en vivo.
  process.env.DOCS_DIR = path.join(TMP, 'documentos');
  fs.mkdirSync(process.env.DOCS_DIR);
  fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
  process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));
}

const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const sheets = require('../src/sheets');
const cotizador = require('../src/cotizador');
const responder = require('../src/responder');
const acciones = require('../src/acciones');
const promesas = require('../src/promesas');
const contexto = require('../src/contexto');
const chatsViejos = require('../src/chats-viejos');
const fotosEquipos = require('../src/fotos-equipos');
const stockApp = require('../src/stock-app');
const CASOS = require('./bateria-cerebro-casos');

/** Martes 06/10/2026, 15:00 en Neuquén: la hora del primer turno de cada caso. */
const INICIO = Date.parse('2026-10-06T15:00:00-03:00');
const DESPUES_POR_DEFECTO = '2 min';

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
const HORA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const horaDe = (ts) => {
  const p = Object.fromEntries(HORA.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${String(p.hour).padStart(2, '0')}:${String(p.minute).padStart(2, '0')}`;
};

/** "20 min", "3 h", "4 dias", "1 dia" → milisegundos. */
function duracion(texto) {
  const m = String(texto || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .match(/^(\d+(?:[.,]\d+)?)\s*(min|minutos?|h|hs|horas?|d|dias?)$/);
  if (!m) throw new Error(`no entiendo la duración "${texto}" (va como "20 min", "3 h" o "4 dias")`);
  const n = parseFloat(m[1].replace(',', '.'));
  const unidad = m[2].startsWith('m') ? 60e3 : m[2].startsWith('h') ? 3600e3 : 86400e3;
  return Math.round(n * unidad);
}

/** Minúsculas y sin tildes: así se prueban las regex de los casos. */
const normal = (t) => promesas.sinTildes(String(t || '')).replace(/ñ/g, 'n');

/**
 * Las frases fijas que pone el código y no Sonnet (13/10/2026): la espera de un turno, la de las fotos sin foto y las dos del
 * depósito (lunes a jueves, viernes a domingo). Dicen "me fijo" o "te confirmo", y el chequeo "sin promesas" es para lo que
 * escribe Sonnet: se sacan del texto antes de mirarlo (también si van adentro de un mensaje, como la del depósito).
 */
const FRASES_DEL_CODIGO = [
  ...cerebro.FRASES_TURNO,
  fotosEquipos.FRASE_SIN_FOTO,
  stockApp.fraseDeposito(Date.parse('2026-10-12T15:00:00-03:00')), // un lunes
  stockApp.fraseDeposito(Date.parse('2026-10-16T15:00:00-03:00')), // un viernes
].map((f) => normal(f));
/** El mensaje, sin tildes y sin las frases fijas del código. */
const sinFrasesDelCodigo = (m) => FRASES_DEL_CODIGO.reduce((t, f) => t.split(f).join(' '), normal(m));

/** Lo que hace `fn` (sincrónico) con Date.now en `ts`: las líneas entran al historial con su hora. */
function conHora(ts, fn) {
  const real = Date.now;
  Date.now = () => ts;
  try {
    return fn();
  } finally {
    Date.now = real;
  }
}

// ---------------------------------------------------------------------------
// Los montos de `espera`, calculados con la planilla del caso
// ---------------------------------------------------------------------------
const vendible = (f) => f && f.cotizable && f.precio_contado > 0;
const esSellado = (f) => /^sellad/i.test(String((f && f.condicion) || '').trim());

/** La fila de un pedido de monto: la primera vendible que da la búsqueda, como las herramientas. */
function filaDe(datos, pedido) {
  const modelo = pedido.contado || pedido.minimo || pedido.cotiza;
  // Bloque Ninjo 1b: `al100`, la fila de LISTA que tapó la lista de usados activa (#bateria).
  const deDonde = pedido.al100 ? { lista: datos.listaAl100 || [], usados: [] } : datos;
  let filas = sheets.buscarTodas(deDonde, modelo, pedido.capacidad || null).filter(vendible);
  if (pedido.condicion === 'sellado') filas = filas.filter(esSellado);
  if (pedido.condicion === 'usado') filas = filas.filter((f) => !esSellado(f));
  if (pedido.origen) filas = filas.filter((f) => f.origen === pedido.origen);
  // La lista del local (08/10/2026): `bateria: '100%'`, la fila con esa batería (como la dice `bateriaDe`).
  if (pedido.bateria) filas = filas.filter((f) => cotizador.bateriaDe(f) === pedido.bateria);
  return filas[0] || null;
}

/**
 * Entrega baja, paso 3 (06/10/2026): `{ retiraCon: 220000, salvo: '13' }` es la entrega mínima del equipo
 * que `cotizar` devuelve primero en `con_esa_entrega` (el más caro que se retira con ese monto, sin las
 * filas del modelo que no llegó), con la misma función que usa la herramienta.
 */
function loQueRetiraCon(datos, p) {
  const salvo = p.salvo ? (filaDe(datos, { minimo: p.salvo }) || {}).modelo || null : null;
  const texto = `lo que retira con ${cotizador.pesos(p.retiraCon)}${p.salvo ? ` (sin el ${p.salvo})` : ''}`;
  const [mejor] = cerebro.losQueRetiraCon([...(datos.lista || []), ...(datos.usados || [])], p.retiraCon, { salvo });
  if (!mejor) return { texto, error: 'con esa entrega no se retira ningún equipo de la planilla del caso' };
  return { texto, valores: [mejor.anticipo_min], nota: `el ${mejor.modelo}${mejor.capacidad_gb ? ` ${mejor.capacidad_gb}GB` : ''}` };
}

/** [{ texto, valores }]: cada pedido con los montos que tienen que estar (o un error). */
function resolverMontos(pedidos, datos) {
  return (pedidos || []).map((p) => {
    if (p.retiraCon) return loQueRetiraCon(datos, p);
    const fila = filaDe(datos, p);
    const nombre = p.contado ? `contado del ${p.contado}` : p.minimo ? `entrega mínima del ${p.minimo}` : `${p.cotiza} con ${cotizador.pesos(p.entrega)}`;
    const extra = [p.condicion, p.capacidad ? `${p.capacidad}GB` : null, p.bateria, p.origen, p.al100 ? 'al 100%' : null, p.excepcion ? 'la excepción' : null].filter(Boolean).join(', ');
    const texto = extra ? `${nombre} (${extra})` : nombre;
    if (!fila) return { texto, error: 'no está en la planilla del caso' };
    if (p.contado) return { texto, valores: [fila.precio_contado] };
    if (p.minimo) return { texto, valores: [fila.anticipo_min] };
    const cot = cotizador.cotizar(fila, p.entrega, datos.config);
    // Entrega baja, paso 3 (06/10/2026): con `excepcion: true`, 1 pago y 2 cuotas de la excepción (el
    // cotizador con `bajoMinimo`, la tercera vez); sin eso, bajo el mínimo es "no llega", como siempre.
    if (p.excepcion) {
      if (!cot.ok) return { texto, error: 'le falta más que el tope de la excepción: no se cotiza' };
      if (!cot.bajoMinimo) return { texto, error: 'con esa entrega llega al mínimo: no es la excepción' };
      return { texto, valores: [cot.pagoUnico, cot.cuotaDe2] };
    }
    if (!cot.ok || cot.bajoMinimo) return { texto, valores: [fila.anticipo_min], nota: 'no llega: la entrega mínima' };
    if (cot.soloContado) return { texto, valores: [cot.contado], nota: 'paga de contado' };
    return { texto, valores: [cot.pagoUnico, cot.cuotaDe2] };
  });
}

// ---------------------------------------------------------------------------
// Los chequeos
// ---------------------------------------------------------------------------
const SALUDO = /^(?:hola+|buenas+|buen dia|buenos dias|buenas tardes|buenas noches)\b/;
/** Bloque Ninjo 1b: a un caso de postventa nunca se le pregunta qué modelo busca. */
const PREGUNTA_MODELO = /que modelo|que (?:estas|estabas) (?:buscando|mirando)|que (?:buscabas|buscas)\b/;
/** Entrega baja, paso 3 (06/10/2026): ningún mensaje nombra el recargo ni los coeficientes de la excepción. */
const RECARGO = /\brecargos?\b|\b(?:67|75) ?%|\b(?:67|75) por ciento\b/;

/**
 * Los chequeos de un turno: [{ nombre, ok, detalle }]. `c` es lo que devolvió `cerebro.contestar`;
 * `saludadoAntes`, si hoy ya se había hablado con el cliente antes de este turno.
 */
function chequear(espera, c, datos, { saludadoAntes = false, postventa = false } = {}) {
  const r = c.r || {};
  const out = [];
  const anotar = (nombre, ok, detalle = '') => out.push({ nombre, ok: Boolean(ok), detalle });
  if (c.error) {
    anotar('Sonnet contestó', false, `error: ${c.error}`);
    return out;
  }
  const res = c.resultado;
  const deSonnet = res.escalar ? [] : res.sonnetMensajes || r.mensajes || [];
  const texto = normal(deSonnet.join('\n'));
  const intento = r.frenados || r.mensajes || [];
  const e = espera || {};

  if (e.escala !== undefined) {
    anotar(`escala: ${e.escala}`, res.escalar === e.escala, res.escalar ? `escaló: ${res.motivo}` : 'contestó');
  }
  for (const re of e.contiene || []) anotar(`contiene ${re}`, re.test(texto));
  if ((e.contieneAlguno || []).length) {
    anotar(`contiene alguno de ${e.contieneAlguno.map(String).join(' ')}`, e.contieneAlguno.some((re) => re.test(texto)));
  }
  for (const re of e.noContiene || []) {
    const m = texto.match(re);
    anotar(`no contiene ${re}`, !m, m ? `dice "${m[0]}"` : '');
  }
  for (const re of e.motivo || []) anotar(`motivo ${re}`, res.escalar && re.test(normal(res.motivo)), res.escalar ? `motivo: ${res.motivo}` : 'no escaló');
  const dichos = new Set(cerebro.montosEn(deSonnet.join('\n')));
  for (const m of resolverMontos(e.montos, datos)) {
    if (m.error) anotar(`monto: ${m.texto}`, false, m.error);
    else {
      const faltan = m.valores.filter((v) => !dichos.has(v));
      anotar(`monto: ${m.texto}${m.nota ? ` (${m.nota})` : ''}`, !faltan.length, faltan.length ? `falta ${faltan.map(cotizador.pesos).join(' y ')}` : m.valores.map(cotizador.pesos).join(' y '));
    }
  }
  for (const m of resolverMontos(e.noMontos, datos)) {
    const estan = (m.valores || []).filter((v) => dichos.has(v));
    anotar(`sin el monto: ${m.texto}`, !m.error && !estan.length, m.error || (estan.length ? `dice ${estan.map(cotizador.pesos).join(' y ')}` : ''));
  }
  if (e.maxMensajes !== undefined) anotar(`como mucho ${e.maxMensajes} mensaje(s)`, deSonnet.length <= e.maxMensajes, `${deSonnet.length}`);
  if (e.compromiso !== undefined) anotar(`compromiso_de_pago: ${e.compromiso}`, r.compromisoDePago === e.compromiso, `${r.compromisoDePago}`);
  for (const h of e.usa || []) anotar(`usa ${h}`, (r.herramientas || []).includes(h), (r.herramientas || []).join(', ') || 'ninguna');
  if (e.sinPreguntar) anotar('no se le pregunta a Sonnet', Boolean(r.sinLlamar), r.sinLlamar ? `acuse: ${r.sinLlamar}` : 'se le preguntó');
  if (e.aviso !== undefined) anotar(`aviso al grupo: ${e.aviso}`, Boolean(r.avisoGrupo) === e.aviso, r.avisoGrupo || 'sin aviso');
  // Las fotos de los equipos (08/10/2026): las que le llegan (también si después escala por otro modelo), sus pies y la frase del depósito.
  const fotosDeEquipos = (res.mensajes || []).filter(acciones.esFotoEquipo);
  if (e.fotos !== undefined) anotar(`fotos de equipos: ${e.fotos}`, fotosDeEquipos.length === e.fotos, fotosDeEquipos.map((f) => `${f.codigo}: ${f.pie.split('\n')[0]}`).join(' · ') || 'ninguna');
  for (const re of e.pies || []) anotar(`un pie con ${re}`, fotosDeEquipos.some((f) => re.test(normal(f.pie))), fotosDeEquipos.map((f) => normal(f.pie)).join(' · ') || 'sin fotos');
  if (e.primerPie) anotar(`la primera foto con ${e.primerPie}`, fotosDeEquipos.length > 0 && e.primerPie.test(normal(fotosDeEquipos[0].pie)), fotosDeEquipos.length ? normal(fotosDeEquipos[0].pie) : 'sin fotos');
  if (e.fraseDeposito !== undefined) {
    const frase = (res.mensajes || []).map(acciones.comoTexto).find((m) => /le pido fotos a los chicos del dep[oó]sito/.test(m));
    anotar(`frase del depósito de las fotos: ${e.fraseDeposito}`, Boolean(frase) === e.fraseDeposito, frase || 'sin la frase');
  }

  // Siempre, sobre lo que quiso mandar (también si la guardia lo frenó).
  const validos = new Set((r.montosDeHerramientas || []).map(Number));
  const inventados = intento.flatMap((m) => cerebro.montosEn(m)).filter((v) => !validos.has(v));
  anotar('ningún monto inventado', !inventados.length, inventados.map(cotizador.pesos).join(', '));
  const falta = intento.map(normal).find((m) => /\bte faltan?\b/.test(m));
  anotar('sin "te falta"', !falta, falta || '');
  // Entrega baja, paso 3 (06/10/2026): la excepción se presenta como excepción, nunca con el recargo ni sus porcentajes.
  // Sobre lo que escribió Sonnet, con [lista] sin reemplazar (08/10/2026): la batería de una línea de la lista del local
  // ("Ip 11 64gb 75% 190.000") no es el 75% de la excepción.
  const recargo = (r.frenados || r.escritos || intento).map(normal).map((m) => m.match(RECARGO)).find(Boolean);
  anotar('sin "recargo" ni 67% / 75%', !recargo, recargo ? `dice "${recargo[0]}"` : '');
  // Sin las frases fijas del código (13/10/2026): solo lo que escribió Sonnet puede prometer.
  const promesa = intento
    .map(sinFrasesDelCodigo)
    .map((m) => promesas.promesaDeOtro(m) || (m.match(promesas.PROMESA_DE_CONTACTO) || [])[0])
    .find(Boolean);
  anotar('sin promesas', !promesa, promesa ? `"${promesa}"` : '');
  const sinPuntos = intento.flatMap((m) => cerebro.sinPuntosEn(m));
  anotar('montos con puntos', !sinPuntos.length, sinPuntos.join(', '));
  // Bloque Ninjo 1 (05/10/2026): ningún mensaje nombra algo interno (lo frena la guardia; acá se ve si lo intentó).
  const interno = intento.map((m) => cerebro.nombraAlgoInterno(m)).find(Boolean);
  anotar('nada interno', !interno, interno ? `"${interno}"` : '');
  // Bloque Ninjo 1b: la cotización va solo en el bloque (lo que escribió Sonnet, con [cotizacion] sin reemplazar).
  const escritos = r.frenados || r.escritos || r.mensajes || [];
  const aMano = escritos.map((m) => cerebro.cotizaAMano(m)).find(Boolean);
  anotar('cotización en el bloque', !aMano, aMano ? `escribió "${aMano}"` : '');
  if (postventa) {
    const pregunta = texto.match(PREGUNTA_MODELO);
    anotar('postventa: no le pregunta qué modelo busca', !pregunta, pregunta ? `dice "${pregunta[0]}"` : '');
  }
  // El saludo del día lo pone el sistema (marca `saludoEn`), una vez y solo si hoy no se habló:
  // Sonnet no saluda nunca.
  const delSistema = (res.mensajes || []).filter((m) => (acciones.marcasDe(m) || {}).saludoEn).length;
  const deSonnetSaluda = deSonnet.flatMap((m) => m.split('\n')).filter((l) => SALUDO.test(normal(l).trim()));
  const ok = !deSonnetSaluda.length && delSistema <= (saludadoAntes ? 0 : 1);
  const detalle = [
    deSonnetSaluda.length ? `Sonnet saluda: "${deSonnetSaluda[0]}"` : '',
    delSistema > (saludadoAntes ? 0 : 1) ? `${delSistema} saludo(s) del sistema${saludadoAntes ? ' y hoy ya se había hablado' : ''}` : '',
  ].filter(Boolean);
  anotar('sin saludo duplicado', ok, detalle.join('; '));
  return out;
}

// ---------------------------------------------------------------------------
// Correr
// ---------------------------------------------------------------------------
const copia = (x) => JSON.parse(JSON.stringify(x));

/** Las fotos de un turno (`fotos`: archivos de test/fixtures), en base64 como las baja index.js. */
const FIXTURES = path.join(__dirname, 'fixtures');
const TIPO_DE_FOTO = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp' };
function imagenesDe(turno) {
  return (turno.fotos || []).map((archivo) => {
    const tipo = TIPO_DE_FOTO[path.extname(archivo).toLowerCase()];
    if (!tipo) throw new Error(`la foto "${archivo}" no es jpeg, png, gif ni webp`);
    return { media_type: tipo, data: fs.readFileSync(path.join(FIXTURES, archivo)).toString('base64') };
  });
}

/**
 * Lo que Evolution tiene del chat (`caso.evolution`: { quien, texto, hace }), como registros de
 * /chat/findMessages, con la hora contada desde `desde`. `texto` puede ser una función de la planilla
 * del caso (los montos de una cotización de una persona). Lo del bot lleva un id que se anota como
 * envío del bot (chats-viejos), como en vivo.
 */
function registrosDeEvolution(caso, chatId, desde, datos) {
  return (caso.evolution || []).map((l, k) => {
    const id = `BAT-${l.quien}-${k}-${desde}`;
    if (l.quien === 'bot') chatsViejos.envioConfirmado(id);
    const texto = typeof l.texto === 'function' ? l.texto(datos) : l.texto;
    return {
      key: { remoteJid: chatId, fromMe: l.quien !== 'cliente', id },
      messageType: l.message ? Object.keys(l.message)[0] : 'conversation',
      message: l.message || { conversation: texto },
      messageTimestamp: Math.floor((desde - duracion(l.hace)) / 1000),
    };
  });
}

/** Una imagen chiquita (un PNG de 1 × 1) para las fotos de los equipos de un caso: lo que importa es el índice. */
const PNG_CHICO = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cfc000000301010018dd8db00000000049454e44ae426082', 'hex');

/**
 * La carpeta de fotos de un caso con `fotosDeEquipos` (08/10/2026): las imágenes y el `indice.json` en un temporal,
 * puesta como FOTOS_DIR del bot mientras dura el caso. Devuelve la función que la saca y la borra.
 */
function conFotosDeEquipos(caso) {
  const antes = config.fotosDir;
  const carpeta = fs.mkdtempSync(path.join(os.tmpdir(), 'bateria-fotos-equipos-'));
  for (const f of caso.fotosDeEquipos) {
    const ruta = path.join(carpeta, f.archivo);
    fs.mkdirSync(path.dirname(ruta), { recursive: true });
    fs.writeFileSync(ruta, PNG_CHICO);
  }
  fs.writeFileSync(path.join(carpeta, fotosEquipos.ARCHIVO_INDICE), JSON.stringify({ v: 1, fotos: caso.fotosDeEquipos }, null, 2));
  config.fotosDir = carpeta;
  fotosEquipos._reiniciar();
  return () => {
    config.fotosDir = antes;
    fotosEquipos._reiniciar();
    fs.rmSync(carpeta, { recursive: true, force: true });
  };
}

/**
 * Corre un caso entero. `base` es la planilla (la copia congelada o la de hoy). Con `stockApp: 'vivo'` (la lista del
 * local) o `stockVivo` (las fotos de los equipos), el caso corre con el stock de la app en vivo, sea cual sea
 * STOCK_APP_MODO en el .env; al terminar, el modo vuelve a ser el de antes.
 */
async function correrCaso(caso, base, i = 0) {
  // El stock de la app en vivo y las fotos de los equipos (08/10/2026), solo mientras dura el caso.
  const modoAntes = config.stockApp.modo;
  if (caso.stockApp) config.stockApp.modo = caso.stockApp;
  else if (caso.stockVivo) config.stockApp.modo = 'vivo';
  const sacarFotos = caso.fotosDeEquipos ? conFotosDeEquipos(caso) : () => {};
  try {
    return await correrCasoConTodo(caso, base, i);
  } finally {
    sacarFotos();
    config.stockApp.modo = modoAntes;
    sheets.invalidarCache();
  }
}

async function correrCasoConTodo(caso, base, i) {
  sheets.usarFixture(caso.planilla ? caso.planilla(copia(base)) : copia(base));
  sheets.invalidarCache();
  sheets.usarListaBateria(caso.bateria || null);
  const datos = await responder.leerPlanilla();
  const chatId = `bateria-${i}-${Date.now()}@s.whatsapp.net`;
  state.reiniciar(chatId);
  const registros = registrosDeEvolution(caso, chatId, INICIO, datos);
  if (caso.estado) conHora(INICIO - 60 * 60 * 1000, () => state.actualizar(chatId, copia(caso.estado)));
  const turnos = [];
  let t = INICIO;
  for (const [k, turno] of caso.turnos.entries()) {
    if (k > 0) t += duracion(turno.despues || DESPUES_POR_DEFECTO);
    for (const l of turno.antes || []) {
      const ts = t - duracion(l.hace);
      conHora(ts, () => {
        if (l.quien === 'cliente') state.agregarAlHistorial(chatId, 'cliente', l.texto);
        else if (l.quien === 'persona') {
          state.agregarAlHistorial(chatId, 'vendedor', l.texto, { humano: true });
          state.actualizar(chatId, { ultimoHumano: Math.max(ts, state.obtener(chatId).ultimoHumano || 0) });
        } else state.agregarAlHistorial(chatId, 'vendedor', l.texto);
      });
    }
    const lineas = [].concat(turno.cliente);
    lineas.forEach((texto, j) => conHora(t + j * 1000, () => state.agregarAlHistorial(chatId, 'cliente', texto)));
    const ahora = t + lineas.length * 1000;
    // Bloque Ninjo 1b: el historial se completa con Evolution antes de contestar, como en vivo.
    await contexto.completar(chatId, { buscar: async (jid) => (jid === chatId ? registros : []) });
    const saludadoAntes = responder.hablaronHoy(state.obtener(chatId), ahora);
    // Con las líneas de la tanda y su hora, como index.js (los acuses, bloque Ninjo 1).
    const deLaTanda = lineas.map((texto, j) => ({ ts: t + j * 1000, texto }));
    const imagenes = imagenesDe(turno);
    const conFotos = imagenes.length ? { imagenes, fotos: { mandadas: imagenes.length, sinVer: 0 } } : {};
    const c = await cerebro.contestar({ chatId, mensaje: lineas.join('\n'), nombre: caso.nombreCliente || '', ahora, lineas: deLaTanda, ...conFotos });
    // Sale como en vivo: las marcas se confirman y entra al historial. (Con las fotos de los equipos, 08/10/2026,
    // puede salir algo y DESPUÉS escalar por un modelo sin foto: lo que salió entra igual.)
    if (c.resultado && (!c.resultado.escalar || (c.resultado.mensajes || []).length)) {
      conHora(ahora + 30 * 1000, () => {
        for (const m of c.resultado.mensajes) {
          state.confirmarMarcas(chatId, acciones.marcasDe(m));
          state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m));
        }
        state.actualizar(chatId, { ultimoBot: Date.now() });
      });
    }
    const chequeos = chequear(turno.espera, c, datos, { saludadoAntes, postventa: Boolean(caso.postventa) });
    turnos.push({ hora: ahora, cliente: lineas, fotos: turno.fotos || [], c, chequeos, ok: chequeos.every((x) => x.ok) });
  }
  state.reiniciar(chatId);
  return { nombre: caso.nombre, turnos, ok: turnos.every((x) => x.ok) };
}

/** Los casos que pide la línea de comandos. */
/** El número del caso ("22a. Canje…" → 22). */
const numeroDe = (c) => parseInt(String(c.nombre), 10) || 0;

function elegirCasos(casos, { solo = null, max = null, desde = null } = {}) {
  let lista = casos;
  // --desde 22: los casos del 22 en adelante (para repetir lo que cortó un error de red, 03/10/2026).
  if (desde) lista = lista.filter((c) => numeroDe(c) >= desde);
  if (solo) lista = lista.filter((c) => normal(c.nombre).includes(normal(solo)));
  if (max) lista = lista.slice(0, max);
  return lista;
}

async function correr(casos, base, { alTerminarCaso = () => {} } = {}) {
  const resultados = [];
  for (const [i, caso] of casos.entries()) {
    const r = await correrCaso(caso, base, i);
    resultados.push(r);
    alTerminarCaso(r, i);
  }
  return resultados;
}

// ---------------------------------------------------------------------------
// El informe
// ---------------------------------------------------------------------------
const cita = (t) =>
  String(t || '')
    .split('\n')
    .map((l) => '> ' + l)
    .join('\n');
const usd = (n) => `US$${(Number(n) || 0).toFixed(4)}`;
const tokens = (u) => `entrada ${u.entrada} · salida ${u.salida} · caché leída ${u.cacheLeida} · caché escrita ${u.cacheEscrita}`;
const usoEnCero = () => ({ entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 });

function armarInforme(resultados, { planilla = '', fecha = DIA.format(new Date()) } = {}) {
  const total = usoEnCero();
  let totalUsd = 0;
  const todos = resultados.flatMap((r) => r.turnos);
  for (const t of todos) {
    const u = (t.c.r && t.c.r.uso) || usoEnCero();
    for (const k of Object.keys(total)) total[k] += u[k] || 0;
    totalUsd += Number(t.c.r && t.c.r.usd) || 0;
  }
  const casosOk = resultados.filter((r) => r.ok).length;
  const turnosOk = todos.filter((t) => t.ok).length;
  const md = [
    `# Batería del cerebro Sonnet: ${resultados.length} casos, ${todos.length} turnos`,
    '',
    `\`npm run bateria-cerebro\` del ${fecha}: ${config.cerebro.modelo} (esfuerzo ${config.cerebro.esfuerzo}) contra las conversaciones de test/bateria-cerebro-casos.js, como en vivo (saludo, filtro de repetidos y PDF). Precios: ${planilla}. No se le mandó nada a nadie.`,
    '',
    '## Resumen',
    '',
    `- Casos: ${resultados.length} · pasan ${casosOk} · fallan ${resultados.length - casosOk}`,
    `- Turnos: ${todos.length} · pasan ${turnosOk} · fallan ${todos.length - turnosOk}`,
    `- Tokens: ${tokens(total)}`,
    `- USD: total ${usd(totalUsd)} · promedio por turno ${usd(todos.length ? totalUsd / todos.length : 0)}`,
    '',
  ];
  const fallan = resultados.filter((r) => !r.ok);
  if (fallan.length) {
    md.push('### Los que fallan', '');
    for (const r of fallan) {
      const detalle = r.turnos
        .map((t, k) => (t.ok ? null : `turno ${k + 1}: ${t.chequeos.filter((x) => !x.ok).map((x) => x.nombre).join(', ')}`))
        .filter(Boolean)
        .join(' · ');
      md.push(`- ${r.nombre} (${detalle})`);
    }
    md.push('');
  }
  for (const r of resultados) {
    md.push(`## ${r.ok ? '✓' : '✗'} ${r.nombre}`, '');
    r.turnos.forEach((t, k) => {
      const s = t.c.r || {};
      md.push(`### Turno ${k + 1} · ${horaDe(t.hora)} ${t.ok ? '✓' : '✗'}`, '', '**Cliente**', '', cita(t.cliente.join('\n')), '');
      if ((t.fotos || []).length) md.push(`Con ${t.fotos.length === 1 ? 'la foto' : 'las fotos'}: ${t.fotos.join(', ')}`, '');
      if (t.c.error) md.push(`**Sonnet**: error: ${t.c.error}`, '');
      else if (s.sinLlamar) md.push(`**Sonnet**: no se le preguntó (acuse: ${s.sinLlamar}): no sale nada y no escala`, '');
      else if (t.c.resultado.escalar) {
        md.push(`**Sonnet**: escala: ${t.c.resultado.motivo}`, '');
        if (s.frenados) md.push('Lo que quería mandar (lo frenó la guardia):', '', cita(s.frenados.join('\n')), '');
      } else {
        md.push(`**Sonnet** (lo que le llega, con el saludo y el PDF):`, '', cita(t.c.resultado.mensajes.map(acciones.comoTexto).join('\n')), '');
      }
      md.push(
        `Herramientas: ${(s.herramientas || []).join(', ') || 'ninguna'} · leyó ${cerebro.leidosTexto(s.leidos)} · ${tokens(s.uso || usoEnCero())} · ${usd(s.usd)}${s.ms != null ? ` · ${s.ms} ms` : ''}`,
        ''
      );
      for (const x of t.chequeos) md.push(`- ${x.ok ? '✓' : '✗'} ${x.nombre}${x.detalle ? ` — ${x.detalle}` : ''}`);
      md.push('');
    });
  }
  md.push('## Total', '', `${resultados.length} casos (${casosOk} pasan) · ${todos.length} turnos (${turnosOk} pasan) · ${tokens(total)} · total ${usd(totalUsd)}`, '');
  return md.join('\n');
}

// ---------------------------------------------------------------------------
// Línea de comandos
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2);
  const valor = (flag) => {
    const i = args.indexOf(flag);
    return i > -1 ? args[i + 1] || '' : null;
  };
  for (const flag of ['--solo', '--max', '--informe', '--desde']) {
    if (valor(flag) === '') {
      console.log(`\nFalta el valor después de ${flag}.\n`);
      process.exit(1);
    }
  }
  const max = valor('--max') ? parseInt(valor('--max'), 10) : null;
  if (max !== null && !(max > 0)) {
    console.log('\nUso: npm run bateria-cerebro -- --max 5\n');
    process.exit(1);
  }
  const enVivo = args.includes('--planilla-en-vivo');
  const desde = valor('--desde') ? parseInt(valor('--desde'), 10) : null;
  if (desde !== null && !(desde > 0)) {
    console.log('\nUso: npm run bateria-cerebro -- --desde 22\n');
    process.exit(1);
  }
  const casos = elegirCasos(CASOS, { solo: valor('--solo'), max, desde });
  if (!casos.length) {
    console.log('\nNingún caso con ese nombre.\n');
    process.exit(1);
  }
  if (!config.cerebro.apikey) {
    console.log('\nFalta ANTHROPIC_API_KEY en el .env: sin la clave no hay nada que correr.\n');
    process.exit(1);
  }
  // Solo sale a Anthropic (y a Google Sheets, solo lectura, con --planilla-en-vivo). Nunca a Gemini.
  require('../src/gemini').usarSoloLocal(true);
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (url, ...resto) => {
    const u = String(url);
    if (u.startsWith('https://api.anthropic.com/')) return fetchReal(url, ...resto);
    if (enVivo && /^https:\/\/(?:sheets|oauth2|www)\.googleapis\.com\//.test(u)) return fetchReal(url, ...resto);
    throw new Error(`la batería no sale a ${u.split('?')[0]}`);
  };
  const rangos = [...new Set(casos.map((c) => c.bateria).filter(Boolean))];
  const base = enVivo ? await sheets.copiaEnVivo(rangos) : require('./fixture-planilla');
  const turnos = casos.reduce((n, c) => n + c.turnos.length, 0);
  console.log(`\nCorriendo ${casos.length} casos (${turnos} turnos) con ${config.cerebro.modelo} (de 1 a 5 llamadas a la API por turno)...\n`);
  const resultados = await correr(casos, base, {
    alTerminarCaso: (r) => console.log(`  ${r.ok ? 'ok   ' : 'FALLA'} ${r.nombre}`),
  });
  const md = armarInforme(resultados, { planilla: enVivo ? 'planilla de hoy (solo lectura)' : 'copia congelada (test/fixture-planilla.js)' });
  const informe = valor('--informe') || path.join(__dirname, '..', 'data', `bateria-cerebro-${DIA.format(new Date())}.md`);
  fs.mkdirSync(path.dirname(informe), { recursive: true });
  fs.writeFileSync(informe, md);
  console.log('');
  for (const l of md.split('\n').filter((x) => x.startsWith('- ') && !x.startsWith('- ✓') && !x.startsWith('- ✗')).slice(0, 4)) console.log(l);
  console.log(`\nInforme: ${informe}\n`);
  return 0;
}

if (PRINCIPAL) {
  main()
    // Sin process.exit al terminar (bloque Ninjo 2, como test/probar-contexto.js): en Windows, cortar con
    // un fetch todavía cerrando tira "Assertion failed ... async.c". El proceso termina solo, con el código.
    .then((codigo) => {
      process.exitCode = codigo || 0;
    })
    .catch((e) => {
      console.error(e);
      process.exitCode = 1;
    });
}

module.exports = { correr, correrCaso, chequear, resolverMontos, registrosDeEvolution, armarInforme, elegirCasos, duracion, INICIO, CASOS };
