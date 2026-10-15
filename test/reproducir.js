'use strict';
/**
 * Reproduce los mensajes reales de clientes contra el bot de HOY y lo compara con lo
 * que contestó la persona (bloque 6, pedido de Tomás del 22/09/2026). Sirve para ver,
 * sin esperar otra semana de escucha, cómo contestaría hoy el bot, y decidir qué se
 * corrige. No es un test de pasa o falla: es una guía.
 *
 *   npm run reproducir                              data/aprendizaje-v1.jsonl (o, si no
 *                                                   está, data/aprendizaje.jsonl)
 *   npm run reproducir -- --archivo <ruta>          otro archivo, viejo o v2
 *   npm run reproducir -- --informe <ruta>          dónde va el informe (por defecto
 *                                                   data/reproduccion-AAAA-MM-DD.md)
 *   npm run reproducir -- --gemini --si             con Gemini de verdad (cuesta tokens)
 *   npm run reproducir -- --json                    el resumen como JSON (los tests)
 *
 * Qué es un caso:
 *   - formato viejo (sin `v: 2`): uno por par único chat + mensaje del cliente, con
 *     cliente y respuesta humana no vacíos. Las filas repetidas de ese par (una por
 *     cada mensaje seguido de la persona) son una sola respuesta. Sin contexto: el
 *     formato viejo no lo tiene, así que ese mensaje se reproduce solo, en un chat nuevo.
 *   - v2: uno por ejemplo completo (aprendizaje.ejemplos). Cada chat se reproduce una
 *     vez, en orden, en un mismo chat de prueba: las líneas del cliente y las
 *     respuestas de la persona entran al historial como pasaron y cada tanda se vuelve
 *     a interpretar, así el bot llega a cada caso con el mismo contexto que tenía. Lo
 *     que el bot propuso en escucha o en borrador no entra al historial (no le llegó al
 *     cliente); lo de una propuesta en vivo, sí.
 *
 * Corre como `evaluar -- --offline`: precios de la copia congelada, extractor local,
 * estado y aprendizaje en temporales, sin red, sin Evolution y sin mandar nada. Nunca
 * escribe en data/estado.json ni en los registros de aprendizaje: solo el informe.
 * Llama a `decidir` (responder.js), no a index.js: no simula las tandas cortadas, los
 * datos viejos por tiempo ni los chats escalados.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

// Antes de requerir nada: config.js lee las variables al cargarse. Los temporales son
// propios aunque el entorno traiga otros, y el modo se fija acá y no se hereda del
// .env: escucha, como corría el bot mientras se juntaron estos mensajes.
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'reproducir-'));
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.ESTADO_SOLO_LECTURA = '';
process.env.MODO_ESCUCHA = 'true';
process.env.MODO_BORRADOR = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

const args = process.argv.slice(2);
const valor = (flag) => {
  const i = args.indexOf(flag);
  return i > -1 ? args[i + 1] || '' : null;
};
for (const flag of ['--archivo', '--informe']) {
  if (valor(flag) === '') {
    console.log(`\nFalta la ruta después de ${flag}.\n`);
    process.exit(1);
  }
}
const GEMINI = args.includes('--gemini');
const SI = args.includes('--si');
const JSON_SALIDA = args.includes('--json');

const DATA = path.join(__dirname, '..', 'data');
const V1 = path.join(DATA, 'aprendizaje-v1.jsonl');
const archivo = valor('--archivo') || (fs.existsSync(V1) ? V1 : path.join(DATA, 'aprendizaje.jsonl'));
const dos = (n) => String(n).padStart(2, '0');
const hoy = new Date();
const informe = valor('--informe') || path.join(DATA, `reproduccion-${hoy.getFullYear()}-${dos(hoy.getMonth() + 1)}-${dos(hoy.getDate())}.md`);

const sheets = require('../src/sheets');
const state = require('../src/state');
const config = require('../src/config');
const gemini = require('../src/gemini');
const { decidir } = require('../src/responder');
const acciones = require('../src/acciones');
const local = require('../src/extractor-local');
const aprendizaje = require('../src/aprendizaje');

// Sin --gemini, sin red de verdad: comprensión local y cualquier salida revienta. Con
// --gemini, solo a Gemini. Los precios son siempre los de la copia congelada.
const fetchReal = globalThis.fetch;
if (GEMINI) {
  globalThis.fetch = (url, ...resto) => {
    if (String(url).startsWith('https://generativelanguage.googleapis.com/')) return fetchReal(url, ...resto);
    throw new Error('reproducir solo sale a Gemini');
  };
} else {
  gemini.usarSoloLocal(true);
  globalThis.fetch = () => {
    throw new Error('reproducir sin --gemini no sale a la red');
  };
}
sheets.usarFixture(require('./fixture-planilla'));

const LIMITE_INFORME = 30;

/** Un caso por par único chat + cliente (formato viejo). */
function casosViejos(filas) {
  const porPar = new Map();
  for (const f of filas) {
    if (f.v === 2) continue;
    const cliente = String(f.cliente || '').trim();
    const humano = String(f.humano || '').trim();
    if (!cliente || !humano) continue;
    const clave = f.chat + '\n' + cliente;
    if (!porPar.has(clave)) porPar.set(clave, { chat: f.chat, ts: f.ts, lineas: cliente.split('\n'), humanos: [] });
    porPar.get(clave).humanos.push(humano);
  }
  return [...porPar.values()].map(({ humanos, ...c }) => ({ ...c, humano: humanos.join('\n'), botEntonces: null }));
}

