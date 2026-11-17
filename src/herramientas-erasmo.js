'use strict';
/**
 * Las herramientas de datos de Erasmo (el cerebro de Somos Piedra, src/cerebro.js): `buscar_productos`,
 * `cotizar`, `mandar_catalogo` y `agendar_seguimiento`. Cada una es `{ definicion, correr(input, turno) }`
 * (el contrato de `HERRAMIENTAS_DE_DATOS`): `definicion` es lo que va a la API; `correr` devuelve un objeto que
 * vuelve a Sonnet como tool_result (con `error`, vuelve como is_error) y anota en `turno` lo que haga falta.
 *
 *  - Los MONTOS nunca los produce la IA: salen de acá. `cotizar` los devuelve ya escritos ("$132.000", con
 *    "sin factura" o "con factura") y anota en `turno.montos` los pesos enteros que la guardia deja escribir.
 *    Todo total sale de `cotizador-piedra.js` (o de `granza.js`): precio x cantidad -> + 21 % con factura ->
 *    para abajo a la centena. Plata en centavos adentro; `turno.montos` va en PESOS (lo que lee `montosEn`).
 *  - Los precios salen del panel (`precios-panel.js`); la granza, de su tabla (`granza.js`).
 *  - `mandar_catalogo` y `agendar_seguimiento` NO hacen nada en el acto: solo anotan en `turno.acciones` lo que
 *    se pidió. El envío del PDF y la anotación del seguimiento los hace index.js DESPUÉS de que salieron los
 *    mensajes (con el mismo ritmo y los mismos cortes: pausa, escalado, una persona, un mensaje nuevo), y si el
 *    turno termina en `escalar` se descartan. Así la sombra, `#sonnet` y `#comparar` no mandan ni agendan nada.
 *  - Lo que no se puede cotizar (producto que no está, FALTA DATO, más de 100 m², cheque, cuotas, dólares)
 *    vuelve como `error` y Sonnet escala.
 *  - Corrida del 17/11/2026 (Fran y Tomás): sin forma de pago sale SOLO el total en efectivo o transferencia (la tarjeta,
 *    si la pide el cliente: `forma_pago` tarjeta); no se ofrece factura (con `con_factura` se suma el 21 %); los medios son
 *    efectivo, transferencia y tarjeta; la granza también se pide en bolsones (cada uno son 20 bolsas); un color de granza
 *    sin stock (`#sinstock`) no se cotiza.
 */
const state = require('./state');
const documentos = require('./documentos');
const cotizador = require('./cotizador-piedra');
const granza = require('./granza');
const ficha = require('./ficha');
const { buscarProductos, pideLajaEnGeneral } = require('./catalogo-piedra');

/** Obra grande: arriba de esto lo ve una persona (reglas aprobadas, "Lo que siempre escalás"). */
const M2_MAXIMO = 100;
/** Hasta cuántos productos devuelve `buscar_productos`. */
const MAX_BUSQUEDA = 12;
const MAX_LISTA = 40;
/** El catálogo no se repite antes de estas horas, salvo que el cliente lo pida de nuevo. */
const CATALOGO_HORAS = 24;
/** El seguimiento se agenda hasta dentro de tantos días. */
const SEGUIMIENTO_MAX_DIAS = 180;

const objeto = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

// ---------------------------------------------------------------------------
// El catálogo: el panel (Supabase) + la granza (tabla propia)
// ---------------------------------------------------------------------------
let fuenteDelPanel = () => require('./precios-panel').obtenerCatalogo();

/** Para los tests: cambia de dónde salen los productos del panel. Sin argumento, vuelve al panel real. */
function usarCatalogoDelPanel(fn) {
  fuenteDelPanel = fn || (() => require('./precios-panel').obtenerCatalogo());
}

