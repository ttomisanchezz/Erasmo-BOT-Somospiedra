'use strict';
/**
 * `npm run pruebas -- 5492994295806`: arma `data/pruebas/<fecha>.md` con la charla del tester de ese día, para
 * pegársela a Claude y mejorar las reglas y los ejemplos de Erasmo (09/11/2026). Solo LEE: el registro de
 * aprendizaje (`data/aprendizaje-v2.jsonl`) y el estado (`data/estado.json`, para la ficha); escribe solamente
 * el .md. No toca la red, Evolution ni la API.
 *
 *   npm run pruebas -- 5492994295806                  la charla de hoy (hora de Argentina)
 *   npm run pruebas -- 5492994295806 --fecha 2026-11-09
 *
 * Por cada tanda: lo que dijo el cliente, lo que contestó Erasmo (o que escaló y por qué), las herramientas que
 * llamó con lo que pidió y lo que devolvieron (los montos), los frenos de la guardia y cómo salió (textos, el
 * catálogo). Lo que el cliente escribió y no entró a ninguna tanda (Erasmo apagado, una persona atendiendo,
 * un corte) va aparte, con el motivo. En el .md el chat figura solo por sus últimos 4 dígitos.
 */
const fs = require('fs');
const path = require('path');

const ZONA = 'America/Argentina/Buenos_Aires';
const DIA = new Intl.DateTimeFormat('en-CA', { timeZone: ZONA, year: 'numeric', month: '2-digit', day: '2-digit' });
const HORA = new Intl.DateTimeFormat('en-GB', { timeZone: ZONA, hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23' });
const diaDe = (ts) => DIA.format(new Date(ts));
const horaDe = (ts) => HORA.format(new Date(ts));

const recorte = (t, largo) => {
  const una = String(t == null ? '' : t).replace(/\s+/g, ' ').trim();
  return una.length > largo ? una.slice(0, largo - 1).trimEnd() + '…' : una;
};
const cita = (t) => String(t == null ? '' : t).split('\n').map((l) => `> ${l}`).join('\n');

/** Lo que devolvió una herramienta, en una línea. */
function resumenDeSalida(h, s) {
  if (!s || typeof s !== 'object') return recorte(JSON.stringify(s), 160);
  if (s.error) return `ERROR: ${recorte(s.error, 200)}${s.faltaDato ? ` (faltaDato: ${s.faltaDato.join(', ')})` : ''}${s.parecidos ? ` (parecidos: ${s.parecidos.join(', ')})` : ''}`;
  if (h === 'cotizar') {
    const partes = [`${s.producto} · ${s.cantidad}${s.m2_que_cubre ? ` (cubre ${s.m2_que_cubre})` : ''} · ${/^CON factura/.test(s.factura || "") ? "CON factura" : "SIN factura"}`];
    for (const t of s.totales || []) partes.push(`${t.forma_de_pago}: ${t.total}`);
    if (s.precio_de_una_unidad) partes.push(`precio de 1 ${s.precio_de_una_unidad.unidad}: ${(s.precio_de_una_unidad.por_forma_de_pago || []).map((x) => x.precio).join(' / ')}`);
    return partes.join(' | ');
  }
  if (h === 'buscar_productos') {
    const n = (s.productos || []).map((p) => `${p.nombre}${p.tiene_precio ? '' : ' (sin precio)'}`);
    return n.length ? n.join(', ') + (s.hay_mas ? ' …' : '') : 'ninguno';
  }
  if (h === 'mandar_catalogo') return s.ok ? 'ok: va con los mensajes' : `no sale: ${s.ya_enviado ? 'ya se lo mandó hace menos de 24 h' : recorte(s.aviso || '', 120)}`;
  if (h === 'agendar_seguimiento') return s.ok ? 'ok: anotado para el equipo' : `no anotó: ${recorte(s.aviso || '', 120)}`;
  return recorte(JSON.stringify(s), 160);
}

const entradaCorta = (e) => recorte(JSON.stringify(e || {}), 160);

/** "$780.000" para los montos de la guardia (pesos enteros). */
const pesos = (n) => '$' + Number(n).toLocaleString('es-AR');

/** Los eventos de ese chat y de ese día (hora de Argentina), en orden. `esDelChat(e)` dice si es del chat. */
function eventosDelDia(eventos, esDelChat, fecha) {
  return eventos
    .filter((e) => e && esDelChat(e) && Number.isFinite(Date.parse(e.ts)) && diaDe(Date.parse(e.ts)) === fecha)
    .sort((a, b) => Date.parse(a.ts) - Date.parse(b.ts));
}

/** Una línea para mirar la ficha del chat. */
function fichaComoTexto(ficha) {
  if (!ficha) return 'sin ficha (el chat no existe en el estado, o nunca contestó Erasmo)';
  const out = [];
  if (ficha.anuncio) out.push(`- Vino del anuncio: ${ficha.anuncio.titulo || ficha.anuncio.id || '(sin título)'}`);
  if (ficha.pidio) out.push(`- Qué pidió: ${ficha.pidio.producto} · ${ficha.pidio.cantidad} ${ficha.pidio.unidad} · pago: ${ficha.pidio.pago} · ${ficha.pidio.factura ? 'con factura' : 'sin factura'}`);
  if (ficha.ultimoMensaje) out.push(`- Último mensaje del cliente: ${ficha.ultimoMensaje}`);
  if (ficha.quedo) out.push(`- En qué quedó: ${ficha.quedo}`);
  if (ficha.seguimiento) out.push(`- Seguimiento: ${ficha.seguimiento.fecha} · ${ficha.seguimiento.motivo}`);
  if (ficha.catalogoEnviado) out.push(`- Catálogo enviado: ${diaDe(ficha.catalogoEnviado)} ${horaDe(ficha.catalogoEnviado)}`);
  return out.join('\n') || 'ficha vacía';
}

/**
 * El markdown de la charla. Función pura: `eventos` ya filtrados y en orden (`eventosDelDia`), `fecha`
 * ('AAAA-MM-DD'), `ultimos4` (los últimos 4 dígitos del número) y `ficha` (la del estado, o null).
 */
function armarMarkdown({ eventos, fecha, ultimos4, ficha = null, generado = new Date() }) {
  const clientes = eventos.filter((e) => e.tipo === 'cliente');
  const propuestas = eventos.filter((e) => e.tipo === 'propuesta');
  const humanos = eventos.filter((e) => e.tipo === 'humano');
  const tandas = new Map(propuestas.map((e) => [e.tanda, e]));
  const idsEnTanda = new Set(propuestas.flatMap((e) => e.lineas || []));
  const reglas = [...new Set(propuestas.map((e) => e.sonnet && e.sonnet.reglas).filter(Boolean))];
  const commits = [...new Set(propuestas.map((e) => e.commit).filter(Boolean))];

  const out = [];
  out.push(`# Pruebas de Erasmo · ${fecha} · chat ...${ultimos4}`);
  out.push('');
  out.push(`Generado ${diaDe(generado)} ${horaDe(generado)} (hora de Argentina). ${propuestas.length} tanda${propuestas.length === 1 ? '' : 's'}, ${clientes.length} mensaje${clientes.length === 1 ? '' : 's'} del cliente.`);
  if (reglas.length) out.push(`Reglas del cerebro: ${reglas.join(', ')}${commits.length ? ` · commit ${commits.join(', ')}` : ''}.`);
  const usd = propuestas.reduce((a, e) => a + ((e.sonnet && e.sonnet.usd) || 0), 0);
  if (usd) out.push(`Costo estimado de Sonnet ese día en este chat: US$${usd.toFixed(4)}.`);
  out.push('');
  out.push('## Ficha del chat');
  out.push('');
  out.push(fichaComoTexto(ficha));
  out.push('');

  // Cronológico: cada tanda en la hora de su propuesta, y las personas de la cuenta entre medio.
  const linea = (e) => ({ ts: Date.parse(e.ts), e });
  const cronologia = [...propuestas.map(linea), ...humanos.map(linea)].sort((a, b) => a.ts - b.ts);
  let n = 0;
  for (const { e } of cronologia) {
    if (e.tipo === 'humano') {
      out.push(`### ${horaDe(Date.parse(e.ts))} · una persona de la cuenta escribió`);
      out.push('');
      out.push(cita(e.texto));
      out.push('');
      continue;
    }
    n++;
    const s = e.sonnet || null;
    out.push(`### Tanda ${n} · ${horaDe(Date.parse(e.ts))}${e.modo && e.modo !== 'vivo' ? ` · modo ${e.modo}` : ''}`);
    out.push('');
    const suyas = clientes.filter((c) => (e.lineas || []).includes(c.id));
    out.push(`**El cliente dijo** (${suyas.length} mensaje${suyas.length === 1 ? '' : 's'}):`);
    out.push('');
    out.push(suyas.length ? suyas.map((c) => cita(`${c.texto}${c.audio ? '  [audio transcripto]' : ''}`)).join('\n') : '> (sin texto: foto o pedido del catálogo)');
    out.push('');
    if (e.escalar) {
      // Al escalar, lo único que le puede llegar al cliente es el mensaje fijo del código (16/11/2026): si salió,
      // está su `entrega` de origen 'escalado' en esta tanda, con el id que devolvió Evolution y sin error.
      const aviso = eventos.find((x) => x.tipo === 'entrega' && x.tanda === e.tanda && x.origen === 'escalado' && x.id && !x.error);
      out.push(`**Erasmo escaló** (${aviso ? `al cliente solo le llegó "${aviso.texto}"` : 'al cliente no le llegó nada'}): ${e.motivo || '(sin motivo)'}`);
    } else if ((e.mensajes || []).length) {
      out.push('**Erasmo contestó:**');
      out.push('');
      out.push((e.mensajes || []).map(cita).join('\n'));
    } else {
      out.push('**Erasmo no mandó nada.**');
    }
    out.push('');
    if (s && s.llamadas && s.llamadas.length) {
      out.push('**Herramientas:**');
      out.push('');
      for (const l of s.llamadas) out.push(`- \`${l.herramienta}\` ${entradaCorta(l.entrada)} → ${resumenDeSalida(l.herramienta, l.salida)}`);
      out.push('');
    } else if (s && s.herramientas && s.herramientas.length) {
      out.push(`**Herramientas:** ${s.herramientas.join(', ')}`);
      out.push('');
    }
    if (s && s.montos && s.montos.length) out.push(`**Montos que dejó escribir la guardia:** ${[...new Set(s.montos)].map(pesos).join(', ')}`, '');
    if (e.corregida || (s && s.corregida)) {
      const c = e.corregida || s.corregida;
      out.push(`**La guardia frenó la primera versión:** ${c.guardia}`);
      if (c.frenados && c.frenados.length) out.push('', 'Lo que había escrito:', '', c.frenados.map(cita).join('\n'));
      out.push('');
    }
    if (s && s.guardia) {
      out.push(`**La guardia frenó y Erasmo escaló:** ${s.guardia}`);
      const fr = s.frenados || [];
      if (fr.length) out.push('', 'Lo que había escrito:', '', fr.map(cita).join('\n'));
      out.push('');
    }
    // Lo que pasó con esta tanda: entregas (qué salió de verdad) y silencios.
    const sale = eventos.filter((x) => x.tanda === e.tanda && (x.tipo === 'entrega' || x.tipo === 'silencio' || x.tipo === 'propuesta-sonnet'));
    for (const x of sale) {
      if (x.tipo === 'entrega') out.push(`- Salió: ${x.formato}${x.formato === 'documento' ? ' (catálogo en PDF)' : ''}${x.error ? ` · NO salió: ${x.error}` : ''}${x.formato === 'texto' && x.texto ? ` · "${recorte(x.texto, 80)}"` : ''}`);
      else if (x.tipo === 'silencio') out.push(`- Silencio: ${x.motivo}${x.sinMandar ? ` (${x.sinMandar} sin mandar)` : ''}`);
      else if (x.error) out.push(`- Sonnet no pudo: ${recorte(x.error, 120)}`);
    }
    if (sale.length) out.push('');
    if (s) {
      const partes = [];
      if (s.usd) partes.push(`US$${Number(s.usd).toFixed(4)}`);
      if (s.ms != null) partes.push(`${s.ms} ms`);
      if (s.leidos && s.leidos.historial != null) partes.push(`leyó ${s.leidos.historial} mensajes de contexto`);
      if (partes.length) out.push(`<sub>${partes.join(' · ')}</sub>`, '');
    }
  }
  if (!cronologia.length) out.push('_Ese día no hubo ninguna tanda de este chat._', '');

  // Lo que dijo el cliente y no entró a una tanda, con el porqué.
  const sueltos = clientes.filter((c) => c.id && !idsEnTanda.has(c.id));
  const sinTanda = eventos.filter((x) => x.tipo === 'silencio' && !tandas.has(x.tanda));
  if (sueltos.length || sinTanda.length) {
    out.push('## Sin contestar (no entraron a una tanda de Erasmo)', '');
    for (const c of sueltos) {
      const motivo = sinTanda.filter((x) => (x.lineas || []).includes(c.id)).map((x) => x.motivo);
      out.push(`- ${horaDe(Date.parse(c.ts))} · ${recorte(c.texto, 200)}${motivo.length ? ` → ${[...new Set(motivo)].join(', ')}` : ''}`);
    }
    const sueltosIds = new Set(sueltos.map((c) => c.id));
    for (const x of sinTanda) if (!(x.lineas || []).some((id) => sueltosIds.has(id))) out.push(`- ${horaDe(Date.parse(x.ts))} · silencio: ${x.motivo}`);
    out.push('');
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trimEnd() + '\n';
}

/** Un número de teléfono tipeado ("549 299 4295806", "+54 9 299 429-5806") -> el JID de WhatsApp, o null. */
function jidDe(texto) {
  const d = String(texto || '').replace(/\D/g, '');
  return d.length >= 8 ? `${d}@s.whatsapp.net` : null;
}

function main(argv = process.argv.slice(2)) {
  const jid = jidDe(argv.find((a) => /\d/.test(a) && !a.startsWith('--') && !/^\d{4}-\d{2}-\d{2}$/.test(a)));
  const i = argv.indexOf('--fecha');
  const fecha = i >= 0 ? argv[i + 1] : diaDe(Date.now());
  if (!jid || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) {
    console.error('Uso: npm run pruebas -- 5492994295806 [--fecha AAAA-MM-DD]');
    process.exit(1);
  }
  const aprendizaje = require('../../src/aprendizaje');
  const config = require('../../src/config');
  // Sin la sal del registro no se puede reconocer el chat por su clave: se busca por los últimos 4 dígitos.
  const hayEventos = fs.existsSync(aprendizaje.ARCHIVO);
  const hayInal = fs.existsSync(aprendizaje.ARCHIVO_SAL);
  const ultimos4 = jid.split('@')[0].slice(-4);
  const clave = hayInal ? aprendizaje.clave(jid) : null;
  const esDelChat = (e) => (clave && e.clave ? e.clave === clave : e.chat === `...${ultimos4}`);
  const eventos = hayEventos ? eventosDelDia(aprendizaje.leerTodo(), esDelChat, fecha) : [];
  let ficha = null;
  try {
    const estado = JSON.parse(fs.readFileSync(config.estadoPath || path.join(__dirname, '..', '..', 'data', 'estado.json'), 'utf8'));
    ficha = (estado[jid] && estado[jid].ficha) || null;
  } catch {
    /* sin estado legible: la ficha queda vacía */
  }
  const md = armarMarkdown({ eventos, fecha, ultimos4, ficha });
  const carpeta = process.env.PRUEBAS_DIR || path.join(__dirname, '..', '..', 'data', 'pruebas');
  fs.mkdirSync(carpeta, { recursive: true });
  const archivo = path.join(carpeta, `${fecha}.md`);
  fs.writeFileSync(archivo, md, 'utf8');
  console.log(`Listo: ${archivo}`);
  console.log(`${eventos.filter((e) => e.tipo === 'propuesta').length} tanda(s), ${eventos.filter((e) => e.tipo === 'cliente').length} mensaje(s) del cliente.`);
  if (!eventos.length) console.log('No hay eventos de ese chat en ese día (¿el número está bien? ¿el bot corrió con CEREBRO_MODO=tester?).');
  console.log('Pegale ese archivo a Claude para mejorar las reglas y los ejemplos.');
}

if (require.main === module) main();

module.exports = { armarMarkdown, eventosDelDia, resumenDeSalida, fichaComoTexto, jidDe, diaDe };
