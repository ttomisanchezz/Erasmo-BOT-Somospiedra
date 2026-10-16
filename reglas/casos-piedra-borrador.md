# Casos de prueba de Somos Piedra — BORRADOR (Etapa 2)

> EN REVISIÓN (16/10/2026): los casos 3, 16 y todos los de la sección B (pago, factura, cuotas) asumen "precio de lista sin factura". La planilla real tiene dos precios (efectivo y lista, según el medio de pago). Se reescriben cuando Tomás conteste las preguntas de precios.

Estado: 15/10/2026. Están en texto para que los revises. Cuando se aprueben las reglas y esté el prompt 4 (herramientas del cerebro), se convierten al formato de `test/bateria-cerebro-casos.js` y a los casos de `evaluar --offline`.

Cómo se armaron: cada caso sale de una conversación real del historial, identificada en la columna **Origen** (`cXXXX#n` = chat y conversación en `resultados.jsonl`). Lo que "escribe el cliente" es **inventado y parafraseado**: sin nombres, sin teléfonos reales (5490000000000) y sin montos de verdad. Ningún importe se escribe a mano: lo calcula la herramienta con una planilla de prueba.

Resultados posibles:
- **RESPONDE**: manda de 1 a 4 mensajes de hasta 300 caracteres. Se indica qué tiene que decir y qué no.
- **ESCALA**: no le llega nada al cliente; el grupo recibe el motivo.
- **MUDO**: no responde y no escala.

Dependencias: `[P]` necesita planilla de prueba; `[F]` el resultado final depende de una respuesta de Fran (hoy el bot escala); `[H]` comportamiento heredado del sistema.

## A. Consultas de producto y precio

| # | Origen | Escribe el cliente | Esperado |
|---|---|---|---|
| 1 | c0039#1 | "Hola, buenas. Quiero poner piedra decorativa en el jardín. Qué variedades tienen y cuánto sale?" | RESPONDE: nombra las familias de la planilla `[P]` y pregunta cuántos m² cubrir. NO da precio (falta cantidad y producto). |
| 2 | c0178#1 | "Buenas, precio del m2 de la piedra?" (sin decir cuál) | RESPONDE: pregunta qué piedra o para qué uso. NO da ningún precio. |
| 3 | c0072#1 | "Necesito piedra blanca para un fogón de 3,5 x 3,5. A cuánto sale?" | RESPONDE: la cantidad y el total salen de `cotizar` con las medidas tal cual; precio de lista sin factura; no menciona IVA ni tarjeta. `[P]` |
| 4 | c0049#1 | "Venden piedra de jardín en poca cantidad? Son 9 m2." | RESPONDE: sí, con cantidad y total de la herramienta; no inventa espesor distinto de 2–3 cm. `[P][F]` |
| 5 | c0030#1 | "Cotizame 20 m2 de granza, 30 bolsas blancas y 10 grises, con envío a Roca" | RESPONDE con las bolsas y totales de `cotizar`, sin envío; ESCALA el costo del envío (no hay tabla). Si no puede las dos cosas en una respuesta: ESCALA con motivo "cotización con envío a Roca". `[P][F]` |
| 6 | c0099#1 | "Valor del m2 del travertino blanco de 10 cm para dos paredes" | RESPONDE con el precio de `cotizar` que usa la cotización del dólar del día; si no hay cotización cargada hoy: ESCALA "falta cotización del dólar". `[P]` |
| 7 | c0043#1 | "Cuánto sale el bolsón de las piedras de la foto" (manda foto) | ESCALA "pide precio de una piedra de la foto, no se puede identificar" salvo que la foto sea clara y coincida con un producto de la planilla. `[F]` |
| 8 | c0025#1 | "Puedo comprar la misma piedra combinando 5 cm y 10 cm para que quede parejo?" | ESCALA "consulta técnica de combinación de espesores". |
| 9 | c0065#3 | "Cuánto cubre un m3 de granza?" | RESPONDE solo con el rendimiento que traiga la planilla; si no está: ESCALA. NO inventa. `[P][F]` |
| 10 | (sin id) | "Ayer me dijeron 22 mil la bolsa. Sigue igual?" | RESPONDE con el precio que devuelva `cotizar` en esta respuesta, o ESCALA. NO confirma ni repite el 22 mil. `[P]` |

## B. Forma de pago, factura y cuotas

| # | Origen | Escribe el cliente | Esperado |
|---|---|---|---|
| 11 | c0009#1 | "Con débito y con transferencia sale lo mismo? Y con tarjeta de crédito?" | RESPONDE con los números de `cotizar` (con factura: tarjeta y cuotas solo con factura); NO calcula recargos. `[P][F]` Si faltan los % de cuotas: ESCALA. |
| 12 | c0046#1 | "Necesito cotización formal con factura A a nombre de una empresa" | ESCALA "pide cotización formal con factura A". NO genera PDF. |
| 13 | c0014#1 | "Quiero pagar con link de pago, con tarjeta" | ESCALA "quiere pagar con tarjeta". NO manda link. |
| 14 | c0003#1 | "Dale, la compro. A dónde transfiero?" | ESCALA "quiere pagar, pide datos de transferencia". NO pasa alias. `[F]` |
| 15 | varios (el local pide el CUIT en 4 conversaciones) | "Te paso mi CUIT para la factura" | ESCALA "envía CUIT para facturar". |
| 16 | c0009#1 | "Me hacés un descuento si pago en efectivo?" | RESPONDE solo con lo que dé `cotizar` para efectivo con y sin factura; NO inventa el descuento. `[P][F]` |
| 17 | c0124#4 | "Y si llevo 80 m2? me hacés mejor precio?" | ESCALA "pide descuento por 80 m²". NO dice "te lo dejo en…". |

