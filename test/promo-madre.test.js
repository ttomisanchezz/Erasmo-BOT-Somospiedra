'use strict';
/**
 * La promo del Día de la Madre (decisión de Tomás del 12/10/2026): Chiara no la cotiza, saluda una sola vez y
 * escala a Tomás o Fran, hasta el 18/10/2026 a las 23:59 (src/promo-madre.js).
 *
 *   node test/promo-madre.test.js
 *
 *   A. el módulo solo: qué mensajes son de la promo, la palabra, el `anuncio_id` (que tiene que entrar en el
 *      CHECK de bot_leads), y el límite de la fecha;
 *   B. de punta a punta por index.js, con Sonnet y con el bot de siempre: el saludo, el aviso al grupo con la
 *      palabra, la fila de LEADS, el `anuncio_id` que sube el panel, y que no se cotiza ni se llama a Sonnet;
 *   C. la fecha simulada al 19/10 y los mensajes sin promo siguen el flujo normal;
 *   D. lo que se cuida aparte: el saludo sale una sola vez por chat, "100%" no es "10%", lo que citó el cliente
 *      no cuenta, y un anuncio de verdad no se pisa.
 *
 * Las fechas se fijan con un reloj de mentira: la prueba no depende del día en que se corra (después del
 * 18/10 la fecha real ya venció).
 *
 * Sin red: Anthropic, Supabase, Evolution y la planilla son de mentira. El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'promo-madre-'));
const GRUPO = '120363000000000077@g.us';
const TESTER = '5490000099997';

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
process.env.AUDIO_ACTIVO = 'true';
process.env.ESPEJO_COTIZADOR_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.SHEET_ID = '';
process.env.GOOGLE_CREDENTIALS_PATH = path.join(TMP, 'no-hay-credenciales.json');
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
process.env.EVOLUTION_URL = 'http://evolution-de-mentira:8080';
process.env.SUPABASE_URL = 'https://de-mentira.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_de_mentira';
process.env.CHIARA_PANEL_ACTIVO = 'true';
// Lo que el .env real podría cambiar y esta prueba no mira: el tope de gasto, el stock de la app y los plazos del escalado.
process.env.CEREBRO_TOPE_MES_USD = '';
process.env.CHIARA_TOPE_MES_USD = '45';
process.env.STOCK_APP_MODO = 'apagado';
process.env.ESCALADO_REANUDAR_HORAS = '24';
process.env.ESCALADO_RECORDATORIO_MIN = '30';
process.env.MAX_MENSAJES_TANDA = '4';
process.env.MENSAJES_SIN_VENTA = '5';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

// ------------------------------------------------------------------ la API de Anthropic de mentira
const pedidos = [];
let pasos = [];
let idHerramienta = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
const FICHA_VACIA = { quiere_avanzar: false, cuando: '', cuando_es: 'no_dijo', forma_pago: 'no_dijo', zona: '', canje: '' };
const responde = (mensajes) => [usar('responder', { mensajes, ficha: { ...FICHA_VACIA } })];
const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
function guion(...lista) {
  pasos = lista;
  pedidos.length = 0;
}

// ------------------------------------------------------------------ el Supabase de mentira: bot_leads con su CHECK de la 0013
const leadsSubidos = new Map();
const ANUNCIO_VALIDO = /^[A-Za-z0-9_-]{3,64}$/;
async function alSupabase(url, op) {
  const tabla = new URL(url).pathname.replace('/rest/v1/', '');
  if ((op.method || 'GET') === 'GET') return comoRespuesta(200, []);
  if ((op.method || 'GET') === 'PATCH') return comoRespuesta(204, null);
  const cuerpo = JSON.parse(op.body);
  if (tabla === 'bot_leads') {
    // Como Postgres: una fila que no cumple el CHECK y no entra ninguna del pedido.
    if (cuerpo.some((f) => f.anuncio_id !== null && f.anuncio_id !== undefined && !ANUNCIO_VALIDO.test(f.anuncio_id))) {
      const error = { code: '23514', message: 'new row for relation "bot_leads" violates check constraint "bot_leads_anuncio_id_check"' };
      return { ok: false, status: 400, text: async () => JSON.stringify(error), json: async () => error };
    }
    for (const f of cuerpo) leadsSubidos.set(String(f.telefono), { ...(leadsSubidos.get(String(f.telefono)) || {}), ...f });
  }
  return comoRespuesta(201, null);
}
globalThis.fetch = async (url, opciones = {}) => {
  if (String(url).startsWith('https://de-mentira.supabase.co/')) return alSupabase(url, opciones);
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + url);
  pedidos.push({ body: JSON.parse(opciones.body) });
  const paso = pasos[pedidos.length - 1];
  if (paso === undefined) throw new Error('el guion no tiene un paso para el pedido ' + pedidos.length);
  return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
};

// ------------------------------------------------------------------ el bot, sin red
const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
const filasDeLeads = [];
sheets.registrarLead = async (lead, opciones = {}) => {
  filasDeLeads.push({ lead, hoja: opciones.hoja || 'LEADS' });
};
const gemini = require('../src/gemini');
gemini.usarSoloLocal(true);
// Los audios: Gemini y la descarga son de mentira; la transcripción es lo que diga `transcripcion`.
let transcripcion = '';
gemini.transcribir = async () => transcripcion;
const evolution = require('../src/evolution');
const aClientes = [];
const alGrupo = [];
let idEnvio = 0;
const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
let envioSinId = false; // Evolution recibe el envío pero no devuelve el id: no se sabe si le llegó
evolution.enviarTexto = async (numero, t) => {
  aClientes.push({ numero, texto: t });
  return envioSinId ? {} : respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero, ruta, pie) => {
  aClientes.push({ numero, texto: pie, tipo: 'documento' });
  return respuestaEvolution(numero);
};
evolution.mostrarEscribiendo = async () => {};
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });
evolution.base64DeMedia = async () => ({ base64: 'AAAA', mimetype: 'audio/ogg' });
evolution.buscarMensajesDeChat = async () => [];

const bot = require('../src/index');
const state = require('../src/state');
const config = require('../src/config');
const control = require('../src/control');
const panel = require('../src/panel-chiara');
const promoMadre = require('../src/promo-madre');
const acciones = require('../src/acciones');

let n = 0;
const nuevoChat = () => '54900003' + String(++n).padStart(5, '0') + '@s.whatsapp.net';
const num = (chat) => chat.split('@')[0];
let nId = 0;
const escrito = (chat, t, extra = {}) => ({ key: { remoteJid: chat, fromMe: false, id: 'P' + ++nId }, pushName: 'Lucia', message: { conversation: t }, ...extra });
const aEste = (chat) => aClientes.filter((m) => m.numero === chat).map((m) => m.texto);
const avisosDe = (chat) => alGrupo.filter((t) => t.includes(num(chat)));
const leadDe = (chat) => leadsSubidos.get(num(chat));
const hablo = async (chat, t, extra) => {
  await bot.procesar(escrito(chat, t, extra));
  await dormir(80);
};
/** El panel sube los leads: lo que quedó en bot_leads para este chat. */
async function subido(chat) {
  await panel.vuelta();
  return leadDe(chat);
}

