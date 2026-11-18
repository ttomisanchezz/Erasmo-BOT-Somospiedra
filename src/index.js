'use strict';
/**
 * Bot de WhatsApp — Somos Piedra (piedra natural, Neuquén).
 * Recibe los webhooks de Evolution API (instancia propia, compartida la API con Somos iPhone), guarda el
 * estado, junta tandas, respeta silencios, escalados y modos, y deja que Sonnet conteste (cerebro.js).
 *
 * Quién contesta lo decide CEREBRO_MODO (cerebro.quienAtiende): con `apagado` (lo normal) nadie contesta y
 * el bot solo escucha, guarda y registra. No hay "bot de siempre" (el motor de reglas de iPhone quedó en
 * _heredado-iphone/, poda del 19/10/2026): si Sonnet falla, silencio con el cliente y aviso al grupo.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const express = require('express');
const { AsyncLocalStorage } = require('async_hooks');
const config = require('./config');
// La instancia de Evolution (poda de iPhone, 19/10/2026): vacía o la de Somos iPhone, no arranca. Va antes
// de cargar el estado o cualquier módulo que hable con Evolution: no se conecta a nada.
{
  const problema = config.problemaDeInstancia(config.evolution.instancia);
  if (problema) {
    console.error(`[evolution] ${problema}. No arranco: el bot de Piedra solo usa su propia instancia. Corregí EVOLUTION_INSTANCE en el .env.`);
    process.exit(1);
  }
}
const state = cargarEstadoOSalir();
const evolution = require('./evolution');
const aprendizaje = require('./aprendizaje');
const audio = require('./audio');
const recordatorios = require('./recordatorios');
const ventas = require('./ventas');
// Lista de excluidos a mano (#excluir / #incluir / #excluidos): src/excluidos.js.
const excluidos = require('./excluidos');
const stockColores = require('./stock-colores');
const acciones = require('./acciones');
const autoria = require('./autoria');
const control = require('./control');
const guardian = require('./guardian');
const chatsViejos = require('./chats-viejos');
// Cerebro Sonnet: el único que contesta (con tester, nuevos o todos); con sombra piensa y lo anota.
const cerebro = require('./cerebro');
// Sonnet en sombra donde atiende una persona: ver src/sombra-persona.js.
const sombraPersona = require('./sombra-persona');
const cerebroComandos = require('./cerebro-comandos');
// Sonnet ve las fotos del cliente: con qué bajarlas y cómo (src/fotos-del-cliente.js).
const fotosDelCliente = require('./fotos-del-cliente');
// El historial que lee Sonnet se completa con Evolution (src/contexto.js).
const contexto = require('./contexto');
// El texto de un mensaje, compartido con contexto.js, y la línea "[foto]" de una foto sin epígrafe.
const { textoDelMensaje, marcadorSinTexto, LINEA_FOTO, esFotoDelCliente, conCita, sinCita } = require('./texto-del-mensaje');
const anuncio = require('./anuncio');
// El interruptor general (#apagar / #prender).
const interruptor = require('./interruptor');
const documentos = require('./documentos');
const seguimiento = require('./seguimiento');
const avisosCola = require('./avisos-cola');
// Tandas de chats sin contestar (#tanda) y reactivación de 2 mensajes (18/11/2026): src/tandas.js, src/reactivacion.js.
const tandas = require('./tandas');
const reactivacion = require('./reactivacion');
const lectura = require('./lectura-larga');
const { motivoQueNoCuenta } = require('./chats-elegibles');
// Acuses y agradecimientos: el barrido del silencio y #sigue no contestan solo eso.
const { esCierre } = require('./cierre');

/**
 * Carga el estado. Si el archivo existe y no se puede leer (EBUSY, EPERM, EACCES; state.js ya reintentó
 * y mostró el error grande), el bot NO arranca: si arrancara vacío, el primer guardado pisaría
 * `data/estado.json`. Cualquier otro error al cargar el módulo se tira como siempre.
 */
function cargarEstadoOSalir() {
  try {
    return require('./state');
  } catch (e) {
    if (e.name !== 'EstadoIlegible') throw e;
    console.error('[estado] no pude leer el estado, no arranco para no pisarlo: ' + e.message);
    process.exit(1);
  }
}

const app = express();
app.disable('x-powered-by');
// El JSON no se lee para cualquier pedido: solo en el webhook, después del secreto y del tope.

// Tandas de mensajes por chat (ver atenderChat).
//  - enProceso: el chat tiene una tanda esperando, interpretándose o mandándose.
//  - pendientes: las líneas del historial que todavía no se interpretaron, en el orden en que llegaron.
//  - transcripciones: la transcripción en curso de cada línea de audio.
//  - datosDeLinea: el id de WhatsApp de cada línea del cliente, si había una persona atendiendo cuando
//    llegó y `imagen` ({ key, mimetype }) si es una foto, para que la vea Sonnet. El barrido del silencio y
//    #sigue la reemplazan con su `origen` (`encolarSinContestar`).
//  - tandaEnCurso: de qué chat y de qué generación es la tanda que corre en este hilo asíncrono. state.js
//    la consulta en cada lectura o escritura del chat: una tanda de antes de un #reset no escribe ni manda.
const enProceso = new Set();
const pendientes = new Map();
const transcripciones = new WeakMap();
const datosDeLinea = new WeakMap();
// Una línea que llega sin `key.id` (Evolution siempre lo manda) igual necesita uno.
let lineasSinId = 0;
const tandaEnCurso = new AsyncLocalStorage();
state.vigilarTandas((chatId) => {
  const t = tandaEnCurso.getStore();
  return t && t.chatId === chatId ? t.generacion : null;
});

/** Lo que recibe el tester después de su #reset. Su eco se reconoce como cualquier envío del bot. */
const AVISO_RESET = '🔄 Reiniciado';

/** El #reset del tester y sus typos. Solo desde NUMEROS_TESTER. */
const RE_RESET_TESTER = /^#(reset|resset|reseet|rest)\b/i;

/**
 * Cortes seguidos de una tanda porque el cliente escribió en medio (ver atenderChat). Pasado este número,
 * la tanda sale entera aunque llegue otro mensaje: un cliente que escribe sin parar no se queda sin respuesta.
 */
const MAX_CORTES_SEGUIDOS = 2;
const MENSAJE_NUEVO = 'llegó un mensaje nuevo del cliente';

/**
 * Techo de una tanda, en caracteres. Si una tanda se pasa, se corta ahí y el resto va en la siguiente, en
 * orden y con su propia espera. Un solo mensaje más largo que el techo va igual, entero.
 */
const TECHO_TANDA = 700;

// Los JID de grupo ya vistos, para anotarlos una sola vez por arranque (sirve para sacar GRUPO_AVISOS_JID).
const gruposVistos = new Set();

// Chats sin número (@lid): cuándo se avisó por última vez de cada uno. En memoria: después de un reinicio
// puede salir un aviso de más, nunca uno de menos.
const avisosSinNumero = new Map();
const AVISO_SIN_NUMERO_CADA_MS = 24 * 60 * 60 * 1000;
const HORA_ARGENTINA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Un pedido del catálogo de WhatsApp (`orderMessage`) sin texto. Devuelve el nombre del producto ('' si no
 * viene), o null si no es un pedido.
 */
function pedidoDelCatalogo(m) {
  const pedido = m?.message?.orderMessage;
  if (!pedido || textoDelMensaje(m)) return null;
  return String(pedido.orderTitle || '').trim();
}

/** Una foto (o un álbum) que llegó sin texto: `textoDelMensaje` da ''. */
function esFotoSinTexto(m) {
  const msg = m?.message || {};
  return Boolean(msg.imageMessage || msg.albumMessage) && !textoDelMensaje(m);
}

function esperaAleatoria() {
  const { esperaMinMs, esperaMaxMs } = config.ritmo;
  return esperaMinMs + Math.floor(Math.random() * Math.max(1, esperaMaxMs - esperaMinMs));
}

/** La espera de una tanda que se rearma porque el cliente escribió en medio de la respuesta: un tercio. */
function esperaTrasCorte() {
  return Math.round(esperaAleatoria() / 3);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** ¿Es de antes de arrancar? Al vincular el QR, WhatsApp manda el historial entero. */
function esViejo(data) {
  const ts = Number(data?.messageTimestamp?.low ?? data?.messageTimestamp ?? 0);
  return ts > 0 && Date.now() / 1000 - ts > config.ignorarAnterioresSeg;
}

/**
 * Lo único que el código le dice al cliente cuando Erasmo le pasa el chat al equipo (decisión de Tomás y Fran,
 * 16/11/2026): este texto exacto, UNA vez por escalado y a cualquier hora. No lo escribe Sonnet (su guardia no
 * cambió y este envío no pasa por ella): lo manda `escalarEnSilencio`.
 */
const AVISO_ESCALADO = 'Enseguida te respondemos.';

/**
 * El aviso de un escalado al grupo interno (en Piedra no hay planilla de leads: el lead queda acá).
 * `silencio`: al cliente no se le contestó nada. `borrador`: lo que habría recibido (modo borrador o
 * fuera de las listas); en un escalado van los dos: el 🔕 y, marcado BORRADOR, el mensaje fijo que no salió.
 */
function avisoParaGrupo({ chatId, nombre, motivo, borrador, silencio }) {
  const num = chatId.split('@')[0];
  const lineas = [`${silencio ? '🔕 SIN RESPUESTA' : '🔔 LEAD'} — ${nombre || 'sin nombre'}`, `Motivo: ${motivo}`];
  if (silencio) lineas.push('Al cliente no le contesté nada: escribile vos.');
  lineas.push(`Chat: https://wa.me/${num}`);
  if (borrador) lineas.push(`\n— BORRADOR, no se envió —\n${borrador}`);
  return lineas.join('\n');
}

/**
 * Escalar: Erasmo no le contesta al cliente (el bot nunca promete que otra persona le va a responder) y el
 * grupo interno recibe el aviso. Lo único que le llega al cliente es el mensaje fijo del código, AVISO_ESCALADO
 * ("Enseguida te respondemos."; Tomás y Fran, 16/11/2026), una sola vez por escalado y a cualquier hora:
 *  - solo con un escalado que calla (`calla === true`): si Sonnet falló o un audio no se entendió
 *    (`calla: false`) al cliente no le sale nada, como siempre;
 *  - solo si el aviso al grupo salió (o quedó en la cola de las 9), y solo cuando el chat pasa de no escalado
 *    a escalado y callado (`control.escalaEncima`): con el chat ya escalado y callado no se repite;
 *  - con los candados de siempre: en escucha no sale nada; en borrador o fuera de las listas de prueba
 *    (`leLlegaAlCliente`) al cliente nada, y el texto va en el mismo aviso marcado BORRADOR; apagado
 *    (#apagar), excluido, pausado, con una persona de la cuenta que escribió en el medio o con un #sigue
 *    que lo reactivó antes del envío, tampoco (`frenoDelAvisoDeEscalado`).
 * Como el cliente no recibe una respuesta, el aviso al grupo no puede perderse:
 *  - un chat que ya estaba escalado y callado no llega hasta acá: lo que escriba lo junta el recordatorio
 *    del escalado (control.js);
 *  - el mismo motivo no se repite dentro de SILENCIO_TRAS_HUMANO_MIN: cinco "ok" seguidos son un aviso (y
 *    ningún mensaje más al cliente);
 *  - se marca como avisado recién cuando salió: si falló, avisa con el próximo mensaje.
 * En borrador, o fuera de las listas de prueba, el aviso sale pero el chat no queda escalado. `tanda`: el id
 * de la tanda que escaló, para la `entrega` del mensaje fijo en el registro.
 */
async function escalarEnSilencio({ chatId, nombre, motivo, ctx, calla = true, tanda = null }) {
  if (config.modoEscucha) {
    console.log(`[escucha] ${chatId}: habria escalado sin contestarle -> ${motivo}`);
    return;
  }
  const ahora = Date.now();
  const previo = ctx.ultimoAvisoSilencio;
  const ventana = config.silencioTrasHumanoMin * 60 * 1000;
  if (previo && previo.motivo === motivo && ahora - previo.ts < ventana) {
    console.log(`[silencio] ${chatId}: "${motivo}" ya se aviso hace poco`);
    return;
  }

  // Una sola definición de "le llega al cliente" (evolution.js). Un escalado que calla le gana a uno que no
  // calla (control.escalaEncima): `pasaAEscalado` dice si este queda anotado. El mensaje fijo va solo ahí, y
  // solo si calla.
  const leLlega = evolution.leLlegaAlCliente(chatId);
  const pasaAEscalado = control.escalaEncima(ctx, calla);
  const conAviso = calla === true && pasaAEscalado;

  const r = await evolution.avisarGrupo(
    avisoParaGrupo({ chatId, nombre, motivo, silencio: true, borrador: conAviso && !leLlega ? AVISO_ESCALADO : '' })
  );
  if (!r || r.bloqueado) return;
  state.actualizar(chatId, { ultimoAvisoSilencio: { motivo, ts: ahora } });
  console.log(`[silencio] ${chatId}: no le conteste, avise al grupo -> ${motivo}`);

  if (!leLlega || !pasaAEscalado) return;
  control.escalar(chatId, motivo, { calla });
  if (conAviso) await avisarAlClienteDelEscalado(chatId, tanda);
}

/**
 * Por qué no sale el mensaje fijo del escalado, o null si sale: apagaron el bot (#apagar), excluyeron el chat,
 * lo pausaron, escribió una persona de la cuenta o el chat ya no está escalado y callado (un #sigue, o alguien
 * que lo tomó, entre que escaló y el envío): en todos esos casos ya hay alguien, y decirle "enseguida te
 * respondemos" con el chat reactivado sería una promesa que nadie tiene a cargo.
 */
function frenoDelAvisoDeEscalado(chatId) {
  if (!interruptor.prendida()) return 'el bot está apagado';
  if (evolution.esContactoPersonal(chatId)) return MOTIVO_EXCLUIDO;
  const s = state.obtener(chatId);
  if (s.pausado) return 'el chat está pausado';
  if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) return 'escribió alguien de la cuenta';
  if (!control.callado(s)) return 'el chat ya no está escalado';
  return null;
}

/**
 * Le manda al cliente el mensaje fijo del escalado (AVISO_ESCALADO), por el camino de cualquier texto:
 * "escribiendo…", la espera del ritmo, RECIÉN AHÍ el control, y el envío con delay 0 por `enviarAlCliente`
 * (así su eco no cuenta como una persona de la cuenta y no "toma" el escalado). El control
 * (`frenoDelAvisoDeEscalado`) va dos veces: antes del "escribiendo…" (si ya hay alguien, el cliente no ve al
 * bot escribir para nada) y después de la espera, justo antes del envío. Un mensaje nuevo del cliente no lo
 * frena. Escucha, borrador y las listas ya los miró quien llama (`leLlegaAlCliente`), y `evolution.enviarTexto`
 * vuelve a mirar las listas, el apagado y los excluidos.
 *
 * No se agrega al historial ni a `botEnvio` (como el "🔄 Reiniciado"): no es una respuesta de Erasmo. Lo
 * último del chat sigue siendo lo que dejó escrito el cliente (para #sigue y para el barrido del silencio) y,
 * para #vendido / #perdido, un escalado sigue sin contar como que el bot le mandó algo. Queda en el registro
 * como una `entrega` de origen 'escalado'. Si Evolution falla, el chat ya quedó escalado y el grupo avisado:
 * se anota (la `entrega` con su error) y nada más. Devuelve si salió.
 */
