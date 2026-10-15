'use strict';
/**
 * Chats viejos para SOLO_CHATS_NUEVOS (decisión de Tomás del 29/09/2026).
 *
 * Un chat es NUEVO solo si empezó desde cero con el bot mirando y nunca escribió nadie de la
 * cuenta. Todo lo demás es VIEJO y, con SOLO_CHATS_NUEVOS=true, va en borrador (el tester no
 * cambia; ver evolution.js `esChatViejo`). Hasta acá SOLO_CHATS_NUEVOS miraba solo estado.json,
 * que no tiene la mayoría de los chats reales (el 29/09: 112 chats reales ahí y 958 claves de
 * chats individuales en la base de Evolution): un cliente viejo que volvía a escribir era nuevo.
 *
 * La lista vive en `chats-viejos.json`, en la misma carpeta que estado.json (sale de
 * ESTADO_PATH, así las pruebas usan una temporal), y no en estado.json:
 *  - viejos: { número: { desde, motivo } }. `desde` es la fecha del mensaje que lo hizo viejo.
 *  - lids: { lid: número }, para traducir un `@lid` que llega sin remoteJidAlt; null si no se
 *    pudo traducir (se cuentan: "@lid sin traducir").
 *  - alDia: hasta cuándo se miró Evolution (ISO).
 *  - idsBot: los ids de los últimos 200 envíos confirmados del bot, para que un envío propio
 *    nunca marque su chat como viejo (50 hasta el 29/09: la ventana de la vuelta de un corte
 *    puede tener muchos envíos de antes del corte).
 *  - semilla: cuándo se sembró y con cuántos; `primerArranque` se llena en el primero.
 *  - sinMirar: { número: hora (ISO) } de los chats que el bot vio por primera vez con la lista
 *    atrasada, con la hora del primer mensaje suyo que procesó (30/09/2026, ver abajo). Se vacía
 *    cada vez que se pone al día.
 *
 * Cómo se llena:
 *  1. La semilla, una vez y con el bot frenado: `npm run sembrar-viejos` (test/sembrar-viejos.js).
 *  2. Cada arranque de verdad (index.js, donde se levanta el puerto) se pone al día con Evolution
 *     (evolution.buscarMensajes, solo lectura) en la ventana que va de `alDia` al momento en que
 *     empezó a escuchar. En el primer arranque después de la semilla, cualquier chat con un
 *     mensaje en la ventana es viejo. En los siguientes: un mensaje propio que no es un envío
 *     guardado del bot (con el bot apagado lo escribió una persona), o un chat que no está ni en
 *     estado.json ni en la lista (empezó con el bot apagado). Un chat nuevo que el bot ya conocía
 *     y donde solo escribió el cliente sigue nuevo.
 *  3. Lo que llega por el webhook después de empezar a escuchar se maneja como siempre: un chat
 *     que arranca ahí es nuevo, y si escribe una persona lo agarra `loAtendioUnaPersona`.
 *
 * Mientras se pone al día, los mensajes esperan (`esperar`, hasta 60 s). Si no puede (Evolution
 * no responde, falta la semilla, un error): con SOLO_CHATS_NUEVOS todo va en borrador salvo el
 * tester, avisa al grupo una vez por racha, reintenta cada 5 minutos y, al lograrlo, avisa de
 * vuelta; apagado, solo lo loguea (la puesta al día corre igual, para que la lista esté completa
 * cuando se prenda). `alDia` avanza cada 60 s mientras está al día y en cada envío confirmado;
 * nunca mientras está atrasado.
 *
 * Caída de Evolution con el bot andando (29/09/2026). El guardián (index.js, `revisarGuardian`)
 * avisa cuando abre y cierra un corte (`abrirCorte`, `cerrarCorte`). Al abrir: para el reloj,
 * lleva `alDia` a la última señal buena (nunca hacia adelante) y queda atrasado con el motivo del
 * corte; un envío confirmado guarda su id pero no mueve `alDia`, y no avisa nada al grupo (ya avisó
 * el guardián). Al cerrar el último: espera 2 minutos (VUELTA_MS: que Evolution termine de
 * guardar lo del corte) y se pone al día de `alDia` hasta ahora, no hasta `escucha`, con las
 * reglas del arranque siguiente; si falla, el camino de siempre (reintentos hasta ahora, un aviso
 * por racha). Una puesta al día que termina con un corte en el medio no deja al día.
 *
 * Un chat que entra a estado.json con la lista atrasada (30/09/2026). Un chat que empezó sin el
 * bot mirando (durante un corte, o con el bot apagado) y vuelve a escribir antes de que la lista
 * se ponga al día (en la espera de la vuelta, en sus reintentos o en un arranque lento) entra a
 * estado.json, y la puesta al día lo daba por conocido: quedaba nuevo. Ahora index.js avisa cada
 * mensaje de un cliente antes de que el chat entre al estado (`entroDelCliente`): si la lista no
 * está al día y el chat no está en estado.json, se anota la hora de ese mensaje (`sinMirar`, que
 * se guarda en el archivo por si el bot se reinicia antes). Al ponerse al día, si Evolution tiene
 * un mensaje de ese chat de antes del primero que vio el bot, no cuenta como conocido: es viejo,
 * con el motivo del corte o del bot apagado. Si el primero que vio es el primero que hay, sigue
 * nuevo.
 *
 * Requerirlo no lee nada ni llama a Evolution. Sin `arrancar` queda "sin arrancar" (pruebas,
 * evaluar, guion, chatear): lista vacía, sin espera y sin borrador forzado, como hasta ahora.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');

const ARCHIVO = path.join(
  path.dirname(config.estadoPath || path.join(__dirname, '..', 'data', 'estado.json')),
  'chats-viejos.json'
);

const TICK_MS = 60 * 1000;
const REINTENTO_MS = 5 * 60 * 1000;
const ESPERA_MAX_MS = 60 * 1000;
// A la vuelta de un corte de Evolution: que termine de guardar lo que entró durante el corte.
const VUELTA_MS = 2 * 60 * 1000;
const POR_PAGINA = 500;
const MAX_IDS_BOT = 200;

const AVISO_EVOLUTION =
  '⚠️ No pude ponerme al día con Evolution (chats viejos). Hasta que lo logre, todo va en borrador salvo el tester.';
const AVISO_SIN_SEMILLA =
  '⚠️ Falta la lista de chats viejos (npm run sembrar-viejos). Hasta que exista, todo va en borrador salvo el tester.';
const AVISO_AL_DIA = '✅ Me puse al día con Evolution: vuelvo a contestar los chats nuevos.';

const MOTIVOS = {
  primerArranque: 'mensaje entre la semilla y el primer arranque',
  persona: 'escribió alguien de la cuenta con el bot apagado',
  apagado: 'empezó con el bot apagado',
  // Las mismas reglas, a la vuelta de un corte de Evolution con el bot andando.
  personaCorte: 'escribió alguien de la cuenta durante un corte de Evolution',
  corte: 'empezó durante un corte de Evolution',
};

// inactivo (nunca arrancó) | poniendose | al-dia | atrasado
let fase = 'inactivo';
let motivo = '';
let datos = null; // la lista, recién después de ponerse al día
let leida = null; // lo último que se leyó del archivo, para /salud mientras está atrasado
let intento = null; // la puesta al día en curso
let opciones = null;
let avisado = false; // ya salió el ⚠️ de esta racha
let reloj = null;
let reintento = null;
let numerosCache = null;
// Los envíos confirmados de este proceso: se guardan con la lista, o esperan a que se cargue.
let idsBot = [];
// Caída de Evolution: los cortes que el guardián tiene abiertos ({ instancia, webhook }: el
// motivo de cada uno), la última señal buena desde la última puesta al día completa (ms, o null),
// la espera de la vuelta, si ya hubo un corte (desde ahí la ventana va hasta ahora) y un número
// que sube con cada corte: una puesta al día o una vuelta de antes de un corte no deja al día.
let cortes = {};
let tope = null;
let vuelta = null;
let trasCorte = false;
let generacion = 0;
// Chats que el bot vio por primera vez con la lista atrasada (30/09/2026): { número: ISO }. Los de
// este proceso que todavía no pasaron a la lista cargada (se pasan al clasificar).
let sinMirar = {};

/** Sin lista que completar: no está sembrada, o el archivo está dañado (no se pisa). */
class SinSemilla extends Error {
  constructor(detalle = 'falta la semilla (npm run sembrar-viejos)') {
    super(detalle);
    this.name = 'SinSemilla';
  }
}

