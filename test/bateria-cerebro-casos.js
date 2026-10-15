'use strict';
/**
 * Los casos de `npm run bateria-cerebro` (test/bateria-cerebro.js): conversaciones de varios turnos
 * que se corren contra `cerebro.pensar` como si fueran chats reales. Cerebro Sonnet, fase 2
 * (decisiones de Tomás del 02/10/2026): todo lo que Tomás fue marcando en los chats reales.
 *
 * El porqué de cada caso va en el nombre. Los montos NUNCA se escriben a mano: se piden con
 * `montos` y el corredor los calcula con la planilla en uso (la copia congelada,
 * test/fixture-planilla.js, o la de hoy con --planilla-en-vivo) y `cotizador.cotizar`.
 *
 * Formato de un caso:
 *   {
 *     nombre: '8a. Cotización: el 13 con 340.000 → 1 pago y 2 cuotas exactos',
 *     planilla: (p) => p,         // opcional: devuelve la planilla del caso a partir de una copia
 *                                 // (agregar o sacar filas, cambiar config.estadoLista). Tiene que
 *                                 // andar también con la planilla de hoy (--planilla-en-vivo).
 *     bateria: '85-93',           // opcional: la lista de usados activa (#bateria 85-93)
 *     stockApp: 'vivo',           // opcional (08/10/2026): corre con STOCK_APP_MODO=vivo (el local y el depósito: las
 *                                 // filas de USADOS son del local), sea cual sea el del .env
 *     nombreCliente: 'Martina',   // opcional: el pushName (por defecto, sin nombre)
 *     estado: { ... },            // opcional: campos del estado del chat al empezar
 *     evolution: [                // opcional (bloque Ninjo 1b): lo que Evolution tiene del chat de
 *       { quien: 'persona', texto: 'te paso el alias', hace: '21 dias' }, // antes de que el bot lo
 *     ],                          // mirara (quien y hace, como en `antes`; `texto` puede ser una
 *                                 // función de la planilla del caso). Pasa por contexto.completar.
 *     postventa: true,            // opcional: en ningún turno se le pregunta qué modelo busca
 *     turnos: [
 *       {
 *         despues: '2 min',       // opcional: cuánto pasó desde el turno anterior (por defecto 2 min;
 *                                 // el primero es a las 15:00 de un martes, hora de Neuquén)
 *         antes: [                // opcional: líneas que ya estaban en el chat, con hace cuánto
 *           { quien: 'cliente', texto: 'tenes el 15?', hace: '2 dias' },
 *           { quien: 'bot', texto: 'sii, tenemos el 15', hace: '2 dias' },
 *           { quien: 'persona', texto: 'te espero mañana 16:30 en Belgrano 3090', hace: '3 h' },
 *         ],                      // quien: 'cliente' | 'bot' | 'persona' (una persona de la cuenta)
 *                                 // hace: '20 min', '3 h', '4 dias'
 *         cliente: 'tenes el 13?',          // la tanda: un texto, o varios mensajes seguidos
 *         // cliente: ['hola', 'tenes el 15?', 'tengo 600'],
 *         fotos: ['captura-bateria-90.png'], // opcional (07/10/2026): fotos que mandó con la tanda,
 *                                           //   archivos de test/fixtures; Sonnet las ve como en vivo
 *         espera: {
 *           escala: false,                  // true o false (sin `escala`, da igual si escala)
 *           contiene: [/regex/],            // todas, sobre lo que contestó Sonnet (texto unido,
 *           contieneAlguno: [/a/, /b/],     //   en minúsculas y sin tildes: escribí las regex así)
 *           noContiene: [/cuotas?/],
 *           motivo: [/regex/],              // si escala: todas, sobre el motivo (sin tildes)
 *           montos: [                       // los que tienen que estar en lo que contestó
 *             { contado: '13' },            //   precio de contado del 13 (la fila que da buscar_equipos
 *             { minimo: '13' },             //   primero), entrega mínima del 13
 *             { cotiza: '13', entrega: 340000 }, // 1 pago y 2 cuotas de cotizador.cotizar
 *             { contado: '16', condicion: 'sellado' }, // opcionales: condicion ('sellado' | 'usado'),
 *                                           //   capacidad (128), origen ('LISTA' | 'USADOS'), bateria ('100%')
 *             { cotiza: '13', entrega: 300000, excepcion: true }, // la excepción de la tercera vez (06/10):
 *                                           //   1 pago y 2 cuotas del cotizador bajo el mínimo
 *             { retiraCon: 220000, salvo: '13' }, // la entrega mínima del primero de `con_esa_entrega`
 *           ],                              //   (lo que sí se lleva con esa entrega, sin el 13)
 *           noMontos: [{ contado: '15' }],  // los que NO tienen que estar
 *           maxMensajes: 2,                 // como mucho, los mensajes de Sonnet
 *           compromiso: true,               // si va el PDF del compromiso (desde el bloque Ninjo 1b lo
 *                                           //   decide el código: con el primer bloque de la cotización)
 *           usa: ['cotizar'],               // herramientas que tuvo que usar
 *           aviso: true,                    // si la respuesta lleva aviso_grupo (📌 al grupo)
 *         },                                // y en montos, { cotiza: '13', entrega: 350000, al100: true }:
 *                                           //   la fila de LISTA que tapó la lista activa (#bateria)
 *       },
 *     ],
 *   }
 *
 * Siempre, en todo turno (sin escribirlo): ningún monto inventado, sin "te falta", sin promesas,
 * montos con puntos, sin saludo duplicado, nada interno y la cotización solo en el bloque (bloque
 * Ninjo 1b: nada de "1 pago de $X" o "2 cuotas de $Y" escrito por Sonnet).
 *
 * La copia congelada (test/fixture-planilla.js), lista VIGENTE: LISTA tiene 13, 13 Pro, 14 (80%),
 * 14 Pro, 15, 15 Pro, 16, 16 Pro (usados) y 17, 17 Pro, 17 Pro Max (sellados); USADOS tiene unidades
 * puntuales de 11, 12, 14 y un XR. No hay 16 sellado ni 18. LISTA 85-93 (#bateria 85-93) cambia el
 * precio de algunos usados y la batería sale "85-93%".
 */

/** Una fila sellada del 16 (Tomás, 02/10: "Hay 16 sellado; no hay 16 Pro sellado"). Si la planilla ya tiene una, queda la suya. */
function conDieciseisSellado(p) {
  const sellado = (f) => /^sellad/i.test(String(f.condicion || '').trim());
  const usado16 = (p.lista || []).find((f) => /^iphone 16$/i.test(f.modelo) && !sellado(f));
  if (!usado16 || (p.lista || []).some((f) => /^iphone 16$/i.test(f.modelo) && sellado(f))) return p;
  const fila = {
    ...usado16,
    id: 'N-016S',
    condicion: 'Sellado',
    bateria_min: null,
    bateria_texto: '',
    precio_contado: Math.round((usado16.precio_contado * 1.25) / 1000) * 1000,
    anticipo_min: Math.round((usado16.anticipo_min * 1.25) / 1000) * 1000,
  };
  return { ...p, lista: [...p.lista, fila] };
}

/** Sin ninguna fila del modelo (por si la planilla de hoy ya lo tiene cargado). */
const sinModelo = (re) => (p) => ({
  ...p,
  lista: (p.lista || []).filter((f) => !re.test(f.modelo)),
  usados: (p.usados || []).filter((f) => !re.test(f.modelo)),
});

/** La lista con otro estado (VENCIDA, SIN CARGAR...). */
const conEstadoLista = (estado) => (p) => ({ ...p, config: { ...p.config, estadoLista: estado } });

// Frases que se repiten en los chequeos.
const CUOTAS = /\bcuotas?\b|\b[12] pagos?\b/;
const PROMETE_GUARDAR = /te lo (guardo|reservo|aparto|separo)|queda (reservado|guardado|apartado)/;