async function avisarAlClienteDelEscalado(chatId, tanda = null) {
  try {
    let freno = frenoDelAvisoDeEscalado(chatId);
    if (!freno) {
      await evolution.mostrarEscribiendo(chatId, config.ritmo.entreMensajesMs);
      await dormir(config.ritmo.entreMensajesMs);
      freno = frenoDelAvisoDeEscalado(chatId);
    }
    if (freno) {
      console.log(`[escalado] ${chatId}: ${freno}, no le mando "${AVISO_ESCALADO}"`);
      return false;
    }
    const enviado = await enviarAlCliente(chatId, 'texto', AVISO_ESCALADO, () => evolution.enviarTexto(chatId, AVISO_ESCALADO, 0), null, {
      origen: 'escalado',
      tanda,
    });
    if (!autoria.llego(enviado)) {
      console.log(`[escalado] ${chatId}: "${AVISO_ESCALADO}" no salió${enviado && enviado.motivo ? ` (${enviado.motivo})` : ''}`);
      return false;
    }
    console.log(`[escalado] ${chatId}: le mandé "${AVISO_ESCALADO}"`);
    return true;
  } catch (e) {
    // Un #reset en el medio no es una falla: la tanda se descarta en atenderChat.
    if (e instanceof state.ChatReiniciado) throw e;
    console.error(`[escalado] ${chatId}: no pude mandarle "${AVISO_ESCALADO}":`, e.message);
    return false;
  }
}

/**
 * Manda algo al cliente anotando la autoría (autoria.js): el envío queda en vuelo hasta que Evolution
 * conteste, y su id queda anotado para reconocer el eco. Es también el único lugar donde se confirman las
 * marcas de "ya se dijo": se guardan recién con la respuesta de Evolution en la mano. Cada envío deja en el
 * registro de aprendizaje un evento `entrega` con el id que devolvió Evolution, o con `error`. `origen`
 * ('sonnet', 'silencio', 'sigue' o 'escalado': el mensaje fijo al escalar) y `tanda` los pasa cada camino; con
 * `origen: null` no se anota (el "🔄 Reiniciado" del #reset del tester).
 */
async function enviarAlCliente(chatId, tipo, texto, enviar, marcas = null, { origen = 'sonnet', tanda = null } = {}) {
  const vuelo = autoria.despegar(chatId, tipo, texto);
  let respuesta = null;
  try {
    respuesta = await enviar();
  } catch (e) {
    if (origen) aprendizaje.entrega(chatId, { formato: tipo, origen, texto, tanda, error: evolution.errorCorto(e) });
    throw e;
  } finally {
    autoria.aterrizar(vuelo, respuesta);
  }
  if (origen) {
    aprendizaje.entrega(
      chatId,
      respuesta && respuesta.bloqueado
        ? { formato: tipo, origen, texto, tanda, error: respuesta.motivo || 'bloqueado' }
        : { id: autoria.llego(respuesta) ? respuesta.key.id : null, formato: tipo, origen, texto, tanda }
    );
  }
  if (marcas && autoria.llego(respuesta)) state.confirmarMarcas(chatId, marcas);
  // Chats viejos: el id queda guardado para que este envío, visto después en Evolution, no marque el chat
  // como viejo, y alDia avanza (chats-viejos.js).
  if (autoria.llego(respuesta)) chatsViejos.envioConfirmado(respuesta.key.id);
  return respuesta;
}

/** Por qué algo no le llega al cliente, para decirlo en el grupo. */
function porQueNoLeLlega() {
  if (config.modoEscucha) return 'modo escucha';
  if (config.modoBorrador) return 'modo borrador';
  return 'no está en las listas de prueba';
}

/**
 * Deja anotado que el bot le mandó algo de verdad a este cliente, para #vendido y #perdido (`botLeMando`
 * en ventas.js). Vale el envío que Evolution confirmó con su id.
 */
function anotarEnvio(chatId, r) {
  if (!autoria.llego(r)) return;
  if (!state.obtener(chatId).botEnvio) state.actualizar(chatId, { botEnvio: Date.now() });
  state.actualizar(chatId, { ultimoEnvioCliente: Date.now() });
}

/**
 * #reset: el chat queda como nuevo. Lo usan la cuenta del negocio y el tester (ver procesar). Se lleva el
 * estado y el recordatorio, las líneas que esperaban tanda, la tanda que ya estaba interpretando o mandando
 * (`state.reiniciar` sube la generación del chat) y lo que el registro de aprendizaje tiene en memoria.
 */
function reiniciarChat(chatId, { cliente = false } = {}) {
  // Con la hora del reset en `evolutionTraido`, lo de antes no se trae de Evolution.
  const habia = state.reiniciar(chatId, { evolutionTraido: Date.now() });
  const recordatorio = Boolean(state.recordatorios()[chatId]);
  if (recordatorio) state.borrarRecordatorio(chatId);
  pendientes.delete(chatId);
  aprendizaje.olvidar(chatId);
  const detalle = [
    habia ? '' : 'no habia nada guardado',
    recordatorio ? 'borre su recordatorio' : '',
    enProceso.has(chatId) ? 'corte la tanda en curso' : '',
  ].filter(Boolean);
  console.log(
    `[reset] ${chatId} quedo como nuevo` + (cliente ? ', lo pidio el cliente' : '') + (detalle.length ? ` (${detalle.join(', ')})` : '')
  );
}

/**
 * #reset que mandó el tester: reinicia y le confirma con "🔄 Reiniciado". Ese envío no va al historial ni a
 * `botEnvio`: el chat tiene que quedar vacío. Sale al instante, también en borrador (solo le llega a un
 * número de la lista).
 */
async function resetDelCliente(chatId) {
  reiniciarChat(chatId, { cliente: true });
  try {
    const r = await enviarAlCliente(chatId, 'texto', AVISO_RESET, () => evolution.enviarTexto(chatId, AVISO_RESET), null, { origen: null });
    if (r && r.bloqueado) console.log(`[reset] ${chatId}: "${AVISO_RESET}" no salio: ${r.motivo}`);
  } catch (e) {
    console.error(`[reset] ${chatId}: no pude mandar "${AVISO_RESET}":`, e.message);
  }
}

/**
 * Un chat que llegó con el identificador interno de WhatsApp (`…@lid`) en vez del número (decisión de
 * Tomás del 28/09/2026). Con esa clave el bot no sabe si es un cliente, un amigo o un proveedor:
 * CONTACTOS_PERSONALES y SOLO_CHATS_NUEVOS comparan números. No se procesa: no se le contesta, no se
 * guarda, no va a Sonnet ni se transcribe. Si escribió el cliente, un aviso al grupo por chat cada 24 h, con
 * el nombre y la hora (sin el texto). Un mensaje propio en ese chat no hace nada.
 */
async function chatSinNumero(chatId, data) {
  if (data?.key?.fromMe) return;
  aprendizaje.silencio(chatId, { motivo: 'sin-numero', lineas: [data?.key?.id] });
  const ahora = Date.now();
  const antes = avisosSinNumero.get(chatId);
  if (antes && ahora - antes < AVISO_SIN_NUMERO_CADA_MS) return;
  avisosSinNumero.set(chatId, ahora);
  const ts = Number(data?.messageTimestamp?.low ?? data?.messageTimestamp ?? 0);
  const hora = HORA_ARGENTINA.format(ts > 0 ? ts * 1000 : ahora);
  // A veces el nombre viene con los dígitos del @lid: no sirven para encontrar el chat.
  const pushName = String(data?.pushName || '').trim();
  const nombre = pushName && pushName !== chatId.split('@')[0] ? pushName : 'sin nombre';
  console.log(`[sin numero] ${chatId} (${nombre}), ${hora}: WhatsApp no mando el numero; no lo proceso y aviso al grupo`);
  try {
    await evolution.avisarGrupo(
      `📵 SIN NÚMERO · ${nombre} · ${hora}\n` +
        'WhatsApp mandó este chat sin el número y no sé si es un cliente, un amigo o un proveedor. ' +
        'No le contesto: fijate en el teléfono y, si es un cliente, contestale vos.'
    );
  } catch (e) {
    console.error(`[sin numero] ${chatId}: no pude avisar al grupo:`, e.message);
  }
}

/** Los comandos escritos por la cuenta en el grupo interno. */
async function comandoDelGrupo(data) {
  const texto = textoDelMensaje(data);
  // #recordar y #hecho escritos en el grupo no tienen un cliente al que asociarse: se contesta cómo se usan.
  // Los avisos del bot también vuelven por acá como propios; no se confunden porque un comando solo cuenta
  // si el mensaje empieza con él.
  const cmd = recordatorios.comando(texto);
  // Las respuestas a un comando que alguien acaba de escribir salen ya (`inmediato`): no esperan a las 9.
  if (cmd) await evolution.avisarGrupo(recordatorios.ayuda(cmd.tipo === 'hecho' ? 'hecho-en-grupo' : 'recordar-en-grupo'), { inmediato: true });
  // #vendido y #perdido con el número del cliente: marcan ese chat.
  const venta = ventas.comando(texto);
  if (venta) await confirmarVenta(ventas.desdeGrupo(venta, data?.key?.id));
  // #excluir / #incluir con el número, y #excluidos: la lista de contactos que el bot ignora.
  const exc = excluidos.comando(texto);
  if (exc) await confirmarExcluidos(excluidos.desdeGrupo(exc));
  // #sinstock / #hay: qué colores de granza no hay en stock.
  const stk = stockColores.comando(texto);
  if (stk) await confirmarStockColores(stockColores.desdeGrupo(stk));
  // #pausa y #sigue con el número. #sigue contesta lo que dejó escrito el cliente (`alSeguir`): sus líneas
  // quedan en la cola al reactivar y la tanda arranca ya (lo primero que hace es la espera de siempre, así
  // el aviso sale antes).
  const ctrl = control.comando(texto);
  if (ctrl) {
    const r = control.desdeGrupo(ctrl, Date.now(), { alSeguir });
    const tanda = r.contesta ? atenderChat(r.chatId, (state.todos()[r.chatId] || {}).nombre || '') : null;
    try {
      await confirmarControl(r);
    } finally {
      if (tanda) await tanda;
    }
  }
  // #sonnet, #comparar, #bot y #sonnet-si, con el número.
  const son = cerebroComandos.comando(texto);
  if (son) await confirmarComandoSonnet(son, await cerebroComandos.desdeGrupo(son));
  // #tanda / #tanda-ok / #tanda-no: los chats sin contestar, de a 40 y con tu OK (src/tandas.js).
  const tan = tandas.comando(texto);
  if (tan) await comandoDeTandas(tan);
  // #reactivar / #reactivar-prueba: la reactivación de 2 mensajes (src/reactivacion.js).
  const rea = reactivacion.comando(texto);
  if (rea) await comandoDeReactivacion(rea);
  // #apagar / #prender: el interruptor general.
  const inter = interruptor.comando(texto);
  if (inter) await confirmarInterruptor(interruptor.desdeGrupo(inter));
}

