# Para revisar

## Corrida 2026-11-09c: Erasmo en modo tester

Lo que hay que mirar antes de prender (cómo prenderlo: `PRENDER-TESTER.md`). Hay plata en juego: precios, IVA y tramos de granza.

### Cómo se hace la cuenta (en `src/cotizador-piedra.js`, un solo lugar)

1. precio de la columna × cantidad (en centavos, sin decimales de computadora);
2. si pide factura: **+21 %** sobre la columna que sea (efectivo **o tarjeta**: cambió el 09/11, antes solo efectivo);
3. **para abajo a la centena de pesos**, en cada total que se muestra (10.550 → 10.500).

Efectivo / transferencia / Mercado Pago / QR = `productos.precio` del panel. Tarjeta = `productos.precio_lista`, **un solo pago**. Cuotas, cheque, pago mixto y dólares escalan. Sin factura si el cliente no dice nada. Desperdicio 0 salvo que el cliente lo pida. Más de 100 m² escala. Si falta el precio de una columna que se iba a mostrar, escala (no se completa nunca).

### Cuentas de ejemplo (las puede verificar con calculadora)

**Adoquines ojito, 10 m².** El precio real lo trae el panel (Supabase) y no está en ningún archivo del repo del panel (`negocios/somos-piedra.json` no lo trae: lo busqué), así que acá va con un precio de EJEMPLO ($78.000 efectivo y $90.000 tarjeta por m²) para chequear la cuenta. Con el precio real, la cuenta es la misma: precio × 10, + 21 % si hay factura, para abajo a la centena.

| | Efectivo / transferencia | Tarjeta (1 pago) |
|---|---|---|
| Sin factura | $780.000 | $900.000 |
| Con factura (+21 %) | $943.800 | $1.089.000 |

**El redondeo**, con otro precio de ejemplo ($12.345 el m², 10 m², efectivo): sin factura 123.450 → **$123.400**; con factura 123.450 × 1,21 = 149.374,50 → **$149.300**. (El redondeo sale de la cuenta exacta: no se redondea dos veces.)

**Granza** (precios del 06/11, por bolsa; 1 bolsa = 1 m² a 3 cm; la tabla está en `src/granza.js`):

| m² | Bolsas | Tramo | Efectivo sin factura | Tarjeta sin factura | Efectivo con factura | Tarjeta con factura |
|---|---|---|---|---|---|---|
| 5 | 5 | 1 a 9 ($22.000 / $26.500) | $110.000 | $132.500 | $133.100 | $160.300 |
| 12 | 12 | 10 a 19 ($20.000 / $25.000) | $240.000 | $300.000 | $290.400 | $363.000 |
| 25 | 25 | desde 20 ($15.500 / $19.000) | $387.500 | $475.000 | $468.800 | $574.700 |

Con factura: 133.100 = 110.000 × 1,21; 163.350 → 163.300; 290.400 = 240.000 × 1,21; 363.000 = 300.000 × 1,21; 453.750 → 453.700; 574.750 → 574.700. Otro ejemplo: 3,5 × 3,5 = 12,25 m² → 13 bolsas → 13 × $20.000 = $260.000 en efectivo sin factura.

### Supuestos y cosas para decidir

