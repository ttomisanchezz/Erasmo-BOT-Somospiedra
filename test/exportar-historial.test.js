'use strict';
/**
 * Exportador del historial de Somos Piedra (herramientas/historial/exportar-historial.js).
 *
 *   node test/exportar-historial.test.js
 *
 * Sin red, sin Evolution, sin .env: un `fetch` de mentira y numeros inventados (5490000000000).
 * Escribe solo en una carpeta temporal del sistema.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const ex = require('../herramientas/historial/exportar-historial');

let n = 0;
const prueba = (nombre, f) => Promise.resolve().then(f).then(() => { n++; console.log(`  ok  ${nombre}`); }, (e) => { console.error(`  FALLA  ${nombre}\n   ${e.stack}`); process.exitCode = 1; });

const A = '5490000000001@s.whatsapp.net';
const B = '5490000000002@s.whatsapp.net';
const rec = (jid, id, ts, msg, extra = {}) => ({ key: { remoteJid: jid, fromMe: !!extra.fromMe, id, ...(extra.alt ? { remoteJidAlt: extra.alt } : {}) }, pushName: extra.nombre, messageTimestamp: ts, message: msg, messageType: extra.tipo, source: extra.source });

(async () => {
  await prueba('configuracion: se niega con somosiphone y sin instancia o clave', () => {
    assert.throws(() => ex.configuracion({ EVOLUTION_INSTANCE: 'somosiphone', EVOLUTION_APIKEY: 'x' }, {}), /somosiphone/);
    assert.throws(() => ex.configuracion({ EVOLUTION_INSTANCE: 'SomosiPhone', EVOLUTION_APIKEY: 'x' }, {}), /somosiphone/);
    assert.throws(() => ex.configuracion({ EVOLUTION_APIKEY: 'x' }, {}), /EVOLUTION_INSTANCE/);
    assert.throws(() => ex.configuracion({ EVOLUTION_INSTANCE: 'somospiedra' }, {}), /EVOLUTION_APIKEY/);
    const c = ex.configuracion({ EVOLUTION_INSTANCE: 'somospiedra', EVOLUTION_APIKEY: 'k', EVOLUTION_URL: 'http://localhost:8080/' }, {});
    assert.deepStrictEqual(c, { url: 'http://localhost:8080', instancia: 'somospiedra', apikey: 'k' });
  });

  await prueba('leerEnv: comentarios, comillas y archivo que no existe', () => {
    const f = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pie-')), '.env');
    fs.writeFileSync(f, '# hola\nA=1\r\nB = "dos"\nC=\n');
    assert.deepStrictEqual(ex.leerEnv(f), { A: '1', B: 'dos', C: '' });
    assert.deepStrictEqual(ex.leerEnv(f + 'x'), {});
  });

  await prueba('solo lee: cualquier otra ruta de Evolution se rechaza antes de llamar', async () => {
    let llamadas = 0;
    const fetchFn = async () => { llamadas++; return { ok: true, json: async () => ({}) }; };
    for (const ruta of ['/message/sendText/somospiedra', '/instance/create', '/webhook/set/somospiedra', '/instance/logout/somospiedra', '/chat/findChats/somospiedra/../x']) {
      await assert.rejects(() => ex.llamar({ url: 'http://x', instancia: 'somospiedra', apikey: 'k' }, 'POST', ruta, {}, { fetchFn }), /no permitida/);
    }
    assert.strictEqual(llamadas, 0);
  });

  await prueba('compactar: texto, citas, foto con epigrafe, audio, archivo, efimero', () => {
    const t = ex.compactar(rec(A, 'T1', 1760000000, { conversation: 'hola, precio del porcelanato?' }, { nombre: 'Cli' }));
    assert.ok(t.ok); assert.strictEqual(t.msg.de, 'cliente'); assert.strictEqual(t.msg.tipo, 'texto'); assert.strictEqual(t.msg.texto, 'hola, precio del porcelanato?'); assert.strictEqual(t.msg.nombre, 'Cli');
    assert.strictEqual(t.msg.fecha, new Date(1760000000 * 1000).toISOString());
    const c = ex.compactar(rec(A, 'T2', 1760000100, { extendedTextMessage: { text: 'y de este?', contextInfo: { quotedMessage: { conversation: 'Piedra laja 2x1' } } } }));
    assert.strictEqual(c.msg.cita, 'Piedra laja 2x1');
    const f = ex.compactar(rec(A, 'T3', 1760000200, { imageMessage: { caption: 'asi lo quiero' } }));
    assert.strictEqual(f.msg.tipo, 'foto'); assert.strictEqual(f.msg.texto, 'asi lo quiero');
    const fs2 = ex.compactar(rec(A, 'T4', 1760000300, { imageMessage: {} }));
    assert.strictEqual(fs2.msg.tipo, 'foto'); assert.strictEqual(fs2.msg.texto, undefined);
    const au = ex.compactar(rec(A, 'T5', 1760000400, { audioMessage: { seconds: 37 } }));
    assert.strictEqual(au.msg.tipo, 'audio'); assert.strictEqual(au.msg.seg, 37);
    const d = ex.compactar(rec(A, 'T6', 1760000500, { documentWithCaptionMessage: { message: { documentMessage: { caption: 'presupuesto', fileName: 'pres.pdf' } } } }));
    assert.strictEqual(d.msg.tipo, 'archivo'); assert.strictEqual(d.msg.texto, 'presupuesto'); assert.strictEqual(d.msg.archivo, 'pres.pdf');
    const e = ex.compactar(rec(A, 'T7', 1760000600, { ephemeralMessage: { message: { extendedTextMessage: { text: 'en un chat efimero' } } } }));
    assert.strictEqual(e.msg.texto, 'en un chat efimero');
    const p = ex.compactar(rec(A, 'T8', 1760000700, { conversation: 'te lo mando' }, { fromMe: true, nombre: 'Piedra', source: 'android' }));
    assert.strictEqual(p.msg.de, 'piedra'); assert.strictEqual(p.msg.nombre, undefined); assert.strictEqual(p.msg.origen, 'android');
    const ms = ex.compactar(rec(A, 'T9', 1760000800, { conversation: 'ms' }));
    assert.strictEqual(ms.msg.ts, 1760000800);
    const enMs = ex.compactar(rec(A, 'T10', 1760000800000, { conversation: 'ts en ms' }));
    assert.strictEqual(enMs.msg.ts, 1760000800);
    const largo = ex.compactar(rec(A, 'T11', { low: 1760000900, high: 0 }, { conversation: 'ts long' }));
    assert.strictEqual(largo.msg.ts, 1760000900);
  });

  await prueba('compactar: descarta grupos, estados, canales, reacciones y sistema, con su motivo', () => {
    assert.strictEqual(ex.compactar(rec('120363000000000000@g.us', 'G', 1, { conversation: 'x' })).motivo, 'grupo');
    assert.strictEqual(ex.compactar(rec('status@broadcast', 'S', 1, { conversation: 'x' })).motivo, 'difusion_o_estado');
    assert.strictEqual(ex.compactar(rec('1203@newsletter', 'N', 1, { conversation: 'x' })).motivo, 'canal');
    assert.strictEqual(ex.compactar(rec(A, 'R', 1, { reactionMessage: { text: '👍' } })).motivo, 'reaccion');
    assert.strictEqual(ex.compactar(rec(A, 'P', 1, { protocolMessage: { type: 0 } })).motivo, 'sistema');
    assert.strictEqual(ex.compactar({ key: {}, message: {} }).motivo, 'sin_chat');
    assert.strictEqual(ex.compactar({ key: { remoteJid: A }, message: { conversation: 'x' } }).motivo, 'sin_id');
  });

  await prueba('armarChats: junta el @lid con su numero, saca repetidos y ordena por fecha', () => {
    const LID = '99999999999999@lid';
    const lista = [
      rec(A, 'a3', 300, { conversation: 'tercero' }),
      rec(LID, 'a1', 100, { conversation: 'primero' }, { alt: A, nombre: 'Ana' }),
      rec(A, 'a2', 200, { conversation: 'segundo' }, { fromMe: true }),
      rec(A, 'a3', 300, { conversation: 'tercero' }), // repetido
      rec(LID, 'a4', 400, { conversation: 'cuarto' }), // sin alt, pero ya se sabe a quien pertenece
      rec('88888888888888@lid', 'b1', 50, { conversation: 'lid sin traducir' }),
      rec(B, 'c1', 10, { conversation: 'otro' }),
    ].map(ex.compactar).filter((c) => c.ok);
    const chats = ex.armarChats(lista);
    const porId = Object.fromEntries(chats.map((c) => [c.chat, c]));
    assert.deepStrictEqual(Object.keys(porId).sort(), ['5490000000001', '5490000000002', 'lid-88888888888888']);
    const a = porId['5490000000001'];
    assert.deepStrictEqual(a.mensajes.map((m) => m.texto), ['primero', 'segundo', 'tercero', 'cuarto']);
    assert.strictEqual(a.nombre, 'Ana'); assert.strictEqual(a.lid, '99999999999999'); assert.strictEqual(a.numero, '5490000000001');
    assert.strictEqual(porId['lid-88888888888888'].numero, null);
  });

  await prueba('resumenDeChat y estadisticas: sin respuesta, solo Piedra, ida y vuelta, tokens', () => {
    const lista = [
      rec(A, '1', 100, { conversation: 'hola' }), rec(A, '2', 200, { conversation: 'hay stock?' }), // sin respuesta
      rec(B, '3', 100, { conversation: 'precio?' }), rec(B, '4', 200, { conversation: '$1000 el m2' }, { fromMe: true }), rec(B, '5', 300, { audioMessage: { seconds: 20 } }),
      rec('5490000000003@s.whatsapp.net', '6', 100, { conversation: 'buenas, te escribo por lo del otro dia' }, { fromMe: true }), // solo Piedra
    ].map(ex.compactar).filter((c) => c.ok);
    const r = ex.armarChats(lista).map(ex.resumenDeChat);
    const por = Object.fromEntries(r.map((x) => [x.chat, x]));
    assert.strictEqual(por['5490000000001'].sin_respuesta_de_piedra, true);
    assert.strictEqual(por['5490000000002'].sin_respuesta_de_piedra, false);
    assert.strictEqual(por['5490000000002'].ultimo_de, 'cliente'); assert.strictEqual(por['5490000000002'].primero_de, 'cliente');
    assert.strictEqual(por['5490000000002'].seg_audio, 20); assert.strictEqual(por['5490000000002'].tipos.audio, 1);
    assert.strictEqual(por['5490000000003'].solo_piedra, true);
    const e = ex.estadisticas(r, { grupo: 2 });
    assert.strictEqual(e.chats, 3); assert.strictEqual(e.mensajes, 6);
    assert.strictEqual(e.chats_sin_respuesta_de_piedra, 1); assert.strictEqual(e.chats_solo_piedra, 1); assert.strictEqual(e.chats_con_ida_y_vuelta, 1);
    assert.strictEqual(e.seg_audio_total, 20); assert.deepStrictEqual(e.descartados, { grupo: 2 });
    assert.ok(e.tokens_est_total > 0 && e.tokens_est_por_chat.max >= e.tokens_est_por_chat.p50);
  });

  await prueba('traerTodo: recorre todas las paginas, manda gte y lte juntos y reintenta un 500', async () => {
    const paginas = [
      [rec(A, 'p1a', 300, { conversation: 'c' }), rec('120363000000000000@g.us', 'g1', 299, { conversation: 'grupo' })],
      [rec(A, 'p2a', 200, { conversation: 'b' }), rec(A, 'p2b', 100, { conversation: 'a' })],
      [rec(B, 'p3a', 50, { conversation: 'z' })],
    ];
    const pedidos = [];
    let fallo = true;
    const fetchFn = async (url, init) => {
      const cuerpo = JSON.parse(init.body);
      pedidos.push({ url, metodo: init.method, cuerpo, apikey: init.headers.apikey });
      if (cuerpo.page === 2 && fallo) { fallo = false; return { ok: false, status: 500, text: async () => 'boom' }; }
      return { ok: true, json: async () => ({ messages: { total: 5, pages: 3, records: paginas[cuerpo.page - 1] || [] } }) };
    };
    const cfg = { url: 'http://localhost:8080', instancia: 'somospiedra', apikey: 'k' };
    const avances = [];
    const r = await ex.traerTodo(cfg, new Date('2026-01-01T00:00:00Z'), new Date('2026-10-15T00:00:00Z'), { fetchFn, espera: 0, alProgreso: (p) => avances.push(p.pagina) });
    assert.strictEqual(r.leidos, 5); assert.strictEqual(r.compactados.length, 4); assert.deepStrictEqual(r.descartados, { grupo: 1 });
    assert.deepStrictEqual(avances, [1, 2, 3]);
    assert.strictEqual(pedidos.length, 4); // 3 paginas + 1 reintento
    for (const p of pedidos) {
      assert.strictEqual(p.metodo, 'POST'); assert.strictEqual(p.url, 'http://localhost:8080/chat/findMessages/somospiedra'); assert.strictEqual(p.cuerpo.offset, 500);
      assert.ok(p.cuerpo.where.messageTimestamp.gte && p.cuerpo.where.messageTimestamp.lte);
    }
  });

  await prueba('un 401 no se reintenta y un cuerpo raro da error claro', async () => {
    let n401 = 0;
    const cfg = { url: 'http://x', instancia: 'somospiedra', apikey: 'k' };
    await assert.rejects(() => ex.traerPagina(cfg, new Date(0), new Date(), 1, 500, { espera: 0, fetchFn: async () => { n401++; return { ok: false, status: 401, text: async () => 'Unauthorized' }; } }), /401/);
    assert.strictEqual(n401, 1);
    await assert.rejects(() => ex.traerPagina(cfg, new Date(0), new Date(), 1, 500, { espera: 0, fetchFn: async () => ({ ok: true, json: async () => ({ otra: 1 }) }) }), /sin messages\.records/);
  });

  await prueba('escribirExportacion: tres archivos, un mensaje por linea, sin pisar nada', async () => {
    const dir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'pie-')), 'export-x');
    const chats = ex.armarChats([rec(A, '1', 100, { conversation: 'hola' }), rec(A, '2', 200, { conversation: 'chau' }, { fromMe: true })].map(ex.compactar).filter((c) => c.ok));
    const res = chats.map(ex.resumenDeChat);
    await ex.escribirExportacion(dir, chats, res, ex.estadisticas(res, {}));
    const lineas = fs.readFileSync(path.join(dir, 'mensajes.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(lineas.map((l) => [l.chat, l.de, l.texto]), [['5490000000001', 'cliente', 'hola'], ['5490000000001', 'piedra', 'chau']]);
    assert.strictEqual(fs.readFileSync(path.join(dir, 'chats.jsonl'), 'utf8').trim().split('\n').length, 1);
    assert.strictEqual(JSON.parse(fs.readFileSync(path.join(dir, 'resumen.json'), 'utf8')).mensajes, 2);
  });

  await prueba('argumentos', () => {
    assert.deepStrictEqual(ex.argumentos(['--probar', '--desde=2026-01-01', '--salida=x']), { probar: true, desde: '2026-01-01', salida: 'x' });
    assert.deepStrictEqual(ex.argumentos([]), { probar: false });
  });

  console.log(process.exitCode ? '\nHAY FALLAS' : `\n${n} pruebas ok`);
})();