async function procesar(data) {
  const chatId = data?.key?.remoteJid;
  if (!chatId) return;

  // Nada de grupos, listas de difusión ni estados. Solo los comandos de la cuenta en el grupo interno.
  if (chatId.endsWith('@g.us')) {
    if (!gruposVistos.has(chatId)) {
      gruposVistos.add(chatId);
      const comoSeLlama = data?.pushName ? ` (escribio ${data.pushName})` : '';
      console.log(`[grupo] ${chatId}${comoSeLlama}  <- si es el grupo interno, este es el GRUPO_AVISOS_JID`);
    }
    if (chatId === config.grupoAvisos && data?.key?.fromMe && !esViejo(data)) await comandoDelGrupo(data);
    return;
  }
  if (chatId.includes('broadcast') || chatId.includes('status')) return;

  // #excluir / #incluir / #excluidos escritos por la cuenta del negocio en el chat de una persona. Van ANTES
  // del corte de contactos personales: así se puede escribir #incluir en el chat de alguien ya excluido. No
  // entran al historial ni al aprendizaje, no callan al bot y al cliente no le llega nada. Un cliente que
  // escribe "#excluir" no excluye nada: solo cuenta lo que sale de la cuenta (fromMe).
  if (data?.key?.fromMe && !esViejo(data)) {
    const exc = excluidos.comando(textoDelMensaje(data));
    if (exc) {
      if (!autoria.esDelBot(chatId, data)) await confirmarExcluidos(excluidos.desdeChat(chatId, exc));
      return;
    }
    // Un comando de los de siempre (#vendido, #recordar, #pausa, #reset…) en el chat de un EXCLUIDO: el bot
    // ignora ese chat entero y no lo ejecuta; solo avisa al grupo para que nadie crea que quedó hecho. Con
    // CONTACTOS_PERSONALES (el .env) sigue todo callado, como siempre.
    if (evolution.motivoContactoPersonal(chatId) === 'excluido' && !autoria.esDelBot(chatId, data)) {
      const comandoIgnorado = comandoEnChatExcluido(textoDelMensaje(data));
      if (comandoIgnorado) {
        const quien = String((state.todos()[chatId] || {}).nombre || '').trim() || chatId.split('@')[0];
        const r = await evolution.avisarGrupo(
          `❓ #${comandoIgnorado} en el chat de ${quien}: está excluido (#excluir), así que no hice nada. Para volver a atenderlo: #incluir`,
          { inmediato: true }
        );
        if (r && r.bloqueado) console.log(`[excluidos] el aviso de #${comandoIgnorado} en un chat excluido no salio: ${r.motivo}`);
        return;
      }
    }
  }

  // Contacto personal (CONTACTOS_PERSONALES o excluido con #excluir): se ignora entero y ACÁ, antes de tocar
  // nada (más abajo ya se transcriben audios y se escribe el estado).
  if (evolution.esContactoPersonal(chatId)) return;

  // Al vincular el QR, WhatsApp manda el historial entero: solo interesa lo que pasa de acá en adelante.
  if (esViejo(data)) return;

  // Sin número (@lid): ver chatSinNumero. Va después de esViejo, para que la recarga del historial no avise.
  if (chatId.endsWith('@lid')) {
    await chatSinNumero(chatId, data);
    return;
  }

  // Chats viejos: mientras el bot se pone al día con Evolution al arrancar, el mensaje espera (hasta 60 s).
  // Solo con SOLO_CHATS_NUEVOS.
  if (config.soloChatsNuevos) await chatsViejos.esperar();

  // Chats viejos: con la lista atrasada, un chat de un cliente que todavía no está en estado.json queda
  // anotado con la hora de este mensaje, ANTES de entrar al estado.
  if (!data?.key?.fromMe) {
    chatsViejos.entroDelCliente(chatId, Number(data?.messageTimestamp?.low ?? data?.messageTimestamp ?? 0) * 1000);
  }

  // Con CEREBRO_MODO=nuevos, un chat que llega por primera vez lo atiende Sonnet desde este mensaje, hasta
  // #reset o #bot. Se mira ANTES de que nada toque el estado: anotar el anuncio (justo abajo) usa
  // state.obtener, que crea el chat, y con eso ningún chat nuevo contaba como nuevo (18/11/2026, primera
  // noche en vivo; test/piedra-nuevos-anuncio.test.js). Solo un mensaje del cliente abre un chat nuevo.
  const nuevoParaSonnet = !data?.key?.fromMe && cerebro.esChatNuevo(chatId);

  // De qué anuncio de Meta vino el chat (src/anuncio.js): queda en el estado y en el aprendizaje, en todos los
  // modos (también apagado y en escucha). Solo anota; no cambia qué se contesta.
  if (!data?.key?.fromMe) {
    try {
      const deAnuncio = anuncio.anuncioDe(data);
      const cambios = anuncio.cambiosDeEstado(state.obtener(chatId), deAnuncio);
      if (cambios) {
        state.actualizar(chatId, cambios);
        aprendizaje.anotar('anuncio', chatId, { anuncio: deAnuncio.id, titulo: deAnuncio.titulo, id: data?.key?.id });
        console.log(`[anuncio] ${chatId}: llego desde el anuncio ${deAnuncio.id || 'sin id'}`);
      }
    } catch (e) {
      console.error(`[anuncio] ${chatId}: no pude anotar el anuncio:`, e.message);
    }
  }

  let texto = textoDelMensaje(data);
  const nombre = data?.pushName || '';
  const esNotaDeVoz = audio.esAudio(data);

  // Mensaje salido de la cuenta: puede ser una persona contestando.
  if (data?.key?.fromMe) {
    // El eco de un envío del bot (por su id, o mientras el envío está en vuelo) no es una persona.
    if (autoria.esDelBot(chatId, data)) return;

    // Los audios propios se transcriben y se guardan con el texto real.
    let paraHistorial = texto;
    if (esNotaDeVoz) {
      const t = await audio.transcribir(data);
      if (t.ok) {
        texto = t.texto;
        paraHistorial = t.texto;
        console.log(`[audio] transcribi un audio propio en ${chatId}`);
      } else {
        texto = '';
        paraHistorial = '[audio que no se pudo transcribir]';
        console.warn(`[audio] audio propio sin transcribir en ${chatId}: ${t.motivo}`);
      }
    }

    // #reset: el chat queda como nuevo. Se corta acá, antes de guardar nada.
    if (/^#reset/i.test(texto)) {
      reiniciarChat(chatId);
      return;
    }
    if (/^#pausa/i.test(texto)) {
      state.actualizar(chatId, { pausado: true });
      return;
    }
    if (/^#sigue/i.test(texto)) {
      // "El bot vuelve ya": también limpia el escalado (control.js). Contesta lo que el cliente dejó escrito.
      control.reanudar(chatId);
      if (alSeguir(chatId).contesta) await atenderChat(chatId, state.obtener(chatId).nombre || '');
      return;
    }
    // #recordar / #hecho: recordatorios al grupo interno. No entran al historial ni callan al bot.
    const cmd = recordatorios.comando(texto);
    if (cmd) {
      await atenderComando(chatId, cmd, data?.key?.id);
      return;
    }
    // #vendido / #perdido: mismo patrón.
    const venta = ventas.comando(texto);
    if (venta) {
      await atenderVenta(chatId, venta, data?.key?.id);
      return;
    }
    // No lo mandó el bot: escribió una persona. Marca a la persona y calla al bot SILENCIO_TRAS_HUMANO_MIN.
    state.actualizar(chatId, { ultimoHumano: Date.now() });
    state.agregarAlHistorial(chatId, 'vendedor', paraHistorial, { humano: true, id: data?.key?.id });
    // Si el chat estaba escalado, lo tomó: queda resuelto, y el bot vuelve cuando pasa el silencio.
    if (control.resolver(chatId, 'escribió alguien de la cuenta')) {
      console.log(`[escalado] ${chatId}: lo tomó alguien de la cuenta`);
    }
    // Registro de aprendizaje: lo que escribió la persona y a qué propuesta responde.
    aprendizaje.humano(chatId, { id: data?.key?.id, texto }, { tandaEnCurso: enProceso.has(chatId) });
    return;
  }

  // Comandos desde el celular del tester (NUMEROS_TESTER): un #reset (o sus typos) reinicia el chat, y
  // cualquier otro # se descarta. Para un piloto o cualquier otro número, un texto con # es un mensaje más.
  if (texto.startsWith('#') && evolution.estaEnLaLista(chatId, config.numerosTester)) {
    if (RE_RESET_TESTER.test(texto)) await resetDelCliente(chatId);
    else console.log(`[tester] ${chatId}: "${texto.slice(0, 40)}" empieza con # y no es un #reset, lo descarto`);
    return;
  }

  // Pedido del catálogo sin texto: va a la tanda como un pedido, sin texto. Si en la misma tanda escribió
  // algo, se contesta el texto; si no, escala callado (cuando atiende Sonnet).
  const titulo = !texto && !esNotaDeVoz ? pedidoDelCatalogo(data) : null;
  if (titulo !== null) {
    if (!config.modoEscucha && (state.humanoActivo(chatId, config.silencioTrasHumanoMin) || control.callado(state.obtener(chatId)))) {
      aprendizaje.silencio(chatId, { motivo: motivoDelSilencio(chatId), lineas: [data?.key?.id], formato: 'pedido' });
      return;
    }
    if (!pendientes.has(chatId)) pendientes.set(chatId, []);
    pendientes.get(chatId).push({ pedido: true, titulo, ts: Date.now(), texto: '' });
    if (enProceso.has(chatId)) return;
    await atenderChat(chatId, nombre);
    return;
  }

  // Foto sin epígrafe: en un chat que ya existe deja una línea "[foto]" del cliente en el historial (así en
  // la tanda siguiente Sonnet sabe que la hubo). A la tanda entra solo si llega mientras se junta o se
  // atiende una tanda de este chat: ahí la ve Sonnet. Una foto suelta no dispara una respuesta.
  if (!texto && !esNotaDeVoz && esFotoSinTexto(data)) {
    const s = state.todos()[chatId];
    const conTanda = enProceso.has(chatId) || (pendientes.get(chatId) || []).length > 0;
    if (s && data.message.imageMessage) state.agregarAlHistorial(chatId, 'cliente', LINEA_FOTO, { id: data?.key?.id });
    if (!conTanda) {
      aprendizaje.silencio(chatId, { motivo: 'sin-texto', lineas: [data?.key?.id], formato: 'foto' });
      return;
    }
    if (!config.modoEscucha && (state.humanoActivo(chatId, config.silencioTrasHumanoMin) || control.callado(state.obtener(chatId)))) {
      aprendizaje.silencio(chatId, { motivo: motivoDelSilencio(chatId), lineas: [data?.key?.id], formato: 'foto' });
      return;
    }
    if (!pendientes.has(chatId)) pendientes.set(chatId, []);
    const deLaFoto = { foto: true, ts: Date.now(), texto: '' };
    // Con qué bajarla para Sonnet. Un álbum no trae imagen: cada foto del álbum llega aparte.
    datosDeLinea.set(deLaFoto, { imagen: fotosDelCliente.deMensaje(data) });
    pendientes.get(chatId).push(deLaFoto);
    if (enProceso.has(chatId)) return;
    await atenderChat(chatId, nombre);
    return;
  }

  // La última actividad del chat ANTES de anotar esta línea, para saber si los datos guardados son viejos.
  const ultimaActividad = control.ultimaActividad(state.todos()[chatId]);

  // `nuevoParaSonnet` se calculó arriba, antes de anotar el anuncio.

  // Mensaje del cliente. Entra al historial YA, en el orden en que llegó. Un audio también: su línea se
  // reserva ahora y la transcripción la completa después.
  let linea;
  if (esNotaDeVoz && !texto) {
    state.agregarAlHistorial(chatId, 'cliente', '[audio]', { id: data?.key?.id });
    linea = ultimaLinea(chatId);
    linea.audio = true;
  } else {
    // Sticker o foto sin epígrafe fuera de una tanda: queda el silencio, con el formato; una reacción o un
    // mensaje de protocolo no (`marcadorSinTexto` da null).
    if (!texto) {
      const marcador = marcadorSinTexto(data);
      if (marcador) aprendizaje.silencio(chatId, { motivo: 'sin-texto', lineas: [data?.key?.id], formato: marcador.slice(1, -1) });
      return;
    }
    // Lo que cita: si responde a otro mensaje, la línea empieza con "[responde a: <lo citado>]" y así llega
    // al historial, a Sonnet y al registro. `ultimoMensajeCliente` es lo que escribió él.
    const escrito = texto;
    texto = conCita(texto, data);
    state.agregarAlHistorial(chatId, 'cliente', texto, { id: data?.key?.id });
    linea = ultimaLinea(chatId);
    state.actualizar(chatId, { ultimoMensajeCliente: escrito });
  }
  if (nuevoParaSonnet) {
    state.actualizar(chatId, { atiendeSonnet: true, atiendeSonnetDesde: Date.now() });
    console.log(`[sonnet] ${chatId}: chat nuevo, lo atiende Sonnet`);
  }

  // Cómo llegó: si había una persona atendiendo y si era un audio.
  const humanoAtendiendo = state.humanoActivo(chatId, config.silencioTrasHumanoMin);
  state.actualizar(chatId, { ultimoContexto: { humanoAtendiendo, audio: esNotaDeVoz } });

  // Registro de aprendizaje: la línea queda anotada con su id, entre o no a una tanda. Un audio se anota
  // cuando termina de transcribirse (transcribirEnLinea).
  const idLinea = data?.key?.id || `sin-id-${++lineasSinId}`;
  // Una foto con epígrafe entra como texto (el epígrafe); la imagen, para Sonnet.
  const imagen = linea.audio ? null : fotosDelCliente.deMensaje(data);
  datosDeLinea.set(linea, { id: idLinea, humanoAtendiendo, ...(imagen ? { imagen } : {}) });
  aprendizaje.llegoDelCliente(chatId, idLinea);
  if (linea.audio) transcripciones.set(linea, transcribirEnLinea(chatId, data, linea));
  else aprendizaje.cliente(chatId, { id: idLinea, texto, audio: false, humanoAtendiendo });

  if (humanoAtendiendo && !config.modoEscucha) {
    // Una persona está atendiendo: el bot se calla. En escucha no se corta (todo el sentido de ese modo es
    // registrar). Sonnet en sombra donde atiende una persona, si está prendida.
    console.log(`[${chatId}] humano atendiendo, el bot se queda callado`);
    aprendizaje.silencio(chatId, { motivo: state.obtener(chatId).pausado ? 'pausado' : 'persona', lineas: [idLinea] });
    sombraPersona.anotar(chatId, nombre, [{ linea, id: idLinea }], 'persona', esperaAleatoria());
    return;
  }

  // Chat escalado: callado. El mensaje ya quedó en el historial y lo junta el recordatorio del escalado.
  // Pasadas ESCALADO_REANUDAR_HORAS sin que nadie lo tome, es una consulta nueva (control.js).
  const delChat = state.obtener(chatId);
  if (control.callado(delChat) && !config.modoEscucha) {
    if (!control.vencido(delChat)) {
      console.log(`[escalado] ${chatId}: el mensaje queda anotado y no se contesta`);
      aprendizaje.silencio(chatId, { motivo: 'escalado', lineas: [idLinea] });
      sombraPersona.anotar(chatId, nombre, [{ linea, id: idLinea }], 'escalado', esperaAleatoria());
      return;
    }
    control.resolver(chatId, `nadie lo tomó en ${config.escalado.reanudarHoras} h`);
    control.limpiarParaConsultaNueva(chatId);
    console.log(`[escalado] ${chatId}: nadie lo tomó en ${config.escalado.reanudarHoras} h, lo atiendo como consulta nueva`);
  }

  // Datos viejos por tiempo: si la última actividad es más vieja que DATOS_VIEJOS_HORAS, se atiende como
  // consulta nueva, y se da por resuelto un escalado que hubiera quedado abierto.
  const horasViejas = control.horasViejas(ultimaActividad);
  if (horasViejas) {
    const habiaEscalado = control.limpiarDatosViejos(chatId);
    console.log(
      `[datos viejos] ${chatId}: ${horasViejas} h sin actividad, lo atiendo como consulta nueva` +
        (habiaEscalado ? ' (tenía un escalado sin tomar: queda resuelto)' : '')
    );
  }

  // A la tanda de este chat. Si ya hay una esperando, este mensaje se suma; si se está mandando, queda
  // para la que sigue.
  if (!pendientes.has(chatId)) pendientes.set(chatId, []);
  pendientes.get(chatId).push(linea);
  if (enProceso.has(chatId)) return;
  await atenderChat(chatId, nombre);
}

/**
 * El nombre del comando de chat (#vendido, #perdido, #recordar, #hecho, #pausa, #sigue, #reset) con que
 * EMPIEZA el texto, sin el '#', o null. Las mismas funciones que los ejecutan en el chat de un cliente.
 */
function comandoEnChatExcluido(texto) {
  const t = String(texto || '').trim();
  if (/^#reset/i.test(t)) return 'reset';
  return (control.comando(t) || ventas.comando(t) || recordatorios.comando(t) || {}).tipo || null;
}

/** La línea del historial que se acaba de agregar en este chat. */
function ultimaLinea(chatId) {
  const h = state.obtener(chatId).historial;
  return h[h.length - 1];
}

/**
 * Transcribe el audio de un cliente y completa su línea del historial. Nunca tira: devuelve lo mismo que
 * `audio.transcribir`, y lo mira la tanda (un audio que no se entendió escala).
 */
async function transcribirEnLinea(chatId, data, linea) {
  const generacion = state.generacion(chatId);
  const t = await audio.transcribir(data).catch((e) => ({ ok: false, motivo: e.message }));
  if (t.ok) {
    linea.texto = conCita(t.texto, data);
    console.log(`[audio] transcribi un audio de ${chatId}`);
  } else {
    linea.texto = '[audio que no se entendio]';
    console.warn(`[audio] audio de ${chatId} sin transcribir: ${t.motivo}`);
  }
  // Si mientras tanto llegó un #reset, esta línea ya no está en el chat: no se guarda nada.
  if (state.generacion(chatId) !== generacion) return t;
  state.actualizar(chatId, t.ok ? { ultimoMensajeCliente: t.texto } : {});
  const datos = datosDeLinea.get(linea);
  if (datos) {
    aprendizaje.cliente(chatId, { id: datos.id, texto: linea.texto, audio: true, humanoAtendiendo: datos.humanoAtendiendo }, { ts: linea.ts });
  }
  return t;
}

/**
 * Tandas. Los mensajes que el cliente manda seguidos se juntan y se contestan UNA sola vez: se espera, se
 * junta y recién ahí se interpreta. Mientras haya líneas pendientes se atiende una tanda tras otra: lo que
 * llega mientras se manda una respuesta va en la siguiente.
 */
async function atenderChat(chatId, nombre) {
  enProceso.add(chatId);
  // Cortes seguidos porque el cliente escribió en medio de la respuesta (atenderTanda).
  let cortesSeguidos = 0;
  try {
    while ((pendientes.get(chatId) || []).length) {
      // Ritmo humano ANTES de interpretar: nunca contesta al instante, y lo que el cliente siga mandando en
      // este rato entra en la misma tanda. En escucha también se espera. Si la tanda anterior se cortó
      // porque el cliente escribió en medio, la espera es corta.
      await dormir(cortesSeguidos ? esperaTrasCorte() : esperaAleatoria());

      // Si un #reset se llevó la cola durante la espera, no queda nada.
      const cola = pendientes.get(chatId);
      if (!cola || !cola.length) continue;
      const deEstaVuelta = cola.slice();

      // Desde acá la tanda es de esta generación del chat: si llega un #reset, lo próximo que lea o escriba
      // tira ChatReiniciado y la tanda se descarta entera.
      try {
        const r = await tandaEnCurso.run({ chatId, generacion: state.generacion(chatId) }, () =>
          atenderTanda(chatId, nombre, cola, { cortarPorMensajeNuevo: cortesSeguidos < MAX_CORTES_SEGUIDOS })
        );
        if (r && r.reencolar) {
          // Se cortó porque el cliente escribió en medio: sus líneas vuelven adelante de la cola y la tanda
          // siguiente contesta todo junto.
          const actual = pendientes.get(chatId);
          if (actual) actual.unshift(...r.reencolar);
          else pendientes.set(chatId, [...r.reencolar]);
          cortesSeguidos++;
        } else {
          cortesSeguidos = 0;
        }
      } catch (e) {
        if (!(e instanceof state.ChatReiniciado)) throw e;
        console.log(`[reset] ${chatId}: la tanda que estaba en curso no se manda`);
        aprendizaje.silencio(chatId, { motivo: 'corte', lineas: idsDe(deEstaVuelta), detalle: '#reset' });
      }
    }
  } finally {
    enProceso.delete(chatId);
    pendientes.delete(chatId);
  }
}

/**
 * Por qué no se manda lo que falta de una tanda, o null si se sigue. Se mira antes de CADA envío.
 * `conocidas` son las líneas que ya estaban en la cola cuando empezó la tanda: cualquier otra llegó
 * mientras se armaba o se mandaba la respuesta.
 */
function motivoDeCorte(chatId, conocidas, cortarPorMensajeNuevo) {
  // Un #excluir durante la tanda (esperando, pensando o mandando) frena lo que falta.
  if (evolution.esContactoPersonal(chatId)) return MOTIVO_EXCLUIDO;
  const s = state.obtener(chatId);
  if (s.pausado) return 'el chat está pausado';
  if (control.callado(s)) return 'el chat está escalado';
  if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) return 'escribió alguien de la cuenta';
  if (cortarPorMensajeNuevo && (pendientes.get(chatId) || []).some((l) => !conocidas.has(l))) return MENSAJE_NUEVO;
  return null;
}

