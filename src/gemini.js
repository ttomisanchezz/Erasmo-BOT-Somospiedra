'use strict';
/**
 * Gemini se usa SOLO para transcribir las notas de voz (poda de iPhone, 19/10/2026: entender y redactar
 * eran del "bot de siempre" de iPhone, que quedó en _heredado-iphone/). Quién contesta es Sonnet.
 * Si el principal falla, el respaldo (GEMINI_MODEL_RESPALDO); si tampoco, el audio queda como no
 * entendido y se escala en silencio (audio.js, index.js).
 *
 * Tier gratuito: no se le manda teléfono, nombre real ni datos de contacto (`sinDatosPersonales`, que
 * también usa cerebro.js para lo que va a Anthropic).
 */
const config = require('./config');

const URL_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Modo sin red. Con esto encendido no sale UNA sola request a Google: no se
 * arma el prompt, no se mira la clave y no se llega nunca al fetch. Lo
 * enciende `npm run evaluar -- --offline`. Apagado (false), como siempre.
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

/**
 * Saca del texto lo que identifica a la persona antes de mandarlo a Google.
 * En el tier gratuito Google puede usar los datos para entrenar, así que sale
 * el nombre (y sus deformaciones cariñosas), los teléfonos y los mails.
 * Nada de eso hace falta para entender la consulta.
 */
function sinDatosPersonales(texto, nombre) {
  let t = String(texto || '');
  if (nombre && nombre.length >= 3) {
    // "tomas" tiene que tapar también "tomass" y "tomasss"
    const raiz = nombre.trim().toLowerCase().slice(0, Math.max(3, nombre.length - 1));
    const escapada = raiz.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    t = t.replace(new RegExp(escapada + '\\w*', 'gi'), '[cliente]');
  }
  // Teléfonos: 9 dígitos o más (un monto en pesos tiene 7 como mucho, "2.200.000").
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

  // Nunca esperamos más de timeoutMs: si tarda, se prueba el respaldo y después tira.
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
    // respaldo también falla, sigue lo de siempre: el error con su mensaje. Un 404 o un 429
    // por día del respaldo no se reintenta.
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
    // Se corta acá.
    if (sinCupoDelDia) {
      const espera = (detalle.match(/"retryDelay"\s*:\s*"([^"]+)"/) || [])[1];
      throw new Error(
        `Gemini ${res.status} (${usado})${porElPrincipal}: sin cupo por ahora` +
          (espera ? `, reintentar en ${espera}` : '') +
          '. Si pasa seguido, habilitar facturación en el proyecto de Google.'
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

/** Marca que Gemini devuelve cuando el audio no se entiende. */
const INAUDIBLE = '[INAUDIBLE]';

/**
 * Transcribe una nota de voz.
 *
 * Devuelve el texto pelado, o la marca INAUDIBLE si no se entiende. Es a
 * propósito que no intente "interpretar": un audio mal escuchado que termina
 * en una respuesta equivocada es peor que un audio que escala.
 */
async function transcribir({ base64, mimetype }) {
  if (soloLocal) throw new Error('modo solo-local: no se transcribe');
  if (!config.gemini.apikey) throw new Error('sin clave de Gemini');
  if (!base64) throw new Error('sin audio para transcribir');

  const prompt = `Transcribí este audio de WhatsApp. Es español rioplatense de Argentina,
de un cliente que le escribe a un negocio.

Reglas:
- Devolvé SOLO la transcripción, sin comillas, sin comentarios, sin traducir.
- No completes ni interpretes lo que creas que quiso decir: transcribí lo que se oye.
- Si el audio no se entiende, está vacío, o no es habla, devolvé exactamente ${INAUDIBLE}`;

  // Un audio tarda más que una consulta de texto, y se manda entero.
  const txt = await llamar(prompt, { maxTokens: 800, timeoutMs: 30000, audio: { base64, mimetype } });
  return String(txt || '').trim();
}

module.exports = {
  llamar,
  transcribir,
  sinDatosPersonales,
  notaSegura,
  usarSoloLocal,
  esSoloLocal,
  INAUDIBLE,
};
