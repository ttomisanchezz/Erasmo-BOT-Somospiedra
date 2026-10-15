'use strict';
/**
 * Gemini se usa SOLO para entender el mensaje del cliente y para redactar
 * las partes conversacionales. NUNCA para calcular ni decir precios:
 * todos los números salen del cotizador, que lee la planilla.
 *
 * Tier gratuito: no se le manda teléfono, nombre real ni datos de contacto.
 */
const config = require('./config');
const local = require('./extractor-local');

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Modo sin red. Con esto encendido no sale UNA sola request a Google: no se
 * arma el prompt, no se mira la clave y no se llega nunca al fetch. No es el
 * fallback de siempre —ese intenta, falla y recién ahí cae al extractor
 * local—; acá el camino de Gemini directamente no se toca.
 *
 * Existe para que la suite de casos sea determinística sin depender de la
 * cuota del día, y sin tener que vaciar GEMINI_API_KEY ni tocar el .env.
 * Lo enciende `npm run evaluar -- --offline`.
 *
 * Apagado (false) el comportamiento es exactamente el de siempre.
 */
let soloLocal = false;

/** Enciende o apaga el modo sin red. */
function usarSoloLocal(valor = true) {
  soloLocal = Boolean(valor);
}

/** Para que el banner del evaluador diga la verdad sobre qué está entendiendo. */
function esSoloLocal() {
  return soloLocal;
}

const INTENCIONES = [
  'saludo', 'consulta_stock', 'consulta_precio', 'declara_entrega', 'permuta',
  'quiere_avanzar', 'pide_turno', 'consulta_general', 'postventa', 'propone_pago',
  'precio_alto', 'dolares', 'se_disculpa', 'agradece', 'lo_piensa', 'reserva',
  'modelo_ambiguo', 'pide_extremo', 'sin_contenido', 'otro',
];

/**
 * Con responseSchema, Gemini está obligado a devolver esta estructura exacta.
 * Es lo que evita los "Expected ',' or '}'" que rompían el parseo.
 */
const ESQUEMA_JSON = {
  type: 'object',
  properties: {
    intencion: { type: 'string', enum: INTENCIONES },
    modelo: { type: 'string', nullable: true },
    modelos: { type: 'array', items: { type: 'string' } },
    capacidad_gb: { type: 'integer', nullable: true },
    entrega: { type: 'integer', nullable: true },
    permuta: {
      type: 'object',
      properties: {
        ofrece: { type: 'boolean' },
        modelo: { type: 'string', nullable: true },
        capacidad_gb: { type: 'integer', nullable: true },
        bateria: { type: 'integer', nullable: true },
        tiene_fotos: { type: 'boolean' },
      },
    },
    forma_pago: { type: 'string', nullable: true },
    zona: { type: 'string', nullable: true },
    timing: { type: 'string', nullable: true },
    urgente: { type: 'boolean' },
    nota: { type: 'string', nullable: true },
    // 01/10/2026: la frase de una persona de la cuenta que el cliente está siguiendo (ver ESQUEMA).
    dijo_persona: { type: 'string', nullable: true },
  },
  required: ['intencion'],
};

/**
 * Saca del texto lo que identifica a la persona antes de mandarlo a Google.
 * En el tier gratuito Google puede usar los datos para entrenar, así que sale
 * el nombre (y sus deformaciones cariñosas), los teléfonos y los mails.
 * El bot no necesita nada de eso para entender qué modelo están preguntando.
 */
function sinDatosPersonales(texto, nombre) {
  let t = String(texto || '');
  if (nombre && nombre.length >= 3) {
    // "tomas" tiene que tapar también "tomass" y "tomasss"
    const raiz = nombre.trim().toLowerCase().slice(0, Math.max(3, nombre.length - 1));
    const escapada = raiz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(escapada + '\\w*', 'gi'), '[cliente]');
  }
  // Teléfonos: 9 dígitos o más. El tope de un precio acá son 7 ("2.200.000"),
  // así que con 9 no se corre riesgo de borrar el monto que dijo el cliente.
  t = t.replace(/\+?\d[\d\s.()-]{7,}\d/g, (m) =>
    (m.match(/\d/g) || []).length >= 9 ? '[telefono]' : m
  );
  t = t.replace(/\b[\w.+-]+@[\w-]+\.[\w.]+\b/g, '[mail]');
  return t;
}

