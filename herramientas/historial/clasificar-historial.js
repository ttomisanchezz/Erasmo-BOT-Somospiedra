'use strict';
/**
 * Clasificador del historial de Somos Piedra (15/10/2026). Lee la exportacion de exportar-historial.js y le
 * pide a Claude Sonnet 5.5 que resuma cada chat. NO toca Evolution, NO manda mensajes, NO usa el bot.
 * La unica llamada de red es POST https://api.anthropic.com/v1/messages, y solo con --confirmar.
 *
 *   node herramientas/historial/clasificar-historial.js                 estima (no llama a la API, no gasta)
 *   node herramientas/historial/clasificar-historial.js --piloto=30 --confirmar
 *   node herramientas/historial/clasificar-historial.js --todo --confirmar
 *   opciones: --entrada=<carpeta export-...> (por defecto, la mas nueva)  --tope=10 (USD por corrida)
 *             --corte=48 (horas sin mensajes que separan conversaciones)  --esfuerzo=low|medium|high
 *             --seguir=<carpeta clasificacion-...> (retoma: no repite los chats ya hechos)
 *             --concurrencia=4  --semilla=7 (para elegir el piloto)
 *
 * La clave sale de ANTHROPIC_API_KEY (variable de entorno o .env de bot-piedra) y nunca se muestra.
 * A la API llegan los textos con un id (c0012) en lugar del chat: sin telefonos ni nombres, y con las
 * cifras largas (9 digitos o mas) y los telefonos de Neuquen tapados como [numero].
 * Se saltean los chats de data/historial/excluir.txt.
 */
const fs = require('fs');
const path = require('path');
const { leerEnv } = require('./exportar-historial');

const RAIZ = path.join(__dirname, '..', '..');
const CARPETA_HISTORIAL = path.join(RAIZ, 'data', 'historial');
const URL_API = 'https://api.anthropic.com/v1/messages';
const VERSION_API = '2023-06-01';
const MODELO = 'claude-sonnet-5-5';
const TZ = 'America/Argentina/Buenos_Aires';
const CHARS_POR_TOKEN = 3.5;
const TOPE_CHARS_LLAMADA = 8000 * CHARS_POR_TOKEN; // un chat mas largo se parte por conversaciones
const MAX_CHARS_MENSAJE = 1200;
const MAX_TOKENS = 8000;
// Tope de conversaciones por llamada: la salida crece con la cantidad de conversaciones (~320 tokens cada una), no con el texto.
// Con 20 o 64 conversaciones en una llamada la respuesta se cortaba por max_tokens (pasó en el piloto).
const MAX_CONVS_LLAMADA = 8;
// Calibración medida en el piloto del 15/10/2026 (chars/3.5 se queda corto con este español y este JSON).
const FACTOR_TOKENS = 1.7;
const TOKENS_FIJOS_MEDIDOS = 2737; // sistema + herramienta, lo que se cachea
const SALIDA_POR_CONV = 320;
const SALIDA_POR_LLAMADA = 80;
const TIMEOUT_MS = 180000;
// USD por millon de tokens (los de Sonnet 5.5 al 02/10/2026, los del .env.example del bot de iPhone).
const PRECIOS = { entrada: 2, salida: 10, cacheLeida: 0.2, cacheEscrita: 2.5 };

// ---------------------------------------------------------------- instrucciones y herramienta

