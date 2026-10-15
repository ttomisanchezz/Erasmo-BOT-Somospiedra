'use strict';
/**
 * Correr un caso del banco: lo que hacen `npm run evaluar` y `npm run aprobar -- --fijar`
 * (bloque 7). Estaba dentro de test/evaluar.js; se sacó para que los dos corran un caso
 * exactamente igual.
 *
 * Carga el bot (state.js, responder.js): quien lo requiera tiene que haber fijado antes
 * ESTADO_PATH y APRENDIZAJE_PATH temporales, como evaluar.
 *
 * Un caso es { nombre, turnos, planilla?, pushName?, fotos? } (`fotos`, bloque 8: los
 * modelos que tienen foto en ese caso; ver `fotosDelCaso`). Cada turno es uno de:
 *   { c, ...chequeos }   el cliente escribe; el bot contesta y se revisa (es un turno);
 *   { humano }           una persona escribió en el chat: entra al historial como vendedor;
 *   { cliente }          una línea del cliente que ya había llegado (el contexto de un
 *                        ejemplo aprobado): entra al historial, no llama a decidir y no se
 *                        revisa;
 *   { tanda, enviado }   el bot interpretó esas líneas, que ya están en el historial: llama
 *                        a decidir con ellas juntas, no revisa nada y no cuenta como turno.
 *                        Con `enviado`, lo que dijo va al historial y confirma sus marcas,
 *                        como un turno.
 *   { pasanHoras }       (bloque 9) el reloj del chat se corre esas horas para atrás: todo
 *                        lo que tenía fecha pasó antes. `{ pasanHoras: 24 }` es "ayer".
 *   { reset }            (bloque 9) el #reset: el chat queda como nuevo (`state.reiniciar`).
 *   { vendido }          (28/09/2026) el chat está marcado con #vendido, como lo anota ventas.js.
 * Los chequeos de un turno están en `revisarTurno`, y encima valen las reglas globales.
 */
const sheets = require('../src/sheets');
const state = require('../src/state');
const gemini = require('../src/gemini');
const { decidir, deformar } = require('../src/responder');
const acciones = require('../src/acciones');
const estilo = require('../src/estilo');
const config = require('../src/config');
const fotos = require('../src/fotos');
const fs = require('fs');
const os = require('os');
const path = require('path');

const C = {
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  rojo: (s) => `\x1b[31m${s}\x1b[0m`,
  amar: (s) => `\x1b[33m${s}\x1b[0m`,
  neg: (s) => `\x1b[1m${s}\x1b[0m`,
};

// ---------------------------------------------------------------------------
// REGLAS GLOBALES — valen para cualquier respuesta, en cualquier conversación
// ---------------------------------------------------------------------------
const PROHIBIDAS = [
  'soy un bot', 'asistente virtual', 'inteligencia artificial', 'como IA',
  'estimado', 'estimada', 'aguarde', 'a la brevedad', 'no dude', 'cordialmente',
  'quedo a su disposición', 'atentamente', 'su consulta será', 'gracias por comunicarse',
];

// ---------------------------------------------------------------------------
// PROMESAS A NOMBRE DE OTRA PERSONA
// ---------------------------------------------------------------------------
// No alcanza con una lista de nombres ("fran", "tomi"): mañana entra otro
// vendedor y la regla no lo ve. Se busca la FORMA de la promesa —un verbo de
// responder pegado a un nombre— y se descartan las palabras comunes que pueden
// ocupar ese lugar ("te pasa algo", "te confirma el horario").

const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

// La regla vive en src/promesas.js desde el cerebro Sonnet (01/10/2026): también la usa la guardia
// de src/cerebro.js, dentro del bot. Acá se sigue probando a sí misma.
const { promesaDeOtro, PROMESA_DE_CONTACTO } = require('../src/promesas');

