'use strict';
/**
 * `npm run probar-contexto -- 549XXXXXXXXXX` (bloque Ninjo 1b, 05/10/2026): lo que src/contexto.js le
 * traería a Sonnet de Evolution para ese chat, para mirarlo antes de reiniciar el bot.
 *
 * SOLO LECTURA: le pide a Evolution los últimos 30 mensajes del chat (y de su @lid, si
 * chats-viejos.json lo tiene) con /chat/findMessages, como el bot. No carga state.js (cargarlo migra
 * y reescribe el estado real) y no escribe nada. De chats-viejos.json lee solo `idsBot` (para saber
 * qué mensajes propios mandó el bot) y `lids`.
 *
 * Imprime cuántos registros trajo, si todos son de ese chat (si llega uno de otro chat, el bot no usa
 * ninguno: el filtro de findMessages nunca se probó en la PC) y las últimas 30 líneas como las vería
 * Sonnet, con sus etiquetas. Es lo que viene de Evolution solo: en vivo se junta con el historial que
 * ya tiene el bot, sin repetir.
 *
 * Se corre desde la carpeta del bot (C:\bot-whatsapp\bot-whatsapp), que es donde están el .env y
 * data\chats-viejos.json.
 */
const path = require('path');
const config = require('../src/config');
const evolution = require('../src/evolution');
const chatsViejos = require('../src/chats-viejos');
const contexto = require('../src/contexto');

const FECHA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "05/10 14:30" (hora de Neuquén). */
function cuando(ts) {
  const p = Object.fromEntries(FECHA.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dos = (v) => String(v).padStart(2, '0');
  return `${dos(p.day)}/${dos(p.month)} ${dos(p.hour)}:${dos(p.minute)}`;
}

/** "hace 40 min", "hace 20 h", "hace 3 días" (como lo ve Sonnet). */
function haceCuanto(ts, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ahora - ts) / 60000));
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

/** Dónde está chats-viejos.json: al lado del estado (ESTADO_PATH), o en data\ de la carpeta donde se corre. */
function archivoDeViejos() {
  return config.estadoPath ? path.join(path.dirname(config.estadoPath), 'chats-viejos.json') : path.join(process.cwd(), 'data', 'chats-viejos.json');
}

async function main(args = process.argv.slice(2)) {
  const digitos = String(args[0] || '').replace(/\D/g, '');
  if (digitos.length < 10) {
    console.log('\nUso: npm run probar-contexto -- 549XXXXXXXXXX (el número completo del chat, con 549)\n');
    return 1;
  }
  const chatId = `${digitos}@s.whatsapp.net`;
  let viejos = null;
  try {
    viejos = chatsViejos.leer(archivoDeViejos());
    if (!viejos) console.log(`No encontré ${archivoDeViejos()}: sigo sin los ids del bot ni los @lid.`);
  } catch (e) {
    console.log(`No pude leer chats-viejos.json (${e.message}): sigo sin los ids del bot ni los @lid.`);
  }
  if (!config.evolution.apikey) console.log('Ojo: no hay EVOLUTION_APIKEY (¿lo corriste desde la carpeta del bot?).');
  const idsBot = new Set((viejos && viejos.idsBot) || []);
  const lid = viejos ? Object.keys(viejos.lids || {}).find((l) => viejos.lids[l] === digitos) || null : null;

  console.log(`\nChat ${chatId}${lid ? ` (y su @lid ${lid}@lid)` : ''}: le pido a Evolution los últimos ${contexto.CUANTOS} mensajes.\n`);
  let traido;
  try {
    traido = await contexto.traerCrudo(chatId, { buscar: (jid, n) => evolution.buscarMensajesDeChat(jid, n), lid });
  } catch (e) {
    console.log(`Evolution no contestó: ${e.message}. En vivo el bot seguiría como hasta ahora y lo reintentaría en 10 minutos.\n`);
    return 1;
  }
  const { registros, ajenos } = traido;
  console.log(
    `Trajo ${registros.length} registro(s): ` +
      (ajenos.length
        ? `${ajenos.length} son de OTRO chat. Evolution no filtró por chat: en vivo el bot no usaría ninguno.`
        : 'todos de este chat.')
  );
  if (ajenos.length) {
    console.log('Los de otro chat:', [...new Set(ajenos.map((r) => (r.key && r.key.remoteJid) || '?'))].slice(0, 5).join(', '));
  }
  const lineas = contexto.lineasDe(registros, { esDelBot: (id) => idsBot.has(id) }).slice(-contexto.CUANTOS);
  console.log(`\nLas últimas ${lineas.length} líneas como las vería Sonnet (de la más vieja a la más nueva):\n`);
  for (const l of lineas) console.log(`[${cuando(l.ts)} · ${haceCuanto(l.ts)}] ${contexto.etiqueta(l)}: ${String(l.texto).replace(/\s+/g, ' ')}`);
  const deLaCuenta = lineas.filter((l) => l.quien === 'vendedor');
  console.log(
    `\n${lineas.length} línea(s): ${lineas.length - deLaCuenta.length} del cliente, ` +
      `${deLaCuenta.filter((l) => !l.humano).length} del bot y ${deLaCuenta.filter((l) => l.humano).length} de una persona de la cuenta.\n` +
      'No se escribió nada.\n'
  );
  return 0;
}

if (require.main === module) {
  main()
    // Sin process.exit: en Windows, cortar con el fetch todavía cerrando tira "Assertion failed ... async.c".
    .then((codigo) => {
      process.exitCode = codigo || 0;
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}

module.exports = { main };
