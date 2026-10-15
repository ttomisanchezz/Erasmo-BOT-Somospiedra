'use strict';
/**
 * Guardián de Evolution: avisa al grupo interno cuando dejan de llegar los mensajes.
 *
 * Tres cortes en tres días (17 al 19/09/2026) con el mismo cuadro: el bot vivo y
 * escribiendo el estado, pero sin recibir nada de Evolution; en uno, Evolution tiró
 * PrismaClientUnknownRequestError. Se destrababa reiniciando el contenedor y nadie
 * se enteraba en el momento. Decisión de Tomás (21/09/2026): el guardián AVISA. No
 * reinicia nada.
 *
 * Un barrido cada GUARDIAN_MIN minutos (lo arranca index.js), con dos controles y
 * como mucho un aviso por corte:
 *
 *  1. La instancia. Si Evolution no dice `open` (o directamente no responde), avisa
 *     una vez. No vuelve a avisar hasta que vuelva a `open`, y ahí manda un solo
 *     "✅ Evolution volvió", con el estado del corte y cuánto duró.
 *  2. El webhook. La instancia dice `open` pero no ENTRÓ ningún mensaje en
 *     GUARDIAN_SIN_MENSAJES_MIN minutos. Cuentan los que entran (de clientes, de
 *     grupos, estados), no los propios: el ⚠️ vuelve por el webhook como mensaje
 *     propio en el grupo y, si contara, rearmaría este control con su propio eco
 *     (Pendientes 2). Solo se mira dentro de la franja del
 *     seguimiento (SEGUIMIENTO_HORA_DESDE a SEGUIMIENTO_HORA_HASTA), y el silencio se
 *     cuenta desde que abrió la franja de hoy: de madrugada no llegan mensajes y eso
 *     no es una falla. Se rearma cuando vuelve a llegar algo, con un "✅ Volvieron a
 *     llegar mensajes".
 *
 * Reemplaza a la alerta de desconexión que vivía en index.js ("hay que reescanear
 * el QR"): era el control 1 sin recuperación, y juntas avisaban dos veces.
 *
 * OJO, límite conocido: el aviso viaja por la misma Evolution que está fallando.
 * Con la instancia cerrada o caída lo más probable es que el ⚠️ no pueda salir; el
 * que llega es el ✅ de cuando vuelve, que cuenta qué pasó y cuánto duró. El control
 * 2 (la instancia anda, el webhook no) es el que sí avisa en el momento.
 *
 * Todo vive en memoria: un reinicio del bot en medio de un corte lo vuelve a avisar.
 *
 * Chats viejos (29/09/2026): cada vez que abre o cierra un corte, se lo cuenta a quien lo
 * haya pedido en `revisar` (`alAbrirCorte`, `alCerrarCorte`; el cableado a chats-viejos.js
 * está en index.js), con desde cuándo no hay que confiar en lo que llegó: en el control 1,
 * el último barrido que leyó `open` (si no hubo ninguno, el arranque); en el control 2, la
 * hora del último mensaje que entró, la misma del corte. Los avisos al grupo no cambian.
 */
const config = require('./config');
const evolution = require('./evolution');

const MIN = 60 * 1000;

// Un aviso que no pudo salir se reintenta en el barrido siguiente, como el resto de
// los avisos del bot, pero con tope: con Prisma roto Evolution puede mandar el
// mensaje y contestar con error, y sin tope llegaría el mismo aviso cada 5 minutos.
const MAX_INTENTOS = 3;

// Lo último que se leyó de la instancia, para /salud: open / connecting / close,
// 'sin respuesta' si no se pudo consultar, o null si todavía no hubo un barrido.
let ultimaLectura = null;
// El corte de cada control, o null si está sano. Es lo que garantiza un aviso por corte.
let corteInstancia = null; // { estado, desde }
let corteWebhook = null; // { desde }: la hora del último mensaje que entró antes del silencio
// Cuándo volvió la instancia de su último corte: el silencio del webhook se cuenta
// desde ahí, para que el control 2 no avise pegado a la recuperación.
let instanciaVolvio = 0;
// El último barrido que leyó `open`: la última señal buena de la instancia (chats viejos).
let ultimoOpen = 0;
// Avisos por salir: { clave, texto, intentos }.
let porSalir = [];
let barriendo = false;

const dosDigitos = (n) => String(n).padStart(2, '0');

