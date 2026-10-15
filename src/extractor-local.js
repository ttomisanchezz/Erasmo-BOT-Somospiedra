'use strict';
/**
 * Extractor de respaldo, sin IA.
 *
 * Se usa cuando Gemini falla o no hay clave configurada. No entiende matices,
 * pero saca lo esencial: qué modelo pregunta y cuánta plata dijo tener.
 * Sirve para dos cosas:
 *   1. Probar el bot sin ninguna clave.
 *   2. Que en producción, si el tier gratuito se queda sin cupo, el bot no
 *      quede ciego y siga cotizando.
 */

// La "x" (iPhone X) va aparte, en `extraerModelos`: suelta es "por" ("2 x 45", "x favor").
const MODELOS = [
  'xr', 'xs max', 'xs',
  '11 pro max', '11 pro', '11',
  '12 pro max', '12 pro', '12 mini', '12',
  '13 pro max', '13 pro', '13 mini', '13',
  '14 pro max', '14 pro', '14 plus', '14',
  '15 pro max', '15 pro', '15 plus', '15',
  '16 pro max', '16 pro', '16 plus', '16',
  '17 pro max', '17 pro', '17',
  // Desde cero (29/09/2026): la cuenta dice "del 11 al 18 Pro Max" (D8) y hay 18 en la planilla.
  '18 pro max', '18 pro', '18 plus', '18',
];

