Modelo: Sonnet 5.5 (advisor Opus 5.5) — sesión NUEVA

---
DELEGACIÓN Y PARALELIZACIÓN:
- Antes de empezar, evaluá qué partes de la tarea son independientes. Lo independiente va en paralelo; en secuencia, solo lo que depende de otro paso. Dos tareas que tocan los mismos archivos no van en paralelo.
- Si la tarea es chica (1 o 2 archivos, cambio puntual), NO delegues: hacelo directo.
- Para explorar el código usá el subagente `explorer` (Haiku), no el Explore integrado. Para documentación externa, `researcher` (Haiku). Lanzá varios en paralelo y pediles conclusiones, no volcados de archivos.
- Las partes independientes de la implementación van a agentes de Codex en paralelo con /codex:rescue --background (una tarea por agente, con instrucciones claras y archivos concretos). Seguí el progreso con /codex:status y traé los resultados con /codex:result.
- Si Codex no alcanza (límite de uso, error, o la tarea necesita mucho contexto del proyecto), usá el subagente `worker` (Sonnet).
- Si `explorer`, `researcher` o `worker` no están en `.claude/agents/`, anotalo y usá los subagentes integrados.
- Consultá al advisor (Opus) antes de comprometerte con un plan no trivial, cuando un error se repite y antes de dar la tarea por terminada. No lo uses para lo rutinario.
- Vos planificás, repartís, revisás e integrás. Nunca aceptes el trabajo de Codex o de un subagente sin revisarlo.
- Al terminar, usá /codex:review para una revisión rápida de los cambios.
---

# Poda de iPhone en bot-piedra (se MUEVE, no se borra)

## Contexto
`C:\bot-whatsapp\bot-piedra` es una copia del bot de Somos iPhone (commit e708087) con git propio. Somos Piedra es otro negocio: no vende equipos, no financia en cuotas, no hay canje, TechSur, batería ni mayoría de edad. Lo que sirve de la copia es la infraestructura.