// La regla se prueba a sí misma antes de correr nada: si alguien la afloja y
// deja de cazar una de estas, o empieza a cazar frases sanas, falla acá.
const PROMESAS_QUE_CAZA = [
  'dale perfecto, ahi te confirma fran el horario',
  'dale, ahora te responde fran',
  'dale, dejame verlo con fran y en un rato te confirmamos',
  'sii tomamos dolares como parte de pago, ahora te pasa fran el numero',
  'dale, dejame confirmarlo con fran y te aviso al toque',
  'dejame que te ayude fran con esto',
  'me lo escribis asi te ayudo? o si preferis te llama fran',
  'en un rato te escribe Tomi',
  'Martín te va a llamar para coordinar',
  'te va a contactar Sofi',
  'lo consulto con Juli y te digo',
];
const FRASES_QUE_NO_CAZA = [
  'dale, que dia te podes acercar?',
  'te paso los numeros',
  'contame con cuanto contas',
  'no necesitas tarjeta de credito, es con tu dni y un compromiso de pago',
  'si preferis otro modelo decime y te cotizo ese',
  'dejame chequear si ese horario lo tenemos libre',
  'te lo entregamos listo para usar y te explicamos todo antes de que te vayas',
  'hola tomass! como andas?',
  'dejame confirmarte eso bien y te aviso al toque',
  'mirabas solo el 13 o queres que te pase algun otro?',
  'queres que te pase las fotos?',
  'con lo que te pase quedan esas dos opciones', // batería del cerebro, 02/10/2026: "te pasé" sin tilde
];
{
  const noCaza = PROMESAS_QUE_CAZA.filter((f) => !promesaDeOtro(f));
  const cazaDeMas = FRASES_QUE_NO_CAZA.filter((f) => promesaDeOtro(f));
  if (noCaza.length || cazaDeMas.length) {
    console.error('\nLa regla de promesas a nombre de otro está mal:');
    noCaza.forEach((f) => console.error('  no caza:     ' + f));
    cazaDeMas.forEach((f) => console.error('  caza de más: ' + f));
    process.exit(1);
  }
}

