'use strict';
/**
 * Cotizador — toda la aritmética de precios.
 *
 * Regla base (definida en la planilla "Cotizador - Somos iPhone NQN"):
 *   Contado   = Costo_proveedor + Margen           (ya viene calculado en LISTA)
 *   Saldo     = Base - Entrega
 *   1 pago    = Saldo * Coef_1_cuota               (1,54: +54%)  + EXTRA_POR_PAGO
 *   2 cuotas  = Saldo * Coef_2_cuotas / 2          (1,70: +70%)  + EXTRA_POR_PAGO cada una
 *   Los coeficientes salen de CONFIG. Son los del plan Estándar de la calculadora Cuotas
 *   (negocio/financiacion.md del Cortex): 1,54 y 1,70 desde el 02/10/2026; 1,52 y 1,60 desde
 *   el 30/09; hasta ahí, 1,26 y 1,35.
 *   Todo se redondea PARA ARRIBA al múltiplo de CONFIG.Redondeo (1000), y recién
 *   después se suma EXTRA_POR_PAGO ($10.000 por cada pago financiado; Ajustes 2,
 *   decisión de Tomás del 17/09/2026). Vale con y sin recargo. Los precios manuales
 *   van tal cual, y el contado y el descuento no cambian.
 *
 * DOS PRECIOS POR MODELO:
 *   Precio_contado    — lo que paga el cliente en efectivo. Es el que se le dice.
 *   Precio_cotizacion — la base con la que se calculan las cuotas. Suele estar
 *                       unos miles por encima del contado, para redondear el
 *                       total financiado donde el negocio lo quiere.
 *
 * Si Precio_cotizacion está vacío o en cero, se usa el contado y el resultado
 * es idéntico al de siempre. Financiar cuesta más que pagar al contado: el
 * cliente ve el contado real y ve las cuotas reales, nada se disfraza.
 *
 * Los precios manuales (Pago_unico_manual / Cuota_2_manual) pisan el cálculo
 * SOLO cuando la entrega es exactamente el anticipo mínimo del modelo.
 *
 * BAJO EL MÍNIMO (bloque 5, decisión de Tomás del 16/09/2026): si le faltan hasta
 * TOPE_BAJO_MINIMO para el anticipo mínimo, se cotiza igual, con los coeficientes de la
 * excepción y nunca con los precios manuales. Desde el 02/10/2026 (decisión de Tomás: el Estándar
 * sube a 1,54 / 1,70 y la excepción se queda en 67/75) son `config.coef1Bajo` / `config.coef2Bajo`,
 * que sheets.js siempre trae (Coef_1_bajo_minimo / Coef_2_bajo_minimo de CONFIG, o 1,67 / 1,75).
 * Un config que no los trae (los tests, el fixture) usa los de CONFIG + RECARGO_BAJO_MINIMO, como
 * hasta el 01/10. Al cliente no
 * le llega nada distinto: ni que no alcanza, ni el recargo, ni la diferencia. Si
 * falta más, ENTREGA_BAJA como siempre. Desde el bloque 5b el tope es $45.000 y
 * responder.js insiste dos veces con la entrega inicial antes de usar el recargo:
 * acá se calcula, allá se decide cuándo.
 *
 * DESCUENTO: no hay (decisión de Tomás del 30/09/2026). Hasta ahí, el segundo pedido de
 * descuento se llevaba el equipo de contado a Precio_contado − $10.000 (bloque 5).
 * `descuentoPara` y `conDescuento` quedan para los que los llaman, sin hacer nada: una
 * marca vieja del chat (`descuentoDe`) no cambia ningún precio.
 */

const estilo = require('./estilo');

/** Hasta cuánto puede faltarle para el mínimo y cotizarse igual, con recargo (bloque 5b: $45.000). */
const TOPE_BAJO_MINIMO = 45000;
/** Bajo el mínimo, con un config sin coef1Bajo/coef2Bajo: lo que se suma a cada coeficiente de CONFIG. */
const RECARGO_BAJO_MINIMO = 0.15;
/** Los de la excepción en producción (sheets.js, si CONFIG no los trae): 67/75, fijos desde el 02/10/2026. */
const COEF_BAJO_MINIMO = Object.freeze({ coef1: 1.67, coef2: 1.75 });
/** Lo que se suma a cada pago financiado calculado con coeficientes, después del redondeo (Ajustes 2). */
const EXTRA_POR_PAGO = 10000;