/** Largo máximo de una nota del cliente: una línea, no un párrafo. */
const LARGO_NOTA = 120;

/**
 * Una nota del cliente lista para guardarse o para volver a un prompt: en una
 * sola línea, sin datos personales y recortada. La escribe el modelo y después
 * viaja en otro pedido a Google, así que se limpia igual que lo que escribe el
 * cliente. Se limpia ANTES de recortar: si no, un teléfono cortado a la mitad
 * ya no parece un teléfono. Devuelve null si no queda nada.
 */
function notaSegura(texto, nombre) {
  if (!texto) return null;
  const limpia = sinDatosPersonales(String(texto).replace(/\s+/g, ' ').trim(), nombre);
  return limpia.slice(0, LARGO_NOTA).trim() || null;
}

/** Saca los ``` que a veces mete el modelo alrededor del JSON. */
function limpiarJson(txt) {
  let t = txt.trim();
  t = t.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim();
  const i = t.indexOf('{');
  const j = t.lastIndexOf('}');
  if (i > -1 && j > i) t = t.slice(i, j + 1);
  return t;
}

// Si el modelo principal está saturado (503) o no responde, se reintenta con el
// de respaldo (GEMINI_MODEL_RESPALDO, otro Flash-Lite con su propio cupo), que suele
// tener menos cola. Desde el 30/09/2026 también si el principal no existe (404) o se
// quedó sin cupo del día (429 por día): un solo intento con el respaldo.
// Se lee en cada llamada, igual que el principal.
const TIMEOUT_MS = 12000;
const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

