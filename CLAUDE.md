> **Cortex del negocio.** Antes de cualquier tarea, leé el Cortex:
> `C:\Users\PC\Documents\cortex-somosiphone\CLAUDE.md` (forma de trabajar, comandos `pendientes` y
> `cierre`, lecciones técnicas del bot). **Las reglas de negocio de iPhone (`negocio/`: financiación,
> cotizador, 18 años, iCloud, TechSur…) NO valen para Piedra.** Las de Piedra están en `reglas/` de este
> repo y en `piedra/` del Cortex. Nunca mezcles datos de un negocio con el otro.

# Bot de WhatsApp — Somos Piedra

Bot de atención por WhatsApp de **Somos Piedra**, un local de Neuquén que vende piedra natural (y sus
insumos). Nació como copia del bot de Somos iPhone (commit e708087); el 19/10/2026 se podó todo lo de
iPhone (rama `piedra/poda-iphone`): quedó la infraestructura y un cerebro Sonnet mínimo que, hasta que
haya reglas aprobadas, **escala todo**. Lo de iPhone está en `_heredado-iphone/` (ver abajo).

- Carpeta: `E:\bot-piedra` (antes `C:\bot-whatsapp\bot-piedra`), con git propio.
- Puerto **3002**. Instancia de Evolution **`somospiedra`**: Evolution (Docker) es **compartido** con
  Somos iPhone (puerto 3001, instancia `somosiphone`, en vivo: no se toca).
- El bot **no arranca** si `EVOLUTION_INSTANCE` está vacía o es `somosiphone` (`config.problemaDeInstancia`,
  test `test/instancia.test.js`): mensaje claro, código 1, sin conectarse a nada.

## Etapas y gates (el gate lo pone Tomás)

0. Preparar la base. Gate: Tomás escanea el QR del WhatsApp de Piedra. (Hecho.)
1. Leer lo que ya existe: exportar el historial de Evolution y clasificarlo en lote (`herramientas/historial/`). (Hecho.)
2. Escribir las reglas de Piedra (`reglas/cerebro-reglas-piedra.md`, cotización). Gate: Tomás las aprueba. (Hecho: aprobadas el 06/11/2026.)
3. Construir la v1: las herramientas `buscar_productos`, `cotizar`, `mandar_catalogo` y `agendar_seguimiento` y el
   **modo tester** (09/11/2026, "Erasmo en modo tester" más abajo). Cómo prenderlo: `PRENDER-TESTER.md`. (Hecho; falta probarlo.)
4. Probar y salir en vivo. Gate: solo con la frase explícita de Tomás ("prendé pilotos" / "prendé para todos"). (Hecho el 18/11/2026 00:35: `CEREBRO_MODO=nuevos` + `NUMEROS_PILOTO=todos`, con el arreglo `d19e0b7`.)
5. Mejorar (opcional).

**Nada se prende, no se manda ningún mensaje y no se sale a ningún cliente sin la frase de Tomás.**

## Reglas heredadas del sistema (valen siempre)

- **Los montos nunca los produce la IA**: salen del panel (Supabase) o de la tabla de la granza y los calcula
  el código (`cotizar`). La guardia frena **cualquier** monto que no haya devuelto `cotizar` en esa misma respuesta.
- **Si no sabe cómo seguir: Erasmo no le contesta al cliente y avisa al grupo interno** (escalar).
- **El bot nunca promete que otra persona va a contactar al cliente** (ni que va a volver a escribir), **salvo un
  único mensaje fijo, que no escribe Sonnet sino el código**: cuando Erasmo le pasa el chat al equipo, el cliente
  recibe UNA vez el texto exacto "Enseguida te respondemos." (decisión de Tomás y Fran, 16/11/2026; ver "Al escalar"
  más abajo). Sonnet sigue sin poder prometer nada: la guardia no cambió.
- **Tope de 4 mensajes por tanda, de 300 caracteres como máximo cada uno** (del 4º en adelante van juntos en el 4º).

## Quién contesta: `CEREBRO_MODO`

No hay "bot de siempre" (el motor de reglas de iPhone, `responder.js`, quedó en `_heredado-iphone/`).

| `CEREBRO_MODO` | Qué pasa |
|---|---|
| `apagado` (default) | Nadie contesta. El bot escucha, guarda el historial y el registro de aprendizaje. Nunca llama a la API. Tampoco escala (ni un audio que no se entendió). |
| `sombra` | Sonnet piensa con cada tanda y queda en el registro (`propuesta-sonnet`). No manda nada. |
| `tester` | Sonnet le contesta **solo** a `NUMEROS_TESTER`; todos los demás: **nadie** (escucha y guarda, cero llamadas a la API; desde el 09/11/2026 ya no hay sombra acá, y ni una marca `atiendeSonnet` vieja lo cambia). |
| `nuevos` | Al tester y a los chats nuevos (quedan marcados `atiendeSonnet` hasta `#reset` o `#bot`). |
| `todos` | Sonnet le contesta a todos. |

Encima van los modos de salida de siempre: `MODO_ESCUCHA` (no sale nada, ni al grupo), `MODO_BORRADOR`
(al cliente nada, el borrador al grupo), las listas `NUMEROS_TESTER` / `NUMEROS_PILOTO` (con alguna
cargada, solo a esos; `NUMEROS_PILOTO=todos`: a todos) y `SOLO_CHATS_NUEVOS`. La única definición de "le
llega al cliente" es `evolution.leLlegaAlCliente`.

