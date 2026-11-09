'use strict';
/**
 * `npm run grupos`: lista los grupos de WhatsApp de la instancia de Piedra (nombre + JID) para cargar
 * GRUPO_AVISOS_JID con el del grupo "Bot Erasmo". Solo LEE: le pide a Evolution los grupos
 * (GET /group/fetchAllGroups/<instancia>?getParticipants=false) y no manda nada a nadie. Nunca imprime la
 * clave de Evolution ni el .env: usa la configuración del bot (src/config.js) y muestra solo nombre e id.
 *
 *   npm run grupos
 */
const config = require('../../src/config');

const TIMEOUT_MS = 20000;

/** Los grupos que devolvió Evolution, como [{ nombre, jid }], por nombre. Tira con el motivo si algo no va. */
async function listarGrupos({ fetchFn = globalThis.fetch, evolution = config.evolution } = {}) {
  const url = `${String(evolution.url).replace(/\/$/, '')}/group/fetchAllGroups/${evolution.instancia}?getParticipants=false`;
  const res = await fetchFn(url, { headers: { apikey: evolution.apikey }, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`Evolution contestó ${res.status}`);
  const datos = await res.json().catch(() => null);
  const lista = Array.isArray(datos) ? datos : datos && Array.isArray(datos.groups) ? datos.groups : null;
  if (!lista) throw new Error('Evolution contestó algo que no es una lista de grupos');
  return lista
    .filter((g) => g && typeof g.id === 'string' && g.id.endsWith('@g.us'))
    .map((g) => ({ nombre: String(g.subject || g.name || '(sin nombre)'), jid: g.id }))
    .sort((a, b) => a.nombre.localeCompare(b.nombre, 'es'));
}

/** El texto que se imprime: una línea por grupo, con el JID para pegar en GRUPO_AVISOS_JID. */
function comoTexto(grupos) {
  if (!grupos.length) return 'La instancia no tiene grupos.';
  return [`Grupos de la instancia (${grupos.length}):`, '', ...grupos.map((g) => `${g.nombre}\n    ${g.jid}`), '', 'Copiá el JID del grupo "Bot Erasmo" en GRUPO_AVISOS_JID del .env.'].join('\n');
}

async function main() {
  const problema = config.problemaDeInstancia();
  if (problema) {
    console.error(`No se puede listar: ${problema}`);
    process.exit(1);
  }
  try {
    console.log(comoTexto(await listarGrupos()));
  } catch (e) {
    const causa = e && e.cause && e.cause.code ? ` (${e.cause.code})` : '';
    console.error(`No pude pedirle los grupos a Evolution: ${(e && e.message) || e}${causa}`);
    process.exit(1);
  }
}

if (require.main === module) main();

module.exports = { listarGrupos, comoTexto };
