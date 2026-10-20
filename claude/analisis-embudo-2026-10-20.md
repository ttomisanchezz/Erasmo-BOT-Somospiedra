# Somos Piedra: análisis de anuncios por embudo (20/10/2026)

Cuenta de Meta 1945796639629607 (solo lectura: no se tocó nada). El período va del 12/10 al 20/10 a las 15:40 (son todas las campañas con gasto en los últimos 30 días). Los números salen de la API de Meta y el resultado medido es "conversaciones de WhatsApp iniciadas". Ventas: FALTA DATO.

## Choques con los archivos (mandan los archivos)
- `piedra/conocimiento.md` está en `C:\Users\PC\Documents\cortex-somosiphone\piedra\`, no en `E:\bot-piedra`. Solo se leyó.
- El traspaso de pauta más nuevo es `claude/traspaso-2026-10-19.md`, del proyecto de Claude. En `E:\bot-piedra\claude\` el más nuevo es el del 16/10, y es del bot.
- Hay decisiones cerradas el 19/10: $20.000/día (MADRE $7.000 + TEST v2 $13.000) y revisión el 26/10. Lo que se propone acá va **después** del 26/10, o antes solo si Tomás da el OK.

## 1. Números
### Campañas
| Campaña | Estado | Gasto | Chats | $/chat | Frec. | CTR | CPM |
|---|---|---|---|---|---|---|---|
| MADRE C5 Granza + C1 Frente (desde 12/10, $7.000/día) | Activa | $56.484 | 100 | $565 | 1,90 | 2,53% | $3.054 |
| TEST v2, 5 carruseles (desde 19/10 a las 17:32, $13.000/día) | Activa | $14.590 | 6 | $2.432 | 1,52 | 1,58% | $4.919 |
| Conjunta con el vivero, Día de la Madre (15/10 al 18/10) | Pausada (terminó) | $59.979 | 47 | $1.276 | 1,46 | 1,50% | $1.791 |
| "Pedí tu presupuesto" (formulario, mayo 2026) | Pausada | $0 | — | — | — | — | — |
| **Total** | | **$131.053** | **153** | **$857** | | | |

- Cada campaña tiene un solo conjunto ("Toda la zona - abierto", Advantage+, de 18 a 65 años, WhatsApp). Ningún conjunto activo tiene fecha de fin; la conjunta terminó el 18/10 a las 13:00.
- La conjunta tiene $3.815 de gasto que no aparece en sus 4 anuncios actuales (seguramente versiones anteriores que se reemplazaron).
- El TEST v2 incluye "estuvo hace poco en la zona" en el público (como la conjunta) y la MADRE no: hay una diferencia de público, además de la de creatividades.

### Anuncios (todos son carruseles)
| Pieza | Etapa | Gasto | Chats | $/chat | CTR | Frec. | Estado |
|---|---|---|---|---|---|---|---|
| C5 Granza "Tu jardín listo en un finde" (MADRE) | MOFU | $45.598 | 83 | **$549** | 2,39% | 1,74 | Activo |
| C1 Frente "¿Cuánto sale revestir tu frente?" (MADRE) | BOFU | $9.249 | 14 | $661 | **3,06%** | 1,70 | Activo |
| C3 Estilo "¿Qué piedra va con tu casa?" (MADRE) | MOFU | $457 | 2 | $228 | 4,65% | 1,39 | Pausado |
| C2 "¿Piedra o símil?" (MADRE) | MOFU | $1.180 | 1 | $1.180 | 3,69% | 1,62 | Pausado |
| v2 Granza | MOFU | $8.387 | 4 | $2.097 | 1,57% | 1,34 | Activo |
| v2 Cuánta piedra necesito | MOFU | $2.684 | 1 | $2.684 | 1,36% | 1,24 | Activo |
| v2 Frente | BOFU | $1.729 | 1 | $1.729 | 2,33% | 1,29 | Activo |
| v2 Patio y pileta | TOFU | $1.099 | 0 | — | 1,80% | 1,34 | Activo |
| v2 5 errores al revestir | MOFU | $690 | 0 | — | 1,09% | 1,16 | Activo |
| Madre C3 "Vení a elegirlo" | BOFU fecha | $22.969 | 29 | $792 | 1,65% | 2,43 | Terminó |
| Madre C4 "Regalale un jardín" | BOFU fecha | $27.977 | 15 | $1.865 | 1,52% | 1,99 | Terminó |
| Madre C2 "Cada mamá" | BOFU fecha | $2.495 | 1 | $2.495 | 0,66% | 4,50 | Terminó |
| Madre C1 "Rincón verde" | BOFU fecha | $2.722 | 1 | $2.722 | 0,93% | 1,25 | Terminó |

Criterio de las etapas:
- TOFU es inspiración ("tu patio con pileta, 3 zonas").
- MOFU es cómo se hace, cuánto hace falta y qué piedra elegir.
- BOFU es "pedí tu precio" o un regalo con fecha.
- La granza es "cómo hacerlo + cuánto comprar + pedila": está entre MOFU y BOFU, y se dejó en MOFU por el contenido.

## 2. Cómo se reparte el gasto
Solo Piedra (sin la conjunta), $71.074:

| Etapa | Gasto | % | Chats | $/chat |
|---|---|---|---|---|
| TOFU | $1.099 | 2% | 0 | — |
| MOFU | $58.996 | 83% | 91 | $648 |
| BOFU | $10.978 | 15% | 15 | $732 |
| Autoridad | $0 | 0% | — | **sin probar** |
| Remarketing | $0 | 0% | — | **no existe** |

- **Formato:** carrusel, 100%. No hay ni un reel, video o imagen sola.
- **Producto:** granza, 87 de los 106 chats de Piedra (82%). Revestimiento (frente, cuánta piedra, estilo, símil, errores, patio): 19 chats.
- **Lo que está vacío:**
  - autoridad: obras terminadas, antes y después, reseñas, el local, la camioneta;
  - TOFU con gasto real;
  - BOFU con precio ("desde $__ el m²");
  - remarketing;
  - video.

## 3. Leads y ventas
- **De dónde salen:** todos los anuncios mandan a WhatsApp (299 459-0936). Nada a Instagram Direct, a llamadas ni a formulario (el de mayo gastó $0).
- **Qué anuncio terminó en venta:** hoy no hay forma de saberlo. **FALTA DATO** de ventas.
  - Los v2 no tienen mensaje armado (por API no se pudo, traspaso del 19/10). Si los de la MADRE lo tienen, no se ve por API: hay que mirarlo en el Administrador.
  - La etiqueta "anuncio" de Fran (pendiente del 19/10) dice que vino de un anuncio, pero no de cuál.
  - El bot de Piedra (en escucha) guarda los chats, pero el export no trae los datos del anuncio. Los mensajes que llegan desde un anuncio de WhatsApp traen `externalAdReply` con el id del anuncio: hay que verificarlo con un chat real.
- **Qué falta para medirlo (de más barato a más caro):**
  1. Un mensaje armado con código en cada anuncio: "Hola! Vi el anuncio G1 (granza)…", F1 (frente), P1 (pileta)… Se carga a mano en el Administrador. Fran anota en la etiqueta el código y si compró.
  2. Que el bot guarde el id del anuncio de cada chat nuevo y `#vendido`/`#perdido` (los comandos ya existen) → ventas por anuncio sin depender de que alguien anote.
