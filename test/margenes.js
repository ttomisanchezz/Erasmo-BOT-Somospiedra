'use strict';
/**
 * Muestra, modelo por modelo, cuánto termina pagando el cliente según la base
 * de cotización que le pongas. Sirve para elegir el Precio_cotizacion de cada
 * equipo hasta que el total caiga donde lo querés.
 *
 *   npm run margenes                 con la planilla en vivo
 *   npm run margenes -- --offline    con la copia congelada
 *   npm run margenes -- 550000       simulando esa entrega en todos
 *
 * Los números los decidís vos: esto solo hace la cuenta.
 */
const sheets = require('../src/sheets');
const { cotizar } = require('../src/cotizador');

const OFFLINE = process.argv.includes('--offline');
const ENTREGA_FIJA = parseInt(process.argv.find((a) => /^\d{4,}$/.test(a)) || '0', 10);

const pesos = (n) => '$' + Math.round(n || 0).toLocaleString('es-AR');
const col = (s, n) => String(s).padStart(n);

(async () => {
  if (OFFLINE) sheets.usarFixture(require('./fixture-planilla'));
  const datos = await sheets.leerTodo();

  console.log('');
  console.log('  Modelo              Contado      Base cuotas   Entrega      1 pago      Total 1    2 pagos     Total 2   Margen s/contado');
  console.log('  ' + '─'.repeat(120));

  for (const f of [...datos.lista, ...datos.usados]) {
    if (!f.cotizable || !f.precio_contado) continue;
    const entrega = ENTREGA_FIJA || f.anticipo_min;
    const c = cotizar(f, entrega, datos.config);
    if (!c.ok || c.soloContado) continue;

    const margen2 = c.totalCon2 - f.precio_contado;
    const pct = ((margen2 / f.precio_contado) * 100).toFixed(1);

    console.log(
      '  ' +
        String(f.modelo.replace(/^iPhone\s*/i, '')).padEnd(18) +
        col(pesos(f.precio_contado), 12) +
        col(pesos(c.base), 14) +
        col(pesos(entrega), 12) +
        col(pesos(c.pagoUnico), 12) +
        col(pesos(c.totalCon1), 12) +
        col(pesos(c.cuotaDe2), 11) +
        col(pesos(c.totalCon2), 12) +
        col(pesos(margen2) + ` (${pct}%)`, 20)
    );
  }

  console.log('');
  console.log('  "Base cuotas" es la columna Precio_cotizacion. Si está vacía, se usa el contado.');
  console.log('  "Total 2" es lo que termina pagando el cliente si va a 2 cuotas.');
  console.log('');
})();