const casos = [
  // -------------------------------------------------------------------------------------------
  // 1. Stock
  // -------------------------------------------------------------------------------------------
  {
    nombre: '1a. Stock: "tenes el 13?" → modelo, capacidad, batería tal cual y contado, sin cuotas',
    turnos: [
      {
        cliente: 'tenes el 13?',
        espera: {
          escala: false,
          contiene: [/\b13\b/, /128/, /100 ?%/],
          noContiene: [CUOTAS, /entrega/],
          montos: [{ contado: '13' }],
          usa: ['buscar_equipos'],
        },
      },
    ],
  },
  {
    nombre: '1d. Stock: "tenes el 17 pro max?" → sellado (la condición tal cual), contado, sin cuotas',
    turnos: [
      {
        cliente: 'tenes el 17 pro max?',
        espera: {
          escala: false,
          contiene: [/17 pro max/, /sellado/],
          noContiene: [CUOTAS, /\d+ ?%/],
          montos: [{ contado: '17 Pro Max' }],
        },
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // 3. Condición tal cual (16 usado y 16 sellado)
  // -------------------------------------------------------------------------------------------
  {
    nombre: '3a. Condición tal cual: con el 16 usado y el 16 sellado en la planilla, "tenes el 16?" da el usado con su batería y nunca le dice sellado al 16 Pro',
    planilla: conDieciseisSellado,
    turnos: [
      {
        cliente: 'tenes el 16?',
        espera: {
          escala: false,
          contiene: [/\b16\b/],
          noContiene: [/16 pro[^.\n]*sellad/, CUOTAS],
          montos: [{ contado: '16', condicion: 'usado' }],
        },
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // 8. Cotización
  // -------------------------------------------------------------------------------------------
  {
    nombre: '8a. Cotización: el 13 con 340.000 → 1 pago y 2 cuotas exactos, con puntos',
    turnos: [
      {
        cliente: 'quiero el 13, tengo 340 mil para entregar',
        espera: {
          escala: false,
          montos: [{ cotiza: '13', entrega: 340000 }],
          noContiene: [/te falta/],
          usa: ['cotizar'],
        },
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // 17. Turno ya acordado por una persona
  // -------------------------------------------------------------------------------------------
  {
    nombre: '17. Turno acordado por una persona hace 3 h ("te espero mañana 16:30 en Belgrano 3090") y "a donde tengo que ir a retirar?" → escala (caso Emanuel)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'buenas, quiero el 13 de contado', hace: '4 h' },
          { quien: 'bot', texto: 'dale, contame que dia te podes acercar', hace: '4 h' },
          { quien: 'cliente', texto: 'mañana a la tarde puedo', hace: '3 h' },
          { quien: 'persona', texto: 'te espero mañana 16:30 en Belgrano 3090', hace: '3 h' },
        ],
        cliente: 'a donde tengo que ir a retirar?',
        espera: { escala: true },
      },
    ],
  },

  // -------------------------------------------------------------------------------------------
  // 38. Lista no vigente
  // -------------------------------------------------------------------------------------------
  {
    nombre: '38. Lista no vigente (VENCIDA) y "cuanto sale el 13?" → escala, sin precios',
    planilla: conEstadoLista('VENCIDA'),
    turnos: [
      {
        cliente: 'cuanto sale el 13?',
        espera: { escala: true },
      },
    ],
  },
];

// Cada conversación conserva las respuestas reales de los turnos anteriores (un turno que escala
// no deja nada en el historial y la conversación sigue). Las escaladas no llevan chequeos de
// mensajes: si escala, no manda nada. Escritos por Codex y revisados por Claude (02/10/2026).
casos.push(
  {
    nombre: '1b. Stock del 14 Pro: copia capacidad y batería sin ofrecer cuotas',
    turnos: [
      { cliente: 'tenes el 14 pro?', espera: { escala: false, contiene: [/14 pro/, /128/, /100 ?%/], noContiene: [CUOTAS], montos: [{ contado: '14 Pro' }], usa: ['buscar_equipos'] } },
      { cliente: 'y el 13?', espera: { escala: false, contiene: [/128/, /100 ?%/], montos: [{ contado: '13' }], noContiene: [CUOTAS] } },
      { cliente: 'me interesa el 14 pro, tengo 500 mil', espera: { escala: false, montos: [{ cotiza: '14 Pro', entrega: 500000 }], usa: ['cotizar'] } },
    ],
  },
  {
    nombre: '1c. Stock del 15: respeta el 85% y no confunde la unidad reservada',
    turnos: [
      { cliente: 'tenes el 15?', espera: { escala: false, contiene: [/128/, /85 ?%/], noContiene: [CUOTAS, /79 ?%/, /sellado/], montos: [{ contado: '15' }], usa: ['buscar_equipos'] } },
      { cliente: 'aceptan transferencia?', espera: { escala: false, contieneAlguno: [/sii*/, /podes/, /aceptamos/], contiene: [/transferencia/] } },
      { cliente: 'y garantia tiene?', espera: { escala: false, contieneAlguno: [/1 mes/, /un mes/] } },
      { cliente: 'y puedo pagar con mercado pago?', espera: { escala: false, contiene: [/mercado pago/], contieneAlguno: [/sii*/, /podes/, /aceptamos/] } },
    ],
  },
  {
    nombre: '2. Lista 85-93 activa: conserva el rango en cada modelo y su precio',
    bateria: '85-93',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, contiene: [/85-93%/], montos: [{ contado: '13' }], noContiene: [/100 ?%/, CUOTAS] } },
      { cliente: 'y el 14?', espera: { escala: false, contiene: [/85-93%/], montos: [{ contado: '14' }], noContiene: [/100 ?%/, CUOTAS] } },
      { cliente: 'y el 14 plus?', espera: { escala: false, contiene: [/14 plus/, /85-93%/], montos: [{ contado: '14 Plus' }] } },
    ],
  },
  {
    nombre: '3b. Lista con dos 16: separa usado y sellado, el 16 Pro sigue usado',
    planilla: conDieciseisSellado,
    turnos: [
      { cliente: 'pasame la lista del 16 usado, 16 sellado y 16 pro', espera: { escala: false, contiene: [/16\b[^\n]*85 ?%/, /16\b[^\n]*sellado/, /16 pro[^\n]*90 ?%/], noContiene: [/16 pro[^\n]*sellado/], montos: [{ contado: '16', condicion: 'usado' }, { contado: '16', condicion: 'sellado' }, { contado: '16 Pro' }] } },
      { cliente: 'el 16 comun usado me interesa, cuanto de contado?', espera: { escala: false, montos: [{ contado: '16', condicion: 'usado' }], contiene: [/85 ?%/] } },
      { cliente: 'con 700 mil de entrega?', espera: { escala: false, montos: [{ cotiza: '16', entrega: 700000, condicion: 'usado' }], usa: ['cotizar'] } },
    ],
  },
  {
    nombre: '4. Lista general: usa las líneas de la herramienta y pregunta el modelo',
    turnos: [
      { cliente: 'pasame la lista', espera: { escala: false, usa: ['lista_de_precios'], contieneAlguno: [/que modelo/, /cual.*interesa/, /cual.*busca/], noContiene: [CUOTAS] } },
      { cliente: 'pasame la del 13 y 15', espera: { escala: false, contiene: [/13[^\n]*128[^\n]*100 ?%/, /15[^\n]*128[^\n]*85 ?%/], montos: [{ contado: '13' }, { contado: '15' }] } },
      { cliente: 'el 15 con 600 mil?', espera: { escala: false, montos: [{ cotiza: '15', entrega: 600000 }], usa: ['cotizar'] } },
      { cliente: 'mejor el 13 con 340 mil', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }], usa: ['cotizar'] } },
    ],
  },
  {
    nombre: '5. Jazz: preguntó por el 13 y el 14 y nunca vio los precios; "y que precio estan / del 13 al 14 / y como serian las cuotas" → los dos precios y la financiación corta',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'hola, tenes el 13 y el 14?', hace: '1 dia' },
          { quien: 'bot', texto: 'sii, tenemos los dos. cual te interesa mas?', hace: '1 dia' },
        ],
        cliente: ['y que precio estan', 'del 13 al 14', 'y como serian las cuotas'],
        espera: {
          escala: false,
          montos: [{ contado: '13' }, { contado: '14' }],
          contieneAlguno: [/entrega inicial/, /[12] (o (2|dos) )?cuotas/, /(1|un) pago/, /dni/],
          compromiso: false,
        },
      },
      // Hay dos 14 (80% y 86% sin Face ID): cotizar uno o preguntar cuál (regla del 02/10) valen los dos.
      { cliente: 'el 14 con 400 mil', espera: { escala: false, contieneAlguno: [/cual/, /1 pago/, /(2|dos) (pagos|cuotas)/] } },
    ],
  },
  {
    nombre: '6. Cuotas sin modelo: explica DNI y compromiso, y recomienda por entrega o pide modelo (Ninjo 1b: decisión 5 del 05/10)',
    turnos: [
      { cliente: 'como son las cuotas?', espera: { escala: false, contiene: [/dni/, /compromiso/, /entrega|retir/, /2|dos/], contieneAlguno: [/modelo/, /presupuesto/, /te recomiendo/], compromiso: false } },
      { cliente: 'quiero el 13', espera: { escala: false, contieneAlguno: [/cuanto.*(contas|entrega|tenes)/, /con cuanto/, /entrega.*pens/, /como.*pag/], noContiene: [/que modelo/] } },
      { cliente: '340 mil', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }], compromiso: true } },
      { cliente: 'cuando arranco a pagar las cuotas?', espera: { escala: false, contieneAlguno: [/mes que viene/, /proximo mes/, /mes siguiente/], compromiso: false } },
    ],
  },
  {
    nombre: '7. Pide seis cuotas: mantiene el límite de dos y cotiza cuando da los datos',
    turnos: [
      { cliente: 'en 6 cuotas?', espera: { escala: false, contieneAlguno: [/hasta.*(2|dos)/, /maximo.*(2|dos)/, /solo.*(2|dos)/, /1 o 2/, /en (2|dos) cuotas/] } },
      { cliente: 'bueno el 13 con 340 mil', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }] } },
      { cliente: 'y en 3 no se puede?', espera: { escala: false, contieneAlguno: [/hasta.*(2|dos)/, /maximo.*(2|dos)/, /solo.*(2|dos)/, /1 o 2/, /en (2|dos) cuotas/] } },
    ],
  },
  {
    nombre: '8b. Cotización del 14 Pro: recalcula ambas opciones al cambiar la entrega',
    turnos: [
      { cliente: '14 pro con 500 mil de entrega', espera: { escala: false, montos: [{ cotiza: '14 Pro', entrega: 500000 }], noMontos: [{ contado: '14 Pro' }], usa: ['cotizar'] } },
      { cliente: 'y si pongo 600 mil?', espera: { escala: false, montos: [{ cotiza: '14 Pro', entrega: 600000 }], usa: ['cotizar'] } },
      { cliente: 'y de contado cuanto era?', espera: { escala: false, montos: [{ contado: '14 Pro' }], usa: ['buscar_equipos'] } },
      { cliente: 'lo pienso y despues te digo', espera: { escala: false, maxMensajes: 2, noContiene: [/te aviso/, /\?/, /\$/] } },
    ],
  },
  {
    nombre: '9. La entrega cubre el equipo: informa contado sin cuotas ni saldo; si vuelve a preguntar cuándo lo retira, el día otra vez (nunca "cuando vos puedas")',
    turnos: [
      { cliente: 'quiero el 13 tengo 2 millones', espera: { escala: false, montos: [{ contado: '13' }], noContiene: [CUOTAS, /saldo/, /te sobra/], usa: ['cotizar'] } },
      { cliente: 'lo puedo pagar con mercado pago?', espera: { escala: false, contiene: [/mercado pago/], contieneAlguno: [/sii*/, /podes/, /aceptamos/] } },
      { cliente: 'cuando lo puedo retirar?', espera: { escala: false, contieneAlguno: [/que dia/, /cuando.*(podes|podrias|acerc)/], noContiene: [/cuando vos puedas/] } },
    ],
  },
  {
    nombre: '10. Entrega baja: mínimo, explicación y tercera insistencia en silencio',
    turnos: [
      { cliente: 'el 13 con 100 mil?', espera: { escala: false, montos: [{ minimo: '13' }], noContiene: [/te falt/, /diferencia/, /\?/] } },
      { cliente: 'solo junto 150 mil', espera: { escala: false, montos: [{ minimo: '13' }], contieneAlguno: [/financiar.*resto/, /permite.*(cuotas|financ)/, /deja.*(cuotas|financ)/], noContiene: [/te falt/, /diferencia/] } },
      { cliente: 'dale hacemelo con 150 igual', espera: { escala: true } },
    ],
  },
  {
    nombre: '11. Descuento insistido: sostiene el precio sin repetir números',
    turnos: [
      { cliente: 'me bajas algo del 13?', espera: { escala: false, contieneAlguno: [/el precio es ese/, /precio.*(fijo|mismo)/, /no.*descuento/], noContiene: [/\$/, /\d{1,3}\.\d{3}/, /\d+ ?mil\b/] } },
      { cliente: 'ni pagando efectivo?', espera: { escala: false, contieneAlguno: [/el precio es ese/, /precio.*(fijo|mismo)/, /no.*descuento/], noContiene: [/\$/, /\d{1,3}\.\d{3}/, /\d+ ?mil\b/] } },
      { cliente: 'dale un descuentito', espera: { escala: false, contieneAlguno: [/el precio es ese/, /precio.*(fijo|mismo)/, /no.*descuento/], noContiene: [/\$/, /\d{1,3}\.\d{3}/, /\d+ ?mil\b/] } },
    ],
  },
  {
    nombre: '12. Dólares: acepta a cotización del día, con monto concreto escala',
    turnos: [
      { cliente: 'aceptan dolares?', espera: { escala: false, contiene: [/dolar/, /dia/], contieneAlguno: [/sii*/, /aceptamos/, /tomamos/], noContiene: [/\d/, /\$/] } },
      { cliente: 'a la cotizacion del dia entonces?', espera: { escala: false, contieneAlguno: [/sii*/, /exacto/, /del dia/], noContiene: [/\d/, /\$/] } },
      { cliente: 'tengo 500 usd', espera: { escala: true } },
      { cliente: 'cuanto seria el 13 en dolares?', espera: { escala: true } },
    ],
  },
  {
    nombre: '13. Medios de pago: crédito no, Mercado Pago sí; débito, Ualá y cuotas bancarias escalan',
    turnos: [
      { cliente: 'aceptan tarjeta de credito?', espera: { escala: false, contiene: [/no/, /dni/, /compromiso/] } },
      { cliente: 'y mercado pago?', espera: { escala: false, contiene: [/mercado pago/], contieneAlguno: [/sii*/, /podes/, /aceptamos/] } },
      { cliente: 'con debito puedo?', espera: { escala: true } },
      { cliente: 'y con uala?', espera: { escala: true } },
      { cliente: 'cuotas del banco aceptan?', espera: { escala: true } },
      { cliente: 'con debito en un pago tampoco?', espera: { escala: true } },
    ],
  },
  {
    nombre: '14. Datos del negocio: reportados no, iCloud libre, sin seña, garantía y turnos',
    turnos: [
      { cliente: 'estan reportados?', espera: { escala: false, contieneAlguno: [/no.*reportad/, /ninguno.*reportad/] } },
      { cliente: 'son libres de icloud?', espera: { escala: false, contieneAlguno: [/libres?.*icloud/, /sin.*icloud/] } },
      { cliente: 'tengo que dejar seña?', espera: { escala: false, contieneAlguno: [/no.*(pedimos|hace falta|necesita).*sena/, /sin sena/], noContiene: [PROMETE_GUARDAR] } },
      { cliente: 'cuanta garantia tienen?', espera: { escala: false, contieneAlguno: [/1 mes/, /un mes/] } },
      { cliente: 'donde estan?', espera: { escala: false, contiene: [/belgrano 3090/, /turno/, /neuquen/] } },
    ],
  },
  {
    nombre: '15. Edad: con 18 basta DNI; si el comprador tiene 16 escala',
    turnos: [
      { cliente: 'tengo 18 puedo comprar financiado?', espera: { escala: false, contiene: [/dni/], contieneAlguno: [/sii*/, /podes/, /alcanza/] } },
      { cliente: 'para el 13 tengo 340 mil', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }] } },
      { cliente: 'en realidad seria para mi hermano, tiene 16 y lo pagaria el', espera: { escala: true } },
    ],
  },
  {
    nombre: '16a. Retiro es pedido de turno: pide día, luego hora y finalmente escala',
    turnos: [
      { cliente: 'para cuando me lo podes entregar?', espera: { escala: false, contieneAlguno: [/que dia/, /cuando.*(podes|podrias|acerc)/], noContiene: [/te lo entrego/, /te lo mando/] } },
      { cliente: 'puedo ir mañana?', espera: { escala: false, contieneAlguno: [/que hora/, /que horario/, /a que hora/] } },
      { despues: '5 min', cliente: 'mañana a las 17', espera: { escala: true } },
    ],
  },
  {
    nombre: '16b. Pasar a buscar y retirar: pregunta el día y aprovecha el miércoles ya dicho',
    turnos: [
      { cliente: 'cuando lo paso a buscar?', espera: { escala: false, contieneAlguno: [/que dia/, /cuando.*(podes|podrias|acerc)/] } },
      { cliente: 'el miercoles, cuando lo puedo retirar?', espera: { escala: false, contieneAlguno: [/que hora/, /que horario/, /a que hora/] } },
      { cliente: 'el miercoles 16:30', espera: { escala: true } },
    ],
  },
  {
    nombre: '18a. Pendiente reciente: otro modelo se responde, el ingreso prometido escala con la frase',
    turnos: [
      { antes: [{ quien: 'persona', texto: 'mañana entran los 13, te aviso', hace: '20 h' }], cliente: 'cuanto sale el 15?', espera: { escala: false, montos: [{ contado: '15' }], usa: ['buscar_equipos'] } },
      { cliente: 'y el 14 pro?', espera: { escala: false, montos: [{ contado: '14 Pro' }] } },
      { cliente: 'entraron los 13?', espera: { escala: true, motivo: [/manana entran los 13/, /te aviso/] } },
    ],
  },
  {
    nombre: '18b. Pendiente de hace cuatro días: consulta el stock actual sin prometer ingreso',
    turnos: [
      { antes: [{ quien: 'persona', texto: 'mañana entran los 13, te aviso', hace: '4 dias' }], cliente: 'entraron los 13?', espera: { escala: false, montos: [{ contado: '13' }], usa: ['buscar_equipos'], noContiene: [/te aviso/] } },
      { cliente: 'con 340 mil como queda?', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }] } },
      { cliente: 'puedo ir mañana?', espera: { escala: false, contieneAlguno: [/que hora/, /que horario/, /a que hora/] } },
    ],
  },
  {
    nombre: '19. Martina: el nombre en la promesa humana no oculta el pendiente reciente',
    nombreCliente: 'Martina',
    turnos: [
      { antes: [{ quien: 'persona', texto: 'Martina mañana entran los 13, te aviso', hace: '20 h' }], cliente: 'entraron los 13?', espera: { escala: true, motivo: [/manana entran los 13/, /te aviso/] } },
    ],
  },
  {
    nombre: '20. Oriana: una diferencia de canje cotizada por una persona no se recalcula',
    nombreCliente: 'Oriana',
    turnos: [
      { antes: [{ quien: 'cliente', texto: 'tengo un 14 pro y quiero el 16 pro', hace: '3 h' }, { quien: 'persona', texto: 'por tu 14 Pro para el 16 Pro serian $530.000 de diferencia', hace: '3 h' }], cliente: 'y por un 15 pro? cuanto deberia abonar de diferencia?', espera: { escala: true, motivo: [/canje|diferencia|persona/] } },
    ],
  },
  {
    nombre: '21. Caso 8142: acuerdo de canje cerrado, la diferencia jamás es entrega inicial',
    turnos: [
      { antes: [{ quien: 'cliente', texto: 'entrego mi 15 pro max por el 17 pro max', hace: '2 h' }, { quien: 'persona', texto: 'dale, tu 15 Pro Max y $1.025.000 de diferencia por el 17 Pro Max', hace: '2 h' }], cliente: 'dale, cuando te paso?', espera: { escala: true, noContiene: [/1\.025\.000/, /entrega inicial/] } },
    ],
  },
  {
    nombre: '22a. Canje sin persona: pide de a una lo que falta (bloque Ninjo 1b), nunca lo que ya dio, y con todo escala',
    turnos: [
      { cliente: 'tengo un 12 para entregar', espera: { escala: false, contieneAlguno: [/capacidad/, /almacenamiento/, /gb/, /bateria/], noContiene: [/que modelo (tenes|entregas|vas a entregar|queres entregar)\b/, /\$/] } },
      { cliente: 'es de 128 gb', espera: { escala: false, noContiene: [/cuantos gb/, /que capacidad/, /\$/] } },
      // El formato de la batería admite texto, no adjuntos: se representa su recepción en el mensaje.
      { cliente: 'tiene 87 de bateria, libre de icloud, ahi te mande las fotos', espera: { escala: false, noContiene: [/cuantos gb/, /que capacidad/, /que bateria/, /cuanta bateria/, /\$/] } },
      { cliente: 'no le cambiaron nada, esta impecable. quiero el 15 y pongo 400 mil arriba', espera: { escala: true } },
    ],
  },
  {
    nombre: '22b. Android e iPhone 8 no entran en canje; acepta datos de un 12 sin tasarlo',
    turnos: [
      { cliente: 'toman un samsung como parte de pago?', espera: { escala: false, contiene: [/solo.*iphone/, /11.*adelante/], noContiene: [/foto/, /que bateria/] } },
      // Ya se le dijo "solo del 11 en adelante": con otras palabras ("tampoco, el 8 no lo tomamos") también vale (03/10).
      { cliente: 'y un iphone 8?', espera: { escala: false, contieneAlguno: [/tampoco/, /11.*adelante/], noContiene: [/foto/, /que bateria/] } },
      // Bloque Ninjo 1b: con los datos del equipo todavía falta qué se lleva y cuánto pone arriba.
      { cliente: 'tengo tambien un iphone 12 de 128, bateria 87, libre de icloud y ya adjunte las fotos', espera: { escala: false, noContiene: [/que capacidad/, /que bateria/, /cuanta bateria/, /\$/] } },
    ],
  },
  {
    nombre: '23. Caso 7038: canje en curso no se convierte en financiación con mínimo en efectivo',
    estado: { modelo: 'iPhone 15', permuta: { ofrece: true, modelo: 'iPhone 12', capacidad_gb: 128, bateria: 87, tiene_fotos: true } },
    turnos: [
      { antes: [{ quien: 'cliente', texto: 'quiero cambiar mi 12 por el 15, es 128 gb, bateria 87, aca van las fotos', hace: '30 min' }], cliente: 'cuanto tendria que poner?', espera: { escala: true } },
    ],
  },
  {
    nombre: '24. Caso 3910 (bloque Ninjo 1b): el 18 ausente en planilla → "justo ese no me esta quedando, tengo el 17", con su precio y un aviso al grupo, sin escalar',
    planilla: sinModelo(/\b18\b/),
    turnos: [
      {
        cliente: 'tenes el 18?',
        espera: { escala: false, contieneAlguno: [/no me esta quedando/, /justo ese/], contiene: [/\b17\b/], montos: [{ contado: '17', condicion: 'sellado' }], aviso: true, noContiene: [/no tenemos/, /no hay/] },
      },
    ],
  },
  {
    nombre: '25. X, XR, XS, SE y 8 quedan fuera del catálogo sin dar precios',
    turnos: [
      { cliente: 'tenes iphone x?', espera: { escala: false, contieneAlguno: [/no.*trabajamos/, /trabajamos.*11/, /tampoco/, /del 11 en adelante/], noContiene: [/\$/, /\d{1,3}\.\d{3}/, CUOTAS] } },
      { cliente: 'y xr?', espera: { escala: false, contieneAlguno: [/no.*trabajamos/, /trabajamos.*11/, /tampoco/, /del 11 en adelante/], noContiene: [/\$/, /\d{1,3}\.\d{3}/] } },
      { cliente: 'xs tampoco?', espera: { escala: false, contieneAlguno: [/no.*trabajamos/, /trabajamos.*11/, /tampoco/, /del 11 en adelante/], noContiene: [/\$/, /\d{1,3}\.\d{3}/] } },
      { cliente: 'y el iphone se?', espera: { escala: false, contieneAlguno: [/no.*trabajamos/, /trabajamos.*11/, /tampoco/, /del 11 en adelante/], noContiene: [/\$/, /\d{1,3}\.\d{3}/] } },
      { cliente: 'iphone 8 tienen?', espera: { escala: false, contieneAlguno: [/no.*trabajamos/, /trabajamos.*11/, /tampoco/, /del 11 en adelante/], noContiene: [/\$/, /\d{1,3}\.\d{3}/] } },
      { cliente: 'y iphone 7?', espera: { escala: false, contieneAlguno: [/no.*trabajamos/, /trabajamos.*11/, /tampoco/, /del 11 en adelante/], noContiene: [/\$/, /\d{1,3}\.\d{3}/] } },
    ],
  },
  {
    nombre: '26. Chat de hace dos días: recuerda el 15 y no vuelve a presentarse',
    turnos: [
      { antes: [{ quien: 'cliente', texto: 'tenes el 15?', hace: '2 dias' }, { quien: 'bot', texto: 'sii, tenemos el iphone 15 de 128 gb', hace: '2 dias' }], cliente: 'hola, sigue disponible?', espera: { escala: false, contiene: [/15/], montos: [{ contado: '15' }], noContiene: [/soy fran/, /en que.*ayud/, /que modelo/] } },
      { cliente: 'tengo 600 para entregar', espera: { escala: false, montos: [{ cotiza: '15', entrega: 600000 }] } },
      { despues: '10 min', cliente: 'cuando lo puedo retirar?', espera: { escala: false, contieneAlguno: [/que dia/, /cuando.*(podes|podrias|acerc)/] } },
    ],
  },
  {
    nombre: '27. Modelo en el saludo: responde el 17 Pro Max sin pedirlo otra vez',
    turnos: [
      { cliente: 'hola, queria consultar por el 17 pro max', espera: { escala: false, contiene: [/17 pro max/, /sellado/], montos: [{ contado: '17 Pro Max' }], noContiene: [/que modelo/, CUOTAS] } },
      { cliente: 'con 1700000 de entrega?', espera: { escala: false, montos: [{ cotiza: '17 Pro Max', entrega: 1700000 }] } },
      { cliente: 'y garantia?', espera: { escala: false, contieneAlguno: [/1 mes/, /un mes/] } },
    ],
  },
  {
    nombre: '28. Contexto de 28 líneas: conserva el 14 Pro, 400 queda bajo el mínimo y 500 cotiza',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'quiero el 14 pro de 128', hace: '2 h' },
          { quien: 'bot', texto: 'dale, el 14 pro de 128 gb', hace: '2 h' },
          { quien: 'cliente', texto: 'es mi primer iphone', hace: '110 min' },
          { quien: 'bot', texto: 'dale, contame', hace: '110 min' },
          { quien: 'cliente', texto: 'tienen local?', hace: '100 min' },
          { quien: 'bot', texto: 'sii, Belgrano 3090, Neuquen, con turnos', hace: '100 min' },
          { quien: 'cliente', texto: 'soy de aca', hace: '90 min' },
          { quien: 'bot', texto: 'dale joya', hace: '90 min' },
          { quien: 'cliente', texto: 'tiene garantia?', hace: '80 min' },
          { quien: 'bot', texto: 'un mes de garantia', hace: '80 min' },
          { quien: 'cliente', texto: 'aceptan transferencia?', hace: '70 min' },
          { quien: 'bot', texto: 'sii, aceptamos transferencia', hace: '70 min' },
          { quien: 'cliente', texto: 'y mercado pago?', hace: '60 min' },
          { quien: 'bot', texto: 'sii, tambien', hace: '60 min' },
          { quien: 'cliente', texto: 'estan reportados?', hace: '50 min' },
          { quien: 'bot', texto: 'no, ninguno esta reportado', hace: '50 min' },
          { quien: 'cliente', texto: 'libres de icloud?', hace: '40 min' },
          { quien: 'bot', texto: 'sii, todos libres de icloud', hace: '40 min' },
          { quien: 'cliente', texto: 'piden seña?', hace: '30 min' },
          { quien: 'bot', texto: 'no pedimos seña', hace: '30 min' },
          { quien: 'cliente', texto: 'puede ser financiado?', hace: '25 min' },
          { quien: 'bot', texto: 'sii, entrega inicial y 1 pago o 2 cuotas, con dni y compromiso de pago', hace: '25 min' },
          { quien: 'cliente', texto: 'cuando empiezan las cuotas?', hace: '20 min' },
          { quien: 'bot', texto: 'el mes que viene', hace: '20 min' },
          { quien: 'cliente', texto: 'tengo 18', hace: '15 min' },
          { quien: 'bot', texto: 'sii, con tu dni alcanza', hace: '15 min' },
          { quien: 'cliente', texto: 'estoy viendo cuanto puedo entregar', hace: '10 min' },
          { quien: 'bot', texto: 'dale, contame con cuanto contas', hace: '10 min' },
        ],
        cliente: 'y con 400 cuanto me queda?',
        espera: { escala: false, montos: [{ minimo: '14 Pro' }], usa: ['cotizar'], noContiene: [/que modelo/, /te falta/, /diferencia/] },
      },
      { cliente: 'puedo poner 500 mil', espera: { escala: false, montos: [{ cotiza: '14 Pro', entrega: 500000 }], usa: ['cotizar'] } },
      { cliente: 'y con 600?', espera: { escala: false, montos: [{ cotiza: '14 Pro', entrega: 600000 }], usa: ['cotizar'] } },
    ],
  },
  {
    nombre: '29. Pedido mixto que escala: ni precio ni mensaje de espera acompañan la derivación',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'cuanto sale el 15 y mandame fotos de los dos', espera: { escala: true } },
    ],
  },
  {
    nombre: '30. Postventa: un equipo que no carga y una consulta de cuota requieren una persona',
    turnos: [
      { cliente: 'el que me vendieron no carga', espera: { escala: true } },
      { cliente: 'lo compre ayer, necesito solucionarlo', espera: { escala: true } },
      { cliente: 'y a quien le pago la cuota de ese equipo?', espera: { escala: true } },
    ],
  },
  {
    nombre: '31. Fotos, colores, envíos y accesorios: escala cada pedido sin inventar disponibilidad',
    turnos: [
      { cliente: 'me mandas fotos del 15?', espera: { escala: true } },
      { cliente: 'que colores tienen del 15?', espera: { escala: true } },
      { cliente: 'hacen envios a cipolletti?', espera: { escala: true } },
      { cliente: 'viene con cargador y funda?', espera: { escala: true } },
      { cliente: 'me podes mandar un video del equipo?', espera: { escala: true } },
    ],
  },
  {
    nombre: '32. Quiere una persona: escala sin prometer contacto',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'quiero hablar con alguien', espera: { escala: true } },
    ],
  },
  {
    nombre: '33. Pregunta si es bot o persona: escala sin negar ni confirmar identidad',
    turnos: [
      { cliente: 'sos un bot?', espera: { escala: true } },
      { cliente: 'sos una persona?', espera: { escala: true } },
    ],
  },
  {
    nombre: '34. Hola solo (bloque Ninjo 1b): "contame", sin segundo saludo ni preguntar el modelo, y luego usa los datos',
    turnos: [
      { cliente: 'hola', espera: { escala: false, contiene: [/contame/], noContiene: [/que modelo/, /\bhola\b/, /buenas/, /soy fran/, /todo bien por aca/], maxMensajes: 2 } },
      { cliente: 'el 13', espera: { escala: false, montos: [{ contado: '13' }], noContiene: [/que modelo/] } },
      { cliente: '340 para entregar', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }] } },
    ],
  },
  {
    nombre: '35. Lo va a pensar: cierre corto sin presión ni promesa de volver',
    turnos: [
      { cliente: 'tenes el 15?', espera: { escala: false, montos: [{ contado: '15' }] } },
      { cliente: 'con 600 mil?', espera: { escala: false, montos: [{ cotiza: '15', entrega: 600000 }] } },
      { cliente: 'gracias, lo voy a pensar', espera: { escala: false, maxMensajes: 2, noContiene: [/te aviso/, /aprovecha/, /apurate/, /\?/, /\$/] } },
    ],
  },
  {
    nombre: '36. Compró en otro lado: acepta el cierre sin insistir ni volver a cotizar',
    turnos: [
      { cliente: 'cuanto sale el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { despues: '1 dia', cliente: 'ya lo compre en otro lado', espera: { escala: false, maxMensajes: 2, noContiene: [/\?/, /\$/, /te aviso/, /oferta/, /descuento/] } },
    ],
  },
  {
    nombre: '37. Precio viejo del bot: consulta herramientas en cada turno y usa el vigente',
    turnos: [
      { antes: [{ quien: 'cliente', texto: 'cuanto sale el 15?', hace: '4 dias' }, { quien: 'bot', texto: 'el 15 de contado estaba $710.000', hace: '4 dias' }], cliente: 'cuanto sale hoy el 15?', espera: { escala: false, montos: [{ contado: '15' }], noContiene: [/710\.?000/] } },
      { cliente: 'y con 600 mil de entrega?', espera: { escala: false, montos: [{ cotiza: '15', entrega: 600000 }], usa: ['cotizar'] } },
      { cliente: 'recordame el contado', espera: { escala: false, montos: [{ contado: '15' }], noContiene: [/710\.?000/] } },
    ],
  },
  {
    nombre: '39. Tanda de tres mensajes: integra saludo, modelo y 600 mil en una cotización',
    turnos: [
      { cliente: ['hola', 'tenes el 15?', 'tengo 600'], espera: { escala: false, montos: [{ cotiza: '15', entrega: 600000 }], usa: ['cotizar'], noContiene: [/que modelo/, /con cuanto contas/] } },
      { cliente: 'y con 650?', espera: { escala: false, montos: [{ cotiza: '15', entrega: 650000 }] } },
      { cliente: 'puedo ir mañana?', espera: { escala: false, contieneAlguno: [/que hora/, /que horario/, /a que hora/] } },
      { cliente: 'a las 17', espera: { escala: true } },
    ],
  },
  {
    // Que conteste o escale da igual: lo que no puede pasar es que prometa guardarlo.
    nombre: '40. Guardar hasta el sábado: no promete reservarlo (conteste o escale)',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'me lo guardas hasta el sabado?', espera: { noContiene: [PROMETE_GUARDAR, /\bsi+,? te lo guardo/] } },
    ],
  },
  {
    nombre: '41. Enojo e insultos: escala sin discutir con el cliente',
    turnos: [
      { cliente: 'cuanto sale el 15?', espera: { escala: false, montos: [{ contado: '15' }] } },
      { cliente: 'me estas tomando el pelo boludo', espera: { escala: true } },
      { cliente: 'estoy re caliente, hace una hora que no me resuelven nada', espera: { escala: true } },
    ],
  },
  {
    nombre: '42. Batería exacta de una unidad: no convierte el rango del catálogo en medición',
    bateria: '85-93',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, contiene: [/85-93%/], montos: [{ contado: '13' }] } },
      { cliente: 'cuanto tiene de bateria exacto?', espera: { escala: true } },
    ],
  },
  {
    nombre: '43. Esquema de pago propio: mitad al cobrar y montos con fechas escalan',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'lo puedo pagar la mitad ahora y la mitad cuando cobre?', espera: { escala: true } },
      { cliente: 'te doy 100 mil hoy y 400 mil el viernes', espera: { escala: true } },
    ],
  },
  {
    nombre: '44. Local en Neuquén: dirección y turnos, con día y hora escala',
    turnos: [
      { cliente: 'tienen local?', espera: { escala: false, contiene: [/belgrano 3090/, /turno/, /neuquen/] } },
      { cliente: 'como se llama el negocio?', espera: { escala: false, contiene: [/somos iphone/, /nqn|neuquen/] } },
      { cliente: 'puedo ir mañana?', espera: { escala: false, contieneAlguno: [/que hora/, /que horario/, /a que hora/] } },
      { cliente: 'a las 17', espera: { escala: true } },
    ],
  },
  {
    nombre: '45. Audio transcripto: entiende trece pro y mantiene el modelo al cotizar',
    turnos: [
      { cliente: 'tenes el trece pro', espera: { escala: false, contiene: [/13 pro/, /128/, /100 ?%/], montos: [{ contado: '13 Pro' }], noContiene: [CUOTAS], usa: ['buscar_equipos'] } },
      { cliente: 'con 450 mil de entrega?', espera: { escala: false, montos: [{ cotiza: '13 Pro', entrega: 450000 }], usa: ['cotizar'] } },
      { cliente: 'y si entrego 500?', espera: { escala: false, montos: [{ cotiza: '13 Pro', entrega: 500000 }], usa: ['cotizar'] } },
      { cliente: 'cuanto era de contado el trece pro?', espera: { escala: false, montos: [{ contado: '13 Pro' }] } },
    ],
  },
);

