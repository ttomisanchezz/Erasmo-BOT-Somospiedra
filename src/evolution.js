'use strict';
/** Cliente de Evolution API v2. */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const fotos = require('./fotos');
const documentos = require('./documentos');
const chatsViejos = require('./chats-viejos');
const interruptor = require('./interruptor');

const base = () => `${config.evolution.url.replace(/\/$/, '')}`;
const cabeceras = () => ({
  'Content-Type': 'application/json',
  apikey: config.evolution.apikey,
});

async function pedir(ruta, body) {
  if (config.modoEscucha) return { bloqueado: true, motivo: 'modo escucha' };
  const res = await fetch(`${base()}${ruta}`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Evolution ${res.status} en ${ruta}: ${detalle.slice(0, 300)}`);
  }
  return res.json().catch(() => ({}));
}

/**
 * El interruptor general (src/interruptor.js, #apagar / #prender): apagado, no sale nada a un
 * cliente. Es la segunda traba: index.js ya no arma la tanda. El grupo interno sí recibe.
 */
function apagadaPara(numero) {
  return !String(numero || '').endsWith('@g.us') && !interruptor.prendida();
}
const APAGADA = { bloqueado: true, motivo: 'bot apagado (#apagar)' };
// Última traba (29/10/2026): index.js ya no arma tandas para un contacto personal o excluido, pero lo que se
// escapa (el "escribiendo…" del mensaje siguiente cuando lo excluyen mientras sale uno) se frena acá.
const CONTACTO = { bloqueado: true, motivo: 'contacto personal o excluido' };

/** Manda un texto. `delay` hace que WhatsApp muestre "escribiendo…". */
async function enviarTexto(numero, texto, delayMs = 1200) {
  if (!esDestinoDePrueba(numero)) return { bloqueado: true, motivo: 'fuera de la lista de prueba' };
  if (apagadaPara(numero)) return APAGADA;
  if (esContactoPersonal(numero)) return CONTACTO;
  return pedir(`/message/sendText/${config.evolution.instancia}`, {
    number: numero,
    text: texto,
    delay: delayMs,
    linkPreview: false,
  });
}

const MIME = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
const EXTENSIONES_FOTO = Object.keys(MIME);
const EXTENSIONES_DOCUMENTO = ['.pdf'];

/**
 * ¿Es un archivo que el bot puede mandar? Tiene que estar adentro de la carpeta
 * del catálogo (fotos/ y documentos/ del repo, o lo que digan FOTOS_DIR y
 * DOCS_DIR) y tener una extensión permitida. Antes de comparar se resuelven `..`,
 * enlaces, mayúsculas y separadores de Windows.
 *
 * Es la última defensa (auditoría del 15/09/2026, A2): index.js ya saca las rutas
 * del catálogo y nunca de un texto.
 */
function archivoPermitido(ruta, carpeta, extensiones) {
  const real = rutaAdentro(ruta, carpeta);
  if (!real) return false;
  try {
    return extensiones.includes(path.extname(real).toLowerCase()) && fs.statSync(real).isFile();
  } catch {
    return false; // no existe o no se puede resolver: no se manda
  }
}

/**
 * La ruta REAL de `ruta` si está adentro de `carpeta`, o null (no existe, es la carpeta misma, o sale con un
 * `..` o un enlace). Compara las dos rutas ya resueltas: `..`, enlaces, mayúsculas (exactas, las del disco) y separadores.
 * Es la resolución de `archivoPermitido`, compartida desde el 29/10/2026 con src/generados.js (los archivos
 * que genera el bot): una sola, para que los dos candados no se despeguen.
 */
function rutaAdentro(ruta, carpeta) {
  try {
    const raiz = fs.realpathSync.native(path.resolve(carpeta));
    const real = fs.realpathSync.native(path.resolve(String(ruta)));
    // Prefijo EXACTO, no path.relative (29/10/2026): en Windows relative() no distingue mayúsculas y dejaría
    // "adentro" a un hermano 'GENERADOS' de 'generados' en una carpeta que sí las distingue (WSL, fsutil
    // setCaseSensitiveInfo). Las dos rutas ya vienen resueltas con las mayúsculas del disco.
    const adentro = real !== raiz && real.startsWith(raiz.endsWith(path.sep) ? raiz : raiz + path.sep);
    return adentro ? real : null;
  } catch {
    return null; // no existe o no se puede resolver: no se manda
  }
}

function fueraDelCatalogo(tipo, ruta, motivo) {
  if (motivo !== undefined) {
    console.error(`[envio] ${tipo}: ${motivo}, no lo mando: ${String(ruta).slice(0, 120)}`);
    return { bloqueado: true, motivo };
  }
  console.error(`[envio] ${tipo} fuera del catálogo o con extensión no permitida, no lo mando: ${String(ruta).slice(0, 120)}`);
  return { bloqueado: true, motivo: 'archivo fuera del catálogo' };
}

/** Manda una imagen desde un archivo local, en base64. */
async function enviarImagen(numero, rutaLocal, caption = '', delayMs = 1200) {
  if (!esDestinoDePrueba(numero)) return { bloqueado: true, motivo: 'fuera de la lista de prueba' };
  if (apagadaPara(numero)) return APAGADA;
  if (esContactoPersonal(numero)) return CONTACTO;
  if (config.modoEscucha) return { bloqueado: true, motivo: 'modo escucha' };
  if (!archivoPermitido(rutaLocal, fotos.carpeta(), EXTENSIONES_FOTO)) return fueraDelCatalogo('foto', rutaLocal);
  const ext = path.extname(rutaLocal).toLowerCase();
  const base64 = fs.readFileSync(rutaLocal).toString('base64');
  return pedir(`/message/sendMedia/${config.evolution.instancia}`, {
    number: numero,
    mediatype: 'image',
    mimetype: MIME[ext] || 'image/jpeg',
    media: base64,
    caption,
    fileName: path.basename(rutaLocal),
    delay: delayMs,
  });
}

/** Manda un documento (PDF) desde un archivo local, en base64. */
async function enviarDocumento(numero, rutaLocal, caption = '', delayMs = 1200) {
  if (!esDestinoDePrueba(numero)) return { bloqueado: true, motivo: 'fuera de la lista de prueba' };
  if (apagadaPara(numero)) return APAGADA;
  if (esContactoPersonal(numero)) return CONTACTO;
  if (config.modoEscucha) return { bloqueado: true, motivo: 'modo escucha' };
  // Modo borrador: al cliente no le sale nada (index.js manda el borrador de los textos al grupo, con la nota del PDF).
  if (config.modoBorrador) return { bloqueado: true, motivo: 'modo borrador' };
  if (!archivoPermitido(rutaLocal, documentos.CARPETA, EXTENSIONES_DOCUMENTO)) {
    return fueraDelCatalogo('documento', rutaLocal);
  }
  const base64 = fs.readFileSync(rutaLocal).toString('base64');
  return pedir(`/message/sendMedia/${config.evolution.instancia}`, {
    number: numero,
    mediatype: 'document',
    mimetype: 'application/pdf',
    media: base64,
    caption,
    fileName: path.basename(rutaLocal),
    delay: delayMs,
  });
}

/**
 * Manda un archivo que generó el propio bot (la imagen del simulador, el presupuesto en PDF; 29/10/2026,
 * spec del simulador §8). Es la única excepción al candado del catálogo y no lo afloja. En orden:
 *  1. modo escucha o #apagar: no sale nada;
 *  2. contacto personal o excluido: no sale nada, ni un borrador al grupo;
 *  3. `generados.revisar` (las comprobaciones baratas: chat de una persona, tipo, carpeta, extensión del tipo,
 *     un solo nombre, hasta 5 MB): si falla, no sale nada, ni al grupo (`fueraDelCatalogo` con el motivo);
 *  4. `generados.leer`: abre el archivo UNA vez, calcula el sha256 de ESOS bytes y exige que esté registrado para
 *     ESTE chat (el JID exacto) hace menos de 24 h. Los bytes que se verifican son los que se mandan: el dueño
 *     va atado al CONTENIDO, no a la ruta, así que renombrar, mover, copiar o enlazar el archivo de A no se lo
 *     da a B, y no hay carrera entre revisar y leer. Contrato completo en la cabecera de src/generados.js
 *     (los mismos bytes nunca van a dos chats; los hashes se guardan 7 días; los archivos no se borran);
 *  5. borrador: al cliente nada; el archivo va al grupo marcado BORRADOR, como el borrador de los textos,
 *     con el mismo candado que `avisarGrupo`;
 *  6. la lista de prueba, como `enviarImagen`.
 * `tipo`: 'imagen' o 'pdf'. Nada de esto lo llama Sonnet todavía (no hay herramienta): la ruta nunca sale de un texto.
 */
async function enviarGenerado(chatId, ruta, { tipo, caption = '', delayMs = 0 } = {}) {
  const generados = require('./generados');
  if (config.modoEscucha) return { bloqueado: true, motivo: 'modo escucha' };
  if (apagadaPara(chatId)) return APAGADA;
  if (esContactoPersonal(chatId)) return CONTACTO;
  const nombre = tipo === 'imagen' ? 'imagen generada' : tipo === 'pdf' ? 'pdf generado' : 'archivo generado';
  const revision = generados.revisar(chatId, ruta, tipo);
  if (!revision.ok) return fueraDelCatalogo(nombre, ruta, revision.motivo);
  const lectura = generados.leer(chatId, revision);
  if (!lectura.ok) return fueraDelCatalogo(nombre, ruta, lectura.motivo);
  const { real, ext } = revision;
  const media = lectura.buffer.toString('base64');
  const cuerpo = (numero, texto) => ({
    number: numero,
    mediatype: tipo === 'imagen' ? 'image' : 'document',
    mimetype: tipo === 'imagen' ? MIME[ext] : 'application/pdf',
    media,
    caption: texto,
    fileName: path.basename(real),
    delay: delayMs,
  });
  if (config.modoBorrador) {
    const resultado = { bloqueado: true, motivo: 'modo borrador', alGrupo: false };
    const motivo = motivoBloqueoAvisos() ||
      (destinoEsUnCliente(config.grupoAvisos) ? 'el destino es un chat de cliente' : '');
    if (motivo) {
      console.log('[aviso bloqueado] ' + motivo);
      noSalio(motivo);
      return resultado;
    }
    try {
      const texto = `Chat: https://wa.me/${chatId.split('@')[0]}\n\n— BORRADOR, no se envió —\n${caption}`;
      await pedir(`/message/sendMedia/${config.evolution.instancia}`, cuerpo(config.grupoAvisos, texto));
      return { ...resultado, alGrupo: true };
    } catch (e) {
      console.error('[evolution] no pude mandar el generado al grupo:', e.message);
      noSalio(`fallo de envio (${errorCorto(e)})`);
      return resultado;
    }
  }
  if (!esDestinoDePrueba(chatId)) return { bloqueado: true, motivo: 'fuera de la lista de prueba' };
  return pedir(`/message/sendMedia/${config.evolution.instancia}`, cuerpo(chatId, caption));
}

