'use strict';
/**
 * Lista blanca de prueba (NUMEROS_PRUEBA).
 *
 * Con la lista vacía el bot se comporta igual que siempre. Con contenido,
 * SOLO le escribe a esos números; a cualquier otro lo trata como si
 * MODO_BORRADOR siguiera en true.
 *
 *   node test/lista-blanca.test.js
 *
 * El entorno se fija acá a propósito y no se hereda del .env: si la prueba
 * leyera SEGUIMIENTO_ACTIVO del .env de la máquina, los casos del barrido
 * pasarían en vacío el día que esté apagado, y un verde no significaría nada.
 */
const assert = require('assert');
const path = require('path');
const os = require('os');

process.env.ESPERA_MIN_MS = '20';
process.env.ESPERA_MAX_MS = '40';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = '';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.SEGUIMIENTO_ACTIVO = 'true';
process.env.SEGUIMIENTO_HORA_DESDE = '0';
// Bloque Ninjo 1b: la franja del seguimiento, también abierta todo el día.
process.env.SEGUIMIENTO_FRANJA_DESDE = '0';
process.env.SEGUIMIENTO_FRANJA_HASTA = '24';
process.env.SEGUIMIENTO_HORA_HASTA = '24';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-lista-blanca-' + Date.now() + '.json');
// Desde el bloque 6 cada mensaje del cliente escribe un evento de aprendizaje: sin esto,
// esta prueba escribía en el registro real (data/aprendizaje-v2.jsonl).
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-lista-blanca-' + Date.now() + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));

const config = require('../src/config');
const evolution = require('../src/evolution');

// Se guardan los reales ANTES de pisarlos: el respaldo del transporte se
// prueba contra las funciones de verdad, no contra los dobles.
const realEnviarTexto = evolution.enviarTexto;
const realEnviarImagen = evolution.enviarImagen;
const realEnviarDocumento = evolution.enviarDocumento;

const aClientes = [];
const alGrupo = [];
// Evolution v2 contesta cada envío con el id del mensaje. Sin id, index.js no
// confirma ni la autoría ni las marcas de 'ya se dijo' (bloque 3).
let idEnvio = 0;
const respuestaEvolution = (numero) => ({
  key: { remoteJid: numero, fromMe: true, id: 'EV' + ++idEnvio },
});
evolution.enviarTexto = async (numero, texto) => {
  aClientes.push({ numero, texto, tipo: 'texto' });
  return respuestaEvolution(numero);
};
evolution.enviarImagen = async (numero) => {
  aClientes.push({ numero, tipo: 'imagen' });
  return respuestaEvolution(numero);
};
evolution.enviarDocumento = async (numero) => {
  aClientes.push({ numero, tipo: 'documento' });
  return respuestaEvolution(numero);
};
evolution.avisarGrupo = async (texto) => {
  alGrupo.push(texto);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');

const GRUPO = '120363000000000000@g.us';
config.grupoAvisos = GRUPO; // fijo, para no depender del .env de la máquina

const DENTRO = '5491100000001@s.whatsapp.net';
const FUERA = '5491100000002@s.whatsapp.net';

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

/**
 * Corre algo con las listas puestas (tester y/o piloto, Pendientes 1, Parte C) y
 * después las deja como estaban. `conLista` es la de siempre: solo el tester.
 */
async function conListas({ tester = [], piloto = [] }, fn) {
  const antes = { tester: config.numerosTester, piloto: config.numerosPiloto };
  config.numerosTester = tester;
  config.numerosPiloto = piloto;
  try {
    await fn();
  } finally {
    config.numerosTester = antes.tester;
    config.numerosPiloto = antes.piloto;
  }
}
const conLista = (lista, fn) => conListas({ tester: lista }, fn);

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}