/** Los dígitos de un JID (`549…@s.whatsapp.net`, `…@lid`, con o sin `:dispositivo`). */
function digitos(jid) {
  return String(jid || '').split('@')[0].split(':')[0].replace(/\D/g, '');
}

const objeto = (v) => (v && typeof v === 'object' && !Array.isArray(v) ? v : {});

/** Lee chats-viejos.json. null si no existe; tira si está dañado o no se puede leer. */
function leer(archivo = ARCHIVO) {
  let crudo;
  try {
    crudo = fs.readFileSync(archivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return null;
    throw e;
  }
  const d = JSON.parse(crudo);
  if (!d || typeof d !== 'object' || Array.isArray(d)) throw new Error(`${path.basename(archivo)} no es un objeto JSON`);
  return {
    viejos: objeto(d.viejos),
    lids: objeto(d.lids),
    alDia: d.alDia || null,
    idsBot: Array.isArray(d.idsBot) ? d.idsBot.map(String).slice(-MAX_IDS_BOT) : [],
    semilla: d.semilla && typeof d.semilla === 'object' ? d.semilla : null,
    sinMirar: objeto(d.sinMirar),
  };
}

/** Espera bloqueante: la escritura es sincrónica, como la de state.js. */
function dormirSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

/**
 * Escritura atómica, igual que state.js: a `.tmp` y rename sobre el definitivo. En Windows el
 * rename puede fallar un rato con EPERM/EBUSY (antivirus, un editor): se reintenta.
 */
function guardar(d, archivo = ARCHIVO) {
  const tmp = archivo + '.tmp';
  fs.mkdirSync(path.dirname(archivo), { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(d, null, 2));
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, archivo);
      return;
    } catch (e) {
      const pasajero = e.code === 'EPERM' || e.code === 'EBUSY' || e.code === 'EACCES';
      if (!pasajero || i >= 5) {
        try {
          fs.unlinkSync(tmp);
        } catch {
          /* ya no está */
        }
        throw e;
      }
      dormirSync(100 * (i + 1));
    }
  }
}