async function llamar(prompt, opciones = {}) {
  const {
    json = false,
    maxTokens = 500,
    esquema = null,
    modelo = null,
    intento = 0,
    audio = null,
    timeoutMs = TIMEOUT_MS,
  } = opciones;
  // Todo reintento sale de las MISMAS opciones, cambiando solo el modelo y el
  // número de intento (auditoría del 15/09/2026, B5 — bloque 4). Antes el
  // reintento por 503/5xx armaba las opciones a mano y se olvidaba de `audio` y
  // `timeoutMs`: el segundo pedido de una transcripción iba sin el audio. Un
  // parámetro nuevo tampoco se puede volver a perder.
  const reintentar = (cambios) => llamar(prompt, { ...opciones, ...cambios });
  // Red cortada por `usarSoloLocal`. Si algo llegó hasta acá es un camino que
  // no previmos: mejor que reviente fuerte y no que salga a Google en silencio
  // en medio de una corrida que se supone offline.
  if (soloLocal) throw new Error('modo solo-local: no se sale a la red');

  const usado = modelo || config.gemini.modelo;
  const url = `${URL_BASE}/${usado}:generateContent?key=${config.gemini.apikey}`;
  // Un audio viaja como una parte más, al lado del prompt.
  const partes = [{ text: prompt }];
  if (audio && audio.base64) {
    partes.push({ inline_data: { mime_type: audio.mimetype || 'audio/ogg', data: audio.base64 } });
  }
  const body = {
    contents: [{ role: 'user', parts: partes }],
    generationConfig: {
      temperature: json ? 0 : 0.7,
      maxOutputTokens: maxTokens,
      ...(json ? { responseMimeType: 'application/json' } : {}),
      ...(esquema ? { responseSchema: esquema } : {}),
    },
  };

  // Nunca esperamos más de timeoutMs: si tarda, cae al extractor local.
  const ctrl = new AbortController();
  const reloj = setTimeout(() => ctrl.abort(), timeoutMs);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (e) {
    clearTimeout(reloj);
    const corte = e.name === 'AbortError';
    if (intento < 1) {
      return reintentar({ modelo: config.gemini.modeloRespaldo, intento: intento + 1 });
    }
    throw new Error(corte ? `Gemini no respondió en ${timeoutMs / 1000}s` : `Gemini: ${e.message}`);
  }
  clearTimeout(reloj);

  if (!res.ok) {
    const detalle = await res.text().catch(() => '');
    const corto = detalle.replace(/\s+/g, ' ').slice(0, 160);
    const sinCupoDelDia = res.status === 429 && /PerDay|per day/i.test(detalle);
    // Si este pedido ya es el respaldo, por qué se llegó a él: que el error lo diga.
    const porElPrincipal = opciones.porElPrincipal ? ` (el principal ${opciones.porElPrincipal})` : '';

    // El principal no existe (404: Google lo retiró) o se quedó sin cupo del día (429 por
    // día): un solo intento con el respaldo, que es otro modelo con su propio cupo (arreglos
    // en vivo, 30/09/2026). Hasta entonces las dos cosas tiraban sin probar nada más. Si el
    // respaldo también falla, sigue lo de siempre: el error con su mensaje y el extractor
    // local. Un 404 o un 429 por día del respaldo no se reintenta.
    if ((res.status === 404 || sinCupoDelDia) && usado !== config.gemini.modeloRespaldo) {
      return reintentar({
        modelo: config.gemini.modeloRespaldo,
        intento: intento + 1,
        porElPrincipal: `${usado} dio ${res.status}${sinCupoDelDia ? ', sin cupo del día' : ''}`,
      });
    }

    // Un 429 por cupo diario NO se arregla reintentando a los 500ms: Google
    // pide esperar bastante más (manda el retryDelay, del orden del minuto) y
    // cada reintento cuenta como otro pedido contra el cupo que queda.
    // Se corta acá y el bot sigue con el extractor local.
    if (sinCupoDelDia) {
      const espera = (detalle.match(/"retryDelay"\s*:\s*"([^"]+)"/) || [])[1];
      throw new Error(
        `Gemini ${res.status} (${usado})${porElPrincipal}: sin cupo por ahora` +
          (espera ? `, reintentar en ${espera}` : '') +
          '. Mientras tanto entiende el extractor local. Si pasa seguido, habilitar facturación en el proyecto de Google.'
      );
    }

    // 503 = saturado, 429 por minuto = pasajero. Esos sí se reintentan.
    if ((res.status === 503 || res.status === 429 || res.status >= 500) && intento < 2) {
      await dormir(500 * (intento + 1));
      return reintentar({
        modelo: intento === 0 ? config.gemini.modeloRespaldo : usado,
        intento: intento + 1,
      });
    }
    throw new Error(`Gemini ${res.status} (${usado})${porElPrincipal}: ${corto}`);
  }

  const data = await res.json();
  const candidato = data?.candidates?.[0];
  const texto = candidato?.content?.parts?.map((p) => p.text).join('') || '';
  // Una transcripción que no terminó (MAX_TOKENS, o cualquier fin que no sea STOP)
  // no sirve: le falta el final, que puede ser el monto. Se trata como
  // transcripción fallida, por el camino de siempre de audio.js (tira → { ok:
  // false }). Solo para audio: un texto cortado sigue devolviéndose como antes.
  const fin = candidato?.finishReason;
  if (audio && fin && fin !== 'STOP') {
    throw new Error(`transcripción cortada (${fin})`);
  }
  return texto.trim();
}

