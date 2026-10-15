'use strict';
/**
 * Recordatorios manuales al grupo interno (#recordar / #hecho).
 *
 *   node test/recordatorios.test.js
 *
 * Una promesa del diseño, un caso:
 *   - cuándo suena: a la hora en punto, desde RECORDATORIO_HORA hasta antes de
 *     SEGUIMIENTO_HORA_HASTA, sin repetir en la misma hora ni juntar las perdidas;
 *   - los comandos no son mensajes de venta: ni historial, ni aprendizaje, ni
 *     callan al bot, ni le escriben al cliente;
 *   - todos los que tocan salen en UN mensaje, y un envío fallido no cuenta;
 *   - el tope avisa una vez y corta;
 *   - todo queda en disco y sobrevive a un reinicio.
 *
 * El entorno se fija acá y no se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const GRUPO = '120363000000000001@g.us';

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
process.env.CONTACTOS_PERSONALES = '';
process.env.AUDIO_ACTIVO = 'false';
process.env.MENSAJES_SIN_VENTA = '5';
process.env.GRUPO_AVISOS_JID = GRUPO;
process.env.IGNORAR_ANTERIORES_SEG = '120';
// A propósito, DESDE (9) más tarde que RECORDATORIO_HORA (8): el recordatorio
// tiene que arrancar a las 8 igual, porque va al grupo y no a un cliente.
process.env.SEGUIMIENTO_HORA_DESDE = '9';
process.env.SEGUIMIENTO_HORA_HASTA = '22';
process.env.RECORDATORIO_HORA = '8';
process.env.RECORDATORIO_MAX_REPETICIONES = '10';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-recordatorios-' + process.pid + '.json');
// Cerebro Sonnet (01/10/2026): apagado, para no heredar `sombra` del .env real.
process.env.CEREBRO_MODO = 'apagado';
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-recordatorios-' + process.pid + '.jsonl');

const sheets = require('../src/sheets');
sheets.usarFixture(require('./fixture-planilla'));

const config = require('../src/config');
const evolution = require('../src/evolution');
const gemini = require('../src/gemini');

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const local = require('../src/extractor-local');
gemini.entender = async (h, m) => local.entender(m);

const aClientes = [];
const alGrupo = [];
// Todo lo que salió al grupo en la corrida entera, para la prueba del eco.
const historialGrupo = [];
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
const avisarAnotando = async (t) => {
  alGrupo.push(t);
  historialGrupo.push(t);
  return {};
};
evolution.avisarGrupo = avisarAnotando;
evolution.estadoInstancia = async () => ({ state: 'open' });

const bot = require('../src/index');
const state = require('../src/state');
const aprendizaje = require('../src/aprendizaje');
const rec = require('../src/recordatorios');

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
let n = 0;
const nuevoChat = () => '54929955' + String(n++).padStart(5, '0') + '@s.whatsapp.net';
const mensaje = (chatId, texto, { fromMe = false, id, viejo = false } = {}) => ({
  key: { remoteJid: chatId, fromMe, id: id || 'T' + Math.random() },
  pushName: 'Ailin',
  message: { conversation: texto },
  ...(viejo ? { messageTimestamp: Math.floor(Date.now() / 1000) - 3600 } : {}),
});
/** Un mensaje escrito desde la cuenta del negocio. */
const mio = (chatId, texto, extra = {}) => mensaje(chatId, texto, { ...extra, fromMe: true });

function limpiar() {
  aClientes.length = 0;
  alGrupo.length = 0;
}
function sinRecordatorios() {
  for (const chatId of Object.keys(state.recordatorios())) state.borrarRecordatorio(chatId);
}

// Viernes 11 de septiembre de 2026 (u otro día de ese mes), a la hora que se pida.
const alas = (h, m = 0, dia = 11) => new Date(2026, 8, dia, h, m);
const CFG = { horaDesde: 8, horaHasta: 22 };
const activo = (extra = {}) => ({
  textos: ['llamarlo'],
  creado: alas(15, 20).getTime(),
  origenes: [],
  envios: 0,
  ultimoEnvio: 0,
  estado: 'activo',
  ...extra,
});
const poner = (chatId, extra) => state.guardarRecordatorio(chatId, activo(extra));