/** { productos, desactualizado }: los productos del panel y los 3 colores de granza. Nunca tira. */
async function catalogo() {
  let panel = { productos: [] };
  try {
    panel = (await fuenteDelPanel()) || panel;
  } catch (e) {
    console.error('[precios] no pude leer los precios:', (e && e.message) || e);
  }
  const propios = new Set(granza.productosDelCatalogo().map((p) => norm(p.nombre)));
  const productos = [...(panel.productos || []).filter((p) => !propios.has(norm(p.nombre))), ...granza.productosDelCatalogo()];
  return { productos, desactualizado: Boolean(panel.desactualizado) };
}

/**
 * Un booleano que puede venir como texto ("true", "si"): las herramientas no son `strict`, así que el modelo puede
 * mandar "true" en vez de true. Una factura que se pierde por eso sería un total sin IVA: se acepta las dos formas.
 */
const esVerdadero = (v) => v === true || /^(?:true|si|sí|1)$/i.test(String(v == null ? '' : v).trim());

const sinTildes = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '');
/** El nombre para comparar: sin tildes, en minúsculas y con los espacios normalizados. */
const norm = (s) => sinTildes(s).toLowerCase().replace(/\s+/g, ' ').trim();

/** Un color de granza que el local marcó sin stock (`#sinstock`, src/stock-colores.js). Se mira al momento de usarlo. */
const sinStock = (nombre) => require('./stock-colores').haySinStock(nombre);

const UNIDAD_TEXTO = { m2: 'm²', metro: 'metro', m3: 'm³', kg: 'kg', unidad: 'unidad', bolsa: 'bolsa', bolson: 'bolsón', caja: 'caja', malla: 'malla', litro: 'litro' };
const unidadTexto = (u) => UNIDAD_TEXTO[u] || String(u || '');
const PLURAL = { m2: 'm²', metro: 'metros', m3: 'm³', kg: 'kg', unidad: 'unidades', bolsa: 'bolsas', bolson: 'bolsones', caja: 'cajas', malla: 'mallas', litro: 'litros' };

/** "12.25" -> "12,25"; "12.00" -> "12"; "83" -> "83". */
function decimalComoTexto(t) {
  return String(t).replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '').replace('.', ',');
}

// ---------------------------------------------------------------------------
// buscar_productos
// ---------------------------------------------------------------------------
/** Lo que acompaña a la lista de piedras cuando el cliente dijo "laja" o "piedra" sin nombrar ninguna (Tomás, 11/11/2026). */
const AVISO_LAJA =
  '"Laja" es cualquier piedra: la gente le dice así a todas, y estas son las que se trabajan (la granza, la laca y las baldosas no ' +
  'son lajas). Todavía no hay un producto para cotizar: mandale el catálogo y preguntale cuál le gusta o qué color busca. Si nombró ' +
  'una que no está en esta lista, no la inventes: escalá.';

/** Lo que acompaña a un color de granza sin stock (`hay_stock` false). */
const AVISO_SIN_STOCK =
  'Los que dicen hay_stock false hoy NO hay: no los ofrezcas ni los menciones (ofrecé solo los que hay). Si el cliente pide ' +
  'uno de esos, decile que hoy no hay de ese color, ofrecele los otros y no lo cotices.';