(async () => {
  console.log('\nLista blanca de prueba:\n');

  // ------------------------------------------------------------------ (a)
  await check('(a) lista VACIA: le escribe a cualquiera, como siempre', async () => {
    assert.deepStrictEqual(config.numerosTester, [], 'la lista del tester tendría que arrancar vacía');
    assert.deepStrictEqual(config.numerosPiloto, [], 'la lista del piloto tendría que arrancar vacía');
    assert.strictEqual(evolution.esDestinoDePrueba(FUERA), true);
    assert.strictEqual(evolution.esDestinoDePrueba('549999999@s.whatsapp.net'), true);

    limpiar();
    await bot.procesar(mensaje(FUERA, 'tenes el iphone 13?'));
    await dormir(300);
    assert.ok(aClientes.length > 0, 'con la lista vacía tendría que haberle escrito');
  });

  // ------------------------------------------------------------------ (b)
  await check('(b) destino EN la lista: le escribe', async () => {
    await conLista(['5491100000001'], async () => {
      assert.strictEqual(evolution.esDestinoDePrueba(DENTRO), true);
      limpiar();
      await bot.procesar(mensaje(DENTRO, 'tenes el iphone 13?'));
      await dormir(300);
      assert.ok(aClientes.length > 0, 'no le escribió a un número habilitado');
      assert.ok(
        aClientes.every((m) => m.numero === DENTRO),
        'le escribió a alguien que no era el habilitado'
      );
    });
  });

  // ------------------------------------------------------------------ (c)
  await check(
    '(c) destino FUERA de la lista con MODO_BORRADOR=false: no le escribe, el borrador va al grupo',
    async () => {
      await conLista(['5491100000001'], async () => {
        assert.strictEqual(config.modoBorrador, false, 'el caso exige MODO_BORRADOR=false');
        assert.strictEqual(evolution.esDestinoDePrueba(FUERA), false);
        limpiar();
        await bot.procesar(mensaje(FUERA, 'tenes el iphone 14?'));
        await dormir(300);
        assert.strictEqual(
          aClientes.length,
          0,
          'le escribió a un número fuera de la lista: ' + JSON.stringify(aClientes)
        );
        assert.strictEqual(alGrupo.length, 1, 'el borrador no llegó al grupo');
        assert.ok(/BORRADOR/.test(alGrupo[0]), 'lo que fue al grupo no es un borrador');
      });
    }
  );

  // ------------------------------------------------------------------ (d)
  await check('(d) el grupo de avisos nunca queda filtrado', async () => {
    await conLista(['5491100000001'], async () => {
      assert.strictEqual(evolution.esDestinoDePrueba(GRUPO), true);
    });
    // Ni siquiera con una lista que no lo incluye de ninguna forma
    await conLista(['5491199999999'], async () => {
      assert.strictEqual(evolution.esDestinoDePrueba(GRUPO), true);
    });
  });

  // ------------------------------------------------------------------ (e)
  await check('(e) matchea con y sin el 9 (549... vs 54...)', async () => {
    // Cargada CON el 9, el JID viene sin él
    await conLista(['5491100000001'], async () => {
      assert.strictEqual(evolution.esDestinoDePrueba('541100000001@s.whatsapp.net'), true);
    });
    // Cargada SIN el 9, el JID viene con él
    await conLista(['541100000001'], async () => {
      assert.strictEqual(evolution.esDestinoDePrueba('5491100000001@s.whatsapp.net'), true);
    });
    // Y un número que no es, sigue sin matchear
    await conLista(['5491100000001'], async () => {
      assert.strictEqual(evolution.esDestinoDePrueba('5491177777777@s.whatsapp.net'), false);
    });
  });

  // ------------------------------------------------------------------ (f)
  await check('(f) seguimiento: un chat fuera de la lista no recibe nada', async () => {
    await conLista(['5491100000001'], async () => {
      const haceUnaHora = Date.now() - 60 * 60 * 1000;
      for (const chat of [DENTRO, FUERA]) {
        state.actualizar(chat, {
          ultimoBot: haceUnaHora,
        ultimoEnvioCliente: haceUnaHora,
          // Bloque Ninjo 1b: el seguimiento sale 3 h después de un precio del bot que le llegó.
          ultimoPrecioBot: haceUnaHora - 3 * 60 * 60 * 1000,
          ultimoHumano: 0,
          modelo: 'iPhone 13',
          historial: [],
          seguimientoEnviado: false,
          escalado: false,
          pausado: false,
        });
      }
      limpiar();
      await bot.revisarSeguimientos({ escribiendoMs: 1 });

      const aFuera = aClientes.filter((m) => m.numero === FUERA);
      assert.strictEqual(aFuera.length, 0, 'el seguimiento le escribió a un chat fuera de la lista');
      // Control: si no le escribiera a NADIE, el caso pasaría en vacío
      const aDentro = aClientes.filter((m) => m.numero === DENTRO);
      assert.ok(aDentro.length > 0, 'no le escribió tampoco al habilitado: el caso pasaría en vacío');
    });
  });

  // ------------------------------------------- tester y piloto (Pendientes 1, Parte C)
  // NUMEROS_PRUEBA hacía tres cosas: habilitar el envío real, habilitar los comandos
  // `#` y mandar el lead a LEADS_PRUEBA. Ahora son dos listas: NUMEROS_TESTER (el
  // celular de prueba: envío, `#` y LEADS_PRUEBA) y NUMEROS_PILOTO (clientes reales de
  // la prueba: envío, sin `#`, lead en LEADS y aparecen en el resumen).
  const PILOTO = '5491100000003@s.whatsapp.net';

  await check('(g) tester y piloto: se les escribe a los dos; a un tercero no', async () => {
    await conListas({ tester: ['5491100000001'], piloto: ['5491100000003'] }, async () => {
      assert.strictEqual(evolution.esDestinoDePrueba(DENTRO), true, 'no deja pasar al tester');
      assert.strictEqual(evolution.esDestinoDePrueba(PILOTO), true, 'no deja pasar al piloto');
      assert.strictEqual(evolution.esDestinoDePrueba(FUERA), false, 'deja pasar a un tercero');
      limpiar();
      await bot.procesar(mensaje(PILOTO, 'tenes el iphone 13?'));
      await dormir(300);
      assert.ok(aClientes.length > 0 && aClientes.every((m) => m.numero === PILOTO), 'no le escribió al piloto');
      limpiar();
      await bot.procesar(mensaje(FUERA, 'tenes el iphone 13?'));
      await dormir(300);
      assert.strictEqual(aClientes.length, 0, 'le escribió a un tercero: ' + JSON.stringify(aClientes));
    });
    // Solo piloto, sin tester: también filtra.
    await conListas({ piloto: ['5491100000003'] }, async () => {
      assert.strictEqual(evolution.esDestinoDePrueba(PILOTO), true);
      assert.strictEqual(evolution.esDestinoDePrueba(DENTRO), false, 'con solo el piloto cargado deja pasar a cualquiera');
    });
  });

  await check('(h) un piloto aparece en el resumen y el tester no', async () => {
    const resumen = require('../src/resumen');
    await conListas({ tester: ['5491100000001'], piloto: ['5491100000003'] }, async () => {
      assert.strictEqual(resumen.entraEnElResumen(PILOTO), true, 'el piloto no entra en el resumen');
      assert.strictEqual(resumen.entraEnElResumen(DENTRO), false, 'el tester entra en el resumen');
      assert.strictEqual(resumen.entraEnElResumen(FUERA), true, 'un cliente común no entra en el resumen');
    });
  });

  await check('(i) con NUMEROS_TESTER vacía y NUMEROS_PRUEBA cargada, NUMEROS_PRUEBA se lee como tester (el .env de hoy sigue andando) y se avisa al arrancar', async () => {
    const { execFileSync } = require('child_process');
    // config.js lee el entorno al cargarse: se mira en otro proceso, con las tres
    // variables fijadas para no heredar nada del .env de la máquina.
    const leer = (env) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ['-e', 'const c=require("./src/config");console.log(JSON.stringify({tester:c.numerosTester,piloto:c.numerosPiloto,viejo:c.numerosPruebaViejo}))'],
          { cwd: path.join(__dirname, '..'), env: { ...process.env, NUMEROS_PRUEBA: '', NUMEROS_TESTER: '', NUMEROS_PILOTO: '', ...env } }
        ).toString()
      );
    assert.deepStrictEqual(leer({ NUMEROS_PRUEBA: '5491100000001,54 11 0000-0002' }), { tester: ['5491100000001', '541100000002'], piloto: [], viejo: true });
    assert.deepStrictEqual(leer({ NUMEROS_PRUEBA: '5491100000001', NUMEROS_TESTER: '5491100000009' }), { tester: ['5491100000009'], piloto: [], viejo: false });
    assert.deepStrictEqual(leer({ NUMEROS_TESTER: '5491100000009', NUMEROS_PILOTO: '5491100000003' }), { tester: ['5491100000009'], piloto: ['5491100000003'], viejo: false });
    assert.deepStrictEqual(leer({}), { tester: [], piloto: [], viejo: false });
    // Y el bot lo avisa al arrancar.
    const lineas = [];
    const log = console.log;
    console.log = (...a) => lineas.push(a.join(' '));
    const antes = config.numerosPruebaViejo;
    try {
      config.numerosPruebaViejo = true;
      bot.anunciarModo();
    } finally {
      console.log = log;
      config.numerosPruebaViejo = antes;
    }
    assert.ok(lineas.some((l) => /NUMEROS_PRUEBA quedó viejo, pasalo a NUMEROS_TESTER/.test(l)), 'no avisó que NUMEROS_PRUEBA quedó viejo:\n' + lineas.join('\n'));
  });

  await check('(j) al arrancar se ven las dos cantidades por separado', async () => {
    await conListas({ tester: ['5491100000001'], piloto: ['5491100000003', '5491100000004'] }, async () => {
      const lineas = [];
      const log = console.log;
      console.log = (...a) => lineas.push(a.join(' '));
      try {
        bot.anunciarModo();
      } finally {
        console.log = log;
      }
      const texto = lineas.join('\n');
      assert.ok(/tester[^\n]*\b1\b/i.test(texto), 'no dice cuántos testers hay:\n' + texto);
      assert.ok(/piloto[^\n]*\b2\b/i.test(texto), 'no dice cuántos pilotos hay:\n' + texto);
    });
  });

  // --------------------------------------------------- respaldo del transporte
  await check('respaldo: enviarTexto/Imagen/Documento reales frenan solos, sin tocar la red', async () => {
    const fetchReal = globalThis.fetch;
    globalThis.fetch = () => {
      throw new Error('salió a la red: el respaldo no frenó');
    };
    try {
      await conLista(['5491100000001'], async () => {
        const casos = [
          ['enviarTexto', realEnviarTexto, [FUERA, 'hola']],
          ['enviarImagen', realEnviarImagen, [FUERA, 'x.jpg']],
          ['enviarDocumento', realEnviarDocumento, [FUERA, 'x.pdf']],
        ];
        for (const [nombre, fn, args] of casos) {
          const r = await fn(...args);
          assert.ok(r && r.bloqueado, nombre + ' no frenó a un destino fuera de la lista');
          assert.strictEqual(r.motivo, 'fuera de la lista de prueba');
        }
      });
    } finally {
      globalThis.fetch = fetchReal;
    }
  });

  // --------------------------------------------------- tope por barrido
  await check('el tope por barrido se respeta (maxPorBarrido)', async () => {
    const haceUnaHora = Date.now() - 60 * 60 * 1000;
    for (let i = 0; i < 10; i++) {
      state.actualizar('54911000001' + i + '@s.whatsapp.net', {
        ultimoBot: haceUnaHora,
        ultimoEnvioCliente: haceUnaHora,
        ultimoPrecioBot: haceUnaHora - 3 * 60 * 60 * 1000,
        ultimoHumano: 0,
        modelo: 'iPhone 13',
        historial: [],
        seguimientoEnviado: false,
        escalado: false,
        pausado: false,
      });
    }
    limpiar();
    await bot.revisarSeguimientos({ escribiendoMs: 1 });
    assert.ok(
      aClientes.length <= config.seguimiento.maxPorBarrido,
      'mandó ' + aClientes.length + ' seguimientos y el tope es ' + config.seguimiento.maxPorBarrido
    );
    assert.ok(aClientes.length > 0, 'no mandó ninguno: el caso pasaría en vacío');
  });

  // ------------------------------------------- piloto para todos (27/09/2026)
  await check('(k) NUMEROS_PILOTO=todos: le escribe a cualquiera y el tester sigue siendo tester', async () => {
    const { execFileSync } = require('child_process');
    const leer = (env) =>
      JSON.parse(
        execFileSync(
          process.execPath,
          ['-e', 'const c=require("./src/config");console.log(JSON.stringify({piloto:c.numerosPiloto,todos:c.pilotoTodos}))'],
          { cwd: path.join(__dirname, '..'), env: { ...process.env, NUMEROS_PRUEBA: '', NUMEROS_TESTER: '', NUMEROS_PILOTO: '', ...env } }
        ).toString()
      );
    assert.deepStrictEqual(leer({ NUMEROS_PILOTO: 'todos' }), { piloto: [], todos: true });
    assert.deepStrictEqual(leer({ NUMEROS_PILOTO: ' TODOS ' }), { piloto: [], todos: true });
    assert.deepStrictEqual(leer({ NUMEROS_PILOTO: '5491100000003' }), { piloto: ['5491100000003'], todos: false });
    assert.deepStrictEqual(leer({}), { piloto: [], todos: false });

    const resumen = require('../src/resumen');
    const antes = config.pilotoTodos;
    config.pilotoTodos = true;
    try {
      await conLista(['5491100000001'], async () => {
        assert.strictEqual(evolution.esDestinoDePrueba(FUERA), true, 'con todos, un cliente cualquiera tiene que recibir');
        assert.strictEqual(evolution.leLlegaAlCliente(FUERA), true);
        assert.strictEqual(evolution.esDestinoDePrueba(DENTRO), true);
        assert.strictEqual(resumen.entraEnElResumen(DENTRO), false, 'el tester no entra en el resumen');
        assert.strictEqual(resumen.entraEnElResumen(FUERA), true);
        assert.strictEqual(bot.modoEfectivo(), 'en vivo para todos, con tester');
        limpiar();
        await bot.procesar(mensaje(FUERA, 'tenes el iphone 15?'));
        await dormir(300);
        assert.ok(aClientes.length > 0, 'con todos no le escribió a un cliente');
        assert.ok(!alGrupo.some((m) => /BORRADOR/.test(m)), 'mandó un borrador al grupo estando en vivo para todos');
      });
    } finally {
      config.pilotoTodos = antes;
    }
  });

  // ------------------------------------------- solo chats nuevos (28/09/2026)
  // En la reproducción de chats reales, casi todo lo que el bot contestaba mal eran chats que
  // ya llevaba una persona. Con SOLO_CHATS_NUEVOS, a un chat donde alguna vez escribió alguien
  // de la cuenta el bot no le escribe (va como borrador), aunque sea piloto o "todos". El
  // tester no cambia.
  await check('(l) SOLO_CHATS_NUEVOS: un chat que atendió una persona queda en borrador; uno nuevo y el tester no', async () => {
    const { execFileSync } = require('child_process');
    const leer = (env) =>
      JSON.parse(
        execFileSync(process.execPath, ['-e', 'console.log(JSON.stringify(require("./src/config").soloChatsNuevos))'], {
          cwd: path.join(__dirname, '..'),
          env: { ...process.env, SOLO_CHATS_NUEVOS: '', ...env },
        }).toString()
      );
    assert.strictEqual(leer({ SOLO_CHATS_NUEVOS: 'true' }), true);
    assert.strictEqual(leer({}), false, 'sin la variable tiene que quedar apagado');

    const ATENDIDO = '5491100000009@s.whatsapp.net';
    state.agregarAlHistorial(ATENDIDO, 'vendedor', 'te espero a las 16', { humano: true });
    state.agregarAlHistorial(DENTRO, 'vendedor', 'hola, soy fran', { humano: true });
    const antes = { todos: config.pilotoTodos, solo: config.soloChatsNuevos };
    config.pilotoTodos = true;
    try {
      await conLista(['5491100000001'], async () => {
        config.soloChatsNuevos = false;
        assert.strictEqual(evolution.esDestinoDePrueba(ATENDIDO), true, 'apagado, todo sigue como antes');
        config.soloChatsNuevos = true;
        assert.strictEqual(evolution.esDestinoDePrueba(ATENDIDO), false, 'le escribiría a un chat que llevaba una persona');
        assert.strictEqual(evolution.leLlegaAlCliente(ATENDIDO), false);
        assert.strictEqual(evolution.esDestinoDePrueba(FUERA), true, 'un chat nuevo tiene que recibir');
        assert.strictEqual(evolution.esDestinoDePrueba(DENTRO), true, 'el tester siempre recibe');
        limpiar();
        await bot.procesar(mensaje(ATENDIDO, 'tenes el iphone 15?'));
        await dormir(300);
        assert.ok(!aClientes.some((m) => String(m.numero || m.to || m).includes('5491100000009')), 'le escribió al chat atendido');
      });
    } finally {
      config.pilotoTodos = antes.todos;
      config.soloChatsNuevos = antes.solo;
    }
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      require('fs').unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos === 0 ? 0 : 1);
})();