/** El corte de una tanda cuando el chat pasó a ser un contacto personal (#excluir) con la tanda en vuelo. */
const MOTIVO_EXCLUIDO = 'el chat está excluido';

/**
 * El motivo del evento `silencio` para cada corte de `motivoDeCorte`. 'excluido' (#excluir con la tanda ya
 * en vuelo) es nuevo: el registro de aprendizaje lo anota como un silencio más, sin nada que mandar.
 */
const SILENCIO_DEL_CORTE = {
  [MOTIVO_EXCLUIDO]: 'excluido',
  'el chat está pausado': 'pausado',
  'el chat está escalado': 'escalado',
  'escribió alguien de la cuenta': 'persona',
  [MENSAJE_NUEVO]: 'corte',
};

/** Por qué no se le contesta cuando calla una persona o el escalado: 'pausado', 'persona' o 'escalado'. */
function motivoDelSilencio(chatId) {
  if (state.obtener(chatId).pausado) return 'pausado';
  if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) return 'persona';
  return 'escalado';
}

/**
 * Manda el catálogo en PDF que pidió `mandar_catalogo`, después de los mensajes. Es el mismo camino que un
 * texto: "escribiendo…", la espera del ritmo, el control (pausa, escalado, una persona, un mensaje nuevo) y
 * `enviarAlCliente` (así el eco del documento cuenta como del bot y no como una persona de la cuenta). Los
 * candados de evolution.js (escucha, borrador, listas, excluidos, carpeta y extensión) los pone `enviarDocumento`.
 * Queda en el historial y la marca de las 24 h (`catalogoEnviado`) solo si Evolution lo confirmó. Devuelve si salió.
 */
async function mandarCatalogo(chatId, conocidas, cortarPorMensajeNuevo, donde) {
  const ruta = documentos.ruta('catalogo');
  if (!ruta) {
    console.error(`[catalogo] ${chatId}: falta el PDF del catálogo en documentos/, no lo mando`);
    return false;
  }
  await evolution.mostrarEscribiendo(chatId, config.ritmo.entreMensajesMs);
  await dormir(config.ritmo.entreMensajesMs);
  state.comprobarVigente(chatId);
  const corte = motivoDeCorte(chatId, conocidas, cortarPorMensajeNuevo);
  if (corte) {
    console.log(`[corte] ${chatId}: ${corte}, el catálogo queda sin mandar`);
    return false;
  }
  const enviado = await enviarAlCliente(chatId, 'documento', documentos.nombre('catalogo'), () => evolution.enviarDocumento(chatId, ruta, '', 0), null, donde);
  anotarEnvio(chatId, enviado);
  if (!autoria.llego(enviado)) {
    console.log(`[catalogo] ${chatId}: el catálogo no salió${enviado && enviado.motivo ? ` (${enviado.motivo})` : ''}`);
    return false;
  }
  const ahora = Date.now();
  state.agregarAlHistorial(chatId, 'vendedor', '[le mandé el catálogo en PDF]', { id: enviado.key.id });
  const s = state.obtener(chatId);
  state.actualizar(chatId, { catalogoEnviado: ahora, ultimoBot: ahora, ficha: { ...(s.ficha || {}), catalogoEnviado: ahora } });
  console.log(`[catalogo] ${chatId}: catálogo enviado`);
  return true;
}

/** Los ids de WhatsApp de unas líneas de la cola (las fotos y los pedidos del catálogo no tienen). */
const idsDe = (lineas) => lineas.map((l) => (datosDeLinea.get(l) || {}).id || null).filter(Boolean);

/**
 * Con un chat en sombra (CEREBRO_MODO=sombra, o los chats que no le tocan a Sonnet con tester/nuevos, o
 * los de #bot), Sonnet piensa qué contestaría con la tanda y queda en el registro de aprendizaje como
 * `propuesta-sonnet`, con el `tanda` de la tanda. No se espera y no se manda nada, ni al cliente ni al
 * grupo. `cerebro.pensar` lee el chat antes de su primer await y nunca tira.
 */
function pensarEnSombra(chatId, nombre, texto, tanda, { audio = false } = {}) {
  cerebro
    .pensar({ chatId, mensaje: texto, nombre, audio })
    .then((r) => {
      const comun = { tanda, modelo: config.cerebro.modelo, sonnet: { reglas: cerebro.REGLAS_HASH }, uso: r.uso || null, usd: r.usd || 0, ms: r.ms == null ? null : r.ms };
      if (r.error) {
        aprendizaje.anotar('propuesta-sonnet', chatId, { ...comun, error: r.error });
        console.warn(`[sombra] ${chatId}: Sonnet no pudo pensar: ${r.error}`);
        return;
      }
      aprendizaje.anotar('propuesta-sonnet', chatId, {
        ...comun,
        mensajes: r.mensajes,
        escalar: r.escalar,
        motivo: r.motivo,
        guardia: r.guardia,
        montos: r.montosDeHerramientas,
        ...(r.frenados ? { frenados: r.frenados } : {}),
        ...(r.corregida ? { corregida: r.corregida } : {}),
      });
      console.log(`[sombra] ${chatId}: Sonnet ${r.escalar ? `escalaría (${r.motivo})` : `contestaría ${r.mensajes.length} mensaje(s)`} · US$${r.usd}`);
    })
    .catch((e) => console.error('[sombra] no pude anotar la propuesta de Sonnet:', e.message));
}

/**
 * Sonnet contesta esta tanda. Devuelve el `resultado` (cerebro.comoResultado), con `deSonnet` (lo que
 * devolvió `pensar`). Si Sonnet no puede (error de la API, timeout, sin clave) NO hay respaldo: el
 * resultado escala en silencio (sin callar el chat: lo que escriba después se vuelve a intentar) y lleva
 * `sonnetFallo` para el registro.
 *
 * Antes de pensar, el historial se completa con Evolution (`completarContexto`), y las fotos de la tanda
 * se bajan a la vez (fotos-del-cliente.js: las últimas 3).
 */
async function contestarConSonnet(chatId, texto, nombre, { audio = false, fotos = [] } = {}) {
  const [ctx, bajadas] = await Promise.all([completarContexto(chatId), fotos.length ? fotosDelCliente.bajar(fotos) : null]);
  // Lo excluyeron mientras se completaba el contexto: no se le pregunta nada a Sonnet. Sin mensajes y sin
  // escalar: el freno que sigue en atenderTanda lo descarta y lo anota.
  if (evolution.esContactoPersonal(chatId)) {
    console.log(`[excluidos] ${chatId}: lo excluyeron mientras se completaba el contexto, no le pregunto a Sonnet`);
    return { escalar: false, mensajes: [], callar: false };
  }
  if (bajadas) {
    console.log(`[sonnet] ${chatId}: ${bajadas.mandadas} foto(s), Sonnet ve ${bajadas.imagenes.length}${bajadas.sinVer ? ` (${bajadas.sinVer} no se pudieron ver)` : ''}`);
  }
  const conFotos = bajadas ? { imagenes: bajadas.imagenes, fotos: { mandadas: bajadas.mandadas, sinVer: bajadas.sinVer } } : {};
  const c = await cerebro.contestar({ chatId, mensaje: texto, nombre, audio, ...conFotos });
  if (c.r && ctx.error) c.r.contexto = /filtró/.test(ctx.error) ? 'evolution no filtró por chat' : 'evolution no contestó';
  if (!c.error) {
    cerebro.alContestar();
    console.log(
      `[sonnet] ${chatId}: ${c.resultado.escalar ? `escala (${c.resultado.motivo})` : `contesta ${c.resultado.mensajes.length} mensaje(s)`} · ` +
        `leyó ${cerebro.leidosTexto(c.r.leidos)} · US$${c.r.usd}`
    );
    return { ...c.resultado, deSonnet: c.r };
  }
  const motivo = cerebro.alFallar(c.error);
  console.warn(`[sonnet] ${chatId}: ${motivo} (${c.error}): no le contesto y aviso al grupo`);
  return { escalar: true, motivo, mensajes: [], callar: false, sonnetFallo: c.r };
}

/**
 * El historial del chat completado con Evolution antes de que Sonnet lo lea (src/contexto.js). Con `todos`,
 * un chat que sumó líneas cuenta para el resumen de la hora. Nunca tira.
 */
async function completarContexto(chatId) {
  const r = await contexto.completar(chatId);
  if (r.agregadas && config.cerebro.modo === 'todos') cerebro.contarEnVivo('evolution', { chatId });
  return r;
}

/**
 * Le llegó al cliente lo que contestó Sonnet: con `tester` y `nuevos` (y en los chats marcados con
 * cualquier modo), el aviso al grupo de cuántos mensajes leyó; con `todos`, cuenta para el resumen de la hora.
 */
async function avisarRespuestaSonnet({ chatId, nombre, ctx, resultado, deSonnet }) {
  if (config.cerebro.modo === 'todos') {
    cerebro.contarEnVivo('respuesta', deSonnet);
    return;
  }
  const aviso = cerebro.avisoRespuesta({ chatId, nombre: ctx.nombre || nombre, leidos: deSonnet.leidos, primero: (resultado.sonnetMensajes || [])[0] || '' });
  const r = await evolution.avisarGrupo(aviso);
  if (r && r.bloqueado) console.log(`[sonnet] el aviso al grupo no salió: ${r.motivo}`);
}

/** Con `CEREBRO_MODO=todos`, un resumen por hora en lugar de un aviso por respuesta. */
async function revisarResumenSonnet(ahora = Date.now()) {
  for (const texto of cerebro.resumenesDeLaHora(ahora)) {
    if (config.cerebro.modo !== 'todos') continue;
    const r = await evolution.avisarGrupo(texto);
    if (r && r.bloqueado) console.log(`[sonnet] el resumen de la hora no salió: ${r.motivo}`);
  }
}

setInterval(() => revisarResumenSonnet().catch(() => {}), 5 * 60 * 1000);

/**
 * El gasto de Sonnet del mes pasó el 80% de CEREBRO_TOPE_MES_USD: un aviso al grupo, una sola vez por mes.
 * Se marca recién cuando salió. Cada 5 minutos, así cuenta también lo que gastó la sombra.
 */
async function revisarGastoMes(ahora = Date.now()) {
  const aviso = cerebro.avisoGastoMes(ahora);
  if (!aviso || evolution.motivoBloqueoAvisos()) return;
  const r = await evolution.avisarGrupo(aviso.texto);
  if (r && !r.bloqueado) {
    cerebro.marcarAvisoGastoMes(aviso.mes);
    console.log(`[sonnet] ${aviso.texto}`);
  }
}

setInterval(() => revisarGastoMes().catch(() => {}), 5 * 60 * 1000);

/**
 * Cuando abre la franja de avisos (9, hora de Argentina): primero salen juntos, en un solo mensaje, los avisos que se
 * generaron afuera (la cola de estado.json) y después los seguimientos de hoy ("hoy toca volver a contactar a…").
 * Cada minuto, así salen a las 9 en punto. Todo lo que no sale queda para el barrido siguiente.
 */
async function revisarAvisosPendientes(ahora = Date.now()) {
  if (evolution.motivoBloqueoAvisos()) return;
  await avisosCola.vaciar((texto) => evolution.avisarGrupo(texto, { inmediato: true }), ahora);
  await seguimiento.avisarLosDeHoy(ahora);
}

setInterval(() => revisarAvisosPendientes().catch((e) => console.error('[avisos] el barrido falló:', e.message)), 60 * 1000);

/**
 * En qué modo se armó una propuesta, para el registro de aprendizaje: 'escucha', 'borrador',
 * 'fuera-de-lista' o 'vivo'.
 */
function modoDeLaPropuesta(chatId) {
  if (config.modoEscucha) return 'escucha';
  if (config.modoBorrador) return 'borrador';
  return evolution.leLlegaAlCliente(chatId) ? 'vivo' : 'fuera-de-lista';
}

