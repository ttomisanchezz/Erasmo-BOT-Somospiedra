'use strict';
/**
 * Ventas y pérdidas, anotadas a mano.
 *
 * Desde la cuenta del negocio:
 *   #vendido / #perdido                  en el chat del cliente
 *   #vendido 5492990000000 (o #perdido)  en el grupo interno, con el número
 *
 * En el chat, mismo patrón que #recordar / #hecho: solo cuenta al principio del
 * mensaje, no entra al historial ni al aprendizaje, no calla al bot, al cliente
 * no le llega nada del bot y se confirma al grupo. En el grupo va con el número
 * del cliente (sirve pegar el wa.me de un aviso); sin número contesta cómo se
 * usa y no marca nada a ciegas.
 *
 * Existe para responder lo que el sistema todavía no podía: si el bot ayuda a
 * vender. Por eso, además de la fecha, quedan dos marcas por separado: si el
 * bot había propuesto algún mensaje en ese chat, y si le llegó a mandar alguno
 * de verdad. En escucha o en borrador propone sin mandar.
 *
 * Uno por chat, en `resultado`: marcar otra vez corrige, no suma.
 */
const state = require('./state');
const evolution = require('./evolution');
const { esTelefono } = require('./avisos-texto');
const { quien } = require('./recordatorios');

const TITULO = { vendido: '💰 Vendido', perdido: '❌ Perdido' };

/** Dígitos mínimos para buscar un número: los mismos que piden las listas de números. */
const DIGITOS_MINIMOS = 8;

const COMO_SE_USA =
  'En el chat del cliente: #vendido o #perdido\n' +
  'En el grupo, con su número: #vendido 5492990000000 (sirve pegar el wa.me de un aviso)';

/**
 * ¿El texto es #vendido o #perdido? Igual que #hecho, solo si el mensaje EMPIEZA
 * con el comando: los avisos del bot vuelven por el webhook y lo nombran en el
 * medio. `numero` son los dígitos de lo que venga después ('' si no hay); solo
 * se usa desde el grupo.
 *
 * @returns {{tipo:'vendido'|'perdido', numero:string} | null}
 */
