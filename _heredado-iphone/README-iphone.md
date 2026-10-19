# Bot de WhatsApp — Somos iPhone NQN

Contesta consultas de venta en WhatsApp: confirma stock, da el precio de contado,
explica la financiación, pide cuánto tiene el cliente para la entrega y cotiza.
Cuando hay permuta, el cliente acepta, o pide turno, avisa a Tomi y Fran y se corre.

**Los precios NUNCA los inventa un modelo de IA.** Salen de la planilla
*Cotizador - Somos iPhone NQN* y los calcula el código. Gemini se usa solo para
entender lo que escribe el cliente y para redactar lo que no lleva números.

---

## Cómo está armado

```
WhatsApp
   │
   ▼
Evolution API (Docker, puerto 8080)  ──► Postgres + Redis
   │  webhook
   ▼
Este bot (Node, puerto 3001)
   ├─► Google Sheets  (precios y LEADS)
   ├─► Gemini Flash   (entender el mensaje — tier gratuito)
   └─► Evolution API  (responder + avisar al grupo)
```

Todo corre en la misma PC. Costo mensual: **$0**.

---

## Instalación (Windows, una sola vez)

### 1. Programas

- **Docker Desktop** — https://www.docker.com/products/docker-desktop
- **Node.js 20 o superior** — https://nodejs.org

Con 16GB de RAM sobra: Evolution + Postgres + Redis usan cerca de 1,5GB.

### 2. Credenciales de Google (para leer la planilla)

1. Entrá a https://console.cloud.google.com y creá un proyecto.
2. **APIs y servicios → Biblioteca**, buscá **Google Sheets API** y activala.
3. **Credenciales → Crear credenciales → Cuenta de servicio**. Ponele cualquier nombre.
4. Entrá a la cuenta creada → pestaña **Claves** → **Agregar clave → Crear nueva → JSON**.
5. Guardá el archivo descargado en esta carpeta con el nombre **`credenciales.json`**.
6. Abrí ese archivo, copiá el valor de `client_email` (termina en `.iam.gserviceaccount.com`).
7. En la planilla del Cotizador: **Compartir** → pegá ese mail → permiso de **Editor**.

Sin el paso 7 no funciona. La cuenta de servicio es un usuario más.

### 3. Clave de Gemini (gratis, sin tarjeta)

Entrá a https://aistudio.google.com/apikey y creá una.

> **El cupo gratuito es más chico de lo que parece y se cuenta por modelo.**
> Medido en septiembre de 2026 contra la API, `gemini-2.5-flash` daba
> **20 pedidos por día**; los Flash-Lite tienen bastante más. Si igual se agota,
> **el bot no se cae**: pasa al modelo de respaldo, que tiene su propio cupo, y si
> ese tampoco responde entiende con el extractor local, que saca modelo y monto
> sin IA. Se nota en que capta menos matices, no en que deje de cotizar.
>
> Para ver el cupo de tu clave: https://ai.dev/rate-limit
>
> **Modelos (decisión del 30/09/2026, con las páginas de precios y de bajas de Google de
> ese día):**
>
> | Modelo | Entrada / salida por millón de tokens | Baja |
> |---|---|---|
> | `gemini-3.5-flash-lite` (principal, `GEMINI_MODEL`) | US$0,30 / US$2,50 | sin fecha |
> | `gemini-3.1-flash-lite` (respaldo, `GEMINI_MODEL_RESPALDO`) | US$0,25 / US$1,50 (audio US$0,50) | 07/05/2027 |
> | `gemini-2.5-flash-lite` | — | sin fecha, pero Google lo limita a quienes ya lo usaban |
>
> Al respaldo se pasa si el principal está saturado, no responde, no existe (404) o se
> quedó sin cupo del día (429 por día): un solo intento. Cuando Google retire uno, el
> cambio es de `.env`, no de código.

