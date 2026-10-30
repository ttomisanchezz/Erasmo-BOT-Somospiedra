'use strict';
/**
 * Lista de excluidos (#excluir / #incluir / #excluidos; decisión de Tomás del 29/10/2026).
 *
 *   node test/excluidos.test.js
 *
 * Una promesa, un caso: los tres comandos solo cuentan si los escribe la cuenta del negocio y al principio
 * del mensaje; el número se toma entero o no se marca nada; un excluido se ignora ENTERO (ni Sonnet, ni
 * estado, ni aviso, ni aprendizaje); un #excluir frena la tanda que ya estaba en vuelo; sobrevive a un
 * reinicio; y nada de lo que el bot manda al grupo vuelve a ejecutarse como comando.
 *
 * Números inventados (5490000000…). Sin red: lo fija test/piedra-ayuda.js.
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, state, config, sonnet, aClientes, alGrupo, mensaje, propio, enElGrupo, jid, dormir } = p;

let excluidos = null;
try {
  excluidos = require('../src/excluidos');
} catch (e) {
  console.log('  (todavía no existe src/excluidos.js: ' + e.message.split('\n')[0] + ')');
}

const sinExcluidos = () => {
  for (const k of state.numerosExcluidos()) state.borrarExcluido(k);
};
const enGrupo = (texto) => bot.procesar(enElGrupo(texto));
const comandoDe = (t) => (excluidos ? excluidos.comando(t) : null);
const fecha = (ts) => {
  const d = new Date(ts);
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
};

/** Cada caso arranca sin excluidos y con el .env como estaba. */
async function caso(nombre, fn) {
  await p.check(nombre, async () => {
    sinExcluidos();
    const lista = config.contactosPersonales;
    const ritmo = { ...config.ritmo };
    try {
      await fn();
    } finally {
      config.contactosPersonales = lista;
      Object.assign(config.ritmo, ritmo);
      sinExcluidos();
    }
  });
}

