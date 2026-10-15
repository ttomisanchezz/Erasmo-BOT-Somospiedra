'use strict';
/**
 * Chiara manda fotos de los equipos del local, como Fran (decisiones de Tomás del 08/10/2026).
 *
 *   node test/fotos-equipos.test.js
 *
 * Todo sin red: un `fetch` de mentira que contesta como la API de Anthropic (y como Evolution, en el
 * chequeo del camino real de `enviarImagen`), Evolution de mentira, la planilla de la copia congelada con
 * las unidades del local de la prueba (USADOS, con código y color) y una carpeta de fotos temporal
 * (`FOTOS_DIR`) con imágenes chiquitas en `iPhone <modelo>/` y su `indice.json`. `STOCK_APP_MODO=vivo`.
 *
 * Unidades: 15 128GB 87 % GRAPHITO $740.000; 13 128GB 100 % Rosa y Azul $535.000; 13 128GB 77 % ROJO y dos
 * verde $480.000 (solo de contado); 14 128GB 100 % sin color $595.000; un 17 256GB sellado; y el 16 Pro
 * solo en LISTA (el depósito). Se prueba:
 *   1. "me mostrás el 15?" → una imagen con el pie "15 128gb 87% 740.000", sin escalar, y la línea
 *      "[foto] …" en el historial que lee Sonnet en la vuelta siguiente;
 *   2. una foto de dos celulares: "me quedó el de la derecha, el azul"; una foto del azul solo le gana;
 *   3. "fotos del 13" con 5 unidades → 3 fotos, la cotizada antes primera, los dos verdes una sola vez; entre
 *      varios modelos, el de la cotizada adelante y, si no hay cotizada, el modelo del chat;
 *   4. el depósito: la frase con "mañana" (jueves) y "el lunes" (viernes), el aviso al grupo, sin escalar;
 *   5. "fotos del 13 y del 14": las del 13 y después escala por el 14 (sin color), con el código;
 *   6. saludo + texto de Sonnet + 3 fotos → nunca más de 4 mensajes;
 *   7. el índice que no está o está roto → sin fotos, escala como hoy, un aviso en consola; cambia → se relee;
 *   8. apagado y sombra → idéntico a hoy (sin la herramienta, escala);
 *   9. la guardia: "te mando fotos" sin la herramienta frena; la frase del depósito puesta por el código no;
 *  10. el camino real de `evolution.enviarImagen`: la subcarpeta vale, la foto fuera de la carpeta no;
 *  11. una foto que no sale: el 📷 al grupo y el chat sigue;
 *  12. la sombra con persona: Sonnet puede elegir las fotos, pero no le llega nada a nadie.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-equipos-'));
const FOTOS = path.join(TMP, 'fotos');
const GRUPO = '120363000000000077@g.us';

// El entorno se fija acá y no se hereda del .env (dotenv no pisa lo que ya está puesto).
process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '6';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '5490000099999';
process.env.NUMEROS_PILOTO = 'todos';
process.env.SOLO_CHATS_NUEVOS = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.RECORDATORIO_HORA = '0';
process.env.RESUMEN_ACTIVO = 'false';
process.env.GUARDIAN_ACTIVO = 'false';
process.env.TECHSUR_ACTIVO = 'false';
process.env.ESPEJO_COTIZADOR_ACTIVO = 'false';
process.env.AUDIO_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.FOTOS_DIR = FOTOS;
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.CEREBRO_MODO = 'todos';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
process.env.STOCK_APP_MODO = 'vivo';
process.env.EVOLUTION_URL = 'http://evolution.de.mentira';
process.env.EVOLUTION_APIKEY = 'clave-de-mentira';
process.env.EVOLUTION_INSTANCE = 'prueba';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Las fotos de la prueba: imágenes chiquitas en `fotos/iPhone <modelo>/` y el índice
// ---------------------------------------------------------------------------
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d4944415478da6364f8cfc000000301010018dd8db00000000049454e44ae426082', 'hex');
const ARCHIVO_INDICE = path.join(FOTOS, 'indice.json');
function foto(archivo) {
  const ruta = path.join(FOTOS, archivo);
  fs.mkdirSync(path.dirname(ruta), { recursive: true });
  fs.writeFileSync(ruta, PNG);
}
let mtime = Date.now();
/** Escribe el índice con una fecha de modificación siempre más nueva (el bot lo relee por esa fecha). */
function indice(fotos) {
  if (fotos === null) {
    fs.rmSync(ARCHIVO_INDICE, { force: true });
    return;
  }
  fs.writeFileSync(ARCHIVO_INDICE, typeof fotos === 'string' ? fotos : JSON.stringify({ v: 1, fotos }, null, 2));
  mtime += 5000;
  fs.utimesSync(ARCHIVO_INDICE, new Date(mtime), new Date(mtime));
}
const INDICE_DE_HOY = [
  { archivo: 'iPhone 15/grafito.jpg', modelo: 'iPhone 15', colores: [['grafito', 'graphito']] },
  { archivo: 'iPhone 13/rosa-azul.jpg', modelo: 'iPhone 13', colores: [['rosa'], ['azul']] },
  { archivo: 'iPhone 13/rojo.jpg', modelo: 'iPhone 13', colores: [['rojo']] },
  { archivo: 'iPhone 13/verde.jpg', modelo: 'iPhone 13', colores: [['verde']] },
  { archivo: 'iPhone 17/negro.jpg', modelo: 'iPhone 17', colores: [['negro']] },
];
for (const f of [...INDICE_DE_HOY.map((x) => x.archivo), 'iPhone 13/azul.jpg', 'iPhone 13/tres.jpg', 'iPhone 13/cuatro.jpg']) foto(f);
indice(INDICE_DE_HOY);

// ---------------------------------------------------------------------------
// La API de mentira (como en test/cerebro-vivo.test.js)
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const FICHA = { quiere_avanzar: false, cuando: '', cuando_es: 'no_dijo', forma_pago: 'no_dijo', zona: '', canje: '' };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const responde = (mensajes, extra = {}) => [usar('responder', { mensajes, ficha: FICHA, ...extra })];
const escala = (motivo) => [usar('escalar', { motivo, ficha: FICHA })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
  pedidos.length = 0;
}
// Evolution de verdad (el chequeo 10): lo que llega a /message/sendMedia.
const aEvolution = [];
globalThis.fetch = async (url, opciones = {}) => {
  const u = String(url);
  if (u.startsWith('http://evolution.de.mentira/')) {
    aEvolution.push({ ruta: u.replace('http://evolution.de.mentira', ''), body: JSON.parse(opciones.body) });
    return comoRespuesta(201, { key: { remoteJid: 'x', fromMe: true, id: 'EVREAL' + aEvolution.length } });
  }
  if (!u.startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + u);
  const body = JSON.parse(opciones.body);
  pedidos.push({ body });
  const paso = pasos[pedidos.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  const content = typeof paso === 'function' ? paso(body) : paso;
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: 'tool_use', usage: { ...USO } });
};
/** El JSON del último tool_result que fue en algún pedido (lo que devolvió la herramienta). */
function resultadoDe(nombre) {
  for (const p of [...pedidos].reverse()) {
    for (const m of [...p.body.messages].reverse()) {
      if (m.role !== 'user' || !Array.isArray(m.content)) continue;
      const r = m.content.find((c) => c.type === 'tool_result');
      if (r) return JSON.parse(r.content);
    }
  }
  assert.fail('sin resultado de ' + nombre);
}
const nombresDeHerramientas = (i = 0) => pedidos[i].body.tools.map((t) => t.name).sort();
const textoDelPedido = (i) => pedidos[i].body.messages[0].content.map((b) => b.text || '').join('\n');