/** Guarda la lista cargada con los ids de este proceso. Nunca tira: si falla, se ve en consola. */
function guardarDatos() {
  if (!datos) return;
  try {
    guardar({ ...datos, idsBot, sinMirar: { ...(datos.sinMirar || {}), ...sinMirar } });
  } catch (e) {
    console.error(`[chats viejos] no pude guardar ${path.basename(ARCHIVO)} (${e.code || e.name}): ${e.message}`);
  }
}

const FORMATO_FECHA = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});

/** DD/MM HH:MM, hora argentina. Sin el año, es-AR no rellena el día ni el mes: se rellenan acá. */
function fecha(valor) {
  const t = typeof valor === 'number' ? valor : Date.parse(valor);
  if (!Number.isFinite(t)) return 'nunca';
  const p = Object.fromEntries(FORMATO_FECHA.formatToParts(new Date(t)).map((x) => [x.type, x.value.padStart(2, '0')]));
  return `${p.day}/${p.month} ${p.hour}:${p.minute}`;
}

/** Trae todos los mensajes guardados de la ventana, página por página. */
async function traer(desde, hasta) {
  const porClave = new Map();
  let pagina = 1;
  let paginas = 1;
  do {
    const r = await opciones.buscar({ desde, hasta, pagina, porPagina: opciones.porPagina });
    if (!r || !Array.isArray(r.registros)) throw new Error('Evolution contestó sin mensajes');
    paginas = Number(r.paginas) || 0;
    // Si entra un mensaje mientras se pagina, una página puede repetir el último de la anterior.
    for (const x of r.registros) {
      const k = (x && x.key) || {};
      porClave.set(k.id ? `${k.remoteJid}|${k.id}` : `sin-id-${porClave.size}`, x);
    }
    pagina++;
  } while (pagina <= paginas);
  return [...porClave.values()];
}

