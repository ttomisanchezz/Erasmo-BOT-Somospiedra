'use strict';
/**
 * Muestra qué contestó un humano donde el bot habría dicho otra cosa.
 *
 *   npm run aprender                        los últimos 20 ejemplos
 *   npm run aprender -- 50                  los últimos 50
 *   npm run aprender -- --todos             todos
 *   npm run aprender -- --archivo <ruta>    otro archivo (se combina con lo de arriba)
 *
 * Lee el registro de eventos (`data/aprendizaje-v2.jsonl`, bloque 6) y arma los
 * ejemplos: una respuesta humana entera por ejemplo (aprendizaje.ejemplos). Los
 * incompletos van marcados y sin propuesta del bot: la persona contestó mientras el
 * bot interpretaba, el cliente escribió después de la propuesta, o el bot se reinició.
 *
 * Con `--archivo` y un archivo del formato viejo (sin `v: 2`, como
 * `data/aprendizaje-v1.jsonl`) muestra sus filas como antes. Esas filas pueden
 * mezclar turnos (hallazgo B1) y repetir la pregunta por cada mensaje de la persona:
 * contar mensajes distintos, no registros.
 *
 * Esto NO cambia el bot. Es para leerlo con ojo y decidir qué vale la pena
 * incorporar. Lo que se decide incorporar se escribe como caso en casos.js
 * y después se implementa. Así el bot mejora sin copiar errores.
 */
const aprendizaje = require('../src/aprendizaje');
const { distancia } = aprendizaje;

const C = {
  gris: (s) => `\x1b[90m${s}\x1b[0m`,
  verde: (s) => `\x1b[32m${s}\x1b[0m`,
  amar: (s) => `\x1b[33m${s}\x1b[0m`,
  cian: (s) => `\x1b[36m${s}\x1b[0m`,
  neg: (s) => `\x1b[1m${s}\x1b[0m`,
};

const args = process.argv.slice(2);
const iArchivo = args.indexOf('--archivo');
const archivo = iArchivo > -1 ? args[iArchivo + 1] : null;
if (iArchivo > -1 && !archivo) {
  console.log('\nFalta la ruta: npm run aprender -- --archivo data/aprendizaje-v1.jsonl\n');
  process.exit(1);
}
const lineas = aprendizaje.leerTodo(archivo || aprendizaje.ARCHIVO);

if (!lineas.length) {
  if (archivo) {
    console.log(`\nNo hay nada que leer en ${archivo}.\n`);
    process.exit(1);
  }
  console.log('\nTodavia no hay nada registrado.');
  console.log(C.gris('Se va llenando solo: cada vez que una persona de la cuenta contesta en un chat,'));
  console.log(C.gris('se guarda que pregunto el cliente, que habria dicho el bot y que dijo la persona.\n'));
  process.exit(0);
}

// Registro de eventos (bloque 6) o archivo del formato viejo: las filas viejas ya
// traen cliente, bot y humano como texto.
const v2 = lineas.some((l) => l.v === 2);
const filas = v2
  ? aprendizaje.ejemplos(lineas).map((e) => ({
      chat: e.chat,
      ts: e.ts,
      cliente: e.cliente.join('\n'),
      bot: e.bot.join(' | '),
      humano: e.humano,
      motivo: e.escalar ? e.motivo : '',
      incompleto: e.incompleto,
    }))
  : lineas;

const todos = args.includes('--todos');
const nArg = args.find((a, i) => /^\d+$/.test(a) && i !== iArchivo + 1);
const n = todos ? filas.length : parseInt(nArg || '20', 10);
const muestra = filas.slice(-n);

const conDif = muestra
  .map((f) => ({ ...f, dif: distancia(f.bot, f.humano) }))
  .sort((a, b) => b.dif - a.dif);

// Un ejemplo puede tener varias líneas del cliente o varios mensajes de la persona.
const sangria = (t) => String(t).split('\n').join('\n' + ' '.repeat(14));

console.log('');
if (v2) {
  const incompletos = filas.filter((f) => f.incompleto).length;
  console.log(C.neg(`${filas.length} ejemplos registrados (${incompletos} incompletos) · mostrando ${muestra.length}`));
} else {
  console.log(C.neg(`${filas.length} intervenciones registradas (formato viejo) · mostrando ${muestra.length}`));
}
console.log(C.gris('Ordenadas de mas distinta a mas parecida a lo que iba a decir el bot.'));
console.log('');

for (const f of conDif) {
  const pct = Math.round(f.dif * 100);
  const color = pct > 70 ? C.amar : C.gris;
  const marca = f.incompleto ? C.amar(` · INCOMPLETO: ${f.incompleto}`) : '';
  console.log(color(`── ${f.chat} · ${f.ts.slice(0, 16).replace('T', ' ')} · ${pct}% distinto`) + marca);
  if (f.motivo) console.log(C.gris(`   (el bot iba a escalar: ${f.motivo})`));
  console.log(C.cian('   cliente  › ') + (f.cliente ? sangria(f.cliente) : '(sin registrar)'));
  const sinBot = f.incompleto ? '(sin propuesta del bot: no se puede comparar)' : '(no iba a contestar)';
  console.log(C.gris('   bot      › ') + (f.bot || sinBot));
  console.log(C.verde('   humano   › ') + sangria(f.humano));
  console.log('');
}

const muyDistintas = conDif.filter((f) => f.dif > 0.7).length;
console.log(
  C.neg(`${muyDistintas} de ${conDif.length} son muy distintas.`) +
    C.gris(' Esas son las que conviene mirar primero.')
);
const incompletosMostrados = conDif.filter((f) => f.incompleto).length;
if (incompletosMostrados) {
  console.log(C.gris(`${incompletosMostrados} son incompletos: no tienen propuesta del bot para comparar.`));
}
console.log('');