const BUSCAR_PRODUCTOS = {
  definicion: {
    name: 'buscar_productos',
    description:
      'Busca en la lista de productos de Somos Piedra por nombre (por ejemplo "ocre", "adoquines ojito", "granza blanca"). ' +
      '"Laja" o "piedra" sin nombrar ninguna trae todas las piedras; con "laja ocre" buscá "ocre". ' +
      'Devuelve los nombres EXACTOS, cómo se vende cada uno (m², bolsa, caja, unidad…) y si tiene precio cargado. No devuelve ' +
      'precios: los montos salen solo de cotizar. Con la búsqueda vacía lista lo que se trabaja. Si no devuelve nada, ese ' +
      'producto no se trabaja o no está cargado: no inventes, escalá.',
    input_schema: objeto({ consulta: { type: 'string', description: 'Lo que busca el cliente, en pocas palabras. Vacío para ver lo que se trabaja.' } }, ['consulta']),
  },
  async correr(input) {
    const consulta = String((input && input.consulta) || '').trim();
    const cat = await catalogo();
    const porNombre = new Map(cat.productos.map((p) => [p.nombre, p]));
    const filas = consulta
      ? buscarProductos(cat, consulta, { max: MAX_BUSQUEDA + 1 })
      : cat.productos.slice(0, MAX_LISTA + 1).map((p) => ({ nombre: p.nombre, unidad: p.unidad || null, tienePrecio: Boolean(p.efectivoCentavos || p.listaCentavos) }));
    // "laja" (o "piedra") sin nombrar ninguna: son todas las piedras, así que va la lista entera.
    const enGeneral = Boolean(consulta) && pideLajaEnGeneral(cat, consulta);
    const tope = consulta && !enGeneral ? MAX_BUSQUEDA : MAX_LISTA;
    const productos = filas.slice(0, tope).map((f) => {
      const p = porNombre.get(f.nombre) || {};
      const esGranza = granza.esGranza(p);
      return {
        nombre: f.nombre,
        se_vende_por: esGranza ? 'm², en bolsas de unos 40 kg (1 bolsa rinde cerca de 1 m² a 3 cm); también en bolsones (1 bolsón = 20 bolsas)' : unidadTexto(f.unidad),
        ...(esGranza && sinStock(f.nombre) ? { hay_stock: false } : {}),
        ...(!esGranza && p.coberturaM2 ? { cada_unidad_cubre_m2: decimalComoTexto(p.coberturaM2) } : {}),
        tiene_precio: esGranza ? true : Boolean(f.tienePrecio),
      };
    });
    const r = { productos, hay_mas: filas.length > tope };
    if (!productos.length) r.aviso = 'No hay productos con ese nombre. No lo trabajamos o no está cargado: no inventes nada, si lo pide el cliente escalá.';
    else if (enGeneral) r.aviso = AVISO_LAJA;
    else if (productos.some((p) => p.hay_stock === false)) r.aviso = AVISO_SIN_STOCK;
    else if (productos.some((p) => !p.tiene_precio)) r.aviso = 'Los que dicen tiene_precio false no se pueden cotizar: si el cliente quiere uno de esos, escalá.';
    return r;
  },
};

// ---------------------------------------------------------------------------
// cotizar
// ---------------------------------------------------------------------------

/** Texto con hasta 2 decimales (coma o punto) -> centésimos (BigInt), redondeando para arriba. null si no sirve. */
function aCentesimos(v) {
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : '';
  const m = t.match(/^(\d+)(?:[.,](\d+))?$/);
  if (!m) return null;
  const frac = m[2] || '';
  let n = BigInt(m[1]) * 100n + BigInt((frac + '00').slice(0, 2));
  if (frac.length > 2 && /[1-9]/.test(frac.slice(2))) n += 1n;
  return n;
}

/** largo x ancho (en metros) -> m² como texto con 4 decimales, o null. La multiplicación la hace el código. */
function m2DeLargoYAncho(largo, ancho) {
  const l = aCentesimos(largo);
  const a = aCentesimos(ancho);
  if (l === null || a === null || l <= 0n || a <= 0n) return null;
  const producto = l * a; // diezmilésimos de m²
  return `${producto / 10000n}.${String(producto % 10000n).padStart(4, '0')}`;
}

const FORMAS_DE_PAGO = {
  efectivo: { medio: 'efectivo', columna: 'efectivo' },
  transferencia: { medio: 'transferencia', columna: 'efectivo' },
  tarjeta: { medio: 'tarjeta', columna: 'lista' },
};
const ETIQUETA = { efectivo: 'efectivo o transferencia', lista: 'tarjeta (un solo pago, sin cuotas)' };