**Horario: el bot contesta las 24 horas** (decisión de Tomás, 29/10/2026): no hay franja horaria para los
clientes. `SEGUIMIENTO_HORA_DESDE` / `_HASTA` solo rigen al guardián (cuándo mira que lleguen mensajes) y a los
recordatorios internos del grupo. **Los avisos al grupo "Bot Erasmo" salen de 9 a 20** (`AVISOS_HORA_DESDE` /
`_HASTA`, decisión de Tomás del 09/11/2026): ver `src/avisos-cola.js` más abajo.

**Si Sonnet falla** (error de la API, timeout, sin `ANTHROPIC_API_KEY`) **no hay respaldo**: se escala en
silencio ("Sonnet no pudo contestar (…)" en el 🔕 del grupo), sin callar el chat (el próximo mensaje se
vuelve a intentar) y sin el mensaje fijo al cliente. Lo prueba `test/piedra-sonnet.test.js`.

**Al escalar, el cliente recibe UNA vez "Enseguida te respondemos."** (decisión de Tomás y Fran, 16/11/2026; hasta
ese día no le llegaba nada). Lo manda el código, no Sonnet: `escalarEnSilencio` → `avisarAlClienteDelEscalado` en
`src/index.js` (el texto es `AVISO_ESCALADO`).
- Solo con un escalado que calla el chat (Sonnet llamó `escalar`, la guardia frenó dos veces, todo lo que iba a
  decir ya estaba dicho, un pedido del catálogo sin texto). **No** sale cuando el escalado no calla: Sonnet falló o
  un audio no se entendió.
- Solo si el aviso al grupo salió (de noche queda en la cola de las 9 y vale como salido: al cliente le sale igual,
  a cualquier hora) y solo cuando el chat pasa de no escalado a escalado. Con el chat ya escalado y callado, o con
  el mismo motivo dentro de `SILENCIO_TRAS_HUMANO_MIN`, no sale de nuevo. Después de un `#sigue`, de que lo tome una
  persona o de las 24 h, un escalado nuevo vuelve a avisar.
- Candados: en escucha, nada; en borrador o fuera de las listas (`leLlegaAlCliente`), al cliente nada y el texto va
  en el mismo 🔕 marcado BORRADOR; con `#apagar`, un excluido, `#pausa`, una persona de la cuenta que escribió
  mientras Sonnet pensaba o un `#sigue` que reactivó el chat antes del envío, tampoco (`frenoDelAvisoDeEscalado`: se
  mira antes del "escribiendo…" y otra vez, pasada la espera del ritmo, justo antes de mandar). Un `#reset` en ese
  rato corta la tanda como siempre.
- No se agrega al historial ni a `botEnvio` (como el "🔄 Reiniciado"): lo último del chat sigue siendo lo que dejó
  escrito el cliente (`#sigue` se lo contesta) y un escalado sigue sin contar como "el bot le mandó algo" para
  `#vendido` / `#perdido`. Queda en el registro como una `entrega` de origen `escalado`, con su tanda (`npm run
  pruebas` lo muestra). Su eco no cuenta como una persona de la cuenta: no "toma" el escalado.
- El 🔕 del grupo sigue diciendo "Al cliente no le contesté nada: escribile vos" (ver "Pendientes de decisión").
- Tests: `test/piedra-control.test.js` (el bloque "Enseguida te respondemos."; cada candado verificado con
  mutaciones), `piedra-sonnet`, `piedra-tandas`, `excluidos` (freno c2), `erasmo-tester` (de noche), `pruebas` y
  los casos de `test/evaluar.js`.

## El cerebro (`src/cerebro.js` + `src/cerebro-reglas.md`)

- Sonnet termina siempre con `responder` (1 a 4 mensajes) o `escalar` (motivo para el grupo). Lo que no
  termina así cuenta como escalar.
- `cerebro-reglas.md` son las reglas **aprobadas por Tomás el 06/11/2026** (`reglas/cerebro-reglas-piedra.md`, v2),
  adaptadas a lo que existe hoy, y puestas al día con las respuestas de Fran y Tomás del 16-17/11/2026 (v3, ver el
  recuadro al principio de `reglas/cerebro-reglas-piedra.md` y "Corrida 2026-11-17a" en `REVISAR.md`): ningún monto
  que se le diga al cliente (los pone el código; la única excepción son los $35.000 / $45.000 del envío, que van solo
  para el motivo del grupo), y lo que todavía no hay (simulador, fotos de las piedras, presupuesto en PDF, costo y zonas
  de envío, dólares, cheque, tarjeta confirmada, cuotas en una compra grande) **escala**. Si se cambian las de
  `reglas/`, hay que volver a adaptarlas acá. El hash de las reglas sale en `/salud` y en cada propuesta.
- **La guardia** (`revisarSalida`): 4×300; cualquier monto que no devolvió una herramienta de ESTA
  respuesta frena (los montos van en pesos; un año suelto o la altura de una dirección no son montos); promesas
  (`src/promesas.js`), "te falta", mandar algo después, archivos (**salvo el catálogo en PDF, y solo si
  `mandar_catalogo` salió bien en ese turno**), nombres internos (también los de las herramientas nuevas), marcas
  de IA y caracteres raros. Si frena, Sonnet tiene **una** vuelta para corregir; si vuelve a frenar, escala.
- **Herramientas junto con `responder`** (11/11/2026): las de datos que vienen en la MISMA respuesta que `responder`
  corren antes de mirarla, y lo que dejan (montos, catálogo, seguimiento) vale para esa respuesta. Si una devuelve
  error, no sale nada y Sonnet lo ve (no gasta la corrección de la guardia). Antes solo corrían si la guardia frenaba:
  un `agendar_seguimiento` junto con `responder` se perdía. Test: `test/erasmo-tester.test.js`.
