'use strict';
/**
 * Cerebro Sonnet (decisión de Tomás del 01/10/2026): Claude Sonnet 5.5 decide qué contestar, en
 * lugar de las reglas de responder.js. Los errores en vivo de esos días (…8142, …3910, …7038,
 * Emanuel, Oriana …4038) eran todos el mismo: las reglas no leen la conversación.
 *
 * FASE 1, EN SOMBRA. Con cada tanda real, `pensar` arma el pedido (las instrucciones de
 * `cerebro-reglas.md`, el historial, lo que sabe el estado), deja que Sonnet use las herramientas
 * y revisa lo que contestaría (`revisarSalida`). index.js lo anota como `propuesta-sonnet` en el
 * registro de aprendizaje y NO MANDA NADA: el cliente y el grupo reciben lo mismo que sin sombra.
 *
 * FASE 2, EN VIVO (decisiones de Tomás del 02/10/2026). Con `CEREBRO_MODO` en `tester`, `nuevos` o
 * `todos`, Sonnet contesta de verdad a los chats que le tocan (`quienAtiende`): index.js llama a
 * `contestar` EN LUGAR de `decidir`, y lo que devuelve se convierte al `resultado` de siempre
 * (`comoResultado`: el saludo del día, el filtro de repetidos, el PDF del compromiso una sola vez y
 * lo que queda en el estado). Los demás chats siguen con el bot de siempre y Sonnet en sombra. Un
 * error de la API hace contestar al bot de siempre, con un aviso por racha (`alFallar`). Cada
 * respuesta avisa al grupo cuántos mensajes leyó (`avisoRespuesta`; con `todos`, un resumen por
 * hora: `resumenesDeLaHora`).
 *
 * Lo que no cambia, ni acá ni en la fase 2:
 *   - Los precios salen de la planilla y los calcula cotizador.js. Sonnet los pide a una
 *     herramienta y la guardia verifica cada monto que escribe contra lo que devolvieron las
 *     herramientas en ESE turno.
 *   - Nunca cuánto le falta para la entrega mínima, nunca la promesa de que otra persona lo va a
 *     contactar. Si no sabe cómo seguir: escalar (silencio al cliente, aviso al grupo).
 *   - Tope de 4 mensajes por tanda (desde el bloque Ninjo 1, lo que pasa del cuarto va junto en el
 *     cuarto).
 *
 * Bloque Ninjo 1 (05/10/2026, de comparar el bot con el manual de Ninjo): la entrega la lee el código
 * (`entrega_texto`), la guardia frena lo interno y la promesa de un archivo que no va, lo que delata a
 * una IA se limpia, y a un acuse que ya se contestó (o que sigue a la entrega inicial, un "te cotizo"
 * o la lista) no se le pregunta a Sonnet: no sale nada y no escala.
 *
 * Bloque Ninjo 1b (05/10/2026, decisiones de Tomás): el historial se completa con Evolution antes de
 * pensar (contexto.js, lo llama index.js) y `leidos.evolution` dice cuántas líneas vinieron de ahí; la
 * cotización la escribe el código en un bloque (`[cotizacion]`, cotizador.bloqueSonnet) y el PDF del
 * compromiso sale con el primer bloque (ya no lo decide Sonnet); la lista completa va en dos mensajes
 * (`[lista]`); `buscar_equipos` suma la lista al 100% (`al_100`) y los `parecidos` de un modelo que no
 * hay (con `aviso_grupo` en `responder`, sin callar el chat); `que_me_alcanza` recomienda por monto.
 *
 * Entrega baja, paso 3 (06/10/2026, decisión de Tomás): a la tercera vez que la entrega no llega,
 * `cotizar` resuelve con el conteo del estado (`insistenciaEntrega`), como el bot de siempre: si le
 * faltan hasta $45.000, cotiza con la excepción (`excepcion: true`, el bloque); si falta más, devuelve
 * lo que sí se lleva con esa entrega (`con_esa_entrega`), y si no retira nada, lo que paga de contado con
 * esa plata (`de_contado`, desde el 06/10/2026). Sonnet nunca dice el recargo ni cuánto falta.
 *
 * El parecido con la entrega (decisión de Tomás del 08/10/2026, el caso del tester del 07/10): si el modelo que
 * pidió no está y ya dijo con cuánto cuenta, Sonnet cotiza el primero de `parecidos` con esa entrega (las reglas,
 * *Modelos*). Es solo de reglas: `cotizar` nunca miró qué modelo nombró el cliente, y sus montos valen igual.
 *
 * Otro modelo con la entrega ya dicha (decisión de Tomás del 08/10/2026, el hermano del parecido): si ya dijo con
 * cuánto cuenta (`loQueSabe` la pasa como "con cuánto dijo que cuenta para la entrega") y pregunta por otro modelo que
 * sí está ("y el 14?"), Sonnet lo cotiza con esa entrega (las reglas, *Stock y precio*). También es solo de reglas: la
 * insistencia cuenta para ese modelo y el PDF sigue saliendo una sola vez por chat (`compromisoEnviado`).
 *
 * Las fotos del cliente (decisión de Tomás del 06/10/2026, …7442): en una tanda que contesta en vivo,
 * Sonnet ve las fotos que mandó el cliente con lo de ahora (hasta 3, `imagenes` de `contestar`/`pensar`;
 * las baja index.js con fotos-del-cliente.js). Lo que se ve en la foto cuenta como dato dado (las reglas,
 * *Canje*). La sombra, la sombra con persona y #sonnet no mandan imágenes.
 *
 * El stock de la app (08/10/2026, decisiones de Tomás; src/stock-app.js), solo con STOCK_APP_MODO=vivo:
 * `buscar_equipos` dice de cada equipo si está en el local (`donde: local`, una unidad de USADOS) o en el
 * depósito (`donde: deposito`, una fila de LISTA con STOCK distinto de NO), los del local primero; cuando
 * hay uno del depósito devuelve `frase_deposito` y Sonnet la pone con `[deposito]`, que el código cambia
 * por la frase con el día (de lunes a jueves "mañana"; viernes, sábado y domingo "el lunes"); la guardia
 * frena "depósito" escrito por su cuenta, TechSur, el proveedor y "por encargo"; una unidad sin entrega
 * mínima es `solo_contado`; y al escalar, el 🔕 lleva el código del equipo del local o "DEPÓSITO <modelo
 * capacidad>" (`equipoParaElGrupo`). Las reglas del depósito van en `cerebro-reglas-deposito.md`, que se
 * suma a las instrucciones solo en vivo: con apagado o sombra el pedido es idéntico al de siempre.
 *
 * La lista del local y lo que cita el cliente (decisiones de Tomás del 08/10/2026, 20:30, chat …3557: respondió a
 * "iPhone 13 100%" del catálogo con "Hola a qe precio están" y Sonnet mandó la LISTA entera). Primero se liquida
 * nuestro stock: en vivo, `lista_de_precios` (y `[lista]`) son los equipos del local sin repetir (`listaDelLocal`);
 * sin nada en el local, la lista de siempre; con apagado o sombra, como siempre. La línea del cliente que responde a
 * otro mensaje llega con "[responde a: <lo citado>]" adelante (texto-del-mensaje.js, en todos los modos); los
 * acuses y el saludo del día miran el texto sin la cita (`sinCita`). Y en vivo la guardia frena "nuestro stock".
 * Las fotos de los equipos del local (08/10/2026, decisiones de Tomás; src/fotos-equipos.js), solo en vivo: cuando
 * el cliente PIDE fotos, Sonnet llama a `mandar_fotos` (los modelos y la capacidad) y el código elige las fotos
 * (una por unidad del local, la cotizada primero y después las más baratas, hasta 3, con el pie "15 128gb 87%
 * 740.000"); Sonnet responde con `[fotos]` (o sin él: van después de sus textos) y las fotos salen como acciones
 * `foto-equipo` por el mismo camino que cualquier foto (index.js). Un modelo que está solo en el depósito no tiene
 * foto: Sonnet pone `[fotos_deposito]` y el código lo cambia por la frase con el día y avisa al grupo (la única
 * promesa de fotos que existe). Un modelo del local sin color o sin foto de ese color: salen las fotos de los
 * otros y el código escala por ese, con el código del equipo (`escalarDespues`); si no hay ninguna, escala.
 * Las fotos cuentan para el tope de 4 con el saludo y el PDF: las recorta `comoResultado`, nunca un texto.
 *
 * Sin dependencias npm: `fetch` a la API de Anthropic, con timeout y un reintento ante 429/5xx,
 * como `gemini.llamar`. Sonnet 5.5 no acepta `tool_choice: any` (400, "Forced tool use is not
 * supported"): va `auto`, las instrucciones piden terminar con `responder` o `escalar`, y lo que
 * no termina así cuenta como escalar.
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const config = require('./config');
const state = require('./state');
const sheets = require('./sheets');
const cotizador = require('./cotizador');
const gemini = require('./gemini');
const responder = require('./responder');
const promesas = require('./promesas');
const acciones = require('./acciones');
const temas = require('./temas');
const evolution = require('./evolution');
const chatsViejos = require('./chats-viejos');
const local = require('./extractor-local');
const contexto = require('./contexto');
const stockApp = require('./stock-app');
const { sinCita } = require('./texto-del-mensaje');
const fotosEquipos = require('./fotos-equipos');

/** Las instrucciones: se leen una vez, al arrancar. Van con cache_control (se reaprovechan). */
const REGLAS = fs.readFileSync(path.join(__dirname, 'cerebro-reglas.md'), 'utf8');
/** Las reglas del local y el depósito (08/10/2026): van después de las de siempre, solo con el stock de la app en vivo. */
const REGLAS_DEPOSITO = fs.readFileSync(path.join(__dirname, 'cerebro-reglas-deposito.md'), 'utf8');
/** ¿El stock de la app corre en vivo? (STOCK_APP_MODO=vivo; con apagado o sombra, Chiara contesta como siempre.) */
const stockEnVivo = () => config.stockApp.modo === 'vivo';
/** Las instrucciones que van en el pedido: las de siempre y, en vivo, las del depósito. */
const reglasEfectivas = () => (stockEnVivo() ? `${REGLAS.replace(/\s+$/, '')}\n\n${REGLAS_DEPOSITO}` : REGLAS);

/**
 * La versión de las reglas (bloque Ninjo 2, revisión de Ninjo del 05/10/2026, punto 3.2): los primeros 8
 * caracteres del sha256 de cerebro-reglas.md, con los finales de línea pasados a \n (da igual en Windows
 * y en Linux). Se calcula una vez, al cargar las reglas. Va en cada propuesta de Sonnet del registro
 * (`sonnet.reglas`), en /salud (`cerebro.reglas`) y en la consola al arrancar (`lineaDeReglas`); los
 * cambios y cómo se revisan, en CAMBIOS-CEREBRO.md.
 */
const conFinalesLf = (texto) => String(texto).replace(/\r\n?/g, '\n');
function hashDeReglas(texto) {
  return crypto.createHash('sha256').update(conFinalesLf(texto)).digest('hex').slice(0, 8);
}
// Con el stock de la app en vivo, el hash y las líneas son los de las reglas con la sección del depósito
// (CAMBIOS-CEREBRO.md lo anota como otra versión); con apagado o sombra, los de siempre.
const REGLAS_HASH = hashDeReglas(reglasEfectivas());
const REGLAS_LINEAS = conFinalesLf(reglasEfectivas()).replace(/\n$/, '').split('\n').length;
/** "CEREBRO: reglas 1a2b3c4d (412 líneas)": lo que dice la consola al arrancar (index.js). */
const lineaDeReglas = () => `CEREBRO: reglas ${REGLAS_HASH} (${REGLAS_LINEAS} líneas${stockEnVivo() ? ', con el local y el depósito' : ''})`;

const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSION_API = '2023-06-01';
/** Vueltas de herramientas por turno. La que no termina con responder o escalar, escala. */
const MAX_VUELTAS = 5;
// Si la guardia frena lo que quería mandar, Sonnet tiene UNA vuelta más para corregirlo (con el motivo
// como tool_result de error); si vuelve a frenar, escala como siempre (02/10/2026, batería: 5 mensajes
// con una lista de 3 equipos y "con lo que te pasé quedan" escalaban un turno que tenía arreglo).
const CORRECCIONES = 1;
const MAX_MENSAJES = 4;
const LARGO_MAXIMO = 300;
/** Incluye lo que piensa (adaptive thinking): la respuesta en sí es corta. */
const MAX_TOKENS = 8000;
const ESPERA_REINTENTO_MS = 500;
const ESPERA_REINTENTO_RED_MS = 2000;
const ESFUERZOS = ['low', 'medium', 'high', 'xhigh', 'max'];

const objeto = (properties, required = []) => ({ type: 'object', properties, required, additionalProperties: false });

/**
 * La ficha del cliente para el panel Chiara (decisión de Tomás del 06/10/2026: que la diga Sonnet). Va
 * siempre en `responder` y en `escalar`, nunca le llega al cliente ni al grupo: la lee
 * src/panel-chiara.js (quiere avanzar, cuándo, forma de pago, zona, canje). Con lo que sabe de TODA la
 * charla; lo que no dijo, vacío o `no_dijo`.
 */
const FICHA = {
  type: 'object',
  description:
    'Para el panel interno, nunca le llega al cliente: lo que sabés del cliente por toda la charla. Lo que no dijo va vacío o "no_dijo".',
  properties: {
    quiere_avanzar: {
      type: 'boolean',
      description: 'true si ya pidió el alias, los datos para pagar o un turno, o propuso cómo pagar, y la compra sigue en pie.',
    },
    cuando: { type: 'string', description: 'Cuándo dijo que compra o pasa, corto y como lo dijo: "hoy", "el viernes", "a fin de mes". Vacío si no dijo.' },
    cuando_es: { type: 'string', enum: ['hoy', 'esta_semana', 'mas_adelante', 'no_dijo'], description: 'Ese cuándo, contra la fecha de hoy.' },
    forma_pago: { type: 'string', enum: ['contado', 'cuotas', 'no_dijo'], description: 'Cómo dijo que paga.' },
    zona: { type: 'string', description: 'Dónde está o dónde quiere retirar: "Cipolletti", "Neuquén centro". Vacío si no dijo.' },
    canje: { type: 'string', description: 'El iPhone que da en parte de pago, con lo que se sepa: "iPhone 12 128GB 85%". Vacío si no trae.' },
  },
  required: ['quiere_avanzar', 'cuando', 'cuando_es', 'forma_pago', 'zona', 'canje'],
  additionalProperties: false,
};

/**
 * Las herramientas. Las de datos usan lo que ya existe (la planilla con la lista de usados activa,
 * `buscarTodas`, `cotizar`); `escalar` y `responder` terminan el turno. Con `strict` los argumentos
 * llegan siempre con el tipo del esquema.
 */
const HERRAMIENTAS = [
  {
    name: 'buscar_equipos',
    description:
      'Los equipos que se pueden vender de un modelo, o todos si no se pasa modelo: modelo, capacidad, batería ' +
      '(o "sellado"), precio de contado y entrega mínima para financiarlo. Sale de la planilla del negocio, con la ' +
      'lista de usados activa. Si la activa no es LISTA, también `al_100`: los de LISTA (al 100% o sellados) del ' +
      'mismo modelo. Si no hay ninguno de ese modelo, `parecidos`: los más parecidos que sí hay, el más parecido ' +
      'primero. Usala antes de decir cualquier precio o stock.',
    strict: true,
    input_schema: objeto({
      modelo: { type: 'string', description: 'El modelo como lo nombra el cliente: "13", "14 pro", "iPhone 15 Pro Max".' },
      capacidad: { type: 'integer', description: 'La capacidad en GB, si la dijo: 128, 256 o 512.' },
    }),
  },
  {
    name: 'lista_de_precios',
    description:
      'La lista de precios de hoy, tal cual la manda el negocio, partida en `usados` y `sellados`: una línea por ' +
      'modelo con capacidad, batería y precio de contado. Para mandarla entera, un mensaje que sea exactamente [lista].',
    strict: true,
    input_schema: objeto({}),
  },
  {
    name: 'cotizar',
    description:
      'Cotiza un modelo con la entrega inicial que dijo el cliente; también el primero de `parecidos` de buscar_equipos ' +
      '(con su modelo y su capacidad), aunque el cliente no lo haya nombrado. Devuelve 1 pago y 2 cuotas (se le pasan con un ' +
      'mensaje que sea exactamente [cotizacion]); o que la entrega no llega, con la entrega mínima de ese modelo; o ' +
      'que con esa entrega lo paga de contado. El sistema lee la entrega de `entrega_texto` y cotiza con lo que lee ' +
      '(lo devuelve en `entrega_leida`). Si ya se le dijo dos veces la entrega inicial de ese modelo y sigue sin ' +
      'llegar, lo resuelve el sistema: si está cerca, cotiza igual con `excepcion: true`; si no, devuelve ' +
      '`con_esa_entrega`, lo que sí se lleva con esa entrega, y si eso viene vacío, `de_contado`, lo que se paga ' +
      'entero con esa plata.',
    strict: true,
    input_schema: objeto(
      {
        modelo: { type: 'string', description: 'El modelo: "13", "14 pro", "iPhone 15".' },
        capacidad: { type: 'integer', description: 'La capacidad en GB, si la dijo.' },
        bateria: {
          type: 'integer',
          description: 'La batería en %, si eligió uno por la batería ("el de 100", "el de 89"): 100. Sin esto se cotiza el más barato que se financia.',
        },
        entrega: { type: 'integer', description: 'La entrega inicial en pesos, como la entendiste, sin puntos: 340000.' },
        entrega_texto: {
          type: 'string',
          description:
            'La frase del cliente donde dice con cuánto cuenta, tal cual la escribió: "tengo 180 en efectivo y 120 ' +
            'por transferencia", "medio palo", "perdón, 500". El sistema la lee y hace la cuenta.',
        },
        al_100: {
          type: 'boolean',
          description: 'true para cotizar el de LISTA (al 100%) cuando la lista activa es otra (los de `al_100` de buscar_equipos).',
        },
      },
      ['modelo', 'entrega', 'entrega_texto']
    ),
  },
  {
    name: 'que_me_alcanza',
    description:
      'Qué equipos le alcanzan con su presupuesto: `de_contado`, los 2 más caros que paga enteros con ese monto, y ' +
      '`con_entrega`, los 2 más caros que retira dando ese monto de entrega inicial (el resto en cuotas). El sistema ' +
      'lee el monto de `monto_texto`.',
    strict: true,
    input_schema: objeto(
      {
        monto_texto: {
          type: 'string',
          description: 'La frase del cliente con su presupuesto, tal cual la escribió: "q iphone me alcanza con 750.000", "tengo medio palo".',
        },
      },
      ['monto_texto']
    ),
  },
  {
    name: 'escalar',
    description:
      'Terminás sin mandarle nada al cliente: una persona del negocio sigue el chat. Usala ante la duda. Con ' +
      '`turno: true` (dijo el día y la hora, o quiere venir hoy o ahora), el sistema le contesta que se fija los turnos ' +
      'y después escala.',
    strict: true,
    input_schema: objeto(
      {
        motivo: { type: 'string', description: 'Por qué, en una frase corta para el grupo interno.' },
        turno: { type: 'boolean', description: 'true si escalás por el turno (día y hora dichos, o quiere venir hoy o ahora).' },
        ficha: FICHA,
      },
      ['motivo', 'ficha']
    ),
  },
  {
    name: 'responder',
    description:
      'Terminás con lo que le llega al cliente: de 1 a 4 mensajes, cada uno de hasta 300 caracteres. [cotizacion] y ' +
      '[lista], como mensaje solo, los reemplaza el sistema.',
    strict: true,
    input_schema: objeto(
      {
        mensajes: { type: 'array', items: { type: 'string' }, description: 'Los mensajes, en orden.' },
        aviso_grupo: {
          type: 'string',
          description: 'Opcional: un aviso corto para el grupo interno, sin dejar de atender el chat ("pidió el 18 y no está en la planilla").',
        },
        ficha: FICHA,
      },
      ['mensajes', 'ficha']
    ),
  },
];

