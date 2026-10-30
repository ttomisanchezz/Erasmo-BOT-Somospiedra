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
2. Escribir las reglas de Piedra (`reglas/cerebro-reglas-piedra.md`, cotización). Gate: Tomás las aprueba. (En curso.)
3. Construir la v1 en modo borrador (herramientas `buscar_productos` / `cotizar` del cerebro: prompt 4).
4. Probar y salir en vivo. Gate: solo con la frase explícita de Tomás ("prendé pilotos" / "prendé para todos").
5. Mejorar (opcional).

**Nada se prende, no se manda ningún mensaje y no se sale a ningún cliente sin la frase de Tomás.**

## Reglas heredadas del sistema (valen siempre)

- **Los montos nunca los produce la IA**: salen de una planilla o tabla y los calcula el código. Hoy no hay
  herramientas de precio: la guardia frena **cualquier** monto que escriba Sonnet.
- **Si no sabe cómo seguir: silencio con el cliente y aviso al grupo interno** (escalar).
- **El bot nunca promete que otra persona va a contactar al cliente** (ni que va a volver a escribir).
- **Tope de 4 mensajes por tanda, de 300 caracteres como máximo cada uno** (del 4º en adelante van juntos en el 4º).

## Quién contesta: `CEREBRO_MODO`

No hay "bot de siempre" (el motor de reglas de iPhone, `responder.js`, quedó en `_heredado-iphone/`).

| `CEREBRO_MODO` | Qué pasa |
|---|---|
| `apagado` (default) | Nadie contesta. El bot escucha, guarda el historial y el registro de aprendizaje. Nunca llama a la API. Tampoco escala (ni un audio que no se entendió). |
| `sombra` | Sonnet piensa con cada tanda y queda en el registro (`propuesta-sonnet`). No manda nada. |
| `tester` | Sonnet le contesta a `NUMEROS_TESTER`; el resto, en sombra. |
| `nuevos` | Al tester y a los chats nuevos (quedan marcados `atiendeSonnet` hasta `#reset` o `#bot`). |
| `todos` | Sonnet le contesta a todos. |

Encima van los modos de salida de siempre: `MODO_ESCUCHA` (no sale nada, ni al grupo), `MODO_BORRADOR`
(al cliente nada, el borrador al grupo), las listas `NUMEROS_TESTER` / `NUMEROS_PILOTO` (con alguna
cargada, solo a esos; `NUMEROS_PILOTO=todos`: a todos) y `SOLO_CHATS_NUEVOS`. La única definición de "le
llega al cliente" es `evolution.leLlegaAlCliente`.

**Horario: el bot contesta las 24 horas** (decisión de Tomás, 29/10/2026): no hay franja horaria para los
clientes. `SEGUIMIENTO_HORA_DESDE` / `_HASTA` solo rigen al guardián (cuándo mira que lleguen mensajes) y a los
recordatorios internos del grupo.

**Si Sonnet falla** (error de la API, timeout, sin `ANTHROPIC_API_KEY`) **no hay respaldo**: se escala en
silencio ("Sonnet no pudo contestar (…)" en el 🔕 del grupo), sin callar el chat (el próximo mensaje se
vuelve a intentar). Lo prueba `test/piedra-sonnet.test.js`.

## El cerebro (`src/cerebro.js` + `src/cerebro-reglas.md`)

- Sonnet termina siempre con `responder` (1 a 4 mensajes) o `escalar` (motivo para el grupo). Lo que no
  termina así cuenta como escalar.
- `cerebro-reglas.md` es el **mínimo de Piedra**: asistente de Somos Piedra, no inventa precios,
  condiciones, zonas, horarios ni políticas, no promete contacto de otra persona y **escala todo** salvo un
  saludo o acuse trivial. Las reglas de verdad están en borrador en `reglas/cerebro-reglas-piedra.md`
  (se copian acá cuando Tomás las apruebe). El hash de las reglas sale en `/salud` y en cada propuesta.
- **La guardia** (`revisarSalida`): 4×300; cualquier monto que no devolvió una herramienta de ESTA
  respuesta frena (un año suelto o la altura de una dirección no son montos); promesas
  (`src/promesas.js`), "te falta", mandar algo después, archivos, nombres internos, marcas de IA y
  caracteres raros. Si frena, Sonnet tiene **una** vuelta para corregir; si vuelve a frenar, escala.
- `armarContexto`: fecha de Neuquén, lo que sabe el estado, las líneas de una persona de la cuenta, las
  últimas 30 líneas del historial (completado con Evolution por `src/contexto.js`), la tanda y, en vivo,
  hasta 3 fotos del cliente. Sin el número del cliente; el nombre, tapado.
- `HERRAMIENTAS_DE_DATOS` está **vacía**: ahí se conectan `buscar_productos` y `cotizar` de Piedra en el
  prompt 4 (cada una: `definicion` para la API y `correr(input, turno)`, que anota en `turno.montos` los
  montos que la guardia deja escribir).
- Gasto del día (memoria) y del mes (`estado.json`), aviso al 80% de `CEREBRO_TOPE_MES_USD`.

## Módulos de Piedra ya hechos (no se tocan sin decidir con Tomás)

- `src/cotizador-piedra.js` (16/10/2026): dos precios por producto, **EFECTIVO** y **LISTA**. Efectivo
  (efectivo, transferencia, Mercado Pago, QR) + **IVA 21 % sobre el efectivo si pide factura**; LISTA
  (tarjeta, cheque, postnet) **ya es final**. Centavos enteros, sin flotantes. Lo que falta sale como
  **FALTA DATO**. Test: `test/cotizador-piedra.test.js`.