// -------------------------------------------------------------------------------------------
// 46 a 63. Preguntas trampa de contexto (02/10/2026, de los chats reales de ese día, con nombres y
// montos cambiados). En todos, la respuesta correcta depende de leer el historial: un turno, un
// precio o una promesa de una persona, una compra anterior, la cuota que está pagando.
// -------------------------------------------------------------------------------------------
casos.push(
  {
    nombre: '46. Turno y reserva de una persona de ayer: "fran, te llegaron?" no es una consulta de stock → escala (Emanuel, 02/10)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'a donde tengo que ir a retirar el equipo?', hace: '26 h' },
          { quien: 'persona', texto: 'el 17 pro 100% me entra mañana a las 15hs al local', hace: '25 h' },
          { quien: 'cliente', texto: 'bueno dale, a esa hora puedo ir? resérvamelo que me lo llevo', hace: '25 h' },
          { quien: 'persona', texto: 'dale, perfecto ahi dejo avisado', hace: '25 h' },
          { quien: 'persona', texto: 'Belgrano 3090, capaz en maps te figura como somos piedra', hace: '25 h' },
          { quien: 'cliente', texto: 'joya a las 3 entonces? o un poquito mas tarde', hace: '25 h' },
          { quien: 'persona', texto: 'si podes venir 15.30 asi no te hago esperar', hace: '25 h' },
          { quien: 'cliente', texto: 'dale a esa hora estoy ahi', hace: '25 h' },
          { quien: 'cliente', texto: 'hola fran, hoy nos vemos a las 3:30', hace: '2 h' },
        ],
        cliente: 'fran, te llegaron?',
        espera: { escala: true },
      },
      { despues: '3 min', cliente: 'voy derecho para alla nomas?', espera: { escala: true } },
    ],
  },
  {
    nombre: '47. Cuota que pasó una persona hace 3 h: "si si" sigue el pago, no es una venta nueva → escala (Marga, 02/10)',
    turnos: [
      {
        antes: [
          { quien: 'persona', texto: 'hola margarita como estas?', hace: '3 h' },
          { quien: 'persona', texto: 'te paso el monto de la cuota actualizado 210.000', hace: '3 h' },
          { quien: 'persona', texto: 'te paso el alias para la transferencia', hace: '3 h' },
          { quien: 'cliente', texto: 'hola oki', hace: '3 h' },
        ],
        cliente: 'si si',
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '48. Ya compró y pide pagar otro día, sin historial en el chat → escala, sin preguntarle qué modelo busca (Facundo, 02/10)',
    turnos: [
      {
        cliente: 'hola fran, soy el que le vendiste el iphone 12 pro. te puedo transferir el jueves 8 lo que tenia que entregarte? recien cobro ese dia',
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '49. Clienta que está pagando las cuotas: un "consulta" no se contesta como venta nueva, y el canje de su equipo financiado escala (Abril, 02/10)',
    postventa: true,
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'quiero el 16 pro max financiado', hace: '35 dias' },
          { quien: 'persona', texto: 'listo abril, te queda en 2 cuotas y la ultima la pagas el mes que viene', hace: '34 dias' },
          { quien: 'cliente', texto: 'genial, gracias!', hace: '34 dias' },
        ],
        cliente: ['hola franco como estas?', 'consulta'],
        espera: { noContiene: [/que modelo/, /que estas buscando/, /que estabas mirando/], maxMensajes: 2 },
      },
      {
        cliente: 'esta es la ultima cuota del celu. si te entrego el 16 pro max que me vendieron, el 17 pro max en cuantas cuotas me quedaria?',
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '50. Quedó en algo por Instagram ("quedé por un 16, me mandaban turno") → escala (Mia, 02/10)',
    turnos: [
      { cliente: 'hola soy mia', espera: { escala: false } },
      {
        cliente: ['habia hablado x instagram', 'quede x un iphone 16', 'me iban a mandar turnito para mañana a la mañana'],
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '51. Una persona dijo hace 4 h "me fijo los colores y te digo": "pudiste ver los colores?" escala con esa frase (Fabián, 02/10)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'queria consultarte si te entraron 17 pro color blanco o turquesa', hace: '4 h' },
          { quien: 'persona', texto: 'ahora me fijo bien el tema de colores de los sellados y te digo', hace: '4 h' },
        ],
        cliente: 'franco buenas tardes, pudiste ver los colores? del 17 base',
        espera: { escala: true, motivo: [/color/] },
      },
    ],
  },
  {
    nombre: '52. Precio que confirmó una persona hace 29 h ("el 11 te lo dejo en 220") → escala, nunca otro precio de lista (Mica, 02/10)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'tenes el 11?', hace: '30 h' },
          { quien: 'persona', texto: 'si, el 11 te lo dejo en 220.000', hace: '29 h' },
          { quien: 'cliente', texto: 'dale, puede ser para despues de las 18hs?', hace: '29 h' },
          { quien: 'persona', texto: 'correcto, para despues de las 18hs podria ser', hace: '29 h' },
        ],
        cliente: ['hola buenas tardes', 'el 11 lo tenes aun?'],
        espera: { escala: true },
      },
      { cliente: ['$220.000 me habias dicho', 'transferencia'], espera: { escala: true } },
    ],
  },
  {
    nombre: '53. Garantía en curso que sigue una persona ("si me lo confirman hoy te lo cambio") → escala (Gabriel, 02/10)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'fran, el celu que me vendiste baja mucho la bateria, de 95 a 88', hace: '1 dia' },
          { quien: 'persona', texto: 'tranqui, lo vemos, estoy esperando que me confirmen un 15 pro con bateria alta', hace: '3 h' },
          { quien: 'persona', texto: 'si me lo confirman creo que para hoy tendria para cambiarlo', hace: '2 h' },
        ],
        cliente: 'fran buenas tardes, todo bien? dale, a ver que te dicen porfa',
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '54. "Me dijo que le escriba por el cable": accesorio y algo que dijo una persona fuera del chat → escala (Ale, 02/10)',
    turnos: [
      {
        cliente: 'hola buenas tardes, usted me habia dicho que le escriba por el tema de un cable para el celu, queria saber si le habian entrado',
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '55. Catálogo y después "el 15 pro cambia mucho con el 16?": la lista sí, comparar modelos en detalle escala (Kevin, 02/10)',
    turnos: [
      { cliente: 'buenas, me pasan el catalogo de iphone? usados y sellados', espera: { escala: false, usa: ['lista_de_precios'], maxMensajes: 4 } },
      { cliente: '15 pro cambia mucho con el 16 normal?', espera: { escala: true } },
    ],
  },
  {
    nombre: '56. Una persona cotizó ayer el 14 Pro con 400: "y si pongo 500?" sigue esa cotización → escala',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'el 14 pro con 400?', hace: '1 dia' },
          { quien: 'persona', texto: 'con 400 te quedan 2 cuotas de 150.000', hace: '1 dia' },
        ],
        cliente: 'y si pongo 500?',
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '57. Ver una publicación no es un acuerdo: "vi en las historias un 14 pro, lo tenes?" se contesta con el stock',
    turnos: [
      {
        cliente: 'hola, vi en las historias de instagram un 14 pro, lo tenes?',
        espera: { escala: false, contiene: [/14 pro/], montos: [{ contado: '14 Pro' }], noContiene: [CUOTAS], usa: ['buscar_equipos'] },
      },
    ],
  },
  {
    nombre: '58. "Te dejé la seña ayer, me lo guardaste?": no hay seña en el chat y nunca se promete guardar → escala',
    turnos: [{ cliente: 'te deje la seña ayer, me lo guardaste?', espera: { escala: true, noContiene: [PROMETE_GUARDAR] } }],
  },
  {
    nombre: '59. "No te acercás hasta Cipolletti?" es un envío → escala',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'tenes el 13?', hace: '20 min' },
          { quien: 'bot', texto: 'sii, tenemos el 13 de 128gb', hace: '19 min' },
        ],
        cliente: 'no te acercas hasta cipolletti? hoy podria ser?',
        espera: { escala: true },
      },
    ],
  },
  {
    nombre: '60. Un mensaje que no es para el negocio ("amor compra pan") → escala, sin contestarle como venta',
    turnos: [{ cliente: 'amor compra pan y leche porfa', espera: { escala: true } }],
  },
  {
    nombre: '61. La financiación y el PDF ya salieron ayer: "como era lo de las cuotas?" se contesta corto y sin PDF',
    estado: { compromisoEnviado: true, temasExplicados: { financiacion: true } },
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'como son las cuotas?', hace: '1 dia' },
          { quien: 'bot', texto: 'lo financiamos nosotros, con tu dni y un compromiso de pago, en 1 o 2 cuotas con una entrega inicial', hace: '1 dia' },
          { quien: 'bot', texto: '[doc: compromiso de pago] te paso el compromiso de pago', hace: '1 dia' },
        ],
        cliente: 'como era lo de las cuotas?',
        espera: { escala: false, compromiso: false, maxMensajes: 3, contieneAlguno: [/1 o 2/, /(2|dos) cuotas/, /(1|un) pago/] },
      },
    ],
  },
  {
    nombre: '62. Cliente que ya compró y retiró hace 19 días: "hola! como va?" no es una consulta nueva de modelo',
    postventa: true,
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'quiero el 13 de contado', hace: '20 dias' },
          { quien: 'persona', texto: 'listo, te espero el sabado a las 11', hace: '20 dias' },
          { quien: 'cliente', texto: 'gracias, ya lo retire, anda joya', hace: '19 dias' },
        ],
        cliente: 'hola! como va?',
        espera: { noContiene: [/que modelo/, /que estas buscando/, /que estabas mirando/], maxMensajes: 2 },
      },
    ],
  },
  {
    nombre: '63. Una persona le hizo un precio especial hace 2 h ("el 13 te lo dejo en 470 si venís hoy"): "a qué hora paso?" → escala',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'el 13 me lo dejas mas barato?', hace: '3 h' },
          { quien: 'persona', texto: 'el 13 te lo dejo en 470 si venis hoy', hace: '2 h' },
        ],
        cliente: 'dale, a que hora puedo pasar?',
        espera: { escala: true },
      },
    ],
  },
);

