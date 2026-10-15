'use strict';
/**
 * Herramienta de los precios de TechSur (01/10/2026). Ver src/techsur.js.
 *
 *   npm run techsur                       cómo se leyeron los últimos 10 avisos de data/techsur.jsonl
 *   npm run techsur -- --probar "texto"   cómo se lee un aviso pegado (no guarda nada)
 *   npm run techsur -- --grupos           los grupos del número, con su JID (para TECHSUR_GRUPO_JID)
 *   npm run techsur -- --recargar         vuelve a leer los avisos de los últimos 7 días y los guarda
 *                                         en la app de ventas (lo que ya estaba no se duplica)
 *   npm run techsur -- --desde-evolution  trae de Evolution los avisos de TechSur de los últimos 7 días
 *                                         (los que llegaron antes de que el bot los leyera) y los guarda;
 *                                         con --recargar, reescriben lo de ese aviso con el parser de hoy
 *
 * Solo --recargar escribe, y solo en la tabla precios_proveedor. Ninguna le escribe a WhatsApp.
 */
const fs = require('fs');
const config = require('../src/config');
const techsur = require('../src/techsur');

const args = process.argv.slice(2);
const DIA_MS = 24 * 60 * 60 * 1000;

function mostrar(items) {
  if (!items.length) return console.log('   (sin precios en dólares: no se guarda nada)');
  for (const it of items) {
    const det = it.detalle
      .map((d) => `${d.color ?? 's/color'}${d.baterias.length ? ` ${d.baterias.join(' ')}` : ''}`)
      .join(' · ');
    console.log(`   ${it.modelo} ${it.capacidad ?? ''} [${it.condicion ?? 'sin dato'}] US$${it.precio_usd}${it.nota ? ` (${it.nota})` : ''}${det ? `  — ${det}` : ''}`);
  }
}

function leerLog() {
  const ruta = techsur.rutaLog();
  if (!fs.existsSync(ruta)) return [];
  const vistos = new Map();
  for (const l of fs.readFileSync(ruta, 'utf8').split('\n')) {
    if (!l.trim()) continue;
    try {
      const r = JSON.parse(l);
      if (r && r.id && r.texto) vistos.set(r.id, r);
    } catch {
      // línea cortada: se saltea
    }
  }
  return [...vistos.values()].sort((a, b) => a.ts - b.ts);
}

async function grupos() {
  const base = config.evolution.url.replace(/\/$/, '');
  const res = await fetch(`${base}/group/fetchAllGroups/${config.evolution.instancia}?getParticipants=false`, {
    headers: { apikey: config.evolution.apikey },
    signal: AbortSignal.timeout(20000),
  });
  if (!res.ok) throw new Error(`Evolution ${res.status}: ${(await res.text().catch(() => '')).slice(0, 200)}`);
  const lista = await res.json();
  for (const g of lista) {
    const marca = techsur.coincideNombre(g.subject) ? '  <- TechSur' : '';
    console.log(`${g.id}  ${g.subject ?? ''}${marca}`);
  }
}

// Los mensajes que Evolution tiene guardados (POST /chat/findMessages, una lectura; la misma búsqueda
// que usa src/evolution.js buscarMensajes, que filtra por fecha solo con gte y lte juntos).
async function desdeEvolution() {
  const base = config.evolution.url.replace(/\/$/, '');
  const hasta = Date.now();
  const desde = hasta - config.techsur.diasMax * DIA_MS;
  const textoDe = (m) => {
    const msg = (m && m.message) || {};
    return (msg.conversation || (msg.extendedTextMessage && msg.extendedTextMessage.text) || (msg.imageMessage && msg.imageMessage.caption) || (msg.videoMessage && msg.videoMessage.caption) || '').trim();
  };
  let pagina = 1;
  let paginas = 1;
  let vistos = 0;
  let deTechsur = 0;
  let conPrecio = 0;
  let filas = [];
  do {
    const res = await fetch(`${base}/chat/findMessages/${config.evolution.instancia}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.evolution.apikey },
      body: JSON.stringify({ where: { messageTimestamp: { gte: new Date(desde).toISOString(), lte: new Date(hasta).toISOString() } }, page: pagina, offset: 500 }),
      signal: AbortSignal.timeout(60000),
    });
    if (!res.ok) throw new Error(`Evolution ${res.status} en findMessages: ${(await res.text().catch(() => '')).slice(0, 160)}`);
    const data = await res.json();
    const m = data && data.messages;
    if (!m || !Array.isArray(m.records)) throw new Error('Evolution contestó findMessages sin messages.records');
    paginas = Number(m.pages) || 1;
    for (const r of m.records) {
      vistos++;
      const jid = r && r.key && r.key.remoteJid;
      if (!jid || !jid.endsWith('@g.us') || !(await techsur.esElGrupo(jid))) continue;
      deTechsur++;
      const t = textoDe(r);
      const id = r.key && r.key.id;
      const ts = Number((r.messageTimestamp && r.messageTimestamp.low) ?? r.messageTimestamp ?? 0) * 1000;
      if (!t || !id || !ts || Date.now() - ts > config.techsur.diasMax * DIA_MS) continue;
      const items = techsur.parsearAviso(t);
      if (!items.length) continue;
      conPrecio++;
      filas = filas.concat(techsur.aFilas(items, id, ts));
    }
    pagina++;
  } while (pagina <= paginas);
  console.log(`Mensajes de los últimos ${config.techsur.diasMax} días en Evolution: ${vistos}. De TechSur: ${deTechsur}, con precio: ${conPrecio}.`);
  if (!filas.length) return;
  const n = await techsur.guardar(filas, { pisar: true });
  console.log(n ? `Guardados: ${n} precio(s) (los que ya estaban se reescriben con la lectura de hoy).` : 'No se pudo guardar: mirá el error de arriba.');
  if (!n) process.exitCode = 1;
}

(async () => {
  if (args[0] === '--probar') {
    const texto = args.slice(1).join(' ');
    if (!texto) throw new Error('Falta el texto: npm run techsur -- --probar "IPHONE 15 128GB $720USD"');
    mostrar(techsur.parsearAviso(texto));
    return;
  }
  if (args[0] === '--grupos') return grupos();
  if (args[0] === '--desde-evolution') return desdeEvolution();

  const avisos = leerLog();
  if (!avisos.length) {
    console.log(`Todavía no llegó ningún aviso de TechSur (${techsur.rutaLog()}).`);
    return;
  }
  if (args[0] === '--recargar') {
    const desde = Date.now() - config.techsur.diasMax * DIA_MS;
    let filas = [];
    for (const a of avisos.filter((x) => x.ts >= desde)) filas = filas.concat(techsur.aFilas(techsur.parsearAviso(a.texto), a.id, a.ts));
    if (!filas.length) return console.log('Nada para guardar en los últimos 7 días.');
    const n = await techsur.guardar(filas, { pisar: true });
    console.log(n ? `Listo: ${n} precio(s) enviados (los que ya estaban no se duplican).` : 'No se pudo guardar: mirá el error de arriba.');
    if (!n) process.exitCode = 1;
    return;
  }
  for (const a of avisos.slice(-10)) {
    console.log(`\n${new Date(a.ts).toLocaleString('es-AR')}  ${a.id}`);
    console.log(a.texto.split('\n').map((l) => `   | ${l}`).join('\n'));
    mostrar(techsur.parsearAviso(a.texto));
  }
})().catch((e) => {
  console.error(e.message);
  process.exitCode = 1;
});