/**
 * ¿El bot ya conocía el chat? Está en estado.json y no entró ahí con la lista atrasada después de
 * un mensaje suyo que el bot no vio (30/09/2026): si Evolution tiene uno de antes del primero que
 * procesó el bot (`sinMirar`), el chat empezó sin el bot mirando.
 */
function conocidoDeAntes(numero, primero, anotados) {
  if (!opciones.enEstado(numero)) return false;
  const visto = Date.parse(anotados[numero]);
  return !(Number.isFinite(visto) && primero < visto);
}

/**
 * Pasa los mensajes de la ventana a la lista (`d`, que modifica). Devuelve cuántos mensajes y
 * chats miró, cuántos agregó y cuántos @lid no pudo traducir. `enVivo`: la ventana es de la
 * vuelta de un corte, con el bot andando (cambia solo el motivo).
 */
function clasificar(d, registros, primerArranque, enVivo = false) {
  const delBot = new Set([...d.idsBot, ...idsBot]);
  const porNumero = new Map();
  const sinTraducir = new Set();
  for (const x of registros) {
    const k = (x && x.key) || {};
    const jid = String(k.remoteJid || '');
    let numero = null;
    if (jid.endsWith('@s.whatsapp.net')) {
      numero = digitos(jid);
    } else if (jid.endsWith('@lid')) {
      const lid = digitos(jid);
      const alt = String(k.remoteJidAlt || '');
      if (alt.endsWith('@s.whatsapp.net')) {
        numero = digitos(alt);
        d.lids[lid] = numero;
      } else {
        numero = d.lids[lid] || null;
      }
      if (!numero) {
        if (!(lid in d.lids)) d.lids[lid] = null;
        sinTraducir.add(lid);
        continue;
      }
    } else {
      continue; // grupos, estados, difusiones
    }
    if (!numero) continue;
    const ts = Number(x.messageTimestamp) * 1000;
    const c = porNumero.get(numero) || { primero: ts, persona: null };
    c.primero = Math.min(c.primero, ts);
    const propio = k.fromMe === true || k.fromMe === 'true';
    if (propio && !delBot.has(String(k.id || ''))) c.persona = c.persona === null ? ts : Math.min(c.persona, ts);
    porNumero.set(numero, c);
  }
  let agregados = 0;
  for (const [numero, c] of porNumero) {
    if (d.viejos[numero] || opciones.esTester(numero)) continue;
    let por = null;
    let desde = c.primero;
    if (primerArranque) por = MOTIVOS.primerArranque;
    else if (c.persona !== null) {
      por = enVivo ? MOTIVOS.personaCorte : MOTIVOS.persona;
      desde = c.persona;
    } else if (!conocidoDeAntes(numero, c.primero, d.sinMirar || {})) por = enVivo ? MOTIVOS.corte : MOTIVOS.apagado;
    if (!por) continue;
    d.viejos[numero] = { desde: new Date(desde).toISOString(), motivo: por };
    agregados++;
  }
  return { mensajes: registros.length, chats: porNumero.size, agregados, sinTraducir: sinTraducir.size };
}

/**
 * Lee la lista, trae la ventana de Evolution y la completa. Tira si no puede. `gen` es el número
 * de cortes cuando empezó: si hubo uno en el medio, alDia no pasa de la última señal buena.
 */