// -------------------------------------------------------------------------------------------
// 64 a 77. Ninjo bloque 1 (05/10/2026): llevar al turno, los acuses que no se le preguntan a
// Sonnet, la entrega que lee el código, la guardia (lo interno y los archivos que no van) y los
// datos fijos nuevos. Un acuse que no se le pregunta lleva `sinPreguntar: true`.
// -------------------------------------------------------------------------------------------
const QUE_DIA = [/que dia/, /cuando.*(podes|podrias|acerc)/];
const QUE_HORARIO = [/que hora/, /que horario/, /a que hora/];
// Caso 88 (decisión de Tomás del 06/10/2026): al "dale" después de la cotización, la pregunta por la opción.
const CUAL_CUOTA = /\b1 o (en )?2\b|\b(1|una) (cuota|pago) o\b|\bcual te cierra|\bcual (preferis|elegis|te conviene|te queda)|\bque opcion/;
const PROMETE_ARCHIVO = /\b(te (lo |la |los |las )?(paso|mando|envio|reenvio)|ahi van?)\b[^.\n]*\b(fotos?|videos?|pdf|archivo|ubicacion|link|compromiso)\b/;

casos.push(
  {
    nombre: '64. Ninjo: elige el 13 y lo paga de contado → el precio y qué día se puede acercar, en la misma respuesta; con el día, el horario; con día y hora, escala',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'me interesa, lo pago de contado', espera: { escala: false, montos: [{ contado: '13' }], contieneAlguno: QUE_DIA, noContiene: [CUOTAS] } },
      { cliente: 'el jueves', espera: { escala: false, contieneAlguno: QUE_HORARIO } },
      { cliente: 'a las 17', espera: { escala: true } },
    ],
  },
  {
    nombre: '65. Ninjo: la entrega paga el equipo entero (paga_de_contado) → con eso lo paga de contado, el precio y qué día se puede acercar',
    turnos: [
      {
        cliente: 'quiero el 13, tengo 600 mil',
        espera: { escala: false, montos: [{ cotiza: '13', entrega: 600000 }], contieneAlguno: QUE_DIA, noContiene: [CUOTAS, /saldo/, /te sobra/], usa: ['cotizar'] },
      },
    ],
  },
  {
    nombre: '66. Ninjo: acepta la cotización ("dale, me lo llevo") → en esa misma respuesta, qué día se puede acercar; sin "quedo atento" ni "estás seguro"',
    turnos: [
      { cliente: 'el 13 con 340 mil?', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }], usa: ['cotizar'] } },
      { cliente: 'dale, me lo llevo', espera: { escala: false, contieneAlguno: QUE_DIA, noContiene: [/quedo atento/, /seguro/] } },
    ],
  },
  {
    nombre: '67. Ninjo: cotiza y el cliente todavía no aceptó → no cierra con el turno',
    turnos: [
      { cliente: 'quiero el 13, tengo 340 mil', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }], noContiene: [/que dia/, /turno/, /acercar/] } },
      { cliente: 'y si pongo 400?', espera: { escala: false, montos: [{ cotiza: '13', entrega: 400000 }], noContiene: [/que dia/, /turno/, /acercar/] } },
    ],
  },
  {
    nombre: '68. Ninjo: "dale" justo después de la línea de la entrega inicial → no se le pregunta a Sonnet: no sale nada y no escala (decisión del 29/09)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'el 13 con 300 mil?', hace: '3 min' },
          {
            quien: 'bot',
            texto: 'mira, con los $300.000 al 13 todavia no llegamos, para retirarlo lo estamos pidiendo con $320.000 de entrega inicial. lo que queda lo haces en 1 o 2 cuotas',
            hace: '2 min',
          },
        ],
        cliente: 'dale',
        espera: { sinPreguntar: true, escala: false, maxMensajes: 0 },
      },
    ],
  },
  {
    nombre: '69. Ninjo: "ok" y después "👍" + "joya" juntos → al primero contesta Sonnet; a la tanda siguiente de acuses no se le pregunta (no sale nada y no escala)',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'ok', espera: { escala: false, maxMensajes: 2, noContiene: [/\$/] } },
      { cliente: ['👍', 'joya'], espera: { sinPreguntar: true, escala: false, maxMensajes: 0 } },
    ],
  },
  {
    nombre: '70. Ninjo: "dale" después de un "te cotizo" de una persona → no se le pregunta a Sonnet',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'tenes el 14 pro?', hace: '2 h' },
          { quien: 'persona', texto: 'ahi llego al local y te cotizo todo', hace: '2 h' },
        ],
        cliente: 'dale',
        espera: { sinPreguntar: true, escala: false, maxMensajes: 0 },
      },
    ],
  },
  {
    nombre: '71. Ninjo: entrega partida ("200 en efectivo y 150 por transferencia") → cotiza con $350.000: la suma la hace el sistema',
    turnos: [
      {
        cliente: 'quiero el 13, tengo 200 en efectivo y 150 por transferencia',
        espera: { escala: false, montos: [{ cotiza: '13', entrega: 350000 }], usa: ['cotizar'], noContiene: [/te falta/] },
      },
    ],
  },
  {
    nombre: '72. Ninjo: "medio palo" → $500.000: con eso paga el 13 de contado, y qué día se puede acercar',
    turnos: [
      {
        cliente: 'quiero el 13, tengo medio palo',
        espera: { escala: false, montos: [{ cotiza: '13', entrega: 500000 }], contiene: [/contado/], contieneAlguno: QUE_DIA, noContiene: [CUOTAS], usa: ['cotizar'] },
      },
    ],
  },
  {
    nombre: '73. Ninjo: con el 13 elegido, "tengo 420 dolares para entregar" → escala (un monto en dólares)',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'me interesa, tengo 420 dolares para entregar', espera: { escala: true } },
    ],
  },
  {
    nombre: '74. Ninjo: pide la ubicación → la dirección, sin prometer mandarle la ubicación ni un link',
    turnos: [{ cliente: 'me pasas la ubicacion del local?', espera: { escala: false, contiene: [/belgrano 3090/], noContiene: [PROMETE_ARCHIVO] } }],
  },
  {
    nombre: '75. Ninjo: pide de nuevo el PDF que ya se mandó → no promete mandarlo (el sistema lo manda una sola vez)',
    estado: { compromisoEnviado: true, temasExplicados: { financiacion: true } },
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'como son las cuotas?', hace: '1 dia' },
          { quien: 'bot', texto: 'lo financiamos nosotros, con tu dni y un compromiso de pago, en 1 o 2 cuotas con una entrega inicial', hace: '1 dia' },
          { quien: 'bot', texto: '[doc: compromiso de pago] te paso el compromiso de pago', hace: '1 dia' },
        ],
        cliente: 'me volves a mandar el pdf del compromiso? no lo encuentro',
        espera: { compromiso: false, noContiene: [PROMETE_ARCHIVO] },
      },
    ],
  },
  {
    nombre: '76. Ninjo: "son originales? de donde vienen?" y "estan reacondicionados?" → los importamos de Estados Unidos, si se les cambia algo se aclara',
    turnos: [
      { cliente: 'son originales? de donde vienen?', espera: { escala: false, contiene: [/estados unidos/], contieneAlguno: [/importa/] } },
      { cliente: 'y estan reacondicionados?', espera: { escala: false, contieneAlguno: [/estados unidos/, /importa/, /aclaramos/, /cambiamos/] } },
    ],
  },
  {
    nombre: '77. Ninjo: paga de contado y pregunta qué papeles necesita → de contado no necesita nada, solo venir',
    turnos: [
      { cliente: 'quiero el 13, lo pago de contado', espera: { escala: false, montos: [{ contado: '13' }], contieneAlguno: QUE_DIA } },
      {
        cliente: 'que papeles necesito?',
        espera: { escala: false, contieneAlguno: [/no necesitas nada/, /no hace falta nada/, /solo venir/, /no te pedimos nada/, /nada, solo/], noContiene: [/dni/, /compromiso/, /tarjeta/] },
      },
    ],
  },
);