function normalizar(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Palabras que habilitan leer un número pelado como plata ("tengo 250").
 * "con" a secas NO: es demasiado común ("con 90 de bateria", "con caja").
 * "con <número> ... alcanza" SÍ (decisión de Tomás del 28/09/2026): "con 520 me
 * alcanza para el 14 pro?" es su entrega, como ya lo leía Gemini.
 * "llego a" habilita, pero "no llego a 700" se saca antes (`sinTopeAjeno`):
 * ese 700 es el precio de algo que no le alcanza.
 */
const CONTEXTO_ENTREGA = /(tengo|cuento con|entrego|entrega|dispongo|junte|junté|junto|me estiro|estiro|llego a|\bcon\s+\d[\d.]*\s*(?:mil|k|lucas)?\s+(?:me\s+|te\s+|nos\s+)?alcanz)/;

/**
 * Palabras con las que el cliente corrige el monto que dijo (bloque 5, decisión de
 * Tomás del 16/09/2026): "tengo 400" + "perdón, 500". Con una de estas gana el
 * último monto; sin ellas sigue ganando el primero ("tengo 400 y me estiro a 550").
 * También habilitan leer un número pelado, como CONTEXTO_ENTREGA. Sobre el texto
 * sin tildes.
 *
 * Sin la bandera `g` (desde cero, segunda vuelta, 30/09/2026): `hablaDeSuPlata` la usa con
 * `.test()`, que con `g` deja cargado el `lastIndex` ("mejor 800?" daba true y después false,
 * y el `matchAll` de `extraerMonto` arrancaba desde ahí). `extraerMonto` usa la copia con `g`.
 */
const CORRECCION = /\b(perdon|me equivoque|en realidad|mejor|corrijo|no,? son)\b/;
const CORRECCIONES = new RegExp(CORRECCION.source, 'g');

/** Capacidades que no se leen como plata cuando van sueltas (bloque 5). */
const CAPACIDADES_SUELTAS = [128, 256, 512];

/**
 * Pide un descuento (bloque 5). Se revisa sobre el mensaje crudo, lea lo que lea
 * Gemini. "me lo dejás más barato" es descuento; "el más barato", "cuál es más
 * barato" y "algo más barato" piden el modelo más económico. "algo menos" no
 * entra: choca con montos ("tengo algo menos de 500").
 */
// "¿Me lo dejás en 780?" también (desde cero, segunda vuelta, 30/09/2026): es un regateo, no una
// pregunta por el precio ni su entrega (ver `esRegateo`). "¿Me lo dejás a 3 cuotas?" no.
const REGATEO =
  '(?:me |nos )?(?:lo |la )?(?:dejas|dejarias|dejaria|dejan|dejarian) (?:en|a) \\$?\\d[\\d.]*\\b(?: ?(?:mil|k|lucas))?(?!\\s*(?:cuotas?|pagos?|meses|dias|semanas|%))';
const PIDE_DESCUENTO = new RegExp(
  `\\b(descuent\\w*|rebaj\\w*|precio especial|mejor precio|(me |nos )?(lo |la )?(dejas|dejarias|dejaria) (un poco |algo )?mas barato|dejamelo (un poco |algo )?mas barato|(haceme|hace|haces|hacerme|me haces|me podes hacer) (un )?precio|${REGATEO})\\b`
);

function pideDescuento(texto) {
  return PIDE_DESCUENTO.test(normalizar(texto));
}

/** ¿Propone él el precio? "¿me lo dejás en 780?": ese monto no es su entrega. */
function esRegateo(texto) {
  return new RegExp(`\\b${REGATEO}`).test(normalizar(texto));
}

/**
 * Pide recibir fotos o videos (bloque 8, decisión de Tomás del 24/09/2026): "me mandás
 * fotos?", "me pasás unas fotos del 15?", "tenés fotos?", "me envías fotos o videos",
 * "ftos y precios". El que MANDA fotos no pide nada: "te mando las fotos" o "ahí van" en
 * un canje siguen el camino del canje. Con un canje en curso, "fotos?" suelto tampoco
 * cuenta: puede estar preguntando qué fotos le pedimos. El verbo va en presente o
 * condicional: "lo que me enviaste en el video" (registro real, una postventa) habla de
 * algo que ya le mandaron; en pasado cuenta solo negado ("nunca me enviaste las fotitos").
 */
// "ft" y "fts" también (desde cero, 29/09/2026: "T3ndrias ft del 14 pro").
const MEDIA = '(?:fotos?|ftos?|fts?|fotitos?|videos?|imagen(?:es)?)';
const PIDE_FOTOS = new RegExp(
  // "me mandás fotos", "me pasás unas fotos", "nos podés mandar un video"
  `\\b(?:me|nos)\\s+(?:(?:podes|podrias|podras|puedes|pueden|podrian|podran)\\s+(?:mandar|pasar|enviar)|(?:mand|pas|envi)(?:as|an|arias|arian|aras|aran))(?:\\s+\\S+){0,2}?\\s+${MEDIA}\\b` +
    // "nunca me enviaste las fotitos", "no me pasaron las fotos"
    `|\\b(?:no|nunca)\\s+(?:me|nos)\\s+(?:mand|pas|envi)(?:aste|aron)(?:\\s+\\S+){0,2}?\\s+${MEDIA}\\b` +
    // "mandame fotos", "pasame una foto", "enviame videos"
    `|\\b(?:mand|pas|envi)a(?:me|nos)(?:\\s+\\S+){0,2}?\\s+${MEDIA}\\b` +
    // "tenés fotos?", "hay videos del 15?", "tendrías fotos del 14 pro?"
    `|\\b(?:tenes|tienen|tendras|tendrian|tendrias|tendria|hay)(?:\\s+\\S+){0,2}?\\s+${MEDIA}\\b` +
    // "ftos y precios", "precio y fotos", "quiero ver fotos"
    `|\\b${MEDIA}\\s+y\\s+precios?\\b|\\bprecios?\\s+y\\s+${MEDIA}\\b|\\bver\\s+(?:unas\\s+|las\\s+|algunas?\\s+)?${MEDIA}\\b`
);
const SOLO_FOTOS = new RegExp(`^[^a-z0-9]*(?:y\\s+)?(?:unas?\\s+|las\\s+|algunas?\\s+)?${MEDIA}[^a-z0-9]*$`);

// Fotos de un modelo, sin verbo (desde cero, 29/09/2026): "T3ndrias ft del 14 pro", "ftos del
// 11". Si las está mandando él ("te mando fotos del 13", "ahí van") no pide nada.
const FOTOS_DEL_MODELO = new RegExp(`\\b${MEDIA}\\s+(?:del?|de la)\\s+(?:iphone\\s+|ip\\s+)?(?:1[1-8]|xr|xs|x|se)\\b`);
const MANDA_FOTOS = new RegExp(
  `\\b(?:te|le|les)\\s+(?:mando|paso|envio|mande|pase|envie|mandare|pasare|voy a mandar|voy a pasar)(?:\\s+\\S+){0,2}?\\s+${MEDIA}\\b|\\b(?:ahi|aca) van\\b`
);

function pideFotos(texto, { enCanje = false } = {}) {
  const t = normalizar(texto).trim();
  if (PIDE_FOTOS.test(t) || (!enCanje && SOLO_FOTOS.test(t))) return true;
  return FOTOS_DEL_MODELO.test(t) && !MANDA_FOTOS.test(t);
}

/**
 * Pregunta por un accesorio (bloque 8, decisión de Tomás del 24/09/2026). Antes bastaba
 * con nombrar uno: "no tenía cargador", "algún 15 pro max en caja?", "lo de cargador lo
 * descarto" o "el vidrio templado que tengo que sacarle" escalaban. Ahora escala si:
 *  - pide comprarlo o que llegue ("venden cargadores?", "necesito un cable", "qué día te
 *    llega el cable?"), o pregunta por su compatibilidad ("la ficha C"): siempre;
 *  - pregunta si lo tiene o si viene ("tiene caja original?", "viene con cargador?"),
 *    salvo que esté describiendo su propio celular ("el mío viene con templado", un canje).
 * "En caja" y "sellado" hablan del equipo, no de un accesorio. Negado y sin "?", no es
 * una pregunta ("no tiene ningún detalle").
 */
const ACCESORIO = '(?:cargador(?:es)?|cables?|fundas?|(?:vidrio\\s+)?templados?|auriculares?|airpods|accesorios?|cajas?(?:\\s+origina(?:l|les))?)';
const HASTA_3 = '(?:\\s+\\S+){0,3}?\\s+';
const verbos = (lista, conNegacion) => `${conNegacion ? '' : '(?<!\\bno\\s)(?<!\\bni\\s)'}\\b(?:${lista})`;
const PIDE_ACCESORIO =
  'venden|vendes|vende|venderme|venderias|consiguen|conseguis|comprar|comprarte|compro|necesito|busco|quiero|queria|llega|llegan|llegara|llegaran|llegaria|entra|entran';
const TIENE_ACCESORIO = 'tenes|tienen|tiene|tendras|tendrian|hay|trae|traen|viene|vienen|incluye|incluyen|con|sin';
const COMPATIBILIDAD = /\bfichas?\b|\btipo[\s-]?c\b|\busb\b|\blightning\b|\bcompatibles?\b/;
const SOLO_ACCESORIO = new RegExp(`^[^a-z0-9]*(?:y\\s+)?(?:el|la|los|las)?\\s*${ACCESORIO}[^a-z0-9]*$`);
const SU_CELULAR = /\b(el mio|la mia|mi (celu|celular|iphone|telefono|equipo)|este (celu|celular|telefono|equipo)|canje\w*|permuta|parte de pago|lo tomas)\b/;

function preguntaPorAccesorio(texto) {
  const t = normalizar(texto).replace(/\ben (su )?caja\b|\bsellados?\b/g, ' ');
  if (!new RegExp(`\\b${ACCESORIO}\\b`).test(t)) return false;
  const pregunta = t.includes('?');
  const pide = new RegExp(`${verbos(PIDE_ACCESORIO, pregunta)}${HASTA_3}${ACCESORIO}\\b`);
  if (pide.test(t) || COMPATIBILIDAD.test(t) || SOLO_ACCESORIO.test(t.trim())) return true;
  const tiene = new RegExp(`${verbos(TIENE_ACCESORIO, pregunta)}${HASTA_3}${ACCESORIO}\\b`);
  return tiene.test(t) && !SU_CELULAR.test(t);
}

/**
 * Pregunta por el estado del equipo que vendemos (desde cero, D4, decisión de Tomás del
 * 29/09/2026): batería, usado, nuevo, sellado, capacidad o memoria, estado, detalles,
 * rayones, golpes, marcas, "impecable" o el módulo. Escala callado siempre, haya modelo en
 * juego o no: el estado de cada unidad lo sabe una persona. Hasta el 29/09 caía en el texto
 * de importados ("¿cuánta batería tiene?", "¿es usado?") o en "cómo pensabas pagarlo", y
 * "¿te quedan 16 sellados?" recibía el usado. La batería cuenta aunque diga "original"
 * ("¿las baterías son originales?"). No cuentan:
 *  - los datos de SU equipo: "mi 13 con 85% de batería", "tengo un 14 sin detalles", "te
 *    dejo mi 12", "hasta el domingo tenía 78" (un canje sigue su camino);
 *  - lo que cuenta de su equipo sin preguntar: "no tiene ningún detalle", "sin rayones";
 *  - pedir la lista o el catálogo ("¿me pasás el catálogo de usados?");
 *  - una consulta de stock con capacidad ("¿tenés el 13 de 256?"): sin "memoria",
 *    "almacenamiento" o "capacidad" no pregunta por el estado;
 *  - "de nuevo", y el origen del equipo ("¿es original?", "reacondicionado", "¿de dónde
 *    vienen?"), que sigue con el texto de importados (responder.js).
 */
const ESTADO_DEL_EQUIPO = new RegExp(
  '\\bbaterias?\\b|\\bsellad[oa]s?\\b|\\b(?:almacenamiento|memoria|capacidad)\\b' +
    '|\\b(?:cuant[oa]s?|que|mas|de cuant[oa]s?)\\s+(?:gb|gigas?)\\b|\\bestado\\b(?!\\s+unidos)|\\bcondicion\\b' +
    '|\\bdetalles?\\b|\\b(?:rayon|rayones|rayas?|rayad[oa]s?|rayitas?)\\b|\\b(?:golpes?|golpead[oa]s?|golpecitos?)\\b' +
    '|\\b(?:marcas|marcad[oa]s?|marquitas?)\\b|\\bmodulo\\b|\\bimpecable\\b'
);
// "usado" y "nuevo" solo como pregunta por la condición: "¿es usado?", "¿usado o nuevo?",
// "nuevo trabajás?", "¿no tenés alguno usado?", "¿nuevos?". No "toman usados" (un canje).
const USADO_O_NUEVO = new RegExp(
  '\\b(?:es|son|esta|estan|viene|vienen|seria|serian)\\s+(?:usad|nuev)[oa]s?\\b' +
    '|\\b(?:usad|nuev)[oa]s?\\s+o\\s+(?:usad|nuev|sellad)[oa]s?\\b' +
    '|\\bnuev[oa]s?\\s+(?:trabajas|trabajan|tenes|tienen|hay|venden|vendes)\\b' +
    '|\\b(?:trabajas|trabajan|tenes|tienen|tendras|tendrias|hay|venden|vendes|quedan?)\\s+(?:\\S+\\s+){0,3}?(?:usad|nuev)[oa]s?\\b' +
    '|^[^a-z0-9]*(?:y\\s+)?(?:usad|nuev)[oa]s?(?:\\s+nada)?[^a-z0-9]*$'
);
const SU_EQUIPO = new RegExp(
  '\\b(?:mi|mis)\\s+(?:iphone|ip|celu|celular|telefono|equipo|1[1-8]|xr|xs|x|se|[6-9])\\b|\\b(?:el|la)\\s+mi[oa]\\b' +
    '|\\btengo\\s+(?:un|una|el)\\s+(?:iphone|ip|celu|celular|telefono|equipo|1[1-8]|xr|xs|x|[6-9])\\b' +
    // "hasta el domingo tenía 78", "tenía un 13": su equipo. "Yo tenía pensado gastarme un
    // millón, ¿no tenés alguno usado?" no (C24T6): pregunta por los nuestros.
    '|\\btenia\\s+(?:\\S+\\s+){0,2}?\\d{2,3}\\b|\\btenia\\s+(?:un|una|el|mi)\\s+(?:iphone|ip|celu|celular|telefono|equipo|1[1-8])\\b' +
    '|\\b(?:entrego|entregar|entregaria|te dejo|dejo mi|canje\\w*|permuta|parte de pago)\\b'
);
const LO_CUENTA = /\b(?:no|sin|ningun|ninguna|cero|ni un|ni una)\b(?:\s+\S+){0,3}?\s+(?:detalles?|rayon\w*|rayas?|rayad\w*|golpe\w*|marcas?|marcad\w*)\b/;
/**
 * Tampoco son el estado del equipo (desde cero, segunda vuelta, 30/09/2026): el estado de
 * WhatsApp ("vi en tu estado el 15 pro", "lo subiste al estado"), los detalles de la
 * financiación, del pago o de las cuotas, las otras marcas ("¿trabajan otras marcas o solo
 * iPhone?", que escala con su motivo en responder.js), "algo más nuevo" (un modelo más
 * reciente), "¿son nuevos los precios?" y "la capacidad de pago". Se sacan antes de mirar.
 */
const NO_ES_EL_ESTADO = new RegExp(
  '\\b(?:tu|tus)\\s+estados?\\b|\\bal\\s+estado\\b|\\bestados?\\s+(?:de|del)\\s+(?:whats\\w*|wsp|wpp|wp|insta\\w*|ig)\\b' +
    '|\\b(?:subiste|subieron|publicaste|publicaron|pusiste|pusieron)\\b[^.?!\\n]{0,25}\\bestados?\\b' +
    '|\\bestados?\\b[^.?!\\n]{0,25}\\b(?:subiste|subieron|publicaste|publicaron|pusiste|pusieron)\\b' +
    '|\\bdetalles?\\s+(?:de|del)\\s+(?:la\\s+|las\\s+|los\\s+)?(?:financ\\w*|pagos?|cuotas?|plan\\w*)\\b' +
    '|\\botras\\s+marcas\\b|\\bmarcas\\b[^.?!\\n]{0,30}\\bsolo\\s+(?:iphone|apple)\\b|\\bsolo\\s+(?:iphone|apple)\\b[^.?!\\n]{0,30}\\bmarcas\\b' +
    '|\\bmas\\s+nuev[oa]s?\\b|\\bnuev[oa]s?\\s+(?:(?:los|las|el|la|estos|esos)\\s+)?(?:precios?|valores?|lista)\\b|\\b(?:precios?|valores?|lista)\\s+(?:\\S+\\s+)?nuev[oa]s?\\b' +
    '|\\bcapacidad\\s+(?:de\\s+)?(?:pago|compra|endeudamiento)\\b|\\bcapacidad\\s+economica\\b',
  'g'
);

function preguntaPorEstado(texto) {
  const t = normalizar(texto).replace(/\bde nuevo\b/g, ' ').replace(NO_ES_EL_ESTADO, ' ');
  if (!ESTADO_DEL_EQUIPO.test(t) && !USADO_O_NUEVO.test(t)) return false;
  if (/\b(?:catalogo|lista)\b/.test(t) || SU_EQUIPO.test(t)) return false;
  return t.includes('?') || !LO_CUENTA.test(t);
}

/**
 * Le da lo mismo sellado o usado (desde cero, segunda vuelta; decisión de Tomás del
 * 30/09/2026): nombra los dos juntos ("sellado o usado", "nuevo o usado", "ya sea sellado o
 * usados", "normal, sellado o usado") o pide un usado barato o económico ("¿tendrás algún
 * iPhone usado barato?"). No escala por D4: con un modelo va su ficha, sin modelo la lista
 * (responder.js). "¿Es usado o nuevo?" pregunta cuál de los dos es: sigue escalando.
 */
const LE_DA_LO_MISMO = new RegExp(
  '(?<!\\b(?:es|son|esta|estan|viene|vienen|seria|serian)\\s)\\b(sellad|nuev|usad)[oa]s?\\s+(?:o|u|y)\\s+(?!\\1)(?:sellad|nuev|usad)[oa]s?\\b' +
    '|\\busad[oa]s?\\b[^.?!\\n]{0,25}\\b(?:barat[oa]s?|economic[oa]s?)\\b|\\b(?:barat[oa]s?|economic[oa]s?)\\b[^.?!\\n]{0,15}\\busad[oa]s?\\b'
);

function leDaLoMismo(texto) {
  return LE_DA_LO_MISMO.test(normalizar(texto));
}

/** "¿Trabajan otras marcas o solo iPhone?" (segunda vuelta, 30/09/2026): escala con su motivo. */
const OTRAS_MARCAS =
  /\botras\s+marcas\b|\bmarcas\b[^.?!\n]{0,30}\bsolo\s+(?:iphone|apple)\b|\bsolo\s+(?:iphone|apple)\b[^.?!\n]{0,30}\bmarcas\b/;

function preguntaOtrasMarcas(texto) {
  return OTRAS_MARCAS.test(normalizar(texto));
}

/**
 * Pide que le guarden un equipo o ofrece una seña (bloque 8, decisión de Tomás del
 * 24/09/2026: no se pide seña ni adelanto). Sobre el mensaje crudo, lea lo que lea
 * Gemini: "te transfiero 100 así me lo guardás" también trae un monto. "Adelanto" solo
 * como sustantivo: "te adelanto que paso mañana" no ofrece nada.
 */
const PIDE_GUARDAR =
  /\b(me|nos) (lo|la) (podes |puede |pueden |podrias |podrian )?(guard|reserv|apart)\w*|\b(guardamelo|guardamela|reservamelo|reservamela|apartamelo|apartamela|reservame|apartame)\b|\b(sena|senas|senar\w*|senia|seniar\w*)\b|\b(un|de|el|del|como) adelanto\b/;

function pideGuardar(texto) {
  return PIDE_GUARDAR.test(normalizar(texto));
}

/**
 * Avisa que llegó al local, o que está llegando (bloque 10, ejemplo aprobado "Estoy acá ya
 * creo"): "ya llegué", "estoy afuera", "estoy en la puerta", "estoy acá", "estoy
 * llegando". Lo atiende una persona. No cuentan el subjuntivo ni una entrega: "a que
 * llegue el 18" (registro real), "cuando me llegue la plata", "te aviso cuando estoy
 * llegando" (registro real), "si llegué a juntar", "ya llego a 300?". "Estoy acá en
 * Neuquén" dice dónde vive, no que llegó.
 */
const LLEGO_AL_LOCAL = new RegExp(
  // "estoy aca", "estoy afuera", "estamos en la puerta"; no "estoy aca en neuquen", "estoy afuera de la ciudad"
  '\\b(?:estoy|estamos)\\s+(?:aca|aqui|afuera|abajo|en la puerta|en el local|en la entrada)\\b(?!\\s+de\\b)(?!\\s+en\\s+(?!(?:el local|la puerta|la entrada|la esquina)\\b))' +
    // "ya llegue", "llegue amigo", "recien llegamos"
    '|(?<!\\b(?:que|cuando|si|hasta|apenas|ojala|no|ni|me|te|le|nos|les|lo|la)\\s)\\b(?:llegue|llegamos)\\b(?!\\s+a\\s+(?:juntar|tener|reunir|un|una|los|las|la|\\$?\\d))' +
    // "estoy llegando", "ya llego"; no "te aviso cuando estoy llegando" (registro real)
    '|(?<!\\bcuando\\s)\\b(?:estoy|estamos|voy|vamos)\\s+llegando\\b|\\b(?:ya|ahi)\\s+llego\\b(?!\\s+a\\b)' +
    // Ya viene en camino (desde cero, 29/09/2026): "yendo", "ya salgo / ya salimos para allá",
    // "estamos por salir", "estoy en camino", "esperando el uber", "ya voy", y "afuera" como
    // mensaje entero. "Ya voy a juntar la plata" no.
    // Segunda vuelta (30/09/2026): "yendo" no es "¿cómo vas yendo?" ni "me estoy yendo a
    // trabajar"; "ya voy" no es "ya voy juntando la plata". Sí "estoy saliendo".
    '|(?<!\\bcomo\\s+(?:vas|van|venis|vienen|va)\\s)\\byendo\\b(?!\\s+(?:a|al|para|pa)\\s+(?!(?:alla|aya|ahi|el local|tu local|lo de ustedes)\\b))' +
    '|\\bya\\s+(?:salgo|salimos|sali)\\b|\\b(?:estoy|estamos)\\s+(?:por\\s+salir|saliendo)\\b' +
    // "estoy en camino", "ya en camino", "en camino" solo; no "la plata ya está en camino".
    '|\\b(?:estoy|estamos|voy|vamos)\\s+(?:\\S+\\s+)?en\\s+camino\\b|\\b(?:ya|ahi)\\s+(?:(?:estoy|estamos|voy|vamos)\\s+)?en\\s+camino\\b|^[^a-z0-9]*en\\s+camino[^a-z0-9]*$' +
    '|\\besperando\\s+(?:el\\s+|al\\s+|un\\s+|una\\s+)?(?:uber|cole|colectivo|taxi|remis|bondi|didi|cabify)\\b|\\bya\\s+voy\\b(?!\\s+(?:a\\b|\\w+ndo\\b))|^[^a-z0-9]*afuera[^a-z0-9]*$' +
    // "ya estoy" como mensaje entero, y "en 5 minutos estoy", "en 10 llego" (segunda vuelta).
    '|^[^a-z0-9]*(?:ya\\s+(?:estoy|estamos)|(?:estoy|estamos)\\s+ya)[^a-z0-9]*$' +
    "|\\ben\\s+(?:\\d{1,2}|un|unos|cinco|diez|quince|veinte|media)\\s*(?:min\\w*|minutitos?|')?\\s+(?:estoy|estamos|llego|llegamos)\\b"
);

/**
 * Un día o una hora a futuro no es llegar ahora (segunda vuelta, 30/09/2026): "el sábado ya
 * voy", "mañana paso", "ya salí del laburo, mañana paso", "a las 18 ya salgo". Eso es un turno.
 */
const A_FUTURO =
  /\b(?:manana|pasado|lunes|martes|miercoles|jueves|viernes|sabado|domingo|finde|fin de semana|semana que viene|proxima semana|mes que viene|a la tarde|a la noche|mas tarde|a las \d{1,2}|a eso de|despues de las|a partir de las)\b/;

function llegoAlLocal(texto) {
  const t = normalizar(texto);
  return LLEGO_AL_LOCAL.test(t) && !A_FUTURO.test(t);
}

/**
 * El mensaje es solo su nombre (bloque 10, ejemplo aprobado "Mi nombre es Oriana"): "soy
 * Oriana", "me llamo Dario", "carlos vizzioli me llamo" (registro real), con un saludo
 * adelante o no. Con algo más ("soy Oriana, tenés el 13?") no. "Soy de Cipolletti", "soy
 * nueva" o "soy cliente" no son nombres. Si escala lo decide responder.js: solo con una
 * charla en curso (decisión de Tomás del 25/09/2026).
 */
const NO_ES_NOMBRE = new Set(
  'de del la el los las un una uno yo tu su nuevo nueva nuevos cliente clienta estudiante amigo amiga el que la que re muy mas bastante consumidor vecino vecina iphone'.split(' ')
);
const NOMBRE = '([a-z]{2,}(?:\\s+[a-z]{2,})?)';
const PRESENTACION = new RegExp(
  `^(?:(?:hola+|buenas|buen dia|buenos dias|buenas tardes|buenas noches)[\\s,!.]*)?(?:(?:mi nombre es|me llamo|soy)\\s+${NOMBRE}|${NOMBRE}\\s+me llamo)[\\s.!]*$`
);

function soloDiceSuNombre(texto) {
  const m = normalizar(texto).trim().match(PRESENTACION);
  if (!m) return false;
  return (m[1] || m[2]).split(/\s+/).every((p) => !NO_ES_NOMBRE.has(p));
}

/**
 * Dice que va a venir, sin día (bloque 10, ejemplo aprobado "Un día de estos seguro me
 * pegue una vuelta"): "cualquier día de estos paso", "en la semana me doy una vuelta",
 * "algún día de estos me acerco", "me pego una vuelta". Se le cuenta que nos manejamos
 * con turnos. El día lo mira responder.js: con un día ("mañana me pego una vuelta") es
 * otro camino. "En estos días voy a juntar la plata" no es venir.
 */
const VUELTA = '(?:(?:me|nos)\\s+(?:pego|pegue|pegaria|pegamos|doy|de|daria|damos)|pegarme|darme|pegarnos|darnos|pegar|dar)\\s+(?:una|un)\\s+(?:vuelta|vueltita|salto|saltito|pasada)';
const VIENE = `(?:paso|pasamos|pasaria|me acerco|nos acercamos|me acercaria|caigo|caemos|(?:voy|vamos) a (?:pasar|ir|acercarme|acercarnos|caer)|${VUELTA})`;
const SIN_FECHA =
  '(?:un dia de estos|algun dia de estos|cualquier dia de estos|uno de estos dias|alguno de estos dias|en estos dias|estos dias|en la semana|en algun momento|algun dia|cuando pueda|cuando tenga (?:un )?(?:rato|tiempo)|proximamente)';
const VIENE_SIN_FECHA = new RegExp(
  `\\b${SIN_FECHA}\\b(?:\\s+\\S+){0,4}?\\s+${VIENE}\\b|\\b${VIENE}\\b(?:\\s+\\S+){0,4}?\\s+${SIN_FECHA}\\b|\\b${VUELTA}\\b`
);

function vieneSinFecha(texto) {
  return VIENE_SIN_FECHA.test(normalizar(texto));
}

/**
 * Muestra que no va a comprar (bloque 5b, decisión de Tomás del 16/09/2026). Vale
 * mientras el bot insiste con la entrega inicial: con un rechazo se salta al último
 * paso (recargo o alternativa) en vez de insistir otra vez. Sobre el mensaje crudo,
 * sin tildes. "no llego", "no tengo", "no me alcanza" y "cuánto le agrego" NO son
 * rechazo: son parte de la insistencia.
 *
 * Ajuste (16/09/2026): mientras se insiste había falsos positivos.
 *  - Con "?" no es rechazo, es seguir negociando: "te lo dejo en 290?", "está muy
 *    caro?", "entonces no se puede con 290?".
 *  - Un monto en el mensaje NO lo salva (ajuste del 17/09/2026, Tomás): "no gracias,
 *    tengo 290" se cotiza con esos 290, para no perder la venta por poca plata.
 *  - "paso" solo como mensaje entero, con "bueno/ok/dale/no/entonces" opcional
 *    adelante y "gracias" opcional atrás ("paso", "bueno paso", "no, paso gracias").
 *    "mañana paso", "hoy paso" y "después paso" es venir, no irse.
 *  - "lo dejo" / "dejalo" no cuentan con "te" adelante ("te lo dejo") ni seguidos de
 *    señado, reservado, apartado, anotado o para ("lo dejo señado").
 */
const RECHAZO =
  /\b(entonces no|no me interesa|muy caro|gracias igual|igual gracias|no,? gracias)\b|(?<!\bte )\b(lo dejo|dejalo)\b(?!\s+(?:senado|reservado|apartado|anotado|para)\b)|^(?:(?:bueno|ok|dale|no|entonces),?\s+)?paso(?:,?\s+gracias)?[\s.!]*$/;

function esRechazo(texto) {
  const t = normalizar(texto).trim();
  // Ajuste del 17/09/2026 (Tomás): si trae un monto nuevo, igual cuenta. El cliente
  // que se va o rechaza dando plata ("nos vemos el mes que viene, tengo 310.000")
  // tiene que recibir la cotización con ese monto, no una despedida. Solo las
  // preguntas siguen negociando ("se puede financiar igual?").
  if (t.includes('?')) return false;
  return RECHAZO.test(t);
}

/**
 * Se va, o lo va a pensar (Ajustes 2, decisión de Tomás del 17/09/2026): "te escribo
 * el mes que viene", "más adelante te escribo", "después te aviso", "lo pienso", "lo
 * voy a pensar", "cuando cobre te escribo", "lo veo y te aviso". Mientras el bot
 * insiste con la entrega cuenta como rechazo: salta al último paso (recargo o
 * alternativa) en vez de despedirse. Vale también con la intención `lo_piensa`, la
 * lea el extractor local o Gemini. Única excepción, igual que el rechazo: con "?"
 * no se va, sigue negociando ("tengo 300.000 se puede financiar igual?"). Un monto no
 * lo salva: con "nos vemos el mes que viene, tengo 310.000" se cotiza con ese monto.
 *
 * Tono 1b (decisión de Tomás del 17/09/2026): también volver **con un plazo lejano**
 * ("nos vemos el mes que viene", "paso el mes que viene", "vuelvo a fin de mes",
 * "cuando cobre paso"). Sin el plazo es un turno y sigue su camino: "nos vemos el
 * lunes", "paso hoy", "nos vemos a las 17" NO son irse. El plazo puede ir antes o
 * después del verbo, con alguna palabra en el medio.
 */
const VUELVE = '(?:nos vemos|te veo|paso|vuelvo|regreso)';
const PLAZO_LEJANO =
  '(?:el mes que viene|el mes proximo|mas adelante|a fin de mes|cuando cobre|cuando me paguen|en unos meses|el ano que viene)';
const SE_VA = new RegExp(
  '\\b(lo pienso|lo voy a pensar|lo veo y te aviso|te escribo|te aviso|mas adelante)\\b' +
    `|\\b${VUELVE}\\b[^.!?]{0,12}\\b${PLAZO_LEJANO}\\b` +
    `|\\b${PLAZO_LEJANO}\\b[^.!?]{0,12}\\b${VUELVE}\\b`
);

function seVa(texto, intencion) {
  const t = normalizar(texto).trim();
  // Ajuste del 17/09/2026 (Tomás): si trae un monto nuevo, igual cuenta. El cliente
  // que se va o rechaza dando plata ("nos vemos el mes que viene, tengo 310.000")
  // tiene que recibir la cotización con ese monto, no una despedida. Solo las
  // preguntas siguen negociando ("se puede financiar igual?").
  if (t.includes('?')) return false;
  return intencion === 'lo_piensa' || SE_VA.test(t);
}

/**
 * Un "no" solo ("no", "noo", "nop", "no, no"). Mientras el bot insiste con la
 * entrega es "sigue sin llegar", no un acuse que no se entiende (bloque 5b).
 */
const NEGACION_SUELTA = /^(no+|nop|no,?\s*no+)[\s.!]*$/;

function esNegacionSuelta(texto) {
  return NEGACION_SUELTA.test(normalizar(texto).trim());
}

/**
 * Ofrece su celular como parte de pago. "tomás usados" y "te dejo mi celular" se
 * sumaron en el bloque 5. Sobre el texto sin tildes.
 */
// Segunda vuelta (30/09/2026): "más plata por un X" salió de acá (ver `ofreceCanje`), "entregar"
// se mira sin lo que nos pide a nosotros (`sinPedidoDeEntrega`) y "entrego un/el X" se sumó.
const OFRECE_CANJE =
  /(plan canje|permuta|parte de pago|entrego mi|\bentrego (un|una|el) (iphone |ip |celu |celular )?(iphone|ip|celu|celular|1[1-8])\b|tomas mi|tomás mi|lo tom(as|an|arias|arian|aria)\b|canje|tomas usados|te dejo mi (celu|celular|iphone|ip\b|telefono|equipo|1[1-8]\b|x[rs]?\b)|cambiar mi (iphone|ip\b|celu|celular|telefono|equipo|1[1-8]\b)[^.?!\n]{0,40}\bpor (un|una|el)\b|\bentregar (un|una|mi|el) (iphone |ip |celu |celular )?(iphone|ip|celu|celular|1[1-8])\b|\b(un|una|mi|el) (iphone |ip )?1[1-8]( pro max| pro| plus| mini)?\b[^.?!\n]{0,25}\bpara (entregar|dar)\b)|(?<!(quemo|rompio|murio|cambio|cambiaron|anda|funciona)(\s+\S+){0,2}\s+)\bla placa\b/;

/**
 * Nos pide a nosotros que le entreguemos el equipo (desde cero, segunda vuelta, 30/09/2026):
 * "¿me podés entregar el 16?", "¿me podrían entregar el 16 hoy?", "¿para cuándo me entregás?",
 * "¿pueden entregarlo hoy?". No es un canje: "entregar" es canje solo si el que entrega es el
 * cliente ("te entrego mi 12", "te puedo entregar mi…", "entregar mi…", "tengo un 11 para
 * entregar", "¿se puede entregar un 16 pro?"). Se tapa antes de buscar el canje.
 */
const NOS_PIDE_ENTREGA =
  /\b(?:me|nos)\s+(?:(?:lo|la|los|las)\s+)?(?:(?:podes|podrias|podras|pueden|podrian|podran|puede|podria|podra|vas a|van a|va a)\s+)?entreg\w*|\b(?:podes|podrias|podras|pueden|podrian|podran)\s+entreg\w*|\bentreg(?:as|an|arias|arian|aras|aran|ues|uen)\b|\bentregar(?:me|nos|melo|mela|noslo|nosla)\b/g;

function sinPedidoDeEntrega(t) {
  return t.replace(NOS_PIDE_ENTREGA, ' ');
}

/**
 * ¿Ofrece su equipo como parte de pago? `OFRECE_CANJE` sobre el texto sin lo que nos pide
 * (`sinPedidoDeEntrega`), y "más plata por un X" solo si en el mensaje habla de su equipo ("mi",
 * "el mío", "tengo", o el modelo pegado: "el 15 pro más plata por un 16 pro"). Con un canje en
 * curso, "más plata" es del canje igual (`hablaDelCanje`). Segunda vuelta (30/09/2026): "¿y
 * cuánta más plata por un 15?" contestaba "tomamos celulares a partir del 11".
 */
const MAS_PLATA_POR = /\bmas plata por (?:un|una|el)\b/;
const HABLA_DE_SU_EQUIPO = /\b(?:mi|mis|el mio|la mia|tengo)\b/;

function ofreceCanje(texto) {
  const t = sinPedidoDeEntrega(normalizar(texto));
  if (OFRECE_CANJE.test(t)) return true;
  return MAS_PLATA_POR.test(t) && (HABLA_DE_SU_EQUIPO.test(t) || MODELO_MAS_PLATA.test(t));
}

/**
 * El equipo del canje en el texto (desde cero, 29/09/2026): el modelo pegado a "tengo",
 * "mi", "entrego", "dejo" ("mi celular iPhone 14", "tengo un 16 pro", "te dejo mi 15 pro",
 * "entregar un iPhone 16 pro"), o el que va antes de "más plata por" ("el 15 pro más plata
 * por un 16 pro"). Así no se confunde con el que quiere comprar. Hasta el 29/09 el primer
 * mensaje del canje solo tomaba lo que leía Gemini, que muchas veces lo dejaba vacío, y el
 * bot volvía a pedir el modelo y la batería que ya había dicho.
 */
const RELLENO_CANJE = '(?:(?:un|una|el|la|mi|iphone|ip|celu|celular|telefono|equipo|actual)\\s+){0,3}';
const MODELO_DEL_TEXTO = '(1[1-8]\\s*(?:pro\\s*max|pro|plus|mini)?|xr|xs\\s*max|xs|x|se|[6-8]\\s*plus|[6-8])';
const MODELO_ANCLADO = new RegExp(
  `\\b(?:tengo|tenia|mi|mis|entrego|entregar|entregaria|te dejo|dejo|el mio es)\\s+${RELLENO_CANJE}${MODELO_DEL_TEXTO}(?![0-9a-z])`
);
const MODELO_MAS_PLATA = new RegExp(`(?<![0-9a-z])${MODELO_DEL_TEXTO}\\s+(?:mas|\\+)\\s+(?:plata|efectivo)\\b`);
// Lo que viene después del equipo que entrega: el que quiere comprar ("por un 15", "para el 13").
const LO_QUE_QUIERE = /\b(?:por (?:un|una|el|la)|para (?:el|un|una|la|sacar|comprar|llevarme)|quiero|queria|busco|buscaba|me interesa)\b|\n/;

/** { modelo, capacidad_gb, bateria } del equipo que ofrece en el canje, o {} si el texto no lo nombra. */
function datosDelCanjeEnTexto(texto) {
  const t = sinPedidoDeEntrega(normalizar(texto));
  const m = t.match(MODELO_ANCLADO) || t.match(MODELO_MAS_PLATA);
  if (!m) return {};
  const modelo = extraerModelo('iphone ' + m[1]);
  if (!modelo) return {};
  let resto = t.slice(m.index);
  const corte = resto.slice(m[0].length).search(LO_QUE_QUIERE);
  if (corte >= 0) resto = resto.slice(0, m[0].length + corte);
  return { modelo, capacidad_gb: extraerCapacidad(resto), bateria: extraerBateria(resto) };
}

/**
 * ¿El mensaje habla del canje en curso? (desde cero, D2, decisión de Tomás del 29/09/2026).
 * Nombra el canje o su equipo ("el mío", "mi celu", "parte de pago"), pregunta cuánto se lo
 * toman o la diferencia ("¿cuánto me tomás?", "¿y el resto?", "¿lo que tengo que poner?").
 * Lo demás ("¿en qué precio está el 14 Pro?", "¿tenés stock del 17 Pro?", "cuando tenga la
 * plata te aviso") no es del canje: sigue el flujo normal y el canje queda pendiente.
 */
const HABLA_DEL_CANJE = new RegExp(
  '\\b(?:canje\\w*|permuta|parte de pago|entrego|entregar|entregaria|te dejo|dejo mi|el mio|la mia' +
    '|mi (?:iphone|ip|celu|celular|telefono|equipo)|(?:me |te |lo |la )?(?:tomas|toman|tomarias|tomarian|tomaria|tomando|tomes)' +
    '|cuanto (?:me )?(?:das|dan|darias|darian|pagas|pagan)|diferencia|el resto' +
    '|(?:lo que|cuanto) (?:tengo|tendria|tendre) que (?:dar|poner|agregar|pagar|abonar)|poner plata|cuanto pondria' +
    '|cuanto (?:le )?(?:agrego|pongo)|mas plata|la placa' +
    // "lo quería cambiar por el 16", "si nosotros entregamos los dos" (C55T6).
    '|cambiar(?:lo|la)? por|entregamos|entregariamos|entregaremos' +
    // Cuenta cómo está el suyo: "no tiene detalles digamos", "buenas condiciones" (C15T4, C73T3).
    '|(?:no tiene|sin)\\s+(?:ningun\\s+|ni un\\s+|nada de\\s+)?(?:detalles?|rayon\\w*|rayas?|golpes?|marcas?)' +
    '|buenas condiciones|buen estado' +
    // Manda las fotos que le pedimos, o pregunta cuáles: "te mando las fotos", "ahí van", "fotos?".
    '|(?:te |le )?(?:mando|paso|envio|mande|pase|envie)\\s+(?:las |unas |los |unos )?(?:fotos?|ftos?|fts?|fotitos?|videos?)' +
    '|ahi van)\\b'
);

// Segunda vuelta (30/09/2026): lo que nos pide ("¿me podés entregar el 13?") no habla del canje,
// y un Android u otra marca sí (D3 con el canje en curso: "es un samsung s21" lo cierra).
function hablaDelCanje(texto) {
  const t = sinPedidoDeEntrega(normalizar(texto));
  return HABLA_DEL_CANJE.test(t) || /^[^a-z0-9]*(?:fotos?|ftos?|fotitos?)[^a-z0-9]*$/.test(t) || OTRA_MARCA.test(t);
}

/**
 * Habla de vender el suyo, no de entregarlo (desde cero, 29/09/2026): "estoy viendo si vendo
 * mi celu actual", "tengo un celu, voy a ver si lo vendo". No es un canje. Salvo que pregunte
 * si se lo toman y venderlo sea el plan B: "no sé si aceptan el 11, si no tendría que ver dónde
 * venderlo" (C15T2) es un canje.
 */
function vendeElSuyo(texto) {
  const t = normalizar(texto);
  if (!/\b(?:vendo|vender|venderlo|venderla|vendiendo|venda|vendi)\b/.test(t)) return false;
  return !/\b(?:acept\w+|recib\w+|canje\w*|permuta|parte de pago|(?:me|lo|la) tom(?:as|an|arias|arian|aria)|tom(?:an|arias|arian|aria))\b/.test(t);
}

/**
 * Un Android u otra marca (desde cero, D3, decisión de Tomás del 29/09/2026): Samsung,
 * Galaxy, "A54", "S24", Motorola, Xiaomi, Redmi… Como parte de pago no se toma: "solo
 * tomamos iphone del 11 en adelante", sin pedir datos y sin escalar.
 */
const OTRA_MARCA =
  /\b(?:samsung|galaxy|motorola|moto\s?(?:g|e|edge)\s?\d*|xiaomi|redmi|poco\s?[xfm]\d*|huawei|honor|oppo|realme|nokia|tcl|zte|alcatel|infinix|tecno|android|pixel)\b|\b[as]\d{2}\b/;

function esOtraMarca(texto) {
  return OTRA_MARCA.test(normalizar(texto));
}

/**
 * ¿El número que ocupa t[inicio, fin) es un modelo y no plata? "el 14 pro",
 * "iphone 13". Solo del 11 al 18 seguidos de una gama o después de "iphone".
 */
function pareceModelo(t, inicio, fin, n) {
  if (n < 11 || n > 18) return false;
  return /^\s*(pro|plus|mini)\b/.test(t.slice(fin)) || /\b(iphone|ip)\s*$/.test(t.slice(0, inicio));
}

/** "128gb", "el 13 de 256": la capacidad del equipo tampoco es plata. */
function pareceCapacidad(t, inicio, fin, n) {
  if (![64, 128, 256, 512].includes(n)) return false;
  return /^\s*(gb|g\b|gigas?)/.test(t.slice(fin)) || /\bde\s*$/.test(t.slice(0, inicio));
}

/** "un 13 del 2023", "año 2022": un año no es plata. (Ya viene sin tildes: "ano".) */
function pareceAnio(t, inicio, n) {
  return n >= 2007 && n <= 2039 && /\b(del|ano)\s*$/.test(t.slice(0, inicio));
}

/**
 * Tapa los teléfonos antes de buscar montos: 9 dígitos o más, el mismo criterio
 * que `sinDatosPersonales` en gemini.js (el tope de un precio acá son 7). Sin
 * esto "2995550000" se leía como una entrega de $2.995.550.
 */
function sinTelefonos(t) {
  return t.replace(/\+?\d[\d\s.()-]{7,}\d/g, (m) => ((m.match(/\d/g) || []).length >= 9 ? ' ' : m));
}

/**
 * "no llego a 700": 700 es el precio de algo que no le alcanza, no su plata, y
 * leerlo como entrega le inflaba el presupuesto. Con "mas de" es al revés: "no
 * llego a mas de 300" dice que 300 es su techo, y se lee. Sin negación ("llego
 * a 480") también se lee.
 *
 * Se tapa la frase con su monto, no el mensaje: "tengo 500, no llego a 700"
 * sigue dando 500.000.
 */
function sinTopeAjeno(t) {
  if (/\bmas de\b/.test(t)) return t;
  return t.replace(
    /\b(no|ni|tampoco|nunca)\s+llego\s+a\b(\s+(los|las)\b)?(\s*((\d+|medio|un)\s*palos?(\s*y\s*medio)?|\d{1,3}([.,]\d{3})+|\d+(\s*(mil|k\b|lucas))?))?/g,
    ' '
  );
}

/** Batería u hora: "90%", "90 de bateria", "bateria al 90", "18hs". */
function pareceOtraUnidad(t, inicio, fin) {
  return (
    /^\s*(%|por ?ciento|de bateria|hs\b|hrs\b)/.test(t.slice(fin)) ||
    /\bbateria\s*(al|de|en)?\s*$/.test(t.slice(0, inicio))
  );
}

/**
 * Un monto en dólares (bloque 10, decisión de Tomás del 25/09/2026): el número con
 * "dólares", "usd", "u$s", "us$" o "verdes" pegado, antes o después ("420 dólares",
 * "usd 500", "1k usd", "200 verdes"). No es una entrega en pesos: "tengo 420 dólares y el
 * resto en pesos" se leía como $420.000 y así salía en el aviso al grupo. No se convierte
 * ni se cotiza nada.
 */
const MONEDA_DOLAR = '(?:dolar(?:es)?|usd|u\\$s|us\\$|verdes)';
const NUMERO_DOLARES = '(\\d{1,3}(?:[.,]\\d{3})+|\\d+)\\s*(k|mil)?';
const MONTO_DOLARES = new RegExp(
  `(?<![a-z0-9])${NUMERO_DOLARES}\\s*${MONEDA_DOLAR}(?![a-z0-9])|(?<![a-z0-9])${MONEDA_DOLAR}\\s*${NUMERO_DOLARES}(?![a-z0-9])`
);

/** El monto en dólares del mensaje, en dólares (420, 1500), o null. El primero, si hay varios. */
function montoEnDolares(texto) {
  const m = normalizar(texto).match(MONTO_DOLARES);
  if (!m) return null;
  const n = parseInt((m[1] || m[3]).replace(/[.,]/g, ''), 10) * (m[2] || m[4] ? 1000 : 1);
  return n > 0 ? n : null;
}

/** El texto sin sus montos en dólares: lo que queda se lee como pesos. */
function sinDolares(t) {
  return t.replace(new RegExp(MONTO_DOLARES.source, 'g'), ' ');
}

/**
 * Entrega partida por forma de pago (muestra de repro-v1, #154; decisión de Tomás del
 * 28/09/2026): "tengo 180 en efectivo y 120 en transferencia" son $300.000, no $180.000.
 * Se suman los montos en pesos SOLO si cada uno va atado a una forma de pago, pegada antes
 * o después del número: efectivo, cash, billete(s), transferencia ("transf", "transfe"),
 * mercado pago, mercadopago, mp ("180 en efectivo", "120 por transferencia", "150 cash",
 * "efectivo 180", "100 por mp"). Los formatos son los de `montoEn`: "180", "180 mil",
 * "180k", "180 lucas", "180.000". Con un solo monto atado, o con montos sin forma de pago
 * ("180 y 120", "tengo 400 y me estiro a 550"), no hay suma: sigue lo de siempre. Los
 * dólares quedan afuera antes (`sinDolares`): "300 usd y 85 mil en efectivo" no suma nada.
 * Con una palabra de corrección gana la corrección, como hoy (`extraerMonto`).
 */
const FORMA_DE_PAGO = '(?:efectivo|cash|billetes?|transf[a-z]*|mercado ?pago|mp)';
const NUMERO_PESOS = '(\\d{1,3}(?:\\.\\d{3})+|\\d{5,7}|\\d{2,4})\\s*(mil|k|lucas)?';
const MONTO_CON_FORMA = new RegExp(
  `(?<![a-z0-9.,])${NUMERO_PESOS}\\s*(?:en|por|de|con|x)?\\s+${FORMA_DE_PAGO}(?![a-z0-9])` +
    `|(?<![a-z0-9])${FORMA_DE_PAGO}\\s*(?:de|:)?\\s*${NUMERO_PESOS}(?![a-z0-9.,])`,
  'gd'
);

/** Un tramo de la entrega partida, en pesos, o null si no parece plata (mismos rangos que `montoEn`). */
function montoDelTramo(numero, sufijo) {
  const n = parseInt(numero.replace(/\./g, ''), 10);
  if (sufijo) return n * 1000 >= 50000 && n * 1000 <= 5000000 ? n * 1000 : null;
  if (numero.includes('.') || n >= 50000) return n >= 50000 && n <= 5000000 ? n : null;
  return n >= 50 && n <= 3000 ? n * 1000 : null;
}

/** La suma de los tramos atados a una forma de pago, si hay dos o más. Sobre el texto ya preparado. */
function sumaPartida(t) {
  const tramos = [];
  for (const m of t.matchAll(MONTO_CON_FORMA)) {
    const numero = m[1] || m[3];
    const [inicio, fin] = m.indices[1] || m.indices[3];
    const n = parseInt(numero.replace(/\./g, ''), 10);
    if (pareceModelo(t, inicio, fin, n) || pareceCapacidad(t, inicio, fin, n)) continue;
    const monto = montoDelTramo(numero, m[2] || m[4]);
    if (monto) tramos.push(monto);
  }
  return tramos.length >= 2 ? tramos.reduce((a, b) => a + b, 0) : null;
}

/** La entrega partida del mensaje ("180 en efectivo y 120 en transferencia" -> 300000), o null. */
function entregaPartida(texto) {
  return sumaPartida(sinTopeAjeno(sinTelefonos(sinDolares(normalizar(texto)))));
}

/**
 * "250", "250 mil", "250k", "250.000", "1 palo", "medio palo" -> número en pesos.
 *
 * Con una palabra de corrección ("perdón, 500") gana el último monto: se lee lo que
 * sigue a la última palabra que tenga un monto después (bloque 5). Sin ellas, el
 * primero, como siempre. Un monto en dólares no es plata en pesos (bloque 10). Una entrega
 * partida por forma de pago se suma (`entregaPartida`, 28/09/2026).
 */
function extraerMonto(texto) {
  const t = sinTopeAjeno(sinTelefonos(sinDolares(normalizar(texto))));
  const correcciones = [...t.matchAll(CORRECCIONES)].reverse();
  for (const c of correcciones) {
    // La entrega partida también con una corrección (desde cero, D12, 29/09/2026): "perdón,
    // 180 en efectivo y 120 por transferencia" son $300.000, igual que sin el "perdón".
    const lo = t.slice(c.index);
    const corregido = sumaPartida(lo) || montoEn(lo, { contexto: true, sinCapacidades: true });
    if (corregido) return corregido;
  }
  return sumaPartida(t) || montoEn(t, { contexto: CONTEXTO_ENTREGA.test(t) });
}

/**
 * ¿Habla de SU plata? (desde cero, D9, 29/09/2026) "tengo", "cuento con", "entrego", "con 520
 * me alcanza", o una entrega partida por forma de pago. Un monto así es su entrega, aunque
 * el mensaje tenga un "?" y el monto se parezca al precio ("tenés el 11? tengo 150 cash y
 * 100 por mp"): no es "¿está a 800 mil?".
 *
 * Segunda vuelta (30/09/2026): también "doy", "pongo", "abono", "pago", "si te doy / paso /
 * dejo", "¿cuánto me queda(n)?" y las cuotas: "¿cuánto me queda si abono 790?" es su entrega,
 * no una pregunta por el precio. "Con 250" a secas sigue sin leerse (decisión del 28/09).
 */
const SU_PLATA_EN_PREGUNTA =
  /\b(?:doy|pongo|abono|pago|te paso|te dejo)\b|\bsi te (?:doy|paso|dejo|pongo)\b|\bcuanto me (?:queda|quedan|quedaria|quedarian)\b|\bcuotas?\b/;

function hablaDeSuPlata(texto) {
  const t = normalizar(texto);
  return CONTEXTO_ENTREGA.test(t) || Boolean(entregaPartida(texto)) || CORRECCION.test(t) || SU_PLATA_EN_PREGUNTA.test(t);
}

/** ¿El mensaje corrige el monto? ("perdón", "me equivoqué", "en realidad"…) */
function esCorreccion(texto) {
  return Boolean(normalizar(texto).match(CORRECCION));
}

/**
 * El monto de un texto ya normalizado. `contexto`: se puede leer un número pelado
 * ("tengo 250"). `sinCapacidades`: 128, 256 y 512 pelados no son plata.
 */
function montoEn(t, { contexto, sinCapacidades = false }) {
  // "medio palo" es 500.000. Antes la regex agarraba "palo" sin número
  // adelante, suponía 1 y daba un millón.
  const palos = t.match(/(?:(\d+)|\b(medio))?\s*palos?(\s*y\s*medio)?/);
  if (palos) {
    if (palos[2]) return 500000;
    const cant = parseInt(palos[1] || '1', 10);
    return cant * 1000000 + (palos[3] ? 500000 : 0);
  }

  // 250.000 / 250000 / 250,000
  let m = t.match(/(\d{1,3}(?:[.\s]\d{3})+|\d{6,7})/);
  if (m) {
    const n = parseInt(m[1].replace(/[.\s]/g, ''), 10);
    if (n >= 50000 && n <= 5000000) return n;
  }

  // 250 mil / 250mil / 250k / 250 lucas
  m = t.match(/(\d{2,4})\s*(mil|k\b|lucas)/);
  if (m) {
    const n = parseInt(m[1], 10) * 1000;
    if (n >= 50000 && n <= 5000000) return n;
  }

  // "tengo 250" a secas, solo si hay contexto de entrega. Se prueban TODOS los
  // números: antes se frenaba en el primero, y "quiero el 14 pro, tengo 520"
  // agarraba el 14, lo descartaba por chico y nunca llegaba al 520.
  // Con piso y techo ("tengo 400 y me estiro a 550") gana el primero: se cotiza
  // con el piso. Es una decisión, no un descuido.
  if (contexto && !/(%|bateria|batería)/.test(t)) {
    for (const c of t.matchAll(/\b\d{2,4}\b/g)) {
      const n = parseInt(c[0], 10);
      const fin = c.index + c[0].length;
      if (pareceModelo(t, c.index, fin, n) || pareceCapacidad(t, c.index, fin, n)) continue;
      if (sinCapacidades && CAPACIDADES_SUELTAS.includes(n)) continue;
      if (pareceAnio(t, c.index, n)) continue;
      // 250 -> 250000
      if (n >= 50 && n <= 3000) return n * 1000;
    }
  }
  return null;
}

/**
 * Un mensaje que es solo un número: "500", "500k", "500 mil", "500.000" (bloque 5,
 * decisión de Tomás del 16/09/2026). Devuelve pesos o null. Acá se mira solo la
 * forma y el rango: entre 100 y 3.000 (en miles) o entre 100.000 y 3.000.000, y
 * nunca 128, 256 ni 512 pelados. Si vale como entrega lo decide responder.js:
 * solo después de una cotización o de la pregunta por la entrega.
 */
function montoSuelto(texto) {
  const t = normalizar(texto).trim().replace(/[!?\s]+$/, '').replace(/\.$/, '');
  const m = t.match(/^(\d{1,3}(?:\.\d{3})+|\d+)\s*(k|mil)?$/);
  if (!m) return null;
  const conPuntos = m[1].includes('.');
  const n = parseInt(m[1].replace(/\./g, ''), 10);
  if (!m[2] && !conPuntos && CAPACIDADES_SUELTAS.includes(n)) return null;
  if (m[2] || (!conPuntos && n <= 3000)) return n >= 100 && n <= 3000 ? n * 1000 : null;
  return n >= 100000 && n <= 3000000 ? n : null;
}

/**
 * Un mensaje que es solo un número de hasta tres cifras, con o sin "%" y con o sin "?"
 * ("90", "90%", "90?"), o null (muestra de repro-v1, #368; decisión de Tomás del
 * 28/09/2026). "90 mil", "90k" y "90 lucas" no entran: esos son plata (`montoSuelto`).
 */
function numeroSuelto(texto) {
  const m = normalizar(texto).trim().match(/^(\d{1,3})\s*(%)?\s*[?.!]*$/);
  return m ? { n: parseInt(m[1], 10), porcentaje: Boolean(m[2]) } : null;
}

/**
 * "90", "90%" o "90?" solos: la batería de su equipo, si es un número de 50 a 100. Si viene
 * al caso lo decide responder.js: se la acaban de preguntar, o hay un canje en curso sin
 * batería. Devuelve el porcentaje o null.
 */
function bateriaSuelta(texto) {
  const s = numeroSuelto(texto);
  return s && s.n >= 50 && s.n <= 100 ? s.n : null;
}

/**
 * Un número solo menor a 100, sin "mil", "k" ni "lucas" ("90", "45?"): nunca es una entrega,
 * lea lo que lea Gemini. Es el mismo piso que `montoSuelto`.
 */
function numeroChicoSuelto(texto) {
  const s = numeroSuelto(texto);
  return Boolean(s && s.n < 100);
}

/**
 * Un número menor a 100 nunca es una entrega, tampoco adentro de una frase (desde cero, D9,
 * decisión de Tomás del 29/09/2026): "hasta el domingo tenía 78" no son $78.000 (la entrega
 * mínima más baja de la planilla es $170.000). Salvo que venga con "mil", "k", "lucas",
 * "palo(s)" o "millón": "80 mil" sí es plata. ¿La entrega leída sale de un número así?
 * Una entrega grande también, si en el mensaje no hay ningún número de 100 para arriba ni
 * esas palabras: "para el mes que viene tengo, eso de 10 o 11" no es $1.100.000 (C51T3).
 */
function entregaDeNumeroChico(texto, entrega) {
  if (!entrega) return false;
  if (entrega >= 100000) return soloNumerosChicos(texto);
  const n = entrega >= 1000 ? entrega / 1000 : entrega;
  const t = normalizar(texto);
  for (const m of t.matchAll(/(?<![\d.,])(\d{1,2})(?![\d]|[.,]\d{3}|\s*(?:mil|k\b|lucas|palos?|millon(?:es)?))/g)) {
    if (Number(m[1]) === n) return true;
  }
  return false;
}

/**
 * ¿Tiene números y son todos de una o dos cifras, sin "mil", "k", "lucas", "palo(s)" ni "millón"?
 * Segunda vuelta (30/09/2026): el número del modelo no cuenta (del 11 al 18 pegado a "iphone",
 * "ip", "el", "un", "pro", "max", "plus", "mini", o que lee `extraerModelos`), y con un monto en
 * letras ("quinientos", "trescientos cincuenta") la regla no se aplica: "hola quiero el 14 pro,
 * tengo quinientos" es $500.000, no un número chico.
 */
const MONTO_EN_LETRAS =
  /\b(?:cien|ciento|doscient[oa]s|trescient[oa]s|cuatrocient[oa]s|quinient[oa]s|seiscient[oa]s|setecient[oa]s|ochocient[oa]s|novecient[oa]s)\b/;

function soloNumerosChicos(texto) {
  const t = sinTelefonos(normalizar(texto));
  if (/\b(?:mil|k|lucas?|palos?|millon(?:es)?|m)\b|\d(?:k|m)\b/.test(t)) return false;
  if (MONTO_EN_LETRAS.test(t)) return false;
  const modelos = extraerModelos(texto).map((m) => parseInt(m, 10));
  const esModelo = (m) => {
    const n = Number(m[0]);
    if (!/^1[1-8]$/.test(m[0])) return false;
    const antes = t.slice(0, m.index);
    const despues = t.slice(m.index + m[0].length);
    return /\b(?:iphone|ip|el|un)\s*$/.test(antes) || /^\s*(?:pro|max|plus|mini)\b/.test(despues) || modelos.includes(n);
  };
  const numeros = [...t.matchAll(/\d+(?:[.,]\d+)*/g)].filter((m) => !esModelo(m));
  return numeros.length > 0 && numeros.every((m) => /^\d{1,2}$/.test(m[0]));
}

/**
 * ¿Trae el mensaje un número que podría ser plata, aunque no se haya podido
 * leer como entrega? Suelto entre 50 y 3000 ("y con 610 cuanto me queda?") o más de
 * 50.000. No cuentan modelos, capacidades, batería, horas, años, teléfonos ni
 * el precio ajeno de un "no llego a 700".
 *
 * Lo usa la guarda de `decidir`: si hay un número así, no se leyó ninguna
 * entrega y hay una guardada, cotizar con la guardada es cotizar con un dato
 * que el cliente quizás acaba de cambiar.
 */
function mencionaPosibleMonto(texto) {
  const t = sinTopeAjeno(sinTelefonos(normalizar(texto)));
  for (const c of t.matchAll(/\d{1,3}(?:[.,]\d{3})+|\d+/g)) {
    const n = parseInt(c[0].replace(/[.,]/g, ''), 10);
    const fin = c.index + c[0].length;
    if (pareceModelo(t, c.index, fin, n) || pareceCapacidad(t, c.index, fin, n)) continue;
    if (pareceOtraUnidad(t, c.index, fin) || pareceAnio(t, c.index, n)) continue;
    if ((n >= 50 && n <= 3000) || n > 50000) return true;
  }
  return false;
}

/**
 * Los anteriores al 11 que se leen solo con "iphone" o "ip" delante (bloque 8, decisión
 * de Tomás del 24/09/2026): sueltos, "el 8" o "se" son cualquier cosa ("se me apagó").
 * El SE, además, solo si lo que sigue no es otra palabra ("iphone se?", "iphone se
 * 2020", "iphone se de 64"): "mi iphone se trabó" no es un SE.
 */
const SOLO_CON_IPHONE = ['8 plus', '8', '7 plus', '7', 'se'];
const SIGUE_AL_SE = '(?=\\s*(?:$|[?!.,;:)]|\\d|(?:de|del)\\s+\\d|(?:y|o)\\s|segunda|tercera|2da|3ra|gen))';

/**
 * La "x" es un iPhone X solo con "iphone", "ip", "el", "un", "tenes" o "tienen" delante,
 * o si el mensaje es solo eso ("x?", "iphone x"). Suelta es "por": en el registro real,
 * 11 mensajes como "2 x 45", "x favor" o "x dnd venis" escalaban con "ese justo no me
 * esta quedando" (bloque 8).
 */
const X_CON_ALGO_DELANTE = /(?:^|[^0-9a-z])(?:iphone|ip|el|un|tenes|tienen)\s+x(?![0-9a-z])/;
const SOLO_X = /^[^0-9a-z]*(?:(?:iphone|ip)\s*)?x[^0-9a-z]*$/;

/**
 * Del 11 al 18 como fecha, edad u hora (desde cero, segunda vuelta, 30/09/2026): seguido de
 * "años", "de <mes>", "cuotas", "hs", "horas" o "hrs", o después de "a las", "cobro el", "me
 * pagan el", "te pago el", "pago el", "hasta el", "el día", "a partir del" o "a partir de los".
 * "Tengo 18 años" o "cobro el 18 y paso" contestaban "el 18 no me está quedando". Con la gama
 * pegada ("hasta el 14 pro") sigue siendo un modelo.
 */
const MESES = 'enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|setiembre|octubre|noviembre|diciembre';
const NO_ES_MODELO_DESPUES = new RegExp(`\\b1[1-8]\\s*(?:anos|anitos|de (?:${MESES})|cuotas|hs|horas?|hrs)\\b`, 'g');
const NO_ES_MODELO_ANTES =
  /\b(?:a las|cobro el|me pagan el|te pago el|pago el|hasta el|el dia|a partir del|a partir de los)\s+1[1-8]\b(?!\s*(?:pro|plus|mini|max)\b)/g;

function extraerModelos(texto) {
  const conIphone = normalizar(texto)
    // "a las 16" o "16hs" es una hora, no un iPhone 16. Sin esto, "puedo pasar
    // mañana a las 16?" dejaba anotado un 16 y así le llegaba al grupo. "cerca de las
    // 14" y "de las 16 en adelante" también (bloque 8).
    .replace(/\b(a|de|para|desde|hasta|despues de|antes de|cerca de|sobre|tipo) las \d{1,2}\b/g, ' ')
    .replace(/\b\d{1,2} ?(hs|hrs)\b/g, ' ')
    .replace(NO_ES_MODELO_DESPUES, ' ')
    .replace(NO_ES_MODELO_ANTES, ' ');
  const encontrados = [];
  let conPrefijo = conIphone;
  for (const m of SOLO_CON_IPHONE) {
    const re = new RegExp(`\\b(?:iphone|ip)\\s*${m.replace(/ /g, '\\s+')}(?![0-9a-z])${m === 'se' ? SIGUE_AL_SE : ''}`);
    if (re.test(conPrefijo)) {
      encontrados.push(m);
      conPrefijo = conPrefijo.replace(re, ' '); // para que "8 plus" no cuente además como "8"
    }
  }
  if (X_CON_ALGO_DELANTE.test(conIphone) || SOLO_X.test(conIphone.trim())) encontrados.push('x');

  const t = conPrefijo.replace(/\biphone\b|\bip\b/g, ' ');
  let resto = t;
  for (const m of MODELOS) {
    const re = new RegExp(`(^|[^0-9a-z])${m.replace(/ /g, '\\s+')}([^0-9a-z]|$)`);
    if (re.test(resto)) {
      encontrados.push(m);
      resto = resto.replace(re, ' '); // para que "13 pro" no cuente además como "13"
    }
  }
  return encontrados;
}

function extraerModelo(texto) {
  return extraerModelos(texto)[0] || null;
}

function extraerCapacidad(texto) {
  const t = normalizar(texto);
  const m = t.match(/\b(64|128|256|512)\s*(gb)?\b/);
  return m ? parseInt(m[1], 10) : null;
}

function extraerBateria(texto) {
  const t = normalizar(texto);
  const m = t.match(/\b(\d{2,3})\s*(%|por ?ciento|de bateria|de batería)/);
  if (m) {
    const n = parseInt(m[1], 10);
    if (n >= 50 && n <= 100) return n;
  }
  return null;
}

/**
 * Pedir turno o querer venir. Varias frases salen de registros reales de
 * septiembre de 2026 que se iban sin leer: "antes no tendrías un turnito?",
 * "o podemos ir mañana", "si puedo ir, me podrás atender?".
 * "puedo ir pagando" no es venir: por eso el gerundio queda afuera.
 * Segunda vuelta (30/09/2026): "¿me podés entregar el 16?", "¿me podrían entregar el 16 hoy?",
 * "¿para cuándo me lo entregás?" piden que se lo entreguemos, como "hacen entrega": un turno.
 */
/**
 * Nos pide que le entreguemos el equipo, con "entregar" como verbo y nosotros como sujeto:
 * "me lo podés entregar", "me lo entregás", "me lo entregan", "me lo podrían entregar hoy",
 * "para cuándo me podés entregar el 16". Es coordinar el turno. Arreglos en vivo (30/09/2026):
 * con Gemini estos mensajes venían como `consulta_general` y responder.js contestaba la
 * financiación, porque "entrega" también es la entrega inicial; se decide sobre el mensaje
 * crudo, lea lo que lea Gemini (`nosPideEntregar`). "La entrega" como sustantivo ("cómo es la
 * entrega", "de cuánto es la entrega"), "hacen entregas a domicilio" y "te entrego mi 12" no
 * entran: no llevan "me/nos" adelante del verbo.
 */
const NOS_PIDE_ENTREGAR = /\b(me|nos) (lo |la )?(podes |podrias |podras |pueden |podrian |podran )?entreg(ar|as|an|arias|arian)\b/;

function nosPideEntregar(texto) {
  return NOS_PIDE_ENTREGAR.test(normalizar(texto));
}

const PIDE_TURNO = new RegExp(
  '(turno|turnito|cuando puedo pasar|cuando puedo ir|(puedo|podemos) (ir|pasar)(?! \\w+ndo\\b)|puntos? de encuentro|me acerco|coordinar|nos vemos|te acercas|se acercan|hacen entrega|me (podes|podras|pueden|podran) atender|paso hoy|' +
    NOS_PIDE_ENTREGAR.source +
    ')'
);

function detectarIntencion(texto, tieneModelo, tieneMonto) {
  const t = normalizar(texto);

  // Postventa: hay un equipo YA comprado con un problema.
  const yaCompro = /(les compre|les compré|que compre|que compré|me vendieron|el celu que|el iphone que|compre ayer|compré ayer|lo compre|lo compré)/.test(t);
  const hayProblema = /(no anda|no funciona|falla|fallando|roto|se apaga|no carga|no me agarra|no agarra|sin señal|sin senal|problema|anda mal|se reinicia|se calienta|se va la|se corta|se cuelga|se traba|esta lento|está lento|se descarga)/.test(t);
  // "el iPhone ... se va" habla de un equipo que YA tiene
  const equipoPropio = /\b(el|mi) (iphone|celu|celular|equipo|telefono|teléfono)\b/.test(t);
  if (equipoPropio && /(se va|se corta|se apaga|no anda|anda mal|se cuelga|se traba|no carga|no agarra)/.test(t))
    return 'postventa';
  if (hayProblema && (yaCompro || /garantia|garantía/.test(t))) return 'postventa';
  if (/(garantia|garantía)\s*(del|de mi|de el)/.test(t)) return 'postventa';
  if (ofreceCanje(t))
    return 'permuta';
  // Preguntar dónde están o qué requisitos piden NO es pedir turno:
  // eso lo contesta el bot con los datos fijos.
  if (/(donde estan|dónde están|donde queda|direccion|dirección|ubicacion|ubicación|horario|hasta que hora|tarjeta|recibo de sueldo|requisito|garantia|garantía|envio|envío)/.test(t)
      && !PIDE_TURNO.test(t))
    return 'consulta_general';
  if (PIDE_TURNO.test(t))
    return 'pide_turno';
  if (/(lo quiero|me lo llevo|dale listo|lo compro|cerramos|de una|me interesa comprar)/.test(t))
    return 'quiere_avanzar';
  // Se disculpa, agradece o cierra la charla: son momentos de tono, no de venta
  // Con un monto no es una disculpa: "perdón, 500" corrige lo que dijo (bloque 5).
  if (!tieneMonto && /(disculp|perdon|perdón|molest|se me complic|no pude|me atras|atrasados con el pago|no me pagaron|estoy sin plata|no llego este mes)/.test(t))
    return 'se_disculpa';
  if (/^(muchas gracias|gracias|mil gracias|de 10|genial gracias|joya gracias)/.test(t) || /gracias por (la info|todo|la atencion|la atención|la paciencia)/.test(t))
    return 'agradece';
  // Un mensaje corto que es un modelo solo ("x?", "13?") se lee como ese modelo (bloque
  // 10): hasta entonces era "sin contenido" y contestaba "contame que estabas buscando".
  if (!tieneModelo && (t.replace(/[^a-z0-9]/g, '').length < 4 || /^[a-z]{1,3}$/.test(t.trim())))
    return 'sin_contenido';
  // Pide que se lo reserven: lo decide una persona
  if (/(me lo (podes |puede |pueden )?(guardar|reservar|apartar)|reservame|apartame|guardamelo|me lo guardas)/.test(t))
    return 'reserva';
  // Nombra una gama sin decir cuál
  if (/\b(el|un) (pro|pro max|plus|mini)\b/.test(t) && !/\d/.test(t)) return 'modelo_ambiguo';
  // Pide el más barato o el más caro
  if (/(mas barato|más barato|mas economico|más económico|el mas caro|más caro|el mejor que ten)/.test(t))
    return 'pide_extremo';
  // Se toma un tiempo para decidir: no se presiona, se deja la puerta abierta
  if (/(lo voy a pensar|lo pienso|te aviso|te escribo|cualquier cosa te|dejame ver|lo consulto|lo hablo con)/.test(t))
    return 'lo_piensa';

  // Propone él mismo cómo pagar: "te doy 50 ahora y el resto el 20"
  if (/(y el resto|y lo otro|y despues|y después|el resto (el|cuando|a fin)|cuando cobre|cuando me paguen|a fin de mes|en dos veces|mitad y mitad|mitad ahora|la mitad.*(ahora|hoy|al retirar|cuando))/.test(t))
    return 'propone_pago';
  // Le parece caro
  if (/(se me va|es caro|muy caro|carisimo|carísimo|no me alcanza|no llego|esta caro|está caro|fuera de mi presupuesto|mucha plata)/.test(t))
    return 'precio_alto';
  // "u$s" también (desde cero, C40T2, 29/09/2026).
  if (/(dolar|dólar|usd|u\$s|verdes|en dolares|en dólares)/.test(t)) return 'dolares';
  if (tieneMonto) return 'declara_entrega';
  if (/(precio|cuanto|cuánto|sale|vale|cotiza)/.test(t)) return 'consulta_precio';
  if (tieneModelo || /(tenes|tenés|hay|stock|disponible|queda)/.test(t)) return 'consulta_stock';
  if (/^(hola|buenas|buen dia|buen día|buenos dias|buenas tardes|buenas noches|hey)/.test(t))
    return 'saludo';
  return 'consulta_general';
}

function pareceIncoherente(t) {
  const limpio = t.replace(/[^a-z]/g, '');
  if (limpio.length < 3) return true;
  const vocales = (limpio.match(/[aeiou]/g) || []).length;
  if (vocales / limpio.length < 0.15) return true;      // "asdasd", "qwerty"
  if (/^(.)\1{3,}$/.test(limpio)) return true;          // "aaaaaa"
  return false;
}

function entender(mensaje) {
  const modelos = extraerModelos(mensaje);
  const modelo = modelos[0] || null;
  const entrega = extraerMonto(mensaje);
  const t = normalizar(mensaje);

  const ofrecePermuta = ofreceCanje(t);

  const incoherente = pareceIncoherente(t) && !modelo && !entrega;

  return {
    intencion: incoherente ? 'sin_contenido' : detectarIntencion(mensaje, !!modelo, !!entrega),
    modelo,
    modelos,
    capacidad_gb: extraerCapacidad(mensaje),
    entrega,
    permuta: ofrecePermuta
      ? {
          ofrece: true,
          modelo,
          capacidad_gb: extraerCapacidad(mensaje),
          bateria: extraerBateria(mensaje),
          tiene_fotos: false,
        }
      : { ofrece: false },
    forma_pago: /contado|efectivo|tra(?:n|s|ns)ferencia/.test(t)
      ? 'contado'
      : /cuota|financia/.test(t)
        ? 'cuotas'
        : /dolar|dólar|usd|u\$s/.test(t)
          ? 'dolares'
          : null,
    zona: null,
    timing: /hoy|ahora|ya mismo/.test(t) ? 'hoy' : /mañana|manana/.test(t) ? 'mañana' : null,
    urgente: /(hablar con|una persona|humano|reclamo|estafa)/.test(t),
    _ok: true,
    _fuente: 'local',
    _entregaFuente: entrega ? 'local' : null,
    nota: null, // sin IA no hay notas: el bot se comporta igual que antes
  };
}

module.exports = {
  entender,
  extraerMonto,
  esCorreccion,
  montoSuelto,
  pideDescuento,
  esRegateo,
  pideFotos,
  preguntaPorEstado,
  leDaLoMismo,
  preguntaOtrasMarcas,
  datosDelCanjeEnTexto,
  hablaDelCanje,
  vendeElSuyo,
  esOtraMarca,
  ofreceCanje,
  sinPedidoDeEntrega,
  nosPideEntregar,
  preguntaPorAccesorio,
  pideGuardar,
  llegoAlLocal,
  soloDiceSuNombre,
  vieneSinFecha,
  montoEnDolares,
  esRechazo,
  seVa,
  esNegacionSuelta,
  mencionaPosibleMonto,
  extraerModelo,
  extraerModelos,
  extraerCapacidad,
  extraerBateria,
  entregaPartida,
  bateriaSuelta,
  numeroChicoSuelto,
  entregaDeNumeroChico,
  hablaDeSuPlata,
};
