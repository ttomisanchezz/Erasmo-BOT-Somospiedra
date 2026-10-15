'use strict';
/**
 * La batería del cerebro Sonnet (`npm run bateria-cerebro`, test/bateria-cerebro.js), de punta a
 * punta con un `fetch` de mentira: 14 casos de test/bateria-cerebro-casos.js, con un Sonnet de
 * mentira que contesta como contestaría bien (y uno que escribe un monto sin puntos, para ver el ✗);
 * dos son acuses que no se le preguntan (bloque Ninjo 1), dos son del bloque Ninjo 1b (un modelo que
 * no hay, con el aviso al grupo; una cotización de una persona que trae Evolution, con el bloque) y
 * tres son de la entrega baja, paso 3 (06/10/2026: la excepción a la tercera vez, lo que sí se lleva
 * con esa entrega, y el descuento sin repreguntar la entrega). Y aparte el 111 (07/10/2026: la foto de antes
 * en el historial y el canje que anotó Sonnet, sin repreguntar la batería ni la capacidad), y el 112 y el 113
 * (08/10/2026: el modelo que pidió no está y ya dijo con cuánto cuenta: el parecido cotizado con esa entrega, o su
 * entrega inicial si no llega).
 * Nunca sale a la red. La corrida de verdad, con la clave, la hace Tomás aparte.
 *
 *   node test/bateria-cerebro.test.js
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bateria-cerebro-test-'));
process.env.GEMINI_API_KEY = 'de-mentira-para-la-prueba';
process.env.MODO_BORRADOR = 'false';
process.env.MODO_ESCUCHA = 'false';
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.GRUPO_AVISOS_JID = '';
process.env.ESTADO_PATH = path.join(TMP, 'estado.json');
process.env.APRENDIZAJE_PATH = path.join(TMP, 'aprendizaje.jsonl');
process.env.CEREBRO_MODO = 'apagado';
process.env.ANTHROPIC_API_KEY = 'clave-de-mentira';
process.env.CEREBRO_MODELO = 'claude-sonnet-5-5';
process.env.CEREBRO_TIMEOUT_MS = '150';
process.env.DOCS_DIR = path.join(TMP, 'documentos');
fs.mkdirSync(process.env.DOCS_DIR);
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'compromiso-de-pago.pdf'), '%PDF de mentira');
process.on('exit', () => fs.rmSync(TMP, { recursive: true, force: true }));

// ---------------------------------------------------------------------------
// Un Sonnet de mentira: cada paso es el `content` de una respuesta, o una función del pedido.
// ---------------------------------------------------------------------------
const pedidos = [];
let pasos = [];
let id = 0;
const USO = { input_tokens: 1000, output_tokens: 100, cache_read_input_tokens: 2000, cache_creation_input_tokens: 500 };
const USD_POR_LLAMADA = (1000 * 2 + 100 * 10 + 2000 * 0.2 + 500 * 2.5) / 1e6;
const usar = (name, input) => [{ type: 'tool_use', id: 'toolu_' + ++id, name, input }];
// Bloque Ninjo 1b: responder ya no lleva compromiso_de_pago (el PDF lo decide el código, con el primer bloque).
const responde = (mensajes) => usar('responder', { mensajes });
/** El JSON del último tool_result del pedido. */
const resultado = (body) => JSON.parse(body.messages[body.messages.length - 1].content.find((b) => b.type === 'tool_result').content);
globalThis.fetch = async (url, opciones = {}) => {
  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('salió a la red durante la prueba: ' + url);
  const body = JSON.parse(opciones.body);
  pedidos.push(body);
  const paso = pasos.shift();
  if (paso === undefined) throw new Error('el Sonnet de mentira no tiene un paso para el pedido ' + pedidos.length);
  const content = typeof paso === 'function' ? paso(body) : paso;
  const cuerpo = { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content, stop_reason: 'tool_use', usage: { ...USO } };
  return { ok: true, status: 200, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) };
};

const bateria = require('./bateria-cerebro');
const cotizador = require('../src/cotizador');
const fixture = require('./fixture-planilla');
const pesos = cotizador.pesos;

/** Lo que contesta el Sonnet de mentira en cada caso, turno por turno (en orden de llamadas). */
let precio1d = null;
const GUIONES = {
  '1a.': [
    usar('buscar_equipos', { modelo: '13' }),
    (body) => {
      const e = resultado(body).equipos[0];
      return responde([`sii, tenemos el iphone 13 de ${e.capacidad_gb}gb al ${e.bateria}`, `lo tenemos en ${pesos(e.precio_contado)} de contado`]);
    },
  ],
  // A propósito mal: el monto sin puntos lo frena la guardia (escala) y el caso falla.
  // Lo repite igual en la vuelta de corrección (02/10/2026): escala.
  '1d.': [
    usar('buscar_equipos', { modelo: '17 pro max' }),
    (body) => {
      precio1d = resultado(body).equipos[0].precio_contado;
      return responde([`el 17 pro max sellado esta $${precio1d}`]);
    },
    () => responde([`el 17 pro max sellado esta $${precio1d}`]),
  ],
  '3a.': [
    usar('buscar_equipos', { modelo: '16' }),
    (body) => responde(resultado(body).equipos.map((e) => `el ${e.modelo.toLowerCase()} de ${e.capacidad_gb}gb ${e.bateria}: ${pesos(e.precio_contado)}`)),
  ],
  '6.': [
    responde(['lo financiamos nosotros, solo con tu dni y un compromiso de pago', 'es en 1 pago o en 2 cuotas con una entrega inicial', 'que modelo te interesa y con cuanto contas para la entrega?']),
    responde(['dale, con cuanto contas para la entrega inicial?']),
    usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: '340 mil' }),
    responde(['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?']),
    responde(['las cuotas arrancan el mes que viene']),
  ],
  '8a.': [usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'tengo 340 mil' }), responde(['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]'])],
  // Bloque Ninjo 1b: el 18 que no está → el parecido que devuelve buscar_equipos, con el aviso al grupo.
  '24.': [
    usar('buscar_equipos', { modelo: '18' }),
    (body) => {
      const p = resultado(body).parecidos[0];
      return usar('responder', {
        mensajes: [`justo ese no me esta quedando, tengo el ${p.modelo.replace('iPhone ', '')} ${p.bateria} en ${pesos(p.precio_contado)}`],
        aviso_grupo: 'pidió el 18 y no está en la planilla',
      });
    },
  ],
  // Bloque Ninjo 1b: la cotización que pasó una persona hace 3 días está en Evolution; se vuelve a cotizar.
  '80.': [
    usar('cotizar', { modelo: '13', entrega: 350000, entrega_texto: 'el 13 cuanto me queda con 350 de entrega?' }),
    responde(['dale, con $350.000 de entrega te quedaba asi', '[cotizacion]']),
  ],
  '17.': [usar('escalar', { motivo: 'sigue el turno que acordó una persona: "te espero mañana 16:30 en Belgrano 3090"' })],
  // Entrega baja, paso 3 (06/10/2026): dos veces la entrega inicial y a la tercera lo que resuelve `cotizar`.
  '105.': [
    usar('cotizar', { modelo: '13', entrega: 300000, entrega_texto: 'quiero el 13, tengo 300 mil' }),
    (body) => {
      const r = resultado(body);
      return responde([`mira, con los ${pesos(r.entrega)} al 13 todavia no llegamos, para retirarlo lo estamos pidiendo con ${pesos(r.entrega_minima)} de entrega inicial. lo que queda lo haces en 1 o 2 cuotas`]);
    },
    usar('cotizar', { modelo: '13', entrega: 300000, entrega_texto: 'no, 300 es lo que junto' }),
    (body) => {
      const r = resultado(body);
      return responde([`te cuento como es, para el 13 pedimos por lo menos ${pesos(r.entrega_minima)} de entrega inicial, es lo que nos deja financiarte el resto en 1 o 2 cuotas`]);
    },
    usar('cotizar', { modelo: '13', entrega: 300000, entrega_texto: 'y no me lo podes hacer con los 300?' }),
    (body) => {
      const r = resultado(body);
      if (!r.excepcion) return usar('escalar', { motivo: `cotizar no dio la excepción: ${JSON.stringify(r)}` });
      return responde([`dale, con los ${pesos(r.entrega)} te quedas cerca para el 13, asi que te hago una excepcion y te lo armo con esa entrega, mira como te queda`, '[cotizacion]', 'cual te cierra mas?']);
    },
  ],
  '106.': [
    usar('cotizar', { modelo: '13', entrega: 220000, entrega_texto: 'el 13 con 220 mil de entrega?' }),
    (body) => {
      const r = resultado(body);
      return responde([`mira, con los ${pesos(r.entrega)} al 13 todavia no llegamos, para retirarlo lo estamos pidiendo con ${pesos(r.entrega_minima)} de entrega inicial. lo que queda lo haces en 1 o 2 cuotas`]);
    },
    usar('cotizar', { modelo: '13', entrega: 220000, entrega_texto: 'mas de 220 no tengo' }),
    (body) => {
      const r = resultado(body);
      return responde([`te cuento como es, para el 13 pedimos por lo menos ${pesos(r.entrega_minima)} de entrega inicial, es lo que nos deja financiarte el resto en 1 o 2 cuotas`]);
    },
    usar('cotizar', { modelo: '13', entrega: 220000, entrega_texto: 'no llego a mas, hacemelo con los 220 igual' }),
    (body) => {
      const r = resultado(body);
      const e = (r.con_esa_entrega || [])[0];
      if (!e) return usar('escalar', { motivo: `cotizar no dio con_esa_entrega: ${JSON.stringify(r)}` });
      return responde([`con ${pesos(r.entrega)} para el 13 todavia no llegamos, pero con esa entrega te podes llevar el ${e.modelo.replace('iPhone ', '')} de ${e.capacidad_gb}gb que lo retiras con ${pesos(e.entrega_minima)}`, 'te interesa?']);
    },
  ],
  // El descuento de la prueba en vivo del 06/10 (paso 10): ya dio la entrega y eligió, no se le repregunta.
  '107.': [
    usar('cotizar', { modelo: '13', entrega: 340000, entrega_texto: 'quiero el 13, tengo 340 mil' }),
    responde(['dale, con $340.000 de entrega llegamos al 13', '[cotizacion]', 'cual te cierra mas?']),
    responde(['dale joya, que dia te podes acercar?']),
    responde(['los precios son fijos', 'que dia te queda bien para pasar?']),
  ],
  // Sonnet ve las fotos (07/10/2026): "16 comun" con la captura de la batería → la capacidad, no la batería.
  '108.': [responde(['dale, ahi vi la bateria', 'de cuantos gb es?'])],
  // Ninjo bloque 1: un "dale" justo después de la línea de la entrega inicial no se le pregunta a Sonnet.
  '68.': [],
  // Y "ok" se contesta, pero la tanda de acuses que le sigue ("👍" + "joya", juntos) no se le pregunta.
  '69.': [
    usar('buscar_equipos', { modelo: '13' }),
    (body) => {
      const e = resultado(body).equipos[0];
      return responde([`sii, tenemos el iphone 13 de ${e.capacidad_gb}gb al ${e.bateria}`, `lo tenemos en ${pesos(e.precio_contado)} de contado`]);
    },
    responde(['cuando quieras lo seguimos']),
  ],
};

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e));
  }
}

