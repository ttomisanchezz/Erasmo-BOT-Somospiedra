'use strict';
/**
 * Lista negra de contactos personales (CONTACTOS_PERSONALES).
 *
 *   node test/personales.test.js
 *
 * Un chat de esa lista se ignora ENTERO. No alcanza con que el bot no conteste:
 * tampoco tiene que guardarse, ni ir a Gemini, ni transcribirse el audio, ni
 * aparecer en el resumen. Cada una de esas promesas tiene su caso acá.
 *
 * El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

process.env.ESPERA_MIN_MS = '5';
process.env.ESPERA_MAX_MS = '10';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.AUDIO_ACTIVO = 'true';
process.env.CONTACTOS_PERSONALES = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-personales-' + Date.now() + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-personales-' + Date.now() + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');
const resumen = require('../src/resumen');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

// Contadores: si el chat se ignora de verdad, ninguno se mueve.
let llamadasAGemini = 0;
let pedidosDeAudio = 0;
const local = require('../src/extractor-local');
gemini.entender = async (h, m) => {
  llamadasAGemini++;
  return local.entender(m);
};
gemini.transcribir = async () => 'hola como va todo, te llamo despues';
evolution.base64DeMedia = async () => {
  pedidosDeAudio++;
  return { base64: 'AAAA', mimetype: 'audio/ogg' };
};

const aClientes = [];
const alGrupo = [];
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
evolution.enviarTexto = async (numero, texto) => {
  aClientes.push({ numero, texto });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => respuestaEvolution(numero);
evolution.enviarDocumento = async (numero) => respuestaEvolution(numero);
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const aprendizaje = require('../src/aprendizaje');

const PERSONAL = '5492995550001@s.whatsapp.net';
const CLIENTE = '5492995559999@s.whatsapp.net';

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
const escrito = (chatId, texto, fromMe = false) => ({
  key: { remoteJid: chatId, fromMe, id: 'T' + Math.random() },
  pushName: 'Alguien',
  message: { conversation: texto },
});
const notaDeVoz = (chatId) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'A' + Math.random() },
  pushName: 'Alguien',
  message: { audioMessage: { mimetype: 'audio/ogg', seconds: 5, ptt: true } },
});

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  llamadasAGemini = 0;
  pedidosDeAudio = 0;
}

/** Corre algo con la lista negra puesta y después la deja como estaba. */
async function conLista(lista, fn) {
  const antes = config.contactosPersonales;
  config.contactosPersonales = lista;
  try {
    await fn();
  } finally {
    config.contactosPersonales = antes;
  }
}

(async () => {
  console.log('\nReconocimiento de números\n');

  await check('lista vacía: nadie es contacto personal', () => {
    assert.deepStrictEqual(config.contactosPersonales, []);
    assert.strictEqual(evolution.esContactoPersonal(PERSONAL), false);
  });

  await check('usa la misma normalización que la lista blanca (el 9 del medio)', async () => {
    await conLista(['5492995550001'], async () => {
      assert.strictEqual(evolution.esContactoPersonal('5492995550001@s.whatsapp.net'), true);
      assert.strictEqual(evolution.esContactoPersonal('542995550001@s.whatsapp.net'), true);
    });
    await conLista(['542995550001'], async () => {
      assert.strictEqual(evolution.esContactoPersonal('5492995550001@s.whatsapp.net'), true);
    });
  });

  await check('mantiene el piso de 8 dígitos: no habilita medio mundo', async () => {
    await conLista(['1'], async () => {
      assert.strictEqual(evolution.esContactoPersonal(CLIENTE), false);
    });
  });

  await check('el grupo de avisos nunca cuenta como personal', async () => {
    const antes = config.grupoAvisos;
    config.grupoAvisos = '120363000000000000@g.us';
    try {
      await conLista([config.grupoAvisos.split('@')[0]], async () => {
        assert.strictEqual(evolution.esContactoPersonal(config.grupoAvisos), false);
      });
    } finally {
      config.grupoAvisos = antes;
    }
  });

  console.log('\nUn chat de la lista se ignora entero\n');

  await check('no se le contesta y no se escala', async () => {
    await conLista(['5492995550001'], async () => {
      limpiar();
      await bot.procesar(escrito(PERSONAL, 'hola tenes el iphone 13?'));
      await dormir(200);
      assert.strictEqual(aClientes.length, 0, 'le contestó a un contacto personal');
      assert.strictEqual(alGrupo.length, 0, 'escaló por un contacto personal');
    });
  });

  await check('no se guarda en estado.json', async () => {
    await conLista(['5492995550001'], async () => {
      await bot.procesar(escrito(PERSONAL, 'otro mensaje mas'));
      await dormir(100);
      assert.ok(!state.todos()[PERSONAL], 'quedó guardado en el estado');
    });
  });

  await check('no se llama a Gemini', async () => {
    await conLista(['5492995550001'], async () => {
      limpiar();
      await bot.procesar(escrito(PERSONAL, 'tenes el 14 pro? tengo 500.000'));
      await dormir(200);
      assert.strictEqual(llamadasAGemini, 0, 'gastó una llamada a Gemini');
    });
  });

  await check('no se le transcriben los audios', async () => {
    await conLista(['5492995550001'], async () => {
      limpiar();
      await bot.procesar(notaDeVoz(PERSONAL));
      await dormir(200);
      assert.strictEqual(pedidosDeAudio, 0, 'bajó el audio de un contacto personal');
    });
  });

  await check('tampoco se procesan sus mensajes propios (fromMe)', async () => {
    await conLista(['5492995550001'], async () => {
      limpiar();
      await bot.procesar(escrito(PERSONAL, 'le contesto yo', true));
      await dormir(100);
      assert.ok(!state.todos()[PERSONAL], 'guardó estado por un mensaje propio');
      assert.strictEqual(aprendizaje.leerTodo().filter((r) => r.texto === 'le contesto yo').length, 0);
    });
  });

  await check('no aparece en el resumen aunque ya estuviera en estado.json', async () => {
    // Se simula un chat personal guardado ANTES de cargar la lista negra.
    const viejo = '5492995550777@s.whatsapp.net';
    state.actualizar(viejo, {
      nombre: 'Tia',
      modelo: 'iPhone 13',
      historial: [{ quien: 'cliente', texto: 'hola', ts: Date.now() }],
    });
    const sinLista = resumen.armar(state.todos(), 3).join('\n');
    assert.ok(/5550777|Tia/.test(sinLista), 'el caso no prueba nada: no salía ni antes');

    await conLista(['5492995550777'], async () => {
      const conLaLista = resumen.armar(state.todos(), 3).join('\n');
      assert.ok(!/5550777/.test(conLaLista), 'el contacto personal sigue saliendo en el resumen');
      assert.ok(!/Tia/.test(conLaLista), 'el contacto personal sigue saliendo en el resumen');
    });
  });

  console.log('\nLos que NO están en la lista siguen como siempre\n');

  await check('un cliente normal recibe respuesta', async () => {
    await conLista(['5492995550001'], async () => {
      limpiar();
      await bot.procesar(escrito(CLIENTE, 'hola tenes el iphone 13?'));
      await dormir(250);
      assert.ok(aClientes.length > 0, 'dejó de contestarle a un cliente que no está en la lista');
      assert.ok(llamadasAGemini > 0, 'no analizó el mensaje de un cliente');
      assert.ok(state.todos()[CLIENTE], 'no guardó el chat de un cliente');
    });
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
