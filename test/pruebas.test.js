'use strict';
/**
 * npm run pruebas (herramientas/pruebas/armar.js): el .md con la charla del tester, armado con el registro de
 * aprendizaje REAL de una conversación de mentira (Sonnet y Evolution de mentira, sin red).
 */
const fs = require('fs');
const path = require('path');
const TESTER = '5492994295806';
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'tester', NUMEROS_TESTER: TESTER });
const assert = require('assert');
const { check, fin, bot, state, sonnet, mensaje, jid, aprendizaje, evolution, aClientes } = p;
const herr = require('../src/herramientas-erasmo');
const { armarCatalogo } = require('../src/catalogo-piedra');
const armar = require('../herramientas/pruebas/armar');

herr.usarCatalogoDelPanel(async () => armarCatalogo([{ PRODUCTO: 'Adoquines ojito', EFECTIVO: '78000.00', LISTA: '90000.00', UNIDAD: 'm2' }]));
fs.mkdirSync(process.env.DOCS_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'Catalogo-Somos-Piedra-2026_4.pdf'), '%PDF-1.4 de mentira');
evolution.enviarDocumento = async (numero) => (aClientes.push({ numero, texto: '[documento]' }), { key: { remoteJid: numero, fromMe: true, id: 'DOCP1' } });

const hoy = armar.diaDe(Date.now());