- **Preguntas repetidas** (11/11/2026): `salida.sinLoYaDicho` saca de cada texto la pregunta que la cuenta ya hizo en
  el chat (igual o con otra puntuación; de 12 letras o más, así "Cómo estás?" no cuenta) y sale lo demás. La regla
  de `cerebro-reglas.md` sola no alcanzaba (11/11: la repitió tras «se puede pagar en cuotas?»). El filtro solo ataja
  la repetición textual: en vivo Sonnet la volvió a hacer con otras palabras («Qué estás armando, el patio, el frente o
  una pared?»), así que el pedido (`armarContexto`) lleva además la lista «Preguntas que ya le hiciste en este chat»
  (`salida.preguntasHechas`). Test: `test/piedra-sonnet.test.js`.
- `armarContexto`: fecha de Neuquén, lo que sabe el estado, las líneas de una persona de la cuenta, las
  últimas 30 líneas del historial (completado con Evolution por `src/contexto.js`), la tanda y, en vivo,
  hasta 3 fotos del cliente. Sin el número del cliente; el nombre, tapado.
- `HERRAMIENTAS_DE_DATOS` = `src/herramientas-erasmo.js` (cada una: `definicion` para la API y
  `correr(input, turno)`, que anota en `turno.montos` los montos que la guardia deja escribir, en pesos, y en
  `turno.acciones` lo que hay que hacer cuando salgan los mensajes). `pensar` lleva `chatId` y `enVivo` en el turno
  (solo `contestar` es en vivo) y devuelve `llamadas` (lo que pidió y devolvió cada herramienta, para `npm run pruebas`).
- Gasto del día (memoria) y del mes (`estado.json`), aviso al 80% de `CEREBRO_TOPE_MES_USD`.

## Módulos de Piedra ya hechos (no se tocan sin decidir con Tomás)

- `src/cotizador-piedra.js` (16/10/2026; cambiado el 09/11/2026): dos precios por producto, **EFECTIVO**
  (efectivo o transferencia; Mercado Pago y QR ya no se ofrecen, 17/11) y **LISTA** (tarjeta, cheque, postnet). **Con factura, +21 % sobre la
  columna que sea (también la lista)** (decisión del 30/10; desde el 17/11 Erasmo NO ofrece factura ni dice "+ IVA": solo si
  el cliente la pide) y **redondeo para abajo a la centena de pesos en cada
  total** (02/11); el orden: precio × cantidad → IVA → centena. Centavos enteros, sin flotantes. Lo que falta sale
  como **FALTA DATO** (un total que da menos de $100 también). Unidades enteras: unidad, bolsa, bolsón, **caja,
  malla**, litro. Test: `test/cotizador-piedra.test.js`.
- `src/catalogo-piedra.js`: filas de la planilla a productos (pesos a centavos) y `buscarProductos`. Test:
  `test/catalogo-piedra.test.js`.
  **"Laja" (Tomás, 11/11/2026):** laja es toda piedra que se puede abrir y la gente le dice laja (o "piedra") a cualquier
  piedra, así que todas las piedras del catálogo son lajas; la granza, la laca y las baldosas no. `buscarProductos` con
  "laja" sola devuelve todas las piedras (`pideLajaEnGeneral`), sin tope; con "laja ocre" busca "ocre". La herramienta
  avisa que no es un producto para cotizar: catálogo y preguntar cuál. Lo mismo dice `cerebro-reglas.md` ("Lajas").

## Erasmo en modo tester (09/11/2026)

Cómo prenderlo: `PRENDER-TESTER.md`. Qué revisar (cuentas y decisiones de plata): `REVISAR.md`, "Corrida 2026-11-09c".

- `src/precios-panel.js`: los precios salen del panel (Supabase) con el usuario propio de Erasmo (`ERASMO_EMAIL` /
  `ERASMO_PASSWORD`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`; rol `bot`, solo lectura). Pide `negocios` (slug
  `somos-piedra`), `productos` y `plantas` con **columnas explícitas** (nunca `costo`), arma `nombre = planta +
  presentación`, pasa los **centavos del panel a pesos** y los carga con `armarCatalogo`. Solo activos y en pesos; la
  granza del panel se ignora. Caché en memoria de 10 min + copia en `data/precios/panel-cache.json`; si Supabase
  falla, la última copia buena (con un respiro de 60 s sin volver a pedir); si nunca cargó, FALTA DATO. Con filas de
  más de un negocio, todo FALTA DATO. Test: `test/precios-panel.test.js` (Supabase de mentira).
- `src/granza.js`: la granza NO está en el panel: tabla de tramos en un solo lugar. **Tabla final (Fran y Tomás,
  17/11/2026), por bolsa: efectivo 1-9 $22.000 · 10-14 $20.000 · 15-19 $16.000 · 20+ $15.500; tarjeta 1-9 $26.500 ·
  10-14 $25.000 · 15-19 $19.000 · 20+ $19.000.** Por m², 1 bolsa = 1 m² a 3 cm. **El bolsón SÍ se vende** (1 bolsón = 1 m³ =
  20 bolsas de 40 kg, se cobra el tramo 20+: $310.000 en efectivo, $380.000 con tarjeta): `cotizar` acepta `bolsones`
  (enteros) y el código multiplica por 20; 6 bolsones o más pasan el tope de 100 m² y escalan. Un camión de granza
  escala. 14 bolsas salen más caras que 15 (se cobra el precio de la banda). Test: `test/granza.test.js`.
- `src/stock-colores.js` (17/11/2026): `#sinstock <color>` / `#hay <color>` en el grupo "Bot Erasmo" (gris, roja,
  blanca; acepta "gris tandil", "blanca mdp", varios a la vez; mal escrito → ❓ y no cambia nada; `#sinstock` solo
  lista lo que falta). Vive en `estado.json` (clave interna: sobrevive reinicios, `#reset` no lo toca); arranca todo en
  stock. Mientras un color falta: `cotizar` no lo cotiza (error), `buscar_productos` lo marca `hay_stock: false` y el
  pedido a Sonnet dice "hoy NO hay stock de…" (no lo ofrece ni lo menciona; si el cliente lo pide, le dice que hoy no hay
  y ofrece los otros). Solo granza. Tests: `test/stock-colores.test.js`, `erasmo-herramientas`, `erasmo-fran-1117`.