const SISTEMA = `Sos un analista que ordena conversaciones reales de WhatsApp de "Somos Piedra", un negocio de Neuquén (Argentina). Vas a recibir un chat entre un Cliente (quien escribe al negocio) y Piedra (quien contesta desde la cuenta del negocio: puede ser más de una persona). El texto viene dividido en conversaciones numeradas; una conversación nueva empieza cuando pasaron 48 horas sin mensajes.

Para qué sirve: con tus resúmenes se arma un bot de atención y una lista de preguntas para el dueño. Por eso lo que importa es qué piden los clientes, cómo les contesta Piedra, cómo termina cada charla y qué quedó sin contestar.

Reglas:
- No sabemos con certeza qué vende Piedra ni cómo trabaja. Describí los productos con las palabras del chat. No supongas precios, plazos, zonas ni políticas: si no se dicen, dejá el campo vacío.
- Los precios, plazos, medios de pago, envíos, seña y demás condiciones que Piedra diga van copiados casi textuales (cortos), sin hacer cuentas ni convertir nada. Si el monto está en un audio, no lo inventes.
- Los audios, fotos, videos y archivos no se ven; aparecen como [audio 37s], [foto], [archivo: nombre]. Si una conversación parece depender de un audio o de una foto para entenderse (por ejemplo "ahí te mando el audio"), marcá depende_de_audio_o_foto: true y no adivines el contenido.
- "Cliente" puede ser un particular, un profesional o constructor, un proveedor, alguien equivocado o un contacto personal. Clasificalo en contacto según lo que se ve.
- Una conversación donde solo escribe Piedra (por ejemplo un aviso o un seguimiento) tiene cierre "solo_piedra".
- cierre: elegí el que mejor describe el final de ESA conversación. "vino_o_coordino_visita": acordaron día/hora o dijo que pasa/ya fue. "compro_o_pago": hubo compra, seña o transferencia. "presupuesto_sin_respuesta": Piedra pasó precio o presupuesto y el cliente no volvió a contestar. "cliente_dejo_de_responder": Piedra preguntó o respondió algo y el cliente se quedó callado. "piedra_dejo_de_responder": el último mensaje es del cliente y quedó sin contestar. "cliente_desistio": dijo que no, que lo piensa y no volvió, o que compró en otro lado. "consulta_resuelta": se resolvió una duda y no hacía falta más. "no_claro": no se puede saber.
- preguntas_cliente: las preguntas o pedidos concretos del cliente, cortos, casi textuales (máximo 6 por conversación). sin_contestar: cuáles de esas Piedra nunca contestó (vacío si todas se contestaron).
- Escribí en español rioplatense, breve. Nada de relleno ni opiniones.
- Respondé llamando UNA vez a la herramienta registrar_chat con todas las conversaciones del texto, en orden. No escribas texto fuera de la herramienta.`;

const objeto = (properties, required) => ({ type: 'object', properties, required, additionalProperties: false });
const texto = (descripcion) => ({ type: 'string', description: descripcion });
const lista = (descripcion) => ({ type: 'array', items: { type: 'string' }, description: descripcion });

const CIERRES = ['vino_o_coordino_visita', 'compro_o_pago', 'presupuesto_sin_respuesta', 'cliente_dejo_de_responder', 'piedra_dejo_de_responder', 'cliente_desistio', 'consulta_resuelta', 'solo_piedra', 'no_claro'];
const CONTACTOS = ['cliente_particular', 'profesional_o_constructor', 'proveedor', 'personal_o_interno', 'equivocado_o_spam', 'no_claro'];
const OBJECIONES = ['caro', 'lo_piensa', 'compara_con_otro', 'plazo', 'distancia_o_envio', 'otra', 'ninguna'];

