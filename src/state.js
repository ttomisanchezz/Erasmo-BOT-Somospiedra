'use strict';
/**
 * Estado por conversación, en un JSON en disco.
 * Guarda lo mínimo: qué modelo pidió, cuánto tiene, si ya se escaló,
 * y cuándo fue la última vez que contestó un humano.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

// Las pruebas apuntan ESTADO_PATH a un archivo temporal para no mezclar
// conversaciones inventadas con las reales del bot.
const ARCHIVO = config.estadoPath || path.join(__dirname, '..', 'data', 'estado.json');

/**
 * Modo solo lectura (auditoría del 15/09/2026, A7 — bloque 4). Con
 * ESTADO_SOLO_LECTURA=1 el estado se carga y se migra EN MEMORIA, pero no se
 * escribe nunca: ni el backup, ni la copia de un archivo dañado, ni al salir.
 * Es para las herramientas que miran el estado real mientras el bot corre
 * (`npm run resumen`, `npm run destino`): antes guardaban al salir la copia que
 * habían cargado y pisaban lo que el bot anotó mientras tanto.
 *
 * Es una variable de entorno y no una función porque el archivo se lee al
 * cargar este módulo: una función tendría que llamarse antes del primer
 * `require`, y una variable vale también para un `node -e` suelto.
 */
const SOLO_LECTURA = Boolean(config.estadoSoloLectura);

let memoria = {};
let guardadoPendiente = null;
// Hay cambios en memoria que todavía no están en disco. Se guarda solo si es
// verdad: cargar, leer y salir no toca el archivo (bloque 4).
let sucio = false;
// Si el archivo estaba ilegible al arrancar: { copia, error }. index.js lo avisa
// una vez al grupo al arrancar.
let danado = null;

// ---------------------------------------------------------------------------
// Marcas de "ya se dijo" (auditoría del 15/09/2026, A4 — bloque 3)
// ---------------------------------------------------------------------------
// Son las que dicen "esto el cliente YA lo recibió": mientras estén puestas, el
// bot no lo repite. Por eso solo las confirma un envío que llegó (ver
// `confirmarMarcas`, que llama index.js con el id de Evolution en la mano).
// Lo que dijo el cliente (modelo, entrega, notas, permuta) NO está en esta
// lista: eso es suyo y se guarda apenas se lee.
// `noEntendido` y `sinVenta` tampoco están, aunque desde Pendientes 2 también viajan
// con la respuesta y se confirman al salir: son contadores de control, no "ya se
// dijo", y la migración de abajo no tiene por qué borrarlos.
const MARCAS_DEL_BOT = [
  // Hasta el bloque 9 (no se lee más): queda para los estados de antes del esquema 3.
  'yaSaludo',
  // Cuándo salió el último saludo.
  'saludoEn',
  'acuseContestado',
];

// Marcas que se acumulan (una lista) o que son un objeto que se mezcla con lo que había. En Piedra
// todavía ninguna (poda de iPhone, 19/10/2026: eran los modelos con precio y la insistencia de la
// entrega); el mecanismo queda para cuando haya herramientas de precio.
const MARCAS_QUE_SE_SUMAN = [];
const MARCAS_QUE_SE_MEZCLAN = [];

/**
 * Versión del estado guardado. Sube cuando un cambio deja los datos viejos
 * inconsistentes con el código nuevo, y `migrar` los acomoda al arrancar.
 *  3 = las marcas de "ya se dijo" solo valen si el mensaje salió (bloque 3).
 */
const ESQUEMA = 3;
const SUFIJO_RESPALDO = '.antes-bloque3';

/**
 * Acomoda el estado guardado por una versión anterior. Idempotente: si ya está
 * en la versión actual no toca nada, así que arrancar dos veces da lo mismo.
 *
 * De la versión 3: las marcas de "ya se dijo" que hay en disco se pusieron al
 * DECIDIR, así que puede haber marcas de mensajes que el cliente nunca recibió
 * (una tanda cortada, un envío fallado, un chat en escucha o en borrador). Se
 * borran todas: en el peor caso el bot repite algo una vez. Lo del cliente
 * —nombre, modelo, entrega, notas, historial, temas, escalados, resultados,
 * recordatorios— queda igual.
 */
function migrar(datos) {
  const interno = datos[CLAVE_BOT] || {};
  if (Number(interno.esquema) >= ESQUEMA) return false;
  for (const [chatId, chat] of Object.entries(datos)) {
    if (chatId === CLAVE_BOT || !chat || typeof chat !== 'object') continue;
    for (const marca of MARCAS_DEL_BOT) delete chat[marca];
  }
  datos[CLAVE_BOT] = { ...interno, esquema: ESQUEMA };
  return true;
}

