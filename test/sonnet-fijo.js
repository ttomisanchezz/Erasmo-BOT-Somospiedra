'use strict';
/**
 * Un Sonnet de mentira que siempre contesta (poda de iPhone, 19/10/2026), para los tests de infraestructura que
 * necesitan que "el bot conteste algo" (antes lo hacía el bot de siempre de iPhone) y no miran qué. Envuelve el
 * `fetch` que haya: lo que va a la API de Anthropic vuelve como un `responder` con un texto distinto cada vez
 * ("dale, te leo (a)", "(b)"…: el filtro de repetidos no lo frena), salvo que lo que escribió ahora el cliente
 * pida hablar con alguien: ahí `escalar`. Lo demás sigue al fetch de antes.
 * Lo usan junto con CEREBRO_MODO=todos y una ANTHROPIC_API_KEY de mentira.
 */
let n = 0;
const letras = (i) => (i < 26 ? String.fromCharCode(97 + i) : letras(Math.floor(i / 26) - 1) + String.fromCharCode(97 + (i % 26)));

function instalar() {
  const antes = globalThis.fetch;
  const llamadas = [];
  globalThis.fetch = async (url, opciones = {}) => {
    if (!String(url).startsWith('https://api.anthropic.com/')) return antes(url, opciones);
    const body = JSON.parse(opciones.body);
    llamadas.push(body);
    const pedido = (body.messages[0].content.find((b) => b.type === 'text') || {}).text || '';
    const ahora = (pedido.match(/"""\n([\s\S]*?)\n"""/g) || []).pop() || '';
    const texto = `dale, te leo (${letras(n++)})`;
    const content = /hablar con alguien/i.test(ahora)
      ? [{ type: 'tool_use', id: 'toolu_fijo_' + n, name: 'escalar', input: { motivo: 'pide hablar con una persona' } }]
      : [{ type: 'tool_use', id: 'toolu_fijo_' + n, name: 'responder', input: { mensajes: [texto] } }];
    const cuerpo = { id: 'msg', type: 'message', role: 'assistant', content, stop_reason: 'tool_use', usage: { input_tokens: 1, output_tokens: 1 } };
    return { ok: true, status: 200, json: async () => cuerpo, text: async () => JSON.stringify(cuerpo) };
  };
  return { llamadas };
}

module.exports = { instalar };
