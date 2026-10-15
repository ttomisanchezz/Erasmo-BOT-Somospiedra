'use strict';
/**
 * El interruptor general de Chiara (panel Chiara, 06/10/2026; diseño cerrado por Tomás el 05/10 en el
 * Cortex: areas/ventas-mensajes/panel-chiara.md).
 *
 * Se apaga y se prende desde el panel de la app de ventas (bot_ordenes: 'apagar' / 'prender'; lo aplica
 * src/panel-chiara.js). Apagada, Chiara no le contesta a NINGÚN cliente y no llama a Sonnet ni a Gemini:
 *   - index.js: la tanda no se interpreta (atenderTanda), ni el seguimiento ni el barrido del silencio;
 *   - sombra-persona.js: no piensa en sombra;
 *   - evolution.js: ningún envío a un cliente sale (texto, foto, PDF, "escribiendo…"), como segunda traba.
 * Igual lee: cada mensaje entra al historial y al registro de aprendizaje, se cuenta y se reporta al
 * panel, y los avisos al grupo, el resumen y los comandos siguen. Lo que escribieron mientras estaba
 * apagada no se contesta solo al prenderla.
 *
 * Queda en disco (`data/interruptor.json`, escritura atómica como estado.json): un reinicio no la prende.
 * Sin archivo, prendida. Si el archivo existe y no se puede leer (bloqueado por un antivirus, dañado),
 * queda APAGADA por las dudas y se vuelve a intentar en cada consulta; `problema()` dice por qué (el panel
 * lo avisa al grupo) y prenderla desde el panel escribe el archivo de nuevo.
 * Respaldo del panel (decisión de Tomás del 06/10/2026): `#apagar` y `#prender` escritos por la cuenta en el
 * grupo interno hacen lo mismo que el botón (`comando` y `desdeGrupo`; los llama index.js), y también arreglan
 * un archivo ilegible. Sin app ni grupo: borrar el archivo y reiniciar el bot. En las pruebas va al lado del ESTADO_PATH temporal (o en INTERRUPTOR_PATH).
 * No requiere nada del bot: lo usa evolution.js.
 */
const fs = require('fs');
const path = require('path');

const REINTENTOS_RENAME = 5;

function ruta() {
  if (process.env.INTERRUPTOR_PATH) return process.env.INTERRUPTOR_PATH;
  if (process.env.ESTADO_PATH) return path.join(path.dirname(process.env.ESTADO_PATH), 'interruptor.json');
  return path.join(__dirname, '..', 'data', 'interruptor.json');
}

let actual = null; // { prendida, cambio, por }
let problemaLectura = null;

function dormirSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function leer() {
  if (actual) return actual;
  let error = null;
  for (let i = 0; i < 3; i++) {
    try {
      const o = JSON.parse(fs.readFileSync(ruta(), 'utf8'));
      if (!o || typeof o !== 'object') throw new Error('no tiene la forma esperada');
      actual = { prendida: o.prendida !== false, cambio: Number(o.cambio) || null, por: o.por || null };
      problemaLectura = null;
      return actual;
    } catch (e) {
      if (e.code === 'ENOENT') {
        actual = { prendida: true, cambio: null, por: null };
        problemaLectura = null;
        return actual;
      }
      error = e;
      if (!['EBUSY', 'EPERM', 'EACCES'].includes(e.code)) break;
      dormirSync(50);
    }
  }
  // No se pudo leer: apagada por las dudas, sin guardarlo en memoria (la próxima consulta vuelve a leer).
  if (!problemaLectura) {
    console.error(`[interruptor] no pude leer ${ruta()} (${error.message}): Chiara queda APAGADA hasta poder leerlo o que la prendan desde el panel`);
  }
  problemaLectura = error.message;
  return { prendida: false, cambio: null, por: 'archivo ilegible' };
}

/** Por qué no se pudo leer el archivo (y por eso está apagada), o null. */
function problema() {
  if (!actual) leer();
  return problemaLectura;
}

