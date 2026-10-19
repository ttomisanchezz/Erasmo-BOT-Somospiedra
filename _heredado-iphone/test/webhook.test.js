'use strict';
/**
 * Prueba del webhook: el ritmo humano, la cola de mensajes y el barrido de
 * seguimiento. No necesita Docker ni WhatsApp: se reemplaza el cliente de
 * Evolution por uno de mentira que anota lo que se habría enviado.
 *
 *   node test/webhook.test.js
 *
 * Lo que verifica:
 *   1. Si el cliente parte la idea en dos mensajes, el bot contesta UNA vez
 *      teniendo en cuenta los dos. Antes se descartaba el segundo.
 *   2. El seguimiento no le escribe a un chat viejo ni manda una ráfaga.
 */
const assert = require('assert');
const path = require('path');

// Ritmo casi cero y estado aparte, para que la prueba corra rápido.
// El entorno se fija acá y no se hereda del .env: `npm test` corre desde la
// carpeta del repo, y dotenv completaría lo que falte con los valores reales.
process.env.ESPERA_MIN_MS = '30';
process.env.ESPERA_MAX_MS = '60';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = '';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'true';
process.env.SEGUIMIENTO_MINUTOS = '45';
process.env.SEGUIMIENTO_MAX_HORAS = '24';
process.env.SEGUIMIENTO_MAX_POR_BARRIDO = '2';
// Franja del seguimiento abierta todo el día: si no, de 22 a 9 los chequeos de
// seguimiento no corren y pasan sin probar nada.
process.env.SEGUIMIENTO_HORA_DESDE = '0';
// Bloque Ninjo 1b: la franja del seguimiento, también abierta todo el día.
process.env.SEGUIMIENTO_FRANJA_DESDE = '0';
process.env.SEGUIMIENTO_FRANJA_HASTA = '24';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.ESTADO_PATH = path.join(
  require('os').tmpdir(),
  'estado-webhook-test-' + Date.now() + '.json'
);
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(require('os').tmpdir(), 'apr-webhook-test-' + Date.now() + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
// Nada sale a la planilla real.
sheets.registrarLead = async () => {};

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const evolution = require('../src/evolution');
const enviados = [];
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
evolution.enviarTexto = async (numero, texto) => {
  enviados.push({ numero, texto });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.avisarGrupo = async () => ({});
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');

let fallos = 0;
function check(nombre, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => console.log('  ok   ' + nombre))
    .catch((e) => {
      fallos++;
      console.log('  FALLA ' + nombre + ' -> ' + e.message);
    });
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));
const mensaje = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false },
  pushName: 'Tomas',
  message: { conversation: texto },
});

(async () => {
  console.log('\nWebhook:');

  await check('dos mensajes seguidos se contestan juntos, no se pierde el segundo', async () => {
    enviados.length = 0;
    const chat = '5499111@s.whatsapp.net';
    // Los dos llegan casi pegados, como cuando alguien parte la idea
    bot.procesar(mensaje(chat, 'hola'));
    await dormir(5);
    await bot.procesar(mensaje(chat, 'tenes el iphone 13?'));
    await dormir(400);

    const todo = enviados.map((e) => e.texto).join(' ');
    assert.ok(enviados.length > 0, 'no contestó nada');
    assert.ok(
      /495\.000/.test(todo),
      'ignoró el segundo mensaje: no dio el precio del 13. Dijo: ' + todo.slice(0, 120)
    );
  });

  await check('el seguimiento no le escribe a un chat de hace una semana', async () => {
    enviados.length = 0;
    const chat = '5499222@s.whatsapp.net';
    const hace7dias = Date.now() - 7 * 24 * 60 * 60 * 1000;
    state.actualizar(chat, { ultimoBot: hace7dias, modelo: 'iPhone 13', historial: [] });
    await bot.revisarSeguimientos({ escribiendoMs: 1 });
    assert.strictEqual(
      enviados.length,
      0,
      'le escribió a un chat viejo: ' + JSON.stringify(enviados)
    );
  });

  await check('el seguimiento manda como mucho el tope por barrido', async () => {
    enviados.length = 0;
    const haceUnaHora = Date.now() - 60 * 60 * 1000;
    for (let i = 0; i < 10; i++) {
      state.actualizar(`54993${i}@s.whatsapp.net`, {
        ultimoBot: haceUnaHora,
        modelo: 'iPhone 13',
        historial: [],
        seguimientoEnviado: false,
      });
    }
    await bot.revisarSeguimientos({ escribiendoMs: 1 });
    assert.ok(
      enviados.length <= 2,
      `mandó ${enviados.length} seguimientos de una: eso es una ráfaga`
    );
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : `\n${fallos} fallo(s)\n`);
  try {
    require('fs').unlinkSync(process.env.ESTADO_PATH);
  } catch {
    /* da igual si no quedó archivo */
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