/** Una copia del archivo tal como estaba, antes de migrarlo. Se hace una sola vez. */
function respaldar() {
  const destino = ARCHIVO + SUFIJO_RESPALDO;
  try {
    if (fs.existsSync(destino)) return null;
    fs.copyFileSync(ARCHIVO, destino);
    return destino;
  } catch (e) {
    console.error('[state] no pude respaldar el estado:', e.message);
    return null;
  }
}

/**
 * El archivo existe pero no se puede leer (JSON cortado a la mitad, o algo que
 * no es un objeto). Se aparta TAL CUAL, byte a byte, en
 * `estado.json.corrupto-<fecha ISO sin ':'>`, y se arranca vacío. Antes se
 * arrancaba vacío en silencio y el archivo se pisaba enseguida con `{}`: no
 * quedaba nada para recuperar. En modo solo lectura no se copia nada.
 */
function apartarDanado(error) {
  const fecha = new Date().toISOString().replace(/:/g, '-');
  const copia = `${ARCHIVO}.corrupto-${fecha}`;
  let guardada = false;
  if (!SOLO_LECTURA) {
    try {
      fs.copyFileSync(ARCHIVO, copia);
      guardada = true;
    } catch (e) {
      console.error('[state] no pude apartar el archivo dañado:', e.message);
    }
  }
  console.error('');
  console.error('  ' + '!'.repeat(62));
  console.error(`  ESTADO DAÑADO: no se pudo leer ${ARCHIVO}`);
  console.error(`  (${error.message})`);
  console.error(guardada ? `  Copia tal cual en ${copia}` : '  No quedó copia (modo solo lectura o fallo al copiar).');
  const respaldo = ultimoRespaldo();
  if (respaldo) console.error(`  Último respaldo por hora: ${respaldo}`);
  console.error('  El bot arranca SIN MEMORIA de los chats.');
  console.error('  ' + '!'.repeat(62));
  console.error('');
  return { copia: guardada ? copia : null, error: error.message };
}

/**
 * El archivo existe pero no se pudo LEER (bloque 4b): EBUSY, EPERM, EACCES, que
 * en Windows pasan si el antivirus o un editor lo tienen abierto. No es lo
 * mismo que un archivo dañado: acá no sabemos qué hay adentro, así que no se
 * escribe nada (ni el archivo, ni el .tmp, ni un backup) y se tira, para que
 * el proceso no arranque. Hasta el bloque 4b cualquier error de lectura se
 * tomaba como "no existe": se arrancaba vacío y el primer guardado pisaba el
 * estado real con {}.
 */
const REINTENTOS_LECTURA = 5;
const ESPERA_LECTURA_MS = 100;

function noPudeLeer(error, intentos) {
  console.error('');
  console.error('  ' + '!'.repeat(62));
  console.error(`  NO PUDE LEER EL ESTADO: ${ARCHIVO}`);
  console.error(`  (${error.message}; ${intentos} intentos)`);
  console.error('  No arranco: si arrancara vacío, el primer guardado pisaría el estado real.');
  console.error('  No se escribió nada. Revisá qué tiene abierto el archivo (antivirus, un');
  console.error('  editor, otro proceso) y volvé a arrancar.');
  console.error('  ' + '!'.repeat(62));
  console.error('');
  const e = new Error(`no pude leer el estado ${ARCHIVO} (${error.message}) en ${intentos} intentos`);
  e.name = 'EstadoIlegible';
  e.code = error.code;
  e.causa = error;
  return e;
}

/**
 * Lee el archivo tal cual. null SOLO si no existe (ENOENT): arranque normal.
 * Cualquier otro error se reintenta unas pocas veces con una espera corta, como
 * el rename de `escribir`; si sigue fallando, tira EstadoIlegible. Vale igual en
 * modo solo lectura: un lector que no pudo leer tampoco tiene nada que mostrar.
 */
function leerCrudo() {
  for (let i = 0; ; i++) {
    try {
      return fs.readFileSync(ARCHIVO, 'utf8');
    } catch (e) {
      if (e.code === 'ENOENT') return null;
      if (i >= REINTENTOS_LECTURA) throw noPudeLeer(e, i + 1);
      dormirSync(ESPERA_LECTURA_MS * (i + 1));
    }
  }
}

