'use strict';
/**
 * Banco de casos de prueba, sacados de conversaciones reales del corpus.
 *
 * Cada caso es una conversación. `turnos` es la lista de mensajes del cliente;
 * cada turno puede llevar sus propias comprobaciones sobre lo que contestó el bot.
 *
 *   contiene       : todos estos textos tienen que aparecer en alguna respuesta
 *   contieneAlguno : alcanza con que aparezca uno (para frases con variantes)
 *   noContiene  : ninguno de estos puede aparecer
 *   escala      : true = tiene que avisar al grupo, false = no debe
 *   maxMensajes : tope de mensajes en esa respuesta
 *   silencio    : true = no le dice nada al cliente y escala (lo ve una persona)
 *   mudo        : true = no le dice nada al cliente y NO escala (no hay nada que contestar)
 *   entregaLeida: lo que se leyó como entrega en ese mensaje (null = no leyó monto).
 *                 No es lo guardado: una entrega vieja sigue en el estado igual.
 *   modeloLeido : el modelo que se leyó en ese mensaje, como lo devuelve la comprensión
 *                 ('11 pro', 'x'; null = ninguno). Bloque 8: "2 x 45" era un iPhone X.
 *   humano      : en lugar de `c`. Una persona escribió eso en el chat: entra al
 *                 historial como vendedor, igual que en index.js. No se evalúa.
 *   lectura     : pisa campos de lo que devuelve la comprensión en ese turno
 *                 ({ intencion: 'propone_pago' }, { modelo: null }). Simula una
 *                 lectura de Gemini que el extractor local no da.
 *   redactar    : false = en ese turno no se puede llamar a `gemini.redactar`
 *                 (offline devuelve la reserva igual, así que sin esto no se ve).
 *   descuento   : true = el cliente pidió descuento y en ese turno vale "te lo dejo en $"
 *                 (bloque 5). Sin esto, la regla global lo rechaza.
 *   saluda      : (bloque 9) true = el primer mensaje arranca con el saludo del día;
 *                 'devuelve' = con el que contesta el "¿cómo están?"; false = no saluda.
 *   juntos      : (bloque 9) todos estos textos en UN mismo mensaje.
 *   veces       : (bloque 9) { texto: n }: cuántas veces aparece cada uno en la respuesta.
 *   pasanHoras  : (bloque 9) en lugar de `c`. El reloj del chat se corre esas horas para
 *                 atrás: `{ pasanHoras: 24 }` es "la charla fue ayer". No se evalúa.
 *   reset       : (bloque 9) en lugar de `c`. El #reset: el chat queda como nuevo.
 *   vendido     : (28/09/2026) en lugar de `c`. El chat está marcado con #vendido (ya compró).
 *
 * Del caso (no del turno): `planilla` pisa la copia congelada, y `fotos` (bloque 8) son
 * los modelos que tienen foto en ese caso (una carpeta temporal con imágenes inventadas).
 */

const PLANILLA = require('./fixture-planilla');

/** Una unidad suelta de USADOS, disponible y con foto. */
function unidad(id, modelo, gb, bateria, color, detalles, contado, anticipo) {
  return {
    origen: 'USADOS',
    id,
    modelo,
    capacidad_gb: gb,
    color,
    bateria_min: bateria,
    detalles,
    precio_contado: contado,
    anticipo_min: anticipo,
    pago_unico_manual: 0,
    cuota_2_manual: 0,
    cotizable: true,
  };
}

/** La planilla de siempre pero con otras unidades, para probar el tope. */
function conUnidades(usados) {
  return { config: PLANILLA.config, lista: PLANILLA.lista, usados };
}

/**
 * La copia congelada con un XR (que no se trabaja) como el equipo más barato (bloque 10):
 * en la copia de siempre el XR ($290.000) no es el más barato, el 11 de 64GB ($260.000) sí.
 */
/**
 * Batería y sellado (01/10/2026). La batería que dice el bot sale de `Bateria_min` tal cual
 * (`bateria_texto`): con `#bateria 85-93` el 13 viene de LISTA 85-93 con "85-93". Y LISTA con
 * el 16 dos veces en 128GB, usado y sellado (como N-006 y N-0015 en la planilla del 01/10).
 */
const CON_13_8593 = {
  ...PLANILLA,
  lista: PLANILLA.lista.map((f) => (f.modelo === 'iPhone 13' ? { ...f, bateria_min: 85, bateria_texto: '85-93' } : f)),
};
const CON_16_SELLADO = {
  ...PLANILLA,
  lista: [
    ...PLANILLA.lista,
    {
      ...PLANILLA.lista.find((f) => f.modelo === 'iPhone 16'),
      id: 'N-0015',
      condicion: 'sellado ',
      bateria_min: 0,
      precio_contado: 1450000,
      anticipo_min: 900000,
      pago_unico_manual: 0,
      cuota_2_manual: 0,
    },
  ],
};

const CON_XR_BARATO = conUnidades([
  unidad('X-1', 'iPhone XR', 64, 90, 'Negro', '', 200000, 120000),
  ...PLANILLA.usados,
]);

/**
 * La prueba en vivo del 15/09/2026 (nombres inventados): dos modelos cotizados y
 * una tanda que pregunta por las cuotas, leída como `intencion`. Con propone_pago
 * el bot contestó "contame que estas buscando y con cuanto contas". Lea lo que
 * lea Gemini, tiene que explicar y preguntar por esos dos modelos.
 */
function cuotasEnVivo(intencion) {
  return {
    nombre: `Caso en vivo: dos modelos cotizados y la tanda de cuotas leída como ${intencion}`,
    pushName: 'Bruno',
    turnos: [
      { c: 'tenes iphones?' },
      {
        // Gemini no guardó ningún modelo con "un 13 o 14 pro".
        c: 'tengo en mente un 13 o 14 pro',
        lectura: { modelo: null },
        contiene: ['te paso el 13 y el 14 Pro, igualmente tenemos del 11 al 18 Pro Max', '495.000', '800.000'],
        noContiene: ['los dos'],
      },
      {
        // Desde el bloque 3b la explicación es una variante de estilo.js (se
        // financia, 1 o 2 cuotas, entrega inicial), va con el PDF del compromiso
        // y ya no lleva "el mes que viene" (eso solo si pregunta cuándo arranca).
        c: 'dalee tremendo\nvi que hacen cuotas\ncomo seria eso?',
        lectura: { intencion },
        contiene: [
          'financia',
          'entrega inicial',
          '[doc: compromiso de pago]',
          'decime cual te gusto mas, el 13 o el 14 Pro, y con cuanto contas para la entrega asi te armo los numeros',
        ],
        contieneAlguno: ['1 o 2 cuotas', 'hasta 2 cuotas'],
        noContiene: ['contame que estas buscando', 'brunoo', 'que dia', 'mes que viene'],
        maxMensajes: 3,
        escala: false,
      },
    ],
  };
}

