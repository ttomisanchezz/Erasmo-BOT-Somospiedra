'use strict';
/**
 * Los ejemplos aprobados (bloque 7, decisiones de Tomás del 23/09/2026): el archivo
 * `test/ejemplos-aprobados.json` y cómo un ejemplo `buena` se vuelve un caso de
 * `npm run evaluar`.
 *
 * No carga el bot: lo usan `npm run aprobar` (que sin --fijar no puede cargar state.js
 * ni responder.js) y `npm run evaluar`.
 *
 * El archivo es una lista, con sangría de 2 espacios, en el orden en que se decidió. Va
 * en git: no lleva datos personales (`aprobar` limpia el texto y no deja aprobar uno con
 * un número de 8 cifras o más, o una @).
 */
const fs = require('fs');
const path = require('path');

const RUTA = path.join(__dirname, 'ejemplos-aprobados.json');

/** La lista del archivo. Si no existe, vacía; si no se puede leer o no es una lista, tira. */
function leer(ruta = RUTA) {
  let texto;
  try {
    texto = fs.readFileSync(ruta, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return [];
    throw e;
  }
  const lista = JSON.parse(texto);
  if (!Array.isArray(lista)) throw new Error('no es una lista');
  return lista;
}

/** Guarda la lista entera: archivo temporal y rename, así un corte no la deja por la mitad. */
function guardar(ruta, lista) {
  const tmp = `${ruta}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(lista, null, 2) + '\n');
  try {
    fs.renameSync(tmp, ruta);
  } catch (e) {
    try {
      fs.unlinkSync(tmp);
    } catch {
      // no quedó nada
    }
    throw e;
  }
}

/**
 * Un ejemplo `buena` como caso de `evaluar`. Los turnos son los items del contexto
 * (`{ cliente }`, `{ humano }`, `{ tanda, enviado }`, ver test/correr-caso.js) y después
 * el turno final: lo que escribió el cliente, sin los límites, y lo que pide la acción.
 * El caso mira si da precio o no (`conPrecio`), nunca el monto: ese lo calcula el
 * cotizador, como siempre.
 */
function comoCaso(ejemplo) {
  const { situacion = {} } = ejemplo;
  const final = { c: (situacion.cliente || []).join('\n'), noContiene: ejemplo.limites || [] };
  // Lo que tiene que decir sí o sí (24/09/2026). Sin nada, no se pide nada.
  if (ejemplo.debeDecir && ejemplo.debeDecir.length) final.contiene = ejemplo.debeDecir;
  if (ejemplo.accion === 'contesta') final.conPrecio = ejemplo.conPrecio;
  else if (ejemplo.accion === 'escala-callado') final.silencio = true;
  else if (ejemplo.accion === 'nada') final.mudo = true;
  return {
    nombre: `aprobado ${ejemplo.id}`,
    turnos: [...(situacion.contexto || []).map((item) => ({ ...item })), final],
  };
}

module.exports = { RUTA, leer, guardar, comoCaso };
