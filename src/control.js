'use strict';
/**
 * Control humano que funciona solo (auditoría del 15/09/2026, bloque 2, A3).
 *
 * Decidido con Tomás: no quiere estar encima del bot escribiendo comandos.
 *
 *  - Un chat ESCALADO queda callado: el bot no le manda nada más al cliente, y lo
 *    que el cliente escriba entra al historial sin contestarse ni avisar cada vez.
 *  - Un solo recordatorio al grupo por escalado: si el cliente escribió algo
 *    después de escalar y nadie de la cuenta lo tomó en ESCALADO_RECORDATORIO_MIN.
 *    Sin mensajes nuevos no hay recordatorio: el aviso del escalado ya salió. De
 *    noche no suena: usa la franja de los recordatorios manuales y, si se cumple
 *    fuera de ella, sale en la primera vuelta de la mañana (Pendientes 2).
 *  - Vuelve solo, de dos formas: alguien de la cuenta escribe en el chat (queda
 *    resuelto y el bot vuelve cuando pasa el silencio de siempre), o el cliente
 *    escribe pasadas ESCALADO_REANUDAR_HORAS sin que nadie lo haya tomado (se
 *    atiende como consulta nueva).
 *  - #pausa y #sigue también desde el grupo interno, con el número: el cliente no
 *    ve el comando. #sigue (desde donde sea) limpia la pausa, el escalado y el
 *    silencio por una persona. Desde el 07/10/2026 (decisión de Tomás) además le
 *    contesta lo que dejó escrito, si corresponde: lo decide index.js (`alSeguir`), y
 *    el aviso de `desdeGrupo` dice si le contesta o por qué no.
 *
 * Marcas del chat: `escalado`, `escaladoEn`, `escaladoMotivo`, `escaladoRecordado` y
 * `escaladoResuelto` ({ ts, porque }). En Piedra no hay planilla de leads (poda de
 * iPhone, 19/10/2026): el lead queda solo en el aviso al grupo.
 */
const config = require('./config');
const state = require('./state');
const evolution = require('./evolution');
const ventas = require('./ventas');
const { quien, horario, enHorario } = require('./recordatorios');
const { esTelefono } = require('./avisos-texto');
const { esFotoDelCliente } = require('./texto-del-mensaje');

const MIN = 60 * 1000;
const HORA = 60 * MIN;

/**
 * Deja el chat escalado desde ahora, con su motivo.
 *
 * `calla: false` (un audio que no se entendió): avisan al grupo pero el bot sigue
 * atendiendo lo que el cliente escriba después. Los de antes de esta marca callan.
 */
function escalar(chatId, motivo, { calla = true, ahora = Date.now() } = {}) {
  state.actualizar(chatId, {
    escalado: true,
    escaladoEn: ahora,
    escaladoMotivo: motivo,
    escaladoCalla: calla,
    escaladoRecordado: null,
  });
}

/**
 * ¿Un escalado nuevo tiene que quedar anotado? Sí si el chat no está escalado, o si el
 * escalado que hay no calla (uno de "no entendí") y el nuevo sí.
 *
 * Decisión de Tomás del 22/09/2026 (opción A): un escalado de "no entendí" sin tomar
 * tapaba a los que venían después dentro de las 72 h. Después de "asdasd" + "qwrtyp",
 * un "quiero sacar un turno" o una cotización en dólares no avisaba con el 🔔, no
 * callaba el chat y no anotaba su fila. Ahora el que calla le gana. Uno que no calla
 * no pisa a nadie: un tercer mensaje raro no vuelve a escalar.
 */
function escalaEncima(s, calla = true) {
  if (!s || !s.escalado) return true;
  return calla !== false && !callado(s);
}

/** ¿El chat está callado por un escalado? */
function callado(s) {
  return Boolean(s && s.escalado && s.escaladoCalla !== false);
}

/**
 * Vuelta 2: pasaron ESCALADO_REANUDAR_HORAS sin que nadie lo tome y el cliente
 * vuelve a escribir. Se atiende como consulta nueva, así que se borran las marcas de
 * "esto ya se dijo" de la charla vieja (decidido con Tomás el 15/09/2026). Se
 * conserva lo que dijo el cliente, el historial y `resultado` (#vendido / #perdido).
 */