async function atenderTanda(chatId, nombre, cola, { cortarPorMensajeNuevo = true } = {}) {
  const conocidas = new Set(cola);

  // Apagado con #apagar: no se interpreta nada (ni Sonnet ni Gemini) y no sale nada. Lo que escribió el
  // cliente ya quedó en el historial; al prenderlo no se contesta solo.
  if (!interruptor.prendida()) {
    console.log(`[apagado] ${chatId}: el bot está apagado (#apagar), no contesto (queda en el historial)`);
    aprendizaje.silencio(chatId, { motivo: 'apagada', lineas: idsDe(cola) });
    pendientes.set(chatId, []);
    return;
  }

  // Si mientras esperábamos la cuenta lo excluyó (#excluir), no se interpreta nada (ni Sonnet) y no sale nada.
  if (evolution.esContactoPersonal(chatId)) {
    console.log(`[excluidos] ${chatId}: lo excluyeron mientras esperaba, cancelo`);
    aprendizaje.silencio(chatId, { motivo: SILENCIO_DEL_CORTE[MOTIVO_EXCLUIDO], lineas: idsDe(cola) });
    pendientes.set(chatId, []);
    return;
  }

  // Si mientras esperábamos contestó una persona, o el chat quedó escalado, no se interpreta nada.
  if (!config.modoEscucha && (state.humanoActivo(chatId, config.silencioTrasHumanoMin) || control.callado(state.obtener(chatId)))) {
    console.log(`[${chatId}] contestó una persona o quedó escalado mientras esperaba, cancelo`);
    const motivoSombra = state.humanoActivo(chatId, config.silencioTrasHumanoMin) ? 'persona' : 'escalado';
    sombraPersona.anotar(chatId, nombre, cola.map((l) => ({ linea: l, id: (datosDeLinea.get(l) || {}).id || null })), motivoSombra, 0);
    aprendizaje.silencio(chatId, { motivo: motivoDelSilencio(chatId), lineas: idsDe(cola) });
    pendientes.set(chatId, []);
    return;
  }

  // Las líneas que hay ahora, con sus audios ya transcritos. Lo que llegue mientras tanto queda para la
  // tanda siguiente.
  const disponibles = cola.length;
  const resultadosAudio = await Promise.all(cola.slice(0, disponibles).map((l) => transcripciones.get(l) || null));
  // Lo excluyeron mientras se transcribía un audio: ni se arma la tanda ni piensa la sombra. Si
  // confirmarExcluidos ya se llevó esta cola (sacó la entrada de pendientes y anotó el silencio), no se anota
  // de nuevo; si la cola sigue siendo la de pendientes (se excluyó sin pasar por ahí), se anota y se vacía.
  if (evolution.esContactoPersonal(chatId)) {
    console.log(`[excluidos] ${chatId}: lo excluyeron mientras se transcribía, cancelo`);
    if (pendientes.get(chatId) === cola) {
      aprendizaje.silencio(chatId, { motivo: SILENCIO_DEL_CORTE[MOTIVO_EXCLUIDO], lineas: idsDe(cola) });
      pendientes.set(chatId, []);
    }
    return;
  }
  const tanda = [];
  const audios = [];
  let caracteres = 0;
  while (tanda.length < disponibles) {
    if (tanda.length && caracteres + cola[0].texto.length > TECHO_TANDA) break;
    const l = cola.shift();
    audios.push(resultadosAudio[tanda.length]);
    tanda.push(l);
    caracteres += l.texto.length;
  }
  if (tanda.length < disponibles) {
    console.log(`[tanda] ${chatId}: pasó el techo de ${TECHO_TANDA} caracteres, ${disponibles - tanda.length} mensaje(s) van en la siguiente`);
  }
  if (!tanda.length) return;

  // Las fotos sin texto y los pedidos del catálogo no son líneas del historial: las fotos van como imágenes
  // para Sonnet; un pedido solo, sin texto en la tanda, escala.
  const conTexto = tanda.filter((l) => !l.foto && !l.pedido);
  const pedidos = tanda.filter((l) => l.pedido);
  const imagenesDeLaTanda = tanda.map((l) => (datosDeLinea.get(l) || {}).imagen).filter(Boolean);
  // Quién contesta (cerebro.quienAtiende): 'sonnet', 'sombra' (nadie contesta, Sonnet piensa) o 'nadie'.
  const quien = cerebro.quienAtiende(chatId);
  if (!conTexto.length && !pedidos.length && !(quien === 'sonnet' && imagenesDeLaTanda.length)) {
    aprendizaje.silencio(chatId, { motivo: 'sin-texto', lineas: [], formato: 'foto' });
    return;
  }
  const texto = conTexto.map((l) => l.texto).join('\n');
  if (conTexto.length > 1) {
    console.log(`[tanda] ${chatId}: ${conTexto.length} mensajes juntos`);
    state.actualizar(chatId, { ultimoMensajeCliente: sinCita(texto) });
  }
  if (tanda.some((l) => l.audio)) {
    state.actualizar(chatId, { ultimoContexto: { ...(state.obtener(chatId).ultimoContexto || {}), audio: true } });
  }
  const audioFallido = audios.find((t) => t && !t.ok);
  // Una tanda que armó el barrido del silencio (revisarSilencios) o #sigue (`alSeguir`).
  const origen = conTexto.map((l) => (datosDeLinea.get(l) || {}).origen).find((o) => o === 'silencio' || o === 'sigue') || null;
  // El id de la tanda (el de su propuesta) va también en sus `silencio` y `entrega`.
  const idTanda = crypto.randomUUID();
  let anotada = false;
  const sinRespuesta = (motivo, extra = {}) =>
    aprendizaje.silencio(chatId, { motivo, lineas: idsDe(conTexto), ...(anotada ? { tanda: idTanda } : {}), ...(origen ? { origen } : {}), ...extra });

  try {
    // Nadie contesta este chat: con CEREBRO_MODO=apagado, nadie; en sombra, Sonnet piensa y lo anota (sin
    // mandar nada). Queda el silencio en el registro. Un audio que no se entendió o un pedido sin texto
    // tampoco escalan: el bot solo escucha.
    if (quien !== 'sonnet') {
      if (quien === 'sombra' && conTexto.length && !audioFallido) pensarEnSombra(chatId, nombre, texto, idTanda, { audio: conTexto.some((l) => l.audio) });
      sinRespuesta(quien === 'sombra' ? 'sombra' : 'cerebro-apagado', { tanda: idTanda });
      return;
    }

    // Un audio que no se pudo transcribir nunca se contesta: podía traer justo lo importante. Al cliente no
    // se le dice nada (no se le promete una llamada): se escala en silencio, sin callar el chat. Un pedido
    // del catálogo sin texto en la tanda también escala, con el nombre del producto si viene; ese sí calla
    // el chat, así que al cliente le llega el mensaje fijo del escalado (escalarEnSilencio).
    const titulos = [...new Set(pedidos.map((l) => l.titulo).filter(Boolean))];
    const resultado =
      !conTexto.length && pedidos.length
        ? { escalar: true, motivo: `mandó un pedido del catálogo de WhatsApp${titulos.length ? `: ${titulos.join(', ')}` : ''}`, mensajes: [] }
        : audioFallido
        ? { escalar: true, motivo: `mandó un audio y no se pudo transcribir (${audioFallido.motivo})`, mensajes: [], callar: false }
        : await contestarConSonnet(chatId, texto, nombre, { audio: conTexto.some((l) => l.audio), fotos: imagenesDeLaTanda });
    // Lo excluyeron mientras Sonnet pensaba: ni respuesta ni aviso al grupo.
    if (evolution.esContactoPersonal(chatId)) {
      console.log(`[excluidos] ${chatId}: lo excluyeron mientras se armaba la respuesta, cancelo`);
      sinRespuesta(SILENCIO_DEL_CORTE[MOTIVO_EXCLUIDO]);
      return;
    }
    const ctx = state.obtener(chatId);

    const mensajes = (resultado.mensajes || []).slice(0, config.ritmo.maxMensajesPorTanda);

    // Registro de aprendizaje: lo que se diría con ESTA tanda, con los id de SUS líneas y cómo llegaron.
    const ultimaDeLaTanda = datosDeLinea.get(conTexto[conTexto.length - 1]) || {};
    const deSonnet = resultado.deSonnet || null;
    aprendizaje.propuesta(chatId, {
      tanda: idTanda,
      lineas: conTexto.map((l) => (datosDeLinea.get(l) || {}).id || null),
      mensajes: mensajes.map(acciones.comoTexto),
      escalar: resultado.escalar,
      motivo: resultado.motivo,
      contexto: { humanoAtendiendo: Boolean(ultimaDeLaTanda.humanoAtendiendo), audio: tanda.some((l) => l.audio) },
      modo: modoDeLaPropuesta(chatId),
      ...(origen ? { origen } : {}),
      ...(deSonnet
        ? {
            fuente: 'sonnet',
            sonnet: {
              modelo: config.cerebro.modelo,
              reglas: cerebro.REGLAS_HASH,
              uso: deSonnet.uso || null,
              usd: deSonnet.usd || 0,
              ms: deSonnet.ms == null ? null : deSonnet.ms,
              guardia: deSonnet.guardia || null,
              herramientas: deSonnet.herramientas || [],
              // Para `npm run pruebas`: lo que pidió y devolvió cada herramienta de datos, y los montos que dejó escribir.
              ...(deSonnet.llamadas && deSonnet.llamadas.length ? { llamadas: deSonnet.llamadas } : {}),
              montos: deSonnet.montosDeHerramientas || [],
              leidos: deSonnet.leidos || null,
              ...(deSonnet.frenados ? { frenados: deSonnet.frenados } : {}),
              ...(deSonnet.corregida ? { corregida: deSonnet.corregida } : {}),
              ...(deSonnet.contexto ? { contexto: deSonnet.contexto } : {}),
              ...(deSonnet.imagenes ? { imagenes: deSonnet.imagenes } : {}),
            },
          }
        : {}),
    });
    anotada = true;
    const donde = { origen: origen || 'sonnet', tanda: idTanda };
    // Con `todos`, para el resumen de la hora: lo que costó y si escaló.
    if (deSonnet && config.cerebro.modo === 'todos') {
      cerebro.contarEnVivo('gasto', deSonnet);
      if (resultado.escalar) cerebro.contarEnVivo('escalado', deSonnet);
    }
    // Sonnet tenía que contestar y no pudo: queda el error, con el `tanda`.
    if (resultado.sonnetFallo) {
      const f = resultado.sonnetFallo;
      aprendizaje.anotar('propuesta-sonnet', chatId, {
        tanda: idTanda,
        modelo: config.cerebro.modelo,
        sonnet: { reglas: cerebro.REGLAS_HASH, ...(f.imagenes ? { imagenes: f.imagenes } : {}) },
        uso: f.uso || null,
        usd: f.usd || 0,
        ms: f.ms == null ? null : f.ms,
        error: f.error,
        enVivo: true,
        ...(origen ? { origen } : {}),
        ...(f.contexto ? { contexto: f.contexto } : {}),
      });
    }

    state.actualizar(chatId, {
      ultimaPropuestaBot: mensajes.map(acciones.comoTexto).join(' | '),
      ultimoMotivo: resultado.escalar ? resultado.motivo : '',
      // Queda para siempre: #vendido y #perdido lo usan para saber si el bot participó.
      ...(mensajes.length && !ctx.botPropuso ? { botPropuso: Date.now() } : {}),
    });

    // Hace falta una persona: Erasmo no le contesta y el grupo recibe el aviso. Este aviso no depende de
    // `escalado`: si el chat ya se había escalado por otra cosa, igual sale. Al cliente, a lo sumo, el mensaje
    // fijo del código ("Enseguida te respondemos."), una vez por escalado (escalarEnSilencio).
    if (resultado.escalar && !mensajes.length) {
      await escalarEnSilencio({ chatId, nombre, motivo: resultado.motivo, ctx, calla: resultado.callar !== false, tanda: idTanda });
      sinRespuesta(resultado.sonnetFallo ? 'sonnet-no-pudo' : String(resultado.motivo || '').includes('ya se lo dije') ? 'repetido' : 'escalo');
      return;
    }
    if (!mensajes.length) return;

    // Modo escucha: queda en el registro de aprendizaje y no sale ni un mensaje.
    if (config.modoEscucha) {
      console.log(`[escucha] ${chatId}: habria dicho -> ${mensajes.map(acciones.comoTexto).join(' | ').slice(0, 120)}`);
      sinRespuesta('escucha');
      return;
    }

    // Interpretar lleva un rato: si en ese rato contestó una persona, no se manda.
    if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) {
      console.log(`[${chatId}] contestó una persona mientras se armaba la respuesta, cancelo`);
      sinRespuesta(state.obtener(chatId).pausado ? 'pausado' : 'persona');
      return;
    }

    // Un solo punto cubre todo camino a un cliente: si el destino no está en las listas de prueba, o en
    // borrador, el cliente no recibe nada y el borrador llega al grupo. Es la única definición de "le llega
    // al cliente" (evolution.js); el modo escucha ya retornó arriba.
    if (!evolution.leLlegaAlCliente(chatId)) {
      await evolution.avisarGrupo(
        avisoParaGrupo({
          chatId,
          nombre,
          motivo: resultado.escalar ? resultado.motivo : 'respuesta automática',
          borrador: mensajes.map(acciones.comoTexto).join('\n') + (resultado.acciones && resultado.acciones.catalogo ? '\n[+ catálogo en PDF]' : ''),
        })
      );
      state.actualizar(chatId, { ultimoBot: Date.now() });
      sinRespuesta(config.modoBorrador ? 'borrador' : 'fuera-de-prueba');
      return;
    }

    let enviados = 0;
    const siContestoSonnet = async () => {
      if (deSonnet && enviados) await avisarRespuestaSonnet({ chatId, nombre, ctx, resultado, deSonnet });
    };

    for (let i = 0; i < mensajes.length; i++) {
      const m = mensajes[i];
      // "escribiendo…", la espera del ritmo, RECIÉN AHÍ el control, y el envío con delay 0: un #reset, un
      // #pausa o una persona que entra en ese rato frenan lo que falta.
      await evolution.mostrarEscribiendo(chatId, config.ritmo.entreMensajesMs);
      await dormir(config.ritmo.entreMensajesMs);
      state.comprobarVigente(chatId);
      const corte = motivoDeCorte(chatId, conocidas, cortarPorMensajeNuevo);
      if (corte) {
        console.log(`[corte] ${chatId}: ${corte}, ${mensajes.length - i} mensaje(s) sin mandar`);
        sinRespuesta(SILENCIO_DEL_CORTE[corte] || 'corte', { sinMandar: mensajes.length - i });
        await siContestoSonnet();
        return corte === MENSAJE_NUEVO ? { reencolar: tanda } : undefined;
      }
      // Un texto se manda SIEMPRE como texto, aunque tenga corchetes o forma de marcador. El bot de Piedra
      // no manda archivos: una acción que no es texto no sale.
      if (!(typeof m === 'string' || acciones.esTexto(m))) {
        console.error(`[${chatId}] un mensaje que no es texto: no lo mando`);
        continue;
      }
      const t = acciones.comoTexto(m);
      const enviado = await enviarAlCliente(chatId, 'texto', t, () => evolution.enviarTexto(chatId, t, 0), acciones.marcasDe(m), donde);
      anotarEnvio(chatId, enviado);
      if (autoria.llego(enviado)) enviados++;
      // Sin id de Evolution no se sabe si le llegó: no cuenta como "ya se lo dije".
      state.agregarAlHistorial(chatId, 'vendedor', t, autoria.llego(enviado) ? { id: enviado.key.id } : { sinConfirmar: true });
      state.actualizar(chatId, { ultimoBot: Date.now() });
    }

    // Lo que pidieron las herramientas (el catálogo, el seguimiento) se hace ACÁ, después de los mensajes y por
    // el mismo camino (un corte antes de cada envío lo frena). Un turno que escaló no deja acciones.
    const acc = resultado.acciones || {};
    const catalogoSalio = acc.catalogo ? await mandarCatalogo(chatId, conocidas, cortarPorMensajeNuevo, donde) : false;
    if (acc.seguimiento && (enviados || catalogoSalio)) {
      seguimiento.anotar(chatId, acc.seguimiento);
      console.log(`[seguimiento] ${chatId}: volver a contactar el ${acc.seguimiento.fecha}`);
    }
    await siContestoSonnet();

    // Un escalado que además mandó algo (hoy no pasa: Sonnet escala sin mandar nada). Queda por si una
    // herramienta futura lo hace.
    const callaEste = resultado.callar !== false;
    if (resultado.escalar && control.escalaEncima(ctx, callaEste)) {
      control.escalar(chatId, resultado.motivo, { calla: callaEste });
      await evolution.avisarGrupo(avisoParaGrupo({ chatId, nombre, motivo: resultado.motivo }));
    }
  } catch (e) {
    // Un #reset en el medio no es una falla: la tanda se descarta en atenderChat.
    if (e instanceof state.ChatReiniciado) throw e;
    console.error(`[${chatId}] error procesando:`, e);
    sinRespuesta('error');
    await evolution.avisarGrupo(
      `⚠️ El bot falló con ${chatId.split('@')[0]} y no respondió.\nMotivo: ${e.message}\nChat: https://wa.me/${chatId.split('@')[0]}`
    );
  }
}

// ---------------------------------------------------------------------------
// Tandas de chats sin contestar y reactivación (18/11/2026): src/tandas.js y src/reactivacion.js
// ---------------------------------------------------------------------------
// Los dos mandan mensajes a clientes que NO acaban de escribir, así que van con todos los candados juntos y cada
// uno vuelve a mirarse justo antes de CADA envío. Nada de esto sale sin la orden de Tomás en el grupo (#tanda-ok) o sin
// ERASMO_REACTIVACION_ACTIVA=true.

/**
 * Por qué NO se puede mandar nada ahora (las tandas y la reactivación), o null: apagado con #apagar, escucha,
 * borrador, o un CEREBRO_MODO que no manda (con `apagado`, `sombra` y `tester` nadie le escribe a un cliente viejo).
 */
function frenoGeneralDeEnvio() {
  if (!interruptor.prendida()) return 'el bot está apagado (#apagar)';
  if (config.modoEscucha) return 'MODO_ESCUCHA: no sale nada';
  if (config.modoBorrador) return 'MODO_BORRADOR: al cliente no le llega nada';
  if (!tandas.MODOS_QUE_MANDAN.includes(config.cerebro.modo)) return `CEREBRO_MODO=${config.cerebro.modo}: solo con nuevos o todos se le escribe a un cliente`;
  return null;
}

/**
 * Por qué NO se le manda ahora a ESTE chat, o null. Los candados de siempre (excluido, pausado, escalado, una persona
 * de la cuenta, #bot, #vendido / #perdido, tester) más `leLlegaAlCliente` (las listas de prueba y SOLO_CHATS_NUEVOS: un
 * chat viejo no recibe con SOLO_CHATS_NUEVOS=true) y que no tenga una tanda en curso (si el cliente escribió, ya lo
 * está atendiendo el flujo de siempre). Se mira antes y otra vez justo antes de cada envío. No lee la red.
 */
