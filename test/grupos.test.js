'use strict';
// npm run grupos: lista nombre + JID de los grupos de la instancia, sin red y sin imprimir la clave.
process.env.EVOLUTION_INSTANCE = 'somospiedra';
process.env.EVOLUTION_APIKEY = 'clave-de-mentira-que-no-debe-salir';
process.env.EVOLUTION_URL = 'http://evolution-de-mentira:8080';
const assert = require('assert');
const { listarGrupos, comoTexto } = require('../herramientas/grupos/listar');

let fallos = 0;
async function check(nombre, fn) {
  try {
    await fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + (e && e.message));
  }
}
const respuesta = (status, cuerpo) => ({ ok: status < 300, status, json: async () => cuerpo });

(async () => {
  await check('pide los grupos de LA instancia de Piedra, sin participantes, con la clave en el header', async () => {
    let visto;
    const r = await listarGrupos({ fetchFn: async (url, op) => ((visto = { url, op }), respuesta(200, [])) });
    assert.deepStrictEqual(r, []);
    assert.strictEqual(visto.url, 'http://evolution-de-mentira:8080/group/fetchAllGroups/somospiedra?getParticipants=false');
    assert.strictEqual(visto.op.headers.apikey, 'clave-de-mentira-que-no-debe-salir');
    assert.ok(!visto.op.method || visto.op.method === 'GET');
  });
  await check('nombre + JID, ordenados; lo que no es un grupo no entra', async () => {
    const datos = [
      { id: '120363000000000002@g.us', subject: 'Bot Erasmo' },
      { id: '5490000000001@s.whatsapp.net', subject: 'no es grupo' },
      { id: '120363000000000001@g.us', subject: 'Familia' },
      null,
    ];
    const r = await listarGrupos({ fetchFn: async () => respuesta(200, datos) });
    assert.deepStrictEqual(r, [
      { nombre: 'Bot Erasmo', jid: '120363000000000002@g.us' },
      { nombre: 'Familia', jid: '120363000000000001@g.us' },
    ]);
    const t = comoTexto(r);
    assert.ok(t.includes('Bot Erasmo') && t.includes('120363000000000002@g.us'));
    assert.ok(!t.includes('clave-de-mentira'));
  });
  await check('Evolution con error o con otra cosa: tira con el motivo, sin la clave', async () => {
    await assert.rejects(listarGrupos({ fetchFn: async () => respuesta(401, {}) }), (e) => /401/.test(e.message) && !/clave/.test(e.message));
    await assert.rejects(listarGrupos({ fetchFn: async () => respuesta(200, { raro: true }) }), /lista de grupos/);
  });
  await check('sin grupos: lo dice', async () => {
    assert.ok(/no tiene grupos/.test(comoTexto([])));
  });
  console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
  process.exit(fallos ? 1 : 0);
})();
