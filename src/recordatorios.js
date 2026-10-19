'use strict';
/**
 * Recordatorios manuales al grupo interno.
 *
 * En el chat del cliente, desde la cuenta del negocio:
 *   #recordar <texto>   anota qué hay que hacer con ese cliente
 *   #hecho              deja de recordarlo
 *
 * Uno por chat. `#hecho` se escribe en el chat, así que lo que se cierra es el
 * chat entero; un segundo `#recordar` en el mismo chat suma otra línea y la
 * cuenta de avisos vuelve a cero.
 *
 * Cuándo suena: una vez por hora en punto, desde RECORDATORIO_HORA hasta antes
 * de SEGUIMIENTO_HORA_HASTA. El arranque es propio porque esto va al grupo
 * interno y no a un cliente; el cierre es el del seguimiento para que nunca
 * suene de noche.
 *
 * Todos los que tocan en la misma hora salen JUNTOS, en un solo mensaje: uno
 * por recordatorio llena el grupo de notificaciones hasta que se ignoran, y son
 * más envíos desde un número que corre en Baileys.
 *
 * Tope: después de RECORDATORIO_MAX_REPETICIONES avisos sin `#hecho`, a la hora
 * siguiente sale un único "dejo de recordar" y queda vencido.
 */
const config = require('./config');
const state = require('./state');
const evolution = require('./evolution');
const { partir, esTelefono, LARGO_MENSAJE } = require('./avisos-texto');

const DIA_MS = 24 * 60 * 60 * 1000;
const BARRA = '━'.repeat(20);

/** Cuántos días queda guardado un vencido antes de borrarse solo. */
const DIAS_VENCIDO = 7;

/**
 * ¿El texto es un comando de recordatorio?
 *
 * Solo cuenta si el mensaje EMPIEZA con el comando. No es un detalle: todo lo
 * que el bot manda al grupo vuelve por el webhook como mensaje propio, y esos
 * avisos llevan "#hecho" y "#recordar" en el medio del texto.
 *
 * @returns {{tipo:'recordar', texto:string} | {tipo:'hecho'} | null}
 */
