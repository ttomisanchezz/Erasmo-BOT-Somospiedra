'use strict';
/**
 * Bot de WhatsApp — Somos iPhone NQN
 * Recibe los webhooks de Evolution API, decide qué responder y contesta.
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
const sheets = require('./sheets');
const { decidir, TODO_REPETIDO } = require('./responder');
const aprendizaje = require('./aprendizaje');
const resumen = require('./resumen');
const audio = require('./audio');
const recordatorios = require('./recordatorios');
const ventas = require('./ventas');
const acciones = require('./acciones');
const fotos = require('./fotos');
// Las fotos de los equipos del local (08/10/2026): el índice y la ruta de cada foto que eligió Sonnet con `mandar_fotos`.
const fotosEquipos = require('./fotos-equipos');
const documentos = require('./documentos');
const autoria = require('./autoria');
const control = require('./control');
const guardian = require('./guardian');
const chatsViejos = require('./chats-viejos');
// #bateria (01/10/2026): al cargarse le pasa a sheets.js la lista de usados que quedó elegida.
const bateria = require('./bateria');
const techsur = require('./techsur');
const espejoCotizador = require('./espejo-cotizador');
const stockApp = require('./stock-app');
// Cerebro Sonnet, fase 1 (01/10/2026): con CEREBRO_MODO=sombra piensa con cada tanda y lo anota.
// Fase 2 (02/10/2026): con tester, nuevos o todos contesta de verdad a los chats que le tocan.
const cerebro = require('./cerebro');
// Sonnet en sombra donde atiende una persona (03/10/2026, por 7 días): ver src/sombra-persona.js.
const sombraPersona = require('./sombra-persona');
const cerebroComandos = require('./cerebro-comandos');
// Sonnet ve las fotos del cliente (06/10/2026): con qué bajarlas y cómo (src/fotos-del-cliente.js).
const fotosDelCliente = require('./fotos-del-cliente');
// Bloque Ninjo 1b (05/10/2026): el historial que lee Sonnet se completa con Evolution (src/contexto.js).
const contexto = require('./contexto');
const promesas = require('./promesas');
const promoMadre = require('./promo-madre');
// El texto de un mensaje, compartido con contexto.js (hasta el bloque Ninjo 1b vivía acá). Desde el 07/10/2026,
// también la línea "[foto]" de una foto sin epígrafe (ver "Foto sin epígrafe" en `procesar`).
const { textoDelMensaje, marcadorSinTexto, LINEA_FOTO, esFotoDelCliente, conCita, sinCita } = require('./texto-del-mensaje');
// Panel Chiara (06/10/2026): el interruptor general y el módulo que reporta al panel de la app de
// ventas cada 1 minuto (src/interruptor.js y src/panel-chiara.js).
const interruptor = require('./interruptor');
const panel = require('./panel-chiara');

// Si la pestaña de usados elegida con #bateria no se puede leer, el bot cotiza con LISTA y lo
// avisa una vez al grupo (sheets.js decide cuándo).
sheets.alAvisar((texto) => evolution.avisarGrupo(texto));

/**
 * Carga el estado. Si el archivo existe y no se puede leer (bloque 4b: EBUSY,
 * EPERM, EACCES; state.js ya reintentó y mostró el error grande), el bot NO
 * arranca: si arrancara vacío, el primer guardado pisaría `data/estado.json`.
 * Cualquier otro error al cargar el módulo se tira como siempre.
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
// El JSON ya no se lee para cualquier pedido: solo en el webhook, después del
// secreto y del tope (ver "Webhook", más abajo).

// Tandas de mensajes por chat (ver atenderChat).
//  - enProceso: el chat tiene una tanda esperando, interpretándose o mandándose.
//  - pendientes: las líneas del historial que todavía no se interpretaron, en el
//    orden en que llegaron.
//  - transcripciones: la transcripción en curso de cada línea de audio.
//  - datosDeLinea: el id de WhatsApp de cada línea del cliente y si había una persona
//    atendiendo cuando llegó, para el registro de aprendizaje (bloque 6). Desde el 06/10/2026,
//    también `imagen` ({ key, mimetype }) si la línea es una foto, con o sin epígrafe: con eso se
//    baja para que la vea Sonnet (fotos-del-cliente.js). No va al historial ni al estado. El barrido
//    del silencio y #sigue (07/10/2026) la reemplazan con su `origen` (`encolarSinContestar`).
//  - tandaEnCurso: de qué chat y de qué generación es la tanda que corre en este
//    hilo asíncrono. state.js la consulta en cada lectura o escritura del chat:
//    una tanda que quedó de antes de un #reset no escribe ni manda nada más.
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

/**
 * Lo que recibe el cliente de prueba después de su #reset. Su eco vuelve por el
 * webhook como mensaje propio y se reconoce como cualquier envío del bot (autoria.js).
 */
const AVISO_RESET = '🔄 Reiniciado';

/**
 * El #reset del tester y sus typos (los de la prueba en vivo del 16/09/2026:
 * "#resset" y "#reseet" se tomaron como mensajes de venta). Solo desde NUMEROS_TESTER.
 */
const RE_RESET_TESTER = /^#(reset|resset|reseet|rest)\b/i;

/**
 * Cortes seguidos de una tanda porque el cliente escribió en medio (ver
 * atenderChat). Pasado este número, la tanda sale entera aunque llegue otro
 * mensaje: un cliente que escribe sin parar no se queda nunca sin respuesta.
 */
const MAX_CORTES_SEGUIDOS = 2;
const MENSAJE_NUEVO = 'llegó un mensaje nuevo del cliente';

/**
 * Techo de una tanda, en caracteres. Diez mensajes de una palabra no pesan nada;
 * tres audios largos sí: lo que agranda lo que se le pasa a Gemini es el texto,
 * no la cantidad de mensajes. Si una tanda se pasa, se corta ahí y el resto va
 * en la siguiente, en orden y con su propia espera. Un solo mensaje más largo
 * que el techo va igual, entero.
 */
const TECHO_TANDA = 700;

// Los JID de grupo ya vistos, para anotarlos una sola vez por arranque.
// Sirve para sacar el GRUPO_AVISOS_JID sin pelear con la API de Evolution:
// alcanza con que alguien escriba en el grupo interno.
const gruposVistos = new Set();

// Chats sin número (@lid, 28/09/2026): cuándo se avisó por última vez de cada uno. Vive en
// memoria: después de un reinicio puede salir un aviso de más, nunca uno de menos.
const avisosSinNumero = new Map();
const AVISO_SIN_NUMERO_CADA_MS = 24 * 60 * 60 * 1000;
// El PDF del compromiso que no salió (arreglos en vivo, 30/09/2026): cuándo se avisó por
// última vez de cada chat. Mismo esquema: en memoria, una vez por chat cada 24 h.
const avisosPdf = new Map();
const AVISO_PDF_CADA_MS = 24 * 60 * 60 * 1000;
const HORA_ARGENTINA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/**
 * Un pedido del catálogo de WhatsApp (`orderMessage`) sin texto (desde cero, D10, decisión de
 * Tomás del 29/09/2026). Devuelve el nombre del producto ('' si no viene), o null si no es un
 * pedido. Hasta el 29/09 el bot no lo leía, no contestaba y no avisaba a nadie.
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

/**
 * La espera de una tanda que se rearma porque el cliente escribió en medio de la
 * respuesta: un tercio de la normal (de 7 a 15 s con 20 a 45). El cliente ya está
 * esperando, y lo que alcanzó a leer salió con el ritmo de siempre.
 */
function esperaTrasCorte() {
  return Math.round(esperaAleatoria() / 3);
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * ¿Es de antes de arrancar? Al vincular el QR, WhatsApp manda el historial
 * entero, y ahí vienen también comandos viejos que no queremos revivir.
 */
function esViejo(data) {
  const ts = Number(data?.messageTimestamp?.low ?? data?.messageTimestamp ?? 0);
  return ts > 0 && Date.now() / 1000 - ts > config.ignorarAnterioresSeg;
}

/**
 * El aviso de un escalado. `paraElGrupo`: qué hacer, cuando el escalado lo trae (bloque
 * 8: en un pedido de fotos, "si tenés el equipo, mandale las fotos vos; si no hay stock:
 * #sinstock <número>").
 */
function avisoParaGrupo({ chatId, nombre, motivo, ctx, borrador, silencio, paraElGrupo }) {
  const num = chatId.split('@')[0];
  // Un monto en dólares va como US$, sin convertir (bloque 10): "tengo 420 dólares y el resto
  // en pesos" decía "Entrega: $420.000". Los pesos son la última entrega cotizada o aceptada (13/10/2026).
  const entregas = cerebro.entregasDelAviso(ctx);
  const lineas = [
    `${silencio ? '🔕 SIN RESPUESTA' : '🔔 LEAD'} — ${nombre || 'sin nombre'} — ${ctx.modelo || 'modelo sin definir'}`,
    `Entrega: ${entregas.length ? entregas.join(' y ') : 'no declarada'}`,
    `Motivo: ${motivo}`,
  ];
  if (ctx.zona) lineas.push(`Zona: ${ctx.zona}`);
  if (ctx.timing) lineas.push(`Cuándo: ${ctx.timing}`);
  if (ctx.permuta?.modelo) {
    lineas.push(
      `Permuta: ${ctx.permuta.modelo} ${ctx.permuta.capacidad_gb || ''}GB ${ctx.permuta.bateria || '?'}%`
    );
  }
  if (silencio) lineas.push('Al cliente no le contesté nada: escribile vos.');
  if (paraElGrupo) lineas.push(paraElGrupo);
  lineas.push(`Chat: https://wa.me/${num}`);
  if (borrador) lineas.push(`\n— BORRADOR, no se envió —\n${borrador}`);
  return lineas.join('\n');
}

function calcularScore(ctx) {
  let s = 0;
  if (ctx.modelo) s++;
  if (ctx.entrega) s++;
  if (ctx.forma_pago) s++;
  if (ctx.timing) s++;
  if (ctx.zona) s++;
  return s;
}

/**
 * Anota el lead escalado en la planilla. Si falla, se loguea y se sigue.
 *
 * El tester (NUMEROS_TESTER) va a LEADS_PRUEBA, para que las pruebas no se mezclen
 * con los clientes; un piloto (NUMEROS_PILOTO) es un cliente real y va a LEADS
 * (Pendientes 1, Parte C). Es estaEnLaLista y no esDestinoDePrueba a propósito: con
 * las listas vacías esa deja pasar a todos, y todo iría a la pestaña de prueba.
 */
async function registrarLeadEscalado({ chatId, nombre, ctx, motivo }) {
  const hoja = evolution.estaEnLaLista(chatId, config.numerosTester) ? 'LEADS_PRUEBA' : 'LEADS';
  try {
    await sheets.registrarLead(
      {
        fecha: new Date().toLocaleDateString('es-AR'),
        canal: 'WhatsApp',
        usuario: nombre || chatId.split('@')[0],
        modelo_consultado: ctx.modelo || '',
        entrega_declarada: ctx.entrega || '',
        forma_pago: ctx.forma_pago || '',
        permuta: ctx.permuta?.modelo || '',
        timing: ctx.timing || '',
        zona: ctx.zona || '',
        score: calcularScore(ctx),
        estado: 'ESCALADO - ' + motivo,
      },
      { hoja }
    );
  } catch (e) {
    console.error(`[leads] no pude registrar en ${hoja}:`, e.message);
  }
}

/**
 * Escalar sin decirle nada al cliente. Donde antes el bot prometía que otra
 * persona le iba a responder ("ahora te responde fran"), ahora se calla y el
 * grupo es el único que se entera.
 *
 * Como el cliente no recibe nada, el aviso no puede perderse:
 *  - un chat que ya estaba escalado no llega hasta acá: queda callado, y lo que
 *    escriba lo junta el recordatorio del escalado (control.js);
 *  - un motivo nuevo avisa de nuevo, pero el mismo motivo no se repite dentro
 *    de SILENCIO_TRAS_HUMANO_MIN: cinco "ok" seguidos son un solo aviso;
 *  - se marca como avisado recién cuando salió: si falló, avisa con el próximo
 *    mensaje.
 *
 * En borrador, o fuera de la lista de prueba, pasa lo mismo que con cualquier
 * borrador: el aviso sale, pero no se escala ni se anota el lead.
 */
async function escalarEnSilencio({ chatId, nombre, motivo, ctx, calla = true, paraElGrupo = null }) {
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

  const r = await evolution.avisarGrupo(avisoParaGrupo({ chatId, nombre, motivo, ctx, silencio: true, paraElGrupo }));
  if (!r || r.bloqueado) return;
  state.actualizar(chatId, { ultimoAvisoSilencio: { motivo, ts: ahora } });
  console.log(`[silencio] ${chatId}: no le conteste, avise al grupo -> ${motivo}`);

  // Una sola definición de "le llega al cliente" (evolution.js): el modo escucha ya
  // quedó afuera arriba, así que acá es borrador o fuera de las listas de prueba.
  // Un escalado que calla le gana a uno de "no entendí" que no calla (control.escalaEncima).
  // `pisa` se lee ANTES de escalar: ctx es el mismo objeto del estado y `escalar` lo cambia.
  if (evolution.leLlegaAlCliente(chatId) && control.escalaEncima(ctx, calla)) {
    const pisa = Boolean(ctx.escalado);
    control.escalar(chatId, motivo, { calla });
    await anotarLeadUnaVez({ chatId, nombre, ctx, motivo, pisa });
  }
}

/**
 * El lead de un escalado va a la planilla una sola vez por chat. Antes lo cuidaba
 * `escalado`, que nunca se limpiaba; ahora el escalado se resuelve solo (control.js)
 * y lo cuida `leadRegistrado`.
 */
async function anotarLeadUnaVez({ chatId, nombre, ctx, motivo, pisa = false }) {
  // `pisa`: este escalado reemplaza a uno de "no entendí" que no calla (decisión de
  // Tomás del 22/09/2026). Ese ya anotó su fila con el motivo "no entiendo", y el
  // escalado que importa es este: se anota igual, una sola vez, porque después el chat
  // queda callado y no puede volver a pisar.
  if (ctx.leadRegistrado && !pisa) return;
  state.actualizar(chatId, { leadRegistrado: Date.now() });
  await registrarLeadEscalado({ chatId, nombre, ctx, motivo });
}

/**
 * Manda algo al cliente anotando la autoría (autoria.js): el envío queda en vuelo
 * hasta que Evolution conteste, y su id queda anotado para reconocer el eco.
 *
 * Es también el único lugar donde se confirman las marcas de "ya se dijo"
 * (auditoría A4, bloque 3). El mensaje las trae puestas desde responder.js y se
 * guardan recién con la respuesta de Evolution en la mano, con el mismo criterio
 * que la autoría: si no hay id, el cliente no recibió nada y no se marca nada.
 * Así, una tanda cortada, un envío fallado, el modo escucha o un número fuera de
 * la lista de prueba no dejan al bot creyendo que ya lo dijo.
 *
 * Bloque Ninjo 2 (06/10/2026): cada envío deja en el registro de aprendizaje un evento `entrega`
 * con el id que devolvió Evolution, o con `error` si falló o lo frenó evolution.js. `origen`
 * ('sonnet', 'bot', 'seguimiento', 'silencio', 'sigue' o 'fotos') y `tanda` los pasa cada camino. Con
 * `origen: null` no se anota: el "🔄 Reiniciado" del #reset del tester (el #reset no deja nada en el
 * registro, test/reset.test.js).
 */
async function enviarAlCliente(chatId, tipo, texto, enviar, marcas = null, { origen = 'bot', tanda = null } = {}) {
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
  // Chats viejos (29/09/2026): el id queda guardado para que este envío, visto después en
  // Evolution, no marque el chat como viejo, y alDia avanza (chats-viejos.js).
  if (autoria.llego(respuesta)) chatsViejos.envioConfirmado(respuesta.key.id);
  // Panel Chiara: cuenta solo lo que Evolution confirmó con su id (no borradores, sombra ni bloqueados).
  if (autoria.llego(respuesta)) panel.deChiara(chatId);
  return respuesta;
}

/**
 * Manda una foto del catálogo (`acciones.foto`), sola y sin texto. La ruta sale de la
 * carpeta de fotos por modelo, nunca de un texto. Anota la autoría, sus marcas, el envío
 * y el historial. La usan la tanda y #sinstock (bloque 8): el mismo camino, así que las
 * guardas de evolution.js (lista de prueba, escucha, carpeta y extensión) valen para las
 * dos. Quien llama ya miró que le llegue al cliente (`leLlegaAlCliente`). Tira si no hay
 * foto de ese modelo o si Evolution falla. `donde`: el `origen` y la `tanda` del evento `entrega`.
 */
async function mandarFoto(chatId, m, donde = {}) {
  const ruta = fotos.buscar(m.id);
  if (!ruta) throw new Error(`no hay foto de "${m.id}"`);
  const r = await enviarAlCliente(chatId, 'imagen', '', () => evolution.enviarImagen(chatId, ruta, '', 0), acciones.marcasDe(m), donde);
  anotarEnvio(chatId, r);
  state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m), autoria.llego(r) ? { id: r.key.id } : {});
  return r;
}

/**
 * Manda la foto de un equipo del local (`acciones.fotoEquipo`, 08/10/2026: Chiara manda fotos como Fran), con su
 * pie ("15 128gb 87% 740.000") como caption de la imagen, un solo mensaje. La ruta sale del índice de las fotos
 * de los equipos (fotos-equipos.rutaDe, adentro de la carpeta de fotos), nunca de un texto, y evolution.js vuelve a
 * mirar la carpeta y la extensión: el mismo camino y los mismos candados que `mandarFoto` (lista de prueba, escucha,
 * Chiara apagada). Queda en el historial como "[foto] 15 128gb 87% 740.000", que Sonnet lee en la vuelta siguiente.
 * Tira si la foto no está en el índice o si Evolution falla.
 */
