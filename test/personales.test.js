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
process.env.EVOLUTION_INSTANCE = 'somospiedra';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-personales-' + Date.now() + '.json');
// Sin bot de siempre (poda de iPhone): contesta un Sonnet de mentira (test/sonnet-fijo.js).
process.env.CEREBRO_MODO = 'todos';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_SOMBRA_PERSONA_HASTA = '';
// La franja de los recordatorios abierta todo el día (el del escalado, abajo).
process.env.RECORDATORIO_HORA = '0';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.GRUPO_AVISOS_JID = '';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-personales-' + Date.now() + '.jsonl');


const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

// Contadores: si el chat se ignora de verdad, ninguno se mueve.
let pedidosDeAudio = 0;
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

const sonnetFijo = require('./sonnet-fijo').instalar();
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
  sonnetFijo.llamadas.length = 0;
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
      await bot.procesar(escrito(PERSONAL, 'hola tienen laja?'));
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

  await check('no se le pregunta a Sonnet', async () => {
    await conLista(['5492995550001'], async () => {
      limpiar();
      await bot.procesar(escrito(PERSONAL, 'tienen piedra bola? tengo 500.000'));
      await dormir(200);
      assert.strictEqual(sonnetFijo.llamadas.length, 0, 'gastó una llamada a Sonnet');
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

  await check('no le suena el recordatorio del escalado aunque ya estuviera en estado.json', async () => {
    // Se simula un chat personal guardado y escalado ANTES de cargar la lista negra (el resumen de la
    // mañana, que era el otro lugar donde salía, quedó en _heredado-iphone/ con la poda).
    const viejo = '5492995550777@s.whatsapp.net';
    const hace = Date.now() - 60 * 60 * 1000;
    state.actualizar(viejo, {
      nombre: 'Tia',
      escalado: true,
      escaladoEn: hace,
      escaladoCalla: true,
      escaladoMotivo: 'algo',
      historial: [{ quien: 'cliente', texto: 'hola', ts: hace + 1000 }],
    });
    limpiar();
    await bot.revisarEscalados();
    assert.ok(alGrupo.some((t) => /5550777/.test(t)), 'el caso no prueba nada: no sonaba ni antes');
    state.actualizar(viejo, { escaladoRecordado: null });
    await conLista(['5492995550777'], async () => {
      limpiar();
      await bot.revisarEscalados();
      assert.ok(!alGrupo.some((t) => /5550777|Tia/.test(t)), 'el contacto personal sigue sonando en el recordatorio');
    });
  });

  console.log('\nExcluidos por comando (#excluir): la lista del estado cuenta igual que CONTACTOS_PERSONALES\n');

  // Números inventados. La lista vive en estado.json, bajo la clave interna (src/excluidos.js la llena).
  const EXCLUIDO = '5490000000801@s.whatsapp.net';
  const excluir = (numero) => state.guardarExcluido(numero, { desde: Date.now(), nombre: null, origen: 'grupo' });

  await check('un número excluido en el estado es contacto personal, con o sin el 9, y deja de serlo al sacarlo', () => {
    assert.strictEqual(evolution.esContactoPersonal(EXCLUIDO), false);
    excluir('5490000000801');
    try {
      assert.strictEqual(evolution.esContactoPersonal(EXCLUIDO), true);
      assert.strictEqual(evolution.esContactoPersonal('540000000801@s.whatsapp.net'), true);
      assert.strictEqual(evolution.motivoContactoPersonal(EXCLUIDO), 'excluido');
    } finally {
      state.borrarExcluido('5490000000801');
    }
    assert.strictEqual(evolution.esContactoPersonal(EXCLUIDO), false);
    assert.strictEqual(evolution.motivoContactoPersonal(EXCLUIDO), null);
  });

  await check('el motivo dice de dónde viene: CONTACTOS_PERSONALES (el .env) antes que el excluido', async () => {
    excluir('5490000000802');
    try {
      await conLista(['5490000000802'], async () => {
        assert.strictEqual(evolution.motivoContactoPersonal('5490000000802@s.whatsapp.net'), 'CONTACTOS_PERSONALES');
      });
      assert.strictEqual(evolution.motivoContactoPersonal('5490000000802@s.whatsapp.net'), 'excluido');
    } finally {
      state.borrarExcluido('5490000000802');
    }
  });

  await check('el grupo de avisos nunca cuenta, aunque su número esté en la lista de excluidos', () => {
    const antes = config.grupoAvisos;
    config.grupoAvisos = '120363000000000000@g.us';
    excluir('120363000000000000');
    try {
      assert.strictEqual(evolution.esContactoPersonal(config.grupoAvisos), false);
      assert.strictEqual(evolution.motivoContactoPersonal(config.grupoAvisos), null);
    } finally {
      config.grupoAvisos = antes;
      state.borrarExcluido('120363000000000000');
    }
  });

  await check('la lista vive bajo la clave interna: no crea el chat, queda en estado.json y se borra de ahí', () => {
    const enDisco = () => JSON.parse(fs.readFileSync(process.env.ESTADO_PATH, 'utf8'))['bot:interno'] || {};
    excluir('5490000000803');
    try {
      assert.ok(!state.todos()['5490000000803@s.whatsapp.net'], 'le creó un chat al excluirlo');
      assert.ok(state.numerosExcluidos().includes('5490000000803'));
      assert.ok((enDisco().excluidos || {})['5490000000803'], 'no quedó en disco al instante');
    } finally {
      state.borrarExcluido('5490000000803');
    }
    assert.ok(!state.numerosExcluidos().includes('5490000000803'));
    assert.ok(!(enDisco().excluidos || {})['5490000000803'], 'sigue en disco después de sacarlo');
  });

  await check('una lista de excluidos dañada (estado.json tocado a mano) se lee vacía sin pisarla; recién #excluir la rehace', () => {
    // En otro proceso, como el bot: state.js lee el archivo al cargarse. El cwd es la carpeta temporal, así
    // dotenv no encuentra ningún .env.
    const { execFileSync } = require('child_process');
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'excluidos-danados-'));
    const STATE_JS = path.join(__dirname, '..', 'src', 'state.js');
    try {
      for (const danado of [['5490000000806'], null, '5490000000806', 5]) {
        const archivo = path.join(dir, 'estado.json');
        fs.writeFileSync(archivo, JSON.stringify({ 'bot:interno': { esquema: 3, excluidos: danado } }));
        const salida = execFileSync(
          process.execPath,
          [
            '-e',
            `console.log = () => {}; console.error = () => {}; const s = require(${JSON.stringify(STATE_JS)});` +
              `process.stdout.write(JSON.stringify({ numeros: s.numerosExcluidos(), leer: s.leerExcluidos() }));`,
          ],
          { cwd: dir, env: { ...process.env, ESTADO_PATH: archivo }, encoding: 'utf8' }
        );
        assert.deepStrictEqual(JSON.parse(salida), { numeros: [], leer: {} });
        const enDisco = JSON.parse(fs.readFileSync(archivo, 'utf8'))['bot:interno'].excluidos;
        assert.deepStrictEqual(enDisco, danado, 'leer la lista la arregló y la pisó en disco');
        // Recién un #excluir (guardarExcluido) la rehace como objeto.
        execFileSync(
          process.execPath,
          [
            '-e',
            `console.log = () => {}; console.error = () => {}; const s = require(${JSON.stringify(STATE_JS)});` +
              `s.guardarExcluido('5490000000807', { desde: 1, nombre: null, origen: 'grupo' });`,
          ],
          { cwd: dir, env: { ...process.env, ESTADO_PATH: archivo }, encoding: 'utf8' }
        );
        assert.deepStrictEqual(Object.keys(JSON.parse(fs.readFileSync(archivo, 'utf8'))['bot:interno'].excluidos), ['5490000000807']);
      }
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  await check('un excluido por comando se ignora entero: ni estado, ni Sonnet, ni respuesta', async () => {
    excluir('5490000000804');
    try {
      limpiar();
      await bot.procesar(escrito('5490000000804@s.whatsapp.net', 'hola tienen laja?'));
      await dormir(200);
      assert.strictEqual(aClientes.length, 0, 'le contestó a un excluido');
      assert.strictEqual(sonnetFijo.llamadas.length, 0, 'gastó una llamada a Sonnet');
      assert.ok(!state.todos()['5490000000804@s.whatsapp.net'], 'guardó el chat de un excluido');
    } finally {
      state.borrarExcluido('5490000000804');
    }
  });

  console.log('\nLos que NO están en la lista siguen como siempre\n');

  await check('un cliente normal recibe respuesta', async () => {
    await conLista(['5492995550001'], async () => {
      limpiar();
      await bot.procesar(escrito(CLIENTE, 'hola tienen laja?'));
      await dormir(250);
      assert.ok(aClientes.length > 0, 'dejó de contestarle a un cliente que no está en la lista');
      assert.ok(sonnetFijo.llamadas.length > 0, 'no le preguntó a Sonnet por un cliente');
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
