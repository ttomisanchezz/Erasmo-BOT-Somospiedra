'use strict';
/**
 * Semilla de la lista de chats viejos para SOLO_CHATS_NUEVOS (decisión de Tomás del 29/09/2026).
 * Ver src/chats-viejos.js.
 *
 *   npm run sembrar-viejos -- --simular   imprime el resultado y no escribe nada
 *   npm run sembrar-viejos                con el bot FRENADO: escribe chats-viejos.json
 *
 * Viejo es todo chat individual con al menos un mensaje en la base de Evolution (de cualquiera,
 * entrante o propio, de cualquier fecha) y todo chat real de estado.json (claves numéricas
 * @s.whatsapp.net; los eval-… y aprobado-… no). El tester no entra. Un @lid se guarda por
 * número: por el remoteJidAlt de sus mensajes o, si no viene, por el mapeo lid → número (el id
 * de un mensaje que también está guardado con el número, IsOnWhatsapp y los archivos
 * lid-mapping-*_reverse.json de evolution_api). Los que no se pueden traducir se cuentan y
 * quedan anotados sin número.
 *
 * Contra Evolution, solo lectura y como el 28/09: la base con `docker exec evolution_postgres
 * psql`, en una transacción READ ONLY, y los archivos con `docker exec evolution_api`.
 * estado.json se lee como JSON, sin cargar src/state.js. `alDia` queda en el momento de la
 * semilla: el primer arranque mira lo que pasó entre la semilla y el arranque.
 *
 * Reemplaza la lista anterior, si había: todo chat que un arranque agregó tiene mensajes en la
 * base, así que vuelve a entrar. Con el bot corriendo no escribe: el bot guarda su lista cada
 * 60 s y pisaría la nueva.
 */
const fs = require('fs');
const net = require('net');
const path = require('path');
const { execFileSync } = require('child_process');
const config = require('../src/config');
const chatsViejos = require('../src/chats-viejos');
const { estaEnLaLista } = require('../src/evolution');

const ESTADO = config.estadoPath || path.join(__dirname, '..', 'data', 'estado.json');
const MOTIVO_BASE = 'semilla: mensajes en Evolution';
const MOTIVO_ESTADO = 'semilla: estado.json';
const { digitos } = chatsViejos;
const iso = (ms) => new Date(ms).toISOString();
const esIndividual = (jid) => /@(s\.whatsapp\.net|lid)$/.test(String(jid || ''));

/** Una consulta a la base de Evolution, en una transacción de solo lectura. Filas con `|`. */
function psql(sql) {
  const salida = execFileSync(
    'docker',
    ['exec', '-i', 'evolution_postgres', 'sh', '-c', 'psql -U "${POSTGRES_USER:-postgres}" -d evolution -A -t -q -F "|" -v ON_ERROR_STOP=1'],
    {
      input: `SET default_transaction_read_only = on;\nBEGIN READ ONLY;\n${sql}\nCOMMIT;\n`,
      maxBuffer: 512 * 1024 * 1024,
      stdio: ['pipe', 'pipe', 'pipe'],
    }
  ).toString('utf8');
  return salida
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^(SET|BEGIN|COMMIT)$/.test(l))
    .map((l) => l.split('|'));
}

/**
 * Lee de Evolution lo que necesita la semilla: `claves` (cada chat individual de la base, con el
 * remoteJidAlt de sus mensajes, la fecha del más viejo y cuántos tiene) y `mapaLid`.
 */