// -------------------------------------------------------------------------------------------
// 78 a 104. Ninjo bloque 1b (05/10/2026, decisiones de Tomás): el contexto completo desde Evolution,
// la regla de 72 h (se escalan solo los tratos), las dos listas de usados, la cotización en el bloque
// y el PDF con el primer bloque, el cliente de cuotas (se recomienda por entrega) y los ajustes de
// venta (un modelo que no hay, el canje de a una cosa, el saludo solo, la tarjeta, la lista completa,
// el descuento, comparar). Las cuentas de la cotización que pasó una persona salen de la planilla del
// caso (`texto` como función), igual que los montos de `espera`.
// -------------------------------------------------------------------------------------------
const sheetsDeLaBateria = require('../src/sheets');
const cotizadorDeLaBateria = require('../src/cotizador');

/** La cotización del 13 con $350.000 que pasó una persona, con los números de la planilla del caso. */
function cotizacionDeUnaPersona(datos) {
  const fila = sheetsDeLaBateria.buscarTodas(datos, '13').find((f) => f.cotizable && f.precio_contado > 0);
  const cot = cotizadorDeLaBateria.cotizar(fila, 350000, datos.config);
  const pesos = cotizadorDeLaBateria.pesos;
  return `con $350.000 de entrega el 13 te queda en 1 pago de ${pesos(cot.pagoUnico)} o en 2 cuotas de ${pesos(cot.cuotaDe2)}`;
}
const CIERRA = [/cual te cierra/, /cual te (sirve|conviene|queda)/, /cual (preferis|elegis)/, /que opcion/];

