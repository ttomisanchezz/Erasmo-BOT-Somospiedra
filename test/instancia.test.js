'use strict';
/**
 * La instancia de Evolution (poda de iPhone, 19/10/2026). Evolution es compartido con Somos iPhone:
 * una instancia por negocio. Si el bot de Piedra arrancara con la instancia vacía o con `somosiphone`,
 * leería y contestaría el WhatsApp de iPhone. Por eso se niega a arrancar: mensaje claro, sin
 * conectarse a nada (no carga el estado ni llama a fetch) y con código 1.
 *
 *   node test/instancia.test.js
 *
 * Cada caso corre en un proceso aparte, con su propio entorno y desde una carpeta temporal (así
 * dotenv no lee ningún .env), con fetch de mentira que deja constancia si alguien lo llama.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const INDEX = path.join(__dirname, '..', 'src', 'index.js');
const CONFIG = path.join(__dirname, '..', 'src', 'config.js');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'instancia-test-'));

function correr(instancia, script) {
  const env = {
    PATH: process.env.PATH,
    ESTADO_PATH: path.join(tmp, `estado-${Math.random().toString(36).slice(2)}.json`),
    APRENDIZAJE_PATH: path.join(tmp, `apr-${Math.random().toString(36).slice(2)}.jsonl`),
    CEREBRO_MODO: 'apagado',
    MODO_ESCUCHA: 'true',
    GUARDIAN_ACTIVO: 'false',
  };
  if (instancia !== undefined) env.EVOLUTION_INSTANCE = instancia;
  return spawnSync(process.execPath, ['-e', script], { cwd: tmp, env, encoding: 'utf8', timeout: 20000 });
}

const CARGAR =
  "globalThis.fetch = () => { console.log('SALIO_A_LA_RED'); throw new Error('red'); };" +
  `require(${JSON.stringify(INDEX)});` +
  "console.log('CARGO'); process.exit(0);";

let fallos = 0;
function check(nombre, fn) {
  try {
    fn();
    console.log('  ok   ' + nombre);
  } catch (e) {
    fallos++;
    console.log('  FALLA ' + nombre + ' -> ' + e.message);
  }
}

console.log('\nInstancia de Evolution\n');

for (const [nombre, valor] of [
  ['sin EVOLUTION_INSTANCE', undefined],
  ['EVOLUTION_INSTANCE vacía', ''],
  ['EVOLUTION_INSTANCE con espacios', '   '],
  ['EVOLUTION_INSTANCE=somosiphone', 'somosiphone'],
  ['EVOLUTION_INSTANCE=SomosIphone (mayúsculas)', 'SomosIphone'],
  ['EVOLUTION_INSTANCE=" somosiphone " (con espacios)', ' somosiphone '],
]) {
  check(`${nombre}: no arranca (código 1, mensaje claro, sin red)`, () => {
    const r = correr(valor, CARGAR);
    assert.strictEqual(r.status, 1, `salió con ${r.status}; stdout: ${r.stdout} stderr: ${r.stderr}`);
    assert.ok(!/CARGO/.test(r.stdout), 'siguió de largo');
    assert.ok(!/SALIO_A_LA_RED/.test(r.stdout), 'llamó a fetch');
    assert.match(r.stderr, /EVOLUTION_INSTANCE/);
    assert.match(r.stderr, /no arranco/i);
  });
}

check('sin EVOLUTION_INSTANCE no crea el archivo de estado', () => {
  const env = path.join(tmp, 'estado-que-no-tiene-que-existir.json');
  const r = spawnSync(process.execPath, ['-e', CARGAR], {
    cwd: tmp,
    env: { PATH: process.env.PATH, ESTADO_PATH: env, APRENDIZAJE_PATH: path.join(tmp, 'apr-x.jsonl'), CEREBRO_MODO: 'apagado' },
    encoding: 'utf8',
    timeout: 20000,
  });
  assert.strictEqual(r.status, 1);
  assert.ok(!fs.existsSync(env), 'escribió el estado');
});

check('EVOLUTION_INSTANCE=somospiedra: carga sin salir a la red', () => {
  const r = correr('somospiedra', CARGAR);
  assert.strictEqual(r.status, 0, `salió con ${r.status}; stderr: ${r.stderr}`);
  assert.match(r.stdout, /CARGO/);
  assert.ok(!/SALIO_A_LA_RED/.test(r.stdout), 'llamó a fetch al cargar');
});

check('el default de la instancia es vacío y el puerto 3002', () => {
  const r = spawnSync(
    process.execPath,
    ['-e', `const c = require(${JSON.stringify(CONFIG)}); process.stdout.write(JSON.stringify([c.evolution.instancia, c.puerto]))`],
    { cwd: tmp, env: { PATH: process.env.PATH }, encoding: 'utf8', timeout: 20000 }
  );
  assert.strictEqual(r.status, 0, r.stderr);
  assert.deepStrictEqual(JSON.parse(r.stdout), ['', 3002]);
});

check('.env.example trae EVOLUTION_INSTANCE vacía', () => {
  const ej = fs.readFileSync(path.join(__dirname, '..', '.env.example'), 'utf8');
  assert.match(ej, /^EVOLUTION_INSTANCE=\s*$/m);
});

fs.rmSync(tmp, { recursive: true, force: true });
console.log(fallos ? `\n${fallos} FALLA(S)\n` : '\nTodo OK\n');
process.exit(fallos ? 1 : 0);
