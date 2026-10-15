'use strict';
/**
 * Corre todo el banco de casos y le pone nota al bot.
 *
 *   npm run evaluar                                 Gemini, con los precios congelados
 *   npm run evaluar -- --planilla-en-vivo           Gemini, con la planilla de hoy
 *   npm run evaluar -- --offline                    precios congelados, sin Google
 *   npm run evaluar -- --offline -v                 además muestra cada conversación
 *   npm run evaluar -- --offline --solo-aprobados   solo los ejemplos aprobados
 *   npm run evaluar -- --aprobados <ruta>           otro archivo de ejemplos (los tests)
 *
 * Chequea tres cosas:
 *   1. Las comprobaciones propias de cada caso (test/casos.js).
 *   2. Las REGLAS GLOBALES: se aplican a TODA respuesta del bot, siempre
 *      (test/correr-caso.js, que es también quien corre cada caso).
 *   3. Los ejemplos aprobados (bloque 7, `npm run aprobar`): cada `buena` de
 *      test/ejemplos-aprobados.json es un caso. Se cuentan aparte y no suman a la línea
 *      de casos.js. Un pendiente que falla no rompe nada: se arregla con una regla en
 *      otro bloque. Uno fijado (`npm run aprobar -- --fijar`) que falla, sí.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// El estado y el aprendizaje van a archivos temporales, como en test/*.test.js.
// Sin esto el evaluador escribía en data/estado.json: con el bot corriendo,
// cada proceso tiene su propia copia de la memoria y el último que guarda pisa
// lo que anotó el otro. Va antes de requerir nada: config.js lee las variables
// al cargarse.
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-evaluar-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-evaluar-' + process.pid + '.jsonl');
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
const config = require('../src/config');
const gemini = require('../src/gemini');
const { correrCaso, C } = require('./correr-caso');
const aprobados = require('./aprobados');
const CASOS = require('./casos');

const args = process.argv.slice(2);
const OFFLINE = args.includes('--offline');
const VERBOSE = args.includes('-v');
const SOLO_APROBADOS = args.includes('--solo-aprobados');
// En línea, los precios también son los congelados (análisis del 28/09/2026): con la
// planilla de hoy, 75 de los 113 turnos que fallaban eran solo montos que cambiaron, y el
// porcentaje no medía a Gemini. La planilla de hoy, solo si se pide.
const PLANILLA_EN_VIVO = args.includes('--planilla-en-vivo') && !OFFLINE;
const iAprobados = args.indexOf('--aprobados');
const RUTA_APROBADOS = iAprobados > -1 ? args[iAprobados + 1] : aprobados.RUTA;
if (!RUTA_APROBADOS) {
  console.log('\nFalta la ruta después de --aprobados.\n');
  process.exit(1);
}

// Offline de verdad: precios congelados Y comprensión local. Sin esto la suite
// sale a Gemini y deja de ser determinística — un 100% podría estar saliendo
// del modelo un día y del extractor local al otro, según la cuota.
if (OFFLINE) gemini.usarSoloLocal(true);

/**
 * Los ejemplos aprobados, después de la línea de casos.js. Devuelve cuántos fijados
 * fallan (lo que rompe `evaluar`), o 1 si el archivo no se puede leer.
 */