> Tené presente: en el tier gratuito Google puede usar los datos para entrenar
> sus modelos. Por eso, antes de salir de esta PC, se tachan el nombre del
> cliente, su teléfono y su mail. Lo que sí viaja es el texto de la consulta y
> las últimas líneas del chat, que es lo que hace falta para entender a qué
> modelo se refiere cuando escribe "y ese cuánto sale?". Los montos no se
> tachan, porque son justo lo que hay que entender. Está probado en
> `test/gemini.test.js`.

### 4. Configurar

```powershell
copy .env.example .env
```

Abrí el `.env` y completá:

- `EVOLUTION_APIKEY` — inventá una clave larga (la misma va en el paso 5)
- `GEMINI_API_KEY` — la del paso 3
- `SHEET_ID` — ya viene puesto
- `GRUPO_AVISOS_JID` — se completa en el paso 7

### 5. Levantar Evolution API

Creá un archivo `.env.docker` con dos líneas (y después `WEBHOOK_SECRETO`, ver
*Secreto del webhook y HOST*):

```
EVOLUTION_APIKEY=la-misma-clave-larga-del-paso-4
POSTGRES_PASSWORD=otra-clave-cualquiera
```

Y arrancá:

```powershell
docker compose --env-file .env.docker up -d
```

Verificá que esté vivo entrando a http://localhost:8080

### 6. Conectar el WhatsApp del negocio

1. Abrí http://localhost:8080/manager
2. Entrá con la `EVOLUTION_APIKEY`.
3. Creá una instancia llamada exactamente **`somosiphone`**.
4. Escaneá el QR desde el WhatsApp del negocio: **Dispositivos vinculados → Vincular dispositivo**.

El celular puede quedar sin internet un rato, pero si pasan muchos días sin
conectarse WhatsApp cierra la sesión y hay que reescanear.

### 7. Sacar el ID del grupo interno

Con el WhatsApp ya conectado, abrí en el navegador:

```
http://localhost:8080/group/fetchAllGroups/somosiphone?getParticipants=false
```

(pide la apikey en el header; desde el manager se ve más fácil). Buscá el grupo
tuyo con Fran y copiá su `id` — termina en `@g.us`. Pegalo en `GRUPO_AVISOS_JID`.

### 8. Instalar y probar

```powershell
npm install
npm test                  # cotizador, filtro de datos personales y webhook
npm run probar-planilla   # verifica que lea precios de verdad
npm start
```

`npm run probar-planilla` tiene que listar tus modelos con sus precios. Si eso
no anda, no sigas: el bot no puede cotizar.

---

## Probar el bot conversando (no hace falta Docker ni WhatsApp)

Esto es lo primero que conviene hacer. Solo necesitás Node instalado.

```powershell
npm install
npm run chatear -- --offline
```

Se abre un chat en la consola: escribís como si fueras un cliente y ves exactamente
lo que el bot contestaría, mensaje por mensaje, y cuándo avisaría al grupo.

- `--offline` usa una copia congelada de los precios, así no necesitás credenciales
  de Google. **Los precios reales salen siempre de la planilla en vivo**: para probar
  con esos, corré `npm run chatear` a secas (necesita `credenciales.json`).
- Sin `GEMINI_API_KEY` en el `.env`, el bot usa un extractor propio sin IA. Entiende
  menos matices, pero alcanza para ver el flujo. Con la clave puesta, entiende mucho
  mejor los mensajes reales.

Dentro del chat: `/nuevo` empieza de cero, `/estado` muestra qué entendió el bot,
`/salir` termina.

### Conversaciones de prueba automáticas

```powershell
npm run guion -- --offline
```

Corre siete conversaciones sacadas del corpus real y muestra las respuestas de una:
consulta simple, entrega por debajo del mínimo, permuta, modelo no cargado, cliente
que acepta, consulta general y postventa. Es la forma rápida de ver si algo se rompió
después de tocar el prompt o la planilla.

Con `-- --solo 3` corre solo el tercero.

### La evaluación completa

```powershell
npm run evaluar -- --offline
```

