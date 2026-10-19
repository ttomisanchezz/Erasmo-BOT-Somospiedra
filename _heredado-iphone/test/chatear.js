'use strict';
/**
 * Chatear con el bot desde la consola, como si fueras un cliente.
 * No necesita Docker, ni WhatsApp, ni Evolution API.
 *
 *   npm run chatear              usa la planilla real y Gemini si hay clave
 *   npm run chatear -- --offline usa precios congelados, sin Google
 *
 * Comandos dentro del chat:
 *   /nuevo    empezar una conversación de cero
 *   /estado   ver qué entendió el bot hasta ahora
 *   /salir
 */
const readline = require('readline');
const path = require('path');
const fs = require('fs');
const os = require('os');

const OFFLINE = process.argv.includes('--offline');

// El estado y el aprendizaje van a archivos temporales, como en test/*.test.js.
// Antes el chat escribía en data/estado.json y al salir BORRABA ese archivo: se
// llevaba puestos los chats reales y los recordatorios. Va antes de requerir
// nada: config.js lee las variables al cargarse.
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-chatear-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-chatear-' + process.pid + '.jsonl');
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

const V = {
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  amar: (s) => `\x1b[33m${s}\x1b[0m`,
  cian: (s) => `\x1b[36m${s}\x1b[0m`,
  rojo: (s) => `\x1b[31m${s}\x1b[0m`,
  neg: (s) => `\x1b[1m${s}\x1b[0m`,
};

// Estado limpio para cada sesión de prueba: el temporal de arriba, nunca data/.
const ARCHIVO_ESTADO = process.env.ESTADO_PATH;
let CHAT = 'prueba-' + Date.now() + '@s.whatsapp.net';

function nuevoChat() {
  CHAT = 'prueba-' + Date.now() + '@s.whatsapp.net';
}

async function arrancar() {
  console.log('');
  console.log(V.neg('  Chat de prueba — Bot Somos iPhone NQN'));
  console.log('');

  if (OFFLINE) {
    sheets.usarFixture(require('./fixture-planilla'));
    console.log(V.amar('  Precios: copia congelada del 08/09/2026 (modo offline)'));
  } else {
    try {
      const d = await sheets.leerTodo();
      console.log(
        V.verde(
          `  Precios: planilla en vivo — ${d.lista.length} modelos, lista ${d.config.estadoLista}`
        )
      );
    } catch (e) {
      console.log(V.rojo('  No pude leer la planilla: ' + e.message));
      console.log(V.amar('  Sigo con la copia congelada. Probá con --offline para no ver este aviso.'));
      sheets.usarFixture(require('./fixture-planilla'));
    }
  }

  console.log(
    config.gemini.apikey
      ? V.verde('  Comprensión: Gemini ' + config.gemini.modelo)
      : V.amar('  Comprensión: extractor local (no hay GEMINI_API_KEY en el .env)')
  );

  console.log(V.gris('  Escribí como si fueras un cliente. /nuevo /estado /salir'));
  console.log('');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const preguntar = () =>
    new Promise((r) => rl.question(V.cian('cliente > '), (x) => r(x)));

  while (true) {
    const linea = (await preguntar()).trim();
    if (!linea) continue;

    if (linea === '/salir') break;
    if (linea === '/nuevo') {
      nuevoChat();
      console.log(V.gris('  — conversación nueva —\n'));
      continue;
    }
    if (linea === '/estado') {
      const s = state.obtener(CHAT);
      console.log(
        V.gris(
          JSON.stringify(
            {
              modelo: s.modelo,
              capacidad_gb: s.capacidad_gb,
              entrega: s.entrega,
              forma_pago: s.forma_pago,
              zona: s.zona,
              permuta: s.permuta,
              presupuestoAnotado: s.presupuestoAnotado,
              escalado: s.escalado,
            },
            null,
            2
          )
        ) + '\n'
      );
      continue;
    }

    state.agregarAlHistorial(CHAT, 'cliente', linea);

    const t0 = Date.now();
    let r;
    try {
      r = await decidir(CHAT, linea, 'Tomas');
    } catch (e) {
      console.log(V.rojo('  ERROR: ' + e.message) + '\n');
      continue;
    }
    const ms = Date.now() - t0;

    console.log('');
    for (const m of r.mensajes || []) {
      // Una foto o un documento se muestran como se leen, y al historial va lo que ve el cliente.
      acciones.comoTexto(m).split('\n').forEach((l) => console.log('  ' + V.verde(l)));
      console.log('');
      state.agregarAlHistorial(CHAT, 'vendedor', acciones.paraHistorial(m));
      // Acá todo lo que se decide sale: cada mensaje confirma sus marcas (bloque 3).
      state.confirmarMarcas(CHAT, acciones.marcasDe(m));
    }

    if (r.escalar) {
      console.log(V.amar('  ┌─ AVISO AL GRUPO ────────────────'));
      console.log(V.amar('  │ ' + r.motivo));
      console.log(V.amar('  └─ acá se corre y sigue un humano'));
      console.log('');
    }

    console.log(V.gris(`  (${ms} ms)`));
    console.log('');
  }

  rl.close();
  try {
    fs.unlinkSync(ARCHIVO_ESTADO);
  } catch {
    /* no pasa nada si no existe */
  }
  console.log(V.gris('\n  listo\n'));
  process.exit(0);
}

arrancar();
