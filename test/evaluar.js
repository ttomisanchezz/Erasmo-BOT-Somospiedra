'use strict';
/**
 * El set mínimo de casos de Piedra (poda de iPhone, 19/10/2026). Reemplaza al banco de casos de iPhone
 * (quedó en _heredado-iphone/test/). Los casos reales de Piedra se arman en otro prompt.
 *
 *   npm run evaluar -- --offline        (sin red: es la única forma; --offline se acepta por costumbre)
 *   npm run evaluar -- --offline -v     además muestra cada conversación
 *
 * Cada caso es una conversación con las respuestas de Sonnet "enlatadas" (lo que contestaría la API, como
 * tool_use de `responder`, `escalar` o las herramientas de datos), pasada por el bot de verdad (index.js
 * `procesar`, con Evolution de mentira). Se revisan dos cosas:
 *   1. lo propio de cada caso (escala, sale tal cosa, no sale nada). Al escalar, al cliente le llega solo el
 *      mensaje fijo del código, "Enseguida te respondemos." (Tomás y Fran, 16/11/2026);
 *   2. las REGLAS GLOBALES, en toda respuesta: como mucho 4 mensajes por tanda, cada uno de hasta 300
 *      caracteres, ningún monto que no haya devuelto una herramienta en esa tanda (09/11/2026: antes era
 *      ninguno), y nunca la promesa de que otra persona lo va a contactar.
 * Sale con código 0 solo si todo da 100%.
 */
const p = require('./piedra-ayuda')({ CEREBRO_MODO: 'todos' });
const { bot, sonnet, aClientes, alGrupo, mensaje, propio, state, jid, cerebro, eventos } = p;
const promesas = require('../src/promesas');
const fs = require('fs');
const path = require('path');
// El catálogo en PDF (de mentira) en la carpeta de documentos de la prueba. La granza sale de su tabla (sin panel).
fs.mkdirSync(process.env.DOCS_DIR, { recursive: true });
fs.writeFileSync(path.join(process.env.DOCS_DIR, 'Catalogo-Somos-Piedra-2026_3.pdf'), '%PDF-1.4 de mentira');
const enDias = (n) => new Date(Date.now() + n * 86400000 - 3 * 3600000).toISOString().slice(0, 10);

