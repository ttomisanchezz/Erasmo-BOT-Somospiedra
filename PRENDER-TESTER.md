# Cómo prender a Erasmo en modo tester

Modo tester: Erasmo le contesta (con Sonnet y las herramientas de verdad: precios del panel, catálogo, seguimiento) **solo** al número tester **299 429-5806** (`5492994295806`). A todos los demás los escucha y los guarda, pero **no les contesta ni llama a la API** (no gasta nada). Nada sale a clientes reales.

Nada de esto lo hizo Claude: el `.env`, el reinicio y el bot de iPhone son tuyos.

## 0. Antes de probar: Chiara (el bot de iPhone)

Los dos bots comparten la PC y Evolution. Si Chiara ve el número de Somos Piedra como un cliente más, **le contesta a Erasmo**. Antes de probar:

1. En el `.env` del **bot de iPhone**, agregá el número de Somos Piedra a `CONTACTOS_PERSONALES` (coma entre números, con o sin el 9).
2. Reiniciá el bot de iPhone.

Erasmo no toca el bot de iPhone.

## 1. El id del grupo "Bot Erasmo"

En `E:\bot-piedra` (con el bot de Piedra, o sin él: solo lee):

```
npm run grupos
```

Lista nombre + id de los grupos de la instancia `somospiedra`. Copiá el id del grupo **Bot Erasmo** (termina en `@g.us`).

## 2. El `.env` de Erasmo (`E:\bot-piedra\.env`)

```
CEREBRO_MODO=tester
NUMEROS_TESTER=5492994295806
GRUPO_AVISOS_JID=<el id del paso 1>

# Los precios salen del panel con el usuario de Erasmo (rol bot, solo lectura):
SUPABASE_URL=<la URL del proyecto, https://….supabase.co>
SUPABASE_ANON_KEY=<la anon key>
ERASMO_EMAIL=erasmo@bot.com
ERASMO_PASSWORD=<la contraseña de Erasmo>

# Sin estas dos el tester no recibe nada (MODO_BORRADOR vale true si falta en el .env: el borrador iría solo al grupo):
MODO_BORRADOR=false
MODO_ESCUCHA=false
```

Revisá también que estén **vacías o sin poner**: `NUMEROS_PILOTO`, `SOLO_CHATS_NUEVOS`, `CEREBRO_SOMBRA_PERSONA_HASTA`; y que el número tester **no** esté en `CONTACTOS_PERSONALES` ni excluido (`#excluidos` en el grupo).

`ANTHROPIC_API_KEY`, `EVOLUTION_*` y `WEBHOOK_SECRETO` ya tienen que estar (no cambian).

## 3. Reiniciar a Erasmo

Cerrá la ventana del bot de Piedra y volvé a abrirlo (`ARRANCAR-PIEDRA.cmd`, o `npm start` en `E:\bot-piedra`).

Tiene que pasar:
- La consola dice `CEREBRO: reglas xxxxxxxx (… líneas)` y arranca en el puerto 3002.
- `http://localhost:3002/salud` muestra `"modo":"tester"`.
- Si los precios no cargan, la consola dice `[precios-panel] <código>` (por ejemplo `HTTP_400`, `NEGOCIO_INVALIDO`, `SIN_PRECIOS`) sin mostrar claves. En ese caso Erasmo cotiza solo la granza (sale de su tabla) y escala lo demás. Para que cargue: la migración `0073_rol_bot.sql` aplicada en Supabase y el usuario `erasmo@bot.com` dado de alta como miembro `bot` (sesión `panel-rol-bot`).

## 4. Probar

Desde el celular del tester (299 429-5806), escribile al WhatsApp de Somos Piedra como si fueras un cliente (tiene que ser **otro** celular que el del negocio). Cosas para probar:

- "Hola, qué piedras tienen?" → te contesta y manda el catálogo en PDF después de los mensajes.
- "Cuánto sale la granza roja para 12 m2?" → los dos totales, sin factura.
- "Y con factura?" → los totales con el 21 % (también en tarjeta).
- "Adoquines ojito 10 m2, pago en efectivo" → un solo total.
- "Hacen envíos a Plottier?" → al cliente le llega solo "Enseguida te respondemos." (una vez, a cualquier hora; lo que escriba después ya no se contesta); al grupo llega el aviso (de 9 a 20; afuera de ese horario se junta y sale a las 9).
- "Lo pienso, en 15 días arranco la obra" → "Dale, no hay problema"; el equipo recibe el aviso ese día a las 9.
- `#reset` (desde el celular del tester) → arranca el chat de cero.

Los demás números no reciben nada y no gastan API.

Dos cosas que **nunca se probaron contra los servicios reales** (solo con pruebas de mentira): el envío del PDF del catálogo (unos 4 MB) por Evolution y el primer login a Supabase. Si el PDF no llega, la consola dice `[catalogo] <chat>: el catálogo no salió (motivo)`; si los precios no cargan, `[precios-panel] <código>`. Avisame con esa línea y lo arreglamos. Tampoco se probó `npm run grupos` contra la Evolution real (la ruta `/group/fetchAllGroups/<instancia>?getParticipants=false` se confirmó en un espejo del código, no en la documentación oficial).

## 5. Mejorar

Después de probar:

```
npm run pruebas -- 5492994295806
```

Arma `data\pruebas\AAAA-MM-DD.md` con la charla: cada tanda, lo que dijiste, lo que contestó Erasmo, las herramientas con sus montos, las escaladas y los frenos de la guardia. Pegale ese archivo a Claude para mejorar las reglas y los ejemplos.

## Volver atrás

`CEREBRO_MODO=apagado` en el `.env` y reiniciar: nadie contesta y no se llama a la API. Para salir a clientes reales hace falta tu frase explícita ("prendé pilotos" / "prendé para todos"): este modo no la reemplaza.
