'use strict';
/**
 * Corre conversaciones enteras de una, sin tener que tipear.
 * Los guiones salen de conversaciones reales del corpus.
 *
 *   npm run guion              planilla real
 *   npm run guion -- --offline precios congelados
 *   npm run guion -- --solo 3  correr un solo guion
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// El estado y el aprendizaje van a archivos temporales, como en test/*.test.js.
// Sin esto los guiones escribían en data/estado.json y, con el bot corriendo,
// el último proceso que guarda pisa lo que anotó el otro. Va antes de requerir
// nada: config.js lee las variables al cargarse.
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-guion-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-guion-' + process.pid + '.jsonl');
process.on('exit', () => {
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      // no se llegó a crear
    }
  }
});

const sheets = require('../src/sheets');
const state = require('../src/state');
const config = require('../src/config');
const { decidir } = require('../src/responder');
const acciones = require('../src/acciones');

const OFFLINE = process.argv.includes('--offline');
const iSolo = process.argv.indexOf('--solo');
const SOLO = iSolo > -1 ? parseInt(process.argv[iSolo + 1], 10) : null;

const C = {
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  amar: (s) => `\x1b[33m${s}\x1b[0m`,
  cian: (s) => `\x1b[36m${s}\x1b[0m`,
  neg: (s) => `\x1b[1m${s}\x1b[0m`,
};

const GUIONES = [
  {
    nombre: 'Consulta simple y cotización (basado en WA-017, Dayana)',
    esperado: 'confirma stock, da contado, pide la entrega, cotiza',
    mensajes: ['Hola buenas', 'Busco algún iPhone, que tenés disponible? 13 o 14', 'Tenés la opción de pagar en cuotas ?', 'tengo 350 mil'],
  },
  {
    nombre: 'La entrega no llega al mínimo (basado en WA-022, la caída más común)',
    esperado: 'dice el mínimo, ofrece una alternativa más barata, deja la puerta abierta',
    mensajes: ['hola, vi el 13 rosadito', 'Vi que hacían cuotas? Tengo para entregar 250 ya'],
  },
  {
    nombre: 'Permuta (basado en WA-020, Sofii)',
    esperado: 'NO cotiza la permuta, pide los cuatro datos y escala',
    mensajes: ['Hola hace plan canje? iPhone 14 Pro 128gb 82%', 'Y cuánto sería la diferencia?'],
  },
  {
    nombre: 'Modelo que no está cargado en la planilla',
    esperado: 'no inventa precio, escala',
    mensajes: ['tenes iphone 11 pro?'],
  },
  {
    nombre: 'Cliente que acepta y quiere avanzar',
    esperado: 'escala al humano para el turno',
    mensajes: ['hola tenes el 15?', 'tengo 500 mil para entregar', 'dale lo quiero, cuando puedo pasar?'],
  },
  {
    nombre: 'Consulta general sin modelo',
    esperado: 'contesta con los datos fijos, sin inventar',
    mensajes: ['hola, donde estan ubicados? piden tarjeta para las cuotas?'],
  },
  {
    nombre: 'Postventa',
    esperado: 'escala de inmediato, no intenta resolverlo',
    mensajes: ['hola, el celu que les compre no me agarra señal'],
  },
];

async function correr(guion, i) {
  const chatId = `guion-${i}-${Date.now()}@s.whatsapp.net`;

  console.log('');
  console.log(C.neg(`─── ${i + 1}. ${guion.nombre}`));
  console.log(C.gris(`    esperado: ${guion.esperado}`));
  console.log('');

  for (const m of guion.mensajes) {
    console.log(C.cian('  cliente  › ') + m);
    state.agregarAlHistorial(chatId, 'cliente', m);

    let r;
    try {
      r = await decidir(chatId, m, 'Tomas');
    } catch (e) {
      console.log(C.amar('  ERROR    › ') + e.message);
      continue;
    }

    for (const msg of r.mensajes || []) {
      // Una foto o un documento se muestran como se leen, y al historial va lo que ve el cliente.
      acciones.comoTexto(msg).split('\n').forEach((l, k) => {
        console.log((k === 0 ? C.verde('  vendedor › ') : '             ') + l);
      });
      state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(msg));
      // Acá todo lo que se decide sale: cada mensaje confirma sus marcas (bloque 3).
      state.confirmarMarcas(chatId, acciones.marcasDe(msg));
    }
    if (r.escalar) console.log(C.amar('  → AVISO AL GRUPO: ') + r.motivo);
    console.log('');
  }

  const s = state.obtener(chatId);
  console.log(
    C.gris(
      `    entendió: modelo=${s.modelo || '-'} entrega=${s.entrega || '-'} ` +
        `permuta=${s.permuta?.modelo || '-'} anotado=${s.presupuestoAnotado || '-'}`
    )
  );
}

(async () => {
  if (OFFLINE) {
    sheets.usarFixture(require('./fixture-planilla'));
    console.log(C.amar('\nPrecios: copia congelada del 08/09/2026'));
  } else {
    try {
      const d = await sheets.leerTodo();
      console.log(C.verde(`\nPrecios: planilla en vivo — ${d.lista.length} modelos`));
    } catch (e) {
      console.log(C.amar('\nNo pude leer la planilla (' + e.message + '), uso la copia congelada'));
      sheets.usarFixture(require('./fixture-planilla'));
    }
  }
  console.log(
    config.gemini.apikey
      ? C.verde('Comprensión: Gemini ' + config.gemini.modelo)
      : C.amar('Comprensión: extractor local (sin GEMINI_API_KEY)')
  );

  const lista = SOLO ? [GUIONES[SOLO - 1]] : GUIONES;
  for (let i = 0; i < lista.length; i++) {
    await correr(lista[i], SOLO ? SOLO - 1 : i);
  }
  console.log('');
  process.exit(0);
})();