function cargar() {
  // null: el archivo no existe, arranque normal. Si existe y no se puede leer,
  // leerCrudo tira y el módulo no termina de cargar: no se escribe nada.
  const crudo = leerCrudo();
  if (crudo !== null) {
    try {
      const datos = JSON.parse(crudo);
      if (!datos || typeof datos !== 'object' || Array.isArray(datos)) {
        throw new Error('el contenido no es un objeto JSON');
      }
      memoria = datos;
    } catch (e) {
      memoria = {};
      danado = apartarDanado(e);
    }
  }
  const migro = migrar(memoria);
  // Solo lectura: la migración queda en memoria y nada se escribe.
  if (SOLO_LECTURA) return;
  if (danado) {
    // Que el archivo quede con un JSON válido, ya apartado el original.
    sucio = true;
    guardarAhora();
    return;
  }
  if (!migro) return;
  // Solo si había algo que migrar: un estado nuevo arranca ya en la versión actual.
  if (crudo !== null) {
    const copia = respaldar();
    console.log(
      `[estado] migrado a la version ${ESQUEMA}: se borraron las marcas de "ya se dijo"` +
        (copia ? `. Copia del anterior en ${copia}` : '')
    );
  }
  sucio = true;
  guardarAhora();
}

/** Cómo quedó el arranque si el archivo estaba ilegible: { copia, error }, o null. */
function estadoDanado() {
  return danado;
}

// ---------------------------------------------------------------------------
// Escritura (auditoría del 15/09/2026, A7 — bloque 4)
// ---------------------------------------------------------------------------
// Una sola función escribe, y lo hace de forma atómica: a `estado.json.tmp` y
// después rename sobre el definitivo. Un corte a mitad de escritura deja el .tmp
// a medias y el definitivo intacto. En Windows el rename puede fallar con
// EPERM/EBUSY si otro proceso tiene el archivo abierto (antivirus, un editor):
// se reintenta unas pocas veces con una espera corta. Si igual falla, el error
// se ve en consola y los datos NO se pierden: siguen en memoria (`sucio` queda
// en true) y el próximo guardado los vuelve a intentar.
const REINTENTOS_RENAME = 5;
const ESPERA_RENAME_MS = 100;

/** Espera bloqueante: la escritura es sincrónica y también corre al salir. */
function dormirSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function escribir() {
  const tmp = ARCHIVO + '.tmp';
  fs.mkdirSync(path.dirname(ARCHIVO), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(memoria, null, 2));
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, ARCHIVO);
      return;
    } catch (e) {
      const pasajero = e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES';
      if (!pasajero || i >= REINTENTOS_RENAME) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ya no está */
        }
        throw e;
      }
      dormirSync(ESPERA_RENAME_MS * (i + 1));
    }
  }
}

/**
 * Copias de seguridad del estado (17/09/2026, decisión de Tomás). El 17/09 el
 * archivo apareció con 341 KB de ceros —Windows escribió el tamaño pero no los
 * datos— y el único respaldo era el de la migración del bloque 3, de dos días
 * antes: se perdió la memoria de 126 chats. Ahora, después de cada escritura
 * buena, queda una copia por hora en `data/backups/estado/` —la de la hora en curso se
 * pisa en cada guardado, así que siempre está al día— y se conservan las
 * últimas HORAS_DE_RESPALDO. Es una copia del archivo ya renombrado, así que
 * nunca se respalda algo a medio escribir.
 *
 * Nunca rompe el guardado: si algo falla, se avisa y se sigue.
 */
const HORAS_DE_RESPALDO = 24;

function dirDeRespaldos() {
  return path.join(path.dirname(ARCHIVO), 'backups', 'estado');
}

function respaldoPorHora(ahora = new Date()) {
  if (SOLO_LECTURA) return null;
  try {
    const dir = dirDeRespaldos();
    fs.mkdirSync(dir, { recursive: true });
    const hora = ahora.toISOString().slice(0, 13).replace(/:/g, '-'); // 2026-09-17T20
    const destino = path.join(dir, `estado-${hora}.json`);
    // Se pisa en cada guardado: la copia de la hora en curso queda siempre al día.
    fs.copyFileSync(ARCHIVO, destino);
    const viejos = fs
      .readdirSync(dir)
      .filter((n) => /^estado-.*\.json$/.test(n))
      .sort();
    for (const n of viejos.slice(0, Math.max(0, viejos.length - HORAS_DE_RESPALDO))) {
      try {
        fs.unlinkSync(path.join(dir, n));
      } catch {
        /* ya no está */
      }
    }
    return destino;
  } catch (e) {
    console.error('[state] no pude guardar la copia por hora del estado:', e.message);
    return null;
  }
}

/** El respaldo por hora más nuevo, o null. Se usa para decir dónde mirar si el archivo se dañó. */
function ultimoRespaldo() {
  try {
    const dir = dirDeRespaldos();
    const nombres = fs
      .readdirSync(dir)
      .filter((n) => /^estado-.*\.json$/.test(n))
      .sort();
    return nombres.length ? path.join(dir, nombres[nombres.length - 1]) : null;
  } catch {
    return null;
  }
}