const ESQUEMA = `{
  "intencion": "saludo | consulta_stock | consulta_precio | declara_entrega | permuta | quiere_avanzar | pide_turno | consulta_general | postventa | propone_pago | precio_alto | dolares | se_disculpa | agradece | lo_piensa | reserva | modelo_ambiguo | pide_extremo | sin_contenido | otro",
  "modelo": "el modelo de iPhone que pregunta, tal cual: '13', '13 pro', '15 pro max'. null si no menciona ninguno",
  "modelos": "lista con TODOS los modelos que menciona, si nombra más de uno",
  "capacidad_gb": "128, 256, 512 o null",
  "entrega": "número en pesos que el cliente dice tener para la entrega inicial, sin puntos. null si no lo dijo",
  "permuta": {
    "ofrece": "true si quiere entregar un celular como parte de pago",
    "modelo": "modelo que entrega o null",
    "capacidad_gb": "número o null",
    "bateria": "porcentaje o null",
    "tiene_fotos": "true si ya mandó fotos"
  },
  "forma_pago": "contado | cuotas | dolares | null",
  "zona": "ciudad o barrio que menciona, o null",
  "timing": "cuándo lo quiere, en pocas palabras, o null",
  "urgente": "true si pide hablar con una persona, se queja, o hay un problema con un equipo ya comprado",
  "nota": "un dato del cliente que dice en el ÚLTIMO mensaje, que no entra en ningún campo de arriba y sirve para atenderlo: para quién es, un viaje, que ya compró antes. Una frase corta en tercera persona, sin nombres, teléfonos, mails ni direcciones. null si no hay",
  "dijo_persona": "si el ÚLTIMO mensaje del cliente sigue algo que dejó dicho una persona de la cuenta (la sección 'Lo que escribió una persona de la cuenta'), esa frase de la persona copiada TEXTUAL. Cuenta algo que quedó pendiente ('ahi te confirmo', 'consulto al deposito', 'te aviso', 'mañana entran los 13', 'dame un rato') o algo acordado con este cliente (un precio, una reserva, un turno, un descuento, una fecha). NO cuenta un dato general de stock o de cómo se paga ('sii tenemos ip 14 y 14 pro', 'hacemos hasta 2 cuotas'). null si el mensaje es de otra cosa o no hay nada de eso"
}`;

/** Cuánto hace, para el prompt: "hace 40 min", "hace 20 h", "hace 3 días". */
function haceCuanto(ts, ahora = Date.now()) {
  const min = Math.max(0, Math.round((ahora - ts) / 60000));
  if (min < 60) return `hace ${min} min`;
  const horas = Math.round(min / 60);
  if (horas < 48) return `hace ${horas} h`;
  return `hace ${Math.round(horas / 24)} días`;
}

/**
 * Extrae los datos del mensaje. Devuelve siempre un objeto usable:
 * si Gemini falla, devuelve todo en null y el bot escala.
 *
 * `personas` (01/10/2026, caso Jazz): las últimas líneas de una persona de la cuenta, { texto,
 * ts }, aunque el historial ya no las tenga. Van en su propia sección, con cuándo se dijeron, y
 * Gemini devuelve en la misma llamada la frase que el cliente está siguiendo (`dijo_persona`). El
 * código la valida (responder.js): una frase que no está en esas líneas no cuenta. Si Gemini
 * falla, la lectura del extractor local sale con `_geminiFallo`.
 */
