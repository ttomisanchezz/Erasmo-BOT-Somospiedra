'use strict';
/**
 * `npm run sombra`: repite tandas reales del registro de aprendizaje contra el cerebro Sonnet
 * (fase 1, decisión de Tomás del 01/10/2026) y las pone al lado de lo que contestó el bot de verdad
 * y la persona. Sirve para comparar antes de la fase 2 (Sonnet en vivo). No es un test.
 *
 *   npm run sombra -- --desde 2026-09-30 --hasta 2026-10-02 --max 20
 *   npm run sombra -- --archivo <ruta>        otro registro (por defecto data/aprendizaje-v2.jsonl)
 *   npm run sombra -- --informe <ruta>        dónde va el informe (por defecto data/sombra-AAAA-MM-DD.md)
 *   npm run sombra -- --planilla-en-vivo      precios de la planilla de hoy, solo lectura (por defecto,
 *                                             la copia congelada de test/fixture-planilla.js)
 *
 * Sin --desde: desde hace 2 días. Sin --hasta: hoy. Sin --max: 20. Las fechas son días de Argentina.
 *
 * GASTA PLATA: cada tanda son de 1 a 5 llamadas a la API de Anthropic con ANTHROPIC_API_KEY (del
 * .env de la carpeta donde se corre) y le manda el historial del chat (sin el número ni el nombre).
 * El informe dice cuánto costó. Solo sale a Anthropic (y a Google Sheets con --planilla-en-vivo).
 *
 * Cómo arma cada tanda: por chat y en orden, las líneas del cliente, las de la persona y lo que el
 * bot mandó en vivo (las propuestas `modo: 'vivo'`) entran al historial con su hora; lo de escucha
 * o borrador no (no le llegó al cliente). Con la hora de la tanda se le pregunta a Sonnet. El
 * estado del chat (modelo, entrega, temas explicados) NO se reconstruye: Sonnet ve el historial y
 * las líneas de persona, no "lo que el sistema ya sabe". Estado y aprendizaje en temporales: solo
 * escribe el informe.
 */
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRINCIPAL = require.main === module;
if (PRINCIPAL) {
  // Antes de requerir nada: config.js lee las variables al cargarse.
  const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'sombra-'));
  process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
  process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
  process.env.ESTADO_SOLO_LECTURA = '';
  process.env.MODO_ESCUCHA = 'true';
  process.env.MODO_BORRADOR = 'false';
  process.env.NUMEROS_PRUEBA = '';
  process.env.NUMEROS_TESTER = '';
  process.env.NUMEROS_PILOTO = '';
  process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));
}

const state = require('../src/state');
const config = require('../src/config');
const cerebro = require('../src/cerebro');
const aprendizaje = require('../src/aprendizaje');

const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
const HORA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
const diaDe = (ts) => DIA.format(new Date(ts));
function horaDe(ts) {
  const p = Object.fromEntries(HORA.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  return `${p.year}-${p.month}-${p.day} ${p.hour}:${p.minute}`;
}

/** Las tandas a repetir: propuestas del bot de esos días (de Argentina), las primeras `max`, en orden. */
function elegirTandas(eventos, { desde, hasta, max }) {
  return (eventos || [])
    .filter((e) => e && e.v === 2 && e.tipo === 'propuesta' && e.tanda && Array.isArray(e.lineas) && e.lineas.length)
    .filter((e) => {
      const d = diaDe(e.ts);
      return (!desde || d >= desde) && (!hasta || d <= hasta);
    })
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts))
    .slice(0, max);
}

/**
 * Repite las tandas elegidas. Devuelve, por tanda: { tanda, chat, ts, cliente, bot, persona, sonnet },
 * con `sonnet` lo que devolvió `cerebro.pensar`.
 */
