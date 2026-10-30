'use strict';
/**
 * El set mínimo de casos de Piedra (poda de iPhone, 19/10/2026). Reemplaza al banco de casos de iPhone
 * (quedó en _heredado-iphone/test/). Los casos reales de Piedra se arman en otro prompt.
 *
 *   npm run evaluar -- --offline        (sin red: es la única forma; --offline se acepta por costumbre)
 *   npm run evaluar -- --offline -v     además muestra cada conversación
 *
 * Cada caso es una conversación con las respuestas de Sonnet "enlatadas" (lo que contestaría la API, como
 * tool_use de `responder` o `escalar`), pasada por el bot de verdad (index.js `procesar`, con Evolution de
 * mentira). Se revisan dos cosas:
 *   1. lo propio de cada caso (escala, sale tal cosa, no sale nada);
 *   2. las REGLAS GLOBALES, en toda respuesta: como mucho 4 mensajes por tanda, cada uno de hasta 300
 *      caracteres, ningún monto, y nunca la promesa de que otra persona lo va a contactar.
 * Sale con código 0 solo si todo da 100%.
 */
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, sonnet, aClientes, alGrupo, mensaje, propio, state, jid, cerebro } = p;
const promesas = require('../src/promesas');

const VERBOSO = process.argv.includes('-v');
const MIN = 60 * 1000;

let n = 900;
const nuevo = () => `54900000${String(++n).padStart(5, '0')}`;

/**
 * Los casos: { nombre, pasos: [{ c } | { persona } | { grupo }], sonnet: [pasos de la API], chequeo(ctx) }. `ctx` trae
 * lo que le llegó al cliente (`cliente`, textos), lo que llegó al grupo (`grupo`), cuántos pedidos hubo a
 * Sonnet (`pedidos`) y el estado del chat (`s`). `chequeo` devuelve null si está bien, o el problema.
 */
const CASOS = [
  {
    nombre: 'un saludo trivial: contesta corto y sin datos',
    pasos: [{ c: 'hola buenas' }],
    sonnet: [sonnet.responde(['hola! como va?'])],
    chequeo: ({ cliente, grupo }) => (cliente.join() !== 'hola! como va?' ? `le llegó ${JSON.stringify(cliente)}` : grupo.length ? 'avisó al grupo' : null),
  },
  {
    nombre: 'pregunta un precio: escala en silencio (al cliente nada, 🔕 al grupo con el motivo)',
    pasos: [{ c: 'hola, cuanto sale el m2 de laja?' }],
    sonnet: [sonnet.escala('pregunta el precio del m2 de laja')],
    chequeo: ({ cliente, grupo, s }) =>
      cliente.length ? `le llegó ${JSON.stringify(cliente)}` : !grupo.some((t) => /🔕/.test(t) && /precio del m2 de laja/.test(t)) ? 'no avisó al grupo' : !s.escalado ? 'no quedó escalado' : null,
  },
  {
    nombre: 'seis mensajes de Sonnet: salen 4, el 4º con los que sobran',
    pasos: [{ c: 'hola' }],
    sonnet: [sonnet.responde(['uno', 'dos', 'tres', 'cuatro', 'cinco', 'seis'])],
    chequeo: ({ cliente }) => (JSON.stringify(cliente) !== JSON.stringify(['uno', 'dos', 'tres', 'cuatro\ncinco\nseis']) ? `salió ${JSON.stringify(cliente)}` : null),
  },
  {
    nombre: 'un mensaje de más de 300 caracteres: Sonnet lo corrige y sale el corto',
    pasos: [{ c: 'contame de la piedra' }],
    sonnet: [sonnet.responde(['x'.repeat(350)]), sonnet.responde(['te cuento: es piedra natural de la zona'])],
    chequeo: ({ cliente, pedidos }) => (pedidos !== 2 ? `hubo ${pedidos} pedidos` : cliente.join() !== 'te cuento: es piedra natural de la zona' ? `salió ${JSON.stringify(cliente)}` : null),
  },
  {
    nombre: 'un monto inventado: frena dos veces y escala, no sale ningún monto',
    pasos: [{ c: 'cuanto sale la bolsa de granza?' }],
    sonnet: [sonnet.responde(['la bolsa sale $8.500']), sonnet.responde(['sale 8500 la bolsa'])],
    chequeo: ({ cliente, grupo }) => (cliente.length ? `le llegó ${JSON.stringify(cliente)}` : !grupo.some((t) => /guardia: .*monto/.test(t)) ? 'no escaló por la guardia' : null),
  },
  {
    nombre: 'un monto frenado y corregido: sale lo corregido, sin monto',
    pasos: [{ c: 'cuanto sale?' }],
    sonnet: [sonnet.responde(['sale 12 mil']), sonnet.responde(['hola! en un momento te paso la info'])],
    chequeo: ({ cliente }) => (cliente.join() !== 'hola! en un momento te paso la info' ? `salió ${JSON.stringify(cliente)}` : null),
  },
  {
    nombre: 'una persona está atendiendo: silencio (no le pregunta a Sonnet ni sale nada)',
    pasos: [{ persona: 'hola! que andas buscando?' }, { c: 'laja para el patio' }],
    sonnet: [],
    chequeo: ({ cliente, grupo, pedidos }) => (pedidos ? 'le preguntó a Sonnet' : cliente.length || grupo.length ? 'salió algo' : null),
  },
  {
    nombre: 'Sonnet no responde: silencio con el cliente y aviso al grupo',
    pasos: [{ c: 'hola, hacen envios?' }],
    sonnet: [sonnet.falla(500), sonnet.falla(500)],
    chequeo: ({ cliente, grupo }) => (cliente.length ? `le llegó ${JSON.stringify(cliente)}` : !grupo.some((t) => /Sonnet no pudo contestar/.test(t)) ? 'no avisó al grupo' : null),
  },
  {
    nombre: 'un excluido (#excluir en el grupo) escribe: no pasa nada (sin Sonnet, nada al cliente, nada al grupo salvo la confirmación)',
    pasos: [{ grupo: '#excluir {num}' }, { c: 'hola, tienen laja?' }],
    sonnet: [],
    chequeo: ({ cliente, grupo, pedidos }) =>
      pedidos ? 'le preguntó a Sonnet' : cliente.length ? `le llegó ${JSON.stringify(cliente)}` : grupo.length !== 1 || !/^🚫 Excluido/.test(grupo[0]) ? `al grupo llegó ${JSON.stringify(grupo)}` : null,
  },
  {
    nombre: '#excluir en el chat: al cliente no le llega nada y el grupo recibe la confirmación con 🚫',
    pasos: [{ persona: '#excluir' }],
    sonnet: [],
    chequeo: ({ cliente, grupo, pedidos }) =>
      pedidos ? 'le preguntó a Sonnet' : cliente.length ? `le llegó ${JSON.stringify(cliente)}` : !grupo.some((t) => /^🚫 Excluido/.test(t)) ? 'no confirmó con 🚫 en el grupo' : null,
  },
];

