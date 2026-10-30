'use strict';
/**
 * Archivos que genera el propio bot (29/10/2026, spec del simulador §8): la imagen del simulador de piedra y
 * el presupuesto en PDF. Es la única excepción al candado de archivos de evolution.js, y es acotada.
 *
 * CONTRATO
 *  - El generador escribe un archivo NUEVO y lo registra enseguida (`registrar`, dentro de los 10 min de su mtime)
 *    para UN chat. Los mismos bytes nunca van a dos chats: un archivo para todos va por el catálogo.
 *  - El dueño se ata al CONTENIDO, no a la ruta ni al inodo: el registro (estado.json, bajo la clave interna;
 *    sobrevive a un reinicio y #reset no lo toca) se indexa por el sha256 del contenido: { <sha256>: { chatId,
 *    ts, ruta } } (`ruta` es solo informativa, para los logs). Renombrar, mover, cambiar mayúsculas, hacer un
 *    enlace duro, copiar el archivo (otro inodo, mismo contenido), o que A vuelva a registrar el mismo nombre
 *    con otro archivo: nada de eso le da a B el archivo de A, porque el hash es el mismo.
 *  - Se manda solo al chat registrado (el JID exacto) y por 24 h desde el registro (con 5 min de margen por el
 *    reloj). Los bytes que se verifican son los que se mandan: `leer` abre el archivo UNA vez, calcula el hash
 *    de ESOS bytes y exige que figure en el registro para ese chat; no hay carrera entre revisar y leer.
 *  - Los hashes se guardan 7 días (la poda saca lo más viejo con cada registración): así un archivo viejo al que
 *    le cambian la fecha tampoco se registra para otro chat dentro de esa semana.
 *  - Los archivos del disco no se borran nunca (spec §12.4, decide Tomás).
 *  - Lo que `revisar` mira sin leer: chat de una persona (`<número>@s.whatsapp.net`, nunca el grupo de avisos),
 *    adentro de GENERADOS_DIR (la misma resolución que el candado del catálogo, `rutaAdentro`: `..`, enlaces,
 *    mayúsculas EXACTAS, separadores), con la extensión de su tipo, un solo nombre (sin otro enlace duro ni flujo
 *    ':' de NTFS) y hasta 5 MB.
 *  RIESGO ACEPTADO (escrito a propósito): alguien con acceso al disco que le cambie la fecha (utimes) a un archivo
 *  de más de 7 días para registrarlo para otro chat, o un generador que escriba el contenido de A con otros bytes
 *  para B. Eso ningún candado de rutas lo puede ver.
 *
 * Nada de esto se expone a Sonnet todavía: no hay herramienta y una ruta nunca sale de un texto. state se pide
 * adentro de cada función, para no cargar las conversaciones al requerir el módulo.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { rutaAdentro } = require('./evolution');

const VIGENCIA_MS = 24 * 60 * 60 * 1000;
const GUARDADO_MS = 7 * 24 * 60 * 60 * 1000;
const MARGEN_RELOJ_MS = 5 * 60 * 1000;
const RECIEN_GENERADO_MS = 10 * 60 * 1000;
const TOPE_BYTES = 5 * 1024 * 1024;
const EXTENSIONES = { imagen: ['.jpg', '.jpeg', '.png', '.webp'], pdf: ['.pdf'] };
// Solo el chat de una persona: ni grupos (apagadaPara los deja pasar), ni status@broadcast, ni @lid, ni un número pelado.
const RE_CHAT = /^\d+@s\.whatsapp\.net$/;

function carpeta() {
  return path.resolve(config.generadosDir);
}

function chatValido(chatId) {
  return typeof chatId === 'string' && RE_CHAT.test(chatId) && chatId !== config.grupoAvisos;
}

/** La ruta relativa a la carpeta (con '/'), tal cual está en el disco: solo informativa, ya no es la clave del registro. */
function clave(real) {
  const raiz = fs.realpathSync.native(carpeta());
  return path.relative(raiz, real).split(path.sep).join('/');
}

/**
 * Lo común a registrar y revisar sobre el archivo real, sin leer el contenido: es un archivo, su ruta no lleva ':'
 * (un flujo alternativo de NTFS, 'Foto.jpg:oculto.jpg'), tiene un solo nombre (un hard link adentro podría apuntar
 * a un archivo de afuera) y pesa hasta 5 MB. Devuelve { ruta } (la relativa) o { motivo }.
 */
function mirarArchivo(real) {
  let datos;
  try { datos = fs.statSync(real, { bigint: true }); } catch { return { motivo: 'no es un archivo' }; }
  if (!datos.isFile()) return { motivo: 'no es un archivo' };
  const ruta = clave(real);
  if (ruta.includes(':')) return { motivo: 'nombre no permitido' };
  if (datos.nlink > 1n) return { motivo: 'tiene otro enlace' };
  if (datos.size > BigInt(TOPE_BYTES)) return { motivo: 'pesa más de 5 MB' };
  return { datos, ruta };
}

/**
 * Abre el archivo UNA vez y lee su contenido (hasta TOPE_BYTES + 1 bytes: si pasa el tope, se rechaza). Devuelve
 * { ok, buffer, hash (sha256 hex de ESOS bytes) } o { ok: false, motivo }.
 */