function redondearArriba(valor, multiplo) {
  if (!multiplo || multiplo <= 0) return Math.round(valor);
  return Math.ceil(valor / multiplo) * multiplo;
}

function pesos(n) {
  return '$' + Math.round(n).toLocaleString('es-AR');
}

/** ¿Es un equipo sellado? `Condicion` sin espacios de más ni mayúsculas ("sellado " es "Sellado"). */
function esSellado(fila) {
  return /^sellad[oa]s?$/.test(String((fila && fila.condicion) || '').trim().toLowerCase());
}

/**
 * Lo que va donde iría la batería (01/10/2026, decisiones de Tomás): "sellado" en una fila
 * sellada; si no, la batería de la columna `Bateria_min` tal cual (`bateria_texto`: "85-93%",
 * "100%"), o '' si no hay. Es solo para mostrar: para una cuenta sigue `bateria_min`, el número.
 * La usan todos los que dicen la batería de una fila: la plantilla, el detalle de una unidad, la
 * lista, "sí lo tenemos" y las demás líneas de responder.js.
 */
function bateriaDe(fila) {
  if (!fila) return '';
  if (esSellado(fila)) return 'sellado';
  const texto = String(fila.bateria_texto || '').trim();
  if (texto) return `${texto}%`;
  return fila.bateria_min ? `${fila.bateria_min}%` : '';
}

/**
 * @param {object} fila     fila de LISTA o USADOS ya normalizada
 * @param {number} entrega  lo que el cliente dice que tiene
 * @param {object} config   { coef1, coef2, redondeo }
 */
function cotizar(fila, entrega, config) {
  const contado = fila.precio_contado;
  const minimo = fila.anticipo_min;

  if (!contado || contado <= 0) {
    return { ok: false, motivo: 'SIN_PRECIO' };
  }
  // Una unidad del local sin entrega mínima (el stock de la app en vivo, 08/10/2026: no hay una en
  // LISTA para ese modelo y capacidad) se vende solo de contado: con la plata entera va `soloContado`
  // como siempre; con menos, no se financia (responder.js escala callado; Sonnet recibe el error).
  // Solo las filas marcadas por sheets.js: una fila común con el mínimo en 0 sigue como antes.
  if (fila.solo_contado === true && entrega < contado) {
    return { ok: false, motivo: 'SOLO_CONTADO', contado };
  }
  if (entrega < minimo && minimo - entrega > TOPE_BAJO_MINIMO) {
    return { ok: false, motivo: 'ENTREGA_BAJA', minimo, contado };
  }
  // Le falta poco: se cotiza con recargo (ver arriba). El contado es siempre mayor
  // que el mínimo, así que acá nunca alcanza para pagarlo entero.
  const bajoMinimo = entrega < minimo;
  if (entrega >= contado) {
    return { ok: true, soloContado: true, contado, entrega, bajoMinimo: false };
  }

  // La base de las cuotas puede ser mayor que el contado. El contado que se le
  // muestra al cliente NUNCA cambia: es el de la columna Precio_contado.
  const base = fila.precio_cotizacion > 0 ? fila.precio_cotizacion : contado;
  const saldo = Math.max(0, base - entrega);
  const esMinimoExacto = entrega === minimo;

  let pagoUnico;
  let cuotaDe2;
  let usoManual = false;

  if (esMinimoExacto && fila.pago_unico_manual > 0 && fila.cuota_2_manual > 0) {
    pagoUnico = fila.pago_unico_manual;
    cuotaDe2 = fila.cuota_2_manual;
    usoManual = true;
  } else {
    const coef1 = bajoMinimo ? config.coef1Bajo ?? config.coef1 + RECARGO_BAJO_MINIMO : config.coef1;
    const coef2 = bajoMinimo ? config.coef2Bajo ?? config.coef2 + RECARGO_BAJO_MINIMO : config.coef2;
    // +$10.000 por cada pago, después del redondeo (Ajustes 2). Son por cuota, no
    // repartidos entre las dos.
    pagoUnico = redondearArriba(saldo * coef1, config.redondeo) + EXTRA_POR_PAGO;
    cuotaDe2 = redondearArriba((saldo * coef2) / 2, config.redondeo) + EXTRA_POR_PAGO;
  }

  // Cuánto se ahorra respecto de entregar solamente el mínimo. La cuota del mínimo
  // lleva el mismo extra cuando no es manual, así la comparación es pareja.
  const saldoMinimo = Math.max(0, base - minimo);
  const cuotaSiMinimo =
    fila.cuota_2_manual > 0
      ? fila.cuota_2_manual
      : redondearArriba((saldoMinimo * config.coef2) / 2, config.redondeo) + EXTRA_POR_PAGO;
  const totalSiMinimo = minimo + cuotaSiMinimo * 2;
  const totalAhora = entrega + cuotaDe2 * 2;
  const ahorro = Math.max(0, totalSiMinimo - totalAhora);

  return {
    ok: true,
    soloContado: false,
    contado,
    base,
    entrega,
    saldo,
    minimo,
    pagoUnico,
    cuotaDe2,
    totalCon1: entrega + pagoUnico,
    totalCon2: totalAhora,
    ahorro,
    usoManual,
    // Para el log y las pruebas: al cliente no le llega nada distinto.
    bajoMinimo,
  };
}