Corre **119 conversaciones** sacadas del corpus (193 turnos) y le pone nota al bot.
Además de las comprobaciones de cada caso, aplica **reglas globales** a toda respuesta:
que no hable como call center, que no trate de usted, que la cotización lleve
1 pago + 2 pagos sin el precio de contado (el precio se dice solo si el cliente lo
pregunta), que no mande un precio suelto, que no prometa horarios ni
descuentos, que no ofrezca más de 2 cuotas, que escriba en minúscula y que no mande
parrafadas.

Agregá `-v` para ver cada conversación entera. Si tocás el prompt o la lógica, corré
esto antes y después: es lo que evita que arreglar una cosa rompa otra.

Al final avisa **con qué entendió cada turno**. Si dice que hubo turnos entendidos
por el extractor local habiendo clave de Gemini, quiere decir que el cupo se agotó y
que esos turnos **no probaron el camino de Gemini**, aunque la nota diga 100%.

---

## Fotos de los equipos

Cread una carpeta `fotos/` en el proyecto (o poné la ruta en `FOTOS_DIR` del `.env`)
con una imagen por modelo, nombrada como el modelo sin la palabra iPhone:

```
fotos/
  13.jpg
  13-pro.jpg
  14 pro max.png
  15_pro.jpeg
```

Cuando el cliente elige un modelo, el bot manda esa foto antes de hablar de plata.
**Si no hay foto para ese modelo, no la menciona** — nunca promete algo que no va a
mandar. Podés ir agregando fotos de a poco: los modelos que ya tengan foto la usan.

---

## Modo escucha — el primer paso, sin riesgo

Poné en el `.env`:

```
MODO_ESCUCHA=true
```

Con eso el bot **no manda un solo mensaje**. Ni al cliente ni al grupo. Solo lee las
conversaciones reales, calcula qué habría contestado, y lo guarda junto a lo que
contestaron ustedes de verdad. Después:

```powershell
npm run aprender
```

Es el modo para arrancar: no expone el número (nunca escribe) y en una semana te junta
más casos reales que un mes de pruebas inventadas.

Lo guarda en `data/aprendizaje-v2.jsonl`: un evento por cada mensaje del cliente, por cada
propuesta del bot y por cada mensaje de ustedes. `npm run aprender` arma los ejemplos: una
respuesta de ustedes entera, con lo que había propuesto el bot para esa misma tanda. Si
contestan mientras el bot todavía está interpretando, el ejemplo sale marcado como
incompleto. En escucha el bot espera 20 a 45 segundos antes de interpretar, igual que en vivo,
así compara lo mismo.

El registro de antes del 23/09/2026 (`data/aprendizaje.jsonl`) mezclaba turnos y quedó archivado
tal cual como `data/aprendizaje-v1.jsonl` (ya está hecho).

Para verlo como antes: `npm run aprender -- --archivo data/aprendizaje-v1.jsonl`.

Para ver cómo contestaría **hoy** el bot a esos mensajes reales, sin esperar otra semana de
escucha:

```powershell
npm run reproducir
```

Muestra un resumen con cantidades y deja los 30 casos más distintos en
`data/reproduccion-AAAA-MM-DD.md`. No sale a la red ni manda nada. Con `--gemini --si` usa
Gemini de verdad: les manda a Google los mensajes de los clientes y cuesta tokens.

### Aprobar ejemplos

Para decidir cuáles de esas respuestas valen, de a una:

```powershell
npm run aprobar                    # de a uno, primero los más distintos de lo que iba a decir el bot
npm run aprobar -- --contar        # cuántos hay por revisar, sin preguntar nada
npm run aprobar -- --fuente v1     # solo el registro viejo (o v2, solo el nuevo)
npm run evaluar -- --offline       # cuántos cumple hoy el bot ("Ejemplos aprobados: ...")
npm run aprobar -- --fijar         # marca los que el bot ya cumple
npm run aprobar -- --revisar <id>  # volver a decidir uno
```

Por cada uno pregunta si la respuesta es buena, una excepción, un dato desactualizado, si
faltó contexto o si no se usa (`s` saltea y `q` sale; lo decidido ya quedó guardado). Con una
buena, qué tenía que hacer el bot (contestar, con o sin precio; escalar callado; no decir
nada) y qué no puede decir. Queda en `test/ejemplos-aprobados.json`, que va en git: sin
teléfonos ni mails, y con los montos de ustedes como `[monto]` (el monto lo calcula el
cotizador). Uno con un DNI o una `@` no se puede aprobar.

