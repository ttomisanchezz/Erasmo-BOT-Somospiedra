'use strict';
/**
 * Contactos excluidos, dados de alta y de baja a mano (decisión de Tomás del 29/10/2026; lo pidió Fran:
 * reglas/cerebro-reglas-piedra.md, "Contactos excluidos").
 *
 * Desde la cuenta del negocio:
 *   #excluir / #incluir                         en el chat de la persona
 *   #excluir 5492990000000 (o #incluir)         en el grupo interno, con el número
 *   #excluidos                                  en el grupo (o en cualquier chat): la lista
 *
 * Un excluido se ignora ENTERO, igual que los de CONTACTOS_PERSONALES del .env (evolution.esContactoPersonal
 * mira las dos listas): el bot no le contesta, no le escribe, no guarda su chat, no lo manda a Sonnet ni lo
 * escala. La diferencia es que la lista del estado se cambia desde WhatsApp, sin tocar el .env ni reiniciar,
 * y sobrevive a un reinicio (state.guardarExcluido guarda YA).
 *
 * Mismo patrón que ventas.js: el comando solo cuenta al principio del mensaje (los avisos del bot vuelven por
 * el webhook como mensajes propios y nombran estos comandos en el medio; ninguno EMPIEZA con uno), y desde el
 * chat se ignora lo que venga escrito después. Lo que NO se copia de ventas.js:
 *  - El número: se toma UNO solo. ventas.js junta todos los dígitos de lo que viene después; acá eso sería
 *    peligroso, porque #excluir acepta números que nunca escribieron y "#excluir 5492990000000 el de fletes 2"
 *    excluiría en silencio otro número. Lo que no es un solo número no marca nada.
 *  - No se usa ventas.elegirChatDesdeGrupo: pide un chat que ya exista, y acá se puede excluir a alguien que
 *    nunca escribió (un proveedor). Excluir NO le crea un chat al número.
 *
 * Los números se comparan siempre con evolution.estaEnLaLista (sin el 54 y sin el 9): 549… y 54… son la
 * misma persona.
 */
const config = require('./config');
const state = require('./state');
const evolution = require('./evolution');
const { esTelefono, partir, LARGO_MENSAJE } = require('./avisos-texto');

/** Un teléfono argentino sin el 54, el 9 ni el 15: la característica y el número, 10 dígitos en total. */
const DIGITOS_LOCALES = 10;
const COMO_ESCRIBIRLO = 'no pude leer ese número. Escribilo con la característica y sin 0 ni 15, por ejemplo 2994000000 o 5492994000000';

const COMO_SE_USA =
  'En el chat de la persona: #excluir (el bot deja de atenderla) o #incluir (la vuelve a atender)\n' +
  'En el grupo, con su número: #excluir 5492990000000 o #incluir 5492990000000 (sirve pegar el wa.me; puede ser alguien que nunca escribió)\n' +
  'Para ver la lista: #excluidos';

/** "14/09". A mano, igual que ventas.js: con toLocaleDateString depende de la versión de ICU. */
function fecha(ts) {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
}

/** Los dígitos del grupo de avisos ('' si no hay): ese número nunca se excluye. */
function digitosDelGrupo() {
  return String(config.grupoAvisos || '').split('@')[0].replace(/\D/g, '');
}

