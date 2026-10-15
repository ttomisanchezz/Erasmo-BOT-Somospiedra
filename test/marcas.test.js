'use strict';
/**
 * Las marcas de "ya se dijo" se confirman DESPUÉS del envío (bloque 3 de la
 * auditoría del 15/09/2026, hallazgo A4).
 *
 *   node test/marcas.test.js
 *
 * El principio del proyecto es que el estado refleja lo que el cliente RECIBIÓ, no
 * lo que el bot propuso. Hasta este bloque, marcas como `listaEnviada`,
 * `stockInformadoDe`, `preciosMostradosDe`, `cotizadoDe` o `compromisoEnviado` se
 * guardaban al DECIDIR, así que quedaban puestas aunque el cliente no hubiera
 * recibido nada: en escucha, en borrador, con la tanda cortada o con un envío
 * fallido. Después el bot creía que ya lo había dicho y no lo repetía.
 *
 * Acá se prueba, de punta a punta:
 *   a) en escucha no quedan marcas y el turno siguiente vuelve a ofrecer lo mismo;
 *   b) lo mismo en borrador;
 *   c) tanda cortada después del primer mensaje: lo que salió queda confirmado y lo
 *      que no salió, no;
 *   d) envío que falla, o que vuelve sin id: no quedan marcas;
 *   e) envío bien: las marcas quedan y el bot no lo repite;
 *   f) un mensaje de una persona de la cuenta no confirma marcas del bot;
 *   g) la migración del estado guardado, con un fixture viejo y en otro proceso.
 *
 * Sin red, extractor local y números inventados. El entorno se fija acá y no se
 * hereda del .env.
 */
const assert = require('assert');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const RAIZ = path.join(__dirname, '..');
const GRUPO = '120363000000000099@g.us';

process.env.ESPERA_MIN_MS = '10';
process.env.ESPERA_MAX_MS = '20';
process.env.ENTRE_MENSAJES_MS = '1';
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.DATOS_VIEJOS_HORAS = '72';
process.env.CONTACTOS_PERSONALES = '';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.SILENCIO_TRAS_HUMANO_MIN = '45';
process.env.IGNORAR_ANTERIORES_SEG = '120';
process.env.SEGUIMIENTO_ACTIVO = 'false';
process.env.RESUMEN_ACTIVO = 'false';
process.env.WEBHOOK_SECRETO = '';
process.env.HOST = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-marcas-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-marcas-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));
sheets.registrarLead = async () => {};

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
// `alEntender` corre después de interpretar y antes de mandar: sirve para cortar la
// tanda antes del primer mensaje (un #pausa que llega mientras se arma la respuesta).
let alEntender = null;
gemini.entender = async (h, m) => {
  const r = local.entender(m);
  if (alEntender) await alEntender(m);
  return r;
};
gemini.redactar = async (instruccion, nombre, reserva) => reserva;

// Evolution de mentira: cada envío devuelve su id, como Evolution v2. `alEnviar`
// corre antes de que vuelva la respuesta; `fallar` y `sinId` simulan los dos
// casos en que el cliente no recibe nada.
let idN = 0;
let alEnviar = null;
let fallar = false;
let sinId = false;
const aClientes = [];
const alGrupo = [];
async function envio(numero, tipo, texto) {
  const registro = { numero, tipo, texto, id: 'BOT' + ++idN };
  aClientes.push(registro);
  if (alEnviar) await alEnviar(registro);
  if (fallar) throw new Error('Evolution 500 (de mentira)');
  return sinId ? {} : { key: { remoteJid: numero, fromMe: true, id: registro.id } };
}
evolution.enviarTexto = (numero, texto) => envio(numero, 'texto', texto);
evolution.enviarImagen = (numero) => envio(numero, 'imagen', '');
evolution.enviarDocumento = (numero, ruta, pie) => envio(numero, 'documento', pie);
evolution.avisarGrupo = async (t) => {
  alGrupo.push(t);
  return {};
};
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  }
}