async function entender(historialTexto, mensaje, nombre, personas = []) {
  if (soloLocal) return local.entender(mensaje);
  if (!config.gemini.apikey) return local.entender(mensaje);

  // A Google va la consulta, no quién la hizo.
  const historialLimpio = sinDatosPersonales(historialTexto, nombre);
  const mensajeLimpio = sinDatosPersonales(mensaje, nombre);
  const lineasPersona = (personas || [])
    .filter((l) => l && String(l.texto || '').trim())
    .map((l) => `- ${l.ts ? haceCuanto(l.ts) : 'sin hora'}: "${sinDatosPersonales(String(l.texto).replace(/\s+/g, ' ').trim(), nombre)}"`);
  const seccionPersona = lineasPersona.length
    ? `\n\nLo que escribió una persona de la cuenta (no el bot), de la más vieja a la más nueva:\n${lineasPersona.join('\n')}`
    : '';

  const prompt = `Sos un extractor de datos de conversaciones de venta de iPhones en Argentina.
Devolvés únicamente un JSON con esta forma, sin texto alrededor:

${ESQUEMA}

Reglas:
- Los montos en el chat vienen abreviados. "250" o "250 mil" o "250k" = 250000. "1 palo" = 1000000.
- "plan canje", "permuta", "entrego mi celu", "lo tomas de parte de pago" = permuta.
- Si el cliente dice "dale", "lo quiero", "cuando puedo pasar" después de una cotización, la intención es quiere_avanzar.
- Si arma él mismo la forma de pago ("te doy 50 ahora y el resto el 20", "cuando cobre te pago lo demás") es propone_pago.
- PREGUNTAR cómo es la financiación ("vi que hacen cuotas, como seria?", "como son las cuotas?", "hacen cuotas?") NO es propone_pago: es consulta_general. propone_pago es solo cuando el cliente arma su propio esquema con montos o fechas.
- Si dice que es caro, que se le va, o que no le alcanza, es precio_alto.
- Si quiere pagar o que le coticen en dólares, es dolares.
- Si se disculpa, dice que se le complicó, que no le pagaron o que no llega este mes, es se_disculpa.
- Si solo agradece o se despide, es agradece.
- Si dice que lo va a pensar, que después avisa o que lo consulta, es lo_piensa.
- Si pide que le guarden o reserven un equipo, es reserva.
- Si dice 'el pro' o 'el plus' sin número, es modelo_ambiguo.
- Si pide el más barato o el más caro, es pide_extremo.
- Si el mensaje no dice nada entendible, es sin_contenido.
- No inventes datos que no estén en el texto. Ante la duda, null.
- dijo_persona: solo una frase que esté en 'Lo que escribió una persona de la cuenta', copiada tal cual. Si no hay esa sección, null.

Conversación previa (para contexto; "Persona de la cuenta" es alguien del negocio, "Bot" es el bot):
${historialLimpio || '(no hay)'}${seccionPersona}

Último mensaje del cliente:
"""${mensajeLimpio}"""`;

  try {
    // 400 tokens truncaban la respuesta y el JSON llegaba cortado a la mitad
    const txt = await llamar(prompt, { json: true, maxTokens: 1200, esquema: ESQUEMA_JSON });
    const obj = JSON.parse(limpiarJson(txt));

    // Gemini se pierde cuando el mensaje mezcla un monto con un modelo:
    // "perfecto tengo 520 y quiero el 14 pro" volvía sin entrega, y el bot
    // seguía cotizando con el monto anterior. Si no leyó ninguna, se prueba el
    // extractor local SOLO sobre el mensaje actual, nunca sobre el historial:
    // eso es lo que impide arrastrar un monto viejo como si fuera nuevo.
    let entrega = Number(obj.entrega) || null;
    let entregaFuente = entrega ? 'gemini' : null;
    if (!entrega) {
      entrega = local.extraerMonto(mensaje);
      if (entrega) entregaFuente = 'local';
    }

    return {
      intencion: obj.intencion || 'otro',
      modelo: obj.modelo || null,
      modelos: Array.isArray(obj.modelos) ? obj.modelos : obj.modelo ? [obj.modelo] : [],
      capacidad_gb: Number(obj.capacidad_gb) || null,
      entrega,
      // Quién leyó la entrega, que puede no ser quien leyó el mensaje. Sirve
      // para medir cuántas veces el local está tapando un hueco de Gemini.
      _entregaFuente: entregaFuente,
      permuta: obj.permuta || { ofrece: false },
      forma_pago: obj.forma_pago || null,
      zona: obj.zona || null,
      timing: obj.timing || null,
      urgente: Boolean(obj.urgente),
      // Lo que contó el cliente y no entra en ningún campo. Viene crudo: se
      // limpia con `notaSegura` antes de guardarse y antes de volver a un prompt.
      nota: obj.nota ? String(obj.nota) : null,
      // La frase de una persona de la cuenta que el cliente está siguiendo (01/10/2026). Viene
      // cruda: responder.js la busca en las líneas de persona y, si no está, no cuenta.
      dijo_persona: obj.dijo_persona ? String(obj.dijo_persona) : null,
      _ok: true,
      // Queda registrado quién entendió el mensaje. Sin esto no se puede saber
      // si conviene pagar Gemini o si el extractor local alcanza.
      _fuente: 'gemini',
    };
  } catch (e) {
    // Si Gemini falla (sin cupo, sin red, respuesta rara) no nos quedamos ciegos:
    // el extractor local saca lo esencial y el bot sigue atendiendo.
    console.error('[gemini] falló, uso el extractor local:', e.message);
    // Marcada (01/10/2026): sin Gemini no se sabe si el cliente sigue algo que dijo una persona
    // de la cuenta, y con una persona en las últimas 72 h el bot escala callado (responder.js).
    return { ...local.entender(mensaje), _geminiFallo: true };
  }
}