// ---------------------------------------------------------------------------
// El bot, sin red
// ---------------------------------------------------------------------------
const sheets = require('../src/sheets');
const fixture = require('./fixture-planilla');
const copia = (x) => JSON.parse(JSON.stringify(x));
/** Una unidad del local (una fila de USADOS como la escribe el stock de la app, ya leída por sheets.js). */
function unidad(id, modelo, capacidad_gb, color, bateria, precio_contado, anticipo_min, extra = {}) {
  const sellado = bateria === 'SELLADO';
  return {
    origen: 'USADOS',
    id,
    modelo,
    capacidad_gb,
    color,
    bateria_min: sellado ? 0 : bateria,
    condicion: sellado ? 'Sellado' : '',
    detalles: '',
    precio_contado,
    precio_cotizacion: 0,
    anticipo_min,
    pago_unico_manual: 0,
    cuota_2_manual: 0,
    cotizable: true,
    ...(anticipo_min > 0 ? {} : { solo_contado: true }),
    ...extra,
  };
}
const UNIDADES = {
  quince: unidad('15-128-001', 'iPhone 15', 128, 'GRAPHITO', 87, 740000, 420000),
  rosa: unidad('13-128-028', 'iPhone 13', 128, 'Rosa', 100, 535000, 370000),
  azul: unidad('13-128-029', 'iPhone 13', 128, 'Azul', 100, 535000, 370000),
  rojo: unidad('13-128-013', 'iPhone 13', 128, 'ROJO', 77, 480000, 0),
  verde1: unidad('13-128-025', 'iPhone 13', 128, 'verde', 77, 480000, 0),
  verde2: unidad('13-128-026', 'iPhone 13', 128, 'verde', 77, 480000, 0),
  catorce: unidad('14-128-008', 'iPhone 14', 128, '', 100, 595000, 410000),
  diecisiete: unidad('17-256-001', 'iPhone 17', 256, 'Negro', 'SELLADO', 1700000, 950000),
};
const TODAS = Object.values(UNIDADES);
/**
 * La planilla de la prueba: la copia congelada (LISTA, con el 16 Pro solo ahí; el 13, el 14 y el 15 con los
 * números de la LISTA de hoy, 08/10/2026, así `cotizar` agarra la unidad del local y no la del depósito más
 * barato) y estas unidades del local.
 */
const DE_HOY = { 'iPhone 13': [535000, 370000], 'iPhone 14': [595000, 410000], 'iPhone 15': [740000, 420000] };
function planilla(usados = TODAS) {
  const base = copia(fixture);
  base.lista = base.lista.map((f) => (DE_HOY[f.modelo] ? { ...f, bateria_min: 100, bateria_texto: '', precio_contado: DE_HOY[f.modelo][0], anticipo_min: DE_HOY[f.modelo][1], pago_unico_manual: 0, cuota_2_manual: 0 } : f));
  sheets.usarFixture({ ...base, usados: copia(usados) });
  sheets.invalidarCache();
}
planilla();
sheets.registrarLead = async () => {};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const enviarImagenReal = evolution.enviarImagen;
const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, t) => {
  aClientes.push({ numero, tipo: 'texto', texto: t });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero, ruta, caption) => {
  aClientes.push({ numero, tipo: 'imagen', texto: caption, ruta });
  return respuestaEvolution(numero);
};
evolution.enviarDocumento = async (numero, ruta, pie) => {
  aClientes.push({ numero, tipo: 'documento', texto: pie, ruta });
  return respuestaEvolution(numero);
};
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });
evolution.buscarMensajesDeChat = async () => [];

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const fotosEquipos = require('../src/fotos-equipos');
const acciones = require('../src/acciones');

const escrito = (chatId, t) => ({ key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() }, pushName: 'Lucia', message: { conversation: t } });
let n = 0;
const nuevoChat = () => '54900000' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const numero = (chat) => chat.split('@')[0];
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
const imagenesA = (chat) => aEste(chat).filter((m) => m.tipo === 'imagen');
const habla = (chat, t) => bot.procesar(escrito(chat, t));
const delChat = (chat) => state.todos()[chat] || {};
function eventos() {
  try {
    return fs.readFileSync(process.env.APRENDIZAJE_PATH, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
}
const relativa = (ruta) => path.relative(FOTOS, ruta).split(path.sep).join('/');
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  aEvolution.length = 0;
}
const AR = (dia, hora = '12:00') => Date.parse(`${dia}T${hora}:00-03:00`);
const JUEVES = AR('2026-10-08');
const VIERNES = AR('2026-10-09');
/** Un turno directo contra `cerebro.pensar` (sin index.js), con la hora del pedido. */
const pensar = (chatId, mensaje, ahora = JUEVES) => cerebro.pensar({ chatId, mensaje, nombre: 'Lucia', ahora });
const silencio = async (fn) => {
  const [l, e, w] = [console.log, console.error, console.warn];
  const avisos = [];
  console.log = () => {};
  console.error = (...a) => avisos.push(a.join(' '));
  console.warn = (...a) => avisos.push(a.join(' '));
  try {
    const r = await fn();
    return { r, avisos };
  } finally {
    console.log = l;
    console.error = e;
    console.warn = w;
  }
};

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    const detalle = e && e.message ? e.message.split('\n').map((l) => l.trim()).filter(Boolean).join(' ') : String(e);
    const donde = e && e.stack ? (e.stack.split('\n').find((l) => /fotos-equipos\.test\.js:\d+/.test(l)) || '').trim() : '';
    console.log('  FALLA ' + nombre + ' -> ' + detalle.slice(0, 600) + (donde ? ' | ' + donde : ''));
  } finally {
    config.stockApp.modo = 'vivo';
    planilla();
    indice(INDICE_DE_HOY);
    limpiar();
  }
}