async function evaluarAprobados() {
  let lista;
  try {
    lista = aprobados.leer(RUTA_APROBADOS);
  } catch (e) {
    console.log(C.rojo(`Ejemplos aprobados: no pude leer ${RUTA_APROBADOS} (${e.message})`));
    console.log('');
    return 1;
  }
  const buenas = lista.filter((e) => e.etiqueta === 'buena');
  if (!buenas.length) {
    console.log(C.gris('Ejemplos aprobados: todavía no hay (npm run aprobar)'));
    console.log('');
    return 0;
  }

  const cumplen = [];
  const pendientesQueFallan = [];
  const fijadosQueFallan = [];
  for (let i = 0; i < buenas.length; i++) {
    const ejemplo = buenas[i];
    const chatId = `aprobado-${i}-${Date.now()}@s.whatsapp.net`;
    const r = await correrCaso(aprobados.comoCaso(ejemplo), { chatId, verbose: VERBOSE });
    if (!r.errores.length) cumplen.push(ejemplo);
    else if (ejemplo.estado === 'fijado') fijadosQueFallan.push({ ejemplo, r });
    else pendientesQueFallan.push({ ejemplo, r });
  }

  if (VERBOSE) console.log('');
  const color = fijadosQueFallan.length ? C.rojo : pendientesQueFallan.length ? C.amar : C.verde;
  console.log(
    color(
      `Ejemplos aprobados: ${cumplen.length} de ${buenas.length} cumplen · ${pendientesQueFallan.length} pendientes · fijados que fallan: ${fijadosQueFallan.length}`
    )
  );
  if (pendientesQueFallan.length) {
    console.log(C.amar('  Pendientes que fallan (no rompen evaluar):'));
    for (const { ejemplo, r } of pendientesQueFallan) console.log(C.amar(`    ${ejemplo.id}  ${r.primerError}`));
  }
  if (fijadosQueFallan.length) {
    console.log(C.neg('  Fijados que fallan:'));
    for (const { ejemplo, r } of fijadosQueFallan) {
      console.log('\n    ' + C.rojo(`aprobado ${ejemplo.id}`));
      r.errores.forEach((e) => console.log('        ' + e));
    }
    console.log('');
  }
  const sinFijar = cumplen.filter((e) => e.estado !== 'fijado');
  if (sinFijar.length) {
    console.log(`  Ya cumplen y no están fijados: ${sinFijar.map((e) => e.id).join(', ')} (npm run aprobar -- --fijar)`);
  }
  console.log('');
  return fijadosQueFallan.length;
}

(async () => {
  if (!PLANILLA_EN_VIVO) {
    sheets.usarFixture(require('./fixture-planilla'));
  } else {
    try {
      await sheets.leerTodo();
    } catch {
      sheets.usarFixture(require('./fixture-planilla'));
    }
  }

  // Planilla de referencia. Un caso puede traer la suya en `caso.planilla`
  // (para probar topes y cantidades de unidades); al terminar se restaura esta.
  const PLANILLA_BASE = await sheets.leerTodo();

  console.log('');
  console.log(C.neg(SOLO_APROBADOS ? 'Evaluando los ejemplos aprobados' : `Evaluando ${CASOS.length} casos`));
  // El banner tiene que decir lo que de verdad está pasando: si dice "Gemini"
  // y en realidad entendió el extractor local, el 100% no significa nada.
  const comprension =
    gemini.esSoloLocal() || !config.gemini.apikey ? 'extractor local' : 'Gemini';
  console.log(
    C.gris(
      `Precios: ${PLANILLA_EN_VIVO ? 'planilla en vivo' : 'copia congelada'} · Comprensión: ${comprension}`
    )
  );
  console.log('');

  const fallos = [];
  if (!SOLO_APROBADOS) {
    let totalTurnos = 0;
    let turnosOk = 0;
    for (let i = 0; i < CASOS.length; i++) {
      const caso = CASOS[i];
      const chatId = `eval-${i}-${Date.now()}@s.whatsapp.net`;
      const r = await correrCaso(caso, { chatId, verbose: VERBOSE, planillaBase: PLANILLA_BASE });
      totalTurnos += r.turnos;
      turnosOk += r.turnosOk;
      if (r.errores.length) {
        fallos.push({ nombre: caso.nombre, erroresCaso: r.errores });
        if (!VERBOSE) process.stdout.write(C.rojo('x'));
      } else if (!VERBOSE) {
        process.stdout.write(C.verde('.'));
      }
    }

    console.log('\n');
    if (fallos.length) {
      console.log(C.neg('Fallos:'));
      fallos.forEach((f) => {
        console.log('\n  ' + C.rojo(f.nombre));
        f.erroresCaso.forEach((e) => console.log('      ' + e));
      });
      console.log('');
    }

    const pct = Math.round((turnosOk / totalTurnos) * 100);
    const color = pct === 100 ? C.verde : pct >= 85 ? C.amar : C.rojo;
    console.log(
      color(
        `${turnosOk}/${totalTurnos} turnos correctos (${pct}%) · ${
          CASOS.length - fallos.length
        }/${CASOS.length} casos limpios`
      )
    );
    console.log('');
  }

  const fijadosQueFallan = await evaluarAprobados();
  process.exit(fallos.length || fijadosQueFallan ? 1 : 0);
})();