const RESET_DE_LA_CHARLA = {
  acuseContestado: null,
  ultimoAvisoSilencio: null,
};

function limpiarParaConsultaNueva(chatId) {
  state.actualizar(chatId, { ...RESET_DE_LA_CHARLA });
}

/**
 * Datos viejos por tiempo (Pendientes 1, B3, decisión de Tomás del 18/09/2026): para
 * cualquier chat, si la última actividad es más vieja que DATOS_VIEJOS_HORAS, el próximo
 * mensaje se atiende como consulta nueva (index.js, antes de contestar): lo de
 * `RESET_DE_LA_CHARLA` y además esto. No se toca `nombre`, el `historial`, `resultado`,
 * `botEnvio` ni los recordatorios.
 */
const DATOS_QUE_CADUCAN = {
  // El saludo de la charla vieja: a las 72 h ya es otro día.
  saludoEn: null,
  // Lo último que contestó Sonnet en la charla vieja.
  ultimaRespuestaSonnet: null,
};

/**
 * Devuelve si además había un escalado abierto, que queda resuelto. Un escalado que
 * no calla nunca vence (`vencido` solo se mira en los callados): si nadie lo tomaba
 * quedaba `escalado` para siempre, y la consulta nueva no podía escalar ni callar.
 */
function limpiarDatosViejos(chatId) {
  const habiaEscalado = resolver(chatId, `datos viejos: más de ${config.datosViejosHoras} h sin actividad`);
  state.actualizar(chatId, { ...RESET_DE_LA_CHARLA, ...DATOS_QUE_CADUCAN });
  return habiaEscalado;
}

/**
 * La última actividad del chat: el `ts` más nuevo del historial, de cualquiera de los
 * dos lados; si no hay historial, el de la última lectura (`ultimaLectura.ts`, de los
 * estados de antes). 0 si no hay nada con fecha.
 *
 * Una foto sin epígrafe ("[foto]", que index.js anota en el historial) no cuenta: una
 * foto suelta que nadie contesta no tiene que salvar de los datos viejos al texto que
 * llega después.
 */
function ultimaActividad(s) {
  if (!s) return 0;
  const delHistorial = (s.historial || []).reduce((max, l) => (esFotoDelCliente(l) ? max : Math.max(max, Number(l && l.ts) || 0)), 0);
  if (delHistorial) return delHistorial;
  return Number(s.ultimaLectura && s.ultimaLectura.ts) || 0;
}

/**
 * Cuántas horas (redondeadas) pasaron desde `ultima` si son más que
 * DATOS_VIEJOS_HORAS; 0 si es reciente o si no hay actividad con fecha.
 */
function horasViejas(ultima, ahora = Date.now()) {
  if (!ultima) return 0;
  const horas = (ahora - ultima) / HORA;
  return horas > config.datosViejosHoras ? Math.round(horas) : 0;
}

/** Limpia el escalado. Devuelve si había algo que limpiar. */
function resolver(chatId, porque, ahora = Date.now()) {
  const s = state.obtener(chatId);
  if (!s.escalado) return false;
  state.actualizar(chatId, { escalado: false, escaladoResuelto: { ts: ahora, porque } });
  return true;
}

/**
 * ¿Pasaron ESCALADO_REANUDAR_HORAS sin que nadie lo tome? Un escalado sin fecha
 * (de antes de que se guardara) cuenta como vencido: antes no callaba al bot.
 */
function vencido(s, ahora = Date.now()) {
  if (!s || !s.escalado) return false;
  return !s.escaladoEn || ahora - s.escaladoEn > config.escalado.reanudarHoras * 60 * MIN;
}

/** Lo que el cliente escribió después de escalar (lo que queda en el historial). */
function mensajesDespues(s) {
  if (!s || !s.escaladoEn) return [];
  return (s.historial || []).filter((l) => l.quien === 'cliente' && l.ts > s.escaladoEn);
}