const ERRORES = {
  bolsones_invalidos: 'Los bolsones tienen que ser un entero de 1 en adelante: si pidió medio bolsón o algo parecido, escalá.',
  falta_producto: 'Falta el producto.',
  falta_cantidad: 'Falta la cantidad: pedile los m² (o el largo y el ancho) y volvé a llamar.',
  cantidad_doble: 'Pasá una sola cantidad: m², largo y ancho, o cantidad.',
  cantidad_invalida: 'La cantidad no es válida: pedile que la escriba de nuevo.',
  cantidad_no_entera: 'Ese producto se vende por unidad entera: pedile una cantidad entera o los m².',
  medio_desconocido: 'Esa forma de pago no la cotizo: escalá.',
};

const pesosEnteros = (centavos) => Math.trunc(centavos / 100);

/** Lo que acompaña a una compra de más de $1.000.000 (Fran y Tomás, 17/11/2026): si pregunta por cuotas, escala. */
const AVISO_COMPRA_GRANDE =
  'Esta compra pasa $1.000.000: si el cliente pregunta por cuotas, financiación o pagar en partes, escalá con el motivo ' +
  '"pide pagar en partes, compra de $<el total de arriba>". El motivo es para el grupo: no le digas nada de eso al cliente.';

const COTIZAR = {
  definicion: {
    name: 'cotizar',
    description:
      'Calcula el total de un pedido. Es la ÚNICA fuente de montos: todo importe que le digas al cliente tiene que salir de acá, ' +
      'de esta misma respuesta. Pasá el nombre EXACTO del producto como lo devolvió buscar_productos y la cantidad: "m2" ' +
      '(o "largo" y "ancho" en metros, tal cual los dijo el cliente: no multipliques vos), "cantidad" (unidades, bolsas o cajas) ' +
      'o, solo en granza, "bolsones" (cada uno son 20 bolsas). Sin forma_pago devuelve solo el total en efectivo o transferencia: ' +
      'el de tarjeta solo si el cliente lo pregunta (forma_pago tarjeta). Nunca ofrezcas factura: con con_factura true (si el ' +
      'cliente la pidió) se suma el IVA, lo hace la herramienta. Tarjeta es un solo pago: cuotas, cheque y dólares los define ' +
      'una persona (escalá). No suma desperdicio salvo que el cliente lo pida. ' +
      'Si devuelve error, no digas ningún monto y escalá (salvo que el error diga qué corregir).',
    input_schema: objeto(
      {
        producto: { type: 'string', description: 'Nombre exacto del producto, como lo devolvió buscar_productos.' },
        m2: { type: 'string', description: 'Los m² que necesita cubrir, tal cual los dijo el cliente (por ejemplo "12,5").' },
        largo: { type: 'string', description: 'Largo en metros, tal cual lo dijo el cliente. Va junto con ancho.' },
        ancho: { type: 'string', description: 'Ancho en metros, tal cual lo dijo el cliente. Va junto con largo.' },
        cantidad: { type: 'number', description: 'Cantidad de unidades, bolsas o cajas, si el cliente la dio en eso y no en m².' },
        bolsones: { type: 'number', description: 'Solo para granza: cuántos bolsones pide (enteros; cada bolsón son 20 bolsas). Va solo, sin m² ni cantidad.' },
        forma_pago: { type: 'string', enum: Object.keys(FORMAS_DE_PAGO), description: 'Solo si el cliente dijo cómo paga o preguntó por la tarjeta.' },
        con_factura: { type: 'boolean', description: 'true solo si el cliente pidió factura. Si no la nombró, false: nunca la ofrezcas.' },
        desperdicio_pct: { type: 'number', description: 'Solo si el cliente pidió sumar desperdicio (por ejemplo 10). Si no, no lo pases.' },
      },
      ['producto']
    ),
  },
  async correr(input, turno) {
    const i = input || {};
    const falla = (error, extra = {}) => ({ error, ...extra });
    const cat = await catalogo();
    const nombre = String(i.producto || '').trim();
    if (!nombre) return falla(ERRORES.falta_producto);
    const producto = cat.productos.find((p) => norm(p.nombre) === norm(nombre));
    if (!producto) {
      const parecidos = buscarProductos(cat, nombre, { max: 5 }).map((p) => p.nombre);
      return falla('Ese nombre no está en la lista. Usá buscar_productos y pasá el nombre exacto; si no hay, no lo trabajamos: escalá.', parecidos.length ? { parecidos } : {});
    }
    // Un color de granza sin stock (`#sinstock`, 17/11/2026) no se cotiza: se le dice que hoy no hay y se ofrecen los otros.
    if (granza.esGranza(producto) && sinStock(producto.nombre)) {
      return falla('Hoy no hay de ese color de granza: no lo cotices. Decile que hoy no hay de ese color y ofrecele los otros (los que buscar_productos no marca con hay_stock false).');
    }

    // La cantidad: una sola forma.
    const hayM2 = i.m2 !== undefined && i.m2 !== null && String(i.m2).trim() !== '';
    const hayMedidas = (i.largo !== undefined && i.largo !== null && String(i.largo).trim() !== '') || (i.ancho !== undefined && i.ancho !== null && String(i.ancho).trim() !== '');
    const hayCantidad = i.cantidad !== undefined && i.cantidad !== null && i.cantidad !== '';
    const hayBolsones = i.bolsones !== undefined && i.bolsones !== null && i.bolsones !== '';
    if ([hayM2, hayMedidas, hayCantidad, hayBolsones].filter(Boolean).length > 1) return falla(ERRORES.cantidad_doble);
    if (hayBolsones && !granza.esGranza(producto)) return falla('Los bolsones son solo de la granza: en ese producto pasá m², largo y ancho o cantidad.');
    let m2 = null;
    if (hayM2) m2 = String(i.m2).trim();
    else if (hayMedidas) {
      m2 = m2DeLargoYAncho(i.largo, i.ancho);
      if (!m2) return falla('Largo y ancho: pasá los dos, en metros (por ejemplo "3,5" y "3,5").');
    } else if (!hayCantidad && !hayBolsones) return falla(ERRORES.falta_cantidad);
    if (m2 !== null) {
      const c = aCentesimos(m2);
      if (c === null || c <= 0n) return falla(ERRORES.cantidad_invalida);
      if (c > BigInt(M2_MAXIMO) * 100n) return falla(`Más de ${M2_MAXIMO} m²: es una obra grande y la ve una persona. Escalá.`);
    }

    // La forma de pago: solo las que se cotizan.
    let forma = null;
    if (i.forma_pago !== undefined && i.forma_pago !== null && i.forma_pago !== '') {
      forma = FORMAS_DE_PAGO[String(i.forma_pago)];
      if (!forma) return falla('Esa forma de pago no se cotiza (solo efectivo, transferencia o tarjeta). Cuotas, cheque y dólares los define una persona: escalá. Si pide pagar parte en efectivo y parte por transferencia, es lo mismo: cotizá con efectivo.');
    }
    const factura = esVerdadero(i.con_factura);
    let desperdicioPct = 0;
    if (i.desperdicio_pct !== undefined && i.desperdicio_pct !== null) {
      desperdicioPct = Number(i.desperdicio_pct);
      if (!Number.isFinite(desperdicioPct) || desperdicioPct < 0 || desperdicioPct > 20) return falla('El desperdicio tiene que estar entre 0 y 20 %.');
    }

    const pedido = { m2: m2 !== null ? m2 : undefined, cantidad: hayCantidad ? i.cantidad : undefined, bolsones: hayBolsones ? i.bolsones : undefined, config: { desperdicioPct }, medio: forma ? forma.medio : undefined, factura };
    const esGranza = granza.esGranza(producto);
    const { bolsones: _b, ...pedidoComun } = pedido;
    const r = esGranza ? granza.cotizarGranza({ producto, ...pedido }) : cotizador.cotizar({ producto, ...pedidoComun });
    if (r.error) return falla(ERRORES[r.error] || `No se pudo cotizar (${r.error}): escalá.`);
    if (!r.ok) return falla(`FALTA DATO (${(r.faltaDato || []).join(', ') || 'precio'}): no digas ningún monto y escalá.`, { faltaDato: r.faltaDato || [] });
    // Obra grande por lo que cubre (cajas, bolsas…): también la ve una persona.
    // (Solo una comparación con el tope, no plata: por eso puede usar un decimal común.)
    const cubre =
      r.m2Cubiertos !== undefined
        ? Number(r.m2Cubiertos)
        : r.unidad === 'm2'
          ? Number(r.cantidad)
          : esGranza
            ? Number(r.bolsas)
            : producto.coberturaM2
              ? Number(r.cantidad) * Number(producto.coberturaM2)
              : 0;
    if (cubre > M2_MAXIMO) return falla(`Más de ${M2_MAXIMO} m²: es una obra grande y la ve una persona. Escalá.`);

    // Qué columna se muestra: la de la forma de pago; sin forma de pago, solo efectivo o transferencia (Fran y Tomás,
    // 17/11/2026: la tarjeta se pasa solo si el cliente la pide, porque el posnet todavía no llegó).
    const columnas = [forma ? forma.columna : 'efectivo'];
    const totales = [];
    for (const col of columnas) {
      const c = col === 'lista' ? r.lista : r.efectivo;
      if (!c || !c.ok) return falla(`FALTA DATO (el precio ${col === 'lista' ? 'con tarjeta' : 'en efectivo'} de este producto no está cargado): no digas ningún monto y escalá.`, { faltaDato: c ? c.faltaDato : [] });
      totales.push({ col, centavos: factura ? c.conFactura.totalCentavos : c.totalCentavos });
    }

    // El precio de UNA unidad (m², bolsa, caja…), con la misma cuenta, por si el cliente pide "el precio del m²".
    let porUnidad = null;
    const unitario = esGranza
      ? cotizador.cotizar({ producto: granza.productoDelTramo(producto.nombre, granza.tramoPara(r.bolsas)), cantidad: 1, config: { desperdicioPct: 0 }, medio: pedido.medio, factura })
      : cotizador.cotizar({ producto, cantidad: 1, config: { desperdicioPct: 0 }, medio: pedido.medio, factura });
    if (unitario.ok && columnas.every((col) => (col === 'lista' ? unitario.lista : unitario.efectivo).ok)) {
      porUnidad = columnas.map((col) => {
        const c = col === 'lista' ? unitario.lista : unitario.efectivo;
        return { col, centavos: factura ? c.conFactura.totalCentavos : c.totalCentavos };
      });
    }

    // Lo que la guardia deja escribir: pesos enteros (los totales son múltiplos de $100).
    for (const t of totales) turno.montos.push(pesosEnteros(t.centavos));
    for (const t of porUnidad || []) turno.montos.push(pesosEnteros(t.centavos));
    // Para la ficha del chat.
    // Lo que se cotizó, para la ficha: el total más alto de los que salieron (en centavos) sirve para ver si la compra pasa
    // el millón (ficha.pasaElUmbralDePagarEnPartes).
    const totalCentavos = Math.max(...totales.map((t) => t.centavos));
    turno.cotizo = {
      producto: producto.nombre,
      cantidad: r.bolsones !== undefined ? String(r.bolsones) : decimalComoTexto(r.cantidad),
      unidad: r.bolsones !== undefined ? (r.bolsones === 1 ? 'bolsón' : 'bolsones') : unidadTexto(r.unidad),
      pago: forma ? i.forma_pago : 'efectivo',
      factura,
      totalCentavos,
    };

    const etiqueta = ETIQUETA;
    const cantidadTexto = esGranza
      ? r.bolsones !== undefined
        ? `${r.bolsones} ${r.bolsones === 1 ? 'bolsón' : 'bolsones'} (${r.bolsas} bolsas de 40 kg)`
        : `${r.bolsas} bolsas (1 bolsa rinde cerca de 1 m² a 3 cm)`
      : `${decimalComoTexto(r.cantidad)} ${r.unidad === 'm2' ? 'm²' : r.cantidad === '1' ? unidadTexto(r.unidad) : PLURAL[r.unidad] || r.unidad}`;
    const out = {
      ok: true,
      producto: producto.nombre,
      cantidad: cantidadTexto,
      ...(r.m2Cubiertos !== undefined && !esGranza ? { m2_que_cubre: `${decimalComoTexto(r.m2Cubiertos)} m²` } : {}),
      factura: factura ? 'CON factura (IVA 21 % incluido en los totales)' : 'no pidió factura: no la menciones ni la ofrezcas',
      ...(ficha.pasaElUmbralDePagarEnPartes(totalCentavos) ? { compra_grande: AVISO_COMPRA_GRANDE } : {}),
      totales: totales.map((t) => ({ forma_de_pago: etiqueta[t.col], total: cotizador.formatearPesos(t.centavos) })),
      ...(porUnidad
        ? {
            precio_de_una_unidad: {
              unidad: esGranza ? 'bolsa (1 bolsa = 1 m²)' : unidadTexto(r.unidad),
              por_forma_de_pago: porUnidad.map((t) => ({ forma_de_pago: etiqueta[t.col], precio: cotizador.formatearPesos(t.centavos) })),
            },
          }
        : {}),
      aviso:
        (factura ? 'Decí cuánto es y que es con factura. ' : 'Decí cuánto es; no escribas "sin factura" ni ofrezcas factura ni menciones el IVA. ') +
        (forma ? '' : 'Es el total en efectivo o transferencia: no menciones la tarjeta salvo que el cliente la pregunte. ') +
        'El precio de una unidad solo si el cliente lo pidió. No sumes ni restes nada vos.',
    };
    if (cat.desactualizado) out.aviso += ' (Los precios son de la última copia guardada: no cambia lo que le decís.)';
    return out;
  },
};