const HERRAMIENTA = {
  name: 'registrar_chat',
  description: 'Registra el resumen de todas las conversaciones del chat, en orden.',
  input_schema: objeto({
    contacto: { type: 'string', enum: CONTACTOS, description: 'Quién es el que escribe, según lo que se ve en el chat.' },
    conversaciones: {
      type: 'array',
      items: objeto({
        n: { type: 'integer', description: 'Número de la conversación, como figura en el texto.' },
        consulta: texto('Qué busca o pide el cliente, en una frase. Vacío si Piedra fue la única que escribió.'),
        productos: lista('Productos, líneas o materiales mencionados, con las palabras del chat.'),
        medidas_o_cantidades: texto('Medidas, cantidades o superficie que dio el cliente, o vacío.'),
        uso_o_obra: texto('Para qué lo quiere (obra, jardín, fachada...), o vacío.'),
        zona: texto('Localidad, zona o dirección de entrega/colocación que se mencionó, o vacío.'),
        preguntas_cliente: lista('Preguntas o pedidos concretos del cliente, cortos (máximo 6).'),
        respuesta_piedra: texto('Qué contestó Piedra, en 1 o 2 frases.'),
        condiciones_dichas: lista('Precios, plazos, envío, colocación, seña, medios de pago o descuentos que Piedra dijo, copiados casi textual y cortos.'),
        pidio_al_cliente: lista('Datos o cosas que Piedra le pidió al cliente (medidas, fotos, ubicación, nombre...).'),
        objeciones: { type: 'array', items: { type: 'string', enum: OBJECIONES }, description: 'Lo que le frenó la compra, o ["ninguna"].' },
        cierre: { type: 'string', enum: CIERRES, description: 'Cómo terminó esa conversación.' },
        ultimo_en_hablar: { type: 'string', enum: ['cliente', 'piedra'] },
        sin_contestar: lista('Preguntas del cliente que Piedra nunca contestó.'),
        frase_modelo_de_piedra: texto('Una frase literal y corta de Piedra que sirva de ejemplo de cómo contesta o saluda, o vacío.'),
        depende_de_audio_o_foto: { type: 'boolean', description: 'true si la conversación no se entiende del todo sin los audios o fotos.' },
      }, ['n', 'consulta', 'productos', 'medidas_o_cantidades', 'uso_o_obra', 'zona', 'preguntas_cliente', 'respuesta_piedra', 'condiciones_dichas', 'pidio_al_cliente', 'objeciones', 'cierre', 'ultimo_en_hablar', 'sin_contestar', 'frase_modelo_de_piedra', 'depende_de_audio_o_foto']),
    },
  }, ['contacto', 'conversaciones']),
};

// ---------------------------------------------------------------- de la exportacion a texto