let n = 0;
const nuevoChat = () => '54900000' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const escrito = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: false, id: 'C' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const mio = (chatId, texto) => ({
  key: { remoteJid: chatId, fromMe: true, id: 'H' + Math.random() },
  pushName: 'Lucia',
  message: { conversation: texto },
});
const aEste = (chat) => aClientes.filter((m) => m.numero === chat);
const textosA = (chat) => aEste(chat).map((m) => m.texto).join(' | ');
const del = (chat) => state.todos()[chat] || {};
function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
  alEnviar = null;
}
/** Corre algo con otra configuración y la deja como estaba. */
async function con(cambios, fn) {
  const antes = {};
  for (const [k, v] of Object.entries(cambios)) {
    antes[k] = config[k];
    config[k] = v;
  }
  try {
    return await fn();
  } finally {
    Object.assign(config, antes);
  }
}

// La lista de precios es la marca más fácil de ver: `listaEnviada` hace que la
// segunda vez arranque con "dale, te la paso de nuevo" (desde el 28/09/2026 la lista va
// de nuevo; antes contestaba "ya te pase la lista mas arriba").
const PEDIR_LISTA = 'me pasas la lista de precios?';
const HAY_LISTA = /495\.000/;
const OTRA_VEZ = /te la paso de nuevo/i;