/**
 * Los escalados que tienen que recordarse ahora: [chatId, estado].
 *
 * De noche no suena (Pendientes 2, decisión de Tomás del 21/09/2026): usa la misma
 * franja que los recordatorios manuales, de RECORDATORIO_HORA hasta antes de
 * SEGUIMIENTO_HORA_HASTA. Antes, un cliente que escribía a las 23:00 en un chat
 * escalado hacía sonar el ⏰ a las 23:30. Fuera de la franja no se descarta nada:
 * `escaladoRecordado` se pone recién cuando el aviso salió, así que sale en la
 * primera vuelta dentro de la franja, una sola vez. El aviso del escalado en sí (el
 * primero, cuando escala) no pasa por acá: sigue saliendo en el momento.
 */
function paraRecordar(ahora = Date.now()) {
  if (!enHorario(new Date(ahora), horario())) return [];
  return Object.entries(state.todos()).filter(
    ([chatId, s]) =>
      s &&
      callado(s) && // los de "no entendí" no callan el chat: el bot los sigue atendiendo
      s.escaladoEn &&
      !s.escaladoRecordado &&
      !s.pausado &&
      !s.resultado && // #vendido / #perdido cerraron el chat
      !chatId.endsWith('@g.us') &&
      !evolution.esContactoPersonal(chatId) &&
      ahora - s.escaladoEn >= config.escalado.recordatorioMin * MIN &&
      mensajesDespues(s).length > 0
  );
}

/** El recordatorio al grupo de un escalado sin tomar. */
function recordatorio(chatId, s, ahora = Date.now()) {
  const nuevos = mensajesDespues(s);
  const minutos = Math.round((ahora - s.escaladoEn) / MIN);
  const hace = minutos < 90 ? `hace ${minutos} min` : `hace ${Math.round(minutos / 60)} h`;
  const lineas = [
    `⏰ ESCALADO SIN TOMAR — ${quien(chatId, s)} — escaló ${hace}`,
    `Motivo: ${s.escaladoMotivo || 'sin motivo anotado'}`,
    `Escribió ${nuevos.length === 1 ? 'esto' : `${nuevos.length} mensajes`} después y el bot no le contestó:`,
  ];
  if (nuevos.length > 5) lineas.push(`(los últimos 5 de ${nuevos.length})`);
  lineas.push(...nuevos.slice(-5).map((l) => `• "${String(l.texto).slice(0, 150)}"`));
  lineas.push(
    esTelefono(chatId) ? `Chat: https://wa.me/${chatId.split('@')[0]}` : `⚠️ sin link: el chat no tiene número (${chatId})`
  );
  lineas.push('Cuando alguien de la cuenta le escriba, queda tomado. Para que el bot vuelva ya: #sigue <número>');
  return lineas.join('\n');
}

/** Solo cantidades, para /salud: sin datos de clientes. */
function contar(todos = state.todos()) {
  let escaladosSinTomar = 0;
  let pausados = 0;
  for (const [chatId, s] of Object.entries(todos)) {
    if (!s || chatId.endsWith('@g.us')) continue;
    if (s.escalado === true) escaladosSinTomar++;
    if (s.pausado === true) pausados++;
  }
  return { escaladosSinTomar, pausados };
}

/**
 * ¿#pausa o #sigue? Como los demás comandos, solo si el mensaje EMPIEZA con
 * él: los avisos del bot vuelven por el webhook y los nombran en el medio. `numero` son
 * los dígitos que vengan después ('' si no hay); solo se usa desde el grupo.
 */