async function actualizar(gen) {
  let d;
  try {
    d = leer();
  } catch (e) {
    throw new SinSemilla(`no pude leer ${path.basename(ARCHIVO)}: ${e.message}`);
  }
  leida = d;
  if (!d || !d.semilla) throw new SinSemilla();
  let desde = Date.parse(d.alDia || d.semilla.en);
  if (!Number.isFinite(desde)) throw new SinSemilla(`${path.basename(ARCHIVO)} no tiene alDia`);
  // Un corte frenó alDia en la última señal buena: la ventana nunca empieza después.
  if (tope !== null) desde = Math.min(desde, tope);
  // Al arrancar, hasta que empezó a escuchar: lo de después lo ve el webhook. Después de un corte
  // (la vuelta y sus reintentos), hasta ahora: lo del corte tampoco lo vio el webhook.
  const hasta = trasCorte ? Date.now() : opciones.escucha;
  const enVivo = trasCorte && datos !== null;
  const registros = desde <= hasta ? await traer(desde, hasta) : [];
  // Los chats que entraron con la lista atrasada, también los que entraron mientras se traía.
  d.sinMirar = { ...d.sinMirar, ...sinMirar };
  sinMirar = {};
  const primerArranque = !d.semilla.primerArranque;
  const r = { desde, hasta, ...clasificar(d, registros, primerArranque, enVivo) };
  if (primerArranque) d.semilla.primerArranque = new Date().toISOString();
  if (gen !== generacion) {
    // Evolution se cortó mientras tanto: lo mirado sirve, pero alDia no pasa de la última señal buena.
    d.alDia = new Date(tope !== null ? Math.min(Date.now(), tope) : desde).toISOString();
  } else {
    // Lo que pasó desde `hasta` lo vio el webhook: queda al día hasta ahora.
    d.alDia = new Date().toISOString();
    tope = null;
    // Ya se miraron: lo que entre desde acá, con la lista al día, es lo de siempre.
    d.sinMirar = {};
  }
  idsBot = [...new Set([...d.idsBot, ...idsBot])].slice(-MAX_IDS_BOT);
  datos = d;
  leida = d;
  numerosCache = null;
  guardarDatos();
  return r;
}

async function avisar(texto) {
  try {
    await opciones.avisar(texto);
  } catch (e) {
    console.error('[chats viejos] no pude avisar al grupo:', e.message);
  }
}

async function alLograrlo(r) {
  fase = 'al-dia';
  motivo = '';
  clearTimeout(reintento);
  reintento = null;
  clearInterval(reloj);
  // Solo existe al día: mientras está atrasado no hay reloj y alDia no se mueve.
  reloj = setInterval(() => {
    datos.alDia = new Date().toISOString();
    guardarDatos();
  }, opciones.tickMs);
  if (reloj.unref) reloj.unref();
  console.log(linea());
  console.log(
    `[chats viejos] miré ${r.mensajes} mensaje(s) de ${r.chats} chat(s) entre ${fecha(r.desde)} y ` +
      `${fecha(r.hasta)}: ${r.agregados} chat(s) nuevo(s) en la lista`
  );
  if (avisado && config.soloChatsNuevos) {
    const k = lidSinTraducir();
    await avisar(AVISO_AL_DIA + (k ? `\n@lid sin traducir: ${k}` : ''));
  }
  avisado = false;
}

async function alFallar(e) {
  fase = 'atrasado';
  const sinSemilla = e instanceof SinSemilla;
  motivo = sinSemilla ? e.message : `${e.message}${e.cause && e.cause.code ? ` (${e.cause.code})` : ''}`;
  console.log(
    `CHATS VIEJOS: no pude ponerme al día (${motivo}). ` +
      (config.soloChatsNuevos
        ? 'Hasta que lo logre, todo va en borrador salvo el tester.'
        : 'SOLO_CHATS_NUEVOS está apagado: no cambia a quién le escribe.') +
      ` Reintento en ${Math.round(opciones.reintentoMs / 60000) || 1} min.`
  );
  clearTimeout(reintento);
  reintento = setTimeout(() => ponerseAlDia(), opciones.reintentoMs);
  if (reintento.unref) reintento.unref();
  if (config.soloChatsNuevos && !avisado) {
    avisado = true;
    await avisar(sinSemilla ? AVISO_SIN_SEMILLA : AVISO_EVOLUTION);
  }
}