(async () => {
  console.log('\nEl comando y el número\n');

  await caso('solo cuenta al principio, sin distinguir mayúsculas, y no confunde #excluirlo', () => {
    assert.ok(comandoDe('#excluir 5490000000001'));
    assert.strictEqual(comandoDe('#EXCLUIR 5490000000001').tipo, 'excluir');
    assert.strictEqual(comandoDe('#incluir').tipo, 'incluir');
    assert.strictEqual(comandoDe('#excluidos').tipo, 'excluidos');
    assert.strictEqual(comandoDe('ojo #excluir 5490000000001'), null);
    assert.strictEqual(comandoDe('#excluirlo 5490000000001'), null);
    assert.strictEqual(comandoDe('#incluirme'), null);
    assert.strictEqual(comandoDe('hola'), null);
  });

  await caso('toma UN número: wa.me, +, espacios, guiones y paréntesis entre los dígitos', () => {
    assert.strictEqual(comandoDe('#excluir 5490000000001').numero, '5490000000001');
    assert.strictEqual(comandoDe('#excluir https://wa.me/5490000000002').numero, '5490000000002');
    assert.strictEqual(comandoDe('#excluir wa.me/5490000000003').numero, '5490000000003');
    assert.strictEqual(comandoDe('#excluir +54 9 299 000-0004').numero, '5492990000004');
    assert.strictEqual(comandoDe('#excluir +54 (299) 000-0005').numero, '5492990000005');
    assert.strictEqual(comandoDe('#excluir').numero, '');
    assert.strictEqual(comandoDe('#excluir').problema, null);
  });

  await caso('lo que no es un solo número no marca nada (problema)', () => {
    for (const t of ['#excluir 5490000000123 el de fletes 2', '#excluir 123', '#excluir hola', '#excluir 54900000001234567890', '#incluir 5490000000123 y 5490000000124']) {
      const c = comandoDe(t);
      assert.ok(c && c.problema && c.numero === '', `"${t}" -> ${JSON.stringify(c)}`);
    }
  });

  console.log('\nExcluir\n');

  await caso('#excluir en el chat: 🚫 al grupo con nombre y número, al cliente nada, y después silencio total', async () => {
    const N = '5490000000101';
    state.actualizar(jid(N), { nombre: 'Marta Pérez' });
    await bot.procesar(propio(N, '#excluir'));
    assert.strictEqual(aClientes.length, 0, 'le llegó algo al cliente');
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/^🚫 Excluido/.test(alGrupo[0]) && alGrupo[0].includes('Marta Pérez') && alGrupo[0].includes(N), alGrupo[0]);
    assert.ok(alGrupo[0].includes(`💬 https://wa.me/${N}`), alGrupo[0]);
    assert.deepStrictEqual(state.numerosExcluidos(), [N]);
    assert.strictEqual(state.excluidos()[N].origen, 'chat');

    sonnet.guion(sonnet.responde(['hola!']));
    await bot.procesar(mensaje(N, 'hola, tienen laja?'));
    await dormir(30);
    assert.strictEqual(sonnet.pedidos.length, 0, 'le preguntó a Sonnet');
    assert.strictEqual(aClientes.length, 0, 'le contestó a un excluido');
    assert.strictEqual(alGrupo.length, 1, 'avisó al grupo por un excluido');
  });

  await caso('#excluir <número> desde el grupo, también con wa.me y con +54 9 299 con espacios y guiones', async () => {
    await enGrupo('#excluir 5490000000102');
    await enGrupo('#excluir https://wa.me/5490000000103');
    await enGrupo('#excluir +54 9 299 000-0104');
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 3);
    assert.ok(alGrupo.every((t) => /^🚫 Excluido/.test(t)), alGrupo.join(' | '));
    assert.ok(alGrupo[2].includes('5492990000104'), 'no repite el número parseado: ' + alGrupo[2]);
    assert.deepStrictEqual(state.numerosExcluidos().sort(), ['5490000000102', '5490000000103', '5492990000104']);
    assert.strictEqual(state.excluidos()['5490000000102'].origen, 'grupo');
    for (const n of ['5490000000102', '5490000000103', '5492990000104']) assert.ok(p.evolution.esContactoPersonal(jid(n)));
  });

  await caso('un número que no es un solo número: no marca nada y contesta cómo se usa', async () => {
    await enGrupo('#excluir 5490000000123 el de fletes 2');
    await enGrupo('#excluir 123');
    await enGrupo('#excluir');
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 3);
    assert.ok(alGrupo.every((t) => /^❓/.test(t) && /#excluir 5492990000000/.test(t) && /#incluir/.test(t)), alGrupo.join(' | '));
    assert.deepStrictEqual(state.numerosExcluidos(), []);
  });

  await caso('un número que nunca escribió: después escribe y es silencio total, sin chat ni aprendizaje', async () => {
    const N = '5490000000104';
    await enGrupo(`#excluir ${N}`);
    assert.ok(!state.todos()[jid(N)], 'le creó un chat al excluirlo');
    sonnet.guion(sonnet.responde(['hola!']));
    await bot.procesar(mensaje(N, 'hola, soy el de los fletes'));
    await dormir(30);
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(!state.todos()[jid(N)], 'guardó el chat de un excluido');
    assert.strictEqual(p.eventos(N).length, 0, 'dejó eventos de aprendizaje');
  });

  await caso('mientras está excluido, el texto común de la cuenta en su chat tampoco entra al estado', async () => {
    const N = '5490000000105';
    await enGrupo(`#excluir ${N}`);
    await bot.procesar(propio(N, 'le contesto yo'));
    assert.ok(!state.todos()[jid(N)]);
    assert.strictEqual(p.eventos(N).length, 0);
  });

  console.log('\nIncluir\n');

  await caso('#incluir desde el grupo: ✅ y el cliente vuelve a recibir respuesta de Sonnet', async () => {
    const N = '5490000000111';
    await enGrupo(`#excluir ${N}`);
    await enGrupo(`#incluir ${N}`);
    assert.strictEqual(alGrupo.length, 2);
    assert.ok(/^✅ Incluido/.test(alGrupo[1]) && alGrupo[1].includes(N) && alGrupo[1].includes(`💬 https://wa.me/${N}`), alGrupo[1]);
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    sonnet.guion(sonnet.responde(['hola, como va?']));
    await bot.procesar(mensaje(N, 'hola'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola, como va?']);
  });

  await caso('#incluir desde el chat del excluido (corte temprano): ✅, y después Sonnet le contesta', async () => {
    const N = '5490000000112';
    await enGrupo(`#excluir ${N}`);
    alGrupo.length = 0;
    await bot.procesar(propio(N, '#incluir'));
    assert.strictEqual(aClientes.length, 0, 'le llegó algo al cliente');
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/^✅ Incluido/.test(alGrupo[0]), alGrupo[0]);
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.ok(!state.todos()[jid(N)] || !state.todos()[jid(N)].ultimoHumano, 'el #incluir calló al bot');
    sonnet.guion(sonnet.responde(['hola, como va?']));
    await bot.procesar(mensaje(N, 'hola'));
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola, como va?']);
  });

  await caso('#incluir de un número guardado con otra variante (549… vs 54…) lo saca', async () => {
    // La clave 549… sale del camino del chat (el JID tal cual); el #incluir llega desde el grupo escrito como 54….
    await bot.procesar(propio('5490000000113', '#excluir'));
    assert.deepStrictEqual(state.numerosExcluidos(), ['5490000000113']);
    await enGrupo('#incluir 540000000113');
    assert.ok(/^✅ Incluido/.test(alGrupo[1]), alGrupo[1]);
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    // Y al revés, y sacando TODAS las variantes guardadas.
    state.guardarExcluido('5490000000114', { desde: Date.now(), nombre: null, origen: 'grupo' });
    state.guardarExcluido('540000000114', { desde: Date.now(), nombre: null, origen: 'grupo' });
    await enGrupo('#incluir 5490000000114');
    assert.deepStrictEqual(state.numerosExcluidos(), []);
  });

  await caso('"ya estaba excluido" y "no estaba excluido" no cambian nada, ni la fecha', async () => {
    await enGrupo('#excluir 5490000000115');
    const antes = JSON.stringify(state.excluidos());
    await dormir(15);
    await enGrupo('#excluir 5490000000115');
    await enGrupo('#excluir 540000000115');
    assert.ok(/ya estaba/i.test(alGrupo[1]) && /ya estaba/i.test(alGrupo[2]), alGrupo.join(' | '));
    assert.strictEqual(JSON.stringify(state.excluidos()), antes, 'cambió la lista');
    await enGrupo('#incluir 5490000000116');
    assert.ok(/no estaba/i.test(alGrupo[3]), alGrupo[3]);
    assert.strictEqual(state.numerosExcluidos().length, 1);
    assert.strictEqual(aClientes.length, 0);
  });

  console.log('\nCONTACTOS_PERSONALES del .env y el grupo de avisos\n');

  await caso('un número del .env: #incluir (grupo y chat) dice que hay que sacarlo de ahí; #excluir dice que ya está', async () => {
    config.contactosPersonales = ['5490000000121'];
    await enGrupo('#incluir 5490000000121');
    await bot.procesar(propio('5490000000121', '#incluir'));
    await enGrupo('#excluir 5490000000121');
    assert.strictEqual(alGrupo.length, 3);
    assert.ok(/CONTACTOS_PERSONALES/.test(alGrupo[0]) && /reinici/i.test(alGrupo[0]), alGrupo[0]);
    assert.ok(/CONTACTOS_PERSONALES/.test(alGrupo[1]) && /reinici/i.test(alGrupo[1]), alGrupo[1]);
    assert.ok(/ya está en CONTACTOS_PERSONALES/.test(alGrupo[2]), alGrupo[2]);
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('el grupo de avisos nunca se excluye', async () => {
    const digitos = p.GRUPO.split('@')[0];
    await enGrupo(`#excluir ${digitos}`);
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/^❓/.test(alGrupo[0]) && /grupo/i.test(alGrupo[0]), alGrupo[0]);
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.strictEqual(p.evolution.esContactoPersonal(p.GRUPO), false);
  });

  console.log('\n#excluidos\n');

  await caso('#excluidos vacía lo dice; con datos lista nombre, número y fecha, sin repetidos, y cuántos hay en el .env', async () => {
    await enGrupo('#excluidos');
    assert.ok(/ninguno/i.test(alGrupo[0]), alGrupo[0]);
    state.actualizar(jid('5490000000131'), { nombre: 'Marta Pérez' });
    await enGrupo('#excluir 5490000000131');
    await enGrupo('#excluir 5490000000132');
    state.guardarExcluido('540000000132', { desde: Date.now(), nombre: null, origen: 'grupo' });
    config.contactosPersonales = ['5490000000998', '5490000000999'];
    alGrupo.length = 0;
    await enGrupo('#excluidos');
    const texto = alGrupo.join('\n');
    assert.ok(texto.includes('Marta Pérez') && texto.includes('5490000000131'), texto);
    assert.ok(texto.includes(fecha(Date.now())), texto);
    assert.strictEqual((texto.match(/0000000132/g) || []).length, 1, 'repetido: ' + texto);
    assert.ok(/2 números en CONTACTOS_PERSONALES/.test(texto), texto);
    assert.ok(!texto.includes('0000000998') && !texto.includes('0000000999'), 'mostró los números del .env');
    assert.ok(alGrupo.every((t) => !comandoDe(t)));
  });

  await caso('#excluidos escrito en un chat manda la lista al grupo, nunca al cliente', async () => {
    await enGrupo('#excluir 5490000000133');
    alGrupo.length = 0;
    await bot.procesar(propio('5490000000134', '#excluidos'));
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(alGrupo[0].includes('5490000000133'), alGrupo[0]);
  });

  console.log('\nQuién puede y cuándo\n');

  await caso('un cliente que escribe #excluir o #incluir no cambia nada: es un mensaje común', async () => {
    sonnet.guion(sonnet.responde(['uno']), sonnet.responde(['dos']));
    await bot.procesar(mensaje('5490000000141', '#excluir'));
    await bot.procesar(mensaje('5490000000142', '#incluir'));
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.strictEqual(sonnet.pedidos.length, 2, 'no los trató como mensajes comunes');
    assert.ok(alGrupo.every((t) => !/Excluido|Incluido/.test(t)));
  });

  await caso('un comando que no está al principio es un mensaje común de una persona', async () => {
    await bot.procesar(propio('5490000000143', 'ojo #excluir'));
    await enGrupo('ojo #excluir 5490000000144');
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.strictEqual(alGrupo.length, 0);
    const h = (state.todos()[jid('5490000000143')] || {}).historial || [];
    assert.ok(h.some((l) => l.texto === 'ojo #excluir'), 'no entró al historial como mensaje común');
  });

  await caso('un #excluir viejo (de hace 1 h) no hace nada', async () => {
    const hace = Date.now() - 60 * 60 * 1000;
    await bot.procesar(propio('5490000000145', '#excluir', { ts: hace }));
    await bot.procesar(mensaje(p.GRUPO, '#excluir 5490000000146', { fromMe: true, ts: hace }));
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.strictEqual(alGrupo.length, 0);
  });

  await caso('@lid: #excluir / #incluir avisan que WhatsApp no mandó el número y no marcan nada', async () => {
    await bot.procesar(propio('123456789012345@lid', '#excluir'));
    await bot.procesar(propio('123456789012345@lid', '#incluir'));
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 2);
    assert.ok(alGrupo.every((t) => /no mandó el número/.test(t) && /desde el grupo/.test(t)), alGrupo.join(' | '));
    assert.deepStrictEqual(state.numerosExcluidos(), []);
  });

  console.log('\nEl eco del grupo\n');

  await caso('ninguna confirmación empieza con un comando, y procesarlas como mensajes propios no cambia la lista', async () => {
    config.contactosPersonales = ['5490000000151'];
    await enGrupo('#excluir 5490000000152');
    await enGrupo('#excluir 5490000000152');
    await enGrupo('#incluir 5490000000153');
    await enGrupo('#incluir 5490000000151');
    await enGrupo('#excluir 123');
    await enGrupo('#excluir');
    await enGrupo('#excluidos');
    await bot.procesar(propio('123456789012345@lid', '#excluir'));
    const confirmaciones = [...alGrupo];
    assert.ok(confirmaciones.length >= 8, 'pocas confirmaciones: ' + confirmaciones.length);
    for (const t of confirmaciones) assert.strictEqual(comandoDe(t), null, 'empieza con un comando: ' + t.slice(0, 40));
    const lista = JSON.stringify(state.excluidos());
    alGrupo.length = 0;
    for (const t of confirmaciones) await enGrupo(t);
    assert.strictEqual(JSON.stringify(state.excluidos()), lista, 'el eco cambió la lista');
    assert.strictEqual(alGrupo.length, 0, 'el eco disparó respuestas');
  });

  console.log('\nTanda en vuelo\n');

  await caso('un #excluir durante la espera de la tanda frena la respuesta', async () => {
    const N = '5490000000161';
    config.ritmo.esperaMinMs = 150;
    config.ritmo.esperaMaxMs = 160;
    sonnet.guion(sonnet.responde(['hola!']));
    const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
    await dormir(40);
    await bot.procesar(propio(N, '#excluir'));
    await tanda;
    assert.strictEqual(aClientes.length, 0, 'le salió algo al cliente');
    assert.strictEqual(sonnet.pedidos.length, 0, 'le preguntó a Sonnet');
    assert.strictEqual(alGrupo.length, 1, alGrupo.join(' | '));
    assert.ok(/^🚫 Excluido/.test(alGrupo[0]));
  });

  await caso('un #excluir mientras Sonnet piensa frena la respuesta y no avisa nada más al grupo', async () => {
    const N = '5490000000162';
    const fetchReal = globalThis.fetch;
    globalThis.fetch = async (...a) => {
      await dormir(120);
      return fetchReal(...a);
    };
    try {
      sonnet.guion(sonnet.responde(['hola!']));
      const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
      await dormir(50);
      await enGrupo(`#excluir ${N}`);
      await tanda;
    } finally {
      globalThis.fetch = fetchReal;
    }
    assert.strictEqual(aClientes.length, 0, 'le salió algo al cliente');
    assert.strictEqual(alGrupo.length, 1, alGrupo.join(' | '));
  });

  console.log('\nPersistencia\n');

  await caso('sobrevive a un reinicio (otro proceso lo ve) y queda en el respaldo por hora', async () => {
    const N = '5490000000171';
    await enGrupo(`#excluir ${N}`);
    const ruta = path.resolve(__dirname, '..', 'src', 'evolution');
    const afuera = execFileSync(
      process.execPath,
      ['-e', `const e = require(${JSON.stringify(ruta)}); process.stdout.write(String(e.esContactoPersonal(${JSON.stringify(jid(N))})), () => process.exit(0));`],
      { cwd: p.TMP, env: { ...process.env }, encoding: 'utf8', timeout: 20000 }
    );
    assert.strictEqual(afuera.trim(), 'true', 'otro proceso no lo ve: ' + afuera);
    const dir = path.join(path.dirname(process.env.ESTADO_PATH), 'backups', 'estado');
    const respaldos = fs.readdirSync(dir).filter((n) => /^estado-.*\.json$/.test(n));
    assert.ok(respaldos.length, 'no hay respaldo por hora');
    assert.ok(respaldos.some((n) => fs.readFileSync(path.join(dir, n), 'utf8').includes(N)), 'el respaldo no tiene el número');
  });

  console.log('\nVentas\n');

  await caso('#vendido <número de un excluido> dice que está excluido, no que está en CONTACTOS_PERSONALES', async () => {
    await enGrupo('#excluir 5490000000181');
    await enGrupo('#vendido 5490000000181');
    assert.strictEqual(alGrupo.length, 2);
    assert.ok(/excluido/i.test(alGrupo[1]) && /#incluir 5490000000181/.test(alGrupo[1]), alGrupo[1]);
    assert.ok(!/CONTACTOS_PERSONALES/.test(alGrupo[1]), alGrupo[1]);
    config.contactosPersonales = ['5490000000182'];
    await enGrupo('#vendido 5490000000182');
    assert.ok(/CONTACTOS_PERSONALES/.test(alGrupo[2]), alGrupo[2]);
  });

  console.log('\nEl número tipeado en el grupo\n');

  await caso('un número tipeado: acepta las formas de siempre y lo lleva a 549 + 10 dígitos', () => {
    for (const t of ['5492994000000', '542994000000', '+54 9 299 400-0000', '0299 400-0000', '2994000000', 'https://wa.me/5492994000000']) {
      for (const tipo of ['excluir', 'incluir']) {
        const c = comandoDe(`#${tipo} ${t}`);
        assert.ok(c && !c.problema && c.numero === '5492994000000', `"#${tipo} ${t}" -> ${JSON.stringify(c)}`);
      }
    }
  });

  await caso('un número tipeado: rechaza el 15, el 0 sobrando, dígitos de más o de menos y los extranjeros', () => {
    // Las características argentinas empiezan con 11, 2 o 3: una parte local que empieza con 4 a 9 (un 9 o un 0
    // de más y un dígito de menos) tampoco es un número. El 0 no se puede rechazar: los números inventados de
    // las pruebas (549 0000…) dejan una parte local que empieza con 0.
    for (const t of ['0299 15 400-0000', '299 15 400-0000', '(0299) 154000000', '5492994000001 2', '2994000000 15', '4000-0123', '0000 0123', '+34 600 000 000', '15 2345 6789', '+54 9 15 2345 6789', '5 299 400 000', '4000 012 345', '+54 9 9 299 400 000']) {
      const c = comandoDe(`#excluir ${t}`);
      assert.ok(c && c.problema && c.numero === '', `"${t}" -> ${JSON.stringify(c)}`);
      assert.ok(/característica/.test(c.problema) && /2994000000/.test(c.problema) && /5492994000000/.test(c.problema), c.problema);
    }
  });

  await caso('un número tipeado mal desde el grupo no marca nada y contesta cómo escribirlo', async () => {
    await enGrupo('#excluir 0299 15 400-0000');
    await enGrupo('#excluir 5492994000001 2');
    await enGrupo('#excluir 0000 0123');
    assert.strictEqual(alGrupo.length, 3);
    assert.ok(alGrupo.every((t) => /^❓/.test(t) && /sin 0 ni 15/.test(t)), alGrupo.join(' | '));
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('un número tipeado con el 0 y sin el 54 queda guardado como 549 + 10 dígitos', async () => {
    await enGrupo('#excluir 0299 400-0000');
    assert.deepStrictEqual(state.numerosExcluidos(), ['5492994000000']);
    assert.ok(alGrupo[0].includes('💬 https://wa.me/5492994000000'), alGrupo[0]);
    assert.ok(p.evolution.esContactoPersonal(jid('5492994000000')));
  });

  await caso('sin ningún chat con ese número, el 🚫 y el ✅ del grupo dicen que verifiquen el link', async () => {
    const aviso = 'Todavía no hay ningún chat con ese número: verificá el link.';
    await enGrupo('#excluir 5492994000002');
    await enGrupo('#incluir 5492994000002');
    assert.ok(alGrupo[0].includes(aviso) && alGrupo[1].includes(aviso), alGrupo.join(' | '));
    alGrupo.length = 0;
    state.actualizar(jid('5492994000003'), { nombre: 'Marta' });
    await enGrupo('#excluir 5492994000003');
    await enGrupo('#incluir 5492994000003');
    assert.ok(!alGrupo[0].includes('Todavía no hay') && !alGrupo[1].includes('Todavía no hay'), alGrupo.join(' | '));
  });

  console.log('\nQué tocan #excluir y #incluir\n');

  await caso('#excluir y #incluir en un chat con historial no tocan el historial, el aprendizaje ni ultimoHumano', async () => {
    const N = '5490000000201';
    state.actualizar(jid(N), { nombre: 'Marta Pérez', ultimoHumano: 1234567 });
    state.agregarAlHistorial(jid(N), 'cliente', 'hola');
    state.agregarAlHistorial(jid(N), 'vendedor', 'buenas', { humano: true });
    const largo = state.todos()[jid(N)].historial.length;
    const eventos = p.eventos(N).length;
    await bot.procesar(propio(N, '#excluir'));
    await bot.procesar(propio(N, '#incluir'));
    assert.strictEqual(state.todos()[jid(N)].historial.length, largo);
    assert.strictEqual(p.eventos(N).length, eventos);
    assert.strictEqual(state.todos()[jid(N)].ultimoHumano, 1234567);
  });

  await caso('#excluir en el chat sin nombre en el estado nunca usa el pushName de la cuenta', async () => {
    const N = '5490000000202';
    await bot.procesar(propio(N, '#excluir', { pushName: 'Somos Piedra' }));
    await bot.procesar(propio(N, '#incluir', { pushName: 'Somos Piedra' }));
    assert.strictEqual(alGrupo.length, 2);
    assert.ok(alGrupo.every((t) => !t.includes('Somos Piedra')), alGrupo.join(' | '));
  });

  await caso('si tenía un #recordar activo, el 🚫 avisa que no suena mientras esté excluido', async () => {
    const N = '5490000000203';
    state.actualizar(jid(N), { nombre: 'Marta Pérez' });
    await bot.procesar(propio(N, '#recordar mandarle la foto'));
    assert.ok(state.recordatorios()[jid(N)], 'no quedó el recordatorio');
    alGrupo.length = 0;
    await enGrupo(`#excluir ${N}`);
    assert.ok(alGrupo[0].includes('Tenía un #recordar: no suena mientras esté excluido.'), alGrupo[0]);
    assert.strictEqual(comandoDe(alGrupo[0]), null);
    await enGrupo('#incluir ' + N);
    await enGrupo('#excluir 5490000000204');
    assert.ok(!alGrupo[2].includes('Tenía un #recordar'), alGrupo[2]);
    state.borrarRecordatorio(jid(N));
  });

  await caso('#excluidos lee la lista sin arreglarla: excluidos.js nunca llama a state.excluidos()', async () => {
    const original = state.excluidos;
    let llamadas = 0;
    state.excluidos = () => {
      llamadas++;
      return original();
    };
    try {
      await enGrupo('#excluir 5490000000205');
      await enGrupo('#excluir 540000000205');
      await enGrupo('#excluidos');
      await enGrupo('#incluir 5490000000205');
    } finally {
      state.excluidos = original;
    }
    assert.strictEqual(llamadas, 0, 'usó state.excluidos(), que arregla la lista');
    assert.ok(alGrupo[2].includes('5490000000205'), alGrupo[2]);
  });

  await caso('/salud y el arranque dicen cuántos hay y nunca cuáles', async () => {
    await enGrupo('#excluir 5490000000206');
    await enGrupo('#excluir 5490000000207');
    const salud = await bot.datosDeSalud();
    assert.strictEqual(salud.excluidos, 2);
    assert.ok(!JSON.stringify(salud).includes('0000000206') && !JSON.stringify(salud).includes('0000000207'), 'la salud muestra los números');
    const original = console.log;
    const lineas = [];
    console.log = (...a) => lineas.push(a.join(' '));
    try {
      bot.anunciarModo();
    } finally {
      console.log = original;
    }
    const linea = lineas.find((l) => /EXCLUIDOS/.test(l));
    assert.ok(linea && /2 numeros/.test(linea), 'falta la línea de EXCLUIDOS: ' + linea);
    assert.ok(!lineas.join('\n').includes('0000000206') && !lineas.join('\n').includes('0000000207'), 'el arranque muestra los números');
  });

  await caso('la ayuda nombra #excluidos, también la que contesta un número mal tipeado', async () => {
    assert.ok(excluidos.COMO_SE_USA.includes('#excluidos'));
    await enGrupo('#excluir 123');
    assert.ok(alGrupo[0].includes('#excluidos'), alGrupo[0]);
  });

  console.log('\nQué pasa con lo que quedó sin contestar\n');

  /** Un chat con una persona que atendió y una pregunta del cliente sin contestar, ya con el silencio vencido. */
  function chatConPreguntaVieja(N) {
    const ahora = Date.now();
    const id = jid(N);
    state.actualizar(id, { nombre: 'Marta Pérez', ultimoHumano: ahora - 100 * 60 * 1000 });
    state.agregarAlHistorial(id, 'vendedor', 'dale, te atiendo yo', { humano: true });
    state.agregarAlHistorial(id, 'cliente', 'cuanto sale el m2 de laja?');
    const h = state.todos()[id].historial;
    h[h.length - 2].ts = ahora - 100 * 60 * 1000;
    h[h.length - 1].ts = ahora - 90 * 60 * 1000;
    return id;
  }

  await caso('control positivo: sin #excluir/#incluir el barrido del silencio toma la pregunta vieja', async () => {
    const id = chatConPreguntaVieja('5490000000211');
    sonnet.guion(sonnet.responde(['hola, te cuento']));
    const tomados = await bot.revisarSilencios();
    assert.deepStrictEqual(tomados, [id]);
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['hola, te cuento']);
  });

  await caso('#excluir + #incluir con una pregunta vieja sin contestar: el barrido no se la contesta después', async () => {
    const id = chatConPreguntaVieja('5490000000212');
    await enGrupo('#excluir 5490000000212');
    await bot.procesar(propio('5490000000212', 'le contesto yo'));
    await enGrupo('#incluir 5490000000212');
    sonnet.guion(sonnet.responde(['hola, te cuento']));
    assert.deepStrictEqual(await bot.revisarSilencios(), []);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.ok(state.todos()[id].silencioAtendido > 0);
  });

  await caso('solo #excluir (sin #incluir) también marca la pregunta como atendida', async () => {
    const id = chatConPreguntaVieja('5490000000213');
    await enGrupo('#excluir 5490000000213');
    assert.ok(state.todos()[id].silencioAtendido >= state.todos()[id].historial.slice(-1)[0].ts);
  });

  await caso('#excluir / #incluir de un número sin chat no le crea un chat', async () => {
    const N = '5490000000214';
    await enGrupo(`#excluir ${N}`);
    await enGrupo(`#incluir ${N}`);
    assert.ok(!state.todos()[jid(N)]);
  });

  await caso('el #excluir durante la espera de la tanda queda en el registro como silencio "excluido"', async () => {
    const N = '5490000000215';
    config.ritmo.esperaMinMs = 150;
    config.ritmo.esperaMaxMs = 160;
    sonnet.guion(sonnet.responde(['hola!']));
    const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
    await dormir(40);
    await enGrupo(`#excluir ${N}`);
    await tanda;
    const silencios = p.eventos(N, 'silencio').filter((e) => e.motivo === 'excluido');
    assert.strictEqual(silencios.length, 1, JSON.stringify(p.eventos(N, 'silencio')));
    assert.strictEqual(silencios[0].lineas.length, 1);
  });

  console.log('\nCada freno de la tanda en vuelo, por separado\n');

  /** Corre `fn` con console.log capturado y devuelve las líneas. */
  async function conLog(fn) {
    const original = console.log;
    const lineas = [];
    console.log = (...a) => lineas.push(a.join(' '));
    try {
      await fn();
    } finally {
      console.log = original;
    }
    return lineas;
  }
  /** Un fetch (el de Sonnet) que tarda `ms`. */
  async function conFetchLento(ms, fn) {
    const real = globalThis.fetch;
    globalThis.fetch = async (...a) => {
      await dormir(ms);
      return real(...a);
    };
    try {
      await fn();
    } finally {
      globalThis.fetch = real;
    }
  }

  // (d) vaciar las pendientes en confirmarExcluidos: la tanda ni arranca.
  await caso('freno (d): el #excluir vacía la tanda que espera, que ni llega a atenderTanda', async () => {
    const N = '5490000000221';
    config.ritmo.esperaMinMs = 150;
    config.ritmo.esperaMaxMs = 160;
    sonnet.guion(sonnet.responde(['hola!']));
    const lineas = await conLog(async () => {
      const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
      await dormir(40);
      await enGrupo(`#excluir ${N}`);
      await tanda;
    });
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.ok(!lineas.some((l) => /lo excluyeron mientras esperaba/.test(l)), 'la tanda llegó a atenderTanda');
    assert.strictEqual(p.eventos(N, 'silencio').filter((e) => e.motivo === 'excluido').length, 1);
  });

  // (a) el chequeo al empezar atenderTanda: la exclusión que no pasa por confirmarExcluidos.
  await caso('freno (a): al empezar atenderTanda, un excluido (aunque no se haya vaciado la cola) no llega a Sonnet', async () => {
    const N = '5490000000222';
    config.ritmo.esperaMinMs = 150;
    config.ritmo.esperaMaxMs = 160;
    sonnet.guion(sonnet.responde(['hola!']));
    const lineas = await conLog(async () => {
      const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
      await dormir(40);
      state.guardarExcluido(N, { desde: Date.now(), nombre: null, origen: 'grupo' });
      await tanda;
    });
    assert.strictEqual(sonnet.pedidos.length, 0, 'le preguntó a Sonnet');
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 0);
    assert.ok(lineas.some((l) => /lo excluyeron mientras esperaba/.test(l)));
    assert.strictEqual(p.eventos(N, 'silencio').filter((e) => e.motivo === 'excluido').length, 1);
  });

  // (b) el chequeo de después de Sonnet.
  await caso('freno (b): Sonnet escala y el #excluir llega mientras piensa -> ni 🔕 ni nada al grupo', async () => {
    const N = '5490000000223';
    sonnet.guion(sonnet.escala('no se que pide'));
    await conFetchLento(120, async () => {
      const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
      await dormir(50);
      await enGrupo(`#excluir ${N}`);
      await tanda;
    });
    assert.strictEqual(sonnet.pedidos.length, 1);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1, alGrupo.join(' | '));
    assert.ok(/^🚫/.test(alGrupo[0]));
    assert.ok(!(state.todos()[jid(N)] || {}).escalado, 'quedó escalado');
  });

  await caso('freno (b): en borrador, el #excluir mientras Sonnet piensa no manda el 🔔 LEAD', async () => {
    const N = '5490000000224';
    const borrador = config.modoBorrador;
    config.modoBorrador = true;
    try {
      sonnet.guion(sonnet.responde(['hola!']));
      await conFetchLento(120, async () => {
        const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
        await dormir(50);
        await enGrupo(`#excluir ${N}`);
        await tanda;
      });
    } finally {
      config.modoBorrador = borrador;
    }
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1, alGrupo.join(' | '));
    assert.ok(/^🚫/.test(alGrupo[0]));
  });

  // (c) motivoDeCorte: antes de cada envío.
  await caso('freno (c): un #excluir después del primer envío corta lo que falta', async () => {
    const N = '5490000000225';
    config.ritmo.entreMensajesMs = 80;
    sonnet.guion(sonnet.responde(['uno', 'dos', 'tres']));
    const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
    assert.ok(await p.esperar(() => aClientes.length === 1), 'no salió el primero');
    await enGrupo(`#excluir ${N}`);
    await tanda;
    assert.deepStrictEqual(aClientes.map((m) => m.texto), ['uno']);
    assert.strictEqual(p.eventos(N, 'silencio').filter((e) => e.motivo === 'excluido').length, 1);
  });

  // (e) contestarConSonnet: después de completar el contexto y antes de pensar.
  await caso('freno (e): un #excluir mientras se completa el contexto no llega a Sonnet', async () => {
    const N = '5490000000226';
    const buscar = p.evolution.buscarMensajesDeChat;
    p.evolution.buscarMensajesDeChat = async () => {
      await dormir(150);
      return [];
    };
    try {
      sonnet.guion(sonnet.responde(['hola!']));
      const tanda = bot.procesar(mensaje(N, 'hola, tienen laja?'));
      await dormir(60);
      await enGrupo(`#excluir ${N}`);
      await tanda;
    } finally {
      p.evolution.buscarMensajesDeChat = buscar;
    }
    assert.strictEqual(sonnet.pedidos.length, 0, 'le preguntó a Sonnet');
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1, alGrupo.join(' | '));
  });

  // (f) sombra-persona.pensar: los dos chequeos.
  /** Una persona atiende, el cliente escribe (queda la sombra programada) y se excluye `excluirA` ms después. */
  async function sombraConExclusion(N, { contextoLento = 0, excluirA }) {
    const hasta = config.cerebro.sombraPersonaHasta;
    const buscar = p.evolution.buscarMensajesDeChat;
    let busquedas = 0;
    config.cerebro.sombraPersonaHasta = '2099-12-31';
    config.ritmo.esperaMinMs = 100;
    config.ritmo.esperaMaxMs = 101;
    p.evolution.buscarMensajesDeChat = async () => {
      busquedas++;
      if (contextoLento) await dormir(contextoLento);
      return [];
    };
    sonnet.guion(sonnet.responde(['hola!']));
    try {
      await bot.procesar(propio(N, 'dale, te atiendo yo'));
      await bot.procesar(mensaje(N, 'cuanto sale el m2?'));
      await dormir(excluirA);
      await enGrupo(`#excluir ${N}`);
      await dormir(100 + contextoLento + 120);
    } finally {
      config.cerebro.sombraPersonaHasta = hasta;
      p.evolution.buscarMensajesDeChat = buscar;
      require('../src/sombra-persona').reiniciar();
    }
    return busquedas;
  }

  await caso('freno (f1): un #excluir con la sombra programada no completa el contexto ni piensa', async () => {
    const N = '5490000000227';
    const busquedas = await sombraConExclusion(N, { excluirA: 30 });
    assert.strictEqual(sonnet.pedidos.length, 0, 'la sombra le preguntó a Sonnet');
    assert.strictEqual(busquedas, 0, 'completó el contexto de un excluido');
    assert.strictEqual(p.eventos(N, 'propuesta-sonnet').length, 0);
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('freno (f2): un #excluir mientras la sombra completa el contexto no llega a Sonnet', async () => {
    const N = '5490000000228';
    await sombraConExclusion(N, { contextoLento: 150, excluirA: 160 });
    assert.strictEqual(sonnet.pedidos.length, 0, 'la sombra le preguntó a Sonnet');
    assert.strictEqual(p.eventos(N, 'propuesta-sonnet').length, 0);
    assert.strictEqual(aClientes.length, 0);
  });

  console.log('\nComandos en el chat de un excluido\n');

  const comandosEnChat = ['#vendido', '#perdido', '#recordar algo', '#hecho', '#pausa', '#sigue', '#reset'];

  await caso('#vendido, #perdido, #recordar, #hecho, #pausa, #sigue y #reset en el chat de un excluido: un ❓ y nada más', async () => {
    const N = '5490000000231';
    state.actualizar(jid(N), { nombre: 'Marta Pérez', ultimoMensajeCliente: 'hola' });
    await enGrupo(`#excluir ${N}`);
    alGrupo.length = 0;
    const antes = JSON.stringify(state.todos()[jid(N)]);
    for (const c of comandosEnChat) await bot.procesar(propio(N, c));
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, comandosEnChat.length, alGrupo.join(' | '));
    comandosEnChat.forEach((c, i) => {
      const nombre = c.split(' ')[0];
      assert.ok(alGrupo[i].startsWith(`❓ ${nombre} en el chat de Marta Pérez: está excluido (#excluir), así que no hice nada. Para volver a atenderlo: #incluir`), alGrupo[i]);
      assert.strictEqual(comandoDe(alGrupo[i]), null);
    });
    assert.strictEqual(JSON.stringify(state.todos()[jid(N)]), antes, 'cambió el chat');
    assert.deepStrictEqual(Object.keys(state.recordatorios()).filter((k) => k === jid(N)), []);
    assert.deepStrictEqual(state.numerosExcluidos(), [N]);
  });

  await caso('los mismos comandos en un chat de CONTACTOS_PERSONALES (.env) quedan en silencio', async () => {
    const N = '5490000000232';
    config.contactosPersonales = [N];
    for (const c of comandosEnChat) await bot.procesar(propio(N, c));
    assert.strictEqual(alGrupo.length, 0, alGrupo.join(' | '));
    assert.strictEqual(aClientes.length, 0);
  });

  await caso('un comando en el chat de un excluido sin nombre usa el número; uno viejo o a mitad de texto no avisa', async () => {
    const N = '5490000000233';
    await enGrupo(`#excluir ${N}`);
    alGrupo.length = 0;
    await bot.procesar(propio(N, '#vendido'));
    assert.ok(alGrupo[0].startsWith(`❓ #vendido en el chat de ${N}:`), alGrupo[0]);
    alGrupo.length = 0;
    await bot.procesar(propio(N, '#vendido', { ts: Date.now() - 60 * 60 * 1000 }));
    await bot.procesar(propio(N, 'ojo #vendido'));
    await bot.procesar(mensaje(N, '#vendido'));
    assert.strictEqual(alGrupo.length, 0, alGrupo.join(' | '));
  });

  console.log('\nSegunda vuelta de arreglos\n');

  await caso('un 15 sin característica se rechaza; Buenos Aires (11…) se acepta', () => {
    for (const t of ['11 2345 6789', '5491123456789', '+54 9 11 2345 6789', '011 2345 6789']) {
      const c = comandoDe(`#excluir ${t}`);
      assert.ok(c && !c.problema && c.numero === '5491123456789', `"${t}" -> ${JSON.stringify(c)}`);
    }
  });

  await caso('#incluir de un extranjero excluido desde su chat: el que sugiere el 🚫 funciona', async () => {
    const N = '34600000001';
    await bot.procesar(propio(N, '#excluir'));
    assert.deepStrictEqual(state.numerosExcluidos(), [N]);
    assert.ok(alGrupo[0].includes(`#incluir ${N}`), alGrupo[0]);
    assert.ok(p.evolution.esContactoPersonal(jid(N)));
    alGrupo.length = 0;
    await enGrupo(`#incluir ${N}`);
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/^✅ Incluido/.test(alGrupo[0]), alGrupo[0]);
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.strictEqual(p.evolution.esContactoPersonal(jid(N)), false);
  });

  await caso('#incluir de un extranjero que NO está guardado sigue dando el ❓ de cómo escribirlo; #excluir <extranjero> también', async () => {
    await bot.procesar(propio('34600000001', '#excluir'));
    alGrupo.length = 0;
    await enGrupo('#incluir 34600000002');
    await enGrupo('#excluir 34600000002');
    // El camino de los dígitos crudos es solo para #incluir y solo EXACTO: #excluir del extranjero guardado no
    // lo incluye, y su número cortado no lo saca por sufijo.
    await enGrupo('#excluir 34600000001');
    await enGrupo('#incluir 600000001');
    assert.strictEqual(alGrupo.length, 4);
    assert.ok(alGrupo.every((t) => /^❓/.test(t) && /sin 0 ni 15/.test(t)), alGrupo.join(' | '));
    assert.deepStrictEqual(state.numerosExcluidos(), ['34600000001']);
  });

  await caso('el #incluir solo (sin el #excluir por comando) da por atendida la pregunta vieja', async () => {
    const N = '5490000000241';
    const id = chatConPreguntaVieja(N);
    // Excluido sin pasar por confirmarExcluidos: el único que marca la pregunta como atendida es el #incluir.
    state.guardarExcluido(N, { desde: Date.now(), nombre: null, origen: 'grupo' });
    assert.ok(!(state.todos()[id].silencioAtendido > 0), 'ya estaba atendida');
    sonnet.guion(sonnet.responde(['hola, te cuento']));
    await enGrupo(`#incluir ${N}`);
    assert.deepStrictEqual(state.numerosExcluidos(), []);
    assert.deepStrictEqual(await bot.revisarSilencios(), []);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(sonnet.pedidos.length, 0);
  });

  await caso('el aviso "Todavía no hay ningún chat" sale solo desde el grupo: #excluir en el chat de un número sin chat no lo trae', async () => {
    await bot.procesar(propio('5490000000242', '#excluir'));
    assert.strictEqual(alGrupo.length, 1);
    assert.ok(/^🚫 Excluido/.test(alGrupo[0]), alGrupo[0]);
    assert.ok(!alGrupo[0].includes('Todavía no hay'), alGrupo[0]);
    await bot.procesar(propio('5490000000242', '#incluir'));
    assert.ok(!alGrupo[1].includes('Todavía no hay'), alGrupo[1]);
  });

  /** Un audio que tarda `ms` en transcribirse (audio.transcribir parcheado, restaurado al final). */
  async function conTranscripcionLenta(ms, fn) {
    const audio = require('../src/audio');
    const real = audio.transcribir;
    audio.transcribir = async () => {
      await dormir(ms);
      return { ok: true, texto: 'hola, tienen granza?' };
    };
    try {
      await fn();
    } finally {
      audio.transcribir = real;
    }
  }
  /** Un cliente manda un audio, a los 100 ms se corta con `cortar()` y se espera que la tanda termine. */
  async function audioYCorte(N, modo, cortar) {
    const anterior = config.cerebro.modo;
    config.cerebro.modo = modo;
    config.ritmo.esperaMinMs = 20;
    config.ritmo.esperaMaxMs = 21;
    try {
      await conTranscripcionLenta(250, async () => {
        sonnet.guion(sonnet.responde(['hola!']));
        const tanda = bot.procesar(mensaje(N, '', { message: { audioMessage: { seconds: 3 } } }));
        await dormir(100);
        await cortar();
        await tanda;
        await dormir(80);
      });
    } finally {
      config.cerebro.modo = anterior;
    }
  }
  const unSoloSilencioExcluido = (N) => {
    const todos = p.eventos(N, 'silencio');
    assert.strictEqual(todos.length, 1, JSON.stringify(todos));
    assert.strictEqual(todos[0].motivo, 'excluido');
    assert.strictEqual(todos[0].lineas.length, 1);
  };

  await caso('freno (g) sombra: un #excluir mientras se transcribe el audio no llega a pensarEnSombra', async () => {
    const N = '5490000000251';
    await audioYCorte(N, 'sombra', () => enGrupo(`#excluir ${N}`));
    assert.strictEqual(sonnet.pedidos.length, 0, 'la sombra le preguntó a Sonnet');
    assert.strictEqual(p.eventos(N, 'propuesta-sonnet').length, 0);
    assert.strictEqual(aClientes.length, 0);
    unSoloSilencioExcluido(N);
  });

  await caso('freno (g) todos: un #excluir mientras se transcribe el audio anota UN solo silencio por la línea', async () => {
    const N = '5490000000252';
    await audioYCorte(N, 'todos', () => enGrupo(`#excluir ${N}`));
    assert.strictEqual(sonnet.pedidos.length, 0);
    assert.strictEqual(aClientes.length, 0);
    assert.strictEqual(alGrupo.length, 1, alGrupo.join(' | '));
    unSoloSilencioExcluido(N);
  });

  await caso('freno (g) sin confirmarExcluidos: excluido directo en el estado durante la transcripción, un silencio y la cola vacía', async () => {
    const N = '5490000000253';
    await audioYCorte(N, 'sombra', async () => state.guardarExcluido(N, { desde: Date.now(), nombre: null, origen: 'grupo' }));
    assert.strictEqual(sonnet.pedidos.length, 0, 'la sombra le preguntó a Sonnet');
    assert.strictEqual(p.eventos(N, 'propuesta-sonnet').length, 0);
    assert.strictEqual(aClientes.length, 0);
    unSoloSilencioExcluido(N);
  });

  p.fin();
})();