(async () => {
  console.log('\nCuándo suena\n');

  await check('anotado 15:20: a las 15:25 no suena, a las 16:03 sí', () => {
    const r = activo();
    assert.strictEqual(rec.toca(r, alas(15, 25), CFG), false);
    assert.strictEqual(rec.toca(r, alas(16, 3), CFG), true);
  });

  await check('avisado 16:03: a las 16:55 no repite, a las 17:02 sí', () => {
    const r = activo({ envios: 1, ultimoEnvio: alas(16, 3).getTime() });
    assert.strictEqual(rec.toca(r, alas(16, 55), CFG), false);
    assert.strictEqual(rec.toca(r, alas(17, 2), CFG), true);
  });

  await check('nunca de noche: ni desde HASTA ni antes del arranque', () => {
    const r = activo({ creado: alas(6, 0, 10).getTime() });
    assert.strictEqual(rec.toca(r, alas(21, 5), CFG), true);
    assert.strictEqual(rec.toca(r, alas(22, 5), CFG), false);
    assert.strictEqual(rec.toca(r, alas(23, 30), CFG), false);
    assert.strictEqual(rec.toca(r, alas(3, 0), CFG), false);
    assert.strictEqual(rec.toca(r, alas(7, 59), CFG), false);
    assert.strictEqual(rec.toca(r, alas(8, 0), CFG), true);
  });

  await check('anotado a las 23: arranca al día siguiente a la hora de arranque', () => {
    const r = activo({ creado: alas(23, 0, 10).getTime() });
    assert.strictEqual(rec.toca(r, alas(7, 5), CFG), false);
    assert.strictEqual(rec.toca(r, alas(8, 2), CFG), true);
  });

  await check('PC apagada de 12 a 15: al volver sale UNO, no los perdidos', () => {
    const r = activo({ creado: alas(9, 30).getTime(), envios: 3, ultimoEnvio: alas(12, 3).getTime() });
    assert.strictEqual(rec.toca(r, alas(15, 5), CFG), true);
    r.envios++;
    r.ultimoEnvio = alas(15, 5).getTime();
    assert.strictEqual(rec.toca(r, alas(15, 10), CFG), false);
    assert.strictEqual(rec.toca(r, alas(15, 55), CFG), false);
  });

  await check('un vencido no suena nunca', () => {
    assert.strictEqual(rec.toca(activo({ estado: 'vencido' }), alas(17, 0), CFG), false);
  });

  await check('RECORDATORIO_HORA decide el arranque, no SEGUIMIENTO_HORA_DESDE', () => {
    assert.strictEqual(config.seguimiento.horaDesde, 9, 'el caso no prueba nada si DESDE no es más tarde');
    assert.deepStrictEqual(rec.horario(), { horaDesde: 8, horaHasta: 22 });
  });

  await check('el primer aviso que promete es la próxima hora en punto dentro de la franja', () => {
    const promete = (fecha) => rec.cuando(rec.proximoAviso(activo({ creado: fecha.getTime() }), fecha, CFG), fecha);
    assert.strictEqual(promete(alas(15, 20)), 'hoy 16:00');
    assert.strictEqual(promete(alas(21, 30)), 'mañana 8:00');
    assert.strictEqual(promete(alas(6, 10)), 'hoy 8:00');
  });

  await check('con la franja vacía no promete una hora que nunca llega', () => {
    assert.strictEqual(rec.proximoAviso(activo(), alas(15, 20), { horaDesde: 22, horaHasta: 22 }), null);
  });

  console.log('\nQué cuenta como comando\n');

  await check('#recordar y #hecho solo cuentan al principio del mensaje', () => {
    assert.deepStrictEqual(rec.comando('#recordar mandarle la foto'), { tipo: 'recordar', texto: 'mandarle la foto' });
    assert.deepStrictEqual(rec.comando('  #Recordar: llamarlo\nmañana '), { tipo: 'recordar', texto: 'llamarlo mañana' });
    assert.deepStrictEqual(rec.comando('#recordar'), { tipo: 'recordar', texto: '' });
    assert.deepStrictEqual(rec.comando('#hecho'), { tipo: 'hecho' });
    assert.deepStrictEqual(rec.comando('#HECHO listo'), { tipo: 'hecho' });
    for (const no of ['#recordarme algo', '#hechos', 'che #recordar esto', 'ya está #hecho', 'recordar llamarlo', '']) {
      assert.strictEqual(rec.comando(no), null, 'lo tomó como comando: ' + no);
    }
  });

  await check('un segundo #recordar suma la línea y la cuenta vuelve a cero', () => {
    const previo = activo({ origenes: ['A'], envios: 4, ultimoEnvio: alas(16, 3).getTime() });
    const r = rec.anotar(previo, 'confirmar si viene', 'B', alas(16, 30).getTime());
    assert.deepStrictEqual(r.textos, ['llamarlo', 'confirmar si viene']);
    assert.strictEqual(r.envios, 0);
    assert.strictEqual(rec.toca(r, alas(16, 45), CFG), false, 'volvió a sonar en la hora en que se anotó');
    assert.strictEqual(rec.toca(r, alas(17, 2), CFG), true);
  });

  await check('el mismo mensaje no se anota dos veces y el mismo texto no se duplica', () => {
    const previo = activo({ origenes: ['A'] });
    assert.strictEqual(rec.anotar(previo, 'otra cosa', 'A', Date.now()), null);
    assert.deepStrictEqual(rec.anotar(previo, 'llamarlo', 'C', Date.now()).textos, ['llamarlo']);
  });

  await check('sobre uno vencido, un #recordar nuevo arranca de cero', () => {
    const r = rec.anotar(activo({ estado: 'vencido', envios: 10 }), 'insistirle', 'D', Date.now());
    assert.deepStrictEqual(r.textos, ['insistirle']);
    assert.strictEqual(r.estado, 'activo');
    assert.strictEqual(r.envios, 0);
  });

  console.log('\nPor el webhook: no son mensajes de venta\n');

  await check('#recordar en el chat: anota, confirma al grupo con el link y al cliente no le llega nada', async () => {
    const chat = nuevoChat();
    await bot.procesar(mensaje(chat, 'hola tenes el iphone 13?'));
    await dormir(200);
    limpiar();
    await bot.procesar(mio(chat, '#recordar mandarle la foto del azul'));
    const r = state.recordatorios()[chat];
    assert.ok(r, 'no quedó anotado');
    assert.deepStrictEqual(r.textos, ['mandarle la foto del azul']);
    assert.strictEqual(aClientes.length, 0, 'le escribió al cliente');
    assert.strictEqual(alGrupo.length, 1, 'no confirmó en el grupo');
    assert.ok(/^📌 Anotado/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(alGrupo[0].includes('https://wa.me/' + chat.split('@')[0]), 'la confirmación no lleva el link');
    assert.ok(/Primer aviso: (hoy|mañana) \d{1,2}:00/.test(alGrupo[0]), 'no dice cuándo suena: ' + alGrupo[0]);
  });

  await check('#recordar y #hecho no entran al historial ni al aprendizaje, ni callan al bot', async () => {
    // Control: un mensaje propio normal SÍ marca humano y SÍ entra al aprendizaje.
    const control = nuevoChat();
    await bot.procesar(mensaje(control, 'tenes el 14?'));
    await dormir(200);
    state.actualizar(control, { ultimoBot: 0 });
    await bot.procesar(mio(control, 'si, te paso fotos'));
    assert.ok(state.todos()[control].ultimoHumano > 0, 'el caso no prueba nada: un mensaje propio no marca humano');
    assert.ok(
      aprendizaje.leerTodo().some((x) => x.tipo === 'humano' && x.texto === 'si, te paso fotos'),
      'el caso no prueba nada: un mensaje propio no entra al aprendizaje'
    );

    const chat = nuevoChat();
    await bot.procesar(mensaje(chat, 'tenes el 14?'));
    await dormir(200);
    state.actualizar(chat, { ultimoBot: 0 });
    const largoAntes = state.todos()[chat].historial.length;
    await bot.procesar(mio(chat, '#recordar pasarle el precio del 14 pro'));
    await bot.procesar(mio(chat, '#hecho'));
    const s = state.todos()[chat];
    assert.strictEqual(s.historial.length, largoAntes, 'el comando entró al historial');
    assert.ok(!s.historial.some((m) => /#recordar|#hecho/.test(m.texto)));
    assert.ok(!s.ultimoHumano, 'el comando calló al bot como si hubiera contestado una persona');
    const aprendido = aprendizaje.leerTodo().filter((x) => /#recordar|#hecho/.test(x.texto || ''));
    assert.strictEqual(aprendido.length, 0, 'el comando entró al aprendizaje');
  });

  await check('#hecho en el chat cierra, confirma al grupo y al cliente no le llega nada', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, '#recordar llamarlo'));
    limpiar();
    await bot.procesar(mio(chat, '#hecho'));
    assert.ok(!state.recordatorios()[chat], 'sigue anotado');
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/^✅ Hecho/.test(alGrupo[0]) && /llamarlo/.test(alGrupo[0]), alGrupo[0]);
  });

  await check('#hecho sin nada anotado no rompe ni avisa', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(mio(chat, '#hecho'));
    assert.strictEqual(alGrupo.length, 0);
    assert.strictEqual(aClientes.length, 0);
  });

  await check('el mismo mensaje dos veces (webhook repetido) anota y confirma una sola vez', async () => {
    const chat = nuevoChat();
    limpiar();
    const m = mio(chat, '#recordar mandarle la seña', { id: 'REPETIDO-1' });
    await bot.procesar(m);
    await bot.procesar(m);
    assert.deepStrictEqual(state.recordatorios()[chat].textos, ['mandarle la seña']);
    assert.strictEqual(alGrupo.length, 1, 'confirmó dos veces');
  });

  await check('un segundo #recordar en el mismo chat suma la línea', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, '#recordar mandarle la foto'));
    limpiar();
    await bot.procesar(mio(chat, '#recordar confirmar si viene el sábado'));
    assert.deepStrictEqual(state.recordatorios()[chat].textos, ['mandarle la foto', 'confirmar si viene el sábado']);
    assert.ok(/mandarle la foto/.test(alGrupo[0]) && /sábado/.test(alGrupo[0]));
  });

  await check('#recordar sin texto no anota y contesta en el grupo cómo se usa', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(mio(chat, '#recordar'));
    assert.ok(!state.recordatorios()[chat], 'anotó uno vacío');
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/^❓/.test(alGrupo[0]) && /no anoté nada/.test(alGrupo[0]), alGrupo[0]);
    assert.strictEqual(aClientes.length, 0);
  });

  await check('en el grupo de avisos no anota ni cierra: contesta cómo se usa', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, '#recordar llamarlo'));
    limpiar();
    const antes = JSON.stringify(state.recordatorios());
    await bot.procesar(mio(GRUPO, '#recordar llamar a juan'));
    await bot.procesar(mio(GRUPO, '#hecho'));
    assert.strictEqual(JSON.stringify(state.recordatorios()), antes, 'cambió los recordatorios desde el grupo');
    assert.strictEqual(alGrupo.length, 2);
    assert.ok(/No anoté nada/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(/No cerré nada/.test(alGrupo[1]), alGrupo[1]);
  });

  await check('se ignoran los comandos que no vienen de la cuenta del negocio, o de otro grupo', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, '#recordar llamarlo'));
    limpiar();
    await bot.procesar(mensaje(GRUPO, '#hecho')); // alguien desde su número personal
    await bot.procesar(mio('120363999999999999@g.us', '#recordar algo')); // otro grupo
    await bot.procesar(mensaje(chat, '#hecho')); // el cliente
    await dormir(200);
    assert.ok(state.recordatorios()[chat], 'lo cerró alguien que no es la cuenta del negocio');
    assert.strictEqual(alGrupo.filter((t) => /^(❓|✅|📌)/.test(t)).length, 0);
  });

  await check('un comando viejo (sincronización del QR) se ignora', async () => {
    const chat = nuevoChat();
    limpiar();
    await bot.procesar(mio(chat, '#recordar esto es de hace una hora', { viejo: true }));
    await bot.procesar(mio(GRUPO, '#hecho', { viejo: true }));
    assert.ok(!state.recordatorios()[chat]);
    assert.strictEqual(alGrupo.length, 0);
  });

  // Hasta el 15/09/2026 era al revés: #reset no lo borraba. Lo cambió Tomás.
  await check('#reset del chat borra también su recordatorio', async () => {
    const chat = nuevoChat();
    await bot.procesar(mio(chat, '#recordar llamarlo'));
    assert.ok(state.recordatorios()[chat], 'el caso no prueba nada: no se anotó');
    await bot.procesar(mio(chat, '#reset'));
    assert.ok(!state.recordatorios()[chat], 'el recordatorio sobrevivió al #reset');
  });

  console.log('\nEl mensaje de la hora\n');

  await check('varios a la misma hora salen en UN solo mensaje, cada uno con su link', async () => {
    sinRecordatorios();
    limpiar();
    const chats = [nuevoChat(), nuevoChat(), nuevoChat()];
    chats.forEach((c, i) => poner(c, { textos: ['cosa ' + i] }));
    await bot.revisarRecordatorios(alas(16, 4));
    assert.strictEqual(alGrupo.length, 1, 'salieron ' + alGrupo.length + ' mensajes');
    assert.ok(/3 RECORDATORIOS PENDIENTES/.test(alGrupo[0]), alGrupo[0]);
    for (const c of chats) {
      assert.ok(alGrupo[0].includes('https://wa.me/' + c.split('@')[0]), 'falta el link de ' + c);
      assert.strictEqual(state.recordatorios()[c].envios, 1);
    }
    assert.ok(/Aviso 1 de 10/.test(alGrupo[0]));
  });

  await check('en la misma hora no repite; en la siguiente sí', async () => {
    limpiar();
    await bot.revisarRecordatorios(alas(16, 9));
    await bot.revisarRecordatorios(alas(16, 54));
    assert.strictEqual(alGrupo.length, 0, 'repitió en la misma hora');
    await bot.revisarRecordatorios(alas(17, 1));
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/Aviso 2 de 10/.test(alGrupo[0]));
  });

  await check('arranca a RECORDATORIO_HORA (8) aunque SEGUIMIENTO_HORA_DESDE sea 9', async () => {
    sinRecordatorios();
    limpiar();
    poner(nuevoChat(), { creado: alas(23, 0, 10).getTime() });
    await bot.revisarRecordatorios(alas(7, 58));
    assert.strictEqual(alGrupo.length, 0, 'sonó antes de hora');
    await bot.revisarRecordatorios(alas(8, 3));
    assert.strictEqual(alGrupo.length, 1, 'no sonó a las 8');
  });

  await check('nunca de noche: desde SEGUIMIENTO_HORA_HASTA no sale ni gasta repeticiones', async () => {
    sinRecordatorios();
    limpiar();
    const chat = nuevoChat();
    poner(chat, { creado: alas(9, 0).getTime() });
    await bot.revisarRecordatorios(alas(22, 4));
    await bot.revisarRecordatorios(alas(23, 59));
    assert.strictEqual(alGrupo.length, 0);
    assert.strictEqual(state.recordatorios()[chat].envios, 0);
  });

  await check('bloqueado (modo escucha): no sale, no gasta repetición y se reintenta', async () => {
    sinRecordatorios();
    limpiar();
    const chat = nuevoChat();
    poner(chat);
    config.modoEscucha = true;
    try {
      await bot.revisarRecordatorios(alas(16, 4));
    } finally {
      config.modoEscucha = false;
    }
    assert.strictEqual(alGrupo.length, 0, 'salió en modo escucha');
    assert.strictEqual(state.recordatorios()[chat].envios, 0, 'gastó una repetición sin mandar');
    await bot.revisarRecordatorios(alas(16, 9));
    assert.strictEqual(alGrupo.length, 1, 'no reintentó en la vuelta siguiente');
    assert.strictEqual(state.recordatorios()[chat].envios, 1);
  });

  await check('si el envío falla tampoco cuenta', async () => {
    sinRecordatorios();
    limpiar();
    const chat = nuevoChat();
    poner(chat);
    evolution.avisarGrupo = async () => ({ bloqueado: true, motivo: 'fallo de envio' });
    try {
      await bot.revisarRecordatorios(alas(16, 4));
    } finally {
      evolution.avisarGrupo = avisarAnotando;
    }
    assert.strictEqual(state.recordatorios()[chat].envios, 0);
  });

  await check('TOPE: 10 avisos, un único "dejo de recordar" y después nada más', async () => {
    sinRecordatorios();
    limpiar();
    const chat = nuevoChat();
    poner(chat, { creado: alas(8, 30).getTime(), envios: 9, ultimoEnvio: alas(10, 3).getTime() });
    await bot.revisarRecordatorios(alas(11, 4));
    assert.ok(/Aviso 10 de 10/.test(alGrupo[0]), 'el décimo no salió como aviso normal');
    await bot.revisarRecordatorios(alas(12, 4));
    assert.strictEqual(alGrupo.length, 2);
    assert.ok(/DEJO DE RECORDAR/.test(alGrupo[1]), 'no avisó que corta: ' + alGrupo[1]);
    assert.ok(alGrupo[1].includes('https://wa.me/' + chat.split('@')[0]));
    assert.strictEqual(state.recordatorios()[chat].estado, 'vencido');
    for (const h of [13, 14, 15, 16, 17, 18, 19, 20, 21]) await bot.revisarRecordatorios(alas(h, 4));
    for (const h of [8, 9, 10]) await bot.revisarRecordatorios(alas(h, 4, 12));
    assert.strictEqual(alGrupo.length, 2, 'siguió repitiendo después del tope');
  });

  await check('#hecho también cierra uno vencido', async () => {
    const [chat] = Object.keys(state.recordatorios());
    limpiar();
    await bot.procesar(mio(chat, '#hecho'));
    assert.ok(!state.recordatorios()[chat]);
    assert.strictEqual(alGrupo.length, 1);
  });

  await check('un chat que no es un teléfono no lleva wa.me y se marca', async () => {
    sinRecordatorios();
    limpiar();
    poner('gemini-check@s.whatsapp.net');
    await bot.revisarRecordatorios(alas(16, 4));
    assert.ok(!/wa\.me/.test(alGrupo[0]), 'armó un link con un JID que no es un teléfono');
    assert.ok(/sin link/.test(alGrupo[0]) && /gemini-check/.test(alGrupo[0]));
  });

  await check('si no entra en un mensaje se parte en varios numerados, sin perder ninguno', async () => {
    sinRecordatorios();
    limpiar();
    const chats = [];
    for (let i = 0; i < 30; i++) {
      const c = nuevoChat();
      chats.push(c);
      poner(c, { textos: ['pasarle las cuotas del 15 pro y confirmar el turno ' + i] });
    }
    await bot.revisarRecordatorios(alas(16, 4));
    assert.ok(alGrupo.length > 1, 'con 30 tendría que haberse partido');
    alGrupo.forEach((p, i) => {
      assert.ok(p.startsWith(`(${i + 1}/${alGrupo.length})`), 'la parte ' + (i + 1) + ' no está numerada');
    });
    const todo = alGrupo.join('\n');
    for (const c of chats) {
      assert.ok(todo.includes('wa.me/' + c.split('@')[0]), 'se perdió ' + c);
      assert.strictEqual(state.recordatorios()[c].envios, 1);
    }
  });

  await check('un contacto personal no suena, como en el resumen', async () => {
    sinRecordatorios();
    limpiar();
    const chat = nuevoChat();
    poner(chat);
    const antes = config.contactosPersonales;
    config.contactosPersonales = [chat.split('@')[0]];
    try {
      await bot.revisarRecordatorios(alas(16, 4));
    } finally {
      config.contactosPersonales = antes;
    }
    assert.strictEqual(alGrupo.length, 0);
  });

  await check('los vencidos se borran solos a los 7 días; los activos nunca', async () => {
    sinRecordatorios();
    const viejo = nuevoChat();
    const reciente = nuevoChat();
    const activoViejo = nuevoChat();
    poner(viejo, { estado: 'vencido', vencido: alas(10, 0, 3).getTime() });
    poner(reciente, { estado: 'vencido', vencido: alas(10, 0, 9).getTime() });
    poner(activoViejo, { creado: alas(10, 0, 1).getTime() });
    await bot.revisarRecordatorios(alas(23, 0)); // fuera de horario: solo purga
    assert.ok(!state.recordatorios()[viejo], 'no borró el vencido hace 8 días');
    assert.ok(state.recordatorios()[reciente], 'borró uno vencido hace 2 días');
    assert.ok(state.recordatorios()[activoViejo], 'borró uno activo');
  });

  console.log('\nEn disco\n');

  await check('queda en disco bajo la clave interna, y un reinicio lo recupera sin repetir', async () => {
    sinRecordatorios();
    limpiar();
    const chat = nuevoChat();
    poner(chat);
    await bot.revisarRecordatorios(alas(16, 4));
    const enDisco = JSON.parse(fs.readFileSync(process.env.ESTADO_PATH, 'utf8'));
    const r = enDisco['bot:interno'] && enDisco['bot:interno'].recordatorios[chat];
    assert.ok(r, 'no está en el archivo');
    assert.strictEqual(r.envios, 1, 'el aviso no quedó contado en disco');

    // Reinicio de verdad: el módulo de estado se vuelve a cargar desde el archivo.
    const clave = require.resolve('../src/state');
    const cargado = require.cache[clave];
    delete require.cache[clave];
    try {
      const reiniciado = require('../src/state');
      const r2 = reiniciado.recordatorios()[chat];
      assert.ok(r2, 'se perdió al reiniciar');
      assert.strictEqual(rec.toca(r2, alas(16, 30), rec.horario()), false, 'tras el reinicio sonaría otra vez en la misma hora');
      assert.strictEqual(rec.toca(r2, alas(17, 2), rec.horario()), true);
    } finally {
      require.cache[clave] = cargado;
    }
  });

  await check('todos() no expone los recordatorios a los barridos de chats', () => {
    assert.ok(!Object.keys(state.todos()).includes('bot:interno'));
  });

  console.log('\nEl eco del propio bot\n');

  await check('nada de lo que el bot manda al grupo dispara un comando al volver por el webhook', async () => {
    const mandados = [...historialGrupo];
    for (const tipo of [/^📌/, /^✅/, /^❓/, /⏰/, /DEJO DE RECORDAR/, /^\(1\/\d+\)/]) {
      assert.ok(mandados.some((t) => tipo.test(t)), 'el caso no prueba nada: no hay avisos ' + tipo);
    }
    for (const t of mandados) assert.strictEqual(rec.comando(t), null, 'lo toma como comando: ' + t.slice(0, 40));

    sinRecordatorios();
    const chat = nuevoChat();
    poner(chat);
    const antes = JSON.stringify(state.recordatorios());
    limpiar();
    for (const t of mandados) await bot.procesar(mio(GRUPO, t));
    assert.strictEqual(alGrupo.length, 0, 'se contestó a su propio aviso');
    assert.strictEqual(JSON.stringify(state.recordatorios()), antes);
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