/** "40 min", "2 h", "1 h 10 min". */
function duracion(ms) {
  const minutos = Math.round(ms / MIN);
  if (minutos < 1) return 'menos de 1 min';
  if (minutos < 60) return `${minutos} min`;
  const resto = minutos % 60;
  return `${Math.floor(minutos / 60)} h${resto ? ` ${resto} min` : ''}`;
}

/** "13:10", o "23:30 del 20/09" si no es de hoy. */
function horaDe(ts, ahora) {
  const d = new Date(ts);
  const hora = `${dosDigitos(d.getHours())}:${dosDigitos(d.getMinutes())}`;
  if (d.toDateString() === new Date(ahora).toDateString()) return hora;
  return `${hora} del ${dosDigitos(d.getDate())}/${dosDigitos(d.getMonth() + 1)}`;
}

function enFranja(ahora) {
  const hora = new Date(ahora).getHours();
  return hora >= config.seguimiento.horaDesde && hora < config.seguimiento.horaHasta;
}

/**
 * Cuándo abrió la franja de hoy. El silencio del webhook se cuenta desde ahí: con el
 * último mensaje a las 23:30, a las 9:10 van 10 minutos, no diez horas. Tampoco se
 * arrastra el silencio del final de la tarde de ayer: cada mañana tiene su plazo
 * entero, para no avisar de más. Con la franja de 0 a 24 no hay madrugada que saltear.
 */
function aperturaDeLaFranja(ahora) {
  const { horaDesde, horaHasta } = config.seguimiento;
  if (horaDesde <= 0 && horaHasta >= 24) return 0;
  return new Date(ahora).setHours(horaDesde, 0, 0, 0);
}

function encolar(clave, texto) {
  porSalir.push({ clave, texto, intentos: 0 });
}

/** El corte terminó: su ⚠️, si todavía no había salido, ya no sirve. */
function descartar(clave) {
  porSalir = porSalir.filter((p) => p.clave !== clave);
}

/**
 * Manda lo que haya por salir, por la vía de todos los avisos (`avisarGrupo`) y con
 * sus guardas de siempre: en modo escucha o sin destino no sale nada, y no se
 * reintenta (el corte queda en el log y en /salud).
 */
async function despachar() {
  if (!porSalir.length) return;
  const bloqueo = evolution.motivoBloqueoAvisos();
  if (bloqueo) {
    for (const p of porSalir) console.log(`[guardian] no aviso al grupo (${bloqueo}): ${p.texto}`);
    porSalir = [];
    return;
  }
  for (const p of [...porSalir]) {
    p.intentos++;
    let r;
    try {
      r = await evolution.avisarGrupo(p.texto);
    } catch (e) {
      r = { bloqueado: true, motivo: e.message };
    }
    // Mismo criterio que el resumen y los recordatorios: salió si no volvió bloqueado.
    const salio = r && !r.bloqueado;
    if (salio || p.intentos >= MAX_INTENTOS) porSalir = porSalir.filter((x) => x !== p);
    if (salio) continue;
    if (p.intentos >= MAX_INTENTOS) {
      console.error(`[guardian] el aviso no salió en ${MAX_INTENTOS} intentos, no insisto: ${p.texto}`);
    } else {
      console.error(
        `[guardian] el aviso no salió${r && r.motivo ? ` (${r.motivo})` : ''}, reintento en el próximo barrido (${p.intentos}/${MAX_INTENTOS})`
      );
    }
  }
}

/**
 * Le cuenta a chats viejos que abrió o cerró un corte. Nunca tira: si el gancho falla, queda
 * en el log y el barrido sigue con sus avisos como siempre.
 */
function contar(gancho, corte) {
  try {
    gancho(corte);
  } catch (e) {
    console.error('[guardian] no pude avisarle del corte a chats viejos:', e.message);
  }
}

/** Control 1. Devuelve si la instancia está en `open`. */
function controlarInstancia(lectura, ahora, arranque, ganchos) {
  if (lectura.estado === 'open') {
    if (corteInstancia) {
      const texto = `✅ Evolution volvió (${corteInstancia.estado}, ${duracion(ahora - corteInstancia.desde)})`;
      console.log(`[guardian] ${texto}`);
      descartar('instancia');
      encolar('instancia-volvio', texto);
      corteInstancia = null;
      instanciaVolvio = ahora;
      contar(ganchos.alCerrarCorte, { control: 'instancia' });
    }
    ultimoOpen = ahora;
    return true;
  }
  // De close a connecting (o a no responder) sigue siendo el mismo corte.
  if (!corteInstancia) {
    corteInstancia = { estado: lectura.estado || 'sin respuesta', desde: ahora };
    const texto = lectura.estado
      ? `⚠️ Evolution: la instancia dice ${lectura.estado}. No están llegando mensajes.`
      : `⚠️ Evolution: no responde (${lectura.motivo}). No están llegando mensajes.`;
    console.error(`[guardian] ${texto}`);
    encolar('instancia', texto);
    contar(ganchos.alAbrirCorte, { control: 'instancia', estado: corteInstancia.estado, desde: ultimoOpen || arranque || null });
  }
  return false;
}