async function mandarFotoDeEquipo(chatId, m, donde = {}) {
  const ruta = fotosEquipos.rutaDe(m.archivo);
  if (!ruta) throw new Error(`la foto "${m.archivo}" no está en el índice de fotos de los equipos`);
  const pie = String(m.pie || '');
  const r = await enviarAlCliente(chatId, 'imagen', pie, () => evolution.enviarImagen(chatId, ruta, pie, 0), acciones.marcasDe(m), donde);
  anotarEnvio(chatId, r);
  // Sin id de Evolution no se sabe si le llegó: no cuenta como "ya se lo dije", como un texto.
  state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m), autoria.llego(r) ? { id: r.key.id } : { sinConfirmar: true });
  return r;
}

/** Por qué algo no le llega al cliente, para decirlo en el grupo. */
function porQueNoLeLlega() {
  if (config.modoEscucha) return 'modo escucha';
  if (config.modoBorrador) return 'modo borrador';
  return 'no está en las listas de prueba';
}

/**
 * #sinstock <número> en el grupo (bloque 8, decisión de Tomás del 24/09/2026): el cliente
 * pidió fotos y no hay stock para sacarlas. Le manda la foto de referencia de cada modelo
 * del pedido pendiente (`fotosPedidas`) que tenga foto, sola, por el mismo camino que
 * cualquier foto (`mandarFoto`) y con los mismos candados: en escucha, en borrador o fuera
 * de las listas de prueba no le llega nada, y el grupo se entera de qué habría mandado.
 * Antes de cada una, "escribiendo…" y la espera entre mensajes; como mucho las de una
 * tanda. Contesta en el grupo qué mandó y de qué modelo no hay foto, y borra el pedido. El
 * chat sigue escalado: el bot vuelve con #sigue.
 */
async function mandarFotosSinStock({ chatId, pedido }) {
  const num = chatId.split('@')[0];
  const todos = pedido.modelos || [];
  const modelos = todos.slice(0, config.ritmo.maxMensajesPorTanda);
  const conFoto = modelos.filter((modelo) => fotos.buscar(modelo));
  const sinFoto = modelos.filter((modelo) => !fotos.buscar(modelo));
  const llega = evolution.leLlegaAlCliente(chatId);
  const mandadas = [];
  const fallidas = [];
  if (llega) {
    for (const modelo of conFoto) {
      try {
        await evolution.mostrarEscribiendo(chatId, config.ritmo.entreMensajesMs);
        await dormir(config.ritmo.entreMensajesMs);
        const r = await mandarFoto(chatId, acciones.foto(modelo), { origen: 'fotos' });
        if (autoria.llego(r)) mandadas.push(modelo);
        else fallidas.push(`${modelo} (${(r && r.motivo) || 'Evolution no confirmó el envío'})`);
      } catch (e) {
        fallidas.push(`${modelo} (${e.message})`);
      }
      state.actualizar(chatId, { ultimoBot: Date.now() });
    }
  }
  state.actualizar(chatId, { fotosPedidas: null });
  console.log(`[sinstock] ${chatId}: ${llega ? `mandé ${mandadas.length} foto(s)` : `no le mandé nada (${porQueNoLeLlega()})`}`);

  const del = (ms) => ms.map((modelo) => `del ${modelo}`).join(', ').replace(/, (?=[^,]*$)/, ' y ');
  const lineas = [`📷 #sinstock · ${recordatorios.quien(chatId, state.obtener(chatId))}`];
  if (!llega) {
    lineas.push(`No le mandé nada al cliente (${porQueNoLeLlega()}).`);
    if (conFoto.length) lineas.push(`Le habría mandado la foto de referencia ${del(conFoto)}.`);
  } else if (mandadas.length) {
    lineas.push(`Le mandé la foto de referencia ${del(mandadas)}, sin texto.`);
  }
  for (const modelo of sinFoto) lineas.push(`No tengo foto de referencia del ${modelo}: mandásela vos.`);
  for (const f of fallidas) lineas.push(`No pude mandar la foto del ${f}: mandásela vos.`);
  if (!todos.length) lineas.push('No dijo de qué modelo: mandale vos las fotos.');
  if (todos.length > modelos.length) {
    lineas.push(`${modelos.length} es el tope por tanda: mandale vos la foto ${del(todos.slice(modelos.length))}.`);
  }
  lineas.push(`El chat sigue escalado: para que el bot vuelva, #sigue ${num}`);
  lineas.push(`💬 https://wa.me/${num}`);
  const r = await evolution.avisarGrupo(lineas.join('\n'));
  if (r && r.bloqueado) console.log(`[sinstock] la confirmacion no salio: ${r.motivo}`);
}

/**
 * Deja anotado que el bot le mandó algo de verdad a este cliente, para #vendido
 * y #perdido (`botLeMando` en ventas.js). Mismo criterio que la autoría y que las
 * marcas de "ya se dijo": vale el envío que Evolution confirmó con su id. En
 * escucha o fuera de la lista de prueba vuelve `bloqueado` sin mandar nada, y si
 * Evolution falla no contesta.
 */
function anotarEnvio(chatId, r) {
  if (!autoria.llego(r)) return;
  if (!state.obtener(chatId).botEnvio) state.actualizar(chatId, { botEnvio: Date.now() });
  // El último mensaje del bot que le LLEGÓ al cliente (27/09/2026). `ultimoBot` también se
  // mueve con un borrador, que el cliente nunca ve: el seguimiento mira este.
  state.actualizar(chatId, { ultimoEnvioCliente: Date.now() });
}

/**
 * #reset: el chat queda como nuevo. Lo usan la cuenta del negocio y, en la lista
 * de prueba, el propio cliente (ver procesar). Se lleva todo lo del chat:
 *  - el estado y el recordatorio (vive aparte, bajo la clave interna, y hasta el
 *    15/09/2026 sobrevivía al reset);
 *  - las líneas que esperaban tanda, que ya no se interpretan;
 *  - la tanda que ya estaba interpretando o mandando: `state.reiniciar` sube la
 *    generación del chat y esa tanda es de la anterior, así que no manda ni
 *    escribe nada más (ver atenderChat), tampoco su propuesta al aprendizaje;
 *  - lo que el registro de aprendizaje tiene en memoria del chat: lo que conteste
 *    una persona después no responde a ninguna propuesta de antes.
 */
function reiniciarChat(chatId, { cliente = false } = {}) {
  // Bloque Ninjo 1b: con la hora del reset en `evolutionTraido`, lo de antes no se trae de Evolution.
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
    `[reset] ${chatId} quedo como nuevo` +
      (cliente ? ', lo pidio el cliente' : '') +
      (detalle.length ? ` (${detalle.join(', ')})` : '')
  );
}

/**
 * #reset que mandó un cliente de la lista de prueba: reinicia y le confirma con
 * "🔄 Reiniciado". Ese envío no va al historial ni a `botEnvio`: el chat tiene
 * que quedar vacío. Sale al instante, sin el ritmo humano, y también en borrador:
 * es la confirmación de una prueba y solo le llega a un número de la lista.
 */
async function resetDelCliente(chatId) {
  reiniciarChat(chatId, { cliente: true });
  try {
    // Con la autoría anotada: su eco no cuenta como una persona (autoria.js).
    // Sin `entrega` en el registro (origen null): el #reset no deja nada ahí.
    const r = await enviarAlCliente(chatId, 'texto', AVISO_RESET, () => evolution.enviarTexto(chatId, AVISO_RESET), null, { origen: null });
    if (r && r.bloqueado) console.log(`[reset] ${chatId}: "${AVISO_RESET}" no salio: ${r.motivo}`);
  } catch (e) {
    console.error(`[reset] ${chatId}: no pude mandar "${AVISO_RESET}":`, e.message);
  }
}

/**
 * Un chat que llegó con el identificador interno de WhatsApp (`…@lid`) en vez del número
 * (decisión de Tomás del 28/09/2026). Evolution guarda el `@lid` en su base y lo cambia por
 * el número antes del webhook solo si el mensaje trae `remoteJidAlt`; si no lo trae, llega
 * así. Con esa clave el bot no sabe si es un cliente viejo, un amigo o un proveedor:
 * CONTACTOS_PERSONALES y SOLO_CHATS_NUEVOS comparan números y no lo reconocen, y el mismo
 * cliente quedaría partido en dos chats. Por eso no se procesa: no se le contesta, no se
 * guarda, no va a Gemini ni se transcribe. Si escribió el cliente, un aviso al grupo por
 * chat cada 24 h, con el nombre y la hora (sin el texto: puede ser un amigo). Un mensaje
 * propio en ese chat no hace nada.
 */