/**
 * Baja el archivo de un mensaje con media y lo devuelve en base64.
 *
 * El webhook NO trae el archivo: `WEBHOOK_BASE64` está en su default (false) y
 * la url que llega apunta al CDN de WhatsApp con el contenido cifrado. Quien
 * lo puede descifrar es Evolution, con la mediaKey que ya tiene guardada.
 *
 * OJO con dos cosas, y son a propósito:
 *  - NO pasa por `pedir()`: eso bloquea en modo escucha, y en modo escucha
 *    justamente queremos transcribir para aprender. Esto lee, no manda nada.
 *  - NO pasa por la lista blanca de prueba: bajar un archivo no le escribe a
 *    nadie.
 *
 * Devuelve { base64, mimetype } o null si no se pudo.
 */
async function base64DeMedia(mensaje) {
  const id = mensaje?.key?.id;
  if (!id) return null;
  try {
    const res = await fetch(
      `${base()}/chat/getBase64FromMediaMessage/${config.evolution.instancia}`,
      {
        method: 'POST',
        headers: cabeceras(),
        body: JSON.stringify({ message: { key: mensaje.key }, convertToMp4: false }),
      }
    );
    if (!res.ok) {
      const detalle = await res.text().catch(() => '');
      console.error(`[media] Evolution ${res.status}: ${detalle.slice(0, 160)}`);
      return null;
    }
    const data = await res.json().catch(() => null);
    // Evolution cambió la forma de la respuesta entre versiones: se aceptan las
    // que vimos en la práctica antes que romper por un nombre de campo.
    const base64 = data?.base64 || data?.media || data?.data?.base64 || null;
    if (!base64) {
      console.error('[media] Evolution respondió sin base64');
      return null;
    }
    // Sin mimetype en la respuesta: el del mensaje (el del audio, o el de la foto desde que Sonnet ve
    // las fotos del cliente, 06/10/2026); si no hay ninguno, 'audio/ogg' como siempre.
    const mimetype =
      data?.mimetype ||
      data?.mimeType ||
      mensaje?.message?.audioMessage?.mimetype ||
      mensaje?.message?.imageMessage?.mimetype ||
      'audio/ogg';
    return { base64, mimetype: String(mimetype).split(';')[0].trim() };
  } catch (e) {
    console.error('[media] no pude bajar el archivo:', e.message);
    return null;
  }
}