- **Granza, precios del 11/11/2026 (Tomás):** 20 m² en efectivo $310.000 (la bolsa del tramo desde 20 pasó de $15.000 a $15.500) y 1 m² con tarjeta $26.500 (la bolsa del tramo de 1 a 9 pasó de $27.000 a $26.500), como la planilla del local. Las dos filas de arriba ya están con esos precios; lo demás no cambió. Sigue siendo supuesto que $15.500 vale por bolsa para más de 20 (25 m² = $387.500).
- **Tramos de granza (supuesto a confirmar con Fran).** 1 a 9 bolsas, 10 a 19 y desde 20 (la estructura de la ronda 2). **Con estas bandas 19 bolsas salen más caras que 20**: en efectivo 19 × $20.000 = $380.000 contra 20 × $15.000 = $300.000; en tarjeta 19 × $25.000 = $475.000 contra 20 × $19.000 = $380.000. En los otros límites: 9 bolsas = $198.000 y 10 bolsas = $200.000 en efectivo (test: `test/granza.test.js`). El código cobra el precio de la banda y no lo arregla. Si Fran confirma otros tramos, se cambia la tabla de `src/granza.js` (y su test).
- **Granza en el panel.** Si alguna vez la cargan en el panel, el bot la ignora (manda la tabla del código). Hoy no está.
- **Precios del panel viejos.** Si Supabase falla, Erasmo usa la última copia buena (en memoria y en `data/precios/panel-cache.json`), **sin tope de antigüedad**: si estuviera caído una semana, cotizaría con los precios de hace una semana. Si nunca cargó, escala todo lo que tenga precio. Hay un respiro de 60 s después de un fallo para no esperar a Supabase en cada consulta. ¿Ponemos un tope (por ejemplo 48 h)?
- **`costo` del panel.** El rol `bot` puede leer la fila de `productos`, que trae el costo (lo avisa la migración 0073). Erasmo pide **solo las columnas que usa** (id, planta, presentación, unidad, cobertura, moneda, precio, precio_lista, activo); nunca `costo`.
- **Cajas y mallas.** El panel tiene `caja` y `malla` (con cobertura en m²). Se cotizan como unidades enteras: m² pedidos ÷ cobertura, para arriba (3 m² de una caja de 0,5 m² = 6 cajas). Antes el catálogo no las conocía.
- **El precio de UNA unidad también se redondea a la centena.** Con $12.345 el m² se muestra $12.300, pero 10 m² dan $123.400 y no $123.000: el cliente no puede rehacer la cuenta con el precio unitario. Por eso las reglas dicen que se da el total y el precio del m² solo si el cliente lo pide. ¿Querés que el precio unitario salga sin redondear, o que no se muestre nunca?
- **Productos en dólares** del panel: no entran (Erasmo no cotiza dólares).
- **Total menor a $100:** un producto cuyo total da menos de una centena queda en FALTA DATO (escala), para que el redondeo no dé cero.
- **El cliente pregunta por zonas de envío.** Las reglas ya dicen que cualquier pedido de envío o consulta de zona **escala** (sin confirmar la zona), aunque la ronda 2 de Fran trae una lista. Es lo más conservador: si querés que Erasmo confirme las zonas de esa lista, se cambia una línea de `src/cerebro-reglas.md`.
- **Reglas del cerebro** (`src/cerebro-reglas.md`): son las aprobadas el 06/11, **sin ningún monto escrito** (los montos y los tramos los pone el código), sin simulador, sin fotos, sin presupuesto en PDF, sin dólares, sin costo de envío; sin las marcas [FRAN]/[TOMÁS]. Lo que todavía no existe escala. Se sumó: el catálogo siempre que el cliente quiere ver o está eligiendo, y la tarjeta es un solo pago.
- **El catálogo en PDF** se copió a `documentos/Catalogo-Somos-Piedra-2026_3.pdf`. `documentos/` está en `.gitignore`: **no va al repositorio**; si cambia de PC, hay que copiarlo a mano.

### Avisos al grupo, seguimiento y catálogo

- Los avisos al grupo salen de 9 a 20 (hora de Argentina). Lo que se genera afuera queda en `estado.json` y sale junto, en un solo mensaje, cuando abre. **Salen enseguida** (sin esperar a las 9): las respuestas a un comando que alguien acaba de escribir (`#excluir`, `#pausa`, `#vendido`, `#sonnet`…), el guardián de Evolution y el aviso del estado dañado. Erasmo contesta a los clientes las 24 horas.
- Seguimiento: Erasmo anota "volver a contactar el día X" (solo si el cliente dio una fecha o un plazo). Ese día, a las 9, sale **un** aviso al grupo (quién, qué pidió, por qué volver). Si el turno termina en escalar, o una persona toma el chat y se corta la respuesta, **no se anota**. No usa `recordatorios.js` (es de una persona, uno por chat y suena cada hora hasta `#hecho`): se pisarían.
- Catálogo: una vez por chat cada 24 h salvo que lo pida de nuevo; sale **después** de los textos y por el mismo camino (ritmo, control, candados). En borrador, al cliente nada y el borrador al grupo dice "[+ catálogo en PDF]".
- Modo `tester`: ya no hay sombra. Con `CEREBRO_MODO=tester`, todo número que no es `NUMEROS_TESTER` es "nadie": cero llamadas a la API, aunque el chat quedara marcado `atiendeSonnet` de otra época. (`sombra` y `nuevos` siguen igual.)

### Decisiones que tomé solo