/** Escribe ya mismo, sin esperar el segundo de gracia. Solo si hay cambios, y nunca en solo lectura. */
function guardarAhora() {
  if (guardadoPendiente) {
    clearTimeout(guardadoPendiente);
    guardadoPendiente = null;
  }
  if (SOLO_LECTURA || !sucio) return;
  try {
    escribir();
    sucio = false;
    respaldoPorHora();
  } catch (e) {
    console.error(
      `[state] no pude guardar el estado (${e.code || e.name}): ${e.message}. ` +
        'Los datos siguen en memoria y se reintenta en el próximo guardado.'
    );
  }
}

/** Anota que hay cambios y programa el guardado, con un segundo de gracia. */
function guardar() {
  sucio = true;
  if (SOLO_LECTURA || guardadoPendiente) return;
  guardadoPendiente = setTimeout(() => {
    guardadoPendiente = null;
    guardarAhora();
  }, 1000);
}

/** Cambios que tienen que estar en disco YA (ver marcarResumenEnviado). */
function guardarYa() {
  sucio = true;
  guardarAhora();
}

/**
 * Generación de cada chat: sube con cada `reiniciar`. Vive en memoria y no en
 * disco, porque solo importa mientras haya algo corriendo.
 *
 * Existe por las tandas de index.js. Una tanda que ya estaba interpretando o
 * mandando cuando llegó un #reset sigue viva, y `decidir` lee y anota por chatId
 * después de cada await (Sonnet, Evolution): sin esto volvería a crear el chat
 * con lo de antes del reset. index.js enchufa en `vigilarTandas` una función que
 * dice de qué generación es la tanda que está corriendo; si no es la del chat,
 * `obtener` (y con él todo lo que lee o escribe ese chat) tira ChatReiniciado.
 * Fuera de una tanda (evaluar, chatear, el simulador, los comandos) esa función
 * devuelve null y no se controla nada.
 */
const generaciones = new Map();
let generacionQueCorre = () => null;

class ChatReiniciado extends Error {
  constructor(chatId) {
    super(`${chatId} se reinicio mientras se lo atendia`);
    this.name = 'ChatReiniciado';
  }
}

function generacion(chatId) {
  return generaciones.get(chatId) || 0;
}

function vigilarTandas(fn) {
  generacionQueCorre = fn;
}

/** Tira ChatReiniciado si lo que está corriendo es de una generación vieja de este chat. */
function comprobarVigente(chatId) {
  const g = generacionQueCorre(chatId);
  if (g !== null && g !== undefined && g !== generacion(chatId)) throw new ChatReiniciado(chatId);
}

function obtener(chatId) {
  comprobarVigente(chatId);
  if (!memoria[chatId]) {
    memoria[chatId] = {
      nombre: null,
      modelo: null,
      // El modelo que el bot eligió sin que el cliente lo nombrara (el más barato, el
      // mejor que le entra, el que le conviene). Se guarda al decidir, siempre, y NO
      // es una marca del bot: `modelo` sigue siendo la marca, confirmada al
      // enviarse. Es el respaldo del hilo solo cuando al cliente no le llega nada
      // (escucha, borrador). Ver responder.js `conModeloDelHilo` (Pendientes 1, A).
      modeloPropuesto: null,
      capacidad_gb: null,
      entrega: null,
      forma_pago: null,
      zona: null,
      timing: null,
      permuta: null,
      presupuestoAnotado: null, // lo que dijo tener cuando no llegó al mínimo
      notas: [], // lo que contó y no entra en ningún campo: máx. 5, solo para redactar
      resultado: null, // #vendido / #perdido: { tipo, ts, botParticipo, botLeMando }
      temasExplicados: {}, // financiacion, requisitos, garantia, metodos_pago que ya le llegaron (temas.js)
      noEntendido: null, // el último mensaje que no se entendió: { ts, texto }. Reemplaza a mensajesSinContenido
      ultimoContexto: null, // cómo llegó el último mensaje: { humanoAtendiendo, audio }. Desde el bloque 6 el aprendizaje lo toma de cada línea y cada tanda
      acuseContestado: null, // el último acuse que se contestó: { ts, texto }. Los que le siguen no se contestan
      escalado: false,
      pausado: false,
      ultimoHumano: 0,
      ultimoBot: 0,
      // Último mensaje del bot que le llegó al cliente (lo anota index.js al confirmar el envío).
      ultimoEnvioCliente: 0,
      historial: [],
    };
    // Bloque Ninjo 1b: después de un #reset, lo de antes no se trae de Evolution (contexto.js).
    const trasReset = tomarTrasReset(chatId);
    if (trasReset) memoria[chatId].evolutionTraido = trasReset;
  }
  return memoria[chatId];
}

