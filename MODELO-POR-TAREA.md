# Qué modelo usar en cada prompt

Regla corta:

**Si el prompt dice "decidí vos", "confirmá antes de implementar" o "pará y
avisame" en algún lado, va el modelo más fuerte. Si es una instrucción cerrada
con tests que la verifican, alcanza uno más rápido.**

Todo prompt que venga del chat trae arriba de todo una línea que dice cuál usar.
Si falta, aplicá la regla de arriba.

---

## Modelo fuerte (Fable 5)

Cuando el agente tiene que pensar, no solo ejecutar:

- Diagnóstico: "medí esto y decime qué significa", "por qué pasa esto".
- Diseño: cuando todavía no está decidido cómo se hace.
- Cualquier prompt con una decisión adentro, o que le pide al agente que
  discuta el pedido si está mal planteado.
- Código que se toca por primera vez, sin tests que lo cubran.
- Cualquier cosa que toque plata: cotizador, entrega, precios.

## Modelo rápido (Opus 5)

Cuando el qué y el cómo ya están decididos:

- Implementaciones bien especificadas, con los casos de prueba escritos en el
  propio prompt.
- Cambios mecánicos: renombrar, mover, cablear una constante que ya existe,
  sumar un archivo a una lista.
- Migraciones con verificación automática.
- Cualquier cosa donde la suite de 184 casos atajaría el error.

---

## Por qué importa acá

En un solo día, el agente encontró tres cosas que nadie le pidió:

- `test/chatear.js` borraba `data/estado.json` entero con `/salir`.
- La objeción de precio ofrecía el equipo más caro de la planilla, por un techo
  en `Infinity`.
- El gate de `consulta_general` en `responder.js` tiraba abajo el diseño de la
  memoria por tema, que estaba mal pensado desde el chat.

Las tres salieron de que el agente miró alrededor del pedido en vez de
ejecutarlo de taquito. Eso es lo que se paga con el modelo fuerte, y es lo que
se pierde cuando se ahorra en el lugar equivocado.

## Corrección del 16/09/2026

Antes este archivo decía que Opus era el fuerte y Fable el rápido. Estaba al revés:
Tomás usa **Fable 5** para lo difícil, por razonamiento. Queda igual que en
`Desktop\app ventas\CONTEXTO.md` y en el Cortex (`Documents\cortex-somosiphone\CLAUDE.md`).