/**
 * ¿El texto es #excluir, #incluir o #excluidos? Solo si el mensaje EMPIEZA con el comando ('#excluirlo' no
 * cuenta). El número es UNO: lo que viene después del comando, sin un 'https://wa.me/' o 'wa.me/' al principio
 * ni un '+', con espacios, guiones y paréntesis entre los dígitos. Sin nada después, `numero` es ''. Cualquier
 * otra cosa es un `problema` (y `numero` queda ''): quien llama no marca nada y contesta cómo se usa.
 * #excluidos no lleva número.
 *
 * El número tipeado se lleva a '549' + 10 dígitos (característica + número, sin el 15), que es como llega en
 * el JID: se saca el 54 y, si sigue un 9, el 9; si empieza con 0, el 0; y lo que queda tiene que tener
 * EXACTAMENTE 10 dígitos. Un 0 o un 15 de más, o un dígito de menos o de más, no se "arregla": antes un
 * "0299 15 400-0000" se guardaba tal cual y no excluía a nadie, y uno de 8 o 9 dígitos coincidía por sufijo
 * con varias personas. El grupo de avisos pasa igual, antes de normalizar: excluir() lo rechaza con su aviso.
 *
 * Un número extranjero NO se puede excluir tipeándolo acá. Se excluye desde su propio chat (#excluir en el
 * chat usa el número del JID tal cual, sin esta normalización) o poniéndolo en CONTACTOS_PERSONALES del .env.
 *
 * Desde el chat se ignora el número y el problema: ahí el comando vale para ese chat.
 *
 * Si la normalización falla, `crudo` trae los dígitos tipeados tal cual: desdeGrupo los usa solo para un
 * #incluir de un número que ya está guardado así (un extranjero). Un 15 sin característica (la parte local
 * empieza con 1 y no con 11) o una parte local que empieza con 4 a 9 también se rechazan: esos números no
 * existen (las características empiezan con 11, 2 o 3).
 *
 * @returns {{tipo:'excluir'|'incluir'|'excluidos', numero:string, problema:string|null, crudo?:string} | null}
 */