(async () => {
  console.log('npm run pruebas');
  let md = '';
  await check('una charla de mentira (cotiza, frena la guardia, catálogo, escala) queda en el .md con todo lo que sirve para iterar', async () => {
    state.reiniciar(jid(TESTER));
    sonnet.guion(
      [sonnet.usar('cotizar', { producto: 'Adoquines ojito', m2: '10', forma_pago: 'efectivo' })],
      sonnet.responde(['Te sale $790.000 en efectivo.']),
      sonnet.responde(['Para 10 m² te sale $780.000 en efectivo, sin factura.'])
    );
    await bot.procesar(mensaje(TESTER, 'cuanto sale el adoquin ojito para 10 m2? pago en efectivo'));
    sonnet.guion([sonnet.usar('mandar_catalogo', {})], sonnet.responde(['Te mando el catálogo para que veas las opciones.']));
    await bot.procesar(mensaje(TESTER, 'y que otras piedras tienen?'));
    sonnet.guion(sonnet.escala('pide envío a Plottier, adoquines ojito 10 m²'));
    await bot.procesar(mensaje(TESTER, 'hacen envios a plottier?'));

    const clave = aprendizaje.clave(jid(TESTER));
    const eventos = armar.eventosDelDia(aprendizaje.leerTodo(), (e) => e.clave === clave, hoy);
    assert.ok(eventos.length >= 6);
    md = armar.armarMarkdown({ eventos, fecha: hoy, ultimos4: '5806', ficha: state.todos()[jid(TESTER)].ficha });

    assert.match(md, /^# Pruebas de Erasmo · \d{4}-\d{2}-\d{2} · chat \.\.\.5806/);
    assert.ok(!md.includes(TESTER), 'el número completo está en el archivo');
    assert.match(md, /### Tanda 1 ·/);
    assert.match(md, /### Tanda 3 ·/);
    assert.match(md, /> cuanto sale el adoquin ojito para 10 m2\? pago en efectivo/);
    assert.match(md, /\*\*Erasmo contestó:\*\*[\s\S]*> Para 10 m² te sale \$780\.000 en efectivo, sin factura\./);
    // La herramienta, con lo que pidió y lo que devolvió (el monto).
    assert.match(md, /- `cotizar` \{"producto":"Adoquines ojito","m2":"10","forma_pago":"efectivo"\} → Adoquines ojito · 10 m² · SIN factura \| efectivo[^|]*: \$780\.000/);
    assert.match(md, /\*\*Montos que dejó escribir la guardia:\*\* \$780\.000/);
    // El freno de la guardia, con lo que había escrito.
    assert.match(md, /\*\*La guardia frenó la primera versión:\*\* monto que no salió de ninguna herramienta: \$790\.000/);
    assert.match(md, /> Te sale \$790\.000 en efectivo\./);
    // El catálogo y lo que salió de verdad.
    assert.match(md, /- `mandar_catalogo` \{\} → ok: va con los mensajes/);
    assert.match(md, /- Salió: documento \(catálogo en PDF\)/);
    // La escalada: al cliente le llegó solo el mensaje fijo del código (16/11/2026), y figura como lo que salió.
    assert.match(md, /\*\*Erasmo escaló\*\* \(al cliente solo le llegó "Enseguida te respondemos\."\): pide envío a Plottier, adoquines ojito 10 m²/);
    assert.match(md, /- Salió: texto · "Enseguida te respondemos\."/);
    // La ficha y el costo.
    assert.match(md, /## Ficha del chat[\s\S]*En qué quedó: escaló: pide envío a Plottier/);
    assert.match(md, /Reglas del cerebro: [0-9a-f]{8}/);
    assert.match(md, /<sub>US\$/);
  });
  await check('una escalada sin el mensaje fijo (Sonnet falló, borrador, registros de antes del 16/11) sigue diciendo que no le llegó nada', async () => {
    const eventos = [
      { tipo: 'cliente', ts: `${hoy}T15:00:00.000Z`, id: 'A1', texto: 'hacen envios?' },
      { tipo: 'propuesta', ts: `${hoy}T15:00:30.000Z`, tanda: 'T1', lineas: ['A1'], mensajes: [], escalar: true, motivo: 'pide envío' },
      { tipo: 'silencio', ts: `${hoy}T15:00:31.000Z`, tanda: 'T1', motivo: 'escalo', lineas: ['A1'] },
    ];
    const sin = armar.armarMarkdown({ eventos, fecha: hoy, ultimos4: '5806' });
    assert.match(sin, /\*\*Erasmo escaló\*\* \(al cliente no le llegó nada\): pide envío/);
    // Si el envío del mensaje fijo falló, tampoco le llegó.
    const fallido = { tipo: 'entrega', ts: `${hoy}T15:00:32.000Z`, tanda: 'T1', formato: 'texto', origen: 'escalado', texto: 'Enseguida te respondemos.', error: 'Evolution 500' };
    const conError = armar.armarMarkdown({ eventos: [...eventos, fallido], fecha: hoy, ultimos4: '5806' });
    assert.match(conError, /\*\*Erasmo escaló\*\* \(al cliente no le llegó nada\): pide envío/);
    assert.match(conError, /NO salió: Evolution 500/);
    // Sin el id de Evolution no se sabe si le llegó: tampoco se afirma.
    const sinId = armar.armarMarkdown({ eventos: [...eventos, { ...fallido, error: undefined, id: null }], fecha: hoy, ultimos4: '5806' });
    assert.match(sinId, /\*\*Erasmo escaló\*\* \(al cliente no le llegó nada\): pide envío/);
    // Con el id, sí.
    const conId = armar.armarMarkdown({ eventos: [...eventos, { ...fallido, error: undefined, id: 'EV1' }], fecha: hoy, ultimos4: '5806' });
    assert.match(conId, /\*\*Erasmo escaló\*\* \(al cliente solo le llegó "Enseguida te respondemos\."\): pide envío/);
  });
  await check('lo que el cliente escribió y no entró a una tanda va aparte, con el motivo', async () => {
    const otro = '5490000008001';
    await bot.procesar(mensaje(otro, 'hola, tienen laja?')); // un chat que no es el tester: nadie contesta
    const clave = aprendizaje.clave(jid(otro));
    const eventos = armar.eventosDelDia(aprendizaje.leerTodo(), (e) => e.clave === clave, hoy);
    const t = armar.armarMarkdown({ eventos, fecha: hoy, ultimos4: '8001' });
    assert.match(t, /## Sin contestar/);
    assert.match(t, /hola, tienen laja\? → cerebro-apagado/);
    assert.match(t, /Ese día no hubo ninguna tanda/);
  });
  await check('un día sin eventos: el .md lo dice y no rompe; la ficha vacía también', async () => {
    const t = armar.armarMarkdown({ eventos: [], fecha: '2026-01-01', ultimos4: '5806' });
    assert.match(t, /Ese día no hubo ninguna tanda/);
    assert.match(t, /sin ficha/);
  });
  await check('el número tipeado de cualquier forma da el mismo JID; uno corto no sirve', async () => {
    for (const n of ['5492994295806', '549 299 4295806', '+54 9 299 429-5806']) assert.strictEqual(armar.jidDe(n), '5492994295806@s.whatsapp.net');
    assert.strictEqual(armar.jidDe('123'), null);
    assert.strictEqual(armar.jidDe(undefined), null);
  });
  await check('la charla de otro día no entra', async () => {
    const clave = aprendizaje.clave(jid(TESTER));
    assert.deepStrictEqual(armar.eventosDelDia(aprendizaje.leerTodo(), (e) => e.clave === clave, '2020-01-01'), []);
  });
  await check('el script no escribe ni toca nada fuera del .md (usa solo fs de lectura salvo la carpeta de salida)', async () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'herramientas', 'pruebas', 'armar.js'), 'utf8');
    assert.ok(!/require\(['"]\.\.\/\.\.\/src\/(state|evolution|cerebro|index)['"]\)/.test(src), 'carga módulos con efectos');
    assert.ok(!/fetch\(/.test(src));
    assert.strictEqual((src.match(/writeFileSync/g) || []).length, 1);
  });
  fin();
})();