async function chatSinNumero(chatId, data) {
  if (data?.key?.fromMe) return;
  // Bloque Ninjo 2: cada mensaje que queda sin respuesta, aunque el aviso salga uno cada 24 h.
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

/**
 * El PDF del compromiso de pago no salió (arreglos en vivo, 30/09/2026). En la prueba en
 * vivo del 30/09 Evolution contestó 500 en sendMedia ("Media upload failed on all hosts":
 * Baileys no pudo subir el archivo a los servidores de media de WhatsApp), al cliente le
 * llegó solo el pie como texto y nadie se enteró. Ahora, además del pie, un aviso al grupo
 * para que una persona le mande el compromiso. Una vez por chat cada 24 h, en memoria, como
 * `📵 SIN NÚMERO`; va por `avisarGrupo`, con sus candados (en escucha no sale). El PDF sigue
 * sin contarse como mandado (`compromisoEnviado` no se confirma).
 */
async function avisarPdfNoSalio(chatId, nombre) {
  const ahora = Date.now();
  const antes = avisosPdf.get(chatId);
  if (antes && ahora - antes < AVISO_PDF_CADA_MS) return;
  avisosPdf.set(chatId, ahora);
  const numero = chatId.split('@')[0];
  try {
    const r = await evolution.avisarGrupo(`📄 NO SALIÓ EL PDF · ${nombre || 'sin nombre'} · wa.me/${numero} · mandale el compromiso de pago vos`);
    if (r && r.bloqueado) console.log(`[doc] ${chatId}: el aviso al grupo no salio: ${r.motivo}`);
  } catch (e) {
    console.error(`[doc] ${chatId}: no pude avisar al grupo:`, e.message);
  }
}

/**
 * La foto de un equipo del local no salió (08/10/2026): la foto ya no está en el índice o en el disco, o Evolution
 * falló. El cliente la esperaba (Sonnet ya decidió mandarla), así que alguien se la manda a mano. Nunca tira.
 */
async function avisarFotoNoSalio(chatId, nombre, m, e) {
  const numero = chatId.split('@')[0];
  const pie = String((m && m.pie) || '').split('\n')[0];
  try {
    const r = await evolution.avisarGrupo(
      `📷 NO SALIÓ LA FOTO · ${nombre || 'sin nombre'} · ${(m && m.codigo) || '?'}${pie ? ` (${pie})` : ''} · ${cerebro.recorte((e && e.message) || String(e), 100)} · wa.me/${numero} · mandásela vos`
    );
    if (r && r.bloqueado) console.log(`[foto] ${chatId}: el aviso al grupo no salio: ${r.motivo}`);
  } catch (err) {
    console.error(`[foto] ${chatId}: no pude avisar al grupo:`, err.message);
  }
}

async function procesar(data) {
  const chatId = data?.key?.remoteJid;
  if (!chatId) return;

  // Nada de grupos, listas de difusión ni estados.
  if (chatId.endsWith('@g.us')) {
    if (!gruposVistos.has(chatId)) {
      gruposVistos.add(chatId);
      const comoSeLlama = data?.pushName ? ` (escribio ${data.pushName})` : '';
      console.log(`[grupo] ${chatId}${comoSeLlama}  <- si es el grupo interno, este es el GRUPO_AVISOS_JID`);
    }
    // #recordar y #hecho escritos en el grupo interno no tienen un cliente al
    // que asociarse. No se anota ni se cierra nada, pero se contesta cómo se
    // usan: un #hecho que no hace nada en silencio deja creyendo que se cerró.
    // Los avisos del bot también vuelven por acá como propios; no se confunden
    // porque un comando solo cuenta si el mensaje empieza con él.
    if (chatId === config.grupoAvisos && data?.key?.fromMe && !esViejo(data)) {
      const cmd = recordatorios.comando(textoDelMensaje(data));
      if (cmd) {
        await evolution.avisarGrupo(
          recordatorios.ayuda(cmd.tipo === 'hecho' ? 'hecho-en-grupo' : 'recordar-en-grupo')
        );
      }
      // #vendido y #perdido sí se usan acá, con el número del cliente: marcan
      // ese chat. Sin número contestan cómo se usan.
      const venta = ventas.comando(textoDelMensaje(data));
      if (venta) await confirmarVenta(ventas.desdeGrupo(venta, data?.key?.id));
      // #pausa y #sigue con el número: mismo patrón, y el cliente no ve el comando.
      // #sinstock también (bloque 8): con un pedido de fotos pendiente, manda las fotos.
      // #sigue contesta lo que dejó escrito el cliente (07/10/2026, `alSeguir`): sus líneas quedan en la cola al
      // reactivar y la tanda arranca ya, sin esperar el aviso (que dice si le contesta o por qué no): lo primero que
      // hace es la espera de siempre, así el aviso sale antes, y lo que escriba el cliente mientras tanto se suma.
      const ctrl = control.comando(textoDelMensaje(data));
      if (ctrl) {
        const r = control.desdeGrupo(ctrl, Date.now(), { alSeguir });
        const tanda = r.contesta ? atenderChat(r.chatId, (state.todos()[r.chatId] || {}).nombre || '') : null;
        try {
          if (r.pedido) await mandarFotosSinStock(r);
          else await confirmarControl(r);
        } finally {
          if (tanda) await tanda;
        }
      }
      // #bateria (01/10/2026, decisión de Tomás): qué lista de usados usa el bot. Solo desde
      // el grupo, como #sinstock; en el chat de un cliente no es un comando.
      const bat = bateria.comando(textoDelMensaje(data));
      if (bat) await confirmarBateria(await bateria.desdeGrupo(bat));
      // Cerebro Sonnet, fase 2 (02/10/2026): #sonnet, #comparar, #bot y #sonnet-si, con el número.
      // Solo desde el grupo y desde la cuenta, como #sinstock.
      const son = cerebroComandos.comando(textoDelMensaje(data));
      if (son) await confirmarComandoSonnet(son, await cerebroComandos.desdeGrupo(son));
      // #apagar / #prender (decisión de Tomás del 06/10/2026): el interruptor general de Chiara, como el
      // botón del panel, de respaldo para cuando no hay app. Solo desde el grupo y desde la cuenta.
      const inter = interruptor.comando(textoDelMensaje(data));
      if (inter) await confirmarInterruptor(interruptor.desdeGrupo(inter));
    }
    // Precios de TechSur (01/10/2026): el grupo Avisos de la comunidad del proveedor. Solo se lee y
    // se guarda en la app de ventas, nunca se le contesta. No tira: ver src/techsur.js.
    if (chatId !== config.grupoAvisos) await techsur.recibir(data, textoDelMensaje(data));
    return;
  }
  if (chatId.includes('broadcast') || chatId.includes('status')) return;

  // Contacto personal: se ignora entero y ACÁ, antes de tocar nada. Este return
  // es lo único que garantiza lo que promete la lista: más abajo ya se
  // transcriben audios, se escribe el estado y se llama a Gemini.
  if (evolution.esContactoPersonal(chatId)) return;

  // Al vincular el QR, WhatsApp manda el historial entero. Sin este filtro el
  // bot analiza cientos de mensajes viejos contra Gemini: quema la cuota del
  // día en minutos y ensucia el historial con conversaciones de hace meses.
  // Solo nos interesa lo que pasa de acá en adelante.
  if (esViejo(data)) return;

  // Sin número (@lid): ver chatSinNumero. Va después de esViejo, para que la recarga del
  // historial al vincular el QR no dispare avisos.
  if (chatId.endsWith('@lid')) {
    await chatSinNumero(chatId, data);
    return;
  }

  // Chats viejos (29/09/2026): mientras el bot se pone al día con Evolution al arrancar, el
  // mensaje espera (hasta 60 s) para decidirse con la lista completa. Solo con SOLO_CHATS_NUEVOS:
  // apagado, la lista no cambia a quién se le escribe y no hay por qué demorar.
  if (config.soloChatsNuevos) await chatsViejos.esperar();

  // Chats viejos (30/09/2026): con la lista atrasada, un chat de un cliente que todavía no está en
  // estado.json queda anotado con la hora de este mensaje, ANTES de entrar al estado: si Evolution
  // tiene uno suyo de antes, empezó sin el bot mirando y la puesta al día lo hace viejo.
  if (!data?.key?.fromMe) {
    chatsViejos.entroDelCliente(chatId, Number(data?.messageTimestamp?.low ?? data?.messageTimestamp ?? 0) * 1000);
    // Panel Chiara: el mensaje del cliente se cuenta acá, antes de entrar al estado (así se sabe si el
    // chat es nuevo), y queda el anuncio de origen si vino de uno. Nunca tira.
    panel.delCliente(chatId, data);
  }

  let texto = textoDelMensaje(data);
  const nombre = data?.pushName || '';
  const esNotaDeVoz = audio.esAudio(data);

  // Mensaje salido de la cuenta: puede ser un humano contestando.
  if (data?.key?.fromMe) {
    // El eco de un envío del bot (por su id, o mientras el envío está en vuelo) no es
    // una persona. Cualquier otro mensaje propio sí, sin ventana de tiempo (autoria.js).
    if (autoria.esDelBot(chatId, data)) return;

    // Los audios propios son la mejor muestra de cómo se vende de verdad, así
    // que se transcriben y se guardan con el texto real. Antes entraban con
    // texto vacío: callaban al bot y el contenido se perdía.
    let paraHistorial = texto;
    if (esNotaDeVoz) {
      const t = await audio.transcribir(data);
      if (t.ok) {
        texto = t.texto;
        paraHistorial = t.texto;
        console.log(`[audio] transcribi un audio propio en ${chatId}`);
      } else {
        // Se deja constancia en el historial, pero no se guarda como respuesta
        // humana: un marcador no enseña nada y ensuciaría el aprendizaje.
        texto = '';
        paraHistorial = '[audio que no se pudo transcribir]';
        console.warn(`[audio] audio propio sin transcribir en ${chatId}: ${t.motivo}`);
      }
    }

    // #reset: el chat queda como nuevo (ver reiniciarChat). Se corta acá, antes de
    // guardar nada: el comando no es un mensaje de venta y no entra al aprendizaje.
    if (/^#reset/i.test(texto)) {
      reiniciarChat(chatId);
      return;
    }
    if (/^#pausa/i.test(texto)) {
      state.actualizar(chatId, { pausado: true });
      return;
    }
    if (/^#sigue/i.test(texto)) {
      // "El bot vuelve ya": también limpia el escalado (control.js). Lo escribe la cuenta, no una persona:
      // no mueve `ultimoHumano`. Desde el 07/10/2026 contesta lo que el cliente dejó escrito (`alSeguir`); acá,
      // sin aviso al grupo.
      control.reanudar(chatId);
      if (alSeguir(chatId).contesta) await atenderChat(chatId, state.obtener(chatId).nombre || '');
      return;
    }
    // #recordar / #hecho: recordatorios al grupo interno. Se cortan acá, igual
    // que #pausa: no son mensajes de venta, no entran al historial ni al
    // aprendizaje y no callan al bot. Al cliente no se le manda nada.
    const cmd = recordatorios.comando(texto);
    if (cmd) {
      await atenderComando(chatId, cmd, data?.key?.id);
      return;
    }
    // #vendido / #perdido: mismo patrón que #hecho. Anota cómo terminó el chat,
    // para medir si el bot ayuda a vender; no es un mensaje de venta.
    const venta = ventas.comando(texto);
    if (venta) {
      await atenderVenta(chatId, venta, data?.key?.id);
      return;
    }
    // No lo mandó el bot: escribió una persona, sin ventana de tiempo. Antes contaba
    // solo si pasaban 15 s desde el último envío, y una respuesta rápida se perdía.
    // Marca al humano y calla al bot 45 minutos, se haya transcrito o no.
    // Panel Chiara: se cuenta antes de mover `ultimoHumano` (mide cuánto esperó el cliente).
    panel.delHumano(chatId);
    state.actualizar(chatId, { ultimoHumano: Date.now() });
    // Marcada como de una persona (bloque 10): "me quedo con el que me dijiste" sobre lo que
    // escribió una persona escala. Por la hora no se sabría: #sigue pone ultimoHumano en 0.
    state.agregarAlHistorial(chatId, 'vendedor', paraHistorial, { humano: true, id: data?.key?.id });
    // Si el chat estaba escalado, lo tomó: queda resuelto, y el bot vuelve cuando
    // pasa el silencio de siempre (control.js).
    if (control.resolver(chatId, 'escribió alguien de la cuenta')) {
      console.log(`[escalado] ${chatId}: lo tomó alguien de la cuenta`);
    }
    // Registro de aprendizaje (bloque 6): lo que escribió la persona y a qué propuesta
    // responde. Si hay una tanda de este chat esperando, interpretándose o mandándose,
    // queda incompleto: nunca se empareja con la tanda anterior (aprendizaje.js).
    aprendizaje.humano(chatId, { id: data?.key?.id, texto }, { tandaEnCurso: enProceso.has(chatId) });
    return;
  }

  // Comandos desde el celular del tester (NUMEROS_TESTER; Pendientes 1, Parte C):
  // sirve para volver a probar desde otro celular sin tocar la cuenta del negocio.
  // Nada que empiece con # va al bot: un #reset (o sus typos: #resset, #reseet,
  // #rest) reinicia el chat, y cualquier otro # se descarta con un log, sin entrar
  // al historial, la tanda ni el aprendizaje. Es estaEnLaLista y no
  // esDestinoDePrueba a propósito: con las listas vacías esa deja pasar a todos, y
  // cualquier cliente podría borrarse el chat. Para un piloto (NUMEROS_PILOTO) o
  // cualquier otro número, un texto que empieza con # es un mensaje más.
  if (texto.startsWith('#') && evolution.estaEnLaLista(chatId, config.numerosTester)) {
    if (RE_RESET_TESTER.test(texto)) await resetDelCliente(chatId);
    else console.log(`[tester] ${chatId}: "${texto.slice(0, 40)}" empieza con # y no es un #reset, lo descarto`);
    return;
  }

  // Pedido del catálogo sin texto (desde cero, D10): va a la tanda como un pedido, sin texto. Si
  // en la misma tanda escribió algo, se contesta el texto como siempre; si no, escala callado.
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

  // Foto sin epígrafe (desde cero, D1, decisión de Tomás del 29/09/2026): en un canje en curso
  // cuenta como "mandó fotos", y también si llega mientras se junta o se atiende una tanda de
  // este chat (puede ser la que arranca el canje: lo decide responder.js). Va a la tanda como
  // una foto, sin texto: no entra al registro de aprendizaje (al historial, solo en los chats de
  // Sonnet desde el 07/10/2026, como "[foto]": ver abajo). Varias fotos o
  // un álbum en la misma tanda son un solo evento. Fuera de eso, como siempre: nada.
  // En un chat que atiende Sonnet (06/10/2026), Sonnet ve la foto (atenderTanda). El filtro es el mismo:
  // en esos chats `permuta` no lo llena nadie (Sonnet no la escribe), así que una foto suelta entra
  // solo con una tanda abierta (ver CLAUDE.md, "Sonnet ve las fotos del cliente").
  if (!texto && !esNotaDeVoz && esFotoSinTexto(data)) {
    const s = state.todos()[chatId];
    // Marca de canje (07/10/2026): en un chat de Sonnet, también si Sonnet anotó un canje hace menos de 72 h.
    const enCanje = Boolean(s && ((s.permuta && s.permuta.ofrece && !s.escalado) || (cerebro.canjeVigente(s) && cerebro.quienAtiende(chatId) === 'sonnet')));
    const conTanda = enProceso.has(chatId) || (pendientes.get(chatId) || []).length > 0;
    // La foto en el historial (decisión de Tomás del 07/10/2026): en un chat de Sonnet, cada foto sin epígrafe deja
    // una línea "[foto]" del cliente, entre o no a la tanda, así en la tanda siguiente Sonnet sabe que la hubo (la
    // imagen no se vuelve a mandar). No cambia qué se contesta: la tanda sigue con su línea `{ foto: true }`, y el
    // barrido del silencio, #sigue, el seguimiento y los datos viejos no la cuentan como algo escrito. Una por
    // imagen: el `albumMessage` no es una foto. Con el id del mensaje: lo de Evolution no la suma otra vez
    // (contexto.js). Un chat que no existía no se crea por una foto (como hasta ahora); en los del bot de siempre, nada.
    if (s && data.message.imageMessage && cerebro.quienAtiende(chatId) === 'sonnet') {
      state.agregarAlHistorial(chatId, 'cliente', LINEA_FOTO, { id: data?.key?.id });
    }
    if (!enCanje && !conTanda) {
      aprendizaje.silencio(chatId, { motivo: 'sin-texto', lineas: [data?.key?.id], formato: 'foto' });
      return;
    }
    if (!config.modoEscucha && (state.humanoActivo(chatId, config.silencioTrasHumanoMin) || control.callado(state.obtener(chatId)))) {
      aprendizaje.silencio(chatId, { motivo: motivoDelSilencio(chatId), lineas: [data?.key?.id], formato: 'foto' });
      return;
    }
    if (!pendientes.has(chatId)) pendientes.set(chatId, []);
    const deLaFoto = { foto: true, ts: Date.now(), texto: '' };
    // Con qué bajarla si la tanda la contesta Sonnet (06/10/2026). Un álbum no trae imagen: cada foto
    // del álbum llega aparte.
    datosDeLinea.set(deLaFoto, { imagen: fotosDelCliente.deMensaje(data) });
    pendientes.get(chatId).push(deLaFoto);
    if (enProceso.has(chatId)) return;
    await atenderChat(chatId, nombre);
    return;
  }

  // La última actividad del chat ANTES de anotar esta línea, para saber si los datos
  // guardados son viejos (Pendientes 1, B3). Se aplica más abajo, junto al escalado vencido.
  const ultimaActividad = control.ultimaActividad(state.todos()[chatId]);

  // Cerebro Sonnet, fase 2 (decisión de Tomás del 02/10/2026): con CEREBRO_MODO=nuevos, un chat que
  // llega por primera vez (sin estado guardado y fuera de la lista de chats viejos) lo atiende
  // Sonnet desde este mensaje, aunque después se cambie el modo, hasta #reset o #bot. Se mira ANTES
  // de que el mensaje entre al estado.
  const nuevoParaSonnet = cerebro.esChatNuevo(chatId);

  // Mensaje del cliente. Entra al historial YA, en el orden en que llegó. Un audio
  // también: su línea se reserva ahora y la transcripción la completa después.
  // Así, si en la misma ventana llegan un audio y un texto, van a la tanda en el
  // orden en que los mandó el cliente, aunque el audio tarde en transcribirse.
  let linea;
  if (esNotaDeVoz && !texto) {
    // Si no se entiende queda "[audio que no se entendio]": que quede el hueco
    // documentado es mejor que un chat que parece no haber recibido nada.
    state.agregarAlHistorial(chatId, 'cliente', '[audio]', { id: data?.key?.id });
    linea = ultimaLinea(chatId);
    linea.audio = true;
  } else {
    // Sticker o foto sin epígrafe: lo ve un humano, como siempre. Bloque Ninjo 2: queda el silencio, con
    // el formato; una reacción, un mensaje de protocolo o una encuesta no (`marcadorSinTexto` da null).
    if (!texto) {
      const marcador = marcadorSinTexto(data);
      if (marcador) aprendizaje.silencio(chatId, { motivo: 'sin-texto', lineas: [data?.key?.id], formato: marcador.slice(1, -1) });
      return;
    }
    // Lo que cita (decisión de Tomás del 08/10/2026, …3557): si responde a otro mensaje (un producto del catálogo, un
    // estado, un mensaje nuestro o suyo), la línea empieza con "[responde a: <lo citado>]" y así llega al historial, a
    // Sonnet y al registro. Va después de los comandos (un #reset que cita sigue siendo el comando). El bot de siempre
    // lee el mensaje sin la cita (`decidirSinCita`), y `ultimoMensajeCliente` (el "último mensaje" del panel, cortado
    // a 80 caracteres) es lo que escribió él: con una cita larga adelante, no se vería.
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

  // Cómo llegó este mensaje: si había una persona atendiendo (en vivo el bot no lo
  // evalúa; en escucha sí) y si era un audio. Sin esto no se separa lo que el bot haría
  // en vivo de lo que solo pasa en escucha. `ultimoContexto` queda en el estado; el
  // registro de aprendizaje lo toma de cada línea y de cada tanda (bloque 6).
  const humanoAtendiendo = state.humanoActivo(chatId, config.silencioTrasHumanoMin);
  state.actualizar(chatId, { ultimoContexto: { humanoAtendiendo, audio: esNotaDeVoz } });

  // Registro de aprendizaje (bloque 6): la línea queda anotada con su id, entre o no a
  // una tanda (en vivo, con una persona atendiendo o el chat escalado, no entra), y
  // desde ya lo que conteste una persona no responde a la propuesta anterior. Un audio
  // se anota cuando termina de transcribirse (transcribirEnLinea), que arranca acá.
  const idLinea = data?.key?.id || `sin-id-${++lineasSinId}`;
  // Una foto con epígrafe entra como texto (el epígrafe); la imagen, para Sonnet (06/10/2026).
  const imagen = linea.audio ? null : fotosDelCliente.deMensaje(data);
  datosDeLinea.set(linea, { id: idLinea, humanoAtendiendo, ...(imagen ? { imagen } : {}) });
  aprendizaje.llegoDelCliente(chatId, idLinea);
  if (linea.audio) transcripciones.set(linea, transcribirEnLinea(chatId, data, linea));
  else aprendizaje.cliente(chatId, { id: idLinea, texto, audio: false, humanoAtendiendo });

  if (humanoAtendiendo) {
    // En modo escucha NO se corta acá. Todo el sentido de ese modo es calcular
    // qué habría contestado el bot para poder compararlo con lo que contestó
    // la persona. Si cortamos, el registro de aprendizaje queda vacío
    // justamente en los chats que más importan: los que atienden ustedes.
    if (!config.modoEscucha) {
      console.log(`[${chatId}] humano atendiendo, el bot se queda callado`);
      aprendizaje.silencio(chatId, { motivo: state.obtener(chatId).pausado ? 'pausado' : 'persona', lineas: [idLinea] });
      // Sombra con persona (decisión de Tomás del 03/10/2026): Sonnet piensa igual qué contestaría,
      // sin mandar nada ni tocar el estado, para compararlo con lo que contesta la persona.
      sombraPersona.anotar(chatId, nombre, [{ linea, id: idLinea }], 'persona', esperaAleatoria());
      return;
    }
  }

  // Chat escalado: callado. El mensaje ya quedó en el historial y lo junta el
  // recordatorio del escalado; no se interpreta ni se avisa en el momento. Pasadas
  // ESCALADO_REANUDAR_HORAS sin que nadie lo tome, es una consulta nueva (control.js).
  const delChat = state.obtener(chatId);
  if (control.callado(delChat) && !config.modoEscucha) {
    if (!control.vencido(delChat)) {
      console.log(`[escalado] ${chatId}: el mensaje queda anotado y no se contesta`);
      aprendizaje.silencio(chatId, { motivo: 'escalado', lineas: [idLinea] });
      // Sombra con persona (03/10/2026): un escalado que calla también lo atiende una persona.
      sombraPersona.anotar(chatId, nombre, [{ linea, id: idLinea }], 'escalado', esperaAleatoria());
      return;
    }
    control.resolver(chatId, `nadie lo tomó en ${config.escalado.reanudarHoras} h`);
    // Consulta nueva: se borran las marcas de "esto ya se dijo" de la charla vieja.
    control.limpiarParaConsultaNueva(chatId);
    console.log(`[escalado] ${chatId}: nadie lo tomó en ${config.escalado.reanudarHoras} h, lo atiendo como consulta nueva`);
  }

  // Datos viejos por tiempo (Pendientes 1, B3, decisión de Tomás del 18/09/2026):
  // para cualquier chat, escalado o no. Si la última actividad es más vieja que
  // DATOS_VIEJOS_HORAS, se atiende como consulta nueva: el modelo, el monto, la
  // forma de pago y las marcas de la charla vieja no se arrastran (control.js). Un
  // escalado vencido pasa por las dos limpiezas. Al grupo no se le avisa nada.
  // También se limpia `leadRegistrado` y se da por resuelto un escalado que hubiera
  // quedado abierto (los de "no entendí" no callan, así que no vencen): si esta
  // consulta nueva escala, calla y anota su fila en LEADS (Pendientes 2, punto 5).
  const horasViejas = control.horasViejas(ultimaActividad);
  if (horasViejas) {
    const habiaEscalado = control.limpiarDatosViejos(chatId);
    console.log(
      `[datos viejos] ${chatId}: ${horasViejas} h sin actividad, lo atiendo como consulta nueva` +
        (habiaEscalado ? ' (tenía un escalado sin tomar: queda resuelto)' : '')
    );
  }

  // A la tanda de este chat. Si ya hay una esperando, este mensaje se suma a esa;
  // si se está mandando, queda para la que sigue.
  if (!pendientes.has(chatId)) pendientes.set(chatId, []);
  pendientes.get(chatId).push(linea);
  if (enProceso.has(chatId)) return;
  await atenderChat(chatId, nombre);
}

/** La línea del historial que se acaba de agregar en este chat. */
function ultimaLinea(chatId) {
  const h = state.obtener(chatId).historial;
  return h[h.length - 1];
}

/**
 * Transcribe el audio de un cliente y completa su línea del historial. Nunca
 * tira: devuelve lo mismo que `audio.transcribir`, y lo mira la tanda (un audio
 * que no se entendió no cotiza nunca).
 */
async function transcribirEnLinea(chatId, data, linea) {
  const generacion = state.generacion(chatId);
  const t = await audio.transcribir(data).catch((e) => ({ ok: false, motivo: e.message }));
  if (t.ok) {
    // Un audio que responde a otro mensaje lleva la cita adelante, como un texto (08/10/2026, `conCita`).
    linea.texto = conCita(t.texto, data);
    console.log(`[audio] transcribi un audio de ${chatId}`);
  } else {
    linea.texto = '[audio que no se entendio]';
    console.warn(`[audio] audio de ${chatId} sin transcribir: ${t.motivo}`);
  }
  // Si mientras tanto llegó un #reset, esta línea ya no está en el chat: no se
  // guarda nada, o se volvería a crear el chat con lo de antes.
  if (state.generacion(chatId) !== generacion) return t;
  // Guarda el texto nuevo de la línea.
  state.actualizar(chatId, t.ok ? { ultimoMensajeCliente: t.texto } : {});
  // Registro de aprendizaje (bloque 6): la línea del audio, ya con su texto (o con
  // "[audio que no se entendio]"), y la hora en que llegó.
  const datos = datosDeLinea.get(linea);
  if (datos) {
    aprendizaje.cliente(
      chatId,
      { id: datos.id, texto: linea.texto, audio: true, humanoAtendiendo: datos.humanoAtendiendo },
      { ts: linea.ts }
    );
  }
  return t;
}

/**
 * Tandas. Los mensajes que el cliente manda seguidos se juntan y se interpretan
 * UNA sola vez. Antes, el segundo de dos mensajes seguidos se descartaba y el
 * bot contestaba solo el primero ("hola" sin el "tenes el 13?").
 *
 * Una decisión por tanda es lo que mantiene sano el estado: `decidir` anota lo
 * que va diciendo (saludo, stock informado, temas, marcas), así que lo que se
 * anota tiene que ser lo que se manda. Por eso no se interpreta el primero y se
 * descarta después: se espera, se junta y recién ahí se interpreta.
 *
 * Mientras haya líneas pendientes se atiende una tanda tras otra: lo que llega
 * mientras se manda una respuesta va en la siguiente.
 */
async function atenderChat(chatId, nombre) {
  enProceso.add(chatId);
  // Cortes seguidos porque el cliente escribió en medio de la respuesta (atenderTanda).
  let cortesSeguidos = 0;
  try {
    while ((pendientes.get(chatId) || []).length) {
      // Ritmo humano ANTES de interpretar: nunca contesta al instante, y lo que el
      // cliente siga mandando en este rato entra en la misma tanda. En escucha también
      // se espera (bloque 6, decisión de Tomás del 22/09/2026): no hay nada que mandar,
      // pero así la tanda que se compara con la respuesta humana es la misma que en
      // vivo. Hasta entonces, en escucha se interpretaba cada mensaje apenas llegaba. Si
      // la tanda anterior se cortó porque el cliente escribió en medio, la espera es
      // corta: ya está esperando.
      await dormir(cortesSeguidos ? esperaTrasCorte() : esperaAleatoria());

      // Si un #reset se llevó la cola durante la espera, no queda nada: no se
      // toca el estado (preguntar si hay un humano ya crearía el chat vacío).
      const cola = pendientes.get(chatId);
      if (!cola || !cola.length) continue;
      // Las líneas de esta vuelta, para el `silencio` si un #reset la corta (bloque Ninjo 2).
      const deEstaVuelta = cola.slice();

      // Desde acá la tanda es de esta generación del chat. Si llega un #reset
      // mientras interpreta o manda, lo próximo que lea o escriba ese chat tira
      // ChatReiniciado y la tanda se descarta entera, sin avisar a nadie. Lo que
      // el cliente mande después del reset va en una tanda nueva.
      try {
        const r = await tandaEnCurso.run({ chatId, generacion: state.generacion(chatId) }, () =>
          atenderTanda(chatId, nombre, cola, { cortarPorMensajeNuevo: cortesSeguidos < MAX_CORTES_SEGUIDOS })
        );
        if (r && r.reencolar) {
          // Se cortó porque el cliente escribió en medio: sus líneas vuelven adelante
          // de la cola y la tanda siguiente contesta todo junto (decisión 2A de Tomás).
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
        // Lo que ya hubiera salido queda como `entrega`; lo que falta, sin respuesta.
        aprendizaje.silencio(chatId, { motivo: 'corte', lineas: idsDe(deEstaVuelta), detalle: '#reset' });
      }
    }
  } finally {
    enProceso.delete(chatId);
    pendientes.delete(chatId);
  }
}

/**
 * Por qué no se manda lo que falta de una tanda, o null si se sigue. Se mira antes
 * de CADA envío (auditoría del 15/09/2026, A3): en la auditoría, después de un
 * #pausa salieron 3 mensajes más, y un chat escalado recibió 4.
 *
 * `conocidas` son las líneas que ya estaban en la cola cuando empezó la tanda
 * (también las que el techo dejó para la siguiente): cualquier otra llegó mientras
 * se armaba o se mandaba la respuesta.
 */
function motivoDeCorte(chatId, conocidas, cortarPorMensajeNuevo) {
  const s = state.obtener(chatId);
  if (s.pausado) return 'el chat está pausado';
  if (control.callado(s)) return 'el chat está escalado';
  if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) return 'escribió alguien de la cuenta';
  if (cortarPorMensajeNuevo && (pendientes.get(chatId) || []).some((l) => !conocidas.has(l))) return MENSAJE_NUEVO;
  return null;
}

/** El motivo del evento `silencio` (bloque Ninjo 2) para cada corte de `motivoDeCorte`. */
const SILENCIO_DEL_CORTE = {
  'el chat está pausado': 'pausado',
  'el chat está escalado': 'escalado',
  'escribió alguien de la cuenta': 'persona',
  [MENSAJE_NUEVO]: 'corte',
};

/**
 * Por qué no se le contesta, para el evento `silencio` (bloque Ninjo 2), cuando lo que calla es una
 * persona o el escalado: 'pausado' (#pausa), 'persona' (los SILENCIO_TRAS_HUMANO_MIN) o 'escalado'.
 */
function motivoDelSilencio(chatId) {
  if (state.obtener(chatId).pausado) return 'pausado';
  if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) return 'persona';
  return 'escalado';
}

/** Los ids de WhatsApp de unas líneas de la cola (las fotos y los pedidos del catálogo no tienen). */
const idsDe = (lineas) => lineas.map((l) => (datosDeLinea.get(l) || {}).id || null).filter(Boolean);

/**
 * Cerebro Sonnet, fase 1 (decisión de Tomás del 01/10/2026). Con `CEREBRO_MODO=sombra`, Sonnet
 * piensa qué contestaría con la tanda y queda en el registro de aprendizaje como
 * `propuesta-sonnet`, con el MISMO `tanda` que la propuesta del bot. No se espera: la tanda sigue
 * igual, y no se manda nada, ni al cliente ni al grupo. Un error queda anotado (`error`) y nada
 * más. `cerebro.pensar` lee el chat antes de su primer await y nunca tira.
 */
function pensarEnSombra(chatId, nombre, texto, tanda, { audio = false } = {}) {
  cerebro
    .pensar({ chatId, mensaje: texto, nombre, audio })
    .then((r) => {
      // Bloque Ninjo 2: `sonnet.reglas`, la versión de cerebro-reglas.md, como en la propuesta en vivo.
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
        // Lo que Sonnet quería mandar y la guardia frenó: para comparar.
        ...(r.frenados ? { frenados: r.frenados } : {}),
        ...(r.corregida ? { corregida: r.corregida } : {}),
        // La entrega que leyó el código y la que pasó Sonnet, si no coincidieron (bloque Ninjo 1).
        ...((r.entregasDistintas || []).length ? { entregasDistintas: r.entregasDistintas } : {}),
      });
      console.log(`[sombra] ${chatId}: Sonnet ${r.escalar ? `escalaría (${r.motivo})` : `contestaría ${r.mensajes.length} mensaje(s)`} · US$${r.usd}`);
    })
    .catch((e) => console.error('[sombra] no pude anotar la propuesta de Sonnet:', e.message));
}