- `src/herramientas-erasmo.js`: `buscar_productos` (nombres exactos, sin precios), `cotizar` (producto exacto + m² /
  largo y ancho / cantidad / bolsones (solo granza), forma de pago, con o sin factura → los totales ya escritos; sin
  forma de pago, solo el total en efectivo o transferencia (la tarjeta, un solo pago, si el cliente la pide); sin
  cuotas, cheque ni dólares (el pago mixto se cotiza con efectivo); un color sin stock no se cotiza; avisa `compra_grande` sobre $1.000.000; más de 100 m² escala; la multiplicación de largo × ancho la hace el
  código), `mandar_catalogo` y `agendar_seguimiento`. **Las dos últimas no hacen nada en el acto**: anotan en
  `turno.acciones` y `index.js` las ejecuta DESPUÉS de mandar los textos (y solo si el turno no escaló).
- **Catálogo PDF** (`mandar_catalogo`): `documentos/Catalogo-Somos-Piedra-2026_3.pdf` (carpeta fuera de git), por
  `src/documentos.js`. Sale por `mandarCatalogo` de `index.js`: "escribiendo…", ritmo, control (pausa, escalado, una
  persona, mensaje nuevo) y `enviarAlCliente` (el eco del PDF no cuenta como una persona de la cuenta), con los
  candados de `evolution.enviarDocumento` (escucha, **borrador** —nuevo—, listas, excluidos, carpeta). Una vez por
  chat cada 24 h (`catalogoEnviado`) salvo que lo pida de nuevo. En borrador, el borrador al grupo dice "[+ catálogo en PDF]".
- **Seguimiento** (`src/seguimiento.js`): `agendar_seguimiento` (fecha AAAA-MM-DD posterior a hoy y hasta 180 días,
  más el motivo) queda en `s.seguimiento` cuando salió la respuesta; ese día, al abrir la franja de avisos (9),
  **un** aviso al grupo (quién, qué pidió, por qué volver). No usa `recordatorios.js`. Nunca le escribe al cliente.
- **Avisos al grupo de 9 a 20** (`src/avisos-cola.js`): `evolution.avisarGrupo` encola en `estado.json` (clave
  interna, `colaAvisos`, tope 200) lo que se genera afuera de la franja (hora de Argentina) y un barrido de 1 minuto lo
  manda junto, en un solo mensaje (o los mínimos), y lo saca de la cola solo después de que salió. `avisarGrupo(texto,
  { inmediato: true })` sale ya: respuestas a comandos del grupo (`#excluir`, `#pausa`, `#vendido`, `#sonnet`…),
  el guardián y el estado dañado. Un escalado de noche deja su 🔕 en la cola, pero el "Enseguida te respondemos."
  le sale al cliente en el momento (ver "Al escalar").
- **Ficha** (`src/ficha.js`): en `s.ficha`, armada por el código: de qué anuncio vino, qué pidió (lo último cotizado),
  su último mensaje, en qué quedó, seguimiento y catálogo enviado.
- `quienAtiende` con `tester`: el que no está en `NUMEROS_TESTER` es `nadie`, antes de mirar `atiendeSonnet`.
- `npm run grupos` (`herramientas/grupos/listar.js`): lista nombre + JID de los grupos de la instancia (solo lee; no
  imprime claves). `npm run pruebas -- 5492994295806` (`herramientas/pruebas/armar.js`): arma `data/pruebas/<fecha>.md`
  con la charla del tester (tandas, herramientas con montos, escaladas, frenos de la guardia); solo lee.
- Tests: `granza`, `precios-panel`, `grupos`, `erasmo-herramientas`, `stock-colores`, `erasmo-fran-1117` (el pedido
  con stock y cuotas), `erasmo-tester` (modo tester, catálogo, seguimiento, cola de avisos, candados) y `pruebas`. `test/piedra-ayuda.js` fija la franja de avisos de 0 a 24 y el
  caché de precios en la carpeta temporal.

## Archivos que genera el bot (`src/generados.js`, 29/10/2026)

- Para la imagen del simulador y el presupuesto en PDF (`bot/spec-simulador-v1.md` §8). Van en
  `data/generados/` (`GENERADOS_DIR`).
- **Contrato del generador:** escribe un archivo NUEVO y lo registra enseguida para UN chat,
  `generados.registrar(chatId, ruta)`. Para registrarse tiene que ser el chat de una persona (`…@s.whatsapp.net`),
  estar adentro de la carpeta, ser `.jpg`/`.jpeg`/`.png`/`.webp`/`.pdf` de hasta 5 MB, con un solo nombre (sin hard
  link ni flujo `:` de NTFS) y con fecha de los últimos 10 minutos.
- El registro (en `estado.json`: sobrevive reinicios) guarda el **sha256 del contenido**: el dueño va atado a los
  bytes, no a la ruta. Renombrar, mover, copiar o volver a usar un nombre no le da a otro chat el archivo de A, y
  los mismos bytes nunca se registran para dos chats (un archivo para todos va por el catálogo). Los hashes se
  guardan 7 días.