module.exports = [
  // ---------- Apertura y stock ----------
  {
    nombre: 'Saludo seco, sin datos',
    turnos: [{ c: 'Hola buenas', noContiene: ['$'], escala: false }],
  },
  {
    nombre: 'Consulta de stock de un modelo (WA-024, Valentina)',
    turnos: [
      {
        c: 'Tienen disponibles iPhone 13?',
        contiene: ['$495.000'],
        contieneAlguno: ['tenemos en stock', 'tenemos iPhone 13', 'lo tenemos'],
        // Todavía no se habla de cuotas ni de entrega
        noContiene: ['financiarte', 'entrega inicial'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Pregunta precio de entrada (WA-018, emiliano)',
    turnos: [
      { c: 'Hola buenas queria consultar si tiene disponible el 13', contiene: ['$495.000'] },
    ],
  },
  {
    nombre: 'Pide varios modelos (WA-013, Sele)',
    turnos: [
      {
        c: 'quería saber el stock de iPhone q tenes y precios?',
        contiene: ['Siii te paso unos precios', 'igualmente tenemos del 11 al 18 Pro Max'],
        contieneAlguno: ['cual se acopla mas a vos', 'cual te gusto mas', 'cual te cierra mas'],
        // Con la lista NO se ofrecen cuotas: primero elige el modelo
        noContiene: ['entrega inicial', 'financiarte', 'cuotas'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Modelo que no está en la planilla',
    turnos: [
      {
        // No lo dejamos ir: ofrece lo más económico que sí hay y avisa al grupo
        c: 'tenes iphone 11 pro?',
        escala: true,
        contiene: ['no me esta quedando', 'te interesaba solo ese modelo'],
      },
    ],
  },
  // Mejora 1 (decisión del negocio del 16/09/2026): cuando escala, no promete un
  // contacto posterior ni niega que exista el modelo. Silencio y aviso al grupo.
  {
    nombre: 'Mejora 1: modelo que no está en la planilla, sin promesa ni negación',
    turnos: [
      {
        c: 'tenes el 12 pro max?',
        escala: true,
        contiene: ['justo no me esta quedando'],
        noContiene: ['no vendemos', 'no manejamos', 'no trabajamos con', 'te aviso', 'me fijo en el deposito'],
      },
    ],
  },
  {
    nombre: 'Mejora 1: modelo en la planilla pero no cotizable, escala callado',
    planilla: conUnidades([
      ...PLANILLA.usados,
      { ...unidad('U-901', 'iPhone 12 Pro', 128, 85, 'Grafito', '', 450000, 300000), cotizable: false },
    ]),
    turnos: [
      {
        c: 'tenes el 12 pro?',
        escala: true,
        silencio: true,
        noContiene: ['te aviso', 'dejame confirmar', 'no tenemos', 'no vendemos', 'no manejamos', 'no trabajamos con'],
      },
    ],
  },
  {
    nombre: 'Mejora 1: presupuesto por debajo de todo, sigue diciendo que no le queda nada',
    turnos: [{ c: 'tengo 100 mil', escala: false, contiene: ['no me queda nada para ofrecerte'], noContiene: ['te aviso'] }],
  },
  {
    // Si nombra un modelo, lo que redacte Gemini podría contestar también el stock:
    // no se llama a redactar y va la reserva de datos fijos.
    nombre: 'Mejora 1: consulta mezclada modelo + garantía, sin redactar',
    turnos: [{ c: 'tenes el 13 blanco? que garantia tiene?', redactar: false, contiene: ['1 mes de garantia'] }],
  },
  {
    nombre: 'Modelo inventado',
    turnos: [{ c: 'tenes el iphone 20 pro max?', noContiene: ['$'] }],
  },

  // ---------- Entrega y cotización ----------
  {
    nombre: 'Entrega exacta al mínimo',
    turnos: [
      { c: 'hola tenes el 15?' },
      { c: 'tengo 420 mil', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'], escala: false },
    ],
  },
  {
    nombre: 'Entrega por encima del mínimo: cotiza sin sermonear',
    turnos: [
      { c: 'hola tenes el 15?' },
      {
        c: 'tengo 600 mil',
        contiene: ['1 pago', '2 pagos'],
        // Ya dijo cuánto tiene: no se le habla de la entrega mínima al pedo. Y la
        // cotización no muestra el contado (Ajustes 1).
        noContiene: ['contra la entrega minima', 'Contado'],
      },
    ],
  },
  {
    nombre: 'Entrega por debajo del mínimo (WA-022, la caída más común)',
    turnos: [
      { c: 'hola, el 13 rosa' },
      {
        // 250 sobre un mínimo de 320: le faltan 70.000. Bloque 5b: la primera vez se
        // le dice solo la entrega inicial del 13, con la explicación y el PDF adelante.
        // Sin el contado, sin la diferencia, sin pregunta y sin bajar de gama.
        c: 'Tengo para entregar 250 ya',
        contiene: ['entrega inicial', '$320.000', '[doc: compromiso de pago]'],
        noContiene: ['no puedo', 'imposible', 'dejo anotado', 'faltarian', 'faltan', 'estirarte', 'arranca en', '$495.000', '70.000', '📱'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    nombre: 'Entrega muy por debajo, no hay alternativa (WA del corpus: los 100 mil)',
    turnos: [
      { c: 'quiero un 13' },
      {
        // Muy por debajo: primero se insiste con la entrega inicial (bloque 5b), no
        // se baja de gama ni se cierra en el primer intento.
        c: 'Y yo todo los meses tengo 100mil pesos',
        contiene: ['entrega inicial', '$320.000'],
        noContiene: ['anotado', 'estirarte', 'arranca en'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Dice el monto sin puntos ni "mil"',
    turnos: [
      { c: 'tenes el 14?' },
      { c: 'tengo 400000', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
    ],
  },
  {
    nombre: 'Dice el monto con puntos',
    turnos: [
      { c: 'tenes el 14?' },
      { c: 'cuento con 400.000', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
    ],
  },
  {
    nombre: 'Insiste sin decir la entrega: no debe repetir todo el bloque',
    turnos: [
      { c: 'tenes el 13?' },
      {
        // Hasta el 15/09/2026 pedía como mucho 2 mensajes (solo la explicación).
        // Ahora explica (con el PDF, bloque 3b), da la entrega de ese modelo y le pide la suya.
        c: 'y en cuotas como es?',
        contiene: ['financia', 'entrega inicial', '[doc: compromiso de pago]', 'para el iPhone 13 la entrega arranca en'],
        noContiene: ['de contado', 'igualmente tenemos', 'mes que viene'],
        maxMensajes: 4,
      },
    ],
  },
  {
    nombre: 'Cambia de modelo a mitad de la charla (WA-008, Abril)',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'tengo 400 mil' },
      // "quedé en 250" no se lee como entrega y hay 400 mil guardados. Antes
      // seguía con los 400 mil; ahora repregunta el monto (guarda de la entrega).
      {
        c: 'sabes que quedé en 250, no me alcanza. algun 13?',
        contiene: ['no te entendi bien el monto'],
        noContiene: ['$400.000'],
      },
      // Con el monto claro sigue con el 13, que quedó anotado.
      { c: 'tengo 250 mil', entregaLeida: 250000, contiene: ['13'], noContiene: ['$400.000'] },
    ],
  },

  // ---------- Permuta ----------
  // Bloque 5 (decisión de Tomás del 16/09/2026): se piden los datos sin "asi te
  // cotizamos" ni ninguna otra promesa, y recién cuando los manda escala callado.
  {
    nombre: 'Permuta con datos completos salvo fotos (WA-020, Sofii)',
    turnos: [
      {
        c: 'Hola hace plan canje? iPhone 14 Pro 128gb 82%',
        contiene: ['fotos'],
        noContiene: ['1 pago de', 'cotizamos'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Permuta sin ningún dato',
    turnos: [{ c: 'toman celulares como parte de pago?', contiene: ['11'], noContiene: ['cotizamos'], escala: false }],
  },
  {
    nombre: 'Permuta: insiste por el número sin mandar fotos',
    turnos: [
      { c: 'hago plan canje con mi 13 128gb 86%', noContiene: ['cotizamos'], escala: false },
      // Sin datos nuevos no escala. Sin "apenas me lo mandes te cotizamos la diferencia".
      { c: 'cuanto me queda de diferencia?', noContiene: ['Contado', '1 pago', 'cotizamos', 'apenas'], escala: false },
    ],
  },
  {
    nombre: 'Permuta de un modelo que no se toma',
    turnos: [{ c: 'me tomas un iphone 8 de parte de pago?', contiene: ['11'], noContiene: ['cotizamos'], escala: false }],
  },

  // ---------- Ubicación y turnos ----------
  // Cambió en septiembre de 2026, con 606 registros reales: la dirección va a la
  // primera (antes recién a la segunda), y un turno nunca se promete a nombre de
  // otra persona ("ahi te confirma fran el horario"): se pregunta lo que falta
  // para coordinar y se escala.
  {
    nombre: 'Pregunta ubicación: la dirección y que se atiende con turno, de una',
    turnos: [
      {
        c: 'hola donde estan ubicados?',
        contiene: ['Belgrano 3090', 'Neuquén capital', 'turno'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Pregunta ubicación dos veces: la dirección no se pierde por repetida',
    turnos: [
      { c: 'hola donde estan ubicados?', contiene: ['Belgrano 3090'] },
      { c: 'si pero donde queda exactamente?', contiene: ['Belgrano 3090'] },
    ],
  },
  {
    nombre: 'Pregunta ubicación después de aceptar: la dirección, pregunta el día y escala',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'tengo 500 mil' },
      {
        c: 'dale lo quiero, donde queda el local?',
        escala: true,
        contiene: ['Belgrano 3090', 'que dia'],
        noContiene: ['fran'],
      },
    ],
  },
  {
    nombre: 'Pregunta dónde está con tilde y en singular (registro real)',
    turnos: [
      {
        c: 'Bro dónde estás v',
        contiene: ['Belgrano 3090', 'turno'],
        noContiene: ['contame que estabas buscando'],
      },
    ],
  },
  {
    nombre: 'Pregunta por dónde, con tilde (registro real)',
    turnos: [{ c: 'Por dónde bro?', contiene: ['Belgrano 3090'] }],
  },
  {
    nombre: 'Pregunta dónde puede ver el equipo (registro real)',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'Donde lo puedo ver?', contiene: ['Belgrano 3090', 'turno'] },
    ],
  },
  {
    nombre: 'Pide la ubicación y quiere pasar mañana: la dirección, el horario y escala',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'puedo pasar por el local mañana?',
        escala: true,
        contiene: ['Belgrano 3090', 'hora'],
        noContiene: ['que dia', 'fran'],
      },
    ],
  },
  {
    nombre: 'Pide turno directo: ya dijo el día, pregunta el horario y escala',
    turnos: [
      {
        c: 'me podes dar un turno para hoy?',
        escala: true,
        contiene: ['hora'],
        noContiene: ['que dia', 'fran'],
      },
    ],
  },
  {
    nombre: 'Pide turno con palabras reales ("turnito"): pregunta el día y escala sin prometer a nadie',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'Antes no tendrías un turnito?',
        escala: true,
        contiene: ['que dia'],
        noContiene: ['fran', 'te confirma'],
      },
    ],
  },
  {
    nombre: 'Quiere avanzar después de cotizar: pregunta el día y escala sin prometer a nadie',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'tengo 500 mil' },
      { c: 'dale lo quiero', escala: true, contiene: ['que dia'], noContiene: ['fran', 'te confirma'] },
    ],
  },
  {
    nombre: 'Ya dijo el día (registro real): pregunta el horario, no el día de nuevo',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'O podemos ir mañana', escala: true, contiene: ['hora'], noContiene: ['que dia', 'fran'] },
    ],
  },
  {
    // Mejora 1: "dejame chequear si ese horario lo tenemos libre" era solo una
    // promesa. Con día y hora no queda nada que preguntar: escala callado.
    nombre: 'Dice día y hora: no confirma el horario ni promete fijarse, escala callado',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'puedo pasar mañana a las 16?',
        escala: true,
        silencio: true,
        noContiene: ['que dia', 'fran', 'iPhone 16'],
      },
    ],
  },
  {
    nombre: 'Contesta el día que le preguntamos: sigue coordinando y escala',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'tengo 500 mil' },
      { c: 'donde estan ubicados?', contiene: ['Belgrano 3090', 'que dia'], escala: false },
      { c: 'el sabado', escala: true, contiene: ['hora'], noContiene: ['fran'] },
    ],
  },
  {
    nombre: 'Pide punto de encuentro (WA-015, Agus)',
    turnos: [
      {
        c: 'ustedes tienen oficina o hacen puntos de encuentro? yo soy de Allen',
        escala: true,
        noContiene: ['fran'],
      },
    ],
  },

  // ---------- Datos fijos ----------
  {
    nombre: 'Pregunta si piden tarjeta (WA-007, Emilce)',
    turnos: [{ c: 'pedis recibo de sueldo o alguna tarjeta para las cuotas?', contiene: ['dni'] }],
  },
  {
    nombre: 'Pregunta por la garantía',
    turnos: [{ c: 'que garantia tienen los equipos?', contiene: ['garantia'] }],
  },
  {
    nombre: 'Pregunta si son reacondicionados (WA-014, emi)',
    turnos: [
      { c: 'no tiene piezas cambiadas dentro ni nada?', contiene: ['importa'] },
    ],
  },
  {
    nombre: 'Pregunta si transferencia vale lo mismo',
    turnos: [{ c: 'el precio en transferencia es el mismo q en efectivo?', escala: false }],
  },
  {
    nombre: 'Pregunta cuándo arrancan las cuotas',
    turnos: [{ c: 'las cuotas son por mes? cuando arranca la primera?', contiene: ['mes'] }],
  },

  // ---------- Medios de pago (registros reales de septiembre de 2026) ----------
  // Respuesta fija y SIN montos: la entrega depende del modelo y la calcula el
  // cotizador. Antes contestaba "contame que modelito tenias en mente".
  {
    nombre: 'Pregunta por los métodos de pago: contado o 2 cuotas, sin tarjeta, solo DNI',
    turnos: [
      {
        c: 'Quería consultar sobre los métodos de pago',
        contiene: ['contado', '2 cuotas', 'entrega inicial', 'tarjeta', 'dni'],
        noContiene: ['$', '.000', '%', 'contame que estabas buscando', 'modelito tenias en mente'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Pregunta formas de pago con un modelo en juego: tampoco tira el monto de la entrega',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'que formas de pago tienen?',
        contiene: ['contado', '2 cuotas', 'dni', 'depende del modelo'],
        noContiene: ['$', '.000', '%'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Pregunta stock, precios y medios de pago de una (registro real)',
    turnos: [
      {
        c: 'Hola buenas tardes. Quería consultar por stock, precios y medios de pago',
        contiene: ['contado', '2 cuotas', 'dni'],
        noContiene: ['$', 'contame que estabas buscando'],
        maxMensajes: 4,
        escala: false,
      },
    ],
  },

  // ---------- Documentación (registro real de septiembre de 2026) ----------
  // "Y que documentacion debo llevarte?" terminaba en una cotización. Respuesta
  // fija: solo el DNI, sin tarjeta de crédito.
  {
    nombre: 'Pregunta qué documentación llevar después de cotizar (registro real): solo DNI',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'tengo 500 mil' },
      {
        // Los requisitos ya salieron con la cotización, así que va la versión corta:
        // "si, solo con tu dni, no hace falta tarjeta". Antes pedía "tarjeta de
        // credito", que es la larga. Cambiado con la memoria por tema (14/09/2026).
        c: 'Y que documentacion debo llevarte ?',
        contiene: ['dni', 'tarjeta'],
        noContiene: ['$', '1 pago de', 'compromiso'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Pregunta qué papeles piden: solo DNI, sin tarjeta',
    turnos: [{ c: 'que papeles piden?', contiene: ['dni', 'tarjeta de credito'], escala: false }],
  },
  {
    nombre: 'Pregunta qué necesita llevar: solo DNI, sin tarjeta',
    turnos: [{ c: 'que necesito llevar?', contiene: ['dni', 'tarjeta de credito'], escala: false }],
  },

  // ---------- Saludo con pushNames reales (registros de septiembre de 2026) ----------
  // El pushName trae emojis, iniciales y símbolos. Antes se tomaba la primera
  // palabra tal cual y salían "🇦🇷Rsss, como va todo?" o "Hhh, como va todo?".
  {
    nombre: 'PushName con bandera e iniciales (🇦🇷RSS): saluda sin nombre y sin pedazos',
    pushName: '🇦🇷RSS',
    turnos: [
      {
        c: 'buenass',
        contieneAlguno: ['como estas', 'como andas', 'todo bien'],
        noContiene: ['🇦🇷', 'rss'],
      },
    ],
  },
  {
    nombre: 'PushName con dos iniciales (HH): no sale "Hhh" en el saludo del stock',
    pushName: 'HH',
    turnos: [{ c: 'tenes el 13?', contiene: ['$495.000'], noContiene: ['hhh', 'Hh,'] }],
  },
  {
    nombre: 'PushName de una sola letra (O): saluda sin nombre',
    pushName: 'O',
    turnos: [
      {
        c: 'buenass',
        contieneAlguno: ['como estas', 'como andas', 'todo bien'],
        noContiene: ['oo,', 'oo!'],
      },
    ],
  },
  {
    nombre: 'PushName con emoji al final (eze🇸🇪): el apodo sale entero, sin caracteres rotos',
    pushName: 'eze🇸🇪',
    turnos: [{ c: 'buenass', contiene: ['ezee'], noContiene: ['🇸🇪', '\uDDEA'] }],
  },
  {
    nombre: 'PushName con símbolos delante (~$hernan): saluda con el nombre limpio',
    pushName: '~$hernan',
    turnos: [{ c: 'buenass', contiene: ['hernann'], noContiene: ['~', '$'] }],
  },
  {
    nombre: 'PushName que es solo emojis: saluda sin nombre',
    pushName: '😃😃',
    turnos: [
      {
        c: 'buenass',
        contieneAlguno: ['como estas', 'como andas', 'todo bien'],
        noContiene: ['😃', '\uDE03'],
      },
    ],
  },
  {
    nombre: 'PushName con nombre y apellido: saluda solo con el nombre',
    pushName: 'Juan Pérez',
    turnos: [{ c: 'tenes el 13?', contiene: ['juann'], noContiene: ['pérez', 'perez'] }],
  },

  // ---------- Casos que tienen que ir a un humano ----------
  {
    nombre: 'Postventa: problema con un equipo comprado (WA-008)',
    turnos: [{ c: 'el iPhone me agarra señal pero dsp se va', escala: true, silencio: true }],
  },
  {
    nombre: 'Pide hablar con una persona',
    turnos: [{ c: 'puedo hablar con alguien?', escala: true, silencio: true }],
  },
  {
    // Bloque 5: el primer pedido no tiene números. Antes, "todo junto" lo mandaba por
    // el camino del contado ("perfecto, de contado el iPhone 13 te queda en…").
    nombre: 'Pide descuento',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'me haces un descuento si pago todo junto?', noContiene: ['te lo dejo en', '$'], escala: false },
    ],
  },
  // ---------- Bloque 5: validación comercial (decisiones de Tomás del 16/09/2026) ----------
  {
    // Sin descuento desde el 30/09/2026 (decisión de Tomás): hasta ahí el 2do pedido era el
    // contado − $10.000 y el 3ro lo repetía. Ahora los tres, "el precio es ese", sin números.
    nombre: 'Bloque 5: pide descuento tres veces (30/09: sin descuento, siempre sin precio)',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'me haces un descuento?', noContiene: ['$'], escala: false },
      { c: 'dale, me haces un descuento?', noContiene: ['$', 'te lo dejo en'], escala: false },
      { c: 'un descuentito mas?', noContiene: ['$', 'te lo dejo en'], escala: false },
    ],
  },
  {
    nombre: 'Bloque 5: pide descuento sin modelo en la charla, escala callado',
    turnos: [{ c: 'me haces un descuento?', escala: true, silencio: true }],
  },
  {
    nombre: 'Pide tres cuotas (el corpus dice que solo hay 1 o 2)',
    turnos: [
      { c: 'tenes el 14?' },
      { c: 'lo puedo hacer en 3 cuotas?', noContiene: ['3 cuotas de', '3 pagos de'] },
    ],
  },
  {
    nombre: 'Pregunta por envío a otra provincia',
    turnos: [{ c: 'hacen envios a Cordoba?', escala: true, silencio: true }],
  },
  {
    nombre: 'Quiere pagar en dólares (WA-025, Guido)',
    turnos: [
      { c: 'tenes el 14 pro? precio en dolares porfavor', escala: true, silencio: true, noContiene: ['usd 5'] },
    ],
  },
  {
    nombre: 'Propone un esquema de pago propio (WA-023, Estefii)',
    turnos: [
      { c: 'quiero el 14 pro' },
      { c: 'te puedo dar 50 mil ahora y el resto el 20?', escala: true, silencio: true },
    ],
  },

  // ---------- Tono y situaciones sociales ----------
  {
    nombre: 'El cliente se disculpa por demorar (WA-014)',
    turnos: [
      { c: 'perdona las molestias, estan atrasados con el pago en el trabajo', noContiene: ['$'] },
    ],
  },
  {
    nombre: 'Dice que el precio se le va',
    turnos: [
      { c: 'tenes el 16 pro?' },
      { c: 'uh se me va mucho', escala: false },
    ],
  },
  {
    nombre: 'Pregunta colores',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'que colores tenes?',
        // Mejora 1: sin "apenas llegue al local te mando la foto".
        contiene: ['decime que modelo te interesa mas'],
        noContiene: ['rosa', 'azul', 'negro', 'te mando la foto'],
        escala: true,
      },
    ],
  },
  {
    // Bloque 8 (decisión de Tomás del 24/09/2026): pedir fotos escala callado y avisa
    // al grupo con el modelo y #sinstock. Antes no tenía chequeo y seguía la venta.
    nombre: 'Pide fotos',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'me mandas fotos?', silencio: true },
    ],
  },
  {
    nombre: 'Mensaje confuso',
    turnos: [{ c: 'asdasd', noContiene: ['$'] }],
  },
  {
    nombre: 'Cliente enojado',
    turnos: [{ c: 'esto es una estafa, me quiero quejar', escala: true, silencio: true }],
  },
  // ---------- Transparencia sobre el equipo ----------
  {
    nombre: 'Equipo de USADOS con un detalle: hay que aclararlo (regla del corpus)',
    turnos: [{ c: 'tenes el iphone 12?', contiene: ['rayon'] }],
  },
  {
    // Desde cero, D4 (29/09/2026): usado o nuevo es el estado del equipo y escala callado.
    // Antes contestaba el texto de importados, que no contesta la pregunta.
    nombre: 'Pregunta si son nuevos o usados',
    turnos: [{ c: 'los celulares son nuevos o usados?', silencio: true, motivo: 'estado del equipo', noContiene: ['importa'] }],
  },
  {
    nombre: 'Pregunta si está liberado',
    turnos: [{ c: 'el 13 viene liberado?', escala: true, silencio: true }],
  },
  {
    nombre: 'Pregunta si viene con cargador (varía por semana)',
    turnos: [{ c: 'viene con cargador?', escala: true, silencio: true }],
  },
  {
    nombre: 'Modelo sellado: no debe hablar de porcentaje de batería',
    turnos: [{ c: 'cuanto sale el 17 pro?', noContiene: ['batería 0', 'bateria 0'] }],
  },

  // ---------- Variantes de mensaje ----------
  {
    nombre: 'Manda solo un número',
    turnos: [
      { c: 'tenes el 13?' },
      { c: '350000', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
    ],
  },
  {
    nombre: 'Pide una capacidad puntual',
    turnos: [{ c: 'tenes el 13 en 256?', noContiene: ['256GB'] }],
  },
  {
    nombre: 'Escribe todo junto y con errores',
    turnos: [{ c: 'holaa tenes ipone 13 cuanto sale', contiene: ['$495.000'] }],
  },
  {
    nombre: 'Manda varias preguntas de una',
    turnos: [
      {
        c: 'hola, tenes el 15? cuanto sale? hacen cuotas? donde estan?',
        maxMensajes: 4,
      },
    ],
  },
  {
    nombre: 'Pregunta por diferencia entre dos modelos',
    turnos: [{ c: 'que diferencia hay entre el 14 y el 15?', escala: true, silencio: true }],
  },
  {
    nombre: 'Insiste con un "hola?" sin agregar nada',
    turnos: [
      { c: 'hola tenes el 13?' },
      { c: 'hola?', maxMensajes: 2, noContiene: ['fotos'] },
    ],
  },

  // ---------- Cierre y reserva ----------
  {
    // Bloque 8 (decisiones de Tomás del 24/09/2026): no se pide seña y se sigue con el
    // turno. Como ya dice el día ("hasta mañana"), va el horario y escala como cualquier
    // turno. Antes escalaba callado.
    nombre: 'Pide que se lo guarden',
    turnos: [
      { c: 'tenes el 15?' },
      {
        c: 'me lo podes guardar hasta mañana?',
        contiene: ['no pedimos seña'],
        contieneAlguno: ['en que horario', 'a que hora'],
        noContiene: ['te lo guardo', 'te lo reservo'],
        escala: true,
      },
    ],
  },
  {
    nombre: 'Pregunta hasta qué hora atienden',
    turnos: [{ c: 'hasta que hora estan hoy?', contiene: ['turno'] }],
  },
  {
    nombre: 'Pregunta si hacen factura',
    turnos: [{ c: 'hacen factura A?', escala: true, silencio: true }],
  },
  {
    // Bloque 8 (decisión de Tomás del 24/09/2026): Mercado Pago se acepta. Antes escalaba callado.
    nombre: 'Pregunta por medios de pago',
    turnos: [{ c: 'aceptan mercado pago?', contiene: ['podes pagar con mercado pago'], noContiene: ['$'], escala: false }],
  },
  {
    nombre: 'Mitad ahora y mitad al retirar',
    turnos: [
      { c: 'quiero el 14' },
      { c: 'puedo pagar la mitad ahora y la mitad cuando lo retire?', escala: true, silencio: true },
    ],
  },

  // ---------- Tono ----------
  {
    nombre: 'Se disculpa: hay que contenerlo, no presionar (WA-014)',
    turnos: [
      { c: 'Disculpa q la molestia jaj', noContiene: ['$', 'turno'] },
    ],
  },
  {
    nombre: 'Dice que se le atrasó el sueldo',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'me interesa pero estan atrasados con el pago en el trabajo', noContiene: ['1 pago de'] },
    ],
  },
  {
    nombre: 'Agradece y se despide',
    turnos: [{ c: 'muchas gracias por la info!', noContiene: ['$'] }],
  },
  // ---------- Tono: los momentos que hacen que el cliente vuelva ----------
  {
    nombre: 'Se disculpa sin contexto previo',
    turnos: [
      { c: 'Disculpa q la molestia jaj', contiene: ['drama'], escala: false, noContiene: ['$'] },
    ],
  },
  {
    nombre: 'Se disculpa después de una cotización (WA-014)',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 350 mil' },
      { c: 'perdona, se me atraso el sueldo y no llego este mes', contiene: ['contacto'], escala: false },
    ],
  },
  {
    nombre: 'Agradece y cierra',
    turnos: [{ c: 'muchas gracias por la info!', contiene: ['quedo atento'], escala: false }],
  },
  {
    nombre: 'Manda algo ininteligible una vez: no molesta al grupo',
    turnos: [{ c: 'asdasd', escala: false }],
  },
  {
    nombre: 'Manda cosas ininteligibles dos veces: ahí sí avisa',
    turnos: [{ c: 'asdasd' }, { c: 'kkkkkk', escala: true, silencio: true }],
  },
  {
    nombre: 'Dice que no le pagaron en el trabajo',
    turnos: [
      { c: 'quiero el 15' },
      { c: 'no me pagaron todavia en el trabajo', contiene: ['drama'], escala: false },
    ],
  },

  // ---------- Más situaciones del corpus ----------
  {
    // Desde cero, D4 (29/09/2026): los detalles son el estado del equipo y escalan callado.
    nombre: 'Pregunta si tiene detalles el equipo (WA-024)',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tiene algun detalle?', silencio: true, motivo: 'estado del equipo' },
    ],
  },
  {
    nombre: 'Consulta por un modelo caro y después baja de gama',
    turnos: [
      { c: 'tenes el 17 pro?' },
      { c: 'es carisimo', contiene: ['otras opciones'] },
    ],
  },
  {
    nombre: 'Da la entrega antes de decir el modelo',
    turnos: [{ c: 'hola tengo 500 mil, que me llevo?', escala: false }],
  },
  {
    nombre: 'Pregunta genérica sin modelo ni monto',
    turnos: [{ c: 'hola, que me podes ofrecer?', escala: false, noContiene: ['financiarte'] }],
  },
  {
    nombre: 'Todos los mensajes arrancan con mayúscula',
    turnos: [
      // El stock ahora va partido y con varias formas de decirlo: alcanza con
      // que confirme que lo tenemos y que el precio aparezca.
      { c: 'hola tenes el 13?', contiene: ['$495.000'], contieneAlguno: ['tenemos', 'lo tenemos'] },
      { c: 'tengo 350 mil', contieneAlguno: ['Siii obviamente', 'Dale, el', 'Perfecto, con esos'] },
    ],
  },
  {
    nombre: 'Cliente que ya compró antes y vuelve',
    turnos: [{ c: 'hola fran, te compre un 13 el mes pasado, ahora busco uno para mi hermana' }],
  },
  {
    nombre: 'Pregunta el precio de contado y nada más',
    turnos: [{ c: 'cuanto sale el 15 de contado?', contiene: ['$740.000'] }],
  },
  {
    nombre: 'Escribe en mayúsculas',
    turnos: [{ c: 'HOLA TENES EL 13??', contiene: ['$495.000'] }],
  },
  {
    nombre: 'Dice que lo va a pensar',
    turnos: [
      { c: 'tenes el 14?' },
      { c: 'lo voy a pensar y te aviso', escala: false, noContiene: ['turno'] },
    ],
  },
  // ---------- Conversaciones largas y cambios de rumbo ----------
  {
    nombre: 'Cambia de modelo manteniendo la entrega',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil' },
      { c: 'y el 14?', contiene: ['14'] },
    ],
  },
  {
    nombre: 'Sube el monto después de la primera cotización',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'tengo 420 mil' },
      { c: 'si junto 600 mil cuanto me queda?', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
    ],
  },
  {
    nombre: 'Conversación completa hasta el cierre (WA-017)',
    turnos: [
      { c: 'Hola buenas' },
      { c: 'que tenes disponible?' },
      { c: 'el 13 me interesa' },
      { c: 'tengo 320 mil', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
      { c: 'dale lo quiero', escala: true },
    ],
  },
  {
    nombre: 'Pregunta lo mismo dos veces seguidas',
    turnos: [
      { c: 'cuanto sale el 13?' },
      { c: 'cuanto sale el 13?', maxMensajes: 4 },
    ],
  },

  // ---------- Variantes de cómo se escriben los montos ----------
  {
    nombre: 'Monto con "k"',
    turnos: [{ c: 'quiero el 13' }, { c: 'tengo 350k', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] }],
  },
  {
    nombre: 'Monto con "lucas"',
    turnos: [{ c: 'quiero el 13' }, { c: 'cuento con 350 lucas', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] }],
  },
  {
    nombre: 'Monto de un millón',
    turnos: [{ c: 'quiero el 17 pro' }, { c: 'tengo 1 palo y medio para entregar' }],
  },
  {
    // Desde cero, D4 (29/09/2026): preguntar por la batería escala callado; el 90 sigue sin
    // ser plata.
    nombre: 'No confunde el porcentaje de batería con el monto',
    turnos: [
      { c: 'tenes el 13 con 90 de bateria?', noContiene: ['entrega de $90'], entregaLeida: null, silencio: true },
    ],
  },
  {
    nombre: 'No confunde la capacidad con el monto',
    turnos: [{ c: 'tenes el 13 de 256?', noContiene: ['entrega de $256'] }],
  },

  // ---------- Qué se lee como entrega ----------
  //
  // Un cliente dijo que tenía un monto, después otro junto con el modelo, y el
  // bot cotizó con el primero: el segundo no se leyó y el viejo siguió guardado.
  // Con --offline lee el extractor local; con Gemini, Gemini y el local de
  // respaldo. Los dos tienen que dar esto.
  { nombre: 'Entrega: "tengo 520"', turnos: [{ c: 'tengo 520', entregaLeida: 520000 }] },
  { nombre: 'Entrega: "tengo 520.000"', turnos: [{ c: 'tengo 520.000', entregaLeida: 520000 }] },
  { nombre: 'Entrega: "tengo 520 mil"', turnos: [{ c: 'tengo 520 mil', entregaLeida: 520000 }] },
  { nombre: 'Entrega: "520 lucas"', turnos: [{ c: '520 lucas', entregaLeida: 520000 }] },
  { nombre: 'Entrega: "me estiro a 550"', turnos: [{ c: 'me estiro a 550', entregaLeida: 550000 }] },
  {
    nombre: 'Entrega: "medio palo" es 500.000, no un millón',
    turnos: [{ c: 'medio palo', entregaLeida: 500000, noContiene: ['$1.000.000'] }],
  },
  {
    // Piso y techo: se cotiza con el piso. Es una decisión, no un bug.
    nombre: 'Entrega: con piso y techo se lee el piso',
    turnos: [{ c: 'tengo 400 y me estiro a 550', entregaLeida: 400000 }],
  },
  {
    nombre: 'Entrega: el monto antes del modelo',
    turnos: [{ c: 'perfecto tengo 520 y quiero el 14 pro', entregaLeida: 520000 }],
  },
  {
    // Antes agarraba el 14, lo descartaba por chico y no probaba con el 520.
    nombre: 'Entrega: el modelo antes del monto',
    turnos: [{ c: 'quiero el 14 pro, tengo 520', entregaLeida: 520000 }],
  },
  {
    // Decisión de Tomás del 28/09/2026: "con 520 me alcanza?" es su entrega (Gemini
    // ya lo leía así). "con" a secas sigue sin habilitar: "con 90 de bateria".
    nombre: 'Entrega: "con 520 me alcanza" se lee como entrega',
    turnos: [{ c: 'con 520 me alcanza para el 14 pro?', entregaLeida: 520000 }],
  },
  {
    // Es una pregunta por la batería: desde cero, D4 (29/09/2026), escala callado.
    nombre: 'Entrega: "con" a secas no se lee',
    turnos: [{ c: 'el 13 con 90 de bateria?', entregaLeida: null, silencio: true }],
  },
  {
    // Con una entrega guardada, "con 520 me alcanza" cotiza con 520, no repregunta.
    nombre: 'Cambia el monto con "con 520 me alcanza": cotiza con el nuevo',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'tengo 400 mil', entregaLeida: 400000 },
      {
        c: 'con 520 me alcanza para el 14 pro?',
        entregaLeida: 520000,
        contiene: ['$520.000'],
        noContiene: ['no te entendi bien el monto', '$400.000'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Dice un monto que no se puede leer: repregunta y no cotiza con el viejo',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'tengo 400 mil', entregaLeida: 400000 },
      // `lectura`: el monto no se lee tampoco con Gemini (si no, en línea cotiza).
      {
        c: 'y con 610 cuanto me queda?',
        lectura: { entrega: null },
        entregaLeida: null,
        contiene: ['no te entendi bien el monto', 'con cuanto contas'],
        noContiene: ['$400.000', '1 pago de', 'arranca en'],
        escala: false,
      },
      // Otra vez un número que no se lee: no se repregunta dos veces, lo ve una persona.
      { c: 'y con 650 cuanto seria?', lectura: { entrega: null }, entregaLeida: null, escala: true, silencio: true },
    ],
  },
  {
    // Contracaso de la guarda: sigue la charla sin decir plata. No hay número,
    // así que se usa la entrega guardada y cotiza como siempre.
    nombre: 'Sigue la charla sin mencionar plata: usa la entrega guardada',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'tengo 520 mil', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
      {
        c: 'dale, y en cuotas como me queda?',
        entregaLeida: null,
        contiene: ['$520.000'],
        noContiene: ['no te entendi bien el monto'],
        escala: false,
      },
    ],
  },
  {
    // La marca de "ya se repreguntó" se borra con una entrega bien leída. Si no,
    // una duda aclarada hace veinte mensajes hacía escalar la siguiente.
    // Desde cero, D5 (29/09/2026): lo que iba a contestar ya se lo dijo: no manda nada y escala callado.
    // La repregunta ya se le hizo igual: no se repite, y el motivo no es "ya se lo había
    // repreguntado" (la marca se borró con la entrega bien leída).
    nombre: 'Aclaró el monto: una duda nueva no escala por la repregunta vieja',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'tengo 400 mil', entregaLeida: 400000 },
      { c: 'y con 610 cuanto me queda?', lectura: { entrega: null }, entregaLeida: null, contiene: ['no te entendi bien el monto'] },
      { c: 'tengo 300 mil', entregaLeida: 300000 },
      {
        c: 'y con 650 cuanto seria?',
        lectura: { entrega: null },
        entregaLeida: null,
        noContiene: ['1 pago de'],
        silencio: true,
        motivo: 'no sé cómo seguir',
      },
    ],
  },

  // "llego a": con negación y sin "mas de", el número es el precio de algo que
  // no le alcanza, no su plata. Con "mas de" es su techo. Sin negación, su plata.
  {
    nombre: 'Entrega: "no llego a mas de 300" es su techo',
    turnos: [{ c: 'no llego a mas de 300', entregaLeida: 300000 }],
  },
  { nombre: 'Entrega: "no llego a 700" no es entrega', turnos: [{ c: 'no llego a 700', entregaLeida: null }] },
  { nombre: 'Entrega: "llego a 480"', turnos: [{ c: 'llego a 480', entregaLeida: 480000 }] },
  {
    // Con una entrega guardada, "no llego a 770" no dispara la guarda: no dijo
    // un monto nuevo, insiste con el que ya había dado. Bloque 5b: es la segunda
    // insistencia, así que otra vez la entrega inicial, todavía no la alternativa.
    nombre: 'Insiste con "no llego a" el mínimo: sigue con la entrega guardada',
    turnos: [
      { c: 'quiero el 16 pro' },
      { c: 'tengo 300 mil', contiene: ['entrega inicial', '$770.000'] },
      {
        c: 'no, no llego a 770',
        entregaLeida: null,
        contiene: ['entrega inicial', '$770.000'],
        noContiene: ['no te entendi bien el monto', 'anotado'],
      },
    ],
  },

  // ---------- Ambigüedad ----------
  {
    nombre: 'Dice solo "el pro" sin número',
    turnos: [{ c: 'tenes el pro?' }],
  },
  {
    nombre: 'Pide el más barato',
    turnos: [{ c: 'cual es el mas barato que tenes?', escala: false }],
  },
  {
    nombre: 'Pregunta por dos modelos a la vez',
    turnos: [{ c: 'precio del 13 y del 15?' }],
  },
  {
    nombre: 'Responde "si" a secas después de una cotización',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'tengo 500 mil' },
      { c: 'si', escala: false },
    ],
  },
  {
    // Desde cero (grupo 4, 29/09/2026): el "buenas" contesta nuestro saludo y se le contesta;
    // el "hola?" que sigue a la pregunta genérica cuenta como el segundo que no se entiende:
    // escala sin callar y no la repite.
    nombre: 'Cliente que solo saluda tres veces',
    turnos: [
      { c: 'hola' },
      { c: 'buenas' },
      { c: 'hola?', silencio: true, motivo: 'no se entienden', noContiene: ['contame'] },
    ],
  },
  // ---------- Insistir con la entrega antes de bajar de gama (bloque 5b) ----------
  {
    // Dos veces la entrega inicial del 16 Pro; recién al tercer mensaje sin llegar,
    // la alternativa con el 16 Pro anotado. Nunca la diferencia ($470.000).
    nombre: 'Insiste con el monto bajo: dos veces la entrega inicial y recién ahí ofrece otro modelo',
    turnos: [
      { c: 'quiero el 16 pro' },
      { c: 'tengo 300 mil', contiene: ['entrega inicial', '$770.000'], noContiene: ['estirarte', 'anotado'] },
      { c: 'no, no llego a mas de 300', contiene: ['entrega inicial', '$770.000'], noContiene: ['anotado', '📱'] },
      { c: 'no llego', contiene: ['anotado', '$770.000'], noContiene: ['entrega inicial', '470.000'], escala: false },
    ],
  },
  {
    nombre: 'Estira y llega al mínimo: cotiza normal',
    turnos: [
      { c: 'quiero el 15' },
      { c: 'tengo 200 mil', contiene: ['entrega inicial', '$420.000'], noContiene: ['estirarte'] },
      { c: 'bueno, puedo llegar a 420 mil', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
    ],
  },
  {
    // Este caso afirmaba lo contrario con el umbral viejo del 25%: a alguien al
    // que le faltan $200.000 el bot le decía "estas muy cerca" y molestaba al
    // grupo con una excepción. Desde el bloque 5 no hay excepción: hasta el tope
    // ($45.000 desde el 5b) se cotiza con recargo, y 200.000 queda lejos en
    // cualquier modelo. Bloque 5b: la primera vez, solo la entrega inicial.
    nombre: 'Lejos del minimo del 17 pro: 200.000 de diferencia NO es excepcion',
    turnos: [
      { c: 'quiero el 17 pro' },
      {
        c: 'tengo 1 palo para la entrega',
        escala: false,
        contiene: ['entrega inicial', '$1.200.000'],
        noContiene: ['consultarlo', 'muy cerca', 'faltarian', 'faltan'],
      },
    ],
  },
  {
    nombre: 'Segundo paso: después del stock sí pide el presupuesto',
    turnos: [
      { c: 'tenes el 14?' },
      {
        // Eligió: fotos y recién ahí se habla de plata
        c: 'ese nomas me interesa',
        // Las fotos solo se prometen si la carpeta FOTOS_DIR tiene una
        contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'],
        noContiene: ['con cuanto contas'],
      },
    ],
  },
  // ---------- Varios modelos a la vez ----------
  {
    nombre: 'Nombra dos modelos: lista corta, sin ofrecer cuotas',
    turnos: [
      {
        c: 'perfecto, tenia en mente un 13 y un 17 pro max',
        contieneAlguno: ['cual se acopla mas a vos', 'cual te gusto mas', 'cual te cierra mas'],
        noContiene: ['financiarte', 'con cuanto contas'],
      },
    ],
  },
  {
    nombre: 'Nombra dos modelos y pregunta por cuotas: ahí sí se explica',
    turnos: [
      {
        c: 'tenia en mente un 13 y un 15, vi que hacian cuotas, me dan info?',
        // Con la lista y la pregunta no hay lugar para el PDF: sale con la cotización.
        contiene: ['financia', 'entrega inicial'],
        noContiene: ['[doc:'],
        contieneAlguno: ['cual se acopla mas a vos', 'cual te gusto mas', 'cual te cierra mas'],
      },
    ],
  },
  // ---------- Pregunta por cuotas (15/09/2026) ----------
  //
  // Una pregunta por cuotas sin esquema propio se contesta siempre, lea lo que lea
  // Gemini, y se sigue la venta según la charla. `lectura` simula a Gemini.
  cuotasEnVivo('propone_pago'),
  cuotasEnVivo('consulta_general'),
  cuotasEnVivo('quiere_avanzar'),
  {
    nombre: 'Cuotas: con dos mostrados, el modelo guardado es el último nombrado y no uno elegido: pregunta cuál',
    turnos: [
      { c: 'tengo en mente un 13 o 14 pro' },
      {
        c: 'como seria en cuotas?',
        lectura: { intencion: 'propone_pago' },
        contiene: ['financia', 'entrega inicial', '[doc: compromiso de pago]', 'decime cual te gusto mas, el 13 o el 14 Pro'],
        noContiene: ['la entrega arranca en'],
      },
    ],
  },
  {
    nombre: 'Cuotas: sin nada mostrado (propone_pago), explica y pregunta el modelo',
    turnos: [
      {
        c: 'hola, como son las cuotas?',
        lectura: { intencion: 'propone_pago' },
        contiene: ['financia', 'entrega inicial', '[doc: compromiso de pago]', 'contame que modelito te interesa y con cuanto contas para la entrega'],
        noContiene: ['mes que viene'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Cuotas: modelo elegido y mostrado (propone_pago), explica, da la entrega de ese y pide la suya',
    turnos: [
      { c: 'tenes el 14?' },
      {
        c: 'vi que hacen cuotas, como seria?',
        lectura: { intencion: 'propone_pago' },
        contiene: ['financia', 'entrega inicial', '[doc: compromiso de pago]', 'para el iPhone 14 la entrega arranca en'],
        contieneAlguno: ['con cuanto contas', 'de cuanto disponias'],
        noContiene: ['mes que viene'],
        maxMensajes: 4,
        escala: false,
      },
    ],
  },
  {
    nombre: 'Cuotas: un esquema concreto sigue escalando aunque pregunte por las cuotas',
    turnos: [
      { c: 'tengo en mente un 13 o 14 pro' },
      {
        c: 'te doy 200 ahora y el resto el 10, como serian las cuotas?',
        lectura: { intencion: 'propone_pago' },
        escala: true,
        silencio: true,
      },
    ],
  },
  {
    nombre: 'Cuotas: con la financiación ya explicada, versión corta y sigue con los modelos',
    turnos: [
      { c: 'tengo en mente un 13 o 14 pro', lectura: { modelo: null } },
      { humano: 'lo que hacemos es financiarte en 1 o 2 cuotas con una entrega inicial' },
      {
        c: 'dale, y como seria lo de las cuotas?',
        lectura: { intencion: 'propone_pago' },
        contiene: [
          'como te decia, te lo financiamos en 1 o 2 cuotas con una entrega inicial',
          'decime cual te gusto mas, el 13 o el 14 Pro',
        ],
        noContiene: ['financiarte el celular', 'mes que viene'],
      },
    ],
  },
  {
    nombre: 'Cuotas: tres modelos mostrados, la frase nueva con comas y la pregunta con "o"',
    turnos: [
      {
        c: 'tenes el 13, el 14 pro y el 15?',
        contiene: ['te paso el 13, 14 Pro, 15, igualmente tenemos del 11 al 18 Pro Max'],
        maxMensajes: 4,
      },
      {
        c: 'vi que hacen cuotas, como seria?',
        lectura: { intencion: 'propone_pago' },
        contiene: ['decime cual te gusto mas, el 13, el 14 Pro o el 15, y con cuanto contas'],
      },
    ],
  },
  {
    nombre: 'Sin modelo y con dos mostrados, un mensaje que no es de cuotas pregunta por esos (nunca "retomar")',
    pushName: 'Bruno',
    turnos: [
      { c: 'tenes iphones?' },
      { c: 'tengo en mente un 13 o 14 pro', lectura: { modelo: null } },
      {
        c: 'mmm no se',
        lectura: { intencion: 'otro' },
        contiene: ['decime cual te gusto mas, el 13 o el 14 Pro, y con cuanto contas para la entrega'],
        noContiene: ['contame que estas buscando', 'brunoo'],
      },
    ],
  },
  // ---------- La frase del rango al pasar precios (15/09/2026) ----------
  {
    nombre: 'Rango: un modelo, pegado al stock sin perder capacidad ni batería, y sigue la pregunta de otro modelo',
    turnos: [
      {
        c: 'tenes el 13?',
        contiene: ['$495.000'],
        // Las tres formas de hayStock, enteras: el rango va en el MISMO mensaje.
        contieneAlguno: [
          'sii tenemos iPhone 13 128GB 100%, igualmente tenemos del 11 al 18 Pro Max',
          'siii, iPhone 13 128GB 100% lo tenemos, igualmente tenemos del 11 al 18 Pro Max',
          'sii, tenemos en stock iPhone 13 128GB 100%, igualmente tenemos del 11 al 18 Pro Max',
        ],
      },
    ],
  },
  {
    nombre: 'Rango: con un modelo, la pregunta de si mira otro modelito sigue al final',
    turnos: [
      {
        c: 'tenes el 13?',
        contieneAlguno: ['tenias pensado otro modelito', 'estabas viendo otros tambien', 'queres que te pase algun otro'],
      },
    ],
  },
  {
    nombre: 'Rango: si repite un modelo ya mostrado no vuelve',
    turnos: [{ c: 'tenes el 13?' }, { c: 'y el 13 cuanto era?', noContiene: ['11 al 18'] }],
  },
  {
    nombre: 'Rango: con la entrega dicha y un modelo, no aparece',
    turnos: [{ c: 'tenes el 13? tengo 400 mil', contiene: ['1 pago', '2 pagos'], noContiene: ['11 al 18', 'Contado'] }],
  },
  {
    nombre: 'Rango: con la entrega dicha y varios modelos, no aparece',
    turnos: [
      { c: 'tengo 500 mil, me interesan el 13 y el 14 pro', contiene: ['te podes llevar'], noContiene: ['11 al 18'] },
    ],
  },
  {
    nombre: 'Rango: con una entrega que no llega al mínimo, no aparece',
    turnos: [{ c: 'quiero el 17 pro max, tengo 300 mil', noContiene: ['11 al 18'] }],
  },
  {
    nombre: 'Rango: con la entrega dicha y sin modelo ("el mejor que te llevas"), no aparece',
    turnos: [{ c: 'hola tengo 500 mil', contiene: ['el mejor que te llevas'], noContiene: ['11 al 18'] }],
  },
  // ---------- Suma un segundo modelo a mitad de la charla ----------
  {
    nombre: 'Pide un segundo modelo: los precios van juntos y con antesala',
    turnos: [
      { c: 'tenes el 14 pro?' },
      {
        c: 'ssii me interesaba el 15 pro tambien',
        contiene: ['te paso el 14 Pro y el 15 Pro, igualmente tenemos del 11 al 18 Pro Max', '800.000', '920.000'],
        contieneAlguno: ['cual se acopla mas a vos', 'cual te gusto mas', 'cual te cierra mas'],
      },
      {
        // Ya vio los dos precios: no se los repite, pasa al presupuesto
        c: 'me quedo con el 15 pro',
        contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'],
        noContiene: ['tenias pensado otro modelito'],
      },
    ],
  },
  // ---------- Recomendación por presupuesto ----------
  {
    nombre: 'Pide recomendación sin decir presupuesto',
    turnos: [
      { c: 'que me recomendas?', contiene: ['presupuesto'], escala: false, noContiene: ['$'] },
    ],
  },
  {
    nombre: 'Pide recomendación con presupuesto: recomienda y cotiza',
    turnos: [
      { c: 'tengo 600 mil, cual me conviene?', contiene: ['te conviene', '1 pago', '2 pagos'], noContiene: ['Contado'], escala: false },
    ],
  },
  {
    nombre: 'Comparar dos modelos en detalle sigue yendo a un humano',
    turnos: [{ c: 'que diferencia hay entre el 14 y el 15?', escala: true, silencio: true }],
  },

  // ---------- Flujo completo con fotos y forma de pago ----------
  {
    nombre: 'Elige modelo, ve fotos, elige cuotas y cotiza',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'ese me gusto', contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'] },
      {
        c: 'en cuotas',
        contiene: ['la entrega arranca en'],
        contieneAlguno: ['con cuanto contas', 'de cuanto disponias'],
      },
      { c: 'tengo 500 mil', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado', '$800.000'] },
    ],
  },
  {
    nombre: 'Elige modelo y lo hace de contado: no cotiza cuotas, pregunta el día y escala',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'ese nomas' },
      {
        c: 'de contado',
        escala: true,
        contiene: ['de contado', 'que dia'],
        noContiene: ['1 pago', 'fran'],
      },
    ],
  },
  {
    nombre: 'El 13 Pro ya está cargado',
    turnos: [{ c: 'tenes el 13 pro?', contiene: ['$695.000'], escala: false }],
  },
  // ---------- Forma de pago mixta ----------
  {
    nombre: 'Dice contado pero le interesan las cuotas: gana cuotas, no escala',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'ese me gusto' },
      {
        c: 'queria hacerlo de contado pero me intersa la opcion de cuotas',
        contiene: ['la entrega arranca en'],
        contieneAlguno: ['con cuanto contas', 'de cuanto disponias', 'con cuanto contas para la entrega'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'El porcentaje de entrega sale de la planilla',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'ese nomas', contiene: ['entrega inicial del 65%'] },
    ],
  },
  {
    nombre: 'Propone esquema propio CON monto: eso sí escala',
    turnos: [
      { c: 'quiero el 14' },
      { c: 'te doy 50 mil ahora y el resto el 20', escala: true, silencio: true },
    ],
  },
  // ---------- Presupuesto + varios modelos ----------
  {
    // Anotado por Tomas en el entrenador: "es mi primer iPhone" es senal de
    // compra, hay que entrarle por ahi y no dejarlo pasar. Desde el bloque 3b la
    // primera cotización lleva adelante la explicación de la financiación y el
    // PDF (4 mensajes justos), así que la frase del primer iPhone va fundida con
    // "te lo llevas" en un solo mensaje, con el monto y el modelo (bloque 4b,
    // decidido por Tomás).
    nombre: 'Dice que es su primer iPhone con el monto: explicación, PDF, primer iPhone + "te lo llevas" y cotización',
    turnos: [
      {
        c: 'me interesaba el 14 pro, cuento con 550.000 y es mi primer iphone',
        contiene: ['entrega inicial', '[doc: compromiso de pago]', '$550.000', '1 pago', '2 pagos'],
        // No preguntó el precio: no aparece (Ajustes 1).
        noContiene: ['Contado', '$800.000'],
        contieneAlguno: ['lugar indicado', 'primer iphone'],
        maxMensajes: 4,
      },
    ],
  },
  {
    // Con la financiación ya explicada no hace falta la explicación, y ahí la
    // frase del primer iPhone sí va antes del número, como siempre.
    nombre: 'Dice que es su primer iPhone con la financiación ya explicada: se lo reconoce antes del numero',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { humano: 'lo que hacemos es financiarte en 1 o 2 cuotas con una entrega inicial' },
      {
        c: 'cuento con 550.000 y es mi primer iphone',
        contieneAlguno: ['lugar indicado', 'primer iphone'],
        contiene: ['1 pago', '2 pagos'],
        noContiene: ['Contado'],
      },
    ],
  },
  {
    // El saludo va partido, como escribe Tomas: nombre primero, despues que si
    // lo tenemos, despues el precio, y al final la pregunta. Y el compromiso de
    // pago (PDF) viaja con el texto de requisitos, una sola vez por chat.
    nombre: 'Saludo partido con el nombre, y el compromiso de pago va con la cotizacion',
    turnos: [
      {
        c: 'hola tenes el 13?',
        contiene: ['Martina', '$495.000'],
        contieneAlguno: ['tenemos', 'lo tenemos'],
        noContiene: ['entrega inicial', 'financiarte'],
      },
      { c: 'ese me gusto' },
      // Desde el bloque 3b, "en cuotas" explica la financiación y manda el PDF
      // (con la marca compromisoEnviado); la cotización ya no lo repite.
      { c: 'en cuotas', contiene: ['[doc:', 'dni', 'la entrega arranca en'] },
      {
        c: 'tengo 400 mil',
        contiene: ['1 pago', '2 pagos'],
        noContiene: ['[doc:', 'Contado'],
      },
      {
        // El PDF no se manda dos veces
        c: 'y si pongo 450 mil?',
        noContiene: ['[doc:'],
      },
    ],
    pushName: 'Martina',
  },
  {
    // La conversacion real que Tomas hizo en el entrenador. Encontro dos bugs:
    // el bot decia "Te paso los numeros" y no pasaba ninguno (la cotizacion se
    // filtraba por repetida y la frase quedaba huerfana), y "de donde son
    // ustedes?" disparaba la direccion completa en la primera pregunta.
    nombre: 'Conversacion real del entrenador: lista, elige, cotiza, confirma y pregunta ubicacion',
    turnos: [
      { c: 'buenass com estan,. tienen lista de precios' },
      { c: 'perfecto yo tenia en mente un 14 o 14 pro' },
      { c: 'yo tengo 500.000 que me recomendas', contiene: ['14 Pro', '1 pago', '2 pagos'], noContiene: ['Contado'] },
      {
        // Ya cotizado: se le rearma el trato, nunca se anuncian numeros sin numeros
        c: 'perfecto, me inteeresa el 14 pro',
        contiene: ['entrega', '14 Pro'],
        noContiene: ['Te paso los numeros', 'Ahora te cotizo', 'Mira como te queda'],
      },
      {
        // Primera vez que pregunta por el local. Hasta septiembre de 2026 iba sin
        // la direccion (se habia tomado como bug); con los registros reales se
        // decidio al reves: la direccion y los turnos de una.
        c: 'de donde son ustedes?',
        contiene: ['turno', 'Belgrano 3090'],
      },
    ],
  },
  {
    // Dictado por Tomas: cuando preguntan por un modelo y dicen cuanto tienen, no se
    // salta a "te faltan X". Bloque 5b: tampoco se cotiza con recargo de entrada.
    nombre: 'Pregunta por un modelo y dice cuanto tiene, $30.000 bajo el minimo: primero la entrega inicial, sin cotizar',
    turnos: [
      {
        // Le faltan 30.000 de 530.000. Bloque 5b (decisión de Tomás del 16/09/2026):
        // la primera vez va solo la entrega inicial del 15 Pro, con la explicación y
        // el PDF adelante; el recargo es el último recurso. Nunca la diferencia ni el
        // contado. Antes (bloque 5) cotizaba directo con recargo ($593.000 / $315.000).
        c: 'tenes 15 pro? tengo 500.000',
        contiene: ['15 Pro', 'entrega inicial', '$530.000'],
        noContiene: ['📱', '1 pago', '2 pagos', '$920.000', 'faltarian', 'faltan', '$30.000', 'no te alcanza', 'depende de como queden las cuotas', 'dejame consultarlo'],
        escala: false,
      },
    ],
  },
  {
    // Reportado por Tomas desde el entrenador: el bot decia "el 15 Pro necesita una
    // entrega de $530.000" y el lo leyo como si ese fuera el precio del equipo (sale
    // $920.000). Bloque 5b: el 13 entra, y del 15 Pro va solo la entrega inicial,
    // nunca la diferencia ni el contado. El recargo queda para después de insistir.
    nombre: 'Pide otro modelo y esta al filo del minimo: el 13 entra y del 15 Pro va la entrega inicial',
    turnos: [
      { c: 'Hola, tenes iPhone 13?' },
      {
        c: 'sii, tienen 15 pro? yo tengo 500.000 pesos',
        contiene: ['te podes llevar el 13', 'entrega inicial', '$530.000'],
        noContiene: ['te faltarian $30.000, hasta cuanto', '$30.000', 'arranca en', '$920.000', 'estirarte', 'llevar el 13 o el 15 Pro'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Dice el monto y tres modelos: le dice cuales le entran, y del que esta al filo va la entrega inicial',
    turnos: [
      {
        c: 'tengo 500.000 y buscaba un 14 pro, 15, 15 pro',
        // Le dice cuales se lleva. Lo que NO va nunca es cuanto le falta. Bloque 5b:
        // el 15 Pro (mínimo 530.000) no entra de entrada: va su entrega inicial, y el
        // recargo queda para después de insistir dos veces.
        contiene: ['te podes llevar el 14 Pro o el 15', 'entrega inicial', '$530.000'],
        // Nada de tirarle la lista completa cuando ya dijo cuanto tiene,
        // y nunca la diferencia de ninguno de los modelos.
        noContiene: ['Siii te paso unos precios', 'faltarian', 'faltan', '$30.000', 'arranca en', 'estirarte'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Decisión de Tomás del 28/09/2026: cada vez que pide la lista, va la lista completa.
    // Hasta entonces contestaba "ya te pase la lista mas arriba".
    nombre: 'Pide la lista por segunda vez: se la manda de nuevo, completa',
    turnos: [
      { c: 'que precios tenes?' },
      {
        c: 'me pasas los precios?',
        contiene: ['Ip 13 128gb 100% 495.000', 'Ip 17 Pro Max 128gb sellado 2.200.000'],
        noContiene: ['ya te pase la lista'],
      },
      { c: 'pasame la lista otra vez', contiene: ['Ip 13 128gb 100% 495.000', 'Ip 17 Pro Max 128gb sellado 2.200.000'] },
    ],
  },
  {
    nombre: 'Nunca repite textual algo que ya dijo',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tenes el 13?', noContiene: ['tenemos en stock iPhone 13 128GB 100%, ese modelito'] },
    ],
  },
  // ---------- Saludo con nombre ----------
  {
    nombre: 'El saludo lleva el nombre y un como estas',
    turnos: [
      {
        c: 'buenass',
        contiene: ['tomass'],
        contieneAlguno: ['como estas', 'como andas', 'como va todo', 'todo bien'],
        escala: false,
      },
    ],
  },

  // ---------- Repetir el presupuesto ya cotizado ----------
  {
    nombre: 'Repite el monto ya cotizado: confirma, no escala ni recotiza',
    turnos: [
      { c: 'quiero un 14 pro' },
      { c: 'tengo 500.000' },
      {
        c: 'te habia comentado que tengo 500.000',
        escala: false,
        // Dictado por Tomas: cuando confirma un modelo ya cotizado, se le vuelve a
        // armar el trato en concreto, no se le dice "es como te pase recien".
        contieneAlguno: ['abonas $500.000 como entrega', 'abonas los $500.000 de entrega'],
        noContiene: ['dejame verlo con fran'],
      },
    ],
  },
  {
    nombre: 'Un monto suelto nunca es proponer esquema de pago',
    turnos: [
      { c: 'quiero el 15' },
      { c: 'ya te dije que tengo 500.000', escala: false },
    ],
  },

  // ---------- LISTA + USADOS: una unidad puntual nunca reemplaza al catálogo ----------
  {
    // El 14 está en LISTA a 540.000 y además hay una unidad física a 430.000.
    // Se ofrecen LAS DOS, en el mismo mensaje, la más barata primero.
    nombre: 'Modelo en LISTA + unidad de USADOS disponible: van las dos',
    turnos: [
      { c: 'quiero un 14' },
      {
        c: 'tengo 400.000',
        contiene: [
          // Las dos opciones viven en UN solo mensaje: esta cabecera solo la
          // arma plantillaVarias, así que si aparece es que no se partió.
          'Tengo 2, con una entrega de *$400.000*:',
          // La de liquidación primero, con su detalle y sin el precio (Ajustes 1)
          '*1)* 128gb, bateria 86%, gris, sin face id:',
          // y debajo la de catálogo
          '*2)* 128gb, bateria 80%:',
        ],
        noContiene: ['$430.000', '$540.000', 'contado'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // La misma situación pero con la unidad marcada Disponible=NO: no puede
    // tapar la fila de LISTA ni mandar la consulta a un humano.
    nombre: 'Unidad con Disponible=NO no tapa la fila de LISTA',
    turnos: [
      { c: 'quiero un 15' },
      {
        c: 'tengo 450.000',
        // Sin el precio de la fila (Ajustes 1): los pagos salen de su base, +$10.000
        // por pago (Ajustes 2): 290.000 × 1,26 → 366.000 + 10.000; × 1,35 / 2 → 196.000 + 10.000.
        contiene: ['1 pago de $376.000', '2 pagos de $206.000'],
        noContiene: [
          '$740.000',       // el contado, que no preguntó
          '$600.000',       // el precio de la unidad que no está disponible
          'reservado',      // su detalle
          'dejame confirmar disponibilidad de ese y te aviso', // el texto de escalado
        ],
        escala: false,
      },
    ],
  },
  {
    // Dos unidades del mismo modelo a precios distintos, las dos disponibles.
    nombre: 'Dos unidades del mismo modelo: se ofrecen las dos, ordenadas por precio',
    turnos: [
      { c: 'quiero un 11' },
      {
        c: 'tengo 200.000',
        contiene: [
          'Tengo 2, con una entrega de *$200.000*:',
          '*1)* 64gb, bateria 84%, negro, marco marcado:',
          '*2)* 128gb, bateria 91%, verde:',
        ],
        noContiene: ['$260.000', '$310.000'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Un modelo que solo existe como unidad puntual: se cotiza sola, con la
    // plantilla de siempre.
    nombre: 'Unidad de un modelo que no está en LISTA: cotiza sola',
    turnos: [
      { c: 'quiero un 12' },
      {
        c: 'tengo 260.000',
        // 120.000 × 1,26 → 152.000 + 10.000; × 1,35 / 2 → 81.000 + 10.000 (Ajustes 2).
        contiene: ['1 pago de $162.000', '2 pagos de $91.000'],
        noContiene: ['Tengo 2, con una entrega', '$380.000'],
        escala: false,
      },
    ],
  },

  // ---------- El bloque de liquidación y su tope ----------
  {
    // Con más unidades que el tope se mandan las 5 más baratas y se cierra con
    // la línea fija. Que el mensaje mida menos de 220 no hace falta afirmarlo
    // acá: lo controla la regla global "los mensajes son cortos" de evaluar.js,
    // que mira TODAS las respuestas.
    nombre: 'Siete unidades disponibles: van las 5 mas baratas y la linea de cierre',
    planilla: conUnidades([
      unidad('E-1', 'iPhone 11', 64, 84, 'Negro', '', 260000, 170000),
      // Hasta el bloque 10 era un XR: ya no se ofrece (no se trabaja), y el caso sigue con 7.
      unidad('E-2', 'iPhone 11', 256, 88, 'Rojo', '', 290000, 190000),
      unidad('E-3', 'iPhone 11', 128, 91, 'Verde', '', 310000, 200000),
      unidad('E-4', 'iPhone 12', 64, 87, 'Blanco', '', 380000, 250000),
      unidad('E-5', 'iPhone 12', 128, 93, 'Negro', '', 420000, 280000),
      unidad('E-6', 'iPhone 13', 128, 89, 'Rosa', 'Cambio de bateria', 500000, 330000),
      unidad('E-7', 'iPhone 14', 128, 86, 'Gris', 'Sin Face ID', 560000, 370000),
    ]),
    turnos: [
      {
        c: 'que precios tenes?',
        contiene: [
          '260.000',
          '290.000',
          '310.000',
          '380.000',
          '420.000',
          'tengo algunos mas, decime cual estas buscando',
        ],
        // Las dos más caras quedan afuera del tope
        noContiene: ['500.000', '560.000'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Con exactamente 5 entran todas y no hay nada que avisar: la línea de
    // cierre no tiene que aparecer. La planilla base tiene 5, pero una es un XR, que desde
    // el bloque 10 no se ofrece: acá va un 11 en su lugar, así siguen siendo 5.
    nombre: 'Exactamente cinco unidades disponibles: van las 5 y sin linea de cierre',
    planilla: conUnidades(PLANILLA.usados.map((u) => (u.modelo === 'iPhone XR' ? { ...u, modelo: 'iPhone 11', capacidad_gb: 256 } : u))),
    turnos: [
      {
        c: 'que precios tenes?',
        contiene: ['260.000', '290.000', '310.000', '380.000', '430.000'],
        noContiene: ['tengo algunos mas'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Cinco unidades, o sea dentro del tope, pero todas con Detalles largo: el
    // bloque no entra en 220 y se recorta por caracteres hasta que entra. Al
    // quedar unidades afuera por el recorte, la línea de cierre tiene que
    // aparecer igual, aunque el tope de 5 nunca se haya alcanzado.
    nombre: 'Cinco unidades con detalles largos: recorta por caracteres y cierra con la linea',
    planilla: conUnidades([
      unidad('G-1', 'iPhone 11', 64, 84, 'Negro', 'Marco marcado', 260000, 170000),
      // Hasta el bloque 10 era un XR, que ya no se ofrece: un 11 del mismo largo.
      unidad('G-2', 'iPhone 11', 256, 88, 'Rojo', 'Micro rayon en marco', 290000, 190000),
      unidad('G-3', 'iPhone 11', 128, 91, 'Verde', 'Sin Face ID', 310000, 200000),
      unidad('G-4', 'iPhone 12', 64, 87, 'Blanco', 'Micro rayon en marco', 380000, 250000),
      unidad('G-5', 'iPhone 14', 128, 86, 'Gris', 'Sin Face ID', 430000, 290000),
    ]),
    turnos: [
      {
        c: 'que precios tenes?',
        contiene: [
          '260.000',
          '290.000',
          '310.000',
          'marco marcado',
          'tengo algunos mas, decime cual estas buscando',
        ],
        // Las dos que no entraron en el presupuesto de caracteres
        noContiene: ['380.000', '430.000'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Una sola unidad: entra holgada, no queda nadie afuera y por lo tanto no
    // hay línea de cierre que poner.
    nombre: 'Una sola unidad disponible: se muestra sin linea de cierre',
    planilla: conUnidades([
      unidad('H-1', 'iPhone 13', 128, 92, 'Azul', 'Impecable', 460000, 300000),
    ]),
    turnos: [
      {
        c: 'que precios tenes?',
        contiene: ['460.000', 'impecable'],
        noContiene: ['tengo algunos mas'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },

  // ---------- Cerca del anticipo mínimo ----------
  // Se usan modelos SIN unidad en USADOS (el 13 y el 13 Pro) para que el
  // mínimo efectivo sea el de LISTA y no el de una unidad de liquidación.
  // Desde el bloque 5 no hay umbral de excepción: hasta el tope ($45.000 desde el
  // bloque 5b) bajo el mínimo se cotiza con recargo, pero recién después de
  // insistir dos veces con la entrega inicial (bloque 5b).
  {
    // Le faltan 20.000 de 320.000. Bloque 5b: la primera vez no se cotiza; va la
    // explicación, el PDF y solo la entrega inicial del 13. Nunca la diferencia ni
    // el contado. El recargo (195.000 × 1,41 → $275.000 y × 1,50 / 2 → $147.000)
    // queda para el paso 3: ver "Bloque 5b: bajo el minimo…".
    nombre: 'Cerca del minimo: primero la entrega inicial, sin cotizar ni decir la diferencia',
    turnos: [
      {
        c: 'quiero un 13 y tengo 300.000',
        contiene: ['entrega inicial', '$320.000'],
        noContiene: [
          'depende de como queden las cuotas',
          'dejame consultarlo',
          'no te alcanza',
          'faltan',
          'faltarian',
          'estas a $',
          '$20.000', // la diferencia, ni en número
          '$495.000', // el contado: en el paso 1 va solo la entrega
          '📱',
          'estirarte',
        ],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Le faltan 170.000: más que el tope del recargo. Bloque 5b: igual que cerca,
    // solo la entrega inicial. Sin el contado ni la diferencia.
    nombre: 'Lejos del minimo: solo la entrega inicial, sin el contado ni la diferencia',
    turnos: [
      {
        c: 'quiero un 13 y tengo 150.000',
        contiene: ['entrega inicial', '$320.000'],
        noContiene: ['faltan', 'faltarian', 'estas a $', '$170.000', '$495.000', 'estirarte', 'arranca en'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Dos modelos, uno le entra y el otro no. Del que no le entra va solo la
    // entrega inicial (bloque 5b), nunca cuánto le falta ni el contado.
    nombre: 'Varios modelos: dice cual entra, y del otro solo la entrega inicial, sin la diferencia',
    turnos: [
      {
        c: 'me interesan el 13 y el 16 y tengo 330.000',
        contiene: ['te podes llevar el 13', 'entrega inicial', '$670.000'],
        noContiene: [
          'faltan',
          'faltarian',
          'estas a $',
          '$340.000', // lo que le falta para el 16
          '$1.050.000', // el contado del 16: en el paso 1 va solo la entrega
          'arranca en',
        ],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Igual que el anterior pero al 13 Pro le faltan $40.000. Bloque 5b: aunque
    // entraría con recargo, primero va su entrega inicial; el recargo es el último
    // recurso. Tampoco se dice la diferencia.
    nombre: 'Varios modelos y uno cerca del minimo: el 13 entra y del 13 Pro va la entrega inicial',
    turnos: [
      {
        c: 'me interesan el 13 y el 13 pro y tengo 380.000',
        contiene: ['te podes llevar el 13', 'entrega inicial', '$420.000'],
        noContiene: ['faltan', 'faltarian', 'estas a $', '$40.000', '$695.000', 'arranca en', 'llevar el 13 o el 13 Pro', 'depende de como queden las cuotas', 'dejame consultarlo'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },

  // ---------- Memoria por tema (14/09/2026) ----------
  //
  // Lo que ya le llegó al cliente (financiación, requisitos, garantía, métodos de
  // pago) el bot no lo vuelve a agregar por su cuenta. Si el cliente lo pregunta,
  // se contesta siempre, con la versión corta. Ver src/temas.js.
  {
    nombre: 'Tema: la cotización de otro modelo no repite los requisitos',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil', contiene: ['1 pago', 'dni'], noContiene: ['Contado'] },
      { c: 'y el 14?' },
      { c: 'dale el 14', contiene: ['1 pago'], noContiene: ['dni', 'tarjeta', 'compromiso de pago', 'Contado'] },
    ],
  },
  {
    nombre: 'Tema: repite el mismo monto y no vuelve a explicar las cuotas ni los requisitos',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil', contiene: ['1 pago', '2 pagos'], noContiene: ['Contado'] },
      { c: 'tengo 400 mil', contiene: ['$400.000'], noContiene: ['en hasta 2 cuotas', 'dni', 'tarjeta'] },
    ],
  },
  {
    nombre: 'Tema: "y las cuotas?" después de cotizar va con la versión corta',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil' },
      {
        c: 'y las cuotas?',
        contiene: ['como te decia, te lo financiamos en 1 o 2 cuotas con una entrega inicial'],
        noContiene: ['lo que hacemos es financiarte'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Tema: "y las cuotas?" sin nada explicado va con la versión larga y el PDF',
    turnos: [
      {
        c: 'y las cuotas?',
        contiene: ['financia', 'entrega inicial', '[doc: compromiso de pago]'],
        noContiene: ['como te decia', 'mes que viene'],
      },
    ],
  },
  {
    nombre: 'Tema: pregunta cuándo arrancan con la financiación ya explicada: corta, pero con el mes',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil' },
      { c: 'cuando arranca la primera cuota?', contiene: ['como te decia', 'mes que viene'] },
    ],
  },
  {
    nombre: 'Tema: una persona explicó la garantía a mano y el bot no la vuelve a meter',
    turnos: [
      { c: 'tenes el 13?' },
      { humano: 'si! y todos los equipos tienen un mes de garantia' },
      { c: 'y el 15?', contiene: ['15'], noContiene: ['garantia'] },
    ],
  },
  {
    // Contracaso: sin que nadie la haya explicado, la garantía va de yapa como siempre.
    nombre: 'Tema: sin explicarla antes, la lista de dos modelos lleva la garantía',
    turnos: [{ c: 'tenes el 13?' }, { c: 'y el 15?', contiene: ['garantia'] }],
  },
  {
    nombre: 'Tema: medios de pago con los requisitos ya explicados no los repite',
    turnos: [
      { c: 'que papeles piden?', contiene: ['dni'] },
      { c: 'que formas de pago tienen?', contiene: ['contado', '2 cuotas'], noContiene: ['dni', 'tarjeta'] },
    ],
  },
  {
    nombre: 'Tema: pregunta otra vez cómo se paga: versión corta',
    turnos: [
      { c: 'que formas de pago tienen?', contiene: ['dni'] },
      {
        c: 'y como se paga?',
        contiene: ['como te decia, podes pagarlo de contado o financiarlo hasta en 2 cuotas'],
        noContiene: ['dni'],
      },
    ],
  },
  {
    nombre: 'Tema: la pregunta de cómo paga no repite la financiación ya explicada',
    turnos: [
      { c: 'que formas de pago tienen?' },
      { c: 'tenes el 13?' },
      { c: 'dale ese', contiene: ['contado o en cuotas'], noContiene: ['financiamos', 'entrega inicial'] },
    ],
  },
  {
    nombre: 'Tema: con los requisitos ya explicados, la cotización manda el PDF con un pie corto',
    turnos: [
      { c: 'que papeles piden?' },
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil', contiene: ['1 pago', 'compromiso de pago'], noContiene: ['dni', 'tarjeta', 'Contado'] },
    ],
  },

  // ---------- No se entiende (14/09/2026) ----------
  //
  // Pasa a una persona recién con dos mensajes no entendidos SEGUIDOS. Cualquier
  // mensaje entendido corta la cadena, y un acuse ("ok", "si", un emoji) no cuenta:
  // ni suma ni corta. Antes el primer mensaje no entendido quedaba anotado para
  // siempre y un "👍" días después escalaba.
  {
    // Desde cero, D5 (29/09/2026): lo que iba a contestar ya se lo dijo: no manda nada y escala callado.
    // La cadena se corta igual: el motivo no es "mandó varios mensajes que no se entienden".
    nombre: 'No se entiende: algo entendido en el medio corta la cadena',
    turnos: [
      { c: 'asdasd', contiene: ['contame que estabas buscando'] },
      { c: 'donde estan?', contiene: ['Belgrano'] },
      { c: 'kkkkkk', silencio: true, motivo: 'no sé cómo seguir' },
    ],
  },
  {
    // El primer acuse se contesta como siempre; los que le siguen, ya no.
    nombre: 'No se entiende: acuses seguidos no escalan, y solo se contesta el primero',
    turnos: [
      { c: 'ok', contiene: ['contame que estabas buscando'], escala: false },
      { c: '👍', mudo: true },
      { c: 'dale', mudo: true },
    ],
  },
  {
    // Desde cero, D5 (29/09/2026, con la respuesta de Tomás para los acuses): la pregunta ya
    // salió en la charla, así que al acuse no se le contesta nada, y tampoco escala.
    nombre: 'No se entiende: después de un mensaje entendido, el acuse no repite la pregunta',
    turnos: [
      { c: 'ok', contiene: ['contame que estabas buscando'] },
      { c: 'donde estan?', contiene: ['Belgrano'] },
      { c: 'ok', mudo: true },
    ],
  },
  {
    // Desde cero (29/09/2026): el acuse después de la pregunta genérica no se contesta ni escala.
    nombre: 'No se entiende: un acuse entre dos mensajes raros no corta la cadena',
    turnos: [{ c: 'asdasd' }, { c: 'ok', mudo: true }, { c: 'kkkkkk', escala: true, silencio: true }],
  },
  {
    // Desde cero, D5 (29/09/2026): lo que iba a contestar ya se lo dijo: no manda nada y escala callado.
    nombre: 'No se entiende: después de escalar, algo entendido vuelve a cero',
    turnos: [
      { c: 'asdasd' },
      { c: 'kkkkkk', escala: true, silencio: true },
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { c: 'qwrtyp', silencio: true, motivo: 'no sé cómo seguir' },
    ],
  },
  {
    nombre: 'No entiendo qué necesita: dos seguidos escalan',
    turnos: [
      { c: 'che una consulta rapida', contiene: ['contame que estabas buscando'] },
      // Mejora 1: sin "dejame confirmarte eso bien y te aviso".
      { c: 'ahi te cuento bien despues', escala: true, silencio: true },
    ],
  },
  {
    // Desde cero, D5 (29/09/2026): lo que iba a contestar ya se lo dijo: no manda nada y escala callado.
    // La cadena se corta igual: el motivo no es "no entiendo qué necesita".
    nombre: 'No entiendo qué necesita: algo entendido en el medio corta la cadena',
    turnos: [
      { c: 'che una consulta rapida' },
      { c: 'donde estan?' },
      { c: 'ahi te cuento bien despues', silencio: true, motivo: 'no sé cómo seguir' },
    ],
  },

  // ---------- Bloque 5: corrección de monto, dos modelos y canje ----------
  {
    nombre: 'Bloque 5: corrige el monto y se recotiza el mismo modelo, sin repetir la explicación',
    turnos: [
      { c: 'tenes el 15?' },
      // 450 llega al mínimo del 15 ($420.000). Hasta el bloque 5b era 400, que ahora
      // no cotiza: primero insiste con la entrega.
      { c: 'tengo 450', entregaLeida: 450000, contiene: ['📱'], contieneAlguno: ['1 o 2 cuotas', 'hasta 2 cuotas'] },
      {
        c: 'perdón, 500',
        entregaLeida: 500000,
        contiene: ['Con una entrega de *$500.000*'],
        noContiene: ['no te hagas drama', '1 o 2 cuotas', 'hasta 2 cuotas'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Bloque 5: un número suelto después de la cotización se lee como el monto nuevo',
    turnos: [{ c: 'tenes el 15?' }, { c: 'tengo 450' }, { c: '500', entregaLeida: 500000, contiene: ['$500.000'] }],
  },
  {
    nombre: 'Bloque 5: dos modelos mostrados y un monto: los cotiza a los dos',
    turnos: [
      { c: 'tenes el 13 y el 14?' },
      { c: 'tengo 400', contiene: ['📱 *iPhone 13', '📱 *iPhone 14'], maxMensajes: 4, escala: false },
      { c: 'perdón, 500', contiene: ['$495.000', '$430.000'], noContiene: ['cuota'], maxMensajes: 4, escala: false },
    ],
  },
  {
    nombre: 'Bloque 5: canje, pide los datos sin prometer y escala callado cuando los manda',
    turnos: [
      { c: 'te puedo dar mi 11 como parte de pago?', contiene: ['a partir del 11', 'pasame'], noContiene: ['cotiz'], escala: false },
      { c: '128gb, bateria 90%', escala: true, silencio: true },
    ],
  },

  // ---------- Bloque 5b: insistir con la entrega antes de bajar (decisión de Tomás del 16/09/2026) ----------
  {
    // Le faltan 40.000 para el mínimo del 13 (320.000). Dos veces la entrega inicial,
    // sin cotizar; recién en el tercer mensaje sin llegar se cotiza con recargo, con el
    // último monto (290.000: 205.000 × 1,41 → $290.000 y × 1,50 / 2 → $154.000, más los
    // $10.000 por pago de Ajustes 2: $300.000 y $164.000). Nunca la diferencia, ni el
    // recargo, ni "no alcanza".
    nombre: 'Bloque 5b: bajo el minimo, dos veces la entrega inicial y recién ahí cotiza con recargo',
    turnos: [
      {
        c: 'quiero el 13, tengo 280.000',
        contiene: ['entrega inicial', '$320.000', '[doc: compromiso de pago]'],
        noContiene: ['📱', '1 pago', '$495.000', '$40.000', 'no te alcanza', 'estirarte', 'arranca en'],
        escala: false,
        maxMensajes: 4,
      },
      {
        c: 'tengo 290',
        entregaLeida: 290000,
        contiene: ['entrega inicial', '$320.000'],
        noContiene: ['📱', '1 pago', '$30.000', 'no te alcanza'],
        maxMensajes: 1,
      },
      {
        // Bloque Tono: antes de la ficha, la frase de excepción ("estas cerca").
        c: 'no llego',
        contiene: ['cerca', '📱', 'Con una entrega de *$290.000*', '1 pago de $300.000', '2 pagos de $164.000'],
        noContiene: ['$320.000', '$30.000', 'no te alcanza', 'recargo', 'interes', 'entrega inicial'],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // Atajo por rechazo: "entonces no" en el paso 1 salta al recargo con ese monto
    // (280.000: 215.000 × 1,41 → $304.000 y × 1,50 / 2 → $162.000, más los $10.000 por
    // pago de Ajustes 2: $314.000 y $172.000).
    nombre: 'Bloque 5b: atajo por rechazo, "entonces no" cotiza con recargo en ese momento',
    turnos: [
      { c: 'el 13, tengo 280.000', contiene: ['entrega inicial', '$320.000'], noContiene: ['📱'], escala: false },
      {
        // Bloque Tono: antes de la ficha, la frase de excepción ("estas cerca").
        c: 'uh entonces no',
        contiene: ['cerca', '📱', '1 pago de $314.000', '2 pagos de $172.000'],
        noContiene: ['entrega inicial', '$40.000', 'no te alcanza', 'recargo', 'interes'],
        escala: false,
      },
    ],
  },
  {
    // Le faltan 100.000: dos veces la entrega inicial y después la alternativa (el
    // 11 de 128, mínimo 200.000), con el 13 anotado. En ningún paso la diferencia.
    // El "no" suelto después de la línea es "sigue sin llegar", no un acuse.
    nombre: 'Bloque 5b: falta mas del tope, dos veces la entrega y despues la alternativa, nunca la diferencia',
    turnos: [
      { c: 'el 13, tengo 220.000', contiene: ['entrega inicial', '$320.000'], noContiene: ['$100.000', '📱', '$495.000'], escala: false },
      { c: 'no tengo mas', contiene: ['entrega inicial', '$320.000'], noContiene: ['$100.000', '📱', 'anotado'], maxMensajes: 1 },
      {
        c: 'no',
        contiene: ['mira lo que si te podes llevar', '📱 *iPhone 11', 'anotado', '$320.000'],
        noContiene: ['$100.000', 'entrega inicial', 'contame que estabas buscando', '📱 *iPhone 13'],
        escala: false,
      },
    ],
  },
  {
    // "¿cuánto le agrego?" se contesta con la entrega inicial, nunca con la resta, y
    // cuenta como insistencia.
    nombre: 'Bloque 5b: "cuanto le tengo que agregar?" recibe la entrega inicial, nunca la resta',
    turnos: [
      { c: 'el 13, tengo 280.000', contiene: ['entrega inicial', '$320.000'], escala: false },
      {
        c: 'cuanto le tengo que agregar?',
        contiene: ['entrega inicial', '$320.000'],
        noContiene: ['$40.000', '📱', 'falta'],
        escala: false,
        maxMensajes: 1,
      },
    ],
  },

  // ---------- Pendientes 1, D3: entrega que cubre el contado ----------
  {
    // Decisión de Tomás tras la prueba en vivo del 16/09/2026: con la entrega por
    // encima del contado salían "lo podés retirar con esos $900.000" y la ficha "con
    // esa plata lo sacás de contado, está $800.000", que dicen lo mismo. Queda solo
    // la ficha.
    nombre: 'D3: entrega por encima del contado, solo la ficha (sin "te lo llevas")',
    turnos: [
      {
        c: 'tengo 900.000 para el 14 pro',
        contiene: ['de contado', '$800.000'],
        noContiene: ['te lo llevas', 'lo podes retirar', 'lo sacas tranquilo', '1 pago', 'cuota'],
        // Bloque 9: el saludo del día y la ficha (antes, solo la ficha: `maxMensajes: 1`).
        saluda: true,
        maxMensajes: 2,
        escala: false,
      },
    ],
  },
  {
    nombre: 'D3: con la entrega por debajo del contado, "te lo llevas" sigue antes de la cotizacion',
    turnos: [
      {
        c: 'me interesa el 14 pro, tengo 600.000',
        contieneAlguno: ['te lo llevas', 'lo podes retirar', 'lo sacas tranquilo'],
        contiene: ['1 pago', '2 pagos'],
        noContiene: ['de contado, el'],
        escala: false,
      },
    ],
  },

  // ---------- Bloque 8: falsos escalados, pagos, seña, modelos que no se trabajan y fotos ----------
  // Mensajes reales de `npm run reproducir` (registro viejo, 736 casos) y decisiones de
  // Tomás del 23 y 24/09/2026.

  // A. Accesorios: escala solo si pregunta por comprar, tener o que venga uno, o por su
  // compatibilidad. Nombrarlo al pasar, describir su celular o descartarlo, no.
  {
    nombre: 'Bloque 8, accesorios: dice que no tenía cargador',
    turnos: [{ c: 'hola, se me había apagado el celular y no tenía cargador', escala: false }],
  },
  {
    // "en caja" habla del equipo. Con los dos Pro Max cargados, para que no escale por
    // "modelo que no está cargado" (la copia congelada no los tiene).
    nombre: 'Bloque 8, accesorios: "en caja" habla del equipo',
    planilla: conUnidades([
      ...PLANILLA.usados,
      unidad('B8-1', 'iPhone 15 Pro Max', 256, 86, 'Negro', '', 1150000, 700000),
      unidad('B8-2', 'iPhone 16 Pro Max', 256, 90, 'Negro', '', 1400000, 900000),
    ]),
    turnos: [{ c: 'sabes que necesito un regalo jajaja tenés algún 16 pro max o 15 pro max en caja?', escala: false }],
  },
  {
    nombre: 'Bloque 8, accesorios: "viene en caja?" habla del equipo',
    turnos: [{ c: 'el 15 viene en caja?', escala: false }],
  },
  {
    nombre: 'Bloque 8, accesorios: descarta el cargador',
    turnos: [{ c: 'me quedo con ese que me recomendaste primero, lo de cargador lo descarto, no hay problema', escala: false }],
  },
  {
    nombre: 'Bloque 8, accesorios: describe su propio celular',
    turnos: [{ c: 'el celu está re bien, no tiene ningún detalle más que el vidrio templado que tengo que sacarle', escala: false }],
  },
  {
    nombre: 'Bloque 8, accesorios: pregunta si tiene caja original',
    turnos: [{ c: 'Tiene caja original y piezas originales?', escala: true, silencio: true }],
  },
  {
    nombre: 'Bloque 8, accesorios: pregunta si venden cargadores',
    turnos: [{ c: 'y ustedes venden cargadores también?', escala: true, silencio: true }],
  },
  {
    nombre: 'Bloque 8, accesorios: pregunta por la ficha del cargador',
    turnos: [{ c: 'el cargador es la ficha C o la otra la chiquitita?', escala: true, silencio: true }],
  },
  {
    nombre: 'Bloque 8, accesorios: pregunta cuándo llega el cable',
    turnos: [{ c: 'Consulta, qué día más o menos te llegará el cable de cargador?', escala: true, silencio: true }],
  },
  {
    nombre: 'Bloque 8, accesorios: "cargador?" solo es una pregunta',
    turnos: [{ c: 'cargador?', escala: true, silencio: true }],
  },
  {
    nombre: 'Bloque 8, accesorios: "no necesito cargador" no pregunta por uno',
    turnos: [{ c: 'no necesito cargador, tengo uno', escala: false }],
  },
  {
    // Registro real (recortado): describe su celular en un canje.
    nombre: 'Bloque 8, accesorios: describe el celular que entrega',
    turnos: [{ c: 'el mío viene con vidrio templado y no sé cuántas fundas, por cuánto lo tomás?', escala: false }],
  },
  {
    // Registro real. Antes no escalaba: la palabra suelta no agarraba el plural.
    nombre: 'Bloque 8, accesorios: pregunta si vienen fundas (en plural)',
    turnos: [{ c: 'Y te consulto con algunas fundas me lo das? O solo el celular?', escala: true, silencio: true }],
  },

  // A. Envíos: solo el envío del equipo. "Les envío" es el cliente mandando algo.
  {
    nombre: 'Bloque 8, envíos: "les envío unos precios" no es un envío',
    turnos: [{ c: 'Les envío algunos precios para que comparen?', escala: false }],
  },
  {
    nombre: 'Bloque 8, envíos: pregunta si hacen envíos',
    turnos: [{ c: 'hacen envíos a Córdoba?', escala: true, silencio: true }],
  },
  {
    // Registro real: ya pasó y no es el equipo.
    nombre: 'Bloque 8, envíos: "me lo mandaron al chat" no es un envío',
    turnos: [{ c: 'no lo tengo pq me lo mandaron al chat del otro celu se los iba a pedir cuando nos encontremos', escala: false }],
  },

  // A. Tarjeta: no tenerla va a los requisitos; pagar con ella sigue escalando.
  {
    nombre: 'Bloque 8, tarjeta: "no tengo tarjeta" va a los requisitos',
    turnos: [{ c: 'es que no tengo tarjeta de crédito yo', contiene: ['dni'], escala: false }],
  },
  {
    nombre: 'Bloque 8, tarjeta: pagar con tarjeta escala (otro medio de pago)',
    turnos: [{ c: 'puedo pagar con tarjeta?', escala: true, silencio: true }],
  },
  {
    // Lea lo que lea Gemini: con otra intención, igual van los requisitos.
    nombre: 'Bloque 8, tarjeta: "no tengo tarjeta" con otra lectura de Gemini',
    turnos: [{ c: 'es que no tengo tarjeta de crédito yo', lectura: { intencion: 'otro' }, contiene: ['dni'], escala: false }],
  },
  {
    nombre: 'Bloque 8, tarjeta: "quiero pagar sin tarjeta" va a los requisitos',
    turnos: [{ c: 'quiero pagar sin tarjeta, se puede?', contiene: ['dni'], escala: false }],
  },
  {
    nombre: 'Bloque 8, tarjeta: "y con tarjeta?" escala (otro medio de pago)',
    turnos: [{ c: 'tenes el 13?' }, { c: 'y con tarjeta?', silencio: true }],
  },
  {
    // Registro real (recortado): cuenta lo que hacen en otro lado, no pide pagar con tarjeta.
    nombre: 'Bloque 8, tarjeta: contar que en otro lado es con tarjeta no es pedirlo',
    turnos: [{ c: 'en donde consulté me decían que trabajan en cuotas con tarjeta, yo busco hacerlo en dos pagos', escala: false }],
  },

  // B. La "x" es un iPhone X solo con "iphone", "ip", "el", "un", "tenes" o "tienen"
  // delante, o sola. Antes, 11 mensajes reales como estos escalaban con "Ese justo no me
  // esta quedando, pero tengo iPhone 11 64GB 84% en $260.000".
  {
    nombre: 'Bloque 8, la "x": "2 x 45 / 3 x 66" no es un iPhone X',
    turnos: [{ c: '2 x 45\n3 x 66', modeloLeido: null, noContiene: ['Ese justo no me esta quedando'] }],
  },
  {
    nombre: 'Bloque 8, la "x": "Sino 5 x 65"',
    turnos: [{ c: 'Sino 5 x 65', modeloLeido: null, noContiene: ['Ese justo no me esta quedando'] }],
  },
  {
    nombre: 'Bloque 8, la "x": "Estoy x el centro"',
    turnos: [{ c: 'Estoy x el centro de cipo', modeloLeido: null, noContiene: ['Ese justo no me esta quedando'] }],
  },
  {
    nombre: 'Bloque 8, la "x": "x dnd venis"',
    turnos: [{ c: 'x dnd venis rey', modeloLeido: null, noContiene: ['Ese justo no me esta quedando'] }],
  },
  {
    nombre: 'Bloque 8, la "x": "x favor"',
    turnos: [
      {
        c: 'Te pido si x favor podes aguantarme un tiempito x la transferencia',
        modeloLeido: null,
        noContiene: ['Ese justo no me esta quedando'],
      },
    ],
  },
  {
    nombre: 'Bloque 8, la "x": "busco x otro lado"',
    turnos: [{ c: 'Avísame si no busco x otro lado', modeloLeido: null, noContiene: ['Ese justo no me esta quedando'] }],
  },
  {
    // Se lee como el X. Sin Gemini, el extractor local toma cualquier mensaje de menos de
    // 4 letras como "sin contenido" ("13?" también): eso no es de este bloque.
    nombre: 'Bloque 8, la "x": sola es el iPhone X',
    turnos: [{ c: 'x?', modeloLeido: 'x', noContiene: ['Ese justo no me esta quedando'] }],
  },
  {
    nombre: 'Bloque 8, la "x": "200 x el 11 pro" lee el 11 Pro',
    turnos: [{ c: 'Avísame si te sirve 200 x el 11 pro', modeloLeido: '11 pro' }],
  },

  // B. Horas: "cerca de las 14", "de las 16 en adelante".
  {
    nombre: 'Bloque 8, horas: "cerca de las 14" no es el iPhone 14',
    turnos: [{ c: 'Cerca de las 14, puede ser?', modeloLeido: null, noContiene: ['iPhone 14'] }],
  },
  {
    // Desde el bloque 10 "de las 16" es una hora: con el día y la hora no pregunta nada y
    // escala callado (antes preguntaba el horario).
    nombre: 'Bloque 8, horas: "de las 16 en adelante" no es el iPhone 16',
    turnos: [{ c: 'puedo pasar mañana de las 16 en adelante', modeloLeido: null, noContiene: ['iPhone 16'], silencio: true }],
  },

  // C. Dólares: si pregunta si se aceptan, sin monto, se contesta; con un monto o si pide
  // que le coticen en dólares, escala callado como siempre.
  {
    nombre: 'Bloque 8, dólares: pregunta si se aceptan',
    turnos: [
      {
        c: 'Aceptan dólares? O solo pesos',
        contiene: ['aceptamos dolares', 'cotizacion del dia'],
        noContiene: ['$'],
        escala: false,
      },
    ],
  },
  {
    // El hilo sigue en el mensaje siguiente.
    nombre: 'Bloque 8, dólares: con el 13 en juego, contesta y sigue la venta',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'toman dolares o solo pesos?', contiene: ['aceptamos dolares'], noContiene: ['$'], escala: false, maxMensajes: 1 },
      { c: 'dale, ese me gusta', contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'], escala: false },
    ],
  },
  {
    nombre: 'Bloque 8, dólares: con un monto en dólares escala callado',
    turnos: [{ c: 'Disculpa la demora, tengo 420 dolares y el resto en pesos', silencio: true }],
  },
  {
    nombre: 'Bloque 8, dólares: pregunta si se aceptan pero con un monto: escala callado',
    turnos: [{ c: 'aceptan dolares? tengo 300 usd', silencio: true }],
  },
  {
    // La tarjeta escala antes que la respuesta de los dólares.
    nombre: 'Bloque 8, dólares: "aceptan dólares o tarjeta?" escala callado',
    turnos: [{ c: 'aceptan dolares o tarjeta?', silencio: true }],
  },
  {
    // Sin preguntar si se aceptan: lo cotiza una persona.
    nombre: 'Bloque 8, dólares: "y el 14 en dólares?" escala callado',
    turnos: [{ c: 'y el 14 en dolares?', silencio: true }],
  },
  {
    nombre: 'Bloque 8, dólares: pedir el precio en dólares escala callado',
    turnos: [{ c: 'cuanto sale el 13 en dolares? aceptan?', silencio: true }],
  },

  // D. Mercado Pago se acepta. Con tarjeta en cuotas por Mercado Pago no está decidido.
  {
    nombre: 'Bloque 8, Mercado Pago: avisa que tiene',
    turnos: [{ c: 'una consulta por si las dudas tengo mercado pago', contiene: ['mercado pago'], noContiene: ['$'], escala: false }],
  },
  {
    // Con un monto no es solo una pregunta: se cotiza, como siempre.
    nombre: 'Bloque 8, Mercado Pago: con el monto, cotiza',
    turnos: [{ c: 'tengo 400 mil por mercado pago para el 13', contiene: ['1 pago', '2 pagos'], noContiene: ['podes pagar con mercado pago'], escala: false }],
  },
  {
    nombre: 'Bloque 8, Mercado Pago: en cuotas por Mercado Pago escala callado',
    turnos: [{ c: 'y en cuotas por mercado pago se puede?', silencio: true }],
  },
  {
    nombre: 'Bloque 8, Mercado Pago: tarjeta en cuotas por Mercado Pago escala callado',
    turnos: [{ c: 'puedo pagar en cuotas con la tarjeta por mercado pago?', silencio: true }],
  },
  {
    nombre: 'Bloque 8, medios de pago: el contado es efectivo, transferencia o mercado pago',
    turnos: [{ c: 'cuales son los medios de pago?', contiene: ['efectivo, transferencia o mercado pago'], escala: false }],
  },

  // E. Seña: no se pide. Se pregunta el día; cuando lo dice, sigue el turno y escala.
  {
    nombre: 'Bloque 8, seña: ofrece transferir para que se lo guarden',
    turnos: [
      { c: 'Te transfiero 100 si queres así me lo guardas', contiene: ['no pedimos seña', 'que dia'], noContiene: ['$'], escala: false },
      { c: 'mañana', contieneAlguno: ['en que horario', 'a que hora'], escala: true },
    ],
  },
  {
    nombre: 'Bloque 8, seña: "te adelanto que..." no ofrece nada',
    turnos: [{ c: 'te adelanto que mañana paso a verlo', noContiene: ['no pedimos seña'] }],
  },
  {
    nombre: 'Bloque 8, seña: "te dejo una seña"',
    turnos: [{ c: 'te dejo una seña y lo paso a buscar?', contiene: ['no pedimos seña', 'que dia'], escala: false }],
  },

  // F. Los anteriores al 11 no se trabajan, aunque estén cargados (decisión de Tomás del
  // 24/09/2026). Sin números y sin escalar. El 8, el 7 y el SE, solo con "iphone" o "ip".
  {
    nombre: 'Bloque 8, no se trabaja: el iPhone X',
    turnos: [
      {
        c: 'buenas como estan? tienen iphone x?',
        contiene: ['no lo trabajamos', 'del 11 al 18 Pro Max'],
        noContiene: ['$', 'no me esta quedando'],
        modeloLeido: 'x',
        escala: false,
      },
      // No queda como el modelo del chat: el mensaje siguiente no lo repite.
      { c: 'y cuanto sale?', noContiene: ['no lo trabajamos', '$'], escala: false },
    ],
  },
  {
    // La copia congelada tiene un XR en USADOS: igual no se trabaja.
    nombre: 'Bloque 8, no se trabaja: el XR, aunque esté cargado',
    turnos: [{ c: 'tenes el xr?', contiene: ['no lo trabajamos'], noContiene: ['$', '290.000'], escala: false }],
  },
  {
    nombre: 'Bloque 8, no se trabaja: el iPhone 8 Plus',
    turnos: [{ c: 'tenes el iphone 8 plus?', contiene: ['no lo trabajamos'], noContiene: ['$'], modeloLeido: '8 plus', escala: false }],
  },
  {
    nombre: 'Bloque 8, no se trabaja: el SE',
    turnos: [{ c: 'hola tenes ip se?', contiene: ['no lo trabajamos'], noContiene: ['$'], modeloLeido: 'se', escala: false }],
  },
  {
    nombre: 'Bloque 8: "el 8" suelto y "se" como palabra no son modelos',
    turnos: [
      { c: 'tenes el 8?', modeloLeido: null },
      { c: 'mi iphone se trabo, tenes el 13?', modeloLeido: '13', contiene: ['$495.000'] },
    ],
  },
  {
    // Sin otro modelo en el mensaje, el "se" leído como SE contestaría "no lo trabajamos".
    nombre: 'Bloque 8: "el iphone se me rompió" no pide un SE',
    turnos: [{ c: 'hola, el iphone se me rompio y busco otro', modeloLeido: null, noContiene: ['no lo trabajamos'] }],
  },

  // G. Fotos: pedirlas escala callado (el aviso al grupo lo prueba fotos-pedido.test.js).
  {
    nombre: 'Bloque 8, fotos: pide fotos o videos de dos modelos',
    turnos: [{ c: 'Te jodo mucho si me envías fotos o videos de ambos, del 15 y 16 xfa', silencio: true }],
  },
  {
    nombre: 'Bloque 8, fotos: "me pasás unas fotos del 15?"',
    turnos: [{ c: 'me pasás unas fotos del 15?', silencio: true }],
  },
  {
    nombre: 'Bloque 8, fotos: "ftos y precios"',
    turnos: [{ c: 'ftos y precios', silencio: true }],
  },
  {
    // La foto automática al elegir el modelo queda, con el texto nuevo.
    nombre: 'Bloque 8, fotos: la foto automática al elegir el modelo es "de referencia"',
    fotos: ['iPhone 14 Pro'],
    turnos: [
      { c: 'tenes el 14 pro?' },
      {
        c: 'ese me gusto',
        contiene: ['[foto: iPhone 14 Pro]', 'foto de referencia'],
        noContiene: ['fotos del equipo'],
        escala: false,
      },
    ],
  },

  // ---------- Bloque 9: el saludo siempre, y una sola respuesta de entrega para varios modelos ----------
  // Decisiones de Tomás del 24/09/2026, tras la prueba en vivo: después de un #reset,
  // "buenass como estan tenes iphone 14 pro? 15 pro? tengo 200.000" no saludó y mandó un
  // mensaje entero por modelo, con la explicación repetida. El saludo va en la primera
  // respuesta del día (hora de Argentina) si hoy nadie de la cuenta le escribió; si
  // pregunta cómo estamos, lo contesta y lo devuelve. Montos de la copia congelada: el
  // 14 Pro pide $480.000 de entrega inicial y el 15 Pro $530.000.
  {
    nombre: 'Bloque 9, prueba en vivo: saluda devolviendo el "como estan" y la entrega de los dos modelos va en un solo mensaje',
    turnos: [
      {
        c: 'buenass como estan tenes iphone 14 pro? 15 pro? tengo 200.000',
        saluda: 'devuelve',
        juntos: ['14 Pro', '15 Pro', '$480.000', '$530.000'],
        veces: { 'entrega inicial': 1, '1 o 2 cuotas': 1 },
        noContiene: ['falta', 'faltan'],
        maxMensajes: 4,
        escala: false,
      },
    ],
  },
  {
    // Son 4 mensajes (la antesala, la garantía, los precios y "cual te gusto"): el saludo
    // va pegado al primero.
    nombre: 'Bloque 9: "hola, tenes iphone 14 pro y 15 pro?" arranca con el saludo con el nombre, sin devolver nada',
    turnos: [{ c: 'hola, tenes iphone 14 pro y 15 pro?', saluda: true, contiene: ['800.000', '920.000'], maxMensajes: 4 }],
  },
  {
    nombre: 'Bloque 9: en el mismo chat y el mismo día no vuelve a saludar',
    turnos: [
      { c: 'hola tenes el 13?', saluda: true },
      { c: 'y el 14 pro?', saluda: false },
      { c: 'tengo 500.000', saluda: false },
    ],
  },
  {
    nombre: 'Bloque 9: si hoy ya le escribió una persona de la cuenta, no saluda',
    turnos: [
      { humano: 'hola! soy fran, en que te puedo ayudar?' },
      { c: 'tenes el 13?', saluda: false, contiene: ['$495.000'] },
    ],
  },
  {
    nombre: 'Bloque 9: la última charla fue ayer: saluda de nuevo',
    turnos: [
      { c: 'tenes el 13?', saluda: true },
      { pasanHoras: 24 },
      { c: 'y el 14 pro?', saluda: true },
      { c: 'y el 15?', saluda: false },
    ],
  },
  {
    nombre: 'Bloque 9: una persona le escribió ayer: hoy saluda',
    turnos: [
      { humano: 'hola! soy fran, en que te puedo ayudar?' },
      { pasanHoras: 24 },
      { c: 'tenes el 13?', saluda: true },
    ],
  },
  {
    nombre: 'Bloque 9: un escalado callado en el primer mensaje no saluda',
    turnos: [{ c: 'me mandás fotos del 15?', silencio: true }],
  },
  {
    nombre: 'Bloque 9: después de un #reset vuelve a saludar',
    turnos: [
      { c: 'tenes el 14 pro y el 15 pro?', saluda: true },
      { c: 'tengo 300.000', saluda: false },
      { reset: true },
      { c: 'tenes el 14 pro y el 15 pro?', saluda: true },
    ],
  },
  {
    // Explicación · PDF · "te lo llevas" · cotización: con el saludo serían 5.
    nombre: 'Bloque 9: con 4 mensajes, el saludo va pegado al primero y siguen siendo 4',
    turnos: [
      {
        c: 'tenes el 14 pro? tengo 600.000',
        saluda: true,
        juntos: ['tomass', 'entrega inicial'],
        contiene: ['[doc: compromiso de pago]', '📱'],
        maxMensajes: 4,
      },
    ],
  },
  {
    // Sin modelo y hablando hoy, retoma con el nombre ("retomar") y sin saludo. Al otro
    // día, el saludo del día y la pregunta: el nombre una sola vez.
    nombre: 'Bloque 9: sin modelo, el mismo día retoma con el nombre; al otro día, un solo saludo',
    turnos: [
      { c: 'hola', saluda: true, veces: { tomass: 1 } },
      { c: 'buenas', saluda: false, contiene: ['tomass'] },
      { pasanHoras: 24 },
      { c: 'hola', saluda: true, veces: { tomass: 1 } },
    ],
  },
  {
    // Desde cero, D5 (29/09/2026): lo que iba a contestar ya se lo dijo: no manda nada y escala callado.
    // Al otro día, "ese no lo trabajamos" ya se lo había dicho.
    nombre: 'Bloque 9: "no lo trabajamos" lleva un solo saludo; al otro día, lo mismo ya dicho escala',
    turnos: [
      { c: 'hola tenes el xr?', saluda: true, veces: { tomass: 1 }, contiene: ['no lo trabajamos'] },
      { pasanHoras: 24 },
      { c: 'y el iphone x?', silencio: true, motivo: 'no sé cómo seguir' },
    ],
  },
  {
    // El saludo de hoy ya salió aunque se haya ido de las 15 líneas del historial.
    nombre: 'Bloque 9: ya saludó hoy aunque el saludo no esté más en el historial',
    turnos: [
      { c: 'tenes el 13?', saluda: true },
      ...Array.from({ length: 15 }, (_, i) => ({ cliente: `mensaje suelto ${i + 1}` })),
      { c: 'y el 14 pro?', saluda: false },
    ],
  },
  {
    nombre: 'Bloque 9: "hola como andan?" contesta y devuelve la pregunta',
    turnos: [{ c: 'hola como andan? tenes el 13?', saluda: 'devuelve', contiene: ['$495.000'] }],
  },
  {
    nombre: 'Bloque 9: "buenas, todo bien?" contesta y devuelve la pregunta',
    turnos: [{ c: 'buenas, todo bien? tenes el 13?', saluda: 'devuelve' }],
  },
  {
    nombre: 'Bloque 9: sin nombre, el saludo que devuelve va sin nombre',
    pushName: '😃😃',
    turnos: [{ c: 'buenas como estas? tenes el 13?', saluda: 'devuelve' }],
  },
  {
    nombre: 'Bloque 9: "como estan de precio" no pregunta cómo estamos',
    turnos: [{ c: 'hola, como estan de precio los 13?', saluda: true }],
  },
  {
    nombre: 'Bloque 9: "como va la financiacion" no pregunta cómo estamos',
    turnos: [{ c: 'hola, como va la financiacion?', saluda: true }],
  },
  {
    // El 13 llega (mínimo $320.000); el 14 Pro y el 15 Pro no: esos dos van juntos.
    nombre: 'Bloque 9: el monto llega para uno y no para los otros dos: se agrupan solo los que no llegan',
    turnos: [
      {
        c: 'tenes 13, 14 pro y 15 pro? tengo 400.000',
        contiene: ['te podes llevar el 13', 'cual te gusta mas'],
        juntos: ['14 Pro', '15 Pro', '$480.000', '$530.000'],
        veces: { 'entrega inicial': 1, '1 o 2 cuotas': 1 },
        noContiene: ['falta', '$320.000'],
        maxMensajes: 4,
      },
    ],
  },
  {
    // La segunda vez, la variante que explica por qué (como con un modelo). Los conteos
    // avanzan los dos: a la tercera ya no se insiste con ninguno (a los dos les faltan más
    // de $45.000, así que va la alternativa, como antes del bloque 9).
    nombre: 'Bloque 9: la segunda vez con los dos modelos, otra vez un solo mensaje, y el conteo avanza para los dos',
    turnos: [
      { c: 'tenes 14 pro y 15 pro? tengo 200.000', veces: { 'entrega inicial': 1 } },
      {
        c: 'tengo 250.000',
        juntos: ['14 Pro', '15 Pro', '$480.000', '$530.000', 'es lo que nos deja financiarte'],
        // "te falta" y "le falta", no "falta": acá va el PDF, y una variante de su pie dice
        // "no hace falta tarjeta" (fallaba 1 de cada 4 corridas; decisión de Tomás del 25/09).
        noContiene: ['te falta', 'le falta'],
        maxMensajes: 4,
      },
      {
        c: 'tengo 250.000',
        contiene: ['mira lo que si te podes llevar'],
        noContiene: ['todavia no', 'entrega inicial', 'falta'],
      },
    ],
  },
  {
    // Con un modelo sigue como antes: la línea de ese modelo sola.
    nombre: 'Bloque 9: con un solo modelo que no llega, la línea de siempre',
    turnos: [{ c: 'tenes el 15 pro? tengo 200.000', contiene: ['al 15 Pro todavia no', '$530.000 de entrega inicial'], noContiene: ['14 Pro'] }],
  },
  {
    // Nombra dos y solo uno no llega: la línea de siempre de ese, no la de varios.
    nombre: 'Bloque 9: dos modelos y solo uno no llega: la línea de siempre para ese',
    turnos: [
      {
        c: 'tenes el 13 y el 15 pro? tengo 400.000',
        contiene: ['te podes llevar el 13', 'al 15 Pro todavia no', '$530.000 de entrega inicial'],
        noContiene: ['$320.000', 'falta'],
      },
    ],
  },

  // ---------- Bloque 10: el modelo que pregunta, los ejemplos pendientes y lo visto en el bloque 8 ----------
  // Decisiones de Tomás del 25/09/2026. Montos de la copia congelada: el 13 pide $320.000
  // de entrega inicial, el 14 Pro $480.000, el 15 Pro $530.000 y la unidad del 14 $290.000
  // (en vivo: 13 $340.000, 14 Pro $500.000, 15 Pro $540.000).

  // 1. "y el 13?" con una entrega que no llega: solo el modelo que preguntó.
  {
    // La prueba en vivo del 25/09 (cbd5104): el tercer turno nombraba los tres modelos.
    nombre: 'Bloque 10, prueba en vivo: "y el 13?" con una entrega que no llega nombra solo el 13',
    turnos: [
      { c: 'tenes iphone 14 pro y 15 pro?' },
      { c: 'tengo 200.000', juntos: ['14 Pro', '15 Pro', '$480.000', '$530.000'] },
      {
        c: 'y el 13?',
        contiene: ['13', '$320.000 de entrega inicial', '$200.000'],
        // Ni los modelos que ya se mostraron, ni la variante de la segunda vez: el 13 no
        // tenía ninguna insistencia.
        noContiene: ['14 Pro', '15 Pro', '$480.000', '$530.000', 'falta', 'alcanza', 'es lo que nos deja financiarte'],
        maxMensajes: 1,
        escala: false,
      },
      // Al 14 Pro y al 15 Pro no se les dijo nada en el turno anterior: su conteo sigue en 1 y
      // se les vuelve a decir la entrega inicial (antes, con el conteo en 2, iban con el contado).
      {
        c: 'tengo 200.000',
        juntos: ['14 Pro', '15 Pro', '13', '$480.000', '$530.000', '$320.000'],
        noContiene: ['de contado', 'falta'],
      },
    ],
  },
  {
    // Prueba en vivo del 25/09 con d07eb08: Gemini lee "y el 13?" con modelo "13" pero trae en
    // `modelos` también los de la charla (14 Pro y 15 Pro). Lo que pregunta el mensaje es lo que
    // nombra el texto, no la lista de Gemini.
    nombre: 'Bloque 10, en vivo: "y el 13?" con Gemini trayendo los modelos de la charla nombra solo el 13',
    turnos: [
      { c: 'tenes iphone 14 pro y 15 pro?' },
      { c: 'tengo 200.000' },
      {
        c: 'y el 13?}',
        lectura: { intencion: 'consulta_precio', modelo: '13', modelos: ['14 Pro', '15 Pro', '13'], entrega: null },
        contiene: ['13', '$320.000 de entrega inicial'],
        noContiene: ['14 Pro', '15 Pro', '$480.000', '$530.000', 'es lo que nos deja financiarte'],
        maxMensajes: 1,
        escala: false,
      },
    ],
  },
  {
    // Pregunta por dos a la vez y ninguno llega: un solo mensaje con esos dos, sin los de antes.
    nombre: 'Bloque 10: "y el 13 y el 14?" sin llegar a ninguno: un mensaje con esos dos solos',
    turnos: [
      { c: 'tenes iphone 14 pro y 15 pro?' },
      { c: 'tengo 200.000' },
      {
        c: 'y el 13 y el 14?',
        juntos: ['el 13', 'el 14', '$320.000', '$290.000'],
        noContiene: ['14 Pro', '15 Pro', '$480.000', '$530.000', 'falta', 'es lo que nos deja financiarte'],
        veces: { 'entrega inicial': 1 },
        maxMensajes: 1,
        escala: false,
      },
    ],
  },
  {
    // Si el que pregunta llega con su entrega, sigue como hoy: "te podes llevar el 13" y la
    // línea de los que no llegan.
    nombre: 'Bloque 10: "y el 13?" cuando el 13 sí llega sigue como antes',
    turnos: [
      { c: 'tenes iphone 14 pro y 15 pro?' },
      { c: 'tengo 400.000' },
      {
        c: 'y el 13?',
        contiene: ['te podes llevar el 13', 'cual te gusta mas'],
        juntos: ['14 Pro', '15 Pro', '$480.000', '$530.000'],
      },
    ],
  },
  {
    // Decisión de Tomás del 25/09 (caso mixto): si de los que pregunta uno llega y otro no,
    // sigue como hoy. En la copia congelada la unidad del 11 pide $170.000.
    nombre: 'Bloque 10: "y el 13 y el 11?" con el 11 que llega y el 13 que no: sigue como antes',
    turnos: [
      { c: 'tenes iphone 14 pro y 15 pro?' },
      { c: 'tengo 200.000' },
      {
        c: 'y el 13 y el 11?',
        contiene: ['te podes llevar el 11', 'cual te gusta mas'],
        juntos: ['14 Pro', '15 Pro', 'el 13', '$320.000'],
      },
    ],
  },
  {
    // Con un monto nuevo en el mismo mensaje no es "la entrega que ya dio": sigue como antes.
    nombre: 'Bloque 10: "y el 13? tengo 250.000" sigue como antes, con todos',
    turnos: [
      { c: 'tenes iphone 14 pro y 15 pro?' },
      { c: 'tengo 200.000' },
      { c: 'y el 13? tengo 250.000', juntos: ['14 Pro', '15 Pro', '13', '$320.000'] },
    ],
  },

  // 2. El paso 3 de varios modelos, sin "no te alcanza".
  {
    // Ninguno entra ni se insiste: los dos llevan dos insistencias y el 11 Pro no está
    // cargado (un modelo nuevo cotizable arrancaría en el paso 1).
    nombre: 'Bloque 10: el paso 3 de varios modelos dice "todavia no estamos para esos modelos"',
    turnos: [
      { c: 'tenes iphone 14 pro y 15 pro?' },
      { c: 'tengo 200.000' },
      { c: 'tengo 200.000' },
      {
        c: 'y el 11 pro?',
        contiene: ['con los $200.000 todavia no estamos para esos modelos', 'de contado'],
        noContiene: ['alcanza', 'falta'],
      },
    ],
  },

  // 3. Los ejemplos aprobados pendientes, con reglas generales y sus variantes.
  // a) Llegó al local ("Estoy aca ya creo", v1-32aee520ca46): escala callado.
  { nombre: 'Bloque 10, llegó al local: "ya llegue"', turnos: [{ c: 'ya llegue', silencio: true }] },
  { nombre: 'Bloque 10, llegó al local: "estoy afuera"', turnos: [{ c: 'estoy afuera', silencio: true }] },
  {
    nombre: 'Bloque 10, llegó al local: "estoy en la puerta" con una charla en curso',
    turnos: [{ c: 'tenes el 13?' }, { c: 'hola, estoy en la puerta', silencio: true }],
  },
  {
    // Registro real: "que llegue el 18" no es llegar al local.
    nombre: 'Bloque 10, llegó al local: "a que llegue el 18" no es llegar',
    // Desde cero (D8, 29/09/2026): "el 18" ya se lee como un modelo, y en la copia del 08/09 no
    // hay 18 (escalaría por D7). Con un 18 cargado, como la planilla de hoy.
    planilla: {
      config: PLANILLA.config,
      lista: [
        ...PLANILLA.lista,
        { origen: 'LISTA', modelo: 'iPhone 18', capacidad_gb: 256, condicion: 'Sellado', bateria_min: 0, precio_contado: 2500000, anticipo_min: 1500000, pago_unico_manual: 0, cuota_2_manual: 0, cotizable: true, notas: '' },
      ],
      usados: PLANILLA.usados,
    },
    turnos: [{ c: 'me dijo que espere capaz a que llegue el 18 y bajen los precios', escala: false }],
  },
  { nombre: 'Bloque 10, llegó al local: "estoy llegando"', turnos: [{ c: 'estoy llegando', silencio: true }] },
  {
    // Registro real: avisa que va a avisar. Sigue como antes (sin escalar).
    nombre: 'Bloque 10, llegó al local: "te aviso cuando estoy llegando" no es llegar',
    turnos: [{ c: 'Te aviso cuando estoy llegando', escala: false }],
  },
  // Registro real: "Ahí ya llego, estoy en el semáforo".
  { nombre: 'Bloque 10, llegó al local: "ahi ya llego"', turnos: [{ c: 'ahi ya llego', silencio: true }] },
  {
    nombre: 'Bloque 10, llegó al local: "estoy afuera de neuquen" no es llegar',
    turnos: [{ c: 'estoy afuera de neuquen, tenes el 13?', contiene: ['$495.000'], escala: false }],
  },
  {
    nombre: 'Bloque 10, llegó al local: "ya llegue a juntar" es la entrega',
    turnos: [{ c: 'ya llegue a juntar los 350.000 para el 13', contiene: ['1 pago de'], escala: false }],
  },
  {
    nombre: 'Bloque 10, llegó al local: "ya llego a la entrega?" no es llegar',
    turnos: [{ c: 'tenes el 13?' }, { c: 'con 300.000 ya llego a la entrega?', escala: false }],
  },
  {
    nombre: 'Bloque 10, llegó al local: "estoy aca en neuquen" no es llegar',
    turnos: [{ c: 'estoy aca en neuquen, tenes el 13?', contiene: ['$495.000'], escala: false }],
  },
  // b) Solo dice su nombre ("Mi nombre es Oriana", v1-b191cf048e50): escala callado si ya hay
  // una charla (decisión de Tomás del 25/09); en un chat nuevo, como antes.
  {
    nombre: 'Bloque 10, solo el nombre: "soy Oriana" con una charla en curso',
    turnos: [{ c: 'tenes el 13?' }, { c: 'soy Oriana', silencio: true }],
  },
  {
    nombre: 'Bloque 10, solo el nombre: "me llamo Dario" después de una persona',
    turnos: [
      { c: 'tenes el 13?' },
      { humano: 'dale, a nombre de quien te anoto?' },
      { c: 'me llamo Dario', silencio: true },
    ],
  },
  {
    nombre: 'Bloque 10, solo el nombre: con un saludo adelante',
    turnos: [{ c: 'tenes el 13?' }, { c: 'buenas, me llamo Oriana', silencio: true }],
  },
  {
    // Registro real ("carlos vizzioli me llamó").
    nombre: 'Bloque 10, solo el nombre: "carlos vizzioli me llamo"',
    turnos: [{ c: 'tenes el 13?' }, { c: 'carlos vizzioli me llamo', silencio: true }],
  },
  {
    nombre: 'Bloque 10, solo el nombre: en un chat nuevo sigue como antes',
    // La pregunta de siempre (`queModelo`, con variantes).
    turnos: [{ c: 'hola, soy Aylen', contieneAlguno: ['que modelito tenias en mente', 'que modelo estabas buscando', 'que estabas mirando'], escala: false }],
  },
  {
    nombre: 'Bloque 10, solo el nombre: "soy de cipolletti" no es un nombre',
    turnos: [{ c: 'tenes el 13?' }, { c: 'soy de cipolletti', escala: false }],
  },
  // c) Viene "un día de estos" (v1-50d31d1c6168): que nos manejamos con turnos, sin contado ni
  // cuotas y sin escalar.
  {
    nombre: 'Bloque 10, viene sin fecha: "cualquier dia de estos paso"',
    turnos: [
      { c: 'cualquier dia de estos paso', contiene: ['turno'], noContiene: ['contado', 'cuotas'], escala: false },
      // Cuando dice el día, el turno de siempre: el horario, y escala.
      { c: 'el jueves', contieneAlguno: ['horario', 'a que hora'], escala: true },
    ],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: "en la semana me doy una vuelta"',
    turnos: [{ c: 'en la semana me doy una vuelta', contiene: ['turno'], noContiene: ['contado', 'cuotas'], escala: false }],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: "algun dia de estos me acerco" después de ver el 13',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'algun dia de estos me acerco', contiene: ['turno'], noContiene: ['contado', 'cuotas'], escala: false },
    ],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: "me acerco en estos dias"',
    turnos: [{ c: 'me acerco en estos dias', contiene: ['turno'], noContiene: ['contado', 'cuotas'], escala: false }],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: "un dia de estos voy a pasar"',
    turnos: [{ c: 'un dia de estos voy a pasar', contiene: ['turno'], noContiene: ['contado', 'cuotas'], escala: false }],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: "despues me doy una vuelta"',
    turnos: [{ c: 'despues me doy una vuelta', contiene: ['turno'], noContiene: ['contado', 'cuotas'], escala: false }],
  },
  {
    // Con una hora y sin día, igual: el día es lo que falta.
    nombre: 'Bloque 10, viene sin fecha: "un dia de estos paso tipo las 5"',
    turnos: [{ c: 'un dia de estos paso tipo las 5', contiene: ['turno'], noContiene: ['contado', 'cuotas'], escala: false }],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: con un día es otro camino',
    turnos: [{ c: 'mañana me pego una vuelta', noContiene: ['cuando sepas que dia'] }],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: con un modelo sigue la venta',
    turnos: [{ c: 'un dia de estos paso a ver el 13', contiene: ['$495.000'], noContiene: ['cuando sepas que dia'] }],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: con un monto sigue la venta',
    turnos: [{ c: 'un dia de estos paso, tengo 300.000', contiene: ['mejor que te llevas'], noContiene: ['cuando sepas que dia'] }],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: si pregunta dónde estamos, la dirección',
    turnos: [{ c: 'un dia de estos paso, donde estan?', contiene: ['Belgrano 3090'], noContiene: ['cuando sepas que dia'] }],
  },
  {
    // Con una insistencia en curso, "lo pienso" (acá, la lectura de Gemini) sigue siendo un
    // rechazo: el último paso (a $280.000 le faltan $40.000: con recargo), no los turnos.
    nombre: 'Bloque 10, viene sin fecha: con una insistencia en curso, un "se va" sigue siendo rechazo',
    turnos: [
      { c: 'quiero el 13, tengo 280.000' },
      { c: 'bueno un dia de estos paso', lectura: { intencion: 'lo_piensa' }, contiene: ['1 pago de'], noContiene: ['cuando sepas que dia'] },
    ],
  },
  {
    nombre: 'Bloque 10, viene sin fecha: "en estos dias voy a juntar la plata" no es venir',
    turnos: [{ c: 'en estos dias voy a juntar la plata', noContiene: ['cuando sepas que dia'] }],
  },

  // 4. "de las 16" y "cerca de las 14" son horas; "cual de las dos", no.
  {
    nombre: 'Bloque 10, horas: "puedo pasar mañana de las 16 en adelante" no pregunta el horario',
    turnos: [{ c: 'puedo pasar mañana de las 16 en adelante', silencio: true }],
  },
  {
    nombre: 'Bloque 10, horas: "cerca de las 14"',
    turnos: [{ c: 'puedo pasar el jueves cerca de las 14', silencio: true }],
  },
  {
    // En letras, como "tipo las cinco" (con cifras ya lo toma "de las").
    nombre: 'Bloque 10, horas: "cerca de las dos"',
    turnos: [{ c: 'puedo pasar el jueves cerca de las dos', silencio: true }],
  },
  {
    nombre: 'Bloque 10, horas: "a partir de las 17"',
    turnos: [{ c: 'puedo pasar mañana a partir de las 17', silencio: true }],
  },
  {
    nombre: 'Bloque 10, horas: "tipo las 5" (ya estaba)',
    turnos: [{ c: 'puedo pasar mañana tipo las 5', silencio: true }],
  },
  {
    nombre: 'Bloque 10, horas: "cual de las dos me conviene?" no es una hora',
    turnos: [{ c: 'puedo pasar mañana? cual de las dos me conviene?', contieneAlguno: ['horario', 'a que hora'], escala: true }],
  },
  {
    nombre: 'Bloque 10, horas: "cual de las 2" tampoco',
    turnos: [{ c: 'puedo pasar mañana? cual de las 2 me conviene?', contieneAlguno: ['horario', 'a que hora'], escala: true }],
  },
  {
    // Agregado para no romper otra cosa: con cifras y "cuotas" atrás tampoco es una hora.
    nombre: 'Bloque 10, horas: "el valor de las 2 cuotas" tampoco',
    turnos: [{ c: 'puedo pasar mañana? y el valor de las 2 cuotas?', contieneAlguno: ['horario', 'a que hora'], escala: true }],
  },
  {
    // "de las" con el número en letras no es hora (con "cerca de" o "tipo" sí).
    nombre: 'Bloque 10, horas: "de las dos me quedo con..." tampoco',
    turnos: [{ c: 'puedo pasar mañana? de las dos me quedo con la negra', contieneAlguno: ['horario', 'a que hora'], escala: true }],
  },
  {
    nombre: 'Bloque 10, horas: "de las dos opciones" tampoco',
    turnos: [{ c: 'puedo pasar mañana? de las dos opciones cual me conviene?', contieneAlguno: ['horario', 'a que hora'], escala: true }],
  },

  // 5. Sin Gemini, un mensaje corto que es un modelo solo se lee como ese modelo.
  {
    nombre: 'Bloque 10, corto: "x?" es el iPhone X, que no se trabaja',
    turnos: [{ c: 'x?', contiene: ['no lo trabajamos'], noContiene: ['contame que estabas buscando', '$'], modeloLeido: 'x', escala: false }],
  },
  {
    nombre: 'Bloque 10, corto: "13?" es el 13',
    turnos: [{ c: '13?', contiene: ['$495.000'], noContiene: ['contame que estabas buscando'], modeloLeido: '13', escala: false }],
  },
  {
    nombre: 'Bloque 10, corto: "xr" solo',
    turnos: [{ c: 'xr', contiene: ['no lo trabajamos'], modeloLeido: 'xr', escala: false }],
  },
  {
    nombre: 'Bloque 10, corto: "ok" sigue como antes',
    turnos: [{ c: 'ok', contiene: ['contame que estabas buscando'], modeloLeido: null, escala: false }],
  },
  {
    nombre: 'Bloque 10, corto: "?" sigue como antes',
    turnos: [{ c: '?', contiene: ['contame que estabas buscando'], modeloLeido: null, escala: false }],
  },

  // 6. Un monto en dólares no es una entrega en pesos (el aviso con US$420 lo prueba
  // silencio.test.js).
  {
    nombre: 'Bloque 10, dólares: "tengo 420 dólares y el resto en pesos" escala callado sin leer $420.000',
    turnos: [{ c: 'tengo 420 dólares y el resto en pesos', silencio: true, entregaLeida: null }],
  },
  {
    // Si Gemini leyera los 420 dólares como pesos, igual no son una entrega.
    nombre: 'Bloque 10, dólares: la lectura de Gemini con los dólares como pesos no queda',
    turnos: [{ c: 'tengo 420 dólares y el resto en pesos', lectura: { entrega: 420000 }, silencio: true, entregaLeida: null }],
  },
  {
    nombre: 'Bloque 10, dólares: "usd 500" y "200 verdes" no son pesos',
    turnos: [
      // Con un monto en dólares escala callado, como siempre (bloque 8): lo cotiza una persona.
      { c: 'tenes el 13? tengo usd 500', silencio: true, entregaLeida: null },
      { c: 'tenes el 14? tengo 200 verdes', silencio: true, entregaLeida: null },
    ],
  },
  {
    nombre: 'Bloque 10, dólares: pesos y dólares en el mismo mensaje, se leen los pesos',
    turnos: [{ c: 'tenes el 13? tengo 350.000 y 200 dolares', silencio: true, entregaLeida: 350000 }],
  },

  // 7. Canje de un modelo que no se toma: solo "a partir del 11", sin pedir datos.
  {
    // Sin Gemini, "me tomás un iphone 8?" solo no se lee como canje: la lectura es la de Gemini.
    nombre: 'Bloque 10, canje: "me tomás un iphone 8?" no pide capacidad ni batería',
    turnos: [
      {
        c: 'me tomás un iphone 8?',
        lectura: { intencion: 'permuta', permuta: { ofrece: true, modelo: '8', capacidad_gb: null, bateria: null, tiene_fotos: false } },
        contiene: ['a partir del 11'],
        noContiene: ['almacenamiento', 'bateria', 'pasame', 'fotos'],
        escala: false,
        maxMensajes: 2,
      },
    ],
  },
  {
    nombre: 'Bloque 10, canje: "hacen canje? me tomás un iphone 8?"',
    turnos: [
      { c: 'hacen canje? me tomás un iphone 8?', contiene: ['a partir del 11'], noContiene: ['almacenamiento', 'bateria', 'pasame'], escala: false },
      // No queda un canje en curso: los datos que manda después no escalan como canje.
      { c: '64gb 80% de bateria', noContiene: ['a partir del 11', 'pasame'], escala: false },
    ],
  },
  {
    nombre: 'Bloque 10, canje: un XR como parte de pago',
    turnos: [{ c: 'te dejo mi iphone xr como parte de pago', contiene: ['a partir del 11'], noContiene: ['almacenamiento', 'pasame'], escala: false }],
  },
  {
    // Pidió el 13 para comprar: esa parte sigue como antes (queda como el modelo del chat).
    nombre: 'Bloque 10, canje: pide el 13 y ofrece un 8, y después pregunta el precio',
    turnos: [
      { c: 'tenes el 13? te dejo mi iphone 8 como parte de pago', contiene: ['a partir del 11'], noContiene: ['almacenamiento', 'pasame'], escala: false },
      { c: 'y cuanto sale?', contiene: ['$495.000'], noContiene: ['a partir del 11', 'pasame'], escala: false },
    ],
  },
  {
    // Agregado para no romper otra cosa: ofreció un 11 (canje en curso) y corrige a un 8. No
    // queda el canje del 11: lo que manda después no escala como canje.
    nombre: 'Bloque 10, canje: ofrece un 11, corrige a un 8, y después manda datos',
    turnos: [
      { c: 'hacen canje? tengo un iphone 11', contiene: ['pasame'] },
      // Desde cero, D5 (29/09/2026): lo que iba a contestar ya se lo dijo: no manda nada y escala callado. ("tomamos celulares a
      // partir del 11" salió con el pedido de datos).
      { c: 'no, es un iphone 8', silencio: true, motivo: 'no sé cómo seguir', noContiene: ['pasame', 'sin almacenamiento'] },
      { c: '128gb 90% de bateria', noContiene: ['a partir del 11', 'pasame'], escala: false },
    ],
  },
  {
    nombre: 'Bloque 10, canje: un 11 sigue pidiendo los datos',
    turnos: [{ c: 'hacen canje? tengo un iphone 11', contiene: ['a partir del 11', 'pasame'], escala: false }],
  },

  // Prueba en vivo del 25/09 con d07eb08: con Gemini fallaban "x?", el canje del 8 y "me quedo
  // con ese" con dos modelos. `lectura` simula lo que devolvió Gemini.
  {
    nombre: 'Bloque 10, en vivo: "x?" con Gemini sin modelo es el iPhone X',
    turnos: [
      {
        c: 'x?',
        lectura: { intencion: 'consulta_general', modelo: null, modelos: [] },
        contiene: ['no lo trabajamos'],
        noContiene: ['contame que estabas buscando', '$'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Bloque 10, en vivo: "13?" con Gemini sin modelo es el 13',
    turnos: [
      {
        c: '13?',
        lectura: { intencion: 'consulta_general', modelo: null, modelos: [] },
        contiene: ['$495.000'],
        noContiene: ['contame que estabas buscando'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Bloque 10, en vivo: canje del 8 con Gemini leyendo el 8 como modelo y no en permuta',
    turnos: [
      {
        c: 'hacen canje? me tomás un iphone 8?',
        lectura: { intencion: 'permuta', modelo: '8', modelos: ['8'], permuta: { ofrece: true, modelo: null, capacidad_gb: null, bateria: null, tiene_fotos: false } },
        contiene: ['a partir del 11'],
        noContiene: ['almacenamiento', 'bateria', 'pasame', 'fotos'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Bloque 10, en vivo: ofreció el 13 y el 14 y Gemini elige el 13: escala callado',
    turnos: [
      { c: 'tenes el 13 y el 14?' },
      {
        c: 'me quedo con ese que me recomendaste',
        lectura: { intencion: 'quiere_avanzar', modelo: '13', modelos: ['13'] },
        silencio: true,
      },
    ],
  },
  {
    nombre: 'Bloque 10, en vivo: ofreció solo el 13 y Gemini lee otro: sigue con el 13',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'me quedo con ese que me recomendaste',
        lectura: { intencion: 'quiere_avanzar', modelo: '14', modelos: ['14'] },
        modeloLeido: '13',
        noContiene: ['14'],
      },
    ],
  },
  // 8. "me quedo con ese que me recomendaste": el que ofreció el bot, si fue uno solo.
  {
    nombre: 'Bloque 10, lo recomendado: el bot ofreció solo el 13, sigue con el 13',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'me quedo con ese que me recomendaste',
        contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'],
        noContiene: ['depende de con cuanto', 'presupuesto'],
        modeloLeido: '13',
        escala: false,
      },
    ],
  },
  {
    nombre: 'Bloque 10, lo recomendado: "el que me pasaste" después de "el mejor que te llevas"',
    turnos: [
      { c: 'tengo 450.000' },
      { c: 'dale, quiero el que me pasaste', contiene: ['iPhone 15'], noContiene: ['depende de con cuanto'], modeloLeido: '15', escala: false },
    ],
  },
  {
    nombre: 'Bloque 10, lo recomendado: el bot ofreció el 13 y el 14, escala callado',
    turnos: [{ c: 'tenes el 13 y el 14?' }, { c: 'me quedo con ese que me recomendaste', silencio: true }],
  },
  {
    nombre: 'Bloque 10, lo recomendado: lo último lo escribió una persona, escala callado',
    turnos: [
      { c: 'tenes el 13?' },
      { humano: 'te recomiendo el 14 pro, esta impecable' },
      { c: 'me quedo con el que me dijiste', silencio: true },
    ],
  },
  {
    // Aunque la persona no nombre otro modelo: lo último se lo escribió ella.
    nombre: 'Bloque 10, lo recomendado: una persona escribió sin nombrar modelo, escala callado',
    turnos: [
      { c: 'tenes el 13?' },
      { humano: 'dale, cualquier duda avisame' },
      { c: 'me quedo con el que me dijiste', silencio: true },
    ],
  },
  {
    // Sin nada antes no hay a qué referirse, y tampoco es pedir una recomendación.
    nombre: 'Bloque 10, lo recomendado: "me quedo con el que me recomendaste" en un chat nuevo',
    turnos: [{ c: 'me quedo con el que me recomendaste', noContiene: ['depende de con cuanto'], escala: false }],
  },
  {
    nombre: 'Bloque 10, lo recomendado: "me recomendaron este lugar" en un chat nuevo no pide recomendación',
    turnos: [{ c: 'hola, me recomendaron este lugar', noContiene: ['depende de con cuanto'], escala: false }],
  },
  {
    nombre: 'Bloque 10, lo recomendado: "que me recomendas?" sigue pidiendo recomendación',
    turnos: [{ c: 'tenes el 13?' }, { c: 'que me recomendas?', contiene: ['depende de con cuanto'], escala: false }],
  },

  // Además: los anteriores al 11 no salen en nada que el bot ofrezca solo, aunque estén
  // cargados (la copia congelada tiene un XR en USADOS a $290.000).
  {
    nombre: 'Bloque 10, XR: "cual es el mas economico?" con un XR que es el más barato',
    planilla: CON_XR_BARATO,
    turnos: [{ c: 'cual es el mas economico?', contiene: ['iPhone 11'], noContiene: ['XR', '200.000'] }],
  },
  {
    nombre: 'Bloque 10, XR: la lista de unidades no lo muestra',
    turnos: [{ c: 'que precios tenes?', contiene: ['260.000'], noContiene: ['XR', '290.000'] }],
  },
  {
    nombre: 'Bloque 10, XR: la recomendación con monto no lo ofrece',
    turnos: [{ c: 'que me recomendas? tengo 195.000', contiene: ['iPhone 11'], noContiene: ['XR'] }],
  },
  {
    nombre: 'Bloque 10, XR: "el mejor que te llevas" no lo ofrece',
    turnos: [{ c: 'tengo 195.000', contiene: ['iPhone 11'], noContiene: ['XR'] }],
  },
  {
    nombre: 'Bloque 10, XR: "otras opciones" no lo ofrece',
    turnos: [{ c: 'quiero un 11 de 128' }, { c: 'es muy caro', noContiene: ['XR'] }],
  },
  {
    nombre: 'Bloque 10, XR: la alternativa por entrega baja no lo ofrece',
    turnos: [
      { c: 'quiero el 13, tengo 195.000' },
      { c: 'tengo 195.000' },
      { c: 'tengo 195.000', contiene: ['mira lo que si te podes llevar', 'iPhone 11'], noContiene: ['XR'] },
    ],
  },
  {
    nombre: 'Bloque 10, XR: "no me está quedando" no ofrece un XR',
    planilla: CON_XR_BARATO,
    turnos: [{ c: 'tenes el 11 pro?', contiene: ['no me esta quedando', 'iPhone 11'], noContiene: ['XR'] }],
  },
  // ---------- Análisis del 28/09: Gemini lee "elige el modelo" como quiere_avanzar ----------
  // En `evaluar` en línea con 3.5-flash-lite, "ese me gusto", "dale ese", "me quedo con el
  // 15 pro" y "me quedo con el que me recomendaste" salían como quiere_avanzar: el bot
  // preguntaba qué día viene y escalaba, en vez de seguir la venta como con el extractor
  // local. Elegir un modelo no es pedir turno.
  {
    nombre: 'Gemini quiere_avanzar: "ese me gusto" después del precio pregunta cómo paga',
    turnos: [
      { c: 'tenes el 14 pro?' },
      {
        c: 'ese me gusto',
        lectura: { intencion: 'quiere_avanzar' },
        contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'],
        noContiene: ['que dia'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Gemini quiere_avanzar: "me quedo con ese que me recomendaste" sigue con el 13',
    turnos: [
      { c: 'tenes el 13?' },
      {
        c: 'me quedo con ese que me recomendaste',
        lectura: { intencion: 'quiere_avanzar' },
        contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'],
        modeloLeido: '13',
        escala: false,
      },
    ],
  },
  {
    nombre: 'Gemini quiere_avanzar: "me quedo con el 15 pro" entre dos modelos pregunta cómo paga',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'ssii me interesaba el 15 pro tambien' },
      {
        c: 'me quedo con el 15 pro',
        lectura: { intencion: 'quiere_avanzar', modelo: '15 pro', modelos: ['15 pro'] },
        contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Gemini quiere_avanzar: "dale el 14" después de "cual te gusta mas" lo cotiza',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil' },
      { c: 'y el 14?' },
      {
        c: 'dale el 14',
        lectura: { intencion: 'quiere_avanzar', modelo: '14', modelos: ['14'] },
        contiene: ['1 pago'],
        noContiene: ['que dia'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Gemini quiere_avanzar: con el modelo y "cuando puedo pasar" sigue siendo turno',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'dale ese, cuando puedo pasar?', lectura: { intencion: 'quiere_avanzar' }, escala: true },
    ],
  },
  {
    nombre: 'Gemini quiere_avanzar: "lo quiero" después de la cotización sigue siendo turno',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil' },
      { c: 'lo quiero', lectura: { intencion: 'quiere_avanzar' }, escala: true },
    ],
  },
  // ---------- Lista de precios completa (decisión de Tomás del 28/09/2026) ----------
  // Hasta entonces iban solo los 6 modelos más baratos: del 15 Pro para arriba no salían.
  {
    nombre: 'Lista de precios: van todos los modelos cotizables, del más barato al más caro',
    turnos: [
      {
        c: 'pasame lista de precios',
        contiene: [
          'Ip 13 128gb 100% 495.000',
          'Ip 15 Pro 128gb 85% 920.000',
          'Ip 16 128gb 85% 1.050.000',
          'Ip 16 Pro 128gb 90% 1.200.000',
          'Ip 17 128gb sellado 1.600.000',
          'Ip 17 Pro 128gb sellado 1.970.000',
          'Ip 17 Pro Max 128gb sellado 2.200.000',
        ],
        escala: false,
        maxMensajes: 4,
      },
    ],
  },
  {
    // "pasame la lista" sola se leía como consulta_general (el extractor local, y Gemini a
    // veces) y contestaba "contame que estabas buscando" en vez de la lista.
    nombre: 'Lista de precios: "pasame la lista" leída como consulta general manda la lista',
    turnos: [
      {
        c: 'pasame la lista',
        lectura: { intencion: 'consulta_general' },
        contiene: ['Ip 13 128gb 100% 495.000', 'Ip 17 Pro Max 128gb sellado 2.200.000'],
        escala: false,
      },
    ],
  },
  // ---------- Prueba en vivo del 28/09/2026 ----------
  {
    nombre: 'En vivo 28/09: "me la pasas de nuevo?" después de la lista la manda otra vez',
    turnos: [
      { c: 'que precios tenes?' },
      {
        c: 'me la pasas de nuevo?',
        lectura: { intencion: 'consulta_general', modelo: null, modelos: [] },
        contiene: ['Ip 13 128gb 100% 495.000', 'Ip 17 Pro Max 128gb sellado 2.200.000'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'En vivo 28/09: "mandamela otra vez" leída como sin contenido manda la lista',
    turnos: [
      { c: 'pasame lista de precios' },
      {
        c: 'mandamela otra vez',
        lectura: { intencion: 'sin_contenido', modelo: null, modelos: [] },
        contiene: ['Ip 17 Pro Max 128gb sellado 2.200.000'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'En vivo 28/09: sin lista mandada, "me la pasas?" no manda la lista',
    turnos: [{ c: 'me la pasas?', noContiene: ['Ip 17 Pro Max'] }],
  },
  {
    // Con la cotización ya hecha, "dale ese" es avanzar: el turno, no la misma cotización otra vez.
    nombre: 'En vivo 28/09: cotizado y "dale ese" (Gemini quiere_avanzar) pregunta el día y escala',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 mil' },
      {
        c: 'dale ese',
        lectura: { intencion: 'quiere_avanzar', modelo: null, modelos: [] },
        contieneAlguno: ['que dia', 'dia podrias', 'cuando podrias'],
        noContiene: ['lo hacemos con eso', 'te queda comodo asi'],
        escala: true,
      },
    ],
  },
  // ---------- `evaluar` en línea, 28/09/2026: Gemini arrastra el canje del 8 ----------
  {
    nombre: 'Gemini arrastra el canje del 8: los datos que manda después no repiten "a partir del 11"',
    turnos: [
      { c: 'hacen canje? me tomás un iphone 8?' },
      {
        c: '64gb 80% de bateria',
        lectura: { intencion: 'permuta', permuta: { ofrece: true, modelo: '8', capacidad_gb: 64, bateria: 80, tiene_fotos: false } },
        noContiene: ['a partir del 11', 'pasame'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Gemini arrastra el canje del 8: "y cuanto sale?" da el precio del 13',
    turnos: [
      { c: 'tenes el 13? te dejo mi iphone 8 como parte de pago' },
      {
        c: 'y cuanto sale?',
        lectura: { intencion: 'permuta', modelo: '13', modelos: ['13'], permuta: { ofrece: true, modelo: '8' } },
        contiene: ['$495.000'],
        noContiene: ['a partir del 11'],
      },
    ],
  },
  {
    nombre: 'Gemini: "dale" suelto sin nada en juego no pide turno',
    turnos: [
      { c: 'ok' },
      // Como cualquier acuse seguido de otro: no se contesta ni escala.
      { c: 'dale', lectura: { intencion: 'quiere_avanzar', modelo: null, modelos: [] }, escala: false, mudo: true },
    ],
  },
  // ---------- `evaluar` en línea, 28/09/2026: lo que lee el texto le gana a Gemini ----------
  {
    nombre: 'Gemini lee "es carisimo" con el modelo de la charla: ofrece otras opciones, no "buena eleccion"',
    turnos: [
      { c: 'tenes el 17 pro?' },
      {
        c: 'es carisimo',
        lectura: { intencion: 'consulta_precio', modelo: '17 pro', modelos: ['17 pro'] },
        contiene: ['otras opciones'],
        noContiene: ['buena eleccion'],
      },
    ],
  },
  {
    nombre: 'Gemini lee modelo + garantía como consulta de stock: contesta la garantía',
    turnos: [
      {
        c: 'tenes el 13 blanco? que garantia tiene?',
        lectura: { intencion: 'consulta_stock', modelo: '13', modelos: ['13'] },
        redactar: false,
        contiene: ['1 mes de garantia'],
      },
    ],
  },
  {
    nombre: 'Gemini lee "puntos de encuentro" como consulta general: escala igual',
    turnos: [
      {
        c: 'ustedes tienen oficina o hacen puntos de encuentro? yo soy de Allen',
        lectura: { intencion: 'consulta_general', modelo: null, modelos: [] },
        escala: true,
        noContiene: ['fran'],
      },
    ],
  },
  // ---------- Reproducción de chats reales contra el bot de hoy (28/09/2026) ----------
  {
    nombre: 'Chats reales: "te llevo la plata" leído como canje no pide datos del equipo',
    turnos: [
      {
        c: 'Q onda amigo buen día\nDespués del medio día te llevo la plata dale',
        lectura: { intencion: 'permuta', permuta: { ofrece: true } },
        noContiene: ['a partir del 11', 'pasame'],
      },
    ],
  },
  {
    nombre: 'Chats reales: "avisame si se puede" leído como canje no pide datos del equipo',
    turnos: [{ c: 'Avísame si se puede', lectura: { intencion: 'permuta', permuta: { ofrece: true } }, noContiene: ['a partir del 11', 'pasame'] }],
  },
  {
    nombre: 'Chats reales: "tengo un 16 pro" como canje sigue pidiendo los datos',
    turnos: [
      { c: 'Tengo un 16 pro', lectura: { intencion: 'permuta', modelo: null, modelos: [], permuta: { ofrece: true, modelo: '16 pro' } }, contiene: ['a partir del 11'] },
    ],
  },
  {
    nombre: 'Chats reales: "pasame alias" escala callado',
    turnos: [{ c: 'Pásame alias', lectura: { intencion: 'sin_contenido', modelo: null, modelos: [] }, escala: true, silencio: true }],
  },
  {
    nombre: 'Chats reales: "me pasarias el alias?" con saludo escala callado',
    turnos: [{ c: 'Hola Franco buenos dias\nMe pasarias el alias?', escala: true, silencio: true }],
  },
  // ---------- `evaluar` en línea, 28/09/2026: dos modelos en el texto y Gemini trae menos ----------
  ...[
    ['consulta_general sin modelos', { intencion: 'consulta_general', modelo: null, modelos: [] }],
    ['consulta_precio con uno solo', { intencion: 'consulta_precio', modelo: '13', modelos: ['13'] }],
    ['propone_pago sin modelos', { intencion: 'propone_pago', modelo: null, modelos: [] }],
    // Lo que leyó Gemini en la prueba en vivo del 28/09 (registro de aprendizaje).
    ['consulta_general con los dos', { intencion: 'consulta_general', modelo: '13', modelos: ['13', '15'] }],
  ].map(([como, lectura]) => ({
    nombre: `Nombra dos modelos y pregunta por cuotas, Gemini lee ${como}: los dos precios y cuál le gusta`,
    turnos: [
      {
        c: 'tenia en mente un 13 y un 15, vi que hacian cuotas, me dan info?',
        lectura,
        contiene: ['495.000', '740.000'],
        contieneAlguno: ['cual se acopla mas a vos', 'cual te gusto mas', 'cual te cierra mas'],
      },
    ],
  })),
  // ---------- Muestra de repro-v1 (28/09/2026): entrega partida, "90" de batería y postventa ----------
  // Los 3 errores reales de la muestra calificada (decisiones de Tomás del 28/09/2026).
  // #154: "tengo 180 en efectivo y 120 en transferencia" cotizaba con $180.000.
  {
    nombre: 'Repro-v1 #154: "tengo 180 en efectivo y 120 en transferencia" es una entrega de $300.000',
    turnos: [
      { c: 'tenes el 11?' },
      { c: 'tengo 180 en efectivo y 120 en transferencia', entregaLeida: 300000, contiene: ['$300.000'], noContiene: ['$180.000'] },
    ],
  },
  {
    // Lo que leyó Gemini en la reproducción: 180.000. La suma le gana.
    nombre: 'Repro-v1 #154: Gemini lee $180.000 y la suma le gana',
    turnos: [
      {
        c: 'Q onda amigo che sabes\nTengo 180 en efectivo y\n120 en transferencia? No hay drama',
        lectura: { entrega: 180000, intencion: 'declara_entrega' },
        entregaLeida: 300000,
        contiene: ['$300.000'],
        noContiene: ['$180.000'],
      },
    ],
  },
  {
    nombre: 'Entrega partida: "150 cash y 100 por mp" son $250.000',
    turnos: [{ c: 'tenes el 11? tengo 150 cash y 100 por mp', entregaLeida: 250000, contiene: ['$250.000'] }],
  },
  {
    nombre: 'Entrega partida: dos montos sin forma de pago no se suman ("tengo 180 y 120" es $180.000)',
    turnos: [{ c: 'tengo 180 y 120', entregaLeida: 180000 }],
  },
  {
    nombre: 'Entrega partida: un solo monto con forma de pago sigue igual',
    turnos: [{ c: 'tengo 180 en efectivo', entregaLeida: 180000 }],
  },
  // #368: le preguntaron la batería de su equipo, contestó "90" y el bot lo tomó como $90.000.
  {
    nombre: 'Repro-v1 #368: canje en curso, el bot pidió la batería y contesta "90" (Gemini lee $90.000)',
    turnos: [
      { c: 'te dejo mi 12 en parte de pago para el 13', contiene: ['bateria'] },
      { c: '90', lectura: { entrega: 90000, intencion: 'declara_entrega' }, entregaLeida: null, noContiene: ['monto', '$'], silencio: true },
    ],
  },
  {
    nombre: 'Repro-v1 #368: canje en curso, "90%" sin Gemini también es la batería',
    turnos: [
      { c: 'te dejo mi 12 en parte de pago para el 13', contiene: ['bateria'] },
      { c: '90%', entregaLeida: null, noContiene: ['monto', '$', 'contame que estabas buscando'], silencio: true },
    ],
  },
  {
    nombre: 'Repro-v1 #368: una persona preguntó la batería, sin canje en el estado: "90" escala callado',
    turnos: [
      { c: 'hola, tenes el 13?' },
      { humano: 'que bateria tiene tu celu?' },
      { c: '90', lectura: { entrega: 90000, intencion: 'declara_entrega' }, entregaLeida: null, silencio: true },
    ],
  },
  {
    nombre: 'Repro-v1 #368: "90" suelto sin canje ni pregunta de batería no es plata aunque Gemini lea $90.000',
    turnos: [
      { c: '90', lectura: { entrega: 90000, intencion: 'declara_entrega' }, entregaLeida: null, noContiene: ['con ese monto', '$'], escala: false },
    ],
  },
  {
    nombre: 'Repro-v1 #368: "90" después de una cotización tampoco es plata con Gemini (el piso de montoSuelto es 100)',
    turnos: [
      { c: 'tenes el 13? tengo 400', contiene: ['📱'] },
      { c: '90', lectura: { entrega: 90000, intencion: 'declara_entrega' }, entregaLeida: null, noContiene: ['$90.000'], escala: false },
    ],
  },
  // #694: la cuenta le venía cobrando la cuota (ya compró) y el bot le hacía la pregunta de venta.
  {
    nombre: 'Repro-v1 #694: la cuenta le cobra la cuota y contesta que la está juntando: postventa, escala callado',
    turnos: [
      { humano: 'Estaria necesitando si me podrias transferir lo de la cuota' },
      { humano: 'te dejo el alias' },
      { humano: 'te encargo el comprobante de la transferencia, sino la cuota ya aumenta a 999.000 por los 10 dias de demora' },
      { c: 'hola Fran, bueno dale, dale dale, ahí estoy viendo si la puedo tener para y si no bueno. te pagás, ¿vale?', silencio: true },
      { c: 'Bueno dale gracias y disculpa la demora si', silencio: true },
      // Pide un modelo nuevo: sigue como venta.
      { c: 'tenés el 15?', escala: false, contiene: ['15'] },
    ],
  },
  {
    nombre: 'Repro-v1 #694: marcado #vendido, "hola, todo bien?" escala callado',
    turnos: [{ vendido: true }, { c: 'hola, todo bien?', silencio: true }],
  },
  {
    nombre: 'Repro-v1 #694: marcado #vendido y pide un modelo nuevo sigue como venta',
    turnos: [{ vendido: true }, { c: 'precio del 13 pro', escala: false, contiene: ['13 Pro'] }],
  },
  {
    nombre: 'Repro-v1 #694: en un chat nuevo, "hola, todo bien?" sigue como siempre',
    turnos: [{ c: 'hola, todo bien?', escala: false, saluda: 'devuelve' }],
  },
  {
    nombre: 'Repro-v1 #694: la cotización del bot ("2 pagos de") no es cobranza: "dale gracias" sigue como siempre',
    turnos: [
      { c: 'tenes el 11? tengo 180', contiene: ['2 pagos de'] },
      { c: 'dale gracias', escala: false },
    ],
  },
  {
    nombre: 'Repro-v1 #694: la explicación de la financiación ("1 o 2 cuotas") no es cobranza: "dale gracias" sigue como siempre',
    turnos: [
      { c: 'tenes el 13? tengo 300', contieneAlguno: ['1 o 2 cuotas', 'hasta 2 cuotas'] },
      { c: 'dale gracias', escala: false },
    ],
  },

  // ---------- Desde cero (diagnóstico y decisiones de Tomás del 29/09/2026) ----------
  // Los ids CxTy son las tandas del diagnóstico (desde-cero/revisar-vivo.md). Montos de la
  // copia congelada.

  // Grupo 3 · D4: una pregunta por el estado del equipo que vendemos escala callado
  // siempre, haya modelo en juego o no. Nunca el texto de importados ni "cómo pensabas
  // pagarlo" (la regla rota del diagnóstico: C16T3, C27T4, C27T5, C37T3, C77T2).
  {
    nombre: 'Desde cero G3 (D4): "cuanta bateria tiene?" con el 15 en juego escala callado',
    turnos: [
      { c: 'tenes el 15?', contiene: ['$740.000'] },
      { c: 'cuanta bateria tiene?', silencio: true, motivo: 'pregunta por el estado del equipo' },
    ],
  },
  {
    nombre: 'Desde cero G3 (D4): "bateria?" sin modelo en la charla escala callado (C16T3)',
    turnos: [{ c: 'bateria?', silencio: true, motivo: 'pregunta por el estado del equipo' }],
  },
  {
    nombre: 'Desde cero G3 (D4): "te quedan 16 sellados?" escala: no se ofrece el usado (C67T2)',
    turnos: [{ c: 'te quedan 16 sellados?', silencio: true, motivo: 'pregunta por el estado del equipo', noContiene: ['85%'] }],
  },
  {
    nombre: 'Desde cero G3 (D4): "es usado o nuevo?" con el 13 en juego escala, nunca importados (C37T3)',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { c: 'es usado o nuevo?', silencio: true, motivo: 'estado del equipo', noContiene: ['importamos'] },
    ],
  },
  {
    nombre: 'Desde cero G3 (D4): la batería escala aunque diga "originales" (C46T3)',
    turnos: [{ c: 'las baterias son originales?\nde los usados', silencio: true, motivo: 'estado del equipo' }],
  },
  {
    nombre: 'Desde cero G3 (D4): Gemini lee consulta general con el modelo y la pregunta es la batería (C77T2)',
    turnos: [
      { c: 'tenes el 15?' },
      {
        c: 'Consulta este como está de batería?',
        lectura: { intencion: 'consulta_general', modelo: '15' },
        silencio: true,
        motivo: 'estado del equipo',
        noContiene: ['importamos', 'buenass'],
      },
    ],
  },
  {
    nombre: 'Desde cero G3 (D4): capacidad, memoria, módulo, detalles y "sellado nada?" escalan',
    turnos: [
      { c: 'tenes el 16 pro?' },
      { c: 'y el almacenamiento viene con 128 de base no?', silencio: true, motivo: 'estado del equipo' },
      { c: 'con mas memoria', silencio: true, motivo: 'estado del equipo' },
      { c: 'tiene el modulo cambiado?', silencio: true, motivo: 'estado del equipo' },
      { c: 'algun detalle tiene el celu?', silencio: true, motivo: 'estado del equipo' },
      { c: 'sellado nada?', silencio: true, motivo: 'estado del equipo' },
      { c: 'tiene rayones?', silencio: true, motivo: 'estado del equipo' },
    ],
  },
  {
    nombre: 'Desde cero G3 (D4): el origen del equipo sigue con el texto de importados',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'son originales? de donde vienen los equipos?', contiene: ['importamos'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G3 (D4): los datos de SU equipo en un canje siguen como hoy',
    turnos: [
      { c: 'hago plan canje con mi 13 de 128 con 85% de bateria', noContiene: ['estado del equipo'], contiene: ['fotos'] },
    ],
  },
  {
    nombre: 'Desde cero G3 (D4): una consulta de stock con capacidad sigue como hoy',
    turnos: [{ c: 'tenes el 13 de 256?', escala: false, contiene: ['iPhone 13'] }],
  },

  // Grupo 1 · el canje se come la charla (D1, D2, D3).
  // a) En el primer mensaje del canje, los datos que ya dio no se vuelven a pedir.
  {
    nombre: 'Desde cero G1: "cambiar mi iphone 13 de 128 con 85% por un 15" pide solo las fotos',
    turnos: [
      {
        c: 'hola, quiero cambiar mi iphone 13 de 128 con 85% de bateria por un 15',
        contiene: ['pasame unas fotos'],
        noContiene: ['modelo,', 'almacenamiento', 'condicion de bateria'],
        escala: false,
      },
    ],
  },
  {
    // C21T1: Gemini leyó el canje con los campos vacíos.
    nombre: 'Desde cero G1 (C21T1): Gemini deja vacíos los datos del canje y el texto los tiene',
    turnos: [
      {
        c: 'Hola buenas tardes, quería consultarle que quería hacer un plan de pago con mi celular iPhone 14 con 77% a cuánto me lo toman para sacar otro celular',
        lectura: { intencion: 'permuta', modelo: null, modelos: [], permuta: { ofrece: true, modelo: null, capacidad_gb: null, bateria: null, tiene_fotos: false } },
        contiene: ['almacenamiento', 'unas fotos'],
        noContiene: ['modelo,', 'condicion de bateria'],
      },
    ],
  },
  {
    nombre: 'Desde cero G1 (C41T3, C80T1, C69T5): modelo, capacidad y batería en el primer mensaje',
    turnos: [
      { c: 'tengo un 16 pro de 512 gb a cuanto me lo tomarias?', contiene: ['condicion de bateria', 'unas fotos'], noContiene: ['modelo,', 'almacenamiento'] },
      { reset: true },
      {
        c: 'Holaa, cómo le va?\nSabe que quería averiguar si se puede entregar un iPhone 16 pro con 91% de batería y 128gb\nNo tiene ningún detalle',
        contiene: ['pasame unas fotos'],
        noContiene: ['modelo,', 'almacenamiento', 'condicion de bateria', 'estado del equipo'],
        escala: false,
      },
      { reset: true },
      {
        c: 'Toman iPhones en parte de pago?\nTengo un 14 pro Max con 82%\nApenas un detalle en el marco de metal pero del uso que no se nota tampoco',
        contiene: ['almacenamiento', 'unas fotos'],
        noContiene: ['modelo,', 'condicion de bateria'],
        escala: false,
      },
    ],
  },
  // b) D1: la foto sin texto en un canje en curso cuenta como "mandó fotos".
  {
    nombre: 'Desde cero G1 (D1): canje con los datos pedidos, manda una foto sin texto: escala callado con los datos',
    turnos: [
      { c: 'hacen canje?', contiene: ['pasame modelo'] },
      { c: 'tengo un 14 de 128 con 81%', silencio: true, motivo: 'mandó los datos del equipo' },
      { fotos: 1, silencio: true, motivo: 'mandó los datos del equipo' },
      { c: 'cuanto me queda la diferencia?', silencio: true, noContiene: ['sin unas fotos'] },
    ],
  },
  {
    nombre: 'Desde cero G1 (D1): pidió los datos y solo manda fotos (un álbum): escala callado',
    turnos: [
      { c: 'te dejo mi 12 en parte de pago para el 13', contiene: ['unas fotos'] },
      { fotos: 4, silencio: true, motivo: 'mandó los datos del equipo' },
    ],
  },
  {
    nombre: 'Desde cero G1 (D1): la foto llega en la misma tanda en que arranca el canje',
    turnos: [
      { c: 'hago plan canje con mi 13 de 128 con 85% de bateria', fotos: 2, silencio: true, motivo: 'canje' },
      { reset: true },
      { c: 'hago plan canje con mi 13', fotos: 1, contiene: ['almacenamiento', 'condicion de bateria'], noContiene: ['fotos'] },
    ],
  },
  {
    nombre: 'Desde cero G1 (D1): fuera de un canje, la foto sin texto sigue como hoy (nada)',
    turnos: [{ c: 'tenes el 13?' }, { fotos: 1, mudo: true }],
  },
  // c) D2: mientras hay un canje, lo que no habla del canje sigue el flujo normal, y "sin X
  // no te puedo pasar el numero exacto" va una sola vez: a la segunda, escala callado.
  {
    nombre: 'Desde cero G1 (D2, C58T2): canje pendiente y pregunta el precio del 15 Pro: contesta el precio',
    turnos: [
      { c: 'toman usados en parte de pago?', contiene: ['pasame modelo'] },
      { c: 'cuanto sale el 15 pro?', contiene: ['$920.000'], noContiene: ['no te puedo pasar el numero'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G1 (D2): "sin X" una sola vez; a la segunda sin datos escala callado',
    turnos: [
      { c: 'te dejo mi 12 en parte de pago para el 13', contiene: ['unas fotos'] },
      { c: 'y cuanto me tomas el mio?', contiene: ['no te puedo pasar el numero exacto'], escala: false },
      { c: 'y cuanto me queda la diferencia?', silencio: true, motivo: 'canje: no manda los datos del equipo' },
    ],
  },
  {
    nombre: 'Desde cero G1 (D2, C6T6, C31T4): "te aviso" y el stock siguen el flujo normal con el canje pendiente',
    turnos: [
      { c: 'te dejo mi 12 en parte de pago para el 13', contiene: ['unas fotos'] },
      { c: 'tenes stock del 17 pro?', contiene: ['17 Pro'], noContiene: ['no te puedo pasar el numero'] },
      { c: 'cuando tenga la plata te aviso', noContiene: ['no te puedo pasar el numero'], escala: false },
    ],
  },
  // d) Ve un canje donde no lo hay, o no lo ve.
  {
    nombre: 'Desde cero G1 (C35T2): "estoy viendo si vendo mi celu" no es canje, aunque Gemini lo lea así',
    turnos: [
      {
        c: 'tengo 450 mil, estoy viendo si vendo mi celu actual',
        lectura: { intencion: 'permuta', permuta: { ofrece: true } },
        noContiene: ['tomamos celulares', 'pasame modelo'],
      },
      { c: 'el 13 o el 14', noContiene: ['tomamos celulares', 'no te puedo pasar el numero'], contiene: ['$450.000'] },
    ],
  },
  {
    nombre: 'Desde cero G1 (C31T2): "tengo un celu, voy a ver si lo vendo" no es canje',
    turnos: [
      {
        c: 'Pasame los dos planes porfa y ahi veo bien\nYo igual tengo un celu depende de lo que vos le pases, voy a ver si este finde lo puedo vender enseguida y comprarte a vos',
        lectura: { intencion: 'permuta', permuta: { ofrece: true } },
        noContiene: ['tomamos celulares', 'pasame modelo'],
      },
    ],
  },
  {
    nombre: 'Desde cero G1: "tenes el 16 pro? te dejo mi 15 pro y te pongo plata" es canje, no dos precios',
    turnos: [
      { c: 'tenes el 16 pro? te dejo mi 15 pro y te pongo plata', contiene: ['unas fotos'], noContiene: ['920.000', '1.200.000', 'modelo,'] },
    ],
  },
  {
    nombre: 'Desde cero G1 (C64T1): "el 15 pro más plata por un 16 pro" es canje',
    turnos: [{ c: 'Hola consulta por el 15 pro más plata por un 16 pro se puede ?', contiene: ['unas fotos'], noContiene: ['920.000', 'modelo,'] }],
  },
  // D3: Android u otra marca como parte de pago.
  {
    nombre: 'Desde cero G1 (D3): un Samsung como parte de pago: "solo tomamos iphone del 11 en adelante", sin canje en curso',
    turnos: [
      { c: 'me tomas un samsung a54 como parte de pago?', contiene: ['solo tomamos iphone del 11 en adelante'], noContiene: ['pasame', 'bateria'], escala: false },
      { c: 'y cuanto sale el 13?', contiene: ['$495.000'], noContiene: ['no te puedo pasar el numero'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G1 (D3, C58T1): Samsung A35 con Gemini leyendo el canje',
    turnos: [
      {
        c: 'Hola! Buenas tardes. Queria consultarte por un equipo, iPhone 14 o 14 promax. Saber si puedo entregar mi celular por parte de pago y como es la metodología. Yo tengo un Samsung A35 5G. Muchas gracias',
        lectura: { intencion: 'permuta', modelo: '14', permuta: { ofrece: true } },
        contiene: ['solo tomamos iphone del 11 en adelante'],
        noContiene: ['pasame', 'bateria'],
        escala: false,
      },
      // Sin Gemini, '14pro' junto se lee como el 14: la lectura es la de Gemini en C58T2.
      { c: 'Aaah buenísimo. Y en qué precio es 14pro?', lectura: { modelo: '14 pro', modelos: ['14 pro'] }, contiene: ['800.000'], noContiene: ['no te puedo pasar el numero'] },
    ],
  },
  {
    nombre: 'Desde cero G1 (D3): Motorola y Xiaomi también',
    turnos: [
      { c: 'toman un motorola g54 en parte de pago?', contiene: ['solo tomamos iphone del 11 en adelante'], escala: false },
      { reset: true },
      { c: 'tengo un xiaomi redmi note 12, me lo tomas?', contiene: ['solo tomamos iphone del 11 en adelante'], escala: false },
    ],
  },

  // Grupo 4 · repite la misma pregunta o la lista entera (D5).
  {
    // D5: si todo lo que iba a salir ya se dijo, no manda nada y escala callado.
    nombre: 'Desde cero G4 (D5, C1T3-C1T4): "te interesaba solo ese modelo?" sale una sola vez',
    turnos: [
      { c: 'tenes el 12 pro?', contiene: ['te interesaba solo ese modelo?'] },
      { c: 'dale avisame', lectura: { modelo: '12 pro', intencion: 'quiere_avanzar' }, noContiene: ['te interesaba solo ese modelo'], silencio: true, motivo: 'no sé cómo seguir' },
      { c: 'si decime', lectura: { intencion: 'consulta_general' }, noContiene: ['te interesaba solo ese modelo'], silencio: true },
    ],
  },
  {
    nombre: 'Desde cero G4 (C4T3-C4T5): "?", "aaa", "jajaja": a la segunda escala y nunca la misma pregunta tres veces',
    turnos: [
      { c: '?', contiene: ['contame que estabas buscando'] },
      { c: 'aaa', silencio: true, noContiene: ['contame que'] },
      { c: 'jajaja', noContiene: ['contame que'], silencio: true },
    ],
  },
  {
    // Gemini lee "otro" o "saludo": igual cuenta como el segundo que no se entiende.
    nombre: 'Desde cero G4 (C45T3): después de la pregunta genérica, "qué bueno!!" leído como saludo no la repite',
    turnos: [
      { c: 'hola', contieneAlguno: ['contame que', 'decime que modelo'] },
      { c: 'Qué bueno !!', lectura: { intencion: 'saludo', modelo: null, modelos: [] }, noContiene: ['contame que'], silencio: true, motivo: 'no se entienden' },
    ],
  },
  {
    nombre: 'Desde cero G4: después de la pregunta genérica, un "ok" no se contesta ni escala',
    turnos: [
      { c: 'hola', contieneAlguno: ['contame que', 'decime que modelo'] },
      { c: 'ok', mudo: true },
    ],
  },
  {
    nombre: 'Desde cero G4 (C63T2): "los del 15 para abajo" filtra la lista, sin "te la paso de nuevo"',
    turnos: [
      { c: 'pasame la lista', contiene: ['Ip 17 Pro Max'] },
      {
        c: 'los del 15 para abajo',
        contiene: ['Ip 15 128gb', 'Ip 13 128gb', 'Ip 11 64gb'],
        noContiene: ['de nuevo', 'Ip 15 Pro', 'Ip 16', 'Ip 17'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Desde cero G4: "hasta el 14 pro" filtra la lista y deja el 14 Pro',
    turnos: [{ c: 'pasame precios hasta el 14 pro', contiene: ['Ip 14 Pro', 'Ip 13 Pro'], noContiene: ['Ip 15', 'Ip 16', 'Ip 17'] }],
  },
  {
    nombre: 'Desde cero G4 (C46T1): "me pasas el catalogo de usados?" es la lista',
    turnos: [{ c: 'me pasas el catalogo de usados?', contiene: ['Ip 13 128gb'], noContiene: ['estado del equipo'], escala: false }],
  },
  {
    nombre: 'Desde cero G4 (C79T4): "y otros?" después de la ficha es la lista',
    turnos: [
      { c: 'tenes el 14 pro?', contiene: ['$800.000'] },
      { c: 'Bien\nY otros', contiene: ['Ip 13 128gb'], escala: false },
    ],
  },
  // Grupo 5 · cuotas y medios de pago mal leídos (D6, C48T6).
  {
    nombre: 'Desde cero G5 (C5T1): "la financiacion en 2 cuotas es con tarjeta?" es una pregunta por los requisitos',
    turnos: [
      {
        c: 'la financiacion en 2 cuotas es con tarjeta?',
        contieneAlguno: ['no necesitas tarjeta', 'no hace falta tarjeta', 'sin tarjeta'],
        contiene: ['dni'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Desde cero G5: "piden tarjeta?" y "hace falta tarjeta?" son los requisitos',
    turnos: [
      { c: 'piden tarjeta?', contiene: ['dni'], escala: false },
      { reset: true },
      { c: 'hace falta tarjeta?', contiene: ['dni'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G5 (D6, C48T1): "trabajas con visa o con confiable?" tiene su respuesta fija, sin escalar',
    turnos: [
      {
        c: 'Hola buen día,trabajas con visa,o con confiable?',
        contiene: ['con tarjeta de credito no trabajamos, lo financiamos nosotros con tu dni y un compromiso de pago'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Desde cero G5 (D6): crédito, Mastercard, tarjeta Naranja, Naranja X: la misma respuesta',
    turnos: [
      { c: 'trabajan con credito?', contiene: ['con tarjeta de credito no trabajamos'], escala: false },
      { reset: true },
      { c: 'y con mastercard?', contiene: ['con tarjeta de credito no trabajamos'], escala: false },
      { reset: true },
      { c: 'aceptan tarjeta naranja?', contiene: ['con tarjeta de credito no trabajamos'], escala: false },
      { reset: true },
      { c: 'puedo pagar con naranja x?', contiene: ['con tarjeta de credito no trabajamos'], escala: false },
      { reset: true },
      { c: 'se puede pagar con tarjeta de credito?', contiene: ['con tarjeta de credito no trabajamos'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G5 (D6): débito, Ualá y Mercado Crédito siguen escalando como otro medio de pago',
    turnos: [
      { c: 'puedo pagar con debito?', silencio: true, motivo: 'otro medio de pago' },
      { reset: true },
      { c: 'aceptan uala?', silencio: true, motivo: 'otro medio de pago' },
      { reset: true },
      { c: 'puedo pagar con mercado credito?', silencio: true, motivo: 'otro medio de pago' },
    ],
  },
  {
    nombre: 'Desde cero G5 (C57T2): "y como serian?" después de la explicación es la versión corta',
    turnos: [
      { c: 'vi que hacen cuotas', contiene: ['financia'] },
      { c: 'y como serian?', contiene: ['como te decia, te lo financiamos en 1 o 2 cuotas con una entrega inicial'], escala: false },
      { reset: true },
      { c: 'vi que hacen cuotas', contiene: ['financia'] },
      {
        c: 'Y como serían\nBien y vos\nMe dirías maso menos como son',
        lectura: { intencion: 'consulta_general' },
        contiene: ['como te decia'],
        noContiene: ['contame que estabas buscando'],
      },
    ],
  },
  {
    nombre: 'Desde cero G5 (C48T6): "la primer cuota es cuando retiro?" sale con el texto fijo, nunca "claro"',
    turnos: [
      { c: 'y la primer cuota es cuando lo retiro?', contiene: ['las cuotas arrancan el mes que viene'], noContiene: ['claro'] },
      { reset: true },
      { c: 'vi que hacen cuotas', contiene: ['financia'] },
      {
        c: 'Okey bien,y la primer cuota es cuando retiro cierto',
        lectura: { intencion: 'consulta_general' },
        contiene: ['las cuotas arrancan el mes que viene, no este mes'],
        noContiene: ['claro', 'buenass'],
        redactar: false,
      },
    ],
  },
  {
    nombre: 'Desde cero G5: "te entrego 1.000.000 y el resto en dos cuotas" cotiza aunque Gemini lea propone_pago',
    turnos: [
      { c: 'cuanto esta el 17?', contiene: ['$1.600.000'] },
      {
        c: 'si te entrego 1.000.000 y el resto en dos cuotas?',
        lectura: { intencion: 'propone_pago', entrega: 1000000 },
        contiene: ['📱', '$1.000.000'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Desde cero G5 (C44T6): "te entrego 850 y lo otro en dos cuotas" es su entrega, no un esquema propio',
    turnos: [
      { c: 'cuanto esta el 17?' },
      {
        c: 'Si te entrego 850 y lo otro lo hago en dos cuotas, de cuanto serían?',
        lectura: { intencion: 'propone_pago', entrega: 850000 },
        entregaLeida: 850000,
        contiene: ['$850.000'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Desde cero G5: un esquema con fechas sigue escalando callado',
    turnos: [
      { c: 'cuanto esta el 17?' },
      { c: 'te doy 500 ahora y el resto a fin de mes', lectura: { intencion: 'propone_pago' }, silencio: true, motivo: 'esquema de pago' },
    ],
  },
  {
    nombre: 'Desde cero G5 (C3T4): "si le hago la entrega mínima, cuánto se me va?" cotiza con la entrega del modelo',
    turnos: [
      { c: 'tenes el 14 pro?', contiene: ['$800.000'] },
      { c: 'si yo le hago la entrega minima cuanto se me va en cuantas cuotas?', contiene: ['📱', '$480.000'], escala: false },
    ],
  },
  {
    // Varios vistos y ninguno elegido: cada uno con su propia entrega mínima, como cotizarVistos.
    nombre: 'Desde cero G5 (C3T4): con varios modelos vistos, cada uno con su entrega mínima',
    turnos: [
      { c: 'tenes el 13, el 13 pro y el 14 pro?', contiene: ['495.000', '695.000', '800.000'] },
      {
        c: 'Si yo le hago la entrega mínima cuánto se me va en cuántas cuotas',
        lectura: { intencion: 'precio_alto', modelo: null, modelos: [] },
        contiene: ['$320.000', '$420.000', '$480.000'],
        noContiene: ['otras opciones'],
        escala: false,
      },
    ],
  },
  {
    nombre: 'Desde cero G5 (C40T2): "tomás USD? dónde lo puedo ver?" contesta los dólares y la dirección',
    turnos: [
      { c: 'Tomas USD?\nDonde lo puedo ver?', contiene: ['aceptamos dolares', 'Belgrano 3090'] },
      { reset: true },
      { c: 'tomas u$s?', contiene: ['aceptamos dolares'], escala: false },
    ],
  },
  // Grupo 6 · pregunta el precio del modelo que ya vio y no se lo dice (Ajustes 1: el precio se
  // dice cuando lo pregunta).
  {
    nombre: 'Desde cero G6 (C49T2): "en que valor?" con el 13 Pro ya mostrado: el precio y cómo paga',
    turnos: [
      { c: 'tenes el 13 pro?', contiene: ['$695.000'] },
      { c: 'en que valor?', contiene: ['esta $695.000 de contado'], contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G6 (C67T3): "que precio tiene" con el 16 ya mostrado',
    turnos: [
      { c: 'tenes el 16?', contiene: ['$1.050.000'] },
      { c: 'que precio tiene', contiene: ['esta $1.050.000 de contado'], noContiene: ['muy buena eleccion', 'tremendo modelito', 'anda barbaro'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G6: "dale, cuanto sale?" con el 14 Pro ya mostrado: el precio y cómo paga',
    turnos: [
      { c: 'tenes el 14 pro?', contiene: ['$800.000'] },
      { c: 'dale, cuanto sale?', contiene: ['esta $800.000 de contado'], contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'] },
    ],
  },
  {
    nombre: 'Desde cero G6 (C29T5): "más o menos en cuánto?" también pregunta el precio',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { c: 'Más o menos en cuanto porque ando comprando las cosas para llevar', contiene: ['esta $495.000 de contado'] },
    ],
  },
  {
    nombre: 'Desde cero G6: con dos unidades de precios distintos, "desde" el más barato',
    turnos: [
      { c: 'tenes el 14?', contiene: ['$430.000'] },
      { c: 'en que precio esta?', contiene: ['esta desde $430.000 de contado'] },
    ],
  },
  {
    nombre: 'Desde cero G6: ya se le preguntó cómo paga y pregunta el precio: el precio y la pregunta de contado o cuotas',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'dale ese', contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'] },
      { c: 'y cuanto esta?', contiene: ['esta $495.000 de contado'], escala: false },
    ],
  },
  // Grupo 2 · turnos: ya viene en camino, ya dijo el día, o solo dijo "dale".
  {
    nombre: 'Desde cero G2: "dale, ya salgo para alla" escala callado como llegó al local, sin preguntar el día',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'dale, ya salgo para alla', silencio: true, motivo: 'llegó al local', noContiene: ['que dia'] },
    ],
  },
  {
    nombre: 'Desde cero G2 (C23T4, C36T3, C36T5, C45T6): "yendo", "afuera", "esperando el uber", "ya salimos"',
    turnos: [
      { c: 'Yendo', lectura: { intencion: 'quiere_avanzar' }, silencio: true, motivo: 'llegó al local' },
      { reset: true },
      { c: 'Afuera', lectura: { intencion: 'pide_turno' }, silencio: true, motivo: 'llegó al local' },
      { reset: true },
      { c: 'Estoy esperando uber\nPuede ser que apenas llegue me esperes afuera?', lectura: { intencion: 'pide_turno' }, silencio: true, motivo: 'llegó al local' },
      { reset: true },
      { c: 'Dale okey gracias\nYa estamos por salir\nYa salimos para allá', lectura: { intencion: 'pide_turno' }, silencio: true, motivo: 'llegó al local' },
      { reset: true },
      { c: 'ya voy, estoy en camino', silencio: true, motivo: 'llegó al local' },
    ],
  },
  {
    nombre: 'Desde cero G2: "ya voy a juntar la plata" y "la plata está en camino" no son que viene en camino',
    turnos: [
      { c: 'ya voy a juntar la plata y te aviso', escala: false },
      { reset: true },
      { c: 'tenes el 13? la plata esta en camino', escala: false },
    ],
  },
  {
    // Con Tomás el 29/09: después de la entrega inicial, un "dale" es un acuse: no pide turno,
    // no se le contesta nada y no escala.
    nombre: 'Desde cero G2 (C11T6): después de la entrega inicial, "dale dale" no pide turno ni escala',
    turnos: [
      { c: 'quiero el 14 pro, tengo 300.000', contiene: ['entrega inicial'] },
      { c: 'dale dale', lectura: { intencion: 'quiere_avanzar' }, mudo: true },
    ],
  },
  {
    nombre: 'Desde cero G2 (C64T3, C69T4): la persona dijo "te cotizo" o "te paso" y el cliente dice "dale"',
    turnos: [
      { c: 'tenes el 16 pro?' },
      { humano: 'dale perfecto, ahi llego al local y te cotizo todo' },
      { c: 'Dale', lectura: { intencion: 'quiere_avanzar' }, mudo: true },
      { reset: true },
      { c: 'tenes el 17 pro?' },
      { humano: 'exacto podemos estirarnos hasta 3 dependiendo la entrega, te paso mira' },
      { c: 'Dale dale', lectura: { intencion: 'quiere_avanzar' }, mudo: true },
    ],
  },
  {
    nombre: 'Desde cero G2: después de la lista, "dale" no pide turno',
    turnos: [
      { c: 'pasame la lista', contiene: ['Ip 13 128gb'] },
      { c: 'dale', lectura: { intencion: 'quiere_avanzar' }, mudo: true },
    ],
  },
  {
    nombre: 'Desde cero G2: después de una cotización, "dale" sigue siendo avanzar (como hoy)',
    turnos: [
      { c: 'tenes el 13? tengo 400', contiene: ['📱'] },
      { c: 'dale', lectura: { intencion: 'quiere_avanzar' }, escala: true, contiene: ['que dia'] },
    ],
  },
  {
    nombre: 'Desde cero G2: "hoy tenés lugar a la tarde?" y después "de las 18 en adelante": escala sin preguntar nada',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'hoy tenes lugar a la tarde?', lectura: { intencion: 'pide_turno' }, escala: true },
      { c: 'de las 18 en adelante', silencio: true },
    ],
  },
  {
    // La tanda de tres mensajes son tres líneas del historial (como en index.js): antes solo
    // se miraban los últimos 3 mensajes del cliente y el "hoy" quedaba afuera.
    nombre: 'Desde cero G2 (C12T2): dijo "hoy" dos tandas antes y ahora la hora: no vuelve a preguntar el día',
    turnos: [
      { c: 'hola, hoy tenes algun turno a la tarde?', escala: true },
      { c: 'tenes el 15 pro?', contiene: ['15 Pro'] },
      { cliente: 'Sisi quería un 15 pro' },
      { cliente: 'Si puede ser mejor de las 18 mejor' },
      {
        c: 'Voy a pagar una parte y después en cuotas',
        lectura: { intencion: 'pide_turno', modelo: '15 pro' },
        silencio: true,
        noContiene: ['que dia'],
      },
    ],
  },
  {
    nombre: 'Desde cero G2 (C40T5): la persona propuso "hoy después de las 17" y el cliente dice "bueno"',
    turnos: [
      { c: 'tenes el 15?' },
      { humano: 'hoy te queda comodo despues de las 17?' },
      { c: 'Bueno', lectura: { intencion: 'pide_turno' }, silencio: true, noContiene: ['que dia'] },
    ],
  },
  // Grupo 7 · colores, fotos y otras preguntas sin dato que no escalaban (D11).
  {
    nombre: 'Desde cero G7 (C11T2): "lo tenes en color negro?" es una pregunta por colores',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'Lo Tíene en color negro???', escala: true, motivo: 'colores', noContiene: ['como lo ibas a hacer', 'como tenias pensado'] },
    ],
  },
  {
    nombre: 'Desde cero G7 (C24T2, C31T5): "en naranja lo queria" es el color, nunca otro medio de pago',
    turnos: [
      { c: 'tenes el 17 pro?' },
      { c: 'en naranja lo queria', escala: true, motivo: 'colores' },
      { reset: true },
      { c: 'tenes el 17 pro?' },
      { c: 'Color naranja nomas tenes?', escala: true, motivo: 'colores' },
    ],
  },
  {
    nombre: 'Desde cero G7 (C63T4): "buscaba algun blanco o rosa" es una pregunta por colores',
    turnos: [
      { c: 'tenes el 15?' },
      { c: 'buenisimooo\nay\nse me olvido preguntarte por los colores tmb es que buscaba algun blanco o rosa', escala: true, motivo: 'colores' },
    ],
  },
  {
    nombre: 'Desde cero G7 (C74T3): dos modelos y "algún color rosa": los precios y avisa por el color',
    turnos: [
      {
        c: '14 128 gb\n15 128 gb\nDe 90% o más\nAlgún color rosa sería buenisimo',
        contiene: ['430.000', '740.000'],
        escala: true,
        motivo: 'colores',
      },
    ],
  },
  {
    nombre: 'Desde cero G7 (C46T4): "tendrias ft del 14 pro" pide fotos: escala callado',
    turnos: [
      { c: 'T3ndrias ft del 14 pro', silencio: true, motivo: 'pide fotos' },
      { reset: true },
      { c: 'tendrias fotos del 13?', silencio: true, motivo: 'pide fotos' },
      { reset: true },
      { c: 'tendrias ftos del 14 pro?', silencio: true, motivo: 'pide fotos' },
    ],
  },
  {
    nombre: 'Desde cero G7: "te mando fotos del 13" en un canje no es un pedido de fotos',
    turnos: [
      { c: 'te dejo mi 13 en parte de pago', contiene: ['unas fotos'] },
      { c: 'ahora te mando fotos del 13', noContiene: ['pide fotos'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G7 (D11, C34T2): "son libres de iCloud?" tiene su respuesta fija, sin escalar',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'Sisi\nSom libre de iCloud ?', contiene: ['sii, todos libres de icloud'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero G7 (D11): "liberado" sigue escalando',
    turnos: [{ c: 'el 13 viene liberado?', silencio: true, motivo: 'liberado' }],
  },
  {
    nombre: 'Desde cero G7 (C66T3): "por qué el 15 es mejor que el 14?" es comparar: escala',
    turnos: [
      { c: 'por que el 15 es mejor que el 14?', silencio: true, motivo: 'comparar' },
      { reset: true },
      { c: 'que diferencia hay con el 15 pro?', silencio: true, motivo: 'comparar' },
    ],
  },
  {
    nombre: 'Desde cero G7 (C62T3): "se puede arreglar el Face ID?" escala, nunca "no me está quedando"',
    turnos: [{ c: 'Se puede arreglar el Face ID amigo!', silencio: true, noContiene: ['no me esta quedando'] }],
  },
  // Grupo 8 · modelo que no está en la planilla (D7: el más parecido; D8: del 11 al 18 Pro Max).
  {
    nombre: 'Desde cero G8 (D7, C65T3): falta el 15 Pro Max: ofrece el 15 Pro y escala sin callar',
    turnos: [
      {
        c: 'tenes el 15 pro max?',
        contiene: ['ese justo no me esta quedando', 'pero tengo iPhone 15 Pro 128GB 85% en $920.000', 'te interesaba solo ese modelo?'],
        noContiene: ['iPhone 11'],
        escala: true,
        motivo: 'no está cargado en la planilla',
      },
    ],
  },
  {
    nombre: 'Desde cero G8 (D7, C22T2): falta el 14 Pro Max: el 14 Pro, $800.000',
    turnos: [{ c: 'quiero el 14 pro max', contiene: ['pero tengo iPhone 14 Pro 128GB 100% en $800.000'], escala: true }],
  },
  {
    nombre: 'Desde cero G8 (D7, C1T2): falta el 12 Pro: el 12 de 64GB, $380.000',
    turnos: [{ c: 'El 12pro', lectura: { modelo: '12 pro', modelos: ['12 pro'] }, contiene: ['pero tengo iPhone 12 64GB 87% en $380.000'], escala: true }],
  },
  {
    nombre: 'Desde cero G8 (D7, C32T2): falta el 18 Pro Max (copia del 08/09): la misma variante del número más cercano, el 17 Pro Max',
    turnos: [{ c: 'Quería consultarte sobre el iPhone 18 pro Max', contiene: ['pero tengo iPhone 17 Pro Max 128GB sellado en $2.200.000'], escala: true }],
  },
  {
    nombre: 'Desde cero G8 (D7): el mini cuenta como el común (decisión de Tomás del 29/09)',
    turnos: [{ c: 'tenes el 13 mini?', contiene: ['pero tengo iPhone 13 128GB 100% en $495.000'], escala: true }],
  },
  {
    nombre: 'Desde cero G8 (D7): sin nada parecido no ofrece alternativa',
    planilla: {
      config: PLANILLA.config,
      lista: PLANILLA.lista.filter((f) => !/Pro Max|17/.test(f.modelo)),
      usados: [],
    },
    turnos: [
      {
        c: 'tenes el 18 pro max?',
        contiene: ['ese justo no me esta quedando', 'te interesaba solo ese modelo?'],
        noContiene: ['pero tengo'],
        escala: true,
      },
    ],
  },
  {
    nombre: 'Desde cero G8 (C42T1): "tenés algún 14 Pro Max en stock?" va por la rama del que falta, no la lista entera',
    turnos: [
      {
        c: 'holaa buenass\ntenes algun iphone 14 pro max en stock?',
        contiene: ['ese justo no me esta quedando', '$800.000'],
        noContiene: ['Ip 13 128gb'],
        escala: true,
      },
    ],
  },
  {
    // Decisión de Tomás del 29/09: nombra dos y falta uno: el precio del que está y, del que
    // falta, "no me está quedando" con el más parecido y su precio. Escala sin callar.
    nombre: 'Desde cero G8 (C69T2): "un 17 pro o 18 pro, precios de ambos": el del 17 Pro y el 18 Pro no está',
    turnos: [
      {
        c: 'Tenía pensado un 17 pro o 18 pro\nVer los precios de ambos',
        lectura: { intencion: 'consulta_precio', modelo: null, modelos: [] },
        contiene: ['$1.970.000', 'el 18 Pro justo no me esta quedando'],
        noContiene: ['Ip 13 128gb', 'Ip 11'],
        escala: true,
        motivo: 'no está cargado en la planilla',
      },
    ],
  },
  {
    nombre: 'Desde cero G8: "un 15 pro o 16 pro max": el 15 Pro y, del 16 Pro Max, el 16 Pro con su precio',
    turnos: [
      {
        c: 'tenes un 15 pro o un 16 pro max? pasame precio de ambos',
        contiene: ['$920.000', 'el 16 Pro Max justo no me esta quedando, pero tengo el 16 Pro en $1.200.000'],
        escala: true,
        motivo: '16 pro max',
      },
    ],
  },
  {
    nombre: 'Desde cero G8 (D8): la lista dice "del 11 al 18 Pro Max"',
    turnos: [{ c: 'pasame la lista', contiene: ['igualmente tenemos del 11 al 18 Pro Max'] }],
  },
  // Grupo 9 · un número que no es plata se lee como entrega (D9).
  {
    nombre: 'Desde cero G9 (D9): "tenia 73 de bateria" en un canje no es una entrega, aunque Gemini lea $73.000',
    turnos: [
      {
        c: 'tengo un 11 para entregar, 64gb, tenia 73 de bateria',
        lectura: { entrega: 73000 },
        entregaLeida: null,
        contiene: ['unas fotos'],
        noContiene: ['$73.000'],
      },
      { c: 'quiero el 14', entregaLeida: null, noContiene: ['$73.000', 'todavia no'] },
    ],
  },
  {
    nombre: 'Desde cero G9 (D9, C48T3): "hasta el domingo tenía 78" no es una entrega',
    turnos: [
      { c: 'tenes el 14?' },
      {
        c: '64gb, se debe haber bajado esta semana porque hasta el domingo tenía 78\nde todas formas esta súper cuidado, sin detalles',
        lectura: { entrega: 78000, intencion: 'declara_entrega' },
        entregaLeida: null,
        noContiene: ['$78.000'],
      },
    ],
  },
  {
    nombre: 'Desde cero G9 (D9): un número menor a 100 con "mil", "k" o "lucas" sí es plata',
    turnos: [
      { c: 'tengo 80 mil', entregaLeida: 80000 },
      { reset: true },
      { c: 'tengo 90k', entregaLeida: 90000 },
    ],
  },
  {
    nombre: 'Desde cero G9 (D9, C78T2): "está a 800 mil?" confirma el precio y no guarda entrega',
    turnos: [
      { c: 'tenes el 14 pro?', contiene: ['$800.000'] },
      { c: 'Está a 800 mil?', lectura: { entrega: 800000, intencion: 'consulta_precio' }, entregaLeida: null, contiene: ['esta $800.000 de contado'], noContiene: ['📱'] },
      { c: 'Ví lo de las cuotas más la entrega inicial, cómo es eso? Me interesa', contiene: ['$480.000'], noContiene: ['📱'] },
    ],
  },
  {
    nombre: 'Desde cero G9 (D9): un monto lejos del contado sigue siendo su entrega',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'con 500 mil me alcanza?', entregaLeida: 500000, contiene: ['$500.000'] },
    ],
  },
  {
    nombre: 'Desde cero G9 (D9, C43T3): un monto con "promo" no es su entrega: escala callado',
    turnos: [
      { c: 'vi una promo con 350.000 de entrega, sigue?', entregaLeida: null, silencio: true, motivo: 'promoción' },
      { reset: true },
      {
        c: 'Puede ser que haya visto una promoción con una entrega inicial de 400.000? O es vieja?',
        lectura: { entrega: 400000, intencion: 'consulta_general' },
        entregaLeida: null,
        silencio: true,
        motivo: 'promoción',
        noContiene: ['te la paso de nuevo'],
      },
    ],
  },
  {
    nombre: 'Desde cero G9 (D9, C52T6): "más la placa" es un canje, aunque Gemini lea un esquema de pago',
    turnos: [
      { c: 'tenes el 15 pro?' },
      {
        c: 'Lo podes hacer en 3 cuotas?  Más la placa y 200 lucas de entrega',
        lectura: { intencion: 'propone_pago', entrega: 200000, permuta: { ofrece: false } },
        contiene: ['pasame'],
        noContiene: ['todavia no llegamos'],
      },
    ],
  },
  // D12: la entrega partida también con una palabra de corrección.
  {
    nombre: 'Desde cero (D12): "perdón, 180 en efectivo y 120 por transferencia" son $300.000',
    turnos: [
      { c: 'tenes el 11?' },
      { c: 'perdón, 180 en efectivo y 120 por transferencia', entregaLeida: 300000, contiene: ['$300.000'] },
      { reset: true },
      { c: 'tenes el 11? tengo 400' },
      {
        c: 'perdon, en realidad 180 en efectivo y 120 por transferencia',
        lectura: { entrega: 180000, intencion: 'declara_entrega' },
        entregaLeida: 300000,
        contiene: ['$300.000'],
      },
    ],
  },
  {
    nombre: 'Desde cero (D12): con una corrección de un solo monto sigue ganando la corrección',
    turnos: [{ c: 'tenes el 13? tengo 400' }, { c: 'perdon, 500', entregaLeida: 500000 }],
  },
  {
    nombre: 'Desde cero G4: la lista la vuelve a pedir y va de nuevo (sigue como hoy)',
    turnos: [
      { c: 'pasame la lista', contiene: ['Ip 13 128gb'] },
      { c: 'me la pasas de nuevo?', contiene: ['te la paso de nuevo', 'Ip 13 128gb'], escala: false },
    ],
  },
  // Arreglos de la re-medición (desde cero, 29/09/2026): lo que la corrida nueva mostró.
  {
    nombre: 'Desde cero re-medición (C15T2): "no sé si aceptan el 11, si no tendría que venderlo" es un canje',
    turnos: [
      {
        c: 'sabes q tengo un 11 yo y podria financiar lo q falte para un 13 pro\nno se si aceptan el 11\nsino tendria q ver dnd venderlo',
        lectura: { intencion: 'permuta', modelo: '13 pro', permuta: { ofrece: true, modelo: '11' } },
        contiene: ['a partir del 11'],
        noContiene: ['Ip 11 64gb'],
      },
      { reset: true },
      {
        c: 'tengo un 12, voy a ver si lo vendo',
        lectura: { intencion: 'permuta', permuta: { ofrece: true, modelo: '12' } },
        noContiene: ['a partir del 11'],
      },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C55T6): con un canje en curso, "lo quería cambiar por el 16, si entregamos los dos" sigue el canje',
    turnos: [
      { c: 'hacen canje?', contiene: ['a partir del 11'] },
      { c: 'cuanto sale el 16?', contiene: ['$1.050.000'] },
      {
        c: 'mi amiga tiene el 15 normal y lo quería cambiar por un 14 pro max y yo lo quería cambiar por el 16, cuanto seria si entregamos los dos',
        lectura: { intencion: 'permuta', modelo: '16', permuta: { ofrece: true } },
        noContiene: ['justo no me esta quedando', '$1.050.000'],
      },
    ],
  },
  {
    nombre: 'Desde cero re-medición (D9, C51T3): "eso de 10 o 11" no es una entrega aunque Gemini lea $1.100.000',
    turnos: [
      { c: 'tenes el 14 pro?' },
      {
        c: 'Sisi\nPero para este mes que viene tengo\nEso de 10 o 11',
        lectura: { intencion: 'propone_pago', modelo: '14 pro', modelos: ['14 pro'], entrega: 1100000 },
        entregaLeida: null,
        noContiene: ['📱', 'alcanza'],
      },
      { reset: true },
      { c: 'tenes el 14 pro?' },
      { c: 'tengo 1 palo', lectura: { intencion: 'declara_entrega', modelo: '14 pro', entrega: 1000000 }, entregaLeida: 1000000 },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C4T4): después de la pregunta de "no se entiende", otro que no se entiende no la repite',
    turnos: [
      { c: 'Aaaa', lectura: { intencion: 'sin_contenido' }, contiene: ['contame que estabas buscando'] },
      { c: 'Listooo 😅\nNo ahora lo kargo', lectura: { intencion: 'otro' }, silencio: true, motivo: 'no se entienden' },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C28T5): el "mañana" que dijo hoy vale aunque después escriba la cuenta',
    turnos: [
      { c: 'tenes el 11?' },
      { c: 'q precio bro\nasi mañana seguramente ya lo busco' },
      // Después, tres mensajes suyos y varios de la cuenta: el "mañana" queda fuera de sus
      // últimos 3 y de los últimos 8 de hoy.
      { humano: 'ip 11 64gb 84% 260.000' },
      { c: 'ok', mudo: true },
      { c: 'dale', mudo: true },
      { c: 'joya', mudo: true },
      { humano: 'dale bro' },
      { humano: 'estamos en belgrano 3090' },
      { humano: 'cualquier cosa avisame' },
      { humano: 'quedo atento' },
      { humano: 'emi' },
      { c: 'dale bro a esa hora entonces\ntipo 16\nseguro', lectura: { intencion: 'pide_turno' }, silencio: true, noContiene: ['que dia'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C16T5): "precio alto" sin un modelo en juego no ofrece el más caro',
    turnos: [
      { c: 'hola' },
      { c: 'y no amigo, muy caro todo', lectura: { intencion: 'precio_alto' }, contiene: ['con cuanto contas'], noContiene: ['2.200.000', 'otras opciones'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C63T6): con la lista ya pasada, las preguntas sin modelo no son "sin venta"',
    turnos: [
      { c: 'pasame la lista', contiene: ['Ip 13 128gb'] },
      { c: 'y los metodos de pago?' },
      { c: 'tienen garantia?' },
      { c: 'donde estan ubicados?' },
      { c: 'trabajan con mercado pago?' },
      { c: 'me encanta, se puede dejar apartado hasta mañana?', lectura: { intencion: 'reserva' }, contieneAlguno: ['seña', 'horario', 'dia'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C67T6): "dale" después de la cotización sí pregunta el día',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'tengo 400 de entrega', contiene: ['📱'] },
      // Como en C67: después de los números, la persona dice "ahi te cotizo" (otro modelo).
      { humano: 'perfecto' },
      { humano: 'ahi te cotizo' },
      { c: 'Dale', lectura: { intencion: 'quiere_avanzar' }, escala: true, contieneAlguno: ['que dia', 'horario'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C78T4): "¿y la entrega inicial de cuánto es?" repite el número',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'Ví lo de las cuotas más la entrega inicial, cómo es eso? Me interesa', contiene: ['$480.000'] },
      { c: 'Y la entrega inicial de cuánto es?', contiene: ['$480.000'], noContiene: ['como te decia'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C71T3): el precio de dos que ya vio, cada uno con su nombre',
    turnos: [
      { c: 'cuanto esta el iphone 12 o 13?', contiene: ['380.000', '495.000'] },
      { c: 'A bien me interesa\nUn 12 o 13 xfa q precio', contiene: ['el 12 esta $380.000', 'el 13 esta $495.000'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C11T3): "pagar en trasferencia" es de contado',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'Tenía pensado pagar en trasferencia\nQueria pagarlo enseguida', lectura: { intencion: 'propone_pago', modelo: '14 pro' }, contiene: ['de contado el iPhone 14 Pro te queda en $800.000'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (D4, C24T6): "tenía pensado gastarme un millón, ¿no tenés alguno usado?" escala por el estado',
    turnos: [
      { c: 'Yo tenía pensado gastarme como mucho un millón,no tenes alguno usado?acorde a ese precio', silencio: true, motivo: 'estado del equipo' },
      { reset: true },
      { c: 'hasta el domingo tenia 78 de bateria el mio', noContiene: [] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C11T6): "dale dale" después de la entrega inicial no contesta aunque Gemini arrastre el modelo',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'cuento con 200 mil', contiene: ['$480.000'] },
      { humano: 'joya hermano' },
      { humano: 'quedamos en contacto' },
      { c: 'Dale dale', lectura: { intencion: 'quiere_avanzar', modelo: '14 pro' }, mudo: true },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C47T3): "ok" después de la lista que pasó la persona, en minúscula, no contesta',
    turnos: [
      { c: 'tenes el 14 pro max?', contiene: ['no me esta quedando'] },
      { humano: 'ip 14 pro 100% 800.000\nIp 15 pro +85% 920.000' },
      { c: 'Ok', lectura: { intencion: 'quiere_avanzar', modelo: '14 pro max' }, mudo: true },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C15T4): con un canje en curso, "no tiene detalles digamos" es del canje',
    turnos: [
      { c: 'hacen canje? tengo un 11', contiene: ['a partir del 11'] },
      { c: 'no tiene detalles digamos', lectura: { intencion: 'consulta_general', modelo: '13 pro' }, noContiene: ['$695.000'] },
    ],
  },
  {
    nombre: 'Desde cero re-medición (C44T5): "la mitad ahora" no es una pregunta por el horario',
    turnos: [
      { c: 'tenes el 17?' },
      {
        c: 'Y si lo hago en dos pagos sería la mitad ahora y el próximo mes la otra mitad no?',
        lectura: { intencion: 'consulta_general', modelo: '17' },
        noContiene: ['turnos'],
      },
    ],
  },

  // ---------- Desde cero, segunda vuelta (30/09/2026) ----------
  // Regresiones contra 543efba con frases que no están en los 80 chats. Montos de la copia
  // congelada: 13 $495.000 (entrega $320.000), 14 $430.000, 14 Pro $800.000 (entrega $480.000),
  // 15 $740.000, 15 Pro $920.000, 16 $1.050.000, 17 $1.600.000.

  // 1. "entregar" es canje solo si el que entrega es el cliente; "más plata por un X", solo con
  //    su equipo en el mensaje o un canje en curso.
  {
    nombre: 'Desde cero 2 (1): "¿para cuándo me podés entregar el 16?" es un turno, no un canje',
    turnos: [
      { c: 'hola, cuanto sale el 16?', contiene: ['$1.050.000'] },
      {
        c: 'y para cuando me podes entregar el 16?',
        lectura: { intencion: 'pide_turno' },
        escala: true,
        motivo: 'quiere avanzar o pide turno',
        contieneAlguno: ['que dia'],
        noContiene: ['a partir del 11', 'pasame'],
      },
    ],
  },
  {
    nombre: 'Desde cero 2 (1): "¿me podrían entregar el 16 hoy?" va por el turno, con Gemini o sin él',
    turnos: [
      { c: 'me podrian entregar el 16 hoy?', escala: true, motivo: 'quiere avanzar o pide turno', contieneAlguno: ['horario', 'a que hora'], noContiene: ['a partir del 11', 'pasame'] },
      { reset: true },
      // Gemini ve un canje: el texto no lo ofrece (nos lo pide a nosotros).
      {
        c: 'me podrian entregar el 16 hoy?',
        lectura: { intencion: 'permuta', permuta: { ofrece: true, modelo: '16' } },
        escala: true,
        motivo: 'quiere avanzar o pide turno',
        noContiene: ['a partir del 11', 'pasame'],
      },
    ],
  },
  {
    nombre: 'Desde cero 2 (1): "¿y cuánta más plata por un 15?" sin su equipo no es canje: el 14 y el 15 con sus precios',
    turnos: [
      { c: 'hola, cuanto sale el 14?', contiene: ['$430.000'] },
      { c: 'y cuanta mas plata por un 15?', contiene: ['430.000', '740.000'], noContiene: ['a partir del 11', 'pasame'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero 2 (1): Gemini lee stock, el texto solo dice "entregar" y no nombra su equipo: gana Gemini',
    turnos: [
      { c: 'se puede entregar un 13?', lectura: { intencion: 'consulta_stock', permuta: { ofrece: false } }, contiene: ['$495.000'], noContiene: ['a partir del 11', 'pasame'] },
    ],
  },
  {
    nombre: 'Desde cero 2 (1): el cliente que entrega su equipo sigue siendo canje',
    turnos: [
      { c: 'te puedo entregar mi 12 para el 15?', contiene: ['a partir del 11', 'unas fotos'], noContiene: ['modelo,'] },
      { reset: true },
      { c: 'tengo un 12, cuanta mas plata por un 15?', contiene: ['a partir del 11', 'unas fotos'], noContiene: ['modelo,'] },
      { reset: true },
      { c: 'te entrego mi 12, cuanto me sale el 13?', contiene: ['a partir del 11', 'unas fotos'], noContiene: ['modelo,'] },
      { reset: true },
      // Con un canje en curso, "más plata" es del canje.
      { c: 'hacen canje?', contiene: ['pasame modelo'] },
      { c: 'es un 12 de 128 con 85%, cuanta mas plata por un 15?', silencio: true, motivo: 'mandó los datos del equipo' },
    ],
  },

  // 2. La confirmación de precio (D9, ±5%) va solo si pregunta el precio: no con su plata
  //    (doy, pongo, abono, pago, "cuánto me queda", cuotas). "Me lo dejás en X" es un regateo.
  {
    nombre: 'Desde cero 2 (2): "¿cuánto me queda si abono 790?" cotiza con $790.000',
    turnos: [
      { c: 'hola, cuanto sale el 14 pro?', contiene: ['$800.000'] },
      { c: 'cuanto me queda si abono 790?', lectura: { entrega: 790000 }, entregaLeida: 790000, contiene: ['$790.000', '📱'], noContiene: ['sii, esta'] },
    ],
  },
  {
    nombre: 'Desde cero 2 (2): "si te doy 780, ¿cuánto me quedan las cuotas?" cotiza con $780.000',
    turnos: [
      { c: 'hola, cuanto sale el 14 pro?' },
      { c: 'si te doy 780 cuanto me quedan las cuotas?', lectura: { entrega: 780000 }, entregaLeida: 780000, contiene: ['$780.000', '📱'], noContiene: ['sii, esta', 'la entrega arranca'] },
    ],
  },
  {
    nombre: 'Desde cero 2 (2): "con 820, ¿cuánto me quedan las cuotas?" lo paga de contado',
    turnos: [
      { c: 'hola, cuanto sale el 14 pro?' },
      { c: 'con 820 cuanto me quedan las cuotas?', lectura: { entrega: 820000 }, entregaLeida: 820000, contiene: ['de contado', '$800.000', '📱'], noContiene: ['sii, esta', 'la entrega arranca'] },
    ],
  },
  {
    nombre: 'Desde cero 2 (2): "¿me lo dejás en 780?" es un pedido de descuento, no la confirmación ni una entrega',
    turnos: [
      { c: 'hola, cuanto sale el 14 pro?' },
      {
        c: 'me lo dejas en 780?',
        lectura: { entrega: 780000 },
        entregaLeida: null,
        contieneAlguno: ['el precio es ese', 'es el precio que manejamos'],
        noContiene: ['sii, esta', '📱', '$780.000'],
        escala: false,
      },
      // Lejos del precio no hay confirmación que lo tape: el monto del regateo tampoco es su entrega.
      { reset: true },
      { c: 'hola, cuanto sale el 14 pro?' },
      { c: 'me lo dejas en 700?', lectura: { entrega: 700000 }, entregaLeida: null, noContiene: ['📱', '$700.000'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero 2 (2): con una entrega guardada, "¿y de contado está a 800 mil?" confirma el precio sin cotizar la vieja',
    turnos: [
      { c: 'hola, cuanto sale el 14 pro?' },
      { c: 'tengo 500', contiene: ['📱'] },
      { c: 'y de contado esta a 800 mil?', entregaLeida: null, contiene: ['sii, esta $800.000 de contado'], noContiene: ['$500.000', '📱'] },
    ],
  },
  {
    nombre: 'Desde cero 2 (2): "¿y está a 800 mil?" sigue confirmando el precio con cómo paga (D9)',
    turnos: [
      { c: 'hola, cuanto sale el 14 pro?' },
      { c: 'y esta a 800 mil?', entregaLeida: null, contiene: ['sii, esta $800.000 de contado', 'contado'], contieneAlguno: ['como tenias pensado pagarlo', 'como lo ibas a hacer'], noContiene: ['📱'] },
    ],
  },

  // 3. D9: el número del modelo no es un "número chico", y un monto en letras tampoco.
  {
    nombre: 'Desde cero 2 (3): "quiero el 14 pro, tengo quinientos" cotiza con $500.000',
    turnos: [
      {
        c: 'hola quiero el 14 pro, tengo quinientos',
        lectura: { entrega: 500000, modelo: '14 Pro' },
        entregaLeida: 500000,
        contiene: ['$500.000', '📱'],
      },
    ],
  },
  {
    nombre: 'Desde cero 2 (3): "para el 13 cuento con trescientos cincuenta" cotiza con $350.000',
    turnos: [
      { c: 'para el 13 cuento con trescientos cincuenta', lectura: { entrega: 350000 }, entregaLeida: 350000, contiene: ['$350.000', '📱'] },
    ],
  },
  {
    nombre: 'Desde cero 2 (3): con el monto en letras, otro número chico en el mensaje no lo tapa',
    turnos: [
      { c: 'tenes el 14 pro?' },
      { c: 'tengo quinientos, en 2 semanas paso', lectura: { entrega: 500000 }, entregaLeida: 500000, contiene: ['$500.000'] },
    ],
  },

  // 4. Un número del 11 al 18 que es una fecha, una edad o una hora no es un modelo.
  {
    nombre: 'Desde cero 2 (4): "tengo 18 años, ¿lo puedo sacar en cuotas?" es la financiación, no el 18',
    turnos: [
      { c: 'tengo 18 años, lo puedo sacar en cuotas?', modeloLeido: null, contiene: ['entrega inicial'], noContiene: ['no me esta quedando', '1.600.000'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero 2 (4): "me interesa el 13 o el 14, cobro el 18 y paso" son el 13 y el 14',
    turnos: [
      { c: 'me interesa el 13 o el 14, cobro el 18 y paso', contiene: ['495.000', '430.000'], noContiene: ['el 18', 'no me esta quedando', '1.600.000'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero 2 (4): siguen siendo modelos "tenés el 13?", "el 15?", "iphone 18", "el 18 pro max" y "tenés el 18?"',
    turnos: [
      { c: 'tenes el 13?', modeloLeido: '13' },
      { reset: true },
      { c: 'el 15?', modeloLeido: '15' },
      { reset: true },
      { c: 'iphone 18', modeloLeido: '18' },
      { reset: true },
      { c: 'el 18 pro max', modeloLeido: '18 pro max' },
      { reset: true },
      { c: 'tenes el 18?', modeloLeido: '18' },
    ],
  },

  // 5. D4 de más.
  // a) Decisión de Tomás del 30/09: si le da lo mismo sellado o usado, no escala.
  {
    nombre: 'Desde cero 2 (5a): "¿algún 17? normal, sellado o usado" es la ficha del 17',
    turnos: [{ c: 'hola, tenes algun 17? normal, sellado o usado', contiene: ['$1.600.000'], escala: false }],
  },
  {
    nombre: 'Desde cero 2 (5a): "¿tendrás algún iPhone usado barato?" es la lista',
    turnos: [{ c: 'tendras algun iphone usado barato?', contiene: ['Ip 13 128gb'], escala: false }],
  },
  {
    nombre: 'Desde cero 2 (5a): "ya sea sellado o usados, ¿qué tenés?" es la lista',
    turnos: [{ c: 'ya sea sellado o usados, que tenes?', contiene: ['Ip 13 128gb'], escala: false }],
  },
  {
    nombre: 'Desde cero 2 (5a): siguen con D4 las preguntas por la condición',
    turnos: [
      { c: 'tenes usados?', silencio: true, motivo: 'estado del equipo' },
      { reset: true },
      { c: 'hay nuevos?', silencio: true, motivo: 'estado del equipo' },
      { reset: true },
      { c: 'sellados tenes?', silencio: true, motivo: 'estado del equipo' },
      { reset: true },
      { c: 'precio del 16 sellado?', silencio: true, motivo: 'estado del equipo' },
      { reset: true },
      { c: 'de cuantos gb es?', silencio: true, motivo: 'estado del equipo' },
      { reset: true },
      { c: 'cuanta bateria tiene?', silencio: true, motivo: 'estado del equipo' },
      { reset: true },
      { c: 'te quedan 16 sellados?', silencio: true, motivo: 'estado del equipo' },
    ],
  },
  // b) No son el estado del equipo.
  {
    nombre: 'Desde cero 2 (5b): el estado de WhatsApp no es el estado del equipo',
    turnos: [
      { c: 'vi en tu estado el 15 pro, cuanto esta?', contiene: ['$920.000'], escala: false },
      { reset: true },
      { c: 'vi tu estado', escala: false },
      { reset: true },
      { c: 'lo subiste al estado?', escala: false },
    ],
  },
  {
    nombre: 'Desde cero 2 (5b): los detalles de la financiación o del pago son la financiación',
    turnos: [
      { c: 'me pasas los detalles de la financiacion?', contiene: ['entrega inicial'], escala: false },
      { reset: true },
      { c: 'detalles de pago?', contiene: ['entrega inicial'], escala: false },
    ],
  },
  {
    nombre: 'Desde cero 2 (5b): "¿trabajan otras marcas o solo iPhone?" escala callado con su propio motivo',
    turnos: [{ c: 'trabajan otras marcas o solo iphone?', silencio: true, motivo: 'pregunta si trabajan otras marcas' }],
  },
  {
    nombre: 'Desde cero 2 (5b): "algo más nuevo", "son nuevos los precios" y "la capacidad de pago" no son D4',
    turnos: [
      { c: 'y algo mas nuevo tenes?', escala: false },
      { reset: true },
      { c: 'son nuevos los precios?', contiene: ['Ip 13 128gb'], escala: false },
      { reset: true },
      { c: 'la capacidad de pago?', escala: false },
    ],
  },
  // c) Con un canje en curso, los datos de SU equipo con una pregunta van al canje.
  {
    nombre: 'Desde cero 2 (5c): canje en curso, "es de 128 con 85% de batería, ¿cuánto me das?" son los datos del equipo',
    turnos: [
      { c: 'te dejo mi 12 en parte de pago para el 13', contiene: ['unas fotos'] },
      { c: 'es de 128 con 85% de bateria, cuanto me das?', silencio: true, motivo: 'mandó los datos del equipo' },
    ],
  },

  // 6. Canje: un modelo suelto es dato del canje solo si el canje todavía no tiene modelo.
  {
    nombre: 'Desde cero 2 (6): canje del 12 en curso, "¿y el 15?" no pisa el modelo del canje',
    turnos: [
      { c: 'te dejo mi 12 en parte de pago para el 13', contiene: ['unas fotos'] },
      { c: 'y el 15?', contiene: ['740.000'], noContiene: ['pasame'] },
    ],
  },

  // 7. D3 con un canje en curso: el Android cierra el canje.
  {
    nombre: 'Desde cero 2 (7): canje en curso y "es un samsung s21": solo iPhone del 11 en adelante, y el canje se cierra',
    turnos: [
      { c: 'hacen canje?', contiene: ['pasame modelo'] },
      { c: 'es un samsung s21', contiene: ['solo tomamos iphone del 11 en adelante'], noContiene: ['pasame'], escala: false },
      { c: 'y cuanto me tomarias?', noContiene: ['no te puedo pasar el numero exacto'] },
    ],
  },

  // 8. "En negro" pegado al trabajo o al cobro no es un color.
  {
    nombre: 'Desde cero 2 (8): "trabajo en negro, ¿me lo pueden financiar igual?" es la financiación del 13',
    turnos: [
      { c: 'hola, cuanto sale el 13?' },
      { c: 'trabajo en negro, me lo pueden financiar igual?', contiene: ['entrega inicial', '$320.000'], escala: false },
    ],
  },

  // 9. "En cuánto tiempo" no pregunta el precio.
  {
    nombre: 'Desde cero 2 (9): "dale, ¿en cuánto tiempo me lo podés tener?" no dice el precio',
    turnos: [
      { c: 'hola, cuanto sale el 13?' },
      { c: 'dale, en cuanto tiempo me lo podes tener?', noContiene: ['esta $495.000 de contado'] },
    ],
  },

  // 10. Llegó al local: solo una llegada o una salida de ahora.
  {
    nombre: 'Desde cero 2 (10): "estoy saliendo", "ya estoy" y "en 5 minutos estoy" avisan que llega',
    turnos: [
      { c: 'estoy saliendo', silencio: true, motivo: 'llegó al local' },
      { reset: true },
      { c: 'ya estoy', silencio: true, motivo: 'llegó al local' },
      { reset: true },
      { c: 'en 5 minutos estoy', silencio: true, motivo: 'llegó al local' },
    ],
  },
  {
    nombre: 'Desde cero 2 (10): un día a futuro, irse a otro lado o juntar la plata no es llegar',
    turnos: [
      { c: 'tenes el 13?' },
      { c: 'el sabado ya voy', lectura: { intencion: 'pide_turno' }, escala: true, motivo: 'quiere avanzar o pide turno', contieneAlguno: ['horario', 'a que hora'] },
      { reset: true },
      { c: 'tenes el 13?' },
      { c: 'ya sali del laburo, mañana paso', lectura: { intencion: 'pide_turno' }, escala: true, motivo: 'quiere avanzar o pide turno' },
      { reset: true },
      { c: 'tenes el 13?' },
      { c: 'me estoy yendo a trabajar, despues te escribo', escala: false },
      { reset: true },
      { c: 'tenes el 13?' },
      { c: 'ya voy juntando la plata', escala: false },
      { reset: true },
      { c: 'tenes el 13?' },
      { c: 'la plata ya esta en camino', escala: false },
    ],
  },

  // 11. "Otros días", "otros horarios" u "otros medios de pago" no piden la lista.
  {
    nombre: 'Desde cero 2 (11): "¿y otros días atienden?" es la respuesta de los turnos, no la lista',
    turnos: [
      { c: 'y otros dias atienden?', contiene: ['nos manejamos con turnos'], noContiene: ['Ip 13'] },
      { reset: true },
      { c: 'y otros horarios?', contiene: ['nos manejamos con turnos'], noContiene: ['Ip 13'] },
      { reset: true },
      { c: 'y otros medios de pago?', contiene: ['mercado pago'], noContiene: ['Ip 13'] },
    ],
  },

  // 13. iCloud al revés (decisión de Tomás del 30/09): "todos libres de icloud", sin el "sii".
  {
    nombre: 'Desde cero 2 (13): iCloud preguntado al revés: "todos libres de icloud", sin el "sii"',
    turnos: [
      { c: 'estan bloqueados por icloud?', contiene: ['todos libres de icloud'], noContiene: ['sii'], escala: false },
      { reset: true },
      { c: 'tiene icloud?', contiene: ['todos libres de icloud'], noContiene: ['sii'], escala: false },
      { reset: true },
      { c: 'vienen con icloud?', contiene: ['todos libres de icloud'], noContiene: ['sii'], escala: false },
      { reset: true },
      { c: 'son libres de icloud?', contiene: ['sii, todos libres de icloud'], escala: false },
    ],
  },
  {
    // "¿Están reportados?" (el IMEI con denuncia): decisión de Tomás del 30/09/2026, "tiene que
    // decir que no". Respuesta fija, sin escalar. No es iCloud.
    nombre: 'Desde cero 2 (13b): "¿están reportados?": "no, ninguno esta reportado", sin escalar',
    turnos: [
      { c: 'estan reportados?', contiene: ['no, ninguno esta reportado'], noContiene: ['icloud'], escala: false },
      { reset: true },
      { c: 'tenes el 13? no esta reportado no?', contiene: ['ninguno esta reportado'], escala: false },
      { reset: true },
      { c: 'tienen reporte o denuncia?', contiene: ['ninguno esta reportado'], escala: false },
      { reset: true },
      { c: 'el 13 esta denunciado?', contiene: ['ninguno esta reportado'], escala: false },
    ],
  },

  // 14. D5: el aviso lleva el motivo original y el de "ya se lo dije".
  {
    nombre: 'Desde cero 2 (14): todo repetido y escala callado: el aviso lleva también el motivo original',
    turnos: [
      { c: 'tenes el 18 pro?', contiene: ['no me esta quedando'], motivo: 'pidió "18 pro" y no está cargado' },
      { c: 'tenes el 18 pro?', silencio: true, motivo: 'pidió "18 pro" y no está cargado en la planilla · no sé cómo seguir' },
    ],
  },

  // ---------- Arreglos en vivo (30/09/2026) ----------
  // 2. "¿Para cuándo me lo podés entregar?" con Gemini: lo leía como consulta_general y salía la
  //    financiación ("te cuento como es, el celular te lo financiamos…"). Pedir que se lo
  //    entreguemos es coordinar el turno, como sin Gemini: "que dia te podes acercar?" y escala
  //    callado con "quiere avanzar o pide turno". Se decide sobre el mensaje crudo
  //    (`local.nosPideEntregar`), lea lo que lea Gemini. Las lecturas son las de la prueba en vivo.
  {
    nombre: 'Arreglos en vivo (2): "¿para cuándo me podés entregar el 16?" leído como consulta general es un turno, no la financiación',
    turnos: [
      {
        c: 'para cuando me podes entregar el 16?',
        lectura: { intencion: 'consulta_general', modelo: 'iPhone 16', modelos: ['iPhone 16'] },
        escala: true,
        motivo: 'quiere avanzar o pide turno',
        contieneAlguno: ['que dia'],
        noContiene: ['financia', 'entrega inicial', 'cuotas', 'a partir del 11'],
      },
    ],
  },
  {
    nombre: 'Arreglos en vivo (2): "¿para cuándo me podés entregar?" sin modelo, leído como consulta general, también es un turno',
    turnos: [
      {
        c: 'para cuando me podes entregar?',
        lectura: { intencion: 'consulta_general' },
        escala: true,
        motivo: 'quiere avanzar o pide turno',
        contieneAlguno: ['que dia'],
        noContiene: ['financia', 'entrega inicial', 'cuotas'],
      },
    ],
  },
  {
    nombre: 'Arreglos en vivo (2): "¿tenés el 16?" y después "¿para cuándo me lo podés entregar?" leído como consulta general: el turno',
    turnos: [
      { c: 'tenes el 16?', contiene: ['$1.050.000'] },
      {
        c: 'para cuando me lo podes entregar?',
        lectura: { intencion: 'consulta_general' },
        escala: true,
        motivo: 'quiere avanzar o pide turno',
        contieneAlguno: ['que dia'],
        noContiene: ['financia', 'entrega inicial', 'cuotas', 'te cuento como es'],
      },
    ],
  },
  {
    nombre: 'Arreglos en vivo (2): "¿tenés el 15?" y después "¿y cuándo me lo entregan?" leído como consulta general: el turno',
    turnos: [
      { c: 'tenes el 15?', contiene: ['$740.000'] },
      {
        c: 'y cuando me lo entregan?',
        lectura: { intencion: 'consulta_general' },
        escala: true,
        motivo: 'quiere avanzar o pide turno',
        contieneAlguno: ['que dia'],
        noContiene: ['financia', 'entrega inicial', 'cuotas', 'te cuento como es'],
      },
    ],
  },
  {
    nombre: 'Arreglos en vivo (2): "¿me lo podrían entregar hoy?" leído como consulta general: el turno, con el horario',
    turnos: [
      { c: 'tenes el 16?', contiene: ['$1.050.000'] },
      {
        c: 'me lo podrian entregar hoy?',
        lectura: { intencion: 'consulta_general' },
        escala: true,
        motivo: 'quiere avanzar o pide turno',
        contieneAlguno: ['horario', 'a que hora'],
        noContiene: ['financia', 'entrega inicial', 'cuotas'],
      },
    ],
  },
  // Siguen como hoy: "la entrega" como sustantivo es la financiación o la entrega inicial;
  // "hacen entregas a domicilio" escala por envíos; "te entrego mi 12" es canje (caso
  // "Desde cero 2 (1)").
  {
    nombre: 'Arreglos en vivo (2, control): "¿cómo es la entrega?" leído como consulta general sigue con la financiación',
    turnos: [
      { c: 'tenes el 16?', contiene: ['$1.050.000'] },
      {
        c: 'como es la entrega?',
        lectura: { intencion: 'consulta_general' },
        escala: false,
        contieneAlguno: ['financia', 'entrega inicial'],
        noContiene: ['que dia', 'horario'],
      },
    ],
  },
  {
    nombre: 'Arreglos en vivo (2, control): "¿de cuánto es la entrega?" sigue con la financiación o la entrega inicial, no el turno',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      {
        // Con consulta_general va la explicación (como hoy); sin Gemini, la línea con el monto.
        c: 'de cuanto es la entrega?',
        lectura: { intencion: 'consulta_general' },
        escala: false,
        contieneAlguno: ['financia', 'entrega inicial', '$320.000'],
        noContiene: ['que dia', 'horario'],
      },
      { reset: true },
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { c: 'de cuanto es la entrega?', escala: false, contiene: ['$320.000'], noContiene: ['que dia', 'horario'] },
    ],
  },
  {
    // Las dos guardas de la rama: con un monto en el mensaje sigue la cotización (Gemini lo lee
    // como declara_entrega, como hasta ahora), y si además ofrece su equipo sigue el canje.
    nombre: 'Arreglos en vivo (2, control): con un monto o con su equipo en el mensaje, "me lo entregan" no cambia el camino',
    turnos: [
      {
        c: 'tengo 300 para el 13, cuando me lo entregan?',
        lectura: { intencion: 'declara_entrega', entrega: 300000, modelo: '13', modelos: ['13'] },
        entregaLeida: 300000,
        contiene: ['320.000'],
        noContiene: ['que dia', 'horario'],
      },
      { reset: true },
      {
        c: 'te entrego mi 12, me entregas el 15?',
        lectura: { intencion: 'permuta', permuta: { ofrece: true, modelo: '12' }, modelo: '15', modelos: ['12', '15'] },
        contiene: ['a partir del 11'],
        noContiene: ['que dia', 'horario'],
      },
    ],
  },
  {
    nombre: 'Arreglos en vivo (2, control): "¿hacen entregas a domicilio?" sigue escalando por envíos',
    turnos: [
      { c: 'hacen entregas a domicilio?', silencio: true, motivo: 'pregunta por envíos' },
      { reset: true },
      { c: 'hacen entregas a domicilio?', lectura: { intencion: 'consulta_general' }, silencio: true, motivo: 'pregunta por envíos' },
    ],
  },

  // ---------------------------------------------------------------------------
  // Batería, sellado y contexto (01/10/2026, decisiones de Tomás)
  // ---------------------------------------------------------------------------
  {
    nombre: 'Batería (01/10): la batería sale de Bateria_min tal cual ("85-93%") en la lista, en "sí lo tenemos" y en la cotización',
    planilla: CON_13_8593,
    turnos: [
      { c: 'pasame la lista', contiene: ['Ip 13 128gb 85-93% 495.000'], noContiene: ['Ip 13 128gb 85% '] },
      { reset: true },
      { c: 'tenes el 13?', contiene: ['iPhone 13 128GB 85-93%', '$495.000'] },
      { c: 'tengo 400 mil', contiene: ['📱 *iPhone 13 128GB — batería 85-93%*'] },
    ],
  },
  {
    nombre: 'Sellado (01/10): los sellados dicen "sellado" donde iría la batería, en la lista, en "sí lo tenemos" y en la cotización',
    turnos: [
      { c: 'pasame la lista', contiene: ['Ip 17 128gb sellado 1.600.000', 'Ip 17 Pro Max 128gb sellado 2.200.000', 'Ip 16 128gb 85% 1.050.000'] },
      { reset: true },
      { c: 'tenes el 17?', contiene: ['iPhone 17 128GB sellado', '$1.600.000'] },
      { c: 'tengo 1.000.000', contiene: ['📱 *iPhone 17 128GB — sellado*'] },
    ],
  },
  {
    nombre: 'Sellado (01/10): con el 16 usado y el 16 sellado en LISTA, "tenes el 16?" sigue dando el usado (el más barato), y preguntar por sellado escala callado',
    planilla: CON_16_SELLADO,
    turnos: [
      { c: 'pasame la lista', contiene: ['Ip 16 128gb 85% 1.050.000', 'Ip 16 128gb sellado 1.450.000'] },
      { reset: true },
      { c: 'tenes el 16?', contiene: ['iPhone 16 128GB 85%', '$1.050.000'], noContiene: ['1.450.000', 'sellado'] },
      { reset: true },
      { c: 'tenes el 16 sellado?', silencio: true },
    ],
  },

  // Respetar lo que dijo una persona de la cuenta (01/10/2026): si en las últimas 72 h dejó
  // algo pendiente o acordado y el cliente escribe sobre eso, escala callado con la frase.
  // La frase la lee Gemini (`dijo_persona`, acá fija) y el código la busca en las líneas de
  // persona: una que no está, o de hace más de 72 h, no cuenta.
  {
    nombre: 'Persona (01/10, Jazz …5915): "dame un rato que consulte al deposito" y el cliente vuelve con "y? tenes al 100?": callado, con la frase',
    pushName: 'Jazz',
    turnos: [
      { cliente: 'Con batería al 100' },
      { cliente: 'Que tenes' },
      { humano: 'ahi te confirmo bien que tengo al 100%' },
      { humano: 'dame un rato que consulte al deposito porque en el local no nos quedo nada al 100' },
      { pasanHoras: 0.85 },
      {
        c: 'y? tenes al 100?',
        lectura: { dijo_persona: 'ahi te confirmo bien que tengo al 100%' },
        silencio: true,
        motivo: '"ahi te confirmo bien que tengo al 100%"',
      },
    ],
  },
  {
    nombre: 'Persona (01/10): ayer dijo "mañana entran iphones 13" y hoy "hola entraron los 13?": callado, con la frase',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { humano: 'mañana entran iphones 13' },
      { pasanHoras: 20 },
      { c: 'hola entraron los 13?', lectura: { dijo_persona: 'mañana entran iphones 13' }, silencio: true, motivo: 'mañana entran iphones 13' },
    ],
  },
  {
    nombre: 'Persona (01/10, control): ayer dijo "mañana entran iphones 13" y hoy pregunta otra cosa ("cuanto sale el 15?"): contesta normal',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { humano: 'mañana entran iphones 13' },
      { pasanHoras: 20 },
      { c: 'cuanto sale el 15?', lectura: { dijo_persona: null }, escala: false, contiene: ['740.000'] },
    ],
  },
  {
    nombre: 'Persona (01/10, control): "mañana entran" de hace 4 días ya no cuenta, aunque Gemini lo traiga: contesta normal',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { humano: 'mañana entran iphones 13' },
      { pasanHoras: 96 },
      { c: 'hola entraron los 13?', lectura: { dijo_persona: 'mañana entran iphones 13' }, escala: false },
    ],
  },
  {
    nombre: 'Persona (01/10, control): una frase que la persona no escribió (Gemini la inventa) se ignora: contesta normal',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { humano: 'mañana entran iphones 13' },
      { pasanHoras: 20 },
      { c: 'tenes el 15?', lectura: { dijo_persona: 'te lo dejo a 600 mil' }, escala: false, contiene: ['740.000'] },
    ],
  },
  {
    nombre: 'Persona (01/10): Gemini falla y una persona escribió en las últimas 72 h: callado, con lo que dijo',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { humano: 'mañana entran iphones 13' },
      { pasanHoras: 20 },
      { c: 'tenes el 15?', lectura: { _geminiFallo: true }, silencio: true, motivo: 'mañana entran iphones 13' },
    ],
  },
  {
    // Gemini ve el historial sin el nombre del cliente (gemini.sinDatosPersonales lo cambia por
    // "[cliente]") y copia la frase como la vio. Tiene que contar igual (verificación del 01/10).
    nombre: 'Persona (01/10): la persona nombró al cliente y Gemini copia la frase con "[cliente]": callado, con la frase',
    pushName: 'Martina',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { humano: 'Martina mañana entran los 13, te aviso' },
      { pasanHoras: 5 },
      {
        c: 'entraron los 13?',
        lectura: { dijo_persona: '[cliente] mañana entran los 13, te aviso' },
        silencio: true,
        motivo: 'mañana entran los 13, te aviso',
      },
    ],
  },
  {
    nombre: 'Persona (01/10, control): Gemini falla sin ninguna persona en las últimas 72 h: contesta normal',
    turnos: [
      { c: 'tenes el 13?', contiene: ['$495.000'] },
      { humano: 'mañana entran iphones 13' },
      { pasanHoras: 80 },
      { c: 'tenes el 15?', lectura: { _geminiFallo: true }, escala: false, contiene: ['740.000'] },
      { reset: true },
      { c: 'tenes el 15?', lectura: { _geminiFallo: true }, escala: false, contiene: ['740.000'] },
    ],
  },

  // Caso Jazz (30/09, 23:26, chat …5915): había preguntado por el 13 y el 14 (la propuesta del
  // bot con los precios no le llegó: quedó en borrador) y una persona le contestó el stock y la
  // financiación. La tanda "y que precio están / del 13 al 14 / y como serian las cuotas" (Gemini:
  // consulta_precio, sin modelo, con los dos en `modelos`) recibía la financiación y "decime cual
  // te gusto mas", sin los precios: los dos ya estaban en `modelosPedidos`, así que no "sumaba un
  // modelo nuevo" y la pregunta por las cuotas ganaba antes. Va la rama de varios modelos.
  {
    nombre: 'Caso Jazz (30/09): pide precio de dos modelos que nunca vio y las cuotas: la antesala, los dos precios, la financiación y cuál le gusta',
    pushName: 'Jazz',
    turnos: [
      { cliente: 'Yo andaba buscando uno. Eh, siempre tuve Samsung y bueno, me quería pasar a un iPhone. El 13 o el 14, no tanto, quería como empezar por ahí.' },
      { tanda: ['Yo andaba buscando uno. Eh, siempre tuve Samsung y bueno, me quería pasar a un iPhone. El 13 o el 14, no tanto, quería como empezar por ahí.'] },
      { humano: 'jazz' },
      { humano: 'sii tenemos ip 14 y 14 pro' },
      { humano: 'sii hacemos hasta 2 cuotas con una entrega inicial' },
      { pasanHoras: 0.9 },
      {
        c: 'Ah bueno y que precio están\nDel 13 al 14 más o menos\nY como serian las cuotas',
        lectura: { intencion: 'consulta_precio', modelo: null, modelos: ['13', '14'] },
        escala: false,
        maxMensajes: 4,
        contiene: [
          'te paso el 13 y el 14, igualmente tenemos del 11 al 18 Pro Max',
          'Ip 13 128gb 100% 495.000',
          'Ip 14 128gb',
          'te lo financiamos en 1 o 2 cuotas con una entrega inicial',
        ],
        // Las tres variantes de `cualTeGusta` (estilo.js).
        contieneAlguno: ['cual te gust', 'cual te cierra', 'cual se acopla'],
      },
    ],
  },
  {
    nombre: 'Caso Jazz (control): "y como serian las cuotas?" solo, sin modelos, sigue con la financiación',
    turnos: [
      { c: 'y como serian las cuotas?', escala: false, conPrecio: false, contieneAlguno: ['financia', 'entrega inicial'] },
    ],
  },
  {
    nombre: 'Caso Jazz (control): ya vio los precios del 13 y el 14 y pregunta las cuotas nombrándolos: la financiación y que elija, sin repetir los precios',
    turnos: [
      { c: 'tenes el 13 y el 14?', contiene: ['te paso el 13 y el 14'] },
      {
        c: 'y como serian las cuotas del 13 o el 14?',
        escala: false,
        conPrecio: false,
        contiene: ['decime cual te gusto mas, el 13 o el 14'],
        noContiene: ['te paso el 13 y el 14'],
      },
    ],
  },
  {
    nombre: 'Caso Jazz (control): pregunta el precio de un solo modelo y las cuotas: la rama de un modelo',
    turnos: [
      { humano: 'sii hacemos hasta 2 cuotas con una entrega inicial' },
      { pasanHoras: 1 },
      {
        c: 'Ah bueno y que precio esta el 13?\nY como serian las cuotas',
        lectura: { intencion: 'consulta_precio', modelo: '13', modelos: ['13'] },
        escala: false,
        contiene: ['495.000'],
        noContiene: ['te paso el 13 y el 14'],
      },
    ],
  },
];