casos.push(
  // --- 1. El contexto completo desde Evolution ------------------------------------------------
  {
    nombre: '78. Ninjo 1b, contexto: postventa que está en Evolution (compró el 13 hace 3 semanas y una persona le pasó el alias de las cuotas): "hola" → "contame", sin segundo saludo ni "qué modelo buscás"',
    postventa: true,
    evolution: [
      { quien: 'cliente', texto: 'buenas, quiero el 13 financiado', hace: '23 dias' },
      { quien: 'persona', texto: 'dale, te espero el sabado a las 11 en el local', hace: '23 dias' },
      { quien: 'cliente', texto: 'ya lo retire, anda joya, gracias!', hace: '21 dias' },
      { quien: 'persona', texto: 'genial! te paso el alias para las cuotas: somos.iphone.nqn', hace: '21 dias' },
      { quien: 'cliente', texto: 'listo, gracias', hace: '21 dias' },
    ],
    turnos: [{ cliente: 'hola', espera: { escala: false, contieneAlguno: [/contame/, /decime/, /te escucho/], noContiene: [/todo bien por aca/, /\by vos\b/, /\$/], maxMensajes: 2 } }],
  },
  {
    nombre: '79. Ninjo 1b, contexto: hace 1 día una persona le dio turno (está en Evolution) y "sigue en pie lo de mañana?" → escala',
    evolution: [
      { quien: 'cliente', texto: 'puedo pasar a buscar el 14 pro?', hace: '25 h' },
      { quien: 'persona', texto: 'dale, te espero mañana a las 18 en Belgrano 3090', hace: '24 h' },
      { quien: 'cliente', texto: 'perfecto, ahi estoy', hace: '24 h' },
    ],
    turnos: [{ cliente: 'sigue en pie lo de mañana?', espera: { escala: true } }],
  },
  {
    nombre: '80. Ninjo 1b, contexto: hace 3 días una persona le cotizó el 13 con $350.000 (con los números de la planilla, está en Evolution): "y en 2 cuotas cuanto era?" → vuelve a cotizar y sale el bloque',
    evolution: [
      { quien: 'cliente', texto: 'el 13 cuanto me queda con 350 de entrega?', hace: '3 dias' },
      { quien: 'persona', texto: cotizacionDeUnaPersona, hace: '3 dias' },
      { quien: 'cliente', texto: 'buenisimo, lo pienso y te aviso', hace: '3 dias' },
    ],
    turnos: [
      {
        cliente: 'y en 2 cuotas cuanto era?',
        espera: { escala: false, usa: ['cotizar'], montos: [{ cotiza: '13', entrega: 350000 }], contiene: [/haciendo una entrega de \$350\.000/, /este mes abonas solo la entrega/] },
      },
    ],
  },

  // --- 2. La regla de 72 h: se escalan solo los tratos ----------------------------------------
  {
    nombre: '81. Ninjo 1b, 72 h: hace 2 h habló una persona y "tienen recargo con tarjeta?" → el dato fijo (no es un trato)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'tenes el 13?', hace: '2 h' },
          { quien: 'persona', texto: 'si, el 13 lo tenemos al 100%', hace: '2 h' },
        ],
        cliente: 'tienen recargo con tarjeta?',
        espera: { escala: false, contiene: [/tarjeta/], contieneAlguno: [/dni/, /compromiso/] },
      },
    ],
  },
  {
    nombre: '82. Ninjo 1b, 72 h: hace 5 h habló una persona y "me pasas la direccion?" → la dirección',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'que modelos tienen?', hace: '5 h' },
          { quien: 'persona', texto: 'tenemos del 11 al 17 pro max, cual te interesa?', hace: '5 h' },
        ],
        cliente: 'me pasas la direccion?',
        espera: { escala: false, contiene: [/belgrano 3090/] },
      },
    ],
  },
  {
    nombre: '83. Ninjo 1b, 72 h: hace 3 h una persona dijo "ni bien lo tenga te lo paso" y el cliente "Dale gracias" → escala (una promesa pendiente)',
    turnos: [
      {
        antes: [
          { quien: 'cliente', texto: 'me pasas fotos del 15 pro?', hace: '3 h' },
          { quien: 'persona', texto: 'ni bien lo tenga te lo paso', hace: '3 h' },
        ],
        cliente: 'Dale gracias',
        espera: { escala: true },
      },
    ],
  },

  // --- 4. Las dos listas de usados --------------------------------------------------------------
  {
    nombre: '84. Ninjo 1b, listas: con LISTA 85-93 activa, "bateria al 100% tienen?" del 13 → las dos ("tengo en 85-93% $X, sino al 100% en $Y")',
    bateria: '85-93',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, contiene: [/85-93/], montos: [{ contado: '13' }] } },
      { cliente: 'bateria al 100% tienen?', espera: { escala: false, contiene: [/85-93/, /100/], montos: [{ contado: '13' }, { contado: '13', al100: true }], usa: ['buscar_equipos'] } },
    ],
  },
  {
    nombre: '85. Ninjo 1b, listas: un modelo que no tiene fila al 100% (el 14 Plus) → "al 100% justo no tengo" y sigue, sin escalar',
    bateria: '85-93',
    turnos: [
      { cliente: 'tenes el 14 plus?', espera: { escala: false, contiene: [/14 plus/, /85-93/], montos: [{ contado: '14 Plus' }] } },
      { cliente: 'y al 100% no tenes?', espera: { escala: false, contieneAlguno: [/justo no tengo/, /no tengo/, /no me (esta )?quedando/, /no hay/] } },
    ],
  },
  {
    nombre: '86. Ninjo 1b, listas: el 13 al 100% con LISTA 85-93 activa y $350.000 de entrega → cotiza el de LISTA (`al_100`), en el bloque',
    bateria: '85-93',
    turnos: [
      { cliente: 'tenes el 13 con bateria al 100%?', espera: { escala: false, montos: [{ contado: '13', al100: true }] } },
      { cliente: 'ese quiero, tengo 350 mil de entrega', espera: { escala: false, usa: ['cotizar'], montos: [{ cotiza: '13', entrega: 350000, al100: true }], contiene: [/100%/] } },
    ],
  },

  // --- 6. La cotización en el bloque y el PDF ---------------------------------------------------
  {
    nombre: '87. Ninjo 1b, bloque: "quiero el 13, tengo 350 mil" → un mensaje antes, el bloque (entrega, 1 cuota y 2 cuotas, cuándo arrancan) y "cual te cierra mas?", con el PDF',
    turnos: [
      {
        cliente: 'quiero el 13, tengo 350 mil',
        espera: {
          escala: false,
          usa: ['cotizar'],
          montos: [{ cotiza: '13', entrega: 350000 }],
          contiene: [/haciendo una entrega de \$350\.000 te quedarian/, /1 cuota de/, /o 2 cuotas de .* cada una/, /este mes abonas solo la entrega/],
          contieneAlguno: CIERRA,
          compromiso: true,
        },
      },
    ],
  },
  {
    nombre: '88. Ninjo 1b, la prueba en vivo del bloque 1: 300 → la entrega inicial sin PDF; 350 → el bloque con el PDF; "dale" → si en 1 o en 2 cuotas y qué día se puede acercar, juntos (decisión del 06/10)',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'lo quiero, tengo 300', espera: { escala: false, montos: [{ minimo: '13' }], compromiso: false, noContiene: [/te falt/, /cuota de/] } },
      { cliente: 'consegui 350', espera: { escala: false, montos: [{ cotiza: '13', entrega: 350000 }], compromiso: true, usa: ['cotizar'] } },
      { cliente: 'dale', espera: { escala: false, contiene: [CUAL_CUOTA], contieneAlguno: QUE_DIA, noContiene: [/cuando vos puedas/, /\$/] } },
    ],
  },
  {
    nombre: '89. Ninjo 1b, bloque: elige "las 2 cuotas" → qué día se puede acercar; el segundo bloque no lleva otro PDF',
    turnos: [
      { cliente: 'el 13 con 340 mil?', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }], compromiso: true } },
      { cliente: 'y con 400?', espera: { escala: false, montos: [{ cotiza: '13', entrega: 400000 }], compromiso: false } },
      { cliente: 'las 2 cuotas', espera: { escala: false, contieneAlguno: QUE_DIA, noContiene: [/cuando vos puedas/, /\$/] } },
    ],
  },
  {
    nombre: '90. Ninjo 1b, bloque: dos modelos con la misma entrega ("el 13 y el 15 con 450 mil") → los dos bloques en el mismo mensaje',
    turnos: [
      { cliente: 'cuanto me queda el 13 y el 15 con 450 mil de entrega?', espera: { escala: false, montos: [{ cotiza: '13', entrega: 450000 }, { cotiza: '15', entrega: 450000 }], maxMensajes: 4 } },
    ],
  },

  // --- 7. Cliente de cuotas: se recomienda por entrega ------------------------------------------
  {
    nombre: '91. Ninjo 1b, cuotas: "lo quiero en cuotas, que me recomendas? va a ser mi primer iphone" → un equipo con lo que lo retira (entrega mínima) y un presupuesto, sin precios de contado',
    turnos: [
      {
        cliente: 'lo quiero en cuotas, que me recomendas? va a ser mi primer iphone',
        espera: {
          escala: false,
          contiene: [/presupuesto/],
          contieneAlguno: [/retiras con/, /entrega/],
          noMontos: [{ contado: '13' }, { contado: '14' }, { contado: '15' }, { contado: '13 Pro' }],
        },
      },
    ],
  },
  {
    nombre: '92. Ninjo 1b, cuotas: "q iphone me alcanza con 750.000" → `que_me_alcanza`: lo que se lleva de contado y lo que retira con esa entrega',
    turnos: [
      { cliente: 'q iphone me alcanza con 750.000', espera: { escala: false, usa: ['que_me_alcanza'], contiene: [/750\.000/, /contado/], contieneAlguno: [/entrega/, /retiras/] } },
    ],
  },

  // --- 8. Ajustes de venta -----------------------------------------------------------------------
  {
    nombre: '93. Ninjo 1b, 8.1: "tenes el 15 pro max?" (no hay) → "justo ese no me esta quedando, tengo el X" con el más parecido y su precio, y aviso al grupo; el chat sigue',
    turnos: [
      { cliente: 'tenes el 15 pro max?', espera: { escala: false, contieneAlguno: [/no me esta quedando/, /justo ese/], montos: [{ contado: '15 Pro' }], aviso: true, noContiene: [/no tenemos/, /no hay/] } },
      { cliente: 'y el 15 pro con 600 mil?', espera: { escala: false, montos: [{ cotiza: '15 Pro', entrega: 600000 }] } },
    ],
  },
  {
    nombre: '94. Ninjo 1b, 8.2 canje: de a una cosa (capacidad, batería, si le cambiaron algo, fotos, cuánto pone arriba), sin volver a pedir lo que dio, y con todo escala',
    turnos: [
      { cliente: 'tengo un 13 para entregar por un 15', espera: { escala: false, contieneAlguno: [/capacidad/, /almacenamiento/, /gb/], noContiene: [/foto/, /\$/] } },
      { cliente: 'es de 128', espera: { escala: false, contiene: [/bateria/], noContiene: [/capacidad/, /cuantos gb/, /\$/] } },
      { cliente: 'tiene 89%', espera: { escala: false, contieneAlguno: [/cambiaron/, /cambio/, /detalle/, /arreglo/, /reparad/], noContiene: [/que bateria/, /cuanta bateria/, /\$/] } },
      { cliente: 'no, nada, esta impecable', espera: { escala: false, contiene: [/foto/], noContiene: [/\$/] } },
      { cliente: 'ahi te mande las fotos', espera: { escala: false, contieneAlguno: [/cuanto/, /arriba/, /entrega/, /pones/], noContiene: [/que bateria/, /capacidad/, /\$/] } },
      { cliente: 'pongo 350 mil arriba', espera: { escala: true } },
    ],
  },
  {
    nombre: '95. Ninjo 1b, 8.2 canje: dos equipos ("un 13 mas el mio que es un 12 por un 16 pro") → pregunta por los dos juntos',
    turnos: [{ cliente: 'te doy un 13 mas el mio que es un 12 por un 16 pro', espera: { escala: false, contiene: [/\b13\b/, /\b12\b/], noContiene: [/\$/] } }],
  },
  {
    nombre: '96. Ninjo 1b, 8.2 canje: el mini → "el mini por el momento no lo estamos tomando"',
    turnos: [{ cliente: 'tengo un 13 mini para entregar', espera: { escala: false, contiene: [/mini/], contieneAlguno: [/no lo estamos tomando/, /no (lo )?estamos tomando/, /no lo tomamos/], noContiene: [/foto/, /\$/] } }],
  },
  {
    nombre: '97. Ninjo 1b, 8.2 canje: roto o con detalles también se toma → "sii, lo tomamos igual, contame que tiene"',
    turnos: [{ cliente: 'tengo un 14 con la pantalla rota, me lo toman?', espera: { escala: false, contieneAlguno: [/lo tomamos/, /tomamos igual/], noContiene: [/no lo tomamos/, /\$/] } }],
  },
  {
    nombre: '98. Ninjo 1b, 8.3: "buenas, como va?" solo → "contame", sin "todo bien por aca, y vos?" ni qué modelo busca',
    turnos: [{ cliente: 'buenas, como va?', espera: { escala: false, contiene: [/contame/], noContiene: [/todo bien por aca/, /\by vos\b/, /que modelo/], maxMensajes: 2 } }],
  },
  {
    nombre: '99. Ninjo 1b, 8.4: "se puede con tarjeta?" (sin aclarar) → la respuesta de la tarjeta de crédito, sin escalar',
    turnos: [{ cliente: 'se puede pagar con tarjeta?', espera: { escala: false, contiene: [/dni/, /compromiso/], contieneAlguno: [/credito/, /tarjeta/] } }],
  },
  {
    nombre: '100. Ninjo 1b, 8.5: "me pasas la lista completa?" → la lista en dos mensajes tal cual (usados y sellados)',
    // La lista de LISTA (08/10/2026): con el stock de la app en vivo la lista es la del local (el 116), así que este
    // corre con el stock apagado, sea cual sea el del .env.
    stockApp: 'apagado',
    turnos: [{ cliente: 'me pasas la lista completa? usados y sellados', espera: { escala: false, usa: ['lista_de_precios'], contiene: [/^ip 13 /m, /^ip 17 /m], maxMensajes: 4 } }],
  },
  {
    nombre: '101. Ninjo 1b, 8.6: "me haces descuento?" → "los precios son fijos" y la financiación sin tarjeta, con cuánto cuenta; sin números',
    turnos: [
      { cliente: 'me haces descuento?', espera: { escala: false, contieneAlguno: [/precios son fijos/, /precio es fijo/], contiene: [/entrega/], noContiene: [/\$/, /\d{1,3}\.\d{3}/, /\d+ ?mil\b/] } },
    ],
  },
  {
    nombre: '102. Ninjo 1b, 8.7: comparar modelos sigue escalando ("que diferencia hay entre el 14 y el 15?")',
    turnos: [{ cliente: 'que diferencia hay entre el 14 y el 15? cual me conviene?', espera: { escala: true } }],
  },
  {
    nombre: '103. Ninjo 1b, 8.8: ya se le preguntó el día y vuelve a preguntar cuándo lo retira → el día otra vez, con otras palabras (nunca "cuando vos puedas")',
    turnos: [
      { cliente: 'quiero el 15, lo pago de contado', espera: { escala: false, montos: [{ contado: '15' }], contieneAlguno: QUE_DIA } },
      { cliente: 'y cuando lo puedo retirar?', espera: { escala: false, contieneAlguno: [/que dia/, /cuando.*(podes|podrias|acerc|pasar)/], noContiene: [/cuando vos puedas/] } },
    ],
  },
  {
    nombre: '104. Ninjo 1b, 8.1: "tenes el 18?" con el 17 y el 17 Pro en la planilla → el más parecido, sin "no tenemos", y el chat sigue con lo que pregunte',
    planilla: sinModelo(/\b18\b/),
    turnos: [
      { cliente: 'tenes el 18 pro?', espera: { escala: false, contieneAlguno: [/no me esta quedando/, /justo ese/], contiene: [/17 pro/], aviso: true, noContiene: [/no tenemos/, /no hay/] } },
      { cliente: 'y garantia tienen?', espera: { escala: false, contieneAlguno: [/1 mes/, /un mes/] } },
    ],
  },
);

// -------------------------------------------------------------------------------------------
// 105 a 107. Entrega baja, paso 3 (06/10/2026, decisión de Tomás, la regla de negocio/financiacion.md):
// las dos primeras veces la entrega inicial, como siempre; a la tercera lo resuelve `cotizar` con el
// conteo del estado: si le faltan hasta $45.000, la excepción (el bloque con los montos de la
// excepción, presentada como excepción, sin recargo ni cuánto falta); si falta más, lo que sí se lleva
// con esa entrega (`con_esa_entrega`). Y el descuento de la prueba en vivo del 06/10 (paso 10): si ya
// dijo con cuánto cuenta, "los precios son fijos" y sigue donde estaba, sin repreguntar la entrega.
// Con la copia congelada el 13 pide $320.000: 300 mil queda a $20.000 (la excepción) y 220 mil a
// $100.000 (lo que sí se lleva: el 11 de 128). Con la planilla de hoy, los montos de `espera` se
// recalculan, pero el 13 tiene que seguir pidiendo cerca de $320.000 para que caigan del mismo lado.
// -------------------------------------------------------------------------------------------
const EXCEPCION = [/excepcion/, /te lo armo con esa entrega/, /mira como te queda/];
const LO_QUE_SI_SE_LLEVA = [/te podes llevar/, /podes llevarte/, /lo retiras con/, /con esa entrega/];
const PREGUNTA_ENTREGA = [/con cuanto (contas|contabas|contarias|tenes|podes|dispones)/, /cuanto (tenes|tendrias|podes|podrias|pensabas) (poner|entregar|para la entrega|de entrega)/, /cuanto contas/];

