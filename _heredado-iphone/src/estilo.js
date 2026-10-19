'use strict';
/**
 * Capa de estilo: las frases que NO llevan números tienen varias formas de
 * decirse, y se va rotando. Es lo que evita que el bot suene a plantilla
 * cuando atiende veinte clientes seguidos.
 *
 * Regla: acá nunca entra un precio, un porcentaje ni un monto. Los números
 * los arma el cotizador. Esto es solo cómo se dice lo demás.
 */

const usadas = new Map(); // clave -> última variante usada, para no repetir

/** "a y b", "a, b y c": cada par [modelo, entrega] armado con `armar(modelo, entrega, i)`. */
function enLista(pares, armar) {
  const partes = pares.map(([m, p], i) => armar(m, p, i));
  return partes.length > 1 ? `${partes.slice(0, -1).join(', ')} y ${partes[partes.length - 1]}` : partes.join('');
}

const FRASES = {
  // Saludo de apertura: SIEMPRE con el nombre y un "como estas"
  saludo: [
    (n) => `buenass ${n}, como estas?`,
    (n) => `hola ${n}! como andas?`,
    (n) => `${n}, como va todo?`,
    (n) => `buenass ${n}! todo bien?`,
  ],

  // Saludo cuando no sabemos el nombre
  saludoSinNombre: [
    () => 'buenass, como estas?',
    () => 'hola! como andas?',
    () => 'buenass! todo bien?',
  ],

  // El cliente preguntó cómo estamos ("buenass como estan", "hola todo bien?"): el saludo
  // le contesta y le devuelve la pregunta (bloque 9, decisión de Tomás del 24/09/2026).
  saludoDevuelve: [
    (n) => `hola ${n}! bien por suerte, vos?`,
    (n) => `buenass ${n}! todo bien por aca, vos?`,
    (n) => `${n}, bien por suerte! vos como andas?`,
    (n) => `buenass ${n}, todo tranqui por aca, vos como estas?`,
  ],
  saludoDevuelveSinNombre: [
    () => 'hola! bien por suerte, vos?',
    () => 'buenass! todo bien por aca, vos?',
    () => 'bien por suerte! vos como andas?',
    () => 'buenass, todo tranqui por aca, vos como estas?',
  ],

  // Retomar la charla nombrando a la persona
  retomar: [
    (n) => `${n}, contame que estas buscando y con cuanto contas`,
    (n) => `dale ${n}, decime que modelito te interesa y que presupuesto tenias`,
  ],

  queModelo: [
    () => 'contame que modelito tenias en mente asi te recomiendo',
    () => 'decime que modelo estabas buscando y te paso precio',
    () => 'contame que estabas mirando asi te ayudo a elegir',
  ],

  // Presentar un modelo que sí hay
  stock: [
    (m, p) => `sii, tenemos en stock ${m}, ese modelito lo tenemos en ${p} de contado`,
    (m, p) => `sii tenemos ${m}, ese esta en ${p} de contado`,
    (m, p) => `siii, ${m} lo tenemos, esta en ${p} de contado`,
  ],

  // El stock partido en dos: primero que sí lo tenemos, después el precio.
  // Es como escribe Tomás de verdad: una idea por mensaje.
  hayStock: [
    (m) => `sii tenemos ${m}`,
    (m) => `siii, ${m} lo tenemos`,
    (m) => `sii, tenemos en stock ${m}`,
  ],
  precioDeEse: [
    (p) => `ese modelito lo tenemos en ${p} de contado`,
    (p) => `ese esta en ${p} de contado`,
    (p) => `lo tenemos en ${p} de contado`,
  ],

  // Preguntar si mira otro modelo
  otroModelo: [
    (c) => `tenias solo interes por el ${c} o tenias pensado otro modelito?`,
    (c) => `te interesaba solo el ${c} o estabas viendo otros tambien?`,
    (c) => `mirabas solo el ${c} o queres que te pase algun otro?`,
  ],

  // Cuando eligió el modelo
  buenaEleccion: [
    () => 'perfecto, muy buena eleccion',
    () => 'buenisimo, ese es un tremendo modelito',
    () => 'joya, ese anda barbaro',
  ],

  // Preguntar cómo lo va a pagar
  comoPaga: [
    (pct) =>
      `contame como tenias pensado pagarlo, tenemos contado y tambien lo financiamos hasta en 2 cuotas con una entrega inicial${pct}`,
    (pct) =>
      `contame como lo ibas a hacer, podes de contado o financiarlo hasta en 2 cuotas con una entrega inicial${pct}`,
  ],

  // Pedir el presupuesto
  pedirEntrega: [
    () => 'contame con cuanto contas asi te armo las cuotas',
    () => 'decime con cuanto contas para la entrega y te paso los numeros',
    () => 'contame de cuanto disponias para la entrega asi te cotizo',
  ],

  // Antes de tirar la cotización, cuando sí le alcanza
  puedeRetirar: [
    (m, p) => `siii obviamente, el ${m} lo podes retirar con esos ${p}`,
    (m, p) => `dale, el ${m} lo sacas tranquilo con esos ${p}`,
    (m, p) => `perfecto, con esos ${p} el ${m} te lo llevas`,
  ],

  // "te lo llevas" cuando además preguntó cuánto sale (Ajustes 1, decisión de
  // Tomás del 16/09/2026): la cotización ya no muestra el contado, así que el
  // precio va acá y solo si lo pregunta. Llegan formateados del cotizador.
  puedeRetirarConPrecio: [
    (m, p, precio) => `el ${m} esta ${precio}, con esos ${p} te lo llevas`,
    (m, p, precio) => `siii, el ${m} sale ${precio} y con esos ${p} lo podes retirar`,
    (m, p, precio) => `dale, el ${m} esta ${precio}, con esos ${p} lo sacas tranquilo`,
  ],

  // La entrega alcanza para pagarlo entero: no hay cuotas y sí va el precio, que
  // es lo que tiene que pagar. Reemplaza al "Contado: $X" de la plantilla.
  pagaDeContado: [
    (m, precio) => `con eso lo pagas de contado, el ${m} esta ${precio}`,
    (m, precio) => `con eso te alcanza para pagarlo de contado, el ${m} sale ${precio}`,
    (m, precio) => `con esa plata lo sacas de contado, el ${m} esta ${precio}`,
  ],

  ahoraCotizo: [
    () => 'ahora te cotizo',
    () => 'te paso los numeros',
    () => 'mira como te queda',
  ],

  // Ya le cotizamos eso mismo y lo vuelve a decir
  yaCotizado: [
    (p, modelo) =>
      `sii, con ese monto hacemos lo siguiente: abonas ${p} como entrega y te llevas el ${modelo}`,
    (p, modelo) =>
      `dale, abonas los ${p} de entrega, te llevas el ${modelo} y el resto lo hacemos en cuotas`,
  ],
  // Lo mismo cuando lo paga de contado: sin "el resto en cuotas" (Mejora 1).
  yaCotizadoContado: [
    (p, modelo) => `sii, con esos ${p} lo pagas de contado y te llevas el ${modelo}`,
    (p, modelo) => `dale, con los ${p} te llevas el ${modelo} de contado`,
  ],
  // Lo mismo, cuando pregunta cuánto sale: la cotización ya no lleva el precio.
  yaCotizadoConPrecio: [
    (p, modelo, precio) => `sii, el ${modelo} esta ${precio}, con ese monto abonas ${p} como entrega y te lo llevas`,
    (p, modelo, precio) => `dale, el ${modelo} sale ${precio}, abonas los ${p} de entrega y te lo llevas`,
  ],
  restoEnCuotas: [
    () => 'el resto lo podemos hacer en hasta 2 cuotas',
    () => 'lo que queda te lo financiamos en hasta 2 cuotas',
  ],
  confirmarSigue: [
    () => 'te queda comodo asi o vemos otra opcion?',
    () => 'que te parece? lo hacemos con eso?',
  ],

  // Los requisitos cuando van sin el PDF (medios de pago): sin tarjeta, con dni y
  // compromiso de pago, pero sin prometer que se lo pasamos.
  requisitos: [
    () => 'no necesitas tarjeta de credito, es con tu dni y un compromiso de pago',
    () => 'no hace falta tarjeta, solo tu dni y un compromiso de pago',
  ],

  // Cómo es la financiación, antes de la primera cotización o cuando pregunta
  // sin haber dicho cuánto tiene (bloque 3b, pedido de Tomás tras la prueba en
  // vivo del 16/09/2026). Frases reales del WhatsApp del negocio. Cada variante
  // dice SIEMPRE: que se financia el celular, 1 o 2 cuotas (o hasta 2) y que
  // pedimos una entrega inicial. Sin porcentajes ni montos: dependen del modelo.
  // Todas pasan temas.EXPLICA.financiacion (lo prueba test/financiacion.test.js).
  explicaFinanciacion: [
    () => 'sii mira, te cuento, lo que hacemos es financiarte el celular y darte a pagar en 1 o 2 cuotas, pedimos una entrega inicial',
    () => 'te cuento, financiamos el celular, lo que pedimos es una entrega inicial y el resto lo financias en 1 o 2 cuotas',
    () => 'mira te paso a contar, te financiamos el celular, pedimos una entrega inicial y te damos hasta 2 cuotas',
    () => 'sii, te cuento como es, el celular te lo financiamos con una entrega inicial y el resto lo pagas en 1 o 2 cuotas',
  ],

  // El pie del compromiso de pago (el PDF). Cada variante dice SIEMPRE: que no
  // necesita tarjeta, que solo necesita su dni, y que es con un compromiso de
  // pago que se lo pasamos. Todas pasan temas.EXPLICA.requisitos.
  pieCompromiso: [
    () => 'no necesitas tarjeta, solo tu dni y un compromiso de pago, te lo paso asi lo lees',
    () => 'solo pedimos dni y un compromiso de pago, sin tarjeta, te lo paso asi lo lees',
    () => 'no necesitas tarjeta de credito ni nada, solo tu dni, usamos un compromiso de pago que te lo mando para que lo puedas leer',
    () => 'no hace falta tarjeta, solo tu dni y un compromiso de pago, te lo mando asi lo lees tranqui',
  ],

  // Pregunta qué documentación traer: solo el DNI.
  soloDni: [
    () => 'solo tenes que traer tu dni, no hace falta tarjeta de credito',
    () => 'con tu dni alcanza, no necesitas tarjeta de credito',
  ],
  // Paga de contado y pregunta qué papeles piden (Mejora 1, decisión de Tomás del
  // 16/09/2026): no necesita nada. Sin dni, tarjeta ni compromiso: así tampoco marca
  // los requisitos como explicados, y si después financia se le dicen.
  requisitosContado: [
    () => 'de contado no necesitas nada, solo venir',
    () => 'si lo pagas de contado no hace falta nada, solo que te acerques',
    () => 'de contado no te pedimos nada, solo que vengas',
  ],

  // Pregunta cómo se paga. Sin montos: la entrega depende del modelo. El contado es en
  // efectivo, transferencia o Mercado Pago (bloque 8, decisión de Tomás del 24/09/2026).
  mediosDePago: [
    () => 'podes pagarlo de contado (efectivo, transferencia o mercado pago) o financiarlo hasta en 2 cuotas con una entrega inicial',
    () => 'tenemos contado, en efectivo, transferencia o mercado pago, y tambien financiacion hasta en 2 cuotas, con una entrega inicial',
  ],

  // Quiere venir. Se pregunta lo que falta para coordinar, pero el bot no
  // confirma horarios ni promete que otra persona le va a escribir.
  queDia: [
    () => 'dale, que dia te podes acercar?',
    () => 'joya, que dia te queda comodo acercarte?',
    () => 'contame que dia podrias pasar',
  ],
  queHorario: [
    () => 'dale, en que horario te queda comodo?',
    () => 'joya, a que hora mas o menos podrias venir?',
  ],
  // Viene "un día de estos", sin día (bloque 10, ejemplo aprobado; la respuesta de Tomás:
  // "nos manejamos con turnos nosotros mas que nada para que no se nos junten clientes").
  // Sin contado ni cuotas, sin prometer nada y sin escalar: el turno se arma cuando diga el
  // día. Todas dicen "con turno"; la segunda pregunta "que dia", así su respuesta ("el
  // jueves") sigue el turno de siempre.
  vueltaConTurno: [
    () => 'dale, te comento que nos manejamos con turnos, mas que nada para que no se nos junten clientes y no tengas que esperar',
    () => 'buenisimo, te cuento que atendemos con turnos, asi no se juntan clientes y no te toca esperar',
    () => 'joya, nosotros trabajamos con turnos, mas que nada para que no se junten clientes y no tengas que esperar',
  ],
  vueltaQueDia: [
    () => 'asi que cuando sepas que dia te queda comodo, avisame',
    () => 'cuando sepas que dia podes venir me decis',
  ],
  // `chequeoHorario` ("dejame chequear si ese horario lo tenemos libre", "me fijo si
  // tenemos ese horario disponible") se sacó en la Mejora 1: era solo una promesa, y
  // con día y hora dichos el bot escala callado.

  // Primer iPhone: es una señal de compra, no un dato de color.
  primerIphone: [
    () => 'perfecto, llegaste al lugar indicado entonces',
    () => 'buenisimo, estas en el lugar indicado para tu primer iphone',
    () => 'joya, entonces te vas a llevar tu primer iphone con nosotros',
  ],
  // Primer iPhone fundido con "te lo llevas" en UN mensaje (bloque 4b, decidido
  // por Tomás): cuando la explicación de la financiación y el PDF van adelante
  // de la primera cotización, la tanda tiene 4 justos y la frase sola no entra.
  // Cada variante reconoce el primer iPhone y dice que con ese monto se lleva
  // ese modelo. Son los únicos números de esta capa: llegan ya formateados
  // desde el cotizador, igual que en puedeRetirar.
  primerIphoneRetira: [
    (m, p) => `perfecto, llegaste al lugar indicado, con esos ${p} el ${m} te lo llevas`,
    (m, p) => `buenisimo, estas en el lugar indicado para tu primer iphone, el ${m} lo sacas tranquilo con esos ${p}`,
    (m, p) => `joya, tu primer iphone te lo llevas con nosotros, con esos ${p} el ${m} es tuyo`,
  ],
  // Con el precio, si además preguntó cuánto sale (Ajustes 1).
  primerIphoneRetiraConPrecio: [
    (m, p, precio) => `perfecto, llegaste al lugar indicado, el ${m} esta ${precio} y con esos ${p} te lo llevas`,
    (m, p, precio) => `buenisimo, estas en el lugar indicado para tu primer iphone, el ${m} sale ${precio} y lo sacas tranquilo con esos ${p}`,
    (m, p, precio) => `joya, tu primer iphone te lo llevas con nosotros, el ${m} esta ${precio} y con esos ${p} es tuyo`,
  ],
  // Primer iPhone cuando la entrega cubre el contado (decisión de Tomás del 19/09/2026,
  // opción A): sin monto ni "te lo llevas", porque la ficha que sigue ya dice que le
  // alcanza y el precio. Antes "lo sacas tranquilo con esos $900.000" repetía la ficha.
  primerIphoneContado: [
    () => 'perfecto, llegaste al lugar indicado para tu primer iphone',
    () => 'buenisimo, estas en el lugar indicado para tu primer iphone',
    () => 'joya, tu primer iphone va a ser con nosotros',
  ],
  primerIphoneTranqui: [
    () => 'te lo entregamos listo para usar y te explicamos todo antes de que te vayas',
    () => 'no te hagas drama con nada, te lo dejamos andando y te explicamos todo',
  ],

  // Invitar a elegir
  cualTeGusta: [
    () => 'contame que modelito te gusta y cual se acopla mas a vos',
    () => 'decime cual te gusto mas y seguimos con ese',
    () => 'contame cual te cierra mas y vemos ese',
  ],

  // La entrega no llega al mínimo del modelo que nombró (bloque 5b, decisión de
  // Tomás del 16/09/2026): antes de cotizar con recargo o bajar de gama, se le dice
  // la entrega que pedimos para ese modelo, dos veces. Sin el contado y nunca la
  // diferencia. El modelo, la entrega y el monto del cliente (si lo dijo; puede venir
  // null) llegan formateados de responder.js.
  //
  // Bloque Tono (17/09/2026, tras la prueba en vivo): "para el 13 la entrega inicial
  // es de $320.000" era correcto pero seco. Cada variante tiene dos partes: retoma el
  // monto que dijo el cliente y dice la entrega que pedimos, y cierra con una razón o
  // un beneficio. Nunca termina con una pregunta (decisión de Tomás). La 0 y la 2
  // presentan la entrega (responder.js elige una según el modelo); la 1 va en la
  // segunda insistencia y explica por qué la pedimos y qué pasa después. Vocabulario
  // de los chats reales de Tomás y Fran: "para el 15 pro retirarlo lo estábamos
  // pidiendo a 590 mil pesos como entrega inicial", "pedimos por lo menos…", "podes
  // hacer una entrega de los 380 y después el resto en 1 o 2 cuotas", "algo
  // organizamos para que te lo puedas llevar", "cuanto más entrega, más cómodas".
  // Cada variante tiene que decir "$X de entrega inicial": así temas.js no la cuenta
  // como explicación y responder.js la reconoce para leer un "500" suelto.
  entregaInicial: [
    (m, p, plata) =>
      `${plata ? `mira, con los ${plata} al ${m} todavia no llegamos, para retirarlo` : `mira, para retirar el ${m}`} lo estamos pidiendo con ${p} de entrega inicial. lo que queda lo haces en 1 o 2 cuotas, y cuanta mas entrega pongas mas comodas te quedan`,
    (m, p, plata) =>
      `te cuento como es, para el ${m} pedimos por lo menos ${p} de entrega inicial, es lo que nos deja financiarte el resto en 1 o 2 cuotas. ${plata ? `con los ${plata} todavia no estamos ahi, pero cuando` : 'cuando'} llegues a esa entrega lo organizamos y te lo llevas`,
    (m, p, plata) =>
      `dale, te cuento, ${plata ? `con los ${plata} al ${m} todavia no estamos, para ese modelo` : `para el ${m}`} pedimos ${p} de entrega inicial. el resto lo financiamos en 1 o 2 cuotas, asi que cuanto mas te acerques a esa entrega mas livianas te quedan`,
  ],

  // Lo mismo con VARIOS modelos que nombró (bloque 9, decisión de Tomás del 24/09/2026,
  // tras la prueba en vivo: "con los $200.000 al 14 Pro todavia no estamos…" y "con los
  // $200.000 al 15 Pro todavia no llegamos…" iban en dos mensajes con la explicación dos
  // veces). Un solo mensaje: la entrega de cada uno y la explicación una vez. Mismas reglas
  // que `entregaInicial`, con el mismo orden de variantes (la 1 es la segunda vez): nunca
  // la diferencia, nunca termina con una pregunta, y dice "$X de entrega inicial" o
  // "entrega inicial … de $X" (temas.LINEA_ENTREGA_INICIAL). `pares` llega armado de
  // responder.js: [['14 Pro', '$500.000'], ['15 Pro', '$540.000']].
  entregaInicialVarios: [
    (pares, plata) =>
      `${plata ? `con los ${plata} todavia no llegamos: ` : ''}${enLista(pares, (m, p, i) => (i ? `para el ${m} de ${p}` : `para el ${m} la entrega inicial es de ${p}`))}. el resto lo financiamos en 1 o 2 cuotas, asi que cuanto mas te acerques a esa entrega mas livianas te quedan`,
    (pares, plata) =>
      `te cuento como es, pedimos por lo menos ${enLista(pares, (m, p, i) => (i ? `${p} para el ${m}` : `${p} de entrega inicial para el ${m}`))}, es lo que nos deja financiarte el resto en 1 o 2 cuotas. ${plata ? `con los ${plata} todavia no estamos ahi, pero cuando` : 'cuando'} llegues a la entrega del que te guste lo organizamos y te lo llevas`,
    (pares, plata) =>
      `mira, ${plata ? `con los ${plata} todavia no estamos, ` : ''}${enLista(pares, (m, p, i) => (i ? `el ${m} con ${p}` : `el ${m} lo estamos pidiendo con ${p} de entrega inicial`))}. lo que queda lo haces en 1 o 2 cuotas, y cuanta mas entrega pongas mas comodas te quedan`,
  ],

  // Paso 3 con recargo (Bloque Tono, decisión de Tomás del 17/09/2026): antes de la
  // ficha, que está cerca y que le hacemos una excepción. El único número es su
  // entrega: ni cuánto le falta, ni que las cuotas suben, ni "recargo" ni "interés".
  // `modelos` llega armado ("el 13", "el 13 y el 15"). De los chats reales: "dale
  // tranqui nomas avisame y algo organizamos para que te lo puedas llevar", "si estas
  // organizamos y ya te lo llevas". Reemplaza a "te lo llevas" y a "ahora te cotizo".
  excepcionCerca: [
    (modelos, plata) =>
      `mira, con los ${plata} estas cerca para ${modelos}, asi que algo organizamos para que te lo puedas llevar. te lo armo con esa entrega, mira como te queda`,
    (modelos, plata) =>
      `dale, con los ${plata} te quedas cerca para ${modelos}, asi que te hago una excepcion y te lo armo con esa entrega, mira como te queda`,
    (modelos, plata) =>
      `tranqui, para ${modelos} estas cerca, asi que con los ${plata} de entrega algo armamos y te lo llevas igual. mira como te queda`,
  ],

  // Pedido de descuento (bloque 5, decisión de Tomás del 16/09/2026): el precio es ese, sin
  // números. Desde el 30/09/2026 no hay descuento y va en todos los pedidos (antes, el 2do
  // ofrecía el contado − $10.000 y el 3ro lo repetía).
  descuentoPrimero: [
    () => 'el precio es ese, ya lo tenemos bastante ajustado',
    () => 'ese es el precio que manejamos, esta muy ajustado',
    () => 'la verdad que el precio es ese, ya esta al limite',
  ],
};

/**
 * Devuelve una variante, evitando repetir la última que se usó de esa clave.
 * Si la clave no existe, devuelve null y el que llama usa su texto fijo.
 */
function frase(clave, ...args) {
  const opciones = FRASES[clave];
  if (!opciones || !opciones.length) return null;
  if (opciones.length === 1) return opciones[0](...args);

  const ultima = usadas.get(clave);
  let i = Math.floor(Math.random() * opciones.length);
  if (i === ultima) i = (i + 1) % opciones.length;
  usadas.set(clave, i);
  return opciones[i](...args);
}

/** Todas las variantes de una clave, ya armadas. Para las pruebas que revisan cada una. */
function variantes(clave, ...args) {
  return (FRASES[clave] || []).map((f) => f(...args));
}

module.exports = { frase, variantes };