function comando(texto) {
  const m = String(texto || '').trim().match(/^#(pausa|sigue)(?![\p{L}\p{N}_])([\s\S]*)$/iu);
  return m ? { tipo: m[1].toLowerCase(), numero: m[2].replace(/\D/g, '') } : null;
}

function pausar(chatId) {
  state.actualizar(chatId, { pausado: true });
}

/** #sigue: el bot vuelve ya. Limpia la pausa, el escalado y el silencio por una persona. */
function reanudar(chatId, ahora = Date.now()) {
  resolver(chatId, '#sigue', ahora);
  state.actualizar(chatId, { pausado: false, ultimoHumano: 0 });
}

const COMO_SE_USA =
  'En el chat del cliente: #pausa o #sigue\n' +
  'En el grupo, con su número: #pausa 5492990000000 o #sigue 5492990000000 (sirve pegar el wa.me de un aviso)';

/**
 * #pausa / #sigue escritos en el grupo interno, con el número. Busca el chat con la
 * misma comparación que #vendido / #perdido; sin un único chat que coincida, contesta
 * por qué y no toca nada.
 *
 * #sigue que contesta (decisión de Tomás del 07/10/2026): con `alSeguir` (lo pasa index.js), ya
 * reactivado el chat, `alSeguir(chatId, ahora)` decide si le contesta lo que dejó escrito y lo deja en
 * la cola ({ contesta: true }) o por qué no ({ contesta: false, motivo }). El aviso lo dice ("… y le
 * contesto lo que dejó escrito" / "…; le contesto cuando vuelva a escribir (motivo)"; con una tanda en
 * curso, `enCurso`: "… y ya le estoy contestando lo que escribió") y `contesta` le avisa a index.js que
 * arranque la tanda. Sin `alSeguir`, como antes.
 *
 * @returns {{chatId:string|null, tipo:string, cambio:boolean, aviso:string|null, contesta?:boolean}}
 */
function desdeGrupo({ tipo, numero }, ahora = Date.now(), { alSeguir = null } = {}) {
  const nada = (aviso) => ({ chatId: null, tipo, cambio: false, aviso });
  const comoSeUsa = COMO_SE_USA;
  const noToque = 'No toqué nada.';
  if (!numero) {
    return nada(`❓ Desde el grupo, #${tipo} va con el número del cliente, así sé qué chat es. ${noToque}\n\n${comoSeUsa}`);
  }
  const elegido = ventas.elegirChatDesdeGrupo({
    comando: `#${tipo}`,
    numero,
    nada: noToque,
    verbo: { pausa: 'pausar', sigue: 'reactivar' }[tipo],
    comoSeUsa,
  });
  if (!elegido.chatId) return nada(elegido.aviso);

  const chatId = elegido.chatId;
  const s = { ...state.obtener(chatId) };
  const link = `💬 https://wa.me/${chatId.split('@')[0]}`;
  if (tipo === 'pausa') {
    if (s.pausado) return { chatId, tipo, cambio: false, aviso: `⏸️ ${quien(chatId, s)} ya estaba pausado, no cambié nada\n${link}` };
    pausar(chatId);
    return { chatId, tipo, cambio: true, aviso: `⏸️ Pausado · ${quien(chatId, s)} — el bot no le contesta hasta #sigue\n${link}` };
  }
  const saque = [
    s.pausado ? 'la pausa' : '',
    s.escalado ? 'el escalado' : '',
    ahora - (s.ultimoHumano || 0) < config.silencioTrasHumanoMin * MIN ? 'el silencio por una persona' : '',
  ].filter(Boolean);
  reanudar(chatId, ahora);
  const detalle = saque.length ? ` (saqué ${saque.join(', ')})` : ' (no estaba pausado ni escalado)';
  const c = alSeguir ? alSeguir(chatId, ahora) : null;
  const contesta = !c
    ? ''
    : c.contesta
    ? ' y le contesto lo que dejó escrito'
    : c.enCurso
    ? ' y ya le estoy contestando lo que escribió'
    : `; le contesto cuando vuelva a escribir (${c.motivo})`;
  return {
    chatId,
    tipo,
    cambio: saque.length > 0,
    contesta: Boolean(c && c.contesta),
    aviso: `▶️ Reactivado · ${quien(chatId, s)} — el bot vuelve a contestarle${detalle}${contesta}\n${link}`,
  };
}

module.exports = {
  escalaEncima,
  escalar,
  callado,
  limpiarParaConsultaNueva,
  limpiarDatosViejos,
  ultimaActividad,
  horasViejas,
  resolver,
  vencido,
  mensajesDespues,
  paraRecordar,
  recordatorio,
  contar,
  comando,
  pausar,
  reanudar,
  desdeGrupo,
};