- **Dato de referencia (no son anuncios, no usar como tasa):** en el historial exportado, 129 de 938 conversaciones de clientes terminaron en "compró o pagó" (14%), clasificadas por Sonnet y sin confirmar por Fran.

## 4. Costo máximo por venta
- Revestimiento (datos de Tomás del 08/10, estimados): ticket $600.000 × 30% = ganancia $180.000 → **costo máximo por venta $60.000**.
  - MADRE a $565 por chat: aguanta hasta 106 chats por venta (alcanza con que compre 1 de cada 106).
  - TEST v2 a $2.432 por chat: necesita 1 venta cada 24 chats.
- **Granza: FALTA DATO.** El 82% de los chats son de granza, y la granza es un ticket chico (se vende por m² y por tramos de 1, 10 y 20 m²). Si una venta de granza deja, por ejemplo, $20.000 de ganancia, el máximo es $6.667 por venta: con $549 por chat hace falta 1 venta cada 12 chats. **Sin el precio y el margen de la granza no se puede decir si la MADRE gana plata.**

## 5. Plan
**Qué replicar (lo que tiene el ganador, C5 Granza):**
- promesa concreta con plazo ("listo en un finde");
- producto de temporada (primavera);
- paso a paso;
- un número que resuelve la duda de cuánto comprar ("1 bolsa = 1 m² a 3 cm");
- compra fácil (bolsas, camioneta).

