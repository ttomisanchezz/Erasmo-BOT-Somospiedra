'use strict';
/**
 * Precios de TechSur (01/10/2026): el parser de los avisos, qué grupo es y qué se guarda.
 *
 *   node test/techsur.test.js
 *
 * Los avisos son copias de los reales del grupo Avisos de la comunidad TechSur (capturas del
 * 01/10/2026). Sin red: Evolution y Supabase se reemplazan por un fetch de mentira.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'techsur-'));
process.env.TECHSUR_LOG_PATH = path.join(tmp, 'techsur.jsonl');
process.env.TECHSUR_GRUPO_JID = '';
process.env.TECHSUR_GRUPO_NOMBRE = 'techsur';
process.env.TECHSUR_ACTIVO = 'true';
process.env.SUPABASE_URL = 'https://de-mentira.supabase.co';
process.env.SUPABASE_SERVICE_ROLE_KEY = 'sb_secret_de_mentira';
process.env.EVOLUTION_URL = 'http://evolution.de-mentira';

const config = require('../src/config');
config.techsur.grupoJid = '';
config.techsur.logPath = process.env.TECHSUR_LOG_PATH;
config.techsur.supabaseUrl = process.env.SUPABASE_URL;
config.techsur.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
config.evolution.url = process.env.EVOLUTION_URL;
const techsur = require('../src/techsur');

const USADOS = `📲IPHONE 16 PRO MAX 256GB *$870USD*
BLACK
90% 92% 92% 90% 91% 91% 88%
DESERT
89% 92% 97% 95% 92%
NATURAL
92%
WHITE
89%`;

const SELLADOS = `*LISTADO DE EQUIPOS SELLADOS ACTUALIZADO*

📦IPHONE 15 128GB *$720USD*
Blue

📦IPHONE 16 PLUS 128GB *$810USD*
Black

📦IPHONE 17 PRO 256GB *$1190USD*
Orange`;

const FOTO = 'IPhone 16 Pro 128GB 89% $760usd';

const ULTIMAS = `*ULTIMAS UNIDADES*🔥

_PS5 Física 1Tb_ 🕹️
1U x $815USD
3U x $805USD`;

const DOS_USADOS = `📲IPHONE 14 PRO 128GB *$450USD*
PURPLE
82% 84% 84% 83% 83%
BLACK
88% 90% 87% 85%
GOLD
83%

📲IPHONE 15 128GB *$425USD*
BLACK
83% 82% 85% 83% 84% 82% 83% 89%
83% 86% 88% 85% 89% 84% 85% 84%
PINK
85% 90%`;

// La "LISTA MAYORISTA" del 07/10/2026 (aviso 3EB0CED25212BDF4F6E8F2 de data/techsur.jsonl): dos tramos con
// encabezado, el mismo equipo con dos precios.
const LISTA_MAYORISTA = `*LISTA MAYORISTA*

*Batería 85% a 99%*
iPhone 13 128GB - USD 280
iPhone 13 Pro 128GB - USD 395
iPhone 14 128GB - USD 310
iPhone 14 Pro 128GB - USD 445
iPhone 14 Pro Max 128GB - USD 500
iPhone 15 128GB - USD 440
iPhone 15 Pro 128GB - USD 560
iPhone 15 Pro Max 256GB - USD 655
iPhone 16 128GB - USD 575
iPhone 16 Pro 128GB - USD 715
iPhone 16 Pro Max 256GB - USD 835

*Con batería nueva*
iPhone 13 128GB - USD 300
iPhone 13 Pro 128GB - USD 420
iPhone 14 128GB - USD 335
iPhone 14 Pro 128GB - USD 490
iPhone 14 Pro Max 128GB - USD 535
iPhone 15 128GB - USD 465
iPhone 15 Pro 128GB - USD 590
iPhone 15 Pro Max 256GB - USD 690
iPhone 16 128GB - USD 605
iPhone 16 Pro 128GB - USD 750
iPhone 16 Pro Max 256GB - USD 870

*Compra minima; 3 unidades*`;

let casos = 0;
function caso(nombre, fn) {
  casos++;
  return Promise.resolve()
    .then(fn)
    .then(() => console.log(`  ok  ${nombre}`))
    .catch((e) => {
      console.error(`  MAL ${nombre}\n${e.stack}`);
      process.exitCode = 1;
    });
}

const resumen = (items) => items.map((i) => [i.modelo, i.capacidad, i.condicion, i.precio_usd, i.nota]);

(async () => {
  console.log('techsur.test.js');

  await caso('usados: modelo, capacidad, precio y las baterías por color', () => {
    const items = techsur.parsearAviso(USADOS);
    assert.deepStrictEqual(resumen(items), [['iPhone 16 Pro Max', '256GB', 'usado', 870, null]]);
    assert.deepStrictEqual(items[0].detalle, [
      { color: 'Black', baterias: [90, 92, 92, 90, 91, 91, 88] },
      { color: 'Desert', baterias: [89, 92, 97, 95, 92] },
      { color: 'Natural', baterias: [92] },
      { color: 'White', baterias: [89] },
    ]);
    assert.strictEqual(items[0].clave, 'iphone 16 pro max|256gb|usado|');
    assert.ok(items[0].texto.startsWith('📲IPHONE 16 PRO MAX 256GB $870USD'));
  });

  await caso('sellados: tres equipos con su color, condición sellado', () => {
    const items = techsur.parsearAviso(SELLADOS);
    assert.deepStrictEqual(resumen(items), [
      ['iPhone 15', '128GB', 'sellado', 720, null],
      ['iPhone 16 Plus', '128GB', 'sellado', 810, null],
      ['iPhone 17 Pro', '256GB', 'sellado', 1190, null],
    ]);
    assert.deepStrictEqual(items.map((i) => i.detalle), [[{ color: 'Blue', baterias: [] }], [{ color: 'Black', baterias: [] }], [{ color: 'Orange', baterias: [] }]]);
  });

  await caso('el texto de una foto, con la batería en la misma línea', () => {
    const items = techsur.parsearAviso(FOTO);
    assert.deepStrictEqual(resumen(items), [['iPhone 16 Pro', '128GB', 'usado', 760, null]]);
    assert.deepStrictEqual(items[0].detalle, [{ color: null, baterias: [89] }]);
  });

  await caso('otro producto con precio por cantidad: el nombre sale de la línea de arriba', () => {
    const items = techsur.parsearAviso(ULTIMAS);
    assert.deepStrictEqual(resumen(items), [
      ['PS5 Física', '1TB', null, 815, '1U'],
      ['PS5 Física', '1TB', null, 805, '3U'],
    ]);
  });

  await caso('dos equipos en un aviso y baterías que siguen en otra línea', () => {
    const items = techsur.parsearAviso(DOS_USADOS);
    assert.deepStrictEqual(resumen(items), [
      ['iPhone 14 Pro', '128GB', 'usado', 450, null],
      ['iPhone 15', '128GB', 'usado', 425, null],
    ]);
    assert.strictEqual(items[1].detalle[0].baterias.length, 16);
    assert.deepStrictEqual(items[1].detalle[1], { color: 'Pink', baterias: [85, 90] });
  });

  await caso('sin precio en dólares no hay nada que guardar', () => {
    assert.deepStrictEqual(techsur.parsearAviso('_JUEVES INGRESA 17 PRO MAX_ 🏃'), []);
    assert.deepStrictEqual(techsur.parsearAviso('Precio $870.000 en pesos'), []);
    assert.deepStrictEqual(techsur.parsearAviso(''), []);
  });

  await caso('otras formas de escribir el precio y el modelo', () => {
    assert.deepStrictEqual(resumen(techsur.parsearAviso('iPhone 15 Pro Max 1TB US$ 1.150')), [['iPhone 15 Pro Max', '1TB', null, 1150, null]]);
    assert.deepStrictEqual(resumen(techsur.parsearAviso('IPHONE 16E 128GB $500USD')), [['iPhone 16e', '128GB', null, 500, null]]);
    assert.deepStrictEqual(resumen(techsur.parsearAviso('Iphone 12 64gb 85% - 280 usd')), [['iPhone 12', '64GB', 'usado', 280, null]]);
    const color = techsur.parsearAviso('IPHONE 13 128GB MIDNIGHT $400USD');
    assert.deepStrictEqual(color[0].detalle, [{ color: 'Midnight', baterias: [] }]);
    const porColor = techsur.parsearAviso('IPHONE 13 PRO 256GB\nSIERRA BLUE $520USD\nGRAPHITE $510USD');
    assert.deepStrictEqual(resumen(porColor), [
      ['iPhone 13 Pro', '256GB', null, 520, null],
      ['iPhone 13 Pro', '256GB', null, 510, null],
    ]);
    assert.strictEqual(techsur.parsearAviso('Cargador 20W $638,98 USD')[0].precio_usd, 638.98);
  });

  await caso('avisos reales del 28 al 30/09: precio sin "USD", capacidad sola abajo del modelo y "con detalles"', () => {
    const sinUsd = techsur.parsearAviso('📲IPHONE 16 128GB *$600*\nBLACK\n89% 91% 94%\n\n📲IPHONE 16 PRO 128GB *$740*\nDESERT\n89% 85%');
    assert.deepStrictEqual(resumen(sinUsd), [
      ['iPhone 16', '128GB', 'usado', 600, null],
      ['iPhone 16 Pro', '128GB', 'usado', 740, null],
    ]);
    const samsung = techsur.parsearAviso('_*SAMSUNG S26 ULTRA*_\n\n_256GB $1.060USD_\n_512GB $1.180USD_');
    assert.deepStrictEqual(resumen(samsung), [
      ['Samsung S26 Ultra', '256GB', null, 1060, null],
      ['Samsung S26 Ultra', '512GB', null, 1180, null],
    ]);
    const detalles = techsur.parsearAviso('*IPhone 17 256GB 100% con detalles $650usd*');
    // Desde el 08/10/2026 el 100% como única batería es el tramo "batería 100%", y se suma a la nota que ya tenía.
    assert.deepStrictEqual(resumen(detalles), [['iPhone 17', '256GB', 'usado', 650, 'batería 100%, con detalles']]);
    assert.deepStrictEqual(detalles[0].detalle, [{ color: null, baterias: [100] }]);
    const conColor = techsur.parsearAviso('*IPhone 16 Pro Max 256GB 94% Natural $870usd*');
    assert.deepStrictEqual(conColor[0].detalle, [{ color: 'Natural', baterias: [94] }]);
    // Un monto en pesos sigue sin contar.
    assert.deepStrictEqual(techsur.parsearAviso('Te lo dejo en $870.000'), []);
    // 25 y 26/09: "128G", iPhone sin la palabra, dos precios en una línea, batería baja y lo que no es un producto.
    assert.deepStrictEqual(resumen(techsur.parsearAviso('📦IPHONE 16 128G *$820USD*\nBlack')), [['iPhone 16', '128GB', 'sellado', 820, null]]);
    assert.deepStrictEqual(resumen(techsur.parsearAviso('_*ULTIMAS UNIDADES DE 18 PRO 256GB*_\n\n1 x $1590 // 3 x $1570')), [
      ['iPhone 18 Pro', '256GB', null, 1590, '1U'],
      ['iPhone 18 Pro', '256GB', null, 1570, '3U'],
    ]);
    const baja = techsur.parsearAviso('*🪫USADOS BATERIA BAJA*⬇️ 24/09🗓️\n\n🪫IPHONE 15 128GB *405USD*\nBLACK \nPINK ');
    assert.deepStrictEqual(resumen(baja), [['iPhone 15', '128GB', 'usado', 405, 'batería baja']]);
    assert.strictEqual(baja[0].clave, 'iphone 15|128gb|usado|bateria baja', 'no tapa al precio de los usados comunes');
    assert.deepStrictEqual(techsur.parsearAviso('GOLF GTI MK7,5 2018\n\n$35.000USD (CLIENTE FINAL)  // COMISIÓN $1.500USD (REVENTA)'), []);
  });

  // El tramo de batería (08/10/2026, decisión de Tomás): la LISTA MAYORISTA del 07/10 trae el mismo equipo en dos
  // tramos con encabezado, y salían con la misma clave. El tramo va en `nota` (que es parte de la clave).
  await caso('la LISTA MAYORISTA del 07/10: el tramo del encabezado va en la nota y separa la clave (85-99% y 100%)', () => {
    const items = techsur.parsearAviso(LISTA_MAYORISTA);
    assert.strictEqual(items.length, 22);
    const de = (modelo, usd) => items.find((i) => i.modelo === modelo && i.precio_usd === usd);
    assert.deepStrictEqual(resumen([de('iPhone 13', 280), de('iPhone 13', 300)]), [
      ['iPhone 13', '128GB', null, 280, 'batería 85-99%'],
      ['iPhone 13', '128GB', null, 300, 'batería 100%'],
    ]);
    assert.strictEqual(de('iPhone 13', 280).clave, 'iphone 13|128gb||bateria 85-99%');
    assert.strictEqual(de('iPhone 13', 300).clave, 'iphone 13|128gb||bateria 100%');
    assert.deepStrictEqual(resumen([de('iPhone 16 Pro Max', 835), de('iPhone 16 Pro Max', 870)]), [
      ['iPhone 16 Pro Max', '256GB', null, 835, 'batería 85-99%'],
      ['iPhone 16 Pro Max', '256GB', null, 870, 'batería 100%'],
    ]);
    assert.notStrictEqual(de('iPhone 16 Pro Max', 835).clave, de('iPhone 16 Pro Max', 870).clave);
    // Cada encabezado vale hasta el siguiente: los 11 primeros son del rango, los 11 de abajo al 100%.
    assert.deepStrictEqual(items.map((i) => i.nota), [...Array(11).fill('batería 85-99%'), ...Array(11).fill('batería 100%')]);
    assert.strictEqual(new Set(items.map((i) => i.clave)).size, 22, 'dos equipos con la misma clave');
    // Sin la línea en blanco antes del segundo encabezado, lo mismo (el encabezado no se toma como color ni batería).
    const pegado = techsur.parsearAviso(LISTA_MAYORISTA.replace('\n\n*Con batería nueva*', '\n*Con batería nueva*'));
    assert.deepStrictEqual(pegado.map((i) => i.nota), items.map((i) => i.nota));
  });

  await caso('el 100% como única batería, "USADOS CON BATERIA 100%" y otro rango: van con su tramo en la nota', () => {
    // El aviso del 03/10 (2A9004EE75A7…).
    const solo100 = techsur.parsearAviso('_*IPHONE 13 128GB 100% $295*_');
    assert.deepStrictEqual(resumen(solo100), [['iPhone 13', '128GB', 'usado', 295, 'batería 100%']]);
    assert.strictEqual(solo100[0].clave, 'iphone 13|128gb|usado|bateria 100%');
    // Como el del 06/10 (2AE08A12246A…), con precios: el encabezado vale para todos los de abajo.
    const conBateria100 = techsur.parsearAviso('*🔋USADOS CON BATERIA 100%*\n\n🔋IPHONE 13 128GB *$300USD*\nPINK X3\n\n🔋IPHONE 14 PRO 128GB *$470USD*\nBLACK X26');
    assert.deepStrictEqual(resumen(conBateria100), [
      ['iPhone 13', '128GB', 'usado', 300, 'batería 100%'],
      ['iPhone 14 Pro', '128GB', 'usado', 470, 'batería 100%'],
    ]);
    // El del 06/10 tal cual (sin precios) sigue sin guardar nada.
    assert.deepStrictEqual(techsur.parsearAviso('*🔋USADOS CON BATERIA 100%*\n\n🔋IPHONE 13 128GB\nPINK X3\nGREEN X1'), []);
    // Otro rango, con "a", "al" o "-": la nota lleva ese rango con el mismo formato.
    for (const encabezado of ['*Batería 80% a 94%*', '*Batería del 80 al 94%*', '*BATERIA 80-94%*']) {
      assert.deepStrictEqual(resumen(techsur.parsearAviso(`${encabezado}\niPhone 14 128GB - USD 290`)), [['iPhone 14', '128GB', null, 290, 'batería 80-94%']], encabezado);
    }
    // Con baterías sueltas distintas, como siempre: sin tramo (aunque una sea 100%).
    assert.strictEqual(techsur.parsearAviso('Iphone 12 64gb 85% - 280 usd')[0].nota, null);
    assert.strictEqual(techsur.parsearAviso('📲IPHONE 16 128GB *$600*\nBLACK\n89% 100% 94%')[0].nota, null);
    // "Batería baja" sigue siendo la nota del aviso, aunque el encabezado traiga un rango.
    const baja = techsur.parsearAviso('*🪫USADOS BATERIA BAJA 70% a 79%*\n\n🪫IPHONE 15 128GB *405USD*\nBLACK');
    assert.deepStrictEqual(resumen(baja), [['iPhone 15', '128GB', 'usado', 405, 'batería baja']]);
    // Un aviso de batería baja no lleva tramo, aunque traiga otro encabezado antes (revisión de Codex): como siempre.
    const mezclado = techsur.parsearAviso('*🔋USADOS CON BATERIA 100%*\n\n🔋IPHONE 13 128GB *$300USD*\n\n*🪫USADOS BATERIA BAJA 70% a 79%*\n\n🪫IPHONE 15 128GB *405USD*');
    assert.deepStrictEqual(resumen(mezclado), [
      ['iPhone 13', '128GB', 'usado', 300, 'batería baja'],
      ['iPhone 15', '128GB', 'usado', 405, 'batería baja'],
    ]);
  });

  await caso('el tramo se suma a la nota que ya tenía el equipo, y no toca a los sellados ni a lo que no es iPhone', () => {
    const porCantidad = techsur.parsearAviso('*Con batería nueva*\n\n_IPHONE 15 128GB_\n1U x $480USD\n3U x $470USD');
    assert.deepStrictEqual(resumen(porCantidad), [
      ['iPhone 15', '128GB', null, 480, 'batería 100%, 1U'],
      ['iPhone 15', '128GB', null, 470, 'batería 100%, 3U'],
    ]);
    assert.strictEqual(porCantidad[0].clave, 'iphone 15|128gb||bateria 100%, 1u');
    // El nombre del equipo en negrita no corta el tramo; otro título en negrita sí (revisión de code-review).
    assert.strictEqual(techsur.parsearAviso('*Con batería nueva*\n\n*IPHONE 15 128GB*\n1U x $480USD')[0].nota, 'batería 100%, 1U');
    const conPromo = techsur.parsearAviso('*Batería 85% a 99%*\niPhone 13 128GB - USD 280\n\n*USADOS PROMO* 🔥\niPhone 14 128GB - USD 300');
    assert.deepStrictEqual(resumen(conPromo), [
      ['iPhone 13', '128GB', 'usado', 280, 'batería 85-99%'],
      ['iPhone 14', '128GB', 'usado', 300, null],
    ]);
    // El encabezado sigue hasta el fin del aviso, pero un sellado y una PS5 quedan como siempre.
    const mezclado = techsur.parsearAviso('*Con batería nueva*\niPhone 13 128GB - USD 300\n\n📦IPHONE 16 128G *$820USD*\nBlack\n\n_PS5 Física 1Tb_\n1U x $815USD');
    assert.deepStrictEqual(resumen(mezclado), [
      ['iPhone 13', '128GB', null, 300, 'batería 100%'],
      ['iPhone 16', '128GB', 'sellado', 820, null],
      ['PS5 Física', '1TB', null, 815, '1U'],
    ]);
  });

  await caso('el nombre del grupo: sin importar mayúsculas, espacios ni tildes', () => {
    assert.ok(techsur.coincideNombre('TechSur'));
    assert.ok(techsur.coincideNombre('TECH SUR 📲'));
    assert.ok(techsur.coincideNombre('Avisos · Tech Sur'));
    assert.ok(!techsur.coincideNombre('Somos iPhone - avisos'));
  });

  // ---------------------------------------------------------------- con red de mentira
  const fetchReal = global.fetch;
  const pedidos = [];
  let nombres = {};
  let supabaseFalla = false;
  global.fetch = async (url, opciones = {}) => {
    pedidos.push({ url: String(url), opciones });
    if (String(url).includes('/group/findGroupInfos/')) {
      const jid = decodeURIComponent(String(url).split('groupJid=')[1]);
      if (!(jid in nombres)) return { ok: false, status: 404, text: async () => '', json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ id: jid, subject: nombres[jid] }) };
    }
    if (String(url).includes('/rest/v1/precios_proveedor')) {
      if (supabaseFalla) return { ok: false, status: 503, text: async () => 'caído' };
      return { ok: true, status: 201, text: async () => '' };
    }
    throw new Error(`fetch inesperado: ${url}`);
  };
  const ahora = Math.floor(Date.now() / 1000);
  const msg = (jid, id, texto, ts = ahora) => ({ key: { remoteJid: jid, id, fromMe: false }, messageTimestamp: ts, message: { conversation: texto } });
  const TECHSUR = '120363111111111111@g.us';
  const OTRO = '120363222222222222@g.us';

  try {
    await caso('el grupo TechSur se reconoce por el nombre y se guardan sus precios en Supabase', async () => {
      techsur._reiniciar();
      nombres = { [TECHSUR]: 'TechSur', [OTRO]: 'Familia' };
      pedidos.length = 0;
      assert.strictEqual(await techsur.recibir(msg(TECHSUR, 'A1', SELLADOS), SELLADOS), true);
      const post = pedidos.find((p) => p.url.includes('/rest/v1/'));
      assert.ok(post, 'no se guardó nada');
      assert.ok(post.url.endsWith('/rest/v1/precios_proveedor?on_conflict=proveedor,mensaje_id,posicion'));
      assert.strictEqual(post.opciones.method, 'POST');
      assert.strictEqual(post.opciones.headers.apikey, 'sb_secret_de_mentira');
      assert.strictEqual(post.opciones.headers.Authorization, undefined, 'una clave sb_secret no va en Authorization');
      assert.match(post.opciones.headers.Prefer, /resolution=ignore-duplicates/);
      const filas = JSON.parse(post.opciones.body);
      assert.strictEqual(filas.length, 3);
      assert.deepStrictEqual(filas.map((f) => [f.proveedor, f.mensaje_id, f.posicion]), [['TECH SUR', 'A1', 0], ['TECH SUR', 'A1', 1], ['TECH SUR', 'A1', 2]]);
      assert.strictEqual(filas[0].publicado_en, new Date(ahora * 1000).toISOString());
      // El aviso queda anotado tal cual.
      const log = fs.readFileSync(config.techsur.logPath, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
      assert.strictEqual(log.at(-1).texto, SELLADOS);
    });

    await caso('al nombre se le pregunta una sola vez por grupo', async () => {
      pedidos.length = 0;
      await techsur.recibir(msg(TECHSUR, 'A2', FOTO), FOTO);
      assert.strictEqual(pedidos.filter((p) => p.url.includes('findGroupInfos')).length, 0);
    });

    await caso('otro grupo: no se guarda ni se anota nada', async () => {
      pedidos.length = 0;
      const lineas = fs.readFileSync(config.techsur.logPath, 'utf8').trim().split('\n').length;
      assert.strictEqual(await techsur.recibir(msg(OTRO, 'B1', SELLADOS), SELLADOS), false);
      assert.strictEqual(await techsur.recibir(msg(OTRO, 'B2', SELLADOS), SELLADOS), false);
      assert.strictEqual(pedidos.filter((p) => p.url.includes('findGroupInfos')).length, 1);
      assert.strictEqual(pedidos.filter((p) => p.url.includes('/rest/v1/')).length, 0);
      assert.strictEqual(fs.readFileSync(config.techsur.logPath, 'utf8').trim().split('\n').length, lineas);
    });

    await caso('TECHSUR_GRUPO_JID manda sobre el nombre', async () => {
      techsur._reiniciar();
      config.techsur.grupoJid = OTRO;
      pedidos.length = 0;
      assert.strictEqual(await techsur.recibir(msg(TECHSUR, 'C1', FOTO), FOTO), false);
      assert.strictEqual(await techsur.recibir(msg(OTRO, 'C2', FOTO), FOTO), true);
      assert.strictEqual(pedidos.filter((p) => p.url.includes('findGroupInfos')).length, 0);
      config.techsur.grupoJid = '';
    });

    await caso('un aviso de hace más de 7 días se anota pero no se guarda', async () => {
      techsur._reiniciar();
      pedidos.length = 0;
      const viejo = ahora - 8 * 24 * 3600;
      assert.strictEqual(await techsur.recibir(msg(TECHSUR, 'D1', FOTO, viejo), FOTO), true);
      assert.strictEqual(pedidos.filter((p) => p.url.includes('/rest/v1/')).length, 0);
    });

    await caso('si Supabase no contesta, las filas esperan y salen con el próximo aviso', async () => {
      techsur._reiniciar();
      pedidos.length = 0;
      supabaseFalla = true;
      const err = console.error;
      console.error = () => {};
      try {
        assert.strictEqual(await techsur.recibir(msg(TECHSUR, 'E1', SELLADOS), SELLADOS), true);
      } finally {
        console.error = err;
      }
      supabaseFalla = false;
      await techsur.recibir(msg(TECHSUR, 'E2', FOTO), FOTO);
      const ultimo = pedidos.filter((p) => p.url.includes('/rest/v1/')).at(-1);
      const filas = JSON.parse(ultimo.opciones.body);
      assert.deepStrictEqual(filas.map((f) => f.mensaje_id), ['E1', 'E1', 'E1', 'E2']);
      techsur._reiniciar();
    });

    await caso('al volver a leer un aviso (pisar), las filas se reescriben en vez de ignorarse', async () => {
      techsur._reiniciar();
      pedidos.length = 0;
      assert.strictEqual(await techsur.guardar(techsur.aFilas(techsur.parsearAviso(FOTO), 'G1', Date.now()), { pisar: true }), 1);
      const post = pedidos.filter((p) => p.url.includes('/rest/v1/')).at(-1);
      assert.match(post.opciones.headers.Prefer, /resolution=merge-duplicates/);
    });

    await caso('Evolution caído: no se decide y no tira', async () => {
      techsur._reiniciar();
      nombres = {};
      const warn = console.warn;
      console.warn = () => {};
      try {
        assert.strictEqual(await techsur.recibir(msg('120363333333333333@g.us', 'F1', FOTO), FOTO), false);
      } finally {
        console.warn = warn;
      }
    });
  } finally {
    global.fetch = fetchReal;
    techsur._reiniciar();
    fs.rmSync(tmp, { recursive: true, force: true });
  }

  console.log(`\n${casos} casos.`);
})();