function actualizar(chatId, cambios) {
  const s = obtener(chatId);
  Object.assign(s, cambios);
  guardar();
  return s;
}

/**
 * Confirma las marcas que traía un mensaje que SALIÓ (ver acciones.conMarcas).
 * Lo llama quien tiene la respuesta de Evolution en la mano: index.js al enviar,
 * y evaluar/guion/chatear/el simulador, donde todo envío sale.
 *
 * `preciosMostradosDe` se suma a lo que ya había en vez de pisarlo: cada mensaje
 * confirma los modelos que él mostró, sin depender del orden de la tanda.
 */
function confirmarMarcas(chatId, marcas) {
  if (!marcas) return;
  const s = obtener(chatId);
  const cambios = {};
  for (const [campo, valor] of Object.entries(marcas)) {
    if (MARCAS_QUE_SE_SUMAN.includes(campo)) {
      cambios[campo] = [...new Set([...(s[campo] || []), ...(Array.isArray(valor) ? valor : [valor])])];
    } else if (MARCAS_QUE_SE_MEZCLAN.includes(campo) && valor && typeof valor === 'object') {
      cambios[campo] = { ...(s[campo] || {}), ...valor };
    } else {
      cambios[campo] = valor;
    }
  }
  Object.assign(s, cambios);
  guardar();
  return s;
}

/**
 * Cuántas líneas de cada chat se recuerdan. Es el contexto que lee el bot. 30 desde el 01/10/2026
 * (decisión de Tomás, mínimo 20; caso Oriana …4038: con 15 se perdían los datos del canje que el
 * cliente le había pasado a una persona).
 */
const LARGO_HISTORIAL = 30;

/**
 * `humano`: la línea la escribió una persona de la cuenta, no el bot (bloque 10). Solo en
 * las del vendedor; sin la marca (también las de antes del bloque 10) es del bot.
 */
/**
 * `sinConfirmar` (desde cero, 29/09/2026): un texto del bot que Evolution no confirmó (sin id).
 * Queda en el historial como siempre, pero no cuenta como "ya se lo dije" (D5, responder.js).
 */
/**
 * `id` (bloque Ninjo 1b, 05/10/2026): el id de WhatsApp del mensaje, cuando lo hay (la línea del
 * cliente, un envío del bot que Evolution confirmó, una persona de la cuenta). Con él, lo que trae
 * contexto.js de Evolution no entra dos veces.
 */
function agregarAlHistorial(chatId, quien, texto, { humano = false, sinConfirmar = false, id = null } = {}) {
  const s = obtener(chatId);
  const linea = humano ? { quien, texto, ts: Date.now(), humano: true } : { quien, texto, ts: Date.now() };
  if (sinConfirmar) linea.sinConfirmar = true;
  if (id) linea.id = String(id);
  s.historial.push(linea);
  if (s.historial.length > LARGO_HISTORIAL) {
    s.historial = s.historial.slice(-LARGO_HISTORIAL);
  }
  // Las de una persona de la cuenta van además aparte, con su hora (01/10/2026, caso Jazz): el
  // tope de 15 líneas se las llevaba y el bot dejaba de ver lo que había quedado dicho.
  if (humano && String(texto || '').trim()) {
    s.lineasPersona = [...(s.lineasPersona || []), { texto, ts: linea.ts }].slice(-LINEAS_PERSONA);
  }
  guardar();
}

/** Cuántas líneas de una persona de la cuenta se guardan aparte (`lineasPersona`). */
const LINEAS_PERSONA = 5;

/**
 * El historial completado con Evolution (contexto.js, bloque Ninjo 1b): `historial` ya viene
 * ordenado por hora (se guardan las últimas 30), `persona` son las líneas de una persona de la
 * cuenta que trajo Evolution (van también a `lineasPersona`, con su hora) y `traido`, la fecha que
 * queda en `evolutionTraido`: con ella no se vuelve a pedir.
 */
function completarHistorial(chatId, historial, { traido = Date.now(), persona = [] } = {}) {
  const s = obtener(chatId);
  s.historial = (historial || []).slice(-LARGO_HISTORIAL);
  const deLaPersona = (persona || []).filter((l) => l && String(l.texto || '').trim()).map((l) => ({ texto: l.texto, ts: l.ts }));
  if (deLaPersona.length) {
    s.lineasPersona = [...(s.lineasPersona || []), ...deLaPersona].sort((a, b) => a.ts - b.ts).slice(-LINEAS_PERSONA);
  }
  s.evolutionTraido = traido;
  guardar();
  return s;
}