/** Control 2, con la instancia en `open`. */
function controlarWebhook(ahora, ultimoEntrante, arranque, ganchos) {
  if (corteWebhook) {
    // Se rearma cuando vuelve a entrar algo, a cualquier hora.
    if (!ultimoEntrante || ultimoEntrante <= corteWebhook.desde) return;
    const texto = `✅ Volvieron a llegar mensajes (estuvo ${duracion(ultimoEntrante - corteWebhook.desde)} sin llegar nada)`;
    console.log(`[guardian] ${texto}`);
    descartar('webhook');
    encolar('webhook-volvio', texto);
    corteWebhook = null;
    contar(ganchos.alCerrarCorte, { control: 'webhook' });
  }
  if (!enFranja(ahora)) return;
  // La última señal de vida del webhook: el último mensaje que entró o, si no entró
  // ninguno desde que arrancó el bot, el arranque.
  const ultimo = Math.max(ultimoEntrante || 0, arranque || 0);
  if (!ultimo) return; // sin ninguna de las dos no hay desde cuándo medir
  const silencio = ahora - Math.max(ultimo, instanciaVolvio, aperturaDeLaFranja(ahora));
  if (silencio <= config.guardian.sinMensajesMin * MIN) return;
  corteWebhook = { desde: ultimo };
  const texto =
    `⚠️ Evolution dice open pero no llega ningún mensaje desde las ${horaDe(ultimo, ahora)}` +
    (ultimoEntrante ? '.' : ' (la hora en que arrancó el bot).');
  console.error(`[guardian] ${texto}`);
  encolar('webhook', texto);
  contar(ganchos.alAbrirCorte, { control: 'webhook', desde: ultimo });
}

/**
 * Un barrido. `ultimoEntrante` es la hora (ms) del último mensaje que ENTRÓ por el
 * webhook (el último que no es `fromMe`), el mismo `ultimoEntrante` de /salud, o null
 * si no entró ninguno desde `arranque`. Nunca tira: si Evolution no contesta, eso
 * también es un corte. `alAbrirCorte({ control, estado?, desde })` y
 * `alCerrarCorte({ control })`, si vienen, se llaman al abrir y al cerrar cada corte
 * (`control`: 'instancia' o 'webhook'); son para chats viejos.
 */
async function revisar({
  ahora = Date.now(),
  ultimoEntrante = null,
  arranque = 0,
  alAbrirCorte = () => {},
  alCerrarCorte = () => {},
} = {}) {
  if (!config.guardian.activo || barriendo) return;
  barriendo = true;
  try {
    let lectura;
    try {
      lectura = await evolution.estadoDeLaInstancia();
    } catch (e) {
      console.error('[guardian] no pude leer el estado de la instancia:', e.message);
      lectura = { estado: null, motivo: e.message };
    }
    ultimaLectura = lectura.estado || 'sin respuesta';
    const ganchos = { alAbrirCorte, alCerrarCorte };
    if (controlarInstancia(lectura, ahora, arranque, ganchos)) controlarWebhook(ahora, ultimoEntrante, arranque, ganchos);
    await despachar();
  } catch (e) {
    console.error('[guardian] falló el barrido:', e.message);
  } finally {
    barriendo = false;
  }
}

/** Para /salud: lo último que se leyó de la instancia y si hay un corte sin resolver. */
function estado() {
  return { estadoInstancia: ultimaLectura, avisoActivo: Boolean(corteInstancia || corteWebhook) };
}

/** Solo para las pruebas: lo deja como recién arrancado. */
function reiniciar() {
  ultimaLectura = null;
  corteInstancia = null;
  corteWebhook = null;
  instanciaVolvio = 0;
  ultimoOpen = 0;
  porSalir = [];
  barriendo = false;
}

module.exports = { revisar, estado, reiniciar, duracion };
