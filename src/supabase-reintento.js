'use strict';
/**
 * Lo que comparten el panel Chiara (src/panel-chiara.js) y el stock de la app (src/stock-app.js) al hablar con el
 * Supabase de la app (08/10/2026, diagnóstico de los timeouts; ver CLAUDE.md, *Los timeouts de Supabase*).
 *
 *   unReintento  un 57014 (la base canceló la consulta por su `statement_timeout`), un 504 o el tope de 15 s del
 *                `fetch` se reintentan UNA vez, a los 5 s, antes de contar como falla. Lo demás (un 400, un 503,
 *                "fetch failed" sin red) falla de una, como siempre: la vuelta siguiente lo vuelve a probar. Todo lo
 *                que se reintenta es idempotente (GET, upsert, el PATCH de una orden con `estado=eq.pendiente`).
 *   horaAR       "08/10 20:35:12", en hora de Argentina: va en las líneas del log, que no tienen hora.
 *
 * SUPABASE_REINTENTO_MS cambia la espera (las pruebas la ponen en milisegundos).
 */
const REINTENTO_MS = 5000;

const HORA_AR = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'America/Argentina/Buenos_Aires',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
  hourCycle: 'h23',
});

/** "08/10 20:35:12": día, mes y hora en Argentina. */
function horaAR(ts = Date.now()) {
  const p = {};
  for (const { type, value } of HORA_AR.formatToParts(new Date(Number(ts)))) p[type] = value;
  return `${p.day}/${p.month} ${p.hour}:${p.minute}:${p.second}`;
}

/** ¿Vale la pena probar de nuevo enseguida? El tope del fetch, un 504 o un 57014. */
function pasajero(e) {
  if (!e) return false;
  if (e.name === 'TimeoutError' || e.status === 504) return true;
  return /\b57014\b/.test(String(e.message || ''));
}

function esperaMs() {
  const crudo = String(process.env.SUPABASE_REINTENTO_MS || '').trim();
  const n = Number(crudo);
  return crudo && Number.isFinite(n) && n >= 0 ? n : REINTENTO_MS;
}

/**
 * Corre `fn`; si falla por algo pasajero, avisa (`alReintentar(error, ms)`, para el log), espera y la corre una vez
 * más. Lo que tire el segundo intento (o el primero, si no era pasajero) sale tal cual.
 */
async function unReintento(fn, alReintentar) {
  try {
    return await fn();
  } catch (e) {
    if (!pasajero(e)) throw e;
    const ms = esperaMs();
    if (alReintentar) alReintentar(e, ms);
    await new Promise((r) => setTimeout(r, ms));
    return fn();
  }
}

module.exports = { unReintento, horaAR, pasajero, REINTENTO_MS };