function escribir(datos) {
  const archivo = ruta();
  const tmp = archivo + '.tmp';
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(datos, null, 2));
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, archivo);
      return;
    } catch (e) {
      const pasajero = e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES';
      if (!pasajero || i >= REINTENTOS_RENAME) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ya no está */
        }
        throw e;
      }
      dormirSync(100 * (i + 1));
    }
  }
}

/** ¿Está prendida? Sin archivo, sí. */
function prendida() {
  return leer().prendida;
}

/**
 * La prende (true) o la apaga (false). Devuelve true si cambió. Si no se puede escribir el archivo, el
 * cambio vale igual hasta el próximo reinicio y queda el error en la consola.
 */
function poner(valor, por = 'panel', ahora = Date.now()) {
  const antes = leer();
  if (antes.prendida === Boolean(valor) && !problemaLectura) return false;
  actual = { prendida: Boolean(valor), cambio: ahora, por };
  problemaLectura = null;
  try {
    escribir(actual);
  } catch (e) {
    console.error(`[interruptor] no pude guardar que Chiara quedó ${valor ? 'prendida' : 'apagada'} (${e.message}): vale hasta el próximo reinicio`);
  }
  console.log(`[interruptor] Chiara ${valor ? 'PRENDIDA' : 'APAGADA'} (${por})`);
  return true;
}

// ------------------------------------------------------------ #apagar / #prender desde el grupo

const TEXTO_APAGADA_GRUPO =
  '⏸️ Chiara APAGADA desde el grupo: no le contesta a ningún cliente hasta que la prendan (#prender o el panel). Sigue leyendo y anotando.';
const TEXTO_PRENDIDA_GRUPO =
  '▶️ Chiara PRENDIDA desde el grupo: vuelve a contestar. Lo que escribieron mientras estaba apagada no lo contesta sola ' +
  '(los chats que atendía una persona siguen como siempre: al vencer su silencio).';

/**
 * ¿El mensaje es #apagar o #prender? Como los demás comandos, solo al principio del mensaje. Devuelve
 * { tipo: 'apagar' | 'prender', resto } o null. "#apagado", "#prenderla" y parecidos no son el comando.
 */
function comando(texto) {
  const m = String(texto || '').trim().match(/^#(apagar|prender)(?![\p{L}\p{N}_])([\s\S]*)$/iu);
  return m ? { tipo: m[1].toLowerCase(), resto: m[2].trim() } : null;
}

/**
 * Aplica un #apagar / #prender del grupo. Devuelve { tipo, cambio, aviso } (aviso: lo que se le contesta al
 * grupo). Con algo después ("#apagar 549…") no hace nada y explica: es para todos los chats; uno solo se
 * frena con #pausa.
 */
function desdeGrupo({ tipo, resto }, ahora = Date.now()) {
  if (resto && !/^chiara$/i.test(resto)) {
    return {
      tipo,
      cambio: false,
      aviso: `❓ #${tipo} va solo, sin nada atrás: ${tipo === 'apagar' ? 'apaga' : 'prende'} a Chiara para TODOS los chats. No cambié nada. Para un chat solo: #pausa <número> / #sigue <número>.`,
    };
  }
  const prender = tipo === 'prender';
  const cambio = poner(prender, 'grupo', ahora);
  if (!cambio) {
    return { tipo, cambio, aviso: `ℹ️ Chiara ya estaba ${prender ? 'prendida' : 'APAGADA'}: no cambié nada.` };
  }
  return { tipo, cambio, aviso: prender ? TEXTO_PRENDIDA_GRUPO : TEXTO_APAGADA_GRUPO };
}

/** Lo que muestra /salud. */
function resumen() {
  const a = leer();
  return { prendida: a.prendida, desde: a.cambio ? new Date(a.cambio).toISOString() : null, por: a.por, problema: problemaLectura };
}

module.exports = {
  prendida,
  poner,
  resumen,
  problema,
  ruta,
  comando,
  desdeGrupo,
  // para las pruebas: vuelve a leer el archivo
  _olvidar() {
    actual = null;
    problemaLectura = null;
  },
};
