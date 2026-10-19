'use strict';
/**
 * Chequeo del resumen de la mañana: cuándo toca mandarlo y cómo se recuerda
 * que ya salió.
 *
 * No prueba el CONTENIDO del resumen (eso se mira a ojo con `npm run resumen`),
 * sino las tres reglas que antes estaban mal:
 *   1. si el bot no estuvo levantado a la hora, el día se recupera;
 *   2. la marca de "ya salió" sobrevive a un reinicio;
 *   3. un envío fallido se reintenta.
 *
 * Apunta ESTADO_PATH a un archivo temporal: no toca el estado real del bot.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const TMP = path.join(os.tmpdir(), `estado-prueba-resumen-${process.pid}.json`);
process.env.ESTADO_PATH = TMP;
// Las listas no se heredan del .env: el resumen filtra contactos personales y
// números de prueba (Ajustes 1).
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_TESTER = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';

const state = require('../src/state');
const { toca, armar, esComercial, esTelefono, partir } = require('../src/resumen');

let fallos = 0;
function check(nombre, fn) {
  try {
    fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  }
}

// Viernes 11 de septiembre de 2026, a la hora que se pida.
const alas = (h, m = 5) => new Date(2026, 8, 11, h, m);
const HOY = alas(9).toDateString();
const AYER = new Date(2026, 8, 10).toDateString();
const HORA = 9;

console.log('\nCuándo toca mandarlo\n');

check('a las 9:05, si todavía no salió, toca', () => {
  assert.strictEqual(toca(alas(9), HORA, ''), true);
});

check('a las 8:55 no toca: todavía no es la hora', () => {
  assert.strictEqual(toca(alas(8, 55), HORA, ''), false);
});

check('si ya salió hoy, no vuelve a tocar', () => {
  assert.strictEqual(toca(alas(9, 40), HORA, HOY), false);
});

check('RECUPERACIÓN: la PC estuvo apagada y arranca 14:05, igual toca', () => {
  assert.strictEqual(toca(alas(14), HORA, ''), true);
});

check('RECUPERACIÓN: sigue tocando a las 23 si en todo el día no salió', () => {
  assert.strictEqual(toca(alas(23), HORA, ''), true);
});

check('si el último que salió fue el de ayer, hoy vuelve a tocar', () => {
  assert.strictEqual(toca(alas(9), HORA, AYER), true);
});

check('recuperado a las 14, a las 15 ya no vuelve a tocar', () => {
  assert.strictEqual(toca(alas(15), HORA, HOY), false);
});

console.log('\nCómo se recuerda que ya salió\n');

check('arranca sin ningún día marcado', () => {
  assert.strictEqual(state.resumenEnviadoDe(), '');
});

check('marcar el día y volver a leerlo', () => {
  state.marcarResumenEnviado(HOY);
  assert.strictEqual(state.resumenEnviadoDe(), HOY);
});

check('la marca queda en disco, así un reinicio no lo manda dos veces', () => {
  const enDisco = JSON.parse(fs.readFileSync(TMP, 'utf8'));
  assert.ok(enDisco['bot:interno'], 'falta la clave interna en el archivo');
  assert.strictEqual(enDisco['bot:interno'].resumenDe, HOY);
});

check('todos() no expone la clave interna a los barridos de chats', () => {
  assert.ok(!Object.keys(state.todos()).includes('bot:interno'));
});

check('con el día ya marcado, toca() dice que no', () => {
  assert.strictEqual(toca(alas(9, 50), HORA, state.resumenEnviadoDe()), false);
});

console.log('\nQué chats entran\n');

const comercial = (extra) => ({ historial: [{ quien: 'cliente', texto: 'x', ts: Date.now() }], ...extra });

check('un chat sin ninguna señal comercial no es comercial', () => {
  assert.strictEqual(esComercial({}), false);
  assert.strictEqual(esComercial({ nombre: 'Alguien', historial: [] }), false);
});

check('timing o zona SOLOS no alcanzan: aparecen en cualquier charla', () => {
  assert.strictEqual(esComercial({ timing: 'hoy' }), false);
  assert.strictEqual(esComercial({ zona: 'centro' }), false);
  assert.strictEqual(esComercial({ timing: 'mañana', zona: 'centro' }), false);
});

check('alcanza con una sola señal fuerte: no perdemos leads', () => {
  for (const senal of [
    { modelo: '13' },
    { entrega: 200000 },
    { presupuestoAnotado: 150000 },
    { cotizadoDe: 'iPhone 13' },
    { forma_pago: 'cuotas' },
    { escalado: true },
    { permuta: { modelo: '12' } },
    { modelosPedidos: ['13'] },
  ]) {
    assert.strictEqual(esComercial(senal), true, 'no reconoció ' + JSON.stringify(senal));
  }
});

check('el resumen deja afuera los chats personales', () => {
  const partes = armar(
    {
      '5491100000001@s.whatsapp.net': comercial({ modelo: 'iPhone 13' }),
      '5491100000002@s.whatsapp.net': comercial({}), // solo charla
    },
    3
  );
  const texto = partes.join('\n');
  assert.ok(/1 chat para mirar/.test(texto), 'tendría que quedar uno solo: ' + texto.slice(0, 80));
  assert.ok(!/0000002/.test(texto), 'dejó entrar un chat sin señal comercial');
});

console.log('\nLinks y formato\n');

// Hasta Ajustes 1 (16/09/2026) salía marcado "sin link"; desde entonces un chat
// sin número no es un cliente y no sale en ningún bloque (ver test/turnos.test.js).
check('un JID que no es un número no genera link wa.me ni sale en el resumen', () => {
  assert.strictEqual(esTelefono('gemini-check@s.whatsapp.net'), false);
  assert.strictEqual(esTelefono('5491100000001@s.whatsapp.net'), true);

  const partes = armar(
    { 'gemini-check@s.whatsapp.net': comercial({ modelo: 'iPhone 15' }) },
    3
  );
  const texto = partes.join('\n');
  assert.ok(!/wa\.me/.test(texto), 'armó un link con un JID que no es un teléfono');
  assert.ok(!/gemini-check/.test(texto), 'un chat sin número sale en el resumen');
  assert.ok(/No hay nada pendiente/.test(texto), 'lo contó como pendiente');
});

check('cada lead va numerado y separado por una barra', () => {
  const chats = {};
  for (let i = 0; i < 3; i++) {
    chats['54911000000' + i + '@s.whatsapp.net'] = comercial({ modelo: 'iPhone 13' });
  }
  const texto = armar(chats, 3).join('\n');
  assert.ok(/^1\) /m.test(texto) && /^2\) /m.test(texto) && /^3\) /m.test(texto), 'faltan números');
  assert.ok((texto.match(/━/g) || []).length > 0, 'no hay barras separadoras');
});

check('SIN TOPE: con 30 chats salen los 30, ninguno se recorta', () => {
  const chats = {};
  for (let i = 0; i < 30; i++) {
    chats['5491100' + String(i).padStart(5, '0') + '@s.whatsapp.net'] = comercial({
      modelo: 'iPhone 13',
      entrega: 200000,
    });
  }
  const texto = armar(chats, 3).join('\n');
  const leads = texto.match(/^\d+\) /gm) || [];
  assert.strictEqual(leads.length, 30, 'salieron ' + leads.length + ' de 30');
  assert.ok(!/más$/m.test(texto), 'todavía recorta con un "…y N más"');
});

check('si no entra en un mensaje se parte en varios numerados, sin perder ninguno', () => {
  const chats = {};
  for (let i = 0; i < 30; i++) {
    chats['5491100' + String(i).padStart(5, '0') + '@s.whatsapp.net'] = comercial({
      modelo: 'iPhone 13',
      entrega: 200000,
    });
  }
  const partes = armar(chats, 3);
  assert.ok(partes.length > 1, 'con 30 leads tendría que haberse partido');
  partes.forEach((p, i) => {
    assert.ok(
      p.startsWith('(' + (i + 1) + '/' + partes.length + ')'),
      'la parte ' + (i + 1) + ' no está numerada: ' + p.slice(0, 20)
    );
  });
  // La numeración de leads es continua entre partes y no se repite
  const leads = partes.join('\n').match(/^(\d+)\) /gm).map((x) => parseInt(x, 10));
  assert.deepStrictEqual(leads, Array.from({ length: 30 }, (_, i) => i + 1));
});

check('partir() nunca corta un bloque por la mitad', () => {
  const bloques = ['a'.repeat(100), 'b'.repeat(100), 'c'.repeat(100)];
  const partes = partir(bloques, 250);
  assert.ok(partes.length > 1, 'tendría que haber partido');
  for (const b of bloques) {
    assert.ok(partes.some((p) => p.includes(b)), 'se perdió o se cortó un bloque');
  }
});

check('sin nada pendiente devuelve un solo mensaje, no un array vacío', () => {
  const partes = armar({}, 3);
  assert.strictEqual(partes.length, 1);
  assert.ok(/No hay nada pendiente/.test(partes[0]));
});

try {
  fs.unlinkSync(TMP);
} catch {
  /* si no está, mejor */
}

console.log(fallos === 0 ? '\nTodo OK\n' : `\n${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
