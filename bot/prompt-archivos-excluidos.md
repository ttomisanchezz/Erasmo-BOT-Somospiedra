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

# Tarea: Erasmo (bot de Somos Piedra) — archivos generados por el bot y lista de excluidos

Repo: `E:\bot-piedra`, rama `piedra/archivos-excluidos` (ya creada y activa). Leé primero `CLAUDE.md` del repo. Son dos partes independientes (tocan archivos distintos salvo `evolution.js`: coordiná ese archivo, no lo editen dos agentes a la vez). Consultá al advisor antes de comprometerte con el plan de cada parte y antes de darla por terminada.

## Parte 1 — Mandar archivos que genera el propio bot

Hoy `src/evolution.js` solo deja mandar archivos del catálogo (`archivoPermitido`, `enviarImagen` con `fotos.carpeta()`, `enviarDocumento` con `documentos.CARPETA`). Viene el simulador de piedra (imagen) y el presupuesto en PDF (spec: `bot/spec-simulador-v1.md`), que los genera el bot en el momento. Hace falta una excepción **solo para esos archivos**, sin aflojar el candado del catálogo.

Qué tiene que existir:
1. Carpeta `data/generados/` (configurable con `GENERADOS_DIR`; `data/` ya está en `.gitignore`).
2. Un registro: el código que genera un archivo lo registra para UN chat (`registrar(chatId, ruta)`). Solo se puede mandar a ese mismo chat, y solo durante 24 h desde que se registró. Un archivo registrado para el chat A nunca sale al chat B. Persistencia: elegí lo que encaje con cómo persiste hoy el estado (`state.js`), y que sobreviva un reinicio.
3. `enviarGenerado(chatId, ruta, { tipo: 'imagen' | 'pdf', caption })` en `evolution.js`, con TODAS las guardas de `enviarImagen`/`enviarDocumento` (lista de prueba, apagado, modo escucha) y además: adentro de `GENERADOS_DIR` con la misma resolución de `archivoPermitido` (`..`, enlaces, mayúsculas, separadores de Windows), extensión permitida (imagen: .jpg .jpeg .png .webp; pdf: .pdf), tope de 5 MB, registrado para ese chat y no vencido. Si algo falla: no se manda, se loguea como `fueraDelCatalogo` y devuelve `{ bloqueado: true, motivo }`.
4. Modo borrador: mirá cómo se comporta hoy el borrador con los textos (`config.modoBorrador` en `index.js` y `evolution.js`) y hacé lo mismo con el archivo: al cliente no le llega; si el borrador manda la propuesta al grupo interno, el archivo va al grupo marcado como borrador. Si copiar ese comportamiento no es directo, que en borrador no salga a ningún lado y anotalo en "Decisiones que tomé solo".
5. Nada de esto se expone a Sonnet todavía: no hay herramienta nueva. La ruta nunca sale de un texto.
6. No borres archivos generados (la limpieza depende de una decisión pendiente de Tomás, §12.4 de la spec).

Tests (primero los que fallan): ruta fuera de la carpeta, `..`, enlace que sale de la carpeta, extensión no permitida, más de 5 MB, registrado para otro chat, vencido, no registrado, modo escucha, apagado, fuera de la lista de prueba, borrador, y el caso bueno de imagen y de PDF (con Evolution de mentira: que llame a `sendMedia` con el `mediatype` y `mimetype` correctos).

## Parte 2 — Lista de excluidos con #excluir / #incluir

Hoy los contactos que el bot ignora están en `CONTACTOS_PERSONALES` del `.env` (`esContactoPersonal` en `evolution.js`): para cambiarlos hay que editar el `.env` y reiniciar. Fran pidió poder dar de alta y de baja números sin eso (reglas: `reglas/cerebro-reglas-piedra.md`, sección de excluidos). Decisión de Tomás (29/10): con comandos desde la cuenta del negocio, igual que `#vendido` / `#perdido` (`src/ventas.js`).