function leerContenido(real) {
  let fd;
  try {
    fd = fs.openSync(real, 'r');
    if (!fs.fstatSync(fd).isFile()) return { ok: false, motivo: 'no es un archivo' };
    const buffer = Buffer.alloc(TOPE_BYTES + 1);
    let leidos = 0;
    while (leidos < buffer.length) {
      const n = fs.readSync(fd, buffer, leidos, buffer.length - leidos, leidos);
      if (n === 0) break;
      leidos += n;
    }
    if (leidos > TOPE_BYTES) return { ok: false, motivo: 'pesa más de 5 MB' };
    const contenido = buffer.subarray(0, leidos);
    return { ok: true, buffer: contenido, hash: crypto.createHash('sha256').update(contenido).digest('hex') };
  } catch {
    return { ok: false, motivo: 'no se pudo leer el archivo' };
  } finally {
    if (fd !== undefined) { try { fs.closeSync(fd); } catch { /* ya está cerrado */ } }
  }
}

/** Saca del registro las entradas de hace más de 7 días (o con una fecha ilegible). */
function podar(state, registro) {
  const ahora = Date.now();
  const viejas = Object.keys(registro).filter((k) => {
    const ts = registro[k] && typeof registro[k] === 'object' ? Number(registro[k].ts) : NaN;
    return !Number.isFinite(ts) || ahora - ts > GUARDADO_MS;
  });
  if (viejas.length) state.borrarGenerados(viejas);
}

/**
 * Registra un archivo recién generado para UN chat. Guarda al instante para sobrevivir a un reinicio. Devuelve
 * { registrado: true, clave: <sha256> } o { registrado: false, motivo }.
 */
function registrar(chatId, ruta) {
  const rechazar = (motivo) => ({ registrado: false, motivo });
  if (!chatValido(chatId)) return rechazar('chat inválido');
  fs.mkdirSync(carpeta(), { recursive: true });
  const real = rutaAdentro(ruta, carpeta());
  if (!real) return rechazar('fuera de la carpeta de generados');
  const ext = path.extname(real).toLowerCase();
  if (![...EXTENSIONES.imagen, ...EXTENSIONES.pdf].includes(ext)) return rechazar('extensión no permitida');
  const visto = mirarArchivo(real);
  if (visto.motivo) return rechazar(visto.motivo);
  // Solo lo recién generado, medido contra el reloj REAL: con el registro perdido, un archivo viejo no se puede
  // registrar a nombre de nadie. Un mtime del futuro tampoco vale.
  const edadArchivo = Date.now() - Number(visto.datos.mtimeNs / 1000000n);
  if (edadArchivo > RECIEN_GENERADO_MS) return rechazar('no es un archivo recién generado');
  if (edadArchivo < -MARGEN_RELOJ_MS) return rechazar('fecha del archivo inválida');
  const lectura = leerContenido(real);
  if (!lectura.ok) return rechazar(lectura.motivo);
  const state = require('./state');
  const registro = state.generados();
  podar(state, registro);
  const hash = lectura.hash;
  if (Object.hasOwn(registro, hash) && registro[hash].chatId !== chatId) return rechazar('registrado para otro chat');
  state.guardarGenerado(hash, { chatId, ts: Date.now(), ruta: visto.ruta });
  return { registrado: true, clave: hash };
}

/** Las comprobaciones baratas, sin leer el contenido. Devuelve { ok, real, ext } o { ok: false, motivo }. */
function revisar(chatId, ruta, tipo) {
  const rechazar = (motivo) => ({ ok: false, motivo });
  if (!chatValido(chatId)) return rechazar('chat inválido'); // lo primero, antes que la ruta
  if (tipo !== 'imagen' && tipo !== 'pdf') return rechazar('tipo desconocido');
  const real = rutaAdentro(ruta, carpeta());
  if (!real) return rechazar('fuera de la carpeta de generados');
  const ext = path.extname(real).toLowerCase();
  if (!EXTENSIONES[tipo].includes(ext)) return rechazar(`extensión no permitida para ${tipo}`);
  const visto = mirarArchivo(real);
  if (visto.motivo) return rechazar(visto.motivo);
  return { ok: true, real, ext };
}

/**
 * Lee el contenido de lo que se revisó (UNA sola apertura) y exige que el sha256 de ESOS bytes esté registrado
 * para este chat y vigente. Devuelve { ok, buffer } o { ok: false, motivo }: los bytes que se verifican son los
 * que se mandan.
 */
function leer(chatId, revision) {
  const lectura = leerContenido(revision.real);
  if (!lectura.ok) return lectura;
  const registro = require('./state').generados();
  const entrada = Object.hasOwn(registro, lectura.hash) ? registro[lectura.hash] : null;
  if (!entrada || typeof entrada !== 'object') return { ok: false, motivo: 'no está registrado' };
  if (entrada.chatId !== chatId) return { ok: false, motivo: 'registrado para otro chat' };
  // Sin una fecha legible no se sabe desde cuándo vale: cuenta como vencido. Una fecha del futuro (más allá de
  // los 5 minutos de margen por el reloj) no es de un registro de verdad.
  const edad = Date.now() - Number(entrada.ts);
  if (!(edad < VIGENCIA_MS)) return { ok: false, motivo: 'vencido (más de 24 h)' };
  if (edad < -MARGEN_RELOJ_MS) return { ok: false, motivo: 'fecha de registro inválida' };
  return { ok: true, buffer: lectura.buffer };
}

module.exports = { carpeta, clave, registrar, revisar, leer, VIGENCIA_MS, TOPE_BYTES, EXTENSIONES };