function comando(texto) {
  const m = String(texto || '').trim().match(/^#(vendido|perdido)(?![\p{L}\p{N}_])([\s\S]*)$/iu);
  return m ? { tipo: m[1].toLowerCase(), numero: m[2].replace(/\D/g, '') } : null;
}

/**
 * ¿El bot propuso algún mensaje en este chat? `botPropuso` lo deja index.js y no
 * se borra; `ultimaPropuestaBot` cubre los chats de antes de que existiera, aunque
 * solo guarda la última propuesta.
 */
function botParticipo(s) {
  return Boolean(s && (s.botPropuso || s.ultimaPropuestaBot));
}

/**
 * ¿El bot le mandó de verdad algún mensaje a este cliente? `botEnvio` lo deja
 * index.js cuando un envío salió (respuesta, foto, PDF o seguimiento). Para los
 * chats de antes no hay forma de saberlo, pero hasta septiembre de 2026 el bot
 * nunca había mandado nada.
 */
function botLeMando(s) {
  return Boolean(s && s.botEnvio);
}

/** "14/09". A mano: con toLocaleDateString depende de la versión de ICU y salía "14/9". */
function fecha(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

const link = (chatId) => `💬 https://wa.me/${String(chatId).split('@')[0]}`;

/**
 * Anota cómo terminó el chat.
 *
 *  - Sin nada anotado: guarda { tipo, ts, botParticipo, botLeMando }.
 *  - Con el otro tipo: lo corrige, con la fecha de ahora.
 *  - Con el mismo tipo: no cambia nada, ni la fecha. Si no, un segundo #vendido
 *    hoy movería al día de hoy una venta que ya se contó ayer.
 *  - El mismo mensaje dos veces (Evolution repite webhooks): no hace nada.
 *
 * Guarda YA, sin el segundo de gracia: es un registro que no se recupera.
 *
 * @returns {{chatId:string, tipo:string, cambio:boolean, aviso:string|null}}
 */
function marcar(chatId, tipo, origen, ahora = new Date()) {
  const base = { chatId, tipo };
  const s = state.todos()[chatId] || {};
  const previo = s.resultado;
  const origenes = (previo && previo.origenes) || [];
  if (origen && origenes.includes(origen)) return { ...base, cambio: false, aviso: null };
  const conOrigen = (r) => ({ ...r, origenes: [...origenes, origen].filter(Boolean).slice(-10) });

  if (previo && previo.tipo === tipo) {
    state.actualizar(chatId, { resultado: conOrigen(previo) });
    state.guardarAhora();
    return {
      ...base,
      cambio: false,
      aviso: `${TITULO[tipo]} · ${quien(chatId, s)} — ya estaba anotado desde el ${fecha(previo.ts)}, no cambié nada`,
    };
  }

  const participo = botParticipo(s);
  const mando = botLeMando(s);
  const resultado = conOrigen({ tipo, ts: ahora.getTime(), botParticipo: participo, botLeMando: mando });
  if (previo) resultado.corrigio = previo.tipo;
  state.actualizar(chatId, { resultado });
  state.guardarAhora();

  const corregido = previo ? ` — corregido, estaba como ${previo.tipo}` : '';
  const lineas = [
    `${TITULO[tipo]} · ${quien(chatId, s)}${corregido}`,
    `El bot había propuesto mensajes en este chat: ${participo ? 'sí' : 'no'}`,
  ];
  // Igual que en el resumen: lo de "le mandó" aparece solo cuando pasó.
  if (mando) lineas.push('El bot le mandó mensajes al cliente: sí');
  return { ...base, cambio: true, aviso: lineas.join('\n') };
}

/**
 * Los chats de clientes con ese número, con la misma comparación que usan las
 * listas de números (sin el 54 y sin el 9). Si uno es exactamente ese número,
 * es ese: los demás son el mismo número con otro prefijo.
 */
function chatsDelNumero(numero) {
  const ids = Object.keys(state.todos()).filter(
    (id) =>
      !id.endsWith('@g.us') &&
      esTelefono(id) &&
      !evolution.esContactoPersonal(id) &&
      evolution.estaEnLaLista(id, [numero])
  );
  const exacto = ids.filter((id) => id.split('@')[0] === numero);
  return exacto.length === 1 ? exacto : ids;
}

/**
 * #vendido / #perdido escrito en el grupo interno. Marca el chat del número que
 * venga con el comando. No marca nada a ciegas: sin número, con uno que no
 * parece un teléfono, con un contacto personal, sin ningún chat que coincida o
 * con varios, contesta por qué y no toca el estado.
 *
 * @returns {{chatId:string|null, tipo:string, cambio:boolean, aviso:string|null}}
 */
function desdeGrupo({ tipo, numero }, origen, ahora = new Date()) {
  const nada = (aviso) => ({ chatId: null, tipo, cambio: false, aviso });
  if (!numero) return nada(ayudaEnGrupo(tipo));
  const elegido = elegirChatDesdeGrupo({
    comando: `#${tipo}`,
    numero,
    nada: 'No marqué nada.',
    verbo: 'marcar',
    comoSeUsa: COMO_SE_USA,
  });
  if (!elegido.chatId) return nada(elegido.aviso);
  const r = marcar(elegido.chatId, tipo, origen, ahora);
  // Desde el grupo no se ve de qué chat se trata: el link sirve para verificarlo.
  return r.aviso ? { ...r, aviso: `${r.aviso}\n${link(elegido.chatId)}` } : r;
}

/**
 * El chat de un número escrito en el grupo interno. Lo usan #vendido / #perdido y
 * #pausa / #sigue (control.js), con la misma comparación. No elige a ciegas: con un
 * número que no parece un teléfono, un contacto personal, ningún chat o varios,
 * devuelve el aviso de por qué, y quien llama no toca nada.
 *
 * @param {object} o
 * @param {string} o.comando    "#vendido", "#pausa"...
 * @param {string} o.numero     los dígitos que vinieron con el comando (no vacío)
 * @param {string} o.nada       "No marqué nada.", "No toqué nada."
 * @param {string} o.verbo      "marcar", "pausar"...
 * @param {string} o.comoSeUsa  el texto de uso de ese comando
 * @returns {{chatId:string} | {chatId:null, aviso:string}}
 */
function elegirChatDesdeGrupo({ comando: nombre, numero, nada, verbo, comoSeUsa }) {
  const sinTocar = (aviso) => ({ chatId: null, aviso });
  if (numero.length < DIGITOS_MINIMOS) {
    return sinTocar(`❓ ${nombre} ${numero}: no parece un número de teléfono. ${nada}\n\n${comoSeUsa}`);
  }
  if (evolution.esContactoPersonal(`${numero}@s.whatsapp.net`)) {
    return sinTocar(`❓ El ${numero} está en CONTACTOS_PERSONALES. ${nada}`);
  }
  const chats = chatsDelNumero(numero);
  if (!chats.length) {
    return sinTocar(`❓ No encontré ningún chat con el ${numero}. ${nada}\nTiene que ser alguien que ya le escribió al negocio.`);
  }
  if (chats.length > 1) {
    return sinTocar(
      [
        `❓ Hay ${chats.length} chats con el ${numero} y no sé cuál ${verbo}. ${nada}`,
        ...chats.map(link),
        'Pegá el número completo del que corresponde, como figura en el link.',
      ].join('\n')
    );
  }
  return { chatId: chats[0] };
}

/** Lo que se contesta en el grupo sin número: ahí no hay un chat que marcar. */
function ayudaEnGrupo(tipo) {
  return `❓ Desde el grupo, #${tipo} va con el número del cliente, así sé cuál marcar. No marqué nada.\n\n${COMO_SE_USA}`;
}

module.exports = { comando, marcar, desdeGrupo, elegirChatDesdeGrupo, ayudaEnGrupo, botParticipo, botLeMando };
