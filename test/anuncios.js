'use strict';
/**
 * `npm run anuncios` (panel Chiara, 06/10/2026): de qué anuncios de Meta vinieron los chats de los
 * últimos días, según lo que guardó Evolution. Sirve para confirmar que Evolution trae el anuncio de
 * origen (`externalAdReply.sourceId`) antes de cruzarlo con el panel de Meta.
 *
 *   npm run anuncios            (los últimos 7 días)
 *   npm run anuncios -- 14      (los últimos 14)
 *
 * SOLO LECTURA: le pide a Evolution los mensajes con /chat/findMessages (como la puesta al día de los
 * chats viejos). No carga state.js ni escribe nada. No imprime teléfonos ni textos de clientes: solo el
 * tipo, el id y el título de cada anuncio, y cuántos mensajes y chats trajo. Se corre desde la carpeta
 * del bot (C:\bot-whatsapp\bot-whatsapp), donde está el .env.
 */
const evolution = require('../src/evolution');
const { respuestasDeAnuncio, anuncioDe } = require('../src/anuncio');

async function main() {
  const dias = Math.max(1, Math.min(60, parseInt(process.argv[2] || '7', 10) || 7));
  const hasta = Date.now();
  const desde = hasta - dias * 24 * 60 * 60 * 1000;
  let pagina = 1;
  let paginas = 1;
  let leidos = 0;
  let deClientes = 0;
  const porAnuncio = new Map(); // `${tipo}|${id}` → { tipo, id, titulo, mensajes, chats:Set, cuentaParaElPanel }
  do {
    const r = await evolution.buscarMensajes({ desde, hasta, pagina, porPagina: 500 });
    paginas = r.paginas || 1;
    for (const m of r.registros) {
      leidos++;
      if (m && m.key && m.key.fromMe) continue;
      deClientes++;
      for (const ad of respuestasDeAnuncio(m)) {
        const tipo = String(ad.sourceType || 'sin tipo');
        const id = String(ad.sourceId || 'sin id');
        const k = `${tipo}|${id}`;
        if (!porAnuncio.has(k)) porAnuncio.set(k, { tipo, id, titulo: String(ad.title || '').slice(0, 60), mensajes: 0, chats: new Set(), cuenta: anuncioDe({ contextInfo: { externalAdReply: ad } }) !== null });
        const x = porAnuncio.get(k);
        x.mensajes++;
        x.chats.add(String((m.key && m.key.remoteJid) || ''));
      }
    }
    pagina++;
  } while (pagina <= paginas);
  console.log(`\nÚltimos ${dias} días: ${leidos} mensajes leídos, ${deClientes} de clientes.`);
  if (!porAnuncio.size) {
    console.log('Ninguno trae externalAdReply: o no entraron chats desde un anuncio, o Evolution no lo guarda.\n');
    return;
  }
  console.log(`Con externalAdReply (${porAnuncio.size}):`);
  for (const x of [...porAnuncio.values()].sort((a, b) => b.chats.size - a.chats.size)) {
    console.log(`  ${x.cuenta ? 'va al panel' : 'no va     '}  ${x.tipo.padEnd(8)} ${x.id.padEnd(22)} ${String(x.chats.size).padStart(3)} chats, ${String(x.mensajes).padStart(3)} mensajes  ${x.titulo}`);
  }
  console.log('\n"va al panel": es un anuncio (sourceType ad) y el bot guarda ese id en bot_leads.anuncio_id.\n');
}

main().catch((e) => {
  console.error(`No pude leer Evolution: ${e.message}`);
  process.exitCode = 1;
});