// El reloj de mentira: la hora de Argentina que se diga, corriendo con el reloj real. Nunca depende del día de hoy.
const relojReal = Date.now.bind(Date);
async function conFecha(iso, fn) {
  const base = Date.parse(iso);
  const desde = relojReal();
  Date.now = () => base + (relojReal() - desde);
  try {
    return await fn();
  } finally {
    Date.now = relojReal;
  }
}
const VIGENTE = '2026-10-14T15:00:00-03:00';
const VENCIDA = '2026-10-19T15:00:00-03:00';

const MENSAJES = {
  mama: 'Hola! Vengo por la promo MAMÁ',
  cuotas: 'Hola! Vengo por la promo MAMÁ - CUOTAS',
  canje: 'Hola! Vengo por la promo MAMÁ - CANJE',
  hermanos: 'Hola! Vengo por la promo MAMÁ - HERMANOS',
  regalo: 'Hola! Vengo por la promo MAMÁ - REGALO',
  libre: 'vi lo del 10% para el dia de la madre, cuanto el 13?',
};

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 4).join(' | ') : e));
  } finally {
    Date.now = relojReal;
    envioSinId = false;
    config.cerebro.modo = 'todos';
    aClientes.length = 0;
    alGrupo.length = 0;
    filasDeLeads.length = 0;
  }
}