function comando(texto) {
  const m = String(texto || '').trim().match(/^#(excluir|incluir|excluidos)(?![\p{L}\p{N}_])([\s\S]*)$/iu);
  if (!m) return null;
  const tipo = m[1].toLowerCase();
  if (tipo === 'excluidos') return { tipo, numero: '', problema: null };
  const resto = m[2].trim();
  if (!resto) return { tipo, numero: '', problema: null };
  const sinLink = resto.replace(/^(?:https?:\/\/)?wa\.me\//i, '').replace(/^\+/, '').trim();
  const problema = (porQue) => ({ tipo, numero: '', problema: porQue });
  if (!/^[\d(][\d\s\-()]*$/.test(sinLink)) return problema('no es un solo número de teléfono');
  const d = sinLink.replace(/\D/g, '');
  // El grupo de avisos pasa igual (aunque tenga más de 15 dígitos): excluir() lo rechaza con su propio aviso.
  if (d && d === digitosDelGrupo()) return { tipo, numero: d, problema: null };
  let local = d;
  if (local.startsWith('54')) {
    local = local.slice(2);
    if (local.startsWith('9')) local = local.slice(1);
  } else if (local.startsWith('0')) {
    local = local.slice(1);
  }
  // Las características argentinas empiezan con 11, 2 o 3. Con 15 sin característica (o un 1 suelto), o con un
  // 4 a 9 adelante (un 9 o un 0 de más y un dígito de menos), el número no existe. El 0 no se rechaza: los
  // números inventados de las pruebas (549 0000…) dejan una parte local que empieza con 0.
  if (local.length !== DIGITOS_LOCALES || /^(?:1(?!1)|[4-9])/.test(local)) return { ...problema(COMO_ESCRIBIRLO), crudo: d };
  return { tipo, numero: '549' + local, problema: null };
}

const jidDe = (numero) => `${numero}@s.whatsapp.net`;
const link = (numero) => `💬 https://wa.me/${numero}`;
const quien = (nombre, numero) => (nombre ? `${nombre} · ${numero}` : numero);

/**
 * Los chats guardados de ese número (de teléfono, no @lid ni grupos), sin crear nada: la misma comparación
 * que las listas de números.
 */
function chatsDelNumero(numero) {
  return Object.keys(state.todos()).filter((id) => id.endsWith('@s.whatsapp.net') && esTelefono(id) && evolution.estaEnLaLista(id, [numero]));
}

/** El nombre que se conoce de ese número (el del chat en el estado), o null. Nunca el pushName de un mensaje propio. */
function nombreConocido(numero) {
  for (const id of chatsDelNumero(numero)) {
    const n = String((state.todos()[id] || {}).nombre || '').trim();
    if (n) return n;
  }
  return null;
}

const SIN_CHAT = 'Todavía no hay ningún chat con ese número: verificá el link.';

/** ¿Alguno de los chats de ese número tiene un recordatorio activo (#recordar)? */
function conRecordatorio(numero) {
  const activos = state.recordatorios();
  return chatsDelNumero(numero).some((id) => activos[id]);
}

/** Las claves guardadas en la lista de excluidos que son ese número (549…, 54…: todas las variantes). */
function variantes(numero) {
  return state.numerosExcluidos().filter((k) => evolution.estaEnLaLista(k, [numero]));
}

const ayudaEnGrupo = (tipo) => `❓ Desde el grupo, #${tipo} va con el número, así sé a quién. No marqué nada.\n\n${COMO_SE_USA}`;
const noEsUnNumero = (tipo, problema) => `❓ #${tipo}: ${problema}. No marqué nada.\n\n${COMO_SE_USA}`;

/**
 * #excluir: guarda el número en la lista. No toca nada si ya estaba excluido, si está en CONTACTOS_PERSONALES
 * del .env (el bot ya lo ignora) o si es el grupo de avisos.
 *
 * @param {string} numero  dígitos, ya validados por `comando` (o el del JID del chat)
 * @param {{origen:'chat'|'grupo', ahora?:number}} o
 * @returns {{tipo:'excluir', numero:string, cambio:boolean, aviso:string}}
 */
function excluir(numero, { origen, ahora = Date.now() }) {
  const nada = (aviso) => ({ tipo: 'excluir', numero, cambio: false, aviso });
  if (!numero) return nada(ayudaEnGrupo('excluir'));
  if (numero === digitosDelGrupo()) return nada('❓ Ese es el grupo de avisos: nunca se excluye. No marqué nada.');
  if (evolution.motivoContactoPersonal(jidDe(numero)) === 'CONTACTOS_PERSONALES') {
    return nada(`ℹ️ El ${numero} ya está en CONTACTOS_PERSONALES del .env: el bot ya lo ignora. No cambié nada.`);
  }
  const previas = variantes(numero);
  if (previas.length) {
    const datos = state.leerExcluidos()[previas[0]] || {};
    return nada(`ℹ️ ${quien(datos.nombre, numero)} ya estaba excluido desde el ${fecha(datos.desde || ahora)}. No cambié nada.\n${link(numero)}`);
  }
  const nombre = nombreConocido(numero);
  const conRecordar = conRecordatorio(numero);
  state.guardarExcluido(numero, { desde: ahora, nombre, origen });
  return {
    tipo: 'excluir',
    numero,
    cambio: true,
    aviso:
      `🚫 Excluido · ${quien(nombre, numero)}\n${link(numero)}\n` +
      `El bot no le contesta ni le escribe. Para volver a atenderlo: #incluir ${numero}` +
      (conRecordar ? '\nTenía un #recordar: no suena mientras esté excluido.' : '') +
      // Solo desde el grupo: ahí el número se tipea y un link que no abre ningún chat delata un error. Desde
      // el chat de la persona el número es el del JID.
      (origen === 'grupo' && !chatsDelNumero(numero).length ? `\n${SIN_CHAT}` : ''),
  };
}

/**
 * #incluir: saca el número de la lista (TODAS las variantes guardadas). Uno de CONTACTOS_PERSONALES del .env
 * no se puede sacar por comando.
 *
 * @returns {{tipo:'incluir', numero:string, cambio:boolean, aviso:string}}
 */
function incluir(numero, { origen = 'chat' } = {}) {
  const nada = (aviso) => ({ tipo: 'incluir', numero, cambio: false, aviso });
  if (!numero) return nada(ayudaEnGrupo('incluir'));
  if (evolution.motivoContactoPersonal(jidDe(numero)) === 'CONTACTOS_PERSONALES') {
    return nada(
      `❓ El ${numero} está en CONTACTOS_PERSONALES del .env y por comando no se puede sacar. ` +
        'Hay que sacarlo de ahí y reiniciar el bot. No cambié nada.'
    );
  }
  const previas = variantes(numero);
  if (!previas.length) return nada(`ℹ️ El ${numero} no estaba excluido. No cambié nada.\n${link(numero)}`);
  const nombre = (state.leerExcluidos()[previas[0]] || {}).nombre || nombreConocido(numero);
  for (const k of previas) state.borrarExcluido(k);
  return {
    tipo: 'incluir',
    numero,
    cambio: true,
    aviso:
      `✅ Incluido · ${quien(nombre, numero)}\n${link(numero)}\nEl bot vuelve a atenderlo.` +
      (origen === 'grupo' && !chatsDelNumero(numero).length ? `\n${SIN_CHAT}` : ''),
  };
}

/**
 * La lista para #excluidos, partida en mensajes que entren: los excluidos por comando (nombre si se conoce,
 * número y desde cuándo, sin repetir el mismo número con otro prefijo) y, al final, SOLO cuántos hay en
 * CONTACTOS_PERSONALES del .env.
 *
 * @returns {string[]}
 */
function lista() {
  // leerExcluidos y no excluidos(): leer no puede arreglar una lista dañada, porque el próximo guardado la pisaría.
  const datos = state.leerExcluidos();
  const vistos = [];
  for (const k of Object.keys(datos).sort((a, b) => Number((datos[a] || {}).desde || 0) - Number((datos[b] || {}).desde || 0))) {
    if (!vistos.some((v) => evolution.estaEnLaLista(v, [k]))) vistos.push(k);
  }
  const delEnv = config.contactosPersonales.length;
  const pie = delEnv ? `Además, ${delEnv} número${delEnv === 1 ? '' : 's'} en CONTACTOS_PERSONALES del .env (el bot también los ignora).` : '';
  if (!vistos.length) return [`🚫 Excluidos por comando: ninguno.${pie ? '\n' + pie : ''}`];
  const filas = vistos.map((k) => {
    const d = datos[k] || {};
    return `• ${quien(d.nombre, k)} · desde el ${fecha(d.desde || Date.now())}`;
  });
  return partir([`🚫 Excluidos por comando (${vistos.length})`, ...filas, ...(pie ? [pie] : [])], LARGO_MENSAJE);
}

/**
 * #excluir / #incluir / #excluidos escrito en el grupo interno. Nunca marca a ciegas: sin número o con algo
 * que no es un solo número, contesta cómo se usa.
 *
 * @returns {{tipo:string, numero:string, cambio:boolean, avisos:string[]}}
 */
function desdeGrupo({ tipo, numero, problema, crudo }, ahora = Date.now()) {
  if (tipo === 'excluidos') return { tipo, numero: '', cambio: false, avisos: lista() };
  // #incluir de un número que no es 549 + 10 dígitos (un extranjero excluido desde su chat): si esos dígitos
  // crudos están guardados TAL CUAL en la lista, se incluye ese número. Es el que sugiere el 🚫.
  if (problema && tipo === 'incluir' && crudo && state.numerosExcluidos().includes(crudo)) {
    const r = incluir(crudo, { origen: 'grupo' });
    return { tipo, numero: crudo, cambio: r.cambio, avisos: [r.aviso] };
  }
  if (problema) return { tipo, numero: '', cambio: false, avisos: [noEsUnNumero(tipo, problema)] };
  const r = tipo === 'excluir' ? excluir(numero, { origen: 'grupo', ahora }) : incluir(numero, { origen: 'grupo' });
  return { tipo, numero, cambio: r.cambio, avisos: [r.aviso] };
}

/**
 * #excluir / #incluir / #excluidos escrito en el chat de una persona (por la cuenta del negocio): vale para ESE
 * chat, y lo que venga escrito después se ignora. Un chat sin número (@lid) no se marca: WhatsApp no mandó el
 * teléfono y no hay a quién excluir.
 *
 * @returns {{tipo:string, numero:string, cambio:boolean, avisos:string[]}}
 */
function desdeChat(chatId, { tipo }, ahora = Date.now()) {
  if (tipo === 'excluidos') return { tipo, numero: '', cambio: false, avisos: lista() };
  const numero = String(chatId).split('@')[0];
  if (!String(chatId).endsWith('@s.whatsapp.net') || !esTelefono(chatId)) {
    return {
      tipo,
      numero: '',
      cambio: false,
      avisos: [
        `❓ #${tipo} en un chat sin número (${String(chatId).split('@')[1] || 'sin número'}): WhatsApp no mandó el número de ese chat, así que no marqué nada. ` +
          `Hacelo desde el grupo con el número: #${tipo} 5492990000000`,
      ],
    };
  }
  const r = tipo === 'excluir' ? excluir(numero, { origen: 'chat', ahora }) : incluir(numero);
  return { tipo, numero, cambio: r.cambio, avisos: [r.aviso] };
}

module.exports = { comando, excluir, incluir, lista, desdeGrupo, desdeChat, COMO_SE_USA };