const REGLAS = [
  {
    nombre: 'no habla como robot ni como call center',
    revisar: (msgs) => {
      const t = msgs.join(' ').toLowerCase();
      const mala = PROHIBIDAS.find((p) => t.includes(p.toLowerCase()));
      return mala ? `usó "${mala}"` : null;
    },
  },
  {
    nombre: 'no trata de usted',
    revisar: (msgs) => {
      const t = ' ' + msgs.join(' ').toLowerCase() + ' ';
      const m = t.match(/ (usted|puede usted|si desea|debe usted) /);
      return m ? `usó "${m[1].trim()}"` : null;
    },
  },
  {
    // Desde Ajustes 1 (decisión de Tomás del 16/09/2026) la cotización no muestra
    // el precio de contado: el precio se dice aparte y solo si lo pregunta. La
    // cotización arranca con 📱. Si la entrega alcanza para pagarlo entero no hay
    // cuotas y sí va el precio, "de contado".
    nombre: 'la cotización lleva 1 pago y 2 pagos sin el contado (o solo el precio de contado si le alcanza)',
    revisar: (msgs) => {
      for (const m of msgs) {
        if (!/^📱/.test(m)) continue;
        if (/contado:|\*\s*contado\b/i.test(m)) return 'la cotización muestra el precio de contado';
        const cuotas = /1 pago/i.test(m) || /2 pagos/i.test(m);
        if (cuotas && !(/1 pago/i.test(m) && /2 pagos/i.test(m))) return 'cotizó sin las dos opciones de pago';
        if (!cuotas && !/de contado[^\n]*\$\d/i.test(m)) return 'cotizó sin pagos ni precio de contado';
      }
      return null;
    },
  },
  {
    nombre: 'no manda un precio suelto sin decir de qué equipo es',
    revisar: (msgs) => {
      for (const m of msgs) {
        const tienePrecio = /\$\d{2,3}\.\d{3}/.test(m);
        if (!tienePrecio) continue;
        const tieneContexto =
          /iphone|contado|entrega|cuota|pago|arranca en|ahorra|anotado|faltarian|faltan|estirarte|minimo|mínimo|te queda|te pase|te mande|con esos|esos modelos/i.test(m);
        if (!tieneContexto) return `precio suelto: "${m.slice(0, 60)}"`;
      }
      return null;
    },
  },
  {
    nombre: 'no repite el mismo mensaje dos veces seguidas',
    revisar: (msgs) => {
      for (let i = 1; i < msgs.length; i++) {
        if (msgs[i] === msgs[i - 1]) return 'mandó dos mensajes idénticos seguidos';
      }
      return null;
    },
  },
  {
    nombre: 'no promete un horario concreto',
    revisar: (msgs) => {
      const t = msgs.join(' ').toLowerCase();
      return /(te espero a las|nos vemos a las|vengo a las|paso a las)\s*\d/.test(t)
        ? 'prometió un horario'
        : null;
    },
  },
  {
    // Registros reales de septiembre de 2026: "ahi te confirma fran el horario",
    // "ahora te responde fran", "dejame que te ayude fran con esto". Si nadie
    // escribe, el cliente queda esperando algo que nadie se comprometió a
    // mandar. Cuando hace falta una persona, el bot se calla y avisa al grupo.
    nombre: 'no promete que otra persona le va a responder',
    revisar: (msgs) => {
      for (const m of msgs) {
        const promesa = promesaDeOtro(m);
        if (promesa) return `"${promesa}"`;
      }
      return null;
    },
  },
  {
    // Mejora 1 (decisión del negocio del 16/09/2026): cuando el bot no sabe cómo
    // seguir y escala, no le promete al cliente un contacto posterior ("te aviso",
    // "te confirmo", "me fijo"). Nadie garantiza ese mensaje: silencio y aviso al grupo.
    nombre: 'no promete avisarle, confirmarle ni fijarse después',
    revisar: (msgs) => {
      const m = sinTildes(msgs.join(' | ')).match(PROMESA_DE_CONTACTO);
      return m ? `"${m[0]}"` : null;
    },
  },
  {
    // Bloque 5 (decisión de Tomás del 16/09/2026): "te lo dejo en $" vale solo en los
    // turnos marcados `descuento: true` (el cliente lo pidió). Lo demás, nunca.
    nombre: 'no ofrece descuentos por su cuenta',
    revisar: (msgs, turno = {}) => {
      const t = msgs.join(' ').toLowerCase();
      const conPedido = turno.descuento === true;
      return /(te hago un descuento|precio especial|te bajo)/.test(t) || (!conPedido && /te lo dejo en \$/.test(t))
        ? 'ofreció un descuento'
        : null;
    },
  },
  {
    nombre: 'no ofrece más de 2 cuotas',
    revisar: (msgs) => {
      const t = msgs.join(' ').toLowerCase();
      return /([3-9]|diez)\s*(cuotas|pagos)\s*de/.test(t) ? 'ofreció más de 2 cuotas' : null;
    },
  },
  {
    nombre: 'los mensajes son cortos',
    revisar: (msgs) => {
      // La cotización lleva su propio formato (arranca con 📱) y no cuenta.
      // Tope de 400 desde el Bloque Tono (17/09/2026): la línea de la entrega inicial
      // pasó a tener dos o tres oraciones (retoma el monto del cliente, dice la entrega
      // y cierra con una razón), y con 220 no entraba. El tope de 4 mensajes por tanda
      // no cambia.
      const largo = msgs.find((m) => !/^📱/.test(m) && m.length > 400);
      return largo ? `mensaje de ${largo.length} caracteres` : null;
    },
  },
  {
    nombre: 'arranca cada mensaje con mayúscula',
    revisar: (msgs) => {
      for (const m of msgs) {
        if (/^📱/.test(m) || /^Ip \d/.test(m)) continue;   // formato propio
        if (/^\[foto: /i.test(m)) continue;                // una foto (acciones.comoTexto)
        // De un documento se revisa el pie, que es lo que lee el cliente.
        const doc = m.match(/^\[doc: [^\]]*\]\s*([\s\S]*)$/i);
        const t = (doc ? doc[1] : m).trim();
        const i = t.search(/[a-záéíóúñüA-ZÁÉÍÓÚÑÜ]/);
        if (i === -1) continue;
        if (t[i] !== t[i].toUpperCase()) {
          return `arrancó en minúscula: "${t.slice(0, 40)}"`;
        }
      }
      return null;
    },
  },
  {
    nombre: 'no manda una parrafada de mensajes',
    revisar: (msgs) => (msgs.length > 4 ? `mandó ${msgs.length} mensajes de una` : null),
  },
];