// Cuánto se espera a Evolution al consultar el estado. Sin tope, una Evolution
// colgada (acepta la conexión y no contesta) dejaba esperando a /salud y al guardián.
const TIMEOUT_ESTADO_MS = 10000;

// Cuánto se espera cada página de mensajes guardados (chats viejos).
const TIMEOUT_BUSQUEDA_MS = 30000;

/**
 * Una página de los mensajes que Evolution tiene guardados entre dos momentos (chats viejos,
 * 29/09/2026: la puesta al día de chats-viejos.js). Es POST /chat/findMessages/<instancia>, una
 * lectura: no pasa por `pedir()` (en modo escucha también lee) ni por la lista de prueba.
 *
 * Verificado el 29/09 en el Evolution que corre (2.3.7, con una llamada real): filtra por fecha
 * SOLO si vienen `gte` y `lte` juntos (con uno solo devuelve la base entera), los pasa por
 * `new Date()` y compara en segundos, los dos inclusive; `offset` es el tamaño de la página y
 * `page` arranca en 1; ordena del más nuevo al más viejo y trae el `key` guardado entero
 * (remoteJid, remoteJidAlt, fromMe, id). `desde` y `hasta` en ms.
 *
 * Devuelve { total, paginas, registros }. Tira si Evolution no contesta o contesta otra cosa.
 */