/**
 * Las últimas 5 líneas de una persona de la cuenta, con su hora y de la más vieja a la más nueva
 * (01/10/2026): las guardadas aparte y las del historial, que en los chats de antes de esa fecha
 * son las únicas. Sin las vacías (una foto o un documento de la persona).
 */
function lineasDePersona(s) {
  const vistas = new Set();
  // Primero las del historial: con la misma hora (el mismo milisegundo), su orden es el de llegada.
  return [...((s && s.historial) || []).filter((l) => l && l.humano), ...((s && s.lineasPersona) || [])]
    .map((l) => ({ texto: String((l && l.texto) || ''), ts: Number(l && l.ts) || 0 }))
    .filter((l) => {
      const clave = `${l.ts}|${l.texto}`;
      if (!l.texto.trim() || !l.ts || vistas.has(clave)) return false;
      vistas.add(clave);
      return true;
    })
    .sort((a, b) => a.ts - b.ts)
    .slice(-LINEAS_PERSONA);
}

/**
 * El historial como lo lee Gemini. Desde el 01/10/2026 distingue a una persona de la cuenta del
 * bot (hasta ahí los dos eran "Vendedor"): lo que dejó dicho una persona se respeta.
 */
function historialTexto(chatId) {
  const quien = (m) => (m.quien === 'cliente' ? 'Cliente' : m.humano ? 'Persona de la cuenta' : 'Bot');
  return obtener(chatId)
    .historial.map((m) => `${quien(m)}: ${m.texto}`)
    .join('\n');
}

/** ¿Hay un humano atendiendo este chat ahora mismo? */
function humanoActivo(chatId, minutos) {
  const s = obtener(chatId);
  if (s.pausado) return true;
  return Date.now() - (s.ultimoHumano || 0) < minutos * 60 * 1000;
}

/**
 * Estado del bot que no pertenece a ninguna conversación (por ahora, qué día
 * salió el resumen). Va en el mismo archivo, bajo una clave que no puede
 * chocar con un JID de WhatsApp: ninguno lleva ':'.
 */
const CLAVE_BOT = 'bot:interno';

function interno() {
  if (!memoria[CLAVE_BOT]) memoria[CLAVE_BOT] = {};
  return memoria[CLAVE_BOT];
}

// Se lee el archivo (y se migra, si hace falta) recién acá: `cargar` necesita
// CLAVE_BOT y `guardarAhora`, que se definen más arriba.
cargar();

// Si se corta el bot (Ctrl+C, apagón, reinicio) se vuelca lo que quedaba
// pendiente: si no, se pierde el último segundo de conversaciones. Solo si hubo
// cambios: un proceso que solo leyó no toca el archivo. Va DESPUÉS de `cargar`
// a propósito: si la lectura tiró, no queda ningún manejador que pueda escribir.
let cerrando = false;
for (const senal of ['SIGINT', 'SIGTERM', 'beforeExit']) {
  process.on(senal, () => {
    if (cerrando) return;
    cerrando = true;
    guardarAhora();
    if (senal !== 'beforeExit') process.exit(0);
  });
}

/** El día (toDateString) en que salió el último resumen de la mañana. */
function resumenEnviadoDe() {
  return interno().resumenDe || '';
}

/**
 * Deja anotado que el resumen de ese día ya salió.
 *
 * Guarda YA, sin esperar el segundo de gracia de `guardar()`: si el bot se
 * reinicia justo después de mandarlo, la marca tiene que estar en disco o el
 * resumen sale dos veces.
 */
function marcarResumenEnviado(dia) {
  interno().resumenDe = dia;
  guardarYa();
}

/**
 * Mensajes ya recibidos por el webhook (auditoría del 15/09/2026, A6 — bloque 4).
 * Clave: `remoteJid|key.id`. Si Evolution entrega dos veces el mismo
 * `messages.upsert`, la segunda se descarta. Viven bajo la clave interna, así
 * sobreviven a un reinicio y `#reset` no los borra: un mensaje ya procesado no se
 * reprocesa aunque el chat se reinicie. Se podan los de más de VISTOS_MS y hay un
 * tope de cantidad (se van los más viejos): al vincular el QR llegan cientos.
 *
 * Devuelve true si es la primera vez que se ve (y lo anota), false si ya estaba.
 */
const VISTOS_MS = 30 * 60 * 1000;
const VISTOS_MAX = 5000;