Cada buena es un caso que `npm run evaluar` corre aparte. **El bot no cambia solo:** si no la
cumple, queda pendiente hasta que se escriba la regla que falta, en otro bloque. Las que ya
cumple se marcan con `--fijar`, y desde ahí `evaluar` avisa en rojo si vuelven a fallar.

El registro guarda una clave por chat con una sal local (`data/aprendizaje-sal`, la crea el
bot con su primer mensaje). **No la borren**: sin ella los chats nuevos no se pueden agrupar con
los de antes.

---

## Modo borrador — no lo saltees

El `.env` viene con `MODO_BORRADOR=true`. Con eso el bot **no le escribe nada a
los clientes**: manda al grupo interno lo que habría contestado.

> **Sin `GRUPO_AVISOS_JID` completo, este modo no sirve para nada**: los
> borradores salen por la consola del bot y no llegan a WhatsApp. Lo mismo pasa
> con cada escalada. Completalo antes (paso 7), o vas a estar mirando una
> pantalla en blanco creyendo que el bot no hace nada. Al arrancar, `npm start`
> avisa si falta.

Dejalo así una semana. Vas a ver en el grupo cada respuesta que habría dado y
podés corregir el prompt sin haber quemado un solo cliente.

Cuando estés conforme: `MODO_BORRADOR=false` y reiniciás con `npm start`.

---

## Uso diario

- **Al cambiar precios**: actualizá la planilla y `Fecha_ultima_lista` en CONFIG.
  El bot relee cada 5 minutos. Si la lista queda vencida, deja de cotizar y avisa.
- **Para que el bot se calle en un chat**: escribile `#pausa` en ese chat desde el
  WhatsApp del negocio. Para que vuelva, `#sigue`.
- **Si contestás vos primero**, el bot se calla solo en ese chat por 45 minutos. Y si dejaste algo
  dicho ("ahi te confirmo", "mañana entran los 13", un precio, un turno o una reserva con ese
  cliente), en las 72 horas siguientes el bot no contesta lo que siga eso: lo pasa al grupo con
  tu frase (`🔕 SIN RESPUESTA`). Si el cliente pregunta otra cosa, contesta normal.
- **Apagar o prender a Chiara sin la app**: en el grupo interno, `#apagar` hace lo mismo que el
  botón del panel (no le contesta a ningún cliente, sigue leyendo) y `#prender` la vuelve a prender.
  Contesta en el grupo y queda guardado aunque se reinicie el bot.
- **Qué lista de usados usa el bot**: en el grupo interno, `#bateria 85-93` hace que los usados
  salgan de la pestaña `LISTA 85-93` (los sellados y el resto siguen de `LISTA`); `#bateria 100`
  vuelve a `LISTA`; `#bateria` solo dice cuál está activa. Queda guardado aunque se reinicie el
  bot. Si la pestaña no existe o está vacía, no cambia nada y lo dice; si deja de poder leerse,
  el bot cotiza con `LISTA` y avisa una vez al grupo. La batería que dice el bot es la de la
  columna `Bateria_min` tal cual ("85-93%"), y los sellados dicen "sellado".
- **El resumen de la mañana** (`RESUMEN_ACTIVO=true`; para verlo sin mandarlo,
  `npm run resumen`), en este orden:
  1. **📅 Turnos de ayer (N)**: un renglón por chat con nombre, modelo y `wa.me`.
     Sale de lo que se ve en el chat: un mensaje de ayer como "nos vemos hoy", "te
     esperamos", "estamos afuera", "ya llegué", "te paso el alias", "hoy a las 18" o
     "te anoto para las 16", o uno de anteayer como "nos vemos mañana" o "te anoto
     para mañana a las 17". Es una guía, no ventas confirmadas: puede haber un
     encuentro que no terminó en venta. Si no hubo, dice "📅 Ayer no hubo turnos
     anotados en el chat". El bot guarda las últimas 15 líneas de cada chat: si
     después del turno se habló mucho, ese turno puede no aparecer.
  2. **📊 Vendidos y perdidos de ayer**: solo si alguien anotó `#vendido` o
     `#perdido` ese día. Si no, no sale nada.
  3. **Los chats para mirar**: para cerrar, te están esperando, escribieron y nadie
     contestó, y para reactivar.

  El tester (`NUMEROS_TESTER`), los contactos personales y los chats sin número
  (como `gemini-check`) no salen en ningún bloque; los clientes piloto
  (`NUMEROS_PILOTO`) sí. No se borran de `data/estado.json`.