/** Qué haría el bot con esta respuesta de `decidir`, lista para comparar. */
function comparar(caso, r) {
  const bot = (r.mensajes || []).map(acciones.comoTexto);
  const textoBot = bot.join('\n');
  return {
    ...caso,
    bot,
    accion: bot.length ? 'contesta' : r.escalar ? 'escala' : 'se calla',
    escalar: Boolean(r.escalar),
    motivo: r.escalar || r.silencioso ? r.motivo || '' : '',
    numBot: bot.length > 0 && local.mencionaPosibleMonto(textoBot),
    numPersona: local.mencionaPosibleMonto(caso.humano),
    dif: aprendizaje.distancia(textoBot, caso.humano),
    error: null,
  };
}

async function interpretar(chatId, lineas) {
  try {
    const r = await decidir(chatId, lineas.map((l) => l.texto).join('\n'), '', { lineas });
    return { r };
  } catch (e) {
    return { error: e.message };
  }
}

async function reproducirViejos(casos) {
  const resultados = [];
  for (let i = 0; i < casos.length; i++) {
    const caso = casos[i];
    const chatId = `repro-${i}-${Date.now()}@s.whatsapp.net`;
    const ahora = Date.now();
    for (const t of caso.lineas) state.agregarAlHistorial(chatId, 'cliente', t);
    const { r, error } = await interpretar(chatId, caso.lineas.map((texto) => ({ ts: ahora, texto })));
    resultados.push(error ? { ...caso, error } : comparar({ ...caso, cliente: caso.lineas }, r));
    // El chat de prueba no hace falta más: el estado temporal no crece con cada caso.
    state.reiniciar(chatId);
  }
  return resultados;
}

/** Los ejemplos completos del registro v2, reproduciendo cada chat en orden. */
async function reproducirV2(eventos, objetivos) {
  const porTanda = new Map(objetivos.map((e) => [e.tanda, e]));
  // Por clave (bloque 7): dos chats con los mismos 4 dígitos no se mezclan. Sin clave, por chat.
  const porChat = new Map();
  eventos.forEach((e, i) => {
    if (!e || e.v !== 2) return;
    const grupo = e.clave || e.chat;
    if (!porChat.has(grupo)) porChat.set(grupo, []);
    porChat.get(grupo).push({ e, i });
  });
  const resultados = [];
  let k = 0;
  for (const lista of porChat.values()) {
    lista.sort((a, b) => Date.parse(a.e.ts) - Date.parse(b.e.ts) || a.i - b.i);
    let quedan = lista.filter(({ e }) => e.tipo === 'propuesta' && porTanda.has(e.tanda)).length;
    if (!quedan) continue;
    const chatId = `repro-${k++}-${Date.now()}@s.whatsapp.net`;
    const lineas = new Map();
    for (const { e } of lista) {
      if (!quedan) break;
      if (e.tipo === 'cliente') {
        lineas.set(e.id, e);
        state.agregarAlHistorial(chatId, 'cliente', e.texto);
      } else if (e.tipo === 'humano') {
        state.agregarAlHistorial(chatId, 'vendedor', e.texto, { humano: true });
      } else if (e.tipo === 'propuesta') {
        const suyas = (e.lineas || []).map((id) => lineas.get(id)).filter(Boolean);
        if (!suyas.length) continue;
        const { r, error } = await interpretar(chatId, suyas.map((c) => ({ ts: Date.parse(c.ts), texto: c.texto })));
        // Lo que el bot mandó de verdad es parte del contexto; lo de escucha o borrador, no.
        if (r && e.modo === 'vivo') {
          for (const m of r.mensajes || []) {
            state.agregarAlHistorial(chatId, 'vendedor', acciones.paraHistorial(m));
            state.confirmarMarcas(chatId, acciones.marcasDe(m));
          }
        }
        const ej = porTanda.get(e.tanda);
        if (!ej) continue;
        quedan--;
        const caso = { chat: ej.chat, ts: ej.ts, cliente: ej.cliente, humano: ej.humano, botEntonces: { mensajes: ej.bot, commit: ej.commit, modo: ej.modo } };
        resultados.push(error ? { ...caso, error } : comparar(caso, r));
      }
    }
    state.reiniciar(chatId);
  }
  return resultados;
}