- `src/catalogo-piedra.js`: filas de la planilla a productos (pesos a centavos) y `buscarProductos`. Test:
  `test/catalogo-piedra.test.js`.
- Todavía **no están conectados al cerebro**: eso es el prompt 4 (`buscar_productos`, `cotizar`).

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

## Protecciones que hay que conservar (resumen; detalle en `_heredado-iphone/CLAUDE-iphone.md`, "Protecciones que no hay que sacar")

- Ritmo humano: espera de 20-45 s antes de interpretar; lo que llega en ese rato se junta en la misma
  tanda; "escribiendo…" y control antes de CADA envío (`delay: 0`); un mensaje nuevo del cliente corta
  lo que falta y la tanda siguiente contesta todo junto; techo de 700 caracteres por tanda.
- Nada a grupos, difusiones ni estados. Mensajes de antes de arrancar se ignoran.
- Quién escribió un mensaje propio se decide por el id (`src/autoria.js`): una persona de la cuenta calla
  al bot `SILENCIO_TRAS_HUMANO_MIN` (45); vencido, el barrido del silencio (`revisarSilencios`) le contesta
  lo que quedó (vía Sonnet).
- Escalado callado (`src/control.js`): el chat queda callado hasta que alguien lo tome; un solo ⏰ al grupo
  si el cliente escribió después; pasadas 24 h es consulta nueva. Datos viejos (72 h): consulta nueva.
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
que nunca escribió); sin número: `#excluidos` (la lista), `#apagar` / `#prender` (interruptor general,
local). **Desde el celular del tester**: `#reset`. Cada comando contesta en el grupo cómo se usa si se
escribe mal (no hay un `#ayuda` central: cada módulo tiene su `COMO_SE_USA`).

**npm**: `npm start`; `npm test` (la suite: ver `package.json`; si tarda, archivo por archivo con
`node test/<archivo>.test.js`); `npm run evaluar -- --offline` (10 casos de Piedra con Sonnet enlatado: tiene
que dar 100%); `npm run aprender`; `npm run destino` (a dónde van los avisos); `npm run sembrar-viejos`
(semilla de chats viejos, con el bot frenado); `npm run probar-contexto -- 549…`.

## Variables de entorno

Todas en `src/config.js`; `.env.example` va siempre con los valores vacíos. No se lee ni se toca `.env`.
El bot **no necesita** `credenciales.json` ni variables de Supabase o de la planilla para arrancar (ya no
existen). Las importantes: `EVOLUTION_INSTANCE` (obligatoria), `EVOLUTION_APIKEY`, `PORT` (3002),
`WEBHOOK_SECRETO`, `GRUPO_AVISOS_JID`, `CEREBRO_MODO`, `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` (solo
audios), `MODO_ESCUCHA`, `MODO_BORRADOR`, `NUMEROS_TESTER`, `NUMEROS_PILOTO`, `CONTACTOS_PERSONALES`,
`GENERADOS_DIR` (vacía: `data/generados`).

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
| `src/` | El bot: `index.js` (webhook, tandas, comandos, barridos), `cerebro.js` + `cerebro-reglas.md`, `config.js`, `state.js`, `evolution.js`, `control.js`, `contexto.js`, `audio.js` + `gemini.js`, `guardian.js`, `chats-viejos.js`, `autoria.js`, `aprendizaje.js`, `sombra-persona.js`, `cerebro-comandos.js`, `interruptor.js`, `promesas.js`, `recordatorios.js`, `ventas.js`, `excluidos.js`, `generados.js`, `salida.js`, `avisos-texto.js`, y los de Piedra `cotizador-piedra.js` y `catalogo-piedra.js`. |
| `test/` | Los tests y los scripts (`evaluar.js`, `aprender.js`, `destino.js`, `sembrar-viejos.js`, `probar-contexto.js`). |
| `reglas/` | Reglas y casos de Piedra en borrador (Etapa 2). |
| `herramientas/historial/` | Exportador y clasificador del historial de Evolution (Etapa 1). |
| `bot/` | Prompts para VS Code y `mapa-poda.md` (qué se conservó, adaptó y movió en la poda). |
| `claude/` | Traspasos de cada chat (el de fecha más nueva manda). |
| `data/` | Estado, registro de aprendizaje, precios y los archivos que genera el bot (`data/generados/`) (no se versiona). |
| `_heredado-iphone/` | **Lo de iPhone, movido (no borrado)** el 19/10/2026: `src/` (responder, cotizador, sheets, techsur, espejo, stock-app, bateria, fotos-equipos, promo-madre, extractor-local, panel-chiara, supabase-reintento, anuncio, estilo, temas, resumen, las reglas de iPhone y las versiones de iPhone de `index.js` y `cerebro.js`), `test/` (sus tests y scripts), `CLAUDE-iphone.md` y `README-iphone.md`. **Nada vivo lo requiere**; se lee solo para consultar. |

## Pendientes de decisión (Tomás)

- Saludo automático del día (se fue con `responder.js`): hoy no hay; lo decide Tomás.
- Seguimiento automático y resumen de la mañana: se fueron (eran de iPhone); si se quieren para Piedra, se diseñan de nuevo.
- Las 5 preguntas de precios del traspaso del 16/10 y las de `preguntas-para-fran-v2.md`.
- Cuánto se guardan los archivos de `data/generados/` (spec del simulador §12.4): hoy no se borra nada.
- Conectar `enviarGenerado` al cerebro (`simular_piedra`, `presupuesto_pdf`): fase F2 de la spec del simulador.
- Si `#vendido` / `#perdido` / `#recordar` / `#pausa` tienen que valer en el chat de un excluido (hoy solo avisan
  con un ❓ en el grupo y no hacen nada).