// ---------------------------------------------------------------------------
// mandar_catalogo
// ---------------------------------------------------------------------------
const MANDAR_CATALOGO = {
  definicion: {
    name: 'mandar_catalogo',
    description:
      'Manda el catálogo en PDF de Somos Piedra al cliente, junto con tus mensajes (sale después de ellos). Usala cuando el cliente ' +
      'quiere ver las piedras o está eligiendo. Se manda una vez cada 24 horas por chat: si ya se lo mandaste, vuelve ok false y no ' +
      'lo repetís, salvo que el cliente lo pida de nuevo (en ese caso pasá pidio_de_nuevo true). Si la llamás, en tus mensajes podés ' +
      'decir que le mandás el catálogo; no prometas ningún otro archivo.',
    input_schema: objeto({ pidio_de_nuevo: { type: 'boolean', description: 'true solo si el cliente pidió el catálogo otra vez.' } }),
  },
  async correr(input, turno) {
    if (turno.acciones.catalogo) return { ok: true, aviso: 'Ya está pedido en esta respuesta.' };
    if (!documentos.ruta('catalogo')) return { error: 'El catálogo no está disponible: escalá.' };
    const s = (turno.chatId && state.todos()[turno.chatId]) || {};
    const horas = s.catalogoEnviado ? (turno.ahora - Number(s.catalogoEnviado)) / 3600000 : Infinity;
    const denuevo = esVerdadero(input && input.pidio_de_nuevo);
    if (horas < CATALOGO_HORAS && !denuevo) {
      return { ok: false, ya_enviado: true, aviso: 'Ya se lo mandaste hace poco: no lo repitas ni digas que se lo mandás. Si el cliente lo pide de nuevo, llamala con pidio_de_nuevo true.' };
    }
    turno.acciones.catalogo = true;
    return { ok: true, aviso: 'Va con tus mensajes, después de ellos. Podés decirle que le mandás el catálogo para que lo vea.' };
  },
};