function frenoDeChatMasivo(chatId) {
  if (evolution.esContactoPersonal(chatId)) return MOTIVO_EXCLUIDO;
  const s = state.todos()[chatId];
  if (!s) return 'el chat ya no existe (¿#reset?)';
  const noCuenta = motivoQueNoCuenta(chatId, s);
  if (noCuenta) return noCuenta;
  if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) return 'escribió alguien de la cuenta hace poco';
  if (!evolution.leLlegaAlCliente(chatId)) return `no le llegaría: ${porQueNoLeLlega()}`;
  if (enProceso.has(chatId) || (pendientes.get(chatId) || []).length) return 'tiene una tanda en curso (escribió el cliente)';
  return null;
}

/**
 * ¿Cambió el chat desde que se armó la propuesta? Lo relee de Evolution (solo lectura) y compara su último mensaje con
 * el que se leyó: si es otro, escribió el cliente o una persona de la cuenta y a este chat no se le manda. Sin poder
 * verificarlo, tampoco: ante la duda, no se le escribe. Devuelve el motivo o null.
 */
async function cambioEnElChat(chatId, esperada) {
  const lec = await lectura.leerLargo(chatId, { cuantos: 10 });
  if (!lec.evolution) return `no pude verificar el chat (${lec.error})`;
  const u = lec.lineas[lec.lineas.length - 1];
  if (!u) return 'el chat quedó vacío';
  const igual = esperada.id && u.id ? String(u.id) === String(esperada.id) : Number(u.ts) === Number(esperada.ts);
  if (u.quien === esperada.quien && igual) return null;
  return u.quien === 'cliente' ? 'el cliente escribió de nuevo desde que se armó la propuesta' : 'una persona de la cuenta escribió desde que se armó la propuesta';
}

/** ¿El cliente escribió algo después de `ts`? (lo que ya sabe el estado) */
const clienteEscribioDespues = (chatId, ts) => ((state.todos()[chatId] || {}).historial || []).some((l) => l && l.quien === 'cliente' && Number(l.ts) > Number(ts));

/**
 * Manda UN chat de una tanda ya aprobada con #tanda-ok (lo llama tandas.js). `item.accion` es 'responder' o 'escalar'.
 * Devuelve { resultado: 'enviado' | 'escalado' | 'salteado', motivo }. Antes de nada: los candados (`frenoDeChatMasivo`) y
 * que el último mensaje del chat siga siendo el que se leyó (`cambioEnElChat`). Después, el mismo camino que una
 * respuesta de siempre: lo ya dicho se saca (`cerebro.comoResultado`), "escribiendo…", la espera del ritmo, el control
 * antes de CADA mensaje, `enviarAlCliente` (origen 'tanda'), el catálogo y el seguimiento si los pidió. El chat queda con
 * `atiendeSonnet: true`. Un escalado sale como uno normal (`escalarEnSilencio`: el 🔕 al grupo y, solo si el chat se
 * calla, "Enseguida te respondemos."). Un #reset en el medio corta este chat.
 */
async function mandarChatDeTanda(item, tandaId) {
  const chatId = item.chatId;
  const donde = { origen: 'tanda', tanda: `T${tandaId}` };
  try {
    return await tandaEnCurso.run({ chatId, generacion: state.generacion(chatId) }, async () => {
      const freno = frenoDeChatMasivo(chatId) || (await cambioEnElChat(chatId, item.ultimaLinea));
      if (freno) return { resultado: 'salteado', motivo: freno };
      const nombre = state.obtener(chatId).nombre || item.nombre || '';
      const sonnet = { modelo: config.cerebro.modelo, reglas: cerebro.REGLAS_HASH, usd: item.usd || 0, herramientas: item.herramientas || [] };

      if (item.accion === 'escalar') {
        cerebro.comoResultado(chatId, { escalar: true, motivo: item.motivo, mensajes: [] }, { nombre });
        aprendizaje.propuesta(chatId, { tanda: donde.tanda, lineas: [], mensajes: [], escalar: true, motivo: item.motivo, contexto: { humanoAtendiendo: false, audio: false }, modo: 'vivo', origen: 'tanda', fuente: 'sonnet', sonnet });
        await escalarEnSilencio({ chatId, nombre, motivo: item.motivo, ctx: state.obtener(chatId), calla: true, tanda: donde.tanda });
        return control.callado(state.obtener(chatId)) ? { resultado: 'escalado' } : { resultado: 'salteado', motivo: 'el aviso al grupo no salió o ese motivo ya se había avisado' };
      }

      // Lo que ya se le dijo se saca otra vez (la propuesta es de hace un rato) y se anota la ficha, como en vivo.
      const r = cerebro.comoResultado(chatId, { mensajes: item.mensajes, escalar: false, acciones: item.acciones || {}, cotizo: item.cotizo || null }, { nombre });
      if (r.escalar || !r.mensajes.length) return { resultado: 'salteado', motivo: 'lo que iba a decir ya se lo había dicho' };
      const mensajes = r.mensajes.slice(0, config.ritmo.maxMensajesPorTanda);
      aprendizaje.propuesta(chatId, { tanda: donde.tanda, lineas: [], mensajes: mensajes.map(acciones.comoTexto), escalar: false, motivo: '', contexto: { humanoAtendiendo: false, audio: false }, modo: 'vivo', origen: 'tanda', fuente: 'sonnet', sonnet });
      state.actualizar(chatId, {
        ultimaPropuestaBot: mensajes.map(acciones.comoTexto).join(' | '),
        ...(!state.obtener(chatId).botPropuso ? { botPropuso: Date.now() } : {}),
      });
      let enviados = 0;
      let corte = null;
      for (const m of mensajes) {
        await evolution.mostrarEscribiendo(chatId, config.ritmo.entreMensajesMs);
        await dormir(config.ritmo.entreMensajesMs);
        state.comprobarVigente(chatId);
        corte = frenoDeChatMasivo(chatId) || (clienteEscribioDespues(chatId, item.ultimaLinea.ts) ? 'el cliente escribió en el medio' : null);
        if (corte) break;
        const t = acciones.comoTexto(m);
        const enviado = await enviarAlCliente(chatId, 'texto', t, () => evolution.enviarTexto(chatId, t, 0), acciones.marcasDe(m), donde);
        anotarEnvio(chatId, enviado);
        if (autoria.llego(enviado)) {
          enviados++;
          if (enviados === 1) state.actualizar(chatId, { atiendeSonnet: true, atiendeSonnetDesde: Date.now() });
        }
        state.agregarAlHistorial(chatId, 'vendedor', t, autoria.llego(enviado) ? { id: enviado.key.id } : { sinConfirmar: true });
        state.actualizar(chatId, { ultimoBot: Date.now() });
      }
      if (!enviados) return { resultado: 'salteado', motivo: corte || 'no salió ningún mensaje' };
      const acc = r.acciones || {};
      const catalogoSalio = acc.catalogo && !corte ? await mandarCatalogo(chatId, new Set(), false, donde) : false;
      if (acc.seguimiento && (enviados || catalogoSalio)) {
        seguimiento.anotar(chatId, acc.seguimiento);
        console.log(`[seguimiento] ${chatId}: volver a contactar el ${acc.seguimiento.fecha}`);
      }
      console.log(`[tanda] ${chatId}: salieron ${enviados} de ${mensajes.length} mensaje(s)${corte ? ` (se cortó: ${corte})` : ''}`);
      return { resultado: 'enviado', ...(corte ? { motivo: `salieron ${enviados} de ${mensajes.length}: ${corte}` } : {}) };
    });
  } catch (e) {
    if (e instanceof state.ChatReiniciado) return { resultado: 'salteado', motivo: 'se hizo #reset mientras se mandaba' };
    throw e;
  }
}

/**
 * Manda UN mensaje de la reactivación (lo llama reactivacion.js). Los candados de siempre, "escribiendo…", la espera del
 * ritmo, y otra vez los candados justo antes de mandar. El texto lo escribió el código (reactivacion-textos.js). Si sale
 * queda en el historial y el chat con `atiendeSonnet: true`. Devuelve { salio, motivo }.
 */
async function mandarReactivacion(chatId, texto, cand) {
  try {
    return await tandaEnCurso.run({ chatId, generacion: state.generacion(chatId) }, async () => {
      const antes = frenoDeChatMasivo(chatId) || (clienteEscribioDespues(chatId, cand.ultimaCuenta.ts) ? 'el cliente escribió' : null);
      if (antes) return { salio: false, motivo: antes };
      await evolution.mostrarEscribiendo(chatId, config.ritmo.entreMensajesMs);
      await dormir(config.ritmo.entreMensajesMs);
      state.comprobarVigente(chatId);
      const justo = frenoGeneralDeEnvio() || frenoDeChatMasivo(chatId) || (clienteEscribioDespues(chatId, cand.ultimaCuenta.ts) ? 'el cliente escribió' : null);
      if (justo) return { salio: false, motivo: justo };
      const enviado = await enviarAlCliente(chatId, 'texto', texto, () => evolution.enviarTexto(chatId, texto, 0), null, { origen: 'reactivacion', tanda: null });
      anotarEnvio(chatId, enviado);
      if (!autoria.llego(enviado)) return { salio: false, motivo: (enviado && enviado.motivo) || 'Evolution no lo confirmó' };
      state.agregarAlHistorial(chatId, 'vendedor', texto, { id: enviado.key.id });
      state.actualizar(chatId, { ultimoBot: Date.now(), atiendeSonnet: true, atiendeSonnetDesde: Date.now() });
      return { salio: true };
    });
  } catch (e) {
    if (e instanceof state.ChatReiniciado) return { salio: false, motivo: 'se hizo #reset mientras se mandaba' };
    throw e;
  }
}

/** El barrido de la reactivación (cada 15 minutos). Sin ERASMO_REACTIVACION_ACTIVA=true no hace nada. */
function revisarReactivacion(ahora = Date.now()) {
  return reactivacion.revisar({
    ahora,
    frenoGeneral: frenoGeneralDeEnvio,
    frenoDeChat: frenoDeChatMasivo,
    enviar: mandarReactivacion,
    esperar: () => dormir(esperaAleatoria()),
  });
}

setInterval(() => revisarReactivacion().catch((e) => console.error('[reactivacion] el barrido falló:', e.message)), 15 * 60 * 1000);
// Una tanda que quedó armándose o mandándose cuando el bot se reinició no sigue sola: queda 'interrumpida'.
tandas.alArrancar();

// Lo largo (armar una tanda, mandarla, la prueba de la reactivación) corre en segundo plano: el comando contesta ya.
const enSegundoPlano = new Set();
function enBackground(promesa) {
  enSegundoPlano.add(promesa);
  promesa.finally(() => enSegundoPlano.delete(promesa));
}
/** Para las pruebas: espera a que termine todo lo que corre en segundo plano. */
async function esperarSegundoPlano() {
  while (enSegundoPlano.size) await Promise.all([...enSegundoPlano]);
}

const alGrupo = (texto) => evolution.avisarGrupo(texto, { inmediato: true }).catch((e) => console.error('[grupo] no pude contestar:', e.message));

/** #tanda, #tanda-ok y #tanda-no, escritos por la cuenta en el grupo interno. */
async function comandoDeTandas(cmd) {
  if (cmd.problema) {
    await alGrupo(`❓ ${cmd.problema}. No hice nada.\n\n${tandas.COMO_SE_USA}`);
    return;
  }
  if (cmd.tipo === 'tanda') {
    enBackground(
      tandas
        .armar({ frenoGeneral: frenoGeneralDeEnvio, salenAlCliente: (id) => !frenoDeChatMasivo(id), alEmpezar: alGrupo })
        .then((r) => alGrupo(r.aviso))
        .catch((e) => console.error('[tandas] no pude armar:', e.message))
    );
    return;
  }
  if (cmd.tipo === 'tanda-no') {
    await alGrupo(tandas.descartar({ id: cmd.id }).aviso);
    return;
  }
  const r = tandas.ok({ id: cmd.id, omitir: cmd.omitir, frenoGeneral: frenoGeneralDeEnvio, mandarChat: mandarChatDeTanda, esperar: () => dormir(esperaAleatoria()) });
  await alGrupo(r.aviso);
  if (r.trabajo) {
    enBackground(
      r.trabajo.then(alGrupo).catch(async (e) => {
        console.error('[tandas] la tanda falló:', e);
        await alGrupo(`⚠️ La tanda ${cmd.id} se cortó por un error (${e.message}). Lo que ya salió quedó anotado en su archivo de data/tandas; no mando más. Revisalo antes de armar otra.`);
      })
    );
  }
}

/** #reactivar y #reactivar-prueba, escritos por la cuenta en el grupo interno. */
async function comandoDeReactivacion(cmd) {
  if (cmd.problema) {
    await alGrupo(`❓ ${cmd.problema}. No hice nada.\n\n${reactivacion.COMO_SE_USA}`);
    return;
  }
  if (cmd.tipo === 'reactivar') {
    await alGrupo(reactivacion.estado({ frenoGeneral: frenoGeneralDeEnvio }));
    return;
  }
  await alGrupo('Armo la prueba de la reactivación: miro a quién le saldría hoy y le pregunto a Sonnet por cada uno. No mando nada.');
  enBackground(
    reactivacion
      .armarPrueba({ frenoDeChat: frenoDeChatMasivo, frenoGeneral: frenoGeneralDeEnvio })
      .then((r) => alGrupo(r.aviso))
      .catch((e) => console.error('[reactivacion] no pude armar la prueba:', e.message))
  );
}

// ---------------------------------------------------------------------------
// Webhook (auditoría del 15/09/2026, A1)
// ---------------------------------------------------------------------------
// El webhook ordena mandar mensajes por el WhatsApp del negocio: no se le cree a cualquiera. En orden, lo
// barato primero:
//  1. el secreto de la ruta (WEBHOOK_SECRETO): sin él, 401 y el cuerpo ni se lee;
//  2. el tope de pedidos por minuto, que los pedidos sin secreto no gastan;
//  3. el cuerpo: JSON de hasta config.webhook.limiteCuerpo, evento de mensajes, la instancia (si viene) y
//     cada mensaje con su remoteJid.
// Evolution reintenta ante cualquier error salvo 400, 401, 403, 404 y 422: lo que no sirve se descarta con
// esos códigos, y el tope responde 429, que sí se reintenta y así no se pierde el mensaje.
//
// OJO: el cuerpo que manda Evolution trae su `apikey`. Nunca se loguea el cuerpo, ni la ruta (trae el secreto).

/** Compara en tiempo constante, también con largos distintos: se comparan los hashes. */
function mismoSecreto(recibido, esperado) {
  const a = crypto.createHash('sha256').update(String(recibido)).digest();
  const b = crypto.createHash('sha256').update(String(esperado)).digest();
  return crypto.timingSafeEqual(a, b);
}

let avisoSinSecreto = 0;
function verificarSecreto(req, res, next) {
  const esperado = config.webhook.secreto;
  // Sin secreto se acepta como siempre, también con algo después de /webhook.
  if (!esperado) return next();
  if (req.params.secreto !== undefined && mismoSecreto(req.params.secreto, esperado)) return next();
  // Una línea por minuto como mucho: un barrido no llena la consola.
  if (Date.now() - avisoSinSecreto > 60 * 1000) {
    avisoSinSecreto = Date.now();
    console.warn('[webhook] pedido sin el secreto correcto: 401 y no se procesa');
  }
  res.sendStatus(401);
}

// Tope simple en memoria: una ventana por minuto de reloj.
const tope = { minuto: -1, cuenta: 0, avisado: -1 };
function reiniciarTopeWebhook() {
  Object.assign(tope, { minuto: -1, cuenta: 0, avisado: -1 });
}
function dentroDelTope(req, res, next) {
  const minuto = Math.floor(Date.now() / 60000);
  if (minuto !== tope.minuto) Object.assign(tope, { minuto, cuenta: 0 });
  tope.cuenta++;
  if (tope.cuenta <= config.webhook.maxPorMinuto) return next();
  if (tope.avisado !== minuto) {
    tope.avisado = minuto;
    console.warn(`[webhook] más de ${config.webhook.maxPorMinuto} pedidos en un minuto: 429 hasta el minuto que viene`);
  }
  res.sendStatus(429);
}

