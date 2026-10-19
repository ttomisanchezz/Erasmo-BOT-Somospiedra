'use strict';
/**
 * Panel Chiara, lado bot (06/10/2026): src/panel-chiara.js, src/interruptor.js y la ficha de Sonnet.
 *
 *   node test/panel-chiara.test.js
 *
 * Sin red: la API de Anthropic, Evolution y Supabase son de mentira. El Supabase de mentira guarda las
 * filas como las tablas de la 0013 y revisa sus CHECK (las columnas, los valores permitidos y los largos):
 * si el bot manda algo que la base rechazaría, falla acá. Se prueba, a través de index.js (`procesar`):
 *   1. un chat nuevo: lead nuevo, los mensajes contados, la ficha de Sonnet y el gasto;
 *   2. lo que no salió de verdad no cuenta como mensaje de Chiara, y el cliente queda esperando;
 *   3. una persona contesta: cuenta y mide la espera; un "gracias" no deja esperando;
 *   4. el escalado: noticia, para cerrar hoy, sin tomar; lo toma una persona y sigue abierto, tomado;
 *   5. la cotización cuenta recién cuando sale, y "cotizado completo";
 *   6. las órdenes: pausar, devolver, vendido, un teléfono que no existe;
 *   7. el interruptor: apagada no contesta ni llama a Sonnet, sigue contando y queda en disco;
 *   8. el gasto del mes es el de cerebro.js (el de /salud), con un solo tope, incluye la sombra y
 *      sobrevive a un reinicio (08/10/2026: antes el panel llevaba su propia cuenta);
 *   9. el anuncio de origen; 10. el tester no se sube; 11. Supabase caído; 12. WhatsApp caído;
 *  13. la ficha va en las dos herramientas y en las reglas;
 *  14. "devolver" contesta como #sigue desde el grupo (08/10/2026): reactiva y le contesta lo que dejó escrito.
 *  15. lo que pasó hoy del stock (08/10/2026): "empezó a ofrecer" y "dejó de ofrecer" (de src/stock-app.js), y
 *      la base de hoy, que todavía no acepta esos tipos (falta la migración de la app), no frena las demás noticias.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'panel-chiara-'));
const GRUPO = '120363000000000099@g.us';
const TESTER = '5490000099999';

process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '6';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = TESTER;
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
process.env.AUDIO_ACTIVO = 'false';
process.env.ESPEJO_COTIZADOR_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.FOTOS_DIR = path.join(TMP, 'sin-fotos');
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
process.env.EVOLUTION_APIKEY = 'clave-de-mentira';
process.env.SUPABASE_URL = 'https://de-mentira.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_de_mentira';
process.env.CHIARA_PANEL_ACTIVO = 'true';
// Un solo tope (08/10/2026): sin CEREBRO_TOPE_MES_USD vale CHIARA_TOPE_MES_USD (la del panel, la de antes).
process.env.CEREBRO_TOPE_MES_USD = '';
process.env.CHIARA_TOPE_MES_USD = '45';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

// El registro de aprendizaje de antes: este mes US$1,25 de verdad y US$0,50 en sombra; el mes pasado no
// cuenta. Hasta el 08/10/2026 el panel sembraba con esto su propia cuenta del mes (US$1,75): ya no la
// lleva, sube la de cerebro.js (la de /salud), que en esta prueba arranca en US$10,14.
const AHORA_ISO = new Date().toISOString();
const MES_PASADO_ISO = new Date(Date.now() - 40 * 24 * 3600 * 1000).toISOString();
fs.writeFileSync(
  process.env.APRENDIZAJE_PATH,
  [
    { v: 2, ts: AHORA_ISO, tipo: 'propuesta', chat: '...0001', sonnet: { usd: 1.25 } },
    { v: 2, ts: AHORA_ISO, tipo: 'propuesta-sonnet', chat: '...0002', usd: 0.5, conPersona: 'persona' },
    { v: 2, ts: MES_PASADO_ISO, tipo: 'propuesta-sonnet', chat: '...0003', usd: 9 },
  ]
    .map((o) => JSON.stringify(o))
    .join('\n') + '\n'
);

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ la API de Anthropic de mentira
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const USD_POR_LLAMADA = (1000 * 2 + 100 * 10 + 2000 * 0.2 + 500 * 2.5) / 1e6; // 0,00465
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const FICHA_VACIA = { quiere_avanzar: false, cuando: '', cuando_es: 'no_dijo', forma_pago: 'no_dijo', zona: '', canje: '' };
const ficha = (f = {}) => ({ ...FICHA_VACIA, ...f });
const responde = (mensajes, f = {}) => [usar('responder', { mensajes, ficha: ficha(f) })];
const escala = (motivo, f = {}) => [usar('escalar', { motivo, ficha: ficha(f) })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
  pedidos.length = 0;
}

// ------------------------------------------------------------------ el Supabase de mentira (tablas de la 0013)
const tablas = { bot_estado: new Map(), bot_leads: new Map(), bot_dias: new Map(), bot_eventos: new Map(), bot_ordenes: new Map() };
const CLAVE = { bot_estado: 'id', bot_leads: 'telefono', bot_dias: 'dia', bot_eventos: 'clave' };
let supabaseCaido = false;
let rechazar = null; // un teléfono que bot_leads rechaza con un 400 (con datos del cliente en `details`)
let fallarPatch = false;
let sinMigracionDelStock = false; // la base de hoy: el CHECK de bot_eventos.tipo de la 0013, sin los tipos del stock
const TEL = /^[0-9]{8,15}$/;
const largo = (t) => Array.from(String(t)).length;
const ETAPAS = ['nuevo', 'consultando', 'cotizado', 'quiere_avanzar', 'escalado', 'vendido', 'perdido'];
const MOTIVOS = ['quiere_avanzar', 'dijo_cuando', 'cotizado_completo', 'escalado'];
const TIPOS_EVENTO = ['lead_nuevo', 'escalado', 'resuelto', 'pausado', 'devuelto', 'vendido', 'perdido', 'error', 'reinicio', 'whatsapp_caido', 'whatsapp_volvio', 'apagada', 'prendida'];
// Los de lo que pasó hoy del stock (08/10/2026): la app los tiene que sumar al CHECK (lo-que-paso-hoy-para-la-app.md).
const TIPOS_STOCK = ['empezo_a_ofrecer', 'dejo_de_ofrecer'];
const COLUMNAS = {
  bot_estado:
    'id actualizado_en prendida whatsapp contesta modo version arranco_en ultimo_entrante gasto_hoy_usd gasto_mes_usd tope_mes_usd sombra_hoy_usd sombra_tope_dia_usd sombra_hasta llamadas_hoy errores_hoy demora_llamada_ms salud',
  bot_leads:
    'telefono nombre modelo capacidad_gb entrega entrega_usd forma_pago zona cuando canje intencion cotizado_de entrega_cotizada etapa cerrar_hoy fue_cotizado quiso_avanzar fue_escalado escalado escalado_en escalado_motivo escalado_tomado_en pausado resultado resultado_en primer_contacto ultimo_cliente_en ultimo_chiara_en ultimo_humano_en espera_desde mensajes_cliente mensajes_chiara mensajes_humano ultimo_mensaje actualizado_en anuncio_id',
  bot_dias:
    'dia leads leads_nuevos mensajes_cliente mensajes_chiara mensajes_humano escalados gasto_usd sombra_usd llamadas errores demora_respuesta_s demora_llamada_ms actualizado_en',
  bot_eventos: 'clave en tipo telefono nombre detalle',
};
const noNeg = (v) => v === null || v === undefined || Number(v) >= 0;
/** Los CHECK de la 0013 (y que no vaya ninguna columna que no existe). */
function validar(tabla, f) {
  const cols = COLUMNAS[tabla].split(' ');
  for (const k of Object.keys(f)) assert.ok(cols.includes(k), `${tabla}: la columna ${k} no existe`);
  if (tabla === 'bot_estado') {
    assert.strictEqual(f.id, 1);
    assert.ok(f.actualizado_en);
    assert.strictEqual(typeof f.prendida, 'boolean');
    assert.ok(f.contesta === null || ['sonnet', 'gemini'].includes(f.contesta), 'contesta: ' + f.contesta);
    for (const k of ['gasto_hoy_usd', 'gasto_mes_usd', 'sombra_hoy_usd', 'llamadas_hoy', 'errores_hoy', 'demora_llamada_ms']) assert.ok(noNeg(f[k]), k);
    assert.ok(f.tope_mes_usd > 0);
    assert.ok(f.sombra_tope_dia_usd === null || f.sombra_tope_dia_usd > 0);
    assert.ok(f.salud && typeof f.salud === 'object');
  }
  if (tabla === 'bot_leads') {
    assert.ok(TEL.test(f.telefono), 'telefono ' + f.telefono);
    assert.ok(f.capacidad_gb === null || f.capacidad_gb > 0);
    for (const k of ['entrega', 'entrega_usd', 'entrega_cotizada', 'mensajes_cliente', 'mensajes_chiara', 'mensajes_humano']) assert.ok(noNeg(f[k]), k);
    assert.ok(f.forma_pago === null || ['contado', 'cuotas'].includes(f.forma_pago), 'forma_pago ' + f.forma_pago);
    assert.ok(ETAPAS.includes(f.etapa), 'etapa ' + f.etapa);
    assert.ok(Array.isArray(f.cerrar_hoy) && f.cerrar_hoy.every((m) => MOTIVOS.includes(m)), 'cerrar_hoy ' + f.cerrar_hoy);
    for (const k of ['fue_cotizado', 'quiso_avanzar', 'fue_escalado', 'escalado', 'pausado']) assert.strictEqual(typeof f[k], 'boolean', k);
    assert.ok(f.escalado_motivo === null || largo(f.escalado_motivo) <= 140);
    assert.ok(f.resultado === null || ['vendido', 'perdido'].includes(f.resultado));
    assert.strictEqual(f.resultado === null, f.resultado_en === null, 'resultado y resultado_en');
    assert.ok(!f.escalado || f.escalado_en, 'escalado sin escalado_en');
    assert.ok(f.primer_contacto, 'sin primer_contacto');
    assert.ok(f.ultimo_mensaje === null || largo(f.ultimo_mensaje) <= 80, 'ultimo_mensaje largo');
  }
  if (tabla === 'bot_dias') {
    assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(f.dia));
    for (const k of Object.keys(f)) if (k !== 'dia' && k !== 'actualizado_en') assert.ok(noNeg(f[k]), k);
  }
  if (tabla === 'bot_eventos') {
    assert.ok(f.clave && f.en);
    assert.ok([...TIPOS_EVENTO, ...TIPOS_STOCK].includes(f.tipo), 'tipo ' + f.tipo);
    assert.ok(f.telefono === null || TEL.test(f.telefono));
    assert.ok(f.detalle === null || largo(f.detalle) <= 140);
  }
}
async function alSupabase(url, op) {
  const u = new URL(url);
  const tabla = u.pathname.replace('/rest/v1/', '');
  const metodo = op.method || 'GET';
  assert.strictEqual(op.headers.apikey, 'sb_secret_de_mentira');
  if (supabaseCaido) return { ok: false, status: 503, text: async () => 'caído', json: async () => ({}) };
  if (metodo === 'GET') {
    assert.strictEqual(tabla, 'bot_ordenes');
    return comoRespuesta(200, [...tablas.bot_ordenes.values()].filter((o) => o.estado === 'pendiente'));
  }
  const cuerpo = JSON.parse(op.body);
  if (metodo === 'PATCH' && fallarPatch) return { ok: false, status: 503, text: async () => 'caído', json: async () => ({}) };
  if (tabla === 'bot_leads' && rechazar && cuerpo.some((f) => f.telefono === rechazar)) {
    const error = { code: '23514', message: 'new row for relation "bot_leads" violates check constraint "bot_leads_entrega_check"', details: 'Failing row contains (5490000, Juan Perez, iPhone 13)' };
    return { ok: false, status: 400, text: async () => JSON.stringify(error), json: async () => error };
  }
  // Como Postgres: una fila que no cumple el CHECK y no entra ninguna del pedido.
  if (tabla === 'bot_eventos' && sinMigracionDelStock && cuerpo.some((f) => TIPOS_STOCK.includes(f.tipo))) {
    const error = { code: '23514', message: 'new row for relation "bot_eventos" violates check constraint "bot_eventos_tipo_check"', details: 'Failing row contains (empezo_a_ofrecer, …)' };
    return { ok: false, status: 400, text: async () => JSON.stringify(error), json: async () => error };
  }
  if (metodo === 'PATCH') {
    const id = u.searchParams.get('id').replace('eq.', '');
    const o = tablas.bot_ordenes.get(id);
    if (o && o.estado === 'pendiente') Object.assign(o, cuerpo);
    assert.ok(cuerpo.estado === 'hecha' || cuerpo.estado === 'error');
    assert.ok(cuerpo.hecha_en);
    assert.ok(cuerpo.estado === 'error' || cuerpo.error === null);
    return comoRespuesta(204, null);
  }
  assert.strictEqual(u.searchParams.get('on_conflict'), CLAVE[tabla]);
  for (const fila of cuerpo) {
    validar(tabla, fila);
    const k = String(fila[CLAVE[tabla]]);
    if (tabla === 'bot_eventos' && tablas.bot_eventos.has(k)) continue; // on conflict do nothing
    tablas[tabla].set(k, { ...(tablas[tabla].get(k) || {}), ...fila });
  }
  return comoRespuesta(201, null);
}
function orden(tipo, telefono = null) {
  const id = 'orden-' + Math.random().toString(36).slice(2);
  tablas.bot_ordenes.set(id, { id, tipo, telefono, creado_en: new Date().toISOString(), estado: 'pendiente', hecha_en: null, error: null });
  return id;
}

