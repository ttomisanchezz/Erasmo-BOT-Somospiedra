'use strict';
/**
 * Busca la foto de un modelo en la carpeta configurada.
 * Los archivos se nombran por modelo, sin la palabra iPhone:
 *   13.jpg   13-pro.jpg   14 pro max.png   15_pro.jpeg
 * Si no hay carpeta o no hay archivo, devuelve null y el bot no menciona fotos.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const EXTENSIONES = ['.jpg', '.jpeg', '.png', '.webp'];

function clave(txt) {
  return String(txt || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/iphone/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

let cache = null;

function indice() {
  if (cache) return cache;
  cache = new Map();
  try {
    for (const archivo of fs.readdirSync(config.fotosDir)) {
      const ext = path.extname(archivo).toLowerCase();
      if (!EXTENSIONES.includes(ext)) continue;
      const k = clave(path.basename(archivo, ext));
      if (k && !cache.has(k)) cache.set(k, path.join(config.fotosDir, archivo));
    }
  } catch {
    // No hay carpeta todavía: se trabaja sin fotos, sin romper nada.
  }
  return cache;
}

/** Vacía el índice, para cuando se agregan fotos con el bot andando. */
function recargar() {
  cache = null;
}

function buscar(modelo) {
  const k = clave(modelo);
  if (!k) return null;
  return indice().get(k) || null;
}

function hayFotos() {
  return indice().size > 0;
}

/** La carpeta de las fotos, absoluta: evolution.js no manda una imagen de afuera. */
function carpeta() {
  return path.resolve(config.fotosDir);
}

module.exports = { buscar, hayFotos, recargar, carpeta };