/**
 * Las fotos de los equipos del local (08/10/2026, decisión de Tomás), SOLO con el stock de la app en vivo: con
 * apagado o sombra la herramienta no existe y un pedido de fotos escala, como siempre. Las fotos las elige el
 * código (fotos-equipos.js); Sonnet solo dice qué modelos pidió y después pone `[fotos]`.
 */
const MANDAR_FOTOS = {
  name: 'mandar_fotos',
  description:
    'Solo cuando el cliente PIDE fotos ("me mostrás el 15?", "tenés fotos?"): le manda una foto de cada equipo del ' +
    'local de esos modelos (hasta 3 en total), con el pie que arma el sistema (modelo, capacidad, batería y precio). ' +
    'Devuelve `fotos` (las que van: su unidad y su pie), `deposito` (modelos que no están en el local sino en el ' +
    'depósito: sin foto, decilo con un mensaje que sea exactamente [fotos_deposito]; el sistema pone la frase y avisa ' +
    'al grupo), `sin_foto` (unidades del local sin color cargado o sin foto de ese color: el sistema escala por esas ' +
    'después de mandar las otras) y `no_hay` (modelos que no están). Después, `responder` con un mensaje que sea ' +
    'exactamente [fotos]: ahí van las fotos (cada una cuenta para el tope de 4, y el saludo también).',
  strict: true,
  input_schema: objeto(
    {
      modelos: { type: 'array', items: { type: 'string' }, description: 'Los modelos de los que pidió fotos, como los nombra el cliente: ["15"], ["13", "14 pro"].' },
      capacidad: { type: 'integer', description: 'La capacidad en GB, si la dijo: 128, 256 o 512.' },
    },
    ['modelos']
  ),
};

/** Las herramientas del pedido: las de siempre y, con el stock de la app en vivo, `mandar_fotos`. */
const herramientasEfectivas = () => (stockEnVivo() ? [...HERRAMIENTAS, MANDAR_FOTOS] : HERRAMIENTAS);

// ---------------------------------------------------------------------------
// El gasto del día, en memoria (se pierde con un reinicio). /salud lo muestra.
// ---------------------------------------------------------------------------
const ZONA = 'America/Argentina/Buenos_Aires';
const DIA_ARGENTINA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const usoEnCero = () => ({ entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 });
let gasto = { dia: null, llamadas: 0, ...usoEnCero(), usd: 0 };

function delDia() {
  const hoy = DIA_ARGENTINA.format(Date.now());
  if (gasto.dia !== hoy) gasto = { dia: hoy, llamadas: 0, ...usoEnCero(), usd: 0 };
  return gasto;
}

const seisDecimales = (n) => Math.round(n * 1e6) / 1e6;

/** USD estimados con los precios por millón de config (CEREBRO_USD_*). */
function costo(uso) {
  const p = config.cerebro.usdPorMillon;
  return (uso.entrada * p.entrada + uso.salida * p.salida + uso.cacheLeida * p.cacheLeida + uso.cacheEscrita * p.cacheEscrita) / 1e6;
}

/** Suma el `usage` de una respuesta al turno y al día. */
function sumarUso(uso, usage) {
  const u = {
    entrada: Number(usage && usage.input_tokens) || 0,
    salida: Number(usage && usage.output_tokens) || 0,
    cacheLeida: Number(usage && usage.cache_read_input_tokens) || 0,
    cacheEscrita: Number(usage && usage.cache_creation_input_tokens) || 0,
  };
  const g = delDia();
  for (const k of Object.keys(u)) {
    uso[k] += u[k];
    g[k] += u[k];
  }
  g.llamadas++;
  g.usd += costo(u);
  // Y al mes (bloque Ninjo 2): cada llamada, conteste en vivo, en sombra, la sombra con persona o #sonnet.
  sumarAlMes(costo(u));
}

// ---------------------------------------------------------------------------
// Panel Chiara (06/10/2026): quien quiera saber de cada vez que Sonnet piensa (src/panel-chiara.js).
// ---------------------------------------------------------------------------
const oyentes = [];

/**
 * `fn({ chatId, vivo, ahora, r })` con cada `pensar` terminado: `vivo` si fue para contestar de verdad
 * (`contestar`), si no es sombra; `r` lo que devolvió (usd, ms, error, ficha, conCotizacion, datos…).
 * Un oyente que tira no cambia nada de lo que hace el bot. Devuelve la función para sacarlo.
 */
function alPensar(fn) {
  if (typeof fn !== 'function') return () => {};
  oyentes.push(fn);
  return () => {
    const i = oyentes.indexOf(fn);
    if (i >= 0) oyentes.splice(i, 1);
  };
}

function avisarOyentes(info) {
  for (const fn of oyentes.slice()) {
    try {
      fn(info);
    } catch (e) {
      console.error('[cerebro] el panel no pudo anotar lo que pensó Sonnet:', e.message);
    }
  }
}

/** La ficha que vino en `responder` o `escalar`, limpia; null si no vino. Nunca tira. */
function fichaDe(input) {
  const f = input && input.ficha;
  if (!f || typeof f !== 'object') return null;
  const texto = (v, largo) => {
    const t = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    return t ? recorte(t, largo) : null;
  };
  const una = (v, opciones) => (opciones.includes(v) ? v : null);
  return {
    quiere_avanzar: f.quiere_avanzar === true,
    cuando: texto(f.cuando, 60),
    cuando_es: una(f.cuando_es, ['hoy', 'esta_semana', 'mas_adelante']),
    forma_pago: una(f.forma_pago, ['contado', 'cuotas']),
    zona: texto(f.zona, 60),
    canje: texto(f.canje, 80),
  };
}

/** Lo del día: llamadas a la API, tokens y USD estimados. */
function gastoDeHoy() {
  const g = delDia();
  return { ...g, usd: seisDecimales(g.usd) };
}

// ---------------------------------------------------------------------------
// El gasto del mes (bloque Ninjo 2, 06/10/2026): en estado.json, bajo la clave interna
// (`gastoSonnetMes: { mes, usd }`), así un reinicio no lo pone en 0. El tope de verdad está en la
// cuenta de Anthropic (CEREBRO_TOPE_MES_USD es para verlo): pasado el 80%, un aviso al grupo por mes.
// ---------------------------------------------------------------------------
const MES_ARGENTINA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit' });
/** 'AAAA-MM' en Argentina. */
const mesDe = (ts) => MES_ARGENTINA.format(ts).slice(0, 7);

/** Suma `usd` al mes de `ahora`; si lo guardado es de otro mes, arranca de 0. */
function sumarAlMes(usd, ahora = Date.now()) {
  const mes = mesDe(ahora);
  const g = state.gastoSonnetMes();
  const antes = g && g.mes === mes ? Number(g.usd) || 0 : 0;
  state.guardarGastoSonnetMes({ mes, usd: seisDecimales(antes + (Number(usd) || 0)) });
}

/** Para /salud: { mes, usd, tope, porcentaje } del mes de `ahora` (0 si lo guardado es de otro mes). */
function gastoDelMes(ahora = Date.now()) {
  const mes = mesDe(ahora);
  const g = state.gastoSonnetMes();
  const usd = g && g.mes === mes ? seisDecimales(Number(g.usd) || 0) : 0;
  const tope = config.cerebro.topeMesUsd;
  return { mes, usd, tope, porcentaje: Math.round((usd / tope) * 1000) / 10 };
}

/**
 * Al arrancar (index.js): si estado.json no tiene el gasto del mes en curso, se arma UNA vez con el
 * registro de aprendizaje de ese mes: `sonnet.usd` de las `propuesta` que contestó Sonnet y `usd` de las
 * `propuesta-sonnet` (la sombra, la sombra con persona y los errores en vivo). #sonnet no anota nada en el
 * registro: lo que gastó antes no se recupera. `eventos`: la lista, o una función que la lee (el
 * registro entero se lee solo si hace falta armarlo). Devuelve si lo armó.
 */
function armarGastoMes({ eventos = [], ahora = Date.now() } = {}) {
  const mes = mesDe(ahora);
  const g = state.gastoSonnetMes();
  if (g && g.mes === mes) return false;
  let usd = 0;
  for (const e of typeof eventos === 'function' ? eventos() : eventos) {
    const ts = Date.parse(e && e.ts);
    if (!Number.isFinite(ts) || mesDe(ts) !== mes) continue;
    if (e.tipo === 'propuesta' && e.sonnet) usd += Number(e.sonnet.usd) || 0;
    else if (e.tipo === 'propuesta-sonnet') usd += Number(e.usd) || 0;
  }
  state.guardarGastoSonnetMes({ mes, usd: seisDecimales(usd) });
  return true;
}

/** "49,00", "60" (el tope, si es entero), "81,7". */
const conComa = (n, decimales) => (decimales == null ? String(n) : n.toFixed(decimales)).replace('.', ',');

/**
 * El aviso del 80% del tope, si toca: { mes, texto } o null. Toca una sola vez por mes (la marca,
 * `gastoSonnetAvisado` en estado.json, la pone index.js cuando el aviso salió).
 */
function avisoGastoMes(ahora = Date.now()) {
  const g = gastoDelMes(ahora);
  if (!(g.usd >= g.tope * 0.8) || state.gastoSonnetAvisado() === g.mes) return null;
  const tope = Number.isInteger(g.tope) ? String(g.tope) : conComa(g.tope, 2);
  return { mes: g.mes, texto: `⚠️ Sonnet va US$${conComa(g.usd, 2)} de US$${tope} este mes (${conComa(g.porcentaje)}%)` };
}

/** El aviso del 80% salió: no se repite ese mes. */
function marcarAvisoGastoMes(mes) {
  state.marcarGastoSonnetAvisado(mes);
}

/**
 * Para /salud. `chatsConSonnet`: los que quedaron marcados (`atiendeSonnet`), fase 2. Bloque Ninjo 2:
 * `reglas` (el hash de cerebro-reglas.md) y `gastoMes`.
 */
function resumenSalud() {
  const g = gastoDeHoy();
  const chatsConSonnet = Object.values(state.todos()).filter((s) => s && s.atiendeSonnet === true).length;
  return { modo: config.cerebro.modo, llamadasHoy: g.llamadas, usdHoy: g.usd, chatsConSonnet, reglas: REGLAS_HASH, gastoMes: gastoDelMes() };
}

// ---------------------------------------------------------------------------
// La guardia del código
// ---------------------------------------------------------------------------

/** La calle y el número del local ("Belgrano 3090"): es un dato fijo, no un monto. */
const escapar = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const DIRECCION = new RegExp(escapar(responder.DATOS_FIJOS.direccion.split(',')[0].trim()), 'gi');

// Un número, con $ adelante o "mil" / "k" / "lucas" atrás si los tiene.
const MONTO = /(\$\s*)?(\d[\d.,]*\d|\d)(\s*(?:mil|k|lucas)\b)?/gi;

/**
 * Los montos de un texto, en pesos: con $, con 4 cifras o más, o en "mil". "254.000", "254000",
 * "254 mil", "$254 mil", "254k" y "$254.000,00" son todos 254000. "128gb", "100%", "1 o 2 cuotas" y
 * la dirección del local no son montos, y tampoco un año suelto ("salió en 2024"): ningún precio del
 * negocio son 4 cifras peladas, y frenar por eso inflaba los escalados de la sombra.
 */
function montosEn(texto) {
  const t = String(texto || '').replace(DIRECCION, ' ');
  const out = [];
  for (const m of t.matchAll(MONTO)) {
    const conPeso = Boolean(m[1]);
    const enMiles = Boolean(m[3]);
    if (!conPeso && !enMiles && /^(?:19|20)\d\d$/.test(m[2])) continue;
    const entero = m[2].replace(/[.,]\d{1,2}$/, '');
    const cifras = entero.replace(/[.,]/g, '');
    const valor = enMiles ? Math.round(parseFloat(m[2].replace(/\./g, '').replace(',', '.')) * 1000) : parseInt(cifras, 10);
    if (conPeso || enMiles || cifras.length >= 4) out.push(valor);
  }
  return out;
}

/**
 * Los montos escritos sin puntos de miles (fase 2, decisión de Tomás del 02/10/2026: "$740.000",
 * nunca "$740000"): 4 cifras o más pegadas, o con comas de miles ("740,000"). "740 mil" está bien;
 * un año suelto tampoco cuenta (como en `montosEn`). Devuelve lo que encontró, tal cual.
 */
function sinPuntosEn(texto) {
  const t = String(texto || '').replace(DIRECCION, ' ');
  const out = [];
  for (const m of t.matchAll(MONTO)) {
    if (!m[1] && /^(?:19|20)\d\d$/.test(m[2])) continue;
    const entero = m[2].replace(/[.,]\d{1,2}$/, '');
    if (/^\d{4,}$/.test(entero) || /^\d{1,3}(?:,\d{3})+$/.test(entero)) out.push(m[0].trim());
  }
  return out;
}

const TE_FALTA = /\bte faltan?\b/;
/**
 * La promesa de mandar algo después (08/10/2026, *Lo que no hacés nunca*: "te las mando mañana"): "te la(s)/lo(s)
 * paso|mando|envío" con "mañana", "después", "más tarde", "en un rato", "a la tarde/noche" o un día de la semana
 * dentro de las 2 palabras que siguen, sin cruzar una coma ni un punto ("te lo paso ahora, mañana abrimos a las 10"
 * no es una promesa). `prometeArchivo` no la ve (no nombra el archivo). La frase del depósito de las fotos la pone el
 * código con `[fotos_deposito]` después de la guardia: por eso no la frena.
 */
const MANDA_DESPUES = /\bte (?:la|las|lo|los) (?:paso|mando|envio)(?:\s+[^\s.,;:?!]+){0,2}?\s+(?:manana|despues|mas tarde|en un rat(?:o|ito)|a la (?:tarde|noche)|el (?:lunes|martes|miercoles|jueves|viernes|sabado|domingo))\b/;

/**
 * Lo que escribió Sonnet sin lo que delata a una IA (bloque Ninjo 1, 05/10/2026), línea por línea:
 * las rayas ("—", "–") pasan a ", " (pegadas entre dos números, a "-": "85–93%" es un rango de
 * batería), sin "¿" ni "¡", "**x**" pasa a "*x*" (la negrita de WhatsApp) y sin viñetas ni títulos
 * de markdown al principio ("- ", "• ", "* ", "# "). No deja ", ," ni dobles espacios, ni una coma
 * al principio o al final. Solo lo de Sonnet, antes de la guardia: no va en `limpiarRedactado`, que
 * usa el bot de siempre. El 📱 y los montos no se tocan.
 */