/**
 * Se cortó Evolution mientras se ponía al día: sigue atrasado como lo dejó el corte, sin reloj, sin
 * reintento y sin aviso. Lo retoma la vuelta.
 */
function alInterrumpir() {
  console.log('[chats viejos] Evolution se cortó mientras me ponía al día: no quedo al día, me pongo al día a la vuelta');
}

function ponerseAlDia() {
  fase = 'poniendose';
  const gen = generacion;
  const este = (async () => {
    try {
      const r = await actualizar(gen);
      // Se mira acá y no solo en actualizar: un corte puede abrirse en el salto entre los dos.
      if (gen !== generacion) alInterrumpir();
      else await alLograrlo(r);
    } catch (e) {
      if (gen !== generacion) alInterrumpir();
      else await alFallar(e);
    }
  })();
  intento = este;
  este.finally(() => {
    if (intento === este) intento = null;
  });
  return este;
}

/**
 * Arranca la puesta al día. Lo llama index.js cuando el bot empieza a escuchar el puerto, con
 * ese momento en `escucha`, y lo que hace falta de afuera: `buscar` (evolution.buscarMensajes),
 * `avisar` (al grupo), `enEstado(número)` (¿está en estado.json?) y `esTester(número)`.
 * Devuelve la promesa del primer intento (nunca tira).
 */
function arrancar(o = {}) {
  detener();
  opciones = {
    escucha: o.escucha || Date.now(),
    buscar: o.buscar,
    avisar: o.avisar || (async () => {}),
    enEstado: o.enEstado || (() => false),
    esTester: o.esTester || (() => false),
    porPagina: o.porPagina || POR_PAGINA,
    tickMs: o.tickMs || TICK_MS,
    reintentoMs: o.reintentoMs || REINTENTO_MS,
    esperaMaxMs: o.esperaMaxMs || ESPERA_MAX_MS,
    vueltaMs: o.vueltaMs || VUELTA_MS,
  };
  try {
    leida = leer();
  } catch {
    leida = null;
  }
  return ponerseAlDia();
}

/** Para las pruebas: corta los relojes y vuelve a "sin arrancar", sin tocar el archivo. */
function detener() {
  clearInterval(reloj);
  clearTimeout(reintento);
  clearTimeout(vuelta);
  reloj = null;
  reintento = null;
  vuelta = null;
  cortes = {};
  tope = null;
  trasCorte = false;
  sinMirar = {};
  fase = 'inactivo';
  motivo = '';
  datos = null;
  leida = null;
  intento = null;
  avisado = false;
  numerosCache = null;
  idsBot = [];
}

/**
 * Espera a que termine la puesta al día en curso, con tope (60 s): un mensaje que llega mientras
 * tanto se decide con la lista completa. Si no hay ninguna en curso, vuelve enseguida.
 */
function esperar(maxMs) {
  if (!intento) return Promise.resolve();
  const tope = maxMs || (opciones && opciones.esperaMaxMs) || ESPERA_MAX_MS;
  let t;
  const vencida = new Promise((r) => {
    t = setTimeout(r, tope);
    if (t.unref) t.unref();
  });
  return Promise.race([intento, vencida]).finally(() => clearTimeout(t));
}

/**
 * ¿Se puede confiar en la lista? false mientras se pone al día o si no pudo: con
 * SOLO_CHATS_NUEVOS, ahí todo va en borrador salvo el tester. Sin arrancar (pruebas, evaluar)
 * es true: la lista está vacía y queda lo de siempre (`loAtendioUnaPersona`).
 */
function listo() {
  return fase === 'inactivo' || fase === 'al-dia';
}

/** Los números de la lista. */
function numeros() {
  if (!numerosCache) numerosCache = datos ? Object.keys(datos.viejos) : [];
  return numerosCache;
}

/**
 * Un envío del bot que Evolution confirmó (index.js `enviarAlCliente`): guarda su id (los
 * últimos 200) y, al día, mueve alDia. Sin la lista cargada (todavía no se puso al día, o no
 * pudo) el id queda en memoria y se guarda cuando se cargue. Durante un corte, o atrasado por
 * cualquier motivo, el id se guarda y alDia no se mueve.
 */