- `evolution.enviarGenerado(chatId, ruta, { tipo: 'imagen' | 'pdf', caption })`, en orden: escucha / `#apagar` /
  contacto personal o excluido → nada; revisa la ruta (la misma resolución que el candado del catálogo) y lee
  el archivo UNA vez: esos bytes tienen que estar registrados para ESE chat hace menos de 24 h; borrador → al
  cliente nada y el archivo va al grupo marcado BORRADOR; fuera de las listas de prueba → nada. Si algo falla
  no sale nada (`{ bloqueado: true, motivo }`).
- **Nada de esto se expone a Sonnet todavía** (no hay herramienta: la ruta nunca sale de un texto). Los
  archivos no se borran: la limpieza espera la decisión de Tomás (spec §12.4). Riesgo aceptado (escrito en
  `generados.js`): cambiarle la fecha a mano a un archivo de más de 7 días, o un generador que escriba el
  contenido de A con otros bytes para B. Test: `test/generados.test.js`.

## Excluidos: `#excluir` / `#incluir` (decisión de Tomás, 29/10/2026)

- Números que el bot ignora enteros, como `CONTACTOS_PERSONALES`, pero que se dan de alta y de baja desde
  WhatsApp sin tocar el `.env` ni reiniciar (lo pidió Fran: `reglas/cerebro-reglas-piedra.md`, "Contactos
  excluidos"). Viven en `estado.json` (clave interna: sobreviven reinicios, quedan en el respaldo por hora y
  `#reset` no los toca). Se puede excluir un número que nunca escribió (un proveedor). `src/excluidos.js`.
- `evolution.esContactoPersonal` mira las dos listas (`motivoContactoPersonal` dice cuál), así que todo lo que
  ya lo usaba (index, control, recordatorios, ventas) los respeta. El grupo de avisos nunca cuenta. Además,
  `enviarTexto`, `mostrarEscribiendo`, `enviarImagen`, `enviarDocumento` y `enviarGenerado` no le mandan nada a
  un contacto personal o excluido (última traba: ni el "escribiendo…").
- `#excluir` corta también la tanda que estaba esperando, transcribiendo un audio, pensando o mandando (ni
  Sonnet, ni la sombra, ni avisos), salvo que se vuelva a `#incluir` en esos mismos segundos: ahí la respuesta
  en vuelo sale (borde aceptado; revisión de Codex del 29/10, P2). `#incluir` escrito en el chat de un excluido
  se atiende antes del corte de los personales. Lo del `.env` no se saca por comando.
- **El número tipeado en el grupo** se lleva a `549` + 10 dígitos (sin 54, 9 ni 0 de adelante; sin 15) y si no
  da, ❓ sin marcar nada: un número mal escrito no excluye a otro por sufijo. Si ningún chat guardado coincide,
  el 🚫 dice "verificá el link". Un número **extranjero** se excluye solo desde su chat (o por el `.env`); se
  vuelve a incluir desde su chat o con `#incluir` y los dígitos exactos guardados.
- En el chat de un excluido, `#vendido`, `#recordar`, `#pausa`, `#reset`… no hacen nada: avisan con un ❓ en el
  grupo (decisión pendiente de Tomás: si tienen que valer igual). Un `#recordar` de antes no suena mientras esté
  excluido (el 🚫 lo avisa).
- Al `#incluir`, lo que el cliente dejó escrito antes no lo contesta el barrido del silencio (`silencioAtendido`).
  Límite conocido: lo que se habló mientras estaba excluido no entra al historial (ni lo trae `contexto.js`),
  así que después del `#incluir` Sonnet no lo ve.
- Tests: `test/excluidos.test.js` (cada freno con su caso, verificados con mutaciones) y `test/personales.test.js`.

## Tandas de chats sin contestar y reactivación de 2 mensajes (18/11/2026)

Los dos le escriben a clientes que NO acaban de escribir, así que nada sale sin la orden de Tomás en el grupo "Bot Erasmo"
(`#tanda-ok`) o sin `ERASMO_REACTIVACION_ACTIVA=true` (apagada por defecto). Chats elegibles y exclusiones, en un solo lugar:
`src/chats-elegibles.js` (`motivoQueNoCuenta`: excluidos, personales, `@lid`/grupos, testers, pausados, escalados callados,
`#vendido`/`#perdido`, `#bot`). La relectura larga de un chat sin escribir el estado: `src/lectura-larga.js` (`leerLargo`:
historial guardado + hasta 150 de Evolution, unidos sin repetir; `contexto.completar` no sirve para esto).