function sinMarcasDeIA(texto) {
  return String(texto == null ? '' : texto)
    .split('\n')
    .map((linea) =>
      linea
        .replace(/(\d)[—–](?=\d)/g, '$1-')
        .replace(/\s*[—–]\s*/g, ', ')
        .replace(/[¿¡]/g, '')
        .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
        .replace(/^\s*(?:[-•*]|#{1,6})\s+/, '')
        .replace(/,(?:\s*,)+/g, ',')
        .replace(/^\s*,\s*/, '')
        .replace(/\s*,\s*$/, '')
        .replace(/ {2,}/g, ' ')
        .trim()
    )
    .join('\n');
}

/**
 * Lo interno que no puede salir nunca en un mensaje (bloque Ninjo 1): los nombres de las
 * herramientas y de sus campos, cómo se ve el negocio por dentro y una forma de "escalar". Sobre
 * el texto sin tildes ni mayúsculas, con límites de palabra ("escalón" o "los sistemas" no cuentan).
 */
const LO_INTERNO = new RegExp(
  [
    '\\b(?:buscar_equipos|lista_de_precios|paga_de_contado|entrega_minima|entrega_texto|con_esa_entrega|de_contado|que_me_alcanza|mandar_fotos)\\b',
    '\\bcotizar\\(',
    '\\bllega:\\s*false\\b',
    '\\b(?:el sistema|la planilla|el historial|la herramienta|persona de la cuenta)\\b',
    '\\b(?:escalo|escalar|escale|escalado)\\b',
  ].join('|')
);

/**
 * Lo interno del stock de la app (08/10/2026, decisión de Tomás): nunca nombra a TechSur ni al proveedor,
 * ni dice "por encargo" o "a pedido". Es nuestro depósito. Desde la lista del local (08/10/2026, 20:30), tampoco
 * "nuestro stock", "stock propio", "stock nuestro" ni parecidos ("nuestros stocks", "nuestro propio stock", "mi
 * stock", "stock de nosotros"): "en stock" y "sin stock" sí. SOLO con STOCK_APP_MODO=vivo: con apagado o sombra la
 * guardia es exactamente la de siempre.
 */
const LO_INTERNO_DEL_STOCK = new RegExp(
  [
    '\\btech\\s*sur\\b',
    '\\bproveedor(?:es|a|as)?\\b',
    '\\b(?:por|de|a) encargo\\b',
    '\\ba pedido\\b',
    '\\b(?:nuestros?|mis?)\\s+(?:propios?\\s+)?stocks?\\b',
    '\\bstocks?\\s+(?:propios?|nuestros?|mios?|de nosotros)\\b',
  ].join('|')
);

/**
 * Lo interno que nombra el texto (`LO_INTERNO`), tal cual, o null. También lo usa la batería. Con
 * `stockVivo`, también lo del stock de la app (`LO_INTERNO_DEL_STOCK`).
 */
function nombraAlgoInterno(texto, { stockVivo = false } = {}) {
  const sin = promesas.sinTildes(texto);
  const m = sin.match(LO_INTERNO) || (stockVivo ? sin.match(LO_INTERNO_DEL_STOCK) : null);
  return m ? m[0] : null;
}

/**
 * La promesa de un archivo (bloque Ninjo 1): "te paso", "te mando", "te envío" o "ahí va(n)" y, en
 * las 6 palabras que siguen (sin cortar la frase), fotos, video, pdf, archivo, ubicación, link o el
 * compromiso. Sonnet no manda archivos: solo el PDF del compromiso, que adjunta el sistema. Con
 * `adjunto` (esa respuesta lleva el PDF) valen el pdf, el archivo y el compromiso; con `fotos` (esa
 * respuesta lleva fotos de los equipos elegidas por `mandar_fotos`, 08/10/2026) valen las fotos; el
 * video, la ubicación y el link no van nunca. "Te paso los números" o "te paso el 13 y el 14" no son
 * archivos. La frase del depósito de las fotos ("si no te las mando mañana") no pasa por acá: la pone el
 * código con `[fotos_deposito]` después de la guardia. Devuelve lo que promete, o null.
 */
const PROMETE = /\b(?:te paso|te mando|te envio|ahi van?)\b((?:\s+[^\s.?!]+){1,6})/g;
const ARCHIVO = /\b(?:fotos?|videos?|pdf|archivos?|ubicacion|link|compromiso)\b/g;
const VA_CON_EL_PDF = /^(?:pdf|archivos?|compromiso)$/;
const VA_CON_LAS_FOTOS = /^fotos?$/;

function prometeArchivo(texto, { adjunto = false, fotos = false } = {}) {
  for (const m of promesas.sinTildes(texto).matchAll(PROMETE)) {
    const noVa = (m[1].match(ARCHIVO) || []).find((a) => !(adjunto && VA_CON_EL_PDF.test(a)) && !(fotos && VA_CON_LAS_FOTOS.test(a)));
    if (noVa) return m[0].slice(0, m[0].indexOf(noVa, m[0].length - m[1].length) + noVa.length).trim();
  }
  return null;
}

/**
 * Los mensajes que reemplaza el código (bloque Ninjo 1b): `[cotizacion]` (el bloque de cada `cotizar`
 * de la respuesta que dio 1 pago y 2 cuotas) y `[lista]` (la lista en dos mensajes, usados y
 * sellados). Sin mayúsculas ni tildes que importen: "[Cotización]" también.
 */
const PONE_COTIZACION = /^\[\s*cotizaci[oó]n\s*\]$/i;
const PONE_LISTA = /^\[\s*lista\s*\]$/i;
/**
 * `[deposito]` (el stock de la app en vivo, 08/10/2026): va adentro de un mensaje o como mensaje solo, y el
 * código lo cambia por la frase del depósito con el día (stock-app.fraseDeposito). Es la única forma en que
 * Sonnet habla del depósito: la palabra "depósito" escrita por su cuenta frena (`nombraElDeposito`).
 */
const PONE_DEPOSITO = /\[\s*dep[oó]sito\s*\]/gi;
const TIENE_DEPOSITO = /\[\s*dep[oó]sito\s*\]/i;
// Lo que ofrece del depósito escrito por su cuenta: "en el depósito", "del depósito", "al depósito", "llega al
// depósito". No "el depósito" suelto: "haceme el depósito" es una transferencia.
const OFRECE_DEL_DEPOSITO = /\b(?:en(?: el| nuestro| un)?|del|al) deposito\b/;
/**
 * Las fotos de los equipos (08/10/2026): `[fotos]`, un mensaje que es exactamente eso (o una línea de uno), y el
 * código pone ahí las fotos que eligió `mandar_fotos`; `[fotos_deposito]`, como mensaje solo o adentro de uno, y
 * el código lo cambia por la frase del depósito con el día (fotos-equipos.fraseFotosDeposito).
 */
const PONE_FOTOS = /^\[\s*fotos\s*\]$/i;
const PONE_FOTOS_DEPOSITO = /\[\s*fotos[_ -]?dep[oó]sito\s*\]/gi;
const TIENE_FOTOS_DEPOSITO = /\[\s*fotos[_ -]?dep[oó]sito\s*\]/i;
/** ¿El texto habla del depósito (nuestro) fuera de los marcadores `[deposito]` y `[fotos_deposito]`? (Las frases las pone solo el código.) */
function nombraElDeposito(texto) {
  const sin = promesas.sinTildes(String(texto || '').replace(PONE_FOTOS_DEPOSITO, ' ').replace(PONE_DEPOSITO, ' '));
  return OFRECE_DEL_DEPOSITO.test(sin);
}
/**
 * La cotización escrita a mano ("1 pago de $X", "1 cuota de $X", "2 cuotas de $Y", "2 pagos de $Y",
 * con un monto después): va en el bloque (decisión de Tomás del 05/10/2026, …7024). "1 o 2 cuotas" o
 * "en 2 cuotas" sin monto no.
 */
const COTIZACION_A_MANO = /\b(?:1|un|una) (?:pago|cuota) de\s*\$?\s*\d|\b(?:2|dos) (?:pagos|cuotas) de\s*\$?\s*\d/;

/** ¿El texto escribe la cotización a mano? (también lo usa la batería). */
function cotizaAMano(texto) {
  const m = promesas.sinTildes(texto).match(COTIZACION_A_MANO);
  return m ? m[0] : null;
}

const tieneLinea = (re) => (m) => String(m).split('\n').some((l) => re.test(l.trim()));

/**
 * Un caracter que no va en un mensaje de WhatsApp (prueba en vivo del 1b, 06/10/2026: "si quer\té s
 * seguimos" le llegó así al tester): un tab u otro de control (el salto de línea sí va), un espacio
 * invisible o el "�". El ZWJ de los emojis compuestos y el selector de variante (❤️) sí van.
 */
const CARACTER_RARO = /[\u0000-\u0009\u000B-\u001F\u007F\u200B\u200C\u2060\uFEFF\uFFFD]/;
const CARACTERES_RAROS = new RegExp(CARACTER_RARO.source, 'g');
function caracterRaro(texto) {
  const t = String(texto);
  const i = t.search(CARACTER_RARO);
  if (i < 0) return null;
  const c = t[i];
  const cual = c === '\t' ? 'un tab' : c === '\uFFFD' ? 'un "�"' : `el caracter U+${c.charCodeAt(0).toString(16).toUpperCase().padStart(4, '0')}`;
  return `${cual} en "${t.slice(Math.max(0, i - 12), i + 12).replace(CARACTERES_RAROS, '·')}"`;
}

/**
 * Lo que contestaría, revisado antes de que pueda salir. Cada mensaje pasa por `sinMarcasDeIA` y
 * `limpiarRedactado` (sin el saludo del principio ni los mensajes de relleno, como lo que redacta
 * Gemini) y:
 *   - como mucho 4 mensajes: si vienen más, del cuarto en adelante van juntos en el cuarto,
 *     separados por un salto de línea (bloque Ninjo 1; antes frenaba). Cada uno de hasta 300
 *     caracteres, el cuarto ya juntado. Con `[lista]`, sus dos mensajes cuentan y no se junta: si
 *     pasan de 4, frena;
 *   - todo monto tiene que estar entre los que devolvieron las herramientas en ESTA respuesta;
 *   - todo monto va con puntos de miles (fase 2): "$740000" o "740,000" frenan;
 *   - nada de prometer a otra persona ni de prometer volver (src/promesas.js, la misma regla
 *     que `evaluar`), ni de "te falta(n)";
 *   - nada que nombre algo interno (`nombraAlgoInterno`), ni la promesa de un archivo que no va
 *     (`prometeArchivo`), ni un tab u otro caracter raro (`caracterRaro`, 06/10/2026);
 *   - bloque Ninjo 1b: la cotización no se escribe a mano (`cotizaAMano`), `[cotizacion]` necesita un
 *     `cotizar` de esta respuesta con 1 pago y 2 cuotas (`bloques`) y `[lista]` un `lista_de_precios`
 *     (`lista`: { usados, sellados }).
 * `adjunto`: el PDF del compromiso todavía no salió; va con esta respuesta solo si lleva el bloque, y
 * recién ahí vale prometerlo ("te paso el compromiso de pago").
 * Las fotos de los equipos (08/10/2026): `fotos`, las que eligió `mandar_fotos` en esta respuesta
 * (fotos-equipos.js), y `fotosDeposito`, la frase del depósito si devolvió un modelo que está solo ahí.
 * `[fotos]` sin fotos y `[fotos_deposito]` sin esa frase frenan; con fotos, "te paso las fotos" vale (van
 * en esta respuesta). Las fotos no cuentan acá para los 4 mensajes: las recorta `comoResultado`, que sabe
 * si va el saludo y el PDF, y nunca corta un texto. Sin `[fotos]`, van después de los textos.
 * Devuelve { mensajes, piezas, escritos, conBloque, conDeposito, conFotos, conFotosDeposito, guardia: null }
 * (`piezas`: los mensajes con las fotos como acciones `foto-equipo`, para index.js; `mensajes`, lo mismo
 * como texto, con el bloque y la lista ya puestos, para el registro y la sombra; `escritos`, lo que escribió
 * Sonnet, con las marcas) o { mensajes: [], guardia: 'qué no pasó', frenados }. El bloque y la lista no
 * cuentan para los 300 caracteres; las frases del depósito sí.
 */
function revisarSalida(mensajes, montos = [], { adjunto = false, bloques = [], lista = null, deposito = null, stockVivo = false, fotos = [], fotosDeposito = null } = {}) {
  const crudos = Array.isArray(mensajes) ? mensajes.map((m) => String(m == null ? '' : m)) : [];
  if (!crudos.length) return { mensajes: [], guardia: 'responder sin mensajes', frenados: [] };
  const problemas = [];
  let limpios = crudos.map((m) => responder.limpiarRedactado(sinMarcasDeIA(m)).join('\n')).filter(Boolean);
  if (!limpios.length) problemas.push('no quedó nada después de limpiar los mensajes');
  const usaBloque = limpios.some(tieneLinea(PONE_COTIZACION));
  const usaLista = limpios.some(tieneLinea(PONE_LISTA));
  // El depósito (08/10/2026): `[deposito]` solo con un equipo del depósito de `buscar_equipos` en esta
  // respuesta (`deposito`, la frase con el día); y en vivo, "depósito" escrito por su cuenta no sale.
  const usaDeposito = limpios.some((m) => TIENE_DEPOSITO.test(m));
  if (usaDeposito && !deposito) problemas.push('puso [deposito] sin que buscar_equipos o cotizar devolvieran un equipo del depósito en esta respuesta');
  // Las fotos de los equipos (08/10/2026): `[fotos]` solo con fotos elegidas por `mandar_fotos` en esta respuesta, y
  // `[fotos_deposito]` solo con un modelo del depósito que devolvió esa herramienta (la frase con el día).
  const fotosQueVan = Array.isArray(fotos) ? fotos.filter((f) => f && f.archivo) : [];
  const usaFotos = limpios.some(tieneLinea(PONE_FOTOS));
  const usaFotosDeposito = limpios.some((m) => TIENE_FOTOS_DEPOSITO.test(m));
  if (usaFotos && !fotosQueVan.length) problemas.push('puso [fotos] sin fotos que mandar: mandar_fotos no devolvió ninguna en esta respuesta (un modelo del depósito va con [fotos_deposito])');
  if (usaFotosDeposito && !fotosDeposito) problemas.push('puso [fotos_deposito] sin que mandar_fotos devolviera un modelo del depósito en esta respuesta');
  if (stockVivo && limpios.some(nombraElDeposito)) problemas.push('ofrece del depósito por su cuenta: el depósito va solo con [deposito], sin la palabra ni un día');
  // Las frases del depósito ya puestas: los 300 caracteres se miden con ellas (8b).
  const conDeposito = (m) => {
    const t = deposito ? m.replace(PONE_DEPOSITO, deposito) : m;
    return fotosDeposito ? t.replace(PONE_FOTOS_DEPOSITO, fotosDeposito) : t;
  };
  const partesLista = lista ? [lista.usados, lista.sellados].filter((x) => String(x || '').trim()) : [];
  if (usaLista) {
    // La lista va en sus mensajes, tal cual: no se junta con nada.
    const total = limpios.reduce((n, m) => {
      if (!tieneLinea(PONE_LISTA)(m)) return n + 1;
      const otras = m.split('\n').filter((l) => !PONE_LISTA.test(l.trim()));
      return n + (otras.length ? 1 : 0) + partesLista.length;
    }, 0);
    if (total > MAX_MENSAJES) problemas.push(`con [lista] van ${partesLista.length} mensajes de la lista y el tope es ${MAX_MENSAJES}: mandá menos mensajes tuyos`);
  } else if (limpios.length > MAX_MENSAJES) {
    limpios = [...limpios.slice(0, MAX_MENSAJES - 1), limpios.slice(MAX_MENSAJES - 1).join('\n')];
  }
  if (usaBloque && !bloques.length) problemas.push('puso [cotizacion] sin un cotizar de esta respuesta que dé 1 pago y 2 cuotas');
  if (usaLista && !partesLista.length) problemas.push('puso [lista] sin llamar a lista_de_precios en esta respuesta');
  const llevaPdf = adjunto && usaBloque && bloques.length > 0;
  const validos = new Set(montos.map(Number));
  for (const m of limpios) {
    const largo = conDeposito(m).length;
    if (largo > LARGO_MAXIMO) problemas.push(`un mensaje de ${largo} caracteres (el tope es ${LARGO_MAXIMO})`);
    for (const monto of montosEn(m)) {
      if (!validos.has(monto)) problemas.push(`monto que no salió de ninguna herramienta: ${cotizador.pesos(monto)}`);
    }
    for (const crudo of sinPuntosEn(m)) {
      problemas.push(`monto sin puntos de miles: "${crudo}" (va ${cotizador.pesos(Number(crudo.replace(/\D/g, '')))})`);
    }
    const sin = promesas.sinTildes(m);
    const deOtro = promesas.promesaDeOtro(m);
    if (deOtro) problemas.push(`promete que otra persona lo va a contactar: "${deOtro}"`);
    const vuelve = sin.match(promesas.PROMESA_DE_CONTACTO);
    if (vuelve) problemas.push(`promete volver a contactarlo: "${vuelve[0]}"`);
    if (TE_FALTA.test(sin)) problemas.push('le dice cuánto le falta ("te falta")');
    const despues = sin.match(MANDA_DESPUES);
    if (despues) problemas.push(`promete mandar algo después: "${despues[0]}"`);
    const interno = nombraAlgoInterno(m, { stockVivo });
    if (interno) problemas.push(`nombra algo interno: "${interno}"`);
    const archivo = prometeArchivo(m, { adjunto: llevaPdf, fotos: fotosQueVan.length > 0 });
    if (archivo) problemas.push(`promete un archivo que no va: "${archivo}"`);
    const raro = caracterRaro(m);
    if (raro) problemas.push(`caracter que no va en WhatsApp: ${raro} (escribí esa parte de nuevo, con las palabras enteras)`);
    const aMano = cotizaAMano(m);
    if (aMano) problemas.push(`la cotización va en el bloque: escribió "${aMano}" (poné [cotizacion] en un mensaje solo, sin los números)`);
  }
  if (problemas.length) return { mensajes: [], guardia: [...new Set(problemas)].join('; '), frenados: crudos };
  const bloque = bloques.map((b) => b.texto).join('\n\n');
  const conBloque = (lineas) => lineas.map((l) => (PONE_COTIZACION.test(l.trim()) ? bloque : l)).join('\n');
  // Las fotos de los equipos van como acciones (index.js las manda con su pie); donde Sonnet puso [fotos] o, si no
  // lo puso, después de sus textos. Una sola vez.
  const accionesDeFotos = fotosQueVan.map((f) => acciones.fotoEquipo(f));
  let fotosPuestas = false;
  const piezas = [];
  for (const m of limpios) {
    const lineas = conDeposito(m).split('\n');
    if (lineas.some((l) => PONE_LISTA.test(l.trim()))) {
      const otras = lineas.filter((l) => !PONE_LISTA.test(l.trim()));
      if (otras.length) piezas.push(otras.join('\n'));
      piezas.push(...partesLista);
      continue;
    }
    if (lineas.some((l) => PONE_FOTOS.test(l.trim()))) {
      const otras = lineas.filter((l) => !PONE_FOTOS.test(l.trim()));
      if (otras.length) piezas.push(conBloque(otras));
      if (!fotosPuestas) piezas.push(...accionesDeFotos);
      fotosPuestas = true;
      continue;
    }
    piezas.push(conBloque(lineas));
  }
  if (accionesDeFotos.length && !fotosPuestas) piezas.push(...accionesDeFotos);
  return {
    mensajes: piezas.map(acciones.comoTexto),
    piezas,
    escritos: limpios,
    conBloque: usaBloque,
    conDeposito: usaDeposito,
    conFotos: accionesDeFotos.length > 0,
    conFotosDeposito: usaFotosDeposito,
    guardia: null,
  };
}

// ---------------------------------------------------------------------------
// Las herramientas de datos
// ---------------------------------------------------------------------------
const vendible = (f) => f && f.cotizable && f.precio_contado > 0;

function noVigente(datos) {
  const estado = (datos.config && datos.config.estadoLista) || 'SIN CARGAR';
  return estado === 'VIGENTE' ? null : { error: `La lista de precios está ${estado}: no pases ningún precio, escalá.` };
}

/** El stock de la app en vivo (08/10/2026): dónde está un equipo. Una fila de USADOS es del local; una de LISTA, del depósito. */
const dondeEsta = (f) => (f.origen === 'USADOS' ? 'local' : 'deposito');
/** "iPhone 13 128GB" (para el 🚨 del depósito). */
const nombreDeEquipo = (e) => [e.modelo, e.capacidad_gb ? `${e.capacidad_gb}GB` : null].filter(Boolean).join(' ');

function comoEquipo(f) {
  return {
    modelo: f.modelo,
    capacidad_gb: f.capacidad_gb || null,
    bateria: cotizador.bateriaDe(f) || null,
    ...(f.origen === 'USADOS'
      ? { unidad_puntual: true, color: f.color || null, detalles: f.detalles || null }
      : { condicion: f.condicion || null }),
    precio_contado: f.precio_contado,
    entrega_minima: f.anticipo_min || null,
    // Solo con el stock de la app en vivo: con apagado o sombra, el equipo es el de siempre.
    ...(stockEnVivo() ? { donde: dondeEsta(f), ...(f.solo_contado === true ? { solo_contado: true } : {}) } : {}),
  };
}

/**
 * Con el stock de la app en vivo: los del local primero (sin cambiar el orden dentro de cada grupo) y, si
 * hay alguno del depósito, la frase que el código pone donde Sonnet escriba `[deposito]` (queda en
 * `turno.deposito` para la guardia). Con apagado o sombra, `equipos` tal cual.
 */
function conLocalPrimero(equipos, turno, ahora = Date.now()) {
  if (!stockEnVivo()) return { equipos };
  const local = equipos.filter((e) => e.donde === 'local');
  const deposito = equipos.filter((e) => e.donde !== 'local');
  if (!deposito.length) return { equipos: local };
  const frase = stockApp.fraseDeposito(ahora);
  turno.deposito = frase;
  turno.depositoEquipo = turno.depositoEquipo || nombreDeEquipo(deposito[0]);
  // 12/10/2026 (decisión de Tomás): lo del depósito se ofrece como cualquier otro (precio, cuotas, turno) y recién
  // cuando lo quiere va [deposito], con la frase y el 🚨 al grupo.
  const alCerrar =
    'No digas dónde está: ofrecelo como cualquier otro (precio, cuotas, turno). Recién cuando lo quiere (elige una opción, acepta o pide turno), poné [deposito] en esa respuesta y después preguntale el día y el horario: el sistema pone la frase y avisa al grupo.';
  return {
    equipos: [...local, ...deposito],
    frase_deposito: frase,
    nota: local.length
      ? 'Local primero: ofrecé los del local; los del depósito solo si pide algo que en el local no hay. Si ofrecés uno del depósito: ' + alCerrar
      : 'Este modelo no está en el local, está en el depósito: ' + alCerrar,
  };
}

/**
 * Lo que dejaron las herramientas en un turno: los montos que se pueden escribir (la guardia), y
 * para la fase 2 los equipos con su precio (`precios`: qué modelos se le mostraron), los modelos
 * que devolvió `buscar_equipos` y cada `cotizar` que corrió. `entregasDistintas` (bloque Ninjo 1):
 * los `cotizar` en que lo que leyó el código de `entrega_texto` no coincidió con la `entrega` de
 * Sonnet, para el registro. `insistencias` (entrega baja, 06/10/2026): cuántas veces se le dijo la
 * entrega inicial de cada modelo (`insistenciaEntrega` del estado, leído por `pensar` antes del
 * primer await): `cotizar` decide con eso el paso 3, no Sonnet.
 */
// `fotos` (08/10/2026): lo que dejó `mandar_fotos` ({ elegidas, sinFoto, modelosSinFoto, deposito, frase }), y
// `unidadDelChat`, el código de la unidad del local que ya se cotizó en el chat (del estado): su foto va primera; si
// no hay, `modeloDelChat` (el modelo del estado) va adelante de los otros modelos pedidos.
const turnoEnCero = () => ({ montos: [], precios: [], buscados: [], cotizaciones: [], entregasDistintas: [], bloques: [], lista: null, insistencias: {}, deposito: null, depositoEquipo: null, fotos: null, unidadDelChat: null, modeloDelChat: null, ahora: Date.now() });

/**
 * "iPhone 15 Pro Max" → { numero: 15, variante: 'pro max' }; "16e" → { numero: 16, variante: 'e' }.
 * null si no es un número de dos cifras con una variante conocida.
 */
const VARIANTES = { mini: 0, e: 1, '': 2, plus: 3, pro: 4, 'pro max': 5 };
function partesDelModelo(texto) {
  const t = sheets.normalizar(texto).replace(/\b(?:iphone|ip)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const m = t.match(/^(\d{2})\s*(pro\s*max|pro|plus|max|mini|e)?$/);
  if (!m) return null;
  const v = (m[2] || '').replace(/\s+/g, ' ');
  return { numero: Number(m[1]), variante: v === 'max' || v === 'promax' ? 'pro max' : v };
}

/**
 * Los parecidos de un modelo del 11 al 18 que no está en la planilla (bloque Ninjo 1b, decisión de
 * Tomás del 05/10/2026: "justo ese no me esta quedando, tengo el X" en lugar de escalar y callar): el
 * mismo número con otra variante (la más cercana primero); si no hay, el número de abajo y el de
 * arriba, con la misma variante si está. Hasta 2, uno por modelo (el más barato de cada uno). Desde el 08/10/2026,
 * si el cliente ya dijo con cuánto cuenta, Sonnet cotiza el primero (`cotizar` con su modelo y su capacidad da esa
 * misma fila: `buscarTodas` ordena por precio).
 */
function parecidosA(filas, modelo) {
  const p = partesDelModelo(modelo);
  if (!p || p.numero < 11 || p.numero > 18) return [];
  const uno = new Map();
  for (const f of filas.filter(vendible)) {
    const q = partesDelModelo(f.modelo);
    if (!q) continue;
    const previo = uno.get(f.modelo);
    if (!previo || f.precio_contado < previo.f.precio_contado) uno.set(f.modelo, { f, q });
  }
  const todos = [...uno.values()];
  const distancia = (x) => Math.abs(VARIANTES[x.q.variante] - VARIANTES[p.variante]);
  const mismoNumero = todos
    .filter((x) => x.q.numero === p.numero && x.q.variante !== p.variante)
    .sort((a, b) => distancia(a) - distancia(b) || a.f.precio_contado - b.f.precio_contado);
  if (mismoNumero.length) return mismoNumero.slice(0, 2).map((x) => x.f);
  const vecinos = [];
  for (const n of [p.numero - 1, p.numero + 1]) {
    const deEse = todos.filter((x) => x.q.numero === n).sort((a, b) => distancia(a) - distancia(b) || a.f.precio_contado - b.f.precio_contado);
    if (deEse.length) vecinos.push(deEse[0].f);
  }
  return vecinos.slice(0, 2);
}

/** Con una lista de usados elegida (#bateria) que se pudo leer: la planilla con las filas de LISTA que tapó. */
const conAl100 = (datos) => Boolean(sheets.listaBateriaActiva()) && Array.isArray(datos.listaAl100);

/**
 * `desde` (12/10/2026, decisión de Tomás, prueba en vivo: "el 13" mostraba el de 100% y el de 89%): con el stock de la
 * app en vivo y más de un precio, el más barato (del local, si hay del local) para arrancar por ahí ("el 13 lo tenemos
 * desde $465.000 de contado"). Con un solo precio, o apagado o en sombra, nada.
 */
function desdeDe(equipos) {
  if (!stockEnVivo() || !equipos.length) return {};
  const local = equipos.filter((e) => e.donde === 'local');
  const pool = local.length ? local : equipos;
  if (new Set(pool.map((e) => e.precio_contado)).size < 2) return {};
  const barato = pool.reduce((a, b) => (b.precio_contado < a.precio_contado ? b : a));
  return { desde: { modelo: barato.modelo, precio_contado: barato.precio_contado } };
}

async function buscarEquipos(input, turno) {
  const datos = await responder.leerPlanilla();
  const vencida = noVigente(datos);
  if (vencida) return vencida;
  const modelo = String((input && input.modelo) || '').trim();
  const capacidad = Number(input && input.capacidad) > 0 ? Number(input.capacidad) : null;
  const filas = modelo ? sheets.buscarTodas(datos, modelo, capacidad) : [...(datos.lista || []), ...(datos.usados || [])];
  const equipos = filas.filter(vendible).map(comoEquipo);
  const anotar = (e) => {
    turno.montos.push(e.precio_contado, e.entrega_minima);
    turno.precios.push({ modelo: e.modelo, precio: e.precio_contado });
  };
  for (const e of equipos) {
    anotar(e);
    turno.buscados.push({ modelo: e.modelo, capacidad_gb: e.capacidad_gb });
  }
  if (!equipos.length) {
    if (!modelo) return { equipos: [], nota: 'No hay equipos para vender en la planilla.' };
    const parecidos = parecidosA([...(datos.lista || []), ...(datos.usados || [])], modelo).map((f) => ({
      modelo: f.modelo,
      capacidad_gb: f.capacidad_gb || null,
      bateria: cotizador.bateriaDe(f) || null,
      precio_contado: f.precio_contado,
    }));
    for (const e of parecidos) {
      turno.montos.push(e.precio_contado);
      turno.precios.push({ modelo: e.modelo, precio: e.precio_contado });
    }
    return { equipos: [], nota: `No hay ningún ${modelo} para vender en la planilla.`, ...(parecidos.length ? { parecidos } : {}) };
  }
  // El stock de la app en vivo (08/10/2026): los del local primero y la frase del depósito.
  const salida = { ...conLocalPrimero(equipos, turno, turno.ahora), ...desdeDe(equipos) };
  // Bloque Ninjo 1b (decisión de Tomás del 05/10/2026): con #bateria, también los de LISTA (al 100%).
  if (conAl100(datos)) {
    const deLista = { lista: datos.listaAl100, usados: [] };
    const al100 = (modelo ? sheets.buscarTodas(deLista, modelo, capacidad) : datos.listaAl100).filter(vendible).map(comoEquipo);
    for (const e of al100) anotar(e);
    // Los de al 100% también son del depósito: pasan por lo mismo (`turno.deposito` y la frase).
    const al100Salida = conLocalPrimero(al100, turno, turno.ahora);
    return { ...salida, ...(!salida.frase_deposito && al100Salida.frase_deposito ? { frase_deposito: al100Salida.frase_deposito } : {}), al_100: al100Salida.equipos };
  }
  return salida;
}

/**
 * La lista del local (decisión de Tomás del 08/10/2026, …3557: "primero se liquida nuestro stock"), solo con el stock
 * de la app en vivo: las unidades vendibles de USADOS (las del local, que escribe stock-app.js), sin repetir: una línea
 * por modelo, capacidad, batería y precio, con el formato de la lista de siempre (`responder.lineaDePrecio`) sin el
 * color ni el detalle de cada unidad ("Ip 13 128gb 77% 480.000": los tres 13 al 77% a $480.000 son una línea). Por
 * modelo (del 11 al 18 y, en cada número, común, Plus, Pro y Pro Max: `partesDelModelo`; el "e" y el mini, antes del
 * común), capacidad, precio y, a igual precio, batería; los sellados aparte, como en `listaDePreciosPartida`. Nada de LISTA: lo del depósito entra solo por `buscar_equipos`.
 * Sin nada vendible en el local (la vista de la app vacía, o USADOS vacía), null: va la lista de siempre.
 * Devuelve { usados, sellados, filas } (`filas`, una por línea, para la guardia).
 */
function listaDelLocal(datos) {
  const delLocal = (datos.usados || []).filter(vendible);
  if (!delLocal.length) return null;
  const linea = (f) => responder.lineaDePrecio({ ...f, color: '', detalles: '' });
  const unaPorLinea = new Map();
  for (const f of delLocal) if (!unaPorLinea.has(linea(f))) unaPorLinea.set(linea(f), f);
  const posicion = (f) => {
    const p = partesDelModelo(f.modelo);
    return p ? [p.numero, VARIANTES[p.variante]] : [Number.MAX_SAFE_INTEGER, 0];
  };
  const filas = [...unaPorLinea.values()].sort((a, b) => {
    const [na, va] = posicion(a);
    const [nb, vb] = posicion(b);
    // A igual precio, la batería más baja primero (dos 16 de 128GB a $1.000.000, al 89% y al 92%): siempre el mismo orden.
    return (
      na - nb ||
      va - vb ||
      String(a.modelo).localeCompare(String(b.modelo)) ||
      (a.capacidad_gb || 0) - (b.capacidad_gb || 0) ||
      a.precio_contado - b.precio_contado ||
      (a.bateria_min || 0) - (b.bateria_min || 0)
    );
  });
  const de = (sellado) => filas.filter((f) => cotizador.esSellado(f) === sellado).map(linea).join('\n');
  return { usados: de(false), sellados: de(true), filas };
}

async function listaDePrecios(turno) {
  const datos = await responder.leerPlanilla();
  const vencida = noVigente(datos);
  if (vencida) return vencida;
  // Con el stock de la app en vivo y algo en el local, la lista es la del local (08/10/2026); la guardia anota sus precios.
  const delLocal = stockEnVivo() ? listaDelLocal(datos) : null;
  if (delLocal) {
    for (const f of delLocal.filas) {
      turno.montos.push(f.precio_contado);
      turno.precios.push({ modelo: f.modelo, precio: f.precio_contado });
    }
    turno.lista = { usados: delLocal.usados, sellados: delLocal.sellados };
    return {
      ...turno.lista,
      nota: 'Es la lista del local. Lo del depósito no está acá: ofrecelo solo si pide un modelo que no está en esta lista (buscar_equipos y [deposito]).',
    };
  }
  for (const f of (datos.lista || []).filter(vendible)) {
    turno.montos.push(f.precio_contado);
    turno.precios.push({ modelo: f.modelo, precio: f.precio_contado });
  }
  // Bloque Ninjo 1b: partida en usados y sellados; `[lista]` las manda en dos mensajes tal cual.
  turno.lista = responder.listaDePreciosPartida(datos);
  return { ...turno.lista };
}

/**
 * La entrega de la frase del cliente (`entrega_texto`), leída por el código con lo mismo que usa
 * `decidir`, sin tocar extractor-local.js (bloque Ninjo 1, 05/10/2026: "No hacés cuentas" le
 * prohibía a Sonnet sumar "180 en efectivo y 120 por transferencia", y el resultado dependía de cómo
 * lo leyera):
 *   - un monto en dólares no es una entrega en pesos: { error } ("monto en dólares: escalá");
 *   - después, la corrección ("perdón, 500": gana el último), la entrega partida (se suma) y el
 *     monto de siempre (`extraerMonto`: "medio palo", "500k", "tengo 400 y me estiro a 550" da el
 *     piso); si la frase es un número solo ("500"), `montoSuelto`;
 *   - un número chico (menor a 100, sin "mil", "k", "lucas" ni "palo") nunca es una entrega, lea lo
 *     que lea el código o lo que haya pasado Sonnet (`deSonnet`): { error } y no se cotiza.
 * Devuelve { monto } (null si no leyó nada) o { error }.
 *
 * "1.5 palos" no lo lee el código: `extraerMonto` agarra el 5 y da $5.000.000 (también en `decidir`).
 * Hasta que se arregle el extractor, con esa frase queda la entrega de Sonnet, como antes del bloque.
 */
const PALOS_CON_DECIMALES = /\d[.,]\d+\s*palos?\b/i;

/**
 * Lo que en la frase del cliente es un número del equipo y no plata (prueba en vivo del 1b, 06/10/2026:
 * "quiero el de 85-93, tengo 250" leía el 85 como $85.000 y daba "no es una entrega"; "el de al 100,
 * tengo 300" daba $100.000 y "el 13 pro max 256 tengo 600", $256.000). Se saca antes de leer el monto:
 *   - un rango de batería: dos números de hasta 100 con "-", "–", "—", "/" o "a" ("85-93", "80 - 95",
 *     "85 a 93");
 *   - un porcentaje ("100%", "87 %");
 *   - "al 100";
 *   - la capacidad: 64, 128, 256, 512 o 1024 con "gb", "g" o "gigas", o justo después del modelo
 *     ("13 128", "pro max 256", "plus 512").
 * Con "mil", "k", "lucas" o "palo" atrás es plata y no se toca ("tengo 50-60 mil", "al 100 mil").
 * Solo lo usa `entregaDelTexto`: el extractor (y `decidir`) quedan como estaban.
 */
const ES_PLATA = String.raw`(?!\s*(?:mil\b|k\b|lucas?\b|palos?\b|\.000))`;
const RANGO_DE_BATERIA = new RegExp(String.raw`\b(\d{2,3})(?:\s*[-–—/]\s*|\s+a\s+)(\d{2,3})\b` + ES_PLATA + String.raw`\s*%?`, 'g');
const PORCENTAJE = /\b\d{1,3}\s*%/g;
const AL_100 = new RegExp(String.raw`\bal\s+100\b` + ES_PLATA, 'gi');
const CAPACIDAD_CON_GB = /\b(?:64|128|256|512|1024)\s*(?:gb|g|gigas?)\b/gi;
const CAPACIDAD_DEL_MODELO = new RegExp(String.raw`\b(1[1-9]|pro|max|plus|mini|air)\s+(?:64|128|256|512|1024)\b` + ES_PLATA, 'gi');

function sinNumerosDelEquipo(texto) {
  return String(texto || '')
    .replace(RANGO_DE_BATERIA, (m, a, b) => (Number(a) <= 100 && Number(b) <= 100 ? ' ' : m))
    .replace(PORCENTAJE, ' ')
    .replace(AL_100, ' ')
    .replace(CAPACIDAD_CON_GB, ' ')
    .replace(CAPACIDAD_DEL_MODELO, '$1 ')
    .replace(/\s+/g, ' ')
    .trim();
}

function entregaDelTexto(texto, deSonnet) {
  const t = String(texto || '').trim();
  if (!t) return { monto: null };
  if (local.montoEnDolares(t)) return { error: 'monto en dólares: escalá.' };
  const limpio = sinNumerosDelEquipo(t);
  if (!limpio) return { monto: null };
  const monto = PALOS_CON_DECIMALES.test(limpio) ? null : local.extraerMonto(limpio) || local.montoSuelto(limpio) || null;
  if (local.numeroChicoSuelto(limpio) || local.entregaDeNumeroChico(limpio, monto || deSonnet)) {
    return {
      error:
        `"${t}" no es una entrega: un número menor a 100 sin "mil", "k", "lucas" ni "palo" no es plata. ` +
        'No cotices con eso: si no queda claro con cuánto cuenta, preguntale.',
    };
  }
  return { monto };
}

/**
 * Un equipo de la planilla como opción para el cliente (`con_entrega` de `que_me_alcanza`,
 * `con_esa_entrega` de `cotizar`): modelo, capacidad, batería, contado y entrega mínima.
 */
function comoOpcion(f) {
  return {
    modelo: f.modelo,
    capacidad_gb: f.capacidad_gb || null,
    bateria: cotizador.bateriaDe(f) || null,
    precio_contado: f.precio_contado,
    entrega_minima: f.anticipo_min || null,
  };
}

/** Los montos de esas filas valen para la guardia, y sus modelos cuentan como mostrados si el precio sale. */
function anotarOpciones(turno, filas) {
  for (const f of filas) {
    turno.montos.push(f.precio_contado, f.anticipo_min);
    turno.precios.push({ modelo: f.modelo, precio: f.precio_contado });
  }
}

/**
 * Los 2 equipos vendibles más caros que se retiran con `monto` de entrega inicial y valen más que
 * eso (el resto en cuotas), con el mínimo estricto y sin la excepción: acá el modelo lo elige el
 * código, como en `alternativaMasBarata` del bot de siempre. Es `con_entrega` de `que_me_alcanza` y,
 * desde el paso 3 de la entrega baja (06/10/2026), `con_esa_entrega` de `cotizar`; ahí `salvo` deja
 * afuera las filas del modelo que no llegó ("con esa entrega te podes llevar el 13" al que pidió el 13
 * sería un contrasentido).
 */
function losQueRetiraCon(filas, monto, { salvo = null } = {}) {
  return filas
    .filter(vendible)
    .filter((f) => f.anticipo_min > 0 && f.anticipo_min <= monto && f.precio_contado > monto && f.modelo !== salvo)
    .sort((a, b) => b.precio_contado - a.precio_contado)
    .slice(0, 2);
}

/**
 * Los 2 equipos vendibles más caros que se pagan enteros con `monto`: `de_contado` de `que_me_alcanza`
 * y, desde el 06/10/2026, del paso 3 de `cotizar` cuando `con_esa_entrega` viene vacío.
 */
function losQuePagaDeContado(filas, monto) {
  return filas
    .filter(vendible)
    .filter((f) => f.precio_contado <= monto)
    .sort((a, b) => b.precio_contado - a.precio_contado)
    .slice(0, 2);
}

/**
 * Cuántas veces se le dijo la entrega inicial de un modelo antes de que `cotizar` resuelva el paso 3
 * (decisión de Tomás del 06/10/2026, la regla de negocio/financiacion.md): las dos primeras veces va
 * la entrega inicial; a la tercera, la excepción o lo que sí se lleva.
 */
const INSISTENCIAS_PARA_EL_PASO_3 = 2;

/**
 * `cotizador.cotizar` con la config de la planilla. Nunca devuelve una resta (lo que falta, el
 * saldo): solo lo que se le puede decir al cliente.
 *
 * Bajo el mínimo (decisión de Tomás del 06/10/2026; hasta ahí Sonnet decía la entrega inicial dos veces
 * y a la tercera escalaba, porque `cotizar` daba `llega: false` también cuando el cotizador cotizaba
 * con la excepción). Lo decide el código con `turno.insistencias` (cuántas veces salió la entrega
 * inicial de ese modelo, del estado), no Sonnet:
 *   - con menos de 2 insistencias, `llega: false` con la entrega mínima, como siempre (también si el
 *     cotizador dio `bajoMinimo`: la excepción todavía no);
 *   - con 2 o más y le faltan hasta TOPE_BAJO_MINIMO (`bajoMinimo`): `llega: true`, `excepcion: true`,
 *     1 pago y 2 cuotas con los coeficientes de la excepción (67/75 en producción) y el bloque para
 *     `[cotizacion]`. El PDF sale con ese bloque si no salió, como con cualquier primer bloque;
 *   - con 2 o más y falta más (ENTREGA_BAJA): `llega: false` y `con_esa_entrega`, hasta 2 equipos de
 *     otro modelo que sí retira con esa entrega (`losQueRetiraCon`), los más caros primero; vacío si
 *     no hay ninguno (ahí Sonnet escala, como antes).
 * El contado nunca cambia y nunca sale lo que falta.
 *
 * La entrega (bloque Ninjo 1): si el código lee un monto en `entrega_texto` (`entregaDelTexto`),
 * cotiza con ese, aunque Sonnet haya pasado otro en `entrega`, y lo devuelve en `entrega_leida` (con
 * puntos); si no lee nada, con la `entrega` de Sonnet, como antes. Si no coinciden, quedan las dos
 * en `turno.entregasDistintas`.
 */
/** El equipo más barato que se financia (con entrega mínima y sin `solo_contado`), salvo `salvo`; null si no hay. */
function elMasBaratoFinanciable(filas, salvo = null) {
  const ok = filas.filter((f) => vendible(f) && f !== salvo && f.solo_contado !== true && Number(f.anticipo_min) > 0);
  return ok.length ? ok.reduce((a, b) => (b.precio_contado < a.precio_contado ? b : a)) : null;
}

async function cotizarEquipo(input, turno) {
  const datos = await responder.leerPlanilla();
  const vencida = noVigente(datos);
  if (vencida) return vencida;
  const deSonnet = Math.round(Number(input && input.entrega));
  const leida = entregaDelTexto(input && input.entrega_texto, deSonnet > 0 ? deSonnet : null);
  if (leida.error) return { error: leida.error };
  const entrega = leida.monto || deSonnet;
  if (!(entrega > 0)) return { error: 'La entrega tiene que ser un monto en pesos mayor a cero, sin puntos: 340000.' };
  const modelo = String((input && input.modelo) || '').trim();
  const capacidad = Number(input && input.capacidad) > 0 ? Number(input.capacidad) : null;
  // `al_100` (bloque Ninjo 1b): la fila de LISTA que tapó la lista de usados elegida (#bateria).
  const alCien = Boolean(input && input.al_100 === true);
  if (alCien && !conAl100(datos)) return { error: 'La lista activa ya es LISTA (al 100%): cotizá sin al_100.' };
  const deDonde = alCien ? { lista: datos.listaAl100, usados: [] } : datos;
  // Con el stock de la app en vivo, una unidad del local sin entrega mínima (`solo_contado`) no se cotiza con una
  // entrega si otra fila del mismo modelo se financia (decisión de Tomás del 08/10/2026, prueba en vivo: "el 13
  // con 450 mil?" agarraba el 13 al 77 % a $480.000, el más barato y solo de contado, y escalaba): va la más
  // barata que se financia (del local primero, como ordena `buscarTodas`). Si todas son solo de contado, la
  // primera, como antes (con la plata entera, de contado; con menos, SOLO_CONTADO).
  let candidatas = modelo ? sheets.buscarTodas(deDonde, modelo, capacidad).filter(vendible) : [];
  // `bateria` (12/10/2026, prueba en vivo: "el de 100" cotizaba el de 89%): si eligió uno por la batería, ese.
  const bateria = Number(input && input.bateria) > 0 ? Math.round(Number(input.bateria)) : null;
  if (bateria && candidatas.length) {
    const pct = (f) => parseInt(String(cotizador.bateriaDe(f) || ''), 10);
    const conEsa = candidatas.filter((f) => pct(f) === bateria);
    if (!conEsa.length) {
      const hay = [...new Set(candidatas.map((f) => cotizador.bateriaDe(f)).filter(Boolean))];
      return { error: `Del ${modelo} no hay al ${bateria}%: hay ${hay.join(', ') || 'otras baterías'}. Preguntale cuál quiere.` };
    }
    candidatas = conEsa;
  }
  const fila = candidatas.find((f) => f.solo_contado !== true) || candidatas[0] || null;
  if (!fila) return { error: alCien ? `Del ${modelo || 'equipo'} no hay al 100%.` : `No hay ningún ${modelo || 'equipo'} para vender en la planilla.` };
  if (leida.monto && leida.monto !== deSonnet) {
    turno.entregasDistintas.push({
      modelo: fila.modelo,
      entrega_texto: String(input.entrega_texto).trim(),
      entrega_sonnet: deSonnet > 0 ? deSonnet : null,
      entrega_leida: leida.monto,
    });
  }
  const cot = cotizador.cotizar(fila, entrega, datos.config);
  // 12/10/2026: cotizar un equipo del depósito también habilita [deposito] (va cuando lo quiere, que suele ser acá).
  let fraseDeposito = null;
  if (stockEnVivo() && dondeEsta(fila) === 'deposito') {
    fraseDeposito = stockApp.fraseDeposito(turno.ahora);
    turno.deposito = fraseDeposito;
    turno.depositoEquipo = nombreDeEquipo({ modelo: fila.modelo, capacidad_gb: fila.capacidad_gb });
  }
  const equipo = {
    modelo: fila.modelo,
    capacidad_gb: fila.capacidad_gb || null,
    bateria: cotizador.bateriaDe(fila) || null,
    entrega,
    ...(leida.monto ? { entrega_leida: cotizador.pesos(leida.monto) } : {}),
    ...(fraseDeposito ? { donde: 'deposito', frase_deposito: fraseDeposito } : {}),
  };
  turno.montos.push(entrega, fila.precio_contado, fila.anticipo_min);
  turno.precios.push({ modelo: fila.modelo, precio: fila.precio_contado });
  // Una unidad del local sin entrega mínima (el stock de la app en vivo, 08/10/2026): solo de contado.
  if (!cot.ok && cot.motivo === 'SOLO_CONTADO') {
    // No va a `turno.cotizaciones`: no es la entrega inicial que no llega (no suma `insistenciaEntrega`).
    // 12/10/2026 (decisión de Tomás, prueba en vivo: "el 12 en cuotas, tengo 150" escalaba callado): el más barato
    // que se financia, cotizado con esa entrega (`financiable`). Si no hay ninguno, escala como antes.
    const otra = elMasBaratoFinanciable([...(datos.lista || []), ...(datos.usados || [])], fila);
    const financiable = otra && !(input && input._sinFinanciable)
      ? await cotizarEquipo({ modelo: otra.modelo, capacidad: otra.capacidad_gb || undefined, entrega, entrega_texto: input && input.entrega_texto, _sinFinanciable: true }, turno)
      : null;
    if (financiable && !financiable.error) {
      const { nota: _nota, ...sinNota } = financiable;
      return {
        ...equipo,
        llega: false,
        solo_contado: true,
        precio_contado: cot.contado,
        financiable: sinNota,
        nota:
          'Este equipo se vende solo de contado (no tiene entrega mínima para financiarlo). Si paga de contado: el precio y las dos preguntas del turno. ' +
          'Si pide cuotas o una entrega: decile que ese es solo de contado y ofrecele `financiable`, el más barato que se financia, cotizado con su entrega: ' +
          'si llega, con un mensaje que sea exactamente [cotizacion]; si no llega, la entrega mínima con la que lo retira, sin decir cuánto le falta.',
      };
    }
    return {
      ...equipo,
      llega: false,
      solo_contado: true,
      precio_contado: cot.contado,
      nota: 'Este equipo se vende solo de contado (no tiene entrega mínima para financiarlo): si paga de contado, el precio y las dos preguntas del turno; si pide cuotas o una entrega para este equipo, escalá.',
    };
  }
  if (!cot.ok && cot.motivo !== 'ENTREGA_BAJA') return { error: 'Ese equipo no se puede cotizar: escalá.' };
  // `id` (08/10/2026): la unidad del local que se cotizó (el código de la app), para que su foto vaya primera.
  // `minima` (13/10/2026): la entrega mínima que se le dice si no llega, para la línea "Entrega" del 🔔 LEAD (`entregaAviso`).
  const cotizacion = { modelo: fila.modelo, capacidad_gb: fila.capacidad_gb || null, entrega, minima: fila.anticipo_min || null, id: fila.origen === 'USADOS' && fila.id ? String(fila.id) : null };
  const pasoTres = (Number(turno.insistencias[fila.modelo]) || 0) >= INSISTENCIAS_PARA_EL_PASO_3;
  if (!cot.ok || (cot.bajoMinimo && !pasoTres)) {
    turno.cotizaciones.push({ ...cotizacion, llega: false });
    const noLlega = { ...equipo, llega: false, entrega_minima: fila.anticipo_min, precio_contado: fila.precio_contado };
    if (!pasoTres) return noLlega;
    // Paso 3 con más del tope: lo que sí se lleva con esa entrega. Lo elige el código.
    const filas = [...(datos.lista || []), ...(datos.usados || [])];
    const conEsaEntrega = losQueRetiraCon(filas, entrega, { salvo: fila.modelo });
    anotarOpciones(turno, conEsaEntrega);
    if (conEsaEntrega.length) {
      return {
        ...noLlega,
        con_esa_entrega: conEsaEntrega.map(comoOpcion),
        nota: 'Ya se le dijo dos veces la entrega inicial: ofrecele lo que sí se lleva con esa entrega (el modelo y con qué entrega mínima lo retira), sin decir cuánto le falta.',
      };
    }
    // Paso 3 de contado (decisión de Tomás del 06/10/2026, prueba en vivo B: con 240 mil para el 13
    // escalaba, y con esa plata entraba el 11 de 128 de contado): si nada se retira con esa entrega,
    // lo que se paga entero con esa plata, como `de_contado` de `que_me_alcanza`.
    const deContado = losQuePagaDeContado(filas, entrega);
    anotarOpciones(turno, deContado);
    return {
      ...noLlega,
      con_esa_entrega: [],
      ...(deContado.length ? { de_contado: deContado.map(comoOpcion) } : {}),
      nota: deContado.length
        ? 'Ya se le dijo dos veces la entrega inicial y con esa entrega no retira nada, pero con esa plata se lleva otro equipo de contado: ofrecéselo de contado (el modelo y su precio de contado), sin cuotas, sin decir cuánto le falta, y preguntale si le interesa.'
        : 'Ya se le dijo dos veces la entrega inicial y con esa entrega no se lleva nada: escalá.',
    };
  }
  turno.cotizaciones.push({ ...cotizacion, llega: true });
  if (cot.soloContado) return { ...equipo, llega: true, paga_de_contado: true, precio_contado: cot.contado };
  turno.montos.push(cot.pagoUnico, cot.cuotaDe2);
  // El bloque que va donde Sonnet escriba [cotizacion] (bloque Ninjo 1b). Uno por equipo y entrega
  // (el último que se pidió), hasta 3.
  const texto = cotizador.bloqueSonnet(fila, cot);
  turno.bloques = [...turno.bloques.filter((b) => b.texto !== texto), { modelo: fila.modelo, texto }].slice(-3);
  // Paso 3 con la excepción: los montos ya son los de la excepción (cotizador.cotizar, `bajoMinimo`).
  // Sonnet no nombra el recargo ni cuánto falta: solo que está cerca y le hace una excepción.
  const excepcion = Boolean(cot.bajoMinimo);
  return {
    ...equipo,
    llega: true,
    ...(excepcion ? { excepcion: true } : {}),
    un_pago: cot.pagoUnico,
    dos_cuotas_de: cot.cuotaDe2,
    precio_contado: cot.contado,
    nota: excepcion
      ? 'Ya se le dijo dos veces la entrega inicial y está cerca: se cotiza igual, como una excepción. Antes de [cotizacion], que con esa entrega se queda cerca y le hacés una excepción, sin nombrar recargo, porcentajes ni cuánto le falta.'
      : 'Para pasarle 1 pago y 2 cuotas, un mensaje que sea exactamente [cotizacion]: los números los escribe el sistema.',
  };
}

/**
 * `que_me_alcanza` (bloque Ninjo 1b, decisión de Tomás del 05/10/2026: a "q iphone me alcanza con
 * 750.000" se le pasaban precios de contado). El monto lo lee el código de `monto_texto`, como la
 * entrega de `cotizar` (`entregaDelTexto`: los dólares y los números chicos dan error). Devuelve los
 * equipos vendibles de la planilla en dos listas: `de_contado`, los 2 más caros que paga enteros con
 * ese monto, y `con_entrega`, los 2 más caros que retira con ese monto de entrega inicial y valen más.
 * El monto leído también se puede escribir (la guardia).
 */
async function queMeAlcanza(input, turno) {
  const datos = await responder.leerPlanilla();
  const vencida = noVigente(datos);
  if (vencida) return vencida;
  const texto = String((input && input.monto_texto) || '').trim();
  const leida = entregaDelTexto(texto, null);
  if (leida.error) return { error: leida.error };
  if (!(leida.monto > 0)) return { error: `No leí ningún monto en "${texto}": preguntale con cuánto cuenta.` };
  const monto = leida.monto;
  const filas = [...(datos.lista || []), ...(datos.usados || [])].filter(vendible);
  const deContado = losQuePagaDeContado(filas, monto);
  const conEntrega = losQueRetiraCon(filas, monto);
  turno.montos.push(monto);
  anotarOpciones(turno, [...deContado, ...conEntrega]);
  return { monto_leido: cotizador.pesos(monto), de_contado: deContado.map(comoOpcion), con_entrega: conEntrega.map(comoOpcion) };
}

/** Modelos por pedido de fotos, como mucho (en 3 fotos no entran más; los que sobran se devuelven en `sin_mirar`). */
const MAX_MODELOS_FOTOS = 6;

/**
 * `mandar_fotos` (08/10/2026, decisiones de Tomás; solo con el stock de la app en vivo). Por cada modelo que pidió,
 * las unidades del local (USADOS, con código y color) de ese modelo (y capacidad, si la dijo): fotos-equipos.js
 * elige una foto por unidad, la que ya se cotizó en el chat primera (`id` del último `cotizar` de esta respuesta,
 * o `unidadCotizada` del estado; su modelo, adelante de los otros) y después las más baratas, hasta 3 en total,
 * con su pie; si no se sabe de qué unidad se habló, el modelo del chat (el del estado) va adelante de los otros
 * modelos pedidos. Un modelo que no está en el local pero sí en LISTA es del depósito: sin foto, la frase con el
 * día para `[fotos_deposito]`. Una unidad sin color cargado o sin foto de ese color queda en `sin_foto`; si de un
 * modelo no va ninguna, el código escala por ese después de mandar las otras (`pensar`). Los precios de las
 * unidades valen para la guardia.
 */
async function mandarFotos(input, turno) {
  const datos = await responder.leerPlanilla();
  const vencida = noVigente(datos);
  if (vencida) return vencida;
  const todosLosPedidos = [...new Set((Array.isArray(input && input.modelos) ? input.modelos : []).map((m) => String(m == null ? '' : m).trim()).filter(Boolean))];
  const pedidos = todosLosPedidos.slice(0, MAX_MODELOS_FOTOS);
  const sinMirar = todosLosPedidos.slice(MAX_MODELOS_FOTOS);
  if (!pedidos.length) return { error: 'mandar_fotos necesita `modelos`: de qué modelos pidió fotos ("15", "13 pro").' };
  const capacidad = Number(input && input.capacidad) > 0 ? Number(input.capacidad) : null;
  const porModelo = [];
  const deposito = [];
  const noHay = [];
  for (const pedido of pedidos) {
    const filas = sheets.buscarTodas(datos, pedido, capacidad).filter(vendible);
    const local = filas.filter((f) => f.origen === 'USADOS');
    if (local.length) porModelo.push({ modelo: local[0].modelo, unidades: local });
    else if (filas.length) deposito.push(filas[0].modelo);
    else noHay.push(pedido);
  }
  for (const u of porModelo.flatMap((p) => p.unidades)) {
    turno.montos.push(u.precio_contado);
    turno.precios.push({ modelo: u.modelo, precio: u.precio_contado });
    turno.buscados.push({ modelo: u.modelo, capacidad_gb: u.capacidad_gb });
  }
  const ultima = turno.cotizaciones[turno.cotizaciones.length - 1];
  const primero = (ultima && ultima.id) || turno.unidadDelChat || null;
  const eleccion = fotosEquipos.elegirFotos(porModelo, { primero, modeloPrimero: turno.modeloDelChat, tope: fotosEquipos.TOPE });
  const frase = deposito.length ? fotosEquipos.fraseFotosDeposito(deposito, { ahora: turno.ahora, unoSolo: pedidos.length === 1 }) : null;
  turno.fotos = { elegidas: eleccion.fotos, sinFoto: eleccion.sinFoto, modelosSinFoto: eleccion.modelosSinFoto, deposito, frase };
  // 12/10/2026: también las unidades sin foto de un modelo que sí tiene (van las otras + la frase del color).
  const sinFoto = eleccion.sinFoto
    .map((u) => ({ modelo: u.modelo, codigo: u.codigo, motivo: u.motivo === 'sin color' ? 'sin color cargado' : `no hay foto del ${u.modelo} ${String(u.color).toLowerCase()}` }));
  const hayAlgoQueMandar = eleccion.fotos.length > 0 || deposito.length > 0;
  return {
    fotos: eleccion.fotos.map((f) => ({
      modelo: f.modelo,
      capacidad_gb: f.capacidad_gb,
      bateria: f.bateria,
      color: f.color,
      precio_contado: f.precio_contado,
      pie: f.pie,
      en_la_foto: f.total > 1 ? fotosEquipos.lugarEnLaFoto(f.posicion, f.total) : 'sola',
    })),
    ...(eleccion.fotos.length
      ? {
          nota:
            `Van ${eleccion.fotos.length === 1 ? 'una foto' : `${eleccion.fotos.length} fotos`}, cada una con su pie (lo escribe el sistema: no lo repitas ni describas la foto). ` +
            'Terminá con responder: un mensaje que sea exactamente [fotos], que el sistema cambia por las fotos; como mucho un texto corto tuyo, o ninguno ' +
            '(cada foto cuenta para el tope de 4 mensajes, y el saludo del sistema también).',
        }
      : {}),
    ...(deposito.length
      ? {
          deposito,
          frase_deposito: frase,
          nota_deposito:
            'Estos modelos no están en el local sino en el depósito: no hay foto. Decilo con [fotos_deposito] (un mensaje que sea exactamente eso, o adentro de uno): ' +
            'el sistema pone la frase con el día y avisa al grupo. Seguís atendiendo, no escalás por esto.',
        }
      : {}),
    ...(sinFoto.length
      ? {
          sin_foto: sinFoto,
          nota_sin_foto: hayAlgoQueMandar
            ? 'De estos equipos del local no hay foto: respondé igual (con [fotos] o [fotos_deposito]). Si de ese modelo van otras fotos, el sistema agrega la frase del color y avisa al grupo; si de un modelo no va ninguna, el sistema escala por él después de mandar lo demás, con el código del equipo.'
            : 'No hay foto de ningún equipo que pidió: llamá a escalar, con el motivo ("pide fotos del 14 y no tiene color cargado").',
        }
      : {}),
    ...(noHay.length ? { no_hay: noHay, nota_no_hay: 'Estos modelos no están ni en el local ni en el depósito: contestá como en *Modelos* (buscar_equipos te da los parecidos).' } : {}),
    ...(sinMirar.length ? { sin_mirar: sinMirar, nota_sin_mirar: `Pidió más de ${MAX_MODELOS_FOTOS} modelos: de estos no se buscó nada (en 3 fotos no entran). Si hace falta, otra vuelta.` } : {}),
  };
}

/** El tool_result de un tool_use de datos. Un error de la herramienta vuelve como is_error. */
async function resultadoDe(bloque, turno) {
  let r;
  try {
    if (bloque.name === 'buscar_equipos') r = await buscarEquipos(bloque.input, turno);
    else if (bloque.name === 'lista_de_precios') r = await listaDePrecios(turno);
    else if (bloque.name === 'cotizar') r = await cotizarEquipo(bloque.input, turno);
    else if (bloque.name === 'que_me_alcanza') r = await queMeAlcanza(bloque.input, turno);
    // Las fotos de los equipos (08/10/2026): solo con el stock de la app en vivo; con apagado o sombra no existe.
    else if (bloque.name === 'mandar_fotos' && stockEnVivo()) r = await mandarFotos(bloque.input, turno);
    else r = { error: `No existe la herramienta ${bloque.name}.` };
  } catch (e) {
    r = { error: `No pude leer la planilla (${e.message}): escalá.` };
  }
  return { type: 'tool_result', tool_use_id: bloque.id, content: JSON.stringify(r), ...(r && r.error ? { is_error: true } : {}) };
}

// ---------------------------------------------------------------------------
// El pedido
// ---------------------------------------------------------------------------
const DIAS = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'];
const HORA_ARGENTINA = new Intl.DateTimeFormat('en-CA', {
  timeZone: ZONA,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** "jueves 02/10/2026 15:30", la hora de Neuquén (la de Argentina). */
function fechaYHora(ts) {
  const p = Object.fromEntries(HORA_ARGENTINA.formatToParts(new Date(ts)).map((x) => [x.type, x.value]));
  const dos = (v) => String(v).padStart(2, '0');
  const dia = DIAS[new Date(`${p.year}-${dos(p.month)}-${dos(p.day)}T12:00:00Z`).getUTCDay()];
  return `${dia} ${dos(p.day)}/${dos(p.month)}/${p.year} ${dos(p.hour)}:${dos(p.minute)}`;
}

/** "hace 40 min", "hace 20 h", "hace 3 días" (como gemini.js). */
function haceCuanto(ts, ahora) {
  if (!Number(ts)) return 'sin hora';
  const min = Math.max(0, Math.round((ahora - ts) / 60000));
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

/**
 * Lo que el estado ya sabe del chat, en renglones. `ahora`: la hora del pedido (el canje anotado vale 72 h).
 *
 * El canje que anotó Sonnet en la ficha (decisión de Tomás del 07/10/2026): `canjeFicha`, que guarda `contestar`,
 * va como "canje que anotaste antes" mientras tenga menos de CANJE_MARCA_HORAS (72 h, la ventana de la marca de
 * canje). Es lo que vio en la captura de una tanda anterior, que no se vuelve a mandar: cuenta como dato dado.
 */
function loQueSabe(s, nombre, ahora = Date.now()) {
  const out = [];
  if (s.modelo) out.push(`modelo que eligió: ${s.modelo}${s.capacidad_gb ? ` ${s.capacidad_gb}GB` : ''}`);
  const vistos = [...new Set([...(s.preciosMostradosDe || []), ...(s.modelosPedidos || [])])].filter((m) => m && m !== s.modelo);
  if (vistos.length) out.push(`otros modelos que vio o preguntó: ${vistos.join(', ')}`);
  if (s.entrega) out.push(`con cuánto dijo que cuenta para la entrega: ${cotizador.pesos(s.entrega)}`);
  if (s.entregaDolares) out.push(`dijo un monto en dólares: US$${s.entregaDolares}`);
  if (s.forma_pago) out.push(`forma de pago que dijo: ${s.forma_pago}`);
  const p = s.permuta;
  if (p && p.ofrece) {
    const datos = [p.modelo, p.capacidad_gb ? `${p.capacidad_gb}GB` : null, p.bateria ? `batería ${p.bateria}%` : null, p.tiene_fotos ? 'mandó fotos' : null];
    out.push(`canje en curso: ${datos.filter(Boolean).join(', ') || 'todavía sin datos de su equipo'}`);
  }
  const anotado = gemini.notaSegura(canjeAnotado(s, ahora), nombre);
  if (anotado) out.push(`canje que anotaste antes: "${anotado}"`);
  const insistencias = Object.entries(s.insistenciaEntrega || {}).filter(([, n]) => n > 0);
  if (insistencias.length) out.push(`veces que se le dijo la entrega inicial: ${insistencias.map(([m, n]) => `${m}, ${n}`).join('; ')}`);
  const temas = Object.keys(s.temasExplicados || {});
  if (temas.length) out.push(`ya se le explicó: ${temas.join(', ')}`);
  // Desde el bloque Ninjo 1b el PDF del compromiso lo decide el código (sale con el primer bloque de
  // la cotización): el pedido ya no dice si salió.
  if (s.listaEnviada) out.push('ya se le pasó la lista de precios');
  const notas = (s.notas || []).map((n) => gemini.notaSegura(n, nombre)).filter(Boolean);
  if (notas.length) out.push(`contó: ${notas.join('; ')}`);
  if (s.resultado && s.resultado.tipo) out.push(`el chat está marcado como ${s.resultado.tipo === 'vendido' ? 'venta cerrada' : s.resultado.tipo}`);
  if (s.escalado) out.push('el chat está escalado a una persona');
  return out;
}

/** "una foto", "2 fotos". */
const unaOVarias = (n) => (n === 1 ? 'una foto' : `${n} fotos`);

/**
 * Lo que dice el pedido de las fotos de ahora (decisión de Tomás del 06/10/2026): `mandadas`, las de la
 * tanda; `vistas`, las que van al pedido (de las últimas 3: fotos-del-cliente.js); `sinVer`, las de esas
 * que no se pudieron ver. "mandó 5 fotos, ves las últimas 3 (van después de este texto).", "mandó una
 * foto que no se pudo ver: de esa foto no das nada por hecho."
 */
function textoDeFotos({ mandadas = 0, vistas = 0, sinVer = 0 } = {}) {
  const intentadas = vistas + sinVer;
  if (!vistas) {
    if (mandadas === 1) return 'mandó una foto que no se pudo ver: de esa foto no das nada por hecho.';
    const deCuales = intentadas < mandadas ? ` de las últimas ${intentadas}` : '';
    return `mandó ${mandadas} fotos y no se pudo ver ninguna${deCuales}: de esas fotos no das nada por hecho.`;
  }
  let t = `mandó ${unaOVarias(mandadas)}`;
  if (intentadas < mandadas) t += sinVer ? `, de las últimas ${intentadas} ves ${vistas}` : `, ves las últimas ${vistas}`;
  else if (sinVer) t += `, ves ${vistas}`;
  t += ` (${vistas === 1 ? 'va' : 'van'} después de este texto)`;
  if (sinVer) t += `; ${sinVer === 1 ? 'una no se pudo ver: de esa' : `${sinVer} no se pudieron ver: de esas`} no das nada por hecho`;
  return t + '.';
}

/**
 * El texto del pedido, armado por el código: la fecha de Neuquén, la lista de usados activa, lo que
 * sabe el estado, las líneas de una persona de la cuenta, las últimas 30 líneas del historial
 * marcadas y con hace cuánto, y la tanda. Sin el número del cliente; el nombre, tapado como en
 * gemini.js (`sinDatosPersonales`).
 *
 * Devuelve { texto, leidos }: `leidos` son las líneas del historial que van en el pedido
 * (`historial`, con la tanda, que index.js ya agregó) y las de una persona de la cuenta que van
 * aparte (`persona`). Es lo que dice el aviso "leí N mensajes" de la fase 2.
 *
 * Las etiquetas (bloque Ninjo 1, 05/10/2026): lo que ya contestó el bot (el de siempre o Sonnet) va
 * como "Vos (antes)", no "Bot"; una línea del cliente que vino por audio, "Cliente (audio)". Con
 * `audio` (lo de ahora vino por audio), el pedido lo dice: la transcripción puede tener errores.
 *
 * Bloque Ninjo 1b: `leidos.evolution` cuenta las líneas del historial del pedido que trajo
 * contexto.js de Evolution; con #bateria, el pedido dice las dos listas de usados.
 *
 * Las fotos (decisión de Tomás del 06/10/2026): con `fotos` ({ mandadas, vistas, sinVer }), el pedido
 * dice cuántas mandó con lo de ahora y cuántas ve (`textoDeFotos`); una tanda de solo fotos va como
 * "(mandó 2 fotos, sin texto)". Las imágenes van aparte, después de este texto (`pensar`).
 */
function armarContexto(s, mensaje, nombre, ahora, hasta = null, { audio = false, fotos = null } = {}) {
  const limpio = (t) => gemini.sinDatosPersonales(String(t || ''), nombre);
  const quien = contexto.etiqueta;
  // `hasta` (sombra con persona, 03/10/2026): solo lo que había hasta la última línea del cliente
  // de la tanda. Lo que escribió la persona después no entra: es lo que se quiere comparar.
  const antes = (l) => hasta == null || (Number(l && l.ts) || 0) <= hasta;
  const historial = (s.historial || []).filter(antes).slice(-state.LARGO_HISTORIAL);
  const persona = state.lineasDePersona(s).filter(antes);
  const bateria = sheets.listaBateriaActiva();
  const sabe = loQueSabe(s, nombre, ahora);
  const mandadas = (fotos && fotos.mandadas) || 0;
  const escribio = String(mensaje || '').trim() || !mandadas ? limpio(mensaje) : `(mandó ${unaOVarias(mandadas)}, sin texto)`;
  const texto = [
    `Fecha y hora en Neuquén: ${fechaYHora(ahora)}`,
    bateria
      ? `Listas de usados: la activa (#bateria) es LISTA ${bateria}. También podés ofrecer la de LISTA (al 100%)`
      : 'Lista de usados activa (#bateria): LISTA (usados al 100%)',
    // El stock de la app en vivo (08/10/2026): la sección *El local y el depósito* de las reglas corre.
    ...(stockEnVivo() ? ['Stock: del local y del depósito (cada equipo de buscar_equipos trae `donde`; ver *El local y el depósito*)'] : []),
    '',
    'Lo que el sistema ya sabe de este chat:',
    ...(sabe.length ? sabe.map((l) => `- ${l}`) : ['- nada todavía']),
    '',
    'Lo último que escribió una persona de la cuenta (no el bot), de lo más viejo a lo más nuevo:',
    ...(persona.length
      ? persona.map((l) => `- ${haceCuanto(l.ts, ahora)}: "${limpio(l.texto).replace(/\s+/g, ' ').trim()}"`)
      : ['- nada']),
    '',
    `Historial (las últimas ${historial.length} líneas, de la más vieja a la más nueva):`,
    ...(historial.length ? historial.map((m) => `[${haceCuanto(m.ts, ahora)}] ${quien(m)}: ${limpio(m.texto)}`) : ['(vacío)']),
    '',
    audio ? 'Lo que dijo ahora el cliente, en un audio transcripto (contestá esto):' : 'Lo que escribió ahora el cliente (contestá esto):',
    '"""',
    escribio,
    '"""',
    ...(mandadas ? ['', `Con esto, el cliente ${textoDeFotos(fotos)}`] : []),
  ].join('\n');
  return { texto, leidos: { historial: historial.length, persona: persona.length, evolution: historial.filter((l) => l && l.evolution).length } };
}

function armarCuerpo(messages) {
  const esfuerzo = ESFUERZOS.includes(config.cerebro.esfuerzo) ? config.cerebro.esfuerzo : 'medium';
  return {
    model: config.cerebro.modelo,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: reglasEfectivas(), cache_control: { type: 'ephemeral' } }],
    tools: herramientasEfectivas(),
    tool_choice: { type: 'auto' },
    output_config: { effort: esfuerzo },
    messages,
  };
}

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

/** Un pedido a la API. Un reintento ante 429 o 5xx; el timeout no se reintenta. Tira con el motivo. */
async function llamarApi(cuerpo, intento = 0) {
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), config.cerebro.timeoutMs);
  try {
    let res;
    try {
      res = await fetch(URL_API, {
        method: 'POST',
        headers: { 'x-api-key': config.cerebro.apikey, 'anthropic-version': VERSION_API, 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: ctrl.signal,
      });
    } catch (e) {
      if (e && e.name === 'AbortError') throw new Error(`Anthropic no respondió en ${config.cerebro.timeoutMs / 1000}s`);
      // Error de red ("fetch failed": DNS, conexión cortada, TLS). Se reintenta una vez, como un 5xx
      // (03/10/2026: en la batería del 03/10, 88 turnos seguidos dieron "fetch failed" desde la PC).
      // El mensaje lleva la causa (ENOTFOUND, ECONNRESET, UND_ERR_CONNECT_TIMEOUT...) para saber qué pasó.
      const causa = e && e.cause && (e.cause.code || e.cause.message);
      if (intento < 1) {
        clearTimeout(reloj);
        await dormir(ESPERA_REINTENTO_RED_MS);
        return llamarApi(cuerpo, intento + 1);
      }
      throw new Error(`Anthropic: ${e.message}${causa ? ` (${causa})` : ''}`);
    }
    if (res.ok) return await res.json();
    const detalle = String(await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
    if ((res.status === 429 || res.status >= 500) && intento < 1) {
      clearTimeout(reloj);
      await dormir(ESPERA_REINTENTO_MS);
      return llamarApi(cuerpo, intento + 1);
    }
    throw new Error(`Anthropic ${res.status}: ${detalle}`);
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Lo que dejaron las herramientas para el estado (fase 2): el modelo y la capacidad del último
 * `cotizar`, o del único modelo que devolvió `buscar_equipos`; la entrega de ese `cotizar`; los
 * modelos que salieron con su precio (`precios`) y los que `cotizar` dio que no llega (`noLlega`).
 */
function datosDelTurno(turno) {
  const ultima = turno.cotizaciones[turno.cotizaciones.length - 1] || null;
  let modelo = null;
  let capacidad_gb = null;
  if (ultima) {
    modelo = ultima.modelo;
    capacidad_gb = ultima.capacidad_gb || null;
  } else {
    const modelos = [...new Set(turno.buscados.map((e) => e.modelo))];
    if (modelos.length === 1) {
      modelo = modelos[0];
      const capacidades = [...new Set(turno.buscados.map((e) => e.capacidad_gb).filter(Boolean))];
      capacidad_gb = capacidades.length === 1 ? capacidades[0] : null;
    }
  }
  return {
    modelo,
    capacidad_gb,
    entrega: ultima ? ultima.entrega : null,
    // 🔔 LEAD (13/10/2026): la última entrega cotizada o aceptada. Si la del cliente no llegaba, la que se le dijo
    // (la mínima, que es la que acepta); si llegaba, esa. `entrega` sigue siendo lo que dijo el cliente.
    entregaAviso: ultima ? (ultima.llega === false && ultima.minima > 0 ? ultima.minima : ultima.entrega) : null,
    // La unidad del local que se cotizó (08/10/2026): queda en el estado (`unidadCotizada`) y su foto va primera.
    unidad: ultima && ultima.id ? ultima.id : null,
    precios: turno.precios,
    noLlega: [...new Set(turno.cotizaciones.filter((c) => !c.llega).map((c) => c.modelo))],
  };
}

/**
 * Las fotos de los equipos (08/10/2026): qué queda de lo que dejó `mandar_fotos` cuando Sonnet respondió (`r`, lo que
 * devolvió `revisarSalida`). `fotos`: las que salen (código, pie y archivo), si puso `[fotos]` o van después de sus
 * textos; `avisoGrupo`: el de Sonnet más el del depósito si salió la frase ("le prometí fotos del iPhone 16 Pro
 * (depósito): mandáselas"); y si de algún modelo del local no va ninguna foto (`modelosSinFoto`): `escalarDespues`
 * ({ motivo, equipo }) cuando algo sí sale (las fotos de los otros o la frase del depósito), o `escalaSinMandar` si
 * no sale nada: ahí se escala callado, como siempre, con el código del equipo.
 */
function salidaDeFotos(f, r, avisoDeSonnet = '') {
  const out = { fotos: [], avisoGrupo: avisoDeSonnet || '', escalarDespues: null, escalaSinMandar: false, motivo: '', equipo: null };
  if (!f) return out;
  if (r.conFotos) out.fotos = f.elegidas.map(({ codigo, pie, archivo }) => ({ codigo, pie, archivo }));
  if (r.conFotosDeposito && f.deposito.length) {
    const aviso = fotosEquipos.avisoFotosDeposito(f.deposito);
    out.avisoGrupo = out.avisoGrupo ? `${out.avisoGrupo} · ${aviso}` : aviso;
  }
  if (f.modelosSinFoto.length) {
    const motivo = motivoSinFoto(f);
    const equipo = equipoSinFoto(f);
    if (out.fotos.length || (r.conFotosDeposito && f.deposito.length)) out.escalarDespues = { motivo, equipo };
    else Object.assign(out, { escalaSinMandar: true, motivo, equipo });
  }
  return out;
}

/** Las unidades sin foto de un modelo del que SÍ va alguna foto (12/10/2026): por esas, la frase del color y el 📌. */
function unidadesSinFotoParcial(f) {
  return (f.sinFoto || []).filter((u) => !f.modelosSinFoto.includes(u.modelo) && u.codigo);
}

/**
 * Las entregas de la línea "Entrega:" del 🔔 LEAD (13/10/2026): la última cotizada o aceptada (`entregaAviso`) y, si no
 * hay, la que dijo el cliente (`entrega`); un monto en dólares va aparte, como US$ sin convertir (bloque 10).
 */
function entregasDelAviso(ctx) {
  const pesos = Number(ctx.entregaAviso) || Number(ctx.entrega) || 0;
  return [pesos ? '$' + pesos.toLocaleString('es-AR') : null, ctx.entregaDolares ? 'US$' + ctx.entregaDolares.toLocaleString('es-AR') : null].filter(Boolean);
}

/**
 * La frase de espera de un turno (12/10/2026, decisión de Tomás): cuando dio el día y la hora, en vez de escalar callado
 * le llega una de estas (alternan en el chat, `esperasTurno` en el estado) y después escala.
 */
const FRASES_TURNO = ['dame 10 minutitos que llego al local y me fijo los turnos', 'bancame 20 min que estoy en el depósito, ya te confirmo', 'ahí me fijo cómo tengo los turnos y te confirmo'];

/** "pidió fotos del iPhone 14 y no tiene color cargado; pidió fotos del iPhone 13 y no hay foto del iPhone 13 negro". */
function motivoSinFoto(f) {
  const partes = [];
  for (const modelo of f.modelosSinFoto) {
    const unidades = f.sinFoto.filter((u) => u.modelo === modelo);
    if (unidades.some((u) => u.motivo === 'sin color')) partes.push(`pidió fotos del ${modelo} y no tiene color cargado`);
    const colores = [...new Set(unidades.filter((u) => u.motivo === 'sin foto').map((u) => String(u.color || '').toLowerCase()).filter(Boolean))];
    if (colores.length) partes.push(`pidió fotos del ${modelo} y no hay foto del ${modelo} ${colores.join(' ni ')}`);
  }
  return partes.join('; ') || 'pidió fotos y no hay foto de ese equipo';
}

/** "Equipo: 14-128-008" (hasta 3 códigos, como `equipoParaElGrupo`): las unidades del local sin foto, para el grupo. */
function equipoSinFoto(f) {
  const codigos = [...new Set(f.sinFoto.filter((u) => f.modelosSinFoto.includes(u.modelo)).map((u) => String(u.codigo || '').trim()).filter(Boolean))];
  return codigos.length ? `Equipo: ${codigos.slice(0, 3).join(' / ')}` : null;
}

/**
 * Lo que vuelve como error del `responder` que frenó la guardia: el motivo y cómo corregirlo. Sonnet
 * tiene una sola vuelta para arreglarlo; si no puede, escala.
 */
function textoDeCorreccion(guardia) {
  return (
    `Tu respuesta NO salió, el sistema la frenó: ${guardia}. ` +
    'Corregila y volvé a llamar a responder: como mucho 4 mensajes (varios equipos van juntos en UN mensaje, ' +
    'un renglón por equipo), cada uno de hasta 300 caracteres; montos con puntos de miles y salidos de una ' +
    'herramienta de ESTA respuesta (si te falta uno, pedilo); sin decir cuánto le falta, sin prometer que otra ' +
    'persona o vos lo van a contactar, sin nombrar nada interno (herramientas, el sistema, la planilla, el ' +
    'historial, escalar) y sin prometer archivos que no van (fotos, videos, ubicación, links). La cotización ' +
    'va con un mensaje que sea exactamente [cotizacion] (y un cotizar de esta respuesta que dé 1 pago y 2 cuotas), ' +
    'nunca escrita a mano; la lista completa, con [lista]. ' +
    (stockEnVivo() ? 'El depósito solo con [deposito] (y un equipo del depósito de buscar_equipos en esta respuesta), sin la palabra ni un día. ' : '') +
    (stockEnVivo()
      ? 'Las fotos de los equipos solo con mandar_fotos y un mensaje que sea exactamente [fotos]; la frase del depósito de las fotos, con [fotos_deposito] (y un modelo del depósito devuelto por mandar_fotos). '
      : '') +
    'Si no podés contestar sin eso, llamá a escalar.'
  );
}

/**
 * Qué contestaría Sonnet a esta tanda. Nunca tira:
 *   { mensajes, escalar, motivo, montosDeHerramientas, guardia, uso, usd, ms, herramientas, frenados?,
 *     compromisoDePago, leidos, datos }
 * o { error, uso, usd, ms, leidos? }. `uso` son los tokens del turno (entrada, salida, caché leída y
 * escrita), `usd` lo estimado con los precios de config. `ahora` (por defecto, ya) es la hora del
 * pedido: `npm run sombra` y la batería pasan la de la tanda que repiten. `hasta` (opcional, la sombra
 * con persona del 03/10/2026): el historial y las líneas de persona, solo hasta esa hora. `leidos` son las líneas
 * que fueron en el pedido ({ historial, persona }); `datos`, lo de las herramientas para el estado
 * (`datosDelTurno`). Si la guardia frena, Sonnet tiene una vuelta más para corregirlo (`corregida`:
 * { guardia, frenados } de la primera vez); si vuelve a frenar, escala y el motivo empieza con "guardia:".
 * `audio` (bloque Ninjo 1): lo de ahora vino por audio, el pedido lo dice. `entregasDistintas`: los
 * `cotizar` en que la entrega que leyó el código no coincidió con la de Sonnet.
 * Bloque Ninjo 1b: `mensajes` ya trae el bloque de la cotización y la lista en lugar de `[cotizacion]`
 * y `[lista]`; `escritos` es lo que escribió Sonnet, con las marcas. `compromisoDePago` lo decide el
 * código (la respuesta lleva el bloque y el PDF no salió); `avisoGrupo`, el `aviso_grupo` de responder.
 *
 * Las fotos del cliente (decisión de Tomás del 06/10/2026): `imagenes` ([{ media_type, data }], ya
 * bajadas: solo las pasa una tanda en vivo, `contestar`, y la batería) van como bloques `image` en base64
 * en el primer mensaje, después del texto del contexto, y el último lleva `cache_control` (las vueltas de
 * herramientas no las vuelven a pagar: tres marcas, las reglas, el contexto y la última imagen). `fotos`
 * ({ mandadas, sinVer }; si no viene, las de `imagenes`) es lo que dice el pedido. Con fotos, lo que
 * devuelve lleva `imagenes: { vistas, sin_ver }`, para el registro.
 */
async function pensar({ chatId, mensaje, nombre = '', ahora = Date.now(), hasta = null, audio = false, vivo = false, imagenes = [], fotos = null } = {}) {
  const t0 = Date.now();
  const uso = usoEnCero();
  const turno = turnoEnCero();
  // La hora del pedido (la de la tanda que se repite, en la sombra y la batería): el día del depósito sale de acá.
  turno.ahora = Number(ahora) || Date.now();
  const montos = turno.montos;
  const herramientas = [];
  let leidos = null;
  // Lo que la guardia frenó y Sonnet corrigió en una vuelta más ({ guardia, frenados }), para el registro.
  let corregida = null;
  // Panel Chiara (06/10/2026): la ficha del cliente que vino en `responder` o `escalar`.
  let ficha = null;
  const vistas = Array.isArray(imagenes) ? imagenes : [];
  const mandadas = Number(fotos && fotos.mandadas) || vistas.length;
  const sinVer = Number(fotos && fotos.sinVer) || 0;
  const deFotos = mandadas ? { imagenes: { vistas: vistas.length, sin_ver: sinVer } } : {};
  const fin = (r) => {
    const out = { ...r, uso, usd: seisDecimales(costo(uso)), ms: Date.now() - t0, ...(leidos ? { leidos } : {}), ...(ficha ? { ficha } : {}), ...deFotos };
    avisarOyentes({ chatId, vivo, ahora, r: out });
    return out;
  };
  const comun = () => ({
    montosDeHerramientas: montos,
    herramientas,
    compromisoDePago: false,
    datos: datosDelTurno(turno),
    entregasDistintas: turno.entregasDistintas,
  });
  const escala = (motivo, extra = {}) => fin({ mensajes: [], escalar: true, motivo, guardia: null, ...comun(), ...extra });
  try {
    if (!config.cerebro.apikey) return fin({ error: 'falta ANTHROPIC_API_KEY' });
    // Todo lo del chat se lee ACÁ, antes del primer await: lo que pase después (un #reset, la
    // respuesta del bot) no cambia lo que se le pregunta a Sonnet.
    const s = state.obtener(chatId);
    const enElPedido = mandadas ? { mandadas, vistas: vistas.length, sinVer } : null;
    const contexto = armarContexto(s, mensaje, nombre, ahora, hasta, { audio, fotos: enElPedido });
    leidos = contexto.leidos;
    // Cuántas veces salió la entrega inicial de cada modelo: con eso `cotizar` decide el paso 3.
    turno.insistencias = { ...(s.insistenciaEntrega || {}) };
    // Las fotos de los equipos (08/10/2026): la unidad del local que ya se cotizó en el chat va primera.
    turno.unidadDelChat = s.unidadCotizada ? String(s.unidadCotizada) : null;
    // Si no se sabe de qué unidad se habló, el modelo del chat va adelante de los otros que pidió.
    turno.modeloDelChat = s.modelo ? String(s.modelo) : null;
    // Si el PDF del compromiso ya salió, esta respuesta no lleva adjunto (la guardia, `prometeArchivo`).
    const pdfYaSalio = Boolean(s.compromisoEnviado);
    // El cache_control del contexto queda fijo: en las vueltas siguientes solo se agregan mensajes. Las
    // fotos van después, y la última con su cache_control (la API acepta 4 marcas; van 3).
    const fotosDelPedido = vistas.map((im, i) => ({
      type: 'image',
      source: { type: 'base64', media_type: im.media_type, data: im.data },
      ...(i === vistas.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
    }));
    const messages = [{ role: 'user', content: [{ type: 'text', text: contexto.texto, cache_control: { type: 'ephemeral' } }, ...fotosDelPedido] }];

    for (let vuelta = 1; vuelta <= MAX_VUELTAS; vuelta++) {
      const resp = await llamarApi(armarCuerpo(messages));
      sumarUso(uso, resp && resp.usage);
      if (resp.stop_reason === 'refusal') return escala('Sonnet no quiso contestar (refusal)');
      const content = Array.isArray(resp.content) ? resp.content : [];
      // Tal cual llegó, con lo que pensó: el historial del turno solo se agrega, nunca se edita.
      messages.push({ role: 'assistant', content });
      const usos = content.filter((b) => b && b.type === 'tool_use');

      // Si escala, no manda nada más en ese turno: aunque en la misma respuesta haya un responder.
      const escalo = usos.find((b) => b.name === 'escalar');
      const respondio = usos.find((b) => b.name === 'responder');
      ficha = fichaDe(escalo && escalo.input) || fichaDe(respondio && respondio.input) || ficha;
      if (escalo) {
        herramientas.push('escalar');
        // Si `mandar_fotos` dejó un equipo del local sin foto, su código va al grupo con el 🔕 (08/10/2026).
        const equipo = turno.fotos && turno.fotos.modelosSinFoto.length ? equipoSinFoto(turno.fotos) : null;
        const motivo = String((escalo.input && escalo.input.motivo) || '').trim() || 'Sonnet escaló sin motivo';
        // Turnos (12/10/2026, decisión de Tomás): antes de escalar, una frase de espera (alternan las 3 en el chat).
        if (escalo.input && escalo.input.turno === true) {
          const frase = FRASES_TURNO[(Number(s.esperasTurno) || 0) % FRASES_TURNO.length];
          return fin({
            mensajes: [frase],
            escritos: [],
            escalar: false,
            motivo: '',
            guardia: null,
            ...comun(),
            esperaTurno: true,
            escalarDespues: { motivo, ...(equipo ? { equipo } : {}) },
          });
        }
        return escala(motivo, equipo ? { equipo } : {});
      }
      if (respondio) {
        herramientas.push('responder');
        // El PDF del compromiso (bloque Ninjo 1b, decisión de Tomás): sale con la primera respuesta que
        // lleva el bloque de la cotización, si todavía no salió. Lo decide el código, no Sonnet.
        const r = revisarSalida(respondio.input && respondio.input.mensajes, montos, {
          adjunto: !pdfYaSalio,
          bloques: turno.bloques,
          lista: turno.lista,
          // El depósito (08/10/2026): la frase de esta respuesta, si buscar_equipos devolvió uno del depósito.
          deposito: turno.deposito,
          stockVivo: stockEnVivo(),
          // Las fotos de los equipos (08/10/2026): las que eligió mandar_fotos y la frase del depósito de las fotos.
          fotos: turno.fotos ? turno.fotos.elegidas : [],
          fotosDeposito: turno.fotos ? turno.fotos.frase : null,
        });
        if (r.guardia) {
          // Una vuelta más para corregir: el responder vuelve como error con el motivo, y las
          // herramientas de datos que vinieron en la misma respuesta se contestan como siempre (la API
          // pide un tool_result por cada tool_use). Si no quedan vueltas o ya corrigió una vez, escala.
          if (!corregida && CORRECCIONES > 0 && vuelta < MAX_VUELTAS) {
            corregida = { guardia: r.guardia, frenados: r.frenados };
            const resultados = [];
            for (const b of usos) {
              if (b === respondio) {
                resultados.push({ type: 'tool_result', tool_use_id: b.id, is_error: true, content: textoDeCorreccion(r.guardia) });
              } else {
                herramientas.push(b.name);
                resultados.push(await resultadoDe(b, turno));
              }
            }
            messages.push({ role: 'user', content: resultados });
            continue;
          }
          return escala(`guardia: ${r.guardia}`, { guardia: r.guardia, frenados: r.frenados, ...(corregida ? { corregida } : {}) });
        }
        const aviso = String((respondio.input && respondio.input.aviso_grupo) || '').replace(/\s+/g, ' ').trim();
        // Las fotos de los equipos (08/10/2026): si pidió fotos de un equipo del local que no tiene y no sale
        // ninguna otra cosa, se escala callado como siempre, con el código del equipo.
        const deFotos = salidaDeFotos(turno.fotos, r, aviso);
        if (deFotos.escalaSinMandar) return escala(deFotos.motivo, { ...(deFotos.equipo ? { equipo: deFotos.equipo } : {}), ...(corregida ? { corregida } : {}) });
        // El depósito (12/10/2026): salió la frase de [deposito], el cliente lo quiere: el 🚨 para que entre Tomás.
        if (r.conDeposito && turno.deposito) {
          const entra = `🚨 ENTRÁ VOS · DEPÓSITO: quiere el ${turno.depositoEquipo || 'equipo'} y le dije "${turno.deposito}". Confirmale el día.`;
          deFotos.avisoGrupo = deFotos.avisoGrupo ? `${entra} · ${deFotos.avisoGrupo}` : entra;
        }
        // Las fotos (12/10/2026): unidades sin foto de un modelo del que sí van fotos → la frase y el 📌 con el código.
        const sinFotoParcial = turno.fotos && deFotos.fotos.length ? unidadesSinFotoParcial(turno.fotos) : [];
        if (sinFotoParcial.length) {
          r.mensajes = [...r.mensajes, fotosEquipos.FRASE_SIN_FOTO];
          r.piezas = [...r.piezas, fotosEquipos.FRASE_SIN_FOTO];
          const deCual = sinFotoParcial.map((u) => `${u.codigo} (${u.motivo === 'sin color' ? `${u.modelo} sin color cargado` : `no hay foto del ${u.modelo} ${String(u.color).toLowerCase()}`})`);
          const sf = `sin foto: ${deCual.join(', ')}, le mandé las otras`;
          deFotos.avisoGrupo = deFotos.avisoGrupo ? `${deFotos.avisoGrupo} · ${sf}` : sf;
        }
        return fin({
          mensajes: r.mensajes,
          // Con las fotos como acciones (`foto-equipo`), para index.js; sin fotos, los mismos textos.
          piezas: r.piezas,
          escritos: r.escritos,
          escalar: false,
          motivo: '',
          guardia: null,
          ...comun(),
          compromisoDePago: Boolean(r.conBloque) && !pdfYaSalio,
          // Panel Chiara: la respuesta lleva el bloque de la cotización (cuenta como cotizado si sale).
          conCotizacion: Boolean(r.conBloque),
          ...(deFotos.avisoGrupo ? { avisoGrupo: deFotos.avisoGrupo } : {}),
          // Las fotos que salen (código, pie y archivo), y si después hay que escalar por un modelo sin foto.
          fotos: deFotos.fotos,
          ...(deFotos.escalarDespues ? { escalarDespues: deFotos.escalarDespues } : {}),
          ...(corregida ? { corregida } : {}),
        });
      }
      if (!usos.length) {
        return escala(`Sonnet no terminó con responder ni escalar${resp.stop_reason === 'max_tokens' ? ' (se cortó: max_tokens)' : ''}`);
      }
      const resultados = [];
      for (const b of usos) {
        herramientas.push(b.name);
        resultados.push(await resultadoDe(b, turno));
      }
      messages.push({ role: 'user', content: resultados });
    }
    return escala(`Sonnet no terminó en ${MAX_VUELTAS} vueltas`);
  } catch (e) {
    return fin({ error: (e && e.message) || String(e) });
  }
}

// ---------------------------------------------------------------------------
// Fase 2: Sonnet contesta de verdad (decisiones de Tomás del 02/10/2026)
// ---------------------------------------------------------------------------

/**
 * Quién atiende la tanda de este chat: 'sonnet' (contesta Sonnet), 'sombra' (contesta el bot de
 * siempre y Sonnet piensa en sombra) o 'bot' (solo el bot, sin llamar a la API):
 *   - `apagado`: el bot, siempre. Es el interruptor general: ni la marca del chat lo prende.
 *   - `#bot <número>` dejó `atiendeSonnet: false`: sombra, en cualquier modo.
 *   - `atiendeSonnet: true` (chat nuevo con `nuevos`, o `#sonnet-si`): Sonnet, aunque después se
 *     cambie el modo (también a `sombra`), hasta `#reset` o `#bot`. Solo `apagado` lo corta.
 *   - `todos`: Sonnet. `tester` y `nuevos`: Sonnet para NUMEROS_TESTER.
 *   - El resto: sombra (con `sombra`, todos menos los marcados).
 * Lo de antes de la tanda no cambia: lista negra, grupos, comandos, el silencio tras una persona,
 * los escalados, los audios que no se entendieron y los pedidos del catálogo no llegan hasta acá.
 */
function quienAtiende(chatId) {
  const modo = config.cerebro.modo;
  if (modo === 'apagado') return 'bot';
  const s = state.todos()[chatId] || {};
  if (s.atiendeSonnet === false) return 'sombra';
  if (s.atiendeSonnet === true || modo === 'todos') return 'sonnet';
  if ((modo === 'tester' || modo === 'nuevos') && evolution.estaEnLaLista(chatId, config.numerosTester)) return 'sonnet';
  return 'sombra';
}

/**
 * ¿Este mensaje abre un chat nuevo para Sonnet? Con `CEREBRO_MODO=nuevos`: un chat que no tenía
 * estado guardado, que no es del tester (ese ya lo atiende Sonnet, y su #reset no lo marca) y que no
 * está en la lista de chats viejos, con la lista al día (si se está poniendo al día, no se sabe:
 * contesta el bot de siempre). index.js lo mira ANTES de que el mensaje entre al estado (los grupos,
 * los `@lid` y la lista negra ya quedaron afuera) y, si da true, deja `atiendeSonnet: true` con la
 * fecha.
 */
function esChatNuevo(chatId) {
  if (config.cerebro.modo !== 'nuevos') return false;
  if (Object.prototype.hasOwnProperty.call(state.todos(), chatId)) return false;
  if (evolution.estaEnLaLista(chatId, config.numerosTester)) return false;
  if (!chatsViejos.listo()) return false;
  return !evolution.estaEnLaLista(chatId, chatsViejos.numeros());
}

/** El pie del PDF del compromiso cuando hay lugar para un mensaje más (el de requisitosConCompromiso). */
const PIE_COMPROMISO = 'te paso el compromiso de pago';

// ---------------------------------------------------------------------------
// Los acuses (bloque Ninjo 1, 05/10/2026; decisión de Tomás del 29/09/2026)
// ---------------------------------------------------------------------------

/**
 * Los textos de la tanda: sus líneas (index.js), o el mensaje si no vienen. Sin lo que citó el cliente (08/10/2026,
 * `sinCita`): un "dale" que responde a un mensaje sigue siendo un acuse, como sin la cita.
 */
const textosDe = (mensaje, lineas) => (lineas && lineas.length ? lineas.map((l) => l.texto) : [mensaje]).map(sinCita);

/** ¿Toda la tanda son acuses ("ok", "👍", "dale", "listo")? Con `responder.esAcuse`, como `noSeEntiende`. */
function tandaDeAcuses(mensaje, lineas) {
  const textos = textosDe(mensaje, lineas);
  return textos.length > 0 && textos.every((t) => responder.esAcuse(t));
}

/** "no", "noo", "no!": para el bot de siempre es un acuse, pero después de la entrega inicial puede ser "no llego". */
const esUnNo = (t) => /^n+o+$/.test(String(t || '').toLowerCase().replace(/[^a-z]/g, ''));

/**
 * ¿La última tanda de la cuenta trae líneas de la lista de precios ("Ip 13 128GB 100% $495.000")? El
 * bot de siempre la manda sola en un mensaje (`ultimaTandaEsperaAlCliente` mira el principio); Sonnet
 * la puede mandar con un renglón antes ("te paso los del 13:\nIp 13 …"), así que acá se mira renglón
 * por renglón.
 */
function listaEnLaUltimaTanda(historial) {
  const h = historial || [];
  let i = h.length - 1;
  while (i >= 0 && h[i].quien === 'cliente') i--;
  for (; i >= 0 && h[i].quien === 'vendedor'; i--) {
    if (String(h[i].texto || '').split('\n').some((l) => /^ip \d/i.test(l.trim()))) return true;
  }
  return false;
}

/**
 * ¿La última tanda de la cuenta trae una cotización ("1 pago de $X", "2 pagos de $Y")? Ahí un "dale"
 * es para avanzar y se le pregunta a Sonnet, aunque la misma tanda diga "te paso los numeros" o la
 * entrega inicial de otro modelo: es lo que hace el bot de siempre con el 📱 (C67T6). Sonnet no
 * arranca la cotización con el 📱, así que se mira el texto (revisión del bloque Ninjo 1, 05/10/2026).
 */
// Desde el bloque Ninjo 1b, la cotización de Sonnet es el bloque de cotizador.bloqueSonnet ("· 1 cuota
// de $X", "· o 2 cuotas de $Y cada una"): se reconoce por "2 cuotas de" (y "1 cuota de").
const COTIZACION = /\b1 pago de\b|\b1 cuota de\b|\b2 pagos de\b|\b2 cuotas de\b/;
/** ¿El texto trae una cotización? (index.js: lo que habilita el seguimiento, bloque Ninjo 1b). */
const esCotizacion = (texto) => COTIZACION.test(promesas.sinTildes(texto));
function cotizacionEnLaUltimaTanda(historial) {
  const h = historial || [];
  let i = h.length - 1;
  while (i >= 0 && h[i].quien === 'cliente') i--;
  for (; i >= 0 && h[i].quien === 'vendedor'; i--) {
    if (String(h[i].texto || '').startsWith('📱') || COTIZACION.test(promesas.sinTildes(h[i].texto))) return true;
  }
  return false;
}

/**
 * ¿A esta tanda no se le pregunta a Sonnet? Toda la tanda son acuses y:
 *   - el acuse anterior ya se contestó (`acuseContestado`, seguido: `responder.marcaSeguida`), o
 *   - lo último que le llegó de la cuenta fue la línea de la entrega inicial, un "te cotizo" o
 *     "te paso" (del bot o de una persona) o la lista de precios (`responder.ultimaTandaEsperaAlCliente`,
 *     lo mismo que mira `decidir`). Ahí un "no" sí se le pregunta, como en `decidir` (`esAcuseCorto`).
 *     Si esa tanda trae una cotización (`cotizacionEnLaUltimaTanda`), sí se le pregunta.
 * No sale nada y no escala: decisión del 29/09. Hasta el bloque Ninjo 1, Sonnet le contestaba algo
 * que ya había dicho, el filtro de repetidos lo vaciaba y el chat quedaba escalado y mudo.
 * Devuelve el porqué, o null.
 */
function acuseSinPreguntar(s, mensaje, lineas) {
  if (!tandaDeAcuses(mensaje, lineas)) return null;
  if (responder.marcaSeguida(s.acuseContestado, s.historial, mensaje, lineas)) return 'el acuse anterior ya se contestó';
  if (
    !textosDe(mensaje, lineas).some(esUnNo) &&
    !cotizacionEnLaUltimaTanda(s.historial) &&
    (responder.ultimaTandaEsperaAlCliente(s.historial) || listaEnLaUltimaTanda(s.historial))
  ) {
    return 'lo último fue la entrega inicial, un "te cotizo" o la lista de precios';
  }
  return null;
}

/** La última línea de la tanda ({ ts, texto }), para `acuseContestado`: la de index.js o, si no viene, la del historial. */
function ultimaLineaDeLaTanda(s, mensaje, lineas) {
  if (lineas && lineas.length) {
    const u = lineas[lineas.length - 1];
    return { ts: u.ts, texto: u.texto };
  }
  const h = s.historial || [];
  for (let i = h.length - 1; i >= 0; i--) {
    if (h[i].quien === 'cliente' && h[i].texto === mensaje) return { ts: h[i].ts, texto: h[i].texto };
  }
  return null;
}

/**
 * Lo que devolvió `pensar` (sin error), convertido al `resultado` de siempre de index.js
 * ({ escalar, motivo, mensajes, callar }), más `fuente: 'sonnet'` y `sonnetMensajes` (lo que
 * escribió Sonnet, ya filtrado, sin el saludo ni el PDF: para el aviso al grupo).
 *
 * Queda en el estado ya: el nombre (como `decidir`), el modelo, la capacidad y la entrega de las
 * herramientas (`datosDelTurno`) y `ultimaRespuestaSonnet` ({ ts, mensajes } o { ts, escalo }).
 * Viajan como marcas, y se guardan recién cuando el mensaje sale (como en el bot): en el primer
 * mensaje, `preciosMostradosDe` (los modelos cuyo precio salió en la respuesta) e
 * `insistenciaEntrega` (+1 por cada modelo con `llega: false`); con el PDF, `compromisoEnviado` y
 * `temasExplicados.financiacion`.
 *
 * Lo que sale pasa por lo mismo que la respuesta del bot: el filtro de repetidos (si todo ya se
 * dijo, escala callado, como el bot), el PDF del compromiso una sola vez (`conCompromiso`; si ya
 * hay 4 mensajes, va con el último de pie) y el saludo del día (`conSaludo`, si hoy nadie de la
 * cuenta le escribió).
 *
 * Con una tanda de acuses (bloque Ninjo 1; `lineas`, las de la tanda): si todo ya se dijo, no sale
 * nada y NO escala (decisión del 29/09); si sale, el primer mensaje lleva `acuseContestado` (como en
 * `noSeEntiende`), que se confirma solo si el mensaje sale: el acuse siguiente no se le pregunta.
 */
function comoResultado(chatId, r, { nombre = '', mensaje = '', ahora = Date.now(), lineas = null, equipo = null } = {}) {
  const s = state.obtener(chatId);
  const d = r.datos || {};
  const apodo = responder.primerNombre(s.nombre) || responder.primerNombre(nombre);
  const cambios = {
    ultimaRespuestaSonnet: {
      ts: ahora,
      ...(r.escalar ? { escalo: r.motivo } : { mensajes: r.mensajes, ...(r.escalarDespues ? { escalo: r.escalarDespues.motivo } : {}) }),
    },
  };
  if (apodo && s.nombre !== apodo) cambios.nombre = apodo;
  // La frase de espera del turno (12/10/2026): la próxima es la siguiente.
  if (r.esperaTurno) cambios.esperasTurno = (Number(s.esperasTurno) || 0) + 1;
  if (d.modelo) {
    cambios.modelo = d.modelo;
    cambios.capacidad_gb = d.capacidad_gb || null;
  }
  if (d.entrega) cambios.entrega = d.entrega;
  // Un turno que no cotiza no trae `entregaAviso`: queda la del último cotizar (el cliente acepta y Sonnet escala).
  if (d.entregaAviso) cambios.entregaAviso = d.entregaAviso;
  // Las fotos de los equipos (08/10/2026): la unidad del local que se cotizó; su foto va primera si pide fotos.
  if (d.unidad) cambios.unidadCotizada = d.unidad;
  state.actualizar(chatId, cambios);

  // `equipo` (el stock de la app en vivo, 08/10/2026): "Equipo: 15P-128-001" o "Equipo: DEPÓSITO iPhone 15 Pro
  // 128GB", una línea más en el 🔕 del grupo (`paraElGrupo`, index.js), para que la persona sepa cuál preparar.
  const escala = (motivo) => ({ escalar: true, motivo, mensajes: [], callar: true, fuente: 'sonnet', sonnetMensajes: [], ...(equipo ? { paraElGrupo: equipo } : {}) });
  if (r.escalar) return escala(r.motivo);
  // Bloque Ninjo 1b: el aviso al grupo de `responder` (un modelo que no hay), sin callar el chat.
  const conAviso = (res) => (r.avisoGrupo ? { ...res, avisoGrupo: r.avisoGrupo } : res);
  const acuse = tandaDeAcuses(mensaje, lineas);
  // Las fotos de los equipos (08/10/2026) vienen como acciones en `piezas` (`foto-equipo`, con su pie); sin fotos,
  // `piezas` son los mismos textos que `mensajes`. Si quien llama pisó `mensajes` (las pruebas, #comparar), valen esos.
  const mensajes = r.mensajes || [];
  const piezasValen = Array.isArray(r.piezas) && r.piezas.length === mensajes.length && r.piezas.every((p, i) => acciones.comoTexto(p) === mensajes[i]);
  let msgs = responder.sinLoYaDicho(chatId, piezasValen ? r.piezas : mensajes);
  if (!msgs.length) {
    // A un acuse con todo repetido no se le contesta y no se escala (decisión del 29/09).
    if (acuse) return { escalar: false, motivo: 'acuse: lo que iba a contestar ya se lo dije', mensajes: [], callar: false, fuente: 'sonnet', sonnetMensajes: [] };
    return escala(responder.TODO_REPETIDO);
  }
  // Las fotos cuentan para el tope de 4 (decisión de Tomás del 08/10/2026): caben las que dejan lugar los textos de
  // Sonnet, el saludo del día (si hoy no se habló) y el PDF. Nunca se corta un texto ni se pasa el tope: si no
  // entran, van menos fotos, las primeras del orden.
  const saludaHoy = !responder.hablaronHoy(s, ahora);
  const textos = msgs.filter((m) => !acciones.esFotoEquipo(m)).length;
  let lugarParaFotos = Math.max(0, MAX_MENSAJES - textos - (saludaHoy ? 1 : 0) - (r.compromisoDePago ? 1 : 0));
  msgs = msgs.filter((m) => !acciones.esFotoEquipo(m) || lugarParaFotos-- > 0);
  // Lo que escribió Sonnet, como texto (una foto, "[foto: 15-128-001] 15 128gb 87% 740.000"): para el aviso al grupo.
  const sonnetMensajes = msgs.map(acciones.comoTexto);

  // Los precios que le llegaron: también los del pie de una foto.
  const enLaRespuesta = new Set(montosEn(sonnetMensajes.join('\n')));
  const marcas = {};
  const mostrados = [...new Set((d.precios || []).filter((p) => enLaRespuesta.has(p.precio)).map((p) => p.modelo))];
  if (mostrados.length) marcas.preciosMostradosDe = mostrados;
  if ((d.noLlega || []).length) {
    marcas.insistenciaEntrega = Object.fromEntries(d.noLlega.map((m) => [m, ((s.insistenciaEntrega || {})[m] || 0) + 1]));
  }
  if (acuse) {
    const ultima = ultimaLineaDeLaTanda(s, mensaje, lineas);
    if (ultima) marcas.acuseContestado = ultima;
  }
  msgs[0] = acciones.conMarcas(msgs[0], marcas);

  // Una sola vez por chat: `conCompromiso` no arma el PDF si ya salió (`compromisoEnviado`).
  if (r.compromisoDePago) {
    const tema = { temasExplicados: { ...(s.temasExplicados || {}), financiacion: true } };
    if (msgs.length < MAX_MENSAJES) {
      const doc = responder.conCompromiso(chatId, s, PIE_COMPROMISO);
      if (acciones.esDoc(doc)) msgs.push(acciones.conMarcas(doc, tema));
    } else {
      const ultimo = msgs[msgs.length - 1];
      const doc = responder.conCompromiso(chatId, s, acciones.comoTexto(ultimo));
      if (acciones.esDoc(doc)) msgs[msgs.length - 1] = acciones.conMarcas(doc, { ...(acciones.marcasDe(ultimo) || {}), ...tema });
    }
  }

  // El saludo mira si el cliente preguntó cómo estamos: en lo que escribió él, no en lo que citó (08/10/2026).
  if (saludaHoy) msgs = responder.conSaludo(msgs, apodo, sinCita(mensaje), ahora);
  const salida = { escalar: false, motivo: '', mensajes: msgs, callar: true, fuente: 'sonnet', sonnetMensajes };
  // Las fotos de los equipos (08/10/2026): salieron las que hay (o la frase del depósito) y DESPUÉS se escala por el
  // modelo del local sin foto, con su código. index.js manda los mensajes y recién ahí escala y avisa al grupo.
  if (r.escalarDespues) {
    return conAviso({ ...salida, escalar: true, motivo: r.escalarDespues.motivo, ...(r.escalarDespues.equipo ? { paraElGrupo: r.escalarDespues.equipo } : {}) });
  }
  return conAviso(salida);
}

/**
 * Sonnet contesta una tanda en vivo: pone al día los temas explicados con el historial (como
 * `decidir`), piensa y lo convierte (`comoResultado`). Devuelve { r, resultado } o { r, error }:
 * con error, index.js contesta con el bot de siempre. La batería (`npm run bateria-cerebro`) usa
 * lo mismo, con `ahora`.
 *
 * `lineas` ({ ts, texto } de cada línea de la tanda) y `audio` (bloque Ninjo 1): a una tanda de
 * acuses que no se le pregunta (`acuseSinPreguntar`) no se llama a la API, no sale nada y no
 * escala: el resultado lleva el motivo "acuse" y `r.sinLlamar` dice por qué.
 *
 * `imagenes` y `fotos` (06/10/2026): las fotos de la tanda, ya bajadas (index.js, fotos-del-cliente.js),
 * van a `pensar`. Con fotos la tanda nunca es solo un acuse: un "ok" con la captura de la batería trae
 * un dato, y se le pregunta a Sonnet.
 */
async function contestar({ chatId, mensaje, nombre = '', ahora = Date.now(), lineas = null, audio = false, imagenes = [], fotos = null }) {
  const conFotos = Boolean((fotos && fotos.mandadas) || (imagenes && imagenes.length));
  const sinPreguntar = conFotos ? null : acuseSinPreguntar(state.obtener(chatId), mensaje, lineas);
  if (sinPreguntar) {
    const r = {
      mensajes: [],
      escalar: false,
      motivo: 'acuse',
      sinLlamar: sinPreguntar,
      guardia: null,
      montosDeHerramientas: [],
      herramientas: [],
      compromisoDePago: false,
      datos: null,
      entregasDistintas: [],
      uso: usoEnCero(),
      usd: 0,
      ms: 0,
    };
    return { r, resultado: { escalar: false, motivo: 'acuse', mensajes: [], callar: false, fuente: 'sonnet', sonnetMensajes: [] } };
  }
  const explicados = temas.actualizarDesdeHistorial(state.obtener(chatId));
  if (explicados) state.actualizar(chatId, { temasExplicados: explicados });
  const r = await pensar({ chatId, mensaje, nombre, ahora, audio, vivo: true, imagenes, fotos });
  if (r.error) return { r, error: r.error };
  // Marca de canje (decisión de Tomás del 07/10/2026): si Sonnet anotó un canje en la ficha, el chat queda
  // con la hora (`canjeSonnet`); con eso una foto sola entra a la tanda (`canjeVigente`, index.js). Y el texto
  // (`canjeFicha`, también del 07/10): va en lo que el sistema ya sabe (`loQueSabe`). Una ficha con otro canje
  // lo reemplaza; una sin canje no lo borra.
  if (r.ficha && r.ficha.canje) state.actualizar(chatId, { canjeSonnet: ahora, canjeFicha: { texto: r.ficha.canje, ts: ahora } });
  // El stock de la app en vivo (08/10/2026): si escala, el código del equipo del local o el del depósito va al grupo.
  // Si escaló por un equipo sin foto (`mandar_fotos`), ya viene con su código (`r.equipo`).
  const equipo = r.escalar && stockEnVivo() ? r.equipo || (await equipoParaElGrupo(state.obtener(chatId), r.datos)) : null;
  return { r, resultado: comoResultado(chatId, r, { nombre, mensaje, ahora, lineas, equipo }) };
}

/**
 * El equipo del que se habla, para el 🔕 del grupo cuando Sonnet escala (decisión de Tomás del 08/10/2026:
 * al armar turno, el código del equipo del local, "15P-128-001", o "DEPÓSITO <modelo capacidad>"). El modelo y
 * la capacidad son los del último `cotizar` de esta respuesta (o del único modelo de `buscar_equipos`) o, si
 * no hubo, los del estado del chat. Del local, el ID de USADOS (el código de la app); con varias unidades,
 * hasta 3 separadas por " / ". Si no hay nada del local, la primera fila de LISTA del modelo. Sin modelo o
 * sin filas, null. Nunca tira.
 */
async function equipoParaElGrupo(s, datosTurno) {
  try {
    const modelo = (datosTurno && datosTurno.modelo) || (s && s.modelo) || null;
    if (!modelo) return null;
    const capacidad = Number((datosTurno && datosTurno.modelo ? datosTurno.capacidad_gb : s && s.capacidad_gb) || 0) || null;
    const datos = await responder.leerPlanilla();
    const filas = sheets.buscarTodas(datos, modelo, capacidad).filter(vendible);
    const local = filas.filter((f) => f.origen === 'USADOS');
    if (local.length) {
      const codigos = [...new Set(local.map((f) => String(f.id || '').trim()).filter(Boolean))];
      if (codigos.length) return `Equipo: ${codigos.slice(0, 3).join(' / ')}`;
      const f = local[0];
      return `Equipo del local: ${f.modelo}${f.capacidad_gb ? ` ${f.capacidad_gb}GB` : ''} (sin código)`;
    }
    const deposito = filas.find((f) => f.origen === 'LISTA');
    if (deposito) return `Equipo: DEPÓSITO ${deposito.modelo}${deposito.capacidad_gb ? ` ${deposito.capacidad_gb}GB` : ''}`;
    return null;
  } catch (e) {
    console.error('[cerebro] no pude buscar el equipo para el grupo:', e.message);
    return null;
  }
}

// --- Los avisos al grupo -------------------------------------------------------

/** "US$0,0077": cuatro decimales, con coma. */
const usdTexto = (n) => `US$${(Number(n) || 0).toFixed(4).replace('.', ',')}`;

/** "30 mensajes de contexto (18 de Evolution) (+2 de una persona)". */
function leidosTexto(leidos) {
  const n = (leidos && leidos.historial) || 0;
  const e = (leidos && leidos.evolution) || 0;
  const p = (leidos && leidos.persona) || 0;
  return `${n} mensaje${n === 1 ? '' : 's'} de contexto${e ? ` (${e} de Evolution)` : ''}${p ? ` (+${p} de una persona)` : ''}`;
}

const recorte = (t, largo) => {
  const una = String(t || '').replace(/\s+/g, ' ').trim();
  return una.length > largo ? una.slice(0, largo - 1).trimEnd() + '…' : una;
};

/** Con `tester` y `nuevos`, cada vez que Sonnet le contesta a alguien. */
function avisoRespuesta({ chatId, nombre, leidos, primero }) {
  const numero = String(chatId).split('@')[0];
  return `🤖 Sonnet → ${nombre || 'sin nombre'} · leí ${leidosTexto(leidos)} · ${recorte(primero, 80)} · wa.me/${numero}`;
}

// Un error de la API avisa una sola vez por racha; se rearma cuando Sonnet vuelve a contestar.
let caido = false;

/** "error 500", "timeout", "falta la clave" o el error recortado. */
function motivoCorto(error) {
  const e = String(error || '');
  const status = e.match(/^Anthropic (\d{3})\b/);
  if (status) return `error ${status[1]}`;
  if (/no respondi/i.test(e)) return 'timeout';
  if (/ANTHROPIC_API_KEY/.test(e)) return 'falta la clave';
  return recorte(e, 60);
}

/** Sonnet no pudo contestar en vivo: el aviso, la primera vez de la racha; si no, null. */
function alFallar(error) {
  if (caido) return null;
  caido = true;
  return `⚠️ Sonnet no responde (${motivoCorto(error)}): contesta el bot de siempre`;
}

/** Sonnet contestó (o escaló) en vivo: la próxima falla vuelve a avisar. */
function alContestar() {
  caido = false;
}

/** Panel Chiara: ¿Sonnet está en una racha de errores en vivo (contesta el bot de siempre)? */
function enFalla() {
  return caido;
}

// Con `todos`: un resumen por hora en lugar de un aviso por respuesta. En memoria, por hora de
// reloj (Argentina va en horas enteras), como el gasto del día.
const HORA_MS = 60 * 60 * 1000;
const porHora = new Map();

/**
 * Anota en la hora: 'gasto' (lo que costó una tanda en vivo, conteste o escale), 'respuesta' (le
 * llegó al cliente, con lo leído), 'escalado' o 'evolution' (bloque Ninjo 1b: a ese chat se le
 * completó el historial con Evolution; `r.chatId`, cada chat cuenta una vez).
 */
function contarEnVivo(tipo, r, ahora = Date.now()) {
  const desde = Math.floor(ahora / HORA_MS) * HORA_MS;
  if (!porHora.has(desde)) porHora.set(desde, { respuestas: 0, leidos: [], escalados: 0, usd: 0, conEvolution: new Set() });
  const h = porHora.get(desde);
  if (tipo === 'gasto') {
    h.usd += Number(r && r.usd) || 0;
  } else if (tipo === 'respuesta') {
    h.respuestas++;
    h.leidos.push((r && r.leidos && r.leidos.historial) || 0);
  } else if (tipo === 'escalado') {
    h.escalados++;
  } else if (tipo === 'evolution') {
    h.conEvolution.add(String((r && r.chatId) || h.conEvolution.size));
  }
}

/**
 * Los resúmenes de las horas que ya terminaron, solo de las que tuvieron respuestas (las demás se
 * descartan): un texto por hora, de la más vieja a la más nueva.
 */
function resumenesDeLaHora(ahora = Date.now()) {
  const actual = Math.floor(ahora / HORA_MS) * HORA_MS;
  const out = [];
  for (const desde of [...porHora.keys()].sort((a, b) => a - b)) {
    if (desde >= actual) continue;
    const h = porHora.get(desde);
    porHora.delete(desde);
    if (!h.respuestas) continue;
    const promedio = Math.round(h.leidos.reduce((a, b) => a + b, 0) / h.leidos.length);
    const minimo = Math.min(...h.leidos);
    const evo = h.conEvolution.size;
    const conEvolution = evo ? ` · ${evo} chat${evo === 1 ? '' : 's'} completado${evo === 1 ? '' : 's'} con Evolution` : '';
    out.push(
      `🤖 Última hora: ${h.respuestas} respuesta${h.respuestas === 1 ? '' : 's'} de Sonnet, leyó ${promedio} mensajes de contexto en promedio ` +
        `(el que menos, ${minimo}) · ${h.escalados} escalado${h.escalados === 1 ? '' : 's'}${conEvolution} · ${usdTexto(h.usd)}`
    );
  }
  return out;
}

/**
 * Marca de canje (decisión de Tomás del 07/10/2026): la última vez que Sonnet anotó un canje en la ficha
 * (`canjeSonnet`, la pone `contestar`) vale CANJE_MARCA_HORAS (72 h). Con la marca vigente, en un chat que
 * atiende Sonnet una foto sola entra a la tanda como en un canje en curso (index.js); escalado, no.
 */
const CANJE_MARCA_HORAS = 72;
function canjeVigente(s, ahora = Date.now()) {
  const t = Number(s && s.canjeSonnet);
  return Boolean(t && !s.escalado && ahora - t < CANJE_MARCA_HORAS * 60 * 60 * 1000);
}

/**
 * El canje que anotó Sonnet en la ficha (`canjeFicha: { texto, ts }`, lo guarda `contestar`; decisión de Tomás del
 * 07/10/2026), si tiene menos de CANJE_MARCA_HORAS; si no, null. `#reset` lo borra (borra el chat).
 */
function canjeAnotado(s, ahora = Date.now()) {
  const c = s && s.canjeFicha;
  const t = Number(c && c.ts);
  return c && c.texto && t && ahora - t < CANJE_MARCA_HORAS * 60 * 60 * 1000 ? String(c.texto) : null;
}

module.exports = {
  pensar,
  // El stock de la app (08/10/2026)
  nombraElDeposito,
  equipoParaElGrupo,
  reglasEfectivas,
  canjeVigente,
  CANJE_MARCA_HORAS,
  textoDeFotos,
  revisarSalida,
  cotizaAMano,
  cotizacionEnLaUltimaTanda,
  esCotizacion,
  montosEn,
  sinPuntosEn,
  sinMarcasDeIA,
  nombraAlgoInterno,
  prometeArchivo,
  losQueRetiraCon,
  costo,
  gastoDeHoy,
  gastoDelMes,
  sumarAlMes,
  armarGastoMes,
  avisoGastoMes,
  marcarAvisoGastoMes,
  resumenSalud,
  hashDeReglas,
  lineaDeReglas,
  REGLAS_HASH,
  REGLAS_LINEAS,
  quienAtiende,
  esChatNuevo,
  comoResultado,
  contestar,
  avisoRespuesta,
  leidosTexto,
  usdTexto,
  recorte,
  alFallar,
  alContestar,
  // Panel Chiara (06/10/2026)
  alPensar,
  fichaDe,
  enFalla,
  motivoCorto,
  contarEnVivo,
  resumenesDeLaHora,
  REGLAS,
  HERRAMIENTAS,
  FRASES_TURNO,
  entregasDelAviso,
  // Las fotos de los equipos (08/10/2026)
  MANDAR_FOTOS,
  herramientasEfectivas,
  motivoSinFoto,
  MAX_MENSAJES,
  LARGO_MAXIMO,
};