/**
 * Cerebro Sonnet, fase 2 (decisiones de Tomás del 02/10/2026): Sonnet contesta esta tanda EN
 * LUGAR de `decidir` (no los dos: `decidir` cambia el estado). Devuelve el `resultado` de siempre
 * (cerebro.comoResultado), con `deSonnet` (lo que devolvió `pensar`). Si Sonnet no puede (error de
 * la API, timeout, sin clave), contesta el bot de siempre (`decidir`) y el grupo se entera una sola
 * vez por racha; el resultado lleva `sonnetFallo` para el registro.
 *
 * Bloque Ninjo 1 (05/10/2026): con las líneas de la tanda, a un acuse que ya se contestó (o que
 * sigue a la entrega inicial, un "te cotizo" o la lista) no se le pregunta a Sonnet: no sale nada,
 * no escala y la propuesta queda con el motivo "acuse". `audio`: lo de ahora vino por audio.
 *
 * Bloque Ninjo 1b (05/10/2026): antes de pensar, el historial se completa con Evolution
 * (`completarContexto`); si Evolution no contestó, el registro lo dice (`contexto`). `origen:
 * 'silencio'` (el barrido de `revisarSilencios`) o, desde el 07/10/2026, `'sigue'` (#sigue, `alSeguir`):
 * si Sonnet no puede, el bot de siempre NO contesta; al cliente no le sale nada y el grupo recibe el
 * 💬 SIN CONTESTAR (lo manda atenderTanda).
 *
 * Las fotos de la tanda (`fotos`: { key, mimetype } de cada una, decisión de Tomás del 06/10/2026): se
 * bajan de Evolution a la vez que se completa el historial (fotos-del-cliente.js: las últimas 3, 10 s por
 * foto) y van a `contestar`; lo que no se pudo ver, el pedido lo dice.
 */
async function contestarConSonnet(chatId, texto, nombre, llegada, { audio = false, origen = null, fotos = [] } = {}) {
  const [ctx, bajadas] = await Promise.all([completarContexto(chatId), fotos.length ? fotosDelCliente.bajar(fotos) : null]);
  if (bajadas) {
    console.log(`[sonnet] ${chatId}: ${bajadas.mandadas} foto(s), Sonnet ve ${bajadas.imagenes.length}${bajadas.sinVer ? ` (${bajadas.sinVer} no se pudieron ver)` : ''}`);
  }
  const conFotos = bajadas ? { imagenes: bajadas.imagenes, fotos: { mandadas: bajadas.mandadas, sinVer: bajadas.sinVer } } : {};
  const c = await cerebro.contestar({ chatId, mensaje: texto, nombre, lineas: llegada.lineas, audio, ...conFotos });
  if (c.r && ctx.error) c.r.contexto = /filtró/.test(ctx.error) ? 'evolution no filtró por chat' : 'evolution no contestó';
  if (c.r && c.r.sinLlamar) {
    console.log(`[sonnet] ${chatId}: acuse, no le pregunto a Sonnet (${c.r.sinLlamar}): no sale nada y no escala`);
    return { ...c.resultado, deSonnet: c.r };
  }
  if (!c.error) {
    cerebro.alContestar();
    console.log(
      `[sonnet] ${chatId}: ${c.resultado.escalar ? `escala (${c.resultado.motivo})` : `contesta ${c.resultado.mensajes.length} mensaje(s)`} · ` +
        `leyó ${cerebro.leidosTexto(c.r.leidos)} · US$${c.r.usd}`
    );
    return { ...c.resultado, deSonnet: c.r };
  }
  if (origen === 'silencio' || origen === 'sigue') {
    console.warn(`[${origen}] ${chatId}: Sonnet no pudo contestar (${c.error}): no le contesto y aviso al grupo`);
    return { escalar: false, motivo: `Sonnet no pudo contestar (${c.error})`, mensajes: [], sinContestar: true, sonnetFallo: c.r };
  }
  console.warn(`[sonnet] ${chatId}: Sonnet no pudo contestar (${c.error}), contesta el bot de siempre`);
  const aviso = cerebro.alFallar(c.error);
  if (aviso) await evolution.avisarGrupo(aviso);
  const resultado = await decidirSinCita(chatId, texto, nombre, llegada);
  return { ...resultado, sonnetFallo: c.r };
}

/**
 * El bot de siempre (`decidir`) con el mensaje sin lo que citó el cliente (08/10/2026, `sinCita`): lee lo que escribió
 * él, como antes de la cita (un monto o un "como estas?" de lo citado no son suyos). Las líneas de la tanda van tal
 * cual: con ellas `decidir` encuentra la tanda en el historial, donde quedaron con la cita.
 */
function decidirSinCita(chatId, texto, nombre, llegada) {
  return decidir(chatId, sinCita(texto), nombre, llegada);
}

/**
 * El historial del chat completado con Evolution antes de que Sonnet lo lea (bloque Ninjo 1b,
 * src/contexto.js). Con `todos`, un chat que sumó líneas cuenta para el resumen de la hora. Nunca tira.
 */
async function completarContexto(chatId) {
  const r = await contexto.completar(chatId);
  if (r.agregadas && config.cerebro.modo === 'todos') cerebro.contarEnVivo('evolution', { chatId });
  return r;
}

/**
 * Le llegó al cliente lo que contestó Sonnet: con `tester` y `nuevos` (y en los chats marcados con
 * cualquier modo), el aviso al grupo de cuántos mensajes leyó; con `todos`, cuenta para el resumen
 * de la hora (`revisarResumenSonnet`).
 */
async function avisarRespuestaSonnet({ chatId, nombre, ctx, resultado, deSonnet }) {
  if (config.cerebro.modo === 'todos') {
    cerebro.contarEnVivo('respuesta', deSonnet);
    return;
  }
  const aviso = cerebro.avisoRespuesta({
    chatId,
    nombre: ctx.nombre || nombre,
    leidos: deSonnet.leidos,
    primero: (resultado.sonnetMensajes || [])[0] || '',
  });
  const r = await evolution.avisarGrupo(aviso);
  if (r && r.bloqueado) console.log(`[sonnet] el aviso al grupo no salió: ${r.motivo}`);
}

/**
 * Con `CEREBRO_MODO=todos`, un resumen por hora en lugar de un aviso por respuesta: sale en la
 * primera vuelta después de que termina la hora, solo si hubo respuestas (cerebro.resumenesDeLaHora).
 */
async function revisarResumenSonnet(ahora = Date.now()) {
  for (const texto of cerebro.resumenesDeLaHora(ahora)) {
    if (config.cerebro.modo !== 'todos') continue;
    const r = await evolution.avisarGrupo(texto);
    if (r && r.bloqueado) console.log(`[sonnet] el resumen de la hora no salió: ${r.motivo}`);
  }
}

setInterval(() => revisarResumenSonnet().catch(() => {}), 5 * 60 * 1000);

/**
 * El gasto de Sonnet del mes pasó el 80% de CEREBRO_TOPE_MES_USD (bloque Ninjo 2, 06/10/2026): un aviso
 * al grupo, una sola vez por mes ("⚠️ Sonnet va US$48,10 de US$60 este mes (80,2%)"). Se marca recién
 * cuando salió, como el resumen: si el grupo está bloqueado (escucha, sin destino), no se arma nada y se
 * reintenta en la vuelta siguiente. Cada 5 minutos, así cuenta también lo que gastó la sombra.
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
 * En qué modo se armó una propuesta, para el registro de aprendizaje: 'escucha' (no
 * sale nada), 'borrador' (va al grupo), 'fuera-de-lista' (hay listas de prueba y este
 * número no está: se lo trata como borrador) o 'vivo' (le llega al cliente).
 */
function modoDeLaPropuesta(chatId) {
  if (config.modoEscucha) return 'escucha';
  if (config.modoBorrador) return 'borrador';
  return evolution.leLlegaAlCliente(chatId) ? 'vivo' : 'fuera-de-lista';
}

/**
 * ¿El mensaje le pasa un precio de contado o una cotización? (bloque Ninjo 1b: lo que habilita el
 * seguimiento). Un precio de contado de las herramientas (la marca `preciosMostradosDe`, la de Sonnet y
 * la del bot de siempre), la cotización (el 📱 del bot, el bloque de Sonnet, "1 pago de", "2 cuotas de")
 * o líneas de la lista de precios ("Ip 13 128gb 100% 495.000").
 */
function llevaPrecio(m) {
  const marcas = acciones.marcasDe(m) || {};
  if ((marcas.preciosMostradosDe || []).length) return true;
  const texto = acciones.comoTexto(m);
  return /📱/.test(texto) || cerebro.esCotizacion(texto) || /^ip \d/im.test(texto);
}