(async () => {
  console.log('\nLa batería del cerebro, con un fetch de mentira\n');

  const casos = Object.keys(GUIONES).map((prefijo) => {
    const caso = bateria.CASOS.find((c) => c.nombre.startsWith(prefijo));
    assert.ok(caso, `no está el caso ${prefijo}`);
    return caso;
  });
  const resultados = [];
  for (const [i, caso] of casos.entries()) {
    pasos = [...GUIONES[Object.keys(GUIONES)[i]]];
    resultados.push(await bateria.correrCaso(caso, fixture, i));
    assert.strictEqual(pasos.length, 0, `al caso ${caso.nombre} le sobraron pasos del guion`);
  }
  const por = (prefijo) => resultados.find((r) => r.nombre.startsWith(prefijo));
  const chequeo = (r, k, nombre) => r.turnos[k].chequeos.find((x) => x.nombre.startsWith(nombre));

  await check('los casos que contestan bien pasan todos sus chequeos (stock, condición, cuotas en 4 turnos, cotización, escalado, el paso 3 de la entrega baja y el descuento)', async () => {
    for (const p of ['1a.', '3a.', '6.', '8a.', '17.', '24.', '68.', '69.', '80.', '105.', '106.', '107.']) {
      const r = por(p);
      const malos = r.turnos.flatMap((t, k) => t.chequeos.filter((x) => !x.ok).map((x) => `turno ${k + 1}: ${x.nombre} (${x.detalle})`));
      assert.ok(r.ok, `${r.nombre}: ${malos.join('; ')}`);
    }
  });

  await check('los montos de `espera` salen de la planilla y el cotizador, y se chequean', async () => {
    const fila = fixture.lista.find((f) => f.modelo === 'iPhone 13');
    const cot = cotizador.cotizar(fila, 340000, fixture.config);
    const m = chequeo(por('8a.'), 0, 'monto: 13 con $340.000');
    assert.ok(m && m.ok && m.detalle === `${pesos(cot.pagoUnico)} y ${pesos(cot.cuotaDe2)}`, JSON.stringify(m));
    assert.ok(chequeo(por('1a.'), 0, 'monto: contado del 13').detalle === pesos(495000));
    const sellado = chequeo(por('3a.'), 0, 'monto: contado del 16 (usado)');
    assert.ok(sellado && sellado.ok, 'el caso con el 16 sellado agregado no encontró el usado');
  });

  await check('las fotos de un turno (108, 07/10): van al pedido como un bloque image (el png de test/fixtures en base64) con cache_control, el pedido dice que mandó una foto y el informe también; si repregunta la batería, falla', async () => {
    const r = por('108.');
    const malos = r.turnos.flatMap((t) => t.chequeos.filter((x) => !x.ok).map((x) => `${x.nombre} (${x.detalle})`));
    assert.ok(r.ok, malos.join('; '));
    const conImagen = pedidos.filter((b) => b.messages[0].content.some((x) => x.type === 'image'));
    assert.strictEqual(conImagen.length, 1, 'pedidos con imágenes: ' + conImagen.length);
    const [texto, imagen, ...resto] = conImagen[0].messages[0].content;
    assert.deepStrictEqual(resto, []);
    assert.ok(texto.type === 'text' && texto.cache_control && /16 comun/.test(texto.text) && /mandó una foto/.test(texto.text), 'el texto del pedido');
    const png = fs.readFileSync(path.join(__dirname, 'fixtures', 'captura-bateria-90.png')).toString('base64');
    assert.deepStrictEqual(imagen, { type: 'image', source: { type: 'base64', media_type: 'image/png', data: png }, cache_control: { type: 'ephemeral' } });
    assert.ok(bateria.armarInforme([r]).includes('Con la foto: captura-bateria-90.png'), 'el informe no dice la foto');
    // Un Sonnet que repregunta la batería: el caso falla por eso. Esa llamada no cuenta para el informe de abajo.
    const llamadas = pedidos.length;
    pasos = [responde(['de cuantos gb es?', 'y que bateria tiene?'])];
    const mal = await bateria.correrCaso(bateria.CASOS.find((c) => c.nombre.startsWith('108.')), fixture, 99);
    pedidos.length = llamadas;
    assert.strictEqual(mal.ok, false, 'repreguntar la batería pasó');
    assert.ok(mal.turnos[0].chequeos.some((x) => !x.ok && /bateria/.test(x.nombre)), JSON.stringify(mal.turnos[0].chequeos.filter((x) => !x.ok)));
  });

  await check('la foto de antes y el canje anotado (111, 07/10): el pedido lleva "Cliente: [foto]" y "canje que anotaste antes", sin imágenes; si repregunta la capacidad o la batería, falla', async () => {
    // Aparte de los guiones de arriba (el informe de más abajo cuenta esos): estas llamadas no quedan en `pedidos`.
    const caso = bateria.CASOS.find((c) => c.nombre.startsWith('111.'));
    assert.ok(caso, 'no está el caso 111');
    const llamadas = pedidos.length;
    try {
      pasos = [responde(['dale, le cambiaron algo o tiene algun detalle?'])];
      const r = await bateria.correrCaso(caso, fixture, 97);
      const malos = r.turnos.flatMap((t) => t.chequeos.filter((x) => !x.ok).map((x) => `${x.nombre} (${x.detalle})`));
      assert.ok(r.ok, malos.join('; '));
      assert.strictEqual(pedidos.length, llamadas + 1);
      const [contenido] = pedidos[llamadas].messages.map((m) => m.content);
      const texto = contenido.map((x) => x.text || '').join('\n');
      assert.ok(/\] Cliente: \[foto\]\n\[[^\]]+\] Vos \(antes\): dale, ahi vi la bateria\n/.test(texto), 'el historial no lleva la foto:\n' + texto);
      assert.ok(/\n- canje que anotaste antes: "iPhone 16 90%"\n/.test(texto), 'no lleva el canje anotado:\n' + texto);
      assert.ok(!contenido.some((x) => x.type === 'image'), 'el pedido lleva una imagen');
      for (const repregunta of ['de cuantos gb me dijiste que era?', 'dale, y que bateria tiene?']) {
        pasos = [responde([repregunta])];
        const mal = await bateria.correrCaso(caso, fixture, 96);
        assert.strictEqual(mal.ok, false, `"${repregunta}" pasó`);
      }
    } finally {
      pedidos.length = llamadas;
    }
  });

  await check('el parecido con la entrega que ya dio (112 y 113, 08/10): el 14 Plus no está y se cotiza el 14 con esa entrega (el bloque, el PDF y el aviso), o su entrega inicial si no llega; con el contado, sin el bloque o diciendo cuánto falta, fallan', async () => {
    // Aparte de los guiones de arriba (el informe de más abajo cuenta esos): estas llamadas no quedan en `pedidos`.
    const caso112 = bateria.CASOS.find((c) => c.nombre.startsWith('112.'));
    const caso113 = bateria.CASOS.find((c) => c.nombre.startsWith('113.'));
    assert.ok(caso112 && caso113, 'faltan los casos 112 y 113');
    const llamadas = pedidos.length;
    /** buscar_equipos("14 plus"), cotizar del primero de `parecidos` con `entrega` y lo que arme `contesta` con los dos resultados. */
    const sonnet = (frase, entrega, contesta) => {
      let p = null;
      return [
        usar('buscar_equipos', { modelo: '14 plus' }),
        (body) => {
          p = resultado(body).parecidos[0];
          return usar('cotizar', { modelo: p.modelo, capacidad: p.capacidad_gb, entrega, entrega_texto: frase });
        },
        (body) => usar('responder', { mensajes: contesta(p, resultado(body)), aviso_grupo: 'pidió el 14 plus y no está en la planilla' }),
      ];
    };
    const noEsta = (p) => `justo el 14 plus no me esta quedando, lo mas parecido que tengo es el ${p.modelo.replace('iPhone ', '')} de ${p.capacidad_gb}gb al ${p.bateria}`;
    const malos = (r) => r.turnos.flatMap((t) => t.chequeos.filter((x) => !x.ok).map((x) => `${x.nombre} (${x.detalle})`));
    try {
      // 112: el 14 de la planilla del caso (sin el 14 Plus ni las unidades sueltas del 14) cotizado con 450 mil.
      const bien112 = (p, c) => [noEsta(p), `con los ${pesos(c.entrega)} de entrega te queda asi`, '[cotizacion]', 'te sirve ese o tenias pensado otro?'];
      pasos = sonnet('el 14 plus con 450 mil?', 450000, bien112);
      const r112 = await bateria.correrCaso(caso112, fixture, 95);
      assert.ok(r112.ok, malos(r112).join('; '));
      const t112 = r112.turnos[0];
      const fila = fixture.lista.find((f) => f.modelo === 'iPhone 14');
      const cot = cotizador.cotizar(fila, 450000, fixture.config);
      assert.ok(cot.ok && !cot.soloContado && !cot.bajoMinimo, 'el caso no prueba nada: con la copia congelada, 450.000 no da las cuotas del 14');
      assert.ok(t112.c.resultado.sonnetMensajes.includes(cotizador.bloqueSonnet(fila, cot)), 'no salió el bloque del 14 de LISTA: ' + t112.c.resultado.sonnetMensajes.join(' | '));
      assert.ok(t112.c.resultado.mensajes.some((m) => m && m.tipo === 'doc'), 'el PDF no salió con el bloque');
      assert.strictEqual(t112.c.r.avisoGrupo, 'pidió el 14 plus y no está en la planilla');
      // Con el contado del 14, o sin el bloque (el parecido de contado, como antes del 08/10): falla.
      pasos = sonnet('el 14 plus con 450 mil?', 450000, (p, c) => [...bien112(p, c).slice(0, 3), `de contado esta ${pesos(c.precio_contado)}`]);
      assert.strictEqual((await bateria.correrCaso(caso112, fixture, 94)).ok, false, 'con el contado del 14 pasó');
      pasos = [usar('buscar_equipos', { modelo: '14 plus' }), (body) => {
        const p = resultado(body).parecidos[0];
        return usar('responder', { mensajes: [`justo ese no me esta quedando, tengo el ${p.modelo.replace('iPhone ', '')} en ${pesos(p.precio_contado)}`], aviso_grupo: 'pidió el 14 plus y no está en la planilla' });
      }];
      assert.strictEqual((await bateria.correrCaso(caso112, fixture, 93)).ok, false, 'el parecido de contado, sin cotizar, pasó');

      // 113: con 350 mil no llega al 14: su entrega inicial, sin bloque y sin decir cuánto falta.
      const bien113 = (p, c) => [noEsta(p), `mira, con los ${pesos(c.entrega)} al 14 todavia no llegamos, para retirarlo lo estamos pidiendo con ${pesos(c.entrega_minima)} de entrega inicial. lo que queda lo haces en 1 o 2 cuotas`];
      pasos = sonnet('el 14 plus con 350 mil?', 350000, bien113);
      const r113 = await bateria.correrCaso(caso113, fixture, 92);
      assert.ok(r113.ok, malos(r113).join('; '));
      assert.deepStrictEqual(r113.turnos[0].c.r.datos.noLlega, ['iPhone 14']);
      assert.ok(!r113.turnos[0].c.resultado.mensajes.some((m) => m && m.tipo === 'doc'), 'salió el PDF sin bloque');
      // "no te alcanza" la guardia no lo frena (sí "te falta"): lo agarra el caso.
      pasos = sonnet('el 14 plus con 350 mil?', 350000, (p, c) => [...bien113(p, c), 'con eso no te alcanza']);
      const mal113 = await bateria.correrCaso(caso113, fixture, 91);
      assert.strictEqual(mal113.ok, false, 'diciendo que no le alcanza pasó');
      assert.ok(malos(mal113).some((x) => /no te alcanza/.test(x)), malos(mal113).join('; '));
    } finally {
      pedidos.length = llamadas;
    }
  });

  await check('otro modelo con la entrega ya dicha (114 y 115, 08/10): "y el 14?" después del 13 cotizado se cotiza con esa entrega (el bloque del 14, sin el contado ni otro PDF), o su entrega inicial si no llega; con el contado de antes o diciendo que no le alcanza, fallan', async () => {
    // Aparte de los guiones de arriba (el informe de más abajo cuenta esos): estas llamadas no quedan en `pedidos`.
    const caso114 = bateria.CASOS.find((c) => c.nombre.startsWith('114.'));
    const caso115 = bateria.CASOS.find((c) => c.nombre.startsWith('115.'));
    assert.ok(caso114 && caso115, 'faltan los casos 114 y 115');
    const planilla = caso114.planilla(JSON.parse(JSON.stringify(fixture)));
    const fila = (modelo) => planilla.lista.find((f) => f.modelo === modelo);
    assert.deepStrictEqual([fila('iPhone 13').precio_contado, fila('iPhone 13').anticipo_min, fila('iPhone 14').precio_contado, fila('iPhone 14').anticipo_min], [535000, 370000, 595000, 410000]);
    assert.deepStrictEqual(planilla.usados.filter((f) => /^iPhone 1[34]$/.test(f.modelo)), [], 'quedaron unidades sueltas del 13 o del 14');
    const llamadas = pedidos.length;
    /** El 13 cotizado con `frase` (el bloque y el PDF) y "y el 14?": cotizar del 14 con la misma entrega y lo que arme `contesta`. */
    const sonnet = (frase, entrega, contesta) => [
      usar('cotizar', { modelo: '13', entrega, entrega_texto: frase }),
      (body) => responde([`dale, con ${pesos(resultado(body).entrega)} de entrega llegamos al 13`, '[cotizacion]', 'cual te cierra mas?']),
      usar('cotizar', { modelo: '14', entrega, entrega_texto: frase }),
      (body) => responde(contesta(resultado(body))),
    ];
    const malos = (r) => r.turnos.flatMap((t, k) => t.chequeos.filter((x) => !x.ok).map((x) => `turno ${k + 1}: ${x.nombre} (${x.detalle})`));
    const docs = (t) => t.c.resultado.mensajes.filter((m) => m && m.tipo === 'doc').length;
    try {
      // 114: con 450 mil llegan los dos; el 14 va en el bloque, sin el contado y sin un segundo PDF.
      const bien114 = (c) => [`el 14 de ${c.capacidad_gb}gb al ${c.bateria}, con los ${pesos(c.entrega)} de entrega te queda asi`, '[cotizacion]', 'cual te cierra mas, el 13 o el 14?'];
      pasos = sonnet('el 13 con 450 mil?', 450000, bien114);
      const r114 = await bateria.correrCaso(caso114, fixture, 90);
      assert.ok(r114.ok, malos(r114).join('; '));
      const cot14 = cotizador.cotizar(fila('iPhone 14'), 450000, planilla.config);
      assert.ok(cot14.ok && !cot14.soloContado && !cot14.bajoMinimo, 'el caso no prueba nada: 450.000 no da las cuotas del 14');
      const [t1, t2] = r114.turnos;
      assert.strictEqual(docs(t1), 1, 'el PDF no salió con el 13');
      assert.ok(t2.c.resultado.sonnetMensajes.includes(cotizador.bloqueSonnet(fila('iPhone 14'), cot14)), 'no salió el bloque del 14: ' + t2.c.resultado.sonnetMensajes.join(' | '));
      assert.strictEqual(docs(t2), 0, 'el PDF salió otra vez con el 14');
      assert.strictEqual(t2.c.r.compromisoDePago, false);
      // Como antes del 08/10 (otra consulta de stock: el contado del 14, sin cotizar): falla.
      pasos = [
        ...sonnet('el 13 con 450 mil?', 450000, bien114).slice(0, 2),
        usar('buscar_equipos', { modelo: '14' }),
        (body) => {
          const e = resultado(body).equipos[0];
          return responde([`sii, el 14 de ${e.capacidad_gb}gb al ${e.bateria} lo tenemos en ${pesos(e.precio_contado)} de contado`]);
        },
      ];
      const viejo = await bateria.correrCaso(caso114, fixture, 89);
      assert.strictEqual(viejo.ok, false, 'el 14 de contado, sin cotizar, pasó');
      assert.ok(malos(viejo).some((x) => /turno 2: monto: 14 con \$450\.000/.test(x)) && malos(viejo).some((x) => /turno 2: sin el monto: contado del 14/.test(x)), malos(viejo).join('; '));

      // 115: con 400 mil el 13 llega y el 14 no: su entrega inicial, sin bloque, sin PDF y sin decir cuánto falta.
      const bien115 = (c) => [`mira, con los ${pesos(c.entrega)} al 14 todavia no llegamos, para retirarlo lo estamos pidiendo con ${pesos(c.entrega_minima)} de entrega inicial. lo que queda lo haces en 1 o 2 cuotas`];
      pasos = sonnet('el 13 con 400 mil?', 400000, bien115);
      const r115 = await bateria.correrCaso(caso115, fixture, 88);
      assert.ok(r115.ok, malos(r115).join('; '));
      const [u1, u2] = r115.turnos;
      assert.strictEqual(docs(u1), 1, 'el PDF no salió con el 13');
      assert.deepStrictEqual(u2.c.r.datos.noLlega, ['iPhone 14']);
      assert.deepStrictEqual((u2.c.resultado.mensajes.map((m) => (m && m.marcas) || {}).find((m) => m.insistenciaEntrega) || {}).insistenciaEntrega, { 'iPhone 14': 1 }, 'la insistencia no cuenta para el 14');
      assert.strictEqual(docs(u2), 0, 'salió el PDF con la entrega inicial');
      pasos = sonnet('el 13 con 400 mil?', 400000, (c) => [...bien115(c), 'con eso no te alcanza']);
      const mal115 = await bateria.correrCaso(caso115, fixture, 87);
      assert.strictEqual(mal115.ok, false, 'diciendo que no le alcanza pasó');
      assert.ok(malos(mal115).some((x) => /turno 2: .*no te alcanza/.test(x)), malos(mal115).join('; '));
    } finally {
      pedidos.length = llamadas;
    }
  });

  await check('la lista del local y lo que cita (116 y 117, 08/10): corren con el stock en vivo (y el modo vuelve), la lista es la del local; el 13 citado al 100%, por su batería; la lista de LISTA o el 13 al 77% fallan', async () => {
    // Aparte de los guiones de arriba (el informe de más abajo cuenta esos): estas llamadas no quedan en `pedidos`.
    const config = require('../src/config');
    const caso116 = bateria.CASOS.find((c) => c.nombre.startsWith('116.'));
    const caso117 = bateria.CASOS.find((c) => c.nombre.startsWith('117.'));
    assert.ok(caso116 && caso117, 'faltan los casos 116 y 117');
    const malos = (r) => r.turnos.flatMap((t, k) => t.chequeos.filter((x) => !x.ok).map((x) => `turno ${k + 1}: ${x.nombre} (${x.detalle})`));
    const llamadas = pedidos.length;
    assert.strictEqual(config.stockApp.modo, 'apagado');
    try {
      pasos = [usar('lista_de_precios', {}), responde(['[lista]', 'contame que modelo te interesa'])];
      const r116 = await bateria.correrCaso(caso116, fixture, 86);
      assert.ok(r116.ok, malos(r116).join('; '));
      assert.ok(pedidos[llamadas].messages[0].content[0].text.includes('Stock: del local y del depósito'), 'el 116 no corrió en vivo');
      assert.strictEqual(config.stockApp.modo, 'apagado', 'el modo no volvió');
      const lista = resultado(pedidos[llamadas + 1]);
      assert.deepStrictEqual(lista.usados.split('\n'), ['Ip 11 64gb 75% 190.000', 'Ip 11 128gb 77% 210.000', 'Ip 13 128gb 77% 480.000', 'Ip 13 128gb 100% 535.000', 'Ip 14 Pro 128gb 100% 835.000']);
      // Sin el stock en vivo, la lista es la de LISTA (el 16 Pro y el 17 sellado): el caso falla.
      pasos = [usar('lista_de_precios', {}), responde(['[lista]', 'contame que modelo te interesa'])];
      const sinVivo = await bateria.correrCaso({ ...caso116, stockApp: undefined }, fixture, 85);
      assert.strictEqual(sinVivo.ok, false, 'la lista de LISTA pasó');
      pasos = [usar('buscar_equipos', { modelo: '13' }), responde(['el 13 de 128gb al 100% lo tenemos en $535.000 de contado'])];
      const r117 = await bateria.correrCaso(caso117, fixture, 84);
      assert.ok(r117.ok, malos(r117).join('; '));
      const m = r117.turnos[0].chequeos.find((x) => x.nombre === 'monto: contado del 13 (100%)');
      assert.ok(m && m.ok && m.detalle === pesos(535000), JSON.stringify(m));
      for (const mal of [
        [usar('lista_de_precios', {}), responde(['[lista]', 'contame que modelo te interesa'])],
        [usar('buscar_equipos', { modelo: '13' }), responde(['el 13 de 128gb al 77% lo tenemos en $480.000 de contado'])],
      ]) {
        pasos = mal;
        const r = await bateria.correrCaso(caso117, fixture, 83);
        assert.strictEqual(r.ok, false, 'pasó: ' + JSON.stringify(r.turnos[0].c.resultado.sonnetMensajes));
      }
    } finally {
      pedidos.length = llamadas;
    }
  });

  await check('las fotos de los equipos (118 a 120, 08/10): la foto del 15 con su pie; la frase del depósito del 16 pro con el aviso; las del 13 (la cotizada primera) y después el escalado por el 14 sin color; prometer fotos sin la herramienta o "te las mando mañana" fallan', async () => {
    const acciones = require('../src/acciones');
    const caso = (n) => bateria.CASOS.find((c) => c.nombre.startsWith(n + '.'));
    assert.ok(caso(118) && caso(119) && caso(120), 'faltan los casos 118 a 120');
    const malos = (r) => r.turnos.flatMap((t, k) => t.chequeos.filter((x) => !x.ok).map((x) => `turno ${k + 1}: ${x.nombre} (${x.detalle})`));
    const fotosDe = (t) => t.c.resultado.mensajes.filter((m) => m && m.tipo === 'foto-equipo');
    const llamadas = pedidos.length;
    try {
      // 118: la foto del 15 con el pie que arma el código, sin escalar; el stock de la app en vivo solo mientras dura el caso.
      pasos = [usar('mandar_fotos', { modelos: ['15'] }), responde(['[fotos]'])];
      const r118 = await bateria.correrCaso(caso(118), fixture, 86);
      assert.ok(r118.ok, malos(r118).join('; '));
      const t118 = r118.turnos[0];
      assert.deepStrictEqual(fotosDe(t118).map((f) => [f.codigo, f.pie, f.archivo]), [['15-128-001', '15 128gb 87% 740.000', 'iPhone 15/grafito.jpg']]);
      assert.deepStrictEqual(t118.c.resultado.sonnetMensajes, ['[foto: 15-128-001] 15 128gb 87% 740.000']);
      assert.ok((t118.c.resultado.mensajes[0].marcas || {}).saludoEn, 'el saludo del sistema no fue adelante de la foto');
      assert.strictEqual(require('../src/config').stockApp.modo, 'apagado', 'el caso dejó el stock en vivo');
      // Prometer fotos sin la herramienta: la guardia frena (promete un archivo), escala y el caso falla.
      pasos = [responde(['dale, ahora te mando fotos del 15']), responde(['dale, ahora te mando fotos del 15'])];
      const mal118 = await bateria.correrCaso(caso(118), fixture, 85);
      assert.strictEqual(mal118.ok, false, 'prometiendo fotos pasó');
      assert.ok(malos(mal118).some((x) => /escala: false/.test(x) && /guardia/.test(x)), malos(mal118).join('; '));

      // 119: el 16 pro solo en el depósito: la frase con el día (martes: "mañana") y el aviso al grupo del código.
      pasos = [usar('mandar_fotos', { modelos: ['16 pro'] }), responde(['[fotos_deposito]'])];
      const r119 = await bateria.correrCaso(caso(119), fixture, 84);
      assert.ok(r119.ok, malos(r119).join('; '));
      const t119 = r119.turnos[0];
      assert.strictEqual(t119.c.r.avisoGrupo, 'le prometí fotos del iPhone 16 Pro (depósito): mandáselas');
      assert.ok(t119.c.resultado.mensajes.some((m) => /si no te las mando mañana$/.test(acciones.comoTexto(m))), t119.c.resultado.mensajes.map(acciones.comoTexto).join(' | '));
      assert.deepStrictEqual(fotosDe(t119), []);
      // "te las mando mañana" escrito por Sonnet: la guardia frena y el caso falla.
      pasos = [usar('mandar_fotos', { modelos: ['16 pro'] }), responde(['en el local no lo tengo, te las mando mañana']), responde(['en el local no lo tengo, te las mando mañana'])];
      const mal119 = await bateria.correrCaso(caso(119), fixture, 83);
      assert.strictEqual(mal119.ok, false, 'prometiendo mandarlas mañana pasó');

      // 120: el 13 cotizado (la rosa, la más barata que se financia) y después las fotos del 13 y del 14: tres del 13, la rosa
      // primera, y el escalado por el 14 sin color, con su código.
      pasos = [
        usar('cotizar', { modelo: '13', entrega: 400000, entrega_texto: 'el 13 con 400 mil?' }),
        (body) => responde([`dale, con ${pesos(resultado(body).entrega)} de entrega llegamos al 13`, '[cotizacion]', 'cual te cierra mas?']),
        usar('mandar_fotos', { modelos: ['13', '14'] }),
        responde(['[fotos]']),
      ];
      const r120 = await bateria.correrCaso(caso(120), fixture, 82);
      assert.ok(r120.ok, malos(r120).join('; '));
      const [u1, u2] = r120.turnos;
      assert.strictEqual(u1.c.resultado.mensajes.filter((m) => m && m.tipo === 'doc').length, 1, 'el PDF no salió con el 13');
      assert.strictEqual(u1.c.r.datos.unidad, '13-128-028', 'cotizar no dejó la unidad del local');
      assert.deepStrictEqual(fotosDe(u2).map((f) => f.codigo), ['13-128-028', '13-128-013', '13-128-025']);
      assert.strictEqual(u2.c.resultado.escalar, true);
      assert.strictEqual(u2.c.resultado.motivo, 'pidió fotos del iPhone 14 y no tiene color cargado');
      assert.strictEqual(u2.c.resultado.paraElGrupo, 'Equipo: 14-128-008');
      const res = JSON.parse(pedidos[pedidos.length - 1].messages.at(-1).content.find((b) => b.type === 'tool_result').content);
      assert.deepStrictEqual(res.sin_foto, [{ modelo: 'iPhone 14', codigo: '14-128-008', motivo: 'sin color cargado' }]);
      assert.deepStrictEqual(res.fotos.map((f) => f.en_la_foto), ['el de la izquierda', 'sola', 'sola']);
      // Sin cotizar antes, por precio: los dos 77 % primero (los verdes una sola vez) y la rosa tercera.
      pasos = [usar('mandar_fotos', { modelos: ['13', '14'] }), responde(['[fotos]'])];
      const sinCotizar = await bateria.correrCaso({ ...caso(120), turnos: [caso(120).turnos[1]] }, fixture, 81);
      assert.deepStrictEqual(fotosDe(sinCotizar.turnos[0]).map((f) => f.codigo), ['13-128-013', '13-128-025', '13-128-028']);
      assert.ok(malos(sinCotizar).some((x) => /la primera foto con/.test(x)), 'sin la cotizada primera tenía que fallar ese chequeo');
    } finally {
      pedidos.length = llamadas;
    }
  });

  await check('un monto sin puntos: la guardia lo frena, el turno falla y dice por qué', async () => {
    const r = por('1d.');
    assert.strictEqual(r.ok, false);
    const t = r.turnos[0];
    assert.strictEqual(t.c.resultado.escalar, true);
    assert.ok(/^guardia: .*sin puntos/.test(t.c.resultado.motivo), t.c.resultado.motivo);
    const malos = t.chequeos.filter((x) => !x.ok).map((x) => x.nombre);
    for (const nombre of ['escala: false', 'montos con puntos']) assert.ok(malos.includes(nombre), `no falló "${nombre}": ${malos}`);
    assert.ok(chequeo(r, 0, 'ningún monto inventado').ok, 'el monto sí salió de la herramienta');
  });

  await check('el PDF del compromiso sale como en vivo (bloque Ninjo 1b): con el primer bloque (turno 3), no con la explicación (turno 1)', async () => {
    const turnos = por('6.').turnos;
    const conPdf = (k) => turnos[k].c.resultado.mensajes.some((m) => m && m.tipo === 'doc');
    assert.ok(!conPdf(0), 'salió el PDF con la explicación de la financiación');
    assert.ok(conPdf(2), 'no salió el PDF con el bloque');
    assert.ok(turnos[2].c.resultado.sonnetMensajes.some((m) => /^iPhone 13 128GB 100% 📱\nHaciendo una entrega de \$340\.000/.test(m)), 'no salió el bloque');
    assert.ok(!conPdf(3), 'salió el PDF dos veces');
  });

  await check('Evolution en un caso (80): las líneas entran por contexto.completar con su hora, como en vivo, y se cuentan en leidos.evolution', async () => {
    const t = por('80.').turnos[0];
    assert.strictEqual(t.c.r.leidos.evolution, 3, JSON.stringify(t.c.r.leidos));
    const pedido = pedidos.find((b) => /y en 2 cuotas cuanto era/.test(b.messages[0].content[0].text)).messages[0].content[0].text;
    assert.ok(/\[hace 3 días\] Persona de la cuenta: con \$350\.000 de entrega el 13 te queda en 1 pago de \$/.test(pedido), pedido.slice(0, 1200));
    assert.ok(t.chequeos.find((x) => x.nombre === 'cotización en el bloque').ok);
  });

  await check('entrega baja, paso 3 (105): las dos insistencias suman en el estado del caso y a la tercera cotizar da la excepción; el monto `excepcion: true` es el de cotizador.cotizar bajo el mínimo y el PDF sale con ese bloque', async () => {
    const r = por('105.');
    const fila = fixture.lista.find((f) => f.modelo === 'iPhone 13');
    const cot = cotizador.cotizar(fila, 300000, fixture.config);
    assert.ok(cot.ok && cot.bajoMinimo, 'el caso no prueba nada: 300.000 no es la excepción con la copia congelada');
    assert.deepStrictEqual(r.turnos.map((t) => t.c.r.datos.noLlega), [['iPhone 13'], ['iPhone 13'], []]);
    const tercero = r.turnos[2];
    assert.ok(tercero.c.resultado.sonnetMensajes.some((m) => m.includes(`· 1 cuota de ${pesos(cot.pagoUnico)}`) && m.includes(`· o 2 cuotas de ${pesos(cot.cuotaDe2)}`)), 'no salió el bloque de la excepción');
    const m = chequeo(r, 2, 'monto: 13 con $300.000 (la excepción)');
    assert.ok(m && m.ok && m.detalle === `${pesos(cot.pagoUnico)} y ${pesos(cot.cuotaDe2)}`, JSON.stringify(m));
    assert.ok(chequeo(r, 2, 'sin el monto: entrega mínima del 13').ok, 'a la tercera volvió a decir la entrega mínima');
    assert.ok(chequeo(r, 0, 'sin el monto: 13 con $300.000 (la excepción)').ok, 'la primera vez ya cotizó con la excepción');
    assert.ok(tercero.c.resultado.mensajes.some((x) => x && x.tipo === 'doc'), 'el PDF no salió con el bloque de la excepción');
    assert.ok(!r.turnos[0].c.resultado.mensajes.some((x) => x && x.tipo === 'doc'), 'el PDF salió con la entrega inicial');
    // Los montos de `espera` con la planilla del caso: sin la excepción, "no llega"; con una entrega que llega, no es la excepción.
    const [sinExcepcion, llega] = bateria.resolverMontos([{ cotiza: '13', entrega: 300000 }, { cotiza: '13', entrega: 340000, excepcion: true }], fixture);
    assert.deepStrictEqual(sinExcepcion.valores, [fila.anticipo_min]);
    assert.ok(/no es la excepción/.test(llega.error), JSON.stringify(llega));
  });

  await check('entrega baja, paso 3 (106): a la tercera cotizar da con_esa_entrega y el monto `retiraCon` es la entrega mínima del primero (el 11 de 128 con la copia congelada)', async () => {
    const r = por('106.');
    const tercero = r.turnos[2];
    assert.deepStrictEqual(r.turnos.map((t) => t.c.r.datos.noLlega), [['iPhone 13'], ['iPhone 13'], ['iPhone 13']]);
    assert.ok(/te podes llevar el 11 de 128gb que lo retiras con \$200\.000/.test(tercero.c.resultado.sonnetMensajes.join('\n')), tercero.c.resultado.sonnetMensajes.join(' | '));
    const m = chequeo(r, 2, 'monto: lo que retira con $220.000 (sin el 13)');
    assert.ok(m && m.ok && m.detalle === pesos(200000), JSON.stringify(m));
    assert.ok(!tercero.c.resultado.mensajes.some((x) => x && x.tipo === 'doc'), 'salió el PDF sin bloque');
    const [nada] = bateria.resolverMontos([{ retiraCon: 100000 }], fixture);
    assert.ok(/no se retira ning/.test(nada.error), JSON.stringify(nada));
  });

  await check('la regla global nueva: ningún mensaje dice "recargo", "67%" ni "75%" (también lo que frenó la guardia)', async () => {
    for (const t of ['te hago una excepcion con un recargo chico', 'queda al 67%', 'las 2 cuotas van al 75 %', 'es un 75 por ciento']) {
      const malo = bateria.chequear({}, contesto([t]), fixture).find((x) => x.nombre === 'sin "recargo" ni 67% / 75%');
      assert.ok(malo && !malo.ok, `no frenó "${t}": ${JSON.stringify(malo)}`);
    }
    assert.ok(bateria.chequear({}, contesto(['dale, te hago una excepcion y te lo armo con esa entrega', 'bateria 75-80%, $167.000']), fixture).find((x) => x.nombre === 'sin "recargo" ni 67% / 75%').ok);
    const frenado = { r: { frenados: ['con recargo te queda'], montosDeHerramientas: [] }, resultado: { escalar: true, motivo: 'guardia: x', mensajes: [] } };
    assert.strictEqual(bateria.chequear({}, frenado, fixture).find((x) => x.nombre === 'sin "recargo" ni 67% / 75%').ok, false);
    // La lista del local (08/10/2026, caso 116): la batería de una línea de la lista ("Ip 11 64gb 75% 190.000") no es el
    // 75% de la excepción. Se mira lo que escribió Sonnet, con [lista] sin reemplazar; si él escribe "75%", falla igual.
    const lista = ['Ip 11 64gb 75% 190.000', 'contame que modelo te interesa'];
    const conLista = { r: { mensajes: lista, escritos: ['[lista]', 'contame que modelo te interesa'], montosDeHerramientas: [190000] }, resultado: { escalar: false, mensajes: lista, sonnetMensajes: lista } };
    assert.ok(bateria.chequear({}, conLista, fixture).find((x) => x.nombre === 'sin "recargo" ni 67% / 75%').ok, 'la batería de la lista contó como el 75% de la excepción');
    const escribe75 = { ...conLista, r: { ...conLista.r, escritos: ['[lista]', 'el 11 te queda al 75%'] } };
    assert.strictEqual(bateria.chequear({}, escribe75, fixture).find((x) => x.nombre === 'sin "recargo" ni 67% / 75%').ok, false);
    assert.ok(resultados.every((r) => r.turnos.every((t) => t.chequeos.find((x) => x.nombre === 'sin "recargo" ni 67% / 75%').ok)));
  });

  await check('el descuento con la entrega ya dicha (107): "los precios son fijos" y el turno, sin la pregunta de la entrega; una repregunta falla', async () => {
    const r = por('107.');
    assert.ok(r.turnos[2].chequeos.find((x) => x.nombre.startsWith('contiene alguno de')).ok, 'el turno no pidió el día');
    const caso = bateria.CASOS.find((c) => c.nombre.startsWith('107.'));
    const repregunta = bateria.chequear(caso.turnos[2].espera, contesto(['los precios son fijos', 'si no llegas al total lo financiamos sin tarjeta, con cuanto contas para la entrega?']), fixture);
    assert.ok(repregunta.some((x) => /^no contiene/.test(x.nombre) && !x.ok), 'la repregunta de la entrega no falló');
    assert.ok(repregunta.some((x) => /^contiene alguno/.test(x.nombre) && !x.ok), 'sin el turno no falló');
  });

  await check('un modelo que no hay (24): el aviso al grupo se chequea con `aviso`', async () => {
    const t = por('24.').turnos[0];
    assert.strictEqual(t.c.r.avisoGrupo, 'pidió el 18 y no está en la planilla');
    assert.ok(t.chequeos.find((x) => x.nombre === 'aviso al grupo: true').ok);
    assert.strictEqual(bateria.chequear({ aviso: true }, contesto(['dale']), fixture).find((x) => x.nombre === 'aviso al grupo: true').ok, false);
  });

  await check('las líneas de antes entran con su hora y la persona se ve aparte (caso Emanuel)', async () => {
    const pedido17 = pedidos.find((b) => /a donde tengo que ir a retirar/.test(b.messages[0].content[0].text)).messages[0].content[0].text;
    assert.ok(/\[hace 3 h\] Persona de la cuenta: te espero mañana 16:30/.test(pedido17), pedido17.slice(0, 900));
    assert.ok(/- hace 3 h: "te espero mañana 16:30 en Belgrano 3090"/.test(pedido17));
    assert.ok(/martes 06\/10\/2026 15:00/.test(pedido17), 'la hora no es la del caso');
    assert.deepStrictEqual(por('17.').turnos[0].c.r.leidos, { historial: 5, persona: 1, evolution: 0 });
  });

  await check('el saludo lo pone el sistema la primera vez y no se repite (chequeo "sin saludo duplicado")', async () => {
    const r = por('6.');
    assert.ok((r.turnos[0].c.resultado.mensajes[0].marcas || {}).saludoEn, 'el primer turno no lleva el saludo del sistema');
    assert.ok(!r.turnos[1].c.resultado.mensajes.some((m) => m && m.marcas && m.marcas.saludoEn), 'saludó dos veces el mismo día');
    assert.ok(r.turnos.every((t) => t.chequeos.find((x) => x.nombre === 'sin saludo duplicado').ok));
    // Y si Sonnet saluda, falla.
    const malo = bateria.chequear({}, { r: { mensajes: ['hola! sii tenemos'], montosDeHerramientas: [] }, resultado: { escalar: false, mensajes: ['hola! sii tenemos'], sonnetMensajes: ['hola! sii tenemos'] } }, fixture, { saludadoAntes: true });
    assert.strictEqual(malo.find((x) => x.nombre === 'sin saludo duplicado').ok, false);
  });

  // "sin promesas" (13/10/2026): las frases fijas que pone el código no cuentan; lo que escribe Sonnet, sí.
  await check('sin promesas: las frases fijas del código (turno, sin foto, depósito de lunes a jueves y de viernes a domingo) no fallan; un "me fijo" o un "te confirmo" de Sonnet, sí', async () => {
    const cerebro = require('../src/cerebro');
    const fotosEquipos = require('../src/fotos-equipos');
    const stockApp = require('../src/stock-app');
    const sinPromesas = (mensajes) => bateria.chequear({}, contesto(mensajes), fixture).find((x) => x.nombre === 'sin promesas');
    const fijas = [
      ...cerebro.FRASES_TURNO,
      fotosEquipos.FRASE_SIN_FOTO,
      stockApp.fraseDeposito(Date.parse('2026-10-12T15:00:00-03:00')), // lunes
      stockApp.fraseDeposito(Date.parse('2026-10-16T15:00:00-03:00')), // viernes
    ];
    assert.strictEqual(new Set(fijas).size, fijas.length, 'las frases fijas del test no son todas distintas');
    for (const frase of fijas) {
      const solo = sinPromesas([frase]);
      assert.ok(solo && solo.ok, `la frase fija marcó como promesa: "${frase}" → ${JSON.stringify(solo)}`);
      const metida = sinPromesas(['dale, en 2 cuotas entonces', `te lo dejo en $200.000, ${frase}`]);
      assert.ok(metida && metida.ok, `la frase fija dentro de un mensaje marcó como promesa: "${frase}" → ${JSON.stringify(metida)}`);
    }
    // Lo que escribe Sonnet sigue marcando, también al lado de una frase fija.
    for (const m of ['dame un ratito que me fijo si tengo lugar', 'cualquier cosa te confirmo manana', 'ahi me fijo cuanto te queda', 'te confirma fran']) {
      const solo = sinPromesas([m]);
      assert.ok(solo && !solo.ok, `no marcó lo que escribió Sonnet: "${m}" → ${JSON.stringify(solo)}`);
      const junto = sinPromesas([cerebro.FRASES_TURNO[0], m]);
      assert.ok(junto && !junto.ok, `junto a la frase fija dejó pasar: "${m}" → ${JSON.stringify(junto)}`);
    }
  });

  // Ninjo bloque 1 (05/10/2026).
  function contesto(mensajes) {
    return { r: { mensajes, montosDeHerramientas: [] }, resultado: { escalar: false, mensajes, sonnetMensajes: mensajes } };
  }

  await check('las reglas globales del bloque Ninjo 1b: la cotización a mano falla siempre; a un caso de postventa no se le pregunta qué modelo busca', async () => {
    const aMano = bateria.chequear({}, contesto(['con $340.000 te queda 1 pago de $206.000']), fixture).find((x) => x.nombre === 'cotización en el bloque');
    assert.ok(aMano && !aMano.ok && /1 pago de \$2/.test(aMano.detalle), JSON.stringify(aMano));
    const conBloque = { r: { mensajes: ['BLOQUE · 1 cuota de $206.000'], escritos: ['[cotizacion]'], montosDeHerramientas: [206000] }, resultado: { escalar: false, mensajes: [], sonnetMensajes: [] } };
    assert.ok(bateria.chequear({}, conBloque, fixture).find((x) => x.nombre === 'cotización en el bloque').ok, 'el bloque no es una cotización a mano');
    const pregunta = bateria.chequear({}, contesto(['contame, que modelo estas buscando?']), fixture, { postventa: true }).find((x) => x.nombre.startsWith('postventa'));
    assert.ok(pregunta && !pregunta.ok, JSON.stringify(pregunta));
    assert.ok(!bateria.chequear({}, contesto(['que modelo buscas?']), fixture).some((x) => x.nombre.startsWith('postventa')), 'sin postventa no se mira');
  });

  await check('los montos al 100% (al100) salen de la fila de LISTA que tapó la lista activa', async () => {
    const sheets = require('../src/sheets');
    const responder = require('../src/responder');
    sheets.usarFixture(JSON.parse(JSON.stringify(fixture)));
    sheets.usarListaBateria('85-93');
    try {
      const datos = await responder.leerPlanilla();
      const [activa, al100] = bateria.resolverMontos([{ contado: '13' }, { contado: '13', al100: true }], datos);
      assert.deepStrictEqual([activa.valores, al100.valores], [[450000], [495000]]);
      assert.ok(/al 100%/.test(al100.texto));
    } finally {
      sheets.usarListaBateria(null);
      sheets.usarFixture(fixture);
    }
  });

  await check('la regla global nueva: ningún mensaje nombra algo interno (también lo que frenó la guardia)', async () => {
    const malo = bateria.chequear({}, contesto(['segun la planilla el 13 no esta']), fixture).find((x) => x.nombre === 'nada interno');
    assert.ok(malo && !malo.ok && /la planilla/.test(malo.detalle), JSON.stringify(malo));
    assert.ok(bateria.chequear({}, contesto(['sii, tenemos el 13']), fixture).find((x) => x.nombre === 'nada interno').ok);
    const frenado = { r: { frenados: ['esto lo escalo'], montosDeHerramientas: [] }, resultado: { escalar: true, motivo: 'guardia: nombra algo interno: "escalo"', mensajes: [] } };
    assert.strictEqual(bateria.chequear({}, frenado, fixture).find((x) => x.nombre === 'nada interno').ok, false);
  });

  await check('sinPreguntar: el turno pasa solo si no se le preguntó a Sonnet (un acuse), y el informe lo dice', async () => {
    const sinLlamar = { r: { sinLlamar: 'lo último fue la línea de la entrega inicial', mensajes: [], montosDeHerramientas: [] }, resultado: { escalar: false, motivo: 'acuse', mensajes: [], sonnetMensajes: [] } };
    assert.ok(bateria.chequear({ sinPreguntar: true }, sinLlamar, fixture).find((x) => x.nombre === 'no se le pregunta a Sonnet').ok);
    assert.strictEqual(bateria.chequear({ sinPreguntar: true }, contesto(['dale']), fixture).find((x) => x.nombre === 'no se le pregunta a Sonnet').ok, false);
    const t = por('68.').turnos[0];
    assert.ok(t.c.r.sinLlamar, 'el caso 68 le preguntó a Sonnet: ' + JSON.stringify(t.c.r));
    const md = bateria.armarInforme([por('68.')], { planilla: 'copia congelada', fecha: '2026-10-05' });
    assert.ok(/\*\*Sonnet\*\*: no se le preguntó \(acuse: /.test(md), md);
  });

  await check('el informe: totales, los que fallan, ✓/✗ por chequeo, herramientas, lo leído, tokens y US$', async () => {
    const md = bateria.armarInforme(resultados, { planilla: 'copia congelada', fecha: '2026-10-02' });
    const turnos = resultados.reduce((n, r) => n + r.turnos.length, 0);
    assert.strictEqual(turnos, 25);
    assert.ok(md.includes('- Casos: 14 · pasan 13 · fallan 1'), md.slice(0, 600));
    assert.ok(md.includes(`- Turnos: ${turnos} · pasan ${turnos - 1} · fallan 1`));
    assert.ok(/### Los que fallan\n\n- 1d\. .*\(turno 1: escala: false, .*montos con puntos/.test(md), md.slice(0, 1200));
    assert.ok(md.includes('## ✗ 1d.') && md.includes('## ✓ 1a.'));
    assert.ok(md.includes('- ✓ usa buscar_equipos') && md.includes('- ✗ montos con puntos — $2200000'), 'faltan los ✓/✗');
    assert.ok(md.includes('Herramientas: buscar_equipos, responder · leyó 1 mensaje de contexto'), 'falta lo leído');
    assert.ok(md.includes('[doc: compromiso de pago] te paso el compromiso de pago'), 'falta el PDF en lo que le llega');
    assert.ok(md.includes('**Sonnet**: escala: sigue el turno que acordó una persona'));
    const llamadas = pedidos.length;
    // Con tolerancia: el total es la suma de los turnos ya redondeados (15 × 0,00465 = 0,06975 cae justo en el medio).
    const total = Number((md.match(/total US\$([0-9.]+)/) || [])[1]);
    assert.ok(Math.abs(total - USD_POR_LLAMADA * llamadas) < 0.0001, `falta el gasto total: ${llamadas} llamadas, US$${total}`);
    assert.ok(md.includes('entrada 1000 · salida 100 · caché leída 2000 · caché escrita 500'), 'faltan los tokens del turno');
  });

  await check('--desde elige los casos de ese número en adelante (y se combina con --solo)', async () => {
    const desde = bateria.elegirCasos(bateria.CASOS, { desde: 22 });
    assert.ok(desde.length > 0 && desde.every((c) => parseInt(c.nombre, 10) >= 22), desde.map((c) => c.nombre.slice(0, 4)).join(' '));
    assert.ok(desde.some((c) => c.nombre.startsWith('22a.')) && !desde.some((c) => c.nombre.startsWith('21.')));
    assert.ok(bateria.elegirCasos(bateria.CASOS, { desde: 22, solo: 'canje' }).every((c) => parseInt(c.nombre, 10) >= 22));
  });

  await check('--solo y --max eligen los casos', async () => {
    assert.deepStrictEqual(bateria.elegirCasos(bateria.CASOS, { solo: 'jazz' }).map((c) => c.nombre.slice(0, 3)), ['5. ']);
    assert.strictEqual(bateria.elegirCasos(bateria.CASOS, { max: 3 }).length, 3);
    assert.strictEqual(bateria.elegirCasos(bateria.CASOS, { solo: 'canje', max: 1 }).length, 1);
  });

  await check('los casos: más de 100, unos 230 turnos, y todos sus montos están en la copia congelada', async () => {
    const turnos = bateria.CASOS.reduce((n, c) => n + c.turnos.length, 0);
    assert.ok(bateria.CASOS.length >= 100 && turnos >= 230, `${bateria.CASOS.length} casos, ${turnos} turnos`);
    const sheets = require('../src/sheets');
    const responder = require('../src/responder');
    for (const caso of bateria.CASOS) {
      sheets.usarFixture(caso.planilla ? caso.planilla(JSON.parse(JSON.stringify(fixture))) : JSON.parse(JSON.stringify(fixture)));
      sheets.usarListaBateria(caso.bateria || null);
      const datos = await responder.leerPlanilla();
      for (const t of caso.turnos) {
        for (const m of [...bateria.resolverMontos(t.espera.montos, datos), ...bateria.resolverMontos(t.espera.noMontos, datos)]) {
          assert.ok(!m.error, `${caso.nombre}: ${m.texto} ${m.error}`);
        }
        for (const l of t.antes || []) bateria.duracion(l.hace);
        if (t.despues) bateria.duracion(t.despues);
      }
      // Bloque Ninjo 1b: lo de Evolution se arma con la planilla del caso (y su hora se entiende).
      for (const r of bateria.registrosDeEvolution(caso, 'x@s.whatsapp.net', bateria.INICIO, datos)) {
        assert.ok(r.messageTimestamp > 0 && r.message.conversation, `${caso.nombre}: un registro de Evolution sin hora o sin texto`);
      }
    }
    sheets.usarListaBateria(null);
    sheets.usarFixture(fixture);
  });

  await check('npm run bateria-cerebro sin la clave no corre nada (y no sale a la red)', async () => {
    const r = spawnSync(process.execPath, [path.join(__dirname, 'bateria-cerebro.js'), '--max', '1'], {
      cwd: __dirname,
      env: { ...process.env, ANTHROPIC_API_KEY: '' },
      encoding: 'utf8',
      timeout: 60000,
    });
    assert.strictEqual(r.status, 1, r.stdout + r.stderr);
    assert.ok(/Falta ANTHROPIC_API_KEY/.test(r.stdout), r.stdout);
    const sinCaso = spawnSync(process.execPath, [path.join(__dirname, 'bateria-cerebro.js'), '--solo', 'no existe este caso'], { cwd: __dirname, env: process.env, encoding: 'utf8', timeout: 60000 });
    assert.ok(sinCaso.status === 1 && /Ningún caso/.test(sinCaso.stdout), sinCaso.stdout);
  });

  // Bloque Ninjo 2: en Windows, process.exit con un fetch todavía cerrando tiraba "Assertion failed …
  // async.c". La batería termina sola con process.exitCode (como test/probar-contexto.js). En el proceso
  // hijo, un Sonnet de mentira (el fetch) y un process.exit que deja una marca si alguien lo llama.
  const PRELOAD = [
    "import fs from 'node:fs';",
    'const marca = process.env.BATERIA_MARCA_EXIT;',
    'const salir = process.exit.bind(process);',
    "process.exit = (c) => { fs.appendFileSync(marca, 'process.exit(' + c + ') '); return salir(c); };",
    "const pasos = JSON.parse(process.env.BATERIA_GUION || '[]');",
    'globalThis.fetch = async (url) => {',
    "  if (!String(url).startsWith('https://api.anthropic.com/')) throw new Error('salió a la red: ' + url);",
    "  const cuerpo = { id: 'msg', type: 'message', role: 'assistant', model: 'claude-sonnet-5-5', content: pasos.shift(), stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } };",
    '  return { ok: true, status: 200, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) };',
    '};',
  ].join('\n');
  await check('la batería termina sola (process.exitCode, sin process.exit al final): 0 si corre entera, 1 si se cae', async () => {
    const dir = fs.mkdtempSync(path.join(TMP, 'salida-'));
    const marca = path.join(dir, 'marca.txt');
    const informe = path.join(dir, 'informe.md');
    const escalaElTurno = [[{ type: 'tool_use', id: 'toolu_x1', name: 'escalar', input: { motivo: 'sigue el turno que acordó una persona' } }]];
    const correr = (informeEn) =>
      spawnSync(
        process.execPath,
        ['--import', 'data:text/javascript;base64,' + Buffer.from(PRELOAD).toString('base64'), path.join(__dirname, 'bateria-cerebro.js'), '--solo', 'Turno acordado por una persona hace 3 h', '--informe', informeEn],
        {
          cwd: __dirname,
          env: { ...process.env, ANTHROPIC_API_KEY: 'clave-de-mentira', EVOLUTION_APIKEY: '', BATERIA_MARCA_EXIT: marca, BATERIA_GUION: JSON.stringify(escalaElTurno) },
          encoding: 'utf8',
          timeout: 60000,
        }
      );
    const bien = correr(informe);
    assert.strictEqual(bien.status, 0, 'no terminó solo con 0 (¿quedó algo abierto?): ' + bien.stdout.slice(-600) + bien.stderr.slice(-600));
    assert.ok(/1 casos \(1 pasan\)/.test(fs.readFileSync(informe, 'utf8')), 'el caso de punta a punta no pasó: el check no prueba la salida');
    assert.ok(!fs.existsSync(marca), 'llamó a process.exit al terminar: ' + (fs.existsSync(marca) && fs.readFileSync(marca, 'utf8')));
    // Se cae al escribir el informe (la carpeta es un archivo): 1, también sin process.exit.
    const cae = correr(path.join(informe, 'adentro.md'));
    assert.strictEqual(cae.status, 1, cae.stdout.slice(-600) + cae.stderr.slice(-600));
    assert.ok(!fs.existsSync(marca), 'llamó a process.exit al caerse: ' + (fs.existsSync(marca) && fs.readFileSync(marca, 'utf8')));
  });

  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