- **Commits en la rama `piedra/archivos-excluidos`, no en `main`**: `main` no tiene ningún commit que la rama no tenga (la rama está 13 commits adelante), y llevar el trabajo a `main` hubiera sido un merge, que no estaba autorizado. Cuando quieras, `main` avanza solo (fast-forward). No hice push.
- **Las zonas de envío escalan** (aunque la ronda 2 trae una lista): es lo más conservador y el costo del envío escala igual.
- **Saqué «ni de iPhone» de las reglas del cerebro** (decía «No hablás de otros negocios (vivero, Cinco Saltos) ni de iPhone»): quedó «ni de nada que no sea Somos Piedra». Erasmo no sabe qué es iPhone y el test de que las reglas no traigan nada de iPhone lo exigía.
- **Caja y malla** como unidades enteras con cobertura (el panel las tiene y el cotizador no las conocía).
- **Un total de menos de $100 es FALTA DATO** (para que el redondeo no dé cero).
- **Respiro de 60 s** de los precios después de un fallo de Supabase (sirve la última copia sin volver a esperar).
- **Avisos que salen enseguida** (sin esperar a las 9): respuestas a comandos del grupo, el guardián de Evolution y el estado dañado. Todo lo demás (escalamientos, borradores, errores, recordatorios, resumen de gasto) se junta afuera de 9 a 20.
- **El seguimiento no usa `recordatorios.js`** (uno por chat, de una persona, suena cada hora hasta `#hecho`): se pisarían. Va aparte (`src/seguimiento.js`).
- **Un «true» escrito como texto cuenta como factura** (las herramientas no son `strict`; perder el IVA sería cobrar de menos).
- **La granza del panel se ignora** (manda la tabla del código).
- **`documentos/` no se versiona** (`.gitignore`): el PDF del catálogo se copió a `documentos/` pero no entra a un commit.
- **La sombra con persona** (`CEREBRO_SOMBRA_PERSONA_HASTA`) no corre con `CEREBRO_MODO=tester` (llamaría a la API por chats reales).
- **El endpoint de grupos** (`/group/fetchAllGroups/<instancia>?getParticipants=false`) se confirmó en un espejo del código de Evolution, no en la documentación oficial ni contra tu Evolution. `getParticipants` es obligatorio y va como texto.
- **Tests que dependían de la hora**: `generados.test.js` llamaba al `avisarGrupo` real y fallaba de noche (con la franja de 9 a 20); le fijé la franja de 0 a 24. La suite entera pasa también con la franja cerrada (se corrió así).
- `test/chats-viejos.test.js` falló una vez por tiempos con la PC cargada ("no reintentó") y pasa solo; no lo toqué.

### Tests

- `npm test` y `npm run evaluar -- --offline`: ver el resumen de la sesión.
- Casos de `evaluar` que cambiaron (ahora 18, todos al 100 %): «pregunta un precio: escala» pasó a «sin producto ni m²: pregunta qué producto y cuántos m²» (con las reglas aprobadas ya no se escala un precio, se cotiza o se pregunta); «un monto frenado y corregido» ya no usa «en un momento te paso la info» (promete mandar algo después). Se suman: cotiza granza 12 m², cotiza con factura (granza 5 m²), monto equivocado tras cotizar, producto que no está, pide envío (el viejo caso de escalar, con el dato), catálogo, catálogo prometido sin herramienta y seguimiento. La regla global «ningún monto» pasó a «ningún monto que no haya devuelto una herramienta en esa tanda».
- `test/piedra-sonnet.test.js`: ahora verifica las 6 herramientas (antes 2) y que las reglas no traigan palabras de iPhone (la palabra «cuota» salió de la lista: es de Piedra).
- `test/catalogo-piedra.test.js`: `caja` pasó de «desconocida» a unidad conocida (con `pallet` como ejemplo de desconocida).

## 16/11/2026 (chat): ajustes tras la revisión de la sombra

- El pedido a Sonnet dice de qué anuncio vino el chat (título; el último si llegó desde otro). Erasmo no lo nombra ni da por hecho el producto.
- Reglas (`src/cerebro-reglas.md`, "Cómo se cotiza"): "cuadrados" = m² y el número tal cual (sombra: "4 negros cuadrados" → cotizó 40 m², $620.000); "la bolsa" = cotizar 1 bolsa (sombra: dio el precio de 20+).
- **Sin cambiar** (decide Fran/Tomás): "precio sin producto no recibe precio". Fran pasa la granza de entrada ($22.000 la bolsa) y eso explica 88 de las diferencias.
- `test/evaluar.js`: el caso "con factura" seguía con la granza vieja ($163.300); con $26.500 × 5 = $132.500 + 21 % = $160.325 → $160.300. Vuelve a dar 18/18.
- `test/persistencia.test.js` falla también sin estos cambios (en la VM de Linux del chat); no se tocó.

## 16/11/2026 (chat, tarde): respuestas de Fran