async function atenderTanda(chatId, nombre, cola, { cortarPorMensajeNuevo = true } = {}) {
  const conocidas = new Set(cola);

  // Panel Chiara (06/10/2026): apagada desde el panel no se interpreta nada (ni Sonnet ni Gemini) y no
  // sale nada. Lo que escribió el cliente ya quedó en el historial; al prenderla no se contesta solo.
  if (!interruptor.prendida()) {
    console.log(`[apagada] ${chatId}: Chiara está apagada desde el panel, no contesto (queda en el historial)`);
    // Bloque Ninjo 2 (merge del 06/10/2026): queda el porqué en el registro.
    aprendizaje.silencio(chatId, { motivo: 'apagada', lineas: idsDe(cola) });
    pendientes.set(chatId, []);
    return;
  }

  // Si mientras esperábamos contestó una persona, no se interpreta nada: lo ve
  // ella. Lo que había llegado queda en el historial. Lo mismo si el chat quedó
  // escalado: queda callado (control.js).
  if (!config.modoEscucha && (state.humanoActivo(chatId, config.silencioTrasHumanoMin) || control.callado(state.obtener(chatId)))) {
    console.log(`[${chatId}] contestó un humano o quedó escalado mientras esperaba, cancelo`);
    // Sombra con persona (03/10/2026): lo que ya esperó va a la sombra sin otra espera. Sonnet ve
    // el chat solo hasta la última línea del cliente: lo que contestó la persona no entra.
    const motivoSombra = state.humanoActivo(chatId, config.silencioTrasHumanoMin) ? 'persona' : 'escalado';
    sombraPersona.anotar(chatId, nombre, cola.map((l) => ({ linea: l, id: (datosDeLinea.get(l) || {}).id || null })), motivoSombra, 0);
    aprendizaje.silencio(chatId, { motivo: motivoDelSilencio(chatId), lineas: idsDe(cola) });
    pendientes.set(chatId, []);
    return;
  }

  // Las líneas que hay ahora, con sus audios ya transcritos. Lo que llegue
  // mientras tanto queda para la tanda siguiente.
  const disponibles = cola.length;
  const resultadosAudio = await Promise.all(cola.slice(0, disponibles).map((l) => transcripciones.get(l) || null));
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

  // Las fotos sin texto (desde cero, D1) y los pedidos del catálogo (D10) no son líneas del
  // historial: las fotos van como `fotos`; un pedido solo, sin texto en la tanda, escala.
  const conTexto = tanda.filter((l) => !l.foto && !l.pedido);
  const fotos = tanda.filter((l) => l.foto).length;
  const pedidos = tanda.filter((l) => l.pedido);
  // Las fotos de la tanda que se pueden bajar para Sonnet (06/10/2026), sin epígrafe y con epígrafe, en
  // el orden en que llegaron. Un álbum (`albumMessage`) no cuenta: sus fotos llegan cada una aparte.
  const imagenesDeLaTanda = tanda.map((l) => (datosDeLinea.get(l) || {}).imagen).filter(Boolean);
  if (!conTexto.length && !pedidos.length) {
    // Solo fotos: cuentan en un canje en curso. Si el canje ya no está (lo cerró la tanda
    // anterior, o escaló), no hay nada que hacer. En un chat de Sonnet también (06/10/2026): la
    // contesta Sonnet solo si pasa este chequeo.
    const s = state.obtener(chatId);
    const canjeDeSonnet = cerebro.canjeVigente(s) && cerebro.quienAtiende(chatId) === 'sonnet';
    if (!((s.permuta && s.permuta.ofrece && !s.escalado) || canjeDeSonnet)) {
      aprendizaje.silencio(chatId, { motivo: 'sin-texto', lineas: [], formato: 'foto' });
      return;
    }
    console.log(`[tanda] ${chatId}: ${fotos} foto(s) sin texto en un canje en curso`);
  }
  const texto = conTexto.map((l) => l.texto).join('\n');
  if (conTexto.length > 1) {
    console.log(`[tanda] ${chatId}: ${conTexto.length} mensajes juntos`);
    // Sin las citas (08/10/2026): es el "último mensaje" del panel.
    state.actualizar(chatId, { ultimoMensajeCliente: sinCita(texto) });
  }
  if (tanda.some((l) => l.audio)) {
    state.actualizar(chatId, { ultimoContexto: { ...(state.obtener(chatId).ultimoContexto || {}), audio: true } });
  }
  const audioFallido = audios.find((t) => t && !t.ok);
  // Bloque Ninjo 1b: una tanda que armó el barrido del silencio (revisarSilencios); desde el 07/10/2026, también
  // #sigue (`alSeguir`, origen 'sigue'). Las dos van por el mismo camino (`encolarSinContestar`).
  const origen = conTexto.map((l) => (datosDeLinea.get(l) || {}).origen).find((o) => o === 'silencio' || o === 'sigue') || null;
  // Bloque Ninjo 2: el id de la tanda (el de su propuesta) va también en sus `silencio` y `entrega`. Una
  // tanda que no salió deja su `silencio`, con el motivo; con `tanda` si la propuesta ya está anotada.
  const idTanda = crypto.randomUUID();
  let anotada = false;
  const sinRespuesta = (motivo, extra = {}) =>
    aprendizaje.silencio(chatId, { motivo, lineas: idsDe(conTexto), ...(anotada ? { tanda: idTanda } : {}), ...(origen ? { origen } : {}), ...extra });

  try {
    // Un audio que no se pudo transcribir NUNCA cotiza, y la tanda entera lo ve
    // una persona: ese audio podía traer justo el monto o el modelo. Adivinar un
    // precio sobre un audio mal escuchado es el peor error posible de todo el
    // bot. Al cliente no se le dice nada: antes le prometía "si preferis te llama
    // fran", y nadie garantiza esa llamada. Se escala en silencio.
    // Un pedido del catálogo sin texto en la tanda (desde cero, D10) también escala callado,
    // con el nombre del producto si viene.
    const titulos = [...new Set(pedidos.map((l) => l.titulo).filter(Boolean))];
    // Cerebro Sonnet, fase 2: quién contesta (cerebro.quienAtiende). Una tanda sin texto o con un
    // audio que no se entendió sigue como siempre: no hay qué preguntarle a nadie. Salvo una tanda de
    // solo fotos en un chat que atiende Sonnet (decisión de Tomás del 06/10/2026): la contesta Sonnet,
    // viendo las fotos; en los chats del bot de siempre, como siempre (`soloFotos` de responder.js).
    const soloFotos = !conTexto.length && !pedidos.length;
    const quien =
      conTexto.length && !audioFallido
        ? cerebro.quienAtiende(chatId)
        : soloFotos && imagenesDeLaTanda.length && cerebro.quienAtiende(chatId) === 'sonnet'
        ? 'sonnet'
        : 'bot';
    const llegada = { lineas: conTexto.map((l) => ({ ts: l.ts, texto: l.texto })), ...(fotos ? { fotos } : {}) };
    // Promo del Día de la Madre (12/10/2026, src/promo-madre.js): no se cotiza, se saluda una sola vez y se escala.
    // Va antes de elegir quién contesta: no se le pregunta a Sonnet ni a Gemini. Un pedido del catálogo sin texto o un
    // audio que no se entendió siguen escalando por su motivo (están antes en la cadena de abajo). Vale hasta
    // PROMO_MADRE_HASTA; después el mensaje sigue el flujo normal.
    const promo = promoMadre.deMensaje(texto);
    if (promo) {
      console.log(`[promo-madre] ${chatId}: ${promo.motivo} (anuncio_id ${promo.anuncioId}): no cotizo, escalo`);
      // El panel ya la anotó si el mensaje era texto; un audio recién se lee acá, transcrito.
      panel.conPromo(chatId, promo.anuncioId);
    }
    const resultado = !conTexto.length && pedidos.length
      ? {
          escalar: true,
          motivo: `mandó un pedido del catálogo de WhatsApp${titulos.length ? `: ${titulos.join(', ')}` : ''}`,
          mensajes: [],
        }
      : audioFallido
      ? {
          escalar: true,
          motivo: `mandó un audio y no se pudo transcribir (${audioFallido.motivo})`,
          mensajes: [],
          // No calla el chat: lo que el cliente escriba después se sigue atendiendo.
          callar: false,
        }
      : promo
      ? promoMadre.resultado(promo, state.obtener(chatId))
      : quien === 'sonnet'
      ? await contestarConSonnet(chatId, texto, nombre, llegada, { audio: conTexto.some((l) => l.audio), origen, fotos: imagenesDeLaTanda })
      : await decidirSinCita(chatId, texto, nombre, llegada);
    const ctx = state.obtener(chatId);

    // Bloque 5: una entrega hasta TOPE_BAJO_MINIMO ($45.000 desde el 5b) bajo el
    // mínimo se cotizó con recargo. Al cliente no le llega nada distinto; queda en el log.
    if (resultado.bajoMinimo) {
      console.log(`[cotizacion] ${chatId}: entrega bajo el minimo, cotizada con recargo (${resultado.bajoMinimo.join(', ')})`);
    }

    const mensajes = (resultado.mensajes || []).slice(0, config.ritmo.maxMensajesPorTanda);

    // Registro de aprendizaje (bloque 6): lo que el bot diría con ESTA tanda, con los id
    // de SUS líneas, su lectura y cómo llegaron. Sale de la tanda, nunca de campos del
    // chat que se pisan. Una tanda que cortó un #reset no llega hasta acá: el
    // `state.obtener` de arriba ya tiró ChatReiniciado.
    const ultimaDeLaTanda = datosDeLinea.get(conTexto[conTexto.length - 1]) || {};
    // Si la contestó Sonnet (fase 2): `fuente: 'sonnet'` y lo que costó, con el mismo `tanda`.
    const deSonnet = resultado.deSonnet || null;
    aprendizaje.propuesta(chatId, {
      tanda: idTanda,
      lineas: conTexto.map((l) => (datosDeLinea.get(l) || {}).id || null),
      mensajes: mensajes.map(acciones.comoTexto),
      escalar: resultado.escalar,
      motivo: resultado.motivo,
      lectura: resultado.lectura,
      contexto: { humanoAtendiendo: Boolean(ultimaDeLaTanda.humanoAtendiendo), audio: tanda.some((l) => l.audio) },
      modo: modoDeLaPropuesta(chatId),
      ...(origen ? { origen } : {}),
      ...(deSonnet
        ? {
            fuente: 'sonnet',
            sonnet: {
              modelo: config.cerebro.modelo,
              // Bloque Ninjo 2: con qué versión de cerebro-reglas.md contestó (ver CAMBIOS-CEREBRO.md).
              reglas: cerebro.REGLAS_HASH,
              uso: deSonnet.uso || null,
              usd: deSonnet.usd || 0,
              ms: deSonnet.ms == null ? null : deSonnet.ms,
              guardia: deSonnet.guardia || null,
              herramientas: deSonnet.herramientas || [],
              leidos: deSonnet.leidos || null,
              ...(deSonnet.frenados ? { frenados: deSonnet.frenados } : {}),
              // Lo que la guardia frenó y Sonnet corrigió en una vuelta más (02/10/2026).
              ...(deSonnet.corregida ? { corregida: deSonnet.corregida } : {}),
              // Bloque Ninjo 1: un acuse que no se le preguntó (por qué), y la entrega que leyó el
              // código y la que pasó Sonnet en `cotizar`, si no coincidieron.
              ...(deSonnet.sinLlamar ? { sinLlamar: deSonnet.sinLlamar } : {}),
              ...((deSonnet.entregasDistintas || []).length ? { entregasDistintas: deSonnet.entregasDistintas } : {}),
              // Bloque Ninjo 1b: Evolution no contestó al completar el historial; y el aviso al grupo de responder.
              ...(deSonnet.contexto ? { contexto: deSonnet.contexto } : {}),
              ...(deSonnet.avisoGrupo ? { avisoGrupo: deSonnet.avisoGrupo } : {}),
              // Las fotos de la tanda (06/10/2026): cuántas vio y cuántas no se pudieron ver (sin la imagen).
              ...(deSonnet.imagenes ? { imagenes: deSonnet.imagenes } : {}),
              // Las fotos de los equipos que van (08/10/2026): el código de cada unidad y su pie, las que quedaron después
              // del tope de 4 (`mensajes`, no todas las que eligió la herramienta).
              ...(mensajes.some(acciones.esFotoEquipo) ? { fotos: mensajes.filter(acciones.esFotoEquipo).map((f) => `${f.codigo}: ${f.pie}`) } : {}),
            },
          }
        : {}),
    });
    anotada = true;
    // El `origen` de cada `entrega` de esta tanda (bloque Ninjo 2): 'silencio' o 'sigue' si la armó uno de esos.
    const donde = { origen: origen || (deSonnet ? 'sonnet' : 'bot'), tanda: idTanda };
    // Con `todos`, para el resumen de la hora (revisarResumenSonnet): lo que costó y si escaló.
    if (deSonnet && config.cerebro.modo === 'todos') {
      cerebro.contarEnVivo('gasto', deSonnet);
      if (resultado.escalar) cerebro.contarEnVivo('escalado', deSonnet);
    }
    // Sonnet tenía que contestar y no pudo: contestó el bot de siempre. Queda el error, con el `tanda`.
    if (resultado.sonnetFallo) {
      const f = resultado.sonnetFallo;
      aprendizaje.anotar('propuesta-sonnet', chatId, {
        tanda: idTanda,
        modelo: config.cerebro.modelo,
        // Con fotos (06/10/2026), cuántas iban: una foto que la API no acepta también da error.
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

    // Cerebro Sonnet, fase 1: en sombra piensa con ESTA tanda y lo anota, sin esperarlo y sin
    // mandar nada. Con una tanda sin texto (solo fotos o un pedido) o un audio que no se entendió,
    // no: el bot escala o no interpreta, y no hay qué preguntarle. Fase 2: los chats que no
    // atiende Sonnet (con `tester` o `nuevos`, o los que sacó #bot) también.
    // La promo tampoco se piensa en sombra: es una regla de código y Sonnet costaría para nada.
    if (quien === 'sombra' && !promo) {
      pensarEnSombra(chatId, nombre, texto, idTanda, { audio: conTexto.some((l) => l.audio) });
    }

    // Bloque Ninjo 1b: el barrido del silencio (o #sigue, desde el 07/10/2026) y Sonnet no pudo contestar (error
    // de la API). El bot de siempre no contesta acá: al cliente no le sale nada y el grupo se entera.
    if (resultado.sinContestar) {
      const ultimaDelCliente = conTexto[conTexto.length - 1];
      await evolution.avisarGrupo(
        `💬 SIN CONTESTAR — ${ctx.nombre || nombre || 'sin nombre'} — "${cerebro.recorte(ultimaDelCliente && ultimaDelCliente.texto, 120)}" — wa.me/${chatId.split('@')[0]}`
      );
      sinRespuesta('sonnet-no-pudo');
      return;
    }

    // El bot decidió callarse porque el chat no parece una venta. Se avisa al
    // grupo UNA vez, con el link, y no se le manda nada al cliente.
    //
    // No se marca `escalado`: eso es una señal comercial, volvería a meter el
    // chat en el resumen como "te están esperando" y sería justo al revés de
    // lo que acaba de decidirse.
    if (resultado.silencioso) {
      const num = chatId.split('@')[0];
      await evolution.avisarGrupo(
        `🤐 ${nombre || 'sin nombre'} — ${resultado.motivo}\n` +
          'No le contesto mas hasta que diga algo de una compra.\n' +
          `Si era un cliente, contestale vos: https://wa.me/${num}`
      );
      console.log(`[sin venta] ${chatId}: ${resultado.motivo}`);
      sinRespuesta('sin-venta');
      return;
    }

    state.actualizar(chatId, {
      ultimaPropuestaBot: mensajes.map(acciones.comoTexto).join(' | '),
      ultimoMotivo: resultado.escalar ? resultado.motivo : '',
      // Queda para siempre, a diferencia de `ultimaPropuestaBot`, que se pisa en
      // cada mensaje: #vendido y #perdido lo usan para saber si el bot participó.
      ...(mensajes.length && !ctx.botPropuso ? { botPropuso: Date.now() } : {}),
    });

    // Hace falta una persona y al cliente no se le dice nada: ni "ahora te
    // responde fran" ni nada parecido, que promete algo que nadie garantiza.
    // El grupo es el único que se entera, así que este aviso NO depende de
    // `escalado`: si el chat ya se había escalado por otra cosa, igual sale.
    if (resultado.escalar && !mensajes.length) {
      await escalarEnSilencio({
        chatId,
        nombre,
        motivo: resultado.motivo,
        ctx,
        calla: resultado.callar !== false,
        paraElGrupo: resultado.paraElGrupo || null,
      });
      // Todo lo que iba a contestar ya se lo había dicho (D5, el filtro de repetidos), o escaló.
      sinRespuesta(String(resultado.motivo || '').includes(TODO_REPETIDO) ? 'repetido' : 'escalo');
      return;
    }

    // No hay nada que decir (ya se avisó que este chat quedó en silencio). Bloque Ninjo 2: un acuse
    // al que Sonnet iba a contestar algo ya dicho es un `silencio` "repetido", y el bot de siempre con
    // el chat ya callado por no venta, "sin-venta". Un acuse que no se le preguntó a Sonnet (o que el
    // bot de siempre deja sin contestar) o unas fotos sin nada nuevo ya quedan en su propuesta.
    if (!mensajes.length) {
      if (/^acuse: /.test(resultado.motivo || '')) sinRespuesta('repetido');
      else if (!deSonnet && ctx.calladoPorNoVenta) sinRespuesta('sin-venta');
      return;
    }

    // Modo escucha: se calcula lo que habría dicho, queda en el registro de
    // aprendizaje para compararlo con la respuesta humana, y no sale ni un mensaje.
    // La espera ya pasó antes de interpretar, igual que en vivo (bloque 6).
    if (config.modoEscucha) {
      console.log(`[escucha] ${chatId}: habria dicho -> ${mensajes.map(acciones.comoTexto).join(' | ').slice(0, 120)}`);
      sinRespuesta('escucha');
      return;
    }

    // La espera de ritmo humano ya pasó, antes de interpretar. Pero interpretar
    // lleva un rato (Gemini, audios): si en ese rato contestó una persona, no se manda.
    if (state.humanoActivo(chatId, config.silencioTrasHumanoMin)) {
      console.log(`[${chatId}] contestó un humano mientras se armaba la respuesta, cancelo`);
      sinRespuesta(state.obtener(chatId).pausado ? 'pausado' : 'persona');
      return;
    }

    // Un solo punto cubre los cuatro caminos a cliente (texto, foto, PDF y el
    // texto de respaldo si el PDF falla): el `for` de abajo es inalcanzable si
    // acá se retorna. Si el destino no está en las listas de prueba se lo trata
    // exactamente como en modo borrador, que es lo que queremos: el cliente no
    // recibe nada y el borrador igual llega al grupo. Es la única definición de
    // "le llega al cliente" (evolution.js); el modo escucha ya retornó arriba.
    if (!evolution.leLlegaAlCliente(chatId)) {
      await evolution.avisarGrupo(
        avisoParaGrupo({
          chatId,
          nombre,
          motivo: resultado.escalar ? resultado.motivo : 'respuesta automática',
          ctx,
          // Legible: "[foto: iPhone 13]", "[doc: compromiso de pago] ...". Nunca rutas.
          borrador: mensajes.map(acciones.comoTexto).join('\n') + (resultado.avisoGrupo ? `\n📌 ${resultado.avisoGrupo}` : ''),
        })
      );
      state.actualizar(chatId, { ultimoBot: Date.now() });
      sinRespuesta(config.modoBorrador ? 'borrador' : 'fuera-de-prueba');
      return;
    }

    // Fase 2: si la contestó Sonnet y le llegó algo, el aviso de cuántos mensajes leyó (con
    // `todos`, cuenta para el resumen de la hora). También si la tanda se cortó a la mitad.
    let enviados = 0;
    // Bloque Ninjo 1b: si le llegó un precio de contado o una cotización (`ultimoPrecioBot`, para el
    // seguimiento) y el aviso al grupo de `responder` (📌: un modelo que no hay), sin callar el chat.
    let conPrecio = false;
    const siContestoSonnet = async () => {
      if (deSonnet && enviados) await avisarRespuestaSonnet({ chatId, nombre, ctx, resultado, deSonnet });
      if (resultado.avisoGrupo && enviados) {
        // El 🚨 del depósito (12/10/2026): va sin el 📌, para que Tomás lo reconozca ("ENTRÁ VOS").
        const quien = ctx.nombre || nombre || 'sin nombre';
        const wa = `wa.me/${chatId.split('@')[0]}`;
        const texto = /^🚨/u.test(resultado.avisoGrupo) ? `${resultado.avisoGrupo} — ${quien} — ${wa}` : `📌 ${quien} — ${resultado.avisoGrupo} — ${wa}`;
        const r = await evolution.avisarGrupo(texto);
        if (r && r.bloqueado) console.log(`[sonnet] el aviso 📌 al grupo no salió: ${r.motivo}`);
      }
      if (conPrecio) state.actualizar(chatId, { ultimoPrecioBot: Date.now() });
    };

    for (let i = 0; i < mensajes.length; i++) {
      const m = mensajes[i];
      // El "escribiendo…" lo hace el bot (Pendientes 1, D2, decisión de Tomás tras la
      // prueba en vivo del 16/09/2026). Antes era el `delay` del envío: Evolution
      // retenía el mensaje ese rato, y un #reset, un #pausa o una persona que entraba
      // no lo frenaban, porque el bot ya había pasado el control ("Dale, con los
      // $900.000…" salió después del "🔄 Reiniciado"). Ahora: presencia, espera del
      // ritmo, RECIÉN AHÍ el control, y el envío con delay 0, que le llega ya. El
      // ritmo entre mensajes es el mismo: la espera pasó de después a antes.
      await evolution.mostrarEscribiendo(chatId, config.ritmo.entreMensajesMs);
      await dormir(config.ritmo.entreMensajesMs);
      // Un #reset durante la espera corta acá: lo que falta no sale.
      state.comprobarVigente(chatId);
      // Pausa, escalado, una persona que escribe o un mensaje nuevo del cliente: se
      // corta lo que falta. Lo que ya salió queda confirmado (su marca se guardó al
      // enviarse) y lo que no salió no deja ninguna marca puesta.
      const corte = motivoDeCorte(chatId, conocidas, cortarPorMensajeNuevo);
      if (corte) {
        console.log(`[corte] ${chatId}: ${corte}, ${mensajes.length - i} mensaje(s) sin mandar`);
        sinRespuesta(SILENCIO_DEL_CORTE[corte] || 'corte', { sinMandar: mensajes.length - i });
        await siContestoSonnet();
        return corte === MENSAJE_NUEVO ? { reencolar: tanda } : undefined;
      }
      // Un documento del catálogo, con su pie. La ruta sale de documentos.js por id,
      // nunca de un texto (ver acciones.js).
      if (acciones.esDoc(m)) {
        try {
          const ruta = documentos.ruta(m.id);
          if (!ruta) throw new Error(`no hay documento "${m.id}" en el catálogo`);
          const enviadoDoc = await enviarAlCliente(
            chatId,
            'documento',
            m.pie,
            () => evolution.enviarDocumento(chatId, ruta, m.pie || '', 0),
            acciones.marcasDe(m),
            donde
          );
          anotarEnvio(chatId, enviadoDoc);
          if (autoria.llego(enviadoDoc)) enviados++;
          state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m), autoria.llego(enviadoDoc) ? { id: enviadoDoc.key.id } : {});
        } catch (e) {
          // Si lo que pasó es que el chat se reinició, tampoco va el texto de respaldo.
          if (e instanceof state.ChatReiniciado) throw e;
          console.error('[doc] no pude mandarlo:', e.message);
          // Si el PDF falla, al menos que llegue el texto. Sin las marcas del
          // documento: el pie salió, el PDF no.
          if (m.pie) {
            anotarEnvio(chatId, await enviarAlCliente(chatId, 'texto', m.pie, () => evolution.enviarTexto(chatId, m.pie, 0), null, donde));
          }
          // Y que alguien se entere y le mande el compromiso a mano (30/09/2026).
          await avisarPdfNoSalio(chatId, nombre);
        }
        state.actualizar(chatId, { ultimoBot: Date.now() });
        continue;
      }

      if (acciones.esFoto(m)) {
        try {
          await mandarFoto(chatId, m, donde);
        } catch (e) {
          if (e instanceof state.ChatReiniciado) throw e;
          console.error('[foto] no pude mandarla:', e.message);
        }
      } else if (acciones.esFotoEquipo(m)) {
        // La foto de un equipo del local con su pie (08/10/2026): cuenta como un mensaje que le llegó, y el pie trae
        // el precio (el seguimiento lo mira, como un precio de contado). Si no se pudo mandar (la foto ya no está en
        // el índice o en el disco, Evolution falló), el grupo se entera y se la manda a mano: el chat no escala solo.
        try {
          const enviadaFoto = await mandarFotoDeEquipo(chatId, m, donde);
          if (autoria.llego(enviadaFoto)) {
            enviados++;
            conPrecio = true;
          }
        } catch (e) {
          if (e instanceof state.ChatReiniciado) throw e;
          console.error('[foto] no pude mandar la foto del equipo:', e.message);
          await avisarFotoNoSalio(chatId, nombre, m, e);
        }
      } else if (typeof m === 'string' || acciones.esTexto(m)) {
        // Un texto se manda SIEMPRE como texto, aunque tenga corchetes o forma de marcador.
        // Puede venir como objeto si confirma marcas al salir (ver acciones.conMarcas).
        const texto = acciones.comoTexto(m);
        const enviado = await enviarAlCliente(chatId, 'texto', texto, () => evolution.enviarTexto(chatId, texto, 0), acciones.marcasDe(m), donde);
        anotarEnvio(chatId, enviado);
        if (autoria.llego(enviado)) enviados++;
        if (autoria.llego(enviado) && llevaPrecio(m)) conPrecio = true;
        // Sin id de Evolution no se sabe si le llegó: no cuenta como "ya se lo dije" (D5).
        state.agregarAlHistorial(chatId, 'vendedor', texto, autoria.llego(enviado) ? { id: enviado.key.id } : { sinConfirmar: true });
      } else {
        console.error(`[${chatId}] un mensaje que no es texto ni una foto o documento del catálogo: no lo mando`);
        continue;
      }
      state.actualizar(chatId, { ultimoBot: Date.now() });
    }
    await siContestoSonnet();

    const callaEste = resultado.callar !== false;
    if (resultado.escalar && control.escalaEncima(ctx, callaEste)) {
      // `pisa` se lee ANTES de escalar: ctx es el mismo objeto del estado y `escalar` lo cambia.
      const pisa = Boolean(ctx.escalado);
      // Desde acá el chat queda callado hasta que alguien lo tome, salvo los escalados
      // de "no entendí" (`callar: false`), donde el bot sigue atendiendo (control.js).
      control.escalar(chatId, resultado.motivo, { calla: callaEste });
      // `paraElGrupo` (08/10/2026): el código del equipo del local sin foto, cuando salieron las fotos de los otros
      // modelos y se escala por ese (cerebro.comoResultado, `escalarDespues`).
      await evolution.avisarGrupo(
        avisoParaGrupo({ chatId, nombre, motivo: resultado.motivo, ctx, paraElGrupo: resultado.paraElGrupo || null })
      );
      await anotarLeadUnaVez({ chatId, nombre, ctx, motivo: resultado.motivo, pisa });
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
// Webhook (auditoría del 15/09/2026, A1)
// ---------------------------------------------------------------------------
// El webhook ordena mandar mensajes por el WhatsApp del negocio: no se le cree a
// cualquiera. En orden, lo barato primero:
//  1. el secreto de la ruta (WEBHOOK_SECRETO): sin él, 401 y el cuerpo ni se lee;
//  2. el tope de pedidos por minuto, que los pedidos sin secreto no gastan;
//  3. el cuerpo: JSON de hasta config.webhook.limiteCuerpo, evento de mensajes, la
//     instancia (si viene) y cada mensaje con su remoteJid.
// Evolution reintenta ante cualquier error salvo 400, 401, 403, 404 y 422: lo que
// no sirve se descarta con esos códigos, y el tope responde 429, que sí se
// reintenta y así no se pierde el mensaje.
//
// OJO: el cuerpo que manda Evolution trae su `apikey`. Nunca se loguea el cuerpo,
// ni la ruta (trae el secreto).

/** Compara en tiempo constante, también con largos distintos: se comparan los hashes. */
function mismoSecreto(recibido, esperado) {
  const a = crypto.createHash('sha256').update(String(recibido)).digest();
  const b = crypto.createHash('sha256').update(String(esperado)).digest();
  return crypto.timingSafeEqual(a, b);
}

let avisoSinSecreto = 0;
function verificarSecreto(req, res, next) {
  const esperado = config.webhook.secreto;
  // Sin secreto se acepta como siempre, también con algo después de /webhook: así se
  // puede cambiar primero la URL de Evolution y después el .env, sin perder mensajes.
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
 * Qué hacer con un cuerpo ya leído: { status, motivo } si se descarta, o { lote }
 * con los mensajes válidos (vacío si el evento no es de mensajes, que no es un error).
 */
function validarCuerpo(cuerpo) {
  if (!cuerpo || typeof cuerpo !== 'object' || Array.isArray(cuerpo)) {
    return { status: 400, motivo: 'el cuerpo no es un objeto' };
  }
  if (typeof cuerpo.event !== 'string') return { status: 400, motivo: 'sin event' };
  // connection.update y los demás eventos no se procesan, pero tampoco son un error.
  if (!/messages[._]upsert/i.test(cuerpo.event)) return { lote: [] };
  // Evolution v2 manda el nombre de la instancia en `instance`. Si no viene, no se exige.
  if (cuerpo.instance != null && cuerpo.instance !== config.evolution.instancia) {
    return { status: 403, motivo: 'es de otra instancia' };
  }
  const data = Array.isArray(cuerpo.data) ? cuerpo.data : [cuerpo.data];
  const lote = data.filter(
    (d) => d && typeof d === 'object' && d.key && typeof d.key.remoteJid === 'string' && d.key.remoteJid
  );
  if (!lote.length) return { status: 400, motivo: 'no trae ningún mensaje con remoteJid' };
  if (lote.length < data.length) {
    console.warn(`[webhook] descarté ${data.length - lote.length} mensaje(s) mal formados del lote`);
  }
  return { lote };
}

// La hora del último mensaje que llegó por el webhook y se mandó a procesar, para /salud.
let ultimoMensaje = null;
// La hora del último mensaje que ENTRÓ: el último que no es `fromMe` (de clientes, de
// grupos, estados). Es el reloj del guardián (Pendientes 2, punto 6). `ultimoMensaje`
// se mueve también con los propios, y el ⚠️ del guardián vuelve por el webhook como
// mensaje propio en el grupo: rearmaba el control 2, y en una tarde tranquila salía el
// ⚠️ y enseguida el ✅. Un mensaje del bot o de una persona de la cuenta no lo mueve.
let ultimoEntrante = null;
// Cuántos mensajes repetidos se descartaron desde que arrancó, para /salud.
let duplicadosDescartados = 0;

/**
 * Mensajes repetidos por id (auditoría del 15/09/2026, A6 — bloque 4). Evolution
 * puede entregar dos veces el mismo `messages.upsert`; antes se procesaba dos
 * veces (dos entradas en el historial, dos respuestas). Se reconoce por
 * `remoteJid` + `key.id`, para todo mensaje del lote, también los `fromMe` (un eco
 * duplicado de una persona de la cuenta también duplicaría el historial). Se
 * marca como visto ACÁ, antes de procesar: si el proceso se cae a mitad, ese
 * mensaje no se reintenta, que es preferible a contestar dos veces. Sin `key.id`
 * se procesa como siempre. Los vistos viven en el estado (`state.marcarVisto`).
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
  // Un repetido no cuenta como mensaje nuevo: no mueve ultimoMensaje ni ultimoEntrante.
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
// Cada evento del registro de aprendizaje lleva este commit (bloque 6).
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

/**
 * Lo que muestra /salud, sin datos de clientes ni el secreto. Panel Chiara (06/10/2026): lo mismo va
 * en `bot_estado.salud` cada 1 minuto (src/panel-chiara.js).
 */
async function datosDeSalud() {
  const estado = await evolution.estadoInstancia().catch(() => ({ state: 'error' }));
  let lista = 'no leída';
  try {
    lista = (await sheets.leerTodo()).config.estadoLista;
  } catch (e) {
    // El detalle va a la consola: puede traer rutas del disco.
    console.error('[salud] no pude leer la planilla:', e.message);
    lista = 'error al leer la planilla';
  }
  return {
    whatsapp: estado.state,
    lista,
    // #bateria (01/10/2026): de qué pestaña salen los usados ("LISTA" o "LISTA 85-93").
    listaBateria: bateria.activa(),
    // Cerebro Sonnet (01/10/2026): el modo y el gasto de hoy, en memoria (un reinicio lo pone en 0).
    // Bloque Ninjo 2: `reglas` (el hash de cerebro-reglas.md) y `gastoMes` (en estado.json).
    cerebro: cerebro.resumenSalud(),
    // Bloque Ninjo 2 (06/10/2026): lo que de verdad corre, sin datos de clientes.
    config: configParaSalud(),
    // Sombra con persona (03/10/2026): si está prendida, hasta qué día, y lo de hoy (en memoria).
    sombraPersona: sombraPersona.resumen(),
    modo: modoEfectivo(),
    numerosTester: config.numerosTester.length,
    numerosPiloto: config.pilotoTodos ? 'todos' : config.numerosPiloto.length,
    soloChatsNuevos: config.soloChatsNuevos,
    // La lista de chats viejos: lo mismo que dice el log al arrancar (chats-viejos.js).
    chatsViejos: chatsViejos.resumen(),
    modoBorrador: config.modoBorrador,
    webhookConSecreto: Boolean(config.webhook.secreto),
    // Solo cantidades: escalados que nadie tomó todavía y chats pausados.
    ...control.contar(),
    version: VERSION,
    ultimoMensaje,
    // El último que no es propio: el que mira el guardián para su control 2.
    ultimoEntrante,
    duplicadosDescartados,
    // Guardián de Evolution: lo último que leyó de la instancia en su barrido (null
    // si todavía no hubo ninguno; `whatsapp`, arriba, es una consulta de ahora) y si
    // hay un corte detectado sin resolver.
    estadoInstancia: guardian.estado().estadoInstancia,
    guardianAvisoActivo: guardian.estado().avisoActivo,
    // Bloque Ninjo 2: los avisos al grupo que no salieron desde que arrancó (bloqueados o con error),
    // y el último, con la hora y el motivo corto.
    avisosGrupo: evolution.avisosGrupo(),
    // Panel Chiara (06/10/2026): el interruptor general y la última subida al panel.
    chiara: interruptor.resumen(),
    panel: panel.resumen(),
    // El stock de la app en la planilla (08/10/2026): el modo, la última vuelta, el último error, qué
    // pestaña escribe y las órdenes de STOCK aplicadas.
    stockApp: stockApp.resumen(),
  };
}

/** Sin datos de clientes ni el secreto: /salud no pide credenciales. */
app.get('/salud', async (_req, res) => {
  res.json({ ok: true, ...(await datosDeSalud()) });
});

/**
 * Para /salud (bloque Ninjo 2, revisión de Ninjo del 05/10/2026, punto 3.3): con qué config corren el
 * seguimiento, el barrido del silencio y el resumen, sin leer el .env. La sombra con persona ya dice
 * hasta qué día en `sombraPersona.hasta`.
 */
function configParaSalud() {
  const s = config.seguimiento;
  return {
    seguimiento: { activo: s.activo, franja: `${s.franjaDesde}-${s.franjaHasta}`, horasPrimero: s.horas1, segundoHasta: s.mananaHasta, maxPorBarrido: s.maxPorBarrido },
    silencio: { minutosTrasPersona: config.silencioTrasHumanoMin, maxHoras: config.silencio.maxHoras, maxPorBarrido: config.silencio.maxPorBarrido },
    resumen: { activo: config.resumen.activo, hora: config.resumen.hora },
  };
}

/**
 * Si el estado estaba dañado al arrancar (ver state.apartarDanado), se avisa UNA
 * vez al grupo interno: que estaba dañado, dónde quedó la copia y que el bot
 * arrancó sin memoria. Si el archivo no existía, es un arranque normal y no hay
 * nada que avisar.
 */
let avisoEstadoDanadoHecho = false;
async function avisarEstadoDanado() {
  const info = state.estadoDanado();
  if (!info || avisoEstadoDanadoHecho) return;
  avisoEstadoDanadoHecho = true;
  const texto =
    `⚠️ El archivo de estado del bot estaba dañado (${path.basename(state.ARCHIVO)}: ${info.error}).\n` +
    (info.copia ? `Quedó una copia tal cual en ${info.copia}\n` : 'No pude guardar una copia.\n') +
    'El bot arrancó sin memoria de los chats: modelos, entregas y marcas de "ya se dijo" empiezan de cero.';
  try {
    await evolution.avisarGrupo(texto);
  } catch (e) {
    console.error('[estado] no pude avisar al grupo que el estado estaba dañado:', e.message);
  }
}

// Errores de Express (JSON roto, cuerpo demasiado grande): el código y nada más.
// El manejador por defecto devolvía el stack con rutas del disco.
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  if (err.type === 'entity.too.large') console.warn('[webhook] cuerpo demasiado grande: 413 y no se procesa');
  else if (err.type === 'entity.parse.failed') console.warn('[webhook] JSON mal formado: 400 y no se procesa');
  else console.error('[http] error:', err.message);
  if (res.headersSent) return;
  const status = Number(err.status || err.statusCode);
  res.sendStatus(status >= 400 && status < 600 ? status : 500);
});

/** Lo que dura el "escribiendo…" antes del seguimiento: lo que antes era el `delay` del envío. */
const ESCRIBIENDO_SEGUIMIENTO_MS = 1500;

/**
 * Los dos seguimientos (bloque Ninjo 1b, decisión de Tomás del 05/10/2026). Los de antes ("Che,
 * quedaste con la duda del…" y, sin modelo, "Contame si te puedo ayudar con algun modelito") se fueron.
 */
const TEXTOS_SEGUIMIENTO = {
  1: 'contame como te quedan los numeros!',
  2: 'como viste los celus? cual te dio mas interes',
};

/** Después del precio dijo que lo piensa o que no le interesa: no hay seguimiento. */
const NO_SEGUIR =
  /\blo pienso\b|\blo voy a pensar\b|\bno me interesa\b|\bno me escribas\b|\bno,? gracias\b|\bya compre\b|\bya consegui\b/;

/** El último escalado fue por postventa (la marca más segura es `resultado`, que se mira antes). */
const ESCALADO_POSTVENTA = /postventa|ya (?:lo |nos )?compr|garant|la cuota|pagando (?:las )?cuotas/;

const HORA_Y_DIA_ARGENTINA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  hourCycle: 'h23',
});

/** { dia: 'AAAA-MM-DD', hora } en Argentina, nunca la hora de la PC. */
function enArgentina(ts) {
  const p = Object.fromEntries(HORA_Y_DIA_ARGENTINA.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dos = (v) => String(v).padStart(2, '0');
  return { dia: `${p.year}-${dos(p.month)}-${dos(p.day)}`, hora: Number(p.hour) % 24 };
}

/** El día siguiente a 'AAAA-MM-DD'. */
function diaSiguiente(dia) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/**
 * Qué seguimiento le toca a este chat ahora: { n: 1 | 2 } o { motivo } (por qué no). Se mira dos
 * veces con el estado de ese momento: al elegir el chat y, de nuevo, después del "escribiendo…",
 * justo antes de mandar (ver revisarSeguimientos). Bloque Ninjo 1b (decisión de Tomás del 05/10/2026):
 *   - lo último del chat es una tanda del bot (Sonnet o el de siempre) con un precio de contado o una
 *     cotización, que le llegó (`ultimoPrecioBot`, lo pone atenderTanda; `ultimoEnvioCliente`);
 *   - el cliente no contestó después, y ninguna persona de la cuenta escribió después de esa tanda
 *     (lo que pasa una persona lo sigue esa persona; antes alcanzaba con que hubiera escrito alguna vez);
 *   - ni escalado, ni pausado, ni callado, ni con #vendido o #perdido, ni postventa (el último escalado
 *     fue por postventa), ni si después del precio dijo "lo pienso", "no me interesa", "ya compré"...;
 *   - el 1º, SEGUIMIENTO_HORAS_1 (3) después del precio o más y dentro de la franja de Argentina
 *     (SEGUIMIENTO_FRANJA_DESDE a _HASTA, 10 a 21): si las 3 horas caen fuera, sale cuando abre la
 *     siguiente; nunca con un precio de más de SEGUIMIENTO_MAX_HORAS (24);
 *   - el 2º, el día siguiente al primero, entre la apertura de la franja y SEGUIMIENTO_MANANA_HASTA (12),
 *     si sigue sin contestar. No hay 3º. La cuenta va con el precio: uno nuevo la arranca de cero.
 */
function seguimientoQueToca(chatId, s, ahora) {
  if (!s) return { motivo: 'el chat ya no está' };
  if (s.pausado) return { motivo: 'el chat está pausado' };
  if (s.escalado || control.callado(s)) return { motivo: 'el chat está escalado' };
  // Marcado con #vendido o #perdido: ya se sabe cómo terminó. Se saltea siempre, aunque haya vuelto a escribir.
  if (s.resultado) return { motivo: 'está marcado como vendido o perdido' };
  if (ESCALADO_POSTVENTA.test(promesas.sinTildes(s.escaladoMotivo || ''))) return { motivo: 'el último escalado fue por postventa' };
  // Una tanda de ese chat esperando, interpretándose o mandándose: ya se le está contestando.
  if (enProceso.has(chatId) || (pendientes.get(chatId) || []).length) return { motivo: 'hay una tanda en curso' };
  const precio = Number(s.ultimoPrecioBot) || 0;
  if (!precio) return { motivo: 'el bot no le pasó un precio' };
  // La tanda con el precio le llegó (anotarEnvio mueve ultimoEnvioCliente con cada envío confirmado).
  if (!(Number(s.ultimoEnvioCliente) >= precio - 10 * 60 * 1000)) return { motivo: 'lo del bot no le llegó al cliente' };
  const historial = s.historial || [];
  // Una foto sin epígrafe ("[foto]", 07/10/2026) no es una respuesta: el seguimiento sale como antes de anotarla.
  if (historial.some((l) => l.quien === 'cliente' && !esFotoDelCliente(l) && Number(l.ts) > precio)) return { motivo: 'el cliente contestó' };
  if ((Number(s.ultimoHumano) || 0) > precio || historial.some((l) => l.humano && Number(l.ts) > precio)) {
    return { motivo: 'escribió alguien de la cuenta después del precio' };
  }
  // "Después del precio": desde la primera línea del bot con un monto de las 72 horas antes del último.
  const desde = historial.find(
    (l) => l.quien === 'vendedor' && !l.humano && Number(l.ts) >= precio - 72 * 60 * 60 * 1000 && cerebro.montosEn(l.texto).length
  );
  const inicio = desde ? Number(desde.ts) : precio;
  if (historial.some((l) => l.quien === 'cliente' && Number(l.ts) >= inicio && NO_SEGUIR.test(promesas.sinTildes(l.texto)))) {
    return { motivo: 'después del precio dijo que lo piensa o que no le interesa' };
  }
  const hechos = s.seguimiento && s.seguimiento.de === precio ? s.seguimiento : { n: 0 };
  if (hechos.n >= 2) return { motivo: 'ya salieron los dos' };
  const ar = enArgentina(ahora);
  const { horas1, maxHoras, franjaDesde, franjaHasta, mananaHasta } = config.seguimiento;
  if (!hechos.n) {
    if (ahora - precio < horas1 * 60 * 60 * 1000) return { motivo: `todavía no pasaron ${horas1} h del precio` };
    if (ahora - precio > maxHoras * 60 * 60 * 1000) return { motivo: 'el precio es de hace demasiado' };
    if (ar.hora < franjaDesde || ar.hora >= franjaHasta) return { motivo: 'fuera de la franja' };
    return { n: 1 };
  }
  if (ar.dia !== diaSiguiente(enArgentina(hechos.ts).dia)) return { motivo: 'el 2º sale el día siguiente al 1º' };
  if (ar.hora < franjaDesde || ar.hora >= mananaHasta) return { motivo: 'fuera de la mañana del 2º' };
  return { n: 2 };
}

/**
 * Seguimiento: si el cliente dejó de contestar después de un precio o una cotización, se le escribe
 * hasta dos veces (bloque Ninjo 1b; ver `seguimientoQueToca`). La hora es la de Argentina, nunca la de
 * la PC.
 *
 * Pasa por la misma guardia que las respuestas (Pendientes 2, decisión de Tomás del 21/09/2026):
 * "escribiendo…", la espera local, RECIÉN AHÍ el control con el estado leído de nuevo (y la generación:
 * un #reset en el medio no lo deja salir), y el envío con delay 0. Se marca ANTES de mandar (cuál salió
 * y a qué hora): si Evolution da error, ya cuenta y no se repite. Queda en el registro de aprendizaje
 * (evento `seguimiento`, con el número). Como mucho SEGUIMIENTO_MAX_POR_BARRIDO por barrido; nunca en
 * escucha ni en borrador, ni fuera de las listas de prueba. `escribiendoMs` y `reloj` los cambian las
 * pruebas.
 */
async function revisarSeguimientos({ escribiendoMs = ESCRIBIENDO_SEGUIMIENTO_MS, reloj = () => Date.now() } = {}) {
  if (!config.seguimiento.activo || config.modoBorrador || config.modoEscucha) return;
  // Panel Chiara: apagada no escribe a nadie.
  if (!interruptor.prendida()) return;

  // Tope real de envíos por barrido. Sin esto, un día con muchos chats dispara una ráfaga de
  // mensajes iguales y el número queda marcado. Un seguimiento que se cortó no salió: no cuenta.
  let enviadosEnEsteBarrido = 0;

  for (const chatId of Object.keys(state.todos())) {
    if (enviadosEnEsteBarrido >= config.seguimiento.maxPorBarrido) break;
    // El seguimiento es un camino a cliente con su propio loop: necesita su propio filtro. Un contacto
    // personal tampoco, aunque su estado sea de antes de sumarlo a la lista (06/10/2026).
    if (!evolution.esDestinoDePrueba(chatId) || evolution.esContactoPersonal(chatId)) continue;
    // Se lee ahora y no al empezar el barrido: cada seguimiento espera su "escribiendo…", y mientras
    // tanto los chats que siguen pueden cambiar.
    const toca = seguimientoQueToca(chatId, state.todos()[chatId], reloj());
    if (!toca.n) continue;
    const texto = TEXTOS_SEGUIMIENTO[toca.n];

    try {
      // El barrido corre fuera de una tanda, así que la generación del chat se compara a mano. Con
      // `state.todos()` y no `obtener`: después de un #reset, `obtener` volvería a crear el chat vacío.
      const generacion = state.generacion(chatId);
      await evolution.mostrarEscribiendo(chatId, escribiendoMs);
      await dormir(escribiendoMs);
      const otra =
        state.generacion(chatId) !== generacion ? { motivo: 'hubo un #reset' } : seguimientoQueToca(chatId, state.todos()[chatId], reloj());
      if (otra.n !== toca.n) {
        console.log(`[seguimiento] ${chatId}: no sale, ${otra.motivo || 'cambió cuál le toca'}`);
        continue;
      }
      // Se marca antes de mandar: si Evolution falla, ya cuenta y no se repite.
      const de = state.todos()[chatId].ultimoPrecioBot;
      state.actualizar(chatId, { seguimiento: { de, n: toca.n, ts: reloj() } });
      enviadosEnEsteBarrido++;
      let r = null;
      try {
        r = await enviarAlCliente(chatId, 'texto', texto, () => evolution.enviarTexto(chatId, texto, 0), null, { origen: 'seguimiento' });
      } finally {
        aprendizaje.anotar('seguimiento', chatId, { n: toca.n, texto, salio: autoria.llego(r) });
      }
      // Un #reset con el envío en vuelo: el mensaje ya salió (y cuenta para el tope), pero el chat
      // quedó limpio y no se le escribe nada (`anotarEnvio` también lo volvería a crear).
      if (state.generacion(chatId) !== generacion) {
        console.log(`[seguimiento] ${chatId}: salió, pero hubo un #reset en el medio y no lo anoto`);
        continue;
      }
      anotarEnvio(chatId, r);
      state.actualizar(chatId, { ultimoBot: reloj() });
      state.agregarAlHistorial(chatId, 'vendedor', texto, autoria.llego(r) ? { id: r.key.id } : { sinConfirmar: true });
      console.log(`[seguimiento] ${toca.n}º enviado a ${chatId}`);
    } catch (e) {
      if (e instanceof state.ChatReiniciado) continue;
      console.error('[seguimiento] falló:', e.message);
    }
  }
}

setInterval(() => revisarSeguimientos().catch(() => {}), 5 * 60 * 1000);

// `esCierre` (bloque Ninjo 1b) vive en src/cierre.js desde el panel Chiara (06/10/2026): lo usa también
// src/panel-chiara.js para saber si un cliente espera respuesta. Se movió tal cual.
const { esCierre } = require('./cierre');

/**
 * Las líneas del cliente seguidas al final del historial (desde la última que no es suya): lo que dejó
 * escrito y nadie le contestó. [] si lo último no es del cliente. Las usan el barrido del silencio y #sigue.
 */
function ultimasDelCliente(h) {
  let i = h.length;
  while (i > 0 && h[i - 1].quien === 'cliente') i--;
  return h.slice(i);
}

/**
 * ¿La línea del cliente trae algo escrito? Una foto sin epígrafe ("[foto]", 07/10/2026) y un audio que no se
 * entendió (o que todavía no se transcribió, "[audio]") no.
 */
function conTextoDeVerdad(l) {
  const t = String(l.texto || '').trim();
  return Boolean(t) && !esFotoDelCliente(l) && !/^\[audio( que no se entendio)?\]$/i.test(t);
}

/** El motivo de `porQueNoSeContesta` con una tanda en curso: para #sigue, esa tanda ya le está contestando. */
const TANDA_EN_CURSO = 'ya hay una tanda en curso';

/**
 * Por qué no se le contesta ahora lo que quedó sin respuesta en un chat (el barrido del silencio y #sigue), o
 * null: un contacto personal (se ignora entero, también si su estado quedó de antes de sumarlo a la lista:
 * prueba del 1b, 06/10/2026, el barrido tomó a …5984 y avisó al grupo con su charla), un chat que no atiende
 * Sonnet, uno fuera de las listas de prueba o uno con una tanda en curso. Chiara apagada, escucha y borrador
 * los mira cada uno (el barrido, una vez por vuelta).
 */
function porQueNoSeContesta(chatId) {
  if (evolution.esContactoPersonal(chatId)) return 'es un contacto personal';
  if (cerebro.quienAtiende(chatId) !== 'sonnet') return 'lo atiende el bot de siempre';
  if (!evolution.esDestinoDePrueba(chatId)) return porQueNoLeLlega();
  if (enProceso.has(chatId) || (pendientes.get(chatId) || []).length) return TANDA_EN_CURSO;
  return null;
}

/**
 * Cuando vence el silencio de una persona (bloque Ninjo 1b, decisión de Tomás del 05/10/2026). Si un
 * cliente escribe dentro de los SILENCIO_TRAS_HUMANO_MIN en que habló una persona, su línea entra al
 * historial pero no a una tanda; cuando el silencio vence, nadie le contestaba (…7024: 68 horas sin
 * respuesta, con una venta caliente). Devuelve las líneas del cliente que esperan, o null. Le toca a un
 * chat si:
 *   - tiene `ultimoHumano` y ya pasaron SILENCIO_TRAS_HUMANO_MIN minutos;
 *   - lo último del historial es del cliente, de después de `ultimoHumano` y de la última línea de la
 *     cuenta (nadie le contestó), y la primera de esas líneas llegó mientras atendía la persona (las
 *     que llegaron después ya tuvieron su tanda);
 *   - esa última línea tiene menos de SILENCIO_MAX_HORAS (72);
 *   - no está escalado, callado ni pausado, y `porQueNoSeContesta` (lo mismo que mira #sigue): no es un
 *     contacto personal (CONTACTOS_PERSONALES), no tiene una tanda en curso, lo atiende Sonnet y le llega
 *     (las listas de prueba);
 *   - no se atendió antes (`silencioAtendido`, la hora de esa última línea).
 * Los audios que no se entendieron no van. Las fotos sin epígrafe ("[foto]", desde el 07/10/2026) no
 * cuentan para nada: el barrido las ve como si no estuvieran (una foto sola no lo dispara, y una foto
 * después del texto no cambia cuál es la última línea, la que queda en `silencioAtendido`).
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
  // Solo acuses o agradecimientos ("Okiss dale", "Noo, gracias a vos"): la charla la cerró la persona.
  if (!conTexto.length || conTexto.every((l) => esCierre(l.texto))) return null;
  return conTexto;
}

/**
 * Pone a contestar líneas del cliente que quedaron sin respuesta (el barrido del silencio y, desde el
 * 07/10/2026, #sigue): marca el chat como atendido hasta la última (`silencioAtendido`) y las deja en la
 * cola con `humanoAtendiendo` en false y su `origen` ('silencio' o 'sigue') para el registro. La tanda la
 * arranca quien llama (atenderChat): la espera, Sonnet con el historial completado, la guardia y el envío.
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
 * El barrido del silencio (cada 1 minuto): hasta SILENCIO_MAX_POR_BARRIDO chats (3), así no sale una
 * ráfaga cuando el bot arranca. A cada uno se lo marca (`silencioAtendido`) ANTES de arrancar y sus
 * líneas van al camino de una tanda normal (atenderChat: la espera, Sonnet con el historial completado,
 * la guardia, el envío), con `humanoAtendiendo` en false y `origen: 'silencio'` en el registro. Lo
 * decide Sonnet: contesta, o escala si sigue un trato de la persona. Si Sonnet no puede (error de la
 * API), el bot de siempre no contesta: al grupo le llega "💬 SIN CONTESTAR" (contestarConSonnet y
 * atenderTanda). Nunca en escucha ni en borrador. Devuelve los chats que tomó, cuando terminan.
 */
async function revisarSilencios({ ahora = Date.now() } = {}) {
  if (config.modoEscucha || config.modoBorrador) return [];
  // Panel Chiara: apagada no contesta. No marca nada: al prenderla, el barrido sigue como siempre.
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
 * #sigue contesta lo que quedó sin respuesta (decisión de Tomás del 07/10/2026; …0247, Deli: Tomás puso
 * #sigue desde el grupo y el bot esperaba a que el cliente volviera a escribir). Lo que dejó escrito: sus
 * líneas seguidas al final del historial con texto (`ultimasDelCliente`, `conTextoDeVerdad`). Se le
 * contesta si:
 *   - Chiara está prendida, y ni en escucha ni en borrador;
 *   - `porQueNoSeContesta` (lo mismo que el barrido): no es un contacto personal, lo atiende Sonnet, le
 *     llega y no hay una tanda en curso. En un chat del bot de siempre, #sigue solo reactiva, como antes;
 *   - lo último del historial es del cliente (no de una persona de la cuenta ni del bot);
 *   - dejó texto (una "[foto]" o un audio que no se entendió no cuentan), con la última línea con texto de
 *     menos de SILENCIO_MAX_HORAS (72), y no son todos acuses o agradecimientos (`esCierre`, como el barrido).
 * Lee el chat ya reactivado. Devuelve { lineas } o { motivo }: corto, para el aviso al grupo.
 */
function sinContestarAlSeguir(chatId, ahora = Date.now()) {
  if (!interruptor.prendida()) return { motivo: 'Chiara está apagada' };
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
 * Lo que hace cada #sigue (el del chat y el del grupo, con `control.desdeGrupo`) después de reactivar: si
 * toca (`sinContestarAlSeguir`), las líneas van a la cola por el camino del barrido (`encolarSinContestar`,
 * origen 'sigue') y quien llama arranca la tanda (atenderChat) sin otro `await` en el medio. Sonnet decide:
 * contesta, o escala si sigue un trato de una persona. Devuelve { contesta: true } o { contesta: false,
 * motivo } (lo dice el aviso); con una tanda en curso, también `enCurso` (esa tanda ya le está contestando).
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

/**
 * Resumen de la mañana. Sale UNA vez por día, al grupo interno.
 *
 * OJO: en MODO_ESCUCHA **no** sale. `avisarGrupo` corta en
 * `motivoBloqueoAvisos`, cuya primera condición es justamente el modo escucha.
 * (Antes acá decía lo contrario; dejó de ser cierto cuando se endureció
 * `avisarGrupo` y el comentario quedó viejo.)
 *
 * Tres cosas que no son obvias:
 *  - No pregunta "¿son las 9?" sino "¿ya pasaron las 9 y todavía no salió?".
 *    Así, si la PC estuvo apagada a esa hora, el resumen sale en el primer
 *    ciclo después de arrancar en vez de perderse el día.
 *  - El día que ya salió se guarda en estado.json, no en memoria: un reinicio
 *    entre las 9 y las 10 no lo manda de nuevo.
 *  - El día se marca DESPUÉS de que el envío salió bien. Si falla o vuelve
 *    bloqueado, se reintenta en el ciclo siguiente.
 */
let bloqueoAvisado = '';
async function revisarResumen() {
  if (!config.resumen.activo) return;

  const ahora = new Date();
  const hoy = ahora.toDateString();
  if (!resumen.toca(ahora, config.resumen.hora, state.resumenEnviadoDe())) return;

  // Si el canal está tapado no se arma nada y se reintenta en el próximo ciclo,
  // pero el motivo se loguea una sola vez por día: si no, con un tick cada 5
  // minutos son casi 200 líneas iguales por día.
  const bloqueo = evolution.motivoBloqueoAvisos();
  if (bloqueo) {
    if (bloqueoAvisado !== hoy + bloqueo) {
      bloqueoAvisado = hoy + bloqueo;
      console.log(`[resumen] no lo mando: ${bloqueo}. Reintento en el proximo ciclo.`);
    }
    return;
  }

  try {
    // `deHoy` devuelve UNA o VARIAS partes: el resumen no se recorta, se parte.
    // Se manda todo o no se marca el día: si una parte falla, mañana no queremos
    // creer que salió completo.
    const partes = resumen.deHoy(config.resumen.diasFrio);
    let r = null;
    for (const parte of partes) {
      r = await evolution.avisarGrupo(parte);
      if (!r || r.bloqueado) break;
    }
    // `avisarGrupo` no tira excepción cuando frena: devuelve {bloqueado, motivo},
    // o undefined si cortó por destino sospechoso. Solo se marca el día si salió.
    if (r && !r.bloqueado) {
      state.marcarResumenEnviado(hoy);
      console.log(`[resumen] enviado al grupo en ${partes.length} mensaje(s)`);
    } else {
      console.error(
        `[resumen] no salio${r && r.motivo ? ': ' + r.motivo : ''}. Reintento en el proximo ciclo.`
      );
    }
  } catch (e) {
    console.error('[resumen] no pude mandarlo:', e.message, '· reintento en el proximo ciclo.');
  }
}

setInterval(() => revisarResumen().catch(() => {}), 5 * 60 * 1000);

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
  const r = await evolution.avisarGrupo(resultado.aviso);
  if (r && r.bloqueado) {
    console.log(`[recordatorio] queda guardado, pero la confirmacion no salio: ${r.motivo}`);
  }
}

/** `#vendido` / `#perdido` en el chat de un cliente: guarda y confirma al grupo. */
async function atenderVenta(chatId, cmd, origen) {
  await confirmarVenta(ventas.marcar(chatId, cmd.tipo, origen));
}

/** Confirma al grupo un #pausa / #sigue escrito en el grupo con el número. */
async function confirmarControl({ chatId, tipo, cambio, aviso }) {
  if (chatId) console.log(`[control] ${chatId}: #${tipo} desde el grupo${cambio ? '' : ' (no cambió nada)'}`);
  if (!aviso) return;
  const r = await evolution.avisarGrupo(aviso);
  if (r && r.bloqueado) console.log(`[control] la confirmacion no salio: ${r.motivo}`);
}

/** Contesta en el grupo un #bateria: qué lista quedó, o por qué no cambió nada. */
async function confirmarBateria(aviso) {
  console.log(`[bateria] #bateria desde el grupo: usados con ${bateria.activa()}`);
  const r = await evolution.avisarGrupo(aviso);
  if (r && r.bloqueado) console.log(`[bateria] la confirmacion no salio: ${r.motivo}`);
}

/** Contesta en el grupo un #apagar / #prender, y deja la noticia para el panel si cambió. */
async function confirmarInterruptor({ tipo, cambio, aviso }) {
  console.log(`[interruptor] #${tipo} desde el grupo${cambio ? '' : ' (no cambió nada)'}`);
  if (cambio) panel.interruptorDesdeGrupo(tipo === 'prender');
  const r = await evolution.avisarGrupo(aviso);
  if (r && r.bloqueado) console.log(`[interruptor] la confirmacion no salio: ${r.motivo}`);
}

/** Contesta en el grupo un #sonnet, #comparar, #bot o #sonnet-si. */
async function confirmarComandoSonnet({ tipo }, aviso) {
  console.log(`[sonnet] #${tipo} desde el grupo`);
  const r = await evolution.avisarGrupo(aviso);
  if (r && r.bloqueado) console.log(`[sonnet] la respuesta de #${tipo} no salió: ${r.motivo}`);
}

/** Confirma al grupo lo que pasó con un #vendido / #perdido, venga del chat o del grupo. */
async function confirmarVenta({ chatId, tipo, cambio, aviso }) {
  if (cambio) console.log(`[ventas] ${chatId} anotado como ${tipo}`);
  if (!aviso) return;
  const r = await evolution.avisarGrupo(aviso);
  if (r && r.bloqueado) {
    console.log(`[ventas] ${cambio ? 'queda guardado, pero ' : ''}la confirmacion no salio: ${r.motivo}`);
  }
}

/**
 * Recordatorios manuales. Mismo ciclo de 5 minutos que el resumen y la misma
 * idea: el timer no mide el tiempo, lo mide estado.json. Cada vuelta pregunta
 * "¿ya empezó una hora en punto nueva desde el último aviso?", así sale a
 * horario, un reinicio no lo repite y una PC apagada no junta avisos.
 *
 * Todos los que tocan salen en UN mensaje, y se cuentan DESPUÉS de que salió:
 * si falla o vuelve bloqueado, se reintenta en la vuelta siguiente sin gastar
 * repeticiones.
 */
let bloqueoRecordatoriosAvisado = '';
async function revisarRecordatorios(ahora = new Date()) {
  recordatorios.purgar(ahora);
  const lista = recordatorios.pendientes(ahora);
  if (!lista.length) return;

  // Mismo criterio que el resumen: el motivo se loguea una vez por día.
  const bloqueo = evolution.motivoBloqueoAvisos();
  if (bloqueo) {
    const hoy = ahora.toDateString();
    if (bloqueoRecordatoriosAvisado !== hoy + bloqueo) {
      bloqueoRecordatoriosAvisado = hoy + bloqueo;
      console.log(
        `[recordatorios] ${lista.length} sin mandar: ${bloqueo}. Quedan guardados y reintento en el proximo ciclo.`
      );
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
      console.error(
        `[recordatorios] no salieron${r && r.motivo ? ': ' + r.motivo : ''}. Reintento en el proximo ciclo.`
      );
    }
  } catch (e) {
    console.error('[recordatorios] no pude mandarlos:', e.message, '· reintento en el proximo ciclo.');
  }
}

setInterval(() => revisarRecordatorios().catch(() => {}), 5 * 60 * 1000);

/**
 * Recordatorio de los escalados sin tomar (control.js): uno por escalado, cuando el
 * cliente escribió algo después y nadie de la cuenta lo tomó en
 * ESCALADO_RECORDATORIO_MIN. Se da por recordado recién si el aviso salió.
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
 * Guardián de Evolution (guardian.js): cada GUARDIAN_MIN minutos mira si la instancia
 * sigue en `open` y si siguen llegando mensajes por el webhook, y avisa al grupo una
 * vez por corte. El reloj es `ultimoEntrante`, el de /salud: solo los mensajes que
 * entran, no los propios (el eco del ⚠️ rearmaba el control 2). Reemplazó a la alerta
 * de desconexión que vivía acá.
 *
 * Cada corte que abre o cierra se lo cuenta a chats viejos (29/09/2026): al abrir, frena
 * `alDia` en la última señal buena; al cerrar, se pone al día con Evolution hasta ahora.
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
  if (config.modoEscucha) {
    console.log('MODO ESCUCHA: no manda ningun mensaje, solo aprende de como contestan ustedes');
  } else if (config.modoBorrador) {
    console.log('MODO BORRADOR: no le escribe a los clientes, manda los borradores al grupo');
  } else {
    console.log('EN VIVO: le esta respondiendo a los clientes de verdad');
  }
  // Bien visible: una lista de prueba olvidada deja al bot mudo con los
  // clientes reales, y desde afuera parece que anda.
  if (config.contactosPersonales.length) {
    const n = config.contactosPersonales.length;
    console.log(
      `CONTACTOS PERSONALES: ${n} numero${n === 1 ? '' : 's'} en la lista negra, se ignoran por completo.`
    );
  }
  const testers = config.numerosTester.length;
  const pilotos = config.numerosPiloto.length;
  if (config.pilotoTodos) {
    console.log('');
    console.log('  ' + '='.repeat(58));
    console.log(`  EN VIVO PARA TODOS (NUMEROS_PILOTO=todos). Tester: ${testers} numero${testers === 1 ? '' : 's'}.`);
    console.log('  ' + '='.repeat(58));
    console.log('');
  } else if (testers || pilotos) {
    const cuantos = (n) => `${n} numero${n === 1 ? '' : 's'}`;
    console.log('');
    console.log('  ' + '='.repeat(58));
    console.log(`  LISTAS DE PRUEBA ACTIVAS: solo escribe al tester (${cuantos(testers)}) y al piloto (${cuantos(pilotos)}).`);
    console.log('  A cualquier otro lo trata como MODO_BORRADOR.');
    console.log('  Vaciar NUMEROS_TESTER y NUMEROS_PILOTO en el .env para volver a lo normal.');
    console.log('  ' + '='.repeat(58));
    console.log('');
  }
  // El nombre viejo de la lista del tester sigue andando, pero conviene pasarlo.
  if (config.numerosPruebaViejo) {
    console.log('  NUMEROS_PRUEBA quedó viejo, pasalo a NUMEROS_TESTER (por ahora se lee como tester).');
    console.log('');
  }
  // El webhook ordena mandar mensajes por el número del negocio.
  if (!config.webhook.secreto) {
    console.log('');
    console.log('  WEBHOOK SIN SECRETO: cualquiera que llegue a este puerto puede hacerse pasar');
    console.log('  por Evolution y hacer hablar al bot por el WhatsApp del negocio.');
    console.log('  Poné WEBHOOK_SECRETO en el .env y la misma URL en Evolution (ver README).');
    console.log('');
  }
  // Con la franja vacía los recordatorios se anotan y nunca suenan: mejor
  // decirlo al arrancar que descubrirlo esperando un aviso.
  if (!(config.recordatorio.hora < config.seguimiento.horaHasta)) {
    console.log(
      `RECORDATORIOS: RECORDATORIO_HORA=${config.recordatorio.hora} no es menor que ` +
        `SEGUIMIENTO_HORA_HASTA=${config.seguimiento.horaHasta}. No van a sonar nunca.`
    );
  }
}

// Solo escucha cuando se lo corre de verdad. Si lo requiere una prueba, se
// usan `procesar` y `revisarSeguimientos` sin levantar el puerto.
/**
 * Levanta el servidor. Con HOST escucha solo en esa dirección (por ejemplo
 * 127.0.0.1); sin HOST, en todas las interfaces, como siempre: no está probado que
 * Evolution, desde Docker en Windows, llegue al bot por 127.0.0.1.
 */
function escuchar(puerto = config.puerto, host = config.host, alEscuchar) {
  return host ? app.listen(puerto, host, alEscuchar) : app.listen(puerto, alEscuchar);
}

/**
 * Chats viejos (29/09/2026): la puesta al día con Evolution, desde `alDia` hasta `escucha` (el
 * momento en que el bot empezó a escuchar el puerto). Corre solo cuando el bot arranca de
 * verdad, abajo: requerir este archivo (pruebas, evaluar) no toca Evolution. Nunca tira.
 * `extra` es para las pruebas (relojes, tamaño de página).
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
  // Bloque Ninjo 2: si estado.json no tiene el gasto de Sonnet del mes en curso, se arma una vez con el
  // registro de aprendizaje de ese mes (se lee solo si hace falta). Antes de escuchar: ningún mensaje llega antes.
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
    // Bloque Ninjo 2: con qué versión de cerebro-reglas.md va a contestar Sonnet (CAMBIOS-CEREBRO.md).
    console.log(cerebro.lineaDeReglas());
    avisarEstadoDanado();
    // Espejo del Cotizador (02/10/2026): copia LISTA y LISTA 85-93 a la app, a los 45 s y cada 30 min.
    if (espejoCotizador.arrancar()) console.log('COTIZADOR: copio LISTA y LISTA 85-93 a la app cada 30 minutos');
    // Panel Chiara (06/10/2026): estado, leads, días y noticias a la app cada 1 minuto, y las órdenes.
    arrancarPanel();
    // El stock de la app en la planilla (08/10/2026): la vista a USADOS (o USADOS APP en sombra) y las
    // órdenes de STOCK cada 1 minuto. Apagado por defecto (STOCK_APP_MODO).
    if (stockApp.arrancar()) {
      const r = stockApp.resumen();
      console.log(`STOCK DE LA APP: ${r.modo} · escribo ${r.pestana} y aplico las órdenes de STOCK cada 1 minuto${r.modo === 'vivo' ? ' · Chiara: local primero y el depósito con STOCK' : ' · Chiara contesta como siempre'}`);
    }
  });
}

/**
 * Panel Chiara (06/10/2026): arranca el módulo que reporta a la app de ventas (src/panel-chiara.js). Solo
 * cuando el bot corre de verdad; las pruebas lo llaman con sus propias dependencias.
 */
function arrancarPanel(extra = {}) {
  const ok = panel.arrancar({
    salud: datosDeSalud,
    modo: modoEfectivo,
    version: () => VERSION,
    ultimoEntrante: () => ultimoEntrante,
    avisarGrupo: (texto) => evolution.avisarGrupo(texto),
    // "Devolver" del panel = #sigue desde el grupo (08/10/2026): reactiva y le contesta lo que dejó escrito.
    alSeguir,
    atenderChat,
    ...extra,
  });
  if (ok) console.log(`PANEL CHIARA: reporto a la app cada 1 minuto · Chiara ${interruptor.prendida() ? 'prendida' : 'APAGADA desde el panel'}`);
  return ok;
}

module.exports = {
  app,
  escuchar,
  arrancarPanel,
  datosDeSalud,
  reiniciarTopeWebhook,
  procesar,
  revisarSeguimientos,
  revisarSilencios,
  revisarResumen,
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
};
