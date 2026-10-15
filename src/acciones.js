'use strict';
/**
 * Acciones que no son texto: mandar una foto o un documento.
 *
 * Auditoría del 15/09/2026 (A2). Antes una foto o un PDF viajaban entre los
 * mensajes como texto con forma de marcador ("[foto:ruta]", "[doc:ruta|pie]") e
 * index.js los mandaba como archivo. Un texto redactado por Gemini con esa forma
 * también se habría mandado, con cualquier archivo de la PC. Ahora:
 *  - una acción es un objeto, y solo lo arma el código (responder.js);
 *  - un string se manda SIEMPRE como texto, aunque tenga corchetes;
 *  - la foto se busca por modelo en la carpeta de fotos y el documento por id en
 *    documentos.js: nunca una ruta que venga de un texto;
 *  - evolution.js igual se niega a mandar un archivo fuera de esas carpetas.
 */
const documentos = require('./documentos');

/** La foto de un modelo ("iPhone 13"). La ruta la resuelve fotos.buscar al mandarla. */
function foto(modelo) {
  return { tipo: 'foto', id: String(modelo) };
}

/** Un documento del catálogo de documentos.js ("compromiso"), con el texto que va de pie. */
function doc(id, pie = '') {
  return { tipo: 'doc', id, pie };
}

/**
 * La foto de un equipo del local (08/10/2026, decisión de Tomás: Chiara manda fotos como Fran), con su pie
 * ("15 128gb 87% 740.000"). `archivo` es la entrada del índice de fotos-equipos.js (la ruta relativa a la
 * carpeta de fotos): la ruta de verdad la resuelve fotos-equipos.rutaDe al mandarla, solo si está en el
 * índice. `codigo` es el de la unidad en la app (el ID de USADOS), para leerla donde solo va texto.
 */
function fotoEquipo({ archivo, pie = '', codigo = '' }) {
  return { tipo: 'foto-equipo', archivo: String(archivo), pie: String(pie == null ? '' : pie), codigo: String(codigo == null ? '' : codigo) };
}

/**
 * Un texto que, cuando SALE, confirma marcas de "ya se dijo" (auditoría A4,
 * bloque 3). Un mensaje suelto sigue siendo un string; solo los que justifican
 * una marca pasan a ser `{ tipo: 'texto', texto, marcas }`.
 */
function conMarcas(m, marcas) {
  if (!marcas || !Object.keys(marcas).length) return m;
  if (esObjeto(m)) return { ...m, marcas: { ...(m.marcas || {}), ...marcas } };
  return { tipo: 'texto', texto: String(m == null ? '' : m), marcas };
}

const esObjeto = (m) => Boolean(m) && typeof m === 'object';
const esFoto = (m) => esObjeto(m) && m.tipo === 'foto';
const esFotoEquipo = (m) => esObjeto(m) && m.tipo === 'foto-equipo';
const esDoc = (m) => esObjeto(m) && m.tipo === 'doc';
const esTexto = (m) => esObjeto(m) && m.tipo === 'texto';
/** Una acción es lo que NO es texto: la foto (del catálogo o de un equipo) y el documento. */
const esAccion = (m) => esFoto(m) || esFotoEquipo(m) || esDoc(m);
/** Las marcas que confirma este mensaje al salir, o null. */
const marcasDe = (m) => (esObjeto(m) && m.marcas ? m.marcas : null);

/**
 * Cómo se lee un mensaje donde solo va texto: el borrador al grupo, los logs,
 * `ultimaPropuestaBot`, la propuesta del registro de aprendizaje, evaluar, guion, chatear
 * y el simulador.
 * "[foto: iPhone 13]", "[foto: 15-128-001] 15 128gb 87% 740.000" (la de un equipo, con su código y su pie)
 * y "[doc: compromiso de pago] <pie>". Nunca la ruta.
 */
function comoTexto(m) {
  if (esFoto(m)) return `[foto: ${m.id}]`;
  if (esFotoEquipo(m)) return `[foto: ${m.codigo || m.archivo}]${m.pie ? ' ' + m.pie : ''}`;
  if (esDoc(m)) return `[doc: ${documentos.nombre(m.id)}]${m.pie ? ' ' + m.pie : ''}`;
  if (esTexto(m)) return m.texto;
  return typeof m === 'string' ? m : '';
}

/**
 * Lo que queda en el historial cuando sale: lo mismo que ve el cliente. La foto de un equipo queda como
 * "[foto] 15 128gb 87% 740.000": en la vuelta siguiente Sonnet sabe qué foto le mandó y de qué equipo.
 */
function paraHistorial(m) {
  if (esFoto(m)) return '[foto]';
  if (esFotoEquipo(m)) return `[foto]${m.pie ? ' ' + m.pie : ''}`;
  if (esDoc(m)) return m.pie || '[documento]';
  return comoTexto(m);
}

/** ¿Un texto libre (lo que redacta Gemini) tiene forma de marcador de acción? */
function pareceMarcador(texto) {
  return /\[\s*(doc|foto)\s*:/i.test(String(texto || ''));
}

module.exports = {
  foto,
  fotoEquipo,
  doc,
  conMarcas,
  marcasDe,
  esFoto,
  esFotoEquipo,
  esDoc,
  esTexto,
  esAccion,
  comoTexto,
  paraHistorial,
  pareceMarcador,
};