**Tandas (`src/tandas.js`).** `#tanda` toma los próximos **40** chats donde lo último es del cliente (del más reciente al más
viejo, sin los de una tanda ya mandada) y por cada uno relee la conversación entera; Sonnet decide con `pensar({ tanda })`
(`cerebro.armarContextoDeTanda`: mismas reglas, mismas herramientas, más `no_contestar`; el último mensaje se compara contra
Evolution y, si ya contestó alguien, es `no_contestar` sin gastar a Sonnet): `responder` (con disculpas por la demora si pasó más
de 24 h), `no_contestar` (con motivo) o `escalar`. **No manda nada**: deja `data/tandas/<id>.md` (número tapado salvo los últimos 4)
y `<id>.json` y avisa al grupo. `#tanda-ok <id>` la manda (de a un chat, con el ritmo de siempre; `#tanda-ok <id> -4 -17` sin esos
números de orden; `#tanda-no <id>` la descarta). Una tanda a la vez; vence a las 6 h; con `CEREBRO_MODO=apagado` ni se arma, y para
MANDAR hace falta `nuevos` o `todos`, sin borrador ni escucha. Al mandar, por chat y justo antes de CADA mensaje (index.js,
`frenoDeChatMasivo`, `cambioEnElChat`, `mandarChatDeTanda`): los candados de siempre, `leLlegaAlCliente` (con `SOLO_CHATS_NUEVOS=true`
un chat viejo no recibe), que el último mensaje del chat siga siendo el que se leyó (se relee de Evolution; sin poder verificarlo, no
se le escribe) y que lo ya dicho se saque otra vez. Los respondidos quedan con `atiendeSonnet: true`; un `escalar` sale como un
escalado normal (🔕 y, solo si el chat se calla, "Enseguida te respondemos."). Marcas de los atendidos (respondidos, escalados,
`no_contestar`, sacados con -N): `state.datosDeTandas().chats`, sobreviven a `#reset`; una tanda descartada o vencida no marca a
nadie, y los salteados al mandar tampoco. Lo largo corre en segundo plano (`enBackground`): el comando contesta ya. Lo que el bot escribe
al grupo nunca empieza con `#` (el eco vuelve como mensaje propio y un comando solo cuenta al principio).

**Reactivación (`src/reactivacion.js`, textos en `src/reactivacion-textos.js`).** Chats donde lo último lo escribió la cuenta y el
cliente no contestó en `ERASMO_REACTIVACION_DIAS_1` (2) días → mensaje 1; a los `_DIAS_2` (7) días sin respuesta → mensaje 2;
**nunca más de 2 por chat** (marcas `m1`, `m2`, `descartado`, `cortado` en `state.datosDeReactivacion()`, sobreviven a `#reset`), solo
con actividad del cliente en los últimos `_VENTANA_DIAS` (30). Si el cliente contesta después del 1, se corta para siempre. Los textos los
escribe el CÓDIGO (los que aprobó Tomás: `reactivacion-textos.js`; no pasan por la guardia de Sonnet, que frenaría "Te escribo de…").
Antes de cada uno, `cerebro.decidirReactivacion` (Sonnet lee los últimos 20 mensajes y devuelve `mandar` true/false): `false` descarta el chat
para siempre; un error no descarta (se reintenta). Barrido cada 15 min (`revisarReactivacion`), lunes a sábado de 10 a 19 hora de Argentina, tope
`_TOPE_DIA` (40) por día (cuenta lo que Evolution confirmó) y a lo sumo 4 por barrido; de a uno, con ritmo humano y los mismos candados.
Lo que sale queda con `atiendeSonnet: true`. `#reactivar` dice el estado; `#reactivar-prueba` arma `data/reactivacion/<fecha>.md` con a quién le saldría
hoy (Sonnet incluido) sin mandar ni marcar nada, aunque `ACTIVA` sea false. Con `ACTIVA` en false no sale nada ni se le pregunta a Sonnet.

Tests: `test/tandas.test.js` y `test/reactivacion.test.js` (cada candado verificado con una mutación). Detalle y decisiones: "Corrida 2026-11-18a" en `REVISAR.md`.

## Protecciones que hay que conservar (resumen; detalle en `_heredado-iphone/CLAUDE-iphone.md`, "Protecciones que no hay que sacar")

- Ritmo humano: espera de 20-45 s antes de interpretar; lo que llega en ese rato se junta en la misma
  tanda; "escribiendo…" y control antes de CADA envío (`delay: 0`); un mensaje nuevo del cliente corta
  lo que falta y la tanda siguiente contesta todo junto; techo de 700 caracteres por tanda.
- Nada a grupos, difusiones ni estados. Mensajes de antes de arrancar se ignoran.
- Quién escribió un mensaje propio se decide por el id (`src/autoria.js`): una persona de la cuenta calla
  al bot `SILENCIO_TRAS_HUMANO_MIN` (45); vencido, el barrido del silencio (`revisarSilencios`) le contesta
  lo que quedó (vía Sonnet).
- Escalado callado (`src/control.js`): el chat queda callado hasta que alguien lo tome; un solo ⏰ al grupo
  si el cliente escribió después; pasadas 24 h es consulta nueva. Datos viejos (72 h): consulta nueva. Al
  escalar, lo único que recibe el cliente es el "Enseguida te respondemos." del código, una vez (ver "Al escalar").
- Chat sin número (`@lid`): no se procesa; 📵 al grupo sin el texto. `CONTACTOS_PERSONALES` y los excluidos
  por comando (`#excluir`): se ignoran enteros.
- El webhook no le cree a cualquiera: secreto en la ruta (`WEBHOOK_SECRETO`, 401), tope por minuto (429),
  cuerpo validado (400), instancia de otra (403, también `somosiphone`). Nunca se loguea el cuerpo.
- Un mensaje repetido (mismo id) no se procesa dos veces. Un texto nunca manda un archivo. El bot de Piedra
  no manda archivos del catálogo (`evolution.js` igual tiene el candado de carpeta y extensión); los que
  genera él mismo salen solo por `enviarGenerado`, con su propio candado (ver arriba).
- Audios: se transcriben con Gemini (solo para eso, con modelo de respaldo); uno que no se entiende **no se
  contesta**: escala en silencio. Lo que cita el cliente llega como `[responde a: …]`.
- Guardián de Evolution (`src/guardian.js`): avisa al grupo si la instancia no está `open` o no llegan mensajes.
- Candado del grupo de avisos (`evolution.motivoBloqueoAvisos`): en escucha no sale nada; el destino tiene
  que ser un grupo y nunca un chat de cliente.
