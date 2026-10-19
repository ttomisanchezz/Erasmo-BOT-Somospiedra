'use strict';
/**
 * El resumen de la mañana con los turnos de ayer (Ajustes 1, decisión de Tomás
 * del 16/09/2026).
 *
 *   node test/turnos.test.js
 *
 * Las ventas se hacen en persona y nadie anota #vendido: el resumen decía
 * "💰 0 vendidos" todos los días. Ahora arriba de todo lista los chats con un
 * turno de ayer, como guía (no son ventas confirmadas):
 *  - un mensaje de AYER, del vendedor o del cliente, con señal de encuentro para
 *    ese día ("nos vemos hoy", "te esperamos", "estamos afuera", "ya llegue",
 *    "te paso el alias", "hoy a las 18", "te anoto para las 16");
 *  - o un mensaje de ANTEAYER que fija el turno para el día siguiente ("nos vemos
 *    mañana", "te anoto para mañana", "mañana a las 17").
 * Los vendidos y perdidos salen solo si alguien los anotó ese día, y los chats de
 * prueba (NUMEROS_PRUEBA o sin número en el JID) no salen en ningún bloque.
 *
 * Estado inventado en memoria, números inventados. El entorno se fija acá y no
 * se hereda del .env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const PRUEBA = '5490000000999';
process.env.NUMEROS_TESTER = PRUEBA;
process.env.NUMEROS_PRUEBA = '';
process.env.NUMEROS_PILOTO = '';
process.env.CONTACTOS_PERSONALES = '';
process.env.ESTADO_PATH = path.join(os.tmpdir(), 'estado-turnos-' + process.pid + '.json');
process.env.APRENDIZAJE_PATH = path.join(os.tmpdir(), 'apr-turnos-' + process.pid + '.jsonl');

const resumen = require('../src/resumen');

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

// Miércoles 16 de septiembre de 2026 a las 9:05: "ayer" es el martes 15 y
// "anteayer" el lunes 14.
const HOY = new Date(2026, 8, 16, 9, 5);
const el = (dia, h, m = 0) => new Date(2026, 8, dia, h, m).getTime();
const jid = (n) => `549000000${String(n).padStart(4, '0')}@s.whatsapp.net`;
const chat = (nombre, lineas, extra = {}) => ({
  nombre,
  modelo: 'iPhone 14 Pro',
  historial: lineas.map(([quien, texto, ts]) => ({ quien, texto, ts })),
  ...extra,
});
const bloqueTurnos = (texto) => (texto.split('📅')[1] || '').split(/\n\n/)[0];

console.log('\nQué cuenta como turno\n');

check('señales para el mismo día', () => {
  for (const t of [
    'nos vemos hoy',
    'Dale, nos vemos hoy!',
    'te esperamos adentro',
    'dalee nosotros estamos aca te espero!',
    'Estamos afuera !!!!',
    'estoy afuera',
    'Afuera',
    'avisame cuando estes afuera',
    'ya llegué amigo',
    'ya estoy',
    'Yo ya estoy aca!',
    'ahi te paso el alias',
    'pasame el alias',
    'hoy a las 18 puedo',
    'te anoto para las 16',
    'dale te dejo anotado para las 17hs',
  ]) {
    assert.strictEqual(resumen.senalDeTurno(t), 'hoy', 'no la tomó para el mismo día: ' + t);
  }
});

check('señales para el día siguiente', () => {
  for (const t of ['nos vemos mañana', 'te anoto para mañana a las 17', 'sii anotado para mañana a las 19hs', 'mañana a las 10 te espero', 'te espero mañana a la tarde']) {
    assert.strictEqual(resumen.senalDeTurno(t), 'manana', 'no la tomó para el día siguiente: ' + t);
  }
});

check('lo que no es un turno', () => {
  for (const t of [
    'tenes el 13?',
    'sii tenemos iPhone 13 128GB 100%, igualmente tenemos del 11 al 18 Pro Max',
    'nos manejamos con turnos para la atencion al cliente',
    'dale, que dia te podes acercar?',
    'avisame cuando llegue el equipo',
    'te dejo el alias para la cuota',
    'te paso el alias para la cuota de este mes',
    'ya estas anotada para las 17hs del sabado',
    'te estoy esperando la respuesta',
    'cuando quieras te esperamos por el local',
    'pasado mañana nos vemos',
    'nos vemos',
  ]) {
    assert.strictEqual(resumen.senalDeTurno(t), null, 'lo tomó como turno: ' + t);
  }
  // "a la mañana" es una franja: "te espero a la mañana" es para hoy, no para mañana.
  assert.strictEqual(resumen.senalDeTurno('te espero a la mañana'), 'hoy');
});

console.log('\nEl bloque de turnos de ayer\n');

const TODOS = {
  // 1. "nos vemos hoy" ayer → aparece
  [jid(1)]: chat('Ana', [
    ['cliente', 'dale, puedo pasar a las 18?', el(15, 10)],
    ['vendedor', 'sii nos vemos hoy', el(15, 10, 5)],
  ]),
  // 2. "nos vemos mañana" anteayer → aparece (el turno era ayer)
  [jid(2)]: chat('Beto', [
    ['cliente', 'mañana a la tarde puedo', el(14, 19)],
    ['vendedor', 'perfecto, nos vemos mañana', el(14, 19, 2)],
  ]),
  // 3. "nos vemos mañana" ayer → no aparece (es para hoy)
  [jid(3)]: chat('Caro', [
    ['cliente', 'mañana puedo a la tarde', el(15, 20)],
    ['vendedor', 'dale nos vemos mañana', el(15, 20, 1)],
  ]),
  // 4. charla de ayer sin turno → no aparece
  [jid(4)]: chat('Dani', [
    ['cliente', 'tenes el 14 pro?', el(15, 11)],
    ['vendedor', 'sii tenemos iPhone 14 Pro 128GB 100%', el(15, 11, 1)],
  ]),
  // 5. un número de NUMEROS_PRUEBA con turno ayer → no aparece en ningún bloque
  [`${PRUEBA}@s.whatsapp.net`]: chat('Prueba', [['vendedor', 'nos vemos hoy', el(15, 12)]], { resultado: { tipo: 'vendido', ts: el(15, 13), botParticipo: true } }),
  // 6. un JID sin número con turno ayer → no aparece en ningún bloque
  'gemini-check@s.whatsapp.net': chat('Diagnostico', [['cliente', 'estoy afuera', el(15, 12)]]),
  // 7. turno de anteayer para anteayer (viejo) → no aparece
  [jid(7)]: chat('Eli', [['cliente', 'estoy afuera', el(14, 18)]]),
  // 8. "estamos afuera" ayer, sin modelo guardado → aparece igual, sin modelo
  [jid(8)]: { nombre: 'Fede', historial: [['cliente', 'Estamos afuera !!!!', el(15, 19, 30)]].map(([quien, texto, ts]) => ({ quien, texto, ts })) },
};

check('arriba de todo, con un renglón por chat: nombre, modelo y wa.me', () => {
  const texto = resumen.armar(TODOS, 3, HOY).join('\n');
  assert.ok(/^☀️ Buen día — [^\n]+\n\n📅 Turnos de ayer \(3\)\n/.test(texto), 'el bloque no está arriba de todo:\n' + texto.slice(0, 200));
  const bloque = bloqueTurnos(texto);
  assert.ok(/\n\d+\) Ana · 14 Pro · wa\.me\/5490000000001\n/.test(bloque + '\n'), 'falta Ana:\n' + bloque);
  assert.ok(/\n\d+\) Beto · 14 Pro · wa\.me\/5490000000002\n/.test(bloque + '\n'), 'falta Beto (turno fijado anteayer):\n' + bloque);
  assert.ok(/\n\d+\) Fede · wa\.me\/5490000000008\n/.test(bloque + '\n'), 'falta Fede (sin modelo):\n' + bloque);
  assert.ok(!bloque.includes('Caro'), '"nos vemos mañana" de ayer es para hoy:\n' + bloque);
  assert.ok(!bloque.includes('Dani'), 'una charla sin turno no es un turno:\n' + bloque);
  assert.ok(!bloque.includes('Eli'), 'un turno de anteayer no es de ayer:\n' + bloque);
});

check('los chats de prueba y los que no tienen número no salen en ningún bloque', () => {
  const texto = resumen.armar(TODOS, 3, HOY).join('\n');
  for (const no of [PRUEBA, 'Prueba', 'gemini-check', 'Diagnostico', 'sin link']) {
    assert.ok(!texto.includes(no), `aparece "${no}":\n${texto}`);
  }
  assert.strictEqual(resumen.resultadosDeAyer(TODOS, HOY).vendido.total, 0, 'contó el #vendido del número de prueba');
});

check('sin turnos lo dice', () => {
  const texto = resumen.armar({ [jid(4)]: TODOS[jid(4)] }, 3, HOY).join('\n');
  assert.ok(/^☀️ Buen día — [^\n]+\n\n📅 Ayer no hubo turnos anotados en el chat\n/.test(texto), texto.slice(0, 200));
  const vacio = resumen.armar({}, 3, HOY);
  assert.strictEqual(vacio.length, 1);
  assert.ok(vacio[0].includes('📅 Ayer no hubo turnos anotados en el chat'), vacio[0]);
  assert.ok(/No hay nada pendiente/.test(vacio[0]), vacio[0]);
});

console.log('\nVendidos y perdidos, solo si se anotaron\n');

check('sin #vendido ni #perdido no hay línea de vendidos, ni el recordatorio de cómo se anotan', () => {
  const texto = resumen.armar(TODOS, 3, HOY).join('\n');
  assert.ok(!/vendido|perdido|📊|💰|❌/.test(texto), 'hay línea de vendidos:\n' + texto);
  assert.ok(!/Se anotan con/.test(texto), 'sigue el recordatorio:\n' + texto);
  const vacio = resumen.armar({}, 3, HOY)[0];
  assert.ok(!/vendido|perdido|📊|Se anotan con/.test(vacio), vacio);
});

check('con un #vendido de ayer sí aparece', () => {
  const todos = { ...TODOS, [jid(9)]: { nombre: 'Gabi', historial: [], resultado: { tipo: 'vendido', ts: el(15, 17), botParticipo: false } } };
  const texto = resumen.armar(todos, 3, HOY).join('\n');
  assert.ok(texto.includes('💰 1 vendido · el bot participó en 0'), texto);
  assert.ok(texto.indexOf('📅') < texto.indexOf('💰'), 'los turnos tienen que ir arriba:\n' + texto);
});

console.log('\nCon muchos turnos no se recorta\n');

check('con 40 turnos salen los 40 y se parte en varios mensajes', () => {
  const todos = {};
  for (let i = 0; i < 40; i++) todos[jid(100 + i)] = chat('Cliente ' + i, [['vendedor', 'te esperamos adentro', el(15, 12)]]);
  const partes = resumen.armar(todos, 3, HOY);
  const texto = partes.join('\n');
  assert.ok(texto.includes('📅 Turnos de ayer (40)'), texto.slice(0, 200));
  for (let i = 0; i < 40; i++) assert.ok(texto.includes('wa.me/' + jid(100 + i).split('@')[0]), 'se perdió el turno ' + i);
  assert.ok(partes.every((p) => p.length <= resumen.LARGO_MENSAJE), 'quedó un mensaje más largo que el tope');
});

try {
  fs.unlinkSync(process.env.ESTADO_PATH);
} catch {
  /* no se llegó a crear */
}

console.log(fallos === 0 ? '\nTodo OK\n' : `\n${fallos} fallo(s)\n`);
process.exit(fallos === 0 ? 0 : 1);
