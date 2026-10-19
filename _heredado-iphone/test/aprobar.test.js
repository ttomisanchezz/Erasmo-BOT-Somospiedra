'use strict';
/**
 * Ejemplos aprobados (bloque 7, decisiones de Tomás del 23/09/2026).
 *
 *   node test/aprobar.test.js
 *
 * `npm run aprobar` muestra las respuestas reales de Tomi y Fran, de a una, y la persona
 * decide cuáles valen. Una `buena` se vuelve un caso que `npm run evaluar` corre: si el
 * bot no la cumple queda pendiente (no rompe `evaluar`), y `--fijar` marca las que ya
 * cumple, que desde ahí sí rompen si vuelven a fallar. El bot no cambia solo.
 *
 * Se prueba:
 *   1. los candidatos del registro viejo (v1);
 *   2. los del registro de eventos (v2), con su contexto;
 *   3. la limpieza: datos personales, lo que no se puede aprobar y los montos de la persona;
 *   4. la consola, con stdin simulado (en otro proceso); 4b: cada decisión se guarda en el
 *      momento;
 *   5. `--contar`;
 *   6. `comoCaso`: un ejemplo aprobado como caso de `evaluar`;
 *   7. `evaluar --offline --solo-aprobados` con tres ejemplos inventados; 7b: el contexto
 *      de un ejemplo se reproduce antes del turno final;
 *   8. `--fijar`, sin tocar data/ ni test/ejemplos-aprobados.json;
 *   9. `--revisar <id>`;
 *  10. sin `--fijar`, aprobar no carga el bot.
 *
 * Sin red, teléfonos inventados, estado y aprendizaje temporales. Ningún test escribe en
 * data/ ni en test/ejemplos-aprobados.json: todo va a archivos temporales.
 */
const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const REPO = path.join(__dirname, '..');
const DATA = path.join(REPO, 'data');
const APROBADOS_REALES = path.join(__dirname, 'ejemplos-aprobados.json');
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'aprobar-test-'));

process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
// Sin los contactos personales del .env real: los tests que los usan los pasan a mano.
process.env.CONTACTOS_PERSONALES = '';

globalThis.fetch = () => {
  throw new Error('salió a la red durante la prueba');
};

const aprobar = require('./aprobar');

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