const VERBOSO = process.argv.includes('-v');
// Lo único que recibe el cliente cuando Erasmo le pasa el chat al equipo. El texto exacto, escrito a mano.
const AVISO_ESCALADO = 'Enseguida te respondemos.';
/** Al escalar: ¿le llegó solo el mensaje fijo, una vez? Devuelve el problema o null. */
const soloElAviso = (cliente) => (cliente.length === 1 && cliente[0] === AVISO_ESCALADO ? null : `le llegó ${JSON.stringify(cliente)}`);
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
    nombre: 'pregunta el precio sin decir producto ni m2: no recibe ningún monto, le pregunta qué producto y cuántos m2',
    pasos: [{ c: 'hola, cuanto sale el m2?' }],
    sonnet: [sonnet.responde(['Hola, buenas tardes. Qué producto estás mirando?', 'Calculaste los m² que necesitás cubrir?'])],
    chequeo: ({ cliente, grupo }) => (cliente.length !== 2 ? `le llegó ${JSON.stringify(cliente)}` : grupo.length ? 'avisó al grupo' : null),
  },
  {
    nombre: 'cotiza granza 12 m2: salen los montos que devolvió cotizar, con "sin factura", y queda en la ficha',
    pasos: [{ c: 'cuanto sale la granza roja para 12 m2?' }],
    sonnet: [
      [sonnet.usar('cotizar', { producto: 'Granza roja', m2: '12' })],
      sonnet.responde(['Para 12 m² son 12 bolsas.', 'En efectivo o transferencia $240.000 y con tarjeta $300.000, sin factura.']),
    ],
    chequeo: ({ cliente, s }) =>
      cliente.join('|') !== 'Para 12 m² son 12 bolsas.|En efectivo o transferencia $240.000 y con tarjeta $300.000, sin factura.'
        ? `salió ${JSON.stringify(cliente)}`
        : !s.ficha || !s.ficha.pidio || s.ficha.pidio.producto !== 'Granza roja'
          ? 'no quedó la ficha'
          : null,
  },
  {
    nombre: 'cotiza con factura: el IVA lo suma la herramienta también sobre la tarjeta (granza 5 m2)',
    pasos: [{ c: 'granza roja 5 m2, con factura' }],
    sonnet: [
      [sonnet.usar('cotizar', { producto: 'Granza roja', m2: '5', con_factura: true })],
      sonnet.responde(['Con factura: $133.100 en efectivo o transferencia y $160.300 con tarjeta.']),
    ],
    chequeo: ({ cliente }) => (cliente.length !== 1 || !/133\.100/.test(cliente[0]) ? `salió ${JSON.stringify(cliente)}` : null),
  },
  {
    nombre: 'cotiza y se equivoca en el monto: la guardia frena, Sonnet corrige con el de la herramienta',
    pasos: [{ c: 'granza gris tandil 12 m2 en efectivo' }],
    sonnet: [
      [sonnet.usar('cotizar', { producto: 'Granza gris Tandil', m2: '12', forma_pago: 'efectivo' })],
      sonnet.responde(['Te sale $250.000.']),
      sonnet.responde(['Te sale $240.000, sin factura.']),
    ],
    chequeo: ({ cliente, pedidos }) => (cliente.join() !== 'Te sale $240.000, sin factura.' ? `salió ${JSON.stringify(cliente)}` : pedidos !== 3 ? `hubo ${pedidos} pedidos` : null),
  },
  {
    nombre: 'un producto que no está en la lista: cotizar da error y escala, el cliente solo recibe "Enseguida te respondemos."',
    pasos: [{ c: 'cuanto sale el marmol de carrara 4 m2?' }],
    sonnet: [[sonnet.usar('cotizar', { producto: 'Mármol de Carrara', m2: '4' })], sonnet.escala('pide mármol de Carrara, no está en la lista')],
    chequeo: ({ cliente, grupo, s }) =>
      soloElAviso(cliente) || (!grupo.some((t) => /🔕/.test(t) && /Carrara/.test(t)) ? 'no avisó al grupo' : !s.escalado ? 'no quedó escalado' : null),
  },
  {
    nombre: 'pide envío: escala con el dato (al cliente solo "Enseguida te respondemos.", una vez; 🔕 al grupo con el motivo)',
    pasos: [{ c: 'hacen envios a plottier? son 12 m2 de granza roja' }, { c: 'hola??' }],
    sonnet: [sonnet.escala('pide envío a Plottier, granza roja 12 m²')],
    chequeo: ({ cliente, grupo, s, pedidos }) =>
      soloElAviso(cliente) ||
      (pedidos !== 1 ? `hubo ${pedidos} pedidos` : !grupo.some((t) => /🔕/.test(t) && /Plottier/.test(t)) ? 'no avisó al grupo' : !s.escalado ? 'no quedó escalado' : null),
  },
  {
    nombre: 'quiere ver las piedras: avisa que le manda el catálogo y el PDF sale después de los textos',
    pasos: [{ c: 'hola, que piedras tienen para el frente?' }],
    sonnet: [[sonnet.usar('mandar_catalogo', {})], sonnet.responde(['Hola, buenas tardes. Te mando el catálogo para que veas las opciones.', 'Qué estilo buscás para el frente?'])],
    chequeo: ({ cliente, s }) =>
      cliente.join('|') !== 'Hola, buenas tardes. Te mando el catálogo para que veas las opciones.|Qué estilo buscás para el frente?|[documento]'
        ? `salió ${JSON.stringify(cliente)}`
        : !s.catalogoEnviado
          ? 'no quedó la marca de 24 h'
          : null,
  },
  {
    nombre: 'promete el catálogo sin pedirlo a la herramienta: la guardia lo frena y sale lo corregido, sin PDF',
    pasos: [{ c: 'que piedras tienen?' }],
    sonnet: [sonnet.responde(['Te mando el catálogo ahora.']), sonnet.responde(['Dale, contame qué estás buscando.'])],
    chequeo: ({ cliente }) => (cliente.join() !== 'Dale, contame qué estás buscando.' ? `salió ${JSON.stringify(cliente)}` : null),
  },
  {
    nombre: 'dice cuándo arranca la obra: se anota el seguimiento para el equipo y al cliente solo "no hay problema"',
    pasos: [{ c: 'lo pienso, en 15 dias arranco la obra' }],
    sonnet: [[sonnet.usar('agendar_seguimiento', { fecha: enDias(15), motivo: 'arranca la obra en 15 días' })], sonnet.responde(['Dale, no hay problema. Cualquier consulta avisanos.'])],
    chequeo: ({ cliente, s }) =>
      cliente.join() !== 'Dale, no hay problema. Cualquier consulta avisanos.'
        ? `salió ${JSON.stringify(cliente)}`
        : !s.seguimiento || s.seguimiento.fecha !== enDias(15)
          ? 'no quedó el seguimiento'
          : null,
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
    nombre: 'un monto inventado (sin cotizar): frena dos veces y escala, no sale ningún monto (solo "Enseguida te respondemos.")',
    pasos: [{ c: 'cuanto sale la bolsa de granza?' }],
    sonnet: [sonnet.responde(['la bolsa sale $8.500']), sonnet.responde(['sale 8500 la bolsa'])],
    chequeo: ({ cliente, grupo }) => soloElAviso(cliente) || (!grupo.some((t) => /guardia: .*monto/.test(t)) ? 'no escaló por la guardia' : null),
  },
  {
    nombre: 'un monto escrito sin cotizar y corregido: sale lo corregido, sin monto',
    pasos: [{ c: 'cuanto sale?' }],
    sonnet: [sonnet.responde(['sale 12 mil']), sonnet.responde(['Hola, qué producto estás mirando?'])],
    chequeo: ({ cliente }) => (cliente.join() !== 'Hola, qué producto estás mirando?' ? `salió ${JSON.stringify(cliente)}` : null),
  },
  {
    nombre: 'una persona está atendiendo: silencio (no le pregunta a Sonnet ni sale nada)',
    pasos: [{ persona: 'hola! que andas buscando?' }, { c: 'laja para el patio' }],
    sonnet: [],
    chequeo: ({ cliente, grupo, pedidos }) => (pedidos ? 'le preguntó a Sonnet' : cliente.length || grupo.length ? 'salió algo' : null),
  },
  {
    nombre: 'Sonnet no responde: silencio con el cliente (ni el mensaje fijo: ese escalado no calla) y aviso al grupo',
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

/**
 * Las reglas globales: devuelve los problemas de lo que le llegó al cliente en una tanda. `permitidos`: los montos
 * que devolvieron las herramientas en esa tanda (en pesos): son los únicos que pueden salir.
 */
function reglasGlobales(cliente, permitidos = []) {
  const problemas = [];
  if (cliente.length > cerebro.MAX_MENSAJES) problemas.push(`${cliente.length} mensajes en una tanda`);
  for (const t of cliente) {
    if (t.length > cerebro.LARGO_MAXIMO) problemas.push(`un mensaje de ${t.length} caracteres`);
    if (cerebro.montosEn(t).some((m) => !permitidos.includes(m))) problemas.push(`salió un monto que no devolvió ninguna herramienta: "${t}"`);
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
    // Los montos que dejaron escribir las herramientas en la tanda (el registro de aprendizaje los anota).
    const permitidos = eventos(num, 'propuesta').flatMap((e) => (e.sonnet && e.sonnet.montos) || []);
    const problemas = [caso.chequeo(ctx), ...reglasGlobales(cliente, permitidos)].filter(Boolean);
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