const leerJson = express.json({ limit: config.webhook.limiteCuerpo });

/**
 * Qué hacer con un cuerpo ya leído: { status, motivo } si se descarta, o { lote } con los mensajes válidos
 * (vacío si el evento no es de mensajes, que no es un error).
 */
function validarCuerpo(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) return { status: 400, motivo: 'el cuerpo no es un objeto' };
  if (typeof cuerpo.event !== 'string') return { status: 400, motivo: 'sin event' };
  // connection.update y los demás eventos no se procesan, pero tampoco son un error.
  if (!/messages[._]upsert/i.test(cuerpo.event)) return { lote: [] };
  // Evolution v2 manda el nombre de la instancia en `instance`. Si no viene, no se exige.
  if (cuerpo.instance != null && cuerpo.instance !== config.evolution.instancia) return { status: 403, motivo: 'es de otra instancia' };
  const data = Array.isArray(cuerpo.data) ? cuerpo.data : [cuerpo.data];
  const lote = data.filter((d) => d && typeof d === 'object' && d.key && typeof d.key.remoteJid === 'string' && d.key.remoteJid);
  if (!lote.length) return { status: 400, motivo: 'no trae ningún mensaje con remoteJid' };
  if (lote.length < data.length) console.warn(`[webhook] descarté ${data.length - lote.length} mensaje(s) mal formados del lote`);
  return { lote };
}

// La hora del último mensaje que llegó por el webhook y se mandó a procesar, para /salud.
let ultimoMensaje = null;
// La hora del último mensaje que ENTRÓ (no `fromMe`): el reloj del guardián.
let ultimoEntrante = null;
// Cuántos mensajes repetidos se descartaron desde que arrancó, para /salud.
let duplicadosDescartados = 0;

/**
 * Mensajes repetidos por id: se reconoce por `remoteJid` + `key.id`, para todo mensaje del lote (también los
 * `fromMe`). Se marca como visto ACÁ, antes de procesar: si el proceso se cae a mitad, ese mensaje no se
 * reintenta, que es preferible a contestar dos veces. Sin `key.id` se procesa como siempre.
 */
function sinRepetidos(lote) {
  return lote.filter((d) => {
    const id = d.key && d.key.id;
    if (typeof id !== 'string' || !id) return true;
    if (state.marcarVisto(`${d.key.remoteJid}|${id}`)) return true;
    duplicadosDescartados++;
    console.log(`[webhook] repetido, lo descarto: ${d.key.remoteJid} ${id}`);
    return false;
  });
}

function recibirWebhook(req, res) {
  const r = validarCuerpo(req.body);
  if (r.status) {
    console.warn(`[webhook] descartado: ${r.motivo}`);
    return res.sendStatus(r.status);
  }
  res.sendStatus(200); // Evolution no espera: se responde ya y se procesa aparte
  const lote = sinRepetidos(r.lote);
  if (!lote.length) return;
  const llego = new Date().toISOString();
  ultimoMensaje = llego;
  if (lote.some((d) => !d.key.fromMe)) ultimoEntrante = llego;
  lote.forEach((d) => procesar(d).catch((e) => console.error('[webhook]', e.message)));
}

app.post(['/webhook', '/webhook/:secreto'], verificarSecreto, dentroDelTope, leerJson, recibirWebhook);

/** El commit con el que arrancó (hash corto), leído de .git sin lanzar procesos. null si no se puede. */
function commitActual() {
  try {
    const git = path.join(__dirname, '..', '.git');
    const head = fs.readFileSync(path.join(git, 'HEAD'), 'utf8').trim();
    if (!head.startsWith('ref:')) return /^[0-9a-f]{7,40}$/.test(head) ? head.slice(0, 7) : null;
    const ref = head.slice(4).trim();
    const suelta = path.join(git, ref);
    if (fs.existsSync(suelta)) return fs.readFileSync(suelta, 'utf8').trim().slice(0, 7);
    const linea = fs
      .readFileSync(path.join(git, 'packed-refs'), 'utf8')
      .split('\n')
      .find((l) => l.trim().endsWith(' ' + ref));
    return linea ? linea.slice(0, 7) : null;
  } catch {
    return null;
  }
}
// Es el último commit: los cambios sin commitear no se ven acá.
const VERSION = { commit: commitActual(), arranque: new Date().toISOString() };
// Cada evento del registro de aprendizaje lleva este commit.
aprendizaje.usarCommit(VERSION.commit);

/** El modo en que está contestando de verdad. */
function modoEfectivo() {
  if (config.modoEscucha) return 'escucha';
  if (config.modoBorrador) return 'borrador';
  const tester = config.numerosTester.length > 0;
  if (config.pilotoTodos) return tester ? 'en vivo para todos, con tester' : 'en vivo';
  const piloto = config.numerosPiloto.length > 0;
  if (tester && piloto) return 'en vivo con tester y piloto';
  if (tester) return 'en vivo con tester';
  if (piloto) return 'en vivo con piloto';
  return 'en vivo';
}

/** Lo que muestra /salud, sin datos de clientes ni el secreto. */
async function datosDeSalud() {
  const estado = await evolution.estadoInstancia().catch(() => ({ state: 'error' }));
  return {
    negocio: 'Somos Piedra',
    instancia: config.evolution.instancia,
    whatsapp: estado.state,
    // Cerebro Sonnet: el modo, el gasto de hoy (en memoria), el de este mes y el hash de cerebro-reglas.md.
    cerebro: cerebro.resumenSalud(),
    config: configParaSalud(),
    // Sombra con persona: si está prendida, hasta qué día, y lo de hoy (en memoria).
    sombraPersona: sombraPersona.resumen(),
    modo: modoEfectivo(),
    numerosTester: config.numerosTester.length,
    numerosPiloto: config.pilotoTodos ? 'todos' : config.numerosPiloto.length,
    contactosPersonales: config.contactosPersonales.length,
    // Excluidos por comando (#excluir): solo la cantidad.
    excluidos: state.numerosExcluidos().length,
    soloChatsNuevos: config.soloChatsNuevos,
    chatsViejos: chatsViejos.resumen(),
    modoBorrador: config.modoBorrador,
    webhookConSecreto: Boolean(config.webhook.secreto),
    // Solo cantidades: escalados que nadie tomó todavía y chats pausados.
    ...control.contar(),
    version: VERSION,
    ultimoMensaje,
    ultimoEntrante,
    duplicadosDescartados,
    // Guardián de Evolution: lo último que leyó de la instancia y si hay un corte detectado sin resolver.
    estadoInstancia: guardian.estado().estadoInstancia,
    guardianAvisoActivo: guardian.estado().avisoActivo,
    // Los avisos al grupo que no salieron desde que arrancó (bloqueados o con error).
    avisosGrupo: evolution.avisosGrupo(),
    // El interruptor general (#apagar / #prender).
    interruptor: interruptor.resumen(),
  };
}

/** Sin datos de clientes ni el secreto: /salud no pide credenciales. */
app.get('/salud', async (_req, res) => {
  res.json({ ok: true, ...(await datosDeSalud()) });
});

/** Para /salud: con qué config corre el barrido del silencio, sin leer el .env. */
function configParaSalud() {
  return {
    silencio: { minutosTrasPersona: config.silencioTrasHumanoMin, maxHoras: config.silencio.maxHoras, maxPorBarrido: config.silencio.maxPorBarrido },
  };
}

/**
 * Si el estado estaba dañado al arrancar (ver state.apartarDanado), se avisa UNA vez al grupo interno: que
 * estaba dañado, dónde quedó la copia y que el bot arrancó sin memoria.
 */
let avisoEstadoDanadoHecho = false;
async function avisarEstadoDanado() {
  const info = state.estadoDanado();
  if (!info || avisoEstadoDanadoHecho) return;
  avisoEstadoDanadoHecho = true;
  const texto =
    `⚠️ El archivo de estado del bot estaba dañado (${path.basename(state.ARCHIVO)}: ${info.error}).\n` +
    (info.copia ? `Quedó una copia tal cual en ${info.copia}\n` : 'No pude guardar una copia.\n') +
    'El bot arrancó sin memoria de los chats.';
  try {
    await evolution.avisarGrupo(texto, { inmediato: true });
  } catch (e) {
    console.error('[estado] no pude avisar al grupo que el estado estaba dañado:', e.message);
  }
}

// Errores de Express (JSON roto, cuerpo demasiado grande): el código y nada más, sin el stack.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') console.warn('[webhook] cuerpo demasiado grande: 413 y no se procesa');
  else if (err.type === 'entity.parse.failed') console.warn('[webhook] JSON mal formado: 400 y no se procesa');
  else console.error('[http] error:', err.message);
  if (res.headersSent) return;
  const status = Number(err.status || err.statusCode);
  res.sendStatus(status >= 400 && status < 600 ? status : 500);
});

// ---------------------------------------------------------------------------
// Lo que quedó sin contestar: el barrido del silencio de una persona y #sigue
// ---------------------------------------------------------------------------

/**
 * Las líneas del cliente seguidas al final del historial (desde la última que no es suya): lo que dejó
 * escrito y nadie le contestó. [] si lo último no es del cliente.
 */
function ultimasDelCliente(h) {
  let i = h.length;
  while (i > 0 && h[i - 1].quien === 'cliente') i--;
  return h.slice(i);
}

/** ¿La línea del cliente trae algo escrito? Una "[foto]" y un audio que no se entendió no. */
function conTextoDeVerdad(l) {
  const t = String(l.texto || '').trim();
  return Boolean(t) && !esFotoDelCliente(l) && !/^\[audio( que no se entendio)?\]$/i.test(t);
}

/** El motivo de `porQueNoSeContesta` con una tanda en curso: para #sigue, esa tanda ya le está contestando. */
const TANDA_EN_CURSO = 'ya hay una tanda en curso';

/**
 * Por qué no se le contesta ahora lo que quedó sin respuesta en un chat (el barrido del silencio y #sigue),
 * o null: un contacto personal, un chat que no atiende Sonnet, uno fuera de las listas de prueba o uno con
 * una tanda en curso.
 */
function porQueNoSeContesta(chatId) {
  if (evolution.esContactoPersonal(chatId)) return 'es un contacto personal';
  if (cerebro.quienAtiende(chatId) !== 'sonnet') return 'no lo atiende Sonnet';
  if (!evolution.esDestinoDePrueba(chatId)) return porQueNoLeLlega();
  if (enProceso.has(chatId) || (pendientes.get(chatId) || []).length) return TANDA_EN_CURSO;
  return null;
}

/**
 * Cuando vence el silencio de una persona: si un cliente escribe dentro de los SILENCIO_TRAS_HUMANO_MIN en
 * que habló una persona, su línea entra al historial pero no a una tanda; cuando el silencio vence, nadie le
 * contestaba. Devuelve las líneas del cliente que esperan, o null. Le toca a un chat si tiene
 * `ultimoHumano` vencido, lo último del historial es del cliente (de después de `ultimoHumano`) y la primera
 * de esas líneas llegó mientras atendía la persona, la última tiene menos de SILENCIO_MAX_HORAS, no está
 * escalado ni pausado, `porQueNoSeContesta` da null y no se atendió antes (`silencioAtendido`).
 */
function lineasSinContestar(chatId, s, ahora) {
  if (!s || !(Number(s.ultimoHumano) > 0)) return null;
  if (porQueNoSeContesta(chatId)) return null;
  const silencio = config.silencioTrasHumanoMin * 60 * 1000;
  if (ahora - s.ultimoHumano < silencio) return null;
  if (s.pausado || s.escalado || control.callado(s)) return null;
  const delCliente = ultimasDelCliente(s.historial || []).filter((l) => !esFotoDelCliente(l) && Number(l.ts) > s.ultimoHumano);
  if (!delCliente.length || delCliente[0].ts >= s.ultimoHumano + silencio) return null;
  const ultima = delCliente[delCliente.length - 1];
  if (ahora - ultima.ts > config.silencio.maxHoras * 60 * 60 * 1000) return null;
  if (Number(s.silencioAtendido) >= ultima.ts) return null;
  const conTexto = delCliente.filter(conTextoDeVerdad);
  // Solo acuses o agradecimientos: la charla la cerró la persona.
  if (!conTexto.length || conTexto.every((l) => esCierre(l.texto))) return null;
  return conTexto;
}

/**
 * Pone a contestar líneas del cliente que quedaron sin respuesta (el barrido del silencio y #sigue): marca el
 * chat como atendido hasta la última (`silencioAtendido`) y las deja en la cola con su `origen`. La tanda la
 * arranca quien llama (atenderChat).
 */
function encolarSinContestar(chatId, lineas, origen) {
  state.actualizar(chatId, { silencioAtendido: lineas[lineas.length - 1].ts });
  for (const l of lineas) {
    const antes = datosDeLinea.get(l) || {};
    datosDeLinea.set(l, { id: antes.id || l.id || null, humanoAtendiendo: false, origen });
  }
  pendientes.set(chatId, [...lineas]);
}

/**
 * El barrido del silencio (cada 1 minuto): hasta SILENCIO_MAX_POR_BARRIDO chats. Lo decide Sonnet: contesta,
 * o escala. Si Sonnet no puede, escala en silencio. Nunca en escucha ni en borrador. Devuelve los chats que
 * tomó, cuando terminan.
 */
async function revisarSilencios({ ahora = Date.now() } = {}) {
  if (config.modoEscucha || config.modoBorrador) return [];
  if (!interruptor.prendida()) return [];
  const tomados = [];
  for (const [chatId, s] of Object.entries(state.todos())) {
    if (tomados.length >= config.silencio.maxPorBarrido) break;
    const lineas = lineasSinContestar(chatId, s, ahora);
    if (!lineas) continue;
    encolarSinContestar(chatId, lineas, 'silencio');
    console.log(`[silencio] ${chatId}: venció el silencio de la persona y nadie le contestó ${lineas.length} línea(s): lo atiende Sonnet`);
    tomados.push({ chatId, nombre: s.nombre || '' });
  }
  await Promise.all(tomados.map(({ chatId, nombre }) => atenderChat(chatId, nombre).catch((e) => console.error(`[silencio] ${chatId}:`, e.message))));
  return tomados.map((t) => t.chatId);
}

/**
 * #sigue contesta lo que quedó sin respuesta: sus líneas seguidas al final del historial con texto. Se le
 * contesta si el bot está prendido y ni en escucha ni en borrador, `porQueNoSeContesta` da null, lo último
 * del historial es del cliente, dejó texto de menos de SILENCIO_MAX_HORAS y no son todos acuses. Devuelve
 * { lineas } o { motivo }.
 */
function sinContestarAlSeguir(chatId, ahora = Date.now()) {
  if (!interruptor.prendida()) return { motivo: 'el bot está apagado' };
  if (config.modoEscucha || config.modoBorrador) return { motivo: porQueNoLeLlega() };
  const no = porQueNoSeContesta(chatId);
  if (no) return { motivo: no };
  const h = (state.todos()[chatId] || {}).historial || [];
  const ultima = h[h.length - 1];
  if (!ultima || (ultima.quien !== 'cliente' && !ultima.humano)) return { motivo: 'no dejó nada sin contestar' };
  if (ultima.quien !== 'cliente') return { motivo: 'lo último es de una persona' };
  const lineas = ultimasDelCliente(h).filter(conTextoDeVerdad);
  if (!lineas.length) return { motivo: 'lo último no tiene texto: una foto o un audio' };
  if (ahora - Number(lineas[lineas.length - 1].ts) > config.silencio.maxHoras * 60 * 60 * 1000) {
    return { motivo: `lo último que escribió es de hace más de ${config.silencio.maxHoras} h` };
  }
  if (lineas.every((l) => esCierre(l.texto))) return { motivo: 'lo último es un ok o un gracias' };
  return { lineas };
}

