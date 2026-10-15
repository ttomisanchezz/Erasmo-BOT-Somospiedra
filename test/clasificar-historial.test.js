'use strict';
/**
 * Clasificador del historial de Somos Piedra (herramientas/historial/clasificar-historial.js).
 *
 *   node test/clasificar-historial.test.js
 *
 * Sin red y sin API: un `fetch` de mentira, numeros inventados (5490000000000) y carpetas temporales.
 * No lee el .env ni la lista de exclusion de verdad (se las pasa a `correr`).
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const cl = require('../herramientas/historial/clasificar-historial');

let n = 0;
const prueba = (nombre, f) => Promise.resolve().then(f).then(() => { n++; console.log(`  ok  ${nombre}`); }, (e) => { console.error(`  FALLA  ${nombre}\n   ${e.stack}`); process.exitCode = 1; });

const T0 = 1760000000; // 2025-10-09 aprox.
const m = (chat, id, ts, de, extra = {}) => ({ chat, id, ts, fecha: new Date(ts * 1000).toISOString(), de, tipo: 'texto', ...extra });
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'pie-cl-'));

function exportacionDePrueba() {
  const dir = tmp();
  const chats = [];
  const ms = [];
  const agregar = (chat, numero, nombre, lista) => {
    ms.push(...lista);
    const cli = lista.filter((x) => x.de === 'cliente').length;
    chats.push({ chat, numero, lid: null, nombre, mensajes: lista.length, del_cliente: cli, de_piedra: lista.length - cli, sin_respuesta_de_piedra: cli > 0 && cli === lista.length, solo_piedra: cli === 0, tokens_est: lista.length * 20, tipos: {}, seg_audio: 0 });
  };
  agregar('5490000000001', '5490000000001', 'Ana Gomez', [m('5490000000001', 'a1', T0, 'cliente', { texto: 'hola, precio de la piedra laja? mi cel es 299 4123456' }), m('5490000000001', 'a2', T0 + 60, 'piedra', { texto: '$18.000 el m2' })]);
  agregar('5490000000002', '5490000000002', 'Beto', [m('5490000000002', 'b1', T0, 'cliente', { texto: 'buenas' })]);
  agregar('5490000000003', '5490000000003', 'Personal', [m('5490000000003', 'c1', T0, 'cliente', { texto: 'esto no se clasifica' })]);
  agregar('lid-777', null, '', [m('lid-777', 'd1', T0, 'piedra', { texto: 'te paso el presupuesto' }), m('lid-777', 'd2', T0 + 10, 'cliente', { texto: 'dale' })]);
  fs.writeFileSync(path.join(dir, 'chats.jsonl'), chats.map((c) => JSON.stringify(c)).join('\n') + '\n');
  fs.writeFileSync(path.join(dir, 'mensajes.jsonl'), ms.map((x) => JSON.stringify(x)).join('\n') + '\n');
  return dir;
}

const respuestaOk = (extra = {}, salida = 300) => ({ ok: true, json: async () => ({ stop_reason: 'tool_use', usage: { input_tokens: 400, output_tokens: salida, cache_read_input_tokens: 1500, cache_creation_input_tokens: 0 }, content: [{ type: 'tool_use', name: 'registrar_chat', input: { contacto: 'cliente_particular', conversaciones: [{ n: 1, consulta: 'precio', cierre: 'no_claro' }], ...extra } }] }) });

(async () => {
  await prueba('enmascarar: telefonos y cifras largas si, precios y medidas no', () => {
    assert.strictEqual(cl.enmascarar('mi cel es 299 4123456 y 2994123456 y +54 9 299 412-3456'), 'mi cel es [numero] y [numero] y [numero]');
    assert.strictEqual(cl.enmascarar('DNI 30123456 y 12345678901'), 'DNI 30123456 y [numero]');
    assert.strictEqual(cl.enmascarar('son $1.500.000 o 18000 el m2, 150 m2, 30 x 60'), 'son $1.500.000 o 18000 el m2, 150 m2, 30 x 60');
  });

  await prueba('conversacionesDe: corta a las 48 h, marca el cambio de dia y los tipos de mensaje', () => {
    const base = 1760000000;
    const ms = [
      m('x', '1', base, 'cliente', { texto: 'hola\nprecio?', cita: 'laja 2x1' }),
      m('x', '2', base + 600, 'piedra', { tipo: 'audio', seg: 12 }),
      m('x', '3', base + 700, 'cliente', { tipo: 'foto', texto: 'asi' }),
      m('x', '4', base + 800, 'cliente', { tipo: 'archivo', archivo: 'pres.pdf' }),
      m('x', '5', base + 30 * 3600, 'piedra', { texto: 'sigue vigente' }), // 30 h despues: misma conversacion, otro dia
      m('x', '6', base + 100 * 3600, 'cliente', { texto: 'volvi' }), // 70 h despues: conversacion nueva
    ];
    const c = cl.conversacionesDe(ms, 48);
    assert.strictEqual(c.length, 2);
    assert.strictEqual(c[0].mensajes, 5); assert.strictEqual(c[1].mensajes, 1);
    assert.ok(/Cliente: \(responde a: "laja 2x1"\) hola ⏎ precio\?/.test(c[0].lineas[0]), c[0].lineas[0]);
    assert.ok(/Piedra: \[audio 12s\]$/.test(c[0].lineas[1]), c[0].lineas[1]);
    assert.ok(/Cliente: \[foto\] asi$/.test(c[0].lineas[2]));
    assert.ok(/Cliente: \[archivo: pres\.pdf\]$/.test(c[0].lineas[3]));
    assert.ok(/^\d\d\/\d\d\/\d{4} \d\d:\d\d Piedra: sigue vigente$/.test(c[0].lineas[4]), c[0].lineas[4]);
    assert.ok(/Conversación 2 .* días después de la anterior/.test(c[1].encabezado), c[1].encabezado);
  });

  await prueba('llamadasDe: una llamada por chat, sin telefono ni nombre; las muy largas se parten entre conversaciones', () => {
    const ms = [m('5490000000001', 'a', T0, 'cliente', { texto: 'hola' }), m('5490000000001', 'b', T0 + 5, 'piedra', { texto: 'chau' })];
    const [l] = cl.llamadasDe('c0001', ms);
    assert.strictEqual(l.id, 'c0001'); assert.strictEqual(l.partes, 1);
    assert.ok(l.texto.startsWith('Chat c0001 · 1 conversación(es)'));
    assert.ok(!l.texto.includes('5490000000001'));
    const muchos = [];
    for (let i = 0; i < 6; i++) muchos.push(m('z', `m${i}`, T0 + i * 200 * 3600, 'cliente', { texto: 'x'.repeat(300) }));
    const partes = cl.llamadasDe('c0002', muchos, { topeChars: 800 });
    assert.ok(partes.length > 1);
    assert.strictEqual(partes.reduce((a, p) => a + p.conversaciones, 0), 6);
    assert.ok(partes.every((p) => p.partes === partes.length));
  });

  await prueba('recortar: una conversacion enorme deja el principio y el final', () => {
    const ms = Array.from({ length: 200 }, (_, i) => m('z', `m${i}`, T0 + i * 10, i % 2 ? 'piedra' : 'cliente', { texto: `mensaje numero ${i} ` + 'y'.repeat(50) }));
    const [c] = cl.conversacionesDe(ms);
    const r = cl.recortar(c, 3000);
    assert.ok(r.recortada > 0); assert.ok(r.chars < 3500);
    assert.ok(r.lineas.some((l) => /se omiten \d+ mensajes del medio/.test(l)));
    assert.ok(r.lineas[0].includes('mensaje numero 0 ')); assert.ok(r.lineas[r.lineas.length - 1].includes('mensaje numero 199 '));
  });

  await prueba('exclusiones: por telefono (ultimos 10 digitos) y por lid', () => {
    const ex = ['5492994637323', 'lid-55'];
    assert.strictEqual(cl.estaExcluido({ chat: '5492994637323', numero: '5492994637323' }, ex), true);
    assert.strictEqual(cl.estaExcluido({ chat: '542994637323', numero: '542994637323' }, ex), true); // sin el 9
    assert.strictEqual(cl.estaExcluido({ chat: 'lid-55', numero: null }, ex), true);
    assert.strictEqual(cl.estaExcluido({ chat: 'lid-56', numero: null }, ex), false);
    assert.strictEqual(cl.estaExcluido({ chat: '5490000000009', numero: '5490000000009' }, ex), false);
    assert.strictEqual(cl.estaExcluido({ chat: '0', numero: '0' }, []), true); // cuenta de sistema de WhatsApp
    const f = path.join(tmp(), 'x.txt'); fs.writeFileSync(f, '# c\n5492994637323  # personal\n\nlid-55\n');
    assert.deepStrictEqual(cl.leerExclusiones(f), ['5492994637323', 'lid-55']);
    assert.deepStrictEqual(cl.leerExclusiones(f + 'no'), []);
  });

  await prueba('elegirPiloto: n chats, siempre los mismos con la misma semilla, con casos raros', () => {
    const chats = Array.from({ length: 200 }, (_, i) => ({ chat: `c${i}`, mensajes: 5 + (i % 40), sin_respuesta_de_piedra: i % 20 === 0, solo_piedra: i % 25 === 1, tokens_est: i * 3 }));
    const a = cl.elegirPiloto(chats, 30, 7).map((c) => c.chat);
    const b = cl.elegirPiloto(chats, 30, 7).map((c) => c.chat);
    const otra = cl.elegirPiloto(chats, 30, 8).map((c) => c.chat);
    assert.strictEqual(a.length, 30); assert.strictEqual(new Set(a).size, 30);
    assert.deepStrictEqual(a, b); assert.notDeepStrictEqual(a, otra);
    assert.ok(a.some((id) => chats.find((c) => c.chat === id).sin_respuesta_de_piedra));
    assert.ok(a.includes('c199')); // el mas largo
  });

  await prueba('costo: usd y estimar (el bajo siempre es menor que el alto)', () => {
    assert.strictEqual(cl.usd({ entrada: 1e6, salida: 1e6, cacheLeida: 1e6, cacheEscrita: 1e6 }), 2 + 10 + 0.2 + 2.5);
    const e = cl.estimar([{ chars: 3500 }, { chars: 7000 }, { chars: 350 }]);
    assert.strictEqual(e.llamadas, 3); assert.ok(e.usd_bajo > 0 && e.usd_bajo < e.usd_alto);
  });

  await prueba('clasificar: arma el pedido (clave, modelo, cache, esfuerzo), lee la herramienta y suma el uso', async () => {
    let visto;
    const fetchFn = async (url, init) => { visto = { url, init, cuerpo: JSON.parse(init.body) }; return respuestaOk(); };
    const r = await cl.clasificar('sk-test', { texto: 'Chat c0001 ...' }, { modelo: 'claude-sonnet-5-5', esfuerzo: 'low' }, { fetchFn, espera: 0 });
    assert.strictEqual(visto.url, 'https://api.anthropic.com/v1/messages');
    assert.strictEqual(visto.init.headers['x-api-key'], 'sk-test'); assert.strictEqual(visto.init.headers['anthropic-version'], '2023-06-01');
    assert.strictEqual(visto.cuerpo.model, 'claude-sonnet-5-5'); assert.deepStrictEqual(visto.cuerpo.output_config, { effort: 'low' });
    assert.deepStrictEqual(visto.cuerpo.tool_choice, { type: 'auto' });
    assert.ok(visto.cuerpo.system[0].cache_control && visto.cuerpo.tools[0].cache_control);
    assert.strictEqual(r.registro.conversaciones.length, 1); assert.deepStrictEqual(r.uso, { entrada: 400, salida: 300, cacheLeida: 1500, cacheEscrita: 0 });
  });

  await prueba('clasificar: si no usa la herramienta reintenta una vez; si sigue sin usarla, tira con el gasto', async () => {
    let llamadas = 0;
    const sinHerramienta = { ok: true, json: async () => ({ usage: { input_tokens: 10, output_tokens: 5 }, content: [{ type: 'text', text: 'hola' }] }) };
    const f1 = async (u, init) => { llamadas++; return llamadas === 1 ? sinHerramienta : respuestaOk(); };
    const r = await cl.clasificar('k', { texto: 't' }, { modelo: 'm', esfuerzo: 'low' }, { fetchFn: f1, espera: 0 });
    assert.strictEqual(llamadas, 2); assert.strictEqual(r.uso.entrada, 410);
    llamadas = 0;
    await assert.rejects(() => cl.clasificar('k', { texto: 't' }, { modelo: 'm', esfuerzo: 'low' }, { fetchFn: async () => { llamadas++; return sinHerramienta; }, espera: 0 }), (e) => e.uso && e.uso.entrada === 20);
    assert.strictEqual(llamadas, 2);
  });

  await prueba('llamarApi: reintenta un 529/429 y no un 400', async () => {
    let c = 0;
    const f = async () => { c++; return c < 3 ? { ok: false, status: 529, text: async () => 'overloaded' } : respuestaOk(); };
    const r = await cl.llamarApi('k', {}, { fetchFn: f, espera: 0 });
    assert.strictEqual(c, 3); assert.ok(r.content);
    c = 0;
    await assert.rejects(() => cl.llamarApi('k', {}, { fetchFn: async () => { c++; return { ok: false, status: 400, text: async () => 'bad' }; }, espera: 0 }), /400/);
    assert.strictEqual(c, 1);
  });

  await prueba('correr sin --confirmar: estima, no llama a la API y no necesita clave', async () => {
    const dir = exportacionDePrueba();
    let llamadas = 0;
    const log = [];
    const r = await cl.correr({ entrada: dir }, {}, { fetchFn: async () => { llamadas++; return respuestaOk(); }, env: {}, exclusiones: ['5490000000003'], log: (s) => log.push(s) });
    assert.strictEqual(llamadas, 0); assert.strictEqual(r.estimacion.llamadas, 3);
    assert.ok(log.join('\n').includes('excluidos: 1')); assert.ok(log.join('\n').includes('No se llamó a la API'));
  });

  await prueba('correr --confirmar: pide --piloto o --todo y pide la clave', async () => {
    const dir = exportacionDePrueba();
    const op = { env: {}, exclusiones: [], log: () => {} };
    await assert.rejects(() => cl.correr({ entrada: dir, confirmar: true }, { ANTHROPIC_API_KEY: 'k' }, op), /--piloto=N o --todo/);
    await assert.rejects(() => cl.correr({ entrada: dir, confirmar: true, todo: true }, {}, op), /ANTHROPIC_API_KEY/);
  });

  await prueba('correr --todo: escribe resultados y gasto, excluye al personal y no manda telefonos ni nombres a la API', async () => {
    const dir = exportacionDePrueba();
    const cuerpos = [];
    const fetchFn = async (u, init) => { cuerpos.push(init.body); return respuestaOk(); };
    const r = await cl.correr({ entrada: dir, confirmar: true, todo: true, tope: '5' }, {}, { fetchFn, espera: 0, env: { ANTHROPIC_API_KEY: 'sk-test' }, exclusiones: ['5490000000003'], log: () => {} });
    assert.strictEqual(cuerpos.length, 3); assert.strictEqual(r.errores, 0); assert.strictEqual(r.frenado_por_tope, false);
    const todo = cuerpos.join('\n');
    for (const prohibido of ['5490000000001', 'Ana Gomez', 'Beto', '4123456', 'esto no se clasifica']) assert.ok(!todo.includes(prohibido), `se filtro: ${prohibido}`);
    assert.ok(todo.includes('[numero]'));
    const res = fs.readFileSync(path.join(r.salida, 'resultados.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    assert.deepStrictEqual(res.map((x) => x.id).sort(), ['c0001', 'c0002', 'c0004']);
    assert.ok(res.every((x) => x.uso && x.usd > 0 && x.modelo === 'claude-sonnet-5-5'));
    const g = JSON.parse(fs.readFileSync(path.join(r.salida, 'gasto.json'), 'utf8'));
    assert.strictEqual(g.llamadas_hechas_ahora, 3); assert.ok(g.gasto_usd > 0);
    assert.ok(!JSON.stringify(g).includes('sk-test'));
  });

  await prueba('correr: se frena solo con el tope y --seguir retoma sin repetir', async () => {
    const dir = exportacionDePrueba();
    const op = (extra = {}) => ({ espera: 0, env: { ANTHROPIC_API_KEY: 'k' }, exclusiones: [], log: () => {}, ...extra });
    // cada llamada cuesta ~USD 0,05 (5000 tokens de salida): con tope 0,06 se frena despues de la primera
    let c1 = 0;
    const r1 = await cl.correr({ entrada: dir, confirmar: true, todo: true, tope: '0.06', concurrencia: '1' }, {}, op({ fetchFn: async () => { c1++; return respuestaOk({}, 5000); } }));
    assert.strictEqual(r1.frenado_por_tope, true); assert.ok(c1 >= 1 && c1 < 4, `llamadas: ${c1}`);
    let c2 = 0;
    const r2 = await cl.correr({ entrada: dir, confirmar: true, todo: true, tope: '5', seguir: r1.salida }, {}, op({ fetchFn: async () => { c2++; return respuestaOk(); } }));
    assert.strictEqual(c1 + c2, 4); assert.strictEqual(r2.frenado_por_tope, false);
    const ids = fs.readFileSync(path.join(r1.salida, 'resultados.jsonl'), 'utf8').trim().split('\n').map((l) => JSON.parse(l).id);
    assert.strictEqual(new Set(ids).size, 4);
  });

  await prueba('correr: un error de la API queda en errores.jsonl y no frena a los demas', async () => {
    const dir = exportacionDePrueba();
    let c = 0;
    const fetchFn = async () => { c++; return c === 2 ? { ok: false, status: 400, text: async () => 'mal pedido' } : respuestaOk(); };
    const r = await cl.correr({ entrada: dir, confirmar: true, todo: true, concurrencia: '1' }, {}, { fetchFn, espera: 0, env: { ANTHROPIC_API_KEY: 'k' }, exclusiones: [], log: () => {} });
    assert.strictEqual(r.errores, 1); assert.strictEqual(r.llamadas_hechas_ahora, 3);
    assert.ok(/400/.test(fs.readFileSync(path.join(r.salida, 'errores.jsonl'), 'utf8')));
  });

  await prueba('llamadasDe: nunca mas de 8 conversaciones por llamada (en el piloto 20 y 64 cortaron la respuesta)', () => {
    const muchas = [];
    for (let i = 0; i < 20; i++) muchas.push(m('z', `q${i}`, T0 + i * 200 * 3600, 'cliente', { texto: 'hola' }));
    const partes = cl.llamadasDe('c0003', muchas);
    assert.strictEqual(partes.length, 3);
    assert.ok(partes.every((p) => p.conversaciones <= 8));
    assert.strictEqual(partes.reduce((a, p) => a + p.conversaciones, 0), 20);
    assert.ok(partes[1].texto.includes('conversaciones 9 a 16'));
  });

  await prueba('clasificar: si la respuesta se corta por max_tokens no reintenta (seria pagar dos veces lo mismo) y tira con el gasto', async () => {
    let llamadas = 0;
    const cortada = { ok: true, json: async () => ({ stop_reason: 'max_tokens', usage: { input_tokens: 100, output_tokens: 8000 }, content: [{ type: 'text', text: '...' }] }) };
    await assert.rejects(() => cl.clasificar('k', { texto: 't' }, { modelo: 'm', esfuerzo: 'low' }, { fetchFn: async () => { llamadas++; return cortada; }, espera: 0 }), (e) => e.cortado === true && e.uso.salida === 8000 && /max_tokens/.test(e.message));
    assert.strictEqual(llamadas, 1);
  });

  await prueba('estimar: la salida crece con las conversaciones, no solo con las llamadas', () => {
    const pocas = cl.estimar([{ chars: 3500, conversaciones: 1 }]);
    const muchas = cl.estimar([{ chars: 3500, conversaciones: 8 }]);
    assert.strictEqual(muchas.conversaciones, 8);
    assert.ok(muchas.usd_bajo > pocas.usd_bajo && muchas.usd_alto > pocas.usd_alto);
    assert.ok(pocas.tokens_fijos_por_llamada >= 2737);
    assert.ok(pocas.tokens_texto >= 1700); // 3500 chars / 3.5 * 1.7
  });

  await prueba('argumentos', () => {
    assert.deepStrictEqual(cl.argumentos(['--piloto=30', '--confirmar', '--tope=5']), { confirmar: true, todo: false, piloto: '30', tope: '5' });
    assert.deepStrictEqual(cl.argumentos([]), { confirmar: false, todo: false });
  });

  console.log(process.exitCode ? '\nHAY FALLAS' : `\n${n} pruebas ok`);
})();