// ---------------------------------------------------------------------------

function revisarTurno(caso, turno, msgs, escalo, lectura, motivo) {
  const errores = [];
  const todo = msgs.join('\n');

  // `motivo` (desde cero, 29/09/2026): el aviso al grupo tiene que decir esto.
  if (turno.motivo && !String(motivo || '').toLowerCase().includes(turno.motivo.toLowerCase())) {
    errores.push(`el motivo no dice "${turno.motivo}": "${motivo || ''}"`);
  }

  // `entregaLeida`: lo que se leyó como entrega en ESE mensaje (null = nada).
  // No es lo guardado en el estado: el bug era justamente confundir las dos.
  if ('entregaLeida' in turno) {
    const leida = lectura ? lectura.entrega : null;
    if (leida !== turno.entregaLeida) {
      errores.push(`leyó entrega ${leida}, se esperaba ${turno.entregaLeida}`);
    }
  }
  // `modeloLeido` (bloque 8): el modelo que se leyó en ESE mensaje (null = ninguno).
  // "2 x 45" se leía como un iPhone X.
  if ('modeloLeido' in turno) {
    const leido = lectura ? lectura.modelo : null;
    if (leido !== turno.modeloLeido) {
      errores.push(`leyó el modelo ${leido}, se esperaba ${turno.modeloLeido}`);
    }
  }

  for (const t of turno.contiene || []) {
    if (!todo.toLowerCase().includes(t.toLowerCase())) errores.push(`falta "${t}"`);
  }
  // Con la capa de estilo hay frases con varias formas: alcanza con una
  if (turno.contieneAlguno && turno.contieneAlguno.length) {
    const alguna = turno.contieneAlguno.some((t) => todo.toLowerCase().includes(t.toLowerCase()));
    if (!alguna) errores.push(`no dijo ninguna de: ${turno.contieneAlguno.join(' / ')}`);
  }
  for (const t of turno.noContiene || []) {
    if (todo.toLowerCase().includes(t.toLowerCase())) errores.push(`no debería decir "${t}"`);
  }
  // `juntos` (bloque 9): todos esos textos en UN mismo mensaje.
  if (turno.juntos && !msgs.some((m) => turno.juntos.every((t) => m.toLowerCase().includes(t.toLowerCase())))) {
    errores.push(`ningún mensaje dice todo junto: ${turno.juntos.join(' + ')}`);
  }
  // `veces` (bloque 9): cuántas veces aparece cada texto en toda la respuesta.
  for (const [t, n] of Object.entries(turno.veces || {})) {
    const hay = todo.toLowerCase().split(t.toLowerCase()).length - 1;
    if (hay !== n) errores.push(`"${t}" aparece ${hay} vez/veces, tenían que ser ${n}`);
  }
  // `saluda` (bloque 9): true = el primer mensaje arranca con el saludo del día (con el
  // apodo, o sin nombre si no hay); 'devuelve' = con el que contesta el "¿cómo están?";
  // false = ningún mensaje arranca con un saludo.
  if ('saluda' in turno) {
    const apodo = deformar(caso.pushName || 'Tomas');
    const de = (clave) =>
      (apodo ? estilo.variantes(clave, apodo) : estilo.variantes(clave + 'SinNombre')).map((v) => v.toLowerCase());
    const arrancaCon = (m, lista) => lista.some((v) => m.toLowerCase().startsWith(v));
    const primero = msgs[0] || '';
    if (turno.saluda === true && !arrancaCon(primero, de('saludo'))) {
      errores.push(`no arrancó con el saludo: "${primero.slice(0, 60)}"`);
    } else if (turno.saluda === 'devuelve' && !arrancaCon(primero, de('saludoDevuelve'))) {
      errores.push(`no arrancó con un saludo que devuelve el "como estan": "${primero.slice(0, 60)}"`);
    } else if (turno.saluda === false) {
      const todos = [
        ...estilo.variantes('saludo', apodo),
        ...estilo.variantes('saludoSinNombre'),
        ...estilo.variantes('saludoDevuelve', apodo),
        ...estilo.variantes('saludoDevuelveSinNombre'),
      ].map((v) => v.toLowerCase());
      const con = msgs.find((m) => arrancaCon(m, todos));
      if (con) errores.push(`saludó y no correspondía: "${con.slice(0, 60)}"`);
    }
  }
  // `conPrecio` (ejemplos aprobados, bloque 7): si la respuesta da un precio o no. El
  // monto lo calcula el cotizador; el caso no lo mira. Un precio es "$" + número, o un
  // número con puntos de miles: la lista de precios va sin "$" ("Ip 15 128gb 85% 740.000").
  const daPrecio = msgs.some((m) => /\$\s?\d|\b\d{1,3}(?:\.\d{3})+\b/.test(m));
  if (turno.conPrecio === true && !daPrecio) errores.push('tenía que dar un precio y no dio ninguno');
  if (turno.conPrecio === false && daPrecio) errores.push('dio un precio y no tenía que dar ninguno');
  if (turno.escala === true && !escalo) errores.push('tenía que escalar y no escaló');
  if (turno.escala === false && escalo) errores.push('escaló y no correspondía');
  if (turno.maxMensajes && msgs.length > turno.maxMensajes) {
    errores.push(`mandó ${msgs.length} mensajes, el tope era ${turno.maxMensajes}`);
  }
  // `silencio: true`: hace falta una persona y al cliente no se le dice nada.
  // Callarse sin escalar sería perder al cliente, así que se piden las dos cosas.
  if (turno.silencio === true) {
    if (msgs.length) errores.push(`tenía que quedarse callado y dijo: "${msgs.join(' | ').slice(0, 80)}"`);
    if (!escalo) errores.push('se quedó callado sin avisar al grupo (no escaló)');
  } else if (turno.mudo === true) {
    // `mudo: true`: no hay nada que contestar (un acuse repetido) y tampoco hace
    // falta una persona. Distinto de `silencio`, que sí escala.
    if (msgs.length) errores.push(`no tenía que contestar nada y dijo: "${msgs.join(' | ').slice(0, 80)}"`);
    if (escalo) errores.push('escaló un mensaje que no necesitaba a nadie');
  } else if (!msgs.length) {
    errores.push('no respondió nada');
  }

  for (const r of REGLAS) {
    const problema = r.revisar(msgs, turno);
    if (problema) errores.push(`[regla] ${r.nombre}: ${problema}`);
  }
  return errores;
}

