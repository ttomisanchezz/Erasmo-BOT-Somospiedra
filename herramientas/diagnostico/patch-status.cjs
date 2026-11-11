// Parche de Baileys (evolution-api #2778 / Baileys #2858): confirma (ack) las stanzas <status> de nivel superior.
// Sin esto WhatsApp retiene los mensajes entrantes y corta el stream ("stream errored out", ack class="status").
// Uso (adentro del contenedor): node patch-status.cjs /evolution/node_modules/baileys
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const raiz = process.argv[2];
const archivo = path.join(raiz, 'lib/Socket/messages-recv.js');
const version = JSON.parse(fs.readFileSync(path.join(raiz, 'package.json'), 'utf8')).version;
console.log('baileys ' + version);
const original = fs.readFileSync(archivo, 'utf8');
if (original.includes("'CB:status'") || original.includes('"CB:status"')) { console.log('YA-PARCHEADO'); process.exit(0); }
for (const nombre of ['sendMessageAck', 'onUnexpectedError']) {
  if (!original.includes(nombre)) { console.log('FALTA ' + nombre + ': no parcheo'); process.exit(2); }
}
const lineas = original.split('\n');
const idx = lineas.map((l, i) => (/^\s*ws\.on\(\s*['"]CB:notification['"]/.test(l) ? i : -1)).filter((i) => i >= 0);
if (idx.length !== 1) { console.log('ANCLA no encontrada o repetida (' + idx.length + '): no parcheo'); process.exit(3); }
const sangria = lineas[idx[0]].match(/^\s*/)[0];
const parche = [
  sangria + "ws.on('CB:status', (node) => {",
  sangria + "    sendMessageAck(node).catch(error => onUnexpectedError(error, 'acking status stanza'));",
  sangria + '});',
];
lineas.splice(idx[0], 0, ...parche);
const copia = archivo + '.antes-del-parche';
if (!fs.existsSync(copia)) fs.writeFileSync(copia, original);
fs.writeFileSync(archivo, lineas.join('\n'));
try {
  execFileSync(process.execPath, ['--check', archivo], { stdio: 'pipe' });
} catch (e) {
  fs.writeFileSync(archivo, original);
  console.log('node --check FALLO, restaure el original: ' + String(e.stderr || e.message).slice(0, 300));
  process.exit(4);
}
console.log('PARCHE-OK en la linea ' + (idx[0] + 1));