- **Estado del sistema**: http://localhost:3001/salud — WhatsApp, la lista de
  precios (y de qué pestaña salen los usados: `listaBateria`), el modo en que está contestando de verdad, si el webhook tiene secreto
  (nunca el valor), el commit y la hora de arranque, la hora del último mensaje
  que llegó y cuántos mensajes repetidos descartó desde que arrancó. Sin datos de
  clientes.
- **Mensajes repetidos**: si Evolution entrega dos veces el mismo mensaje, el bot
  lo reconoce por su id y contesta una sola vez. Se acuerda de los últimos 30
  minutos, también después de reiniciar.
- **La memoria del bot** está en `data/estado.json`. Se escribe de forma atómica
  (primero `estado.json.tmp`, después se renombra) y solo cuando hay cambios. Si
  al arrancar el archivo está dañado, el bot lo aparta tal cual en
  `data/estado.json.corrupto-<fecha>`, arranca sin memoria y lo avisa una vez al
  grupo interno. `npm run resumen` y `npm run destino` solo leen: nunca escriben
  ese archivo (`ESTADO_SOLO_LECTURA=1`, lo ponen ellos solos).

---

## Secreto del webhook y HOST

Evolution le avisa al bot cada mensaje nuevo con un POST a `WEBHOOK_GLOBAL_URL`
(en `docker-compose.yml`). Para ponerle secreto:

1. Generá uno: `node -e "console.log(require('crypto').randomBytes(24).toString('hex'))"`.
2. Ponelo en **los dos** archivos: `WEBHOOK_SECRETO=<secreto>` en `.env` y en `.env.docker`.
3. En `docker-compose.yml`:
   `WEBHOOK_GLOBAL_URL=http://host.docker.internal:3001/webhook/${WEBHOOK_SECRETO}`.
4. Verificá que la URL quede con el secreto al final (y no en `/webhook/`):
   `docker compose --env-file .env.docker config | findstr WEBHOOK_GLOBAL_URL`.
5. Recreá solo Evolution: `docker compose --env-file .env.docker up -d --no-deps evolution-api`.
6. Reiniciá el bot. Al arrancar ya no tiene que decir `WEBHOOK SIN SECRETO`.
7. Mandá un mensaje de prueba y mirá que `ultimoMensaje` se actualice en `/salud`.

Mientras el bot no tiene secreto, acepta también `/webhook/<lo que sea>`: por eso
Evolution se cambia antes (paso 5) que el bot (paso 6), y no se pierde nada. En el
reinicio del bot, Evolution reintenta lo que no pudo entregar. **Ojo:** Evolution no
reintenta un 401; si la URL queda sin el secreto, esos mensajes se pierden.

Para volver atrás: vaciá `WEBHOOK_SECRETO` en el `.env` y reiniciá el bot. La URL de
Evolution puede quedar con el secreto.

**HOST:** vacío escucha en todas las interfaces. Para probar solo esta PC, poné
`HOST=127.0.0.1` en el `.env`, reiniciá el bot y mandá un mensaje de prueba. Si
`ultimoMensaje` no se actualiza, Evolution no llega por 127.0.0.1: vaciá `HOST` y
reiniciá.

---

## Actualizar Evolution

`docker-compose.yml` fija la imagen de Evolution **por digest** (desde el 16/09/2026):

```
image: evoapicloud/evolution-api@sha256:966625532d9076a2381e973a271307d107e6f070450de3abeeea8bd18be07252
```