Decisión de Tomás (15/10/2026): los dos bots quedan en carpetas independientes. **Nada de `C:\bot-whatsapp\bot-whatsapp` se toca ni se lee más de lo necesario.** En bot-piedra se saca todo lo de iPhone **moviéndolo** a `_heredado-iphone\` (con la misma estructura de carpetas: `_heredado-iphone\src\...`, `_heredado-iphone\test\...`), no borrándolo, para poder consultarlo después. Esa carpeta no se requiere desde ningún archivo vivo ni se lee salvo para consultar.

Las reglas de negocio de Piedra todavía no existen (salen de las respuestas de Fran y las aprueba Tomás). Esta tarea NO escribe reglas de negocio, ni cotizador, ni planilla de Piedra: eso viene en otros prompts.

## Objetivo
Un bot de Piedra que:
- reciba el webhook de Evolution (instancia `somospiedra`, puerto 3002), guarde estado, junte tandas, respete silencios, escalado a persona y modos (`MODO_ESCUCHA`, `MODO_BORRADOR`, `CEREBRO_MODO`, listas blancas);
- transcriba audios (Gemini), baje las fotos del cliente para Sonnet, avise al grupo interno y conserve el guardián de Evolution y las protecciones del `CLAUDE.md` ("Protecciones que no hay que sacar");
- tenga el cerebro Sonnet con SOLO las herramientas `responder` y `escalar` (sin precios, sin equipos, sin fotos de equipos), con la guardia que verifica montos (nunca debería haber un monto: sin herramientas de precio, cualquier monto que escriba se frena), el tope de 4 mensajes de 300 caracteres como máximo y la regla "si no sabe cómo seguir: silencio con el cliente y aviso al grupo";
- no tenga ningún camino que pueda leer o escribir el Supabase, la planilla, el panel o los archivos de iPhone, ni IDs, números o URLs de iPhone escritos en el código.

## Pasos
1. **Mapa, sin cambiar nada.** Con varios `explorer` en paralelo, clasificá CADA archivo de `src/` y `test/` como CONSERVAR / ADAPTAR / MOVER, con la evidencia (qué hace, quién lo requiere, cuántas veces aparecen términos de iPhone). Guardalo en `bot\mapa-poda.md`. Orientación de arranque (aproximada: la evidencia manda, y ante la duda **conservar y anotar**):
   - MOVER (iPhone puro): `cotizador.js`, `espejo-cotizador.js`, `techsur.js`, `bateria.js`, `stock-app.js`, `fotos-equipos.js`, `promo-madre.js`, `extractor-local.js`, `sheets.js`, `responder.js` (el motor de reglas viejo), `panel-chiara.js` (sube al panel de iPhone), `cerebro-reglas-deposito.md` y los tests de esos módulos y de sus reglas (cotizador, financiación, precio, entrega, validación comercial, batería, techsur, stock-app, fotos-equipos, promo-madre, panel-chiara, espejo-cotizador, etc.).
   - ADAPTAR: `cerebro.js` (sacar las herramientas de equipos, cotizar, que_me_alcanza, lista y fotos; dejar `responder` y `escalar`), `cerebro-reglas.md` (reemplazar por un mínimo de Piedra, ver paso 4), `index.js`, `config.js`, `state.js`, `gemini.js`, `estilo.js`, `temas.js`, `resumen.js`, `ventas.js`, `acciones.js`, `contexto.js`.
   - CONSERVAR (verificar): `evolution.js`, `texto-del-mensaje.js`, `audio.js`, `fotos-del-cliente.js`, `guardian.js`, `interruptor.js`, `control.js`, `promesas.js`, `cierre.js`, `documentos.js`, `autoria.js`, `supabase-reintento.js`, `recordatorios.js`, `aprendizaje.js`, `sombra-persona.js`, `chats-viejos.js`, `anuncio.js`, `fotos.js`.
2. **Advisor antes de mover nada.** Mostrale el mapa y el orden de los pasos. Esto es un refactor sin tests que lo cubran del todo: no te comprometas sin su visto bueno.
3. **Ejecutar en pasos chicos**, con los tests que quedan en verde después de cada uno (`node test/<archivo>.test.js`). Primero lo que no depende de nada, al final `index.js` y `cerebro.js`.
4. **El cerebro mínimo.** `cerebro-reglas.md` queda en un texto corto: quién sos (el asistente de Somos Piedra, una tienda de piedra natural de Neuquén), cómo terminás cada respuesta (con `responder` o `escalar`), que NO inventás precios, condiciones, zonas ni políticas, que no prometés que otra persona va a contactar al cliente, y que **hasta que haya reglas aprobadas escalás todo**. Nada de lo de iPhone. Los textos fijos del código (saludos, avisos, mensajes de error) que digan iPhone, Chiara o equipos se reemplazan por texto neutro de Piedra o se sacan.
5. **Sin camino a iPhone.** Buscá por texto en `src/`, `test/` y `package.json`: `iphone`, `chiara`, `techsur`, `supabase.co`, `docs.google.com`, `spreadsheets`, `sheets.googleapis`, `5492994`, `Tomi`, `Franco`, IDs de planilla o de grupo. Lo que aparezca y no sea un comentario aprobado se saca o se pasa a una variable de entorno vacía en `.env.example` (**sin valores reales: `.env.example` va siempre con los valores vacíos**). El bot de Piedra no debe tener ninguna dependencia de que existan `credenciales.json` ni variables de Supabase para arrancar.
6. **Tests.** Los de los módulos movidos se mueven con ellos. Los que quedan tienen que pasar. Actualizá el script `test` de `package.json` con la lista real e incluí los dos tests de herramientas (`test/exportar-historial.test.js` y `test/clasificar-historial.test.js`). `npm run evaluar -- --offline` no puede depender de casos de iPhone: dejá un set mínimo de Piedra (5 a 8 casos) que pruebe escalar, el tope de 4 mensajes de 300 caracteres, el silencio y que no sale ningún monto; los casos reales de Piedra se arman en otro prompt.
7. **`CLAUDE.md`.** Movelo a `_heredado-iphone\CLAUDE-iphone.md` y escribí uno nuevo, corto (máximo ~250 líneas): qué es Piedra, el roadmap por etapas y sus gates, las reglas heredadas del sistema, las protecciones que hay que conservar (resumidas, con referencia al archivo heredado para el detalle), los comandos npm que quedan, el mapa de carpetas y qué hay en `_heredado-iphone\`.
8. **Antes de dar por terminado:** `npm test` (archivo por archivo si tarda), `npm run evaluar -- --offline` al 100%, una segunda búsqueda por texto de lo del paso 5, y consultá al advisor.

## Lo que NO se toca
`herramientas\` (exportador y clasificador del historial), `data\`, `test\exportar-historial.test.js`, `test\clasificar-historial.test.js`, `preguntas-para-fran.md`, `preguntas-para-fran-v2.md`, `conectar-piedra.ps1`, `iniciar-bot-piedra.cmd`, `fotos\`, `documentos\` (solo mirar), y todo lo que dicen las reglas fijas. No arranques el bot de verdad: las pruebas van con Evolution de mentira. Tomás lo reinicia él al final.

## Reglas fijas
- No leer ni tocar `.env`, `.env.docker`, `credenciales.json` ni `docker-compose.yml`.
- No tocar `C:\bot-whatsapp\bot-whatsapp` (iPhone, en vivo) ni la instancia `somosiphone` de Evolution.
- No reiniciar Docker ni Evolution, no mandar mensajes y no prender ningún flag del `.env` de Piedra.
- Nada que cargue `src/state.js` sin un `ESTADO_PATH` temporal.
- Sin llamadas de verdad a Anthropic, Gemini, Google, Evolution ni Supabase: `fetch` y Evolution de mentira, planillas de prueba. La batería del cerebro la corre Tomás, porque gasta.
- Números de teléfono inventados (5490000000000).
- Primero el test que falla, después el arreglo. Al terminar, `npm test` (archivo por archivo si tarda) y `npm run evaluar -- --offline` al 100%.
- Buscar por texto, no por número de línea.
- Sin commit ni push. Actualizar `CLAUDE.md` de `bot-piedra`.
- La máquina: no tocar los ajustes de Antigravity ni de VS Code, no definir `CLAUDE_CONFIG_DIR` y no correr `claude auth login` ni `claude auth logout`. Si `claude` falla por la política de PowerShell, usar `claude.cmd`.
- Excepción autorizada por Tomás para esta tarea: **mover** archivos dentro de `bot-piedra` a `_heredado-iphone\`. Borrar sigue prohibido.

## PARA COPIAR Y PEGAR (al final)
1. **Resumen para Claude:** qué se movió y qué se adaptó (con la lista), los tests movidos, los que fallaban antes y el resultado de `npm test` y de `evaluar`, y lo que quedó con "iphone" en el código con el porqué.
2. **Lo que tiene que correr Tomás:** el comando para reiniciar el bot de Piedra (`iniciar-bot-piedra.cmd`), qué tiene que ver en el log (que arranque en escucha y diga cuántos contactos personales cargó) y que `GET http://localhost:3002/salud` conteste.
3. **La prueba en vivo:** no aplica todavía (no hay cotizador de Piedra). Decí cómo comprobar que un mensaje de prueba entra al estado sin salir nada.
4. **El comando de commit en la rama** (nombre sugerido: `piedra/poda-iphone`), con los archivos movidos y los nuevos.
5. **Decisiones que tomé solo.**

---
SI TENÉS QUE ELEGIR (no estoy mirando la sesión):
- No me preguntes ni esperes respuesta: una pregunta frena la sesión hasta que yo vuelva.
- Tomá la opción recomendada (si no hay, la más conservadora que respete las reglas fijas), anotala con el porqué en una sección "Decisiones que tomé solo" del PARA COPIAR Y PEGAR, y seguí.
- Si algo no coincide con el código o con el prompt, anotalo en esa sección, seguí por el camino más conservador y no implementes lo que dependa de eso.
- Solo frená si la única salida rompe una regla fija: leer o tocar .env, tocar C:\bot-whatsapp\bot-whatsapp, reiniciar el bot, mandar mensajes, commit, push o borrar archivos.
---