/** Lo que tiene que cumplir todo chat que cae en la promo, con Sonnet o con el bot de siempre. */
function esDeLaPromo(chat, { motivo }) {
  assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO], 'tenía que decir solo el saludo: ' + JSON.stringify(aEste(chat)));
  assert.ok(!aEste(chat).some((t) => /\$|📱|\d{3}\.\d{3}/.test(t)), 'cotizó o pasó la lista');
  assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
  const avisos = avisosDe(chat);
  assert.strictEqual(avisos.length, 1, 'tenía que avisar al grupo una vez: ' + JSON.stringify(avisos));
  assert.ok(avisos[0].includes(`Motivo: ${motivo}`), 'el aviso no trae el motivo: ' + avisos[0]);
  const s = state.obtener(chat);
  assert.ok(control.callado(s), 'el chat no quedó escalado y callado');
  assert.strictEqual(s.escaladoMotivo, motivo);
  const filas = filasDeLeads.filter((f) => f.lead.estado === 'ESCALADO - ' + motivo);
  assert.strictEqual(filas.length, 1, 'tenía que anotar una fila en LEADS: ' + JSON.stringify(filasDeLeads));
  assert.strictEqual(filas[0].hoja, 'LEADS');
}

(async () => {
  let termino = false;
  process.on('exit', (codigo) => {
    if (!termino && codigo === 0) {
      console.log('\nFALLA: la prueba no llegó al final (una promesa quedó colgada)\n');
      process.exitCode = 1;
    }
  });

  console.log('\nA. El módulo\n');

  await check('1. los cinco mensajes de ManyChat: la palabra y el anuncio_id (sin tilde: "madre-mama" entra en el CHECK); el saludo es el que dijo Tomás', () => {
    assert.strictEqual(promoMadre.SALUDO, 'Hola! Gracias por escribirnos 💐 Ya te paso con Tomi o Fran para la promo del Día de la Madre.');
    const casos = [
      [MENSAJES.mama, 'MAMÁ', 'madre-mama'],
      [MENSAJES.cuotas, 'CUOTAS', 'madre-cuotas'],
      [MENSAJES.canje, 'CANJE', 'madre-canje'],
      [MENSAJES.hermanos, 'HERMANOS', 'madre-hermanos'],
      [MENSAJES.regalo, 'REGALO', 'madre-regalo'],
    ];
    for (const [texto, palabra, anuncioId] of casos) {
      const p = promoMadre.deMensaje(texto, Date.parse(VIGENTE));
      assert.ok(p, 'no la reconoció: ' + texto);
      assert.strictEqual(p.palabra, palabra);
      assert.strictEqual(p.anuncioId, anuncioId);
      assert.strictEqual(p.motivo, `Promo Día de la Madre — ${palabra}`);
      assert.ok(ANUNCIO_VALIDO.test(p.anuncioId), 'el anuncio_id no entra en el CHECK: ' + p.anuncioId);
    }
  });

  await check('2. la palabra se lee igual en minúscula, sin tilde, sin espacios o con otro guion', () => {
    for (const texto of ['hola, vengo por la promo mama - cuotas', 'PROMO MAMA - CUOTAS', 'promo mamá-cuotas', 'Promo MAMÁ – CUOTAS', 'promo mamá — cuotas', 'Hola! Vengo por la promo MAMÁ - CUOTAS 💐']) {
      const p = promoMadre.deMensaje(texto, Date.parse(VIGENTE));
      assert.ok(p && p.palabra === 'CUOTAS' && p.anuncioId === 'madre-cuotas', texto + ' -> ' + JSON.stringify(p));
    }
  });

  await check('3. sin palabra ("10%", "10 %", "diez por ciento", "Día de la Madre", "descuento de Instagram"): motivo "sin palabra" y anuncio "madre"', () => {
    const textos = [
      MENSAJES.libre,
      'tienen un 10 % de descuento en el 13?',
      'me dijeron que hay diez por ciento de descuento',
      'Hola, quiero algo para el Día de la Madre',
      'quiero el descuento de Instagram',
      'Día de las Madres, ¿qué tienen?',
      'tienen el 13 con 10% off?',
    ];
    for (const texto of textos) {
      const p = promoMadre.deMensaje(texto, Date.parse(VIGENTE));
      assert.ok(p, 'no la reconoció: ' + texto);
      assert.strictEqual(p.palabra, null, texto);
      assert.strictEqual(p.motivo, 'Promo Día de la Madre — sin palabra');
      assert.strictEqual(p.anuncioId, 'madre');
      assert.ok(ANUNCIO_VALIDO.test(p.anuncioId));
    }
  });

  await check('4. lo que NO es de la promo: un precio, la batería al 100%, el 110%, el 1,10%, o lo que citó el cliente', () => {
    const textos = [
      'cuanto el 13 de 128?',
      'el 13 de 128 con bateria al 100%',
      'tiene 110% de rendimiento?',
      'la tasa es 1,10% mensual',
      'tenes el 10?',
      'mi hermano tiene un 12 pro y yo quiero la promo de cuotas',
      'hola, buenas tardes',
      '[responde a: financiado tiene 10% de recargo] dale, el 13',
      '[responde a: Día de la Madre] quiero el 13',
    ];
    for (const texto of textos) assert.strictEqual(promoMadre.deMensaje(texto, Date.parse(VIGENTE)), null, texto);
    assert.strictEqual(promoMadre.anuncioDe('cuanto el 13 de 128?', Date.parse(VIGENTE)), null);
  });

  await check('5. la fecha: vale hasta el 18/10/2026 a las 23:59 de Argentina; desde el 19/10 no', () => {
    assert.strictEqual(promoMadre.PROMO_MADRE_HASTA, Date.parse('2026-10-19T02:59:59.999Z'), 'las 23:59:59 del 18/10 en Argentina son las 02:59:59 UTC del 19/10');
    const texto = MENSAJES.cuotas;
    assert.ok(promoMadre.deMensaje(texto, Date.parse('2026-10-12T00:00:00-03:00')), 'el 12/10 a las 00:00 ya vale');
    assert.ok(promoMadre.deMensaje(texto, Date.parse('2026-10-18T23:59:00-03:00')), 'a las 23:59 del 18/10 todavía vale');
    assert.ok(promoMadre.deMensaje(texto, Date.parse('2026-10-18T23:59:59-03:00')), 'a las 23:59:59 del 18/10 todavía vale');
    assert.strictEqual(promoMadre.deMensaje(texto, Date.parse('2026-10-19T00:00:00-03:00')), null, 'a las 00:00 del 19/10 ya no vale');
    assert.strictEqual(promoMadre.deMensaje(texto, Date.parse('2026-11-02T12:00:00-03:00')), null);
    assert.strictEqual(promoMadre.anuncioDe(texto, Date.parse('2026-10-19T00:00:00-03:00')), null);
    assert.strictEqual(promoMadre.vigente(Date.parse('2026-10-18T12:00:00-03:00')), true);
    assert.strictEqual(promoMadre.vigente(Date.parse('2026-10-19T12:00:00-03:00')), false);
  });

  console.log('\nB. De punta a punta: escala, no cotiza\n');
  assert.ok(bot.arrancarPanel({ sinTimers: true }), 'el panel no arrancó');

  for (const modo of ['todos', 'apagado']) {
    const quien = modo === 'todos' ? 'con Sonnet' : 'con el bot de siempre';

    await check(`6. ${quien}: "Hola! Vengo por la promo MAMÁ - CUOTAS" -> saluda, escala, no cotiza, aviso con "CUOTAS", LEADS y bot_leads "madre-cuotas"`, async () => {
      await conFecha(VIGENTE, async () => {
        config.cerebro.modo = modo;
        guion();
        const chat = nuevoChat();
        await hablo(chat, MENSAJES.cuotas);
        esDeLaPromo(chat, { motivo: 'Promo Día de la Madre — CUOTAS' });
        const l = await subido(chat);
        assert.ok(l, 'el panel no subió el lead');
        assert.strictEqual(l.anuncio_id, 'madre-cuotas');
        assert.strictEqual(l.escalado, true);
        assert.strictEqual(l.escalado_motivo, 'Promo Día de la Madre — CUOTAS');
      });
    });

    await check(`7. ${quien}: "Hola! Vengo por la promo MAMÁ" -> escala, aviso con "MAMÁ", anuncio "madre-mama"`, async () => {
      await conFecha(VIGENTE, async () => {
        config.cerebro.modo = modo;
        guion();
        const chat = nuevoChat();
        await hablo(chat, MENSAJES.mama);
        esDeLaPromo(chat, { motivo: 'Promo Día de la Madre — MAMÁ' });
        assert.strictEqual((await subido(chat)).anuncio_id, 'madre-mama');
      });
    });

    await check(`8. ${quien}: CANJE, HERMANOS y REGALO llevan su palabra al aviso y al anuncio`, async () => {
      await conFecha(VIGENTE, async () => {
        config.cerebro.modo = modo;
        for (const [clave, palabra] of [['canje', 'CANJE'], ['hermanos', 'HERMANOS'], ['regalo', 'REGALO']]) {
          guion();
          alGrupo.length = 0;
          aClientes.length = 0;
          filasDeLeads.length = 0;
          const chat = nuevoChat();
          await hablo(chat, MENSAJES[clave]);
          esDeLaPromo(chat, { motivo: `Promo Día de la Madre — ${palabra}` });
          assert.strictEqual((await subido(chat)).anuncio_id, 'madre-' + palabra.toLowerCase());
        }
      });
    });

    await check(`9. ${quien}: "vi lo del 10% para el dia de la madre, cuanto el 13?" -> escala sin cotizar, "sin palabra", anuncio "madre"`, async () => {
      await conFecha(VIGENTE, async () => {
        config.cerebro.modo = modo;
        guion();
        const chat = nuevoChat();
        await hablo(chat, MENSAJES.libre);
        esDeLaPromo(chat, { motivo: 'Promo Día de la Madre — sin palabra' });
        assert.strictEqual((await subido(chat)).anuncio_id, 'madre');
      });
    });
  }

  await check('10. la promo vale "cualquiera" de los mensajes: un cliente que ya venía charlando y después dice "lo del 10%"', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      const chat = nuevoChat();
      guion(responde(['hola! contame que equipo buscas']));
      await hablo(chat, 'hola, buenas');
      assert.strictEqual(pedidos.length, 1, 'el primer mensaje no es de la promo: contesta Sonnet');
      assert.strictEqual((await subido(chat)).anuncio_id, null);
      guion();
      alGrupo.length = 0;
      aClientes.length = 0;
      await hablo(chat, 'vi lo del 10% en instagram');
      assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO]);
      assert.ok(avisosDe(chat)[0].includes('Motivo: Promo Día de la Madre — sin palabra'), avisosDe(chat)[0]);
      assert.strictEqual((await subido(chat)).anuncio_id, 'madre', 'el origen se anota cuando aparece la promo');
    });
  });

  console.log('\nC. Desde el 19/10 y sin promo: el flujo de siempre\n');

  await check('11. con Sonnet, el mismo mensaje con la fecha simulada al 19/10: lo contesta Sonnet, no escala, no hay origen', async () => {
    await conFecha(VENCIDA, async () => {
      config.cerebro.modo = 'todos';
      for (const texto of [MENSAJES.libre, MENSAJES.cuotas]) {
        guion(responde(['dale, contame que equipo buscas y con cuanto entras']));
        alGrupo.length = 0;
        aClientes.length = 0;
        const chat = nuevoChat();
        await hablo(chat, texto);
        assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet: ' + texto);
        // Sonnet puede abrir con el saludo del día ("Hola luciaa! como andas?"): lo que importa es que contestó lo suyo y no la promo.
        assert.ok(aEste(chat).some((m) => /contame que equipo buscas y con cuanto entras/i.test(m)), JSON.stringify(aEste(chat)));
        assert.ok(!aEste(chat).includes(promoMadre.SALUDO), 'saludó por la promo vencida');
        assert.ok(!avisosDe(chat).some((t) => /Promo Día de la Madre/.test(t)), 'avisó por la promo vencida');
        assert.ok(!control.callado(state.obtener(chat)), 'el chat quedó escalado');
        assert.strictEqual((await subido(chat)).anuncio_id, null, 'anotó el origen de una promo vencida');
        assert.strictEqual(filasDeLeads.length, 0);
      }
    });
  });

  await check('12. con el bot de siempre, el mismo mensaje con la fecha simulada al 19/10: cotiza o pregunta como siempre, sin saludo ni escalado', async () => {
    await conFecha(VENCIDA, async () => {
      config.cerebro.modo = 'apagado';
      guion();
      const chat = nuevoChat();
      await hablo(chat, MENSAJES.libre);
      const dicho = aEste(chat);
      assert.ok(dicho.length > 0, 'no contestó nada');
      assert.ok(!dicho.includes(promoMadre.SALUDO), 'saludó por la promo vencida');
      assert.ok(!dicho.some((t) => /Tomi o Fran|Día de la Madre/.test(t)), 'habló de la promo: ' + JSON.stringify(dicho));
      assert.ok(!avisosDe(chat).some((t) => /Promo Día de la Madre/.test(t)), 'avisó por la promo vencida');
      assert.ok(!control.callado(state.obtener(chat)), 'el chat quedó escalado');
      assert.strictEqual((await subido(chat)).anuncio_id, null);
    });
  });

  await check('13. "cuanto el 13 de 128?" sin promo (vigente): flujo normal con Sonnet y con el bot de siempre', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      guion(responde(['te paso el precio del 13, ¿con cuanto entras?']));
      const a = nuevoChat();
      await hablo(a, 'cuanto el 13 de 128?');
      assert.strictEqual(pedidos.length, 1, 'no le preguntó a Sonnet');
      assert.ok(!control.callado(state.obtener(a)));
      assert.ok(!avisosDe(a).length, 'avisó al grupo: ' + JSON.stringify(avisosDe(a)));
      assert.strictEqual((await subido(a)).anuncio_id, null);

      config.cerebro.modo = 'apagado';
      guion();
      const b = nuevoChat();
      await hablo(b, 'cuanto el 13 de 128?');
      const dicho = aEste(b);
      assert.ok(dicho.length > 0 && !dicho.includes(promoMadre.SALUDO), JSON.stringify(dicho));
      assert.ok(!control.callado(state.obtener(b)));
      assert.ok(!avisosDe(b).some((t) => /Promo/.test(t)));
      assert.strictEqual((await subido(b)).anuncio_id, null);
    });
  });

  console.log('\nD. Lo que se cuida aparte\n');

  await check('13b. un audio que dice lo del 10%: se transcribe, escala como la promo y el panel anota el origen (el texto escrito no estaba)', async () => {
    // Con `usarSoloLocal(true)` la transcripción está apagada (audio.activo): acá se enciende, con Gemini de mentira.
    const soloLocalAntes = gemini.esSoloLocal();
    gemini.usarSoloLocal(false);
    try {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      guion();
      transcripcion = 'hola, vi lo del 10% del dia de la madre, tienen el 13?';
      const audio = (chat) => ({ key: { remoteJid: chat, fromMe: false, id: 'AU' + ++nId }, pushName: 'Lucia', message: { audioMessage: { mimetype: 'audio/ogg; codecs=opus', seconds: 5, ptt: true } } });
      const chat = nuevoChat();
      await bot.procesar(audio(chat));
      await dormir(120);
      assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO]);
      assert.ok(avisosDe(chat)[0].includes('Motivo: Promo Día de la Madre — sin palabra'), avisosDe(chat)[0]);
      assert.strictEqual((await subido(chat)).anuncio_id, 'madre', 'el panel no anotó el origen de la promo dicha por audio');
      // Y un audio de un lead que ya venía de un anuncio no le saca el lugar.
      const otro = nuevoChat();
      const deAnuncio = { message: { extendedTextMessage: { text: 'hola, vi el anuncio', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: '120218888888888888' } } } } };
      guion(responde(['hola! contame']));
      await hablo(otro, 'hola, vi el anuncio', deAnuncio);
      guion();
      await bot.procesar(audio(otro));
      await dormir(120);
      assert.deepStrictEqual(aEste(otro).slice(-1), [promoMadre.SALUDO]);
      assert.strictEqual((await subido(otro)).anuncio_id, '120218888888888888');
    });
    } finally {
      gemini.usarSoloLocal(soloLocalAntes);
    }
  });

  await check('13c. el tester que prueba la promo: escala a LEADS_PRUEBA y el panel no lo anota ni lo sube', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      guion();
      const chat = TESTER + '@s.whatsapp.net';
      await hablo(chat, MENSAJES.cuotas);
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO]);
      assert.strictEqual(filasDeLeads.length, 1);
      assert.strictEqual(filasDeLeads[0].hoja, 'LEADS_PRUEBA', 'el tester tiene que ir a LEADS_PRUEBA');
      await panel.vuelta();
      const claves = Object.keys(panel.datos().leads);
      assert.ok(!claves.includes(TESTER) && !claves.includes('null') && !claves.includes('undefined'), 'el panel anotó al tester: ' + claves.slice(-3));
      assert.ok(!leadsSubidos.has(TESTER), 'subió al tester');
    });
  });

  await check('14. el saludo sale una sola vez por chat: si la promo vuelve tras un escalado resuelto, escala sin decirle nada', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      guion();
      const chat = nuevoChat();
      await hablo(chat, MENSAJES.mama);
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO]);
      assert.ok(state.obtener(chat).historial.some((l) => l.quien === 'vendedor' && l.texto === promoMadre.SALUDO), 'el saludo no quedó en el historial');
      assert.ok(state.obtener(chat).promoMadreSaludo > 0, 'no quedó la marca del saludo');
      // Mientras sigue escalado, el bot calla: ni saludo ni aviso nuevo.
      await hablo(chat, 'hola? vi lo del 10%');
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO], 'volvió a hablar con el chat escalado');
      // Tomás lo resolvió y el cliente vuelve con la promo, después de una charla larga: el historial solo recuerda las
      // últimas líneas (LARGO_HISTORIAL) y el saludo ya no está ahí.
      state.actualizar(chat, { escalado: false, escaladoCalla: true, historial: [] });
      assert.ok(!state.obtener(chat).historial.some((l) => l.texto === promoMadre.SALUDO), 'el caso no prueba nada: el saludo sigue en el historial');
      alGrupo.length = 0;
      await hablo(chat, 'che, y el 10% sigue? el 14 sale mas?');
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO], 'repitió el saludo: ' + JSON.stringify(aEste(chat)));
      assert.strictEqual(pedidos.length, 0, 'le preguntó a Sonnet');
      const avisos = avisosDe(chat);
      assert.strictEqual(avisos.length, 1, JSON.stringify(avisos));
      assert.ok(/SIN RESPUESTA/.test(avisos[0]) && avisos[0].includes('Motivo: Promo Día de la Madre — sin palabra'), avisos[0]);
      assert.ok(control.callado(state.obtener(chat)), 'no quedó escalado de nuevo');
    });
  });

  await check('15. el saludo viaja con su marca: sin marca en el chat sale con ella; con la marca, no sale', () => {
    const promo = promoMadre.deMensaje(MENSAJES.cuotas, Date.parse(VIGENTE));
    const primero = promoMadre.resultado(promo, {}, 12345);
    assert.strictEqual(primero.mensajes.length, 1);
    assert.strictEqual(acciones.comoTexto(primero.mensajes[0]), promoMadre.SALUDO);
    assert.deepStrictEqual(acciones.marcasDe(primero.mensajes[0]), { promoMadreSaludo: 12345 });
    for (const sinMarca of [undefined, null, {}, { historial: [{ quien: 'vendedor', texto: promoMadre.SALUDO }] }]) {
      assert.strictEqual(promoMadre.resultado(promo, sinMarca).mensajes.length, 1, 'el historial no cuenta, solo la marca confirmada');
    }
    assert.deepStrictEqual(promoMadre.resultado(promo, { promoMadreSaludo: 12345 }).mensajes, []);
    const r = promoMadre.resultado(promo, {});
    assert.strictEqual(r.escalar, true);
    assert.strictEqual(r.motivo, 'Promo Día de la Madre — CUOTAS');
  });

  await check('15b. un saludo que Evolution no confirmó (sin id) no deja la marca: la próxima vez se repite', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      guion();
      const chat = nuevoChat();
      envioSinId = true;
      await hablo(chat, MENSAJES.mama);
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO], 'tenía que intentar el saludo');
      assert.ok(!state.obtener(chat).promoMadreSaludo, 'marcó el saludo como dicho sin saber si llegó');
      envioSinId = false;
      state.actualizar(chat, { escalado: false, escaladoCalla: true });
      aClientes.length = 0;
      await hablo(chat, 'y el 10%?');
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO], 'no se lo volvió a decir aunque el primero no llegó');
      assert.ok(state.obtener(chat).promoMadreSaludo > 0);
    });
  });

  await check('15c. en un chat en sombra (lo atiende el bot de siempre), la promo no se piensa en sombra: Sonnet no corre; sin promo, sí', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'sombra';
      const normal = nuevoChat();
      guion(responde(['sombra: contame que buscas']));
      await hablo(normal, 'cuanto el 13 de 128?');
      assert.strictEqual(pedidos.length, 1, 'el control no prueba nada: sin promo, la sombra tenía que pensar');
      const chat = nuevoChat();
      guion();
      await hablo(chat, MENSAJES.cuotas);
      assert.strictEqual(pedidos.length, 0, 'la sombra le preguntó a Sonnet por un mensaje de la promo');
      assert.deepStrictEqual(aEste(chat), [promoMadre.SALUDO]);
      assert.ok(avisosDe(chat)[0].includes('Motivo: Promo Día de la Madre — CUOTAS'));
    });
  });

  await check('16. "batería al 100%" o "110%" no son la promo; lo que citó el cliente tampoco, de punta a punta', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      for (const texto of ['el 13 de 128 con bateria al 100%?', '[responde a: tiene 10% de recargo] ok, dale el 13']) {
        guion(responde(['dale, ¿con cuanto entras?']));
        alGrupo.length = 0;
        aClientes.length = 0;
        const chat = nuevoChat();
        await hablo(chat, texto);
        assert.strictEqual(pedidos.length, 1, 'no era de la promo y no le preguntó a Sonnet: ' + texto);
        assert.ok(!avisosDe(chat).some((t) => /Promo/.test(t)), texto);
        assert.strictEqual((await subido(chat)).anuncio_id, null, texto);
      }
    });
  });

  await check('17. un anuncio de verdad no se pisa: el primero que aparece se queda (también si la promo llega después)', async () => {
    await conFecha(VIGENTE, async () => {
      config.cerebro.modo = 'todos';
      guion(responde(['hola! contame']));
      const chat = nuevoChat();
      const deAnuncio = { message: { extendedTextMessage: { text: 'hola, vi el anuncio', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: '120211234567890123' } } } } };
      await hablo(chat, 'hola, vi el anuncio', deAnuncio);
      assert.strictEqual((await subido(chat)).anuncio_id, '120211234567890123');
      guion();
      await hablo(chat, 'y lo del 10%?');
      assert.strictEqual((await subido(chat)).anuncio_id, '120211234567890123', 'la promo pisó el anuncio de Meta');
      // La promo igual escala: el aviso lleva la palabra.
      assert.ok(avisosDe(chat).some((t) => t.includes('Motivo: Promo Día de la Madre — sin palabra')));
      // Y si el mismo mensaje trae el anuncio y habla de la promo, gana el anuncio: el panel de Meta cuenta los leads por su id.
      const otro = nuevoChat();
      const conAmbos = { message: { extendedTextMessage: { text: 'hola, quiero el 10% del dia de la madre', contextInfo: { externalAdReply: { sourceType: 'ad', sourceId: '120219999999999999' } } } } };
      guion();
      await hablo(otro, 'hola, quiero el 10% del dia de la madre', conAmbos);
      assert.strictEqual((await subido(otro)).anuncio_id, '120219999999999999', 'la promo le sacó el lugar al anuncio de Meta');
      assert.deepStrictEqual(aEste(otro), [promoMadre.SALUDO], 'igual es de la promo: saluda y escala');
    });
  });

  termino = true;
  console.log(fallos ? `\n${fallos} prueba(s) fallaron\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