Qué tiene que existir:
1. Desde la cuenta del negocio:
   - en el chat de la persona: `#excluir` y `#incluir`;
   - en el grupo interno: `#excluir 5492990000000` y `#incluir 5492990000000` (sirve pegar un wa.me, como en ventas.js);
   - en el grupo: `#excluidos` lista los excluidos por comando (nombre si se conoce, número y desde cuándo).
2. Mismo patrón que `#vendido`: solo cuenta al principio del mensaje, no entra al historial ni al aprendizaje, al cliente no le llega nada del bot y se confirma en el grupo (🚫 excluido / ✅ incluido, con nombre y número).
3. Se puede excluir un número que todavía nunca escribió (por ejemplo un proveedor). Sobrevive reinicios y queda en el respaldo del estado.
4. `esContactoPersonal(jid)` pasa a ser verdadero si el número está en `CONTACTOS_PERSONALES` **o** en la lista de excluidos. Así todos los que ya lo usan (index.js, control.js, recordatorios.js, ventas.js) lo respetan sin tocarlos. El grupo de avisos nunca cuenta como excluido.
5. OJO: `index.js` corta temprano los chats personales (busca `evolution.esContactoPersonal(chatId)) return`). El `#incluir` escrito en el chat de un excluido tiene que procesarse ANTES de ese corte; si no, nunca se podría volver a incluir desde el chat.
6. `#incluir` de un número que está en `CONTACTOS_PERSONALES` del `.env`: no se puede sacar por comando. Contestá en el grupo que está en el `.env` y que hay que sacarlo de ahí (sin leer el `.env`: usá `config.contactosPersonales`).
7. Un chat con `@lid` sin número: mirá cómo lo maneja hoy `index.js` y que `#excluir` en ese chat no rompa nada; si no se puede resolver el número, avisá en el grupo y no marques nada a ciegas.
8. Agregá `#excluir` / `#incluir` / `#excluidos` a la ayuda de comandos que ya exista (buscá dónde se listan `#vendido` y `#recordar`).

Tests (primero los que fallan): excluir desde el chat y desde el grupo, incluir desde los dos, excluir un número que nunca escribió y que después escribe (silencio total, sin Sonnet), `#incluir` en el chat de un excluido, número del `.env`, `#excluidos`, grupo de avisos nunca excluido, persistencia tras reiniciar (con `ESTADO_PATH` temporal), y que nada le llegue al cliente. Sumá 2 casos a `test/evaluar.js`: un excluido escribe y no pasa nada; `#excluir` en el chat no le manda nada al cliente y confirma en el grupo.

## Además
- Actualizá el `CLAUDE.md` del repo: las dos partes, los comandos nuevos, y "el bot contesta las 24 horas (decisión de Tomás, 29/10)".

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

## PARA COPIAR Y PEGAR (al final, en un solo bloque)
1. Resumen para Claude: qué cambió y dónde, los tests nuevos y cuáles fallaban antes, y el resultado de `npm test` y de `evaluar`.
2. Lo que tiene que correr Tomás: los comandos de PowerShell y qué tiene que pasar.
3. La prueba en vivo: cómo probar `#excluir` / `#incluir` / `#excluidos` con el número tester (sin clientes reales).
4. El comando de commit en la rama `piedra/archivos-excluidos`.
5. Decisiones que tomé solo.

---
SI TENÉS QUE ELEGIR (no estoy mirando la sesión):
- No me preguntes ni esperes respuesta: una pregunta frena la sesión hasta que yo vuelva.
- Tomá la opción recomendada (si no hay, la más conservadora que respete las reglas fijas), anotala con el porqué en una sección "Decisiones que tomé solo" del PARA COPIAR Y PEGAR, y seguí.
- Si algo no coincide con el código o con el prompt, anotalo en esa sección, seguí por el camino más conservador y no implementes lo que dependa de eso.
- Solo frená si la única salida rompe una regla fija: leer o tocar .env, tocar C:\bot-whatsapp\bot-whatsapp, reiniciar el bot, mandar mensajes, commit, push o borrar archivos.
---
