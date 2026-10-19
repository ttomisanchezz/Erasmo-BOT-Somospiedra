'use strict';
/**
 * Prueba de conexión con la planilla. Corré esto ANTES que nada:
 *   npm run probar-planilla
 * Si esto no anda, el bot no puede cotizar.
 */
const sheets = require('../src/sheets');
const { cotizar, plantilla } = require('../src/cotizador');

(async () => {
  try {
    const datos = await sheets.leerTodo();

    console.log('\nCONFIG');
    console.log('  Estado de la lista :', datos.config.estadoLista);
    console.log('  Última lista       :', datos.config.fechaUltimaLista);
    console.log('  Coeficientes       :', datos.config.coef1, '/', datos.config.coef2);
    console.log('  Redondeo           :', datos.config.redondeo);

    if (datos.config.estadoLista !== 'VIGENTE') {
      console.log('\n  ATENCIÓN: con la lista así, el bot no cotiza nada.');
    }

    console.log(`\nLISTA — ${datos.lista.length} modelos`);
    datos.lista.forEach((f) => {
      console.log(
        `  ${f.cotizable ? 'ok ' : 'NO '} ${f.modelo.padEnd(20)} ${String(f.capacidad_gb).padStart(4)}GB  ` +
          `contado ${String(f.precio_contado).padStart(9)}  mínimo ${String(f.anticipo_min).padStart(9)}`
      );
    });

    console.log(`\nUSADOS — ${datos.usados.length} equipos`);
    datos.usados.forEach((f) => {
      console.log(
        `  ${f.cotizable ? 'ok ' : 'NO '} ${f.modelo} ${f.capacidad_gb}GB ${f.color || ''} ` +
          `${f.bateria_min}%  contado ${f.precio_contado}`
      );
    });

    // Cotización de prueba sobre el primer modelo cotizable
    const muestra = datos.lista.find((f) => f.cotizable);
    if (muestra) {
      const entrega = muestra.anticipo_min;
      const c = cotizar(muestra, entrega, datos.config);
      console.log('\nCotización de prueba (entrega = mínimo):\n');
      console.log(plantilla(muestra, c));
    }

    console.log('\nLa planilla se lee bien.\n');
  } catch (e) {
    console.error('\nNo pude leer la planilla:', e.message);
    console.error('\nRevisá que:');
    console.error('  1. credenciales.json esté en la carpeta del proyecto');
    console.error('  2. la planilla esté compartida con el client_email de ese archivo');
    console.error('  3. SHEET_ID en el .env sea el correcto');
    console.error('  4. las hojas se llamen CONFIG, LISTA, USADOS y LEADS\n');
    process.exit(1);
  }
})();
