'use strict';
/**
 * Colores de granza sin stock (#sinstock / #hay, comandos del grupo interno).
 *
 *   node test/stock-colores.test.js
 *
 * Una promesa, un caso: el comando solo cuenta al principio del mensaje; entiende las variantes de cada color;
 * lo que no entiende no cambia nada y contesta cómo se usa; es idempotente; sobrevive a un reinicio; #reset de
 * un chat no lo toca; y nada de lo que el bot manda al grupo vuelve a ejecutarse como comando.
 *
 * Números inventados (5490000000…). Sin red: lo fija test/piedra-ayuda.js.
 */
const assert = require('assert');
const fs = require('fs');
const { execFileSync } = require('child_process');

const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, state, alGrupo, propio, enElGrupo } = p;
const stock = require('../src/stock-colores');

const enGrupo = (texto) => bot.procesar(enElGrupo(texto));
const limpio = () => state.guardarSinStockColores([]);
const cmd = (t) => stock.comando(t);

async function caso(nombre, fn) {
  await p.check(nombre, async () => {
    limpio();
    try {
      await fn();
    } finally {
      limpio();
    }
  });
}

(async () => {
  console.log('\nEl comando\n');

  await caso('API: COLORES con los nombres de granza.js', () => {
    assert.deepStrictEqual(
      stock.COLORES.map((c) => [c.clave, c.nombre]),
      [['gris', 'Granza gris Tandil'], ['roja', 'Granza roja'], ['blanca', 'Granza blanca Mar del Plata']]
    );
  });

  await caso('solo cuenta al principio, sin distinguir mayúsculas, y no confunde otros comandos', () => {
    assert.deepStrictEqual(cmd('#sinstock roja'), { tipo: 'sinstock', resto: 'roja' });
    assert.strictEqual(cmd('#SINSTOCK roja').tipo, 'sinstock');
    assert.strictEqual(cmd('#hay roja').tipo, 'hay');
    assert.strictEqual(cmd('#sinstock').resto, '');
    assert.strictEqual(cmd('ojo #sinstock roja'), null);
    assert.strictEqual(cmd('#sinstockroja'), null);
    assert.strictEqual(cmd('#hayroja'), null);
    assert.strictEqual(cmd('#hay-roja'), null);
    assert.strictEqual(cmd('hola'), null);
    for (const otro of ['#hecho', '#sigue 5490000000001', '#pausa 5490000000001', '#sonnet 5490000000001', '#bot 5490000000001', '#sonnet-si 5490000000001', '#recordar algo']) {
      assert.strictEqual(cmd(otro), null, otro);
    }
    // Y los nuevos no los toman los viejos.
    const recordatorios = require('../src/recordatorios');
    const control = require('../src/control');
    const cerebroComandos = require('../src/cerebro-comandos');
    for (const t of ['#hay roja', '#sinstock roja']) {
      assert.ok(!recordatorios.comando(t) && !control.comando(t) && !cerebroComandos.comando(t), t);
    }
  });

  await caso('un aviso del bot (con emoji) no es comando', () => {
    for (const t of ['🚫 Sin stock hoy: Granza roja', '✅ Vuelve a haber stock: Granza roja\n#hay roja', 'Para avisar: #sinstock roja']) {
      assert.strictEqual(cmd(t), null, t);
    }
  });

  console.log('\nLas variantes\n');

  const quedaSinStock = (resto) => {
    limpio();
    const r = stock.desdeGrupo(cmd('#sinstock ' + resto));
    return { r, claves: state.sinStockColores() };
  };

  await caso('cada variante de cada color', () => {
    const variantes = {
      gris: ['gris', 'gris tandil', 'tandil', 'Granza gris', 'granza gris Tandil', 'GRIS', 'granza tandil'],
      roja: ['roja', 'rojo', 'granza roja', 'Granza ROJA', 'rojá'.replace('á', 'a')],
      blanca: ['blanca', 'blanco', 'blanca mdp', 'mdp', 'mar del plata', 'blanca mar del plata', 'granza blanca', 'Granza Blanca Mar del Plata', 'granza mdp'],
    };
    for (const [clave, lista] of Object.entries(variantes)) {
      for (const v of lista) {
        const { r, claves } = quedaSinStock(v);
        assert.deepStrictEqual(claves, [clave], `"${v}" -> ${JSON.stringify(claves)} ${r.texto}`);
        assert.strictEqual(r.cambio, true, v);
      }
    }
  });

  await caso('tildes y mayúsculas indistintas', () => {
    assert.deepStrictEqual(quedaSinStock('BLÁNCA'.replace('Á', 'A')).claves, ['blanca']);
    assert.deepStrictEqual(quedaSinStock('Mar del Plata').claves, ['blanca']);
    assert.deepStrictEqual(quedaSinStock('GRANZA ROJA').claves, ['roja']);
  });

  await caso('varios colores en un mismo comando', () => {
    assert.deepStrictEqual(quedaSinStock('roja y blanca').claves.sort(), ['blanca', 'roja']);
    assert.deepStrictEqual(quedaSinStock('roja, blanca').claves.sort(), ['blanca', 'roja']);
    assert.deepStrictEqual(quedaSinStock('gris tandil, roja y blanca mar del plata').claves.sort(), ['blanca', 'gris', 'roja']);
    assert.deepStrictEqual(quedaSinStock('roja roja').claves, ['roja'], 'repetido en el mismo comando no duplica');
  });

  console.log('\nLo que no entiende no cambia nada\n');

  await caso('texto que no se reconoce: ❓ + cómo se usa, sin cambios', () => {
    state.guardarSinStockColores(['gris']);
    for (const resto of ['verde', 'roja y verde', 'roja 5', 'roja el de ayer']) {
      const r = stock.desdeGrupo(cmd('#sinstock ' + resto));
      assert.strictEqual(r.cambio, false, resto);
      assert.ok(/^❓/.test(r.texto) && r.texto.includes(stock.COMO_SE_USA), r.texto);
      assert.deepStrictEqual(state.sinStockColores(), ['gris'], resto);
    }
  });

  await caso('#hay sin color o con color desconocido: ❓ y sin cambios', () => {
    state.guardarSinStockColores(['roja']);
    for (const t of ['#hay', '#hay verde', '#hay roja y verde']) {
      const r = stock.desdeGrupo(cmd(t));
      assert.strictEqual(r.cambio, false, t);
      assert.ok(/^❓/.test(r.texto) && r.texto.includes(stock.COMO_SE_USA), r.texto);
      assert.deepStrictEqual(state.sinStockColores(), ['roja'], t);
    }
  });

  console.log('\nQué hace\n');

  await caso('#sinstock sin argumento lista y no cambia nada', () => {
    let r = stock.desdeGrupo(cmd('#sinstock'));
    assert.strictEqual(r.cambio, false);
    assert.ok(/^Hay stock de todo/.test(r.texto) || /Hay stock de todo/.test(r.texto), r.texto);
    assert.ok(r.texto.includes('gris Tandil') && r.texto.includes('roja') && r.texto.includes('blanca Mar del Plata'), r.texto);
    state.guardarSinStockColores(['roja']);
    r = stock.desdeGrupo(cmd('#sinstock'));
    assert.strictEqual(r.cambio, false);
    assert.ok(/Sin stock hoy: Granza roja/.test(r.texto), r.texto);
    assert.deepStrictEqual(state.sinStockColores(), ['roja']);
  });

  await caso('#sinstock marca y #hay desmarca; el texto confirma y no empieza con #', () => {
    let r = stock.desdeGrupo(cmd('#sinstock roja'));
    assert.strictEqual(r.cambio, true);
    assert.ok(r.texto.includes('Granza roja') && !r.texto.startsWith('#'), r.texto);
    assert.deepStrictEqual(stock.sinStock(), ['Granza roja']);
    r = stock.desdeGrupo(cmd('#hay roja'));
    assert.strictEqual(r.cambio, true);
    assert.ok(!r.texto.startsWith('#') && r.texto.includes('Granza roja'), r.texto);
    assert.deepStrictEqual(stock.sinStock(), []);
  });

  await caso('idempotente: dos veces no duplica y lo dice', () => {
    stock.desdeGrupo(cmd('#sinstock roja'));
    const r = stock.desdeGrupo(cmd('#sinstock roja'));
    assert.strictEqual(r.cambio, false);
    assert.ok(/ya estaba sin stock/i.test(r.texto), r.texto);
    assert.deepStrictEqual(state.sinStockColores(), ['roja']);
    const h = stock.desdeGrupo(cmd('#hay blanca'));
    assert.strictEqual(h.cambio, false);
    assert.ok(/ya hab[ií]a stock/i.test(h.texto), h.texto);
  });

  await caso('mezcla: uno nuevo y uno que ya estaba cambia lo nuevo y avisa de lo otro', () => {
    stock.desdeGrupo(cmd('#sinstock roja'));
    const r = stock.desdeGrupo(cmd('#sinstock roja y gris'));
    assert.strictEqual(r.cambio, true);
    assert.deepStrictEqual(state.sinStockColores().sort(), ['gris', 'roja']);
    assert.ok(/ya estaba sin stock/i.test(r.texto) && r.texto.includes('Granza gris Tandil'), r.texto);
  });

  await caso('haySinStock compara sin tildes ni mayúsculas', () => {
    state.guardarSinStockColores(['blanca', 'roja']);
    assert.strictEqual(stock.haySinStock('Granza roja'), true);
    assert.strictEqual(stock.haySinStock('GRANZA ROJA'), true);
    assert.strictEqual(stock.haySinStock('granza blanca mar del plata'), true);
    assert.strictEqual(stock.haySinStock('Granza gris Tandil'), false);
    assert.strictEqual(stock.haySinStock('Laja ocre'), false);
    assert.strictEqual(stock.haySinStock(''), false);
    assert.strictEqual(stock.haySinStock(undefined), false);
  });

  console.log('\nPersistencia\n');

  await caso('se guarda en el archivo y sobrevive a un reinicio', () => {
    stock.desdeGrupo(cmd('#sinstock roja y blanca'));
    const dentro = JSON.parse(fs.readFileSync(state.ARCHIVO, 'utf8'));
    assert.ok(JSON.stringify(dentro).includes('"sinStock":["blanca","roja"]'), JSON.stringify(dentro).slice(0, 300));
    const salida = execFileSync(
      process.execPath,
      ['-e', "const s=require('./src/state');console.log(JSON.stringify(s.sinStockColores()))"],
      { cwd: require('path').join(__dirname, '..'), env: { ...process.env, ESTADO_PATH: state.ARCHIVO, APRENDIZAJE_PATH: process.env.APRENDIZAJE_PATH }, encoding: 'utf8' }
    );
    assert.deepStrictEqual(JSON.parse(salida.trim().split('\n').pop()), ['blanca', 'roja']);
  });

  await caso('#reset de un chat no lo toca', async () => {
    stock.desdeGrupo(cmd('#sinstock roja'));
    const N = '5490000000777';
    state.obtener(`${N}@s.whatsapp.net`);
    await bot.procesar(propio(N, '#reset'));
    assert.deepStrictEqual(state.sinStockColores(), ['roja']);
    state.reiniciar(`${N}@s.whatsapp.net`);
    assert.deepStrictEqual(state.sinStockColores(), ['roja']);
  });

  console.log('\nEn el grupo (index.js)\n');

  await caso('el comando escrito en el grupo se aplica y se contesta en el grupo', async () => {
    await enGrupo('#sinstock roja');
    assert.deepStrictEqual(state.sinStockColores(), ['roja']);
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/Granza roja/.test(alGrupo[0]) && !alGrupo[0].startsWith('#'), alGrupo[0]);
    await enGrupo('#hay roja');
    assert.deepStrictEqual(state.sinStockColores(), []);
    assert.strictEqual(alGrupo.length, 2);
    await enGrupo('#hay');
    assert.strictEqual(alGrupo.length, 3);
    assert.ok(/^❓/.test(alGrupo[2]), alGrupo[2]);
    await enGrupo('#sinstock');
    assert.strictEqual(alGrupo.length, 4);
    assert.ok(/Hay stock de todo/.test(alGrupo[3]), alGrupo[3]);
  });

  await caso('lo que el bot manda al grupo no vuelve a ejecutarse como comando', async () => {
    await enGrupo('#sinstock roja');
    await enGrupo('#sinstock');
    for (const t of alGrupo) assert.strictEqual(cmd(t), null, t);
    // Los avisos vuelven por el webhook como mensajes propios: no cambian nada ni contestan de nuevo.
    const antes = alGrupo.length;
    for (const t of alGrupo.slice()) await enGrupo(t);
    assert.strictEqual(alGrupo.length, antes);
    assert.deepStrictEqual(state.sinStockColores(), ['roja']);
  });

  await caso('los comandos de siempre siguen andando (#hecho en el grupo no toca el stock)', async () => {
    await enGrupo('#hecho');
    assert.deepStrictEqual(state.sinStockColores(), []);
    assert.ok(alGrupo.every((t) => !/stock/i.test(t)), alGrupo.join(' | '));
  });

  p.fin();
})();