/**
 * Sin descuento desde el 30/09/2026: ningún contado se rebaja, ni con una marca vieja del chat
 * (`descuentoDe`, de cuando el segundo pedido se llevaba el contado − $10.000). Devuelve null.
 */
function descuentoPara() {
  return null;
}

/** Sin descuento desde el 30/09/2026: la cotización tal cual sale de la planilla. */
function conDescuento(cot) {
  return cot;
}

/**
 * La entrega alcanza para pagarlo entero: sin cuotas y con el precio, que es lo
 * que tiene que pagar. Una variante de estilo.js. Como renglón propio va con
 * mayúscula (la plantilla lleva su formato y `capitalizar` no la toca); pegada a
 * un detalle de plantillaVarias, en minúscula.
 */
function pagaDeContado(fila, cot, { mayuscula = true } = {}) {
  const texto = estilo.frase('pagaDeContado', fila.modelo, `*${pesos(cot.contado)}*`);
  return mayuscula ? texto.charAt(0).toUpperCase() + texto.slice(1) : texto;
}

/**
 * La única plantilla de cotización que usa el bot.
 *
 * NO muestra el precio de contado (Ajustes 1, decisión de Tomás del 16/09/2026):
 * el equipo, la entrega y los dos pagos. El precio se dice solo si el cliente lo
 * pregunta, y lo agrega responder.js en el mensaje de "te lo llevas". `cot.contado`
 * sigue en el objeto: es la base de todo, solo deja de mostrarse. Si la entrega
 * alcanza para pagarlo entero, sí va el precio, sin cuotas.
 */
function plantilla(fila, cot) {
  const b = bateriaDe(fila);
  const bat = !b ? '' : esSellado(fila) ? ` — ${b}` : ` — batería ${b}`;
  const cap = fila.capacidad_gb ? ` ${fila.capacidad_gb}GB` : '';
  const cabecera = `📱 *${fila.modelo}${cap}${bat}*`;

  if (cot.soloContado) {
    return `${cabecera}\n${pagaDeContado(fila, cot)}`;
  }

  return (
    `${cabecera}\n` +
    `Con una entrega de *${pesos(cot.entrega)}*:\n` +
    `• *1 pago de ${pesos(cot.pagoUnico)}*\n` +
    `• *2 pagos de ${pesos(cot.cuotaDe2)} cada uno*`
  );
}

/**
 * Lo que distingue a una unidad puntual de la fila de catálogo: capacidad,
 * batería, color y lo que haya cargado en Detalles. Todo junto y en minúscula,
 * para que entre delante del precio.
 */
function detalleDe(fila) {
  const partes = [];
  if (fila.capacidad_gb) partes.push(`${fila.capacidad_gb}gb`);
  const b = bateriaDe(fila);
  if (b) partes.push(esSellado(fila) ? b : `bateria ${b}`);
  if (fila.color) partes.push(String(fila.color).toLowerCase());
  if (fila.detalles) partes.push(String(fila.detalles).toLowerCase());
  return partes.join(', ');
}

/**
 * Varias opciones del MISMO modelo en UN SOLO mensaje: la unidad puntual de
 * liquidación y la fila de catálogo, una debajo de la otra y de más barata a
 * más cara. El detalle de cada una va ANTES del precio, como las manda Fran.
 *
 * Va todo en un mensaje a propósito: el tope de mensajes por tanda no se toca.
 * Con una sola opción devuelve la plantilla de siempre, sin cambiar nada.
 */