function envioConfirmado(id) {
  if (!id) return;
  idsBot.push(String(id));
  if (idsBot.length > MAX_IDS_BOT) idsBot = idsBot.slice(-MAX_IDS_BOT);
  if (!datos) return;
  if (fase === 'al-dia') datos.alDia = new Date().toISOString();
  guardarDatos();
}

const claveDelCorte = (control) => (control === 'webhook' ? 'webhook' : 'instancia');

/**
 * El guardián abrió un corte (index.js, `revisarGuardian`): `control` 'instancia' (con su
 * `estado`) o 'webhook', y `desde`, la última señal buena. Para el reloj, lleva alDia a esa
 * señal sin moverlo nunca hacia adelante (`alDia = min(alDia, desde)`) y queda atrasado: con
 * SOLO_CHATS_NUEVOS, todo en borrador salvo el tester (`listo`). No avisa al grupo: ya avisó el
 * guardián. Sin arrancar (pruebas, evaluar) no hace nada.
 */
function abrirCorte({ control, estado, desde } = {}) {
  if (fase === 'inactivo') return;
  const clave = claveDelCorte(control);
  const por =
    clave === 'webhook' ? 'Evolution caído (no llega nada por el webhook)' : `Evolution caído (instancia ${estado || 'sin respuesta'})`;
  cortes[clave] = por;
  generacion++; // la puesta al día en curso, o la vuelta que estaba esperando, ya no dejan al día
  trasCorte = true;
  clearTimeout(reintento);
  clearInterval(reloj);
  reintento = null;
  reloj = null;
  const senales = [tope, Number(desde) > 0 ? Number(desde) : null, datos ? Date.parse(datos.alDia) : null];
  const validas = senales.filter(Number.isFinite);
  if (validas.length) tope = Math.min(...validas);
  if (datos && tope !== null) {
    datos.alDia = new Date(tope).toISOString();
    guardarDatos();
  }
  fase = 'atrasado';
  motivo = por;
  console.log(
    `CHATS VIEJOS: ${por}. ` +
      (config.soloChatsNuevos
        ? 'Hasta que vuelva y me ponga al día, todo va en borrador salvo el tester.'
        : 'SOLO_CHATS_NUEVOS está apagado: no cambia a quién le escribe.')
  );
  console.log(linea());
}

/**
 * El guardián cerró un corte ("✅ Evolution volvió" o "✅ Volvieron a llegar mensajes"). Si no
 * queda otro abierto, espera VUELTA_MS (que Evolution termine de guardar lo que entró durante el
 * corte) y se pone al día de alDia hasta ahora. Una vuelta sin corte abierto no hace nada.
 */
function cerrarCorte({ control } = {}) {
  const clave = claveDelCorte(control);
  if (fase === 'inactivo' || !cortes[clave]) return;
  delete cortes[clave];
  const sigue = Object.values(cortes)[0];
  if (sigue) {
    motivo = sigue;
    console.log(`CHATS VIEJOS: volvió una parte, pero sigue ${sigue}.`);
    return;
  }
  motivo = `Evolution volvió: me pongo al día a las ${fecha(Date.now() + opciones.vueltaMs).slice(-5)}`;
  console.log(`CHATS VIEJOS: ${motivo}, cuando Evolution termine de guardar lo que entró durante el corte.`);
  const gen = generacion;
  clearTimeout(vuelta);
  vuelta = setTimeout(() => {
    vuelta = null;
    // Si todavía corre una puesta al día que empezó antes del corte, primero que termine. Si en el
    // medio hubo otro corte, esta vuelta ya no va: la hace la de ese corte.
    Promise.resolve(intento).then(() => {
      if (gen === generacion) ponerseAlDia();
    });
  }, opciones.vueltaMs);
  if (vuelta.unref) vuelta.unref();
}