/** Las reglas globales: devuelve los problemas de lo que le llegó al cliente en una tanda. */
function reglasGlobales(cliente) {
  const problemas = [];
  if (cliente.length > cerebro.MAX_MENSAJES) problemas.push(`${cliente.length} mensajes en una tanda`);
  for (const t of cliente) {
    if (t.length > cerebro.LARGO_MAXIMO) problemas.push(`un mensaje de ${t.length} caracteres`);
    if (cerebro.montosEn(t).length) problemas.push(`salió un monto: "${t}"`);
    if (promesas.promesaDeOtro(t)) problemas.push(`promete a otra persona: "${t}"`);
  }
  return problemas;
}

(async () => {
  console.log(`\nCasos de Piedra (${CASOS.length}), sin red${process.argv.includes('--offline') ? ' (--offline)' : ''}\n`);
  let bien = 0;
  for (const caso of CASOS) {
    p.limpiar();
    const num = nuevo();
    sonnet.guion(...caso.sonnet);
    for (const paso of caso.pasos) {
      if (paso.persona) {
        await bot.procesar(propio(num, paso.persona));
        await p.dormir(3);
      } else if (paso.grupo) {
        await bot.procesar(p.enElGrupo(paso.grupo.replace('{num}', num)));
      } else {
        await bot.procesar(mensaje(num, paso.c));
      }
    }
    const cliente = aClientes.filter((m) => m.numero === jid(num)).map((m) => m.texto);
    const ctx = { cliente, grupo: [...alGrupo], pedidos: sonnet.pedidos.length, s: state.todos()[jid(num)] || {} };
    const problemas = [caso.chequeo(ctx), ...reglasGlobales(cliente)].filter(Boolean);
    if (!problemas.length) bien++;
    console.log(`  ${problemas.length ? 'FALLA' : 'ok   '} ${caso.nombre}${problemas.length ? ' -> ' + problemas.join('; ') : ''}`);
    if (VERBOSO) {
      for (const paso of caso.pasos) console.log(`        ${paso.grupo ? 'grupo' : paso.persona ? 'persona' : 'cliente'}: ${paso.grupo || paso.persona || paso.c}`);
      for (const t of cliente) console.log(`        bot: ${t.replace(/\n/g, ' / ')}`);
      for (const t of ctx.grupo) console.log(`        grupo: ${t.split('\n')[0]}`);
    }
  }
  const porcentaje = Math.round((bien / CASOS.length) * 100);
  console.log(`\n${bien}/${CASOS.length} casos (${porcentaje}%)\n`);
  process.exit(bien === CASOS.length ? 0 : 1);
})();
