'use strict';
/**
 * El árbol de decisión. Acá se decide QUÉ se responde.
 * Regla de oro: todo lo que lleva un número sale de la planilla, nunca del modelo.
 */
const sheets = require('./sheets');
const fotos = require('./fotos');
const documentos = require('./documentos');
const acciones = require('./acciones');
const estilo = require('./estilo');
const gemini = require('./gemini');
const local = require('./extractor-local');
const temas = require('./temas');
const {
  cotizar,
  plantilla,
  plantillaVarias,
  alternativaMasBarata,
  pesos,
  descuentoPara,
  conDescuento,
  bateriaDe,
  esSellado,
} = require('./cotizador');
const { senalesDeVenta } = require('./resumen');
const state = require('./state');
const config = require('./config');
// Solo por `leLlegaAlCliente` (Pendientes 1, Parte A). No hay ciclo: evolution.js
// no requiere responder.js.
const evolution = require('./evolution');

const DATOS_FIJOS = {
  direccion: 'Belgrano 3090, Neuquén capital (el local figura como Somos Piedra)',
  turnos: 'nos manejamos con turnos para la atencion al cliente',
  // Cómo es la financiación: ya no es un texto fijo, es `explicaFinanciacion` en
  // estilo.js (bloque 3b), con variantes. Ver explicarFinanciacion.
  requisitos: 'no necesitas tarjeta de credito, es con tu dni y un compromiso de pago',
  garantia: 'todos los equipos tienen 1 mes de garantia',
  importados:
    'los equipos nos vienen asi cuando los importamos de estados unidos, si le cambiamos algo lo aclaramos antes de la venta',
  cuotas_desde:
    'las cuotas arrancan el mes que viene, no este mes',
  // Bloque 8 (decisiones de Tomás del 24/09/2026; negocio/medios-de-pago.md del Cortex).
  // Sin números: la cotización del dólar la da una persona.
  dolares: 'sii, aceptamos dolares, se toma la cotizacion del dia',
  mercadoPago: 'sii, podes pagar con mercado pago',
  sinSena: 'no hay drama, no pedimos seña',
  // Desde cero, D11 (decisión de Tomás del 29/09/2026): "¿son libres de iCloud?".
  icloud: 'sii, todos libres de icloud',
  // Segunda vuelta (decisión de Tomás del 30/09/2026): preguntado al revés ("¿están bloqueados
  // por iCloud?", "¿tiene iCloud?"), sin el "sii".
  icloudAlReves: 'todos libres de icloud',
  // "¿Están reportados?" (el IMEI con denuncia; decisión de Tomás del 30/09/2026: "tiene que
  // decir que no"). No es iCloud.
  noReportados: 'no, ninguno esta reportado',
  // Desde cero, D6 (decisión de Tomás del 29/09/2026): tarjeta de crédito o financiera.
  sinTarjeta: 'con tarjeta de credito no trabajamos, lo financiamos nosotros con tu dni y un compromiso de pago',
};

/**
 * Lo que se agrega al pasar precios cuando el cliente todavía no dijo cuánto
 * tiene: que hay más modelos que los que preguntó. Un solo texto para la lista,
 * un modelo y varios modelos (decidido con Tomás el 15/09/2026).
 *
 * CAMBIARLO ACÁ CUANDO CAMBIE EL STOCK. No sale de la planilla a propósito: el
 * más barato de LISTA no es el más viejo que hay (el 11 está en USADOS), y
 * calculado daba "del 13" en la lista y otro rango en el resto.
 */
// Desde cero, D8 (decisión de Tomás del 29/09/2026): del 11 al 18 Pro Max, fijo.
const RANGO_MODELOS = 'igualmente tenemos del 11 al 18 Pro Max';

/**
 * Los anteriores al 11 no se trabajan (bloque 8, decisión de Tomás del 24/09/2026): X,
 * XR, XS, XS Max, SE, y del 8 para atrás. Si los pide, "ese no lo trabajamos" y el rango,
 * sin números y sin escalar, AUNQUE la planilla tenga uno cargado (la copia del 08/09
 * tiene un XR en USADOS). Lo que el bot ofrece por su cuenta (la lista de unidades, el
 * más barato, la alternativa) no cambia: queda para otro bloque.
 */
function noSeTrabaja(modelo) {
  const m = normalizar(modelo).replace(/\b(iphone|ip)\b/g, ' ').replace(/\s+/g, ' ').trim();
  return /^(x|xr|xs|xs max|se\b.*|[4-8][sc]?( plus)?)$/.test(m);
}

/**
 * La planilla sin los modelos que no se trabajan (bloque 10, decisión de Tomás del
 * 25/09/2026): no pueden salir en nada que el bot ofrezca por su cuenta (la lista de
 * unidades, "el más económico", "otras opciones", la recomendación, "el mejor que te
 * llevas", la alternativa, "no me está quedando"), aunque estén cargados. Si el cliente
 * los pide, sigue "ese no lo trabajamos" (`noTrabajado` en `decidir`, antes de la planilla).
 */
async function leerPlanilla() {
  const datos = await sheets.leerTodo();
  const seTrabaja = (f) => !noSeTrabaja(f.modelo);
  return { ...datos, lista: (datos.lista || []).filter(seTrabaja), usados: (datos.usados || []).filter(seTrabaja) };
}

/**
 * Notas del cliente: lo que dijo y no entra en ningún campo ("es para su hija",
 * "se va de viaje el 20"). Sin esto se caía de las 15 líneas del historial.
 *
 * Son SOLO para redactar: enriquecen cómo se dice, nunca qué se decide. Ninguna
 * rama de `decidir` las mira. Sin Gemini vienen vacías y el bot se comporta
 * igual que antes.
 */
const MAX_NOTAS = 5;

/**
 * Lo que redactó Gemini, sin el saludo del principio ni los mensajes de puro relleno (desde
 * cero, grupo 10, 29/09/2026). Gemini arrancaba con "buenass" a mitad de charla (a un cliente
 * le llegó solo "Buenass") y partía la respuesta con "Tranqui" o "Quedo atento, dale joya". El
 * saludo del día lo pone `decidirYFormatear`. Devuelve las líneas que quedan.
 */
const SALUDO_AL_PRINCIPIO = /^\s*(?:buenas+|hola+|buen dia|buenos dias|buenas tardes|buenas noches)\b[\s,!.]*/;
const DE_RELLENO =
  /^(?:(?:tranqui|quedo atento|dale|joya|dale joya|perfecto|genial|de una|barbaro|sii+|cualquier cosa (?:avisame|me decis|escribime))[\s,.!]*)+$/;
/**
 * Una muletilla suelta pegada al final de una línea, después de un punto, una coma o un signo
 * (01/10/2026: "…lo financias en 1 o 2 cuotas. tranqui"). Se va con la coma; el punto o el signo
 * quedan. En el medio de la frase queda: "dale, te cuento…".
 */
const MULETILLA_AL_FINAL = /([.,;:!?…])\s*(?:dale joya|quedo atento|tranqui|perfecto|dale|sii+)[\s.,!]*$/i;
function sinMuletillaAlFinal(linea) {
  let l = linea;
  for (let antes = null; l !== antes; ) {
    antes = l;
    l = l.replace(MULETILLA_AL_FINAL, (m, signo) => (/[,;:]/.test(signo) ? '' : signo)).trim();
  }
  return l;
}