const leerJsonl = (f) => fs.readFileSync(f, 'utf8').split(/\r?\n/).filter(Boolean).map((l) => JSON.parse(l));
const FMT_DIA = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, day: '2-digit', month: '2-digit', year: 'numeric' });
const FMT_HORA = new Intl.DateTimeFormat('es-AR', { timeZone: TZ, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' });
const dia = (ts) => FMT_DIA.format(new Date(ts * 1000));
const hora = (ts) => FMT_HORA.format(new Date(ts * 1000));

/** Tapa lo que no le sirve a la IA y es de una persona: cifras de 9 digitos o mas y telefonos de Neuquen. */
function enmascarar(t) {
  return String(t)
    .replace(/\+?\d[\d\s().-]{7,}\d/g, (m) => (m.replace(/\D/g, '').length >= 9 ? '[numero]' : m))
    .replace(/\b(?:299|15)[\s-]?\d{3}[\s-]?\d{4}\b/g, '[numero]');
}

const MARCAS = {
  foto: () => '[foto]', video: () => '[video]', sticker: () => '[sticker]', ubicacion: () => '[ubicación]',
  contacto: () => '[contacto]', catalogo: () => '[catálogo]', otro: () => '[otro]',
  audio: (m) => `[audio ${m.seg ? m.seg + 's' : ''}]`.replace(' ]', ']'),
  archivo: (m) => (m.archivo ? `[archivo: ${enmascarar(m.archivo)}]` : '[archivo]'),
};

function cuerpoDe(m) {
  const marca = m.tipo !== 'texto' ? (MARCAS[m.tipo] || MARCAS.otro)(m) : '';
  let t = m.texto ? enmascarar(m.texto).replace(/\s*\n\s*/g, ' ⏎ ').trim() : '';
  if (t.length > MAX_CHARS_MENSAJE) t = t.slice(0, MAX_CHARS_MENSAJE) + '…';
  const cita = m.cita ? `(responde a: "${enmascarar(m.cita)}") ` : '';
  return `${cita}${[marca, t].filter(Boolean).join(' ')}`.trim();
}

/** Parte los mensajes de un chat en conversaciones (corte por `horas` sin mensajes) y las escribe como lineas. */
function conversacionesDe(mensajes, horas = 48) {
  const ms = [...mensajes].sort((a, b) => a.ts - b.ts);
  const grupos = [];
  for (const m of ms) {
    const g = grupos[grupos.length - 1];
    if (g && m.ts - g[g.length - 1].ts <= horas * 3600) g.push(m); else grupos.push([m]);
  }
  return grupos.map((g, i) => {
    let diaPrevio = dia(g[0].ts);
    const lineas = g.map((m, j) => {
      const d = dia(m.ts);
      const marca = j > 0 && d !== diaPrevio ? `${d} ${hora(m.ts)}` : hora(m.ts);
      diaPrevio = d;
      return `${marca} ${m.de === 'cliente' ? 'Cliente' : 'Piedra'}: ${cuerpoDe(m)}`;
    });
    const encabezado = `=== Conversación ${i + 1} · ${dia(g[0].ts)}${i > 0 ? ` (${Math.round((g[0].ts - ms[ms.indexOf(g[0]) - 1].ts) / 86400)} días después de la anterior)` : ''} ===`;
    return { n: i + 1, mensajes: g.length, lineas, encabezado, chars: encabezado.length + lineas.reduce((a, l) => a + l.length + 1, 0) };
  });
}

/** Si una conversacion no entra en una llamada, deja el principio y el final. */
function recortar(conv, tope = TOPE_CHARS_LLAMADA) {
  if (conv.chars <= tope) return conv;
  const cabeza = [];
  const cola = [];
  let a = 0;
  let b = 0;
  let i = 0;
  let j = conv.lineas.length - 1;
  while (i <= j && a + b < tope * 0.9) {
    if (a <= b) { a += conv.lineas[i].length + 1; cabeza.push(conv.lineas[i++]); } else { b += conv.lineas[j].length + 1; cola.unshift(conv.lineas[j--]); }
  }
  const omitidos = j - i + 1;
  const lineas = omitidos > 0 ? [...cabeza, `[… se omiten ${omitidos} mensajes del medio …]`, ...cola] : [...cabeza, ...cola];
  return { ...conv, lineas, chars: conv.encabezado.length + lineas.reduce((x, l) => x + l.length + 1, 0), recortada: omitidos };
}

const idDe = (indice) => `c${String(indice + 1).padStart(4, '0')}`;

/** Las llamadas a la API de un chat: normalmente una; si es larguisimo, varias, siempre cortando entre conversaciones. */
function llamadasDe(id, mensajes, opciones = {}) {
  const convs = conversacionesDe(mensajes, opciones.corte || 48).map((c) => recortar(c, opciones.topeChars));
  const tope = opciones.topeChars || TOPE_CHARS_LLAMADA;
  const partes = [];
  let actual = [];
  let chars = 0;
  for (const c of convs) {
    if (actual.length && (chars + c.chars > tope || actual.length >= MAX_CONVS_LLAMADA)) { partes.push(actual); actual = []; chars = 0; }
    actual.push(c);
    chars += c.chars;
  }
  if (actual.length) partes.push(actual);
  return partes.map((p, k) => {
    const cuerpo = p.map((c) => [c.encabezado, ...c.lineas].join('\n')).join('\n\n');
    const cab = `Chat ${id} · ${convs.length} conversación(es)${partes.length > 1 ? ` · parte ${k + 1} de ${partes.length} (conversaciones ${p[0].n} a ${p[p.length - 1].n})` : ''}`;
    return { id, parte: k + 1, partes: partes.length, texto: `${cab}\n\n${cuerpo}`, chars: cab.length + cuerpo.length, conversaciones: p.length };
  });
}

// ---------------------------------------------------------------- que chats entran

/** Lista de exclusion: telefonos (se comparan los ultimos 10 digitos) o ids lid-XXXX. */
function leerExclusiones(ruta) {
  let t = '';
  try { t = fs.readFileSync(ruta, 'utf8'); } catch (e) { return []; }
  return t.split(/\r?\n/).map((l) => l.replace(/#.*/, '').trim()).filter(Boolean);
}

function estaExcluido(chat, exclusiones) {
  const id = String(chat.chat);
  const num = String(chat.numero || '');
  // "0@s.whatsapp.net" y parecidos son cuentas de sistema de WhatsApp (avisos), no personas: un numero de menos de 8 digitos.
  if (num && num.replace(/\D/g, '').length < 8) return true;
  return exclusiones.some((x) => {
    if (/^lid-/i.test(x)) return x.toLowerCase() === id.toLowerCase();
    const d = x.replace(/\D/g, '');
    if (!d) return false;
    return d.length >= 10 ? num.replace(/\D/g, '').slice(-10) === d.slice(-10) : d === num;
  });
}

function mulberry32(a) {
  return function () { a |= 0; a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

/** Piloto: algunos casos raros (sin respuesta, solo Piedra, los mas largos, los de 1 mensaje) y el resto al azar. */
function elegirPiloto(chats, n, semilla = 7) {
  const azar = mulberry32(semilla);
  const barajar = (a) => { const b = [...a]; for (let i = b.length - 1; i > 0; i--) { const j = Math.floor(azar() * (i + 1)); [b[i], b[j]] = [b[j], b[i]]; } return b; };
  const elegidos = new Map();
  const tomar = (arr, k) => { for (const c of arr) { if (k <= 0 || elegidos.size >= n) break; if (!elegidos.has(c.chat)) { elegidos.set(c.chat, c); k--; } } };
  tomar(barajar(chats.filter((c) => c.sin_respuesta_de_piedra)), Math.min(3, Math.floor(n / 8)));
  tomar(barajar(chats.filter((c) => c.solo_piedra)), Math.min(2, Math.floor(n / 10)));
  tomar([...chats].sort((a, b) => b.tokens_est - a.tokens_est), Math.min(3, Math.floor(n / 8)));
  tomar(barajar(chats.filter((c) => c.mensajes <= 2)), Math.min(2, Math.floor(n / 10)));
  tomar(barajar(chats), n);
  return [...elegidos.values()];
}

// ---------------------------------------------------------------- costo

const usd = (u, p = PRECIOS) => (u.entrada * p.entrada + u.salida * p.salida + u.cacheLeida * p.cacheLeida + u.cacheEscrita * p.cacheEscrita) / 1e6;

function estimar(llamadas, p = PRECIOS) {
  const fijoTok = Math.max(TOKENS_FIJOS_MEDIDOS, Math.ceil((SISTEMA.length + JSON.stringify(HERRAMIENTA).length) / CHARS_POR_TOKEN));
  const textoTok = llamadas.reduce((a, l) => a + (l.chars / CHARS_POR_TOKEN) * FACTOR_TOKENS, 0);
  const n = llamadas.length;
  const convs = llamadas.reduce((a, l) => a + (l.conversaciones || 1), 0);
  const salida = convs * SALIDA_POR_CONV + n * SALIDA_POR_LLAMADA;
  // Bajo: el cache funciona (lo normal). Alto: texto +25%, salida +40% y sin cache.
  const bajo = usd({ entrada: textoTok, salida, cacheLeida: fijoTok * Math.max(0, n - 1), cacheEscrita: fijoTok }, p);
  const alto = usd({ entrada: textoTok * 1.25 + fijoTok * n, salida: salida * 1.4, cacheLeida: 0, cacheEscrita: 0 }, p);
  return { llamadas: n, conversaciones: convs, tokens_texto: Math.round(textoTok), tokens_fijos_por_llamada: fijoTok, usd_bajo: bajo, usd_alto: alto };
}

// ---------------------------------------------------------------- API

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function llamarApi(apikey, cuerpo, opciones = {}) {
  const fetchFn = opciones.fetchFn || fetch;
  const espera = opciones.espera != null ? opciones.espera : 2000;
  let ultimo;
  for (let i = 1; i <= 3; i++) {
    try {
      const res = await fetchFn(URL_API, {
        method: 'POST',
        headers: { 'x-api-key': apikey, 'anthropic-version': VERSION_API, 'content-type': 'application/json' },
        body: JSON.stringify(cuerpo),
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (res.ok) return await res.json();
      const detalle = String(await res.text().catch(() => '')).replace(/\s+/g, ' ').slice(0, 200);
      ultimo = new Error(`Anthropic ${res.status}: ${detalle}`);
      if (res.status !== 429 && res.status < 500) { ultimo.noReintentar = true; throw ultimo; }
    } catch (e) {
      ultimo = e;
      if (e.noReintentar) throw e;
    }
    if (i < 3) await dormir(espera * i * i);
  }
  throw ultimo;
}

function armarCuerpo(llamada, config) {
  return {
    model: config.modelo,
    max_tokens: MAX_TOKENS,
    system: [{ type: 'text', text: SISTEMA, cache_control: { type: 'ephemeral' } }],
    tools: [{ ...HERRAMIENTA, cache_control: { type: 'ephemeral' } }],
    tool_choice: { type: 'auto' },
    output_config: { effort: config.esfuerzo },
    messages: [{ role: 'user', content: llamada.texto }],
  };
}

const sumarUso = (a, u) => ({ entrada: a.entrada + (Number(u && u.input_tokens) || 0), salida: a.salida + (Number(u && u.output_tokens) || 0), cacheLeida: a.cacheLeida + (Number(u && u.cache_read_input_tokens) || 0), cacheEscrita: a.cacheEscrita + (Number(u && u.cache_creation_input_tokens) || 0) });
const USO0 = { entrada: 0, salida: 0, cacheLeida: 0, cacheEscrita: 0 };

/** Una llamada a Sonnet. Si no usa la herramienta, un reintento recordandoselo. Devuelve { registro, uso }. */
async function clasificar(apikey, llamada, config, opciones = {}) {
  let uso = { ...USO0 };
  let recordatorio = false;
  for (let intento = 0; intento < 2; intento++) {
    const cuerpo = armarCuerpo(llamada, config);
    if (recordatorio) cuerpo.messages[0].content += '\n\n(Recordatorio: respondé llamando a la herramienta registrar_chat.)';
    const resp = await llamarApi(apikey, cuerpo, opciones);
    uso = sumarUso(uso, resp.usage);
    const bloque = (resp.content || []).find((b) => b.type === 'tool_use' && b.name === HERRAMIENTA.name);
    if (bloque && bloque.input && Array.isArray(bloque.input.conversaciones)) {
      return { registro: bloque.input, uso, cortado: resp.stop_reason === 'max_tokens' };
    }
    // Si la respuesta se cortó por max_tokens, reintentar gasta el doble y vuelve a cortarse: se corta acá.
    if (resp.stop_reason === 'max_tokens') {
      const e = new Error('La respuesta de Sonnet se cortó por max_tokens (demasiadas conversaciones en una llamada)');
      e.uso = uso;
      e.cortado = true;
      throw e;
    }
    recordatorio = true;
  }
  const e = new Error('Sonnet no devolvió registrar_chat con conversaciones');
  e.uso = uso;
  throw e;
}

// ---------------------------------------------------------------- corrida

function ultimaExportacion() {
  const ds = fs.existsSync(CARPETA_HISTORIAL) ? fs.readdirSync(CARPETA_HISTORIAL).filter((d) => /^export-/.test(d)).sort() : [];
  return ds.length ? path.join(CARPETA_HISTORIAL, ds[ds.length - 1]) : null;
}

function argumentos(argv) {
  const a = { confirmar: false, todo: false };
  for (const x of argv) {
    if (x === '--confirmar') a.confirmar = true;
    else if (x === '--todo') a.todo = true;
    else { const m = x.match(/^--(piloto|entrada|tope|corte|esfuerzo|seguir|concurrencia|semilla)=(.+)$/); if (m) a[m[1]] = m[2]; }
  }
  return a;
}

/** Arma el plan: que chats, que llamadas. */
function planificar({ carpeta, a, exclusiones }) {
  const chats = leerJsonl(path.join(carpeta, 'chats.jsonl'));
  const indice = new Map(chats.map((c, i) => [c.chat, i]));
  const excluidos = chats.filter((c) => estaExcluido(c, exclusiones));
  let elegibles = chats.filter((c) => !estaExcluido(c, exclusiones));
  if (a.piloto) elegibles = elegirPiloto(elegibles, Math.max(1, parseInt(a.piloto, 10)), parseInt(a.semilla || '7', 10));
  const set = new Set(elegibles.map((c) => c.chat));
  const porChat = {};
  for (const m of leerJsonl(path.join(carpeta, 'mensajes.jsonl'))) if (set.has(m.chat)) (porChat[m.chat] = porChat[m.chat] || []).push(m);
  const llamadas = [];
  for (const c of elegibles) {
    if (!porChat[c.chat]) continue;
    llamadas.push(...llamadasDe(idDe(indice.get(c.chat)), porChat[c.chat], { corte: a.corte ? parseFloat(a.corte) : 48 }));
  }
  return { chats, elegibles, excluidos, llamadas };
}

async function correr(a, entorno = process.env, opciones = {}) {
  const carpeta = a.entrada ? path.resolve(a.entrada) : ultimaExportacion();
  if (!carpeta || !fs.existsSync(path.join(carpeta, 'mensajes.jsonl'))) throw new Error('No encuentro una exportación (data/historial/export-...). Corré primero exportar-historial.js.');
  const exclusiones = opciones.exclusiones || leerExclusiones(path.join(CARPETA_HISTORIAL, 'excluir.txt'));
  const { chats, elegibles, excluidos, llamadas } = planificar({ carpeta, a, exclusiones });
  const est = estimar(llamadas);
  const log = opciones.log || console.log;
  log(`Exportación: ${carpeta}`);
  log(`Chats en la exportación: ${chats.length} | excluidos: ${excluidos.length} | a clasificar: ${elegibles.length}${a.piloto ? ` (piloto de ${a.piloto})` : ''}`);
  log(`Llamadas a Sonnet: ${est.llamadas} | texto ~${est.tokens_texto} tokens + ~${est.tokens_fijos_por_llamada} fijos por llamada (con caché)`);
  log(`Costo estimado: USD ${est.usd_bajo.toFixed(2)} (bajo, con caché) a USD ${est.usd_alto.toFixed(2)} (alto, sin caché y con margen). Precios: entrada ${PRECIOS.entrada} / salida ${PRECIOS.salida} / caché leída ${PRECIOS.cacheLeida} por millón.`);
  if (!a.confirmar) { log('\nNo se llamó a la API ni se gastó nada. Para correr de verdad agregá --confirmar (y --piloto=30 o --todo).'); return { estimacion: est }; }
  if (!a.piloto && !a.todo) throw new Error('Con --confirmar hace falta --piloto=N o --todo.');
  const tope = a.tope ? parseFloat(a.tope) : 10;
  if (est.usd_alto > tope * 1.5) log(`Ojo: la estimación alta (USD ${est.usd_alto.toFixed(2)}) pasa el tope de USD ${tope}. La corrida se frena sola al llegar al tope y se puede retomar con --seguir.`);
  const env = opciones.env || leerEnv(path.join(RAIZ, '.env'));
  const apikey = entorno.ANTHROPIC_API_KEY || env.ANTHROPIC_API_KEY;
  if (!apikey) throw new Error('Falta ANTHROPIC_API_KEY (en el .env de bot-piedra o como variable de entorno).');
  const config = { modelo: entorno.CEREBRO_MODELO || env.CEREBRO_MODELO || MODELO, esfuerzo: ['low', 'medium', 'high'].includes(a.esfuerzo) ? a.esfuerzo : 'low' };

  const dos = (n) => String(n).padStart(2, '0');
  const d = new Date();
  const salida = a.seguir ? path.resolve(a.seguir) : path.join(carpeta, `clasificacion-${a.piloto ? 'piloto' : 'completa'}-${d.getFullYear()}-${dos(d.getMonth() + 1)}-${dos(d.getDate())}-${dos(d.getHours())}${dos(d.getMinutes())}`);
  fs.mkdirSync(salida, { recursive: true });
  const fResultados = path.join(salida, 'resultados.jsonl');
  const fErrores = path.join(salida, 'errores.jsonl');
  const hechos = new Set();
  let gasto = { ...USO0 };
  if (a.seguir && fs.existsSync(fResultados)) for (const r of leerJsonl(fResultados)) { hechos.add(`${r.id}|${r.parte}`); gasto = sumarUso(gasto, { input_tokens: r.uso.entrada, output_tokens: r.uso.salida, cache_read_input_tokens: r.uso.cacheLeida, cache_creation_input_tokens: r.uso.cacheEscrita }); }
  const pendientes = llamadas.filter((l) => !hechos.has(`${l.id}|${l.parte}`));
  log(`\nSalida: ${salida}\nPendientes: ${pendientes.length}${hechos.size ? ` (ya hechas: ${hechos.size})` : ''} | tope USD ${tope} | modelo ${config.modelo} | esfuerzo ${config.esfuerzo}`);

  let hechasAhora = 0;
  let errores = 0;
  let frenadoPorTope = false;
  const promedio = () => (hechasAhora ? usd(gasto) / Math.max(1, hechasAhora + hechos.size) : est.usd_alto / Math.max(1, est.llamadas));
  const una = async (l) => {
    if (frenadoPorTope) return;
    if (usd(gasto) + promedio() * 2 > tope) { frenadoPorTope = true; return; }
    try {
      const { registro, uso, cortado } = await clasificar(apikey, l, config, opciones);
      gasto = sumarUso(gasto, { input_tokens: uso.entrada, output_tokens: uso.salida, cache_read_input_tokens: uso.cacheLeida, cache_creation_input_tokens: uso.cacheEscrita });
      fs.appendFileSync(fResultados, JSON.stringify({ id: l.id, parte: l.parte, partes: l.partes, ...registro, cortado: cortado || undefined, uso, usd: usd(uso), modelo: config.modelo, cuando: new Date().toISOString() }) + '\n');
      hechasAhora++;
    } catch (e) {
      errores++;
      if (e.uso) gasto = sumarUso(gasto, { input_tokens: e.uso.entrada, output_tokens: e.uso.salida, cache_read_input_tokens: e.uso.cacheLeida, cache_creation_input_tokens: e.uso.cacheEscrita });
      fs.appendFileSync(fErrores, JSON.stringify({ id: l.id, parte: l.parte, error: String(e.message).slice(0, 300), cuando: new Date().toISOString() }) + '\n');
    }
    const total = hechasAhora + errores;
    if (total === 1 || total % 25 === 0) log(`  ${total}/${pendientes.length} | gastado USD ${usd(gasto).toFixed(3)}`);
  };
  if (pendientes.length) {
    await una(pendientes[0]); // la primera sola: escribe la caché y las demás la leen
    const cola = pendientes.slice(1);
    const trabajadores = Array.from({ length: Math.max(1, parseInt(a.concurrencia || '4', 10)) }, async () => { while (cola.length && !frenadoPorTope) await una(cola.shift()); });
    await Promise.all(trabajadores);
  }
  const resumen = { salida, modelo: config.modelo, esfuerzo: config.esfuerzo, llamadas_hechas_ahora: hechasAhora, errores, frenado_por_tope: frenadoPorTope, tope_usd: tope, gasto_usd: Number(usd(gasto).toFixed(4)), tokens: gasto, finalizado: new Date().toISOString() };
  fs.writeFileSync(path.join(salida, 'gasto.json'), JSON.stringify(resumen, null, 2), 'utf8');
  log(`\nListo. Llamadas: ${hechasAhora} | errores: ${errores} | gastado: USD ${usd(gasto).toFixed(3)}${frenadoPorTope ? ' | SE FRENÓ POR EL TOPE (retomá con --seguir=' + salida + ')' : ''}`);
  log(`Resultados: ${fResultados}${errores ? `\nErrores: ${fErrores}` : ''}\nNo se mandó nada a nadie.`);
  return resumen;
}

if (require.main === module) {
  correr(argumentos(process.argv.slice(2))).catch((e) => { console.error(`\nERROR: ${e.message}`); process.exitCode = 1; });
}

module.exports = { enmascarar, cuerpoDe, armarCuerpo, conversacionesDe, recortar, llamadasDe, leerExclusiones, estaExcluido, elegirPiloto, estimar, usd, llamarApi, clasificar, planificar, correr, argumentos, SISTEMA, HERRAMIENTA, PRECIOS, idDe };