function comando(texto) {
  const t = String(texto || '').trim();
  const rec = t.match(/^#recordar(?![\p{L}\p{N}_])[\s:,.-]*([\s\S]*)$/iu);
  if (rec) return { tipo: 'recordar', texto: rec[1].replace(/\s+/g, ' ').trim() };
  if (/^#hecho(?![\p{L}\p{N}_])/iu.test(t)) return { tipo: 'hecho' };
  return null;
}

/** La franja en la que pueden sonar, leída de la configuración. */
function horario() {
  return { horaDesde: config.recordatorio.hora, horaHasta: config.seguimiento.horaHasta };
}

function inicioDeHora(ts) {
  const d = new Date(ts);
  d.setMinutes(0, 0, 0);
  return d.getTime();
}

function enHorario(fecha, { horaDesde, horaHasta }) {
  const h = fecha.getHours();
  return h >= horaDesde && h < horaHasta;
}

/**
 * ¿Este recordatorio tiene que sonar ahora?
 *
 * Igual que el resumen, la pregunta no es "¿pasó una hora?" sino "¿ya empezó
 * una hora en punto posterior a cuando se anotó y al último aviso?". Así sale a
 * las 9:0x, 10:0x, 11:0x sin correrse, un reinicio no lo repite en la misma
 * hora, y si la PC estuvo apagada sale UNO al volver, no los que se perdieron.
 */
function toca(r, ahora, cfg) {
  if (!r || r.estado !== 'activo') return false;
  if (!enHorario(ahora, cfg)) return false;
  const franja = inicioDeHora(ahora.getTime());
  return franja > inicioDeHora(r.creado) && franja > inicioDeHora(r.ultimoEnvio || 0);
}

/**
 * Cuándo sale el próximo aviso, para decirlo al anotarlo. Devuelve null si la
 * franja está vacía (RECORDATORIO_HORA no es menor que HASTA): mejor avisarlo
 * que prometer una hora que nunca llega.
 */
function proximoAviso(r, ahora, cfg) {
  if (!(cfg.horaDesde < cfg.horaHasta)) return null;
  const t = new Date(Math.max(inicioDeHora(r.creado), inicioDeHora(r.ultimoEnvio || 0)));
  t.setHours(t.getHours() + 1);
  const actual = inicioDeHora(ahora.getTime());
  if (t.getTime() < actual) t.setTime(actual);
  for (let i = 0; i < 48; i++) {
    if (enHorario(t, cfg)) return t;
    t.setHours(t.getHours() + 1);
  }
  return null;
}

/** "hoy 16:00", "mañana 8:00". */
function cuando(fecha, ahora) {
  const hora = `${fecha.getHours()}:00`;
  if (fecha.toDateString() === ahora.toDateString()) return `hoy ${hora}`;
  const manana = new Date(ahora.getFullYear(), ahora.getMonth(), ahora.getDate() + 1);
  if (fecha.toDateString() === manana.toDateString()) return `mañana ${hora}`;
  return `${fecha.toLocaleDateString('es-AR', { weekday: 'long' })} ${hora}`;
}

function haceCuanto(ts, ahora) {
  const min = Math.max(0, Math.round((ahora.getTime() - ts) / 60000));
  if (min < 60) return `hace ${Math.max(1, min)} min`;
  const h = Math.round(min / 60);
  if (h < 24) return `hace ${h} h`;
  const d = Math.round(h / 24);
  return d === 1 ? 'hace 1 día' : `hace ${d} días`;
}

/**
 * El recordatorio que queda después de un `#recordar`.
 *
 * Devuelve null si ese mismo mensaje ya se había anotado: Evolution puede
 * mandar el mismo webhook dos veces y no queremos dos líneas iguales.
 *
 * @param {object|undefined} previo  el que ya había en ese chat
 * @param {string} origen            id del mensaje de WhatsApp
 * @param {number} ahora             ms
 */
function anotar(previo, texto, origen, ahora) {
  if (previo && origen && (previo.origenes || []).includes(origen)) return null;
  const sigue = previo && previo.estado === 'activo';
  const textos = sigue ? [...previo.textos] : [];
  if (!textos.includes(texto)) textos.push(texto);
  return {
    textos,
    creado: ahora,
    origenes: [...((previo && previo.origenes) || []), origen].filter(Boolean).slice(-10),
    envios: 0,
    ultimoEnvio: 0,
    estado: 'activo',
  };
}

function telefono(chatId) {
  return String(chatId).split('@')[0];
}

function quien(chatId, s) {
  const nombre = s.nombre || (esTelefono(chatId) ? telefono(chatId) : 'chat sin número');
  return s.modelo ? `${nombre} · ${s.modelo}` : nombre;
}

/** Nunca un wa.me con algo que no sea un teléfono: misma guardia que el resumen. */
function link(chatId) {
  return esTelefono(chatId)
    ? `💬 https://wa.me/${telefono(chatId)}`
    : `⚠️ sin link: el chat no tiene número (${chatId})`;
}

const lineas = (r) => r.textos.map((t) => `👉 ${t}`);

/**
 * El mensaje de la hora, con todos los que tocan. Devuelve un ARRAY: si no
 * entra en un mensaje de WhatsApp se parte en varios numerados, como el
 * resumen, sin perder ninguno.
 *
 * @param {{chatId:string, r:object, s:object}[]} lista  lo que devuelve pendientes()
 */
function armar(lista, ahora, max = config.recordatorio.maxRepeticiones) {
  const suenan = lista.filter(({ r }) => r.envios < max);
  const cortan = lista.filter(({ r }) => r.envios >= max);

  const bloques = [
    suenan.length === 0
      ? '⏰⏰⏰ RECORDATORIOS ⏰⏰⏰'
      : suenan.length === 1
        ? '⏰⏰⏰ RECORDATORIO PENDIENTE ⏰⏰⏰'
        : `⏰⏰⏰ ${suenan.length} RECORDATORIOS PENDIENTES ⏰⏰⏰`,
  ];
  for (const { chatId, r, s } of suenan) {
    bloques.push(BARRA);
    bloques.push(
      [
        `🔴 ${quien(chatId, s)}`,
        ...lineas(r),
        `Aviso ${r.envios + 1} de ${max} · anotado ${haceCuanto(r.creado, ahora)}`,
        link(chatId),
      ].join('\n')
    );
  }
  for (const { chatId, r, s } of cortan) {
    bloques.push(BARRA);
    bloques.push(
      [
        `🛑 DEJO DE RECORDAR · ${quien(chatId, s)}`,
        ...lineas(r),
        `${max} avisos sin #hecho. Si sigue pendiente, anotalo de nuevo con #recordar`,
        link(chatId),
      ].join('\n')
    );
  }
  bloques.push(BARRA);
  if (suenan.length) bloques.push('Cuando lo hagas: #hecho en el chat del cliente');

  const partes = partir(bloques, LARGO_MENSAJE);
  if (partes.length === 1) return partes;
  return partes.map((p, i) => `(${i + 1}/${partes.length})\n${p}`);
}

function confirmacionAnotado(chatId, r, s, ahora) {
  const cfg = horario();
  const proximo = proximoAviso(r, ahora, cfg);
  return [
    `📌 Anotado · ${quien(chatId, s)}`,
    ...lineas(r),
    proximo
      ? `Primer aviso: ${cuando(proximo, ahora)}`
      : `⚠️ No va a sonar: RECORDATORIO_HORA (${cfg.horaDesde}) no es menor que SEGUIMIENTO_HORA_HASTA (${cfg.horaHasta})`,
    link(chatId),
  ].join('\n');
}

function confirmacionHecho(chatId, r, s) {
  return [`✅ Hecho · ${quien(chatId, s)} — no lo recuerdo más`, ...lineas(r)].join('\n');
}

const COMO_SE_USA = 'En el chat del cliente:\n#recordar <qué hay que hacer>\n#hecho cuando lo hiciste';

/**
 * Lo que se contesta en el grupo cuando un comando no se puede atender. Nunca
 * se anota ni se cierra nada a ciegas, pero tampoco se calla: un `#hecho` que
 * no hace nada en silencio deja creyendo que se cerró.
 */
function ayuda(caso, chatId, s = {}) {
  if (caso === 'sin-texto') {
    return [
      `❓ #recordar sin texto en el chat de ${quien(chatId, s)}: no anoté nada.`,
      'Va con lo que hay que hacer, por ejemplo:',
      '#recordar mandarle la foto del azul',
      link(chatId),
    ].join('\n');
  }
  if (caso === 'hecho-en-grupo') {
    return `❓ #hecho va en el chat del cliente, así sé cuál cerrar. No cerré nada.\n\n${COMO_SE_USA}`;
  }
  return `❓ #recordar va en el chat del cliente, así sé de quién es. No anoté nada.\n\n${COMO_SE_USA}`;
}

/**
 * `#recordar` en un chat. Guarda y devuelve el aviso para el grupo.
 * @returns {{anotado: object|null, aviso: string|null}}
 */
function alRecordar(chatId, texto, origen, ahora = new Date()) {
  // `todos()` y no `obtener()`: un comando no tiene por qué crear un chat vacío.
  const s = state.todos()[chatId] || {};
  if (!texto) return { anotado: null, aviso: ayuda('sin-texto', chatId, s) };
  const r = anotar(state.recordatorios()[chatId], texto, origen, ahora.getTime());
  if (!r) return { anotado: null, aviso: null };
  state.guardarRecordatorio(chatId, r);
  return { anotado: r, aviso: confirmacionAnotado(chatId, r, s, ahora) };
}

/**
 * `#hecho` en un chat. Cierra el que haya, activo o vencido.
 * @returns {{cerrado: object|null, aviso: string|null}}
 */
function alHecho(chatId) {
  const r = state.recordatorios()[chatId];
  if (!r) return { cerrado: null, aviso: null };
  state.borrarRecordatorio(chatId);
  return { cerrado: r, aviso: confirmacionHecho(chatId, r, state.todos()[chatId] || {}) };
}

/** Los que tienen que sonar ahora, del más viejo al más nuevo. */
function pendientes(ahora = new Date()) {
  const chats = state.todos();
  const cfg = horario();
  return (
    Object.entries(state.recordatorios())
      // La lista negra de contactos personales manda también acá, como en el resumen.
      .filter(([chatId, r]) => !evolution.esContactoPersonal(chatId) && toca(r, ahora, cfg))
      .map(([chatId, r]) => ({ chatId, r, s: chats[chatId] || {} }))
      .sort((a, b) => a.r.creado - b.r.creado)
  );
}

/**
 * Cuenta el aviso que acaba de salir. Se llama DESPUÉS de mandarlo: un envío
 * fallido no gasta repeticiones. El que ya llegó al tope queda vencido.
 */
function marcarEnviados(lista, ahora = new Date(), max = config.recordatorio.maxRepeticiones) {
  const actuales = state.recordatorios();
  for (const { chatId, r } of lista) {
    // Si mientras salía el mensaje se cerró o se anotó otro, ese no se toca.
    if (actuales[chatId] !== r) continue;
    const cambios =
      r.envios >= max
        ? { estado: 'vencido', vencido: ahora.getTime() }
        : { envios: r.envios + 1, ultimoEnvio: ahora.getTime() };
    state.guardarRecordatorio(chatId, { ...r, ...cambios });
  }
}

/** Borra los vencidos hace más de DIAS_VENCIDO. Los activos no se tocan nunca. */
function purgar(ahora = new Date()) {
  let borrados = 0;
  for (const [chatId, r] of Object.entries(state.recordatorios())) {
    if (r.estado === 'vencido' && ahora.getTime() - (r.vencido || 0) > DIAS_VENCIDO * DIA_MS) {
      state.borrarRecordatorio(chatId);
      borrados++;
    }
  }
  return borrados;
}

module.exports = {
  comando,
  quien,
  horario,
  enHorario,
  toca,
  proximoAviso,
  cuando,
  anotar,
  armar,
  ayuda,
  alRecordar,
  alHecho,
  pendientes,
  marcarEnviados,
  purgar,
  DIAS_VENCIDO,
};