Es exactamente la que corría ese día (la API decía `2.3.7`). Así, recrear el
contenedor no trae una versión distinta sin que nadie lo decida. Para saber qué
corre hoy, sin tocar nada:

```powershell
docker inspect evolution_api --format "{{.Image}}"
curl http://localhost:8080/
```

**Para actualizar a propósito:**

1. Elegí la versión en https://github.com/EvolutionAPI/evolution-api/releases y
   averiguá su digest sin bajarla: `docker buildx imagetools inspect evoapicloud/evolution-api:v2.3.8`
   (la línea `Digest:`).
2. Anotá la línea `image:` actual en algún lado (es la forma de volver).
3. Cambiá **solo** esa línea por `evoapicloud/evolution-api:v2.3.8@sha256:<digest>`.
4. `docker compose --env-file .env.docker pull evolution-api`, y después
   `docker compose --env-file .env.docker up -d --no-deps evolution-api`.
5. Verificá: http://localhost:8080 tiene que decir la versión nueva, el WhatsApp
   tiene que seguir conectado (si no, volver a leer el QR: paso 6 de la
   instalación) y un mensaje de prueba tiene que mover `ultimoMensaje` en `/salud`.

**Para volver atrás:** poné de nuevo la línea `image:` anterior y repetí el
paso 4. La imagen vieja sigue en la PC hasta que alguien haga `docker image prune`.

`redis:latest` y `postgres:15` quedaron como estaban. Cambiar la versión de
Postgres sin migrar los datos puede romper la base de Evolution: no se toca a la
ligera.

---

## Precios de TechSur → panel Cotización (01/10/2026)

El bot lee el grupo **Avisos** de la comunidad TechSur, donde el proveedor publica lo que tiene, y
guarda cada equipo con precio en la tabla `precios_proveedor` de la app de ventas (migración 0010).
La app los muestra en el panel **Cotización**, con buscador. Al grupo no le escribe nunca y no usa
Gemini: los avisos se leen con reglas (`src/techsur.js`, probado en `test/techsur.test.js` con los
avisos reales).

- Lee usados con baterías por color, el listado de sellados, el texto de las fotos
  ("IPhone 16 Pro 128GB 89% $760usd") y otros productos ("PS5 Física 1Tb", "1U x $815USD").
  Lo que no trae precio en dólares no se guarda.
- El grupo se encuentra solo por el nombre; al encontrarlo la consola dice
  `[techsur] grupo encontrado: ...`. Si no aparece, `npm run techsur -- --grupos` lista los grupos
  con su JID para ponerlo en `TECHSUR_GRUPO_JID`.
- Cada aviso queda en `data/techsur.jsonl`. `npm run techsur` muestra cómo se leyeron los últimos;
  `npm run techsur -- --probar "texto"` prueba uno pegado; `npm run techsur -- --recargar` vuelve a
  guardar los de los últimos 7 días (no duplica).