- Granza: 3 colores (gris Tandil, roja, blanca Mar del Plata); "gris con roja" no existe (`src/granza.js`). Si no sabe si hay stock de un color, escala.
- Reglas: precio sin producto → sacar charla (si vino del anuncio de granza, preguntar los m²); bolsón → desviar a m²; "gracias" → "No hay por qué! Cualquier cosita quedamos atentos" + invitación a pasar un presupuesto mejor ("si es mejor que el nuestro, con gusto lo mejoramos"). Erasmo no baja nada: si lo mandan, escala.
- Pendiente de Tomás (plata / reglas heredadas): Verde Bronce $35.000 en efectivo en el panel; envío (Neuquén $30.000, alrededores $40.000, carga por viaje); mensaje al escalar ("enseguida te respondemos"); tramos de granza (15–20+ a $16.000 / $15.500).
- **Granza, tramos nuevos (Tomás, 16/11):** efectivo 1-9 $22.000 · 10-14 $20.000 · 15-19 $16.000 · 20+ $15.500 por bolsa. Cuentas: 14 bolsas $280.000 · 15 bolsas $240.000 (14 sale más caro que 15) · 16 bolsas $256.000 · 19 bolsas $304.000 · 20 bolsas $310.000. **Tarjeta de 15 a 19: FALTA DATO** (no lo pasó Fran): sin forma de pago sale solo el efectivo; con tarjeta escala.

## 16/11/2026 (Claude Code): al escalar, el cliente recibe "Enseguida te respondemos."

Decisión de Tomás y Fran (16/11): cuando Erasmo le pasa un chat al equipo, el cliente recibe UNA vez ese texto exacto, a cualquier hora. Lo manda el código (`src/index.js`, `escalarEnSilencio` → `avisarAlClienteDelEscalado`), no Sonnet. La guardia no se tocó.

- **Cuentas y plata: ninguna.** No cambió ningún precio, tramo ni redondeo.
- **Cuándo sale:** solo con un escalado que calla el chat (Sonnet llamó `escalar`, la guardia frenó dos veces, todo repetido, pedido del catálogo sin texto), si el aviso al grupo salió (de noche queda en la cola de las 9 y el mensaje al cliente sale igual) y cuando el chat pasa de no escalado a escalado. **No sale** si Sonnet falló o un audio no se entendió.
- **Candados:** escucha, nada; borrador o fuera de las listas, al cliente nada y el texto va en el mismo 🔕 marcado BORRADOR; `#apagar`, excluido, `#pausa` o una persona que escribió mientras Sonnet pensaba, tampoco.

Para decidir (lo resolví por el camino más conservador; ver "Pendientes de decisión" en `CLAUDE.md`):

1. **El 🔕 del grupo sigue diciendo "Al cliente no le contesté nada: escribile vos."** aunque al cliente ya le llegó el "Enseguida te respondemos.". No lo cambié: la tarea no lo pedía y muchos tests miran ese texto. Recomendación: "Al cliente solo le dije «Enseguida te respondemos.»: escribile vos." cuando salió.
2. **El mensaje no entra al historial del chat** (como el "🔄 Reiniciado"): Sonnet no lo ve en lo que lee después, y `#sigue` sigue contestando lo que dejó escrito el cliente (si entrara, lo último del chat sería del bot y `#sigue` diría "no dejó nada sin contestar"). Queda en el registro (`entrega`, origen `escalado`) y `npm run pruebas` lo muestra.
3. **No cuenta como "el bot le mandó algo" para `#vendido` / `#perdido`** (`botEnvio`): un chat que solo escaló sigue figurando como que el bot no le mandó nada. Es la estadística de si el bot ayuda a vender: si tiene que contar, se cambia en una línea.
4. **Si una persona de la cuenta escribió (o pusieron `#pausa`) mientras Sonnet pensaba, el mensaje no sale** (ya hay alguien en el chat), y tampoco si un `#sigue` reactivó el chat en los ~2 segundos entre que escaló y el envío (lo encontraron las dos revisiones, Codex y el advisor: salía "Enseguida te respondemos." con el chat ya reactivado y sin nadie a cargo). La tarea no los nombraba entre los candados; los sumé por ser el control de siempre antes de cada envío.
5. **Después de un `#sigue`, un escalado nuevo (con otro motivo) vuelve a mandar el mensaje**: el chat pasó otra vez de no escalado a escalado. Con el mismo motivo dentro de los 45 minutos no sale nada (ni al grupo).
6. **La guardia hoy no frena esa frase si la escribiera Sonnet** (`revisarSalida(['Enseguida te respondemos.'])` pasa). No toqué la guardia, como pedía la tarea; por eso `src/cerebro-reglas.md` dice que al cliente le llega "un aviso fijo de que le van a responder" sin citar la frase, para no dársela servida. Si se quiere que la guardia la frene, es un cambio aparte en `src/promesas.js`.
7. **`reglas/cerebro-reglas-piedra.md`** (las reglas aprobadas el 06/11) sigue diciendo "al cliente no le llega nada" y "se escala en silencio": no lo toqué porque es el documento aprobado. Hay que alinearlo.
8. Cambié además, fuera de la lista de la tarea y por coherencia: `herramientas/pruebas/armar.js` + `test/pruebas.test.js` (el informe decía "al cliente no le llegó nada" aunque abajo figurara lo que salió), `PRENDER-TESTER.md` (qué espera ver el tester con "Hacen envíos a Plottier?"), un comentario de `src/cerebro.js` y `src/aprendizaje.js`, y `AGENTS.md` (sin versionar; la misma regla que `CLAUDE.md`).