const sha = (t) => crypto.createHash('sha256').update(t).digest('hex').slice(0, 12);
const sinColor = (t) => String(t || '').replace(/\x1b\[[0-9;]*m/g, '');
const hoyAR = () =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const ts = (s) => new Date(Date.UTC(2026, 8, 20, 15, 0, s)).toISOString();
const escribir = (archivo, filas) => fs.writeFileSync(archivo, filas.map((f) => JSON.stringify(f)).join('\n') + '\n');
const leerJson = (archivo) => JSON.parse(fs.readFileSync(archivo, 'utf8'));

/** Un script de test/ en otro proceso, sin heredar ESTADO_PATH ni APRENDIZAJE_PATH. */
function correr(script, args, { input = '', extra = {}, nodeArgs = [] } = {}) {
  const env = { ...process.env, ...extra };
  delete env.ESTADO_PATH;
  delete env.APRENDIZAJE_PATH;
  Object.assign(env, extra);
  const r = spawnSync(process.execPath, [...nodeArgs, path.join(__dirname, script), ...args], {
    cwd: REPO,
    env,
    input,
    encoding: 'utf8',
    timeout: 180000, // en una PC lenta cargar el bot tarda
  });
  return { ...r, salida: sinColor(r.stdout) };
}

(async () => {
  console.log('\nCandidatos\n');

  await check('1. v1: un candidato por par chat + cliente, sin vacíos, ordenados por distancia y con id estable', () => {
    const filas = [
      { ts: ts(1), chat: '...0001', cliente: 'tenes el 13?', bot: 'Sii, lo tenemos en $495.000', humano: 'si! lo tenemos', motivo: '', lectura: { intencion: 'consulta_stock' } },
      // Mismo par (con espacios de más): la misma respuesta de la persona, partida en dos.
      { ts: ts(2), chat: '...0001', cliente: ' tenes el 13? ', bot: 'otra cosa', humano: 'queres fotos?', motivo: '', lectura: { intencion: 'saludo' } },
      { ts: ts(3), chat: '...0002', cliente: '', bot: '', humano: 'hola', motivo: '' },
      { ts: ts(4), chat: '...0003', cliente: 'hola', bot: 'Buenass', humano: '  ', motivo: '' },
      { ts: ts(5), chat: '...0004', cliente: 'aceptan dolares?', bot: '', humano: 'si, tomamos dolares', motivo: '' },
      { ts: ts(6), chat: '...0005', cliente: 'tenes el 14 pro?', bot: 'Sii, tenemos el 14 Pro', humano: 'si, tenemos el 14 pro en stock', motivo: '' },
    ];
    const c = aprobar.candidatosV1(filas);
    // Cambió el 24/09/2026 (pedido de Tomás): primero los de venta con propuesta del bot,
    // después los de venta sin propuesta, y el resto al final; dentro de cada grupo, por
    // distancia. Antes iba solo por distancia y los sin propuesta (casi todos chats
    // personales) salían primero.
    assert.deepStrictEqual(c.map((x) => x.chat), ['...0001', '...0005', '...0004'], 'el orden no es por prioridad y distancia, o entró un vacío');
    assert.ok(c[0].dif >= c[1].dif, 'dentro del grupo no está ordenado de mayor a menor distancia');
    const par = c.find((x) => x.chat === '...0001');
    assert.strictEqual(par.humano, 'si! lo tenemos\nqueres fotos?', 'las respuestas del mismo par no se juntaron');
    assert.deepStrictEqual(par.cliente, ['tenes el 13?']);
    assert.deepStrictEqual(par.bot, ['Sii, lo tenemos en $495.000'], 'no guardó el bot de la primera fila del par');
    assert.deepStrictEqual(par.lectura, { intencion: 'consulta_stock' }, 'no guardó la lectura de la primera fila del par');
    assert.deepStrictEqual(par.contexto, [], 'el v1 va sin contexto');
    assert.strictEqual(par.fuente, 'v1');
    assert.strictEqual(par.id, 'v1-' + sha('...0001\ntenes el 13?'));
    assert.strictEqual(c.find((x) => x.chat === '...0004').dif, 1, 'sin propuesta del bot la distancia es 1');
    assert.deepStrictEqual(aprobar.candidatosV1(filas).map((x) => x.id), c.map((x) => x.id), 'los id cambian de una llamada a otra');
  });

  // Registro v2 inventado: un chat con 12 rondas antes (36 items de contexto), un ejemplo
  // completo y uno incompleto; y otro chat con los mismos 4 dígitos y otra clave.
  const [K1, K2] = ['aaaaaaaaaaaa', 'bbbbbbbbbbbb'];
  const v2 = [];
  const E = (clave, tipo, s, datos) => ({ v: 2, ts: ts(s), chat: '...1234', clave, tipo, commit: 'abc1234', ...datos });
  const cli = (id, texto) => ({ id, texto, audio: false, humanoAtendiendo: false });
  const prop = (tanda, lineas, modo, mensajes = ['lo que habia dicho'], lectura = null) => ({ tanda, lineas, mensajes, escalar: false, motivo: '', lectura, contexto: null, modo });
  for (let r = 0; r < 12; r++) {
    v2.push(E(K1, 'cliente', r * 3 + 1, cli('c' + r, 'linea ' + r)));
    v2.push(E(K1, 'propuesta', r * 3 + 2, prop('T' + r, ['c' + r], r % 2 ? 'vivo' : 'escucha')));
    v2.push(E(K1, 'humano', r * 3 + 3, { id: 'h' + r, texto: 'respuesta ' + r, responde: 'T' + r, incompleto: null }));
  }
  // Una propuesta sin líneas conocidas no entra al contexto.
  v2.push(E(K1, 'propuesta', 37, prop('TX', ['no-esta'], 'vivo')));
  // El otro chat, en el medio: no se mezcla con el primero.
  v2.push(E(K2, 'cliente', 38, cli('o1', 'hola, aceptan dolares?')));
  v2.push(E(K2, 'propuesta', 39, prop('TO', ['o1'], 'escucha', [])));
  v2.push(E(K2, 'humano', 40, { id: 'ho', texto: 'si, tomamos dolares', responde: 'TO', incompleto: null }));
  v2.push(E(K1, 'cliente', 41, cli('cf', 'el 13, tengo $300.000')));
  v2.push(E(K1, 'propuesta', 42, prop('TF', ['cf'], 'escucha', ['Mira, para el 13 la entrega inicial es de $320.000'], { intencion: 'declara_entrega' })));
  v2.push(E(K1, 'humano', 43, { id: 'hf', texto: 'dale, te queda en 2 cuotas de 150 mil', responde: 'TF', incompleto: null }));
  v2.push(E(K1, 'cliente', 44, cli('cg', 'y el 14?')));
  v2.push(E(K1, 'humano', 45, { id: 'hg', texto: 'el 14 tambien lo tenemos', responde: null, incompleto: 'bot interpretando' }));
  v2.push(E(K1, 'propuesta', 46, prop('TG', ['cg'], 'escucha')));

  await check('2. v2: completos e incompletos, con el contexto de antes (cliente, humano y tanda), tope de 30 y sin mezclar claves', () => {
    const c = aprobar.candidatosV2(v2);
    const completo = c.find((x) => x.cliente[0] === 'el 13, tengo $300.000');
    const incompleto = c.find((x) => x.cliente[0] === 'y el 14?');
    const otro = c.find((x) => x.clave === K2);
    assert.ok(completo && incompleto && otro, 'falta un candidato: ' + c.map((x) => x.cliente.join(' ')).join(' | '));
    assert.strictEqual(completo.fuente, 'v2');
    assert.strictEqual(completo.humano, 'dale, te queda en 2 cuotas de 150 mil');
    assert.deepStrictEqual(completo.bot, ['Mira, para el 13 la entrega inicial es de $320.000']);
    assert.deepStrictEqual([completo.modo, completo.commit, completo.lectura], ['escucha', 'abc1234', { intencion: 'declara_entrega' }]);
    assert.strictEqual(completo.incompleto, null);
    assert.strictEqual(completo.id, 'v2-' + sha(K1 + '\n' + ts(43) + '\nel 13, tengo $300.000'));
    // 12 rondas de 3 items = 36: quedan los últimos 30 (de la ronda 2 en adelante).
    assert.strictEqual(completo.contexto.length, 30, 'el contexto no tiene tope de 30');
    assert.deepStrictEqual(completo.contexto.slice(0, 6), [
      { cliente: 'linea 2' },
      { tanda: ['linea 2'], enviado: false },
      { humano: 'respuesta 2' },
      { cliente: 'linea 3' },
      { tanda: ['linea 3'], enviado: true },
      { humano: 'respuesta 3' },
    ]);
    assert.deepStrictEqual(completo.contexto.slice(-1), [{ humano: 'respuesta 11' }], 'el contexto trae algo de otro chat o una propuesta sin líneas');
    assert.ok(!JSON.stringify(completo.contexto).includes('dolares'), 'el contexto mezcla el otro chat');
    assert.strictEqual(incompleto.incompleto, 'bot interpretando');
    assert.deepStrictEqual(incompleto.bot, []);
    assert.strictEqual(incompleto.dif, 1);
    assert.deepStrictEqual(incompleto.contexto.slice(-3), [{ cliente: 'el 13, tengo $300.000' }, { tanda: ['el 13, tengo $300.000'], enviado: false }, { humano: 'dale, te queda en 2 cuotas de 150 mil' }]);
    assert.deepStrictEqual(otro.contexto, [], 'el chat con los mismos 4 dígitos trae contexto del otro');
    assert.strictEqual(otro.humano, 'si, tomamos dolares');
    for (let i = 1; i < c.length; i++) assert.ok(c[i - 1].dif >= c[i].dif, 'no está ordenado por distancia');
  });

  console.log('\nLimpieza\n');

  await check('3. limpiar: montos de la persona, teléfono y mail, lo que no se puede aprobar, y los montos del cliente quedan', () => {
    const persona = (t) => aprobar.limpiar(t, { persona: true });
    const casos = [
      ['lo tenes en $495.000 de contado', 'lo tenes en $[monto] de contado'],
      ['con 320 mil te lo llevas', 'con [monto] te lo llevas'],
      ['2 cuotas de 150', '2 cuotas de [monto]'],
      ['el 13 de 128 con 90% de bateria', 'el 13 de 128 con 90% de bateria'],
      ['te espero a las 16', 'te espero a las 16'],
      ['el 15 del 2023', 'el 15 del 2023'],
      // Las demás formas de la parte C del pedido.
      ['$ 320000 o $1.250.000', '$[monto] o $[monto]'],
      ['1,250,000 y 495.000', '[monto] y [monto]'],
      ['320k, 5 lucas o 1 palo', '[monto], [monto] o [monto]'],
      ['un palo o medio palo', '[monto] o [monto]'],
      ['te hago 4500 y el año 2024', 'te hago [monto] y el año 2024'],
      ['el de 256gb, 100% y 150 hs de uso, 512 y 300', 'el de 256gb, 100% y 150 hs de uso, 512 y [monto]'],
    ];
    for (const [antes, despues] of casos) {
      const r = persona(antes);
      assert.strictEqual(r.texto, despues, `"${antes}"`);
      assert.strictEqual(r.bloquea, false, `"${antes}" quedó bloqueado`);
    }
    const datos = persona('mi cel es 299 412-3456, mail juan.perez@gmail.com');
    assert.strictEqual(datos.texto, 'mi cel es [telefono], mail [mail]');
    assert.strictEqual(datos.bloquea, false);
    for (const t of ['mi dni es 30.123.456', 'dni 30123456', 'seguinos en @somosiphone.nqn']) {
      assert.strictEqual(aprobar.limpiar(t).bloquea, true, `"${t}" se podría aprobar`);
      assert.strictEqual(persona(t).bloquea, true, `"${t}" se podría aprobar (texto de la persona)`);
    }
    // El cliente queda como lo escribió: el bot necesita su entrega para llegar al mismo estado.
    assert.deepStrictEqual(aprobar.limpiar('tengo $495.000, o sea 320 mil'), { texto: 'tengo $495.000, o sea 320 mil', bloquea: false });
    const [completo] = aprobar.candidatosV2(v2).filter((x) => x.cliente[0] === 'y el 14?').map(aprobar.limpio);
    assert.deepStrictEqual(completo.contexto.slice(-3), [
      { cliente: 'el 13, tengo $300.000' },
      { tanda: ['el 13, tengo $300.000'], enviado: false },
      { humano: 'dale, te queda en 2 cuotas de [monto]' },
    ]);
    const conDni = aprobar.limpio({ ...completo, cliente: ['mi dni es 30.123.456'] });
    assert.strictEqual(conDni.bloqueado, true, 'un candidato con un DNI se podría aprobar');
    assert.strictEqual(completo.bloqueado, false);
  });

  console.log('\nLa consola\n');

  // v1 con cinco pares (sin propuesta: distancia 1, van por hora) y uno con un DNI; v2 con uno.
  const v1Consola = path.join(TMP, 'v1.jsonl');
  escribir(v1Consola, [
    { ts: ts(1), chat: '...0001', cliente: 'tenes el 13?', bot: '', humano: 'si! lo tenemos en $495.000 de contado', motivo: '', lectura: { intencion: 'consulta_stock' } },
    { ts: ts(2), chat: '...0002', cliente: 'aceptan dolares?', bot: '', humano: 'si, tomamos dolares', motivo: '' },
    { ts: ts(3), chat: '...0003', cliente: 'hola', bot: '', humano: 'buenas! que buscabas?', motivo: '' },
    { ts: ts(4), chat: '...0004', cliente: 'me pasas el precio del 14?', bot: '', humano: 'dale, te lo paso', motivo: '' },
    { ts: ts(5), chat: '...0005', cliente: 'mi dni es 30.123.456', bot: '', humano: 'dale gracias', motivo: '' },
  ]);
  const v2Consola = path.join(TMP, 'v2.jsonl');
  escribir(v2Consola, [
    E(K1, 'cliente', 1, cli('x1', 'hola, tenes el 15?')),
    E(K1, 'propuesta', 2, prop('TX1', ['x1'], 'escucha', ['Sii, tenemos el 15'])),
    E(K1, 'humano', 3, { id: 'hx', texto: 'si! el 15 lo tenemos', responde: 'TX1', incompleto: null }),
  ]);
  const aprobadosConsola = path.join(TMP, 'aprobados-consola.json');
  fs.writeFileSync(aprobadosConsola, '[]\n');
  const fuentes = ['--archivo', v2Consola, '--archivo-v1', v1Consola, '--aprobados', aprobadosConsola];
  const idV1 = (chat, cliente) => 'v1-' + sha(chat + '\n' + cliente);

  await check('4. la consola con stdin simulado: buena, excepción, descartes, saltear, el DNI y el fin del stdin', () => {
    const r = correr('aprobar.js', fuentes, {
      // Orden: v2; 0001, 0002, 0004 y 0005 (tienen palabras de venta); 0003 ("hola") al final.
      input: ['n', 'b', 'c', 's', 'precio', 'contado', '', 'e', 'toman dolares solo en efectivo', 'd', 'b', 'f', 's'].join('\n') + '\n',
    });
    assert.strictEqual(r.status, 0, 'terminó con error: ' + (r.stderr || r.salida).slice(-600));
    // Primero el v2, después el v1.
    assert.ok(r.salida.indexOf('hola, tenes el 15?') < r.salida.indexOf('tenes el 13?'), 'el v2 no salió primero');
    assert.ok(/\[1 de 6 · decididos 0\] v2 · \.\.\.1234/.test(r.salida), 'el encabezado no es el pedido: ' + r.salida.slice(0, 300));
    assert.ok(r.salida.includes('escucha, commit abc1234'), 'el v2 no muestra el modo y el commit');
    assert.ok(r.salida.includes('$[monto] de contado'), 'la consola no muestra el texto ya limpio');
    // El del DNI: avisa, "b" se vuelve a preguntar y se descarta con "f".
    assert.strictEqual((r.salida.match(/¿Cómo está\?/g) || []).length, 7, 'con el DNI la "b" no se volvió a preguntar');
    assert.ok(/no se puede aprobar/i.test(r.salida), 'no avisó que el del DNI no se puede aprobar');
    assert.ok(r.salida.includes('Decididos hoy: 5 (buenas 1, excepciones 1, descartados 3). Quedan por revisar: 1.'), 'el resumen al salir no es el pedido: ' + r.salida.slice(-300));

    const texto = fs.readFileSync(aprobadosConsola, 'utf8');
    const lista = JSON.parse(texto);
    assert.strictEqual(texto, JSON.stringify(lista, null, 2) + '\n', 'el JSON no va con sangría de 2 espacios');
    assert.deepStrictEqual(lista.map((e) => e.etiqueta), ['no-usar', 'buena', 'excepcion', 'dato-desactualizado', 'falto-contexto'], 'no quedó en el orden en que se decidió');
    const [nousar, buena, excepcion, dato, falta] = lista;
    const fecha = hoyAR();
    assert.deepStrictEqual(Object.keys(buena), ['id', 'version', 'fecha', 'fuente', 'etiqueta', 'situacion', 'intencionLeida', 'commitBot', 'respuesta', 'accion', 'conPrecio', 'debeDecir', 'limites', 'nota', 'estado']);
    assert.deepStrictEqual(buena, {
      id: idV1('...0001', 'tenes el 13?'),
      version: 1,
      fecha,
      fuente: 'v1',
      etiqueta: 'buena',
      situacion: { cliente: ['tenes el 13?'], contexto: [] },
      intencionLeida: 'consulta_stock',
      commitBot: null,
      respuesta: 'si! lo tenemos en $[monto] de contado',
      accion: 'contesta',
      conPrecio: true,
      debeDecir: ['precio'],
      limites: ['contado'],
      nota: '',
      estado: 'pendiente',
    });
    assert.deepStrictEqual(Object.keys(excepcion), ['id', 'version', 'fecha', 'fuente', 'etiqueta', 'situacion', 'intencionLeida', 'commitBot', 'respuesta', 'nota']);
    assert.strictEqual(excepcion.nota, 'toman dolares solo en efectivo');
    assert.strictEqual(excepcion.respuesta, 'si, tomamos dolares');
    for (const [e, etiqueta] of [[nousar, 'no-usar'], [dato, 'dato-desactualizado'], [falta, 'falto-contexto']]) {
      assert.deepStrictEqual(Object.keys(e), ['id', 'version', 'fecha', 'fuente', 'etiqueta'], etiqueta + ' guarda de más');
      assert.strictEqual(e.etiqueta, etiqueta);
    }
    assert.strictEqual(nousar.fuente, 'v2');
    assert.ok(nousar.id.startsWith('v2-'));
    assert.strictEqual(falta.id, idV1('...0005', 'mi dni es 30.123.456'));
    for (const t of ['hola, tenes el 15?', 'hola', '30.123.456', 'buenas! que buscabas?']) {
      assert.ok(!JSON.stringify([nousar, dato, falta]).includes(t), 'un descartado guarda texto del cliente: ' + t);
    }

    // Lo saltado vuelve a salir; lo decidido, no.
    const r2 = correr('aprobar.js', fuentes, { input: 'q\n' });
    assert.strictEqual(r2.status, 0, (r2.stderr || '').slice(-400));
    assert.ok(r2.salida.includes('buenas! que buscabas?'), 'el saltado no volvió a salir');
    for (const t of ['tenes el 13?', 'aceptan dolares?', 'hola, tenes el 15?', '30.123.456', 'me pasas el precio del 14?']) {
      assert.ok(!r2.salida.includes(t), 'volvió a salir uno ya decidido: ' + t);
    }
    assert.ok(r2.salida.includes('Decididos hoy: 0 (buenas 0, excepciones 0, descartados 0). Quedan por revisar: 1.'), r2.salida.slice(-300));
    assert.strictEqual(leerJson(aprobadosConsola).length, 5, 'q cambió lo guardado');

    // "q" después de decidir uno: lo decidido queda guardado.
    const otro = path.join(TMP, 'aprobados-q.json');
    fs.writeFileSync(otro, '[]\n');
    const r3 = correr('aprobar.js', ['--archivo', v2Consola, '--archivo-v1', v1Consola, '--aprobados', otro], { input: 'n\nq\n' });
    assert.strictEqual(r3.status, 0);
    assert.deepStrictEqual(leerJson(otro).map((e) => e.etiqueta), ['no-usar'], 'con q no quedó guardado lo decidido');

    // Un JSON que no se puede leer: avisa, sale con 1 y no lo pisa.
    const roto = path.join(TMP, 'aprobados-roto.json');
    fs.writeFileSync(roto, '[{"id": ');
    const r4 = correr('aprobar.js', ['--archivo', v2Consola, '--archivo-v1', v1Consola, '--aprobados', roto], { input: 'n\n' });
    assert.strictEqual(r4.status, 1, 'con el JSON roto no salió con 1');
    assert.strictEqual(fs.readFileSync(roto, 'utf8'), '[{"id": ', 'pisó el JSON que no pudo leer');
  });

  await check('4b. (agregado) cada decisión se guarda en el momento, con la consola todavía esperando', async () => {
    const archivo = path.join(TMP, 'aprobados-momento.json');
    fs.writeFileSync(archivo, '[]\n');
    const env = { ...process.env };
    delete env.ESTADO_PATH;
    delete env.APRENDIZAJE_PATH;
    const hijo = spawn(process.execPath, [path.join(__dirname, 'aprobar.js'), '--archivo', v2Consola, '--archivo-v1', v1Consola, '--aprobados', archivo], {
      cwd: REPO,
      env,
      stdio: ['pipe', 'ignore', 'ignore'],
    });
    const termino = new Promise((r) => hijo.on('exit', r));
    hijo.stdin.write('n\n');
    let guardados = 0;
    for (const hasta = Date.now() + 30000; Date.now() < hasta && !guardados; ) {
      await new Promise((r) => setTimeout(r, 100));
      try {
        guardados = leerJson(archivo).length;
      } catch {
        // justo se estaba escribiendo
      }
    }
    hijo.stdin.end('q\n');
    await termino;
    assert.strictEqual(guardados, 1, 'la decisión no quedó guardada mientras la consola seguía preguntando');
  });

  await check('5. --contar: candidatos por fuente, decididos y los que quedan', () => {
    const r = correr('aprobar.js', [...fuentes, '--contar']);
    assert.strictEqual(r.status, 0, (r.stderr || '').slice(-400));
    assert.ok(/Candidatos: v2 1 · v1 5/.test(r.salida), r.salida);
    assert.ok(/Decididos: 5 \(buenas 1, excepciones 1, descartados 3\)/.test(r.salida), r.salida);
    assert.ok(/Quedan por revisar: 1\b/.test(r.salida), r.salida);
    assert.ok(!r.salida.includes('¿Cómo está?'), '--contar preguntó algo');
    const soloV2 = correr('aprobar.js', [...fuentes, '--contar', '--fuente', 'v2']);
    assert.ok(/Candidatos: v2 1\b/.test(soloV2.salida) && !/v1 5/.test(soloV2.salida), soloV2.salida);
    assert.ok(/Quedan por revisar: 0\b/.test(soloV2.salida), soloV2.salida);
    // Cargar aprendizaje.js no crea la sal (se crea con el primer evento del bot).
    const dir = fs.mkdtempSync(path.join(TMP, 'sal-'));
    correr('aprobar.js', [...fuentes, '--contar'], { extra: { APRENDIZAJE_PATH: path.join(dir, 'aprendizaje.jsonl') } });
    assert.deepStrictEqual(fs.readdirSync(dir), [], 'aprobar creó algo al lado del registro');
  });

  console.log('\nEvaluar los aprobados\n');

  await check('6. comoCaso: el contexto y el turno final según la acción', () => {
    const base = {
      id: 'v2-abcdefabcdef',
      version: 1,
      fecha: '2026-09-23',
      fuente: 'v2',
      etiqueta: 'buena',
      situacion: {
        cliente: ['el 13', 'tengo 300 mil'],
        contexto: [{ cliente: 'hola' }, { tanda: ['hola'], enviado: true }, { humano: 'buenas! que buscabas?' }],
      },
      intencionLeida: 'declara_entrega',
      commitBot: 'abc1234',
      respuesta: 'dale, te paso como queda',
      accion: 'contesta',
      conPrecio: true,
      limites: ['contado', 'te lo dejo'],
      nota: '',
      estado: 'pendiente',
    };
    const antes = [{ cliente: 'hola' }, { tanda: ['hola'], enviado: true }, { humano: 'buenas! que buscabas?' }];
    assert.deepStrictEqual(aprobar.comoCaso(base), {
      nombre: 'aprobado v2-abcdefabcdef',
      turnos: [...antes, { c: 'el 13\ntengo 300 mil', noContiene: ['contado', 'te lo dejo'], conPrecio: true }],
    });
    assert.deepStrictEqual(aprobar.comoCaso({ ...base, accion: 'escala-callado', conPrecio: null, limites: [] }).turnos.pop(), { c: 'el 13\ntengo 300 mil', noContiene: [], silencio: true });
    assert.deepStrictEqual(aprobar.comoCaso({ ...base, accion: 'nada', conPrecio: null, limites: [] }).turnos.pop(), { c: 'el 13\ntengo 300 mil', noContiene: [], mudo: true });
  });

  const buena = (id, cliente, conPrecio, estado) => ({
    id,
    version: 1,
    fecha: '2026-09-20',
    fuente: 'v1',
    etiqueta: 'buena',
    situacion: { cliente, contexto: [] },
    intencionLeida: null,
    commitBot: null,
    respuesta: 'respuesta inventada',
    accion: 'contesta',
    conPrecio,
    limites: [],
    nota: '',
    estado,
    ...(estado === 'fijado' ? { fijado: '2026-09-20' } : {}),
  });
  const [CUMPLE, NO_CUMPLE, FIJADO] = ['v1-000000000001', 'v1-000000000002', 'v1-000000000003'];
  const tres = [
    buena(CUMPLE, ['Hola buenas'], false, 'pendiente'),
    buena(NO_CUMPLE, ['Hola buenas'], true, 'pendiente'),
    buena(FIJADO, ['Tienen disponibles iPhone 13?'], false, 'fijado'),
    // Lo que no es "buena" no se corre.
    { id: 'v1-000000000004', version: 1, fecha: '2026-09-20', fuente: 'v1', etiqueta: 'no-usar' },
  ];
  const aprobadosEval = path.join(TMP, 'aprobados-evaluar.json');
  fs.writeFileSync(aprobadosEval, JSON.stringify(tres, null, 2) + '\n');
  const evaluar = (archivo) => correr('evaluar.js', ['--offline', '--solo-aprobados', '--aprobados', archivo]);
  const bloque = (salida, desde) => {
    const i = salida.indexOf(desde);
    return i === -1 ? '' : salida.slice(i);
  };

  await check('7. evaluar --offline --solo-aprobados: cuenta aparte, los pendientes no rompen y un fijado que falla sí', () => {
    const r = evaluar(aprobadosEval);
    assert.ok(r.salida.includes('Ejemplos aprobados: 1 de 3 cumplen · 1 pendientes · fijados que fallan: 1'), 'la línea de aprobados no es la pedida: ' + r.salida.slice(-900));
    assert.strictEqual(r.status, 1, 'un fijado que falla no rompió evaluar');
    assert.ok(!/turnos correctos/.test(r.salida), '--solo-aprobados corrió casos.js');
    const pendientes = r.salida.slice(r.salida.indexOf('Ejemplos aprobados:'), r.salida.indexOf('Fijados que fallan'));
    assert.ok(pendientes.includes(NO_CUMPLE) && !pendientes.includes(FIJADO), 'el pendiente que falla no está en su lista');
    const fijados = bloque(r.salida, 'Fijados que fallan');
    assert.ok(fijados.includes(FIJADO) && !fijados.includes(NO_CUMPLE), 'el fijado que falla no está en su lista');
    assert.ok(/Ya cumplen y no están fijados: v1-000000000001 \(npm run aprobar -- --fijar\)/.test(r.salida), 'el que cumple no aparece');

    const sinFijado = path.join(TMP, 'aprobados-sin-fijado.json');
    fs.writeFileSync(sinFijado, JSON.stringify([tres[0], tres[1]], null, 2) + '\n');
    const r2 = evaluar(sinFijado);
    assert.strictEqual(r2.status, 0, 'un pendiente que falla rompió evaluar: ' + r2.salida.slice(-600));
    assert.ok(r2.salida.includes('Ejemplos aprobados: 1 de 2 cumplen · 1 pendientes · fijados que fallan: 0'), r2.salida.slice(-600));
    assert.ok(r2.salida.includes('Ya cumplen y no están fijados: v1-000000000001 (npm run aprobar -- --fijar)'), r2.salida.slice(-600));

    const vacio = path.join(TMP, 'aprobados-vacio.json');
    fs.writeFileSync(vacio, '[]\n');
    const r3 = evaluar(vacio);
    assert.strictEqual(r3.status, 0);
    assert.ok(r3.salida.includes('Ejemplos aprobados: todavía no hay (npm run aprobar)'), r3.salida.slice(-300));

    // Agregado: un archivo de aprobados que no se puede leer no pasa en silencio.
    const roto = path.join(TMP, 'aprobados-roto-evaluar.json');
    fs.writeFileSync(roto, '[{');
    const r4 = evaluar(roto);
    assert.strictEqual(r4.status, 1, 'con el archivo de aprobados roto evaluar salió con 0');
    assert.ok(r4.salida.includes('Ejemplos aprobados: no pude leer'), r4.salida.slice(-300));
  });

  await check('7b. (agregado) el contexto de un ejemplo se reproduce antes del turno final', () => {
    // "y en cuotas como es?" da la entrega del 13 solo si el bot ya interpretó "tenes el
    // iphone 13?" en ese chat: sin el contexto, no da ningún precio.
    const conContexto = (id, contexto) => ({
      ...buena(id, ['y en cuotas como es?'], true, 'pendiente'),
      fuente: 'v2',
      situacion: { cliente: ['y en cuotas como es?'], contexto },
    });
    const archivo = path.join(TMP, 'aprobados-contexto.json');
    fs.writeFileSync(
      archivo,
      JSON.stringify([
        conContexto('v2-00000000000a', [{ cliente: 'tenes el iphone 13?' }, { tanda: ['tenes el iphone 13?'], enviado: true }, { humano: 'si, lo tenemos' }]),
        conContexto('v2-00000000000b', []),
      ])
    );
    const r = evaluar(archivo);
    assert.strictEqual(r.status, 0, r.salida.slice(-600));
    assert.ok(r.salida.includes('Ejemplos aprobados: 1 de 2 cumplen · 1 pendientes · fijados que fallan: 0'), r.salida.slice(-600));
    assert.ok(r.salida.includes('Ya cumplen y no están fijados: v2-00000000000a (npm run aprobar'), 'el ejemplo con contexto no cumple: ' + r.salida.slice(-600));
  });

  // Hash y listado de data/ y de test/ejemplos-aprobados.json, para ver que --fijar no los toca.
  function foto() {
    const out = {};
    const recorrer = (dir) => {
      let items = [];
      try {
        items = fs.readdirSync(dir, { withFileTypes: true });
      } catch {
        return;
      }
      for (const it of items) {
        const p = path.join(dir, it.name);
        if (it.isDirectory()) recorrer(p);
        else out[path.relative(REPO, p)] = crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
      }
    };
    recorrer(DATA);
    out['test/ejemplos-aprobados.json'] = fs.existsSync(APROBADOS_REALES) ? crypto.createHash('sha256').update(fs.readFileSync(APROBADOS_REALES)).digest('hex') : 'no existe';
    return out;
  }
  // Frena (y anota) cualquier lectura o escritura en data/ y cualquier escritura en
  // test/ejemplos-aprobados.json: --fijar no tiene nada que hacer ahí.
  const gancho = `
    import fs from 'node:fs';
    import path from 'node:path';
    const DATA = path.resolve(${JSON.stringify(DATA)}).toLowerCase();
    const REAL = path.resolve(${JSON.stringify(APROBADOS_REALES)}).toLowerCase();
    const r = (p) => { try { return path.resolve(String(p)).toLowerCase(); } catch { return ''; } };
    const enData = (p) => r(p) === DATA || r(p).startsWith(DATA + path.sep);
    const frenar = (escribe, ...rutas) => {
      for (const p of rutas) {
        if (enData(p) || (escribe && r(p).startsWith(REAL))) {
          process.stderr.write('TOCO_LO_REAL ' + p + String.fromCharCode(10));
          throw new Error('quiso tocar ' + p);
        }
      }
    };
    for (const f of ['writeFileSync', 'appendFileSync', 'unlinkSync', 'rmSync', 'mkdirSync', 'writeFile', 'appendFile', 'unlink', 'createWriteStream']) {
      const o = fs[f];
      fs[f] = function (p, ...a) { frenar(true, p); return o.call(this, p, ...a); };
    }
    for (const f of ['renameSync', 'copyFileSync', 'rename', 'copyFile']) {
      const o = fs[f];
      fs[f] = function (a, b, ...x) { frenar(true, a, b); return o.call(this, a, b, ...x); };
    }
    for (const f of ['readFileSync', 'readFile', 'createReadStream']) {
      const o = fs[f];
      fs[f] = function (p, ...a) { frenar(false, p); return o.call(this, p, ...a); };
    }
    const abrir = fs.openSync;
    fs.openSync = function (p, fl, ...a) { frenar(/[wa+]/.test(String(fl ?? 'r')), p); return abrir.call(this, p, fl, ...a); };
  `;
  const conGancho = ['--import', 'data:text/javascript;base64,' + Buffer.from(gancho).toString('base64')];

  await check('7c. (agregado en Cowork) conPrecio cuenta la lista de precios sin "$" ("Ip 15 128gb 85% 740.000")', () => {
    // "tenes el 15 y el 16?" contesta con la lista (740.000 y 1.050.000, sin "$"). Con
    // /\$\s?\d/ solo, "con precio" fallaba y "sin precio" pasaba.
    const archivo = path.join(TMP, 'aprobados-lista.json');
    fs.writeFileSync(
      archivo,
      JSON.stringify([
        buena('v1-00000000000c', ['tenes el 15 y el 16?'], true, 'pendiente'),
        buena('v1-00000000000d', ['tenes el 15 y el 16?'], false, 'pendiente'),
      ])
    );
    const r = evaluar(archivo);
    assert.strictEqual(r.status, 0, r.salida.slice(-600));
    assert.ok(r.salida.includes('Ejemplos aprobados: 1 de 2 cumplen · 1 pendientes · fijados que fallan: 0'), r.salida.slice(-600));
    assert.ok(r.salida.includes('Ya cumplen y no están fijados: v1-00000000000c'), 'con precio no cumple: ' + r.salida.slice(-600));
    assert.ok(/v1-00000000000d .*dio un precio y no tenía que dar ninguno/.test(r.salida), 'sin precio no falla: ' + r.salida.slice(-600));
  });

  await check('8. --fijar: el pendiente que cumple pasa a fijado, el otro sigue pendiente, el fijado sigue, sin tocar lo real', () => {
    const antes = foto();
    const r = correr('aprobar.js', ['--fijar', '--aprobados', aprobadosEval], { nodeArgs: conGancho });
    assert.ok(!/TOCO_LO_REAL/.test(r.stderr), 'quiso tocar data/ o test/ejemplos-aprobados.json: ' + r.stderr.slice(-400));
    assert.strictEqual(r.status, 0, 'terminó con error: ' + (r.stderr || r.salida).slice(-600));
    const [a, b, c, d] = leerJson(aprobadosEval);
    assert.deepStrictEqual([a.estado, a.fijado, a.version], ['fijado', hoyAR(), 1], 'el pendiente que cumple no pasó a fijado');
    assert.deepStrictEqual(Object.keys(a).slice(-2), ['estado', 'fijado']);
    assert.deepStrictEqual([b.estado, 'fijado' in b], ['pendiente', false], 'el que no cumple dejó de estar pendiente');
    assert.deepStrictEqual([c.estado, c.fijado, c.version], ['fijado', '2026-09-20', 1], 'el fijado que falla cambió');
    assert.deepStrictEqual(d, tres[3]);
    assert.ok(r.salida.includes(CUMPLE), 'no dijo cuál fijó');
    assert.deepStrictEqual(foto(), antes, 'cambió data/ o test/ejemplos-aprobados.json');
  });

  await check('9. --revisar <id>: vuelve a preguntar y reemplaza con version + 1, la fecha y pendiente', () => {
    // Uno que está en las fuentes (la buena de la consola).
    const id = idV1('...0001', 'tenes el 13?');
    const r = correr('aprobar.js', [...fuentes, '--revisar', id], { input: ['b', 'c', 'n', 'turno', 'dolares, cuotas', 'revisado'].join('\n') + '\n' });
    assert.strictEqual(r.status, 0, (r.stderr || r.salida).slice(-400));
    assert.ok(r.salida.includes('tenes el 13?'), 'no mostró el candidato');
    const lista = leerJson(aprobadosConsola);
    assert.strictEqual(lista.length, 5, 'agregó una entrada en vez de reemplazarla');
    assert.strictEqual(lista[1].id, id, 'la entrada cambió de lugar');
    assert.deepStrictEqual(
      { version: lista[1].version, fecha: lista[1].fecha, estado: lista[1].estado, conPrecio: lista[1].conPrecio, debeDecir: lista[1].debeDecir, limites: lista[1].limites, nota: lista[1].nota },
      { version: 2, fecha: hoyAR(), estado: 'pendiente', conPrecio: false, debeDecir: ['turno'], limites: ['dolares', 'cuotas'], nota: 'revisado' }
    );
    // Uno que ya no está en las fuentes: se muestra desde el JSON. Un fijado vuelve a pendiente.
    const r2 = correr('aprobar.js', ['--archivo', v2Consola, '--archivo-v1', v1Consola, '--aprobados', aprobadosEval, '--revisar', FIJADO], {
      input: ['b', 'c', 's', '', '', ''].join('\n') + '\n',
    });
    assert.strictEqual(r2.status, 0, (r2.stderr || r2.salida).slice(-400));
    assert.ok(r2.salida.includes('Tienen disponibles iPhone 13?'), 'no lo mostró desde el JSON');
    const c = leerJson(aprobadosEval)[2];
    assert.deepStrictEqual([c.version, c.fecha, c.estado, c.conPrecio, 'fijado' in c], [2, hoyAR(), 'pendiente', true, false]);
    // Un id que no existe.
    const r3 = correr('aprobar.js', [...fuentes, '--revisar', 'v1-ffffffffffff'], { input: 'b\n' });
    assert.strictEqual(r3.status, 1, 'con un id que no existe no salió con 1');
    assert.ok(/no existe|no está/i.test(r3.salida), r3.salida);
  });

  console.log('\nLo del 24/09/2026 (pedido de Tomás, desde Cowork)\n');

  await check('11. v1 con contexto: los mensajes anteriores del mismo chat, sin mezclar chats, con tope de 30', () => {
    const filas = [
      { ts: ts(1), chat: '...0010', cliente: 'tenes el 13 al 100%?', bot: 'Sii', humano: 'si, lo tenemos', motivo: '' },
      { ts: ts(2), chat: '...0010', cliente: 'tenes el 13 al 100%?', bot: 'Sii', humano: 'al 100%?', motivo: '' },
      { ts: ts(3), chat: '...0020', cliente: 'otro chat', bot: '', humano: 'no va', motivo: '' },
      { ts: ts(4), chat: '...0010', cliente: '', bot: '', humano: 'te paso fotos', motivo: '' },
      { ts: ts(5), chat: '...0010', cliente: 'dale\nel de 100', bot: 'Joya', humano: 'perfecto', motivo: '' },
      { ts: ts(6), chat: '...0010', cliente: 'Me pasarías la ubicación', bot: 'Estamos en Belgrano 3090', humano: 'Si obvio!', motivo: '' },
    ];
    const c = aprobar.candidatosV1(filas);
    const primero = c.find((x) => x.cliente[0] === 'tenes el 13 al 100%?');
    const ubicacion = c.find((x) => x.cliente[0] === 'Me pasarías la ubicación');
    assert.deepStrictEqual(primero.contexto, [], 'el primero del chat no tiene nada antes');
    assert.deepStrictEqual(ubicacion.contexto, [
      { cliente: 'tenes el 13 al 100%?' },
      { tanda: ['tenes el 13 al 100%?'], enviado: false },
      { humano: 'si, lo tenemos' },
      { humano: 'al 100%?' },
      { humano: 'te paso fotos' },
      { cliente: 'dale' },
      { cliente: 'el de 100' },
      { tanda: ['dale', 'el de 100'], enviado: false },
      { humano: 'perfecto' },
    ], 'el contexto no es lo anterior del mismo chat, en orden');
    // El id no cambia por tener contexto.
    assert.strictEqual(ubicacion.id, 'v1-' + sha('...0010\nMe pasarías la ubicación'));
    // Tope de 30 items.
    const largo = [];
    for (let i = 0; i < 20; i++) largo.push({ ts: ts(i), chat: '...0030', cliente: 'linea ' + i, bot: '', humano: 'resp ' + i, motivo: '' });
    const ultimo = aprobar.candidatosV1(largo).find((x) => x.cliente[0] === 'linea 19');
    assert.strictEqual(ultimo.contexto.length, 30, 'no respeta el tope de 30');
    assert.deepStrictEqual(ultimo.contexto[ultimo.contexto.length - 1], { humano: 'resp 18' });
  });

  await check('12. los chats de CONTACTOS_PERSONALES (por los últimos 4 dígitos) no salen, y --contar dice cuántos se saltearon', () => {
    const filas = [
      { ts: ts(1), chat: '...0001', cliente: 'tenes el 13?', bot: '', humano: 'si', motivo: '' },
      { ts: ts(2), chat: '...6419', cliente: 'dormiste bien?', bot: '', humano: 'sii', motivo: '' },
      { ts: ts(3), chat: '...6419', cliente: 'y hoy?', bot: '', humano: 'tranqui', motivo: '' },
    ];
    assert.deepStrictEqual(aprobar.candidatosV1(filas, { personales: ['5492990006419'] }).map((x) => x.chat), ['...0001']);
    assert.strictEqual(aprobar.candidatosV1(filas, { personales: [] }).length, 3, 'sin la lista se sacó algo');
    const v1 = path.join(TMP, 'v1-personales.jsonl');
    escribir(v1, filas);
    const vacio = path.join(TMP, 'aprobados-personales.json');
    fs.writeFileSync(vacio, '[]\n');
    const r = correr('aprobar.js', ['--archivo', path.join(TMP, 'no-existe.jsonl'), '--archivo-v1', v1, '--aprobados', vacio, '--contar'], {
      extra: { CONTACTOS_PERSONALES: '5492990006419,5492995550777' },
    });
    assert.strictEqual(r.status, 0, (r.stderr || r.salida).slice(-400));
    assert.ok(/Candidatos: v2 0 · v1 1\b/.test(r.salida), r.salida);
    assert.ok(/Personales salteados: 2\b/.test(r.salida), 'no dijo cuántos personales salteó: ' + r.salida);
  });

  await check('13. orden: venta con propuesta, venta sin propuesta y el resto; dentro de cada uno, por distancia', () => {
    const filas = [
      { ts: ts(1), chat: '...0101', cliente: 'jaja dale', bot: '', humano: 'sii', motivo: '' },
      { ts: ts(2), chat: '...0102', cliente: 'cuanto sale el 14?', bot: '', humano: 'te paso el precio', motivo: '' },
      { ts: ts(3), chat: '...0103', cliente: 'estas?', bot: 'Hola! como andas?', humano: 'si, decime', motivo: '' },
      { ts: ts(4), chat: '...0104', cliente: 'hacen cuotas?', bot: 'Sii, financiamos hasta en 2 cuotas', humano: 'si, en 1 o 2 cuotas con entrega', motivo: '' },
      { ts: ts(5), chat: '...0105', cliente: 'tenes el 13?', bot: 'Buenass', humano: 'si, al 100%', motivo: '' },
    ];
    const c = aprobar.candidatosV1(filas);
    assert.deepStrictEqual(c.map((x) => x.chat), ['...0105', '...0104', '...0102', '...0101', '...0103'], c.map((x) => x.chat + ' ' + x.dif.toFixed(2)).join(' | '));
    assert.ok(aprobar.pareceVenta('tenes el 13?') && aprobar.pareceVenta('Aceptan dólares?') && !aprobar.pareceVenta('jaja dale'));
  });

  await check('14. "¿Qué tiene que decir sí o sí?": se guarda como debeDecir y evaluar lo pide (contiene)', () => {
    const base = buena('v1-00000000000e', ['Un dia de estos seguro me pegue una vuelta'], false, 'pendiente');
    const turno = aprobar.comoCaso({ ...base, debeDecir: ['turno'], limites: ['contado', 'cuotas'] }).turnos.pop();
    assert.deepStrictEqual(turno, { c: 'Un dia de estos seguro me pegue una vuelta', contiene: ['turno'], noContiene: ['contado', 'cuotas'], conPrecio: false });
    assert.ok(!('contiene' in aprobar.comoCaso(base).turnos.pop()), 'sin debeDecir no tiene que pedir nada');
    const archivo = path.join(TMP, 'aprobados-debe.json');
    fs.writeFileSync(archivo, JSON.stringify([{ ...buena('v1-00000000000f', ['Hola buenas'], false, 'pendiente'), debeDecir: ['zzz-no-lo-dice'] }]));
    const r = evaluar(archivo);
    assert.ok(/v1-00000000000f .*falta "zzz-no-lo-dice"/.test(r.salida), 'evaluar no pidió lo que tiene que decir: ' + r.salida.slice(-500));
  });

  await check('15. limpiar: una lista de precios no se lee como teléfono ni como DNI (línea por línea, sin espacios como separador)', () => {
    const persona = (t) => aprobar.limpiar(t, { persona: true });
    const lista = persona('11 pro 100% sin face id 360.000\n11 128gb 80% sin face id 290.000');
    assert.strictEqual(lista.texto, '11 pro 100% sin face id [monto]\n11 128gb 80% sin face id [monto]');
    assert.strictEqual(lista.bloquea, false);
    const seguidos = persona('ip 14 pro 820.000 11 pro 360.000');
    assert.strictEqual(seguidos.texto, 'ip 14 pro [monto] 11 pro [monto]');
    assert.strictEqual(persona('el 14 al 100% 820.000 11 de 128 a 360.000').bloquea, false, 'dos precios seguidos quedaron bloqueados');
    assert.strictEqual(persona('mi dni es 30.123.456').bloquea, true);
  });

  await check('10. sin --fijar, las funciones de aprobar no cargan state.js, responder.js ni index.js', () => {
    aprobar.candidatos({ archivo: v2Consola, archivoV1: v1Consola });
    aprobar.candidatosV2(v2).map(aprobar.limpio);
    aprobar.comoCaso(buena(CUMPLE, ['Hola buenas'], false, 'pendiente'));
    const cargados = Object.keys(require.cache).map((p) => path.relative(REPO, p).split(path.sep).join('/'));
    for (const m of ['src/state.js', 'src/responder.js', 'src/index.js']) {
      assert.ok(!cargados.includes(m), 'aprobar cargó ' + m);
    }
    assert.ok(!fs.existsSync(process.env.ESTADO_PATH), 'aprobar escribió el estado');
  });

  console.log(fallos === 0 ? '\nTodo OK\n' : '\n' + fallos + ' fallo(s)\n');
  fs.rmSync(TMP, { recursive: true, force: true });
  process.exit(fallos ? 1 : 0);
})();