function leerBase({ instancia = config.evolution.instancia } = {}) {
  if (!/^[\w.-]+$/.test(instancia)) throw new Error(`nombre de instancia raro: ${instancia}`);
  const fila = psql(`SELECT id FROM "Instance" WHERE name = '${instancia}';`)[0];
  const id = fila && fila[0];
  if (!id || !/^[\w-]+$/.test(id)) throw new Error(`no encontré la instancia ${instancia} en la base de Evolution`);
  const deLaInstancia = `"instanceId" = '${id}'`;
  const claves = psql(
    `SELECT key->>'remoteJid', max(CASE WHEN key->>'remoteJidAlt' LIKE '%@s.whatsapp.net' THEN key->>'remoteJidAlt' END), ` +
      `min("messageTimestamp"), count(*) FROM "Message" WHERE ${deLaInstancia} ` +
      `AND (key->>'remoteJid' LIKE '%@s.whatsapp.net' OR key->>'remoteJid' LIKE '%@lid') GROUP BY 1;`
  ).map(([jid, alt, desde, mensajes]) => ({ jid, alt: alt || null, desde: Number(desde), mensajes: Number(mensajes) }));

  const mapaLid = [];
  const sumar = (filas, via) => {
    for (const [lid, numero] of filas) mapaLid.push({ lid: digitos(lid), numero: digitos(numero), via });
  };
  sumar(
    psql(
      `SELECT DISTINCT a.key->>'remoteJid', b.key->>'remoteJid' FROM "Message" a JOIN "Message" b ON a.key->>'id' = b.key->>'id' ` +
        `WHERE a.${deLaInstancia} AND b.${deLaInstancia} AND a.key->>'remoteJid' LIKE '%@lid' AND b.key->>'remoteJid' LIKE '%@s.whatsapp.net';`
    ),
    'id de mensaje'
  );
  sumar(
    psql(
      `SELECT DISTINCT key->>'remoteJidAlt', key->>'remoteJid' FROM "Message" WHERE ${deLaInstancia} ` +
        `AND key->>'remoteJid' LIKE '%@s.whatsapp.net' AND key->>'remoteJidAlt' LIKE '%@lid';`
    ),
    'mensaje con el número'
  );
  sumar(psql(`SELECT lid, "remoteJid" FROM "IsOnWhatsapp" WHERE lid LIKE '%@lid' AND "remoteJid" LIKE '%@s.whatsapp.net';`), 'IsOnWhatsapp');
  // lid-mapping-<lid>_reverse.json tiene el número entre comillas.
  const archivos = execFileSync(
    'docker',
    [
      'exec',
      'evolution_api',
      'sh',
      '-c',
      `for f in /evolution/instances/${id}/lid-mapping-*_reverse.json; do [ -f "$f" ] && printf '%s|%s\\n' "$(basename "$f")" "$(cat "$f")"; done; true`,
    ],
    { maxBuffer: 256 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] }
  ).toString('utf8');
  for (const l of archivos.split(/\r?\n/)) {
    const [nombre, valor] = l.split('|');
    const lid = (String(nombre || '').match(/^lid-mapping-(\d+)_reverse\.json$/) || [])[1];
    const numero = digitos(String(valor || '').replace(/"/g, ''));
    if (lid && numero) mapaLid.push({ lid, numero, via: 'lid-mapping' });
  }
  return { claves, mapaLid };
}

/** El mensaje más viejo del historial de un chat de estado.json (ms), o null. */
function masViejoDelHistorial(chat) {
  const ts = ((chat && chat.historial) || []).map((m) => Number(m && m.ts)).filter((t) => t > 0);
  return ts.length ? Math.min(...ts) : null;
}

/**
 * Arma la lista. `claves` y `mapaLid` como los devuelve `leerBase`; `estado`, el contenido de
 * estado.json; `en`, el momento de la semilla (ms). Devuelve { datos, resumen }.
 */
function armarSemilla({ claves = [], mapaLid = [], estado = {}, esTester = () => false, en = Date.now() }) {
  // El lid → número: primero el remoteJidAlt de sus propios mensajes, después el mapeo.
  const lids = {};
  const porVia = { remoteJidAlt: 0 };
  for (const c of claves) {
    if (!String(c.jid).endsWith('@lid') || !c.alt) continue;
    const lid = digitos(c.jid);
    if (!lids[lid]) porVia.remoteJidAlt++;
    lids[lid] = digitos(c.alt);
  }
  for (const m of mapaLid) {
    if (!m.lid || !m.numero || lids[m.lid]) continue;
    lids[m.lid] = m.numero;
    porVia[m.via] = (porVia[m.via] || 0) + 1;
  }

  const viejos = {};
  const agregar = (numero, desde, motivo) => {
    if (!numero || esTester(numero)) return false;
    if (!viejos[numero]) viejos[numero] = { desde, motivo };
    else if (desde < viejos[numero].desde) viejos[numero].desde = desde;
    return true;
  };
  const conNumero = new Set();
  const desdeLid = new Set();
  let clavesIndividuales = 0;
  let clavesLid = 0;
  let lidSinTraducir = 0;
  let masViejo = Infinity;
  for (const c of claves) {
    if (!esIndividual(c.jid)) continue;
    clavesIndividuales++;
    if (c.desde > 0) masViejo = Math.min(masViejo, c.desde);
    const desde = iso(c.desde * 1000);
    if (String(c.jid).endsWith('@lid')) {
      clavesLid++;
      const lid = digitos(c.jid);
      const numero = lids[lid];
      if (!numero) {
        lids[lid] = null;
        lidSinTraducir++;
        continue;
      }
      if (agregar(numero, desde, MOTIVO_BASE)) desdeLid.add(numero);
    } else {
      const numero = digitos(c.jid);
      if (agregar(numero, desde, MOTIVO_BASE)) conNumero.add(numero);
    }
  }
  const deLaBase = Object.keys(viejos).length;

  let chatsEnEstado = 0;
  let soloEnEstado = 0;
  for (const [clave, chat] of Object.entries(estado || {})) {
    if (!/^\d+@s\.whatsapp\.net$/.test(clave)) continue; // ni eval-…, ni aprobado-…, ni bot:interno
    const numero = digitos(clave);
    if (esTester(numero)) continue;
    chatsEnEstado++;
    if (viejos[numero]) continue;
    const ts = masViejoDelHistorial(chat);
    agregar(numero, iso(ts || en), MOTIVO_ESTADO);
    soloEnEstado++;
  }

  const total = Object.keys(viejos).length;
  const deLid = [...desdeLid].filter((n) => !conNumero.has(n)).length;
  const resumen = {
    total,
    deLaBase,
    soloEnEstado,
    deLid,
    lidSinTraducir,
    clavesIndividuales,
    clavesLid,
    chatsEnEstado,
    masViejo: Number.isFinite(masViejo) ? iso(masViejo * 1000) : null,
    mapaLid: { total: Object.values(lids).filter(Boolean).length, ...porVia },
  };
  const datos = {
    viejos,
    lids,
    alDia: iso(en),
    idsBot: [],
    semilla: {
      en: iso(en),
      total,
      deLaBase,
      soloEnEstado,
      deLid,
      lidSinTraducir,
      masViejo: resumen.masViejo,
      primerArranque: null,
    },
  };
  return { datos, resumen };
}

/** ¿Hay algo escuchando en el puerto del bot? */
function botCorriendo(puerto = config.puerto, host = config.host) {
  return new Promise((resolve) => {
    const s = net.connect({ port: puerto, host: host || '127.0.0.1' });
    const fin = (v) => {
      s.destroy();
      resolve(v);
    };
    s.setTimeout(1500, () => fin(false));
    s.once('connect', () => fin(true));
    s.once('error', () => fin(false));
  });
}

function leerEstado(archivo) {
  let crudo;
  try {
    crudo = fs.readFileSync(archivo, 'utf8');
  } catch (e) {
    if (e.code === 'ENOENT') return {};
    throw e;
  }
  return JSON.parse(crudo);
}

const FORMATO = new Intl.DateTimeFormat('es-AR', {
  timeZone: 'America/Argentina/Buenos_Aires',
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23',
});
function fechaLarga(valor) {
  if (!valor) return 'ninguno';
  const p = Object.fromEntries(FORMATO.formatToParts(new Date(valor)).map((x) => [x.type, x.value]));
  return `${p.day}/${p.month}/${p.year} ${p.hour}:${p.minute}`;
}

function imprimir({ resumen: r }, { simular, archivo, log }) {
  const vias = Object.entries(r.mapaLid)
    .filter(([k]) => k !== 'total')
    .map(([k, v]) => `${k}: ${v}`)
    .join(', ');
  log('');
  log(simular ? 'SEMILLA DE CHATS VIEJOS (simulación: no escribo nada)' : 'SEMILLA DE CHATS VIEJOS');
  log(`  Chats viejos: ${r.total}`);
  log(`    con mensajes en la base de Evolution: ${r.deLaBase} (de ${r.clavesIndividuales} claves de chats individuales, ${r.clavesLid} @lid)`);
  log(`    solo en estado.json: ${r.soloEnEstado} (de ${r.chatsEnEstado} chats reales ahí)`);
  log(`    venían de @lid (sin una clave con el número): ${r.deLid}`);
  log(`  @lid sin traducir: ${r.lidSinTraducir}`);
  log(`  Mensaje más viejo de la base: ${fechaLarga(r.masViejo)}`);
  log(`  Mapa @lid → número: ${r.mapaLid.total} (${vias})`);
  log(`  Archivo: ${archivo}${simular ? ' (no se escribió)' : ''}`);
  log('');
}

/**
 * Siembra. `base`, `estadoPath`, `botCorriendo`, `ahora` y `log` se pueden reemplazar (pruebas).
 * Devuelve { escrito, datos, resumen }.
 */
async function sembrar({
  simular = false,
  base = leerBase,
  estadoPath = ESTADO,
  archivo = chatsViejos.ARCHIVO,
  esTester = (numero) => estaEnLaLista(numero, config.numerosTester),
  puerto = config.puerto,
  host = config.host,
  botCorriendo: corriendo = botCorriendo,
  ahora = Date.now,
  log = console.log,
} = {}) {
  if (!simular && (await corriendo(puerto, host))) {
    log(
      `NO SEMBRÉ: hay algo escuchando en el puerto ${puerto} (¿el bot?). Frená el bot, sembrá y volvé a ` +
        'arrancarlo: el bot guarda su lista cada 60 s y pisaría la nueva.'
    );
    return { escrito: false, motivo: 'bot corriendo' };
  }
  const en = ahora();
  const leido = await base({ instancia: config.evolution.instancia });
  const s = armarSemilla({ ...leido, estado: leerEstado(estadoPath), esTester, en });
  imprimir(s, { simular, archivo, log });
  if (simular) return { escrito: false, ...s };
  chatsViejos.guardar(s.datos, archivo);
  log(`Guardé la lista en ${archivo}. Ahora arrancá el bot.`);
  return { escrito: true, ...s };
}

module.exports = { armarSemilla, leerBase, sembrar, botCorriendo };

if (require.main === module) {
  const simular = process.argv.includes('--simular');
  sembrar({ simular })
    .then((r) => process.exit(simular || r.escrito ? 0 : 1))
    .catch((e) => {
      console.error('No pude sembrar: ' + e.message);
      process.exit(1);
    });
}