globalThis.fetch = async (url, opciones = {}) => {
  if (String(url).startsWith('https://de-mentira.supabase.co/')) return alSupabase(url, opciones);
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + url);
  const body = JSON.parse(opciones.body);
  pedidos.push({ body });
  const paso = pasos[pedidos.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};

// ------------------------------------------------------------------ el bot, sin red
const sheets = require('../src/sheets');
const fixture = require('./fixture-planilla');
sheets.usarFixture(fixture);
sheets.registrarLead = async () => {};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
const evolution = require('../src/evolution');
const enviarTextoReal = evolution.enviarTexto;
const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
let bloquear = false;
let whatsappEstado = 'open';
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
evolution.enviarTexto = async (numero, t) => {
  if (bloquear) return { bloqueado: true, motivo: 'prueba' };
  aClientes.push({ numero, texto: t });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero, ruta, pie) => {
  if (bloquear) return { bloqueado: true, motivo: 'prueba' };
  aClientes.push({ numero, texto: pie, tipo: 'documento' });
  return respuestaEvolution(numero);
};
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: whatsappEstado });
evolution.buscarMensajesDeChat = async () => [];

const bot = require('../src/index');
const state = require('../src/state');
const cerebro = require('../src/cerebro');
const panel = require('../src/panel-chiara');
const interruptor = require('../src/interruptor');
const aprendizaje = require('../src/aprendizaje');