/**
 * Corre un caso en `chatId`. Devuelve { errores, turnos, turnosOk, primerError }:
 * `errores` como los muestra evaluar (uno por turno que falla); `primerError`, el primero
 * en una línea (`"lo que escribió": el error`), o null. `planillaBase`: la planilla que
 * se vuelve a poner si el caso trae la suya.
 */
async function correrCaso(caso, { chatId, verbose = false, planillaBase = null } = {}) {
  const pushName = caso.pushName || 'Tomas';

  if (verbose) console.log(C.neg(`\n─── ${caso.nombre}`));

  if (caso.planilla) sheets.usarFixture(caso.planilla);
  const conFotos = caso.fotos ? fotosDelCaso(caso.fotos) : null;
  try {
    return await correrTurnos(caso, { chatId, verbose, pushName });
  } finally {
    if (conFotos) conFotos.devolver();
    if (caso.planilla) sheets.usarFixture(planillaBase);
  }
}

/**
 * `fotos` (bloque 8): los modelos que tienen foto en este caso. `evaluar` no tiene
 * carpeta de fotos (`fotos/` la carga Tomás), así que la foto automática al elegir un
 * modelo no se podía probar. Se arma una carpeta temporal con una imagen inventada por
 * modelo y FOTOS_DIR apunta ahí mientras dura el caso.
 */