/**
 * Lo que hace cada #sigue después de reactivar: si toca, las líneas van a la cola (origen 'sigue') y quien
 * llama arranca la tanda. Devuelve { contesta: true } o { contesta: false, motivo } (con una tanda en curso,
 * también `enCurso`).
 */
function alSeguir(chatId, ahora = Date.now()) {
  const r = sinContestarAlSeguir(chatId, ahora);
  if (!r.lineas) {
    console.log(`[sigue] ${chatId}: reactivado, no le contesto ahora (${r.motivo})`);
    return { contesta: false, motivo: r.motivo, ...(r.motivo === TANDA_EN_CURSO ? { enCurso: true } : {}) };
  }
  encolarSinContestar(chatId, r.lineas, 'sigue');
  console.log(`[sigue] ${chatId}: reactivado, le contesto ${r.lineas.length} línea(s) que dejó escritas`);
  return { contesta: true };
}

setInterval(() => revisarSilencios().catch(() => {}), 60 * 1000);

// ---------------------------------------------------------------------------
// Comandos y barridos
// ---------------------------------------------------------------------------

/** `#recordar` / `#hecho` en el chat de un cliente: guarda y confirma al grupo. */
async function atenderComando(chatId, cmd, origen) {
  let resultado;
  if (cmd.tipo === 'recordar') {
    resultado = recordatorios.alRecordar(chatId, cmd.texto, origen);
    if (resultado.anotado) console.log(`[recordatorio] anotado en ${chatId}`);
  } else {
    resultado = recordatorios.alHecho(chatId);
    console.log(`[recordatorio] ${resultado.cerrado ? 'cerrado' : 'no habia nada para cerrar'} en ${chatId}`);
  }
  if (!resultado.aviso) return;
  const r = await evolution.avisarGrupo(resultado.aviso, { inmediato: true });
  if (r && r.bloqueado) console.log(`[recordatorio] queda guardado, pero la confirmacion no salio: ${r.motivo}`);
}

/** `#vendido` / `#perdido` en el chat de un cliente: guarda y confirma al grupo. */
async function atenderVenta(chatId, cmd, origen) {
  await confirmarVenta(ventas.marcar(chatId, cmd.tipo, origen));
}

/** Confirma al grupo un #sinstock / #hay (o la lista). Nunca manda nada al cliente. */
async function confirmarStockColores({ cambio, texto }) {
  if (cambio) console.log('[stock-colores] ' + texto.split('\n')[0]);
  const r = await evolution.avisarGrupo(texto, { inmediato: true });
  if (r && r.bloqueado) console.log('[stock-colores] ' + (cambio ? 'queda guardado, pero ' : '') + 'la confirmacion no salio: ' + r.motivo);
}

/**
 * Confirma al grupo lo que pasó con un #excluir / #incluir / #excluidos, venga del chat o del grupo. Si se
 * excluyó a alguien, la tanda que tuviera esperando se descarta (la que ya está en vuelo la frenan
 * `atenderTanda` y `motivoDeCorte`). Nunca manda nada al cliente.
 */
async function confirmarExcluidos({ tipo, numero, cambio, avisos }) {
  if (cambio) console.log(`[excluidos] #${tipo} ${numero}`);
  if (cambio) {
    // Lo que el cliente dejó sin contestar mientras lo atendía una persona (o antes del cambio) no se lo
    // contesta el barrido del silencio de pronto cuando se lo vuelve a incluir: se da por atendido. Solo
    // los chats que ya existen (state.actualizar crearía uno vacío para un número que nunca escribió).
    for (const id of Object.keys(state.todos())) {
      if (id.endsWith('@s.whatsapp.net') && evolution.estaEnLaLista(id, [numero])) state.actualizar(id, { silencioAtendido: Date.now() });
    }
  }
  if (cambio && tipo === 'excluir') {
    for (const id of [...pendientes.keys()]) {
      if (!evolution.estaEnLaLista(id, [numero])) continue;
      const cola = pendientes.get(id) || [];
      if (cola.length) aprendizaje.silencio(id, { motivo: SILENCIO_DEL_CORTE[MOTIVO_EXCLUIDO], lineas: idsDe(cola) });
      pendientes.delete(id);
    }
  }
  for (const aviso of avisos) {
    const r = await evolution.avisarGrupo(aviso, { inmediato: true });
    if (r && r.bloqueado) {
      console.log(`[excluidos] ${cambio ? 'queda guardado, pero ' : ''}la confirmacion no salio: ${r.motivo}`);
      break;
    }
  }
}

/** Confirma al grupo un #pausa / #sigue escrito en el grupo con el número. */
async function confirmarControl({ chatId, tipo, cambio, aviso }) {
  if (chatId) console.log(`[control] ${chatId}: #${tipo} desde el grupo${cambio ? '' : ' (no cambió nada)'}`);
  if (!aviso) return;
  const r = await evolution.avisarGrupo(aviso, { inmediato: true });
  if (r && r.bloqueado) console.log(`[control] la confirmacion no salio: ${r.motivo}`);
}

/** Contesta en el grupo un #apagar / #prender. */
async function confirmarInterruptor({ tipo, cambio, aviso }) {
  console.log(`[interruptor] #${tipo} desde el grupo${cambio ? '' : ' (no cambió nada)'}`);
  const r = await evolution.avisarGrupo(aviso, { inmediato: true });
  if (r && r.bloqueado) console.log(`[interruptor] la confirmacion no salio: ${r.motivo}`);
}

/** Contesta en el grupo un #sonnet, #comparar, #bot o #sonnet-si. */
async function confirmarComandoSonnet({ tipo }, aviso) {
  console.log(`[sonnet] #${tipo} desde el grupo`);
  const r = await evolution.avisarGrupo(aviso, { inmediato: true });
  if (r && r.bloqueado) console.log(`[sonnet] la respuesta de #${tipo} no salió: ${r.motivo}`);
}

/** Confirma al grupo lo que pasó con un #vendido / #perdido, venga del chat o del grupo. */
async function confirmarVenta({ chatId, tipo, cambio, aviso }) {
  if (cambio) console.log(`[ventas] ${chatId} anotado como ${tipo}`);
  if (!aviso) return;
  const r = await evolution.avisarGrupo(aviso, { inmediato: true });
  if (r && r.bloqueado) console.log(`[ventas]${cambio ? 'queda guardado, pero ' : ''}la confirmacion no salio: ${r.motivo}`);
}

/**
 * Recordatorios manuales. Cada vuelta pregunta "¿ya empezó una hora en punto nueva desde el último
 * aviso?", así sale a horario, un reinicio no lo repite y una PC apagada no junta avisos. Todos los que
 * tocan salen en UN mensaje, y se cuentan DESPUÉS de que salió.
 */
let bloqueoRecordatoriosAvisado = '';
async function revisarRecordatorios(ahora = new Date()) {
  recordatorios.purgar(ahora);
  const lista = recordatorios.pendientes(ahora);
  if (!lista.length) return;

  // El motivo de un bloqueo se loguea una vez por día.
  const bloqueo = evolution.motivoBloqueoAvisos();
  if (bloqueo) {
    const hoy = ahora.toDateString();
    if (bloqueoRecordatoriosAvisado !== hoy + bloqueo) {
      bloqueoRecordatoriosAvisado = hoy + bloqueo;
      console.log(`[recordatorios] ${lista.length} sin mandar: ${bloqueo}. Quedan guardados y reintento en el proximo ciclo.`);
    }
    return;
  }

  try {
    const partes = recordatorios.armar(lista, ahora);
    let r = null;
    for (const parte of partes) {
      r = await evolution.avisarGrupo(parte);
      if (!r || r.bloqueado) break;
    }
    if (r && !r.bloqueado) {
      recordatorios.marcarEnviados(lista, ahora);
      console.log(`[recordatorios] ${lista.length} al grupo en ${partes.length} mensaje(s)`);
    } else {
      console.error(`[recordatorios] no salieron${r && r.motivo ? ': ' + r.motivo : ''}. Reintento en el proximo ciclo.`);
    }
  } catch (e) {
    console.error('[recordatorios] no pude mandarlos:', e.message, '· reintento en el proximo ciclo.');
  }
}

setInterval(() => revisarRecordatorios().catch(() => {}), 5 * 60 * 1000);

/**
 * Recordatorio de los escalados sin tomar (control.js): uno por escalado, cuando el cliente escribió algo
 * después y nadie de la cuenta lo tomó en ESCALADO_RECORDATORIO_MIN. Se da por recordado si el aviso salió.
 */
async function revisarEscalados(ahora = Date.now()) {
  for (const [chatId, s] of control.paraRecordar(ahora)) {
    const r = await evolution.avisarGrupo(control.recordatorio(chatId, s, ahora));
    if (r && !r.bloqueado) {
      state.actualizar(chatId, { escaladoRecordado: ahora });
      console.log(`[escalado] ${chatId}: recordatorio al grupo, nadie lo tomó`);
    }
  }
}

setInterval(() => revisarEscalados().catch(() => {}), 5 * 60 * 1000);

/**
 * Guardián de Evolution (guardian.js): cada GUARDIAN_MIN minutos mira si la instancia sigue en `open` y si
 * siguen llegando mensajes por el webhook, y avisa al grupo una vez por corte. Cada corte que abre o cierra
 * se lo cuenta a chats viejos.
 */
async function revisarGuardian(ahora = Date.now()) {
  await guardian.revisar({
    ahora,
    ultimoEntrante: ultimoEntrante ? Date.parse(ultimoEntrante) : null,
    arranque: Date.parse(VERSION.arranque),
    alAbrirCorte: (corte) => chatsViejos.abrirCorte(corte),
    alCerrarCorte: (corte) => chatsViejos.cerrarCorte(corte),
  });
}

setInterval(() => revisarGuardian().catch(() => {}), config.guardian.min * 60 * 1000);

function anunciarModo() {
  console.log(`SOMOS PIEDRA · instancia de Evolution: ${config.evolution.instancia}`);
  if (config.modoEscucha) console.log('MODO ESCUCHA: no manda ningun mensaje, solo escucha, guarda y registra');
  else if (config.modoBorrador) console.log('MODO BORRADOR: no le escribe a los clientes, manda los borradores al grupo');
  else console.log('EN VIVO: le esta respondiendo a los clientes de verdad');
  const modo = config.cerebro.modo;
  console.log(
    modo === 'apagado'
      ? 'CEREBRO_MODO=apagado: nadie contesta (no se llama a Sonnet)'
      : modo === 'sombra'
      ? 'CEREBRO_MODO=sombra: Sonnet piensa y se anota, no manda nada'
      : `CEREBRO_MODO=${modo}: Sonnet contesta (si falla, silencio y aviso al grupo)`
  );
  // Bien visible: cuántos contactos personales se ignoran.
  const n = config.contactosPersonales.length;
  console.log(`CONTACTOS PERSONALES: ${n} numero${n === 1 ? '' : 's'} en la lista negra${n ? ', se ignoran por completo' : ''}.`);
  const ex = state.numerosExcluidos().length;
  console.log(`EXCLUIDOS por comando: ${ex} numero${ex === 1 ? '' : 's'}${ex ? ', se ignoran por completo (#excluidos en el grupo)' : ''}.`);
  const testers = config.numerosTester.length;
  const pilotos = config.numerosPiloto.length;
  if (config.pilotoTodos) {
    console.log('');
    console.log('  ' + '='.repeat(58));
    console.log(`  EN VIVO PARA TODOS (NUMEROS_PILOTO=todos). Tester: ${testers} numero${testers === 1 ? '' : 's'}.`);
    console.log('  ' + '='.repeat(58));
    console.log('');
  } else if (testers || pilotos) {
    const cuantos = (k) => `${k} numero${k === 1 ? '' : 's'}`;
    console.log('');
    console.log('  ' + '='.repeat(58));
    console.log(`  LISTAS DE PRUEBA ACTIVAS: solo escribe al tester (${cuantos(testers)}) y al piloto (${cuantos(pilotos)}).`);
    console.log('  A cualquier otro lo trata como MODO_BORRADOR.');
    console.log('  Vaciar NUMEROS_TESTER y NUMEROS_PILOTO en el .env para volver a lo normal.');
    console.log('  ' + '='.repeat(58));
    console.log('');
  }
  if (config.numerosPruebaViejo) {
    console.log('  NUMEROS_PRUEBA quedó viejo, pasalo a NUMEROS_TESTER (por ahora se lee como tester).');
    console.log('');
  }
  // El webhook ordena mandar mensajes por el número del negocio.
  if (!config.webhook.secreto) {
    console.log('');
    console.log('  WEBHOOK SIN SECRETO: cualquiera que llegue a este puerto puede hacerse pasar');
    console.log('  por Evolution y hacer hablar al bot por el WhatsApp del negocio.');
    console.log('  Poné WEBHOOK_SECRETO en el .env y la misma URL en Evolution.');
    console.log('');
  }
  // Con la franja vacía los recordatorios se anotan y nunca suenan.
  if (!(config.recordatorio.hora < config.seguimiento.horaHasta)) {
    console.log(
      `RECORDATORIOS: RECORDATORIO_HORA=${config.recordatorio.hora} no es menor que ` +
        `SEGUIMIENTO_HORA_HASTA=${config.seguimiento.horaHasta}. No van a sonar nunca.`
    );
  }
}

/**
 * Levanta el servidor. Con HOST escucha solo en esa dirección; sin HOST, en todas las interfaces. Las
 * pruebas usan `procesar` y los barridos sin levantar el puerto.
 */
function escuchar(puerto = config.puerto, host = config.host, alEscuchar) {
  return host ? app.listen(puerto, host, alEscuchar) : app.listen(puerto, alEscuchar);
}

/**
 * Chats viejos: la puesta al día con Evolution, desde `alDia` hasta `escucha` (el momento en que el bot
 * empezó a escuchar el puerto). Corre solo cuando el bot arranca de verdad: requerir este archivo no toca
 * Evolution. Nunca tira. `extra` es para las pruebas.
 */
function arrancarChatsViejos(escucha = Date.now(), extra = {}) {
  return chatsViejos.arrancar({
    escucha,
    buscar: (q) => evolution.buscarMensajes(q),
    avisar: (texto) => evolution.avisarGrupo(texto),
    enEstado: (numero) => Object.prototype.hasOwnProperty.call(state.todos(), `${numero}@s.whatsapp.net`),
    esTester: (numero) => evolution.estaEnLaLista(numero, config.numerosTester),
    ...extra,
  });
}

if (require.main === module) {
  // Si estado.json no tiene el gasto de Sonnet del mes en curso, se arma una vez con el registro.
  if (cerebro.armarGastoMes({ eventos: () => aprendizaje.leerTodo() })) {
    const g = cerebro.gastoDelMes();
    console.log(`[sonnet] el gasto del mes (${g.mes}) se armó con el registro: US$${g.usd}`);
  }
  escuchar(config.puerto, config.host, () => {
    // Primero: desde acá, un mensaje que llega espera a la puesta al día (SOLO_CHATS_NUEVOS).
    arrancarChatsViejos(Date.now());
    const donde = config.host ? `solo en ${config.host}` : 'en todas las interfaces (HOST vacío)';
    console.log(`Bot escuchando en el puerto ${config.puerto}, ${donde}`);
    anunciarModo();
    console.log(cerebro.lineaDeReglas());
    avisarEstadoDanado();
  });
}

module.exports = {
  app,
  escuchar,
  datosDeSalud,
  reiniciarTopeWebhook,
  procesar,
  revisarSilencios,
  revisarReactivacion,
  esperarSegundoPlano,
  revisarRecordatorios,
  revisarEscalados,
  revisarGuardian,
  revisarResumenSonnet,
  revisarGastoMes,
  anunciarModo,
  modoEfectivo,
  arrancarChatsViejos,
  avisarEstadoDanado,
  TECHO_TANDA,
  AVISO_ESCALADO,
};