// ---------------------------------------------------------------------------
// agendar_seguimiento
// ---------------------------------------------------------------------------
const DIA_ARGENTINA = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Argentina/Buenos_Aires', year: 'numeric', month: '2-digit', day: '2-digit' });
/** 'AAAA-MM-DD' de hoy en Argentina. */
const hoyArgentina = (ts) => DIA_ARGENTINA.format(ts);
const DIA_MS = 24 * 60 * 60 * 1000;
const diasEntre = (desde, hasta) => Math.round((Date.parse(`${hasta}T12:00:00Z`) - Date.parse(`${desde}T12:00:00Z`)) / DIA_MS);

const AGENDAR_SEGUIMIENTO = {
  definicion: {
    name: 'agendar_seguimiento',
    description:
      'Anota para el equipo "volver a contactar a este cliente el día X", según lo que dijo el cliente (por ejemplo "en 15 días arranco ' +
      'la obra", "lo vemos después del 20"). Ese día a las 9 el grupo interno recibe un aviso con quién es, qué pidió y por qué volver. ' +
      'No le escribe al cliente. Usala solo si el cliente dio una fecha o un plazo; no inventes una. NUNCA le digas al cliente que ' +
      'le vas a escribir ni que alguien lo va a llamar. La fecha es AAAA-MM-DD y tiene que ser posterior a hoy.',
    input_schema: objeto(
      {
        fecha: { type: 'string', description: 'El día de volver a contactar, AAAA-MM-DD (hora de Neuquén), posterior a hoy.' },
        motivo: { type: 'string', description: 'Por qué volver, en una frase corta para el equipo ("dice que arranca la obra en 15 días").' },
      },
      ['fecha', 'motivo']
    ),
  },
  async correr(input, turno) {
    const fecha = String((input && input.fecha) || '').trim();
    const motivo = String((input && input.motivo) || '').replace(/\s+/g, ' ').trim().slice(0, 200);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(fecha) || Number.isNaN(Date.parse(`${fecha}T12:00:00Z`)) || new Date(`${fecha}T12:00:00Z`).toISOString().slice(0, 10) !== fecha) {
      return { error: 'La fecha tiene que ser AAAA-MM-DD, un día que exista.' };
    }
    const hoy = hoyArgentina(turno.ahora);
    const dias = diasEntre(hoy, fecha);
    if (dias < 1) return { error: `Hoy es ${hoy}: la fecha tiene que ser posterior.` };
    if (dias > SEGUIMIENTO_MAX_DIAS) return { error: `Es demasiado lejos (más de ${SEGUIMIENTO_MAX_DIAS} días): si el cliente dio una fecha tan lejana, escalá.` };
    if (!motivo) return { error: 'Falta el motivo.' };
    turno.acciones.seguimiento = { fecha, motivo };
    return { ok: true, aviso: 'Anotado para el equipo. No le digas nada al cliente de esto: no le prometas que le escribís ni que lo llaman.' };
  },
};

/** Las herramientas de datos, en el orden en que van a la API. */
const HERRAMIENTAS = [BUSCAR_PRODUCTOS, COTIZAR, MANDAR_CATALOGO, AGENDAR_SEGUIMIENTO];

module.exports = {
  HERRAMIENTAS,
  usarCatalogoDelPanel,
  catalogo,
  m2DeLargoYAncho,
  hoyArgentina,
  M2_MAXIMO,
  CATALOGO_HORAS,
  SEGUIMIENTO_MAX_DIAS,
};