async function buscarMensajes({ desde, hasta, pagina = 1, porPagina = 500 }) {
  const res = await fetch(`${base()}/chat/findMessages/${config.evolution.instancia}`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({
      where: { messageTimestamp: { gte: new Date(desde).toISOString(), lte: new Date(hasta).toISOString() } },
      page: pagina,
      offset: porPagina,
    }),
    signal: AbortSignal.timeout(TIMEOUT_BUSQUEDA_MS),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Evolution ${res.status} en findMessages: ${detalle.slice(0, 160)}`);
  }
  const data = await res.json().catch(() => null);
  const m = data && data.messages;
  if (!m || !Array.isArray(m.records)) throw new Error('Evolution contestó findMessages sin messages.records');
  return { total: Number(m.total) || 0, paginas: Number(m.pages) || 0, registros: m.records };
}

// Cuánto se espera la lectura de un chat para completar el historial (contexto.js): 8 s.
const TIMEOUT_CONTEXTO_MS = 8000;

/**
 * Los últimos `cuantos` mensajes que Evolution tiene guardados de un chat (bloque Ninjo 1b,
 * 05/10/2026: contexto.js completa con esto el historial que lee Sonnet). Es POST
 * /chat/findMessages/<instancia> con `where: { key: { remoteJid } }`, una lectura: como
 * `buscarMensajes`, no pasa por `pedir()` (en escucha también lee) ni por la lista de prueba.
 *
 * En Evolution 2.x `fetchMessages` filtra por `key.remoteJid` (como por `key.id` y `key.fromMe`) y
 * ordena del más nuevo al más viejo, pero ese filtro nunca se probó en la PC: quien lo usa revisa
 * que cada registro sea de ese chat (contexto.js). Devuelve los registros. Tira si Evolution no
 * contesta en 8 s o contesta otra cosa.
 */
async function buscarMensajesDeChat(jid, cuantos = 30) {
  const res = await fetch(`${base()}/chat/findMessages/${config.evolution.instancia}`, {
    method: 'POST',
    headers: cabeceras(),
    body: JSON.stringify({ where: { key: { remoteJid: jid } }, page: 1, offset: cuantos }),
    signal: AbortSignal.timeout(TIMEOUT_CONTEXTO_MS),
  });
  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    throw new Error(`Evolution ${res.status} en findMessages: ${detalle.slice(0, 160)}`);
  }
  const data = await res.json().catch(() => null);
  const m = data && data.messages;
  if (!m || !Array.isArray(m.records)) throw new Error('Evolution contestó findMessages sin messages.records');
  return m.records;
}

/** Estado de la conexión de la instancia (open / connecting / close). */
async function estadoInstancia() {
  const res = await fetch(
    `${base()}/instance/connectionState/${config.evolution.instancia}`,
    { headers: cabeceras(), signal: AbortSignal.timeout(TIMEOUT_ESTADO_MS) }
  );
  if (!res.ok) return { state: 'desconocido', motivo: `Evolution ${res.status}` };
  const data = await res.json().catch(() => ({}));
  return data?.instance || data || { state: 'desconocido' };
}

/**
 * Lo mismo, para el guardián (src/guardian.js): `{ estado, motivo }`. `estado` es lo
 * que dice Evolution (open / connecting / close), o null si no se pudo consultar, y
 * ahí `motivo` dice por qué (no respondió, se pasó del tiempo, contestó con error).
 * Nunca tira.
 *
 * En modo escucha SÍ consulta, y por eso no pasa por `pedir()`: es una lectura, no
 * le escribe a nadie.
 */
async function estadoDeLaInstancia() {
  try {
    const r = await estadoInstancia();
    const estado = r && typeof r.state === 'string' && r.state !== 'desconocido' ? r.state : null;
    if (estado) return { estado, motivo: '' };
    return { estado: null, motivo: (r && r.motivo) || 'Evolution contestó sin el estado de la instancia' };
  } catch (e) {
    // "fetch failed" solo no dice nada: la causa trae el ECONNREFUSED o el ETIMEDOUT.
    const causa = e && e.cause && e.cause.code ? ` (${e.cause.code})` : '';
    return { estado: null, motivo: `${(e && e.message) || e}${causa}` };
  }
}

/**
 * ¿El destino de los avisos es, en realidad, un chat de cliente?
 *
 * Existe porque ya pasó: un número de cliente quedó cargado como destino de los
 * avisos y el resumen de la mañana —con nombres, modelos y presupuestos de otros
 * clientes— le llegó a esa persona. Los avisos internos no pueden salir jamás a
 * un chat donde alguna vez escribió un cliente.
 */
function destinoEsUnCliente(jid) {
  if (!jid || jid.endsWith('@g.us')) return false; // un grupo siempre es interno
  try {
    const state = require('./state');
    const chat = state.todos()[jid];
    if (!chat) return false;
    return (chat.historial || []).some((m) => m.quien === 'cliente');
  } catch {
    return false;
  }
}

/**
 * Un error de un envío, corto y sin rutas del disco (bloque Ninjo 2, 06/10/2026): "Evolution 500" si
 * contestó con error (el detalle puede traer el texto o el número), o el mensaje recortado, con la causa
 * de un "fetch failed" (ECONNREFUSED…). Lo usan el registro (`entrega` con `error`) y `avisosGrupo`.
 */
function errorCorto(e) {
  const m = String((e && e.message) || e || '');
  const status = m.match(/^Evolution (\d{3})\b/);
  if (status) return `Evolution ${status[1]}`;
  const causa = e && e.cause && e.cause.code ? ` (${e.cause.code})` : '';
  const sinRutas = m
    .replace(/[A-Za-z]:[\\/][^\s'"]*/g, '…')
    .replace(/(?:\/[^\s'"/]+){2,}/g, '…')
    .replace(/\s+/g, ' ')
    .trim();
  return (sinRutas.slice(0, 80) || 'error') + causa;
}

// Los avisos al grupo que no salieron desde que arrancó el bot (bloque Ninjo 2): bloqueados (escucha,
// sin destino, un destino que no es un grupo o que es un cliente) o con error. En memoria, para /salud.
const avisosNoSalidos = { noSalieron: 0, ultimo: null };
function noSalio(motivo) {
  avisosNoSalidos.noSalieron++;
  avisosNoSalidos.ultimo = { hora: new Date().toISOString(), motivo };
}
/** Para /salud: { noSalieron, ultimo: { hora, motivo } | null }. Sin textos ni números. */
function avisosGrupo() {
  return { noSalieron: avisosNoSalidos.noSalieron, ultimo: avisosNoSalidos.ultimo ? { ...avisosNoSalidos.ultimo } : null };
}

/**
 * Aviso al grupo interno del negocio. Sale de AVISOS_HORA_DESDE a _HASTA (9 a 20, Argentina; src/avisos-cola.js):
 * afuera de la franja se encola (estado.json) y sale con los demás cuando abre, en un solo mensaje. Devuelve
 * `{ encolado: true }` (no es `bloqueado`: quien llama lo da por hecho, y sale solo). `inmediato: true` lo manda
 * ahora: las respuestas a un comando que alguien escribió en este momento, el guardián y el estado dañado.
 */
async function avisarGrupo(texto, { inmediato = false } = {}) {
  const motivo = motivoBloqueoAvisos();
  if (motivo) {
    console.log('[aviso bloqueado] ' + motivo);
    noSalio(motivo);
    return { bloqueado: true, motivo };
  }
  if (!config.grupoAvisos) {
    console.log('[aviso — sin destino configurado]\n' + texto);
    noSalio('sin destino configurado');
    return;
  }
  if (destinoEsUnCliente(config.grupoAvisos)) {
    console.error(
      `\n🚨 NO MANDÉ EL AVISO: ${config.grupoAvisos} es un chat de CLIENTE, no el grupo interno.\n` +
        '   Los avisos llevan datos de otros clientes. Revisá GRUPO_AVISOS_JID en el .env.\n' +
        '   Para ver dónde estaría apuntando: npm run destino\n'
    );
    noSalio('el destino es un chat de cliente');
    return;
  }
  if (!inmediato) {
    const cola = require('./avisos-cola');
    if (!cola.enFranja(Date.now())) {
      const esperando = cola.encolar(texto);
      console.log(`[aviso] afuera de la franja de avisos (${config.avisos.horaDesde} a ${config.avisos.horaHasta}): queda en la cola (${esperando})`);
      return { encolado: true };
    }
  }
  try {
    return await enviarTexto(config.grupoAvisos, texto, 0);
  } catch (e) {
    console.error('[evolution] no pude avisar al grupo:', e.message);
    noSalio(`fallo de envio (${errorCorto(e)})`);
    return { bloqueado: true, motivo: 'fallo de envio' };
  }
}

/**
 * Forma de un JID de grupo de WhatsApp: `120363...@g.us`, o el formato viejo
 * `5491100000000-1234567890@g.us`.
 *
 * Se exporta a propósito: la herramienta que informa sobre el destino
 * (`npm run destino`) tiene que preguntar por ESTA regex y no por una copia,
 * porque ya pasó que el comando dijera "es seguro" mientras el envío real
 * quedaba frenado acá.
 */
const RE_GRUPO = /^\d+(?:-\d+)?@g\.us$/;

/**
 * ¿Se le puede escribir a este destino?
 *
 * Con `NUMEROS_PRUEBA` vacía devuelve siempre true y el bot se comporta igual
 * que siempre. Con contenido, solo pasan esos números: es el candado del
 * primer envío real, para probar con un número propio sin que ningún cliente
 * reciba nada.
 *
 * El grupo de avisos nunca se filtra: no es un cliente, y si se filtrara nos
 * quedaríamos sin los borradores justo en la tanda donde más hacen falta.
 *
 * La comparación es por sufijo en las dos direcciones a propósito. Los JID
 * argentinos conviven con y sin el 9 de celular (`549111…` y `54111…`), así
 * que comparar exacto haría que la lista no matchee por un dígito. El costo de
 * un falso negativo es no escribirle a tu propio número de prueba; el de un
 * falso positivo sería escribirle a un cliente, y para eso la lista es
 * explícita y la cargás a mano.
 */
/**
 * Deja un número comparable: sin el país y sin el 9 de celular.
 *
 * En Argentina el 9 va EN EL MEDIO (54 + 9 + area + numero), no al principio
 * ni al final, así que comparar por sufijo no alcanza: `5491100000001` y
 * `541100000001` son la misma persona y no comparten sufijo. Sacando el 54 y
 * el 9 quedan los dos en `1100000001`.
 */
function nucleo(valor) {
  let d = String(valor || '').replace(/\D/g, '');
  if (d.startsWith('54')) d = d.slice(2);
  if (d.startsWith('9')) d = d.slice(1);
  return d;
}

/**
 * ¿El JID está en esta lista de números?
 *
 * Es la comparación que usan TODAS las listas de números del bot (la blanca de
 * prueba y la negra de contactos personales). Una sola, a propósito: dos
 * comparaciones distintas se despegan y un día una lista deja de filtrar.
 */
function estaEnLaLista(jid, lista) {
  if (!lista || !lista.length) return false;
  const n = nucleo(String(jid || '').split('@')[0]);
  if (!n) return false;
  return lista.some((p) => {
    const q = nucleo(p);
    if (!q) return false;
    if (n === q) return true;
    // El sufijo cubre los prefijos raros, pero pide un número reconocible: con
    // dos dígitos sueltos en la lista quedaría habilitado medio mundo, que es
    // justo lo contrario de para qué existen estas listas.
    if (Math.min(n.length, q.length) < 8) return false;
    return n.endsWith(q) || q.endsWith(n);
  });
}

function esDestinoDePrueba(jid) {
  if (jid === config.grupoAvisos) return true;
  // SOLO_CHATS_NUEVOS (28/09/2026; chats viejos, 29/09/2026): un chat viejo no recibe, salvo el tester.
  if (config.soloChatsNuevos && !estaEnLaLista(jid, config.numerosTester) && esChatViejo(jid)) return false;
  // Tester ∪ piloto (Pendientes 1, Parte C): con las dos listas vacías se
  // comporta como siempre y deja pasar a todos.
  if (!config.numerosTester.length && !config.numerosPiloto.length) return true;
  // NUMEROS_PILOTO=todos: en vivo para cualquier chat, con el tester aparte.
  if (config.pilotoTodos) return true;
  return estaEnLaLista(jid, config.numerosTester) || estaEnLaLista(jid, config.numerosPiloto);
}

/**
 * ¿Es un chat viejo, para SOLO_CHATS_NUEVOS? (decisión de Tomás del 29/09/2026). Un chat es nuevo
 * solo si empezó desde cero con el bot mirando y nunca escribió nadie de la cuenta: viejo es el
 * que está en la lista de chats viejos (chats-viejos.js: la semilla con la base de Evolution y
 * la puesta al día de cada arranque) o el que atendió una persona. Mientras la lista no está al
 * día (se está poniendo al día, Evolution no respondió, falta la semilla) todos son viejos: van
 * en borrador. Sin arrancar (pruebas, evaluar) la lista está vacía y queda lo de siempre.
 */
function esChatViejo(jid) {
  if (!chatsViejos.listo()) return true;
  return estaEnLaLista(jid, chatsViejos.numeros()) || loAtendioUnaPersona(jid);
}

/**
 * ¿Alguna vez escribió alguien de la cuenta en este chat? Lo mismo que mira el seguimiento
 * (index.js): `ultimoHumano`, o una línea `humano: true` del historial, que sobrevive a
 * `#sigue`. state se pide acá adentro, como más arriba, para no cargarlo al requerir esto.
 */
function loAtendioUnaPersona(jid) {
  if (!jid || !String(jid).endsWith('@s.whatsapp.net')) return false;
  const s = require('./state').obtener(jid);
  return Boolean(s.ultimoHumano) || (s.historial || []).some((m) => m.humano);
}

/**
 * ¿Lo que el bot decida para este chat le llega al cliente? Es la única definición
 * de "en vivo" (Pendientes 1, Parte A): ni en escucha, ni en borrador, ni fuera de
 * las listas de prueba. index.js la usa para saber si escala y anota el lead, y
 * responder.js para saber si el hilo puede apoyarse en `modeloPropuesto` (solo
 * cuando el cliente no recibe nada).
 */
function leLlegaAlCliente(chatId) {
  return !config.modoEscucha && !config.modoBorrador && esDestinoDePrueba(chatId);
}

// Para loguear el fallo del "escribiendo…" una sola vez por racha, y no en cada mensaje.
let escribiendoFallando = false;

/**
 * Muestra "escribiendo…" en el chat durante `ms` (Pendientes 1, D2). Antes el
 * "escribiendo…" era el `delay` del envío: Evolution retenía el mensaje ese rato,
 * y un #reset, un #pausa o una persona que entraba no lo frenaban, porque el bot ya
 * había pasado el control. Ahora la espera la hace el bot (index.js: presencia,
 * espera, control y recién ahí el envío con delay 0).
 *
 * Pasa por las mismas guardas que el resto (lista de prueba, modo escucha). Es
 * cosmético: si falla, se loguea y NO rompe el envío. Nunca tira.
 */
async function mostrarEscribiendo(numero, ms) {
  if (!esDestinoDePrueba(numero)) return { bloqueado: true, motivo: 'fuera de la lista de prueba' };
  if (apagadaPara(numero)) return APAGADA;
  if (esContactoPersonal(numero)) return CONTACTO;
  try {
    const r = await pedir(`/chat/sendPresence/${config.evolution.instancia}`, {
      number: numero,
      presence: 'composing',
      delay: ms,
    });
    escribiendoFallando = false;
    return r;
  } catch (e) {
    if (!escribiendoFallando) {
      console.error(`[escribiendo] no pude mostrar "escribiendo…" (${e.message}); es cosmético, los envíos siguen igual`);
    }
    escribiendoFallando = true;
    return { bloqueado: true, motivo: 'fallo al mostrar escribiendo' };
  }
}

/**
 * ¿Es un contacto personal? (CONTACTOS_PERSONALES, o excluido con #excluir)
 *
 * Un chat así se ignora ENTERO y lo más temprano posible: no se procesa, no se
 * guarda en estado.json, no va a Gemini, no se le transcriben los audios, no
 * aparece en el resumen y nunca se le contesta. La familia y los amigos
 * escriben al mismo número que los clientes; el bot no tiene por qué leerlos.
 *
 * El grupo de avisos nunca cuenta como personal, pase lo que pase.
 */
function esContactoPersonal(jid) {
  return motivoContactoPersonal(jid) !== null;
}

/**
 * Por qué se ignora entero este chat: 'CONTACTOS_PERSONALES' (la lista del .env), 'excluido' (#excluir, la
 * lista del estado: src/excluidos.js, 29/10/2026) o null. Las dos comparan como todas las listas de números
 * (`estaEnLaLista`). Sirve para decirlo bien en el grupo: lo del .env no se saca por comando.
 */
function motivoContactoPersonal(jid) {
  if (!jid) return null;
  if (jid === config.grupoAvisos) return null;
  if (estaEnLaLista(jid, config.contactosPersonales)) return 'CONTACTOS_PERSONALES';
  // state se pide acá adentro, como más arriba, para no cargarlo al requerir esto.
  if (estaEnLaLista(jid, require('./state').numerosExcluidos())) return 'excluido';
  return null;
}

function motivoBloqueoAvisos() {
  if (config.modoEscucha) return 'modo escucha';
  if (!config.grupoAvisos) return 'sin destino configurado';
  // Un número desconocido no demuestra que sea interno. Solo se admiten grupos.
  if (!RE_GRUPO.test(config.grupoAvisos)) return 'el destino no es un grupo de WhatsApp';
  return '';
}

module.exports = {
  rutaAdentro,
  enviarGenerado,
  enviarTexto,
  enviarImagen,
  enviarDocumento,
  mostrarEscribiendo,
  avisarGrupo,
  avisosGrupo,
  errorCorto,
  estadoInstancia,
  estadoDeLaInstancia,
  buscarMensajes,
  buscarMensajesDeChat,
  destinoEsUnCliente,
  motivoBloqueoAvisos,
  esDestinoDePrueba,
  leLlegaAlCliente,
  esContactoPersonal,
  motivoContactoPersonal,
  estaEnLaLista,
  base64DeMedia,
  RE_GRUPO,
};