9. **Borde conocido (ya existía para cualquier envío del bot):** si Evolution da error o se cuelga DESPUÉS de haber entregado el mensaje, su eco no se reconoce como del bot y cuenta como una persona de la cuenta: el escalado queda "tomado" (sin ⏰) y el bot calla 45 minutos en ese chat. No lo cambié: reconocer el eco por el texto haría que una persona que escriba esa misma frase a mano no cuente como persona.

Tests: los que decían "al cliente nada" al escalar ahora esperan ese único mensaje (`piedra-sonnet`, `piedra-control`, `piedra-tandas`, `erasmo-tester`, `evaluar`); casos nuevos para cada candado en `piedra-control` (verificados con mutaciones: sacando el candado, el test falla), `excluidos` (freno c2), `erasmo-tester` (de noche) y `pruebas`.

## Corrida 2026-11-17a: Erasmo con las respuestas de Fran y Tomás del 16-17/11

Cerrado por Fran y Tomás (no se vuelve a decidir). Qué cambió: `src/granza.js`, `src/herramientas-erasmo.js` (`cotizar` y `buscar_productos`), `src/ficha.js`, `src/cerebro.js` (el pedido a Sonnet), `src/stock-colores.js` (nuevo: `#sinstock` / `#hay`), `src/cerebro-reglas.md` (v3) y los tests. **Cuentas y plata: revisar las tablas de abajo.**

**Granza: precio por bolsa y totales (el cotizador no cambió: precio × bolsas → IVA 21 % si pide factura → para abajo a la centena)**

| Tramo | Efectivo o transferencia | Tarjeta (un pago) |
|---|---|---|
| 1 a 9 bolsas | $22.000 | $26.500 |
| 10 a 14 | $20.000 | $25.000 |
| 15 a 19 | $16.000 | **$19.000** (era FALTA DATO) |
| 20 o más | $15.500 | $19.000 |

| Cantidad | Efectivo | Tarjeta | Efectivo con factura | Tarjeta con factura |
|---|---|---|---|---|
| 1 bolsa | $22.000 | $26.500 | $26.600 | $32.000 |
| 9 bolsas | $198.000 | $238.500 | $239.500 | $288.500 |
| 10 bolsas | $200.000 | $250.000 | $242.000 | $302.500 |
| 12 bolsas | $240.000 | $300.000 | $290.400 | $363.000 |
| 14 bolsas | $280.000 | $350.000 | $338.800 | $423.500 |
| 15 bolsas | $240.000 | $285.000 | $290.400 | $344.800 |
| 16 bolsas | $256.000 | $304.000 | $309.700 | $367.800 |
| 19 bolsas | $304.000 | $361.000 | $367.800 | $436.800 |
| 20 bolsas | $310.000 | $380.000 | $375.100 | $459.800 |
| 25 bolsas | $387.500 | $475.000 | $468.800 | $574.700 |

- **14 bolsas salen más caras que 15** (efectivo $280.000 contra $240.000; tarjeta $350.000 contra $285.000). Es la tabla que pasaron: el código cobra el precio del tramo y no lo corrige. (Es la única inversión: 19 bolsas salen más baratas que 20, también con tarjeta.)
- **Bolsón** (1 bolsón = 1 m³ = 20 bolsas de 40 kg, se cobra el tramo 20+): 1 bolsón $310.000 efectivo / $380.000 tarjeta; 2 bolsones $620.000 / $760.000; 3 bolsones $930.000 / $1.140.000; 5 bolsones $1.550.000 / $1.900.000. 5 bolsones son 100 bolsas = justo el tope de obra grande; **6 bolsones o más escalan** (más de 100 m²). Medio bolsón o fracciones: escala.
- **Cuotas**: "compra grande" = lo último cotizado pasa de **$1.000.000** (mayor; exactamente $1.000.000 no). La cuenta la hace el código (`ficha.pasaElUmbralDePagarEnPartes`): se compara el total más alto que salió en esa cotización (efectivo, o tarjeta si fue lo que pidió, y con factura si la pidió).
- **Envíos** (solo para el motivo del grupo, nunca se lo dice al cliente): Neuquén capital $35.000, cualquier otro lugar $45.000, por pedido. Antes del 17/11 la nota de Fran decía $30.000 / $40.000: manda la de hoy.