- Necesita `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (los de la app de ventas) en el `.env`.
  `TECHSUR_ACTIVO=false` lo apaga.

---

## El stock de la app en la planilla (08/10/2026)

La planilla del Cotizador es donde vive todo: la app de ventas la cambia por medio del bot y Chiara la sigue
leyendo. Con `STOCK_APP_MODO` en el `.env` (apagado por defecto; cambiarlo pide reiniciar):

- `sombra`: cada 1 minuto el bot lee lo del local de la app (`v_stock_chiara`, migración 0018) y lo escribe en una
  pestaña aparte, **USADOS APP** (la crea si falta), para compararla con USADOS en el Drive; aplica los pedidos de
  la app en la columna **STOCK** de LISTA y LISTA 85-93 (SI / NO) y copia STOCK a la app. Chiara contesta como
  siempre.
- `vivo`: escribe USADOS de verdad y Chiara usa lo nuevo: ofrece primero lo del local; lo que no está en el local
  pero sí en LISTA con STOCK distinto de NO lo ofrece como del depósito ("te lo tengo mañana", o "el lunes" de
  viernes a domingo); nunca nombra a TechSur; al escalar un turno el aviso trae el código del equipo.

Antes de `vivo`, sumá una columna con el encabezado `STOCK` en LISTA y en LISTA 85-93 (en la fila de los
encabezados, después de Notas). Necesita `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY`. `/salud` lo muestra en
`stockApp`. Ver `CLAUDE.md`, *El stock de la app en la planilla*.

---

## Cerebro Sonnet en sombra (01/10/2026)

Fase 1 de que **Claude Sonnet 5.5 decida qué contestar**. En sombra, con cada tanda real Sonnet
piensa qué contestaría y queda anotado, pero **no se manda nada**: el cliente y el grupo reciben
exactamente lo mismo que con la sombra apagada. Sirve para comparar con los chats reales antes de
ponerlo en vivo.

**Para prenderla**, en el `.env` (la clave sale de platform.claude.com, *API keys*):

```
ANTHROPIC_API_KEY=sk-ant-...
CEREBRO_MODO=sombra
```

y reiniciar el bot. `CEREBRO_MODO=apagado` (o sacar la línea) la apaga: con `apagado` no se llama
nunca a la API.

- **Dónde queda:** cada tanda deja en `data/aprendizaje-v2.jsonl` un evento `propuesta-sonnet`
  con el mismo `tanda` que la `propuesta` del bot: lo que mandaría, si escalaría y por qué, si la
  guardia del código lo frenó, los montos que le dieron las herramientas, los tokens, los USD
  estimados y cuánto tardó. Un error de la API queda anotado y nada más.
- **Cuánto gasta:** `/salud` muestra `cerebro: { modo, llamadasHoy, usdHoy, chatsConSonnet }` (en memoria: un
  reinicio lo vuelve a 0). El tope de USD 60 por mes está puesto en la cuenta de Anthropic; si se
  llega, la API da error, se anota, y el bot sigue igual. `CEREBRO_ESFUERZO=low` lo abarata.
- **Repetir chats reales:** `npm run sombra -- --desde 2026-09-30 --max 20` pasa tandas del
  registro por Sonnet (con la clave del `.env`: **gasta**) y deja `data/sombra-AAAA-MM-DD.md` con lo
  que escribió el cliente, lo que contestó el bot, lo que contestaría Sonnet, la guardia, los tokens
  y los USD. Precios de la copia congelada; `--planilla-en-vivo` usa la de hoy (solo lectura).

### Sonnet contestando de verdad (fase 2, 02/10/2026)

`CEREBRO_MODO` dice a quién le contesta Sonnet. Se cambia en el `.env` y **se reinicia el bot**
(`Ctrl+C` y `npm start`):

| `CEREBRO_MODO=` | Le contesta Sonnet | Al resto |
|---|---|---|
| `apagado` | a nadie (no se llama nunca a la API) | el bot de siempre |
| `sombra` | a nadie, salvo los chats que ya marcó (ver abajo) | el bot, y Sonnet anota lo que contestaría |
| `tester` | al celular de `NUMEROS_TESTER` | el bot, y Sonnet en sombra |
| `nuevos` | al tester y a los **chats nuevos** (gente que escribe por primera vez) | el bot, y Sonnet en sombra |
| `todos` | a todos los que contesta el bot | — |

El orden recomendado: `tester` (probar desde el celular de prueba), después `nuevos`, y recién
después `todos`. Para volver atrás, `sombra` o `apagado`.

- **Un chat nuevo queda de Sonnet:** con `nuevos`, el chat de alguien que escribe por primera vez
  queda marcado y lo sigue atendiendo Sonnet **aunque después cambies el modo** (también con
  `sombra`), hasta `#reset` o `#bot <número>`. **Solo `apagado` corta a todos.**
- **Cada respuesta avisa en el grupo:** `🤖 Sonnet → Lucía · leí 12 mensajes de contexto · <lo que
  le mandó> · wa.me/…`. Con `todos`, en vez de eso, un resumen por hora. Si escala, el 🔕 de
  siempre, con el motivo de Sonnet. Si la API falla, contesta el bot de siempre y avisa una vez:
  `⚠️ Sonnet no responde (…): contesta el bot de siempre`.