async function repetir({ eventos, desde, hasta, max = 20 }) {
  const quiero = new Set(elegirTandas(eventos, { desde, hasta, max }).map((e) => e.tanda));
  const persona = new Map();
  const porChat = new Map();
  (eventos || []).forEach((e, i) => {
    if (!e || e.v !== 2) return;
    if (e.tipo === 'humano' && e.responde) persona.set(e.responde, [...(persona.get(e.responde) || []), e.texto]);
    const grupo = e.clave || e.chat;
    if (!porChat.has(grupo)) porChat.set(grupo, []);
    porChat.get(grupo).push({ e, i });
  });

  // Cada línea entra al historial con su hora de verdad (el saludo, "hace cuánto", las 72 h).
  const ahoraReal = Date.now;
  const conHora = (ts, fn) => {
    Date.now = () => ts;
    try {
      fn();
    } finally {
      Date.now = ahoraReal;
    }
  };

  const resultados = [];
  let k = 0;
  for (const lista of porChat.values()) {
    lista.sort((a, b) => Date.parse(a.e.ts) - Date.parse(b.e.ts) || a.i - b.i);
    let quedan = lista.filter(({ e }) => e.tipo === 'propuesta' && quiero.has(e.tanda)).length;
    if (!quedan) continue;
    const chatId = `sombra-${k++}-${ahoraReal()}@s.whatsapp.net`;
    const lineas = new Map();
    for (const { e } of lista) {
      if (!quedan) break;
      const ts = Date.parse(e.ts);
      if (e.tipo === 'cliente') {
        lineas.set(e.id, e);
        conHora(ts, () => state.agregarAlHistorial(chatId, 'cliente', e.texto));
      } else if (e.tipo === 'humano') {
        conHora(ts, () => state.agregarAlHistorial(chatId, 'vendedor', e.texto, { humano: true }));
      } else if (e.tipo === 'propuesta') {
        if (quiero.has(e.tanda)) {
          quedan--;
          const suyas = (e.lineas || []).map((id) => lineas.get(id)).filter(Boolean);
          if (suyas.length) {
            const sonnet = await cerebro.pensar({ chatId, mensaje: suyas.map((c) => c.texto).join('\n'), nombre: '', ahora: ts });
            resultados.push({
              tanda: e.tanda,
              chat: e.chat,
              ts: e.ts,
              cliente: suyas.map((c) => c.texto),
              bot: { mensajes: e.mensajes || [], escalar: Boolean(e.escalar), motivo: e.motivo || '', modo: e.modo || null },
              persona: persona.get(e.tanda) || [],
              sonnet,
            });
          }
        }
        // Lo que el bot mandó de verdad es parte del contexto de lo que sigue; lo de escucha o borrador, no.
        if (e.modo === 'vivo') for (const m of e.mensajes || []) conHora(ts, () => state.agregarAlHistorial(chatId, 'vendedor', m));
      }
    }
    state.reiniciar(chatId);
  }
  return resultados.sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

const cita = (t) =>
  String(t || '')
    .split('\n')
    .map((l) => '> ' + l)
    .join('\n');
const usd = (n) => `US$${(Number(n) || 0).toFixed(4)}`;
const tokens = (u) => `entrada ${u.entrada} · salida ${u.salida} · caché leída ${u.cacheLeida} · caché escrita ${u.cacheEscrita}`;

function queHaceSonnet(r) {
  if (r.error) return `error: ${r.error}`;
  if (!r.escalar) return `contesta (${r.mensajes.length} mensaje${r.mensajes.length === 1 ? '' : 's'})`;
  return `escala: ${r.motivo}`;
}

/** El informe en Markdown: por tanda, y al final el total de USD y el promedio por tanda. */
function armarInforme(resultados, { archivo = '', desde = '', hasta = '', planilla = '' } = {}) {
  const total = { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 };
  let totalUsd = 0;
  for (const { sonnet } of resultados) {
    for (const k of Object.keys(total)) total[k] += (sonnet.uso && sonnet.uso[k]) || 0;
    totalUsd += Number(sonnet.usd) || 0;
  }
  const n = resultados.length;
  const ok = resultados.filter((r) => !r.sonnet.error);
  const md = [
    `# Cerebro Sonnet en sombra: ${n} tandas reales`,
    '',
    `\`npm run sombra\`: qué contestaría ${config.cerebro.modelo} (esfuerzo ${config.cerebro.esfuerzo}) a tandas reales, al lado de lo que contestó el bot de verdad y la persona. No se mandó nada. El estado del chat no se reconstruye: Sonnet ve el historial y las líneas de persona.`,
    '',
    `Registro: ${archivo} · tandas del ${desde || 'principio'} al ${hasta || 'final'} · precios: ${planilla}`,
    '',
    '## Resumen',
    '',
    `- Tandas: ${n}${n - ok.length ? ` (con error: ${n - ok.length})` : ''}`,
    `- Sonnet contesta: ${ok.filter((r) => !r.sonnet.escalar).length} · escala: ${ok.filter((r) => r.sonnet.escalar).length} (la guardia frenó: ${ok.filter((r) => r.sonnet.guardia).length})`,
    `- El bot contestó: ${resultados.filter((r) => r.bot.mensajes.length).length} · escaló sin contestar: ${resultados.filter((r) => !r.bot.mensajes.length && r.bot.escalar).length}`,
    `- Tokens: ${tokens(total)}`,
    `- USD: total ${usd(totalUsd)} · promedio por tanda ${usd(n ? totalUsd / n : 0)}`,
    '',
  ];
  resultados.forEach((r, i) => {
    const s = r.sonnet;
    md.push(`## ${i + 1}. ${r.chat} · ${horaDe(r.ts)} (Argentina)`, '');
    md.push('**Cliente**', '', cita(r.cliente.join('\n')), '');
    const bot = r.bot.mensajes.length ? `contestó${r.bot.escalar ? ` y escaló: ${r.bot.motivo}` : ''}` : r.bot.escalar ? `escaló sin contestar: ${r.bot.motivo}` : 'no contestó';
    md.push(`**El bot de verdad** (${r.bot.modo || '?'}): ${bot}`, '');
    if (r.bot.mensajes.length) md.push(cita(r.bot.mensajes.join('\n')), '');
    if (r.persona.length) md.push('**La persona**', '', cita(r.persona.join('\n')), '');
    md.push(`**Sonnet**: ${queHaceSonnet(s)}`, '');
    if (!s.error && s.mensajes.length) md.push(cita(s.mensajes.join('\n')), '');
    if (s.guardia) md.push(`Guardia: frenó (${s.guardia}). Lo que quería mandar:`, '', cita((s.frenados || []).join('\n')), '');
    else if (!s.error) md.push('Guardia: pasó.', '');
    const uso = s.uso || { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 };
    md.push(`Tokens: ${tokens(uso)} · ${usd(s.usd)} · ${s.ms} ms${s.herramientas && s.herramientas.length ? ` · herramientas: ${s.herramientas.join(', ')}` : ''}`, '');
  });
  md.push('## Total', '', `${n} tandas · ${tokens(total)} · total ${usd(totalUsd)} · promedio por tanda ${usd(n ? totalUsd / n : 0)}`, '');
  return md.join('\n');
}

async function main() {
  const args = process.argv.slice(2);
  const valor = (flag) => {
    const i = args.indexOf(flag);
    return i > -1 ? args[i + 1] || '' : null;
  };
  for (const flag of ['--desde', '--hasta', '--max', '--archivo', '--informe']) {
    if (valor(flag) === '') {
      console.log(`\nFalta el valor después de ${flag}.\n`);
      process.exit(1);
    }
  }
  const esFecha = (d) => /^\d{4}-\d{2}-\d{2}$/.test(d);
  const desde = valor('--desde') || diaDe(Date.now() - 2 * 24 * 3600 * 1000);
  const hasta = valor('--hasta') || diaDe(Date.now());
  const max = parseInt(valor('--max') || '20', 10);
  if (!esFecha(desde) || !esFecha(hasta) || !(max > 0)) {
    console.log('\nUso: npm run sombra -- --desde AAAA-MM-DD --hasta AAAA-MM-DD --max 20\n');
    process.exit(1);
  }
  const DATA = path.join(__dirname, '..', 'data');
  const archivo = valor('--archivo') || path.join(DATA, 'aprendizaje-v2.jsonl');
  const informe = valor('--informe') || path.join(DATA, `sombra-${diaDe(Date.now())}.md`);
  const enVivo = args.includes('--planilla-en-vivo');

  if (!config.cerebro.apikey) {
    console.log('\nFalta ANTHROPIC_API_KEY en el .env: sin la clave no hay nada que repetir.\n');
    process.exit(1);
  }
  // Solo sale a Anthropic (y a Google Sheets, solo lectura, con --planilla-en-vivo). Nunca a Gemini.
  require('../src/gemini').usarSoloLocal(true);
  const sheets = require('../src/sheets');
  if (!enVivo) sheets.usarFixture(require('./fixture-planilla'));
  const fetchReal = globalThis.fetch;
  globalThis.fetch = (url, ...resto) => {
    const u = String(url);
    if (u.startsWith('https://api.anthropic.com/')) return fetchReal(url, ...resto);
    if (enVivo && /^https:\/\/(?:sheets|oauth2|www)\.googleapis\.com\//.test(u)) return fetchReal(url, ...resto);
    throw new Error(`sombra no sale a ${u.split('?')[0]}`);
  };

  const eventos = aprendizaje.leerTodo(archivo);
  if (!eventos.length) {
    console.log(`\nNo hay nada para repetir en ${archivo}.\n`);
    process.exit(1);
  }
  const cuantas = elegirTandas(eventos, { desde, hasta, max }).length;
  console.log(`\nRepitiendo ${cuantas} tandas del ${desde} al ${hasta} con ${config.cerebro.modelo} (de 1 a 5 llamadas a la API cada una)...`);
  const resultados = await repetir({ eventos, desde, hasta, max });
  const md = armarInforme(resultados, { archivo, desde, hasta, planilla: enVivo ? 'planilla de hoy (solo lectura)' : 'copia congelada (test/fixture-planilla.js)' });
  fs.mkdirSync(path.dirname(informe), { recursive: true });
  fs.writeFileSync(informe, md);
  const resumen = md.split('\n').filter((l) => l.startsWith('- '));
  console.log('');
  for (const l of resumen) console.log(l);
  console.log(`\nInforme: ${informe}\n`);
  process.exit(0);
}

if (PRINCIPAL) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}

module.exports = { elegirTandas, repetir, armarInforme };
