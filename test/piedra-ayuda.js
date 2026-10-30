'use strict';
/**
 * Lo que comparten los tests de Piedra que cargan index.js (poda de iPhone, 19/10/2026): el entorno fijado
 * acá (nunca se lee el .env: dotenv no pisa lo que ya está puesto), un Sonnet de mentira que contesta como
 * la API de Anthropic (tool_use de `responder` o `escalar`) y un Evolution de mentira que anota lo que se
 * habría mandado. Nunca sale a la red: cualquier fetch que no sea a la API de Anthropic tira.
 *
 *   const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
 *   p.sonnet.guion(p.sonnet.responde(['hola!']));
 *   await p.bot.procesar(p.mensaje('5490000000001', 'hola'));
 *   p.aClientes  // [{ numero, texto }]
 *
 * Tiene que requerirse ANTES que cualquier archivo de src/. ESTADO_PATH y APRENDIZAJE_PATH van a una
 * carpeta temporal que se borra al salir.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const GRUPO = '120363000000000099@g.us';

function preparar(entorno = {}) {
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'piedra-test-'));
  Object.assign(process.env, {
    ESPERA_MIN_MS: '5',
    ESPERA_MAX_MS: '6',
    ENTRE_MENSAJES_MS: '1',
    GEMINI_API_KEY: '',
    GEMINI_MODEL: 'principal-de-prueba',
    GEMINI_MODEL_RESPALDO: 'respaldo-de-prueba',
    MODO_BORRADOR: 'false',
    MODO_ESCUCHA: 'false',
    NUMEROS_PRUEBA: '',
    NUMEROS_TESTER: '',
    NUMEROS_PILOTO: '',
    SOLO_CHATS_NUEVOS: '',
    CONTACTOS_PERSONALES: '',
    GRUPO_AVISOS_JID: GRUPO,
    SILENCIO_TRAS_HUMANO_MIN: '45',
    IGNORAR_ANTERIORES_SEG: '120',
    DATOS_VIEJOS_HORAS: '72',
    ESCALADO_RECORDATORIO_MIN: '30',
    ESCALADO_REANUDAR_HORAS: '24',
    SEGUIMIENTO_HORA_DESDE: '0',
    SEGUIMIENTO_HORA_HASTA: '24',
    RECORDATORIO_HORA: '0',
    GUARDIAN_ACTIVO: 'false',
    AUDIO_ACTIVO: 'false',
    WEBHOOK_SECRETO: '',
    WEBHOOK_MAX_POR_MINUTO: '600',
    HOST: '',
    FOTOS_DIR: path.join(TMP, 'fotos'),
    DOCS_DIR: path.join(TMP, 'documentos'),
    GENERADOS_DIR: path.join(TMP, 'generados'),
    EVOLUTION_INSTANCE: 'somospiedra',
    EVOLUTION_APIKEY: 'clave-de-mentira',
    ESTADO_PATH: path.join(TMP, 'estado.json'),
    APRENDIZAJE_PATH: path.join(TMP, 'aprendizaje.jsonl'),
    INTERRUPTOR_PATH: path.join(TMP, 'interruptor.json'),
    CEREBRO_MODO: 'todos',
    CEREBRO_SOMBRA_PERSONA_HASTA: '',
    ANTHROPIC_API_KEY: 'clave-de-mentira',
    CEREBRO_MODELO: 'claude-sonnet-5-5',
    CEREBRO_TIMEOUT_MS: '200',
    ...entorno,
  });
  process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

  // -------------------------------------------------------------------------
  // Sonnet de mentira: una cola de pasos (lo que contesta cada pedido) y uno por defecto.
  // -------------------------------------------------------------------------
  let idHerramienta = 0;
  const usar = (name, input) => ({ type: 'tool_use', id: 'toolu_' + ++idHerramienta, name, input });
  const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 };
  const sonnet = {
    pedidos: [],
    pasos: [],
    porDefecto: null,
    usar,
    responde: (mensajes) => [usar('responder', { mensajes })],
    escala: (motivo) => [usar('escalar', { motivo })],
    falla: (status = 500) => ({ status }),
    timeout: () => ({ timeout: true }),
    /** Los pasos de los pedidos que siguen, en orden; limpia los pedidos anotados. */
    guion(...pasos) {
      this.pasos = pasos;
      this.pedidos.length = 0;
    },
    /** El texto del pedido N (el contexto que armó el código). */
    textoDelPedido(i) {
      return this.pedidos[i].body.messages[0].content.map((b) => b.text || '').join('\n');
    },
  };
  const comoRespuesta = (status, cuerpo) => ({ ok: status >= 200 && status < 300, status, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) });
  globalThis.fetch = async (url, opciones = {}) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + url);
    sonnet.pedidos.push({ body: JSON.parse(opciones.body) });
    const paso = sonnet.pasos.length ? sonnet.pasos.shift() : sonnet.porDefecto;
    if (!paso) return comoRespuesta(500, { type: 'error', error: { type: 'api_error', message: 'el guion no tiene un paso para este pedido' } });
    if (paso.timeout) {
      return new Promise((_, rechazar) =>
        opciones.signal.addEventListener('abort', () => {
          const e = new Error('aborted');
          e.name = 'AbortError';
          rechazar(e);
        })
      );
    }
    if (paso.status) return comoRespuesta(paso.status, { type: 'error', error: { type: 'api_error', message: 'de mentira' } });
    return comoRespuesta(200, { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: paso, stop_reason: 'tool_use', usage: { ...USO } });
  };

  // -------------------------------------------------------------------------
  // Evolution de mentira
  // -------------------------------------------------------------------------
  const gemini = require('../src/gemini');
  gemini.usarSoloLocal(true);
  const evolution = require('../src/evolution');
  const aClientes = [];
  const alGrupo = [];
  let idEnvio = 0;
  const respuestaEvolution = (numero) => ({ key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio } });
  const real = { avisarGrupo: evolution.avisarGrupo };
  evolution.enviarTexto = async (numero, texto) => {
    aClientes.push({ numero, texto });
    return respuestaEvolution(numero);
  };
  evolution.enviarImagen = async (numero) => {
    aClientes.push({ numero, texto: '[imagen]' });
    return respuestaEvolution(numero);
  };
  evolution.enviarDocumento = async (numero) => {
    aClientes.push({ numero, texto: '[documento]' });
    return respuestaEvolution(numero);
  };
  evolution.mostrarEscribiendo = async () => {};
  // El aviso al grupo pasa por el candado de siempre (motivoBloqueoAvisos: escucha, sin destino, destino que
  // no es un grupo) y se anota en vez de salir.
  evolution.avisarGrupo = async (texto) => {
    const bloqueo = evolution.motivoBloqueoAvisos();
    if (bloqueo) return { bloqueado: true, motivo: bloqueo };
    alGrupo.push(texto);
    return { key: { id: 'GR' + ++idEnvio } };
  };
  evolution.estadoInstancia = async () => ({ state: 'open' });
  evolution.estadoDeLaInstancia = async () => ({ state: 'open' });
  evolution.buscarMensajesDeChat = async () => [];
  evolution.buscarMensajes = async () => [];

  const bot = require('../src/index');
  const state = require('../src/state');
  const config = require('../src/config');
  const cerebro = require('../src/cerebro');
  const aprendizaje = require('../src/aprendizaje');

  let idMensaje = 0;
  const jid = (numero) => (String(numero).includes('@') ? String(numero) : `${numero}@s.whatsapp.net`);
  /** Un messages.upsert de un cliente (o propio, con `fromMe`), con texto. */
  function mensaje(numero, texto, { id = null, fromMe = false, pushName = 'Cliente', ts = Date.now(), message = null } = {}) {
    return {
      key: { remoteJid: jid(numero), fromMe, id: id || 'M' + ++idMensaje },
      pushName,
      message: message || { conversation: texto },
      messageTimestamp: Math.floor(ts / 1000),
    };
  }
  /** Un mensaje escrito por la cuenta del negocio (una persona, o un comando). */
  const propio = (numero, texto, extra = {}) => mensaje(numero, texto, { ...extra, fromMe: true });
  /** Un comando escrito por la cuenta en el grupo interno. */
  const enElGrupo = (texto) => mensaje(GRUPO, texto, { fromMe: true });

  const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
  /** Espera hasta que `cond()` dé true (o hasta `ms`). */
  async function esperar(cond, ms = 3000) {
    const hasta = Date.now() + ms;
    while (Date.now() < hasta) {
      if (cond()) return true;
      await dormir(5);
    }
    return cond();
  }
  /** Los eventos del registro de aprendizaje de ese chat (por su clave), en orden. */
  function eventos(numero, tipo = null) {
    const clave = aprendizaje.clave(jid(numero));
    return aprendizaje.leerTodo().filter((e) => e && e.clave === clave && (!tipo || e.tipo === tipo));
  }
  /** Vacía lo anotado de Evolution y de Sonnet. */
  function limpiar() {
    aClientes.length = 0;
    alGrupo.length = 0;
    sonnet.guion();
  }

  // Un runner mínimo, como los de los otros tests: `check(nombre, fn)` y `fin()`.
  let fallos = 0;
  async function check(nombre, fn) {
    limpiar();
    try {
      await fn();
      console.log('  ok   ' + nombre);
    } catch (e) {
      fallos++;
      console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
    }
  }
  function fin() {
    console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
    process.exit(fallos ? 1 : 0);
  }

  return { GRUPO, TMP, bot, state, config, cerebro, evolution, aprendizaje, real, sonnet, aClientes, alGrupo, mensaje, propio, enElGrupo, jid, dormir, esperar, eventos, limpiar, check, fin };
}

module.exports = preparar;