**Decisiones que tomé solo (revisar)**

1. **Sin forma de pago, `cotizar` devuelve SOLO el total en efectivo o transferencia; la tarjeta solo si el cliente la pregunta.** Es la lectura de "se pasa solo el precio de efectivo/transferencia" y "pasa el precio con tarjeta si lo piden". Antes salían los dos totales. Si se quiere volver a los dos, es una línea en `herramientas-erasmo.js` (`const columnas = …`) y el formato de las reglas.
2. **"Responder y escalar" en el mismo turno no existe** (Sonnet termina con una u otra; al escalar al cliente solo le llega "Enseguida te respondemos."). Por eso, para dos cosas de la nota de Fran, Erasmo **solo escala** y no dice la frase: **cuotas en compra de más de $1.000.000** ("Cuotas no tenemos, pero en compras grandes se puede ver pagar en partes") y **dólares** ("dice que sí y escala para el número"). Si se quiere que las diga antes de pasar el chat, hay que cambiar el diseño de `escalar` (decisión de Tomás; ver "Pendientes de decisión" en `CLAUDE.md`).
3. **Mercado Pago y QR salieron de las formas de pago de `cotizar`** (antes `mercado_pago` y `qr` cotizaban como efectivo): si Sonnet las pidiera, `cotizar` devuelve error. A un cliente que pregunta por otro medio, las reglas le dicen "por ahora es efectivo o transferencia" (no escala solo por eso). El mapa interno del cotizador (`cotizador-piedra.js`) no se tocó (sigue entendiendo esos medios); solo se cambió su comentario.
4. **Un producto del panel sin precio de tarjeta** ya se cotiza en efectivo (antes, sin forma de pago, daba FALTA DATO para todo el pedido); con tarjeta sigue dando FALTA DATO y escala.
5. **Pago mixto**: se cotiza con efectivo y puede decirse que se acepta (la forma `mixto` da error con la indicación de cotizar con efectivo).
6. **Color sin stock**: solo vale para la granza (los 3 colores). `#sinstock` / `#hay` aceptan varios colores ("roja y blanca", "gris tandil", "blanca mdp"…); lo que no entienden no cambia nada y contesta ❓. El estado vive en `estado.json` (clave interna), vale para todos los chats y arranca todo en stock. `buscar_productos` marca el color con `hay_stock: false` (no lo saca, para que Sonnet no diga "no lo trabajamos") y `cotizar` de ese color da error. **Lo que no se puede forzar por código**: que Sonnet no lo mencione; eso lo dicen el pedido ("hoy NO hay stock de…") y las reglas.
7. **Envíos**: Sonnet elige "capital" u "otro lugar" por la localidad; el motivo con los montos no pasa por la guardia (solo se revisa lo que sale al cliente), y si Sonnet los escribiera al cliente la guardia lo frena. Siguen escalando siempre.
8. Las reglas ya no dicen "no se vende por bolsón"; el ejemplo de la objeción de precio ahora dice "un bolsón son 20 bolsas de 40 kg".

**Tests**: `granza` (tabla y bolsón), `erasmo-herramientas` (medios de pago, sin IVA ofrecido, bolsón, sin stock, compra grande), `stock-colores` (nuevo), `erasmo-fran-1117` (nuevo: el pedido con stock y cuotas) y 10 casos nuevos en `evaluar` (con Sonnet enlatado: prueban el circuito y las cuentas, **no el criterio de Sonnet**; eso se ve con el tester). Verificado con mutaciones: sacar el freno de color sin stock, o cambiar `>` por `>=` en el millón, hace fallar los tests.

## Corrida 2026-11-18a: tandas para los chats sin contestar + reactivación de 2 mensajes