const escrito =(chatId, t, extra = {}) => ({ key: { remoteJid: chatId, fromMe: false, id: 'T' + Math.random() }, pushName: 'Lucia', message: { conversation: t }, ...extra });
const mio = (chatId, t) => ({ key: { remoteJid: chatId, fromMe: true, id: 'H' + Math.random() }, pushName: 'Tomi', message: { conversation: t } });
let n = 0;
const nuevoChat = () => '54900002' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const num = (chat) => chat.split('@')[0];
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
async function esperarHasta(cond, ms = 2000) {
  for (let t = 0; t < ms && !cond(); t += 10) await dormir(10);
}
/** El cliente escribe y se espera a que la tanda termine (contestó, escaló o no hizo nada). */
async function habla(chat, t, extra) {
  await bot.procesar(escrito(chat, t, extra));
  await dormir(80);
}
const lead = (chat) => tablas.bot_leads.get(num(chat));
const hoy = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires' }).format(new Date());
const eventos = (tipo, chat = null) => [...tablas.bot_eventos.values()].filter((e) => e.tipo === tipo && (chat === null || e.telefono === num(chat)));

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  } finally {
    bloquear = false;
    supabaseCaido = false;
    rechazar = null;
    fallarPatch = false;
    sinMigracionDelStock = false;
    whatsappEstado = 'open';
    if (!interruptor.prendida()) interruptor.poner(true, 'prueba');
    aClientes.length = 0;
    alGrupo.length = 0;
  }
}

const GASTO_MES_CEREBRO = 10.14;