const ESTILO = `Escribís como Fran, de Somos iPhone NQN (Neuquén, Argentina).
Español rioplatense, informal, casi todo en minúsculas. Mensajes MUY cortos.
Muletillas: "dale", "dale joya", "perfecto", "contame", "quedo atento", "tranqui", "no te hagas drama", "sii".
No saludes: el saludo lo pone el bot, de su lado.
No usás el nombre de la persona: eso lo pone el bot después, de su lado.
Nunca decís que sos un bot. Nunca usás lenguaje formal ni de call center.
Nunca inventás precios, stock, colores ni plazos.`;

/**
 * Redacta una respuesta conversacional (sin números).
 * Si Gemini falla, se devuelve el texto de reserva.
 *
 * El nombre se recibe para poder tacharlo de la instrucción, NO para mandarlo:
 * lo que sale de acá no lleva nombre. Al cliente se lo nombra en las frases de
 * `estilo.js`, que se arman en esta PC y no pasan por ningún modelo.
 */
async function redactar(instruccion, nombre, reserva) {
  if (soloLocal) return reserva;
  // Sin clave no tiene sentido salir a la red: se usa el texto de reserva.
  if (!config.gemini.apikey) return reserva;
  try {
    const prompt = `${ESTILO}

Escribí lo siguiente, en 1 o 2 mensajes cortos separados por un salto de línea. Nada más.
No uses ningún nombre propio.
Qué decir: ${sinDatosPersonales(instruccion, nombre)}`;
    const txt = await llamar(prompt, { maxTokens: 200 });
    return txt || reserva;
  } catch (e) {
    console.error('[gemini] no pude redactar:', e.message);
    return reserva;
  }
}

/**
 * Marca que Gemini devuelve en `redactar` cuando la respuesta no está en los
 * datos que se le pasaron (Mejora 1, decisión del negocio del 16/09/2026). Antes
 * se le pedía "decí que en un rato te confirman", una promesa que nadie cumplía.
 * Con la marca, sola o mezclada con texto, no sale nada y se escala.
 */
const SIN_DATO = '[SIN_DATO]';

/** ¿Lo que redactó Gemini trae la marca? Tolera minúsculas, espacios y "sin dato". */
function tieneSinDato(texto) {
  return /\[\s*sin[\s_-]*dato\s*\]/i.test(String(texto || ''));
}

/** Marca que Gemini devuelve cuando el audio no se entiende. */
const INAUDIBLE = '[INAUDIBLE]';

/**
 * Transcribe una nota de voz.
 *
 * Devuelve el texto pelado, o la marca INAUDIBLE si no se entiende. Es a
 * propósito que no intente "interpretar": un audio mal escuchado que termina
 * en una cotización es peor que un audio que se pide por escrito.
 */
async function transcribir({ base64, mimetype }) {
  if (soloLocal) throw new Error('modo solo-local: no se transcribe');
  if (!config.gemini.apikey) throw new Error('sin clave de Gemini');
  if (!base64) throw new Error('sin audio para transcribir');

  const prompt = `Transcribí este audio de WhatsApp. Es español rioplatense de Argentina,
de una conversación de venta de iPhones.

Reglas:
- Devolvé SOLO la transcripción, sin comillas, sin comentarios, sin traducir.
- No completes ni interpretes lo que creas que quiso decir: transcribí lo que se oye.
- Si el audio no se entiende, está vacío, o no es habla, devolvé exactamente ${INAUDIBLE}`;

  // Un audio tarda más que una consulta de texto, y se manda entero.
  const txt = await llamar(prompt, { maxTokens: 800, timeoutMs: 30000, audio: { base64, mimetype } });
  return String(txt || '').trim();
}

module.exports = {
  // Desde cero (grupo 10, 29/09/2026): lo mira redactar.test.js (sin "buenass", "no saludes").
  ESTILO,
  entender,
  redactar,
  llamar,
  transcribir,
  sinDatosPersonales,
  notaSegura,
  usarSoloLocal,
  esSoloLocal,
  INAUDIBLE,
  SIN_DATO,
  tieneSinDato,
};