Qué cambió: `src/tandas.js`, `src/reactivacion.js`, `src/reactivacion-textos.js`, `src/chats-elegibles.js`, `src/lectura-larga.js` (nuevos); `src/cerebro.js` (`pensar` con `tanda`, `armarContextoDeTanda`, `decidirReactivacion`, herramienta `no_contestar`), `src/index.js` (comandos del grupo, candados comunes, barrido), `src/state.js`, `src/config.js`, `src/contexto.js` (`nuevasLineas` con `sinLimite`). Todo arranca **apagado**: nada manda sin `#tanda-ok` o sin `ERASMO_REACTIVACION_ACTIVA=true`. Cómo funciona, en `CLAUDE.md` ("Tandas de chats sin contestar y reactivación").

### Lo que hay que mirar

1. **Cómo se eligen los 40** (`tandas.seleccionar`): chats con estado donde la última línea del historial es del cliente (nadie escribió después), del más reciente al más viejo, menos los que ya estuvieron en una tanda mandada y los que `chats-elegibles.motivoQueNoCuenta` descarta (excluidos, personales, `@lid`/grupos, testers, pausados, escalados callados, `#vendido`/`#perdido`, `#bot`). Si Evolution muestra que ya contestó alguien (el estado no se enteró), ese chat ocupa lugar en la tanda pero va como `no_contestar` sin gastar a Sonnet.
2. **El pedido a Sonnet de la tanda** (`cerebro.armarContextoDeTanda`): las reglas de siempre (mismo hash) en `system`; las instrucciones de la tarea van en el mensaje (responder / no_contestar mirando los últimos 20 mensajes / escalar; disculpas por la demora si pasaron más de 24 h; "no es una charla en vivo"). Lee hasta 150 mensajes (Evolution + estado) y de eso hasta 24.000 caracteres: **si no entran, se quedan afuera los más viejos** y el pedido lo dice ("otros N mensajes más viejos no entran"); las 20 últimas entran siempre. No hay una segunda llamada que resuma (decisión mía, ver abajo).
3. **El pedido de la reactivación** (`cerebro.decidirReactivacion`): una llamada corta, con su propia instrucción (no las reglas de venta), los últimos 20 mensajes y una sola herramienta `decidir { mandar, motivo }`. Ante la duda, `false`. Sonnet no escribe el mensaje.
4. **Candados al mandar** (index.js): por chat y otra vez justo antes de CADA mensaje: interruptor, escucha, borrador, `CEREBRO_MODO` ∈ {nuevos, todos}, excluido, `motivoQueNoCuenta`, una persona de la cuenta en los últimos 45 min, `leLlegaAlCliente`, tanda en curso del chat, que el cliente no haya escrito, y que **el último mensaje del chat en Evolution sea el mismo que se leyó** (si no se puede verificar, no se le escribe).

### Lo que tiene que correr Tomás (yo no hice push, ni reinicio, ni toqué el `.env`)

1. `git push` de la rama `piedra/archivos-excluidos` (y el merge a `main` si corresponde) y reiniciar el bot para que cargue el código nuevo.
2. **Revisar `SOLO_CHATS_NUEVOS` en el `.env`**: si está en `true`, `leLlegaAlCliente` da false para todo chat viejo y ni la tanda ni la reactivación les escriben (el resumen de `#tanda` y `#reactivar-prueba` lo avisan: "no le llegaría"). Para que salgan, vacío o `false`. Los 337 chats son todos viejos.
3. Probar en este orden, en el grupo "Bot Erasmo": `#reactivar` (dice APAGADA), `#reactivar-prueba` (arma `data/reactivacion/<fecha>.md`, no manda), `#tanda` (arma `data/tandas/<id>.md`, no manda). Leer el `.md`. Recién ahí `#tanda-ok <id>` (o `#tanda-ok <id> -4 -17` sin algunos).
4. Para prender la reactivación: `ERASMO_REACTIVACION_ACTIVA=true` en el `.env` y reiniciar. Las otras cuatro variables, vacías, valen 40 / 2 / 7 / 30.
5. Lo que tiene que pasar: `#tanda` responde en el grupo enseguida ("Armo la tanda N…") y tarda unos minutos en dar el resumen; `#tanda-ok` responde "Mando la tanda N…" y al terminar dice cuántos salieron y cuáles no (con el link del chat y el motivo). Ningún cliente recibe nada antes del `#tanda-ok`.

### Decisiones que tomé solo (revisar)