casos.push(
  {
    nombre: '105. Entrega baja, paso 3 (06/10): el 13 con 300 mil tres veces → dos veces la entrega inicial y a la tercera la excepción (la frase, el bloque con los montos de la excepción y "cual te cierra mas?", con el PDF), sin recargo ni "te falta"',
    turnos: [
      {
        cliente: 'quiero el 13, tengo 300 mil',
        espera: { escala: false, usa: ['cotizar'], montos: [{ minimo: '13' }], noMontos: [{ cotiza: '13', entrega: 300000, excepcion: true }], compromiso: false, noContiene: [/te falt/, /1 cuota de/, /2 cuotas de/, ...EXCEPCION] },
      },
      {
        cliente: 'no, 300 es lo que junto',
        espera: { escala: false, usa: ['cotizar'], montos: [{ minimo: '13' }], noMontos: [{ cotiza: '13', entrega: 300000, excepcion: true }], compromiso: false, noContiene: [/te falt/, /1 cuota de/, /2 cuotas de/, ...EXCEPCION] },
      },
      {
        cliente: 'y no me lo podes hacer con los 300?',
        espera: {
          escala: false,
          usa: ['cotizar'],
          montos: [{ cotiza: '13', entrega: 300000, excepcion: true }],
          // La entrega mínima ya se dijo dos veces: a la tercera no se la vuelve a decir.
          noMontos: [{ minimo: '13' }],
          contiene: [/haciendo una entrega de \$300\.000 te quedarian/, /1 cuota de/, /o 2 cuotas de .* cada una/],
          contieneAlguno: EXCEPCION,
          compromiso: true,
          noContiene: [/te falt/, /recargo/, /67 ?%/, /75 ?%/],
        },
      },
    ],
  },
  {
    nombre: '106. Entrega baja, paso 3 (06/10): el 13 con 220 mil tres veces → dos veces la entrega inicial y a la tercera lo que sí se lleva con esa entrega ("con esa entrega te podes llevar el 11 que lo retiras con $Y"), sin cotizar el 13 y sin "te falta"',
    turnos: [
      {
        cliente: 'el 13 con 220 mil de entrega?',
        espera: { escala: false, usa: ['cotizar'], montos: [{ minimo: '13' }], compromiso: false, noContiene: [/te falt/, /1 cuota de/, /2 cuotas de/] },
      },
      {
        cliente: 'mas de 220 no tengo',
        espera: { escala: false, usa: ['cotizar'], montos: [{ minimo: '13' }], compromiso: false, noContiene: [/te falt/, /1 cuota de/, /2 cuotas de/] },
      },
      {
        cliente: 'no llego a mas, hacemelo con los 220 igual',
        espera: {
          escala: false,
          usa: ['cotizar'],
          montos: [{ retiraCon: 220000, salvo: '13' }],
          contieneAlguno: LO_QUE_SI_SE_LLEVA,
          compromiso: false,
          noContiene: [/te falt/, /1 cuota de/, /2 cuotas de/, /recargo/, ...EXCEPCION],
        },
      },
    ],
  },
  {
    nombre: '107. Descuento sin repreguntar (prueba en vivo del 06/10, paso 10): ya dio la entrega y eligió las 2 cuotas, pide descuento → "los precios son fijos" y qué día se puede acercar, sin volver a preguntarle con cuánto cuenta',
    turnos: [
      { cliente: 'quiero el 13, tengo 340 mil', espera: { escala: false, usa: ['cotizar'], montos: [{ cotiza: '13', entrega: 340000 }], compromiso: true } },
      { cliente: 'las 2 cuotas', espera: { escala: false, contieneAlguno: QUE_DIA, noContiene: [/cuando vos puedas/] } },
      {
        cliente: 'y un descuentito no me haces?',
        espera: {
          escala: false,
          contiene: [/precios? (son|es) fijos?/],
          contieneAlguno: QUE_DIA,
          noContiene: [...PREGUNTA_ENTREGA, /\$/, /\d{1,3}\.\d{3}/, /\d+ ?mil\b/],
        },
      },
    ],
  },
);

// Sonnet ve las fotos del cliente (decisión de Tomás del 06/10/2026). …7442, canje del 16: mandó "16 común"
// y la captura de la batería al 90%, y Sonnet le repreguntó la capacidad (bien, faltaba) y la batería (estaba
// en la captura). La captura es armada (test/fixtures/captura-bateria-90.png), sin datos de nadie.
// "dale, ahi vi la bateria" sí vale: lo que no puede es pedírsela.
const PIDE_BATERIA = [
  /(?:que|cuanta|cuanto de|como esta la|condicion de|porcentaje de) ?(?:la )?bateria/,
  /bateria ?\?/,
  /(?:pasame|mandame|decime|fijate|contame) (?:la |de la |que )?bateria/,
];
casos.push({
  nombre: '108. Fotos (07/10, …7442): canje del 16, "16 comun" con la captura de la batería al 90% → pide la capacidad y no la batería',
  turnos: [
    {
      antes: [
        { quien: 'cliente', texto: 'hola, quiero cambiar mi iphone por uno mas nuevo, me lo toman?', hace: '6 min' },
        { quien: 'bot', texto: 'sii, tomamos iphone del 11 en adelante', hace: '5 min' },
        { quien: 'bot', texto: 'que iphone tenes?', hace: '5 min' },
      ],
      cliente: '16 comun',
      fotos: ['captura-bateria-90.png'],
      espera: {
        escala: false,
        contieneAlguno: [/capacidad/, /almacenamiento/, /\bgb\b/, /gigas/, /\b(?:128|256|512)\b/],
        noContiene: [...PIDE_BATERIA, /\$/, /\d{1,3}\.\d{3}/],
      },
    },
  ],
});

// 109 y 110. Turnos (decisión de Tomás del 07/10): el día y el horario en la misma respuesta, en dos
// mensajes; "hoy" o "ahora" escala sin preguntar el horario (la persona ve si tiene el equipo ese día).
casos.push(
  {
    nombre: '109. Turnos (07/10): elige "las 2 cuotas" → el día y el horario en la misma respuesta; con el día y la hora, escala',
    turnos: [
      { cliente: 'el 13 con 340 mil?', espera: { escala: false, montos: [{ cotiza: '13', entrega: 340000 }], usa: ['cotizar'] } },
      { cliente: 'las 2 cuotas', espera: { escala: false, contiene: [/que dia|cuando.*(podes|podrias|acerc)/, /que hora|que horario|a que hora/], noContiene: [/cuando vos puedas/, /\$/] } },
      { cliente: 'el viernes a las 18', espera: { escala: true } },
    ],
  },
  {
    nombre: '110. Turnos (07/10): acepta de contado y dice "puedo pasar hoy?" → escala sin preguntar el horario',
    turnos: [
      { cliente: 'tenes el 13?', espera: { escala: false, montos: [{ contado: '13' }] } },
      { cliente: 'me interesa, lo pago de contado', espera: { escala: false, montos: [{ contado: '13' }], contiene: [/que dia|cuando.*(podes|podrias|acerc)/, /que hora|que horario|a que hora/] } },
      { cliente: 'puedo pasar hoy?', espera: { escala: true } },
    ],
  },
);

// La foto en el historial y el canje de la ficha (decisiones de Tomás del 07/10/2026): en la tanda siguiente
// Sonnet ya no ve la captura, pero tiene "Cliente: [foto]" en el historial, su "dale, ahi vi la bateria" y
// el canje que anotó en la ficha ("canje que anotaste antes", `canjeFicha`, de 5 min antes del turno: el
// turno es a la hora de INICIO de bateria-cerebro.js, el martes 06/10 a las 15:00). Con "es de 128" no
// repregunta ni la batería ni la capacidad.
casos.push({
  nombre: '111. Fotos en el historial (07/10): "[foto]" de antes, "dale, ahi vi la bateria" y el canje anotado (iPhone 16 90%) → "es de 128": no repregunta la batería ni la capacidad',
  estado: { canjeSonnet: Date.parse('2026-10-06T14:55:00-03:00'), canjeFicha: { texto: 'iPhone 16 90%', ts: Date.parse('2026-10-06T14:55:00-03:00') } },
  turnos: [
    {
      antes: [
        { quien: 'cliente', texto: 'hola, quiero cambiar mi iphone por uno mas nuevo, me lo toman?', hace: '9 min' },
        { quien: 'bot', texto: 'sii, tomamos iphone del 11 en adelante', hace: '8 min' },
        { quien: 'bot', texto: 'que iphone tenes?', hace: '8 min' },
        { quien: 'cliente', texto: '16 comun', hace: '6 min' },
        { quien: 'cliente', texto: '[foto]', hace: '6 min' },
        { quien: 'bot', texto: 'dale, ahi vi la bateria', hace: '5 min' },
        { quien: 'bot', texto: 'de cuantos gb es?', hace: '5 min' },
      ],
      cliente: 'es de 128',
      espera: {
        escala: false,
        noContiene: [...PIDE_BATERIA, /capacidad/, /cuantos gb/, /cuantas gigas/, /almacenamiento/, /\$/, /\d{1,3}\.\d{3}/],
      },
    },
  ],
});

// 112 y 113. El parecido con la entrega que ya dio (decisión de Tomás del 08/10/2026; el caso real del tester del 07/10
// a las 23:51: "el 13 con 340 mil?" sin el 13 en la planilla, y Sonnet le pasó el 14 de contado, sin cuotas): si ya dijo
// con cuánto cuenta, el parecido se cotiza con esa entrega. La planilla del caso no tiene el 14 Plus ni las unidades
// sueltas del 14 (USADOS), así el más parecido al 14 Plus es el 14 de LISTA: con la copia congelada, el de 128GB al 80%
// a $540.000 con mínimo $360.000; con la LISTA de hoy, el de 128GB al 100% a $595.000 con mínimo $410.000. Con las dos,
// 450 mil llega (1 pago y 2 cuotas) y 350 mil no (la entrega inicial del 14).
const sinCatorcePlus = (p) => {
  const sin = sinModelo(/\b14 plus\b/i)(p);
  return { ...sin, usados: (sin.usados || []).filter((f) => !/^iphone 14$/i.test(String(f.modelo || '').trim())) };
};
const NO_ME_QUEDA = [/no me esta quedando/, /justo (?:el 14 plus|ese)/];
casos.push(
  {
    nombre: '112. Parecido con entrega (08/10): "el 14 plus con 450 mil?" (no hay) → "no me esta quedando", el parecido (el 14) cotizado con esa entrega en el bloque, sin el contado, con aviso al grupo',
    planilla: sinCatorcePlus,
    turnos: [
      {
        cliente: 'el 14 plus con 450 mil?',
        espera: {
          escala: false,
          usa: ['buscar_equipos', 'cotizar'],
          contieneAlguno: NO_ME_QUEDA,
          montos: [{ cotiza: '14', entrega: 450000 }],
          noMontos: [{ contado: '14' }],
          compromiso: true,
          aviso: true,
          maxMensajes: 4,
          noContiene: [/no tenemos/, /no hay\b/],
        },
      },
    ],
  },
  {
    nombre: '113. Parecido con entrega (08/10): "el 14 plus con 350 mil?" (no hay, y no llega al parecido) → el parecido (el 14) y la entrega inicial que pedimos para el 14, sin [cotizacion] y sin decir cuánto falta',
    planilla: sinCatorcePlus,
    turnos: [
      {
        cliente: 'el 14 plus con 350 mil?',
        espera: {
          escala: false,
          usa: ['buscar_equipos', 'cotizar'],
          contieneAlguno: NO_ME_QUEDA,
          montos: [{ minimo: '14' }],
          compromiso: false,
          aviso: true,
          noContiene: [/\b1 cuota de\b/, /\b2 cuotas de\b/, /\bfalta/, /no te alcanza/, /diferencia/, /no tenemos/],
        },
      },
    ],
  },
);

