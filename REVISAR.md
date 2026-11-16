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