function marcarVisto(clave, ahora = Date.now()) {
  const i = interno();
  if (!i.vistos || typeof i.vistos !== 'object') i.vistos = {};
  const vistos = i.vistos;
  for (const [k, ts] of Object.entries(vistos)) {
    if (ahora - Number(ts) > VISTOS_MS) delete vistos[k];
  }
  if (Object.prototype.hasOwnProperty.call(vistos, clave)) return false;
  vistos[clave] = ahora;
  const claves = Object.keys(vistos);
  if (claves.length > VISTOS_MAX) {
    claves.sort((a, b) => vistos[a] - vistos[b]);
    for (const k of claves.slice(0, claves.length - VISTOS_MAX)) delete vistos[k];
  }
  guardar();
  return true;
}

/**
 * Recordatorios manuales (#recordar), uno por chat, bajo la clave interna.
 *
 * No van dentro del chat a propósito: así `reiniciar` no se lleva un
 * recordatorio sin que nadie lo decida. Desde el 15/09/2026 `#reset` lo borra,
 * pero aparte y a la vista (`reiniciarChat` en index.js). Guardan YA, igual que la marca del
 * resumen: si el bot se reinicia justo después de un aviso, la cuenta tiene que
 * estar en disco o el aviso sale dos veces en la misma hora.
 */
function recordatorios() {
  const i = interno();
  if (!i.recordatorios) i.recordatorios = {};
  return i.recordatorios;
}

function guardarRecordatorio(chatId, r) {
  recordatorios()[chatId] = r;
  guardarYa();
}

function borrarRecordatorio(chatId) {
  delete recordatorios()[chatId];
  guardarYa();
}

/**
 * Excluidos por comando (#excluir / #incluir, src/excluidos.js; decisión de Tomás del 29/10/2026): números
 * que el bot ignora ENTEROS, como los de CONTACTOS_PERSONALES, pero que se dan de alta y de baja desde
 * WhatsApp, sin tocar el .env ni reiniciar. `{ número: { desde, nombre, origen } }` bajo la clave interna,
 * como los recordatorios: sobreviven a un reinicio, quedan en el respaldo por hora y #reset no los toca. No
 * van dentro del chat a propósito: se puede excluir un número que nunca escribió (un proveedor) sin crearle
 * un chat. Guardan YA: es una decisión de la cuenta y no se puede perder con un corte.
 */
function excluidos() {
  const i = interno();
  if (!i.excluidos || typeof i.excluidos !== 'object' || Array.isArray(i.excluidos)) {
    // Solo pasa si alguien tocó estado.json a mano: lo que había no se puede leer y la lista arranca vacía.
    if (i.excluidos !== undefined) console.error(`[state] la lista de excluidos estaba dañada (${JSON.stringify(i.excluidos).slice(0, 80)}): arranca vacía`);
    i.excluidos = {};
  }
  return i.excluidos;
}

/**
 * La lista de excluidos para LEER (#excluidos), sin crear ni arreglar nada: dañada o ausente da {}. Si leer
 * la arreglara, el próximo guardado pisaría en disco lo que había, sin que nadie lo decidiera.
 */
function leerExcluidos() {
  const e = memoria[CLAVE_BOT] && memoria[CLAVE_BOT].excluidos;
  return e && typeof e === 'object' && !Array.isArray(e) ? e : {};
}

function guardarExcluido(numero, datos) {
  excluidos()[numero] = datos;
  guardarYa();
}

function borrarExcluido(numero) {
  delete excluidos()[numero];
  guardarYa();
}

/**
 * Los números excluidos por comando, sin crear nada: lo mira evolution.esContactoPersonal con cada mensaje
 * que llega, y un proceso que solo lee no tiene por qué dejar un `excluidos: {}` en el archivo.
 */
function numerosExcluidos() {
  return Object.keys(leerExcluidos());
}

/**
 * Archivos que genera el bot (la imagen del simulador, el presupuesto en PDF; src/generados.js): para qué
 * chat se generó cada uno y cuándo. `{ clave: { chatId, ts } }` bajo la clave interna: sobrevive a un
 * reinicio y #reset no lo toca. Un archivo sale solo a ese chat y solo por 24 h (evolution.enviarGenerado).
 * Guarda YA: si el bot se reinicia justo después de generar, el archivo tiene que seguir registrado.
 */
function generados() {
  const i = interno();
  if (!i.generados || typeof i.generados !== 'object' || Array.isArray(i.generados)) i.generados = {};
  return i.generados;
}

function guardarGenerado(clave, datos) {
  generados()[clave] = datos;
  guardarYa();
}

/** Saca del registro las claves que ya no sirven (la poda de generados.js). Los archivos no se tocan. */
function borrarGenerados(claves) {
  const g = generados();
  for (const c of claves) delete g[c];
  guardarYa();
}