function plantillaVarias(opciones, totalUnidades) {
  const vivas = (opciones || []).filter((o) => o.cot && o.cot.ok);
  if (vivas.length <= 1) {
    const una = vivas[0] || opciones[0];
    return plantilla(una.fila, una.cot);
  }

  // Cada bloque: el detalle y los pagos, sin el contado (Ajustes 1). El que se
  // paga entero con la entrega lleva su precio, como en la plantilla de uno.
  const bloques = vivas.map((o, i) => {
    const det = detalleDe(o.fila);
    const cabeza = `*${i + 1})*${det ? ' ' + det : ''}`;
    if (o.cot.soloContado) return `${cabeza} - ${pagaDeContado(o.fila, o.cot, { mayuscula: false })}`;
    return (
      `${cabeza}:\n` +
      `• *1 pago de ${pesos(o.cot.pagoUnico)}*\n` +
      `• *2 pagos de ${pesos(o.cot.cuotaDe2)} cada uno*`
    );
  });

  // El número del encabezado es el de unidades REALES del modelo, no el de
  // bloques mostrados. Difieren cuando alguna unidad no llega al anticipo
  // mínimo con la entrega que declaró el cliente: ahí se dice cuántas hay y
  // cuántas se le muestran. Decir "tengo 2" teniendo 3 sería mentirle.
  const total = Number.isFinite(totalUnidades)
    ? Math.max(totalUnidades, vivas.length)
    : vivas.length;
  const entrega = pesos(vivas[0].cot.entrega);
  const cabecera =
    total === vivas.length
      ? `Tengo ${total}, con una entrega de *${entrega}*:`
      : `Tengo ${total}; con una entrega de *${entrega}* te entran estas ${vivas.length}:`;

  return `📱 *${vivas[0].fila.modelo}*\n` + cabecera + '\n\n' + bloques.join('\n\n');
}

/**
 * El bloque de la cotización de Sonnet (bloque Ninjo 1b, decisión de Tomás del 05/10/2026: en …7024
 * un cliente sumó "1 pago de $X, o 2 pagos de $Y" como si fueran las dos cosas). cerebro.js lo pone
 * donde Sonnet escribió `[cotizacion]`:
 *
 *   iPhone 14 128GB 85-93% 📱
 *   Haciendo una entrega de $385.000 te quedarían:
 *   · 1 cuota de $X
 *   · o 2 cuotas de $Y cada una
 *   Este mes abonás solo la entrega. Las cuotas arrancan el mes que viene
 *
 * El encabezado lleva el modelo, la capacidad y la batería como vienen de la planilla ("sellado" si
 * es sellado). Los montos son los de `cotizar`, sin cambiar el cálculo. No es `plantilla`, que sigue
 * siendo la del bot de siempre.
 */
function bloqueSonnet(fila, cot) {
  const cabecera = [fila.modelo, fila.capacidad_gb ? `${fila.capacidad_gb}GB` : '', bateriaDe(fila)].filter(Boolean).join(' ');
  return [
    `${cabecera} 📱`,
    `Haciendo una entrega de ${pesos(cot.entrega)} te quedarían:`,
    `· 1 cuota de ${pesos(cot.pagoUnico)}`,
    `· o 2 cuotas de ${pesos(cot.cuotaDe2)} cada una`,
    'Este mes abonás solo la entrega. Las cuotas arrancan el mes que viene',
  ].join('\n');
}

/**
 * Cuando la entrega no llega al mínimo: buscar el modelo más caro
 * cuyo anticipo mínimo sí entre en lo que el cliente tiene. Con el mínimo
 * estricto, sin el recargo de bajo mínimo: el modelo lo elige el bot (bloque 5).
 */
function alternativaMasBarata(filas, entrega, modeloDescartado) {
  const candidatas = filas
    .filter((f) => f.cotizable && f.anticipo_min > 0 && f.anticipo_min <= entrega)
    .filter((f) => f.modelo !== modeloDescartado)
    .sort((a, b) => b.precio_contado - a.precio_contado);
  return candidatas[0] || null;
}

module.exports = { cotizar, plantilla, plantillaVarias, bloqueSonnet, detalleDe, bateriaDe, esSellado, alternativaMasBarata,
  mejorQueEntraEnLaEntrega: alternativaMasBarata, redondearArriba, pesos,
  descuentoPara, conDescuento,
  TOPE_BAJO_MINIMO, RECARGO_BAJO_MINIMO, COEF_BAJO_MINIMO, EXTRA_POR_PAGO };