(async () => {
  console.log('\nPanel Chiara (lado bot)\n');
  cerebro.sumarAlMes(GASTO_MES_CEREBRO);
  assert.ok(bot.arrancarPanel({ sinTimers: true }), 'el panel no arrancó');

  await check('arranca: el gasto del mes y su tope son los de cerebro.js (los de /salud), no los del registro; y la noticia del reinicio', async () => {
    assert.ok(!('mes' in panel.datos()), 'el panel sigue llevando su propia cuenta del mes');
    await panel.vuelta();
    const e = tablas.bot_estado.get('1');
    assert.ok(e, 'no subió bot_estado');
    assert.strictEqual(e.gasto_mes_usd, GASTO_MES_CEREBRO, 'subió otro gasto del mes que el de cerebro.js');
    assert.strictEqual(e.gasto_mes_usd, r4(e.salud.cerebro.gastoMes.usd), 'el panel y /salud dicen distinto');
    assert.strictEqual(e.gasto_hoy_usd, 0);
    assert.strictEqual(e.tope_mes_usd, 45, 'sin CEREBRO_TOPE_MES_USD, el tope es CHIARA_TOPE_MES_USD');
    assert.strictEqual(e.tope_mes_usd, cerebro.gastoDelMes().tope, 'el tope del panel y el de /salud son distintos');
    assert.strictEqual(e.prendida, true);
    assert.strictEqual(e.whatsapp, 'open');
    assert.strictEqual(e.contesta, 'sonnet');
    assert.strictEqual(e.salud.whatsapp, 'open', 'salud tiene que traer lo de /salud');
    assert.strictEqual(eventos('reinicio').length, 1);
  });

  await check('un chat nuevo: lead nuevo, mensajes contados, la ficha de Sonnet y el gasto de verdad', async () => {
    const chat = nuevoChat();
    guion(responde(['holaa, el 13 lo tengo! que capacidad buscabas?'], { cuando: 'hoy a la tarde', cuando_es: 'hoy', zona: 'Cipolletti' }));
    await habla(chat, 'hola tienen el 13? lo quiero para hoy, estoy en cipo');
    // con el saludo del día pueden ser dos mensajes: cuentan los que salieron
    const enviados = aEste(chat).length;
    assert.ok(enviados >= 1, 'Sonnet no contestó');
    await panel.vuelta();
    const l = lead(chat);
    assert.ok(l, 'no subió el lead');
    assert.strictEqual(l.mensajes_cliente, 1);
    assert.strictEqual(l.mensajes_chiara, enviados);
    assert.strictEqual(l.mensajes_humano, 0);
    assert.strictEqual(l.etapa, 'consultando');
    assert.strictEqual(l.zona, 'Cipolletti');
    assert.strictEqual(l.cuando, 'hoy a la tarde');
    assert.deepStrictEqual(l.cerrar_hoy, ['dijo_cuando']);
    assert.strictEqual(l.espera_desde, null, 'ya le contestaron');
    assert.strictEqual(l.ultimo_mensaje, 'hola tienen el 13? lo quiero para hoy, estoy en cipo');
    assert.ok(l.primer_contacto && l.ultimo_cliente_en && l.ultimo_chiara_en);
    assert.strictEqual(l.nombre, 'Lucia');
    const d = tablas.bot_dias.get(hoy());
    assert.strictEqual(d.leads, 1);
    assert.strictEqual(d.leads_nuevos, 1);
    assert.strictEqual(d.mensajes_cliente, 1);
    assert.strictEqual(d.mensajes_chiara, enviados);
    assert.strictEqual(d.llamadas, 1);
    assert.strictEqual(d.gasto_usd, r4(USD_POR_LLAMADA));
    assert.strictEqual(d.sombra_usd, 0);
    assert.ok(d.demora_respuesta_s !== null, 'sin demora de respuesta');
    assert.ok(d.demora_llamada_ms !== null, 'sin demora de llamada');
    const e = tablas.bot_estado.get('1');
    assert.strictEqual(e.gasto_hoy_usd, d.gasto_usd);
    assert.strictEqual(e.gasto_mes_usd, r4(GASTO_MES_CEREBRO + USD_POR_LLAMADA));
    assert.strictEqual(e.gasto_mes_usd, r4(cerebro.gastoDelMes().usd));
    assert.strictEqual(e.llamadas_hoy, 1);
    assert.strictEqual(eventos('lead_nuevo', chat).length, 1);
    // la ficha va en el pedido a Sonnet, requerida en las dos herramientas que terminan
    const herramientas = pedidos[0].body.tools.filter((t) => ['responder', 'escalar'].includes(t.name));
    assert.strictEqual(herramientas.length, 2);
    for (const h of herramientas) assert.ok(h.input_schema.required.includes('ficha'), h.name + ' sin ficha requerida');
  });

  await check('lo que no salió de verdad no cuenta como mensaje de Chiara, y el cliente queda esperando', async () => {
    const chat = nuevoChat();
    bloquear = true;
    guion(responde(['hola! contame que modelo buscabas']));
    await habla(chat, 'buenas, precio del 14?');
    await panel.vuelta();
    const l = lead(chat);
    assert.strictEqual(l.mensajes_cliente, 1);
    assert.strictEqual(l.mensajes_chiara, 0, 'contó un envío bloqueado');
    assert.ok(l.espera_desde, 'el cliente tiene que quedar esperando');
    assert.strictEqual(l.ultimo_chiara_en, null);
  });

  await check('una persona contesta: cuenta, mide la espera y ya no espera; un "gracias" no deja esperando', async () => {
    const chat = nuevoChat();
    bloquear = true;
    guion(responde(['hola!']));
    await habla(chat, 'hola, el 15 pro tienen?');
    bloquear = false;
    const antes = panel.datos().dias[hoy()].demoras.length;
    await bot.procesar(mio(chat, 'si! tengo el 15 pro 128'));
    await panel.vuelta();
    let l = lead(chat);
    assert.strictEqual(l.mensajes_humano, 1);
    assert.strictEqual(l.espera_desde, null);
    assert.ok(l.ultimo_humano_en);
    assert.strictEqual(panel.datos().dias[hoy()].demoras.length, antes + 1, 'no midió la espera');
    assert.ok(tablas.bot_dias.get(hoy()).mensajes_humano >= 1);
    // el cliente agradece: no espera (la persona sigue atendiendo, el bot calla)
    await bot.procesar(escrito(chat, 'dale gracias!!'));
    await panel.vuelta();
    l = lead(chat);
    assert.strictEqual(l.mensajes_cliente, 2);
    assert.strictEqual(l.espera_desde, null, 'un gracias no pide respuesta');
    await bot.procesar(escrito(chat, 'y cuanto sale?'));
    await panel.vuelta();
    assert.ok(lead(chat).espera_desde, 'una pregunta sí espera respuesta');
  });

  await check('el escalado: noticia, para cerrar hoy y sin tomar; lo toma una persona: sigue abierto, tomado', async () => {
    const chat = nuevoChat();
    guion(escala('Cliente dice "pasame el alias que te transfiero" para el 13', { quiere_avanzar: true, forma_pago: 'contado' }));
    await habla(chat, 'pasame el alias que te transfiero');
    await panel.vuelta();
    let l = lead(chat);
    assert.strictEqual(l.etapa, 'escalado');
    assert.strictEqual(l.escalado, true);
    assert.strictEqual(l.escalado_tomado_en, null);
    assert.ok(l.cerrar_hoy.includes('escalado') && l.cerrar_hoy.includes('quiere_avanzar'), 'cerrar_hoy: ' + l.cerrar_hoy);
    assert.strictEqual(l.escalado_motivo, 'Cliente dice "…" para el 13', 'el motivo no lleva lo que escribió el cliente');
    assert.strictEqual(l.quiso_avanzar, true);
    assert.strictEqual(l.fue_escalado, true);
    assert.strictEqual(l.forma_pago, 'contado');
    assert.strictEqual(l.intencion, 'quiere_avanzar');
    assert.strictEqual(eventos('escalado', chat).length, 1);
    assert.ok(!/alias que te transfiero/.test(eventos('escalado', chat)[0].detalle || ''));
    assert.ok(tablas.bot_dias.get(hoy()).escalados >= 1);
    await bot.procesar(mio(chat, 'te paso el alias'));
    await panel.vuelta();
    l = lead(chat);
    assert.strictEqual(l.escalado, true, 'lo tomó una persona: sigue abierto mientras atiende');
    assert.ok(l.escalado_tomado_en, 'tomado');
    assert.ok(!l.cerrar_hoy.includes('escalado'), 'tomado ya no espera');
    assert.strictEqual(eventos('resuelto', chat).length, 1);
    // pasado el silencio de la persona, Chiara vuelve: el escalado se cierra
    const s = state.todos()[chat];
    s.ultimoHumano = Date.now() - 46 * 60 * 1000;
    await panel.vuelta();
    l = lead(chat);
    assert.strictEqual(l.escalado, false);
    assert.strictEqual(l.etapa, 'quiere_avanzar', 'manda la más avanzada');
  });

  await check('la cotización cuenta recién cuando sale, y con forma de pago queda "cotizado completo"', async () => {
    const chat = nuevoChat();
    guion(
      [usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'tengo 340' })],
      responde(['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?'], { forma_pago: 'cuotas' })
    );
    await habla(chat, 'el 13, tengo 340 y lo demas en cuotas');
    await esperarHasta(() => aEste(chat).length >= 3);
    await panel.vuelta();
    const l = lead(chat);
    assert.strictEqual(l.fue_cotizado, true, 'no contó la cotización: ' + JSON.stringify(aEste(chat)));
    assert.strictEqual(l.etapa, 'cotizado');
    assert.ok(/13/.test(l.cotizado_de), 'cotizado_de ' + l.cotizado_de);
    assert.strictEqual(l.entrega_cotizada, 340000);
    assert.strictEqual(l.forma_pago, 'cuotas');
    assert.ok(l.cerrar_hoy.includes('cotizado_completo'), 'cerrar_hoy: ' + l.cerrar_hoy);
    // con el envío bloqueado no cuenta
    const otro = nuevoChat();
    bloquear = true;
    guion([usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'tengo 340' })], responde(['dale', '[cotizacion]']));
    await habla(otro, 'el 13, tengo 340');
    await panel.vuelta();
    assert.strictEqual(lead(otro).fue_cotizado, false, 'una cotización que no salió no cuenta');
  });

  await check('las órdenes: pausar, vendido, un teléfono que no existe y devolver', async () => {
    const chat = nuevoChat();
    guion(responde(['hola!']));
    await habla(chat, 'hola');
    const o1 = orden('pausar', num(chat));
    const o2 = orden('vendido', num(chat));
    const o3 = orden('pausar', '5491111111111');
    await panel.vuelta();
    assert.strictEqual(tablas.bot_ordenes.get(o1).estado, 'hecha');
    assert.strictEqual(tablas.bot_ordenes.get(o2).estado, 'hecha');
    assert.strictEqual(tablas.bot_ordenes.get(o3).estado, 'error');
    assert.ok(tablas.bot_ordenes.get(o3).error && !/\n/.test(tablas.bot_ordenes.get(o3).error), 'el error, en una línea');
    const s = state.todos()[chat];
    assert.strictEqual(s.pausado, true);
    assert.strictEqual(s.resultado.tipo, 'vendido');
    assert.ok(alGrupo.some((t) => t.startsWith('📱 Desde el panel') && /Pausado/.test(t)), 'sin aviso al grupo de la pausa: ' + JSON.stringify(alGrupo));
    assert.ok(alGrupo.some((t) => t.startsWith('📱 Desde el panel') && /vendid/i.test(t)), 'sin aviso al grupo de la venta: ' + JSON.stringify(alGrupo));
    const l = lead(chat);
    assert.strictEqual(l.etapa, 'vendido');
    assert.strictEqual(l.resultado, 'vendido');
    assert.deepStrictEqual(l.cerrar_hoy, []);
    assert.strictEqual(l.pausado, true);
    assert.strictEqual(eventos('pausado', chat).length, 1);
    assert.strictEqual(eventos('vendido', chat).length, 1);
    // la misma orden dos veces (si el PATCH se perdió) no cambia nada
    tablas.bot_ordenes.get(o2).estado = 'pendiente';
    const ts = s.resultado.ts;
    await panel.vuelta();
    assert.strictEqual(state.todos()[chat].resultado.ts, ts);
    const o4 = orden('devolver', num(chat));
    await panel.vuelta();
    assert.strictEqual(tablas.bot_ordenes.get(o4).estado, 'hecha');
    assert.strictEqual(state.todos()[chat].pausado, false);
    assert.strictEqual(eventos('devuelto', chat).length, 1);
  });

  await check('el interruptor: apagada no contesta ni llama a Sonnet, sigue contando, queda en disco; prendida vuelve', async () => {
    orden('apagar');
    await panel.vuelta();
    assert.strictEqual(interruptor.prendida(), false);
    assert.strictEqual(JSON.parse(fs.readFileSync(interruptor.ruta(), 'utf8')).prendida, false, 'no quedó en disco');
    assert.ok(alGrupo.some((t) => /Chiara APAGADA desde el panel/.test(t)));
    assert.strictEqual(tablas.bot_estado.get('1').prendida, false);
    assert.strictEqual(eventos('apagada').length, 1);
    const chat = nuevoChat();
    guion();
    await habla(chat, 'hola, tienen el 16?');
    assert.strictEqual(pedidos.length, 0, 'apagada llamó a Sonnet');
    assert.strictEqual(aEste(chat).length, 0, 'apagada le contestó');
    assert.deepStrictEqual(await enviarTextoReal(chat, 'hola'), { bloqueado: true, motivo: 'Chiara apagada desde el panel' });
    await panel.vuelta();
    assert.strictEqual(lead(chat).mensajes_cliente, 1, 'apagada igual cuenta');
    assert.ok(lead(chat).espera_desde, 'y el cliente queda esperando');
    // otra vez apagar: no avisa de nuevo
    alGrupo.length = 0;
    orden('apagar');
    await panel.vuelta();
    assert.strictEqual(alGrupo.length, 0);
    // un reinicio no la prende
    interruptor._olvidar();
    assert.strictEqual(interruptor.prendida(), false);
    orden('prender');
    await panel.vuelta();
    assert.strictEqual(interruptor.prendida(), true);
    assert.ok(alGrupo.some((t) => /Chiara PRENDIDA desde el panel/.test(t)));
    assert.strictEqual(eventos('prendida').length, 1);
    guion(responde(['si, el 16 lo tengo!']));
    await habla(chat, 'hola??');
    assert.ok(aEste(chat).length >= 1, 'prendida no contestó');
  });

  await check('#apagar / #prender desde el grupo (06/10/2026): como el botón del panel, con respuesta al grupo y la noticia', async () => {
    const enGrupo = async (t, deLaCuenta = true) => {
      await bot.procesar({ ...mio(GRUPO, t), key: { remoteJid: GRUPO, fromMe: deLaCuenta, id: 'G' + Math.random() } });
      await dormir(20);
    };
    // (que apagada no contesta ni llama a Sonnet lo prueba el check del interruptor: es el mismo interruptor)
    // de alguien del grupo que no es la cuenta: no es un comando
    await enGrupo('#apagar', false);
    assert.strictEqual(interruptor.prendida(), true);
    assert.strictEqual(alGrupo.length, 0);
    // "#apagado" o "#prenderla" no son el comando
    await enGrupo('#apagado');
    assert.strictEqual(interruptor.prendida(), true);
    await enGrupo('#apagar');
    assert.strictEqual(interruptor.prendida(), false);
    assert.strictEqual(JSON.parse(fs.readFileSync(interruptor.ruta(), 'utf8')).por, 'grupo', 'no quedó en disco');
    assert.ok(alGrupo.some((t) => /Chiara APAGADA desde el grupo/.test(t)), 'sin respuesta al grupo: ' + JSON.stringify(alGrupo));
    await panel.vuelta();
    assert.strictEqual(tablas.bot_estado.get('1').prendida, false);
    const apagadas = [...tablas.bot_eventos.values()].filter((e) => e.tipo === 'apagada' && e.detalle === 'desde el grupo');
    assert.strictEqual(apagadas.length, 1, 'sin la noticia para el panel');
    // otra vez: dice que ya estaba, sin otra noticia
    alGrupo.length = 0;
    await enGrupo('#Apagar');
    assert.ok(/ya estaba APAGADA/.test(alGrupo.join('\n')), JSON.stringify(alGrupo));
    // con un número atrás: no cambia nada y explica
    alGrupo.length = 0;
    await enGrupo('#prender 5492990000000');
    assert.strictEqual(interruptor.prendida(), false);
    assert.ok(/#pausa/.test(alGrupo.join('\n')), JSON.stringify(alGrupo));
    // "#prender chiara" sí
    await enGrupo('#prender chiara');
    assert.strictEqual(interruptor.prendida(), true);
    assert.ok(alGrupo.some((t) => /Chiara PRENDIDA desde el grupo/.test(t)));
    await panel.vuelta();
    assert.strictEqual(tablas.bot_estado.get('1').prendida, true);
    assert.strictEqual([...tablas.bot_eventos.values()].filter((e) => e.tipo === 'prendida' && e.detalle === 'desde el grupo').length, 1);
  });

  await check('la sombra cuenta como sombra: suma al mes pero no al gasto de hoy, y su ficha vale', async () => {
    const chat = nuevoChat();
    guion(responde(['hola']));
    await habla(chat, 'hola');
    await panel.vuelta();
    const antes = tablas.bot_estado.get('1');
    guion(responde(['esto no sale'], { canje: 'iPhone 12 128GB 85%' }));
    const r = await cerebro.pensar({ chatId: chat, mensaje: 'tomas mi 12?', nombre: '' });
    assert.ok(!r.error, r.error);
    await panel.vuelta();
    const despues = tablas.bot_estado.get('1');
    assert.strictEqual(despues.gasto_hoy_usd, antes.gasto_hoy_usd, 'la sombra sumó al gasto de hoy');
    assert.strictEqual(Math.round((despues.sombra_hoy_usd - antes.sombra_hoy_usd) * 1e4), Math.round(USD_POR_LLAMADA * 1e4));
    assert.strictEqual(Math.round((despues.gasto_mes_usd - antes.gasto_mes_usd) * 1e4), Math.round(USD_POR_LLAMADA * 1e4), 'el mes incluye la sombra');
    assert.strictEqual(lead(chat).canje, 'iPhone 12 128GB 85%', 'la ficha de la sombra también vale');
  });

  await check('el gasto del mes y los contadores sobreviven a un reinicio (no se vuelve a sembrar); un chiara.json viejo con su "mes" se lee igual', async () => {
    await panel.vuelta();
    const gastoAntes = tablas.bot_estado.get('1').gasto_mes_usd;
    const antes = JSON.parse(JSON.stringify(panel.datos()));
    panel._detener();
    // un registro que, si se volviera a leer, cambiaría el mes
    fs.appendFileSync(process.env.APRENDIZAJE_PATH, JSON.stringify({ v: 2, ts: new Date().toISOString(), tipo: 'propuesta', sonnet: { usd: 7 } }) + '\n');
    // el chiara.json de antes del 08/10/2026 traía la cuenta del panel: se lee sin romper y no se usa
    const viejo = JSON.parse(fs.readFileSync(panel.ruta(), 'utf8'));
    viejo.mes = { mes: hoy().slice(0, 7), vivo: 10.11, sombra: 0 };
    fs.writeFileSync(panel.ruta(), JSON.stringify(viejo));
    assert.ok(bot.arrancarPanel({ sinTimers: true }));
    const d = panel.datos();
    assert.strictEqual(d.dias[hoy()].cliente, antes.dias[hoy()].cliente);
    assert.deepStrictEqual(Object.keys(d.leads).sort(), Object.keys(antes.leads).sort());
    await panel.vuelta();
    assert.strictEqual(eventos('reinicio').length, 2);
    assert.strictEqual(tablas.bot_estado.get('1').gasto_mes_usd, gastoAntes, 'el reinicio cambió el gasto del mes');
    assert.strictEqual(gastoAntes, r4(cerebro.gastoDelMes().usd));
    assert.ok(!('mes' in JSON.parse(fs.readFileSync(panel.ruta(), 'utf8'))), 'chiara.json sigue guardando la cuenta vieja del mes');
  });

  await check('el anuncio de origen: se guarda el primero, solo si es un anuncio', async () => {
    const chat = nuevoChat();
    const deAnuncio = (id, tipo = 'ad') => ({
      message: {
        extendedTextMessage: { text: 'hola, vi el anuncio', contextInfo: { externalAdReply: { title: 'iPhone 13', sourceType: tipo, sourceId: id, sourceUrl: 'https://fb.me/x' } } },
      },
    });
    guion(responde(['hola!']));
    await bot.procesar({ key: { remoteJid: chat, fromMe: false, id: 'A1' }, pushName: 'Ana', ...deAnuncio('120211234567890123') });
    await dormir(80);
    guion(responde(['dale']));
    await bot.procesar({ key: { remoteJid: chat, fromMe: false, id: 'A2' }, pushName: 'Ana', ...deAnuncio('999999999') });
    await dormir(80);
    await panel.vuelta();
    assert.strictEqual(lead(chat).anuncio_id, '120211234567890123');
    assert.strictEqual(panel.anuncioDe({ contextInfo: { externalAdReply: { sourceId: '777', sourceType: 'ad' } } }), '777');
    assert.strictEqual(panel.anuncioDe({ message: { conversation: 'hola' } }), null);
    assert.strictEqual(panel.anuncioDe(deAnuncio('123456', 'post')), null, 'una publicación no es un anuncio');
  });

  await check('el tester y los chats sin número no se suben', async () => {
    const tester = TESTER + '@s.whatsapp.net';
    guion(responde(['hola tester']));
    await habla(tester, 'hola');
    await panel.vuelta();
    assert.ok(!tablas.bot_leads.has(TESTER));
    assert.ok(!panel.datos().leads[TESTER]);
  });

  await check('Supabase caído: no tira, sigue contando y lo sube después', async () => {
    const chat = nuevoChat();
    supabaseCaido = true;
    guion(responde(['hola!']));
    await habla(chat, 'hola, el 12?');
    const r = await panel.vuelta();
    assert.ok(r, 'la vuelta no corrió');
    assert.ok(!tablas.bot_leads.has(num(chat)));
    assert.ok(panel.datos().eventos.some((e) => e.tipo === 'lead_nuevo' && e.telefono === num(chat)), 'la noticia quedó para subir');
    assert.ok(panel.resumen().ultimoError, 'sin el error en /salud');
    supabaseCaido = false;
    await panel.vuelta();
    assert.ok(tablas.bot_leads.has(num(chat)));
    assert.strictEqual(eventos('lead_nuevo', chat).length, 1);
    assert.ok(!panel.datos().eventos.some((e) => e.telefono === num(chat)), 'las subidas salen del disco');
  });

  await check('WhatsApp caído: una noticia a las dos vueltas sin "open", y otra cuando vuelve', async () => {
    whatsappEstado = 'close';
    await panel.vuelta();
    assert.strictEqual(eventos('whatsapp_caido').length, 0, 'una vuelta sola no alcanza');
    await panel.vuelta();
    await panel.vuelta();
    assert.strictEqual(eventos('whatsapp_caido').length, 1);
    assert.strictEqual(tablas.bot_estado.get('1').whatsapp, 'close');
    whatsappEstado = 'open';
    await panel.vuelta();
    assert.strictEqual(eventos('whatsapp_volvio').length, 1);
  });

  await check('/salud trae el interruptor y el panel; la ficha está en las reglas de Sonnet', async () => {
    const s = await bot.datosDeSalud();
    assert.strictEqual(s.chiara.prendida, true);
    assert.strictEqual(s.panel.activo, true);
    assert.ok(/`ficha`/.test(cerebro.REGLAS), 'las reglas no hablan de la ficha');
    for (const nombre of ['responder', 'escalar']) {
      const h = cerebro.HERRAMIENTAS.find((x) => x.name === nombre);
      assert.ok(h.input_schema.properties.ficha && h.input_schema.required.includes('ficha'), nombre);
    }
    // sin ficha (una respuesta vieja) no rompe nada
    assert.strictEqual(cerebro.fichaDe({ mensajes: ['x'] }), null);
  });

  await check('espera: un "gracias", un "dale" o un sticker no esperan; un audio y una pregunta sí', async () => {
    const t = Date.now();
    const s = (lineas, extra = {}) => ({ historial: lineas.map(([quien, texto, ts]) => ({ quien, texto, ts })), ultimoEnvioCliente: 0, ultimoHumano: 0, ...extra });
    assert.strictEqual(panel.esperaDesde(s([['cliente', 'dale gracias!!', t]])), null);
    assert.strictEqual(panel.esperaDesde(s([['cliente', '[sticker]', t]])), null);
    assert.strictEqual(panel.esperaDesde(s([['cliente', '[audio]', t]])), t);
    assert.strictEqual(panel.esperaDesde(s([['cliente', 'hola', t - 10], ['vendedor', 'hola!', t - 5], ['cliente', 'cuanto sale?', t]])), t);
    assert.strictEqual(panel.esperaDesde(s([['cliente', 'hola', t - 10], ['cliente', 'cuanto sale?', t]], { ultimoHumano: t + 1 })), null);
    // un borrador (sinConfirmar) no es una respuesta
    const conBorrador = s([['cliente', 'hola', t - 10]]);
    conBorrador.historial.push({ quien: 'vendedor', texto: 'borrador', ts: t, sinConfirmar: true });
    assert.strictEqual(panel.esperaDesde(conBorrador), t - 10);
    // lo último que escribió tiene más de 72 h: quedó ahí, no es un aviso
    const h73 = 73 * 3600 * 1000;
    assert.strictEqual(panel.esperaDesde(s([['cliente', 'y el 13?', t - h73]])), null);
    assert.strictEqual(panel.esperaDesde(s([['cliente', 'y el 13?', t - h73], ['cliente', 'holaa?', t]])), t - h73, 'si volvió a escribir, espera desde la primera');
  });

  await check('un escalado tomado se cierra una vez: si la persona vuelve a escribir días después, no se reabre', async () => {
    const chat = nuevoChat();
    guion(escala('pide hablar con una persona'));
    await habla(chat, 'quiero hablar con alguien');
    await bot.procesar(mio(chat, 'hola, decime'));
    await panel.vuelta();
    assert.strictEqual(lead(chat).escalado, true);
    state.todos()[chat].ultimoHumano = Date.now() - 46 * 60 * 1000;
    await panel.vuelta();
    assert.strictEqual(lead(chat).escalado, false);
    await bot.procesar(mio(chat, 'che, al final?'));
    await panel.vuelta();
    assert.strictEqual(lead(chat).escalado, false, 'se reabrió un escalado viejo');
  });

  await check('un escalado que se toma dentro del mismo minuto también es noticia y cuenta', async () => {
    const chat = nuevoChat();
    guion(responde(['hola!']));
    await habla(chat, 'hola');
    await panel.vuelta();
    const antes = tablas.bot_dias.get(hoy()).escalados;
    guion(escala('quiere ver el equipo en persona'));
    await habla(chat, 'puedo ir a verlo?');
    await bot.procesar(mio(chat, 'si, veni'));
    await panel.vuelta();
    assert.strictEqual(eventos('escalado', chat).length, 1);
    assert.strictEqual(tablas.bot_dias.get(hoy()).escalados, antes + 1);
  });

  await check('un #reset de un chat escalado deja la fila neutra (sin avisos colgados), con lo contado', async () => {
    const chat = nuevoChat();
    guion(escala('no se entiende'));
    await habla(chat, 'asdf qwer?');
    await panel.vuelta();
    assert.strictEqual(lead(chat).escalado, true);
    await bot.procesar(mio(chat, '#reset'));
    await dormir(20);
    assert.ok(!state.todos()[chat], 'el #reset no borró el chat');
    await panel.vuelta();
    const l = lead(chat);
    assert.strictEqual(l.escalado, false);
    assert.strictEqual(l.espera_desde, null);
    assert.deepStrictEqual(l.cerrar_hoy, []);
    assert.strictEqual(l.pausado, false);
    assert.strictEqual(l.mensajes_cliente, 1, 'lo contado queda');
  });

  await check('una reacción o un borrado no cuentan como mensajes del cliente', async () => {
    const chat = nuevoChat();
    guion(responde(['hola!']));
    await habla(chat, 'hola');
    await bot.procesar({ key: { remoteJid: chat, fromMe: false, id: 'R1' }, message: { reactionMessage: { text: '👍', key: { id: 'x' } } } });
    await bot.procesar({ key: { remoteJid: chat, fromMe: false, id: 'R2' }, message: { protocolMessage: { type: 0 } } });
    await panel.vuelta();
    assert.strictEqual(lead(chat).mensajes_cliente, 1);
  });

  await check('Supabase rechaza un lead (400): los demás entran y el error no trae datos del cliente', async () => {
    const a = nuevoChat();
    const b = nuevoChat();
    guion(responde(['hola!']));
    await habla(a, 'hola');
    guion(responde(['hola!']));
    await habla(b, 'hola');
    rechazar = num(a);
    await panel.vuelta();
    assert.ok(!tablas.bot_leads.has(num(a)));
    assert.ok(tablas.bot_leads.has(num(b)), 'un lead malo frenó a los demás');
    const e = panel.resumen().ultimoError;
    assert.ok(e && /23514/.test(e.msg), JSON.stringify(e));
    assert.ok(!/Failing row|Juan/.test(e.msg), 'el error trae datos del cliente');
  });

  await check('si el PATCH de una orden falla, no se vuelve a aplicar: se reintenta solo el PATCH', async () => {
    const chat = nuevoChat();
    guion(responde(['hola!']));
    await habla(chat, 'hola');
    const id = orden('pausar', num(chat));
    fallarPatch = true;
    await panel.vuelta();
    assert.strictEqual(state.todos()[chat].pausado, true);
    assert.strictEqual(tablas.bot_ordenes.get(id).estado, 'pendiente');
    await dormir(10);
    const avisos = alGrupo.filter((t) => /Pausado/.test(t)).length;
    state.actualizar(chat, { pausado: false }); // si se volviera a aplicar, lo pausaría de nuevo
    fallarPatch = false;
    await panel.vuelta();
    await dormir(10);
    assert.strictEqual(tablas.bot_ordenes.get(id).estado, 'hecha');
    assert.strictEqual(state.todos()[chat].pausado, false, 'la orden se aplicó dos veces');
    assert.strictEqual(alGrupo.filter((t) => /Pausado/.test(t)).length, avisos, 'avisó dos veces');
  });

  await check('el archivo del interruptor ilegible: apagada por las dudas, un aviso al grupo; prenderla lo arregla', async () => {
    fs.writeFileSync(interruptor.ruta(), '{ roto');
    interruptor._olvidar();
    assert.strictEqual(interruptor.prendida(), false);
    await panel.vuelta();
    await dormir(10);
    assert.ok(alGrupo.some((t) => /No pude leer el interruptor/.test(t)), 'no avisó al grupo');
    const avisos = alGrupo.length;
    await panel.vuelta();
    await dormir(10);
    assert.strictEqual(alGrupo.length, avisos, 'avisó dos veces');
    assert.strictEqual(tablas.bot_estado.get('1').prendida, false);
    orden('prender');
    await panel.vuelta();
    assert.strictEqual(interruptor.prendida(), true);
    assert.strictEqual(JSON.parse(fs.readFileSync(interruptor.ruta(), 'utf8')).prendida, true);
    assert.strictEqual(interruptor.problema(), null);
  });

  // ---------------------------------------------- 14. "devolver" contesta como #sigue desde el grupo (08/10/2026)
  /** Un chat pausado desde el panel; si viene `texto`, el cliente lo escribió después (sin respuesta). */
  async function pausadoDesdeElPanel(texto) {
    const chat = nuevoChat();
    guion(responde(['hola! que equipo buscabas?']));
    await habla(chat, 'hola, una consulta');
    orden('pausar', num(chat));
    await panel.vuelta();
    assert.strictEqual(state.todos()[chat].pausado, true, 'el caso no prueba nada: no quedó pausado');
    aClientes.length = 0;
    guion();
    if (texto) await habla(chat, texto);
    assert.strictEqual(aEste(chat).length + pedidos.length, 0, 'le contestó con el chat pausado');
    alGrupo.length = 0;
    return chat;
  }
  const avisosDevolver = () => alGrupo.filter((t) => t.startsWith('📱 Desde el panel · ▶️ Reactivado'));
  const propuestasDe = (chat) =>
    fs
      .readFileSync(process.env.APRENDIZAJE_PATH, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l))
      .filter((e) => e.tipo === 'propuesta' && e.clave === aprendizaje.clave(chat));

  await check('14a. "devolver" con lo último del cliente sin contestar ("cuanto sale el 13?"): reactiva, avisa como #sigue y la tanda le contesta esa línea', async () => {
    const chat = await pausadoDesdeElPanel('cuanto sale el 13?');
    guion(responde(['sii, el 13 lo tenemos, de cuantos gb lo buscabas?']));
    const id = orden('devolver', num(chat));
    await panel.vuelta();
    assert.strictEqual(tablas.bot_ordenes.get(id).estado, 'hecha');
    assert.strictEqual(state.todos()[chat].pausado, false, 'no lo reactivó');
    await esperarHasta(() => aEste(chat).length >= 1);
    assert.deepStrictEqual(aEste(chat).map((m) => m.texto), ['sii, el 13 lo tenemos, de cuantos gb lo buscabas?'], 'no le contestó lo que dejó escrito');
    assert.strictEqual(pedidos.length, 1);
    assert.ok(/cuanto sale el 13\?/.test(JSON.stringify(pedidos[0].body.messages)), 'Sonnet no vio la línea que dejó escrita');
    const avisos = avisosDevolver();
    assert.strictEqual(avisos.length, 1, JSON.stringify(alGrupo));
    assert.ok(/ — el bot vuelve a contestarle \(saqué la pausa\) y le contesto lo que dejó escrito\n💬 https:\/\/wa\.me\/\d+$/.test(avisos[0]), avisos[0]);
    // el mismo camino que #sigue: la propuesta va al registro con origen 'sigue'
    const prop = propuestasDe(chat).pop();
    assert.strictEqual(prop && prop.origen, 'sigue', JSON.stringify(prop));
  });

  const tandas = [];
  await check('14b. con un atenderChat de mentira: arranca una tanda de ese chat; repetida (el PATCH se perdió), no se vuelve a aplicar', async () => {
    panel._detener();
    assert.ok(bot.arrancarPanel({ sinTimers: true, atenderChat: async (chatId, nombre) => tandas.push({ chatId, nombre }) }));
    const chat = await pausadoDesdeElPanel('y en cuotas como es?');
    const id = orden('devolver', num(chat));
    fallarPatch = true;
    await panel.vuelta();
    await dormir(10);
    assert.deepStrictEqual(tandas.map((t) => t.chatId), [chat], 'no arrancó la tanda');
    assert.strictEqual(typeof tandas[0].nombre, 'string');
    assert.strictEqual(state.todos()[chat].pausado, false);
    assert.strictEqual(tablas.bot_ordenes.get(id).estado, 'pendiente');
    assert.strictEqual(avisosDevolver().length, 1);
    assert.ok(/y le contesto lo que dejó escrito\n/.test(avisosDevolver()[0]), avisosDevolver()[0]);
    // si se volviera a aplicar, lo reactivaría, arrancaría otra tanda y avisaría de nuevo
    state.actualizar(chat, { pausado: true });
    fallarPatch = false;
    await panel.vuelta();
    await dormir(10);
    assert.strictEqual(tablas.bot_ordenes.get(id).estado, 'hecha');
    assert.strictEqual(tandas.length, 1, 'arrancó otra tanda');
    assert.strictEqual(state.todos()[chat].pausado, true, 'la orden se aplicó dos veces');
    assert.strictEqual(avisosDevolver().length, 1, 'avisó dos veces');
  });

  await check('14c. "devolver" sin nada para contestar (lo último es de Chiara): solo reactiva, con el aviso de #sigue que dice por qué', async () => {
    tandas.length = 0;
    const chat = await pausadoDesdeElPanel(null);
    const id = orden('devolver', num(chat));
    await panel.vuelta();
    await dormir(10);
    assert.strictEqual(tablas.bot_ordenes.get(id).estado, 'hecha');
    assert.strictEqual(state.todos()[chat].pausado, false);
    assert.strictEqual(tandas.length, 0, 'arrancó una tanda sin nada para contestar');
    const avisos = avisosDevolver();
    assert.strictEqual(avisos.length, 1, JSON.stringify(alGrupo));
    assert.ok(/\(saqué la pausa\); le contesto cuando vuelva a escribir \(no dejó nada sin contestar\)\n💬/.test(avisos[0]), avisos[0]);
  });

  await check('14d. sin atenderChat (no lo pasó index.js): "devolver" solo reactiva, y el aviso no promete una respuesta', async () => {
    panel._detener();
    assert.ok(bot.arrancarPanel({ sinTimers: true, atenderChat: null }));
    const chat = await pausadoDesdeElPanel('hola? sigue disponible?');
    orden('devolver', num(chat));
    await panel.vuelta();
    await dormir(10);
    assert.strictEqual(state.todos()[chat].pausado, false);
    const avisos = avisosDevolver();
    assert.strictEqual(avisos.length, 1, JSON.stringify(alGrupo));
    assert.ok(!/le contesto/.test(avisos[0]), avisos[0]);
  });

  // Lo que pasó hoy del stock: stock-app.js compara lo que Chiara ofrece del local (las filas que escribió en
  // USADOS) con la vuelta anterior y el panel lo anota. Acá se le pasan las filas directo (sin la planilla).
  const stockApp = require('../src/stock-app');
  const filaUsados = (id, modelo, gb, bateria, precio) => ({ id, modelo, capacidad_gb: gb, bateria_pct: bateria, precio_contado: precio });
  const EQ = {
    A: filaUsados('15P-256-001', 'iPhone 15 Pro', 256, 92, 870000),
    B: filaUsados('16-128-001', 'iPhone 16', 128, 'SELLADO', 1450000),
    C: filaUsados('12-64-001', 'iPhone 12', 64, 90, 380000),
    D: filaUsados('13-128-004', 'iPhone 13', 128, 100, 495000),
  };

  await check('lo que pasó hoy del stock (08/10/2026): "empezó a ofrecer" y "dejó de ofrecer" con el equipo y sin teléfono; dos de la misma vuelta no se pisan', async () => {
    fs.rmSync(stockApp.rutaOfrece(), { force: true });
    stockApp._reiniciar();
    const t = Date.now();
    stockApp.anotarOferta([EQ.A], t - 2000); // la base
    stockApp.anotarOferta([EQ.A, EQ.B, EQ.C], t - 1000);
    await panel.vuelta();
    const empezo = eventos('empezo_a_ofrecer');
    assert.deepStrictEqual(
      empezo.map((e) => [e.telefono, e.nombre, e.detalle, e.en]).sort(),
      [
        [null, null, 'iPhone 12 64GB 90% · $380.000 · 12-64-001', new Date(t - 1000).toISOString()],
        [null, null, 'iPhone 16 128GB sellado · $1.450.000 · 16-128-001', new Date(t - 1000).toISOString()],
      ]
    );
    assert.strictEqual(new Set(empezo.map((e) => e.clave)).size, 2, 'las dos con la misma hora tienen que tener claves distintas');
    stockApp.anotarOferta([EQ.B, EQ.C], t);
    await panel.vuelta();
    assert.deepStrictEqual(eventos('dejo_de_ofrecer').map((e) => e.detalle), ['iPhone 15 Pro 256GB 92% · $870.000 · 15P-256-001']);
    assert.strictEqual(panel.resumen().noticiasSinSubir, 0);
  });

  await check('la base todavía no acepta los tipos del stock (falta la migración de la app): esas noticias quedan afuera, con el error en /salud, y las demás suben igual', async () => {
    sinMigracionDelStock = true;
    const prendidas = eventos('prendida').length;
    const t = Date.now();
    stockApp.anotarOferta([EQ.B, EQ.C, EQ.D], t);
    panel.interruptorDesdeGrupo(true, t);
    await panel.vuelta();
    assert.strictEqual(eventos('prendida').length, prendidas + 1, 'la noticia del interruptor no subió');
    assert.ok(!eventos('empezo_a_ofrecer').some((e) => /13-128-004/.test(e.detalle)));
    assert.strictEqual(panel.resumen().noticiasSinSubir, 0, 'la que la base rechaza no queda trabando la cola');
    const e = panel.resumen().ultimoError;
    assert.ok(e && /empezo_a_ofrecer/.test(e.msg) && /23514/.test(e.msg), JSON.stringify(e));
    sinMigracionDelStock = false;
    await panel.vuelta();
    assert.ok(!eventos('empezo_a_ofrecer').some((x) => /13-128-004/.test(x.detalle)), 'no se reintenta');
  });

  panel._detener();
  // Para probar las filas contra la 0013 de verdad (un Postgres aparte): PANEL_VOLCAR=archivo.json.
  if (process.env.PANEL_VOLCAR) {
    const volcado = Object.fromEntries(Object.entries(tablas).map(([t, m]) => [t, [...m.values()]]));
    fs.writeFileSync(process.env.PANEL_VOLCAR, JSON.stringify(volcado, null, 1));
  }
  console.log(fallos ? `\n${fallos} fallo(s)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