(async () => {
  console.log('\nChiara manda fotos de los equipos del local (08/10/2026)\n');

  // ------------------------------------------------------------ las piezas
  await check('el pie de foto: "<modelo> <capacidad>gb <batería> <precio sin $>", en minúscula; un sellado dice "sellado"', () => {
    assert.strictEqual(fotosEquipos.pieDe(UNIDADES.quince), '15 128gb 87% 740.000');
    assert.strictEqual(fotosEquipos.pieDe(unidad('14P-128-001', 'iPhone 14 Pro', 128, 'Negro', 100, 835000, 480000)), '14 pro 128gb 100% 835.000');
    assert.strictEqual(fotosEquipos.pieDe(UNIDADES.diecisiete), '17 256gb sellado 1.700.000');
    assert.strictEqual(fotosEquipos.pieDe({ ...UNIDADES.quince, bateria_texto: '85-93' }), '15 128gb 85-93% 740.000');
    assert.strictEqual(fotosEquipos.pieDe(unidad('15PM-128-001', 'iPhone 15 Pro Max', 128, 'Azul', 83, 1180000, 700000)), '15 pro max 128gb 83% 1.180.000');
    assert.strictEqual(fotosEquipos.textoDePosicion(0, 2, 'cian'), 'me quedó el de la izquierda, el cian');
    assert.strictEqual(fotosEquipos.textoDePosicion(1, 2, 'Azul'), 'me quedó el de la derecha, el azul');
    assert.strictEqual(fotosEquipos.textoDePosicion(1, 3, 'ROJO'), 'me quedó el del medio, el rojo');
  });

  await check('el índice: la foto por modelo y color (sin mayúsculas ni tildes), sola antes que de varios; sin color o sin foto, nada; la ruta sale solo del índice', () => {
    assert.deepStrictEqual(fotosEquipos.fotoPara('iPhone 15', 'GRAPHITO'), { archivo: 'iPhone 15/grafito.jpg', posicion: 0, total: 1 });
    assert.deepStrictEqual(fotosEquipos.fotoPara('iphone 15', 'Grafito'), { archivo: 'iPhone 15/grafito.jpg', posicion: 0, total: 1 });
    assert.deepStrictEqual(fotosEquipos.fotoPara('iPhone 13', 'Azul'), { archivo: 'iPhone 13/rosa-azul.jpg', posicion: 1, total: 2 });
    assert.strictEqual(fotosEquipos.fotoPara('iPhone 13', 'Negro'), null, 'no hay foto del 13 negro');
    assert.strictEqual(fotosEquipos.fotoPara('iPhone 14', ''), null, 'sin color, nada');
    assert.strictEqual(fotosEquipos.fotoPara('iPhone 13 Pro', 'Azul'), null, 'el 13 Pro no es el 13');
    // Una foto del azul solo le gana a la de dos; con más de 3 celulares no se usa.
    indice([...INDICE_DE_HOY, { archivo: 'iPhone 13/azul.jpg', modelo: 'iPhone 13', colores: [['azul']] }, { archivo: 'iPhone 13/cuatro.jpg', modelo: 'iPhone 13', colores: [['rosa'], ['azul'], ['verde'], ['negro']] }]);
    assert.deepStrictEqual(fotosEquipos.fotoPara('iPhone 13', 'azul'), { archivo: 'iPhone 13/azul.jpg', posicion: 0, total: 1 });
    assert.strictEqual(fotosEquipos.fotoPara('iPhone 13', 'negro'), null, 'una foto de 4 celulares no se usa');
    // El mismo color en dos celulares de la foto: no se sabe cuál es, esa foto no se usa.
    indice([...INDICE_DE_HOY, { archivo: 'iPhone 13/tres.jpg', modelo: 'iPhone 13', colores: [['negro'], ['negro'], ['rojo']] }]);
    assert.strictEqual(fotosEquipos.fotoPara('iPhone 13', 'negro'), null, 'el mismo color dos veces en la foto');
    assert.deepStrictEqual(fotosEquipos.fotoPara('iPhone 13', 'rojo'), { archivo: 'iPhone 13/rojo.jpg', posicion: 0, total: 1 });
    indice(INDICE_DE_HOY);
    // La ruta: adentro de la carpeta de fotos, solo si está en el índice y existe.
    assert.strictEqual(fotosEquipos.rutaDe('iPhone 15/grafito.jpg'), path.join(FOTOS, 'iPhone 15', 'grafito.jpg'));
    assert.strictEqual(fotosEquipos.rutaDe('iPhone 13/tres.jpg'), null, 'existe pero no está en el índice');
    assert.strictEqual(fotosEquipos.rutaDe('../estado.json'), null);
    indice([...INDICE_DE_HOY, { archivo: '../estado.json', modelo: 'iPhone 15', colores: [['negro']] }, { archivo: 'iPhone 15/no-existe.jpg', modelo: 'iPhone 15', colores: [['rojo']] }]);
    assert.strictEqual(fotosEquipos.rutaDe('../estado.json'), null, 'una entrada que sale de la carpeta no vale');
    assert.strictEqual(fotosEquipos.fotoPara('iPhone 15', 'negro'), null);
    assert.strictEqual(fotosEquipos.fotoPara('iPhone 15', 'rojo'), null, 'el archivo no existe');
  });

  // ------------------------------------------------------------ 1. foto sola
  await check('1. "me mostrás el 15?" → una imagen con el pie "15 128gb 87% 740.000", sin escalar, y "[foto] …" en el historial que lee Sonnet después', async () => {
    const chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['15'] })], responde(['[fotos]']));
    await habla(chat, 'me mostrás el 15?');
    const res = resultadoDe('mandar_fotos');
    assert.deepStrictEqual(res.fotos.map((f) => [f.modelo, f.capacidad_gb, f.color, f.precio_contado, f.pie, f.en_la_foto]), [['iPhone 15', 128, 'graphito', 740000, '15 128gb 87% 740.000', 'sola']]);
    assert.ok(!res.deposito && !res.sin_foto && !res.no_hay, JSON.stringify(res));
    assert.ok(nombresDeHerramientas().includes('mandar_fotos'), 'en vivo Sonnet tiene mandar_fotos');
    assert.match(pedidos[0].body.system[0].text, /# Fotos de los equipos/);
    const fotos = imagenesA(chat);
    assert.strictEqual(fotos.length, 1, JSON.stringify(aEste(chat)));
    assert.strictEqual(fotos[0].texto, '15 128gb 87% 740.000');
    assert.strictEqual(relativa(fotos[0].ruta), 'iPhone 15/grafito.jpg');
    assert.ok(fs.existsSync(fotos[0].ruta));
    // El saludo del día va aparte, antes de la foto: dos mensajes.
    assert.deepStrictEqual(aEste(chat).map((m) => m.tipo), ['texto', 'imagen']);
    const s = delChat(chat);
    assert.ok(!s.escalado, 'escaló');
    assert.ok(s.historial.some((l) => l.quien === 'vendedor' && l.texto === '[foto] 15 128gb 87% 740.000' && l.id), 'la foto no quedó en el historial con su pie');
    assert.strictEqual(s.modelo, 'iPhone 15');
    assert.deepStrictEqual(s.preciosMostradosDe, ['iPhone 15'], 'el precio del pie cuenta como mostrado');
    assert.ok(s.ultimoPrecioBot, 'el pie con el precio no cuenta para el seguimiento (ultimoPrecioBot)');
    assert.strictEqual(alGrupo.filter((t) => /🔕|🔔/.test(t)).length, 0, 'avisó un escalado: ' + alGrupo.join(' | '));
    // La vuelta siguiente: Sonnet ve "Vos (antes): [foto] 15 128gb 87% 740.000".
    guion(responde(['sii, ese es']));
    await habla(chat, 'ese es el que tenes?');
    assert.match(textoDelPedido(0), /Vos \(antes\): \[foto\] 15 128gb 87% 740\.000/);
  });

  // ------------------------------------------------------------ 2. foto de dos celulares
  await check('2. una sola foto del 13 con dos celulares: para el azul "me quedó el de la derecha, el azul"; una foto del azul solo le gana', async () => {
    planilla([UNIDADES.azul, UNIDADES.quince]);
    const chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['[fotos]']));
    let { r } = await silencio(() => pensar(chat, 'fotos del 13'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.fotos.map((f) => [f.archivo, f.pie, f.codigo]), [['iPhone 13/rosa-azul.jpg', '13 128gb 100% 535.000\nme quedó el de la derecha, el azul', '13-128-029']]);
    assert.strictEqual(resultadoDe('mandar_fotos').fotos[0].en_la_foto, 'el de la derecha');
    assert.deepStrictEqual(r.mensajes, ['[foto: 13-128-029] 13 128gb 100% 535.000\nme quedó el de la derecha, el azul']);
    assert.ok(acciones.esFotoEquipo(r.piezas[0]));
    // Con una foto del azul solo en el índice (cambió el archivo): esa, y sin la segunda línea.
    indice([...INDICE_DE_HOY, { archivo: 'iPhone 13/azul.jpg', modelo: 'iPhone 13', colores: [['azul']] }]);
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['[fotos]']));
    ({ r } = await silencio(() => pensar(chat, 'fotos del 13')));
    assert.deepStrictEqual(r.fotos.map((f) => [f.archivo, f.pie]), [['iPhone 13/azul.jpg', '13 128gb 100% 535.000']]);
  });

  // ------------------------------------------------------------ 3. cinco unidades
  await check('3. "fotos del 13" con 5 unidades → 3 fotos: la que se cotizó antes primera, después las más baratas; los dos verdes con la misma foto, una vez', async () => {
    // Sin nada cotizado: por precio (los 77 % a $480.000 primero), los dos verdes una sola vez, y después el rosa.
    let chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['[fotos]']));
    await habla(chat, 'fotos del 13');
    let fotos = imagenesA(chat);
    assert.deepStrictEqual(
      fotos.map((m) => [relativa(m.ruta), m.texto]),
      [
        ['iPhone 13/rojo.jpg', '13 128gb 77% 480.000'],
        ['iPhone 13/verde.jpg', '13 128gb 77% 480.000'],
        ['iPhone 13/rosa-azul.jpg', '13 128gb 100% 535.000\nme quedó el de la izquierda, el rosa'],
      ]
    );
    assert.strictEqual(aEste(chat).length, 4, 'saludo + 3 fotos');
    // Con el 13 cotizado antes (cotizar agarra la rosa: la más barata que se financia), esa va primera.
    chat = nuevoChat();
    guion([usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'el 13 con 400 mil?' })], responde(['dale, con $400.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?']));
    await habla(chat, 'el 13 con 400 mil?');
    assert.strictEqual(delChat(chat).unidadCotizada, '13-128-028', 'no quedó la unidad cotizada en el estado');
    limpiar();
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['[fotos]']));
    await habla(chat, 'me pasas fotos?');
    fotos = imagenesA(chat);
    assert.deepStrictEqual(
      fotos.map((m) => [relativa(m.ruta), m.texto]),
      [
        ['iPhone 13/rosa-azul.jpg', '13 128gb 100% 535.000\nme quedó el de la izquierda, el rosa'],
        ['iPhone 13/rojo.jpg', '13 128gb 77% 480.000'],
        ['iPhone 13/verde.jpg', '13 128gb 77% 480.000'],
      ]
    );
    assert.strictEqual(aEste(chat).length, 3, 'hoy ya se saludó: 3 fotos y nada más');
    const res = resultadoDe('mandar_fotos');
    assert.strictEqual(res.fotos.length, 3);
    assert.deepStrictEqual(res.fotos.map((f) => f.color), ['rosa', 'rojo', 'verde']);
    assert.ok(!delChat(chat).escalado);
  });

  await check('3b. entre varios modelos: el de la unidad cotizada va adelante aunque lo pidió segundo; sin cotizada, el modelo del chat (el del estado)', async () => {
    const porModelo = [
      { modelo: 'iPhone 15', unidades: [UNIDADES.quince] },
      { modelo: 'iPhone 13', unidades: [UNIDADES.rojo, UNIDADES.verde1, UNIDADES.verde2, UNIDADES.rosa, UNIDADES.azul] },
    ];
    const codigos = (opciones) => fotosEquipos.elegirFotos(porModelo, opciones).fotos.map((f) => f.codigo);
    // En el orden en que los pidió: una de cada modelo por vuelta.
    assert.deepStrictEqual(codigos({}), ['15-128-001', '13-128-013', '13-128-025']);
    // La cotizada (la rosa) primera, y su modelo adelante del 15.
    assert.deepStrictEqual(codigos({ primero: '13-128-028' }), ['13-128-028', '15-128-001', '13-128-013']);
    // Sin cotizada: el modelo del chat adelante.
    assert.deepStrictEqual(codigos({ modeloPrimero: 'iPhone 13' }), ['13-128-013', '15-128-001', '13-128-025']);
    // La cotizada le gana al modelo del chat; una cotizada que no está entre lo pedido no cuenta.
    assert.deepStrictEqual(codigos({ primero: '15-128-001', modeloPrimero: 'iPhone 13' }), ['15-128-001', '13-128-013', '13-128-025']);
    assert.deepStrictEqual(codigos({ primero: '14-128-008', modeloPrimero: 'iPhone 13' }), ['13-128-013', '15-128-001', '13-128-025']);
    // Por cerebro.pensar, con lo que hay en el estado del chat.
    let chat = nuevoChat();
    state.actualizar(chat, { modelo: 'iPhone 13' });
    guion([usar('mandar_fotos', { modelos: ['15', '13'] })], responde(['[fotos]']));
    let { r } = await silencio(() => pensar(chat, 'fotos del 15 y del 13'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.fotos.map((f) => f.codigo), ['13-128-013', '15-128-001', '13-128-025']);
    chat = nuevoChat();
    state.actualizar(chat, { modelo: 'iPhone 15', unidadCotizada: '13-128-028' });
    guion([usar('mandar_fotos', { modelos: ['15', '13'] })], responde(['[fotos]']));
    ({ r } = await silencio(() => pensar(chat, 'fotos del 15 y del 13')));
    assert.deepStrictEqual(r.fotos.map((f) => f.codigo), ['13-128-028', '15-128-001', '13-128-013']);
  });

  // ------------------------------------------------------------ 4. el depósito
  await check('4. "fotos del 16 pro" (solo en el depósito): sin foto, la frase con "mañana" un jueves y "el lunes" un viernes, el aviso al grupo, sin escalar', async () => {
    const chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['16 pro'] })], responde(['[fotos_deposito]']));
    let { r } = await silencio(() => pensar(chat, 'fotos del 16 pro', JUEVES));
    assert.strictEqual(r.escalar, false, r.motivo);
    const res = resultadoDe('mandar_fotos');
    assert.deepStrictEqual(res.fotos, []);
    assert.deepStrictEqual(res.deposito, ['iPhone 16 Pro']);
    assert.strictEqual(res.frase_deposito, 'mira, ahora en el local no tengo este modelito, si me esperás un rato le pido fotos a los chicos del depósito, si no te las mando mañana');
    assert.deepStrictEqual(r.mensajes, [res.frase_deposito]);
    assert.strictEqual(r.avisoGrupo, 'le prometí fotos del iPhone 16 Pro (depósito): mandáselas');
    assert.deepStrictEqual(r.fotos, []);
    // Un viernes, "el lunes"; y adentro de un mensaje también.
    guion([usar('mandar_fotos', { modelos: ['16 pro'] })], responde(['dale! [fotos_deposito]']));
    ({ r } = await silencio(() => pensar(chat, 'fotos del 16 pro', VIERNES)));
    assert.deepStrictEqual(r.mensajes, ['dale! mira, ahora en el local no tengo este modelito, si me esperás un rato le pido fotos a los chicos del depósito, si no te las mando el lunes']);
    // Si pidió más de un modelo, la frase nombra el que está en el depósito; las del local van igual.
    guion([usar('mandar_fotos', { modelos: ['15', '16 pro'] })], responde(['[fotos]', '[fotos_deposito]']));
    ({ r } = await silencio(() => pensar(chat, 'fotos del 15 y del 16 pro', JUEVES)));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.deepStrictEqual(r.mensajes, ['[foto: 15-128-001] 15 128gb 87% 740.000', 'mira, ahora en el local no tengo el 16 pro, si me esperás un rato le pido fotos a los chicos del depósito, si no te las mando mañana']);
    // Por index.js: le llega la frase, el 📌 al grupo, y el chat sigue sin escalar.
    const otro = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['16 pro'] })], responde(['[fotos_deposito]']));
    await habla(otro, 'tenes fotos del 16 pro?');
    assert.deepStrictEqual(aEste(otro).map((m) => m.tipo), ['texto', 'texto']);
    assert.match(aEste(otro)[1].texto, /^mira, ahora en el local no tengo este modelito, si me esperás un rato le pido fotos a los chicos del depósito, si no te las mando (mañana|el lunes)$/);
    assert.ok(alGrupo.some((t) => /📌 .*le prometí fotos del iPhone 16 Pro \(depósito\): mandáselas/.test(t)), alGrupo.join(' | '));
    assert.ok(!delChat(otro).escalado, 'escaló por el depósito');
    assert.strictEqual(alGrupo.filter((t) => /🔕|🔔/.test(t)).length, 0);
  });

  // ------------------------------------------------------------ 5. foto + escala
  await check('5. "fotos del 13 y del 14": las del 13 y después escala por el 14 (sin color cargado), con el 🔔 y el código 14-128-008; si ninguno tiene foto, escala como hoy', async () => {
    let chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['13', '14'] })], responde(['[fotos]']));
    await habla(chat, 'fotos del 13 y del 14');
    const res = resultadoDe('mandar_fotos');
    assert.deepStrictEqual(res.sin_foto, [{ modelo: 'iPhone 14', codigo: '14-128-008', motivo: 'sin color cargado' }]);
    assert.strictEqual(res.fotos.length, 3);
    assert.strictEqual(imagenesA(chat).length, 3, JSON.stringify(aEste(chat)));
    assert.ok(imagenesA(chat).every((m) => /^13 /.test(m.texto)));
    const s = delChat(chat);
    assert.strictEqual(s.escalado, true, 'no escaló por el 14');
    const aviso = alGrupo.find((t) => /pidió fotos del iPhone 14 y no tiene color cargado/.test(t));
    assert.ok(aviso, 'sin el aviso del escalado: ' + alGrupo.join(' | '));
    assert.match(aviso, /Equipo: 14-128-008/);
    // Escalado: lo que escriba después no se contesta.
    limpiar();
    guion(responde(['no tendria que salir']));
    await habla(chat, 'y el 14 cuanto sale?');
    assert.deepStrictEqual(aEste(chat), []);
    // Sin foto de ninguno (solo el 14, sin color): el resultado lo dice, Sonnet escala y el 🔕 lleva el código.
    chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['14'] })], escala('pide fotos del 14 y no tiene color cargado'));
    await habla(chat, 'me mostras el 14?');
    const sinNada = resultadoDe('mandar_fotos');
    assert.deepStrictEqual(sinNada.fotos, []);
    assert.match(sinNada.nota_sin_foto || sinNada.nota || '', /escalar/);
    assert.deepStrictEqual(aEste(chat), []);
    assert.strictEqual(delChat(chat).escalado, true);
    assert.ok(alGrupo.some((t) => /🔕 SIN RESPUESTA/.test(t) && /Equipo: 14-128-008/.test(t)), alGrupo.join(' | '));
    // Y si Sonnet igual quisiera contestar algo sin fotos, el código escala callado.
    chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['14'] })], responde(['justo del 14 no tengo foto']));
    await habla(chat, 'me mostras el 14?');
    assert.deepStrictEqual(aEste(chat), [], 'le contestó sin fotos');
    assert.strictEqual(delChat(chat).escalado, true);
    // La unidad sin foto de ese color: el motivo lo dice.
    planilla([unidad('13-128-030', 'iPhone 13', 128, 'Negro', 100, 535000, 370000)]);
    chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['13'] })], escala('pide fotos y no hay del 13 negro'));
    await habla(chat, 'fotos del 13');
    assert.deepStrictEqual(resultadoDe('mandar_fotos').sin_foto, [{ modelo: 'iPhone 13', codigo: '13-128-030', motivo: 'no hay foto del iPhone 13 negro' }]);
    // Un modelo que no está ni en el local ni en el depósito: `no_hay`, como en *Modelos*.
    guion([usar('mandar_fotos', { modelos: ['18'] })], escala('no hay 18'));
    await habla(nuevoChat(), 'fotos del 18');
    assert.deepStrictEqual(resultadoDe('mandar_fotos').no_hay, ['18']);
    // Más de 6 modelos: los que sobran quedan en `sin_mirar`, no desaparecen.
    planilla();
    guion([usar('mandar_fotos', { modelos: ['13', '14', '15', '16 pro', '17', '11', '12'] })], responde(['[fotos]']));
    await habla(nuevoChat(), 'fotos de todo lo que tengas');
    const muchos = resultadoDe('mandar_fotos');
    assert.deepStrictEqual(muchos.sin_mirar, ['12']);
    assert.strictEqual(muchos.fotos.length, 3, JSON.stringify(muchos.fotos));
  });

  // ------------------------------------------------------------ 5b. unidades sin foto de un modelo que sí tiene
  await check('5b. (12/10) "fotos del 13" con una unidad sin foto: van las que hay + "mirá, no sé si me queda en este colorcito…", el 📌 con el código, sin escalar', async () => {
    planilla([UNIDADES.azul, unidad('13-128-030', 'iPhone 13', 128, 'Negro', 100, 535000, 370000)]);
    let chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['[fotos]']));
    const { r } = await silencio(() => pensar(chat, 'fotos del 13'));
    assert.strictEqual(r.escalar, false, r.motivo);
    assert.strictEqual(r.escalarDespues, undefined);
    assert.deepStrictEqual(r.mensajes, ['[foto: 13-128-029] 13 128gb 100% 535.000\nme quedó el de la derecha, el azul', fotosEquipos.FRASE_SIN_FOTO]);
    assert.strictEqual(fotosEquipos.FRASE_SIN_FOTO, 'mirá, no sé si me queda en este colorcito porque no estoy en el depósito, cuando llegue te confirmo bien');
    assert.strictEqual(r.avisoGrupo, 'sin foto: 13-128-030 (no hay foto del iPhone 13 negro), le mandé las otras');
    assert.match(resultadoDe('mandar_fotos').nota_sin_foto || '', /el sistema/);
    // Por index.js: llegan la foto y la frase, el 📌 al grupo, y el chat no escala.
    chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['[fotos]']));
    await habla(chat, 'fotos del 13');
    assert.strictEqual(imagenesA(chat).length, 1);
    assert.strictEqual(aEste(chat)[aEste(chat).length - 1].texto, fotosEquipos.FRASE_SIN_FOTO);
    assert.ok(!delChat(chat).escalado, 'escaló');
    assert.ok(alGrupo.some((t) => /📌 .*sin foto: 13-128-030/.test(t)), alGrupo.join(' | '));
    planilla();
  });

  // ------------------------------------------------------------ 6. el tope de 4
  await check('6. saludo + texto de Sonnet + 3 fotos → nunca más de 4 mensajes: van 2 fotos (las primeras del orden), nunca se corta un texto', async () => {
    let chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['dale, te paso las que tengo', '[fotos]']));
    await habla(chat, 'fotos del 13');
    assert.deepStrictEqual(aEste(chat).map((m) => m.tipo), ['texto', 'texto', 'imagen', 'imagen'], JSON.stringify(aEste(chat).map((m) => [m.tipo, m.texto])));
    assert.deepStrictEqual(imagenesA(chat).map((m) => relativa(m.ruta)), ['iPhone 13/rojo.jpg', 'iPhone 13/verde.jpg']);
    assert.strictEqual(aEste(chat)[1].texto, 'dale, te paso las que tengo');
    // El registro anota las fotos que van de verdad (las 2 que entraron), no las 3 que eligió la herramienta.
    const propuesta = eventos().filter((e) => e.tipo === 'propuesta' && e.sonnet && e.sonnet.fotos).pop();
    assert.ok(propuesta, 'la propuesta no anotó las fotos');
    assert.deepStrictEqual(propuesta.sonnet.fotos, ['13-128-013: 13 128gb 77% 480.000', '13-128-025: 13 128gb 77% 480.000']);
    // Sin saludo (hoy ya se habló): texto + 3 fotos.
    limpiar();
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['estas son', '[fotos]']));
    await habla(chat, 'y mas fotos?');
    assert.deepStrictEqual(aEste(chat).map((m) => m.tipo), ['texto', 'imagen', 'imagen', 'imagen']);
    // Dos textos: con el saludo, una sola foto; y sin [fotos], las fotos van después de los textos.
    chat = nuevoChat();
    // ("dale" solo es una muletilla que limpiarRedactado saca: el texto tiene que decir algo.)
    guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['mira, tengo estos tres del 13', 'te paso las que tengo del 13']));
    await habla(chat, 'fotos del 13');
    assert.deepStrictEqual(aEste(chat).map((m) => m.tipo), ['texto', 'texto', 'texto', 'imagen'], JSON.stringify(aEste(chat).map((m) => [m.tipo, m.texto])));
    assert.strictEqual(relativa(aEste(chat)[3].ruta), 'iPhone 13/rojo.jpg');
    // "te paso las que tengo" con la herramienta no es una promesa que frena: las fotos van en esta respuesta.
    assert.ok(!delChat(chat).escalado);
  });

  // ------------------------------------------------------------ 7. el índice
  await check('7. sin índice o con el índice roto: sin fotos, escala como hoy y un aviso en consola una sola vez; cuando cambia, se relee sin reiniciar', async () => {
    indice(null);
    let chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['15'] })], escala('pide fotos y no hay foto del 15'));
    let { avisos } = await silencio(() => habla(chat, 'me mostras el 15?'));
    let res = resultadoDe('mandar_fotos');
    assert.deepStrictEqual(res.fotos, []);
    assert.deepStrictEqual(res.sin_foto, [{ modelo: 'iPhone 15', codigo: '15-128-001', motivo: 'no hay foto del iPhone 15 graphito' }]);
    assert.strictEqual(delChat(chat).escalado, true);
    assert.strictEqual(avisos.filter((a) => /indice\.json/.test(a)).length, 1, avisos.join(' | '));
    // La segunda vez no vuelve a avisar.
    guion([usar('mandar_fotos', { modelos: ['15'] })], escala('pide fotos y no hay foto del 15'));
    ({ avisos } = await silencio(() => habla(nuevoChat(), 'me mostras el 15?')));
    assert.strictEqual(avisos.filter((a) => /indice\.json/.test(a)).length, 0, avisos.join(' | '));
    // Roto: lo mismo, con otro aviso (uno).
    indice('{ esto no es json');
    guion([usar('mandar_fotos', { modelos: ['15'] })], escala('pide fotos'));
    ({ avisos } = await silencio(() => habla(nuevoChat(), 'me mostras el 15?')));
    assert.deepStrictEqual(resultadoDe('mandar_fotos').fotos, []);
    assert.strictEqual(avisos.filter((a) => /indice\.json/.test(a)).length, 1, avisos.join(' | '));
    // Vuelve el índice bueno: se relee sin reiniciar nada.
    indice(INDICE_DE_HOY);
    chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['15'] })], responde(['[fotos]']));
    await habla(chat, 'me mostras el 15?');
    assert.strictEqual(imagenesA(chat).length, 1);
    // Y una entrada que cambia de archivo también.
    indice([{ archivo: 'iPhone 13/azul.jpg', modelo: 'iPhone 15', colores: [['graphito']] }]);
    chat = nuevoChat();
    guion([usar('mandar_fotos', { modelos: ['15'] })], responde(['[fotos]']));
    await habla(chat, 'me mostras el 15?');
    assert.strictEqual(relativa(imagenesA(chat)[0].ruta), 'iPhone 13/azul.jpg');
  });

  // ------------------------------------------------------------ 8. apagado y sombra
  await check('8. con el stock apagado o en sombra, idéntico a hoy: sin la herramienta ni la sección, pide fotos → escala y no sale nada', async () => {
    for (const modo of ['apagado', 'sombra']) {
      config.stockApp.modo = modo;
      sheets.invalidarCache();
      const chat = nuevoChat();
      guion(escala('pide fotos o videos'));
      await habla(chat, 'me mostras el 15?');
      assert.deepStrictEqual(nombresDeHerramientas(), ['buscar_equipos', 'cotizar', 'escalar', 'lista_de_precios', 'que_me_alcanza', 'responder'], modo);
      assert.ok(!/# Fotos de los equipos/.test(pedidos[0].body.system[0].text), `${modo}: la sección de las fotos fue en las reglas`);
      assert.strictEqual(pedidos[0].body.system[0].text, cerebro.REGLAS, modo);
      assert.deepStrictEqual(aEste(chat), [], modo);
      assert.strictEqual(delChat(chat).escalado, true, modo);
      assert.ok(alGrupo.some((t) => /🔕 SIN RESPUESTA/.test(t) && /pide fotos/.test(t)), modo);
      // Y si Sonnet igual llamara a la herramienta, no existe.
      guion([usar('mandar_fotos', { modelos: ['15'] })], escala('no existe'));
      await silencio(() => habla(nuevoChat(), 'me mostras el 15?'));
      assert.match(resultadoDe('mandar_fotos').error || '', /No existe la herramienta mandar_fotos/);
      limpiar();
    }
    config.stockApp.modo = 'vivo';
    sheets.invalidarCache();
    guion([usar('mandar_fotos', { modelos: ['15'] })], responde(['[fotos]']));
    const chat = nuevoChat();
    await habla(chat, 'me mostras el 15?');
    assert.ok(nombresDeHerramientas().includes('mandar_fotos'));
    assert.strictEqual(imagenesA(chat).length, 1);
    // Las reglas efectivas en vivo llevan la sección y su hash es otro.
    assert.match(cerebro.reglasEfectivas(), /# Fotos de los equipos/);
    assert.notStrictEqual(cerebro.hashDeReglas(cerebro.reglasEfectivas()), cerebro.hashDeReglas(cerebro.REGLAS));
  });

  // ------------------------------------------------------------ 9. la guardia
  await check('9. la guardia: "te mando fotos" sin la herramienta frena; [fotos] o [fotos_deposito] sin la herramienta frenan; la frase del depósito puesta por el código no', () => {
    const guardia = (mensajes, opciones) => cerebro.revisarSalida(mensajes, [], opciones).guardia || '';
    assert.match(guardia(['te mando fotos del 15']), /promete un archivo que no va: "te mando fotos"/);
    assert.match(guardia(['ahi te paso las fotos']), /promete un archivo/);
    assert.match(guardia(['[fotos]']), /\[fotos\] sin fotos que mandar/);
    assert.match(guardia(['[fotos_deposito]']), /\[fotos_deposito\] sin que mandar_fotos devolviera un modelo del depósito/);
    assert.match(guardia(["te las mando mañana"]), /promete mandar algo después: "te las mando manana"/);
    assert.match(guardia(["dale, te lo paso el lunes a la tarde"]), /promete mandar algo después/);
    assert.match(guardia(['te las mando por acá mañana']), /promete mandar algo después/);
    // Sin cruzar una coma, y con dos palabras de tolerancia: esto no es una promesa.
    assert.strictEqual(guardia(['te lo paso ahora, mañana abrimos a las 10']), '');
    assert.strictEqual(guardia(['te lo paso por acá y mañana coordinamos']), '');
    assert.strictEqual(guardia(["te las paso ahora mismo", "te lo paso por acá"]), "");
    // Con fotos elegidas por la herramienta, "te paso las fotos" vale y [fotos] se cambia por las fotos.
    const una = { archivo: 'iPhone 15/grafito.jpg', pie: '15 128gb 87% 740.000', codigo: '15-128-001' };
    const r = cerebro.revisarSalida(['dale, te paso las fotos', '[fotos]'], [740000], { fotos: [una] });
    assert.strictEqual(r.guardia, null, r.guardia);
    assert.deepStrictEqual(r.mensajes, ['dale, te paso las fotos', '[foto: 15-128-001] 15 128gb 87% 740.000']);
    assert.deepStrictEqual(r.piezas[1], { tipo: 'foto-equipo', archivo: una.archivo, pie: una.pie, codigo: una.codigo });
    // La frase del depósito la pone el código después de la guardia: ni prometeArchivo ni "del depósito" la frenan.
    const frase = fotosEquipos.fraseFotosDeposito(['iPhone 16 Pro'], { ahora: JUEVES });
    assert.match(frase, /le pido fotos a los chicos del depósito, si no te las mando mañana$/);
    const d = cerebro.revisarSalida(['[fotos_deposito]'], [], { fotosDeposito: frase, stockVivo: true });
    assert.strictEqual(d.guardia, null, d.guardia);
    assert.deepStrictEqual(d.mensajes, [frase]);
    assert.strictEqual(d.conFotosDeposito, true);
    // Los 300 caracteres se miden con la frase puesta.
    assert.match(guardia(['[fotos_deposito] ' + 'x'.repeat(200)], { fotosDeposito: frase, stockVivo: true }), /caracteres/);
    // Lo interno: el nombre de la herramienta no sale.
    assert.match(guardia(['uso mandar_fotos y te las paso']), /nombra algo interno: "mandar_fotos"/);
  });

  // ------------------------------------------------------------ 10. el camino real de enviarImagen
  await check('10. el camino real de evolution.enviarImagen: la foto de la subcarpeta sale en base64 con su pie; una fuera de la carpeta no', async () => {
    evolution.enviarImagen = enviarImagenReal;
    try {
      const chat = nuevoChat();
      const r = await evolution.enviarImagen(chat, path.join(FOTOS, 'iPhone 15', 'grafito.jpg'), '15 128gb 87% 740.000', 0);
      assert.ok(r && r.key && r.key.id, JSON.stringify(r));
      assert.strictEqual(aEvolution.length, 1);
      assert.strictEqual(aEvolution[0].ruta, '/message/sendMedia/prueba');
      assert.deepStrictEqual(
        [aEvolution[0].body.number, aEvolution[0].body.mediatype, aEvolution[0].body.mimetype, aEvolution[0].body.caption, aEvolution[0].body.fileName, aEvolution[0].body.media],
        [chat, 'image', 'image/jpeg', '15 128gb 87% 740.000', 'grafito.jpg', PNG.toString('base64')]
      );
      const afuera = await silencio(() => evolution.enviarImagen(chat, path.join(TMP, 'estado.json'), 'x', 0));
      assert.deepStrictEqual(afuera.r, { bloqueado: true, motivo: 'archivo fuera del catálogo' });
      assert.strictEqual(aEvolution.length, 1);
      // Por index.js, de punta a punta: la foto le llega con el pie por sendMedia.
      guion([usar('mandar_fotos', { modelos: ['15'] })], responde(['[fotos]']));
      const otro = nuevoChat();
      await habla(otro, 'me mostras el 15?');
      const media = aEvolution.filter((e) => e.ruta.startsWith('/message/sendMedia/'));
      assert.strictEqual(media.length, 2);
      assert.strictEqual(media[1].body.caption, '15 128gb 87% 740.000');
      assert.ok(delChat(otro).historial.some((l) => l.quien === 'vendedor' && l.texto === '[foto] 15 128gb 87% 740.000' && l.id === 'EVREAL' + aEvolution.length));
    } finally {
      evolution.enviarImagen = async (numero, ruta, caption) => {
        aClientes.push({ numero, tipo: 'imagen', texto: caption, ruta });
        return respuestaEvolution(numero);
      };
    }
  });

  // ------------------------------------------------------------ 11. una foto que no sale
  await check('11. una foto que no se puede mandar (Evolution falla, o ya no está): el 📷 al grupo con el código y el pie, lo demás sale y el chat no escala', async () => {
    const chat = nuevoChat();
    const bien = evolution.enviarImagen;
    let fallas = 0;
    evolution.enviarImagen = async (numero, ruta, caption) => {
      if (fallas++ === 0) throw new Error('Evolution 500 de mentira');
      return bien(numero, ruta, caption);
    };
    try {
      guion([usar('mandar_fotos', { modelos: ['13'] })], responde(['[fotos]']));
      await silencio(() => habla(chat, 'fotos del 13'));
    } finally {
      evolution.enviarImagen = bien;
    }
    assert.deepStrictEqual(aEste(chat).map((m) => m.tipo), ['texto', 'imagen', 'imagen'], 'las otras dos fotos tenían que salir');
    const aviso = alGrupo.find((t) => /📷 NO SALIÓ LA FOTO/.test(t));
    assert.ok(aviso, 'sin el aviso al grupo: ' + alGrupo.join(' | '));
    assert.match(aviso, /13-128-013 \(13 128gb 77% 480\.000\)/);
    assert.match(aviso, /Evolution 500 de mentira/);
    assert.match(aviso, new RegExp('wa\\.me/' + numero(chat)));
    assert.ok(!delChat(chat).escalado, 'escaló por la foto que no salió');
    // Y la foto que no salió no quedó como dicha: en el historial está sin confirmar.
    const linea = delChat(chat).historial.find((l) => l.quien === 'vendedor' && /77% 480\.000/.test(l.texto) && l.sinConfirmar);
    assert.ok(!linea, 'una foto que tiró no tenía que entrar al historial');
    // Una foto que se borró del índice entre la elección y el envío: lo mismo, con el motivo.
    const otro = nuevoChat();
    const rutaDe = fotosEquipos.rutaDe;
    fotosEquipos.rutaDe = () => null;
    try {
      guion([usar('mandar_fotos', { modelos: ['15'] })], responde(['[fotos]']));
      await silencio(() => habla(otro, 'me mostras el 15?'));
    } finally {
      fotosEquipos.rutaDe = rutaDe;
    }
    assert.deepStrictEqual(imagenesA(otro), []);
    assert.ok(alGrupo.some((t) => /📷 NO SALIÓ LA FOTO/.test(t) && /no está en el índice/.test(t)), alGrupo.join(' | '));
  });

  // ------------------------------------------------------------ 12. la sombra con persona
  await check('12. en la sombra con persona (atiende una persona): Sonnet puede elegir las fotos, pero al cliente y al grupo no les llega nada', async () => {
    const sombraPersona = require('../src/sombra-persona');
    const corto = (chat) => '...' + numero(chat).slice(-4);
    config.cerebro.sombraPersonaHasta = '2099-12-31';
    try {
      const chat = nuevoChat();
      state.actualizar(chat, { ultimoHumano: Date.now(), historial: [{ quien: 'vendedor', texto: 'LINEA DE FRAN', ts: Date.now(), humano: true }] });
      guion([usar('mandar_fotos', { modelos: ['15'] })], responde(['[fotos]']));
      const deLaSombra = () => eventos().find((e) => e.tipo === 'propuesta-sonnet' && e.chat === corto(chat) && e.conPersona);
      await silencio(async () => {
        await habla(chat, 'me mostras el 15?');
        for (let t = 0; t < 3000 && !deLaSombra(); t += 10) await new Promise((r) => setTimeout(r, 10));
      });
      const sombra = deLaSombra();
      assert.ok(sombra, 'Sonnet no pensó en sombra');
      assert.deepStrictEqual(sombra.mensajes, ['[foto: 15-128-001] 15 128gb 87% 740.000']);
      await new Promise((r) => setTimeout(r, 20));
      assert.deepStrictEqual(aEste(chat), [], 'le llegó algo al cliente');
      assert.deepStrictEqual(alGrupo, [], 'le llegó algo al grupo');
      assert.ok(!delChat(chat).historial.some((l) => /^\[foto\]/.test(l.texto)), 'la foto quedó en el historial');
    } finally {
      config.cerebro.sombraPersonaHasta = '';
      sombraPersona.reiniciar();
    }
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  process.exit(fallos ? 1 : 0);
})();