- Nada que cargue `src/state.js` sin un `ESTADO_PATH` temporal (y `APRENDIZAJE_PATH`).

## Comandos

**En WhatsApp, desde la cuenta del negocio** (en el chat del cliente): `#pausa`, `#sigue` (reactiva y
contesta lo que dejó escrito), `#reset`, `#recordar <qué>` / `#hecho`, `#vendido` / `#perdido`,
`#excluir` / `#incluir` (el bot lo ignora entero / lo vuelve a atender).
**En el grupo interno**, con el número: `#pausa <n>`, `#sigue <n>`, `#vendido <n>`, `#perdido <n>`,
`#sonnet <n>` (qué contestaría, sin mandar nada), `#comparar <n>`, `#bot <n>` (sin Sonnet: queda en
sombra), `#sonnet-si <n>`, `#excluir <n>` / `#incluir <n>` (sirve pegar un wa.me; se puede excluir un número
que nunca escribió); sin número: `#sinstock <color>` / `#hay <color>` (un color de granza sin stock; `#sinstock` solo lista),
`#excluidos` (la lista), `#tanda` / `#tanda-ok <id> [-N …]` / `#tanda-no <id>` (los chats sin contestar, de a 40 y con tu OK),
`#reactivar` / `#reactivar-prueba` (la reactivación de 2 mensajes), `#apagar` / `#prender` (interruptor general,
local). **Desde el celular del tester**: `#reset`. Cada comando contesta en el grupo cómo se usa si se
escribe mal (no hay un `#ayuda` central: cada módulo tiene su `COMO_SE_USA`).

**npm**: `npm start`; `npm test` (la suite: ver `package.json`; si tarda, archivo por archivo con
`node test/<archivo>.test.js`); `npm run grupos` (ids de los grupos de la instancia); `npm run pruebas -- 549…`
(la charla del tester en `data/pruebas/`); `npm run evaluar -- --offline` (28 casos de Piedra con Sonnet enlatado: tiene
que dar 100%); `npm run aprender`; `npm run destino` (a dónde van los avisos); `npm run sembrar-viejos`
(semilla de chats viejos, con el bot frenado); `npm run probar-contexto -- 549…`.

## Variables de entorno

Todas en `src/config.js`; `.env.example` va siempre con los valores vacíos. No se lee ni se toca `.env`.
El bot **no necesita** `credenciales.json` ni la planilla para arrancar (ya no existen); las variables de
Supabase (abajo) solo son para los precios: sin ellas no hay precios del panel y Erasmo escala todo menos la
granza. Las importantes: `EVOLUTION_INSTANCE` (obligatoria), `EVOLUTION_APIKEY`, `PORT` (3002),
`WEBHOOK_SECRETO`, `GRUPO_AVISOS_JID`, `CEREBRO_MODO`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (solo
audios), `MODO_ESCUCHA`, `MODO_BORRADOR`, `NUMEROS_TESTER`, `NUMEROS_PILOTO`, `CONTACTOS_PERSONALES`,
`GENERADOS_DIR` (vacía: `data/generados`). Nuevas del 09/11/2026: `SUPABASE_URL`, `SUPABASE_ANON_KEY`,
`ERASMO_EMAIL`, `ERASMO_PASSWORD` (los precios del panel), `PRECIOS_CACHE_PATH` (vacía: `data/precios/panel-cache.json`),
`AVISOS_HORA_DESDE` / `AVISOS_HORA_HASTA` (9 y 20). Nuevas del 18/11/2026 (reactivación, **apagada si faltan**): `ERASMO_REACTIVACION_ACTIVA` (`true` la prende), `ERASMO_REACTIVACION_TOPE_DIA` (40), `ERASMO_REACTIVACION_DIAS_1` (2), `ERASMO_REACTIVACION_DIAS_2` (7), `ERASMO_REACTIVACION_VENTANA_DIAS` (30); `TANDAS_DIR` / `REACTIVACION_DIR` (vacías: `data/tandas`, `data/reactivacion`). Las `REACTIVACION_*` heredadas de iPhone no se leen. Ojo: `MODO_BORRADOR` vale `true` si falta en el `.env`.

## Tests

- Los que cargan `index.js` usan `test/piedra-ayuda.js` (entorno fijado, Sonnet de mentira con guion de
  `responder`/`escalar`, Evolution de mentira) o `test/sonnet-fijo.js` (un Sonnet que siempre contesta,
  para los de infraestructura). Nunca salen a la red; números inventados (`5490000…`).
- `test/piedra-*.test.js`: modos, guardia, escalar, Sonnet que falla, tandas, audio, lid, personales,
  control humano, escucha/borrador/listas, webhook. Más los adaptados de iPhone: dedupe, persistencia,
  lid, personales, chats-viejos, guardian, recordatorios, ventas, sombra-persona, contexto, gemini. Y los
  del 29/10: `excluidos` (`#excluir` / `#incluir` / `#excluidos`) y `generados` (`enviarGenerado`, sin
  cargar index.js).
- Primero el test que falla, después el arreglo. Sin llamadas reales a Anthropic, Gemini, Evolution.

## Mapa de carpetas