- **Desde el grupo** (con el número del cliente, como `#sigue`):
  - `#sonnet 5492990000000`: qué le contestaría Sonnet a ese chat ahora. No le manda nada al
    cliente.
  - `#comparar 5492990000000`: las últimas 3 tandas, con lo que contestó el bot o una persona y lo
    que hubiera contestado Sonnet.
  - `#bot 5492990000000` / `#sonnet-si 5492990000000`: sacar o poner ese chat a mano.
- **La batería de pruebas:** `npm run bateria-cerebro` corre 53 conversaciones (148 turnos) con
  todo lo que fue marcando Tomás contra la API de verdad (**gasta**: unos US$1 a 2 la corrida
  entera) y deja `data/bateria-cerebro-AAAA-MM-DD.md` con ✓/✗ por turno. `-- --solo Jazz` corre
  solo los casos que dicen "Jazz"; `-- --max 5`, los primeros 5.

---

## Cosas a tener en cuenta

**El riesgo de baneo es real.** Evolution API usa Baileys, que no es oficial.
Está conectado al número del negocio. Las defensas que ya trae el bot:

- Nunca contesta antes de 20-45 segundos.
- Máximo 4 mensajes por tanda, con pausa entre uno y otro.
- No escribe en grupos, difusiones ni estados.
- No inicia conversaciones: solo responde a quien escribe primero.
- El único mensaje que inicia es el seguimiento, y tiene dos topes: **como
  mucho 2 por barrido** (`SEGUIMIENTO_MAX_POR_BARRIDO`) y **solo a charlas de
  menos de 24 horas** (`SEGUIMIENTO_MAX_HORAS`). Sin esos topes, el día que
  apagás `MODO_BORRADOR` el bot le escribiría de golpe a todos los chats
  acumulados, que es justo el patrón por el que banean un número.
- **El webhook pide un secreto** (`WEBHOOK_SECRETO`). El webhook ordena mandar
  mensajes por el WhatsApp del negocio: sin secreto, cualquiera que llegue al
  puerto 3001 (por ejemplo, desde el mismo wifi) puede hacer hablar al bot. Con
  el secreto puesto, el bot solo acepta `POST /webhook/<secreto>` y responde 401
  a todo lo demás. Sin secreto acepta `/webhook` como siempre y lo avisa bien
  grande al arrancar. Ver *Secreto del webhook y HOST*.
- **Dónde escucha:** con `HOST` vacío (lo normal), en todas las interfaces. Con
  `HOST=127.0.0.1`, solo en esta PC, pero hay que probar que Evolution siga
  llegando desde Docker.

Aun así, tené a mano un número de respaldo y las conversaciones exportadas.

**Si se corta la luz o se reinicia la PC**, hay que volver a levantar Docker
(`docker compose --env-file .env.docker up -d`) y el bot (`npm start`).
Docker Desktop se puede configurar para arrancar solo con Windows.

**Si dejan de llegar los mensajes**, el guardián de Evolution (`src/guardian.js`)
avisa al grupo interno, una vez por corte y otra cuando vuelve. Mira cada 5
minutos (`GUARDIAN_MIN`) dos cosas: que la instancia de Evolution diga `open`, y
que en horario comercial no pasen 45 minutos (`GUARDIAN_SIN_MENSAJES_MIN`) sin
que llegue ningún mensaje. **No reinicia nada**: avisa, y una persona mira
Docker. En `MODO_ESCUCHA` no sale ningún aviso; el corte se ve en la consola
(`[guardian]`) y en `/salud` (`estadoInstancia`, `guardianAvisoActivo`). Ojo: el
aviso viaja por la misma Evolution que está fallando, así que con la instancia
caída puede que el ⚠️ no salga y llegue solo el ✅ de cuando vuelve, con cuánto
duró.

**Lo que el bot nunca hace**: cotizar permutas, negociar el mínimo de entrega,
dar descuentos, prometer horarios, o dar un precio de un modelo que no esté
cargado en la planilla. Todo eso lo escala.