C1 Frente tiene el mejor CTR (3,06%), pero la CBO lo deja con poco gasto: necesita su propio presupuesto para saber si funciona.

**Qué apagar:** nada antes del 26/10 (decisión cerrada). El 26/10, por costo por chat, los candidatos son 5 errores y Patio y pileta (0 chats). Con menos de $3.000 cada uno todavía es poco gasto para juzgarlos: se decide con lo que haya ese día.

**Qué falta probar (en orden):**
1. Autoridad: obra real, antes y después, la camioneta descargando, la reseña "En 24 horas ya tenía los materiales en Centenario".
2. Reel: una persona a cámara en el acopio (ya está en la cola).
3. BOFU con precio "desde $__ el m²" (de la planilla, con el OK de Tomás y Fran).
4. Remarketing.

**Estructura para $20.000/día, desde el 26/10:**

| Pieza | Presupuesto/día | Qué lleva |
|---|---|---|
| MADRE (CBO) | $9.000 | C5 Granza + el mejor v2 o revestimiento |
| Laboratorio (ABO, un conjunto por etapa) | $8.000 | TOFU $2.000 · MOFU/BOFU revestimiento con C1 Frente $2.000 · BOFU con precio $2.000 · Autoridad $2.000 |
| Remarketing | $3.000 | Interactuaron con la página o el IG, o escribieron por WhatsApp en los últimos 30 días |

- El mínimo de la cuenta es $1.521 por día por conjunto.
- El remarketing puede no salir si el público es chico (la MADRE alcanzó a 8.916 personas): se prueba y se ve.

## 6. Textos a revisar
| Anuncio | Qué dice | Problema |
|---|---|---|
| C5 Granza (MADRE) | "en bolsas o a granel con la camioneta" | Fran (09/10): la granza va en bolsas, y en bolsón si es mucho. "A granel" está confirmado para la piedra, no para la granza: confirmar antes de que alguien lo pida así. |
| v2 Frente, C1 Frente, C3 Estilo | "te pasamos el precio en el día" | Es una promesa. En el historial, el 10% de los chats tardó más de 4,5 h en recibir respuesta y 39 nunca se contestaron. Fran tiene que poder cumplirla. |
| v2 Patio y pileta | "Riojana, pórfido y adoquín 10×10 en stock" | Confirmar stock con Fran. |
| Conjunta (4 anuncios, pausados) | "hasta el sábado 17/10" | Vencidos: no reactivar ni duplicar. Hay creatividades con "desde $30.000", un dato que se había sacado por no estar confirmado. |

Ningún anuncio menciona envío gratis, cuotas, formas de pago ni precios. Bien.

## Para decidir (Tomás)
1. Precio y ganancia de una venta típica de granza (por ejemplo, el tramo de 10 m²).
2. Medición: mensaje armado con código por anuncio y/o el bot guardando el id del anuncio.
3. Si se adelanta el corte del v2 al 22/10.
4. Fotos o videos de obras propias para autoridad.