## C. Envío y entrega

| # | Origen | Escribe el cliente | Esperado |
|---|---|---|---|
| 18 | c0032#1 | "Hacen envíos a una localidad de Río Negro? Cuánto sale con flete?" | ESCALA "pide envío fuera de Neuquén" (sin tabla de envíos). `[F]` |
| 19 | c0036#1 | "Me lo traen hoy a mi casa en Neuquén?" | ESCALA. NO promete "hoy". |
| 20 | c0102#2 | "Ya pagué con tarjeta, a qué hora llevan las baldosas?" | ESCALA "seguimiento de entrega, dice que ya pagó". NO inventa horario. |
| 21 | c0161#3 | "Llegaron las piedras que pedí?" | ESCALA "pregunta si llegó su pedido". |
| 22 | c0054#11 | "Pasen a retirar la piedra que sobró en la obra" | ESCALA "pide retiro de sobrante". |
| 23 | c0020#1 | "Hasta qué hora están hoy? Quiero pasar a buscar" | RESPONDE con el horario y la dirección ya confirmados por Fran. Hasta entonces: ESCALA. `[F]` |

## D. Fuera de catálogo y casos raros

| # | Origen | Escribe el cliente | Esperado |
|---|---|---|---|
| 24 | c0107#1 | "Venden semillas de césped? Tienen stock?" | ESCALA "consulta por semillas de césped" (la app deja afuera el vivero; el historial dice que a veces sí). `[F]` |
| 25 | c0060#1 | "A cuánto el m2 de rollos de césped?" | ESCALA. Mismo criterio. `[F]` |
| 26 | c0081#1 | "Vendés pegamento para esto? Cuál me recomendás?" | RESPONDE solo con adhesivos de la planilla; sin recomendar marcas de terceros; si no hay: ESCALA. `[P][F]` |
| 27 | c0043#2 | "Conocés a alguien que coloque pórfido?" | ESCALA "pide contacto de colocador". NO pasa contactos. `[F]` |
| 28 | c0235#1 | "Tenés baldosas de cemento con dibujo como esta foto?" | ESCALA "pide baldosa de cemento con dibujo, mandó foto". `[F]` |
| 29 | c0029#1 | "Le puedo poner blem a la piedra?" (audio + foto) | Si hay transcripción clara: ESCALA "consulta técnica de tratamiento". Si no hay transcripción: RESPONDE "No llego a escucharlo, me lo escribís?" y no cotiza. |
| 30 | c0180#1 | "Para la municipalidad necesitamos piedritas blancas con envío, mandame cotización" | ESCALA "pedido de una municipalidad". |

## E. Quién escribe y cómo termina

| # | Origen | Escribe el cliente | Esperado |
|---|---|---|---|
| 31 | c0002#1 | "Buen día, represento una cantera de San Juan. Te paso lista de lajas." | ESCALA "proveedor ofrece lajas de San Juan". Al contacto no le llega nada. |
| 32 | c0004#3 | "No me llegó el pago que te hice" (a un número equivocado, pregunta por otra persona) | MUDO. |
| 33 | c0004#1 | (solo una foto, sin texto) | MUDO o ESCALA según la regla del sistema; NO cotiza. `[H]` |
| 34 | c0049#1 | "Gracias, lo pienso y te aviso" | RESPONDE "Dale, no hay problema. Cualquier consulta avisanos." NO insiste ni ofrece descuento. |
| 35 | (heredado) | Una persona del local ya contestó en el chat hace 2 min; el cliente dice "ok gracias" | MUDO. `[H]` |
| 36 | (heredado) | Cliente manda 5 mensajes seguidos en 20 segundos preguntando cosas distintas | RESPONDE una sola vez, hasta 4 mensajes de 300 caracteres como máximo; lo que no puede contestar va a ESCALA. `[H]` |
| 37 | (heredado) | Número de la lista de ignorados escribe una consulta | MUDO; no escala. `[F]` |

## Cobertura contra el historial

- Los 37 casos cubren: variedades y precio (A), pago y factura (B), envío y seguimiento (C), productos fuera de catálogo (D) y contactos que no son clientes (E).
- No se cubre todavía: mezcla de varios productos en un pedido, compras recurrentes de constructores, cheques y e-cheq, y reclamos por calidad de la piedra. Se agregan cuando Fran conteste.
- Ningún caso asume un valor del local (horario, zona, alias, cuotas): en cada uno se indica `[F]` y el bot escala hasta tenerlo.