/**
 * El gasto de Sonnet del mes (bloque Ninjo 2, 06/10/2026): `{ mes: 'AAAA-MM', usd }`, el mes de
 * Argentina. Lo suma cerebro.js con cada llamada a la API (`sumarAlMes`), en el mismo lugar que el
 * gasto del día; /salud lo muestra. Bajo la clave interna: sobrevive a un reinicio y #reset no lo toca.
 * Guarda con el segundo de gracia de siempre: es una cuenta para mirar, no una decisión.
 */
function gastoSonnetMes() {
  const g = interno().gastoSonnetMes;
  return g && typeof g === 'object' && typeof g.mes === 'string' ? g : null;
}

function guardarGastoSonnetMes(g) {
  interno().gastoSonnetMes = g ? { mes: g.mes, usd: Number(g.usd) || 0 } : null;
  guardar();
}

/** El mes ('AAAA-MM') en que ya salió el aviso del 80% del tope de Sonnet ('' si ninguno). Guarda YA, como el resumen. */
function gastoSonnetAvisado() {
  return interno().gastoSonnetAvisado || '';
}

function marcarGastoSonnetAvisado(mes) {
  interno().gastoSonnetAvisado = mes;
  guardarYa();
}

/**
 * Borra el chat entero y sube su generación: lo que venía corriendo para ese
 * chat ya no lee ni escribe (ver `generacion`).
 */
function reiniciar(chatId, { evolutionTraido = null } = {}) {
  const habia = Boolean(memoria[chatId]);
  delete memoria[chatId];
  generaciones.set(chatId, generacion(chatId) + 1);
  if (evolutionTraido) anotarTrasReset(chatId, evolutionTraido);
  guardarYa();
  return habia;
}

/**
 * #reset (bloque Ninjo 1b): el chat queda con `evolutionTraido` en la hora del reset, así
 * contexto.js no trae lo de antes y cada prueba del tester arranca limpia. El chat no se vuelve a
 * crear al resetear (un chat que no está sigue siendo nuevo para `CEREBRO_MODO=nuevos`, y #reset
 * lo deja borrado): la hora queda bajo la clave interna y `obtener` la pone cuando el chat vuelve a
 * nacer. Se guardan como mucho 500, y ninguna de más de 30 días.
 */
const TRAS_RESET_MAX = 500;
const TRAS_RESET_DIAS = 30;

function anotarTrasReset(chatId, ts) {
  const i = interno();
  const limite = Date.now() - TRAS_RESET_DIAS * 24 * 60 * 60 * 1000;
  const vigentes = Object.entries(i.trasReset || {}).filter(([id, t]) => id !== chatId && Number(t) > limite);
  i.trasReset = Object.fromEntries([...vigentes, [chatId, ts]].sort((a, b) => a[1] - b[1]).slice(-TRAS_RESET_MAX));
}

/** La hora del #reset del chat, si quedó pendiente (y la saca): la usa `obtener` al crear el chat. */
function tomarTrasReset(chatId) {
  const i = memoria[CLAVE_BOT];
  const ts = i && i.trasReset ? i.trasReset[chatId] : null;
  if (ts) delete i.trasReset[chatId];
  return ts || null;
}

/**
 * Todas las conversaciones, para el barrido de seguimientos y el resumen.
 * Se esconde la clave interna: los que recorren esto esperan chats, no
 * configuración del bot.
 */
function todos() {
  const { [CLAVE_BOT]: _interno, ...chats } = memoria;
  return chats;
}

module.exports = {
  obtener,
  respaldoPorHora,
  ultimoRespaldo,
  HORAS_DE_RESPALDO,
  actualizar,
  confirmarMarcas,
  migrar,
  MARCAS_DEL_BOT,
  ESQUEMA,
  agregarAlHistorial,
  completarHistorial,
  historialTexto,
  lineasDePersona,
  LINEAS_PERSONA,
  LARGO_HISTORIAL,
  gastoSonnetMes,
  guardarGastoSonnetMes,
  gastoSonnetAvisado,
  marcarGastoSonnetAvisado,
  humanoActivo,
  todos,
  reiniciar,
  generacion,
  vigilarTandas,
  comprobarVigente,
  ChatReiniciado,
  guardarAhora,
  estadoDanado,
  marcarVisto,
  VISTOS_MS,
  VISTOS_MAX,
  SOLO_LECTURA,
  resumenEnviadoDe,
  marcarResumenEnviado,
  recordatorios,
  guardarRecordatorio,
  borrarRecordatorio,
  excluidos,
  leerExcluidos,
  guardarExcluido,
  borrarExcluido,
  numerosExcluidos,
  generados,
  guardarGenerado,
  borrarGenerados,
  ARCHIVO,
};