/** El motivo sin lo que cambia de caso en caso (textos entre comillas, detalles, números). */
function motivoAgrupado(motivo) {
  return (
    String(motivo || '')
      .replace(/"[^"]*"/g, '"…"')
      .replace(/\s*\([^)]*\)/g, '')
      .replace(/\d+/g, '#')
      .replace(/\s+/g, ' ')
      .trim() || 'sin motivo'
  );
}

function resumir(resultados, formato, comprension) {
  const ok = resultados.filter((r) => !r.error);
  const motivos = {};
  for (const r of ok.filter((x) => x.escalar)) {
    const m = motivoAgrupado(r.motivo);
    motivos[m] = (motivos[m] || 0) + 1;
  }
  const ordenados = Object.fromEntries(Object.entries(motivos).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])));
  const contesta = ok.filter((r) => r.accion === 'contesta').length;
  return {
    archivo,
    formato,
    comprension,
    casos: resultados.length,
    contesta,
    escalaSinContestar: ok.filter((r) => r.accion === 'escala').length,
    seCalla: ok.filter((r) => r.accion === 'se calla').length,
    escala: ok.filter((r) => r.escalar).length,
    motivos: ordenados,
    // La persona contestó en todos los casos (por eso hay un caso): coinciden cuando el
    // bot también contesta.
    coincidenEnContestar: contesta,
    numeros: {
      soloBot: ok.filter((r) => r.numBot && !r.numPersona).length,
      soloPersona: ok.filter((r) => !r.numBot && r.numPersona).length,
    },
    errores: resultados.length - ok.length,
    informe,
  };
}

function lineasDelResumen(s) {
  const out = [
    `${s.casos} casos · formato ${s.formato} · ${s.archivo}`,
    `Precios: copia congelada · Comprensión: ${s.comprension}`,
    '',
    `El bot contesta:             ${s.contesta}`,
    `Escala sin contestar:        ${s.escalaSinContestar}`,
    `Se calla sin escalar:        ${s.seCalla}`,
  ];
  if (s.errores) out.push(`Con error al reproducir:     ${s.errores}`);
  out.push('', `Escalaría ${s.escala} (con o sin mensaje), por motivo:`);
  for (const [m, n] of Object.entries(s.motivos)) out.push(`  ${String(n).padStart(4)}  ${m}`);
  out.push(
    '',
    `Coinciden en contestar: ${s.coincidenEnContestar} de ${s.casos - s.errores} (la persona contestó en todos)`,
    `Números del bot y no de la persona: ${s.numeros.soloBot} · de la persona y no del bot: ${s.numeros.soloPersona}`
  );
  return out;
}

const cita = (t) => String(t || '').split('\n').map((l) => '> ' + l).join('\n');

function queHace(r) {
  if (r.error) return `no se pudo reproducir: ${r.error}`;
  if (r.accion === 'contesta') return `contesta (${r.bot.length} mensaje${r.bot.length > 1 ? 's' : ''})` + (r.escalar ? ` y escala: ${r.motivo}` : '');
  if (r.accion === 'escala') return `escala sin contestar: ${r.motivo}`;
  return r.motivo ? `se calla: ${r.motivo}` : 'se calla';
}