(async () => {
  console.log('\nLas marcas se confirman después del envío\n');

  await check('(e) envío bien: la marca queda y la segunda vez sabe que ya se la mandó', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, PEDIR_LISTA));
    assert.ok(HAY_LISTA.test(textosA(chat)), 'no mandó la lista: ' + textosA(chat).slice(0, 120));
    assert.strictEqual(del(chat).listaEnviada, true, 'no quedó la marca de la lista enviada');
    limpiar();
    await bot.procesar(escrito(chat, PEDIR_LISTA));
    assert.ok(OTRA_VEZ.test(textosA(chat)), 'no tomó la marca: ' + textosA(chat).slice(0, 120));
  });

  await check('(a) en escucha no queda ninguna marca, y el turno siguiente vuelve a ofrecer lo mismo', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoEscucha: true }, async () => {
      await bot.procesar(escrito(chat, PEDIR_LISTA));
      assert.deepStrictEqual(aEste(chat), [], 'en escucha mandó algo');
      assert.ok(HAY_LISTA.test(del(chat).ultimaPropuestaBot || ''), 'el caso no prueba nada: no propuso la lista');
      assert.ok(!del(chat).listaEnviada, 'marcó la lista como enviada en escucha');
      await bot.procesar(escrito(chat, PEDIR_LISTA));
      assert.ok(
        HAY_LISTA.test(del(chat).ultimaPropuestaBot || ''),
        'la segunda vez ya no proponía la lista: ' + (del(chat).ultimaPropuestaBot || '').slice(0, 120)
      );
    });
  });

  await check('(b) en borrador tampoco, y el borrador del grupo vuelve a llevar la lista', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoBorrador: true }, async () => {
      await bot.procesar(escrito(chat, PEDIR_LISTA));
      assert.deepStrictEqual(aEste(chat), [], 'en borrador le escribió al cliente');
      assert.ok(HAY_LISTA.test(alGrupo.join(' ')), 'el caso no prueba nada: el borrador no traía la lista');
      assert.ok(!del(chat).listaEnviada, 'marcó la lista como enviada en borrador');
      limpiar();
      await bot.procesar(escrito(chat, PEDIR_LISTA));
      assert.ok(HAY_LISTA.test(alGrupo.join(' ')), 'el segundo borrador ya no traía la lista');
    });
  });

  await check('(b) un número fuera de NUMEROS_TESTER se trata como borrador: tampoco quedan marcas', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ numerosTester: ['5490000000001'] }, async () => {
      await bot.procesar(escrito(chat, PEDIR_LISTA));
      assert.deepStrictEqual(aEste(chat), [], 'le escribió a un número fuera de la lista');
      assert.ok(!del(chat).listaEnviada, 'marcó la lista como enviada sin mandarla');
    });
  });

  await check('(c) tanda cortada: lo que salió queda confirmado y lo que no salió, no', async () => {
    const chat = nuevoChat();
    limpiar();
    // "tenes el 13?" contesta saludo (saludoEn, desde el bloque 9; antes yaSaludo), stock
    // (stockInformadoDe) y precio (preciosMostradosDe). Se corta justo después del saludo.
    alEnviar = async ({ numero }) => {
      if (numero === chat && aEste(chat).length === 1) await bot.procesar(mio(chat, '#pausa'));
    };
    await bot.procesar(escrito(chat, 'hola, tenes el iphone 13?'));
    alEnviar = null;
    assert.strictEqual(aEste(chat).length, 1, `salieron ${aEste(chat).length} mensajes, tenía que cortarse en 1`);
    const s = del(chat);
    // Lo que salió (el saludo) queda confirmado.
    assert.ok(s.saludoEn, 'no confirmó la marca del mensaje que sí salió');
    // Lo que no salió, no: el cliente nunca se enteró de que lo tenemos ni de cuánto sale.
    assert.ok(!s.stockInformadoDe, 'marcó el stock informado y ese mensaje no salió');
    assert.deepStrictEqual(s.preciosMostradosDe || [], [], 'marcó precios mostrados y no salieron');
    // Y cuando el chat sigue, se lo dice: no quedó creyendo que ya se lo había dicho.
    limpiar();
    await bot.procesar(mio(chat, '#sigue'));
    await bot.procesar(escrito(chat, 'seguis ahi? tenes el 13?'));
    assert.ok(/stock|tenemos/i.test(textosA(chat)), 'no volvió a decirle que lo tenemos: ' + textosA(chat).slice(0, 140));
    assert.strictEqual(del(chat).stockInformadoDe, 'iPhone 13', 'no confirmó el stock cuando sí salió');
  });

  await check('(d) si el envío falla, no queda la marca', async () => {
    const chat = nuevoChat();
    limpiar();
    fallar = true;
    try {
      await bot.procesar(escrito(chat, PEDIR_LISTA));
    } finally {
      fallar = false;
    }
    assert.ok(!del(chat).listaEnviada, 'marcó la lista como enviada con el envío fallado');
  });

  await check('(d) si Evolution contesta sin id, tampoco', async () => {
    const chat = nuevoChat();
    limpiar();
    sinId = true;
    try {
      await bot.procesar(escrito(chat, PEDIR_LISTA));
    } finally {
      sinId = false;
    }
    assert.ok(!del(chat).listaEnviada, 'marcó la lista como enviada sin confirmación de Evolution');
  });

  await check('(f) un mensaje de una persona de la cuenta no confirma marcas', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoEscucha: true }, async () => {
      await bot.procesar(escrito(chat, PEDIR_LISTA));
    });
    assert.ok(!del(chat).listaEnviada, 'el caso no prueba nada: ya estaba marcada');
    await bot.procesar(mio(chat, 'te paso la lista yo'));
    assert.ok(!del(chat).listaEnviada, 'un mensaje humano confirmó una marca del bot');
    assert.ok(del(chat).ultimoHumano > 0, 'no registró a la persona');
  });

  await check('la cotización y el PDF también se confirman al enviarse', async () => {
    const chat = nuevoChat();
    limpiar();
    for (const t of ['tenes el 13?', 'ese me gusto', 'en cuotas', 'tengo 400 mil']) {
      await bot.procesar(escrito(chat, t));
    }
    const s = del(chat);
    assert.strictEqual(s.cotizadoDe, 'iPhone 13', 'no quedó la cotización confirmada: ' + s.cotizadoDe);
    assert.strictEqual(s.entregaCotizada, 400000);
    assert.strictEqual(s.stockInformadoDe, 'iPhone 13');
    assert.ok((s.preciosMostradosDe || []).includes('iPhone 13'), 'no anotó los precios mostrados');
  });

  await check('en escucha, una cotización tampoco deja marcas', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoEscucha: true }, async () => {
      for (const t of ['tenes el 13?', 'ese me gusto', 'en cuotas', 'tengo 400 mil']) {
        await bot.procesar(escrito(chat, t));
      }
    });
    const s = del(chat);
    assert.ok(!s.cotizadoDe, 'marcó una cotización que el cliente no recibió');
    assert.ok(!s.stockInformadoDe, 'marcó el stock informado en escucha');
    assert.deepStrictEqual(s.preciosMostradosDe || [], [], 'anotó precios mostrados en escucha');
    assert.ok(!s.compromisoEnviado, 'marcó el compromiso como enviado en escucha');
    assert.ok(s.entrega === 400000, 'perdió lo que dijo el cliente: la entrega');
  });

  console.log('\nmodeloPropuesto: el hilo cuando el cliente no recibe nada (Pendientes 1, Parte A)\n');

  // `modelo` elegido por el bot es marca del bot: se confirma al enviarse. En escucha
  // y en borrador nada sale, así que el turno siguiente el bot no sabía qué equipo
  // había recomendado. `modeloPropuesto` se guarda al decidir, siempre, y se lee SOLO
  // cuando al cliente no le llega nada. En vivo manda `modelo`, sin excepción.
  const MAS_BARATO = 'pasame el mas barato';
  const BARATO = 'iPhone 11'; // el más económico de la planilla congelada
  const propuesta = (chat) => del(chat).ultimaPropuestaBot || '';

  await check('en escucha, "pasame el mas barato" guarda modeloPropuesto y NO guarda modelo', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoEscucha: true }, () => bot.procesar(escrito(chat, MAS_BARATO)));
    assert.ok(propuesta(chat).includes(BARATO), 'el caso no prueba nada: no propuso el más barato: ' + propuesta(chat).slice(0, 120));
    assert.strictEqual(del(chat).modeloPropuesto, BARATO, 'no guardó modeloPropuesto: ' + del(chat).modeloPropuesto);
    assert.ok(!del(chat).modelo, 'guardó modelo en escucha: ' + del(chat).modelo);
  });

  await check('en escucha, el turno siguiente ("dale ese", "cuanto sale?") sigue con ese modelo', async () => {
    for (const siguiente of ['dale ese', 'cuanto sale?']) {
      const chat = nuevoChat();
      limpiar();
      await con({ modoEscucha: true }, async () => {
        await bot.procesar(escrito(chat, MAS_BARATO));
        await bot.procesar(escrito(chat, siguiente));
      });
      assert.ok(propuesta(chat).includes(BARATO), `después de "${siguiente}" perdió el hilo: ` + propuesta(chat).slice(0, 160));
      assert.ok(!/contame que estabas buscando|que modelito/i.test(propuesta(chat)), `después de "${siguiente}" preguntó el modelo de nuevo: ` + propuesta(chat).slice(0, 160));
      assert.ok(!del(chat).modelo, 'guardó modelo en escucha: ' + del(chat).modelo);
    }
  });

  await check('en vivo con el envío confirmado, modelo queda guardado y modeloPropuesto no se usa para decidir', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(escrito(chat, MAS_BARATO));
    assert.ok(textosA(chat).includes(BARATO), 'el caso no prueba nada: no mandó el más barato: ' + textosA(chat).slice(0, 120));
    assert.strictEqual(del(chat).modelo, BARATO, 'no confirmó el modelo al salir: ' + del(chat).modelo);
    // Si el respaldo dijera otra cosa, en vivo no se mira: manda `modelo`.
    state.actualizar(chat, { modeloPropuesto: 'iPhone 15' });
    limpiar();
    await bot.procesar(escrito(chat, 'dale ese'));
    assert.ok(aEste(chat).length, 'no contestó "dale ese"');
    assert.strictEqual(del(chat).modelo, BARATO, 'siguió con otro modelo: ' + del(chat).modelo);
    assert.ok(!/15/.test(textosA(chat)), 'decidió con modeloPropuesto en vivo: ' + textosA(chat).slice(0, 160));
  });

  await check('en vivo con la tanda cortada antes del primer mensaje, modelo queda vacío y el bot NO sigue con modeloPropuesto', async () => {
    const chat = nuevoChat();
    limpiar();
    // El #pausa cae mientras se arma la respuesta: se decide (queda modeloPropuesto)
    // pero no sale nada, así que el cliente nunca vio la recomendación.
    alEntender = async (m) => {
      if (m === MAS_BARATO) state.actualizar(chat, { pausado: true });
    };
    try {
      await bot.procesar(escrito(chat, MAS_BARATO));
    } finally {
      alEntender = null;
    }
    assert.deepStrictEqual(aEste(chat), [], 'el caso no prueba nada: salió algo');
    assert.strictEqual(del(chat).modeloPropuesto, BARATO, 'no guardó modeloPropuesto al decidir');
    assert.ok(!del(chat).modelo, 'confirmó el modelo sin mandarlo: ' + del(chat).modelo);
    await bot.procesar(mio(chat, '#sigue'));
    limpiar();
    await bot.procesar(escrito(chat, 'dale ese'));
    assert.ok(aEste(chat).length, 'no contestó "dale ese"');
    assert.ok(!textosA(chat).includes(BARATO), 'siguió con la recomendación que el cliente no vio: ' + textosA(chat).slice(0, 160));
    assert.ok(!del(chat).modelo, 'guardó un modelo que el cliente no eligió: ' + del(chat).modelo);
  });

  await check('cuando el modelo lo dice el cliente, modeloPropuesto no interviene (ni en escucha)', async () => {
    const chat = nuevoChat();
    limpiar();
    await con({ modoEscucha: true }, async () => {
      await bot.procesar(escrito(chat, MAS_BARATO));
      assert.strictEqual(del(chat).modeloPropuesto, BARATO, 'el caso no prueba nada: no quedó modeloPropuesto');
      await bot.procesar(escrito(chat, 'quiero el 14 pro'));
    });
    // El extractor local guarda el modelo como lo escribió ("14 pro"); lo que importa es que sea el suyo.
    assert.ok(/14 pro/i.test(del(chat).modelo || ''), 'no guardó el modelo que dijo el cliente: ' + del(chat).modelo);
    assert.ok(propuesta(chat).includes('14 Pro') && !propuesta(chat).includes(BARATO), 'siguió con el propuesto en vez del que nombró: ' + propuesta(chat).slice(0, 160));
  });

  console.log('\nMigración del estado guardado\n');

  await check('(g) migración: borra las marcas del bot, deja el resto igual, es idempotente y hace un backup', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'migracion-'));
    const archivo = path.join(dir, 'estado.json');
    const respaldo = archivo + '.antes-bloque3';
    const viejo = {
      '5490000000000@s.whatsapp.net': {
        nombre: 'Lucia',
        modelo: 'iPhone 13',
        entrega: 400000,
        notas: ['es para su hija'],
        historial: [{ quien: 'cliente', texto: 'hola', ts: 1 }],
        temasExplicados: { financiacion: true },
        resultado: { tipo: 'vendido', ts: 2, botParticipo: true, botLeMando: true },
        escalado: true,
        escaladoEn: 3,
        escaladoMotivo: 'quiere cotización en dólares',
        pausado: false,
        ultimoHumano: 4,
        ultimoBot: 5,
        botEnvio: 6,
        botPropuso: 7,
        // Marcas del bot: se borran
        listaEnviada: true,
        stockInformadoDe: 'iPhone 13',
        preciosMostradosDe: ['iPhone 13'],
        cotizadoDe: 'iPhone 13',
        entregaCotizada: 400000,
        compromisoEnviado: true,
        yaSaludo: true,
        preguntamosFormaPago: true,
        primerIphoneDicho: true,
        insistenciaEntrega: { 'iPhone 13': 1 },
        puertaAbiertaDe: 'iPhone 13',
        permutaDatosPedidos: true,
        entregaRepreguntada: true,
      },
      'bot:interno': {
        resumenDe: 'Mon Sep 15 2026',
        recordatorios: {
          '5490000000000@s.whatsapp.net': { textos: ['llamarlo'], creado: 8, origenes: [], envios: 1, ultimoEnvio: 9, estado: 'activo' },
        },
      },
    };
    fs.writeFileSync(archivo, JSON.stringify(viejo, null, 2));

    // En otro proceso, como cuando arranca el bot: cargar state.js migra.
    const cargar = () =>
      execFileSync(process.execPath, ['-e', 'require("./src/state"); process.exit(0);'], {
        cwd: RAIZ,
        env: { ...process.env, ESTADO_PATH: archivo, APRENDIZAJE_PATH: path.join(dir, 'apr.jsonl') },
      });
    cargar();

    const despues = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    const chat = despues['5490000000000@s.whatsapp.net'];
    for (const marca of [
      'listaEnviada',
      'stockInformadoDe',
      'preciosMostradosDe',
      'cotizadoDe',
      'entregaCotizada',
      'compromisoEnviado',
      'yaSaludo',
      'preguntamosFormaPago',
      'primerIphoneDicho',
      'insistenciaEntrega',
      'puertaAbiertaDe',
      'permutaDatosPedidos',
      'entregaRepreguntada',
    ]) {
      assert.ok(!chat[marca], `no borró la marca ${marca}: ${JSON.stringify(chat[marca])}`);
    }
    // Todo lo demás, igual
    const original = viejo['5490000000000@s.whatsapp.net'];
    for (const campo of [
      'nombre',
      'modelo',
      'entrega',
      'notas',
      'historial',
      'temasExplicados',
      'resultado',
      'escalado',
      'escaladoEn',
      'escaladoMotivo',
      'ultimoHumano',
      'ultimoBot',
      'botEnvio',
      'botPropuso',
    ]) {
      assert.deepStrictEqual(chat[campo], original[campo], `cambió ${campo}`);
    }
    assert.deepStrictEqual(
      despues['bot:interno'].recordatorios,
      viejo['bot:interno'].recordatorios,
      'tocó los recordatorios'
    );
    assert.strictEqual(despues['bot:interno'].resumenDe, viejo['bot:interno'].resumenDe, 'tocó el día del resumen');
    assert.ok(despues['bot:interno'].esquema >= 3, 'no dejó la versión del esquema');

    // El backup es del archivo original, y se hace una sola vez.
    assert.ok(fs.existsSync(respaldo), 'no hizo el backup');
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(respaldo, 'utf8')), viejo, 'el backup no es el original');

    // Idempotente: correrla de nuevo no cambia nada ni pisa el backup.
    fs.writeFileSync(respaldo + '.control', fs.readFileSync(respaldo));
    cargar();
    const otraVez = JSON.parse(fs.readFileSync(archivo, 'utf8'));
    assert.deepStrictEqual(otraVez, despues, 'la segunda corrida cambió el estado');
    assert.deepStrictEqual(
      JSON.parse(fs.readFileSync(respaldo, 'utf8')),
      viejo,
      'pisó el backup en la segunda corrida'
    );
    fs.rmSync(dir, { recursive: true, force: true });
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  for (const f of [process.env.ESTADO_PATH, process.env.APRENDIZAJE_PATH]) {
    try {
      fs.unlinkSync(f);
    } catch {
      /* da igual */
    }
  }
  process.exit(fallos ? 1 : 0);
})();
