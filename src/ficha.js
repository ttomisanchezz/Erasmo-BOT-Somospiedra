'use strict';
/**
 * La ficha de cada chat (09/11/2026), para iterar a Erasmo en el modo tester y para que el equipo vea de un
 * vistazo en qué quedó cada cliente. Vive en el estado del chat (`s.ficha`) y la arma el código, no Sonnet:
 *   - `anuncio`: de qué anuncio de Meta vino (src/anuncio.js: `s.anuncio`), si vino de uno;
 *   - `pidio`: lo último que se cotizó ({ producto, cantidad, unidad, pago, factura }), y `cotizaciones` (las últimas 5);
 *   - `ultimoMensaje`: lo último que escribió el cliente, recortado;
 *   - `quedo`: en qué quedó la última respuesta ("respondió", "respondió y mandó el catálogo", "escaló: …");
 *   - `seguimiento`: { fecha, motivo } si hay que volver a contactarlo (lo anota index.js cuando salió la respuesta).
 * Nada de acá le llega al cliente. Sin números de teléfono ni nombres: el chat ya los tiene.
 */
const MAX_COTIZACIONES = 5;

const recorte = (t, largo) => {
  const una = String(t || '').replace(/\s+/g, ' ').trim();
  return una.length > largo ? una.slice(0, largo - 1).trimEnd() + '…' : una;
};

/**
 * La ficha nueva del chat `s` después de una respuesta de Sonnet `r` (la de `cerebro.pensar`, sin error).
 * `ahora` en ms. No toca el estado: devuelve el objeto.
 */
function armar(s, r, ahora = Date.now()) {
  const previa = (s && s.ficha) || {};
  const cotizaciones = [...(previa.cotizaciones || [])];
  if (r && r.cotizo) {
    cotizaciones.push({ ...r.cotizo, ts: ahora });
    while (cotizaciones.length > MAX_COTIZACIONES) cotizaciones.shift();
  }
  const ultimaDelCliente = [...((s && s.historial) || [])].reverse().find((l) => l && l.quien === 'cliente');
  const acciones = (r && r.acciones) || {};
  const quedo = r && r.escalar ? `escaló: ${recorte(r.motivo, 120)}` : acciones.catalogo ? 'respondió y mandó el catálogo' : 'respondió';
  const ficha = {
    ...(s && s.anuncio ? { anuncio: { id: s.anuncio.id || null, titulo: s.anuncio.titulo || '' } } : {}),
    ...(cotizaciones.length ? { pidio: cotizaciones[cotizaciones.length - 1], cotizaciones } : {}),
    ultimoMensaje: ultimaDelCliente ? recorte(ultimaDelCliente.texto, 160) : previa.ultimoMensaje || '',
    quedo,
    ...(previa.seguimiento ? { seguimiento: previa.seguimiento } : {}),
    ...(previa.catalogoEnviado ? { catalogoEnviado: previa.catalogoEnviado } : {}),
    actualizado: ahora,
  };
  return ficha;
}

/** Una línea para mirar la ficha ("vino del anuncio X · pidió granza roja 12 m² · quedó: respondió"). */
function comoTexto(ficha) {
  if (!ficha) return 'sin ficha';
  const partes = [];
  if (ficha.anuncio) partes.push(`vino del anuncio ${ficha.anuncio.titulo || ficha.anuncio.id || '(sin título)'}`);
  if (ficha.pidio) partes.push(`pidió ${ficha.pidio.producto} ${ficha.pidio.cantidad} ${ficha.pidio.unidad}`.trim());
  if (ficha.quedo) partes.push(`quedó: ${ficha.quedo}`);
  if (ficha.seguimiento) partes.push(`seguimiento ${ficha.seguimiento.fecha}: ${ficha.seguimiento.motivo}`);
  return partes.join(' · ') || 'sin ficha';
}

module.exports = { armar, comoTexto, recorte };