function fotosDelCaso(modelos) {
  const anterior = config.fotosDir;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'fotos-caso-'));
  for (const m of modelos) fs.writeFileSync(path.join(dir, `${String(m).replace(/^iphone\s*/i, '')}.jpg`), 'foto inventada');
  config.fotosDir = dir;
  fotos.recargar();
  return {
    devolver() {
      config.fotosDir = anterior;
      fotos.recargar();
      fs.rmSync(dir, { recursive: true, force: true });
    },
  };
}

async function correrTurnos(caso, { chatId, verbose, pushName }) {
  const erroresCaso = [];
  let primerError = null;
  let turnos = 0;
  let turnosOk = 0;

  for (const turno of caso.turnos) {
    // `pasanHoras` (bloque 9): el reloj del chat, para atrás. Lo que tenía fecha pasó antes.
    if (turno.pasanHoras) {
      envejecer(chatId, turno.pasanHoras);
      if (verbose) console.log(C.gris(`  (pasan ${turno.pasanHoras} h)`));
      continue;
    }
    // `reset` (bloque 9): el #reset, que borra el chat entero (index.js, `reiniciarChat`).
    if (turno.reset) {
      state.reiniciar(chatId);
      if (verbose) console.log(C.gris('  (#reset)'));
      continue;
    }
    // `vendido` (28/09/2026): el #vendido, con la forma que guarda ventas.js. Un chat así ya compró.
    if (turno.vendido) {
      state.actualizar(chatId, { resultado: { tipo: 'vendido', ts: Date.now(), botParticipo: false, botLeMando: false } });
      if (verbose) console.log(C.gris('  (#vendido)'));
      continue;
    }
    // `humano`: una persona escribió en el chat. Entra al historial como
    // vendedor, marcada como de una persona (bloque 10), igual que en index.js. No es
    // un turno del bot: no se evalúa.
    if (turno.humano) {
      state.agregarAlHistorial(chatId, 'vendedor', turno.humano, { humano: true });
      if (verbose) console.log(C.gris('  humano   › ') + turno.humano);
      continue;
    }
    // `cliente`: una línea del cliente que ya había llegado (contexto de un ejemplo
    // aprobado). La interpreta el `tanda` que le sigue, si hay uno.
    if (turno.cliente !== undefined) {
      state.agregarAlHistorial(chatId, 'cliente', turno.cliente);
      if (verbose) console.log(C.gris('  cliente  › ' + turno.cliente));
      continue;
    }
    // `tanda`: el bot interpretó esas líneas (ya están en el historial). No se revisa y
    // no cuenta como turno; lo que dijo entra al historial solo si se mandó.
    if (turno.tanda) {
      let r;
      try {
        r = await decidir(chatId, turno.tanda.join('\n'), pushName);
      } catch (e) {
        const error = `tanda "${turno.tanda.join(' / ')}" -> EXCEPCIÓN: ${e.message}`;
        erroresCaso.push(error);
        primerError = primerError || error;
        continue;
      }
      if (turno.enviado) {
        (r.mensajes || []).forEach((m) => {
          state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m));
          state.confirmarMarcas(chatId, acciones.marcasDe(m));
        });
      }
      if (verbose) {
        console.log(C.gris(`  (el bot interpreta esas líneas${turno.enviado ? ' y lo manda' : '; no se mandó'})`));
        if (turno.enviado) {
          (r.mensajes || []).map(acciones.comoTexto).forEach((m) => console.log(C.gris('  vendedor › ' + m.split('\n').join('\n             '))));
        }
      }
      continue;
    }
    turnos++;
    // `fotos` (desde cero, D1, 29/09/2026): fotos sin texto en la misma tanda. Solas (sin
    // `c`) son una tanda de fotos: no entran al historial, como en index.js.
    const soloFotos = turno.c === undefined && turno.fotos;
    if (!soloFotos) state.agregarAlHistorial(chatId, 'cliente', turno.c);
    const llegada = turno.fotos ? { fotos: turno.fotos } : {};
    const dicho = soloFotos ? `(${turno.fotos} foto${turno.fotos > 1 ? 's' : ''} sin texto)` : turno.c;
    let r;
    // `lectura`: pisa campos de lo que devuelve la comprensión en ESE turno, para
    // simular una lectura de Gemini que el extractor local no da.
    const entenderDeVerdad = gemini.entender;
    if (turno.lectura) {
      gemini.entender = async (...args) => ({ ...(await entenderDeVerdad(...args)), ...turno.lectura });
    }
    // `redactar: false`: offline redactar devuelve la reserva, así que la salida no
    // dice si se llamó. Se cuenta.
    const redactarDeVerdad = gemini.redactar;
    let redactadas = 0;
    if (turno.redactar === false) {
      gemini.redactar = async (...args) => {
        redactadas++;
        return redactarDeVerdad(...args);
      };
    }
    try {
      r = await decidir(chatId, soloFotos ? '' : turno.c, pushName, llegada);
    } catch (e) {
      const error = `"${dicho}" -> EXCEPCIÓN: ${e.message}`;
      erroresCaso.push(error);
      primerError = primerError || error;
      continue;
    } finally {
      gemini.entender = entenderDeVerdad;
      gemini.redactar = redactarDeVerdad;
    }
    // Las fotos y los documentos se revisan como se leen (acciones.comoTexto), y al
    // historial va lo mismo que guarda index.js cuando salen.
    const msgs = (r.mensajes || []).map(acciones.comoTexto);
    (r.mensajes || []).forEach((m) => {
      state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m));
      // Acá todos los envíos salen, así que cada mensaje confirma sus marcas de
      // "ya se dijo", igual que hace index.js con el id de Evolution (bloque 3).
      state.confirmarMarcas(chatId, acciones.marcasDe(m));
    });

    if (verbose) {
      console.log(C.gris('  cliente  › ') + (soloFotos ? C.gris(dicho) : turno.c + (turno.fotos ? C.gris(` + ${turno.fotos} foto(s)`) : '')));
      msgs.forEach((m) =>
        m.split('\n').forEach((l, k) => console.log((k ? '             ' : C.verde('  vendedor › ')) + l))
      );
      if (r.escalar) console.log(C.amar('  → escala: ') + r.motivo);
    }

    const errores = revisarTurno(caso, turno, msgs, !!r.escalar, state.obtener(chatId).ultimaLectura, r.motivo);
    if (redactadas) errores.push(`llamó a redactar ${redactadas} vez/veces y no tenía que hacerlo`);
    if (errores.length) {
      erroresCaso.push(`"${dicho}"\n        ` + errores.join('\n        '));
      primerError = primerError || `"${String(dicho).split('\n').join(' / ')}": ${errores[0]}`;
    } else {
      turnosOk++;
    }
  }

  return { errores: erroresCaso, turnos, turnosOk, primerError };
}

/**
 * Corre el reloj del chat `horas` para atrás (bloque 9): el historial, la última lectura
 * y cada fecha del chat. Como `envejecer` de test/control.test.js, más `saludoEn`.
 */
function envejecer(chatId, horas) {
  const s = state.obtener(chatId);
  const atras = horas * 60 * 60 * 1000;
  const cambios = { historial: (s.historial || []).map((l) => ({ ...l, ts: l.ts - atras })) };
  for (const campo of ['ultimoBot', 'ultimoHumano', 'escaladoEn', 'leadRegistrado', 'botEnvio', 'botPropuso', 'saludoEn']) {
    if (s[campo]) cambios[campo] = s[campo] - atras;
  }
  if (s.ultimaLectura && s.ultimaLectura.ts) cambios.ultimaLectura = { ...s.ultimaLectura, ts: s.ultimaLectura.ts - atras };
  // Las líneas de una persona de la cuenta, guardadas aparte con su hora (01/10/2026).
  if (s.lineasPersona) cambios.lineasPersona = s.lineasPersona.map((l) => ({ ...l, ts: l.ts - atras }));
  state.actualizar(chatId, cambios);
}

module.exports = { C, REGLAS, revisarTurno, correrCaso };
