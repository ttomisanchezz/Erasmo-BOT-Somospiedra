> **Cortex del negocio.** Antes de cualquier tarea, leé también el Cortex:
> `C:\Users\PC\Documents\cortex-somosiphone\CLAUDE.md` (reglas del negocio, estado de todos
> los proyectos, pendientes y comandos `pendientes` y `cierre`). Si algo de este archivo
> contradice al Cortex en reglas del negocio, manda el Cortex: avisale a Tomás.
>
> @C:/Users/PC/Documents/cortex-somosiphone/CLAUDE.md

# Bot de WhatsApp — Somos iPhone NQN

Notas del proyecto. Cualquier agente que trabaje acá lee esto primero: tiene que alcanzar
para entender el estado sin que nadie lo cuente.

---

## Estado al 29 de septiembre de 2026

- **Otro modelo con la entrega ya dicha, la frase del saludo y el tramo de batería de TechSur (08/10/2026, rama
  `otro-modelo-con-entrega` sobre `fee4cd4`; hecho por Claude; decisiones de Tomás del 08/10):** (A) *Stock y precio*:
  si el cliente ya dijo con cuánto cuenta y pregunta por otro modelo que sí está ("el 13 con 450 mil?" cotizado y
  después "y el 14?"), Sonnet cotiza ese modelo con esa entrega: "el 14 de 128gb al 100%, con los $450.000 de entrega
  te queda asi" · `[cotizacion]` · "cual te cierra mas?" (con otras palabras si ya se la hizo), sin el contado; si no
  llega, la entrega inicial de ese modelo (sin decir cuánto falta; la insistencia cuenta para ese modelo); si lo paga
  entero, de contado y el turno. El PDF sigue saliendo una sola vez por chat. Sin la entrega dicha, como antes (solo
  el contado). Ejemplo 20; casos 114 y 115. Es solo de reglas: el código ya lo dejaba (lo fijan tests nuevos). (B) En
  *Modelos* decía que el saludo va "pegado al primero": ahora dice "el saludo lo pone el sistema", que es lo que hace
  `conSaludo` (aparte con menos de 4 mensajes, pegado al primero solo con 4); Tomás lo quiere así en todos los chats y
  `conSaludo` no se tocó. (C) TechSur: el tramo de batería de un encabezado ("Batería 85% a 99%", "Con batería nueva",
  "USADOS CON BATERIA 100%") o el 100% como única batería va en `nota` ("batería 85-99%", "batería 100%"), que es
  parte de la `clave`: la LISTA MAYORISTA del 07/10 ya no da dos precios con la misma clave. Ver *Precios de TechSur*.
  Sin variables nuevas; cambian las reglas (hash `0ae1d55b`, 189 líneas; con el depósito `8fae6b0d`; ver
  `CAMBIOS-CEREBRO.md`); hay que reiniciar y, después del merge, `npm run techsur -- --recargar`.
- **Panel Chiara: un solo gasto del mes y "devolver" que contesta como `#sigue` (08/10/2026, rama
  `panel-gasto-devolver` sobre `fee4cd4`; hecho por Claude; decisiones de Tomás del 08/10):** (A) el panel sube como
  `gasto_mes_usd` y `tope_mes_usd` los de `cerebro.gastoDelMes()` (los de `/salud`, `estado.json` y el aviso del 80%):
  ya no lleva su propia cuenta (`datos.mes` de `data/chiara.json` no se suma más; un archivo viejo se lee igual y la
  pierde al guardar). Un solo tope, `config.cerebro.topeMesUsd`: `CEREBRO_TOPE_MES_USD`; si no está,
  `CHIARA_TOPE_MES_USD`; si no, 60 (`config.panel.topeMesUsd` ya no existe). Ese contador solo cuenta lo que gasta el
  bot: las corridas de la batería con la misma clave no entran (el 08/10 al mediodía la consola de Anthropic decía
  US$20,01 y `/salud` US$10,14). (B) la orden `devolver` hace lo mismo que `#sigue <número>` desde el grupo: con
  `alSeguir` y `atenderChat` de `index.js` (deps de `panel.arrancar`), si toca le contesta lo que el cliente dejó
  escrito (la tanda arranca ya y no se la espera) y el aviso es el de `#sigue` con "📱 Desde el panel ·" adelante. Sin
  variables nuevas (en el `.env` alcanza con `CEREBRO_TOPE_MES_USD`); hay que reiniciar. Ver *Panel Chiara*.
- **"Lo que pasó hoy": empezó y dejó de ofrecer (08/10/2026, rama `lo-que-paso-hoy` sobre `fee4cd4`; hecho por
  Claude; diseño de escritorio del Cortex):** con `STOCK_APP_MODO=vivo`, cada vuelta de `src/stock-app.js` que deja
  USADOS al día compara los códigos que Chiara ofrece del local con la vuelta anterior y el panel sube a
  `bot_eventos` `empezo_a_ofrecer` (código nuevo) o `dejo_de_ofrecer` (código que ya no está, sin el porqué), con
  el equipo en el detalle: "iPhone 15 Pro 256GB 92% · $870.000 · 15P-256-001". Un cambio de precio no es noticia.
  La lista anterior queda en `data/stock-ofrece.json` (sin ella, la vuelta es la base); la vista que falla no
  compara y la vacía cuenta recién a la tercera vuelta, cuando vacía USADOS; más de 15 cambios, un resumen por
  tipo ("18 equipos"). Sombra y apagado: nada. **La app tiene que sumar los dos tipos al CHECK de
  `bot_eventos.tipo` (0019) y a `EVENTO_LABEL`** (`Claude outputs\cerebro\lo-que-paso-hoy-para-la-app.md`);
  mientras tanto la base los rechaza y el panel los deja afuera de a uno sin trabar las demás noticias. Sin
  variables nuevas; hay que reiniciar. Ver *El stock de la app en la planilla*, punto 7.
- **Los timeouts de Supabase (08/10/2026, rama `timeout-supabase` sobre `fee4cd4`; hecho por Claude):** diagnóstico de
  los 57014 de `bot_estado` del 07/10 y del timeout del stock del 08/10 (la base estuvo lenta o trabada un rato; los
  "fetch failed" son cortes de internet de la PC). Del lado del bot: la hora de Argentina en las líneas de error y de
  "anda de nuevo" de `[panel]` y `[stock-app]`; un 57014, un 504 o el tope de 15 s se reintentan una vez a los 5 s; y
  el panel, el stock y el espejo ya no salen en el mismo segundo (panel en cada minuto justo, stock a los :30, espejo a
  los :45). No cambia nada de lo que llega a la app. Lo de la base y la app, en
  `Claude outputs\cerebro\timeout-supabase-para-la-app.md`. Ver *Los timeouts de Supabase*. Sin variables nuevas
  (`SUPABASE_REINTENTO_MS`, solo para las pruebas); hay que reiniciar.
- **El parecido se cotiza con la entrega que ya dio (08/10/2026, rama `parecido-con-entrega` sobre `ce866aa`; hecho
  por Claude; decisión de Tomás del 08/10, caso del tester del 07/10 a las 23:51):** si el cliente pide un modelo del 11
  al 18 que no está y ya dijo con cuánto cuenta para la entrega (en ese mensaje, "el 13 con 340 mil?", o antes), Sonnet
  cotiza el primero de `parecidos` con esa entrega: "justo el 13 no me esta quedando, lo mas parecido que tengo es el 14
  de 128gb al 100%" · "con los $X de entrega te queda asi" · `[cotizacion]` · "te sirve ese o tenias pensado otro?", con
  `aviso_grupo`; si no llega, la entrega inicial del parecido (sin decir cuánto falta; la insistencia cuenta para ese
  modelo); si lo paga entero, de contado y las dos preguntas del turno. Sin la entrega dicha, como antes (el parecido
  de contado). Es solo de reglas (*Modelos* y el ejemplo 19) y dos líneas en las descripciones de `buscar_equipos` y
  `cotizar`: el código ya cotizaba un modelo que el cliente no nombró y la guardia acepta sus montos (lo fijan tests
  nuevos). Casos 112 y 113 de la batería. Sin variables nuevas; cambian las reglas (hash `ccd866bd`, 181 líneas, ver
  `CAMBIOS-CEREBRO.md`); hay que reiniciar.
- **El stock de la app en la planilla (08/10/2026, rama `stock-planilla` sobre `ce866aa`; hecho por Claude;
  decisiones de Tomás del 08/10, parte 2 del diseño de escritorio del Cortex; segunda vuelta con los arreglos
  de la revisión):** la planilla del Cotizador es
  donde vive todo y la app la cambia por medio del bot. `src/stock-app.js`, cada 1 minuto: lee `v_stock_chiara`
  (migración 0018 de la app) y escribe lo del local en USADOS (sombra: en "USADOS APP", que crea si falta),
  con el código de la app como ID y la entrega mínima de LISTA; aplica las `planilla_ordenes` (SÍ/NO en la
  columna STOCK de LISTA y LISTA 85-93, lo del depósito; si Google falla quedan pendientes y se reintentan) y el
  espejo copia STOCK. En vivo, Chiara: local primero, las filas con STOCK = NO no se ofrecen, un modelo que
  está solo en el depósito se ofrece con `[deposito]` (la frase con el día la pone el código: "mañana" de lunes
  a jueves, "el lunes" de viernes a domingo), nunca TechSur ni "por encargo" (la guardia, solo en vivo), una
  unidad sin entrega mínima es solo de contado, y al escalar el 🔕 lleva "Equipo: 15P-128-001" o "Equipo:
  DEPÓSITO iPhone 15 Pro 128GB". **Todo detrás de `STOCK_APP_MODO` (`apagado` por defecto | `sombra` |
  `vivo`)**: con apagado la lectura de la planilla y la guardia son idénticas a las de antes, y con sombra
  Chiara contesta byte a byte como hoy. Ver *El stock de la app en la planilla*. Variable nueva, hay que
  reiniciar, y antes de `vivo` sumar la columna STOCK a LISTA y LISTA 85-93.
- **La foto en el historial, el canje de la ficha y `#sigue` que contesta (07/10/2026, rama `foto-historial-sigue`
  sobre `4e6947b`; hecho por Claude; decisiones de Tomás del 07/10):** (A) en un chat de Sonnet, cada foto sin
  epígrafe del cliente deja una línea `cliente: [foto]` en el historial, entre o no a la tanda: en la tanda
  siguiente Sonnet sabe que la hubo (la imagen no se vuelve a mandar). No cambia qué se contesta: la foto suelta
  sigue sin contestarse, y la línea no dispara el barrido del silencio, no frena el seguimiento ni cuenta para los
  datos viejos. (B) el canje que Sonnet anota en la ficha queda en el estado (`canjeFicha`) y va en lo que el
  sistema ya sabe ("canje que anotaste antes") durante 72 h. (C) **`#sigue` contesta**: en el chat o desde el
  grupo, si lo último del historial es del cliente (de menos de 72 h, con texto, no solo un ok o un gracias),
  Chiara está prendida y el chat lo atiende Sonnet, le contesta lo que dejó escrito por el camino del barrido del
  silencio (`origen: 'sigue'`); si no, solo reactiva, como antes. El `▶️ Reactivado` del grupo dice si le contesta
  o por qué no. Ver *Cerebro Sonnet: ve las fotos del cliente* y la tabla de comandos. Sin variables nuevas;
  cambian las reglas (hash `62e29962` junto con `turnos-dia-hora`, 175 líneas; `2784eecf` en su rama sola; ver
  `CAMBIOS-CEREBRO.md`); hay que reiniciar.
- **Sonnet ve las fotos del cliente (06/10/2026, rama `fotos-sonnet` sobre `9ca7485`; hecho por Claude; decisión
  de Tomás del 06/10, caso …7442):** en una tanda que contesta Sonnet en vivo, las fotos del cliente (hasta 3, las
  últimas, con o sin epígrafe) van al pedido como imágenes; lo que se ve en ellas cuenta como dato dado (las
  reglas, *Canje*: no repregunta la batería que vino en la captura). Una tanda de solo fotos en un chat de Sonnet
  la contesta Sonnet. La sombra, la sombra con persona y `#sonnet` no mandan imágenes. **Marca de canje (07/10,
  decisión de Tomás):** si Sonnet anota un canje en la ficha, el chat queda con `canjeSonnet` (la hora) y una foto
  sola entra a la tanda durante 72 h (`cerebro.canjeVigente`). Ver *Cerebro Sonnet: ve las fotos del cliente*. Sin variables nuevas;
  cambian las reglas (hash `bb2ae7ba`, ver `CAMBIOS-CEREBRO.md`); hay que reiniciar.
- **Lo que faltaba de Chiara (06/10/2026 a la noche, rama `chiara-cierre` sobre `4c08237`; hecho por Claude;
  decisiones de Tomás del 06/10):** (1) **caso 88:** si acepta la cotización sin decir cuál de las opciones
  ("dale", "dale, me lo llevo"), Sonnet pregunta en la misma respuesta si en 1 o en 2 cuotas y qué día se
  puede acercar; si eligió la opción ("las 2 cuotas"), solo el día, como antes. Cambian las reglas (hash
  `2b789996`, ver `CAMBIOS-CEREBRO.md`) y el caso 88 de la batería. (2) **`#apagar` / `#prender`** escritos
  por la cuenta en el grupo interno: el interruptor general de Chiara, igual que el botón del panel (de
  respaldo si no hay app); contestan en el grupo y dejan la noticia en el panel ("desde el grupo"). Con algo
  atrás (`#apagar 549…`) no cambian nada y explican que para un chat es `#pausa`. Ver la tabla de comandos.
  Sin variables nuevas; **hay que reiniciar**.
- **Cerebro Sonnet: entrega baja, paso 3, y el descuento sin repreguntar (06/10/2026, rama
  `ninjo-entrega-baja`, juntada en main sobre el panel Chiara y el bloque Ninjo 2; hecho por Claude; decisión de
  Tomás del 06/10):** a la tercera vez
  que la entrega no llega, `cotizar` resuelve con el conteo del estado, como el bot de siempre: si le faltan
  hasta $45.000, cotiza con la excepción (`excepcion: true`, el bloque y el PDF); si falta más, devuelve lo
  que sí se lleva con esa entrega (`con_esa_entrega`); si eso viene vacío, lo que paga entero con esa plata
  (`de_contado`, desde la rama `contado`, 06/10); si tampoco hay, escala. Las reglas dicen cómo presentarlo (sin
  recargo ni cuánto falta) y que un descuento con la entrega ya dicha no repregunta la entrega. Casos 105 a
  107 de la batería. Ver *Cerebro Sonnet: entrega baja, paso 3*. Sin variables nuevas; cambian las reglas
  (hash `c5c38a6b`, ver `CAMBIOS-CEREBRO.md`); hay que reiniciar.
- **Cerebro Sonnet: bloque Ninjo 2 (06/10/2026, sobre `d996fbf`, juntado en main sobre el panel Chiara; hecho
  por Claude; revisión de Ninjo del 05/10, puntos 3.1 a 3.3): ver lo que pasa.** No cambia nada de lo que se le dice al cliente. El registro
  de aprendizaje suma `silencio` (por qué una línea o una tanda se quedó sin respuesta) y `entrega` (cada
  mensaje que salió a un cliente, con el id de Evolution o el error); cada propuesta de Sonnet lleva la
  versión de las reglas (`sonnet.reglas`, el hash de `cerebro-reglas.md`; los cambios, en
  `CAMBIOS-CEREBRO.md`); `/salud` suma `config`, `cerebro.reglas`, `cerebro.gastoMes` (en `estado.json`,
  con un aviso al grupo al pasar el 80% de `CEREBRO_TOPE_MES_USD`) y `avisosGrupo`. Ver *Cerebro Sonnet:
  bloque Ninjo 2*. **Variable nueva (con default) y hay que reiniciar.** El gasto del mes lo contaban dos: este
  (`/salud`, `estado.json`, `CEREBRO_TOPE_MES_USD`) y el panel (`data/chiara.json`, `CHIARA_TOPE_MES_USD`). Desde el
  08/10/2026 es uno solo, este, con un solo tope (ver el primer punto).
- **Panel Chiara, lado bot (06/10/2026, rama `panel-chiara` en el worktree `wt-panel-chiara`, con `d996fbf`;
  decisiones de Tomás del 05 y 06/10):** `src/panel-chiara.js` sube cada 1 minuto el estado, los leads, el día y
  las noticias al Supabase de la app de ventas (su migración 0013) y aplica las órdenes del panel; el interruptor
  general (`src/interruptor.js`); cuenta solo los mensajes que salieron de verdad; el gasto de Sonnet del mes en
  disco (`data/chiara.json`, con la sombra); el anuncio de origen de cada lead (`npm run anuncios`); y Sonnet
  llena una `ficha` en `responder` y `escalar` (toca el cerebro: la batería del 06/10 dio 110 de 112, y los 2 que
  fallan fallan igual sin la ficha, 3 vueltas con main y 3 con la rama). Ver
  *Panel Chiara*. Primero se publica la app (0013), después se mergea y se reinicia el bot. Variables nuevas
  opcionales.
- **Arreglos de la prueba en vivo del 1b (06/10/2026, sobre `16707f9`, hecho por Claude con OK de Tomás):**
  el barrido del silencio y el seguimiento no toman a un contacto personal aunque su estado sea de antes de
  sumarlo a la lista; la entrega que lee el código saca los números del equipo ("85-93", "al 100",
  "pro max 256") antes de leer el monto (`sinNumerosDelEquipo`); la guardia frena un tab u otro caracter
  raro (`caracterRaro`). Ver *Arreglos de la prueba en vivo del 1b* en `AVANCE-AUDITORIA.md`.
- **Cerebro Sonnet: bloque Ninjo 1b (05/10/2026, sobre `368fe0f`, hecho por Claude; decisiones de Tomás del
  05/10):** el historial que lee Sonnet se completa con los últimos 30 mensajes de Evolution
  (`src/contexto.js`; `npm run probar-contexto` para mirarlo antes); se escalan solo los tratos de una
  persona de las últimas 72 h; cuando vence el silencio de una persona, la línea del cliente sin respuesta
  la atiende Sonnet (`revisarSilencios`); las dos listas de usados (`al_100`); la cotización en el bloque
  (`[cotizacion]`) y el PDF con el primer bloque; `que_me_alcanza`; un modelo que no hay con `parecidos` y
  📌 al grupo; `[lista]`; el canje de a una cosa; el seguimiento rehecho (apagado). Ver *Cerebro Sonnet:
  bloque Ninjo 1b*. **Hay variables nuevas para el `.env` (con valores por defecto) y hay que reiniciar.**
- **Sonnet en sombra donde atiende una persona (03/10/2026, sobre `0ba8f9e`, hecho por Claude; decisión de
  Tomás, por 7 días):** con `CEREBRO_SOMBRA_PERSONA_HASTA=AAAA-MM-DD`, en los chats que atiende una persona
  (los 45 minutos de silencio, `#pausa`) y en los escalados que callan, Sonnet piensa igual qué contestaría,
  **sin mandar nada ni tocar el estado**: queda `propuesta-sonnet` con `conPersona` en el registro, para
  compararlo con lo que contestaron. Ve el chat solo hasta la última línea del cliente; tope de US$1,5 por
  día. Ver *Sonnet en sombra donde atiende una persona*. **Hay que agregar la línea al `.env` y reiniciar.**
- **Cerebro Sonnet: reintento ante errores de red y `--desde` en la batería (03/10/2026, sobre `8ecf80d`):**
  la batería del 03/10 dio "fetch failed" en 88 turnos seguidos desde la PC (la red, no Sonnet: de los
  turnos que llegaron, pasaron 80 de 82). `llamarApi` reintenta una vez un error de red (a los 2 s, como
  un 5xx) y el error dice la causa (`ECONNRESET`, `ENOTFOUND`…). `npm run bateria-cerebro -- --desde 22`
  corre del caso 22 en adelante. Regla: lo que prometió una persona sobre un tema no frena una pregunta
  sobre otro ("mañana entran los 13" y pregunta por el 15 → contesta el 15). Caso 5: con dos 14
  distintos, preguntar cuál también vale.
- **Cerebro Sonnet, la guardia con una vuelta para corregir y 18 casos trampa de contexto (02/10/2026
  a la noche, sobre `e21cbe5`, hecho por Claude con Tomás afuera):** cuando la guardia frena lo que
  Sonnet quería mandar (5 mensajes, un monto sin puntos o que no salió de una herramienta, una
  promesa, "te falta"), Sonnet tiene UNA vuelta más para corregirlo: el `responder` vuelve como
  `tool_result` de error con el motivo (`textoDeCorreccion`); si vuelve a frenar, escala como
  siempre. Queda en el registro como `corregida: { guardia, frenados }`. La batería suma los casos
  46 a 63 (71 casos, 171 turnos), armados con los chats reales del 02/10: turno y reserva de una
  persona, cuota que pasó una persona, postventa sin historial, clienta pagando cuotas, acuerdo por
  Instagram, colores prometidos, precio especial de una persona, garantía en curso, accesorio,
  comparar modelos, cotización de una persona, publicación vista (no es acuerdo), seña, envío a
  Cipolletti, mensaje equivocado, financiación ya explicada y cliente que ya compró. Las reglas
  suman: escalar si quedó en algo con el negocio por otro lado, y no preguntarle qué modelo busca
  al que ya compró o está pagando cuotas.
- **Cerebro Sonnet, fase 2: contesta de verdad (02/10/2026, sobre `61bf345`, en el worktree
  `wt-fase2`, rama `cerebro-fase2`; sin commit todavía):** decisiones de Tomás del 02/10.
  `CEREBRO_MODO` suma `tester` (Sonnet le contesta de verdad al tester), `nuevos` (al tester y a
  los chats nuevos, que quedan marcados `atiendeSonnet`) y `todos`; los demás chats siguen con el
  bot de siempre y Sonnet en sombra. Sonnet va **en lugar de** `decidir`, con el saludo, el filtro
  de repetidos y el PDF del bot; un error de la API hace contestar al bot con un `⚠️` por racha.
  Cada respuesta avisa al grupo cuántos mensajes leyó (`🤖 Sonnet → …`; con `todos`, un resumen por
  hora). Comandos del grupo `#sonnet`, `#comparar`, `#bot` y `#sonnet-si`. Montos sin puntos
  frenan. `npm run bateria-cerebro`: 53 casos y 148 turnos contra la API de verdad (**gasta**). Ver
  *Cerebro Sonnet, fase 2 (contesta de verdad)*. **Hay que reiniciar el bot** y cambiar
  `CEREBRO_MODO` en el `.env` para que corra.
- **Cerebro Sonnet, fase 1 en sombra (01/10/2026; commit `a5b4895`, en sombra desde el 02/10 a
  las 11:08):** decisión de Tomás del 01/10: Claude Sonnet 5.5 va a decidir qué
  contestar, en lugar de las reglas de `responder.js`. En esta fase, con `CEREBRO_MODO=sombra`,
  Sonnet piensa con cada tanda real y queda anotado (`propuesta-sonnet`), **sin mandar nada**; con
  `apagado` (lo normal) no se llama nunca a la API. `npm run sombra` repite tandas reales. Ver
  *Cerebro Sonnet (fase 1, en sombra)*. Para prenderlo hace falta la clave en el `.env` y reiniciar.
- **Batería, sellado y contexto (01/10/2026, sobre `971dbdc`, en el worktree `wt-bateria`; sin
  commit todavía):** cinco cosas, decisiones de Tomás del 01/10. (1) **`#bateria 85-93`** desde
  el grupo: los usados salen de la pestaña `LISTA 85-93` (por ID; los sellados y el resto, de
  LISTA); `#bateria 100` vuelve a LISTA; queda en el estado y `/salud` lo muestra. La batería
  que dice el bot sale de `Bateria_min` tal cual ("85-93%"). Ver *La lista de usados
  (`#bateria`)*. (2) Los sellados dicen **"sellado"** donde iría la batería. (3) **Lo que dijo
  una persona de la cuenta** en las últimas 72 h se respeta: si el cliente sigue eso, escala
  callado con la frase (ver *Qué escala siempre a un humano*). (4) **Caso Jazz:** si pide el
  precio de dos modelos que ya había pedido pero nunca vio, van los precios. (5) Sin el
  **". tranqui"** pegado al final de lo que redacta Gemini. Ver su sección en
  `AVANCE-AUDITORIA.md`. **Hay que reiniciar el bot** para que corra, y hacer la prueba en vivo.
- **Arreglos en vivo (30/09/2026, sobre `edc2c3b`, en el worktree `wt-arreglos-vivo`; sin
  commit todavía):** tres cosas de la primera tarde con el bot en vivo para los chats nuevos.
  (1) **El PDF del compromiso no salió** en la prueba del tester: Evolution dio 500 en
  `sendMedia` ("Media upload failed on all hosts", Baileys no pudo subir el archivo a los
  servidores de media de WhatsApp). El diagnóstico (solo lectura) dice que es intermitente y
  no está en el bot: la misma imagen mandó ese mismo PDF con `SERVER_ACK` cuatro veces esa
  mañana y en días anteriores, hubo un solo fallo en 28 h de logs, y la red desde el contenedor
  anda; el motivo por host no se ve porque Baileys lo escribe en `warn` y Evolution corre con
  `LOG_BAILEYS=error`. Ver su sección en `AVANCE-AUDITORIA.md`. Mientras tanto, si el PDF no
  sale, además del pie va `📄 NO SALIÓ EL PDF` al grupo (ver *Avisos al grupo interno*).
  (2) **"¿Para cuándo me lo podés entregar?"** con Gemini contestaba la financiación
  (`consulta_general` + "entrega" en `respuestaFijaLocal`): ahora es el turno, lea lo que lea
  Gemini (`local.nosPideEntregar`). (3) **Gemini:** el principal pasa a `gemini-3.5-flash-lite`
  y el respaldo a `gemini-3.1-flash-lite`, y un 404 o un 429 por día del principal van al
  respaldo (ver *Los modelos de Gemini*). **Hay que reiniciar el bot** (y cambiar los dos
  modelos en el `.env`) para que corra, y hacer la prueba en vivo.
- **"¿Están reportados?" (30/09/2026, decisión de Tomás):** el bot contesta `no, ninguno esta
  reportado`, sin escalar ("reportado/s", "reporte", "denunciado/s", "con denuncia"). Hasta ahí
  escalaba callado. Como iCloud, es la respuesta sola: si en el mismo mensaje pregunta por un
  modelo, lo retoma el próximo mensaje. Caso "Desde cero 2 (13b)".
- **Financiación del 30/09/2026 (decisión de Tomás; commit `3739b83`):** 52/60 (plan
  Estándar) en CONFIG, sin precios manuales en LISTA, USADOS calculado siempre y sin el
  descuento de $10.000. Ver *Dos precios por modelo* y *Validación comercial*. **Hay que reiniciar
  el bot** para lo del código (la planilla ya rige).
- **Chat que entra con la lista atrasada (30/09/2026; commit `b9a1f1a`):** un chat que empezó
  sin el bot mirando (durante un corte o con el bot apagado) y vuelve a escribir antes de que la
  lista se ponga al día ya no queda nuevo: se anota la hora del primer mensaje que vio el bot
  (`sinMirar`) y, si Evolution tiene uno de antes, queda viejo. Cierra el segundo límite de la
  caída. Ver *Chats viejos*. **Hay que reiniciar el bot** para que corra.
- **Caída de Evolution con el bot andando (29/09/2026; commit `0c52ebf`):** si el guardián abre
  un corte (la instancia no dice `open`, o no entra nada por el webhook), la lista de chats viejos
  frena `alDia` en la última señal buena y queda atrasada (con `SOLO_CHATS_NUEVOS=true`, todo en
  borrador salvo el tester); a la vuelta espera 2 minutos y se pone al día con Evolution de `alDia`
  hasta ahora. Antes `alDia` seguía avanzando durante el corte y lo que pasó ahí no se miraba
  nunca. Ver *Chats viejos* y su sección en `AVANCE-AUDITORIA.md`. **Hay que reiniciar el bot**
  para que corra (sin volver a sembrar).
- **Chats desde cero (29/09/2026, decisiones de Tomás D1 a D12; commit `cc6b6ea`, merge `bca2932`):** el canje
  toma solo lo que habla de él y cuenta las fotos sin texto, el estado del equipo escala callado,
  lo ya dicho no se repite (escala), tarjeta de crédito e iCloud con respuesta fija, el modelo
  que falta ofrece el más parecido, un número menor a 100 nunca es entrega, el pedido del catálogo
  escala. Segunda vuelta (30/09, mismo commit): regresiones contra `543efba` con frases fuera de
  los 80 chats ("¿me podés entregar el 16?" no es canje, la confirmación del precio no se come su
  plata, "18 años" no es el 18, D4 no escala si le da lo mismo sellado o usado, iCloud al revés
  sin "sii", entre otras). Ver *Chats desde cero* y sus secciones en `AVANCE-AUDITORIA.md`. **Hay
  que reiniciar el bot** para que corra.
- **Chats viejos para `SOLO_CHATS_NUEVOS` (29/09/2026, decisión de Tomás; sin commit todavía):**
  un chat es nuevo solo si empezó desde cero con el bot mirando y nunca escribió nadie de la
  cuenta; todo lo demás es viejo y, con `SOLO_CHATS_NUEVOS=true`, va en borrador (el tester no
  cambia). Hasta acá miraba solo `estado.json`, que no tiene la mayoría de los chats reales: un
  cliente viejo que volvía a escribir era "nuevo". La lista vive en `data/chats-viejos.json`
  (`src/chats-viejos.js`): la siembra una vez `npm run sembrar-viejos` (el 29/09, 918 chats) y
  cada arranque se pone al día con Evolution. Ver *Chats viejos* (en *Modos, listas y
  candados*) y su sección en `AVANCE-AUDITORIA.md`. **Al reiniciar, en este orden:** frenar el
  bot, `npm run sembrar-viejos`, arrancar.
- **Chats sin número (`@lid`, 28/09/2026, decisión de Tomás; sin commit todavía):** si WhatsApp
  manda un chat con el identificador interno en vez del número (Evolution lo cambia por el número
  antes del webhook solo si el mensaje trae `remoteJidAlt`), el bot no lo procesa: no contesta, no
  guarda, no va a Gemini; avisa `📵 SIN NÚMERO` al grupo una vez por chat cada 24 h, con el nombre
  y la hora. Ver *Protecciones que no hay que sacar* y su sección en `AVANCE-AUDITORIA.md`. **Hay
  que reiniciar el bot** para que corra.
- **Los 3 errores reales de la muestra de repro-v1 (28/09/2026, sobre `e8f174e`, decisiones de
  Tomás del 28/09; sin commit todavía):** una entrega partida por forma de pago se suma ("tengo
  180 en efectivo y 120 en transferencia" son $300.000, no $180.000, lea lo que lea Gemini;
  `local.entregaPartida`); un número solo entre 50 y 100 ("90", "90%") después de que se le
  preguntó la batería, o con un canje en curso sin batería, es la batería de su equipo (queda
  en `permuta.bateria` y sigue el canje; sin canje en el estado escala callado), y un número
  solo menor a 100 nunca es una entrega aunque Gemini lo lea como plata; y un chat marcado
  `#vendido`, o donde la cuenta le cobra la cuota en el historial (`cobraLaCuota`), es
  postventa: todo lo que no nombre un modelo escala callado. Ver *Qué se lee como entrega*,
  *Qué escala siempre a un humano* y su sección en `AVANCE-AUDITORIA.md`. **Hay que reiniciar
  el bot** para que corra, y hacer la prueba en vivo.
- **En vivo para todos (27/09/2026, decisión de Tomás):** `NUMEROS_PILOTO=todos` hace que
  cualquier chat reciba los envíos (`config.pilotoTodos`, `esDestinoDePrueba`); el tester sigue
  siendo tester (comandos `#`, `LEADS_PRUEBA`, fuera del resumen). `/salud` muestra
  `numerosPiloto: "todos"` y el modo `en vivo para todos, con tester`. Test `(k)` en
  `lista-blanca.test.js`. Desde el 27/09 el bot le contesta a clientes reales.
- **Nunca mandó un mensaje real a un cliente.** Siempre corrió en `MODO_ESCUCHA` (así arranca
  `.env.example`); las pruebas en vivo del 16 y 17/09 fueron desde el celular de prueba.
  Antes de pasar a borrador, ver *Pendientes*.
- **Auditoría del 15/09/2026:** se implementa en 7 bloques. Lo hecho, cómo se verificó y
  las decisiones pendientes están en `AVANCE-AUDITORIA.md`.
- **Arreglo en vivo del bloque 10 (25/09/2026, sobre `d07eb08`):** con Gemini, "y el 13?" seguía
  nombrando el 14 Pro y el 15 Pro: Gemini trae en `modelos` los de la charla. Ahora lo que pregunta
  el mensaje es lo que nombra el texto (`local.extraerModelos`), o `info.modelo` si no nombra
  ninguno. Caso nuevo con `lectura` en `casos.js` (374 casos).
  Segunda tanda, misma causa (Gemini en vivo): "x?" y "13?" sin modelo de Gemini toman el del
  extractor local; "me quedo con ese que me recomendaste" mira lo ofrecido aunque Gemini traiga un
  modelo (salvo que el texto nombre uno); en un canje, un anterior al 11 que Gemini dejó como
  `modelo` es el del canje. 5 casos con `lectura` (379 casos).
- **Bloque 10 (25/09/2026, commiteado en `d07eb08`, sobre `cbd5104`): el modelo que pregunta, los
  ejemplos pendientes y lo visto en el bloque 8.** En la prueba en vivo del bloque 9,
  "tenes iphone 14 pro y 15 pro?" → "tengo 200.000" → "y el 13?" contestó un mensaje con los
  tres modelos. Decisiones de Tomás del 25/09: si la entrega que ya dio no llega para el modelo
  que pregunta, se habla solo de ese; el paso 3 de varios modelos dice "con los $X todavia no
  estamos para esos modelos"; los 3 ejemplos aprobados pendientes (llegó al local, solo el
  nombre, viene "un día de estos") con reglas generales, ya fijados (4 de 4); "de las 16" es
  una hora; sin Gemini, "x?" y "13?" son esos modelos; un monto en dólares no es una entrega en
  pesos (el aviso dice `US$420`); el canje de un anterior al 11 no pide datos; "me quedo con
  ese que me recomendaste" sigue con el que ofreció el bot, o escala callado si no se sabe cuál;
  y los anteriores al 11 no salen en nada que el bot ofrezca solo. Ver *Si dice el monto y
  varios modelos*, *Respuestas fijas*, *Qué escala siempre a un humano* y su sección en
  `AVANCE-AUDITORIA.md`. **Hay que reiniciar el bot** para que corra, y hacer la prueba en vivo.
- **Bloque 9 (24/09/2026, commit `cbd5104`; su prueba en vivo del 25/09 dio origen al bloque
  10): el saludo del día y una sola
  respuesta de entrega para varios modelos.** En la prueba en vivo después del bloque 8, tras
  un `#reset`, "buenass como estan tenes iphone 14 pro? 15 pro? tengo 200.000" no saludó y
  mandó un mensaje entero por modelo, con la explicación repetida. Decisiones de Tomás del
  24/09: el saludo va en la primera respuesta del día (hora de Argentina) si hoy nadie de la
  cuenta le escribió, y si pregunta cómo estamos lo contesta y lo devuelve; se decide en un
  solo lugar (`decidirYFormatear`). Si el monto no llega para varios modelos, un solo mensaje
  con la entrega de cada uno y la explicación una vez. Ver *El saludo del día* (en *Tono*) y
  *Si dice el monto y varios modelos*.
- **Bloque 8 (24/09/2026, commit `b5b43eb`; su prueba en vivo dio origen al bloque 9): falsos
  escalados, pagos, seña, modelos que no se trabajan y fotos.** `npm run reproducir` mostró que el bot escalaba
  mensajes reales por una "x" leída como iPhone X ("2 x 45", "x favor") y por una palabra
  suelta (accesorios, envíos, tarjeta). Decisiones de Tomás del 23 y 24/09: se aceptan
  dólares ("Sii, aceptamos dolares, se toma la cotizacion del dia", sin monto) y Mercado Pago;
  no se pide seña (se sigue con el turno); los anteriores al 11 no se trabajan, aunque estén
  cargados; y un pedido de fotos escala callado y el grupo contesta con `#sinstock <número>`,
  que le manda la foto de referencia. Ver *Respuestas fijas*, *Qué escala siempre a un
  humano* y *Fotos*.
- **Evolution y WhatsApp (24/09/2026, commit `876ae3b`):** desde julio de 2026 la 2.3.7 no
  vincula (Baileys no maneja `companion_reg_refresh`; la 2.4.0-rc2 tampoco). Corre una imagen
  propia, `evolution/Dockerfile`: la misma 2.3.7 con Baileys parcheado (fork no oficial
  `doryani-ai/Baileys#fix/companion-reg-refresh`) hasta que se mergee evolution-api#2727 /
  Baileys#2765. **Todo `docker compose` va con `--env-file .env.docker`**: sin eso
  `POSTGRES_PASSWORD` queda vacía y Evolution no entra a la base (`P1000`). WhatsApp se volvió
  a vincular el 24/09. Respaldo de la base antes del cambio: `C:\bot-whatsapp\respaldos\`.
- **Bloque 7 (23/09/2026, verificado y commiteado desde Cowork el 24/09/2026): ejemplos aprobados.** `npm run
  aprobar` muestra las respuestas reales de Tomi y Fran de a una y Tomás decide cuáles valen;
  van a `test/ejemplos-aprobados.json` (en git, texto limpio). Cada `buena` es un caso que
  `evaluar` corre y cuenta aparte: si el bot no la cumple queda pendiente y no rompe nada;
  `--fijar` marca las que ya cumple. **El bot no cambia solo.** Además, cada evento del
  registro lleva una clave por chat (HMAC con una sal local, `data/aprendizaje-sal`): los 4
  dígitos ya no alcanzaban para no mezclar chats. Ver *Aprender de cómo contestan Tomi y Fran*.
  No cambia lo que contesta el bot: no hay prueba en vivo.
- **Bloque 6 (23/09/2026, commit `adf9eb5`):** el aprendizaje es un registro de eventos
  (`data/aprendizaje-v2.jsonl`: `cliente`, `propuesta`, `humano`) y los ejemplos se arman al
  leerlo; la respuesta de una persona nunca se empareja con la tanda anterior (hallazgo B1). En
  escucha la tanda espera 20 a 45 s como en vivo. `npm run reproducir` pasa los mensajes reales
  por el bot de hoy. El registro viejo ya está archivado como `data/aprendizaje-v1.jsonl`.
  **Falta reiniciar el bot cuando vuelva WhatsApp** (está desvinculado de Evolution desde el
  22/09): ahí arranca `data/aprendizaje-v2.jsonl` y se crea la sal.
- **Pendientes 2 (21/09/2026, commit `17d0d2b`):** seis arreglos chicos que
  quedaban de la auditoría. El recordatorio del escalado no suena de noche; el seguimiento pasa
  por la misma guardia que las respuestas ("escribiendo…", espera, control y envío con `delay:
  0`); `noEntendido` y `sinVenta` cuentan solo si el mensaje le llegó; `resueltoPorHumano` fuera
  del resumen; fila nueva en LEADS cuando el contacto vuelve pasadas las 72 h; y el guardián
  cuenta solo los mensajes que entran (`ultimoEntrante`). Ver su sección en
  `AVANCE-AUDITORIA.md`. **Hay que reiniciar el bot para que corra.** Encima, `af6a67b`
  (22/09/2026): un escalado que calla le gana a uno de "no entendí".
- **Guardián de Evolution (21/09/2026, commit `e2debbb`):** tres cortes del 17
  al 19/09 en los que el bot seguía vivo pero Evolution no le entregaba ningún mensaje, y nadie
  se enteró. `src/guardian.js` avisa al grupo interno, una vez por corte y otra cuando vuelve;
  **no reinicia nada**. Reemplazó a la alerta de desconexión de `index.js`. Ver *Guardián de
  Evolution* y su sección en `AVANCE-AUDITORIA.md`. **Hay que reiniciar el bot para que corra.**
- **Pendientes 1 (20/09/2026, commit `7abdfd2`):** `modeloPropuesto` (el hilo
  en escucha y borrador), datos viejos por tiempo (`DATOS_VIEJOS_HORAS`), `NUMEROS_TESTER` y
  `NUMEROS_PILOTO` en vez de `NUMEROS_PRUEBA`, y los 3 hallazgos del 16/09 (typos de `#reset`,
  el "escribiendo…" lo hace el bot, con la entrega que cubre el contado solo la ficha). Ver su
  sección en `AVANCE-AUDITORIA.md`. `NUMEROS_TESTER` ya está en el `.env` (Tomás, antes del
  23/09/2026).
- **Suite verde:** `npm test` (37 archivos, 699 checks; con `lid` y `chats-viejos`) y `npm run evaluar -- --offline` (424
  casos, 686 turnos; al cerrar el bloque 10 eran 397 y 648) dan 100%; debajo, "Ejemplos aprobados: 4 de 4 cumplen · 0 pendientes",
  los 4 fijados (los 3 del primer lote que faltaban, "Estoy aca ya creo", "Mi nombre es
  Oriana" y "Un día de estos seguro me pegue una vuelta", se arreglaron y fijaron en el bloque
  10). En los tests que pasan por `index.js` aparece una línea `[escribiendo] no pude
  mostrar…` por archivo: es esperada, el `fetch` de mentira tira. (Al arrancar el bloque 10
  eran 639 checks, y 297 casos con 487 turnos.)
- **Último commit:** `cbd5104` (bloque 9), `bcde713` (ejemplos aprobados: primer lote de
  Tomás), `b5b43eb` (bloque
  8), `b12889a` (CLAUDE.md: Evolution con imagen propia), `876ae3b` (Evolution
  con Baileys arreglado), `a91a98e` (ajustes de `aprobar`) y el del bloque 7 (`204b104`,
  ejemplos aprobados). Antes, `adf9eb5`
  (bloque 6: aprendizaje por eventos), `af6a67b`
  (escalado que calla le gana a uno de "no entendí"),
  `17d0d2b` (Pendientes 2), `e2debbb` (guardián de Evolution), `7abdfd2` (Pendientes 1),
  `79b8e2b` (respaldos por hora del
  estado), `666a5d2` y `945cdc3`
  (Tono 1c), `5634dc7` (Ajustes 2, Tono y Tono 1b), `ca1e764` (bloque 5b: insistir con la
  entrega antes de bajar),
  `0a4e529` (bloque 5), `854a748` (Mejora 1b), `422cec0` (Mejora 1), `bd77210` (Ajustes 1b),
  `8b6e8ec` (Ajustes 1), `f52878f` (bloques 3, 3b, 4 y 4b), `7b201bc` (bloques 1 y 2) y
  `659d797`.
  **Commiteado:** el bloque 10 (`d07eb08`) y su arreglo en vivo. `test/ejemplos-aprobados.json` son las decisiones de Tomás
  con `npm run aprobar`: una sesión de código no lo toca, salvo `--fijar` cuando Tomás lo pide
  (bloque 10).
- **Hay decisiones esperando a Tomás** (direcciones en las notas y el armado de `web/`): ver
  *Pendientes*. Las fotos sin epígrafe en un canje se decidieron el 29/09 (D1): ver *Chats desde
  cero*.
- **Los modelos de Gemini (30/09/2026, decisión de Claude):** el principal pasa a
  `gemini-3.5-flash-lite` y el respaldo a `gemini-3.1-flash-lite` (el más barato, con su propio
  cupo); `gemini-2.5-flash-lite` sale. Lo del "16/10/2026" ya no figura en ningún lado. Ver
  *Los modelos de Gemini* (en *Variables de entorno*) y *Operativos*.

---

## Qué es

Bot que atiende las consultas de venta de iPhones en WhatsApp para **Somos iPhone NQN**
(Neuquén capital). Contesta stock y precio, acompaña al cliente hasta la cotización, y
cuando hay que decidir algo lo pasa a un humano (Tomás o Fran) por un grupo interno.

**Regla que sostiene todo el diseño: los precios NO los produce la IA.** Salen de la
planilla *Cotizador - Somos iPhone NQN* y los calcula `src/cotizador.js`. Gemini se usa
solo para entender lo que escribe el cliente y redactar lo que no lleva números.

Evolution API corre en Docker en la misma PC (`docker-compose.yml`); el bot es Node y
recibe los mensajes por webhook.

---

## Reglas para trabajar en este repo

- **No leer ni tocar `.env` ni `credenciales.json`.** `.env.example` sí. Si hace falta una
  variable nueva, se documenta en `.env.example` y se le pasa a Tomás para que la cargue.
- **No `git push`.** Commit solo cuando Tomás lo pide.
- **Conducta nueva: primero el diseño**, con las preguntas abiertas y una recomendación, y
  recién con la respuesta se implementa.
- **Toda conducta nueva lleva su caso** en `test/casos.js` (o un test propio si vive en
  `index.js`). `npm test` y `npm run evaluar -- --offline` tienen que quedar en 100%.
- Los scripts de diagnóstico que usen `state.js` se corren con `ESTADO_PATH` y
  `APRENDIZAJE_PATH` apuntando a archivos temporales: si no, escriben en `data/` real (y
  cargarlo sin `ESTADO_PATH` ya migró el estado real una vez, en el bloque 3). Y conviene
  correrlos desde otra carpeta: `config.js` carga el `.env` del directorio actual. Desde el
  bloque 6 **cada mensaje del cliente escribe un evento de aprendizaje**, no solo las
  respuestas de una persona: todo test que carga `index.js` fija `APRENDIZAJE_PATH` (lo
  revisa el check 10 de `test/aprendizaje.test.js`; `lista-blanca` no lo fijaba y escribió en
  `data/`). `evaluar`,
  `chatear` y `guion` ya apuntan solos a temporales (desde el 14/09/2026; antes `chatear`
  además borraba `data/estado.json` al salir). `resumen` y `destino` leen el estado real a
  propósito, **en modo solo lectura** (`ESTADO_SOLO_LECTURA=1`, desde el bloque 4): no
  escriben nunca, ni al salir. Para mirar el estado real desde un `node -e`, poner esa
  variable.
- **Solo `ENOENT` arranca vacío.** Si `estado.json` existe y no se puede leer (EBUSY, EPERM,
  EACCES), `state.js` reintenta, muestra el error y tira: el bot no arranca y no escribe nada.
  No hay que "arreglarlo" volviendo a tratar ese error como archivo inexistente: eso pisaba el
  estado real con `{}` (bloque 4b). Ver *Persistencia del estado*.
- `npm run chatear -- --offline` y `npm run guion -- --offline` congelan los precios pero
  **no apagan Gemini**: con clave, lo que se escribe sale a Google. Solo `evaluar --offline`
  corta la red.
- Ojo al editar regex con escapes de barra-u (el rango de tildes de `normalizar`): hay
  herramientas de edición que los convierten en el carácter invisible. La regex sigue
  andando pero no se puede leer. Se verifica con `grep -n "u0300-" src/*.js test/*.js`.

---

## Antes de tocar nada

```bash
npm run evaluar -- --offline     # 594 casos, 1068 turnos (02/10/2026) + las reglas globales. Tiene que dar 100%. Aparte, los ejemplos aprobados.
npm test                         # 53 archivos: cotizador, resumen, listas, audio, personales, lid, chats viejos, contexto, sin venta, recordatorios, silencio, entrega, notas, respaldo de Gemini, ventas, temas, no entiende, seguimiento, webhook, tandas, reset, seguridad, control, marcas, gemini, financiacion, persistencia, dedupe, audio-reintento, precio, turnos, redactar, validacion-comercial, guardian, aprendizaje, aprobar, fotos-pedido, saludo, desde-cero, pdf-fallido, techsur, cerebro, cerebro-vivo, fotos-sonnet, foto-historial-sigue, sombra-persona, bateria-cerebro, espejo-cotizador, panel-chiara, silencios-y-salud, stock-app, timeout-supabase, fotos-equipos
npm run chatear -- --offline     # charlar como cliente, para ver el tono
```

**Si tocás lógica o tono, corré `evaluar` antes y después.** El banco de casos existe
justamente para que arreglar una cosa no rompa otra: ya pasó varias veces y lo detectó al
instante.

---

## Comandos

### En WhatsApp, desde la cuenta del negocio

Se escriben **al principio** del mensaje. **El cliente ve lo que se escribe en su chat.**
Ninguno entra al historial ni al aprendizaje.

| Comando | Dónde | Qué hace |
|---|---|---|
| `#pausa` | chat del cliente, o el grupo con el número | El bot no le contesta más a ese chat hasta `#sigue`. |
| `#sigue` | chat del cliente, o el grupo con el número | Reactiva el chat: borra la pausa, el escalado y la marca de "humano atendiendo". Desde el 07/10/2026 (decisión de Tomás) **le contesta lo que dejó escrito** si lo último del historial es del cliente (de menos de 72 h, con texto y no solo un ok o un gracias), Chiara está prendida (ni escucha ni borrador) y el chat lo atiende Sonnet: va por el camino del barrido del silencio (`origen: 'sigue'`; Sonnet contesta, o escala si sigue un trato de una persona). Si no, solo reactiva, como antes. No marca a una persona (`ultimoHumano`). |
| `#reset` | chat del cliente | Borra todo lo guardado de ese chat y su recordatorio: queda como nuevo. Lo que esperaba tanda no se interpreta, y una tanda que ya estaba interpretando o mandando no manda ni anota nada más. |
| `#recordar <texto>` | chat del cliente | Recordatorio al grupo interno cada hora hasta `#hecho`. Ver *Recordatorios*. |
| `#hecho` | chat del cliente | Cierra el recordatorio de ese chat. |
| `#vendido` | chat del cliente, o el grupo con el número | Anota el chat como venta cerrada, con la fecha. Ver *Ventas y pérdidas*. |
| `#perdido` | chat del cliente, o el grupo con el número | Anota el chat como perdido, con la fecha. |
| `#apagar` · `#prender` | solo el grupo | El interruptor general de Chiara (06/10/2026), igual que el botón del panel: apagada no le contesta a ningún cliente (ver `src/interruptor.js`). Contesta en el grupo `⏸️ Chiara APAGADA desde el grupo` / `▶️ Chiara PRENDIDA desde el grupo`, o que ya estaba así; queda en disco y en el panel. También vale `#prender chiara`; con un número atrás no hace nada (para un chat, `#pausa`). |
| `#sinstock <número>` | solo el grupo | El cliente pidió fotos y no hay stock para sacarlas: le manda la foto de referencia de cada modelo que pidió, sola y sin texto. El chat sigue escalado. Ver *Fotos* (bloque 8). |
| `#bateria 85-93` · `#bateria 100` · `#bateria` | solo el grupo | Qué lista de usados usa el bot (01/10/2026): `85-93` es la pestaña `LISTA 85-93` (cualquier `X-Y`, la pestaña `LISTA X-Y`; también `#batería`, `85 93` y `85 a 93`); `100` es LISTA, como siempre; solo, dice cuál está activa. Ver *La lista de usados (`#bateria`)*. |
| `#sonnet <número>` | solo el grupo | Qué le contestaría Sonnet a ese chat **ahora** (lee las últimas 30 líneas y las de una persona): contesta en el grupo `🧠 A <nombre> le contestaría: …` (o `🧠 Escalaría: …`), con cuántos mensajes leyó y lo que costó. Al cliente no le manda nada y no toca el estado. Con cualquier modo menos `apagado`. Ver *Cerebro Sonnet, fase 2*. |
| `#comparar <número>` | solo el grupo | Las últimas 3 tandas de ese chat según el registro: lo que escribió el cliente, lo que contestó el bot (o Sonnet en vivo) y una persona, y lo que propuso Sonnet en sombra; si no hay propuesta de Sonnet para una tanda, lo dice. |
| `#bot <número>` · `#sonnet-si <número>` | solo el grupo | Saca o pone ese chat de los que atiende Sonnet (`atiendeSonnet`), en cualquier modo; confirma en el grupo. |

`#recordar` o `#hecho` escritos **en el grupo**, `#vendido` o `#perdido` en el grupo sin un
número, o `#recordar` sin texto, no hacen nada: el bot contesta en el grupo cómo se usan.
`#vendido 5492990000000` en el grupo sí marca el chat de ese número (sirve pegar el `wa.me`
del resumen).

`#pausa 5492990000000` y `#sigue 5492990000000` en el grupo hacen lo mismo que en el chat, con
la ventaja de que **el cliente no ve el comando** (desde el 15/09/2026). Buscan el chat con la
misma comparación que `#vendido`: sin número, con uno que no parece un teléfono, con un
contacto personal, sin ningún chat o con varios, contestan por qué y no tocan nada. Desde el
07/10/2026 el `▶️ Reactivado` dice si le contesta lo que dejó escrito ("… y le contesto lo que
dejó escrito") o no, con el motivo ("…; le contesto cuando vuelva a escribir (lo último es de una
persona)"; los otros: más de 72 h, Chiara apagada, lo atiende el bot de siempre, un ok o un
gracias, sin texto, nada sin contestar, modo escucha o borrador, fuera de las listas de prueba).
Con una tanda en curso dice "… y ya le estoy contestando lo que escribió" (esa tanda contesta,
una sola vez). La tanda de `#sigue` arranca enseguida y su primera acción es la espera de
siempre: el aviso sale antes, y lo que escriba el cliente mientras tanto entra en la misma tanda.
El `#sigue` del chat del cliente no avisa al grupo.
`#sinstock` usa el mismo camino (`control.comando`, `control.desdeGrupo` y
`ventas.elegirChatDesdeGrupo`); sin número, o sin un pedido de fotos pendiente en ese chat,
contesta cómo se usa y no manda nada. `#sonnet`, `#comparar`, `#bot` y `#sonnet-si` (fase 2 del
cerebro, `src/cerebro-comandos.js`) también: solo desde la cuenta, en el grupo, con el número
como `#sigue`.

### En WhatsApp, desde el celular del tester (solo `NUMEROS_TESTER`)

Desde el 15/09/2026, para probar en vivo desde otro celular sin tocar la cuenta del negocio.
Desde Pendientes 1 (20/09/2026) la lista se llama `NUMEROS_TESTER` y es solo el celular de
prueba; los clientes reales de la prueba van en `NUMEROS_PILOTO` y para ellos nada de esto
aplica (ver *Modos, listas y candados*).

| Comando | Quién | Qué hace |
|---|---|---|
| `#reset`, `#resset`, `#reseet`, `#rest` | un número de `NUMEROS_TESTER` | Lo mismo que el `#reset` de la cuenta (estado, recordatorio, cola y tanda en curso) y además le contesta `🔄 Reiniciado`. Los typos son los de la prueba en vivo del 16/09/2026, que se habían tomado como mensajes de venta. |
| cualquier otro `#…` | un número de `NUMEROS_TESTER` | Se descarta con un log `[tester]`: no entra al historial, ni a la tanda, ni al aprendizaje, y no se contesta. |

- **Solo si el chat está en `NUMEROS_TESTER`.** Se compara con `estaEnLaLista`, no con
  `esDestinoDePrueba`: esa deja pasar a todos cuando las listas están vacías. Con la lista
  vacía no funciona para nadie, y para un piloto o cualquier número de afuera un texto que
  empieza con `#` es un mensaje común (entra al historial y se interpreta).
- Se corta antes del historial, la tanda y el aprendizaje, y no distingue mayúsculas.
- `🔄 Reiniciado` sale al instante, sin el ritmo humano, y también en `MODO_BORRADOR` (en
  `MODO_ESCUCHA` no sale, pero el reset se hace igual). No se anota en el historial ni en
  `botEnvio`. Su eco (vuelve por el webhook como mensaje propio) se reconoce y se ignora: si
  contara como una persona contestando, callaría al bot 45 minutos en ese chat.

### npm

| Script | Qué hace |
|---|---|
| `npm start` / `npm run dev` | Levanta el bot (`dev` con recarga). |
| `npm test` | Los 53 archivos de tests unitarios. Tiene que dar todo OK. |
| `npm run evaluar -- --offline` | El banco de casos, y aparte los ejemplos aprobados. `-v` muestra cada conversación; `--solo-aprobados`, solo los ejemplos. Sin `--offline` usa Gemini con los precios congelados (desde el 28/09); `--planilla-en-vivo`, con la planilla de hoy. |
| `npm run chatear -- --offline` | Chatear con el bot por consola. |
| `npm run guion` | Corre conversaciones enteras de una. |
| `npm run aprender [-- 50 \| -- --todos] [-- --archivo <ruta>]` | Dónde el humano contestó distinto que el bot, por ejemplo (una respuesta humana entera). Marca los incompletos. Con `--archivo` lee otro, también del formato viejo. |
| `npm run reproducir [-- --archivo <ruta>]` | Pasa los mensajes reales por el bot de hoy y lo compara con lo que contestó la persona. Resumen con cantidades e informe en `data/reproduccion-AAAA-MM-DD.md`. Sin red; `--gemini --si` usa Gemini (cuesta tokens). |
| `npm run sombra [-- --desde AAAA-MM-DD --hasta AAAA-MM-DD --max 20]` | Tandas reales del registro contra el cerebro Sonnet: informe en `data/sombra-AAAA-MM-DD.md` con lo que contestaría, la guardia, los tokens y los USD. **Gasta** (usa `ANTHROPIC_API_KEY`). `--planilla-en-vivo`, `--archivo`, `--informe`. Ver *Cerebro Sonnet (fase 1, en sombra)*. |
| `npm run bateria-cerebro [-- --solo <texto> --max <n>]` | La batería del cerebro Sonnet (fase 2): las conversaciones de `test/bateria-cerebro-casos.js` contra `cerebro.contestar`, turno por turno como en vivo, con chequeos automáticos. Informe en `data/bateria-cerebro-AAAA-MM-DD.md`. **Gasta** (usa `ANTHROPIC_API_KEY`). `--planilla-en-vivo`, `--informe`. Ver *Cerebro Sonnet, fase 2*. |
| `npm run aprobar` | Las respuestas reales de Tomi y Fran de a una, para aprobarlas o descartarlas (bloque 7). Guarda en `test/ejemplos-aprobados.json`. `-- --contar` cuántos hay; `-- --fuente v1\|v2`; `-- --fijar` marca los que el bot ya cumple; `-- --revisar <id>` vuelve a decidir uno. Solo lee el registro. |
| `npm run resumen` | Muestra el resumen de la mañana con el estado real, sin mandarlo. Solo lectura: no escribe el estado. |
| `npm run destino` | Dice a dónde irían los avisos y si algo los frena. Correrlo antes de encender avisos. Solo lectura. |
| `npm run sembrar-viejos [-- --simular]` | La semilla de la lista de chats viejos (`data/chats-viejos.json`, ver *Chats viejos*): lee la base de Evolution y los `lid-mapping` con `docker exec` (solo lectura) y `estado.json` como JSON. Se corre **con el bot frenado** (si algo escucha en el puerto del bot, no escribe). `--simular` imprime el resultado y no escribe nada. |
| `npm run probar-contexto -- 549XXXXXXXXXX` | Lo que el cerebro le traería de Evolution a Sonnet para ese chat (bloque Ninjo 1b): cuántos registros, si todos son de ese chat y las últimas 30 líneas con sus etiquetas. Solo lectura: no carga `state.js` ni escribe nada. Se corre desde la carpeta del bot (usa el `.env` y `data/chats-viejos.json`). |
| `npm run techsur [-- --probar "texto" \| --recargar \| --desde-evolution \| --grupos]` | Los precios de TechSur: sin nada, cómo se leyeron los últimos 10 avisos de `data/techsur.jsonl`; `--probar`, cómo se lee un aviso pegado; `--recargar` vuelve a leer los avisos de los últimos 7 días con el parser de hoy y los reescribe en `precios_proveedor` (escribe en Supabase). Ver *Precios de TechSur*. |
| `npm run margenes` | Qué termina pagando el cliente con cada base de precio. |
| `npm run probar-planilla` | Prueba la conexión con la planilla. |
| `npm run simulador` | Arma el simulador y el entrenador para el navegador (`web/`). |

**El script de `npm test` lista los archivos a mano**: un test que no está ahí no corre
nunca. Así estuvo `test/webhook.test.js` hasta el 15/09/2026, tapando dos bugs reales, y
`test/gemini.test.js` (qué sale hacia Google) hasta el bloque 3, que lo sumó a la lista.

---

## El flujo de venta, en orden

1. **Consulta de stock** → `Sii, tenemos en stock iPhone 13 128GB 100%, igualmente tenemos
   del 11 al 18 Pro Max` + `Lo tenemos en $495.000 de contado` + `Tenias solo interes por el
   13 o tenias pensado otro modelito?` — acá **todavía no se habla de cuotas ni de entrega**.
2. **Nombra un segundo modelo** → los precios van **juntos**, con una antesala (`buenisimo,
   te paso el 13 y el 14 Pro, igualmente tenemos del 11 al 18 Pro Max`; con tres o más, con
   comas) y la garantía antes del número. Si después no elige y escribe otra cosa, se le
   pregunta por esos (`decime cual te gusto mas, el 13 o el 14 Pro, y con cuanto contas para
   la entrega asi te armo los numeros`), **nunca** `contame que estas buscando`.
3. **Elige un modelo** → foto de referencia (si hay en `fotos/`) + `te paso una foto de
   referencia` (bloque 8; antes "te paso fotos del equipo asi lo ves bien") + `contame como tenias pensado pagarlo, tenemos
   contado y tambien lo financiamos hasta en 2 cuotas con una entrega inicial del X%`.
   El porcentaje se calcula de la planilla para ese modelo: nunca es un número fijo.
4. **Dice cuotas** → si la financiación todavía no le llegó, primero cómo es
   (`explicaFinanciacion`) y el compromiso de pago en PDF con `pieCompromiso`; después desde
   dónde arranca la entrega de ese modelo y se le pide el presupuesto (4 mensajes). Ver *La
   explicación de la financiación*.
5. **Dice contado** → se le confirma el precio, **se le pregunta qué día se puede acercar**
   y escala. Nunca "ahi te confirma fran".
6. **Da el monto** → cotización con la plantilla única: el equipo, la entrega, 1 pago y 2
   pagos, **sin el precio de contado** (Ajustes 1; ver *El precio de contado*). Si la
   financiación no le llegó, la tanda es explicación · PDF · "te lo llevas" · cotización, sin
   "ahora te cotizo". **Si la entrega paga el equipo entero, solo la ficha con el precio de
   contado: sin "te lo llevas" (Pendientes 1, D3), sin explicación, PDF ni requisitos**
   (Ajustes 1b). Si además dice que es su primer iPhone y la explicación va adelante, el
   tercero es `primerIphoneRetira` (primer iPhone + "te lo llevas" en un mensaje, bloque
   4b). Si pregunta cuánto sale, el precio va dentro de ese "te lo llevas". El PDF
   (`documentos/compromiso-de-pago.pdf`) sale una sola vez por chat.

Si nombra contado **y** cuotas en el mismo mensaje, **gana cuotas**: es la opción que hay
que explicarle.

**Si pregunta cómo son las cuotas** antes de decir cuánto tiene, se le explica y se sigue
la venta desde donde esté: ver *Respuestas fijas*.

**El rango `igualmente tenemos del 11 al 18 Pro Max`** (desde el 29/09/2026, D8: fijo en el 18
Pro Max) va solo al pasar precios **sin
entrega declarada**: en la lista, con un modelo y con varios. No va si ya dijo cuánto tiene
(cotización, `ENTREGA_BAJA`, "con esa entrega el mejor que te llevas") ni si repite un modelo
ya mostrado. Es texto fijo, definido una sola vez: **`RANGO_MODELOS` en `src/responder.js`.
Hay que cambiarlo ahí cuando cambie el stock.** No sale de la planilla a propósito: el más
barato de LISTA no es el más viejo que hay (el 11 está en USADOS). Hasta el 15/09/2026 la
lista calculaba su propio rango ("todos los modelos del 13 al 17 Pro Max").

## Dos precios por modelo

En la planilla, cada modelo tiene (o puede tener) **dos** precios:

| Columna | Qué es | Quién la ve |
|---|---|---|
| `Precio_contado` | Lo que paga el cliente en efectivo. | El cliente. Es el precio que se le dice. |
| `Precio_cotizacion` | La base con la que se calculan las cuotas. Va unos miles por encima del contado. | Nadie. Es interna. |

`cotizar()` usa `Precio_cotizacion` como base del saldo; si está vacía o en cero, usa el
contado y el resultado es idéntico al de siempre. **El contado que se le dice al cliente
nunca cambia.** `npm run margenes` muestra qué termina pagando el cliente con cada base.
**Los números los decide el negocio, no el bot ni la IA.**

**+$10.000 a cada pago financiado** (Ajustes 2, decisión de Tomás del 17/09/2026). Cuando el
pago sale de los coeficientes, después del redondeo se le suma `EXTRA_POR_PAGO` ($10.000,
`src/cotizador.js`): al pago único y **a cada una** de las 2 cuotas, no repartido. Vale igual
con el recargo de bajo mínimo. Los precios manuales (`Pago_unico_manual` / `Cuota_2_manual`
de LISTA, solo con la entrega exacta en el mínimo) van tal cual, sin sumar nada; el contado no
cambia; la cuenta del `ahorro` compara contra el mínimo con el mismo extra.

**Financiación del 30/09/2026** (decisión de Tomás, `negocio/financiacion.md` del Cortex). El
bot cotiza siempre con el plan Estándar de la calculadora Cuotas: **1,52 en 1 pago y 1,60 en 2
cuotas** (`Coef_1_cuota` / `Coef_2_cuotas` de CONFIG; si faltan, esos mismos en `sheets.js`),
con el redondeo para arriba al mil, los +$10.000 por pago y la tolerancia de $45.000 con +0,15
(1,67 / 1,75). Hasta ahí eran 1,26 y 1,35. El 30/09 Claude dejó la planilla así: CONFIG en 1,52 y
1,60; LISTA sin precios manuales (se borraron los 12, hechos con 26/35: el que ponía justo el
mínimo pagaba menos que el que ponía más; los valores viejos están en `AVANCE-AUDITORIA.md`); y la
LEEME con los números nuevos. En USADOS, `Pago_unico` y `Cuota_de_2` son fórmulas de la planilla
(sin los $10.000): desde el 30/09 el bot no las toma como manuales y calcula siempre. Sin
descuento (ver *Validación comercial*). `test/fixture-planilla.js` sigue siendo la copia del
08/09, con 1,26 y 1,35 y sus manuales: las cuentas de 52/60 las prueba `test/cotizador.test.js`.
Con el 13 de la planilla congelada (contado $495.000, mínimo $320.000, manuales
$221.000 / $140.000): 320.000 → los manuales; 321.000 → $230.000 / $128.000; 300.000
(recargo) → $285.000 / $157.000; 290.000 → $300.000 / $164.000; 280.000 → $314.000 /
$172.000. Lo prueba `test/cotizador.test.js`.

## La lista de usados (`#bateria`, 01/10/2026)

Decisión de Tomás del 01/10/2026. En la planilla hay dos pestañas con la misma forma (ID, Modelo,
Capacidad_GB, Condicion, Bateria_min, …, Precio_contado, …, Anticipo_min, …, Cotizable, Notas;
encabezados en la fila 4): **`LISTA`** (los usados al 100% y todos los sellados) y **`LISTA
85-93`** (solo los usados, con sus precios y entregas mínimas). Tomás elige desde el grupo:

- **`#bateria 85-93`**: cada fila de LISTA que tiene el **mismo ID** en `LISTA 85-93` se
  reemplaza por la de `LISTA 85-93`; todo lo demás (sellados, 18 Pro, 18 Pro Max, 16 sellado) sale
  de LISTA. Una fila de `LISTA 85-93` con un ID que no está en LISTA (o sin ID) también entra.
  Los ID se comparan sin espacios ni mayúsculas. Vale para cualquier `X-Y`: la pestaña `LISTA X-Y`.
  Antes de cambiar el bot lee esa pestaña: si no existe o no tiene filas con modelo, contesta por
  qué (`❓ La pestaña LISTA 70-80 no existe en la planilla. No cambié nada: sigo con …`) y no
  cambia nada. Contesta `🔋 Usados con LISTA 85-93 (9 modelos). Sellados y el resto, de LISTA.`
- **`#bateria 100`**: todo de LISTA (`🔋 Usados con LISTA (al 100%).`). Sin ningún `#bateria`
  mandado, también. **`#bateria`** solo contesta cuál está activa. Cualquier otra cosa después
  (`#bateria 90`, `#bateria hola`) contesta cómo se usa y no cambia nada.
- **Solo desde el grupo**, como `#sinstock` (`bateria.comando` en el bloque del grupo de
  `index.js`). En el chat de un cliente no es un comando.
- **Se guarda** en el estado, bajo la clave interna (`state.listaBateria` /
  `guardarListaBateria`, con `guardarYa`): sobrevive a un reinicio y `#reset` no la toca. Al
  cargarse, `src/bateria.js` se la pasa a `sheets.usarListaBateria`, que invalida la caché.
  **`/salud`** la muestra en `listaBateria` (`"LISTA"` o `"LISTA 85-93"`).
- **Lectura** (`sheets.js`): la pestaña `LISTA X-Y` se lee **aparte y solo cuando está activa**
  (`values.get`, después del `batchGet` de CONFIG, LISTA y USADOS): una pestaña que no existe no
  rompe esa lectura. Si con una activa falla (no existe, sin filas con modelo, error de Google),
  el bot sigue con LISTA sola y avisa una vez al grupo: `⚠️ No pude leer LISTA 85-93: cotizo con
  LISTA` (se rearma cuando se lee bien o se elige otra). USADOS no cambia: cada unidad sigue con
  su batería real.
- **La batería que dice el bot sale de `Bateria_min` tal cual** (`bateria_texto`, sin el "%"):
  `85-93` → "85-93%", `85-90` → "85-90%", `100` → "100%". Hasta el 01/10 `aNumero("85-93")` daba
  85 y el bot decía "85%". `bateria_min` sigue siendo el número (el primero del rango) para
  cualquier cuenta. Lo arma `bateriaDe` (`src/cotizador.js`) para todos los que dicen la batería
  de una fila: la plantilla de la cotización, `detalleDe`, `lineaDePrecio` (la lista), "sí lo
  tenemos", varios modelos, el más barato o el más caro, "otras opciones" y "no me está
  quedando" (`conBateria` en `src/responder.js`). Vacía o en 0, no se muestra, como siempre.
- **"sellado"** (decisión de Tomás del 01/10): toda fila con `Condicion` sellado lleva la
  palabra donde iría la batería: `Ip 16 128gb 100% 1.050.000` / `Ip 16 128gb sellado 1.450.000`,
  `Sii, tenemos en stock iPhone 17 128GB sellado`, `📱 *iPhone 17 128GB — sellado*`. No cambia
  cómo elige: "¿tenés el 16?" sigue dando el más barato (el usado) y preguntar por sellado sigue
  escalando callado.
- **Prolijidad:** `Condicion` y `Modelo` se comparan sin espacios de más ni mayúsculas ("sellado "
  es "Sellado"), y el modelo se muestra prolijo (`modeloProlijo`: "Iphone 18 pro max" → "iPhone
  18 Pro Max"; también en USADOS).
- Con la copia congelada (`test/fixture-planilla.js`) las pestañas van en `pestanas` (hay una
  `LISTA 85-93` de prueba) y la copia queda aunque se invalide la caché. Lo prueban
  `test/cotizador.test.js` (la mezcla con una planilla de mentira), `test/control.test.js` (el
  comando) y los casos "Batería (01/10)" y "Sellado (01/10)".

## El precio de contado (Ajustes 1)

Decisión de Tomás del 16/09/2026: **la cotización no muestra el precio de contado.** El
precio se dice solo si el cliente lo pregunta; si pregunta por las cuotas y no por el precio,
el precio no aparece. `precio_contado` sigue siendo la base de todo cálculo y `cot.contado`
sigue en el objeto de `cotizar`: solo deja de mostrarse.

- **`plantilla`** (`src/cotizador.js`): encabezado (📱 modelo, capacidad, batería) · "Con una
  entrega de $Y:" · "1 pago de…" · "2 pagos de… cada uno". Sin la línea `Contado: $X`.
- **`plantillaVarias`**: cada bloque, el detalle (capacidad, batería, color) y los pagos, sin
  "*$X* contado".
- **La entrega alcanza para pagarlo entero (`soloContado`)**: sí va el precio, que es lo que
  tiene que pagar, sin cuotas y con texto humano (`pagaDeContado` en `src/estilo.js`, 3
  variantes: "con eso lo pagas de contado, el iPhone 14 Pro esta $800.000"). También en el
  bloque de `plantillaVarias`. Con `soloContado` (con varias unidades, todas) no va la
  financiación: ver *Paga de contado (Ajustes 1b)*.
- **Pregunta el precio** (`preguntaPrecio` en `src/responder.js`): "cuanto
  sale/salen/esta/estan/cuesta/cuestan/vale/valen" (con "me", "te", "lo"… en el medio),
  "precio(s)" o "valor(es)", sin tildes. **No cuenta** si lo que sigue hasta la próxima pausa
  (`? ! . , ; :`, salto de línea, " y ", " o ", " pero ") habla de cuotas, pagos, la entrega,
  el anticipo, la financiación, interés, seña, saldo, diferencia, resto o lo mensual: "cuanto
  sale cada cuota", "que precio tiene la cuota", "cuanto me sale en cuotas". "cuanto quedan
  las cuotas" y "cuanto es la entrega" no entran nunca. No se reusa `consulta_precio`: es una
  intención por mensaje (con monto, el extractor local devuelve `declara_entrega`) y su patrón
  toma también las preguntas por cuotas.
- **Dónde va el precio cuando lo pregunta** (aunque ya se le haya mostrado ese modelo):
  - cotización normal: dentro de "te lo llevas" (`puedeRetirarConPrecio`, o
    `primerIphoneRetiraConPrecio` con el primer iPhone), la tanda sigue en 4. Si en el chat ya
    se cotizó ese modelo con otro monto, "te lo llevas" sale igual para llevar el precio. Con
    varias unidades del modelo, "desde $X". Con `soloContado` no se repite: ya lo dice la
    cotización;
  - ya cotizado ese modelo con ese monto: `yaCotizadoConPrecio`;
  - "con esa entrega el mejor que te llevas es el X" y "con eso el que te conviene es el X":
    ", esta $Y" pegado a esa frase.
- **No cambian** las ramas que dan solo el precio porque el cliente lo pidió o para presentar
  el equipo: stock (`precioDeEse`), la lista de precios, varios modelos, entrega baja
  (contado y mínimo), "de contado" (paso 3b), el más barato o el más caro.
- `analizarConversacion.yaCotizamos` reconoce la cotización por el 📱 (y por "contado:", las
  de antes que siguen en los historiales). La regla global de `evaluar` pide 1 pago y 2 pagos
  sin el contado, o solo el precio "de contado" si le alcanza.
- Lo prueba `test/precio.test.js`.

## Cuando la entrega no llega al mínimo

**Al cliente nunca se le dice cuánto le falta**, en ningún camino. Tampoco que "no alcanza"
ni que hay un recargo.

**Primero se insiste con la entrega; el recargo es el último recurso** (bloque 5b, decisión
de Tomás del 16/09/2026 tras la prueba en vivo del bloque 5: "quiero un iphone 13 y tengo
280.000" se cotizó directo con recargo, y no es lo que hace él: primero dice la entrega que se
pide y espera que el cliente la ponga o suba). Con la entrega bajo el mínimo de un modelo
**que nombró el cliente**, falte lo que falte:

1. **Primera vez** → el bot no cotiza. Dice la entrega inicial de ese modelo, sin pregunta,
   sin el precio de contado y sin la diferencia. Desde el **Bloque Tono** (17/09/2026, tras la
   prueba en vivo: "Para el 13 la entrega inicial es de $320.000" era correcto pero seco) la
   línea tiene dos partes, retoma el monto que dijo el cliente y cierra con una razón o un
   beneficio: `mira, con los $280.000 al 13 todavia no llegamos, para retirarlo lo estamos
   pidiendo con $320.000 de entrega inicial. lo que queda lo haces en 1 o 2 cuotas, y cuanta
   mas entrega pongas mas comodas te quedan` (`entregaInicial` en `src/estilo.js`, 3
   variantes con el vocabulario de los chats reales; **nunca termina con una pregunta**,
   decisión de Tomás; si no hay monto del cliente, sale sin esa parte). La variante la elige el
   conteo: la primera vez la 0 o la 2 según el modelo, la segunda siempre la 1. Si la
   financiación todavía no le llegó, la explicación y el PDF van antes, como en la
   cotización: explicación · PDF · línea. **Con varios modelos que no llegan, una sola línea**
   con la entrega de cada uno (bloque 9, `entregaInicialVarios`): ver *Si dice el monto y
   varios modelos*. **Si después pregunta por otro modelo ("y el 13?") y la entrega que ya
   dio no le llega, solo ese** (bloque 10), con su propio conteo: ver la misma sección.
2. **Segunda vez**, si sigue sin llegar (otro monto bajo, el mismo, "no llego", "no tengo
   más", "no me alcanza", un "no" suelto) → otra vez la entrega inicial, con la variante
   explicativa (por qué la pedimos y qué pasa después): `te cuento como es, para el 13
   pedimos por lo menos $320.000 de entrega inicial, es lo que nos deja financiarte el resto
   en 1 o 2 cuotas. con los $290.000 todavia no estamos ahi, pero cuando llegues a esa entrega
   lo organizamos y te lo llevas`. "¿Cuánto le tengo que agregar?" se contesta con la entrega
   inicial, nunca con la resta, y cuenta como insistencia.
3. **Después de dos insistencias confirmadas**, si sigue sin llegar, con el **último monto**:
   - faltan hasta **$45.000** (`TOPE_BAJO_MINIMO`, `src/cotizador.js`; era $60.000 en el
     bloque 5) → cotización con recargo, sin avisar el recargo: coeficientes de CONFIG + 0,15
     (`RECARGO_BAJO_MINIMO`; desde el 30/09, 1,67 y 1,75), nunca los precios manuales, mismo redondeo. La
     cotización devuelve `bajoMinimo: true`; `decidir` lo pasa como `bajoMinimo: [modelos]` e
     `index.js` lo deja en el log (`[cotizacion] … cotizada con recargo`). **Antes de la
     ficha va la frase de excepción** (Bloque Tono, `excepcionCerca` en `src/estilo.js`, 3
     variantes): que está cerca y algo organizamos, con su entrega como único número: `mira,
     con los $300.000 estas cerca para el 13, asi que algo organizamos para que te lo puedas
     llevar. te lo armo con esa entrega, mira como te queda`. Sin "recargo", "interés", la
     diferencia ni que las cuotas suben. Reemplaza a "te lo llevas" y a "ahora te cotizo"; si
     además preguntó el precio o es su primer iPhone, esas frases siguen después de la
     excepción, y si la tanda se pasa de 4 se funden en un mensaje. En `cotizarVistos` va
     antes de las fichas si entra en 4. No va con la entrega en el mínimo, de contado ni en la
     alternativa;
   - faltan más de $45.000 → la alternativa, como siempre: `dale, mira lo que si te podes
     llevar con esa entrega:` + la cotización del mejor modelo que sí le entra (mínimo
     estricto) + `y el iPhone 13 te lo dejo anotado, cuando llegues a los $320.000 avisame y
     es tuyo` (`puertaAbiertaDe`, una vez por modelo; después, `seguis buscando el 13?`).

**Atajo por rechazo:** si en el paso 1 o 2 muestra que no va a comprar, se salta directo al
paso 3 con su último monto. Lo detecta `esRechazo` (`src/extractor-local.js`, regex nueva
sobre el mensaje crudo): "entonces no", "lo dejo", "dejalo", "no me interesa", "muy caro",
"paso", "gracias igual" / "igual gracias" / "no gracias". **No** son rechazo "no llego", "no
tengo", "no me alcanza" ni "¿cuánto le agrego?": son insistencia. Tampoco (ajuste de Tomás
del 16/09/2026): un mensaje con "?" ("te lo dejo en 290?", "está muy caro?": sigue
negociando); "paso" si no es el mensaje entero, con
"bueno/ok/dale/no/entonces" opcional adelante y "gracias" opcional atrás ("mañana paso",
"hoy paso", "después paso" es venir); "lo dejo" / "dejalo" con "te" adelante ("te lo dejo")
o seguidos de señado, reservado, apartado, anotado o para. Un monto en el mensaje ya **no** lo salva (Tono 1c, decisión de Tomás del 17/09/2026): "no
gracias, tengo 310.000" y "nos vemos el mes que viene, tengo 310.000" se cotizan con ese
monto nuevo, para no perder la venta por poca plata. Mientras se insiste, "gracias
igual" no va al cierre de agradecimiento y un "no" suelto (`esNegacionSuelta`) no va a "no se
entiende": los dos siguen hasta la cotización. La primera vez se insiste siempre, rechace o no.

**"Se va" también es rechazo** (Ajustes 2, decisión de Tomás del 17/09/2026, tras la prueba en
vivo: "bueno te escribo el mes que viene entonces" recibía "dale joya, quedo atento"). Con una
insistencia en curso, la intención `lo_piensa` (local o de Gemini) o una frase de `seVa`
(`src/extractor-local.js`: "te escribo", "te aviso", "lo pienso", "lo voy a pensar", "lo veo y
te aviso", "más adelante") salta al paso 3 con el último monto, desde la primera insistencia,
y la tanda es la ficha, sin despedida. Mismas excepciones que el rechazo: con "?" o con un
monto no se va. Gana también sobre el escalado por esquema de pago propio: "el mes que viene"
y "cuando cobre" están en `senalDeEsquema`, y si Gemini leyera `propone_pago` escalaría en
silencio antes de llegar acá (con el extractor local gana `lo_piensa`, que se evalúa antes).
Sin insistencia, `lo_piensa` sigue como siempre.

**Y le gana al turno** (Tono 1b, decisión de Tomás del 17/09/2026): volver **con un plazo
lejano** también es irse. "nos vemos", "te veo", "paso", "vuelvo" o "regreso" junto a "el mes
que viene", "el mes próximo", "más adelante", "a fin de mes", "cuando cobre", "cuando me
paguen", "en unos meses" o "el año que viene", en cualquier orden. Sin el plazo es un turno y
sigue su camino de siempre: **"nos vemos el lunes", "paso hoy" y "nos vemos a las 17" no son
irse**, con o sin insistencia. Con una insistencia en curso, `quiereVenir` lleva `!rechazo`
adelante (`src/responder.js`), así que ni la rama de turno ni la de ubicación corren: sale la
excepción y la ficha. Hasta Tono 1b, "nos vemos el mes que viene" caía en `PIDE_TURNO` y el bot
contestaba "contame que dia podrias pasar" y escalaba.

**En cualquier paso, si el monto llega al mínimo** → cotización normal. Si cubre el contado,
solo el precio (Ajustes 1b).

**El contador** es `insistenciaEntrega: { 'iPhone 13': 2 }` en el estado del chat, por
modelo. Es una marca del bot: viaja con la línea (`acciones.conMarcas`) y suma 1 solo cuando
esa línea salió (`state.confirmarMarcas`, que para esta marca mezcla el objeto en vez de
pisarlo: `MARCAS_QUE_SE_MEZCLAN`). Si el envío falla, no suma. Un modelo nuevo arranca de
cero (si vuelve al anterior, sigue donde estaba). `#reset` lo borra con el resto del chat, y
la vuelta a las 24 h de un escalado también (`RESET_DE_LA_CHARLA`). Reemplaza a
`intentoEstirar`, que ya no existe: la rama "¿hasta cuánto podrías estirarte?" se borró (en
el modelo solo y en varios modelos con el monto).

**Dónde NO aplica:** donde el bot elige el modelo (monto sin modelo, recomendación, la
alternativa) sigue el mínimo estricto, sin recargo ni insistencia.

**La línea de la entrega inicial** se reconoce por `temas.LINEA_ENTREGA_INICIAL` ("entrega
inicial … de $"): no marca la financiación como explicada (`NO_EXPLICA`; "entrega inicial"
solo sí la marcaría) y habilita leer un número suelto ("500") como monto, igual que la
cotización o la pregunta por la entrega.

**Eligió un modelo** (`eligioUnModelo`, bloque 5): también cuenta ser el único con el que el
bot viene insistiendo. Sin esto, "el 13, tengo 280" + "tengo 290" volvía a cotizar todos los
vistos en vez de seguir con el 13.

- **No hay "POSIBLE EXCEPCIÓN":** la rama se borró en el bloque 5. `Umbral_excepcion_pesos` y
  `Umbral_excepcion_pct` siguen en la planilla, pero no se leen.

Lo prueban `test/cotizador.test.js` (bordes 45.000 / 45.001) y la sección 1 de
`test/validacion-comercial.test.js`.

## Qué se lee como entrega

Arreglado el 14/09/2026. Un chat cotizó con el primer monto del cliente una hora después
de que dijera otro: Gemini no leyó el segundo (`perfecto tengo 520 y quiero el 14 pro`
volvía sin entrega) y `decidir()` no pisa la entrega guardada con `null`. Probado contra
Gemini: era de reconocimiento, no de historial. `LARGO_HISTORIAL` no tiene nada que ver.

La entrega vive en `estado.json` (`entrega`) y se escribe en un solo lugar de `decidir()`:
gana el último monto leído y un mensaje sin monto no la borra. Tres capas:

1. **Respaldo cruzado** (`gemini.js`). Si Gemini no lee entrega, se prueba `extraerMonto`
   del extractor local **solo sobre el mensaje actual**, nunca sobre el historial: así no
   arrastra montos viejos. Queda quién leyó el monto en `ultimaLectura.entregaFuente`
   (`gemini`, `local` o `null`), que llega a la propuesta del registro de aprendizaje
   (`data/aprendizaje-v2.jsonl`) como `lectura.entregaFuente`. `fuente: gemini` + `entregaFuente: local` = un hueco de Gemini
   que tapó el local. Lo prueba `test/entrega.test.js` con un Gemini simulado:
   `evaluar --offline` no puede, ahí Gemini está apagado.
2. **Extractor local** (`extraerMonto`), que pasó a ser la red:
   - Un número pelado se lee solo con contexto: `tengo`, `cuento con`, `entrego`,
     `entrega`, `dispongo`, `junte`, `junto`, `me estiro`, `estiro`, `llego a`. **`con` a
     secas no** (`con 90 de bateria`), pero `con <número> ... alcanza` sí: `con 520 me
     alcanza para el 14 pro?` es $520.000 de entrega (decisión de Tomás del 28/09/2026,
     igual que Gemini). `y con 610 cuanto me queda?` sigue sin leerse (lo ataja la guarda).
   - `llego a` con negación (`no`, `ni`, `tampoco`, `nunca`) y sin `mas de` en el mensaje:
     el número es el precio de algo que no le alcanza y no se lee (`no llego a 700` →
     nada). Con `mas de` es su techo (`no llego a mas de 300` → 300.000); sin negación, su
     plata (`llego a 480` → 480.000). Ese precio tampoco dispara la guarda.
   - Prueba todos los números, no solo el primero, y descarta los del equipo: modelo (11 a
     17 + pro/plus/mini, o después de iphone), capacidad (64/128/256/512 con `gb` o después
     de `de`) y año (`del 2023`). Los teléfonos (9 dígitos o más) se tapan antes.
   - `medio palo` = 500.000.
   - **Un monto en dólares no es plata en pesos** (bloque 10, decisión de Tomás del
     25/09/2026): el número con "dólares", "usd", "u$s", "us$" o "verdes" pegado, antes o
     después ("420 dólares", "usd 500", "200 verdes"), se tapa antes de leer (`sinDolares`).
     "tengo 420 dólares y el resto en pesos" se leía como $420.000. Si Gemini leyera esos
     dólares como pesos (420 o 420.000), `decidir` se queda con lo que haya en pesos. El
     monto va aparte, `entregaDolares` (`local.montoEnDolares`, en dólares, sin convertir):
     lo pisa el próximo, un monto en pesos sin dólares lo borra, caduca con los datos viejos,
     y el aviso al grupo lo dice como `Entrega: US$420`. La cotización en dólares la sigue
     haciendo una persona (escala callado, como siempre).
   - **Con piso y techo gana el piso**: `tengo 400 y me estiro a 550` → 400.000. Decidido.
   - **Con una palabra de corrección gana el último** (bloque 5): `perdón`, `me equivoqué`,
     `en realidad`, `mejor`, `corrijo`, `no, son`. Se lee lo que sigue a la última palabra
     que tenga un monto después (`tengo 400` + `perdón, 500` → 500.000), y ahí 128, 256 y
     512 pelados no son plata. `decidir` lo aplica sobre el mensaje crudo, lea lo que lea
     Gemini. Con un monto, el mensaje no es una disculpa.
   - **Un número suelto** (`500`, `500k`, `500 mil`, `500.000`: `montoSuelto`) se lee solo
     si la última tanda del bot fue una cotización (📱), la pregunta por la entrega (`con
     cuanto contas`, `de cuanto disponias`, `que presupuesto tenias`; `hasta cuanto podrias
     estirarte` ya no se dice desde el bloque 5b, queda por los historiales guardados) o la
     línea de la entrega inicial (bloque 5b, `temas.LINEA_ENTREGA_INICIAL`). Rango: de 100 a
     3.000 en miles, o de 100.000 a 3.000.000; nunca 128, 256 ni 512 pelados. Lo decide
     `decidir`, sobre el mensaje crudo.
   - **Una entrega partida por forma de pago se suma** (muestra de repro-v1, decisión de Tomás
     del 28/09/2026; `entregaPartida`): "tengo 180 en efectivo y 120 en transferencia" son
     $300.000. Solo si cada monto va atado a una forma de pago (efectivo, cash, billetes,
     transferencia o "transf", mercado pago, mp), pegada antes o después del número ("150 cash y
     100 por mp" = $250.000; "efectivo 180 y transferencia 120"), con los formatos de `montoEn`.
     "180 y 120" sin forma de pago sigue siendo $180.000, "tengo 400 y me estiro a 550" sigue
     $400.000 (piso), un solo monto atado sigue como siempre, los dólares quedan afuera
     (`sinDolares`) y con una palabra de corrección sigue ganando la corrección ("perdón, 180 en
     efectivo y 120 por transferencia" da $180.000, como hoy). En `decidir` la suma le gana a
     Gemini (`_entregaFuente = 'local'`), en el mismo lugar que la corrección y el monto suelto.
   - **Un número solo menor a 100 nunca es una entrega** ("90", "45?"; `numeroChicoSuelto`,
     28/09/2026): es el piso de `montoSuelto`. Si Gemini lo lee como plata, `decidir` borra la
     entrega y no la guarda; si además Gemini decía `declara_entrega`, sigue lo que diga el
     extractor local ("contame que estabas buscando"). Y **un número solo entre 50 y 100**
     ("90", "90%", "90?"; `bateriaSuelta`) es la batería de su equipo si la última tanda de la
     cuenta (bot o persona) la preguntó (`ultimaTandaPideBateria`: la línea nombra la batería y
     no dice un valor; la cotización 📱 y las unidades "bateria 86%" no cuentan) o hay un canje
     en curso sin batería. Con el canje queda en `permuta.bateria` y sigue el canje (con los
     datos ya pedidos escala como *mandó los datos del equipo*); sin canje en el estado escala
     callado: ver *Qué escala siempre a un humano*.
3. **Guarda** (`responder.js`, justo antes de los precios). No se leyó entrega, el mensaje
   trae un número que podría ser plata (`mencionaPosibleMonto`: suelto entre 50 y 3000 o
   más de 50.000, sin modelos, capacidades, batería, horas, años ni teléfonos) y hay una
   entrega guardada → no cotiza con la vieja: repregunta (`no te entendi bien el monto`) y
   anota `entregaRepreguntada`, que se borra con la próxima entrega bien leída. Si vuelve a
   pasar antes de eso, escala en silencio. Sin
   número no se dispara: `dale, y en cuotas como me queda?` cotiza con la guardada.

## Tandas de mensajes

`src/index.js`, desde el 15/09/2026. Antes, el segundo de dos mensajes seguidos se
descartaba: entraba al historial pero no se interpretaba, y el bot contestaba el "hola" sin
el "tenes el 13?". `test/webhook.test.js` lo mostraba desde antes del 12/09, pero no corría
en `npm test`.

- **La espera de ritmo humano (20 a 45 s) pasa antes de interpretar.** Lo que el cliente
  mande en ese rato entra en la misma tanda: las líneas se juntan con saltos de línea y se
  interpretan **una sola vez**. Lo que llega mientras se manda la respuesta va en la tanda
  siguiente, con su propia espera. **En escucha también se espera** (bloque 6, decisión de
  Tomás del 22/09/2026): no hay nada que mandar, pero así la tanda que se compara con la
  respuesta humana es la misma que en vivo. Hasta entonces se interpretaba cada mensaje apenas
  llegaba.
- **Una decisión por tanda.** `decidir` no anota nada de lo que "ya se dijo": cada marca
  viaja con el mensaje que la justifica y se guarda cuando ESE mensaje sale (ver *Las
  marcas de "ya se dijo"*). Por eso no se interpreta el primer mensaje para descartarlo
  después.
- **Techo: 700 caracteres** (`TECHO_TANDA`). Lo que agranda lo que recibe Gemini es el
  texto, no la cantidad de mensajes. Si la tanda se pasa, se corta ahí y el resto va en la
  siguiente, en orden. Un solo mensaje más largo que el techo va entero.
- **Audios.** La línea se reserva al llegar (`[audio]`) y la transcripción la completa
  después, así texto y audio van en el orden en que los mandó el cliente; la tanda espera
  sus audios. Si uno no se entendió, la tanda entera escala en silencio y no se interpreta:
  un audio que no se entendió nunca cotiza. Las líneas de audio quedan con `audio: true`.
- **Una persona que contesta** durante la espera cancela la tanda. Si contesta mientras se
  arma la respuesta, no se manda.
- **Antes de CADA mensaje** se mira si el chat quedó pausado o escalado, si escribió alguien de
  la cuenta o si llegó un mensaje nuevo del cliente: cualquiera de esas cosas corta lo que
  falta, con un log `[corte]` que dice el motivo y cuántos mensajes quedaron sin mandar. Antes
  solo se miraba al empezar, y en la auditoría del 15/09/2026 salieron 3 mensajes después de un
  `#pausa`.
- **El "escribiendo…" lo hace el bot** (Pendientes 1, D2, decisión de Tomás tras la prueba en
  vivo del 16/09/2026). Hasta entonces era el `delay` del envío: Evolution retenía el mensaje
  `ENTRE_MENSAJES_MS` y un `#reset`, un `#pausa` o una persona que entraba en ese rato no lo
  frenaban, porque el bot ya había pasado el control ("Dale, con los $900.000 te llevas el 14
  Pro" salió después del "🔄 Reiniciado" y no quedó en el historial). Ahora, por cada mensaje:
  `evolution.mostrarEscribiendo` (`/chat/sendPresence`, `composing`) → `dormir(ENTRE_MENSAJES_MS)`
  → `comprobarVigente` y `motivoDeCorte` → el envío con **`delay: 0`**, que le llega ya. El
  `dormir` de después de cada envío se sacó: el ritmo entre mensajes es el mismo, solo que el
  primero sale 1,8 s después de interpretar y la tanda termina 1,8 s antes. El "escribiendo…" es
  cosmético: si falla, se loguea una vez por racha y el envío sigue. El "🔄 Reiniciado" del
  tester (delay 1200) y los avisos al grupo (delay 0) quedan como estaban. Lo prueba
  `test/reset.test.js` con un Evolution de mentira que anota cuándo se posteó cada envío y con
  qué delay.
- **Un mensaje nuevo del cliente rearma la respuesta** (decisión de Tomás): lo que faltaba no
  sale, las líneas de esa tanda vuelven al principio de la cola y la tanda siguiente contesta
  todo junto. Esa tanda espera un tercio de lo normal (7 a 15 s), porque el cliente ya está
  esperando. Después de 2 cortes seguidos la tanda sale entera: un cliente que escribe sin
  parar no se queda nunca sin respuesta.
- **Un `#reset`** (de la cuenta o del cliente de prueba) se lleva la cola, y una tanda que ya
  estaba interpretando o mandando no manda ni escribe nada más: `state.reiniciar` sube la
  *generación* del chat, la tanda corre dentro de un `AsyncLocalStorage` con la suya, y
  `state.obtener` tira `ChatReiniciado` si no coinciden. Va en `state.js` y no solo en
  `atenderTanda` porque `decidir` lee y anota por `chatId` después de cada `await`. Lo que
  llega después del reset va en una tanda nueva. Lo prueba `test/reset.test.js`.
- **"No se entiende" y acuses con tandas:** la marca apunta a la última línea de la tanda,
  las líneas de la misma tanda no cortan la cadena, y una tanda es acuse si todas sus
  líneas lo son.
- **El banco de casos no cambia:** `evaluar` llama a `decidir` mensaje por mensaje. Lo
  prueba `test/tandas.test.js`.
- **Corrección de monto dentro de la tanda** (bloque 5): `tengo 400` + `perdon, 500` cotiza
  con 500.000, en la misma tanda o separadas. Lo prueba `test/tandas.test.js`.

## No se entiende: cuándo pasa a una persona

Cambiado el 14/09/2026, después de medir `data/aprendizaje.jsonl`: "mandó varios mensajes que
no se entienden" y "no entiendo qué necesita el cliente" eran la mitad de las escalaciones.
La causa principal no eran mensajes partidos. Un contador (`mensajesSinContenido`) sumaba el
primer mensaje no entendido y nunca volvía a cero, así que un "👍" días después escalaba. Y
casi todas pasaban con una persona ya atendiendo (en escucha el bot evalúa igual); el 71%
salía de chats que hoy están en `CONTACTOS_PERSONALES`.

- **Escala recién con dos mensajes no entendidos seguidos**, para los dos motivos, que
  comparten la regla. El primero pregunta "contame que estabas buscando".
- **Cualquier mensaje entendido corta la cadena**, y también uno que el bot no evaluó porque
  atendía una persona: "seguidos" se mira en el historial, no en un número.
- **Un acuse no cuenta** ("ok", "si", "no", "dale", un emoji solo): ni suma ni corta. El
  primero se contesta como siempre; los que le siguen sin otro mensaje en el medio, no
  (`acuseContestado`). En `test/casos.js` esos turnos llevan `mudo: true`.
- **Un mensaje corto que es un modelo solo no es "sin contenido"** (bloque 10): sin Gemini,
  menos de 4 letras era `sin_contenido` aunque trajera un modelo, y "x?" o "13?" contestaban
  "contame que estabas buscando". Ahora se leen como ese modelo ("x?" es el iPhone X, que no
  se trabaja). "ok", "si", "ya" y "?" siguen igual.
- La marca es `noEntendido` (`{ ts, texto }` del mensaje). El `mensajesSinContenido` de los
  chats de antes se ignora: no hizo falta tocar el estado.
- **Cuenta solo si la pregunta le llegó** (Pendientes 2, decisión de Tomás del 21/09/2026).
  Hasta entonces `noEntendido` se anotaba al decidir: en escucha, en borrador (hoy lo son todos
  los clientes reales, por las listas de prueba) o con una tanda cortada contaba igual, y un
  cliente con dos mensajes raros quedaba escalado sin haber recibido nunca el "contame que
  estabas buscando". Ahora la marca viaja con la pregunta (`acciones.conMarcas`, como
  `acuseContestado`) y se confirma en `enviarAlCliente` con el id de Evolution: si la pregunta
  no salió, el próximo mensaje raro vuelve a preguntar en vez de escalar. El segundo seguido
  escala igual que siempre, y como ahí el bot no manda nada, la marca pasa a ese mensaje al
  decidir (un tercero seguido también escala). Lo prueban `test/no-entiende.test.js` y, por
  `index.js`, `test/sin-venta.test.js`.
- El registro de aprendizaje guarda `contexto: { humanoAtendiendo, audio }` en cada
  propuesta, y `humanoAtendiendo` en cada línea del cliente, para medir por separado lo que el
  bot haría en vivo.

## Memoria por tema

`src/temas.js`, desde el 14/09/2026. El bot no vuelve a explicar lo que al cliente ya le
llegó: **financiación** (incluye "las cuotas arrancan el mes que viene"), **requisitos**,
**garantía** y **métodos de pago**. Envíos no: escala. Hacía falta anotar el tema porque el
filtro de repetidos solo saca frases idénticas y `estilo.js` rota variantes.

- **Pregunta o iniciativa se decide por el mensaje del cliente**, con palabras clave por
  tema, no por la rama del código que contesta. Si lo pregunta, se contesta siempre, con la
  versión corta si ya se explicó. Si no lo pregunta y ya se explicó, no se agrega.
- **Cuenta como explicado lo que le llegó al cliente**: palabras clave sobre las líneas de
  vendedor del historial, que son lo que escribió una persona y lo que el bot mandó de
  verdad. En escucha lo que el bot habría dicho no marca. "Asi te armo las cuotas" o "la
  entrega arranca en" nombran las cuotas pero no marcan. Tampoco marca financiación la
  pregunta de cómo piensa pagarlo (`NO_EXPLICA`, bloque 3b): la ofrece, no la explica. Queda
  en `temasExplicados`; no caduca, se borra con `#reset`.
- **Las frases con números se dicen siempre** ("la entrega arranca en $320.000", "que para
  el 16 son $670.000"): si el cliente pregunta por cuotas y el flujo contesta con el número,
  gana el número.
- **Versiones cortas:** `como te decia, te lo financiamos en 1 o 2 cuotas con una entrega
  inicial` · `si, solo con tu dni, no hace falta tarjeta` · `si, un mes de garantia` ·
  `como te decia, podes pagarlo de contado o financiarlo hasta en 2 cuotas con una entrega
  inicial`. Si pregunta cuándo arranca la primera cuota, a la corta se le suma el "mes que
  viene".
- **Dónde se aplica:** la respuesta fija de consulta general; la pregunta por cuotas
  (`responderCuotas`); documentación; medios de pago
  (los requisitos van solo si no se explicaron o si también los pregunta); la garantía de
  la lista de dos modelos; "cómo pensabas pagarlo", que con la financiación ya explicada
  pasa a "contame si lo ibas a hacer de contado o en cuotas"; las cuotas y los requisitos
  al repetir la cotización; y los requisitos al cotizar (si ya se explicaron, el PDF del
  compromiso sale con el pie "te paso el compromiso de pago", o no sale nada si ya se mandó).
- **`redactar` recibe solo los datos de lo que se preguntó**, los mismos de la respuesta
  sin IA, no todos los datos fijos: si pregunta por garantía, la instrucción no lleva
  financiación ni requisitos. `test/temas.test.js` lo prueba sobre la instrucción armada.
- **`redactar` no contesta modelos ni promete** (Mejora 1, `test/redactar.test.js`):
  - si el mensaje nombra un modelo (`info.modelo` o `info.modelos`), no se llama y va la
    reserva de datos fijos;
  - la instrucción le prohíbe contestar disponibilidad, stock y modelos;
  - lo que no está en los datos lo devuelve como `gemini.SIN_DATO` (`[SIN_DATO]`). Con esa
    marca, sola o mezclada, al cliente no le sale nada y escala.
- En `test/casos.js`, un turno con `redactar: false` falla si se llamó a `gemini.redactar`
  (offline devuelve la reserva igual, así que por la salida no se ve).
- En `test/casos.js`, un turno `{ humano: '...' }` simula que una persona escribió en el
  chat, y `lectura: { ... }` pisa campos de lo que devolvió la comprensión en ese turno
  (`{ intencion: 'propone_pago' }`, `{ modelo: null }`): simula una lectura de Gemini que el
  extractor local no da.

## Notas del cliente

Desde el 14/09/2026. Lo que el cliente cuenta y no entra en ningún campo ("es para mi
hija", "me voy de viaje el 20") se caía de las 15 líneas. Ahora `gemini.entender` devuelve
un campo `nota` en la misma lectura, sin llamada extra, y queda en `notas` del estado: como
mucho 5, de una línea (120 caracteres). Las más viejas se caen y una igual a otra ya
guardada no se suma.

- **Solo aditivas.** Se suman a la instrucción de `redactar` (`conNotas`); ninguna rama de
  `decidir` las mira. `redactar` sigue recibiendo instrucción, nombre y reserva, nunca el
  historial. Hoy `redactar` se usa en un solo lugar: la respuesta fija a una consulta
  general, y solo con Gemini.
- **Limpias.** Pasan por `notaSegura` (→ `sinDatosPersonales`) antes de guardarse y antes
  de volver a un prompt. **`sinDatosPersonales` no tapa direcciones**: el prompt le pide a
  Gemini que no las ponga, pero no está garantizado. Decisión pendiente.
- Sin Gemini (`--offline`, sin clave o si falla) la nota viene `null` y el bot se comporta
  igual. Lo prueba `test/notas.test.js` con un Gemini simulado.

## La explicación de la financiación (bloque 3b)

Pedido de Tomás el 16/09/2026 tras una prueba en vivo: el cliente mandó "me interesa el 14 pro
pero cuento con 600.000" + "vi que hacian financiamiento" + "como es eso" en una tanda, y el bot
cotizó sin explicar nunca cómo es la financiación. Decidido:

- **Va antes de la cotización, pregunte o no, si la financiación todavía no le llegó**
  (`temas.explicado`), del bot o de una persona. Una cotización en cuotas ya la marca ("1 pago
  de"), así que en la práctica es la primera en cuotas. Hasta Ajustes 1b también se cortaba si
  el chat tenía una cotización (`cotizadoDe`); se sacó para que, después de una de contado, la
  explicación salga con la próxima en cuotas. Si ya le llegó y pregunta, va la corta
  (`temas.CORTA.financiacion`); la larga no se repite.
- **Con monto** (cotización normal, `explicaAntes` en `src/responder.js`), tope de 4:
  `explicaFinanciacion` · PDF con `pieCompromiso` (marca `compromisoEnviado`) · `puedeRetirar`
  · cotización. **Se saca `ahoraCotizo`.** Si el PDF ya salió, el lugar 2 es el pie como texto
  solo si los requisitos no se explicaron; sin PDF en el catálogo, el pie como texto. Cuando no
  hace falta la explicación, sale como siempre (con "ahora te cotizo" y los requisitos al final).
- **Sin monto** (`explicacionConCompromiso`): pregunta cómo es la financiación
  (`responderCuotas`) o contesta "en cuotas" a "cómo pensabas pagarlo" (paso 3a) →
  `explicaFinanciacion` · PDF con `pieCompromiso` · la pregunta de siempre para seguir (la
  entrega de ese modelo y con cuánto cuenta; si falta el modelo, cuál le interesa). Una sola
  vez por tanda.
- **Las piezas viven en `src/estilo.js`** y rotan con `estilo.frase`, 4 variantes cada una,
  sacadas de frases reales del negocio. `explicaFinanciacion` abre ("sii mira, te cuento") y
  dice siempre: se financia el celular, 1 o 2 cuotas (o hasta 2), pedimos una entrega inicial;
  sin porcentajes ni montos. `pieCompromiso` dice siempre: sin tarjeta, solo su dni, con un
  compromiso de pago que se lo pasamos. Todas pasan `temas.EXPLICA` de su tema
  (`test/financiacion.test.js` las revisa una por una). `estilo.variantes(clave)` las devuelve
  todas. `requisitos` queda para los medios de pago, donde no va el PDF.
- **"Las cuotas arrancan el mes que viene" (`DATOS_FIJOS.cuotas_desde`) ya no va en la larga:**
  solo si pregunta cuándo arranca a pagar. `DATOS_FIJOS.financiacion` se sacó.
- **"Cómo pensabas pagarlo" no cuenta como explicación** (`temas.NO_EXPLICA`): esa pregunta
  ofrece las cuotas con el % del modelo, pero la explicación es la pieza con el PDF. Sí marca
  métodos de pago. Sin esto, "como es la financiacion?" después de elegir el modelo daba la
  corta y nunca el PDF.
- **Primer iPhone (bloque 4b, decidido por Tomás).** Con la explicación adelante son 4 justos,
  así que si además dice que es su primer iPhone la frase va fundida con "te lo llevas" en un
  solo mensaje: `primerIphoneRetira(modelo, plata)` en `estilo.js`, 3 variantes ("perfecto,
  llegaste al lugar indicado, con esos $550.000 el iPhone 14 Pro te lo llevas"), con la marca
  `primerIphoneDicho` que se confirma al enviarse. Sin la explicación, la frase sale como
  siempre, aparte.
- **Quedan sin explicación ni PDF, como antes:** monto sin modelo ("el mejor que te llevas"),
  recomendación con monto y la alternativa por entrega baja. Ver *Pendientes*.

### Paga de contado (Ajustes 1b)

Decisión de Tomás del 16/09/2026: **si la entrega paga el equipo entero (`cot.soloContado`), no
se le habla de financiación.** En la cotización normal (`src/responder.js`, `deContado`,
`hablaFinanciacion` y `hablaRequisitos`, líneas 1775 a 1777):

- **Sale solo** la cotización con `pagaDeContado` (Pendientes 1, D3, decisión de Tomás tras la
  prueba en vivo del 16/09/2026: "lo podés retirar con esos $900.000" y "con esa plata lo sacás
  de contado, está $800.000" decían lo mismo; `puedeRetirar` no va con `deContado`). Sin "te
  lo llevas", sin la explicación, sin el PDF, sin los requisitos y sin "ahora te cotizo". Si
  pregunta cómo es la financiación: explicación · PDF · ficha.
  **Con el primer iPhone y esa pregunta** (opción A de Tomás, 19/09/2026): explicación · PDF ·
  `primerIphoneContado` ("buenisimo, estas en el lugar indicado para tu primer iphone", sin
  monto ni "te lo llevas") · ficha. `primerIphoneRetira` sigue igual cuando no es de contado.
- **Con varias unidades**, solo si **todas** son `soloContado`. Si alguna tiene cuotas, como
  siempre.
- **No se marca nada** (`compromisoEnviado`, `temasExplicados`): no salió. Si después elige un
  modelo que no le alcanza, la explicación y el PDF van con esa cotización.
- **Si pregunta cómo es la financiación** (`temas.pregunta`) en esa tanda, van las piezas de
  siempre: explicación · PDF · "te lo llevas" · cotización.
- **Agregados para no romper otra cosa** (con su prueba en `test/financiacion.test.js`):
  - **"ya cotizado"** (mismo modelo y monto) sigue la misma regla: sin `restoEnCuotas` ni
    requisitos. Sin esto, al repetir el monto le mandaba "lo que queda te lo financiamos" y el PDF.
  - **Si pregunta solo por los requisitos** ("que papeles piden?"), se le contesta que de
    contado no necesita nada (`requisitosContado`), sin el PDF ni la explicación. Hasta la
    Mejora 1 se le contestaban con el PDF.
  - **"ya cotizado" de contado** usa `yaCotizadoContado`, sin "el resto lo hacemos en cuotas"
    (Mejora 1). Con varios modelos y `pagaDeContado`, "cual te gusta mas?" sin "asi te armo
    las cuotas".
- **Primer iPhone:** sin la explicación adelante, la frase sale aparte, como siempre (2
  mensajes: la frase y la ficha).
- **No cambia** "tenés el 13?" → "ese está en $X" (decisión de Tomás).

## Si dice el monto y varios modelos

**Si los nombra en el mismo mensaje del monto**, no se le pasa la lista. Se le dice cuáles se
lleva (los que llegan al mínimo). Al que no llega se le dice **solo su entrega inicial**, dos
veces, y el conteo avanza para cada uno (bloque 5b); después entra con recargo si le faltan
hasta $45.000, o va en la línea con el contado y desde dónde arranca la entrega. Si ninguno
entra, no hay pregunta: la línea va sola ("¿hasta cuánto podrías estirarte?" se borró).

**Los que no llegan van en un solo mensaje** (bloque 9, decisión de Tomás del 24/09/2026, tras
la prueba en vivo: "con los $200.000 al 14 Pro todavia no estamos…" y "con los $200.000 al 15
Pro todavia no llegamos…" iban en dos mensajes, con "el resto en 1 o 2 cuotas" dos veces): la
entrega de cada uno y la explicación una vez, nunca la diferencia (`entregaInicialVarios` en
`src/estilo.js`, 3 variantes; como en la de un modelo, la variante la elige el conteo y la
segunda vez va la que explica por qué). Lleva el conteo de todos (`insistenciaEntrega` se
mezcla). Con uno solo que no llega, la línea de siempre. Los que sí llegan siguen en "te podes
llevar", aparte. Lo mismo al cotizar los vistos (abajo). Sin cambios en ningún cálculo.

> Con esos $400.000 de entrega te podes llevar el 13
> Mira, con los $400.000 todavia no estamos, el 14 Pro lo estamos pidiendo con $480.000 de entrega inicial y el 15 Pro con $530.000. lo que queda lo haces en 1 o 2 cuotas, y cuanta mas entrega pongas mas comodas te quedan
> Cual te gusta mas? asi te armo las cuotas

(montos de la copia congelada). La línea del paso 3 cuando ninguno entra ni se insiste es
**"con los $X todavia no estamos para esos modelos"** (bloque 10, decisión de Tomás del
25/09/2026; hasta entonces "con esos $X todavia no te alcanza para esos modelos", que la regla
prohíbe) y, por cada uno, "el X sale $Y de contado y la entrega arranca en $Z".

**Si pregunta por otro modelo con la entrega que ya dio** (bloque 10, decisión de Tomás del
25/09/2026, tras la prueba en vivo: "tenes iphone 14 pro y 15 pro?" → "tengo 200.000" → "y el
13?" contestaba "pedimos por lo menos $500.000 de entrega inicial para el 14 Pro, $540.000 para
el 15 Pro y $340.000 para el 13…"): si no le llega para ese, **se habla solo de ese**, con la
línea de un modelo (`entregaInicial`); si pregunta por varios a la vez y no llega a ninguno,
`entregaInicialVarios` con esos solos. Los que ya se mostraron no se repiten, y su conteo no
avanza (no se les dijo nada: a la próxima se les vuelve a decir la entrega inicial, en vez de
pasar al contado). La variante la elige el conteo de esos (el 13, sin insistencias, va con la
de la primera vez). Marca `preciosMostradosDe` con esos. **Sigue como antes** si alguno de los
que pregunta llega (también el caso mixto, uno llega y otro no: "te podes llevar el 11" y la
línea con los de antes y el 13; decisión de Tomás del 25/09) o si dice un monto nuevo en el
mismo mensaje. Sin cambios en ningún cálculo. Lo prueban los casos "Bloque 10" de
`test/casos.js`.

**Si ya vio dos o más y dice el monto después, sin nombrar modelo** (bloque 5, decisión de
Tomás del 16/09/2026), se cotizan todos (`cotizarVistos`). Los modelos salen del mismo registro
que "decime cual te gusto mas" (`modelosVistos`).
- Una cotización por modelo, con las reglas de cada uno: normal, bajo el mínimo o de contado.
- Con más de 3 vistos, los últimos 3.
- Al que no llega al mínimo, la primera y la segunda vez, solo su entrega inicial (bloque 5b),
  con su propio conteo; si son varios, todos en un mensaje (bloque 9). En el paso 3, con hasta
  $45.000 entra con recargo y con más va la línea con el contado y la entrega mínima. Nunca la
  diferencia.
- Antes van la explicación y el PDF, si no le llegaron (una entrega inicial pendiente también
  es hablar de financiación). Si no entra todo en 4 mensajes, las cotizaciones van juntas en
  uno, y si hace falta también las líneas.
- Si paga todo de contado, sin financiación ni la palabra "cuota" (Ajustes 1b).
- No corre si eligió uno: contestó "cómo pensabas pagarlo", se le cotizó ese solo, o es el
  único con el que el bot viene insistiendo con la entrega (bloque 5b).
- Una corrección ("perdón, 500") recotiza los mismos.

## Validación comercial (bloque 5)

Decisiones de Tomás del 16/09/2026. Lo prueba `test/validacion-comercial.test.js`.

**Pedido de descuento.** Se detecta sobre el mensaje crudo, lea lo que lea Gemini
(`pideDescuento`, `src/extractor-local.js`): "descuento", "rebaja", "me lo dejás más barato",
"haceme precio", "precio especial", "mejor precio". Le gana al más barato: "el más barato",
"cuál es más barato" y "algo más barato" siguen yendo al modelo más económico. "algo menos" no
entra, porque choca con montos. Un canje sigue su camino.
- **Sin descuento desde el 30/09/2026** (decisión de Tomás): cada pedido recibe
  `descuentoPrimero` ("el precio es ese…"), sin números y sin escalar. Hasta ahí el 2do era el
  contado − $10.000 (`DESCUENTO_CONTADO`, que ya no existe) y del 3ro en adelante se repetía.
- Sin un modelo claro (ninguno, o varios vistos sin elegir): escala callado.
- Las cuotas y el contado salen de la planilla. `descuentoPara` y `conDescuento`
  (`src/cotizador.js`) quedan para quien los llama, sin hacer nada: una marca vieja
  `descuentoDe` de un chat no cambia ningún precio.
- **Marcas:** `descuentoPedidos` (el número de ese pedido) viaja con la respuesta y se confirma
  solo si salió (bloque 3). `descuentoDe` ya no se escribe.
- La regla global de `evaluar` "no ofrece descuentos por su cuenta" deja pasar "te lo dejo en
  $" solo en los turnos con `descuento: true`; desde el 30/09 ningún caso lo usa.

**Canje** (su celular como parte de pago). Se detecta con "plan canje", "permuta", "parte de
pago", "entrego mi", "canje", "tomás usados", "te dejo mi celular" y lo que lea Gemini. El bot
no tasa nada.
- Pide los datos: "tomamos celulares a partir del 11" + "pasame modelo, almacenamiento,
  condicion de bateria, unas fotos", sin "asi te cotizamos".
- Cuando manda datos después del pedido, escala callado: `ofrece un canje: su celular como
  parte de pago`. Modelo, capacidad y batería se leen también de un mensaje que no nombra el
  canje ("128gb, bateria 90%").
- Si insiste sin datos: "sin X no te puedo pasar el numero exacto", **una sola vez por canje**;
  a la segunda sin datos nuevos escala callado (D2, 29/09/2026). Con el canje en curso, lo que
  no habla del canje sigue el flujo normal: ver *Chats desde cero*.
- Lo que ya mandó no se borra con un mensaje sin datos.
- **Un equipo anterior al 11** (bloque 10, decisión de Tomás del 25/09/2026; hasta entonces iba
  igual que los demás y pedía la capacidad y la batería del 8): solo "tomamos celulares a partir
  del 11", sin pedirle datos y sin dejar un canje en curso (si había ofrecido otro, se borra: lo
  que mande después no escala como canje). Si en el mismo mensaje pidió un modelo para comprar,
  queda como el modelo del chat, como siempre. Sin Gemini, "me tomás un iphone 8?" solo no se lee
  como canje (contesta "Ese no lo trabajamos"): ver *Pendientes*.
- Una foto sin epígrafe en un canje en curso cuenta como "mandó fotos" (D1, 29/09/2026): ver
  *Chats desde cero*. Fuera de un canje, `index.js` la sigue descartando.

**Garantía:** sigue en 1 mes (`DATOS_FIJOS.garantia`). Decisión de Tomás, sin cambios de código.

**Stock:** LISTA es lo que se consigue con el proveedor, y el bot sigue diciendo que lo tiene.
El stock propio (con carga por WhatsApp) y el de liquidación van en un bloque aparte, junto con
los precios fijos de canje.

---

## Respuestas fijas

Todas se detectan **sin tildes** y sin depender de Gemini, antes de la cotización.

- **Ubicación** (`donde estan`, `dónde estás`, `por dónde`, `ubicación`, `local`…) → la
  dirección **de una** (`Belgrano 3090, Neuquén capital (el local figura como Somos Piedra)`),
  que se atiende con turno, y se empuja la venta. Si la vuelve a pedir, `te repito, estamos
  en…`. Hasta septiembre de 2026 la dirección salía recién a la segunda pregunta; se cambió
  porque en los registros reales los humanos la pasaban siempre. Lo de "Somos Piedra" se
  deja a propósito, aunque un cliente preguntó si era un local de piedras.
- **Turnos: el bot pregunta, no promete.** Si quiere avanzar o pide turno, pregunta lo que
  falta y escala: `que dia te podes acercar?`; si ya dijo el día, el horario; si dijo día y
  hora, no dice nada y escala (desde la Mejora 1: `dejame chequear si ese horario lo tenemos
  libre` era solo una promesa). Mira sus últimos 3 mensajes para
  no preguntarle lo que ya dijo, y si contesta el día que le preguntamos, sigue coordinando.
  No confirma horarios. Una hora es "a/para/desde/hasta/tipo/sobre las 16", "16hs", "16:30" y,
  desde el bloque 10, "cerca de las 14" y "de las 16" ("de las 16 en adelante", "a partir de
  las 17"; `mencionaHora`). "de las" va solo con cifras y sin "cual", "una", "alguna"… adelante
  ni cuotas u opciones atrás: "cual de las dos", "cual de las 2", "de las dos opciones" y "el
  valor de las 2 cuotas" no son horas. **Pedir que se lo entreguemos es pedir turno, lea lo
  que lea Gemini** (arreglos en vivo, 30/09/2026): "¿para cuándo me lo podés entregar?", "¿me
  lo entregás?", "¿y cuándo me lo entregan?", "¿me lo podrían entregar hoy?"
  (`local.nosPideEntregar`: "me/nos" + "entregar" como verbo; sin monto en el mensaje y sin
  canje). Con Gemini venían como `consulta_general` y `respuestaFijaLocal` contestaba la
  financiación porque "entrega" también es la entrega inicial. "¿Cómo es la entrega?" y "¿de
  cuánto es la entrega?" siguen con la financiación o la entrega inicial, "¿hacen entregas a
  domicilio?" escala por envíos y "te entrego mi 12" es canje. Casos "Arreglos en vivo (2)".
- **Viene "un día de estos", sin día** (bloque 10, ejemplo aprobado "Un día de estos seguro me
  pegue una vuelta") → que nos manejamos con turnos, más que nada para que no se junten
  clientes (`vueltaConTurno`), y `cuando sepas que dia te queda comodo, avisame`
  (`vueltaQueDia`, que pregunta "que dia": si contesta "el jueves", el turno de siempre). Sin
  contado, cuotas ni promesas, y sin escalar. Se lee sobre el mensaje crudo
  (`local.vieneSinFecha`: "cualquier día de estos paso", "en la semana me doy una vuelta",
  "algún día de estos me acerco", "me pego una vuelta"; "en estos días voy a juntar la plata"
  no). Con un día ("mañana me pego una vuelta"), un modelo o un monto sigue su camino; si
  pregunta dónde estamos, la dirección; con una insistencia en curso, un "se va" sigue siendo
  rechazo.
- **Pregunta por cuotas** (`vi que hacen cuotas, como seria?`, `como son las cuotas?`), desde
  el 15/09/2026 → se contesta **siempre, lea lo que lea Gemini** (`propone_pago`,
  `consulta_general`, un "dale" leído como `quiere_avanzar`), sin `redactar`: la explicación
  larga (`explicaFinanciacion`) con el PDF del compromiso, o la corta si ya se explicó (desde el
  bloque 3b; "el mes que viene" solo si pregunta cuándo arranca). Después sigue la venta
  (`responderCuotas`, como mucho 4 mensajes):
  - **eligió un modelo que ya vio** (contestó "cómo pensabas pagarlo", o vio solo ese) →
    `dale, para el iPhone 13 la entrega arranca en $X` + que diga con cuánto cuenta;
  - **vio 2 o más y no eligió** → `decime cual te gusto mas, el 13 o el 14 Pro, y con cuanto
    contas para la entrega asi te armo los numeros` (con tres: `el 13, el 14 Pro o el 15`);
  - **no vio nada** → `contame que modelito te interesa y con cuanto contas para la entrega
    asi te armo los numeros`.

  Siguen su camino de siempre: un esquema propio con montos o fechas (escala), una entrega
  dicha o guardada, un modelo nuevo en el mensaje (se le pasan los precios), la respuesta a
  "cómo pensabas pagarlo", y un mensaje que además pregunta por requisitos, garantía, día,
  hora o turno. Nació de una prueba en vivo: con el 13 y el 14 Pro cotizados, Gemini leyó la
  pregunta como `propone_pago` y el bot contestó `contame que estas buscando y con cuanto
  contas`. El prompt de `entender` ahora aclara que preguntar por la financiación no es
  `propone_pago`.
- **Medios de pago** → contado (efectivo, transferencia o Mercado Pago, desde el bloque 8) o
  financiado hasta en 2 cuotas con una entrega inicial, sin tarjeta, solo DNI. **Sin
  montos**: la entrega depende del modelo. Pagar con tarjeta (también en cuotas por Mercado
  Pago, que no está decidido), débito, Ualá o las cuotas del banco escala callado como "otro
  medio de pago". La tarjeta de crédito o una financiera (Visa, Mastercard, Naranja, Confiable…)
  tiene respuesta fija desde el 29/09/2026 (D6): ver *Chats desde cero*. Si en el mismo mensaje pide stock y precios, va esto y no la
  lista (la lista ya ocupa 4 mensajes).
- **Dólares** (bloque 8, decisión de Tomás del 24/09/2026) → si pregunta si se aceptan y no
  trae ningún monto ("aceptan dólares?", "toman dólares o solo pesos?"): `Sii, aceptamos
  dolares, se toma la cotizacion del dia`, sin número y sin escalar (`preguntaSiAceptanDolares`).
  Con un monto en dólares ("tengo 420 dólares y el resto en pesos"), o si pide el precio o que
  le coticen en dólares ("cuánto sale en dólares?", "y el 14 en dólares?"), escala callado como
  siempre: el número lo da una persona. Desde el bloque 10 ese monto no se lee como pesos y el
  aviso dice `Entrega: US$420` (ver *Qué se lee como entrega*).
- **Mercado Pago** (bloque 8) → si pregunta o avisa ("tengo mercado pago", "puedo pagar con
  mercado pago?") y no dice un monto: `Sii, podes pagar con mercado pago`, sin escalar. Con un
  monto sigue la cotización de siempre.
- **"No tengo tarjeta"** (bloque 8) → los requisitos (`no necesitas tarjeta de credito, es
  con tu dni…`), lea lo que lea Gemini; de contado, `requisitosContado`. Hasta el bloque 8
  escalaba como "otro medio de pago".
- **Seña o que se lo guarden** (bloque 8, decisiones de Tomás del 24/09/2026) → `No hay
  drama, no pedimos seña` y el turno: si todavía no dijo cuándo viene, `queDia` y no escala;
  cuando dice el día (en ese mensaje o en el siguiente), sigue el flujo de turno, que escala
  como siempre. Nunca promete guardar nada. Se lee sobre el mensaje crudo
  (`local.pideGuardar`: "me lo guardás", "reservame", "te dejo una seña", "un adelanto"; "te
  adelanto que…" no).
- **Modelos que no se trabajan** (bloque 8, decisión de Tomás del 24/09/2026) → X, XR, XS,
  XS Max, SE, y del 8 para atrás: `Ese no lo trabajamos, tenemos del 11 al 18 Pro Max` (el
  rango de `RANGO_MODELOS` sin el "igualmente") y `Contame cual te interesa asi te paso el
  precio`, con el saludo del día si va (bloque 9). Sin números y sin escalar, **aunque estén
  cargados** (la copia de la planilla del 08/09 tiene un XR en USADOS). No queda como el
  modelo del chat ni entre los pedidos (`noTrabajado` en `decidir`): el mensaje siguiente no
  lo repite. Si en el mismo mensaje nombra otro, sigue con ese. Un modelo del 11 al 18 que
  falta en la planilla va por "ese justo no me esta quedando" con el más parecido (D7, 29/09/2026:
  ver *Chats desde cero*). **Desde el bloque 10
  tampoco salen en nada que el bot ofrezca por su cuenta** (decisión de Tomás del 25/09/2026):
  la lista de unidades, "el más económico", "otras opciones", la recomendación, "el mejor que te
  llevas", la alternativa y "no me está quedando, pero tengo…". `leerPlanilla` (en
  `src/responder.js`) los saca de LISTA y USADOS en cada lectura; la planilla no se toca. Sin
  Gemini, "x?" o "xr" solos también son esos modelos (bloque 10).
- **Documentación** (`documentación`, `papeles`, `qué necesito llevar`) → `solo tenes que
  traer tu dni, no hace falta tarjeta de credito`. **Si paga de contado** (`pagaDeContado`: la
  última cotización fue de contado, `cotizadoDeContado`, o dijo contado, y ninguna de las dos
  dice cuotas) → `requisitosContado` ("de contado no necesitas nada, solo venir"), sin dni,
  tarjeta, compromiso ni PDF (Mejora 1). También en "necesito dni?" (consulta general) y
  dentro de la cotización.
- **Garantía, requisitos, importados, cuándo arrancan las cuotas** → `DATOS_FIJOS` en
  `src/responder.js`.

## Qué escala siempre a un humano

Canje con los datos del equipo · cliente que acepta · turno, punto de encuentro u horario
(también el de una seña, cuando dice el día) · modelo del 11 al 18 fuera de la planilla ·
lista de precios vencida · descuento sin un modelo claro · esquema de pago propio **con monto
o fecha** · postventa · dólares **con monto o para cotizar** · envíos del equipo · comparar
dos modelos en detalle · facturación · accesorios (comprar, tener, que venga o
compatibilidad) · pagar con tarjeta u otro medio · colores · liberado · pedido de fotos o
videos (bloque 8) · avisa que llegó al local · solo dice su nombre, con una charla en curso ·
"me quedo con el que me recomendaste" cuando no se sabe cuál (bloque 10) · ya compró (`#vendido`,
o la cuenta le cobra la cuota en el historial) y contestó la batería de su equipo sin un canje en
curso (28/09/2026).

**Lo que dijo una persona de la cuenta** (01/10/2026, decisión de Tomás: "el bot tiene que leer
el contexto del chat antes de contestar"; caso Jazz `…5915`). Si una persona de la cuenta
(línea del historial con `humano: true`) dejó algo dicho en las **últimas 72 h**
(`DATOS_VIEJOS_HORAS`) y el mensaje del cliente es sobre eso, el bot **no contesta**: escala
callado (`sigue algo que dijo una persona de la cuenta: "<la línea>"`, que va en el `🔕`). Si
el mensaje es de otra cosa, contesta normal.
- Cuenta algo pendiente ("ahi te confirmo", "consulto al deposito", "te aviso", "mañana entran
  los 13", "dame un rato") o algo acordado con ese cliente (un precio, una reserva, un turno, un
  descuento, una fecha). Un dato que coincide con la planilla ("sii tenemos ip 14 y 14 pro") no.
- Lo decide Gemini en la misma llamada de `entender`, sin llamadas extra: el campo
  **`dijo_persona`** es la frase textual de la persona que el mensaje sigue, o null. El historial
  que va a Gemini distingue "Persona de la cuenta" de "Bot" (hasta el 01/10 los dos eran
  "Vendedor"), y las **últimas 5 líneas de persona** van en su propia sección, con cuándo se
  dijeron: se guardan aparte con su `ts` (`lineasPersona`, `state.lineasDePersona`), así el tope
  del historial no se las lleva. Desde el 01/10/2026 el historial es de 30 líneas (`LARGO_HISTORIAL`).
- **El código valida la frase** (`sigueLoQueDijoUnaPersona` en `src/responder.js`): cuenta solo si
  está, sin tildes, mayúsculas ni signos, en una línea de persona de las últimas 72 h. Si Gemini
  la inventa, se ignora. También vale copiada como la vio Gemini, con "[cliente]" en lugar del
  nombre del cliente (`gemini.sinDatosPersonales`). Una foto o un documento de la persona (línea sin texto) no cuenta.
- **Si Gemini falla** (extractor local, `_geminiFallo`) y hay una línea de persona en la ventana:
  escala callado igual, con lo último que dijo. Sin líneas de persona en la ventana, nada cambia.
  Sin clave de Gemini (`chatear`, `evaluar --offline`) no cuenta como falla.
- **El silencio de 45 minutos** tras una persona sigue igual y va antes que todo esto (`index.js`).
- Lo prueban los casos "Persona (01/10…)" (con la lectura fija), `test/silencio.test.js` (de
  punta a punta) y `test/gemini.test.js` (lo que sale hacia Google).

**Qué empezó a escalar en el bloque 10** (decisiones de Tomás del 25/09/2026, callado, sobre el
mensaje crudo y lea lo que lea Gemini, justo después de la postventa):
- **Llegó al local, o está llegando** (ejemplo aprobado "Estoy acá ya creo";
  `local.llegoAlLocal`): "ya llegué", "estoy afuera", "estoy en la puerta", "estoy acá", "estoy
  llegando", "ahí ya llego". No: el subjuntivo ("a que llegue el 18", "cuando me llegue la
  plata", "te aviso cuando estoy llegando"), una entrega ("ya llegué a juntar los 350.000", "ya
  llego a la entrega?"), "estoy acá en Neuquén" ni "estoy afuera de Neuquén". En `reproducir`
  escalan 9 mensajes reales; uno es "quizás llegamos un poquito atrasados" (viene a un turno:
  también lo tiene que ver una persona).
- **Solo dice su nombre, con una charla en curso** (ejemplo aprobado "Mi nombre es Oriana";
  `local.soloDiceSuNombre`): "soy Oriana", "me llamo Dario", "carlos vizzioli me llamó", con un
  saludo adelante o no. Es para anotarlo, y lo sigue una persona. "Charla en curso" es que haya
  alguna línea del vendedor (del bot o de una persona) en el historial; en un chat nuevo, "hola,
  soy Aylén" sigue como siempre (decisión de Tomás del 25/09). "Soy de Cipolletti", "soy nueva"
  o "soy cliente" no son nombres.
- **"me quedo con ese que me recomendaste" y no se sabe cuál** (`loQueOfrecio` en
  `src/responder.js`): "recomendaste", "me recomendaron", "el que me pasaste" y "el que me
  dijiste" ya no son un pedido de recomendación (antes "que me recomendas" estaba adentro de
  "que me recomendaste" y le volvía a recomendar). Si lo último que le escribió el bot ofreció
  un solo modelo, se toma como elegido y sigue igual que si lo hubiera nombrado; si ofreció
  varios, o lo último lo escribió una persona de la cuenta, escala callado. Sin nada antes ("me
  recomendaron este lugar" en un chat nuevo) sigue su camino. El rango ("del 11 al 18 Pro Max")
  no cuenta como oferta. Para saber quién escribió, **las líneas de una persona entran al
  historial con `humano: true`** (`state.agregarAlHistorial`, desde `index.js`; en los casos, el
  turno `humano`). Por la hora no alcanzaba: `#sigue` pone `ultimoHumano` en 0. Las líneas de
  antes del bloque 10 no tienen la marca y cuentan como del bot.

**Qué dejó de escalar en el bloque 8** (decisiones de Tomás del 23 y 24/09/2026, con los
falsos escalados de `npm run reproducir`):
- **La "x" suelta** ya no es un iPhone X: solo con "iphone", "ip", "el", "un", "tenes" o
  "tienen" delante, o si el mensaje es solo eso ("x?", "iphone x"). El 8, el 7 y el SE, solo
  con "iphone" o "ip" delante (el SE, además, si no sigue otra palabra: "mi iphone se trabó"
  no es un SE). "de las 16" y "cerca de las 14" son horas (`extraerModelos`).
- **Accesorios** (`local.preguntaPorAccesorio`): escala si pregunta por comprar, tener o que
  venga uno (cargador, cable, funda, templado, auricular, caja), o por su compatibilidad ("la
  ficha C"). No si lo nombra al pasar, describe su propio celular ("el mío viene con
  templado", un canje), dice que no lo tiene o lo descarta. "En caja" y "sellado" hablan del
  equipo. De paso: la regex vieja no agarraba los plurales ("venden cargadores?", "con
  algunas fundas me lo das?") y ahora sí.
- **Envíos** (`RE_ENVIO`): el del equipo ("hacen envíos", "me lo mandan", "envían a", "a
  domicilio", "otra provincia", Andreani, correo). "Les envío unos precios", "te mando" y "me
  lo mandaron al chat" no.
- **Tarjeta** (`pagaConOtroMedio`): pagar **con** ella ("puedo pagar con tarjeta?", "y con
  tarjeta?", "aceptan tarjeta?"), débito, Ualá, cuotas del banco o en cuotas por Mercado Pago.
  "No tengo tarjeta" va a los requisitos; "pedís alguna tarjeta?", "¿es con tarjeta?", "¿piden
  tarjeta?" y "¿hace falta tarjeta?" son un requisito (los dos últimos desde el 29/09/2026);
  contar que en otro lado es con tarjeta no es pedirlo. La tarjeta de crédito o una financiera
  no escala desde el 29/09 (D6), y "naranja" suelta es el color.
- **Mercado Pago, los dólares sin monto, la seña y los anteriores al 11** tienen su respuesta:
  ver *Respuestas fijas*.

**Escalar en silencio.** Donde antes el bot prometía que otra persona iba a responder
(`ahora te responde fran`, `dejame verlo con fran`, `si preferis te llama fran`), ahora
**no le dice nada al cliente** y avisa al grupo con `🔕 SIN RESPUESTA`. Pasa en: postventa o
pide una persona · esquema de pago propio · dólares con monto o para cotizar · pedido de
fotos o videos · mensajes que no se entienden · audio que no se pudo transcribir. Como el
cliente no recibe nada, el aviso no puede perderse:

- no depende de `escalado`: un chat ya escalado por otra cosa igual avisa;
- un motivo nuevo avisa de nuevo; el mismo motivo, una vez cada `SILENCIO_TRAS_HUMANO_MIN`;
- se da por avisado recién si salió; si falló, reintenta con el próximo mensaje;
- en escucha no sale nada; en borrador sale el aviso pero no escala ni anota el lead.

**Sin promesas de contacto posterior** (Mejora 1, decisión del negocio del 16/09/2026): al
escalar, el bot tampoco promete que él va a volver ("te aviso", "te confirmo", "me fijo",
"dame un minuto y te paso el numero"). Si el mensaje era solo la promesa, no sale; si tenía
algo útil, sale sin la promesa. Escalan sin mensaje:
- temas sin dato (liberado, accesorios, factura, otro medio de pago, envíos, comparar, cantidad);
- pedido de fotos o videos (bloque 8), con qué hacer en el aviso: ver *Fotos*;
- llegó al local, solo su nombre con una charla en curso, y "el que me recomendaste" sin saber
  cuál (bloque 10);
- canje, cuando manda los datos del equipo (bloque 5);
- ya compró (muestra de repro-v1, decisión de Tomás del 28/09/2026): el chat está marcado
  `#vendido` (`resultado.tipo`), o en el historial guardado hay una línea de la cuenta que
  cobra la cuota (`cobraLaCuota`: la cuota junto con un pedido de transferir o el comprobante,
  alias, demora, aumenta/sube/pasa a, o el pago o comprobante de la cuota; las líneas del bot
  con la financiación, "1 o 2 cuotas", "2 pagos de $64.000", "contado… o financiarlo hasta en 2
  cuotas", y una persona explicando cómo se paga, "la primera cuota la podes hacer por
  transferencia", no cuentan). Todo mensaje que no nombre un modelo (`local.extraerModelos` sobre el
  texto) escala como *postventa o cliente que pide una persona*; "tenés el 15?" y "precio del
  13 pro" siguen como venta;
- contestó la batería de su equipo ("90", "90%") a una persona, sin canje en curso en el estado
  (28/09/2026): motivo *contestó la batería de su equipo (90%), que le preguntó una persona*;
- descuento sin un modelo claro (bloque 5);
- "no entiendo qué necesita" (`callar: false`);
- lista no vigente;
- no cotizable;
- no pude cotizar;
- día y hora dichos;
- `redactar` con `[SIN_DATO]`.

Con mensaje, pero sin la promesa:
- modelo que no está cargado ("ese justo no me esta quedando" + el más parecido, D7 del
  29/09/2026 + "te interesaba solo ese modelo?"), sin callar el chat (Mejora 1b);
- colores ("cualquier cosa decime que modelo te interesa mas y te muestro ese"), sin callar el
  chat (Mejora 1b);
- el pedido de datos del canje, sin "asi te cotizamos" (bloque 5).

"te lo dejo anotado igual" queda: el monto se guarda en `entrega` y sale en el resumen. La regla
global de `evaluar` "no promete avisarle, confirmarle ni fijarse después" lo cuida en todo el
banco.

Lo prueba `test/silencio.test.js`. En `casos.js` esos turnos llevan `silencio: true`.

**Un chat escalado queda callado** (`src/control.js`, desde el 15/09/2026). Al escalar, el bot
no le manda nada más a ese cliente: lo que escriba entra al historial y no se contesta. El
aviso al grupo sale **en el momento del escalado**, como siempre.

- **No callan los escalados de "no entendí"** (`callar: false`): *mandó varios mensajes que no
  se entienden*, *no entiendo qué necesita el cliente* y *audio que no se pudo transcribir*.
  Avisan al grupo y siguen apareciendo en el resumen, pero el bot sigue atendiendo. Si callaran,
  un cliente al que no se le entendieron dos mensajes quedaría sin respuesta hasta que alguien
  lo tome, y el crédito sin venta nunca llegaría a su `🤐`.
- **Tampoco callan los dos escalados que terminan en una pregunta al cliente** (Mejora 1b,
  decisión de Tomás del 16/09/2026): *modelo que no está cargado* ("te interesaba solo ese
  modelo?") y *colores* ("decime que modelo te interesa mas"). El 🔔 LEAD sale igual; si el
  cliente contesta "dale, pasame el X", un monto u otro modelo, sigue el flujo normal. Los
  **turnos** ("que dia te podes acercar?", "en que horario?") quedan callados a propósito: el
  turno lo confirma una persona. Lo prueba `test/control.test.js`, sección "Mejora 1b".
- **Un solo recordatorio por escalado**, a los `ESCALADO_RECORDATORIO_MIN` (30 min), y solo si
  el cliente escribió algo después y nadie de la cuenta lo tomó: `⏰ ESCALADO SIN TOMAR`, con el
  motivo, lo que escribió y el link. Un chat pausado o marcado con `#vendido` / `#perdido` no se
  recuerda. **De noche no suena** (Pendientes 2): usa la franja de los recordatorios manuales,
  de `RECORDATORIO_HORA` (8) hasta antes de `SEGUIMIENTO_HORA_HASTA` (22), con el mismo
  `horario()` y `enHorario` de `src/recordatorios.js`. Si se cumple fuera de la franja no se
  descarta: sale en la primera vuelta dentro de la franja, una sola vez (escaló a las 23:00 →
  suena a las 8:00). El aviso del escalado en sí, el primero, sigue saliendo en el momento.
- **Vuelve solo, de dos formas.** Si alguien de la cuenta escribe en el chat, queda tomado y el
  bot vuelve cuando pasa el silencio de siempre (45 min). Si el cliente escribe pasadas
  `ESCALADO_REANUDAR_HORAS` (24 h) sin que nadie lo tome, se atiende como consulta nueva: se
  borran las marcas de "esto ya se dijo" (lista, stock, cotización, forma de pago,
  seguimiento, acuses, crédito sin venta, y `modeloPropuesto`) y se conserva lo que dijo el
  cliente (nombre, modelo, entrega, notas, temas explicados, historial y `resultado`). Si
  además pasaron `DATOS_VIEJOS_HORAS`, se limpia también lo del cliente: ver *Datos viejos por
  tiempo*.
- **El lead se anota una sola vez por consulta** (`leadRegistrado`). Sobrevive a la vuelta de
  un escalado a las 24 h y se limpia con los datos viejos (Pendientes 2): si el contacto vuelve
  pasadas `DATOS_VIEJOS_HORAS` y vuelve a escalar, es una fila nueva en LEADS. Hasta entonces
  sobrevivía a todo, y el que volvía semanas después avisaba al grupo pero no sumaba fila.
- **`#sigue`, en el chat o desde el grupo, lo limpia** y el bot vuelve ya. Desde el 07/10/2026, en un
  chat de Sonnet le contesta lo que el cliente dejó escrito (ver la tabla de comandos).
- `/salud` dice cuántos escalados sin tomar y cuántos pausados hay, y el resumen los lista en
  `⏳ TE ESTÁN ESPERANDO A VOS` con el motivo y cuánto escribió después el cliente.

Lo prueba `test/control.test.js`.

## Fotos

Bloque 8 (decisiones de Tomás del 24/09/2026). La carpeta es la de siempre, `fotos/`
(`FOTOS_DIR`): una imagen por modelo (`13.jpg`, `14 pro.png`, `15-pro-max.jpg`). Hoy no existe;
la carga Tomás. Sin foto de un modelo el bot no la menciona ni la promete.

- **La foto automática al elegir un modelo** queda: la foto y `te paso una foto de
  referencia` (antes "te paso fotos del equipo asi lo ves bien": es de referencia, no la del
  equipo que se lleva).
- **Cuando el cliente pide fotos o videos, escala callado** (`local.pideFotos`, antes que los
  descuentos, los momentos de tono y los temas sin dato). Pide **recibirlas**: "me mandás
  fotos?", "me pasás unas fotos del 15?", "tenés fotos?", "te jodo si me envías fotos o videos
  de ambos, del 15 y 16?", "ftos y precios", "nunca me enviaste las fotitos". El verbo va en
  presente o condicional; en pasado, solo negado ("lo que me enviaste en el video" es una
  postventa). El que manda fotos de su celular en un canje ("te mando las fotos", "ahí van",
  "fotos?" suelto con el canje en curso) sigue el camino del canje. Los colores siguen como
  estaban.
  - **Modelos del pedido:** los del mensaje; si no nombra ninguno, el del chat (`modelo`, o el
    último cotizado, `cotizadoDe`). Si tampoco hay, el aviso dice que no dijo de qué modelo.
  - Queda en el chat el pedido pendiente: `fotosPedidas: { modelos, ts }` (se guarda al
    decidir, en cualquier modo; lo pisa el próximo pedido y lo borra `#sinstock` o `#reset`).
  - **El aviso al grupo** es el `🔕 SIN RESPUESTA` de siempre, con el motivo ("pide fotos o
    videos del iPhone 15 y del iPhone 16") y una línea más (`paraElGrupo`, que `decidir`
    devuelve y `escalarEnSilencio` pasa a `avisoParaGrupo`): `Si tenés el equipo, mandale las
    fotos vos; si no hay stock: #sinstock 5492990000000`.
- **`#sinstock <número>`, escrito por la cuenta en el grupo interno.** Mismo patrón que
  `#pausa` y `#vendido` (`control.comando`, `control.desdeGrupo`,
  `ventas.elegirChatDesdeGrupo`). Por cada modelo del pedido pendiente que tenga foto
  (`fotos.buscar`), le manda al cliente la foto **sola, sin texto**, con `acciones.foto`, por
  el mismo camino que la foto automática (`mandarFoto` en `index.js`: autoría, marcas,
  `botEnvio` e historial), con "escribiendo…" y `ENTRE_MENSAJES_MS` antes de cada una y como
  mucho `MAX_MENSAJES_TANDA` (4). **Los candados son los de siempre**: en escucha, en borrador
  o con un número fuera de las listas de prueba (`leLlegaAlCliente`) no le manda nada y el
  grupo se entera de qué habría mandado; `evolution.enviarImagen` vuelve a mirar la lista, la
  carpeta y la extensión. En el grupo contesta qué mandó (`📷 #sinstock · …`), y de un modelo
  sin foto: `No tengo foto de referencia del iPhone 16: mandásela vos`. Después borra el pedido.
  **El chat sigue escalado:** el bot vuelve con `#sigue`. Sin número, o sin pedido pendiente,
  contesta cómo se usa y no manda nada.

Lo prueba `test/fotos-pedido.test.js` (9 checks, con un Evolution de mentira y fotos
inventadas en un `FOTOS_DIR` temporal); en `casos.js`, los pedidos van con `silencio: true` y
la foto automática con el campo `fotos` del caso.

**Las fotos que manda el cliente** son otra cosa: en un chat del bot de siempre, una foto sin
epígrafe solo cuenta como "mandó fotos" en un canje en curso (desde cero, D1: `soloFotos`). En un
chat que atiende Sonnet, desde el 06/10/2026 Sonnet las ve (hasta 3 por tanda, con o sin
epígrafe): ver *Cerebro Sonnet: ve las fotos del cliente*.

**Las fotos de los equipos del local que manda Chiara** (08/10/2026, solo con `STOCK_APP_MODO=vivo`) viven
en la misma carpeta, en subcarpetas por modelo (`fotos/iPhone 15/`) con el índice `fotos/indice.json`: cuando el
cliente pide fotos, Sonnet llama a `mandar_fotos` y el código manda una foto por unidad del local con su pie
("15 128gb 87% 740.000"). El catálogo de acá (las sueltas por modelo, `#sinstock`) no cambia. Ver *Chiara manda
fotos de los equipos del local*.

## Datos viejos por tiempo (Pendientes 1, B3)

Decisión de Tomás del 18/09/2026, hecho el 20/09/2026. `RESET_DE_LA_CHARLA` corría solo
cuando volvía un escalado a las 24 h y dejaba el modelo, la entrega, la forma de pago, la
capacidad, la permuta y el presupuesto: un cliente que nunca escaló y vuelve a la semana
arrancaba con el modelo y el monto de hace semanas (con una permuta guardada, a un "hola" le
contestaba "sin almacenamiento… no te puedo pasar el numero exacto").

- **Cuándo.** Llega un mensaje de un cliente y la última actividad del chat es más vieja que
  `DATOS_VIEJOS_HORAS` (72). Última actividad = el `ts` más nuevo del `historial`, de
  cualquiera de los dos lados; sin historial, `ultimaLectura.ts` (desde Pendientes 1
  `ultimaLectura` lleva fecha). Se mide **antes** de anotar la línea nueva, y corre en
  `src/index.js` antes de interpretar, en el mismo lugar que el escalado vencido, para todos
  los chats. Un chat escalado y viejo pasa por las dos limpiezas.
- **Qué limpia** (`control.limpiarDatosViejos`): lo de `RESET_DE_LA_CHARLA` y además `modelo`,
  `modeloPropuesto`, `entrega`, `forma_pago`, `capacidad_gb`, `permuta`, `presupuestoAnotado`,
  `timing`, `saludoEn` (hasta el bloque 9, `yaSaludo`), `primerIphoneDicho`, `permutaDatosPedidos`, `compromisoEnviado`,
  `descuentoPedidos`, `descuentoDe`, `cotizadoDeContado` y, desde Pendientes 2,
  `leadRegistrado` (va en `DATOS_QUE_CADUCAN` y no en `RESET_DE_LA_CHARLA`: la vuelta a las
  24 h no suma fila).
- **También da por resuelto un escalado que hubiera quedado abierto** (Pendientes 2, decisión
  de Tomás del 21/09/2026). Los escalados de "no entendí" no callan el chat, así que no vencen
  (`control.vencido` se mira solo en los callados) y quedaban `escalado: true` hasta que
  escribiera alguien de la cuenta; con eso, la consulta nueva no podía escalar, callar ni anotar
  su fila. **El orden importa:** `limpiarDatosViejos` llama a `control.resolver` **antes** de
  limpiar, porque `resolver` completa `leadRegistrado` con la fecha del escalado, y después
  volvería a tapar el lead. El log lo dice: `(tenía un escalado sin tomar: queda resuelto)`.
- **Qué no toca:** `nombre`, `zona`, `notas`, `modelosPedidos`, el `historial`,
  `temasExplicados`, `resultado`, `botEnvio` y los recordatorios.
- Queda en el log: `[datos viejos] <chatId>: <N> h sin actividad, lo atiendo como consulta
  nueva`. Al grupo no se le avisa nada.

Lo prueba `test/control.test.js` (sección "Datos viejos por tiempo") con reloj simulado:
las fechas del chat se corren hacia atrás.

## Qué nunca hace

Inventar precio, stock, color o plazo · tasar un canje · negociar el mínimo por chat ·
decirle al cliente cuánto le falta · ofrecer descuentos por su cuenta (el único es el del
segundo pedido) · prometer horarios · **prometer
que otra persona le va a responder** (Fran, Tomi o quien sea) · mandar un precio sin el %
de batería · dar un solo número (siempre 1 pago + 2 pagos; el contado solo si lo pregunta o
si la entrega alcanza para pagarlo entero) · ofrecer más de 2
cuotas · decir que es un bot · prometer fotos que no tiene · seguimiento vacío tipo
"¿seguís buscando?".

La promesa a nombre de otro la caza una regla global de `evaluar` **por la forma de la
frase** (verbo de responder + nombre: `te llama X`, `que te ayude X`, `verlo con X`,
`X te va a llamar`), no por una lista de nombres. Se prueba a sí misma al arrancar con 11
promesas y 11 frases sanas. No caza promesas sin nombre (`ahora te van a escribir`).

---

## Tono

Rioplatense, informal, **mensajes cortos y partidos**, una idea por mensaje.
**Cada mensaje arranca con mayúscula** (lo aplica `capitalizar()` al final de todo). La
plantilla de cotización y la lista de precios llevan su propio formato y no se tocan.
`src/estilo.js` rota variantes de cada frase sin números para no sonar a plantilla; ahí viven
también la explicación de la financiación (`explicaFinanciacion`) y el pie del compromiso de
pago (`pieCompromiso`), con lo que cada variante tiene que decir sí o sí (bloque 3b).

**Que no conteste seco** (Bloque Tono, decisión de Tomás del 17/09/2026): cuando el cliente
venía hablando, una línea correcta pero pelada ("Para el 13 la entrega inicial es de
$320.000") no lo hace sentir escuchado. La línea de la entrega inicial y la frase de excepción
antes de la ficha con recargo retoman lo que dijo y lo acompañan, en dos o tres oraciones
(ver *Cuando la entrega no llega al mínimo*). Las frases salen del vocabulario real de
`data/aprendizaje.jsonl` (respuestas de Tomás y Fran): "para retirarlo lo estamos pidiendo con
… de entrega inicial", "pedimos por lo menos …", "el resto en 1 o 2 cuotas", "algo organizamos
para que te lo puedas llevar", "tranqui". Por eso la regla "los mensajes son cortos" de
`evaluar` pasó de 220 a **400** caracteres; el tope de 4 mensajes por tanda no cambia.

Muletillas: `dale`, `dale joya`, `perfecto`, `contame`, `quedo atento`, `tranqui`,
`no te hagas drama`, `buenass`, `sii`.

**El nombre en el saludo** sale del pushName de WhatsApp y se deforma estirando la última
letra (`tomas` → `tomass`), **solo si hay un nombre de verdad**: la primera palabra de 2
letras o más, con alguna vocal y sin ser una letra repetida. Emojis, símbolos y números se
limpian (`~$hernan` → `hernann`, `eze🇸🇪` → `ezee`); con iniciales o solo emojis (`🇦🇷RSS`,
`HH`, `O`, `😃😃`) saluda sin nombre. Antes salían `🇦🇷Rsss, como va todo?`, `Hhh` o un
emoji partido por la mitad. Los nombres viejos guardados en `estado.json` también se
limpian al usarse.

### El saludo del día (bloque 9)

Decisiones de Tomás del 24/09/2026, tras la prueba en vivo: después de un `#reset`, "buenass
como estan tenes iphone 14 pro? 15 pro? tengo 200.000" no saludó ni devolvió el "cómo están".
Hasta el bloque 9 cada camino agregaba el saludo con la marca `yaSaludo`, y la mayoría no lo
tenía ("hola, tenes iphone 14 pro y 15 pro?" arrancaba con "Buenisimo, te paso…").

- **Cuándo:** en la primera respuesta del chat (también después de un `#reset`) y en la
  primera de cada día, aunque hayan hablado otro día. "Hoy" es el día de Argentina
  (`America/Argentina/Buenos_Aires`), no el de la PC. **No va si hoy ya le escribió alguien
  de la cuenta:** salió el saludo de hoy (`saludoEn`), una persona escribió hoy
  (`ultimoHumano`), o hay una línea del vendedor de hoy en el historial (lo que mandó el bot o
  escribió una persona). Si Fran ya le habló hoy, el bot no saluda. Es `hablaronHoy` en
  `src/responder.js`.
- **Solo si algo le llega:** escalar callado, un acuse repetido o el `🤐` no llevan saludo.
- **Un solo lugar:** `decidirYFormatear`, después de sacar lo repetido (el saludo de ayer
  puede seguir en las 15 líneas y hoy va igual). Ningún camino saluda por su cuenta. Sin
  modelo, "retomar" ("tomass, contame que estas buscando…") va solo si hoy ya se habló; si no,
  el saludo del día y `queModelo`: el nombre una sola vez.
- **Cómo:** `saludo` con el apodo (`deformar`) o `saludoSinNombre`. Si pregunta cómo estamos
  (`preguntaComoEstan`: "como estan", "como andan", "como va", "que tal", "todo bien?"; no
  "como estan de precio", "como va la financiacion", "que tal el 14 pro"), contesta y la
  devuelve: `saludoDevuelve` / `saludoDevuelveSinNombre` (4 variantes cada una: "hola tomass!
  bien por suerte, vos?").
- **Tope de 4:** va como primer mensaje aparte. Si con él la tanda pasara de 4, se pega al
  primero con un salto de línea y lleva las marcas de los dos (`conSaludo`). Si ese primero
  fuera el PDF, una foto o la cotización (hoy ninguna respuesta de 4 arranca así), no se pega
  y ese día el saludo no va: un documento nunca se convierte en texto. Con Sonnet es igual
  (`comoResultado` llama a `conSaludo`, después del PDF): las reglas solo dicen "el saludo lo
  pone el sistema", sin decir dónde (decisión de Tomás del 08/10/2026: aparte con menos de 4 y
  pegado solo con 4, en todos los chats; hasta ese día *Modelos* decía "pegado al primero").
- **La marca:** `saludoEn`, cuándo salió el saludo, marca del bot que se confirma al enviarse
  (el `sinVenta` del primer mensaje también viaja con el saludo). Reemplaza a `yaSaludo`, que
  no se lee más (`true` no dice de qué día es). La limpian `#reset` y los datos viejos. En
  escucha y en borrador no sale nada: cada borrador saluda hasta que escribe una persona, como
  antes con `yaSaludo`.
- Lo prueban `test/saludo.test.js` (el día de Argentina con la PC en otra zona, las tres
  fuentes de "hoy ya se habló", las marcas y qué cuenta como preguntar) y los casos "Bloque 9"
  de `test/casos.js` (`saluda`, `pasanHoras`, `reset`).

**Momentos de tono que importan** (de estos salieron ventas en el corpus):
se disculpa → contener, nunca presionar · agradece → cierre cálido · lo va a pensar →
puerta abierta sin insistir · le parece caro → ofrecer el escalón de abajo · dice que es su
primer iPhone → reconocerlo antes del número.

---

## Contexto: qué lee el bot antes de contestar

Diagnosticado el 14/09/2026. De las tres opciones se implementó la A, recordar por tema: ver
*Memoria por tema*.

- `state.js` guarda las **últimas 15 líneas** de cada chat (`LARGO_HISTORIAL`), cliente y
  vendedor mezclados, **no 15 mensajes del cliente**. El bot manda 2 a 4 líneas por turno:
  a los 4 turnos quedan 3 mensajes del cliente. En `estado.json` la mediana es 7 de 15.
- Desde el 01/10/2026 las líneas de una persona de la cuenta se guardan además aparte (las últimas
  5, con su hora: `lineasPersona`), y el historial que lee Gemini dice "Persona de la cuenta" o
  "Bot" en vez de "Vendedor". Ver *Qué escala siempre a un humano*.
- **Gemini `entender`** recibe esas 15 líneas, solo para extraer datos (el JSON de
  intención, modelo, monto y, desde el 14/09/2026, una `nota`). **Gemini `redactar`** no
  recibe historial, solo las notas guardadas (ver *Notas del cliente*). Ningún prompt le
  dice que no repita.
- `analizarConversacion()` marca: dirección dada, ya cotizado, stock confirmado, compra
  confirmada. Hay marcas persistentes en el estado: `listaEnviada`, `compromisoEnviado`,
  `preguntamosFormaPago`, `stockInformadoDe`, `saludoEn` (el saludo del día, bloque 9; antes
  `yaSaludo`) y, desde el 14/09/2026,
  `temasExplicados` (financiación, requisitos, garantía y métodos de pago).
- `decidirYFormatear()` filtra mensajes **idénticos** de los últimos 15. Como `estilo.js`
  rota variantes, una repetición casi nunca es idéntica; y si se filtra todo, igual manda
  el último.
- Consecuencia medida sin conexión: repite requisitos en los turnos 5, 7 y 8 de una misma
  charla, y la financiación del turno 2 vuelve en el 8, cuando ya salió de las 15 líneas.
  En los registros reales casi no se ve porque en modo escucha lo que el bot propone no
  entra al historial.

---

## Variables de entorno

Todas se leen en `src/config.js`. Las marcadas con ★ se agregaron en septiembre de 2026.

| Variable | Default | Qué hace |
|---|---|---|
| `PORT` | 3001 | Puerto del webhook. |
| ★ `HOST` | vacía | Vacía: escucha en todas las interfaces, como siempre. `127.0.0.1`: solo esta PC; hay que probar que Evolution (Docker) siga llegando. Hasta el 15/09/2026 existía con default `127.0.0.1` pero no se usaba. |
| ★ `WEBHOOK_SECRETO` | vacía | Con valor, el webhook solo acepta `POST /webhook/<secreto>` (401 al resto). Va también en `.env.docker`, al final de `WEBHOOK_GLOBAL_URL`. Vacía: acepta `/webhook` y lo avisa al arrancar. Ver README. |
| ★ `WEBHOOK_MAX_POR_MINUTO` | 600 | Tope de pedidos aceptados por minuto (429 al resto). No está activo en `.env.example`. |
| `EVOLUTION_URL` / `EVOLUTION_INSTANCE` / `EVOLUTION_APIKEY` | localhost:8080 / somosiphone / — | Evolution API. |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | — / gemini-3.5-flash-lite | Sin clave usa el extractor local y no transcribe audios. El default cambió el 30/09/2026 (era `gemini-2.5-flash`): ver *Los modelos de Gemini*. |
| `ANTHROPIC_API_KEY` / `CEREBRO_MODO` | — / `apagado` | Cerebro Sonnet (01/10/2026): con `sombra`, Sonnet piensa con cada tanda y se anota, sin mandar nada; con `apagado` no se llama nunca a la API. Fase 2 (02/10/2026): `tester`, `nuevos` y `todos`, Sonnet contesta de verdad (ver *Cerebro Sonnet, fase 2*). También `CEREBRO_MODELO` (`claude-sonnet-5-5`), `CEREBRO_TIMEOUT_MS` (20000), `CEREBRO_ESFUERZO` (`medium`) y `CEREBRO_USD_ENTRADA` / `_SALIDA` / `_CACHE_LEIDA` / `_CACHE_ESCRITA` (2 / 10 / 0,20 / 2,50). Ver *Cerebro Sonnet (fase 1, en sombra)*. |
| ★ `CEREBRO_TOPE_MES_USD` | 60 | El tope de gasto de Sonnet del mes, en USD (bloque Ninjo 2, 06/10/2026), para verlo en `/salud` (`cerebro.gastoMes`, con el porcentaje) y para el aviso al grupo al pasar el 80%, una vez por mes. **No corta nada**: el tope de verdad está puesto en la cuenta de Anthropic. Ilegible o en cero vuelve a 60. Desde el 08/10/2026 es también el del panel (`tope_mes_usd`): si no está, vale `CHIARA_TOPE_MES_USD` (la del panel, la de antes); si tampoco, 60. |
| ★ `GEMINI_MODEL_RESPALDO` | gemini-3.1-flash-lite | Otro modelo con su propio cupo. Se pasa a él si el principal está saturado, no responde, no existe (404) o se quedó sin cupo del día (429 por día), un solo intento (arreglos en vivo, 30/09/2026). Antes era `gemini-3.5-flash-lite`, elegido el 14/09/2026; ver *Los modelos de Gemini*. |
| `SHEET_ID` / `GOOGLE_CREDENTIALS_PATH` / `SHEET_CACHE_SEGUNDOS` | — / ./credenciales.json / 300 | Planilla. |
| `GRUPO_AVISOS_JID` | — | Grupo interno. **Tiene que ser un grupo (`@g.us`)**: otro destino se bloquea. |
| `MODO_ESCUCHA` | false (`.env.example`: true) | No manda nada, ni al cliente ni al grupo. |
| `MODO_BORRADOR` | **true** | No le escribe al cliente; manda el borrador al grupo. |
| `ESPERA_MIN_MS` / `ESPERA_MAX_MS` | 20000 / 45000 | Espera antes de contestar. |
| `ENTRE_MENSAJES_MS` / `MAX_MENSAJES_TANDA` | 1800 / 4 | Ritmo dentro de una tanda. |
| `SILENCIO_TRAS_HUMANO_MIN` | 45 | Si contestó una persona, el bot se calla ese rato. También es la ventana del aviso en silencio. |
| ★ `ESCALADO_RECORDATORIO_MIN` | 30 | Minutos desde que escaló para el único recordatorio al grupo, si el cliente escribió después y nadie lo tomó. Suena solo entre `RECORDATORIO_HORA` y `SEGUIMIENTO_HORA_HASTA`; si se cumple de noche, sale a la mañana. |
| ★ `ESCALADO_REANUDAR_HORAS` | 24 | Pasadas estas horas sin que nadie lo tome, un mensaje nuevo del cliente se atiende como consulta nueva. |
| ★ `DATOS_VIEJOS_HORAS` | 72 | Cualquier chat, escalado o no: pasadas estas horas sin actividad, el próximo mensaje se atiende como consulta nueva (se borran modelo, monto, forma de pago, permuta, las marcas del bot y `leadRegistrado`, y se resuelve un escalado que hubiera quedado abierto: si vuelve a escalar, es una fila nueva en LEADS). Ver *Datos viejos por tiempo*. |
| ★ `GUARDIAN_ACTIVO` | **true** | Guardián de Evolution: avisa al grupo interno cuando dejan de llegar los mensajes. Solo le escribe al grupo, nunca a un cliente, y no reinicia nada. `false` apaga los dos controles (y no queda ninguna alerta de desconexión). Ver *Guardián de Evolution*. |
| ★ `GUARDIAN_MIN` | 5 | Cada cuántos minutos mira el guardián. Ilegible o en cero vuelve a 5. |
| ★ `GUARDIAN_SIN_MENSAJES_MIN` | 45 | Con la instancia en `open`, minutos sin que **entre** ningún mensaje por el webhook antes de avisar (los propios no cuentan: `ultimoEntrante`). Solo se mira entre `SEGUIMIENTO_HORA_DESDE` y `SEGUIMIENTO_HORA_HASTA`, y se cuenta desde que abrió la franja de hoy. |
| `IGNORAR_ANTERIORES_SEG` | 120 | Descarta mensajes viejos (la sincronización al vincular el QR). |
| `FOTOS_DIR` | ./fotos | Fotos por modelo. Si no hay, no se mencionan. También es la única carpeta de la que se puede mandar una imagen. |
| `DOCS_DIR` | documentos/ del repo | El compromiso de pago. También es la única carpeta de la que se puede mandar un documento. No está en `.env.example`. |
| `SEGUIMIENTO_ACTIVO` | true (en el `.env` real, apagado) | El seguimiento después de un precio o una cotización (bloque Ninjo 1b): hasta 2 mensajes. Lo prende Tomás. `SEGUIMIENTO_MINUTOS` ya no lo usa. |
| ★ `SEGUIMIENTO_HORAS_1` | 3 | Cuántas horas después del precio sale el 1º (bloque Ninjo 1b). |
| ★ `SEGUIMIENTO_FRANJA_DESDE` / `SEGUIMIENTO_FRANJA_HASTA` | 10 / 21 | Franja del seguimiento, hora de Argentina (no la de la PC). Si las 3 horas caen fuera, el 1º sale cuando abre la siguiente. |
| ★ `SEGUIMIENTO_MANANA_HASTA` | 12 | El 2º sale el día siguiente al 1º, entre `SEGUIMIENTO_FRANJA_DESDE` y esta hora. |
| `SEGUIMIENTO_HORA_DESDE` / `SEGUIMIENTO_HORA_HASTA` | 9 / 22 | Ya no son del seguimiento (bloque Ninjo 1b): `HASTA` cierra los recordatorios manuales y el recordatorio del escalado, y las dos son la franja en la que el guardián mira si llegan mensajes. |
| `SEGUIMIENTO_MAX_POR_BARRIDO` | 2 | Tope de seguimientos por vuelta. No está en `.env.example`. |
| `SEGUIMIENTO_MAX_HORAS` | 24 | Un precio de hace más que esto no recibe el 1º seguimiento. Hasta el 15/09/2026 se leía y no se usaba: le escribía a chats de hace una semana. |
| ★ `SILENCIO_MAX_HORAS` / `SILENCIO_MAX_POR_BARRIDO` | 72 / 3 | Cuando vence el silencio de una persona (bloque Ninjo 1b, `revisarSilencios`): una línea del cliente sin respuesta de menos de estas horas la atiende Sonnet, hasta estos chats por barrido. |
| `RESUMEN_ACTIVO` / `RESUMEN_HORA` / `RESUMEN_DIAS_FRIO` | **false** / 9 / 3 | Resumen de la mañana. Se enciende a mano después de `npm run destino`. |
| ★ `RECORDATORIO_HORA` / `RECORDATORIO_MAX_REPETICIONES` | 8 / 10 | Recordatorios manuales. `RECORDATORIO_HORA` abre también la franja del recordatorio del escalado (Pendientes 2). |
| ★ `MENSAJES_SIN_VENTA` | 5 | Mensajes seguidos sin señal de venta antes de dejar de contestar. No está en `.env.example`. |
| ★ `AUDIO_ACTIVO` | true | Transcribe notas de voz. `false` apaga solo eso. |
| ★ `NUMEROS_TESTER` | vacía | El celular de prueba. Con contenido (en esta o en `NUMEROS_PILOTO`), **solo** les escribe a esos números; al resto lo trata como borrador. Además, el tester manda comandos `#` desde su chat, su lead va a `LEADS_PRUEBA` y no sale en el resumen. No dejarla puesta. Hasta el 20/09/2026 se llamaba `NUMEROS_PRUEBA`: si `NUMEROS_TESTER` está vacía y `NUMEROS_PRUEBA` tiene contenido, se lee esa y el bot avisa al arrancar `NUMEROS_PRUEBA quedó viejo, pasalo a NUMEROS_TESTER`. |
| ★ `NUMEROS_PILOTO` | vacía | Clientes reales de la prueba: reciben los envíos como el tester y para todo lo demás son clientes (`#` es un mensaje común, lead en `LEADS`, salen en el resumen). Con `todos` (27/09/2026), en vivo para cualquier chat, con el tester aparte. |
| `SOLO_CHATS_NUEVOS` | vacía (apagado) | Con `true` (28/09/2026; definición del 29/09/2026), el bot solo le escribe a un chat nuevo: uno que empezó desde cero con el bot mirando y donde nunca escribió nadie de la cuenta. Un chat viejo (en la lista de chats viejos, o donde escribió una persona) va como borrador aunque sea piloto o `todos`; mientras la lista no está al día, todos. El tester no cambia. Necesita la semilla (`npm run sembrar-viejos`). Ver *Chats viejos*. `/salud` lo muestra, con `chatsViejos`. |
| ★ `CONTACTOS_PERSONALES` | vacía | Lista negra: esos chats se ignoran enteros. |
| ★ `STOCK_APP_MODO` | `apagado` | El stock de la app en la planilla (08/10/2026): `sombra` escribe "USADOS APP", aplica las órdenes de STOCK y copia STOCK, Chiara contesta como siempre; `vivo` escribe USADOS y Chiara usa lo nuevo (local primero, el depósito con STOCK, `[deposito]`, el código al escalar). Ver *El stock de la app en la planilla*. |
| `ESTADO_PATH` / `APRENDIZAJE_PATH` | data/… | Solo para pruebas: apuntan a archivos temporales. |
| ★ `ESTADO_SOLO_LECTURA` | vacía | `1`: el estado se carga y se migra en memoria, pero no se escribe nunca, ni al salir. Lo ponen solos `npm run resumen` y `npm run destino`. Ver *Persistencia del estado*. |

Las tres listas comparan por número sin el 54 y sin el 9 de celular, y piden al menos 8
dígitos para el sufijo (`estaEnLaLista`, la comparación única). **Sin uso en el código**
(quedaron en `config.js`): `AGRUPAR_CLIENTE_MS`, `DESCARTADOS_PATH`.

### Los modelos de Gemini (arreglos en vivo, 30/09/2026)

Decisión de Claude del 30/09/2026, con las páginas de precios y de bajas de Google de ese día:

| Modelo | Entrada / salida por millón de tokens | Baja |
|---|---|---|
| `gemini-3.5-flash-lite` | US$0,30 / US$2,50 | sin fecha |
| `gemini-3.1-flash-lite` | US$0,25 / US$1,50 (audio US$0,50) | 07/05/2027 |
| `gemini-2.5-flash-lite` | — | sin fecha, pero Google lo limita a quienes ya lo usaban |

- **El principal** es `gemini-3.5-flash-lite` (default de `GEMINI_MODEL`; hasta el 30/09 el
  default era `gemini-2.5-flash` y el `.env` tenía `gemini-2.5-flash-lite`).
- **El respaldo** es `gemini-3.1-flash-lite` (default de `GEMINI_MODEL_RESPALDO`): el más
  barato y con su propio cupo. `gemini-2.5-flash-lite` sale.
- **Cuándo se pasa al respaldo** (`llamar` en `src/gemini.js`): como siempre, si el principal
  está saturado (503, 5xx, 429 por minuto) o no responde (timeout, sin red); y desde el 30/09,
  si el principal **no existe** (404: Google lo retiró) o **se quedó sin cupo del día** (429
  por día), un solo intento con el respaldo. Si el respaldo también falla, sigue lo de siempre:
  el error con su mensaje (dice también qué dio el principal) y el extractor local. Un 404 o
  un 429 por día **del respaldo** no se reintenta. Lo prueba `test/gemini-respaldo.test.js`
  con el `fetch` de mentira.
- Lo del "16/10/2026" (una baja de `gemini-2.5-flash-lite` anotada el 14/09) se sacó de todos
  lados: Google no la confirma. **El `.env` lo cambia Claude al reiniciar.**

---

## Modos, listas y candados

| | Qué hace | Cuándo |
|---|---|---|
| `MODO_ESCUCHA=true` | Lee todo, calcula qué habría dicho, lo guarda para aprender. **No manda nada.** | Para arrancar. Es lo que corrió siempre. |
| `MODO_BORRADOR=true` | Manda al grupo lo que habría contestado. Al cliente, nada. | Para ver y corregir borradores. |
| Los dos en `false` | Responde de verdad. | Cuando los borradores convenzan. |
| `NUMEROS_TESTER` | Con contenido (en esta o en la del piloto), solo escribe a esos números (los 5 caminos: texto, foto, PDF, respaldo del PDF, seguimiento). El grupo nunca se filtra. Al arrancar lo avisa bien grande, con las dos cantidades. Además, el tester manda `#reset` (y sus typos) desde su celular, cualquier otro `#` suyo se descarta, sus leads van a `LEADS_PRUEBA` y no sale en el resumen. | El celular de prueba. |
| `NUMEROS_PILOTO` | Recibe los envíos como el tester; para todo lo demás es un cliente: `#` es un mensaje común, el lead va a `LEADS`, sale en el resumen. | Clientes reales de la prueba (Pendientes 1, Parte C). |
| `CONTACTOS_PERSONALES` | Se ignora el chat antes de todo: no se guarda, no va a Gemini, no se transcribe, no sale en el resumen, no suena el recordatorio. | Familia, amigos, proveedores. |

**Candado del destino de avisos** (`motivoBloqueoAvisos` y `destinoEsUnCliente` en
`src/evolution.js`): no manda al grupo en escucha, sin destino, si el destino no es un
grupo, o si es un chat donde alguna vez escribió un cliente. Existe porque un resumen con
datos de otros clientes ya le llegó a un cliente. `npm run destino` pregunta a esa misma
función.

**Leads de prueba** (`registrarLeadEscalado` en `src/index.js` y `registrarLead` en
`src/sheets.js`, desde el 15/09/2026): el lead escalado del tester (`NUMEROS_TESTER`) va a
la pestaña `LEADS_PRUEBA`, con las mismas columnas y en el mismo orden que `LEADS`. El resto
del escalado no cambia (aviso al grupo, `escalado: true`). Si la pestaña no existe, el bot la
crea con la fila de encabezados de `LEADS!A1:K1` (o con los nombres de campo, si no la puede
leer), todo en un solo `batchUpdate`, y hasta el próximo arranque se acuerda de que ya existe.
Si falla la creación o la fila, lo loguea (`[leads] no pude registrar en LEADS_PRUEBA`) y
sigue: nunca cae a escribir en `LEADS`.

**Los comandos `#` del tester, `LEADS_PRUEBA` y el filtro del resumen dependen de
`NUMEROS_TESTER`**, y se compara con `estaEnLaLista`, no con `esDestinoDePrueba`. Con la lista
vacía, todo va a `LEADS` y nadie puede usar `#reset` desde su celular. Un cliente piloto
(`NUMEROS_PILOTO`) es un cliente real: su lead va a `LEADS`, aparece en el resumen y no puede
borrarse el chat (Pendientes 1, Parte C; hasta el 20/09/2026 las tres cosas iban juntas en
`NUMEROS_PRUEBA`). Con alguna lista cargada, un número de afuera no anota lead en ningún lado:
se lo trata como borrador, igual que antes. `evolution.leLlegaAlCliente(chatId)` es la única
definición de "en vivo": ni escucha, ni borrador, ni fuera de las listas.

### Chats viejos (`SOLO_CHATS_NUEVOS`, 29/09/2026)

Decisión de Tomás del 29/09/2026: un chat es **nuevo** solo si empezó desde cero con el bot
mirando y nunca escribió nadie de la cuenta. Todo lo demás es **viejo** y, con
`SOLO_CHATS_NUEVOS=true`, va en borrador; el tester sigue en vivo. `esDestinoDePrueba` pregunta
a `esChatViejo` (`src/evolution.js`): está en la lista de chats viejos **o** lo atendió una
persona (`loAtendioUnaPersona`, igual que el 28/09); y mientras la lista no está al día, todos
son viejos. Hasta el 29/09 miraba solo `estado.json`, que tenía 112 chats reales contra 958
claves de chats individuales en la base de Evolution.

La lista es `chats-viejos.json`, al lado de `estado.json` (sale de `ESTADO_PATH`; las pruebas
usan una carpeta temporal), escrita atómica como el estado: `viejos` (`{ número: { desde,
motivo } }`), `lids` (`@lid` → número; `null` si no se pudo traducir), `alDia`, `idsBot` (los
últimos 200 envíos confirmados del bot; 50 hasta el 29/09), `semilla` y `sinMirar` (30/09: los
chats que el bot vio por primera vez con la lista atrasada, con la hora de ese mensaje; se vacía al
ponerse al día). Se llena así
(`src/chats-viejos.js`):

1. **Semilla, una vez** (`npm run sembrar-viejos`, `test/sembrar-viejos.js`): todo chat
   individual con al menos un mensaje en la base de Evolution (entrante o propio, de cualquier
   fecha; el 29/09 el más viejo era del 08/11/2024) y todo chat real de `estado.json` (claves
   numéricas `@s.whatsapp.net`; ni `eval-…` ni `aprobado-…`). El tester no entra. Un `@lid` se
   guarda por número: por su `remoteJidAlt` o por el mapeo (id de mensaje, `IsOnWhatsapp` y los
   `lid-mapping-*_reverse.json` de `evolution_api`, que el 29/09 traducían los 460). Lee con
   `docker exec`, en una transacción READ ONLY; no carga `state.js`. `--simular` no escribe.
   El 29/09 daba 918 (los 393 de la cuenta del 28/09 eran solo desde el 28/08).
2. **Cada arranque** (solo donde `index.js` levanta el puerto; requerir los módulos no toca
   Evolution) mira en Evolution (`evolution.buscarMensajes`, `POST /chat/findMessages`, solo
   lectura) la ventana que va de `alDia` al momento en que empezó a escuchar. En el primer
   arranque después de la semilla, cualquier chat con un mensaje en la ventana es viejo. En los
   siguientes: un mensaje propio que no es un envío guardado del bot (con el bot apagado lo
   escribió una persona), o un chat con mensajes que no está ni en `estado.json` ni en la lista
   (empezó con el bot apagado). Un chat nuevo que el bot ya conocía y donde solo escribió el
   cliente sigue nuevo.
3. **Después, el webhook como siempre:** un chat que arranca ahí es nuevo; si escribe una
   persona, `loAtendioUnaPersona`.

`alDia` avanza cada 60 s mientras está al día y, al día, en cada envío confirmado
(`enviarAlCliente` guarda el id siempre). Mientras se pone al día, los mensajes esperan (hasta 60 s; solo con
`SOLO_CHATS_NUEVOS`). Si no puede (Evolution no responde, falta la semilla, la lista está
dañada, que no se pisa): con `SOLO_CHATS_NUEVOS=true` todo va en borrador salvo el tester, avisa
al grupo una vez por racha, reintenta cada 5 minutos y `alDia` no se mueve; al lograrlo, avisa
de vuelta. Apagado, la puesta al día corre igual (para que la lista esté completa cuando se
prenda) y solo lo loguea. Al arrancar, el log dice `CHATS VIEJOS: N en la lista, al día hasta
DD/MM HH:MM` (y `@lid sin traducir: K` si hay); `/salud`, lo mismo en `chatsViejos`. Sin
arrancar (pruebas, `evaluar`, `guion`, `chatear`) la lista está vacía y no hay espera ni
borrador forzado. Lo prueba `test/chats-viejos.test.js`.

**Si Evolution se cae con el bot andando** (29/09/2026). El guardián (ver *Guardián de
Evolution*) le avisa cuando abre y cuando cierra un corte; el cableado está en `revisarGuardian`
(`index.js`). **Al abrir:** para el reloj y lleva `alDia` a la última señal buena, nunca hacia
adelante (`alDia = min(alDia, desde)`; control 1: el último barrido que leyó `open`, o el arranque
si no hubo ninguno; control 2: la hora del último mensaje que entró). Queda atrasado con el motivo
`Evolution caído (instancia <estado>)` o `Evolution caído (no llega nada por el webhook)`: con
`SOLO_CHATS_NUEVOS=true`, todo en borrador salvo el tester. Un envío confirmado guarda su id pero
no mueve `alDia`. No avisa nada al grupo (ya avisó el guardián) ni reintenta. **Al cerrar el último
corte abierto** (`✅ Evolution volvió` o `✅ Volvieron a llegar mensajes`): espera 2 minutos
(`VUELTA_MS`, para que Evolution termine de guardar lo que entró durante el corte; mientras tanto
sigue atrasado, con el motivo `Evolution volvió: me pongo al día a las HH:MM`) y se pone al día de
`alDia` **hasta ahora**, no hasta `escucha`, con las reglas del arranque siguiente (los motivos
dicen `escribió alguien de la cuenta durante un corte de Evolution` y `empezó durante un corte de
Evolution`). Si sale bien, queda al día con el reloj andando; si falla, lo de siempre (reintento
cada 5 minutos, también hasta ahora; un aviso por racha; `alDia` quieto). Una puesta al día que
termina con un corte en el medio no deja al día. Con los dos controles cortados a la vez, espera a
que vuelvan los dos. Con `SOLO_CHATS_NUEVOS` apagado frena y se pone al día igual, y solo lo
loguea. Un reinicio en medio de un corte arranca desde el `alDia` que quedó quieto. Con
`GUARDIAN_ACTIVO=false` no hay cortes y `alDia` avanza como antes.

**Un chat que entra a `estado.json` con la lista atrasada** (30/09/2026). Con la lista sin estar al
día (se está poniendo al día, Evolution cayó, la espera de la vuelta o sus reintentos), un chat que
empezó sin el bot mirando y vuelve a escribir entraba a `estado.json` con ese mensaje, y la puesta
al día lo daba por conocido: quedaba nuevo. Ahora `procesar` (`index.js`) llama a
`chatsViejos.entroDelCliente` con cada mensaje de un cliente **antes** de que el chat entre al
estado: si la lista está atrasada y el chat no está ni en `estado.json` ni en la lista, se anota la
hora de ese mensaje en `sinMirar` (se guarda en el archivo, por si el bot se reinicia antes de
ponerse al día). Al clasificar, un chat de `sinMirar` con un mensaje en Evolution de antes del
primero que vio el bot no cuenta como conocido: es viejo, con `empezó durante un corte de
Evolution` (vuelta) o `empezó con el bot apagado` (arranque). Si el primero que vio el bot es el
primero que hay, sigue nuevo. Un chat que ya estaba en `estado.json` antes no se anota: sigue la
regla de siempre. `sinMirar` se vacía cada vez que se pone al día. Cubre también el arranque lento
(la puesta al día tarda más que la espera de 60 s).

**Límites conocidos de la caída** (29/09/2026, no se arreglan acá; el segundo se cerró el 30/09):

- Fuera de la franja del seguimiento el control 2 no mira: un webhook mudo de madrugada no abre
  corte y `alDia` sigue avanzando. Un chat que empezó en ese rato queda nuevo.
- ~~Un chat que empezó durante el corte y vuelve a escribir después de la vuelta, pero antes de la
  puesta al día, entra a `estado.json` con ese mensaje y queda nuevo.~~ Cerrado el 30/09/2026: ver
  *Un chat que entra a `estado.json` con la lista atrasada*, arriba.
- Un corte del control 2 que en realidad era un rato sin ningún mensaje entrante (ni de grupos ni
  estados) deja en borrador el mensaje que lo cierra y lo que llegue hasta la puesta al día: el
  guardián se entera en el barrido siguiente.

**Orden al reiniciar** (el bot guarda su lista cada 60 s y pisaría una semilla nueva; por eso
`sembrar-viejos` no escribe si algo escucha en el puerto): frenar el bot → `npm run
sembrar-viejos` → arrancar el bot. La semilla se hace una vez; los reinicios siguientes son
frenar y arrancar, sin sembrar.

## Protecciones que no hay que sacar

El número conectado es el del negocio y Baileys no es oficial. Por eso:

- Nunca contesta antes de 20-45 segundos, y como mucho 4 mensajes por tanda. La espera
  pasa antes de interpretar: lo que el cliente manda en ese rato se junta (ver *Tandas de
  mensajes*). Entre mensaje y mensaje muestra "escribiendo…" y espera `ENTRE_MENSAJES_MS`
  **antes** de controlar y mandar; los envíos van con `delay: 0` (Pendientes 1, D2).
- No le escribe a grupos, difusiones ni estados.
- Solo inicia conversación en el seguimiento (rehecho en el bloque Ninjo 1b, decisión de Tomás del
  05/10/2026; apagado hasta que lo prenda Tomás): después de una tanda del bot (Sonnet o el de siempre)
  con un precio de contado o una cotización que le llegó (`ultimoPrecioBot`, lo pone atenderTanda),
  si el cliente no contestó y ninguna persona de la cuenta escribió después (lo que pasa una persona lo
  sigue esa persona). **Hasta 2**: el 1º, "contame como te quedan los numeros!", 3 horas después o más
  (`SEGUIMIENTO_HORAS_1`) entre las 10 y las 21 de Argentina (si cae fuera, cuando abre la franja; nunca
  con un precio de más de `SEGUIMIENTO_MAX_HORAS`); el 2º, "como viste los celus? cual te dio mas
  interes", el día siguiente entre las 10 y las 12, si sigue sin contestar. No hay 3º; un precio nuevo
  arranca la cuenta de cero. No sale si el chat está escalado, pausado o callado, con `#vendido` o
  `#perdido`, si el último escalado fue por postventa, ni si después del precio dijo "lo pienso", "lo
  voy a pensar", "no me interesa", "no me escribas", "no gracias", "ya compré" o "ya conseguí". La hora
  es la de Argentina (`Intl`), nunca la de la PC. Como mucho 2 por vuelta, nunca en borrador ni escucha.
  **Pasa por la misma guardia que las respuestas** (Pendientes 2, `revisarSeguimientos` en
  `src/index.js`): `mostrarEscribiendo` → espera local de 1,5 s → **el control de nuevo, con el estado
  leído en ese momento** (`seguimientoQueToca`, con `#reset` por la generación del chat) → **se marca
  antes de mandar** (`seguimiento: { de, n, ts }`: si Evolution falla, ya cuenta y no se repite) → envío
  con **`delay: 0`**. Queda en el registro de aprendizaje (evento `seguimiento`, con el número). Si algo
  cambió no se manda ni se escribe nada, y ese seguimiento no cuenta para el tope de la vuelta; si el
  `#reset` cae con el envío ya en vuelo, tampoco se escribe nada. Lo prueba `test/seguimiento.test.js`
  (con el proceso en la zona de Tokio).
- **Quién escribió un mensaje propio se decide por el id, no por el tiempo** (`src/autoria.js`,
  desde el 15/09/2026). Cada envío anota el `key.id` que devuelve Evolution, y el eco que llega
  antes que esa respuesta se reconoce porque el envío sigue "en vuelo". Cualquier otro mensaje
  propio es de una persona: el bot se calla 45 minutos en ese chat, y lo que escribió entra al
  historial y al aprendizaje. Antes contaba como persona solo si pasaban 15 s desde el último
  envío: una respuesta rápida se perdía y un eco lento callaba al bot. El registro vive en
  memoria (50 ids por chat, 30 minutos) y no se guarda en disco. `#pausa` lo calla hasta
  `#sigue`.
- Ignora los mensajes de antes de arrancar (`IGNORAR_ANTERIORES_SEG`).
- **Un chat sin número no se procesa** (`chatSinNumero` en `src/index.js`, 28/09/2026, decisión
  de Tomás). Evolution guarda el `@lid` en su base y lo cambia por el número antes del webhook
  solo si el mensaje trae `remoteJidAlt`. Si igual llega un `…@lid`, el bot no sabe si es un
  cliente viejo, un amigo o un proveedor: `CONTACTOS_PERSONALES` y `SOLO_CHATS_NUEVOS` comparan
  números y no lo reconocerían, y el mismo cliente quedaría en dos chats. Va después de
  `esViejo` (la recarga del historial al vincular no avisa): no se contesta, no se guarda, no va a
  Gemini ni se transcribe; si escribió el cliente, `📵 SIN NÚMERO` al grupo con el nombre y la
  hora, sin el texto (una vez por chat cada 24 h, en memoria); un mensaje propio no hace nada. Lo
  prueba `test/lid.test.js`.
- **Con `SOLO_CHATS_NUEVOS`, sin la lista de chats viejos al día todo va en borrador salvo el
  tester** (`esChatViejo`, 29/09/2026): mientras se pone al día, si Evolution no respondió, si
  falta la semilla o si la lista está dañada, y durante un corte de Evolution hasta ponerse al día
  a la vuelta. Nunca "sin lista = todos nuevos". Ver *Chats viejos*.
- **Crédito sin venta:** después de `MENSAJES_SIN_VENTA` mensajes seguidos sin ninguna señal
  de venta (modelo, monto, forma de pago, permuta…) deja de contestar y avisa una vez con
  `🤐`. Cualquier señal lo reactiva, en el momento. **Suma solo si la respuesta le llegó**
  (Pendientes 2): `sinVenta` viaja como marca en el **primer** mensaje de la respuesta (`decidir`
  lo deja en `alSalir` y `decidirYFormatear` lo cuelga, ya filtrada la respuesta) y se confirma
  con el id de Evolution. En escucha y en borrador no suma, y una tanda que se corta antes del
  primer mensaje y se reencola suma una vez, no dos. Cuando el bot no manda nada (el segundo "no
  entendí", que escala callado; un acuse repetido; la propia rama del `🤐`) no hay mensaje que
  lo lleve y suma al decidir, como siempre (decisión de Tomás del 21/09/2026): en vivo el
  crédito se corta en el mismo mensaje que antes.
- Un audio que no se entendió **nunca cotiza**.
- **El webhook no le cree a cualquiera** (auditoría del 15/09/2026, A1). Con
  `WEBHOOK_SECRETO`, solo `POST /webhook/<secreto>`, comparado en tiempo constante;
  `/webhook` pelado o un secreto equivocado dan 401 sin leer el cuerpo. Después: un tope de
  `WEBHOOK_MAX_POR_MINUTO` (600) pedidos por minuto que los 401 no gastan (429); cuerpo de
  hasta 5 MB (413); evento `messages.upsert` (otros eventos, 200 y nada); la instancia en
  `instance`, si viene (403 si es otra); y cada mensaje con `key.remoteJid` de texto (400).
  Los errores salen sin stack. **Evolution no reintenta 400, 401, 403, 404 ni 422, y el
  resto sí:** por eso el tope responde 429. Nunca se loguea la ruta ni el cuerpo, que trae
  la `apikey` de Evolution. Sin secreto acepta `/webhook` y `/webhook/<lo que sea>` (para
  poder cambiar la URL de Evolution antes que el `.env`), y lo avisa al arrancar.
  `/salud` muestra el modo efectivo, si hay secreto (nunca el valor), el commit y la hora de
  arranque, la del último mensaje (`ultimoMensaje`, cualquiera) y la del último que entró
  (`ultimoEntrante`, sin los propios: el reloj del guardián), y cuántos repetidos se
  descartaron. Lo prueba
  `test/seguridad.test.js`.
- **Una marca de "ya se dijo" solo se guarda si el mensaje salió** (auditoría del
  15/09/2026, A4; ver *Las marcas de "ya se dijo"*).
- **Un mensaje repetido no se procesa dos veces** (A6, bloque 4). Cada mensaje del webhook se
  reconoce por `remoteJid` + `key.id` y se marca como visto antes de procesarlo; el segundo se
  descarta con un log y no mueve `ultimoMensaje`. Vale también para los `fromMe`. Sin `key.id`
  se procesa como siempre. Los vistos viven en `bot:interno.vistos`, sobreviven a un reinicio y
  `#reset` no los borra; se podan a los 30 min y hay un tope de 5000. `/salud` muestra
  `duplicadosDescartados` desde el arranque. Lo prueba `test/dedupe.test.js`.
- **Un texto nunca manda un archivo** (A2). Las fotos y los documentos son objetos que arma
  solo `responder.js` (`src/acciones.js`): `{ tipo: 'foto', id: modelo }` y
  `{ tipo: 'doc', id: 'compromiso', pie }`. La ruta sale de `fotos.buscar` y del catálogo de
  `documentos.js`, nunca de un texto: un string se manda siempre como texto, aunque diga
  `[doc:...]`. Además, `evolution.enviarImagen` y `enviarDocumento` no mandan nada fuera de la
  carpeta de fotos o de documentos (`FOTOS_DIR`, `DOCS_DIR`, resueltas con `..`, enlaces y
  mayúsculas) ni con otra extensión (`.jpg/.jpeg/.png/.webp`, `.pdf`). Si `redactar` devuelve
  algo con forma de marcador, va el texto fijo. Donde solo va texto (borrador al grupo, logs,
  `ultimaPropuestaBot`, `evaluar`, `guion`, `chatear`, el simulador) se leen como
  `[foto: iPhone 13]` y `[doc: compromiso de pago] <pie>`, sin rutas.

## Avisos al grupo interno

| Aviso | Cuándo | Cada cuánto |
|---|---|---|
| `🔔 LEAD` | Escalación con mensaje al cliente (turno, modelo fuera de planilla…). | Una vez por escalado (antes, una por chat). |
| `🔔 LEAD` + `— BORRADOR, no se envió —` | Modo borrador, o destino fuera de `NUMEROS_PRUEBA`. | Cada respuesta. |
| `🔕 SIN RESPUESTA` | Escalación en silencio. | Por motivo, una vez cada 45 min. |
| `⏰ ESCALADO SIN TOMAR` | Un escalado que calló el chat, con mensajes nuevos del cliente y sin que nadie lo tome. | Una vez por escalado, a los 30 min. De noche no suena: entre `RECORDATORIO_HORA` y `SEGUIMIENTO_HORA_HASTA`; si se cumple fuera de esa franja, a la mañana. |
| `⏸️ Pausado` / `▶️ Reactivado` / `❓` | Respuesta a `#pausa` y `#sigue` con número, en el grupo. Desde el 07/10/2026 el `▶️` dice si le contesta lo que dejó escrito o por qué no. | Al momento. |
| `🔕 SIN RESPUESTA` con `#sinstock <número>` | El cliente pidió fotos o videos (bloque 8): quién es, qué modelos pidió y qué hacer. | Por motivo, una vez cada 45 min. |
| `📷 #sinstock · …` / `❓` | Respuesta a `#sinstock` en el grupo: qué fotos le mandó, de cuáles no hay foto, o cómo se usa. | Al momento. |
| `🤐` | El chat se quedó sin crédito de venta. | Una vez por chat. |
| `📵 SIN NÚMERO · <nombre> · <hora>` | Un chat llegó con `@lid` en vez del número y el bot no lo procesa. Sin el texto: puede ser un amigo. | Una vez por chat cada 24 h (en memoria; un reinicio puede dar uno de más). |
| `📄 NO SALIÓ EL PDF · <nombre> · wa.me/<número> · mandale el compromiso de pago vos` | El PDF del compromiso no salió (Evolution falló en `sendMedia`; 30/09/2026): al cliente le llegó solo el pie como texto y `compromisoEnviado` no se confirma. Una persona le manda el PDF a mano. | Una vez por chat cada 24 h (en memoria, como `📵`; `#reset` no lo borra). Lo prueba `test/pdf-fallido.test.js`. |
| `🔋 Usados con LISTA 85-93 (9 modelos)…` / `🔋 Usados con LISTA (al 100%).` / `🔋 Ahora: …` / `❓` | Respuesta a `#bateria` en el grupo: qué lista quedó, cuál está activa, o por qué no cambió nada (la pestaña no existe o no tiene filas con modelo). Ver *La lista de usados (`#bateria`)*. | Al momento. |
| `⚠️ No pude leer LISTA 85-93: cotizo con LISTA` | Con `#bateria 85-93` activo, la pestaña no se pudo leer (no existe, no tiene filas con modelo o Google falló): el bot cotiza con LISTA sola (01/10/2026). | Una vez por racha: se rearma cuando se lee bien o se elige otra (en memoria: un reinicio puede dar uno de más). |
| `⚠️ El bot falló con…` | Error procesando un mensaje. | Cada vez. |
| `⚠️ No pude ponerme al día con Evolution (chats viejos)…` / `⚠️ Falta la lista de chats viejos (npm run sembrar-viejos)…` | Con `SOLO_CHATS_NUEVOS`, la puesta al día (al arrancar, o a la vuelta de un corte de Evolution) no pudo completar la lista de chats viejos: todo va en borrador salvo el tester. Durante el corte no sale: ya avisó el guardián. | Una vez por racha (reintenta cada 5 min). |
| `✅ Me puse al día con Evolution: vuelvo a contestar los chats nuevos.` | Terminó esa racha (con `@lid sin traducir: K` si hay). | Una vez por racha. |
| `⚠️ Evolution: la instancia dice <estado>` / `⚠️ Evolution: no responde (<motivo>)` | Guardián, control 1: la instancia no está `open`, o Evolution no contesta. Reemplazó a `⚠️ El bot se desconectó de WhatsApp`. | Una vez por corte (se revisa cada `GUARDIAN_MIN`). Si el envío falla, hasta 3 intentos. |
| `⚠️ Evolution dice open pero no llega ningún mensaje desde las HH:MM` | Guardián, control 2: `GUARDIAN_SIN_MENSAJES_MIN` sin ningún mensaje, dentro de la franja del seguimiento. | Una vez por corte; se rearma cuando llega algo. |
| `✅ Evolution volvió (<estado>, <cuánto duró>)` / `✅ Volvieron a llegar mensajes (…)` | Terminó un corte del guardián. | Una vez por corte. |
| `☀️ Buen día` | Resumen de la mañana. | Una vez por día, si `RESUMEN_ACTIVO`. |
| `⏰ RECORDATORIO…` / `🛑 DEJO DE RECORDAR` | Recordatorios manuales. | A la hora en punto. |
| `📌 Anotado` / `✅ Hecho` / `❓` | Respuesta a `#recordar` y `#hecho`. | Al momento. |
| `💰 Vendido` / `❌ Perdido` / `❓` | Respuesta a `#vendido` y `#perdido`. | Al momento. |

La línea `Entrega:` de `🔔` y `🔕` dice el monto en pesos y, si dijo uno en dólares, `US$420`
(bloque 10, sin convertir; con los dos, `$300.000 y US$200`). En LEADS, `entrega_declarada`
sigue siendo solo la de pesos.

## Guardián de Evolution

`src/guardian.js`, desde el 21/09/2026. Tres cortes en tres días (17 al 19/09) con el mismo
cuadro: el bot vivo y escribiendo el estado, pero sin recibir ningún mensaje de Evolution (en
uno, Evolution tiró `PrismaClientUnknownRequestError`). Se destrababa reiniciando el contenedor
y nadie se enteraba en el momento. Decisión de Tomás: **el guardián avisa al grupo interno; no
reinicia nada.** El diagnóstico lo hace una persona.

Un barrido cada `GUARDIAN_MIN` minutos (`revisarGuardian` en `index.js`, mismo patrón que los
otros barridos), con dos controles y **como mucho un aviso por corte**:

1. **La instancia** (`evolution.estadoDeLaInstancia()`, `GET /instance/connectionState`). Si no
   dice `open`: `⚠️ Evolution: la instancia dice close. No están llegando mensajes.` Si
   Evolution no contesta (caída, colgada más de 10 s, error HTTP) también es un corte: `⚠️
   Evolution: no responde (<motivo>). …`. No vuelve a avisar hasta que vuelva a `open`, y ahí
   manda un solo `✅ Evolution volvió (close, 20 min)`. De `close` a `connecting` es el mismo
   corte.
2. **El webhook.** La instancia dice `open` pero no entró **ningún** mensaje en
   `GUARDIAN_SIN_MENSAJES_MIN` (45): `⚠️ Evolution dice open pero no llega ningún mensaje desde
   las 13:10.` "Ningún mensaje" es el `ultimoEntrante` de `/salud`: los `messages.upsert` que
   **entran**, los que no son `key.fromMe` (de clientes, de grupos, estados), sin contar
   repetidos. **Un mensaje propio, del bot o de una persona de la cuenta, no mueve el reloj**
   (Pendientes 2): el `⚠️` volvía por el webhook como mensaje propio en el grupo y rearmaba este
   control, así que en una tarde tranquila salía el `⚠️` y enseguida el `✅`. `ultimoMensaje`
   sigue en `/salud` como estaba, con cualquier mensaje. Límite conocido: si en 45 minutos solo
   escribe la cuenta y no entra nada (tampoco de grupos ni estados), avisa igual. Solo se mira entre
   `SEGUIMIENTO_HORA_DESDE` y `SEGUIMIENTO_HORA_HASTA`, y el silencio se cuenta desde que abrió
   la franja de hoy: de madrugada no llegan mensajes y eso no es una falla, y el silencio del
   final de la tarde no se arrastra a la mañana. Recién vuelta la instancia, se cuenta desde que
   volvió. Se rearma cuando llega algo, con `✅ Volvieron a llegar mensajes (estuvo 1 h 10 min
   sin llegar nada)`.

- **Va por `evolution.avisarGrupo`, con sus guardas de siempre:** en `MODO_ESCUCHA` no sale
  nada, y sin destino tampoco. El corte queda igual en la consola (`[guardian]`) y en `/salud`:
  `estadoInstancia` (lo último que leyó el guardián: `open`, `connecting`, `close`, `sin
  respuesta`, o `null` antes del primer barrido) y `guardianAvisoActivo` (hay un corte detectado
  sin resolver, haya salido el aviso o no). `whatsapp`, en el mismo `/salud`, es una consulta
  del momento.
- **Un aviso que no pudo salir se reintenta en el barrido siguiente, hasta 3 intentos**
  (`MAX_INTENTOS`). Con tope porque, con Prisma roto, Evolution puede mandar el mensaje y
  contestar con error: sin tope llegaría el mismo aviso cada 5 minutos. Si el corte termina con
  el ⚠️ sin salir, se descarta y sale solo el ✅.
- **Límite conocido: el aviso viaja por la misma Evolution que está fallando.** Con la instancia
  caída, lo más probable es que el ⚠️ no salga y llegue el ✅ de cuando vuelve, con cuánto duró.
  El control 2 es el que avisa en el momento. No hay un segundo canal.
- **Todo vive en memoria:** un reinicio del bot en medio de un corte lo vuelve a avisar.
- **Le avisa a chats viejos (29/09/2026)** cuando abre y cuando cierra cada corte, con desde
  cuándo no confiar (control 1: el último barrido que leyó `open`, o el arranque; control 2: la
  hora del último mensaje que entró). Los avisos al grupo no cambian, y si chats viejos falla el
  barrido sigue igual. Ver *Chats viejos*.
- **Reemplazó a la alerta de desconexión** que vivía en `index.js` (`⚠️ El bot se desconectó de
  WhatsApp. Hay que reescanear el QR…`): era el control 1 sin aviso de vuelta, y juntas avisaban
  dos veces. Con `GUARDIAN_ACTIVO=false` no queda ninguna.
- Con 45 minutos, un corte como el del 17/09 (unos 40 minutos) no avisa, y uno que empieza
  después de las 21:15 avisa a las 9:45 del otro día. Se ajusta en el `.env`.

Lo prueba `test/guardian.test.js`, con reloj simulado y un `fetch` de mentira que hace de
Evolution.

---

## Audios

`src/audio.js`. El archivo no viene en el webhook: se le pide a Evolution y se transcribe
con Gemini. Necesita `GEMINI_API_KEY` y `AUDIO_ACTIVO=true`; con `--offline` nunca
transcribe.

- **Audio propio** (`fromMe`) → se transcribe y entra al historial y al aprendizaje: es la
  mejor muestra de cómo se vende. Calla al bot 45 minutos como cualquier mensaje humano.
- **Audio del cliente claro** → se procesa como si lo hubiera escrito.
- **Audio del cliente que no se entiende o no se pudo bajar** → no cotiza, queda
  `[audio que no se entendio]` en el historial y **se escala en silencio** (antes le decía
  `si preferis te llama fran`).

## Resumen de la mañana

`src/resumen.js`, apagado por defecto (`RESUMEN_ACTIVO=false`). Una vez por día desde
`RESUMEN_HORA`: si la PC estuvo apagada a esa hora, sale en el primer ciclo después de
arrancar. La marca del día queda en `estado.json` (`bot:interno`) y se pone recién cuando
salió. En orden:

1. **`📅 Turnos de ayer (N)`** (Ajustes 1, decisión de Tomás del 16/09/2026). Las ventas se
   hacen en persona y nadie anotaba `#vendido`: el resumen decía "💰 0 vendidos" todos los
   días. Lo que sí se ve en el chat es el turno. Un renglón por chat (`N) nombre · modelo ·
   wa.me/…`), del más temprano al más tarde, con la numeración que siguen las listas. Es una
   **guía, no ventas confirmadas**. Sin turnos: `📅 Ayer no hubo turnos anotados en el chat`.
   Un chat cuenta (`turnosDeAyer`, `senalDeTurno`) si en su historial hay:
   - un mensaje **de ayer**, del vendedor o del cliente, con señal de encuentro para ese día:
     "nos vemos hoy / ahora / en un rato / a las…", "te espero" o "te esperamos" (no "cuando
     quieras te esperamos"), "estoy / estamos / está / estés afuera" o "afuera" solo, "ya
     llegué", "estoy llegando", "recién llego", "ya estoy (acá)", "estoy acá adentro", "te paso
     el alias", "pasame el alias", "hoy a las…", o "anoto / anotado / agendado … a / para las
     16" sin otro día;
   - o un mensaje **de anteayer** que lo fija para el día siguiente: "nos vemos mañana",
     "anoto / anotado … mañana", "mañana a las…", "te espero mañana".

   Todo sin tildes. "a / por / de / en la mañana" es una franja, no el día siguiente. Un
   mensaje de ayer que nombra otro día (mañana, pasado, un día de la semana, el finde) no
   cuenta para ayer, y "cuota" en el mensaje lo descarta (un alias para cobrar la cuota no es
   un encuentro). No se exige señal comercial guardada: en la calibración, 3 de 9 turnos
   reales del 15/09 no tenían modelo ni monto. **Límite:** el historial guarda 15 líneas por
   chat, y un chat que siguió hablando después del turno puede haberlo perdido (con la copia
   del 16/09 a las 11:33 se perdieron al menos 2 del 15/09). Tampoco ve un día dicho en otro
   mensaje ("el viernes" y después "te anoto para las 19" cuenta para el día en que se
   escribió). Lo prueba `test/turnos.test.js`.
2. **`📊 Ayer`**: cuántos `#vendido` y `#perdido` se anotaron el día anterior y en cuántos
   participó el bot; debajo de cada fila, en cuántos le mandó algo de verdad, solo si no es
   cero (ver *Ventas y pérdidas*). **Solo si se anotó alguno**: con los dos en cero no sale
   nada, ni el recordatorio de cómo se anotan (Ajustes 1).
3. Cuántos chats hay para mirar, y solo chats comerciales y sin marcar, en cuatro bloques:
   `🔥 PARA CERRAR` · `⏳ TE ESTÁN ESPERANDO` · `💬 ESCRIBIERON Y NADIE CONTESTÓ` · `❄️ PARA
   REACTIVAR`.

**Chats que no salen en ningún bloque** (`entraEnElResumen`): grupos, `CONTACTOS_PERSONALES`,
el tester de `NUMEROS_TESTER` (con `estaEnLaLista`, como sus comandos `#`) y los JID sin
número, como `gemini-check@s.whatsapp.net`. Un piloto de `NUMEROS_PILOTO` sí sale: es un
cliente real. No se borran del estado. Nunca se recorta: si no entra en un mensaje se parte
en varios numerados.

## Ventas y pérdidas

`src/ventas.js`, desde el 14/09/2026. Existe para medir si el bot ayuda a vender. Se anota
desde la cuenta del negocio, de dos formas:

- **En el chat del cliente**, `#vendido` o `#perdido`. Mismo patrón que `#hecho`: no entra al
  historial ni al aprendizaje, no calla al bot, confirma al grupo, y **el cliente ve el
  comando escrito en su chat**.
- **En el grupo interno**, con el número: `#vendido 5492990000000` (sirve pegar el `wa.me`
  del resumen). Busca el chat con la misma comparación que `NUMEROS_PRUEBA` (sin el 54 ni el
  9); si un chat es exactamente ese número, es ese. No marca nada si falta el número, si
  tiene menos de 8 dígitos, si es un contacto personal, si no hay ningún chat con ese número
  o si hay varios: contesta por qué. La confirmación lleva el `wa.me` del chat marcado.
- Queda en `resultado` del chat: `{ tipo, ts, botParticipo, botLeMando }`. Uno por chat: el
  otro tipo corrige (con la fecha nueva); el mismo tipo no cambia nada, ni la fecha, para
  no mover a otro día una venta ya contada. Se guarda en disco al momento.
- **Dos marcas por separado.** `botParticipo`: el bot había propuesto al menos un mensaje
  (`botPropuso`, que pone `index.js`; en chats de antes, `ultimaPropuestaBot`). Una
  escalación en silencio no cuenta. `botLeMando`: le llegó a mandar alguno de verdad
  (`botEnvio`, que se pone solo si el envío salió: respuesta, foto, PDF o seguimiento; uno
  bloqueado o que falla no cuenta). En `MODO_ESCUCHA` o en borrador propone sin mandar.
- Un chat marcado sale de las listas de pendientes del resumen, salvo que el cliente haya
  escrito después de marcarlo (un perdido que vuelve, o un vendido con un problema). Cuando
  vuelve, al lado del nombre dice por qué: `(vendido hoy)`, `(vendido ayer)`, `(perdido el
  12)`, o `(vendido el 30/08)` si es de otro mes. No es un lead nuevo, es alguien que volvió.
- El seguimiento saltea siempre los chats marcados, aunque hayan vuelto a escribir.
- `#reset` lo borra junto con el resto del chat: una venta reseteada deja de contarse.
- El resumen cuenta los del día anterior (de 0:00 a 23:59), sin contactos personales ni
  chats de prueba. Con los dos en cero no muestra nada (desde Ajustes 1; antes recordaba cómo
  se anotan): en su lugar están los turnos de ayer.

## Recordatorios manuales

`src/recordatorios.js`. `#recordar <texto>` en el chat de un cliente lo recuerda al grupo
cada hora hasta `#hecho` en ese mismo chat. Decidido con Tomás el 12/09/2026:

- **Uno por chat.** Un segundo `#recordar` suma otra línea y la cuenta vuelve a cero.
- **Suena a la hora en punto**, desde `RECORDATORIO_HORA` (8) hasta antes de
  `SEGUIMIENTO_HORA_HASTA`. El arranque no es `SEGUIMIENTO_HORA_DESDE` a propósito: va al
  grupo, no a clientes. Si se anota a las 15:20, el primer aviso es a las 16:00.
- **Todos los de la hora salen en un solo mensaje**, con el link wa.me de cada cliente.
- **Tope:** después de `RECORDATORIO_MAX_REPETICIONES` (10) avisos sin `#hecho`, avisa una
  vez que corta y queda vencido. Los vencidos se borran solos a los 7 días.
- Confirma en el grupo al anotar (`📌`, con la hora del primer aviso) y al cerrar (`✅`).
- Vive en `estado.json` bajo `bot:interno`, no dentro del chat. `#reset` lo borra igual
  (desde el 15/09/2026; antes no lo borraba).
- En `MODO_ESCUCHA` se guardan pero no suenan. Un envío que no sale no gasta repeticiones.

---

## Las marcas de "ya se dijo"

Auditoría del 15/09/2026, A4. El estado guarda tres cosas distintas y **no se escriben en
el mismo momento**:

| Categoría | Ejemplos | Cuándo se escribe |
|---|---|---|
| **Hecho del cliente** | `nombre`, `modelo`, `capacidad_gb`, `entrega`, `forma_pago`, `zona`, `timing`, `notas`, `permuta`, `modelosPedidos`, `presupuestoAnotado`, `ultimaLectura` | Apenas se lee el mensaje. Es suyo: no depende de que le contestemos. |
| **Marca del bot** | `listaEnviada`, `stockInformadoDe`, `preciosMostradosDe`, `cotizadoDe`, `entregaCotizada`, `cotizadoDeContado`, `compromisoEnviado`, `saludoEn` (cuándo salió el saludo; bloque 9, reemplaza a `yaSaludo`), `preguntamosFormaPago`, `primerIphoneDicho`, `insistenciaEntrega` (por modelo, se mezcla en vez de pisarse; bloque 5b, reemplaza a `intentoEstirar`), `puertaAbiertaDe`, `permutaDatosPedidos`, `entregaRepreguntada`, `acuseContestado`, `descuentoPedidos`, `descuentoDe` | **Solo cuando ese mensaje salió** y Evolution devolvió su `key.id`. |
| **Control** | `calladoPorNoVenta`, `escalado…`, `leadRegistrado`, `ultimoAvisoSilencio`, `botPropuso` | Al decidir: no dicen "esto ya se lo dijimos" sino qué hizo el bot o cuántas vueltas van. (`excepcionConsultada` ya no se usa desde el bloque 5.) |
| **Control que cuenta respuestas** | `noEntendido`, `sinVenta` | Desde Pendientes 2, **cuando salió el primer mensaje de esa respuesta**, con el mismo mecanismo que las marcas (`acciones.conMarcas` → `state.confirmarMarcas`). Si el bot no manda nada en ese turno (escala callado, acuse repetido, el `🤐`), al decidir. Bajar `sinVenta` a 0 o borrar `noEntendido` es inmediato. No están en `MARCAS_DEL_BOT`: esa lista es de la migración del esquema 3. |
| **Envío confirmado** | `botEnvio` (el `botLeMando` de `#vendido` / `#perdido`) | Con el envío confirmado, igual que las marcas: sin `key.id` no cuenta como mandado. |

El camino es **decidir → enviar → confirmar**:

1. `responder.js` no escribe marcas. Cuelga cada una del mensaje que la justifica, con
   `acciones.conMarcas(mensaje, { ... })`: el bloque de precios lleva `listaEnviada`, el
   mensaje de los números lleva `cotizadoDe`, el PDF lleva `compromisoEnviado`.
2. `index.js` manda los mensajes uno por uno (`enviarAlCliente`).
3. Con la respuesta de Evolution en la mano, y solo si trae `key.id` (`autoria.llego`), se
   guardan las marcas de ESE mensaje (`state.confirmarMarcas`), en el mismo punto donde se
   anota la autoría.

Así, **no marca nada**: el modo escucha, el borrador, un número fuera de `NUMEROS_TESTER` y
`NUMEROS_PILOTO`, un envío que falló o que volvió sin id, y los mensajes que quedaron sin
mandar cuando se corta la tanda (los que ya salieron sí quedan marcados). Un mensaje escrito
por una persona tampoco marca nada del bot. Es el mismo criterio de `temas.js`, que deriva
los temas del `historial`, donde solo entra lo que salió.

**`modeloPropuesto`: el hilo cuando el cliente no recibe nada** (Pendientes 1, Parte A,
decisión de Tomás del 18/09/2026). `modelo` elegido por el bot (el más barato o el más caro,
"con esa entrega el mejor que te llevas es el X", "con eso el que te conviene es el X") es
marca del bot y se confirma al enviarse; en escucha y en borrador nada sale, así que el turno
siguiente ("dale ese", "cuánto sale") el bot no sabía qué equipo había recomendado y la
simulación perdía el hilo justo ahí. Ahora, en esas tres ramas de `src/responder.js`, el modelo
queda también en `modeloPropuesto`, al decidir, siempre. **No** está en `MARCAS_DEL_BOT` y no
es un hecho del cliente: es un respaldo, y se lee en un solo lugar (`conModeloDelHilo`, que
resuelve el `modelo` de `ctx` para todo el árbol): `ctx.modelo || (leLlegaAlCliente ? null :
modeloPropuesto)`. En vivo la fuente de verdad sigue siendo `modelo`, sin excepción: si la
tanda se cortó y la recomendación no salió, el cliente no la vio y el bot no sigue con ella.
La alternativa por entrega baja no lo escribe: esa rama nunca escribió `modelo` (deja el del
cliente y `puertaAbiertaDe`). Se limpia con `#reset`, con la vuelta a las 24 h de un escalado
y con los datos viejos. Lo prueba `test/marcas.test.js`.

En `evaluar`, `guion`, `chatear` y el simulador no hay Evolution: ahí todo envío se
considera exitoso y cada mensaje confirma sus marcas igual. En los tests, el Evolution de
mentira devuelve `key.id` como el de verdad; si devuelve `{}`, el bot no marca nada y la
conversación no avanza.

**Versión del esquema.** `data/estado.json` guarda `bot:interno.esquema`. Al arrancar,
`state.migrar` acomoda lo viejo y es idempotente. La versión 3 borra todas las marcas de
"ya se dijo" de todos los chats —podían venir de mensajes que el cliente nunca recibió— y
deja intacto lo demás. Antes de tocar nada hace una copia única en
`data/estado.json.antes-bloque3`. En el peor caso el bot repite algo una vez.

## Persistencia del estado (bloque 4)

Auditoría del 15/09/2026, A7. `data/estado.json` se escribía directo sobre el archivo
definitivo, se guardaba al salir aunque no hubiera cambiado nada (un `npm run resumen` pisaba
lo que el bot anotó mientras tanto) y un JSON ilegible arrancaba vacío y se pisaba con `{}`.
Desde el 16/09/2026:

- **Escritura atómica** (`escribir` en `src/state.js`): a `estado.json.tmp` y después `rename`.
  En Windows el rename puede fallar con EPERM/EBUSY (antivirus, un editor): se reintenta 5 veces
  con esperas cortas. Si igual falla, hay un error visible, los datos siguen en memoria y el
  próximo guardado los vuelve a intentar. No debería quedar nunca un `estado.json.tmp` suelto.
- **Se guarda solo si hubo cambios** (`sucio`): lo marcan todos los caminos que modifican la
  memoria (`actualizar`, `confirmarMarcas`, `agregarAlHistorial`, `reiniciar`, lo interno, la
  migración, los vistos). El guardado al salir escribe solo si está sucio.
- **Archivo ilegible al arrancar:** se copia tal cual a `estado.json.corrupto-<fecha ISO sin
  ':'>`, error grande en consola, arranca vacío, y el bot avisa **una vez** al grupo al arrancar
  (`avisarEstadoDanado` en `index.js`): que estaba dañado, dónde quedó la copia y que arrancó
  sin memoria. Si el archivo no existe, es un arranque normal. Las copias no se borran solas.
- **Lectura que falla por otra cosa que "no existe"** (bloque 4b): **solo `ENOENT` arranca
  vacío.** Con EBUSY, EPERM o EACCES (Windows: antivirus o un editor con el archivo abierto),
  `leerCrudo` reintenta 5 veces con esperas de 100 a 500 ms; si sigue fallando muestra `NO PUDE
  LEER EL ESTADO` y tira `EstadoIlegible`: el módulo no carga, **no se escribe nada** (ni
  archivo, ni `.tmp`, ni backup), y `index.js` (`cargarEstadoOSalir`) sale con código 1 diciendo
  "no pude leer el estado, no arranco para no pisarlo". Vale también en solo lectura. Los
  manejadores de SIGINT/SIGTERM/beforeExit se registran después de `cargar()` por eso mismo.
  Hasta el 4b ese error se tomaba como archivo inexistente y el primer guardado pisaba el
  estado real con `{}`.
- **Modo solo lectura** (`ESTADO_SOLO_LECTURA=1`): la migración corre solo en memoria, sin
  backup ni copia, y no se escribe nada, ni al salir. Lo usan `npm run resumen` y `npm run
  destino`. `evaluar`, `guion` y `chatear` escriben, pero en temporales propios.
- Lo del bloque 3 sigue igual: `migrar`, el esquema 3 y el backup `.antes-bloque3`.

Lo prueba `test/persistencia.test.js`, con los casos de cargar y salir en otro proceso.

## Dónde vive la memoria

| Qué | Dónde | Para qué |
|---|---|---|
| **Lo que dijo cada cliente** | `data/estado.json` | Modelo, entrega, permuta, `notas`, `resultado` (vendido o perdido), `temasExplicados`, `noEntendido`, `acuseContestado`, `ultimoContexto`, marcas de lo ya dicho, `escalado` (con `escaladoEn`, `escaladoMotivo`, `escaladoCalla`, `escaladoRecordado`, `escaladoResuelto`), `leadRegistrado`, `ultimoAvisoSilencio`. |
| **Las últimas 15 líneas de cada chat** | `data/estado.json` (`historial`) | El contexto que se le pasa a Gemini. |
| **Lo del panel Chiara** | `data/chiara.json` y `data/interruptor.json` | Contadores por día y por lead, el gasto de Sonnet del mes, las noticias sin subir; el interruptor general (06/10/2026). |
| **Lo que Chiara ofrece del local** | `data/stock-ofrece.json` | Los códigos de la última vuelta en vivo del stock de la app (código → cómo se dice), para "empezó / dejó de ofrecer" después de un reinicio (08/10/2026). Borrarlo solo hace que la vuelta siguiente sea la base. |
| **Estado del bot** | `data/estado.json` (`bot:interno`) | Día del último resumen, los recordatorios, la versión del esquema (`esquema`) y los mensajes ya recibidos por el webhook (`vistos`, 30 min). |
| **Las reglas acordadas** | Este archivo | Lo que se decidió y por qué. |
| **Las conductas, ejecutables** | `test/casos.js` | 297 conversaciones (bloque 9). La memoria que se puede *verificar*. |
| **Cómo contesta un humano** | `data/aprendizaje-v2.jsonl` | Eventos, se llena solo. El registro viejo (hasta el 19/09/2026) queda archivado en `data/aprendizaje-v1.jsonl`. Ver abajo. |
| **La sal de la clave por chat** | `data/aprendizaje-sal` | La crea el bot con su primer evento. **No se borra**: sin ella los chats nuevos no se agrupan con los de antes. Nunca va a git ni a un log. |
| **Los ejemplos que aprobó Tomás** | `test/ejemplos-aprobados.json` | En git, con versión y fecha. `evaluar` corre cada `buena`. Ver abajo. |

## Aprender de cómo contestan Tomi y Fran

`src/aprendizaje.js`. Desde el bloque 6 (23/09/2026, hallazgo B1) es un **registro de
eventos** en `data/aprendizaje-v2.jsonl`, una línea JSON por evento, siempre con `v: 2`, `ts`,
`chat` (los últimos 4 dígitos, para mostrar), `clave` (bloque 7, ver abajo), `tipo` y `commit`
(el del bot que corría):

- **`cliente`**: cada línea del cliente que entra al historial, entre o no a una tanda (en vivo
  o en borrador, con una persona atendiendo o el chat escalado, no entra). `id` de WhatsApp,
  `texto` (la transcripción si era audio; se anota al terminar de transcribir, con la hora en
  que llegó), `audio` y `humanoAtendiendo`.
- **`propuesta`**: una por tanda interpretada, escrita en el hilo de esa tanda con SUS datos:
  `tanda` (un id propio), `lineas` (los `id` de sus líneas, en orden), `mensajes` (como
  texto), `escalar`, `motivo`, `lectura` (la devuelve `decidir`, no se lee del estado),
  `contexto` y `modo` (`vivo`, `borrador`, `escucha` o `fuera-de-lista`). Una tanda que cortó
  un `#reset`, o que se canceló antes de interpretar, no escribe.
- **`humano`**: cada mensaje de una persona de la cuenta. `id`, `texto` y `responde`: la
  `tanda` de la última propuesta del chat **si** después no llegó ninguna línea del cliente y
  no hay una tanda del chat en curso. Si no, `responde: null` e `incompleto`: `'bot
  interpretando'`, `'cliente escribió después'` o `'sin propuesta en memoria'` (el bot se
  reinició o hubo un `#reset`: la última propuesta de cada chat vive en memoria, no en
  `estado.json`).
- **`silencio`** (bloque Ninjo 2, 06/10/2026): una tanda, o una línea del cliente, que se quedó sin
  respuesta, con `motivo` y `lineas` (los ids). Ver *Cerebro Sonnet: bloque Ninjo 2*.
- **`entrega`** (bloque Ninjo 2): cada mensaje que salió a un cliente, con el `id` que devolvió
  Evolution, `formato`, `origen`, `texto` y `tanda`, o con `error` si falló.
- También hay `propuesta-sonnet` (la sombra de Sonnet) y `seguimiento`. `ejemplos()`, `aprobar` y
  `reproducir` miran solo `cliente`, `propuesta` y `humano`.
- No generan eventos: comandos `#…` (tampoco el "🔄 Reiniciado" del `#reset` del tester), ecos del
  bot, audios propios sin transcribir, contactos personales.

**Los ejemplos se arman al leer** (`aprendizaje.ejemplos`, función pura): por chat, los
mensajes seguidos de la persona hasta que el cliente vuelve a escribir son **un** ejemplo.
Toma la propuesta del primero; si ese quedó incompleto, el ejemplo va sin propuesta del bot y
con las líneas que nadie había respondido. Nunca se mezcla con la tanda anterior. Cada ejemplo
lleva también su `clave` (o null) y los `idsCliente` de sus líneas, en orden.

**La clave por chat** (bloque 7, decisión 5 de Tomás del 23/09/2026). Con los últimos 4
dígitos, dos chats distintos pueden quedar juntos: con 117 chats hay un 49% de chance de que
dos compartan los 4 dígitos, y con 300 un 99%. Cada evento lleva `clave`: HMAC-SHA256 del
chat completo (con el `@dominio`) con una sal local, en hex, 12 caracteres
(`aprendizaje.clave`). `ejemplos()` y `reproducir` agrupan por `clave || chat`: los eventos
sin clave (los del bloque 6) agrupan como antes. La sal es `data/aprendizaje-sal` (al lado del
registro; en los tests, al lado del `APRENDIZAJE_PATH` temporal): 32 bytes al azar en hex que
el bot crea con su **primer evento**, nunca al cargar el módulo (`aprobar`, `aprender` y
`reproducir` no crean nada). Se lee una vez y queda en memoria; si otro proceso la creó recién
(`wx`), se usa esa. Si no se puede leer ni crear, un aviso `[aprendizaje] sin sal:` una sola
vez, `clave: null`, el evento se anota igual y el próximo vuelve a probar. **No se borra**: sin
ella los chats nuevos no se pueden agrupar con los de antes. Nunca va a un log, a un evento ni
a git (`data/` está en `.gitignore`).

Hasta el bloque 6 cada fila se armaba cuando escribía la persona, leyendo
`ultimoMensajeCliente`, `ultimaPropuestaBot` y `ultimaLectura` del chat: si contestaba mientras
el bot interpretaba, la fila mezclaba tres momentos (1.603 filas del 10 al 19/09: 777
repetidas, 511 sin propuesta, 177 sin mensaje del cliente). **Ese archivo se archiva tal cual
como `data/aprendizaje-v1.jsonl`** y el código no lo escribe nunca; lo leen `aprender --
--archivo` y `reproducir`. Esos tres campos siguen en el estado porque los usan `ventas.js` y
`control.js` (`ultimoMensajeCliente` y `ultimoContexto` ya no los lee nadie).

```bash
npm run aprender          # los ultimos 20 ejemplos, ordenados por cuanto difieren
npm run aprender -- 50
npm run aprender -- --todos
npm run aprender -- --archivo data/aprendizaje-v1.jsonl   # el viejo, como se veía antes
npm run reproducir        # los mensajes reales contra el bot de hoy (sin red)
npm run aprobar           # aprobar ejemplos, de a uno (bloque 7)
npm run aprobar -- --contar
npm run aprobar -- --fijar
```

**`npm run reproducir`** (`test/reproducir.js`, pedido de Tomás): toma `data/aprendizaje-v1.jsonl`
(o, si no está, `data/aprendizaje.jsonl`) u otro con `--archivo`. Formato viejo: un caso por
par único chat + mensaje del cliente, en un chat nuevo y sin contexto. v2: un caso por ejemplo
completo, reproduciendo cada chat en orden (las líneas del cliente y las respuestas de la
persona entran al historial como pasaron), así el bot llega con el mismo contexto. Corre como
`evaluar --offline` (copia congelada, extractor local, estado y aprendizaje temporales, sin red
ni Evolution) y llama a `decidir`, no a `index.js`. Compara qué haría el bot (contesta, escala
y por qué, se calla) con lo que hizo la persona, si uno dio números y el otro no, y la distancia
de `aprender`. Resumen solo con cantidades en la consola, y los 30 casos más distintos en
`data/reproduccion-AAAA-MM-DD.md` (`--informe` lo manda a otro lado). **`--gemini` usa Gemini
de verdad** (manda los mensajes reales a Google y cuesta tokens): lo avisa y pide `--si`. Es
una guía, no una nota. Contra el registro viejo, el 23/09/2026: 736 casos, el bot contesta 711
y escala sin contestar 25.

**El bot no se modifica solo con esto, y es a propósito.** Un bot que aprende solo de
conversaciones copia también los errores, y acá hay precios de por medio. Desde el bloque 7
(decisiones de Tomás del 23/09/2026) el circuito es:

1. **`npm run aprobar`**: Tomás ve las respuestas reales de a una (primero las más distintas
   de lo que iba a decir el bot) y decide: buena, excepción, dato desactualizado, faltó
   contexto o no usar. Aprueba solo Tomás.
2. **`test/ejemplos-aprobados.json`**, en git: la situación (lo que escribió el cliente y
   hasta 30 items de contexto), la intención que leyó el bot, la respuesta de la persona, qué
   tenía que hacer el bot (contestar con o sin precio, escalar callado, no decir nada) y lo que
   no puede decir, con versión y fecha.
3. **`npm run evaluar`** corre cada `buena` como un caso y los cuenta aparte ("Ejemplos
   aprobados: X de N cumplen"). Uno que el bot no cumple queda **pendiente** y no rompe nada.
4. **Una persona implementa la regla** que falta, en otro bloque, con su caso en
   `test/casos.js` si hace falta.
5. **`npm run aprobar -- --fijar`** marca como `fijado` los que el bot ya cumple: desde ahí,
   si vuelven a fallar, `evaluar` sale con error.

Nada de esto llega al bot: no hay ejemplos para Gemini ni textos aprobados que el bot mande.

**`npm run aprobar`** (`test/aprobar.js`). Fuentes, en este orden: el registro de eventos (v2)
y el viejo (`data/aprendizaje-v1.jsonl`; con el criterio de `reproducir`, 736 candidatos). Solo
las lee. En v1 un candidato por par chat + mensaje del cliente, sin contexto; en v2 uno por
ejemplo con cliente y humano (los incompletos, marcados), con el contexto de antes de ese
grupo: líneas del cliente, respuestas de la persona y las tandas que interpretó el bot
(`enviado` si era en vivo). Cada uno tiene un id estable (`v1-`/`v2-` + 12 hex de un SHA-256)
y lo ya decidido, con cualquier etiqueta, no vuelve a salir. Por candidato muestra el texto ya
limpio y pregunta `[b]uena · [e]xcepción · [d]ato desactualizado · [f]altó contexto · [n]o
usar · [s]altear · [q] salir`; con `b`, qué tenía que hacer el bot, si con precio, qué no
puede decir y una nota. Cada decisión se guarda en el momento (temporal y rename).
`--contar`, `--fuente v1|v2`, `--fijar` (offline, como `evaluar -- --offline`: nunca vuelve
atrás un fijado ni cambia la versión) y `--revisar <id>` (vuelve a preguntar y guarda con
`version + 1`, la fecha y `pendiente`). Sin `--fijar` no carga `state.js` ni `responder.js`.

**La limpieza** (`limpiar`), en todo texto que se guarda: `sinDatosPersonales` (teléfonos y
mails; sin nombre). Si queda una tirada de 8 dígitos o más (un DNI: `30.123.456`) o una `@`,
**no se puede aprobar** como buena ni como excepción. Los montos de la persona (no los del
cliente, que el bot necesita para llegar al mismo estado) se guardan como `[monto]`: `$` +
número, separador de miles, "mil/k/lucas/palo(s)", "un palo" y "medio palo", enteros de 4 a 7
cifras (salvo un año después de "del" o "año") y de 3 cifras (salvo 128, 256 y 512, y antes de
`gb`, `%`, `hs` o `hrs`). El caso mira si el bot da precio (`conPrecio`: algún mensaje con `$`
y un dígito, o con un número con puntos de miles, como la lista de precios: `Ip 15 128gb 85% 740.000`) o no; el monto lo calcula el cotizador, como siempre.

**Ajustes del 24/09/2026** (pedido de Tomás con el primer lote, hechos desde Cowork):
- **Orden de la cola:** primero lo que habla de una venta (iPhone, modelos, cuotas, entrega,
  precio, montos, dólares…) y tiene propuesta del bot; después lo de venta sin propuesta; al
  final el resto. Dentro de cada grupo, los más distintos primero. Antes iba solo por distancia
  y arrancaba con chats personales.
- **Los chats de `CONTACTOS_PERSONALES` no salen** (en el registro viejo, por los últimos 4
  dígitos): eran 89 casos. `--contar` dice cuántos se saltearon.
- **El registro viejo muestra contexto:** los mensajes anteriores del mismo chat, reconstruidos
  (pueden tener cruces), y se guardan con el ejemplo para que `evaluar` llegue con el mismo
  estado.
- **"¿Qué tiene que decir sí o sí?"** (solo si contesta): se guarda como `debeDecir` y el caso
  lo pide con `contiene`.
- **Limpieza línea por línea** y sin el espacio como separador del DNI: una lista de precios
  ya no se lee como teléfono ni bloquea la aprobación.

**Formato** de cada entrada: `buena` → `id`, `version`, `fecha` (AAAA-MM-DD, hora de
Argentina), `fuente`, `etiqueta`, `situacion: { cliente, contexto }`, `intencionLeida`
(informativa: en v1 puede venir cruzada por B1), `commitBot` (v2) o null, `respuesta`,
`accion` (`contesta`, `escala-callado` o `nada`), `conPrecio` (solo con `contesta`), `limites`,
`nota` y `estado` (`pendiente` o `fijado`, con `fijado: <fecha>`). `excepcion`: lo mismo sin
`accion`, `conPrecio`, `limites` ni `estado`. Los descartes (`dato-desactualizado`,
`falto-contexto`, `no-usar`): solo id, versión, fecha, fuente y etiqueta, sin texto.

**En `evaluar`** (`comoCaso` en `test/aprobados.js`, la corrida en `test/correr-caso.js`, que
comparten `evaluar` y `--fijar`): el contexto se reproduce antes (`{ cliente }` entra al
historial; `{ tanda, enviado }` llama a `decidir` con esas líneas y, si se mandó, lo dicho
entra al historial y confirma sus marcas; `{ humano }` como siempre) y el turno final es lo
que escribió el cliente, con `noContiene: limites` y `conPrecio`, `silencio` o `mudo` según la
acción. Valen las reglas globales. No suman a la línea de `casos.js`; sale con 1 si falla un
caso de `casos.js` o un fijado. `--aprobados <ruta>` y `--solo-aprobados`.

Ojo al contar: se cuentan ejemplos, no eventos. Con la espera en escucha, una persona que
contesta dentro de los 20 a 45 s deja el ejemplo incompleto (`'bot interpretando'`): es a
propósito (en vivo, esa respuesta cancela la tanda). En escucha el bot evalúa también mientras
una persona atiende: `contexto.humanoAtendiendo` separa eso. En el archivo viejo, contar
mensajes distintos, no filas: una misma escalación queda 2 o 3 veces, y una fila puede
mezclar turnos.

## Cerebro Sonnet (fase 1, en sombra)

Decisión de Tomás del 01/10/2026 (22:35): el bot va a pasar a que **Claude Sonnet 5.5 decida qué
contestar**, en lugar de las reglas de `responder.js`. Los errores en vivo de esos días (…8142,
…3910, …7038, Emanuel, Oriana …4038) eran el mismo: las reglas no leen la conversación. Tope de
gasto: **USD 60 por mes**, puesto en la cuenta de Anthropic. Esta es la **fase 1, en sombra**:
Sonnet piensa y se anota, **no se manda nada**. La fase 2 (en vivo) va en otro bloque.

**Qué no cambia, ni ahora ni en la fase 2:** los precios salen de la planilla y los calcula
`cotizador.js` (Sonnet los pide a una herramienta y el código verifica cada monto que escribe);
nunca cuánto le falta para la entrega mínima, nunca la promesa de que otra persona lo va a
contactar; si no sabe cómo seguir, silencio al cliente y aviso al grupo; tope de 4 mensajes por
tanda. Los audios los sigue transcribiendo Gemini; los comandos del grupo, el silencio de 45 min
tras una persona, chats viejos, lista negra y tester quedan como están.

**Cómo se prende:** `ANTHROPIC_API_KEY` y `CEREBRO_MODO=sombra` en el `.env`, y reiniciar.
`apagado` (el default, o cualquier otro valor) no llama nunca a la API. El resto tiene default:
`CEREBRO_MODELO` (`claude-sonnet-5-5`), `CEREBRO_TIMEOUT_MS` (20000, por pedido),
`CEREBRO_ESFUERZO` (`medium`) y los precios por millón para estimar el gasto
(`CEREBRO_USD_ENTRADA` 2, `_SALIDA` 10, `_CACHE_LEIDA` 0,20, `_CACHE_ESCRITA` 2,50).

**El enganche** (`pensarEnSombra` en `src/index.js`): en `atenderTanda`, justo después de
`aprendizaje.propuesta(...)`, si el modo es `sombra` y la tanda tiene texto (no solo fotos o un
pedido del catálogo, y sin un audio que no se entendió, donde el bot no interpreta), lanza
`cerebro.pensar` **sin esperarlo**. El resultado va al registro de aprendizaje como
`propuesta-sonnet`, con **el mismo `tanda`** que la propuesta del bot: `mensajes`, `escalar`,
`motivo`, `guardia`, `montos` (los de las herramientas), `uso` (tokens de entrada, salida, caché
leída y escrita), `usd` (estimado), `ms`, `modelo` y, si la guardia frenó, `frenados` (lo que
quería mandar). Un error se anota con `error` y nada más. Al cliente y al grupo no les llega nada:
lo prueba `test/cerebro.test.js` con dos procesos (apagado y sombra, `Math.random` fijo) que
tienen que mandar exactamente lo mismo. `ejemplos()`, `aprobar` y `reproducir` miran solo
`cliente`, `propuesta` y `humano`: el evento nuevo no los cambia. Una tanda cancelada (una
persona contestando, un chat escalado) no llega a la propuesta y tampoco a la sombra.

**`src/cerebro.js`**, `pensar({ chatId, mensaje, nombre, ahora? })` → `{ mensajes, escalar, motivo,
montosDeHerramientas, guardia, uso, usd, ms, herramientas, frenados? }` o `{ error, uso, usd, ms }`.
Nunca tira.
- **API:** `fetch` a `https://api.anthropic.com/v1/messages`, sin dependencias npm, con timeout
  por pedido y **un reintento ante 429 o 5xx** (el timeout no se reintenta). Sin clave: `{ error }`
  sin salir a la red.
- **Sonnet 5.5 no acepta `tool_choice: any`** (400: "Forced tool use is not supported"; lo dice la
  documentación del modelo, salido el 28/09/2026). Va `auto`, las instrucciones piden terminar
  siempre con `responder` o `escalar`, y lo que no termina así (texto suelto, 5 vueltas, una
  negativa `refusal`) **cuenta como escalar**. Tampoco acepta `temperature`. Las herramientas van
  con `strict: true`. `output_config.effort` sale de `CEREBRO_ESFUERZO`.
- **Lo que va en cada pedido**, armado por el código (`armarContexto`): la fecha y hora de Neuquén,
  la lista de usados activa (`#bateria`), lo que el estado ya sabe (modelo, otros modelos vistos,
  entrega, dólares, forma de pago, canje, insistencias con la entrega, temas explicados, PDF y
  lista ya mandados, notas, `#vendido`, escalado), las líneas de persona aparte
  (`state.lineasDePersona`, con hace cuánto), **las últimas 30 líneas del historial** marcadas
  `Cliente` (o `Cliente (audio)`) / `Vos (antes)` / `Persona de la cuenta` con hace cuánto (hasta el
  bloque Ninjo 1 del 05/10, lo del bot iba como `Bot`), y la tanda. Sin el número del
  cliente; el nombre, tapado con `gemini.sinDatosPersonales`, como lo que va a Google. Todo se lee
  del estado **antes del primer `await`**: un `#reset` o la respuesta del bot no cambian el pedido.
- **Las instrucciones** son `src/cerebro-reglas.md` (se lee al arrancar; cambiarlas pide
  reiniciar). Van como `system` con `cache_control` (y el contexto también, así las vueltas 2 a 5
  lo leen de la caché). Quién es (Fran), el estilo de `ESTILO`, los 4 ejemplos aprobados que hay
  en `test/ejemplos-aprobados.json` y 3 frases reales del flujo, las reglas del negocio
  resumidas, las prohibiciones, leer todo el chat, "si una persona dejó algo dicho o acordado en
  las últimas 72 h y el cliente sigue eso, escalar" y "ante la duda, escalar".
- **Las herramientas** (las implementa el código con lo que ya existe):
  - `buscar_equipos({ modelo?, capacidad? })`: las filas cotizables de `responder.leerPlanilla()`
    (con `#bateria` y sin los modelos que no se trabajan), con modelo, capacidad, batería
    (`bateriaDe`: el rango tal cual o "sellado"), precio de contado y entrega mínima; las de USADOS
    con color y detalles.
  - `lista_de_precios()`: `responder.listaDePrecios`, lo mismo que la lista de hoy (desde el bloque Ninjo 1b,
    partida en usados y sellados; con el stock de la app en vivo, desde el 08/10/2026, la del local: ver *El stock
    de la app en la planilla*, punto 8).
  - `cotizar({ modelo, capacidad?, entrega, entrega_texto })`: `cotizador.cotizar` con la config de la
    planilla. Desde el bloque Ninjo 1, la entrega la lee el código de `entrega_texto` (ver abajo).
    Devuelve 1 pago y 2 cuotas, o `llega: false` con la entrega mínima, o `paga_de_contado`.
    **Nunca una resta** (ni lo que falta ni el saldo). **Bajo el mínimo no cotiza con recargo**:
    en el bot eso viene después de dos insistencias; acá es `llega: false` y las instrucciones
    dicen insistir dos veces y después escalar.
  - Con la lista de precios no vigente, las tres devuelven error ("escalá").
  - `escalar({ motivo })` y `responder({ mensajes })` terminan el turno. Si vienen las dos, gana
    escalar. Una herramienta de datos pedida en la misma respuesta que `responder` no cuenta:
    no corrió antes de que escribiera.
- **La guardia** (`revisarSalida`), después de `responder`: cada mensaje pasa por
  `limpiarRedactado` (sin el saludo del principio ni el relleno, como lo que redacta Gemini) y
  - **todo monto** (con `$`, con 4 cifras o más, o en "mil"/"k"/"lucas"; `254.000`, `254000` y
    `254 mil` son lo mismo, `montosEn`) tiene que estar entre los que devolvieron las herramientas
    **en ese turno**: un precio del historial hay que volver a pedirlo. La dirección del local
    ("Belgrano 3090") no es un monto, y un año suelto ("salió en 2024", 4 cifras de 1900 a 2099
    sin `$`, separador ni "mil") tampoco;
  - como mucho 4 mensajes (desde el bloque Ninjo 1, del cuarto en adelante se juntan en el cuarto), de
    hasta 300 caracteres (la lista entera no entra: las instrucciones
    dicen pasar las líneas que vengan al caso);
  - nada de prometer a otra persona ni de prometer volver (`src/promesas.js`: la misma regla que
    las reglas globales de `evaluar`, que vivía en `test/correr-caso.js` y pasó a `src/` sin
    cambios), ni de "te falta(n)".
  Si algo no pasa: `escalar: true`, `guardia` con qué, y `frenados`.
- **Gasto:** por día de Argentina, en memoria, las llamadas a la API, los tokens y los USD
  estimados (`gastoDeHoy`). `/salud` muestra `cerebro: { modo, llamadasHoy, usdHoy }` (desde la fase 2
  también `chatsConSonnet`, y desde el bloque Ninjo 2 `reglas` y `gastoMes`: el del mes va en `estado.json`).

**`npm run sombra`** (`test/sombra.js`): toma las propuestas del bot de `data/aprendizaje-v2.jsonl`
(`--archivo` otro) de esos días (`--desde`, `--hasta`, días de Argentina; por defecto hace 2 días y
hoy) hasta `--max` (20). Por chat y en orden arma el historial de cada momento con las líneas del
cliente, las de la persona y lo que el bot mandó en vivo (las propuestas `modo: 'vivo'`), con su
hora, y le pregunta a Sonnet con la hora de la tanda. **El estado del chat no se reconstruye**:
Sonnet ve el historial y las líneas de persona, no "lo que el sistema ya sabe". Escribe
`data/sombra-AAAA-MM-DD.md` (`--informe` otro) con, por tanda, lo que escribió el cliente, lo que
contestó el bot, la persona, lo que contestaría Sonnet, la guardia, los tokens y los USD, y al final
el total y el promedio por tanda. Precios de la copia congelada; `--planilla-en-vivo` usa la de hoy
(solo lectura). Estado y aprendizaje en temporales; solo sale a Anthropic (y a Google Sheets con
`--planilla-en-vivo`). **Gasta**: de 1 a 5 llamadas por tanda, con la clave del `.env`.

**Los tests que cargan `index.js` fijan `CEREBRO_MODO=apagado`** (los 28 de antes y el nuevo):
dotenv completa lo que falta con el `.env` real, y con `sombra` ahí `npm test` saldría a Anthropic
con la clave de verdad. Lo revisa el último check de `test/cerebro.test.js`, como el check 10 de
`test/aprendizaje.test.js` con `APRENDIZAJE_PATH`.

Lo prueba `test/cerebro.test.js` (45 checks en la fase 1; 53 desde la fase 2, todo con un `fetch` de mentira que contesta como la
API).

## Cerebro Sonnet, fase 2 (contesta de verdad)

Decisiones de Tomás del 02/10/2026, con la fase 1 en sombra desde ese día a las 11:08 (la
repetición de 20 tandas reales dio US$0,0077 por tanda y 0 frenadas por la guardia). **Sonnet
contesta de verdad**: primero al tester y, con un interruptor, a los chats nuevos. Los demás chats
siguen con el bot de siempre y Sonnet en sombra. Antes de contestar lee el contexto (hasta 30
líneas del chat y lo que dejó dicho una persona) y avisa en el grupo cuántos mensajes leyó.

**Los modos (`CEREBRO_MODO`)**, `cerebro.quienAtiende(chatId)`:

| Modo | Le contesta Sonnet | A los demás |
|---|---|---|
| `apagado` (default) | a nadie: es el interruptor general, ni la marca del chat lo prende | el bot, sin llamar a la API |
| `sombra` | solo a los chats marcados (`atiendeSonnet: true`) | el bot, y Sonnet en sombra (fase 1) |
| `tester` | a `NUMEROS_TESTER` y a los marcados | el bot, y Sonnet en sombra |
| `nuevos` | al tester, a los marcados y a los **chats nuevos** (los marca) | el bot, y Sonnet en sombra |
| `todos` | a todos los que hoy contesta el bot | — |

`#bot <número>` deja `atiendeSonnet: false`: ese chat lo atiende el bot (y Sonnet en sombra) con
cualquier modo, también el tester. Cualquier otro valor de `CEREBRO_MODO` cuenta como `apagado`.

**Chat nuevo** (`cerebro.esChatNuevo`, con `nuevos`): su primer mensaje llega con el modo ya en
`nuevos`, no tenía estado guardado, no es del tester y no está en la lista de chats viejos, con la
lista al día (si se está poniendo al día, no se marca: contesta el bot). `procesar` lo mira ANTES de
que el mensaje entre al estado y deja `atiendeSonnet: true` y `atiendeSonnetDesde`. Desde ahí ese
chat lo atiende Sonnet siempre, aunque después se cambie el modo, hasta `#reset` (se lleva el chat
entero: con `nuevos`, el mensaje siguiente lo vuelve a marcar como nuevo) o `#bot`. `/salud` cuenta
los marcados (`cerebro: { …, chatsConSonnet }`).

**Lo que no cambia:** lista negra, grupos, `#comandos`, el silencio de 45 minutos tras una persona,
el escalado ya puesto (`control.js`), el audio que no se entendió (escala sin interpretar), el
pedido del catálogo, chats viejos (`SOLO_CHATS_NUEVOS`: un chat viejo va en borrador, conteste quien
conteste), el tope de 4 mensajes, `MODO_ESCUCHA` y `MODO_BORRADOR`. Todo eso pasa antes de que se
decida quién contesta.

**Cómo contesta** (`atenderTanda` en `src/index.js` → `contestarConSonnet` → `cerebro.contestar`):
va `cerebro.pensar` **en lugar de** `decidir` (no los dos: `decidir` cambia el estado). Antes de
preguntar, los temas explicados se ponen al día con el historial, como en `decidir`. Lo que devuelve
lo convierte `cerebro.comoResultado` al `resultado` de siempre:
- **Responder:** los mensajes de Sonnet pasan por el **filtro de repetidos** del bot
  (`responder.sinLoYaDicho`, el de `decidirYFormatear`: si todo ya se dijo, escala callado con
  `TODO_REPETIDO`; con una tanda de acuses, desde el bloque Ninjo 1, no sale nada y no escala), el **PDF del compromiso** y el **saludo del día** (`conSaludo`, con las mismas
  reglas: una vez por día y no si hoy ya habló alguien de la cuenta). No se capitalizan: las
  instrucciones piden casi todo en minúsculas.
- **El PDF:** `responder` tiene un campo booleano obligatorio `compromiso_de_pago`; Sonnet lo pone en
  `true` cuando explica la financiación o cotiza en cuotas y "lo que el sistema ya sabe" dice que
  todavía no se mandó (ahora lo dice siempre, mandado o no). El código lo adjunta con
  `conCompromiso`, una sola vez por chat: con lugar, como mensaje aparte con el pie "te paso el
  compromiso de pago"; con 4 mensajes, el último pasa a ser el pie del PDF. Lleva las marcas
  `compromisoEnviado` y `temasExplicados.financiacion`.
- **Lo que queda en el estado** (para el resumen, `#vendido`, el seguimiento y el próximo turno): ya,
  el nombre (como `decidir`), el modelo y la capacidad del último `cotizar` (o del único modelo de
  `buscar_equipos`), la `entrega` de ese `cotizar` y `ultimaRespuestaSonnet` (`{ ts, mensajes }` o
  `{ ts, escalo }`); como marcas que se confirman cuando el mensaje sale, `preciosMostradosDe` (los
  modelos cuyo precio salió en la respuesta) e `insistenciaEntrega` (+1 por modelo cuando `cotizar`
  dio `llega: false` y Sonnet respondió).
- **Escalar o la guardia:** el mismo camino que un escalado callado de hoy: 🔕 al grupo con el
  motivo (si fue la guardia, empieza con "guardia:"), el chat queda escalado y callado, y el lead va
  a la planilla. Si escala no sale nada más en ese turno, aunque en la misma respuesta haya un
  `responder`.
- **Error de la API, timeout o sin clave:** contesta el bot de siempre (`decidir`) y el grupo recibe
  **una sola vez por racha** `⚠️ Sonnet no responde (<motivo corto>): contesta el bot de siempre`
  ("error 500", "timeout", "falta la clave"). Se rearma cuando Sonnet vuelve a contestar o escalar.
- **El registro de aprendizaje:** la `propuesta` lleva `fuente: 'sonnet'` y `sonnet: { modelo, uso,
  usd, ms, guardia, herramientas, leidos }`, con el mismo `tanda` de siempre (`aprobar`,
  `reproducir` y el resumen siguen andando). Si Sonnet falló, la propuesta es del bot y queda un
  `propuesta-sonnet` con `error` y `enVivo: true`. A los chats que no atiende Sonnet (con `tester` o
  `nuevos`, o los que sacó `#bot`) los sigue la sombra de la fase 1.

**La guardia suma los montos con puntos** (decisión del 02/10): un monto de 4 cifras o más sin puntos
("$740000", "740000") o con comas de miles ("740,000") frena y escala (`cerebro.sinPuntosEn`), aunque
haya salido de una herramienta. "740 mil", "128gb", un año suelto y "Belgrano 3090" no cuentan.

**Los avisos al grupo:**
- Con `tester` y `nuevos` (y en los chats marcados con cualquier modo), cada vez que a un cliente le
  llega algo de Sonnet: `🤖 Sonnet → <nombre> · leí <N> mensajes de contexto (+M de una persona) ·
  <primer mensaje de Sonnet, hasta 80 caracteres> · wa.me/<número>`. N son las líneas del historial
  que fueron en el pedido (con la tanda); M, las de una persona que van aparte (si no hay, no va el
  paréntesis). También si la tanda se cortó porque el cliente escribió en medio y algo alcanzó a
  salir; no si no salió nada (Evolution no confirmó), en borrador ni en escucha.
- Con `todos`, en lugar de uno por respuesta, un resumen por hora de reloj, solo si hubo respuestas:
  `🤖 Última hora: <n> respuestas de Sonnet, leyó <promedio> mensajes de contexto en promedio (el que
  menos, <mínimo>) · <escalados> escalados · US$<gasto>` (`revisarResumenSonnet`, cada 5 minutos;
  en memoria: un reinicio lo pierde). Si al terminar la hora ya no está en `todos`, no sale.
- Los escalados siguen con su 🔕 de siempre, con el motivo de Sonnet.

**Los comandos del grupo** (`src/cerebro-comandos.js`; solo desde la cuenta, en el grupo, con el
número como `#sigue`: con o sin 549, o el `wa.me`):
- `#sonnet <número>`: Sonnet lee ese chat ahora (las últimas líneas seguidas del cliente son "lo que
  escribió ahora") y contesta **en el grupo**: `🧠 A <nombre> le contestaría:` con los mensajes (y "+
  el PDF" si lo pondría), o `🧠 Escalaría: <motivo>` (con lo que quería mandar si lo frenó la
  guardia), más "leí N mensajes de contexto · US$… · al cliente no le mandé nada". No toca el estado
  ni el registro. Con `apagado` no le pregunta nada. Suma al gasto del día.
- `#comparar <número>`: las últimas 3 tandas del registro de ese chat (por `clave`): el cliente, lo
  que contestó el bot (con si le llegó) o Sonnet en vivo, lo que contestó una persona, y lo que
  propuso Sonnet en sombra; si no hay propuesta para esa tanda, lo dice.
- `#bot <número>` / `#sonnet-si <número>`: `atiendeSonnet` en `false` o en `true` (con la fecha).
  Confirman en el grupo; con `apagado`, lo aclaran.

**Las instrucciones** (`src/cerebro-reglas.md`), ajustes del 02/10: la condición (batería o
"sellado") se copia tal cual, fila por fila, nunca resumida; montos siempre con puntos; "¿para
cuándo me lo entregás?", "¿cuándo lo puedo retirar?" y "¿cuándo lo paso a buscar?" son turno (y con
un turno acordado por una persona, escala); leer el contexto sí o sí, y logística con una persona en
las últimas 72 h escala; 18 años con DNI alcanza, menos de 18 escala; si pregunta si es un bot o una
persona, escala (reemplaza a la línea que prohibía decir que es un bot); con un canje en curso no se
pide la entrega mínima en efectivo, y la diferencia que acordó una persona nunca es una entrega
(escala); si escala, no manda nada más; el campo `compromiso_de_pago`.

**`npm run bateria-cerebro`** (`test/bateria-cerebro.js` y `test/bateria-cerebro-casos.js`): 53
casos y 148 turnos con todo lo que Tomás fue marcando (stock y condición, `#bateria`, lista, Jazz,
cuotas, cotización, entrega baja, descuento, dólares, medios de pago, datos fijos, edad, turnos,
persona pendiente, Oriana, …8142, canjes, …7038, …3910, modelos que no se trabajan, chat viejo,
contexto largo, escalados, postventa, bot o persona, saludo, cierres, precio viejo, tanda de tres,
reservas, enojo, batería exacta, esquema de pago propio, local, audio). Los casos los escribió Codex
y los revisó Claude. Cada caso corre como un chat real contra `cerebro.contestar`: su planilla (la
copia congelada o, con `--planilla-en-vivo`, la de hoy en solo lectura, con `sheets.copiaEnVivo`),
su `#bateria`, las líneas de antes con su hora (las de persona dejan `ultimoHumano`) y cada turno a
la hora del anterior más `despues` (el primero, un martes a las 15:00). Lo que contesta Sonnet "sale"
como en vivo (marcas confirmadas, al historial, con el saludo y el PDF de mentira); un turno que
escala no deja nada. Chequeos por turno: `escala`, `contiene` / `contieneAlguno` / `noContiene`
(regex sobre el texto sin tildes ni mayúsculas), `motivo`, `montos` / `noMontos` (calculados con
`cotizador.cotizar` y la planilla del caso, nunca escritos a mano), `maxMensajes`, `compromiso`,
`usa`; y siempre: ningún monto inventado, sin "te falta", sin promesas, montos con puntos y sin
saludo duplicado. Escribe `data/bateria-cerebro-AAAA-MM-DD.md` (`--informe` otro): arriba el total
de casos y turnos, cuántos pasan, los que fallan y el gasto; por caso y turno, el cliente, lo que
contestó Sonnet o el motivo, las herramientas, cuántos mensajes leyó, ✓/✗ por chequeo, tokens y US$.
`--solo <texto>`, `--max <n>`. **Gasta**: de 1 a 5 llamadas por turno, con la clave del `.env`.

Lo prueban `test/cerebro.test.js` (53 checks: los de la fase 1 y los montos sin puntos, el campo
`compromiso_de_pago`, lo leído y lo que queda para el estado), `test/cerebro-vivo.test.js` (31
checks, por `procesar`: cada modo, el chat nuevo, `#reset`, el saludo, el PDF, los repetidos, el
estado, escalar y la guardia, el error con un `⚠️` por racha, los avisos, el resumen de la hora y los
cuatro comandos) y `test/bateria-cerebro.test.js` (10 checks: 6 casos de punta a punta con un
Sonnet de mentira, uno que falla a propósito, el informe y que todos los montos de los casos estén
en la copia congelada). Con `apagado`, `evaluar -v` sale idéntico al de antes (6.490 líneas, con
`Math.random` fijo).

## Cerebro Sonnet: bloque Ninjo 1 (05/10/2026)

El 05/10 Claude comparó el bot con el manual de Ninjo (una plataforma de agentes de venta). Este bloque
arregla los errores que el cerebro tenía y suma mejoras que no piden decisiones nuevas. El seguimiento
(apagado) va en el bloque 2; el bot de siempre (`responder.js`) no cambia: solo exporta `esAcuse`,
`marcaSeguida` y `ultimaTandaEsperaAlCliente`, y `evaluar -v` sale idéntico.

- **Llevar al turno** (`cerebro-reglas.md`): el objetivo es que elija un equipo, sepa cuánto paga y saque
  turno para venir a retirarlo. Si eligió el modelo y dice que paga de contado, o `cotizar` da
  `paga_de_contado`: el precio y "qué día te podés acercar?" en la misma respuesta (con el día, el
  horario; con día y hora, escala callado, como siempre). Si acepta la cotización ("dale, me lo llevo",
  "lo quiero", "cuándo paso?"): qué día, sin "quedo atento" ni "¿estás seguro?". Después de 1 pago y 2
  cuotas sin que acepte, no cierra con el turno (eso espera una decisión de Tomás). Ejemplos 8 y 9.
- **Los acuses no se le preguntan a Sonnet** (`cerebro.contestar`, decisión del 29/09): si toda la tanda
  son acuses (`responder.esAcuse`) y el acuse anterior ya se contestó (`acuseContestado` seguido), o lo
  último de la cuenta fue la línea de la entrega inicial, un "te cotizo"/"te paso" (del bot o de una
  persona) o la lista de precios (también con un renglón antes, renglón por renglón): no se llama a la
  API, no sale nada, no escala y la propuesta queda con el motivo `acuse` (`sonnet.sinLlamar` dice por
  qué). Un "no" después de la entrega inicial sí se le pregunta (como `esAcuseCorto` del bot), y también
  cualquier acuse si esa tanda trae una cotización ("1 pago de", "2 pagos de", el 📱), aunque diga "te paso los
  numeros": es para avanzar, como el 📱 del bot (C67T6; revisión de Claude del 05/10). Al primer
  acuse contesta Sonnet y la respuesta lleva la marca `acuseContestado`, que se confirma si sale. Si lo
  que contesta a un acuse ya se dijo todo, es mudo (sin 🔕 y sin escalar), no `TODO_REPETIDO`. Un acuse
  que no se pregunta no rearma el ⚠️ de una caída. `contestarConSonnet` le pasa las líneas de la tanda.
- **La entrega la lee el código** (`cotizar` con `entrega_texto`, obligatorio, `strict`): la frase del
  cliente tal cual. `entregaDelTexto` la lee con lo de `decidir` sin tocar `extractor-local.js`: un monto
  en dólares da error "monto en dólares: escalá"; después la corrección, la entrega partida,
  `extraerMonto` y, si es un número solo, `montoSuelto`; un número chico (menor a 100 sin "mil", "k",
  "lucas" ni "palo", contra lo leído o contra lo de Sonnet) da error "no es una entrega" y no cotiza. Si
  lee un monto, cotiza con ese aunque Sonnet pase otro y lo devuelve en `entrega_leida` ("$300.000"); si no
  lee nada, con la `entrega` de Sonnet. Si no coinciden, quedan las dos en `entregasDistintas` (en la
  propuesta en vivo, `sonnet.entregasDistintas`; en la sombra, `propuesta-sonnet.entregasDistintas`). El
  estado guarda la entrega con la que se cotizó. "1.5 palos" no lo lee el código (`extraerMonto` da
  $5.000.000, también en `decidir`): con esa frase queda lo de Sonnet. Las reglas: "pasá su frase en `entrega_texto`: la cuenta
  la hace el sistema. Vos nunca sumás".
- **La guardia** (`revisarSalida`, con la vuelta de corrección de siempre):
  - frena un mensaje que **nombra algo interno** (`nombraAlgoInterno`, sin tildes ni mayúsculas, con
    límites de palabra): `buscar_equipos`, `lista_de_precios`, `cotizar(`, `paga_de_contado`,
    `llega: false`, `entrega_minima`, `entrega_texto`, "el sistema", "la planilla", "el historial", "la
    herramienta", "persona de la cuenta", "escalo", "escalar", "escalé", "escalado". Motivo: "nombra algo
    interno: …";
  - frena **la promesa de un archivo que no va** (`prometeArchivo`): "te paso", "te mando", "te envío" o
    "ahí va(n)" y, en las 6 palabras que siguen, fotos, video, pdf, archivo, ubicación, link o el
    compromiso. Con el PDF en esa respuesta (`compromiso_de_pago` y todavía no se mandó) valen el pdf, el
    archivo y el compromiso; las fotos, el video, la ubicación y el link no van nunca. "Te paso los
    números" y "te paso el 13 y el 14" no frenan. Motivo: "promete un archivo que no va: …";
  - **más de 4 mensajes ya no frena**: del cuarto en adelante van juntos en el cuarto, con salto de línea,
    y después se mira el largo (más de 300, frena como siempre);
  - antes de todo, **lo que delata a una IA** (`sinMarcasDeIA`, solo en lo de Sonnet; `limpiarRedactado`
    no cambia): "—" y "–" pasan a ", " (pegadas entre dos números, a "-": "85–93%"), sin "¿" ni "¡",
    "**x**" pasa a "*x*", sin viñetas ni títulos al principio de un renglón ("- ", "• ", "* ", "# "), sin
    ", ,", dobles espacios ni una coma al principio o al final. El 📱 y los montos no se tocan.
- **Las reglas, ordenadas** sin cambiar conductas: cada regla en un solo lugar (no mandar nada si escala,
  el tope de 4, los montos con puntos, cuánto le falta, bot o persona, la logística con una persona en
  72 h, lo que dejó dicho una persona, el menor de 18, el modelo que no aparece, el canje con los datos),
  "Leé el contexto" y "Leé todo el chat" en una sola sección, "turno" solo para la cita en el local (la
  vuelta del modelo es "respuesta"), y la razón de escalar corregida: "Ante la duda, escalá: es mejor que
  una respuesta equivocada. Pero escalar deja al cliente esperando a una persona, así que no escales lo
  que estas reglas ya contestan." Nueva línea en "Lo que no hacés nunca": nombrarle al cliente algo interno.
- **Las etiquetas del historial** (`armarContexto`): lo que ya contestó el bot (el de siempre o Sonnet) va
  como `Vos (antes)`, no `Bot`; las reglas lo explican.
- **Datos fijos nuevos**: el origen de los equipos (`DATOS_FIJOS.importados`; la batería exacta o el estado
  de una unidad siguen escalando) y los papeles de contado ("de contado no necesitas nada, solo venir").
- **Los audios**: una línea del cliente con `audio: true` va como `Cliente (audio)`, y si lo de ahora vino
  por audio el pedido dice "Lo que dijo ahora el cliente, en un audio transcripto". Las reglas: si un monto
  o un modelo raro no cierra, preguntar. `atenderTanda` le pasa el audio a `contestar` y a la sombra.

**La batería** (`npm run bateria-cerebro`): casos 64 a 77 (85 casos, 195 turnos), una regla global nueva
("nada interno": ningún mensaje que quiso mandar nombra algo interno), la espera `sinPreguntar: true` (un
acuse que no se le pregunta a Sonnet) y el informe lo dice ("no se le preguntó (acuse: …)"). El corredor le
pasa a `contestar` las líneas de la tanda con su hora, como index.js.

Lo prueban `test/cerebro.test.js` (84 checks), `test/cerebro-vivo.test.js` (40) y
`test/bateria-cerebro.test.js` (13; 8 casos de punta a punta, dos de acuses sin llamadas).

## Cerebro Sonnet: bloque Ninjo 1b (05/10/2026)

Decisiones de Tomás del 05/10 (después de la prueba en vivo del bloque 1, que pasó 8 de 8). El bot de
siempre (`responder.js`) no cambia: solo exporta `listaDePreciosPartida`, y `evaluar -v` sale idéntico.

- **El contexto completo desde Evolution** (`src/contexto.js`). Sonnet leía solo el historial de
  `estado.json`, que arranca cuando el bot vio el chat: en 13 de 35 respuestas en chats viejos leyó 3
  líneas o menos (…4517 y …6356: a clientas que pagan cuotas les preguntó qué modelo buscaban). Ahora,
  antes de pensar (`contestarConSonnet`, `#sonnet`, la sombra con persona y el barrido del silencio),
  `contexto.completar(chatId)` le pide a Evolution los últimos 30 mensajes del chat
  (`evolution.buscarMensajesDeChat`: `POST /chat/findMessages` con `where.key.remoteJid`, solo lectura,
  8 s de tope; con el `@lid` del número en `chats-viejos.json`, también ese) y los suma al historial:
  - solo con menos de 30 líneas guardadas y sin `evolutionTraido` (la fecha en que se trajo). `#reset`
    deja `evolutionTraido` en la hora del reset (sin volver a crear el chat: la hora queda bajo la clave
    interna y `state.obtener` la pone cuando el chat vuelve a nacer), así cada prueba arranca limpia;
  - si llega un registro de otro chat (el filtro por chat nunca se probó en la PC), no usa ninguno, el log
    dice `[contexto] <chat>: Evolution no filtró por chat` y no se marca;
  - cada registro es una línea: la hora de `messageTimestamp`, el texto de `textoDelMensaje` (movida a
    `src/texto-del-mensaje.js`, la comparten index.js y contexto.js) o "[foto]", "[audio]", "[video]",
    "[sticker]", "[archivo]"; sin reacciones, protocolo, borrados (`status: DELETED`) ni encuestas. Del
    cliente si no es `fromMe`; del bot si el id está en `idsBot` de chats-viejos o en autoria.js
    (`autoria.anotado`); si no, de una persona (`humano: true`, y va también a `lineasPersona`). Llevan
    `evolution: true`;
  - **sin duplicados**: desde este bloque cada línea nueva del historial guarda el `id` del mensaje (la
    del cliente, la de un envío confirmado del bot, la de una persona). Una línea de Evolution con el
    mismo id no entra; con una línea vieja sin id, es la misma si es del mismo lado, con el mismo texto
    (sin mayúsculas ni espacios dobles) y a menos de 3 minutos, y queda la del historial. Un "[audio]" de
    Evolution también es la línea de un audio del historial (la que tiene la transcripción). Lo del último
    minuto antes de la línea más nueva del historial, o posterior, no entra: está llegando por el webhook;
  - se ordena por hora y quedan las últimas 30 (`state.completarHistorial`);
  - si Evolution falla o tarda más de 8 s, sigue como antes (`[contexto] <chat>: Evolution no contestó
    (…)`), ese chat no se vuelve a pedir por 10 minutos y no se marca. Sin `EVOLUTION_APIKEY` no se pide.

  `leidos.evolution` cuenta las líneas del pedido que vinieron de ahí: el aviso de cada respuesta dice
  "leí 30 mensajes de contexto (18 de Evolution)", el resumen de la hora suma "N chats completados con
  Evolution" y el registro lleva `sonnet.leidos.evolution` y, si falló, `sonnet.contexto: 'evolution no
  contestó'`. **`npm run probar-contexto -- 549XXXXXXXXXX`** (desde la carpeta del bot): solo lectura, no
  carga `state.js`, de `chats-viejos.json` lee solo `idsBot` y `lids`; imprime cuántos registros trajo, si
  todos son de ese chat y las últimas 30 líneas como las vería Sonnet.
- **Regla de 72 h: se escalan solo los tratos** (`cerebro-reglas.md`). Escala si en las últimas 72 horas
  una persona le hizo un trato y el cliente lo sigue: un precio especial (distinto del de las
  herramientas), un turno con día u hora, la tasación de su equipo, o algo que la persona quedó en hacer
  ("te aviso", "te confirmo", "consulto al depósito", "te mando fotos"). Lo demás lo contesta aunque haya
  hablado una persona (precios de la planilla, la dirección y los datos fijos, el stock, cómo es la
  financiación, una cotización con la planilla). Lo de un turno que acordó una persona lo sigue esa persona.
- **Cuando vence el silencio de una persona** (`revisarSilencios` en index.js, cada 1 minuto). Una línea
  del cliente que llegó dentro de los `SILENCIO_TRAS_HUMANO_MIN` en que habló una persona entraba al
  historial pero no a una tanda: cuando el silencio vencía, nadie le contestaba (…7024: 68 horas, con una
  venta caliente). Le toca a un chat si tiene `ultimoHumano` y ya pasó el silencio; lo último del historial
  es del cliente, de después de `ultimoHumano` (y la primera de esas líneas llegó con la persona
  atendiendo: las de después ya tuvieron su tanda); esa línea tiene menos de `SILENCIO_MAX_HORAS` (72); no
  está escalado, callado ni pausado ni tiene una tanda en curso; lo atiende Sonnet y le llega (listas de
  prueba); y no se atendió antes (`silencioAtendido`, la hora de esa línea, que se marca ANTES de
  arrancar). Hasta `SILENCIO_MAX_POR_BARRIDO` (3) chats por barrido. Va por el camino de una tanda normal
  (`atenderChat`, con `humanoAtendiendo` en false y la propuesta con `origen: 'silencio'`): contesta
  Sonnet, o escala si sigue un trato. Si Sonnet no puede (error de la API), el bot de siempre **no**
  contesta: al cliente no le sale nada y al grupo le llega `💬 SIN CONTESTAR — <nombre> — "<la última
  línea>" — wa.me/<número>`. Nunca en escucha ni en borrador. Si todo lo que quedó sin respuesta son acuses
  o agradecimientos ("Okiss dale", "Noo, gracias a vos", "Dale dale", 👍: `esCierre`, más amplio que
  `responder.esAcuse`), no lo toma: la charla la cerró la persona (decisión de Tomás del 05/10/2026, al
  revisar el bloque: al arrancar habría contestado tarde 3 de esos en chats que había cerrado Fran).
  **Desde el 07/10/2026 lo comparte con `#sigue`** (que al reactivar contesta lo que dejó escrito el
  cliente, ver la tabla de comandos): las guardas (`porQueNoSeContesta`: contacto personal, lo atiende
  Sonnet, listas de prueba, tanda en curso), qué es texto (`conTextoDeVerdad`: ni la línea `[foto]` de una
  foto sin epígrafe ni un audio que no se entendió), las líneas del final del historial
  (`ultimasDelCliente`) y el encolado (`encolarSinContestar`, con `origen: 'sigue'` para `#sigue`). Una
  `[foto]` el barrido la ve como si no estuviera: sola no lo dispara, y después de un texto no cambia cuál
  es la última línea (la de `silencioAtendido`).
- **Las dos listas de usados**: con `#bateria 85-93` (la activa no es LISTA), `buscar_equipos` devuelve
  además `al_100` (las filas de LISTA, al 100% o selladas, que la activa tapó por el mismo ID:
  `sheets.reemplazadasPorId`, en `listaAl100`) con su contado y su entrega mínima, y `cotizar` acepta
  `al_100: true`. El pedido dice "Listas de usados: la activa (#bateria) es LISTA 85-93. También podés
  ofrecer la de LISTA (al 100%)". Las reglas: si pregunta por la batería o "al 100%", las dos ("tengo en
  85-93% $X, sino al 100% en $Y"); si no hay al 100%, "al 100% justo no tengo" y sigue; el % exacto de una
  unidad sigue escalando.
- **La cotización en el bloque y el PDF**. Sonnet ya no escribe "1 pago de $X o 2 pagos de $Y" (en …7024 un
  cliente sumó las dos): pone un mensaje que es exactamente `[cotizacion]` y el código lo reemplaza por el
  bloque de cada `cotizar` de esa respuesta que dio 1 pago y 2 cuotas (`cotizador.bloqueSonnet`; hasta 3,
  en el mismo mensaje, separados por un renglón en blanco):

  ```
  iPhone 14 128GB 85-93% 📱
  Haciendo una entrega de $385.000 te quedarían:
  · 1 cuota de $X
  · o 2 cuotas de $Y cada una
  Este mes abonás solo la entrega. Las cuotas arrancan el mes que viene
  ```

  La guardia frena (con su vuelta de corrección) un `[cotizacion]` sin un `cotizar` válido y la cotización
  escrita a mano ("1 pago de", "1 cuota de", "2 cuotas de", "2 pagos de" con un monto: `cotizaAMano`,
  motivo "la cotización va en el bloque"). El bloque no cuenta para los 300 caracteres pero sí para el tope
  de 4. **El PDF del compromiso lo decide el código**: sale con la primera respuesta que lleva un bloque, si
  todavía no salió (no con la entrega inicial ni con la explicación de la financiación).
  `compromiso_de_pago` salió de `responder`, de las reglas y de "lo que el sistema ya sabe"; "te paso el
  compromiso de pago" vale solo si va el PDF. `cotizacionEnLaUltimaTanda` reconoce el bloque ("2 cuotas
  de", y ahora también "1 cuota de"). Las reglas: un mensaje antes ("dale, con $X de entrega llegamos al
  13"), `[cotizacion]` y "cual te cierra mas?"; si elige una opción ("las 2 cuotas") o acepta, qué día.
- **Cliente de cuotas** (`que_me_alcanza`, strict, con `monto_texto`): el monto lo lee `entregaDelTexto`
  (dólares y números chicos dan error) y devuelve `de_contado` (los 2 más caros que paga enteros) y
  `con_entrega` (los 2 más caros que retira con ese monto y valen más), con contado y entrega mínima; el
  monto leído también vale para la guardia. Si vino por las cuotas o pide recomendación, no le pasa precios
  de contado: un equipo de gama media con lo que lo retira (su entrega mínima) y le pide un presupuesto.
- **Ajustes de venta**: un modelo del 11 al 18 que no está → `buscar_equipos` devuelve `parecidos` (otra
  variante del mismo número, o el de abajo y el de arriba; hasta 2, con su contado) y Sonnet dice "justo
  ese no me esta quedando, tengo el X" con `aviso_grupo` en `responder`: el código manda `📌 <nombre> —
  <aviso> — wa.me/<número>` y el chat sigue con Sonnet (en borrador va al pie del borrador). **Desde el 08/10/2026
  (decisión de Tomás):** eso es si todavía no dijo con cuánto cuenta; si ya lo dijo (en ese mensaje o antes), Sonnet
  cotiza el primero de `parecidos` (su modelo y su capacidad; `cotizar` da esa misma fila porque `buscarTodas` ordena
  por precio) con esa entrega y hace lo de siempre con lo que devuelva: el bloque con "te sirve ese o tenias pensado
  otro?" y sin el contado, la entrega inicial del parecido si no llega, o el contado y el turno si lo paga entero
  (reglas, *Modelos*, y el ejemplo 19; casos 112 y 113). `cotizar` nunca miró qué modelo nombró el cliente. **Y desde el
  08/10/2026 (decisión de Tomás), lo mismo con otro modelo que sí está:** antes, "y el 14?" después de cotizar el 13 era
  otra consulta de stock (solo el contado); si ya dijo con cuánto cuenta (en el historial o en lo que el sistema ya sabe:
  "con cuánto dijo que cuenta para la entrega"), Sonnet cotiza ese modelo con esa entrega ("el 14 de 128gb al 100%, con
  los $450.000 de entrega te queda asi" · `[cotizacion]` · la pregunta de cierre, con otras palabras si ya la hizo: el
  filtro de repetidos se come la idéntica), su entrega inicial si no llega o el contado y el turno si lo paga entero; el
  PDF no vuelve a salir (`compromisoEnviado`). Sin la entrega dicha, solo el contado (reglas, *Stock y precio*, y el
  ejemplo 20; casos 114 y 115). El canje junta
  antes de escalar lo que la persona igual va a preguntar (modelo, capacidad, batería, si le cambiaron algo,
  fotos, qué se lleva y cuánto pone arriba), de a una cosa; el mini "por el momento no lo estamos
  tomando"; roto también se toma. Un saludo solo o postventa: "contame". "Tarjeta" sin aclarar es de
  crédito. La lista completa: `lista_de_precios` devuelve `usados` y `sellados` y Sonnet pone `[lista]`
  (dos mensajes tal cual, cuentan para el tope de 4; si pasan, frena). Con el stock de la app en vivo, desde el
  08/10/2026, es la lista del local (ver *El stock de la app en la planilla*, punto 8). Descuento: "los precios son fijos"
  y la financiación sin tarjeta, sin números. Comparar sigue escalando. Si vuelve a preguntar cuándo lo
  retira, el día otra vez con otras palabras, nunca "cuando vos puedas". Más ejemplos de Tomás y Fran en
  las reglas (11 a 18).
- **El seguimiento, rehecho** (ver *Qué nunca hace* y las variables). Sigue apagado: lo prende Tomás.

**La batería**: casos 78 a 104 (112 casos, 239 turnos), `evolution` por caso (pasa por
`contexto.completar`), `postventa: true`, `aviso: true` y montos `al100: true`, y dos reglas globales más
(la cotización solo en el bloque; a un caso de postventa nunca se le pregunta qué modelo busca). Cambiaron
los casos 5 y 6 (el PDF va con el bloque), 9 (nunca "cuando vos puedas"), 22a y 22b (el canje de a una
cosa), 24 (el 18 que no está ya no escala) y 34 (el "hola" solo es "contame").

Lo prueban `test/contexto.test.js` (17 checks, nuevo), `test/cerebro.test.js` (99), `test/cerebro-vivo.test.js` (52),
`test/sombra-persona.test.js` (11), `test/bateria-cerebro.test.js` (17; 10 casos de punta a punta) y
`test/seguimiento.test.js` (25, reescrito).

## Cerebro Sonnet: bloque Ninjo 2 (06/10/2026)

De la revisión de Ninjo del 05/10 (puntos 3.1, 3.2 y 3.3): hasta acá no se podía contestar bien "¿por qué
no le contestó a X?", "¿con qué reglas contestó?" ni "¿qué está prendido?" sin leer la consola entera. **No
cambia nada de lo que se le dice al cliente** (`evaluar --offline -v` sale idéntico con `Math.random` fijo),
ni las reglas, las herramientas de Sonnet, el cotizador o el bot de siempre.

**El evento `silencio`** (registro de aprendizaje, `aprendizaje.silencio`): una tanda, o una línea, que se
quedó sin respuesta. Lleva `motivo`, `lineas` (los ids de WhatsApp de las líneas del cliente; `[]` si no
hay) y los campos de siempre; dentro de una tanda, también `tanda` (la de su `propuesta`, si ya está
anotada) y `origen: 'silencio'` si la armó el barrido del silencio (`origen: 'sigue'` si la armó un `#sigue`,
desde el 07/10/2026). Los motivos (todos en `src/index.js`):

| `motivo` | Cuándo | Dónde |
|---|---|---|
| `persona` | escribe dentro de los `SILENCIO_TRAS_HUMANO_MIN` de una persona (por línea), o una persona escribió mientras la tanda esperaba, se armaba o se mandaba | `procesar`; `atenderTanda` (al empezar, después de pensar y en `motivoDeCorte`) |
| `pausado` | lo mismo con `#pausa` | ídem |
| `escalado` | el chat está escalado y callado | `procesar`; `atenderTanda` (al empezar y en el envío) |
| `repetido` | el filtro de repetidos vació la respuesta (`TODO_REPETIDO`, de Sonnet o del bot de siempre), también la de un acuse que Sonnet iba a contestar con algo ya dicho | `atenderTanda` |
| `escalo` | la tanda escaló sin mandar nada (Sonnet, la guardia, el bot de siempre, un audio que no se entendió, un pedido del catálogo) | `atenderTanda` |
| `sin-texto` | una foto, un sticker, un video o un archivo sin texto fuera de un canje (`formato`: `foto`, `sticker`, `video`, `archivo`); o una tanda de solo fotos cuyo canje ya no está | `procesar`; `atenderTanda` |
| `corte` | llegó un mensaje nuevo en medio del envío (lo que falta va en la tanda siguiente; `sinMandar`), o un `#reset` (`detalle: '#reset'`) | `atenderTanda`; `atenderChat` |
| `fuera-de-prueba` | `esDestinoDePrueba` dio false (va de borrador al grupo) | `atenderTanda` |
| `escucha` / `borrador` | el modo no manda | `atenderTanda` |
| `sin-numero` | un chat `@lid`, por mensaje del cliente (el aviso al grupo sigue siendo uno cada 24 h) | `chatSinNumero` |
| `sin-venta` | el bot de siempre dejó de contestar por no venta (el 🤐 y los mensajes siguientes) | `atenderTanda` |
| `sonnet-no-pudo` | la tanda del barrido del silencio (o de un `#sigue`, desde el 07/10/2026) y Sonnet no pudo (el 💬 SIN CONTESTAR) | `atenderTanda` |
| `apagada` | Chiara apagada desde el panel (`src/interruptor.js`; sumado al juntarlo con el panel Chiara) | `atenderTanda` |
| `error` | la tanda tiró un error (el ⚠️ El bot falló) | `atenderTanda` |

Un pedido del catálogo o una foto con una persona atendiendo o el chat escalado llevan `formato: 'pedido'` o
`'foto'`. **No dejan `silencio`:** un contacto personal (se ignora entero, como siempre); un acuse que no se
le pregunta a Sonnet, el que el bot de siempre deja sin contestar, y unas fotos de un canje que ya las tenía
(queda su `propuesta` con `mensajes: []`: no se duplica); una reacción, un mensaje de protocolo o una
encuesta; los mensajes viejos de la sincronización del QR; los comandos `#`.

**El evento `entrega`** (`aprendizaje.entrega`): uno por cada mensaje que salió a un cliente (nunca al
grupo), después de que Evolution contestó. Se anota en `enviarAlCliente`, por donde pasan todos los envíos
a clientes. `id` (el `key.id` de Evolution, o null si no vino), `formato` (`texto`, `documento` o `imagen`;
**no `tipo`**: ese es el del evento), `origen` (`sonnet`, `bot`, `seguimiento`, `silencio` —la tanda del
barrido— o `fotos` —`#sinstock`), `texto` (en un documento, el epígrafe; en una foto, vacío) y `tanda` (la de
la propuesta, o null). Si Evolution falla, el mismo evento con `error` corto y sin rutas
(`evolution.errorCorto`: "Evolution 500", o el mensaje recortado con la causa) y sin id; si evolution.js lo
frena (fuera de la lista, un archivo fuera del catálogo), `error` con el motivo. El "🔄 Reiniciado" del
`#reset` del tester no se anota (`origen: null`): el `#reset` no deja nada en el registro
(`test/reset.test.js`). El evento `seguimiento` de siempre sigue.

**La versión de las reglas** (`cerebro.REGLAS_HASH`): los primeros 8 caracteres del sha256 de
`cerebro-reglas.md` con los finales de línea en `\n` (`hashDeReglas`), calculado al cargar las reglas. Va en
cada propuesta de Sonnet del registro como `sonnet.reglas` (en la `propuesta` con `fuente: 'sonnet'`; en las
`propuesta-sonnet` de la sombra, de la sombra con persona y del error en vivo, como `sonnet: { reglas }`), en
`/salud` (`cerebro.reglas`) y en la consola al arrancar: `CEREBRO: reglas <hash> (<N> líneas)`. `#sonnet` y
`#comparar` no anotan nada en el registro. **`CAMBIOS-CEREBRO.md`** (raíz del repo): la tabla de versiones
(fecha, hash, commit, qué cambió, hipótesis, casos de la batería) y cómo se revisa un cambio (a las 2 a 4 h,
`#comparar` en 3 a 5 chats; a las 24 a 48 h, escalados y frenos de la guardia antes y después, por
`sonnet.reglas`). La línea base del 06/10 es `8e73fe5e` (166 líneas).

**`/salud`**, sin datos de clientes, suma:
- `config`: `seguimiento: { activo, franja: "10-21", horasPrimero, segundoHasta, maxPorBarrido }`,
  `silencio: { minutosTrasPersona, maxHoras, maxPorBarrido }` y `resumen: { activo, hora }`. Hasta qué día va
  la sombra con persona ya está en `sombraPersona.hasta`.
- `cerebro.reglas` y `cerebro.gastoMes: { mes: "AAAA-MM", usd, tope, porcentaje }`. El mes es el de
  Argentina. Se lleva en `estado.json`, bajo `bot:interno` (`gastoSonnetMes: { mes, usd }`): `sumarUso` suma
  cada llamada a la API (en vivo, en sombra, la sombra con persona, `#sonnet`), en el mismo lugar que el gasto
  del día. Lo de otro mes vale 0 y la próxima suma arranca de 0. Si al arrancar no está el del mes en curso,
  se arma una vez con el registro de ese mes (`armarGastoMes`, antes de escuchar el puerto): `sonnet.usd` de
  las `propuesta` de Sonnet y `usd` de las `propuesta-sonnet` (lo de `#sonnet` no está en el registro). El
  tope sale de `CEREBRO_TOPE_MES_USD` (si no está, de `CHIARA_TOPE_MES_USD`; si no, 60); el de verdad está en la
  cuenta de Anthropic. Desde el 08/10/2026 el panel sube este mismo gasto y este tope. Pasado el 80%,
  `revisarGastoMes` (cada 5 minutos) manda al grupo `⚠️ Sonnet va US$48,10 de US$60 este mes (80,2%)` una
  sola vez por mes (`gastoSonnetAvisado` en `bot:interno`; se marca cuando salió y, con el grupo bloqueado,
  no se arma).
- `avisosGrupo: { noSalieron, ultimo: { hora, motivo } | null }`: los avisos al grupo que no salieron desde
  que arrancó (en memoria, `evolution.avisosGrupo`), bloqueados (escucha, sin destino, un destino que no es un
  grupo o que es un cliente) o con error (`fallo de envio (Evolution 500)`).

**`npm run bateria-cerebro`** termina con `process.exitCode` y no con `process.exit` (como
`probar-contexto`): en Windows cortaba con un `fetch` todavía cerrando ("Assertion failed … async.c"). Los
códigos no cambian: 0 si corre entera (aunque fallen casos: lo dice el informe), 1 si falta la clave, si un
argumento está mal o si se cae.

Lo prueban `test/silencios-y-salud.test.js` (28 checks con el de `apagada`, nuevo, por `procesar` con el `fetch` de mentira y el
Evolution de mentira; uno levanta `node src/index.js` para la línea de la consola y el gasto armado del
registro) y `test/bateria-cerebro.test.js` (un check más, la batería en un proceso aparte). Cambiaron
`aprendizaje.test.js` (los checks 1 y 11 miran los eventos del chat sin las `entrega`, y que estén) y
`cerebro.test.js` (las claves de `/salud.cerebro`).
## Cerebro Sonnet: entrega baja, paso 3, y el descuento sin repreguntar (06/10/2026)

Decisión de Tomás del 06/10 (la regla de `negocio/financiacion.md`), rama `ninjo-entrega-baja` sobre `d996fbf`,
juntada en main después del panel Chiara y del bloque Ninjo 2. Las reglas pasan a `c5c38a6b` (ver `CAMBIOS-CEREBRO.md`).
Hasta acá, cuando la entrega no llegaba al mínimo, Sonnet decía la entrega inicial dos veces y a la tercera
escalaba: `cotizar` devolvía `llega: false` también cuando el cotizador cotizaba con la excepción
(`bajoMinimo`), así que Sonnet nunca podía usarla. El bot de siempre (`responder.js`) no cambia.

- **El paso 3 lo decide el código, no Sonnet.** `pensar` copia `insistenciaEntrega` del estado al turno
  (`turno.insistencias`, antes del primer await) y `cotizar` (`cotizarEquipo`) mira cuántas veces salió la
  entrega inicial de ese modelo (`INSISTENCIAS_PARA_EL_PASO_3 = 2`):
  - con menos de 2, como siempre: `llega: false` con la entrega mínima, también si el cotizador dio
    `bajoMinimo` (la excepción todavía no). La insistencia suma cuando el mensaje sale (`noLlega`);
  - con 2 o más y le faltan hasta `TOPE_BAJO_MINIMO` ($45.000): `llega: true`, `excepcion: true`, 1 pago y
    2 cuotas con los coeficientes de la excepción (`cotizador.cotizar` con `bajoMinimo`: 67/75 en producción,
    CONFIG + 0,15 con la copia congelada) y el bloque para `[cotizacion]`; el PDF sale con ese bloque si no
    salió, como con cualquier primer bloque. Con `llega: true` la insistencia no vuelve a sumar;
  - con 2 o más y falta más (`ENTREGA_BAJA`): `llega: false`, la entrega mínima y `con_esa_entrega`: hasta 2
    equipos vendibles de **otro** modelo que se retiran con esa entrega y valen más (los más caros primero,
    cada uno con modelo, capacidad, batería, contado y entrega mínima). Es `losQueRetiraCon`, la misma
    función que `con_entrega` de `que_me_alcanza` (con `salvo`: sin las filas del modelo que no llegó, para
    no ofrecerle "el 13" al que pidió el 13). Vacío si no hay ninguno: ahí Sonnet escala, como antes.
  Los montos de la excepción y de `con_esa_entrega` valen para la guardia; el contado nunca cambia y nunca
  se devuelve una resta. La descripción de la herramienta dice las dos salidas nuevas.
- **Las reglas** (`cerebro-reglas.md`, *Cuando la entrega no llega*): la tercera vez la resuelve el sistema.
  Con `excepcion: true`: "dale, con los $X te quedas cerca para el 13, asi que te hago una excepcion y te lo
  armo con esa entrega, mira como te queda" (la frase de `estilo.frase('excepcionCerca')` del bot de
  siempre), `[cotizacion]` y "cual te cierra mas?", sin nombrar recargo ni porcentajes, sin decir cuánto le
  falta ni cuál era la entrega inicial. Con `con_esa_entrega`: "con $X para el 13 todavia no llegamos, pero
  con esa entrega te podes llevar el 11 que lo retiras con $Y" (uno o los dos) y si le interesa. Vacío:
  escala. *Descuentos*: si ya dijo con cuánto cuenta, "los precios son fijos" y sigue donde estaba (si ya
  eligió una opción o aceptó, qué día), sin volver a preguntarle la entrega (prueba en vivo del 06/10, paso
  10: ya había elegido las 2 cuotas y Sonnet le repreguntó con cuánto contaba).
- **La batería**: casos 105 (300 mil tres veces → la excepción, el bloque con sus montos y el PDF), 106 (220
  mil tres veces → "con esa entrega te podes llevar …", con la entrega mínima del primero) y 107 (el
  descuento con la entrega ya dicha y las 2 cuotas elegidas → "los precios son fijos" y el turno). Dos
  pedidos de monto nuevos: `{ cotiza, entrega, excepcion: true }` (1 pago y 2 cuotas de la excepción) y
  `{ retiraCon: 220000, salvo: '13' }` (la entrega mínima del primero de `con_esa_entrega`). Y una regla
  global más: ningún mensaje dice "recargo", "67%" ni "75%". Los casos 105 y 106 dependen de que el 13 pida
  cerca de $320.000 (con la copia congelada, $320.000): con la planilla de hoy, mirar eso antes de leer un ✗.
  El caso 10 ("dale hacemelo con 150 igual" → escala) sigue valiendo: con $150.000 no se retira nada.

Lo prueban `test/cerebro.test.js` (122 checks: 11 nuevos, sección 4g; ahora fija `DOCS_DIR` a un PDF de mentira,
como los otros tests del cerebro) y `test/bateria-cerebro.test.js` (21; 13 casos de punta a punta, 3 nuevos; 22 con el check del
bloque Ninjo 2, después del merge).

## Cerebro Sonnet: ve las fotos del cliente (06/10/2026)

Decisión de Tomás del 06/10, rama `fotos-sonnet` sobre `9ca7485` (main con el paso 3 de contado). El caso fue
…7442, canje del 16: la clienta mandó "16 común" y la captura de la batería al 90%; Sonnet no veía la foto y le
repreguntó la capacidad (que faltaba de verdad) y la batería (que estaba en la captura). Desde acá Sonnet ve la
imagen (unos US$0,005 por foto) y lo que se ve en ella cuenta como dato dado. Las reglas pasan a `bb2ae7ba` (ver
`CAMBIOS-CEREBRO.md`). El bot de siempre no cambia.

- **Solo en una tanda que contesta Sonnet en vivo** (`quien === 'sonnet'` en `atenderTanda`). La sombra
  (`pensarEnSombra`), la sombra con persona y `#sonnet` no mandan imágenes; el barrido del silencio y `#sigue`
  tampoco (sus líneas salen del historial). La batería sí (`fotos` en un turno, ver abajo).
- **Qué fotos:** las de esa tanda, con o sin epígrafe. La línea de cada una guarda en `datosDeLinea` (en memoria,
  nunca en el historial ni en el estado) `imagen: { key, mimetype }` de `imageMessage`
  (`fotosDelCliente.deMensaje`): la foto sin epígrafe es la línea `{ foto: true }` de la tanda; la con epígrafe,
  la línea de texto (el epígrafe va como siempre). Un `albumMessage` no es una foto: cada foto del álbum llega
  aparte, como su `imageMessage`, y cuenta una por una. Las de tandas anteriores no se vuelven a mandar.
- **Cómo:** `contestarConSonnet` las baja con `src/fotos-del-cliente.js` (`bajar`) a la vez que completa el
  historial con Evolution: las últimas 3 de la tanda (`TOPE`), con `evolution.base64DeMedia` y 10 s por foto
  (`ESPERA_MS`). Solo `image/jpeg`, `png`, `gif` y `webp`, y hasta 5 MB del base64 (la API mide su tope sobre el
  base64; en la API directa es 10 MB). Una que no se baja, que tarda, de otro tipo o más pesada, no va y cuenta en
  `sinVer`. `cerebro.contestar` y `pensar` reciben `imagenes: [{ media_type, data }]` y `fotos: { mandadas,
  sinVer }`; las imágenes van como bloques `image` (base64) en el primer mensaje, **después** del texto del
  contexto, que conserva su `cache_control`, y la última imagen lleva otro: tres marcas (reglas, contexto, última
  imagen; la API acepta 4), así las vueltas de herramientas no vuelven a pagar las imágenes.
- **El texto del pedido** dice cuántas mandó y cuántas ve (`cerebro.textoDeFotos`): "Con esto, el cliente mandó 5
  fotos, ves las últimas 3 (van después de este texto).", "…mandó una foto que no se pudo ver: de esa foto no das
  nada por hecho.". Una tanda de solo fotos va en "Lo que escribió ahora el cliente" como `(mandó 2 fotos, sin
  texto)`.
- **La tanda de solo fotos:** en un chat que atiende Sonnet (`quienAtiende === 'sonnet'`) y con al menos una foto
  que se pueda bajar, la contesta Sonnet con las imágenes, no `soloFotos`. En los chats del bot de siempre (y
  `sombra`), como siempre: `soloFotos`, sin bajar nada. Una tanda con fotos nunca es "solo acuses" para Sonnet: un
  "ok" con la captura se le pregunta (`contestar`). Si la API falla, contesta el bot de siempre como siempre (con
  solo fotos, `soloFotos`).
- **Qué fotos sin texto entran a la tanda: la marca de canje (07/10/2026, decisión de Tomás).** El filtro de
  "Foto sin epígrafe" (`index.js`) y el chequeo de "Solo fotos" de la tanda miran `s.permuta.ofrece` (lo llena
  solo el bot de siempre) **o** la marca de canje de Sonnet: cuando `contestar` recibe una `ficha` con `canje`,
  guarda `canjeSonnet` (la hora) en el estado; `cerebro.canjeVigente(s)` dice si tiene menos de
  `CANJE_MARCA_HORAS` (72 h) y el chat no está escalado. Con la marca, y si el chat lo atiende Sonnet
  (`quienAtiende === 'sonnet'`), una foto sola entra y la contesta Sonnet viéndola: es la captura que manda sola
  después de que Chiara pidió los datos. Sin marca (o vencida, escalado, o el chat pasó al bot de siempre), como
  antes: una foto suelta sin tanda abierta va a `silencio` `sin-texto` y no se baja nada. `#reset` borra la marca
  (borra el chat). Tests 14 a 14e de `test/fotos-sonnet.test.js`.
- **El registro:** la `propuesta` de Sonnet lleva `sonnet.imagenes: { vistas, sin_ver }` cuando la tanda trajo
  fotos (sin la imagen); la `propuesta-sonnet` de un error en vivo, también. El costo de las imágenes viene en el
  `usage` de la API: entra en `sumarUso` como el resto (gasto del día, del mes y el aviso del 80% del tope de
  US$60).
- **`evolution.base64DeMedia`:** si la respuesta no trae `mimetype`, toma el de `audioMessage` y, si no hay, el de
  `imageMessage` (antes caía en `'audio/ogg'`); los audios no cambian.
- **Las reglas** (*Canje*, "Las fotos que te manda"): lo que se ve en una foto suya (la captura de la batería, la
  capacidad en Ajustes, el modelo, una pantalla o una tapa rota) cuenta como dato dado: no se repregunta y se pide
  solo lo que falta, de a una cosa; si no se entiende o no es del equipo, como si no estuviera, sin describirla;
  nunca cuánto vale el equipo por lo que ve ni comentarios de más (a lo sumo "dale, ahi vi la bateria"); si el
  pedido dice que una foto no se pudo ver, no da nada por hecho de esa foto. Y en *Quién sos*, que el pedido trae
  las fotos de ahora. Desde el 07/10/2026 (hash `62e29962` con los turnos), que las fotos de antes no las vuelve a ver: quedan como
  "Cliente: [foto]" en el historial y lo que anotó del equipo viene en lo que el sistema ya sabe ("canje que
  anotaste antes"); también es un dato dado y no se repregunta.
- **La batería:** un turno puede llevar `fotos: ['captura-bateria-90.png']` (archivos de `test/fixtures`): el
  corredor las pasa a `cerebro.contestar` en base64 y el informe lo dice. Caso 108 (…7442): "16 comun" con la
  captura armada de la batería al 90% (`test/fixtures/captura-bateria-90.png`, sin datos de nadie) → pide la
  capacidad y no la batería. Caso 111 (07/10): la tanda siguiente, sin la imagen ("Cliente: [foto]", "dale, ahi vi
  la bateria" y el canje anotado en el estado del caso) → "es de 128" no repregunta la batería ni la capacidad.
- **La foto en el historial (07/10/2026, decisión de Tomás; hasta ahí la foto sin epígrafe no entraba al historial
  y en la tanda siguiente Sonnet no sabía que la había habido).** En un chat que atiende Sonnet (`quienAtiende ===
  'sonnet'`) y que ya existe, cada foto sin epígrafe del cliente deja una línea `cliente` con el texto `[foto]`
  (`LINEA_FOTO`, de `src/texto-del-mensaje.js`) y el id del mensaje, **entre o no a la tanda** (también la que va a
  `silencio` `sin-texto`). Una por imagen: el `albumMessage` no deja línea, cada foto del álbum la suya. Con
  epígrafe, como siempre (el texto). En el pedido va como `Cliente: [foto]`; la imagen no se vuelve a mandar. **No
  cambia qué se contesta:** la foto suelta sigue sin contestarse ni bajarse, la tanda sigue con su línea `{ foto:
  true }`, y la línea `[foto]` (`esFotoDelCliente`) no la cuentan como algo escrito el barrido del silencio ni
  `#sigue` (`conTextoDeVerdad`), ni el seguimiento (no es "el cliente contestó") ni los datos viejos
  (`control.ultimaActividad`). Al completar con Evolution es la misma línea (por el id; sin id, por el lado, el
  texto y la hora): queda la del estado. Un chat que no existía no se crea por una foto suelta, como antes; en los
  del bot de siempre (y `sombra`), nada. Sí la ven, como una línea del cliente: el panel ("espera desde"), el
  resumen de la mañana (`colgados`) y el recordatorio de un escalado sin tomar.
- **El canje que anotó Sonnet (07/10/2026, decisión de Tomás).** Cuando `contestar` recibe una `ficha` con `canje`,
  además de `canjeSonnet` guarda el texto en `canjeFicha: { texto, ts }`; otra ficha con otro canje lo reemplaza y
  una sin canje no lo borra. `loQueSabe` lo suma a lo que el sistema ya sabe como `canje que anotaste antes:
  "iPhone 16 128GB 90%"` mientras tenga menos de `CANJE_MARCA_HORAS` (72 h; `cerebro.canjeAnotado`), pasado por
  `notaSegura` como las notas. `#reset` lo borra (borra el chat). El panel sigue leyendo su propia copia de la
  ficha (`data/chiara.json`).

Lo prueban `test/fotos-sonnet.test.js` (16 checks, nuevo, en `npm test`) y `test/bateria-cerebro.test.js` (23; 14
casos de punta a punta, 1 nuevo). La foto en el historial, el canje de la ficha y `#sigue` que contesta:
`test/foto-historial-sigue.test.js` (25 checks, nuevo, en `npm test`) y el chequeo del caso 111 en
`test/bateria-cerebro.test.js`.

## Sonnet en sombra donde atiende una persona (03/10/2026)

Decisión de Tomás del 03/10/2026, **por 7 días** (después se compara y se decide si sigue): en los chats
que atiende una persona, Sonnet también piensa qué contestaría, para compararlo con lo que contestaron
Tomi o Fran. Hasta acá, en vivo, una línea del cliente con una persona atendiendo o con el chat escalado
no entraba a ninguna tanda y nadie pensaba nada (en escucha sí: ahí ya se compara).

- **Se prende** con `CEREBRO_SOMBRA_PERSONA_HASTA=AAAA-MM-DD` en el `.env` (hasta ese día de Argentina
  inclusive) y reiniciando. Vacía, con otro formato o vencida, nada. Con `CEREBRO_MODO=apagado` o en
  `MODO_ESCUCHA`, tampoco. Se apaga sola al pasar la fecha, sin reiniciar.
- **Cuándo piensa** (`src/sombra-persona.js`, enganchado en `procesar` y `atenderTanda` de `index.js`):
  - una línea del cliente con **una persona atendiendo** (`state.humanoActivo`: los
    `SILENCIO_TRAS_HUMANO_MIN` después de que escribió alguien de la cuenta, o `#pausa`):
    `conPersona: 'persona'`;
  - una línea con el chat **escalado y callado** sin vencer: `conPersona: 'escalado'`;
  - las líneas de una **tanda que se canceló** porque una persona contestó (o el chat escaló) mientras
    esperaba: sin otra espera.
  Las líneas seguidas se juntan con la misma espera que una tanda normal (20 a 45 s). Solo las que tienen
  texto: un audio cuenta si ya se transcribió y se entendió.
- **Qué ve Sonnet:** lo de siempre (`cerebro.pensar`), pero el historial y las líneas de persona **solo
  hasta la última línea del cliente de esa tanda** (`hasta`): lo que contestó la persona después no entra,
  porque es justo lo que se quiere comparar. La fecha y hora del pedido es la de esa línea.
- **Qué hace con lo que piensa: nada.** No le manda nada al cliente ni al grupo y no toca el estado del
  chat. Queda en `data/aprendizaje-v2.jsonl` como `propuesta-sonnet` con `conPersona`, `tanda` (propia),
  `lineas` (los ids de WhatsApp), `mensajes`, `escalar`, `motivo`, `guardia`, `montos`, `uso`, `usd`, `ms`
  y `leidos`. Las respuestas de la persona quedan como siempre (`humano`): se emparejan por chat y hora.
- **Tope:** `CEREBRO_SOMBRA_PERSONA_TOPE_USD` (1,5) por día de Argentina. Pasado, no piensa más hasta el
  otro día (una línea en el log). En memoria: un reinicio lo pone en 0. Es para no comerse el saldo del
  bot en vivo (el tope de USD 60 por mes de la cuenta es uno solo). Lo que gasta suma también al
  `usdHoy` del cerebro.
- **Un `#reset` antes de pensar:** no piensa (la generación del chat cambió).
- **`/salud`** muestra `sombraPersona: { activa, hasta, pensadasHoy, usdHoy, topeUsd }`.
- El log dice `[sombra-persona] <chat> (persona|escalado): Sonnet contestaría N mensaje(s) · US$…`.
- `test/cerebro.test.js` y `test/cerebro-vivo.test.js` la dejan apagada (`CEREBRO_SOMBRA_PERSONA_HASTA=''`):
  si no, la del `.env` real cambiaría lo que comparan.

Lo prueba `test/sombra-persona.test.js` (10 checks, por `procesar`, con el `fetch` de mentira): persona
atendiendo (nada sale, el estado no cambia), el corte del historial y las líneas juntas, el escalado, la
tanda cancelada, vencida / mal escrita / apagado / escucha, el tope, el `#reset` y `/salud`.

## Panel Chiara (06/10/2026)

Diseño cerrado por Tomás el 05/10 (Cortex: `areas/ventas-mensajes/panel-chiara.md`). Decisiones del 06/10: la
ficha la dice Sonnet, `anuncio_id` va en la 0013, los días arrancan de cero y el gasto del mes incluye la sombra.
El contrato es la migración `0013_panel_chiara.sql` de la app de ventas (rama `panel-chiara`).

**Qué hace `src/panel-chiara.js` cada 1 minuto** (la primera vuelta, a los 15 s de arrancar):
1. Lee `bot_ordenes` pendientes, las aplica y las marca `hecha` o `error` (el motivo en una línea).
   `pausar` / `devolver` / `vendido` / `perdido` son `#pausa` / `#sigue` / `#vendido` / `#perdido` desde el grupo
   (`control.desdeGrupo`; `ventas.desdeGrupo` con origen `panel:<id>`), y al grupo le llega el mismo aviso con
   "📱 Desde el panel" (sin esperarlo: un envío colgado no frena la vuelta). `apagar` / `prender`: el
   interruptor. Cada orden se aplica una sola vez: queda en `datos.ordenes` hasta que su PATCH entra (un PATCH que
   falla se reintenta solo, sin volver a aplicarla). Desde el 08/10/2026 (decisión de Tomás) `devolver` también
   contesta como `#sigue`: `control.desdeGrupo(…, { alSeguir })` con `alSeguir` y `atenderChat` de `index.js` (los
   pasa `arrancarPanel` en los deps de `panel.arrancar`; el panel no carga `index.js`). Si toca
   (`sinContestarAlSeguir`), las líneas van a la cola y la tanda arranca en el acto, sin otro `await` en el medio, y
   sin esperarla (la vuelta sigue). El aviso es el de `#sigue`: "▶️ Reactivado · … (saqué la pausa) y le contesto lo
   que dejó escrito" o "…; le contesto cuando vuelva a escribir (motivo)", con "📱 Desde el panel ·" adelante. Sin
   `atenderChat` en los deps, solo reactiva (como antes).
2. Compara cada chat con la vuelta anterior (`visto`) y anota las noticias: escalado, resuelto, pausado,
   devuelto, vendido, perdido; WhatsApp caído (dos vueltas seguidas sin `open`) y de vuelta. Además: reinicio (al
   arrancar), apagada / prendida, lead nuevo y error de Sonnet en vivo (uno por racha). Las del stock de la app
   (`empezo_a_ofrecer` / `dejo_de_ofrecer`, 08/10/2026) llegan de `stock-app.js` por `stockApp.alCambiarLaOferta`
   (`delStock`, que escucha desde `arrancar` hasta `_detener`): sin teléfono, el equipo en el detalle y el código
   en la `clave` (`evento(..., { id })`), así dos de la misma vuelta no se pisan.
3. Sube `bot_estado` (con todo `/salud` en `salud`), los leads que cambiaron (upsert por teléfono, de a 200),
   los días con cambios y las noticias (`on conflict (clave) do nothing`). Un 57014, un 504 o el tope de 15 s se
   reintentan una vez a los 5 s (*Los timeouts de Supabase*). Si Supabase falla, lo dice en consola, con la hora
   (una vez cada 10 min) y en `/salud` (`panel.ultimoError`, solo el código y el mensaje de PostgREST: nunca
   `details`, que trae la fila), sigue contando en disco y sube en la vuelta siguiente. Un 400 en `bot_leads` se
   prueba de a una fila: la mala queda afuera (hasta que cambie) y las demás entran. Un 400 en `bot_eventos`
   (08/10/2026; p. ej. un tipo que la app todavía no tiene en el CHECK) también se prueba de a una: la que no
   entra se descarta (no se reintenta) y queda en `/salud` ("la noticia … no entró"). `/salud` tiene un tope de
   20 s dentro de la vuelta. Un valor fuera de rango va `null`.

**Lo que cuenta** (ganchos que nunca tiran):
- `panel.delCliente` (index.js, antes de que el mensaje entre al estado): los mensajes del cliente (no una
  reacción, un borrado o una edición), el lead nuevo (sin estado, sin lead de antes y fuera de la lista de chats
  viejos: un cliente de antes que vuelve no es nuevo), el nombre de WhatsApp y el anuncio de origen.
- `panel.deChiara` (en `enviarAlCliente`, solo si Evolution confirmó con id): lo que Chiara mandó **de verdad**.
  Borradores, sombra y bloqueados (escucha, lista de prueba, apagada) no cuentan. Una respuesta de Sonnet con la
  cotización (`conCotizacion`) cuenta como cotizado recién cuando sale un mensaje (dentro de 10 min).
- `panel.delHumano` (antes de mover `ultimoHumano`): los mensajes de Tomás o Fran.
- La demora de respuesta: desde el primer mensaje del cliente que pide respuesta hasta lo primero que le llega
  (de Chiara o de una persona). `esperaDesde`: un "gracias", un "dale" (`esCierre`, que pasó tal cual a
  `src/cierre.js`) o un sticker no esperan; un audio sí; un borrador (`sinConfirmar`) no es una respuesta.
- `cerebro.alPensar`: cada `pensar`, de verdad (si vino de `contestar`) o en sombra: gasto, llamadas (una por
  tanda pensada), demora, errores y la ficha.

**La ficha** (decisión de Tomás del 06/10: que la diga Sonnet). `responder` y `escalar` llevan `ficha`, requerida
(strict): `quiere_avanzar`, `cuando`, `cuando_es` (hoy, esta_semana, mas_adelante, no_dijo), `forma_pago`,
`zona`, `canje`, con lo que sabe de toda la charla. La regla en `cerebro-reglas.md` dice que no cambia lo que
contesta ni cuándo escala. Suma unos 40 tokens de salida por tanda. La de la sombra también vale (los chats que
atiende una persona). Lo que la ficha no trae sale del estado (`forma_pago`, `zona`, `timing`, `permuta`, de la
lectura de Gemini). Toca el cerebro: la batería del 06/10 dio 110 de 112 casos; el 36 ("ya lo compré en otro
lado" escaló) pasó 3 de 3 al repetirlo, y el 88 ("dale" después del bloque → "¿1 cuota o 2?" en vez del día)
falla 2 de 3 igual en main y en la rama (`C:\bot-whatsapp\claude-ficha-ab.ps1`). La ficha suma unos 85 tokens de
salida por turno (un 16% más por respuesta, unos US$2 por mes con el volumen del 06/10).

**Etapa y "para cerrar hoy"** (`filaDeLead`). Manda la más avanzada: vendido / perdido > escalado (abierto) >
quiere_avanzar (alguna vez) > cotizado (alguna vez) > consultando (alguien le contestó o hay modelo) > nuevo.
Para cerrar hoy, si no está vendido ni perdido: `quiere_avanzar` (la ficha lo dijo en las últimas 72 h),
`dijo_cuando` (`cuando_es` hoy y es el mismo día, o esta_semana y es la misma semana, de lunes a domingo),
`cotizado_completo` (cotización con entrega y forma de pago, y el cliente escribió en las últimas 72 h) y
`escalado` (abierto y sin tomar).

**El escalado como lo ve el panel** (`escaladoDe`): abierto mientras `escalado`. Si lo toma una persona
(`escaladoResuelto.porque`, "escribió alguien de la cuenta"), sigue abierto con `escalado_tomado_en` mientras
dura su silencio (`SILENCIO_TRAS_HUMANO_MIN`) o el chat está pausado, y Chiara no le volvió a escribir. Al
cerrarse queda anotado en el lead (`escaladoCerrado`, el ts de ese `escaladoResuelto`, que el estado no borra):
si la persona escribe de nuevo días después, no se reabre. La noticia "escalado" y `bot_dias.escalados` salen de
cada `escaladoEn` nuevo, aunque se haya tomado dentro del mismo minuto. Un `#reset` deja la fila neutra (sin
escalado, pausa ni espera) con lo que ya se contó.

**El interruptor general** (`src/interruptor.js`, `data/interruptor.json`). Apagada, `atenderTanda` no
interpreta nada (ni Sonnet ni Gemini), no hay seguimiento, barrido del silencio ni sombra, y `evolution.js` no
manda nada a un cliente (texto, foto, PDF, "escribiendo…"), como segunda traba. Al grupo sí. Igual lee, guarda,
cuenta y reporta. Lo que escribieron mientras estaba apagada no se contesta solo al prenderla (salvo el barrido
del silencio de siempre: lo que quedó esperando a una persona se contesta cuando vence su silencio). Un reinicio
no la prende; sin archivo, prendida. Si el archivo existe y no se puede leer (bloqueado o dañado), queda
**apagada** por las dudas, se reintenta en cada consulta y el panel lo avisa una vez al grupo; prenderla desde el
panel escribe el archivo de nuevo. Sin el panel (`CHIARA_PANEL_ACTIVO=false` o Supabase caído) se prende
borrando `data/interruptor.json` y reiniciando el bot.

**En disco: `data/chiara.json`** (atómico; se guarda en cada vuelta y al salir): los días (40), los leads
(contadores, marcas, ficha, cotizado, anuncio, `visto`), las noticias sin subir (500 como mucho) y WhatsApp. La
primera vez, sin archivo, se siembra el primer contacto de cada chat (el primer `cliente` del registro por
`clave`, o la línea más vieja del historial). Los días arrancan de cero. Hasta el 08/10/2026 también llevaba su
cuenta del mes (`mes: { mes, vivo, sombra }`, sembrada del registro): ya no; un archivo viejo se lee igual y la
pierde la próxima vez que se guarda. Si está ilegible se aparta como `chiara.json.corrupto-<fecha>` y arranca de cero; si no se
puede leer (EBUSY), el panel no arranca (el bot sí).

**No se suben** el tester, los contactos personales ni los chats sin número (@lid). Del cliente, el último
mensaje recortado a 80; los motivos (escalado, resuelto) van sin lo que esté entre comillas (Sonnet suele citar al
cliente).

**`bot_estado`**: `gasto_hoy_usd` es solo lo de verdad; `gasto_mes_usd`, lo de verdad más la sombra (el tope es
de la cuenta de Anthropic; decisión del 06/10); `contesta` es `gemini` con el cerebro apagado o en sombra, o en una
racha de errores. Desde el 08/10/2026 (decisión de Tomás: una sola cuenta) `gasto_mes_usd` y `tope_mes_usd` son los
de `cerebro.gastoDelMes()`, lo mismo que `/salud` (`cerebro.gastoMes`): cada llamada a la API, en vivo, en sombra, la
sombra con persona y `#sonnet`; el tope, `CEREBRO_TOPE_MES_USD` (o `CHIARA_TOPE_MES_USD` si no está; 60). Lo del día
(`gasto_hoy_usd`, `sombra_hoy_usd`) sigue siendo la cuenta del panel. La batería gasta de la misma cuenta y no se
cuenta: el 08/10 al mediodía la consola de Anthropic decía US$20,01 y `/salud` US$10,14.

**El anuncio de origen** (`src/anuncio.js`): `externalAdReply.sourceId` del contextInfo (en `data.contextInfo` o
en el del tipo de mensaje), solo con `sourceType` `ad` o sin tipo. Se guarda el primero que trae uno.
`npm run anuncios [-- días]`: solo lectura contra Evolution, qué anuncios trajeron chats (sin teléfonos ni
textos). **Falta confirmarlo** con chats reales de un anuncio: que Evolution 2.3.7 guarde el `sourceId`.

**Pruebas:** `test/panel-chiara.test.js` (28 chequeos, con un Supabase de mentira que revisa los CHECK de la
0013; los del 08/10/2026: el gasto del mes y el tope de cerebro, el `chiara.json` viejo y los 4 de `devolver`, uno de
punta a punta por `index.js` y tres con un `atenderChat` de mentira). El tope único, en `test/silencios-y-salud.test.js`. Con `PANEL_VOLCAR=archivo.json` vuelca las filas para probarlas contra un Postgres con la 0013 de verdad.
**Pruebas:** `test/panel-chiara.test.js` (26 chequeos, con un Supabase de mentira que revisa los CHECK de la
0013, más los dos tipos del stock; `sinMigracionDelStock` hace de la base de hoy, que los rechaza). Con `PANEL_VOLCAR=archivo.json` vuelca las filas para probarlas contra un Postgres con la 0013 de verdad.
El 06/10: las filas de la prueba entraron todas en un Postgres 16 con la 0013, y un ensayo con una copia del
estado y del registro reales armó 208 leads válidos (29 escalados abiertos, 22 clientes esperando, US$4,48 del mes).

## El stock de la app en la planilla (08/10/2026)

Decisiones de Tomás del 08/10/2026 (parte 2 del diseño de escritorio, Cortex
`areas/contabilidad/diseno-escritorio/README.md`); el contrato es la migración `0018_precio_de_venta_y_chiara.sql`
de la app de ventas (`v_stock_chiara`, `planilla_ordenes`, `precios_cotizador.stock`). Rama `stock-planilla`.

1. **La planilla del Cotizador en el Drive es donde vive todo** (precios, entrega mínima, stock). Tomás la mira y
   la toca ahí; la app la cambia por medio del bot; Chiara sigue leyendo la planilla como hoy.
2. **USADOS la escribe el bot desde la app** (`v_stock_chiara`), cada 1 minuto (`src/stock-app.js`): una unidad por
   fila, el código de la app como `ID` (`15P-128-001`), `Bateria_pct` (o "SELLADO": sheets.js lo lee como
   `condicion: 'Sellado'`), `Detalles` (lo que puede decir Chiara), `Precio_contado` (el de la vista: a mano o de la
   lista), `Foto_lista` y `Disponible` en SI, y `Anticipo_min` con **la entrega mínima de LISTA o LISTA 85-93 para
   ese modelo, capacidad y condición**: la pestaña es la del precio si salió de una lista, y si el precio es a mano
   la que le toca por la batería (sellado o 100 % → LISTA; 80 a 95 % → LISTA 85-93, como `pestana_de_precio` de la
   0018); con una batería que no entra en ninguna (menos de 80 %, 96 a 99 %) no se busca en otra. Si hay más de una
   fila, la más alta; un mínimo que no es menor que el precio no vale. Sin mínimo, la unidad **se vende solo de
   contado**: sheets.js la marca `solo_contado` (solo en vivo),
   `cotizador.cotizar` devuelve `SOLO_CONTADO` con menos de la plata entera (el bot de siempre escala callado;
   Sonnet recibe `solo_contado: true` y las reglas dicen que escale si piden cuotas). **Con una entrega, `cotizar`
   se saltea las solo de contado si otra fila del mismo modelo se financia** (decisión de Tomás del 08/10/2026,
   prueba en vivo: "el 13 con 450 mil?" agarraba el 13 al 77 % a $480.000 y escalaba): la más barata que se
   financia, del local primero, y si no, la del depósito; si todas son solo de contado, como antes (test en
   `stock-app.test.js`). `buscar_equipos` las sigue mostrando todas. Lo que se cargue a mano en
   USADOS se pisa. **Escribe solo las columnas de datos y conserva las fórmulas** (`Pago_unico`, `Cuota_de_2`…
   y cualquier columna que en USADOS tenga una fórmula): las vuelve a escribir tal cual, corridas a cada fila
   (`formulaEnOtraFila`); las columnas que no conoce se vacían (decisión de Tomás) y se avisan una vez al
   arrancar en el log, para verlas en sombra. Lee USADOS con las fórmulas como texto, compara, y escribe solo si
   algo cambió (datos con RAW, fórmulas con USER_ENTERED; cada llamada a Google con 30 s de tope). Si Supabase no
   contesta, la vista no viene como una lista o LISTA/USADOS no se pueden leer, **no pisa nada**: queda lo último,
   y se ve en el log (`[stock-app]`, con la hora) y en `/salud` (`stockApp.ultimoError`). Un 57014, un 504 o el tope
   de 15 s de Supabase se reintentan una vez a los 5 s, y la primera vuelta sale a los 30 s de arrancar (*Los
   timeouts de Supabase*). Una vista vacía (HTTP 200, lista
   vacía) con filas en la pestaña recién la vacía a la **tercera vuelta seguida** vacía (`vistaVaciaHace` en
   `/salud`); una vuelta con algo vuelve la cuenta a cero.
3. **Lo del depósito = las filas de LISTA y LISTA 85-93 con STOCK distinto de NO** (vacía = se ofrece, como hoy).
   Los botones de la app ("hay" / "no hay más") llegan como `planilla_ordenes` (tipo `stock`): el bot escribe SI o
   NO en la columna STOCK de esa fila, por `fila_id` si viene y si no por modelo + capacidad + condición, y marca la
   orden `hecha` o `error` con el motivo ("No encontré …", "Hay 2 filas de …", "Falta la columna STOCK en LISTA
   85-93": **no crea columnas**). `error` de una, solo por esos motivos del negocio: si Google falla (503,
   timeout), la orden queda pendiente y se reintenta en la vuelta siguiente, hasta 30 vueltas o 1 hora, y recién
   ahí `error` "la planilla no contesta". Después de una orden hecha invalida la caché de la planilla y el espejo
   copia STOCK a `precios_cotizador.stock` (solo con el stock de la app prendido: con apagado la copia va sin esa
   columna, por si la base no tiene la 0018). El espejo tampoco guarda una copia si una de las dos pestañas viene
   sin filas (la app toma la copia más nueva entera). sheets.js lee la columna (`stock`: 'SI', 'NO' o null) y
   **solo en vivo** saca de `lista` (y de `listaAl100`) las filas con NO. Los rangos de lectura (sheets.js y el
   espejo) son `A1:Z200` en sombra y vivo; **en apagado siguen los de siempre** (`A1:U200`, `A1:O200`): la lectura
   es idéntica a la de antes.
4. **Local primero** (solo en vivo, `cerebro.js`): `buscar_equipos` dice de cada equipo `donde` (`local` = una fila
   de USADOS, `deposito` = una de LISTA), los del local primero, y si hay alguno del depósito devuelve
   `frase_deposito` y una nota. Sonnet lo ofrece como del depósito con `[deposito]` (como mensaje solo o adentro
   de uno): el código lo cambia por "ese modelo justo lo tengo en el depósito, lo voy a buscar y te lo tengo
   mañana" (**de lunes a jueves "mañana"; viernes, sábado y domingo "el lunes"**, hora de Argentina,
   `stockApp.diaDelDeposito`). Con `#bateria`, los de `al_100` también son del depósito. La guardia (solo en vivo)
   frena lo que ofrece del depósito escrito por su cuenta ("en el depósito", "del depósito", "al depósito"; "haceme
   el depósito" de una transferencia no), `[deposito]` sin un equipo del depósito en esa respuesta, y TechSur, el
   proveedor, "por encargo" y "a pedido" (`nombraAlgoInterno` con `stockVivo`); los 300 caracteres se miden con la
   frase ya puesta. **Con apagado o sombra la guardia es exactamente la de siempre.** Las reglas del depósito están
   en `src/cerebro-reglas-deposito.md` y se
   suman a las instrucciones **solo en vivo** (hash `e742bb83`; con apagado o sombra el pedido es el de siempre,
   `62e29962`): la prohibición de inventar plazos de llegada sigue, y `[deposito]` es la única excepción. El bot
   de siempre (`responder.js`) no cambia: ve las unidades de USADOS como siempre.
5. **Al escalar** (solo en vivo), el 🔕 del grupo lleva una línea más (`paraElGrupo`): `Equipo: 15P-128-001` (el ID
   de USADOS del modelo y capacidad del último `cotizar` o del estado; con varias unidades, hasta 3 con " / ") o
   `Equipo: DEPÓSITO iPhone 15 Pro 128GB` (`cerebro.equipoParaElGrupo`). Sin modelo, nada.
6. **El precio público** es el de contado de la lista (o el de `v_stock_chiara` para el local) con las cuotas y el
   interés de siempre (CONFIG, 54/70): los precios de TechSur en USD no cambian nada.
7. **"Lo que pasó hoy" del panel** (08/10/2026, rama `lo-que-paso-hoy`; solo en vivo; `anotarOferta`): cada vuelta
   que deja USADOS al día compara los códigos que Chiara ofrece del local (las filas escritas) con los de la vuelta
   anterior. Código nuevo → `empezo_a_ofrecer`; código que ya no está → `dejo_de_ofrecer`, **sin el porqué**
   (vendido, en reparación, sin precio, "Chiara lo ofrece" apagado: la vista no lo dice y no se adivina). Un cambio
   de precio no es noticia. El detalle es el equipo: "iPhone 15 Pro 256GB 92% · $870.000 · 15P-256-001" (un
   sellado dice "sellado"; el que sale, con el último precio con que se ofrecía). Lo reciben los oyentes de
   `alCambiarLaOferta` (el panel, que lo sube a `bot_eventos`; stock-app no carga ni el panel ni index.js, y un
   oyente que tira no cambia la vuelta). **Sin avalancha:** la lista anterior (código → cómo se dice) queda en
   `data/stock-ofrece.json`, al lado del estado, y se reescribe solo si cambió (si no se pudo guardar, se reintenta
   en la vuelta siguiente sin repetir la noticia, y el error queda en `stockApp.ultimoError`); sin ella (la primera vez) o
   ilegible, esa vuelta es la base y no anota nada; un reinicio compara contra lo de disco (lo que cambió
   mientras reiniciaba, sí es noticia). Si Supabase o la vista fallan, o USADOS no se pudo escribir, no compara;
   una vista vacía cuenta recién a la **tercera vuelta seguida**, cuando vacía USADOS (la misma regla de arriba,
   aunque USADOS ya esté vacío). Más de 15 cambios en una vuelta: un solo evento por tipo con "18 equipos". En
   sombra y apagado no compara ni guarda nada. El depósito (LISTA con STOCK) no entra. **La app tiene que sumar
   `empezo_a_ofrecer` y `dejo_de_ofrecer` al CHECK de `bot_eventos.tipo` (0019) y a `EVENTO_LABEL`**
   (`C:\bot-whatsapp\Claude outputs\cerebro\lo-que-paso-hoy-para-la-app.md`); hasta entonces la base los rechaza
   y el panel los descarta de a uno (ver *Panel Chiara*).
8. **La lista de precios es la del local** (decisiones de Tomás del 08/10/2026, 20:30, chat …3557; rama
   `lista-stock-local`; solo en vivo): primero se liquida nuestro stock. `lista_de_precios` (y `[lista]`) trae solo
   los equipos del local (`cerebro.listaDelLocal`: las filas vendibles de USADOS), **sin repetir**: una línea por
   modelo + capacidad + batería + precio, con el formato de la lista de siempre sin el color ni el detalle
   (`responder.lineaDePrecio`: "Ip 13 128gb 77% 480.000"; los tres 13 al 77 % a $480.000 son una línea). Orden: del
   11 al 18 y en cada número común, Plus, Pro y Pro Max (`partesDelModelo`; el "e" y el mini, antes del común),
   después la capacidad, el precio y, a igual precio, la batería (dos 16 a $1.000.000, el 89 % antes del 92 %). Los
   usados en un mensaje y los sellados del local en otro ("Ip 16 128gb sellado 1.450.000"); sin sellados, uno solo.
   Nada de LISTA: lo del depósito sigue entrando solo por `buscar_equipos` cuando pide un modelo que no está en el
   local (con `[deposito]`). La guardia anota los precios de esa lista (no los de LISTA), y el resultado lleva una
   `nota` ("Es la lista del local…"). **Sin nada en el local** (USADOS vacía o sin filas vendibles: la vista de la
   app vacía, que vacía USADOS a la tercera vuelta), va la lista de siempre (LISTA, con el filtro de STOCK de
   vivo). Si la vista no se puede leer, stock-app no pisa USADOS y la lista es la del local que quedó: el bot no
   tiene cómo distinguirlo. **Con apagado o sombra, la lista es la de siempre** (en sombra, el pedido es byte a
   byte el de apagado). Las reglas (*El local y el depósito*, solo en vivo): la lista es lo del local y lo demás se
   ofrece solo si pide un modelo que no está en la lista; ejemplo 22, "a que precio estan?" → `[lista]` · "contame
   que modelo te interesa". Y en vivo la guardia frena "nuestro stock", "stock propio", "stock nuestro" y
   parecidos ("nuestros stocks", "nuestro propio stock", "mi stock", "stock de nosotros"; `LO_INTERNO_DEL_STOCK`);
   "en stock" y "sin stock" pasan. Ver también *Lo que cita el cliente*.

**`STOCK_APP_MODO`** (`src/config.js`, `.env.example`), apagado por defecto; cambiarlo pide reiniciar:
- `apagado`: nada de esto corre; Chiara contesta como siempre.
- `sombra`: escribe la pestaña **"USADOS APP"** (la crea si no existe, copiando las filas de arriba de USADOS: es la
  única pestaña que el bot puede crear) para compararla en el Drive; aplica las órdenes y el espejo copia STOCK.
  Chiara contesta como hoy: sin el filtro de STOCK, sin `donde`, sin la frase del depósito ni la sección de las
  reglas. `test/stock-app.test.js` lo prueba comparando el pedido a Sonnet byte a byte con apagado.
- `vivo`: escribe USADOS y Chiara usa lo nuevo (puntos 2 a 5).

**Para prenderlo:** publicar la 0018 en la app; sumar una columna con el encabezado `STOCK` en la fila de
encabezados de LISTA y de LISTA 85-93 (después de Notas, hasta la columna Z; vacía = se ofrece); `STOCK_APP_MODO=sombra`
en el `.env` y reiniciar; mirar "USADOS APP" en el Drive, `/salud` (`stockApp`) y el log unos días; después
`STOCK_APP_MODO=vivo` y reiniciar. `/salud` muestra `stockApp: { modo, activo, pestana, ultimaVuelta, ultimoError,
usados, ordenes }`.

Lo prueba `test/stock-app.test.js` (26 checks: una planilla de mentira con fórmulas, un Supabase y un Sonnet de
mentira): el día del depósito de lunes a domingo, las fórmulas corridas, la entrega mínima (y las baterías que no
entran), el plan de escritura (y las columnas desconocidas), sombra y vivo contra la planilla, Supabase caído y la
vista vacía tres vueltas, los rangos por modo, las órdenes (encuentra, no encuentra, dos filas, sin columna, Google
caído con reintento), el espejo con STOCK y con una pestaña vacía, `donde`, local primero y `al_100`, `[deposito]`
y la guardia (solo en vivo; "haceme el depósito" pasa), solo contado, el código al escalar y que sombra es idéntico
a apagado; y lo que pasó hoy (8 checks): la base, empezó / dejó / el precio, el disco y el reinicio (y un archivo
ilegible), el reintento si no se pudo guardar, la vista que falla o viene vacía, USADOS vaciado a mano, más de 15
cambios, sombra y apagado, y un oyente que tira; y la lista del local (8 checks, 08/10/2026): la lista del local
sin repetir en un mensaje y sus precios en la guardia (uno de LISTA frena), el sellado aparte, el orden, la vista
vacía (la lista de siempre), apagado y sombra iguales a hoy, el 13 citado con `buscar_equipos`, "nuestro stock" (solo
en vivo) y las reglas.

## Lo que cita el cliente: `[responde a: …]` (08/10/2026)

Decisión de Tomás del 08/10/2026 (20:30), chat …3557: el cliente respondió a un producto del catálogo de WhatsApp
("iPhone 13 100%") con "Hola a qe precio están", Sonnet no vio la cita y le mandó la lista entera. Rama
`lista-stock-local`; en todos los modos de `STOCK_APP_MODO`.

- **La línea del cliente que responde a otro mensaje** (un producto del catálogo, un estado, un mensaje nuestro o
  suyo) entra al historial con lo citado adelante: `[responde a: iPhone 13 100%] Hola a qe precio están`. Así la
  leen Sonnet (en el historial y en "lo que escribió ahora") y el registro de aprendizaje (`cliente`);
  `ultimoMensajeCliente` (el "último mensaje" del panel, cortado a 80 caracteres) queda sin la cita, para que se vea
  lo que escribió. La arma `conCita` (src/texto-del-mensaje.js) en index.js, **después de los comandos** (un
  `#reset` del tester que cita sigue siendo el comando), para un texto, el epígrafe de una foto y la transcripción
  de un audio; y en contexto.js para las líneas del cliente que trae de Evolution (las de la cuenta, sin cita).
- **De dónde sale** (`loCitado`): `contextInfo.quotedMessage`, en el `contextInfo` de cada tipo de mensaje
  (`message.extendedTextMessage.contextInfo`, `imageMessage`, `audioMessage`…; la forma de Baileys) o en
  `data.contextInfo` (Evolution v2 lo copia ahí; los mismos dos lugares que lee anuncio.js), con los envoltorios
  `ephemeralMessage`, `viewOnceMessage*` y `documentWithCaptionMessage` abiertos. Lo citado: de un producto del
  catálogo, `productMessage.product.title` (sin título, `.description`) y el precio si viene (`priceAmount1000`, por
  mil: "$535.000"; otra moneda, "USD 500"; número, texto o Long); si no, `conversation`, `extendedTextMessage.text` o
  el epígrafe de una foto, un video o un archivo; sin texto, "[foto]", "[video]", "[audio]", "[sticker]" o
  "[archivo]". En una línea, hasta 120 caracteres (sin cortar un emoji), con los corchetes como paréntesis. **La forma
  del producto citado no se vio en un payload real**: son los campos del proto de WhatsApp; si en vivo no aparece,
  mirar el webhook de un mensaje así. Sin cita, una cita vacía o una que no se lee (una reacción, una ubicación), la
  línea es la de siempre. Un anuncio (`externalAdReply`) no es una cita.
- **Lo que lee sin la cita** (`sinCita`): el bot de siempre recibe el mensaje sin la cita (`decidirSinCita` en
  index.js: un monto o un "como estas?" de lo citado no son suyos; las líneas de la tanda van tal cual, para
  encontrarla en el historial); los acuses de Sonnet (un "dale" que cita sigue siendo un acuse) y el saludo del día
  (si cita nuestro "como estas?" de ayer, el saludo no le "devuelve" la pregunta). Lo que no se tocó: una tanda de
  varias líneas del bot de siempre que son todas acuses citados ya no cuenta como acuse en `noSeEntiende`, el
  "lo pienso" del seguimiento (`NO_SEGUIR`) y el "pide respuesta" del panel miran la línea con la cita.
- **Las reglas** (*Quién sos*): `[responde a: …]` es lo que citó; si cita un equipo y pregunta el precio, es una
  consulta de ese modelo con `buscar_equipos` (y la batería que dice), no la lista. Ejemplo 21 (…3557).

Lo prueba `test/responde-a.test.js` (15 checks, en `npm test`): lo citado (el producto con y sin precio, el Long, el
texto, el epígrafe, "[foto]", los 120 caracteres y el emoji, los corchetes, las dos ubicaciones, la cita vacía o
rara, el anuncio), `conCita` y `sinCita`, el webhook con Sonnet en las dos ubicaciones (historial, lo que escribió
ahora y `ultimoMensajeCliente` sin la cita), una tanda de dos mensajes, la foto citada, el texto largo, el precio, sin
cita igual que hoy, el audio, el
`#reset` del tester, el bot de siempre sin la cita, el acuse, el saludo, las líneas de contexto.js y las reglas. En
la batería, el 117.

## Chiara manda fotos de los equipos del local (08/10/2026)

Decisiones de Tomás del 08/10/2026, rama `fotos-equipos` (sobre `cbd2c9c`, main con el merge de `cotizar-financiable`).
Hasta acá, si el cliente pedía fotos, Sonnet escalaba (*Cuándo escalás*: "pide fotos o videos") y las reglas le
prohibían mandarlas o prometerlas. Desde acá, **solo con `STOCK_APP_MODO=vivo`**, cuando el cliente **pide** fotos
("me mostrás el 15?", "tenés fotos?", "pasame foto del 13") Chiara manda una foto por equipo del local de ese modelo,
con un pie abajo como Fran ("15 128gb 87% 740.000"), hasta 3. Con apagado o sombra, todo como hoy (pide fotos →
escala). Las consultas de stock siguen en texto; videos y colores ("de qué color es?") siguen escalando. El bot de
siempre (`responder.js`, `#sinstock`, `fotos.js`) no cambia.

**Las fotos y el índice (no es código del bot: lo llena Claude a mano).**
- Carpeta: `fotos/iPhone <modelo>/` (`FOTOS_DIR`), una subcarpeta por modelo ("iPhone 11" a "iPhone 18 Pro Max",
  sin mini ni Air). Tomás sube fotos de un equipo solo o de varios juntos.
- Índice: `fotos/indice.json`, que escribe Claude mirando cada foto:
  ```json
  { "v": 1, "fotos": [
    { "archivo": "iPhone 15/IMG_0412.jpg", "modelo": "iPhone 15", "colores": [["rosa"], ["cian", "celeste", "azul claro"]] }
  ] }
  ```
  `archivo` es la ruta relativa a la carpeta de fotos (jpg, jpeg, png o webp; nunca sale de la carpeta); `modelo`, el
  modelo de la foto; `colores`, un elemento por celular que se ve, **de izquierda a derecha**, y en cada uno los
  nombres con que puede estar cargado ese color en la app (sin importar mayúsculas ni tildes: "GRAPHITO" y "grafito"
  son lo mismo). Una foto de un solo celular tiene un solo elemento. Una entrada sin la forma (sin archivo, modelo o
  colores, o con un archivo fuera de la carpeta) se saltea con un aviso.
- El bot relee el índice cuando cambia el archivo (fecha de modificación y tamaño), sin reiniciar
  (`fotosEquipos.leerIndice`). Si no está o no se puede leer: sin fotos (la herramienta devuelve `sin_foto` y Sonnet
  escala como hoy), un aviso en consola una sola vez por motivo, y nada se rompe.

**Cómo (`src/fotos-equipos.js`, `cerebro.js`, `index.js`, `acciones.js`).**
1. Una herramienta nueva para Sonnet, `mandar_fotos({ modelos, capacidad? })`, **solo en vivo**
   (`herramientasEfectivas`; con apagado o sombra no existe y las reglas dicen que pedir fotos escala). Quién elige
   es el código, no Sonnet:
   - por cada modelo pedido (hasta 6; los demás vuelven en `sin_mirar`), las unidades del local (`buscarTodas` → USADOS, con código y color); si no hay
     ninguna pero sí una fila de LISTA con stock, el modelo es del depósito; si no hay nada, `no_hay`;
   - orden: la unidad de la que ya se habló primero (la que se cotizó: el `id` del último `cotizar` de esta respuesta
     o `unidadCotizada` del estado, que `comoResultado` guarda con cada cotización de una unidad del local), y su
     modelo adelante de los otros pedidos; si no se sabe de qué unidad se habló, el modelo del estado (`s.modelo`,
     `modeloDelChat`) va adelante; después, las más baratas (el orden de `buscarTodas`). "La que se nombró" no se
     infiere: no hay forma segura;
   - **hasta 3 fotos en total** por respuesta, repartidas entre los modelos (una de cada uno, después la segunda de
     cada uno…); dos unidades con el mismo pie y la misma foto van una sola vez;
   - por cada unidad hace falta **color cargado** y una foto del índice con ese **modelo** y ese **color**
     (`fotoPara`): una donde está sola antes que una de varios; con más de 3 celulares, o con ese color en dos
     celulares de la misma foto (no se sabe cuál es), la foto no se usa;
   - **el pie** (`pieDe`): `<modelo sin "iPhone", en minúscula> <capacidad>gb <batería>% <precio con puntos, sin $>`:
     "15 128gb 87% 740.000", "14 pro 128gb 100% 835.000", un sellado "17 256gb sellado 1.700.000". Si la foto tiene
     varios celulares, una segunda línea: "me quedó el de la izquierda, el cian" (con 3: "el de la izquierda", "el
     del medio", "el de la derecha"; el color tal cual está cargado en la app, en minúscula).
   La herramienta devuelve `fotos` (modelo, capacidad, batería, color, precio, `pie` y `en_la_foto`), `deposito` con
   `frase_deposito`, `sin_foto` (solo las unidades de los modelos de los que no va ninguna foto), `no_hay` y, con más
   de 6 modelos pedidos, `sin_mirar` (los que sobran), cada uno con su nota. Los precios de las unidades valen para la
   guardia y sus modelos entran en `buscados`.
2. Sonnet termina con `responder` y un mensaje que es exactamente **`[fotos]`**: `revisarSalida` lo cambia por las
   fotos, como acciones `foto-equipo` (`acciones.fotoEquipo({ archivo, pie, codigo })`); sin `[fotos]`, van después
   de sus textos. `[fotos]` sin fotos de `mandar_fotos` en esa respuesta frena. Con fotos en la respuesta, "te paso las
   fotos" deja de ser una promesa que frena (`prometeArchivo` con `fotos`). `pensar` devuelve `mensajes` (texto, con
   la foto como "[foto: 15-128-001] 15 128gb 87% 740.000", para el registro, la sombra y `#sonnet`), `piezas` (lo
   mismo con las fotos como acciones, para index.js) y `fotos` (código, pie y archivo de las que salen; en la
   `propuesta` del registro, `sonnet.fotos`).
3. **El tope de 4 mensajes** lo cuida `comoResultado`: las fotos caben donde dejan lugar los textos de Sonnet, el
   saludo del día (si hoy no se habló) y el PDF. Saludo + 3 fotos = 4; saludo + un texto + 3 fotos → van 2 fotos (las
   primeras del orden). Nunca se corta un texto ni se pasa el tope. Las reglas le piden a Sonnet como mucho un texto
   corto con las fotos, o ninguno.
4. **Cada foto sale por el mismo camino que `mandarFoto`** (`mandarFotoDeEquipo`, index.js): "escribiendo…" y la
   espera entre mensajes, los mismos candados (lista de prueba, escucha, Chiara apagada, `archivoPermitido`: la foto
   tiene que estar adentro de `fotos.carpeta()`, las subcarpetas valen), `evolution.enviarImagen` con el pie como
   `caption` (un solo mensaje por foto), la autoría, las marcas, `botEnvio` y el historial: queda como `[foto] 15
   128gb 87% 740.000` (`acciones.paraHistorial`), que Sonnet lee en la vuelta siguiente como "Vos (antes): [foto] …".
   La ruta sale del índice (`fotosEquipos.rutaDe`), nunca de un texto. Cuenta como un mensaje que le llegó
   (`enviados`), el precio del pie cuenta en `preciosMostradosDe` y para el seguimiento (`ultimoPrecioBot`, como un
   precio de contado), y la `propuesta` del registro anota en `sonnet.fotos` las que van de verdad (después del tope
   de 4). Si una foto no se puede mandar (ya no está en el índice o en el disco, Evolution falló), las demás salen
   igual, el chat no escala y el grupo recibe `📷 NO SALIÓ LA FOTO · <nombre> · <código> (<pie>) · <error> · wa.me/… ·
   mandásela vos` (`avisarFotoNoSalio`).
5. **Del depósito** (el modelo no está en el local, solo en LISTA con stock): no manda foto. Sonnet escribe
   **`[fotos_deposito]`** (un mensaje solo o adentro de uno) y el código lo cambia por "mira, ahora en el local no
   tengo este modelito, si me esperás un rato le pido fotos a los chicos del depósito, si no te las mando mañana"
   ("el lunes" de viernes a domingo, `stockApp.diaDelDeposito`; si pidió más de un modelo, nombra el del depósito:
   "no tengo el 16 pro"; `fotosEquipos.fraseFotosDeposito`). Chiara sigue atendiendo (no escala) y **el código** avisa
   al grupo por el 📌 de `aviso_grupo`: "le prometí fotos del iPhone 16 Pro (depósito): mandáselas" (se suma al
   `aviso_grupo` de Sonnet si lo hubo). Es la única promesa de fotos permitida: la frase se pone después de la
   guardia, así ni `prometeArchivo`, ni `nombraElDeposito` ("a los chicos del depósito") ni la regla nueva de "te las
   mando mañana" la frenan; los 300 caracteres se miden con ella puesta. `[fotos_deposito]` sin un modelo del depósito
   de `mandar_fotos` frena.
6. **Del local sin color cargado, o sin foto de ese color** (`sin_foto`): salen las fotos que sí hay de los otros
   modelos (o la frase del depósito) y **después** el código escala por ese modelo (`escalarDespues`: `comoResultado`
   devuelve `escalar: true` con los mensajes; index.js los manda y recién ahí escala con `control.escalar`, avisa al
   grupo con el motivo "pidió fotos del iPhone 14 y no tiene color cargado" / "pidió fotos del iPhone 13 y no hay
   foto del iPhone 13 negro" y la línea `Equipo: 14-128-008` (`paraElGrupo`, hasta 3 códigos), y anota el lead).
   Como le llegaron fotos, el aviso es el 🔔 LEAD de un escalado con respuesta, no el 🔕 ("no le contesté nada"). Si
   ninguno de los que pidió tiene foto, las reglas le piden `escalar` (el 🔕 lleva el código igual, `equipoSinFoto`);
   y si Sonnet igual quisiera contestar algo sin fotos, el código escala callado (`escalaSinMandar`). Una unidad sin
   foto de un modelo que sí tiene otras con foto no escala: el cliente recibió fotos de ese modelo.
7. **La guardia**: `[fotos]` y `[fotos_deposito]` sin la herramienta frenan; `mandar_fotos` es interno
   (`LO_INTERNO`); "te mando fotos" / "te paso fotos" sin la herramienta sigue frenando (`prometeArchivo`); y nuevo,
   "te la(s)/lo(s) mando|paso|envío" con "mañana", "después", "más tarde", "en un rato", "a la tarde/noche" o un día
   de la semana en las 2 palabras siguientes, sin cruzar una coma ("te lo paso ahora, mañana abrimos" no cuenta),
   frena ("promete mandar algo después", `MANDA_DESPUES`; solo en la guardia de Sonnet, no en `evaluar`).
   `textoDeCorreccion` lo dice en vivo.

**Las reglas** (`cerebro-reglas.md`, hash `a8028395`, 196 líneas; en vivo con `cerebro-reglas-deposito.md`,
`f233570e`, 218 líneas; antes `0ae1d55b` / `8fae6b0d`): *Cuándo escalás* (las fotos ya no escalan solas si el pedido
dice "Stock: del local y del depósito": `mandar_fotos`; videos y colores sí; sin el stock en vivo, pedir fotos sigue
escalando), *Lo que no hacés nunca* (nada de "te mando fotos", "te paso fotos", "te las mando mañana"; las fotos solo
con la herramienta y `[fotos]`; la frase del depósito la pone el sistema con `[fotos_deposito]`), los ejemplos 23 a
26 (eran 21 a 24 antes del merge con `lista-stock-local`; foto sola, foto de dos celulares, depósito, foto + escala) y la sección *Fotos de los equipos* en
`cerebro-reglas-deposito.md` (solo en vivo, como *El local y el depósito*). Ver `CAMBIOS-CEREBRO.md`.

**En la sombra** (`pensarEnSombra`, la sombra con persona, `#sonnet`) la herramienta elige las fotos igual pero no se
manda nada: la propuesta queda con "[foto: …] pie" en texto.

Lo prueba `test/fotos-equipos.test.js` (15 checks, nuevo, en `npm test`, con un `fetch` de mentira, Evolution de
mentira y una carpeta de fotos temporal): el pie y el índice; la foto sola y la línea en el historial; la foto de dos
celulares; las 5 unidades del 13 con la cotizada primera, y entre varios modelos el de la cotizada (o el del estado)
adelante; el depósito un jueves y un viernes, con el aviso; las del 13 y
el escalado por el 14 con su código; el tope de 4 con el saludo; el índice que no está o está roto, y que se relee;
apagado y sombra idénticos a hoy; la guardia; el camino real de `evolution.enviarImagen` con el pie en el `caption`;
una foto que no se puede mandar; y la sombra con persona, donde no sale nada.
En la batería: los casos 118 (foto sola), 119 (depósito) y 120 (foto + escala) de `test/bateria-cerebro-casos.js` (116 y
117 son de la rama `lista-stock-local`), con
`stockVivo` y `fotosDeEquipos` en el caso (el corredor arma la carpeta temporal) y los chequeos `fotos`, `pies`,
`primerPie` y `fraseDeposito`; `test/bateria-cerebro.test.js` los corre con un Sonnet de mentira. `test/fotos-pedido.test.js`
(el catálogo viejo y `#sinstock`) sigue igual.

## Precios de TechSur (01/10/2026)

`src/techsur.js` lee los avisos del grupo de TechSur (el proveedor; el número del bot está en su comunidad), sin IA y
sin escribirle nunca, y guarda cada equipo con precio en dólares en `precios_proveedor` del Supabase de la app de
ventas (migración 0010), que los muestra en el panel Cotización. Cada aviso queda tal cual en `data/techsur.jsonl`
para volver a leerlo (`npm run techsur -- --recargar`). Detrás de `TECHSUR_ACTIVO`; el grupo, por `TECHSUR_GRUPO_JID`
o por el nombre. Cada fila: `modelo`, `capacidad`, `condicion` (usado si trae baterías, sellado si lo dice el aviso o
viene con 📦, null si no se sabe), `precio_usd`, `detalle` (color y baterías), `nota` y `clave` (modelo + capacidad +
condición + nota: lo que agrupa el mismo equipo entre avisos; "1U", "batería baja" o "con detalles" son otro precio).

**El tramo de batería (decisión de Tomás del 08/10/2026).** La "LISTA MAYORISTA" del 07/10 trae el mismo equipo en dos
tramos con encabezado ("Batería 85% a 99%": 13 128 a US$280; "Con batería nueva": a US$300) y los dos salían con la
misma clave, sin forma de saber cuál era cuál (la app va a comparar el de TechSur contra la LISTA, que es al 100%).
Desde ese día el tramo va en `nota`:
- `batería 100%`: los equipos bajo un encabezado "Con batería nueva" o con "batería 100%" ("USADOS CON BATERIA 100%"
  del 06/10), y los que traen 100% como única batería ("IPHONE 13 128GB 100% $295"; si son varias, todas 100%);
- `batería 85-99%`: bajo un encabezado de rango ("Batería 85% a 99%"); otro rango, con el mismo formato ("80% a 94%",
  "del 80 al 94%" o "80-94%" dan `batería 80-94%`).
El encabezado (`tramoDe`, una línea sin precio que habla de la batería) vale para los equipos que siguen, hasta el
próximo encabezado, otro título en negrita que no es un iPhone ("*USADOS PROMO*"; `esTitulo`, revisión de code-review)
o el fin del aviso; una línea de color ("PINK X3") o el nombre del equipo ("_IPHONE 15 128GB_", "*IPHONE 15 128GB*")
no lo cortan. Solo en los iPhone que no son sellados: un sellado o una PS5 debajo quedan como
siempre. Si el equipo ya tenía una nota, el tramo va adelante, con una coma: "batería 100%, 1U", "batería 100%, con
detalles" (el aviso del 28/09 "IPhone 17 256GB 100% con detalles" pasó de "con detalles" a eso). "Batería baja" sigue
siendo la nota del aviso, y un aviso de batería baja no lleva ningún tramo, aunque traiga un rango u otro encabezado
(revisión de Codex: si no, en un aviso con "USADOS CON BATERIA 100%" y después "USADOS BATERIA BAJA", los de batería baja
salían "batería 100%, batería baja"). Los usados con baterías sueltas distintas siguen sin nota. No
cambian la tabla ni las columnas. De los 89 avisos guardados al 08/10 cambian 3, solo en la nota y la clave (la
LISTA MAYORISTA, el 13 al 100% del 03/10 y el 17 con detalles); hay que releerlos con `npm run techsur -- --recargar`
desde la carpeta del bot, que reescribe esas filas por mensaje y posición.

Lo prueba `test/techsur.test.js` (20 casos: las formas de los avisos, la LISTA MAYORISTA con sus 22 equipos y claves
distintas, los encabezados y los títulos que los cortan, el 100% solo, la nota que se suma, los sellados, lo que no es
iPhone y batería baja; el grupo, Supabase de mentira y el reintento).

## Los timeouts de Supabase (08/10/2026)

Diagnóstico de los errores del panel y del stock contra el Supabase de la app (rama `timeout-supabase`, worktree
`wt-timeout`, sobre `fee4cd4`). Lo que mostró `data/consola.log`:
- **7 veces `[panel] estado: Supabase 500 en bot_estado: 57014 canceling statement due to statement timeout`**, todas
  el 07/10 (una a las ~13:58, cuando volvía la red; seis de ~19:45 a ~22:16, la primera justo después de un "apagar"
  desde el panel) y siempre en `bot_estado`, que es lo único que se sube todos los minutos sin falta. Se arreglaron
  solas a la vuelta siguiente. Un 57014 lo manda la base (Postgres canceló el upsert al pasar el `statement_timeout` del
  rol): la base estuvo lenta o trabada un rato. Desde el bot no se ve por qué; las consultas para verlo están en
  `C:\bot-whatsapp\Claude outputs\cerebro\timeout-supabase-para-la-app.md`.
- **19 episodios de `fetch failed`** el 06 y el 07/10: todos durante cortes de internet de la PC (en el mismo minuto,
  Google da `ENOTFOUND` y Evolution `close`). No son de Supabase.
- **Un `[stock-app] órdenes: The operation was aborted due to timeout`** el 08/10 a las ~14:29, en la primera vuelta
  después de arrancar (el GET de `planilla_ordenes` no contestó en 15 s), 5 s después de la primera vuelta del panel
  (que al arrancar sube los 243 leads de nuevo, ~260 KB en dos pedidos: lo subido se recuerda solo en memoria).

Lo que manda el bot (medido con datos de prueba del tamaño real): `bot_estado` ~1,9 KB cada minuto (`salud` ~1,5 KB),
más el GET de `bot_ordenes`; `bot_leads` solo lo que cambió (~1 KB por lead); el stock, dos GET por minuto
(`planilla_ordenes` y `v_stock_chiara`). Nada de eso es pesado. Hasta acá el panel y el stock salían en el mismo
milisegundo cada minuto, y el espejo con ellos cada 30 minutos.

Lo que cambió (nada de lo que llega a la app: las mismas filas y la misma frecuencia):
1. **La hora en el log:** las líneas de error y de "anda de nuevo" de `[panel]` y `[stock-app]` llevan la hora de
   Argentina (`[panel] 07/10 20:35:12 estado: …`; `horaAR` de `src/supabase-reintento.js`). `ultimoError` de `/salud`
   no cambia.
2. **Un reintento:** en `pedir` del panel y del stock, un 57014, un 504 o el tope de 15 s del `fetch` se reintentan una
   vez a los 5 s antes de contar como falla, con una línea `[panel] <hora> bot_estado: …; reintento en 5 s`. Un 400, un
   503 o "fetch failed" fallan de una, como antes (la vuelta siguiente lo vuelve a probar). Todo lo que se reintenta es
   idempotente (GET, upsert, el PATCH de una orden con `estado=eq.pendiente`). `SUPABASE_REINTENTO_MS` cambia la espera
   (solo para las pruebas).
3. **Cada uno en su lugar del minuto:** el panel, como siempre (a los 15 s y en cada minuto justo desde que arrancó);
   el stock a los 30 s y cada 1 minuto desde esa; el espejo a los 45 s y cada 30 minutos desde esa.

No se hizo: dejar de mandar `bot_estado` cuando no cambia. Su `actualizado_en` es el latido que usa la app para "Chiara
no reporta" (3 minutos), y `salud` cambia en cada vuelta igual.

Lo prueba `test/timeout-supabase.test.js` (6 chequeos, con `TZ=Asia/Tokyo` y un reloj de mentira para el corrimiento):
el 57014 que entra al reintento, dos seguidos que sí cuentan, el timeout y el 504, lo que no se reintenta (503, 400,
"fetch failed"), lo mismo en el stock, y que en una hora y un minuto el panel, el stock y el espejo nunca salen a menos
de 10 s uno de otro. Las 19 mutaciones de las guardas caen.

**Qué mirar después de reiniciar:** que las líneas de `[panel]` y `[stock-app]` traigan la hora; cuántas líneas
`reintento en 5 s` hay y si después viene el error (el reintento no alcanzó) o nada (entró); y si vuelven los 57014,
la hora exacta para cruzarla con los logs de Supabase.

## Promo del Día de la Madre (12/10/2026)

Decisión de Tomás del 12/10/2026: del 12 al 18/10/2026 hay 10% OFF en todos los equipos y **Chiara no cotiza esa promo: escala a Tomás o Fran**. El cliente llega de Instagram (comenta MAMÁ, CUOTAS, CANJE, HERMANOS o REGALO, ManyChat le contesta por DM) con un mensaje ya escrito: "Hola! Vengo por la promo MAMÁ" o "Hola! Vengo por la promo MAMÁ - CUOTAS".

- **Código:** `src/promo-madre.js` (la regla, la fecha y el texto) + un gancho en `atenderTanda` (`src/index.js`) + otro en `delCliente` (`src/panel-chiara.js`). La regla va ANTES de elegir quién contesta: no se le pregunta a Sonnet ni a Gemini, y no se arma ninguna cotización. Sirve igual con `CEREBRO_MODO=todos` que con el bot de siempre.
- **Cuándo se dispara:** un mensaje del cliente (el primero o cualquiera) que diga "promo MAMÁ", "Día de la Madre" (o "de las Madres"), "10%" / "10 %", "diez por ciento" o "descuento de Instagram". No cuenta "100%", "110%" ni "1,10%", ni lo que el cliente citó (`[responde a: …]`). Falso positivo conocido, a pedido: cualquier "10%" suelto ("la batería está al 10%", "el 10% de seña") también escala con el saludo de la promo hasta el 18/10; el error cae del lado seguro (lo ve una persona).
- **Qué hace:** contesta una sola vez "Hola! Gracias por escribirnos 💐 Ya te paso con Tomi o Fran para la promo del Día de la Madre." y escala como cualquier otro caso (queda callado, aviso al grupo, fila en LEADS, panel). El motivo lleva la palabra: "Promo Día de la Madre — CUOTAS" (o MAMÁ, CANJE, HERMANOS, REGALO, "sin palabra"). Si el saludo ya le llegó a ese chat (la promo vuelve a aparecer después de un escalado resuelto), escala igual pero sin decirle nada: el aviso al grupo es el 🔕. Lo recuerda la marca `promoMadreSaludo` del estado (una marca de "ya se dijo": la guarda `enviarAlCliente` solo si Evolution confirma el envío), no el historial, que olvida lo que pasó hace más de 30 líneas. Con `CEREBRO_MODO=sombra`/`nuevos` la promo tampoco se piensa en sombra.
- **El origen:** `bot_leads.anuncio_id` = `madre-<palabra>` (`madre-cuotas`, `madre-canje`, `madre-hermanos`, `madre-regalo`; `madre-mama` para "promo MAMÁ" sola, sin tilde porque el CHECK de la 0013 es `^[A-Za-z0-9_-]{3,64}$`) o `madre` si no vino la palabra. El primero que aparece se queda, y un anuncio de verdad (`externalAdReply`) le gana. La planilla LEADS no tiene esa columna: ahí el motivo queda en `estado` ("ESCALADO - Promo Día de la Madre — CUOTAS"). El panel de Meta de la app cuenta como leads de anuncio todos los `bot_leads` con `anuncio_id`: estos entran en el total sin gasto de Meta.
- **Se apaga solo:** vale hasta `PROMO_MADRE_HASTA` = 18/10/2026 23:59:59 (hora de Argentina, UTC-3). Desde el 19/10 esos mensajes siguen el flujo normal. Después se puede borrar el módulo y sus dos ganchos; no hace falta tocar nada más.
- **Excepción a una regla fija:** el saludo promete que Tomi o Fran le van a responder, cosa que el bot nunca hace ("ahora te responde fran", `src/promesas.js`). Es a pedido de Tomás y es un texto fijo del código: la guardia de promesas solo mira lo que escribe Sonnet.
- **Prueba:** `test/promo-madre.test.js` (con reloj de mentira: no depende del día en que se corra).

## Arreglos de las pruebas en vivo del 12/10/2026 (rama `wt-arreglos-pruebas`)

Decisiones de Tomás del 12/10/2026, después de 20 pruebas en vivo con el tester. Reglas en vivo: `d084f1fa` (226 líneas; antes `9ad66e9f`).

- **Depósito: primero vender, después la frase.** Lo del depósito se ofrece como cualquier otro (precio, cuotas, turno) sin decir dónde está. Recién cuando el cliente lo quiere (elige una opción, acepta, pide turno) Sonnet pone `[deposito]` y pregunta el día y el horario. La frase (`stockApp.fraseDeposito`): de lunes a jueves "te lo puedo tener para mañana o pasado"; de viernes a domingo "si me bancás 10 minutos te confirmo bien para cuándo lo puedo tener". `cotizar` de una fila del depósito también habilita `[deposito]` (antes solo `buscar_equipos`). Cuando sale la frase, el código manda al grupo `🚨 ENTRÁ VOS · DEPÓSITO: quiere el <modelo capacidad> y le dije "<frase>". Confirmale el día.` (sin el 📌, `index.js`).
- **`cotizar` con `bateria`.** "el de 100" cotizaba el de 89% (la más barata que se financia). Con `bateria` (entero) se cotiza esa; si no hay, el error dice las baterías que hay.
- **Solo contado → `financiable`.** "el 12 en cuotas, tengo 150" con el 12 solo de contado escalaba callado. Ahora `cotizar` devuelve `financiable`: el equipo más barato que se financia (`elMasBaratoFinanciable`, LISTA + USADOS), cotizado con esa entrega (1 pago y 2 cuotas, o `llega: false` con su entrega mínima, sin decir cuánto falta). Si no hay ninguno, escala como antes.
- **`desde`.** Con el stock en vivo y más de un precio del modelo, `buscar_equipos` trae `desde` (el más barato del local, o de todo si no hay del local): "el 13 lo tenemos desde $465.000 de contado".
- **Garantía y origen vuelven a la venta.** Regla: después de contestar, "seguís teniendo interés por este modelo o tenías pensado otro?" (si hay modelo en el chat) o "que modelito te interesaba?".
- **Turnos con frase de espera.** Con día y hora (o "hoy"/"ahora"), Sonnet escala con `turno: true` y el código le manda una de `FRASES_TURNO` (alternan en el chat con `esperasTurno` del estado): "dame 10 minutitos que llego al local y me fijo los turnos", "bancame 20 min que estoy en el depósito, ya te confirmo", "ahí me fijo cómo tengo los turnos y te confirmo". Después escala como siempre (`escalarDespues`). Sin `turno`, callado como antes. Excepción a "nunca prometer volver": es un texto fijo del código, a pedido de Tomás.
- **Fotos: unidad sin foto de un modelo que sí tiene.** Van las fotos que hay + `fotosEquipos.FRASE_SIN_FOTO` ("mirá, no sé si me queda en este colorcito porque no estoy en el depósito, cuando llegue te confirmo bien") y un 📌 al grupo con el código ("sin foto: 13-128-030 (no hay foto del iPhone 13 negro), le mandé las otras"), sin escalar. Si de un modelo no hay ninguna foto, escala como antes.
- **Tests:** `test/stock-app.test.js` (7 chequeos nuevos "12/10 …", más las frases nuevas del depósito en los de antes) y `test/fotos-equipos.test.js` (5b).

## Los archivos

| | |
|---|---|
| `src/responder.js` | El árbol de decisión: **qué** se contesta. Respuestas fijas, turnos, saludo. |
| `src/cotizador.js` | Toda la aritmética de precios. Verificado contra la planilla. |
| `src/sheets.js` | Lee CONFIG (sin los umbrales de excepción, desde el bloque 5), LISTA y USADOS. Escribe LEADS. Caché de 5 minutos. |
| `src/gemini.js` | Entiende el mensaje (esquema JSON, reintento, timeout de 12 s), redacta y transcribe. Todo reintento conserva todas las opciones (audio incluido); una transcripción cortada (`finishReason` distinto de `STOP`) es transcripción fallida. A Google no le manda el nombre del cliente. |
| `src/extractor-local.js` | Respaldo sin IA, y lo que usa `--offline`. También lo que se lee sobre el mensaje crudo, lea lo que lea Gemini: descuento, rechazo, y desde el bloque 8 los pedidos de fotos (`pideFotos`), los accesorios (`preguntaPorAccesorio`) y la seña (`pideGuardar`); desde el bloque 10, llegó al local (`llegoAlLocal`), solo su nombre (`soloDiceSuNombre`), viene sin fecha (`vieneSinFecha`) y el monto en dólares (`montoEnDolares`). |
| `src/estilo.js` | Variantes de cada frase sin números. |
| `src/fotos.js` / `src/documentos.js` | Foto por modelo y el catálogo de documentos por id (hoy, el compromiso de pago). |
| `src/acciones.js` | Fotos y documentos como objetos, nunca como texto: cómo se arman, cómo se leen donde solo va texto, y las marcas de "ya se dijo" que lleva cada mensaje. |
| `src/autoria.js` | Si un mensaje propio lo mandó el bot (por id, o con el envío en vuelo) o una persona. |
| `src/control.js` | Chat escalado (callado, recordatorio dentro de la franja de los recordatorios manuales, y vueltas solas), datos viejos por tiempo (`limpiarDatosViejos`, que también limpia `leadRegistrado` y resuelve un escalado abierto; `ultimaActividad`, `horasViejas`), `#pausa` / `#sigue` / `#sinstock` desde el grupo y las cantidades de `/salud`. |
| `src/evolution.js` | Cliente de Evolution: texto, imágenes, PDF (solo del catálogo), "escribiendo…" (`mostrarEscribiendo`), aviso al grupo, el estado de la instancia (`estadoInstancia` para `/salud`, `estadoDeLaInstancia` para el guardián; tope de 10 s), los mensajes guardados (`buscarMensajes` y, desde el bloque Ninjo 1b, `buscarMensajesDeChat`, los de un chat; solo lectura), listas (tester ∪ piloto), `esChatViejo`, `leLlegaAlCliente` y candado del destino. |
| `src/chats-viejos.js` | La lista de chats viejos de `SOLO_CHATS_NUEVOS` (`data/chats-viejos.json`): la puesta al día con Evolution al arrancar y a la vuelta de un corte (`abrirCorte`, `cerrarCorte`), la espera de los mensajes, los avisos y reintentos, `alDia` y los ids de los envíos del bot. Ver *Chats viejos*. |
| `test/sembrar-viejos.js` | `npm run sembrar-viejos`: la semilla de esa lista. |
| `src/contexto.js` | Bloque Ninjo 1b: el historial que lee Sonnet, completado con los últimos 30 mensajes de Evolution (`completar`), sin duplicados y con las etiquetas de siempre. Ver *Cerebro Sonnet: bloque Ninjo 1b*. |
| `src/texto-del-mensaje.js` | `textoDelMensaje` (el texto de un mensaje de WhatsApp) y los marcadores sin texto ("[foto]", "[audio]"…). Lo comparten index.js y contexto.js. Desde el 07/10/2026, también la línea `[foto]` de una foto sin epígrafe (`LINEA_FOTO`, `esFotoDelCliente`; la usa también control.js). Desde el 08/10/2026, lo que cita el cliente (`loCitado`, `conCita`, `sinCita`; ver *Lo que cita el cliente*). |
| `test/probar-contexto.js` | `npm run probar-contexto`: lo que contexto.js traería de Evolution para un chat, solo lectura. |
| `src/guardian.js` | Guardián de Evolution: los dos controles (instancia y webhook), un aviso por corte, la recuperación y los reintentos con tope. Avisa, no reinicia. Le cuenta a chats viejos cuándo abre y cierra cada corte. |
| `src/state.js` | Estado por conversación y del bot, en `data/estado.json`. Desde el bloque Ninjo 1b, cada línea nueva del historial guarda el `id` del mensaje, `completarHistorial` guarda lo que trae contexto.js y `#reset` deja `evolutionTraido` (`reiniciar` con la hora, que `obtener` pone al volver a nacer el chat). Escritura atómica y solo si hubo cambios, archivo dañado apartado, lectura que falla tira sin escribir (solo `ENOENT` arranca vacío), modo solo lectura, mensajes vistos (`marcarVisto`), y desde el bloque Ninjo 2 el gasto de Sonnet del mes (`gastoSonnetMes`, `gastoSonnetAvisado`). Confirma las marcas de un envío (`confirmarMarcas`) y migra el estado guardado al arrancar (`migrar`, versión de esquema). Desde el bloque 10, las líneas del historial que escribe una persona llevan `humano: true`. |
| `src/index.js` | Webhook (secreto, topes, validación, `ultimoMensaje` y `ultimoEntrante`), `/salud`, `HOST`, comandos, tandas de mensajes y ritmo humano, escalar en silencio, las fotos (`mandarFoto`, la de la tanda y la de `#sinstock`), y los barridos: seguimiento (con la misma guardia que las tandas, `seguimientoQueToca`), el silencio de una persona que venció (`revisarSilencios`, bloque Ninjo 1b; desde el 07/10/2026 comparte el camino con `#sigue`, `alSeguir`), resumen, recordatorios, escalados y guardián de Evolution. |
| `src/audio.js` | Notas de voz. |
| `src/resumen.js` | El resumen de la mañana. |
| `src/recordatorios.js` | `#recordar` / `#hecho`: cuándo suena cada uno y cómo se arma el aviso. |
| `src/ventas.js` | `#vendido` / `#perdido`: qué se anota y la confirmación al grupo. |
| `src/temas.js` | Memoria por tema: qué ya se explicó, qué cuenta como pregunta y las versiones cortas. |
| `src/aprendizaje.js` | Registro de aprendizaje por eventos (`cliente`, `propuesta`, `humano`; desde el 01/10/2026 también `propuesta-sonnet`; desde el bloque Ninjo 2, `silencio` y `entrega`), la clave por chat y su sal (`clave`), la memoria de la última propuesta de cada chat, `ejemplos()` y `distancia()`. |
| `src/cerebro.js` / `src/cerebro-reglas.md` | Cerebro Sonnet: el pedido a la API de Anthropic, las herramientas, la guardia (`revisarSalida`) y el gasto del día; las instrucciones de Sonnet. Fase 2: quién atiende cada chat, el chat nuevo, `contestar` / `comoResultado` (lo de Sonnet como el resultado del bot) y los avisos al grupo. Ver *Cerebro Sonnet (fase 1, en sombra)* y *Cerebro Sonnet, fase 2*. |
| `src/sombra-persona.js` | Sonnet en sombra donde atiende una persona (03/10/2026, por 7 días): junta las líneas, piensa con el historial cortado en la última del cliente, el tope del día y lo de `/salud`. No manda nada. |
| `src/panel-chiara.js` | Panel Chiara (06/10/2026): cada 1 minuto sube estado, leads, días y noticias a la app y aplica las órdenes; los ganchos que cuentan (`delCliente`, `deChiara`, `delHumano`, `cerebro.alPensar`), `data/chiara.json`, la etapa y "para cerrar hoy". Ver *Panel Chiara*. |
| `src/interruptor.js` | El interruptor general de Chiara (`data/interruptor.json`). |
| `src/stock-app.js` / `src/cerebro-reglas-deposito.md` | El stock de la app en la planilla (08/10/2026): la vista `v_stock_chiara` a USADOS (o USADOS APP en sombra) conservando las fórmulas, las órdenes de STOCK, el día y la frase del depósito; y las reglas del local y el depósito que van a Sonnet solo en vivo; "empezó / dejó de ofrecer" para "Lo que pasó hoy" (`anotarOferta`, `alCambiarLaOferta`, `data/stock-ofrece.json`). Ver *El stock de la app en la planilla*. |
| `src/fotos-equipos.js` | Chiara manda fotos de los equipos del local (08/10/2026, solo en vivo): el índice `fotos/indice.json` (releído cuando cambia), la foto por modelo y color (`fotoPara`), el pie (`pieDe`), la elección de hasta 3 (`elegirFotos`), la ruta adentro de la carpeta (`rutaDe`) y la frase del depósito de las fotos. La herramienta `mandar_fotos` vive en cerebro.js; el envío, en index.js (`mandarFotoDeEquipo`). Ver *Chiara manda fotos de los equipos del local*. |
| `src/supabase-reintento.js` | Los timeouts de Supabase (08/10/2026): `unReintento` (un 57014, un 504 o el tope del fetch, una vez a los 5 s) y `horaAR` (la hora de Argentina para el log), para el panel y el stock. Ver *Los timeouts de Supabase*. |
| `src/anuncio.js` / `test/anuncios.js` | El anuncio de Meta del que vino un mensaje (`externalAdReply.sourceId`), y `npm run anuncios`. |
| `src/cierre.js` | `esCierre`: si una línea del cliente es solo un acuse o un gracias (lo usan el barrido del silencio y el panel). |
| `src/cerebro-comandos.js` | Fase 2: `#sonnet`, `#comparar`, `#bot` y `#sonnet-si` desde el grupo. |
| `src/promesas.js` | Las promesas que el bot nunca hace (a nombre de otro, de volver a contactar), por la forma de la frase. La usan las reglas globales de `evaluar` y la guardia del cerebro. |
| `test/sombra.js` | `npm run sombra`: tandas reales del registro contra Sonnet, con el informe de lo que contestaría y cuánto costó. |
| `test/casos.js` + `test/evaluar.js` | El banco de casos, y aparte los ejemplos aprobados. |
| `test/correr-caso.js` | Cómo se corre un caso y se revisa cada turno (`revisarTurno`, con `modeloLeido` desde el bloque 8), y las reglas globales. Lo comparten `evaluar` y `aprobar --fijar`. Un caso con `fotos` corre con un `FOTOS_DIR` temporal (bloque 8). Desde el bloque 9, los chequeos `saluda`, `juntos` y `veces`, y los turnos `pasanHoras` (el reloj del chat para atrás) y `reset`. Desde el bloque 10, el turno `humano` entra marcado como de una persona, y la regla del precio suelto acepta "esos modelos" como contexto. |
| `test/aprender.js` / `test/reproducir.js` | `npm run aprender` y `npm run reproducir`: leer el registro de aprendizaje y pasar los mensajes reales por el bot de hoy. |
| `test/aprobar.js` / `test/aprobados.js` / `test/ejemplos-aprobados.json` | `npm run aprobar` (candidatos, limpieza y consola), el archivo de ejemplos aprobados y `comoCaso` (un ejemplo como caso de `evaluar`), y los ejemplos mismos, en git. |
| `test/*.test.js` | `cotizador`, `resumen`, `lista-blanca`, `audio`, `personales`, `lid`, `chats-viejos`, `contexto`, `sin-venta`, `recordatorios`, `silencio`, `entrega`, `notas`, `gemini-respaldo`, `ventas`, `temas`, `no-entiende`, `seguimiento`, `webhook`, `tandas`, `reset`, `seguridad`, `control`, `marcas`, `gemini`, `financiacion`, `persistencia`, `dedupe`, `audio-reintento`, `precio`, `turnos`, `redactar`, `validacion-comercial`, `guardian`, `aprendizaje`, `aprobar`, `fotos-pedido`, `saludo`, `desde-cero`, `pdf-fallido`, `techsur`, `cerebro`, `cerebro-vivo`, `fotos-sonnet`, `foto-historial-sigue`, `sombra-persona`, `bateria-cerebro`, `espejo-cotizador`, `panel-chiara`, `silencios-y-salud`, `stock-app`, `timeout-supabase`, `fotos-equipos`. Los 53 están en `npm test`. |
| `CAMBIOS-CEREBRO.md` | Las versiones de `cerebro-reglas.md` (el hash de cada una, qué cambió, la hipótesis y los casos que lo prueban) y cómo se revisa un cambio (bloque Ninjo 2). |
| `test/fixture-planilla.js` | Copia congelada de la planilla del 08/09/2026. La usan `--offline` y el navegador. |

## Entrenar el bot desde el navegador

`web/` empaqueta el bot para el navegador con esbuild: el mismo `responder.js` y
`cotizador.js` corriendo sin Node, sin Docker y sin WhatsApp. `npm run simulador` arma dos
páginas autocontenidas:

| | |
|---|---|
| `web/plantilla.html` → `simulador.html` | Chat de prueba pelado. |
| `web/entrenador.html` → `entrenador.build.html` | El entrenador: se publica como Artifact. |

El entrenador usa capacidades del runtime de Artifacts: `sample` (Claude escribe 2
alternativas con otro ángulo de venta), `db` (lo marcado se comparte entre Tomi y Fran) y
`downloads`. **No usa Gemini ni necesita clave de API.** Guardia que no hay que sacar: cada
alternativa pasa por `inventoNumeros()`; si aparece un número que no estaba en la
conversación, la tarjeta se marca *"número inventado"*. Los precios salen de
`test/fixture-planilla.js`: el entrenador sirve para el tono, no para verificar números.

---

## Decidido pero no construido: audios grabados

Idea de Tomás, acordada en septiembre de 2026. **No está implementada.** Lo que ya quedó
decidido, para no volver a discutirlo:

**Qué es**: notas de voz grabadas por Tomi y Fran — su voz real, nunca voz sintética — que
el bot manda en momentos fijos del flujo. Evolution lo soporta con el endpoint de audio
narrado, que llega como nota de voz de verdad.

**Los tres momentos elegidos**, y solo esos: confirmar stock · preguntar la forma de pago ·
el cierre por turnos cuando pregunta dónde queda el local.

**Reglas:** ningún audio lleva números · nunca como primer mensaje ni en un turno que escala
· tres o cuatro variantes por momento entre las dos voces, rotando al azar (el mismo
archivo a decenas de números es firma de spam) · arranca en uno de cada tres chats para
medir el riesgo.

**Lo que falta**: que Tomi y Fran graben los audios. El diseño está cerrado.

---

## Chats desde cero: arreglos del 29/09/2026

El diagnóstico de los chats que empiezan desde cero (`Claude outputs/diagnostico/desde-cero/`)
dio 132 tandas mal de 350. Decisiones de Tomás del 29/09/2026 (D1 a D12) y lo que cambió:

- **Estado del equipo (D4).** Una pregunta por el estado del equipo que vendemos escala
  callado siempre, haya modelo en juego o no: `pregunta por el estado del equipo: "<lo que
  preguntó>"` (`local.preguntaPorEstado`). Cuenta: batería (aunque diga "original"), usado o
  nuevo, sellado ("¿te quedan 16 sellados?" ya no recibe el usado), almacenamiento, memoria o
  capacidad, estado, detalles, rayones, golpes, marcas, "impecable" y el módulo. El texto de
  importados queda solo para el origen: original, reacondicionado, cambiado, pieza, importado,
  "de dónde vienen los equipos". Siguen como antes los datos de SU equipo ("mi 13 con 85% de
  batería", "64gb 80% de bateria", "no tiene detalles"), una consulta de stock con capacidad
  ("¿tenés el 13 de 256?") y el catálogo o la lista de usados, que es la lista.
- **Canje.**
  - En el primer mensaje del canje también se leen del texto el equipo que entrega (pegado a
    "tengo", "mi", "entrego", "dejo", o el de "X más plata por…"), su capacidad y su batería:
    "mi celular iPhone 14 con 77%" pide solo almacenamiento y fotos (`local.datosDelCanjeEnTexto`).
  - Frases nuevas de canje, también sin Gemini: "cambiar mi iphone X por un Y", "te dejo mi 15
    pro", "el 15 pro más plata por un 16 pro", "entregar un iPhone 16 pro", "un 11 para
    entregar", "(más) la placa" (D9). Si el texto lo dice con todas las letras y Gemini no lo ve,
    es canje. Hablar de vender el suyo ("estoy viendo si vendo mi celu actual") no es canje.
    "Me tomás un iphone 8?" sin Gemini sigue como estaba (decisión del 25/09).
  - **D2:** con un canje en curso, el canje toma solo lo que habla de él ("¿cuánto me tomás?",
    "la diferencia", "el resto", "el mío", "te mando las fotos", "fotos?") o trae un dato nuevo
    de su equipo. Lo demás (precio, stock, cuotas, "te aviso") sigue el flujo normal y el canje
    queda pendiente. "sin X no te puedo pasar el numero exacto" sale una sola vez por canje
    (marca `permutaSinDatosDicho`); si vuelve a escribir del canje sin datos nuevos, escala
    callado: `canje: no manda los datos del equipo`.
  - **D1:** una foto sin epígrafe (imagen o álbum) en un canje en curso cuenta como "mandó
    fotos" (`tiene_fotos`) y entra por el mismo camino que cualquier dato nuevo: con los datos
    ya pedidos, escala callado (*mandó los datos del equipo*). También cuenta si llega en la
    misma tanda en que arranca el canje. Varias fotos o un álbum en la tanda son un solo evento,
    y la foto no entra al historial (`index.js` la lleva en la tanda como `fotos`). Fuera de un
    canje, como siempre: nada. Un video sin texto, como siempre.
  - **D3:** un Android u otra marca como parte de pago (Samsung, Galaxy, "A54", "S24", Motorola,
    Xiaomi, Redmi…): "solo tomamos iphone del 11 en adelante", sin pedir datos, sin escalar y
    sin dejar un canje en curso, como con los anteriores al 11.
- **Repeticiones (D5).** Si todo lo que el bot iba a mandar ya lo dijo (los últimos 15
  mensajes suyos que le llegaron), no manda nada y escala callado: `no sé cómo seguir: lo que
  iba a contestar ya se lo dije`. Hasta el 29/09 mandaba igual lo último. Siguen saliendo las
  fotos, el PDF (una vez, por su marca), la lista de precios y la respuesta a un pedido de
  descuento (30/09: cada pedido recibe "el precio es ese", sin escalar, decisión de Tomás). Un acuse ("ok", "dale", un
  emoji) con todo repetido no se contesta y no escala (respuesta de Tomás del 29/09). Un texto
  que Evolution no confirmó (sin id) queda en el historial con `sinConfirmar` y no cuenta como
  dicho.
  - Después de la pregunta genérica de hoy ("contame que estas buscando…", "decime que modelo…"),
    un mensaje que no trae modelo, monto ni pregunta reconocible cuenta como el segundo que no
    se entiende, lo lea Gemini como `otro` o `saludo`: escala sin callar. Un acuse ahí no se
    contesta. Contestar nuestro "¿cómo estás?" ("buenas", "bien, vos?") no cuenta.
  - La lista: "del 15 para abajo" o "hasta el 14 pro" la filtra (catálogo y unidades) y va sin
    "te la paso de nuevo". "El catálogo" y "¿y otros?" piden la lista.
- **Cuotas y pago.**
  - **D6:** tarjeta de crédito o financiera ("¿trabajás con visa?", "¿o con confiable?",
    "¿trabajan con crédito?", Mastercard, Amex, Cabal, "tarjeta de crédito", "tarjeta naranja",
    "naranja x") → `con tarjeta de credito no trabajamos, lo financiamos nosotros con tu dni y
    un compromiso de pago`, sin escalar. Débito, Ualá y Mercado Crédito siguen escalando como
    otro medio de pago. "Naranja" suelta es el color.
  - "¿La financiación es con tarjeta?", "¿piden tarjeta?", "¿hace falta tarjeta?" → los
    requisitos (y la financiación si también la pregunta), con los textos fijos.
  - "¿La primer cuota es cuando retiro?" → el texto fijo `las cuotas arrancan el mes que viene,
    no este mes`, lea lo que lea Gemini. Ese texto nunca lo redacta Gemini (decía "claro…").
  - Con la financiación ya explicada, "¿y cómo serían?" o "¿cómo son?" es la versión corta
    (`temas.pregunta` con `ctx`).
  - Un monto con "el resto (o lo otro) en 2 cuotas", sin fechas ni cobros, es su entrega y se
    cotiza aunque Gemini lea `propone_pago`. Con fechas o cobros sigue escalando.
  - "Si le hago la entrega mínima, ¿cuánto se me va?" → la cotización con la entrega inicial
    del modelo en juego (con varios vistos y ninguno elegido, cada uno con la suya).
  - "¿Tomás USD? ¿Dónde lo puedo ver?" → los dólares y la dirección. "u$s" es dólares también
    sin Gemini.
- **Precio.** Si pregunta el precio del modelo que ya vio ("¿en qué valor?", "¿qué precio
  tiene?", "¿más o menos en cuánto?"), va primero `esta $X de contado` (con el descuento si se lo
  dimos; "desde" si hay unidades de precios distintos) y sigue lo de siempre, con la pregunta de
  cómo paga.
- **Turnos.** Llegó al local también es "ya viene en camino": "yendo", "ya salgo / ya salimos
  (para allá)", "estamos por salir", "estoy en camino", "esperando el uber / cole / colectivo",
  "ya voy" y "afuera" como mensaje entero. Después de la línea de la entrega inicial, de un "te
  cotizo" o "te paso" de la cuenta o de la lista, un "dale", "bueno" u "ok" no pide turno: no se
  contesta nada y no escala (Tomás, 29/09). Para no preguntar lo que ya dijo, el turno mira
  también lo que dijeron hoy el cliente y la persona de la cuenta ("hoy te queda cómodo
  después de las 17?").
- **Sin dato.** Colores: "color" en cualquier forma, o un nombre de color después de "en",
  "algún", "de", "tenés"… ("¿lo tenés en color negro?", "en naranja lo quería", "algún blanco o
  rosa"); con dos modelos nuevos van los precios y avisa por el color. Fotos: "ft", "fts",
  "tendrías" y "fotos del 14 pro" sin verbo piden fotos, salvo que las esté mandando él.
  **D11:** "¿son libres de iCloud?" → `sii, todos libres de icloud`, sin escalar; "liberado"
  sigue escalando. "¿Por qué el 15 es mejor?" y "¿qué diferencia hay?" escalan como comparar;
  arreglar o cambiar el Face ID escala como servicio técnico.
- **Modelo que no está (D7, D8).** Se ofrece el más parecido (`masParecido`): del mismo número,
  la variante más cercana en el orden común (o mini, que cuenta como el común) → Plus → Pro →
  Pro Max, y si empatan la de abajo; si no hay de ese número, la misma variante del número más
  cercano, empezando por el de arriba; si no, ninguna. Del modelo elegido, la fila cotizable
  más barata, con `contadoDe` (respeta el descuento). Con la copia del 08/09: 14 Pro Max → 14
  Pro $800.000; 15 Pro Max → 15 Pro $920.000; 12 Pro → 12 64GB $380.000; 18 Pro Max → 17 Pro
  Max. Escala sin callar como antes: el aviso dice qué modelo pidió y no está cargado, y sirve
  de recordatorio para cargarlo. Si nombra un modelo que no está y pide stock o la lista, va
  esta rama. Si nombra dos y falta uno, el precio del que está y, del que falta, "no me está
  quedando" con el más parecido y su precio (Tomás, 29/09); si el más parecido es uno de los que
  nombró, no se repite ("17 Pro o 18 Pro": el 17 Pro con su precio y "el 18 Pro justo no me esta
  quedando"). **D8:** `RANGO_MODELOS` dice "del
  11 al 18 Pro Max", fijo, y el extractor local lee los 18.
- **Números (D9).** Un número menor a 100 nunca es entrega, tampoco adentro de una frase
  ("hasta el domingo tenía 78"), salvo con "mil", "k", "lucas", "palo(s)" o "millón". Una
  pregunta con un monto a ±5% del contado del modelo en juego ("¿está a 800 mil?") confirma el
  precio (`sii, esta $800.000 de contado`) y no guarda entrega; con "tengo", "cuento con", "me
  alcanza" o una entrega partida es su plata. Un monto con "promo" o "promoción" escala
  callado: `pregunta por una promoción`.
- **Gemini no saluda.** `ESTILO` ya no tiene "buenass" y dice "No saludes". De lo que redacta se
  saca el saludo del principio y los mensajes de puro relleno ("Tranqui", "Quedo atento, dale
  joya"); si no queda nada, va el texto fijo. El saludo del día lo sigue poniendo el bot. Desde el
  01/10/2026 también la muletilla suelta pegada al final de una línea después de un punto, una
  coma o un signo (tranqui, dale, sii, perfecto, dale joya, quedo atento): "…en 1 o 2 cuotas.
  tranqui" sale "…en 1 o 2 cuotas." (`sinMuletillaAlFinal`; con una coma, se va la coma). En el
  medio de la frase queda ("dale, te cuento…").
- **Pedido del catálogo (D10).** Un pedido del catálogo de WhatsApp (`orderMessage`) sin texto
  escala callado: `mandó un pedido del catálogo de WhatsApp: <producto>` (el `orderTitle`, si
  viene). Si en la misma tanda escribió texto, se contesta el texto como siempre.
- **D12.** "perdón, 180 en efectivo y 120 por transferencia" son $300.000, igual que sin el
  "perdón".
- **Lo que mostró la re-medición (29/09/2026).** Arreglado después de reproducir de nuevo los
  80 chats:
  - Canje: "no sé si aceptan el 11, si no tendría que venderlo" es canje (vender es el plan B:
    con "aceptan", "reciben", "toman", "canje" o "parte de pago", `vendeElSuyo` no corta). Con un
    canje en curso también hablan del canje "lo quería cambiar por el 16", "si entregamos los
    dos", "no tiene detalles / rayones / golpes", "buenas condiciones" y "buen estado".
  - D4: "tenía" es su equipo solo pegado a un número o a un equipo ("hasta el domingo tenía 78",
    "tenía un 13"); "yo tenía pensado gastarme un millón, ¿no tenés alguno usado?" escala.
  - D9: si todos los números del mensaje son de una o dos cifras y no hay "mil", "k", "lucas",
    "palo(s)" ni "millón", tampoco vale un monto grande que lea Gemini ("para el mes que viene
    tengo, eso de 10 o 11" no son $1.100.000).
  - No se entiende: después de la pregunta de "no se entiende", otro mensaje sin nada (Gemini
    `otro` o `saludo`) escala sin callar; ya no recibe "contame que estas buscando y con cuanto
    contas".
  - Turnos: el día que dijo hoy vale aunque después escriba mucho la cuenta (mira todo lo de
    hoy, no los últimos 8). El freno del "dale"/"ok" no depende del modelo o el monto que arrastre
    Gemini, y cuenta la lista de una persona aunque la escriba en minúscula ("ip 14 pro 100%
    800.000"). Si en esa tanda ya salió la cotización (el 📱), el "dale" pregunta el día como
    siempre.
  - Precio: "un 12 o 13, ¿qué precio?" con los dos ya vistos → `el 12 esta $380.000 y el 13 esta
    $495.000 de contado` y que elija.
  - Pago: "trasferencia" o "tranferencia" es de contado. Con la financiación ya explicada, "¿y la
    entrega inicial de cuánto es?" → `la entrega inicial del <modelo> es desde $X` y con cuánto
    cuenta, aunque ya se lo haya dicho (antes el filtro de repetidos se comía el número).
  - "Precio alto" sin un modelo en juego → "tranqui, contame con cuanto contas"; ya no ofrece el
    más caro de la planilla.
  - Sin venta: haberle pasado la lista, precios o stock también es señal de venta (un chat que
    pidió la lista y preguntó pagos y colores quedaba callado por "6 mensajes sin ninguna señal
    de venta").
  - "Ahora" no es "hora": la respuesta fija de turnos va con "turno", "horario" u "hora" como
    palabra.
- **Segunda vuelta (30/09/2026).** Regresiones contra `543efba` con frases que no están en los 80
  chats (todos los montos seguían saliendo de la planilla). Lo que cambia:
  - Canje: "entregar" es canje solo si entrega el cliente ("te entrego mi 12", "te puedo entregar
    mi…", "tengo un 11 para entregar", "¿se puede entregar un 16 pro?"). "¿Me podés entregar el
    16?", "¿me podrían entregar el 16 hoy?", "¿para cuándo me entregás?" piden que se lo
    entreguemos: es un turno (`PIDE_TURNO`), no un canje (`local.sinPedidoDeEntrega`). "Más plata
    por un X" es canje solo si habla de su equipo ("mi", "el mío", "tengo", "el 15 pro más plata
    por…") o con un canje en curso: "¿y cuánta más plata por un 15?" son los precios del 14 y el
    15. Si Gemini lee un turno o stock y el texto solo dice "entregar" sin nombrar su equipo, gana
    Gemini.
  - Con un canje en curso: los datos de SU equipo con una pregunta del canje ("es de 128 con 85% de
    batería, ¿cuánto me das?") van al canje y escalan (ya no es D4); un modelo suelto es dato del
    canje solo si el canje todavía no tiene modelo ("¿y el 15?" con el 12 en curso no pisa el 12;
    en `543efba` también lo pisaba), salvo uno que no se trabaja ("no, es un iphone 8"); y un
    Android ("es un samsung s21") cierra el canje con "solo tomamos iphone del 11 en adelante".
  - D9: la confirmación del precio no va con su plata en el mensaje ("doy", "pongo", "abono",
    "pago", "si te doy/paso/dejo", "¿cuánto me queda(n)?", cuotas): "¿cuánto me queda si abono
    790?" cotiza con $790.000. "¿Me lo dejás en 780?" es un pedido de descuento (el camino del
    bloque 5) y ese monto no queda como entrega. Con una entrega ya guardada, "¿y de contado está a
    800 mil?" es solo `sii, esta $800.000 de contado`. El número del modelo no cuenta como número
    chico ("quiero el 14 pro, tengo quinientos" es $500.000) y con un monto en letras la regla no
    se aplica.
  - Del 11 al 18 no es modelo seguido de "años", "de <mes>", "cuotas", "hs", "horas", ni después de
    "a las", "cobro el", "me pagan el", "pago el", "hasta el", "el día", "a partir del/de los"
    ("tengo 18 años", "cobro el 18 y paso"). Con la gama pegada ("hasta el 14 pro") sí.
  - D4 (decisión de Tomás del 30/09): si le da lo mismo sellado o usado ("sellado o usado", "nuevo
    o usado", "ya sea sellado o usados", un usado barato o económico) no escala: con modelo va su
    ficha, sin modelo la lista (`local.leDaLoMismo`). "¿Es usado o nuevo?" pregunta cuál es y
    sigue escalando. Tampoco son D4 el estado de WhatsApp ("vi en tu estado el 15 pro"), los
    detalles de la financiación o del pago (van a la financiación), "algo más nuevo", "¿son nuevos
    los precios?" ni "la capacidad de pago". "¿Trabajan otras marcas o solo iPhone?" escala callado
    con su motivo: `pregunta si trabajan otras marcas`.
  - "Trabajo (cobro, laburo, pago) en negro" no es un color. "¿En cuánto tiempo / abren / llega?"
    no pregunta el precio. "¿Y otros días / horarios / medios de pago?" no piden la lista: "¿otros
    días atienden?" es la respuesta de turnos ("atienden", "abren" la disparan).
  - Llegó al local, solo ahora: también "estoy saliendo", "ya estoy" (mensaje entero) y "en 5
    minutos estoy". No con un día o una hora a futuro ("el sábado ya voy", "mañana paso", "a las 18
    ya salgo"), "me estoy yendo a trabajar", "¿cómo vas yendo?", "ya voy juntando la plata" ni "la
    plata ya está en camino".
  - iCloud al revés (decisión de Tomás del 30/09): "¿están bloqueados por iCloud?", "¿tiene
    iCloud?", "¿vienen con iCloud?" → `todos libres de icloud`, sin el "sii". "¿Están reportados?"
    (el IMEI con denuncia) no es iCloud: `no, ninguno esta reportado`, sin escalar (decisión de
    Tomás del 30/09; `DATOS_FIJOS.noReportados`).
  - D5: si todo lo repetido viene de un escalado, el aviso lleva los dos motivos (`pidió "18 pro" y
    no está cargado en la planilla · no sé cómo seguir: …`).
  - `CORRECCION` ya no tiene la bandera `g` (`hablaDeSuPlata` daba true y después false con el
    mismo texto); `extraerMonto` usa una copia con `g`.

## Pendientes

### Decisiones esperando a Tomás

- ~~**Las fotos de Sonnet, un hueco (06/10/2026, rama `fotos-sonnet`).**~~ Decidido y hecho el 07/10/2026 (rama
  `foto-historial-sigue`, Tomás eligió las dos opciones): la línea `[foto]` del cliente en el historial de los chats
  de Sonnet y el canje de la ficha (`canjeFicha`) en "lo que el sistema ya sabe". Ver *Cerebro Sonnet: ve las fotos
  del cliente*.
- ~~**Pregunta al cliente y escalado con `callar`** (Mejora 1).~~ Decidido y hecho en la
  Mejora 1b: modelo que no está cargado y colores ya no callan el chat. Los turnos
  (`responderTurno`, "que dia te podes acercar?" y "en que horario?") quedan callados a
  propósito: el turno lo confirma una persona.
- **Promesas condicionadas que terminan en un escalado callado** (Mejora 1, sin tocar):
  - ubicación: "decime que dia te podes acercar asi te anoto".
  - ~~permuta: "apenas me lo mandes te cotizamos la diferencia"~~: se sacó en el bloque 5.

- ~~**Monto después de ver varios modelos**~~: decidido y hecho en el bloque 5. Con 2 o más
  vistos y ninguno elegido, se cotizan todos (los últimos 3). Ver *Si dice el monto y varios
  modelos*.
- ~~**Corrección del monto**~~: decidido y hecho en el bloque 5. Con "perdón", "me equivoqué"
  y parecidas gana el último monto y se recotiza, sin la disculpa. Ver *Qué se lee como
  entrega*.
- ~~**Garantía, descuentos, canjes, mínimos y stock**~~ (estaban en `AVANCE-AUDITORIA.md`):
  decididos en el bloque 5. Ver *Validación comercial* y *Cuando la entrega no llega al mínimo*.
- ~~**Un escalado de "no entendí" sin tomar tapa a los que vienen después**~~ Decidido y
  hecho el 22/09/2026 (opción A de Tomás): un escalado que calla le gana a uno que no calla
  (`control.escalaEncima`, en los dos lugares de `index.js` que escalan). Avisa, calla y
  anota su fila aunque el de "no entendí" ya haya anotado la suya (`anotarLeadUnaVez` con
  `pisa`). Uno que no calla no pisa a nadie: un tercer mensaje raro no vuelve a escalar.
- ~~**Fotos sin epígrafe en un canje**~~: decidido y hecho el 29/09/2026 (D1): en un canje en
  curso, la foto sin texto cuenta como "mandó fotos". Ver *Chats desde cero*.
- **Primer iPhone + entrega que cubre el contado + pregunta por la financiación** (Pendientes
  1, D3, sin tocar): "es mi primer iphone, tengo 900.000 para el 14 pro, como es la
  financiacion?" da explicación · PDF · `primerIphoneRetira` ("el 14 Pro lo sacás tranquilo
  con esos $900.000") · ficha ("lo sacás de contado, está $800.000"): las dos últimas dicen lo
  mismo, como pasaba con `puedeRetirar` antes de D3. ¿Se saca el monto de `primerIphoneRetira`
  en ese caso, o va la frase del primer iPhone a secas?
- **Direcciones en las notas:** `sinDatosPersonales` tapa nombre, teléfonos y mails, no
  direcciones, ni en las notas ni en el historial que ya va a Gemini. Filtro solo para
  notas, o general (ojo: la instrucción de `redactar` lleva la dirección del local).
- ~~**Dólares:** hoy es silencio total.~~ Decidido y hecho en el bloque 8: si pregunta si se
  aceptan, sin monto, `Sii, aceptamos dolares, se toma la cotizacion del dia`; con monto o para
  cotizar, escala callado. Ver *Respuestas fijas*.
- ~~**El XR y los anteriores al 11 que el bot ofrece solo** (bloque 8)~~: decidido y hecho en el
  bloque 10 (Tomás, 25/09/2026): se filtran en el código (`leerPlanilla`), no salen en nada que
  el bot ofrezca solo. Ver *Respuestas fijas*.
- **Pagar con tarjeta en cuotas por Mercado Pago** (bloque 8): no está decidido, escala callado
  como "otro medio de pago" (también está abierto en el Cortex, `negocio/medios-de-pago.md`).
- ~~**Primer iPhone con la explicación de la financiación** (bloque 3b)~~: resuelto en el
  bloque 4b, fundida con "te lo llevas" (`primerIphoneRetira`).
- **Cotizaciones que siguen sin explicación ni PDF** (bloque 3b): monto sin modelo ("con esa
  entrega el mejor que te llevas es el X"), recomendación con monto y la alternativa por
  entrega baja. Son 3 mensajes; con la explicación y el PDF serían 5. Si cotizan en cuotas, el
  "1 pago de" marca la financiación como explicada, así que después no se explica más. ¿Qué se
  saca?
- ~~**Financiar a quien puede pagar de contado**~~: decidido por Tomás y hecho en Ajustes 1b
  (16/09/2026). Si la entrega paga el equipo entero, solo "te lo llevas" y el precio de
  contado, sin explicación, PDF ni requisitos, salvo que pregunte cómo es la financiación. Ver
  *Paga de contado (Ajustes 1b)*.
- **Frases de "cuotas" que le siguen llegando a quien paga de contado** (Ajustes 1b, sin tocar):
  - repite el monto ya cotizado: una de las 2 variantes de `yaCotizado` dice "te llevas el 14
    Pro y el resto lo hacemos en cuotas";
  - suma otro modelo ("y el 15 pro?"): la rama de varios modelos cierra con "cual te gusta
    mas? asi te armo las cuotas", aunque el que ya tenía cotizado lo pague de contado.
- **Requisitos para quien paga de contado** (Ajustes 1b): si pregunta "que papeles piden?", se
  le contesta como a todos (solo dni y el compromiso de pago, con el PDF). ¿Es lo que corresponde
  a una venta de contado?
- **"cuanto sale y como son las cuotas? tengo 600.000" sin modelo en el chat** (Ajustes 1):
  no va por la tanda de 4 sino por "con esa entrega el mejor que te llevas es el X, esta $Y"
  (3 mensajes, sin explicación ni PDF, como en el pendiente de arriba).
- **Alternativa por entrega baja y el precio** (Ajustes 1): si en el paso 3 ("mira lo que sí
  te podés llevar") pregunta cuánto sale el modelo que no le entra, no se repite: ese precio
  ya se dijo en el paso 2, con el mínimo.

### Sin implementar

- **Lo que quedó de la re-medición desde cero (29/09/2026):**
  - el modelo pegado a la variante ("tengo el 17pro Max") no se lee en el texto: si Gemini no
    llena el canje, se le vuelven a pedir modelo, almacenamiento y batería (C32T3);
  - Gemini arrastra el modelo de la charla en mensajes que no lo nombran ("nono, vivo en Roca",
    "ahí le aviso entonces") y sale la ficha (C38T4, C80T3);
  - colores con el modelo ya dicho ("16 normal, color rosado") contesta "decime que modelo te
    interesa mas" (C55T4).

- ~~**Entrega mayor o igual al contado:** la cotización sale solo con "Contado", sin "1 pago"
  ni "2 pagos".~~ Resuelto en Ajustes 1: sale el precio con texto humano ("con eso lo pagas de
  contado, el iPhone 14 Pro esta $800.000"), y la regla global de `evaluar` lo acepta.
- **Audio ambiguo** (B5): pedir confirmación de montos o modelos cuando la transcripción no
  es clara. Es una decisión comercial; va a otro bloque.
- Anotado por Fran en el entrenador: cuando el modelo no está, él no escala — redirige
  (`justo 11 no tengo, contame que buscabas`) y explica la financiación. Hoy el bot escala.
- `.env.example` desactualizado: dice que un audio que no se entiende "pide que lo
  escriban" (ahora es silencio) y que un número personal sirve como destino de avisos (el
  candado solo admite grupos). Le faltan `MENSAJES_SIN_VENTA` y
  `SEGUIMIENTO_MAX_POR_BARRIDO`.
- Variables muertas en `config.js`: `AGRUPAR_CLIENTE_MS`, `DESCARTADOS_PATH` (`HOST` se usa
  desde el 15/09/2026).
  Sacarlas o usarlas.
- La regla de promesas no caza promesas sin nombre propio.
- `Avisame si puedo ir tipo 10`: detecta la hora pero pregunta el día; no infiere "hoy".
- Vistos en el bloque 10, sin tocar (no eran del bloque, o Tomás eligió dejarlos):
  - Sin Gemini, "me tomás un iphone 8?" solo no se lee como canje (el extractor local reconoce
    "canje", "parte de pago", "lo tomás", "tomás mi"…, no "me tomás un"): contesta "Ese no lo
    trabajamos, tenemos del 11 al 18 Pro Max". Con Gemini (permuta) o nombrando el canje, "a
    partir del 11". Decisión de Tomás del 25/09: no tocar la detección del canje.
  - "mañana me pego una vuelta" (con día): sin Gemini no es un turno (no está en `PIDE_TURNO`)
    y contesta "contame que estabas buscando". Sin día va la respuesta de los turnos (bloque 10).
  - En LEADS, `entrega_declarada` queda vacía con un monto en dólares (antes decía 420000, que
    estaba mal); el aviso al grupo sí dice `US$420`.
  - Frases del bot que siguen diciendo "alcanza" sobre la entrega: una variante de
    `pagaDeContado` (`src/estilo.js`): "con eso te alcanza para pagarlo de contado, el X sale
    $Y" (es para decirle que le alcanza, no que le falta). Con "falta" o "faltan" sobre la
    entrega, ninguna ("no hace falta tarjeta" es de los requisitos).
  - Un chat con un canje en curso de un anterior al 11, guardado antes del bloque 10, recibe
    "tomamos celulares a partir del 11" (y el canje se borra) con el próximo mensaje.
- Vistos en el bloque 9, sin tocar (no eran del bloque):
  - ~~**"con esos $X todavia no te alcanza para esos modelos"**~~: cambiada en el bloque 10 por
    "con los $X todavia no estamos para esos modelos" (decisión de Tomás del 25/09/2026).
  - Con el saludo del día, un "gracias" como primer mensaje de otro día recibe el saludo y
    "a vos!". Es la regla (el saludo va siempre que empieza una charla); queda anotado por
    si suena raro en vivo.
  - `web/simulador.html` y `web/entrenador.build.html` siguen armados con el código de antes
    (ver *Operativos*): no saludan como el bot.
- Vistos en el bloque 8 (todos arreglados en el bloque 10, 25/09/2026):
  - ~~`mencionaHora` (turnos) no conoce "de las 16" ni "cerca de las 14"~~: ahora sí; "cual de
    las dos" y "de las dos opciones" no son horas.
  - ~~Sin Gemini, "x?" o "13?" solos dan "contame que estabas buscando"~~: ahora son esos modelos.
  - ~~"tengo 420 dólares y el resto en pesos" se lee como $420.000 de entrega~~: ya no; sigue
    escalando callado y el aviso dice `US$420`.
  - ~~"me quedo con ese que me recomendaste" cae en "pide recomendación"~~: sigue con el que
    ofreció el bot, o escala callado si no se sabe cuál.
  - ~~Un canje de un iPhone 8 pide el almacenamiento y la batería del 8~~: solo "a partir del 11".
- Entrega, riesgo conocido: `quedé en 250` no se lee (no está en la lista de contexto) y
  dispara la guarda.
- Objeción de precio sin modelo en juego (`no llego a 700`, `es caro`): ofrece "otras
  opciones" con el techo en infinito, así que sugiere el equipo más caro de la lista.
- ~~`npm run simulador` no anda con Node 24~~: arreglado en el bloque 4 (`shell: true` solo en
  win32, con los argumentos entre comillas). Node avisa `DEP0190`; los argumentos son
  constantes del script.
- ~~`npm run resumen` y `npm run destino` pisan el estado real al salir~~: arreglado en el
  bloque 4 (guardar solo si hubo cambios, y los dos corren en modo solo lectura).
- `redis:latest` en `docker-compose.yml` sigue móvil. Evolution quedó fijada por digest (ver
  README, *Actualizar Evolution*).

### Operativos (fuera del código)

- **Chats viejos (29/09/2026): sembrar al reiniciar.** Frenar el bot → `npm run sembrar-viejos`
  (una sola vez; antes, `-- --simular` para ver los números) → arrancar. El log tiene que decir
  `CHATS VIEJOS: N en la lista, al día hasta DD/MM HH:MM`, y `/salud` lo mismo en
  `chatsViejos`. Prender `SOLO_CHATS_NUEVOS=true` en el `.env` lo decide Tomás.
- **Caída de Evolution (29/09/2026): reiniciar el bot** para que corra (frenar y arrancar, sin
  sembrar). La próxima vez que el guardián avise un corte: el log dice `CHATS VIEJOS: Evolution
  caído (…)`, `/salud` muestra `chatsViejos.estado: "atrasado"` y `alDia` en
  `data/chats-viejos.json` queda quieto hasta la vuelta; 2 minutos después del `✅`, `CHATS
  VIEJOS: N en la lista, al día hasta …` y la línea `[chats viejos] miré …` con la ventana.

- **Bloque 7 (23/09/2026): primer lote de ejemplos.** `npm run aprobar`, 30 ejemplos (unos 10
  minutos), y después `npm run evaluar -- --offline` para ver cuántos cumplen. Los que no, son
  la lista de reglas para el próximo bloque; los que sí, `npm run aprobar -- --fijar`.
- **Bloques 6 y 7: reiniciar el bot cuando vuelva WhatsApp** (desvinculado de Evolution desde
  el 22/09). El commit de `adf9eb5` y el archivo del registro viejo como
  `data/aprendizaje-v1.jsonl` ya están hechos. Desde el reinicio escribe
  `data/aprendizaje-v2.jsonl`, en escucha cada tanda espera 20 a 45 s y con el primer evento se
  crea `data/aprendizaje-sal` (**no borrarla**). Lo primero que conteste una persona en cada
  chat queda `'sin propuesta en memoria'` (la memoria arranca vacía). A los pocos días, `npm run
  aprender -- --todos` dice cuántos ejemplos quedan incompletos.

- **Prueba en vivo de Pendientes 2** desde el celular de prueba (reiniciar el bot antes): un
  seguimiento que se corta con `#reset` durante el "escribiendo…"; dos mensajes raros seguidos
  desde un número que el bot trata como borrador, que no tienen que escalar; y en `/salud`,
  `ultimoMensaje` y `ultimoEntrante` por separado. Los pasos están en el reporte de la sesión.
- **Guardián de Evolution (21/09/2026):** reiniciar el bot para que corra, y hacer la prueba:
  `/salud` antes y después, y un corte de prueba del control 2 bajando los plazos en el `.env`
  (`GUARDIAN_MIN=1`, `GUARDIAN_SIN_MENSAJES_MIN=2`), sin tocar Docker. No hace falta cargar
  nada en el `.env` para el uso normal: los tres valores tienen su valor por defecto. **La causa
  raíz de los cortes sigue sin diagnosticar** (lo hace Tomás, con PowerShell).
- ~~**Pasar `NUMEROS_PRUEBA` a `NUMEROS_TESTER` en el `.env`** (Pendientes 1)~~: hecho por
  Tomás. Cuando entren clientes piloto, van en `NUMEROS_PILOTO`.
- **Prueba en vivo de Pendientes 1** desde el celular de prueba (reiniciar el bot antes): "el
  más barato" + "dale ese"; un `#resset`; un `#reset` en el medio de una tanda; una entrega de
  $900.000 para el 14 Pro (tiene que salir solo la ficha).
- `npm run simulador`: `web/simulador.html` y `web/entrenador.build.html` están construidos
  con el código de antes de Pendientes 1 (`numerosPrueba`).
- **Nunca se probó un envío real.** Antes de pasar a borrador: `npm run destino`, y un
  mensaje de prueba al número propio con `NUMEROS_TESTER`.
- `GRUPO_AVISOS_JID`: se saca cuando alguien escribe en el grupo interno y el bot anota
  `[grupo] ...@g.us`. Verificar con `npm run destino`.
- Cargar la carpeta `fotos/` (una imagen por modelo, `13.jpg`, `14-pro.jpg`): desde el bloque
  8 son las fotos de referencia de la foto automática y de `#sinstock`. Sin ella, `#sinstock`
  contesta en el grupo que no hay foto de ese modelo.
- **Las fotos de los equipos del local (08/10/2026):** Tomás sube las fotos a `fotos/iPhone <modelo>/` (las
  subcarpetas ya están, de "iPhone 11" a "iPhone 18 Pro Max"; hoy están vacías) y Claude escribe
  `fotos/indice.json` mirando cada foto (el modelo y los colores de izquierda a derecha, con los nombres con
  que están cargados en la app). El bot lo relee solo, sin reiniciar. Hasta que haya índice, un pedido de
  fotos escala como hoy. Después, la prueba en vivo del PARA COPIAR Y PEGAR de esa sesión (foto sola, foto de
  dos, depósito, foto + escala) y la batería `--solo "Fotos de los equipos"` (118 a 120).
- **`GEMINI_MODEL` y `GEMINI_MODEL_RESPALDO` en el `.env`** (30/09/2026): pasarlos a
  `gemini-3.5-flash-lite` y `gemini-3.1-flash-lite` al reiniciar (lo hace Claude). Hasta
  entonces el `.env` tiene `gemini-2.5-flash-lite`, que Google limita a quienes ya lo usaban.
  Ver *Los modelos de Gemini*. El cupo gratuito de cada uno no se midió:
  https://ai.dev/rate-limit
- Habilitar facturación en Gemini (Tomás no tenía tarjeta). Sin eso el tier gratuito se
  agota: el bot cae al extractor local y deja de transcribir audios.
- ~~Cargar `Umbral_excepcion_pesos` / `Umbral_excepcion_pct` en CONFIG~~: desde el bloque 5 no
  se leen.
- Cargar la columna `Precio_cotizacion` en LISTA. Sin ella todo funciona igual.
- Refrescar `test/fixture-planilla.js` contra la planilla real: es del 08/09/2026 y le
  faltan modelos que la lista en vivo tiene (el iPhone 11).
- `data/estado.json` tiene una clave de diagnóstico, `gemini-check@s.whatsapp.net`, que no
  es un cliente. Desde Ajustes 1 no sale en ningún bloque del resumen; se puede borrar.
- **Lo que cita el cliente** (08/10/2026): la forma de un producto del catálogo citado (`productMessage.product.title`,
  `.description`, `priceAmount1000`) sale del proto de WhatsApp y no se vio en un payload real. En la prueba en vivo,
  responder citando un producto del catálogo y mirar que la línea del historial diga `[responde a: <el título>]`; si
  no, ver el webhook de ese mensaje (ver *Lo que cita el cliente*).

## Reparto de modelos (gestión de tokens)

Configurado en `.claude/settings.json` y `.claude/agents/` con los IDs completos (`claude-sonnet-5-5`, `claude-opus-5-5`, `claude-haiku-5-5`): el 09/10/2026 los alias `sonnet` y `haiku` resolvían a `claude-sonnet-5` y `claude-haiku-4-5-20251001` (medido con `modelUsage`), por eso no se usan alias. Fable 5 no se usa. En el selector del panel de VS Code va Sonnet 5.5: si se elige otro ahí, pisa al de `settings.json`.

- **Sesión principal: Sonnet 5.5 (`claude-sonnet-5-5`), effort high.** Planifica, decide y escribe el código.
- **Advisor: Opus 5.5** (`advisorModel`: `claude-opus-5-5`). Consultalo antes de comprometerte con un plan no trivial, cuando un error se repite y antes de dar una tarea por terminada. No lo uses para trabajo rutinario.
- **Subagentes:**
  - `explorer` (Haiku 5.5, `claude-haiku-5-5`, medium): búsquedas en el código. Usalo en lugar del Explore integrado, que hereda el modelo principal.
  - `researcher` (Haiku 5.5, `claude-haiku-5-5`, medium): documentación y specs externas.
  - `worker` (Sonnet 5.5, `claude-sonnet-5-5`, medium): cambios acotados con tests, para paralelizar partes independientes de un plan ya decidido.
- Delegá la lectura masiva a Haiku y pedí conclusiones, no volcados de archivos. Lanzá en paralelo las búsquedas independientes.
