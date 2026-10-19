# Mapa de la poda de iPhone (rama `piedra/poda-iphone`)

Qué pasa con cada archivo de `src/` y `test/` del bot copiado de Somos iPhone. Lo de iPhone **se mueve**
(`git mv`) a `_heredado-iphone/` con la misma estructura; nada vivo requiere nada de ahí.

- **CONSERVAR**: queda como está (a lo sumo comentarios o textos fijos neutros).
- **ADAPTAR**: queda, sin lo de iPhone.
- **MOVER**: a `_heredado-iphone/` (iPhone puro, o queda sin uso al sacar lo de iPhone).

"Términos" = apariciones de iphone|chiara|techsur|supabase|planilla|cotiz|batería|canje|cuota|panel|…
(conteo del arranque, `grep -ci`). "Lo requiere" = quién hace `require` del archivo.

## src/

| Archivo | Decisión | Evidencia |
|---|---|---|
| `index.js` | ADAPTAR | 2778 líneas, 81 términos. Corazón: webhook, tandas, silencios, escalados, comandos, barridos. Sale: `decidir` (responder), sheets/LEADS, #sinstock, #bateria, TechSur, espejo, stock, panel, promo, fotos de equipos, PDF del compromiso, seguimiento, saludo, resumen iPhone, canje. Quién contesta: `CEREBRO_MODO` (apagado = nadie). |
| `cerebro.js` | ADAPTAR | 2554 líneas, 236 términos. Requiere sheets, cotizador, responder, extractor-local, stock-app, fotos-equipos, temas. Quedan solo `responder` y `escalar`; guardia sin montos válidos (cualquier monto frena); sin respaldo del bot de siempre. |
| `cerebro-reglas.md` | ADAPTAR | 199 líneas, 63 términos: reglas de venta de iPhone. Se reemplaza por el mínimo de Piedra (escala todo). |
| `cerebro-reglas-deposito.md` | MOVER | Solo lo lee cerebro.js con STOCK_APP_MODO=vivo (depósito de iPhone). |
| `config.js` | ADAPTAR | Default `EVOLUTION_INSTANCE=somosiphone`, puerto 3001, bloques techsur/panel/stockApp/sheets (Supabase, planilla). |
| `state.js` | ADAPTAR | Lo requieren casi todos. Marcas de iPhone en `MARCAS_DEL_BOT` (`cotizadoDe`, `primerIphoneDicho`…) y `listaBateria` (#bateria). |
| `control.js` | ADAPTAR | Escalado/pausa/#sigue genéricos; sale `#sinstock` y los campos de iPhone de las limpiezas. Requiere `resumen` solo por `esTelefono`. |
| `gemini.js` | ADAPTAR | Queda solo para transcribir audios (con respaldo) y tapar datos personales. Salen `entender`/`redactar` (y con eso extractor-local). |
| `evolution.js` | CONSERVAR | 3 términos (comentarios). Envíos, candado del grupo, listas, escucha/borrador. Texto "Chiara apagada" → neutro. |
| `audio.js` | CONSERVAR | Transcribe con gemini.js; 2 términos (comentarios). |
| `texto-del-mensaje.js` | CONSERVAR | Texto, citas `[responde a: …]`, `[foto]`. |
| `fotos-del-cliente.js` | CONSERVAR | Baja las fotos del cliente para Sonnet. |
| `contexto.js` | CONSERVAR | Completa el historial con Evolution (lo usa cerebro, sombra-persona, comandos). |
| `chats-viejos.js` | CONSERVAR | 0 términos. Lista de chats viejos / puesta al día. |
| `guardian.js` | CONSERVAR | 0 términos. Guardián de Evolution. |
| `autoria.js` | CONSERVAR | 0 términos. Quién escribió un mensaje propio (por id). |
| `aprendizaje.js` | CONSERVAR | Registro de eventos (2 términos en comentarios). |
| `sombra-persona.js` | CONSERVAR | Sonnet en sombra donde atiende una persona (usa cerebro.pensar). |
| `cerebro-comandos.js` | ADAPTAR | 0 términos; textos "el bot de siempre" y el PDF → neutros. |
| `interruptor.js` | ADAPTAR | #apagar/#prender (interruptor local). Se saca el panel; textos "Chiara" → "el bot". |
| `promesas.js` | CONSERVAR | Guardia de promesas (la usa revisarSalida). |
| `cierre.js` | CONSERVAR | `esCierre` (acuses/gracias) para el barrido del silencio y #sigue. |
| `recordatorios.js` | CONSERVAR | #recordar/#hecho. Requiere de resumen `partir`, `esTelefono`, `LARGO_MENSAJE` → pasan a `avisos-texto.js`. |
| `ventas.js` | CONSERVAR | #vendido/#perdido y elegir chat desde el grupo. Requiere `esTelefono` de resumen → `avisos-texto.js`. |
| `acciones.js` | ADAPTAR | Texto con marcas / acciones (un texto nunca manda un archivo). Sale `fotoEquipo`. |
| `fotos.js` | CONSERVAR | Solo para la carpeta permitida de imágenes en evolution.js (candado). |
| `documentos.js` | ADAPTAR | Candado de la carpeta de documentos en evolution.js; el catálogo queda vacío (el compromiso de pago es de iPhone). |
| `responder.js` | MOVER | 3860 líneas, 482 términos: el "bot de siempre" (reglas de venta de iPhone). |
| `cotizador.js` | MOVER | Cuotas/entrega de iPhone (no confundir con `cotizador-piedra.js`). |
| `sheets.js` | MOVER | Planilla del Cotizador y LEADS (googleapis + credenciales.json). |
| `techsur.js` | MOVER | Proveedor de iPhone, escribe en el Supabase de la app. |
| `espejo-cotizador.js` | MOVER | Copia la planilla a la app de iPhone (Supabase). |
| `stock-app.js` | MOVER | Stock de la app de iPhone (Supabase + planilla). |
| `bateria.js` | MOVER | #bateria (lista de usados). |
| `fotos-equipos.js` | MOVER | Fotos de los iPhone del local. |
| `promo-madre.js` | MOVER | Promo del Día de la Madre de iPhone. |
| `extractor-local.js` | MOVER | Extractor de montos/modelos de iPhone (lo usaban responder, gemini.entender, cerebro). |
| `panel-chiara.js` | MOVER | Sube al panel de la app de iPhone (Supabase). |
| `supabase-reintento.js` | MOVER | Solo lo usaban panel-chiara y stock-app. |
| `anuncio.js` | MOVER | Solo lo usaban panel-chiara y test/anuncios.js. |
| `estilo.js` | MOVER | Frases de Fran para iPhone; solo lo usaban responder y cotizador. |
| `temas.js` | MOVER | Memoria por tema de iPhone (financiación, requisitos…); lo usaban responder y cerebro. |
| `resumen.js` | MOVER | Resumen de la mañana armado con señales de venta de iPhone (modelo, cotizado, turnos). Lo genérico (`esTelefono`, `partir`, `LARGO_MENSAJE`) pasa a `src/avisos-texto.js` (nuevo). |
| `cotizador-piedra.js` | NO SE TOCA | De Piedra (16/10/2026). |
| `catalogo-piedra.js` | NO SE TOCA | De Piedra (16/10/2026). |

Nuevo: `src/avisos-texto.js` (helpers de texto de los avisos al grupo, sacados de resumen.js) y
`src/salida.js` (el filtro de repetidos y el nombre de pila, sacados de responder.js).

## test/

Los tests que cargan `index.js` usaban la planilla de prueba (`fixture-planilla.js` + `sheets.usarFixture`)
y casi todos esperan respuestas del bot de siempre (precios, cotizaciones, textos de Fran). Sin
"bot de siempre" no se pueden adaptar razonablemente: se mueven, y las protecciones se cubren con tests
nuevos de Piedra (Sonnet de mentira contestando `responder`/`escalar`, Evolution de mentira).

| Archivo | Decisión | Evidencia |
|---|---|---|
| `cotizador-piedra.test.js`, `catalogo-piedra.test.js` | NO SE TOCAN | De Piedra; siguen en `npm test`. |
| `exportar-historial.test.js`, `clasificar-historial.test.js` | NO SE TOCAN | Herramientas del historial; entran a `npm test`. |
| `contexto.test.js` | CONSERVAR | 0 términos; contexto.js puro. |
| `audio-reintento.test.js` | CONSERVAR | 0 términos; gemini.transcribir + audio. |
| `gemini-respaldo.test.js` | ADAPTAR | Probaba el respaldo vía `gemini.entender` (se va): pasa a `gemini.llamar`. |
| `gemini.test.js` | ADAPTAR | Queda la parte de datos personales; la de `entender` se va. |
| `guardian.test.js` | ADAPTAR | Carga index + planilla de prueba solo de fondo: se saca la planilla. |
| `chats-viejos.test.js` | ADAPTAR | Igual: la planilla es de fondo. |
| `dedupe.test.js`, `persistencia.test.js`, `lid.test.js`, `personales.test.js`, `recordatorios.test.js`, `ventas.test.js`, `sombra-persona.test.js` | ADAPTAR (hecho) | Sin la planilla; donde esperaban "que el bot conteste", un Sonnet de mentira (`test/sonnet-fijo.js`). persistencia: marcas genéricas en vez de las de iPhone. personales: el chequeo del resumen pasó al recordatorio del escalado. ventas: sin las partes del resumen y del seguimiento. |
| `webhook.test.js`, `tandas.test.js`, `silencio.test.js`, `reset.test.js`, `seguridad.test.js`, `lista-blanca.test.js`, `control.test.js`, `cerebro-vivo.test.js`, `silencios-y-salud.test.js`, `responde-a.test.js`, `audio.test.js`, `aprendizaje.test.js`, `fotos-sonnet.test.js`, `foto-historial-sigue.test.js` | MOVER (hecho) | Esperan textos/cotizaciones del bot de siempre, el seguimiento, el resumen o Sonnet con herramientas de iPhone. Cubiertos por los tests nuevos de Piedra (abajo). |
| `cotizador.test.js`, `financiacion.test.js`, `precio.test.js`, `entrega.test.js`, `validacion-comercial.test.js`, `bateria-cerebro.test.js`, `techsur.test.js`, `stock-app.test.js`, `fotos-equipos.test.js`, `promo-madre.test.js`, `panel-chiara.test.js`, `espejo-cotizador.test.js`, `timeout-supabase.test.js`, `temas.test.js`, `saludo.test.js`, `seguimiento.test.js`, `sin-venta.test.js`, `no-entiende.test.js`, `notas.test.js`, `redactar.test.js`, `marcas.test.js`, `desde-cero.test.js`, `pdf-fallido.test.js`, `fotos-pedido.test.js`, `turnos.test.js`, `resumen.test.js`, `cerebro.test.js`, `aprobar.test.js` | MOVER | Prueban módulos que se mueven o reglas de venta de iPhone. |
| `evaluar.js` | ADAPTAR (reescrito) | Corría el banco de casos de iPhone (casos.js + correr-caso.js + responder). Queda un set mínimo de Piedra con respuestas de Sonnet enlatadas. |
| `casos.js`, `correr-caso.js`, `aprobados.js`, `aprobar.js`, `ejemplos-aprobados.json`, `fixture-planilla.js`, `leer-planilla.js`, `bateria-cerebro.js`, `bateria-cerebro-casos.js`, `chatear.js`, `guion.js`, `reproducir.js`, `sombra.js`, `margenes.js`, `techsur.js`, `anuncios.js`, `resumen.js`, `fixtures/` | MOVER | Scripts de iPhone (banco de casos, planilla, TechSur, simulador). |
| `destino.js` | ADAPTAR | Genérico (¿a dónde van los avisos?); solo el texto de prueba decía Somos iPhone. |
| `sembrar-viejos.js` | ADAPTAR | Genérico (semilla de chats viejos por instancia); se niega con la instancia vacía o `somosiphone`. |
| `probar-contexto.js`, `aprender.js` | CONSERVAR | Genéricos (contexto de Evolution, registro de aprendizaje). |

## Otros archivos

| Archivo | Decisión | Evidencia |
|---|---|---|
| `CLAUDE.md` | MOVER a `_heredado-iphone/CLAUDE-iphone.md` y uno nuevo corto | 4334 líneas de iPhone. |
| `README.md` | MOVER a `_heredado-iphone/README-iphone.md` | Manual de instalación del bot de iPhone. |
| `.env.example` | ADAPTAR | Tenía `EVOLUTION_INSTANCE=somosiphone`, un `SHEET_ID` real y variables de Supabase/TechSur/panel. Queda con valores vacíos. |
| `package.json` | ADAPTAR | Nombre/descr. de Piedra, puerto, scripts de iPhone fuera, `test` con la lista real, sin `googleapis`. |

## Resultado (19/10/2026)

**Tests nuevos de Piedra** (con `test/piedra-ayuda.js`: entorno fijo, Sonnet y Evolution de mentira):
`instancia.test.js` (instancia vacía / somosiphone no arranca; puerto 3002), `piedra-sonnet.test.js`
(CEREBRO_MODO, el pedido, 4×300, cualquier monto frena, promesas, escalar, Sonnet que falla, repetidos),
`piedra-tandas.test.js` (tandas, corte por mensaje nuevo, techo, cita, audio, lid, personales, catálogo,
fotos), `piedra-control.test.js` (persona 45 min y barrido, #pausa/#sigue/#reset, escalado y ⏰,
escucha/borrador/listas, #apagar, /salud), `piedra-webhook.test.js` (secreto, tope, validación, 403,
dedupe y tanda por HTTP). `evaluar.js`: 8 casos de Piedra, 100%.

**Lo que quedó con palabras de iPhone en src/, test/, package.json y .env.example, y por qué:**
- `somosiphone` en `src/config.js`, `test/instancia.test.js`, `test/piedra-webhook.test.js`, `.env.example` y
  `test/exportar-historial.test.js`: es la guarda que impide usar la instancia de iPhone.
- "iPhone" en comentarios que explican la poda (de dónde salió `salida.js`, `avisos-texto.js`, por qué
  gemini solo transcribe, etc.) y en los tests que verifican que no queda nada de iPhone en el pedido.
- `5492994637323` en `test/clasificar-historial.test.js`: archivo que no se toca (es un número de ejemplo
  del clasificador del historial de Piedra).
- Ningún ID de planilla, URL de Supabase/Google Sheets, número ni nombre de iPhone en el código vivo.