function limpiarRedactado(texto) {
  const lineas = String(texto || '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const out = [];
  for (let l of lineas) {
    if (!out.length) {
      const sin = normalizar(l).match(SALUDO_AL_PRINCIPIO);
      if (sin) l = l.slice(sin[0].length).trim();
    }
    l = sinMuletillaAlFinal(l);
    if (!l || DE_RELLENO.test(normalizar(l))) continue;
    out.push(l);
  }
  return out;
}

/** Le suma a la instrucción de `redactar` lo que contó el cliente, limpio. */
function conNotas(instruccion, ctx, nombre) {
  const notas = (ctx.notas || []).map((n) => gemini.notaSegura(n, nombre)).filter(Boolean);
  const extra = notas.length
    ? ` Para el tono, esto contó el cliente antes: ${notas.join('; ')}. Usalo solo si viene al caso, sin cambiar lo que hay que responder.`
    : '';
  return instruccion + extra;
}

/**
 * El nombre de pila para saludar, sacado del pushName de WhatsApp. Vacío si no
 * hay un nombre de verdad: mejor un saludo sin nombre que uno roto.
 *
 * El pushName es lo que cada uno se puso en su perfil y trae de todo. Con
 * pushNames reales salían "🇦🇷Rsss, como va todo?" (🇦🇷RSS), "Hhh" (HH), "Oo"
 * (O) o "~$hernann". Antes se tomaba la primera palabra tal cual. Ahora:
 *  - solo cuentan las letras: emojis, símbolos y números quedan afuera;
 *  - vale la primera palabra de 2 letras o más con alguna vocal que no sea una
 *    sola letra repetida. "HH", "RSS" u "O" no son nombres.
 */
function primerNombre(pushName) {
  if (!pushName) return '';
  const palabras = String(pushName).match(/[\p{L}\p{M}]{2,}/gu) || [];
  const nombre = palabras.find((p) => {
    const base = p.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
    return /[aeiou]/.test(base) && !/^(.)\1+$/.test(base);
  });
  return nombre ? [...nombre].slice(0, 20).join('') : '';
}

/**
 * Deformación cariñosa del nombre, tal como aparece en el corpus: se estira la
 * última letra. Se limpia adentro, así ningún llamador puede pasarle un
 * pushName crudo, y se cuenta por caracteres: estirando la última unidad de
 * texto, un emoji al final quedaba partido y salía un carácter roto.
 */
function deformar(nombre) {
  const limpio = primerNombre(nombre);
  if (!limpio) return '';
  const letras = [...limpio.toLowerCase()];
  return letras.join('') + letras[letras.length - 1];
}

/**
 * El saludo del día (bloque 9, decisiones de Tomás del 24/09/2026, tras la prueba en
 * vivo: después de un #reset, "buenass como estan tenes iphone 14 pro? 15 pro?" no
 * saludó). Hasta el bloque 9 lo agregaba cada camino con la marca `yaSaludo`, y la
 * mayoría no lo tenía. Ahora se decide en un solo lugar (`decidirYFormatear`) para toda
 * respuesta que le llega al cliente: va si hoy nadie de la cuenta le escribió todavía.
 *
 * "Hoy" es el día de Argentina, no el de la PC. "Le escribió" es cualquiera de estas:
 *  - el saludo de hoy salió (`saludoEn`, marca del bot que se confirma al enviarse): vale
 *    aunque se haya ido de las 15 líneas del historial;
 *  - una persona de la cuenta escribió hoy (`ultimoHumano`, que pone index.js): si Fran
 *    ya le habló, el bot no vuelve a saludar;
 *  - hay una línea del vendedor de hoy en el historial: lo que mandó el bot (también lo
 *    de antes del bloque 9, sin `saludoEn`, o la foto de #sinstock) o una persona.
 * El `yaSaludo: true` de los chats de antes no dice de qué día es: no se lee más.
 */
const DIA_ARGENTINA = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

function hablaronHoy(ctx, ahora = Date.now()) {
  const hoy = DIA_ARGENTINA.format(ahora);
  const esHoy = (ts) => Number(ts) > 0 && DIA_ARGENTINA.format(Number(ts)) === hoy;
  if (esHoy(ctx.saludoEn) || esHoy(ctx.ultimoHumano)) return true;
  return (ctx.historial || []).some((l) => l.quien === 'vendedor' && esHoy(l.ts));
}

/**
 * ¿Pregunta cómo estamos? (bloque 9) "como estan", "como andas", "como va", "que tal",
 * "todo bien?". Si sigue aquello por lo que pregunta ("como estan de precio", "como va la
 * financiacion", "como anda el 13", "que tal el 14 pro", "como va a ser el pago"), no.
 * "todo bien" cuenta con "?" o al principio, solo o después de un "hola" o un "buenas":
 * "si todo bien, tenes el 13?" contesta algo, no pregunta.
 */
const COMO_ESTAN =
  /\b(?:como (?:estas|estan|esta|andas|andan|anda|vas|va|van|te va|les va|le va)|que tal)\b(?!\s+(?:el|la|los|las|lo|le|les|un|una|de|del|en|con|para|por|a|al|si|eso|esto|ese|esa|este|esta|mi|tu|su|mis|tus|sus)\b)/;
const TODO_BIEN =
  /\btodo bien\s*\?|^(?:(?:hola+|buen[oa]s*|buen dia|buenos dias|buenas (?:tardes|noches))[\s,!.]+)?todo bien\b/;

function preguntaComoEstan(mensaje) {
  const t = normalizar(mensaje).trim();
  return COMO_ESTAN.test(t) || TODO_BIEN.test(t);
}

/** Tope de mensajes por tanda, el mismo de cada camino de `decidir`. */
const TOPE_TANDA = 4;

/**
 * La respuesta con el saludo del día adelante (bloque 9): con el apodo (`deformar`) o sin
 * nombre, y si preguntó cómo estamos, el que contesta y devuelve la pregunta. Lleva su
 * marca, `saludoEn`, que se confirma cuando sale. Va como primer mensaje aparte; si con
 * él la tanda pasara de 4, se pega al primer mensaje con un salto de línea y lleva las
 * marcas de los dos.
 */
function conSaludo(msgs, nombre, mensaje, ahora) {
  const apodo = deformar(nombre);
  const clave = (preguntaComoEstan(mensaje) ? 'saludoDevuelve' : 'saludo') + (apodo ? '' : 'SinNombre');
  const texto = capitalizar(apodo ? estilo.frase(clave, apodo) : estilo.frase(clave));
  if (msgs.length < TOPE_TANDA) return [acciones.conMarcas(texto, { saludoEn: ahora }), ...msgs];
  const [primero, ...resto] = msgs;
  // Una foto, el PDF o la cotización no llevan un texto adelante. Hoy ninguna respuesta de
  // 4 arranca así; si alguna vez pasa, gana el tope y ese día el saludo no va.
  if (acciones.esAccion(primero) || /^📱/.test(acciones.comoTexto(primero))) return msgs;
  return [
    acciones.conMarcas(`${texto}\n${acciones.comoTexto(primero)}`, { ...(acciones.marcasDe(primero) || {}), saludoEn: ahora }),
    ...resto,
  ];
}

/**
 * ¿Pregunta qué tiene que traer? "Y que documentacion debo llevarte?" terminaba
 * en una cotización en los registros reales de septiembre de 2026. Respuesta
 * fija: solo el DNI, sin tarjeta de crédito.
 */
const RE_DOCUMENTACION =
  /\b(documentacion|documentos?|papeles|papeleria|que (necesito|tengo que|debo|hay que) (llevar|traer|presentar)|que (debo|tengo que) (llevarte|traerte)|(llevar|traer) algo)\b/;

function responderDocumentacion(ctx) {
  // De contado no necesita nada (Mejora 1).
  if (pagaDeContado(ctx)) return { mensajes: [estilo.frase('requisitosContado')] };
  // Lo preguntó: se contesta siempre, con la versión corta si ya se explicó.
  return { mensajes: [temas.responder('requisitos', ctx, () => estilo.frase('soloDni'))] };
}

/**
 * ¿Paga de contado? (Mejora 1, paso 5, decisión de Tomás del 16/09/2026): la última
 * cotización que le llegó fue solo de contado (`cotizadoDeContado`, que se confirma
 * al enviarse) o dijo que paga de contado (`forma_pago`). Si una de las dos dice lo
 * contrario (una cotización en cuotas, o dijo "en cuotas"), no: ahí los requisitos
 * con el dni siguen haciendo falta. Dentro de la cotización manda `deContado`, que
 * es esa misma cotización.
 */
function pagaDeContado(ctx) {
  if (!ctx) return false;
  const porCotizacion = ctx.cotizadoDeContado;
  const porLoQueDijo = ctx.forma_pago;
  if (porCotizacion === false || porLoQueDijo === 'cuotas') return false;
  return porCotizacion === true || porLoQueDijo === 'contado';
}

/**
 * La explicación de la financiación, como texto. Si no le llegó, la larga
 * (`explicaFinanciacion` de estilo.js: se financia el celular, 1 o 2 cuotas,
 * entrega inicial). Si ya le llegó, la corta. "Las cuotas arrancan el mes que
 * viene" va solo si pregunta cuándo arranca a pagar: desde el bloque 3b ya no
 * forma parte de la explicación larga.
 */
function explicarFinanciacion(ctx, mensaje) {
  // "¿cuándo arranca la primera?" se contesta con el mes, sea larga o corta.
  // Desde cero (C48T6, 29/09/2026): también "primer cuota" y "cuando (lo) retiro".
  const cuando = /(arranca|empieza|comienza|primera? cuota|por mes|cuando (se )?paga|mes que viene|cuando (lo |la )?retir)/.test(
    normalizar(mensaje)
  );
  const base = temas.explicado(ctx, 'financiacion') ? temas.CORTA.financiacion : estilo.frase('explicaFinanciacion');
  return cuando ? [base, DATOS_FIJOS.cuotas_desde] : [base];
}

/**
 * La explicación de la financiación SIN monto, con el compromiso de pago
 * (bloque 3b, decidido con Tomás el 16/09/2026 tras la prueba en vivo): si
 * todavía no le llegó, la larga y enseguida el PDF con `pieCompromiso` de pie
 * (o el pie como texto si el PDF ya salió y los requisitos no se explicaron, o
 * si no hay PDF; nada si el PDF ya salió y los requisitos ya se explicaron).
 * Si ya le llegó, solo la corta (y el mes si pregunta cuándo arranca), sin PDF:
 * la larga no se repite. Va una sola vez por tanda: quien la usa no agrega
 * ninguna otra explicación.
 */
function explicacionConCompromiso(chatId, ctx, mensaje) {
  const textos = explicarFinanciacion(ctx, mensaje);
  if (temas.explicado(ctx, 'financiacion')) return textos;
  const compromiso = requisitosConCompromiso(chatId, ctx, mensaje);
  return compromiso ? [textos[0], compromiso, ...textos.slice(1)] : textos;
}

/**
 * Arma una respuesta a una consulta general con los datos fijos, sin IA.
 * Es la red de contención: si Gemini no está o falla, el cliente igual
 * recibe la dirección o los requisitos, no un "contame que necesitas".
 *
 * Es la respuesta a lo que el cliente preguntó: financiación, requisitos y
 * garantía van siempre, cortos si ya se le explicaron (ver temas.js).
 */
function respuestaFijaLocal(mensaje, ctx = {}) {
  const t = String(mensaje || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  const out = [];

  if (/(tarjeta|recibo|requisito|dni|necesito|piden|papel|documenta|documento)/.test(t)) {
    // De contado no necesita nada (Mejora 1).
    out.push(pagaDeContado(ctx) ? estilo.frase('requisitosContado') : temas.responder('requisitos', ctx, DATOS_FIJOS.requisitos));
  }
  if (/(cuota|financia|entrega|pagar)/.test(t)) out.push(...explicarFinanciacion(ctx, mensaje));
  if (/(garantia)/.test(t)) out.push(temas.responder('garantia', ctx, DATOS_FIJOS.garantia));
  // Solo el origen del equipo (desde cero, D4, 29/09/2026). La batería, usado o nuevo, el
  // estado y los detalles escalan antes (`preguntaPorEstado`): este texto no contesta eso.
  if (
    /(reacondicionado|original|cambiado|pieza|importado)/.test(t) ||
    /de donde (vienen|son|los trae|salen)\s*(los|el|las|la)?\s*(equipo|celu|telefono|iphone|aparato)/.test(t)
  ) {
    out.push(DATOS_FIJOS.importados);
  }
  // Con bordes de palabra: "la mitad ahora" no pregunta la hora (desde cero, C44T5). "¿Y otros
  // días atienden?" también (segunda vuelta, 30/09/2026: mandaba la lista).
  if (/\b(turnos?|horarios?|horas?|atienden|atendes|abren|abris|cierran|cerras)\b/.test(t)) out.push(DATOS_FIJOS.turnos);

  // Sin duplicados y como mucho tres mensajes
  return [...new Set(out)].slice(0, 3);
}

/**
 * Mira los últimos 10 mensajes para no repetir lo ya dicho y para saber
 * en qué punto de la venta estamos.
 */
function analizarConversacion(ctx) {
  const ultimos = (ctx.historial || []).slice(-15);
  const norm = (x) =>
    String(x || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
  const vendedor = norm(ultimos.filter((m) => m.quien === 'vendedor').map((m) => m.texto).join(' | '));
  const cliente = norm(ultimos.filter((m) => m.quien === 'cliente').map((m) => m.texto).join(' | '));

  return {
    direccionYaDada: /belgrano 3090|somos piedra/.test(vendedor),
    // La cotización arranca con 📱. "contado:" queda por las de antes de Ajustes 1,
    // que siguen en los historiales.
    yaCotizamos: /contado:|📱/.test(vendedor),
    stockYaConfirmado: /sii tenemos/.test(vendedor),
    confirmoCompra:
      /(lo quiero|me lo llevo|dale listo|lo compro|cerramos|de una|lo llevo|voy a buscar|me lo guardas|reservame|apartame|dale ese)/.test(
        cliente
      ),
  };
}

/** Minúsculas y sin tildes: los clientes escriben "dónde" y "donde" indistinto. */
function normalizar(texto) {
  return String(texto || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

/**
 * ¿Pregunta cuánto sale el equipo? Desde Ajustes 1 (decisión de Tomás del
 * 16/09/2026) la cotización no muestra el precio de contado: se dice solo si lo
 * pregunta. Si pregunta por las cuotas y no por el precio, no aparece.
 *
 * No se reusa la intención `consulta_precio`: es una sola por mensaje (con monto,
 * el extractor local devuelve `declara_entrega` sin mirarla) y su patrón
 * ("precio|cuanto|sale|vale") también toma "cuanto quedan las cuotas".
 *
 * Patrón acotado: "cuanto sale/esta/cuesta/vale", "precio", "valor". Si lo que
 * sigue hasta la próxima pausa ("?", ",", " y ") habla de cuotas, pagos, la
 * entrega o la financiación, pregunta por eso y no por el equipo: "cuanto sale
 * cada cuota", "que precio tiene la cuota", "cuanto me sale en cuotas".
 */
// "¿más o menos en cuánto?" también (desde cero, C29T5, 29/09/2026); "en cuanto llegue" no.
// Tampoco "en cuánto tiempo", "en cuánto abren" ni "en cuánto llega" (segunda vuelta, 30/09/2026:
// "dale, ¿en cuánto tiempo me lo podés tener?" recibía el precio). "En cuántos días" ya no entraba.
const RE_PREGUNTA_PRECIO =
  /\bcuanto (?:me |te |nos |lo |la |los |las )?(?:sale|salen|esta|estan|cuesta|cuestan|vale|valen)\b|\bprecios?\b|\bvalor(?:es)?\b|\ben cuanto\b(?!\s+(?:llegue|llegues|pueda|puedas|tenga|tengas|cobre|salga|tiempo|abren|abris|abre|llega|llegan|llegaria|llegarian|demora|demoran|tarda|tardan|me (?:paguen|pagan|llegue|llega)))/g;
const HABLA_DE_CUOTAS = /\b(cuotas?|pagos?|entregas?|anticipos?|financ\w*|interes\w*|sena|saldo|diferencia|resto|mensual\w*)\b/;

function preguntaPrecio(mensaje) {
  const t = normalizar(mensaje);
  for (const m of t.matchAll(RE_PREGUNTA_PRECIO)) {
    const sigue = t.slice(m.index + m[0].length).split(/[?!.,;:\n]|\s(?:y|o|pero)\s/)[0];
    if (!HABLA_DE_CUOTAS.test(sigue)) return true;
  }
  return false;
}

/**
 * El contado de una fila para decírselo al cliente: el de la planilla, o el que
 * tiene descuento si se lo dimos para ese modelo (bloque 5).
 */
function contadoDe(fila, ctx) {
  // Sin descuento desde el 30/09/2026: `descuentoPara` da null y queda el de la planilla.
  return descuentoPara(fila, ctx && ctx.descuentoDe) || fila.precio_contado;
}

/**
 * El precio de contado para decírselo al que preguntó cuánto sale: el de la fila,
 * o "desde" el más barato si del modelo hay varias unidades con precios distintos.
 * Con el descuento del chat, si lo tiene (bloque 5).
 */
function precioParaDecir(filas, ctx) {
  const precios = filas.map((f) => contadoDe(f, ctx)).filter((p) => p > 0);
  if (!precios.length) return null;
  const minimo = Math.min(...precios);
  return Math.max(...precios) > minimo ? `desde ${pesos(minimo)}` : pesos(minimo);
}

/**
 * ¿Pregunta dónde están? Se compara SIN tildes. Antes se comparaba el texto
 * crudo y "dónde" con tilde no entraba nunca: "Por dónde bro?", "Bro dónde
 * estás" o "Donde lo puedo ver?" terminaban en "contame que estabas buscando"
 * (registros reales de septiembre de 2026).
 */
const RE_UBICACION =
  /\b(donde (estan|estas|esta|queda|quedan|es|son|atienden|lo puedo ver|los puedo ver|te encuentro|los encuentro|lo encuentro)|por donde|de donde son|de que (ciudad|zona|localidad)|direccion|ubicacion|ubicados?|local|como llego)\b/;

/**
 * ¿Pregunta cómo se paga, en general? Un medio puntual no entra acá: Mercado Pago y los
 * dólares tienen su respuesta (abajo), y la tarjeta escala por TEMAS_SIN_DATO, que corre antes.
 */
const RE_MEDIOS_DE_PAGO = temas.PREGUNTA.metodos_pago;

/**
 * ¿Pregunta si se aceptan dólares, sin monto? (bloque 8, decisión de Tomás del
 * 24/09/2026) "aceptan dólares?", "toman dólares o solo pesos?": se contesta que sí, a la
 * cotización del día, sin número y sin escalar. Con un monto ("tengo 420 dólares y el
 * resto en pesos"), o si pide el precio o que le coticen en dólares ("cuánto sale en
 * dólares?"), no: eso lo cotiza una persona y escala callado, como siempre.
 */
const RE_DOLARES = /\b(dolar(es)?|usd|u\$s|verdes|dls)\b/;
const ACEPTA_DOLARES =
  /\b(aceptan|aceptas|acepta|toman|tomas|toma|reciben|recibis|recibe|trabajan con|se puede pagar|puedo pagar|podria pagar|se puede abonar|puedo abonar)\b/;
const MONTO_EN_DOLARES = /\d\s*(k|mil)?\s*(usd|u\$s|dolares|dls|verdes)\b|\b(usd|u\$s)\s*\d/;

function preguntaSiAceptanDolares(mensaje, info) {
  const t = normalizar(mensaje);
  if (!RE_DOLARES.test(t) || !ACEPTA_DOLARES.test(t)) return false;
  if (info.entrega || local.mencionaPosibleMonto(mensaje) || MONTO_EN_DOLARES.test(t)) return false;
  return !preguntaPrecio(mensaje) && !/\b(cotiz\w*|cuanto)\b/.test(t);
}

/** Mercado Pago se acepta (bloque 8): "tengo mercado pago", "puedo pagar con mercado pago?". */
const RE_MERCADO_PAGO = /\bmercado ?pago\b/;

/**
 * Otro medio de pago, que escala (TEMAS_SIN_DATO). Bloque 8: pagar CON tarjeta (también
 * en cuotas por Mercado Pago, que no está decidido), débito, Naranja, Ualá o las cuotas
 * del banco. Negarla no ("no tengo tarjeta", "sin tarjeta"): va a los requisitos, que
 * dicen que no hace falta. Preguntar si la piden ("pedís alguna tarjeta?") tampoco: es
 * un requisito. Contar lo que hacen otros tampoco ("donde consulté me decían que trabajan
 * en cuotas con tarjeta", registro real): tiene que pedirlo él ("puedo pagar…", "aceptan…",
 * "quiero…") o preguntar "con tarjeta?". Antes escalaba "tarjeta de crédito" en cualquier frase.
 */
const NIEGA_TARJETA = /\b(no|ni|sin)\b(\s+\S+){0,3}?\s+tarjetas?(\s+de\s+(credito|debito))?\b/;
// "Naranja" suelta no (desde cero, 29/09/2026): es el color del 17 Pro ("en naranja lo
// quiero", "¿color naranja nomás tenés?"). La tarjeta Naranja es D6 (`pagaConCredito`).
const PAGA_CON_TARJETA =
  /\b(puedo|podria|podemos|se puede|podes|puedes|aceptan|acepta|aceptas|toman|tomas|reciben|recibis|pasan|pasas|cobran|cobras|quiero|queria|pagar|pagarlo|pago|abonar|abono)\b[^.?!\n]{0,30}\btarjetas?\b|\b(con|por) (la |una |mi |tu )?tarjetas?\b[^.?!\n]{0,20}\?|\btarjetas? de debito\b|\bdebito\b|\buala\b|\bcuotas del banco\b|\bmercado ?credito\b/;
const MP_EN_CUOTAS = /\bmercado ?pago\b[^.?!\n]*\b(cuotas?|tarjetas?|credito)\b|\b(cuotas?|tarjetas?|credito)\b[^.?!\n]*\bmercado ?pago\b/;
/**
 * Pregunta si hace falta la tarjeta (desde cero, 29/09/2026, como "¿pedís alguna tarjeta?" del
 * bloque 8): "¿la financiación es con tarjeta?", "¿piden tarjeta?", "¿hace falta tarjeta?". Es
 * un requisito, no otro medio de pago: hasta el 29/09 "es con tarjeta ?" escalaba callado.
 */
const PREGUNTA_SI_PIDEN_TARJETA =
  /\b(es|sea|seria|son|va|funciona)\s+con\s+(la |una )?tarjetas?\b|\b(piden|pedis|pide|hace falta|necesito|necesitas|necesita|se necesita|hay que tener|tengo que tener|requiere|requieren|exigen)\s+(una |alguna |la )?tarjetas?\b/;

function pagaConOtroMedio(mensaje) {
  const t = normalizar(mensaje)
    .replace(new RegExp(NIEGA_TARJETA.source, 'g'), ' ')
    .replace(new RegExp(PREGUNTA_SI_PIDEN_TARJETA.source, 'g'), ' ');
  return PAGA_CON_TARJETA.test(t) || MP_EN_CUOTAS.test(t);
}

/**
 * Tarjeta de crédito o financiera (desde cero, D6, decisión de Tomás del 29/09/2026):
 * "¿trabajás con visa?", "¿o con confiable?", "¿trabajan con crédito?", Mastercard, Amex,
 * Cabal, "tarjeta de crédito", "tarjeta naranja", "naranja x". Respuesta fija, sin escalar.
 * Débito, Ualá y Mercado Crédito siguen escalando como otro medio de pago, y negarla ("no
 * tengo tarjeta de crédito") sigue yendo a los requisitos.
 */
const PAGA_CON_CREDITO =
  /\b(visa|master ?card|amex|american express|cabal|tarjetas? de credito|tarjeta naranja|naranja x|con (la )?naranja|con confiable|financieras?)\b|(?<!mercado )\bcon credito\b/;

function pagaConCredito(mensaje) {
  const t = normalizar(mensaje).replace(new RegExp(NIEGA_TARJETA.source, 'g'), ' ');
  return PAGA_CON_CREDITO.test(t) && !/\bdebito\b|\buala\b|\bmercado ?credito\b/.test(t);
}

/**
 * El envío del equipo, que escala (TEMAS_SIN_DATO). Bloque 8: "hacen envíos", "me lo
 * mandan", "envían a", "a domicilio", "otra provincia", Andreani, correo. "Les envío unos
 * precios", "te envío" o "te mando" son el cliente mandando algo: no. "Me lo mandaron al
 * chat del otro celu" (registro real) tampoco: ya pasó y no es el equipo.
 */
const RE_ENVIO =
  /\benvios\b|\b(el|un|hacen|haces|hay|con|sin|de|del|por) envio\b|\benvio (a|al|hasta|para)\b|\benvian\b|\benviarian\b|\b(me|nos) lo (mandan|mandas|mandarian|mandarias|envian|envias|enviarian|enviarias)\b|\b(me|nos) lo (podes|podrias|pueden|podrian) (mandar|enviar)\b|\bmandan (a|al|hasta|para)\b|\ba domicilio\b|\botra provincia\b|\bandreani\b|\bcorreo\b|\bencomienda\b|\ba (cordoba|buenos aires)\b/;

/** "No tengo tarjeta": los requisitos (bloque 8). De contado no necesita nada (Mejora 1). */
function responderRequisitos(ctx) {
  if (pagaDeContado(ctx)) return { mensajes: [estilo.frase('requisitosContado')] };
  return { mensajes: [temas.responder('requisitos', ctx, () => estilo.frase('requisitos'))] };
}

/**
 * Los modelos de un pedido de fotos (bloque 8): los del mensaje; si no nombra ninguno, el
 * del chat (el que eligió o el último cotizado). Como se dicen en el grupo: "iPhone 15".
 */
function modelosDeLasFotos(info, ctx) {
  const delMensaje = [info.modelo, ...(info.modelos || [])].filter(Boolean);
  const delChat = [ctx.modelo || ctx.cotizadoDe].filter(Boolean);
  return [...new Set((delMensaje.length ? delMensaje : delChat).map((m) => `iPhone ${nombreParaDecir(m)}`))];
}

/** "del iPhone 15", "del iPhone 15 y del iPhone 16", "del iPhone 13, del iPhone 14 y del iPhone 15". */
function delModelo(modelos) {
  const con = modelos.map((m) => `del ${m}`);
  return con.length > 1 ? `${con.slice(0, -1).join(', ')} y ${con[con.length - 1]}` : con[0] || '';
}

/** ¿Dijo qué día puede venir? "a la mañana" es una franja, no el día siguiente. */
function mencionaDia(texto) {
  const t = normalizar(texto).replace(/\b(a|por|de) la manana\b/g, ' ');
  return /\b(hoy|manana|lunes|martes|miercoles|jueves|viernes|sabado|domingo|finde|fin de semana|esta semana|semana que viene|proxima semana)\b/.test(
    t
  );
}

const HORAS_EN_LETRAS = 'una|dos|tres|cuatro|cinco|seis|siete|ocho|nueve|diez|once|doce';

/**
 * ¿Dijo una hora concreta? "a la tarde" no cuenta: ahí todavía falta preguntar.
 *
 * Bloque 10: también "cerca de las 14" y "de las 16" ("de las 16 en adelante", "a partir de
 * las 17"). "de las" solo con el número en cifras, sin "cual", "una", "alguna"… adelante y
 * sin cuotas, pagos u opciones atrás: "cual de las dos", "cual de las 2", "de las dos
 * opciones" y "el valor de las 2 cuotas" no son horas.
 */
const DE_LAS_HORA =
  /(?<!\b(?:cual|cuales|alguna|alguno|ninguna|ninguno|una|uno|cualquiera|ambas|ambos)\s)\bde las \d{1,2}\b(?!\s*(?:cuotas|pagos|opciones|modelos|unidades)\b)/;

function mencionaHora(texto) {
  const t = normalizar(texto);
  return (
    new RegExp(`\\b(a|para|desde|hasta|despues de|antes de|sobre|tipo|cerca de) las (\\d{1,2}|${HORAS_EN_LETRAS})\\b`).test(t) ||
    DE_LAS_HORA.test(t) ||
    /\btipo \d{1,2}\b/.test(t) ||
    /\b\d{1,2}(:\d{2})? ?(hs|hrs)\b/.test(t) ||
    /\b\d{1,2}:\d{2}\b/.test(t)
  );
}

/**
 * Qué preguntarle cuando quiere venir. Se miran sus últimos mensajes para no
 * preguntarle el día que ya dijo ("o podemos ir mañana" → el horario).
 */
function preguntaDeTurno(ctx, mensaje, ahora = Date.now()) {
  const historial = ctx.historial || [];
  const suyos = historial
    .filter((m) => m.quien === 'cliente')
    .slice(-3)
    .map((m) => m.texto);
  // Y lo que se dijo HOY, él o una persona de la cuenta (desde cero, 29/09/2026): "hoy tenés
  // lugar a la tarde?" dos tandas antes, o "hoy te queda cómodo después de las 17?" de Fran,
  // ya dicen el día. Con sus últimos 3 mensajes, una tanda de 4 lo tapaba (C12T2).
  const hoy = DIA_ARGENTINA.format(ahora);
  // Todo lo de hoy (C28T5): con los últimos 8, el "mañana lo busco" de la tarde quedaba tapado
  // por los mensajes de Fran y se le volvía a preguntar el día.
  const deHoy = historial
    .filter((m) => (m.quien === 'cliente' || m.humano) && Number(m.ts) > 0 && DIA_ARGENTINA.format(Number(m.ts)) === hoy)
    .slice(-40)
    .map((m) => m.texto);
  const dicho = [...suyos, ...deHoy, mensaje].join(' | ');
  const dia = mencionaDia(dicho);
  const hora = mencionaHora(dicho);
  // Con día y hora no queda nada que preguntar. "Me fijo si tenemos ese horario" era
  // solo una promesa y el bot escala callado: no se dice nada (Mejora 1).
  if (dia && hora) return { pregunta: null, dijoCuando: true };
  if (dia) return { pregunta: estilo.frase('queHorario'), dijoCuando: true };
  return { pregunta: estilo.frase('queDia'), dijoCuando: hora };
}

/**
 * ¿Lo último de la cuenta deja la pelota del lado del cliente? (desde cero, grupo 2,
 * 29/09/2026): la línea de la entrega inicial, un "te cotizo" o "te paso" (del bot o de una
 * persona: "ahi llego al local y te cotizo todo", "te paso mira") o la lista de precios. Ahí
 * un "dale", "bueno" u "ok" es un acuse, no quiere venir: no se le contesta nada y no escala
 * (decisión de Tomás del 29/09). Hasta entonces preguntaba el día y escalaba callado.
 */
const TE_COTIZO =
  /\b(?:ahora|ahi|ya|enseguida|al toque)\s+te\s+(?:cotizo|paso|mando|armo)\b|\bte cotizo\b|\bte paso mira\b|\bte paso los numeros\b|\bmira como te queda\b/;
function ultimaTandaEsperaAlCliente(historial) {
  const lineas = historial || [];
  let i = lineas.length - 1;
  while (i >= 0 && lineas[i].quien === 'cliente') i--;
  let espera = false;
  for (; i >= 0 && lineas[i].quien === 'vendedor'; i--) {
    const texto = String(lineas[i].texto || '').trim();
    const t = normalizar(texto);
    // Si en esa tanda ya fue la cotización ("ahora te cotizo" y los números), el "dale" es
    // para avanzar: se pregunta el día, como siempre (C67T6).
    if (texto.startsWith('📱')) return false;
    // La lista de una persona también, aunque la escriba en minúscula ("ip 14 pro 100% 800.000"; C47T3).
    if (/^ip \d/i.test(texto) || temas.LINEA_ENTREGA_INICIAL.test(t) || TE_COTIZO.test(t)) espera = true;
  }
  return espera;
}

/** "dale", "dale dale", "bueno", "ok", "listo joya", un emoji: un acuse corto. "no" no: es otra cosa. */
function esAcuseCorto(texto) {
  const t = normalizar(texto).trim();
  if (!t) return false;
  if (!/[a-z0-9]/.test(t)) return true;
  const palabras = t.replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/);
  return palabras.length <= 3 && palabras.every((p) => ACUSES.test(p) && !/^n+o+$/.test(p));
}

/**
 * Quiere venir o avanzar. El bot no confirma horarios —eso lo decide una
 * persona, que se entera por el grupo— pero tampoco corta la charla: pregunta
 * lo que falta para coordinar.
 *
 * Y nunca promete que otra persona le va a escribir. "Ahi te confirma fran el
 * horario" era la frase que más repetía el bot en los registros reales: si
 * nadie escribe, el cliente se queda esperando un mensaje que no llega.
 * Lo que dijo del día y la hora va en el motivo, para que se lea en el grupo.
 */
function responderTurno(ctx, mensaje, { motivo, antes = [] }) {
  const { pregunta, dijoCuando } = preguntaDeTurno(ctx, mensaje);
  const conCuando = dijoCuando ? `${motivo} (dijo: "${String(mensaje).slice(0, 80)}")` : motivo;
  return escalar(conCuando, ctx, [...antes, pregunta]);
}

/**
 * Pregunta dónde están: la dirección y que se atiende con turno, de una.
 *
 * Hasta septiembre de 2026 la primera vez solo se decía lo de los turnos y la
 * dirección recién a la segunda. En los registros reales los humanos la
 * pasaban siempre a la primera, y se cambió a eso.
 *
 * Sigue siendo señal de compra: después de la dirección se empuja la venta, y
 * si además quiere venir, se coordina como cualquier turno.
 */
function responderUbicacion(ctx, conv, mensaje, quiereVenir) {
  const mensajes = [
    // Si ya se la dimos y la vuelve a pedir, se reformula: el filtro de
    // repetidos se comería justo la dirección, que es lo que pidió.
    `${conv.direccionYaDada ? 'te repito, estamos' : 'estamos'} en ${DATOS_FIJOS.direccion}`,
    DATOS_FIJOS.turnos,
  ];

  if (conv.confirmoCompra || quiereVenir) {
    return responderTurno(ctx, mensaje, {
      motivo: conv.confirmoCompra
        ? 'quiere venir al local y ya aceptó: hay que darle turno'
        : 'pregunta dónde están y quiere venir',
      antes: mensajes,
    });
  }

  if (ctx.modelo && ctx.entrega) {
    mensajes.push('decime que dia te podes acercar asi te anoto y te lo llevas');
  } else if (ctx.modelo) {
    mensajes.push(
      'contame con cuanto contas para la entrega asi te armo el precio y te anoto en un turnito'
    );
  } else {
    mensajes.push(
      'contame que modelito te interesa y con cuanto contas asi te cotizo y te anoto en un turnito'
    );
  }
  return { mensajes };
}

/**
 * Pregunta cómo se paga. Respuesta fija y SIN montos: la entrega depende del
 * modelo y la calcula el cotizador. En los registros reales el bot contestaba
 * "contame que modelito tenias en mente" y la pregunta quedaba sin respuesta.
 *
 * Si en el mismo mensaje pide stock y precios, igual va esto y no la lista: la
 * lista ya ocupa cuatro mensajes y no entra nada más sin pasar el tope.
 */
function responderMediosDePago(ctx, mensaje) {
  return {
    mensajes: [
      // Lo preguntó: va siempre, corto si ya se explicó.
      temas.responder('metodos_pago', ctx, () => estilo.frase('mediosDePago')),
      // Los requisitos van de yapa: solo si no se explicaron, o si también los pregunta.
      temas.decir('requisitos', ctx, mensaje, () => estilo.frase('requisitos')),
      ctx.modelo
        ? 'la entrega inicial depende del modelo, contame con cuanto contas y te armo los numeros'
        : 'la entrega inicial depende del modelo, contame cual te interesa y te paso los numeros',
    ].filter(Boolean),
  };
}

/**
 * ¿Pregunta por los colores? (desde cero, 29/09/2026) Hasta el 29/09 solo "qué colores",
 * "colores tenés/hay" y "de qué color": se escapaban "¿lo tenés en color negro?", "buscaba
 * algún blanco o rosa" y "en naranja lo quería". Ahora "color" en cualquier forma, o un
 * nombre de color después de "en", "algún", "de", "tenés"… o solo. "Plata" y "verdes" no:
 * son la plata y los dólares.
 */
const NOMBRE_COLOR =
  '(?:negr[oa]s?|blanc[oa]s?|rosas?|rosad[oa]s?|rosita|azul(?:es)?|verde|lilas?|violetas?|morad[oa]s?|roj[oa]s?|naranjas?|dorad[oa]s?|gris(?:es)?|lavanda|celestes?|amarill[oa]s?|plateado)';
const PREGUNTA_COLORES = new RegExp(
  `\\bcolou?r(?:es)?\\b|\\b(?:en|algun|alguno|alguna|de|tenes|tienen|hay|queda|quedan|uno|una)\\s+${NOMBRE_COLOR}\\b` +
    `|^[^a-z0-9]*${NOMBRE_COLOR}(?:\\s+(?:o|y)\\s+${NOMBRE_COLOR})?[^a-z0-9]*$`
);
// "Trabajo en negro", "cobro en negro" (segunda vuelta, 30/09/2026): no es un color. Escalaba por
// colores y no salía la financiación.
const EN_NEGRO = /\b(?:trabaj|cobr|labur|pag)\w*\s+en\s+negro\b/g;
function preguntaColores(mensaje) {
  return PREGUNTA_COLORES.test(normalizar(mensaje).replace(EN_NEGRO, ' '));
}
const ESCALAR_COLORES = 'pregunta por colores: hay que mandarle la foto del equipo';

/** Un modelo como se dice en una frase, sin "iPhone": "13", "14 Pro", "XR". */
function nombreParaDecir(modelo) {
  return String(modelo || '')
    .replace(/^iphone\s*/i, '')
    .replace(/\b(pro|max|plus|mini)\b/gi, (w) => w[0].toUpperCase() + w.slice(1).toLowerCase())
    .replace(/^(xr|xs|x)\b/i, (w) => w.toUpperCase());
}

/**
 * Los modelos que ya se le mostraron, o si no los que pidió, cuando son 2 o
 * más. Con menos devuelve []: un solo modelo no es "elegir entre esos".
 */
function modelosVistos(ctx) {
  return [...new Set(modelosEnJuego(ctx).map(nombreParaDecir))];
}

/** Los mismos modelos que `modelosVistos`, como están guardados ("iPhone 13", "14 pro"). */
function modelosEnJuego(ctx) {
  const mostrados = ctx.preciosMostradosDe || [];
  const lista = mostrados.length >= 2 ? mostrados : ctx.modelosPedidos || [];
  return lista.length >= 2 ? lista : [];
}

/**
 * ¿Eligió uno de los modelos que vio? Contestó "cómo pensabas pagarlo" sobre uno,
 * se le cotizó ese solo (bloque 5), o es el único con el que el bot viene
 * insistiendo con la entrega (bloque 5b: "el 13, tengo 280" → la línea del 13; el
 * próximo monto sigue con el 13 en vez de volver a cotizar todos los vistos).
 */
function eligioUnModelo(ctx, fila) {
  if (ctx.preguntamosFormaPago) return true;
  if (!fila) return false;
  if (ctx.cotizadoDe === fila.modelo) return true;
  const insistidos = Object.keys(ctx.insistenciaEntrega || {}).filter((m) => ctx.insistenciaEntrega[m] > 0);
  return insistidos.length === 1 && insistidos[0] === fila.modelo;
}

/**
 * ¿La entrega no llega al mínimo del modelo? (bloque 5b) Cotizó con recargo
 * (`bajoMinimo`) o no cotizó por ENTREGA_BAJA. Sin precio no cuenta.
 */
function faltaParaElMinimo(cot) {
  return cot.ok ? Boolean(cot.bajoMinimo) : cot.motivo === 'ENTREGA_BAJA';
}

/** Cuántas veces se le dijo la entrega inicial de ese modelo sin que llegara (bloque 5b). */
function vecesInsistido(ctx, modelo) {
  return Number((ctx && ctx.insistenciaEntrega && ctx.insistenciaEntrega[modelo]) || 0);
}

/** ¿Hay una insistencia en curso en el chat? Ahí valen el atajo por rechazo y el "no" suelto. */
function hayInsistencia(ctx) {
  return Object.values((ctx && ctx.insistenciaEntrega) || {}).some((v) => v > 0);
}

/**
 * En qué paso está la insistencia con este modelo (bloque 5b, decisión de Tomás
 * del 16/09/2026): 'insistir' mientras no se le haya dicho dos veces la entrega
 * inicial y no haya rechazado; 'resolver' (paso 3: recargo o alternativa) después
 * de la segunda, o antes si en el paso 1 o 2 mostró que no va a comprar. La
 * primera vez se insiste siempre.
 */
function pasoDeInsistencia(ctx, fila, rechazo) {
  const veces = vecesInsistido(ctx, fila.modelo);
  return veces >= 2 || (veces >= 1 && rechazo) ? 'resolver' : 'insistir';
}

/**
 * La línea de la entrega inicial de un modelo, sin cotizar (bloque 5b): retoma el
 * monto que dijo el cliente (`plata`, si lo hay) y dice la entrega que pedimos para
 * ese modelo, sin pregunta, sin el contado y nunca la diferencia (Bloque Tono).
 * Lleva el conteo de ese modelo, que se confirma cuando la línea sale.
 *
 * La variante la elige el conteo, no el azar: la segunda vez va SIEMPRE la
 * explicativa (1), distinta de la primera (0 o 2, según el modelo, para que dos
 * modelos en la misma tanda no suenen iguales). Con `estilo.frase` al azar, con dos
 * modelos en el mismo chat podía repetirle a uno la misma variante y el filtro de
 * repetidos se la comía, con lo que ese conteo no avanzaba; y `notas.test.js`
 * necesita que dos corridas iguales contesten igual.
 */
function lineaEntregaInicial(ctx, fila, plata) {
  const veces = vecesInsistido(ctx, fila.modelo);
  const variantes = estilo.variantes(
    'entregaInicial',
    nombreParaDecir(fila.modelo),
    pesos(fila.anticipo_min),
    plata ? pesos(plata) : null
  );
  const suma = [...fila.modelo].reduce((a, c) => a + c.charCodeAt(0), 0);
  const indice = veces >= 1 ? 1 : suma % 2 === 0 ? 0 : 2;
  return acciones.conMarcas(variantes[indice], {
    insistenciaEntrega: { [fila.modelo]: veces + 1 },
  });
}

/**
 * La entrega inicial de VARIOS modelos que no llegan, en un solo mensaje (bloque 9,
 * decisión de Tomás del 24/09/2026, tras la prueba en vivo: iba un mensaje entero por
 * modelo, con la explicación repetida). La entrega de cada uno y la explicación una vez,
 * nunca la diferencia. Con un solo modelo, la línea de siempre. Lleva el conteo de cada
 * modelo, el mismo que llevaban sus líneas por separado (`insistenciaEntrega` se mezcla).
 * La variante la elige el conteo, como en `lineaEntregaInicial`: la que explica por qué
 * (1) si ya se le insistió con alguno; si no, la 0 o la 2 según los modelos.
 */
function lineaEntregaInicialVarios(ctx, filas, plata) {
  if (filas.length === 1) return lineaEntregaInicial(ctx, filas[0], plata);
  const variantes = estilo.variantes(
    'entregaInicialVarios',
    filas.map((f) => [nombreParaDecir(f.modelo), pesos(f.anticipo_min)]),
    plata ? pesos(plata) : null
  );
  const suma = [...filas.map((f) => f.modelo).join('')].reduce((a, c) => a + c.charCodeAt(0), 0);
  const indice = filas.some((f) => vecesInsistido(ctx, f.modelo) >= 1) ? 1 : suma % 2 === 0 ? 0 : 2;
  return acciones.conMarcas(variantes[indice], {
    insistenciaEntrega: Object.fromEntries(filas.map((f) => [f.modelo, vecesInsistido(ctx, f.modelo) + 1])),
  });
}

/**
 * Varias líneas en un solo mensaje, con las marcas de todas, para entrar en el
 * tope de 4 mensajes. Los conteos por modelo se mezclan y las listas se suman.
 */
function juntarLineas(lineas) {
  if (lineas.length <= 1) return lineas;
  const marcas = {};
  for (const l of lineas) {
    for (const [campo, valor] of Object.entries(acciones.marcasDe(l) || {})) {
      if (Array.isArray(valor)) marcas[campo] = [...(marcas[campo] || []), ...valor];
      else if (valor && typeof valor === 'object') marcas[campo] = { ...(marcas[campo] || {}), ...valor };
      else marcas[campo] = valor;
    }
  }
  return [acciones.conMarcas(lineas.map(acciones.comoTexto).join('\n'), marcas)];
}

/**
 * El modelo del que se viene hablando, si está claro (bloque 5): el que nombra en
 * este mensaje, o el guardado, salvo que haya visto varios y no haya elegido
 * ninguno. null si no hay, o si no se puede cotizar.
 */
function modeloClaro(ctx, datos, info) {
  const nombre = info.modelo || ctx.modelo;
  if (!nombre) return null;
  const fila = sheets.buscarModelo(datos, nombre, info.capacidad_gb || ctx.capacidad_gb);
  if (!fila || !fila.cotizable) return null;
  if (!info.modelo && modelosEnJuego(ctx).length && !eligioUnModelo(ctx, fila)) return null;
  return fila;
}

/**
 * Pide descuento (bloque 5; sin descuento desde el 30/09/2026, decisión de Tomás). Cada
 * pedido recibe "el precio es ese", sin números y sin escalar; hasta el 30/09 el 2do se
 * llevaba el contado − $10.000. Se cuenta por chat (`descuentoPedidos`), y el conteo viaja
 * como marca con la respuesta: si no sale, no cuenta (bloque 3). Sin un modelo claro en la
 * charla, o con la lista vencida, escala callado.
 */
async function responderDescuento(ctx, info) {
  const datos = await leerPlanilla();
  if (datos.config.estadoLista !== 'VIGENTE') {
    return escalar(`pide descuento y la lista de precios está ${datos.config.estadoLista}`, ctx);
  }
  const fila = modeloClaro(ctx, datos, info);
  if (!fila) return escalar('pide descuento y no hay un modelo claro en la charla', ctx);
  const pedido = (ctx.descuentoPedidos || 0) + 1;
  return { mensajes: [acciones.conMarcas(estilo.frase('descuentoPrimero'), { descuentoPedidos: pedido })] };
}

/**
 * ¿Lo último que le mandamos fue una cotización, la pregunta por la entrega o la
 * línea de la entrega inicial (bloque 5b)? Mira la última tanda del vendedor: lo
 * que se le mandó después del mensaje anterior del cliente. Un número suelto
 * ("500") se lee como plata solo ahí (bloque 5). "hasta cuanto podrias estirarte"
 * ya no se dice desde el 5b; queda por los historiales guardados.
 */
const PREGUNTA_ENTREGA = /(con cuanto contas|de cuanto disponias|hasta cuanto podrias estirarte|que presupuesto tenias)/;
function ultimaTandaPideMonto(historial) {
  const lineas = historial || [];
  let i = lineas.length - 1;
  // El mensaje que se está contestando ya está en el historial (index.js y evaluar).
  while (i >= 0 && lineas[i].quien === 'cliente') i--;
  for (; i >= 0 && lineas[i].quien === 'vendedor'; i--) {
    const texto = String(lineas[i].texto || '');
    const t = normalizar(texto);
    if (texto.trim().startsWith('📱') || PREGUNTA_ENTREGA.test(t) || temas.LINEA_ENTREGA_INICIAL.test(t)) return true;
  }
  return false;
}

/**
 * ¿La última tanda de la cuenta (el bot o una persona) le preguntó la batería de su equipo?
 * Muestra de repro-v1 (#368, decisión de Tomás del 28/09/2026): a una clienta se le preguntó
 * la batería de su canje, contestó "90" y el bot lo leyó como $90.000. Cuentan el pedido de
 * datos del canje ("pasame almacenamiento, condicion de bateria, unas fotos"), el recordatorio
 * ("sin condicion de bateria no te puedo pasar el numero") y la pregunta de una persona ("que
 * bateria tiene tu celu?"). No cuentan las líneas que DICEN una batería: la cotización
 * (📱 … batería 84%) y las unidades ("*1)* 128gb, bateria 86%").
 */
const PREGUNTA_BATERIA = /\bbateria\b/;
const DICE_BATERIA = /\bbateria\b\s*:?\s*(?:al|de|del)?\s*\d{2,3}\s*%?|\b\d{2,3}\s*(?:%|por ?ciento)\s*(?:de\s+)?bateria\b/;
function ultimaTandaPideBateria(historial) {
  const lineas = historial || [];
  let i = lineas.length - 1;
  while (i >= 0 && lineas[i].quien === 'cliente') i--;
  for (; i >= 0 && lineas[i].quien === 'vendedor'; i--) {
    const texto = String(lineas[i].texto || '');
    const t = normalizar(texto);
    if (texto.trim().startsWith('📱') || DICE_BATERIA.test(t)) continue;
    if (PREGUNTA_BATERIA.test(t)) return true;
  }
  return false;
}

/**
 * Una línea de la cuenta que COBRA la cuota (muestra de repro-v1, #694; decisión de Tomás del
 * 28/09/2026). Es una señal de cobranza, no de cotización: habla de la cuota junto con
 * transferencia, comprobante, alias, demora, aumenta/sube/pasa a, o pide el comprobante o el
 * pago de la cuota ("me podrias transferir lo de la cuota", "te encargo el comprobante de la
 * transferencia, sino la cuota ya aumenta a 185.000 por los 10 dias de demora", "estaria
 * necesitando el pago de la cuota"). Lo que manda el bot con la financiación no cuenta ("1 o 2
 * cuotas", "2 pagos de $64.000", "podes pagarlo de contado (efectivo, transferencia o mercado
 * pago) o financiarlo hasta en 2 cuotas"): cotiza, no cobra. Sobre el texto sin tildes.
 */
const CUOTA = /\bcuotas?\b/;
// Que le pidan transferir, o el comprobante: "por transferencia" solo es cómo se paga, y una
// persona lo dice también antes de la venta ("la primera cuota la podes hacer por transferencia").
const SENAL_DE_COBRO =
  /\btransferi(?:r|s|me|rme|rlo|rla|ste|rias|rian)\b|\b(?:me|nos) (?:\w+ )?transfer\w*|\b(?:hiciste|mandaste|pasaste) la transferencia\b|\btransferencia de la cuota\b|\bcomprobante\b|\balias\b|\bdemora\w*|\baument\w*|\bsube\b|\bsubio\b|\bpasa a\b|\b(?:pago|abono) de (?:la|esa|esta|tu) (?:\w+ )?cuota\b|\b(?:pag|abon)\w+ (?:lo de )?(?:la|esa|esta|tu|una|otra) (?:\w+ )?cuota\b/;
// Explica cómo se paga (el bot o una persona, antes de la venta): no cobra.
const HABLA_DE_FINANCIACION =
  /financ\w*|\bentrega\b|\bcontado\b|\bprimera cuota\b|\bmes que viene\b|\b(?:1|2|una|dos) (?:o (?:2|dos) )?cuotas\b|\bhasta (?:en )?2 cuotas\b|\b[12] pagos? de\b/;
function cobraLaCuota(texto) {
  const crudo = String(texto || '');
  if (crudo.trim().startsWith('📱')) return false;
  const t = normalizar(crudo);
  return CUOTA.test(t) && SENAL_DE_COBRO.test(t) && !HABLA_DE_FINANCIACION.test(t);
}

/**
 * ¿Ya compró? Marcado con #vendido, o en el historial guardado hay una línea de la cuenta que
 * cobra la cuota. En un chat así, todo lo que no pida un modelo nuevo lo sigue una persona
 * (decisión de Tomás del 28/09/2026).
 */
function esPostventa(s) {
  if (s.resultado?.tipo === 'vendido') return true;
  return (s.historial || []).some((l) => l.quien === 'vendedor' && cobraLaCuota(l.texto));
}

/**
 * "me quedo con ese que me recomendaste" (bloque 10, decisión de Tomás del 25/09/2026).
 * Hasta el bloque 10 caía en "pide recomendación" ("que me recomendas" está adentro de "que
 * me recomendaste") y le volvía a recomendar. "recomendaste", "me recomendaron", "el que me
 * pasaste" y "el que me dijiste" hablan de uno que ya se le ofreció:
 *  - si lo último que le escribió el bot ofreció o recomendó UN solo modelo, es ese: sigue
 *    igual que si lo hubiera nombrado ({ modelo });
 *  - si ofreció varios, o lo último se lo escribió una persona de la cuenta, escala callado
 *    ({ escalar }): no se sabe cuál es;
 *  - sin nada antes (un chat nuevo: "me recomendaron este lugar"), o si lo último no nombra
 *    ningún modelo, sigue su camino de siempre (null).
 * Lo último son las líneas del vendedor seguidas antes del mensaje que se está contestando
 * (si entre ellas hay una de una persona con otro modelo, son varios: escala). El rango
 * ("del 11 al 18 Pro Max") no es una oferta.
 */
const REFIERE_A_LO_OFRECIDO = /\b(?:recomendaste|me recomendaron|(?:el|ese|la|esa) que me (?:pasaste|dijiste))\b/;
const RANGO_EN_TEXTO = normalizar(RANGO_MODELOS).replace(/^.*?(?=\bdel\b)/, '');

function loQueOfrecio(historial, mensaje) {
  if (!REFIERE_A_LO_OFRECIDO.test(normalizar(mensaje))) return null;
  const h = historial || [];
  let i = h.length - 1;
  while (i >= 0 && h[i].quien === 'cliente') i--; // el mensaje que se está contestando
  if (i < 0) return null;
  if (h[i].humano) return { escalar: 'dice que se queda con el que le recomendaron y lo último se lo escribió una persona' };
  const modelos = new Set();
  for (; i >= 0 && h[i].quien === 'vendedor'; i--) {
    for (const m of local.extraerModelos(normalizar(h[i].texto).split(RANGO_EN_TEXTO).join(' '))) modelos.add(m);
  }
  if (modelos.size > 1) return { escalar: 'dice que se queda con el que le recomendaron y le ofrecimos varios modelos' };
  return modelos.size === 1 ? { modelo: [...modelos][0] } : null;
}

/**
 * Dos o más modelos vistos y un monto sin nombrar ninguno (bloque 5, decisión de
 * Tomás del 16/09/2026): una cotización por modelo, con las reglas de cada uno
 * (normal, bajo el mínimo con recargo, de contado). Al que no llega al mínimo
 * primero se le dice solo la entrega inicial, dos veces, con el conteo de ese
 * modelo (bloque 5b); después entra con recargo si le falta hasta el tope, o va en
 * una línea con el contado y la entrega mínima, nunca con la diferencia. Con más
 * de 3 vistos, los últimos 3. Si no entran en el tope de 4 mensajes, las
 * cotizaciones van juntas en uno, y si hace falta también las líneas. Devuelve
 * null si quedan menos de 2 modelos o no hay nada que decir.
 */
function cotizarVistos(chatId, ctx, mensaje, datos, plata, rechazo) {
  const filas = [];
  for (const nombre of modelosEnJuego(ctx)) {
    const f = sheets.buscarModelo(datos, nombre, null);
    if (f && f.cotizable && !filas.includes(f)) filas.push(f);
  }
  const ultimos = filas.slice(-3);
  if (ultimos.length < 2) return null;

  const corto = (f) => f.modelo.replace(/^iPhone\s*/i, '');
  const cotizadas = [];
  const lineas = []; // paso 3 sin recargo: el contado y la entrega mínima
  const faltan = []; // pasos 1 y 2: solo la entrega inicial, todos en un mensaje (bloque 9)
  for (const f of ultimos) {
    const cot = conDescuento(cotizar(f, plata, datos.config), f, plata, ctx.descuentoDe);
    if (faltaParaElMinimo(cot) && pasoDeInsistencia(ctx, f, rechazo) === 'insistir') {
      faltan.push(f);
    } else if (cot.ok) {
      cotizadas.push({ fila: f, cot });
    } else {
      lineas.push(
        acciones.conMarcas(
          `el ${corto(f)} sale ${pesos(contadoDe(f, ctx))} de contado y la entrega arranca en ${pesos(f.anticipo_min)}`,
          { preciosMostradosDe: [f.modelo] }
        )
      );
    }
  }
  const insistidas = faltan.length ? [lineaEntregaInicialVarios(ctx, faltan, plata)] : [];
  if (!cotizadas.length && !insistidas.length) return null;

  // Si paga todo de contado, sin financiación (Ajustes 1b): ni la explicación ni el
  // PDF. Una entrega inicial pendiente sí es hablar de financiación.
  const deContado = cotizadas.length > 0 && !insistidas.length && cotizadas.every((o) => o.cot.soloContado);
  const hablaFinanciacion = !deContado || temas.pregunta(mensaje, 'financiacion');
  const antes = [];
  if (hablaFinanciacion && !temas.explicado(ctx, 'financiacion')) {
    antes.push(estilo.frase('explicaFinanciacion'));
    const requisitos = requisitosConCompromiso(chatId, ctx, mensaje);
    if (requisitos) antes.push(requisitos);
  }

  // Paso 3 con recargo (Bloque Tono): antes de las fichas, que está cerca y que le
  // hacemos una excepción. Solo si entra en los 4 mensajes: la ficha manda.
  const bajoMinimo = cotizadas.filter((o) => o.cot.bajoMinimo).map((o) => o.fila.modelo);
  const excepcion = bajoMinimo.length
    ? estilo.frase('excepcionCerca', bajoMinimo.map((m) => `el ${nombreParaDecir(m)}`).join(' y '), pesos(plata))
    : null;
  const cabeza = antes.length + (excepcion ? 1 : 0);

  let bloques = cotizadas.map((o) => plantilla(o.fila, o.cot));
  let resto = [...lineas, ...insistidas];
  if (bloques.length > 1 && cabeza + bloques.length + resto.length > 4) bloques = [bloques.join('\n\n')];
  if (cabeza + bloques.length + resto.length > 4) resto = juntarLineas(resto);
  const conExcepcion = excepcion && cabeza + bloques.length + resto.length <= 4 ? [excepcion] : [];
  if (bloques.length) {
    // La cotización la marca el último mensaje de los números: si no sale, se vuelve a pasar.
    bloques[bloques.length - 1] = acciones.conMarcas(bloques[bloques.length - 1], {
      cotizadoDe: cotizadas.map((o) => o.fila.modelo).join(' y '),
      entregaCotizada: plata,
      cotizadoDeContado: deContado,
      preciosMostradosDe: cotizadas.map((o) => o.fila.modelo),
    });
  }

  return {
    mensajes: [...antes, ...conExcepcion, ...bloques, ...resto].slice(0, 4),
    ...(bajoMinimo.length ? { bajoMinimo } : {}),
  };
}

/** "el 13", "el 13 o el 14 Pro", "el 13, el 14 Pro o el 15". */
function elUnoOElOtro(nombres) {
  if (nombres.length === 1) return `el ${nombres[0]}`;
  return `el ${nombres.slice(0, -1).join(', el ')} o el ${nombres[nombres.length - 1]}`;
}

function preguntaCualDeEsos(nombres) {
  return `decime cual te gusto mas, ${elUnoOElOtro(nombres)}, y con cuanto contas para la entrega asi te armo los numeros`;
}

/**
 * La cotización con la entrega inicial de cada modelo en juego (desde cero, C3T4, 29/09/2026):
 * "si le hago la entrega mínima, ¿cuánto se me va?". El modelo claro de la charla, o si vio
 * varios y no eligió, los últimos 3 que vio, cada uno con su propia entrega mínima. Antes va
 * la explicación con el PDF si la financiación todavía no le llegó. La entrega no queda como
 * la suya: no la dijo él. null si no hay ningún modelo para cotizar.
 */
async function cotizarConLaMinima(chatId, ctx, mensaje, info) {
  const datos = await leerPlanilla();
  if (datos.config.estadoLista !== 'VIGENTE') return null;
  const clara = modeloClaro(ctx, datos, info);
  const vistos = [];
  if (!clara) {
    for (const nombre of modelosEnJuego(ctx)) {
      const f = sheets.buscarModelo(datos, nombre, null);
      if (f && f.cotizable && !vistos.includes(f)) vistos.push(f);
    }
  }
  const filas = (clara ? [clara] : vistos.slice(-3)).filter((f) => f.anticipo_min > 0);
  const cotizadas = filas
    .map((f) => ({ fila: f, cot: conDescuento(cotizar(f, f.anticipo_min, datos.config), f, f.anticipo_min, ctx.descuentoDe) }))
    .filter((o) => o.cot.ok);
  if (!cotizadas.length) return null;
  const antes = [];
  if (!temas.explicado(ctx, 'financiacion')) {
    antes.push(estilo.frase('explicaFinanciacion'));
    const requisitos = requisitosConCompromiso(chatId, ctx, mensaje);
    if (requisitos) antes.push(requisitos);
  }
  let bloques = cotizadas.map((o) => plantilla(o.fila, o.cot));
  if (antes.length + bloques.length > TOPE_TANDA) bloques = [bloques.join('\n\n')];
  bloques[bloques.length - 1] = acciones.conMarcas(bloques[bloques.length - 1], {
    cotizadoDe: cotizadas.map((o) => o.fila.modelo).join(' y '),
    ...(cotizadas.length === 1 ? { entregaCotizada: cotizadas[0].fila.anticipo_min } : {}),
    cotizadoDeContado: false,
    preciosMostradosDe: cotizadas.map((o) => o.fila.modelo),
  });
  return { mensajes: [...antes, ...bloques].slice(0, TOPE_TANDA) };
}

/**
 * Pregunta cómo son las cuotas ("vi que hacen cuotas, como seria eso?").
 *
 * Decidido con Tomás el 15/09/2026, después de una prueba en vivo: con dos
 * modelos cotizados, Gemini leyó esa pregunta como propone_pago y el bot contestó
 * "contame que estas buscando y con cuanto contas". Ahora se contesta con los
 * textos fijos (sin redactar), lea lo que lea Gemini, y se sigue la venta:
 *  - eligió un modelo que ya se le mostró: la entrega de ese y se le pide la suya;
 *  - vio varios y no eligió: que elija entre esos y diga con cuánto cuenta;
 *  - no vio nada: qué modelo le interesa y con cuánto cuenta.
 * Devuelve null si el modelo en juego todavía no se le mostró, o si la lista no
 * está vigente: sigue el árbol de siempre.
 */
const PIDE_MONTO_ENTREGA =
  /\bcuanto (?:es|seria|sale|queda) (?:la )?entrega\b|\bentrega(?: inicial)? (?:es |seria |sale )?(?:de )?cuanto\b|\bcuanto (?:tengo|tendria|hay) que (?:entregar|dar) (?:de entrada|primero|al principio)\b/;
async function responderCuotas(chatId, ctx, mensaje) {
  // La larga con el PDF si no le llegó; si ya le llegó, la corta (bloque 3b).
  const explicacion = explicacionConCompromiso(chatId, ctx, mensaje);
  const vistos = modelosVistos(ctx);
  // Con varios mostrados, el modelo guardado es el último que nombró, no uno que
  // eligió: elegir es contestar "cómo pensabas pagarlo" (preguntamosFormaPago).
  const eligio = ctx.modelo && (ctx.preguntamosFormaPago || !vistos.length);
  if (eligio) {
    const datos = await leerPlanilla();
    if (datos.config.estadoLista !== 'VIGENTE') return null;
    const fila = sheets.buscarModelo(datos, ctx.modelo, ctx.capacidad_gb);
    const mostrado =
      fila && (ctx.stockInformadoDe === fila.modelo || (ctx.preciosMostradosDe || []).includes(fila.modelo));
    if (!fila || !fila.cotizable || !mostrado) return null;
    // "¿Y la entrega inicial de cuánto es?" con la financiación ya explicada (desde cero,
    // C78T4): va el número, aunque ya se lo hayamos dicho, con otras palabras. La línea de
    // siempre se filtraba por repetida y quedaba "como te decía…" sin el monto.
    if (PIDE_MONTO_ENTREGA.test(normalizar(mensaje)) && temas.explicado(ctx, 'financiacion')) {
      return {
        mensajes: [`la entrega inicial del ${fila.modelo} es desde ${pesos(fila.anticipo_min)}`, estilo.frase('pedirEntrega')],
      };
    }
    return {
      mensajes: [
        ...explicacion,
        `dale, para el ${fila.modelo} la entrega arranca en ${pesos(fila.anticipo_min)}`,
        estilo.frase('pedirEntrega'),
      ].slice(0, 4),
    };
  }
  if (vistos.length) return { mensajes: [...explicacion, preguntaCualDeEsos(vistos)] };
  return {
    mensajes: [
      ...explicacion,
      'contame que modelito te interesa y con cuanto contas para la entrega asi te armo los numeros',
    ],
  };
}

/**
 * La batería de una fila pegada a su modelo y capacidad (" 85-93%", " sellado"), o '' (01/10/2026:
 * la de la columna tal cual, y "sellado" en los sellados; ver `bateriaDe` en cotizador.js).
 */
function conBateria(f) {
  const b = bateriaDe(f);
  return b ? ` ${b}` : '';
}

/** Una línea del bloque de precios. En una unidad puntual el detalle va ANTES del precio. */
function lineaDePrecio(f) {
  const nombre = f.modelo.replace(/^iPhone\s*/i, 'Ip ');
  const cap = f.capacidad_gb ? ` ${f.capacidad_gb}gb` : '';
  const bat = conBateria(f);
  const precio = Math.round(f.precio_contado).toLocaleString('es-AR');
  const detalle = [f.color, f.detalles]
    .filter(Boolean)
    .map((x) => String(x).toLowerCase())
    .join(', ');
  return detalle
    ? `${nombre}${cap}${bat} ${detalle} - ${precio}`
    : `${nombre}${cap}${bat} ${precio}`;
}

/**
 * La lista de precios como bloque pelado, tal cual la manda Fran:
 *   Ip 13 128gb 100% 495.000
 *   Ip 14 +80% 540.000
 * Una línea por modelo, sin adornos, con la batería siempre pegada al precio.
 *
 * El `tope` vale SOLO para el catálogo. Las unidades puntuales de USADOS que
 * están disponibles van como bloque aparte, debajo, y no compiten por el cupo:
 * ninguna liquidación puede voltear a un modelo de catálogo.
 */
const vendible = (f) => f.cotizable && f.precio_contado > 0;
const porPrecio = (a, b) => a.precio_contado - b.precio_contado;

// Todos los modelos cotizables (decisión de Tomás del 28/09/2026). Hasta entonces iban los
// 6 más baratos y del 15 Pro para arriba no salían. `tope` queda por si algún día hace falta.
function listaDePrecios(datos, tope = Infinity) {
  return (datos.lista || [])
    .filter(vendible)
    .sort(porPrecio)
    .slice(0, tope)
    .map(lineaDePrecio)
    .join('\n');
}

/**
 * La misma lista, partida en los usados y los sellados (bloque Ninjo 1b, 05/10/2026): la usa la
 * herramienta `lista_de_precios` de Sonnet (cerebro.js), que la manda en dos mensajes tal cual. El
 * bot de siempre sigue con `listaDePrecios`.
 */
function listaDePreciosPartida(datos) {
  const filas = (datos.lista || []).filter(vendible).sort(porPrecio);
  const de = (sellado) => filas.filter((f) => esSellado(f) === sellado).map(lineaDePrecio).join('\n');
  return { usados: de(false), sellados: de(true) };
}

/** Tope duro de unidades en el bloque, por más que sobre presupuesto. */
const TOPE_UNIDADES = 5;

/**
 * Lo que tolera la regla de mensajes cortos. El bloque se recorta para entrar
 * acá: el tope de unidades es un máximo, pero el que manda es el largo.
 */
const LARGO_MAXIMO = 220;

/**
 * El pie cuando quedaron unidades afuera. Es texto fijo y sin ningún número:
 * no se promete un stock que después haya que sostener, y no lo redacta el
 * modelo.
 */
const HAY_MAS_UNIDADES = 'tengo algunos mas, decime cual estas buscando';

/**
 * Las unidades puntuales de USADOS que están disponibles, para mandar en su
 * PROPIO mensaje debajo del catálogo. Van de más barata a más cara.
 *
 * Entran como mucho `tope`, pero el corte real es por caracteres: si el bloque
 * no entra en LARGO_MAXIMO se saca la más cara de las mostradas y se vuelve a
 * medir, hasta que entre. Contar unidades no alcanza — una unidad con Detalles
 * largo ocupa casi el doble que una sin nada cargado.
 *
 * La línea de cierre se cuenta DENTRO del presupuesto: por eso se arma el
 * texto completo en cada vuelta y recién ahí se mide. Aparece siempre que
 * quede alguna unidad afuera, sea por el tope o por el recorte.
 *
 * Siempre sale al menos una: un mensaje vacío es peor que uno largo. Si ni esa
 * entra, se manda igual y queda anotado en el log.
 */
function listaDeUnidades(datos, tope = TOPE_UNIDADES) {
  const unidades = (datos.usados || []).filter(vendible).sort(porPrecio);
  if (!unidades.length) return '';

  const armar = (n) => {
    const lineas = unidades.slice(0, n).map(lineaDePrecio);
    if (unidades.length > n) lineas.push(HAY_MAS_UNIDADES);
    return lineas.join('\n');
  };

  let cuantas = Math.min(tope, unidades.length);
  let bloque = armar(cuantas);
  while (bloque.length > LARGO_MAXIMO && cuantas > 1) {
    cuantas -= 1;
    bloque = armar(cuantas);
  }

  if (bloque.length > LARGO_MAXIMO) {
    console.warn(
      `[lista] la unidad mas barata sola ocupa ${bloque.length} caracteres y no entra en ` +
        `${LARGO_MAXIMO}. La mando igual, pero conviene acortar su Detalles en la planilla.`
    );
  }
  return bloque;
}

/**
 * El orden de los modelos (desde cero, 29/09/2026): por número, y en el mismo número común (o
 * mini), Plus, Pro y Pro Max. "13 pro" -> 132, "14" -> 140. Infinity si no es un modelo del 11
 * en adelante. Lo usan el filtro de la lista y el modelo más parecido (D7).
 */
const VARIANTES = ['', 'plus', 'pro', 'pro max'];
function partesDeModelo(modelo) {
  const m = normalizar(modelo)
    .replace(/\biphone\b|\bip\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\bpromax\b/, 'pro max');
  const p = m.match(/^(1[1-9])(?: (mini|plus|pro max|pro))?$/);
  if (!p) return null;
  return { numero: Number(p[1]), variante: p[2] === 'mini' ? 0 : VARIANTES.indexOf(p[2] || '') };
}
function rangoDeModelo(modelo) {
  const p = partesDeModelo(modelo);
  return p ? p.numero * 10 + p.variante : Infinity;
}

/**
 * El modelo más parecido que sí hay, cuando el que pidió no está en la planilla (desde cero,
 * D7, decisión de Tomás del 29/09/2026). Hasta el 29/09 se ofrecía el más barato de toda la
 * planilla (el 11 de 64GB con el marco marcado, a quien pedía un 18 Pro Max):
 *  1. del mismo número, la variante más cercana en el orden común (o mini) → Plus → Pro →
 *     Pro Max; si empatan, la de abajo;
 *  2. si no hay ninguna de ese número, la misma variante del número más cercano, empezando
 *     por el de arriba;
 *  3. si no hay nada así, null: no se ofrece alternativa.
 * Del modelo elegido va la fila cotizable más barata. Los anteriores al 11 ya no están
 * (`leerPlanilla`). Con la copia del 08/09: 14 Pro Max → 14 Pro; 15 Pro Max → 15 Pro; 12 Pro →
 * el 12 de 64GB; 18 Pro Max → 17 Pro Max.
 */
function masParecido(datos, pedido) {
  const p = partesDeModelo(pedido);
  if (!p) return null;
  const hay = [...(datos.lista || []), ...(datos.usados || [])]
    .filter((f) => f.cotizable && f.precio_contado > 0)
    .map((f) => ({ f, p: partesDeModelo(f.modelo) }))
    .filter((x) => x.p);
  const masBarata = (xs) => xs.slice().sort((a, b) => a.f.precio_contado - b.f.precio_contado)[0].f;
  const mismoNumero = hay.filter((x) => x.p.numero === p.numero);
  if (mismoNumero.length) {
    const distancia = (x) => Math.abs(x.p.variante - p.variante);
    const menor = Math.min(...mismoNumero.map(distancia));
    const variante = Math.min(...mismoNumero.filter((x) => distancia(x) === menor).map((x) => x.p.variante));
    return masBarata(mismoNumero.filter((x) => x.p.variante === variante));
  }
  const numeros = [...new Set(hay.filter((x) => x.p.variante === p.variante).map((x) => x.p.numero))];
  if (!numeros.length) return null;
  const d = Math.min(...numeros.map((n) => Math.abs(n - p.numero)));
  const numero = numeros.includes(p.numero + d) ? p.numero + d : p.numero - d;
  return masBarata(hay.filter((x) => x.p.variante === p.variante && x.p.numero === numero));
}

/** ¿Es un modelo que se trabaja y no está en la planilla? (D7) */
function noEstaCargado(datos, modelo) {
  return Boolean(modelo) && !noSeTrabaja(modelo) && Boolean(partesDeModelo(modelo)) && !sheets.buscarModelo(datos, modelo, null);
}

/**
 * "del 15 para abajo", "del 14 pro hacia abajo", "hasta el 14 pro" (desde cero, 29/09/2026):
 * la lista hasta ese modelo, incluido. Devuelve su rango (`rangoDeModelo`) o null.
 */
const FILTRO_LISTA =
  /\b(?:del (?:iphone |ip )?(1[1-8])( pro max| pro| plus| mini)? (?:para|pa|hacia) abajo|hasta el (?:iphone |ip )?(1[1-8])( pro max| pro| plus| mini)?)\b/;
function filtroDeLista(mensaje) {
  const m = normalizar(mensaje).replace(/\s+/g, ' ').match(FILTRO_LISTA);
  if (!m) return null;
  return rangoDeModelo(`${m[1] || m[3]}${m[2] || m[4] || ''}`);
}

/**
 * "¿y otros?", "¿qué otros modelos tenés?" (desde cero, 29/09/2026): la lista. No "¿y otros
 * colores?", ni (segunda vuelta, 30/09/2026) "otros días", "otros horarios" u "otros medios de pago".
 */
const PIDE_OTROS =
  /\b(?:y|que|hay|tenes|tienen|algunos|mostrame|pasame) otros(?: modelos)?\b(?!\s+(?:colou?res|dias|horarios?|medios|metodos|modos|lugares|locales)\b)/;

/**
 * La respuesta a "pasame la lista / que tenes / precios".
 *
 * Vive aparte porque se consulta ANTES de mirar qué modelo veníamos hablando:
 * si la persona pide la lista, gana la lista. Devuelve null si no hay nada que
 * mandar, para que el que llama siga con el árbol normal.
 */
function responderLista(chatId, ctx, todos, filtro = null) {
  // "del 15 para abajo" (desde cero, 29/09/2026): solo esos modelos, del catálogo y de las
  // unidades. No es pedirla otra vez: va sin "te la paso de nuevo".
  const pasa = (f) => !filtro || rangoDeModelo(f.modelo) <= filtro;
  const datos = filtro ? { ...todos, lista: todos.lista.filter(pasa), usados: todos.usados.filter(pasa) } : todos;
  // Si ya se la pasamos, va de nuevo y completa (decisión de Tomás del 28/09/2026: antes
  // contestaba "ya te pase la lista mas arriba"). La entrada y el cierre cambian para que
  // el filtro de repetidos no se los coma; el bloque de precios no pasa por ese filtro.
  const otraVez = Boolean(ctx.listaEnviada) && !filtro;

  // Sin nada cotizable no hay lista que mandar.
  if (!datos.lista.some((f) => f.cotizable && f.precio_contado > 0)) return null;

  // Las unidades puntuales van en su propio mensaje, pegado debajo del
  // catálogo, para que ninguno de los dos quede largo.
  const unidades = listaDeUnidades(datos);
  // La marca viaja con el bloque de precios: si ese mensaje no llega a salir, la
  // lista sigue pendiente y el bot la vuelve a ofrecer (bloque 3).
  const mensajes = [
    otraVez
      ? 'dale, te la paso de nuevo'
      : `siii te paso unos precios asi ves cual te queda mas comodo, ${RANGO_MODELOS}`,
    acciones.conMarcas(listaDePrecios(datos), { listaEnviada: true }),
  ];
  if (unidades) mensajes.push(unidades);
  // Acá NO se ofrecen cuotas: primero que elija el modelo.
  mensajes.push(
    otraVez
      ? 'decime cual te gusto y con cuanto contas asi te armo los numeros'
      : 'contame que modelito te gusta y cual se acopla mas a vos'
  );
  return { mensajes };
}

/**
 * Nombró varios modelos y alguno no está en la planilla (desde cero, decisión de Tomás del
 * 29/09/2026): el precio de contado de los que están (uno por línea, o el bloque si son más de
 * dos) y, de cada uno que falta, "el <modelo> justo no me esta quedando" con el más parecido y
 * su precio (D7), si no es uno de los que ya nombró. Escala sin callar: el aviso al grupo dice
 * qué modelo pidió y no está cargado, para cargarlo. `colores`: además preguntó por colores.
 */
function conLosQueFaltan(ctx, datos, presentes, faltan, colores = false) {
  const mostrados = presentes.map((f) => f.modelo);
  const lineas = [];
  if (presentes.length <= 2) {
    for (const f of presentes) lineas.push(`el ${nombreParaDecir(f.modelo)} lo tenemos en ${pesos(contadoDe(f, ctx))} de contado`);
  } else {
    lineas.push(presentes.map((f) => `${lineaDePrecio({ ...f, precio_contado: contadoDe(f, ctx) })}`).join('\n'));
  }
  for (const m of faltan) {
    const alt = masParecido(datos, m);
    const nuevo = alt && !mostrados.includes(alt.modelo);
    if (nuevo) mostrados.push(alt.modelo);
    lineas.push(
      `el ${nombreParaDecir(m)} justo no me esta quedando${nuevo ? `, pero tengo el ${nombreParaDecir(alt.modelo)} en ${pesos(contadoDe(alt, ctx))}` : ''}`
    );
  }
  let mensajes = [...lineas, estilo.frase('cualTeGusta')];
  if (mensajes.length > TOPE_TANDA) mensajes = [lineas.join('\n'), mensajes[mensajes.length - 1]];
  mensajes[0] = acciones.conMarcas(mensajes[0], { preciosMostradosDe: mostrados });
  const motivo = `${faltan.map((m) => `pidió "${m}"`).join(' y ')} y no está cargado en la planilla${colores ? '; también pregunta por colores' : ''}`;
  return escalar(motivo, ctx, mensajes, { callar: false });
}

/**
 * Pasa la conversación a una persona. Sin `extraCliente` no se le dice nada al
 * cliente: es escalar en silencio, e index.js igual avisa al grupo.
 */
function escalar(motivo, s, extraCliente, { callar = true } = {}) {
  const mensajes = Array.isArray(extraCliente)
    ? extraCliente.filter(Boolean)
    : extraCliente
      ? [extraCliente]
      : [];
  // `callar: false` para los escalados de "no entendí": avisan al grupo y quedan en
  // el resumen, pero el bot sigue atendiendo. Si callaran, un cliente al que no se
  // le entendieron dos mensajes quedaría sin respuesta hasta que alguien lo tome, y
  // el crédito sin venta no llegaría a su aviso (decidido con Tomás el 15/09/2026).
  return { escalar: true, motivo, mensajes, callar };
}

// Desde el bloque 5 (16/09/2026) no hay "POSIBLE EXCEPCIÓN": hasta TOPE_BAJO_MINIMO
// ($45.000 desde el 5b) bajo el mínimo se cotiza con recargo (cotizador.js) y los
// umbrales de CONFIG no se leen. Desde el 5b, antes del recargo se insiste dos veces
// con la entrega inicial (ver la sección 4 de `decidir`).

function porcentajeEntrega(fila) {
  if (!fila || !fila.precio_contado || !fila.anticipo_min) return 0;
  const exacto = (fila.anticipo_min / fila.precio_contado) * 100;
  return Math.ceil(exacto / 5) * 5;
}


/**
 * Mensajes que no se entienden: cuándo pasan a una persona.
 *
 * Decidido con Tomás el 14/09/2026, después de medir que la mitad de las
 * escalaciones eran por no entender. Antes un contador (`mensajesSinContenido`)
 * sumaba el primer mensaje no entendido y NUNCA volvía a cero: un "👍" días
 * después mandaba el chat a una persona. Ahora:
 *  1. Escala recién con dos mensajes no entendidos SEGUIDOS.
 *  2. Cualquier mensaje entendido corta la cadena: vuelve a cero.
 *  3. Un acuse ("ok", "si", "no", un emoji solo) no cuenta: ni suma ni corta. El
 *     primero se contesta como siempre; los que le siguen, sin otro mensaje en el
 *     medio, no se contestan.
 *
 * "Seguidos" se mira en el historial y no en un número: la marca guarda qué
 * mensaje fue, y cualquier otro mensaje del cliente que haya llegado después
 * (salvo un acuse) la deja vieja. Así también corta la cadena un mensaje que el
 * bot no evaluó porque atendía una persona, y el `mensajesSinContenido` de los
 * chats de antes se ignora sin tocar el estado.
 */
const ACUSES = /^(s+i+|si+p|o+k+[aeiy]*|okey|okay|dale+|listo|joya|bueno+|buenisimo|genial|perfecto|n+o+|ya|claro|obvio|va|aja)$/;

function esAcuse(texto) {
  const t = normalizar(texto).trim();
  if (!t) return false;
  if (!/[a-z0-9]/.test(t)) return true; // solo emojis o signos
  const palabras = t.replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/);
  return palabras.length === 1 && ACUSES.test(palabras[0]);
}

/**
 * Dónde está en el historial lo que se está decidiendo: { inicio, fin }, o null.
 * Con `lineas` (una tanda de index.js: varios mensajes seguidos que se juntaron)
 * va de la primera línea de la tanda a la última. Sin tanda, es la última línea
 * del cliente con ese texto.
 */
function lineasDelMensaje(historial, mensaje, lineas) {
  const buscar = (texto, ts, desde) => {
    for (let i = desde; i >= 0; i--) {
      const l = historial[i];
      if (l.quien === 'cliente' && l.texto === texto && (ts == null || l.ts === ts)) return i;
    }
    return -1;
  };
  if (lineas && lineas.length) {
    const ultima = lineas[lineas.length - 1];
    const fin = buscar(ultima.texto, ultima.ts, historial.length - 1);
    if (fin < 0) return null;
    const inicio = buscar(lineas[0].texto, lineas[0].ts, fin);
    return inicio < 0 ? null : { inicio, fin };
  }
  const i = buscar(mensaje, null, historial.length - 1);
  return i < 0 ? null : { inicio: i, fin: i };
}

/**
 * ¿La marca es del mensaje anterior del cliente, sin contar acuses? Es lo que
 * quiere decir "seguido", tanto para los mensajes no entendidos como para los
 * acuses. Sin historial no hay forma de saberlo y se toma como que no: no se
 * escala ni se calla a ciegas.
 */
function marcaSeguida(marca, historial, mensaje, lineas) {
  if (!marca) return false;
  const h = historial || [];
  // Desde el principio de la tanda: sus propias líneas no cortan la cadena.
  const pos = lineasDelMensaje(h, mensaje, lineas);
  if (!pos) return false;
  const actual = pos.inicio;
  let previo = -1;
  for (let i = actual - 1; i >= 0; i--) {
    if (h[i].quien === 'cliente' && h[i].ts === marca.ts && h[i].texto === marca.texto) {
      previo = i;
      break;
    }
  }
  if (previo < 0) return false; // la marca es de un mensaje que ya no está: vieja
  return !h.slice(previo + 1, actual).some((l) => l.quien === 'cliente' && !esAcuse(l.texto));
}

/**
 * Un mensaje que no se entendió. El primero pregunta; el segundo seguido escala
 * con `escalada()`. Un acuse se contesta igual, pero no cuenta. Devuelve la
 * respuesta con `noEntendido` para que `decidirYFormatear` no borre la marca.
 *
 * La marca `noEntendido` cuenta solo si la pregunta le llegó (Pendientes 2, decisión
 * de Tomás del 21/09/2026): viaja con la pregunta, como `acuseContestado`, y la
 * confirma index.js con el id de Evolution en la mano. Antes se anotaba al decidir:
 * en escucha, en borrador o con una tanda cortada contaba igual, y un cliente con dos
 * mensajes raros quedaba escalado sin haber recibido nunca la pregunta.
 */
function noSeEntiende(chatId, s, mensaje, seguido, escalada, lineas, { yaPreguntamos = false } = {}) {
  const pregunta = { mensajes: ['contame que estabas buscando asi te ayudo'] };
  const h = s.historial || [];
  // La marca apunta a la última línea: la de la tanda, si llegaron varios mensajes juntos.
  const pos = lineasDelMensaje(h, mensaje, lineas);
  const i = pos ? pos.fin : -1;
  // Una tanda es un acuse si todas sus líneas lo son ("ok" + "👍").
  const acuse = lineas && lineas.length > 1 ? lineas.every((l) => esAcuse(l.texto)) : esAcuse(mensaje);
  if (acuse) {
    // El primer acuse se contesta como siempre. Los que le siguen, sin otro mensaje
    // en el medio, no: "ok", "👍", "ok" no merece tres "contame que estabas buscando".
    // Tampoco si lo último que le mandó el bot ya fue esa pregunta (desde cero, 29/09/2026).
    if (yaPreguntamos || marcaSeguida(s.acuseContestado, h, mensaje, lineas)) return { mensajes: [], noEntendido: 'acuse' };
    // La marca la confirma la pregunta al salir: si no sale, el próximo acuse se
    // contesta igual.
    const marca = { acuseContestado: i >= 0 ? { ts: h[i].ts, texto: h[i].texto } : null };
    return {
      ...pregunta,
      mensajes: pregunta.mensajes.map((m) => acciones.conMarcas(m, marca)),
      noEntendido: 'acuse',
    };
  }
  // La marca pasa a ser este mensaje: un tercero seguido también escala. Si lo último que
  // le mandó el bot fue la pregunta genérica, este es el segundo que no se entiende, lo
  // haya leído Gemini como `otro` o `saludo` (desde cero, 29/09/2026).
  const marca = { noEntendido: i >= 0 ? { ts: h[i].ts, texto: h[i].texto } : null };
  if (seguido || yaPreguntamos) {
    // Escala callado: no hay mensaje que lleve la marca, así que se anota acá, como
    // siempre. Hasta acá se llega solo si la pregunta anterior le había llegado.
    state.actualizar(chatId, marca);
    return { ...escalada(), noEntendido: 'escala' };
  }
  // La pregunta confirma la marca al salir: si no sale, el próximo mensaje raro
  // vuelve a preguntar en vez de escalar.
  return {
    ...pregunta,
    mensajes: pregunta.mensajes.map((m) => acciones.conMarcas(m, marca)),
    noEntendido: 'primero',
  };
}

/**
 * ¿Lo último que le mandó el bot fue la pregunta genérica? (desde cero, 29/09/2026) "contame
 * que estabas buscando asi te ayudo", "contame que estas buscando y con cuanto contas",
 * "decime que modelo estabas buscando…". Mira la última tanda de la cuenta, como
 * `ultimaTandaPideMonto`: si la escribió una persona, no. Un mensaje que no trae nada
 * después de esa pregunta cuenta como el segundo que no se entiende (grupo 4: "Aaaa",
 * "Listooo 😅" o "qué bueno!!" recibían la misma pregunta tres o cuatro veces). Vale la
 * pregunta de hoy: al otro día un "hola" es una charla nueva y lleva su saludo.
 */
// La de "no se entiende" ("contame que estabas buscando asi te ayudo") no está: esa lleva su
// marca, `noEntendido`, que solo cuenta si le llegó.
const PREGUNTA_GENERICA =
  /contame que estas buscando|contame que estabas mirando|decime que modelo estabas buscando|contame que modelito tenias en mente|decime que modelito te interesa y que presupuesto/;
// Contesta nuestro "¿cómo estás?": un saludo o un "bien, ¿vos?" no es un mensaje que no se
// entiende (bloque 9: "hola" + "buenas como andan" + "tenés el 13?" se contesta entero).
const SALUDO_QUE_PREGUNTA = /\b(como estas|como andas|como va todo|todo bien)\s*\?|\bvos\s*\?|\bvos como (andas|estas)\b/;
const CORTESIA =
  /^[^a-z0-9]*(?:hola+|buenas+|buen dia|buenos dias|buenas tardes|buenas noches|bien|muy bien|re bien|todo bien|todo tranqui|tranqui|joya|barbaro|aca andamos|por suerte)\b/;
function contestaElSaludo(mensaje, historial) {
  const t = normalizar(mensaje).trim();
  if (!CORTESIA.test(t) && !preguntaComoEstan(mensaje)) return false;
  const lineas = historial || [];
  let i = lineas.length - 1;
  while (i >= 0 && lineas[i].quien === 'cliente') i--;
  for (; i >= 0 && lineas[i].quien === 'vendedor'; i--) {
    if (SALUDO_QUE_PREGUNTA.test(normalizar(lineas[i].texto))) return true;
  }
  return false;
}
function ultimaTandaFueGenerica(historial, ahora = Date.now()) {
  const lineas = historial || [];
  const hoy = DIA_ARGENTINA.format(ahora);
  let i = lineas.length - 1;
  while (i >= 0 && lineas[i].quien === 'cliente') i--;
  for (; i >= 0 && lineas[i].quien === 'vendedor'; i--) {
    if (lineas[i].humano) return false;
    const deHoy = Number(lineas[i].ts) > 0 && DIA_ARGENTINA.format(Number(lineas[i].ts)) === hoy;
    if (deHoy && PREGUNTA_GENERICA.test(normalizar(lineas[i].texto))) return true;
  }
  return false;
}

/**
 * El contexto con el que decide el árbol: el estado del chat, con `modelo` resuelto
 * (Pendientes 1, Parte A, decisión de Tomás del 18/09/2026).
 *
 * `modelo` es del cliente cuando lo nombra él, y marca del bot cuando lo elige el bot
 * (el más barato, el mejor que le entra con su monto, el que le conviene): esa marca
 * se confirma recién al enviarse (bloque 3). En escucha y en borrador nada sale, así
 * que el turno siguiente el bot no sabía qué equipo había recomendado y la simulación
 * perdía el hilo justo ahí. `modeloPropuesto` se guarda al decidir, siempre, y es el
 * respaldo del hilo SOLO cuando al cliente no le llega nada (`leLlegaAlCliente`). En
 * vivo la fuente de verdad sigue siendo `modelo`, sin excepción: si la tanda se cortó
 * y la recomendación no salió, el cliente no la vio y el bot no sigue con ella.
 *
 * Se resuelve una sola vez acá, para todo lo que lee `ctx.modelo` (el árbol y sus
 * ayudantes). Si el cliente nombró un modelo, `modelo` ya está guardado y gana.
 * Cuando no hay respaldo que aplicar, es el mismo objeto de siempre.
 */
function conModeloDelHilo(chatId, s) {
  const modelo = s.modelo || (evolution.leLlegaAlCliente(chatId) ? null : s.modeloPropuesto) || null;
  if (modelo === (s.modelo || null)) return s;
  // Una vista viva del estado con `modelo` resuelto: todo lo demás se sigue leyendo
  // del objeto real, así lo que se anote después en el chat se ve igual que hoy.
  return new Proxy(s, { get: (t, p, r) => (p === 'modelo' ? modelo : Reflect.get(t, p, r)) });
}

/**
 * @param {string} mensaje   lo que escribió el cliente. Si mandó varios mensajes
 *                           seguidos, index.js los junta con saltos de línea.
 * @param {object} llegada   `lineas`: las líneas del historial de esa tanda
 *                           ({ ts, texto }), para ubicarla. Sin tanda no hace falta.
 * @returns {{mensajes: string[], escalar?: boolean, motivo?: string}}
 */
/** Los datos del equipo que ofrece en un canje. */
const CAMPOS_DEL_CANJE = ['modelo', 'capacidad_gb', 'bateria', 'tiene_fotos'];

/**
 * Los datos del canje que trae este mensaje, sin los vacíos.
 *  - Del texto, siempre, también en el primer mensaje del canje (desde cero, 29/09/2026):
 *    el equipo pegado a "tengo", "mi", "entrego", "dejo" con su capacidad y su batería
 *    ("mi celular iPhone 14 con 77%"). Hasta el 29/09 el primer mensaje solo tomaba lo que
 *    leía Gemini, que muchas veces lo dejaba vacío, y el bot volvía a pedirlos.
 *  - Con un canje en curso, además, lo que dice sin nombrar el canje: "128gb, bateria 90%"
 *    (el extractor local solo arma `permuta` si lo nombra, bloque 5). Un modelo suelto
 *    cuenta solo si el canje todavía no tiene modelo, y si viene con su capacidad o su batería
 *    o contesta "pasame modelo" ("un 13"); en una pregunta de precio o stock ("¿cuánto sale el
 *    15 pro?", "¿tenés el 13 de 256?") no es su equipo (D2), salvo que la pregunta sea del canje
 *    ("es de 128 con 85%, ¿cuánto me das?").
 *  - Lo que leyó Gemini (o el extractor local) en `permuta`, si `usarLectura`: en un canje
 *    en curso, solo cuando el mensaje habla del canje, porque Gemini lo arrastra de la charla.
 *  - `fotos` (D1): fotos sin texto en esta tanda cuentan como "mandó fotos".
 * Lo del texto le gana a lo que leyó Gemini.
 */
const PREGUNTA_DE_STOCK = /\b(tenes|tienen|tendras|tendrias|hay|stock|queda|quedan|disponible|precio|precios|valor|cuanto)\b/;

function datosDelCanje(info, mensaje, { enCurso = false, previa = {}, fotos = 0, usarLectura = true } = {}) {
  const datos = {};
  for (const [c, v] of Object.entries(local.datosDelCanjeEnTexto(mensaje))) if (v) datos[c] = v;
  if (enCurso) {
    const t = normalizar(mensaje);
    // Una pregunta que es del canje ("es de 128 con 85% de batería, ¿cuánto me das?") trae los
    // datos de SU equipo (segunda vuelta, 30/09/2026): "cuánto" la hacía pasar por una de stock.
    const pregunta = (preguntaPrecio(mensaje) || PREGUNTA_DE_STOCK.test(t)) && !local.hablaDelCanje(mensaje);
    const bateria = local.extraerBateria(mensaje);
    const capacidad = local.extraerCapacidad(mensaje);
    const modelos = local.extraerModelos(t);
    if (!pregunta) {
      if (bateria && !datos.bateria) datos.bateria = bateria;
      if (capacidad && !datos.capacidad_gb) datos.capacidad_gb = capacidad;
      const corto =
        t.replace(/[^a-z0-9\s]/g, ' ').trim().split(/\s+/).length <= 5 &&
        !/\b(quiero|queria|busco|buscaba|me interesa|me gusta)\b/.test(t);
      // Solo si el canje todavía no tiene modelo (segunda vuelta, 30/09/2026): con el 12 en
      // curso, "¿y el 15?" pisaba el 12 y escalaba como "mandó los datos del equipo". Uno que
      // no se trabaja sí ("no, es un iphone 8", bloque 10): no lo vendemos, solo puede ser el suyo.
      const puedeSerElSuyo = !previa.modelo || noSeTrabaja(modelos[0]);
      if (!datos.modelo && puedeSerElSuyo && modelos.length === 1 && (bateria || capacidad || corto)) datos.modelo = modelos[0];
    }
  }
  if (usarLectura) {
    for (const c of CAMPOS_DEL_CANJE) if (info.permuta && info.permuta[c] && !datos[c]) datos[c] = info.permuta[c];
  }
  if (fotos) datos.tiene_fotos = true;
  return datos;
}

/**
 * Canje: ofrece su celular como parte de pago. El bot no tasa nada (bloque 5, decisión de
 * Tomás del 16/09/2026): pide los datos sin prometer ("asi te cotizamos" se sacó), y cuando
 * los manda después del pedido escala callado con el aviso al grupo. Si todavía no mandó
 * nada, se le dice qué falta: una sola vez por canje (desde cero, D2, decisión de Tomás del
 * 29/09/2026). Si vuelve a escribir del canje sin ningún dato nuevo, escala callado. La
 * marca `permutaSinDatosDicho` viaja con ese mensaje y se confirma al salir.
 *
 * `nuevos`: lo que trae esta tanda (`datosDelCanje`). La tanda de solo fotos (D1) llega
 * acá con `{ tiene_fotos: true }`.
 */
function responderCanje(chatId, ctx, { nuevos, noTrabajado = null, mensaje = '' }) {
  const previa = ctx.permuta || {};
  const limpiarCanje = { permuta: null, permutaDatosPedidos: false, permutaSinDatosDicho: false };
  // Se van juntando los datos entre mensajes, no hace falta que vengan todos de una.
  // Un dato vacío no pisa uno que ya había mandado.
  const p = { ...previa, ...nuevos, ofrece: true };
  // Gemini a veces deja el equipo del canje como `modelo` y no en `permuta` (en vivo, 25/09,
  // d07eb08: "me tomás un iphone 8?" pedía los datos del 8). Si es uno que no se trabaja, es
  // el del canje.
  if (!p.modelo && noTrabajado) p.modelo = noTrabajado;
  // Un Android u otra marca (desde cero, D3, decisión de Tomás del 29/09/2026): no se toma,
  // como los anteriores al 11. Sin pedir datos, sin escalar y sin dejar un canje en curso.
  if (local.esOtraMarca(mensaje) && !local.datosDelCanjeEnTexto(mensaje).modelo) {
    if (previa.ofrece) state.actualizar(chatId, limpiarCanje);
    return { mensajes: ['solo tomamos iphone del 11 en adelante'] };
  }
  // Un equipo anterior al 11 no se toma (bloque 10, decisión de Tomás del 25/09/2026): solo
  // "a partir del 11", sin pedirle capacidad ni batería y sin dejar un canje en curso (lo
  // que mande después no escala como canje, aunque antes hubiera ofrecido otro). El modelo
  // que pidió para comprar en el mismo mensaje queda como el del chat, como siempre.
  if (p.modelo && noSeTrabaja(p.modelo)) {
    if (previa.ofrece) state.actualizar(chatId, limpiarCanje);
    return { mensajes: ['tomamos celulares a partir del 11'] };
  }
  const faltan = [];
  if (!p.modelo) faltan.push('modelo');
  if (!p.capacidad_gb) faltan.push('almacenamiento');
  if (!p.bateria) faltan.push('condicion de bateria');
  if (!p.tiene_fotos) faltan.push('unas fotos');

  state.actualizar(chatId, { permuta: p });

  if (ctx.permutaDatosPedidos) {
    const mandoDatos = CAMPOS_DEL_CANJE.some((c) => nuevos[c] && nuevos[c] !== previa[c]);
    if (mandoDatos) return escalar('ofrece un canje: su celular como parte de pago (mandó los datos del equipo)', ctx);
    if (faltan.length) {
      if (ctx.permutaSinDatosDicho) return escalar('canje: no manda los datos del equipo', ctx);
      return {
        mensajes: [
          acciones.conMarcas(`sin ${faltan.join(' y ')} no te puedo pasar el numero exacto`, { permutaSinDatosDicho: true }),
        ],
      };
    }
  }
  if (faltan.length) {
    return {
      mensajes: [
        'tomamos celulares a partir del 11',
        acciones.conMarcas(`pasame ${faltan.join(', ')}`, { permutaDatosPedidos: true }),
      ],
    };
  }
  // Callado: "ahora te paso el numero" era una promesa que el bot no cumple (Mejora 1).
  return escalar('ofrece un canje: su celular como parte de pago (con los datos completos)', ctx);
}

/**
 * Una tanda que es solo fotos, sin texto (desde cero, D1, decisión de Tomás del 29/09/2026).
 * En un canje en curso cuentan como "mandó fotos" y entran por el mismo camino que cualquier
 * dato nuevo del canje: con los datos ya pedidos, escala callado. Varias fotos o un álbum
 * son un solo evento: si el canje ya las tenía, no hay nada nuevo. Fuera de un canje, como
 * hoy: no se hace nada (index.js ni siquiera la manda acá).
 */
function soloFotos(chatId, s) {
  if (!s.permuta?.ofrece || s.escalado || s.permuta.tiene_fotos) return { mensajes: [] };
  return responderCanje(chatId, conModeloDelHilo(chatId, s), { nuevos: { tiene_fotos: true } });
}

/**
 * ¿El cliente sigue algo que dejó dicho una persona de la cuenta? (01/10/2026, decisión de Tomás;
 * caso Jazz …5915: la persona escribió "ahi te confirmo bien que tengo al 100%" y "dame un rato
 * que consulte al deposito", y al "y? tenes al 100?" el bot contestaba por su cuenta.)
 *
 * Cuentan las líneas de persona de las últimas DATOS_VIEJOS_HORAS (72 h), también las que el
 * historial ya perdió (`state.lineasDePersona`). La frase que leyó Gemini (`dijo_persona`: algo
 * pendiente o acordado, nunca un dato de stock) tiene que estar, sin tildes, mayúsculas ni signos,
 * en una de esas líneas: si la inventó, no cuenta. Si Gemini falló (extractor local) y hay alguna
 * línea de persona en la ventana, también: sin Gemini no se sabe de qué habla. Devuelve el motivo
 * del escalado, con lo que dijo la persona, o null.
 */
const paraComparar = (texto) => normalizar(texto).replace(/[^a-z0-9]+/g, ' ').trim();
function sigueLoQueDijoUnaPersona(s, info, nombre = null, ahora = Date.now()) {
  const ventana = config.datosViejosHoras * 60 * 60 * 1000;
  const recientes = state.lineasDePersona(s).filter((l) => ahora - l.ts <= ventana);
  if (!recientes.length) return null;
  const entreComillas = (l) => `"${l.texto.replace(/\s+/g, ' ').trim().slice(0, 150)}"`;
  if (info._geminiFallo) {
    return `Gemini no leyó el mensaje y hace poco escribió una persona de la cuenta: ${recientes
      .slice(-3)
      .map(entreComillas)
      .join(' / ')}`;
  }
  const frase = paraComparar(info.dijo_persona);
  // Gemini vio las líneas sin el nombre del cliente ("[cliente]", gemini.sinDatosPersonales) y
  // puede copiar la frase así: también vale (verificación del 01/10/2026).
  const comoLaVio = (t) => paraComparar(gemini.sinDatosPersonales(t, nombre));
  const linea =
    frase &&
    [...recientes].reverse().find((l) => paraComparar(l.texto).includes(frase) || comoLaVio(l.texto).includes(frase));
  return linea ? `sigue algo que dijo una persona de la cuenta: ${entreComillas(linea)}` : null;
}

/**
 * `alSalir`: lo que esta decisión deja para confirmar cuando la respuesta SALE, y que
 * no es de ningún mensaje en particular (hoy, `sinVenta`). Lo llena `decidir` y lo
 * cuelga `decidirYFormatear` del primer mensaje, ya filtrada la respuesta.
 */
async function decidir(chatId, mensaje, pushName, llegada = {}, alSalir = {}) {
  const s = state.obtener(chatId);
  // Fotos sin texto y nada más (desde cero, D1): solo cuentan en un canje en curso.
  if (llegada.fotos && !String(mensaje || '').trim()) return soloFotos(chatId, s);
  // El nombre guardado también pasa por la limpieza: los chats viejos tienen el
  // pushName crudo ("🇦🇷RSS", "HH") y de ahí salían los saludos rotos.
  const nombre = primerNombre(s.nombre) || primerNombre(pushName);
  if (nombre && s.nombre !== nombre) state.actualizar(chatId, { nombre });

  const historial = state.historialTexto(chatId);
  // Con las últimas líneas de una persona de la cuenta aparte, aunque el historial ya no las
  // tenga (01/10/2026, ver `sigueLoQueDijoUnaPersona`).
  const info = await gemini.entender(historial, mensaje, nombre, state.lineasDePersona(s));
  // Un mensaje corto que es un modelo solo ("x?", "13?") es ese modelo, lea lo que lea
  // Gemini (prueba en vivo del 25/09 con d07eb08: Gemini lo leía sin modelo y contestaba
  // "contame que estabas buscando"). Mismo criterio que el extractor local (bloque 10).
  if (!info.modelo && !(info.modelos || []).length && normalizar(mensaje).replace(/[^a-z0-9]/g, '').length < 4) {
    const corto = local.entender(mensaje);
    if (corto.modelo) {
      info.modelo = corto.modelo;
      info.modelos = corto.modelos;
      info.intencion = corto.intencion;
    }
  }

  // Montos que se leen sobre el mensaje crudo, lea lo que lea Gemini (bloque 5,
  // decisión de Tomás del 16/09/2026):
  //  - una corrección ("tengo 400" + "perdón, 500"): gana el último monto;
  //  - un número suelto ("500"), solo después de una cotización o de la pregunta por
  //    la entrega;
  //  - con un monto, el mensaje no es una disculpa.
  if (local.esCorreccion(mensaje)) {
    const corregido = local.extraerMonto(mensaje);
    if (corregido && corregido !== info.entrega) {
      info.entrega = corregido;
      info._entregaFuente = 'local';
    }
  } else {
    // Entrega partida por forma de pago (muestra de repro-v1, #154; decisión de Tomás del
    // 28/09/2026): "tengo 180 en efectivo y 120 en transferencia" son $300.000. Gemini leía
    // 180.000 y el bot cotizaba con eso. La suma le gana a Gemini; con una corrección sigue
    // ganando la corrección, como hoy.
    const partida = local.entregaPartida(mensaje);
    if (partida && partida !== info.entrega) {
      info.entrega = partida;
      info._entregaFuente = 'local';
    }
  }
  if (!info.entrega) {
    const suelto = local.montoSuelto(mensaje);
    if (suelto && ultimaTandaPideMonto(s.historial)) {
      info.entrega = suelto;
      info._entregaFuente = 'local';
      info.intencion = 'declara_entrega';
    }
  }
  // Un número solo entre 50 y 100 ("90", "90%") es la batería de su equipo si se la acaban de
  // preguntar (el bot o una persona) o hay un canje en curso sin batería (muestra de repro-v1,
  // #368; decisión de Tomás del 28/09/2026): a una clienta le preguntaron la batería de su
  // canje, contestó "90" y Gemini lo leyó como $90.000 ("con ese monto por ahora no me queda
  // nada"). Con el canje en curso queda en `permuta.bateria` y sigue el camino del canje; sin
  // canje en el estado, escala callado más abajo. Y un número solo menor a 100, sin "mil", "k"
  // ni "lucas", nunca es una entrega, lea lo que lea Gemini: el mismo piso de `montoSuelto`.
  const canjeEnCurso = Boolean(s.permuta?.ofrece) && !s.escalado;
  const bateriaSuelta = local.bateriaSuelta(mensaje);
  const contestaBateria =
    Boolean(bateriaSuelta) && (ultimaTandaPideBateria(s.historial) || (canjeEnCurso && !s.permuta.bateria));
  const bateriaSinCanje = contestaBateria && !canjeEnCurso;
  if (contestaBateria) {
    info.entrega = null;
    info._entregaFuente = null;
    if (canjeEnCurso) {
      info.permuta = { ...(info.permuta || {}), ofrece: true, bateria: bateriaSuelta };
      info.intencion = 'permuta';
    }
  } else if (info.entrega && (local.numeroChicoSuelto(mensaje) || local.entregaDeNumeroChico(mensaje, info.entrega))) {
    info.entrega = null;
    info._entregaFuente = null;
    if (info.intencion === 'declara_entrega') info.intencion = local.entender(mensaje).intencion;
  }
  // Un monto en dólares no es una entrega en pesos (bloque 10, decisión de Tomás del
  // 25/09/2026): "tengo 420 dólares y el resto en pesos" quedaba como $420.000 y así salía
  // en el aviso al grupo. El extractor local ya no lo lee; si Gemini lo leyera, se queda con
  // lo que haya en pesos. El monto va aparte (`entregaDolares`) y el aviso lo dice en US$.
  const enDolares = local.montoEnDolares(mensaje);
  if (enDolares && [enDolares, enDolares * 1000].includes(info.entrega)) {
    info.entrega = local.extraerMonto(mensaje);
    info._entregaFuente = info.entrega ? 'local' : null;
  }
  // Un monto que viene con "promo" o "promoción" no es su entrega (desde cero, D9): "vi una
  // promoción con una entrega inicial de 400.000, ¿es vieja?" quedaba como su entrega y la
  // tanda siguiente le decía "con esos $400.000 te podés llevar el 14". Escala callado.
  const preguntaPromo =
    /\bpromo(?:s|cion|ciones)?\b/.test(normalizar(mensaje)) && Boolean(info.entrega || local.mencionaPosibleMonto(mensaje));
  if (preguntaPromo) {
    info.entrega = null;
    info._entregaFuente = null;
  }
  // "¿Me lo dejás en 780?" es un regateo (segunda vuelta, 30/09/2026): va por el pedido de
  // descuento (`pideDescuento`, más abajo) y ese monto no es su entrega, salvo que hable de su plata.
  if (info.entrega && local.esRegateo(mensaje) && !local.hablaDeSuPlata(mensaje)) {
    info.entrega = null;
    info._entregaFuente = null;
    if (info.intencion === 'declara_entrega') info.intencion = 'consulta_precio';
  }
  // Una pregunta con un monto a ±5% del contado del modelo en juego confirma el precio (desde
  // cero, D9): "¿está a 800 mil?" no es su entrega, era "con eso lo pagás de contado" y la
  // entrega quedaba guardada. Se contesta con el número de la planilla (ver `_confirmaPrecio`).
  // Solo si pregunta el precio (segunda vuelta, 30/09/2026): con su plata ("¿cuánto me queda si
  // abono 790?", "si te doy 780, ¿cuánto me quedan las cuotas?") se cotiza (`hablaDeSuPlata`).
  if (info.entrega && !preguntaPromo && !local.hablaDeSuPlata(mensaje) && (/\?/.test(mensaje) || /^\s*(esta|estan|sale|salen|cuesta|vale|lo (tenes|tenias))\b/.test(normalizar(mensaje)))) {
    const planilla = await leerPlanilla();
    const enJuego = planilla.config.estadoLista === 'VIGENTE' ? modeloClaro(conModeloDelHilo(chatId, s), planilla, info) : null;
    const contado = enJuego ? contadoDe(enJuego, s) : 0;
    if (contado && Math.abs(info.entrega - contado) <= contado * 0.05) {
      info.entrega = null;
      info._entregaFuente = null;
      info._confirmaPrecio = true;
      if (info.intencion === 'declara_entrega') info.intencion = 'consulta_precio';
    }
  }
  if (info.entrega && info.intencion === 'se_disculpa') info.intencion = 'declara_entrega';
  // "me quedo con ese que me recomendaste" sin nombrarlo (bloque 10): el modelo que ofreció
  // el bot, si fue uno solo, como si lo hubiera nombrado. Si no se sabe cuál, escala abajo.
  // Lo decide el texto, no la lectura de Gemini: en vivo (25/09, d07eb08) Gemini elegía un
  // modelo de la charla y esto no se miraba. Si el texto nombra un modelo, es ese.
  const ofrecido = local.extraerModelos(normalizar(mensaje)).length ? null : loQueOfrecio(s.historial, mensaje);
  if (ofrecido && ofrecido.modelo) {
    info.modelo = ofrecido.modelo;
    info.modelos = [ofrecido.modelo];
  }
  // Un modelo anterior al 11 no se trabaja (bloque 8): no queda como el modelo del chat
  // ni entre los pedidos, y más abajo se le contesta "ese no lo trabajamos". Si en el
  // mismo mensaje nombra otro, se sigue con ese. El del canje (`permuta`) no se toca.
  const noTrabajado = [info.modelo, ...(info.modelos || [])].find((m) => m && noSeTrabaja(m)) || null;
  if (noTrabajado) {
    info.modelos = (info.modelos || []).filter((m) => m && !noSeTrabaja(m));
    if (noSeTrabaja(info.modelo)) info.modelo = info.modelos[0] || null;
  }
  // Tres lecturas donde el texto le gana a Gemini (análisis de `evaluar` en línea, 28/09/2026):
  //  - "es carisimo": Gemini traía el modelo de la charla y el bot contestaba "muy buena
  //    eleccion". Si el texto no nombra un modelo, es precio alto.
  //  - "tenes el 13? que garantia tiene?": Gemini lo leía como stock y la garantía no salía.
  //    Va como consulta general, que con un modelo da los datos fijos (Mejora 1).
  //  - "hacen puntos de encuentro?": Gemini lo leía como consulta general; es coordinar la
  //    entrega, y eso lo ve una persona (el turno, que escala).
  {
    const lectura = local.entender(mensaje);
    const nombraModelo = local.extraerModelos(normalizar(mensaje)).length > 0;
    if (lectura.intencion === 'precio_alto' && info.intencion !== 'precio_alto' && !nombraModelo && !info.entrega) {
      info.intencion = 'precio_alto';
      info.modelo = null;
      info.modelos = [];
    } else if (
      lectura.intencion === 'consulta_general' &&
      temas.pregunta(mensaje, 'garantia') &&
      ['consulta_stock', 'consulta_precio'].includes(info.intencion)
    ) {
      info.intencion = 'consulta_general';
    } else if (/\bpuntos? de encuentro\b/.test(normalizar(mensaje)) && info.intencion !== 'pide_turno') {
      info.intencion = 'pide_turno';
    } else if (local.nosPideEntregar(mensaje) && info.intencion !== 'pide_turno' && !info.entrega) {
      // "¿Para cuándo me lo podés entregar?", "¿y cuándo me lo entregan?" (arreglos en vivo,
      // 30/09/2026): Gemini los leía como consulta_general y salía la financiación, porque
      // "entrega" también es la entrega inicial. Pedir que se lo entreguemos es coordinar el
      // turno, como sin Gemini. Con un monto en el mensaje sigue su camino (cotiza), y si
      // además ofrece su equipo ("te entrego mi 12, ¿me entregás el 15?") el canje gana abajo.
      info.intencion = 'pide_turno';
    } else if (/\b(alias|cbu|cvu)\b/.test(normalizar(mensaje))) {
      // Que no quede como "no se entiende": sigue hasta TEMAS_SIN_DATO, que escala.
      info.intencion = 'consulta_general';
    }
    // Gemini ve un canje donde no lo hay (reproducción de chats reales, 28/09/2026): "te llevo
    // la plata", "avisame si se puede" o "y para el 16 pro" contestaban "tomamos celulares a
    // partir del 11". Sin un canje en curso, el texto tiene que hablar de entregar un equipo.
    // Desde cero (29/09/2026): tampoco cuenta si habla de VENDER el suyo ("estoy viendo si
    // vendo mi celu actual", "tengo un celu, voy a ver si lo vendo"), salvo que nombre el
    // canje; y sí cuentan "la placa" y "más plata por un 16 pro".
    // Segunda vuelta (30/09/2026): lo que nos pide a nosotros ("¿me podés entregar el 16?") no
    // cuenta, y "más plata por un X" cuenta solo con su equipo en el mensaje (eso ya lo mira
    // `lectura`, con `local.ofreceCanje`). Contestaban "tomamos celulares a partir del 11".
    const tCanje = local.sinPedidoDeEntrega(normalizar(mensaje));
    const hablaDeCanje =
      (lectura.intencion === 'permuta' ||
        /(canje|permuta|parte de pago|entrego|entregar|entregaria|tomas|toman|tomarian|dejo mi|tengo (un|el|una)|mi (iphone|celu|celular|telefono|equipo|ip\b|1[1-8]\b)|la placa)/.test(
          tCanje
        )) &&
      (!local.vendeElSuyo(mensaje) || /(canje|permuta|parte de pago)/.test(normalizar(mensaje)));
    if ((info.intencion === 'permuta' || info.permuta?.ofrece) && !s.permuta?.ofrece && !hablaDeCanje) {
      if (info.intencion === 'permuta') info.intencion = lectura.intencion;
      info.permuta = { ofrece: false };
    }
    // Gemini lee un turno o stock y el texto no nombra su equipo (segunda vuelta, 30/09/2026): el
    // texto no le gana. Un "entregar" o un "más plata por" sueltos pueden ser lo que nos pide.
    const soloDiceEntregar =
      !local.ofreceCanje(tCanje.replace(/\bentreg\w*|\bmas plata por\b/g, ' ')) && !/\b(?:mi|mis|el mio|la mia|tengo|tenia)\b/.test(tCanje);
    const geminiGana = ['pide_turno', 'consulta_stock'].includes(info.intencion) && soloDiceEntregar;
    // Y al revés (desde cero, 29/09/2026): si el texto ofrece su equipo con todas las letras
    // ("más la placa", "el 15 pro más plata por un 16 pro", "te dejo mi 15 pro") y Gemini no lo
    // ve, es un canje. Sin un canje en curso: con uno, lo decide el texto más abajo (D2).
    if (lectura.intencion === 'permuta' && !info.permuta?.ofrece && !s.permuta?.ofrece && hablaDeCanje && !geminiGana) {
      info.permuta = { ...(lectura.permuta || {}), ofrece: true };
      if (['propone_pago', 'consulta_stock', 'consulta_precio', 'consulta_general', 'otro'].includes(info.intencion)) info.intencion = 'permuta';
    }
    // Los modelos que nombra el texto (análisis de `evaluar` en línea, 28/09/2026): "tenia en
    // mente un 13 y un 15, vi que hacian cuotas" y Gemini traía uno solo o ninguno, así que no
    // salían los dos precios ni la pregunta de cuál. Si el texto nombra más, van los del texto.
    // En un canje no: ahí uno de los modelos es el que entrega.
    const delTexto = local.extraerModelos(normalizar(mensaje)).filter((m) => !noSeTrabaja(m));
    if (!hablaDeCanje && !s.permuta?.ofrece && delTexto.length >= 2) {
      if (delTexto.length > (info.modelos || []).length) {
        info.modelos = delTexto;
        if (!info.modelo) info.modelo = delTexto[0];
      }
      // Con dos modelos no es una consulta general (esa, con un modelo, da solo los datos
      // fijos): en vivo, Gemini traía los dos modelos pero consulta_general, y salía solo la
      // explicación de la financiación, sin precios ni la pregunta de cuál.
      if (info.intencion === 'consulta_general') info.intencion = lectura.intencion;
    }
  }
  // "dale" suelto sin nada en juego no es querer avanzar (análisis del 28/09/2026): Gemini lo
  // leía como quiere_avanzar y el bot preguntaba qué día viene y escalaba después de un "ok".
  // Sin modelo, cotización, precios ni lista en la charla, vale lo que lee el extractor local.
  if (
    info.intencion === 'quiere_avanzar' &&
    !info.modelo &&
    !(info.modelos || []).length &&
    !info.entrega &&
    !s.modelo &&
    !s.modeloPropuesto &&
    !s.cotizadoDe &&
    !s.stockInformadoDe &&
    !(s.preciosMostradosDe || []).length &&
    !s.listaEnviada
  ) {
    info.intencion = local.entender(mensaje).intencion;
  }
  // Antes de tocar el estado: ¿el mensaje anterior del cliente tampoco se entendió?
  const seguidoDeNoEntendido = marcaSeguida(s.noEntendido, s.historial, mensaje, llegada.lineas);
  // Lo último que le mandó el bot fue la pregunta genérica y esto no trae modelo ni monto
  // (desde cero, 29/09/2026): es el segundo que no se entiende (ver `ultimaTandaFueGenerica`).
  const yaPreguntamos =
    ultimaTandaFueGenerica(s.historial) &&
    !contestaElSaludo(mensaje, s.historial) &&
    !info.modelo &&
    !(info.modelos || []).length &&
    !info.entrega;

  // Guardamos lo que el cliente fue diciendo a lo largo del chat.
  // Ojo: en una permuta, el modelo que menciona es el que ENTREGA, no el que quiere.
  const cambios = {};
  // El equipo que entrega: el que leyó `permuta`, o (desde cero, 29/09/2026) el que el texto
  // pega a "tengo", "mi", "dejo" en un canje. Así "te dejo mi 12 en parte de pago para el 13"
  // guarda el 13 como el que quiere, no el 12.
  const enAlgunCanje = Boolean(info.permuta?.ofrece || s.permuta?.ofrece);
  const equipoDelCanje = enAlgunCanje
    ? (info.permuta?.ofrece && info.permuta?.modelo) || local.datosDelCanjeEnTexto(mensaje).modelo || null
    : null;
  const esDelCanje = (m) => Boolean(m && equipoDelCanje) && normalizar(m).replace(/^iphone\s*/, '') === normalizar(equipoDelCanje).replace(/^iphone\s*/, '');
  const modeloEsDeLaPermuta = esDelCanje(info.modelo);
  const loQueQuiere = (info.modelos || []).filter((m) => m && !esDelCanje(m));
  if (info.modelo && !modeloEsDeLaPermuta) cambios.modelo = info.modelo;
  else if (modeloEsDeLaPermuta && loQueQuiere.length) cambios.modelo = loQueQuiere[0];

  // Vamos juntando los modelos que nombró en toda la conversación, para poder
  // pasarle los precios juntos cuando suma uno nuevo al que ya venía mirando.
  const yaPedidos = s.modelosPedidos || [];
  const nuevosDelMensaje = loQueQuiere;
  const sumaModeloNuevo = nuevosDelMensaje.some((m) => !yaPedidos.includes(m));
  if (nuevosDelMensaje.length) {
    cambios.modelosPedidos = [...new Set([...yaPedidos, ...nuevosDelMensaje])].slice(-4);
  }
  if (info.capacidad_gb) cambios.capacidad_gb = info.capacidad_gb;
  // Una entrega bien leída también le devuelve a la guarda su repregunta: si no,
  // una duda con el monto aclarada hace veinte mensajes hacía escalar la próxima.
  if (info.entrega) {
    cambios.entrega = info.entrega;
    cambios.entregaRepreguntada = false;
  }
  // Gana el último monto, como con la entrega: un monto en pesos sin dólares los deja atrás.
  if (enDolares) cambios.entregaDolares = enDolares;
  else if (info.entrega && s.entregaDolares) cambios.entregaDolares = null;
  if (info.forma_pago) cambios.forma_pago = info.forma_pago;
  if (info.zona) cambios.zona = info.zona;
  if (info.timing) cambios.timing = info.timing;

  // Qué temas ya le llegaron al cliente (ver temas.js). Se mira el historial:
  // cuenta lo que mandó el bot y lo que explicó una persona a mano.
  const explicados = temas.actualizarDesdeHistorial(s);
  if (explicados) cambios.temasExplicados = explicados;

  // La nota se limpia antes de guardarse. Una igual a otra ya guardada no se
  // suma: Gemini lee el historial y puede volver a sacar la misma.
  const nota = gemini.notaSegura(info.nota, nombre);
  const notasPrevias = s.notas || [];
  if (nota && !notasPrevias.some((n) => normalizar(n) === normalizar(nota))) {
    cambios.notas = [...notasPrevias, nota].slice(-MAX_NOTAS);
  }

  // Cómo se leyó este mensaje. Viaja en el resultado (`alSalir.lectura`) hasta la
  // propuesta del registro de aprendizaje, que la toma de ESTA tanda y no del estado
  // (bloque 6). En el estado queda para control.js: su `ts` es la última actividad del
  // chat si no hay historial (datos viejos).
  cambios.ultimaLectura = {
    ts: Date.now(),
    fuente: info._fuente || 'desconocida',
    intencion: info.intencion || null,
    // Lo que se leyó, aunque sea uno que no se trabaja (bloque 8).
    modelo: info.modelo || noTrabajado || null,
    entrega: info.entrega || null,
    // 'gemini', 'local' o null. Con Gemini puede decir 'local': Gemini no leyó
    // el monto y lo completó el extractor local desde el mensaje actual.
    entregaFuente: info._entregaFuente || null,
  };
  alSalir.lectura = cambios.ultimaLectura;
  if (Object.keys(cambios).length) state.actualizar(chatId, cambios);
  const ctx = conModeloDelHilo(chatId, state.obtener(chatId));

  // Caso Jazz (30/09/2026, chat …5915): el texto nombra dos o más modelos y no a todos se les
  // pasó el precio. Cuenta como sumar un modelo nuevo aunque ya estuvieran en `modelosPedidos`:
  // los había pedido antes, la respuesta con los precios no le llegó (quedó en borrador) y una
  // persona le contestó solo el stock. Sin esto ganaba la pregunta por las cuotas ("decime cual
  // te gusto mas, el 13 o el 14") y los precios no salían nunca. Con un solo modelo, nada cambia.
  const yaConPrecio = (ctx.preciosMostradosDe || []).map((m) => normalizar(nombreParaDecir(m)));
  const nombraAhora = [...new Set(local.extraerModelos(normalizar(mensaje)))];
  const nombraVariosSinPrecio =
    nombraAhora.length >= 2 && nombraAhora.some((m) => !yaConPrecio.includes(normalizar(nombreParaDecir(m))));
  const pideVariosNuevos = sumaModeloNuevo || nombraVariosSinPrecio;

  // Insistencia con la entrega en curso (bloque 5b): ya se le dijo la entrega inicial
  // de algún modelo y todavía no llegó. Mientras dure, un rechazo ("entonces no",
  // "lo dejo", "gracias igual") o un "se va" ("te escribo el mes que viene", "lo
  // pienso", la intención lo_piensa; Ajustes 2) salta al último paso, y un "no"
  // suelto es "sigue sin llegar": ninguno cae en el agradecimiento, en la despedida
  // de "lo pienso", en el esquema de pago propio ni en "no se entiende".
  const insistiendo = hayInsistencia(ctx) && Boolean(ctx.entrega) && Boolean(ctx.modelo);
  const rechazo = insistiendo && (local.esRechazo(mensaje) || local.seVa(mensaje, info.intencion));
  const niega = insistiendo && local.esNegacionSuelta(mensaje);

  // --- 1. Cosas que van derecho al humano ---
  //
  // Todas en silencio: al cliente no se le dice nada. Antes cada una le
  // prometía que otra persona le iba a responder ("ahora te responde fran",
  // "dejame verlo con fran"...), y nadie garantiza esa respuesta. index.js
  // avisa al grupo con 🔕 y el cliente no recibe una promesa vacía.
  //
  // Primero, lo que dejó dicho una persona de la cuenta (01/10/2026): si el mensaje sigue eso,
  // lo sigue ella. El silencio de 45 minutos después de una persona va antes (index.js).
  const sigueAPersona = sigueLoQueDijoUnaPersona(s, info, nombre);
  if (sigueAPersona) return escalar(sigueAPersona, ctx);
  if (info.urgente || info.intencion === 'postventa') {
    return escalar(
      'postventa o cliente que pide una persona',
      ctx
    );
  }
  // Ya compró (muestra de repro-v1, #694; decisión de Tomás del 28/09/2026): el chat está
  // marcado #vendido, o la cuenta le venía cobrando la cuota ("te encargo el comprobante de la
  // transferencia, sino la cuota ya aumenta…") y el bot le hacía la pregunta de venta. Todo lo
  // que no pida un modelo nuevo lo sigue una persona; "tenés el 15?" sigue como venta.
  if (esPostventa(ctx) && !local.extraerModelos(normalizar(mensaje)).length) {
    return escalar('postventa o cliente que pide una persona', ctx);
  }
  // Contestó la batería de su equipo (#368) sin un canje en curso en el estado: se la preguntó
  // una persona, y la sigue esa persona.
  if (bateriaSinCanje) {
    return escalar(`contestó la batería de su equipo (${bateriaSuelta}%), que le preguntó una persona`, ctx);
  }
  // Bloque 10 (decisiones de Tomás del 25/09/2026, sobre el mensaje crudo, lea lo que lea
  // Gemini): "me quedo con el que me dijiste" y no se sabe cuál (ver `loQueOfrecio`); avisa
  // que llegó al local ("Estoy acá ya creo", ejemplo aprobado); o, con una charla en curso,
  // el mensaje es solo su nombre ("Mi nombre es Oriana", ejemplo aprobado: es para anotarlo,
  // lo sigue una persona). En un chat nuevo, "hola, soy Aylén" sigue como siempre.
  if (ofrecido && ofrecido.escalar) return escalar(ofrecido.escalar, ctx);
  // Pregunta por una promoción con un monto (desde cero, D9): lo ve una persona.
  if (preguntaPromo) return escalar('pregunta por una promoción', ctx);
  if (local.llegoAlLocal(mensaje)) return escalar('avisa que llegó al local (o que está llegando)', ctx);
  if (local.soloDiceSuNombre(mensaje) && (ctx.historial || []).some((l) => l.quien === 'vendedor')) {
    return escalar('dice su nombre (seguramente para anotarlo en un turno)', ctx);
  }

  // --- Crédito de mensajes sin señal de venta ---
  //
  // No es un filtro por contenido: "hola" de un cliente nuevo y "che como
  // andas" de un conocido son idénticos en el primer mensaje. Lo que los separa
  // es el tiempo — el cliente dice algo de venta enseguida, el conocido no lo
  // dice nunca. Así que se cuenta, no se adivina.
  //
  // Va ACÁ arriba a propósito: los mensajes sin venta se contestan en ramas que
  // retornan mucho antes del árbol de cotización, así que más abajo el contador
  // no llegaría a sumar nunca.
  //
  // Cualquier señal comercial vuelve el contador a cero y reactiva el chat. Eso es
  // inmediato: bajar un contador no tiene riesgo.
  //
  // Sumar, en cambio, cuenta solo si la respuesta le llegó (Pendientes 2, decisión de
  // Tomás del 21/09/2026): `van` queda en `alSalir` y `decidirYFormatear` lo cuelga
  // del primer mensaje, que lo confirma al salir. Antes se anotaba acá: contaba en
  // escucha y en borrador, y una tanda cortada que se reencolaba sumaba dos veces por
  // los mismos mensajes. Cuando el bot no manda nada (esta rama del 🤐, un escalado
  // callado) no hay mensaje que lo lleve y se anota al decidir, como siempre.
  // Que ya le hayamos pasado la lista, precios o stock también es venta (desde cero, C63T6:
  // pidió la lista, la de hasta el 15, los medios de pago y los colores, y el "¿me lo podés
  // apartar?" quedó callado por "6 mensajes sin ninguna señal de venta").
  const yaVioPrecios = Boolean(ctx.listaEnviada || (ctx.preciosMostradosDe || []).length || ctx.stockInformadoDe);
  if (senalesDeVenta(ctx) || yaVioPrecios) {
    if (ctx.sinVenta) state.actualizar(chatId, { sinVenta: 0, calladoPorNoVenta: false });
  } else {
    const van = (ctx.sinVenta || 0) + 1;
    if (van > config.mensajesSinVenta) {
      state.actualizar(chatId, { sinVenta: van });
      // Se avisa UNA sola vez por chat, no en cada mensaje. Sirve para poder
      // revisar si el filtro se está comiendo un cliente de verdad.
      if (!ctx.calladoPorNoVenta) {
        state.actualizar(chatId, { calladoPorNoVenta: true });
        return {
          escalar: true,
          silencioso: true,
          motivo: `dejé de contestar: ${van} mensajes sin ninguna señal de venta`,
          mensajes: [],
        };
      }
      return { mensajes: [] };
    }
    alSalir.sinVenta = van;
  }

  // Un acuse después de la entrega inicial, un "te cotizo" o la lista (desde cero, grupo 2):
  // no pide turno. No se le contesta nada y no escala (ver `ultimaTandaEsperaAlCliente`). El
  // modelo o el monto que lea Gemini no cuentan: un acuse no nombra ninguno, Gemini los arrastra
  // de la charla (C11T6, C47T3: "dale dale" y "ok" recibían otra vez la entrega o el modelo).
  if (esAcuseCorto(mensaje) && ultimaTandaEsperaAlCliente(ctx.historial)) {
    return { mensajes: [] };
  }

  // El cliente arma él mismo la forma de pago. En el corpus, aceptar el esquema
  // que propone el cliente es lo que más veces terminó en venta, pero eso lo
  // decide una persona, no el bot.
  // Ojo: proponer un esquema propio requiere un monto o una fecha concreta.
  // Decir "queria contado pero me interesan las cuotas" es elegir forma de pago.
  // Tiene que haber una señal REAL de esquema partido: dos tramos, o una fecha.
  // Decir "te habia comentado que tengo 500.000" es declarar el presupuesto,
  // no proponer una forma de pago.
  const senalDeEsquema =
    /(y el resto|y lo otro|y despues|y después|el resto (el|cuando|a fin)|la mitad|mitad y mitad|cuando cobre|cuando me paguen|a fin de mes|el mes que viene|cuando lo retire|al retirar|en dos veces|ahora y (el|lo)|el dia \d|el \d{1,2} (de|del))/i.test(
      mensaje
    );
  // Un monto con "el resto (lo hago) en 2 cuotas", sin fechas ni cobros, es su entrega y se
  // cotiza, lea lo que lea Gemini (desde cero, 29/09/2026: "si te entrego 850 y lo otro lo
  // hago en dos cuotas, de cuanto serian?" escalaba como esquema propio). Con una fecha o un
  // cobro ("cuando cobre", "a fin de mes", "el 10 de octubre") sigue escalando.
  const entregaConElRestoEnCuotas =
    Boolean(info.entrega) &&
    /\b(el resto|lo otro|lo que queda|la diferencia)\b[^.?!\n]{0,30}\bcuotas?\b/.test(normalizar(mensaje)) &&
    !/(cuando cobre|cuando me paguen|a fin de mes|mes que viene|mes proximo|proximo mes|semana que viene|el dia \d|el \d{1,2} (de|del)\b|la mitad|mitad y mitad|en dos veces|ahora y (el|lo)|y despues|cuando lo retire|al retirar|\b(lunes|martes|miercoles|jueves|viernes|sabado|domingo)\b)/.test(
      normalizar(mensaje)
    );
  if (entregaConElRestoEnCuotas && info.intencion === 'propone_pago') info.intencion = 'declara_entrega';
  const proponeEsquemaConcreto = info.intencion === 'propone_pago' && senalDeEsquema && !entregaConElRestoEnCuotas;

  // "te escribo el mes que viene" o "cuando cobre te escribo" también cazan la señal
  // de esquema: si Gemini lo lee como propone_pago mientras se insiste con la
  // entrega, gana el "se va" (Ajustes 2) y no el escalado en silencio.
  if (proponeEsquemaConcreto && !rechazo) {
    return escalar(
      'el cliente propone su propio esquema de pago',
      ctx
    );
  }

  // Dólares: se toman, a la cotización del día. Si solo pregunta si se aceptan, sin monto,
  // se le contesta más abajo, junto a los medios de pago (bloque 8). Con un monto en
  // dólares, o si pide el precio o que le coticen en dólares, la cotización la hace una
  // persona: escala callado, como siempre.
  const aceptanDolares = preguntaSiAceptanDolares(mensaje, info);
  if ((info.intencion === 'dolares' || info.forma_pago === 'dolares') && !aceptanDolares) {
    return escalar(
      'quiere cotización en dólares',
      ctx
    );
  }

  // Pedido de descuento (bloque 5): sobre el mensaje crudo, lea lo que lea Gemini, y
  // antes que el "más barato" y que los momentos de tono. Un canje sigue su camino.
  // Si lo último que le dijimos fue "tomamos celulares a partir del 11" y este mensaje no nombra
  // ningún modelo ni ofrece un canje, no es un canje: Gemini arrastra el canje del 8 de la charla
  // y el bot repetía "a partir del 11" a todo ("64gb 80% de bateria", "y cuanto sale?"). Análisis
  // de `evaluar` en línea del 28/09/2026.
  const ultimoDelBot = [...(ctx.historial || [])].reverse().find((m) => m.quien === 'vendedor');
  const recienDijimosDel11 =
    Boolean(ultimoDelBot) && /a partir del 11|del 11 en adelante/.test(normalizar(ultimoDelBot.texto));
  const textoNombraModelo =
    local.extraerModelos(normalizar(mensaje)).length > 0 ||
    /\b(iphone|ip)\s*(x|xr|xs|se|[4-9])\b/.test(normalizar(mensaje));
  const canjeArrastrado =
    recienDijimosDel11 && !textoNombraModelo && !/canje|parte de pago|permuta|entregar? mi|dejo mi/.test(normalizar(mensaje));
  if (canjeArrastrado && info.intencion === 'permuta') info.intencion = local.entender(mensaje).intencion;
  // Con un canje en curso (desde cero, D2, decisión de Tomás del 29/09/2026), el canje toma
  // solo los mensajes que hablan de él o traen un dato nuevo de su equipo (también una foto,
  // D1). Hasta el 29/09 tomaba todo el chat: "¿en qué precio está el 14 Pro?", "¿tenés stock
  // del 17 Pro?" o "cuando tenga la plata te aviso" recibían "sin X no te puedo pasar el
  // numero exacto". Lo demás sigue el flujo normal y el canje queda pendiente. Lo que lee
  // Gemini del canje cuenta solo si el mensaje habla del canje: Gemini lo arrastra de la charla.
  const permutaEnCurso = Boolean(ctx.permuta?.ofrece) && !ctx.escalado;
  const hablaDelCanje = local.hablaDelCanje(mensaje) || contestaBateria;
  const previaDelCanje = ctx.permuta || {};
  const nuevosDelCanje = datosDelCanje(info, mensaje, {
    enCurso: permutaEnCurso,
    previa: previaDelCanje,
    fotos: llegada.fotos,
    usarLectura: !permutaEnCurso || hablaDelCanje,
  });
  const traeDatosDelCanje = CAMPOS_DEL_CANJE.some((c) => nuevosDelCanje[c] && nuevosDelCanje[c] !== previaDelCanje[c]);
  const enCanje =
    !canjeArrastrado &&
    (permutaEnCurso ? traeDatosDelCanje || hablaDelCanje : Boolean(info.permuta?.ofrece || info.intencion === 'permuta'));
  if (permutaEnCurso && !enCanje && info.intencion === 'permuta') info.intencion = local.entender(mensaje).intencion;

  // Pide fotos o videos (bloque 8, decisión de Tomás del 24/09/2026): escala callado. Al
  // cliente no se le dice nada (ni se le prometen fotos) y el grupo recibe qué modelos
  // pidió y cómo seguir: mandarle las fotos a mano, o #sinstock <número> si no hay stock,
  // que le manda la foto de referencia de cada uno (index.js). El pedido queda en el chat
  // (`fotosPedidas`) hasta el #sinstock. El que manda fotos de su celular en un canje no
  // pide nada. Los colores siguen su camino de siempre, más abajo.
  if (local.pideFotos(mensaje, { enCanje: enCanje || permutaEnCurso })) {
    const modelos = modelosDeLasFotos(info, ctx);
    state.actualizar(chatId, { fotosPedidas: { modelos, ts: Date.now() } });
    return {
      ...escalar(modelos.length ? `pide fotos o videos ${delModelo(modelos)}` : 'pide fotos o videos (no dijo de qué modelo)', ctx),
      paraElGrupo: `Si tenés el equipo, mandale las fotos vos; si no hay stock: #sinstock ${chatId.split('@')[0]}`,
    };
  }
  // Pregunta por el estado del equipo que vendemos (desde cero, D4, decisión de Tomás del
  // 29/09/2026): batería, usado, nuevo, sellado, memoria, detalles… Escala callado siempre,
  // haya modelo en juego o no; nunca el texto de importados ni "cómo pensabas pagarlo". Un
  // dato de SU equipo sin pregunta no escala por esto: "64gb 80% de bateria" (la batería
  // con el número adelante), y en un canje en curso también "la bateria esta al 85" o "es
  // de 128", que siguen el camino del canje.
  // Con un canje en curso, los datos de SU equipo con una pregunta del canje ("es de 128 con 85%
  // de batería, ¿cuánto me das?") también van al canje (segunda vuelta, 30/09/2026).
  const datoDelCanjeEnCurso =
    Boolean(ctx.permuta?.ofrece && !ctx.escalado) &&
    Boolean(local.extraerBateria(mensaje) || local.extraerCapacidad(mensaje) || /\bbateria\b[^?\n]*\b\d{2,3}\b/.test(normalizar(mensaje)));
  const datoDeSuEquipo =
    (!mensaje.includes('?') && Boolean(local.extraerBateria(mensaje) || datoDelCanjeEnCurso)) ||
    (datoDelCanjeEnCurso && local.hablaDelCanje(mensaje));
  if (local.preguntaPorEstado(mensaje) && !datoDeSuEquipo) {
    // Le da lo mismo sellado o usado (decisión de Tomás del 30/09/2026): no escala. Si nombra un
    // modelo sigue el camino de siempre (su ficha); si no, la lista.
    if (!local.leDaLoMismo(mensaje)) {
      return escalar(`pregunta por el estado del equipo: "${String(mensaje).slice(0, 80)}"`, ctx);
    }
    if (!local.extraerModelos(normalizar(mensaje)).length) {
      const planilla = await leerPlanilla();
      const lista = planilla.config.estadoLista === 'VIGENTE' ? responderLista(chatId, ctx, planilla) : null;
      if (lista) return lista;
    }
  }
  if (local.pideDescuento(mensaje) && !enCanje) {
    return responderDescuento(ctx, info);
  }
  const conv = analizarConversacion(ctx);

  // --- Momentos de tono. No son consultas: son la parte que hace que el
  // cliente vuelva. En el corpus, contener en vez de presionar precede a
  // varias ventas, y presionar acá es lo que espanta.
  if (info.intencion === 'se_disculpa') {
    const mensajes = ['uy no te hagas drama, estamos para ayudarte'];
    if (ctx.modelo || ctx.entrega || conv.yaCotizamos) {
      mensajes.push('quedamos en contacto para cuando te lo quieras llevar');
    } else {
      mensajes.push('cuando puedas avisame y lo vemos, quedo atento');
    }
    return { mensajes };
  }

  // "gracias igual" mientras se insiste con la entrega es un rechazo, no un cierre (bloque 5b).
  if (info.intencion === 'agradece' && !rechazo) {
    return {
      mensajes: [
        'a vos!',
        'cualquier cosita estamos por aca, quedo atento',
      ],
    };
  }

  // Pide que se lo guarden u ofrece una seña (bloque 8, decisiones de Tomás del
  // 24/09/2026): no pedimos seña, y se sigue con el turno. Si todavía no dijo cuándo
  // viene, se le pregunta el día y no escala; si ya lo dijo ("guardamelo hasta mañana"),
  // es el turno de siempre: la pregunta que falta, y escala. Nunca promete guardar nada.
  if (info.intencion === 'reserva' || local.pideGuardar(mensaje)) {
    const { pregunta, dijoCuando } = preguntaDeTurno(ctx, mensaje);
    if (dijoCuando) {
      return responderTurno(ctx, mensaje, {
        motivo: 'pide que le guarden un equipo y dice cuándo viene',
        antes: [DATOS_FIJOS.sinSena],
      });
    }
    return { mensajes: [DATOS_FIJOS.sinSena, pregunta] };
  }

  // Viene "un día de estos", sin día (bloque 10, ejemplo aprobado "Un día de estos seguro
  // me pegue una vuelta"): que nos manejamos con turnos y que cuando sepa el día nos diga,
  // sin contado ni cuotas y sin escalar. Cuando dice el día, el turno de siempre. Con
  // un modelo o un monto sigue la venta; si pregunta dónde estamos, la dirección (que ya
  // dice lo de los turnos); con una insistencia en curso, un "se va" sigue siendo rechazo.
  if (
    local.vieneSinFecha(mensaje) &&
    !rechazo &&
    !info.modelo &&
    !info.entrega &&
    !mencionaDia(mensaje) &&
    !RE_UBICACION.test(normalizar(mensaje))
  ) {
    return { mensajes: [estilo.frase('vueltaConTurno'), estilo.frase('vueltaQueDia')] };
  }

  // Mientras se insiste con la entrega, "lo pienso" es un rechazo: se salta al último
  // paso y la tanda es la ficha, sin despedida (Ajustes 2, tras la prueba en vivo:
  // "bueno te escribo el mes que viene entonces" recibía "dale joya, quedo atento").
  if (info.intencion === 'lo_piensa' && !rechazo) {
    return {
      mensajes: [
        'dale joya, quedo atento',
        'cualquier cosa escribime y lo vemos',
      ],
    };
  }

  // Pide la lista de precios (28/09/2026): "pasame la lista", o "me la pasás de nuevo?" /
  // "mandámela" cuando ya se la mandamos (en vivo, sin "lista" ni "precios", contestaba
  // "decime que modelito te interesa"). No es una consulta general ni un mensaje vacío.
  // Desde cero (29/09/2026): también el catálogo ("me enviarías el catálogo de sellados y
  // usados?"), "¿y otros?" y "del 15 para abajo" / "hasta el 14 pro" (ver `filtroDeLista`).
  const filtroLista = filtroDeLista(mensaje);
  const pideListaDePrecios =
    /\blista\b/.test(normalizar(mensaje)) ||
    /\bcatalogo\b/.test(normalizar(mensaje)) ||
    PIDE_OTROS.test(normalizar(mensaje)) ||
    Boolean(filtroLista) ||
    (Boolean(ctx.listaEnviada) &&
      /\b(pasa(s|me)?la|pasamela|me la (pasas|pasarias|podes pasar|mandas|mandarias|podes mandar|reenvias)|mandamela|reenviamela)\b/.test(
        normalizar(mensaje)
      ));

  // Un "no" suelto mientras se insiste con la entrega sigue hasta la cotización (bloque 5b).
  if (info.intencion === 'sin_contenido' && !niega && !pideListaDePrecios) {
    // No escalamos por un mensaje suelto: recién si el anterior tampoco se entendió.
    return noSeEntiende(
      chatId,
      s,
      mensaje,
      seguidoDeNoEntendido,
      () => escalar('mandó varios mensajes que no se entienden', ctx, undefined, { callar: false }),
      llegada.lineas,
      { yaPreguntamos }
    );
  }

  // Cosas que cambian semana a semana o que no están en la planilla.
  // El bot no las inventa: las pasa a una persona, callado. Antes decía "dejame
  // confirmarte eso bien y te aviso al toque", que nadie cumplía (Mejora 1).
  //
  // Bloque 8 (decisiones de Tomás del 24/09/2026), con los falsos escalados de `npm run
  // reproducir`: los accesorios, el otro medio de pago y los envíos dejaron de ser una
  // palabra suelta (son funciones sobre el mensaje, arriba y en extractor-local.js), y
  // Mercado Pago salió de la lista: se acepta y se contesta más abajo.
  // Tarjeta de crédito o financiera (desde cero, D6): respuesta fija, sin escalar.
  if (pagaConCredito(mensaje)) return { mensajes: [DATOS_FIJOS.sinTarjeta] };

  // "¿Son libres de iCloud?" (desde cero, D11): respuesta fija, sin escalar. "Liberado" (de la
  // compañía) sigue escalando. Preguntado al revés ("¿están bloqueados por iCloud?", "¿tiene
  // iCloud?", "¿vienen con iCloud?"), sin el "sii" (decisión de Tomás del
  // 30/09/2026): "sii" le decía que sí estaban bloqueados.
  if (/\blibres? de icloud\b|\bicloud (?:libre|liberado)\b|\bsin icloud\b|\bno (?:tiene|tienen|trae|traen|viene con|vienen con) icloud\b/.test(normalizar(mensaje))) {
    return { mensajes: [DATOS_FIJOS.icloud] };
  }
  if (
    /\b(?:tiene|tienen|trae|traen)\s+icloud\b|\b(?:viene|vienen|esta|estan)\s+con\s+icloud\b|\bbloquead[oa]s?\s+(?:por\s+|de\s+|con\s+)?icloud\b/.test(
      normalizar(mensaje)
    )
  ) {
    return { mensajes: [DATOS_FIJOS.icloudAlReves] };
  }
  // "¿Están reportados?", "¿tienen reporte?", "¿está denunciado?" (el IMEI con denuncia; decisión
  // de Tomás del 30/09/2026): respuesta fija, sin escalar. Hasta ahí escalaba callado.
  if (/\breportad[oa]s?\b|\breportes?\b|\bdenunciad[oa]s?\b|\bcon denuncia\b/.test(normalizar(mensaje))) {
    return { mensajes: [DATOS_FIJOS.noReportados] };
  }

  const TEMAS_SIN_DATO = [
    [/liberado|desbloqueado|libre de fabrica|libre de fábrica/, 'pregunta si viene liberado'],
    [local.preguntaPorAccesorio, 'pregunta por accesorios'],
    [/factura|recibo tipo|iva|monotributo/, 'pregunta por facturación'],
    [pagaConOtroMedio, 'pregunta por otro medio de pago'],
    [(m) => RE_ENVIO.test(normalizar(m)), 'pregunta por envíos'],
    [/diferencia[^?]{0,15}entre|entre el .+ y el |comparar/, 'pide comparar dos modelos en detalle'],
    // Desde cero (29/09/2026): "¿por qué el 15 es mejor?" y "¿qué diferencia hay?" también.
    [
      (m) =>
        /\b(?:por que|porque|xq|pq)\b[^.!\n]{0,40}\bmejor(?:es)?\b[^.!\n]*\?|\bque diferencias? (?:hay|tiene|tienen)\b/.test(normalizar(m)),
      'pide comparar dos modelos en detalle',
    ],
    // Desde cero (29/09/2026): arreglar o cambiar el Face ID es servicio técnico.
    [
      (m) => /\bface ?id\b/.test(normalizar(m)) && /\b(?:arregl\w*|cambi\w*|repar\w*|reemplaz\w*)\b/.test(normalizar(m)),
      'pregunta por servicio técnico (Face ID)',
    ],

    [/cuantos (te quedan|tenes|tenés)|cuántos/, 'pregunta por cantidad de stock'],
    // Segunda vuelta (30/09/2026): "¿trabajan otras marcas o solo iPhone?" no tiene texto fijo.
    // Escalaba como el estado del equipo ("marcas").
    [local.preguntaOtrasMarcas, 'pregunta si trabajan otras marcas'],
    // Pide el alias o los datos para pagar (reproducción de chats reales, 28/09/2026): es un
    // cliente que ya está comprando; lo atiende una persona.
    [/alias|cbu|cvu|datos para (transferir|pagar|la transferencia)/, 'pide el alias o los datos para pagar'],
  ];
  for (const [prueba, motivo] of TEMAS_SIN_DATO) {
    const hay =
      typeof prueba === 'function'
        ? prueba(mensaje)
        : new RegExp('\\b(?:' + prueba.source + ')\\b', prueba.flags).test(mensaje.toLowerCase());
    if (hay) return escalar(motivo, ctx);
  }

  // Canje: ofrece su celular como parte de pago (ver `responderCanje`).
  if (enCanje) {
    return responderCanje(chatId, ctx, { nuevos: nuevosDelCanje, noTrabajado, mensaje });
  }

  // Señal de compra que hay que aprovechar: el que dice que es su primer iPhone
  // está decidido a comprar, solo necesita que lo lleven de la mano.
  const esPrimerIphone = /\b(mi|es mi|seria mi|sería mi|primer|primera vez)\b[^.!?]{0,30}\b(iphone|celu|celular|equipo)\b|\bes mi primer\b|\bprimera vez que (me )?compro\b/i.test(
    mensaje
  );

  const textoNormal = normalizar(mensaje);
  const preguntaUbicacion = RE_UBICACION.test(textoNormal);

  // Quiere venir: lo dice él, o contesta el día u horario que le preguntamos.
  //
  // Mientras se insiste con la entrega, un "se va" le gana al turno (Tono 1b,
  // decisión de Tomás del 17/09/2026): "nos vemos el mes que viene" y "paso el mes
  // que viene" caen en la regex de turnos (`nos vemos`, `puedo pasar`) y el bot
  // contestaba "contame que dia podrias pasar" y escalaba, en vez de cerrar con la
  // excepción y la ficha. Con un día concreto ("nos vemos el lunes") `seVa` da false
  // y sigue siendo un turno, como siempre. Fuera de la insistencia no cambia nada:
  // `rechazo` ya viene en false.
  const ultimoVendedor = [...(ctx.historial || [])].reverse().find((m) => m.quien === 'vendedor');
  const lePreguntamosCuando =
    Boolean(ultimoVendedor) && /\b(que dia|que horario|a que hora)\b/.test(normalizar(ultimoVendedor.texto));
  const contestaCuando = lePreguntamosCuando && (mencionaDia(mensaje) || mencionaHora(mensaje));
  // Elegir un modelo no es pedir turno (análisis del 28/09/2026): Gemini lee "ese me gusto",
  // "dale el 14" o "me quedo con el que me recomendaste" como quiere_avanzar, y el bot
  // preguntaba qué día viene y escalaba. Si para el extractor local el mensaje no es ni turno
  // ni compra, y lo que dice es la elección de un modelo, sigue la venta como sin IA.
  const intencionLocal = local.entender(mensaje).intencion;
  const eligeUnModelo =
    Boolean(info.modelo || (info.modelos || []).length) ||
    /\b(ese|esa|este|me gusto|me gusta|me quedo con|me interesa|recomendaste|me pasaste)\b/.test(textoNormal);
  // Pero si ya se le cotizó ese modelo, "dale ese" SÍ es avanzar: va el turno (en vivo, 28/09,
  // la recomendación de contado + "dale ese" repetía la cotización y preguntaba otra vez).
  const sinTilde = (x) => normalizar(x).replace(/^iphone\s*/, '').trim();
  const nombrado = info.modelo || (info.modelos || [])[0] || null;
  const yaCotizadoEste =
    Boolean(ctx.cotizadoDe) && (!nombrado || sinTilde(nombrado) === sinTilde(ctx.cotizadoDe));
  const eligeNoViene =
    !yaCotizadoEste &&
    info.intencion === 'quiere_avanzar' &&
    intencionLocal !== 'quiere_avanzar' &&
    intencionLocal !== 'pide_turno' &&
    eligeUnModelo &&
    !mencionaDia(mensaje) &&
    !mencionaHora(mensaje);
  const quiereVenir =
    !rechazo &&
    ((info.intencion === 'quiere_avanzar' && !eligeNoViene) || info.intencion === 'pide_turno' || contestaCuando);

  // Colores (desde cero, 29/09/2026), antes del turno: "en naranja lo queria" no es venir. Con
  // dos modelos nuevos en el mensaje van los precios y avisa igual (más abajo).
  if (preguntaColores(mensaje) && !info.entrega && nuevosDelMensaje.length < 2) {
    return escalar(ESCALAR_COLORES, ctx, ['cualquier cosa decime que modelo te interesa mas y te muestro ese'], { callar: false });
  }

  if (preguntaUbicacion && !info.entrega) {
    const r = responderUbicacion(ctx, conv, mensaje, quiereVenir);
    // "¿tomás USD? ¿dónde lo puedo ver?" (desde cero, C40T2, 29/09/2026): la dirección no se
    // come lo de los dólares, que va primero.
    return aceptanDolares ? { ...r, mensajes: [DATOS_FIJOS.dolares, ...r.mensajes].slice(0, TOPE_TANDA) } : r;
  }

  if (RE_MEDIOS_DE_PAGO.test(textoNormal) && !info.entrega) {
    return responderMediosDePago(ctx, mensaje);
  }

  // Respuestas fijas de pago (bloque 8, decisiones de Tomás del 24/09/2026). Cortas y sin
  // números: si hay un modelo en juego, el hilo sigue en el mensaje siguiente. Pagar con
  // tarjeta (también en cuotas por Mercado Pago) ya escaló arriba, por TEMAS_SIN_DATO.
  if (aceptanDolares) return { mensajes: [DATOS_FIJOS.dolares] };
  if (RE_MERCADO_PAGO.test(textoNormal) && !info.entrega) return { mensajes: [DATOS_FIJOS.mercadoPago] };
  // "No tengo tarjeta": los requisitos, que dicen que no hace falta (antes escalaba como
  // otro medio de pago). Si nombra un modelo sigue la venta, como cualquier consulta.
  if (NIEGA_TARJETA.test(textoNormal) && !info.entrega && !info.modelo) return responderRequisitos(ctx);
  // "¿La financiación es con tarjeta?", "¿piden tarjeta?" (desde cero, 29/09/2026): los
  // requisitos, y la financiación si también la pregunta. Con los textos fijos, sin redactar.
  if (PREGUNTA_SI_PIDEN_TARJETA.test(textoNormal) && !info.entrega && !info.modelo) {
    const fijas = respuestaFijaLocal(mensaje, ctx);
    return fijas.length ? { mensajes: fijas } : responderRequisitos(ctx);
  }

  if (RE_DOCUMENTACION.test(textoNormal) && !info.entrega) {
    return responderDocumentacion(ctx);
  }

  // Si ya le preguntamos cómo quiere pagar, "en cuotas" es la respuesta a eso,
  // no una consulta general: sigue por el flujo de la venta.
  const respondiendoFormaPago =
    ctx.preguntamosFormaPago && /cuota|financia|contado|efectivo|tra(?:n|s|ns)ferencia|pagos/i.test(mensaje);

  // Pregunta cómo son las cuotas: se contesta siempre, lea lo que lea Gemini
  // (propone_pago, consulta_general, un "dale" leído como quiere_avanzar), y se
  // sigue la venta según la charla (ver responderCuotas). Siguen su camino de
  // siempre: un esquema propio (escaló arriba), una entrega (cotiza), un modelo
  // nuevo en el mensaje (se le pasan los precios), la respuesta a "cómo pensabas
  // pagarlo", y un mensaje que además pregunta otra cosa o habla de venir.
  // ¿Cuándo arranca a pagar? "¿la primer cuota es cuando retiro?" (desde cero, C48T6,
  // 29/09/2026): el texto fijo de que las cuotas arrancan el mes que viene, lea lo que lea
  // Gemini. Hasta el 29/09 Gemini redactaba "claro…" y le daba la razón.
  if (
    /\b(primera?|1ra|1era) cuota\b[^?\n]*\b(cuando|retir\w*)\b|\bcuando\b[^?\n]{0,20}\b(primera?|1ra|1era) cuota\b|\bcuando (empiezo|arranco|comienzo) a pagar\b/.test(
      textoNormal
    ) &&
    !info.entrega
  ) {
    return { mensajes: explicacionConCompromiso(chatId, ctx, mensaje).slice(0, TOPE_TANDA) };
  }

  // "Si le hago la entrega mínima, ¿cuánto se me va?" (desde cero, C3T4, 29/09/2026): se cotiza
  // con la entrega inicial del modelo en juego, calculada por el cotizador. Con varios vistos y
  // ninguno elegido, cada uno con la suya (como `cotizarVistos`).
  if (
    /\b(con|si (yo )?(le |te )?(hago|doy|pongo|entrego|dejo|abono|pago))\s+la entrega (minima|inicial)\b/.test(textoNormal) &&
    /\b(cuanto|cuotas?|se me va|queda|quedan|quedaria|quedarian|serian|seria|sale|salen)\b/.test(textoNormal) &&
    !info.entrega &&
    !local.mencionaPosibleMonto(mensaje)
  ) {
    const respuesta = await cotizarConLaMinima(chatId, ctx, mensaje, info);
    if (respuesta) return respuesta;
  }

  const preguntaCuotas =
    temas.pregunta(mensaje, 'financiacion', ctx) &&
    !senalDeEsquema &&
    !ctx.entrega &&
    !pideVariosNuevos &&
    !respondiendoFormaPago &&
    info.intencion !== 'pide_turno' &&
    !contestaCuando &&
    !temas.pregunta(mensaje, 'requisitos') &&
    !temas.pregunta(mensaje, 'garantia') &&
    !mencionaDia(mensaje) &&
    !mencionaHora(mensaje) &&
    !/\bturn(o|ito)s?\b/.test(textoNormal);
  if (preguntaCuotas) {
    const respuesta = await responderCuotas(chatId, ctx, mensaje);
    if (respuesta) return respuesta;
  }

  if (quiereVenir) {
    return responderTurno(ctx, mensaje, { motivo: 'el cliente quiere avanzar o pide turno' });
  }

  // --- 2. Datos que puede dar sin consultar la planilla ---
  // (dónde están, horarios, requisitos, garantía: no dependen del modelo)
  // Pide una recomendación: se recomienda por presupuesto, nunca por specs. "que me
  // recomendaste" no: habla de una que ya se le hizo (bloque 10, ver `loQueOfrecio`).
  const pideRecomendacion =
    /(que me recomendas(?!te)|qué me recomendás|cual me conviene|cuál me conviene|cual me recomendas(?!te)|que conviene|cual es mejor|cuál es mejor|que me llevo|qué me llevo)/i.test(
      mensaje
    );

  // Menciona cuotas: gana el interés en financiar, aunque también diga contado.
  const leInteresanCuotas = /cuota|financia|en pagos|financiado/i.test(mensaje);

  // "pasame la lista" no es una consulta general: sigue hasta la lista de precios (28/09/2026).
  // Antes caía acá y, sin modelo en juego, contestaba "contame que estabas buscando".
  if (
    info.intencion === 'consulta_general' &&
    !info.entrega &&
    !respondiendoFormaPago &&
    !pideRecomendacion &&
    !pideListaDePrecios
  ) {
    const fijas = respuestaFijaLocal(mensaje, ctx);
    if (!fijas.length && !ctx.modelo) {
      // No entendimos qué pregunta y no hay nada en juego. Preguntamos una vez;
      // si el siguiente mensaje tampoco se entiende, ahí sí lo ve una persona.
      return noSeEntiende(
        chatId,
        s,
        mensaje,
        seguidoDeNoEntendido,
        // Sin "dejame confirmarte eso bien y te aviso" (Mejora 1). `callar` sigue en false.
        () => escalar('no entiendo qué necesita el cliente', ctx, undefined, { callar: false }),
        llegada.lineas,
        { yaPreguntamos }
      );
    }
    if (!fijas.length) {
      // Hay un modelo en juego: seguimos con la venta, no cortamos la charla.
    } else if (info.modelo || (info.modelos || []).length) {
      // Nombra un modelo ("¿tenés el 13 blanco? ¿qué garantía tiene?"): Gemini podía
      // contestar también el stock, sin datos. No se le pide: va la reserva de datos
      // fijos, la misma que sale sin IA (Mejora 1).
      return { mensajes: fijas };
    } else if (fijas.includes(DATOS_FIJOS.cuotas_desde)) {
      // Cuándo arranca a pagar: el texto fijo, nunca redactado (desde cero, C48T6).
      return { mensajes: fijas };
    } else {
    const texto = await gemini.redactar(
      conNotas(
        // Solo los datos de lo que preguntó: los mismos de la respuesta sin IA,
        // cortos si ya se explicaron. Con todos los datos, el modelo sumaba temas
        // que nadie había preguntado. Lo que no está, con la marca: se escala callado.
        `Respondé la consulta del cliente usando SOLO estos datos, sin inventar nada: ` +
          `${fijas.join('. ')}. ` +
          `No contestes nada sobre disponibilidad, stock ni modelos. ` +
          `La consulta fue: "${mensaje}". Si la respuesta no está en estos datos, devolvé solo ${gemini.SIN_DATO}, sin nada más.`,
        ctx,
        nombre
      ),
      nombre,
      fijas.join('\n')
    );
    // La respuesta no estaba en los datos: al cliente no le sale nada, ni lo que
    // venga mezclado con la marca, y lo ve una persona (Mejora 1).
    if (gemini.tieneSinDato(texto)) {
      console.warn('[gemini] redactar no encontró la respuesta en los datos: escalo sin mensaje');
      return escalar(`consulta que no está en los datos fijos: "${String(mensaje).slice(0, 80)}"`, ctx);
    }
    // Lo que redacta Gemini es texto libre: si trae algo con forma de marcador de
    // acción ("[doc:...]", "[foto:...]"), no se usa y va el texto fijo (auditoría
    // del 15/09/2026, A2). Aunque ya no se ejecutaría, al cliente no le llega eso.
    if (acciones.pareceMarcador(texto)) {
      console.warn('[gemini] redactar devolvió algo con forma de marcador: uso el texto fijo');
      return { mensajes: fijas };
    }
    // Sin el saludo del principio ni los mensajes de puro relleno (desde cero, grupo 10). Si no
    // queda nada, el texto fijo.
    const limpio = limpiarRedactado(texto);
    return { mensajes: limpio.length ? limpio : fijas };
    }
  }

  // --- Guarda: no cotizar con una entrega vieja ---
  //
  // Dijo un número que puede ser plata ("con 520 me alcanza?") y no se pudo
  // leer como entrega. Si hay una guardada, seguir con esa es cotizar con un
  // monto que el cliente quizás acaba de cambiar: pasó con un chat que cotizó
  // con el primer monto una hora después de que dijera otro. Se repregunta una
  // vez; si vuelve a pasar en el mismo chat, lo ve una persona.
  //
  // Sin número no se dispara: "dale, y en cuotas como me queda?" sigue
  // cotizando con la guardada. Va acá, antes de los precios, porque las ramas
  // de arriba no cotizan.
  if (!info.entrega && ctx.entrega && local.mencionaPosibleMonto(mensaje) && !info._confirmaPrecio && !preguntaPromo) {
    if (ctx.entregaRepreguntada) {
      return escalar('dijo un monto que no pude leer y ya se lo había repreguntado', ctx);
    }
    return {
      mensajes: [
        'perdon, no te entendi bien el monto',
        acciones.conMarcas('decime con cuanto contas para la entrega asi te paso bien los numeros', {
          entregaRepreguntada: true,
        }),
      ],
    };
  }

  // --- 3. Todo lo que necesita precios ---
  const datos = await leerPlanilla();

  // "se me va mucho": nunca se deja morir ahí. Se ofrece el escalón de abajo.
  // Ojo: "no me alcanza, algun 13?" NO es una objeción de precio, es una
  // consulta concreta. Solo tratamos como objeción lo que no trae modelo ni monto.
  // Si ya sabemos cuánto tiene, "no llego" es la respuesta a que estire,
  // no una objeción nueva: sigue por el camino de la cotización.
  if (info.intencion === 'precio_alto' && !info.modelo && !info.entrega && !ctx.entrega) {
    const actual = ctx.modelo
      ? sheets.buscarModelo(datos, ctx.modelo, ctx.capacidad_gb)
      : null;
    // Sin un modelo en juego no hay escalón de abajo: se le pregunta con cuánto cuenta (desde
    // cero, C16T5: "y no amigo" recibía "otras opciones" con el 17 Pro Max, el más caro).
    const masBarato = actual
      ? [...datos.usados, ...datos.lista]
          .filter((f) => f.cotizable && f.precio_contado < actual.precio_contado)
          .sort((a, b) => b.precio_contado - a.precio_contado)[0]
      : null;

    if (masBarato) {
      const cap = masBarato.capacidad_gb ? ` ${masBarato.capacidad_gb}GB` : '';
      const bat = conBateria(masBarato);
      return {
        mensajes: [
          'tranqui, tenemos otras opciones',
          `mira, ${masBarato.modelo}${cap}${bat} lo tenemos en ${pesos(masBarato.precio_contado)}`,
          'contame con cuanto contas y vemos que te queda mejor',
        ],
      };
    }
    return {
      mensajes: [
        'tranqui, contame con cuanto contas',
        'asi vemos que modelito te entra mejor',
      ],
    };
  }

  if (datos.config.estadoLista !== 'VIGENTE') {
    // Callado: "dame un ratito que te confirmo el precio" era una promesa (Mejora 1).
    return escalar(`la lista de precios está ${datos.config.estadoLista}`, ctx);
  }

  // Nombró varios modelos, sea en un mismo mensaje o sumando uno nuevo a los
  // que ya venía mirando: se le pasan todos juntos, no de a uno.
  const pedidos = ctx.modelosPedidos || [];
  // Solo se listan juntos si el modelo que suma es uno que TODAVÍA no vio.
  // Si está eligiendo entre los que ya le pasamos, seguimos con la venta.
  const eligeEntreVistos = nuevosDelMensaje.every((m) => {
    const f = sheets.buscarModelo(datos, m, null);
    return f && (ctx.preciosMostradosDe || []).includes(f.modelo);
  });
  if (pedidos.length > 1 && pideVariosNuevos && !eligeEntreVistos) {
    const filas = pedidos
      .map((m) => sheets.buscarModelo(datos, m, null))
      .filter((f) => f && f.cotizable);
    // Nombra dos (o más) y alguno no está en la planilla (desde cero, decisión de Tomás del
    // 29/09/2026): el precio de los que están y, del que falta, "no me está quedando" con el
    // más parecido y su precio (D7). Escala sin callar: el aviso al grupo le recuerda cargarlo.
    const faltan = nuevosDelMensaje.filter((m) => noEstaCargado(datos, m));
    if (faltan.length && filas.length && !info.entrega && !ctx.entrega) {
      const nombrados = nuevosDelMensaje.map((m) => sheets.buscarModelo(datos, m, null)).filter((f) => f && f.cotizable);
      return conLosQueFaltan(ctx, datos, nombrados.length ? [...new Set(nombrados)] : filas, faltan, preguntaColores(mensaje));
    }
    if (filas.length > 1) {
      const bloque = filas
        .map((f) => {
          const nombre = f.modelo.replace(/^iPhone\s*/i, 'Ip ');
          const cap = f.capacidad_gb ? ` ${f.capacidad_gb}gb` : '';
          const bat = conBateria(f);
          return `${nombre}${cap}${bat} ${Math.round(contadoDe(f, ctx)).toLocaleString('es-AR')}`;
        })
        .join('\n');
      const plata = info.entrega || ctx.entrega;

      // Si ya dijo cuánto tiene, no se le tira una lista: se le dice
      // directamente cuáles puede retirar con esa entrega y cuáles no.
      if (plata) {
        // Cada modelo por separado (bloque 5b, decisión de Tomás del 16/09/2026): el
        // que llega al mínimo entra. Al que no llega, primero solo la entrega inicial,
        // dos veces (el conteo es por modelo); después entra con recargo si le falta
        // hasta el tope (cotizador.js), o va en la línea con el contado y la entrega
        // mínima. Nunca la diferencia. Un rechazo en el medio salta al último paso.
        const cotizaciones = new Map(filas.map((f) => [f, cotizar(f, plata, datos.config)]));
        const entran = [];
        const noEntran = [];
        const faltan = [];
        for (const f of filas) {
          const cot = cotizaciones.get(f);
          if (f.anticipo_min > 0 && faltaParaElMinimo(cot) && pasoDeInsistencia(ctx, f, rechazo) === 'insistir') {
            faltan.push(f);
          } else if (f.anticipo_min > 0 && cot.ok) {
            entran.push(f);
          } else {
            noEntran.push(f);
          }
        }
        // Pregunta por uno o más modelos y la entrega que ya había dado no llega para
        // ninguno (bloque 10, decisión de Tomás del 25/09/2026, tras la prueba en vivo: "y el
        // 13?" contestaba con el 14 Pro, el 15 Pro y el 13): se habla solo de esos, con la
        // línea de un modelo o la de varios, y los que ya se mostraron no se repiten (ni
        // avanza su conteo: no se les dijo nada). La variante la elige el conteo de esos. Si
        // alguno de los que pregunta llega, o dice un monto nuevo, sigue como siempre.
        // Lo que pregunta es lo que nombra el texto: Gemini a veces trae en `modelos` los de la
        // charla ("y el 13?" → 14 Pro, 15 Pro y 13; prueba en vivo del 25/09 con d07eb08). Si el
        // texto no nombra ninguno, el modelo que leyó Gemini.
        const nombraElTexto = local.extraerModelos(normalizar(mensaje));
        const loQuePregunta = !nuevosDelMensaje.length
          ? []
          : nombraElTexto.length
            ? nombraElTexto
            : [info.modelo].filter(Boolean);
        const preguntados = [...new Set(loQuePregunta.map((m) => sheets.buscarModelo(datos, m, null)))].filter(
          (f) => f && filas.includes(f)
        );
        if (!info.entrega && preguntados.length && preguntados.every((f) => faltan.includes(f))) {
          return {
            mensajes: [
              acciones.conMarcas(lineaEntregaInicialVarios(ctx, preguntados, plata), {
                preciosMostradosDe: preguntados.map((f) => f.modelo),
              }),
            ],
          };
        }
        // Los que no llegan, en un solo mensaje con la entrega de cada uno (bloque 9). Los
        // que sí llegan van aparte, en "te podes llevar", como siempre.
        const insistidas = faltan.length ? [lineaEntregaInicialVarios(ctx, faltan, plata)] : [];
        const bajoMinimo = entran.filter((f) => cotizaciones.get(f).bajoMinimo).map((f) => f.modelo);
        const corto = (f) => f.modelo.replace(/^iPhone\s*/i, '');
        const msgs = [];

        if (entran.length) {
          msgs.push(`con esos ${pesos(plata)} de entrega te podes llevar ${elUnoOElOtro(entran.map(corto))}`);
        } else if (!insistidas.length) {
          // Sin "no te alcanza" (bloque 10, decisión de Tomás del 25/09/2026): la regla es no
          // decirlo nunca.
          msgs.push(`con los ${pesos(plata)} todavia no estamos para esos modelos`);
        }

        // Nunca se le dice cuánto le falta, en ningún camino. De los que no le
        // entran ni con recargo se dice qué cuestan de contado y desde dónde
        // arranca la entrega; la diferencia la saca él si quiere, no la ponemos
        // nosotros. El contado va junto al mínimo porque decir solo "necesita una
        // entrega de X" se lee como si X fuera el precio del equipo.
        for (const f of noEntran.slice(0, 2)) {
          msgs.push(
            `el ${corto(f)} sale ${pesos(contadoDe(f, ctx))} de contado y la entrega arranca en ${pesos(
              f.anticipo_min
            )}`
          );
        }

        // Si ya sabemos que paga de contado, sin "asi te armo las cuotas" (Mejora 1).
        // Sin ninguno que entre no hay pregunta: la línea de la entrega va sola.
        const cola = entran.length
          ? [pagaDeContado(ctx) ? 'cual te gusta mas?' : 'cual te gusta mas? asi te armo las cuotas']
          : [];
        const todos = [...msgs, ...insistidas, ...cola];
        // Los precios de este bloque los marca el primer mensaje, que es el que
        // dice de qué modelos estamos hablando.
        todos[0] = acciones.conMarcas(todos[0], { preciosMostradosDe: filas.map((f) => f.modelo) });
        return { mensajes: todos.slice(0, 4), ...(bajoMinimo.length ? { bajoMinimo } : {}) };
      }

      // Antes del precio, qué modelos le pasamos y que hay más. Antes decía "los dos
      // los tenemos en stock", que con tres modelos quedaba mal.
      const nombres = filas.map((f) => f.modelo.replace(/^iPhone\s*/i, ''));
      const listado =
        nombres.length === 2 ? `${nombres[0]} y el ${nombres[1]}` : nombres.join(', ');
      // La garantía va de yapa: solo si no se explicó, o si la pregunta.
      const garantia = temas.decir('garantia', ctx, mensaje, 'todos vienen con 1 mes de garantia');
      const msgs = [
        `buenisimo, te paso el ${listado}, ${RANGO_MODELOS}`,
        ...(garantia ? [garantia] : []),
        bloque,
      ];
      // Si preguntó por cuotas, se le explica (corto si ya se explicó); si no, primero que elija.
      // Acá va solo el texto: con la lista y la pregunta no queda lugar para el PDF,
      // que sale con la cotización (bloque 3b).
      if (/cuota|financia|en pagos|plan/i.test(mensaje)) {
        msgs.push(temas.responder('financiacion', ctx, () => estilo.frase('explicaFinanciacion')));
      }
      msgs.push(estilo.frase('cualTeGusta'));
      while (msgs.length > 4) msgs.splice(1, 1); // se recorta el adorno, nunca los precios
      // La marca va pegada al bloque de precios: sin ese mensaje no se mostró nada.
      const iBloque = msgs.indexOf(bloque);
      if (iBloque >= 0) {
        msgs[iBloque] = acciones.conMarcas(bloque, {
          preciosMostradosDe: filas.map((f) => f.modelo),
        });
      }
      // Pregunta también por los colores (desde cero, C74T3): los precios, y avisa al grupo.
      if (preguntaColores(mensaje)) return escalar(ESCALAR_COLORES, ctx, msgs, { callar: false });
      return { mensajes: msgs };
    }
  }

  // Pregunta el precio de dos o más que ya vio ("un 12 o 13 xfa, ¿qué precio?"; desde cero,
  // C71T3): el de cada uno y que elija. Iba solo el que leyó Gemini, sin nombrarlo.
  const vistosQueNombra = [
    ...new Set(local.extraerModelos(normalizar(mensaje)).map((m) => sheets.buscarModelo(datos, m, null))),
  ].filter((f) => f && f.cotizable && (ctx.preciosMostradosDe || []).includes(f.modelo));
  if (vistosQueNombra.length > 1 && preguntaPrecio(mensaje) && !info.entrega && !ctx.entrega) {
    const nombres = vistosQueNombra.map((f) => nombreParaDecir(f.modelo));
    return {
      mensajes: [
        vistosQueNombra.map((f, i) => `el ${nombres[i]} esta ${pesos(contadoDe(f, ctx))}`).join(' y ') + ' de contado',
        preguntaCualDeEsos(nombres),
      ],
    };
  }

  // Colores: no están en la planilla. Se avisa al grupo para que alguien mande la
  // foto. "apenas llegue al local te mando la foto" se sacó en la Mejora 1: era
  // una promesa que el bot no cumple. Termina en una pregunta al cliente, así que
  // el chat no calla (Mejora 1b): si contesta "el 13", se le contesta.
  if (preguntaColores(mensaje)) {
    return escalar(
      ESCALAR_COLORES,
      ctx,
      ['cualquier cosa decime que modelo te interesa mas y te muestro ese'],
      { callar: false }
    );
  }

  if (pideRecomendacion) {
    const plata = info.entrega || ctx.entrega;
    if (!plata) {
      return {
        mensajes: [
          'depende de con cuanto contes',
          'contame que presupuesto tenias en mente y te digo cual te conviene',
        ],
      };
    }
    const entra = [...datos.usados, ...datos.lista]
      .filter((f) => f.cotizable && f.anticipo_min > 0 && f.anticipo_min <= plata)
      .sort((a, b) => b.precio_contado - a.precio_contado)[0];
    if (entra) {
      const cot = cotizar(entra, plata, datos.config);
      // La cotización ya no lleva el precio: si pregunta cuánto sale, va con el
      // modelo. Si se paga entero con la entrega, ya lo dice la cotización.
      const precio = cot.ok && !cot.soloContado && preguntaPrecio(mensaje) ? precioParaDecir([entra]) : null;
      // Acá el modelo lo elegimos nosotros: si el mensaje no sale, el cliente no
      // sabe de cuál estamos hablando, así que la marca viaja con él. Como propuesto
      // queda ya, para el hilo cuando no le llega nada (Parte A).
      state.actualizar(chatId, { modeloPropuesto: entra.modelo });
      const msgs = [
        acciones.conMarcas(`con eso el que te conviene es el ${entra.modelo}${precio ? `, esta ${precio}` : ''}`, {
          modelo: entra.modelo,
          preciosMostradosDe: [entra.modelo],
        }),
      ];
      if (cot.ok) {
        msgs.push(
          acciones.conMarcas(plantilla(entra, cot), {
            modelo: entra.modelo,
            cotizadoDe: entra.modelo,
            entregaCotizada: plata,
            cotizadoDeContado: Boolean(cot.soloContado),
          })
        );
      }
      msgs.push('contame que te parece');
      return { mensajes: msgs };
    }
  }

  // Dice "el pro" sin decir cuál
  if (info.intencion === 'modelo_ambiguo' && !ctx.modelo) {
    const pros = datos.lista
      .filter((f) => f.cotizable && /pro/i.test(f.modelo))
      .map((f) => f.modelo.replace(/^iPhone\s*/i, ''))
      .slice(0, 4);
    return {
      mensajes: [
        pros.length ? `cual pro? tenemos ${pros.join(', ')}` : 'cual te interesa?',
        'decime cual y con cuanto contas asi te cotizo',
      ],
    };
  }

  // Pide el más barato o el más caro
  if (info.intencion === 'pide_extremo') {
    const caro = /(mas caro|más caro|el mejor)/i.test(mensaje);
    const orden = [...datos.lista, ...datos.usados]
      .filter((f) => f.cotizable && f.precio_contado > 0)
      .sort((a, b) => (caro ? b.precio_contado - a.precio_contado : a.precio_contado - b.precio_contado));
    const f = orden[0];
    if (f) {
      const cap = f.capacidad_gb ? ` ${f.capacidad_gb}GB` : '';
      const bat = conBateria(f);
      // El modelo lo elegimos nosotros: `modelo` es marca y se confirma al salir; como
      // propuesto queda ya, para el hilo cuando no le llega nada (Parte A).
      state.actualizar(chatId, { modeloPropuesto: f.modelo });
      const msgs = [
        acciones.conMarcas(
          `${caro ? 'el mas completo' : 'el mas economico'} que tenemos es el ${f.modelo}${cap}${bat}`,
          { modelo: f.modelo, stockInformadoDe: f.modelo }
        ),
      ];
      if (f.detalles) msgs.push(`ojo que tiene esto: ${f.detalles.toLowerCase()}`);
      msgs.push(`esta en ${pesos(f.precio_contado)} de contado`);
      msgs.push('contame con cuanto contas para la entrega asi te cotizo las cuotas');
      return { mensajes: msgs.slice(0, 4) };
    }
  }

  // Pedir la lista gana sobre el modelo que veníamos hablando. Antes esto vivía
  // dentro del `if (!modeloPedido)` de abajo, así que un "me pasas stock de
  // precios" en un chat donde ya se había nombrado un modelo NUNCA llegaba acá:
  // se iba a cotizar el modelo viejo. Si la persona pide la lista, va la lista.
  const pideLaLista =
    pideListaDePrecios ||
    /(stock|precios|lista|que ten(e|é)s|qué ten(e|é)s|que hay|modelos|ofrecer|opciones)/i.test(
      mensaje
    );
  // Si nombra un modelo que no está en la planilla, va por la rama del que falta aunque
  // también pida stock o la lista (desde cero, D7: "¿tenés algún 14 Pro Max en stock?"
  // recibía la lista entera, sin decir que ese no está ni avisar).
  const nombraUnoQueFalta = !filtroLista && [info.modelo, ...(info.modelos || [])].some((m) => noEstaCargado(datos, m));
  if (pideLaLista && !nombraUnoQueFalta) {
    const respuesta = responderLista(chatId, ctx, datos, filtroLista);
    if (respuesta) return respuesta;
  }

  // Pidió un modelo anterior al 11 (bloque 8, decisión de Tomás del 24/09/2026): no se
  // trabaja, aunque esté cargado. El rango y que diga cuál le interesa, sin números y
  // sin escalar. No queda como el modelo del chat (ver `noTrabajado`), así que el
  // mensaje siguiente no lo repite. El saludo, si va, lo pone decidirYFormatear (bloque 9).
  if (noTrabajado && !info.modelo) {
    return {
      mensajes: [
        `ese no lo trabajamos, ${RANGO_MODELOS.replace(/^igualmente /, '')}`,
        'contame cual te interesa asi te paso el precio',
      ],
    };
  }

  // Vio dos o más modelos, no eligió ninguno y dice un monto sin nombrar modelo: se
  // cotizan todos (bloque 5). Antes cotizaba solo el último que nombró.
  if (info.entrega && !info.modelo && modelosEnJuego(ctx).length) {
    const guardado = ctx.modelo ? sheets.buscarModelo(datos, ctx.modelo, ctx.capacidad_gb) : null;
    if (!eligioUnModelo(ctx, guardado)) {
      const respuesta = cotizarVistos(chatId, ctx, mensaje, datos, info.entrega, rechazo);
      if (respuesta) return respuesta;
    }
  }

  const modeloPedido = info.modelo || ctx.modelo;

  if (!modeloPedido) {
    const entregaDeclarada = info.entrega || ctx.entrega;

    // Dijo cuánto tiene pero no qué modelo: le mostramos lo mejor que le entra.
    if (entregaDeclarada) {
      const entra = [...datos.usados, ...datos.lista]
        .filter((f) => f.cotizable && f.anticipo_min > 0 && f.anticipo_min <= entregaDeclarada)
        .sort((a, b) => b.precio_contado - a.precio_contado)[0];

      if (entra) {
        const cot = cotizar(entra, entregaDeclarada, datos.config);
        // Si pregunta cuánto sale, el precio va con el modelo (Ajustes 1).
        const precio = cot.ok && !cot.soloContado && preguntaPrecio(mensaje) ? precioParaDecir([entra]) : null;
        // El modelo lo elegimos nosotros: `modelo` es marca y se confirma al salir; como
        // propuesto queda ya, para el hilo cuando no le llega nada (Parte A).
        state.actualizar(chatId, { modeloPropuesto: entra.modelo });
        const mensajes = [
          acciones.conMarcas(`con esa entrega el mejor que te llevas es el ${entra.modelo}${precio ? `, esta ${precio}` : ''}`, {
            modelo: entra.modelo,
            stockInformadoDe: entra.modelo,
          }),
        ];
        if (cot.ok) mensajes.push(plantilla(entra, cot));
        mensajes.push('si preferis otro modelo decime y te cotizo ese');
        return { mensajes };
      }
      return {
        mensajes: [
          'con ese monto por ahora no me queda nada para ofrecerte',
          // Sin "apenas entre algo te aviso" (Mejora 1): no hay nada que le avise solo
          // cuando entra stock. Anotado sí: la entrega queda en el chat y sale en el resumen.
          'te lo dejo anotado igual',
        ],
      };
    }



    // Ya le pasamos precios de varios modelos y todavía no eligió: se le pregunta
    // por esos. Nunca "contame que estas buscando", como si no se le hubiera
    // cotizado nada (pasó en la prueba en vivo del 15/09/2026).
    const vistos = modelosVistos(ctx);
    if (vistos.length) return { mensajes: [preguntaCualDeEsos(vistos)] };

    // Ya le hicimos la pregunta genérica y esto no trae nada (Gemini lo lee como saludo u
    // "otro"): no se repite, es el segundo que no se entiende (desde cero, 29/09/2026). Lo
    // mismo después de la pregunta de "no se entiende" (C4T4: "Listooo, no ahora lo kargo"
    // recibía "contame que estas buscando y con cuanto contas" justo después).
    const otroQueNoSeEntiende = yaPreguntamos || (seguidoDeNoEntendido && !contestaElSaludo(mensaje, s.historial));
    if (otroQueNoSeEntiende && ['saludo', 'otro', 'sin_contenido', 'consulta_general'].includes(info.intencion)) {
      return noSeEntiende(
        chatId,
        s,
        mensaje,
        seguidoDeNoEntendido,
        () => escalar('mandó varios mensajes que no se entienden', ctx, undefined, { callar: false }),
        llegada.lineas,
        { yaPreguntamos }
      );
    }

    // Hoy ya se habló: no hay saludo (bloque 9), así que se retoma nombrándolo igual. Si
    // no, decidirYFormatear pone el saludo del día y acá va solo la pregunta.
    if (hablaronHoy(ctx)) {
      const apodo = deformar(nombre);
      return {
        mensajes: [
          apodo ? estilo.frase('retomar', apodo) : 'contame que estas buscando y con cuanto contas',
        ],
      };
    }
    return { mensajes: [estilo.frase('queModelo')] };
  }

  const coincidencias = sheets.buscarTodas(datos, modeloPedido, info.capacidad_gb || ctx.capacidad_gb);
  const fila = coincidencias[0] || null;

  if (!fila) {
    // No está cargado: no lo dejamos ir. Se le ofrece el más parecido que sí hay (desde cero,
    // D7, decisión de Tomás del 29/09/2026; ver `masParecido`), con el precio de contado que
    // respeta el descuento (`contadoDe`), se le pregunta si le interesaba solo ese, y avisa al
    // grupo. Sin nada parecido, no se ofrece alternativa. Hasta el 29/09 era el más barato de
    // toda la planilla, con `precio_contado` a secas.
    const parecido = masParecido(datos, modeloPedido);

    const mensajes = [`ese justo no me esta quedando ahora`];
    if (parecido) {
      const cap = parecido.capacidad_gb ? ` ${parecido.capacidad_gb}GB` : '';
      const bat = conBateria(parecido);
      mensajes.push(`pero tengo ${parecido.modelo}${cap}${bat} en ${pesos(contadoDe(parecido, ctx))}`);
    }
    // Sin "sino me fijo en el deposito y te aviso en un ratito" (Mejora 1): nadie
    // se fija solo. La pregunta queda, y como es una pregunta al cliente el chat no
    // calla (Mejora 1b): "dale, pasame el X", un monto u otro modelo siguen la venta
    // con el flujo normal. El aviso al grupo sale igual.
    mensajes.push('te interesaba solo ese modelo?');
    return escalar(`pidió "${modeloPedido}" y no está cargado en la planilla`, ctx, mensajes, { callar: false });
  }
  if (!fila.cotizable) {
    // Callado: "dejame confirmar disponibilidad de ese y te aviso" era una promesa (Mejora 1).
    return escalar(`"${fila.modelo}" está en la planilla pero marcado como no cotizable`, ctx);
  }

  // Confirma el precio con una entrega ya guardada (segunda vuelta, 30/09/2026): solo la línea del
  // precio. "tengo 500" y después "¿y de contado está a 800 mil?" recibía "abonás los $500.000 de
  // entrega…", la cotización con la entrega vieja.
  if (info._confirmaPrecio && !info.entrega && ctx.entrega) {
    const precio = precioParaDecir(coincidencias.filter((f) => f.cotizable), ctx);
    if (precio) return { mensajes: [`sii, esta ${precio} de contado`] };
  }

  // Hay stock y precio: primero se confirma stock, después el número.
  const entrega = info.entrega || ctx.entrega;

  if (!entrega) {
    // Si ya le pasamos stock y precio de este modelo, no repetimos todo el bloque:
    // solo insistimos con la pregunta de la entrega.
    const yaLeMostramosEste =
      ctx.stockInformadoDe === fila.modelo ||
      (ctx.preciosMostradosDe || []).includes(fila.modelo);

    if (yaLeMostramosEste) {
      const pidePlata = /cuota|financia|en pagos|plan|entrega/i.test(mensaje);
      // Si nombra las dos, gana cuotas: es la opción que hay que explicarle. "Trasferencia" o
      // "tranferencia" también (desde cero, C11T3: recibía "cómo lo ibas a hacer").
      const pideContado =
        !leInteresanCuotas &&
        /contado|efectivo|tra(?:n|s|ns)ferencia|todo junto|de una vez/i.test(mensaje);

      // Paso 2: eligió el modelo. Fotos y recién ahí se habla de plata.
      // Ojo: un "hola?" no es elegir. Hace falta una señal afirmativa.
      const nombraEsteModelo = (info.modelos || []).some((m) => {
        const f = sheets.buscarModelo(datos, m, null);
        return f && f.modelo === fila.modelo;
      });
      const eligio =
        nombraEsteModelo ||
        /\b(si+|dale|ese|esa|este|me gust|quiero|me quedo|perfecto|joya|listo|va|vamos|ese nomas|me interesa)\b/i.test(
          mensaje
        );
      // Pregunta el precio del que ya vio (desde cero, grupo 6, 29/09/2026; Ajustes 1: el precio
      // se dice cuando lo pregunta): va primero, con el descuento si se lo dimos, o "desde" el
      // más barato si hay unidades de precios distintos. Después sigue lo de siempre, y
      // preguntar el precio también es interés: va la pregunta de cómo paga. Hasta el 29/09
      // "¿en qué valor?" recibía "si te interesa ese o preferís otro".
      const precioDeEste =
        preguntaPrecio(mensaje) || info._confirmaPrecio ? precioParaDecir(coincidencias.filter((f) => f.cotizable), ctx) : null;
      const lineaPrecio = precioDeEste ? `${info._confirmaPrecio ? 'sii, ' : ''}esta ${precioDeEste} de contado` : null;

      if (!ctx.preguntamosFormaPago && !pidePlata && !pideContado && !eligio && !lineaPrecio) {
        return {
          mensajes: ['contame si te interesa ese o preferis que te muestre otro modelito'],
        };
      }

      if (!ctx.preguntamosFormaPago && !pidePlata && !pideContado) {
        // El modelo elegido es del cliente: se guarda ya. Que le preguntamos cómo
        // paga es marca nuestra, y la confirma la pregunta cuando sale.
        state.actualizar(chatId, { modelo: fila.modelo });
        const msgs = [lineaPrecio || estilo.frase('buenaEleccion')];
        // Solo se habla de fotos si de verdad hay una para mandar. Es de referencia, no la
        // del equipo que se lleva (bloque 8: "te paso fotos del equipo asi lo ves bien").
        const foto = fotos.buscar(fila.modelo);
        if (foto) {
          msgs.push(acciones.foto(fila.modelo));
          msgs.push('te paso una foto de referencia');
        }
        if (temas.explicado(ctx, 'financiacion')) {
          // Ya se le explicó cómo financiamos: se pregunta sin volver a explicarlo.
          msgs.push('contame si lo ibas a hacer de contado o en cuotas asi te paso los numeros');
        } else {
          // El porcentaje se calcula del modelo, así nunca contradice a la planilla
          const pct = porcentajeEntrega(fila);
          const conPct = pct ? ` del ${pct}%` : '';
          msgs.push(estilo.frase('comoPaga', conPct));
        }
        msgs[msgs.length - 1] = acciones.conMarcas(msgs[msgs.length - 1], {
          preguntamosFormaPago: true,
        });
        return { mensajes: msgs };
      }

      // Paso 3a: quiere cuotas -> recién acá se dice cuánto es la entrega. Antes,
      // cómo es la financiación y el PDF del compromiso si todavía no le llegaron
      // (bloque 3b): "cómo pensabas pagarlo" ofrece las cuotas, no las explica.
      if (pidePlata || info.forma_pago === 'cuotas' || ctx.forma_pago === 'cuotas') {
        return {
          mensajes: [
            ...explicacionConCompromiso(chatId, ctx, mensaje),
            precioDeEste
              ? `dale, el ${fila.modelo} esta ${precioDeEste} de contado y la entrega arranca en ${pesos(fila.anticipo_min)}`
              : `dale, para el ${fila.modelo} la entrega arranca en ${pesos(fila.anticipo_min)}`,
            estilo.frase('pedirEntrega'),
          ].slice(0, 4),
        };
      }

      // Paso 3b: lo hace de contado. No hay nada que cotizar: cierra un humano,
      // pero el bot ya pregunta el día en vez de prometer que alguien escribe.
      if (pideContado || info.forma_pago === 'contado') {
        return responderTurno(ctx, mensaje, {
          motivo: 'el cliente lo hace de contado y quiere avanzar',
          antes: [`perfecto, de contado el ${fila.modelo} te queda en ${pesos(contadoDe(fila, ctx))}`],
        });
      }

      // No quedó claro cómo quiere pagarlo
      return {
        mensajes: [lineaPrecio, 'contame si lo ibas a hacer de contado o en cuotas asi te paso los numeros'].filter(Boolean),
      };
    }
    const cap = fila.capacidad_gb ? ` ${fila.capacidad_gb}GB` : '';
    const bat = conBateria(fila);
    const corto = fila.modelo.replace(/^iPhone\s*/i, '');
    // Partido como escribe Tomás: que sí lo tenemos, el precio, y la pregunta. Una
    // idea por mensaje. Nada de cuotas todavía. El saludo con el nombre, si va, lo
    // pone decidirYFormatear (bloque 9).
    const mensajes = [];
    // Cada marca con el mensaje que la justifica: el stock con el que dice que lo
    // tenemos, el precio con el que lo pasa.
    mensajes.push(
      acciones.conMarcas(`${estilo.frase('hayStock', `${fila.modelo}${cap}${bat}`)}, ${RANGO_MODELOS}`, {
        stockInformadoDe: fila.modelo,
      })
    );
    mensajes.push(
      acciones.conMarcas(estilo.frase('precioDeEse', pesos(fila.precio_contado)), {
        preciosMostradosDe: [fila.modelo],
      })
    );
    // Transparencia: si el equipo tiene un detalle cargado, se aclara.
    if (fila.detalles) mensajes.push(`ojo que tiene esto: ${fila.detalles.toLowerCase()}`);
    mensajes.push(estilo.frase('otroModelo', corto));
    return { mensajes: mensajes.slice(0, 4) };
  }

  const cot = cotizar(fila, entrega, datos.config);

  // --- 4. La entrega no llega al mínimo: primero se insiste con la entrega ---
  //
  // Bloque 5b (decisión de Tomás del 16/09/2026, tras la prueba en vivo del bloque
  // 5): el recargo es el último recurso. Con la entrega bajo el mínimo del modelo
  // que nombró el cliente:
  //  1) y 2) se le dice SOLO la entrega inicial de ese modelo, sin cotizar, sin el
  //     contado, sin la diferencia y sin pregunta, dos veces. Si la financiación
  //     todavía no le llegó, la explicación y el PDF van antes, como en la cotización.
  //  3) si sigue sin llegar: con hasta TOPE_BAJO_MINIMO de diferencia se cotiza con
  //     recargo (cotizador.js, por la cotización normal de abajo), sin avisar nada;
  //     con más, la alternativa. Un rechazo en el paso 1 o 2 ("entonces no", "lo
  //     dejo") salta directo acá con el último monto.
  // El conteo (`insistenciaEntrega`) es por modelo y suma cuando la línea sale; si
  // cambia de modelo, el nuevo arranca de cero. Si el monto llega al mínimo en
  // cualquier paso, cotiza normal. Donde el bot elige el modelo (monto sin modelo,
  // recomendación, la alternativa) sigue el mínimo estricto.
  if (faltaParaElMinimo(cot) && pasoDeInsistencia(ctx, fila, rechazo) === 'insistir') {
    state.actualizar(chatId, { presupuestoAnotado: entrega });
    const mensajes = [];
    if (!temas.explicado(ctx, 'financiacion')) {
      mensajes.push(estilo.frase('explicaFinanciacion'));
      const requisitos = requisitosConCompromiso(chatId, ctx, mensaje);
      if (requisitos) mensajes.push(requisitos);
    }
    mensajes.push(lineaEntregaInicial(ctx, fila, entrega));
    return { mensajes: mensajes.slice(0, 4) };
  }

  // Paso 3 con más del tope: la alternativa, y la puerta abierta con el número anotado.
  if (!cot.ok && cot.motivo === 'ENTREGA_BAJA') {
    state.actualizar(chatId, { presupuestoAnotado: entrega });

    // Se dice UNA sola vez por modelo. Es el final del camino: sin esta marca,
    // cualquier mensaje posterior que no traiga nada nuevo —un "buenas", un saludo
    // mal escrito— volvía a caer acá y repetía la misma cotización palabra por
    // palabra. Pasó tres veces en un chat real.
    if (ctx.puertaAbiertaDe === fila.modelo) {
      return {
        mensajes: [
          `seguis buscando el ${fila.modelo.replace(/^iPhone\s*/i, '')}?`,
          'decime si llegaste a juntar mas o si queres que te muestre otro modelo',
        ],
      };
    }
    // El modelo lo elige el bot: mínimo estricto, sin recargo (bloque 5).
    const alt = alternativaMasBarata([...datos.usados, ...datos.lista], entrega, fila.modelo);
    const mensajes = [];
    if (alt) {
      const cotAlt = cotizar(alt, entrega, datos.config);
      mensajes.push('dale, mira lo que si te podes llevar con esa entrega:');
      if (cotAlt.ok) mensajes.push(plantilla(alt, cotAlt));
    } else {
      mensajes.push('con ese monto por ahora no me queda nada para ofrecerte');
    }
    // La puerta abierta se marca con el mensaje que la deja abierta. Lleva el
    // mínimo, que ya se le dijo dos veces, nunca la diferencia.
    mensajes.push(
      acciones.conMarcas(
        `y el ${fila.modelo} te lo dejo anotado, cuando llegues a los ${pesos(
          cot.minimo
        )} avisame y es tuyo`,
        { puertaAbiertaDe: fila.modelo }
      )
    );
    return { mensajes };
  }

  if (!cot.ok) {
    // Callado: "dame un minuto y te paso el numero" era una promesa (Mejora 1).
    return escalar(`no pude cotizar el ${fila.modelo} (${cot.motivo})`, ctx);
  }

  // --- 5. Cotización normal ---
  // Si del mismo modelo hay una unidad puntual y además la fila de catálogo, van
  // las dos en la cotización (ver más abajo).
  const cotizables = coincidencias.filter((f) => f.cotizable);
  // Con el descuento del chat, si lo tiene: solo cambia el contado (bloque 5).
  const opciones = cotizables
    .map((f) => ({ fila: f, cot: conDescuento(cotizar(f, entrega, datos.config), f, entrega, ctx.descuentoDe) }))
    .filter((o) => o.cot.ok);
  const cotizadas = opciones.length ? opciones : [{ fila, cot: conDescuento(cot, fila, entrega, ctx.descuentoDe) }];
  // Para el log (index.js): al cliente no le llega nada distinto.
  const bajoMinimo = cotizadas.filter((o) => o.cot.bajoMinimo).map((o) => o.fila.modelo);
  const conBajoMinimo = (r) => (bajoMinimo.length ? { ...r, bajoMinimo: [...new Set(bajoMinimo)] } : r);
  const pidePrecio = preguntaPrecio(mensaje);

  // Si la entrega paga el equipo entero (con varias unidades, todas), no se le
  // habla de financiación: ni la explicación, ni el PDF, ni los requisitos
  // (Ajustes 1b, decisión de Tomás del 16/09/2026). Si pregunta por la
  // financiación, van las piezas de siempre; si pregunta solo por los requisitos,
  // esos. Lo que no sale no se marca, así que va con la próxima cotización en cuotas.
  const deContado = cotizadas.every((o) => o.cot.soloContado);
  const hablaFinanciacion = !deContado || temas.pregunta(mensaje, 'financiacion');
  const hablaRequisitos = hablaFinanciacion || temas.pregunta(mensaje, 'requisitos');
  // Los requisitos, cuando van: de contado y sin hablar de financiación, que no
  // necesita nada, sin el PDF (Mejora 1, decisión de Tomás del 16/09/2026).
  const decirRequisitos = () =>
    hablaFinanciacion ? requisitosConCompromiso(chatId, ctx, mensaje) : estilo.frase('requisitosContado');

  // Si ya le cotizamos ese mismo modelo con ese mismo monto, no se repite
  // la cotización: se le confirma y se lo empuja a decidir. Si pregunta cuánto
  // sale, se le dice en ese mismo mensaje, aunque ya lo haya visto (Ajustes 1).
  // De contado, sin "el resto lo hacemos en cuotas" (Mejora 1).
  if (ctx.cotizadoDe === fila.modelo && ctx.entregaCotizada === entrega) {
    const corto = fila.modelo.replace(/^iPhone\s*/i, '');
    const precio = pidePrecio ? precioParaDecir(cotizadas.map((o) => o.fila), ctx) : null;
    return conBajoMinimo({
      mensajes: [
        precio
          ? estilo.frase('yaCotizadoConPrecio', pesos(entrega), corto, precio)
          : estilo.frase(deContado ? 'yaCotizadoContado' : 'yaCotizado', pesos(entrega), corto),
        // Las cuotas y los requisitos van de yapa: si ya se explicaron, no se repiten.
        hablaFinanciacion ? temas.decir('financiacion', ctx, mensaje, () => estilo.frase('restoEnCuotas')) : null,
        hablaRequisitos ? decirRequisitos() : null,
        estilo.frase('confirmarSigue'),
      ].filter(Boolean),
    });
  }

  // Antes de la cotización va cómo es la financiación y el PDF del compromiso,
  // pregunte o no, si la financiación todavía no le llegó, del bot o de una
  // persona (bloque 3b, decidido con Tomás el 16/09/2026 tras la prueba en vivo:
  // el bot cotizó sin explicar nunca las cuotas). Una cotización en cuotas ya la
  // marca ("1 pago de"); una de contado no, así que la explicación sale con la
  // próxima en cuotas (Ajustes 1b). En ese caso se saca "ahora te cotizo" para entrar en 4:
  //   explicación · PDF con su pie · "te lo llevas" · cotización.
  const explicaAntes = hablaFinanciacion && !temas.explicado(ctx, 'financiacion');
  const requisitos = hablaRequisitos ? decirRequisitos() : null;
  const mensajes = [];
  if (explicaAntes) {
    mensajes.push(estilo.frase('explicaFinanciacion'));
    if (requisitos) mensajes.push(requisitos);
  }
  // Antes del número, confirmarle que con esa entrega se lo lleva. Si dijo que
  // es su primer iPhone, se lo reconoce antes: como frase aparte si hay lugar,
  // o fundida con "te lo llevas" en un solo mensaje cuando la explicación va
  // adelante y la tanda tiene 4 justos (bloque 4b, decidido por Tomás). En los
  // dos casos la marca viaja con ese mensaje: se confirma solo si salió.
  const reconocePrimerIphone = esPrimerIphone && !ctx.primerIphoneDicho;
  if (reconocePrimerIphone && !explicaAntes) {
    mensajes.push(acciones.conMarcas(estilo.frase('primerIphone'), { primerIphoneDicho: true }));
  }
  // La cotización no muestra el precio de contado (Ajustes 1, decisión de Tomás
  // del 16/09/2026). Si pregunta cuánto sale, va en "te lo llevas", aunque ya se
  // lo hayamos mostrado, y sin sumar mensajes. No hace falta si se paga entero con
  // la entrega: ahí la cotización ya dice el precio.
  const precio = pidePrecio && !deContado ? precioParaDecir(cotizadas.map((o) => o.fila), ctx) : null;
  // Paso 3 con recargo (Bloque Tono, decisión de Tomás del 17/09/2026): antes de la
  // ficha, que está cerca y que le hacemos una excepción, con su entrega y sin más
  // números. Reemplaza a "te lo llevas" y a "ahora te cotizo", que ya dice. Si además
  // preguntó el precio o es su primer iPhone, esas frases siguen y la excepción va
  // antes; si con eso la tanda se pasa de 4, se funden en un mensaje (más abajo).
  const excepcion = bajoMinimo.length
    ? estilo.frase('excepcionCerca', `el ${nombreParaDecir(fila.modelo)}`, pesos(entrega))
    : null;
  if (excepcion) mensajes.push(excepcion);
  if (!ctx.cotizadoDe || ctx.cotizadoDe !== fila.modelo || precio) {
    const plata = pesos(entrega);
    if (reconocePrimerIphone && explicaAntes) {
      mensajes.push(
        acciones.conMarcas(
          // De contado va sin el monto (opción A de Tomás, 19/09/2026): la ficha
          // que sigue ya dice que le alcanza, y con el monto las dos repetían lo mismo.
          deContado
            ? estilo.frase('primerIphoneContado')
            : precio
              ? estilo.frase('primerIphoneRetiraConPrecio', fila.modelo, plata, precio)
              : estilo.frase('primerIphoneRetira', fila.modelo, plata),
          { primerIphoneDicho: true }
        )
      );
    } else if ((!excepcion || precio) && !deContado) {
      // De contado no va (Pendientes 1, D3, decisión de Tomás tras la prueba en vivo
      // del 16/09/2026): "lo podés retirar con esos $900.000" y la ficha "con esa
      // plata lo sacás de contado, está $800.000" decían lo mismo. Queda solo la
      // ficha. `precio` nunca está de contado (ya lo dice la ficha).
      mensajes.push(
        precio
          ? estilo.frase('puedeRetirarConPrecio', fila.modelo, plata, precio)
          : estilo.frase('puedeRetirar', fila.modelo, plata)
      );
    }
    // De contado y sin hablar de financiación: "te lo llevas" y el precio, nada más.
    if (!explicaAntes && hablaFinanciacion && !excepcion) mensajes.push(estilo.frase('ahoraCotizo'));
  }
  // Si del mismo modelo hay una unidad puntual y además la fila de catálogo,
  // las dos van en ESTE mensaje, de más barata a más cara. Nunca en un mensaje
  // aparte: el tope por tanda queda intacto.
  // La cotización la marca el mensaje de los números: si no sale, el cliente no la
  // recibió y el bot se la vuelve a pasar.
  mensajes.push(
    acciones.conMarcas(
      opciones.length > 1 ? plantillaVarias(opciones, cotizables.length) : plantilla(cotizadas[0].fila, cotizadas[0].cot),
      // `cotizadoDeContado`: si paga de contado, las preguntas que vengan después
      // (papeles, otro modelo) no le hablan de cuotas (Mejora 1).
      { cotizadoDe: fila.modelo, entregaCotizada: entrega, cotizadoDeContado: deContado }
    )
  );
  if (!explicaAntes && requisitos) mensajes.push(requisitos);

  // Con la excepción la tanda puede pasar de 4 (la explicación y el PDF adelante, o
  // el primer iPhone, más el precio que preguntó): se funde la excepción con el
  // mensaje que la sigue, si es el que acompaña la ficha (Bloque Tono).
  if (excepcion && mensajes.length > 4) {
    const i = mensajes.indexOf(excepcion);
    const siguiente = mensajes[i + 1];
    if (siguiente && !acciones.esAccion(siguiente) && !/^📱/.test(acciones.comoTexto(siguiente))) {
      mensajes.splice(
        i,
        2,
        acciones.conMarcas(`${acciones.comoTexto(excepcion)}\n${acciones.comoTexto(siguiente)}`, acciones.marcasDe(siguiente) || {})
      );
    }
  }

  // Con la explicación adelante son 4 justos (el primer iPhone ya va fundido
  // con "te lo llevas"). Sin la explicación sigue como siempre: si se pasa, el
  // tope se lleva los requisitos o el PDF, que salen con la próxima cotización.
  // Nunca se recorta la cotización.
  return conBajoMinimo({ mensajes: mensajes.slice(0, 4) });
}

/**
 * Convierte el mensaje de requisitos en un envío del compromiso de pago, con
 * ese mismo texto de pie. Una sola vez por conversación: el PDF es el mismo
 * siempre y mandarlo dos veces queda mal.
 */
function conCompromiso(chatId, ctx, texto) {
  if (ctx.compromisoEnviado) return texto;
  if (!documentos.compromisoDePago()) return texto;
  // El PDF marca `compromisoEnviado` cuando Evolution confirma ESE envío. Si el
  // documento falla y solo sale el texto de pie, el compromiso sigue pendiente.
  return acciones.conMarcas(acciones.doc('compromiso', texto), { compromisoEnviado: true });
}

/**
 * Los requisitos que acompañan una cotización o la explicación de la
 * financiación, con el PDF del compromiso si todavía no salió. El pie es
 * `pieCompromiso` (estilo.js): sin tarjeta, solo el dni, y que se lo pasamos.
 * Si ya se explicaron y no los pregunta: el PDF con un pie corto si falta
 * mandarlo, o nada. Sin PDF para mandar, tampoco se anuncia.
 */
function requisitosConCompromiso(chatId, ctx, mensaje) {
  const texto = temas.decir('requisitos', ctx, mensaje, () => estilo.frase('pieCompromiso'));
  if (texto) return conCompromiso(chatId, ctx, texto);
  if (ctx.compromisoEnviado) return null;
  const conPdf = conCompromiso(chatId, ctx, 'te paso el compromiso de pago');
  return acciones.esDoc(conPdf) ? conPdf : null;
}

/**
 * Arranca cada mensaje con mayúscula. No toca la plantilla de cotización ni
 * la lista de precios, que llevan su propio formato.
 */
function capitalizar(texto) {
  // De un documento se capitaliza el pie, que es lo que lee el cliente. La foto no lleva texto.
  if (acciones.esDoc(texto)) return { ...texto, pie: capitalizar(texto.pie) };
  if (acciones.esFoto(texto)) return texto;
  // Un texto que lleva marcas se capitaliza igual, sin perderlas.
  if (acciones.esTexto(texto)) return { ...texto, texto: capitalizar(texto.texto) };
  if (!texto) return texto;
  if (/^📱/.test(texto) || /^Ip \d/.test(texto)) return texto;
  const i = texto.search(/[a-záéíóúñü]/i);
  if (i === -1) return texto;
  return texto.slice(0, i) + texto[i].toUpperCase() + texto.slice(i + 1);
}

/** El motivo de D5 (desde cero, 29/09/2026): todo lo que iba a contestar ya se lo había dicho. */
const TODO_REPETIDO = 'no sé cómo seguir: lo que iba a contestar ya se lo dije';

const soloLetras = (t) =>
  String(t || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '');

/**
 * Nunca repetir textual algo que ya se dijo en los últimos 15 mensajes: devuelve los que quedan.
 * Lo usan `decidirYFormatear` y, desde la fase 2 del cerebro Sonnet (02/10/2026), lo que contesta
 * Sonnet (cerebro.js `comoResultado`).
 */
function sinLoYaDicho(chatId, msgs) {
  const yaDicho = new Set(
    (state.obtener(chatId).historial || [])
      .filter((m) => m.quien === 'vendedor' && !m.sinConfirmar)
      .slice(-15)
      .map((m) => soloLetras(m.texto))
  );
  // Una foto o un documento no se filtran: nunca se filtraban (el marcador no
  // coincidía con nada del historial), y el PDF va una sola vez por su propia marca.
  // La lista de precios tampoco: si la vuelve a pedir, va de nuevo (28/09/2026). La respuesta
  // a un pedido de descuento tampoco (verificación de Claude, 30/09/2026): desde el 30/09 cada
  // pedido recibe "el precio es ese", sin escalar (decisión de Tomás), y son tres variantes.
  return msgs.filter(
    (m) =>
      acciones.esAccion(m) ||
      /^Ip \d/.test(acciones.comoTexto(m)) ||
      Boolean((acciones.marcasDe(m) || {}).descuentoPedidos) ||
      !yaDicho.has(soloLetras(acciones.comoTexto(m)))
  );
}

/** Envoltorio: todo lo que sale pasa por acá. */
async function decidirYFormatear(chatId, mensaje, pushName, llegada = {}) {
  const alSalir = {};
  const r = await decidir(chatId, mensaje, pushName, llegada, alSalir);
  // Cualquier mensaje entendido corta la cadena de "no se entiende", y cualquier
  // mensaje que no sea un acuse hace que el próximo acuse se conteste (ver noSeEntiende).
  if (!r.noEntendido && state.obtener(chatId).noEntendido) state.actualizar(chatId, { noEntendido: null });
  if (r.noEntendido !== 'acuse' && state.obtener(chatId).acuseContestado) state.actualizar(chatId, { acuseContestado: null });
  let msgs = (r.mensajes || []).map(capitalizar);

  const sinRepetir = sinLoYaDicho(chatId, msgs);
  // Todo lo que iba a salir ya se lo dije (desde cero, D5, decisión de Tomás del 29/09/2026):
  // no manda nada y escala callado. Hasta el 29/09 mandaba igual lo último, y así salían tres
  // veces seguidas "te interesaba solo ese modelo?" o "contame que estabas buscando". Siguen
  // como siempre las fotos, el PDF (va una vez, por su marca) y la lista de precios, que no
  // pasan por este filtro. Un acuse ("ok") no pedía nada: si lo que le iba a contestar ya se
  // dijo, no se manda nada y tampoco escala.
  let todoRepetido = false;
  if (sinRepetir.length) msgs = sinRepetir;
  else if (msgs.length) {
    msgs = [];
    todoRepetido = r.noEntendido !== 'acuse';
  }

  // Si el bloque de números se filtró por repetido, la frase que lo anunciaba
  // queda huérfana: "Te paso los numeros" y ningún número. Se va con él.
  const ANUNCIA_NUMEROS = /^(te paso los numeros|ahora te cotizo|mira como te queda|te armo los numeros|te paso la cotizacion|te hago los numeros)[.!]?$/i;
  const hayNumeros = msgs.some(
    (m) => !acciones.esAccion(m) && /📱|contado:/i.test(acciones.comoTexto(m))
  );
  if (!hayNumeros) {
    const sinAnuncio = msgs.filter(
      (m) => acciones.esAccion(m) || !ANUNCIA_NUMEROS.test(acciones.comoTexto(m))
    );
    if (sinAnuncio.length) msgs = sinAnuncio;
  }

  // El saludo del día (bloque 9): un solo lugar para todos los caminos, y solo si algo le
  // llega al cliente (escalar callado o un acuse repetido no llevan saludo). Va después de
  // sacar lo repetido: el saludo de ayer puede seguir en las 15 líneas y hoy se dice igual.
  const s = state.obtener(chatId);
  if (msgs.length && !hablaronHoy(s)) {
    msgs = conSaludo(msgs, primerNombre(s.nombre) || primerNombre(pushName), mensaje, Date.now());
  }

  // `sinVenta` cuenta solo si la respuesta le llegó (Pendientes 2): va en el PRIMER
  // mensaje, ya filtrada la respuesta, y lo confirma index.js cuando ese mensaje sale.
  // Si el bot no manda nada (un escalado callado, un acuse repetido) no hay quién lo
  // lleve: se anota acá, como siempre.
  if (alSalir.sinVenta) {
    if (msgs.length) msgs = [acciones.conMarcas(msgs[0], { sinVenta: alSalir.sinVenta }), ...msgs.slice(1)];
    else state.actualizar(chatId, { sinVenta: alSalir.sinVenta });
  }

  if (todoRepetido) {
    // Con el motivo original, si lo había (segunda vuelta, 30/09/2026): `pidió "18 Pro" y no está
    // cargado en la planilla · no sé cómo seguir…`. Solo "no sé cómo seguir" no decía qué pidió.
    const motivo = r.escalar && r.motivo ? `${r.motivo} · ${TODO_REPETIDO}` : TODO_REPETIDO;
    return { ...r, escalar: true, callar: true, motivo, mensajes: [], lectura: alSalir.lectura || null };
  }

  // El compromiso ya no se marca acá: la marca viaja con el PDF y la confirma
  // index.js cuando Evolution acusa ESE envío (ver conCompromiso).
  return { ...r, mensajes: msgs, lectura: alSalir.lectura || null };
}

module.exports = {
  decidir: decidirYFormatear,
  decidirCrudo: decidir,
  capitalizar,
  deformar,
  primerNombre,
  hablaronHoy,
  preguntaComoEstan,
  conSaludo,
  DATOS_FIJOS,
  preguntaPrecio,
  RANGO_MODELOS,
  cobraLaCuota,
  // Cerebro Sonnet (fase 1, 01/10/2026): la guardia limpia cada mensaje igual que lo que redacta
  // Gemini, y las herramientas leen la planilla y arman la lista como el bot.
  limpiarRedactado,
  leerPlanilla,
  listaDePrecios,
  // Bloque Ninjo 1b (05/10/2026): la lista partida en usados y sellados, para `[lista]`.
  listaDePreciosPartida,
  // La lista del local (08/10/2026): cerebro.js arma sus líneas con el mismo formato (sin el color ni el detalle).
  lineaDePrecio,
  // Fase 2 (02/10/2026): lo que contesta Sonnet en vivo pasa por el mismo filtro de repetidos, el
  // mismo PDF del compromiso y el mismo saludo del día (cerebro.js `comoResultado`).
  sinLoYaDicho,
  conCompromiso,
  TODO_REPETIDO,
  // Ninjo bloque 1 (05/10/2026): a un acuse que ya se contestó, o que sigue a la entrega inicial, un
  // "te cotizo" o la lista, Sonnet tampoco le contesta, con las mismas reglas (cerebro.js `contestar`).
  esAcuse,
  marcaSeguida,
  ultimaTandaEsperaAlCliente,
};
