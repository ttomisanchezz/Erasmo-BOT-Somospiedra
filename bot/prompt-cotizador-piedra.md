# Cotizador de Somos Piedra: HECHO en el chat (16/10/2026), no se lanza en VS Code

Este prompt quedó obsoleto: el cotizador de dos precios se construyó directo en el chat con las respuestas de Tomás del 16/10.

- Código: `src/cotizador-piedra.js` (puro, centavos enteros con BigInt, sin flotantes sobre plata).
- Tests: `test/cotizador-piedra.test.js` (24 casos con productos inventados), en `npm test`.
- Modelo: EFECTIVO (efectivo, transferencia, Mercado Pago, QR; + 21 % con factura) y LISTA (tarjeta, cheque, postnet; ya con factura). Por defecto, efectivo.
- FALTA DATO: precio de cada columna, unidad, cobertura (pedido en m² de un producto por unidad), desperdicio (pedido en m²), tramo de granza no exacto, recargo de cuotas.
- Supuesto a confirmar con Fran: el precio de un tramo de granza es el total del tramo.

Lo que sigue: prompt 3 (lector de la planilla, cuando esté el Excel en `data\precios\`) y prompt 4 (herramientas del cerebro `buscar_productos`, `cotizar`, `costo_envio`).