| Carpeta | Qué hay |
|---|---|
| `src/` | El bot: `index.js` (webhook, tandas, comandos, barridos), `cerebro.js` + `cerebro-reglas.md`, `config.js`, `state.js`, `evolution.js`, `control.js`, `contexto.js`, `audio.js` + `gemini.js`, `guardian.js`, `chats-viejos.js`, `autoria.js`, `aprendizaje.js`, `sombra-persona.js`, `cerebro-comandos.js`, `interruptor.js`, `promesas.js`, `recordatorios.js`, `ventas.js`, `excluidos.js`, `stock-colores.js`, `generados.js`, `salida.js`, `avisos-texto.js`, los de Piedra `cotizador-piedra.js` y `catalogo-piedra.js`, y los del modo tester (09/11): `precios-panel.js`, `granza.js`, `herramientas-erasmo.js`, `avisos-cola.js`, `seguimiento.js` y `ficha.js`; y los del 18/11: `tandas.js`, `reactivacion.js`, `reactivacion-textos.js`, `chats-elegibles.js` y `lectura-larga.js`. |
| `test/` | Los tests y los scripts (`evaluar.js`, `aprender.js`, `destino.js`, `sembrar-viejos.js`, `probar-contexto.js`). |
| `reglas/` | Reglas y casos de Piedra (Etapa 2; las reglas del cerebro, aprobadas el 06/11, están copiadas y adaptadas en `src/cerebro-reglas.md`). |
| `herramientas/historial/` | Exportador y clasificador del historial de Evolution (Etapa 1). |
| `herramientas/grupos/`, `herramientas/pruebas/` | `npm run grupos` (ids de grupos) y `npm run pruebas` (la charla del tester en `data/pruebas/`). |
| `documentos/` | El catálogo en PDF que manda `mandar_catalogo` (no se versiona: se copia a mano). |
| `bot/` | Prompts para VS Code y `mapa-poda.md` (qué se conservó, adaptó y movió en la poda). |
| `claude/` | Traspasos de cada chat (el de fecha más nueva manda). |
| `data/` | Estado, registro de aprendizaje, precios y los archivos que genera el bot (`data/generados/`) (no se versiona). |
| `_heredado-iphone/` | **Lo de iPhone, movido (no borrado)** el 19/10/2026: `src/` (responder, cotizador, sheets, techsur, espejo, stock-app, bateria, fotos-equipos, promo-madre, extractor-local, panel-chiara, supabase-reintento, anuncio, estilo, temas, resumen, las reglas de iPhone y las versiones de iPhone de `index.js` y `cerebro.js`), `test/` (sus tests y scripts), `CLAUDE-iphone.md` y `README-iphone.md`. **Nada vivo lo requiere**; se lee solo para consultar. |

## Pendientes de decisión (Tomás)

- Saludo automático del día (se fue con `responder.js`): hoy no hay; lo decide Tomás.
- Resumen de la mañana: se fue (era de iPhone); si se quiere para Piedra, se diseña de nuevo. (El seguimiento ya está: Erasmo anota "volver a contactar el día X" y ese día sale un aviso al grupo; no le escribe al cliente cada 2 días.)
- Tope de antigüedad de la copia de precios: ver `REVISAR.md`. (Los tramos de la granza y el precio de tarjeta de 15 a 19 bolsas quedaron resueltos el 17/11; los envíos siguen escalando siempre, ahora con el motivo armado: Neuquén capital $35.000 / otro lugar $45.000 sugeridos.)
- **Responder y escalar en el mismo turno** (17/11/2026): hoy Sonnet termina con `responder` o con `escalar`, y al escalar el cliente solo recibe "Enseguida te respondemos.". Por eso Erasmo no dice "Cuotas no tenemos, pero en compras grandes se puede ver pagar en partes" (compra de más de $1.000.000) ni "los dólares se aceptan al promedio del blue" antes de pasar el chat: solo escala. Si Tomás quiere que lo diga, hay que cambiar el diseño de `escalar` (ver "Corrida 2026-11-17a" en `REVISAR.md`).
- Sin forma de pago, `cotizar` da solo el total en efectivo o transferencia (la tarjeta, si la pide el cliente): es mi lectura de la nota de Fran del 17/11; confirmar.
- Las 5 preguntas de precios del traspaso del 16/10 y las de `preguntas-para-fran-v2.md`.
- **Textos de la reactivación** (18/11/2026): están como los dejó el prompt, pendientes del OK de Tomás; si los cambia, se cambian solo en `src/reactivacion-textos.js`. Con un producto del panel ("Laja X 1 m²") "por {producto} que estabas viendo" suena raro: ver `REVISAR.md`.
- **`SOLO_CHATS_NUEVOS` y las tandas / la reactivación**: con `SOLO_CHATS_NUEVOS=true` en el `.env`, `leLlegaAlCliente` da false para los chats viejos y ni la tanda ni la reactivación les escriben (lo avisan). Hay que sacarlo (o dejarlo vacío) para que salgan.
- Cuánto se guardan los archivos de `data/generados/` (spec del simulador §12.4): hoy no se borra nada.
- Conectar `enviarGenerado` al cerebro (`simular_piedra`, `presupuesto_pdf`): fase F2 de la spec del simulador.
- Si `#vendido` / `#perdido` / `#recordar` / `#pausa` tienen que valer en el chat de un excluido (hoy solo avisan
  con un ❓ en el grupo y no hacen nada).
- "Enseguida te respondemos." (16/11/2026): si el 🔕 del grupo tiene que decir que al cliente ya se le avisó (hoy
  dice "Al cliente no le contesté nada: escribile vos"), si el mensaje tiene que verlo Sonnet en el historial y
  contar para `#vendido` (hoy no), si la guardia tiene que frenar esa frase cuando la escribe Sonnet (hoy la deja
  pasar; por eso `cerebro-reglas.md` no la cita) y `reglas/cerebro-reglas-piedra.md` (las reglas aprobadas el
  06/11), que sigue diciendo "al cliente no le llega nada": ver `REVISAR.md`.
