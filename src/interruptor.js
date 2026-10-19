'use strict';
/**
 * El interruptor general del bot (nació con el panel de iPhone el 06/10/2026; en Piedra queda solo el
 * local, sin panel: poda del 19/10/2026). `#apagar` y `#prender`, escritos por la cuenta en el grupo
 * interno (`comando` y `desdeGrupo`; los llama index.js). Apagado, el bot no le contesta a NINGÚN
 * cliente y no llama a Sonnet ni a Gemini:
 *   - index.js: la tanda no se interpreta (atenderTanda), ni el barrido del silencio, ni #sigue;
 *   - sombra-persona.js: no piensa en sombra;
 *   - evolution.js: ningún envío a un cliente sale (texto, foto, documento, "escribiendo…"), como segunda traba.
 * Igual lee: cada mensaje entra al historial y al registro de aprendizaje, y los avisos al grupo y los
 * comandos siguen. Lo que escribieron mientras estaba apagado no se contesta solo al prenderlo.
 *
 * Queda en disco (`data/interruptor.json`, escritura atómica como estado.json): un reinicio no lo prende.
 * Sin archivo, prendido. Si el archivo existe y no se puede leer (bloqueado por un antivirus, dañado),
 * queda APAGADO por las dudas y se vuelve a intentar en cada consulta; `problema()` dice por qué, y
 * `#prender` escribe el archivo de nuevo. Sin grupo: borrar el archivo y reiniciar el bot. En las pruebas
 * va al lado del ESTADO_PATH temporal (o en INTERRUPTOR_PATH). No requiere nada del bot: lo usa evolution.js.
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
    console.error(`[interruptor] no pude leer ${ruta()} (${error.message}): el bot queda APAGADO hasta poder leerlo o que lo prendan con #prender`);
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
function poner(valor, por = 'grupo', ahora = Date.now()) {
  const antes = leer();
  if (antes.prendida === Boolean(valor) && !problemaLectura) return false;
  actual = { prendida: Boolean(valor), cambio: ahora, por };
  problemaLectura = null;
  try {
    escribir(actual);
  } catch (e) {
    console.error(`[interruptor] no pude guardar que el bot quedó ${valor ? 'prendido' : 'apagado'} (${e.message}): vale hasta el próximo reinicio`);
  }
  console.log(`[interruptor] bot ${valor ? 'PRENDIDO' : 'APAGADO'} (${por})`);
  return true;
}

// ------------------------------------------------------------ #apagar / #prender desde el grupo

const TEXTO_APAGADA_GRUPO =
  '⏸️ Bot APAGADO desde el grupo: no le contesta a ningún cliente hasta #prender. Sigue leyendo y anotando.';
const TEXTO_PRENDIDA_GRUPO =
  '▶️ Bot PRENDIDO desde el grupo: vuelve a contestar. Lo que escribieron mientras estaba apagado no lo contesta solo ' +
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
  if (resto && !/^bot$/i.test(resto)) {
    return {
      tipo,
      cambio: false,
      aviso: `❓ #${tipo} va solo, sin nada atrás: ${tipo === 'apagar' ? 'apaga' : 'prende'} el bot para TODOS los chats. No cambié nada. Para un chat solo: #pausa <número> / #sigue <número>.`,
    };
  }
  const prender = tipo === 'prender';
  const cambio = poner(prender, 'grupo', ahora);
  if (!cambio) {
    return { tipo, cambio, aviso: `ℹ️ El bot ya estaba ${prender ? 'prendido' : 'APAGADO'}: no cambié nada.` };
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