1. **Costo**: cada chat de la tanda es una llamada con hasta ~24.000 caracteres de conversación y las herramientas; con los precios de `config` (US$2 entrada / US$10 salida por millón) calculo **US$1 a 3 por tanda de 40**, o sea **US$10 a 30 por los 337 chats**, contra el tope de US$60 del mes (cuenta en el gasto del mes y avisa al 80%). Es una estimación, no la medí. La reactivación gasta mucho menos (una consulta corta por mensaje). `#tanda` con `CEREBRO_MODO=apagado` no gasta nada.
2. **Sin segunda llamada que resuma** un chat largo (el prompt decía "lo resume si hace falta"): se recorta por caracteres, quedando siempre las 20 últimas, y se avisa cuántos no entran. Resumir con otra llamada sumaba costo y un punto más donde inventar datos.
3. **Lo que no se pudo leer queda "salteado"** (una acción más, además de las tres del prompt): si Evolution falla al releer un chat o Sonnet da error, ese chat no se escala (escalar le manda al cliente "Enseguida te respondemos." por una falla nuestra) ni se marca: puede volver a entrar en otra tanda.
4. **Qué marca a un chat como "ya estuvo en una tanda"**: solo una tanda **mandada** (respondidos, escalados, `no_contestar` y los sacados a mano con -N). Una tanda descartada (`#tanda-no`) o vencida no marca a nadie, y un chat salteado al mandar (escribió el cliente, etc.) tampoco: vuelve a entrar.
5. **`#bot` (`atiendeSonnet: false`) excluye al chat** de las dos cosas (el prompt no lo listaba): mandar y dejar `atiendeSonnet: true` deshacía una decisión explícita de la cuenta.
6. **`#tanda-ok` no manda con `CEREBRO_MODO` `tester` o `sombra`**, ni con borrador o escucha (el prompt solo pedía `leLlegaAlCliente`): en esos modos nadie le escribe a un cliente viejo. Armar la propuesta sí se puede con cualquiera menos `apagado`. La reactivación tiene el mismo freno.
7. **Reactivación: a lo sumo 4 mensajes por barrido** (cada 15 min), para que los 40 del día no salgan juntos a las 10; y un seguimiento agendado (`s.seguimiento` futuro, o vencido sin avisar) saca al chat de la reactivación (no se le escribe a quien dijo "en marzo"). La ventana de 30 días de actividad del cliente se aplica también al mensaje 2. Después del mensaje 1, "sin respuesta" se cuenta desde lo último que escribió la cuenta.
8. **`#reactivar-prueba`** mira los primeros `TOPE_DIA` candidatos (lo que saldría hoy) y cuenta el resto; no marca nada, ni siquiera los descartes de Sonnet.
9. **Una tanda armándose o mandándose cuando el bot se reinicia** queda `interrumpida` (no sigue sola); lo que ya salió quedó marcado en el `.json`. Las propuestas no se borran de `data/tandas/`.
10. **Los textos de la reactivación** están tal cual vinieron en el prompt (pendientes del OK de Tomás). `{producto}` es `ficha.pidio.producto`, el nombre del panel ("Laja Ocre 1 m²" suena raro en "por {producto} que estabas viendo"); si trae símbolos o algo que parezca un monto, cae a "la piedra". El código los manda sin pasar por la guardia de Sonnet, que frenaría "Te escribo de Somos Piedra" (promesa de contacto): el test lo deja dicho.

### Riesgos que quedan

- **Los precios de la propuesta valen hasta 6 h**: lo que Sonnet cotizó al armar la tanda es lo que sale al mandarla; si el panel cambia en ese rato, sale el viejo. Por eso vence a las 6 h.
- **Un chat con el estado atrasado** (una persona contestó desde el celular con el bot caído) se detecta por Evolution al armar y al mandar; si Evolution falla, el chat se saltea. En la reactivación, un chat cuyo estado no coincide con Evolution se salta en cada barrido sin descartarse; con más de 12 chats así seguidos al tope de la lista (se evalúan 12 por barrido) podrían demorar a los demás.
- **Dos mutaciones equivalentes** (candados repetidos a propósito, así que romper uno solo no cambia el resultado): `#apagar` se mira dos veces en la reactivación (`revisar` y `frenoGeneralDeEnvio`), y los candados de `revisar` justo antes de mandar se repiten en `mandarReactivacion`. Las demás hacen fallar su test.

### Tests

`test/tandas.test.js` (38 casos) y `test/reactivacion.test.js` (35 casos): selección de los 40 (orden y exclusiones), `no_contestar` / `escalar` / `responder`, nada sin `#tanda-ok`, vencimiento, `-N`, salteo si escribió alguien después de la propuesta (estado y Evolution), `atiendeSonnet` al mandar, el eco del grupo; reactivación: días, ventana, tope por día, franja y domingo, máximo 2 (también tras `#reset`), corte si contesta, descarte de Sonnet, `ACTIVA` vacía o falsa, textos con y sin nombre o producto. Sumados al script `test`.