// 114 y 115. Otro modelo con la entrega ya dicha (decisión de Tomás del 08/10/2026, el hermano del 112): "el 13 con 450
// mil?" cotizado y después "y el 14?". Hasta ahí el 14 era otra consulta de stock (solo el contado); ahora se cotiza con
// la entrega que ya dijo, sin el contado y sin otro PDF (ya salió con el 13). Con 400 mil el 13 llega y el 14 no: la
// entrega inicial del 14. La planilla del caso deja una fila del 13 y una del 14 con los números de la LISTA de hoy (el
// 13 de 128GB al 100% a $535.000 con mínimo $370.000, el 14 a $595.000 con mínimo $410.000) y sin las unidades sueltas
// (USADOS): así anda igual con la copia congelada y con --planilla-en-vivo (los coeficientes son los de cada una).
const DE_HOY = { 'iphone 13': { precio_contado: 535000, anticipo_min: 370000 }, 'iphone 14': { precio_contado: 595000, anticipo_min: 410000 } };
const conTreceYCatorceDeHoy = (p) => {
  const cual = (f) => String(f.modelo || '').trim().toLowerCase();
  const puestos = new Set();
  const lista = [];
  for (const f of p.lista || []) {
    const m = cual(f);
    if (!DE_HOY[m]) lista.push(f);
    else if (!puestos.has(m)) {
      puestos.add(m);
      lista.push({ ...f, capacidad_gb: 128, condicion: 'Usado', bateria_min: 100, bateria_texto: '', precio_cotizacion: 0, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true, ...DE_HOY[m] });
    }
  }
  return { ...p, lista, usados: (p.usados || []).filter((f) => !DE_HOY[cual(f)]) };
};
// Que nombre el 14 él (no alcanza con el bloque, que dice "iPhone 14 128GB"): "el 14 de 128gb", "al 14 todavia no llegamos".
const EL_CATORCE = [/\b(?:el|al|del) 14\b/, /\b(?:el|al|del) iphone 14\b/];
casos.push(
  {
    nombre: '114. Otro modelo con la entrega ya dicha (08/10): "el 13 con 450 mil?" cotizado y "y el 14?" → el 14 cotizado con esa entrega en el bloque, sin el contado y sin otro PDF',
    planilla: conTreceYCatorceDeHoy,
    turnos: [
      {
        cliente: 'el 13 con 450 mil?',
        espera: { escala: false, usa: ['cotizar'], montos: [{ cotiza: '13', entrega: 450000 }], compromiso: true },
      },
      {
        cliente: 'y el 14?',
        espera: {
          escala: false,
          usa: ['cotizar'],
          contieneAlguno: EL_CATORCE,
          montos: [{ cotiza: '14', entrega: 450000 }],
          noMontos: [{ contado: '14' }],
          compromiso: false,
          maxMensajes: 4,
          noContiene: [/no me esta quedando/, /no tenemos/],
        },
      },
    ],
  },
  {
    nombre: '115. Otro modelo con la entrega ya dicha (08/10): "el 13 con 400 mil?" cotizado y "y el 14?" (no llega al 14) → la entrega inicial que pedimos para el 14, sin [cotizacion] y sin decir cuánto falta',
    planilla: conTreceYCatorceDeHoy,
    turnos: [
      {
        cliente: 'el 13 con 400 mil?',
        espera: { escala: false, usa: ['cotizar'], montos: [{ cotiza: '13', entrega: 400000 }], compromiso: true },
      },
      {
        cliente: 'y el 14?',
        espera: {
          escala: false,
          usa: ['cotizar'],
          contieneAlguno: EL_CATORCE,
          montos: [{ minimo: '14' }],
          compromiso: false,
          noContiene: [/\b1 cuota de\b/, /\b2 cuotas de\b/, /\bfalta/, /no te alcanza/, /diferencia/],
        },
      },
    ],
  },
);

// 116 y 117. La lista del local y lo que cita el cliente (decisiones de Tomás del 08/10/2026, 20:30, chat …3557: respondió
// a "iPhone 13 100%" del catálogo con "Hola a qe precio están" y Sonnet le mandó la LISTA entera, los precios del
// depósito). Con el stock de la app en vivo, la lista es lo del local sin repetir; lo del depósito, solo si pide un
// modelo que no está. La planilla del caso pone en USADOS (el local) las unidades del 08/10 (11 64GB 75% $190.000, 11
// 128GB 77% $210.000, tres 13 128GB 77% $480.000, dos 13 128GB 100% $535.000 y tres 14 Pro 128GB 100% $835.000) y deja
// en LISTA (el depósito) solo el 16 Pro y el 17 sellado: anda igual con la copia congelada y con --planilla-en-vivo.
const DEL_LOCAL_DEL_08 = [
  ['iPhone 11', 64, 75, 190000, 1],
  ['iPhone 11', 128, 77, 210000, 1],
  ['iPhone 13', 128, 77, 480000, 3],
  ['iPhone 13', 128, 100, 535000, 2],
  ['iPhone 14 Pro', 128, 100, 835000, 3],
];
const conElLocalDel08 = (p) => {
  const usados = [];
  for (const [modelo, capacidad_gb, bateria_min, precio_contado, cuantas] of DEL_LOCAL_DEL_08) {
    for (let k = 1; k <= cuantas; k++) {
      const id = `${modelo.replace(/^iPhone /, '').replace(/ Pro$/, 'P')}-${capacidad_gb}-${String(bateria_min)}${k}`;
      usados.push({ origen: 'USADOS', id, modelo, capacidad_gb, color: 'Negro', bateria_min, condicion: '', detalles: '', precio_contado, precio_cotizacion: 0, anticipo_min: 0, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true });
    }
  }
  const delDeposito = (f) => /^iphone 16 pro$/i.test(f.modelo) || (/^iphone 17$/i.test(f.modelo) && /^sellad/i.test(String(f.condicion || '')));
  return { ...p, lista: (p.lista || []).filter(delDeposito), usados };
};
// Las líneas de la lista del local, como las arma el código ("ip 13 128gb 77% 480.000"), en minúsculas como el chequeo.
const LINEAS_DEL_LOCAL = DEL_LOCAL_DEL_08.map(([modelo, gb, bat, precio]) => new RegExp(`^${modelo.toLowerCase().replace(/^iphone /, 'ip ')} ${gb}gb ${bat}% ${precio.toLocaleString('es-AR').replace('.', '\\.')}$`, 'm'));
const NUESTRO_STOCK = [/nuestros? (?:propios? )?stocks?/, /stocks? (?:propios?|nuestros?)/];
casos.push(
  {
    nombre: '116. Lista del local (08/10, …3557): "a que precio estan?" con el stock de la app en vivo → [lista] con los equipos del local (una línea por modelo, capacidad, batería y precio), nada del depósito',
    stockApp: 'vivo',
    planilla: conElLocalDel08,
    turnos: [
      {
        cliente: 'a que precio estan?',
        espera: {
          escala: false,
          usa: ['lista_de_precios'],
          contiene: LINEAS_DEL_LOCAL,
          noContiene: [/^ip 1[5-8]/m, /deposito/, ...NUESTRO_STOCK],
        },
      },
    ],
  },
  {
    nombre: '117. Lo que cita el cliente (08/10, …3557): "[responde a: iPhone 13 100%] Hola a qe precio están" → el 13 de 128GB al 100% de contado (del local), sin la lista',
    stockApp: 'vivo',
    planilla: conElLocalDel08,
    turnos: [
      {
        cliente: '[responde a: iPhone 13 100%] Hola a qe precio están',
        espera: {
          escala: false,
          usa: ['buscar_equipos'],
          montos: [{ contado: '13', bateria: '100%' }],
          noMontos: [{ contado: '13', bateria: '77%' }],
          contiene: [/\b100 ?%/],
          noContiene: [/^ip 1\d/m, /deposito/, ...NUESTRO_STOCK],
        },
      },
    ],
  },
);

// 118 a 120. Las fotos de los equipos del local (decisiones de Tomás del 08/10/2026; src/fotos-equipos.js): solo con el
// stock de la app en vivo (`stockVivo`), cuando el cliente PIDE fotos Sonnet llama a `mandar_fotos` y el código elige
// una foto por unidad del local, con el pie "15 128gb 87% 740.000". La planilla del caso deja el 13, el 14 y el 15 de
// LISTA con los números de hoy, el 16 Pro solo en LISTA (el depósito) y estas unidades en el local (USADOS, como las
// escribe el stock de la app: código y color): el 15 GRAPHITO 87 %, el 13 Rosa y Azul al 100 % y ROJO y dos verdes al
// 77 % (solo de contado), y el 14 al 100 % SIN color. Las fotos (`fotosDeEquipos`, el índice de un FOTOS_DIR temporal
// que arma el corredor): el 15 grafito solo, el 13 rosa y azul en una misma foto, el 13 rojo y el 13 verde solos.
const unidadDelLocal = (id, modelo, capacidad_gb, color, bateria, precio_contado, anticipo_min) => ({
  origen: 'USADOS',
  id,
  modelo,
  capacidad_gb,
  color,
  bateria_min: bateria,
  condicion: '',
  detalles: '',
  precio_contado,
  precio_cotizacion: 0,
  anticipo_min,
  pago_unico_manual: 0,
  cuota_2_manual: 0,
  cotizable: true,
  ...(anticipo_min > 0 ? {} : { solo_contado: true }),
});
const EQUIPOS_DEL_LOCAL = [
  unidadDelLocal('15-128-001', 'iPhone 15', 128, 'GRAPHITO', 87, 740000, 420000),
  unidadDelLocal('13-128-028', 'iPhone 13', 128, 'Rosa', 100, 535000, 370000),
  unidadDelLocal('13-128-029', 'iPhone 13', 128, 'Azul', 100, 535000, 370000),
  unidadDelLocal('13-128-013', 'iPhone 13', 128, 'ROJO', 77, 480000, 0),
  unidadDelLocal('13-128-025', 'iPhone 13', 128, 'verde', 77, 480000, 0),
  unidadDelLocal('13-128-026', 'iPhone 13', 128, 'verde', 77, 480000, 0),
  unidadDelLocal('14-128-008', 'iPhone 14', 128, '', 100, 595000, 410000),
];
const FOTOS_DEL_LOCAL = [
  { archivo: 'iPhone 15/grafito.jpg', modelo: 'iPhone 15', colores: [['grafito', 'graphito']] },
  { archivo: 'iPhone 13/rosa-azul.jpg', modelo: 'iPhone 13', colores: [['rosa'], ['azul']] },
  { archivo: 'iPhone 13/rojo.jpg', modelo: 'iPhone 13', colores: [['rojo']] },
  { archivo: 'iPhone 13/verde.jpg', modelo: 'iPhone 13', colores: [['verde']] },
];
const DE_HOY_CON_EL_15 = { ...DE_HOY, 'iphone 15': { precio_contado: 740000, anticipo_min: 420000 } };
const conEquiposDelLocal = (p) => {
  const cual = (f) => String(f.modelo || '').trim().toLowerCase();
  const puestos = new Set();
  const lista = [];
  for (const f of p.lista || []) {
    const m = cual(f);
    if (DE_HOY_CON_EL_15[m]) {
      if (puestos.has(m)) continue;
      puestos.add(m);
      lista.push({ ...f, capacidad_gb: 128, condicion: 'Usado', bateria_min: 100, bateria_texto: '', precio_cotizacion: 0, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true, ...DE_HOY_CON_EL_15[m] });
    } else if (m === 'iphone 16 pro') {
      // En el depósito: STOCK distinto de NO (con la planilla de hoy puede estar en NO).
      lista.push({ ...f, cotizable: true, stock: null });
    } else lista.push(f);
  }
  if (!lista.some((f) => cual(f) === 'iphone 16 pro')) {
    lista.push({ ...lista[0], id: 'N-16P', modelo: 'iPhone 16 Pro', capacidad_gb: 128, condicion: 'Usado', bateria_min: 100, bateria_texto: '', precio_contado: 1150000, anticipo_min: 700000, precio_cotizacion: 0, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true, notas: '', stock: null });
  }
  return { ...p, lista, usados: EQUIPOS_DEL_LOCAL.map((u) => ({ ...u })) };
};
const PROMETE_FOTOS = [/te (?:las? |los? )?(?:mando|paso|envio) (?:fotos?|manana|despues|mas tarde|en un rato)/, /te mando fotos/, /te paso fotos/];
casos.push(
  {
    nombre: '118. Fotos de los equipos (08/10): "me mostrás el 15?" con el 15 en el local → mandar_fotos y [fotos]: una foto con el pie "15 128gb 87% 740.000", sin escalar y sin prometer nada',
    stockVivo: true,
    planilla: conEquiposDelLocal,
    fotosDeEquipos: FOTOS_DEL_LOCAL,
    turnos: [
      {
        cliente: 'me mostrás el 15?',
        espera: { escala: false, usa: ['mandar_fotos'], fotos: 1, pies: [/^15 128gb 87% 740\.000$/], maxMensajes: 2, noContiene: PROMETE_FOTOS },
      },
    ],
  },
  {
    nombre: '119. Fotos de los equipos (08/10): "tenes fotos del 16 pro?" y el 16 pro está solo en el depósito → sin foto, [fotos_deposito] con la frase del depósito ("si no te las mando mañana") y el aviso al grupo, sin escalar',
    stockVivo: true,
    planilla: conEquiposDelLocal,
    fotosDeEquipos: FOTOS_DEL_LOCAL,
    turnos: [
      {
        cliente: 'tenes fotos del 16 pro?',
        espera: {
          escala: false,
          usa: ['mandar_fotos'],
          fotos: 0,
          fraseDeposito: true,
          contiene: [/ahora en el local no tengo este modelito/, /le pido fotos a los chicos del deposito/, /si no te las mando manana/],
          aviso: true,
          noContiene: [/te mando fotos/, /te paso fotos/, /\[fotos/],
        },
      },
    ],
  },
  {
    nombre: '120. Fotos de los equipos (08/10): "el 13 con 400 mil?" cotizado y "me pasas fotos del 13 y del 14?", el 14 del local sin color cargado → salen 3 fotos del 13 (la cotizada primera) y después escala por el 14 con su código',
    stockVivo: true,
    planilla: conEquiposDelLocal,
    fotosDeEquipos: FOTOS_DEL_LOCAL,
    turnos: [
      {
        cliente: 'el 13 con 400 mil?',
        espera: { escala: false, usa: ['cotizar'], compromiso: true },
      },
      {
        cliente: 'me pasas fotos del 13 y del 14?',
        espera: {
          escala: true,
          usa: ['mandar_fotos'],
          fotos: 3,
          primerPie: /^13 128gb 100% 535\.000/,
          pies: [/^13 128gb 77% 480\.000$/, /me quedo el de la izquierda, el rosa/],
          motivo: [/pidio fotos del iphone 14 y no tiene color cargado/],
        },
      },
    ],
  },
);

// Orden numérico para que las variantes queden junto a los seis ejemplos originales.
casos.sort((a, b) => a.nombre.localeCompare(b.nombre, 'es', { numeric: true }));

module.exports = casos;
module.exports.ayudas = { conDieciseisSellado, sinModelo, conEstadoLista, CUOTAS, PROMETE_GUARDAR };
