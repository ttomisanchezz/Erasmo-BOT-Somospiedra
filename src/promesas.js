'use strict';
/**
 * Las promesas que el bot nunca hace, por la FORMA de la frase.
 *
 *   - A nombre de otra persona ("ahora te responde fran", "dejame verlo con fran", "te va a llamar
 *     tomi"): si nadie escribe, el cliente se queda esperando un mensaje que no llega. No alcanza
 *     con una lista de nombres ("fran", "tomi"): mañana entra otro vendedor y la regla no lo ve. Se
 *     busca un verbo de responder pegado a un nombre y se descartan las palabras comunes que pueden
 *     ocupar ese lugar ("te pasa algo", "te confirma el horario").
 *   - De contacto posterior (Mejora 1, decisión del negocio del 16/09/2026): "te aviso", "te
 *     confirmo", "me fijo", "dame un minuto".
 *
 * Vivían en test/correr-caso.js (las reglas globales de `evaluar`). Desde el cerebro Sonnet (fase
 * 1, 01/10/2026) también las usa la guardia de src/cerebro.js, que corre dentro del bot: por eso
 * pasaron acá, sin cambios. La regla se sigue probando a sí misma en correr-caso.js.
 */

// Sin tildes: el rango de las marcas combinables (U+0300 a U+036F), armado con los códigos para
// que ninguna herramienta de edición lo convierta en caracteres invisibles.
const TILDES = new RegExp(`[${String.fromCharCode(0x300)}-${String.fromCharCode(0x36f)}]`, 'g');
const sinTildes = (t) => String(t || '').toLowerCase().normalize('NFD').replace(TILDES, '');

const NO_ES_NOMBRE = new Set(
  (
    'el la los las lo le les un una unos unas al del de a en con por para que ya ahora ahi aca alla ' +
    'bien mal mas mejor todo toda todos eso esto esa ese esos esas estos estas asi algo nada hoy ' +
    'manana luego despues enseguida rapido pronto cuando cuanto cual quien donde como apenas si no ' +
    'me te se nos mi tu su vos yo precio numero numeros info datos detalle foto fotos dni alias cbu ' +
    'pdf lista cuotas contado turno horario direccion ubicacion link audio mensaje compromiso equipo ' +
    'celu celular modelo stock entrega cotizacion ' +
    // "queres que te pase algun otro?": el subjuntivo se escribe igual en primera
    // y en tercera persona, así que lo que desempata es la palabra que sigue.
    'algun alguno alguna algunos algunas otro otra otros otras uno cada mismo misma poco mucho ' +
    'tanto rato ratito toque momento minuto dia dias hora horas semana primero ultimo nuevo igual ' +
    'tambien siempre solo queda quedan quedaria quedarian'
  ).split(' ')
);
const RESPONDE = 'responde|contesta|escribe|llama|confirma|coordina|pasa|manda|habla|atiende|avisa|cotiza|explica|ayuda|contacta';
const RESPONDA = 'responda|conteste|escriba|llame|confirme|coordine|pase|mande|hable|atienda|avise|cotice|explique|ayude|contacte';
const CONSULTAR =
  'verlo|consultarlo|confirmarlo|hablarlo|chequearlo|coordinarlo|charlarlo|consultar|confirmar|hablar|chequear|coordinar|charlar|ver|consulto|confirmo|hablo|chequeo|veo|charlo';
const VA_A = 'responder|contestar|escribir|llamar|confirmar|coordinar|pasar|atender|avisar|contactar';

const PROMESAS = [
  new RegExp(`\\bte (?:${RESPONDE})n? ([a-z]+)`, 'g'), //            "ahora te responde fran"
  new RegExp(`\\bque te (?:${RESPONDA})n? ([a-z]+)`, 'g'), //        "dejame que te ayude fran"
  new RegExp(`\\b(?:${CONSULTAR}) con ([a-z]+)`, 'g'), //            "dejame verlo con fran"
  new RegExp(`\\b([a-z]+) te (?:${RESPONDE}|va a|van a)\\b`, 'g'), // "fran te escribe"
  new RegExp(`\\bte (?:va|van) a (?:${VA_A}) ([a-z]+)`, 'g'), //     "te va a llamar tomi"
];

/** El pedazo del mensaje que promete una respuesta a nombre de otro, o null. */
function promesaDeOtro(texto) {
  const t = sinTildes(texto);
  for (const re of PROMESAS) {
    for (const m of t.matchAll(re)) {
      if (!NO_ES_NOMBRE.has(m[1])) return m[0];
    }
  }
  return null;
}

// Las promesas de contacto posterior de la Mejora 1, sobre el texto sin tildes.
const PROMESA_DE_CONTACTO =
  /\b(te avis(o|amos)|te confirm(o|amos|an)|en un rat(o|ito)|me fijo|ahora te paso|apenas (entre|llegue)|te escrib(o|imos)|te contact(o|amos)|dame un (minuto|ratito)|dejame (consultar|confirmar|chequear)\w*)\b/;

module.exports = { sinTildes, promesaDeOtro, PROMESA_DE_CONTACTO };