/**
 * Llega un mensaje de un cliente (index.js `procesar`, antes de que el chat entre a estado.json;
 * `ms`: su hora de WhatsApp). Con la lista al día, o sin arrancar, no hace nada. Atrasada (se está
 * poniendo al día, Evolution cayó o está en la espera de la vuelta): si el chat no está en
 * estado.json ni en la lista, anota la hora de este primer mensaje, para que la puesta al día vea
 * si hubo alguno de antes que el bot no vio (30/09/2026). Nunca tira.
 */
function entroDelCliente(chat, ms) {
  try {
    if (fase === 'inactivo' || fase === 'al-dia') return;
    const numero = digitos(chat);
    if (!numero || sinMirar[numero] || opciones.esTester(numero)) return;
    const d = datos || leida;
    if (d && (d.viejos[numero] || (d.sinMirar || {})[numero])) return;
    if (opciones.enEstado(numero)) return; // conocido de antes: la regla de siempre
    sinMirar[numero] = new Date(Number(ms) > 0 ? Number(ms) : Date.now()).toISOString();
    console.log(`[chats viejos] ${numero} escribió con la lista atrasada y no está en estado.json: lo miro al ponerme al día`);
    guardarDatos();
  } catch (e) {
    console.error('[chats viejos] no pude anotar un chat que entró con la lista atrasada:', e.message);
  }
}

/**
 * Los ids de los envíos confirmados del bot que se conocen: los guardados en la lista y los de este
 * proceso (contexto.js, bloque Ninjo 1b: un mensaje propio que trae Evolution es del bot si su id
 * está acá). Sin arrancar (pruebas), solo los de este proceso.
 */
function idsDelBot() {
  const d = datos || leida;
  return new Set([...((d && d.idsBot) || []), ...idsBot]);
}

/** El `@lid` de un número (buscado al revés en `lids`), o null. Lo usa contexto.js. */
function lidDe(numero) {
  const d = datos || leida;
  const n = digitos(numero);
  if (!d || !n) return null;
  return Object.keys(d.lids || {}).find((lid) => d.lids[lid] === n) || null;
}

function lidSinTraducir() {
  const d = datos || leida;
  return d ? Object.values(d.lids).filter((v) => !v).length : 0;
}

/** "CHATS VIEJOS: N en la lista, al día hasta DD/MM HH:MM" (y los @lid sin traducir, si hay). */
function linea() {
  const d = datos || leida;
  const n = d ? Object.keys(d.viejos).length : 0;
  const k = lidSinTraducir();
  const hasta = d ? fecha(d.alDia || (d.semilla && d.semilla.en)) : 'nunca';
  const base =
    fase === 'al-dia'
      ? `CHATS VIEJOS: ${n} en la lista, al día hasta ${hasta}`
      : fase === 'inactivo'
        ? 'CHATS VIEJOS: sin arrancar'
        : `CHATS VIEJOS: ${fase === 'poniendose' ? 'poniéndome al día' : `atrasado (${motivo})`}; ${n} en la lista, al día hasta ${hasta}`;
  return base + (k ? `. @lid sin traducir: ${k}` : '');
}

/** Para /salud. */
function resumen() {
  const d = datos || leida;
  return {
    texto: linea(),
    estado: { inactivo: 'sin arrancar', poniendose: 'poniéndose al día', 'al-dia': 'al día', atrasado: 'atrasado' }[fase],
    motivo: motivo || null,
    enLista: d ? Object.keys(d.viejos).length : 0,
    alDia: d ? d.alDia : null,
    lidSinTraducir: lidSinTraducir(),
  };
}

module.exports = {
  ARCHIVO,
  leer,
  guardar,
  digitos,
  arrancar,
  detener,
  esperar,
  listo,
  numeros,
  envioConfirmado,
  idsDelBot,
  lidDe,
  entroDelCliente,
  abrirCorte,
  cerrarCorte,
  resumen,
  linea,
  MAX_IDS_BOT,
  VUELTA_MS,
  AVISO_EVOLUTION,
  AVISO_SIN_SEMILLA,
  AVISO_AL_DIA,
};