function armarInforme(s, resultados) {
  // Los más distintos primero; a igual distancia, donde el bot no contesta o los
  // números no coinciden.
  const peso = (r) => r.dif * 4 + (r.accion !== 'contesta' ? 2 : 0) + (r.numBot !== r.numPersona ? 1 : 0);
  const peores = resultados
    .filter((r) => !r.error)
    .sort((a, b) => peso(b) - peso(a))
    .slice(0, LIMITE_INFORME);
  const md = [
    `# Reproducción del bot contra respuestas reales (${hoy.toLocaleDateString('es-AR')})`,
    '',
    '`npm run reproducir`: cómo contestaría HOY el bot a mensajes reales de clientes, contra lo que contestó la persona. Es una guía para decidir qué se corrige, no una nota. La distancia es la de `npm run aprender` (palabras en común): dos buenas respuestas pueden decir lo mismo con otras palabras.',
    '',
    '## Resumen',
    '',
    '```',
    ...lineasDelResumen(s),
    '```',
    '',
    `## Los ${peores.length} casos más distintos`,
    '',
  ];
  peores.forEach((r, i) => {
    const pct = Math.round(r.dif * 100);
    md.push(`### ${i + 1}. ${r.chat} · ${String(r.ts || '').slice(0, 16).replace('T', ' ')} · ${pct}% distinto`, '');
    md.push('**Cliente**', '', cita((r.cliente || []).join('\n')), '');
    md.push(`**El bot hoy**: ${queHace(r)}`, '');
    if (r.bot.length) md.push(cita(r.bot.join('\n')), '');
    if (r.botEntonces) {
      md.push(`**El bot entonces** (${r.botEntonces.modo}, commit ${r.botEntonces.commit || '?'})`, '');
      md.push(r.botEntonces.mensajes.length ? cita(r.botEntonces.mensajes.join('\n')) : '> (no iba a contestar)', '');
    }
    md.push('**La persona**', '', cita(r.humano), '');
    if (r.numBot !== r.numPersona) md.push(`Números: ${r.numBot ? 'el bot da y la persona no' : 'la persona da y el bot no'}.`, '');
  });
  return md.join('\n');
}

(async () => {
  const filas = aprendizaje.leerTodo(archivo);
  if (!filas.length) {
    console.log(`\nNo hay nada para reproducir en ${archivo}.\n`);
    process.exit(1);
  }
  const esV2 = filas.some((f) => f.v === 2);
  const objetivos = esV2 ? aprendizaje.ejemplos(filas).filter((e) => !e.incompleto && e.tanda) : [];
  const casos = esV2 ? null : casosViejos(filas);
  const cuantos = esV2 ? objetivos.length : casos.length;

  if (GEMINI && !SI) {
    console.log('');
    console.log('--gemini usa Gemini de verdad: le manda a Google los mensajes reales de los clientes');
    console.log(`(y el historial de cada chat) y gasta tokens: ${cuantos} casos, una llamada o más por cada uno,`);
    console.log('más las tandas anteriores de cada chat en el formato v2.');
    console.log('Para seguir: npm run reproducir -- --gemini --si');
    console.log('');
    process.exit(1);
  }
  const comprension = gemini.esSoloLocal() || !config.gemini.apikey ? 'extractor local' : 'Gemini';
  if (!JSON_SALIDA) console.log(`\nReproduciendo ${cuantos} casos de ${archivo} (${comprension})...`);

  const resultados = esV2 ? await reproducirV2(filas, objetivos) : await reproducirViejos(casos);
  const s = resumir(resultados, esV2 ? 'v2' : 'viejo', comprension);
  fs.mkdirSync(path.dirname(informe), { recursive: true });
  fs.writeFileSync(informe, armarInforme(s, resultados));

  if (JSON_SALIDA) {
    console.log(JSON.stringify(s));
  } else {
    console.log('');
    for (const l of lineasDelResumen(s)) console.log(l);
    console.log('');
    console.log(`Informe con los ${Math.min(LIMITE_INFORME, resultados.length)} casos más distintos: ${informe}`);
    console.log('');
  }
  process.exit(0);
})();
